import { useMemo } from "react";
import { useFunds, useActiveQuarter, useAllFundFS, useDirectInvestments, useQuarterlyHistory } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatMultiple, formatIrr, formatPercent, computeXIRR } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function ConsolidatedPage() {
  const activeQuarter = useActiveQuarter();
  const { data: funds = [] } = useFunds();
  const { data: allFS = [] } = useAllFundFS(activeQuarter.date);
  const { data: directs = [] } = useDirectInvestments();
  const { data: quarterlyHistory = [] } = useQuarterlyHistory();

  // Fetch all fund cashflows
  const { data: allCashflows = [] } = useQuery({
    queryKey: ["all-fund-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_cashflows").select("*, fund:funds(fund_name)").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  // Build net cashflow ledger
  const ledger = useMemo(() => {
    const entries: any[] = [];

    for (const cf of allCashflows) {
      const isCall = (cf as any).cashflow_type?.startsWith("Capital Call") || cf.capital_deployed > 0;
      const amount = Number(cf.capital_deployed || 0) + Number(cf.distribution_received || 0);
      entries.push({
        date: cf.cashflow_date,
        source: (cf as any).fund?.fund_name || '—',
        type: (cf as any).cashflow_type || (isCall ? 'Capital Call' : 'Distribution'),
        contribution: isCall ? amount : 0,
        distribution: !isCall ? amount : 0,
        net_cf: isCall ? -amount : amount,
      });
    }

    // Add directs
    for (const d of directs) {
      if (d.investment_date && d.cost_basis > 0) {
        entries.push({
          date: d.investment_date,
          source: d.company_name,
          type: 'Direct Investment',
          contribution: Number(d.cost_basis),
          distribution: 0,
          net_cf: -Number(d.cost_basis),
        });
      }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }, [allCashflows, directs]);

  // Consolidated metrics
  const totalContributions = ledger.reduce((s, e) => s + e.contribution, 0);
  const totalDistributions = ledger.reduce((s, e) => s + e.distribution, 0);

  // TWH NAV from FS data
  const twhNavFromFunds = allFS.reduce((sum, fs) => {
    const extracted = fs.extracted_data as any;
    const fund = (fs as any).fund;
    const twhPct = fund && Number(extracted?.fund_totals?.total_commitment) > 0
      ? Number(fund.commitment_amount) / Number(extracted.fund_totals.total_commitment)
      : 0;
    return sum + Number(extracted?.fund_totals?.fund_nav || 0) * twhPct;
  }, 0);

  const totalNav = twhNavFromFunds; // + directs FMV when available
  const netTvpi = totalContributions > 0 ? (totalNav + totalDistributions) / totalContributions : 0;

  // Gross metrics
  const twhCostFromFunds = allFS.reduce((sum, fs) => {
    const extracted = fs.extracted_data as any;
    const fund = (fs as any).fund;
    const twhPct = fund && Number(extracted?.fund_totals?.total_commitment) > 0
      ? Number(fund.commitment_amount) / Number(extracted.fund_totals.total_commitment)
      : 0;
    return sum + Number(extracted?.fund_totals?.total_investment_cost || 0) * twhPct;
  }, 0);

  const twhFmvFromFunds = allFS.reduce((sum, fs) => {
    const extracted = fs.extracted_data as any;
    const fund = (fs as any).fund;
    const twhPct = fund && Number(extracted?.fund_totals?.total_commitment) > 0
      ? Number(fund.commitment_amount) / Number(extracted.fund_totals.total_commitment)
      : 0;
    return sum + Number(extracted?.fund_totals?.total_portfolio_fmv || 0) * twhPct;
  }, 0);

  const directsCost = directs.reduce((s: number, d: any) => s + Number(d.cost_basis), 0);
  const grossTvpi = (twhCostFromFunds + directsCost) > 0
    ? (twhFmvFromFunds) / (twhCostFromFunds + directsCost) : 0;

  // Net IRR
  const netIrrCashflows = ledger.map(e => ({ date: new Date(e.date), amount: e.net_cf }));
  if (totalNav > 0) {
    netIrrCashflows.push({ date: new Date(activeQuarter.date), amount: totalNav });
  }
  const netIrr = computeXIRR(netIrrCashflows);

  // Chart data from quarterly history
  const chartData = quarterlyHistory.map((q: any) => ({
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
      <div className="grid grid-cols-6 gap-4">
        {[
          { label: "Net TVPI", value: formatMultiple(netTvpi), highlight: true },
          { label: "Net IRR", value: formatIrr(netIrr), highlight: true },
          { label: "Gross TVPI", value: formatMultiple(grossTvpi) },
          { label: "Total Contributed", value: formatCurrency(totalContributions) },
          { label: "Total Distributions", value: formatCurrency(totalDistributions) },
          { label: "Total NAV", value: formatCurrency(totalNav) },
        ].map(m => (
          <div key={m.label} className={`border rounded-lg p-4 ${m.highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-lg font-mono font-semibold mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* TVPI Chart */}
      {chartData.length > 0 && (
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
                <TableCell className="text-right font-mono text-positive">{formatCurrency(totalNav)}</TableCell>
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
