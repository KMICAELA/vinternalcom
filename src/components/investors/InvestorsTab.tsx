import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtPct, fmtMultiple, fmtDate, signClass } from "@/lib/format";
import { computeInvestorMetrics, type InvestorSnapshot } from "@/lib/investors/metrics";

type Investor = {
  id: string;
  name: string;
  commitment_amount: number | null;
  commitment_date: string | null;
  notes: string | null;
};

type Quarter = { id: string; label: string; quarter_end_date: string };

type SnapshotRow = {
  id: string | null;
  investor_id: string;
  quarter_id: string;
  contribution_amount: number;
  contribution_date: string | null;
  distribution_amount: number;
  distribution_date: string | null;
  nav_amount: number;
  notes: string | null;
};

export default function InvestorsTab() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [snapshots, setSnapshots] = useState<InvestorSnapshot[] & { investor_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [drawerInvestorId, setDrawerInvestorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [invRes, qRes, snapRes] = await Promise.all([
        supabase.from("investors").select("*").order("name"),
        supabase.from("quarters").select("id,label,quarter_end_date").order("quarter_end_date", { ascending: false }),
        supabase.from("investor_quarter_snapshots").select("*"),
      ]);
      if (cancelled) return;
      if (invRes.error) toast.error(invRes.error.message);
      if (qRes.error) toast.error(qRes.error.message);
      if (snapRes.error) toast.error(snapRes.error.message);
      setInvestors((invRes.data ?? []) as Investor[]);
      setQuarters((qRes.data ?? []) as Quarter[]);
      // Join snapshots with quarter_end_date for metrics
      const qMap = new Map((qRes.data ?? []).map((q: any) => [q.id, q.quarter_end_date]));
      const enriched = (snapRes.data ?? []).map((s: any) => ({
        ...s,
        contribution_amount: Number(s.contribution_amount) || 0,
        distribution_amount: Number(s.distribution_amount) || 0,
        nav_amount: Number(s.nav_amount) || 0,
        quarter_end_date: qMap.get(s.quarter_id) ?? "1970-01-01",
      }));
      setSnapshots(enriched as any);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const metricsByInvestor = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeInvestorMetrics>>();
    for (const inv of investors) {
      const own = snapshots.filter((s: any) => s.investor_id === inv.id);
      map.set(inv.id, computeInvestorMetrics(own));
    }
    return map;
  }, [investors, snapshots]);

  const drawerInvestor = investors.find((i) => i.id === drawerInvestorId) ?? null;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold">Limited Partners</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Investor-level commitments and quarterly activity. Click a row to view history.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Commitment</TableHead>
                <TableHead className="text-right">Total Contributed</TableHead>
                <TableHead className="text-right">Total Distributed</TableHead>
                <TableHead className="text-right">Current NAV</TableHead>
                <TableHead className="text-right">TVPI</TableHead>
                <TableHead className="text-right">IRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : investors.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground py-12 text-center">No investors yet — add the first LP below.</TableCell></TableRow>
              ) : (
                investors.map((inv) => {
                  const m = metricsByInvestor.get(inv.id)!;
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer table-row-hover"
                      onClick={() => setDrawerInvestorId(inv.id)}
                    >
                      <TableCell className="font-medium">{inv.name}</TableCell>
                      <TableCell className="text-right font-mono">{fmtUSD(inv.commitment_amount, { compact: true })}</TableCell>
                      <TableCell className="text-right font-mono">{fmtUSD(m.totalContributed, { compact: true })}</TableCell>
                      <TableCell className="text-right font-mono">{fmtUSD(m.totalDistributed, { compact: true })}</TableCell>
                      <TableCell className="text-right font-mono">{fmtUSD(m.currentNav, { compact: true })}</TableCell>
                      <TableCell className="text-right font-mono">{fmtMultiple(m.tvpi)}</TableCell>
                      <TableCell className={`text-right font-mono ${signClass(m.irr)}`}>{fmtPct(m.irr)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="p-4 border-t border-border">
          <AddInvestorDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            onAdded={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </Card>

      <Sheet open={!!drawerInvestorId} onOpenChange={(o) => !o && setDrawerInvestorId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {drawerInvestor && (
            <InvestorDetail
              investor={drawerInvestor}
              quarters={quarters}
              snapshots={snapshots.filter((s: any) => s.investor_id === drawerInvestor.id) as any}
              onChanged={() => setRefreshKey((k) => k + 1)}
              onDeleted={() => {
                setDrawerInvestorId(null);
                setRefreshKey((k) => k + 1);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AddInvestorDialog({
  open, onOpenChange, onAdded,
}: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", commitment_amount: "", commitment_date: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("investors").insert({
      name: form.name.trim(),
      commitment_amount: form.commitment_amount ? Number(form.commitment_amount) : null,
      commitment_date: form.commitment_date || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Investor added");
    setForm({ name: "", commitment_amount: "", commitment_date: "", notes: "" });
    onOpenChange(false);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add investor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add investor</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Commitment (USD)</Label>
              <Input type="number" step="0.01" value={form.commitment_amount} onChange={(e) => setForm({ ...form, commitment_amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Commitment date</Label>
              <Input type="date" value={form.commitment_date} onChange={(e) => setForm({ ...form, commitment_date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvestorDetail({
  investor, quarters, snapshots, onChanged, onDeleted,
}: {
  investor: Investor;
  quarters: Quarter[];
  snapshots: (InvestorSnapshot & { investor_id: string; id: string | null; notes: string | null })[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  // Build one row per quarter, merged with existing snapshot if any
  const initialRows: SnapshotRow[] = useMemo(() => {
    const byQ = new Map(snapshots.map((s) => [s.quarter_id, s]));
    return quarters.map((q) => {
      const s = byQ.get(q.id);
      return {
        id: s?.id ?? null,
        investor_id: investor.id,
        quarter_id: q.id,
        contribution_amount: s?.contribution_amount ?? 0,
        contribution_date: s?.contribution_date ?? null,
        distribution_amount: s?.distribution_amount ?? 0,
        distribution_date: s?.distribution_date ?? null,
        nav_amount: s?.nav_amount ?? 0,
        notes: s?.notes ?? null,
      };
    });
  }, [investor.id, quarters, snapshots]);

  const [rows, setRows] = useState<SnapshotRow[]>(initialRows);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busyQ, setBusyQ] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setDirty(new Set());
  }, [initialRows]);

  const update = (qid: string, patch: Partial<SnapshotRow>) => {
    setRows((r) => r.map((row) => (row.quarter_id === qid ? { ...row, ...patch } : row)));
    setDirty((d) => new Set(d).add(qid));
  };

  const saveRow = async (row: SnapshotRow) => {
    setBusyQ(row.quarter_id);
    const payload = {
      investor_id: row.investor_id,
      quarter_id: row.quarter_id,
      contribution_amount: Number(row.contribution_amount) || 0,
      contribution_date: row.contribution_date || null,
      distribution_amount: Number(row.distribution_amount) || 0,
      distribution_date: row.distribution_date || null,
      nav_amount: Number(row.nav_amount) || 0,
      notes: row.notes || null,
    };
    const { error } = await supabase
      .from("investor_quarter_snapshots")
      .upsert(payload, { onConflict: "investor_id,quarter_id" });
    setBusyQ(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setDirty((d) => {
      const n = new Set(d);
      n.delete(row.quarter_id);
      return n;
    });
    onChanged();
  };

  const deleteRow = async (row: SnapshotRow) => {
    if (!row.id) {
      // Just clear local
      update(row.quarter_id, {
        contribution_amount: 0, contribution_date: null,
        distribution_amount: 0, distribution_date: null,
        nav_amount: 0, notes: null,
      });
      return;
    }
    if (!confirm("Clear this quarter's data for this LP?")) return;
    setBusyQ(row.quarter_id);
    const { error } = await supabase.from("investor_quarter_snapshots").delete().eq("id", row.id);
    setBusyQ(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cleared");
    onChanged();
  };

  const deleteInvestor = async () => {
    if (!confirm(`Delete investor "${investor.name}" and all their quarterly data? This cannot be undone.`)) return;
    const { error } = await supabase.from("investors").delete().eq("id", investor.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Investor deleted");
    onDeleted();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{investor.name}</SheetTitle>
      </SheetHeader>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Commitment</div>
          <div className="font-mono mt-0.5">{fmtUSD(investor.commitment_amount, { compact: true })}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Commitment Date</div>
          <div className="font-mono mt-0.5">{fmtDate(investor.commitment_date)}</div>
        </div>
        <div className="flex justify-end items-end">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={deleteInvestor}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete LP
          </Button>
        </div>
      </div>
      {investor.notes && (
        <div className="mt-3 text-xs text-muted-foreground border border-border rounded p-3 bg-muted/20">
          {investor.notes}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">Quarterly History</h3>
        {quarters.length === 0 ? (
          <p className="text-xs text-muted-foreground">No quarters defined yet.</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Quarter</TableHead>
                  <TableHead className="text-right">Contribution</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Distribution</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">NAV</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const q = quarters.find((x) => x.id === row.quarter_id)!;
                  const isDirty = dirty.has(row.quarter_id);
                  return (
                    <TableRow key={row.quarter_id} className={isDirty ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium whitespace-nowrap">{q.label}</TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01"
                          className="h-8 text-right font-mono w-28"
                          value={row.contribution_amount || ""}
                          onChange={(e) => update(row.quarter_id, { contribution_amount: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          className="h-8 w-36"
                          value={row.contribution_date ?? ""}
                          onChange={(e) => update(row.quarter_id, { contribution_date: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01"
                          className="h-8 text-right font-mono w-28"
                          value={row.distribution_amount || ""}
                          onChange={(e) => update(row.quarter_id, { distribution_amount: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          className="h-8 w-36"
                          value={row.distribution_date ?? ""}
                          onChange={(e) => update(row.quarter_id, { distribution_date: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01"
                          className="h-8 text-right font-mono w-28"
                          value={row.nav_amount || ""}
                          onChange={(e) => update(row.quarter_id, { nav_amount: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-40"
                          value={row.notes ?? ""}
                          onChange={(e) => update(row.quarter_id, { notes: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            disabled={!isDirty || busyQ === row.quarter_id}
                            onClick={() => saveRow(row)}
                            title="Save"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            disabled={busyQ === row.quarter_id}
                            onClick={() => deleteRow(row)}
                            title="Clear row"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
