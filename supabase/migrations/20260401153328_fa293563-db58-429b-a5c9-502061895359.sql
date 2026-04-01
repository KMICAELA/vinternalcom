ALTER TABLE public.underlying_portfolio_holdings 
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS company_industries text,
  ADD COLUMN IF NOT EXISTS target_industries text;