import { useState } from "react";
import { portfolioComments } from "@/data/portfolioData";
import { cn } from "@/lib/utils";
import SectionHeader from "@/components/SectionHeader";
import { Input } from "@/components/ui/input";
import { Search, Building2, Users, TrendingUp, AlertTriangle } from "lucide-react";

const PortfolioCommentsTab = () => {
  const [search, setSearch] = useState("");

  const filtered = portfolioComments.filter((c) =>
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="Portfolio Commentary" subtitle="Qualitative analysis of portfolio companies" />

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border"
        />
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} companies</p>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((c, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-5 space-y-4 hover:border-primary/30 transition-colors"
          >
            {/* Company name */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">{c.company}</h3>
            </div>

            {/* Description */}
            <p className="text-sm text-secondary-foreground leading-relaxed">{c.description}</p>

            {/* Target Market */}
            {c.targetMarket && (
              <div className="flex items-start gap-2">
                <Users className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Target Market</p>
                  <p className="text-sm text-secondary-foreground">{c.targetMarket}</p>
                </div>
              </div>
            )}

            {/* Tailwinds & Challenges */}
            {(c.tailwinds || c.challenges) && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                {c.tailwinds && (
                  <div className="flex items-start gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-positive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-positive mb-0.5">Tailwinds</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{c.tailwinds}</p>
                    </div>
                  </div>
                )}
                {c.challenges && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-warning mb-0.5">Challenges</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{c.challenges}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PortfolioCommentsTab;
