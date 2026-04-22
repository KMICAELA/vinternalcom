ALTER TABLE public.fund_quarter_snapshots
  ADD COLUMN IF NOT EXISTS fund_total_distributions_usd numeric,
  ADD COLUMN IF NOT EXISTS tvpi numeric,
  ADD COLUMN IF NOT EXISTS dpi numeric,
  ADD COLUMN IF NOT EXISTS moic numeric,
  ADD COLUMN IF NOT EXISTS irr numeric;

ALTER TABLE public.direct_quarter_snapshots
  ADD COLUMN IF NOT EXISTS moic numeric,
  ADD COLUMN IF NOT EXISTS twh_ownership_pct numeric;

ALTER TABLE public.underlying_holdings
  ADD COLUMN IF NOT EXISTS moic numeric;