// Reusable extraction helper. Mirrors AddReportWizard.runExtraction file→base64/excel→invoke
// pipeline but without DB writes (uses dry_run). Returns the parsed payload.
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ExtractedHolding = {
  company_name: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
};

export type ExtractedPayload = {
  fund_name: string | null;
  report_date: string | null;
  currency: string | null;
  fund_total_contributions_usd: number | null;
  fund_total_nav_usd: number | null;
  twh_contributions_usd: number | null;
  twh_distributions_usd: number | null;
  twh_nav_usd: number | null;
  holdings: ExtractedHolding[];
  notes: string | null;
};

export type SourceType = "pdf" | "excel" | "email";

function detectSourceType(file: File): SourceType {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return "excel";
  if (n.endsWith(".eml") || n.endsWith(".txt") || n.endsWith(".msg")) return "email";
  // default to pdf for unknown
  return "pdf";
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function parseExcel(file: File): Promise<{ sheets: { name: string; rows: any[][] }[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
    return { name, rows };
  });
  return { sheets };
}

export interface ExtractionResult {
  payload: ExtractedPayload | null;
  error: string | null;
  sourceType: SourceType;
}

// Exponential backoff for rate_limited responses: 15s, 30s, 60s (3 retries total).
// These wait out Anthropic's per-minute ITPM window. If the 429 response includes
// a retry-after hint (seconds or ISO timestamp), we honor that instead.
const RATE_LIMIT_RETRY_DELAYS_MS = [15000, 30000, 60000];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Parse Anthropic 429 hint. Format from edge function is "rate_limited[:hint]".
// hint is either an integer number of seconds, or an ISO-8601 reset timestamp.
function parseRetryAfterMs(errMsg: string | null | undefined): number | null {
  if (!errMsg || !errMsg.startsWith("rate_limited")) return null;
  const idx = errMsg.indexOf(":");
  if (idx < 0) return null;
  const hint = errMsg.slice(idx + 1).trim();
  if (!hint) return null;
  // numeric seconds
  const asNum = Number(hint);
  if (Number.isFinite(asNum) && asNum > 0) return Math.min(asNum * 1000, 90000);
  // ISO timestamp
  const t = Date.parse(hint);
  if (Number.isFinite(t)) {
    const ms = t - Date.now();
    if (ms > 0) return Math.min(ms + 500, 90000);
  }
  return null;
}

/**
 * Run the AI extraction edge function in dry-run mode (no DB writes).
 * Used by the admin extraction sandbox to test extraction accuracy without touching live data.
 */
export async function runExtractFile(opts: {
  file: File;
  fundId?: string | null;
  quarterId?: string | null;
}): Promise<ExtractionResult> {
  const { file, fundId, quarterId } = opts;
  const sourceType = detectSourceType(file);

  const body: Record<string, unknown> = {
    source_type: sourceType,
    fund_id: fundId ?? null,
    quarter_id: quarterId ?? null,
    file_name: file.name,
    dry_run: true,
  };

  if (sourceType === "pdf") {
    body.pdf_base64 = await fileToBase64(file);
  } else if (sourceType === "excel") {
    body.excel_payload = await parseExcel(file);
  } else {
    // email — read as text
    const text = await file.text();
    body.email_text = text;
  }

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await supabase.functions.invoke("extract-report", { body });

    let result: ExtractionResult;
    if (error) {
      const ctx = (error as any).context;
      let msg = error.message ?? "Extraction failed";
      try {
        const respText = await ctx?.text?.();
        if (respText) {
          const j = JSON.parse(respText);
          if (j?.draft) {
            result = {
              payload: j.draft.normalized_payload ?? null,
              error: j.draft.error_message ?? msg,
              sourceType,
            };
          } else {
            result = { payload: null, error: j?.error ?? msg, sourceType };
          }
        } else {
          result = { payload: null, error: msg, sourceType };
        }
      } catch {
        result = { payload: null, error: msg, sourceType };
      }
    } else {
      const draft = data?.draft;
      result = draft
        ? { payload: draft.normalized_payload ?? null, error: draft.error_message ?? null, sourceType }
        : { payload: null, error: "No draft returned", sourceType };
    }

    const isRateLimited = !!result.error && result.error.startsWith("rate_limited");
    if (isRateLimited && attempt < RATE_LIMIT_RETRY_DELAYS_MS.length) {
      const hintMs = parseRetryAfterMs(result.error);
      const waitMs = hintMs ?? RATE_LIMIT_RETRY_DELAYS_MS[attempt];
      await delay(waitMs);
      continue;
    }
    // Normalize error label so the UI shows a clean "rate_limited" without the hint suffix.
    if (isRateLimited) result.error = "rate_limited";
    return result;
  }

  return { payload: null, error: "Extraction failed", sourceType };
}
