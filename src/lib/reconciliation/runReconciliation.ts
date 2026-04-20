import { supabase } from "@/integrations/supabase/client";
import type { ParsedWorkbook } from "./parseXlsx";
import { buildSectionResult, norm } from "./compare";
import type { ReconciliationResult, SectionResult } from "./types";

export async function runReconciliation(
  parsed: ParsedWorkbook,
  quarterId: string,
  quarterLabel: string,
): Promise<ReconciliationResult> {
  const sections: SectionResult[] = [];

  // ===== FUNDS =====
  const [fundsRes, commitRes, fqsRes] = await Promise.all([
    supabase.from("funds").select("id, name"),
    supabase.from("fund_commitments").select("fund_id, twh_commitment_usd, total_fund_commitment_usd, twh_ownership_pct"),
    supabase
      .from("fund_quarter_snapshots")
      .select("fund_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_nav_usd")
      .eq("quarter_id", quarterId),
  ]);
  const funds = fundsRes.data ?? [];
  const commits = new Map((commitRes.data ?? []).map((c) => [c.fund_id, c]));
  const fqs = new Map((fqsRes.data ?? []).map((s) => [s.fund_id, s]));

  // Build map by normalized fund name
  const fundsByName = new Map(funds.map((f) => [norm(f.name), f]));
  const seenFundIds = new Set<string>();
  const fundIdentityRows: Parameters<typeof buildSectionResult>[2] = [];

  for (const srcFund of parsed.funds) {
    const sysFund = fundsByName.get(norm(srcFund.fundName));
    const c = sysFund ? commits.get(sysFund.id) : null;
    const s = sysFund ? fqs.get(sysFund.id) : null;
    if (sysFund) seenFundIds.add(sysFund.id);
    fundIdentityRows.push({
      identity: srcFund.fundName,
      fields: [
        { field: "Total Commitments", src: srcFund.totalCommitments, sys: c?.total_fund_commitment_usd ?? null, kind: "currency" },
        { field: "TWH Commitment", src: srcFund.twhCommitment, sys: c?.twh_commitment_usd ?? null, kind: "currency" },
        { field: "TWH Ownership %", src: srcFund.twhPct, sys: c?.twh_ownership_pct ?? null, kind: "percent" },
        { field: "Total Contributions", src: srcFund.totalContributions, sys: s?.fund_total_contributions_usd ?? null, kind: "currency" },
        { field: "TWH Contributions", src: srcFund.twhContributions, sys: s?.twh_contributions_usd ?? null, kind: "currency" },
        { field: "TWH Distributions", src: srcFund.twhDistributions, sys: s?.twh_distributions_usd ?? null, kind: "currency" },
        { field: "TWH NAV", src: srcFund.twhNav, sys: s?.twh_nav_usd ?? null, kind: "currency" },
        { field: "Fund Total NAV", src: srcFund.fundTotalNav, sys: s?.fund_total_nav_usd ?? null, kind: "currency" },
      ],
    });
  }
  // funds in DB missing from source
  for (const f of funds) {
    if (seenFundIds.has(f.id)) continue;
    const c = commits.get(f.id);
    const s = fqs.get(f.id);
    if (!c && !s) continue; // truly empty, skip
    fundIdentityRows.push({
      identity: f.name,
      fields: [
        { field: "TWH Commitment", src: null, sys: c?.twh_commitment_usd ?? null, kind: "currency" },
        { field: "TWH NAV", src: null, sys: s?.twh_nav_usd ?? null, kind: "currency" },
      ],
    });
  }
  sections.push(buildSectionResult("funds", "Funds", fundIdentityRows));

  // ===== DIRECTS =====
  const [directsRes, dqsRes, companiesRes] = await Promise.all([
    supabase.from("directs").select("id, company_id, investment_date, instrument, round, twh_cost_usd"),
    supabase.from("direct_quarter_snapshots").select("direct_id, twh_fmv_usd, twh_proceeds_usd").eq("quarter_id", quarterId),
    supabase.from("companies").select("id, legal_name"),
  ]);
  const directs = directsRes.data ?? [];
  const dqs = new Map((dqsRes.data ?? []).map((d) => [d.direct_id, d]));
  const companies = companiesRes.data ?? [];
  const companiesById = new Map(companies.map((c) => [c.id, c]));

  // Index directs by normalized company name. If multiple directs for same company, prefer match by date+round+instrument.
  const directsByName = new Map<string, typeof directs>();
  for (const d of directs) {
    const co = companiesById.get(d.company_id);
    if (!co) continue;
    const key = norm(co.legal_name);
    const arr = directsByName.get(key) ?? [];
    arr.push(d);
    directsByName.set(key, arr);
  }
  const seenDirectIds = new Set<string>();
  const directIdentityRows: Parameters<typeof buildSectionResult>[2] = [];

  for (const srcD of parsed.directs) {
    const candidates = directsByName.get(norm(srcD.companyName)) ?? [];
    let matched = candidates.find(
      (c) =>
        (c.investment_date ?? "").slice(0, 10) === (srcD.date ?? "") &&
        norm(c.round ?? "") === norm(srcD.round ?? "") &&
        norm(c.instrument ?? "") === norm(srcD.instrument ?? ""),
    );
    if (!matched && candidates.length === 1) matched = candidates[0];
    if (matched) seenDirectIds.add(matched.id);
    const snap = matched ? dqs.get(matched.id) : null;
    directIdentityRows.push({
      identity: srcD.companyName,
      fields: [
        { field: "Investment Date", src: srcD.date, sys: matched?.investment_date ?? null, kind: "date" },
        { field: "Round", src: srcD.round, sys: matched?.round ?? null, kind: "text" },
        { field: "Instrument", src: srcD.instrument, sys: matched?.instrument ?? null, kind: "text" },
        { field: "TWH Cost", src: srcD.twhCost, sys: matched?.twh_cost_usd ?? null, kind: "currency" },
        { field: "TWH FMV", src: srcD.twhFmv, sys: snap?.twh_fmv_usd ?? null, kind: "currency" },
        { field: "TWH Proceeds", src: srcD.twhProceeds, sys: snap?.twh_proceeds_usd ?? null, kind: "currency" },
      ],
    });
  }
  // missing in source
  for (const d of directs) {
    if (seenDirectIds.has(d.id)) continue;
    const co = companiesById.get(d.company_id);
    const snap = dqs.get(d.id);
    if (!snap && !d.twh_cost_usd) continue;
    directIdentityRows.push({
      identity: co?.legal_name ?? "(unknown)",
      fields: [
        { field: "TWH Cost", src: null, sys: d.twh_cost_usd ?? null, kind: "currency" },
        { field: "TWH FMV", src: null, sys: snap?.twh_fmv_usd ?? null, kind: "currency" },
      ],
    });
  }
  sections.push(buildSectionResult("directs", "Directs", directIdentityRows));

  // ===== UNDERLYING =====
  const uhRes = await supabase
    .from("underlying_holdings")
    .select("id, company_id, fund_id, investment_date, instrument, round, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd")
    .eq("quarter_id", quarterId);
  const uh = uhRes.data ?? [];
  const fundsById = new Map(funds.map((f) => [f.id, f]));
  // Index by composite key (company|fund|date|round|instrument)
  const uhByKey = new Map<string, typeof uh[number]>();
  for (const h of uh) {
    const co = companiesById.get(h.company_id);
    const fd = fundsById.get(h.fund_id);
    if (!co || !fd) continue;
    const key = [
      norm(co.legal_name),
      norm(fd.name),
      (h.investment_date ?? "").slice(0, 10),
      norm(h.round ?? ""),
      norm(h.instrument ?? ""),
    ].join("||");
    uhByKey.set(key, h);
  }
  const seenUhIds = new Set<string>();
  const uhIdentityRows: Parameters<typeof buildSectionResult>[2] = [];

  for (const u of parsed.underlying) {
    const key = [
      norm(u.companyName),
      norm(u.fundName),
      u.date ?? "",
      norm(u.round ?? ""),
      norm(u.instrument ?? ""),
    ].join("||");
    const matched = uhByKey.get(key);
    if (matched) seenUhIds.add(matched.id);
    const ident = `${u.companyName} · ${u.fundName} · ${u.date ?? ""} · ${u.round ?? ""}`;
    // TWH FMV in DB is derived (fund_fmv * twh_pct from commitments). We compare fund-level fields directly.
    uhIdentityRows.push({
      identity: ident,
      fields: [
        { field: "Investment Cost", src: u.investmentCost, sys: matched?.fund_cost_usd ?? null, kind: "currency" },
        { field: "FMV", src: u.fmv, sys: matched?.fund_fmv_usd ?? null, kind: "currency" },
        { field: "Proceeds", src: u.proceeds, sys: matched?.fund_proceeds_usd ?? null, kind: "currency" },
      ],
    });
  }
  for (const h of uh) {
    if (seenUhIds.has(h.id)) continue;
    const co = companiesById.get(h.company_id);
    const fd = fundsById.get(h.fund_id);
    uhIdentityRows.push({
      identity: `${co?.legal_name ?? "?"} · ${fd?.name ?? "?"} · ${(h.investment_date ?? "").slice(0, 10)} · ${h.round ?? ""}`,
      fields: [
        { field: "FMV", src: null, sys: h.fund_fmv_usd ?? null, kind: "currency" },
        { field: "Investment Cost", src: null, sys: h.fund_cost_usd ?? null, kind: "currency" },
      ],
    });
  }
  sections.push(buildSectionResult("underlying", "Underlying Holdings", uhIdentityRows));

  // ===== COMPUTED METRICS =====
  const cmRes = await supabase
    .from("computed_metrics")
    .select("scope, fund_id, gross_irr, gross_moic, net_irr, net_tvpi, dpi")
    .eq("quarter_id", quarterId)
    .eq("scope", "consolidated");
  const cm = (cmRes.data ?? [])[0];
  const metricsRows = [
    {
      identity: "Portfolio Consolidated",
      fields: [
        { field: "Net TVPI", src: parsed.metrics.netTvpi, sys: cm?.net_tvpi ?? null, kind: "ratio" as const },
        { field: "Net IRR", src: parsed.metrics.netIrr, sys: cm?.net_irr ?? null, kind: "irr" as const },
        { field: "Gross TVPI/MOIC", src: parsed.metrics.grossTvpi, sys: cm?.gross_moic ?? null, kind: "ratio" as const },
        { field: "Gross IRR", src: parsed.metrics.grossIrr, sys: cm?.gross_irr ?? null, kind: "irr" as const },
      ],
    },
  ];
  sections.push(buildSectionResult("metrics", "Computed Metrics", metricsRows));

  const totals = sections.reduce(
    (acc, s) => ({
      totalFields: acc.totalFields + s.total,
      matchedFields: acc.matchedFields + s.matched,
      overTolerance: acc.overTolerance + s.overTolerance,
      missing: acc.missing + s.missingInSystem + s.missingInSource,
    }),
    { totalFields: 0, matchedFields: 0, overTolerance: 0, missing: 0 },
  );

  return { quarterId, quarterLabel, sections, ...totals };
}
