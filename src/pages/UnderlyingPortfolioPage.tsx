import { useEffect, useMemo, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtMultiple, fmtPct, calcMoic, signClass } from "@/lib/format";
import MetricTooltip, { fmtUsdFull, fmtPctFull, fmtMultFull } from "@/components/MetricTooltip";
import { FxBadge } from "@/components/FxBadge";
import { useFundFxRate } from "@/lib/fx/useFundFxRate";

type Row = {
  id: string;
  company: string;
  fund: string;
  fund_id: string;
  round: string | null;
  round_detail: string | null;
  instrument: string | null;
  currency: string;
  cost: number | null;
  fmv: number | null;
  proceeds: number | null;
  twh_pct: number;
  fund_ownership_pct: number | null;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
};

const ROUND_OPTIONS = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Series F", "Series G", "Growth", "Bridge",
];

function FxCell({ fundId, quarterId, currency }: { fundId: string; quarterId: string; currency: string }) {
  const { rate, updaterName } = useFundFxRate(fundId, quarterId, currency);
  return <FxBadge rate={rate} fromCurrency={currency} updaterName={updaterName} />;
}

const fmtUsdOrTbd = (v: number | null, opts?: { compact?: boolean }) =>
  v === null ? "—" : fmtUSD(v, opts);
const mulOrNull = (v: number | null, m: number): number | null => (v === null ? null : v * m);

function ConfidenceIcon({ row }: { row: Row }) {
  const hasTbd = row.cost === null || row.fmv === null;
  const Icon = hasTbd ? AlertTriangle : CheckCircle2;
  const tone = hasTbd ? "text-amber-400" : "text-emerald-500/80";
  const label = hasTbd ? "Needs review — cost or FMV not yet recorded" : "Confirmed value";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[260px]">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s.includes("exit") || s.includes("realiz") ? "text-blue-400 border-blue-400/30"
    : s.includes("written") || s.includes("write") ? "text-destructive border-destructive/30"
    : "text-emerald-400 border-emerald-400/30";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{status}</Badge>;
}

