import { useState, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds, useFundCashflows, useFundFinancialStatement, useFundReports, useActiveQuarter } from "@/hooks/usePortfolioData";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { useFundQuarterMetrics } from "@/hooks/useConsolidatedMetrics";
import { computeFundMetrics, formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Upload, Plus, Trash2, FileText, Loader2, Check, Lock, X, FileStack } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
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
  const { data: fqm } = useFundQuarterMetrics(activeQuarter.date);
  const cm = useConsolidatedMetrics();
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const [addReportsOpen, setAddReportsOpen] = useState(false);
  const [addFundOpen, setAddFundOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const navigate = useNavigate();

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

  const activeFunds = funds;

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
          <Button size="sm" variant="outline" onClick={() => setBulkUploadOpen(true)} className="gap-2">
            <FileStack className="h-3.5 w-3.5" /> Bulk Upload
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
              const hasFS = fsStatusMap.confirmedSet.has(fund.id);
              const registryNav = fqm?.fundNAVs[fund.fund_name] ?? null;
              const hasTvpiEntry = fqm?.fundTVPIs ? fund.fund_name in fqm.fundTVPIs : false;
              const registryTvpi = hasTvpiEntry ? (fqm!.fundTVPIs[fund.fund_name] ?? null) : undefined;

              return (
                <FundRow
                  key={fund.id}
                  fund={fund}
                  quarterDate={activeQuarter.date}
                  isExpanded={expandedFund === fund.id}
                  onToggle={() => setExpandedFund(expandedFund === fund.id ? null : fund.id)}
                  fsStatus={hasFS ? "uploaded" : "pending"}
                  fsLabel={hasFS ? activeQuarter.quarter : "Pending"}
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

      {/* Bulk Upload Dialog */}
      {bulkUploadOpen && (
        <BulkUploadDialog
          funds={funds}
          defaultQuarterDate={defaultQuarter.date}
          availableQuarters={availableQuarters}
          onClose={() => setBulkUploadOpen(false)}
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
        <TableCell className="text-right font-mono">{registryTvpi !== undefined ? (registryTvpi != null ? formatMultiple(registryTvpi) : '—') : (metrics.tvpi > 0 ? formatMultiple(metrics.tvpi) : '—')}</TableCell>
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

// ─── Add Reports Dialog — redesigned multi-type document uploader ──

type DocType = "pdf" | "word" | "email" | "link";
interface DocEntry {
  id: string;
  type: DocType;
  label: string;
  content?: string;
  url?: string;
  fileName?: string;
  storagePath?: string;
  addedAt: string;
}

interface StoredDoc {
  id: string;
  type: DocType;
  label: string;
  file_name: string | null;
  file_path: string | null;
  email_content: string | null;
  link_url: string | null;
  added_at: string;
}

const serializeDocEntry = (entry: DocEntry): StoredDoc => ({
  id: entry.id,
  type: entry.type,
  label: entry.label || entry.fileName || entry.type,
  file_name: entry.fileName || null,
  file_path: entry.storagePath || null,
  email_content: entry.content || null,
  link_url: entry.url || null,
  added_at: entry.addedAt,
});

const normalizeStoredDocs = (rawData: any, rowFilePath: string | null): StoredDoc[] => {
  const documents = Array.isArray(rawData?.documents)
    ? rawData.documents.filter((doc: unknown): doc is StoredDoc => !!doc && typeof doc === "object")
    : [];

  if (documents.length > 0) return documents;

  const hasLegacyDoc =
    rawData?.doc_type ||
    rawData?.label ||
    rawData?.email_content ||
    rawData?.link_url ||
    rawData?.file_path ||
    rowFilePath;

  if (!hasLegacyDoc) return [];

  let legacyType: DocType = "pdf";
  if (rawData?.doc_type === "pdf" || rawData?.doc_type === "word" || rawData?.doc_type === "email" || rawData?.doc_type === "link") {
    legacyType = rawData.doc_type;
  } else if (rawData?.link_url) {
    legacyType = "link";
  } else if (rawData?.email_content) {
    legacyType = "email";
  }

  return [{
    id: `legacy-${crypto.randomUUID()}`,
    type: legacyType,
    label: rawData?.label || rawData?.file_name || "Document",
    file_name: rawData?.file_name || null,
    file_path: rawData?.file_path || rowFilePath || null,
    email_content: rawData?.email_content || null,
    link_url: rawData?.link_url || null,
    added_at: rawData?.added_at || new Date().toISOString(),
  }];
};

function AddReportsDialog({ funds, availableQuarters, defaultQuarterDate, onClose }: {
  funds: any[]; availableQuarters: { label: string; date: string }[]; defaultQuarterDate: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedQuarterDate, setSelectedQuarterDate] = useState(defaultQuarterDate);
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, DocEntry[]>>({});

  // Per-fund inline form state
  const [activeInput, setActiveInput] = useState<Record<string, DocType | null>>({});
  const [inputLabel, setInputLabel] = useState<Record<string, string>>({});
  const [inputFile, setInputFile] = useState<Record<string, File | null>>({});
  const [inputContent, setInputContent] = useState<Record<string, string>>({});
  const [inputUrl, setInputUrl] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);

  const resetSession = (collapseFunds = false) => {
    setDocs({});
    setActiveInput({});
    setInputLabel({});
    setInputFile({});
    setInputContent({});
    setInputUrl({});
    setUploading({});
    setUploadSuccess({});
    if (collapseFunds) setExpandedFund(null);
  };

  const pendingUploadPaths = useMemo(
    () => Object.values(docs).flatMap((entries) => entries.map((entry) => entry.storagePath).filter((path): path is string => !!path)),
    [docs],
  );

  const anyUploading = Object.values(uploading).some(Boolean);

  const clearInput = (fundId: string, closeInput = true) => {
    if (closeInput) {
      setActiveInput(prev => ({ ...prev, [fundId]: null }));
    }
    setInputLabel(prev => ({ ...prev, [fundId]: "" }));
    setInputFile(prev => ({ ...prev, [fundId]: null }));
    setInputContent(prev => ({ ...prev, [fundId]: "" }));
    setInputUrl(prev => ({ ...prev, [fundId]: "" }));
  };

  const cleanupPendingUploads = async (paths = pendingUploadPaths) => {
    if (!paths.length) return;
    await supabase.storage.from("fund-reports").remove(paths);
  };

  const handleQuarterChange = async (nextQuarterDate: string) => {
    await cleanupPendingUploads();
    resetSession(true);
    setSelectedQuarterDate(nextQuarterDate);
  };

  const handleClose = async () => {
    if (anyUploading || savingAll) return;
    await cleanupPendingUploads();
    resetSession(true);
    onClose();
  };

  const handleAttachDocument = async (fundId: string, file: File | null) => {
    if (!file) return;
    const label = inputLabel[fundId]?.trim() || file.name;

    setInputFile(prev => ({ ...prev, [fundId]: file }));
    setUploading(prev => ({ ...prev, [fundId]: true }));
    setUploadSuccess(prev => ({ ...prev, [fundId]: false }));

    try {
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const storagePath = `${selectedQuarterDate}/${fundId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("fund-reports")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const docType: DocType = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "word";
      const entry: DocEntry = {
        id: crypto.randomUUID(),
        type: docType,
        label,
        fileName: file.name,
        storagePath,
        addedAt: new Date().toISOString(),
      };

      setDocs(prev => ({ ...prev, [fundId]: [...(prev[fundId] || []), entry] }));
      setUploadSuccess(prev => ({ ...prev, [fundId]: true }));
      setTimeout(() => {
        setUploadSuccess(prev => ({ ...prev, [fundId]: false }));
      }, 1200);
      clearInput(fundId, false);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(prev => ({ ...prev, [fundId]: false }));
      setInputFile(prev => ({ ...prev, [fundId]: null }));
    }
  };

  const handleAddEmail = async (fundId: string) => {
    const content = inputContent[fundId]?.trim();
    if (!content) { toast.error("Please paste email content"); return; }
    const label = inputLabel[fundId]?.trim() || "Email";

    const entry: DocEntry = { id: crypto.randomUUID(), type: "email", label, content, addedAt: new Date().toISOString() };
    setDocs(prev => ({ ...prev, [fundId]: [...(prev[fundId] || []), entry] }));
    clearInput(fundId);
    toast.success("Email added");
  };

  const handleAddLink = async (fundId: string) => {
    const url = inputUrl[fundId]?.trim();
    if (!url) { toast.error("Please enter a URL"); return; }
    const label = inputLabel[fundId]?.trim() || url;

    const entry: DocEntry = { id: crypto.randomUUID(), type: "link", label, url, addedAt: new Date().toISOString() };
    setDocs(prev => ({ ...prev, [fundId]: [...(prev[fundId] || []), entry] }));
    clearInput(fundId);
    toast.success("Link added");
  };

  const removeDoc = async (fundId: string, docId: string) => {
    const entry = (docs[fundId] || []).find((doc) => doc.id === docId);
    setDocs(prev => ({ ...prev, [fundId]: (prev[fundId] || []).filter(d => d.id !== docId) }));

    if (entry?.storagePath) {
      await supabase.storage.from("fund-reports").remove([entry.storagePath]);
    }
  };

  const handleSaveAll = async () => {
    const docsByFund = Object.entries(docs).filter(([, entries]) => entries.length > 0);
    if (!docsByFund.length || anyUploading) return;

    setSavingAll(true);

    try {
      const fundIds = docsByFund.map(([fundId]) => fundId);
      const { data: existingRows, error: existingError } = await supabase
        .from("fund_financial_statements")
        .select("fund_id, extracted_data, confirmed, file_path")
        .eq("quarter_date", selectedQuarterDate)
        .in("fund_id", fundIds);

      if (existingError) throw existingError;

      const existingMap = new Map((existingRows || []).map((row) => [row.fund_id, row]));
      const rows = docsByFund.map(([fundId, entries]) => {
        const existing = existingMap.get(fundId);
        const existingData = (existing?.extracted_data as any) || {};
        const {
          documents: _documents,
          doc_type: _docType,
          label: _label,
          file_path: _legacyFilePath,
          email_content: _legacyEmailContent,
          link_url: _legacyLinkUrl,
          added_at: _legacyAddedAt,
          ...restExistingData
        } = existingData;

        const mergedDocuments = [
          ...normalizeStoredDocs(existingData, existing?.file_path || null),
          ...entries.map(serializeDocEntry),
        ];

        const latestFilePath =
          [...entries].reverse().find((entry) => entry.storagePath)?.storagePath ||
          existing?.file_path ||
          null;

        return {
          fund_id: fundId,
          quarter_date: selectedQuarterDate,
          extracted_data: {
            ...restExistingData,
            documents: mergedDocuments,
          },
          file_path: latestFilePath,
          confirmed: existing?.confirmed ?? false,
        };
      });

      const { error: upsertError } = await supabase
        .from("fund_financial_statements")
        .upsert(rows, { onConflict: "fund_id,quarter_date" });

      if (upsertError) throw upsertError;

      toast.success("All documents saved");
      resetSession(true);
      qc.invalidateQueries({ queryKey: ["all-fund-fs-status"] });
      qc.invalidateQueries({ queryKey: ["latest-fs-per-fund"] });
      qc.invalidateQueries({ queryKey: ["fund-fs"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save documents");
    } finally {
      setSavingAll(false);
    }
  };

  const totalDocs = Object.values(docs).reduce((s, arr) => s + arr.length, 0);
  const fundsWithDocs = Object.values(docs).filter(arr => arr.length > 0).length;

  const docTypeIcon = (type: DocType) => {
    switch (type) {
      case "pdf": return <span className="text-sm">📄</span>;
      case "word": return <span className="text-sm">📝</span>;
      case "email": return <span className="text-sm">✉️</span>;
      case "link": return <span className="text-sm">🔗</span>;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !anyUploading && !savingAll) void handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Add Reports
          </DialogTitle>
          <div className="flex items-center gap-3 pt-2">
            <span className="text-sm text-muted-foreground">Quarter:</span>
            <Select value={selectedQuarterDate} onValueChange={(d) => void handleQuarterChange(d)} disabled={anyUploading || savingAll}>
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {funds.map((fund: any) => {
            const isExpanded = expandedFund === fund.id;
            const fundDocs = docs[fund.id] || [];
            const currentInput = activeInput[fund.id] || null;

            return (
              <div key={fund.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Fund header */}
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-1 transition-colors"
                  onClick={() => setExpandedFund(isExpanded ? null : fund.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fund.fund_name}</p>
                    <p className="text-xs text-muted-foreground">{fund.strategy || ""}{fund.vintage_year ? ` · ${fund.vintage_year}` : ""}</p>
                  </div>
                  {fundDocs.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] font-medium shrink-0">
                      {fundDocs.length}
                    </span>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        className={cn("h-7 text-xs gap-1.5", currentInput === "pdf" && "border-[hsl(var(--gold))] text-[hsl(var(--gold))]")}
                        onClick={() => setActiveInput(prev => ({ ...prev, [fund.id]: prev[fund.id] === "pdf" ? null : "pdf" }))}
                      >
                        📎 Attach Document
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className={cn("h-7 text-xs gap-1.5", currentInput === "email" && "border-[hsl(var(--gold))] text-[hsl(var(--gold))]")}
                        onClick={() => setActiveInput(prev => ({ ...prev, [fund.id]: prev[fund.id] === "email" ? null : "email" }))}
                      >
                        ✉️ Paste Email
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className={cn("h-7 text-xs gap-1.5", currentInput === "link" && "border-[hsl(var(--gold))] text-[hsl(var(--gold))]")}
                        onClick={() => setActiveInput(prev => ({ ...prev, [fund.id]: prev[fund.id] === "link" ? null : "link" }))}
                      >
                        🔗 Add Link
                      </Button>
                    </div>

                    {/* Inline input area */}
                    {currentInput === "pdf" && (
                      <div className="rounded-md border border-border bg-surface-1 p-3 space-y-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Name this document (optional)"
                          value={inputLabel[fund.id] || ""}
                          onChange={e => setInputLabel(prev => ({ ...prev, [fund.id]: e.target.value }))}
                        />
                        <Input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="h-8 text-xs"
                          disabled={uploading[fund.id]}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            void handleAttachDocument(fund.id, file);
                            e.currentTarget.value = "";
                          }}
                        />
                        {uploading[fund.id] && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span className="truncate">Uploading {inputFile[fund.id]?.name || "document"}...</span>
                          </div>
                        )}
                        {!uploading[fund.id] && uploadSuccess[fund.id] && (
                          <div className="flex items-center gap-2 text-xs text-[hsl(var(--gold))]">
                            <Check className="h-3.5 w-3.5" />
                            <span>Uploaded and added to this session</span>
                          </div>
                        )}
                      </div>
                    )}

                    {currentInput === "email" && (
                      <div className="rounded-md border border-border bg-surface-1 p-3 space-y-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Label (optional)"
                          value={inputLabel[fund.id] || ""}
                          onChange={e => setInputLabel(prev => ({ ...prev, [fund.id]: e.target.value }))}
                        />
                        <Textarea
                          className="text-xs min-h-[80px] resize-none"
                          placeholder="Paste email content here..."
                          value={inputContent[fund.id] || ""}
                          onChange={e => setInputContent(prev => ({ ...prev, [fund.id]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAddEmail(fund.id)}>
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </div>
                    )}

                    {currentInput === "link" && (
                      <div className="rounded-md border border-border bg-surface-1 p-3 space-y-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Label (optional)"
                          value={inputLabel[fund.id] || ""}
                          onChange={e => setInputLabel(prev => ({ ...prev, [fund.id]: e.target.value }))}
                        />
                        <Input
                          type="url"
                          className="h-8 text-xs"
                          placeholder="https://..."
                          value={inputUrl[fund.id] || ""}
                          onChange={e => setInputUrl(prev => ({ ...prev, [fund.id]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleAddLink(fund.id)}>
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </div>
                    )}

                    {/* Document list */}
                    {fundDocs.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {fundDocs.map(doc => (
                          <div key={doc.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 text-xs">
                            {docTypeIcon(doc.type)}
                            <span className="flex-1 truncate text-foreground">{doc.label || doc.fileName || doc.type}</span>
                            <button onClick={() => void removeDoc(fund.id, doc.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {totalDocs > 0 ? `${totalDocs} document${totalDocs !== 1 ? "s" : ""} added across ${fundsWithDocs} fund${fundsWithDocs !== 1 ? "s" : ""}` : "No documents added yet"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleClose()} disabled={savingAll || anyUploading}>Cancel</Button>
            <Button
              size="sm"
              className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
              onClick={handleSaveAll}
              disabled={totalDocs === 0 || anyUploading || savingAll}
            >
              {savingAll ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</> : "Save All"}
            </Button>
          </div>
        </div>
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

// ─── Bulk Upload Dialog ─────────────────────────────────────────────

function BulkUploadDialog({ funds, defaultQuarterDate, availableQuarters, onClose }: {
  funds: any[];
  defaultQuarterDate: string;
  availableQuarters: { label: string; date: string }[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quarterDate, setQuarterDate] = useState(defaultQuarterDate);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [allDone, setAllDone] = useState(false);

  const filledCount = Object.values(files).filter(Boolean).length;

  const handleExtractAll = async () => {
    const entries = Object.entries(files).filter(([, f]) => f != null) as [string, File][];
    if (entries.length === 0) return;

    setExtracting(true);
    setProgress({ done: 0, total: entries.length });

    let completed = 0;

    // Process in parallel (batches of 3 to avoid rate limits)
    const batchSize = 3;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(batch.map(async ([fundId, file]) => {
        try {
          // Upload file
          const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
          const storagePath = `${quarterDate}/${fundId}/${fileName}`;
          await supabase.storage.from("fund-reports").upload(storagePath, file);

          // Read file as base64
          const arrayBuffer = await file.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

          // Fetch template if exists
          const { data: template } = await supabase
            .from("fund_extraction_templates")
            .select("*")
            .eq("fund_id", fundId)
            .maybeSingle();

          // Call extraction edge function
          const { data: extracted, error } = await supabase.functions.invoke("extract-fund-fs", {
            body: { pdf_base64: base64, file_name: file.name, template: template || undefined },
          });

          if (error) throw error;

          const summary = extracted?.fund_summary || {};
          const companies = extracted?.portfolio_companies || [];

          // Insert into staged_fund_extractions
          await supabase.from("staged_fund_extractions").insert({
            fund_id: fundId,
            quarter_date: quarterDate,
            source_file_path: storagePath,
            source_file_name: file.name,
            extracted_nav: summary.nav,
            extracted_capital_called: summary.total_capital_called,
            extracted_distributions: summary.total_distributions,
            extracted_gross_irr: summary.gross_irr,
            extracted_gross_tvpi: summary.gross_tvpi,
            extracted_net_irr: summary.net_irr,
            extracted_net_tvpi: summary.net_tvpi,
            extracted_dpi: summary.dpi,
            extracted_rvpi: summary.rvpi,
            extracted_pic: summary.pic,
            extracted_commitment: summary.commitment,
            extracted_unfunded: summary.unfunded_commitment,
            extracted_companies: companies,
            raw_extraction: extracted,
            confidence_score: extracted?.extraction_confidence ?? null,
            extraction_model: "gemini-2.5-pro",
          } as any);

          completed++;
          setProgress({ done: completed, total: entries.length });
        } catch (err: any) {
          completed++;
          setProgress({ done: completed, total: entries.length });
          const fund = funds.find(f => f.id === fundId);
          toast.error(`Failed: ${fund?.fund_name || fundId}: ${err.message}`);
        }
      }));
    }

    setAllDone(true);
    setExtracting(false);
    qc.invalidateQueries({ queryKey: ["staged-extractions"] });
    qc.invalidateQueries({ queryKey: ["pending-review-count"] });
    toast.success(`Extracted ${completed}/${entries.length} reports. Ready for review.`);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !extracting) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5" /> Bulk Upload Reports
          </DialogTitle>
          <div className="flex items-center gap-3 pt-2">
            <span className="text-sm text-muted-foreground">Quarter:</span>
            <Select value={quarterDate} onValueChange={setQuarterDate} disabled={extracting}>
              <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableQuarters.map(q => (
                  <SelectItem key={q.date} value={q.date}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {extracting && (
            <div className="flex items-center gap-3 p-3 bg-surface-1 rounded-lg mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--gold))]" />
              <span className="text-sm text-muted-foreground">Extracting {progress.done}/{progress.total} funds...</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-[hsl(var(--gold))] transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {funds.map((fund: any) => (
            <div key={fund.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fund.fund_name}</p>
                <p className="text-xs text-muted-foreground">{fund.strategy || ""}{fund.vintage_year ? ` · ${fund.vintage_year}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {files[fund.id] ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[hsl(var(--gold))] truncate max-w-[150px]">{files[fund.id]!.name}</span>
                    <button onClick={() => setFiles(prev => ({ ...prev, [fund.id]: null }))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      disabled={extracting}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) setFiles(prev => ({ ...prev, [fund.id]: file }));
                        e.currentTarget.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-1 transition-colors cursor-pointer">
                      <Upload className="h-3 w-3" /> Upload PDF
                    </span>
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {filledCount} file{filledCount !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={extracting}>Cancel</Button>
            {allDone ? (
              <Button
                size="sm"
                className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90 gap-2"
                onClick={() => { onClose(); navigate("/review"); }}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Go to Review
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-[hsl(var(--gold))] text-[hsl(var(--background))] hover:bg-[hsl(var(--gold))]/90"
                onClick={handleExtractAll}
                disabled={filledCount === 0 || extracting}
              >
                {extracting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</> : `Extract All (${filledCount})`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
