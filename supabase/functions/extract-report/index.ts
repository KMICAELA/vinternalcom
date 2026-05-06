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
  round_detail?: string | null;
  fund_cost_usd: number | null;
  fund_fmv_usd: number | null;
  fund_proceeds_usd: number | null;
  // Native-currency mirrors. Populated alongside *_usd whenever an FX
  // conversion happens. When `currency` is USD these will equal the *_usd
  // values. Persisted to underlying_holdings.*_native columns.
  fund_cost_native?: number | null;
  fund_fmv_native?: number | null;
  fund_proceeds_native?: number | null;
  fmv_change_reason?: string | null;       // narrative phrase that triggered FMV update (Mode B)
  needs_review?: boolean;                  // model-flagged (e.g. unquantified company event)
  review_reason?: string | null;
};

type ExtractedPayload = {
  fund_name: string | null;
  report_date: string | null;
  currency: string | null;
  extraction_mode?: "A" | "B" | null;      // A = structured schedule, B = narrative-only
  fund_total_contributions_usd: number | null;
  fund_total_nav_usd: number | null;
  twh_contributions_usd: number | null;
  twh_distributions_usd: number | null;
  twh_nav_usd: number | null;
  // Native-currency mirrors of the fund-level metrics.
  fund_total_contributions_native?: number | null;
  fund_total_nav_native?: number | null;
  twh_contributions_native?: number | null;
  twh_distributions_native?: number | null;
  twh_nav_native?: number | null;
  fx_rate_used?: number | null;            // rate applied (1 native = X USD); null if no conversion
  holdings: ExtractedHolding[];
  notes: string | null;
};

// ──────────────────────────────────────────────────────────────────────
// Round / Instrument normalizer (mirror of public.normalize_round_name SQL)
// ──────────────────────────────────────────────────────────────────────
const INSTRUMENT_PATTERNS: Array<[RegExp, string]> = [
  [/\bsafe\b/, "SAFE"],
  [/(convertible|conv)\s*(note|debt)?|^note$/, "Convertible Note"],
  [/common(\s+stock|\s+equity)?/, "Common Stock"],
  [/(token\s*warrant|token\s*drop|^token$)/, "Token"],
  [/warrant/, "Warrant"],
  [/(partnership|lp)\s+interest/, "Partnership Interest"],
];
function titleCase(s: string): string {
  return s.toLowerCase().split(/\s+/).map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}
function normalizeRound(raw: string | null | undefined): { round: string | null; round_detail: string | null; instrument_extracted: string | null } {
  if (!raw || !raw.trim()) return { round: null, round_detail: null, instrument_extracted: null };
  const v = raw.trim().toLowerCase().replace(/\s+/g, " ");
  let instrument: string | null = null;
  for (const [re, name] of INSTRUMENT_PATTERNS) { if (re.test(v)) { instrument = name; break; } }
  const hasSeriesSignal = /(series\s+[a-g])|(\b[a-g]-?\d?\b)|seed|growth|bridge/.test(v);
  if (instrument && !hasSeriesSignal) return { round: null, round_detail: null, instrument_extracted: instrument };
  if (/(pre[\s-]?seed)/.test(v)) return { round: "Pre-Seed", round_detail: null, instrument_extracted: instrument };
  if (/(^|\s)seed/.test(v) || /series\s+seed/.test(v)) {
    const detail = /(seed\s*[\d+]|seed\s*plus|seed\s*extension|seed-?\d)/.test(v) ? titleCase(raw.trim()) : null;
    return { round: "Seed", round_detail: detail, instrument_extracted: instrument };
  }
  if (/growth/.test(v)) return { round: "Growth", round_detail: null, instrument_extracted: instrument };
  if (/bridge/.test(v)) return { round: "Bridge", round_detail: null, instrument_extracted: instrument };
  const m = v.match(/(?:^|series\s+|\s)([a-g])(?:-?\d)?(?:\s|$|\s*pref)/);
  if (m) {
    const subRe = new RegExp(`(series\\s+${m[1]}-?\\d)|(\\b${m[1]}-\\d\\b)`);
    const detail = subRe.test(v) ? titleCase(raw.trim()) : null;
    return { round: `Series ${m[1].toUpperCase()}`, round_detail: detail, instrument_extracted: instrument };
  }
  return { round: titleCase(raw), round_detail: null, instrument_extracted: instrument };
}

