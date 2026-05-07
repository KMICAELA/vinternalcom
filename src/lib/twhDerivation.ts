// Option 3: derive TWH-share metrics from fund-level totals × ownership %
// when the report doesn't carry TWH-specific allocations (typical for GP
// financial statements without a PCAP).
//
// A value is considered "missing TWH allocation" when twh_*_usd is null OR 0
// AND the corresponding fund_total_*_usd is positive.

export type FundSnapshotInputs = {
  twh_contributions_usd: number | null | undefined;
  twh_distributions_usd: number | null | undefined;
  twh_nav_usd: number | null | undefined;
  fund_total_contributions_usd: number | null | undefined;
  fund_total_distributions_usd: number | null | undefined;
  fund_total_nav_usd: number | null | undefined;
};

export type DerivedTwh = {
  contributions: number;
  distributions: number;
  nav: number;
  estimated: boolean;
  estimatedFields: Array<"contributions" | "distributions" | "nav">;
};

const num = (v: number | null | undefined) => (v == null ? 0 : Number(v));

export function deriveTwhWithFallback(
  snap: FundSnapshotInputs | null | undefined,
  ownershipPct: number,
): DerivedTwh {
  const out: DerivedTwh = {
    contributions: num(snap?.twh_contributions_usd),
    distributions: num(snap?.twh_distributions_usd),
    nav: num(snap?.twh_nav_usd),
    estimated: false,
    estimatedFields: [],
  };
  if (!snap || !ownershipPct) return out;

  const fc = num(snap.fund_total_contributions_usd);
  const fd = num(snap.fund_total_distributions_usd);
  const fn = num(snap.fund_total_nav_usd);

  if (out.contributions === 0 && fc > 0) {
    out.contributions = fc * ownershipPct;
    out.estimatedFields.push("contributions");
  }
  if (out.distributions === 0 && fd > 0) {
    out.distributions = fd * ownershipPct;
    out.estimatedFields.push("distributions");
  }
  if (out.nav === 0 && fn > 0) {
    out.nav = fn * ownershipPct;
    out.estimatedFields.push("nav");
  }
  out.estimated = out.estimatedFields.length > 0;
  return out;
}
