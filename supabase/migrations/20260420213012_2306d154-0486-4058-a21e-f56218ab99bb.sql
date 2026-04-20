-- ============================================================
-- XIRR + computed_metrics computation pipeline
-- ============================================================

-- 1. XIRR helper (Newton's method, seed=0.1, fallback to bisection, tol=1e-7)
CREATE OR REPLACE FUNCTION public.xirr(
  _dates date[],
  _amounts numeric[]
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int := array_length(_dates, 1);
  d0 date;
  i int;
  has_pos boolean := false;
  has_neg boolean := false;
  rate numeric := 0.1;
  iter int;
  f numeric;
  fp numeric;
  t numeric;
  base numeric;
  delta numeric;
  lo numeric;
  hi numeric;
  mid numeric;
  flo numeric;
  fmid numeric;
BEGIN
  IF n IS NULL OR n < 2 OR n <> COALESCE(array_length(_amounts,1),0) THEN
    RETURN NULL;
  END IF;

  -- need at least one positive and one negative
  FOR i IN 1..n LOOP
    IF _amounts[i] > 0 THEN has_pos := true; END IF;
    IF _amounts[i] < 0 THEN has_neg := true; END IF;
  END LOOP;
  IF NOT (has_pos AND has_neg) THEN RETURN NULL; END IF;

  d0 := _dates[1];

  -- Newton's method, max 100 iterations
  FOR iter IN 1..100 LOOP
    f := 0; fp := 0;
    base := 1 + rate;
    IF base <= 0 THEN
      rate := -0.999999; base := 1 + rate;
    END IF;
    FOR i IN 1..n LOOP
      t := (_dates[i] - d0)::numeric / 365.0;
      f  := f  + _amounts[i] / power(base, t);
      fp := fp - _amounts[i] * t / power(base, t + 1);
    END LOOP;
    IF abs(f) < 1e-7 THEN
      RETURN round(rate, 8);
    END IF;
    IF fp = 0 THEN EXIT; END IF;
    delta := f / fp;
    rate := rate - delta;
    IF abs(delta) < 1e-9 THEN
      RETURN round(rate, 8);
    END IF;
    IF rate <= -0.999999 THEN rate := -0.999; END IF;
  END LOOP;

  -- Bisection fallback over [-0.99, 10]
  lo := -0.99; hi := 10.0;
  flo := 0;
  FOR i IN 1..n LOOP
    t := (_dates[i] - d0)::numeric / 365.0;
    flo := flo + _amounts[i] / power(1 + lo, t);
  END LOOP;
  FOR iter IN 1..200 LOOP
    mid := (lo + hi) / 2;
    fmid := 0;
    FOR i IN 1..n LOOP
      t := (_dates[i] - d0)::numeric / 365.0;
      fmid := fmid + _amounts[i] / power(1 + mid, t);
    END LOOP;
    IF abs(fmid) < 1e-7 OR (hi - lo) < 1e-9 THEN
      RETURN round(mid, 8);
    END IF;
    IF (flo > 0 AND fmid > 0) OR (flo < 0 AND fmid < 0) THEN
      lo := mid; flo := fmid;
    ELSE
      hi := mid;
    END IF;
  END LOOP;

  RETURN round(mid, 8);
END;
$$;


-- 2. compute_quarter_metrics(quarter_id) — recomputes consolidated metrics for one quarter
CREATE OR REPLACE FUNCTION public.compute_quarter_metrics(_quarter_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qend date;
  v_terminal_nav numeric := 0;
  v_net_contrib numeric := 0;     -- positive USD
  v_net_distrib numeric := 0;     -- positive USD
  v_gross_contrib numeric := 0;
  v_gross_distrib numeric := 0;
  v_net_tvpi numeric;
  v_gross_tvpi numeric;
  v_net_irr numeric;
  v_gross_irr numeric;
  v_portfolio_moic numeric;
  v_total_cost numeric := 0;
  v_total_value numeric := 0;
  v_dates date[];
  v_amounts numeric[];
BEGIN
  SELECT quarter_end_date INTO v_qend FROM quarters WHERE id = _quarter_id;
  IF v_qend IS NULL THEN RETURN; END IF;

  -- Terminal NAV at quarter_end = sum(twh_nav_usd) from fund snapshots
  --                              + sum(twh_fmv_usd) from direct snapshots
  SELECT COALESCE(SUM(twh_nav_usd), 0) INTO v_terminal_nav
  FROM fund_quarter_snapshots WHERE quarter_id = _quarter_id;

  v_terminal_nav := v_terminal_nav + COALESCE((
    SELECT SUM(twh_fmv_usd) FROM direct_quarter_snapshots WHERE quarter_id = _quarter_id
  ), 0);

  -- Net cashflows (DB convention: contributions stored NEGATIVE, distributions POSITIVE)
  SELECT COALESCE(SUM(CASE WHEN amount_usd < 0 THEN -amount_usd ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN amount_usd > 0 THEN  amount_usd ELSE 0 END), 0)
    INTO v_net_contrib, v_net_distrib
  FROM cash_flows
  WHERE scope = 'twh_net' AND date <= v_qend;

  SELECT COALESCE(SUM(CASE WHEN amount_usd < 0 THEN -amount_usd ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN amount_usd > 0 THEN  amount_usd ELSE 0 END), 0)
    INTO v_gross_contrib, v_gross_distrib
  FROM cash_flows
  WHERE scope = 'twh_gross' AND date <= v_qend;

  -- TVPI = (distributions + terminal NAV) / contributions
  IF v_net_contrib > 0 THEN
    v_net_tvpi := round((v_net_distrib + v_terminal_nav) / v_net_contrib, 6);
  END IF;
  IF v_gross_contrib > 0 THEN
    v_gross_tvpi := round((v_gross_distrib + v_terminal_nav) / v_gross_contrib, 6);
  END IF;

  -- Portfolio MOIC = sum(direct cost + underlying TWH-equivalent cost? )
  -- Use directs (twh_cost) + direct snapshot FMV/Proceeds; plus underlying via fund_quarter twh_nav already in terminal_nav.
  -- Simpler: portfolio_moic = (terminal_nav + net_distrib) / net_contrib   (same as net TVPI here)
  -- Better: compute from direct + underlying invested cost vs current value
  SELECT COALESCE(SUM(d.twh_cost_usd), 0) INTO v_total_cost
  FROM directs d
  WHERE d.investment_date IS NULL OR d.investment_date <= v_qend;

  SELECT COALESCE(SUM(s.twh_fmv_usd + s.twh_proceeds_usd), 0) INTO v_total_value
  FROM direct_quarter_snapshots s WHERE s.quarter_id = _quarter_id;

  IF v_total_cost > 0 THEN
    v_portfolio_moic := round(v_total_value / v_total_cost, 6);
  END IF;

  -- Net IRR via XIRR: net cash flow series + terminal NAV inflow at quarter_end
  WITH series AS (
    SELECT date, amount_usd FROM cash_flows
     WHERE scope = 'twh_net' AND date <= v_qend
    UNION ALL
    SELECT v_qend, v_terminal_nav WHERE v_terminal_nav > 0
    ORDER BY date
  )
  SELECT array_agg(date ORDER BY date), array_agg(amount_usd ORDER BY date)
    INTO v_dates, v_amounts FROM series;
  IF v_dates IS NOT NULL AND array_length(v_dates,1) >= 2 THEN
    v_net_irr := xirr(v_dates, v_amounts);
  END IF;

  WITH series AS (
    SELECT date, amount_usd FROM cash_flows
     WHERE scope = 'twh_gross' AND date <= v_qend
    UNION ALL
    SELECT v_qend, v_terminal_nav WHERE v_terminal_nav > 0
    ORDER BY date
  )
  SELECT array_agg(date ORDER BY date), array_agg(amount_usd ORDER BY date)
    INTO v_dates, v_amounts FROM series;
  IF v_dates IS NOT NULL AND array_length(v_dates,1) >= 2 THEN
    v_gross_irr := xirr(v_dates, v_amounts);
  END IF;

  -- Upsert consolidated row (uniqueness: quarter_id + scope='consolidated')
  DELETE FROM computed_metrics
   WHERE quarter_id = _quarter_id AND scope = 'consolidated';

  INSERT INTO computed_metrics
    (quarter_id, scope, net_tvpi, net_irr, gross_moic, gross_irr, dpi, rvpi, computed_at)
  VALUES
    (_quarter_id, 'consolidated',
     v_net_tvpi, v_net_irr,
     COALESCE(v_gross_tvpi, v_portfolio_moic), v_gross_irr,
     CASE WHEN v_net_contrib > 0 THEN round(v_net_distrib / v_net_contrib, 6) END,
     CASE WHEN v_net_contrib > 0 THEN round(v_terminal_nav / v_net_contrib, 6) END,
     now());
END;
$$;


-- 3. Trigger function: recompute affected quarter on cash_flows / snapshot changes
CREATE OR REPLACE FUNCTION public.cash_flows_recompute_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q record;
  cf_date date;
BEGIN
  cf_date := COALESCE(NEW.date, OLD.date);
  -- recompute every quarter whose end_date is on/after the cashflow date
  FOR q IN SELECT id FROM quarters WHERE quarter_end_date >= cf_date LOOP
    PERFORM compute_quarter_metrics(q.id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_recompute_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM compute_quarter_metrics(COALESCE(NEW.quarter_id, OLD.quarter_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_flows_recompute_metrics ON public.cash_flows;
CREATE TRIGGER trg_cash_flows_recompute_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.cash_flows
FOR EACH ROW EXECUTE FUNCTION public.cash_flows_recompute_metrics();

DROP TRIGGER IF EXISTS trg_fqs_recompute_metrics ON public.fund_quarter_snapshots;
CREATE TRIGGER trg_fqs_recompute_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.fund_quarter_snapshots
FOR EACH ROW EXECUTE FUNCTION public.snapshot_recompute_metrics();

DROP TRIGGER IF EXISTS trg_dqs_recompute_metrics ON public.direct_quarter_snapshots;
CREATE TRIGGER trg_dqs_recompute_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.direct_quarter_snapshots
FOR EACH ROW EXECUTE FUNCTION public.snapshot_recompute_metrics();

-- 4. Backfill: compute metrics for every existing quarter
DO $$
DECLARE q record;
BEGIN
  FOR q IN SELECT id FROM quarters LOOP
    PERFORM public.compute_quarter_metrics(q.id);
  END LOOP;
END $$;

-- 5. Ensure unique constraint for consolidated row per quarter
CREATE UNIQUE INDEX IF NOT EXISTS computed_metrics_quarter_consolidated_uniq
  ON public.computed_metrics (quarter_id)
  WHERE scope = 'consolidated' AND fund_id IS NULL AND direct_id IS NULL;
