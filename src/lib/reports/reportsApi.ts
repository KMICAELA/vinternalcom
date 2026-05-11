// Helpers for the persistent Reports system.
// - saveReportDraft: upload file to fund-reports/ + insert reports row (committed_to_db=false)
// - promoteReportToLive: write extracted_payload to live tables, stamp source_report_id
// - signedReportUrl: signed URL for downloading the original file
//
// All extracted data lives in reports.extracted_payload (jsonb) so /reports/:id can re-render
// the exact extraction result indefinitely without re-running the AI.

import { supabase } from "@/integrations/supabase/client";
import type { ExtractedPayload } from "@/lib/extraction/runExtractFile";

const BUCKET = "fund-reports";

export type ReportDraftInput = {
  file: File;
  fundId: string | null;
  quarterId: string | null;
  payload: ExtractedPayload | null;
  errorMessage?: string | null;
  // Optional: arbitrary structured summary the caller wants to persist (counts etc.)
  summary?: Record<string, unknown>;
};

export type SavedReport = {
  id: string;
  storage_path: string;
};

function classifyStatus(payload: ExtractedPayload | null, err?: string | null) {
  if (err && !payload) return "error" as const;
  if (!payload) return "pending" as const;
  // Heuristic: any null cost/fmv on a holding → needs_review
  const needsReview = (payload.holdings ?? []).some(
    (h) => h.fund_cost_usd == null || h.fund_fmv_usd == null,
  );
  return needsReview ? ("needs_review" as const) : ("success" as const);
}

function buildSummary(payload: ExtractedPayload | null) {
  if (!payload) return { holdings: 0, needs_review_count: 0 };
  const needsReviewCount = (payload.holdings ?? []).filter((h: any) => h?.needs_review === true).length;
  return {
    holdings: payload.holdings?.length ?? 0,
    needs_review_count: needsReviewCount,
    has_fund_metrics: payload.twh_nav_usd != null || payload.twh_contributions_usd != null,
    currency: payload.currency,
    report_date: payload.report_date,
  };
}

export async function saveReportDraft(input: ReportDraftInput): Promise<SavedReport> {
  const { file, fundId, quarterId, payload, errorMessage, summary } = input;

  // 1. Allocate id up-front so we can use it in the storage path
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const storagePath = `reports/${id}/${safeName}`;

  // 2. Upload file
  const up = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) throw up.error;

  // 3. Resolve current user → uploaded_by
  const { data: userData } = await supabase.auth.getUser();
  const uploadedBy = userData?.user?.id ?? null;

  // 4. Insert reports row
  const status = classifyStatus(payload, errorMessage);
  const { error: insErr } = await supabase.from("reports").insert({
    id,
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type || null,
    fund_id: fundId,
    quarter_id: quarterId,
    uploaded_by: uploadedBy,
    extraction_status: status,
    extraction_summary: { ...buildSummary(payload), ...(summary ?? {}), error: errorMessage ?? null },
    extracted_payload: payload as any,
    committed_to_db: false,
  });
  if (insErr) {
    // best-effort cleanup
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insErr;
  }

  return { id, storage_path: storagePath };
}

export async function signedReportUrl(storagePath: string, ttlSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, ttlSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteReport(reportId: string) {
  // 1. Look up storage path
  const { data: rep } = await supabase
    .from("reports")
    .select("storage_path")
    .eq("id", reportId)
    .maybeSingle();

  // 2. Unlink provenance on any rows pointing at this report (keeps live data intact)
  await supabase.from("fund_quarter_snapshots").update({ source_report_id: null }).eq("source_report_id", reportId);
  await supabase.from("underlying_holdings").update({ source_report_id: null }).eq("source_report_id", reportId);
  await supabase.from("direct_quarter_snapshots").update({ source_report_id: null }).eq("source_report_id", reportId);

  // 3. Delete the report row
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw error;

  // 4. Best-effort remove the stored file
  if (rep?.storage_path) {
    await supabase.storage.from(BUCKET).remove([rep.storage_path]);
  }
}

export async function archiveReport(reportId: string, archived: boolean) {
  const { error } = await supabase
    .from("reports")
    .update({ archived, archived_at: archived ? new Date().toISOString() : null })
    .eq("id", reportId);
  if (error) throw error;
}

// Re-run AI extraction against the original stored file. Updates the report's
// extracted_payload + status. Resets committed_to_db so the user can re-promote.
export async function reExtractReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: rep, error } = await supabase
    .from("reports")
    .select("id, file_name, mime_type, storage_path, fund_id, quarter_id")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !rep) throw new Error(error?.message ?? "Report not found");

  const dl = await supabase.storage.from(BUCKET).download(rep.storage_path);
  if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "Could not download stored file");

  const file = new File([dl.data], rep.file_name, { type: rep.mime_type ?? dl.data.type });
  const { runExtractFile } = await import("@/lib/extraction/runExtractFile");
  const result = await runExtractFile({ file, fundId: rep.fund_id, quarterId: rep.quarter_id });

  const status = classifyStatus(result.payload as any, result.error);
  const summary = { ...buildSummary(result.payload as any), error: result.error ?? null, re_extracted_at: new Date().toISOString() };
  const { error: updErr } = await supabase
    .from("reports")
    .update({
      extracted_payload: result.payload as any,
      extraction_status: status,
      extraction_summary: summary,
      committed_to_db: false,
      committed_at: null,
      committed_by: null,
    })
    .eq("id", reportId);
  if (updErr) throw updErr;
  return { ok: !result.error, error: result.error ?? undefined };
}

