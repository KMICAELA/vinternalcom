import { useMemo, useState } from "react";
import { useFunds, useDirectInvestments, useActiveQuarter, useUnderlyingPortfolio } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { useConsolidatedMetrics, useFundQuarterMetrics } from "@/hooks/useConsolidatedMetrics";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, Target, TrendingUp, DollarSign, Layers, Plus, ChevronDown, ChevronRight } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Muted, sophisticated 8-color qualitative palette
const PALETTE = [
  "hsl(38, 70%, 55%)",   // amber
  "hsl(215, 55%, 50%)",  // blue
  "hsl(160, 45%, 45%)",  // emerald
  "hsl(175, 50%, 42%)",  // teal
  "hsl(265, 45%, 55%)",  // violet
  "hsl(12, 55%, 52%)",   // coral
  "hsl(200, 40%, 48%)",  // slate-blue
  "hsl(340, 40%, 50%)",  // muted-rose
];

const MUTED_GREY = "hsl(220, 10%, 35%)";

// Parent bucket mapping for target industries
const TARGET_PARENT_MAP: Record<string, string> = {
  "Health": "Health",
  "Energy & Utilities": "Energy",
  "Agriculture": "Agriculture",
  "Logistics & Transportation": "Logistics",
  "Goods & Services": "Goods & Services",
  "Aerospace & Defense": "Defense",
  "Built Environmnet": "Built Environment", // match data typo
  "D2C": "D2C",
  "Finance": "Finance",
  "Materials": "Materials",
  "Technology": "Technology",
};

function getParentBucket(sub: string): string {
  for (const [prefix, parent] of Object.entries(TARGET_PARENT_MAP)) {
    if (sub.startsWith(prefix)) return parent;
  }
  return "Other";
}

