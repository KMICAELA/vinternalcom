-- Add Fund Ownership % captured from Schedule of Investments tables
ALTER TABLE public.underlying_holdings
  ADD COLUMN IF NOT EXISTS fund_ownership_pct numeric,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

-- Validate ownership pct stays within plausible bounds
ALTER TABLE public.underlying_holdings
  DROP CONSTRAINT IF EXISTS underlying_holdings_fund_ownership_pct_chk;
ALTER TABLE public.underlying_holdings
  ADD CONSTRAINT underlying_holdings_fund_ownership_pct_chk
  CHECK (fund_ownership_pct IS NULL OR (fund_ownership_pct >= 0 AND fund_ownership_pct <= 100));

-- Prevent regression: every uploaded report must point to a real bucket file,
-- never an inline placeholder. Existing inline rows are grandfathered (NOT VALID).
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_storage_path_not_inline_chk;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_storage_path_not_inline_chk
  CHECK (storage_path NOT LIKE 'inline/%') NOT VALID;