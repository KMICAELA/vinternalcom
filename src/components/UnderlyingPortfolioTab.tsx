import { useState, useCallback } from "react";
import { underlyingPortfolio as initialPortfolio, formatCurrency, UnderlyingHolding, fundHoldings } from "@/data/portfolioData";
import { cn } from "@/lib/utils";
import SectionHeader from "@/components/SectionHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Pencil, Check, X, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const emptyHolding: UnderlyingHolding = {
  company: "",
  fund: "",
  status: "Active",
  date: "",
  instrument: "",
  round: "",
  investmentCost: 0,
  fmv: 0,
  proceeds: 0,
  moic: "1.00x",
  twhPercent: "0.00%",
  twhCost: 0,
  twhFMV: 0,
};

const EditableCell = ({
  value,
  onChange,
  type = "text",
  className,
}: {
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  className?: string;
}) => (
  <Input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    type={type}
    className={cn("h-7 text-xs px-1.5 py-0 bg-card border-border min-w-[70px]", className)}
  />
);

// Fund name to TWH ownership % mapping from fund holdings
const fundTwhPercentMap: Record<string, number> = {};
fundHoldings.forEach((f) => {
  // Extract short fund name from the underlying portfolio data
  const pctVal = parseFloat(f.twhPercent.replace("%", ""));
  fundTwhPercentMap[f.name] = pctVal;
});

// Short fund names used in underlying portfolio mapped to their TWH %
const FUND_TWH_PERCENT: Record<string, number> = {
  "Lowercarbon": 0.31,
  "Third Sphere": 4.80,
  "Tamarack": 2.77,
  "Generational": 17.38,
  "Leap": 1.93,
  "SVLC": 6.67,
  "Cantos": 5.71,
  "Quantonation": 0.69,
  "ONEVC": 4.48,
};

const ROUND_OPTIONS = ["Pre-Seed", "Seed", "Series A", "Series B"];

const FUND_NAMES = Object.keys(FUND_TWH_PERCENT);

const calcTwhFields = (holding: UnderlyingHolding, fundName?: string): UnderlyingHolding => {
  const fund = fundName || holding.fund;
  const pct = FUND_TWH_PERCENT[fund] ?? 0;
  const twhPercent = `${pct.toFixed(2)}%`;
  const twhCost = Math.round((holding.investmentCost * pct / 100) * 100) / 100;
  const twhFMV = Math.round((holding.fmv * pct / 100) * 100) / 100;
  return { ...holding, fund, twhPercent, twhCost, twhFMV };
};

