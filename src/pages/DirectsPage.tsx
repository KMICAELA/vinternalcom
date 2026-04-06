import { useState, useMemo, useCallback } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDirectInvestments, useActiveQuarter } from "@/hooks/usePortfolioData";
import { formatCurrency, formatMultiple } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Save, X, Upload, FileSpreadsheet, FileText, Loader2, CheckCircle, AlertTriangle, XCircle, ArrowRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

const INSTRUMENTS = ["SAFE", "Note", "Pref. Equity", "Common Equity", "SPV"];
const ROUNDS = ["Pre-Seed", "Seed", "A", "B", "C+"];

// Field definitions for column mapping
const MAPPABLE_FIELDS = [
  { key: "company_name", label: "Company Name", required: true, type: "text" },
  { key: "cost_basis", label: "Cost Basis", required: false, type: "number" },
  { key: "instrument", label: "Instrument", required: false, type: "text" },
  { key: "round", label: "Round", required: false, type: "text" },
  { key: "investment_date", label: "Investment Date", required: false, type: "date" },
  { key: "ownership_percentage", label: "Ownership %", required: false, type: "number" },
  { key: "co_investors", label: "Co-Investors", required: false, type: "text" },
  { key: "strategy", label: "Strategy", required: false, type: "text" },
  { key: "geography", label: "Geography", required: false, type: "text" },
  { key: "current_valuation", label: "Current Valuation", required: false, type: "number" },
  { key: "quarter_date", label: "Quarter Date", required: false, type: "date" },
] as const;

// Fuzzy match patterns
const FUZZY_PATTERNS: Record<string, string[]> = {
  company_name: ["company", "portfolio company", "name", "co name", "investee"],
  cost_basis: ["cost", "investment amount", "cost basis", "invested", "amount"],
  instrument: ["instrument", "security type", "type", "security"],
  round: ["round", "series", "stage"],
  investment_date: ["date", "investment date", "close date", "closing date"],
  ownership_percentage: ["ownership", "%", "stake", "pct", "percentage"],
  co_investors: ["co-investor", "coinvestor", "co investor", "syndicate"],
  strategy: ["strategy", "type"],
  geography: ["geography", "region", "country", "location"],
  current_valuation: ["valuation", "fmv", "fair market value", "current value"],
  quarter_date: ["quarter", "reporting date", "as of"],
};

function fuzzyMatchColumn(header: string): string | null {
  const lower = header.toLowerCase().trim();
  for (const [field, patterns] of Object.entries(FUZZY_PATTERNS)) {
    if (patterns.some(p => lower.includes(p) || lower === p)) return field;
  }
  return null;
}

