-- 1. Create fx_rates table
CREATE TABLE public.fx_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_pair text NOT NULL,
  rate numeric NOT NULL,
  rate_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (currency_pair, rate_date)
);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_fxr" ON public.fx_rates
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- 2. Add source currency columns to fund_quarterly_reports
ALTER TABLE public.fund_quarterly_reports
  ADD COLUMN source_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN source_nav numeric,
  ADD COLUMN source_contributions numeric,
  ADD COLUMN source_distributions numeric,
  ADD COLUMN fx_rate_id uuid REFERENCES public.fx_rates(id);