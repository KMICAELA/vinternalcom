import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, X, ExternalLink } from "lucide-react";
import { fmtUSD, fmtMultiple } from "@/lib/format";

type Company = {
  id: string;
  legal_name: string;
  commercial_name: string | null;
  url: string | null;
  status: string | null;
  region: string[] | null;
  type: string[] | null;
  theme: string[] | null;
  industry: string[] | null;
  sub_industry: string[] | null;
  notes: string | null;
};

type Metrics = {
  twh_cost: number;
  twh_fmv: number;
  twh_proceeds: number;
  inv_cost: number;
  inv_fmv: number;
  inv_proceeds: number;
  is_direct: boolean;
};

const ALL = "__all__";
const OTHER = "__other__";
const UNCLASSIFIED = "Unclassified";
const DIRECT_LABEL = "1200VC";
const INNOVATION_TYPES = ["Deep Tech", "Tech Based", "Tech Enabled"] as const;
const TOP_N_INDUSTRIES = 10;

const moic = (cost: number, fmv: number, proceeds: number) =>
  cost > 0 ? (fmv + proceeds) / cost : null;

export default function PortfolioPage() {
  const { selected: quarter } = useSelectedQuarter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [metrics, setMetrics] = useState<Map<string, Metrics>>(new Map());
  const [companyFunds, setCompanyFunds] = useState<Map<string, Set<string>>>(new Map());
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>(ALL);
  const [industryFilter, setIndustryFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);

  const [searchParams, setSearchParams] = useSearchParams();
  const focusCompanyId = searchParams.get("company");
  const clearFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("company");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [companiesRes, fundsRes, directsRes, directSnapsRes, underlyingRes] =
        await Promise.all([
          supabase.from("companies").select("*").order("legal_name"),
          supabase.from("funds").select("id, name, short_name"),
          supabase.from("directs").select("id, company_id, twh_cost_usd"),
          quarter
            ? supabase
                .from("direct_quarter_snapshots")
                .select("direct_id, twh_fmv_usd, twh_proceeds_usd")
                .eq("quarter_id", quarter.id)
            : Promise.resolve({ data: [], error: null }),
          quarter
            ? supabase
                .from("underlying_holdings")
                .select(
                  "company_id, fund_id, twh_cost_usd, twh_fmv_usd, twh_proceeds_usd, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd",
                )
                .eq("quarter_id", quarter.id)
                .is("removed_at", null)
            : Promise.resolve({ data: [], error: null }),
        ]);
      if (cancelled) return;
      if (companiesRes.error) {
        toast.error("Failed to load companies");
        setLoading(false);
        return;
      }

      const fundLabelById = new Map<string, string>();
      (fundsRes.data ?? []).forEach((f: any) =>
        fundLabelById.set(f.id, f.short_name || f.name),
      );

      const directIdToCompany = new Map<string, string>();
      const directCostByCompany = new Map<string, number>();
      (directsRes.data ?? []).forEach((d: any) => {
        directIdToCompany.set(d.id, d.company_id);
        directCostByCompany.set(
          d.company_id,
          (directCostByCompany.get(d.company_id) ?? 0) + (Number(d.twh_cost_usd) || 0),
        );
      });

      const ids = new Set<string>();
      const cFunds = new Map<string, Set<string>>();
      const m = new Map<string, Metrics>();
      const ensureFunds = (cid: string) => {
        let s = cFunds.get(cid);
        if (!s) {
          s = new Set<string>();
          cFunds.set(cid, s);
        }
        return s;
      };
      const ensureMetrics = (cid: string): Metrics => {
        let v = m.get(cid);
        if (!v) {
          v = {
            twh_cost: 0,
            twh_fmv: 0,
            twh_proceeds: 0,
            inv_cost: 0,
            inv_fmv: 0,
            inv_proceeds: 0,
            is_direct: false,
          };
          m.set(cid, v);
        }
        return v;
      };

      (directSnapsRes.data ?? []).forEach((s: any) => {
        const cid = directIdToCompany.get(s.direct_id);
        if (!cid) return;
        ids.add(cid);
        ensureFunds(cid).add(DIRECT_LABEL);
        const v = ensureMetrics(cid);
        v.is_direct = true;
        v.twh_fmv += Number(s.twh_fmv_usd) || 0;
        v.twh_proceeds += Number(s.twh_proceeds_usd) || 0;
      });
      // add direct cost (from directs table) only for companies that have a snapshot in this quarter
      ids.forEach((cid) => {
        const cost = directCostByCompany.get(cid);
        if (cost) ensureMetrics(cid).twh_cost += cost;
      });

      (underlyingRes.data ?? []).forEach((u: any) => {
        if (!u.company_id) return;
        ids.add(u.company_id);
        const label = fundLabelById.get(u.fund_id);
        if (label) ensureFunds(u.company_id).add(label);
        const v = ensureMetrics(u.company_id);
        v.twh_cost += Number(u.twh_cost_usd) || 0;
        v.twh_fmv += Number(u.twh_fmv_usd) || 0;
        v.twh_proceeds += Number(u.twh_proceeds_usd) || 0;
        v.inv_cost += Number(u.fund_cost_usd) || 0;
        v.inv_fmv += Number(u.fund_fmv_usd) || 0;
        v.inv_proceeds += Number(u.fund_proceeds_usd) || 0;
      });

      setActiveIds(ids);
      setCompanyFunds(cFunds);
      setMetrics(m);
      setCompanies((companiesRes.data ?? []) as Company[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [quarter?.id]);

  const activeCompanies = useMemo(
    () => companies.filter((c) => activeIds.has(c.id)),
    [companies, activeIds],
  );

  const fundOptions = useMemo(() => {
    const s = new Set<string>();
    activeCompanies.forEach((c) => companyFunds.get(c.id)?.forEach((l) => s.add(l)));
    const all = Array.from(s);
    const direct = all.includes(DIRECT_LABEL) ? [DIRECT_LABEL] : [];
    const rest = all.filter((l) => l !== DIRECT_LABEL).sort();
    return [...direct, ...rest];
  }, [activeCompanies, companyFunds]);

  const { topIndustries, industrySet } = useMemo(() => {
    const counts = new Map<string, number>();
    activeCompanies.forEach((c) => {
      const seen = new Set<string>();
      (c.industry ?? []).forEach((i) => {
        const k = i.trim();
        if (!k || seen.has(k)) return;
        seen.add(k);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      });
    });
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, TOP_N_INDUSTRIES).map(([n]) => n);
    return { topIndustries: top, industrySet: new Set(top) };
  }, [activeCompanies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCompanies.filter((c) => {
      if (fundFilter !== ALL) {
        const set = companyFunds.get(c.id);
        if (!set || !set.has(fundFilter)) return false;
      }
      if (industryFilter !== ALL) {
        const inds = (c.industry ?? []).map((s) => s.trim()).filter(Boolean);
        if (industryFilter === OTHER) {
          if (inds.length === 0) return false;
          if (inds.some((i) => industrySet.has(i))) return false;
        } else if (!inds.includes(industryFilter)) return false;
      }
      if (typeFilter !== ALL) {
        const types = (c.type ?? []).map((s) => s.trim()).filter(Boolean);
        if (typeFilter === UNCLASSIFIED) {
          if (types.length > 0) return false;
        } else if (!types.includes(typeFilter)) return false;
      }
      if (!q) return true;
      const hay = [
        c.legal_name,
        c.commercial_name,
        c.url,
        c.status,
        c.notes,
        ...(c.theme ?? []),
        ...(c.industry ?? []),
        ...(c.sub_industry ?? []),
        ...(c.region ?? []),
        ...(c.type ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeCompanies, search, fundFilter, industryFilter, typeFilter, companyFunds, industrySet]);

  const displayed = useMemo(() => {
    if (!focusCompanyId) return filtered;
    const match = companies.find((c) => c.id === focusCompanyId);
    return match ? [match] : filtered;
  }, [filtered, focusCompanyId, companies]);

  // Totals
  const totals = useMemo(() => {
    const t = { twh_cost: 0, twh_fmv: 0, twh_proceeds: 0, inv_cost: 0, inv_fmv: 0, inv_proceeds: 0 };
    displayed.forEach((c) => {
      const m = metrics.get(c.id);
      if (!m) return;
      t.twh_cost += m.twh_cost;
      t.twh_fmv += m.twh_fmv;
      t.twh_proceeds += m.twh_proceeds;
      t.inv_cost += m.inv_cost;
      t.inv_fmv += m.inv_fmv;
      t.inv_proceeds += m.inv_proceeds;
    });
    return t;
  }, [displayed, metrics]);

  const joinList = (arr?: string[] | null) => (arr && arr.length ? arr.join(", ") : "—");

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company-by-company inventory — TWH and fund-level cost, FMV, proceeds, and MOIC.
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <div>{displayed.length} of {activeCompanies.length} active companies</div>
          {quarter && <div className="mt-0.5">{quarter.label}</div>}
        </div>
      </div>

      {focusCompanyId && (
        <Card className="p-3 bg-card border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing a single company linked from another page.
          </div>
          <Button variant="ghost" size="sm" onClick={clearFocus} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" /> Show all companies
          </Button>
        </Card>
      )}

      <Card className="p-4 bg-card border-border">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, industry, region…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={fundFilter} onValueChange={setFundFilter}>
            <SelectTrigger><SelectValue placeholder="Fund" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All funds</SelectItem>
              {fundOptions.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger><SelectValue placeholder="Industry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All industries</SelectItem>
              {topIndustries.map((i) => (<SelectItem key={i} value={i}>{i}</SelectItem>))}
              <SelectItem value={OTHER}>Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="Innovation type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {INNOVATION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 bg-card border-border text-center text-sm text-muted-foreground">Loading…</Card>
      ) : displayed.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-sm text-muted-foreground">No companies match your filters.</Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="min-w-[180px]">Company</TableHead>
                  <TableHead className="min-w-[140px]">Commercial</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead className="min-w-[200px]">Company Industry</TableHead>
                  <TableHead className="min-w-[200px]">Target Industry</TableHead>
                  <TableHead className="text-right">TWH Cost</TableHead>
                  <TableHead className="text-right">TWH FMV</TableHead>
                  <TableHead className="text-right">TWH Proceeds</TableHead>
                  <TableHead className="text-right">TWH MOIC</TableHead>
                  <TableHead className="text-right">Inv. Cost</TableHead>
                  <TableHead className="text-right">FMV</TableHead>
                  <TableHead className="text-right">Proceeds</TableHead>
                  <TableHead className="text-right">MOIC</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map((c) => {
                  const m = metrics.get(c.id);
                  const twh_moic = m ? moic(m.twh_cost, m.twh_fmv, m.twh_proceeds) : null;
                  const inv_moic = m ? moic(m.inv_cost, m.inv_fmv, m.inv_proceeds) : null;
                  const isDirect = m?.is_direct;
                  return (
                    <TableRow key={c.id} className={c.id === focusCompanyId ? "bg-primary/10" : ""}>
                      <TableCell className="font-medium text-foreground">{c.legal_name}</TableCell>
                      <TableCell>{c.commercial_name || "—"}</TableCell>
                      <TableCell>
                        {c.url ? (
                          <a
                            href={c.url.startsWith("http") ? c.url : `https://${c.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {c.url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 28)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{c.status || "—"}</TableCell>
                      <TableCell className="text-xs">{joinList(c.region)}</TableCell>
                      <TableCell className="text-xs">{joinList(c.type)}</TableCell>
                      <TableCell className="text-xs">{joinList(c.theme)}</TableCell>
                      <TableCell className="text-xs">{joinList(c.industry)}</TableCell>
                      <TableCell className="text-xs">{joinList(c.sub_industry)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m ? fmtUSD(m.twh_cost) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{m ? fmtUSD(m.twh_fmv) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{m ? fmtUSD(m.twh_proceeds) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMultiple(twh_moic)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {isDirect ? "—" : m ? fmtUSD(m.inv_cost) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {isDirect ? "—" : m ? fmtUSD(m.inv_fmv) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {isDirect ? "—" : m ? fmtUSD(m.inv_proceeds) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {isDirect ? "—" : fmtMultiple(inv_moic)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={c.notes || ""}>
                        {c.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  <TableCell colSpan={9} className="text-right">Total ({displayed.length})</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(totals.twh_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(totals.twh_fmv)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(totals.twh_proceeds)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMultiple(moic(totals.twh_cost, totals.twh_fmv, totals.twh_proceeds))}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(totals.inv_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(totals.inv_fmv)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(totals.inv_proceeds)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMultiple(moic(totals.inv_cost, totals.inv_fmv, totals.inv_proceeds))}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
