// ─── Types ───────────────────────────────────────────────────────────

export interface FundMetrics {
  twhPct: number;
  twhContributions: number;
  twhDistributions: number;
  twhCost: number;
  twhFmv: number;
  twhNav: number;
  pic: number;
  rvpi: number;
  dpi: number;
  tvpi: number;
  moic: number;
  irr: number | null;
}

export interface ConsolidatedMetrics {
  netTvpi: number;
  netIrr: number | null;
  grossTvpi: number;
  grossIrr: number | null;
  totalContributed: number;
  totalDistributions: number;
  totalNav: number;
  totalTwhCost: number;
  totalTwhFmv: number;
}

export interface PortfolioMetrics {
  grossNav: number;
  grossPaidIn: number;
  grossDistributions: number;
  grossTvpi: number;
  grossDpi: number;
  grossRvpi: number;
  lpPaidIn: number;
  lpDistributions: number;
  netNav: number;
  netTvpi: number;
  netDpi: number;
  netRvpi: number;
  totalCommitment: number;
  pctCalled: number;
}

// ─── XIRR (Newton-Raphson) ───────────────────────────────────────────

interface CashFlow {
  date: Date;
  amount: number;
}

function daysBetween(d1: Date, d2: Date): number {
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
}

function xnpv(rate: number, cashflows: CashFlow[]): number {
  const d0 = cashflows[0].date;
  return cashflows.reduce((sum, cf) => {
    const years = daysBetween(d0, cf.date) / 365;
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

function xnpvDerivative(rate: number, cashflows: CashFlow[]): number {
  const d0 = cashflows[0].date;
  return cashflows.reduce((sum, cf) => {
    const years = daysBetween(d0, cf.date) / 365;
    return sum + (-years * cf.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

export function computeXIRR(cashflows: CashFlow[], guess = 0.1, maxIter = 100, tol = 1e-7): number | null {
  if (cashflows.length < 2) return null;
  const hasPos = cashflows.some(cf => cf.amount > 0);
  const hasNeg = cashflows.some(cf => cf.amount < 0);
  if (!hasPos || !hasNeg) return null;

  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    const npv = xnpv(rate, cashflows);
    const dnpv = xnpvDerivative(rate, cashflows);
    if (Math.abs(dnpv) < 1e-12) break;
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
    if (rate < -0.99) rate = -0.5;
    if (rate > 10) rate = 5;
  }
  // Final check
  if (Math.abs(xnpv(rate, cashflows)) < 1) return rate;
  return null;
}

// ─── Fund-Level Metrics (Layer 1 + 2) ─────────────────────────────

export function computeFundMetrics(params: {
  twhCommitment: number;
  totalFundCommitment: number; // from FS
  totalInvestmentCost: number; // from FS
  totalPortfolioFmv: number;  // from FS
  fundNav: number;            // from FS
  capitalActivity: { date: string; type: string; amount: number }[];
  reportDate: string;
  // From fund_quarterly_reports (primary source when FS not available)
  reportNav?: number;
  reportCalled?: number;
  reportDist?: number;
  // From funds table — fallback ownership percentage
  ownershipPct?: number;
}): FundMetrics {
  const { twhCommitment, totalFundCommitment, totalInvestmentCost, totalPortfolioFmv, fundNav, capitalActivity, reportDate, reportNav, reportCalled, reportDist, ownershipPct } = params;

  // TWH %: prefer FS-derived, fallback to funds.ownership_percentage
  const twhPct = totalFundCommitment > 0
    ? twhCommitment / totalFundCommitment
    : (ownershipPct != null && ownershipPct > 0 ? ownershipPct : 0);
  const hasTwhPct = twhPct > 0;

  const twhContributions = capitalActivity
    .filter(c => c.type.startsWith('Capital Call'))
    .reduce((s, c) => s + c.amount, 0);

  const twhDistributions = capitalActivity
    .filter(c => c.type === 'Distribution')
    .reduce((s, c) => s + c.amount, 0);

  const twhCost = totalInvestmentCost * twhPct;
  const twhFmv = totalPortfolioFmv * twhPct;
  
  // TWH NAV: prefer quarterly report nav (already TWH-level), fall back to FS-derived
  const fsNav = fundNav * twhPct;
  const twhNav = (reportNav != null && reportNav > 0) ? reportNav : fsNav;

  // Contributions: prefer reportCalled (authoritative cumulative), fallback to ledger sum
  const effectiveContributions = (reportCalled != null && reportCalled > 0) ? reportCalled : twhContributions;
  // Distributions: prefer reportDist, fallback to ledger sum
  const effectiveDistributions = (reportDist != null && reportDist > 0) ? reportDist : twhDistributions;

  const pic = twhCommitment > 0 ? effectiveContributions / twhCommitment : 0;
  const rvpi = effectiveContributions > 0 ? twhNav / effectiveContributions : 0;
  const dpi = effectiveContributions > 0 ? effectiveDistributions / effectiveContributions : 0;
  const tvpi = effectiveContributions > 0 ? (twhNav + effectiveDistributions) / effectiveContributions : 0;
  const moic = twhCost > 0 ? twhFmv / twhCost : 0;

  // XIRR
  const xirrCashflows: CashFlow[] = [];
  for (const ca of capitalActivity) {
    const amt = ca.type.startsWith('Capital Call') ? -ca.amount : ca.amount;
    xirrCashflows.push({ date: new Date(ca.date), amount: amt });
  }
  if (twhNav > 0 && reportDate) {
    xirrCashflows.push({ date: new Date(reportDate), amount: twhNav });
  }
  xirrCashflows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const irr = computeXIRR(xirrCashflows);

  return { twhPct, twhContributions: effectiveContributions, twhDistributions: effectiveDistributions, twhCost, twhFmv, twhNav, pic, rvpi, dpi, tvpi, moic, irr };
}

// ─── Legacy computeMetrics (kept for backward compat) ──────────────

export function computeMetrics(params: {
  fundReports: { capital_called_to_date: number; distributions_to_date: number; reported_nav: number }[];
  directValuations: { current_valuation: number; realized_proceeds_this_quarter: number }[];
  directCosts: number[];
  lpCashflows: { type: string; amount: number }[];
  lpNav: number;
  totalCommitment: number;
}): PortfolioMetrics {
  const { fundReports, directValuations, directCosts, lpCashflows, lpNav, totalCommitment } = params;
  const fundNav = fundReports.reduce((s, r) => s + Number(r.reported_nav), 0);
  const directNav = directValuations.reduce((s, v) => s + Number(v.current_valuation), 0);
  const grossNav = fundNav + directNav;
  const fundCalled = fundReports.reduce((s, r) => s + Number(r.capital_called_to_date), 0);
  const directCostTotal = directCosts.reduce((s, c) => s + c, 0);
  const grossPaidIn = fundCalled + directCostTotal;
  const fundDist = fundReports.reduce((s, r) => s + Number(r.distributions_to_date), 0);
  const directProceeds = directValuations.reduce((s, v) => s + Number(v.realized_proceeds_this_quarter), 0);
  const grossDistributions = fundDist + directProceeds;
  const grossTvpi = grossPaidIn > 0 ? (grossDistributions + grossNav) / grossPaidIn : 0;
  const grossDpi = grossPaidIn > 0 ? grossDistributions / grossPaidIn : 0;
  const grossRvpi = grossPaidIn > 0 ? grossNav / grossPaidIn : 0;
  const lpPaidIn = lpCashflows.filter(c => c.type === 'capital_call').reduce((s, c) => s + Number(c.amount), 0);
  const lpDistributions = lpCashflows.filter(c => c.type === 'distribution').reduce((s, c) => s + Number(c.amount), 0);
  const netNav = lpNav;
  const netTvpi = lpPaidIn > 0 ? (lpDistributions + netNav) / lpPaidIn : 0;
  const netDpi = lpPaidIn > 0 ? lpDistributions / lpPaidIn : 0;
  const netRvpi = lpPaidIn > 0 ? netNav / lpPaidIn : 0;
  const pctCalled = totalCommitment > 0 ? grossPaidIn / totalCommitment : 0;
  return { grossNav, grossPaidIn, grossDistributions, grossTvpi, grossDpi, grossRvpi, lpPaidIn, lpDistributions, netNav, netTvpi, netDpi, netRvpi, totalCommitment, pctCalled };
}

// ─── Formatting ──────────────────────────────────────────────────────

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || value === 0) return '—';
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    formatted = `$${Math.round(abs).toLocaleString('en-US')}`;
  } else {
    formatted = `$${Math.round(abs).toLocaleString('en-US')}`;
  }
  return value < 0 ? `(${formatted})` : formatted;
}

export function formatMultiple(value: number | null | undefined): string {
  if (value == null || value === 0) return '—';
  return `${value.toFixed(2)}x`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatIrr(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}
