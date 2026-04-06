import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Upload, HardDrive, FileText, Check, X, CheckCircle2, Clock, PenLine, Zap, Mail } from "lucide-react";
import { useFunds, useAvailableQuarters } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { underlyingPortfolioSeed, fundTwhPct } from "@/data/underlyingPortfolioSeed";

const ALL_QUARTERS = [
  "2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31",
  "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31",
  "2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31",
];

const formatQuarterLabel = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth();
  const year = d.getFullYear();
  const q = month < 3 ? "Q1" : month < 6 ? "Q2" : month < 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
};

function getNextQuarter(latestConfirmedDate: string | null): string {
  if (!latestConfirmedDate) return "2025-03-31";
  const d = new Date(latestConfirmedDate + "T00:00:00");
  d.setMonth(d.getMonth() + 3);
  const m = d.getMonth();
  if (m < 3) d.setMonth(2, 31);
  else if (m < 6) d.setMonth(5, 30);
  else if (m < 9) d.setMonth(8, 30);
  else d.setMonth(11, 31);
  return d.toISOString().slice(0, 10);
}

/** Compute per-fund totals from seed data */
function computeSeedTotals(fundName: string) {
  const rows = underlyingPortfolioSeed.filter(r => r.fund === fundName);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalFmv = rows.reduce((s, r) => s + r.fmv, 0);
  const totalProceeds = rows.reduce((s, r) => s + r.proceeds, 0);
  const twhPct = fundTwhPct[fundName] || 0;
  const totalCommitment = twhPct > 0 ? totalCost / twhPct : 0; // approximate
  return {
    total_commitment: Math.round(totalCommitment),
    total_contributions_called: Math.round(totalCost),
    total_investment_cost: Math.round(totalCost),
    total_portfolio_fmv: Math.round(totalFmv),
    fund_nav: Math.round(totalFmv), // approximate: NAV ≈ FMV for seed
    total_distributions: Math.round(totalProceeds),
  };
}

interface ManualFormData {
  report_date: string;
  total_commitment: number;
  total_contributions_called: number;
  total_investment_cost: number;
  total_portfolio_fmv: number;
  fund_nav: number;
  total_distributions: number;
}

