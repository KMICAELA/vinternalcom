-- PR #3a: Soft-delete columns on underlying_holdings.
-- Hard-delete loses cost basis + ability to undo a misclassified exit/divest.
-- Soft-delete preserves the row + records who removed it, when, and why.
ALTER TABLE public.underlying_holdings
  ADD COLUMN removed_at timestamptz NULL,
  ADD COLUMN removed_reason text NULL,
  ADD COLUMN removed_by uuid NULL;

-- Reason must be one of the resolution_reason values that imply removal.
-- (keep/renamed/merged do NOT remove the row, so they're not allowed here.)
ALTER TABLE public.underlying_holdings
  ADD CONSTRAINT underlying_holdings_removed_reason_check
  CHECK (
    removed_reason IS NULL
    OR removed_reason IN ('exit', 'divest', 'extraction_error', 'gp_omission')
  );

-- Both removed_at and removed_reason must be set together (or both null).
ALTER TABLE public.underlying_holdings
  ADD CONSTRAINT underlying_holdings_removed_consistency_check
  CHECK (
    (removed_at IS NULL AND removed_reason IS NULL)
    OR (removed_at IS NOT NULL AND removed_reason IS NOT NULL)
  );

-- Partial index so the common "live rows only" query stays fast.
CREATE INDEX IF NOT EXISTS underlying_holdings_live_idx
  ON public.underlying_holdings (fund_id, quarter_id)
  WHERE removed_at IS NULL;