import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { FxRateSource } from "@/lib/fx/convert";

type Row = {
  id: string;
  fund_id: string | null;
  quarter_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: FxRateSource;
  updated_by: string | null;
  updated_at: string;
};

type Fund = { id: string; name: string; native_currency: string };
type Quarter = { id: string; label: string };
type Profile = { id: string; full_name: string | null; email: string | null };

const SOURCES: FxRateSource[] = ["manual", "auto_ecb", "auto_frankfurter"];

interface FormState {
  id?: string;
  fund_id: string; // "__global__" sentinel for null
  quarter_id: string;
  from_currency: string;
  to_currency: string;
  rate: string;
  source: FxRateSource;
}

const EMPTY_FORM: FormState = {
  fund_id: "__global__",
  quarter_id: "",
  from_currency: "EUR",
  to_currency: "USD",
  rate: "",
  source: "manual",
};

export default function FxRatesSection() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [rows, setRows] = useState<Row[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filterFund, setFilterFund] = useState<string>("__all__");
  const [filterQuarter, setFilterQuarter] = useState<string>("__all__");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [{ data: fxData }, { data: fundsData }, { data: qData }, { data: profData }] =
      await Promise.all([
        supabase.from("fund_fx_rates").select("*").order("updated_at", { ascending: false }),
        supabase.from("funds").select("id,name,native_currency").eq("archived", false).order("name"),
        supabase.from("quarters").select("id,label").order("quarter_end_date", { ascending: false }),
        supabase.from("profiles").select("id,full_name,email"),
      ]);
    setRows((fxData ?? []) as Row[]);
    setFunds((fundsData ?? []) as Fund[]);
    setQuarters((qData ?? []) as Quarter[]);
    setProfiles((profData ?? []) as Profile[]);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const fundName = (id: string | null) => (id ? funds.find((f) => f.id === id)?.name ?? "—" : "Global");
  const quarterLabel = (id: string) => quarters.find((q) => q.id === id)?.label ?? id.slice(0, 6);
  const profileName = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? id.slice(0, 6);
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterFund !== "__all__") {
        if (filterFund === "__global__") {
          if (r.fund_id !== null) return false;
        } else if (r.fund_id !== filterFund) return false;
      }
      if (filterQuarter !== "__all__" && r.quarter_id !== filterQuarter) return false;
      return true;
    });
  }, [rows, filterFund, filterQuarter]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, quarter_id: quarters[0]?.id ?? "" });
    setDialogOpen(true);
  }
  function openEdit(r: Row) {
    setForm({
      id: r.id,
      fund_id: r.fund_id ?? "__global__",
      quarter_id: r.quarter_id,
      from_currency: r.from_currency,
      to_currency: r.to_currency,
      rate: String(r.rate),
      source: r.source,
    });
    setDialogOpen(true);
  }

  function requestSave() {
    const rateNum = Number(form.rate);
    if (!form.quarter_id || !form.from_currency || !form.to_currency || !Number.isFinite(rateNum) || rateNum <= 0) {
      toast({ title: "Invalid input", description: "Quarter, currencies, and a positive rate are required.", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  }

  async function doSave() {
    setSaving(true);
    const payload = {
      fund_id: form.fund_id === "__global__" ? null : form.fund_id,
      quarter_id: form.quarter_id,
      from_currency: form.from_currency.toUpperCase(),
      to_currency: form.to_currency.toUpperCase(),
      rate: Number(form.rate),
      source: form.source,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const res = form.id
      ? await supabase.from("fund_fx_rates").update(payload).eq("id", form.id)
      : await supabase.from("fund_fx_rates").insert(payload);
    setSaving(false);
    setConfirmOpen(false);
    if (res.error) {
      toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: form.id ? "FX rate updated" : "FX rate added" });
    setDialogOpen(false);
    loadAll();
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">FX Rates</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Per-fund, per-quarter conversion rates. Fund-specific rows override global rows.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openAdd}>
            Add rate
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <Select value={filterFund} onValueChange={setFilterFund}>
          <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All funds</SelectItem>
            <SelectItem value="__global__">Global</SelectItem>
            {funds.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterQuarter} onValueChange={setFilterQuarter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All quarters</SelectItem>
            {quarters.map((q) => (
              <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fund</TableHead>
            <TableHead>Quarter</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Updated by</TableHead>
            <TableHead>Updated at</TableHead>
            {isAdmin && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-xs text-muted-foreground py-8">
                No FX rates configured.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{fundName(r.fund_id)}</TableCell>
              <TableCell className="text-xs">{quarterLabel(r.quarter_id)}</TableCell>
              <TableCell className="text-xs font-mono">{r.from_currency}→{r.to_currency}</TableCell>
              <TableCell className="text-right font-mono text-xs">{Number(r.rate).toFixed(6)}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{r.source.replace("_", " ")}</Badge></TableCell>
              <TableCell className="text-xs">{profileName(r.updated_by)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</TableCell>
              {isAdmin && (
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit FX rate" : "Add FX rate"}</DialogTitle>
            <DialogDescription>
              Fund-scoped rates override global rates for the same quarter and currency pair.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Fund</Label>
              <Select value={form.fund_id} onValueChange={(v) => setForm((f) => ({ ...f, fund_id: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (all funds)</SelectItem>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} {f.native_currency !== "USD" && `· native ${f.native_currency}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quarter</Label>
              <Select value={form.quarter_id} onValueChange={(v) => setForm((f) => ({ ...f, quarter_id: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {quarters.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v as FxRateSource }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input value={form.from_currency} onChange={(e) => setForm((f) => ({ ...f, from_currency: e.target.value.toUpperCase() }))} maxLength={3} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input value={form.to_currency} onChange={(e) => setForm((f) => ({ ...f, to_currency: e.target.value.toUpperCase() }))} maxLength={3} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Rate (1 {form.from_currency || "?"} = ? {form.to_currency || "?"})</Label>
              <Input type="number" step="0.000001" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={requestSave}>{form.id ? "Save changes" : "Add rate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm FX rate {form.id ? "update" : "creation"}</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to set <span className="font-mono">{form.from_currency}→{form.to_currency}</span> to{" "}
              <span className="font-mono">{form.rate}</span> for{" "}
              <strong>{form.fund_id === "__global__" ? "all funds (global)" : funds.find((f) => f.id === form.fund_id)?.name}</strong>{" "}
              in <strong>{quarters.find((q) => q.id === form.quarter_id)?.label}</strong>.
              <br /><br />
              All USD-converted values for this fund and quarter will be recomputed against the new rate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSave} disabled={saving}>
              {saving ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
