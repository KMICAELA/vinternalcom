
-- Add start_date and currency to funds
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

-- Add cashflow_type to fund_cashflows for typed capital activity
ALTER TABLE public.fund_cashflows ADD COLUMN IF NOT EXISTS cashflow_type text NOT NULL DEFAULT 'Capital Call — Investment';

-- Store extracted financial statement data per fund per quarter
CREATE TABLE IF NOT EXISTS public.fund_financial_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  quarter_date date NOT NULL,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed boolean NOT NULL DEFAULT false,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fund_id, quarter_date)
);

ALTER TABLE public.fund_financial_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_ffs" ON public.fund_financial_statements FOR ALL USING (true) WITH CHECK (true);

-- Quarterly history for TWH Consolidated
CREATE TABLE IF NOT EXISTS public.quarterly_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter text NOT NULL,
  quarter_date date NOT NULL UNIQUE,
  contribution numeric NOT NULL DEFAULT 0,
  distribution numeric NOT NULL DEFAULT 0,
  nav numeric NOT NULL DEFAULT 0,
  net_tvpi numeric NOT NULL DEFAULT 0,
  net_irr numeric NOT NULL DEFAULT 0,
  gross_tvpi numeric NOT NULL DEFAULT 0,
  gross_irr numeric NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quarterly_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_qh" ON public.quarterly_history FOR ALL USING (true) WITH CHECK (true);

-- Settings table for active quarter
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_as" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
