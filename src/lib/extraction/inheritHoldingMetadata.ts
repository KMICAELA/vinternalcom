// Smart enrichment for extracted underlying holdings.
//
// For each extracted holding from a new quarterly report, we try to:
//   1. Resolve the company by fuzzy name match against `companies` table.
//   2. If the company exists AND was previously held by the same fund,
//      inherit the prior quarter's `round`, `instrument`, `cost`, and
//      `fmv` values when the new extraction left them blank/null.
//   3. Apply the project-wide round normalizer (Pre-Seed / Seed / Series A–G,
//      sub-tranches collapsed to parent series, instrument keywords moved
//      out of the round column).
//   4. Emit a `data_confidence` indicator for the UI:
//        - confirmed: explicit value in this quarter's source
//        - inherited: value carried from prior quarter unchanged
//        - needs_review: TBD (null) field, narrative-driven update, or
//          material cost change
//
// This helper is read-only — it never writes to the DB. Both the sandbox
// and the production AddReportWizard call it before showing the review UI.

import { supabase } from "@/integrations/supabase/client";
import { normalizeRound } from "./normalizeRound";

export type RawHolding = {
  company_name: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
};

export type DataConfidence = "confirmed" | "inherited" | "needs_review";

export type EnrichedHolding = RawHolding & {
  round_detail?: string | null;
  inherited_from_prior?: boolean;
  inherited_cost?: boolean;
  inherited_fmv?: boolean;
  needs_review?: boolean;
  needs_round_review?: boolean;
  prior_round?: string | null;
  prior_instrument?: string | null;
  prior_cost_usd?: number | null;
  prior_fmv_usd?: number | null;
  data_confidence?: DataConfidence;
  review_reason?: string | null;
};

const MATERIAL_COST_DELTA = 0.1; // 10%

const normalizeName = (s: string): string =>
  s.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");

/**
 * Enrich a list of extracted holdings with inherited metadata from
 * the most recent prior quarter. Read-only — no DB writes.
 *
 * `currentQuarterEndDate` is used to scope "prior" — we only consider
 * snapshots strictly before this date. If omitted, all snapshots count.
 */
