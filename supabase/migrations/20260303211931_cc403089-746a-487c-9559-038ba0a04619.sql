
-- Q1 2025 Fund Quarterly Reports
INSERT INTO public.fund_quarterly_reports (fund_id, quarter_date, capital_called_to_date, distributions_to_date, reported_nav) VALUES
('a0000001-0000-0000-0000-000000000001', '2025-03-31', 668900, 0, 807201.40),
('a0000001-0000-0000-0000-000000000002', '2025-03-31', 1000000, 0, 803726),
('a0000001-0000-0000-0000-000000000003', '2025-03-31', 1050000, 0, 1111529),
('a0000001-0000-0000-0000-000000000004', '2025-03-31', 400000, 0, 319479),
('a0000001-0000-0000-0000-000000000005', '2025-03-31', 400000, 0, 340027);

-- Q1 2025 Direct Quarterly Valuations
INSERT INTO public.direct_quarterly_valuations (company_id, quarter_date, current_valuation, realized_proceeds_this_quarter) VALUES
('b0000001-0000-0000-0000-000000000001', '2025-03-31', 420000, 0),
('b0000001-0000-0000-0000-000000000002', '2025-03-31', 750000, 0);

-- Q1 2025 Portfolio Snapshot
INSERT INTO public.portfolio_snapshots (quarter_date, lp_nav)
VALUES ('2025-03-31', 3036100.75)
ON CONFLICT (quarter_date) DO UPDATE SET lp_nav = EXCLUDED.lp_nav;

-- Q2 2025 Fund Quarterly Reports
INSERT INTO public.fund_quarterly_reports (fund_id, quarter_date, capital_called_to_date, distributions_to_date, reported_nav) VALUES
('a0000001-0000-0000-0000-000000000001', '2025-06-30', 668900, 0, 912969.05),
('a0000001-0000-0000-0000-000000000002', '2025-06-30', 1000000, 0, 784749),
('a0000001-0000-0000-0000-000000000003', '2025-06-30', 1450000, 0, 4111442),
('a0000001-0000-0000-0000-000000000004', '2025-06-30', 500000, 0, 492660),
('a0000001-0000-0000-0000-000000000005', '2025-06-30', 400000, 0, 340027),
('a0000001-0000-0000-0000-000000000006', '2025-06-30', 680000, 0, 603590),
('a0000001-0000-0000-0000-000000000007', '2025-06-30', 700000, 0, 840799),
('a0000001-0000-0000-0000-000000000008', '2025-06-30', 517838.40, 0, 539716.48);

-- Q2 2025 Direct Quarterly Valuations
INSERT INTO public.direct_quarterly_valuations (company_id, quarter_date, current_valuation, realized_proceeds_this_quarter) VALUES
('b0000001-0000-0000-0000-000000000001', '2025-06-30', 420000, 0),
('b0000001-0000-0000-0000-000000000002', '2025-06-30', 750000, 0),
('b0000001-0000-0000-0000-000000000007', '2025-06-30', 250000, 0),
('b0000001-0000-0000-0000-000000000003', '2025-06-30', 650000, 0);

-- Q2 2025 Portfolio Snapshot
INSERT INTO public.portfolio_snapshots (quarter_date, lp_nav)
VALUES ('2025-06-30', 10503968.64)
ON CONFLICT (quarter_date) DO UPDATE SET lp_nav = EXCLUDED.lp_nav;
