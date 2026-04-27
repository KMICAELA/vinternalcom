import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ExternalLink, Search, Building2, Globe } from "lucide-react";

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

export default function PortfolioPage() {
  const { selected: quarter } = useSelectedQuarter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [regionFilter, setRegionFilter] = useState<string>(ALL);
  const [industryFilter, setIndustryFilter] = useState<string>(ALL);

  // Load companies + which are held in selected quarter
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [companiesRes, directsRes, directSnapsRes, underlyingRes] = await Promise.all([
        supabase.from("companies").select("*").order("legal_name"),
        supabase.from("directs").select("id, company_id"),
        quarter
          ? supabase.from("direct_quarter_snapshots").select("direct_id").eq("quarter_id", quarter.id)
          : Promise.resolve({ data: [], error: null }),
        quarter
          ? supabase.from("underlying_holdings").select("company_id").eq("quarter_id", quarter.id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      if (companiesRes.error) {
        toast.error("Failed to load companies");
        setLoading(false);
        return;
      }
      const directIdToCompany = new Map<string, string>();
      (directsRes.data ?? []).forEach((d: any) => directIdToCompany.set(d.id, d.company_id));
      const ids = new Set<string>();
      (directSnapsRes.data ?? []).forEach((s: any) => {
        const cid = directIdToCompany.get(s.direct_id);
        if (cid) ids.add(cid);
      });
      (underlyingRes.data ?? []).forEach((u: any) => {
        if (u.company_id) ids.add(u.company_id);
      });
      setActiveIds(ids);
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

  const types = useMemo(() => {
    const s = new Set<string>();
    activeCompanies.forEach((c) => (c.type ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [activeCompanies]);
  const regions = useMemo(() => {
    const s = new Set<string>();
    activeCompanies.forEach((c) => (c.region ?? []).forEach((r) => s.add(r)));
    return Array.from(s).sort();
  }, [activeCompanies]);
  const industries = useMemo(() => {
    const s = new Set<string>();
    activeCompanies.forEach((c) => (c.industry ?? []).forEach((i) => s.add(i)));
    return Array.from(s).sort();
  }, [activeCompanies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCompanies.filter((c) => {
      if (typeFilter !== ALL && !(c.type ?? []).includes(typeFilter)) return false;
      if (regionFilter !== ALL && !(c.region ?? []).includes(regionFilter)) return false;
      if (industryFilter !== ALL && !(c.industry ?? []).includes(industryFilter)) return false;
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
  }, [activeCompanies, search, typeFilter, regionFilter, industryFilter]);

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
          <div>{filtered.length} of {activeCompanies.length} active companies</div>
          {quarter && <div className="mt-0.5">{quarter.label}</div>}
        </div>
      </div>

      <Card className="p-4 bg-card border-border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, what they do, tailwinds, challenges…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Innovation type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {industries.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Industry:</span>
            <Badge
              variant={industryFilter === ALL ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setIndustryFilter(ALL)}
            >
              All
            </Badge>
            {industries.slice(0, 20).map((i) => (
              <Badge
                key={i}
                variant={industryFilter === i ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setIndustryFilter(i)}
              >
                {i}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {loading ? (
        <Card className="p-12 bg-card border-border text-center text-sm text-muted-foreground">
          Loading…
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-sm text-muted-foreground">
          No companies match your filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((c) => (
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyCard({ company: c }: { company: Company }) {
  return (
    <Card className="p-5 bg-card border-border space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">
              {c.commercial_name || c.legal_name}
            </div>
            {c.commercial_name && c.commercial_name !== c.legal_name && (
              <div className="text-xs text-muted-foreground truncate">{c.legal_name}</div>
            )}
            {c.url && (
              <a
                href={c.url.startsWith("http") ? c.url : `https://${c.url}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Globe className="h-3 w-3" /> {c.url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        {c.status && (
          <Badge variant="outline" className="text-[10px] shrink-0">{c.status}</Badge>
        )}
      </div>

      {/* Taxonomy chips */}
      {(c.type?.length || c.region?.length || c.industry?.length) ? (
        <div className="flex flex-wrap gap-1.5">
          {c.type?.map((t) => (
            <Badge key={`t-${t}`} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
          {c.region?.map((r) => (
            <Badge key={`r-${r}`} variant="outline" className="text-[10px]">{r}</Badge>
          ))}
          {c.industry?.slice(0, 4).map((i) => (
            <Badge key={`i-${i}`} variant="outline" className="text-[10px] text-muted-foreground">
              {i}
            </Badge>
          ))}
        </div>
      ) : null}

      <Field label="What they do" value={c.what_they_do} />
      <Field label="Target market" value={c.target_market} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tailwinds" value={c.tailwinds} accent="emerald" />
        <Field label="Challenges" value={c.challenges} accent="amber" />
      </div>
      {c.notes && <Field label="Notes" value={c.notes} muted />}
    </Card>
  );
}

function Field({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string | null;
  accent?: "emerald" | "amber";
  muted?: boolean;
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
      <div className={`text-sm leading-relaxed ${muted ? "text-muted-foreground" : "text-foreground/90"}`}>
        {value}
      </div>
    </div>
  );
}
