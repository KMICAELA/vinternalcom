import { useMemo } from "react";
import { useActiveQuarter } from "@/hooks/usePortfolioData";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { getQuarterData, getChartData } from "@/data/quarterRegistry";
import { formatCurrency, formatMultiple, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";


export default function ConsolidatedPage() {
  const activeQuarter = useActiveQuarter();
  const cm = useConsolidatedMetrics();
  const qData = getQuarterData(activeQuarter.quarter);

  // Build ledger from registry cashflows
  const ledger = useMemo(() => {
    if (!qData) return [];
    return qData.netCashflows.map(cf => ({
      date: cf.date,
      source: cf.portfolio,
      type: cf.type,
      contribution: cf.type === 'Capital Call' ? cf.amount : 0,
      distribution: cf.type !== 'Capital Call' ? cf.amount : 0,
      net_cf: cf.type === 'Capital Call' ? -cf.amount : cf.amount,
    }));
  }, [qData]);

  // Chart data from registry
  const chartData = getChartData();

  // Custom tooltip for chart — 2 decimal places
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

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">TWH Consolidated</h1>
        <p className="text-sm text-muted-foreground">Net cash flow ledger & performance summary · {activeQuarter.quarter}</p>
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
