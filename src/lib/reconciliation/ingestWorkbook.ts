/**
 * Workbook ingest — writes per-tranche underlying_holdings and
 * direct_quarter_snapshots from a parsed TWH-1 Portfolio Metrics workbook.
 *
 * This is the IDEMPOTENT, header-aware ingest path that supersedes the
 * original "one row per company per fund per quarter" seed. It uses the
 * composite (fund_id, quarter_id, company_id, investment_date, round,
 * instrument) tranche key so the same company can appear multiple times
 * in the same fund/quarter at different rounds (e.g. Earth AI in
 * Lowercarbon, Chaos Industries in Tamarack).
 */

import { supabase } from "@/integrations/supabase/client";
import type { ParsedWorkbook, ParsedUnderlyingRow, ParsedDirectRow } from "./parseXlsx";
import { resolveFundName } from "./fundAliases";

const norm = (s: string | null | undefined) =>
  (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

export interface IngestSummary {
  underlyingBefore: number;
  underlyingAfter: number;
  underlyingInserted: number;
  underlyingSkipped: { reason: string; row: ParsedUnderlyingRow }[];
  directsSnapshotsBefore: number;
  directsSnapshotsAfter: number;
  directsSnapshotsUpserted: number;
  directsSkipped: { reason: string; row: ParsedDirectRow }[];
}

async function resolveOrCreateCompany(legalName: string): Promise<string> {
  const trimmed = legalName.trim();
  const { data: hits } = await supabase
    .from("companies")
    .select("id")
    .ilike("legal_name", trimmed)
    .limit(1);
  if (hits && hits.length > 0) return hits[0].id;
  const { data: created, error } = await supabase
    .from("companies")
    .insert({ legal_name: trimmed })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function ingestWorkbook(
  parsed: ParsedWorkbook,
  quarterId: string,
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    underlyingBefore: 0,
    underlyingAfter: 0,
    underlyingInserted: 0,
    underlyingSkipped: [],
    directsSnapshotsBefore: 0,
    directsSnapshotsAfter: 0,
    directsSnapshotsUpserted: 0,
    directsSkipped: [],
  };

  // Snapshot before-counts for the summary banner.
  const { count: uhBefore } = await supabase
    .from("underlying_holdings")
    .select("id", { count: "exact", head: true })
    .eq("quarter_id", quarterId);
  summary.underlyingBefore = uhBefore ?? 0;

  const { count: dqsBefore } = await supabase
    .from("direct_quarter_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("quarter_id", quarterId);
  summary.directsSnapshotsBefore = dqsBefore ?? 0;

  // Pull funds + companies + directs into memory once.
  const [{ data: funds }, { data: companies }, { data: directs }] = await Promise.all([
    supabase.from("funds").select("id, name"),
    supabase.from("companies").select("id, legal_name"),
    supabase.from("directs").select("id, company_id, investment_date, round, instrument"),
  ]);
  const fundsByName = new Map((funds ?? []).map((f) => [norm(f.name), f.id]));
  const companiesByName = new Map((companies ?? []).map((c) => [norm(c.legal_name), c.id]));

  // ============ UNDERLYING HOLDINGS — TRUNCATE AND RE-INSERT ============
  const { error: delErr } = await supabase
    .from("underlying_holdings")
    .delete()
    .eq("quarter_id", quarterId);
  if (delErr) throw new Error(`Failed to clear underlying_holdings: ${delErr.message}`);

  // Pre-resolve any missing companies in a serial loop so we don't race.
  for (const u of parsed.underlying) {
    const canonicalFund = resolveFundName(u.fundName);
    const fundId = fundsByName.get(norm(canonicalFund));
    if (!fundId) {
      summary.underlyingSkipped.push({ reason: `Unknown fund "${u.fundName}"`, row: u });
      continue;
    }
    let companyId = companiesByName.get(norm(u.companyName));
    if (!companyId) {
      companyId = await resolveOrCreateCompany(u.companyName);
      companiesByName.set(norm(u.companyName), companyId);
    }
  }

  // Build all rows for this quarter.
  // NOTE: cast to `any` because the Supabase types are auto-generated
  // and may lag the migration that adds the TWH columns.
  const rowsToInsert: any[] = [];
  for (const u of parsed.underlying) {
    const canonicalFund = resolveFundName(u.fundName);
    const fundId = fundsByName.get(norm(canonicalFund));
    if (!fundId) continue; // already logged above
    const companyId = companiesByName.get(norm(u.companyName));
    if (!companyId) continue;
    rowsToInsert.push({
      fund_id: fundId,
      quarter_id: quarterId,
      company_id: companyId,
      tranche_seq: u.trancheSeq,
      investment_date: u.date,
      instrument: u.instrument,
      round: u.round,
      fund_cost_usd: u.investmentCost ?? 0,
      fund_fmv_usd: u.fmv ?? 0,
      fund_proceeds_usd: u.proceeds ?? 0,
      twh_cost_usd: u.twhCost ?? 0,
      twh_fmv_usd: u.twhFmv ?? 0,
      twh_proceeds_usd: u.twhProceeds ?? 0,
      twh_ownership_pct: u.twhPct,
    });
  }

  // Insert in chunks of 500 to stay well under any payload limits.
  const seen = new Map<string, (typeof rowsToInsert)[0]>();
  for (const row of rowsToInsert) {
    const key = `${row.fund_id}|${row.quarter_id}|${row.company_id}|${row.investment_date}|${row.tranche_seq}`;
    if (seen.has(key)) {
      console.error(
        "INTRA-BATCH DUPLICATE on key", key,
        "\n  first:", JSON.stringify(seen.get(key)),
        "\n  second:", JSON.stringify(row),
      );
    }
    seen.set(key, row);
  }

  const chunkSize = 500;
  for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
    const slice = rowsToInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("underlying_holdings").insert(slice as any);
    if (error) {
      console.error(
        "Underlying insert chunk", i / chunkSize, "failed:",
        error.message,
        "details:", error.details,
        "hint:", error.hint,
        "code:", error.code,
      );
      throw new Error(`Underlying insert chunk ${i / chunkSize} failed: ${error.message}`);
    }
    summary.underlyingInserted += slice.length;
  }

  const { count: uhAfter } = await supabase
    .from("underlying_holdings")
    .select("id", { count: "exact", head: true })
    .eq("quarter_id", quarterId);
  summary.underlyingAfter = uhAfter ?? 0;

  // ============ DIRECT QUARTER SNAPSHOTS — UPSERT BY (DIRECT, QUARTER) ============
  // For each parsed Direct row, locate the matching directs row by
  // (company_id, investment_date) and upsert its quarter snapshot.
  const directsByKey = new Map<string, string>();
  for (const d of directs ?? []) {
    const co = (companies ?? []).find((c) => c.id === d.company_id);
    if (!co) continue;
    const key = `${norm(co.legal_name)}||${(d.investment_date ?? "").slice(0, 10)}`;
    directsByKey.set(key, d.id);
  }

  const dqsRows: any[] = [];
  for (const dr of parsed.directs) {
    if (!dr.companyName || !dr.date) {
      summary.directsSkipped.push({ reason: "Missing name/date", row: dr });
      continue;
    }
    const key = `${norm(dr.companyName)}||${dr.date.slice(0, 10)}`;
    const directId = directsByKey.get(key);
    if (!directId) {
      summary.directsSkipped.push({ reason: "No matching directs row", row: dr });
      continue;
    }
    dqsRows.push({
      direct_id: directId,
      quarter_id: quarterId,
      twh_fmv_usd: dr.twhFmv ?? 0,
      twh_proceeds_usd: dr.twhProceeds ?? 0,
    });
  }

  if (dqsRows.length > 0) {
    const { error: upErr } = await supabase
      .from("direct_quarter_snapshots")
      .upsert(dqsRows as any, { onConflict: "direct_id,quarter_id" });
    if (upErr) throw new Error(`direct_quarter_snapshots upsert failed: ${upErr.message}`);
    summary.directsSnapshotsUpserted = dqsRows.length;
  }

  const { count: dqsAfter } = await supabase
    .from("direct_quarter_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("quarter_id", quarterId);
  summary.directsSnapshotsAfter = dqsAfter ?? 0;

  return summary;
}
