// AddReportWizard — 3-step modal: source → upload+extract → review+confirm.
// Sources: PDF (base64), Excel (parsed client-side via xlsx), Email (pasted text or .eml).
// Drafts persist in extraction_drafts.status='pending_review' and can be resumed.

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, FileSpreadsheet, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { fmtUSD } from "@/lib/format";

type SourceType = "pdf" | "excel" | "email";

type Holding = {
  company_name: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
};

type Payload = {
  fund_name: string | null;
  report_date: string | null;
  currency: string | null;
  fund_total_contributions_usd: number | null;
  fund_total_nav_usd: number | null;
  twh_contributions_usd: number | null;
  twh_distributions_usd: number | null;
  twh_nav_usd: number | null;
  holdings: Holding[];
  notes: string | null;
};

type Fund = { id: string; name: string; short_name: string | null };
type Quarter = { id: string; label: string; quarter_end_date?: string; fiscal_year?: number; fiscal_quarter?: number; isFuture?: boolean };

// Given a quarter's fiscal_year + fiscal_quarter, produce the next N synthetic quarters.
function nextQuarters(fy: number, fq: number, n: number): Quarter[] {
  const out: Quarter[] = [];
  let y = fy, q = fq;
  for (let i = 0; i < n; i++) {
    q += 1;
    if (q > 4) { q = 1; y += 1; }
    // Quarter end date = last day of quarter month (3, 6, 9, 12)
    const endMonth = q * 3; // 1-indexed month
    const endDate = new Date(y, endMonth, 0); // day 0 of next month = last day
    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, "0");
    const dd = String(endDate.getDate()).padStart(2, "0");
    const qed = `${yyyy}-${mm}-${dd}`;
    const label = `${q}Q${String(y).slice(-2)}`;
    out.push({ id: `new:${qed}`, label, quarter_end_date: qed, fiscal_year: y, fiscal_quarter: q, isFuture: true });
  }
  return out;
}

type DraftRow = {
  id: string;
  status: string;
  source_type: string | null;
  fund_id: string | null;
  quarter_id: string | null;
  normalized_payload: Payload | null;
  error_message: string | null;
};

interface AddReportWizardProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultFundId?: string | null;
  defaultQuarterId?: string | null;
  resumeDraftId?: string | null;
  onConfirmed?: () => void;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function parseExcel(file: File): Promise<{ sheets: { name: string; rows: any[][] }[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    return { name, rows };
  });
  return { sheets };
}

