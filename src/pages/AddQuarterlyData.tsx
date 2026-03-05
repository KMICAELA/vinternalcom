import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, HardDrive, FileText, Check, X } from "lucide-react";
import { useFunds, useAvailableQuarters } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const quarterOptions = [
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

const AddQuarterlyData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: funds = [] } = useFunds();
  const [selectedQuarter, setSelectedQuarter] = useState("2025-09-30");
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
      const filePath = `${selectedQuarter}/${fundId}/${file.name}`;
      const { error } = await supabase.storage
        .from("fund-reports")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      toast({ title: "Uploaded", description: `Report for ${funds.find((f: any) => f.id === fundId)?.fund_name} uploaded.` });
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
          <Button size="sm" variant="outline" className="gap-2" onClick={handleConnectDrive}>
            <HardDrive className="h-3.5 w-3.5" />
            Connect Drive
          </Button>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8 space-y-6">
        {/* Quarter selector */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Quarter</label>
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
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

        {/* Fund list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Fund Reports</h2>
          {funds.length === 0 && (
            <p className="text-sm text-muted-foreground">No funds found. Add funds first.</p>
          )}
          {funds.map((f: any) => {
            const file = uploadedFiles[f.id];
            const isUploading = uploadingFundId === f.id;
            return (
              <div key={f.id} className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.fund_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.vintage_year ? `Vintage ${f.vintage_year}` : ""}{f.strategy ? ` · ${f.strategy}` : ""}
                  </p>
                </div>

                {file ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">{file.name}</span>
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
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.xlsx,.xls,.csv"
                      onChange={(e) => handleFileSelect(f.id, e.target.files?.[0] || null)}
                    />
                    <div className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors border border-dashed border-primary/30 rounded-md px-3 py-1.5">
                      <Upload className="h-3.5 w-3.5" />
                      Choose file
                    </div>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default AddQuarterlyData;
