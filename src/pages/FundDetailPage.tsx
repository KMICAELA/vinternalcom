import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      const [{ data: f }, { data: c }, { data: snaps }, { data: quarters }, { data: flows }] = await Promise.all([
        supabase.from("funds").select("id, name, short_name, start_date, reporting_currency").eq("id", id).maybeSingle(),
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

      // Build a row per quarter that has snapshot data, in chronological order
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
          <p className="text-sm text-muted-foreground mt-1">
            {fund.short_name ? fund.name + " · " : ""}Started {fmtDate(fund.start_date)} · {fund.reporting_currency}
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
