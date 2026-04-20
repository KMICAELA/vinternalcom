import * as XLSX from "xlsx";
import type { ReconciliationResult } from "./types";

export function exportReconciliation(result: ReconciliationResult) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summary = [
    ["Quarter", result.quarterLabel],
    ["Total fields", result.totalFields],
    ["Matched", result.matchedFields],
    ["Over tolerance", result.overTolerance],
    ["Missing", result.missing],
    [],
    ["Section", "Total", "Matched", "Over Tol.", "Missing in System", "Missing in Source"],
    ...result.sections.map((s) => [
      s.label,
      s.total,
      s.matched,
      s.overTolerance,
      s.missingInSystem,
      s.missingInSource,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  // One sheet per section
  for (const s of result.sections) {
    const data = s.rows.map((r) => ({
      Identity: r.identity,
      Field: r.field,
      Source: r.source,
      System: r.system,
      Delta: r.delta,
      Kind: r.kind,
      Status: r.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), s.label.slice(0, 31));
  }

  const fname = `reconciliation_${result.quarterLabel.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
}
