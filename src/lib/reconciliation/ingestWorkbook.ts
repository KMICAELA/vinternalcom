/**
 * Workbook ingest — fully bootstraps reference data from a parsed
 * TWH-1 Portfolio Metrics workbook, then writes quarter snapshots.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  ParsedWorkbook,
  ParsedUnderlyingRow,
  ParsedDirectRow,
  ParsedInventoryRow,
  ParsedCommentaryRow,
} from "./parseXlsx";
import { resolveFundName } from "./fundAliases";
import { normalizeInnovationType, splitMultiValue } from "./normalize";

const cleanName = (s: string | null | undefined) =>
  (s ?? "").toString().trim().replace(/\s+/g, " ");

const norm = (s: string | null | undefined) => cleanName(s).toLowerCase();

const directKey = (companyId: string, date: string) => `${companyId}|${date.slice(0, 10)}`;

export interface IngestSummary {
  underlyingBefore: number;
  underlyingAfter: number;
  underlyingInserted: number;
  fundsInserted: number;
  directsInserted: number;
  underlyingSkipped: { reason: string; row: ParsedUnderlyingRow }[];
  directsSnapshotsBefore: number;
  directsSnapshotsAfter: number;
  directsSnapshotsUpserted: number;
  directsSkipped: { reason: string; row: ParsedDirectRow }[];
  /** Metadata enrichment from Inventory + Port. Comments sheets. */
  companiesEnriched: number;
  companiesEnrichmentSkipped: { reason: string; companyName: string }[];
  /** Innovation-Type values that did NOT clamp to the 3-value taxonomy. */
  unmappedInnovationTypes: { companyName: string; raw: string[] }[];
}

async function getQuarterCount(table: "underlying_holdings" | "direct_quarter_snapshots", quarterId: string) {
  let q = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("quarter_id", quarterId);
  // Exclude soft-deleted holdings from the "before/after" reconciliation count.
  if (table === "underlying_holdings") q = q.is("removed_at", null);
  const { count } = await q;
  return count ?? 0;
}

async function upsertCompanies(parsed: ParsedWorkbook): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const row of [...parsed.directs, ...parsed.underlying]) {
    const legalName = cleanName(row.companyName);
    if (legalName) names.set(norm(legalName), legalName);
  }

  const payload = [...names.values()].map((legal_name) => ({ legal_name }));
  if (payload.length > 0) {
    const { data, error } = await supabase
      .from("companies")
      .upsert(payload, { onConflict: "legal_name", ignoreDuplicates: false })
      .select("id, legal_name");
    console.info("[ingest] companies upsert result", { rowCount: data?.length ?? 0, error });
    if (error) throw new Error(`companies upsert failed: ${error.message}`);
  }

  const { data: companies, error: selectError } = await supabase
    .from("companies")
    .select("id, legal_name")
    .in("legal_name", [...names.values()]);
  if (selectError) throw new Error(`companies select failed: ${selectError.message}`);

  return new Map((companies ?? []).map((c) => [norm(c.legal_name), c.id]));
}

async function upsertFunds(parsed: ParsedWorkbook): Promise<{ fundsByName: Map<string, string>; insertedCount: number }> {
  console.info("[ingest] first parsed fund row", parsed.funds[0] ?? null);
  const fundsByCanonicalName = new Map<string, { name: string; startDate: string | null }>();
  for (const f of parsed.funds) {
    const name = cleanName(resolveFundName(f.fundName));
    if (name) fundsByCanonicalName.set(norm(name), { name, startDate: f.startDate ?? null });
  }
  for (const u of parsed.underlying) {
    const name = cleanName(resolveFundName(u.fundName));
    if (name && !fundsByCanonicalName.has(norm(name))) fundsByCanonicalName.set(norm(name), { name, startDate: null });
  }

  const payload = [...fundsByCanonicalName.values()].map(({ name, startDate }) => ({
    name,
    start_date: startDate,
  }));
  let insertedCount = 0;
  if (payload.length > 0) {
    const { data, error } = await supabase
      .from("funds")
      .upsert(payload, { onConflict: "name", ignoreDuplicates: false })
      .select("id, name");
    console.info("[ingest] funds upsert result", { rowCount: data?.length ?? 0, error });
    if (error) throw new Error(`funds upsert failed: ${error.message}`);
    insertedCount = data?.length ?? 0;
  }

  const { data: funds, error: selectError } = await supabase
    .from("funds")
    .select("id, name")
    .in("name", [...fundsByCanonicalName.values()].map((f) => f.name));
  if (selectError) throw new Error(`funds select failed: ${selectError.message}`);

  return { fundsByName: new Map((funds ?? []).map((f) => [norm(f.name), f.id])), insertedCount };
}

