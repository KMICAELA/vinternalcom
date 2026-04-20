-- 1. Underlying holdings: replace (fund, company, quarter) with (fund, quarter, company, investment_date)
ALTER TABLE public.underlying_holdings
  DROP CONSTRAINT IF EXISTS underlying_holdings_fund_id_company_id_quarter_id_key;

ALTER TABLE public.underlying_holdings
  DROP CONSTRAINT IF EXISTS underlying_holdings_fund_quarter_company_date_key;

ALTER TABLE public.underlying_holdings
  ADD CONSTRAINT underlying_holdings_fund_quarter_company_date_key
  UNIQUE NULLS NOT DISTINCT (fund_id, quarter_id, company_id, investment_date);

-- 2. Directs: add uniqueness on (company, investment_date)
ALTER TABLE public.directs
  DROP CONSTRAINT IF EXISTS directs_company_investment_date_key;

ALTER TABLE public.directs
  ADD CONSTRAINT directs_company_investment_date_key
  UNIQUE NULLS NOT DISTINCT (company_id, investment_date);

-- 3. Backfill source_report_id for the 136 legacy 1Q25 underlying_holdings rows
DO $$
DECLARE
  v_legacy_doc_id UUID;
  v_quarter_1q25 UUID;
BEGIN
  SELECT id INTO v_quarter_1q25 FROM public.quarters WHERE label = '1Q25' LIMIT 1;

  IF v_quarter_1q25 IS NOT NULL THEN
    SELECT id INTO v_legacy_doc_id
    FROM public.source_documents
    WHERE storage_path = 'legacy_seed_1q25/underlying_holdings.seed'
    LIMIT 1;

    IF v_legacy_doc_id IS NULL THEN
      INSERT INTO public.source_documents (
        doc_type, original_filename, storage_path, status, quarter_id
      ) VALUES (
        'fund_report',
        'LEGACY_SEED_1Q25_underlying_holdings.seed',
        'legacy_seed_1q25/underlying_holdings.seed',
        'confirmed',
        v_quarter_1q25
      ) RETURNING id INTO v_legacy_doc_id;
    END IF;

    UPDATE public.underlying_holdings
    SET source_report_id = v_legacy_doc_id
    WHERE quarter_id = v_quarter_1q25
      AND source_report_id IS NULL;
  END IF;
END $$;