import { useState, useMemo, useCallback } from "react";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useUnderlyingPortfolio, useAllFundFS, useFunds } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, RefreshCw, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

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

// ─── Collapsible Section ──────────────────────────────────────────────

function Section({
  title, count, accentColor, defaultOpen = true, children,
}: {
  title: string; count: number; accentColor: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden border-l-[3px]", accentColor)}>
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
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────

function Badge({ label, variant = "default" }: { label: string; variant?: "default" | "green" | "red" | "yellow" }) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    green: "bg-emerald-500/15 text-emerald-400",
    red: "bg-red-500/15 text-red-400",
    yellow: "bg-amber-500/15 text-amber-400",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", colors[variant])}>
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const { selectedQuarter, availableQuarters } = useQuarterContext();
  const currentDate = selectedQuarter.date;
  const priorDate = getPriorQuarterDate(currentDate);
  const priorQuarter = availableQuarters.find(q => q.date === priorDate);
  const priorLabel = priorQuarter?.quarter ?? priorDate;

  // Data
  const { data: currentHoldings = [] } = useUnderlyingPortfolio(currentDate);
  const { data: priorHoldings = [] } = useUnderlyingPortfolio(priorDate);
  const { data: currentFS = [] } = useAllFundFS(currentDate);
  const { data: priorFS = [] } = useAllFundFS(priorDate);
  const { data: funds = [] } = useFunds();

  // AI Summary
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Computed diffs ──

  const priorMap = useMemo(() => {
    const m = new Map<string, typeof priorHoldings[0]>();
    priorHoldings.forEach(h => m.set(h.company_name, h));
    return m;
  }, [priorHoldings]);

  const currentMap = useMemo(() => {
    const m = new Map<string, typeof currentHoldings[0]>();
    currentHoldings.forEach(h => m.set(h.company_name, h));
    return m;
  }, [currentHoldings]);

  // 1. New additions
  const newAdditions = useMemo(() =>
    currentHoldings.filter(h => !priorMap.has(h.company_name)),
    [currentHoldings, priorMap]
  );

  // 2. Write-offs
  const writeOffs = useMemo(() =>
    currentHoldings.filter(h => {
      const prior = priorMap.get(h.company_name);
      if (!prior) return false;
      const wasActive = prior.twh_fmv > 0;
      const nowWrittenOff = h.twh_fmv === 0 && h.twh_cost > 0;
      return wasActive && nowWrittenOff;
    }),
    [currentHoldings, priorMap]
  );

  // 3. MOIC movers (delta > 0.1x)
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

  // 4. Fund NAV changes
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
      return {
        fundName: fundMap.get(fs.fund_id) ?? "Unknown",
        cost,
        priorFMV,
        currentFMV,
        deltaPct,
        significant: Math.abs(deltaPct) > 0.05,
      };
    });
  }, [currentFS, priorFS, funds]);

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

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">{selectedQuarter.quarter} Highlights</h1>
        <p className="text-xs text-muted-foreground">Quarterly portfolio digest</p>
      </div>

      {/* Comparison pill */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono bg-muted/60 text-muted-foreground px-2 py-1 rounded-full">
          Comparing {selectedQuarter.quarter} vs {priorLabel}
        </span>
      </div>

      {/* AI Summary Card */}
      <div className="rounded-lg border border-border bg-card/60 p-5 space-y-3" style={{ background: "hsl(var(--card) / 0.7)" }}>
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
          <div className="text-sm text-foreground/85 leading-relaxed prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        )}

        {!summaryLoading && !summary && (
          <p className="text-xs text-muted-foreground/60">
            Click "Generate" to create an AI-powered summary of this quarter's changes.
          </p>
        )}
      </div>

      {/* Section 1: New Additions */}
      <Section title="New Additions" count={newAdditions.length} accentColor="border-l-emerald-500">
        {newAdditions.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No new companies this quarter</p>
        ) : (
          newAdditions.map(h => (
            <div key={h.id} className="flex items-center gap-2 py-1.5">
              <span className="text-sm text-foreground">{h.company_name}</span>
              {h.type && <Badge label={h.type} variant="green" />}
              {h.theme && <Badge label={h.theme} />}
            </div>
          ))
        )}
      </Section>

      {/* Section 2: Write-offs */}
      <Section title="Write-offs" count={writeOffs.length} accentColor="border-l-red-500" defaultOpen={writeOffs.length > 0}>
        {writeOffs.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No write-offs this quarter</p>
        ) : (
          writeOffs.map(h => (
            <div key={h.id} className="flex items-center gap-2 py-1.5">
              <span className="text-sm text-foreground">{h.company_name}</span>
              {h.type && <Badge label={h.type} />}
              <Badge label="Write-off" variant="red" />
            </div>
          ))
        )}
      </Section>

      {/* Section 3: MOIC Movers */}
      <Section title="MOIC Movers" count={moicMovers.length} accentColor="border-l-amber-500" defaultOpen={moicMovers.length > 0}>
        {moicMovers.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No significant MOIC changes this quarter</p>
        ) : (
          <div className="space-y-1">
            {moicMovers.map(m => (
              <div key={m.name} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{m.name}</span>
                  {m.type && <Badge label={m.type} />}
                </div>
                <div className="flex items-center gap-2 text-sm font-mono">
                  <span className="text-muted-foreground">{m.priorMoic.toFixed(2)}x</span>
                  <span className="text-muted-foreground/40">→</span>
                  <span className="text-foreground">{m.currentMoic.toFixed(2)}x</span>
                  <span className={cn("flex items-center gap-0.5 text-xs font-semibold",
                    m.delta > 0 ? "text-emerald-400" : "text-red-400"
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

      {/* Section 4: Fund NAV Changes */}
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
                  f.deltaPct > 0.05 ? "text-emerald-400" : f.deltaPct < -0.05 ? "text-red-400" : "text-muted-foreground"
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

  if (newAdditions.length > 0)
    lines.push(`New additions (${newAdditions.length}): ${newAdditions.map(h => h.company_name).join(", ")}`);
  else
    lines.push("No new additions.");

  if (writeOffs.length > 0)
    lines.push(`Write-offs (${writeOffs.length}): ${writeOffs.map(h => h.company_name).join(", ")}`);
  else
    lines.push("No write-offs.");

  if (moicMovers.length > 0) {
    lines.push("Significant MOIC changes:");
    moicMovers.forEach(m => {
      lines.push(`  ${m.name}: ${m.priorMoic.toFixed(2)}x → ${m.currentMoic.toFixed(2)}x (${m.delta > 0 ? "+" : ""}${m.delta.toFixed(2)}x)`);
    });
  }

  if (fundNavChanges.length > 0) {
    lines.push("Fund NAV changes:");
    fundNavChanges.forEach(f => {
      lines.push(`  ${f.fundName}: FMV ${fmt(f.priorFMV)} → ${fmt(f.currentFMV)} (${f.deltaPct > 0 ? "+" : ""}${(f.deltaPct * 100).toFixed(1)}%)`);
    });
  }

  return lines.join("\n");
}
