import DashboardHeader from "@/components/DashboardHeader";
import MetricCard from "@/components/MetricCard";
import SectionHeader from "@/components/SectionHeader";
import FundsTable from "@/components/FundsTable";
import DirectsTable from "@/components/DirectsTable";
import ReturnsChart from "@/components/ReturnsChart";
import FundAllocationChart from "@/components/FundAllocationChart";
import TopHoldingsTable from "@/components/TopHoldingsTable";
import { fundSummary, formatCurrency } from "@/data/portfolioData";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-8">
        {/* Key Metrics */}
        <section>
          <SectionHeader title="Portfolio Overview" subtitle="Net performance metrics at fund level" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="Net Asset Value"
              value={formatCurrency(fundSummary.nav, true)}
              size="lg"
              variant="neutral"
            />
            <MetricCard
              label="Net TVPI"
              value={fundSummary.netTVPI}
              variant="negative"
              size="lg"
            />
            <MetricCard
              label="Net IRR"
              value={fundSummary.netIRR}
              variant="negative"
              size="lg"
            />
            <MetricCard
              label="Gross NAV"
              value={formatCurrency(fundSummary.grossNAV, true)}
              variant="neutral"
              size="lg"
            />
            <MetricCard
              label="Gross TVPI"
              value={fundSummary.grossTVPI}
              variant="positive"
              size="lg"
            />
            <MetricCard
              label="Gross IRR"
              value={fundSummary.grossIRR}
              variant="positive"
              size="lg"
            />
          </div>
        </section>

        {/* Charts Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReturnsChart />
          <FundAllocationChart />
        </section>

        {/* Fund Portfolio */}
        <section>
          <SectionHeader title="Fund Investments" subtitle="Performance summary across all fund commitments" />
          <FundsTable />
        </section>

        {/* Direct Investments */}
        <section>
          <SectionHeader title="Direct Investments" subtitle="Co-investments and direct deals" />
          <DirectsTable />
        </section>

        {/* Top Underlying Holdings */}
        <section>
          <SectionHeader title="Top Underlying Holdings" subtitle="Highest-performing companies across fund portfolios" />
          <TopHoldingsTable />
        </section>

        {/* Footer */}
        <footer className="border-t border-border pt-4 pb-8">
          <p className="text-xs text-muted-foreground text-center">
            TWH Americas Fund I, LP · Portfolio Metrics · {fundSummary.quarter} · Confidential
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
