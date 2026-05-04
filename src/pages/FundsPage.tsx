import { useEffect, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import AddReportWizard from "@/components/AddReportWizard";
import { fmtUSD, fmtPct, fmtMultiple, calcTvpi, calcDpi, fmtDate } from "@/lib/format";
import MetricTooltip, { fmtUsdFull, fmtPctFull, fmtMultFull } from "@/components/MetricTooltip";
import { computeXirr } from "@/lib/irr";

type ReportStatus = "confirmed" | "in_review" | "missing";
type ReportFile = { id: string; file_name: string; committed_to_db: boolean };

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
  irr: number | null;
  cf_count: number;
  report_status: ReportStatus;
  report_files: ReportFile[];
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
      const [{ data: funds }, { data: docs }, { data: reports }, { data: flows }] = await Promise.all([
        supabase
          .from("funds")
          .select("id, name, short_name, start_date, fund_commitments(total_fund_commitment_usd, twh_commitment_usd, twh_ownership_pct), fund_quarter_snapshots(quarter_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_nav_usd, confirmed_at)")
          .eq("archived", false)
          .order("name"),
        supabase
          .from("source_documents")
          .select("fund_id, status")
          .eq("quarter_id", selected.id)
          .eq("doc_type", "fund_report"),
        supabase
          .from("reports")
          .select("id, file_name, fund_id, committed_to_db, uploaded_at")
          .eq("quarter_id", selected.id)
          .eq("archived", false)
          .order("uploaded_at", { ascending: false }),
        supabase
          .from("cash_flows")
          .select("fund_id, date, amount_usd")
          .eq("scope", "twh_net")
          .lte("date", selected.quarter_end_date),
      ]);

      const docsByFund = new Map<string, string[]>();
      (docs ?? []).forEach((d: any) => {
        if (!d.fund_id) return;
        const arr = docsByFund.get(d.fund_id) ?? [];
        arr.push(d.status);
        docsByFund.set(d.fund_id, arr);
      });

      const reportsByFund = new Map<string, ReportFile[]>();
      (reports ?? []).forEach((r: any) => {
        if (!r.fund_id) return;
        const arr = reportsByFund.get(r.fund_id) ?? [];
        arr.push({ id: r.id, file_name: r.file_name, committed_to_db: r.committed_to_db });
        reportsByFund.set(r.fund_id, arr);
      });

      const flowsByFund = new Map<string, { date: string; amount_usd: number }[]>();
      (flows ?? []).forEach((cf: any) => {
        if (!cf.fund_id) return;
        const arr = flowsByFund.get(cf.fund_id) ?? [];
        arr.push({ date: cf.date, amount_usd: Number(cf.amount_usd) });
        flowsByFund.set(cf.fund_id, arr);
      });

      const out: FundRow[] = (funds ?? []).map((f: any) => {
        const c = f.fund_commitments?.[0] ?? {};
        const snap = (f.fund_quarter_snapshots ?? []).find((s: any) => s.quarter_id === selected.id) ?? {};
        const hasDocs = (docsByFund.get(f.id) ?? []).length > 0;
        const confirmed = !!snap.confirmed_at;
        const report_status: ReportStatus = confirmed
          ? "confirmed"
          : hasDocs || snap.quarter_id
          ? "in_review"
          : "missing";
        const fundFlows = flowsByFund.get(f.id) ?? [];
        const nav = Number(snap.twh_nav_usd ?? 0);
        const irr = computeXirr(fundFlows, nav, selected.quarter_end_date);
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
          twh_nav_usd: nav,
          fund_total_contributions_usd: Number(snap.fund_total_contributions_usd ?? 0),
          fund_total_nav_usd: Number(snap.fund_total_nav_usd ?? 0),
          irr,
          cf_count: fundFlows.length,
          report_status,
          report_files: reportsByFund.get(f.id) ?? [],
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funds</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} funds · {selected.label}
          </p>
        </div>
        <Button onClick={() => { setWizardFundId(null); setWizardOpen(true); }} className="gap-2">
          <Upload className="h-4 w-4" /> Add report
        </Button>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Fund</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Start</TableHead>
                <TableHead className="text-right">TWH Commit</TableHead>
                <TableHead className="text-right">TWH %</TableHead>
                <TableHead className="text-right">Contributions</TableHead>
                <TableHead className="text-right">Distributions</TableHead>
                <TableHead className="text-right">NAV</TableHead>
                <TableHead className="text-right">DPI</TableHead>
                <TableHead className="text-right">TVPI</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-muted-foreground py-12 text-center">No funds yet</TableCell></TableRow>
              ) : (
                <>
                  {rows.map((r) => {
                    const tvpi = calcTvpi(r.twh_contributions_usd, r.twh_distributions_usd, r.twh_nav_usd);
                    const dpi = calcDpi(r.twh_contributions_usd, r.twh_distributions_usd);
                    const fundLabel = r.short_name ?? r.name;
                    const qLabel = selected.label;
                    const hasContrib = r.twh_contributions_usd > 0;
                    return (
                      <TableRow key={r.id} className="table-row-hover">
                        <TableCell className="font-medium max-w-[280px] truncate">{fundLabel}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {r.report_status === "confirmed" ? (
                              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-medium w-fit">Confirmed</Badge>
                            ) : r.report_status === "in_review" ? (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-medium w-fit">In review</Badge>
                            ) : (
                              <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-medium w-fit">Missing</Badge>
                            )}
                            {r.report_files.length > 0 && (
                              <div className="flex flex-col gap-0.5">
                                {r.report_files.slice(0, 3).map((f) => (
                                  <Link
                                    key={f.id}
                                    to={`/reports/${f.id}`}
                                    title={f.file_name}
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors max-w-[220px]"
                                  >
                                    <FileText className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{f.file_name}</span>
                                  </Link>
                                ))}
                                {r.report_files.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{r.report_files.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(r.start_date)}</TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind="input"
                            title="TWH Commitment"
                            source={`Subscription document for ${fundLabel}`}
                          >
                            {fmtUSD(r.twh_commitment_usd, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          <MetricTooltip
                            kind={r.total_fund_commitment_usd > 0 ? "derived" : "missing"}
                            title="TWH Ownership %"
                            formula={{
                              expression: "TWH Commitment ÷ Total Fund Commitment",
                              parts: [
                                { label: "TWH Commitment", value: fmtUsdFull(r.twh_commitment_usd) },
                                { label: "Total Commitment", value: fmtUsdFull(r.total_fund_commitment_usd) },
                              ],
                              result: fmtPctFull(r.twh_ownership_pct, 2),
                            }}
                            missingInputs={["Total Fund Commitment"]}
                          >
                            {fmtPct(r.twh_ownership_pct, 2)}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind="input"
                            title="TWH Contributions"
                            source={`Capital call records — sum of TWH contributions to ${fundLabel} through ${qLabel}`}
                          >
                            {fmtUSD(r.twh_contributions_usd, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind="input"
                            title="TWH Distributions"
                            source={`Distribution records — sum of TWH distributions received from ${fundLabel} through ${qLabel}`}
                          >
                            {fmtUSD(r.twh_distributions_usd, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind="input"
                            title="TWH NAV"
                            source={`Capital Account Statement (PCAP)\nfrom ${fundLabel} admin\nfor ${qLabel}`}
                          >
                            {fmtUSD(r.twh_nav_usd, { compact: true })}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind={hasContrib ? "derived" : "missing"}
                            title="DPI (Distributions to Paid-In)"
                            formula={{
                              expression: "TWH Distributions ÷ TWH Contributions",
                              parts: [
                                { label: "TWH Distributions", value: fmtUsdFull(r.twh_distributions_usd) },
                                { label: "TWH Contributions", value: fmtUsdFull(r.twh_contributions_usd) },
                              ],
                              result: fmtMultFull(dpi),
                            }}
                            missingInputs={["TWH Contributions"]}
                          >
                            {fmtMultiple(dpi)}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <MetricTooltip
                            kind={hasContrib ? "derived" : "missing"}
                            title="TVPI (Total Value to Paid-In)"
                            formula={{
                              expression: "(TWH NAV + TWH Distributions) ÷ TWH Contributions",
                              parts: [
                                { label: "TWH NAV", value: fmtUsdFull(r.twh_nav_usd) },
                                { label: "TWH Distributions", value: fmtUsdFull(r.twh_distributions_usd) },
                                { label: "TWH Contributions", value: fmtUsdFull(r.twh_contributions_usd) },
                              ],
                              result: fmtMultFull(tvpi),
                            }}
                            missingInputs={["TWH Contributions"]}
                          >
                            {fmtMultiple(tvpi)}
                          </MetricTooltip>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => { setWizardFundId(r.id); setWizardOpen(true); }}>
                            <Upload className="h-3 w-3" /> Add
                          </Button>
                        </TableCell>
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
                    <TableCell></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddReportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        defaultFundId={wizardFundId}
        defaultQuarterId={selected.id}
        onConfirmed={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
