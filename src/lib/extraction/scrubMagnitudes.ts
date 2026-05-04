// Post-extraction magnitude sanity scrubber.
//
// Catches the "Reload 2m" class of bug where the model parses a narrative
// shorthand like "will receive $2m back" as 200,000 instead of 2,000,000.
//
// Strategy (deterministic, no AI):
//   1. For each holding, locate its company name in the report `notes`.
//   2. Scan a ±240-char window around the name for shorthand magnitudes:
//        $2m, 2M, 2mm, 2 million, 500k, 1.5bn, etc.
//   3. Compare each shorthand magnitude to the extracted cost / fmv / proceeds.
//      If an extracted value is off by ~10× / ~100× / ~1000× from a nearby
//      shorthand (within tolerance), we flag the holding as needs_review with
//      an explicit reason — we do NOT silently overwrite (the model may have
//      had context we don't).
//
// Read-only on the value side; only sets needs_review / review_reason /
// data_confidence flags.

import type { EnrichedHolding } from "./inheritHoldingMetadata";

const SHORTHAND_RE =
  /\$?\s*(\d{1,4}(?:[.,]\d+)?)\s*(mm|million|bn|billion|[mk])\b/gi;

function scaleShorthand(num: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "k") return num * 1_000;
  if (u === "m" || u === "mm" || u === "million") return num * 1_000_000;
  if (u === "bn" || u === "billion") return num * 1_000_000_000;
  return num;
}

// Off-by-magnitude bands: within 20% of 10×, 100×, or 1000× in either direction.
function isMagnitudeMismatch(extracted: number, shorthand: number): boolean {
  if (extracted <= 0 || shorthand <= 0) return false;
  const ratio = extracted / shorthand;
  const bands = [10, 100, 1000, 0.1, 0.01, 0.001];
  return bands.some((b) => Math.abs(ratio / b - 1) < 0.2);
}

export function scrubMagnitudes(
  notes: string | null | undefined,
  holdings: EnrichedHolding[],
): EnrichedHolding[] {
  if (!notes || !holdings?.length) return holdings;
  const text = notes.toLowerCase();

  return holdings.map((h) => {
    const name = h.company_name?.toLowerCase().trim();
    if (!name) return h;
    const idx = text.indexOf(name);
    if (idx < 0) return h;

    const window = text.slice(
      Math.max(0, idx - 240),
      Math.min(text.length, idx + name.length + 240),
    );

    const shorthandValues: number[] = [];
    let m: RegExpExecArray | null;
    SHORTHAND_RE.lastIndex = 0;
    while ((m = SHORTHAND_RE.exec(window))) {
      const num = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(num) || num <= 0) continue;
      shorthandValues.push(scaleShorthand(num, m[2]));
    }
    if (shorthandValues.length === 0) return h;

    const extracted = [h.fund_cost_usd, h.fund_fmv_usd, h.fund_proceeds_usd]
      .map((v) => (v == null ? 0 : Number(v)))
      .filter((v) => v > 0);
    if (extracted.length === 0) return h;

    const suspect = extracted.some((e) =>
      shorthandValues.some((s) => isMagnitudeMismatch(e, s)),
    );
    if (!suspect) return h;

    const sStr = shorthandValues
      .map((v) => "$" + v.toLocaleString("en-US"))
      .join(", ");
    return {
      ...h,
      needs_review: true,
      data_confidence: "needs_review",
      review_reason:
        (h.review_reason ? h.review_reason + "; " : "") +
        `Possible magnitude mismatch — narrative near "${h.company_name}" mentions ${sStr}, but extracted value differs by ~10×/100×. Verify shorthand parsing (e.g. "2m" should be $2,000,000).`,
    };
  });
}
