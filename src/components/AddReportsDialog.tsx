import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FundReportStatus, useUpdateReportStatus, useCreateNextQuarter, getNextQuarterLabel, FUND_NAMES } from "@/hooks/useQuarters";
import { cn } from "@/lib/utils";
import { Plus, CheckCircle2, Clock, Upload } from "lucide-react";

interface AddReportsDialogProps {
  statuses: FundReportStatus[];
  currentQuarterLabel: string;
  currentQuarterSortOrder: number;
  quarters: { id: string; label: string }[];
}

const AddReportsDialog = ({ statuses, currentQuarterLabel, currentQuarterSortOrder, quarters }: AddReportsDialogProps) => {
  const [open, setOpen] = useState(false);
  const updateStatus = useUpdateReportStatus();
  const createQuarter = useCreateNextQuarter();

  const nextQuarterLabel = getNextQuarterLabel(currentQuarterLabel);
  const nextQuarterExists = quarters.some((q) => q.label === nextQuarterLabel);

  const handleToggleStatus = (report: FundReportStatus) => {
    const newStatus = report.status === "pending" ? "uploaded" : "pending";
    updateStatus.mutate({ id: report.id, status: newStatus });
  };

  const handleCreateNextQuarter = () => {
    createQuarter.mutate({
      label: nextQuarterLabel,
      sortOrder: currentQuarterSortOrder + 1,
      funds: FUND_NAMES,
    });
  };

  const uploadedCount = statuses.filter((s) => s.status === "uploaded").length;
  const totalCount = statuses.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border text-foreground hover:border-primary/50">
          <Upload className="h-3.5 w-3.5" />
          Add Reports
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Report Upload Status — {currentQuarterLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Progress */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className={cn("font-mono font-medium", uploadedCount === totalCount ? "text-positive" : "text-warning")}>
              {uploadedCount}/{totalCount} funds uploaded
            </span>
          </div>

          {/* Fund list */}
          <div className="space-y-2">
            {statuses.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {report.status === "uploaded" ? (
                    <CheckCircle2 className="h-4 w-4 text-positive" />
                  ) : (
                    <Clock className="h-4 w-4 text-warning" />
                  )}
                  <span className="text-sm font-medium text-foreground">{report.fund_name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleStatus(report)}
                  disabled={updateStatus.isPending}
                  className={cn(
                    "text-xs h-7 px-2",
                    report.status === "uploaded"
                      ? "text-positive hover:text-negative"
                      : "text-muted-foreground hover:text-positive"
                  )}
                >
                  {report.status === "uploaded" ? "Uploaded ✓" : "Mark Uploaded"}
                </Button>
              </div>
            ))}
          </div>

          {/* Create next quarter */}
          {!nextQuarterExists && (
            <div className="pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50"
                onClick={handleCreateNextQuarter}
                disabled={createQuarter.isPending}
              >
                <Plus className="h-3.5 w-3.5" />
                Create {nextQuarterLabel} Quarter
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddReportsDialog;
