import { useState, useMemo } from "react";
import { useAllFundFS, useActiveQuarter, useFunds, useUnderlyingPortfolio } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export default function UnderlyingPortfolioPage() {
  const activeQuarter = useActiveQuarter();
  const { data: holdings = [] } = useUnderlyingPortfolio(activeQuarter.date);
  const { data: allFS = [] } = useAllFundFS(activeQuarter.date);
  const { data: funds = [] } = useFunds();

  const [search, setSearch] = useState("");
  const [filterFund, setFilterFund] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Build company list from FS extractions + underlying_portfolio_holdings
  const companies = useMemo(() => {
    const fromFS: any[] = [];
    for (const fs of allFS) {
      const extracted = fs.extracted_data as any;
      const fund = (fs as any).fund;
      const twhPct = fund && Number(extracted?.fund_totals?.total_commitment) > 0
        ? Number(fund.commitment_amount) / Number(extracted.fund_totals.total_commitment)
        : 0;

      for (const co of extracted?.portfolio_companies || []) {
        fromFS.push({
          company_name: co.company_name,
          fund_name: fund?.fund_name || '—',
          status: co.status || 'Active',
          investment_date: co.investment_date,
          instrument: co.instrument,
          round: co.round,
          investment_cost: Number(co.investment_cost || 0),
          fmv: Number(co.fmv || 0),
          proceeds: Number(co.proceeds || 0),
          moic: Number(co.investment_cost) > 0 ? (Number(co.fmv || 0) + Number(co.proceeds || 0)) / Number(co.investment_cost) : 0,
          twh_pct: twhPct,
          twh_cost: Number(co.investment_cost || 0) * twhPct,
          twh_fmv: Number(co.fmv || 0) * twhPct,
          twh_proceeds: Number(co.proceeds || 0) * twhPct,
          twh_moic: (Number(co.investment_cost || 0) * twhPct) > 0
            ? ((Number(co.fmv || 0) * twhPct) + (Number(co.proceeds || 0) * twhPct)) / (Number(co.investment_cost || 0) * twhPct)
            : 0,
          days_held: co.investment_date ? Math.floor((Date.now() - new Date(co.investment_date).getTime()) / 86400000) : 0,
        });
      }
    }

    // Also include manually added holdings
    for (const h of holdings) {
      if (!fromFS.some(f => f.company_name === h.company_name && f.fund_name === (funds.find((fd: any) => fd.id === h.fund_id) as any)?.fund_name)) {
        const fundName = (funds.find((fd: any) => fd.id === h.fund_id) as any)?.fund_name || '—';
        fromFS.push({
          company_name: h.company_name,
          fund_name: fundName,
          status: h.type || 'Active',
          investment_date: null,
          instrument: null,
          round: null,
          investment_cost: Number(h.investment_cost),
          fmv: Number(h.fmv),
          proceeds: Number(h.proceeds),
          moic: Number(h.investment_cost) > 0 ? (Number(h.fmv) + Number(h.proceeds)) / Number(h.investment_cost) : 0,
          twh_pct: 0,
          twh_cost: Number(h.twh_cost),
          twh_fmv: Number(h.twh_fmv),
          twh_proceeds: Number(h.twh_proceeds),
          twh_moic: Number(h.twh_cost) > 0 ? (Number(h.twh_fmv) + Number(h.twh_proceeds)) / Number(h.twh_cost) : 0,
          days_held: 0,
        });
      }
    }

    return fromFS;
  }, [allFS, holdings, funds]);

  const filtered = companies.filter(c => {
    if (search && !c.company_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterFund !== "all" && c.fund_name !== filterFund) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const totals = filtered.reduce((acc, c) => ({
    investment_cost: acc.investment_cost + c.investment_cost,
    fmv: acc.fmv + c.fmv,
    proceeds: acc.proceeds + c.proceeds,
    twh_cost: acc.twh_cost + c.twh_cost,
    twh_fmv: acc.twh_fmv + c.twh_fmv,
    twh_proceeds: acc.twh_proceeds + c.twh_proceeds,
  }), { investment_cost: 0, fmv: 0, proceeds: 0, twh_cost: 0, twh_fmv: 0, twh_proceeds: 0 });

  const uniqueFunds = [...new Set(companies.map(c => c.fund_name))];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Underlying Portfolio</h1>
        <p className="text-sm text-muted-foreground">Company-level view across all funds · {activeQuarter.quarter}</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search company..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm" />
        </div>
        <Select value={filterFund} onValueChange={setFilterFund}>
          <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="All Funds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funds</SelectItem>
            {uniqueFunds.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Exit">Exit</SelectItem>
            <SelectItem value="Write-off">Write-off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-1 text-xs">
              <TableHead>Company</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Round</TableHead>
              <TableHead className="text-right">Inv. Cost</TableHead>
              <TableHead className="text-right">FMV</TableHead>
              <TableHead className="text-right">Proceeds</TableHead>
              <TableHead className="text-right">MOIC</TableHead>
              <TableHead className="text-right">TWH Cost</TableHead>
              <TableHead className="text-right">TWH FMV</TableHead>
              <TableHead className="text-right">TWH MOIC</TableHead>
              <TableHead className="text-right">Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c, i) => (
              <TableRow key={i} className="text-xs table-row-hover">
                <TableCell className="font-medium">{c.company_name}</TableCell>
                <TableCell className="text-muted-foreground">{c.fund_name}</TableCell>
                <TableCell>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    c.status === 'Active' ? 'bg-positive/10 text-positive' :
                    c.status === 'Exit' ? 'bg-info/10 text-info' : 'bg-destructive/10 text-destructive'
                  }`}>{c.status}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.round || '—'}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.investment_cost)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.fmv)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.proceeds)}</TableCell>
                <TableCell className="text-right font-mono">{formatMultiple(c.moic)}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(c.twh_cost)}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(c.twh_fmv)}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{formatMultiple(c.twh_moic)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{c.days_held || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="text-xs font-medium">
              <TableCell colSpan={4}>TOTAL ({filtered.length} companies)</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.investment_cost)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.fmv)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.proceeds)}</TableCell>
              <TableCell className="text-right font-mono">{totals.investment_cost > 0 ? formatMultiple((totals.fmv + totals.proceeds) / totals.investment_cost) : '—'}</TableCell>
              <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(totals.twh_cost)}</TableCell>
              <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(totals.twh_fmv)}</TableCell>
              <TableCell className="text-right font-mono bg-surface-2">{totals.twh_cost > 0 ? formatMultiple((totals.twh_fmv + totals.twh_proceeds) / totals.twh_cost) : '—'}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
