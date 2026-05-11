import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "SGD", "HKD", "BRL", "MXN", "INR"];

export default function AddFundDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (fundId: string) => void;
}) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [twhCommit, setTwhCommit] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [customCcy, setCustomCcy] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setShortName(""); setStartDate(""); setTwhCommit("");
    setCurrency("USD"); setCustomCcy("");
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const ccy = (currency === "OTHER" ? customCcy.trim().toUpperCase() : currency) || "USD";
    if (!/^[A-Z]{3}$/.test(ccy)) { toast.error("Currency must be a 3-letter ISO code"); return; }
    const commitNum = Number(String(twhCommit).replace(/[, ]/g, "")) || 0;

    setSaving(true);
    try {
      const { data: fund, error: fErr } = await supabase
        .from("funds")
        .insert({
          name: name.trim(),
          short_name: shortName.trim() || null,
          start_date: startDate || null,
          native_currency: ccy,
          reporting_currency: ccy,
        })
        .select("id")
        .single();
      if (fErr) throw fErr;

      const { error: cErr } = await supabase
        .from("fund_commitments")
        .insert({
          fund_id: fund.id,
          twh_commitment_usd: commitNum,
          total_fund_commitment_usd: 0,
        });
      if (cErr) throw cErr;

      toast.success(`Fund "${name}" created`);
      reset();
      onCreated?.(fund.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create fund");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add new fund</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="f-name">Name</Label>
            <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Ventures Fund III" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-short">Short name (optional)</Label>
            <Input id="f-short" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="e.g. Acme III" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-date">Investment date (start)</Label>
              <Input id="f-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-commit">TWH Commit</Label>
              <Input id="f-commit" inputMode="decimal" value={twhCommit} onChange={(e) => setTwhCommit(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                <SelectItem value="OTHER">Other…</SelectItem>
              </SelectContent>
            </Select>
            {currency === "OTHER" && (
              <Input
                className="mt-2"
                value={customCcy}
                onChange={(e) => setCustomCcy(e.target.value.toUpperCase())}
                placeholder="ISO code (e.g. NOK)"
                maxLength={3}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Metrics are tracked in the fund's native currency and converted to USD using FX rates from Settings.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create fund"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
