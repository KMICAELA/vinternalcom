import * as XLSX from "xlsx";

/**
 * Header-aware parser for TWH-1 Portfolio Metrics_*.xlsx workbooks.
 *
 * For every sheet, header row is row 4 (1-indexed) and data starts at row 5.
 * We build a header→column-index map from row 4 BEFORE reading any data row,
 * then look up each field by canonical header name (with aliases). Columns
 * that don't exist in a given workbook are returned as null — never silently
 * shifted to neighboring columns.
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
  twhCost: number | null;
  twhFmv: number | null;
  twhProceeds: number | null;
  coInvestors: string | null;
  note: string | null;
}

export interface ParsedUnderlyingRow {
  companyName: string;
  fundName: string;
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
    if (t.startsWith("#")) return null; // Excel error like "#DIV/0!"
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
 * Robust date coercion. Never lets a non-date string (e.g. "Pref. Equity") slip
 * through as a date — returns null + warns instead.
 */
const dateStr = (v: unknown, ctx?: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    // Drop time component, treat as a calendar date.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1) return null;
    // Excel serial date — days since 1899-12-30 (UTC).
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(v) * 86400000;
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // ISO yyyy-mm-dd or yyyy-mm-ddThh:mm
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // mm/dd/yyyy or m/d/yy
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (us) {
      let yy = parseInt(us[3], 10);
      if (yy < 100) yy += 2000;
      return `${yy}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    }
    // Anything else (e.g. "Pref. Equity") → not a date.
    if (ctx) console.warn(`[parser] non-date value in date column ${ctx}: "${s}"`);
    return null;
  }
  return null;
};

// ------------------------------------------------------------------
// Header map: build a case-insensitive normalized header → column-index
// map from row 4 of a sheet, then look up by alias list.
// ------------------------------------------------------------------

type HeaderMap = Map<string, number>;

const normHeader = (h: unknown): string =>
  String(h ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function buildHeaderMap(rows: unknown[][]): HeaderMap {
  const headerRow = rows[3] ?? []; // row 4 (0-indexed 3)
  const map: HeaderMap = new Map();
  for (let c = 0; c < headerRow.length; c++) {
    const h = normHeader(headerRow[c]);
    if (!h) continue;
    // First occurrence wins — if the sheet has a duplicate header (e.g. the
    // mislabeled "TWH Proceeds" column on Underl. Port.), we keep the first
    // one as the canonical position.
    if (!map.has(h)) map.set(h, c);
  }
  return map;
}

/**
 * Resolve the column index for the first matching alias. Returns -1 if no
 * alias is found. Field is then treated as null for every data row.
 */
function colIdx(map: HeaderMap, aliases: string[]): number {
  for (const a of aliases) {
    const idx = map.get(normHeader(a));
    if (idx !== undefined) return idx;
  }
  return -1;
}

const cellAt = (row: unknown[], idx: number): unknown =>
  idx < 0 || idx >= row.length ? null : row[idx];

function readSheet(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

const HEADER_ROW_IDX = 3; // 0-indexed: row 4
const DATA_START_IDX = 4; // 0-indexed: row 5

// ------------------------------------------------------------------
// Funds
// ------------------------------------------------------------------
function parseFundsSheet(ws: XLSX.WorkSheet): ParsedFundRow[] {
  const rows = readSheet(ws);
  const map = buildHeaderMap(rows);
  const cIdx = colIdx(map, ["#"]);
  const cName = colIdx(map, ["Fund Name"]);
  const cStart = colIdx(map, ["Start Date"]);
  const cTotalCommit = colIdx(map, ["Total Commitments"]);
  const cTwhCommit = colIdx(map, ["TWH Commitment"]);
  const cTwhPct = colIdx(map, ["TWH %", "TWH Ownership %", "TWH%"]);
  const cTotalContrib = colIdx(map, ["Total Contributions"]);
  const cTwhContrib = colIdx(map, ["TWH Contributions"]);
  const cTotalProceeds = colIdx(map, ["Total Proceeds"]);
  const cTotalDistrib = colIdx(map, ["Total Distributions"]);
  const cTwhDistrib = colIdx(map, ["TWH Distributions"]);
  const cInvCost = colIdx(map, ["Investment Cost"]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cPortValue = colIdx(map, ["Portfolio Value"]);
  const cTwhValue = colIdx(map, ["TWH Value"]);
  const cNav = colIdx(map, ["NAV", "Fund NAV"]);
  const cTwhNav = colIdx(map, ["TWH NAV"]);

  const out: ParsedFundRow[] = [];
  for (let i = DATA_START_IDX; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const idx = cellAt(r, cIdx);
    const name = str(cellAt(r, cName));
    if (idx != null && idx !== "" && !name) break;
    if ((idx == null || idx === "") && !name) continue;
    if ((idx == null || idx === "") && name) break;
    if (!name) continue;
    if (isSectionLabel(name)) break;
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
  return out;
}

// ------------------------------------------------------------------
// Directs
// ------------------------------------------------------------------
// Iterate to the end of the sheet, skipping any row where Company Name is
// blank (placeholder rows like # 3-10 in 1Q25). Don't bail early on first
// blank row.
function parseDirectsSheet(ws: XLSX.WorkSheet): ParsedDirectRow[] {
  const rows = readSheet(ws);
  const map = buildHeaderMap(rows);
  const cName = colIdx(map, ["Company Name"]);
  const cDate = colIdx(map, ["Date", "Investment Date"]);
  const cInstrument = colIdx(map, ["Instrument"]);
  const cRound = colIdx(map, ["Round"]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cTwhFmv = colIdx(map, ["TWH FMV"]);
  const cTwhProceeds = colIdx(map, ["TWH Proceeds"]);
  const cCoInvestors = colIdx(map, ["Co-Investors", "Co Investors"]);
  const cNote = colIdx(map, ["Note (if applicable)", "Note", "Notes"]);

  const out: ParsedDirectRow[] = [];
  for (let i = DATA_START_IDX; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(cellAt(r, cName));
    if (!name) continue; // placeholder/blank row — skip, don't bail.
    if (isSectionLabel(name)) continue;
    out.push({
      companyName: name,
      date: dateStr(cellAt(r, cDate), `Directs.Date row ${i + 1}`),
      instrument: str(cellAt(r, cInstrument)),
      round: str(cellAt(r, cRound)),
      twhCost: num(cellAt(r, cTwhCost)),
      twhFmv: num(cellAt(r, cTwhFmv)),
      twhProceeds: num(cellAt(r, cTwhProceeds)),
      coInvestors: str(cellAt(r, cCoInvestors)),
      note: str(cellAt(r, cNote)),
    });
  }
  return out;
}

// ------------------------------------------------------------------
// Underl. Port.
// ------------------------------------------------------------------
// 1Q25 has NO "Status" column. 2Q25+ have it at column C. Header-aware
// lookup handles both shapes.
function parseUnderlyingSheet(ws: XLSX.WorkSheet): ParsedUnderlyingRow[] {
  const rows = readSheet(ws);
  const map = buildHeaderMap(rows);
  const cName = colIdx(map, ["Company Name"]);
  const cFund = colIdx(map, ["Fund"]);
  const cStatus = colIdx(map, ["Status"]); // -1 in 1Q25
  const cDate = colIdx(map, ["Date", "Investment Date"]);
  const cInstrument = colIdx(map, ["Instrument"]);
  const cRound = colIdx(map, ["Round"]);
  const cInvCost = colIdx(map, ["Investment Cost"]);
  const cFmv = colIdx(map, ["FMV"]);
  const cProceeds = colIdx(map, ["Proceeds"]);
  const cMoic = colIdx(map, ["MOIC"]);
  const cTwhPct = colIdx(map, ["TWH %", "TWH%"]);
  const cTwhCost = colIdx(map, ["TWH Cost"]);
  const cTwhFmv = colIdx(map, ["TWH FMV"]);
  const cTwhProceeds = colIdx(map, ["TWH Proceeds"]);
  // Note: column O / column N may both read "TWH Proceeds" (mislabel — actually
  // TWH MOIC). buildHeaderMap keeps the first occurrence, so cTwhProceeds is
  // correctly the real proceeds column.

  const out: ParsedUnderlyingRow[] = [];
  for (let i = DATA_START_IDX; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(cellAt(r, cName));
    const fund = str(cellAt(r, cFund));
    if (!name || !fund) continue;
    if (isSectionLabel(name) || isSectionLabel(fund)) continue;
    out.push({
      companyName: name,
      fundName: fund,
      status: str(cellAt(r, cStatus)),
      date: dateStr(cellAt(r, cDate), `Underl.Date row ${i + 1}`),
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
  return out;
}

// ------------------------------------------------------------------
// Inventory
// ------------------------------------------------------------------
function parseInventorySheet(ws: XLSX.WorkSheet): {
  rows: ParsedInventoryRow[];
  totals: InventoryTotals;
} {
  const rows = readSheet(ws);
  const map = buildHeaderMap(rows);
  const cName = colIdx(map, ["Company Name"]);
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

  // Totals from row 2 (0-indexed 1) — these are positional fixtures on the
  // Inventory sheet (not driven by headers).
  const r2 = rows[1] ?? [];
  const colJ = 9; // J column (0-indexed)
  const colK = 10;
  const colL = 11;
  const colM = 12;
  const totals: InventoryTotals = {
    twhCost: num(r2[colJ]),
    twhFmv: num(r2[colK]),
    twhProceeds: num(r2[colL]),
    twhMoic: num(r2[colM]),
  };

  const out: ParsedInventoryRow[] = [];
  let currentSection: "directs" | "funds_underlying" | null = null;
  for (let i = DATA_START_IDX; i < rows.length; i++) {
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
  return { rows: out, totals };
}

// ------------------------------------------------------------------
// Port. Comments
// ------------------------------------------------------------------
function parseCommentarySheet(ws: XLSX.WorkSheet): ParsedCommentaryRow[] {
  const rows = readSheet(ws);
  const map = buildHeaderMap(rows);
  const cName = colIdx(map, ["Company Name"]);
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
  for (let i = DATA_START_IDX; i < rows.length; i++) {
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
  return out;
}

// ------------------------------------------------------------------
// Cash flow sheets (Net CF / G CF)
// ------------------------------------------------------------------
function parseCashflowSheet(ws: XLSX.WorkSheet): ParsedCashflowRow[] {
  const rows = readSheet(ws);
  const map = buildHeaderMap(rows);
  const cDate = colIdx(map, ["Date"]);
  const cPortfolio = colIdx(map, ["Portfolio", "Fund", "Portfolio/Fund"]);
  const cContrib = colIdx(map, ["TWH Contributions"]);
  const cDistrib = colIdx(map, ["TWH Distributions"]);
  const cFmv = colIdx(map, ["FMV/NAV", "FMV / NAV", "NAV", "FMV"]);
  const cCf = colIdx(map, ["CF", "Net CF"]);
  const cNote = colIdx(map, ["Note (if applicable)", "Note", "Notes"]);

  const out: ParsedCashflowRow[] = [];
  for (let i = DATA_START_IDX; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const date = dateStr(cellAt(r, cDate), `CF.Date row ${i + 1}`);
    const portfolio = str(cellAt(r, cPortfolio));
    const contrib = num(cellAt(r, cContrib));
    const distrib = num(cellAt(r, cDistrib));
    const fmv = num(cellAt(r, cFmv));
    const cf = num(cellAt(r, cCf));
    const note = str(cellAt(r, cNote));
    if (!date && !portfolio && contrib == null && distrib == null && fmv == null && cf == null) continue;
    if (portfolio && isSectionLabel(portfolio) && contrib == null && distrib == null && fmv == null && cf == null) continue;
    out.push({
      date,
      portfolio,
      twhContributions: contrib,
      twhDistributions: distrib,
      fmvNav: fmv,
      cf,
      note,
    });
  }
  return out;
}

// ------------------------------------------------------------------
// Banner metrics from row 2 of Net CF / G CF (G2 = TVPI, H2 = IRR)
// ------------------------------------------------------------------
function parseMetrics(wb: XLSX.WorkBook): ParsedMetrics {
  const result: ParsedMetrics = {
    netTvpi: null,
    netIrr: null,
    grossTvpi: null,
    grossIrr: null,
  };
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

  const inv = get("Inventory")
    ? parseInventorySheet(get("Inventory"))
    : { rows: [], totals: { twhCost: null, twhFmv: null, twhProceeds: null, twhMoic: null } };

  return {
    funds: get("Funds") ? parseFundsSheet(get("Funds")) : [],
    directs: get("Directs") ? parseDirectsSheet(get("Directs")) : [],
    underlying: get("Underl. Port.") ? parseUnderlyingSheet(get("Underl. Port.")) : [],
    inventory: inv.rows,
    inventoryTotals: inv.totals,
    netCf: get("Net CF") ? parseCashflowSheet(get("Net CF")) : [],
    grossCf: get("G CF") ? parseCashflowSheet(get("G CF")) : [],
    commentary: get("Port. Comments") ? parseCommentarySheet(get("Port. Comments")) : [],
    metrics: parseMetrics(wb),
    detectedQuarter: detectQuarterFromFilename(file.name),
  };
}