export default function AddReportWizard({
  open,
  onOpenChange,
  defaultFundId,
  defaultQuarterId,
  resumeDraftId,
  onConfirmed,
}: AddReportWizardProps) {
  const { toast } = useToast();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceType, setSourceType] = useState<SourceType>("pdf");
  const [fundId, setFundId] = useState<string>("");
  const [quarterId, setQuarterId] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [emailText, setEmailText] = useState("");
  const [emlFile, setEmlFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setPdfFile(null);
        setXlsxFile(null);
        setEmailText("");
        setEmlFile(null);
        setDraftId(null);
        setPayload(null);
        setExtractionError(null);
        setBusy(false);
      }, 300);
    }
  }, [open]);

  // Load reference data + resume
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: f }, { data: q }] = await Promise.all([
        supabase.from("funds").select("id, name, short_name").eq("archived", false).order("name"),
        supabase.from("quarters").select("id, label, quarter_end_date, fiscal_year, fiscal_quarter").order("quarter_end_date", { ascending: false }),
      ]);
      setFunds(f ?? []);
      const existing: Quarter[] = (q ?? []).map((x: any) => ({
        id: x.id,
        label: x.label,
        quarter_end_date: x.quarter_end_date,
        fiscal_year: x.fiscal_year,
        fiscal_quarter: x.fiscal_quarter,
      }));
      // Synthesize the next 2 chronological quarters past the latest one
      const latest = existing[0];
      const synthetic = latest && latest.fiscal_year && latest.fiscal_quarter
        ? nextQuarters(latest.fiscal_year, latest.fiscal_quarter, 2)
        : [];
      // Show synthetic first (most recent) then existing
      setQuarters([...synthetic, ...existing]);
    })();
  }, [open]);

  useEffect(() => {
    if (defaultFundId) setFundId(defaultFundId);
    if (defaultQuarterId) setQuarterId(defaultQuarterId);
  }, [defaultFundId, defaultQuarterId, open]);

  // Resume an existing draft
  useEffect(() => {
    if (!open || !resumeDraftId) return;
    (async () => {
      const { data, error } = await supabase
        .from("extraction_drafts")
        .select("id, status, source_type, fund_id, quarter_id, normalized_payload, error_message")
        .eq("id", resumeDraftId)
        .maybeSingle();
      if (error || !data) {
        toast({ title: "Could not load draft", variant: "destructive" });
        return;
      }
      setDraftId(data.id);
      setSourceType((data.source_type as SourceType) ?? "pdf");
      setFundId(data.fund_id ?? "");
      setQuarterId(data.quarter_id ?? "");
      setPayload((data.normalized_payload as Payload | null) ?? emptyPayload());
      setExtractionError(data.error_message);
      setStep(3);
    })();
  }, [resumeDraftId, open, toast]);

  const canSubmitSource = useMemo(() => {
    if (!fundId || !quarterId) return false;
    if (sourceType === "pdf") return !!pdfFile;
    if (sourceType === "excel") return !!xlsxFile;
    if (sourceType === "email") return !!(emailText.trim() || emlFile);
    return false;
  }, [sourceType, pdfFile, xlsxFile, emailText, emlFile, fundId, quarterId]);

  // If quarterId is a synthetic "new:YYYY-MM-DD" placeholder, create the quarter row (or reuse if it
  // already exists at that end-date), then return the real UUID. Updates local state so subsequent
  // calls reuse the resolved id.
  async function ensureRealQuarterId(): Promise<string> {
    if (!quarterId.startsWith("new:")) return quarterId;
    const synth = quarters.find((q) => q.id === quarterId);
    if (!synth || !synth.quarter_end_date || !synth.fiscal_year || !synth.fiscal_quarter) {
      throw new Error("Invalid synthetic quarter selection");
    }
    // Check if a row already exists at this quarter_end_date (race-safe)
    const { data: existing } = await supabase
      .from("quarters")
      .select("id, label")
      .eq("quarter_end_date", synth.quarter_end_date)
      .maybeSingle();
    let realId: string;
    if (existing) {
      realId = existing.id;
    } else {
      const { data: created, error: qErr } = await supabase
        .from("quarters")
        .insert({
          label: synth.label,
          fiscal_year: synth.fiscal_year,
          fiscal_quarter: synth.fiscal_quarter,
          quarter_end_date: synth.quarter_end_date,
          status: "draft",
        })
        .select("id")
        .single();
      if (qErr) throw qErr;
      realId = created.id;
    }
    // Swap synthetic out of local state, point selection at real id
    setQuarters((prev) => prev.map((q) => (q.id === quarterId ? { ...q, id: realId, isFuture: false } : q)));
    setQuarterId(realId);
    return realId;
  }

  async function runExtraction() {
    if (!canSubmitSource) return;
    setBusy(true);
    setExtractionError(null);
    try {
      const realQuarterId = await ensureRealQuarterId();
      const body: any = { source_type: sourceType, fund_id: fundId, quarter_id: realQuarterId };
      if (sourceType === "pdf" && pdfFile) {
        body.file_name = pdfFile.name;
        body.pdf_base64 = await fileToBase64(pdfFile);
      } else if (sourceType === "excel" && xlsxFile) {
        body.file_name = xlsxFile.name;
        body.excel_payload = await parseExcel(xlsxFile);
      } else if (sourceType === "email") {
        body.email_text = emailText.trim() || null;
        if (emlFile) {
          body.file_name = emlFile.name;
          body.eml_base64 = await fileToBase64(emlFile);
        }
      }
      setStep(2);
      const { data, error } = await supabase.functions.invoke("extract-report", { body });
      if (error) {
        // functions.invoke wraps non-2xx as error; data may still hold the draft for 422.
        const ctx = (error as any).context;
        let msg = error.message ?? "Extraction failed";
        try {
          const respText = await ctx?.text?.();
          if (respText) {
            const j = JSON.parse(respText);
            if (j?.draft) {
              setDraftId(j.draft.id);
              setPayload(j.draft.normalized_payload ?? emptyPayload());
              setExtractionError(j.draft.error_message ?? msg);
              setStep(3);
              return;
            }
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const draft = data?.draft;
      if (!draft) throw new Error("No draft returned");
      setDraftId(draft.id);
      setPayload(draft.normalized_payload ?? emptyPayload());
      setExtractionError(draft.error_message ?? null);
      setStep(3);
    } catch (e: any) {
      const msg = e?.message ?? "Extraction failed";
      toast({ title: "Extraction failed", description: msg, variant: "destructive" });
      setExtractionError(msg);
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDraft() {
    if (!draftId || !payload || !fundId || !quarterId) return;
    setBusy(true);
    try {
      // Defensive: if user somehow lands here with a synthetic id (e.g. resumed draft), bootstrap it.
      const realQuarterId = await ensureRealQuarterId();
      // Upsert fund_quarter_snapshots
      const snap = {
        fund_id: fundId,
        quarter_id: realQuarterId,
        twh_contributions_usd: numOrZero(payload.twh_contributions_usd),
        twh_distributions_usd: numOrZero(payload.twh_distributions_usd),
        twh_nav_usd: numOrZero(payload.twh_nav_usd),
        fund_total_contributions_usd: numOrZero(payload.fund_total_contributions_usd),
        fund_total_nav_usd: numOrZero(payload.fund_total_nav_usd),
        confirmed_at: new Date().toISOString(),
        extracted_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from("fund_quarter_snapshots")
        .select("id")
        .eq("fund_id", fundId).eq("quarter_id", realQuarterId).maybeSingle();
      const opSnap = existing
        ? supabase.from("fund_quarter_snapshots").update(snap).eq("id", existing.id)
        : supabase.from("fund_quarter_snapshots").insert(snap);
      const { error: snapErr } = await opSnap;
      if (snapErr) throw snapErr;

      // Upsert holdings (match by company name within (fund_id, quarter_id))
      for (const h of payload.holdings ?? []) {
        if (!h.company_name?.trim()) continue;
        // Resolve / create company
        const legal = h.company_name.trim();
        let companyId: string | null = null;
        const { data: hits } = await supabase
          .from("companies")
          .select("id, legal_name")
          .ilike("legal_name", legal)
          .limit(1);
        if (hits && hits.length > 0) {
          companyId = hits[0].id;
        } else {
          const { data: newCo, error: coErr } = await supabase
            .from("companies").insert({ legal_name: legal }).select("id").single();
          if (coErr) throw coErr;
          companyId = newCo.id;
        }
        // Existing row?
        const { data: existHold } = await supabase
          .from("underlying_holdings")
          .select("id")
          .eq("fund_id", fundId).eq("quarter_id", realQuarterId).eq("company_id", companyId)
          .maybeSingle();
        const row = {
          fund_id: fundId,
          quarter_id: realQuarterId,
          company_id: companyId!,
          investment_date: h.investment_date || null,
          instrument: h.instrument || null,
          round: h.round || null,
          fund_cost_usd: numOrZero(h.fund_cost_usd),
          fund_fmv_usd: numOrZero(h.fund_fmv_usd),
          fund_proceeds_usd: numOrZero(h.fund_proceeds_usd),
        };
        const op = existHold
          ? supabase.from("underlying_holdings").update(row).eq("id", existHold.id)
          : supabase.from("underlying_holdings").insert(row);
        const { error: hErr } = await op;
        if (hErr) throw hErr;
      }

      // Mark draft confirmed
      await supabase
        .from("extraction_drafts")
        .update({ status: "confirmed", normalized_payload: payload as any })
        .eq("id", draftId);

      toast({ title: "Report confirmed", description: "Snapshot and holdings updated." });
      onConfirmed?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Confirm failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (!draftId) { onOpenChange(false); return; }
    await supabase.from("extraction_drafts").update({ status: "discarded" }).eq("id", draftId);
    toast({ title: "Draft discarded" });
    onConfirmed?.();
    onOpenChange(false);
  }

  async function saveDraftAndClose() {
    if (!draftId || !payload) { onOpenChange(false); return; }
    await supabase
      .from("extraction_drafts")
      .update({ normalized_payload: payload as any, status: "pending_review", fund_id: fundId, quarter_id: quarterId })
      .eq("id", draftId);
    toast({ title: "Draft saved", description: "Resume from the top bar later." });
    onConfirmed?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add quarterly report</DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Choose source" : step === 2 ? "Extracting…" : "Review & confirm"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Fund</Label>
                <Select value={fundId} onValueChange={setFundId}>
                  <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                  <SelectContent>
                    {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.short_name ?? f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Quarter</Label>
                <Select value={quarterId} onValueChange={setQuarterId}>
                  <SelectTrigger><SelectValue placeholder="Select quarter" /></SelectTrigger>
                  <SelectContent>
                    {quarters.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.label}{q.isFuture ? " · new" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="pdf"><FileText className="h-4 w-4 mr-2" />PDF</TabsTrigger>
                <TabsTrigger value="excel"><FileSpreadsheet className="h-4 w-4 mr-2" />Excel</TabsTrigger>
                <TabsTrigger value="email"><Mail className="h-4 w-4 mr-2" />Email / Text</TabsTrigger>
              </TabsList>

              <TabsContent value="pdf" className="mt-4">
                <Label className="text-xs">PDF report</Label>
                <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                {pdfFile && <p className="text-xs text-muted-foreground mt-2">{pdfFile.name} · {(pdfFile.size / 1024).toFixed(0)} KB</p>}
              </TabsContent>

              <TabsContent value="excel" className="mt-4">
                <Label className="text-xs">Excel workbook</Label>
                <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setXlsxFile(e.target.files?.[0] ?? null)} />
                {xlsxFile && <p className="text-xs text-muted-foreground mt-2">{xlsxFile.name} · {(xlsxFile.size / 1024).toFixed(0)} KB</p>}
              </TabsContent>

              <TabsContent value="email" className="mt-4 space-y-3">
                <div>
                  <Label className="text-xs">Pasted email body</Label>
                  <Textarea rows={6} placeholder="Paste the email text here…" value={emailText} onChange={(e) => setEmailText(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">…or upload a .eml file</Label>
                  <Input type="file" accept=".eml,message/rfc822" onChange={(e) => setEmlFile(e.target.files?.[0] ?? null)} />
                  {emlFile && <p className="text-xs text-muted-foreground mt-2">{emlFile.name}</p>}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={runExtraction} disabled={!canSubmitSource || busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Extract with AI
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Claude is reading the report…</p>
          </div>
        )}

        {step === 3 && payload && (
          <ReviewStep
            payload={payload}
            setPayload={setPayload}
            extractionError={extractionError}
            funds={funds}
            quarters={quarters}
            fundId={fundId}
            quarterId={quarterId}
          />
        )}
        {step === 3 && (
          <DialogFooter className="border-t border-border pt-4 mt-4 flex-wrap gap-2">
            <Button variant="ghost" onClick={discardDraft}>Discard</Button>
            <Button variant="outline" onClick={saveDraftAndClose}>Save draft</Button>
            <Button onClick={confirmDraft} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" />Confirm
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewStep({
  payload, setPayload, extractionError,
}: {
  payload: Payload;
  setPayload: (p: Payload) => void;
  extractionError: string | null;
  funds: Fund[]; quarters: Quarter[]; fundId: string; quarterId: string;
}) {
  const setField = (k: keyof Payload, v: any) => setPayload({ ...payload, [k]: v });
  const setHolding = (idx: number, k: keyof Holding, v: any) => {
    const next = [...payload.holdings];
    (next[idx] as any)[k] = v;
    setPayload({ ...payload, holdings: next });
  };
  const removeHolding = (idx: number) => {
    setPayload({ ...payload, holdings: payload.holdings.filter((_, i) => i !== idx) });
  };
  const addHolding = () => {
    setPayload({
      ...payload,
      holdings: [...payload.holdings, { company_name: "", investment_date: null, instrument: null, round: null, fund_cost_usd: 0, fund_fmv_usd: 0, fund_proceeds_usd: 0 }],
    });
  };

  return (
    <div className="space-y-4">
      {extractionError && (
        <Card className="bg-destructive/10 border-destructive/30 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs text-destructive">{extractionError}. You can still edit the values manually below.</div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <h4 className="text-sm font-semibold">Fund-level snapshot</h4>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="TWH contributions (USD)" value={payload.twh_contributions_usd} onChange={(v) => setField("twh_contributions_usd", v)} />
          <NumField label="TWH distributions (USD)" value={payload.twh_distributions_usd} onChange={(v) => setField("twh_distributions_usd", v)} />
          <NumField label="TWH NAV (USD)" value={payload.twh_nav_usd} onChange={(v) => setField("twh_nav_usd", v)} />
          <NumField label="Fund total NAV (USD)" value={payload.fund_total_nav_usd} onChange={(v) => setField("fund_total_nav_usd", v)} />
          <NumField label="Fund total contributions (USD)" value={payload.fund_total_contributions_usd} onChange={(v) => setField("fund_total_contributions_usd", v)} />
          <div>
            <Label className="text-xs">Report date</Label>
            <Input type="date" value={payload.report_date ?? ""} onChange={(e) => setField("report_date", e.target.value || null)} />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Underlying holdings ({payload.holdings.length})</h4>
          <Button size="sm" variant="outline" onClick={addHolding}>Add row</Button>
        </div>
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">Company</th>
                <th className="text-left px-2 py-1">Round</th>
                <th className="text-right px-2 py-1">Cost</th>
                <th className="text-right px-2 py-1">FMV</th>
                <th className="text-right px-2 py-1">Proceeds</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payload.holdings.map((h, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1"><Input className="h-7 text-xs" value={h.company_name} onChange={(e) => setHolding(i, "company_name", e.target.value)} /></td>
                  <td className="px-2 py-1"><Input className="h-7 text-xs" value={h.round ?? ""} onChange={(e) => setHolding(i, "round", e.target.value)} /></td>
                  <td className="px-2 py-1 text-right"><Input className="h-7 text-xs text-right font-mono" type="number" value={h.fund_cost_usd ?? 0} onChange={(e) => setHolding(i, "fund_cost_usd", Number(e.target.value))} /></td>
                  <td className="px-2 py-1 text-right"><Input className="h-7 text-xs text-right font-mono" type="number" value={h.fund_fmv_usd ?? 0} onChange={(e) => setHolding(i, "fund_fmv_usd", Number(e.target.value))} /></td>
                  <td className="px-2 py-1 text-right"><Input className="h-7 text-xs text-right font-mono" type="number" value={h.fund_proceeds_usd ?? 0} onChange={(e) => setHolding(i, "fund_proceeds_usd", Number(e.target.value))} /></td>
                  <td className="px-2 py-1 text-right"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => removeHolding(i)}>×</Button></td>
                </tr>
              ))}
              {payload.holdings.length === 0 && (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">No holdings extracted</td></tr>
              )}
              {payload.holdings.length > 0 && (
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-2 py-2">Totals</td>
                  <td></td>
                  <td className="px-2 py-2 text-right font-mono">{fmtUSD(payload.holdings.reduce((a, h) => a + (h.fund_cost_usd ?? 0), 0), { compact: true })}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtUSD(payload.holdings.reduce((a, h) => a + (h.fund_fmv_usd ?? 0), 0), { compact: true })}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmtUSD(payload.holdings.reduce((a, h) => a + (h.fund_proceeds_usd ?? 0), 0), { compact: true })}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        className="font-mono"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

function emptyPayload(): Payload {
  return {
    fund_name: null, report_date: null, currency: "USD",
    fund_total_contributions_usd: null, fund_total_nav_usd: null,
    twh_contributions_usd: null, twh_distributions_usd: null, twh_nav_usd: null,
    holdings: [], notes: null,
  };
}
function numOrZero(v: number | null | undefined): number { return v == null || Number.isNaN(v) ? 0 : Number(v); }
