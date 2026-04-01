import { useState, useMemo } from "react";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useFunds, useUnderlyingPortfolio, useDirectInvestments, useDirectValuations } from "@/hooks/usePortfolioData";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { formatCurrency, formatMultiple } from "@/lib/calcEngine";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Building2, Target, Sparkles, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────

function statusBadge(moic: number) {
  if (moic >= 1) return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Performing</Badge>;
  if (moic >= 0.8) return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">Watch</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Write-off</Badge>;
}

function StatPill({ label, value, icon: Icon }: { label: string; value: string | number; icon?: any }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold font-mono text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Fund Card ────────────────────────────────────────────────────────

function FundCard({ fund, holdings }: { fund: any; holdings: any[] }) {
  const [notes, setNotes] = useState("");
  const fundHoldings = holdings.filter(h => h.fund_id === fund.id);
  const twhCost = fundHoldings.reduce((s: number, h: any) => s + Number(h.twh_cost || 0), 0);
  const twhFmv = fundHoldings.reduce((s: number, h: any) => s + Number(h.twh_fmv || 0), 0);
  const moic = twhCost > 0 ? twhFmv / twhCost : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{fund.fund_name}</h3>
          <p className="text-[11px] text-muted-foreground">
            {[fund.vintage_year && `Vintage ${fund.vintage_year}`, fund.strategy].filter(Boolean).join(" · ")}
          </p>
        </div>
        {statusBadge(moic)}
      </div>

      <div className="flex gap-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">TWH Cost</p>
          <p className="text-xs font-mono font-medium text-foreground">{formatCurrency(twhCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">FMV</p>
          <p className="text-xs font-mono font-medium text-foreground">{formatCurrency(twhFmv)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">MOIC</p>
          <p className="text-xs font-mono font-medium text-foreground">{formatMultiple(moic)}</p>
        </div>
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Add quarterly notes…"
        className="w-full bg-transparent border-0 border-b border-border/50 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 py-1 min-h-[28px]"
        rows={1}
      />
    </div>
  );
}

// ─── Company Row ──────────────────────────────────────────────────────

function CompanyRow({ company }: { company: any }) {
  const [notes, setNotes] = useState("");
  const moic = Number(company.twh_cost) > 0 ? Number(company.twh_fmv) / Number(company.twh_cost) : 0;
  const types = (company.type || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const themes = (company.theme || "").split(",").map((s: string) => s.trim()).filter(Boolean);

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground">{company.company_name}</span>
          {types.map((t: string) => (
            <Badge key={t} variant="outline" className="text-[9px] px-1.5 py-0 h-4">{t}</Badge>
          ))}
          {themes.slice(0, 1).map((t: string) => (
            <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{t}</Badge>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes…"
          className="w-full bg-transparent border-0 text-[11px] text-muted-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none mt-0.5 py-0 min-h-[16px]"
          rows={1}
        />
      </div>
      <span className="text-xs font-mono text-foreground shrink-0">{formatMultiple(moic)}</span>
    </div>
  );
}

// ─── Company Group ────────────────────────────────────────────────────

function CompanyGroup({ title, companies, icon: Icon, accentClass, defaultOpen = false }: {
  title: string; companies: any[]; icon: any; accentClass?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (companies.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-accent/30 transition-colors", accentClass)}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{title}</span>
          <Badge variant="outline" className="ml-auto text-[10px] h-5">{companies.length}</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 border-l border-border/50 mt-1">
          {companies.map(c => <CompanyRow key={c.id} company={c} />)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const { selectedQuarter, availableQuarters } = useQuarterContext();
  const { data: funds = [] } = useFunds();
  const { data: holdings = [] } = useUnderlyingPortfolio(selectedQuarter.date);
  const { data: directs = [] } = useDirectInvestments();
  const { data: directVals = [] } = useDirectValuations(selectedQuarter.date);

  // Find prior quarter
  const priorQuarter = useMemo(() => {
    const idx = availableQuarters.findIndex(q => q.date === selectedQuarter.date);
    return idx > 0 ? availableQuarters[idx - 1] : null;
  }, [availableQuarters, selectedQuarter.date]);

  // Fetch prior quarter holdings for "new this quarter" detection
  const { data: priorHoldings = [] } = useUnderlyingPortfolio(priorQuarter?.date || null);

  const priorCompanyNames = useMemo(() => new Set(priorHoldings.map((h: any) => h.company_name)), [priorHoldings]);

  // Classify companies
  const { active, newThisQuarter, writeOffs } = useMemo(() => {
    const active: any[] = [];
    const newThisQ: any[] = [];
    const wo: any[] = [];

    for (const h of holdings) {
      const status = (h.notes || "").toLowerCase();
      const isWriteOff = status.includes("write-off") || status.includes("writeoff") || Number(h.twh_fmv) === 0 && Number(h.twh_cost) > 0;

      if (isWriteOff) {
        wo.push(h);
      } else if (priorHoldings.length > 0 && !priorCompanyNames.has(h.company_name)) {
        newThisQ.push(h);
      } else {
        active.push(h);
      }
    }
    return { active, newThisQuarter: newThisQ, writeOffs: wo };
  }, [holdings, priorHoldings, priorCompanyNames]);

  // Portfolio MOIC for directs
  const portfolioMoic = useMemo(() => {
    const totalCost = directs.reduce((s, d) => s + Number(d.cost_basis || 0), 0);
    const totalVal = directVals.reduce((s, v) => s + Number(v.current_valuation || 0), 0);
    return totalCost > 0 ? totalVal / totalCost : 0;
  }, [directs, directVals]);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">{selectedQuarter.quarter} Highlights</h1>
        <p className="text-xs text-muted-foreground">Quarterly portfolio digest</p>
      </div>

      {/* Summary Strip */}
      <div className="flex flex-wrap gap-3">
        <StatPill label="Active Companies" value={active.length + newThisQuarter.length} icon={Building2} />
        <StatPill label="New This Quarter" value={newThisQuarter.length} icon={Sparkles} />
        <StatPill label="Write-offs" value={writeOffs.length} icon={AlertTriangle} />
        <StatPill label="Portfolio MOIC" value={formatMultiple(portfolioMoic)} icon={TrendingUp} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="funds" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="funds" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">
            Funds ({funds.length})
          </TabsTrigger>
          <TabsTrigger value="companies" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">
            Companies ({holdings.length})
          </TabsTrigger>
        </TabsList>

        {/* Funds Tab */}
        <TabsContent value="funds">
          <div className="grid gap-3 md:grid-cols-2">
            {funds.map(fund => (
              <FundCard key={fund.id} fund={fund} holdings={holdings} />
            ))}
          </div>
        </TabsContent>

        {/* Companies Tab */}
        <TabsContent value="companies">
          <div className="rounded-lg border border-border bg-card space-y-1 p-2">
            <CompanyGroup
              title="New This Quarter"
              companies={newThisQuarter}
              icon={Sparkles}
              accentClass="text-emerald-400"
              defaultOpen={true}
            />
            <CompanyGroup
              title="Active"
              companies={active}
              icon={Building2}
              defaultOpen={false}
            />
            <CompanyGroup
              title="Write-offs"
              companies={writeOffs}
              icon={AlertTriangle}
              accentClass="text-red-400"
              defaultOpen={false}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
