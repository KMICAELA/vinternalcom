// /admin/cleanup — PR #3a "Find Orphans" + soft-delete cleanup tool.
//
// Diagnoses contaminated underlying_holdings rows for a fund/quarter and lets
// an admin soft-delete them with a reason. Designed for the 8 grandfathered
// 4Q25 reports that promoted with stacking behavior — Cantos already shown to
// have phantom MoldCo + duplicates from prior promotes.
//
// Four diagnostics:
//  1. Linked to an ARCHIVED report
//  2. NULL source_report_id (manually inserted or pre-reports-system)
//  3. Duplicate (fund, quarter, company) groups (>1 LIVE row)
//  4. Linked to a ROLLED-BACK promote (reports.committed_to_db = false)
//
// Soft-delete writes removed_at/removed_reason/removed_by + an audit_log row.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, AlertTriangle, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { fmtUSD } from "@/lib/format";

type HoldingRow = {
  id: string;
  fund_id: string;
  quarter_id: string;
  company_id: string;
  company_name: string;
  fund_name: string;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  source_report_id: string | null;
  report_file_name: string | null;
  report_archived: boolean | null;
  report_committed: boolean | null;
};

type Section = "archived" | "null_source" | "duplicates" | "rolled_back";

const SECTION_META: Record<Section, { title: string; desc: string; defaultReason: string }> = {
  archived: {
    title: "Linked to an ARCHIVED report",
    desc: "Holdings whose source report was archived. Usually safe to remove.",
    defaultReason: "extraction_error",
  },
  null_source: {
    title: "NULL source_report_id",
    desc: "Manually inserted, reconciliation imports, or pre-reports-system rows. Review carefully — some may be legitimate.",
    defaultReason: "extraction_error",
  },
  duplicates: {
    title: "Duplicate (fund/quarter/company) groups",
    desc: "More than one live row for the same company in the same quarter. Pick the survivor; the rest get soft-deleted.",
    defaultReason: "extraction_error",
  },
  rolled_back: {
    title: "Linked to a ROLLED-BACK promote",
    desc: "Source report has committed_to_db = false (was rolled back or never finalized). Almost always safe to remove.",
    defaultReason: "extraction_error",
  },
};

const REASON_OPTIONS = [
  { value: "extraction_error", label: "extraction_error — AI hallucinated or misread" },
  { value: "gp_omission", label: "gp_omission — GP dropped from this report" },
  { value: "exit", label: "exit — full exit (sold/wound down)" },
  { value: "divest", label: "divest — partial divestment" },
];

