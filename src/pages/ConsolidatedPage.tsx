import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveQuarter } from "@/hooks/usePortfolioData";
import { useConsolidatedMetrics, useChartData } from "@/hooks/useConsolidatedMetrics";
import { formatCurrency, formatMultiple, formatIrr } from "@/lib/calcEngine";
import { computeConsolidatedMetrics } from "@/lib/computeConsolidated";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConsolidatedPage() {
  const activeQuarter = useActiveQuarter();
  const cm = useConsolidatedMetrics();
  const chartData = useChartData();
  const qc = useQueryClient();

  const [recomputeOpen, setRecomputeOpen] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputedValues, setRecomputedValues] = useState<any>(null);

  // Build ledger from fund_level_cashflows
  const ledger = cm.currentQuarterRow ? [] : []; // Ledger now comes from allQuarters context

  // Recompute handler
  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const computed = await computeConsolidatedMetrics(activeQuarter.date);
      setRecomputedValues(computed);
      setRecomputeOpen(true);
    } catch (err: any) {
      toast.error(`Recompute failed: ${err.message}`);
    } finally {
      setRecomputing(false);
    }
  };

  const confirmRecompute = async () => {
    if (!recomputedValues) return;
    const { error } = await supabase.from("quarterly_history").upsert(
      {
        quarter: recomputedValues.quarter,
        quarter_date: recomputedValues.quarter_date,
        contribution: recomputedValues.contribution,
        distribution: recomputedValues.distribution,
        nav: recomputedValues.nav,
        net_tvpi: recomputedValues.net_tvpi,
        net_irr: recomputedValues.net_irr,
        gross_tvpi: recomputedValues.gross_tvpi,
        gross_irr: recomputedValues.gross_irr,
        total_commitment: recomputedValues.total_commitment,
        total_called: recomputedValues.total_called,
        total_distributed: recomputedValues.total_distributed,
        total_nav: recomputedValues.total_nav,
        unfunded: recomputedValues.unfunded,
        dpi: recomputedValues.dpi,
        rvpi: recomputedValues.rvpi,
        pic: recomputedValues.pic,
        computation_source: "auto_computed",
      } as any,
      { onConflict: "quarter_date" }
    );
    if (error) { toast.error(error.message); return; }

    // Log to audit_log
    await supabase.from("audit_log").insert({
      action: "recompute_metrics",
      target_table: "quarterly_history",
      quarter_date: recomputedValues.quarter_date,
      performed_by: "system",
      details: { previous: cm.currentQuarterRow, recomputed: recomputedValues },
    } as any);

    toast.success("Metrics recomputed and saved");
    setRecomputeOpen(false);
    setRecomputedValues(null);
    qc.invalidateQueries({ queryKey: ["consolidated-metrics-all"] });
    qc.invalidateQueries({ queryKey: ["quarterly-history"] });
  };

  // Custom tooltip
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12, padding: '6px 10px', borderRadius: 4 }}>
          <p style={{ fontWeight: 600, marginBottom: 2 }}>{label}</p>
          {payload.map((p: any) => (
            <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value != null ? `${p.value.toFixed(2)}x` : 'N/A'}</p>
          ))}
        </div>
      );
    }
    return null;
  };

  const sourceBadge = (source: string | null) => {
    if (!source) return null;
    const colors: Record<string, string> = {
      manual: "bg-muted text-muted-foreground",
      auto_computed: "bg-[hsl(var(--info))]/20 text-[hsl(var(--info))]",
      confirmed: "bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))]",
    };
    return (
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${colors[source] || colors.manual}`}>
        {source}
      </span>
    );
  };

  if (cm.isLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-[250px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">TWH Consolidated</h1>
          <p className="text-sm text-muted-foreground">
            Net cash flow ledger & performance summary · {activeQuarter.quarter}
            {cm.computationSource && <> · {sourceBadge(cm.computationSource)}</>}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRecompute}
          disabled={recomputing}
          className="gap-2"
        >
          {recomputing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Recompute Metrics
        </Button>
      </div>

      {/* Performance Metrics Header */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
        {[
          { label: "Net TVPI", value: cm.netTvpi > 0 ? formatMultiple(cm.netTvpi) : "—", highlight: true },
          { label: "Net IRR", value: cm.netIrr != null ? formatIrr(cm.netIrr) : "N/A", highlight: true },
          { label: "Gross TVPI", value: cm.grossTvpi > 0 ? formatMultiple(cm.grossTvpi) : "—" },
          { label: "Gross IRR", value: cm.grossIrr != null ? formatIrr(cm.grossIrr) : "N/A" },
          { label: "Total Contributed", value: formatCurrency(cm.totalCapitalCalls) },
          { label: "Total Distributions", value: formatCurrency(cm.totalDistributions) },
          { label: "Total NAV", value: formatCurrency(cm.totalNav) },
          { label: "Unrealized (FMV)", value: formatCurrency(cm.grossFmv) },
        ].map(m => (
          <div key={m.label} className={`border rounded-lg p-4 ${m.highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-lg font-mono font-semibold mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* TVPI Chart */}
      {chartData.length > 0 ? (
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-medium mb-4">TVPI Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} domain={[0, 'auto']} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="netTvpi" stroke="hsl(var(--primary))" name="Net TVPI" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="grossTvpi" stroke="hsl(var(--info))" name="Gross TVPI" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-6 bg-card text-center">
          <p className="text-sm text-muted-foreground">No historical data yet — migrate quarter data or lock quarters to build this chart.</p>
        </div>
      )}

      {/* Quarterly History Table */}
      {cm.allQuarters.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Quarterly History</h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-1 text-xs">
                  <TableHead>Quarter</TableHead>
                  <TableHead className="text-right">Net TVPI</TableHead>
                  <TableHead className="text-right">Net IRR</TableHead>
                  <TableHead className="text-right">Gross TVPI</TableHead>
                  <TableHead className="text-right">Gross IRR</TableHead>
                  <TableHead className="text-right">NAV</TableHead>
                  <TableHead className="text-right">Contributed</TableHead>
                  <TableHead className="text-center">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cm.allQuarters.map((q) => (
                  <TableRow key={q.id} className={`text-xs table-row-hover ${q.quarter === activeQuarter.quarter ? 'bg-primary/5' : ''}`}>
                    <TableCell className="font-medium">{q.quarter}</TableCell>
                    <TableCell className="text-right font-mono">{formatMultiple(q.net_tvpi)}</TableCell>
                    <TableCell className="text-right font-mono">{formatIrr(q.net_irr)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMultiple(q.gross_tvpi)}</TableCell>
                    <TableCell className="text-right font-mono">{formatIrr(q.gross_irr)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(q.nav)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(q.contribution)}</TableCell>
                    <TableCell className="text-center">{sourceBadge(q.computation_source)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Recompute Confirmation Dialog */}
      <Dialog open={recomputeOpen} onOpenChange={setRecomputeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recomputed Metrics — {activeQuarter.quarter}</DialogTitle>
          </DialogHeader>
          {recomputedValues && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Side-by-side comparison of current vs recomputed values:</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1">Metric</th>
                    <th className="text-right py-1">Current</th>
                    <th className="text-right py-1">Recomputed</th>
                    <th className="text-right py-1">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Net TVPI", cur: cm.netTvpi, rec: recomputedValues.net_tvpi, fmt: formatMultiple },
                    { label: "Net IRR", cur: cm.netIrr || 0, rec: recomputedValues.net_irr, fmt: formatIrr },
                    { label: "Gross TVPI", cur: cm.grossTvpi, rec: recomputedValues.gross_tvpi, fmt: formatMultiple },
                    { label: "Gross IRR", cur: cm.grossIrr || 0, rec: recomputedValues.gross_irr, fmt: formatIrr },
                    { label: "NAV", cur: cm.totalNav, rec: recomputedValues.nav, fmt: formatCurrency },
                    { label: "Contributed", cur: cm.totalCapitalCalls, rec: recomputedValues.contribution, fmt: formatCurrency },
                  ].map(row => {
                    const delta = row.rec - row.cur;
                    return (
                      <tr key={row.label} className="border-t border-border/20">
                        <td className="py-1.5 text-muted-foreground">{row.label}</td>
                        <td className="text-right font-mono">{row.fmt(row.cur)}</td>
                        <td className="text-right font-mono font-medium">{row.fmt(row.rec)}</td>
                        <td className={`text-right font-mono ${delta > 0 ? 'text-positive' : delta < 0 ? 'text-negative' : 'text-muted-foreground'}`}>
                          {delta !== 0 ? (delta > 0 ? '+' : '') + delta.toFixed(4) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecomputeOpen(false)}>Cancel</Button>
            <Button onClick={confirmRecompute} className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90">
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
