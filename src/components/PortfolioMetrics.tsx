import { PortfolioMetrics as Metrics, formatCurrency, formatMultiple, formatPercent } from "@/lib/calcEngine";

interface Props {
  metrics: Metrics;
}

const MetricCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className="text-xl font-semibold font-mono text-foreground">{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
  </div>
);

const PortfolioMetrics = ({ metrics: m }: Props) => {
  return (
    <div className="space-y-4 mb-6">
      {/* Row 1: NAV & Capital */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Gross NAV" value={formatCurrency(m.grossNav)} />
        <MetricCard label="Net NAV" value={m.netNav > 0 ? formatCurrency(m.netNav) : "—"} />
        <MetricCard label="Gross Paid-In" value={formatCurrency(m.grossPaidIn)} sub={formatPercent(m.pctCalled) + " called"} />
        <MetricCard label="LP Paid-In" value={m.lpPaidIn > 0 ? formatCurrency(m.lpPaidIn) : "—"} />
      </div>
      {/* Row 2: Multiples */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Gross TVPI" value={formatMultiple(m.grossTvpi)} sub={`DPI ${formatMultiple(m.grossDpi)} + RVPI ${formatMultiple(m.grossRvpi)}`} />
        <MetricCard label="Net TVPI" value={m.lpPaidIn > 0 ? formatMultiple(m.netTvpi) : "—"} sub={m.lpPaidIn > 0 ? `DPI ${formatMultiple(m.netDpi)} + RVPI ${formatMultiple(m.netRvpi)}` : undefined} />
        <MetricCard label="Gross Distributions" value={formatCurrency(m.grossDistributions)} />
        <MetricCard label="LP Distributions" value={m.lpDistributions > 0 ? formatCurrency(m.lpDistributions) : "—"} />
        <MetricCard label="Total Commitment" value={formatCurrency(m.totalCommitment)} />
        <MetricCard label="% Called" value={formatPercent(m.pctCalled)} />
      </div>
    </div>
  );
};

export default PortfolioMetrics;
