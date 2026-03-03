import { AlertTriangle } from "lucide-react";
import { FundReportStatus } from "@/hooks/useQuarters";

interface IncompleteDataWarningProps {
  statuses: FundReportStatus[];
  quarterLabel: string;
}

const IncompleteDataWarning = ({ statuses, quarterLabel }: IncompleteDataWarningProps) => {
  const pending = statuses.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-warning">Incomplete data for {quarterLabel}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Missing reports: {pending.map((p) => p.fund_name).join(", ")}
        </p>
      </div>
    </div>
  );
};

export default IncompleteDataWarning;
