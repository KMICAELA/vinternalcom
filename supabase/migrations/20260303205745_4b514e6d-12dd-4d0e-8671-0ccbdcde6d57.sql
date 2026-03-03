
-- Drop old tables
DROP TABLE IF EXISTS fund_metrics CASCADE;
DROP TABLE IF EXISTS fund_report_statuses CASCADE;
DROP TABLE IF EXISTS quarters CASCADE;

-- 1. Funds
CREATE TABLE funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_name text NOT NULL,
  vintage_year integer,
  strategy text,
  geography text,
  commitment_amount numeric NOT NULL DEFAULT 0,
  ownership_percentage numeric NOT NULL DEFAULT 0,
  management_fee_rate numeric NOT NULL DEFAULT 0.02,
  carry_percentage numeric NOT NULL DEFAULT 0.20,
  hurdle_rate numeric NOT NULL DEFAULT 0.08,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Fund Quarterly Reports
CREATE TABLE fund_quarterly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  quarter_date date NOT NULL,
  capital_called_to_date numeric NOT NULL DEFAULT 0,
  distributions_to_date numeric NOT NULL DEFAULT 0,
  reported_nav numeric NOT NULL DEFAULT 0,
  reported_gross_irr numeric,
  reported_gross_tvpi numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fund_id, quarter_date)
);

-- 3. Direct Investments
CREATE TABLE direct_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  instrument text,
  round text,
  strategy text,
  geography text,
  cost_basis numeric NOT NULL DEFAULT 0,
  ownership_percentage numeric,
  co_investors text,
  investment_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Direct Quarterly Valuations
CREATE TABLE direct_quarterly_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES direct_investments(id) ON DELETE CASCADE,
  quarter_date date NOT NULL,
  current_valuation numeric NOT NULL DEFAULT 0,
  realized_proceeds_this_quarter numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, quarter_date)
);

-- 5. Fund Level Cashflows (LP layer)
CREATE TABLE fund_level_cashflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashflow_date date NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  portfolio_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Portfolio Snapshots (LP NAV per quarter)
CREATE TABLE portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_date date NOT NULL UNIQUE,
  lp_nav numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_quarterly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_quarterly_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_level_cashflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_funds" ON funds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_fqr" ON fund_quarterly_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_di" ON direct_investments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_dqv" ON direct_quarterly_valuations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_flc" ON fund_level_cashflows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_ps" ON portfolio_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Seed Funds
INSERT INTO funds (id, fund_name, vintage_year, strategy, geography, commitment_amount, ownership_percentage) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Lowercarbon 421.0 Parallel Fund, LP', 2024, 'Climate', 'Global', 1000000, 0.0031),
  ('a0000001-0000-0000-0000-000000000002', 'Third Sphere Fund IV, LP', 2024, 'Climate/Impact', 'US', 2000000, 0.048),
  ('a0000001-0000-0000-0000-000000000003', 'Tamarack Global Opportunities II, LP', 2024, 'Multi-Sector', 'Global', 2000000, 0.0277),
  ('a0000001-0000-0000-0000-000000000004', 'Generational Partners Fund I, LP', 2024, 'Deep Tech', 'US', 1000000, 0.1738),
  ('a0000001-0000-0000-0000-000000000005', 'Leap Global Partners Fund II, LP', 2024, 'LatAm Tech', 'Latin America', 1000000, 0.0193),
  ('a0000001-0000-0000-0000-000000000006', 'SVLC Fund III, LP', 2025, 'LatAm Tech', 'Latin America', 1000000, 0.0667),
  ('a0000001-0000-0000-0000-000000000007', 'Cantos Ventures IV, LP', 2025, 'Deep Tech', 'US', 2000000, 0.0571),
  ('a0000001-0000-0000-0000-000000000008', 'Quantonation 2 Feeder, LLC', 2025, 'Quantum', 'Europe', 1066587.12, 0.0063),
  ('a0000001-0000-0000-0000-000000000009', 'Civilization Ventures Fund III, LP', 2026, 'Multi-Sector', 'US', 1000000, 0.0133),
  ('a0000001-0000-0000-0000-000000000010', 'ONEVC Fund III, LP', 2025, 'LatAm Tech', 'Latin America', 1000000, 0.0448);

-- Seed Direct Investments
INSERT INTO direct_investments (id, company_name, instrument, round, strategy, geography, cost_basis, co_investors, investment_date) VALUES
  ('b0000001-0000-0000-0000-000000000001', '101OBEX, CORP', 'SAFE', 'Seed', 'Deep Tech', 'US', 420000, 'Guardian Capital', '2024-05-20'),
  ('b0000001-0000-0000-0000-000000000002', 'Earth AI, Inc.', 'SAFE', 'Series B', 'Climate', 'US', 750000, 'Tamarack, Cantos', '2025-02-21'),
  ('b0000001-0000-0000-0000-000000000003', 'Generational Partners X VL SPV1', 'SPV', 'Seed', 'Deep Tech', 'US', 650000, 'Generational, Cantos, General Catalyst', '2025-05-01'),
  ('b0000001-0000-0000-0000-000000000004', 'BRK Health Solutions', 'SAFE', 'Series A', 'Healthcare', 'Latin America', 1000000, 'Dalus, FEMSA Ventures', '2025-07-30'),
  ('b0000001-0000-0000-0000-000000000005', 'Canto of Arcadia, LP', 'SPV', 'Series B', 'Deep Tech', 'US', 500000, 'Cantos, Interlagos', '2025-08-15'),
  ('b0000001-0000-0000-0000-000000000006', 'Ares Materials, Inc.', 'Pref. Equity', 'Series B', 'Deep Tech', 'US', 500000, 'Endurance28, Black Diamond', '2025-08-30'),
  ('b0000001-0000-0000-0000-000000000007', 'Earth AI, Inc. (Follow-on)', 'SAFE', 'Series B', 'Climate', 'US', 250000, 'Tamarack, Cantos', '2025-05-05'),
  ('b0000001-0000-0000-0000-000000000008', 'General Biological Corporation', 'Pref. Equity', 'Series A', 'Climate', 'US', 750000, 'Lowercarbon, CIV', '2025-12-31');