export default function CleanupPage() {
  const { role, user } = useAuth();
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]);
  const [quarters, setQuarters] = useState<{ id: string; label: string }[]>([]);
  const [fundId, setFundId] = useState<string>("");
  const [quarterId, setQuarterId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<string>("extraction_error");

  // Load filter options once
  useEffect(() => {
    (async () => {
      const [{ data: fs }, { data: qs }] = await Promise.all([
        supabase.from("funds").select("id, name, short_name").order("name"),
        supabase.from("quarters").select("id, label, quarter_end_date").order("quarter_end_date", { ascending: false }),
      ]);
      setFunds((fs ?? []).map((f: any) => ({ id: f.id, name: f.short_name ?? f.name })));
      setQuarters((qs ?? []).map((q: any) => ({ id: q.id, label: q.label })));
    })();
  }, []);

  const runDiagnostic = useCallback(async () => {
    if (!fundId || !quarterId) return;
    setLoading(true);
    setSelected({});
    const { data, error } = await supabase
      .from("underlying_holdings")
      .select(
        "id, fund_id, quarter_id, company_id, fund_cost_usd, fund_fmv_usd, source_report_id, " +
        "companies:company_id(legal_name, commercial_name), " +
        "funds:fund_id(name, short_name), " +
        "reports:source_report_id(file_name, archived, committed_to_db)",
      )
      .eq("fund_id", fundId)
      .eq("quarter_id", quarterId)
      .is("removed_at", null);
    if (error) { toast.error(error.message); setLoading(false); return; }
    const mapped: HoldingRow[] = (data ?? []).map((h: any) => ({
      id: h.id,
      fund_id: h.fund_id,
      quarter_id: h.quarter_id,
      company_id: h.company_id,
      company_name: h.companies?.commercial_name ?? h.companies?.legal_name ?? "—",
      fund_name: h.funds?.short_name ?? h.funds?.name ?? "—",
      fund_cost_usd: h.fund_cost_usd == null ? null : Number(h.fund_cost_usd),
      fund_fmv_usd: h.fund_fmv_usd == null ? null : Number(h.fund_fmv_usd),
      source_report_id: h.source_report_id ?? null,
      report_file_name: h.reports?.file_name ?? null,
      report_archived: h.reports?.archived ?? null,
      report_committed: h.reports?.committed_to_db ?? null,
    }));
    setRows(mapped);
    setLoading(false);
  }, [fundId, quarterId]);

  // Bucket rows into the four diagnostic sections.
  const sections = useMemo(() => {
    const archived: HoldingRow[] = [];
    const nullSrc: HoldingRow[] = [];
    const rolledBack: HoldingRow[] = [];
    for (const r of rows) {
      if (r.source_report_id == null) nullSrc.push(r);
      else if (r.report_archived) archived.push(r);
      else if (r.report_committed === false) rolledBack.push(r);
    }
    // Duplicates: any (fund_id, quarter_id, company_id) with >1 row
    const groups = new Map<string, HoldingRow[]>();
    for (const r of rows) {
      const k = `${r.fund_id}|${r.quarter_id}|${r.company_id}`;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    const duplicates: HoldingRow[] = [];
    for (const arr of groups.values()) if (arr.length > 1) duplicates.push(...arr);
    return { archived, null_source: nullSrc, duplicates, rolled_back: rolledBack };
  }, [rows]);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  async function softDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Soft-delete ${selectedIds.length} holding(s) with reason "${reason}"? This is reversible by clearing removed_at in the DB.`)) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      // Snapshot before for audit
      const { data: before } = await supabase
        .from("underlying_holdings")
        .select("*")
        .in("id", selectedIds);

      const { error: uErr } = await supabase
        .from("underlying_holdings")
        .update({
          removed_at: nowIso,
          removed_reason: reason,
          removed_by: user?.id ?? null,
        })
        .in("id", selectedIds);
      if (uErr) throw uErr;

      // Audit log: one row per deletion
      const auditRows = (before ?? []).map((b: any) => ({
        entity: "underlying_holdings",
        entity_id: b.id,
        action: "soft_delete",
        actor_id: user?.id ?? null,
        before: b,
        after: { ...b, removed_at: nowIso, removed_reason: reason, removed_by: user?.id ?? null },
      }));
      if (auditRows.length > 0) {
        const { error: aErr } = await supabase.from("audit_log").insert(auditRows as any);
        if (aErr) console.warn("audit_log insert failed:", aErr);
      }

      toast.success(`Soft-deleted ${selectedIds.length} holding(s)`);
      setSelected({});
      await runDiagnostic();
    } catch (e: any) {
      toast.error(e?.message ?? "Soft-delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (role !== "admin") {
    return <div className="p-8 text-muted-foreground">Admin access required.</div>;
  }

  const sectionList: Section[] = ["duplicates", "archived", "rolled_back", "null_source"];
  const totalFlagged = sectionList.reduce((a, s) => a + sections[s].length, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-400" />
          Holdings cleanup tool
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find and soft-delete contaminated underlying_holdings rows from prior stacked promotes.
          Soft-delete preserves the row + audit trail; toggle "Show removed" on the Underlying tab to inspect or restore.
        </p>
      </div>

      <Card className="bg-card border-border p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Fund</div>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger className="w-64 h-9 text-xs"><SelectValue placeholder="Pick a fund" /></SelectTrigger>
              <SelectContent>
                {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Quarter</div>
            <Select value={quarterId} onValueChange={setQuarterId}>
              <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Pick a quarter" /></SelectTrigger>
              <SelectContent>
                {quarters.map((q) => <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={runDiagnostic}
            disabled={!fundId || !quarterId || loading}
            size="sm"
            className="gap-2 h-9 text-xs"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Run diagnostic
          </Button>
          {rows.length > 0 && (
            <span className="text-[11px] text-muted-foreground self-center">
              {rows.length} live holdings · {totalFlagged} flagged across sections
            </span>
          )}
        </div>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="bg-card border-amber-400/30 p-4 sticky top-2 z-10">
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <span className="text-[11px] text-muted-foreground">Removal reason:</span>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-72 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              onClick={softDelete}
              disabled={busy}
              size="sm"
              variant="outline"
              className="gap-2 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Soft-delete selected
            </Button>
            <Button onClick={() => setSelected({})} variant="ghost" size="sm" className="h-8 text-xs">Clear</Button>
          </div>
        </Card>
      )}

      {rows.length > 0 && sectionList.map((s) => (
        <SectionTable
          key={s}
          section={s}
          rows={sections[s]}
          selected={selected}
          onToggle={(id) => setSelected((p) => ({ ...p, [id]: !p[id] }))}
          onToggleAll={(checked) => {
            setSelected((p) => {
              const next = { ...p };
              for (const r of sections[s]) next[r.id] = checked;
              return next;
            });
          }}
        />
      ))}

      {!loading && fundId && quarterId && rows.length === 0 && (
        <Card className="bg-card border-border p-8 text-center text-sm text-muted-foreground">
          No live holdings for this fund/quarter.
        </Card>
      )}
    </div>
  );
}

function SectionTable({
  section, rows, selected, onToggle, onToggleAll,
}: {
  section: Section;
  rows: HoldingRow[];
  selected: Record<string, boolean>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const meta = SECTION_META[section];
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {meta.title}
            <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">{meta.desc}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">None.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(e.target.checked)}
                    className="cursor-pointer"
                  />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">FMV</TableHead>
                <TableHead>Source report</TableHead>
                <TableHead className="text-[10px] text-muted-foreground">holding_id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/20">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={() => onToggle(r.id)}
                      className="cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.company_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.fund_name}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.fund_cost_usd == null ? "—" : fmtUSD(r.fund_cost_usd, { compact: true })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.fund_fmv_usd == null ? "—" : fmtUSD(r.fund_fmv_usd, { compact: true })}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.source_report_id == null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {r.report_file_name ?? r.source_report_id.slice(0, 8)}
                        {r.report_archived && <Badge variant="outline" className="ml-1 text-[9px]">archived</Badge>}
                        {r.report_committed === false && <Badge variant="outline" className="ml-1 text-[9px] text-amber-400 border-amber-400/30">rolled-back</Badge>}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
