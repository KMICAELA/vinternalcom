import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, GitMerge, Loader2, Plus, Minus, AlertTriangle, RefreshCw, Code2 } from "lucide-react";
import { toast } from "sonner";
import {
  applyApprovedDiffs,
  nameSimilarity,
  RESOLUTION_REASONS,
  type DiffDecision,
  type ResolutionReason,
} from "@/lib/reports/reportsApi";
import { fmtUSD } from "@/lib/format";

type DiffRow = {
  id: string;
  report_id: string;
  change_type: "update" | "add" | "missing" | "fund_level";
  field_name: string | null;
  holding_id: string | null;
  company_id: string | null;
  proposed_company_name: string | null;
  old_value: any;
  new_value: any;
  requires_confirmation: boolean;
  status: "pending" | "approved" | "rejected" | "edited";
  resolution_reason: string | null;
};

const RESOLUTION_LABELS: Record<ResolutionReason, string> = {
  keep: "Keep (no change)",
  renamed: "Renamed → merge into addition",
  merged: "Merged → consolidate into addition",
  exit: "Exit (realised)",
  divest: "Divest",
  extraction_error: "Extraction error",
  gp_omission: "GP omission",
};

function fmtVal(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return Math.abs(v) > 1000 ? fmtUSD(v, { compact: true }) : String(v);
  return String(v);
}

