import { useEffect, useMemo, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, CornerDownRight, AlertTriangle } from "lucide-react";
import { fmtUSD, fmtMultiple, calcMoic, signClass } from "@/lib/format";
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
};

function FxCell({ fundId, quarterId, currency }: { fundId: string; quarterId: string; currency: string }) {
  const { rate, updaterName } = useFundFxRate(fundId, quarterId, currency);
  return <FxBadge rate={rate} fromCurrency={currency} updaterName={updaterName} />;
}

// Render NULL → "—" (TBD), not $0. $0 is meaningful (write-off) and stays formatted.
const fmtUsdOrTbd = (v: number | null, opts?: { compact?: boolean }) =>
  v === null ? "—" : fmtUSD(v, opts);

// Multiply respects null (TBD) — null * anything = null
const mulOrNull = (v: number | null, m: number): number | null => (v === null ? null : v * m);

function ConfidenceIcon({ row }: { row: Row }) {
  // Confidence derived on read since it's not persisted in DB.
  // - needs_review: any TBD field → manual confirmation required
  // - confirmed:    all required fields populated
  const hasTbd = row.cost === null || row.fmv === null;
  const Icon = hasTbd ? AlertTriangle : CheckCircle2;
  const tone = hasTbd ? "text-amber-400" : "text-emerald-500/80";
  const label = hasTbd
    ? "Needs review — cost or FMV not yet recorded"
    : "Confirmed value";
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

export default function UnderlyingPortfolioPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const [{ data: holdings }, { data: commits }] = await Promise.all([
        supabase
          .from("underlying_holdings")
          .select("id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, currency, fund_id, round, round_detail, instrument, funds(name, short_name), companies(legal_name, commercial_name)")
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
      }));
      setRows(out);
      setLoading(false);
    })();
  }, [selected]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = !f ? rows : rows.filter((r) => r.company.toLowerCase().includes(f) || r.fund.toLowerCase().includes(f));
    // Sort by FMV desc; nulls last
    return [...list].sort((a, b) => {
      const av = a.fmv === null ? -Infinity : a.fmv * a.twh_pct;
      const bv = b.fmv === null ? -Infinity : b.fmv * b.twh_pct;
      return bv - av;
    });
  }, [rows, filter]);

  const totals = filtered.reduce(
    (a, r) => ({
      twh_cost: a.twh_cost + (r.cost ?? 0) * r.twh_pct,
      twh_fmv: a.twh_fmv + (r.fmv ?? 0) * r.twh_pct,
      twh_proceeds: a.twh_proceeds + (r.proceeds ?? 0) * r.twh_pct,
    }),
    { twh_cost: 0, twh_fmv: 0, twh_proceeds: 0 }
  );

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
        <Input
          placeholder="Filter by company or fund…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8"></TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Fund Cost</TableHead>
                <TableHead className="text-right">Fund FMV</TableHead>
                <TableHead className="text-right">TWH Cost</TableHead>
                <TableHead className="text-right">TWH FMV</TableHead>
                <TableHead className="text-right">MOIC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-muted-foreground py-12 text-center">No holdings</TableCell></TableRow>
              ) : (
                <>
                  {filtered.map((r) => {
                    const moic = r.cost === null ? null : calcMoic(r.cost, r.fmv ?? 0, r.proceeds ?? 0);
                    const gain = (r.fmv ?? 0) + (r.proceeds ?? 0) - (r.cost ?? 0);
                    return (
                      <TableRow key={r.id} className="table-row-hover">
                        <TableCell><ConfidenceIcon row={r} /></TableCell>
                        <TableCell className="font-medium">{r.company}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[260px] truncate">{r.fund}</TableCell>
                        <TableCell className="text-xs">
                          <span className="text-muted-foreground">{r.round ?? "—"}</span>
                          {r.round_detail && (
                            <span className="text-muted-foreground/50 ml-1">· {r.round_detail}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.instrument ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          <MetricTooltip
                            kind="input"
                            title="Fund Cost"
                            source={`GP financial statement for ${r.fund}`}
                          >
                            {fmtUsdOrTbd(r.cost, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          <MetricTooltip
                            kind="input"
                            title="Fund FMV"
                            source={`GP financial statement for ${r.fund}`}
                          >
                            {fmtUsdOrTbd(r.fmv, { compact: true })}
                          </MetricTooltip>
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
                    <TableCell colSpan={6}>TWH Total</TableCell>
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
