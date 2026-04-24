import { supabase } from "@/integrations/supabase/client";
import type { ParsedWorkbook } from "./parseXlsx";
import { buildSectionResult, norm } from "./compare";
import { resolveFundName } from "./fundAliases";
import type { ReconciliationResult, SectionResult } from "./types";

/**
 * Field whitelists per section. Exported so tests can assert their length to
 * prevent silent truncation during refactors.
 */
export const FUNDS_FIELDS = [
  "Commitment",
  "Contributions",
  "Distributions",
  "NAV",
  "Total Value",
  "TVPI",
  "DPI",
  "IRR",
  "MOIC",
  "Investment Date",
  "TWH Ownership %",
  "TWH Commitment",
  "TWH Contributions",
  "TWH Distributions",
  "TWH NAV",
  "TWH Value",
] as const;

export const DIRECTS_FIELDS = [
  "Investment Date",
  "Investment Cost",
  "FMV",
  "Proceeds",
  "MOIC",
  "TWH Ownership %",
  "TWH Cost",
  "TWH FMV",
  "TWH Proceeds",
] as const;

export const UNDERLYING_FIELDS = [
  "Investment Date",
  "Investment Cost",
  "FMV",
  "Proceeds",
  "MOIC",
  "TWH Ownership %",
  "TWH Cost",
  "TWH FMV",
  "TWH Proceeds",
] as const;

const fmtDate = (d: string | null | undefined): string => (d ? d.slice(0, 10) : "");
const compositeDirectKey = (name: string, date: string | null) =>
  `${norm(name)}||${fmtDate(date)}`;
const compositeUnderlyingKey = (name: string, fund: string, date: string | null, trancheSeq: number | null | undefined) =>
  `${norm(name)}||${norm(fund)}||${fmtDate(date)}||${trancheSeq ?? 1}`;
const underlyingIdentity = (company: string, fund: string, date: string | null, trancheSeq: number | null | undefined) =>
  `${company} · ${fund} · ${fmtDate(date)}${(trancheSeq ?? 1) > 1 ? ` · #${trancheSeq}` : ""}`;

const ratio = (num: number | null | undefined, den: number | null | undefined): number | null => {
  if (num == null || den == null) return null;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
};

