import { useState, useMemo, useCallback } from "react";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useUnderlyingPortfolio, useAllFundFS, useFunds } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, RefreshCw, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────

function getPriorQuarterDate(date: string): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() - 3);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function fmt(n: number, decimals = 1): string {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  return `$${n.toFixed(decimals)}`;
}

function moic(cost: number, fmv: number): number {
  return cost > 0 ? fmv / cost : 0;
}

function titleCase(s: string): string {
  if (!s) return s;
  // Detect all-caps entries longer than 5 chars as needing normalization
  if (s === s.toUpperCase() && s.length > 5) {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return s;
}

const VEHICLE_KEYWORDS = ["SPV", "LP", "FUND", "PARTNERS", "CAPITAL", "VENTURES", "HOLDINGS"];
function isVehicle(name: string): boolean {
  const upper = name.toUpperCase();
  return VEHICLE_KEYWORDS.filter(k => upper.includes(k)).length >= 2;
}

function countField(items: any[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  items.forEach(h => {
    const val = h[field];
    if (val) {
      val.split(",").map((s: string) => s.trim()).filter(Boolean).forEach((v: string) => {
        counts[v] = (counts[v] || 0) + 1;
      });
    }
  });
  return counts;
}

// ─── Stat Tile ────────────────────────────────────────────────────────

function StatTile({ label, value, delta, deltaLabel }: {
  label: string; value: string | number; delta?: number; deltaLabel?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-[hsl(228,15%,13%)] p-4 space-y-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
      <p className="text-xl font-semibold text-foreground font-mono">{value}</p>
      {delta !== undefined && (
        <div className={cn("flex items-center gap-1 text-[11px] font-medium",
          positive ? "text-teal-400" : "text-[hsl(0,72%,65%)]"
        )}>
          {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          <span>{positive ? "+" : ""}{typeof delta === "number" && !deltaLabel ? delta : ""}{deltaLabel ?? ""}</span>
        </div>
      )}
    </div>
  );
}

// ─── Stacked Bar ──────────────────────────────────────────────────────

function StackedBar({ label, data }: { label: string; data: { name: string; pct: number; color: string }[] }) {
  if (data.length === 0) return null;
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex h-5 rounded-md overflow-hidden">
        {data.map(d => (
          <div key={d.name} className="relative group" style={{ width: `${d.pct}%`, backgroundColor: d.color, minWidth: d.pct > 0 ? 2 : 0 }}>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[9px] font-semibold text-white drop-shadow-sm">{d.pct.toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {data.map(d => (
          <span key={d.name} className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name} {d.pct.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Tag Pills ────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  "Deep Tech": "bg-blue-500/15 text-blue-400",
  "Tech Based": "bg-amber-500/15 text-amber-400",
  "Tech Enabled": "bg-emerald-500/15 text-emerald-400",
};

function TypePill({ label }: { label: string }) {
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", TYPE_COLORS[label] ?? "bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}

function ThemePill({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
      {label}
    </span>
  );
}

// ─── Collapsible Section ──────────────────────────────────────────────

function Section({
  title, count, accentColor, defaultOpen = true, children,
}: {
  title: string; count: number; accentColor: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-border/50 bg-card overflow-hidden border-l-[3px]", accentColor)}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{count}</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4 space-y-1">{children}</div>}
    </div>
  );
}

// ─── Bar colors for stacked bars ──────────────────────────────────────

const TYPE_BAR_COLORS: Record<string, string> = {
  "Deep Tech": "hsl(217, 70%, 55%)",
  "Tech Based": "hsl(38, 75%, 55%)",
  "Tech Enabled": "hsl(155, 60%, 45%)",
};

const THEME_BAR_COLORS: Record<string, string> = {
  "2·IPI": "hsl(174, 55%, 45%)",
  "1·FTSF": "hsl(262, 50%, 55%)",
  "3·CD": "hsl(12, 65%, 55%)",
};

// ─── Page ─────────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const { selectedQuarter, availableQuarters } = useQuarterContext();
  const currentDate = selectedQuarter.date;
  const priorDate = getPriorQuarterDate(currentDate);
  const priorQuarter = availableQuarters.find(q => q.date === priorDate);
  const priorLabel = priorQuarter?.quarter ?? priorDate;

  const { data: currentHoldings = [] } = useUnderlyingPortfolio(currentDate);
  const { data: priorHoldings = [] } = useUnderlyingPortfolio(priorDate);
  const { data: currentFS = [] } = useAllFundFS(currentDate);
  const { data: priorFS = [] } = useAllFundFS(priorDate);
  const { data: funds = [] } = useFunds();

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showAllAdditions, setShowAllAdditions] = useState(false);

  // ── Computed diffs ──

  const priorMap = useMemo(() => {
    const m = new Map<string, typeof priorHoldings[0]>();
    priorHoldings.forEach(h => m.set(h.company_name, h));
    return m;
  }, [priorHoldings]);

  const newAdditions = useMemo(() =>
    currentHoldings.filter(h => !priorMap.has(h.company_name)),
    [currentHoldings, priorMap]
  );

  const writeOffs = useMemo(() =>
    currentHoldings.filter(h => {
      const prior = priorMap.get(h.company_name);
      if (!prior) return false;
      return prior.twh_fmv > 0 && h.twh_fmv === 0 && h.twh_cost > 0;
    }),
    [currentHoldings, priorMap]
  );

  const moicMovers = useMemo(() => {
    const movers: { name: string; priorMoic: number; currentMoic: number; delta: number; type: string; theme: string }[] = [];
    currentHoldings.forEach(h => {
      const prior = priorMap.get(h.company_name);
      if (!prior || prior.twh_cost === 0 || h.twh_cost === 0) return;
      const cm = moic(h.twh_cost, h.twh_fmv + h.twh_proceeds);
      const pm = moic(prior.twh_cost, prior.twh_fmv + prior.twh_proceeds);
      const delta = cm - pm;
      if (Math.abs(delta) > 0.1)
        movers.push({ name: h.company_name, priorMoic: pm, currentMoic: cm, delta, type: h.type ?? "", theme: h.theme ?? "" });
    });
    movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return movers;
  }, [currentHoldings, priorMap]);

  const fundNavChanges = useMemo(() => {
    const fundMap = new Map(funds.map(f => [f.id, f.fund_name]));
    const priorFSMap = new Map(priorFS.map((fs: any) => [fs.fund_id, fs]));
    return currentFS.map((fs: any) => {
      const ed = fs.extracted_data as any;
      const priorEntry = priorFSMap.get(fs.fund_id) as any;
      const priorEd = priorEntry?.extracted_data as any;
      const currentFMV = ed?.fund_totals?.fmv ?? 0;
      const priorFMV = priorEd?.fund_totals?.fmv ?? 0;
      const cost = ed?.fund_totals?.investment_cost ?? 0;
      const deltaPct = priorFMV > 0 ? (currentFMV - priorFMV) / priorFMV : 0;
      return { fundName: fundMap.get(fs.fund_id) ?? "Unknown", cost, priorFMV, currentFMV, deltaPct, significant: Math.abs(deltaPct) > 0.05 };
    });
  }, [currentFS, priorFS, funds]);

  // ── Layer 1 stats ──

  const snapshotStats = useMemo(() => {
    const currentCount = currentHoldings.length;
    const priorCount = priorHoldings.length;
    const netChange = currentCount - priorCount;
    const netPct = priorCount > 0 ? ((netChange / priorCount) * 100) : 0;

    // Theme breakdown
    const themes = countField(currentHoldings, "theme");
    const topTheme = Object.entries(themes).sort((a, b) => b[1] - a[1])[0];

    // Geography shift
    const curGeo = countField(currentHoldings, "region");
    const priorGeo = countField(priorHoldings, "region");
    const allGeos = new Set([...Object.keys(curGeo), ...Object.keys(priorGeo)]);
    let biggestShiftGeo = "";
    let biggestShiftDelta = 0;
    allGeos.forEach(g => {
      const curPct = (curGeo[g] || 0) / (currentCount || 1) * 100;
      const prPct = (priorGeo[g] || 0) / (priorCount || 1) * 100;
      const d = curPct - prPct;
      if (Math.abs(d) > Math.abs(biggestShiftDelta)) { biggestShiftDelta = d; biggestShiftGeo = g; }
    });

    return { currentCount, priorCount, netChange, netPct, topTheme, biggestShiftGeo, biggestShiftDelta };
  }, [currentHoldings, priorHoldings]);

  // ── Layer 2 distribution bars ──

  const additionBars = useMemo(() => {
    const types = countField(newAdditions, "type");
    const themes = countField(newAdditions, "theme");
    const total = newAdditions.length || 1;

    const typeData = Object.entries(types).map(([name, count]) => ({
      name, pct: (count / total) * 100, color: TYPE_BAR_COLORS[name] ?? "hsl(0,0%,40%)",
    })).sort((a, b) => b.pct - a.pct);

    const themeData = Object.entries(themes).map(([name, count]) => ({
      name, pct: (count / total) * 100, color: THEME_BAR_COLORS[name] ?? "hsl(0,0%,40%)",
    })).sort((a, b) => b.pct - a.pct);

    return { typeData, themeData };
  }, [newAdditions]);

  // ── AI Summary ──

  const generateSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummary(null);
    try {
      const context = buildDigestContext({
        selectedQuarter, priorLabel, currentHoldings, priorHoldings,
        newAdditions, writeOffs, moicMovers, fundNavChanges,
      });
      const { data, error } = await supabase.functions.invoke("portfolio-digest", {
        body: { context },
      });
      if (error) throw error;
      setSummary(data.summary);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedQuarter, priorLabel, currentHoldings, priorHoldings, newAdditions, writeOffs, moicMovers, fundNavChanges]);

  // ── Render ──

  const PREVIEW_COUNT = 3;
  const visibleAdditions = showAllAdditions ? newAdditions : newAdditions.slice(0, PREVIEW_COUNT);

  return (
    <div className="p-6 max-w-[860px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{selectedQuarter.quarter} Highlights</h1>
          <p className="text-xs text-muted-foreground">Quarterly portfolio digest</p>
        </div>
        <span className="text-[10px] font-mono bg-muted/60 text-muted-foreground px-2 py-1 rounded-full">
          Comparing {selectedQuarter.quarter} vs {priorLabel}
        </span>
      </div>

      {/* ─── Layer 1: Snapshot Bar ─── */}
      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="New Additions"
          value={newAdditions.length}
          delta={newAdditions.length}
          deltaLabel={`${newAdditions.length} new`}
        />
        <StatTile
          label="Active Themes"
          value={snapshotStats.topTheme ? snapshotStats.topTheme[0] : "—"}
          delta={Object.keys(countField(currentHoldings, "theme")).length - Object.keys(countField(priorHoldings, "theme")).length}
          deltaLabel={`${Object.keys(countField(currentHoldings, "theme")).length} themes`}
        />
        <StatTile
          label="Top Geo Shift"
          value={snapshotStats.biggestShiftGeo || "—"}
          delta={snapshotStats.biggestShiftDelta}
          deltaLabel={`${Math.abs(snapshotStats.biggestShiftDelta).toFixed(1)}%`}
        />
        <StatTile
          label="Net Portfolio Δ"
          value={`${snapshotStats.netChange >= 0 ? "+" : ""}${snapshotStats.netChange}`}
          delta={snapshotStats.netPct}
          deltaLabel={`${Math.abs(snapshotStats.netPct).toFixed(1)}% vs prior`}
        />
      </div>

      {/* ─── AI Summary (between Layer 1 & 2) ─── */}
      <div className="rounded-xl border border-border/40 p-5 space-y-3" style={{ background: "hsl(228, 15%, 14%)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Quarter Summary</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={generateSummary}
            disabled={summaryLoading}
            className="text-xs gap-1.5 h-7"
          >
            <RefreshCw className={cn("h-3 w-3", summaryLoading && "animate-spin")} />
            {summaryLoading ? "Generating…" : summary ? "Regenerate" : "Generate"}
          </Button>
        </div>

        {summaryLoading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
            <div className="h-3 bg-muted rounded w-4/6" />
          </div>
        )}

        {!summaryLoading && summary && (
          <p className="text-sm text-foreground/85 leading-relaxed">{summary}</p>
        )}

        {!summaryLoading && !summary && (
          <p className="text-xs text-muted-foreground/60">
            Click "Generate" for an AI-powered digest of this quarter's changes.
          </p>
        )}
      </div>

      {/* ─── Layer 2: Type & Theme distribution of new additions ─── */}
      {newAdditions.length > 0 && (
        <div className="rounded-xl bg-[hsl(228,15%,13%)] p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-3">New Additions Breakdown</p>
          <div className="flex gap-6">
            <StackedBar label="By Type" data={additionBars.typeData} />
            <StackedBar label="By Theme" data={additionBars.themeData} />
          </div>
        </div>
      )}

      {/* ─── Layer 3: Collapsible company list (new additions) ─── */}
      <Section title="New Additions" count={newAdditions.length} accentColor="border-l-emerald-500" defaultOpen={false}>
        {newAdditions.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No new companies this quarter</p>
        ) : (
          <>
            {visibleAdditions.map(h => {
              const vehicle = isVehicle(h.company_name);
              const displayName = vehicle ? "Vehicle" : titleCase(h.company_name);
              return (
                <div key={h.id} className="flex items-center gap-2 py-1.5">
                  <span className={cn("text-sm", vehicle ? "text-muted-foreground italic" : "text-foreground")}>{displayName}</span>
                  {h.type && <TypePill label={h.type} />}
                  {h.theme && h.theme.split(",").map((t: string) => t.trim()).filter(Boolean).map((t: string) => (
                    <ThemePill key={t} label={t} />
                  ))}
                  {vehicle && <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/40 px-1 py-0.5 rounded">Vehicle</span>}
                </div>
              );
            })}
            {!showAllAdditions && newAdditions.length > PREVIEW_COUNT && (
              <button
                onClick={() => setShowAllAdditions(true)}
                className="text-xs text-primary hover:text-primary/80 transition-colors mt-1 font-medium"
              >
                Show all {newAdditions.length} →
              </button>
            )}
            {showAllAdditions && newAdditions.length > PREVIEW_COUNT && (
              <button
                onClick={() => setShowAllAdditions(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                Collapse
              </button>
            )}
          </>
        )}
      </Section>

      {/* ─── Write-offs ─── */}
      <Section title="Write-offs" count={writeOffs.length} accentColor="border-l-red-500" defaultOpen={writeOffs.length > 0}>
        {writeOffs.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No write-offs this quarter</p>
        ) : (
          writeOffs.map(h => (
            <div key={h.id} className="flex items-center gap-2 py-1.5">
              <span className="text-sm text-foreground">{titleCase(h.company_name)}</span>
              {h.type && <TypePill label={h.type} />}
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Write-off</span>
            </div>
          ))
        )}
      </Section>

      {/* ─── MOIC Movers ─── */}
      <Section title="MOIC Movers" count={moicMovers.length} accentColor="border-l-amber-500" defaultOpen={moicMovers.length > 0}>
        {moicMovers.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No significant MOIC changes this quarter</p>
        ) : (
          <div className="space-y-1">
            {moicMovers.map(m => (
              <div key={m.name} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{titleCase(m.name)}</span>
                  {m.type && <TypePill label={m.type} />}
                </div>
                <div className="flex items-center gap-2 text-sm font-mono">
                  <span className="text-muted-foreground">{m.priorMoic.toFixed(2)}x</span>
                  <span className="text-muted-foreground/40">→</span>
                  <span className="text-foreground">{m.currentMoic.toFixed(2)}x</span>
                  <span className={cn("flex items-center gap-0.5 text-xs font-semibold",
                    m.delta > 0 ? "text-teal-400" : "text-[hsl(0,72%,65%)]"
                  )}>
                    {m.delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {m.delta > 0 ? "+" : ""}{m.delta.toFixed(2)}x
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ─── Fund NAV Changes ─── */}
      <Section title="Fund NAV Changes" count={fundNavChanges.length} accentColor="border-l-yellow-500">
        {fundNavChanges.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No fund data available</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-5 gap-2 text-[10px] uppercase text-muted-foreground tracking-wide pb-1 border-b border-border/50">
              <span className="col-span-1">Fund</span>
              <span className="text-right">TWH Cost</span>
              <span className="text-right">Prior FMV</span>
              <span className="text-right">Current FMV</span>
              <span className="text-right">Δ</span>
            </div>
            {fundNavChanges.map(f => (
              <div key={f.fundName} className={cn(
                "grid grid-cols-5 gap-2 py-1.5 text-sm",
                f.significant && "bg-amber-500/5 -mx-2 px-2 rounded"
              )}>
                <span className="col-span-1 text-foreground truncate">{f.fundName}</span>
                <span className="text-right text-muted-foreground font-mono text-xs">{fmt(f.cost)}</span>
                <span className="text-right text-muted-foreground font-mono text-xs">{fmt(f.priorFMV)}</span>
                <span className="text-right text-foreground font-mono text-xs">{fmt(f.currentFMV)}</span>
                <span className={cn(
                  "text-right font-mono text-xs font-semibold",
                  f.deltaPct > 0.05 ? "text-teal-400" : f.deltaPct < -0.05 ? "text-[hsl(0,72%,65%)]" : "text-muted-foreground"
                )}>
                  {f.deltaPct > 0 ? "+" : ""}{(f.deltaPct * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Build AI context string ──────────────────────────────────────────

function buildDigestContext(params: {
  selectedQuarter: { quarter: string; date: string };
  priorLabel: string;
  currentHoldings: any[];
  priorHoldings: any[];
  newAdditions: any[];
  writeOffs: any[];
  moicMovers: any[];
  fundNavChanges: any[];
}) {
  const { selectedQuarter, priorLabel, currentHoldings, priorHoldings, newAdditions, writeOffs, moicMovers, fundNavChanges } = params;
  const lines: string[] = [];
  lines.push(`Reporting period: ${selectedQuarter.quarter} vs ${priorLabel}`);
  lines.push(`Active companies this quarter: ${currentHoldings.length} (prior: ${priorHoldings.length})`);
  if (newAdditions.length > 0) lines.push(`New additions (${newAdditions.length}): ${newAdditions.map(h => h.company_name).join(", ")}`);
  else lines.push("No new additions.");
  if (writeOffs.length > 0) lines.push(`Write-offs (${writeOffs.length}): ${writeOffs.map(h => h.company_name).join(", ")}`);
  else lines.push("No write-offs.");
  if (moicMovers.length > 0) {
    lines.push("Significant MOIC changes:");
    moicMovers.forEach(m => lines.push(`  ${m.name}: ${m.priorMoic.toFixed(2)}x → ${m.currentMoic.toFixed(2)}x (${m.delta > 0 ? "+" : ""}${m.delta.toFixed(2)}x)`));
  }
  if (fundNavChanges.length > 0) {
    lines.push("Fund NAV changes:");
    fundNavChanges.forEach(f => lines.push(`  ${f.fundName}: FMV ${fmt(f.priorFMV)} → ${fmt(f.currentFMV)} (${f.deltaPct > 0 ? "+" : ""}${(f.deltaPct * 100).toFixed(1)}%)`));
  }
  return lines.join("\n");
}
