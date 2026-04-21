
-- Add TWH attribution columns to underlying_holdings (per-tranche granularity)
ALTER TABLE public.underlying_holdings
  ADD COLUMN IF NOT EXISTS twh_cost_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS twh_fmv_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS twh_proceeds_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS twh_ownership_pct numeric;

-- Composite unique index for per-tranche rows.
-- COALESCE the date so NULL dates can still be unique per (fund, quarter, company).
CREATE UNIQUE INDEX IF NOT EXISTS underlying_holdings_tranche_uniq
  ON public.underlying_holdings (
    fund_id,
    quarter_id,
    company_id,
    COALESCE(investment_date, DATE '1900-01-01'),
    COALESCE(round, ''),
    COALESCE(instrument, '')
  );

-- Composite unique index on directs so multi-tranche company directs can coexist
-- (same company, different investment dates / rounds).
CREATE UNIQUE INDEX IF NOT EXISTS directs_tranche_uniq
  ON public.directs (
    company_id,
    COALESCE(investment_date, DATE '1900-01-01'),
    COALESCE(round, ''),
    COALESCE(instrument, '')
  );

-- direct_quarter_snapshots already keys by direct_id+quarter_id; ensure uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS dqs_direct_quarter_uniq
  ON public.direct_quarter_snapshots (direct_id, quarter_id);

-- Backfill source_report_id traceability tag: cannot store text in uuid column.
-- Instead, log a single audit_log entry indicating the legacy seed origin
-- of the existing 1Q25 underlying rows that have source_report_id IS NULL.
INSERT INTO public.audit_log (entity, entity_id, action, after)
SELECT
  'underlying_holdings',
  uh.id,
  'legacy_seed_tag',
  jsonb_build_object(
    'origin', 'legacy_seed_1q25',
    'note', 'Backfill traceability tag — original seed import predates source_documents.'
  )
FROM public.underlying_holdings uh
JOIN public.quarters q ON q.id = uh.quarter_id
WHERE uh.source_report_id IS NULL
  AND q.label = '1Q25'
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_log al
    WHERE al.entity = 'underlying_holdings'
      AND al.entity_id = uh.id
      AND al.action = 'legacy_seed_tag'
  );
