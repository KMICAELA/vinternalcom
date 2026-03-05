ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS theme text;
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS company_industries text;
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS target_industries text;