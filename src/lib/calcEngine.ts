export interface PortfolioMetrics {
  grossNav: number;
  grossPaidIn: number;       // sum of fund capital_called + direct cost bases
  grossDistributions: number;
  grossTvpi: number;         // (grossDistributions + grossNav) / grossPaidIn
  grossDpi: number;          // grossDistributions / grossPaidIn
  grossRvpi: number;         // grossNav / grossPaidIn
  lpPaidIn: number;          // sum of LP capital_call cashflows
  lpDistributions: number;   // sum of LP distribution cashflows
  netNav: number;            // from portfolio snapshot
  netTvpi: number;           // (lpDistributions + netNav) / lpPaidIn
  netDpi: number;            // lpDistributions / lpPaidIn
  netRvpi: number;           // netNav / lpPaidIn
  totalCommitment: number;
  pctCalled: number;         // grossPaidIn / totalCommitment
}

export function computeMetrics(params: {
  fundReports: { capital_called_to_date: number; distributions_to_date: number; reported_nav: number }[];
  directValuations: { current_valuation: number; realized_proceeds_this_quarter: number }[];
  directCosts: number[];
  lpCashflows: { type: string; amount: number }[];
  lpNav: number;
  totalCommitment: number;
}): PortfolioMetrics {
  const { fundReports, directValuations, directCosts, lpCashflows, lpNav, totalCommitment } = params;

  // --- Gross layer (underlying funds + directs) ---
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

  // Validation: TVPI must equal DPI + RVPI (within rounding tolerance)
  if (grossPaidIn > 0 && Math.abs(grossTvpi - (grossDpi + grossRvpi)) > 0.0001) {
    console.warn('[calcEngine] Gross TVPI validation failed: TVPI !== DPI + RVPI', { grossTvpi, grossDpi, grossRvpi });
  }

  // --- LP / Net layer ---
  const lpPaidIn = lpCashflows.filter(c => c.type === 'capital_call').reduce((s, c) => s + Number(c.amount), 0);
  const lpDistributions = lpCashflows.filter(c => c.type === 'distribution').reduce((s, c) => s + Number(c.amount), 0);
  const netNav = lpNav;
  // Net TVPI = (LP Distributions + Net NAV) / LP Paid-In
  const netTvpi = lpPaidIn > 0 ? (lpDistributions + netNav) / lpPaidIn : 0;
  const netDpi = lpPaidIn > 0 ? lpDistributions / lpPaidIn : 0;
  const netRvpi = lpPaidIn > 0 ? netNav / lpPaidIn : 0;

  if (lpPaidIn > 0 && Math.abs(netTvpi - (netDpi + netRvpi)) > 0.0001) {
    console.warn('[calcEngine] Net TVPI validation failed: TVPI !== DPI + RVPI', { netTvpi, netDpi, netRvpi });
  }

  const pctCalled = totalCommitment > 0 ? grossPaidIn / totalCommitment : 0;

  return {
    grossNav, grossPaidIn, grossDistributions, grossTvpi, grossDpi, grossRvpi,
    lpPaidIn, lpDistributions, netNav, netTvpi, netDpi, netRvpi,
    totalCommitment, pctCalled,
  };
}

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
