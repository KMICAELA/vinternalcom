import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ExternalLink, Search, Globe, X } from "lucide-react";

type Company = {
  id: string;
  legal_name: string;
  commercial_name: string | null;
  url: string | null;
  status: string | null;
  stage: string | null;
  thesis_bucket: string | null;
  what_they_do: string | null;
  target_market: string | null;
  tailwinds: string | null;
  challenges: string | null;
  notes: string | null;
  theme: string[] | null;
  industry: string[] | null;
  region: string[] | null;
  type: string[] | null;
};

const ALL = "__all__";
const OTHER = "__other__";
const UNCLASSIFIED = "Unclassified";
const DIRECT_LABEL = "1200VC";
const INNOVATION_TYPES = ["Deep Tech", "Tech Based", "Tech Enabled"] as const;
const TOP_N_INDUSTRIES = 10;

export default function PortfolioPage() {
  const { selected: quarter } = useSelectedQuarter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  // companyId -> set of fund labels (fund.name) the company is held through; includes "1200VC" for directs
  const [companyFunds, setCompanyFunds] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>(ALL);
  const [industryFilter, setIndustryFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);

  const [searchParams, setSearchParams] = useSearchParams();
  const focusCompanyId = searchParams.get("company");
  const focusedRef = useRef<HTMLDivElement | null>(null);
  const clearFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("company");
    setSearchParams(next, { replace: true });
  };

  // Load companies + which are held in selected quarter + which funds touch them
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [companiesRes, fundsRes, directsRes, directSnapsRes, underlyingRes] =
        await Promise.all([
          supabase.from("companies").select("*").order("legal_name"),
          supabase.from("funds").select("id, name, short_name"),
          supabase.from("directs").select("id, company_id"),
          quarter
            ? supabase
                .from("direct_quarter_snapshots")
                .select("direct_id")
                .eq("quarter_id", quarter.id)
            : Promise.resolve({ data: [], error: null }),
          quarter
            ? supabase
                .from("underlying_holdings")
                .select("company_id, fund_id")
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
      (directsRes.data ?? []).forEach((d: any) =>
        directIdToCompany.set(d.id, d.company_id),
      );

      const ids = new Set<string>();
      const cFunds = new Map<string, Set<string>>();
      const ensure = (cid: string) => {
        let s = cFunds.get(cid);
        if (!s) {
          s = new Set<string>();
          cFunds.set(cid, s);
        }
        return s;
      };

      (directSnapsRes.data ?? []).forEach((s: any) => {
        const cid = directIdToCompany.get(s.direct_id);
        if (cid) {
          ids.add(cid);
          ensure(cid).add(DIRECT_LABEL);
        }
      });
      (underlyingRes.data ?? []).forEach((u: any) => {
        if (u.company_id) {
          ids.add(u.company_id);
          const label = fundLabelById.get(u.fund_id);
          if (label) ensure(u.company_id).add(label);
        }
      });

      setActiveIds(ids);
      setCompanyFunds(cFunds);
      setCompanies((companiesRes.data ?? []) as Company[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [quarter?.id]);

  // Quarter-active companies only
  const activeCompanies = useMemo(
    () => companies.filter((c) => activeIds.has(c.id)),
    [companies, activeIds],
  );

  // Fund options: every distinct label across active companies, sorted; "1200VC" pinned first if present
  const fundOptions = useMemo(() => {
    const s = new Set<string>();
    activeCompanies.forEach((c) => {
      const set = companyFunds.get(c.id);
      set?.forEach((l) => s.add(l));
    });
    const all = Array.from(s);
    const direct = all.includes(DIRECT_LABEL) ? [DIRECT_LABEL] : [];
    const rest = all.filter((l) => l !== DIRECT_LABEL).sort();
    return [...direct, ...rest];
  }, [activeCompanies, companyFunds]);

  // Industry: top-N + Other, mirrors Dashboard chart logic
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
      // Fund
      if (fundFilter !== ALL) {
        const set = companyFunds.get(c.id);
        if (!set || !set.has(fundFilter)) return false;
      }
      // Industry
      if (industryFilter !== ALL) {
        const inds = (c.industry ?? []).map((s) => s.trim()).filter(Boolean);
        if (industryFilter === OTHER) {
          // No industry, OR all industries fall outside top-N
          if (inds.length === 0) {
            // empty industry shouldn't match "Other" — exclude
            return false;
          }
          if (inds.some((i) => industrySet.has(i))) return false;
        } else {
          if (!inds.includes(industryFilter)) return false;
        }
      }
      // Innovation Type
      if (typeFilter !== ALL) {
        const types = (c.type ?? []).map((s) => s.trim()).filter(Boolean);
        if (typeFilter === UNCLASSIFIED) {
          if (types.length > 0) return false;
        } else {
          if (!types.includes(typeFilter)) return false;
        }
      }
      // Search
      if (!q) return true;
      const hay = [
        c.legal_name,
        c.commercial_name,
        c.what_they_do,
        c.target_market,
        c.tailwinds,
        c.challenges,
        c.notes,
        c.thesis_bucket,
        ...(c.theme ?? []),
        ...(c.industry ?? []),
        ...(c.region ?? []),
        ...(c.type ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeCompanies, search, fundFilter, industryFilter, typeFilter, companyFunds, industrySet]);

  // If a focus company is requested via ?company=, narrow to just that company.
  const displayed = useMemo(() => {
    if (!focusCompanyId) return filtered;
    const match = companies.find((c) => c.id === focusCompanyId);
    return match ? [match] : filtered;
  }, [filtered, focusCompanyId, companies]);

  useEffect(() => {
    if (focusCompanyId && focusedRef.current) {
      focusedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusCompanyId, displayed.length]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company-by-company qualitative intelligence — what they do, who they serve, and the
            tailwinds and challenges shaping their trajectory.
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
              placeholder="Search by name, what they do, tailwinds, challenges…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={fundFilter} onValueChange={setFundFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Fund" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All funds</SelectItem>
              {fundOptions.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All industries</SelectItem>
              {topIndustries.map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
              <SelectItem value={OTHER}>Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Innovation type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {INNOVATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
              <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 bg-card border-border text-center text-sm text-muted-foreground">
          Loading…
        </Card>
      ) : displayed.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-sm text-muted-foreground">
          No companies match your filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {displayed.map((c) => (
            <div key={c.id} ref={c.id === focusCompanyId ? focusedRef : undefined}>
              <CompanyCard company={c} highlight={c.id === focusCompanyId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyCard({ company: c }: { company: Company }) {
  const fields: Array<{ label: string; value: string | null; accent?: "emerald" | "amber" }> = [
    { label: "What they do", value: c.what_they_do },
    { label: "Target market", value: c.target_market },
    { label: "Tailwinds", value: c.tailwinds, accent: "emerald" },
    { label: "Challenges", value: c.challenges, accent: "amber" },
  ];
  const filled = fields.filter((f) => f.value && f.value.trim());
  const hasAnyTag = (c.type?.length || c.region?.length || c.industry?.length);

  return (
    <Card className="p-4 bg-card border-border space-y-3">
      {/* Tight header: name + commercial + status + url all in one row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-foreground truncate">
              {c.commercial_name || c.legal_name}
            </span>
            {c.commercial_name && c.commercial_name !== c.legal_name && (
              <span className="text-xs text-muted-foreground truncate">{c.legal_name}</span>
            )}
            {c.url && (
              <a
                href={c.url.startsWith("http") ? c.url : `https://${c.url}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Globe className="h-3 w-3" />
                {c.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        {c.status && (
          <Badge variant="outline" className="text-[10px] shrink-0">{c.status}</Badge>
        )}
      </div>

      {/* All taxonomy chips in a single row directly under header */}
      {hasAnyTag ? (
        <div className="flex flex-wrap gap-1.5">
          {c.type?.map((t) => (
            <Badge key={`t-${t}`} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
          {c.region?.map((r) => (
            <Badge key={`r-${r}`} variant="outline" className="text-[10px]">{r}</Badge>
          ))}
          {c.industry?.slice(0, 3).map((i) => (
            <Badge key={`i-${i}`} variant="outline" className="text-[10px] text-muted-foreground">
              {i}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Commentary: only render filled fields. Empty card → single muted line. */}
      {filled.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">— No commentary yet —</div>
      ) : (
        <div className="space-y-3">
          {filled.map((f) => (
            <Field key={f.label} label={f.label} value={f.value} accent={f.accent} />
          ))}
        </div>
      )}

      {c.notes && c.notes.trim() && (
        <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
          <span className="uppercase tracking-wider mr-2">Notes</span>
          {c.notes}
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: "emerald" | "amber";
}) {
  if (!value) return null;
  const accentClass =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
        ? "text-amber-400"
        : "text-muted-foreground";
  return (
    <div className="space-y-1">
      <div className={`text-[10px] uppercase tracking-wider font-medium ${accentClass}`}>
        {label}
      </div>
      <div className="text-sm leading-relaxed text-foreground/90">{value}</div>
    </div>
  );
}