async function upsertDirects(
  parsed: ParsedWorkbook,
  companiesByName: Map<string, string>,
): Promise<{ directsByKey: Map<string, string>; insertedCount: number; skipped: IngestSummary["directsSkipped"] }> {
  const skipped: IngestSummary["directsSkipped"] = [];
  const rows: any[] = [];
  const seen = new Set<string>();

  for (const d of parsed.directs) {
    const companyId = companiesByName.get(norm(d.companyName));
    if (!companyId || !d.date) {
      skipped.push({ reason: !companyId ? "Unknown company" : "Missing date", row: d });
      continue;
    }
    const key = directKey(companyId, d.date);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      company_id: companyId,
      investment_date: d.date,
      instrument: d.instrument,
      round: d.round,
      twh_cost_usd: d.twhCost ?? 0,
      co_investors: d.coInvestors ? [d.coInvestors] : [],
      note: d.note,
    });
  }

  let insertedCount = 0;
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("directs")
      .upsert(rows as any, { onConflict: "company_id,investment_date", ignoreDuplicates: false })
      .select("id, company_id, investment_date");
    console.info("[ingest] directs upsert result", { rowCount: data?.length ?? 0, error });
    if (error) throw new Error(`directs upsert failed: ${error.message}`);
    insertedCount = data?.length ?? 0;
  }

  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const { data: directs, error: selectError } = companyIds.length
    ? await supabase.from("directs").select("id, company_id, investment_date").in("company_id", companyIds)
    : { data: [], error: null };
  if (selectError) throw new Error(`directs select failed: ${selectError.message}`);

  const directsByKey = new Map<string, string>();
  for (const d of directs ?? []) {
    if (d.investment_date) directsByKey.set(directKey(d.company_id, d.investment_date), d.id);
  }

  return { directsByKey, insertedCount, skipped };
}

async function upsertFundCommitments(parsed: ParsedWorkbook, fundsByName: Map<string, string>) {
  const rows: any[] = [];
  for (const f of parsed.funds) {
    const fundId = fundsByName.get(norm(resolveFundName(f.fundName)));
    if (!fundId) continue;
    rows.push({
      fund_id: fundId,
      total_fund_commitment_usd: f.totalCommitments ?? 0,
      twh_commitment_usd: f.twhCommitment ?? 0,
      twh_ownership_pct: f.twhPct,
    });
  }
  if (rows.length === 0) return;

  const fundIds = rows.map((r) => r.fund_id);
  const { error: deleteError } = await supabase.from("fund_commitments").delete().in("fund_id", fundIds);
  if (deleteError) throw new Error(`fund_commitments delete failed: ${deleteError.message}`);

  const { data, error } = await supabase.from("fund_commitments").insert(rows as any).select("id");
  console.info("[ingest] fund_commitments insert result", { rowCount: data?.length ?? 0, error });
  if (error) throw new Error(`fund_commitments insert failed: ${error.message}`);
}

async function upsertFundQuarterSnapshots(parsed: ParsedWorkbook, quarterId: string, fundsByName: Map<string, string>) {
  const rows: any[] = [];
  for (const f of parsed.funds) {
    const fundId = fundsByName.get(norm(resolveFundName(f.fundName)));
    if (!fundId) continue;
    rows.push({
      fund_id: fundId,
      quarter_id: quarterId,
      fund_total_contributions_usd: f.totalContributions ?? 0,
      fund_total_distributions_usd: f.totalDistributions ?? 0,
      fund_total_nav_usd: f.fundTotalNav ?? f.portfolioValue ?? 0,
      twh_contributions_usd: f.twhContributions ?? 0,
      twh_distributions_usd: f.twhDistributions ?? 0,
      twh_nav_usd: f.twhNav ?? f.twhValue ?? 0,
      tvpi: f.tvpi ?? null,
      dpi: f.dpi ?? null,
      moic: f.moic ?? null,
      irr: f.irr ?? null,
    });
  }
  if (rows.length === 0) return 0;

  const { data, error } = await supabase
    .from("fund_quarter_snapshots")
    .upsert(rows as any, { onConflict: "fund_id,quarter_id", ignoreDuplicates: false })
    .select("id");
  console.info("[ingest] fund snapshot upsert result", { rowCount: data?.length ?? 0, error });
  if (error) throw new Error(`fund_quarter_snapshots upsert failed: ${error.message}`);
  return data?.length ?? 0;
}

