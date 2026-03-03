CREATE TABLE public.fund_cashflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  cashflow_date DATE NOT NULL,
  capital_deployed NUMERIC NOT NULL DEFAULT 0,
  distribution_received NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient queries by fund and date
CREATE INDEX idx_fund_cashflows_fund_date ON public.fund_cashflows(fund_id, cashflow_date);

-- Unique constraint to prevent duplicate entries
ALTER TABLE public.fund_cashflows ADD CONSTRAINT uq_fund_cashflow_date UNIQUE (fund_id, cashflow_date);

-- Enable RLS
ALTER TABLE public.fund_cashflows ENABLE ROW LEVEL SECURITY;

-- Public access policy (same pattern as other tables)
CREATE POLICY "public_fc" ON public.fund_cashflows FOR ALL USING (true) WITH CHECK (true);