import { useMemo } from "react";
import { useActiveQuarter, useQuarterlyHistory } from "@/hooks/usePortfolioData";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatMultiple, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function ConsolidatedPage() {
  const activeQuarter = useActiveQuarter();
  const { data: quarterlyHistory = [] } = useQuarterlyHistory();
  const cm = useConsolidatedMetrics();

  // Fetch LP-level cashflows for ledger display (actual wires)
  const { data: lpCashflows = [] } = useQuery({
    queryKey: ["lp-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_level_cashflows").select("*").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  // Build ledger from LP-level wires
  const ledger = useMemo(() => {
    const entries: any[] = [];
    for (const cf of lpCashflows as any[]) {
      const isCall = cf.type === "capital_call";
      const amount = Number(cf.amount || 0);
      entries.push({
        date: cf.cashflow_date,
        source: cf.portfolio_name || cf.description || '—',
        type: isCall ? 'Capital Call' : 'Distribution',
        contribution: isCall ? amount : 0,
        distribution: !isCall ? amount : 0,
        net_cf: isCall ? -amount : amount,
      });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }, [lpCashflows]);

  // Chart data from quarterly history — only show locked quarters with real data
  const lockedQuarters = quarterlyHistory.filter((q: any) => q.locked);
  const chartData = lockedQuarters.map((q: any) => ({
    quarter: q.quarter,
    netTvpi: Number(q.net_tvpi),
    grossTvpi: Number(q.gross_tvpi),
  }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">TWH Consolidated</h1>
        <p className="text-sm text-muted-foreground">Net cash flow ledger & performance summary · {activeQuarter.quarter}</p>
      </div>

      {/* Performance Metrics Header */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
        {[
          { label: "Net TVPI", value: formatMultiple(cm.netTvpi), highlight: true },
          { label: "Net IRR", value: formatIrr(cm.netIrr), highlight: true },
          { label: "Gross TVPI", value: formatMultiple(cm.grossTvpi) },
          { label: "Gross IRR", value: formatIrr(cm.grossIrr) },
          { label: "Total Contributed", value: formatCurrency(cm.totalCapitalCalls) },
          { label: "Total Distributions", value: formatCurrency(cm.totalDistributions) },
          { label: "Total NAV", value: formatCurrency(cm.totalNav) },
          { label: "Unrealized (FMV)", value: formatCurrency(cm.twhFmvFromFunds + cm.directsFmv) },
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
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Legend />
              <Line type="monotone" dataKey="netTvpi" stroke="hsl(var(--primary))" name="Net TVPI" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="grossTvpi" stroke="hsl(var(--info))" name="Gross TVPI" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-6 bg-card text-center">
          <p className="text-sm text-muted-foreground">No historical data yet — lock quarters in Settings to build this chart.</p>
        </div>
      )}

      {/* Net Cash Flow Ledger */}
      <div>
        <h3 className="text-sm font-medium mb-2">Net Cash Flow Ledger</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-1 text-xs">
                <TableHead>Date</TableHead>
                <TableHead>Fund / Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Contribution</TableHead>
                <TableHead className="text-right">Distribution</TableHead>
                <TableHead className="text-right">Net CF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Terminal NAV row */}
              <TableRow className="bg-primary/5 text-xs font-medium">
                <TableCell className="font-mono">{activeQuarter.date}</TableCell>
                <TableCell>TWH Americas Fund I, LP</TableCell>
                <TableCell>Terminal NAV</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono text-positive">{formatCurrency(cm.totalNav)}</TableCell>
              </TableRow>
              {ledger.map((e, i) => (
                <TableRow key={i} className="text-xs table-row-hover">
                  <TableCell className="font-mono">{e.date}</TableCell>
                  <TableCell>{e.source}</TableCell>
                  <TableCell className="text-muted-foreground">{e.type}</TableCell>
                  <TableCell className="text-right font-mono">{e.contribution > 0 ? formatCurrency(e.contribution) : '—'}</TableCell>
                  <TableCell className="text-right font-mono text-positive">{e.distribution > 0 ? formatCurrency(e.distribution) : '—'}</TableCell>
                  <TableCell className={`text-right font-mono ${e.net_cf < 0 ? 'text-negative' : 'text-positive'}`}>
                    {formatCurrency(e.net_cf)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
