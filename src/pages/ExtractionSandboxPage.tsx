// Admin-only AI extraction sandbox. Test extraction from quarterly reports without
// touching live Supabase data. All state is in-memory; refresh/navigation wipes it.
//
// - Pick a quarter (any quarter, including future)
// - Upload one or more files; each tagged to a fund (or 1200VC / Direct)
// - Extraction runs via extract-report edge fn in dry_run mode (no DB writes)
// - Results render in Funds / Directs / Underlying / Portfolio tabs using same styling
// - Side-by-side toggle shows live DB values for the same fund/quarter for eyeball compare

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Trash2,
  FileText,
  FileSpreadsheet,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { fmtUSD, fmtMultiple, fmtPct, fmtDate, calcMoic, calcTvpi, calcDpi, signClass } from "@/lib/format";
import { runExtractFile, type ExtractedPayload, type SourceType } from "@/lib/extraction/runExtractFile";
import { inheritHoldingMetadata, type EnrichedHolding } from "@/lib/extraction/inheritHoldingMetadata";
import { scrubMagnitudes } from "@/lib/extraction/scrubMagnitudes";
import { saveReportDraft } from "@/lib/reports/reportsApi";
import { Save, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

const DIRECT_TAG = "__DIRECT__";

type Fund = { id: string; name: string; short_name: string | null };
type Quarter = { id: string; label: string; quarter_end_date: string };

type SandboxFile = {
  id: string;
  file: File;
  fundId: string | typeof DIRECT_TAG | null;
  status: "pending" | "extracting" | "done" | "error";
  payload?: ExtractedPayload;
  error?: string;
  sourceType?: SourceType;
};

// Max number of extraction calls in flight at once. Anthropic's per-minute
// Anthropic's per-minute input-token (ITPM) limits get hit fast when multiple
// large PDFs fire at once. PDFs are strictly sequential (1 at a time) since
// each carries a heavy base64 payload; lighter email/excel sources can run
// 2 in parallel. The runExtractFile helper handles per-call retry/backoff
// (15s → 30s → 60s, honoring Anthropic retry-after headers when present).
const PDF_CONCURRENCY = 1;
const LIGHT_CONCURRENCY = 2;

function isPdfFile(f: SandboxFile): boolean {
  return /\.pdf$/i.test(f.file.name);
}

// Live DB compare snapshots per fund (and per direct company) for the chosen quarter
type LiveFundSnap = {
  twh_contributions_usd: number;
  twh_distributions_usd: number;
  twh_nav_usd: number;
  fund_total_contributions_usd: number;
  fund_total_nav_usd: number;
};
type LiveHolding = {
  fund_id: string;
  company: string;
  fund_cost_usd: number;
  fund_fmv_usd: number;
  fund_proceeds_usd: number;
};
type LiveDirect = { company: string; fmv: number; proceeds: number; cost: number };

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const sourceIcon = (t?: SourceType) =>
  t === "excel" ? FileSpreadsheet : t === "email" ? Mail : FileText;

const numOrNull = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : Number(v);



// Merge fund-level fields from multiple files for the same fund: last-non-null wins
function mergeFundFields(payloads: ExtractedPayload[]): {
  twh_contributions_usd: number | null;
  twh_distributions_usd: number | null;
  twh_nav_usd: number | null;
  fund_total_contributions_usd: number | null;
  fund_total_nav_usd: number | null;
} {
  const out: any = {
    twh_contributions_usd: null,
    twh_distributions_usd: null,
    twh_nav_usd: null,
    fund_total_contributions_usd: null,
    fund_total_nav_usd: null,
  };
  for (const p of payloads) {
    for (const k of Object.keys(out)) {
      const v = (p as any)[k];
      if (v !== null && v !== undefined) out[k] = Number(v);
    }
  }
  return out;
}

// Compare cell helper — shows extracted on top, DB underneath if compare mode is on
function CompareCell({
  extracted,
  live,
  format,
  align = "right",
  compare,
}: {
  extracted: React.ReactNode;
  live?: React.ReactNode;
  format?: "currency" | "multiple" | "percent" | "text";
  align?: "left" | "right";
  compare: boolean;
}) {
  const justify = align === "right" ? "text-right" : "text-left";
  return (
    <div className={`${justify} font-mono leading-tight`}>
      <div>{extracted}</div>
      {compare && (
        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
          live: {live ?? "—"}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function ExtractionSandboxPage() {
  const { role, loading: roleLoading } = useAuth();
  if (roleLoading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }
  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <ExtractionSandboxInner />;
}

function ExtractionSandboxInner() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [quarterId, setQuarterId] = useState<string>("");
  const [files, setFiles] = useState<SandboxFile[]>([]);
  const [compare, setCompare] = useState(false);
  // Single uniform FX rate (USD per 1 unit of source currency, e.g. EUR).
  // Applied uniformly by the edge function to every numeric field after extraction.
  // 1.094 = ECB EUR/USD reference rate at 31/12/2025 (default for Quantonation reports).
  const [fxRate, setFxRate] = useState<string>("1.094");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live-DB snapshots for compare mode (re-fetched per quarter)
  const [liveFundSnaps, setLiveFundSnaps] = useState<Map<string, LiveFundSnap>>(new Map());
  const [liveHoldings, setLiveHoldings] = useState<LiveHolding[]>([]);
  const [liveDirects, setLiveDirects] = useState<LiveDirect[]>([]);

  // Load funds + quarters once
  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: q }] = await Promise.all([
        supabase.from("funds").select("id, name, short_name").eq("archived", false).order("name"),
        supabase
          .from("quarters")
          .select("id, label, quarter_end_date")
          .order("quarter_end_date", { ascending: false }),
      ]);
      setFunds((f as Fund[]) ?? []);
      setQuarters((q as Quarter[]) ?? []);
      if ((q?.length ?? 0) > 0) setQuarterId((q as Quarter[])[0].id);
    })();
  }, []);

  // Fetch live DB snapshots when quarter or compare toggle changes
  useEffect(() => {
    if (!quarterId) return;
    (async () => {
      const [snapsRes, holdsRes, directsRes] = await Promise.all([
        supabase
          .from("fund_quarter_snapshots")
          .select("fund_id, twh_contributions_usd, twh_distributions_usd, twh_nav_usd, fund_total_contributions_usd, fund_total_nav_usd")
          .eq("quarter_id", quarterId),
        supabase
          .from("underlying_holdings")
          .select("fund_id, fund_cost_usd, fund_fmv_usd, fund_proceeds_usd, companies(legal_name, commercial_name)")
          .eq("quarter_id", quarterId),
        supabase
          .from("direct_quarter_snapshots")
          .select("twh_fmv_usd, twh_proceeds_usd, directs(twh_cost_usd, companies(legal_name, commercial_name))")
          .eq("quarter_id", quarterId),
      ]);
      const m = new Map<string, LiveFundSnap>();
      (snapsRes.data ?? []).forEach((s: any) =>
        m.set(s.fund_id, {
          twh_contributions_usd: Number(s.twh_contributions_usd ?? 0),
          twh_distributions_usd: Number(s.twh_distributions_usd ?? 0),
          twh_nav_usd: Number(s.twh_nav_usd ?? 0),
          fund_total_contributions_usd: Number(s.fund_total_contributions_usd ?? 0),
          fund_total_nav_usd: Number(s.fund_total_nav_usd ?? 0),
        }),
      );
      setLiveFundSnaps(m);
      setLiveHoldings(
        (holdsRes.data ?? []).map((h: any) => ({
          fund_id: h.fund_id,
          company: h.companies?.commercial_name ?? h.companies?.legal_name ?? "—",
          fund_cost_usd: Number(h.fund_cost_usd ?? 0),
          fund_fmv_usd: Number(h.fund_fmv_usd ?? 0),
          fund_proceeds_usd: Number(h.fund_proceeds_usd ?? 0),
        })),
      );
      setLiveDirects(
        (directsRes.data ?? []).map((d: any) => ({
          company: d.directs?.companies?.commercial_name ?? d.directs?.companies?.legal_name ?? "—",
          cost: Number(d.directs?.twh_cost_usd ?? 0),
          fmv: Number(d.twh_fmv_usd ?? 0),
          proceeds: Number(d.twh_proceeds_usd ?? 0),
        })),
      );
    })();
  }, [quarterId]);

  // Warn on unload if files are loaded
  useEffect(() => {
    if (files.length === 0) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [files.length]);

  // Admin gate handled by wrapper above

  // ──────────────── Actions ────────────────

  function addFiles(filesPicked: FileList | null) {
    if (!filesPicked || filesPicked.length === 0) return;
    const next: SandboxFile[] = Array.from(filesPicked).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      fundId: null,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...next]);
  }

  function setFileFund(id: string, fundId: string) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, fundId } : f)));
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    setFiles([]);
  }

  const navigate = useNavigate();

  async function saveAllAsDrafts() {
    const ready = files.filter((f) => f.status === "done" && f.fundId);
    if (ready.length === 0) {
      toast.error("Nothing to save — extract at least one file first");
      return;
    }
    const t = toast.loading(`Saving ${ready.length} draft${ready.length === 1 ? "" : "s"}…`);
    let savedId: string | null = null;
    let failed = 0;
    for (const f of ready) {
      try {
        const fundIdForReport = f.fundId === DIRECT_TAG ? null : (f.fundId as string);
        const r = await saveReportDraft({
          file: f.file,
          fundId: fundIdForReport,
          quarterId: quarterId || null,
          payload: f.payload ?? null,
          errorMessage: f.error ?? null,
          summary: { source_type: f.sourceType, sandbox: true },
        });
        savedId = r.id;
      } catch (e) {
        failed += 1;
        console.error("saveReportDraft failed", e);
      }
    }
    toast.dismiss(t);
    if (failed > 0) {
      toast.warning(`Saved ${ready.length - failed} of ${ready.length} drafts (${failed} failed)`);
    } else {
      toast.success(`Saved ${ready.length} draft${ready.length === 1 ? "" : "s"} to /reports`, {
        action: savedId && ready.length === 1 ? {
          label: "Open",
          onClick: () => navigate(`/reports/${savedId}`),
        } : { label: "View all", onClick: () => navigate("/reports") },
      });
    }
  }

  async function runOne(f: SandboxFile) {
    setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: "extracting", error: undefined } : x)));
    const fundIdForApi = f.fundId === DIRECT_TAG ? null : f.fundId;
    try {
      const fxNum = Number(fxRate);
      const res = await runExtractFile({
        file: f.file,
        fundId: fundIdForApi,
        quarterId,
        fxRateOverride: Number.isFinite(fxNum) && fxNum > 0 ? fxNum : null,
      });
      setFiles((prev) =>
        prev.map((x) =>
          x.id === f.id
            ? {
                ...x,
                status: res.error && !res.payload ? "error" : "done",
                payload: res.payload ?? undefined,
                error: res.error ?? undefined,
                sourceType: res.sourceType,
              }
            : x,
        ),
      );
      return res;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      setFiles((prev) =>
        prev.map((x) =>
          x.id === f.id
            ? { ...x, status: "error", error: message }
            : x,
        ),
      );
      return { payload: null, error: message, sourceType: f.sourceType };
    }
  }

  async function runAllPending() {
    const pending = files.filter((f) => f.status === "pending" && f.fundId);
    if (pending.length === 0) {
      toast.error("Nothing to extract — tag each file with a fund first");
      return;
    }
    let failed = 0;
    // Split into PDF queue (concurrency 1, heavy ITPM) and light queue (email/excel, concurrency 2).
    const pdfQueue = pending.filter(isPdfFile);
    const lightQueue = pending.filter((f) => !isPdfFile(f));

    const runQueue = async (queue: SandboxFile[], concurrency: number) => {
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= queue.length) return;
          const res = await runOne(queue[i]);
          if (res.error && !res.payload) failed += 1;
        }
      };
      const workers = Array.from(
        { length: Math.min(concurrency, queue.length) },
        () => worker(),
      );
      await Promise.all(workers);
    };

    await Promise.all([
      runQueue(pdfQueue, PDF_CONCURRENCY),
      runQueue(lightQueue, LIGHT_CONCURRENCY),
    ]);

    if (failed > 0) {
      toast.warning(`Extraction finished: ${pending.length - failed} succeeded, ${failed} failed`);
    } else {
      toast.success(`Extracted ${pending.length} file${pending.length === 1 ? "" : "s"}`);
    }
  }

  // ──────────────── Aggregations ────────────────

  // Group files by fundId for the Funds tab and Underlying tab.
  // Files tagged DIRECT_TAG feed the Directs tab.
  const fileGroups = useMemo(() => {
    const byFund = new Map<string, SandboxFile[]>();
    const directs: SandboxFile[] = [];
    for (const f of files) {
      if (f.status !== "done" || !f.payload) continue;
      if (f.fundId === DIRECT_TAG) directs.push(f);
      else if (f.fundId) {
        const arr = byFund.get(f.fundId) ?? [];
        arr.push(f);
        byFund.set(f.fundId, arr);
      }
    }
    return { byFund, directs };
  }, [files]);

  // Funds tab rows — one per tagged fund
  const fundRows = useMemo(() => {
    const out: Array<{
      fundId: string;
      fundLabel: string;
      sourcesCount: number;
      merged: ReturnType<typeof mergeFundFields>;
    }> = [];
    for (const [fundId, fs] of fileGroups.byFund) {
      const merged = mergeFundFields(fs.map((f) => f.payload!));
      const fund = funds.find((f) => f.id === fundId);
      out.push({
        fundId,
        fundLabel: fund?.short_name ?? fund?.name ?? "(unknown fund)",
        sourcesCount: fs.length,
        merged,
      });
    }
    return out.sort((a, b) => a.fundLabel.localeCompare(b.fundLabel));
  }, [fileGroups, funds]);

  // Underlying tab rows — flatten holdings across all fund-tagged files.
  // Enriched in an effect because inheritance requires a DB read.
  type UnderlyingRow = {
    key: string;
    fundLabel: string;
    company: string;
    instrument: string | null;
    round: string | null;
    cost: number;
    fmv: number;
    proceeds: number;
    inherited_from_prior?: boolean;
    needs_review?: boolean;
    needs_round_review?: boolean;
  };
  const [underlyingRows, setUnderlyingRows] = useState<UnderlyingRow[]>([]);

  useEffect(() => {
    const currentQ = quarters.find((q) => q.id === quarterId);
    const currentEnd = currentQ?.quarter_end_date ?? null;
    let cancelled = false;
    (async () => {
      const out: UnderlyingRow[] = [];
      for (const [fundId, fs] of fileGroups.byFund) {
        const fund = funds.find((f) => f.id === fundId);
        const fundLabel = fund?.short_name ?? fund?.name ?? "(unknown)";
        // Flatten + dedupe by company within this fund (last-non-null wins)
        const byCompany = new Map<string, EnrichedHolding>();
        for (const f of fs) {
          for (const h of f.payload!.holdings ?? []) {
            const name = (h.company_name ?? "").trim();
            if (!name) continue;
            const k = name.toLowerCase();
            const existing = byCompany.get(k) ?? { ...h, company_name: name };
            if (h.fund_cost_usd != null) existing.fund_cost_usd = h.fund_cost_usd;
            if (h.fund_fmv_usd != null) existing.fund_fmv_usd = h.fund_fmv_usd;
            if (h.fund_proceeds_usd != null) existing.fund_proceeds_usd = h.fund_proceeds_usd;
            if (h.round) existing.round = h.round;
            if (h.instrument) existing.instrument = h.instrument;
            byCompany.set(k, existing);
          }
        }
        const enrichedRaw = await inheritHoldingMetadata({
          fundId,
          holdings: Array.from(byCompany.values()),
          currentQuarterEndDate: currentEnd,
        });
        // Combine notes from all files for this fund and run the magnitude scrubber
        // (catches "$2m" → 200,000 class of bugs the model occasionally introduces).
        const combinedNotes = fs
          .map((f) => f.payload?.notes ?? "")
          .filter(Boolean)
          .join("\n\n");
        const enriched = scrubMagnitudes(combinedNotes, enrichedRaw);
        for (const h of enriched) {
          out.push({
            key: `${fundId}::${h.company_name.toLowerCase()}`,
            fundLabel,
            company: h.company_name,
            instrument: h.instrument ?? null,
            round: h.round ?? null,
            cost: Number(h.fund_cost_usd ?? 0),
            fmv: Number(h.fund_fmv_usd ?? 0),
            proceeds: Number(h.fund_proceeds_usd ?? 0),
            inherited_from_prior: h.inherited_from_prior,
            needs_review: h.needs_review,
            needs_round_review: h.needs_round_review,
          });
        }
      }
      out.sort((a, b) => b.fmv - a.fmv);
      if (!cancelled) setUnderlyingRows(out);
    })();
    return () => { cancelled = true; };
  }, [fileGroups, funds, quarters, quarterId]);

  // Directs tab rows — from DIRECT_TAG files. Use holdings as the direct positions.
  const directRows = useMemo(() => {
    type Row = {
      key: string;
      company: string;
      investment_date: string | null;
      instrument: string | null;
      round: string | null;
      cost: number;
      fmv: number;
      proceeds: number;
    };
    const byCompany = new Map<string, Row>();
    for (const f of fileGroups.directs) {
      for (const h of f.payload!.holdings ?? []) {
        const name = (h.company_name ?? "").trim();
        if (!name) continue;
        const k = name.toLowerCase();
        const existing = byCompany.get(k) ?? {
          key: k,
          company: name,
          investment_date: h.investment_date ?? null,
          instrument: h.instrument ?? null,
          round: h.round ?? null,
          cost: 0,
          fmv: 0,
          proceeds: 0,
        };
        if (h.investment_date) existing.investment_date = h.investment_date;
        if (h.instrument) existing.instrument = h.instrument;
        if (h.round) existing.round = h.round;
        if (h.fund_cost_usd !== null && h.fund_cost_usd !== undefined) existing.cost = Number(h.fund_cost_usd);
        if (h.fund_fmv_usd !== null && h.fund_fmv_usd !== undefined) existing.fmv = Number(h.fund_fmv_usd);
        if (h.fund_proceeds_usd !== null && h.fund_proceeds_usd !== undefined) existing.proceeds = Number(h.fund_proceeds_usd);
        byCompany.set(k, existing);
      }
    }
    return Array.from(byCompany.values()).sort((a, b) => b.fmv - a.fmv);
  }, [fileGroups]);

  const fundsTotals = fundRows.reduce(
    (a, r) => ({
      contrib: a.contrib + (r.merged.twh_contributions_usd ?? 0),
      distrib: a.distrib + (r.merged.twh_distributions_usd ?? 0),
      nav: a.nav + (r.merged.twh_nav_usd ?? 0),
    }),
    { contrib: 0, distrib: 0, nav: 0 },
  );
  const underlyingTotals = underlyingRows.reduce(
    (a, r) => ({ cost: a.cost + r.cost, fmv: a.fmv + r.fmv, proceeds: a.proceeds + r.proceeds }),
    { cost: 0, fmv: 0, proceeds: 0 },
  );
  const directTotals = directRows.reduce(
    (a, r) => ({ cost: a.cost + r.cost, fmv: a.fmv + r.fmv, proceeds: a.proceeds + r.proceeds }),
    { cost: 0, fmv: 0, proceeds: 0 },
  );

  // Live underlying lookup: fundId+companyName → live row
  const liveHoldingsLookup = useMemo(() => {
    const m = new Map<string, LiveHolding>();
    liveHoldings.forEach((h) => m.set(`${h.fund_id}::${h.company.toLowerCase()}`, h));
    return m;
  }, [liveHoldings]);
  const liveDirectsLookup = useMemo(() => {
    const m = new Map<string, LiveDirect>();
    liveDirects.forEach((d) => m.set(d.company.toLowerCase(), d));
    return m;
  }, [liveDirects]);

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  const doneCount = files.filter((f) => f.status === "done").length;
  const allTagged = files.length > 0 && files.every((f) => f.fundId);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-400" />
            Extraction Sandbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test AI extraction from quarterly reports. <span className="text-amber-400/90">Read-only — nothing is written to the database.</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="compare" checked={compare} onCheckedChange={setCompare} />
            <Label htmlFor="compare" className="text-xs cursor-pointer">Compare to live DB</Label>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={saveAllAsDrafts}
            disabled={files.filter((f) => f.status === "done" && f.fundId).length === 0}
            className="gap-2"
          >
            <Save className="h-4 w-4" /> Save as drafts
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} disabled={files.length === 0} className="gap-2">
            <Trash2 className="h-4 w-4" /> Clear sandbox
          </Button>
        </div>
      </div>

      {/* Quarter selector + uploader */}
      <Card className="bg-card border-border p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">Reporting period</Label>
            <Select value={quarterId} onValueChange={setQuarterId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select quarter" /></SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.eml,.txt"
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
            />
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Add files
            </Button>
            <Button
              variant="default"
              onClick={runAllPending}
              disabled={!allTagged || files.every((f) => f.status !== "pending")}
              className="gap-2"
            >
              Run extraction
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {files.length} file{files.length === 1 ? "" : "s"} · {doneCount} extracted
            </span>
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            {files.map((f) => {
              const Icon = sourceIcon(f.sourceType);
              return (
                <div key={f.id} className="flex items-center gap-3 px-2 py-2 rounded bg-muted/30">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{f.file.name}</span>
                  <Select value={f.fundId ?? ""} onValueChange={(v) => setFileFund(f.id, v)}>
                    <SelectTrigger className="w-[220px] h-8 text-xs"><SelectValue placeholder="Tag with fund…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DIRECT_TAG}>1200VC / Direct</SelectItem>
                      {funds.map((fund) => (
                        <SelectItem key={fund.id} value={fund.id}>{fund.short_name ?? fund.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="w-32 text-right">
                    {f.status === "pending" && <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                    {f.status === "extracting" && (
                      <Badge variant="outline" className="text-[10px] gap-1"><Loader2 className="h-3 w-3 animate-spin" />Extracting</Badge>
                    )}
                    {f.status === "done" && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-emerald-400 border-emerald-400/30">
                        <CheckCircle2 className="h-3 w-3" />
                        {(f.payload?.holdings?.length ?? 0)} holdings
                      </Badge>
                    )}
                    {f.status === "error" && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30">
                        <AlertCircle className="h-3 w-3" />Error
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeFile(f.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {files.some((f) => f.error) && (
              <div className="text-[11px] text-destructive/80 px-2">
                {files.filter((f) => f.error).map((f) => (
                  <div key={f.id}>{f.file.name}: {f.error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="funds">
        <TabsList>
          <TabsTrigger value="funds">Funds ({fundRows.length})</TabsTrigger>
          <TabsTrigger value="directs">Directs ({directRows.length})</TabsTrigger>
          <TabsTrigger value="underlying">Underlying ({underlyingRows.length})</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
        </TabsList>

        {/* ──────── Funds ──────── */}
        <TabsContent value="funds">
          <Card className="bg-card border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">TWH Contrib</TableHead>
                    <TableHead className="text-right">TWH Distrib</TableHead>
                    <TableHead className="text-right">TWH NAV</TableHead>
                    <TableHead className="text-right">Fund Total Contrib</TableHead>
                    <TableHead className="text-right">Fund Total NAV</TableHead>
                    <TableHead className="text-right">DPI</TableHead>
                    <TableHead className="text-right">TVPI</TableHead>
                    <TableHead>Sources</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fundRows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-muted-foreground py-12 text-center">
                      No fund extractions yet. Upload files and tag them to a fund.
                    </TableCell></TableRow>
                  ) : (
                    <>
                      {fundRows.map((r) => {
                        const live = liveFundSnaps.get(r.fundId);
                        const tvpi = calcTvpi(
                          r.merged.twh_contributions_usd ?? 0,
                          r.merged.twh_distributions_usd ?? 0,
                          r.merged.twh_nav_usd ?? 0,
                        );
                        const dpi = calcDpi(
                          r.merged.twh_contributions_usd ?? 0,
                          r.merged.twh_distributions_usd ?? 0,
                        );
                        const liveTvpi = live ? calcTvpi(live.twh_contributions_usd, live.twh_distributions_usd, live.twh_nav_usd) : null;
                        const liveDpi = live ? calcDpi(live.twh_contributions_usd, live.twh_distributions_usd) : null;
                        return (
                          <TableRow key={r.fundId} className="table-row-hover">
                            <TableCell className="font-medium">{r.fundLabel}</TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.merged.twh_contributions_usd ?? 0, { compact: true })}
                              live={live ? fmtUSD(live.twh_contributions_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.merged.twh_distributions_usd ?? 0, { compact: true })}
                              live={live ? fmtUSD(live.twh_distributions_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.merged.twh_nav_usd ?? 0, { compact: true })}
                              live={live ? fmtUSD(live.twh_nav_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.merged.fund_total_contributions_usd ?? 0, { compact: true })}
                              live={live ? fmtUSD(live.fund_total_contributions_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.merged.fund_total_nav_usd ?? 0, { compact: true })}
                              live={live ? fmtUSD(live.fund_total_nav_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtMultiple(dpi)}
                              live={fmtMultiple(liveDpi)} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtMultiple(tvpi)}
                              live={fmtMultiple(liveTvpi)} /></TableCell>
                            <TableCell>
                              {r.sourcesCount > 1 ? (
                                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
                                  ⚠ {r.sourcesCount} sources merged
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">1 source</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t-2 border-border font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(fundsTotals.contrib, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(fundsTotals.distrib, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(fundsTotals.nav, { compact: true })}</TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right font-mono">{fmtMultiple(calcDpi(fundsTotals.contrib, fundsTotals.distrib))}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMultiple(calcTvpi(fundsTotals.contrib, fundsTotals.distrib, fundsTotals.nav))}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ──────── Directs ──────── */}
        <TabsContent value="directs">
          <Card className="bg-card border-border overflow-hidden">
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">
                      No direct extractions. Tag files with "1200VC / Direct".
                    </TableCell></TableRow>
                  ) : (
                    <>
                      {directRows.map((r) => {
                        const live = liveDirectsLookup.get(r.company.toLowerCase());
                        const moic = calcMoic(r.cost, r.fmv, r.proceeds);
                        const gain = r.fmv + r.proceeds - r.cost;
                        const liveMoic = live ? calcMoic(live.cost, live.fmv, live.proceeds) : null;
                        return (
                          <TableRow key={r.key} className="table-row-hover">
                            <TableCell className="font-medium">{r.company}</TableCell>
                            <TableCell className="text-muted-foreground">{fmtDate(r.investment_date)}</TableCell>
                            <TableCell>{r.round ? <Badge variant="secondary" className="font-normal">{r.round}</Badge> : "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{r.instrument ?? "—"}</TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.cost, { compact: true })}
                              live={live ? fmtUSD(live.cost, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.fmv, { compact: true })}
                              live={live ? fmtUSD(live.fmv, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.proceeds, { compact: true })}
                              live={live ? fmtUSD(live.proceeds, { compact: true }) : "—"} /></TableCell>
                            <TableCell>
                              <CompareCell compare={compare}
                                extracted={<span className={signClass(gain)}>{fmtMultiple(moic)}</span>}
                                live={fmtMultiple(liveMoic)} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t-2 border-border font-semibold">
                        <TableCell colSpan={4}>Total</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(directTotals.cost, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(directTotals.fmv, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(directTotals.proceeds, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtMultiple(calcMoic(directTotals.cost, directTotals.fmv, directTotals.proceeds))}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ──────── Underlying ──────── */}
        <TabsContent value="underlying">
          <Card className="bg-card border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Company</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Round</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead className="text-right">Fund Cost</TableHead>
                    <TableHead className="text-right">Fund FMV</TableHead>
                    <TableHead className="text-right">Fund Proceeds</TableHead>
                    <TableHead className="text-right">MOIC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {underlyingRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-muted-foreground py-12 text-center">
                      No underlying holdings extracted yet.
                    </TableCell></TableRow>
                  ) : (
                    <>
                      {underlyingRows.map((r) => {
                        const fundId = r.key.split("::")[0];
                        const live = liveHoldingsLookup.get(`${fundId}::${r.company.toLowerCase()}`);
                        const moic = calcMoic(r.cost, r.fmv, r.proceeds);
                        const gain = r.fmv + r.proceeds - r.cost;
                        const liveMoic = live ? calcMoic(live.fund_cost_usd, live.fund_fmv_usd, live.fund_proceeds_usd) : null;
                        const hasTbd = r.cost === 0 || r.fmv === 0; // sandbox still uses 0 as placeholder; treat as TBD-ish
                        const flagReason = r.needs_review
                          ? "Material change vs prior quarter or unquantified narrative event — confirm before saving"
                          : r.needs_round_review
                          ? "Round not stated — please confirm"
                          : null;
                        return (
                          <TableRow key={r.key} className="table-row-hover">
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                {r.company}
                                {flagReason && (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs max-w-[260px]">
                                        {flagReason}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {!flagReason && r.inherited_from_prior && (
                                  <span className="text-[10px] text-muted-foreground/70" title="Inherited from prior quarter">↳</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-[260px] truncate">{r.fundLabel}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{r.round ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{r.instrument ?? "—"}</TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.cost, { compact: true })}
                              live={live ? fmtUSD(live.fund_cost_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.fmv, { compact: true })}
                              live={live ? fmtUSD(live.fund_fmv_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell><CompareCell compare={compare}
                              extracted={fmtUSD(r.proceeds, { compact: true })}
                              live={live ? fmtUSD(live.fund_proceeds_usd, { compact: true }) : "—"} /></TableCell>
                            <TableCell>
                              <CompareCell compare={compare}
                                extracted={<span className={signClass(gain)}>{fmtMultiple(moic)}</span>}
                                live={fmtMultiple(liveMoic)} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t-2 border-border font-semibold">
                        <TableCell colSpan={4}>Total</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(underlyingTotals.cost, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(underlyingTotals.fmv, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUSD(underlyingTotals.proceeds, { compact: true })}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtMultiple(calcMoic(underlyingTotals.cost, underlyingTotals.fmv, underlyingTotals.proceeds))}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ──────── Portfolio ──────── */}
        <TabsContent value="portfolio">
          <Card className="bg-card border-border p-8 text-sm text-muted-foreground">
            <div className="space-y-2">
              <div className="text-foreground font-medium">Portfolio commentary</div>
              <p>
                The current extraction pipeline (<code className="text-xs">extract-report</code>) returns financial fields and a holdings schedule only — it does not parse qualitative commentary fields (what they do, target market, tailwinds, challenges).
              </p>
              <p className="text-xs">
                Extend the extractor's system prompt + payload schema to populate this tab in a future iteration.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
