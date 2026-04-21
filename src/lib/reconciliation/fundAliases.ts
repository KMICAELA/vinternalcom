/**
 * Fund-name alias map. The xlsx workbook uses short names ("Cantos",
 * "Quantonation") while the database stores full legal names
 * ("Cantos Ventures IV, LP", "Quantonation 2 Feeder, LLC").
 *
 * This map normalises a name from EITHER side into a canonical
 * lowercase token used for lookups.
 */
export const FUND_ALIASES: Record<string, string> = {
  // alias (normalised lower) -> canonical DB legal_name
  "cantos": "Cantos Ventures IV, LP",
  "quantonation": "Quantonation 2 Feeder, LLC",
  "lowercarbon": "Lowercarbon 421.0 Parallel Fund, LP",
  "third sphere": "Third Sphere Fund IV, LP",
  "generational": "Generational Partners Fund I, LP",
  "svlc": "SVLC Fund III, LP",
  "tamarack": "Tamarack Global Opportunities II, LP",
  "leap global": "Leap Global Partners Fund II, LP",
  "leap": "Leap Global Partners Fund II, LP",
  "civilization": "Civilization Ventures Fund III, LP",
  "onevc": "ONEVC Fund III, LP",
  "one vc": "ONEVC Fund III, LP",
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Resolve an xlsx-side fund name to a canonical DB legal_name.
 * Falls back to the original (trimmed) name when no alias matches.
 */
export function resolveFundName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  const key = norm(trimmed);
  if (FUND_ALIASES[key]) return FUND_ALIASES[key];
  // Try first-word heuristic ("Cantos Ventures" -> "Cantos")
  const firstWord = key.split(" ")[0];
  if (FUND_ALIASES[firstWord]) return FUND_ALIASES[firstWord];
  return trimmed;
}

export { norm as normFundName };
