import DashboardHeader from "@/components/DashboardHeader";
import SummaryTab from "@/components/SummaryTab";
import UnderlyingPortfolioTab from "@/components/UnderlyingPortfolioTab";
import PortfolioCommentsTab from "@/components/PortfolioCommentsTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fundSummary } from "@/data/portfolioData";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="bg-surface-1 border border-border">
            <TabsTrigger value="summary" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Summary
            </TabsTrigger>
            <TabsTrigger value="underlying" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Underlying Portfolio
            </TabsTrigger>
            <TabsTrigger value="comments" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Portfolio Comments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <SummaryTab />
          </TabsContent>
          <TabsContent value="underlying">
            <UnderlyingPortfolioTab />
          </TabsContent>
          <TabsContent value="comments">
            <PortfolioCommentsTab />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="border-t border-border pt-4 pb-8 mt-8">
          <p className="text-xs text-muted-foreground text-center">
            {fundSummary.name} · Portfolio Metrics · {fundSummary.quarter} · Confidential
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
