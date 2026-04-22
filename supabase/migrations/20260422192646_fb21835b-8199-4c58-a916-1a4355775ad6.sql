TRUNCATE TABLE
  public.underlying_holdings,
  public.fund_quarter_snapshots,
  public.direct_quarter_snapshots,
  public.fund_commitments,
  public.cash_flows,
  public.twh_ledger_entries,
  public.computed_metrics,
  public.highlights,
  public.extraction_drafts,
  public.source_documents,
  public.directs,
  public.funds,
  public.companies
RESTART IDENTITY CASCADE;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'underlying_holdings',
        'funds',
        'directs',
        'fund_quarter_snapshots',
        'direct_quarter_snapshots',
        'fund_commitments',
        'cash_flows',
        'twh_ledger_entries',
        'computed_metrics',
        'highlights',
        'source_documents',
        'extraction_drafts',
        'companies'
      )
      AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', r.schema_name, r.table_name, r.constraint_name);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'underlying_holdings',
        'funds',
        'directs',
        'fund_quarter_snapshots',
        'direct_quarter_snapshots',
        'fund_commitments',
        'cash_flows',
        'twh_ledger_entries',
        'computed_metrics',
        'highlights',
        'source_documents',
        'extraction_drafts',
        'companies'
      )
      AND indexname NOT IN (
        'underlying_holdings_pkey',
        'funds_pkey',
        'directs_pkey',
        'fund_quarter_snapshots_pkey',
        'direct_quarter_snapshots_pkey',
        'fund_commitments_pkey',
        'cash_flows_pkey',
        'twh_ledger_entries_pkey',
        'computed_metrics_pkey',
        'highlights_pkey',
        'source_documents_pkey',
        'extraction_drafts_pkey',
        'companies_pkey'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schemaname, r.indexname);
  END LOOP;
END $$;

ALTER TABLE public.underlying_holdings
  ADD CONSTRAINT underlying_holdings_pk_uniq
  UNIQUE NULLS DISTINCT (fund_id, quarter_id, company_id, investment_date, tranche_seq);

ALTER TABLE public.fund_quarter_snapshots
  ADD CONSTRAINT fund_quarter_snapshots_uniq
  UNIQUE (fund_id, quarter_id);

ALTER TABLE public.direct_quarter_snapshots
  ADD CONSTRAINT direct_quarter_snapshots_uniq
  UNIQUE (direct_id, quarter_id);

ALTER TABLE public.funds
  ADD CONSTRAINT funds_name_uniq
  UNIQUE (name);

ALTER TABLE public.companies
  ADD CONSTRAINT companies_legal_name_uniq
  UNIQUE (legal_name);

ALTER TABLE public.directs
  ADD CONSTRAINT directs_uniq
  UNIQUE NULLS DISTINCT (company_id, investment_date);