// Company alias map — fuzzy duplicate consolidation. Keys are lowercased
// raw names (or trimmed variants) seen in extractions; values are the
// canonical commercial name. Sub-tranches of a venture-studio parent get
// rolled into the parent (Quantonation Canada).
const COMPANY_ALIAS: Record<string, string> = {
  "project eleven": "Project 11",
  "project 11": "Project 11",
  "zoo": "Zoo",
  "zoo.dev": "Zoo",
  "quminex": "Quantonation Canada",
  "silq": "Quantonation Canada",
  "quantonation canada": "Quantonation Canada",
};

function canonicalCompanyName(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const key = t.toLowerCase().replace(/\s+/g, " ");
  if (COMPANY_ALIAS[key]) return COMPANY_ALIAS[key];
  // strip common suffixes
  const stripped = key.replace(/\s+(inc\.?|llc|ltd\.?|corp\.?|co\.?|sa|sas|sarl|gmbh)$/i, "").trim();
  if (COMPANY_ALIAS[stripped]) return COMPANY_ALIAS[stripped];
  return t;
}

// Sum two numbers treating null as 0; returns null only if BOTH are null.
function sumNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return null;
  return Number(a ?? 0) + Number(b ?? 0);
}

function dedupeHoldings(holdings: ExtractedHolding[]): ExtractedHolding[] {
  const merged = new Map<string, ExtractedHolding>();
  for (const h of holdings) {
    const canonical = canonicalCompanyName(h.company_name);
    if (!canonical) continue;
    const existing = merged.get(canonical);
    if (!existing) {
      merged.set(canonical, { ...h, company_name: canonical });
      continue;
    }
    // Merge: sum financials, keep earliest investment_date, append round detail.
    existing.fund_cost_usd = sumNullable(existing.fund_cost_usd, h.fund_cost_usd);
    existing.fund_fmv_usd = sumNullable(existing.fund_fmv_usd, h.fund_fmv_usd);
    existing.fund_proceeds_usd = sumNullable(existing.fund_proceeds_usd, h.fund_proceeds_usd);
    if (h.investment_date && (!existing.investment_date || h.investment_date < existing.investment_date)) {
      existing.investment_date = h.investment_date;
    }
    // Concatenate distinct round labels into round_detail for traceability.
    const detailParts = new Set(
      [existing.round_detail, h.round, h.round_detail].filter(Boolean).map(String),
    );
    if (detailParts.size > 0) existing.round_detail = Array.from(detailParts).join(" + ");
    if (h.needs_review) existing.needs_review = true;
  }
  return Array.from(merged.values());
}

// Dual-write FX conversion. The model returns numbers in the source
// currency (e.g. EUR). We KEEP those values in *_native and ADDITIONALLY
// populate *_usd by multiplying by the supplied fxRate. After this runs,
// `currency` still reflects the source (so consumers know what the native
// columns are denominated in) and `fx_rate_used` records the multiplier.
function applyFxConversion(p: ExtractedPayload, fxRate: number, sourceCcy: string): ExtractedPayload {
  if (!fxRate || fxRate <= 0) return p;
  const conv = (v: number | null | undefined): number | null =>
    v === null || v === undefined ? null : Math.round(Number(v) * fxRate);
  // Top-level metrics: model values are native -> mirror to *_native, derive *_usd.
  p.fund_total_contributions_native = p.fund_total_contributions_usd ?? null;
  p.fund_total_nav_native = p.fund_total_nav_usd ?? null;
  p.twh_contributions_native = p.twh_contributions_usd ?? null;
  p.twh_distributions_native = p.twh_distributions_usd ?? null;
  p.twh_nav_native = p.twh_nav_usd ?? null;
  p.fund_total_contributions_usd = conv(p.fund_total_contributions_usd);
  p.fund_total_nav_usd = conv(p.fund_total_nav_usd);
  p.twh_contributions_usd = conv(p.twh_contributions_usd);
  p.twh_distributions_usd = conv(p.twh_distributions_usd);
  p.twh_nav_usd = conv(p.twh_nav_usd);
  for (const h of p.holdings ?? []) {
    h.fund_cost_native = h.fund_cost_usd ?? null;
    h.fund_fmv_native = h.fund_fmv_usd ?? null;
    h.fund_proceeds_native = h.fund_proceeds_usd ?? null;
    h.fund_cost_usd = conv(h.fund_cost_usd);
    h.fund_fmv_usd = conv(h.fund_fmv_usd);
    h.fund_proceeds_usd = conv(h.fund_proceeds_usd);
  }
  p.fx_rate_used = fxRate;
  const fxNote = `FX applied: 1 ${sourceCcy} = ${fxRate} USD (from fund_fx_rates).`;
  p.notes = p.notes ? `${p.notes}\n${fxNote}` : fxNote;
  return p;
}

