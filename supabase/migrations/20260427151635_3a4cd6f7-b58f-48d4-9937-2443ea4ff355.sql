ALTER TABLE public.companies
  ALTER COLUMN type DROP DEFAULT;

ALTER TABLE public.companies
  ALTER COLUMN type TYPE text[]
  USING CASE
    WHEN type IS NULL OR btrim(type) = '' THEN NULL
    ELSE string_to_array(regexp_replace(btrim(type), '\s*,\s*', ',', 'g'), ',')
  END;

ALTER TABLE public.companies
  ALTER COLUMN type SET DEFAULT '{}'::text[];

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS notes text;
