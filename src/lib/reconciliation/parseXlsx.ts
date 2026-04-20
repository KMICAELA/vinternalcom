import * as XLSX from "xlsx";

export interface ParsedFundRow {
  fundName: string;
  startDate: string | null;
  totalCommitments: number | null;
  twhCommitment: number | null;
  twhPct: number | null;
  totalContributions: number | null;
  twhContributions: number | null;
  twhDistributions: number | null;
  twhNav: number | null;
  fundTotalNav: number | null;
}

export interface ParsedDirectRow {
  companyName: string;
  date: string | null;
  instrument: string | null;
  round: string | null;
  twhCost: number | null;
  twhFmv: number | null;
  twhProceeds: number | null;
}

export interface ParsedUnderlyingRow {
  companyName: string;
  fundName: string;
  date: string | null;
  instrument: string | null;
  round: string | null;
  investmentCost: number | null;
  fmv: number | null;
  proceeds: number | null;
  twhPct: number | null;
  twhCost: number | null;
  twhFmv: number | null;
}

export interface ParsedMetrics {
  // From banner row of Net CF / G CF, or summary cells in Net / Gross
  netTvpi: number | null;
  netIrr: number | null;
  grossTvpi: number | null;
  grossIrr: number | null;
}

export interface ParsedWorkbook {
  funds: ParsedFundRow[];
  directs: ParsedDirectRow[];
  underlying: ParsedUnderlyingRow[];
  metrics: ParsedMetrics;
  detectedQuarter: { fy: number; fq: number } | null;
}

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,%\s]/g, "");
    const n = parseFloat(cleaned);
    if (!Number.isNaN(n)) {
      // If original had %, the parser already stripped it; xlsx normally returns numeric 0.xx
      return n;
    }
  }
  return null;
};

const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
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
    // Excel serial
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// Find header row by scanning first 10 rows for a known header label.
function findHeader(rows: any[][], anchors: string[]): { idx: number; map: Map<string, number> } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] ?? [];
    const norm = row.map((c) => (c == null ? "" : String(c).trim()));
    if (anchors.some((a) => norm.includes(a))) {
      const map = new Map<string, number>();
      norm.forEach((label, col) => {
        if (label && !map.has(label)) map.set(label, col);
      });
      return { idx: i, map };
    }
  }
  return null;
}

function parseFundsSheet(ws: XLSX.WorkSheet): ParsedFundRow[] {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const hdr = findHeader(rows, ["Fund Name"]);
  if (!hdr) return [];
  const m = hdr.map;
  const out: ParsedFundRow[] = [];
  for (let i = hdr.idx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[m.get("Fund Name")!]);
    if (!name) continue;
    out.push({
      fundName: name,
      startDate: dateStr(r[m.get("Start Date")!]),
      totalCommitments: num(r[m.get("Total Commitments")!]),
      twhCommitment: num(r[m.get("TWH Commitment")!]),
      twhPct: num(r[m.get("TWH %")!]),
      totalContributions: num(r[m.get("Total Contributions")!]),
      twhContributions: num(r[m.get("TWH Contributions")!]),
      twhDistributions: num(r[m.get("TWH Distributions")!]),
      twhNav: num(r[m.get("TWH NAV")!]),
      fundTotalNav: num(r[m.get("NAV")!]),
    });
  }
  return out;
}

function parseDirectsSheet(ws: XLSX.WorkSheet): ParsedDirectRow[] {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const hdr = findHeader(rows, ["Company Name"]);
  if (!hdr) return [];
  const m = hdr.map;
  const out: ParsedDirectRow[] = [];
  for (let i = hdr.idx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[m.get("Company Name")!]);
    if (!name) continue;
    out.push({
      companyName: name,
      date: dateStr(r[m.get("Date")!]),
      instrument: str(r[m.get("Instrument")!]),
      round: str(r[m.get("Round")!]),
      twhCost: num(r[m.get("TWH Cost")!]),
      twhFmv: num(r[m.get("TWH FMV")!]),
      twhProceeds: num(r[m.get("TWH Proceeds")!]),
    });
  }
  return out;
}

function parseUnderlyingSheet(ws: XLSX.WorkSheet): ParsedUnderlyingRow[] {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: true });
  const hdr = findHeader(rows, ["Company Name"]);
  if (!hdr) return [];
  const m = hdr.map;
  const out: ParsedUnderlyingRow[] = [];
  for (let i = hdr.idx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = str(r[m.get("Company Name")!]);
    const fund = str(r[m.get("Fund")!]);
    if (!name || !fund) continue;
    out.push({
      companyName: name,
      fundName: fund,
      date: dateStr(r[m.get("Date")!]),
      instrument: str(r[m.get("Instrument")!]),
      round: str(r[m.get("Round")!]),
      investmentCost: num(r[m.get("Investment Cost")!]),
      fmv: num(r[m.get("FMV")!]),
      proceeds: num(r[m.get("Proceeds")!]),
      twhPct: num(r[m.get("TWH %")!]),
      twhCost: num(r[m.get("TWH Cost")!]),
      twhFmv: num(r[m.get("TWH FMV")!]),
    });
  }
  return out;
}

function parseMetrics(wb: XLSX.WorkBook): ParsedMetrics {
  const result: ParsedMetrics = {
    netTvpi: null,
    netIrr: null,
    grossTvpi: null,
    grossIrr: null,
  };
  // 'Net CF' row 2 has banner: TVPI col 7 (G), IRR col 8 (H)
  const netCf = wb.Sheets["Net CF"];
  if (netCf) {
    const cellTvpi = netCf["G2"];
    const cellIrr = netCf["H2"];
    result.netTvpi = num(cellTvpi?.v);
    result.netIrr = num(cellIrr?.v);
  }
  const gCf = wb.Sheets["G CF"];
  if (gCf) {
    result.grossTvpi = num(gCf["G2"]?.v);
    result.grossIrr = num(gCf["H2"]?.v);
  }
  return result;
}

export function detectQuarterFromFilename(name: string): { fy: number; fq: number } | null {
  // Patterns: "1Q25", "1Q2025", "Q1 2025", "Q1_25"
  const re1 = /(\d)\s*[Qq]\s*(\d{2,4})/;
  const re2 = /[Qq]\s*(\d)\s*[_\s-]?\s*(\d{2,4})/;
  let m = name.match(re1) || name.match(re2);
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
  return {
    funds: get("Funds") ? parseFundsSheet(get("Funds")) : [],
    directs: get("Directs") ? parseDirectsSheet(get("Directs")) : [],
    underlying: get("Underl. Port.") ? parseUnderlyingSheet(get("Underl. Port.")) : [],
    metrics: parseMetrics(wb),
    detectedQuarter: detectQuarterFromFilename(file.name),
  };
}
