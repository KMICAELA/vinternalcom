import * as XLSX from "xlsx";
import { resolveFundName } from "./fundAliases";

/**
 * Header-aware, self-healing parser for TWH-1 Portfolio Metrics_*.xlsx.
 *
 * Header row is NOT hardcoded. For each sheet, we read raw rows with
 * blankrows: true (so visual row indices don't collapse), then scan the
 * first 10 rows for one that contains the expected anchor tokens. The
 * resolved 0-indexed header row is logged + returned as metadata so we
 * can surface it in the reconciliation run.
 *
 * Sheet conventions (case-sensitive sheet names):
 *   - "Funds"          → fund identity + commitments + quarter snapshot
 *   - "Directs"        → directs + direct quarter snapshots
 *   - "Underl. Port."  → underlying_holdings (1Q25 has NO Status col, 2Q25+ do)
 *   - "Net CF"         → cash_flows scope='twh_net' + Net TVPI/IRR banner
 *   - "G CF"           → cash_flows scope='twh_gross' + Gross TVPI/IRR banner
 *   - "Inventory"      → company-level TWH cost/FMV cross-check
 *   - "Port. Comments" → company commentary fields
 *
 * The "EUR" sheet is intentionally ignored for v1 USD-only reconciliation.
 */

export interface ParsedFundRow {
  fundName: string;
  startDate: string | null;
  totalCommitments: number | null;
  twhCommitment: number | null;
  twhPct: number | null;
  totalContributions: number | null;
  twhContributions: number | null;
  totalProceeds: number | null;
  totalDistributions: number | null;
  twhDistributions: number | null;
  investmentCost: number | null;
  twhCost: number | null;
  portfolioValue: number | null;
  twhValue: number | null;
  fundTotalNav: number | null;
  twhNav: number | null;
}

export interface ParsedDirectRow {
  companyName: string;
  date: string | null;
  instrument: string | null;
  round: string | null;
  investmentCost: number | null;
  fmv: number | null;
  proceeds: number | null;
  moic: number | null;
  twhPct: number | null;
  twhCost: number | null;
  twhFmv: number | null;
  twhProceeds: number | null;
  coInvestors: string | null;
  note: string | null;
}

export interface ParsedUnderlyingRow {
  companyName: string;
  fundName: string;
  trancheSeq: number;
  status: string | null;
  date: string | null;
  instrument: string | null;
  round: string | null;
  investmentCost: number | null;
  fmv: number | null;
  proceeds: number | null;
  moic: number | null;
  twhPct: number | null;
  twhCost: number | null;
  twhFmv: number | null;
  twhProceeds: number | null;
}

export interface ParsedInventoryRow {
  section: "directs" | "funds_underlying";
  companyName: string;
  commercialName: string | null;
  url: string | null;
  status: string | null;
  region: string | null;
  type: string | null;
  theme: string | null;
  companyIndustry: string | null;
  targetIndustry: string | null;
  twhCost: number | null;
  twhFmv: number | null;
  twhProceeds: number | null;
  twhMoic: number | null;
  investmentCost: number | null;
  fmv: number | null;
  proceeds: number | null;
  moic: number | null;
  notes: string | null;
}

export interface ParsedCashflowRow {
  date: string | null;
  portfolio: string | null;
  twhContributions: number | null;
  twhDistributions: number | null;
  fmvNav: number | null;
  cf: number | null;
  note: string | null;
}

export interface ParsedCommentaryRow {
  companyName: string;
  region: string | null;
  type: string | null;
  thesis: string | null;
  theme: string | null;
  stage: string | null;
  whatTheyDo: string | null;
  targetMarket: string | null;
  tailwinds: string | null;
  challenges: string | null;
}

export interface ParsedMetrics {
  netTvpi: number | null;
  netIrr: number | null;
  grossTvpi: number | null;
  grossIrr: number | null;
}

export interface InventoryTotals {
  twhCost: number | null;
  twhFmv: number | null;
  twhProceeds: number | null;
  twhMoic: number | null;
}

export type SheetName =
  | "Funds"
  | "Directs"
  | "Underl. Port."
  | "Inventory"
  | "Net CF"
  | "G CF"
  | "Port. Comments";

