import { useMemo } from "react"; // dashboard v2
import { useFunds, useDirectInvestments, useActiveQuarter } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple, formatPercent, formatIrr, computeFundMetrics } from "@/lib/calcEngine";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, Target, TrendingUp, DollarSign, Layers, Globe, Plus } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
  const navigate = useNavigate();
  const activeQuarter = useActiveQuarter();
  const { data: funds = [], isLoading } = useFunds();
  const { data: directs = [] } = useDirectInvestments();
  const cm = useConsolidatedMetrics();

  // Fetch all fund cashflows for per-fund metrics
  const { data: allCashflows = [] } = useQuery({
    queryKey: ["all-fund-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_cashflows").select("*").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allFS = [] } = useQuery({
    queryKey: ["all-fund-fs", activeQuarter.date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("*, fund:funds(*)")
        .eq("quarter_date", activeQuarter.date)
        .eq("confirmed", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  // Fund quarterly reports — primary source for per-fund TWH NAV
  const { data: fundQuarterlyReports = [] } = useQuery({
    queryKey: ["fund-quarterly-reports", activeQuarter.date],
    queryFn: async () => {
      if (!activeQuarter.date) return [];
      const { data, error } = await supabase
        .from("fund_quarterly_reports")
        .select("*")
        .eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  // Per-fund metrics (for fund table only)
  const fundMetrics = useMemo(() => {
    return funds.map((fund: any) => {
      const fs = allFS.find((f: any) => f.fund_id === fund.id);
      const fqr = fundQuarterlyReports.find((r: any) => r.fund_id === fund.id);
      const fsData = (fs?.extracted_data as any) || {};
      const fundTotals = fsData.fund_totals || {};
      const cashflows = allCashflows.filter((c: any) => c.fund_id === fund.id);

      const fqrNav = Number(fqr?.reported_nav || 0);

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

      // Override twhNav with FQR value if available (already TWH-level)
      if (fqrNav > 0) {
        metrics.twhNav = fqrNav;
        if (metrics.twhContributions > 0) {
          metrics.tvpi = (fqrNav + metrics.twhDistributions) / metrics.twhContributions;
          metrics.rvpi = fqrNav / metrics.twhContributions;
        }
      }

      return { fund, metrics, hasFS: !!fs?.confirmed || !!fqr };
    });
  }, [funds, allFS, allCashflows, fundQuarterlyReports, activeQuarter.date]);

  // Use consolidated metrics for top-level numbers
  const totalCommitment = funds.reduce((s: number, f: any) => s + Number(f.commitment_amount), 0);
  const numFunds = funds.length;
  const numDirects = directs.length;

  // Build breakdown helper
  const buildBreakdown = (field: string) => {
    const map: Record<string, number> = {};
    for (const f of funds) {
      const val = (f as any)[field] || "Other";
      map[val] = (map[val] || 0) + Number(f.commitment_amount);
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const themeData = useMemo(() => buildBreakdown("theme"), [funds]);
  const companyIndData = useMemo(() => buildBreakdown("company_industries"), [funds]);
  const targetIndData = useMemo(() => buildBreakdown("target_industries"), [funds]);
  const geoData = useMemo(() => buildBreakdown("geography"), [funds]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark size={20} />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">TWH Americas Fund I, LP · {activeQuarter.quarter} Overview</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-2 border-border" onClick={() => navigate("/add-quarterly-data")}>
          <Plus className="h-3.5 w-3.5" />
          Add Reports
        </Button>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Commitment" value={formatCurrency(totalCommitment + cm.directsCost)} icon={DollarSign} highlight />
        <MetricCard label="Fund Investments" value={formatCurrency(totalCommitment)} icon={Building2} sub={`${numFunds} funds`} />
        <MetricCard label="Direct Investments" value={cm.directsCost > 0 ? formatCurrency(cm.directsCost) : "—"} icon={Target} sub={`${numDirects} companies`} />
        <MetricCard label="Net TVPI" value={cm.netTvpi > 0 ? formatMultiple(cm.netTvpi) : "—"} highlight />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Contributed" value={cm.totalCapitalCalls > 0 ? formatCurrency(cm.totalCapitalCalls) : "—"} icon={TrendingUp} sub={cm.totalCapitalCalls > 0 ? `${formatPercent(cm.totalCapitalCalls / (totalCommitment + cm.directsCost))} deployed` : "No activity yet"} />
        <MetricCard label="TWH NAV" value={cm.totalNav > 0 ? formatCurrency(cm.totalNav) : "—"} icon={Layers} sub={cm.totalNav > 0 ? undefined : "Upload FS to populate"} />
        <MetricCard label="Distributions" value={cm.totalDistributions > 0 ? formatCurrency(cm.totalDistributions) : "—"} />
        <MetricCard label="Unrealized Value" value={cm.grossFmv > 0 ? formatCurrency(cm.grossFmv) : "—"} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Theme", data: themeData, offset: 0 },
          { title: "Company Industry(ies)", data: companyIndData, offset: 3 },
          { title: "Target Industry(ies)", data: targetIndData, offset: 6 },
          { title: "Geography Allocation", data: geoData, offset: 9 },
        ].map(({ title, data, offset }) => (
          <div key={title} className="border border-border rounded-lg p-4 bg-card">
            <h3 className="text-sm font-medium mb-3">{title}</h3>
            {data.length > 0 ? (
              <div className="flex flex-col items-center gap-3">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={58}
                      dataKey="value"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {data.map((_, i) => (
                        <Cell key={i} fill={COLORS[(i + offset) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-full space-y-1.5">
                  {data.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + offset) % COLORS.length] }} />
                      <span className="text-muted-foreground truncate flex-1">{s.name}</span>
                      <span className="font-mono text-foreground">{formatPercent(s.value / totalCommitment)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-xs text-muted-foreground">No data</p>}
          </div>
        ))}
      </div>

      {/* Fund Investments */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Fund Investments ({funds.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-1 text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Fund</th>
                <th className="text-left px-4 py-2 font-medium">Start Date</th>
                <th className="text-left px-4 py-2 font-medium">Theme</th>
                <th className="text-left px-4 py-2 font-medium">Geography</th>
                <th className="text-right px-4 py-2 font-medium">Vintage</th>
                <th className="text-right px-4 py-2 font-medium">Commitment</th>
                <th className="text-right px-4 py-2 font-medium">TWH %</th>
                <th className="text-right px-4 py-2 font-medium">% of Portfolio</th>
                <th className="text-right px-4 py-2 font-medium">TWH NAV</th>
                <th className="text-right px-4 py-2 font-medium">TVPI</th>
                <th className="text-center px-4 py-2 font-medium">FS</th>
              </tr>
            </thead>
            <tbody>
              {[...fundMetrics].sort((a, b) => {
                const aDate = a.fund.start_date || 'zzzz';
                const bDate = b.fund.start_date || 'zzzz';
                return aDate.localeCompare(bDate);
              }).map(({ fund, metrics, hasFS }: any) => (
                <tr key={fund.id} className="border-t border-border table-row-hover">
                  <td className="px-4 py-2 font-medium text-foreground">{fund.fund_name}</td>
                  <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{fund.start_date || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fund.theme || '—'}</td>
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
                <td colSpan={4} />
                <td className="px-4 py-2 text-right font-mono">{formatCurrency(totalCommitment)}</td>
                <td />
                <td className="px-4 py-2 text-right font-mono">100.0%</td>
                <td className="px-4 py-2 text-right font-mono">{cm.twhNavFromFunds > 0 ? formatCurrency(cm.twhNavFromFunds) : '—'}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Direct Investments */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Direct Investments ({directs.length})</h3>
        </div>
        {directs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-1 text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Company</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-left px-4 py-2 font-medium">Round</th>
                  <th className="text-left px-4 py-2 font-medium">Instrument</th>
                  <th className="text-left px-4 py-2 font-medium">Strategy</th>
                  <th className="text-left px-4 py-2 font-medium">Geography</th>
                  <th className="text-right px-4 py-2 font-medium">Cost Basis</th>
                  <th className="text-right px-4 py-2 font-medium">Ownership</th>
                  <th className="text-left px-4 py-2 font-medium">Co-Investors</th>
                </tr>
              </thead>
              <tbody>
                {[...directs].sort((a: any, b: any) => (a.investment_date || 'zzzz').localeCompare(b.investment_date || 'zzzz')).map((d: any) => (
                  <tr key={d.id} className="border-t border-border table-row-hover">
                    <td className="px-4 py-2 font-medium text-foreground">{d.company_name}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{d.investment_date || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.round || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.instrument || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.strategy || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.geography || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(Number(d.cost_basis))}</td>
                    <td className="px-4 py-2 text-right font-mono">{d.ownership_percentage ? formatPercent(Number(d.ownership_percentage)) : '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">{d.co_investors || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-1 font-medium">
                  <td className="px-4 py-2">Total ({directs.length} directs)</td>
                  <td colSpan={5} />
                  <td className="px-4 py-2 text-right font-mono">{formatCurrency(cm.directsCost)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">No direct investments yet</div>
        )}
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
