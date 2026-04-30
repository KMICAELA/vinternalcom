// Round / Instrument normalization — single source of truth for the frontend.
// Mirrors the Postgres `normalize_round_name(text)` SQL function so post-extraction
// cleanup in the wizard/sandbox produces identical canonical values to what the
// DB-level migration produced for historical data.
//
// Rules (must stay in sync with the SQL function):
//   - Sub-tranches collapse to parent series:  "A-1", "Series A Pref", "A-2"  → "Series A"
//   - Seed family collapses to "Seed"; the original label (e.g. "Seed 2",
//     "Seed Plus", "Seed Extension") is preserved in `round_detail`.
//   - "Pre-Seed" is its own bucket (never collapsed into Seed).
//   - Instrument keywords (SAFE, Convertible Note, Common Stock, Token, Warrant,
//     Partnership Interest) found in the round string get extracted into
//     `instrument_extracted`. If the value is purely an instrument with no
//     series letter, `round` returns null (the value belongs in the instrument
//     column, not the round column).

export type NormalizedRound = {
  round: string | null;
  round_detail: string | null;
  instrument_extracted: string | null;
};

const INSTRUMENT_PATTERNS: Array<[RegExp, string]> = [
  [/\bsafe\b/, "SAFE"],
  [/(convertible|conv)\s*(note|debt)?|^note$/, "Convertible Note"],
  [/common(\s+stock|\s+equity)?/, "Common Stock"],
  [/(token\s*warrant|token\s*drop|^token$)/, "Token"],
  [/warrant/, "Warrant"],
  [/(partnership|lp)\s+interest/, "Partnership Interest"],
];

const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

export function normalizeRound(raw: string | null | undefined): NormalizedRound {
  if (!raw || !raw.trim()) {
    return { round: null, round_detail: null, instrument_extracted: null };
  }
  const v = raw.trim().toLowerCase().replace(/\s+/g, " ");

  let instrument: string | null = null;
  for (const [re, name] of INSTRUMENT_PATTERNS) {
    if (re.test(v)) {
      instrument = name;
      break;
    }
  }

  const hasSeriesSignal = /(series\s+[a-g])|(\b[a-g]-?\d?\b)|seed|growth|bridge/.test(v);
  if (instrument && !hasSeriesSignal) {
    return { round: null, round_detail: null, instrument_extracted: instrument };
  }

  if (/(pre[\s-]?seed)/.test(v)) {
    return { round: "Pre-Seed", round_detail: null, instrument_extracted: instrument };
  }

  if (/(^|\s)seed/.test(v) || /series\s+seed/.test(v)) {
    let detail: string | null = null;
    if (/(seed\s*[\d+]|seed\s*plus|seed\s*extension|seed-?\d)/.test(v)) {
      detail = titleCase(raw.trim());
    }
    return { round: "Seed", round_detail: detail, instrument_extracted: instrument };
  }

  if (/growth/.test(v)) return { round: "Growth", round_detail: null, instrument_extracted: instrument };
  if (/bridge/.test(v)) return { round: "Bridge", round_detail: null, instrument_extracted: instrument };

  const m = v.match(/(?:^|series\s+|\s)([a-g])(?:-?\d)?(?:\s|$|\s*pref)/);
  if (m) {
    const letter = m[1].toUpperCase();
    const subRe = new RegExp(`(series\\s+${m[1]}-?\\d)|(\\b${m[1]}-\\d\\b)`);
    const detail = subRe.test(v) ? titleCase(raw.trim()) : null;
    return { round: `Series ${letter}`, round_detail: detail, instrument_extracted: instrument };
  }

  return { round: titleCase(raw), round_detail: null, instrument_extracted: instrument };
}

/** Convenience: apply normalization in-place to an object with round/instrument fields. */
export function applyNormalization<T extends { round?: string | null; round_detail?: string | null; instrument?: string | null }>(
  row: T
): T {
  const n = normalizeRound(row.round);
  const out: T = { ...row };
  out.round = n.round;
  if (n.round_detail && !row.round_detail) out.round_detail = n.round_detail;
  if (n.instrument_extracted && !row.instrument) out.instrument = n.instrument_extracted;
  return out;
}
