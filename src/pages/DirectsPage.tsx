import { useEffect, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtUSD, fmtMultiple, fmtDate, calcMoic, signClass } from "@/lib/format";
import MetricTooltip, { fmtUsdFull, fmtMultFull } from "@/components/MetricTooltip";

type Row = {
  id: string;
  company: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  cost: number;
  fmv: number;
  proceeds: number;
};

export default function DirectsPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("directs")
        .select("id, investment_date, instrument, round, twh_cost_usd, companies(legal_name, commercial_name), direct_quarter_snapshots(quarter_id, twh_fmv_usd, twh_proceeds_usd)")
        .order("investment_date", { ascending: false });

      const out: Row[] = (data ?? []).map((d: any) => {
        const snap = (d.direct_quarter_snapshots ?? []).find((s: any) => s.quarter_id === selected.id) ?? {};
        return {
          id: d.id,
          company: d.companies?.commercial_name ?? d.companies?.legal_name ?? "—",
          investment_date: d.investment_date,
          instrument: d.instrument,
          round: d.round,
          cost: Number(d.twh_cost_usd ?? 0),
          fmv: Number(snap.twh_fmv_usd ?? 0),
          proceeds: Number(snap.twh_proceeds_usd ?? 0),
        };
      });
      setRows(out);
      setLoading(false);
    })();
  }, [selected]);

  const totals = rows.reduce(
    (a, r) => ({ cost: a.cost + r.cost, fmv: a.fmv + r.fmv, proceeds: a.proceeds + r.proceeds }),
    { cost: 0, fmv: 0, proceeds: 0 }
  );
  const totalMoic = calcMoic(totals.cost, totals.fmv, totals.proceeds);

  if (qLoading || !selected) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Direct Investments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} positions · {selected.label}
        </p>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">FMV</TableHead>
                <TableHead className="text-right">Proceeds</TableHead>
                <TableHead className="text-right">MOIC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">No directs in this quarter</TableCell></TableRow>
              ) : (
                <>
                  {rows.map((r) => {
                    const moic = calcMoic(r.cost, r.fmv, r.proceeds);
                    const gain = r.fmv + r.proceeds - r.cost;
                    return (
                      <TableRow key={r.id} className="table-row-hover">
                        <TableCell className="font-medium">{r.company}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(r.investment_date)}</TableCell>
                        <TableCell>{r.round ? <Badge variant="secondary" className="font-normal">{r.round}</Badge> : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.instrument ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.cost, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.fmv, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.proceeds, { compact: true })}</TableCell>
                        <TableCell className={`text-right font-mono ${signClass(gain)}`}>{fmtMultiple(moic)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.cost, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.fmv, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.proceeds, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(totalMoic)}</TableCell>
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