function parseNumeric(val: any): number | null {
  if (val == null || val === "") return null;
  const str = String(val).replace(/[$,]/g, "").trim();
  const num = Number(str);
  return isNaN(num) ? null : num;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

interface RowValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export default function DirectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const activeQuarter = useActiveQuarter();
  const { data: directs = [], isLoading } = useDirectInvestments();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false);
  const [dealDocOpen, setDealDocOpen] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const [newDirect, setNewDirect] = useState({
    company_name: "", investment_date: "", instrument: "SAFE", round: "Seed",
    cost_basis: 0, ownership_percentage: 0, co_investors: "", strategy: "",
  });

  // Pending imports count
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-direct-imports"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("staged_direct_imports")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending_review", "needs_revision"]);
      if (error) return 0;
      return count || 0;
    },
  });

  // Fetch valuations for active quarter
  const { data: valuations = [] } = useQuery({
    queryKey: ["direct-valuations", activeQuarter.date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_quarterly_valuations")
        .select("*")
        .eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
  });

  const valMap = new Map<string, { fmv: number; proceeds: number }>();
  for (const v of valuations) {
    valMap.set(v.company_id, { fmv: Number(v.current_valuation || 0), proceeds: Number(v.realized_proceeds_this_quarter || 0) });
  }

  const handleAdd = async () => {
    if (!newDirect.company_name) return;
    const { error } = await supabase.from("direct_investments").insert(newDirect);
    if (error) { toast.error(error.message); return; }
    toast.success("Direct investment added");
    qc.invalidateQueries({ queryKey: ["direct-investments"] });
    setAddOpen(false);
    setNewDirect({ company_name: "", investment_date: "", instrument: "SAFE", round: "Seed", cost_basis: 0, ownership_percentage: 0, co_investors: "", strategy: "" });
  };

  const startEdit = (d: any) => {
    const val = valMap.get(d.id);
    setEditingId(d.id);
    setEditData({ ...d, current_fmv: val?.fmv ?? 0, current_proceeds: val?.proceeds ?? 0 });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { id, created_at, updated_at, current_fmv, current_proceeds, ...rest } = editData;
    const { error } = await supabase.from("direct_investments").update(rest).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    const { error: valErr } = await supabase.from("direct_quarterly_valuations").upsert({
      company_id: editingId, quarter_date: activeQuarter.date,
      current_valuation: current_fmv || 0, realized_proceeds_this_quarter: current_proceeds || 0,
    }, { onConflict: "company_id,quarter_date" } as any);
    if (valErr) console.error("Valuation upsert error:", valErr);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["direct-investments"] });
    qc.invalidateQueries({ queryKey: ["direct-valuations"] });
    setEditingId(null);
  };

  const activeDirects = directs;
  const getCost = (d: any) => Number(d.cost_basis);
  const getFmv = (d: any) => valMap.get(d.id)?.fmv || 0;
  const totalCost = activeDirects.reduce((s: number, d: any) => s + getCost(d), 0);
  const totalFmv = activeDirects.reduce((s: number, d: any) => s + getFmv(d), 0);
  const totalProceeds = activeDirects.reduce((s: number, d: any) => s + (valMap.get(d.id)?.proceeds || 0), 0);
  const blendedMoic = totalCost > 0 ? (totalFmv + totalProceeds) / totalCost : 0;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Pending imports banner */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between border border-[hsl(var(--gold))]/30 rounded-lg bg-[hsl(var(--gold))]/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--gold))]" />
            <span className="text-sm text-[hsl(var(--gold))]">{pendingCount} import{pendingCount !== 1 ? 's' : ''} pending review</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs border-[hsl(var(--gold))] text-[hsl(var(--gold))]" onClick={() => navigate("/review")}>
            Go to Review
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Direct Co-Investments</h1>
          <p className="text-sm text-muted-foreground">TWH direct investments · {activeQuarter.quarter}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSpreadsheetOpen(true)} className="gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Import Spreadsheet
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDealDocOpen(true)} className="gap-2">
            <FileText className="h-3.5 w-3.5" /> Extract Deal Doc
          </Button>
          <Button size="sm" variant="outline" onClick={() => setValuationOpen(true)} className="gap-2">
            <Edit2 className="h-3.5 w-3.5" /> Update Valuations
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add Direct
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Invested", value: formatCurrency(totalCost) },
          { label: "Total FMV", value: totalFmv > 0 ? formatCurrency(totalFmv) : "—" },
          { label: "Total Proceeds", value: totalProceeds > 0 ? formatCurrency(totalProceeds) : "—" },
          { label: "Blended MOIC", value: blendedMoic > 0 ? formatMultiple(blendedMoic) : "—" },
        ].map(c => (
          <div key={c.label} className="border border-border rounded-lg p-4 bg-card">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-mono font-semibold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-1 text-xs">
              <TableHead>Company</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Instrument</TableHead>
              <TableHead>Round</TableHead>
              <TableHead className="text-right">TWH Cost</TableHead>
              <TableHead className="text-right">FMV</TableHead>
              <TableHead className="text-right">Proceeds</TableHead>
              <TableHead className="text-right">MOIC</TableHead>
              <TableHead>Co-Investors</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeDirects.map((d: any) => {
              const isEditing = editingId === d.id;
              const data = isEditing ? editData : d;
              const val = valMap.get(d.id);
              const fmv = isEditing ? (editData.current_fmv || 0) : getFmv(d);
              const proceeds = isEditing ? (editData.current_proceeds || 0) : (val?.proceeds || 0);
              const cost = isEditing ? Number(data.cost_basis || 0) : getCost(d);
              const moic = cost > 0 ? (fmv + proceeds) / cost : 0;

              return (
                <TableRow key={d.id} className="text-xs table-row-hover">
                  <TableCell>
                    {isEditing ? <Input className="h-7 text-xs" value={data.company_name}
                      onChange={e => setEditData({ ...data, company_name: e.target.value })} />
                      : <span className="font-medium">{d.company_name}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? <Input type="date" className="h-7 text-xs w-32" value={data.investment_date || ""}
                      onChange={e => setEditData({ ...data, investment_date: e.target.value })} />
                      : <span className="text-muted-foreground">{d.investment_date || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select value={data.instrument || ""} onValueChange={v => setEditData({ ...data, instrument: v })}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{INSTRUMENTS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-muted-foreground">{d.instrument || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select value={data.round || ""} onValueChange={v => setEditData({ ...data, round: v })}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROUNDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-muted-foreground">{d.round || '—'}</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isEditing ? <Input type="number" className="h-7 text-xs w-28 text-right" value={data.cost_basis}
                      onChange={e => setEditData({ ...data, cost_basis: Number(e.target.value) })} />
                      : formatCurrency(cost)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isEditing ? <Input type="number" className="h-7 text-xs w-28 text-right" value={editData.current_fmv || 0}
                      onChange={e => setEditData({ ...editData, current_fmv: Number(e.target.value) })} />
                      : (fmv > 0 ? formatCurrency(fmv) : '—')}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {isEditing ? <Input type="number" className="h-7 text-xs w-28 text-right" value={editData.current_proceeds || 0}
                      onChange={e => setEditData({ ...editData, current_proceeds: Number(e.target.value) })} />
                      : (proceeds > 0 ? formatCurrency(proceeds) : '—')}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono font-medium", moic >= 1 ? "text-positive" : "text-negative")}>
                    {moic > 0 ? formatMultiple(moic) : '—'}
                  </TableCell>
                  <TableCell>
                    {isEditing ? <Input className="h-7 text-xs" value={data.co_investors || ""}
                      onChange={e => setEditData({ ...data, co_investors: e.target.value })} />
                      : <span className="text-muted-foreground">{d.co_investors || '—'}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <button onClick={saveEdit} className="text-positive"><Save className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(d)} className="text-muted-foreground hover:text-foreground">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Direct Investment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Company Name</label>
              <Input value={newDirect.company_name} onChange={e => setNewDirect(p => ({ ...p, company_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Investment Date</label>
              <Input type="date" value={newDirect.investment_date} onChange={e => setNewDirect(p => ({ ...p, investment_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Instrument</label>
                <Select value={newDirect.instrument} onValueChange={v => setNewDirect(p => ({ ...p, instrument: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INSTRUMENTS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Round</label>
                <Select value={newDirect.round} onValueChange={v => setNewDirect(p => ({ ...p, round: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROUNDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">TWH Cost ($)</label>
              <Input type="number" value={newDirect.cost_basis} onChange={e => setNewDirect(p => ({ ...p, cost_basis: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Co-Investors</label>
              <Input value={newDirect.co_investors} onChange={e => setNewDirect(p => ({ ...p, co_investors: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd}>Add Investment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spreadsheet Import Dialog */}
      {spreadsheetOpen && (
        <SpreadsheetImportDialog
          existingCompanies={directs.map((d: any) => d.company_name)}
          onClose={() => setSpreadsheetOpen(false)}
        />
      )}

      {/* Deal Doc Extraction Dialog */}
      {dealDocOpen && (
        <DealDocDialog onClose={() => setDealDocOpen(false)} />
      )}

      {/* Quarterly Valuation Update Dialog */}
      {valuationOpen && (
        <ValuationUpdateDialog
          directs={directs}
          activeQuarter={activeQuarter}
          existingValuations={valuations}
          onClose={() => setValuationOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Spreadsheet Import Dialog ──────────────────────────────────────

function SpreadsheetImportDialog({ existingCompanies, onClose }: {
  existingCompanies: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [rawData, setRawData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [staging, setStaging] = useState(false);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (json.length === 0) { toast.error("Spreadsheet is empty"); return; }

      const hdrs = Object.keys(json[0] as any);
      setHeaders(hdrs);
      setRawData(json);

      // Auto-detect mapping
      const autoMap: Record<string, string> = {};
      // Load saved template
      supabase.from("app_settings").select("value").eq("key", "direct_import_template").maybeSingle()
        .then(({ data: setting }) => {
          const saved = (setting?.value as any) || {};
          for (const field of MAPPABLE_FIELDS) {
            if (saved[field.key] && hdrs.includes(saved[field.key])) {
              autoMap[field.key] = saved[field.key];
            } else {
              for (const h of hdrs) {
                const match = fuzzyMatchColumn(h);
                if (match === field.key && !Object.values(autoMap).includes(h)) {
                  autoMap[field.key] = h;
                  break;
                }
              }
            }
          }
          setMapping(autoMap);
          setStep("map");
        });
    };
    reader.readAsArrayBuffer(file);
  };

  const mappedRows = useMemo(() => {
    return rawData.map(row => {
      const mapped: Record<string, any> = {};
      for (const field of MAPPABLE_FIELDS) {
        const col = mapping[field.key];
        if (!col) { mapped[field.key] = null; continue; }
        const raw = row[col];
        if (field.type === "number") mapped[field.key] = parseNumeric(raw);
        else if (field.type === "date") mapped[field.key] = parseDate(raw);
        else mapped[field.key] = raw ? String(raw).trim() : null;
      }
      return mapped;
    });
  }, [rawData, mapping]);

  const validations = useMemo((): RowValidation[] => {
    return mappedRows.map(row => {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!row.company_name || !String(row.company_name).trim()) errors.push("Company name required");
      if (row.cost_basis != null && row.cost_basis > 1_000_000_000) warnings.push("Cost > $1B");
      if (row.company_name && existingCompanies.some(n => n.toLowerCase() === String(row.company_name).toLowerCase())) {
        warnings.push("Duplicate company");
      }
      return { valid: errors.length === 0, warnings, errors };
    });
  }, [mappedRows, existingCompanies]);

  const validCount = validations.filter(v => v.valid).length;

  const handleStage = async () => {
    setStaging(true);
    try {
      const rows = mappedRows
        .filter((_, i) => validations[i].valid)
        .map(row => ({
          source_type: "spreadsheet" as const,
          source_file_name: fileName,
          company_name: String(row.company_name),
          cost_basis: row.cost_basis,
          instrument: row.instrument,
          round: row.round,
          investment_date: row.investment_date,
          ownership_percentage: row.ownership_percentage,
          co_investors: row.co_investors,
          strategy: row.strategy,
          geography: row.geography,
          current_valuation: row.current_valuation,
          quarter_date: row.quarter_date,
          raw_extraction: row,
        }));

      const { error } = await supabase.from("staged_direct_imports").insert(rows as any);
      if (error) throw error;

      // Save template
      await supabase.from("app_settings").upsert({
        key: "direct_import_template",
        value: mapping,
      } as any, { onConflict: "key" });

      toast.success(`${rows.length} investments staged for review`, {
        action: { label: "Go to Review", onClick: () => navigate("/review") },
      });
      qc.invalidateQueries({ queryKey: ["pending-direct-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-review-count"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to stage imports");
    } finally {
      setStaging(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import from Spreadsheet
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" && (
            <div
              className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-[hsl(var(--gold))]/50 transition-colors cursor-pointer"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".xlsx,.xls,.csv";
                input.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) handleFile(f); };
                input.click();
              }}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Drop a spreadsheet here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Map your spreadsheet columns to our fields. {rawData.length} rows detected.</p>
              <div className="space-y-2">
                {MAPPABLE_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-[45%]">
                      <Select
                        value={mapping[field.key] || "__none__"}
                        onValueChange={v => setMapping(prev => ({ ...prev, [field.key]: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Skip —</SelectItem>
                          {headers.map(h => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="w-[45%] flex items-center gap-2">
                      <span className="text-xs">{field.label}</span>
                      {field.required && <Badge variant="outline" className="text-[9px] px-1 py-0">Required</Badge>}
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={() => setStep("preview")} disabled={!mapping.company_name}>
                Preview Mapped Data
              </Button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{validCount}/{mappedRows.length} valid rows</p>
                <Button size="sm" variant="outline" onClick={() => setStep("map")} className="text-xs">Edit Mapping</Button>
              </div>
              <div className="border border-border rounded-lg overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-1 text-xs">
                      <TableHead className="w-10">Status</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedRows.map((row, i) => {
                      const v = validations[i];
                      return (
                        <TableRow key={i} className="text-xs">
                          <TableCell>
                            {v.errors.length > 0 ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
                              v.warnings.length > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> :
                                <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--positive))]" />}
                          </TableCell>
                          <TableCell className="font-medium">{row.company_name || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{row.cost_basis != null ? formatCurrency(row.cost_basis) : "—"}</TableCell>
                          <TableCell>{row.instrument || "—"}</TableCell>
                          <TableCell>{row.round || "—"}</TableCell>
                          <TableCell>{row.investment_date || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {[...v.errors, ...v.warnings].join("; ") || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {step === "preview" && (
            <Button
              size="sm"
              className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
              onClick={handleStage}
              disabled={validCount === 0 || staging}
            >
              {staging ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Staging...</> : `Stage ${validCount} for Review`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deal Doc Extraction Dialog ─────────────────────────────────────

function DealDocDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Array<{ name: string; success: boolean; confidence?: number }>>([]);

  const handleFiles = (fileList: FileList) => {
    setFiles(prev => [...prev, ...Array.from(fileList).filter(f => f.type === "application/pdf")]);
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setProgress({ done: 0, total: files.length });
    const newResults: typeof results = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        const { data: extracted, error } = await supabase.functions.invoke("extract-direct-doc", {
          body: { pdf_base64: base64, file_name: file.name },
        });
        if (error) throw error;

        // Stage the extraction
        await supabase.from("staged_direct_imports").insert({
          source_type: "deal_doc",
          source_file_name: file.name,
          company_name: extracted.company_name || file.name.replace(/\.pdf$/i, ""),
          cost_basis: extracted.cost_basis,
          instrument: extracted.instrument,
          round: extracted.round,
          investment_date: extracted.investment_date,
          ownership_percentage: extracted.ownership_percentage,
          co_investors: extracted.co_investors,
          strategy: extracted.strategy,
          geography: extracted.geography,
          current_valuation: extracted.post_money_valuation || extracted.pre_money_valuation,
          raw_extraction: extracted,
        } as any);

        newResults.push({ name: file.name, success: true, confidence: extracted.confidence });
      } catch (err: any) {
        newResults.push({ name: file.name, success: false });
        toast.error(`Failed: ${file.name}: ${err.message}`);
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setResults(newResults);
    setExtracting(false);
    qc.invalidateQueries({ queryKey: ["pending-direct-imports"] });
    qc.invalidateQueries({ queryKey: ["pending-review-count"] });
    const successCount = newResults.filter(r => r.success).length;
    toast.success(`Extracted ${successCount}/${files.length} documents`);
  };

  const allDone = results.length > 0 && !extracting;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !extracting) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Extract from Deal Documents
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-[hsl(var(--gold))]/50 transition-colors cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf";
              input.multiple = true;
              input.onchange = (e: any) => handleFiles(e.target.files);
              input.click();
            }}
          >
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Drop PDFs here or click to browse</p>
          </div>

          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => {
                const result = results[i];
                return (
                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-surface-1">
                    {result ? (
                      result.success ? <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--positive))]" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />
                    ) : extracting && progress.done >= i ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--gold))]" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{f.name}</span>
                    {result?.confidence != null && (
                      <Badge className={cn(
                        "text-[9px] border-0",
                        result.confidence >= 0.8 ? "bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))]" :
                          result.confidence >= 0.5 ? "bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))]" :
                            "bg-destructive/20 text-destructive"
                      )}>
                        {(result.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                    {!extracting && !result && (
                      <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {extracting && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--gold))]" />
              <span className="text-xs text-muted-foreground">Extracting {progress.done}/{progress.total}...</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={extracting}>Cancel</Button>
          {allDone ? (
            <Button className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90 gap-2" onClick={() => { onClose(); navigate("/review"); }}>
              Go to Review
            </Button>
          ) : (
            <Button onClick={handleExtract} disabled={files.length === 0 || extracting}>
              {extracting ? "Extracting..." : `Extract ${files.length} Document${files.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quarterly Valuation Update Dialog ──────────────────────────────

function ValuationUpdateDialog({ directs, activeQuarter, existingValuations, onClose }: {
  directs: any[];
  activeQuarter: { date: string; quarter: string };
  existingValuations: any[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [staging, setStaging] = useState(false);

  const existingMap = new Map(existingValuations.map((v: any) => [v.company_id, v]));

  const [entries, setEntries] = useState(() =>
    directs.map((d: any) => {
      const existing = existingMap.get(d.id);
      return {
        company_id: d.id,
        company_name: d.company_name,
        previous_val: existing ? Number(existing.current_valuation || 0) : 0,
        current_valuation: existing ? Number(existing.current_valuation || 0) : 0,
        realized_proceeds: existing ? Number(existing.realized_proceeds_this_quarter || 0) : 0,
      };
    })
  );

  const updateEntry = (idx: number, field: string, value: number) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const handleSubmit = async () => {
    setStaging(true);
    try {
      const rows = entries.map(e => ({
        source_type: "manual" as const,
        company_name: e.company_name,
        current_valuation: e.current_valuation,
        quarter_date: activeQuarter.date,
        raw_extraction: { previous_valuation: e.previous_val, realized_proceeds: e.realized_proceeds },
      }));

      await supabase.from("staged_direct_imports").insert(rows as any);
      toast.success(`${rows.length} valuations staged for review`, {
        action: { label: "Go to Review", onClick: () => navigate("/review") },
      });
      qc.invalidateQueries({ queryKey: ["pending-direct-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-review-count"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to stage");
    } finally {
      setStaging(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Update Quarterly Valuations — {activeQuarter.quarter}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-surface-1">
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Prev. Valuation</TableHead>
                <TableHead className="text-right">Current Valuation</TableHead>
                <TableHead className="text-right">Realized Proceeds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => (
                <TableRow key={e.company_id} className="text-xs">
                  <TableCell className="font-medium">{e.company_name}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{e.previous_val > 0 ? formatCurrency(e.previous_val) : "—"}</TableCell>
                  <TableCell>
                    <Input type="number" className="h-7 text-xs text-right w-32 ml-auto" value={e.current_valuation || ""}
                      onChange={ev => updateEntry(i, "current_valuation", Number(ev.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="h-7 text-xs text-right w-32 ml-auto" value={e.realized_proceeds || ""}
                      onChange={ev => updateEntry(i, "realized_proceeds", Number(ev.target.value))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
            onClick={handleSubmit}
            disabled={staging}
          >
            {staging ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Staging...</> : "Submit for Review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
