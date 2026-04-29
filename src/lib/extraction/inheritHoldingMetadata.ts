// Smart enrichment for extracted underlying holdings.
//
// For each extracted holding from a new quarterly report, we try to:
//   1. Resolve the company by fuzzy name match against `companies` table.
//   2. If the company exists AND was previously held by the same fund,
//      inherit the prior quarter's `round` and `instrument` values when
//      the new extraction left them blank or ambiguous.
//   3. Flag rows that look like they need human review:
//        - needs_review: cost differs >10% from prior quarter (possible new tranche / up-round)
//        - needs_round_review: new company + blank round on a SAFE/Convertible Note
//          (we default round to "Seed" but the user should confirm)
//
// This helper is read-only — it never writes to the DB. Both the sandbox
// and the production AddReportWizard call it before showing the review UI.

import { supabase } from "@/integrations/supabase/client";

export type RawHolding = {
  company_name: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
};

export type EnrichedHolding = RawHolding & {
  inherited_from_prior?: boolean;
  inherited_cost?: boolean;
  inherited_fmv?: boolean;
  needs_review?: boolean;
  needs_round_review?: boolean;
  prior_round?: string | null;
  prior_instrument?: string | null;
  prior_cost_usd?: number | null;
  prior_fmv_usd?: number | null;
};

const MATERIAL_COST_DELTA = 0.1; // 10%

const isConvertibleInstrument = (s: string | null | undefined): boolean => {
  if (!s) return false;
  const k = s.toLowerCase();
  return k.includes("safe") || k.includes("convertible") || k.includes("note");
};

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

  // 1. Resolve all candidate companies in one query (case-insensitive on legal_name OR commercial_name).
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

  // 2. For resolved companies, fetch all prior holdings + quarter end dates in this fund.
  let priorByCompany = new Map<string, {
    round: string | null;
    instrument: string | null;
    fund_cost_usd: number;
    fund_fmv_usd: number;
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
          fund_cost_usd: Number(row.fund_cost_usd ?? 0),
          fund_fmv_usd: Number(row.fund_fmv_usd ?? 0),
          quarter_end_date: qend,
        });
      }
    }
  }

  // 3. Walk holdings and apply inheritance / flags.
  return holdings.map((h): EnrichedHolding => {
    const out: EnrichedHolding = { ...h };
    const name = h.company_name?.trim();
    if (!name) return out;

    const companyId = nameToCompanyId.get(name);
    const prior = companyId ? priorByCompany.get(companyId) : undefined;

    if (prior) {
      // Existing company with prior holding — inherit blank fields.
      let inherited = false;
      if (!out.round && prior.round) {
        out.round = prior.round;
        inherited = true;
      }
      if (!out.instrument && prior.instrument) {
        out.instrument = prior.instrument;
        inherited = true;
      }
      // Inherit Cost when current extraction is null/0 but prior had a value.
      // Cost is the most stable field across quarters — if Q4 narrative didn't
      // restate it, the Q3 baseline still holds.
      const curCost = h.fund_cost_usd;
      if ((curCost == null || Number(curCost) === 0) && prior.fund_cost_usd > 0) {
        out.fund_cost_usd = prior.fund_cost_usd;
        out.inherited_cost = true;
        inherited = true;
      }
      // Inherit FMV when current extraction is null/0. Less stable than cost
      // (FMV moves quarter-to-quarter) so we only fall back when extraction
      // truly returned nothing — never overwrite a real new value.
      const curFmv = h.fund_fmv_usd;
      if ((curFmv == null || Number(curFmv) === 0) && prior.fund_fmv_usd > 0) {
        out.fund_fmv_usd = prior.fund_fmv_usd;
        out.inherited_fmv = true;
        inherited = true;
      }
      out.prior_round = prior.round;
      out.prior_instrument = prior.instrument;
      out.prior_cost_usd = prior.fund_cost_usd;
      out.prior_fmv_usd = prior.fund_fmv_usd;
      if (inherited) out.inherited_from_prior = true;

      // Material cost change → flag (only when both sides are real, not inherited).
      const newCost = Number(out.fund_cost_usd ?? 0);
      if (!out.inherited_cost && prior.fund_cost_usd > 0) {
        const delta = Math.abs(newCost - prior.fund_cost_usd) / prior.fund_cost_usd;
        if (delta > MATERIAL_COST_DELTA) out.needs_review = true;
      } else if (!out.inherited_cost && newCost > 0) {
        // Prior had no cost recorded but we now have one — likely new tranche.
        out.needs_review = true;
      }
    } else {
      // New company (or no prior holding for this fund). Default SAFE/CN round to Seed.
      if (!out.round && isConvertibleInstrument(out.instrument)) {
        out.round = "Seed";
        out.needs_round_review = true;
      }
    }

    return out;
  });
}
