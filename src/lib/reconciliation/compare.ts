import type { DiffRow, FieldKind, SectionResult, Status } from "./types";
import { TOL } from "./types";

const norm = (s: string | null | undefined) =>
  (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

function tolFor(kind: FieldKind): number {
  switch (kind) {
    case "currency": return TOL.currency;
    case "ratio": return TOL.ratio;
    case "percent": return TOL.percent;
    case "irr": return TOL.irr;
    default: return 0;
  }
}

function compareValue(
  src: number | string | null,
  sys: number | string | null,
  kind: FieldKind,
): { delta: number | null; status: Status } {
  if (kind === "currency") {
    const srcZero = src === null || src === undefined || src === "" || src === 0;
    const sysZero = sys === null || sys === undefined || sys === "" || sys === 0;
    if (srcZero && sysZero) return { delta: 0, status: "match" };
    if (srcZero) return { delta: null, status: "missing_in_source" };
    if (sysZero) return { delta: null, status: "missing_in_system" };
  }

  const srcMissing = src === null || src === undefined || src === "";
  const sysMissing = sys === null || sys === undefined || sys === "";
  if (srcMissing && sysMissing) return { delta: 0, status: "match" };
  if (srcMissing) return { delta: null, status: "missing_in_source" };
  if (sysMissing) return { delta: null, status: "missing_in_system" };

  if (kind === "text") {
    return norm(src as string) === norm(sys as string)
      ? { delta: null, status: "match" }
      : { delta: null, status: "over_tolerance" };
  }
  if (kind === "date") {
    return String(src).slice(0, 10) === String(sys).slice(0, 10)
      ? { delta: null, status: "match" }
      : { delta: null, status: "over_tolerance" };
  }
  const a = typeof src === "number" ? src : parseFloat(src as string);
  const b = typeof sys === "number" ? sys : parseFloat(sys as string);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { delta: null, status: "over_tolerance" };
  }
  const delta = a - b;
  return Math.abs(delta) <= tolFor(kind)
    ? { delta, status: "match" }
    : { delta, status: "over_tolerance" };
}

interface FieldSpec {
  field: string;
  src: number | string | null;
  sys: number | string | null;
  kind: FieldKind;
}

export function buildSectionResult(
  section: SectionResult["section"],
  label: string,
  identityRows: { identity: string; fields: FieldSpec[] }[],
): SectionResult {
  const rows: DiffRow[] = [];
  // Dedup: each (identity, field) pair must be emitted at most once,
  // regardless of how many src/sys rows match. First emission wins.
  const emitted = new Set<string>();
  for (const ir of identityRows) {
    for (const f of ir.fields) {
      const key = `${norm(ir.identity)}||${norm(f.field)}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      const { delta, status } = compareValue(f.src, f.sys, f.kind);
      rows.push({
        section,
        identity: ir.identity,
        field: f.field,
        source: f.src,
        system: f.sys,
        delta,
        kind: f.kind,
        status,
      });
    }
  }
  return {
    section,
    label,
    rows,
    matched: rows.filter((r) => r.status === "match").length,
    total: rows.length,
    overTolerance: rows.filter((r) => r.status === "over_tolerance").length,
    missingInSystem: rows.filter((r) => r.status === "missing_in_system").length,
    missingInSource: rows.filter((r) => r.status === "missing_in_source").length,
  };
}

export { norm };
