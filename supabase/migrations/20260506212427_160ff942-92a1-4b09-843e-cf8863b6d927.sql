-- Step 3 backfill (Interpretation A): existing 2Q25/3Q25 Quantonation 2 Feeder rows
-- were stored as USD-converted values at the legacy 1.1987 rate. Convert them back
-- to EUR native and let the derive trigger recompute USD at the configured 1.17254 rate.

DO $$
DECLARE
  v_old_rate numeric := 1.1987;
  v_fund uuid := '8696fc3f-6ebb-467e-baa9-0d8ff27cc49e';
  v_quarters uuid[] := ARRAY['d1e3c9d9-35d9-4046-9f38-5e988e1ee828'::uuid, '8350e66d-f82f-4d7c-a4b4-6a81031321dc'::uuid];
BEGIN
  UPDATE public.underlying_holdings
     SET currency = 'EUR',
         fund_cost_native     = CASE WHEN fund_cost_usd     IS NULL THEN NULL ELSE fund_cost_usd     / v_old_rate END,
         fund_fmv_native      = CASE WHEN fund_fmv_usd      IS NULL THEN NULL ELSE fund_fmv_usd      / v_old_rate END,
         fund_proceeds_native = CASE WHEN fund_proceeds_usd IS NULL THEN NULL ELSE fund_proceeds_usd / v_old_rate END,
         twh_cost_native      = CASE WHEN twh_cost_usd      IS NULL THEN NULL ELSE twh_cost_usd      / v_old_rate END,
         twh_fmv_native       = CASE WHEN twh_fmv_usd       IS NULL THEN NULL ELSE twh_fmv_usd       / v_old_rate END,
         twh_proceeds_native  = CASE WHEN twh_proceeds_usd  IS NULL THEN NULL ELSE twh_proceeds_usd  / v_old_rate END
   WHERE fund_id = v_fund
     AND quarter_id = ANY(v_quarters)
     AND currency = 'USD';

  UPDATE public.fund_quarter_snapshots
     SET currency = 'EUR',
         fund_total_contributions_native = CASE WHEN fund_total_contributions_usd IS NULL THEN NULL ELSE fund_total_contributions_usd / v_old_rate END,
         fund_total_nav_native           = CASE WHEN fund_total_nav_usd           IS NULL THEN NULL ELSE fund_total_nav_usd           / v_old_rate END,
         fund_total_distributions_native = CASE WHEN fund_total_distributions_usd IS NULL THEN NULL ELSE fund_total_distributions_usd / v_old_rate END,
         twh_contributions_native        = CASE WHEN twh_contributions_usd        IS NULL THEN NULL ELSE twh_contributions_usd        / v_old_rate END,
         twh_distributions_native        = CASE WHEN twh_distributions_usd        IS NULL THEN NULL ELSE twh_distributions_usd        / v_old_rate END,
         twh_nav_native                  = CASE WHEN twh_nav_usd                  IS NULL THEN NULL ELSE twh_nav_usd                  / v_old_rate END
   WHERE fund_id = v_fund
     AND quarter_id = ANY(v_quarters)
     AND currency = 'USD';
END $$;