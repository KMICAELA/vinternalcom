import { useState, useMemo, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds, useFundCashflows, useFundFinancialStatement, useFundReports, useActiveQuarter } from "@/hooks/usePortfolioData";
import { useReportTracking, type EnhancedFundTracking, type TrackingSummary } from "@/hooks/useReportTracking";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { useFundQuarterMetrics } from "@/hooks/useConsolidatedMetrics";
import { useReportCoverage, type FundCoverage } from "@/hooks/useReportCoverage";
import { useFxRatesForQuarter } from "@/hooks/useFxRates";
import { computeFundMetrics, formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Upload, Plus, Trash2, FileText, Loader2, Check, Lock, X, FileStack, ClipboardCheck, Eye, ArrowRight, Link as LinkIcon, Mail } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import PcapReviewDialog from "@/components/PcapReviewDialog";

const CASHFLOW_TYPES = [
  "Capital Call — Investment",
  "Capital Call — Mgmt. Fees",
  "Capital Call — Other",
  "Distribution",
];

export default function FundsPage() {
  const qc = useQueryClient();
  const { data: funds = [], isLoading } = useFunds();
  const activeQuarter = useActiveQuarter();
  const { defaultQuarter } = useQuarterContext();
  const { data: fqm } = useFundQuarterMetrics(activeQuarter.date);
  const cm = useConsolidatedMetrics();
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const [addFundOpen, setAddFundOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const navigate = useNavigate();

  // Report Tracker quarter selection
  const trackerQuarters = useMemo(() => {
    const qs: { label: string; date: string }[] = [];
    const makeQ = (d: Date) => {
      const qMonth = Math.floor(d.getMonth() / 3) * 3 + 2;
      d.setMonth(qMonth);
      d.setDate(new Date(d.getFullYear(), qMonth + 1, 0).getDate());
      const qNum = Math.floor(qMonth / 3) + 1;
      return {
        label: `${qNum}Q${String(d.getFullYear()).slice(2)}`,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      };
    };
    for (let i = 3; i >= 1; i--) {
      const d = new Date(defaultQuarter.date);
      d.setMonth(d.getMonth() - 3 * i);
      qs.push(makeQ(d));
    }
    qs.push({ label: defaultQuarter.quarter, date: defaultQuarter.date });
    return qs;
  }, [defaultQuarter.date, defaultQuarter.quarter]);

  const [trackerQuarterDate, setTrackerQuarterDate] = useState(defaultQuarter.date);
  const { data: coverage, isLoading: coverageLoading } = useReportCoverage(trackerQuarterDate);

  // Add Reports quarter options (for existing dialog)
  const availableQuarters = useMemo(() => {
    const quarters: { label: string; date: string }[] = [];
    const makeQuarter = (d: Date) => {
      const qMonth = Math.floor(d.getMonth() / 3) * 3 + 2;
      d.setMonth(qMonth);
      d.setDate(new Date(d.getFullYear(), qMonth + 1, 0).getDate());
      const qNum = Math.floor(qMonth / 3) + 1;
      return { label: `Q${qNum} ${d.getFullYear()}`, date: d.toISOString().split("T")[0] };
    };
    for (let i = 2; i >= 1; i--) {
      const d = new Date(defaultQuarter.date);
      d.setMonth(d.getMonth() - 3 * i);
      quarters.push(makeQuarter(d));
    }
    quarters.push({ label: `Q${defaultQuarter.quarter[0]} ${defaultQuarter.date.slice(0, 4)}`, date: defaultQuarter.date });
    const nd = new Date(defaultQuarter.date);
    nd.setMonth(nd.getMonth() + 3);
    quarters.push(makeQuarter(nd));
    return quarters;
  }, [defaultQuarter.date, defaultQuarter.quarter]);

  // FS status for Fund Details tab
  const { data: allFsForQuarter = [] } = useQuery({
    queryKey: ["all-fund-fs-status", activeQuarter.date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("fund_id, confirmed, quarter_date")
        .eq("quarter_date", activeQuarter.date)
        .eq("confirmed", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  const fsStatusMap = useMemo(() => {
    const confirmedSet = new Set(allFsForQuarter.map((fs: any) => fs.fund_id));
    return { confirmedSet };
  }, [allFsForQuarter]);

  const uploadedCount = funds.filter((f: any) => fsStatusMap.confirmedSet.has(f.id)).length;
  const allUploaded = uploadedCount === funds.length && funds.length > 0;

  const handleLockQuarter = async () => {
    const { error } = await supabase.from("quarterly_history").upsert(
      {
        quarter: activeQuarter.quarter,
        quarter_date: activeQuarter.date,
        locked: true,
        nav: cm.totalNav,
        contribution: cm.totalCapitalCalls,
        distribution: cm.totalDistributions,
        net_tvpi: cm.netTvpi,
        net_irr: cm.netIrr || 0,
        gross_tvpi: cm.grossTvpi,
        gross_irr: cm.grossIrr || 0,
      } as any,
      { onConflict: "quarter_date" }
    );
    if (error) { toast.error(error.message); return; }
    toast.success(`${activeQuarter.quarter} metrics locked and saved to historical record.`);
    setLockModalOpen(false);
    qc.invalidateQueries({ queryKey: ["quarterly-history"] });
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const summary = coverage?.summary;
  const received = (summary?.complete ?? 0) + (summary?.inReview ?? 0);
  const totalActive = (summary?.total ?? 0) - (summary?.na ?? 0);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Funds</h1>
          <p className="text-sm text-muted-foreground">Fund registry & financial statement management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddFundOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add Fund
          </Button>
          <Button
            size="sm"
            disabled={!allUploaded}
            onClick={() => setLockModalOpen(true)}
            className={cn(
              "gap-2 transition-colors",
              allUploaded
                ? "bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Lock className="h-3.5 w-3.5" /> Generate Metrics
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tracker" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tracker">Report Tracker</TabsTrigger>
          <TabsTrigger value="details">Fund Details</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Report Tracker ── */}
        <TabsContent value="tracker" className="space-y-4">
          <ReportTrackerView
            trackerQuarters={trackerQuarters}
            trackerQuarterDate={trackerQuarterDate}
            setTrackerQuarterDate={setTrackerQuarterDate}
            coverage={coverage?.coverage || []}
            summary={summary}
            received={received}
            totalActive={totalActive}
            coverageLoading={coverageLoading}
            funds={funds}
            availableQuarters={availableQuarters}
          />
        </TabsContent>

        {/* ── Tab 2: Fund Details ── */}
        <TabsContent value="details" className="space-y-4">
          <FundDetailsView
            funds={funds}
            activeQuarter={activeQuarter}
            fsStatusMap={fsStatusMap}
            fqm={fqm}
            expandedFund={expandedFund}
            setExpandedFund={setExpandedFund}
          />
        </TabsContent>
      </Tabs>

      {addFundOpen && <AddFundDialog onClose={() => setAddFundOpen(false)} />}

      <Dialog open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Metrics for {activeQuarter.quarter}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will snapshot all current metrics into the historical record.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleLockQuarter}
              className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90 gap-2"
            >
              <Lock className="h-3.5 w-3.5" /> Lock {activeQuarter.quarter} Metrics
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Report Tracker View
// ═══════════════════════════════════════════════════════════════════

function ReportTrackerView({
  trackerQuarters,
  trackerQuarterDate,
  setTrackerQuarterDate,
  coverage,
  summary,
  received,
  totalActive,
  coverageLoading,
  funds,
  availableQuarters,
}: {
  trackerQuarters: { label: string; date: string }[];
  trackerQuarterDate: string;
  setTrackerQuarterDate: (d: string) => void;
  coverage: FundCoverage[];
  summary: any;
  received: number;
  totalActive: number;
  coverageLoading: boolean;
  funds: any[];
  availableQuarters: { label: string; date: string }[];
}) {
  const [openUploadFundId, setOpenUploadFundId] = useState<string | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [pcapReviewFundId, setPcapReviewFundId] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const completionPct = totalActive > 0 ? (received / totalActive) * 100 : 0;

  // PCAP extractions for the selected quarter
  const { data: pcapExtractions = [] } = useQuery({
    queryKey: ["pcap-extractions", trackerQuarterDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pcap_extractions")
        .select("*")
        .eq("quarter_date", trackerQuarterDate);
      if (error) throw error;
      return data || [];
    },
  });
  const pcapMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const p of pcapExtractions) map[p.fund_id] = p;
    return map;
  }, [pcapExtractions]);
  const missingFunds = coverage.filter((c) => c.status === "missing");

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Quarter</label>
          <Select value={trackerQuarterDate} onValueChange={setTrackerQuarterDate}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {trackerQuarters.map((q) => (
                <SelectItem key={q.date} value={q.date}>{q.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary chips */}
          {summary && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-card border border-border">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {summary.complete} Complete
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-card border border-border">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {summary.inReview} In Review
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-card border border-border">
                <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                {summary.missing} Missing
              </span>
            </div>
          )}
          {missingFunds.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setBulkUploadOpen(true)} className="gap-2">
              <FileStack className="h-3.5 w-3.5" /> Bulk Upload Missing
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${completionPct}%`,
              background: "linear-gradient(90deg, hsl(var(--gold) / 0.7), hsl(var(--gold)))",
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
          {received} / {totalActive}
        </span>
      </div>

      {/* Fund list */}
      {coverageLoading ? (
        <div className="flex items-center gap-2 p-8 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {coverage.map((fund) => (
            <ReportTrackerRow
              key={fund.fundId}
              fund={fund}
              isUploadOpen={openUploadFundId === fund.fundId}
              onToggleUpload={() =>
                setOpenUploadFundId(openUploadFundId === fund.fundId ? null : fund.fundId)
              }
              quarterDate={trackerQuarterDate}
              pcap={pcapMap[fund.fundId] || null}
              onReviewPcap={() => setPcapReviewFundId(fund.fundId)}
            />
          ))}
        </div>
      )}

      {bulkUploadOpen && (
        <BulkUploadMissingDialog
          missingFunds={missingFunds}
          allFunds={funds}
          quarterDate={trackerQuarterDate}
          onClose={() => setBulkUploadOpen(false)}
        />
      )}

      {pcapReviewFundId && pcapMap[pcapReviewFundId] && (
        <PcapReviewDialog
          pcap={pcapMap[pcapReviewFundId]}
          fundName={coverage.find(c => c.fundId === pcapReviewFundId)?.fundName || ""}
          onClose={() => setPcapReviewFundId(null)}
        />
      )}
    </div>
  );
}

// ─── Single fund row in Report Tracker ──────────────────────────────

function ReportTrackerRow({
  fund,
  isUploadOpen,
  onToggleUpload,
  quarterDate,
  pcap,
  onReviewPcap,
}: {
  fund: FundCoverage;
  isUploadOpen: boolean;
  onToggleUpload: () => void;
  quarterDate: string;
  pcap: any;
  onReviewPcap: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [uploadMode, setUploadMode] = useState<"document" | "email" | "link">("document");
  const [emailText, setEmailText] = useState("");
  const [submittingEmail, setSubmittingEmail] = useState(false);

  const handleEmailSubmit = async () => {
    if (!emailText.trim()) return;
    setSubmittingEmail(true);
    try {
      const arrayBuffer = new TextEncoder().encode(emailText);
      const base64 = btoa(String.fromCharCode(...arrayBuffer));

      const { data: template } = await supabase
        .from("fund_extraction_templates")
        .select("*")
        .eq("fund_id", fund.fundId)
        .maybeSingle();

      const { data: extracted, error } = await supabase.functions.invoke("extract-fund-fs", {
        body: { pdf_base64: base64, file_name: "email_paste.txt", template: template || undefined },
      });
      if (error) throw error;

      const summary = extracted?.fund_summary || {};
      const companies = extracted?.portfolio_companies || [];

      await supabase.from("staged_fund_extractions").insert({
        fund_id: fund.fundId,
        quarter_date: quarterDate,
        source_file_name: "Email paste",
        extracted_nav: summary.nav,
        extracted_capital_called: summary.total_capital_called,
        extracted_distributions: summary.total_distributions,
        extracted_gross_irr: summary.gross_irr,
        extracted_gross_tvpi: summary.gross_tvpi,
        extracted_net_irr: summary.net_irr,
        extracted_net_tvpi: summary.net_tvpi,
        extracted_dpi: summary.dpi,
        extracted_rvpi: summary.rvpi,
        extracted_pic: summary.pic,
        extracted_commitment: summary.commitment,
        extracted_unfunded: summary.unfunded_commitment,
        extracted_companies: companies,
        raw_extraction: extracted,
        confidence_score: extracted?.extraction_confidence ?? null,
        extraction_model: "gemini-2.5-pro",
      } as any);

      toast.success("Email content submitted for extraction.");
      qc.invalidateQueries({ queryKey: ["report-coverage"] });
      qc.invalidateQueries({ queryKey: ["pending-review-count"] });
      setEmailText("");
      onToggleUpload();
    } catch (err: any) {
      toast.error(err.message || "Email extraction failed");
    } finally {
      setSubmittingEmail(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const storagePath = `${quarterDate}/${fund.fundId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("fund-reports")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const { data: template } = await supabase
        .from("fund_extraction_templates")
        .select("*")
        .eq("fund_id", fund.fundId)
        .maybeSingle();

      const { data: extracted, error } = await supabase.functions.invoke("extract-fund-fs", {
        body: { pdf_base64: base64, file_name: file.name, template: template || undefined },
      });
      if (error) throw error;

      const summary = extracted?.fund_summary || {};
      const companies = extracted?.portfolio_companies || [];

      await supabase.from("staged_fund_extractions").insert({
        fund_id: fund.fundId,
        quarter_date: quarterDate,
        source_file_path: storagePath,
        source_file_name: file.name,
        extracted_nav: summary.nav,
        extracted_capital_called: summary.total_capital_called,
        extracted_distributions: summary.total_distributions,
        extracted_gross_irr: summary.gross_irr,
        extracted_gross_tvpi: summary.gross_tvpi,
        extracted_net_irr: summary.net_irr,
        extracted_net_tvpi: summary.net_tvpi,
        extracted_dpi: summary.dpi,
        extracted_rvpi: summary.rvpi,
        extracted_pic: summary.pic,
        extracted_commitment: summary.commitment,
        extracted_unfunded: summary.unfunded_commitment,
        extracted_companies: companies,
        raw_extraction: extracted,
        confidence_score: extracted?.extraction_confidence ?? null,
        extraction_model: "gemini-2.5-pro",
      } as any);

      toast.success("Report uploaded and extracting...");
      qc.invalidateQueries({ queryKey: ["report-coverage"] });
      qc.invalidateQueries({ queryKey: ["pending-review-count"] });
      onToggleUpload(); // close
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!urlValue.trim()) return;
    setSavingUrl(true);
    try {
      await supabase.from("staged_fund_extractions").insert({
        fund_id: fund.fundId,
        quarter_date: quarterDate,
        source_file_name: urlValue.trim(),
        source_url: urlValue.trim(),
        status: "pending_review",
      } as any);
      toast.success("Link saved. Extraction available when PDF URL processing is supported.");
      qc.invalidateQueries({ queryKey: ["report-coverage"] });
      setUrlValue("");
      onToggleUpload();
    } catch (err: any) {
      toast.error(err.message || "Failed to save link");
    } finally {
      setSavingUrl(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") handleFileUpload(file);
    else toast.error("Please drop a PDF file");
  };

  const statusBadge = () => {
    switch (fund.status) {
      case "complete":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
            <Check className="h-3 w-3" /> Complete
          </span>
        );
      case "in_review":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
            ⏳ In Review
          </span>
        );
      case "na":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full text-muted-foreground/50 font-medium">
            — N/A
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
            Missing
          </span>
        );
    }
  };

  const rightAction = () => {
    switch (fund.status) {
      case "complete":
        return (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-muted-foreground">
            <Eye className="h-3 w-3" /> View
          </Button>
        );
      case "in_review":
        return (
          <div className="flex items-center gap-2">
            {fund.fileName && (
              <span className="text-xs font-mono text-muted-foreground max-w-[180px] truncate">
                {fund.fileName}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 text-amber-400 hover:text-amber-300"
              onClick={() => navigate("/review")}
            >
              <ArrowRight className="h-3 w-3" /> Go to Review
            </Button>
          </div>
        );
      case "missing":
        return (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5 text-[hsl(var(--gold))] hover:text-[hsl(var(--gold))]/80"
            onClick={(e) => {
              e.stopPropagation();
              onToggleUpload();
            }}
          >
            <Upload className="h-3 w-3" /> Upload Report
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{fund.fundName}</span>
          {fund.strategy && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {fund.strategy}{fund.vintageYear ? ` · ${fund.vintageYear}` : ""}
            </span>
          )}
          {statusBadge()}
          {pcap && (
            <Badge
              variant="outline"
              className={cn("text-[9px] cursor-pointer", {
                "border-[hsl(var(--positive))]/50 text-[hsl(var(--positive))]": pcap.extraction_status === "approved",
                "border-amber-500/50 text-amber-400": pcap.extraction_status === "extracted" || pcap.extraction_status === "reviewed",
                "border-destructive/50 text-destructive": pcap.extraction_status === "error",
                "border-muted-foreground/50 text-muted-foreground": pcap.extraction_status === "pending",
              })}
              onClick={(e) => { e.stopPropagation(); onReviewPcap(); }}
            >
              PCAP: {pcap.extraction_status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rightAction()}
        </div>
      </div>

      {/* Inline upload zone */}
      {isUploadOpen && fund.status === "missing" && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
            {([
              { key: "document" as const, icon: FileText, label: "Document" },
              { key: "email" as const, icon: Mail, label: "Email" },
              { key: "link" as const, icon: LinkIcon, label: "Link" },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setUploadMode(key)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors",
                  uploadMode === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Document upload */}
          {uploadMode === "document" && (
            <div
              className="border-2 border-dashed border-[hsl(var(--gold))/0.4] rounded-lg p-6 text-center bg-[hsl(var(--gold))/0.03] hover:bg-[hsl(var(--gold))/0.06] transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--gold))]" />
                  Uploading & extracting...
                </div>
              ) : (
                <>
                  <Upload className="h-5 w-5 mx-auto text-[hsl(var(--gold))]/60 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop PDF here, or <span className="text-[hsl(var(--gold))] underline">browse files</span>
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}

          {/* Email paste */}
          {uploadMode === "email" && (
            <div className="space-y-2">
              <Textarea
                className="min-h-[140px] text-xs font-mono bg-muted/30"
                placeholder="Paste the email body here (quarterly report update, capital call notice, distribution notice, etc.)..."
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  AI will extract fund metrics from the email content
                </p>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))] hover:bg-[hsl(var(--gold))]/90"
                  disabled={!emailText.trim() || submittingEmail}
                  onClick={handleEmailSubmit}
                >
                  {submittingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                  Extract from Email
                </Button>
              </div>
            </div>
          )}

          {/* Link */}
          {uploadMode === "link" && (
            <div className="flex items-center gap-2">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                className="h-8 text-xs flex-1"
                placeholder="https://..."
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!urlValue.trim() || savingUrl}
                onClick={handleSaveUrl}
              >
                {savingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Bulk Upload Missing Dialog
// ═══════════════════════════════════════════════════════════════════

function BulkUploadMissingDialog({
  missingFunds,
  allFunds,
  quarterDate,
  onClose,
}: {
  missingFunds: FundCoverage[];
  allFunds: any[];
  quarterDate: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [fileMatches, setFileMatches] = useState<{ file: File; fundId: string }[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [allDone, setAllDone] = useState(false);

  const fuzzyMatch = (fileName: string): string | null => {
    const clean = fileName.replace(/\.pdf$/i, "").replace(/[_\-\.]/g, " ").toLowerCase();
    let bestId: string | null = null;
    let bestScore = 0;
    for (const f of missingFunds) {
      const name = f.fundName.toLowerCase();
      // Simple substring match score
      const words = name.split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (clean.includes(w) && w.length > 2) score += w.length;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = f.fundId;
      }
    }
    return bestScore > 3 ? bestId : null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
    const matches = files.map((file) => ({
      file,
      fundId: fuzzyMatch(file.name) || missingFunds[0]?.fundId || "",
    }));
    setFileMatches((prev) => [...prev, ...matches]);
  };

  const handleExtractAll = async () => {
    if (fileMatches.length === 0) return;
    setExtracting(true);
    setProgress({ done: 0, total: fileMatches.length });
    let completed = 0;

    const batchSize = 3;
    for (let i = 0; i < fileMatches.length; i += batchSize) {
      const batch = fileMatches.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ({ file, fundId }) => {
          try {
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
            const storagePath = `${quarterDate}/${fundId}/${fileName}`;
            await supabase.storage.from("fund-reports").upload(storagePath, file);

            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

            const { data: template } = await supabase
              .from("fund_extraction_templates")
              .select("*")
              .eq("fund_id", fundId)
              .maybeSingle();

            const { data: extracted, error } = await supabase.functions.invoke("extract-fund-fs", {
              body: { pdf_base64: base64, file_name: file.name, template: template || undefined },
            });
            if (error) throw error;

            const sum = extracted?.fund_summary || {};
            await supabase.from("staged_fund_extractions").insert({
              fund_id: fundId,
              quarter_date: quarterDate,
              source_file_path: storagePath,
              source_file_name: file.name,
              extracted_nav: sum.nav,
              extracted_capital_called: sum.total_capital_called,
              extracted_distributions: sum.total_distributions,
              extracted_gross_irr: sum.gross_irr,
              extracted_gross_tvpi: sum.gross_tvpi,
              extracted_net_irr: sum.net_irr,
              extracted_net_tvpi: sum.net_tvpi,
              extracted_dpi: sum.dpi,
              extracted_rvpi: sum.rvpi,
              extracted_pic: sum.pic,
              extracted_commitment: sum.commitment,
              extracted_unfunded: sum.unfunded_commitment,
              extracted_companies: extracted?.portfolio_companies || [],
              raw_extraction: extracted,
              confidence_score: extracted?.extraction_confidence ?? null,
              extraction_model: "gemini-2.5-pro",
            } as any);
          } catch (err: any) {
            const fund = missingFunds.find((f) => f.fundId === fundId);
            toast.error(`Failed: ${fund?.fundName || fundId}: ${err.message}`);
          } finally {
            completed++;
            setProgress({ done: completed, total: fileMatches.length });
          }
        })
      );
    }

    setAllDone(true);
    setExtracting(false);
    qc.invalidateQueries({ queryKey: ["report-coverage"] });
    qc.invalidateQueries({ queryKey: ["pending-review-count"] });
    toast.success(`Extracted ${completed}/${fileMatches.length} reports. Ready for review.`);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !extracting) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5" /> Bulk Upload Missing Reports
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {missingFunds.length} fund{missingFunds.length !== 1 ? "s" : ""} missing for this quarter
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-[hsl(var(--gold))/0.4] rounded-lg p-6 text-center bg-[hsl(var(--gold))/0.03] cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="h-5 w-5 mx-auto text-[hsl(var(--gold))]/60 mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag & drop multiple PDFs here
            </p>
          </div>

          {extracting && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--gold))]" />
              <span className="text-sm text-muted-foreground">
                Extracting {progress.done}/{progress.total}...
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[hsl(var(--gold))] transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* File → Fund matches */}
          {fileMatches.map((match, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                {match.file.name}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select
                value={match.fundId}
                onValueChange={(v) =>
                  setFileMatches((prev) =>
                    prev.map((m, i) => (i === idx ? { ...m, fundId: v } : m))
                  )
                }
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {missingFunds.map((f) => (
                    <SelectItem key={f.fundId} value={f.fundId}>
                      {f.fundName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => setFileMatches((prev) => prev.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {fileMatches.length} file{fileMatches.length !== 1 ? "s" : ""} matched
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={extracting}>
              Cancel
            </Button>
            {allDone ? (
              <Button
                size="sm"
                className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90 gap-2"
                onClick={() => {
                  onClose();
                  navigate("/review");
                }}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Go to Review
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
                onClick={handleExtractAll}
                disabled={fileMatches.length === 0 || extracting}
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...
                  </>
                ) : (
                  `Extract All (${fileMatches.length})`
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Fund Details View (existing table, unchanged)
// ═══════════════════════════════════════════════════════════════════

function FundDetailsView({
  funds,
  activeQuarter,
  fsStatusMap,
  fqm,
  expandedFund,
  setExpandedFund,
}: {
  funds: any[];
  activeQuarter: { quarter: string; date: string };
  fsStatusMap: { confirmedSet: Set<string> };
  fqm: any;
  expandedFund: string | null;
  setExpandedFund: (id: string | null) => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-1">
            <TableHead className="w-8" />
            <TableHead>Fund Name</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead className="text-right">Vintage</TableHead>
            <TableHead className="text-center">FS Status</TableHead>
            <TableHead className="text-right">TWH Commitment</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">TWH %</TableHead>
            <TableHead className="text-right">TWH NAV</TableHead>
            <TableHead className="text-right">TVPI</TableHead>
            <TableHead className="text-right">IRR</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {funds.map((fund: any) => {
            const hasFS = fsStatusMap.confirmedSet.has(fund.id);
            const registryNav = fqm?.fundNAVs[fund.fund_name] ?? null;
            const hasTvpiEntry = fqm?.fundTVPIs ? fund.fund_name in fqm.fundTVPIs : false;
            const registryTvpi = hasTvpiEntry ? (fqm!.fundTVPIs[fund.fund_name] ?? null) : undefined;
            return (
              <FundRow
                key={fund.id}
                fund={fund}
                quarterDate={activeQuarter.date}
                isExpanded={expandedFund === fund.id}
                onToggle={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
                fsStatus={hasFS ? "uploaded" : "pending"}
                fsLabel={hasFS ? activeQuarter.quarter : "Pending"}
                registryNav={registryNav}
                registryTvpi={registryTvpi}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Fund Row with expandable capital activity + FS status badge ────

function FundRow({ fund, quarterDate, isExpanded, onToggle, fsStatus, fsLabel, registryNav, registryTvpi }: {
  fund: any; quarterDate: string; isExpanded: boolean; onToggle: () => void;
  fsStatus: "uploaded" | "stale" | "pending"; fsLabel: string;
  registryNav?: number | null; registryTvpi?: number | null;
}) {
  const { data: fs } = useFundFinancialStatement(fund.id, quarterDate);
  const { data: allFundReports = [] } = useFundReports(quarterDate);
  const { data: cashflows = [] } = useFundCashflows(fund.id);
  const isNonUsd = fund.currency && fund.currency !== "USD";
  const fxPair = isNonUsd ? `${fund.currency}/USD` : null;
  const { data: fxRateData } = useQuery({
    queryKey: ["fx-rate-fund-row", fxPair, quarterDate],
    queryFn: async () => {
      if (!fxPair) return null;
      const { data } = await supabase
        .from("fx_rates")
        .select("*")
        .eq("currency_pair", fxPair)
        .eq("rate_date", quarterDate)
        .maybeSingle();
      return data;
    },
    enabled: !!fxPair,
  });
  const qc = useQueryClient();

  const fundReport = allFundReports.find((r: any) => r.fund_id === fund.id);
  const fsData = fs?.extracted_data as any;
  const fundTotals = fsData?.fund_totals || {};

  const reportNav = Number(fundReport?.reported_nav || 0);
  const reportCalled = Number(fundReport?.capital_called_to_date || 0);
  const reportDist = Number(fundReport?.distributions_to_date || 0);

  const metrics = computeFundMetrics({
    twhCommitment: Number(fund.commitment_amount),
    totalFundCommitment: Number(fundTotals.total_commitment || 0),
    totalInvestmentCost: Number(fundTotals.total_investment_cost || 0),
    totalPortfolioFmv: Number(fundTotals.total_portfolio_fmv || 0),
    fundNav: Number(fundTotals.fund_nav || 0),
    capitalActivity: cashflows.map((c: any) => ({
      date: c.cashflow_date,
      type: c.cashflow_type || (c.capital_deployed > 0 ? 'Capital Call — Investment' : 'Distribution'),
      amount: Number(c.capital_deployed || 0) + Number(c.distribution_received || 0),
    })),
    reportDate: quarterDate,
    reportNav,
    reportCalled,
    reportDist,
    ownershipPct: Number(fund.ownership_percentage || 0),
  });

  const [newCf, setNewCf] = useState({ cashflow_date: "", cashflow_type: "Capital Call — Investment", amount: 0, description: "" });

  const addCashflow = async () => {
    if (!newCf.cashflow_date || !newCf.amount) return;
    const isCall = newCf.cashflow_type.startsWith("Capital Call");
    const { error } = await supabase.from("fund_cashflows").insert({
      fund_id: fund.id,
      cashflow_date: newCf.cashflow_date,
      cashflow_type: newCf.cashflow_type,
      capital_deployed: isCall ? newCf.amount : 0,
      distribution_received: !isCall ? newCf.amount : 0,
      description: newCf.description || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fund-cashflows", fund.id] });
    setNewCf({ cashflow_date: "", cashflow_type: "Capital Call — Investment", amount: 0, description: "" });
  };

  const deleteCashflow = async (id: string) => {
    await supabase.from("fund_cashflows").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["fund-cashflows", fund.id] });
  };

  const statusBadge = () => {
    if (fsStatus === "uploaded") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {fsLabel}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        Pending
      </span>
    );
  };

  // Determine if fund is "new" (start_date within last 6 months of quarter)
  const isNewFund = (() => {
    if (!fund.start_date) return false;
    const start = new Date(fund.start_date);
    const qEnd = new Date(quarterDate);
    const diffMs = qEnd.getTime() - start.getTime();
    return diffMs < 180 * 24 * 60 * 60 * 1000 && diffMs >= 0;
  })();

  // "Not yet called" if no contributions at all
  const notYetCalled = reportCalled === 0 && reportNav === 0;

  return (
    <>
      <TableRow className="table-row-hover cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">
          <span className="flex items-center gap-2">
            {fund.fund_name}
            {isNewFund && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-semibold uppercase tracking-wide">New</span>}
            {fund.currency && fund.currency !== "USD" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold uppercase tracking-wide">{fund.currency}</span>
            )}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground">{(fund as any).start_date || '—'}</TableCell>
        <TableCell className="text-right font-mono">{fund.vintage_year || '—'}</TableCell>
        <TableCell className="text-center">{statusBadge()}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(Number(fund.commitment_amount))}</TableCell>
        <TableCell className="text-muted-foreground">{(fund as any).currency || 'USD'}</TableCell>
        <TableCell className="text-right font-mono">{metrics.twhPct > 0 ? formatPercent(metrics.twhPct) : '—'}</TableCell>
        <TableCell className="text-right font-mono">
          {isNonUsd && fxRateData ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help border-b border-dashed border-muted-foreground/40">
                    {registryNav != null && registryNav > 0 ? formatCurrency(registryNav) : (metrics.twhNav > 0 ? formatCurrency(metrics.twhNav) : '—')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
                  <p className="font-medium">FX Conversion Detail</p>
                  <p>
                    NAV: €{((registryNav || metrics.twhNav) / Number(fxRateData.rate)).toLocaleString("en-US", { maximumFractionDigits: 0 })} × {Number(fxRateData.rate).toFixed(4)} = ${(registryNav || metrics.twhNav).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-muted-foreground">{fxRateData.source} rate, {fxRateData.rate_date}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            registryNav != null && registryNav > 0 ? formatCurrency(registryNav) : (metrics.twhNav > 0 ? formatCurrency(metrics.twhNav) : '—')
          )}
        </TableCell>
        <TableCell className="text-right font-mono">{registryTvpi !== undefined ? (registryTvpi != null && registryTvpi > 0 ? formatMultiple(registryTvpi) : (notYetCalled ? <span className="text-muted-foreground text-[10px]">Not yet called</span> : '—')) : (metrics.tvpi > 0 ? formatMultiple(metrics.tvpi) : (notYetCalled ? <span className="text-muted-foreground text-[10px]">Not yet called</span> : '—'))}</TableCell>
        <TableCell className="text-right font-mono">{formatIrr(metrics.irr)}</TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={11} className="bg-surface-1 p-0">
            <div className="p-4 space-y-4">
              {/* Fund Classification */}
              <div>
                <h3 className="text-sm font-medium mb-2">Fund Details</h3>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Theme", field: "theme" },
                    { label: "Company Industry(ies)", field: "company_industries" },
                    { label: "Target Industry(ies)", field: "target_industries" },
                    { label: "Geography", field: "geography" },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</label>
                      <Input
                        className="h-7 text-xs mt-1"
                        value={(fund as any)[field] || ""}
                        onChange={async (e) => {
                          await supabase.from("funds").update({ [field]: e.target.value || null } as any).eq("id", fund.id);
                          qc.invalidateQueries({ queryKey: ["funds"] });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculated Metrics */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "TWH Contributions", value: formatCurrency(metrics.twhContributions) },
                  { label: "TWH Distributions", value: formatCurrency(metrics.twhDistributions) },
                  { label: "TWH Cost", value: formatCurrency(metrics.twhCost), bg: true },
                  { label: "TWH FMV", value: formatCurrency(metrics.twhFmv), bg: true },
                  { label: "PIC", value: formatPercent(metrics.pic) },
                  { label: "RVPI", value: formatMultiple(metrics.rvpi) },
                  { label: "DPI", value: formatMultiple(metrics.dpi) },
                  { label: "TVPI", value: formatMultiple(metrics.tvpi) },
                  { label: "MOIC", value: formatMultiple(metrics.moic), bg: true },
                  { label: "IRR", value: formatIrr(metrics.irr) },
                ].map(m => (
                  <div key={m.label} className={cn("px-3 py-2 rounded border border-border", m.bg ? "bg-surface-2" : "bg-card")}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
                    <p className="text-sm font-mono font-medium">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Capital Activity Ledger */}
              <div>
                <h3 className="text-sm font-medium mb-2">Capital Activity</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount ($)</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashflows.map((cf: any) => (
                      <TableRow key={cf.id}>
                        <TableCell className="font-mono text-xs">{cf.cashflow_date}</TableCell>
                        <TableCell className="text-xs">{(cf as any).cashflow_type || '—'}</TableCell>
                        <TableCell className={cn("text-right font-mono text-xs",
                          cf.distribution_received > 0 ? "text-emerald-400" : ""
                        )}>
                          {formatCurrency(Number(cf.capital_deployed || 0) + Number(cf.distribution_received || 0))}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{cf.description || '—'}</TableCell>
                        <TableCell>
                          <button onClick={() => deleteCashflow(cf.id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>
                        <Input type="date" className="h-7 text-xs w-32" value={newCf.cashflow_date}
                          onChange={e => setNewCf(p => ({ ...p, cashflow_date: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <Select value={newCf.cashflow_type} onValueChange={v => setNewCf(p => ({ ...p, cashflow_type: v }))}>
                          <SelectTrigger className="h-7 text-xs w-48"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CASHFLOW_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 text-xs w-28 text-right" value={newCf.amount || ""}
                          onChange={e => setNewCf(p => ({ ...p, amount: Number(e.target.value) }))} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-7 text-xs" value={newCf.description}
                          onChange={e => setNewCf(p => ({ ...p, description: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={addCashflow} className="h-7 w-7 p-0">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Add Fund Dialog ────────────────────────────────────────────────

function AddFundDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fund_name: "",
    commitment_amount: "",
    ownership_percentage: "",
    vintage_year: "",
    start_date: "",
    strategy: "",
    geography: "",
    currency: "USD",
    theme: "",
    company_industries: "",
    target_industries: "",
    management_fee_rate: "2.0",
    carry_percentage: "20.0",
    hurdle_rate: "8.0",
  });

  const update = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!form.fund_name.trim()) { toast.error("Fund name is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("funds").insert({
      fund_name: form.fund_name.trim(),
      commitment_amount: Number(form.commitment_amount) || 0,
      ownership_percentage: Number(form.ownership_percentage) || 0,
      vintage_year: form.vintage_year ? Number(form.vintage_year) : null,
      start_date: form.start_date || null,
      strategy: form.strategy || null,
      geography: form.geography || null,
      currency: form.currency || "USD",
      theme: form.theme || null,
      company_industries: form.company_industries || null,
      target_industries: form.target_industries || null,
      management_fee_rate: Number(form.management_fee_rate) / 100 || 0.02,
      carry_percentage: Number(form.carry_percentage) / 100 || 0.20,
      hurdle_rate: Number(form.hurdle_rate) / 100 || 0.08,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.fund_name} added to portfolio`);
    qc.invalidateQueries({ queryKey: ["funds"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Add New Fund
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fund Name *</label>
              <Input className="h-8 mt-1" value={form.fund_name} onChange={e => update("fund_name", e.target.value)} placeholder="e.g. Sequoia Capital Fund XV" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TWH Commitment ($)</label>
              <Input type="number" className="h-8 mt-1" value={form.commitment_amount} onChange={e => update("commitment_amount", e.target.value)} placeholder="1000000" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TWH Ownership %</label>
              <Input type="number" className="h-8 mt-1" value={form.ownership_percentage} onChange={e => update("ownership_percentage", e.target.value)} placeholder="e.g. 5.0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vintage Year</label>
              <Input type="number" className="h-8 mt-1" value={form.vintage_year} onChange={e => update("vintage_year", e.target.value)} placeholder="2024" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Start Date</label>
              <Input type="date" className="h-8 mt-1" value={form.start_date} onChange={e => update("start_date", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Strategy</label>
              <Input className="h-8 mt-1" value={form.strategy} onChange={e => update("strategy", e.target.value)} placeholder="e.g. Venture" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Geography</label>
              <Input className="h-8 mt-1" value={form.geography} onChange={e => update("geography", e.target.value)} placeholder="e.g. North America" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Currency</label>
              <Select value={form.currency} onValueChange={v => update("currency", v)}>
                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Theme</label>
              <Input className="h-8 mt-1" value={form.theme} onChange={e => update("theme", e.target.value)} placeholder="e.g. AI/ML" />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground font-medium mb-2">Fee Terms</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Mgmt Fee %</label>
                <Input type="number" className="h-8 mt-1" value={form.management_fee_rate} onChange={e => update("management_fee_rate", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Carry %</label>
                <Input type="number" className="h-8 mt-1" value={form.carry_percentage} onChange={e => update("carry_percentage", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hurdle %</label>
                <Input type="number" className="h-8 mt-1" value={form.hurdle_rate} onChange={e => update("hurdle_rate", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Fund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
