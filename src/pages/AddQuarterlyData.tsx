import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, HardDrive, FileText, Check, X, CheckCircle2, Clock } from "lucide-react";
import { useFunds, useAvailableQuarters } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

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

/** Given the latest confirmed quarter date, return the next quarter date */
function getNextQuarter(latestConfirmedDate: string | null): string {
  if (!latestConfirmedDate) return "2025-03-31";
  const d = new Date(latestConfirmedDate + "T00:00:00");
  d.setMonth(d.getMonth() + 3);
  // snap to quarter-end
  const m = d.getMonth();
  if (m < 3) d.setMonth(2, 31);
  else if (m < 6) d.setMonth(5, 30);
  else if (m < 9) d.setMonth(8, 30);
  else d.setMonth(11, 31);
  return d.toISOString().slice(0, 10);
}

const AddQuarterlyData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: funds = [] } = useFunds();
  const { data: availableQuarters = [] } = useAvailableQuarters();
  
  const queryClient = useQueryClient();
  
  // Auto-detect next quarter based on latest confirmed data
  const defaultQuarter = useMemo(() => {
    if (availableQuarters.length > 0) {
      return getNextQuarter(availableQuarters[0]);
    }
    return "2025-09-30";
  }, [availableQuarters]);

  // Only show quarters up to and including the next reportable quarter
  const quarterOptions = useMemo(() => {
    return ALL_QUARTERS.filter((q) => q <= defaultQuarter);
  }, [defaultQuarter]);

  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const activeQuarter = selectedQuarter || defaultQuarter;

  // Fetch existing financial statements for this quarter to know upload status
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

      // Upsert a record in fund_financial_statements so status updates
      const { error: dbError } = await supabase
        .from("fund_financial_statements")
        .upsert(
          { fund_id: fundId, quarter_date: activeQuarter, file_path: filePath, confirmed: false },
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
    toast({
      title: "Google Drive",
      description: "Google Drive integration is not yet configured. Please contact your administrator.",
    });
  };

  // Count statuses
  const uploadedCount = funds.filter((f: any) => fsStatusMap[f.id]?.filePath).length;
  const pendingCount = funds.length - uploadedCount;

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
          <div />
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
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>{uploadedCount} uploaded</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span>{pendingCount} pending</span>
            </div>
          </div>
        </div>

        {/* Fund list */}
        <div className="space-y-2">
          {funds.length === 0 && (
            <p className="text-sm text-muted-foreground">No funds found. Add funds first.</p>
          )}
          {funds.map((f: any) => {
            const file = uploadedFiles[f.id];
            const isUploading = uploadingFundId === f.id;
            const status = fsStatusMap[f.id];
            const hasReport = !!status?.filePath;

            return (
              <div key={f.id} className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
                {/* Status indicator */}
                <div className="flex-shrink-0">
                  {hasReport ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Clock className="h-5 w-5 text-amber-500" />
                  )}
                </div>

                {/* Fund info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{f.fund_name}</p>
                    <Badge
                      variant={hasReport ? "default" : "secondary"}
                      className={hasReport
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10"
                        : "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/10"
                      }
                    >
                      {hasReport ? "Uploaded" : "Pending"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f.vintage_year ? `Vintage ${f.vintage_year}` : ""}{f.strategy ? ` · ${f.strategy}` : ""}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {file ? (
                    <>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{file.name}</span>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleFileSelect(f.id, null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="gap-1.5 h-7" onClick={() => handleUpload(f.id)} disabled={isUploading}>
                        {isUploading ? (
                          <span className="text-xs">Uploading…</span>
                        ) : (
                          <>
                            <Check className="h-3 w-3" />
                            <span className="text-xs">Upload</span>
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.xlsx,.xls,.csv"
                          onChange={(e) => handleFileSelect(f.id, e.target.files?.[0] || null)}
                        />
                        <div className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors border border-dashed border-primary/30 rounded-md px-3 py-1.5">
                          <Upload className="h-3.5 w-3.5" />
                          Desktop
                        </div>
                      </label>
                      <button
                        onClick={handleConnectDrive}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-md px-3 py-1.5"
                      >
                        <HardDrive className="h-3.5 w-3.5" />
                        Drive
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default AddQuarterlyData;
