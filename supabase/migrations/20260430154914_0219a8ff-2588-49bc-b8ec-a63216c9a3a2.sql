CREATE OR REPLACE FUNCTION public.normalize_round_name(_raw text)
RETURNS TABLE(round text, round_detail text, instrument_extracted text)
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
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
  IF v ~ '\msafe\M'                   THEN instr := 'SAFE';
  ELSIF v ~ '(convertible|conv)\s*(note|debt)?' OR v = 'note' THEN instr := 'Convertible Note';
  ELSIF v ~ 'common(\s+stock|\s+equity)?' THEN instr := 'Common Stock';
  ELSIF v ~ '(token\s*warrant|token\s*drop|^token$)' THEN instr := 'Token';
  ELSIF v ~ 'warrant'                 THEN instr := 'Warrant';
  ELSIF v ~ '(partnership|lp)\s+interest' THEN instr := 'Partnership Interest';
  END IF;
  IF instr IS NOT NULL AND v !~ '(series\s+[a-g])|(\m[a-g]-?\d?\M)|seed|growth|bridge' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, instr; RETURN;
  END IF;
  IF v ~ '(pre[\s-]?seed)' THEN
    RETURN QUERY SELECT 'Pre-Seed'::text, NULLIF(_raw, 'Pre-Seed'), instr; RETURN;
  END IF;
  IF v ~ '(^|\s)seed' OR v ~ 'series\s+seed' THEN
    IF v ~ '(seed\s*[\d+]|seed\s*plus|seed\s*extension|seed-?\d)' THEN
      detail := initcap(btrim(_raw));
    END IF;
    RETURN QUERY SELECT 'Seed'::text, detail, instr; RETURN;
  END IF;
  IF v ~ 'growth' THEN RETURN QUERY SELECT 'Growth'::text, NULL::text, instr; RETURN; END IF;
  IF v ~ 'bridge' THEN RETURN QUERY SELECT 'Bridge'::text, NULL::text, instr; RETURN; END IF;
  letter := (regexp_match(v, '(?:^|series\s+|\s)([a-g])(?:-?\d)?(?:\s|$|\s*pref)'))[1];
  IF letter IS NOT NULL THEN
    IF v ~ ('(series\s+' || letter || '-?\d)|(\m' || letter || '-\d\M)') THEN
      detail := initcap(btrim(_raw));
    END IF;
    RETURN QUERY SELECT ('Series ' || upper(letter))::text, detail, instr; RETURN;
  END IF;
  RETURN QUERY SELECT initcap(_raw), NULL::text, instr;
END;
$$;