// Smart enrichment for extracted underlying holdings.
//
// For each extracted holding from a new quarterly report, we try to:
//   1. Resolve the company by fuzzy name match against `companies` table.
//   2. If the company exists AND was previously held by the same fund,
//      inherit the prior quarter's `round`, `instrument`, `cost`, and
//      `fmv` values when the new extraction left them blank/null.
//   3. CARRY-FORWARD: any prior-quarter holding for this fund that the
//      current extraction did NOT mention is added as a synthetic row
//      inheriting all prior values. Narrative-only reports rarely list
//      every position; the rule is "prior baseline persists unless
//      the report explicitly contradicts/marks down a position".
//   4. Multi-tranche consolidation: if the same company had multiple
//      tranche rows in the prior quarter, sum cost/fmv/proceeds into a
//      single inherited row (keeps a single source of truth per company).
//   5. Apply the project-wide round normalizer.
//   6. Emit a `data_confidence` indicator for the UI.
//
// This helper is read-only — it never writes to the DB.

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
  carried_forward?: boolean;
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

type PriorAgg = {
  company_id: string;
  company_name: string;
  round: string | null;
  instrument: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
  quarter_end_date: string;
};

export async function inheritHoldingMetadata(opts: {
  fundId: string;
  holdings: RawHolding[];
  currentQuarterEndDate?: string | null;
  inheritValues?: boolean;
  carryForwardMissing?: boolean;
}): Promise<EnrichedHolding[]> {
  const { fundId, holdings } = opts;
  const inheritValues = opts.inheritValues ?? true;
  const carryForwardMissing = opts.carryForwardMissing ?? true;
  if (!fundId) return holdings.map((h) => ({ ...h }));

  // 1. Resolve companies for the current extraction.
  const { data: companyHits } = await supabase
    .from("companies")
    .select("id, legal_name, commercial_name");
  const companyByNorm = new Map<string, string>();
  const companyDisplayName = new Map<string, string>();
  (companyHits ?? []).forEach((c: any) => {
    const display = c.commercial_name ?? c.legal_name;
    if (c.legal_name) companyByNorm.set(normalizeName(c.legal_name), c.id);
    if (c.commercial_name) companyByNorm.set(normalizeName(c.commercial_name), c.id);
    if (display) companyDisplayName.set(c.id, display);
  });

  const nameToCompanyId = new Map<string, string | null>();
  for (const h of holdings) {
    const n = h.company_name?.trim();
    if (!n) continue;
    nameToCompanyId.set(n, companyByNorm.get(normalizeName(n)) ?? null);
  }

  // 2. Fetch ALL prior holdings for this fund (single query) so we can both
  //    inherit AND carry-forward unmentioned positions.
  const { data: priorRows } = await supabase
    .from("underlying_holdings")
    .select("company_id, round, instrument, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, quarters!inner(quarter_end_date)")
    .eq("fund_id", fundId);

  // Find each company's most recent prior quarter (strictly before current).
  const latestQuarterByCompany = new Map<string, string>();
  for (const row of (priorRows ?? []) as any[]) {
    const qend: string | null = row.quarters?.quarter_end_date ?? null;
    if (!qend) continue;
    if (opts.currentQuarterEndDate && qend >= opts.currentQuarterEndDate) continue;
    const cur = latestQuarterByCompany.get(row.company_id);
    if (!cur || qend > cur) latestQuarterByCompany.set(row.company_id, qend);
  }

  // Aggregate (sum) all tranches in that latest prior quarter per company.
  const priorByCompany = new Map<string, PriorAgg>();
  for (const row of (priorRows ?? []) as any[]) {
    const qend: string | null = row.quarters?.quarter_end_date ?? null;
    if (!qend) continue;
    const target = latestQuarterByCompany.get(row.company_id);
    if (!target || qend !== target) continue;
    const existing = priorByCompany.get(row.company_id);
    const cost = row.fund_cost_usd == null ? null : Number(row.fund_cost_usd);
    const fmv = row.fund_fmv_usd == null ? null : Number(row.fund_fmv_usd);
    const proc = row.fund_proceeds_usd == null ? null : Number(row.fund_proceeds_usd);
    if (!existing) {
      priorByCompany.set(row.company_id, {
        company_id: row.company_id,
        company_name: companyDisplayName.get(row.company_id) ?? "",
        round: row.round ?? null,
        instrument: row.instrument ?? null,
        fund_cost_usd: cost,
        fund_fmv_usd: fmv,
        fund_proceeds_usd: proc,
        quarter_end_date: qend,
      });
    } else {
      // Multi-tranche: sum numerics; keep first non-null round/instrument.
      existing.fund_cost_usd = (existing.fund_cost_usd ?? 0) + (cost ?? 0);
      existing.fund_fmv_usd = (existing.fund_fmv_usd ?? 0) + (fmv ?? 0);
      existing.fund_proceeds_usd = (existing.fund_proceeds_usd ?? 0) + (proc ?? 0);
      if (!existing.round && row.round) existing.round = row.round;
      if (!existing.instrument && row.instrument) existing.instrument = row.instrument;
    }
  }

  // 3. Walk current holdings, inheriting blanks from prior.
  const seenCompanyIds = new Set<string>();
  const enriched: EnrichedHolding[] = holdings.map((h): EnrichedHolding => {
    const out: EnrichedHolding = { ...h };
    const name = h.company_name?.trim();
    if (!name) return out;

    const companyId = nameToCompanyId.get(name);
    const prior = companyId ? priorByCompany.get(companyId) : undefined;
    if (companyId) seenCompanyIds.add(companyId);

    if (prior) {
      let inheritedSomething = false;
      if (!out.round && prior.round) { out.round = prior.round; inheritedSomething = true; }
      if (!out.instrument && prior.instrument) { out.instrument = prior.instrument; inheritedSomething = true; }
      const curCost = h.fund_cost_usd;
      if (inheritValues && (curCost == null || Number(curCost) === 0) && prior.fund_cost_usd != null && prior.fund_cost_usd > 0) {
        out.fund_cost_usd = prior.fund_cost_usd;
        out.inherited_cost = true;
        inheritedSomething = true;
      }
      const curFmv = h.fund_fmv_usd;
      // FMV: only inherit when null (no extraction). $0 stays as a markdown.
      if (inheritValues && curFmv == null && prior.fund_fmv_usd != null && prior.fund_fmv_usd > 0) {
        out.fund_fmv_usd = prior.fund_fmv_usd;
        out.inherited_fmv = true;
        inheritedSomething = true;
      }
      out.prior_round = prior.round;
      out.prior_instrument = prior.instrument;
      out.prior_cost_usd = prior.fund_cost_usd;
      out.prior_fmv_usd = prior.fund_fmv_usd;
      if (inheritedSomething) out.inherited_from_prior = true;

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
    if (!out.round && !prior) {
      out.needs_review = true;
      out.review_reason = out.review_reason ?? "Missing round — not stated in report and no prior quarter to inherit from";
    }

    const norm = normalizeRound(out.round);
    if (norm.round !== out.round) out.round = norm.round;
    if (norm.round_detail) out.round_detail = norm.round_detail;
    if (norm.instrument_extracted && !out.instrument) out.instrument = norm.instrument_extracted;

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

  // 4. CARRY-FORWARD: append synthetic rows for prior holdings the current
  //    extraction did NOT mention. They keep cost/fmv/round/instrument intact.
  for (const [companyId, prior] of priorByCompany) {
    if (!carryForwardMissing) break;
    if (seenCompanyIds.has(companyId)) continue;
    if (!prior.company_name) continue;
    const norm = normalizeRound(prior.round);
    enriched.push({
      company_name: prior.company_name,
      investment_date: null,
      instrument: prior.instrument ?? norm.instrument_extracted ?? null,
      round: norm.round ?? prior.round,
      round_detail: norm.round_detail ?? null,
      fund_cost_usd: prior.fund_cost_usd,
      fund_fmv_usd: prior.fund_fmv_usd,
      fund_proceeds_usd: prior.fund_proceeds_usd,
      inherited_from_prior: true,
      carried_forward: true,
      inherited_cost: prior.fund_cost_usd != null && prior.fund_cost_usd > 0,
      inherited_fmv: prior.fund_fmv_usd != null && prior.fund_fmv_usd > 0,
      prior_round: prior.round,
      prior_instrument: prior.instrument,
      prior_cost_usd: prior.fund_cost_usd,
      prior_fmv_usd: prior.fund_fmv_usd,
      data_confidence: "inherited",
      review_reason: "Carried forward from prior quarter — not mentioned in current report",
    });
  }

  return enriched;
}
