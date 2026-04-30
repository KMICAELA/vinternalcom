-- 1. Allow NULL for cost/FMV so we can represent TBD (vs $0 = real markdown)
ALTER TABLE public.underlying_holdings
  ALTER COLUMN fund_cost_usd DROP NOT NULL,
  ALTER COLUMN fund_cost_usd DROP DEFAULT,
  ALTER COLUMN fund_fmv_usd DROP NOT NULL,
  ALTER COLUMN fund_fmv_usd DROP DEFAULT,
  ALTER COLUMN fund_proceeds_usd DROP NOT NULL,
  ALTER COLUMN fund_proceeds_usd DROP DEFAULT,
  ALTER COLUMN twh_cost_usd DROP NOT NULL,
  ALTER COLUMN twh_cost_usd DROP DEFAULT,
  ALTER COLUMN twh_fmv_usd DROP NOT NULL,
  ALTER COLUMN twh_fmv_usd DROP DEFAULT,
  ALTER COLUMN twh_proceeds_usd DROP NOT NULL,
  ALTER COLUMN twh_proceeds_usd DROP DEFAULT;

-- 2. Add round_detail to preserve sub-tranche labels (Seed 2, Series A-2, etc.)
ALTER TABLE public.underlying_holdings ADD COLUMN IF NOT EXISTS round_detail text;
ALTER TABLE public.directs            ADD COLUMN IF NOT EXISTS round_detail text;

-- 3. Helper: normalize round names. Pure SQL, no side effects.
CREATE OR REPLACE FUNCTION public.normalize_round_name(_raw text)
RETURNS TABLE(round text, round_detail text, instrument_extracted text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
  letter text;
  detail text := NULL;
  instr  text := NULL;
BEGIN
  IF _raw IS NULL OR btrim(_raw) = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text; RETURN;
  END IF;

  v := lower(btrim(_raw));
  v := regexp_replace(v, '\s+', ' ', 'g');

  -- Instrument keywords masquerading as round
  IF v ~ '\msafe\M'                   THEN instr := 'SAFE';
  ELSIF v ~ '(convertible|conv)\s*(note|debt)?' OR v = 'note' THEN instr := 'Convertible Note';
  ELSIF v ~ 'common(\s+stock|\s+equity)?' THEN instr := 'Common Stock';
  ELSIF v ~ '(token\s*warrant|token\s*drop|^token$)' THEN instr := 'Token';
  ELSIF v ~ 'warrant'                 THEN instr := 'Warrant';
  ELSIF v ~ '(partnership|lp)\s+interest' THEN instr := 'Partnership Interest';
  END IF;

  -- If the value is purely an instrument keyword and has no series letter, return instrument-only
  IF instr IS NOT NULL AND v !~ '(series\s+[a-g])|(\m[a-g]-?\d?\M)|seed|growth|bridge' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, instr; RETURN;
  END IF;

  -- Pre-Seed
  IF v ~ '(pre[\s-]?seed)' THEN
    RETURN QUERY SELECT 'Pre-Seed'::text, NULLIF(_raw, 'Pre-Seed'), instr; RETURN;
  END IF;

  -- Seed family (Seed, Seed 2, Seed Plus, Seed Extension, Series Seed)
  IF v ~ '(^|\s)seed' OR v ~ 'series\s+seed' THEN
    -- preserve any sub-label as round_detail
    IF v ~ '(seed\s*[\d+]|seed\s*plus|seed\s*extension|seed-?\d)' THEN
      detail := initcap(btrim(_raw));
    END IF;
    RETURN QUERY SELECT 'Seed'::text, detail, instr; RETURN;
  END IF;

  -- Growth / Bridge
  IF v ~ 'growth' THEN RETURN QUERY SELECT 'Growth'::text, NULL::text, instr; RETURN; END IF;
  IF v ~ 'bridge' THEN RETURN QUERY SELECT 'Bridge'::text, NULL::text, instr; RETURN; END IF;

  -- Series A-G (with optional sub-tranche)
  letter := (regexp_match(v, '(?:^|series\s+|\s)([a-g])(?:-?\d)?(?:\s|$|\s*pref)'))[1];
  IF letter IS NOT NULL THEN
    -- Detect sub-tranche
    IF v ~ ('(series\s+' || letter || '-?\d)|(\m' || letter || '-\d\M)') THEN
      detail := initcap(btrim(_raw));
    END IF;
    RETURN QUERY SELECT ('Series ' || upper(letter))::text, detail, instr; RETURN;
  END IF;

  -- Fallback: leave as-is title-cased
  RETURN QUERY SELECT initcap(_raw), NULL::text, instr;
END;
$$;

-- 4. One-time backfill on underlying_holdings
WITH norm AS (
  SELECT h.id,
         (n).round           AS new_round,
         (n).round_detail    AS new_detail,
         (n).instrument_extracted AS new_instr_from_round
  FROM public.underlying_holdings h
  LEFT JOIN LATERAL public.normalize_round_name(h.round) n ON TRUE
)
UPDATE public.underlying_holdings h
SET round        = norm.new_round,
    round_detail = COALESCE(h.round_detail, norm.new_detail),
    instrument   = COALESCE(h.instrument, norm.new_instr_from_round)
FROM norm
WHERE h.id = norm.id
  AND (h.round IS DISTINCT FROM norm.new_round
       OR (norm.new_detail IS NOT NULL AND h.round_detail IS NULL)
       OR (norm.new_instr_from_round IS NOT NULL AND h.instrument IS NULL));

-- 5. Same backfill on directs
WITH norm AS (
  SELECT d.id,
         (n).round           AS new_round,
         (n).round_detail    AS new_detail,
         (n).instrument_extracted AS new_instr_from_round
  FROM public.directs d
  LEFT JOIN LATERAL public.normalize_round_name(d.round) n ON TRUE
)
UPDATE public.directs d
SET round        = norm.new_round,
    round_detail = COALESCE(d.round_detail, norm.new_detail),
    instrument   = COALESCE(d.instrument, norm.new_instr_from_round)
FROM norm
WHERE d.id = norm.id
  AND (d.round IS DISTINCT FROM norm.new_round
       OR (norm.new_detail IS NOT NULL AND d.round_detail IS NULL)
       OR (norm.new_instr_from_round IS NOT NULL AND d.instrument IS NULL));