// Apply normalization + clean up zeros that should be null (TBD).
function postProcessPayload(
  p: ExtractedPayload,
  opts?: { fxRate?: number | null; dedupe?: boolean },
): ExtractedPayload {
  if (!p || !Array.isArray(p.holdings)) return p;
  p.holdings = p.holdings.map((h) => {
    const norm = normalizeRound(h.round);
    if (norm.round !== h.round) h.round = norm.round;
    if (norm.round_detail && !h.round_detail) h.round_detail = norm.round_detail;
    if (norm.instrument_extracted && !h.instrument) h.instrument = norm.instrument_extracted;
    if (h.fund_cost_usd === undefined) h.fund_cost_usd = null;
    if (h.fund_fmv_usd === undefined) h.fund_fmv_usd = null;
    if (h.fund_proceeds_usd === undefined) h.fund_proceeds_usd = null;
    return h;
  });
  if (opts?.dedupe !== false) {
    p.holdings = dedupeHoldings(p.holdings);
  }
  // FX conversion runs LAST so dedup sums are also converted at the same rate.
  const sourceCcy = (p.currency ?? "").toUpperCase();
  if (opts?.fxRate && sourceCcy && sourceCcy !== "USD") {
    applyFxConversion(p, opts.fxRate, sourceCcy);
  }
  return p;
}

