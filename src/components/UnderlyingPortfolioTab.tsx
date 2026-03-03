import { useState, useCallback } from "react";
import { underlyingPortfolio as initialPortfolio, formatCurrency, UnderlyingHolding } from "@/data/portfolioData";
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
    const numFields: (keyof UnderlyingHolding)[] = ["investmentCost", "fmv", "proceeds", "twhCost", "twhFMV"];
    if (numFields.includes(field)) {
      setEditData({ ...editData, [field]: parseFloat(value) || 0 });
    } else {
      setEditData({ ...editData, [field]: value });
    }
  };

  const addHolding = () => {
    if (!newHolding.company.trim() || !newHolding.fund.trim()) {
      toast.error("Company and Fund are required");
      return;
    }
    setPortfolio([...portfolio, { ...newHolding }]);
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
                <Input value={newHolding.company} onChange={(e) => setNewHolding({ ...newHolding, company: e.target.value })} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fund *</Label>
                <Input value={newHolding.fund} onChange={(e) => setNewHolding({ ...newHolding, fund: e.target.value })} placeholder="Fund name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={newHolding.status} onValueChange={(v) => setNewHolding({ ...newHolding, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Write-off">Write-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Round</Label>
                <Input value={newHolding.round} onChange={(e) => setNewHolding({ ...newHolding, round: e.target.value })} placeholder="e.g. Seed" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fund Cost ($)</Label>
                <Input type="number" value={newHolding.investmentCost || ""} onChange={(e) => setNewHolding({ ...newHolding, investmentCost: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fund FMV ($)</Label>
                <Input type="number" value={newHolding.fmv || ""} onChange={(e) => setNewHolding({ ...newHolding, fmv: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">MOIC</Label>
                <Input value={newHolding.moic} onChange={(e) => setNewHolding({ ...newHolding, moic: e.target.value })} placeholder="1.00x" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">TWH %</Label>
                <Input value={newHolding.twhPercent} onChange={(e) => setNewHolding({ ...newHolding, twhPercent: e.target.value })} placeholder="0.00%" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">TWH Cost ($)</Label>
                <Input type="number" value={newHolding.twhCost || ""} onChange={(e) => setNewHolding({ ...newHolding, twhCost: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">TWH FMV ($)</Label>
                <Input type="number" value={newHolding.twhFMV || ""} onChange={(e) => setNewHolding({ ...newHolding, twhFMV: parseFloat(e.target.value) || 0 })} />
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
                      <EditableCell value={row.fund} onChange={(v) => updateField("fund", v)} />
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
                      <EditableCell value={row.round} onChange={(v) => updateField("round", v)} />
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
                    {isEditing ? (
                      <EditableCell value={row.twhPercent} onChange={(v) => updateField("twhPercent", v)} className="text-right" />
                    ) : (
                      <span className="font-mono text-muted-foreground">{row.twhPercent}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <EditableCell value={row.twhCost} onChange={(v) => updateField("twhCost", v)} type="number" className="text-right" />
                    ) : (
                      <span className="font-mono text-muted-foreground">{formatCurrency(row.twhCost, true)}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <EditableCell value={row.twhFMV} onChange={(v) => updateField("twhFMV", v)} type="number" className="text-right" />
                    ) : (
                      <span className="font-mono text-foreground">{formatCurrency(row.twhFMV, true)}</span>
                    )}
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
