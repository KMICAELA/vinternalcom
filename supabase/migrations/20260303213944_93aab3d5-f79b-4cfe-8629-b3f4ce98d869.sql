CREATE TABLE public.underlying_portfolio_holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter_date DATE NOT NULL,
  fund_id UUID REFERENCES public.funds(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  sector TEXT,
  region TEXT,
  twh_cost NUMERIC NOT NULL DEFAULT 0,
  twh_fmv NUMERIC NOT NULL DEFAULT 0,
  type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_uph_quarter ON public.underlying_portfolio_holdings(quarter_date);
CREATE INDEX idx_uph_fund ON public.underlying_portfolio_holdings(fund_id, quarter_date);

ALTER TABLE public.underlying_portfolio_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_uph" ON public.underlying_portfolio_holdings FOR ALL USING (true) WITH CHECK (true);