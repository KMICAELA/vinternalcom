-- ─────────────────────────────────────────────────────────────────────────
-- Auto-derive *_usd from *_native using fund_fx_rates lookups.
--
-- After this migration, the canonical write for a non-USD report becomes:
--   currency='EUR', *_native populated, *_usd left NULL.
-- The trigger fills *_usd by multiplying *_native × rate from fund_fx_rates
-- (resolved by fund_id+quarter_id+from_currency, fund-specific over global).
-- USD reports continue to write to both columns equal.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lookup_fund_fx_rate(
  _fund_id uuid,
  _quarter_id uuid,
  _from_currency text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rate FROM (
    SELECT rate, fund_id
      FROM public.fund_fx_rates
     WHERE quarter_id = _quarter_id
       AND from_currency = _from_currency
       AND to_currency = 'USD'
       AND (fund_id = _fund_id OR fund_id IS NULL)
     ORDER BY (fund_id = _fund_id) DESC NULLS LAST
     LIMIT 1
  ) t;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger: derive USD on underlying_holdings rows
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.underlying_holdings_derive_usd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF COALESCE(NEW.currency, 'USD') = 'USD' THEN
    -- USD: keep *_usd as provided; mirror *_native if missing
    NEW.fund_cost_native := COALESCE(NEW.fund_cost_native, NEW.fund_cost_usd);
    NEW.fund_fmv_native := COALESCE(NEW.fund_fmv_native, NEW.fund_fmv_usd);
    NEW.fund_proceeds_native := COALESCE(NEW.fund_proceeds_native, NEW.fund_proceeds_usd);
    NEW.twh_cost_native := COALESCE(NEW.twh_cost_native, NEW.twh_cost_usd);
    NEW.twh_fmv_native := COALESCE(NEW.twh_fmv_native, NEW.twh_fmv_usd);
    NEW.twh_proceeds_native := COALESCE(NEW.twh_proceeds_native, NEW.twh_proceeds_usd);
    RETURN NEW;
  END IF;

  v_rate := public.lookup_fund_fx_rate(NEW.fund_id, NEW.quarter_id, NEW.currency);
  IF v_rate IS NULL THEN
    -- No rate yet — leave *_usd null. Will be backfilled when a rate is added.
    NEW.fund_cost_usd := NULL;
    NEW.fund_fmv_usd := NULL;
    NEW.fund_proceeds_usd := NULL;
    NEW.twh_cost_usd := NULL;
    NEW.twh_fmv_usd := NULL;
    NEW.twh_proceeds_usd := NULL;
    RETURN NEW;
  END IF;

  NEW.fund_cost_usd := CASE WHEN NEW.fund_cost_native IS NULL THEN NULL ELSE round(NEW.fund_cost_native * v_rate) END;
  NEW.fund_fmv_usd := CASE WHEN NEW.fund_fmv_native IS NULL THEN NULL ELSE round(NEW.fund_fmv_native * v_rate) END;
  NEW.fund_proceeds_usd := CASE WHEN NEW.fund_proceeds_native IS NULL THEN NULL ELSE round(NEW.fund_proceeds_native * v_rate) END;
  NEW.twh_cost_usd := CASE WHEN NEW.twh_cost_native IS NULL THEN NULL ELSE round(NEW.twh_cost_native * v_rate) END;
  NEW.twh_fmv_usd := CASE WHEN NEW.twh_fmv_native IS NULL THEN NULL ELSE round(NEW.twh_fmv_native * v_rate) END;
  NEW.twh_proceeds_usd := CASE WHEN NEW.twh_proceeds_native IS NULL THEN NULL ELSE round(NEW.twh_proceeds_native * v_rate) END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_underlying_holdings_derive_usd ON public.underlying_holdings;
CREATE TRIGGER trg_underlying_holdings_derive_usd
BEFORE INSERT OR UPDATE ON public.underlying_holdings
FOR EACH ROW
EXECUTE FUNCTION public.underlying_holdings_derive_usd();

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger: derive USD on fund_quarter_snapshots rows
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fund_quarter_snapshots_derive_usd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF COALESCE(NEW.currency, 'USD') = 'USD' THEN
    NEW.fund_total_contributions_native := COALESCE(NEW.fund_total_contributions_native, NEW.fund_total_contributions_usd);
    NEW.fund_total_nav_native := COALESCE(NEW.fund_total_nav_native, NEW.fund_total_nav_usd);
    NEW.fund_total_distributions_native := COALESCE(NEW.fund_total_distributions_native, NEW.fund_total_distributions_usd);
    NEW.twh_contributions_native := COALESCE(NEW.twh_contributions_native, NEW.twh_contributions_usd);
    NEW.twh_distributions_native := COALESCE(NEW.twh_distributions_native, NEW.twh_distributions_usd);
    NEW.twh_nav_native := COALESCE(NEW.twh_nav_native, NEW.twh_nav_usd);
    RETURN NEW;
  END IF;

  v_rate := public.lookup_fund_fx_rate(NEW.fund_id, NEW.quarter_id, NEW.currency);
  IF v_rate IS NULL THEN
    NEW.fund_total_contributions_usd := NULL;
    NEW.fund_total_nav_usd := NULL;
    NEW.fund_total_distributions_usd := NULL;
    NEW.twh_contributions_usd := 0;  -- NOT NULL columns; use 0 as placeholder
    NEW.twh_distributions_usd := 0;
    NEW.twh_nav_usd := 0;
    RETURN NEW;
  END IF;

  NEW.fund_total_contributions_usd := CASE WHEN NEW.fund_total_contributions_native IS NULL THEN 0 ELSE round(NEW.fund_total_contributions_native * v_rate) END;
  NEW.fund_total_nav_usd := CASE WHEN NEW.fund_total_nav_native IS NULL THEN 0 ELSE round(NEW.fund_total_nav_native * v_rate) END;
  NEW.fund_total_distributions_usd := CASE WHEN NEW.fund_total_distributions_native IS NULL THEN NULL ELSE round(NEW.fund_total_distributions_native * v_rate) END;
  NEW.twh_contributions_usd := CASE WHEN NEW.twh_contributions_native IS NULL THEN 0 ELSE round(NEW.twh_contributions_native * v_rate) END;
  NEW.twh_distributions_usd := CASE WHEN NEW.twh_distributions_native IS NULL THEN 0 ELSE round(NEW.twh_distributions_native * v_rate) END;
  NEW.twh_nav_usd := CASE WHEN NEW.twh_nav_native IS NULL THEN 0 ELSE round(NEW.twh_nav_native * v_rate) END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fund_quarter_snapshots_derive_usd ON public.fund_quarter_snapshots;
CREATE TRIGGER trg_fund_quarter_snapshots_derive_usd
BEFORE INSERT OR UPDATE ON public.fund_quarter_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fund_quarter_snapshots_derive_usd();

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger on fund_fx_rates: when a rate is created/updated, recompute USD
-- on every matching underlying_holdings + fund_quarter_snapshots row.
-- We do this by issuing a no-op UPDATE which fires the BEFORE triggers above.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fund_fx_rates_propagate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recompute holdings: rows whose fund matches (NEW.fund_id IS NULL means global fallback)
  UPDATE public.underlying_holdings
     SET updated_at = now()
   WHERE quarter_id = NEW.quarter_id
     AND currency = NEW.from_currency
     AND (NEW.fund_id IS NULL OR fund_id = NEW.fund_id);

  UPDATE public.fund_quarter_snapshots
     SET updated_at = now()
   WHERE quarter_id = NEW.quarter_id
     AND currency = NEW.from_currency
     AND (NEW.fund_id IS NULL OR fund_id = NEW.fund_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fund_fx_rates_propagate ON public.fund_fx_rates;
CREATE TRIGGER trg_fund_fx_rates_propagate
AFTER INSERT OR UPDATE OF rate, from_currency, to_currency ON public.fund_fx_rates
FOR EACH ROW
EXECUTE FUNCTION public.fund_fx_rates_propagate();
