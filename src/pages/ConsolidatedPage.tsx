import { useEffect, useMemo, useState } from "react";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { fmtUSD, fmtPct, fmtMultiple, fmtDate, calcDpi, calcTvpi, signClass } from "@/lib/format";
import MetricTooltip, { fmtUsdFull, fmtMultFull, fmtPctFull, type MetricTooltipProps } from "@/components/MetricTooltip";
import EstimatedBadge from "@/components/EstimatedBadge";
import { deriveTwhWithFallback } from "@/lib/twhDerivation";
import { computeXirr } from "@/lib/irr";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import InvestorsTab from "@/components/investors/InvestorsTab";

const LEDGER_CATEGORIES = [
  "Capital Call",
  "Distribution",
  "Management Fee",
  "Expense",
  "Direct Investment",
  "Direct Proceeds",
  "NAV",
  "Other",
] as const;

// Outflows from TWH (negative cash impact for TWH) — used to compute Contributions
const OUTFLOW_CATS = new Set(["Capital Call", "Management Fee", "Expense", "Direct Investment"]);
// Inflows to TWH — Distributions
const INFLOW_CATS = new Set(["Distribution", "Direct Proceeds"]);
// NAV is a balance snapshot — never accumulated, replaced quarter-to-quarter
const NAV_CAT = "NAV";

type LedgerEntry = {
  id: string;
  date: string;
  category: string;
  counterparty: string | null;
  description: string | null;
  amount_usd: number;
  reconciled: boolean;
};

type AggregateMetrics = {
  contributions: number;
  distributions: number;
  nav: number;
  commitment: number;
  estimated: boolean;
};