const SYSTEM_BASE = `You are a financial-statement extraction agent for a venture fund-of-funds called TWH (Americas Fund I, managed by 1200VC).
Your task is to extract structured data from a fund quarterly report and return ONLY a JSON object matching the schema below.
All numeric amounts MUST be in USD base units (no thousands separators, no currency symbol). Use null when a value is not stated in the source.

{
  "fund_name": string | null,
  "report_date": "YYYY-MM-DD" | null,
  "currency": "USD" | "EUR" | "GBP" | string | null,
  "extraction_mode": "A" | "B",
  "fund_total_contributions_usd": number | null,
  "fund_total_nav_usd": number | null,
  "twh_contributions_usd": number | null,
  "twh_distributions_usd": number | null,
  "twh_nav_usd": number | null,
  "holdings": [
    {
      "company_name": string,
      "investment_date": "YYYY-MM-DD" | null,
      "instrument": string | null,
      "round": string | null,
      "fund_cost_usd": number | null,
      "fund_fmv_usd": number | null,
      "fund_proceeds_usd": number | null,
      "fmv_change_reason": string | null,
      "needs_review": boolean,
      "review_reason": string | null
    }
  ],
  "notes": string | null
}

═══════════════════════════════════════════════════════════════════════
MODE DETECTION — set "extraction_mode" first.
═══════════════════════════════════════════════════════════════════════

MODE A — Structured Schedule of Investments present.
The document contains a tabular listing of portfolio holdings with column
headers like "Cost", "Investment", "Basis", "Fair Value", "FMV", "Market
Value", "Carrying Value", "Round", "Round Invested", "Security Type", or
"Instrument". Common in audited FS, fund-admin schedules, formal PCAPs.
→ Extract values DIRECTLY from the table, row by row. No inference.

MODE B — Narrative-only report (no per-holding table).
LP letter, portfolio update, commentary without a structured holdings table.
→ Do NOT fabricate per-holding cost or FMV. Follow the strict narrative
  rules below.

═══════════════════════════════════════════════════════════════════════
MODE B — FMV UPDATE WHITELIST (the ONLY phrases that may change FMV)
═══════════════════════════════════════════════════════════════════════

You may set fund_fmv_usd to a NEW value ONLY when the narrative matches
one of these patterns. Otherwise leave fund_fmv_usd as null and let the
post-processing layer inherit the prior-quarter value.

  (a) EXACT $ STAKE — "Our position is now valued at $4.2M",
      "Fund holds $X in [Co]", "marked at $Y"
      → fund_fmv_usd = stated dollar value
      → fmv_change_reason = the exact phrase

  (b) EXPLICIT MULTIPLIER ON ENTRY — "doubles our entry valuation",
      "3x markup on cost", "marked up 1.5x from last quarter"
      → fund_fmv_usd = (cost or prior FMV) × multiplier (only if base
        is unambiguously stated)

  (c) EXIT / ACQUISITION TERMS — "we'll receive $X cash + $Y stock at
      close", "acquired for $Z to us"
      → fund_fmv_usd = sum of stated components

  (d) WRITE-OFF — "shut down", "bankruptcy", "fully written off",
      "marked to zero"
      → fund_fmv_usd = 0  (zero is meaningful — represents a markdown)

EXPLICITLY FORBIDDEN — these never trigger an FMV change:
  ✗ "Raised Series X at $Y post-money" (company-level event, not a
    fund-position dollar figure)
  ✗ "Up round" / "down round" without a stated multiplier
  ✗ "Strong quarter", "growing revenue" (qualitative)
  ✗ Any inference from "fund owns X% × company valuation Y"

When a forbidden pattern appears (e.g. company raised a new round but
the fund's specific dollar position isn't stated):
  → fund_fmv_usd = null
  → needs_review = true
  → review_reason = brief description of the unquantified event

═══════════════════════════════════════════════════════════════════════
NEW-COMPANY HANDLING (any mode)
═══════════════════════════════════════════════════════════════════════

When a company is named in the report and you have no prior context, you
may extract company_name, round, instrument, investment_date if stated.
Cost / FMV / proceeds: ONLY if the EXACT fund-specific dollar amount is
stated. Otherwise leave as null.
Never compute cost or FMV from indirect signals.

═══════════════════════════════════════════════════════════════════════
STRICT ACCURACY RULE — NO ESTIMATION ANYWHERE
═══════════════════════════════════════════════════════════════════════

Either the value is stated in the document, or it stays null.
  ✗ Never multiply company-level valuations by inferred ownership %.
  ✗ Never assume markups proportional to company-level changes.
  ✗ Never invent a value to reconcile to a fund-level total.
  ✗ Never default a missing cost to "$0". Use null instead.

null and 0 mean DIFFERENT things:
  null = "not stated / TBD"  (downstream UI shows "—")
  0    = "explicitly stated as zero / written off"  (real markdown)

═══════════════════════════════════════════════════════════════════════
ROUND COLUMN STANDARDS
═══════════════════════════════════════════════════════════════════════

Use ONLY these canonical round values (parent series — sub-tranches collapse):
  Pre-Seed | Seed | Series A | Series B | Series C | Series D | Series E |
  Series F | Series G | Growth | Bridge

Sub-tranche labels ("Series A-1", "Seed 2", "Seed Plus") are normalized
to parents at post-processing — you may emit them either way.

Instruments belong in the "instrument" field, NOT in "round":
  SAFE, Common Stock, Convertible Note, Token, Warrant, Partnership Interest, …
If the source uses "SAFE" or "Common Stock" as a round label, put it in
instrument and leave round null.

═══════════════════════════════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════════════════════════════

- "twh_*" fields = TWH's pro-rata share (often shown on a PCAP).
- "fund_total_*" fields = whole-fund totals across all LPs.
- holdings[] = the fund-level portfolio (one row per company). Skip subtotal/total rows.
- Convert non-USD figures using the report's stated FX rate if present;
  otherwise leave numbers in source units.
- Do NOT invent companies. If the source has no holdings info, return holdings: [].
- Do NOT wrap your answer in markdown. Return ONLY the JSON object.

CRITICAL — UNIT / MAGNITUDE HANDLING:
ALL numeric fields must be in BASE USD UNITS (e.g. $2,000,000 not 2 or 2000 or "2M").
Detect and apply the column/table unit scale BEFORE writing the number:
  • Headers "Cost (K)", "FMV ($K)", "in 000s" → multiply by 1,000
  • Headers "Cost (M)", "FMV ($M)", "in millions", "MM" → multiply by 1,000,000
  • Inline "2m" / "2M" / "2mm" / "$2M" / "2 million" → 2000000
  • Inline "500k" / "500K" / "$500k" → 500000
  • Bare "2,000" inside a "(K)" table → 2000000
  • Bare "2.5" inside a "($M)" table → 2500000
NEVER return a value in thousands without scaling up.
For venture investments, sub-$500K cost basis is unusual — if parsed values
look suspiciously small you have likely missed a magnitude.

CONCRETE EXAMPLES (these have been wrong before — get them right):
  • Narrative "received $500K distribution this quarter" (PAST TENSE / SETTLED)
      → fund_proceeds_usd = 500000
  • Narrative "Tamarack will receive our initial investment back in cash (2m)"
      (FUTURE TENSE — deal hasn't closed, no cash received yet)
      → fund_proceeds_usd = 0  (NOT 2000000)
      → fund_fmv_usd = 2000000  (component of acquisition value)
      → needs_review = true, review_reason = "Acquisition pending close — update on settlement"
  • Narrative "$2m" anywhere in prose → 2000000 (when proceeds, must be settled)
  • Narrative "raised a $15M Series B" → 15000000 (this is a company-level event,
    not a fund position — leave fund_* fields null unless fund's $ stake is stated)
The lowercase "m" suffix ALWAYS means millions in venture/PE context, never thousands.

PROCEEDS vs FMV — STRICT RULE:
fund_proceeds_usd reflects ONLY cash already received by the fund. Future-tense
language ("will receive", "at close", "upon close", "expected", "agreed to
receive", "pending") means the cash is NOT yet realized — keep
fund_proceeds_usd = 0 (or null) and book the value as fund_fmv_usd instead.


The "notes" field should state the detected mode and a one-line summary
(e.g. "Mode A — extracted from p.9 holdings schedule, 23 rows" or
"Mode B — LP letter, 3 FMV updates from explicit $ amounts, 5 rows flagged
needs_review for unquantified events").`;

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

