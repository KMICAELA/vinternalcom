import { fundSummary } from "@/data/portfolioData";

const DashboardHeader = () => {
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
            <p className="text-xs text-muted-foreground">Portfolio Metrics · {fundSummary.quarter}</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 text-xs text-muted-foreground">
          <span>Report Date: {fundSummary.reportDate}</span>
          <span>Ownership: {fundSummary.ownership}</span>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
