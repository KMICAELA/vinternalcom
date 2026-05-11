import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { CheckCircle2, AlertTriangle, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtMultiple, fmtPct, calcMoic, signClass } from "@/lib/format";
import MetricTooltip, { fmtUsdFull, fmtPctFull, fmtMultFull } from "@/components/MetricTooltip";
import { FxBadge } from "@/components/FxBadge";
import { useFundFxRate } from "@/lib/fx/useFundFxRate";
import FundsViewSwitcher from "@/components/FundsViewSwitcher";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  company: string;
  company_id: string;
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
  removed_at: string | null;
  removed_reason: string | null;
};

const ROUND_OPTIONS = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Series F", "Series G", "Growth", "Bridge",
];

type SortKey =
  | "company" | "fund" | "status" | "round" | "instrument"
  | "twh_pct" | "cost" | "fmv" | "fund_ownership_pct"
  | "twh_cost" | "twh_fmv" | "moic";

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

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
        align === "right" && "ml-auto"
      )}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
}

export default function UnderlyingPortfolioPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRemoved, setShowRemoved] = useState(false);

  // Per-column filters (company → instrument)
  const [companyFilter, setCompanyFilter] = useState("");
  const [fundFilter, setFundFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [instrumentFilter, setInstrumentFilter] = useState("all");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("twh_fmv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "company" || k === "fund" || k === "status" || k === "round" || k === "instrument" ? "asc" : "desc"); }
  };

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      let query = supabase
        .from("underlying_holdings")
        .select("id, company_id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, currency, fund_id, round, round_detail, instrument, fund_ownership_pct, needs_review, review_reason, removed_at, removed_reason, funds(name, short_name), companies(legal_name, commercial_name, status)")
        .eq("quarter_id", selected.id);
      if (!showRemoved) query = query.is("removed_at", null);
      const [{ data: holdings }, { data: commits }] = await Promise.all([
        query,
        supabase.from("fund_commitments").select("fund_id, twh_ownership_pct"),
      ]);
      const pctMap = new Map((commits ?? []).map((c: any) => [c.fund_id, Number(c.twh_ownership_pct ?? 0)]));
      const out: Row[] = (holdings ?? []).map((h: any) => ({
        id: h.id,
        company: h.companies?.commercial_name ?? h.companies?.legal_name ?? "—",
        company_id: h.company_id,
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
        removed_at: h.removed_at ?? null,
        removed_reason: h.removed_reason ?? null,
      }));
      setRows(out);
      setLoading(false);
    })();
  }, [selected, showRemoved]);

  const fundOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.fund))).sort(), [rows]);
  const statusOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);
  const roundOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.round ?? "—"))).sort(), [rows]);
  const instrumentOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.instrument ?? "—"))).sort(), [rows]);

  const filtered = useMemo(() => {
    const inclText = (val: string | null | undefined, q: string) =>
      !q.trim() || (val ?? "").toLowerCase().includes(q.trim().toLowerCase());
    const inclEq = (val: string | null | undefined, q: string) =>
      q === "all" || (val ?? "—") === q;
    const list = rows.filter((r) =>
      inclText(r.company, companyFilter) &&
      inclEq(r.fund, fundFilter) &&
      inclEq(r.status, statusFilter) &&
      inclEq(r.round, roundFilter) &&
      inclEq(r.instrument, instrumentFilter)
    );
    const valFor = (r: Row, k: SortKey): number | string => {
      switch (k) {
        case "company": return r.company.toLowerCase();
        case "fund": return r.fund.toLowerCase();
        case "status": return r.status.toLowerCase();
        case "round": return (r.round ?? "").toLowerCase();
        case "instrument": return (r.instrument ?? "").toLowerCase();
        case "twh_pct": return r.twh_pct;
        case "cost": return r.cost ?? -Infinity;
        case "fmv": return r.fmv ?? -Infinity;
        case "fund_ownership_pct": return r.fund_ownership_pct ?? -Infinity;
        case "twh_cost": return r.cost === null ? -Infinity : r.cost * r.twh_pct;
        case "twh_fmv": return r.fmv === null ? -Infinity : r.fmv * r.twh_pct;
        case "moic": {
          if (r.cost === null || r.cost === 0) return -Infinity;
          return ((r.fmv ?? 0) + (r.proceeds ?? 0)) / r.cost;
        }
      }
    };
    return [...list].sort((a, b) => {
      const av = valFor(a, sortKey);
      const bv = valFor(b, sortKey);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, companyFilter, fundFilter, statusFilter, roundFilter, instrumentFilter, sortKey, sortDir]);

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

  const colFilterInput = (value: string, setValue: (v: string) => void, placeholder: string) => (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="h-7 text-xs font-normal mt-1"
    />
  );

  const colFilterSelect = (
    value: string,
    setValue: (v: string) => void,
    options: string[],
    allLabel: string,
  ) => (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger className="h-7 text-xs font-normal mt-1">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-3">
          <FundsViewSwitcher />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Underlying Portfolio</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} holdings · {selected.label} · TWH-attributed values shown
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none px-2 h-9 rounded border border-border hover:text-foreground">
            <input
              type="checkbox"
              checked={showRemoved}
              onChange={(e) => setShowRemoved(e.target.checked)}
              className="h-3 w-3 cursor-pointer"
            />
            Show removed
          </label>
        </div>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent align-top">
                <TableHead className="w-8"></TableHead>
                <TableHead>
                  <SortHeader label="Company" sortKey="company" current={sortKey} dir={sortDir} onSort={onSort} />
                  {colFilterInput(companyFilter, setCompanyFilter, "Filter…")}
                </TableHead>
                <TableHead>
                  <SortHeader label="Fund" sortKey="fund" current={sortKey} dir={sortDir} onSort={onSort} />
                  {colFilterSelect(fundFilter, setFundFilter, fundOptions, "All funds")}
                </TableHead>
                <TableHead>
                  <SortHeader label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={onSort} />
                  {colFilterSelect(statusFilter, setStatusFilter, statusOptions, "All statuses")}
                </TableHead>
                <TableHead>
                  <SortHeader label="Round" sortKey="round" current={sortKey} dir={sortDir} onSort={onSort} />
                  {colFilterSelect(roundFilter, setRoundFilter, roundOptions, "All rounds")}
                </TableHead>
                <TableHead>
                  <SortHeader label="Instrument" sortKey="instrument" current={sortKey} dir={sortDir} onSort={onSort} />
                  {colFilterSelect(instrumentFilter, setInstrumentFilter, instrumentOptions, "All instruments")}
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="TWH %" sortKey="twh_pct" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="Fund Cost" sortKey="cost" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="Fund FMV" sortKey="fmv" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="Ownership %" sortKey="fund_ownership_pct" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="TWH Cost" sortKey="twh_cost" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="TWH FMV" sortKey="twh_fmv" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex justify-end"><SortHeader label="MOIC" sortKey="moic" current={sortKey} dir={sortDir} onSort={onSort} align="right" /></div>
                </TableHead>
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
                      <TableRow key={r.id} className={`table-row-hover ${r.removed_at ? "opacity-50 line-through" : ""}`}>
                        <TableCell><ConfidenceIcon row={r} /></TableCell>
                        <TableCell className="font-medium">
                          <Link
                            to={`/portfolio?company=${r.company_id}`}
                            className="hover:text-primary hover:underline transition-colors"
                          >
                            {r.company}
                          </Link>
                          {r.removed_at && (
                            <Badge variant="outline" className="ml-2 text-[9px] text-muted-foreground border-border">
                              removed · {r.removed_reason}
                            </Badge>
                          )}
                        </TableCell>
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
