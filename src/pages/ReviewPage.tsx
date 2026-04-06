import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runReconciliationChecks } from "@/lib/reconciliation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2, ExternalLink, Loader2, FileText, FileSpreadsheet, Pencil } from "lucide-react";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/calcEngine";

export default function ReviewPage() {
  const qc = useQueryClient();
  const [reviewerName, setReviewerName] = useState(() => localStorage.getItem("reviewer_name") || "");
  const [activeTab, setActiveTab] = useState("fund-extractions");

  useEffect(() => {
    if (reviewerName) localStorage.setItem("reviewer_name", reviewerName);
  }, [reviewerName]);

  // Pending fund extractions
  const { data: pendingExtractions = [], isLoading } = useQuery({
    queryKey: ["staged-extractions", "pending_review"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staged_fund_extractions")
        .select("*, funds!staged_fund_extractions_fund_id_fkey(fund_name)")
        .in("status", ["pending_review", "needs_revision"])
        .order("extracted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Pending direct imports
  const { data: pendingDirects = [], isLoading: directsLoading } = useQuery({
    queryKey: ["staged-direct-imports", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staged_direct_imports")
        .select("*")
        .in("status", ["pending_review", "needs_revision"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Reconciliation warnings
  const { data: warnings = [] } = useQuery({
    queryKey: ["reconciliation-warnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliation_checks")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Review & Approve</h1>
          <p className="text-sm text-muted-foreground">Review extracted fund data before pushing to live tables</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Reviewing as:</span>
          <Input
            className="h-8 w-48 text-xs"
            placeholder="Your name"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
          />
        </div>
      </div>

      {/* Reconciliation warnings banner */}
      {warnings.length > 0 && (
        <div className="border border-[hsl(var(--warning))]/30 rounded-lg bg-[hsl(var(--warning))]/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
            <span className="text-sm font-medium text-[hsl(var(--warning))]">{warnings.length} unresolved reconciliation warning{warnings.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1">
            {warnings.slice(0, 5).map((w: any) => (
              <div key={w.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{w.description}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={async () => {
                    await supabase.from("reconciliation_checks").update({
                      resolved: true,
                      resolved_by: reviewerName || "unknown",
                      resolved_at: new Date().toISOString(),
                    } as any).eq("id", w.id);
                    qc.invalidateQueries({ queryKey: ["reconciliation-warnings"] });
                  }}
                >
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="fund-extractions" className="gap-2">
            Fund Extractions
            {pendingExtractions.length > 0 && (
              <Badge className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] border-0 text-[10px] px-1.5">
                {pendingExtractions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="direct-imports" className="gap-2">
            Direct Imports
            {pendingDirects.length > 0 && (
              <Badge className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] border-0 text-[10px] px-1.5">
                {pendingDirects.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="internal-data">Internal Data</TabsTrigger>
        </TabsList>

        <TabsContent value="fund-extractions" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground p-8 text-center">Loading extractions...</div>
          ) : pendingExtractions.length === 0 ? (
            <div className="text-sm text-muted-foreground p-8 text-center border border-border rounded-lg bg-card">
              No pending fund extractions to review.
            </div>
          ) : (
            pendingExtractions.map((extraction: any) => (
              <ExtractionReviewCard
                key={extraction.id}
                extraction={extraction}
                reviewerName={reviewerName}
                onAction={() => {
                  qc.invalidateQueries({ queryKey: ["staged-extractions"] });
                  qc.invalidateQueries({ queryKey: ["reconciliation-warnings"] });
                  qc.invalidateQueries({ queryKey: ["funds"] });
                  qc.invalidateQueries({ queryKey: ["fund-fs"] });
                  qc.invalidateQueries({ queryKey: ["all-fund-fs-status"] });
                  qc.invalidateQueries({ queryKey: ["fund-reports"] });
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="direct-imports" className="space-y-4 mt-4">
          {directsLoading ? (
            <div className="text-sm text-muted-foreground p-8 text-center">Loading imports...</div>
          ) : pendingDirects.length === 0 ? (
            <div className="text-sm text-muted-foreground p-8 text-center border border-border rounded-lg bg-card">
              No pending direct imports to review.
            </div>
          ) : (
            pendingDirects.map((imp: any) => (
              <DirectImportReviewCard
                key={imp.id}
                item={imp}
                reviewerName={reviewerName}
                onAction={() => {
                  qc.invalidateQueries({ queryKey: ["staged-direct-imports"] });
                  qc.invalidateQueries({ queryKey: ["direct-investments"] });
                  qc.invalidateQueries({ queryKey: ["direct-valuations"] });
                  qc.invalidateQueries({ queryKey: ["pending-direct-imports"] });
                  qc.invalidateQueries({ queryKey: ["pending-review-count"] });
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="internal-data" className="mt-4">
          <div className="text-sm text-muted-foreground p-8 text-center border border-border rounded-lg bg-card">
            Internal data review will be available in a future update.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Extraction Review Card ────────────────────────────────────────

function ExtractionReviewCard({ extraction, reviewerName, onAction }: {
  extraction: any;
  reviewerName: string;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [companiesExpanded, setCompaniesExpanded] = useState(false);
  const [cashflowsExpanded, setCashflowsExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notes, setNotes] = useState("");

  // Editable form state
  const [form, setForm] = useState({
    nav: extraction.extracted_nav ?? "",
    capital_called: extraction.extracted_capital_called ?? "",
    distributions: extraction.extracted_distributions ?? "",
    unfunded: extraction.extracted_unfunded ?? "",
    gross_irr: extraction.extracted_gross_irr != null ? (extraction.extracted_gross_irr * 100) : "",
    gross_tvpi: extraction.extracted_gross_tvpi ?? "",
    net_irr: extraction.extracted_net_irr != null ? (extraction.extracted_net_irr * 100) : "",
    net_tvpi: extraction.extracted_net_tvpi ?? "",
    dpi: extraction.extracted_dpi ?? "",
    rvpi: extraction.extracted_rvpi ?? "",
    pic: extraction.extracted_pic != null ? (extraction.extracted_pic * 100) : "",
    commitment: extraction.extracted_commitment ?? "",
  });

  const [companies, setCompanies] = useState<any[]>(
    Array.isArray(extraction.extracted_companies) ? extraction.extracted_companies : []
  );

  const rawExtraction = extraction.raw_extraction || {};
  const [cashflows, setCashflows] = useState<any[]>(
    Array.isArray(rawExtraction.cashflow_activity) ? rawExtraction.cashflow_activity : []
  );

  const fundName = extraction.funds?.fund_name || "Unknown Fund";
  const confidence = extraction.confidence_score ?? 0;
  const extractionNotes = rawExtraction.extraction_notes || [];

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const confidenceBadge = () => {
    if (confidence >= 0.8) return <Badge className="bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))] border-0">{(confidence * 100).toFixed(0)}%</Badge>;
    if (confidence >= 0.5) return <Badge className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] border-0">{(confidence * 100).toFixed(0)}%</Badge>;
    return <Badge className="bg-destructive/20 text-destructive border-0">{(confidence * 100).toFixed(0)}%</Badge>;
  };

  const handleApprove = async () => {
    if (!reviewerName.trim()) {
      toast.error("Please enter your name in the 'Reviewing as' field");
      return;
    }
    setApproving(true);

    try {
      const fundId = extraction.fund_id;
      const quarterDate = extraction.quarter_date;

      // Build extracted_data for backward compatibility
      const extractedData = {
        fund_totals: {
          fund_nav: Number(form.nav) || 0,
          total_contributions_called: Number(form.capital_called) || 0,
          total_distributions: Number(form.distributions) || 0,
          total_commitment: Number(form.commitment) || 0,
          total_investment_cost: companies.reduce((s: number, c: any) => s + Number(c.investment_cost || 0), 0),
          total_portfolio_fmv: companies.reduce((s: number, c: any) => s + Number(c.fair_market_value || 0), 0),
        },
        portfolio_companies: companies.map(c => ({
          company_name: c.name,
          investment_cost: Number(c.investment_cost || 0),
          fmv: Number(c.fair_market_value || 0),
          proceeds: Number(c.realized_proceeds || 0),
          status: c.status || "Active",
          instrument: c.instrument || null,
          round: c.round || null,
        })),
        documents: [],
      };

      // 1. Upsert fund_financial_statements
      await supabase.from("fund_financial_statements").upsert({
        fund_id: fundId,
        quarter_date: quarterDate,
        extracted_data: extractedData,
        confirmed: true,
        file_path: extraction.source_file_path || null,
      } as any, { onConflict: "fund_id,quarter_date" });

      // 2. Upsert fund_quarterly_reports
      await supabase.from("fund_quarterly_reports").upsert({
        fund_id: fundId,
        quarter_date: quarterDate,
        reported_nav: Number(form.nav) || 0,
        capital_called_to_date: Number(form.capital_called) || 0,
        distributions_to_date: Number(form.distributions) || 0,
        reported_gross_irr: form.gross_irr !== "" ? Number(form.gross_irr) / 100 : null,
        reported_gross_tvpi: form.gross_tvpi !== "" ? Number(form.gross_tvpi) : null,
      } as any, { onConflict: "fund_id,quarter_date" });

      // 3. Upsert portfolio companies into underlying_portfolio_holdings
      if (companies.length > 0) {
        // Get fund ownership percentage
        const { data: fund } = await supabase.from("funds").select("ownership_percentage").eq("id", fundId).single();
        const ownershipPct = Number(fund?.ownership_percentage || 0) / 100;

        const holdingsRows = companies.map((c: any) => ({
          fund_id: fundId,
          quarter_date: quarterDate,
          company_name: c.name,
          investment_cost: Number(c.investment_cost || 0),
          fmv: Number(c.fair_market_value || 0),
          proceeds: Number(c.realized_proceeds || 0),
          sector: c.sector || null,
          region: c.region || null,
          twh_cost: Number(c.investment_cost || 0) * ownershipPct,
          twh_fmv: Number(c.fair_market_value || 0) * ownershipPct,
          twh_proceeds: Number(c.realized_proceeds || 0) * ownershipPct,
        }));

        // Delete existing holdings for this fund+quarter, then insert fresh
        await supabase.from("underlying_portfolio_holdings")
          .delete()
          .eq("fund_id", fundId)
          .eq("quarter_date", quarterDate);

        await supabase.from("underlying_portfolio_holdings").insert(holdingsRows as any);
      }

      // 4. Insert cashflows
      if (cashflows.length > 0) {
        const cfRows = cashflows.map((cf: any) => ({
          fund_id: fundId,
          cashflow_date: cf.date,
          cashflow_type: cf.type === "capital_call" ? "Capital Call — Investment" : "Distribution",
          capital_deployed: cf.type === "capital_call" ? Number(cf.amount || 0) : 0,
          distribution_received: cf.type === "distribution" ? Number(cf.amount || 0) : 0,
          description: cf.description || null,
        }));
        await supabase.from("fund_cashflows").insert(cfRows as any);
      }

      // 5. Update staged extraction status
      await supabase.from("staged_fund_extractions").update({
        status: "approved",
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", extraction.id);

      // 6. Audit log
      await supabase.from("audit_log").insert({
        action: "approve_extraction",
        target_table: "staged_fund_extractions",
        target_id: extraction.id,
        quarter_date: quarterDate,
        performed_by: reviewerName,
        details: { fund_name: fundName },
      } as any);

      // 7. Update/create extraction template
      await supabase.from("fund_extraction_templates").upsert({
        fund_id: fundId,
        template_name: fundName,
        sample_extraction: extraction.raw_extraction,
        field_mappings: {},
      } as any, { onConflict: "fund_id" });

      // 8. Run reconciliation checks
      await runReconciliationChecks(fundId, quarterDate, fundName);

      toast.success(`${fundName} data approved and pushed live`);
      onAction();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const handleRevision = async () => {
    await supabase.from("staged_fund_extractions").update({
      status: "needs_revision",
      reviewer_notes: notes,
      reviewed_by: reviewerName || "unknown",
    } as any).eq("id", extraction.id);
    toast.info("Marked for revision");
    setRevisionOpen(false);
    setNotes("");
    onAction();
  };

  const handleReject = async () => {
    await supabase.from("staged_fund_extractions").update({
      status: "rejected",
      reviewer_notes: notes,
      reviewed_by: reviewerName || "unknown",
      reviewed_at: new Date().toISOString(),
    } as any).eq("id", extraction.id);
    await supabase.from("audit_log").insert({
      action: "reject_extraction",
      target_table: "staged_fund_extractions",
      target_id: extraction.id,
      quarter_date: extraction.quarter_date,
      performed_by: reviewerName || "unknown",
      details: { fund_name: fundName, reason: notes },
    } as any);
    toast.info("Extraction rejected");
    setRejectOpen(false);
    setNotes("");
    onAction();
  };

  const openPdf = async () => {
    if (!extraction.source_file_path) return;
    const { data } = await supabase.storage.from("fund-reports").createSignedUrl(extraction.source_file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const addCompany = () => {
    setCompanies(prev => [...prev, { name: "", investment_cost: 0, fair_market_value: 0, realized_proceeds: 0, sector: "", region: "", instrument: "", round: "", status: "active" }]);
  };

  const removeCompany = (idx: number) => {
    setCompanies(prev => prev.filter((_, i) => i !== idx));
  };

  const updateCompany = (idx: number, field: string, value: string) => {
    setCompanies(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addCashflow = () => {
    setCashflows(prev => [...prev, { date: "", type: "capital_call", amount: 0, description: "" }]);
  };

  const removeCashflow = (idx: number) => {
    setCashflows(prev => prev.filter((_, i) => i !== idx));
  };

  const updateCashflow = (idx: number, field: string, value: string) => {
    setCashflows(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-1 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{fundName}</span>
              {confidenceBadge()}
              {extraction.status === "needs_revision" && (
                <Badge variant="outline" className="border-[hsl(var(--warning))] text-[hsl(var(--warning))] text-[10px]">Needs Revision</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {extraction.quarter_date} · {extraction.source_file_name || "No file"} · Extracted {new Date(extraction.extracted_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Extraction notes */}
          {extractionNotes.length > 0 && (
            <div className="rounded-md bg-[hsl(var(--warning))]/5 border border-[hsl(var(--warning))]/20 p-3 space-y-1">
              <p className="text-xs font-medium text-[hsl(var(--warning))]">Extraction Notes:</p>
              {extractionNotes.map((note: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">• {note}</p>
              ))}
            </div>
          )}

          {/* Reviewer notes from previous revision */}
          {extraction.reviewer_notes && (
            <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3">
              <p className="text-xs font-medium text-destructive">Reviewer Notes:</p>
              <p className="text-xs text-muted-foreground">{extraction.reviewer_notes}</p>
            </div>
          )}

          <div className="flex gap-4">
            {/* Left: PDF link */}
            <div className="w-[40%] space-y-3">
              {extraction.source_file_path && (
                <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={openPdf}>
                  <ExternalLink className="h-3.5 w-3.5" /> View Original PDF
                </Button>
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>File:</strong> {extraction.source_file_name || "—"}</p>
                <p><strong>Model:</strong> {extraction.extraction_model || "—"}</p>
                <p><strong>Extracted:</strong> {new Date(extraction.extracted_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Right: Editable form */}
            <div className="w-[60%] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "NAV", field: "nav", prefix: "$" },
                  { label: "Total Capital Called", field: "capital_called", prefix: "$" },
                  { label: "Total Distributions", field: "distributions", prefix: "$" },
                  { label: "Unfunded", field: "unfunded", prefix: "$" },
                  { label: "Commitment", field: "commitment", prefix: "$" },
                  { label: "Gross IRR (%)", field: "gross_irr", suffix: "%" },
                  { label: "Gross TVPI", field: "gross_tvpi", suffix: "x" },
                  { label: "Net IRR (%)", field: "net_irr", suffix: "%" },
                  { label: "Net TVPI", field: "net_tvpi", suffix: "x" },
                  { label: "DPI", field: "dpi", suffix: "x" },
                  { label: "RVPI", field: "rvpi", suffix: "x" },
                  { label: "PIC (%)", field: "pic", suffix: "%" },
                ].map(({ label, field, prefix, suffix }) => (
                  <div key={field}>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</label>
                    <div className="relative">
                      {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}
                      <Input
                        type="number"
                        className={cn("h-7 text-xs bg-surface-2", prefix && "pl-5")}
                        value={form[field as keyof typeof form]}
                        onChange={(e) => updateField(field, e.target.value)}
                      />
                      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Portfolio Companies */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 p-3 text-sm font-medium hover:bg-surface-1 transition-colors"
              onClick={() => setCompaniesExpanded(!companiesExpanded)}
            >
              {companiesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Portfolio Companies ({companies.length})
            </button>
            {companiesExpanded && (
              <div className="border-t border-border p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs text-right">Cost</TableHead>
                      <TableHead className="text-xs text-right">FMV</TableHead>
                      <TableHead className="text-xs text-right">Proceeds</TableHead>
                      <TableHead className="text-xs">Sector</TableHead>
                      <TableHead className="text-xs">Region</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell><Input className="h-6 text-xs" value={c.name} onChange={e => updateCompany(i, "name", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" className="h-6 text-xs text-right w-24" value={c.investment_cost ?? ""} onChange={e => updateCompany(i, "investment_cost", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" className="h-6 text-xs text-right w-24" value={c.fair_market_value ?? ""} onChange={e => updateCompany(i, "fair_market_value", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" className="h-6 text-xs text-right w-24" value={c.realized_proceeds ?? ""} onChange={e => updateCompany(i, "realized_proceeds", e.target.value)} /></TableCell>
                        <TableCell><Input className="h-6 text-xs w-20" value={c.sector ?? ""} onChange={e => updateCompany(i, "sector", e.target.value)} /></TableCell>
                        <TableCell><Input className="h-6 text-xs w-20" value={c.region ?? ""} onChange={e => updateCompany(i, "region", e.target.value)} /></TableCell>
                        <TableCell>
                          <button onClick={() => removeCompany(i)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3 w-3" /></button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs gap-1" onClick={addCompany}>
                  <Plus className="h-3 w-3" /> Add Company
                </Button>
              </div>
            )}
          </div>

          {/* Cashflow Activity */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 p-3 text-sm font-medium hover:bg-surface-1 transition-colors"
              onClick={() => setCashflowsExpanded(!cashflowsExpanded)}
            >
              {cashflowsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Cashflow Activity ({cashflows.length})
            </button>
            {cashflowsExpanded && (
              <div className="border-t border-border p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashflows.map((cf: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell><Input type="date" className="h-6 text-xs w-32" value={cf.date} onChange={e => updateCashflow(i, "date", e.target.value)} /></TableCell>
                        <TableCell>
                          <select
                            className="h-6 text-xs bg-surface-2 border border-border rounded px-1"
                            value={cf.type}
                            onChange={e => updateCashflow(i, "type", e.target.value)}
                          >
                            <option value="capital_call">Capital Call</option>
                            <option value="distribution">Distribution</option>
                            <option value="recallable">Recallable</option>
                          </select>
                        </TableCell>
                        <TableCell><Input type="number" className="h-6 text-xs text-right w-28" value={cf.amount ?? ""} onChange={e => updateCashflow(i, "amount", e.target.value)} /></TableCell>
                        <TableCell><Input className="h-6 text-xs" value={cf.description ?? ""} onChange={e => updateCashflow(i, "description", e.target.value)} /></TableCell>
                        <TableCell>
                          <button onClick={() => removeCashflow(i)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3 w-3" /></button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs gap-1" onClick={addCashflow}>
                  <Plus className="h-3 w-3" /> Add Cashflow
                </Button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              className="bg-[hsl(var(--positive))] text-[hsl(var(--positive-foreground))] hover:bg-[hsl(var(--positive))]/90 gap-2"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Approve & Push Live
            </Button>
            <Button
              variant="outline"
              className="border-[hsl(var(--warning))] text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10 gap-2"
              onClick={() => setRevisionOpen(true)}
            >
              <AlertTriangle className="h-4 w-4" /> Request Revision
            </Button>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10 gap-2"
              onClick={() => setRejectOpen(true)}
            >
              <X className="h-4 w-4" /> Reject
            </Button>
          </div>
        </div>
      )}

      {/* Revision Dialog */}
      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Revision</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Describe what needs to be corrected..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionOpen(false)}>Cancel</Button>
            <Button className="bg-[hsl(var(--warning))] text-background" onClick={handleRevision}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Extraction</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
