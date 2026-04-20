import * as XLSX from "xlsx";

/**
 * Authoritative parser for TWH-1 Portfolio Metrics_*.xlsx workbooks.
 *
 * Sheet conventions (case-sensitive):
 *   - "Funds"          → fund identity + commitments + quarter snapshot
 *   - "Directs"        → directs + direct quarter snapshots
 *   - "Underl. Port."  → underlying_holdings (170+ rows)
 *   - "Net CF"         → cash_flows scope='twh_net' + Net TVPI/IRR banner (G2/H2)
 *   - "G CF"           → cash_flows scope='twh_gross' + Gross TVPI/IRR banner
 *   - "Inventory"      → company-level TWH cost/FMV cross-check (Directs + Funds Underlying sections)
 *   - "Port. Comments" → company commentary fields
 *
 * For ALL of the above, header row is row 4 (1-indexed), data starts at row 5.
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
  portfolio: string | null; // fund name OR direct company OR category label
  twhContributions: number | null; // raw positive value as in xlsx
  twhDistributions: number | null;
  fmvNav: number | null;
  cf: number | null; // signed CF column G
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

// ---------- value coercion ----------

const SECTION_LABELS = new Set([
  "directs portfolio",
  "funds underlying portfolio",
  "fair market value / nav",
  "cash flows",
  "total",
  "subtotal",
]);

const isSectionLabel = (v: any): boolean => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return SECTION_LABELS.has(s);
};

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    // Excel error strings → null (e.g., "#DIV/0!", "#REF!", "#N/A")
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

const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const dateStr = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// Read sheet as 2D array using sheet_to_json with header:1, then index by column letter.
// Excel column letter (A=0, B=1, ...). Supports A..Z, AA..ZZ.
const COL = (letter: string): number => {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
};

function readSheet(ws: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

const HEADER_ROW = 3; // 0-indexed (xlsx row 4)
const DATA_START = 4; // 0-indexed (xlsx row 5)

// ---------- Funds ----------
function parseFundsSheet(ws: XLSX.WorkSheet): ParsedFundRow[] {
  const rows = readSheet(ws);
  const out: ParsedFundRow[] = [];
  for (let i = DATA_START; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[COL("B")]);
    if (!name) continue;
    if (isSectionLabel(name)) continue;
    out.push({
      fundName: name,
      startDate: dateStr(r[COL("C")]),
      totalCommitments: num(r[COL("D")]),
      twhCommitment: num(r[COL("E")]),
      twhPct: num(r[COL("F")]),
      totalContributions: num(r[COL("G")]),
      twhContributions: num(r[COL("H")]),
      totalProceeds: num(r[COL("J")]),
      totalDistributions: num(r[COL("K")]),
      twhDistributions: num(r[COL("L")]),
      investmentCost: num(r[COL("N")]),
      twhCost: num(r[COL("O")]),
      portfolioValue: num(r[COL("Q")]),
      twhValue: num(r[COL("R")]),
      fundTotalNav: num(r[COL("S")]),
      twhNav: num(r[COL("T")]),
    });
  }
  return out;
}

// ---------- Directs ----------
function parseDirectsSheet(ws: XLSX.WorkSheet): ParsedDirectRow[] {
  const rows = readSheet(ws);
  const out: ParsedDirectRow[] = [];
  for (let i = DATA_START; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[COL("B")]);
    if (!name) continue;
    if (isSectionLabel(name)) continue;
    out.push({
      companyName: name,
      date: dateStr(r[COL("C")]),
      instrument: str(r[COL("D")]),
      round: str(r[COL("E")]),
      twhCost: num(r[COL("F")]),
      twhFmv: num(r[COL("G")]),
      twhProceeds: num(r[COL("H")]),
      coInvestors: str(r[COL("I")]),
      note: str(r[COL("J")]),
    });
  }
  return out;
}

// ---------- Underl. Port. ----------
function parseUnderlyingSheet(ws: XLSX.WorkSheet): ParsedUnderlyingRow[] {
  const rows = readSheet(ws);
  const out: ParsedUnderlyingRow[] = [];
  for (let i = DATA_START; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[COL("A")]);
    const fund = str(r[COL("B")]);
    if (!name || !fund) continue;
    if (isSectionLabel(name) || isSectionLabel(fund)) continue;
    out.push({
      companyName: name,
      fundName: fund,
      status: str(r[COL("C")]),
      date: dateStr(r[COL("D")]),
      instrument: str(r[COL("E")]),
      round: str(r[COL("F")]),
      investmentCost: num(r[COL("G")]),
      fmv: num(r[COL("H")]),
      proceeds: num(r[COL("I")]),
      moic: num(r[COL("J")]),
      twhPct: num(r[COL("K")]),
      twhCost: num(r[COL("L")]),
      twhFmv: num(r[COL("M")]),
      twhProceeds: num(r[COL("N")]),
      // Column O is mislabeled "TWH Proceeds" in the source — it's TWH MOIC. Ignored.
    });
  }
  return out;
}

// ---------- Inventory ----------
function parseInventorySheet(ws: XLSX.WorkSheet): {
  rows: ParsedInventoryRow[];
  totals: InventoryTotals;
} {
  const rows = readSheet(ws);
  // Totals from row 2 (0-indexed 1)
  const r2 = rows[1] ?? [];
  const totals: InventoryTotals = {
    twhCost: num(r2[COL("J")]),
    twhFmv: num(r2[COL("K")]),
    twhProceeds: num(r2[COL("L")]),
    twhMoic: num(r2[COL("M")]),
  };

  const out: ParsedInventoryRow[] = [];
  let currentSection: "directs" | "funds_underlying" | null = null;
  for (let i = DATA_START; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const a = str(r[COL("A")]);
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
      commercialName: str(r[COL("B")]),
      url: str(r[COL("C")]),
      status: str(r[COL("D")]),
      region: str(r[COL("E")]),
      type: str(r[COL("F")]),
      theme: str(r[COL("G")]),
      companyIndustry: str(r[COL("H")]),
      targetIndustry: str(r[COL("I")]),
      twhCost: num(r[COL("J")]),
      twhFmv: num(r[COL("K")]),
      twhProceeds: num(r[COL("L")]),
      twhMoic: num(r[COL("M")]),
      investmentCost: num(r[COL("N")]),
      fmv: num(r[COL("O")]),
      proceeds: num(r[COL("P")]),
      moic: num(r[COL("Q")]),
      notes: str(r[COL("R")]),
    });
  }
  return { rows: out, totals };
}

// ---------- Port. Comments ----------
function parseCommentarySheet(ws: XLSX.WorkSheet): ParsedCommentaryRow[] {
  const rows = readSheet(ws);
  const out: ParsedCommentaryRow[] = [];
  for (let i = DATA_START; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[COL("A")]);
    if (!name || isSectionLabel(name)) continue;
    out.push({
      companyName: name,
      region: str(r[COL("B")]),
      type: str(r[COL("C")]),
      thesis: str(r[COL("D")]),
      theme: str(r[COL("E")]),
      stage: str(r[COL("F")]),
      whatTheyDo: str(r[COL("G")]),
      targetMarket: str(r[COL("H")]),
      tailwinds: str(r[COL("I")]),
      challenges: str(r[COL("J")]),
    });
  }
  return out;
}

// ---------- Cash flow sheets (Net CF / G CF) ----------
function parseCashflowSheet(ws: XLSX.WorkSheet): ParsedCashflowRow[] {
  const rows = readSheet(ws);
  const out: ParsedCashflowRow[] = [];
  for (let i = DATA_START; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const date = dateStr(r[COL("B")]);
    const portfolio = str(r[COL("C")]);
    const contrib = num(r[COL("D")]);
    const distrib = num(r[COL("E")]);
    const fmv = num(r[COL("F")]);
    const cf = num(r[COL("G")]);
    const note = str(r[COL("H")]);
    // Skip blank rows and pure section labels.
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

// ---------- Banner metrics from row 2 of Net CF / G CF ----------
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

  const inv = get("Inventory") ? parseInventorySheet(get("Inventory")) : { rows: [], totals: { twhCost: null, twhFmv: null, twhProceeds: null, twhMoic: null } };

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
