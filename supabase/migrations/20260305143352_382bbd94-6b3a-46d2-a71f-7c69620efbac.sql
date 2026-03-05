
-- Add missing columns to underlying_portfolio_holdings for Inventory view
ALTER TABLE public.underlying_portfolio_holdings
  ADD COLUMN IF NOT EXISTS twh_proceeds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS investment_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fmv numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proceeds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

-- Create transaction-level table for Underl Port view
CREATE TABLE public.underlying_portfolio_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter_date date NOT NULL,
  company_name text NOT NULL,
  fund_name text NOT NULL,
  status text DEFAULT 'Active',
  transaction_date date,
  instrument text,
  round text,
  investment_cost numeric NOT NULL DEFAULT 0,
  fmv numeric NOT NULL DEFAULT 0,
  proceeds numeric NOT NULL DEFAULT 0,
  twh_pct numeric NOT NULL DEFAULT 0,
  twh_cost numeric NOT NULL DEFAULT 0,
  twh_fmv numeric NOT NULL DEFAULT 0,
  twh_proceeds numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.underlying_portfolio_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_upt" ON public.underlying_portfolio_transactions FOR ALL USING (true) WITH CHECK (true);