export default function ConsolidatedPage() {
  const { selected, loading: qLoading } = useSelectedQuarter();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [agg, setAgg] = useState<AggregateMetrics>({ contributions: 0, distributions: 0, nav: 0, commitment: 0, estimated: false });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: "Capital Call" as (typeof LEDGER_CATEGORIES)[number],
    description: "",
    amount_usd: "",
  });
  const [history, setHistory] = useState<{
    quarter: { id: string; label: string; quarter_end_date: string };
    contrib: number;
    distrib: number;
    nav: number;
    dpi: number | null;
    tvpi: number | null;
    irr: number | null;
  }[]>([]);
  const [saving, setSaving] = useState(false);

  // Load ledger + aggregate snapshot data + history across quarters
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      const [
        { data: ledger },
        { data: allSnaps },
        { data: commits },
        { data: investors },
        { data: quarters },
        { data: flows },
      ] = await Promise.all([
        supabase
          .from("twh_ledger_entries")
          .select("id, date, category, counterparty, description, amount_usd, reconciled")
          .order("date", { ascending: false }),
        supabase
          .from("fund_quarter_snapshots")
          .select("fund_id, quarter_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_distributions_usd, fund_total_nav_usd"),
        supabase.from("fund_commitments").select("fund_id, twh_ownership_pct"),
        supabase.from("investors").select("commitment_amount"),
        supabase.from("quarters").select("id, label, quarter_end_date").order("quarter_end_date", { ascending: true }),
        supabase.from("cash_flows").select("date, amount_usd").eq("scope", "twh_net"),
      ]);

      setEntries((ledger ?? []) as LedgerEntry[]);

      const pctMap = new Map((commits ?? []).map((c: any) => [c.fund_id, Number(c.twh_ownership_pct ?? 0)]));

      // Total commitments from investors → TWH
      const investorCommitment = (investors ?? []).reduce(
        (s: number, i: any) => s + Number(i.commitment_amount ?? 0),
        0,
      );

      // Aggregate per quarter
      type QAgg = { contributions: number; distributions: number; nav: number; estimated: boolean };
      const byQuarter = new Map<string, QAgg>();
      (allSnaps ?? []).forEach((s: any) => {
        const d = deriveTwhWithFallback(s, pctMap.get(s.fund_id) ?? 0);
        const cur = byQuarter.get(s.quarter_id) ?? { contributions: 0, distributions: 0, nav: 0, estimated: false };
        cur.contributions += d.contributions;
        cur.distributions += d.distributions;
        cur.nav += d.nav;
        if (d.estimated) cur.estimated = true;
        byQuarter.set(s.quarter_id, cur);
      });

      const current = byQuarter.get(selected.id) ?? { contributions: 0, distributions: 0, nav: 0, estimated: false };
      setAgg({
        contributions: current.contributions,
        distributions: current.distributions,
        nav: current.nav,
        commitment: investorCommitment,
        estimated: current.estimated,
      });

      const allFlows = (flows ?? []).map((cf: any) => ({ date: cf.date, amount_usd: Number(cf.amount_usd) }));
      const hist = (quarters ?? [])
        .filter((q: any) => byQuarter.has(q.id))
        .map((q: any) => {
          const a = byQuarter.get(q.id)!;
          const dpi = calcDpi(a.contributions, a.distributions);
          const tvpi = calcTvpi(a.contributions, a.distributions, a.nav);
          const flowsThruQ = allFlows.filter((cf) => cf.date <= q.quarter_end_date);
          const irr = computeXirr(flowsThruQ, a.nav, q.quarter_end_date);
          return { quarter: q, contrib: a.contributions, distrib: a.distributions, nav: a.nav, dpi, tvpi, irr };
        });
      setHistory(hist);

      setLoading(false);
    })();
  }, [selected, refreshKey]);

  // Split entries: NAV (balance snapshots) vs cash flow
  const navEntries = useMemo(() => entries.filter((e) => e.category === NAV_CAT), [entries]);
  const cashFlowEntries = useMemo(() => entries.filter((e) => e.category !== NAV_CAT), [entries]);

  // Reconciliation: ledger-derived totals vs snapshot-derived totals
  const ledgerTotals = useMemo(() => {
    let contrib = 0;
    let distrib = 0;
    for (const e of cashFlowEntries) {
      const amt = Math.abs(Number(e.amount_usd));
      if (OUTFLOW_CATS.has(e.category)) contrib += amt;
      else if (INFLOW_CATS.has(e.category)) distrib += amt;
    }
    return { contrib, distrib };
  }, [cashFlowEntries]);

  const tvpi = calcTvpi(agg.contributions, agg.distributions, agg.nav);
  const dpi = calcDpi(agg.contributions, agg.distributions);
  const rvpi = agg.contributions ? agg.nav / agg.contributions : null;
  const calledPct = agg.commitment ? agg.contributions / agg.commitment : null;
  const netCashFlow = agg.distributions - agg.contributions;

  const handleAdd = async () => {
    const amt = parseFloat(form.amount_usd);
    if (!form.date || !form.category || Number.isNaN(amt)) {
      toast.error("Date, category and amount are required");
      return;
    }
    setSaving(true);
    // Sign convention: outflows negative, inflows positive, NAV stored as positive balance
    const signedAmount = form.category === NAV_CAT
      ? Math.abs(amt)
      : OUTFLOW_CATS.has(form.category) ? -Math.abs(amt) : Math.abs(amt);
    const { error } = await supabase.from("twh_ledger_entries").insert({
      date: form.date,
      category: form.category,
      counterparty: null,
      description: form.description || null,
      amount_usd: signedAmount,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry added");
    setAddOpen(false);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      category: "Capital Call",
      description: "",
      amount_usd: "",
    });
    setRefreshKey((k) => k + 1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this ledger entry?")) return;
    const { error } = await supabase.from("twh_ledger_entries").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    setRefreshKey((k) => k + 1);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "investors" ? "investors" : "portfolio";
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "portfolio") next.delete("tab"); else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  const reconDelta = ledgerTotals.contrib - agg.contributions;
  const reconWarn = Math.abs(reconDelta) > 1; // > $1 mismatch

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">TWH Consolidated</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aggregate position across all funds and direct investments{selected ? ` · ${selected.label}` : ""}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="investors">Investors</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-6 mt-6">
          {qLoading || !selected ? (
            <div className="text-muted-foreground py-12 text-center">Loading…</div>
          ) : (
            <>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi
          label="Commitment"
          value={fmtUSD(agg.commitment, { compact: true })}
          tip={{ kind: "input", title: "Total Commitment", source: "Sum of TWH commitments across all funds (subscription documents)" }}
        />
        <Kpi
          label="Called"
          value={fmtUSD(agg.contributions, { compact: true })}
          sub={calledPct != null ? fmtPct(calledPct, 1) : undefined}
          tip={{
            kind: "derived",
            title: "% Called",
            formula: {
              expression: "TWH Contributions ÷ TWH Commitment",
              parts: [
                { label: "TWH Contributions", value: fmtUsdFull(agg.contributions) },
                { label: "TWH Commitment", value: fmtUsdFull(agg.commitment) },
              ],
              result: fmtPctFull(calledPct, 1),
            },
          }}
        />
        <Kpi
          label="Distributed"
          value={fmtUSD(agg.distributions, { compact: true })}
          tip={{ kind: "input", title: "TWH Distributions", source: "Sum of TWH distributions received across all funds (distribution records)" }}
        />
        <Kpi
          label="NAV"
          value={fmtUSD(agg.nav, { compact: true })}
          tip={{ kind: "input", title: "TWH NAV", source: "Sum of TWH NAV across all funds (Capital Account Statements)" }}
        />
        <Kpi
          label="Net Cash Flow"
          value={fmtUSD(netCashFlow, { compact: true })}
          valueClass={signClass(netCashFlow)}
          tip={{
            kind: "derived",
            title: "Net Cash Flow",
            formula: {
              expression: "TWH Distributions − TWH Contributions",
              parts: [
                { label: "TWH Distributions", value: fmtUsdFull(agg.distributions) },
                { label: "TWH Contributions", value: fmtUsdFull(agg.contributions) },
              ],
              result: fmtUsdFull(netCashFlow),
            },
          }}
        />
        <Kpi
          label="DPI"
          value={fmtMultiple(dpi)}
          tip={{
            kind: dpi == null ? "missing" : "derived",
            title: "DPI (Distributions to Paid-In)",
            formula: {
              expression: "TWH Distributions ÷ TWH Contributions",
              parts: [
                { label: "TWH Distributions", value: fmtUsdFull(agg.distributions) },
                { label: "TWH Contributions", value: fmtUsdFull(agg.contributions) },
              ],
              result: fmtMultFull(dpi),
            },
            missingInputs: ["TWH Contributions"],
          }}
        />
        <Kpi
          label="TVPI"
          value={fmtMultiple(tvpi)}
          sub={rvpi != null ? `RVPI ${fmtMultiple(rvpi)}` : undefined}
          tip={{
            kind: tvpi == null ? "missing" : "derived",
            title: "TVPI (Total Value to Paid-In)",
            formula: {
              expression: "(TWH NAV + TWH Distributions) ÷ TWH Contributions",
              parts: [
                { label: "TWH NAV", value: fmtUsdFull(agg.nav) },
                { label: "TWH Distributions", value: fmtUsdFull(agg.distributions) },
                { label: "TWH Contributions", value: fmtUsdFull(agg.contributions) },
              ],
              result: fmtMultFull(tvpi),
            },
            missingInputs: ["TWH Contributions"],
          }}
        />
      </div>

      {agg.estimated && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <EstimatedBadge />
          <span>Some funds report fund-level totals only; TWH share is estimated via ownership % until PCAPs are processed.</span>
        </div>
      )}

      {/* Reconciliation banner */}
      {reconWarn && entries.length > 0 && (
        <Card className="bg-card border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Ledger ↔ snapshot reconciliation</div>
              <div className="text-xs text-muted-foreground mt-1">
                Ledger contributions <span className="font-mono">{fmtUSD(ledgerTotals.contrib, { compact: true })}</span> ·
                Snapshot contributions <span className="font-mono">{fmtUSD(agg.contributions, { compact: true })}</span> ·
                Δ <span className={`font-mono ${signClass(reconDelta)}`}>{fmtUSD(reconDelta, { compact: true })}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Net Cash Flow Ledger */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold">Net Cash Flow Ledger</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              All TWH-level transactions. Terminal NAV reflects the current selected quarter.
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add ledger entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEDGER_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Counterparty</Label>
                  <Input placeholder="Fund or company" value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Enter as positive; sign applied automatically"
                    value={form.amount_usd}
                    onChange={(e) => setForm({ ...form, amount_usd: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Outflows (Capital Call, Fees, Expense, Direct Investment) stored negative; inflows stored positive.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Input placeholder="Optional note" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Add entry"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Terminal NAV — fixed top row */}
              <TableRow className="bg-muted/30 hover:bg-muted/40 font-medium">
                <TableCell>{fmtDate(selected.quarter_end_date)}</TableCell>
                <TableCell>Terminal NAV</TableCell>
                <TableCell className="text-muted-foreground">All funds + directs</TableCell>
                <TableCell className="text-muted-foreground">Quarter-end portfolio valuation</TableCell>
                <TableCell className="text-right font-mono">{fmtUSD(agg.nav, { compact: true })}</TableCell>
                <TableCell></TableCell>
              </TableRow>

              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground py-12 text-center">No ledger entries yet — add the first capital call above.</TableCell></TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id} className="table-row-hover">
                    <TableCell>{fmtDate(e.date)}</TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell className="text-muted-foreground">{e.counterparty ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[320px] truncate">{e.description ?? "—"}</TableCell>
                    <TableCell className={`text-right font-mono ${signClass(Number(e.amount_usd))}`}>
                      {fmtUSD(Number(e.amount_usd), { compact: true })}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="investors" className="mt-6">
          <InvestorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueClass,
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  tip?: Omit<MetricTooltipProps, "children">;
}) {
  const valueEl = (
    <div className={`text-xl font-semibold font-mono mt-1 ${valueClass ?? ""}`}>{value}</div>
  );
  return (
    <Card className="bg-card border-border p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {tip ? <MetricTooltip {...tip} align="start">{valueEl}</MetricTooltip> : valueEl}
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{sub}</div>}
    </Card>
  );
}
