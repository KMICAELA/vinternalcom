import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/DashboardHeader";
import SummaryTab from "@/components/SummaryTab";
import UnderlyingPortfolioTab from "@/components/UnderlyingPortfolioTab";
import PortfolioCommentsTab from "@/components/PortfolioCommentsTab";
import IncompleteDataWarning from "@/components/IncompleteDataWarning";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fundSummary } from "@/data/portfolioData";
import { useQuarters, useFundReportStatuses } from "@/hooks/useQuarters";
import ChatWidget from "@/components/ChatWidget";

const Index = () => {
  const { data: quarters = [], isLoading } = useQuarters();
  const [selectedQuarterId, setSelectedQuarterId] = useState<string>("");

  // Auto-select the latest quarter with complete data on load
  const [quarterStatuses, setQuarterStatuses] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    if (quarters.length === 0 || selectedQuarterId) return;
    
    // Fetch statuses for all quarters to find the latest complete one
    const fetchAllStatuses = async () => {
      const statusMap: Record<string, boolean> = {};
      for (const q of quarters) {
        const { data } = await supabase
          .from("fund_report_statuses")
          .select("status")
          .eq("quarter_id", q.id);
        const allUploaded = data ? data.length > 0 && data.every((s) => s.status === "uploaded") : false;
        statusMap[q.id] = allUploaded;
      }
      setQuarterStatuses(statusMap);
      
      // quarters are already sorted by sort_order desc, so first complete one is latest
      const latestComplete = quarters.find((q) => statusMap[q.id]);
      setSelectedQuarterId(latestComplete?.id || quarters[0].id);
    };
    
    fetchAllStatuses();
  }, [quarters, selectedQuarterId]);

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);
  const { data: reportStatuses = [] } = useFundReportStatuses(selectedQuarterId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        quarters={quarters}
        selectedQuarterId={selectedQuarterId}
        onSelectQuarter={setSelectedQuarterId}
        reportStatuses={reportStatuses}
        selectedQuarterLabel={selectedQuarter?.label || "Q3 2025"}
        selectedQuarterSortOrder={selectedQuarter?.sort_order || 3}
      />

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
            <div className="space-y-6">
              <IncompleteDataWarning statuses={reportStatuses} quarterLabel={selectedQuarter?.label || ""} />
              <SummaryTab />
            </div>
          </TabsContent>
          <TabsContent value="underlying">
            <div className="space-y-6">
              <IncompleteDataWarning statuses={reportStatuses} quarterLabel={selectedQuarter?.label || ""} />
              <UnderlyingPortfolioTab />
            </div>
          </TabsContent>
          <TabsContent value="comments">
            <div className="space-y-6">
              <IncompleteDataWarning statuses={reportStatuses} quarterLabel={selectedQuarter?.label || ""} />
              <PortfolioCommentsTab />
            </div>
          </TabsContent>
        </Tabs>

        <footer className="border-t border-border pt-4 pb-8 mt-8">
          <p className="text-xs text-muted-foreground text-center">
            {fundSummary.name} · Portfolio Metrics · {selectedQuarter?.label || fundSummary.quarter} · Confidential
          </p>
        </footer>
      </main>
      <ChatWidget />
    </div>
  );
};

export default Index;