export interface ParsedWorkbook {
  funds: ParsedFundRow[];
  directs: ParsedDirectRow[];
  underlying: ParsedUnderlyingRow[];
  inventory: ParsedInventoryRow[];
  inventoryTotals: InventoryTotals;
  netCf: ParsedCashflowRow[];
  grossCf: ParsedCashflowRow[];
  commentary: ParsedCommentaryRow[];
  metrics: ParsedMetrics;
  detectedQuarter: { fy: number; fq: number } | null;
  /**
   * Resolved 0-indexed header row per sheet (for diagnostics / run metadata).
   * E.g. { Funds: 3, Directs: 3, "Underl. Port.": 3 } — meaning row 4 in Excel.
   * -1 if anchors couldn't be located on that sheet.
   */
  headerRows: Partial<Record<SheetName, number>>;
}

// ------------------------------------------------------------------
// Cell coercion helpers
// ------------------------------------------------------------------

const SECTION_LABELS = new Set([
  "directs portfolio",
  "funds underlying portfolio",
  "fair market value / nav",
  "cash flows",
  "total",
  "subtotal",
]);

const isSectionLabel = (v: unknown): boolean => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return SECTION_LABELS.has(s);
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    if (t.startsWith("#")) return null;
    const cleaned = t.replace(/[$,\s]/g, "");
    if (cleaned.endsWith("%")) {
      const n = parseFloat(cleaned.slice(0, -1));
      return Number.isNaN(n) ? null : n / 100;
    }
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  if (v instanceof Date) return null;
  return null;
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * Reject Excel-epoch artifacts (1899-12-30, 1899-12-31, 1900-01-00 etc.)
 * that surface when the parser hits a "blank" date cell that's actually
 * formatted as a date but contains 0/1/2.
 */
const isEpochArtifact = (iso: string): boolean => {
  if (!iso) return true;
  const y = parseInt(iso.slice(0, 4), 10);
  return !Number.isFinite(y) || y < 1990;
};

