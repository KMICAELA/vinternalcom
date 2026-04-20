import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { fmtUSD, fmtMultiple, calcMoic } from "@/lib/format";
import { toast } from "sonner";
import { ExternalLink, Search, Pencil, Building2 } from "lucide-react";

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
  theme: string[] | null;
  industry: string[] | null;
  region: string[] | null;
  sdg: string[] | null;
  commentary_updated_at: string | null;
};

type FinancialAgg = {
  cost: number;
  fmv: number;
  proceeds: number;
  hasDirect: boolean;
  hasUnderlying: boolean;
};

const ALL = "__all__";

export default function PortfolioPage() {
  const { role } = useAuth();
  const { selected: quarter } = useSelectedQuarter();
  const isAdmin = role === "admin";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [financials, setFinancials] = useState<Record<string, FinancialAgg>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [thesisFilter, setThesisFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const [editing, setEditing] = useState<Company | null>(null);
  const [draft, setDraft] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);

  const loadCompanies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .order("legal_name");
    if (error) {
      toast.error("Failed to load companies");
    } else {
      setCompanies((data ?? []) as Company[]);
    }
    setLoading(false);
  };

  const loadFinancials = async () => {
    if (!quarter) return;
    // Direct investments aggregated by company
    const { data: directs } = await supabase
      .from("directs")
      .select("company_id, twh_cost_usd");
    const { data: directSnaps } = await supabase
      .from("direct_quarter_snapshots")
      .select("direct_id, twh_fmv_usd, twh_proceeds_usd")
      .eq("quarter_id", quarter.id);
    const { data: underlying } = await supabase
      .from("underlying_holdings")
      .select("company_id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd")
      .eq("quarter_id", quarter.id);

    const directMap: Record<string, string> = {};
    (directs ?? []).forEach((d: any) => {
      directMap[d.company_id] = d.company_id; // placeholder
    });

    // Build directId -> companyId map
    const directIdToCompany: Record<string, string> = {};
    (directs ?? []).forEach((d: any) => {
      directIdToCompany[d.company_id] = d.company_id;
    });

    const agg: Record<string, FinancialAgg> = {};
    // Direct cost
    (directs ?? []).forEach((d: any) => {
      const cid = d.company_id;
      if (!agg[cid]) agg[cid] = { cost: 0, fmv: 0, proceeds: 0, hasDirect: false, hasUnderlying: false };
      agg[cid].cost += Number(d.twh_cost_usd || 0);
      agg[cid].hasDirect = true;
    });
    // Direct snapshots — need to map direct_id back to company_id
    const { data: directRows } = await supabase
      .from("directs")
      .select("id, company_id");
    const directToCompany: Record<string, string> = {};
    (directRows ?? []).forEach((d: any) => {
      directToCompany[d.id] = d.company_id;
    });
    (directSnaps ?? []).forEach((s: any) => {
      const cid = directToCompany[s.direct_id];
      if (!cid) return;
      if (!agg[cid]) agg[cid] = { cost: 0, fmv: 0, proceeds: 0, hasDirect: false, hasUnderlying: false };
      agg[cid].fmv += Number(s.twh_fmv_usd || 0);
      agg[cid].proceeds += Number(s.twh_proceeds_usd || 0);
    });
    (underlying ?? []).forEach((u: any) => {
      const cid = u.company_id;
      if (!agg[cid]) agg[cid] = { cost: 0, fmv: 0, proceeds: 0, hasDirect: false, hasUnderlying: false };
      agg[cid].cost += Number(u.fund_cost_usd || 0);
      agg[cid].fmv += Number(u.fund_fmv_usd || 0);
      agg[cid].proceeds += Number(u.fund_proceeds_usd || 0);
      agg[cid].hasUnderlying = true;
    });
    setFinancials(agg);
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    loadFinancials();
  }, [quarter?.id]);

  const stages = useMemo(
    () => Array.from(new Set(companies.map((c) => c.stage).filter(Boolean) as string[])).sort(),
    [companies],
  );
  const thesisBuckets = useMemo(
    () => Array.from(new Set(companies.map((c) => c.thesis_bucket).filter(Boolean) as string[])).sort(),
    [companies],
  );
  const statuses = useMemo(
    () => Array.from(new Set(companies.map((c) => c.status).filter(Boolean) as string[])).sort(),
    [companies],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (stageFilter !== ALL && c.stage !== stageFilter) return false;
      if (thesisFilter !== ALL && c.thesis_bucket !== thesisFilter) return false;
      if (statusFilter !== ALL && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        c.legal_name,
        c.commercial_name,
        c.what_they_do,
        c.thesis_bucket,
        c.target_market,
        ...(c.theme ?? []),
        ...(c.industry ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [companies, search, stageFilter, thesisFilter, statusFilter]);

  const openEdit = (c: Company) => {
    setEditing(c);
    setDraft({
      commercial_name: c.commercial_name,
      url: c.url,
      status: c.status,
      stage: c.stage,
      thesis_bucket: c.thesis_bucket,
      what_they_do: c.what_they_do,
      target_market: c.target_market,
      tailwinds: c.tailwinds,
      challenges: c.challenges,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        ...draft,
        commentary_updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Company commentary updated");
    setEditing(null);
    setDraft({});
    loadCompanies();
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company-by-company intelligence — qualitative commentary alongside live financial metrics.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} of {companies.length} companies
        </div>
      </div>

      <Card className="p-4 bg-card border-border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, thesis, what they do…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All stages</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={thesisFilter} onValueChange={setThesisFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Thesis bucket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All thesis</SelectItem>
              {thesisBuckets.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {statuses.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Status:</span>
            <Badge
              variant={statusFilter === ALL ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setStatusFilter(ALL)}
            >
              All
            </Badge>
            {statuses.map((s) => (
              <Badge
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card className="bg-card border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Thesis</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">FMV</TableHead>
              <TableHead className="text-right">MOIC</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                  No companies match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => {
                const f = financials[c.id];
                const moic = f ? calcMoic(f.cost, f.fmv, f.proceeds) : null;
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(c)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">
                            {c.commercial_name || c.legal_name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {c.url && (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                              >
                                site <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {f?.hasDirect && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                Direct
                              </Badge>
                            )}
                            {f?.hasUnderlying && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                Fund
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.stage || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.thesis_bucket || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {f ? fmtUSD(f.cost, { compact: true }) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {f ? fmtUSD(f.fmv, { compact: true }) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {fmtMultiple(moic)}
                    </TableCell>
                    <TableCell>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.commercial_name || editing?.legal_name}</SheetTitle>
            <SheetDescription>
              {isAdmin
                ? "Edit qualitative commentary for this company."
                : "Read-only view (admin role required to edit)."}
            </SheetDescription>
          </SheetHeader>

          {editing && (
            <div className="space-y-4 mt-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="commercial_name">Commercial name</Label>
                  <Input
                    id="commercial_name"
                    value={draft.commercial_name ?? ""}
                    onChange={(e) => setDraft({ ...draft, commercial_name: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="url">Website</Label>
                  <Input
                    id="url"
                    value={draft.url ?? ""}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    disabled={!isAdmin}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stage">Stage</Label>
                  <Input
                    id="stage"
                    value={draft.stage ?? ""}
                    onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Input
                    id="status"
                    value={draft.status ?? ""}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="thesis_bucket">Thesis bucket</Label>
                  <Input
                    id="thesis_bucket"
                    value={draft.thesis_bucket ?? ""}
                    onChange={(e) => setDraft({ ...draft, thesis_bucket: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="what_they_do">What they do</Label>
                <Textarea
                  id="what_they_do"
                  rows={3}
                  value={draft.what_they_do ?? ""}
                  onChange={(e) => setDraft({ ...draft, what_they_do: e.target.value })}
                  disabled={!isAdmin}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="target_market">Target market</Label>
                <Textarea
                  id="target_market"
                  rows={2}
                  value={draft.target_market ?? ""}
                  onChange={(e) => setDraft({ ...draft, target_market: e.target.value })}
                  disabled={!isAdmin}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tailwinds">Tailwinds</Label>
                <Textarea
                  id="tailwinds"
                  rows={3}
                  value={draft.tailwinds ?? ""}
                  onChange={(e) => setDraft({ ...draft, tailwinds: e.target.value })}
                  disabled={!isAdmin}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="challenges">Challenges</Label>
                <Textarea
                  id="challenges"
                  rows={3}
                  value={draft.challenges ?? ""}
                  onChange={(e) => setDraft({ ...draft, challenges: e.target.value })}
                  disabled={!isAdmin}
                />
              </div>

              {/* Live financials snapshot */}
              {financials[editing.id] && (
                <Card className="p-4 bg-muted/30 border-border">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    {quarter?.label} — TWH exposure
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Cost</div>
                      <div className="text-sm font-medium tabular-nums">
                        {fmtUSD(financials[editing.id].cost, { compact: true })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">FMV</div>
                      <div className="text-sm font-medium tabular-nums">
                        {fmtUSD(financials[editing.id].fmv, { compact: true })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">MOIC</div>
                      <div className="text-sm font-medium tabular-nums">
                        {fmtMultiple(
                          calcMoic(
                            financials[editing.id].cost,
                            financials[editing.id].fmv,
                            financials[editing.id].proceeds,
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {editing.commentary_updated_at && (
                <div className="text-xs text-muted-foreground">
                  Last edited {new Date(editing.commentary_updated_at).toLocaleString()}
                </div>
              )}

              {isAdmin && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save commentary"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