async function upsertDirectQuarterSnapshots(
  parsed: ParsedWorkbook,
  quarterId: string,
  companiesByName: Map<string, string>,
  directsByKey: Map<string, string>,
  summary: IngestSummary,
) {
  const rows: any[] = [];
  for (const d of parsed.directs) {
    const companyId = companiesByName.get(norm(d.companyName));
    if (!companyId || !d.date) continue;
    const directId = directsByKey.get(directKey(companyId, d.date));
    if (!directId) {
      summary.directsSkipped.push({ reason: "No matching directs row", row: d });
      continue;
    }
    rows.push({
      direct_id: directId,
      quarter_id: quarterId,
      twh_fmv_usd: d.twhFmv ?? 0,
      twh_proceeds_usd: d.twhProceeds ?? 0,
      moic: d.moic ?? null,
      twh_ownership_pct: d.twhPct ?? null,
    });
  }

  if (rows.length === 0) return 0;
  const { data, error } = await supabase
    .from("direct_quarter_snapshots")
    .upsert(rows as any, { onConflict: "direct_id,quarter_id", ignoreDuplicates: false })
    .select("id");
  console.info("[ingest] direct snapshot upsert result", { rowCount: data?.length ?? 0, error });
  if (error) throw new Error(`direct_quarter_snapshots upsert failed: ${error.message}`);
  return data?.length ?? 0;
}

async function replaceUnderlyingHoldings(
  parsed: ParsedWorkbook,
  quarterId: string,
  fundsByName: Map<string, string>,
  companiesByName: Map<string, string>,
  summary: IngestSummary,
) {
  const { error: deleteError } = await supabase.from("underlying_holdings").delete().eq("quarter_id", quarterId);
  console.info("[ingest] underlying delete result", { quarterId, rowCount: summary.underlyingBefore, error: deleteError });
  if (deleteError) throw new Error(`Failed to clear underlying_holdings: ${deleteError.message}`);

  const rows: any[] = [];
  const trancheCounts = new Map<string, number>();
  for (const u of parsed.underlying) {
    const fundId = fundsByName.get(norm(resolveFundName(u.fundName)));
    const companyId = companiesByName.get(norm(u.companyName));
    if (!fundId || !companyId) {
      summary.underlyingSkipped.push({ reason: !fundId ? `Unknown fund "${u.fundName}"` : "Unknown company", row: u });
      continue;
    }
    const trancheKey = `${fundId}|${companyId}|${u.date ?? ""}`;
    const trancheSeq = (trancheCounts.get(trancheKey) ?? 0) + 1;
    trancheCounts.set(trancheKey, trancheSeq);
    rows.push({
      fund_id: fundId,
      quarter_id: quarterId,
      company_id: companyId,
      tranche_seq: trancheSeq,
      investment_date: u.date,
      instrument: u.instrument,
      round: u.round,
      fund_cost_usd: u.investmentCost ?? 0,
      fund_fmv_usd: u.fmv ?? 0,
      fund_proceeds_usd: u.proceeds ?? 0,
      moic: u.moic ?? null,
      twh_cost_usd: u.twhCost ?? 0,
      twh_fmv_usd: u.twhFmv ?? 0,
      twh_proceeds_usd: u.twhProceeds ?? 0,
      twh_ownership_pct: u.twhPct,
    });
  }

  const seen = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    const key = `${row.fund_id}|${row.quarter_id}|${row.company_id}|${row.investment_date}|${row.tranche_seq}`;
    if (seen.has(key)) {
      console.error("INTRA-BATCH DUPLICATE on key", key, "\n  first:", JSON.stringify(seen.get(key)), "\n  second:", JSON.stringify(row));
    }
    seen.set(key, row);
  }

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    if (i === 0 && slice[0]) {
      console.log("[ingest] first underlying_holdings upsert payload", JSON.stringify(slice[0], null, 2));
    }
    const { data, error } = await supabase.from("underlying_holdings").insert(slice as any).select("id");
    console.info("[ingest] underlying insert result", { chunkIndex: i / chunkSize, rowCount: data?.length ?? 0, error });
    if (error) {
      console.error("Underlying insert chunk", i / chunkSize, "failed:", error.message, "details:", error.details, "hint:", error.hint, "code:", error.code);
      throw new Error(`Underlying insert chunk ${i / chunkSize} failed: ${error.message}`);
    }
    summary.underlyingInserted += data?.length ?? slice.length;
  }
}

