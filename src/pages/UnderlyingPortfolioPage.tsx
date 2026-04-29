import { useEffect, useMemo, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtUSD, fmtMultiple, calcMoic, signClass } from "@/lib/format";

type Row = {
  id: string;
  company: string;
  fund: string;
  round: string | null;
  instrument: string | null;
  cost: number;
  fmv: number;
  proceeds: number;
  twh_pct: number;
};

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
          .select("id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, fund_id, round, instrument, funds(name, short_name), companies(legal_name, commercial_name)")
          .eq("quarter_id", selected.id),
        supabase.from("fund_commitments").select("fund_id, twh_ownership_pct"),
      ]);
      const pctMap = new Map((commits ?? []).map((c: any) => [c.fund_id, Number(c.twh_ownership_pct ?? 0)]));
      const out: Row[] = (holdings ?? []).map((h: any) => ({
        id: h.id,
        company: h.companies?.commercial_name ?? h.companies?.legal_name ?? "—",
        fund: h.funds?.short_name ?? h.funds?.name ?? "—",
        round: h.round ?? null,
        instrument: h.instrument ?? null,
        cost: Number(h.fund_cost_usd ?? 0),
        fmv: Number(h.fund_fmv_usd ?? 0),
        proceeds: Number(h.fund_proceeds_usd ?? 0),
        twh_pct: pctMap.get(h.fund_id) ?? 0,
      }));
      setRows(out);
      setLoading(false);
    })();
  }, [selected]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = !f ? rows : rows.filter((r) => r.company.toLowerCase().includes(f) || r.fund.toLowerCase().includes(f));
    return [...list].sort((a, b) => b.fmv * b.twh_pct - a.fmv * a.twh_pct);
  }, [rows, filter]);

  const totals = filtered.reduce(
    (a, r) => ({
      twh_cost: a.twh_cost + r.cost * r.twh_pct,
      twh_fmv: a.twh_fmv + r.fmv * r.twh_pct,
      twh_proceeds: a.twh_proceeds + r.proceeds * r.twh_pct,
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
                <TableHead>Company</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Fund Cost</TableHead>
                <TableHead className="text-right">Fund FMV</TableHead>
                <TableHead className="text-right">TWH Cost</TableHead>
                <TableHead className="text-right">TWH FMV</TableHead>
                <TableHead className="text-right">MOIC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground py-12 text-center">No holdings</TableCell></TableRow>
              ) : (
                <>
                  {filtered.map((r) => {
                    const moic = calcMoic(r.cost, r.fmv, r.proceeds);
                    const gain = r.fmv + r.proceeds - r.cost;
                    return (
                      <TableRow key={r.id} className="table-row-hover">
                        <TableCell className="font-medium">{r.company}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[260px] truncate">{r.fund}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{fmtUSD(r.cost, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{fmtUSD(r.fmv, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.cost * r.twh_pct, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.fmv * r.twh_pct, { compact: true })}</TableCell>
                        <TableCell className={`text-right font-mono ${signClass(gain)}`}>{fmtMultiple(moic)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell colSpan={4}>TWH Total</TableCell>
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
