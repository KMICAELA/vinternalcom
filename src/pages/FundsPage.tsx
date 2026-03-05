import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds, useFundCashflows, useFundFinancialStatement, useFundReports, useActiveQuarter } from "@/hooks/usePortfolioData";
import { computeFundMetrics, formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Upload, Plus, Trash2, FileText, Loader2, Check } from "lucide-react";
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
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const [addReportsOpen, setAddReportsOpen] = useState(false);

  // Compute next quarter after active quarter
  const nextQuarter = useMemo(() => {
    const d = new Date(activeQuarter.date);
    d.setMonth(d.getMonth() + 3);
    const qMonth = Math.floor(d.getMonth() / 3) * 3 + 2;
    d.setMonth(qMonth);
    d.setDate(new Date(d.getFullYear(), qMonth + 1, 0).getDate());
    const qNum = Math.floor(qMonth / 3) + 1;
    const label = `Q${qNum} ${d.getFullYear()}`;
    const dateStr = d.toISOString().split("T")[0];
    return { label, date: dateStr };
  }, [activeQuarter.date]);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Funds</h1>
          <p className="text-sm text-muted-foreground">Fund registry & financial statement management</p>
        </div>
        <Button size="sm" onClick={() => setAddReportsOpen(true)} className="gap-2">
          <Upload className="h-3.5 w-3.5" /> Add Reports
        </Button>
      </div>

      {/* Fund Registry Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-1">
              <TableHead className="w-8" />
              <TableHead>Fund Name</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead className="text-right">TWH Commitment</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">TWH %</TableHead>
              <TableHead className="text-right">TWH NAV</TableHead>
              <TableHead className="text-right">TVPI</TableHead>
              <TableHead className="text-right">IRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funds.map((fund: any) => (
              <FundRow
                key={fund.id}
                fund={fund}
                quarterDate={activeQuarter.date}
                isExpanded={expandedFund === fund.id}
                onToggle={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Reports Dialog */}
      {addReportsOpen && (
        <AddReportsDialog
          funds={funds}
          quarterLabel={nextQuarter.label}
          quarterDate={nextQuarter.date}
          onClose={() => setAddReportsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Fund Row with expandable capital activity ─────────────────────

function FundRow({ fund, quarterDate, isExpanded, onToggle }: {
  fund: any; quarterDate: string; isExpanded: boolean; onToggle: () => void;
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

  return (
    <>
      <TableRow className="table-row-hover cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{fund.fund_name}</TableCell>
        <TableCell className="text-muted-foreground">{(fund as any).start_date || '—'}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(Number(fund.commitment_amount))}</TableCell>
        <TableCell className="text-muted-foreground">{(fund as any).currency || 'USD'}</TableCell>
        <TableCell className="text-right font-mono">{formatPercent(metrics.twhPct)}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(metrics.twhNav)}</TableCell>
        <TableCell className="text-right font-mono">{formatMultiple(metrics.tvpi)}</TableCell>
        <TableCell className="text-right font-mono">{formatIrr(metrics.irr)}</TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-surface-1 p-0">
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

function AddReportsDialog({ funds, quarterLabel, quarterDate, onClose }: {
  funds: any[]; quarterLabel: string; quarterDate: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [uploadingFundId, setUploadingFundId] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [extractedMap, setExtractedMap] = useState<Record<string, any>>({});
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const [extracting, setExtracting] = useState<string | null>(null);

  const handleFileSelect = (fundId: string, file: File) => {
    setFiles(prev => ({ ...prev, [fundId]: file }));
  };

  const handleExtract = async (fundId: string) => {
    const file = files[fundId];
    if (!file) return;
    setExtracting(fundId);
    try {
      const filePath = `${quarterDate}/${fundId}/${file.name}`;
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
      quarter_date: quarterDate,
      extracted_data: extractedData,
      confirmed: true,
      file_path: files[fundId]?.name || null,
    } as any, { onConflict: "fund_id,quarter_date" });
    if (error) { toast.error(error.message); return; }
    setConfirmedSet(prev => new Set(prev).add(fundId));
    toast.success("Report confirmed");
    qc.invalidateQueries({ queryKey: ["fund-fs"] });
    qc.invalidateQueries({ queryKey: ["all-fund-fs"] });
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Add Reports — {quarterLabel}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Upload financial statements for each fund for {quarterLabel} ({quarterDate})</p>
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
                  <div className="flex items-center gap-1.5 text-positive text-xs font-medium">
                    <Check className="h-4 w-4" /> Uploaded
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf"
                      className="h-8 text-xs w-48"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelect(fund.id, f);
                      }}
                    />
                    {hasFile && !hasExtracted && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleExtract(fund.id)} disabled={isExtracting}>
                        {isExtracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Extract
                      </Button>
                    )}
                    {hasExtracted && (
                      <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleConfirm(fund.id)}>
                        <Check className="h-3.5 w-3.5" /> Confirm
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
