-- 1. Add native_currency to funds
ALTER TABLE public.funds
  ADD COLUMN IF NOT EXISTS native_currency text NOT NULL DEFAULT 'USD';

-- 2. Add native + currency columns to underlying_holdings (option b)
ALTER TABLE public.underlying_holdings
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS fund_cost_native numeric,
  ADD COLUMN IF NOT EXISTS fund_fmv_native numeric,
  ADD COLUMN IF NOT EXISTS fund_proceeds_native numeric,
  ADD COLUMN IF NOT EXISTS twh_cost_native numeric,
  ADD COLUMN IF NOT EXISTS twh_fmv_native numeric,
  ADD COLUMN IF NOT EXISTS twh_proceeds_native numeric;

-- Backfill native = usd for existing rows
UPDATE public.underlying_holdings
   SET fund_cost_native = COALESCE(fund_cost_native, fund_cost_usd),
       fund_fmv_native = COALESCE(fund_fmv_native, fund_fmv_usd),
       fund_proceeds_native = COALESCE(fund_proceeds_native, fund_proceeds_usd),
       twh_cost_native = COALESCE(twh_cost_native, twh_cost_usd),
       twh_fmv_native = COALESCE(twh_fmv_native, twh_fmv_usd),
       twh_proceeds_native = COALESCE(twh_proceeds_native, twh_proceeds_usd)
 WHERE fund_cost_native IS NULL OR fund_fmv_native IS NULL OR fund_proceeds_native IS NULL
    OR twh_cost_native IS NULL OR twh_fmv_native IS NULL OR twh_proceeds_native IS NULL;

-- 3. Add native + currency columns to fund_quarter_snapshots
ALTER TABLE public.fund_quarter_snapshots
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS fund_total_nav_native numeric,
  ADD COLUMN IF NOT EXISTS fund_total_contributions_native numeric,
  ADD COLUMN IF NOT EXISTS fund_total_distributions_native numeric,
  ADD COLUMN IF NOT EXISTS twh_contributions_native numeric,
  ADD COLUMN IF NOT EXISTS twh_distributions_native numeric,
  ADD COLUMN IF NOT EXISTS twh_nav_native numeric;

UPDATE public.fund_quarter_snapshots
   SET fund_total_nav_native = COALESCE(fund_total_nav_native, fund_total_nav_usd),
       fund_total_contributions_native = COALESCE(fund_total_contributions_native, fund_total_contributions_usd),
       fund_total_distributions_native = COALESCE(fund_total_distributions_native, fund_total_distributions_usd),
       twh_contributions_native = COALESCE(twh_contributions_native, twh_contributions_usd),
       twh_distributions_native = COALESCE(twh_distributions_native, twh_distributions_usd),
       twh_nav_native = COALESCE(twh_nav_native, twh_nav_usd);

-- 4. fund_fx_rates table
CREATE TABLE IF NOT EXISTS public.fund_fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid REFERENCES public.funds(id) ON DELETE CASCADE,
  quarter_id uuid NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  from_currency text NOT NULL,
  to_currency text NOT NULL DEFAULT 'USD',
  rate numeric NOT NULL CHECK (rate > 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto_ecb','auto_frankfurter')),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint (treat null fund_id distinctly via two partial indexes)
CREATE UNIQUE INDEX IF NOT EXISTS fund_fx_rates_unique_fund
  ON public.fund_fx_rates (fund_id, quarter_id, from_currency, to_currency)
  WHERE fund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fund_fx_rates_unique_global
  ON public.fund_fx_rates (quarter_id, from_currency, to_currency)
  WHERE fund_id IS NULL;

ALTER TABLE public.fund_fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY fund_fx_rates_read ON public.fund_fx_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY fund_fx_rates_admin_write ON public.fund_fx_rates
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER fund_fx_rates_touch
  BEFORE UPDATE ON public.fund_fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Mark Quantonation 2 Feeder as EUR-native
UPDATE public.funds
   SET native_currency = 'EUR'
 WHERE name ILIKE '%Quantonation 2 Feeder%' OR name ILIKE '%Quantonation II Feeder%';