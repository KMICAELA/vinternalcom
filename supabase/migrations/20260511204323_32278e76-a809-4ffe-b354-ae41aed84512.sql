-- Drop existing CHECK constraint on resolution_reason
ALTER TABLE public.report_diffs
  DROP CONSTRAINT IF EXISTS report_diffs_resolution_reason_chk;

-- Recreate with 7 values: original 5 + renamed + merged
ALTER TABLE public.report_diffs
  ADD CONSTRAINT report_diffs_resolution_reason_chk CHECK (
    resolution_reason IS NULL
    OR (
      change_type = 'missing'
      AND resolution_reason IN ('exit','divest','extraction_error','gp_omission','keep','renamed','merged')
    )
  );

-- Verify: list the constraint definition
-- (This runs in the migration but won't affect data; no backfill needed since existing rows still satisfy the wider constraint)

COMMENT ON CONSTRAINT report_diffs_resolution_reason_chk ON public.report_diffs
  IS 'Valid reasons for missing-holding resolution: exit, divest, extraction_error, gp_omission, keep, renamed, merged';