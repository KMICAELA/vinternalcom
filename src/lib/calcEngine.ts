export interface PortfolioMetrics {
  grossNav: number;
  grossPaidIn: number;
  grossDistributions: number;
  grossTvpi: number;
  dpi: number;
  rvpi: number;
  netPaidIn: number;
  netDistributions: number;
  netNav: number;
  netTvpi: number;
  totalCommitment: number;
  pctCalled: number;
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
  const dpi = grossPaidIn > 0 ? grossDistributions / grossPaidIn : 0;
  const rvpi = grossPaidIn > 0 ? grossNav / grossPaidIn : 0;

  const netPaidIn = lpCashflows.filter(c => c.type === 'capital_call').reduce((s, c) => s + Number(c.amount), 0);
  const netDistributions = lpCashflows.filter(c => c.type === 'distribution').reduce((s, c) => s + Number(c.amount), 0);
  const netNav = lpNav;
  const netTvpi = netPaidIn > 0 ? (netDistributions + netNav) / netPaidIn : 0;
  const pctCalled = totalCommitment > 0 ? grossPaidIn / totalCommitment : 0;

  return { grossNav, grossPaidIn, grossDistributions, grossTvpi, dpi, rvpi, netPaidIn, netDistributions, netNav, netTvpi, totalCommitment, pctCalled };
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