// Decode base64 to Uint8Array in chunks to avoid building one giant binary string
// from atob() on very large PDFs (which can OOM the worker).
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const CHUNK = 1024 * 256; // 256KB of base64 chars → 192KB binary
  const out: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    let slice = clean.slice(i, i + CHUNK);
    // Ensure each chunk except the last is a multiple of 4
    if (i + CHUNK < clean.length) {
      const rem = slice.length % 4;
      if (rem) slice = slice.slice(0, slice.length - rem);
    }
    const bin = atob(slice);
    const u8 = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
    out.push(u8);
    total += u8.length;
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const u of out) { merged.set(u, off); off += u.length; }
  return merged;
}

// Upload a PDF to Anthropic's Files API (limit ~500 MB) and return the file_id.
// This bypasses the 32 MB request-body limit on /v1/messages.
async function uploadPdfToAnthropicFiles(apiKey: string, base64: string, filename: string): Promise<string> {
  const bytes = base64ToBytes(base64);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filename || "report.pdf");
  const resp = await fetch("https://api.anthropic.com/v1/files", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14",
    },
    body: form,
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 413) throw new Error("file_too_large");
    throw new Error(`anthropic_files_error:${resp.status}:${t.slice(0, 500)}`);
  }
  const j = await resp.json();
  if (!j?.id) throw new Error(`anthropic_files_error:no_id:${JSON.stringify(j).slice(0, 300)}`);
  return j.id as string;
}

async function uploadPdfBlobToAnthropicFiles(apiKey: string, blob: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([blob], { type: "application/pdf" }), filename || "report.pdf");
  const resp = await fetch("https://api.anthropic.com/v1/files", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14",
    },
    body: form,
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 413) throw new Error("file_too_large");
    throw new Error(`anthropic_files_error:${resp.status}:${t.slice(0, 500)}`);
  }
  const j = await resp.json();
  if (!j?.id) throw new Error(`anthropic_files_error:no_id`);
  return j.id as string;
}

