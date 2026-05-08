import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtUSD, fmtMultiple, fmtDate, calcMoic, signClass } from "@/lib/format";

// Format a holding period given the earliest investment date.
function fmtHoldingPeriod(earliest: string | null): string {
  if (!earliest) return "—";
  const start = new Date(earliest);
  if (isNaN(start.getTime())) return "—";
  const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
  if (days < 90) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

function CoInvestorsCell({ list }: { list: string[] | null }) {
  const items = (list ?? []).filter(Boolean);
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  const text = items.join(", ");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block max-w-[200px] truncate text-xs text-muted-foreground cursor-default">{text}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[320px] whitespace-normal">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
import MetricTooltip, { fmtUsdFull, fmtMultFull } from "@/components/MetricTooltip";
import DirectFormDialog, { type DirectEditRow } from "@/components/DirectFormDialog";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  company_id: string;
  company: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  cost: number;
  fmv: number;
  proceeds: number;
  co_investors: string[] | null;
  note: string | null;
};

type Group = {
  company_id: string;
  company: string;
  tranches: Row[];
  cost: number;
  fmv: number;
  proceeds: number;
  earliestDate: string | null;
  latestRound: string | null;
  latestInstrument: string | null;
};

export default function DirectsPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DirectEditRow | null>(null);

  const fetchRows = async () => {
    if (!selected) return;
    setLoading(true);
    const { data } = await supabase
      .from("directs")
      .select("id, company_id, investment_date, instrument, round, twh_cost_usd, co_investors, note, companies(legal_name, commercial_name), direct_quarter_snapshots(quarter_id, twh_fmv_usd, twh_proceeds_usd)")
      .order("investment_date", { ascending: false });

    const out: Row[] = (data ?? []).map((d: any) => {
      const snap = (d.direct_quarter_snapshots ?? []).find((s: any) => s.quarter_id === selected.id) ?? {};
      return {
        id: d.id,
        company_id: d.company_id,
        company: d.companies?.commercial_name ?? d.companies?.legal_name ?? "—",
        investment_date: d.investment_date,
        instrument: d.instrument,
        round: d.round,
        cost: Number(d.twh_cost_usd ?? 0),
        fmv: Number(snap.twh_fmv_usd ?? 0),
        proceeds: Number(snap.twh_proceeds_usd ?? 0),
        co_investors: d.co_investors ?? [],
        note: d.note ?? null,
      };
    });
    setRows(out);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, [selected]);

  // Group by company
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      const g = map.get(r.company_id);
      if (g) {
        g.tranches.push(r);
        g.cost += r.cost; g.fmv += r.fmv; g.proceeds += r.proceeds;
      } else {
        map.set(r.company_id, {
          company_id: r.company_id, company: r.company,
          tranches: [r],
          cost: r.cost, fmv: r.fmv, proceeds: r.proceeds,
          earliestDate: null, latestRound: null, latestInstrument: null,
        });
      }
    }
    for (const g of map.values()) {
      const sorted = [...g.tranches].sort((a, b) => (a.investment_date ?? "").localeCompare(b.investment_date ?? ""));
      g.earliestDate = sorted[0]?.investment_date ?? null;
      const latest = sorted[sorted.length - 1];
      g.latestRound = latest?.round ?? null;
      const instruments = new Set(g.tranches.map((t) => t.instrument).filter(Boolean));
      g.latestInstrument = instruments.size > 1 ? "Multiple" : (latest?.instrument ?? null);
      g.tranches = sorted.reverse(); // most recent first when expanded
    }
    return Array.from(map.values()).sort((a, b) => (b.earliestDate ?? "").localeCompare(a.earliestDate ?? ""));
  }, [rows]);

  const totals = rows.reduce(
    (a, r) => ({ cost: a.cost + r.cost, fmv: a.fmv + r.fmv, proceeds: a.proceeds + r.proceeds }),
    { cost: 0, fmv: 0, proceeds: 0 }
  );
  const totalMoic = calcMoic(totals.cost, totals.fmv, totals.proceeds);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: Row) => {
    setEditing({
      id: r.id, company_id: r.company_id, company_name: r.company,
      investment_date: r.investment_date, instrument: r.instrument, round: r.round,
      cost: r.cost, fmv: r.fmv, proceeds: r.proceeds,
      co_investors: r.co_investors, note: r.note,
    });
    setDialogOpen(true);
  };

  if (qLoading || !selected) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const renderTrancheRow = (r: Row, isSub: boolean) => {
    const moic = calcMoic(r.cost, r.fmv, r.proceeds);
    const gain = r.fmv + r.proceeds - r.cost;
    return (
      <TableRow key={r.id} className={cn("table-row-hover", isSub && "bg-muted/20")}>
        <TableCell className={cn("w-8", isSub && "pl-10")}></TableCell>
        <TableCell className={cn("font-medium", isSub && "pl-2 text-sm text-muted-foreground")}>
          {isSub ? "↳ tranche" : r.company}
        </TableCell>
        <TableCell className="text-muted-foreground">{fmtDate(r.investment_date)}</TableCell>
        <TableCell>{r.round ? <Badge variant="secondary" className="font-normal">{r.round}</Badge> : "—"}</TableCell>
        <TableCell className="text-muted-foreground">{r.instrument ?? "—"}</TableCell>
        <TableCell className="text-right font-mono">
          <MetricTooltip kind="input" title="TWH Cost" source={`TWH-1 internal records for ${r.company}${r.investment_date ? ` (${fmtDate(r.investment_date)})` : ""}`}>
            {fmtUSD(r.cost, { compact: true })}
          </MetricTooltip>
        </TableCell>
        <TableCell className="text-right font-mono">
          <MetricTooltip kind="input" title="TWH FMV" source={`TWH-1 internal records for ${r.company}${r.investment_date ? ` (${fmtDate(r.investment_date)})` : ""}`}>
            {fmtUSD(r.fmv, { compact: true })}
          </MetricTooltip>
        </TableCell>
        <TableCell className="text-right font-mono">
          <MetricTooltip kind="input" title="TWH Proceeds" source={`TWH-1 internal records for ${r.company}${r.investment_date ? ` (${fmtDate(r.investment_date)})` : ""}`}>
            {fmtUSD(r.proceeds, { compact: true })}
          </MetricTooltip>
        </TableCell>
        <TableCell className={`text-right font-mono ${signClass(gain)}`}>
          <MetricTooltip
            kind={moic === null ? "missing" : "derived"}
            title="MOIC"
            formula={{
              expression: "(TWH FMV + TWH Proceeds) ÷ TWH Cost",
              parts: [
                { label: "TWH FMV", value: fmtUsdFull(r.fmv) },
                { label: "TWH Proceeds", value: fmtUsdFull(r.proceeds) },
                { label: "TWH Cost", value: fmtUsdFull(r.cost) },
              ],
              result: fmtMultFull(moic),
            }}
            missingInputs={["TWH Cost"]}
          >
            {fmtMultiple(moic)}
          </MetricTooltip>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {isSub ? "" : fmtHoldingPeriod(r.investment_date)}
        </TableCell>
        <TableCell><CoInvestorsCell list={r.co_investors} /></TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const renderGroupRow = (g: Group) => {
    const moic = calcMoic(g.cost, g.fmv, g.proceeds);
    const gain = g.fmv + g.proceeds - g.cost;
    const isMulti = g.tranches.length > 1;
    const isOpen = expanded.has(g.company_id);
    if (!isMulti) return renderTrancheRow(g.tranches[0], false);
    return (
      <TableRow key={g.company_id} className="table-row-hover cursor-pointer" onClick={() => toggle(g.company_id)}>
        <TableCell className="w-8">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </TableCell>
        <TableCell className="font-medium">
          {g.company} <span className="text-xs text-muted-foreground ml-1">({g.tranches.length} tranches)</span>
        </TableCell>
        <TableCell className="text-muted-foreground">{fmtDate(g.earliestDate)}</TableCell>
        <TableCell>{g.latestRound ? <Badge variant="secondary" className="font-normal">{g.latestRound}</Badge> : "—"}</TableCell>
        <TableCell className="text-muted-foreground">{g.latestInstrument ?? "—"}</TableCell>
        <TableCell className="text-right font-mono">{fmtUSD(g.cost, { compact: true })}</TableCell>
        <TableCell className="text-right font-mono">{fmtUSD(g.fmv, { compact: true })}</TableCell>
        <TableCell className="text-right font-mono">{fmtUSD(g.proceeds, { compact: true })}</TableCell>
        <TableCell className={`text-right font-mono ${signClass(gain)}`}>{fmtMultiple(moic)}</TableCell>
        <TableCell className="text-muted-foreground text-xs">{fmtHoldingPeriod(g.earliestDate)}</TableCell>
        <TableCell><CoInvestorsCell list={Array.from(new Set((g.tranches.flatMap((t) => t.co_investors ?? []))))} /></TableCell>
        <TableCell></TableCell>
      </TableRow>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct Investments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {groups.length} companies · {rows.length} positions · {selected.label}
          </p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add direct</Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8"></TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">FMV</TableHead>
                <TableHead className="text-right">Proceeds</TableHead>
                <TableHead className="text-right">MOIC</TableHead>
                <TableHead>Holding period</TableHead>
                <TableHead>Co-investors</TableHead>
                <TableHead className="text-right w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={12} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : groups.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-muted-foreground py-12 text-center">No directs in this quarter</TableCell></TableRow>
              ) : (
                <>
                  {groups.flatMap((g) => {
                    const out = [renderGroupRow(g)];
                    if (g.tranches.length > 1 && expanded.has(g.company_id)) {
                      for (const t of g.tranches) out.push(renderTrancheRow(t, true));
                    }
                    return out;
                  })}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell colSpan={5}>Total</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.cost, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.fmv, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.proceeds, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(totalMoic)}</TableCell>
                    <TableCell colSpan={3}></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DirectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        quarterId={selected.id}
        initial={editing}
        onSaved={fetchRows}
      />
    </div>
  );
}