const AddQuarterlyData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: funds = [] } = useFunds();
  const { data: availableQuarters = [] } = useAvailableQuarters();
  const queryClient = useQueryClient();

  const defaultQuarter = useMemo(() => {
    if (availableQuarters.length > 0) {
      return getNextQuarter(availableQuarters[0]);
    }
    return "2025-09-30";
  }, [availableQuarters]);

  const quarterOptions = useMemo(() => {
    return ALL_QUARTERS.filter((q) => q <= defaultQuarter);
  }, [defaultQuarter]);

  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const activeQuarter = selectedQuarter || defaultQuarter;

  const { data: existingFS = [] } = useQuery({
    queryKey: ["fund-fs-status", activeQuarter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("fund_id, confirmed, file_path")
        .eq("quarter_date", activeQuarter);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter,
  });

  const fsStatusMap = useMemo(() => {
    const map: Record<string, { confirmed: boolean; filePath: string | null }> = {};
    for (const row of existingFS) {
      map[row.fund_id] = { confirmed: row.confirmed, filePath: row.file_path };
    }
    return map;
  }, [existingFS]);

  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File | null>>({});
  const [uploadingFundId, setUploadingFundId] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Manual entry state
  const [manualFund, setManualFund] = useState<any>(null);
  const [manualForm, setManualForm] = useState<ManualFormData | null>(null);
  const [savingManual, setSavingManual] = useState(false);

  // Email paste state
  const [emailFund, setEmailFund] = useState<any>(null);
  const [emailText, setEmailText] = useState("");
  const [submittingEmail, setSubmittingEmail] = useState(false);

  const handleEmailSubmit = async () => {
    if (!emailFund || !emailText.trim()) return;
    setSubmittingEmail(true);
    try {
      const arrayBuffer = new TextEncoder().encode(emailText);
      const base64 = btoa(String.fromCharCode(...arrayBuffer));

      const { data: template } = await supabase
        .from("fund_extraction_templates")
        .select("*")
        .eq("fund_id", emailFund.id)
        .maybeSingle();

      const { data: extracted, error } = await supabase.functions.invoke("extract-fund-fs", {
        body: { pdf_base64: base64, file_name: "email_paste.txt", template: template || undefined },
      });
      if (error) throw error;

      const summary = extracted?.fund_summary || {};
      const companies = extracted?.portfolio_companies || [];

      await supabase.from("staged_fund_extractions").insert({
        fund_id: emailFund.id,
        quarter_date: activeQuarter,
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

      toast({ title: "Email submitted", description: `Email content for ${emailFund.fund_name} sent for extraction.` });
      setEmailFund(null);
      setEmailText("");
      queryClient.invalidateQueries({ queryKey: ["fund-fs-status", activeQuarter] });
      queryClient.invalidateQueries({ queryKey: ["report-coverage"] });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingEmail(false);
    }
  };

  const handleFileSelect = (fundId: string, file: File | null) => {
    setUploadedFiles((prev) => ({ ...prev, [fundId]: file }));
  };

  const handleUpload = async (fundId: string) => {
    const file = uploadedFiles[fundId];
    if (!file) return;
    setUploadingFundId(fundId);
    try {
      const filePath = `${activeQuarter}/${fundId}/${file.name}`;
      const { error: storageError } = await supabase.storage
        .from("fund-reports")
        .upload(filePath, file, { upsert: true });
      if (storageError) throw storageError;
      const { error: dbError } = await supabase
        .from("fund_financial_statements")
        .upsert(
          { fund_id: fundId, quarter_date: activeQuarter, file_path: filePath, confirmed: true },
          { onConflict: "fund_id,quarter_date" }
        );
      if (dbError) throw dbError;
      toast({ title: "Uploaded", description: `Report for ${funds.find((f: any) => f.id === fundId)?.fund_name} uploaded.` });
      setUploadedFiles((prev) => ({ ...prev, [fundId]: null }));
      queryClient.invalidateQueries({ queryKey: ["fund-fs-status", activeQuarter] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingFundId(null);
    }
  };

  const handleConnectDrive = () => {
    toast({ title: "Google Drive", description: "Google Drive integration is not yet configured." });
  };

  // Open manual entry dialog
  const openManualEntry = (fund: any) => {
    const seed = computeSeedTotals(fund.fund_name);
    setManualFund(fund);
    setManualForm({
      report_date: activeQuarter,
      ...seed,
    });
  };

  // Save manual entry
  const saveManualEntry = async () => {
    if (!manualFund || !manualForm) return;
    setSavingManual(true);
    try {
      const extractedData = {
        fund_totals: {
          total_commitment: manualForm.total_commitment,
          total_contributions_called: manualForm.total_contributions_called,
          total_investment_cost: manualForm.total_investment_cost,
          total_portfolio_fmv: manualForm.total_portfolio_fmv,
          fund_nav: manualForm.fund_nav,
          total_distributions: manualForm.total_distributions,
        },
        source: "manual_entry",
      };

      const { error } = await supabase
        .from("fund_financial_statements")
        .upsert(
          {
            fund_id: manualFund.id,
            quarter_date: activeQuarter,
            confirmed: true,
            extracted_data: extractedData,
            file_path: null,
          },
          { onConflict: "fund_id,quarter_date" }
        );
      if (error) throw error;

      toast({ title: "Confirmed", description: `${manualFund.fund_name} marked as uploaded for ${formatQuarterLabel(activeQuarter)}.` });
      setManualFund(null);
      setManualForm(null);
      queryClient.invalidateQueries({ queryKey: ["fund-fs-status", activeQuarter] });
      queryClient.invalidateQueries({ queryKey: ["all-fund-fs"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingManual(false);
    }
  };

  // Bulk confirm all funds for 3Q25
  const handleBulkConfirm = async () => {
    setBulkConfirming(true);
    try {
      const upserts = funds.map((f: any) => {
        const seed = computeSeedTotals(f.fund_name);
        return {
          fund_id: f.id,
          quarter_date: activeQuarter,
          confirmed: true,
          file_path: null,
          extracted_data: {
            fund_totals: {
              total_commitment: seed.total_commitment,
              total_contributions_called: seed.total_contributions_called,
              total_investment_cost: seed.total_investment_cost,
              total_portfolio_fmv: seed.total_portfolio_fmv,
              fund_nav: seed.fund_nav,
              total_distributions: seed.total_distributions,
            },
            source: "bulk_portfolio_metrics",
          },
        };
      });

      const { error } = await supabase
        .from("fund_financial_statements")
        .upsert(upserts, { onConflict: "fund_id,quarter_date" });
      if (error) throw error;

      toast({ title: "All funds confirmed", description: `All ${funds.length} funds marked as uploaded for ${formatQuarterLabel(activeQuarter)} from portfolio metrics data.` });
      queryClient.invalidateQueries({ queryKey: ["fund-fs-status", activeQuarter] });
      queryClient.invalidateQueries({ queryKey: ["all-fund-fs"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkConfirming(false);
    }
  };

  // Count statuses — check confirmed OR filePath
  const confirmedCount = funds.filter((f: any) => fsStatusMap[f.id]?.confirmed).length;
  const uploadedCount = funds.filter((f: any) => fsStatusMap[f.id]?.filePath && !fsStatusMap[f.id]?.confirmed).length;
  const pendingCount = funds.length - confirmedCount - uploadedCount;

  const is3Q25 = activeQuarter === "2025-09-30";
  const allConfirmed = confirmedCount === funds.length && funds.length > 0;

  const formatNum = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Add Reports</h1>
              <p className="text-xs text-muted-foreground">Upload quarterly fund reports</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8 space-y-6">
        {/* Quarter selector + summary */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Quarter</label>
            <Select value={activeQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarterOptions.map((q) => (
                  <SelectItem key={q} value={q}>{formatQuarterLabel(q)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--positive))]" />
              <span>{confirmedCount + uploadedCount} uploaded</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>{pendingCount} pending</span>
            </div>
          </div>
        </div>

        {/* Bulk confirm button for 3Q25 */}
        {is3Q25 && !allConfirmed && (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">3Q25 data available from Portfolio Metrics file</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                All fund data for this quarter has been seeded from the portfolio metrics Excel. Confirm all at once to mark them as uploaded.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-2 shrink-0"
              onClick={handleBulkConfirm}
              disabled={bulkConfirming}
            >
              <Zap className="h-3.5 w-3.5" />
              {bulkConfirming ? "Confirming…" : "Mark all 3Q25 as confirmed"}
            </Button>
          </div>
        )}

        {allConfirmed && (
          <div className="border border-[hsl(var(--positive))]/30 bg-[hsl(var(--positive))]/5 rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-foreground">✓ All {funds.length} funds confirmed for {formatQuarterLabel(activeQuarter)}</p>
            <p className="text-xs text-muted-foreground mt-1">You can now generate metrics from the Funds tab.</p>
          </div>
        )}

        {/* Fund list */}
        <div className="space-y-2">
          {funds.length === 0 && (
            <p className="text-sm text-muted-foreground">No funds found. Add funds first.</p>
          )}
          {funds.map((f: any) => {
            const file = uploadedFiles[f.id];
            const isUploading = uploadingFundId === f.id;
            const status = fsStatusMap[f.id];
            const isConfirmed = !!status?.confirmed;
            const hasFile = !!status?.filePath;

            return (
              <div key={f.id} className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
                <div className="flex-shrink-0">
                  {isConfirmed ? (
                    <CheckCircle2 className="h-5 w-5 text-[hsl(var(--positive))]" />
                  ) : hasFile ? (
                    <FileText className="h-5 w-5 text-primary" />
                  ) : (
                    <Clock className="h-5 w-5 text-primary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{f.fund_name}</p>
                    <Badge
                      variant={isConfirmed ? "default" : "secondary"}
                      className={
                        isConfirmed
                          ? "bg-[hsl(var(--positive))]/10 text-[hsl(var(--positive))] border-[hsl(var(--positive))]/20 hover:bg-[hsl(var(--positive))]/10"
                          : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/10"
                      }
                    >
                      {isConfirmed ? "Done" : "Pending"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f.vintage_year ? `Vintage ${f.vintage_year}` : ""}{f.strategy ? ` · ${f.strategy}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {file ? (
                    <>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{file.name}</span>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleFileSelect(f.id, null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="gap-1.5 h-7" onClick={() => handleUpload(f.id)} disabled={isUploading}>
                        {isUploading ? <span className="text-xs">Uploading…</span> : <><Check className="h-3 w-3" /><span className="text-xs">Upload</span></>}
                      </Button>
                    </>
                  ) : (
                    <>
                      <label className="cursor-pointer">
                        <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx" onChange={(e) => handleFileSelect(f.id, e.target.files?.[0] || null)} />
                        <div className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors border border-dashed border-primary/30 rounded-md px-3 py-1.5">
                          <Upload className="h-3.5 w-3.5" />
                          Desktop
                        </div>
                      </label>
                      <button onClick={handleConnectDrive} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-md px-3 py-1.5">
                        <HardDrive className="h-3.5 w-3.5" />
                        Drive
                      </button>
                      <button onClick={() => openManualEntry(f)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-md px-3 py-1.5">
                        <PenLine className="h-3.5 w-3.5" />
                        Manual
                      </button>
                      <button onClick={() => { setEmailFund(f); setEmailText(""); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-md px-3 py-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Manual Entry Dialog */}
      <Dialog open={!!manualFund} onOpenChange={(open) => { if (!open) { setManualFund(null); setManualForm(null); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base">Enter Fund Data — {manualFund?.fund_name}</DialogTitle>
            <p className="text-xs text-muted-foreground">{formatQuarterLabel(activeQuarter)} · Manual entry</p>
          </DialogHeader>
          {manualForm && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">Report Date</Label>
                <Input
                  value={manualForm.report_date}
                  onChange={(e) => setManualForm({ ...manualForm, report_date: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
              {([
                ["total_commitment", "Total Fund Commitment"],
                ["total_contributions_called", "Total Contributions Called"],
                ["total_investment_cost", "Total Investment Cost"],
                ["total_portfolio_fmv", "Total Portfolio FMV"],
                ["fund_nav", "Fund NAV"],
                ["total_distributions", "Total Distributions"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="text"
                      value={formatNum(manualForm[key])}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.-]/g, "");
                        setManualForm({ ...manualForm, [key]: Number(raw) || 0 });
                      }}
                      className="font-mono text-sm pl-7"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setManualFund(null); setManualForm(null); }}>Cancel</Button>
            <Button size="sm" onClick={saveManualEntry} disabled={savingManual} className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {savingManual ? "Saving…" : "Confirm & Mark Uploaded"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddQuarterlyData;
