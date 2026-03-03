import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useFunds, useDirectInvestments, useFundReports, useDirectValuations, usePortfolioSnapshot, useSaveQuarterlyData } from "@/hooks/usePortfolioData";
import { useToast } from "@/hooks/use-toast";

const AddQuarterlyData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: funds = [] } = useFunds();
  const { data: directs = [] } = useDirectInvestments();
  const saveMutation = useSaveQuarterlyData();

  const [quarterDate, setQuarterDate] = useState("2025-09-30");
  const [fundInputs, setFundInputs] = useState<Record<string, { called: string; dist: string; nav: string }>>({});
  const [directInputs, setDirectInputs] = useState<Record<string, { valuation: string; proceeds: string }>>({});
  const [lpNav, setLpNav] = useState("");

  // Pre-fill from existing data
  const { data: existingFundReports = [] } = useFundReports(quarterDate);
  const { data: existingDirectVals = [] } = useDirectValuations(quarterDate);
  const { data: existingSnapshot } = usePortfolioSnapshot(quarterDate);

  useEffect(() => {
    const fi: Record<string, { called: string; dist: string; nav: string }> = {};
    funds.forEach((f: any) => {
      const existing = existingFundReports.find((r: any) => r.fund_id === f.id || r.fund?.id === f.id);
      fi[f.id] = {
        called: existing ? String(existing.capital_called_to_date) : "",
        dist: existing ? String(existing.distributions_to_date) : "",
        nav: existing ? String(existing.reported_nav) : "",
      };
    });
    setFundInputs(fi);
  }, [funds, existingFundReports]);

  useEffect(() => {
    const di: Record<string, { valuation: string; proceeds: string }> = {};
    directs.forEach((d: any) => {
      const existing = existingDirectVals.find((v: any) => v.company_id === d.id || v.company?.id === d.id);
      di[d.id] = {
        valuation: existing ? String(existing.current_valuation) : "",
        proceeds: existing ? String(existing.realized_proceeds_this_quarter) : "",
      };
    });
    setDirectInputs(di);
  }, [directs, existingDirectVals]);

  useEffect(() => {
    if (existingSnapshot?.lp_nav) setLpNav(String(existingSnapshot.lp_nav));
  }, [existingSnapshot]);

  const handleSave = async () => {
    const fundReports = Object.entries(fundInputs)
      .filter(([, v]) => v.nav || v.called)
      .map(([fund_id, v]) => ({
        fund_id,
        capital_called_to_date: Number(v.called) || 0,
        distributions_to_date: Number(v.dist) || 0,
        reported_nav: Number(v.nav) || 0,
      }));

    const directValuations = Object.entries(directInputs)
      .filter(([, v]) => v.valuation)
      .map(([company_id, v]) => ({
        company_id,
        current_valuation: Number(v.valuation) || 0,
        realized_proceeds_this_quarter: Number(v.proceeds) || 0,
      }));

    try {
      await saveMutation.mutateAsync({
        quarterDate,
        fundReports,
        directValuations,
        lpNav: lpNav ? Number(lpNav) : undefined,
      });
      toast({ title: "Saved", description: `Quarterly data for ${quarterDate} saved successfully.` });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const updateFund = (id: string, field: string, value: string) => {
    setFundInputs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const updateDirect = (id: string, field: string, value: string) => {
    setDirectInputs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
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
              <h1 className="text-lg font-semibold text-foreground">Add Quarterly Data</h1>
              <p className="text-xs text-muted-foreground">Enter fund reports and direct valuations</p>
            </div>
          </div>
          <Button size="sm" className="gap-2" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8 space-y-8">
        {/* Quarter Date */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Quarter End Date</label>
          <Input type="date" value={quarterDate} onChange={(e) => setQuarterDate(e.target.value)} className="w-[200px]" />
        </div>

        {/* LP NAV */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">LP NAV (Net NAV)</label>
          <Input type="number" placeholder="LP NAV" value={lpNav} onChange={(e) => setLpNav(e.target.value)} className="w-[300px]" />
        </div>

        {/* Fund Reports */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Fund Reports</h2>
          <div className="space-y-3">
            {funds.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <span className="text-sm font-medium text-foreground w-[280px] truncate">{f.fund_name}</span>
                <Input type="number" placeholder="Called to Date" value={fundInputs[f.id]?.called || ""} onChange={(e) => updateFund(f.id, "called", e.target.value)} className="w-[150px]" />
                <Input type="number" placeholder="Distributions" value={fundInputs[f.id]?.dist || ""} onChange={(e) => updateFund(f.id, "dist", e.target.value)} className="w-[150px]" />
                <Input type="number" placeholder="NAV" value={fundInputs[f.id]?.nav || ""} onChange={(e) => updateFund(f.id, "nav", e.target.value)} className="w-[150px]" />
              </div>
            ))}
          </div>
        </div>

        {/* Direct Valuations */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Direct Investment Valuations</h2>
          <div className="space-y-3">
            {directs.map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <span className="text-sm font-medium text-foreground w-[280px] truncate">{d.company_name}</span>
                <Input type="number" placeholder="Current Valuation" value={directInputs[d.id]?.valuation || ""} onChange={(e) => updateDirect(d.id, "valuation", e.target.value)} className="w-[180px]" />
                <Input type="number" placeholder="Proceeds" value={directInputs[d.id]?.proceeds || ""} onChange={(e) => updateDirect(d.id, "proceeds", e.target.value)} className="w-[180px]" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Quarterly Data
          </Button>
        </div>
      </main>
    </div>
  );
};

export default AddQuarterlyData;
