import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, FileX, Upload, Download, Loader2, Database } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedQuarter } from "@/contexts/QuarterContext";
import { parseWorkbook, detectQuarterFromFilename } from "@/lib/reconciliation/parseXlsx";
import { runReconciliation } from "@/lib/reconciliation/runReconciliation";
import { exportReconciliation } from "@/lib/reconciliation/exportRecon";
import { ingestWorkbook, type IngestSummary } from "@/lib/reconciliation/ingestWorkbook";
import { fmtUSD, fmtPct, fmtMultiple } from "@/lib/format";
import type { ReconciliationResult, DiffRow, FieldKind, Status } from "@/lib/reconciliation/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const formatValue = (v: number | string | null, kind: FieldKind): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  switch (kind) {
    case "currency": return fmtUSD(v);
    case "ratio": return fmtMultiple(v);
    case "percent":
    case "irr":
      return fmtPct(v, 2);
    default: return String(v);
  }
};

const formatDelta = (d: number | null, kind: FieldKind): string => {
  if (d === null) return "—";
  if (kind === "currency") return fmtUSD(d);
  if (kind === "irr" || kind === "percent") return `${(d * 100).toFixed(3)}%`;
  if (kind === "ratio") return d.toFixed(4);
  return String(d);
};

const StatusBadge = ({ status }: { status: Status }) => {
  if (status === "match") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> match
      </span>
    );
  }
  if (status === "over_tolerance") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5" /> over tolerance
      </span>
    );
  }
  if (status === "missing_in_system") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <FileX className="h-3.5 w-3.5" /> missing in system
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive">
      <FileX className="h-3.5 w-3.5" /> missing in source
    </span>
  );
};

