import { useMemo } from "react";
import { useFunds, useAllFundFS, useDirectInvestments, useActiveQuarter } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple, formatPercent, computeFundMetrics } from "@/lib/calcEngine";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Building2, Target, TrendingUp, DollarSign, Layers, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = [
  "hsl(45, 90%, 55%)",   // gold
  "hsl(210, 70%, 55%)",  // blue
  "hsl(145, 60%, 45%)",  // green
  "hsl(280, 60%, 55%)",  // purple
  "hsl(15, 80%, 55%)",   // orange
  "hsl(190, 70%, 45%)",  // teal
  "hsl(340, 65%, 55%)",  // pink
  "hsl(60, 70%, 50%)",   // yellow
  "hsl(170, 50%, 45%)",  // cyan
  "hsl(240, 50%, 55%)",  // indigo
  "hsl(0, 60%, 55%)",    // red
];

function MetricCard({ label, value, sub, icon: Icon, highlight }: {
  label: string; value: string; sub?: string; icon?: any; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      highlight ? "border-primary/30 bg-primary/5 metric-glow" : "border-border bg-card"
    )}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-xl font-semibold font-mono text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const activeQuarter = useActiveQuarter();
  const { data: funds = [], isLoading } = useFunds();
  const { data: allFS = [] } = useAllFundFS(activeQuarter.date);
  const { data: directs = [] } = useDirectInvestments();

  // Fetch all fund cashflows for metrics
  const { data: allCashflows = [] } = useQuery({
    queryKey: ["all-fund-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_cashflows").select("*").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  // Per-fund metrics
  const fundMetrics = useMemo(() => {
    return funds.map((fund: any) => {
      const fs = allFS.find((f: any) => f.fund_id === fund.id);
      const fsData = (fs?.extracted_data as any) || {};
      const fundTotals = fsData.fund_totals || {};
      const cashflows = allCashflows.filter((c: any) => c.fund_id === fund.id);

      const metrics = computeFundMetrics({
        twhCommitment: Number(fund.commitment_amount),
        totalFundCommitment: Number(fundTotals.total_commitment || 0),
        totalInvestmentCost: Number(fundTotals.total_investment_cost || 0),
        totalPortfolioFmv: Number(fundTotals.total_portfolio_fmv || 0),
        fundNav: Number(fundTotals.fund_nav || 0),
        capitalActivity: cashflows.map((c: any) => ({
          date: c.cashflow_date,
          type: c.cashflow_type || 'Capital Call — Investment',
          amount: Number(c.capital_deployed || 0) + Number(c.distribution_received || 0),
        })),
        reportDate: activeQuarter.date,
      });

      return { fund, metrics, hasFS: !!fs?.confirmed };
    });
  }, [funds, allFS, allCashflows, activeQuarter.date]);

  // Aggregates
  const totalCommitment = funds.reduce((s: number, f: any) => s + Number(f.commitment_amount), 0);
  const totalContributions = fundMetrics.reduce((s, fm) => s + fm.metrics.twhContributions, 0);
  const totalNav = fundMetrics.reduce((s, fm) => s + fm.metrics.twhNav, 0);
  const totalFmv = fundMetrics.reduce((s, fm) => s + fm.metrics.twhFmv, 0);
  const totalDistributions = fundMetrics.reduce((s, fm) => s + fm.metrics.twhDistributions, 0);
  const directsCost = directs.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);
  const numFunds = funds.length;
  const numDirects = directs.length;

  // Strategy breakdown
  const strategyData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of funds) {
      const strategy = (f as any).strategy || "Other";
      map[strategy] = (map[strategy] || 0) + Number(f.commitment_amount);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [funds]);

  // Geography breakdown
  const geoData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of funds) {
      const geo = (f as any).geography || "Other";
      map[geo] = (map[geo] || 0) + Number(f.commitment_amount);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [funds]);

  // Fund allocation data (for bar chart)
  const fundAllocation = useMemo(() => {
    return funds.map((f: any) => ({
      name: f.fund_name.length > 20 ? f.fund_name.substring(0, 18) + "…" : f.fund_name,
      commitment: Number(f.commitment_amount),
    })).sort((a: any, b: any) => b.commitment - a.commitment);
  }, [funds]);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded px-3 py-2 text-xs">
          <p className="font-medium">{payload[0].name}</p>
          <p className="font-mono text-muted-foreground">{formatCurrency(payload[0].value)}</p>
          <p className="text-muted-foreground">{formatPercent(payload[0].value / totalCommitment)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">TWH Americas Fund I, LP · {activeQuarter.quarter} Overview</p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Commitment" value={formatCurrency(totalCommitment)} icon={DollarSign} highlight />
        <MetricCard label="Fund Investments" value={String(numFunds)} icon={Building2} sub={`${numDirects} directs`} />
        <MetricCard label="Contributed" value={totalContributions > 0 ? formatCurrency(totalContributions) : "—"} icon={TrendingUp} sub={totalContributions > 0 ? `${formatPercent(totalContributions / totalCommitment)} deployed` : "No capital activity yet"} />
        <MetricCard label="TWH NAV" value={totalNav > 0 ? formatCurrency(totalNav) : "—"} icon={Layers} sub={totalNav > 0 ? undefined : "Upload FS to populate"} />
        <MetricCard label="Directs Invested" value={directsCost > 0 ? formatCurrency(directsCost) : "—"} icon={Target} />
        <MetricCard label="Net TVPI" value={totalContributions > 0 ? formatMultiple((totalNav + totalDistributions) / totalContributions) : "—"} highlight />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Strategy Allocation */}
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-medium mb-3">Strategy Allocation</h3>
          {strategyData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={strategyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    dataKey="value"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {strategyData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {strategyData.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground truncate flex-1">{s.name}</span>
                    <span className="font-mono text-foreground">{formatPercent(s.value / totalCommitment)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">No fund data</p>}
        </div>

        {/* Geography Allocation */}
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-medium mb-3">Geography Allocation</h3>
          {geoData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={geoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    dataKey="value"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {geoData.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {geoData.map((g, i) => (
                  <div key={g.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                    <span className="text-muted-foreground truncate flex-1">{g.name}</span>
                    <span className="font-mono text-foreground">{formatPercent(g.value / totalCommitment)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">No fund data</p>}
        </div>

        {/* Fund Commitments Bar Chart */}
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-medium mb-3">Commitment by Fund</h3>
          {fundAllocation.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={fundAllocation} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                />
                <Bar dataKey="commitment" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-muted-foreground">No fund data</p>}
        </div>
      </div>

      {/* Fund Summary Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Fund Exposure Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-1 text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Fund</th>
                <th className="text-left px-4 py-2 font-medium">Strategy</th>
                <th className="text-left px-4 py-2 font-medium">Geography</th>
                <th className="text-right px-4 py-2 font-medium">Vintage</th>
                <th className="text-right px-4 py-2 font-medium">Commitment</th>
                <th className="text-right px-4 py-2 font-medium">TWH %</th>
                <th className="text-right px-4 py-2 font-medium">% of Fund</th>
                <th className="text-right px-4 py-2 font-medium">TWH NAV</th>
                <th className="text-right px-4 py-2 font-medium">TVPI</th>
                <th className="text-center px-4 py-2 font-medium">FS Status</th>
              </tr>
            </thead>
            <tbody>
              {fundMetrics.map(({ fund, metrics, hasFS }: any) => (
                <tr key={fund.id} className="border-t border-border table-row-hover">
                  <td className="px-4 py-2 font-medium text-foreground">{fund.fund_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fund.strategy || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fund.geography || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{fund.vintage_year || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatCurrency(Number(fund.commitment_amount))}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPercent(Number(fund.ownership_percentage))}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPercent(Number(fund.commitment_amount) / totalCommitment)}</td>
                  <td className="px-4 py-2 text-right font-mono">{metrics.twhNav > 0 ? formatCurrency(metrics.twhNav) : '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{metrics.tvpi > 0 ? formatMultiple(metrics.tvpi) : '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={cn(
                      "inline-block w-2 h-2 rounded-full",
                      hasFS ? "bg-[hsl(var(--positive))]" : "bg-[hsl(var(--muted-foreground))]"
                    )} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-1 font-medium">
                <td className="px-4 py-2">Total ({funds.length} funds)</td>
                <td colSpan={3} />
                <td className="px-4 py-2 text-right font-mono">{formatCurrency(totalCommitment)}</td>
                <td />
                <td className="px-4 py-2 text-right font-mono">100.0%</td>
                <td className="px-4 py-2 text-right font-mono">{totalNav > 0 ? formatCurrency(totalNav) : '—'}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border pt-4 pb-8">
        <p className="text-[10px] text-muted-foreground text-center">
          TWH Americas Fund I, LP · {activeQuarter.quarter} · Confidential
        </p>
      </footer>
    </div>
  );
}
