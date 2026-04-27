// Extracts fund quarterly report data using Anthropic Claude Sonnet 4.5.
// Accepts PDF (base64), parsed Excel rows (JSON), or email text / .eml content.
// Persists a draft into extraction_drafts with status='pending_review'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

type ExtractedHolding = {
  company_name: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
};

type ExtractedPayload = {
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

const SYSTEM_BASE = `You are a financial-statement extraction agent for a venture fund-of-funds called TWH (Americas Fund I, managed by 1200VC).
Your task is to extract structured data from a fund quarterly report and return ONLY a JSON object matching the schema below.
All numeric amounts MUST be in USD base units (no thousands separators, no currency symbol). Use null when a value is not present.

{
  "fund_name": string | null,
  "report_date": "YYYY-MM-DD" | null,
  "currency": "USD" | "EUR" | "GBP" | string | null,
  "fund_total_contributions_usd": number | null,   // total capital called from ALL LPs
  "fund_total_nav_usd": number | null,             // total fund NAV across ALL LPs
  "twh_contributions_usd": number | null,          // capital called from TWH only
  "twh_distributions_usd": number | null,          // distributions returned to TWH only
  "twh_nav_usd": number | null,                    // TWH partner-capital NAV / ending balance
  "holdings": [
    {
      "company_name": string,
      "investment_date": "YYYY-MM-DD" | null,
      "instrument": string | null,                 // SAFE, Equity, Convertible Note, etc.
      "round": string | null,                      // Seed, Series A, etc.
      "fund_cost_usd": number | null,              // FUND-level invested cost in this company
      "fund_fmv_usd": number | null,               // FUND-level fair-market-value
      "fund_proceeds_usd": number | null           // FUND-level realized proceeds to date
    }
  ],
  "notes": string | null                            // brief one-line summary of confidence / caveats
}

Rules:
- "twh_*" fields refer to TWH's pro-rata share (often shown on a Partner Capital Account Statement / PCAP).
- "fund_total_*" fields are the WHOLE FUND amounts, not TWH share.
- holdings[] is the fund-level portfolio schedule (one row per company). Skip subtotals/totals.
- Convert non-USD figures using the report's stated FX rate if present; otherwise leave currency and report numbers in source units (we'll convert later).
- Do NOT invent companies. If the source has no holdings table, return holdings: [].
- Do NOT wrap your answer in markdown. Return ONLY the JSON object.`;

const SYSTEM_BY_TYPE: Record<string, string> = {
  pdf: `${SYSTEM_BASE}\n\nThe source is a PDF financial statement. It may be a formal PCAP, audited financials, or a capital-account letter.`,
  excel: `${SYSTEM_BASE}\n\nThe source is a spreadsheet provided as a JSON array of sheets (each with a name and rows-of-cells). Treat empty cells as null.`,
  email: `${SYSTEM_BASE}\n\nThe source is the body text of an LP letter or email update. It is narrative and informal — extract whatever metrics are explicitly stated and leave everything else as null. Do NOT guess.`,
};

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch {
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1].trim()); } catch { /* fall through */ } }
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

