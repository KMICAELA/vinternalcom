
-- Part A: Add new columns to quarterly_history
ALTER TABLE public.quarterly_history
  ADD COLUMN IF NOT EXISTS total_commitment numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_called numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_distributed numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_nav numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unfunded numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dpi numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rvpi numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pic numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS computation_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confirmed_by text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Part A: Create audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID,
  quarter_date DATE,
  performed_by TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_al" ON public.audit_log FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_quarter_date ON public.audit_log (quarter_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log (target_table, target_id);

-- Part A: Add foreign key constraints (only if they don't already exist)
-- fund_financial_statements.fund_id → funds.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fund_financial_statements_fund_id_fkey') THEN
    ALTER TABLE public.fund_financial_statements
      ADD CONSTRAINT fund_financial_statements_fund_id_fkey
      FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;
  END IF;
END $$;

-- fund_cashflows.fund_id → funds.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fund_cashflows_fund_id_fkey') THEN
    ALTER TABLE public.fund_cashflows
      ADD CONSTRAINT fund_cashflows_fund_id_fkey
      FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;
  END IF;
END $$;

-- fund_quarterly_reports.fund_id → funds.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fund_quarterly_reports_fund_id_fkey') THEN
    ALTER TABLE public.fund_quarterly_reports
      ADD CONSTRAINT fund_quarterly_reports_fund_id_fkey
      FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE CASCADE;
  END IF;
END $$;

-- direct_quarterly_valuations.company_id → direct_investments.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'direct_quarterly_valuations_company_id_fkey') THEN
    ALTER TABLE public.direct_quarterly_valuations
      ADD CONSTRAINT direct_quarterly_valuations_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.direct_investments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- underlying_portfolio_holdings.fund_id → funds.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'underlying_portfolio_holdings_fund_id_fkey') THEN
    ALTER TABLE public.underlying_portfolio_holdings
      ADD CONSTRAINT underlying_portfolio_holdings_fund_id_fkey
      FOREIGN KEY (fund_id) REFERENCES public.funds(id) ON DELETE SET NULL;
  END IF;
END $$;