export default function DiffReviewPanel({ reportId }: { reportId: string }) {
  const [rows, setRows] = useState<DiffRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, DiffDecision>>({});
  const [expandedRow, setExpandedRow] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState({ updates: true, adds: true, missing: true });
  const [showRaw, setShowRaw] = useState(false);
  const [applying, setApplying] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("report_diffs")
      .select("*")
      .eq("report_id", reportId)
      .eq("status", "pending")
      .order("change_type");
    if (error) toast.error(error.message);
    const list = (data ?? []) as DiffRow[];
    setRows(list);
    const init: Record<string, DiffDecision> = {};
    for (const r of list) init[r.id] = { approved: true };
    setDecisions(init);
    setLoading(false);
  }, [reportId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updates = useMemo(() => (rows ?? []).filter((r) => r.change_type === "update"), [rows]);
  const adds = useMemo(() => (rows ?? []).filter((r) => r.change_type === "add"), [rows]);
  const missing = useMemo(() => (rows ?? []).filter((r) => r.change_type === "missing"), [rows]);
  const fundLevel = useMemo(() => (rows ?? []).filter((r) => r.change_type === "fund_level"), [rows]);

  const renameSuggestions = useMemo(() => {
    const out: Record<string, { addId: string; addName: string; score: number }> = {};
    for (const m of missing) {
      let best: { id: string; name: string; score: number } | null = null;
      for (const a of adds) {
        const score = nameSimilarity(m.proposed_company_name ?? "", a.proposed_company_name ?? "");
        if (score >= 0.34 && (!best || score > best.score)) {
          best = { id: a.id, name: a.proposed_company_name ?? "", score };
        }
      }
      if (best) out[m.id] = { addId: best.id, addName: best.name, score: best.score };
    }
    return out;
  }, [missing, adds]);

  function setDec(id: string, patch: Partial<DiffDecision>) {
    setDecisions((d) => ({ ...d, [id]: { ...(d[id] ?? { approved: true }), ...patch } }));
  }

  const consumedAddIds = useMemo(() => {
    const s = new Set<string>();
    for (const dec of Object.values(decisions)) {
      if (dec.approved && (dec.resolution === "renamed" || dec.resolution === "merged") && dec.mergeTargetDiffId) {
        s.add(dec.mergeTargetDiffId);
      }
    }
    return s;
  }, [decisions]);

  const selectedCount = (rows ?? []).filter((r) => decisions[r.id]?.approved).length;

  const blocking = useMemo(() => {
    const issues: string[] = [];
    for (const m of missing) {
      const dec = decisions[m.id];
      if (!dec?.approved) continue;
      if (!dec.resolution) issues.push(`"${m.proposed_company_name}" needs a resolution`);
      else if ((dec.resolution === "renamed" || dec.resolution === "merged") && !dec.mergeTargetDiffId) {
        issues.push(`"${m.proposed_company_name}" needs a merge target`);
      }
    }
    return issues;
  }, [missing, decisions]);

  async function onApprove() {
    if (blocking.length > 0) {
      toast.error(blocking[0]);
      return;
    }
    setApplying(true);
    try {
      const r = await applyApprovedDiffs(reportId, decisions);
      const summary = [
        r.fund_level_applied && `${r.fund_level_applied} fund-level`,
        r.updates_applied && `${r.updates_applied} updates`,
        r.adds_applied && `${r.adds_applied} adds`,
        r.missing_soft_deleted && `${r.missing_soft_deleted} soft-deleted`,
        r.missing_renamed && `${r.missing_renamed} renamed`,
        r.missing_kept && `${r.missing_kept} kept`,
        r.rejected && `${r.rejected} rejected`,
      ].filter(Boolean).join(" · ");
      if (r.errors.length > 0) {
        toast.warning(`Applied with ${r.errors.length} error(s) — ${summary}`);
        console.warn("apply errors:", r.errors);
      } else {
        toast.success(`Applied: ${summary || "no changes"}`);
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  if (loading && !rows) {
    return (
      <Card className="bg-card border-border p-5">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading diffs…
        </div>
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="bg-card border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-amber-400" /> Diff review
          </h2>
          <Button onClick={refresh} variant="outline" size="sm" className="gap-2 h-7 text-[11px]">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          No pending diffs. Click "Compute diffs" above to stage changes against live data.
        </p>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-amber-400/30 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-amber-400" /> Diff review
          <Badge variant="outline" className="text-[10px] ml-1">{rows.length} pending</Badge>
        </h2>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowRaw((v) => !v)} variant="ghost" size="sm" className="gap-1 h-7 text-[11px]">
            <Code2 className="h-3 w-3" /> {showRaw ? "Hide" : "Show"} raw
          </Button>
          <Button onClick={refresh} variant="outline" size="sm" className="gap-2 h-7 text-[11px]" disabled={loading}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          <Button
            onClick={onApprove}
            disabled={applying || selectedCount === 0 || blocking.length > 0}
            size="sm"
            className="gap-2 h-8 text-xs"
          >
            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
            Approve All Selected ({selectedCount})
          </Button>
        </div>
      </div>

      {blocking.length > 0 && (
        <div className="mt-3 text-[11px] text-amber-400 flex items-center gap-2">
          <AlertTriangle className="h-3 w-3" /> {blocking[0]}
          {blocking.length > 1 && <span className="text-muted-foreground">(+{blocking.length - 1} more)</span>}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {fundLevel.length > 0 && (
          <Section
            title="Fund-level metrics"
            icon={<RefreshCw className="h-3.5 w-3.5 text-sky-400" />}
            count={fundLevel.length}
            open={openSections.updates}
            onOpenChange={(v) => setOpenSections((s) => ({ ...s, updates: v }))}
          >
            {fundLevel.map((r) => (
              <DiffRowSimple
                key={r.id}
                row={r}
                checked={!!decisions[r.id]?.approved}
                onCheck={(c) => setDec(r.id, { approved: c })}
              />
            ))}
          </Section>
        )}

        {updates.length > 0 && (
          <Section
            title="Updates"
            icon={<RefreshCw className="h-3.5 w-3.5 text-sky-400" />}
            count={updates.length}
            open={openSections.updates}
            onOpenChange={(v) => setOpenSections((s) => ({ ...s, updates: v }))}
          >
            {updates.map((r) => (
              <ExpandableRow
                key={r.id}
                row={r}
                checked={!!decisions[r.id]?.approved}
                onCheck={(c) => setDec(r.id, { approved: c })}
                expanded={!!expandedRow[r.id]}
                onToggle={() => setExpandedRow((e) => ({ ...e, [r.id]: !e[r.id] }))}
              />
            ))}
          </Section>
        )}

        {adds.length > 0 && (
          <Section
            title="Additions"
            icon={<Plus className="h-3.5 w-3.5 text-emerald-400" />}
            count={adds.length}
            open={openSections.adds}
            onOpenChange={(v) => setOpenSections((s) => ({ ...s, adds: v }))}
          >
            {adds.map((r) => {
              const consumed = consumedAddIds.has(r.id);
              return (
                <ExpandableRow
                  key={r.id}
                  row={r}
                  checked={!!decisions[r.id]?.approved}
                  onCheck={(c) => setDec(r.id, { approved: c })}
                  expanded={!!expandedRow[r.id]}
                  onToggle={() => setExpandedRow((e) => ({ ...e, [r.id]: !e[r.id] }))}
                  consumedNote={consumed ? "Will be merged into a missing row (renamed/merged)" : null}
                />
              );
            })}
          </Section>
        )}

        {missing.length > 0 && (
          <Section
            title="Missing"
            icon={<Minus className="h-3.5 w-3.5 text-amber-400" />}
            count={missing.length}
            open={openSections.missing}
            onOpenChange={(v) => setOpenSections((s) => ({ ...s, missing: v }))}
          >
            {missing.map((r) => {
              const dec = decisions[r.id];
              const suggestion = renameSuggestions[r.id];
              return (
                <div key={r.id} className="border border-border rounded p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={!!dec?.approved}
                      onCheckedChange={(c) => setDec(r.id, { approved: !!c })}
                    />
                    <div className="flex-1 text-xs">
                      <span className="font-medium">{r.proposed_company_name ?? "—"}</span>
                      <span className="text-muted-foreground"> · not present in this report</span>
                    </div>
                  </div>
                  {dec?.approved && (
                    <div className="ml-7 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">Resolution:</span>
                        <Select
                          value={dec.resolution ?? ""}
                          onValueChange={(v) => setDec(r.id, { resolution: v as ResolutionReason, mergeTargetDiffId: undefined })}
                        >
                          <SelectTrigger className="h-8 text-xs w-[260px]">
                            <SelectValue placeholder="Pick a resolution…" />
                          </SelectTrigger>
                          <SelectContent>
                            {RESOLUTION_REASONS.map((rr) => (
                              <SelectItem key={rr} value={rr} className="text-xs">
                                {RESOLUTION_LABELS[rr]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(dec.resolution === "renamed" || dec.resolution === "merged") && (
                          <Select
                            value={dec.mergeTargetDiffId ?? ""}
                            onValueChange={(v) => setDec(r.id, { mergeTargetDiffId: v })}
                          >
                            <SelectTrigger className="h-8 text-xs w-[260px]">
                              <SelectValue placeholder="Pick the addition to merge into…" />
                            </SelectTrigger>
                            <SelectContent>
                              {adds.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  {a.proposed_company_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      {suggestion && dec.resolution !== "renamed" && dec.resolution !== "merged" && (
                        <div className="text-[11px] text-amber-400 flex items-center gap-2 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1.5">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>
                            Did you mean to mark this as <strong>renamed</strong>? An addition named{" "}
                            <strong>"{suggestion.addName}"</strong> looks similar (
                            {Math.round(suggestion.score * 100)}% match).
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] ml-auto"
                            onClick={() =>
                              setDec(r.id, { resolution: "renamed", mergeTargetDiffId: suggestion.addId })
                            }
                          >
                            Apply
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        )}
      </div>

      {showRaw && (
        <div className="mt-4">
          <div className="text-[10px] uppercase text-muted-foreground mb-1">Raw diff rows</div>
          <pre className="text-[10px] bg-muted/30 p-3 rounded overflow-auto max-h-[400px] font-mono leading-relaxed">
            {JSON.stringify(rows, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

function Section({
  title, icon, count, open, onOpenChange, children,
}: {
  title: string; icon: React.ReactNode; count: number; open: boolean;
  onOpenChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 text-xs font-medium py-1.5 hover:text-foreground/80">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {icon}
        {title}
        <Badge variant="outline" className="text-[10px]">{count}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 pt-2 pl-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DiffRowSimple({
  row, checked, onCheck,
}: { row: DiffRow; checked: boolean; onCheck: (c: boolean) => void }) {
  return (
    <div className="border border-border rounded p-3 flex items-center gap-3">
      <Checkbox checked={checked} onCheckedChange={(c) => onCheck(!!c)} />
      <div className="flex-1 text-xs grid grid-cols-3 gap-3">
        <div className="font-mono text-muted-foreground">{row.field_name}</div>
        <div className="text-right text-muted-foreground line-through">{fmtVal(row.old_value)}</div>
        <div className="text-right text-emerald-400">{fmtVal(row.new_value)}</div>
      </div>
    </div>
  );
}

function ExpandableRow({
  row, checked, onCheck, expanded, onToggle, consumedNote,
}: {
  row: DiffRow; checked: boolean; onCheck: (c: boolean) => void;
  expanded: boolean; onToggle: () => void; consumedNote?: string | null;
}) {
  const newObj = (row.new_value ?? {}) as Record<string, any>;
  const oldObj = (row.old_value ?? {}) as Record<string, any>;
  const fieldKeys = Array.from(
    new Set([...Object.keys(newObj ?? {}), ...Object.keys(oldObj ?? {})]),
  );
  return (
    <div className="border border-border rounded">
      <div className="p-3 flex items-center gap-3">
        <Checkbox checked={checked} onCheckedChange={(c) => onCheck(!!c)} />
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left text-xs">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-medium">{row.proposed_company_name ?? "—"}</span>
          <span className="text-muted-foreground">
            {row.change_type === "add" ? `${fieldKeys.length} fields` : `${fieldKeys.length} field(s) changed`}
          </span>
        </button>
        {consumedNote && (
          <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
            {consumedNote}
          </Badge>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 pl-10 border-t border-border/50 pt-2">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 gap-y-1 text-[11px]">
            <div className="text-muted-foreground uppercase text-[9px]">Field</div>
            <div className="text-muted-foreground uppercase text-[9px] text-right">Old</div>
            <div className="text-muted-foreground uppercase text-[9px] text-right">New</div>
            {fieldKeys.map((k) => (
              <div key={k} className="contents">
                <div className="font-mono text-muted-foreground">{k}</div>
                <div className="text-right line-through text-muted-foreground">{fmtVal(oldObj?.[k])}</div>
                <div className="text-right text-emerald-400">{fmtVal(newObj?.[k])}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