// Minimal .eml plain-text extractor (no external deps).
// Returns { body, attachments: [{filename, contentType, base64}] }
function parseEml(emlText: string): { body: string; attachments: { filename: string; contentType: string; base64: string }[] } {
  const attachments: { filename: string; contentType: string; base64: string }[] = [];
  let body = "";

  const headerEnd = emlText.indexOf("\r\n\r\n");
  const split = headerEnd >= 0 ? headerEnd : emlText.indexOf("\n\n");
  if (split < 0) return { body: emlText, attachments };

  const headerBlock = emlText.slice(0, split);
  const rest = emlText.slice(split + (emlText[split + 1] === "\n" ? 2 : 4));

  const ctMatch = headerBlock.match(/Content-Type:\s*([^;\r\n]+)(?:;\s*boundary="?([^";\r\n]+)"?)?/i);
  const contentType = ctMatch?.[1]?.toLowerCase() ?? "text/plain";
  const boundary = ctMatch?.[2];

  if (contentType.startsWith("multipart/") && boundary) {
    const parts = rest.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?`));
    for (const part of parts) {
      if (!part.trim()) continue;
      const partHeaderEnd = part.indexOf("\r\n\r\n");
      const ps = partHeaderEnd >= 0 ? partHeaderEnd : part.indexOf("\n\n");
      if (ps < 0) continue;
      const partHeaders = part.slice(0, ps);
      const partBody = part.slice(ps + (part[ps + 1] === "\n" ? 2 : 4));

      const partCt = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i)?.[1]?.toLowerCase() ?? "text/plain";
      const filename = partHeaders.match(/filename="?([^";\r\n]+)"?/i)?.[1];
      const transferEnc = partHeaders.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1]?.toLowerCase().trim();

      if (filename && (partCt.includes("pdf") || partCt.includes("excel") || partCt.includes("spreadsheet") || /\.(pdf|xlsx?|csv)$/i.test(filename))) {
        const base64 = transferEnc === "base64" ? partBody.replace(/\s+/g, "") : btoa(unescape(encodeURIComponent(partBody)));
        attachments.push({ filename, contentType: partCt, base64 });
      } else if (partCt.startsWith("text/plain") && !body) {
        body = transferEnc === "base64" ? atob(partBody.replace(/\s+/g, "")) : partBody;
      } else if (partCt.startsWith("text/html") && !body) {
        const html = transferEnc === "base64" ? atob(partBody.replace(/\s+/g, "")) : partBody;
        body = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  } else {
    body = rest;
  }
  return { body: body.trim(), attachments };
}

async function callAnthropic(apiKey: string, systemPrompt: string, userBlocks: unknown[]): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userBlocks }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("rate_limited");
    if (resp.status === 401 || resp.status === 403) throw new Error("auth_failed");
    throw new Error(`anthropic_error:${resp.status}:${t.slice(0, 500)}`);
  }
  const data = await resp.json();
  const blocks = data.content ?? [];
  return blocks.map((b: any) => (b.type === "text" ? b.text : "")).join("\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const body = await req.json();
    const {
      source_type,           // "pdf" | "excel" | "email"
      fund_id,               // uuid (optional but recommended)
      quarter_id,            // uuid (optional but recommended)
      file_name,
      pdf_base64,            // string
      excel_payload,         // { sheets: [{ name, rows: any[][] }] }
      email_text,            // raw pasted body
      eml_base64,            // raw .eml file as base64
      dry_run,               // boolean — if true, skip ALL DB writes (sandbox mode)
    } = body ?? {};

    if (!["pdf", "excel", "email"].includes(source_type)) {
      return new Response(JSON.stringify({ error: "source_type must be pdf | excel | email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build a placeholder source_documents row so the draft has a valid FK.
    const { data: sourceDoc, error: srcErr } = await supabase
      .from("source_documents")
      .insert({
        fund_id: fund_id ?? null,
        quarter_id: quarter_id ?? null,
        doc_type: source_type === "pdf" ? "pdf_report" : source_type === "excel" ? "excel_report" : "email_report",
        original_filename: file_name ?? null,
        storage_path: `inline/${source_type}/${Date.now()}`,
        status: "extracting",
      })
      .select("id")
      .single();
    if (srcErr) throw new Error(`source_documents insert failed: ${srcErr.message}`);
    const source_document_id = sourceDoc.id as string;

    // Build user content per source type.
    let userBlocks: unknown[] = [];
    let systemPrompt = SYSTEM_BY_TYPE[source_type];

    if (source_type === "pdf") {
      if (!pdf_base64) throw new Error("pdf_base64 required for source_type=pdf");
      userBlocks = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf_base64 } },
        { type: "text", text: `Extract the fund quarterly metrics and the holdings schedule from this PDF (${file_name ?? "report"}). Return ONLY the JSON object.` },
      ];
    } else if (source_type === "excel") {
      if (!excel_payload?.sheets?.length) throw new Error("excel_payload.sheets required");
      const text = `Spreadsheet name: ${file_name ?? "report.xlsx"}\n\n` +
        excel_payload.sheets.map((s: any) => `=== Sheet: ${s.name} ===\n${(s.rows || []).slice(0, 400).map((r: any[]) => r.join("\t")).join("\n")}`).join("\n\n");
      userBlocks = [
        { type: "text", text: `Extract the fund quarterly metrics and the holdings schedule from this spreadsheet content. Return ONLY the JSON object.\n\n${text}` },
      ];
    } else {
      // email
      let bodyText = email_text ?? "";
      const extraAttachments: { filename: string; contentType: string; base64: string }[] = [];
      if (eml_base64) {
        const decoded = atob(eml_base64);
        const parsed = parseEml(decoded);
        if (parsed.body) bodyText = `${bodyText}\n\n${parsed.body}`.trim();
        extraAttachments.push(...parsed.attachments);
      }
      if (!bodyText && extraAttachments.length === 0) {
        throw new Error("email_text or eml_base64 with content required");
      }
      const blocks: unknown[] = [];
      if (bodyText) {
        blocks.push({ type: "text", text: `Email body:\n\n${bodyText.slice(0, 60000)}` });
      }
      for (const a of extraAttachments.slice(0, 3)) {
        if (a.contentType.includes("pdf") || /\.pdf$/i.test(a.filename)) {
          blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } });
        }
      }
      blocks.push({ type: "text", text: "Extract the fund quarterly metrics and the holdings schedule from the email and any attached PDFs. Return ONLY the JSON object." });
      userBlocks = blocks;
    }

    // Call Anthropic.
    let normalized: ExtractedPayload | null = null;
    let rawText = "";
    let extractionError: string | null = null;
    try {
      rawText = await callAnthropic(ANTHROPIC_API_KEY, systemPrompt, userBlocks);
      const parsed = safeJson(rawText) as ExtractedPayload | null;
      if (parsed && typeof parsed === "object") normalized = parsed;
      else extractionError = "Could not parse model output as JSON.";
    } catch (e) {
      extractionError = e instanceof Error ? e.message : String(e);
    }

    // Persist draft.
    const { data: draft, error: draftErr } = await supabase
      .from("extraction_drafts")
      .insert({
        source_document_id,
        source_type,
        fund_id: fund_id ?? null,
        quarter_id: quarter_id ?? null,
        normalized_payload: normalized,
        raw_model_output: { text: rawText },
        status: extractionError ? "failed" : "pending_review",
        error_message: extractionError,
      })
      .select("id, status, normalized_payload, fund_id, quarter_id, source_type, error_message")
      .single();
    if (draftErr) throw new Error(`extraction_drafts insert failed: ${draftErr.message}`);

    return new Response(
      JSON.stringify({ draft, source_document_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: extractionError ? 422 : 200 },
    );
  } catch (e) {
    console.error("extract-report error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "rate_limited" ? 429 : msg === "auth_failed" ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