const ReconciliationPage = () => {
  const { role, loading: authLoading } = useAuth();
  const { quarters, selected } = useSelectedQuarter();
  const [file, setFile] = useState<File | null>(null);
  const [quarterId, setQuarterId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [filter, setFilter] = useState<"all" | "issues">("all");

  if (!authLoading && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const handleFile = (f: File | null) => {
    setFile(f);
    setResult(null);
    if (f) {
      const detected = detectQuarterFromFilename(f.name);
      if (detected) {
        const q = quarters.find(
          (q) => q.fiscal_year === detected.fy && q.fiscal_quarter === detected.fq,
        );
        if (q) {
          setQuarterId(q.id);
          toast.success(`Auto-detected quarter: ${q.label}`);
          return;
        }
      }
      if (selected) setQuarterId(selected.id);
    }
  };

  const handleRun = async () => {
    if (!file || !quarterId) return;
    setRunning(true);
    setResult(null);
    try {
      const parsed = await parseWorkbook(file);
      const q = quarters.find((x) => x.id === quarterId)!;
      const r = await runReconciliation(parsed, quarterId, q.label);
      setResult(r);
      toast.success(`Reconciliation complete — ${r.matchedFields}/${r.totalFields} fields match`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  };

  const handleIngest = async () => {
    if (!file || !quarterId) return;
    if (!confirm(
      "This will TRUNCATE underlying_holdings for the selected quarter and re-insert " +
      "every row from the workbook with per-tranche granularity. Direct quarter snapshots " +
      "will be upserted. Continue?",
    )) return;
    setIngesting(true);
    setIngestSummary(null);
    try {
      const parsed = await parseWorkbook(file);
      const summary = await ingestWorkbook(parsed, quarterId);
      setIngestSummary(summary);
      toast.success(
        `Ingest complete — underlying ${summary.underlyingBefore} → ${summary.underlyingAfter}, ` +
        `directs snapshots ${summary.directsSnapshotsBefore} → ${summary.directsSnapshotsAfter}`,
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  };

  const allOk = result && result.overTolerance === 0 && result.missing === 0;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audit a TWH-1 Portfolio Metrics workbook against the live database for the selected
          quarter. Tolerances: $0.01 currency, 0.0001 ratios, 10 bps IRR.
        </p>
      </div>

      {/* Upload + run */}
      <Card className="p-6 bg-card border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="recon-file" className="text-xs uppercase tracking-wider text-muted-foreground">
              Workbook
            </Label>
            <Input
              id="recon-file"
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="cursor-pointer"
            />
            {file && (
              <p className="text-xs text-muted-foreground truncate">{file.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Quarter
            </Label>
            <Select value={quarterId} onValueChange={setQuarterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select quarter" />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleRun} disabled={!file || !quarterId || running || ingesting} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {running ? "Running…" : "Run reconciliation"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleIngest}
              disabled={!file || !quarterId || running || ingesting}
              className="gap-2"
              title="Truncate this quarter's underlying_holdings and re-insert per-tranche rows from the workbook"
            >
              {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {ingesting ? "Ingesting…" : "Ingest workbook"}
            </Button>
            {result && (
              <Button variant="outline" onClick={() => exportReconciliation(result)} className="gap-2">
                <Download className="h-4 w-4" /> Export
              </Button>
            )}
          </div>
        </div>
        {ingestSummary && (
          <div className="mt-4 pt-4 border-t border-border text-xs font-mono text-muted-foreground space-y-1">
            <div>
              Underlying holdings: <span className="text-foreground">{ingestSummary.underlyingBefore}</span> →{" "}
              <span className="text-emerald-500">{ingestSummary.underlyingAfter}</span>{" "}
              ({ingestSummary.underlyingInserted} inserted, {ingestSummary.underlyingSkipped.length} skipped)
            </div>
            <div>
              Direct quarter snapshots: <span className="text-foreground">{ingestSummary.directsSnapshotsBefore}</span> →{" "}
              <span className="text-emerald-500">{ingestSummary.directsSnapshotsAfter}</span>{" "}
              ({ingestSummary.directsSnapshotsUpserted} upserted, {ingestSummary.directsSkipped.length} skipped)
            </div>
            {ingestSummary.underlyingSkipped.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-amber-500">
                  {ingestSummary.underlyingSkipped.length} underlying rows skipped
                </summary>
                <ul className="mt-1 ml-4 space-y-0.5 max-h-40 overflow-auto">
                  {ingestSummary.underlyingSkipped.slice(0, 50).map((s, i) => (
                    <li key={i}>· {s.row.companyName} / {s.row.fundName} — {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* Summary banner */}
      {result && (
        <Card
          className={cn(
            "p-5 border",
            allOk
              ? "bg-emerald-500/5 border-emerald-500/30"
              : "bg-amber-500/5 border-amber-500/30",
          )}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {allOk ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              )}
              <div>
                <div className="text-base font-semibold text-foreground">
                  {allOk
                    ? `${result.matchedFields}/${result.totalFields} fields match ✓`
                    : `${result.overTolerance} fields over tolerance — expand to review`}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {result.quarterLabel} · {result.matchedFields} match · {result.overTolerance} over tol. ·{" "}
                  {result.missing} missing
                </div>
                {result.headerRows && Object.keys(result.headerRows).length > 0 && (
                  <div className="text-[11px] text-muted-foreground/80 mt-1 font-mono">
                    Header rows:{" "}
                    {Object.entries(result.headerRows)
                      .map(([sheet, idx]) => `${sheet}=row ${idx + 1}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                onClick={() => setFilter("all")}
              >
                All rows
              </Button>
              <Button
                size="sm"
                variant={filter === "issues" ? "default" : "outline"}
                onClick={() => setFilter("issues")}
              >
                Issues only
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Sections */}
      {result && (
        <Accordion
          type="multiple"
          defaultValue={result.sections.filter((s) => s.overTolerance + s.missingInSystem + s.missingInSource > 0).map((s) => s.section)}
          className="space-y-3"
        >
          {result.sections.map((section) => {
            const visible =
              filter === "all" ? section.rows : section.rows.filter((r) => r.status !== "match");
            return (
              <AccordionItem
                key={section.section}
                value={section.section}
                className="border border-border rounded-lg bg-card overflow-hidden"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{section.label}</span>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {section.matched}/{section.total}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {section.overTolerance > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {section.overTolerance}
                        </span>
                      )}
                      {section.missingInSystem + section.missingInSource > 0 && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <FileX className="h-3.5 w-3.5" />
                          {section.missingInSystem + section.missingInSource}
                        </span>
                      )}
                      {section.overTolerance + section.missingInSystem + section.missingInSource ===
                        0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5" /> all match
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-0">
                  {visible.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No rows to display.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[36%]">Identity</TableHead>
                          <TableHead className="w-[18%]">Field</TableHead>
                          <TableHead className="text-right">Source</TableHead>
                          <TableHead className="text-right">System</TableHead>
                          <TableHead className="text-right">Delta</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((row, i) => (
                          <DiffRowView key={i} row={row} />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {!result && !running && (
        <Card className="p-12 bg-card border-border border-dashed">
          <div className="text-center text-sm text-muted-foreground">
            Upload a TWH-1 Portfolio Metrics workbook and run reconciliation to see results.
          </div>
        </Card>
      )}
    </div>
  );
};

const DiffRowView = ({ row }: { row: DiffRow }) => (
  <TableRow>
    <TableCell className="text-xs text-foreground py-2.5">{row.identity}</TableCell>
    <TableCell className="text-xs text-muted-foreground py-2.5">{row.field}</TableCell>
    <TableCell className="text-right text-xs font-mono py-2.5">
      {formatValue(row.source, row.kind)}
    </TableCell>
    <TableCell className="text-right text-xs font-mono py-2.5">
      {formatValue(row.system, row.kind)}
    </TableCell>
    <TableCell
      className={cn(
        "text-right text-xs font-mono py-2.5",
        row.status === "over_tolerance" && "text-amber-500 font-medium",
      )}
    >
      {formatDelta(row.delta, row.kind)}
    </TableCell>
    <TableCell className="py-2.5">
      <StatusBadge status={row.status} />
    </TableCell>
  </TableRow>
);

export default ReconciliationPage;