const sumOrNull = (...vals: Array<number | null | undefined>): number | null => {
  let total = 0;
  let any = false;
  for (const v of vals) {
    if (v == null) continue;
    if (!Number.isFinite(v)) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
};

export async function runReconciliation(
  parsed: ParsedWorkbook,
  quarterId: string,
  quarterLabel: string,
): Promise<ReconciliationResult> {
  console.log("[recon] quarterId param:", quarterId);
  console.log("[recon] quarterId type:", typeof quarterId);
  const quarterLookupRes = await supabase
    .from("quarters")
    .select("label")
    .eq("id", quarterId)
    .maybeSingle();
  console.log("[recon] resolved quarter label for this id:", quarterLookupRes.data?.label ?? null);

  const sections: SectionResult[] = [];

  // ===== FUNDS =====
  const [fundsRes, commitRes, fqsRes] = await Promise.all([
    supabase.from("funds").select("id, name, start_date"),
    supabase
      .from("fund_commitments")
      .select("fund_id, twh_commitment_usd, total_fund_commitment_usd, twh_ownership_pct"),
    supabase
      .from("fund_quarter_snapshots")
      .select(
        "fund_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_distributions_usd, fund_total_nav_usd, tvpi, dpi, moic, irr",
      )
      .eq("quarter_id", quarterId),
  ]);
  console.log("[recon] fundQuarterSnapshotsRes rows:", fqsRes.data?.length, "error:", fqsRes.error);
  const funds = fundsRes.data ?? [];
  const commits = new Map((commitRes.data ?? []).map((c) => [c.fund_id, c]));
  const fqs = new Map((fqsRes.data ?? []).map((s) => [s.fund_id, s]));

  const fundsByName = new Map(funds.map((f) => [norm(f.name), f]));
  const seenFundIds = new Set<string>();
  const fundIdentityRows: Parameters<typeof buildSectionResult>[2] = [];

  const buildFundFields = (
    src: ReturnType<typeof buildSrcFund>,
    sys: ReturnType<typeof buildSysFund>,
  ) => [
    { field: "Commitment", src: src.totalCommitment, sys: sys.totalCommitment, kind: "currency" as const },
    { field: "Contributions", src: src.totalContributions, sys: sys.totalContributions, kind: "currency" as const },
    { field: "Distributions", src: src.totalDistributions, sys: sys.totalDistributions, kind: "currency" as const },
    { field: "NAV", src: src.fundTotalNav, sys: sys.fundTotalNav, kind: "currency" as const },
    { field: "Total Value", src: src.totalValue, sys: sys.totalValue, kind: "currency" as const },
    { field: "TVPI", src: src.tvpi, sys: sys.tvpi, kind: "ratio" as const },
    { field: "DPI", src: src.dpi, sys: sys.dpi, kind: "ratio" as const },
    { field: "IRR", src: src.irr, sys: sys.irr, kind: "irr" as const },
    { field: "MOIC", src: src.moic, sys: sys.moic, kind: "ratio" as const },
    { field: "Investment Date", src: src.startDate, sys: sys.startDate, kind: "date" as const },
    { field: "TWH Ownership %", src: src.twhPct, sys: sys.twhPct, kind: "percent" as const },
    { field: "TWH Commitment", src: src.twhCommitment, sys: sys.twhCommitment, kind: "currency" as const },
    { field: "TWH Contributions", src: src.twhContributions, sys: sys.twhContributions, kind: "currency" as const },
    { field: "TWH Distributions", src: src.twhDistributions, sys: sys.twhDistributions, kind: "currency" as const },
    { field: "TWH NAV", src: src.twhNav, sys: sys.twhNav, kind: "currency" as const },
    { field: "TWH Value", src: src.twhValue, sys: sys.twhValue, kind: "currency" as const },
  ];

  function buildSrcFund(srcFund: ParsedWorkbook["funds"][number]) {
    const totalValue = sumOrNull(srcFund.fundTotalNav, srcFund.totalDistributions);
    const twhValueComputed = sumOrNull(srcFund.twhNav, srcFund.twhDistributions);
    return {
      startDate: srcFund.startDate,
      totalCommitment: srcFund.totalCommitments,
      twhCommitment: srcFund.twhCommitment,
      twhPct: srcFund.twhPct,
      totalContributions: srcFund.totalContributions,
      twhContributions: srcFund.twhContributions,
      totalDistributions: srcFund.totalDistributions,
      twhDistributions: srcFund.twhDistributions,
      fundTotalNav: srcFund.fundTotalNav,
      twhNav: srcFund.twhNav,
      twhValue: srcFund.twhValue ?? twhValueComputed,
      totalValue,
      tvpi: srcFund.tvpi ?? ratio(totalValue, srcFund.totalContributions),
      dpi: srcFund.dpi ?? ratio(srcFund.totalDistributions, srcFund.totalContributions),
      moic: srcFund.moic ?? ratio(totalValue, srcFund.totalContributions),
      irr: srcFund.irr,
    };
  }

  function buildSysFund(
    f: { start_date: string | null } | null,
    c: { total_fund_commitment_usd: number | null; twh_commitment_usd: number | null; twh_ownership_pct: number | null } | null | undefined,
    s: {
      fund_total_contributions_usd: number | null;
      fund_total_nav_usd: number | null;
      twh_contributions_usd: number | null;
      twh_distributions_usd: number | null;
      twh_nav_usd: number | null;
      fund_total_distributions_usd: number | null;
      tvpi: number | null;
      dpi: number | null;
      moic: number | null;
      irr: number | null;
    } | null | undefined,
  ) {
    const totalDistributions = s?.fund_total_distributions_usd ?? null;
    const totalValue = sumOrNull(s?.fund_total_nav_usd ?? null, totalDistributions);
    const twhValueComputed = sumOrNull(s?.twh_nav_usd ?? null, s?.twh_distributions_usd ?? null);
    return {
      startDate: f?.start_date ?? null,
      totalCommitment: c?.total_fund_commitment_usd ?? null,
      twhCommitment: c?.twh_commitment_usd ?? null,
      twhPct: c?.twh_ownership_pct ?? null,
      totalContributions: s?.fund_total_contributions_usd ?? null,
      twhContributions: s?.twh_contributions_usd ?? null,
      totalDistributions,
      twhDistributions: s?.twh_distributions_usd ?? null,
      fundTotalNav: s?.fund_total_nav_usd ?? null,
      twhNav: s?.twh_nav_usd ?? null,
      twhValue: twhValueComputed,
      totalValue,
      tvpi: s?.tvpi ?? ratio(totalValue, s?.fund_total_contributions_usd ?? null),
      dpi: s?.dpi ?? ratio(totalDistributions, s?.fund_total_contributions_usd ?? null),
      moic: s?.moic ?? ratio(totalValue, s?.fund_total_contributions_usd ?? null),
      irr: s?.irr ?? null,
    };
  }

  for (const srcFund of parsed.funds) {
    const canonical = resolveFundName(srcFund.fundName);
    const sysFund =
      fundsByName.get(norm(canonical)) ?? fundsByName.get(norm(srcFund.fundName));
    const c = sysFund ? commits.get(sysFund.id) : null;
    const s = sysFund ? fqs.get(sysFund.id) : null;
    if (sysFund) seenFundIds.add(sysFund.id);
    fundIdentityRows.push({
      identity: canonical,
      fields: buildFundFields(buildSrcFund(srcFund), buildSysFund(sysFund ?? null, c, s)),
    });
  }
  for (const f of funds) {
    if (seenFundIds.has(f.id)) continue;
    const c = commits.get(f.id);
    const s = fqs.get(f.id);
    if (!c && !s) continue;
    const sysSide = buildSysFund(f, c, s);
    const blank = {
      startDate: null,
      totalCommitment: null,
      twhCommitment: null,
      twhPct: null,
      totalContributions: null,
      twhContributions: null,
      totalDistributions: null,
      twhDistributions: null,
      fundTotalNav: null,
      twhNav: null,
      twhValue: null,
      totalValue: null,
      tvpi: null,
      dpi: null,
      moic: null,
      irr: null,
    };
    fundIdentityRows.push({
      identity: f.name,
      fields: buildFundFields(blank, sysSide),
    });
  }
  sections.push(buildSectionResult("funds", "Funds", fundIdentityRows));

  // ===== DIRECTS =====
  // Scope: ONLY directs with a direct_quarter_snapshots row for this quarter_id.
  const [dqsRes, companiesRes] = await Promise.all([
    supabase
      .from("direct_quarter_snapshots")
      .select("direct_id, twh_fmv_usd, twh_proceeds_usd, moic, twh_ownership_pct")
      .eq("quarter_id", quarterId),
    supabase.from("companies").select("id, legal_name"),
  ]);
  console.log("[recon] directQuarterSnapshotsRes rows:", dqsRes.data?.length, "error:", dqsRes.error);
  const dqs = new Map((dqsRes.data ?? []).map((d) => [d.direct_id, d]));
  const companies = companiesRes.data ?? [];
  const companiesById = new Map(companies.map((c) => [c.id, c]));
  console.log("[recon] companiesById size:", companiesById.size);

  const inScopeDirectIds = Array.from(dqs.keys());
  const directsRes = inScopeDirectIds.length
    ? await supabase
        .from("directs")
        .select("id, company_id, investment_date, instrument, round, twh_cost_usd")
        .in("id", inScopeDirectIds)
    : {
        data: [] as Array<{
          id: string;
          company_id: string;
          investment_date: string | null;
          instrument: string | null;
          round: string | null;
          twh_cost_usd: number;
        }>,
      };
  const directs = directsRes.data ?? [];

  const directsByKey = new Map<string, (typeof directs)[number]>();
  for (const d of directs) {
    const co = companiesById.get(d.company_id);
    if (!co) continue;
    const key = compositeDirectKey(co.legal_name, d.investment_date);
    directsByKey.set(key, d);
  }
  const seenDirectIds = new Set<string>();
  const directIdentityRows: Parameters<typeof buildSectionResult>[2] = [];

  const buildDirectFields = (
    src: {
      date: string | null;
      investmentCost: number | null;
      fmv: number | null;
      proceeds: number | null;
      moic: number | null;
      twhPct: number | null;
      twhCost: number | null;
      twhFmv: number | null;
      twhProceeds: number | null;
    },
    sys: typeof src,
  ) => [
    { field: "Investment Date", src: src.date, sys: sys.date, kind: "date" as const },
    { field: "Investment Cost", src: src.investmentCost, sys: sys.investmentCost, kind: "currency" as const },
    { field: "FMV", src: src.fmv, sys: sys.fmv, kind: "currency" as const },
    { field: "Proceeds", src: src.proceeds, sys: sys.proceeds, kind: "currency" as const },
    { field: "MOIC", src: src.moic, sys: sys.moic, kind: "ratio" as const },
    { field: "TWH Ownership %", src: src.twhPct, sys: sys.twhPct, kind: "percent" as const },
    { field: "TWH Cost", src: src.twhCost, sys: sys.twhCost, kind: "currency" as const },
    { field: "TWH FMV", src: src.twhFmv, sys: sys.twhFmv, kind: "currency" as const },
    { field: "TWH Proceeds", src: src.twhProceeds, sys: sys.twhProceeds, kind: "currency" as const },
  ];

  const directMoicSys = (cost: number | null, fmv: number | null, proc: number | null): number | null =>
    ratio(sumOrNull(fmv, proc), cost);

  for (const srcD of parsed.directs) {
    const key = compositeDirectKey(srcD.companyName, srcD.date);
    const matched = directsByKey.get(key);
    if (matched) seenDirectIds.add(matched.id);
    const snap = matched ? dqs.get(matched.id) : null;
    const sys = {
      date: matched?.investment_date ?? null,
      investmentCost: null as number | null, // not tracked separately in DB
      fmv: null as number | null,
      proceeds: null as number | null,
      moic: snap?.moic ?? directMoicSys(matched?.twh_cost_usd ?? null, snap?.twh_fmv_usd ?? null, snap?.twh_proceeds_usd ?? null),
      twhPct: snap?.twh_ownership_pct ?? null,
      twhCost: matched?.twh_cost_usd ?? null,
      twhFmv: snap?.twh_fmv_usd ?? null,
      twhProceeds: snap?.twh_proceeds_usd ?? null,
    };
    const ident = `${srcD.companyName} · ${fmtDate(srcD.date)}`;
    directIdentityRows.push({ identity: ident, fields: buildDirectFields(srcD, sys) });
  }
  for (const d of directs) {
    if (seenDirectIds.has(d.id)) continue;
    const co = companiesById.get(d.company_id);
    const snap = dqs.get(d.id);
    const ident = `${co?.legal_name ?? "(unknown)"} · ${fmtDate(d.investment_date)}`;
    const sys = {
      date: d.investment_date,
      investmentCost: null,
      fmv: null,
      proceeds: null,
      moic: snap?.moic ?? directMoicSys(d.twh_cost_usd ?? null, snap?.twh_fmv_usd ?? null, snap?.twh_proceeds_usd ?? null),
      twhPct: snap?.twh_ownership_pct ?? null,
      twhCost: d.twh_cost_usd ?? null,
      twhFmv: snap?.twh_fmv_usd ?? null,
      twhProceeds: snap?.twh_proceeds_usd ?? null,
    };
    const blank = {
      date: null,
      investmentCost: null,
      fmv: null,
      proceeds: null,
      moic: null,
      twhPct: null,
      twhCost: null,
      twhFmv: null,
      twhProceeds: null,
    };
    directIdentityRows.push({ identity: ident, fields: buildDirectFields(blank, sys) });
  }
  sections.push(buildSectionResult("directs", "Directs", directIdentityRows));

  // ===== UNDERLYING HOLDINGS =====
  const uhRes = await supabase
    .from("underlying_holdings")
    .select("*")
    .eq("quarter_id", quarterId);
  console.log("[recon] uhRes rows:", uhRes.data?.length, "error:", uhRes.error);
  const uh = (uhRes.data ?? []) as any[];
  const fundsById = new Map(funds.map((f) => [f.id, f]));
  const uhByKey = new Map<string, any>();
  for (const h of uh) {
    const co = companiesById.get(h.company_id);
    const fd = fundsById.get(h.fund_id);
    if (!co || !fd) continue;
    const key = compositeUnderlyingKey(co.legal_name, fd.name, h.investment_date, h.tranche_seq);
    uhByKey.set(key, h);
  }
  console.log("[recon] fundsById size:", fundsById.size);
  console.log("[recon] uhByKey size:", uhByKey.size);
  console.log(
    "[recon] Agrippa key lookup:",
    uhByKey.has(
      compositeUnderlyingKey(
        "Agrippa Industries Inc.",
        "Lowercarbon 421.0 Parallel Fund, LP",
        "2024-07-29",
        1,
      ),
    ),
  );
  console.log("[recon] First 3 keys in uhByKey:", [...uhByKey.keys()].slice(0, 3));
  const seenUhIds = new Set<string>();
  const uhIdentityRows: Parameters<typeof buildSectionResult>[2] = [];
  const xlsxKeysArray = parsed.underlying.map((u) =>
    compositeUnderlyingKey(u.companyName, u.fundName, u.date, u.trancheSeq),
  );

  const buildUhFields = (
    src: {
      date: string | null;
      investmentCost: number | null;
      fmv: number | null;
      proceeds: number | null;
      moic: number | null;
      twhPct: number | null;
      twhCost: number | null;
      twhFmv: number | null;
      twhProceeds: number | null;
    },
    sys: typeof src,
  ) => [
    { field: "Investment Date", src: src.date, sys: sys.date, kind: "date" as const },
    { field: "Investment Cost", src: src.investmentCost, sys: sys.investmentCost, kind: "currency" as const },
    { field: "FMV", src: src.fmv, sys: sys.fmv, kind: "currency" as const },
    { field: "Proceeds", src: src.proceeds, sys: sys.proceeds, kind: "currency" as const },
    { field: "MOIC", src: src.moic, sys: sys.moic, kind: "ratio" as const },
    { field: "TWH Ownership %", src: src.twhPct, sys: sys.twhPct, kind: "percent" as const },
    { field: "TWH Cost", src: src.twhCost, sys: sys.twhCost, kind: "currency" as const },
    { field: "TWH FMV", src: src.twhFmv, sys: sys.twhFmv, kind: "currency" as const },
    { field: "TWH Proceeds", src: src.twhProceeds, sys: sys.twhProceeds, kind: "currency" as const },
  ];

  const uhMoicSys = (cost: number | null, fmv: number | null, proc: number | null): number | null =>
    ratio(sumOrNull(fmv, proc), cost);

  console.log("[recon] BUILD-MARKER agrippa-diag-v2", { totalXlsxRows: parsed.underlying.length });
  for (const [index, u] of parsed.underlying.entries()) {
    // Parser already canonicalised u.fundName via resolveFundName.
    const xlsxKey = xlsxKeysArray[index];
    if (typeof u.companyName === "string" && u.companyName.toLowerCase().includes("agrippa")) {
      console.log("[recon] xlsx loop hit Agrippa at index", index, "companyName=", JSON.stringify(u.companyName));
    }
    if (index === 0) {
      const xlsxRow = u as typeof u & { investmentDate?: string | null };
      console.log(
        "[recon] xlsx first row raw:",
        JSON.stringify({
          companyName: xlsxRow.companyName,
          fund: xlsxRow.fundName,
          date: xlsxRow.investmentDate ?? xlsxRow.date,
          dateType: typeof (xlsxRow.investmentDate ?? xlsxRow.date),
          trancheSeq: xlsxRow.trancheSeq,
        }),
      );
      console.log("[recon] xlsx key:", xlsxKey);
      console.log("[recon] key found in uhByKey?", uhByKey.has(xlsxKey));
      console.log(
        "[recon] DB expected key:",
        "agrippa industries inc.||lowercarbon 421.0 parallel fund, lp||2024-07-29||1",
      );
      console.log("[recon] First 3 xlsx-side keys:", xlsxKeysArray.slice(0, 3));
    }
    const matched = uhByKey.get(xlsxKey);
    if (matched) seenUhIds.add(matched.id);
    const ident = underlyingIdentity(u.companyName, u.fundName, u.date, u.trancheSeq);
    const sys = {
      date: matched?.investment_date ?? null,
      investmentCost: matched?.fund_cost_usd ?? null,
      fmv: matched?.fund_fmv_usd ?? null,
      proceeds: matched?.fund_proceeds_usd ?? null,
      moic: matched?.moic ?? uhMoicSys(matched?.fund_cost_usd ?? null, matched?.fund_fmv_usd ?? null, matched?.fund_proceeds_usd ?? null),
      twhPct: matched?.twh_ownership_pct ?? null,
      twhCost: matched?.twh_cost_usd ?? null,
      twhFmv: matched?.twh_fmv_usd ?? null,
      twhProceeds: matched?.twh_proceeds_usd ?? null,
    };
    if (typeof u.companyName === "string" && u.companyName.toLowerCase().includes("agrippa")) {
      console.log("[recon] Agrippa matched DB row:", JSON.stringify(matched, null, 2));
      console.log("[recon] Agrippa xlsx row:", JSON.stringify(u, null, 2));
      console.log("[recon] Agrippa sys object passed to comparator:", JSON.stringify(sys, null, 2));
      console.log("[recon] Agrippa fields built:", JSON.stringify(buildUhFields(u, sys), null, 2));
    }
    uhIdentityRows.push({ identity: ident, fields: buildUhFields(u, sys) });
  }
  for (const h of uh) {
    if (seenUhIds.has(h.id)) continue;
    const co = companiesById.get(h.company_id);
    const fd = fundsById.get(h.fund_id);
    const ident = underlyingIdentity(co?.legal_name ?? "?", fd?.name ?? "?", h.investment_date, h.tranche_seq);
    const sys = {
      date: h.investment_date,
      investmentCost: h.fund_cost_usd ?? null,
      fmv: h.fund_fmv_usd ?? null,
      proceeds: h.fund_proceeds_usd ?? null,
      moic: h.moic ?? uhMoicSys(h.fund_cost_usd ?? null, h.fund_fmv_usd ?? null, h.fund_proceeds_usd ?? null),
      twhPct: h.twh_ownership_pct ?? null,
      twhCost: h.twh_cost_usd ?? null,
      twhFmv: h.twh_fmv_usd ?? null,
      twhProceeds: h.twh_proceeds_usd ?? null,
    };
    const blank = {
      date: null,
      investmentCost: null,
      fmv: null,
      proceeds: null,
      moic: null,
      twhPct: null,
      twhCost: null,
      twhFmv: null,
      twhProceeds: null,
    };
    uhIdentityRows.push({ identity: ident, fields: buildUhFields(blank, sys) });
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

  const headerRowsRecord: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed.headerRows ?? {})) {
    if (typeof v === "number") headerRowsRecord[k] = v;
  }

  return { quarterId, quarterLabel, sections, ...totals, headerRows: headerRowsRecord };
}
