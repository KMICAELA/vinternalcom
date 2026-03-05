import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds, useFundCashflows, useFundFinancialStatement, useActiveQuarter } from "@/hooks/usePortfolioData";
import { computeFundMetrics, formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Upload, Plus, Trash2, Save, FileText, Loader2 } from "lucide-react";
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
  const [addFundOpen, setAddFundOpen] = useState(false);
  const [newFund, setNewFund] = useState({ fund_name: "", start_date: "", commitment_amount: 0, currency: "USD" });
  const [uploadFundId, setUploadFundId] = useState<string | null>(null);

  const handleAddFund = async () => {
    if (!newFund.fund_name) return;
    const { error } = await supabase.from("funds").insert({
      fund_name: newFund.fund_name,
      start_date: newFund.start_date || null,
      commitment_amount: newFund.commitment_amount,
      currency: newFund.currency,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Fund added");
    qc.invalidateQueries({ queryKey: ["funds"] });
    setAddFundOpen(false);
    setNewFund({ fund_name: "", start_date: "", commitment_amount: 0, currency: "USD" });
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Funds</h1>
          <p className="text-sm text-muted-foreground">Fund registry & financial statement management</p>
        </div>
        <Button size="sm" onClick={() => setAddFundOpen(true)} className="gap-2">
          <Plus className="h-3.5 w-3.5" /> Add Fund
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
              <TableHead>Last FS</TableHead>
              <TableHead className="w-20" />
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
                onUpload={() => setUploadFundId(fund.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Fund Dialog */}
      <Dialog open={addFundOpen} onOpenChange={setAddFundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fund</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Fund Name</label>
              <Input value={newFund.fund_name} onChange={e => setNewFund(p => ({ ...p, fund_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Start Date</label>
              <Input type="date" value={newFund.start_date} onChange={e => setNewFund(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">TWH Commitment ($)</label>
              <Input type="number" value={newFund.commitment_amount} onChange={e => setNewFund(p => ({ ...p, commitment_amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Currency</label>
              <Select value={newFund.currency} onValueChange={v => setNewFund(p => ({ ...p, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddFund}>Add Fund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload FS Dialog */}
      {uploadFundId && (
        <FSUploadDialog
          fundId={uploadFundId}
          quarterDate={activeQuarter.date}
          onClose={() => setUploadFundId(null)}
        />
      )}
    </div>
  );
}

// ─── Fund Row with expandable capital activity ─────────────────────

function FundRow({ fund, quarterDate, isExpanded, onToggle, onUpload }: {
  fund: any; quarterDate: string; isExpanded: boolean; onToggle: () => void; onUpload: () => void;
}) {
  const { data: fs } = useFundFinancialStatement(fund.id, quarterDate);
  const { data: cashflows = [] } = useFundCashflows(fund.id);
  const qc = useQueryClient();

  const fsData = fs?.extracted_data as any;
  const fundTotals = fsData?.fund_totals || {};

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
        <TableCell className="text-muted-foreground text-xs">{fs?.confirmed ? quarterDate : '—'}</TableCell>
        <TableCell>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onUpload(); }} className="gap-1">
            <Upload className="h-3.5 w-3.5" /> FS
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={11} className="bg-surface-1 p-0">
            <div className="p-4 space-y-4">
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

// ─── FS Upload Dialog ──────────────────────────────────────────────

function FSUploadDialog({ fundId, quarterDate, onClose }: { fundId: string; quarterDate: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [editing, setEditing] = useState(false);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      // Upload file to storage
      const filePath = `${fundId}/${quarterDate}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from("fund-reports").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Convert to base64 for AI extraction
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Call edge function for extraction
      const { data, error } = await supabase.functions.invoke("extract-fund-fs", {
        body: { pdf_base64: base64, file_name: file.name },
      });
      if (error) throw error;
      setExtractedData(data);
    } catch (err: any) {
      toast.error(err.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirm = async () => {
    if (!extractedData) return;
    const { error } = await supabase.from("fund_financial_statements").upsert({
      fund_id: fundId,
      quarter_date: quarterDate,
      extracted_data: extractedData,
      confirmed: true,
      file_path: file?.name || null,
    } as any, { onConflict: "fund_id,quarter_date" });
    if (error) { toast.error(error.message); return; }
    toast.success("Financial statement saved");
    qc.invalidateQueries({ queryKey: ["fund-fs"] });
    qc.invalidateQueries({ queryKey: ["all-fund-fs"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Upload Financial Statement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Quarter: {quarterDate}</label>
          </div>

          <div className="flex items-center gap-3">
            <Input type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            <Button onClick={handleExtract} disabled={!file || extracting} className="gap-2">
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Extract
            </Button>
          </div>

          {extractedData && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Extracted Data</h3>
              <pre className="bg-surface-1 border border-border rounded p-3 text-xs font-mono max-h-64 overflow-auto">
                {JSON.stringify(extractedData, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">Review the extracted data above. Click Confirm to save.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!extractedData}>Confirm & Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
