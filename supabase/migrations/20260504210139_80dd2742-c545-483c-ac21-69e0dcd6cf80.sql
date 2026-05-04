UPDATE public.fund_quarter_snapshots
SET confirmed_at = now()
WHERE source_report_id IS NOT NULL AND confirmed_at IS NULL;