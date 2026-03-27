import { useState, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds, useFundCashflows, useFundFinancialStatement, useFundReports, useActiveQuarter } from "@/hooks/usePortfolioData";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { getQuarterData } from "@/data/quarterRegistry";
import { computeFundMetrics, formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Upload, Plus, Trash2, FileText, Loader2, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CASHFLOW_TYPES = [
  "Capital Call — Investment",
  "Capital Call — Mgmt. Fees",
  "Capital Call — Other",
  "Distribution",
];

export default function FundsPage() {
  const qc = useQueryClient();
  const { data: funds = [], isLoading } = useFunds();
  const activeQuarter = useActiveQuarter();
  const { defaultQuarter } = useQuarterContext();
  const qData = getQuarterData(activeQuarter.quarter);
  const cm = useConsolidatedMetrics();
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const [addReportsOpen, setAddReportsOpen] = useState(false);
  const [addFundOpen, setAddFundOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);

  // Fetch all FS for active quarter to compute completion
  const { data: allFsForQuarter = [] } = useQuery({
    queryKey: ["all-fund-fs-status", activeQuarter.date],
    queryFn: async () => {
      if (!activeQuarter.date) return [];
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("fund_id, confirmed, quarter_date")
        .eq("quarter_date", activeQuarter.date)
        .eq("confirmed", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  // Fetch latest FS per fund (any quarter) for "Last FS" label
  const { data: latestFsPerFund = [] } = useQuery({
    queryKey: ["latest-fs-per-fund"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_financial_statements")
        .select("fund_id, quarter_date, confirmed")
        .eq("confirmed", true)
        .order("quarter_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute Add Reports quarter options from the backend's default/current quarter
  const availableQuarters = useMemo(() => {
    const quarters: { label: string; date: string }[] = [];
    const makeQuarter = (d: Date) => {
      const qMonth = Math.floor(d.getMonth() / 3) * 3 + 2;
      d.setMonth(qMonth);
      d.setDate(new Date(d.getFullYear(), qMonth + 1, 0).getDate());
      const qNum = Math.floor(qMonth / 3) + 1;
      return { label: `Q${qNum} ${d.getFullYear()}`, date: d.toISOString().split("T")[0] };
    };

    for (let i = 2; i >= 1; i--) {
      const d = new Date(defaultQuarter.date);
      d.setMonth(d.getMonth() - 3 * i);
      quarters.push(makeQuarter(d));
    }

    quarters.push({ label: `Q${defaultQuarter.quarter[0]} ${defaultQuarter.date.slice(0, 4)}`, date: defaultQuarter.date });

    const nd = new Date(defaultQuarter.date);
    nd.setMonth(nd.getMonth() + 3);
    quarters.push(makeQuarter(nd));

    return quarters;
  }, [defaultQuarter.date, defaultQuarter.quarter]);

  // FS status per fund
  const fsStatusMap = useMemo(() => {
    const confirmedSet = new Set(allFsForQuarter.map((fs: any) => fs.fund_id));
    const latestMap = new Map<string, string>();
    for (const fs of latestFsPerFund as any[]) {
      if (!latestMap.has(fs.fund_id)) {
        latestMap.set(fs.fund_id, fs.quarter_date);
      }
    }
    return { confirmedSet, latestMap };
  }, [allFsForQuarter, latestFsPerFund]);

  const activeFunds = useMemo(() => {
    if (!qData) return [];
    return funds.filter((fund: any) => qData.activeFunds.includes(fund.fund_name));
  }, [funds, qData]);

  const uploadedCount = activeFunds.filter((f: any) => fsStatusMap.confirmedSet.has(f.id)).length;
  const totalActive = activeFunds.length;
  const allUploaded = uploadedCount === totalActive && totalActive > 0;
  const completionPct = totalActive > 0 ? (uploadedCount / totalActive) * 100 : 0;

  // Lock quarter handler
  const handleLockQuarter = async () => {
    const { error } = await supabase.from("quarterly_history").upsert(
      {
        quarter: activeQuarter.quarter,
        quarter_date: activeQuarter.date,
        locked: true,
        nav: cm.totalNav,
        contribution: cm.totalCapitalCalls,
        distribution: cm.totalDistributions,
        net_tvpi: cm.netTvpi,
        net_irr: cm.netIrr || 0,
        gross_tvpi: cm.grossTvpi,
        gross_irr: cm.grossIrr || 0,
      } as any,
      { onConflict: "quarter_date" }
    );
    if (error) { toast.error(error.message); return; }
    toast.success(`${activeQuarter.quarter} metrics locked and saved to historical record.`);
    setLockModalOpen(false);
    qc.invalidateQueries({ queryKey: ["quarterly-history"] });
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Funds</h1>
          <p className="text-sm text-muted-foreground">Fund registry & financial statement management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddFundOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add Fund
          </Button>
          <Button size="sm" onClick={() => setAddReportsOpen(true)} className="gap-2">
            <Upload className="h-3.5 w-3.5" /> Add Reports
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">{activeQuarter.quarter} Reports:</span>
            <span className="text-sm text-muted-foreground">{uploadedCount} / {totalActive} uploaded</span>
          </div>
          <Button
            size="sm"
            disabled={!allUploaded}
            onClick={() => setLockModalOpen(true)}
            className={cn(
              "gap-2 transition-colors",
              allUploaded
                ? "bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            Generate Metrics for {activeQuarter.quarter}
          </Button>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${completionPct}%`,
              backgroundColor: allUploaded ? "hsl(var(--gold))" : "hsl(var(--gold) / 0.6)",
            }}
          />
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-1">
              <TableHead className="w-8" />
              <TableHead>Fund Name</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead className="text-center">FS Status</TableHead>
              <TableHead className="text-right">TWH Commitment</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">TWH %</TableHead>
              <TableHead className="text-right">TWH NAV</TableHead>
              <TableHead className="text-right">TVPI</TableHead>
              <TableHead className="text-right">IRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeFunds.map((fund: any) => {
              const hasActiveQuarterFS = fsStatusMap.confirmedSet.has(fund.id);
              const registryNav = qData?.fundNAVs[fund.fund_name] ?? null;
              const registryTvpi = qData?.fundTVPIs[fund.fund_name] ?? null;

              return (
                <FundRow
                  key={fund.id}
                  fund={fund}
                  quarterDate={activeQuarter.date}
                  isExpanded={expandedFund === fund.id}
                  onToggle={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
                  fsStatus={hasActiveQuarterFS ? "uploaded" : "pending"}
                  fsLabel={hasActiveQuarterFS ? activeQuarter.quarter : "Pending"}
                  registryNav={registryNav}
                  registryTvpi={registryTvpi}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Add Fund Dialog */}
      {addFundOpen && (
        <AddFundDialog onClose={() => setAddFundOpen(false)} />
      )}

      {/* Add Reports Dialog */}
      {addReportsOpen && (
        <AddReportsDialog
          funds={funds}
          availableQuarters={availableQuarters}
          defaultQuarterDate={defaultQuarter.date}
          onClose={() => setAddReportsOpen(false)}
        />
      )}

      {/* Lock Quarter Confirmation Modal */}
      <Dialog open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Metrics for {activeQuarter.quarter}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will snapshot all current metrics (Net TVPI, Net IRR, Gross TVPI, Gross IRR, NAV, and contributions) into the historical record.
            The TVPI chart on TWH Consolidated will show this data point.
          </p>
          <p className="text-sm text-muted-foreground">
            After locking, you can advance to the next quarter in Settings.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleLockQuarter}
              className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90 gap-2"
            >
              <Lock className="h-3.5 w-3.5" /> Lock {activeQuarter.quarter} Metrics
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Fund Row with expandable capital activity + FS status badge ────

function FundRow({ fund, quarterDate, isExpanded, onToggle, fsStatus, fsLabel, registryNav, registryTvpi }: {
  fund: any; quarterDate: string; isExpanded: boolean; onToggle: () => void;
  fsStatus: "uploaded" | "stale" | "pending"; fsLabel: string;
  registryNav?: number | null; registryTvpi?: number | null;
}) {
  const { data: fs } = useFundFinancialStatement(fund.id, quarterDate);
  const { data: allFundReports = [] } = useFundReports(quarterDate);
  const { data: cashflows = [] } = useFundCashflows(fund.id);
  const qc = useQueryClient();

  const fundReport = allFundReports.find((r: any) => r.fund_id === fund.id);
  const fsData = fs?.extracted_data as any;
  const fundTotals = fsData?.fund_totals || {};

  const reportNav = Number(fundReport?.reported_nav || 0);
  const reportCalled = Number(fundReport?.capital_called_to_date || 0);
  const reportDist = Number(fundReport?.distributions_to_date || 0);

  const metrics = computeFundMetrics({
    twhCommitment: Number(fund.commitment_amount),
    totalFundCommitment: Number(fundTotals.total_commitment || 0),
    totalInvestmentCost: Number(fundTotals.total_investment_cost || 0),
    totalPortfolioFmv: Number(fundTotals.total_portfolio_fmv || 0),
    fundNav: Number(fundTotals.fund_nav || 0),
    capitalActivity: cashflows.map((c: any) => ({
      date: c.cashflow_date,
      type: c.cashflow_type || (c.capital_deployed > 0 ? 'Capital Call — Investment' : 'Distribution'),
      amount: Number(c.capital_deployed || 0) + Number(c.distribution_received || 0),
    })),
    reportDate: quarterDate,
    reportNav,
    reportCalled,
    reportDist,
    ownershipPct: Number(fund.ownership_percentage || 0),
  });

  const [newCf, setNewCf] = useState({ cashflow_date: "", cashflow_type: "Capital Call — Investment", amount: 0, description: "" });

  const addCashflow = async () => {
    if (!newCf.cashflow_date || !newCf.amount) return;
    const isCall = newCf.cashflow_type.startsWith("Capital Call");
    const { error } = await supabase.from("fund_cashflows").insert({
      fund_id: fund.id,
      cashflow_date: newCf.cashflow_date,
      cashflow_type: newCf.cashflow_type,
      capital_deployed: isCall ? newCf.amount : 0,
      distribution_received: !isCall ? newCf.amount : 0,
      description: newCf.description || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fund-cashflows", fund.id] });
    setNewCf({ cashflow_date: "", cashflow_type: "Capital Call — Investment", amount: 0, description: "" });
  };

  const deleteCashflow = async (id: string) => {
    await supabase.from("fund_cashflows").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["fund-cashflows", fund.id] });
  };

  const statusBadge = () => {
    if (fsStatus === "uploaded") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--positive))]" />
          {fsLabel}
        </span>
      );
    }
    if (fsStatus === "stale") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))]" />
          {fsLabel}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        Pending
      </span>
    );
  };

  return (
    <>
      <TableRow className="table-row-hover cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{fund.fund_name}</TableCell>
        <TableCell className="text-muted-foreground">{(fund as any).start_date || '—'}</TableCell>
        <TableCell className="text-center">{statusBadge()}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(Number(fund.commitment_amount))}</TableCell>
        <TableCell className="text-muted-foreground">{(fund as any).currency || 'USD'}</TableCell>
        <TableCell className="text-right font-mono">{metrics.twhPct > 0 ? formatPercent(metrics.twhPct) : '—'}</TableCell>
        <TableCell className="text-right font-mono">{registryNav != null && registryNav > 0 ? formatCurrency(registryNav) : (metrics.twhNav > 0 ? formatCurrency(metrics.twhNav) : '—')}</TableCell>
        <TableCell className="text-right font-mono">{registryTvpi != null ? formatMultiple(registryTvpi) : (metrics.tvpi > 0 ? formatMultiple(metrics.tvpi) : '—')}</TableCell>
        <TableCell className="text-right font-mono">{formatIrr(metrics.irr)}</TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={10} className="bg-surface-1 p-0">
            <div className="p-4 space-y-4">
              {/* Fund Classification */}
              <div>
                <h3 className="text-sm font-medium mb-2">Fund Details</h3>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Theme", field: "theme" },
                    { label: "Company Industry(ies)", field: "company_industries" },
                    { label: "Target Industry(ies)", field: "target_industries" },
                    { label: "Geography", field: "geography" },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</label>
                      <Input
                        className="h-7 text-xs mt-1"
                        value={(fund as any)[field] || ""}
                        onChange={async (e) => {
                          await supabase.from("funds").update({ [field]: e.target.value || null } as any).eq("id", fund.id);
                          qc.invalidateQueries({ queryKey: ["funds"] });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculated Metrics */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "TWH Contributions", value: formatCurrency(metrics.twhContributions) },
                  { label: "TWH Distributions", value: formatCurrency(metrics.twhDistributions) },
                  { label: "TWH Cost", value: formatCurrency(metrics.twhCost), bg: true },
                  { label: "TWH FMV", value: formatCurrency(metrics.twhFmv), bg: true },
                  { label: "PIC", value: formatPercent(metrics.pic) },
                  { label: "RVPI", value: formatMultiple(metrics.rvpi) },
                  { label: "DPI", value: formatMultiple(metrics.dpi) },
                  { label: "TVPI", value: formatMultiple(metrics.tvpi) },
                  { label: "MOIC", value: formatMultiple(metrics.moic), bg: true },
                  { label: "IRR", value: formatIrr(metrics.irr) },
                ].map(m => (
                  <div key={m.label} className={cn("px-3 py-2 rounded border border-border", m.bg ? "bg-surface-2" : "bg-card")}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
                    <p className="text-sm font-mono font-medium">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Capital Activity Ledger */}
              <div>
                <h3 className="text-sm font-medium mb-2">Capital Activity</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount ($)</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashflows.map((cf: any) => (
                      <TableRow key={cf.id}>
                        <TableCell className="font-mono text-xs">{cf.cashflow_date}</TableCell>
                        <TableCell className="text-xs">{(cf as any).cashflow_type || '—'}</TableCell>
                        <TableCell className={cn("text-right font-mono text-xs",
                          cf.distribution_received > 0 ? "text-positive" : ""
                        )}>
                          {formatCurrency(Number(cf.capital_deployed || 0) + Number(cf.distribution_received || 0))}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{cf.description || '—'}</TableCell>
                        <TableCell>
                          <button onClick={() => deleteCashflow(cf.id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Add row */}
                    <TableRow>
                      <TableCell>
                        <Input type="date" className="h-7 text-xs w-32" value={newCf.cashflow_date}
                          onChange={e => setNewCf(p => ({ ...p, cashflow_date: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <Select value={newCf.cashflow_type} onValueChange={v => setNewCf(p => ({ ...p, cashflow_type: v }))}>
                          <SelectTrigger className="h-7 text-xs w-48"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CASHFLOW_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 text-xs w-28 text-right" value={newCf.amount || ""}
                          onChange={e => setNewCf(p => ({ ...p, amount: Number(e.target.value) }))} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-7 text-xs" value={newCf.description}
                          onChange={e => setNewCf(p => ({ ...p, description: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={addCashflow} className="h-7 w-7 p-0">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Add Reports Dialog — upload FS for all funds for next quarter ──

function AddReportsDialog({ funds, availableQuarters, defaultQuarterDate, onClose }: {
  funds: any[]; availableQuarters: { label: string; date: string }[]; defaultQuarterDate: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedQuarterDate, setSelectedQuarterDate] = useState(defaultQuarterDate);
  const selectedQuarter = availableQuarters.find(q => q.date === selectedQuarterDate) || availableQuarters[0];
  const [uploadingFundId, setUploadingFundId] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [extractedMap, setExtractedMap] = useState<Record<string, any>>({});
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const [extracting, setExtracting] = useState<string | null>(null);

  // Reset state when quarter changes
  const handleQuarterChange = (date: string) => {
    setSelectedQuarterDate(date);
    setFiles({});
    setExtractedMap({});
    setConfirmedSet(new Set());
  };

  const handleFileSelect = (fundId: string, file: File) => {
    setFiles(prev => ({ ...prev, [fundId]: file }));
  };

  const handleExtract = async (fundId: string) => {
    const file = files[fundId];
    if (!file) return;
    setExtracting(fundId);
    try {
      const filePath = `${selectedQuarterDate}/${fundId}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from("fund-reports").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const { data, error } = await supabase.functions.invoke("extract-fund-fs", {
        body: { pdf_base64: base64, file_name: file.name },
      });
      if (error) throw error;
      setExtractedMap(prev => ({ ...prev, [fundId]: data }));
    } catch (err: any) {
      toast.error(err.message || "Extraction failed");
    } finally {
      setExtracting(null);
    }
  };

  const handleConfirm = async (fundId: string) => {
    const extractedData = extractedMap[fundId];
    if (!extractedData) return;
    const { error } = await supabase.from("fund_financial_statements").upsert({
      fund_id: fundId,
      quarter_date: selectedQuarterDate,
      extracted_data: extractedData,
      confirmed: true,
      file_path: files[fundId]?.name || null,
    } as any, { onConflict: "fund_id,quarter_date" });
    if (error) { toast.error(error.message); return; }
    setConfirmedSet(prev => new Set(prev).add(fundId));
    toast.success("Report confirmed");
    qc.invalidateQueries({ queryKey: ["fund-fs"] });
    qc.invalidateQueries({ queryKey: ["all-fund-fs"] });
    qc.invalidateQueries({ queryKey: ["all-fund-fs-status"] });
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Add Reports
          </DialogTitle>
          <div className="flex items-center gap-3 pt-2">
            <span className="text-sm text-muted-foreground">Quarter:</span>
            <Select value={selectedQuarterDate} onValueChange={handleQuarterChange}>
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableQuarters.map(q => (
                  <SelectItem key={q.date} value={q.date}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {funds.map((fund: any) => {
            const hasFile = !!files[fund.id];
            const hasExtracted = !!extractedMap[fund.id];
            const isConfirmed = confirmedSet.has(fund.id);
            const isExtracting = extracting === fund.id;

            return (
              <div key={fund.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{fund.fund_name}</p>
                  <p className="text-xs text-muted-foreground">{fund.strategy || ""} · {fund.vintage_year || ""}</p>
                </div>

                {isConfirmed ? (
                  <div className="flex items-center gap-1.5 text-[hsl(var(--positive))] text-xs font-medium">
                    <Check className="h-4 w-4" /> Uploaded
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf"
                      className="h-8 text-xs w-48"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelect(fund.id, f);
                      }}
                    />
                    {hasFile && !hasExtracted && (
                      <Button size="sm" variant="outline" onClick={() => handleExtract(fund.id)} disabled={isExtracting} className="h-8 gap-1 text-xs">
                        {isExtracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                        Extract
                      </Button>
                    )}
                    {hasExtracted && !isConfirmed && (
                      <Button size="sm" onClick={() => handleConfirm(fund.id)} className="h-8 gap-1 text-xs bg-[hsl(var(--gold))] text-[hsl(var(--background))]">
                        <Check className="h-3 w-3" /> Confirm
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Fund Dialog ────────────────────────────────────────────────

function AddFundDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fund_name: "",
    commitment_amount: "",
    ownership_percentage: "",
    vintage_year: "",
    start_date: "",
    strategy: "",
    geography: "",
    currency: "USD",
    theme: "",
    company_industries: "",
    target_industries: "",
    management_fee_rate: "2.0",
    carry_percentage: "20.0",
    hurdle_rate: "8.0",
  });

  const update = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!form.fund_name.trim()) { toast.error("Fund name is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("funds").insert({
      fund_name: form.fund_name.trim(),
      commitment_amount: Number(form.commitment_amount) || 0,
      ownership_percentage: Number(form.ownership_percentage) || 0,
      vintage_year: form.vintage_year ? Number(form.vintage_year) : null,
      start_date: form.start_date || null,
      strategy: form.strategy || null,
      geography: form.geography || null,
      currency: form.currency || "USD",
      theme: form.theme || null,
      company_industries: form.company_industries || null,
      target_industries: form.target_industries || null,
      management_fee_rate: Number(form.management_fee_rate) / 100 || 0.02,
      carry_percentage: Number(form.carry_percentage) / 100 || 0.20,
      hurdle_rate: Number(form.hurdle_rate) / 100 || 0.08,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${form.fund_name} added to portfolio`);
    qc.invalidateQueries({ queryKey: ["funds"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Add New Fund
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fund Name *</label>
              <Input className="h-8 mt-1" value={form.fund_name} onChange={e => update("fund_name", e.target.value)} placeholder="e.g. Sequoia Capital Fund XV" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TWH Commitment ($)</label>
              <Input type="number" className="h-8 mt-1" value={form.commitment_amount} onChange={e => update("commitment_amount", e.target.value)} placeholder="1000000" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TWH Ownership %</label>
              <Input type="number" className="h-8 mt-1" value={form.ownership_percentage} onChange={e => update("ownership_percentage", e.target.value)} placeholder="e.g. 5.0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vintage Year</label>
              <Input type="number" className="h-8 mt-1" value={form.vintage_year} onChange={e => update("vintage_year", e.target.value)} placeholder="2024" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Start Date</label>
              <Input type="date" className="h-8 mt-1" value={form.start_date} onChange={e => update("start_date", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Strategy</label>
              <Input className="h-8 mt-1" value={form.strategy} onChange={e => update("strategy", e.target.value)} placeholder="e.g. Venture" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Geography</label>
              <Input className="h-8 mt-1" value={form.geography} onChange={e => update("geography", e.target.value)} placeholder="e.g. North America" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Currency</label>
              <Select value={form.currency} onValueChange={v => update("currency", v)}>
                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Theme</label>
              <Input className="h-8 mt-1" value={form.theme} onChange={e => update("theme", e.target.value)} placeholder="e.g. AI/ML" />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground font-medium mb-2">Fee Terms</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Mgmt Fee %</label>
                <Input type="number" className="h-8 mt-1" value={form.management_fee_rate} onChange={e => update("management_fee_rate", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Carry %</label>
                <Input type="number" className="h-8 mt-1" value={form.carry_percentage} onChange={e => update("carry_percentage", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Hurdle %</label>
                <Input type="number" className="h-8 mt-1" value={form.hurdle_rate} onChange={e => update("hurdle_rate", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Fund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
