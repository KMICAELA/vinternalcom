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

// Exponential backoff for rate_limited responses: 2s, 4s, 8s (3 retries total).
const RATE_LIMIT_RETRY_DELAYS_MS = [2000, 4000, 8000];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    if (result.error === "rate_limited" && attempt < RATE_LIMIT_RETRY_DELAYS_MS.length) {
      await delay(RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
      continue;
    }
    return result;
  }

  return { payload: null, error: "Extraction failed", sourceType };
}
