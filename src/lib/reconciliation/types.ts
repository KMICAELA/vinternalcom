export type Section = "funds" | "directs" | "underlying" | "metrics";

export type Status = "match" | "over_tolerance" | "missing_in_system" | "missing_in_source";

export type FieldKind = "currency" | "ratio" | "irr" | "text" | "date" | "percent";

export interface DiffRow {
  section: Section;
  identity: string;
  field: string;
  source: number | string | null;
  system: number | string | null;
  delta: number | null;
  kind: FieldKind;
  status: Status;
}

export interface SectionResult {
  section: Section;
  label: string;
  rows: DiffRow[];
  matched: number;
  total: number;
  overTolerance: number;
  missingInSystem: number;
  missingInSource: number;
}

export interface ReconciliationResult {
  quarterId: string;
  quarterLabel: string;
  sections: SectionResult[];
  totalFields: number;
  matchedFields: number;
  overTolerance: number;
  missing: number;
  /** Diagnostic metadata: 0-indexed header row resolved per sheet by the parser. */
  headerRows?: Record<string, number>;
}

// Tolerances per the spec
export const TOL = {
  currency: 0.01,
  ratio: 0.0001,
  irr: 0.001, // 10 bps
  percent: 0.0001,
} as const;