async function callAnthropic(apiKey: string, systemPrompt: string, userBlocks: unknown[]): Promise<string> {
  // userBlocks may include {type:"document", source:{type:"file", file_id}} (Files API)
  // or small inline base64 attachments (kept for email path). JSON.stringify is fine
  // here because the Files API path means no large base64 strings are ever in memory.
  const requestBody = JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userBlocks }],
  });
  // Drop references so GC can reclaim any small base64 attachments.
  (userBlocks as any).length = 0;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14",
      "content-type": "application/json",
    },
    body: requestBody,
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 413) throw new Error("file_too_large");
    if (resp.status === 429) {
      // Surface Anthropic's recommended wait time so the client can honor ITPM throttling exactly.
      const retryAfter = resp.headers.get("retry-after")
        ?? resp.headers.get("anthropic-ratelimit-input-tokens-reset")
        ?? resp.headers.get("anthropic-ratelimit-tokens-reset")
        ?? "";
      throw new Error(`rate_limited${retryAfter ? `:${retryAfter}` : ""}`);
    }
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
      pdf_base64,            // string (legacy/small files)
      pdf_storage_path,      // string — path in fund-reports bucket (preferred for large PDFs)
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

    // Look up the selected fund's name + aliases AND its native currency.
    // The native currency drives whether we ask the model for native-source
    // values and apply an FX conversion via the fund_fx_rates table.
    let selectedFundName: string | null = null;
    let selectedFundShort: string | null = null;
    let selectedFundNativeCcy = "USD";
    if (fund_id) {
      const { data: f } = await supabase
        .from("funds")
        .select("name, short_name, native_currency")
        .eq("id", fund_id)
        .maybeSingle();
      if (f) {
        selectedFundName = (f as any).name ?? null;
        selectedFundShort = (f as any).short_name ?? null;
        selectedFundNativeCcy = ((f as any).native_currency ?? "USD").toUpperCase();
      }
    }

    // Auto-lookup the FX rate from fund_fx_rates when the fund is non-USD-native.
    // Resolution order: fund-specific row -> global (fund_id null) row.
    let fxRate: number | null = null;
    let fxRateMissing = false;
    if (fund_id && quarter_id && selectedFundNativeCcy !== "USD") {
      const { data: fxRows } = await supabase
        .from("fund_fx_rates")
        .select("rate, fund_id")
        .eq("from_currency", selectedFundNativeCcy)
        .eq("to_currency", "USD")
        .eq("quarter_id", quarter_id)
        .or(`fund_id.eq.${fund_id},fund_id.is.null`);
      const fundSpecific = (fxRows ?? []).find((r: any) => r.fund_id === fund_id);
      const fallback = (fxRows ?? []).find((r: any) => r.fund_id === null);
      const found = fundSpecific ?? fallback;
      if (found) fxRate = Number((found as any).rate);
      else fxRateMissing = true;
    }

    // In dry_run mode (sandbox), skip ALL DB writes — no source_documents, no extraction_drafts.
    let source_document_id: string | null = null;
    if (!dry_run) {
      // Build a placeholder source_documents row so the draft has a valid FK.
      const { data: sourceDoc, error: srcErr } = await supabase
        .from("source_documents")
        .insert({
          fund_id: fund_id ?? null,
          quarter_id: quarter_id ?? null,
          doc_type: "fund_report",
          original_filename: file_name ?? null,
          storage_path: `inline/${source_type}/${Date.now()}`,
          status: "extracting",
        })
        .select("id")
        .single();
      if (srcErr) throw new Error(`source_documents insert failed: ${srcErr.message}`);
      source_document_id = sourceDoc.id as string;
    }

    // Build user content per source type.
    let userBlocks: unknown[] = [];
    let systemPrompt = SYSTEM_BY_TYPE[source_type];

    // When the user picked a specific fund in the wizard, tell the model to:
    //   (a) match the correct row in any multi-vehicle summary table (fuzzy by name),
    //   (b) only include holdings whose narrative attribution covers that fund.
    if (selectedFundName) {
      const aliases = [selectedFundName, selectedFundShort].filter(Boolean).join(" | ");
      systemPrompt += `

IMPORTANT — TARGET FUND CONTEXT
The user has selected a SPECIFIC fund vehicle for this extraction:
  Target fund: "${selectedFundName}"${selectedFundShort ? ` (a.k.a. "${selectedFundShort}")` : ""}
  Match aliases: ${aliases}

This document may discuss MULTIPLE fund vehicles from the same manager (e.g. Fund I and Fund II,
or a parallel/feeder vehicle). Apply these rules strictly:

1) MULTI-VEHICLE SUMMARY TABLES: If the PDF contains a summary table listing several funds
   (rows like "Fund I", "Fund II", "Co-Invest", with vintage years and committed/FMV columns),
   pick the row that best matches the target fund name above using fuzzy matching (Roman
   numerals "II" vs "2", vintage year, "Opportunities II" vs "Opportunities Fund II", etc.).
   Do NOT default to the first row, the largest row, or an aggregated total. The
   fund_total_contributions_usd, fund_total_nav_usd and TWH metrics MUST come from the matched row.

2) COMPANY ATTRIBUTION: Each company mention typically carries a fund tag in the narrative
   (e.g. "Fund I", "Fund II", "Fund I & II Co-Invest", "Co-Investment", "Parallel").
   INCLUDE a company in holdings[] ONLY if its attribution covers the target fund:
     - The target fund or a matching variant -> INCLUDE
     - "Co-Invest" / "Fund I & II" / "Both funds" tags that name the target -> INCLUDE
     - A different fund only (e.g. target is Fund II and the company is tagged "Fund I" only) -> EXCLUDE
   Capture EVERY explicitly-named portfolio company in the document that meets this rule —
   do not stop at the first few. If a company appears in a holdings/portfolio table without
   an explicit fund tag but the table's heading attributes it to the target fund, INCLUDE it.

3) Set "notes" to a one-line summary that explicitly states which summary-table row you
   selected and how many companies you included vs excluded by fund attribution.

4) PORTFOLIO-TABLE COLUMN-HEADER RULE (multi-vehicle annual reports):
   When a holdings table has a column header that NAMES a specific vehicle
   (e.g. "Investment Date Quantonation 1", "Investment Date Quantonation 2",
   "Cost Fund I", "FMV Fund II"), treat that header as the fund tag for EVERY
   row of the table. Match against the target fund using fuzzy rules
   ("Quantonation 2" ≈ "Quantonation II" ≈ "Quantonation 2 Feeder",
    "Fund II" ≈ "Fund 2"). Include the table only if the header matches the
   target fund. If the same PDF contains separate tables for different
   vehicles (e.g. p.63 "Quantonation 1" + p.64-65 "Quantonation 2"), DROP
   every row from non-matching tables.

5) NATIVE SOURCE CURRENCY:
   When the report's holdings/financial values are stated in a currency OTHER
   than USD (e.g. EUR, GBP), DO NOT convert to USD yourself. Leave numbers in
   their native source units and set "currency" to the source code ("EUR",
   "GBP", etc.). A downstream step applies a single uniform FX rate. Mixing
   per-row FX rates produces inconsistent values — never do this.`;
    }

    // Inject FX-conversion hint when caller passed an override.
    if (fxRate) {
      systemPrompt += `

FX OVERRIDE ACTIVE — caller will convert values from the source currency to USD
at a single uniform rate. Return ALL numeric values in the source currency
(do NOT pre-convert). Set "currency" to the source code (e.g. "EUR").`;
    }

    if (source_type === "pdf") {
      let fileId: string;
      if (pdf_storage_path) {
        // Preferred path for large PDFs: download from storage as a Blob and stream
        // straight to Anthropic Files API. No base64 ever lives in worker memory.
        const dl = await supabase.storage.from("fund-reports").download(pdf_storage_path);
        if (dl.error || !dl.data) throw new Error(`storage_download_failed:${dl.error?.message ?? "no data"}`);
        fileId = await uploadPdfBlobToAnthropicFiles(ANTHROPIC_API_KEY, dl.data, file_name ?? "report.pdf");
      } else if (pdf_base64) {
        fileId = await uploadPdfToAnthropicFiles(ANTHROPIC_API_KEY, pdf_base64, file_name ?? "report.pdf");
      } else {
        throw new Error("pdf_base64 or pdf_storage_path required for source_type=pdf");
      }
      userBlocks = [
        { type: "document", source: { type: "file", file_id: fileId } },
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
      if (parsed && typeof parsed === "object") {
        normalized = postProcessPayload(parsed as ExtractedPayload, { fxRate, dedupe: true });
      } else extractionError = "Could not parse model output as JSON.";
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (raw === "file_too_large") {
        extractionError = "This PDF is too large for automated extraction (Anthropic limit ~500 MB). Please compress the PDF and re-upload, or contact admin.";
      } else if (raw.startsWith("anthropic_error:413") || raw.startsWith("anthropic_files_error:413")) {
        extractionError = "This PDF exceeds the AI provider's request size limit. Please compress and re-upload.";
      } else {
        extractionError = raw;
      }
    }

    // In dry_run mode, return the parsed payload without persisting anything.
    if (dry_run) {
      const draft = {
        id: null,
        status: extractionError ? "failed" : "pending_review",
        normalized_payload: normalized,
        fund_id: fund_id ?? null,
        quarter_id: quarter_id ?? null,
        source_type,
        error_message: extractionError,
      };
      return new Response(
        JSON.stringify({ draft, source_document_id: null, dry_run: true }),
        // Sandbox failures are data/results, not app errors. Return 200 so the UI can
        // show the failed file inline without triggering a runtime error overlay.
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
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