const UnderlyingPortfolioTab = () => {
  const [portfolio, setPortfolio] = useState<UnderlyingHolding[]>([...initialPortfolio]);
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>("all");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editData, setEditData] = useState<UnderlyingHolding | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newHolding, setNewHolding] = useState<UnderlyingHolding>({ ...emptyHolding });

  const funds = [...new Set(portfolio.map((h) => h.fund))];

  const filtered = portfolio.filter((h) => {
    const matchSearch =
      h.company.toLowerCase().includes(search.toLowerCase()) ||
      h.fund.toLowerCase().includes(search.toLowerCase());
    const matchFund = fundFilter === "all" || h.fund === fundFilter;
    return matchSearch && matchFund;
  });

  // Map filtered indices back to portfolio indices
  const getPortfolioIndex = useCallback(
    (filteredIdx: number) => {
      const item = filtered[filteredIdx];
      return portfolio.indexOf(item);
    },
    [filtered, portfolio]
  );

  const startEdit = (filteredIdx: number) => {
    const realIdx = getPortfolioIndex(filteredIdx);
    setEditingIndex(realIdx);
    setEditData({ ...portfolio[realIdx] });
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditData(null);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editData) return;
    const updated = [...portfolio];
    updated[editingIndex] = editData;
    setPortfolio(updated);
    setEditingIndex(null);
    setEditData(null);
    toast.success("Holding updated successfully");
  };

  const updateField = (field: keyof UnderlyingHolding, value: string) => {
    if (!editData) return;
    const numFields: (keyof UnderlyingHolding)[] = ["investmentCost", "fmv", "proceeds"];
    let updated = { ...editData };
    if (numFields.includes(field)) {
      updated = { ...updated, [field]: parseFloat(value) || 0 };
    } else {
      updated = { ...updated, [field]: value };
    }
    // Recalculate TWH fields when fund, cost, or fmv changes
    if (field === "fund" || field === "investmentCost" || field === "fmv") {
      updated = calcTwhFields(updated);
    }
    setEditData(updated);
  };

  const updateNewHoldingField = (field: keyof UnderlyingHolding, value: string | number) => {
    let updated = { ...newHolding, [field]: value };
    if (field === "fund" || field === "investmentCost" || field === "fmv") {
      updated = calcTwhFields(updated);
    }
    setNewHolding(updated);
  };

  const addHolding = () => {
    if (!newHolding.company.trim() || !newHolding.fund.trim()) {
      toast.error("Company and Fund are required");
      return;
    }
    const finalHolding = calcTwhFields(newHolding);
    setPortfolio([...portfolio, finalHolding]);
    setNewHolding({ ...emptyHolding });
    setAddDialogOpen(false);
    toast.success("Holding added successfully");
  };

  // Summary stats
  const totalCost = filtered.reduce((s, h) => s + h.twhCost, 0);
  const totalFMV = filtered.reduce((s, h) => s + h.twhFMV, 0);
  const activeCount = filtered.filter((h) => h.status === "Active").length;
  const writeOffCount = filtered.filter((h) => h.status === "Write-off").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Underlying Portfolio" subtitle="All companies across fund investments" />
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Holding
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Holding</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Company *</Label>
                <Input value={newHolding.company} onChange={(e) => updateNewHoldingField("company", e.target.value)} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fund *</Label>
                <Select value={newHolding.fund} onValueChange={(v) => updateNewHoldingField("fund", v)}>
                  <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                  <SelectContent>
                    {FUND_NAMES.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={newHolding.status} onValueChange={(v) => updateNewHoldingField("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Write-off">Write-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Round</Label>
                <Select value={newHolding.round} onValueChange={(v) => updateNewHoldingField("round", v)}>
                  <SelectTrigger><SelectValue placeholder="Select round" /></SelectTrigger>
                  <SelectContent>
                    {ROUND_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fund Cost ($)</Label>
                <Input type="number" value={newHolding.investmentCost || ""} onChange={(e) => updateNewHoldingField("investmentCost", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fund FMV ($)</Label>
                <Input type="number" value={newHolding.fmv || ""} onChange={(e) => updateNewHoldingField("fmv", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">MOIC</Label>
                <Input value={newHolding.moic} onChange={(e) => updateNewHoldingField("moic", e.target.value)} placeholder="1.00x" />
              </div>
              <div className="space-y-1.5 col-span-2 grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">TWH % (auto)</Label>
                  <Input value={newHolding.twhPercent} disabled className="bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">TWH Cost (auto)</Label>
                  <Input value={newHolding.twhCost ? formatCurrency(newHolding.twhCost, true) : "$0"} disabled className="bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">TWH FMV (auto)</Label>
                  <Input value={newHolding.twhFMV ? formatCurrency(newHolding.twhFMV, true) : "$0"} disabled className="bg-muted" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={addHolding}>Add Holding</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Companies</p>
          <p className="text-2xl font-semibold font-mono text-foreground">{filtered.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">TWH Cost</p>
          <p className="text-2xl font-semibold font-mono text-foreground">{formatCurrency(totalCost, true)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">TWH FMV</p>
          <p className={cn("text-2xl font-semibold font-mono", totalFMV >= totalCost ? "text-positive" : "text-negative")}>
            {formatCurrency(totalFMV, true)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Active / Write-off</p>
          <p className="text-2xl font-semibold font-mono text-foreground">
            {activeCount} <span className="text-sm text-muted-foreground">/ {writeOffCount}</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies or funds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFundFilter("all")}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md border transition-colors",
              fundFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50"
            )}
          >
            All Funds
          </button>
          {funds.map((f) => (
            <button
              key={f}
              onClick={() => setFundFilter(f)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border transition-colors",
                fundFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-8"></th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company</th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund</th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Round</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund Cost</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fund FMV</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">MOIC</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH %</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH Cost</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">TWH FMV</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, i) => {
              const realIdx = getPortfolioIndex(i);
              const isEditing = editingIndex === realIdx;
              const row = isEditing && editData ? editData : h;
              const moicVal = parseFloat(row.moic.replace("x", ""));

              return (
                <tr key={i} className={cn("border-b border-border/50", isEditing ? "bg-accent/30" : "table-row-hover")}>
                  <td className="p-2 text-center">
                    {isEditing ? (
                      <div className="flex gap-0.5">
                        <button onClick={saveEdit} className="p-1 rounded hover:bg-positive/20 text-positive" title="Save">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={cancelEdit} className="p-1 rounded hover:bg-negative/20 text-negative" title="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <EditableCell value={row.company} onChange={(v) => updateField("company", v)} className="min-w-[120px]" />
                    ) : (
                      <span className="font-medium text-foreground">{row.company}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Select value={row.fund} onValueChange={(v) => updateField("fund", v)}>
                        <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FUND_NAMES.map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{row.fund}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Select value={row.status} onValueChange={(v) => updateField("status", v)}>
                        <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Write-off">Write-off</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                        row.status === "Active" ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
                      )}>
                        {row.status}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <Select value={row.round} onValueChange={(v) => updateField("round", v)}>
                        <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROUND_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {row.round}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <EditableCell value={row.investmentCost} onChange={(v) => updateField("investmentCost", v)} type="number" className="text-right" />
                    ) : (
                      <span className="font-mono text-muted-foreground">{formatCurrency(row.investmentCost, true)}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <EditableCell value={row.fmv} onChange={(v) => updateField("fmv", v)} type="number" className="text-right" />
                    ) : (
                      <span className="font-mono text-foreground">{formatCurrency(row.fmv, true)}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <EditableCell value={row.moic} onChange={(v) => updateField("moic", v)} className="text-right" />
                    ) : (
                      <span className={cn("font-mono font-medium", moicVal >= 1 ? "text-positive" : "text-negative")}>
                        {row.moic}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-mono text-muted-foreground">{row.twhPercent}</span>
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-mono text-muted-foreground">{formatCurrency(row.twhCost, true)}</span>
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-mono text-foreground">{formatCurrency(row.twhFMV, true)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UnderlyingPortfolioTab;
