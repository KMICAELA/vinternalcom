import { fundSummary } from "@/data/portfolioData";
import { TrendingUp, Calendar, Briefcase } from "lucide-react";

const DashboardHeader = () => {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-[1400px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{fundSummary.name}</h1>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {fundSummary.quarter} · {fundSummary.reportDate}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  {fundSummary.ownership} ownership
                </span>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Portfolio Metrics Report
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
