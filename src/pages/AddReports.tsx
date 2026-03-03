import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, X, CheckCircle2, Loader2 } from "lucide-react";
import { useQuarters, useCreateNextQuarter, useFundReportStatuses, useUpdateReportStatus, getNextQuarterLabel, FUND_NAMES } from "@/hooks/useQuarters";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface StagedFile {
  file: File;
  fundName: string;
}

const AddReports = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: quarters = [], isLoading } = useQuarters();

  // Determine the next quarter
  const currentQuarter = quarters.find((q) => q.is_current) || quarters[0];
  const nextQuarterLabel = currentQuarter ? getNextQuarterLabel(currentQuarter.label) : "Q4 2025";
  const existingNextQuarter = quarters.find((q) => q.label === nextQuarterLabel);

  // If the next quarter already exists, use its statuses
  const { data: existingStatuses = [] } = useFundReportStatuses(existingNextQuarter?.id);

  const [stagedFiles, setStagedFiles] = useState<Record<string, StagedFile>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createQuarter = useCreateNextQuarter();
  const updateStatus = useUpdateReportStatus();

  const handleFileSelect = useCallback((fundName: string, file: File | null) => {
    if (!file) {
      setStagedFiles((prev) => {
        const next = { ...prev };
        delete next[fundName];
        return next;
      });
      return;
    }
    setStagedFiles((prev) => ({
      ...prev,
      [fundName]: { file, fundName },
    }));
  }, []);

  const handleUpdate = async () => {
    const filesToUpload = Object.values(stagedFiles);
    if (filesToUpload.length === 0) {
      toast({ title: "No files selected", description: "Please select at least one report to upload.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let quarterId = existingNextQuarter?.id;

      // Create the quarter if it doesn't exist
      if (!quarterId && currentQuarter) {
        const newQuarter = await createQuarter.mutateAsync({
          label: nextQuarterLabel,
          sortOrder: currentQuarter.sort_order + 1,
          funds: FUND_NAMES,
        });
        quarterId = newQuarter.id;
      }

      if (!quarterId) throw new Error("Could not determine quarter ID");

      // Upload each file to storage and mark as uploaded
      for (const { file, fundName } of filesToUpload) {
        const filePath = `${quarterId}/${fundName.replace(/[^a-zA-Z0-9]/g, "_")}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("fund-reports")
          .upload(filePath, file, { upsert: true });

        if (uploadError) {
          console.error(`Upload error for ${fundName}:`, uploadError);
          throw uploadError;
        }

        // Find the status record and mark uploaded
        // Re-fetch statuses since quarter may have just been created
        const { data: statuses } = await supabase
          .from("fund_report_statuses")
          .select("*")
          .eq("quarter_id", quarterId)
          .eq("fund_name", fundName);

        if (statuses && statuses.length > 0) {
          await supabase
            .from("fund_report_statuses")
            .update({ status: "uploaded", uploaded_at: new Date().toISOString() })
            .eq("id", statuses[0].id);
        }
      }

      toast({ title: "Reports uploaded", description: `${filesToUpload.length} report(s) uploaded for ${nextQuarterLabel}.` });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "An error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const stagedCount = Object.keys(stagedFiles).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Add Reports — {nextQuarterLabel}</h1>
              <p className="text-xs text-muted-foreground">Upload fund reports for the new quarter</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">
              {stagedCount}/{FUND_NAMES.length} selected
            </span>
            <Button
              onClick={handleUpdate}
              disabled={isSubmitting || stagedCount === 0}
              className="gap-2"
              size="sm"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Update
            </Button>
          </div>
        </div>
      </header>

      {/* Fund upload list */}
      <main className="max-w-[800px] mx-auto px-6 py-8">
        <div className="space-y-3">
          {FUND_NAMES.map((fundName) => {
            const staged = stagedFiles[fundName];
            const alreadyUploaded = existingStatuses.find((s) => s.fund_name === fundName && s.status === "uploaded");

            return (
              <div
                key={fundName}
                className={cn(
                  "flex items-center justify-between p-4 rounded-lg border transition-colors",
                  staged
                    ? "border-primary/40 bg-primary/5"
                    : alreadyUploaded
                    ? "border-border bg-card opacity-60"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {staged ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  ) : alreadyUploaded ? (
                    <CheckCircle2 className="h-4 w-4 text-positive shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{fundName}</p>
                    {staged && (
                      <p className="text-xs text-muted-foreground truncate">{staged.file.name}</p>
                    )}
                    {alreadyUploaded && !staged && (
                      <p className="text-xs text-positive">Already uploaded</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {staged && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleFileSelect(fundName, null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".xlsx,.xls,.csv,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleFileSelect(fundName, file);
                        e.target.value = "";
                      }}
                    />
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors cursor-pointer",
                      staged
                        ? "border-primary/30 text-primary hover:bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                    )}>
                      <Upload className="h-3 w-3" />
                      {staged ? "Replace" : "Choose File"}
                    </span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground">
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isSubmitting || stagedCount === 0}
            className="gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload {stagedCount} Report{stagedCount !== 1 ? "s" : ""} & Update
          </Button>
        </div>
      </main>
    </div>
  );
};

export default AddReports;
