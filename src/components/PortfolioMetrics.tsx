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
        <MetricCard label="Paid-In Capital" value={formatCurrency(m.grossPaidIn)} sub={formatPercent(m.pctCalled) + " called"} />
        <MetricCard label="Total Distributions" value={formatCurrency(m.grossDistributions)} />
      </div>
      {/* Row 2: Multiples */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Gross TVPI" value={formatMultiple(m.grossTvpi)} />
        <MetricCard label="Net TVPI" value={m.netNav > 0 ? formatMultiple(m.netTvpi) : "—"} />
        <MetricCard label="DPI" value={formatMultiple(m.dpi)} />
        <MetricCard label="RVPI" value={formatMultiple(m.rvpi)} />
        <MetricCard label="Total Commitment" value={formatCurrency(m.totalCommitment)} />
        <MetricCard label="Net Paid-In" value={m.netPaidIn > 0 ? formatCurrency(m.netPaidIn) : "—"} />
      </div>
    </div>
  );
};

export default PortfolioMetrics;
