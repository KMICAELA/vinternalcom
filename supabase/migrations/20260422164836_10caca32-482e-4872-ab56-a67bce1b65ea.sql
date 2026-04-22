ALTER TABLE public.underlying_holdings
ADD COLUMN IF NOT EXISTS tranche_seq integer NOT NULL DEFAULT 1;

ALTER TABLE public.underlying_holdings
DROP CONSTRAINT IF EXISTS underlying_holdings_fund_quarter_company_date_key;

ALTER TABLE public.underlying_holdings
DROP CONSTRAINT IF EXISTS underlying_holdings_unique_tranche;

ALTER TABLE public.underlying_holdings
ADD CONSTRAINT underlying_holdings_unique_tranche
UNIQUE (fund_id, quarter_id, company_id, investment_date, tranche_seq);