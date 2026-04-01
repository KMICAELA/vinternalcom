import { useMemo } from "react"; // dashboard v2
import { useFunds, useDirectInvestments, useActiveQuarter, useUnderlyingPortfolio } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { getQuarterData } from "@/data/quarterRegistry";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, Target, TrendingUp, DollarSign, Layers, Plus } from "lucide-react";
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
  const { data: holdings = [] } = useUnderlyingPortfolio(activeQuarter.date);
  const cm = useConsolidatedMetrics();
  const qData = getQuarterData(activeQuarter.quarter);

  // Filter funds to those active in the registry for this quarter
  const activeFunds = useMemo(() => {
    if (!qData) return [];
    return funds.filter((f: any) => qData.activeFunds.includes(f.fund_name));
  }, [funds, qData]);

  // Filter directs to those active in the registry
  const activeDirects = useMemo(() => {
    if (!qData) return [];
    const activeNames = new Set(qData.activeDirects.map(d => d.name));
    return directs.filter((d: any) => activeNames.has(d.company_name));
  }, [directs, qData]);

  const totalCommitment = qData?.totalCommitment ?? 0;
  const numFunds = activeFunds.length;
  const numDirects = qData?.activeDirects.length ?? 0;

  // Build holdings-level breakdown by counting occurrences (split multi-value fields)
  const buildHoldingsCount = (field: string) => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      const raw = (h as any)[field] as string;
      if (!raw) continue;
      const parts = raw.split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const part of parts) {
        map[part] = (map[part] || 0) + 1;
      }
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const typeData = useMemo(() => buildHoldingsCount("type"), [holdings]);
  const themeData = useMemo(() => buildHoldingsCount("theme"), [holdings]);
  const companyIndData = useMemo(() => buildHoldingsCount("company_industries"), [holdings]);
  const targetIndData = useMemo(() => buildHoldingsCount("target_industries"), [holdings]);
  const geoData = useMemo(() => buildHoldingsCount("region"), [holdings]);

  const fundCommitmentTotal = activeFunds.reduce((s: number, f: any) => s + Number(f.commitment_amount), 0);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const makeCountTooltip = (total: number) => ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded px-3 py-2 text-xs">
          <p className="font-medium">{payload[0].name}</p>
          <p className="font-mono text-muted-foreground">{payload[0].value} occurrences</p>
          <p className="text-muted-foreground">{formatPercent(payload[0].value / (total || 1))}</p>
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
        <MetricCard label="Total Commitment" value={formatCurrency(totalCommitment)} icon={DollarSign} highlight />
        <MetricCard label="Fund Investments" value={formatCurrency(fundCommitmentTotal)} icon={Building2} sub={`${numFunds} funds`} />
        <MetricCard label="Direct Investments" value={qData && qData.directsCost > 0 ? formatCurrency(qData.directsCost) : "—"} icon={Target} sub={`${numDirects} companies`} />
        <MetricCard label="Net TVPI" value={cm.netTvpi > 0 ? formatMultiple(cm.netTvpi) : "—"} highlight />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Contributed" value={cm.totalCapitalCalls > 0 ? formatCurrency(cm.totalCapitalCalls) : "—"} icon={TrendingUp} sub={cm.totalCapitalCalls > 0 ? `${formatPercent(cm.totalCapitalCalls / (totalCommitment || 1))} deployed` : "No activity yet"} />
        <MetricCard label="TWH NAV" value={cm.totalNav > 0 ? formatCurrency(cm.totalNav) : "—"} icon={Layers} />
        <MetricCard label="Distributions" value={cm.totalDistributions > 0 ? formatCurrency(cm.totalDistributions) : "—"} />
        <MetricCard label="Unrealized Value" value={cm.grossFmv > 0 ? formatCurrency(cm.grossFmv) : "—"} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { title: "Type", data: typeData, offset: 0 },
          { title: "Theme", data: themeData, offset: 2 },
          { title: "Company Industry(ies) - WHAT IS?", data: companyIndData, offset: 4 },
          { title: "Target Industry(ies) - TO WHOM?", data: targetIndData, offset: 6 },
          { title: "Geography Allocation", data: geoData, offset: 8 },
        ].map(({ title, data, offset }) => {
          const total = data.reduce((s, d) => s + d.value, 0);
          return (
            <div key={title} className="border border-border rounded-lg p-4 bg-card">
              <h3 className="text-sm font-medium mb-3">{title}</h3>
              {data.length > 0 ? (
                <div className="flex flex-col items-center gap-3">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={58} dataKey="value" stroke="hsl(var(--background))" strokeWidth={2}>
                        {data.map((_, i) => (
                          <Cell key={i} fill={COLORS[(i + offset) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={makeCountTooltip(total)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full space-y-1.5">
                    {data.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + offset) % COLORS.length] }} />
                        <span className="text-muted-foreground truncate flex-1">{s.name}</span>
                        <span className="font-mono text-foreground">{formatPercent(s.value / (total || 1))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground">No data</p>}
            </div>
          );
        })}
      </div>

      {/* Fund Investments */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Fund Investments ({activeFunds.length})</h3>
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
              {[...activeFunds].sort((a: any, b: any) => {
                const aDate = a.start_date || 'zzzz';
                const bDate = b.start_date || 'zzzz';
                return aDate.localeCompare(bDate);
              }).map((fund: any) => {
                const nav = qData?.fundNAVs[fund.fund_name] ?? 0;
                const tvpi = qData?.fundTVPIs[fund.fund_name] ?? null;
                const isActive = qData?.activeFunds.includes(fund.fund_name);
                return (
                  <tr key={fund.id} className="border-t border-border table-row-hover">
                    <td className="px-4 py-2 font-medium text-foreground">{fund.fund_name}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{fund.start_date || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fund.theme || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fund.geography || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{fund.vintage_year || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(Number(fund.commitment_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatPercent(Number(fund.ownership_percentage))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatPercent(Number(fund.commitment_amount) / (fundCommitmentTotal || 1))}</td>
                    <td className="px-4 py-2 text-right font-mono">{nav > 0 ? formatCurrency(nav) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{tvpi != null && tvpi > 0 ? formatMultiple(tvpi) : '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn(
                        "inline-block w-2 h-2 rounded-full",
                        isActive ? "bg-[hsl(var(--positive))]" : "bg-[hsl(var(--muted-foreground))]"
                      )} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-1 font-medium">
                <td className="px-4 py-2">Total ({activeFunds.length} funds)</td>
                <td colSpan={4} />
                <td className="px-4 py-2 text-right font-mono">{formatCurrency(fundCommitmentTotal)}</td>
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
          <h3 className="text-sm font-medium">Direct Investments ({numDirects})</h3>
        </div>
        {qData && qData.activeDirects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-1 text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Company</th>
                  <th className="text-right px-4 py-2 font-medium">TWH Cost</th>
                  <th className="text-right px-4 py-2 font-medium">FMV</th>
                  <th className="text-right px-4 py-2 font-medium">MOIC</th>
                </tr>
              </thead>
              <tbody>
                {qData.activeDirects.map((d, i) => {
                  const moic = d.cost > 0 ? d.fmv / d.cost : 0;
                  return (
                    <tr key={i} className="border-t border-border table-row-hover">
                      <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(d.cost)}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(d.fmv)}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-medium", moic >= 1 ? "text-positive" : "text-negative")}>
                        {moic > 0 ? formatMultiple(moic) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-1 font-medium">
                  <td className="px-4 py-2">Total ({numDirects} directs)</td>
                  <td className="px-4 py-2 text-right font-mono">{formatCurrency(qData.directsCost)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatCurrency(qData.directsFMV)}</td>
                  <td />
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
