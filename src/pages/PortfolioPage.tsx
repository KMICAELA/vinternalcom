import { useMemo, useState } from "react";
import { useActiveQuarter, useUnderlyingPortfolio } from "@/hooks/usePortfolioData";
import { portfolioCommentsSeed, type PortfolioComment } from "@/data/portfolioComments";
import { formatCurrency, formatMultiple } from "@/lib/calcEngine";
import { Search, LayoutGrid, List, X, Download } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function PortfolioPage() {
  const activeQuarter = useActiveQuarter();
  const { data: holdings = [] } = useUnderlyingPortfolio(activeQuarter.date);

  // Fetch funds for ID→name mapping
  const { data: funds = [] } = useQuery({
    queryKey: ["funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funds").select("id, fund_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Also fetch transactions which carry fund_name as a string for holdings without fund_id
  const { data: transactions = [] } = useQuery({
    queryKey: ["underlying-transactions", activeQuarter.date],
    queryFn: async () => {
      if (!activeQuarter.date) return [];
      const { data, error } = await supabase
        .from("underlying_portfolio_transactions")
        .select("company_name, fund_name")
        .eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState("");
  const [innovationFilter, setInnovationFilter] = useState("");
  const [themeFilter, setThemeFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  // Merge comments with financial data
  const companies = useMemo(() => {
    const fundMap = new Map<string, string>();
    for (const f of funds) {
      fundMap.set(f.id, f.fund_name);
    }

    // Company→fund_name from transactions
    const txFundMap = new Map<string, string>();
    for (const t of transactions) {
      txFundMap.set(t.company_name.toLowerCase(), t.fund_name);
    }

    const commentMap = new Map<string, PortfolioComment>();
    for (const c of portfolioCommentsSeed) {
      commentMap.set(c.company.toLowerCase(), c);
    }

    const holdingMap = new Map<string, boolean>();
    for (const h of holdings) {
      holdingMap.set(h.company_name.toLowerCase(), true);
    }

    const result = holdings.map((h: any) => {
      const comment = commentMap.get(h.company_name.toLowerCase());
      // Resolve fund name: fund_id lookup → transactions lookup → fallback
      let fundName = "—";
      if (h.fund_id && fundMap.has(h.fund_id)) {
        fundName = fundMap.get(h.fund_id)!;
      } else if (txFundMap.has(h.company_name.toLowerCase())) {
        fundName = txFundMap.get(h.company_name.toLowerCase())!;
      }
      const moic = h.twh_cost > 0 ? h.twh_fmv / h.twh_cost : 0;

      return {
        company: h.company_name,
        fund: fundName,
        status: h.type || "Active",
        region: comment?.region || h.region || null,
        innovation: comment?.type || null,
        theme: comment?.theme || null,
        stage: comment?.stage || null,
        whatTheyDo: comment?.whatTheyDo || null,
        targetMarket: comment?.targetMarket || null,
        tailwinds: comment?.tailwinds || null,
        challenges: comment?.challenges || null,
        twhCost: h.twh_cost || 0,
        twhFmv: h.twh_fmv || 0,
        moic,
      };
    });

    // Add comments for companies not in holdings
    for (const c of portfolioCommentsSeed) {
      if (!holdingMap.has(c.company.toLowerCase())) {
        result.push({
          company: c.company,
          fund: txFundMap.get(c.company.toLowerCase()) || "—",
          status: "Active",
          region: c.region,
          innovation: c.type,
          theme: c.theme,
          stage: c.stage,
          whatTheyDo: c.whatTheyDo,
          targetMarket: c.targetMarket,
          tailwinds: c.tailwinds,
          challenges: c.challenges,
          twhCost: 0,
          twhFmv: 0,
          moic: 0,
        });
      }
    }

    return result.sort((a, b) => a.company.localeCompare(b.company));
  }, [holdings, funds, transactions]);

  // Extract unique filter values
  const uniqueFunds = useMemo(() => [...new Set(companies.map(c => c.fund).filter(f => f && f !== "—"))].sort(), [companies]);
  const uniqueInnovations = useMemo(() => [...new Set(companies.map(c => c.innovation).filter(Boolean))].sort() as string[], [companies]);
  const uniqueThemes = useMemo(() => [...new Set(companies.map(c => c.theme).filter(Boolean))].sort() as string[], [companies]);
  const uniqueStages = useMemo(() => [...new Set(companies.map(c => c.stage).filter(Boolean))].sort() as string[], [companies]);
  const uniqueStatuses = useMemo(() => [...new Set(companies.map(c => c.status).filter(Boolean))].sort() as string[], [companies]);

  // Filter
  const filtered = useMemo(() => {
    return companies.filter(c => {
      if (search && !c.company.toLowerCase().includes(search.toLowerCase())) return false;
      if (fundFilter && c.fund !== fundFilter) return false;
      if (innovationFilter && c.innovation !== innovationFilter) return false;
      if (themeFilter && c.theme !== themeFilter) return false;
      if (stageFilter && c.stage !== stageFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [companies, search, fundFilter, innovationFilter, themeFilter, stageFilter, statusFilter]);

  const hasActiveFilters = fundFilter || innovationFilter || themeFilter || stageFilter || statusFilter;

  const clearFilters = () => {
    setFundFilter("");
    setInnovationFilter("");
    setThemeFilter("");
    setStageFilter("");
    setStatusFilter("");
    setSearch("");
  };

  const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === "exit") return "bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))]";
    if (s === "write-off") return "bg-[hsl(var(--negative))]/20 text-[hsl(var(--negative))]";
    return "bg-[hsl(var(--info))]/20 text-[hsl(var(--info))]";
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Portfolio Companies</h1>
          <p className="text-sm text-muted-foreground">Company intelligence database · {filtered.length} companies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = filtered.map(c => ({
                Company: c.company,
                Fund: c.fund,
                Status: c.status,
                Region: c.region || "",
                Innovation: c.innovation || "",
                Theme: c.theme || "",
                Stage: c.stage || "",
                "What They Do": c.whatTheyDo || "",
                "Target Market": c.targetMarket || "",
                Tailwinds: c.tailwinds || "",
                Challenges: c.challenges || "",
                "TWH Cost": c.twhCost,
                "TWH FMV": c.twhFmv,
                MOIC: c.moic,
              }));
              exportToExcel(rows, `Portfolio_Companies_${activeQuarter.quarter}`);
            }}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
            <button
              onClick={() => setViewMode("card")}
              className={cn("p-1.5 rounded", viewMode === "card" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn("p-1.5 rounded", viewMode === "table" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <FilterSelect label="Fund" value={fundFilter} onChange={setFundFilter} options={uniqueFunds} />
        <FilterSelect label="Innovation" value={innovationFilter} onChange={setInnovationFilter} options={uniqueInnovations.length > 0 ? uniqueInnovations : ["Deep Tech", "Tech Based", "Tech Enabled"]} />
        <FilterSelect label="Theme" value={themeFilter} onChange={setThemeFilter} options={uniqueThemes} />
        <FilterSelect label="Stage" value={stageFilter} onChange={setStageFilter} options={uniqueStages.length > 0 ? uniqueStages : ["Pre-Seed", "Seed", "A", "B", "C+"]} />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={uniqueStatuses} />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Card View */}
      {viewMode === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, idx) => (
            <div key={`${c.company}-${c.fund}-${idx}`} className="border border-border rounded-lg bg-card p-4 flex flex-col gap-3">
              {/* Header */}
              <div>
                <h3 className="text-sm font-semibold text-foreground leading-tight">{c.company}</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">{c.fund}</p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusColor(c.status))}>
                  {c.status}
                </span>
                {c.region && <Tag>{c.region}</Tag>}
                {c.innovation && <Tag>{c.innovation}</Tag>}
                {c.theme && <Tag>{c.theme}</Tag>}
                {c.stage && <Tag>{c.stage}</Tag>}
              </div>

              {/* Commentary */}
              <div className="space-y-2 flex-1">
                {c.whatTheyDo && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">What they do</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{c.whatTheyDo}</p>
                  </div>
                )}
                {c.targetMarket && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Target market</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{c.targetMarket}</p>
                  </div>
                )}
                {c.tailwinds && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Tailwinds</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{c.tailwinds}</p>
                  </div>
                )}
                {c.challenges && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Challenges</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{c.challenges}</p>
                  </div>
                )}
              </div>

              {/* Financial strip */}
              <div className="border-t border-border pt-2 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">TWH Cost</p>
                  <p className="text-xs font-mono font-medium">{c.twhCost > 0 ? formatCurrency(c.twhCost) : "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">TWH FMV</p>
                  <p className="text-xs font-mono font-medium">{c.twhFmv > 0 ? formatCurrency(c.twhFmv) : "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">MOIC</p>
                  <p className="text-xs font-mono font-medium">{c.moic > 0 ? formatMultiple(c.moic) : "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-1 text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Company</th>
                  <th className="text-left px-4 py-2 font-medium">Fund</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Innovation</th>
                  <th className="text-left px-4 py-2 font-medium">What they do</th>
                  <th className="text-right px-4 py-2 font-medium">TWH Cost</th>
                  <th className="text-right px-4 py-2 font-medium">TWH FMV</th>
                  <th className="text-right px-4 py-2 font-medium">MOIC</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <tr key={`${c.company}-${c.fund}-${idx}`} className="border-t border-border table-row-hover">
                    <td className="px-4 py-2 font-medium text-foreground">{c.company}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[150px] truncate">{c.fund}</td>
                    <td className="px-4 py-2">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusColor(c.status))}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.innovation || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[300px] truncate">{c.whatTheyDo || "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.twhCost > 0 ? formatCurrency(c.twhCost) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.twhFmv > 0 ? formatCurrency(c.twhFmv) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.moic > 0 ? formatMultiple(c.moic) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  if (options.length === 0) return null;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
      {children}
    </span>
  );
}