// Re-promote: clear committed_to_db then call promoteReportToLive again.
// Useful for picking up new FX rates or schema changes after the initial promote.
export async function rePromoteReport(reportId: string): Promise<PromoteResult> {
  // Reset commit flag so promoteReportToLive doesn't refuse
  await supabase
    .from("reports")
    .update({ committed_to_db: false, committed_at: null, committed_by: null })
    .eq("id", reportId);
  return promoteReportToLive(reportId);
}

// ─────────────────────────────────────────────────────────────────────────
// Promotion: write extracted_payload to live tables, stamp source_report_id
// ─────────────────────────────────────────────────────────────────────────

type PromoteResult = {
  fund_snapshots_written: number;
  underlying_holdings_written: number;
  direct_snapshots_written: number;
  errors: string[];
};

export async function promoteReportToLive(reportId: string): Promise<PromoteResult> {
  const result: PromoteResult = {
    fund_snapshots_written: 0,
    underlying_holdings_written: 0,
    direct_snapshots_written: 0,
    errors: [],
  };

  const { data: report, error: rErr } = await supabase
    .from("reports")
    .select("id, fund_id, quarter_id, extracted_payload, committed_to_db")
    .eq("id", reportId)
    .maybeSingle();
  if (rErr || !report) {
    throw new Error(rErr?.message ?? "Report not found");
  }
  if (report.committed_to_db) {
    throw new Error("Report already promoted to live data");
  }
  if (!report.quarter_id) {
    throw new Error("Cannot promote without a quarter assignment");
  }

  const payload = (report.extracted_payload ?? null) as ExtractedPayload | null;
  if (!payload) throw new Error("No extracted payload to promote");

  const isUsd = !payload.currency || payload.currency.toUpperCase() === "USD";
  const currency = isUsd ? "USD" : payload.currency!.toUpperCase();

  // Backward-compat helpers: payloads from older extractions only have *_usd fields,
  // newer non-USD payloads only have *_native. Accept either shape silently.
  const pickNative = (nativeVal: number | null | undefined, usdVal: number | null | undefined) =>
    nativeVal != null ? nativeVal : usdVal != null ? usdVal : null;
  const pickUsd = (usdVal: number | null | undefined, nativeVal: number | null | undefined) =>
    usdVal != null ? usdVal : nativeVal != null ? nativeVal : null;

  // 1. Fund-level metrics → fund_quarter_snapshots (if a fund_id is set)
  // For non-USD funds we write *_native + currency and leave *_usd null;
  // the DB trigger derives *_usd from fund_fx_rates at write time.
  if (report.fund_id) {
    const fundSnap: Record<string, any> = {
      fund_id: report.fund_id,
      quarter_id: report.quarter_id,
      currency,
      source_report_id: report.id,
      extracted_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      confirmed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    };
    if (isUsd) {
      fundSnap.twh_contributions_usd = pickUsd(payload.twh_contributions_usd, payload.twh_contributions_native) ?? 0;
      fundSnap.twh_distributions_usd = pickUsd(payload.twh_distributions_usd, payload.twh_distributions_native) ?? 0;
      fundSnap.twh_nav_usd = pickUsd(payload.twh_nav_usd, payload.twh_nav_native) ?? 0;
      fundSnap.fund_total_contributions_usd = pickUsd(payload.fund_total_contributions_usd, payload.fund_total_contributions_native) ?? 0;
      fundSnap.fund_total_nav_usd = pickUsd(payload.fund_total_nav_usd, payload.fund_total_nav_native) ?? 0;
    } else {
      fundSnap.twh_contributions_native = pickNative(payload.twh_contributions_native, payload.twh_contributions_usd);
      fundSnap.twh_distributions_native = pickNative(payload.twh_distributions_native, payload.twh_distributions_usd);
      fundSnap.twh_nav_native = pickNative(payload.twh_nav_native, payload.twh_nav_usd);
      fundSnap.fund_total_contributions_native = pickNative(payload.fund_total_contributions_native, payload.fund_total_contributions_usd);
      fundSnap.fund_total_nav_native = pickNative(payload.fund_total_nav_native, payload.fund_total_nav_usd);
      // Required NOT NULL columns get 0 placeholders; trigger will overwrite if rate exists.
      fundSnap.twh_contributions_usd = 0;
      fundSnap.twh_distributions_usd = 0;
      fundSnap.twh_nav_usd = 0;
      fundSnap.fund_total_contributions_usd = 0;
      fundSnap.fund_total_nav_usd = 0;
    }
    const { error: fsErr } = await supabase
      .from("fund_quarter_snapshots")
      .upsert(fundSnap as any, { onConflict: "fund_id,quarter_id" });
    if (fsErr) result.errors.push(`fund_snapshot: ${fsErr.message}`);
    else result.fund_snapshots_written = 1;
  }

  // 2. Holdings → underlying_holdings (need company_id resolution)
  if (report.fund_id && (payload.holdings?.length ?? 0) > 0) {
    for (const h of payload.holdings) {
      const name = (h.company_name ?? "").trim();
      if (!name) continue;

      // Lookup or create company by commercial_name OR legal_name
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .or(`commercial_name.ilike.${name},legal_name.ilike.${name}`)
        .limit(1)
        .maybeSingle();

      let companyId = existing?.id;
      if (!companyId) {
        const { data: created, error: cErr } = await supabase
          .from("companies")
          .insert({ legal_name: name, commercial_name: name })
          .select("id")
          .single();
        if (cErr || !created) {
          result.errors.push(`company "${name}": ${cErr?.message ?? "insert failed"}`);
          continue;
        }
        companyId = created.id;
      }

      const holdingRow: Record<string, any> = {
        fund_id: report.fund_id,
        quarter_id: report.quarter_id,
        company_id: companyId,
        round: h.round ?? null,
        instrument: h.instrument ?? null,
        investment_date: h.investment_date ?? null,
        currency,
        source_report_id: report.id,
        fund_ownership_pct: (h as any).fund_ownership_pct ?? null,
        needs_review: (h as any).needs_review === true,
        review_reason: (h as any).review_reason ?? null,
      };
      if (isUsd) {
        holdingRow.fund_cost_usd = pickUsd(h.fund_cost_usd, h.fund_cost_native);
        holdingRow.fund_fmv_usd = pickUsd(h.fund_fmv_usd, h.fund_fmv_native);
        holdingRow.fund_proceeds_usd = pickUsd(h.fund_proceeds_usd, h.fund_proceeds_native);
      } else {
        holdingRow.fund_cost_native = pickNative(h.fund_cost_native, h.fund_cost_usd);
        holdingRow.fund_fmv_native = pickNative(h.fund_fmv_native, h.fund_fmv_usd);
        holdingRow.fund_proceeds_native = pickNative(h.fund_proceeds_native, h.fund_proceeds_usd);
        // *_usd left null; trigger will fill via fund_fx_rates (or leave null if no rate).
      }
      const { error: uhErr } = await supabase.from("underlying_holdings").insert(holdingRow as any);
      if (uhErr) result.errors.push(`holding "${name}": ${uhErr.message}`);
      else result.underlying_holdings_written += 1;
    }
  }

  // 3. Mark committed
  const { data: userData } = await supabase.auth.getUser();
  const { error: mErr } = await supabase
    .from("reports")
    .update({
      committed_to_db: true,
      committed_at: new Date().toISOString(),
      committed_by: userData?.user?.id ?? null,
    })
    .eq("id", reportId);
  if (mErr) result.errors.push(`mark committed: ${mErr.message}`);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// PR #2: Stateful diff computation.
//
// Reads the existing DB state for (fund_id, quarter_id) and compares it
// against reports.extracted_payload. Writes one row per detected change to
// public.report_diffs. Sets reports.diff_status = 'pending_review' on
// success. Does NOT mutate live tables — that happens after the user
// approves the diffs (PR #3+).
//
// Diff row shape (per spec):
//   • change_type='fund_level' → one row per metric, field_name set,
//     old_value/new_value as jsonb scalars.
//   • change_type='update'     → one row per matched holding,
//     new_value = jsonb of changed fields, old_value = jsonb of prior values.
//   • change_type='add'        → one row per field on a new (unmatched)
//     holding, field_name set, new_value scalar.
//   • change_type='missing'    → one row per DB holding absent from payload,
//     requires_confirmation=true; resolution_reason picked by reviewer.
// ─────────────────────────────────────────────────────────────────────────

export type ComputeDiffsResult = {
  total: number;
  fund_level: number;
  updates: number;
  adds: number;
  missing: number;
  errors: string[];
};

const FUND_METRIC_KEYS = [
  "fund_total_contributions",
  "fund_total_nav",
  "fund_total_distributions",
  "twh_contributions",
  "twh_distributions",
  "twh_nav",
] as const;

const HOLDING_VALUE_FIELDS = [
  "fund_cost",
  "fund_fmv",
  "fund_proceeds",
] as const;

const HOLDING_META_FIELDS = [
  "round",
  "instrument",
  "investment_date",
  "fund_ownership_pct",
] as const;

// Numeric near-equality threshold ($1) to suppress float noise.
const NUM_EPSILON = 1;

function numericallyEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const an = Number(a);
  const bn = Number(b);
  if (Number.isNaN(an) || Number.isNaN(bn)) return a === b;
  return Math.abs(an - bn) <= NUM_EPSILON;
}

function scalarEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// Strips punctuation, corporate suffixes, and collapses whitespace so that
// "Castelion Co.", "Castelion, Inc.", and "castelion" all collapse to "castelion".
// Exported for the debug panel on ReportDetailPage so reviewers can see exactly
// what the matcher is comparing.
const CORP_SUFFIX_RE = /\b(?:inc(?:orporated)?|corp(?:oration)?|co|company|ltd|limited|llc|l\.l\.c|llp|lp|l\.p|plc|gmbh|ag|sa|s\.a|s\.r\.l|srl|bv|nv|pty|holdings?|group)\b/gi;

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  let out = String(s).toLowerCase();
  // Drop punctuation (commas, periods, parens, slashes, ampersands, quotes, dashes)
  out = out.replace(/[.,()/&'"\-_]+/g, " ");
  // Strip common corporate suffixes (after punctuation removal so "Inc." matches)
  out = out.replace(CORP_SUFFIX_RE, " ");
  // Collapse whitespace
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export async function computeReportDiffs(reportId: string): Promise<ComputeDiffsResult> {
  const result: ComputeDiffsResult = {
    total: 0,
    fund_level: 0,
    updates: 0,
    adds: 0,
    missing: 0,
    errors: [],
  };

  // 1. Load report + payload
  const { data: report, error: rErr } = await supabase
    .from("reports")
    .select("id, fund_id, quarter_id, extracted_payload")
    .eq("id", reportId)
    .maybeSingle();
  if (rErr || !report) throw new Error(rErr?.message ?? "Report not found");
  if (!report.fund_id || !report.quarter_id) {
    throw new Error("Report must have fund_id and quarter_id assigned before computing diffs");
  }
  const payload = (report.extracted_payload ?? null) as ExtractedPayload | null;
  if (!payload) throw new Error("No extracted payload to diff");

  const isUsd = !payload.currency || payload.currency.toUpperCase() === "USD";
  const valSuffix = isUsd ? "_usd" : "_native";

  // 2. Mark report as extracting → will flip to pending_review on success
  await supabase.from("reports").update({ diff_status: "extracting" }).eq("id", reportId);

  // 3. Clear any prior pending diffs for this report (reviewed ones stay)
  await supabase
    .from("report_diffs")
    .delete()
    .eq("report_id", reportId)
    .eq("status", "pending");

  // 4. Load existing fund snapshot (for fund_level diffs)
  const { data: existingFundSnap } = await supabase
    .from("fund_quarter_snapshots")
    .select("*")
    .eq("fund_id", report.fund_id)
    .eq("quarter_id", report.quarter_id)
    .maybeSingle();

  // 5. Load existing holdings (for update/missing/add diffs)
  const { data: existingHoldings } = await supabase
    .from("underlying_holdings")
    .select("id, company_id, round, instrument, investment_date, fund_ownership_pct, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, fund_cost_native, fund_fmv_native, fund_proceeds_native, companies:company_id(legal_name, commercial_name)")
    .eq("fund_id", report.fund_id)
    .eq("quarter_id", report.quarter_id);

  const diffRows: Record<string, any>[] = [];

  // ─── A. Fund-level metric diffs (one row per metric) ───────────────────
  for (const key of FUND_METRIC_KEYS) {
    const newVal = (payload as any)[`${key}${valSuffix}`] ?? null;
    const oldVal = existingFundSnap ? (existingFundSnap as any)[`${key}${valSuffix}`] ?? null : null;
    if (numericallyEqual(oldVal, newVal)) continue;
    diffRows.push({
      report_id: reportId,
      change_type: "fund_level",
      field_name: `${key}${valSuffix}`,
      old_value: oldVal,
      new_value: newVal,
      requires_confirmation: false,
    });
    result.fund_level += 1;
  }

  // ─── B. Holdings: build name → existing-row index ──────────────────────
  const existingByName = new Map<string, any>();
  for (const eh of existingHoldings ?? []) {
    const n = normalizeName(
      (eh.companies as any)?.commercial_name ?? (eh.companies as any)?.legal_name,
    );
    if (n) existingByName.set(n, eh);
  }

  const matchedExistingIds = new Set<string>();

  for (const h of payload.holdings ?? []) {
    const name = normalizeName(h.company_name);
    if (!name) continue;
    const matched = existingByName.get(name);

    if (matched) {
      matchedExistingIds.add(matched.id);
      // ── Update: one row per holding, jsonb of changed fields ──
      const changedNew: Record<string, unknown> = {};
      const changedOld: Record<string, unknown> = {};

      for (const f of HOLDING_VALUE_FIELDS) {
        const newV = (h as any)[`${f}${valSuffix}`] ?? null;
        const oldV = matched[`${f}${valSuffix}`] ?? null;
        if (!numericallyEqual(oldV, newV)) {
          changedNew[`${f}${valSuffix}`] = newV;
          changedOld[`${f}${valSuffix}`] = oldV;
        }
      }
      for (const f of HOLDING_META_FIELDS) {
        const newV = (h as any)[f] ?? null;
        const oldV = matched[f] ?? null;
        const eq = f === "fund_ownership_pct" ? numericallyEqual(oldV, newV) : scalarEqual(oldV, newV);
        if (!eq) {
          changedNew[f] = newV;
          changedOld[f] = oldV;
        }
      }

      if (Object.keys(changedNew).length > 0) {
        diffRows.push({
          report_id: reportId,
          change_type: "update",
          holding_id: matched.id,
          company_id: matched.company_id,
          proposed_company_name: h.company_name,
          old_value: changedOld,
          new_value: changedNew,
          requires_confirmation: false,
        });
        result.updates += 1;
      }
    } else {
      // ── Add: ONE row per new holding, all proposed fields in new_value jsonb ──
      // (Mirrors `update` shape so the review UI can render a single approve/reject row
      // and expand to show the per-field breakdown.)
      const proposed: Record<string, unknown> = {};
      for (const f of HOLDING_VALUE_FIELDS) {
        proposed[`${f}${valSuffix}`] = (h as any)[`${f}${valSuffix}`] ?? null;
      }
      for (const f of HOLDING_META_FIELDS) {
        proposed[f] = (h as any)[f] ?? null;
      }
      diffRows.push({
        report_id: reportId,
        change_type: "add",
        proposed_company_name: h.company_name,
        old_value: null,
        new_value: proposed,
        requires_confirmation: false,
      });
      result.adds += 1;
    }
  }

  // ─── C. Missing: existing holdings not present in this payload ─────────
  for (const eh of existingHoldings ?? []) {
    if (matchedExistingIds.has(eh.id)) continue;
    const propName =
      (eh.companies as any)?.commercial_name ??
      (eh.companies as any)?.legal_name ??
      null;
    diffRows.push({
      report_id: reportId,
      change_type: "missing",
      holding_id: eh.id,
      company_id: eh.company_id,
      proposed_company_name: propName,
      requires_confirmation: true, // reviewer must pick a resolution_reason
    });
    result.missing += 1;
  }

  // 6. Persist diffs
  if (diffRows.length > 0) {
    const { error: insErr } = await supabase.from("report_diffs").insert(diffRows as any);
    if (insErr) {
      result.errors.push(`report_diffs insert: ${insErr.message}`);
      await supabase.from("reports").update({ diff_status: null }).eq("id", reportId);
      throw new Error(insErr.message);
    }
  }
  result.total = diffRows.length;

  // 7. Flip report status
  await supabase
    .from("reports")
    .update({ diff_status: "pending_review" })
    .eq("id", reportId);

  return result;
}