export async function inheritHoldingMetadata(opts: {
  fundId: string;
  holdings: RawHolding[];
  currentQuarterEndDate?: string | null;
}): Promise<EnrichedHolding[]> {
  const { fundId, holdings } = opts;
  if (!fundId || holdings.length === 0) return holdings.map((h) => ({ ...h }));

  // 1. Resolve all candidate companies in one query.
  const names = holdings.map((h) => h.company_name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) return holdings.map((h) => ({ ...h }));

  const { data: companyHits } = await supabase
    .from("companies")
    .select("id, legal_name, commercial_name");

  const companyByNorm = new Map<string, string>();
  (companyHits ?? []).forEach((c: any) => {
    if (c.legal_name) companyByNorm.set(normalizeName(c.legal_name), c.id);
    if (c.commercial_name) companyByNorm.set(normalizeName(c.commercial_name), c.id);
  });

  const resolvedCompanyIds = new Set<string>();
  const nameToCompanyId = new Map<string, string | null>();
  for (const n of names) {
    const id = companyByNorm.get(normalizeName(n)) ?? null;
    nameToCompanyId.set(n, id);
    if (id) resolvedCompanyIds.add(id);
  }

  // 2. For resolved companies, fetch all prior holdings.
  const priorByCompany = new Map<string, {
    round: string | null;
    instrument: string | null;
    fund_cost_usd: number | null;
    fund_fmv_usd: number | null;
    quarter_end_date: string;
  }>();
  if (resolvedCompanyIds.size > 0) {
    const { data: prior } = await supabase
      .from("underlying_holdings")
      .select("company_id, round, instrument, fund_cost_usd, fund_fmv_usd, quarters!inner(quarter_end_date)")
      .eq("fund_id", fundId)
      .in("company_id", Array.from(resolvedCompanyIds));

    for (const row of (prior ?? []) as any[]) {
      const qend: string | null = row.quarters?.quarter_end_date ?? null;
      if (!qend) continue;
      if (opts.currentQuarterEndDate && qend >= opts.currentQuarterEndDate) continue;
      const existing = priorByCompany.get(row.company_id);
      if (!existing || qend > existing.quarter_end_date) {
        priorByCompany.set(row.company_id, {
          round: row.round ?? null,
          instrument: row.instrument ?? null,
          fund_cost_usd: row.fund_cost_usd == null ? null : Number(row.fund_cost_usd),
          fund_fmv_usd: row.fund_fmv_usd == null ? null : Number(row.fund_fmv_usd),
          quarter_end_date: qend,
        });
      }
    }
  }

  // 3. Walk holdings and apply inheritance + normalization + flags.
  return holdings.map((h): EnrichedHolding => {
    const out: EnrichedHolding = { ...h };
    const name = h.company_name?.trim();
    if (!name) return out;

    const companyId = nameToCompanyId.get(name);
    const prior = companyId ? priorByCompany.get(companyId) : undefined;

    if (prior) {
      // Existing company with prior holding — inherit blank fields.
      let inheritedSomething = false;

      if (!out.round && prior.round) {
        out.round = prior.round;
        inheritedSomething = true;
      }
      if (!out.instrument && prior.instrument) {
        out.instrument = prior.instrument;
        inheritedSomething = true;
      }
      // Cost: inherit when current is null/0 and prior had a real value.
      const curCost = h.fund_cost_usd;
      if ((curCost == null || Number(curCost) === 0) && prior.fund_cost_usd != null && prior.fund_cost_usd > 0) {
        out.fund_cost_usd = prior.fund_cost_usd;
        out.inherited_cost = true;
        inheritedSomething = true;
      }
      // FMV: ONLY inherit when current is null (no extraction). $0 is a meaningful
      // markdown and must NOT be overwritten with prior FMV.
      const curFmv = h.fund_fmv_usd;
      if (curFmv == null && prior.fund_fmv_usd != null && prior.fund_fmv_usd > 0) {
        out.fund_fmv_usd = prior.fund_fmv_usd;
        out.inherited_fmv = true;
        inheritedSomething = true;
      }
      out.prior_round = prior.round;
      out.prior_instrument = prior.instrument;
      out.prior_cost_usd = prior.fund_cost_usd;
      out.prior_fmv_usd = prior.fund_fmv_usd;
      if (inheritedSomething) out.inherited_from_prior = true;

      // Material cost change → flag (only when both sides are real values).
      if (!out.inherited_cost && prior.fund_cost_usd != null && prior.fund_cost_usd > 0) {
        const newCost = Number(out.fund_cost_usd ?? 0);
        if (newCost > 0) {
          const delta = Math.abs(newCost - prior.fund_cost_usd) / prior.fund_cost_usd;
          if (delta > MATERIAL_COST_DELTA) {
            out.needs_review = true;
            out.review_reason = "Material cost change vs prior quarter — possible new tranche / up-round";
          }
        }
      }
    }
    // NOTE: removed the auto-default-to-Seed-on-SAFE behaviour. Per the universal
    // extraction rules, we NEVER invent a round value. If the report doesn't
    // state a round and there's no prior to inherit from, leave round null and
    // flag as needs_review.
    if (!out.round && !prior) {
      out.needs_review = true;
      out.review_reason = out.review_reason ?? "Missing round — not stated in report and no prior quarter to inherit from";
    }

    // 4. Apply round normalization (catches "Series A-1" → "Series A",
    //    "SAFE" in round col → moved to instrument col, etc.).
    const norm = normalizeRound(out.round);
    if (norm.round !== out.round) out.round = norm.round;
    if (norm.round_detail) out.round_detail = norm.round_detail;
    if (norm.instrument_extracted && !out.instrument) {
      out.instrument = norm.instrument_extracted;
    }

    // 5. Compute data_confidence.
    const hasTbd = out.fund_cost_usd == null || out.fund_fmv_usd == null;
    if (out.needs_review || hasTbd) {
      out.data_confidence = "needs_review";
      if (hasTbd && !out.review_reason) {
        out.review_reason = "Cost or FMV not stated in report — needs manual confirmation";
      }
    } else if (out.inherited_from_prior) {
      out.data_confidence = "inherited";
    } else {
      out.data_confidence = "confirmed";
    }

    return out;
  });
}
