import { fundSummary } from "@/data/portfolioData";
import QuarterSelector from "@/components/QuarterSelector";
import AddReportsDialog from "@/components/AddReportsDialog";
import { Quarter, FundReportStatus } from "@/hooks/useQuarters";

interface DashboardHeaderProps {
  quarters: Quarter[];
  selectedQuarterId: string;
  onSelectQuarter: (id: string) => void;
  reportStatuses: FundReportStatus[];
  selectedQuarterLabel: string;
  selectedQuarterSortOrder: number;
}

const DashboardHeader = ({
  quarters,
  selectedQuarterId,
  onSelectQuarter,
  reportStatuses,
  selectedQuarterLabel,
  selectedQuarterSortOrder,
}: DashboardHeaderProps) => {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-foreground">1200</span>
            <span className="text-primary font-bold">vc</span>
          </h1>
          <div className="h-5 w-px bg-border" />
          <div>
            <p className="text-sm font-medium text-foreground">{fundSummary.name}</p>
            <p className="text-xs text-muted-foreground">Portfolio Metrics · {selectedQuarterLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-6 text-xs text-muted-foreground mr-4">
            <span>Report Date: {fundSummary.reportDate}</span>
            <span>Ownership: {fundSummary.ownership}</span>
          </div>
          <QuarterSelector
            quarters={quarters}
            selectedId={selectedQuarterId}
            onSelect={onSelectQuarter}
          />
          <AddReportsDialog
            statuses={reportStatuses}
            currentQuarterLabel={selectedQuarterLabel}
            currentQuarterSortOrder={selectedQuarterSortOrder}
            quarters={quarters}
          />
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
