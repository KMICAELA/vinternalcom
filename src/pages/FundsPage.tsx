import { useEffect, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import AddReportWizard from "@/components/AddReportWizard";
import { fmtUSD, fmtPct, fmtMultiple, calcTvpi, calcDpi, fmtDate } from "@/lib/format";

type FundRow = {
  id: string;
  name: string;
  short_name: string | null;
  start_date: string | null;
  total_fund_commitment_usd: number;
  twh_commitment_usd: number;
  twh_ownership_pct: number;
  twh_contributions_usd: number;
  twh_distributions_usd: number;
  twh_nav_usd: number;
  fund_total_contributions_usd: number;
  fund_total_nav_usd: number;
};

export default function FundsPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [rows, setRows] = useState<FundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardFundId, setWizardFundId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const { data: funds } = await supabase
        .from("funds")
        .select("id, name, short_name, start_date, fund_commitments(total_fund_commitment_usd, twh_commitment_usd, twh_ownership_pct), fund_quarter_snapshots(quarter_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_nav_usd)")
        .eq("archived", false)
        .order("name");

      const out: FundRow[] = (funds ?? []).map((f: any) => {
        const c = f.fund_commitments?.[0] ?? {};
        const snap = (f.fund_quarter_snapshots ?? []).find((s: any) => s.quarter_id === selected.id) ?? {};
        return {
          id: f.id,
          name: f.name,
          short_name: f.short_name,
          start_date: f.start_date,
          total_fund_commitment_usd: Number(c.total_fund_commitment_usd ?? 0),
          twh_commitment_usd: Number(c.twh_commitment_usd ?? 0),
          twh_ownership_pct: Number(c.twh_ownership_pct ?? 0),
          twh_contributions_usd: Number(snap.twh_contributions_usd ?? 0),
          twh_distributions_usd: Number(snap.twh_distributions_usd ?? 0),
          twh_nav_usd: Number(snap.twh_nav_usd ?? 0),
          fund_total_contributions_usd: Number(snap.fund_total_contributions_usd ?? 0),
          fund_total_nav_usd: Number(snap.fund_total_nav_usd ?? 0),
        };
      });
      out.sort((a, b) => b.twh_nav_usd - a.twh_nav_usd);
      setRows(out);
      setLoading(false);
    })();
  }, [selected, refreshKey]);

  const totals = rows.reduce(
    (a, r) => ({
      commit: a.commit + r.twh_commitment_usd,
      contrib: a.contrib + r.twh_contributions_usd,
      distrib: a.distrib + r.twh_distributions_usd,
      nav: a.nav + r.twh_nav_usd,
    }),
    { commit: 0, contrib: 0, distrib: 0, nav: 0 }
  );

  if (qLoading || !selected) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funds</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} funds · {selected.label}
        </p>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Fund</TableHead>
                <TableHead>Start</TableHead>
                <TableHead className="text-right">TWH Commit</TableHead>
                <TableHead className="text-right">TWH %</TableHead>
                <TableHead className="text-right">Contributions</TableHead>
                <TableHead className="text-right">Distributions</TableHead>
                <TableHead className="text-right">NAV</TableHead>
                <TableHead className="text-right">DPI</TableHead>
                <TableHead className="text-right">TVPI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-muted-foreground py-12 text-center">No funds yet</TableCell></TableRow>
              ) : (
                <>
                  {rows.map((r) => {
                    const tvpi = calcTvpi(r.twh_contributions_usd, r.twh_distributions_usd, r.twh_nav_usd);
                    const dpi = calcDpi(r.twh_contributions_usd, r.twh_distributions_usd);
                    return (
                      <TableRow key={r.id} className="table-row-hover">
                        <TableCell className="font-medium max-w-[280px] truncate">{r.short_name ?? r.name}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(r.start_date)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.twh_commitment_usd, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{fmtPct(r.twh_ownership_pct, 2)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.twh_contributions_usd, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.twh_distributions_usd, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(r.twh_nav_usd, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMultiple(dpi)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMultiple(tvpi)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.commit, { compact: true })}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.contrib, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.distrib, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(totals.nav, { compact: true })}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(calcDpi(totals.contrib, totals.distrib))}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMultiple(calcTvpi(totals.contrib, totals.distrib, totals.nav))}</TableCell>
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