function RoundCell({ row, onSaved }: { row: Row; onSaved: (next: Partial<Row>) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(row.round ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const newRound = val === "__null__" ? null : val || null;
    const { error } = await supabase
      .from("underlying_holdings")
      .update({ round: newRound, needs_review: false, review_reason: null })
      .eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(`Failed to save: ${error.message}`); return; }
    toast.success("Round updated");
    onSaved({ round: newRound, needs_review: false, review_reason: null });
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      {row.needs_review ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] gap-1 text-amber-400 border-amber-400/30 cursor-help">
                <AlertTriangle className="h-2.5 w-2.5" />Needs review
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[260px]">
              {row.review_reason ?? "Round not stated in source"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <span className="text-muted-foreground text-xs">{row.round ?? "—"}</span>
      )}
      {row.round_detail && !row.needs_review && (
        <span className="text-muted-foreground/50 text-xs">· {row.round_detail}</span>
      )}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(row.round ?? ""); }}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="h-5 w-5 opacity-50 hover:opacity-100">
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3 space-y-2" align="start">
          <div className="text-xs text-muted-foreground">Set round</div>
          <Select value={val || "__null__"} onValueChange={setVal}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Round" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__null__">— (none)</SelectItem>
              {ROUND_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={save}>Save</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function UnderlyingPortfolioPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [fundFilter, setFundFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const [{ data: holdings }, { data: commits }] = await Promise.all([
        supabase
          .from("underlying_holdings")
          .select("id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, currency, fund_id, round, round_detail, instrument, fund_ownership_pct, needs_review, review_reason, funds(name, short_name), companies(legal_name, commercial_name, status)")
          .eq("quarter_id", selected.id),
        supabase.from("fund_commitments").select("fund_id, twh_ownership_pct"),
      ]);
      const pctMap = new Map((commits ?? []).map((c: any) => [c.fund_id, Number(c.twh_ownership_pct ?? 0)]));
      const out: Row[] = (holdings ?? []).map((h: any) => ({
        id: h.id,
        company: h.companies?.commercial_name ?? h.companies?.legal_name ?? "—",
        fund: h.funds?.short_name ?? h.funds?.name ?? "—",
        fund_id: h.fund_id,
        currency: h.currency ?? "USD",
        round: h.round ?? null,
        round_detail: h.round_detail ?? null,
        instrument: h.instrument ?? null,
        cost: h.fund_cost_usd == null ? null : Number(h.fund_cost_usd),
        fmv: h.fund_fmv_usd == null ? null : Number(h.fund_fmv_usd),
        proceeds: h.fund_proceeds_usd == null ? null : Number(h.fund_proceeds_usd),
        twh_pct: pctMap.get(h.fund_id) ?? 0,
        fund_ownership_pct: h.fund_ownership_pct == null ? null : Number(h.fund_ownership_pct),
        status: h.companies?.status?.trim() || "Active",
        needs_review: h.needs_review === true,
        review_reason: h.review_reason ?? null,
      }));
      setRows(out);
      setLoading(false);
    })();
  }, [selected]);

  const fundOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.fund_id, r.fund));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (fundFilter !== "all" && r.fund_id !== fundFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (roundFilter !== "all" && (r.round ?? "") !== roundFilter) return false;
      if (f && !r.company.toLowerCase().includes(f) && !r.fund.toLowerCase().includes(f)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      const av = a.fmv === null ? -Infinity : a.fmv * a.twh_pct;
      const bv = b.fmv === null ? -Infinity : b.fmv * b.twh_pct;
      return bv - av;
    });
  }, [rows, filter, fundFilter, statusFilter, roundFilter]);

  const totals = filtered.reduce(
    (a, r) => ({
      twh_cost: a.twh_cost + (r.cost ?? 0) * r.twh_pct,
      twh_fmv: a.twh_fmv + (r.fmv ?? 0) * r.twh_pct,
      twh_proceeds: a.twh_proceeds + (r.proceeds ?? 0) * r.twh_pct,
    }),
    { twh_cost: 0, twh_fmv: 0, twh_proceeds: 0 }
  );

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((curr) => curr.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  if (qLoading || !selected) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Underlying Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} holdings · {selected.label} · TWH-attributed values shown
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-[200px] h-9"
          />
          <Select value={fundFilter} onValueChange={setFundFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Fund" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All funds</SelectItem>
              {fundOptions.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roundFilter} onValueChange={setRoundFilter}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Round" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rounds</SelectItem>
              {ROUND_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8"></TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">TWH %</TableHead>
                <TableHead className="text-right">Fund Cost</TableHead>
                <TableHead className="text-right">Fund FMV</TableHead>
                <TableHead className="text-right">Ownership %</TableHead>
                <TableHead className="text-right">TWH Cost</TableHead>
                <TableHead className="text-right">TWH FMV</TableHead>
                <TableHead className="text-right">MOIC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={13} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-muted-foreground py-12 text-center">No holdings</TableCell></TableRow>
              ) : (
                <>
                  {filtered.map((r) => {
                    const moic = r.cost === null ? null : calcMoic(r.cost, r.fmv ?? 0, r.proceeds ?? 0);
                    const gain = (r.fmv ?? 0) + (r.proceeds ?? 0) - (r.cost ?? 0);
                    return (
                      <TableRow key={r.id} className="table-row-hover">
                        <TableCell><ConfidenceIcon row={r} /></TableCell>
                        <TableCell className="font-medium">{r.company}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[260px] truncate">
                          {r.fund}
                          {selected && r.currency !== "USD" && (
                            <FxCell fundId={r.fund_id} quarterId={selected.id} currency={r.currency} />
                          )}
                        </TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell>
                          <RoundCell row={r} onSaved={(p) => updateRow(r.id, p)} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.instrument ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{fmtPct(r.twh_pct, 2)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          <MetricTooltip kind="input" title="Fund Cost" source={`GP financial statement for ${r.fund}`}>
                            {fmtUsdOrTbd(r.cost, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          <MetricTooltip kind="input" title="Fund FMV" source={`GP financial statement for ${r.fund}`}>
                            {fmtUsdOrTbd(r.fmv, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {r.fund_ownership_pct == null ? "—" : `${r.fund_ownership_pct.toFixed(2)}%`}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind={r.cost === null ? "missing" : "derived"}
                            title="TWH Cost"
                            formula={{
                              expression: "Fund Cost × TWH %",
                              parts: [
                                { label: "Fund Cost", value: fmtUsdFull(r.cost) },
                                { label: "TWH %", value: fmtPctFull(r.twh_pct, 2) },
                              ],
                              result: fmtUsdFull(mulOrNull(r.cost, r.twh_pct)),
                            }}
                            missingInputs={["Fund Cost"]}
                          >
                            {fmtUsdOrTbd(mulOrNull(r.cost, r.twh_pct), { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind={r.fmv === null ? "missing" : "derived"}
                            title="TWH FMV"
                            formula={{
                              expression: "Fund FMV × TWH %",
                              parts: [
                                { label: "Fund FMV", value: fmtUsdFull(r.fmv) },
                                { label: "TWH %", value: fmtPctFull(r.twh_pct, 2) },
                              ],
                              result: fmtUsdFull(mulOrNull(r.fmv, r.twh_pct)),
                            }}
                            missingInputs={["Fund FMV"]}
                          >
                            {fmtUsdOrTbd(mulOrNull(r.fmv, r.twh_pct), { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${signClass(gain)}`}>
                          <MetricTooltip
                            kind={moic === null ? "missing" : "derived"}
                            title="MOIC"
                            formula={{
                              expression: "(Fund FMV + Fund Proceeds) ÷ Fund Cost",
                              parts: [
                                { label: "Fund FMV", value: fmtUsdFull(r.fmv) },
                                { label: "Fund Proceeds", value: fmtUsdFull(r.proceeds) },
                                { label: "Fund Cost", value: fmtUsdFull(r.cost) },
                              ],
                              result: fmtMultFull(moic),
                            }}
                            missingInputs={["Fund Cost"]}
                          >
                            {fmtMultiple(moic)}
                          </MetricTooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell></TableCell>
                    <TableCell colSpan={8}>TWH Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.twh_cost, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.twh_fmv, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(calcMoic(totals.twh_cost, totals.twh_fmv, totals.twh_proceeds))}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