/**
 * Enrich the `companies` table with metadata from the Inventory and
 * Port. Comments sheets. Inventory wins on overlap (region, type, theme,
 * industry) since it is the structured classification sheet; Comments
 * fills in narrative-only fields (what_they_do, target_market,
 * tailwinds, challenges, stage, thesis_bucket).
 *
 * Innovation Type is clamped to the 3-value taxonomy via normalize.ts.
 * Unmapped values surface in the IngestSummary so the operator can
 * fix the source xlsx.
 *
 * Companies that don't already exist in the DB (i.e. not present in
 * Funds/Directs/Underlying) are SKIPPED with a recorded reason. We
 * don't want orphan rows that have no holdings yet show up in
 * portfolio aggregates.
 */
async function upsertCompanyMetadata(
  parsed: ParsedWorkbook,
  companiesByName: Map<string, string>,
  summary: IngestSummary,
) {
  // Index workbook rows by normalized company name. Inventory first so it wins.
  const invByName = new Map<string, ParsedInventoryRow>();
  for (const r of parsed.inventory) {
    const key = norm(r.companyName);
    if (key && !invByName.has(key)) invByName.set(key, r);
  }
  const commByName = new Map<string, ParsedCommentaryRow>();
  for (const r of parsed.commentary) {
    const key = norm(r.companyName);
    if (key && !commByName.has(key)) commByName.set(key, r);
  }

  // Union of names from both sheets
  const allNames = new Set<string>([...invByName.keys(), ...commByName.keys()]);

  type Update = {
    id: string;
    commercial_name?: string | null;
    url?: string | null;
    status?: string | null;
    region?: string[] | null;
    type?: string[] | null;
    theme?: string[] | null;
    industry?: string[] | null;
    stage?: string | null;
    thesis_bucket?: string | null;
    what_they_do?: string | null;
    target_market?: string | null;
    tailwinds?: string | null;
    challenges?: string | null;
    notes?: string | null;
  };
  const updates: Update[] = [];

  for (const key of allNames) {
    const companyId = companiesByName.get(key);
    const inv = invByName.get(key);
    const comm = commByName.get(key);
    const displayName = inv?.companyName ?? comm?.companyName ?? key;
    if (!companyId) {
      summary.companiesEnrichmentSkipped.push({
        reason: "Company not in Funds/Directs/Underlying — skipping enrichment",
        companyName: displayName,
      });
      continue;
    }

    const u: Update = { id: companyId };

    // Inventory-sourced fields (structured classification)
    if (inv) {
      if (inv.commercialName) u.commercial_name = inv.commercialName;
      if (inv.url) u.url = inv.url;
      if (inv.status) u.status = inv.status;
      if (inv.region) u.region = splitMultiValue(inv.region);
      if (inv.companyIndustry) u.industry = splitMultiValue(inv.companyIndustry);
      if (inv.theme) u.theme = splitMultiValue(inv.theme);
      if (inv.notes) u.notes = inv.notes;
      if (inv.type) {
        const { mapped, unmapped } = normalizeInnovationType(inv.type);
        u.type = mapped;
        if (unmapped.length > 0) {
          summary.unmappedInnovationTypes.push({ companyName: displayName, raw: unmapped });
        }
      }
    }

    // Comments-sourced fields (Inventory wins where they overlap)
    if (comm) {
      if (comm.region && u.region === undefined) u.region = splitMultiValue(comm.region);
      if (comm.theme && u.theme === undefined) u.theme = splitMultiValue(comm.theme);
      if (comm.type && u.type === undefined) {
        const { mapped, unmapped } = normalizeInnovationType(comm.type);
        u.type = mapped;
        if (unmapped.length > 0) {
          summary.unmappedInnovationTypes.push({ companyName: displayName, raw: unmapped });
        }
      }
      if (comm.stage) u.stage = comm.stage;
      if (comm.thesis) u.thesis_bucket = comm.thesis;
      if (comm.whatTheyDo) u.what_they_do = comm.whatTheyDo;
      if (comm.targetMarket) u.target_market = comm.targetMarket;
      if (comm.tailwinds) u.tailwinds = comm.tailwinds;
      if (comm.challenges) u.challenges = comm.challenges;
    }

    // Skip if there's actually nothing to update beyond id
    if (Object.keys(u).length <= 1) continue;
    updates.push(u);
  }

  if (updates.length === 0) {
    console.info("[ingest] company metadata: nothing to update");
    return;
  }

  // Issue per-row updates so we don't clobber unrelated columns.
  // Batched in parallel chunks for throughput.
  const chunkSize = 25;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const slice = updates.slice(i, i + chunkSize);
    const results = await Promise.all(
      slice.map(({ id, ...patch }) =>
        supabase
          .from("companies")
          .update({ ...patch, commentary_updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .maybeSingle(),
      ),
    );
    for (const r of results) {
      if (r.error) {
        console.error("[ingest] company metadata update error:", r.error.message);
        continue;
      }
      if (r.data) summary.companiesEnriched += 1;
    }
  }
  console.info("[ingest] company metadata enriched", {
    enriched: summary.companiesEnriched,
    skipped: summary.companiesEnrichmentSkipped.length,
    unmappedTypes: summary.unmappedInnovationTypes.length,
  });
}

export async function ingestWorkbook(parsed: ParsedWorkbook, quarterId: string): Promise<IngestSummary> {
  const summary: IngestSummary = {
    underlyingBefore: 0,
    underlyingAfter: 0,
    underlyingInserted: 0,
    fundsInserted: 0,
    directsInserted: 0,
    underlyingSkipped: [],
    directsSnapshotsBefore: 0,
    directsSnapshotsAfter: 0,
    directsSnapshotsUpserted: 0,
    directsSkipped: [],
    companiesEnriched: 0,
    companiesEnrichmentSkipped: [],
    unmappedInnovationTypes: [],
  };

  console.info("[ingest] start", {
    quarterId,
    parsedFunds: parsed.funds.length,
    parsedDirects: parsed.directs.length,
    parsedUnderlying: parsed.underlying.length,
    parsedInventory: parsed.inventory.length,
    parsedCommentary: parsed.commentary.length,
  });

  summary.underlyingBefore = await getQuarterCount("underlying_holdings", quarterId);
  summary.directsSnapshotsBefore = await getQuarterCount("direct_quarter_snapshots", quarterId);

  const companiesByName = await upsertCompanies(parsed);
  const { fundsByName, insertedCount: fundsInserted } = await upsertFunds(parsed);
  summary.fundsInserted = fundsInserted;

  const { directsByKey, insertedCount: directsInserted, skipped } = await upsertDirects(parsed, companiesByName);
  summary.directsInserted = directsInserted;
  summary.directsSkipped.push(...skipped);

  await upsertFundCommitments(parsed, fundsByName);
  await upsertFundQuarterSnapshots(parsed, quarterId, fundsByName);
  summary.directsSnapshotsUpserted = await upsertDirectQuarterSnapshots(
    parsed,
    quarterId,
    companiesByName,
    directsByKey,
    summary,
  );
  await replaceUnderlyingHoldings(parsed, quarterId, fundsByName, companiesByName, summary);

  // Enrich qualitative metadata from Inventory + Port. Comments AFTER all
  // entity rows (companies/directs/underlying) exist, so we can match by id.
  await upsertCompanyMetadata(parsed, companiesByName, summary);

  summary.underlyingAfter = await getQuarterCount("underlying_holdings", quarterId);
  summary.directsSnapshotsAfter = await getQuarterCount("direct_quarter_snapshots", quarterId);

  console.info("[ingest] final summary", summary);
  return summary;
}

