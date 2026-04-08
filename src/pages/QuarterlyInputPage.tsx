import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useLPCashflows, useFunds, usePortfolioSnapshot } from "@/hooks/usePortfolioData";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/calcEngine";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Upload, Save, ArrowRight, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import * as XLSX from "xlsx";
import FxConversionSection from "@/components/FxConversionSection";

const CASHFLOW_TYPES = ["Capital Call", "Distribution", "Return of Capital", "Management Fee", "Other"];
const COMMENTARY_SECTIONS = ["Market Overview", "Portfolio Update", "Performance Attribution", "Outlook", "Other"];
const HIGHLIGHT_TYPES = ["Funding Round", "Exit", "IPO", "Acquisition", "Partnership", "Product Launch", "Financial Update", "Team Change", "Other"];

interface CashflowRow {
  date: string;
  type: string;
  amount: string;
  fund_name: string;
  description: string;
}

interface CommentaryRow { section: string; body: string; showPreview: boolean; }
interface HighlightRow { entity_name: string; update_type: string; body: string; url: string; }

const DRAFT_KEY = (qDate: string) => `quarterly_input_draft_${qDate}`;

export default function QuarterlyInputPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedQuarter } = useQuarterContext();
  const quarterDate = selectedQuarter.date;
  const { data: funds = [] } = useFunds();
  const { data: existingCashflows = [] } = useLPCashflows(quarterDate);
  const prevQuarterDate = useMemo(() => {
    const d = new Date(quarterDate);
    d.setMonth(d.getMonth() - 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  }, [quarterDate]);
  const prevMetrics = useConsolidatedMetrics();
  const { data: prevSnapshot } = usePortfolioSnapshot(prevQuarterDate);
  const { data: existingHighlights = [] } = useQuery({
    queryKey: ["highlight-entries", quarterDate],
    queryFn: async () => {
      const { data } = await supabase.from("highlight_entries").select("*").eq("quarter_date", quarterDate).order("created_at");
      return data || [];
    },
  });
  const cumulativeCashflows = useLPCashflows(quarterDate);

  const [cashflows, setCashflows] = useState<CashflowRow[]>([{ date: quarterDate, type: "Capital Call", amount: "", fund_name: "", description: "" }]);
  const [lpNav, setLpNav] = useState("");
  const [navNotes, setNavNotes] = useState("");
  const [commentaries, setCommentaries] = useState<CommentaryRow[]>([{ section: "Market Overview", body: "", showPreview: false }]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([{ entity_name: "", update_type: "Other", body: "", url: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const submitterName = localStorage.getItem("reviewer_name") || "";

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY(quarterDate));
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.cashflows) setCashflows(draft.cashflows);
        if (draft.lpNav) setLpNav(draft.lpNav);
        if (draft.navNotes) setNavNotes(draft.navNotes);
        if (draft.commentaries) setCommentaries(draft.commentaries);
        if (draft.highlights) setHighlights(draft.highlights);
        setDraftSavedAt(draft.savedAt || null);
      } catch {}
    }
  }, [quarterDate]);

  const saveDraft = () => {
    const now = new Date().toLocaleTimeString();
    localStorage.setItem(DRAFT_KEY(quarterDate), JSON.stringify({ cashflows, lpNav, navNotes, commentaries, highlights, savedAt: now }));
    setDraftSavedAt(now);
    toast.success(`Draft saved at ${now}`);
  };

  const computedMetrics = useMemo(() => {
    const cumCalls = (cumulativeCashflows.data || []).filter(c => c.type === "capital_call").reduce((s, c) => s + Number(c.amount), 0);
    const cumDist = (cumulativeCashflows.data || []).filter(c => c.type === "distribution").reduce((s, c) => s + Number(c.amount), 0);
    const nav = Number(lpNav) || 0;
    const totalCommitment = prevMetrics.totalCommitment || 0;
    const tvpi = cumCalls > 0 ? (cumDist + nav) / cumCalls : 0;
    const dpi = cumCalls > 0 ? cumDist / cumCalls : 0;
    const rvpi = cumCalls > 0 ? nav / cumCalls : 0;
    const pic = totalCommitment > 0 ? cumCalls / totalCommitment : 0;
    return { tvpi, dpi, rvpi, pic, cumCalls, cumDist, nav };
  }, [lpNav, cumulativeCashflows.data, prevMetrics.totalCommitment]);

  const prevNav = Number(prevSnapshot?.lp_nav || 0);
  const prevTvpi = prevMetrics.netTvpi || 0;

  const cashflowTotals = useMemo(() => {
    let calls = 0, dists = 0;
    for (const cf of cashflows) {
      const amt = Number(cf.amount) || 0;
      if (cf.type === "Capital Call" || cf.type === "Management Fee") calls += amt;
      else if (cf.type === "Distribution" || cf.type === "Return of Capital") dists += amt;
    }
    return { calls, dists, net: calls - dists };
  }, [cashflows]);

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      const mapped: CashflowRow[] = rows.map(r => ({
        date: r.Date || r.date || quarterDate,
        type: r.Type || r.type || "Other",
        amount: String(r.Amount || r.amount || 0),
        fund_name: r.Fund || r["Fund Name"] || r.fund_name || "",
        description: r.Description || r.description || "",
      }));
      setCashflows(prev => [...prev, ...mapped]);
      toast.success(`Imported ${mapped.length} rows`);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const rows: any[] = [];

      for (const cf of cashflows) {
        if (!cf.amount || Number(cf.amount) === 0) continue;
        rows.push({
          data_type: "lp_cashflow",
          quarter_date: quarterDate,
          cashflow_type: cf.type,
          cashflow_amount: Number(cf.amount),
          cashflow_description: cf.description || null,
          entity_name: cf.fund_name || null,
          status: "pending_review",
          submitted_by: submitterName || "unknown",
        });
      }

      if (lpNav) {
        rows.push({
          data_type: "nav_adjustment",
          quarter_date: quarterDate,
          lp_nav: Number(lpNav),
          nav_notes: navNotes || null,
          status: "pending_review",
          submitted_by: submitterName || "unknown",
        });
      }

      for (const c of commentaries) {
        if (!c.body.trim()) continue;
        rows.push({
          data_type: "commentary",
          quarter_date: quarterDate,
          entity_name: c.section,
          body: c.body,
          status: "pending_review",
          submitted_by: submitterName || "unknown",
        });
      }

      for (const h of highlights) {
        if (!h.entity_name.trim() && !h.body.trim()) continue;
        rows.push({
          data_type: "highlight",
          quarter_date: quarterDate,
          entity_name: h.entity_name,
          update_type: h.update_type,
          body: h.body,
          url: h.url || null,
          status: "pending_review",
          submitted_by: submitterName || "unknown",
        });
      }

      if (rows.length === 0) { toast.error("No data to submit"); setSubmitting(false); return; }

      const { error } = await supabase.from("staged_internal_data").insert(rows as any);
      if (error) throw error;

      localStorage.removeItem(DRAFT_KEY(quarterDate));
      toast.success(`${rows.length} items submitted for review`);
      qc.invalidateQueries({ queryKey: ["pending-review-count"] });
      qc.invalidateQueries({ queryKey: ["staged-internal-data"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const DeltaIndicator = ({ current, previous, format = "multiple" }: { current: number; previous: number; format?: string }) => {
    const delta = current - previous;
    if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const positive = delta >= 0;
    const formatted = format === "currency" ? formatCurrency(Math.abs(delta)) : format === "percent" ? formatPercent(Math.abs(delta)) : formatMultiple(Math.abs(delta));
    return (
      <span className={cn("text-xs font-medium flex items-center gap-0.5", positive ? "text-[hsl(var(--positive))]" : "text-destructive")}>
        {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {formatted}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quarterly Data Entry</h1>
          <p className="text-sm text-muted-foreground">{selectedQuarter.quarter} · Internal data submission</p>
        </div>
        <div className="flex items-center gap-2">
          {draftSavedAt && <span className="text-[10px] text-muted-foreground">Draft saved {draftSavedAt}</span>}
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["cashflows", "nav", "commentary", "highlights"]} className="space-y-3">
        <AccordionItem value="cashflows" className="border border-border rounded-lg bg-card overflow-hidden">
          <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">LP Cashflows</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            {existingCashflows.filter(c => c.cashflow_date >= quarterDate.slice(0, 7)).length > 0 && (
              <div className="rounded-md bg-muted/30 p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Already Recorded</p>
                {existingCashflows.filter(c => c.cashflow_date >= quarterDate.slice(0, 7)).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono w-24">{c.cashflow_date}</span>
                    <span className="w-28">{c.type}</span>
                    <span className="font-mono">{formatCurrency(Number(c.amount))}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {cashflows.map((cf, i) => (
                <div key={i} className="grid grid-cols-[120px_150px_120px_1fr_1fr_32px] gap-2 items-center">
                  <Input type="date" className="h-8 text-xs" value={cf.date} onChange={e => {
                    const next = [...cashflows]; next[i] = { ...cf, date: e.target.value }; setCashflows(next);
                  }} />
                  <Select value={cf.type} onValueChange={v => {
                    const next = [...cashflows]; next[i] = { ...cf, type: v }; setCashflows(next);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CASHFLOW_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" placeholder="Amount" className="h-8 text-xs" value={cf.amount} onChange={e => {
                    const next = [...cashflows]; next[i] = { ...cf, amount: e.target.value }; setCashflows(next);
                  }} />
                  <Input placeholder="Fund / Portfolio" className="h-8 text-xs" value={cf.fund_name} onChange={e => {
                    const next = [...cashflows]; next[i] = { ...cf, fund_name: e.target.value }; setCashflows(next);
                  }} />
                  <Input placeholder="Description" className="h-8 text-xs" value={cf.description} onChange={e => {
                    const next = [...cashflows]; next[i] = { ...cf, description: e.target.value }; setCashflows(next);
                  }} />
                  <button onClick={() => setCashflows(prev => prev.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCashflows(prev => [...prev, { date: quarterDate, type: "Capital Call", amount: "", fund_name: "", description: "" }])}>
                <Plus className="h-3 w-3" /> Add Row
              </Button>
              <label className="cursor-pointer">
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleCsvImport} />
                <div className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 border border-dashed border-primary/30 rounded-md px-3 py-1.5 h-7">
                  <Upload className="h-3 w-3" /> Import CSV
                </div>
              </label>
            </div>

            <div className="flex gap-4 pt-2 border-t border-border/50 text-xs">
              <span className="text-muted-foreground">Total Calls: <span className="font-mono text-foreground">{formatCurrency(cashflowTotals.calls)}</span></span>
              <span className="text-muted-foreground">Total Distributions: <span className="font-mono text-foreground">{formatCurrency(cashflowTotals.dists)}</span></span>
              <span className="text-muted-foreground">Net: <span className="font-mono text-foreground">{formatCurrency(cashflowTotals.net)}</span></span>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="nav" className="border border-border rounded-lg bg-card overflow-hidden">
          <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">NAV & Portfolio Snapshot</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">LP NAV</label>
                <Input type="number" placeholder="Total portfolio NAV" className="h-9" value={lpNav} onChange={e => setLpNav(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
                <Textarea placeholder="Methodology, adjustments..." className="min-h-[60px] text-xs" value={navNotes} onChange={e => setNavNotes(e.target.value)} />
              </div>
            </div>

            {Number(lpNav) > 0 && (
              <div className="grid grid-cols-4 gap-3 pt-2">
                {[
                  { label: "TVPI", value: computedMetrics.tvpi, prev: prevTvpi, format: "multiple" },
                  { label: "DPI", value: computedMetrics.dpi, prev: prevMetrics.dpi || 0, format: "multiple" },
                  { label: "RVPI", value: computedMetrics.rvpi, prev: prevMetrics.rvpi || 0, format: "multiple" },
                  { label: "PIC", value: computedMetrics.pic, prev: prevMetrics.pic || 0, format: "percent" },
                ].map(m => (
                  <div key={m.label} className="border border-border rounded-lg p-3 bg-muted/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
                    <p className="text-lg font-semibold font-mono mt-0.5">{m.format === "percent" ? formatPercent(m.value) : formatMultiple(m.value)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">Prev: {m.format === "percent" ? formatPercent(m.prev) : formatMultiple(m.prev)}</span>
                      <DeltaIndicator current={m.value} previous={m.prev} format={m.format} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {prevNav > 0 && Number(lpNav) > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Previous NAV: <span className="font-mono text-foreground">{formatCurrency(prevNav)}</span></span>
                <DeltaIndicator current={Number(lpNav)} previous={prevNav} format="currency" />
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* FX Conversion for non-USD funds */}
        {funds.filter((f: any) => f.currency && f.currency !== "USD").length > 0 && (
          <AccordionItem value="fx-conversion" className="border border-border rounded-lg bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
              FX Conversion
              <Badge variant="outline" className="ml-2 text-[10px]">
                {funds.filter((f: any) => f.currency && f.currency !== "USD").length} non-USD fund{funds.filter((f: any) => f.currency && f.currency !== "USD").length > 1 ? "s" : ""}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-4">
              {funds.filter((f: any) => f.currency && f.currency !== "USD").map((fund: any) => (
                <div key={fund.id}>
                  <p className="text-xs font-medium text-foreground mb-2">{fund.fund_name}</p>
                  <FxConversionSection
                    quarterDate={quarterDate}
                    sourceCurrency={fund.currency}
                    onConvertedValues={(vals) => {
                      // Values auto-saved via the FX rate hook; could integrate into submit flow if needed
                      console.log(`FX converted for ${fund.fund_name}:`, vals);
                    }}
                  />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="commentary" className="border border-border rounded-lg bg-card overflow-hidden">
          <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">Quarterly Commentary</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            {commentaries.map((c, i) => (
              <div key={i} className="space-y-2 border border-border/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Select value={c.section} onValueChange={v => {
                    const next = [...commentaries]; next[i] = { ...c, section: v }; setCommentaries(next);
                  }}>
                    <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{COMMENTARY_SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => {
                    const next = [...commentaries]; next[i] = { ...c, showPreview: !c.showPreview }; setCommentaries(next);
                  }}>
                    {c.showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {c.showPreview ? "Edit" : "Preview"}
                  </Button>
                  <button onClick={() => setCommentaries(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {c.showPreview ? (
                  <div className="prose prose-sm prose-invert max-w-none text-xs p-3 bg-muted/20 rounded-md whitespace-pre-wrap">{c.body}</div>
                ) : (
                  <Textarea placeholder="Write commentary (supports markdown)..." className="min-h-[120px] text-xs" value={c.body} onChange={e => {
                    const next = [...commentaries]; next[i] = { ...c, body: e.target.value }; setCommentaries(next);
                  }} />
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCommentaries(prev => [...prev, { section: "Portfolio Update", body: "", showPreview: false }])}>
              <Plus className="h-3 w-3" /> Add Section
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="highlights" className="border border-border rounded-lg bg-card overflow-hidden">
          <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">Highlights & News</AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-3">
            {existingHighlights.length > 0 && (
              <div className="rounded-md bg-muted/30 p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Already Recorded ({existingHighlights.length})</p>
                {existingHighlights.map((h: any) => (
                  <div key={h.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{h.update_type}</Badge>
                    <span className="font-medium text-foreground">{h.entity_name}</span>
                  </div>
                ))}
              </div>
            )}

            {highlights.map((h, i) => (
              <div key={i} className="grid grid-cols-[1fr_150px_1fr_120px_32px] gap-2 items-start">
                <Input placeholder="Entity name" className="h-8 text-xs" value={h.entity_name} onChange={e => {
                  const next = [...highlights]; next[i] = { ...h, entity_name: e.target.value }; setHighlights(next);
                }} />
                <Select value={h.update_type} onValueChange={v => {
                  const next = [...highlights]; next[i] = { ...h, update_type: v }; setHighlights(next);
                }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{HIGHLIGHT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea placeholder="Update text" className="min-h-[32px] text-xs" rows={1} value={h.body} onChange={e => {
                  const next = [...highlights]; next[i] = { ...h, body: e.target.value }; setHighlights(next);
                }} />
                <Input placeholder="URL (optional)" className="h-8 text-xs" value={h.url} onChange={e => {
                  const next = [...highlights]; next[i] = { ...h, url: e.target.value }; setHighlights(next);
                }} />
                <button onClick={() => setHighlights(prev => prev.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80 mt-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setHighlights(prev => [...prev, { entity_name: "", update_type: "Other", body: "", url: "" }])}>
              <Plus className="h-3 w-3" /> Add Entry
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90">
          <ArrowRight className="h-4 w-4" />
          {submitting ? "Submitting..." : "Submit for Review"}
        </Button>
        <Button variant="outline" onClick={saveDraft} className="gap-2">
          <Save className="h-4 w-4" /> Save Draft
        </Button>
        <Button variant="ghost" onClick={() => navigate("/review")} className="text-xs text-muted-foreground">
          Go to Review →
        </Button>
      </div>
    </div>
  );
}
