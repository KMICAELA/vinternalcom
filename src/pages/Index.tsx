import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import PortfolioMetrics from "@/components/PortfolioMetrics";
import FundsTable from "@/components/FundsTable";
import DirectsTable from "@/components/DirectsTable";
import UnderlyingPortfolioTable from "@/components/UnderlyingPortfolioTable";
import InventoryTable from "@/components/InventoryTable";
import CashflowsTable from "@/components/CashflowsTable";
import ChatWidget from "@/components/ChatWidget";
import { useAvailableQuarters, useFunds, useFundReports, useDirectValuations, useLPCashflows, usePortfolioSnapshot, useUnderlyingPortfolio, useUnderlyingTransactions } from "@/hooks/usePortfolioData";
import { computeMetrics } from "@/lib/calcEngine";

const formatQuarterLabel = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth();
  const year = d.getFullYear();
  const q = month < 3 ? "Q1" : month < 6 ? "Q2" : month < 9 ? "Q3" : "Q4";
  return `${q} ${year}`;
};

const Index = () => {
  const navigate = useNavigate();
  const { data: quarters = [], isLoading: qLoading } = useAvailableQuarters();
  const { data: funds = [] } = useFunds();
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");

  useEffect(() => {
    if (quarters.length > 0 && !selectedQuarter) setSelectedQuarter(quarters[0]);
  }, [quarters, selectedQuarter]);

  const { data: fundReports = [] } = useFundReports(selectedQuarter);
  const { data: directValuations = [] } = useDirectValuations(selectedQuarter);
  const { data: lpCashflows = [] } = useLPCashflows(selectedQuarter);
  const { data: snapshot } = usePortfolioSnapshot(selectedQuarter);
  const { data: underlyingPortfolio = [] } = useUnderlyingPortfolio(selectedQuarter);
  const { data: underlyingTransactions = [] } = useUnderlyingTransactions(selectedQuarter);

  const directCosts = directValuations.map((dv: any) => Number(dv.company?.cost_basis || 0));
  const totalCommitment = funds.reduce((s: number, f: any) => s + Number(f.commitment_amount), 0);

  const metrics = computeMetrics({
    fundReports,
    directValuations,
    directCosts,
    lpCashflows,
    lpNav: snapshot?.lp_nav ? Number(snapshot.lp_nav) : 0,
    totalCommitment,
  });

  if (qLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">1200VC</h1>
            <p className="text-xs text-muted-foreground">Portfolio Performance Engine</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-[140px] h-8 text-sm border-border">
                <SelectValue placeholder="Quarter" />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>{formatQuarterLabel(q)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-2 border-border" onClick={() => navigate("/add-quarterly-data")}>
              <Plus className="h-3.5 w-3.5" />
              Add Reports
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <PortfolioMetrics metrics={metrics} />

        <Tabs defaultValue="funds" className="space-y-4">
          <TabsList className="bg-surface-1 border border-border">
            <TabsTrigger value="funds" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Funds ({fundReports.length})
            </TabsTrigger>
            <TabsTrigger value="directs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Directs ({directValuations.length})
            </TabsTrigger>
            <TabsTrigger value="cashflows" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              LP Cashflows ({lpCashflows.length})
            </TabsTrigger>
            <TabsTrigger value="underlying" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Underlying Portfolio ({underlyingPortfolio.length})
            </TabsTrigger>
            <TabsTrigger value="inventory" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Inventory ({underlyingTransactions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="funds">
            <FundsTable data={fundReports} />
          </TabsContent>
          <TabsContent value="directs">
            <DirectsTable data={directValuations} />
          </TabsContent>
          <TabsContent value="cashflows">
            <CashflowsTable data={lpCashflows} />
          </TabsContent>
          <TabsContent value="underlying">
            <InventoryTable data={underlyingPortfolio} quarterDate={selectedQuarter} />
          </TabsContent>
          <TabsContent value="inventory">
            <UnderlyingPortfolioTable data={underlyingTransactions} />
          </TabsContent>
        </Tabs>

        <footer className="border-t border-border pt-4 pb-8 mt-8">
          <p className="text-xs text-muted-foreground text-center">
            1200VC · TWH Americas Fund I, LP · {selectedQuarter ? formatQuarterLabel(selectedQuarter) : ""} · Confidential
          </p>
        </footer>
      </main>
      <ChatWidget />
    </div>
  );
};

export default Index;