// ─── Donut with center label ────────────────────────────────────────
function DonutChart({ title, data, colors }: { title: string; data: { name: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const top = data[0];
  const topPct = total > 0 ? ((top?.value || 0) / total * 100).toFixed(1) : "0";

  return (
    <div className="analytics-card p-5 flex flex-col">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      <div className="flex flex-col items-center gap-4 flex-1">
        <div className="relative">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={72}
                dataKey="value"
                stroke="#0F1117"
                strokeWidth={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0];
                  return (
                    <div className="analytics-card px-3 py-2 text-xs">
                      <p className="font-medium text-foreground">{d.name}</p>
                      <p className="text-muted-foreground font-mono">{((d.value as number) / total * 100).toFixed(1)}%</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-semibold text-foreground font-mono">{topPct}%</span>
            <span className="text-[10px] text-muted-foreground max-w-[70px] text-center leading-tight truncate">{top?.name}</span>
          </div>
        </div>
        {/* Legend */}
        <div className="w-full space-y-1.5">
          {data.map((s, i) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-muted-foreground truncate flex-1">{s.name}</span>
              <span className="font-mono text-foreground/80">{(s.value / total * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Horizontal bar chart ───────────────────────────────────────────
function HBarChart({ title, data, groupOtherThreshold = 3 }: {
  title: string;
  data: { name: string; value: number }[];
  groupOtherThreshold?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const items: { name: string; value: number; pct: number }[] = [];
  let othersVal = 0;
  for (const d of data) {
    const pct = total > 0 ? (d.value / total) * 100 : 0;
    if (pct < groupOtherThreshold) {
      othersVal += d.value;
    } else {
      items.push({ ...d, pct });
    }
  }
  if (othersVal > 0) {
    items.push({ name: "Other", value: othersVal, pct: total > 0 ? (othersVal / total) * 100 : 0 });
  }
  const maxPct = Math.max(...items.map(i => i.pct), 1);

  return (
    <div className="analytics-card p-5 flex flex-col">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      <div className="space-y-2.5 flex-1">
        {items.map((item, i) => (
          <div key={item.name} className="group">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-[140px] shrink-0 truncate">{item.name}</span>
              <div className="flex-1 h-4 bg-[#12141C] rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${(item.pct / maxPct) * 100}%`,
                    backgroundColor: item.name === "Other" ? MUTED_GREY : PALETTE[i % PALETTE.length],
                  }}
                />
              </div>
              <span className="font-mono text-xs text-foreground/70 w-[40px] text-right shrink-0">{item.pct.toFixed(0)}%</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
      </div>
    </div>
  );
}

// ─── Expandable horizontal bar chart (Target Industries) ─────────
function ExpandableHBarChart({ title, data }: {
  title: string;
  data: { name: string; value: number }[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Group into parent buckets with subcategories
  const buckets: Record<string, { total: number; subs: { name: string; value: number }[] }> = {};
  for (const d of data) {
    const parent = getParentBucket(d.name);
    if (!buckets[parent]) buckets[parent] = { total: 0, subs: [] };
    buckets[parent].total += d.value;
    buckets[parent].subs.push(d);
  }

  const sorted = Object.entries(buckets).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = data.reduce((s, d) => s + d.value, 0);
  const maxPct = Math.max(...sorted.map(([, b]) => (b.total / grandTotal) * 100), 1);

  return (
    <div className="analytics-card p-5 flex flex-col">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      <div className="space-y-1.5 flex-1">
        {sorted.map(([parent, bucket], i) => {
          const pct = grandTotal > 0 ? (bucket.total / grandTotal) * 100 : 0;
          const isExpanded = expanded[parent];
          const hasSubs = bucket.subs.length > 1 || bucket.subs[0]?.name !== parent;
          return (
            <div key={parent}>
              <div
                className={cn("flex items-center gap-3 py-0.5", hasSubs && "cursor-pointer")}
                onClick={() => hasSubs && setExpanded(p => ({ ...p, [parent]: !p[parent] }))}
              >
                {hasSubs ? (
                  isExpanded
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : <div className="w-3 shrink-0" />}
                <span className="text-xs text-muted-foreground w-[120px] shrink-0 truncate">{parent}</span>
                <div className="flex-1 h-4 bg-[#12141C] rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{
                      width: `${(pct / maxPct) * 100}%`,
                      backgroundColor: PALETTE[i % PALETTE.length],
                    }}
                  />
                </div>
                <span className="font-mono text-xs text-foreground/70 w-[40px] text-right shrink-0">{pct.toFixed(0)}%</span>
              </div>
              {isExpanded && (
                <div className="ml-6 mt-1 mb-2 space-y-1 border-l border-border/30 pl-3">
                  {bucket.subs.sort((a, b) => b.value - a.value).map(sub => {
                    const subPct = grandTotal > 0 ? (sub.value / grandTotal) * 100 : 0;
                    return (
                      <div key={sub.name} className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground/70 w-[120px] shrink-0 truncate">{sub.name.replace(/^[^-]+ - /, '')}</span>
                        <div className="flex-1 h-2.5 bg-[#12141C] rounded-sm overflow-hidden">
                          <div
                            className="h-full rounded-sm"
                            style={{
                              width: `${Math.max(subPct, 1)}%`,
                              backgroundColor: PALETTE[i % PALETTE.length],
                              opacity: 0.6,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-foreground/50 w-[36px] text-right shrink-0">{subPct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
      </div>
    </div>
  );
}

// ─── Metric Card ────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon: Icon, highlight }: {
  label: string; value: string; sub?: string; icon?: any; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "analytics-card p-4",
      highlight && "ring-1 ring-[hsl(38,70%,55%)]/20"
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
  const { data: fqm } = useFundQuarterMetrics(activeQuarter.date);
  const fundNAVs = fqm?.fundNAVs || {};
  const fundTVPIs = fqm?.fundTVPIs || {};

  // All funds are active (no registry filter needed)
  const activeFunds = funds;
  const numFunds = activeFunds.length;
  const numDirects = directs.length;

  const totalCommitment = cm.totalCommitment > 0 ? cm.totalCommitment : funds.reduce((s: number, f: any) => s + Number(f.commitment_amount), 0) + directs.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);

  const buildHoldingsCount = (field: string) => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      const raw = (h as any)[field] as string;
      if (!raw) continue;
      const parts = raw.split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const part of parts) map[part] = (map[part] || 0) + 1;
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0F1117" }}>
      {/* Header */}
      <div className="max-w-[1400px] mx-auto px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark size={22} />
          <div>
            <h1 className="text-lg font-semibold text-foreground">TWH Americas Fund I, LP</h1>
            <p className="text-xs text-muted-foreground">{activeQuarter.quarter} · Portfolio Analytics</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-2 border-border" onClick={() => navigate("/add-quarterly-data")}>
          <Plus className="h-3.5 w-3.5" />
          Add Reports
        </Button>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 pb-6 space-y-5">
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

        {/* Top Row: 3 Donut Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DonutChart
            title="Investment Type"
            data={typeData}
            colors={[PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[6], PALETTE[7]]}
          />
          <DonutChart
            title="Portfolio Theme"
            data={themeData}
            colors={[PALETTE[3], PALETTE[4], PALETTE[5], PALETTE[0], PALETTE[7]]}
          />
          <DonutChart
            title="Geography"
            data={geoData}
            colors={[PALETTE[1], PALETTE[2], PALETTE[0], PALETTE[6], PALETTE[5], PALETTE[3]]}
          />
        </div>

        {/* Bottom Row: 2 Industry Bar Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HBarChart
            title="Industries — WHAT IS"
            data={companyIndData}
            groupOtherThreshold={3}
          />
          <ExpandableHBarChart
            title="Industries — TO WHOM"
            data={targetIndData}
          />
        </div>

        {/* Fund Investments Table */}
        <div className="analytics-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/20">
            <h3 className="text-sm font-medium text-foreground">Fund Investments ({activeFunds.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground" style={{ backgroundColor: "#12141C" }}>
                  <th className="text-left px-4 py-2.5 font-medium">Fund</th>
                  <th className="text-left px-4 py-2.5 font-medium">Start Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Theme</th>
                  <th className="text-left px-4 py-2.5 font-medium">Geography</th>
                  <th className="text-right px-4 py-2.5 font-medium">Vintage</th>
                  <th className="text-right px-4 py-2.5 font-medium">Commitment</th>
                  <th className="text-right px-4 py-2.5 font-medium">TWH %</th>
                  <th className="text-right px-4 py-2.5 font-medium">% of Portfolio</th>
                  <th className="text-right px-4 py-2.5 font-medium">TWH NAV</th>
                  <th className="text-right px-4 py-2.5 font-medium">TVPI</th>
                  <th className="text-center px-4 py-2.5 font-medium">FS</th>
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
                    <tr key={fund.id} className="border-t border-border/10 hover:bg-[#1E2130] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{fund.fund_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{fund.start_date || '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fund.theme || '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fund.geography || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fund.vintage_year || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(Number(fund.commitment_amount))}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatPercent(Number(fund.ownership_percentage))}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatPercent(Number(fund.commitment_amount) / (fundCommitmentTotal || 1))}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{nav > 0 ? formatCurrency(nav) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{tvpi != null && tvpi > 0 ? formatMultiple(tvpi) : '—'}</td>
                      <td className="px-4 py-2.5 text-center">
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
                <tr className="border-t border-border/20 font-medium" style={{ backgroundColor: "#12141C" }}>
                  <td className="px-4 py-2.5">Total ({activeFunds.length} funds)</td>
                  <td colSpan={4} />
                  <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(fundCommitmentTotal)}</td>
                  <td />
                  <td className="px-4 py-2.5 text-right font-mono">100.0%</td>
                  <td className="px-4 py-2.5 text-right font-mono">{cm.twhNavFromFunds > 0 ? formatCurrency(cm.twhNavFromFunds) : '—'}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Direct Investments Table */}
        <div className="analytics-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/20">
            <h3 className="text-sm font-medium text-foreground">Direct Investments ({numDirects})</h3>
          </div>
          {qData && qData.activeDirects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground" style={{ backgroundColor: "#12141C" }}>
                    <th className="text-left px-4 py-2.5 font-medium">Company</th>
                    <th className="text-right px-4 py-2.5 font-medium">TWH Cost</th>
                    <th className="text-right px-4 py-2.5 font-medium">FMV</th>
                    <th className="text-right px-4 py-2.5 font-medium">MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {qData.activeDirects.map((d, i) => {
                    const moic = d.cost > 0 ? d.fmv / d.cost : 0;
                    return (
                      <tr key={i} className="border-t border-border/10 hover:bg-[#1E2130] transition-colors">
                        <td className="px-4 py-2.5 font-medium text-foreground">{d.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(d.cost)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(d.fmv)}</td>
                        <td className={cn("px-4 py-2.5 text-right font-mono font-medium", moic >= 1 ? "text-[hsl(var(--positive))]" : "text-[hsl(var(--negative))]")}>
                          {moic > 0 ? formatMultiple(moic) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/20 font-medium" style={{ backgroundColor: "#12141C" }}>
                    <td className="px-4 py-2.5">Total ({numDirects} directs)</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(qData.directsCost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(qData.directsFMV)}</td>
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
        <footer className="pt-4 pb-8">
          <p className="text-[10px] text-muted-foreground text-center">
            TWH Americas Fund I, LP · {activeQuarter.quarter} · Confidential
          </p>
        </footer>
      </div>
    </div>
  );
}
