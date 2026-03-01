import { useState } from "react";
import { underlyingPortfolio, formatCurrency } from "@/data/portfolioData";
import { cn } from "@/lib/utils";
import SectionHeader from "@/components/SectionHeader";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const UnderlyingPortfolioTab = () => {
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>("all");

  const funds = [...new Set(underlyingPortfolio.map((h) => h.fund))];

  const filtered = underlyingPortfolio.filter((h) => {
    const matchSearch = h.company.toLowerCase().includes(search.toLowerCase()) ||
      h.fund.toLowerCase().includes(search.toLowerCase());
    const matchFund = fundFilter === "all" || h.fund === fundFilter;
    return matchSearch && matchFund;
  });

  // Summary stats
  const totalCost = filtered.reduce((s, h) => s + h.twhCost, 0);
  const totalFMV = filtered.reduce((s, h) => s + h.twhFMV, 0);
  const activeCount = filtered.filter((h) => h.status === "Active").length;
  const writeOffCount = filtered.filter((h) => h.status === "Write-off").length;

  return (
    <div className="space-y-6">
      <SectionHeader title="Underlying Portfolio" subtitle="All companies across fund investments" />

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
              const moicVal = parseFloat(h.moic.replace("x", ""));
              return (
                <tr key={i} className="table-row-hover border-b border-border/50">
                  <td className="p-3 font-medium text-foreground">{h.company}</td>
                  <td className="p-3 text-muted-foreground">{h.fund}</td>
                  <td className="p-3">
                    <span className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      h.status === "Active" ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
                    )}>
                      {h.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {h.round}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(h.investmentCost, true)}</td>
                  <td className="p-3 text-right font-mono text-foreground">{formatCurrency(h.fmv, true)}</td>
                  <td className={cn("p-3 text-right font-mono font-medium", moicVal >= 1 ? "text-positive" : "text-negative")}>
                    {h.moic}
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground">{h.twhPercent}</td>
                  <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(h.twhCost, true)}</td>
                  <td className="p-3 text-right font-mono text-foreground">{formatCurrency(h.twhFMV, true)}</td>
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
