// /reports — persistent list of every uploaded quarterly report
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertCircle, AlertTriangle, Loader2, FileText, Inbox } from "lucide-react";

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

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (!showArchived) list = list.filter((r) => !r.archived);
    if (statusFilter !== "all") list = list.filter((r) => r.extraction_status === statusFilter);
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
    return list;
  }, [rows, filter, statusFilter, showArchived]);

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
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs h-9"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className="h-9 text-xs"
            onClick={() => setShowArchived((v) => !v)}
          >
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
                <TableHead>Fund</TableHead>
                <TableHead>Quarter</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
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
                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                          <Link to={`/reports/${r.id}`}>View →</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