-- Q4 2024 Fund Reports
INSERT INTO fund_quarterly_reports (fund_id, quarter_date, capital_called_to_date, distributions_to_date, reported_nav) VALUES
  ('a0000001-0000-0000-0000-000000000001', '2024-12-31', 668900, 0, 807201.40),
  ('a0000001-0000-0000-0000-000000000002', '2024-12-31', 1000000, 0, 803726),
  ('a0000001-0000-0000-0000-000000000003', '2024-12-31', 1050000, 0, 1111529),
  ('a0000001-0000-0000-0000-000000000004', '2024-12-31', 400000, 0, 319479),
  ('a0000001-0000-0000-0000-000000000005', '2024-12-31', 400000, 0, 340027);

-- Q3 2025 Fund Reports
INSERT INTO fund_quarterly_reports (fund_id, quarter_date, capital_called_to_date, distributions_to_date, reported_nav) VALUES
  ('a0000001-0000-0000-0000-000000000001', '2025-09-30', 668900, 0, 852595),
  ('a0000001-0000-0000-0000-000000000002', '2025-09-30', 1000000, 0, 716638),
  ('a0000001-0000-0000-0000-000000000003', '2025-09-30', 1450000, 0, 4120927),
  ('a0000001-0000-0000-0000-000000000004', '2025-09-30', 500000, 0, 502074),
  ('a0000001-0000-0000-0000-000000000005', '2025-09-30', 460000, 0, 474322),
  ('a0000001-0000-0000-0000-000000000006', '2025-09-30', 740811, 0, 656682),
  ('a0000001-0000-0000-0000-000000000007', '2025-09-30', 700000, 0, 776942),
  ('a0000001-0000-0000-0000-000000000008', '2025-09-30', 517838.40, 0, 545740.22),
  ('a0000001-0000-0000-0000-000000000009', '2025-09-30', 0, 0, 0),
  ('a0000001-0000-0000-0000-000000000010', '2025-09-30', 80000, 0, 70422);

-- Q4 2024 Direct Valuations
INSERT INTO direct_quarterly_valuations (company_id, quarter_date, current_valuation, realized_proceeds_this_quarter) VALUES
  ('b0000001-0000-0000-0000-000000000001', '2024-12-31', 420000, 0);

-- Q3 2025 Direct Valuations
INSERT INTO direct_quarterly_valuations (company_id, quarter_date, current_valuation, realized_proceeds_this_quarter) VALUES
  ('b0000001-0000-0000-0000-000000000001', '2025-09-30', 420000, 0),
  ('b0000001-0000-0000-0000-000000000002', '2025-09-30', 750000, 0),
  ('b0000001-0000-0000-0000-000000000003', '2025-09-30', 650000, 0),
  ('b0000001-0000-0000-0000-000000000004', '2025-09-30', 1000000, 0),
  ('b0000001-0000-0000-0000-000000000005', '2025-09-30', 500000, 0),
  ('b0000001-0000-0000-0000-000000000006', '2025-09-30', 500000, 0),
  ('b0000001-0000-0000-0000-000000000007', '2025-09-30', 250000, 0),
  ('b0000001-0000-0000-0000-000000000008', '2025-09-30', 750000, 0);

-- LP Cashflows
INSERT INTO fund_level_cashflows (cashflow_date, type, amount, description, portfolio_name) VALUES
  ('2024-05-08', 'capital_call', 1868605.98, 'Capital Call #1', 'TWH Americas Fund I, LP'),
  ('2024-08-16', 'capital_call', 1728971.64, 'Capital Call #2', 'TWH Americas Fund I, LP'),
  ('2024-12-19', 'capital_call', 2050584.99, 'Capital Call #3', 'TWH Americas Fund I, LP'),
  ('2025-02-20', 'capital_call', 1000000, 'Capital Call #4', 'TWH Americas Fund I, LP'),
  ('2025-05-28', 'capital_call', 2710000, 'Capital Call #5', 'TWH Americas Fund I, LP'),
  ('2025-07-11', 'capital_call', 1400000, 'Capital Call #6', 'TWH Americas Fund I, LP'),
  ('2025-09-10', 'capital_call', 1350000, 'Capital Call #7', 'TWH Americas Fund I, LP');

-- Portfolio Snapshots
INSERT INTO portfolio_snapshots (quarter_date, lp_nav) VALUES
  ('2024-09-30', 3036100.75),
  ('2025-06-30', 10503968.64),
  ('2025-09-30', 12096611.35);