const dateStr = (v: unknown, ctx?: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  let iso: string | null = null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    iso = `${y}-${m}-${d}`;
  } else if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1) return null;
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(v) * 86400000;
    const d = new Date(ms);
    iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  } else if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) iso = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
    else {
      const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (us) {
        let yy = parseInt(us[3], 10);
        if (yy < 100) yy += 2000;
        iso = `${yy}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
      } else {
        if (ctx) console.warn(`[parser] non-date value in date column ${ctx}: "${s}"`);
        return null;
      }
    }
  }
  if (!iso) return null;
  if (isEpochArtifact(iso)) {
    if (ctx) console.warn(`[parser] epoch-artifact date rejected in ${ctx}: "${iso}"`);
    return null;
  }
  return iso;
};

// ------------------------------------------------------------------
// Header map + anchor-based header row detection
// ------------------------------------------------------------------

type HeaderMap = Map<string, number>;

const normHeader = (h: unknown): string =>
  String(h ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function buildHeaderMap(row: unknown[]): HeaderMap {
  const map: HeaderMap = new Map();
  for (let c = 0; c < row.length; c++) {
    const h = normHeader(row[c]);
    if (!h) continue;
    if (!map.has(h)) map.set(h, c);
  }
  return map;
}

function colIdx(map: HeaderMap, aliases: string[]): number {
  for (const a of aliases) {
    const idx = map.get(normHeader(a));
    if (idx !== undefined) return idx;
  }
  return -1;
}

const trancheKey = (fund: string, company: string, date: string | null): string =>
  `${normHeader(fund)}||${normHeader(company)}||${date ?? ""}`;

const cellAt = (row: unknown[], idx: number): unknown =>
  idx < 0 || idx >= row.length ? null : row[idx];

function readSheet(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true, // preserve visual row indices so anchor scan is reliable
  });
}

/**
 * Scan the first `maxScan` rows for a row that satisfies the anchor predicate.
 * Returns the 0-indexed row, or -1 if no row matches. Logs the resolved index.
 */
function findHeaderRow(
  rows: unknown[][],
  sheetName: string,
  anchors: string[][],
  maxScan = 10,
): number {
  const limit = Math.min(maxScan, rows.length);
  for (let i = 0; i < limit; i++) {
    const map = buildHeaderMap(rows[i] ?? []);
    const allAnchorsHit = anchors.every((aliasGroup) =>
      aliasGroup.some((alias) => map.has(normHeader(alias))),
    );
    if (allAnchorsHit) {
      console.info(`[parser] "${sheetName}" header row resolved at row ${i + 1} (0-indexed ${i})`);
      return i;
    }
  }
  console.warn(`[parser] "${sheetName}" header row NOT FOUND in first ${limit} rows`);
  return -1;
}

// ------------------------------------------------------------------
// Funds
// ------------------------------------------------------------------
function parseFundsSheet(ws: XLSX.WorkSheet): { rows: ParsedFundRow[]; headerRow: number } {
  const rows = readSheet(ws);
  const headerRow = findHeaderRow(rows, "Funds", [
    ["Fund Name"],
    ["TWH Commitment"],
  ]);
  if (headerRow < 0) return { rows: [], headerRow };
  const map = buildHeaderMap(rows[headerRow] ?? []);
  const cName = colIdx(map, ["Fund Name"]);
  const cStart = colIdx(map, ["Start Date", "Investment Date"]);
  const cTotalCommit = colIdx(map, ["Total Commitments", "Commitment", "Commitments"]);
  const cTwhCommit = colIdx(map, ["TWH Commitment"]);
  const cTwhPct = colIdx(map, ["TWH %", "TWH Ownership %", "TWH%"]);
  const cTotalContrib = colIdx(map, ["Total Contributions", "Contributions"]);
  const cTwhContrib = colIdx(map, ["TWH Contributions"]);
  const cTotalProceeds = colIdx(map, ["Total Proceeds", "Proceeds"]);
  const cTotalDistrib = colIdx(map, ["Total Distributions", "Distributions"]);
  const cTwhDistrib = colIdx(map, ["TWH Distributions"]);
  const cInvCost = colIdx(map, ["Investment Cost"]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cPortValue = colIdx(map, ["Portfolio Value", "Total Value"]);
  const cTwhValue = colIdx(map, ["TWH Value"]);
  const cNav = colIdx(map, ["NAV", "Fund NAV"]);
  const cTwhNav = colIdx(map, ["TWH NAV"]);

  const out: ParsedFundRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(cellAt(r, cName));
    if (!name) continue;
    if (isSectionLabel(name)) break; // TOTAL / Subtotal terminates fund list
    out.push({
      fundName: name,
      startDate: dateStr(cellAt(r, cStart), "Funds.StartDate"),
      totalCommitments: num(cellAt(r, cTotalCommit)),
      twhCommitment: num(cellAt(r, cTwhCommit)),
      twhPct: num(cellAt(r, cTwhPct)),
      totalContributions: num(cellAt(r, cTotalContrib)),
      twhContributions: num(cellAt(r, cTwhContrib)),
      totalProceeds: num(cellAt(r, cTotalProceeds)),
      totalDistributions: num(cellAt(r, cTotalDistrib)),
      twhDistributions: num(cellAt(r, cTwhDistrib)),
      investmentCost: num(cellAt(r, cInvCost)),
      twhCost: num(cellAt(r, cTwhCost)),
      portfolioValue: num(cellAt(r, cPortValue)),
      twhValue: num(cellAt(r, cTwhValue)),
      fundTotalNav: num(cellAt(r, cNav)),
      twhNav: num(cellAt(r, cTwhNav)),
    });
  }
  return { rows: out, headerRow };
}

// ------------------------------------------------------------------
// Directs
// ------------------------------------------------------------------
function parseDirectsSheet(ws: XLSX.WorkSheet): {
  rows: ParsedDirectRow[];
  headerRow: number;
} {
  const rows = readSheet(ws);
  const headerRow = findHeaderRow(rows, "Directs", [
    ["Company", "Company Name"],
    ["Investment Date", "Date"],
  ]);
  if (headerRow < 0) return { rows: [], headerRow };
  const map = buildHeaderMap(rows[headerRow] ?? []);
  const cName = colIdx(map, ["Company Name", "Company"]);
  const cDate = colIdx(map, ["Investment Date", "Date"]);
  const cInstrument = colIdx(map, ["Instrument"]);
  const cRound = colIdx(map, ["Round"]);
  const cInvCost = colIdx(map, ["Investment Cost"]);
  const cFmv = colIdx(map, ["FMV"]);
  const cProceeds = colIdx(map, ["Proceeds"]);
  const cMoic = colIdx(map, ["MOIC"]);
  const cTwhPct = colIdx(map, ["TWH %", "TWH Ownership %", "TWH%"]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cTwhFmv = colIdx(map, ["TWH FMV"]);
  const cTwhProceeds = colIdx(map, ["TWH Proceeds"]);
  const cCoInvestors = colIdx(map, ["Co-Investors", "Co Investors"]);
  const cNote = colIdx(map, ["Note (if applicable)", "Note", "Notes"]);

  const out: ParsedDirectRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(cellAt(r, cName));
    if (!name) continue;
    if (isSectionLabel(name)) continue;
    const date = dateStr(cellAt(r, cDate), `Directs.Date row ${i + 1}`);
    const investmentCost = num(cellAt(r, cInvCost));
    const fmv = num(cellAt(r, cFmv));
    const proceeds = num(cellAt(r, cProceeds));
    const twhCost = num(cellAt(r, cTwhCost));
    // Phantom-row guard: a Directs row with no date AND no monetary value
    // is a placeholder (e.g., # 3-10 in 1Q25). Skip silently.
    if (!date && investmentCost == null && fmv == null && proceeds == null && twhCost == null) {
      continue;
    }
    out.push({
      companyName: name,
      date,
      instrument: str(cellAt(r, cInstrument)),
      round: str(cellAt(r, cRound)),
      investmentCost,
      fmv,
      proceeds,
      moic: num(cellAt(r, cMoic)),
      twhPct: num(cellAt(r, cTwhPct)),
      twhCost,
      twhFmv: num(cellAt(r, cTwhFmv)),
      twhProceeds: num(cellAt(r, cTwhProceeds)),
      coInvestors: str(cellAt(r, cCoInvestors)),
      note: str(cellAt(r, cNote)),
    });
  }
  return { rows: out, headerRow };
}

// ------------------------------------------------------------------
// Underl. Port.
// ------------------------------------------------------------------
function parseUnderlyingSheet(ws: XLSX.WorkSheet): {
  rows: ParsedUnderlyingRow[];
  headerRow: number;
} {
  const rows = readSheet(ws);
  const headerRow = findHeaderRow(rows, "Underl. Port.", [
    ["Company Name", "Company"],
    ["Fund"],
    ["Investment Cost"],
  ]);
  if (headerRow < 0) return { rows: [], headerRow };
  const map = buildHeaderMap(rows[headerRow] ?? []);
  const cName = colIdx(map, ["Company Name", "Company"]);
  const cFund = colIdx(map, ["Fund"]);
  const cStatus = colIdx(map, ["Status"]); // -1 in 1Q25
  const cDate = colIdx(map, ["Investment Date", "Date"]);
  const cInstrument = colIdx(map, ["Instrument"]);
  const cRound = colIdx(map, ["Round"]);
  const cInvCost = colIdx(map, ["Investment Cost"]);
  const cFmv = colIdx(map, ["FMV"]);
  const cProceeds = colIdx(map, ["Proceeds"]);
  const cMoic = colIdx(map, ["MOIC"]);
  const cTwhPct = colIdx(map, ["TWH %", "TWH Ownership %", "TWH%"]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cTwhFmv = colIdx(map, ["TWH FMV"]);
  // The 1Q25 workbook labels both col M and col N as "TWH Proceeds";
  // buildHeaderMap keeps the first occurrence, so this intentionally reads
  // col M only. Col N is actually TWH MOIC and is ignored for now.
  const cTwhProceeds = colIdx(map, ["TWH Proceeds"]);

  const out: ParsedUnderlyingRow[] = [];
  const trancheCounts = new Map<string, number>();
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(cellAt(r, cName));
    const fund = str(cellAt(r, cFund));
    if (!name || !fund) continue;
    if (isSectionLabel(name) || isSectionLabel(fund)) continue;
    const canonicalFund = resolveFundName(fund);
    const date = dateStr(cellAt(r, cDate), `Underl.Date row ${i + 1}`);
    const key = trancheKey(canonicalFund, name, date);
    const trancheSeq = (trancheCounts.get(key) ?? 0) + 1;
    trancheCounts.set(key, trancheSeq);
    out.push({
      companyName: name,
      // Canonicalise xlsx fund short names ("Cantos") -> DB legal_name
      // ("Cantos Ventures IV, LP") so identity match works downstream.
      fundName: canonicalFund,
      trancheSeq,
      status: str(cellAt(r, cStatus)),
      date,
      instrument: str(cellAt(r, cInstrument)),
      round: str(cellAt(r, cRound)),
      investmentCost: num(cellAt(r, cInvCost)),
      fmv: num(cellAt(r, cFmv)),
      proceeds: num(cellAt(r, cProceeds)),
      moic: num(cellAt(r, cMoic)),
      twhPct: num(cellAt(r, cTwhPct)),
      twhCost: num(cellAt(r, cTwhCost)),
      twhFmv: num(cellAt(r, cTwhFmv)),
      twhProceeds: num(cellAt(r, cTwhProceeds)),
    });
  }
  return { rows: out, headerRow };
}

// ------------------------------------------------------------------
// Inventory
// ------------------------------------------------------------------
function parseInventorySheet(ws: XLSX.WorkSheet): {
  rows: ParsedInventoryRow[];
  totals: InventoryTotals;
  headerRow: number;
} {
  const rows = readSheet(ws);
  const headerRow = findHeaderRow(rows, "Inventory", [
    ["Company Name", "Company"],
    ["TWH Cost"],
  ]);
  const emptyTotals: InventoryTotals = { twhCost: null, twhFmv: null, twhProceeds: null, twhMoic: null };
  if (headerRow < 0) return { rows: [], totals: emptyTotals, headerRow };
  const map = buildHeaderMap(rows[headerRow] ?? []);
  const cName = colIdx(map, ["Company Name", "Company"]);
  const cCommercial = colIdx(map, ["Commercial Name"]);
  const cUrl = colIdx(map, ["URL"]);
  const cStatus = colIdx(map, ["Status"]);
  const cRegion = colIdx(map, ["Region"]);
  const cType = colIdx(map, ["Type"]);
  const cTheme = colIdx(map, ["Theme"]);
  const cCompanyInd = colIdx(map, [
    "Company Industry(ies) - WHAT IS?",
    "Company Industry",
    "Company Industries",
  ]);
  const cTargetInd = colIdx(map, [
    "Target Industry(ies) - TO WHOM?",
    "Target Industry",
    "Target Industries",
  ]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cTwhFmv = colIdx(map, ["TWH FMV"]);
  const cTwhProceeds = colIdx(map, ["TWH Proceeds"]);
  const cTwhMoic = colIdx(map, ["TWH MOIC"]);
  const cInvCost = colIdx(map, ["Investment Cost"]);
  const cFmv = colIdx(map, ["FMV"]);
  const cProceeds = colIdx(map, ["Proceeds"]);
  const cMoic = colIdx(map, ["MOIC"]);
  const cNotes = colIdx(map, ["Notes (if applicable)", "Notes", "Note"]);

  // Totals are positional fixtures on Inventory row 2.
  const r2 = rows[1] ?? [];
  const totals: InventoryTotals = {
    twhCost: num(r2[9]),
    twhFmv: num(r2[10]),
    twhProceeds: num(r2[11]),
    twhMoic: num(r2[12]),
  };

  const out: ParsedInventoryRow[] = [];
  let currentSection: "directs" | "funds_underlying" | null = null;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const a = str(cellAt(r, cName));
    if (!a) continue;
    const lower = a.toLowerCase();
    if (lower === "directs portfolio") {
      currentSection = "directs";
      continue;
    }
    if (lower === "funds underlying portfolio") {
      currentSection = "funds_underlying";
      continue;
    }
    if (isSectionLabel(a)) continue;
    if (!currentSection) continue;
    out.push({
      section: currentSection,
      companyName: a,
      commercialName: str(cellAt(r, cCommercial)),
      url: str(cellAt(r, cUrl)),
      status: str(cellAt(r, cStatus)),
      region: str(cellAt(r, cRegion)),
      type: str(cellAt(r, cType)),
      theme: str(cellAt(r, cTheme)),
      companyIndustry: str(cellAt(r, cCompanyInd)),
      targetIndustry: str(cellAt(r, cTargetInd)),
      twhCost: num(cellAt(r, cTwhCost)),
      twhFmv: num(cellAt(r, cTwhFmv)),
      twhProceeds: num(cellAt(r, cTwhProceeds)),
      twhMoic: num(cellAt(r, cTwhMoic)),
      investmentCost: num(cellAt(r, cInvCost)),
      fmv: num(cellAt(r, cFmv)),
      proceeds: num(cellAt(r, cProceeds)),
      moic: num(cellAt(r, cMoic)),
      notes: str(cellAt(r, cNotes)),
    });
  }
  return { rows: out, totals, headerRow };
}

// ------------------------------------------------------------------
// Port. Comments
// ------------------------------------------------------------------
function parseCommentarySheet(ws: XLSX.WorkSheet): {
  rows: ParsedCommentaryRow[];
  headerRow: number;
} {
  const rows = readSheet(ws);
  const headerRow = findHeaderRow(rows, "Port. Comments", [
    ["Company Name", "Company"],
    ["Theme", "Thesis"],
  ]);
  if (headerRow < 0) return { rows: [], headerRow };
  const map = buildHeaderMap(rows[headerRow] ?? []);
  const cName = colIdx(map, ["Company Name", "Company"]);
  const cRegion = colIdx(map, ["Region"]);
  const cType = colIdx(map, ["Type"]);
  const cThesis = colIdx(map, ["Thesis"]);
  const cTheme = colIdx(map, ["Theme"]);
  const cStage = colIdx(map, ["Stage"]);
  const cWhat = colIdx(map, [
    "What do they do / opportunity / how are they going to market?",
    "What do they do",
    "What they do",
  ]);
  const cTarget = colIdx(map, [
    "Who is their target market / customer?",
    "Target market",
    "Target Market",
  ]);
  const cTailwinds = colIdx(map, ["Tailwinds"]);
  const cChallenges = colIdx(map, ["Challenges"]);

  const out: ParsedCommentaryRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(cellAt(r, cName));
    if (!name || isSectionLabel(name)) continue;
    out.push({
      companyName: name,
      region: str(cellAt(r, cRegion)),
      type: str(cellAt(r, cType)),
      thesis: str(cellAt(r, cThesis)),
      theme: str(cellAt(r, cTheme)),
      stage: str(cellAt(r, cStage)),
      whatTheyDo: str(cellAt(r, cWhat)),
      targetMarket: str(cellAt(r, cTarget)),
      tailwinds: str(cellAt(r, cTailwinds)),
      challenges: str(cellAt(r, cChallenges)),
    });
  }
  return { rows: out, headerRow };
}

// ------------------------------------------------------------------
// Cash flow sheets (Net CF / G CF)
// ------------------------------------------------------------------
function parseCashflowSheet(
  ws: XLSX.WorkSheet,
  sheetName: string,
): { rows: ParsedCashflowRow[]; headerRow: number } {
  const rows = readSheet(ws);
  const headerRow = findHeaderRow(rows, sheetName, [
    ["Date"],
    ["TWH Contributions", "Contributions"],
  ]);
  if (headerRow < 0) return { rows: [], headerRow };
  const map = buildHeaderMap(rows[headerRow] ?? []);
  const cDate = colIdx(map, ["Date"]);
  const cPortfolio = colIdx(map, ["Portfolio", "Fund", "Portfolio/Fund"]);
  const cContrib = colIdx(map, ["TWH Contributions", "Contributions"]);
  const cDistrib = colIdx(map, ["TWH Distributions", "Distributions"]);
  const cFmv = colIdx(map, ["FMV/NAV", "FMV / NAV", "NAV", "FMV"]);
  const cCf = colIdx(map, ["CF", "Net CF"]);
  const cNote = colIdx(map, ["Note (if applicable)", "Note", "Notes"]);

  const out: ParsedCashflowRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const date = dateStr(cellAt(r, cDate), `${sheetName}.Date row ${i + 1}`);
    const portfolio = str(cellAt(r, cPortfolio));
    const contrib = num(cellAt(r, cContrib));
    const distrib = num(cellAt(r, cDistrib));
    const fmv = num(cellAt(r, cFmv));
    const cf = num(cellAt(r, cCf));
    const note = str(cellAt(r, cNote));
    if (!date && !portfolio && contrib == null && distrib == null && fmv == null && cf == null) continue;
    if (portfolio && isSectionLabel(portfolio) && contrib == null && distrib == null && fmv == null && cf == null) continue;
    out.push({ date, portfolio, twhContributions: contrib, twhDistributions: distrib, fmvNav: fmv, cf, note });
  }
  return { rows: out, headerRow };
}

// ------------------------------------------------------------------
// Banner metrics from row 2 of Net CF / G CF (G2 = TVPI, H2 = IRR)
// ------------------------------------------------------------------
function parseMetrics(wb: XLSX.WorkBook): ParsedMetrics {
  const result: ParsedMetrics = { netTvpi: null, netIrr: null, grossTvpi: null, grossIrr: null };
  const netCf = wb.Sheets["Net CF"];
  if (netCf) {
    result.netTvpi = num(netCf["G2"]?.v);
    result.netIrr = num(netCf["H2"]?.v);
  }
  const gCf = wb.Sheets["G CF"];
  if (gCf) {
    result.grossTvpi = num(gCf["G2"]?.v);
    result.grossIrr = num(gCf["H2"]?.v);
  }
  return result;
}

export function detectQuarterFromFilename(name: string): { fy: number; fq: number } | null {
  const re1 = /(\d)\s*[Qq]\s*(\d{2,4})/;
  const re2 = /[Qq]\s*(\d)\s*[_\s-]?\s*(\d{2,4})/;
  const m = name.match(re1) || name.match(re2);
  if (!m) return null;
  const fq = parseInt(m[1], 10);
  let fy = parseInt(m[2], 10);
  if (fy < 100) fy += 2000;
  if (fq < 1 || fq > 4) return null;
  return { fy, fq };
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const get = (n: string) => wb.Sheets[n];
  const headerRows: Partial<Record<SheetName, number>> = {};

  const fundsParsed = get("Funds") ? parseFundsSheet(get("Funds")) : { rows: [], headerRow: -1 };
  if (get("Funds")) headerRows["Funds"] = fundsParsed.headerRow;

  const directsParsed = get("Directs") ? parseDirectsSheet(get("Directs")) : { rows: [], headerRow: -1 };
  if (get("Directs")) headerRows["Directs"] = directsParsed.headerRow;

  const underlyingParsed = get("Underl. Port.") ? parseUnderlyingSheet(get("Underl. Port.")) : { rows: [], headerRow: -1 };
  if (get("Underl. Port.")) headerRows["Underl. Port."] = underlyingParsed.headerRow;

  const inv = get("Inventory")
    ? parseInventorySheet(get("Inventory"))
    : { rows: [], totals: { twhCost: null, twhFmv: null, twhProceeds: null, twhMoic: null }, headerRow: -1 };
  if (get("Inventory")) headerRows["Inventory"] = inv.headerRow;

  const netCfParsed = get("Net CF") ? parseCashflowSheet(get("Net CF"), "Net CF") : { rows: [], headerRow: -1 };
  if (get("Net CF")) headerRows["Net CF"] = netCfParsed.headerRow;

  const grossCfParsed = get("G CF") ? parseCashflowSheet(get("G CF"), "G CF") : { rows: [], headerRow: -1 };
  if (get("G CF")) headerRows["G CF"] = grossCfParsed.headerRow;

  const commentaryParsed = get("Port. Comments") ? parseCommentarySheet(get("Port. Comments")) : { rows: [], headerRow: -1 };
  if (get("Port. Comments")) headerRows["Port. Comments"] = commentaryParsed.headerRow;

  console.info("[parser] resolved header rows:", headerRows);

  return {
    funds: fundsParsed.rows,
    directs: directsParsed.rows,
    underlying: underlyingParsed.rows,
    inventory: inv.rows,
    inventoryTotals: inv.totals,
    netCf: netCfParsed.rows,
    grossCf: grossCfParsed.rows,
    commentary: commentaryParsed.rows,
    metrics: parseMetrics(wb),
    detectedQuarter: detectQuarterFromFilename(file.name),
    headerRows,
  };
}
