import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { fmtUSD, fmtPct, fmtMultiple, fmtDate, calcDpi, calcTvpi } from "@/lib/format";
import { computeXirr } from "@/lib/irr";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FxBadge } from "@/components/FxBadge";
import { useFundFxRate } from "@/lib/fx/useFundFxRate";
import { useSelectedQuarter } from "@/contexts/QuarterContext";

type Quarter = { id: string; label: string; quarter_end_date: string };
type Snap = {
  quarter_id: string;
  twh_contributions_usd: number;
  twh_distributions_usd: number;
  twh_nav_usd: number;
};
type CashFlow = { date: string; amount_usd: number };

type Fund = {
  id: string;
  name: string;
  short_name: string | null;
  start_date: string | null;
  reporting_currency: string;
  native_currency: string;
};

type HistoryRow = {
  quarter: Quarter;
  contrib: number;
  distrib: number;
  nav: number;
  dpi: number | null;
  tvpi: number | null;
  irr: number | null;
};

export default function FundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [fund, setFund] = useState<Fund | null>(null);
  const [commitment, setCommitment] = useState<{ twh: number; total: number; pct: number } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { selected } = useSelectedQuarter();
  const { rate: fxRate, updaterName: fxUpdater } = useFundFxRate(
    fund?.id ?? null,
    selected?.id ?? null,
    fund?.native_currency ?? null,
  );
  const [holdings, setHoldings] = useState<{ id: string; company_id: string; company: string; round: string | null; instrument: string | null; investment_date: string | null; cost: number | null; fmv: number | null; status: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      const [{ data: f }, { data: c }, { data: snaps }, { data: quarters }, { data: flows }] = await Promise.all([
        supabase.from("funds").select("id, name, short_name, start_date, reporting_currency, native_currency").eq("id", id).maybeSingle(),
        supabase.from("fund_commitments").select("twh_commitment_usd, total_fund_commitment_usd, twh_ownership_pct").eq("fund_id", id).maybeSingle(),
        supabase.from("fund_quarter_snapshots").select("quarter_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd").eq("fund_id", id),
        supabase.from("quarters").select("id, label, quarter_end_date").order("quarter_end_date", { ascending: true }),
        supabase.from("cash_flows").select("date, amount_usd").eq("scope", "twh_net").eq("fund_id", id),
      ]);

      setFund((f as Fund) ?? null);
      if (c) {
        setCommitment({
          twh: Number((c as any).twh_commitment_usd ?? 0),
          total: Number((c as any).total_fund_commitment_usd ?? 0),
          pct: Number((c as any).twh_ownership_pct ?? 0),
        });
      }

      const snapByQ = new Map<string, Snap>();
      (snaps ?? []).forEach((s: any) =>
        snapByQ.set(s.quarter_id, {
          quarter_id: s.quarter_id,
          twh_contributions_usd: Number(s.twh_contributions_usd ?? 0),
          twh_distributions_usd: Number(s.twh_distributions_usd ?? 0),
          twh_nav_usd: Number(s.twh_nav_usd ?? 0),
        }),
      );

      const allFlows: CashFlow[] = (flows ?? []).map((cf: any) => ({ date: cf.date, amount_usd: Number(cf.amount_usd) }));

      const rows: HistoryRow[] = (quarters ?? [])
        .filter((q: any) => snapByQ.has(q.id))
        .map((q: any) => {
          const s = snapByQ.get(q.id)!;
          const dpi = calcDpi(s.twh_contributions_usd, s.twh_distributions_usd);
          const tvpi = calcTvpi(s.twh_contributions_usd, s.twh_distributions_usd, s.twh_nav_usd);
          const flowsThruQ = allFlows.filter((cf) => cf.date <= q.quarter_end_date);
          const irr = computeXirr(flowsThruQ, s.twh_nav_usd, q.quarter_end_date);
          return { quarter: q, contrib: s.twh_contributions_usd, distrib: s.twh_distributions_usd, nav: s.twh_nav_usd, dpi, tvpi, irr };
        });
      setHistory(rows);
      setLoading(false);
    })();
  }, [id]);

  // Load holdings for the currently-selected quarter (separate effect so the
  // section refreshes when the user changes the global quarter).
  useEffect(() => {
    if (!id || !selected?.id) { setHoldings([]); return; }
    (async () => {
      const { data } = await supabase
        .from("underlying_holdings")
        .select("id, company_id, fund_cost_usd, fund_fmv_usd, round, instrument, investment_date, companies(legal_name, commercial_name, status)")
        .eq("fund_id", id)
        .eq("quarter_id", selected.id)
        .is("removed_at", null);
      setHoldings(
        (data ?? []).map((h: any) => ({
          id: h.id,
          company_id: h.company_id,
          company: h.companies?.commercial_name ?? h.companies?.legal_name ?? "—",
          round: h.round ?? null,
          instrument: h.instrument ?? null,
          investment_date: h.investment_date ?? null,
          cost: h.fund_cost_usd == null ? null : Number(h.fund_cost_usd),
          fmv: h.fund_fmv_usd == null ? null : Number(h.fund_fmv_usd),
          status: (h.companies?.status?.trim()) || "Active",
        })),
      );
    })();
  }, [id, selected?.id]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!fund) return <div className="p-8 text-muted-foreground">Fund not found.</div>;

  const navChart = history.map((r) => ({
    label: r.quarter.label,
    NAV: r.nav,
    Distributions: r.distrib,
    Contributions: r.contrib,
  }));
  const ratioChart = history.map((r) => ({
    label: r.quarter.label,
    TVPI: r.tvpi != null ? Number(r.tvpi.toFixed(4)) : null,
    DPI: r.dpi != null ? Number(r.dpi.toFixed(4)) : null,
    IRR: r.irr != null ? Number((r.irr * 100).toFixed(2)) : null,
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/funds" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3 w-3" /> All funds
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{fund.short_name ?? fund.name}</h1>
          <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
            <span>
              {fund.short_name ? fund.name + " · " : ""}Started {fmtDate(fund.start_date)} · {fund.reporting_currency}
              {fund.native_currency && fund.native_currency !== "USD" ? ` (native ${fund.native_currency})` : ""}
            </span>
            {fund.native_currency && fund.native_currency !== "USD" && (
              <FxBadge rate={fxRate} fromCurrency={fund.native_currency} updaterName={fxUpdater} />
            )}
          </p>
        </div>
      </div>

      {/* Commitment summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="TWH Commitment" value={fmtUSD(commitment?.twh ?? 0, { compact: true })} />
        <Stat label="Total Fund Commitment" value={fmtUSD(commitment?.total ?? 0, { compact: true })} />
        <Stat label="TWH Ownership %" value={fmtPct(commitment?.pct ?? 0, 2)} />
        <Stat label="Quarters with data" value={`${history.length}`} />
      </div>

      {/* Charts */}
      {history.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border p-4">
            <div className="text-sm font-medium mb-3">NAV trajectory</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={navChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => fmtUSD(v, { compact: true })} />
                  <RTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    formatter={(v: any) => fmtUSD(Number(v), { compact: true })}
                  />
                  <Line type="monotone" dataKey="NAV" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Contributions" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="Distributions" stroke="hsl(var(--chart-2, var(--accent)))" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="bg-card border-border p-4">
            <div className="text-sm font-medium mb-3">TVPI / DPI / IRR over time</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ratioChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v.toFixed(2)}x`} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <RTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="TVPI" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="DPI" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="IRR" stroke="hsl(var(--accent))" strokeWidth={1.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* History table */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-semibold">Quarterly history</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Per-quarter TWH position in this fund.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Quarter</TableHead>
                <TableHead>Quarter end</TableHead>
                <TableHead className="text-right">Contributions</TableHead>
                <TableHead className="text-right">Distributions</TableHead>
                <TableHead className="text-right">NAV</TableHead>
                <TableHead className="text-right">DPI</TableHead>
                <TableHead className="text-right">TVPI</TableHead>
                <TableHead className="text-right">Net IRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-12 text-center">No quarterly data yet for this fund.</TableCell>
                </TableRow>
              ) : (
                history.map((r) => (
                  <TableRow key={r.quarter.id} className="table-row-hover">
                    <TableCell className="font-medium">{r.quarter.label}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.quarter.quarter_end_date)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(r.contrib, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(r.distrib, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(r.nav, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(r.dpi)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(r.tvpi)}</TableCell>
                    <TableCell className="text-right font-mono">{r.irr != null ? fmtPct(r.irr, 1) : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Underlying holdings for the selected quarter */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Underlying holdings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Portfolio companies held by this fund as of {selected?.label ?? "the selected quarter"}.</p>
          </div>
          <span className="text-xs text-muted-foreground">{holdings.length} {holdings.length === 1 ? "company" : "companies"}</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Company</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Investment date</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">FMV</TableHead>
                <TableHead className="text-right">MOIC</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">No holdings recorded for this quarter.</TableCell></TableRow>
              ) : (
                <GroupedHoldings holdings={holdings} />
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-card border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold font-mono mt-1">{value}</div>
    </Card>
  );
}

type Holding = { id: string; company_id: string; company: string; round: string | null; instrument: string | null; investment_date: string | null; cost: number | null; fmv: number | null; status: string };

function GroupedHoldings({ holdings }: { holdings: Holding[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, { company_id: string; company: string; status: string; items: Holding[] }>();
    for (const h of holdings) {
      const g = m.get(h.company_id) ?? { company_id: h.company_id, company: h.company, status: h.status, items: [] };
      g.items.push(h);
      m.set(h.company_id, g);
    }
    return [...m.values()]
      .map((g) => {
        const cost = g.items.reduce<number | null>((a, h) => (h.cost == null ? a : (a ?? 0) + h.cost), null);
        const fmv = g.items.reduce<number | null>((a, h) => (h.fmv == null ? a : (a ?? 0) + h.fmv), null);
        return { ...g, cost, fmv };
      })
      .sort((a, b) => (b.fmv ?? 0) - (a.fmv ?? 0));
  }, [holdings]);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <>
      {groups.map((g) => {
        const moic = g.cost && g.cost > 0 && g.fmv != null ? g.fmv / g.cost : null;
        const multi = g.items.length > 1;
        const isOpen = !!open[g.company_id];
        const single = !multi ? g.items[0] : null;
        return (
          <Fragment key={g.company_id}>
            <TableRow
              className={`border-t-2 border-border/60 hover:bg-muted/30 ${multi ? "cursor-pointer" : ""}`}
              onClick={multi ? () => setOpen((o) => ({ ...o, [g.company_id]: !o[g.company_id] })) : undefined}
            >
              <TableCell className="font-semibold">
                <div className="flex items-center gap-1.5">
                  {multi ? (
                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  ) : (
                    <span className="inline-block w-3.5" />
                  )}
                  <Link
                    to={`/portfolio?company=${g.company_id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {g.company}
                  </Link>
                  {multi && <span className="text-[10px] text-muted-foreground ml-1">({g.items.length})</span>}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{single?.round ?? ""}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{single?.instrument ?? ""}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{single?.investment_date ? fmtDate(single.investment_date) : ""}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{g.cost == null ? "—" : fmtUSD(g.cost, { compact: true })}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{g.fmv == null ? "—" : fmtUSD(g.fmv, { compact: true })}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{fmtMultiple(moic)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{g.status}</TableCell>
            </TableRow>
            {multi && isOpen && g.items.map((h) => {
              const m = h.cost && h.cost > 0 && h.fmv != null ? h.fmv / h.cost : null;
              return (
                <TableRow key={h.id} className="bg-muted/10 hover:bg-muted/20">
                  <TableCell className="pl-10" />
                  <TableCell className="text-xs text-muted-foreground">{h.round ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{h.instrument ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{h.investment_date ? fmtDate(h.investment_date) : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{h.cost == null ? "—" : fmtUSD(h.cost, { compact: true })}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{h.fmv == null ? "—" : fmtUSD(h.fmv, { compact: true })}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmtMultiple(m)}</TableCell>
                  <TableCell />
                </TableRow>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
