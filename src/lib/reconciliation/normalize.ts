/**
 * Shared normalization helpers for taxonomy fields surfaced from the workbook.
 *
 * - Innovation Type is clamped to the canonical 3-value taxonomy
 *   (Deep Tech / Tech Based / Tech Enabled). Variants like "DeepTech",
 *   "deep-tech", "tech_based" map to canonical via aggressive stripping.
 *   Anything that does NOT map after normalization is returned as an
 *   "unmapped" entry so the UI can surface it for manual fix-up.
 *
 * - Region / Industry / Theme are split on commas/semicolons/slashes,
 *   trimmed, deduped (case-insensitive). No taxonomy clamp — these
 *   are open-ended.
 */

export const INNOVATION_TYPES = ["Deep Tech", "Tech Based", "Tech Enabled"] as const;
export type InnovationType = (typeof INNOVATION_TYPES)[number];

const INNOVATION_TYPE_LOOKUP: Record<string, InnovationType> = {
  deeptech: "Deep Tech",
  techbased: "Tech Based",
  techenabled: "Tech Enabled",
};

const stripForMatch = (s: string) =>
  s.toLowerCase().replace(/[\s\-_/]+/g, "");

/**
 * Split a multi-value cell on commas / semicolons / slashes / pipes.
 * Trims whitespace. Drops empty entries. Preserves first-seen casing
 * but dedupes on case-insensitive comparison.
 */
export function splitMultiValue(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = String(raw)
    .split(/[,;|/]+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export interface NormalizedInnovationType {
  mapped: InnovationType[];
  unmapped: string[];
}

/**
 * Clamp a free-text Type cell to the 3-value taxonomy. Returns both the
 * mapped values and any leftovers so the UI can flag them.
 */
export function normalizeInnovationType(raw: string | null | undefined): NormalizedInnovationType {
  const parts = splitMultiValue(raw);
  const mappedSet = new Set<InnovationType>();
  const unmapped: string[] = [];
  for (const p of parts) {
    const key = stripForMatch(p);
    const hit = INNOVATION_TYPE_LOOKUP[key];
    if (hit) mappedSet.add(hit);
    else unmapped.push(p);
  }
  return { mapped: Array.from(mappedSet), unmapped };
}
