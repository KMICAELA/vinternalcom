// /reports — persistent list of every uploaded quarterly report
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle2, AlertCircle, AlertTriangle, Loader2, FileText, Inbox,
  ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { reExtractReport, rePromoteReport } from "@/lib/reports/reportsApi";

type ReportRow = {
  id: string;
  file_name: string;
  fund_id: string | null;
  quarter_id: string | null;
  uploaded_at: string;
  extraction_status: "pending" | "success" | "error" | "needs_review";
  extraction_summary: any;
  committed_to_db: boolean;
  archived: boolean;
  funds: { name: string; short_name: string | null } | null;
  quarters: { label: string } | null;
  uploader: { full_name: string | null; email: string | null } | null;
};

const STATUS_META = {
  success: { label: "Success", icon: CheckCircle2, cls: "text-emerald-400 border-emerald-400/30" },
  needs_review: { label: "Needs review", icon: AlertTriangle, cls: "text-amber-400 border-amber-400/30" },
  error: { label: "Error", icon: AlertCircle, cls: "text-destructive border-destructive/30" },
  pending: { label: "Pending", icon: Loader2, cls: "text-muted-foreground border-border" },
} as const;

type SortKey = "uploaded_at" | "fund" | "quarter" | "status";
type SortDir = "asc" | "desc";

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fundFilter, setFundFilter] = useState<string>("all");
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("uploaded_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "extract" | "promote"; id: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("reports")
      .select(
        "id, file_name, fund_id, quarter_id, uploaded_at, extraction_status, extraction_summary, committed_to_db, archived, funds:fund_id(name, short_name), quarters:quarter_id(label), uploader:uploaded_by(full_name, email)",
      )
      .order("uploaded_at", { ascending: false })
      .limit(500);
    setRows((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fundOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.fund_id) m.set(r.fund_id, r.funds?.short_name ?? r.funds?.name ?? r.fund_id); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const quarterOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.quarter_id) m.set(r.quarter_id, r.quarters?.label ?? r.quarter_id); });
    return Array.from(m.entries()).sort((a, b) => b[1].localeCompare(a[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (!showArchived) list = list.filter((r) => !r.archived);
    if (statusFilter !== "all") list = list.filter((r) => r.extraction_status === statusFilter);
    if (fundFilter !== "all") list = list.filter((r) => r.fund_id === fundFilter);
    if (quarterFilter !== "all") list = list.filter((r) => r.quarter_id === quarterFilter);
    const f = filter.trim().toLowerCase();
    if (f) {
      list = list.filter(
        (r) =>
          r.file_name.toLowerCase().includes(f) ||
          (r.funds?.name ?? "").toLowerCase().includes(f) ||
          (r.funds?.short_name ?? "").toLowerCase().includes(f) ||
          (r.quarters?.label ?? "").toLowerCase().includes(f),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va =
        sortKey === "uploaded_at" ? a.uploaded_at :
        sortKey === "fund" ? (a.funds?.short_name ?? a.funds?.name ?? "") :
        sortKey === "quarter" ? (a.quarters?.label ?? "") :
        a.extraction_status;
      const vb =
        sortKey === "uploaded_at" ? b.uploaded_at :
        sortKey === "fund" ? (b.funds?.short_name ?? b.funds?.name ?? "") :
        sortKey === "quarter" ? (b.quarters?.label ?? "") :
        b.extraction_status;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [rows, filter, statusFilter, fundFilter, quarterFilter, showArchived, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "uploaded_at" ? "desc" : "asc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 opacity-40 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 inline ml-1" />
      : <ChevronDown className="h-3 w-3 inline ml-1" />;
  };

  const runReExtract = async (id: string) => {
    setBusyId(id);
    try {
      const r = await reExtractReport(id);
      toast.success(r.ok ? "Re-extraction complete" : `Re-extracted with warnings: ${r.error}`);
      await load();
    } catch (e: any) {
      toast.error(`Re-extract failed: ${e?.message ?? e}`);
    } finally { setBusyId(null); }
  };
  const runRePromote = async (id: string) => {
    setBusyId(id);
    try {
      const res = await rePromoteReport(id);
      toast.success(`Re-promoted (fund: ${res.fund_snapshots_written}, holdings: ${res.underlying_holdings_written}, directs: ${res.direct_snapshots_written})`);
      await load();
    } catch (e: any) {
      toast.error(`Re-promote failed: ${e?.message ?? e}`);
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-5 w-5 text-amber-400" />
            Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} report{filtered.length === 1 ? "" : "s"} · persistent history of every uploaded document
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-[180px] h-9" />
          <Select value={fundFilter} onValueChange={setFundFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Fund" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All funds</SelectItem>
              {fundOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={quarterFilter} onValueChange={setQuarterFilter}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Quarter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quarters</SelectItem>
              {quarterOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={showArchived ? "default" : "outline"} size="sm" className="h-9 text-xs" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>File</TableHead>
                <TableHead onClick={() => toggleSort("fund")} className="cursor-pointer select-none">Fund<SortIcon k="fund" /></TableHead>
                <TableHead onClick={() => toggleSort("quarter")} className="cursor-pointer select-none">Quarter<SortIcon k="quarter" /></TableHead>
                <TableHead onClick={() => toggleSort("uploaded_at")} className="cursor-pointer select-none">Uploaded<SortIcon k="uploaded_at" /></TableHead>
                <TableHead onClick={() => toggleSort("status")} className="cursor-pointer select-none">Status<SortIcon k="status" /></TableHead>
                <TableHead className="text-right">Holdings</TableHead>
                <TableHead>Live</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">No reports</TableCell></TableRow>
              ) : (
                filtered.map((r) => {
                  const meta = STATUS_META[r.extraction_status];
                  const Icon = meta.icon;
                  const holdings = r.extraction_summary?.holdings ?? 0;
                  const isBusy = busyId === r.id;
                  return (
                    <TableRow key={r.id} className="table-row-hover">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[320px]">{r.file_name}</span>
                          {r.archived && <Badge variant="outline" className="text-[9px]">Archived</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.funds?.short_name ?? r.funds?.name ?? <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.quarters?.label ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(r.uploaded_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" />{meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{holdings}</TableCell>
                      <TableCell>
                        {r.committed_to_db ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">Live</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                            <Link to={`/reports/${r.id}`}>View →</Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isBusy}>
                                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setConfirm({ kind: "extract", id: r.id, name: r.file_name })}>
                                Re-extract
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConfirm({ kind: "promote", id: r.id, name: r.file_name })}>
                                Re-promote
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link to={`/reports/${r.id}`}>Open detail</Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "extract" ? "Re-extract report?" : "Re-promote report?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "extract"
                ? `Re-runs AI extraction on the original file (${confirm?.name}). Overwrites the current extracted payload and resets the report to Draft.`
                : `Re-runs promotion on the existing payload of ${confirm?.name}. Use after FX rate updates or schema changes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                const c = confirm; setConfirm(null);
                if (c.kind === "extract") runReExtract(c.id); else runRePromote(c.id);
              }}
            >Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
