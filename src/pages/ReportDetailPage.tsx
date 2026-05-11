// /reports/:id — detail view for a single uploaded report.
// Three sections: document info, extraction results (read-only tabs), actions.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Download, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle,
  Archive, RotateCcw, FileText, Loader2, ExternalLink, Trash2, Pencil, X, Save, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtMultiple, fmtDate, calcMoic, calcTvpi, calcDpi } from "@/lib/format";
import type { ExtractedPayload } from "@/lib/extraction/runExtractFile";
import {
  archiveReport, deleteReport, promoteReportToLive, signedReportUrl,
} from "@/lib/reports/reportsApi";
import { useAuth } from "@/contexts/AuthContext";

type ReportFull = {
  id: string;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  fund_id: string | null;
  quarter_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  extraction_status: "pending" | "success" | "error" | "needs_review";
  extraction_summary: any;
  extracted_payload: ExtractedPayload | null;
  committed_to_db: boolean;
  committed_at: string | null;
  archived: boolean;
  funds: { name: string; short_name: string | null } | null;
  quarters: { label: string; quarter_end_date: string } | null;
  uploader: { full_name: string | null; email: string | null } | null;
};

const STATUS_META = {
  success: { label: "Success", icon: CheckCircle2, cls: "text-emerald-400 border-emerald-400/30" },
  needs_review: { label: "Needs review", icon: AlertTriangle, cls: "text-amber-400 border-amber-400/30" },
  error: { label: "Error", icon: AlertCircle, cls: "text-destructive border-destructive/30" },
  pending: { label: "Pending", icon: Loader2, cls: "text-muted-foreground border-border" },
} as const;

function fmtBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [report, setReport] = useState<ReportFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "promote" | "rerun" | "archive" | "delete" | "save">(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractedPayload | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, file_name, storage_path, file_size_bytes, mime_type, fund_id, quarter_id, uploaded_by, uploaded_at, extraction_status, extraction_summary, extracted_payload, committed_to_db, committed_at, archived, funds:fund_id(name, short_name), quarters:quarter_id(label, quarter_end_date), uploader:uploaded_by(full_name, email)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) toast.error(error.message);
    setReport((data as any) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Generate download URL on demand
  useEffect(() => {
    if (!report?.storage_path) return;
    (async () => {
      const url = await signedReportUrl(report.storage_path, 3600);
      setDownloadUrl(url);
    })();
  }, [report?.storage_path]);

  const livePayload = report?.extracted_payload ?? null;
  const payload = editing ? draft : livePayload;
  const meta = report ? STATUS_META[report.extraction_status] : null;
  const StatusIcon = meta?.icon ?? FileText;

  const holdings = payload?.holdings ?? [];
  const directRows = useMemo(() => holdings, [holdings]);

  function startEdit() {
    setDraft(livePayload ? JSON.parse(JSON.stringify(livePayload)) : null);
    setEditing(true);
  }
  function cancelEdit() {
    setDraft(null);
    setEditing(false);
  }
  function patchDraft(patch: Partial<ExtractedPayload>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function patchHolding(idx: number, patch: Partial<NonNullable<ExtractedPayload["holdings"]>[number]>) {
    setDraft((d) => {
      if (!d) return d;
      const next = [...(d.holdings ?? [])];
      next[idx] = { ...next[idx], ...patch } as any;
      return { ...d, holdings: next };
    });
  }
  function addHolding() {
    setDraft((d) => {
      if (!d) return d;
      const blank = {
        company_name: "", investment_date: null, instrument: null, round: null,
        fund_cost_usd: null, fund_fmv_usd: null, fund_proceeds_usd: null,
      } as any;
      return { ...d, holdings: [...(d.holdings ?? []), blank] };
    });
  }
  function removeHolding(idx: number) {
    setDraft((d) => {
      if (!d) return d;
      const next = [...(d.holdings ?? [])];
      next.splice(idx, 1);
      return { ...d, holdings: next };
    });
  }

  async function onSaveEdit() {
    if (!report || !draft) return;
    setBusy("save");
    try {
      const needsReview = (draft.holdings ?? []).some(
        (h: any) => h.fund_cost_usd == null || h.fund_fmv_usd == null || h?.needs_review === true,
      );
      const status = needsReview ? "needs_review" : "success";
      const { error: uErr } = await supabase
        .from("reports")
        .update({
          extracted_payload: draft as any,
          extraction_status: status,
          extraction_summary: {
            holdings: draft.holdings?.length ?? 0,
            edited_at: new Date().toISOString(),
            currency: draft.currency,
            report_date: draft.report_date,
          },
        })
        .eq("id", report.id);
      if (uErr) throw uErr;
      toast.success("Extraction saved" + (report.committed_to_db ? " — re-promote to update live data" : ""));
      setEditing(false);
      setDraft(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function onPromote() {
    if (!report) return;
    setBusy("promote");
    try {
      const result = await promoteReportToLive(report.id);
      if (result.errors.length > 0) {
        toast.warning(`Promoted with ${result.errors.length} error(s). See details.`);
        console.warn("Promotion errors:", result.errors);
      } else {
        toast.success(
          `Promoted: ${result.fund_snapshots_written} fund snapshot, ${result.underlying_holdings_written} holdings`,
        );
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Promotion failed");
    } finally {
      setBusy(null);
    }
  }

  async function onArchive() {
    if (!report) return;
    setBusy("archive");
    try {
      await archiveReport(report.id, !report.archived);
      toast.success(report.archived ? "Unarchived" : "Archived");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Archive failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRerun() {
    if (!report) return;
    setBusy("rerun");
    try {
      // Download stored file → re-run extraction → update extracted_payload
      const { data: blob, error: dErr } = await supabase.storage
        .from("fund-reports")
        .download(report.storage_path);
      if (dErr || !blob) throw dErr ?? new Error("Could not download stored file");

      const file = new File([blob], report.file_name, { type: report.mime_type ?? blob.type });
      const { runExtractFile } = await import("@/lib/extraction/runExtractFile");
      const res = await runExtractFile({
        file,
        fundId: report.fund_id,
        quarterId: report.quarter_id,
      });
      const status =
        res.error && !res.payload
          ? "error"
          : (res.payload?.holdings ?? []).some((h) => h.fund_cost_usd == null || h.fund_fmv_usd == null)
            ? "needs_review"
            : "success";
      const { error: uErr } = await supabase
        .from("reports")
        .update({
          extracted_payload: res.payload as any,
          extraction_status: status,
          extraction_summary: {
            holdings: res.payload?.holdings?.length ?? 0,
            error: res.error ?? null,
            rerun_at: new Date().toISOString(),
          },
        })
        .eq("id", report.id);
      if (uErr) throw uErr;
      toast.success("Extraction re-run complete");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Re-run failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!report) return <div className="p-8 text-muted-foreground">Report not found.</div>;

  const isAdmin = role === "admin";

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-2 mb-2 -ml-2 h-8 text-xs">
          <Link to="/reports"><ArrowLeft className="h-3 w-3" /> All reports</Link>
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-400" />
              {report.file_name}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {meta && (
                <Badge variant="outline" className={`text-[10px] gap-1 ${meta.cls}`}>
                  <StatusIcon className="h-3 w-3" />{meta.label}
                </Badge>
              )}
              {report.committed_to_db ? (
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">Live</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Draft</Badge>
              )}
              {report.archived && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
            </div>
          </div>
        </div>
      </div>

      {/* (a) Document info */}
      <Card className="bg-card border-border p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Fund" value={report.funds?.short_name ?? report.funds?.name ?? "—"} />
          <Field label="Quarter" value={report.quarters?.label ?? "—"} />
          <Field
            label="Uploaded"
            value={`${new Date(report.uploaded_at).toLocaleString()}${report.uploader?.full_name || report.uploader?.email ? ` · ${report.uploader?.full_name ?? report.uploader?.email}` : ""}`}
          />
          <Field label="File size" value={fmtBytes(report.file_size_bytes)} />
        </div>
        <div className="mt-4 flex gap-2">
          {downloadUrl ? (
            <Button asChild variant="outline" size="sm" className="gap-2 h-8 text-xs">
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Download className="h-3 w-3" /> Download original
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="gap-2 h-8 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating link…
            </Button>
          )}
        </div>
      </Card>

      {/* (b) Extraction results */}
      <Card className="bg-card border-border p-5">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-semibold">Extraction results</h2>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <span className="text-[11px] text-muted-foreground">
                  {isAdmin ? "Click Edit to correct extracted values" : "Read-only · captured at upload time"}
                </span>
                {isAdmin && livePayload && (
                  <Button onClick={startEdit} variant="outline" size="sm" className="gap-2 h-8 text-xs">
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="text-[11px] text-amber-400">Editing — unsaved changes</span>
                <Button onClick={cancelEdit} variant="outline" size="sm" disabled={busy === "save"} className="gap-2 h-8 text-xs">
                  <X className="h-3 w-3" /> Cancel
                </Button>
                <Button onClick={onSaveEdit} size="sm" disabled={busy === "save"} className="gap-2 h-8 text-xs">
                  {busy === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
        {!payload ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No extraction payload available.</div>
        ) : (
          <Tabs defaultValue="fund">
            <TabsList>
              <TabsTrigger value="fund">Fund metrics</TabsTrigger>
              <TabsTrigger value="holdings">Holdings ({holdings.length})</TabsTrigger>
              <TabsTrigger value="raw">Raw payload</TabsTrigger>
            </TabsList>

            <TabsContent value="fund">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <EditableKvRow label="Fund name (extracted)" editing={editing} value={payload.fund_name}
                      onChange={(v) => patchDraft({ fund_name: v || null })} />
                    <EditableKvRow label="Report date" editing={editing} value={payload.report_date} type="date"
                      onChange={(v) => patchDraft({ report_date: v || null })} />
                    <EditableKvRow label="Currency" editing={editing} value={payload.currency}
                      onChange={(v) => patchDraft({ currency: v ? v.toUpperCase() : null })} />
                    <EditableKvRow label="TWH Contributions" editing={editing} value={payload.twh_contributions_usd} numeric mono
                      display={fmtUSD(payload.twh_contributions_usd ?? 0, { compact: true })}
                      onChange={(v) => patchDraft({ twh_contributions_usd: parseNum(v) })} />
                    <EditableKvRow label="TWH Distributions" editing={editing} value={payload.twh_distributions_usd} numeric mono
                      display={fmtUSD(payload.twh_distributions_usd ?? 0, { compact: true })}
                      onChange={(v) => patchDraft({ twh_distributions_usd: parseNum(v) })} />
                    <EditableKvRow label="TWH NAV" editing={editing} value={payload.twh_nav_usd} numeric mono
                      display={fmtUSD(payload.twh_nav_usd ?? 0, { compact: true })}
                      onChange={(v) => patchDraft({ twh_nav_usd: parseNum(v) })} />
                    <EditableKvRow label="Fund Total Contributions" editing={editing} value={payload.fund_total_contributions_usd} numeric mono
                      display={fmtUSD(payload.fund_total_contributions_usd ?? 0, { compact: true })}
                      onChange={(v) => patchDraft({ fund_total_contributions_usd: parseNum(v) })} />
                    <EditableKvRow label="Fund Total NAV" editing={editing} value={payload.fund_total_nav_usd} numeric mono
                      display={fmtUSD(payload.fund_total_nav_usd ?? 0, { compact: true })}
                      onChange={(v) => patchDraft({ fund_total_nav_usd: parseNum(v) })} />
                    <KvRow label="DPI" mono value={fmtMultiple(calcDpi(payload.twh_contributions_usd ?? 0, payload.twh_distributions_usd ?? 0))} />
                    <KvRow label="TVPI" mono value={fmtMultiple(calcTvpi(payload.twh_contributions_usd ?? 0, payload.twh_distributions_usd ?? 0, payload.twh_nav_usd ?? 0))} />
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="holdings">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Company</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">FMV</TableHead>
                      <TableHead className="text-right">Proceeds</TableHead>
                      <TableHead className="text-right">MOIC</TableHead>
                      {editing && <TableHead className="w-8"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {directRows.length === 0 && !editing ? (
                      <TableRow><TableCell colSpan={8} className="text-muted-foreground py-8 text-center">No holdings extracted</TableCell></TableRow>
                    ) : (
                      directRows.map((h, i) => {
                        const moic = h.fund_cost_usd == null ? null : calcMoic(h.fund_cost_usd, h.fund_fmv_usd ?? 0, h.fund_proceeds_usd ?? 0);
                        return (
                          <TableRow key={i} className="table-row-hover">
                            <TableCell className="font-medium">
                              {editing
                                ? <Input value={h.company_name ?? ""} onChange={(e) => patchHolding(i, { company_name: e.target.value })} className="h-8 text-xs" />
                                : (h.company_name || "—")}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {editing
                                ? <Input type="date" value={h.investment_date ?? ""} onChange={(e) => patchHolding(i, { investment_date: e.target.value || null })} className="h-8 text-xs" />
                                : fmtDate(h.investment_date)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {editing
                                ? <Input value={h.round ?? ""} onChange={(e) => patchHolding(i, { round: e.target.value || null })} className="h-8 text-xs" placeholder="—" />
                                : (h.round ? <Badge variant="secondary" className="font-normal">{h.round}</Badge> : "—")}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {editing
                                ? <Input value={h.instrument ?? ""} onChange={(e) => patchHolding(i, { instrument: e.target.value || null })} className="h-8 text-xs" placeholder="—" />
                                : (h.instrument ?? "—")}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {editing
                                ? <Input type="number" value={h.fund_cost_usd ?? ""} onChange={(e) => patchHolding(i, { fund_cost_usd: parseNum(e.target.value) })} className="h-8 text-xs text-right" />
                                : (h.fund_cost_usd == null ? "—" : fmtUSD(h.fund_cost_usd, { compact: true }))}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {editing
                                ? <Input type="number" value={h.fund_fmv_usd ?? ""} onChange={(e) => patchHolding(i, { fund_fmv_usd: parseNum(e.target.value) })} className="h-8 text-xs text-right" />
                                : (h.fund_fmv_usd == null ? "—" : fmtUSD(h.fund_fmv_usd, { compact: true }))}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {editing
                                ? <Input type="number" value={h.fund_proceeds_usd ?? ""} onChange={(e) => patchHolding(i, { fund_proceeds_usd: parseNum(e.target.value) })} className="h-8 text-xs text-right" />
                                : (h.fund_proceeds_usd == null ? "—" : fmtUSD(h.fund_proceeds_usd, { compact: true }))}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtMultiple(moic)}</TableCell>
                            {editing && (
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeHolding(i)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                    {editing && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={9}>
                          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={addHolding}>
                            <Plus className="h-3 w-3" /> Add holding
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="raw">
              <pre className="text-[10px] bg-muted/30 p-4 rounded overflow-auto max-h-[500px] font-mono leading-relaxed">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        )}
      </Card>

      {/* (c) Actions */}
      {isAdmin && (
        <Card className="bg-card border-border p-5">
          <h2 className="text-sm font-semibold mb-3">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRerun} disabled={busy !== null} variant="outline" size="sm" className="gap-2 h-9 text-xs">
              {busy === "rerun" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Re-run extraction
            </Button>
            <Button
              onClick={onPromote}
              disabled={busy !== null || report.committed_to_db || report.extraction_status === "error" || !payload}
              size="sm"
              className="gap-2 h-9 text-xs"
            >
              {busy === "promote" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {report.committed_to_db ? "Already promoted" : "Promote to live data"}
            </Button>
            <Button onClick={onArchive} disabled={busy !== null} variant="outline" size="sm" className="gap-2 h-9 text-xs">
              {busy === "archive" ? <Loader2 className="h-3 w-3 animate-spin" /> : report.archived ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
              {report.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              onClick={async () => {
                if (!report) return;
                const msg = report.committed_to_db
                  ? "Delete this report? Live data rows it produced will be kept but unlinked from this report. This cannot be undone."
                  : "Delete this report and its file? This cannot be undone.";
                if (!confirm(msg)) return;
                setBusy("delete");
                try {
                  await deleteReport(report.id);
                  toast.success("Report deleted");
                  navigate("/reports");
                } catch (e: any) {
                  toast.error(e?.message ?? "Delete failed");
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              variant="outline"
              size="sm"
              className="gap-2 h-9 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              {busy === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete report
            </Button>
          </div>
          {report.committed_to_db && report.committed_at && (
            <p className="text-[11px] text-muted-foreground mt-3">
              Promoted to live data on {new Date(report.committed_at).toLocaleString()}.
              All written rows reference this report via <code className="text-foreground/70">source_report_id</code>.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function KvRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="text-muted-foreground text-xs">{label}</TableCell>
      <TableCell className={`text-right text-xs ${mono ? "font-mono" : ""}`}>{value}</TableCell>
    </TableRow>
  );
}
