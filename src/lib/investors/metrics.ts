import xirr from "xirr";

export type InvestorSnapshot = {
  quarter_id: string;
  quarter_end_date: string; // YYYY-MM-DD
  contribution_amount: number;
  contribution_date: string | null;
  distribution_amount: number;
  distribution_date: string | null;
  nav_amount: number;
};

export type InvestorMetrics = {
  totalContributed: number;
  totalDistributed: number;
  currentNav: number;
  tvpi: number | null;
  irr: number | null;
};

const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export function computeInvestorMetrics(snapshots: InvestorSnapshot[]): InvestorMetrics {
  let totalContributed = 0;
  let totalDistributed = 0;

  for (const s of snapshots) {
    totalContributed += Number(s.contribution_amount) || 0;
    totalDistributed += Number(s.distribution_amount) || 0;
  }

  // Latest quarter (by quarter_end_date) that has any data drives current NAV
  const withData = snapshots
    .filter((s) => (Number(s.nav_amount) || 0) !== 0 || (Number(s.contribution_amount) || 0) !== 0 || (Number(s.distribution_amount) || 0) !== 0)
    .sort((a, b) => b.quarter_end_date.localeCompare(a.quarter_end_date));
  const latest = withData[0];
  const currentNav = latest ? Number(latest.nav_amount) || 0 : 0;

  const tvpi = totalContributed > 0 ? (totalDistributed + currentNav) / totalContributed : null;

  // Build cash-flow series for XIRR
  const flows: { amount: number; when: Date }[] = [];
  for (const s of snapshots) {
    const c = Number(s.contribution_amount) || 0;
    if (c > 0) {
      flows.push({
        amount: -c,
        when: parseLocalDate(s.contribution_date ?? s.quarter_end_date),
      });
    }
    const d = Number(s.distribution_amount) || 0;
    if (d > 0) {
      flows.push({
        amount: d,
        when: parseLocalDate(s.distribution_date ?? s.quarter_end_date),
      });
    }
  }
  if (currentNav > 0 && latest) {
    flows.push({ amount: currentNav, when: parseLocalDate(latest.quarter_end_date) });
  }

  let irr: number | null = null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (hasNeg && hasPos && flows.length >= 2) {
    try {
      irr = xirr(flows);
    } catch {
      irr = null;
    }
  }

  return { totalContributed, totalDistributed, currentNav, tvpi, irr };
}
