import { useState, useMemo } from "react";
import { useAllFundFS, useActiveQuarter, useFunds, useUnderlyingPortfolio, useDirectInvestments } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export default function UnderlyingPortfolioPage() {
  const activeQuarter = useActiveQuarter();
  const { data: allFS = [] } = useAllFundFS(activeQuarter.date);
  const { data: funds = [] } = useFunds();
  const { data: holdings = [] } = useUnderlyingPortfolio(activeQuarter.date);
  const { data: directs = [] } = useDirectInvestments();

  const [search, setSearch] = useState("");
  const [filterFund, setFilterFund] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Set of direct investment company names to exclude
  const directNames = useMemo(() => {
    const names = new Set<string>();
    for (const d of directs) {
      names.add(d.company_name.toLowerCase());
    }
    // Also exclude known aggregate rows
    names.add("directs portfolio");
    return names;
  }, [directs]);

  // Build fund_id → fund map
  const fundMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const f of funds) m[f.id] = f;
    return m;
  }, [funds]);

  // Layer 1: Seed data from underlying_portfolio_holdings (pre-computed TWH values)
  // Layer 2: Overlay with confirmed FS extractions per fund (replaces seed for that fund)
  const companies = useMemo(() => {
    const rows: any[] = [];

    // Collect fund IDs that have confirmed FS data — those funds use FS data, not seed
    const fsFundIds = new Set<string>();
    for (const fs of allFS) {
      const fund = (fs as any).fund;
      if (fund?.id) fsFundIds.add(fund.id);
    }

    // Layer 2: Add companies from confirmed FS extractions
    for (const fs of allFS) {
      const extracted = fs.extracted_data as any;
      const fund = (fs as any).fund;
      if (!fund) continue;

      const totalCommitment = Number(extracted?.fund_totals?.total_commitment || 0);
      const twhPct = totalCommitment > 0
        ? Number(fund.commitment_amount) / totalCommitment
        : Number(fund.ownership_percentage || 0);

      for (const co of extracted?.portfolio_companies || []) {
        const name = co.company_name || '';
        if (directNames.has(name.toLowerCase())) continue;

        const invCost = Number(co.investment_cost || 0);
        const fmv = Number(co.fmv || 0);
        const proceeds = Number(co.proceeds || 0);
        const twhCost = invCost * twhPct;
        const twhFmv = fmv * twhPct;
        const twhProceeds = proceeds * twhPct;

        // Normalize status to only valid values
        const rawStatus = (co.status || '').trim();
        const status = ['Active', 'Write-off', 'Exit'].includes(rawStatus) ? rawStatus : 'Active';

        rows.push({
          company_name: name || '—',
          fund_name: fund.fund_name || '—',
          status,
          investment_date: co.investment_date || null,
          instrument: co.instrument || null,
          round: co.round || null,
          investment_cost: invCost,
          fmv,
          proceeds,
          moic: invCost > 0 ? (fmv + proceeds) / invCost : 0,
          twh_pct: twhPct,
          twh_cost: twhCost,
          twh_fmv: twhFmv,
          twh_proceeds: twhProceeds,
          twh_moic: twhCost > 0 ? (twhFmv + twhProceeds) / twhCost : 0,
        });
      }
    }

    // Layer 1: Add seed data from underlying_portfolio_holdings for funds without FS
    for (const h of holdings) {
      // Skip if this holding belongs to a fund that has FS data
      if (h.fund_id && fsFundIds.has(h.fund_id)) continue;
      // Skip direct investments
      if (directNames.has(h.company_name.toLowerCase())) continue;
      // Skip rows with no fund_id (these are unmapped — likely directs or aggregates)
      // But include them if they have TWH values (they're legitimate fund holdings)
      
      const invCost = Number(h.investment_cost || 0);
      const fmv = Number(h.fmv || 0);
      const proceeds = Number(h.proceeds || 0);
      const twhCost = Number(h.twh_cost || 0);
      const twhFmv = Number(h.twh_fmv || 0);
      const twhProceeds = Number(h.twh_proceeds || 0);
      const twhPct = invCost > 0 ? twhCost / invCost : 0;

      // Determine status: if FMV is 0 and no proceeds, likely write-off
      let status = 'Active';
      if (fmv === 0 && proceeds === 0 && invCost > 0) status = 'Write-off';

      // Get fund name from fund_id if available
      const fundName = h.fund_id && fundMap[h.fund_id] ? fundMap[h.fund_id].fund_name : '—';

      rows.push({
        company_name: h.company_name,
        fund_name: fundName,
        status,
        investment_date: null,
        instrument: null,
        round: null,
        investment_cost: invCost,
        fmv,
        proceeds,
        moic: invCost > 0 ? (fmv + proceeds) / invCost : 0,
        twh_pct: twhPct,
        twh_cost: twhCost,
        twh_fmv: twhFmv,
        twh_proceeds: twhProceeds,
        twh_moic: twhCost > 0 ? (twhFmv + twhProceeds) / twhCost : 0,
      });
    }

    return rows;
  }, [allFS, holdings, funds, directNames, fundMap]);

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

  const uniqueFunds = [...new Set(companies.map(c => c.fund_name))].filter(f => f !== '—').sort();

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

      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-1 text-xs">
              <TableHead>Company</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Instrument</TableHead>
              <TableHead>Round</TableHead>
              <TableHead className="text-right">Inv. Cost</TableHead>
              <TableHead className="text-right">FMV</TableHead>
              <TableHead className="text-right">Proceeds</TableHead>
              <TableHead className="text-right">MOIC</TableHead>
              <TableHead className="text-right">TWH %</TableHead>
              <TableHead className="text-right">TWH Cost</TableHead>
              <TableHead className="text-right">TWH FMV</TableHead>
              <TableHead className="text-right">TWH MOIC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                  No portfolio companies found for this quarter.
                </TableCell>
              </TableRow>
            ) : filtered.map((c, i) => (
              <TableRow key={i} className="text-xs table-row-hover">
                <TableCell className="font-medium">{c.company_name}</TableCell>
                <TableCell className="text-muted-foreground">{c.fund_name}</TableCell>
                <TableCell>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    c.status === 'Active' ? 'bg-positive/10 text-positive' :
                    c.status === 'Exit' ? 'bg-info/10 text-info' : 'bg-destructive/10 text-destructive'
                  }`}>{c.status}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.investment_date || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{c.instrument || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{c.round || '—'}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.investment_cost)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.fmv)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(c.proceeds)}</TableCell>
                <TableCell className="text-right font-mono">{formatMultiple(c.moic)}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{c.twh_pct > 0 ? formatPercent(c.twh_pct) : '—'}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(c.twh_cost)}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(c.twh_fmv)}</TableCell>
                <TableCell className="text-right font-mono bg-surface-2">{formatMultiple(c.twh_moic)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="text-xs font-medium">
              <TableCell colSpan={6}>TOTAL ({filtered.length} companies)</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.investment_cost)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.fmv)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.proceeds)}</TableCell>
              <TableCell className="text-right font-mono">{totals.investment_cost > 0 ? formatMultiple((totals.fmv + totals.proceeds) / totals.investment_cost) : '—'}</TableCell>
              <TableCell className="bg-surface-2" />
              <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(totals.twh_cost)}</TableCell>
              <TableCell className="text-right font-mono bg-surface-2">{formatCurrency(totals.twh_fmv)}</TableCell>
              <TableCell className="text-right font-mono bg-surface-2">{totals.twh_cost > 0 ? formatMultiple((totals.twh_fmv + totals.twh_proceeds) / totals.twh_cost) : '—'}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
