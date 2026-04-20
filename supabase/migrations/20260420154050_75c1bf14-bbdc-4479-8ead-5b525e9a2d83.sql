
-- ============================================================
-- DROP EVERYTHING (destructive rebuild)
-- ============================================================
DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.direct_investments CASCADE;
DROP TABLE IF EXISTS public.direct_quarterly_valuations CASCADE;
DROP TABLE IF EXISTS public.fund_cashflows CASCADE;
DROP TABLE IF EXISTS public.fund_extraction_templates CASCADE;
DROP TABLE IF EXISTS public.fund_financial_statements CASCADE;
DROP TABLE IF EXISTS public.fund_level_cashflows CASCADE;
DROP TABLE IF EXISTS public.fund_quarterly_reports CASCADE;
DROP TABLE IF EXISTS public.fund_reporting_patterns CASCADE;
DROP TABLE IF EXISTS public.funds CASCADE;
DROP TABLE IF EXISTS public.fx_rates CASCADE;
DROP TABLE IF EXISTS public.highlight_entries CASCADE;
DROP TABLE IF EXISTS public.pcap_extractions CASCADE;
DROP TABLE IF EXISTS public.portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS public.quarterly_commentary CASCADE;
DROP TABLE IF EXISTS public.quarterly_history CASCADE;
DROP TABLE IF EXISTS public.quarterly_report_tracking CASCADE;
DROP TABLE IF EXISTS public.reconciliation_checks CASCADE;
DROP TABLE IF EXISTS public.staged_direct_imports CASCADE;
DROP TABLE IF EXISTS public.staged_fund_extractions CASCADE;
DROP TABLE IF EXISTS public.staged_internal_data CASCADE;
DROP TABLE IF EXISTS public.underlying_portfolio_holdings CASCADE;
DROP TABLE IF EXISTS public.underlying_portfolio_transactions CASCADE;

DROP FUNCTION IF EXISTS public.validate_reconciliation_severity() CASCADE;
DROP FUNCTION IF EXISTS public.validate_staged_internal_data() CASCADE;
DROP FUNCTION IF EXISTS public.validate_staged_extraction_status() CASCADE;
DROP FUNCTION IF EXISTS public.validate_staged_direct_status() CASCADE;
DROP FUNCTION IF EXISTS public.validate_pcap_status() CASCADE;
DROP FUNCTION IF EXISTS public.validate_qrt_status() CASCADE;

-- ============================================================
-- ROLES & AUTH
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- First user becomes admin; everyone else viewer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- CORE ENTITIES
-- ============================================================
CREATE TABLE public.quarters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  fiscal_year INT NOT NULL,
  fiscal_quarter INT NOT NULL CHECK (fiscal_quarter BETWEEN 1 AND 4),
  quarter_end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quarters_end_date ON public.quarters(quarter_end_date DESC);

CREATE TABLE public.funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  reporting_currency TEXT NOT NULL DEFAULT 'USD',
  start_date DATE,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fund_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  twh_commitment_usd NUMERIC NOT NULL DEFAULT 0,
  total_fund_commitment_usd NUMERIC NOT NULL DEFAULT 0,
  twh_ownership_pct NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_id)
);

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  commercial_name TEXT,
  url TEXT,
  status TEXT CHECK (status IN ('Active','Write-off','Exit','Partial Exit')),
  region TEXT[] DEFAULT '{}',
  type TEXT,
  theme TEXT[] DEFAULT '{}',
  industry TEXT[] DEFAULT '{}',
  sub_industry TEXT[] DEFAULT '{}',
  sdg TEXT[] DEFAULT '{}',
  stage TEXT,
  thesis_bucket TEXT,
  what_they_do TEXT,
  target_market TEXT,
  tailwinds TEXT,
  challenges TEXT,
  commentary_updated_at TIMESTAMPTZ,
  commentary_updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_legal_name ON public.companies(legal_name);

CREATE TABLE public.directs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  investment_date DATE,
  instrument TEXT CHECK (instrument IN ('SAFE','Note','Pref. Equity','Common Equity','SPV','Other')),
  round TEXT,
  twh_cost_usd NUMERIC NOT NULL DEFAULT 0,
  co_investors TEXT[] DEFAULT '{}',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- QUARTERLY FACTS
-- ============================================================
CREATE TABLE public.fund_quarter_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  twh_contributions_usd NUMERIC NOT NULL DEFAULT 0,
  twh_distributions_usd NUMERIC NOT NULL DEFAULT 0,
  twh_nav_usd NUMERIC NOT NULL DEFAULT 0,
  fund_total_contributions_usd NUMERIC NOT NULL DEFAULT 0,
  fund_total_nav_usd NUMERIC NOT NULL DEFAULT 0,
  source_report_id UUID,
  extracted_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_id, quarter_id)
);

CREATE TABLE public.underlying_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  investment_date DATE,
  instrument TEXT,
  round TEXT,
  fund_cost_usd NUMERIC NOT NULL DEFAULT 0,
  fund_fmv_usd NUMERIC NOT NULL DEFAULT 0,
  fund_proceeds_usd NUMERIC NOT NULL DEFAULT 0,
  source_report_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_id, company_id, quarter_id)
);
CREATE INDEX idx_uh_quarter ON public.underlying_holdings(quarter_id);
CREATE INDEX idx_uh_fund ON public.underlying_holdings(fund_id);

CREATE TABLE public.direct_quarter_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_id UUID NOT NULL REFERENCES public.directs(id) ON DELETE CASCADE,
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  twh_fmv_usd NUMERIC NOT NULL DEFAULT 0,
  twh_proceeds_usd NUMERIC NOT NULL DEFAULT 0,
  source_report_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direct_id, quarter_id)
);

-- ============================================================
-- CASH FLOWS
-- ============================================================
CREATE TABLE public.cash_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('twh_net','twh_gross','fund','direct','twh_consolidated')),
  fund_id UUID REFERENCES public.funds(id) ON DELETE CASCADE,
  direct_id UUID REFERENCES public.directs(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('contribution','distribution','investment','mgmt_fee','other','nav_marker','fmv_marker')),
  amount_usd NUMERIC NOT NULL,
  note TEXT,
  source_document_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cf_scope_date ON public.cash_flows(scope, date);
CREATE INDEX idx_cf_fund ON public.cash_flows(fund_id);
CREATE INDEX idx_cf_direct ON public.cash_flows(direct_id);

-- ============================================================
-- TWH CONSOLIDATED LEDGER
-- ============================================================
CREATE TABLE public.twh_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('lp_contribution','investment','mgmt_fee','expense','distribution','other')),
  counterparty TEXT,
  amount_usd NUMERIC NOT NULL,
  description TEXT,
  source_document_id UUID,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_twh_ledger_date ON public.twh_ledger_entries(date);

-- ============================================================
-- INGESTION
-- ============================================================
CREATE TABLE public.source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('fund_report','pcap','twh_financial','twh_bank_stmt','twh_disbursement','cap_table','direct_doc')),
  fund_id UUID REFERENCES public.funds(id) ON DELETE SET NULL,
  direct_id UUID REFERENCES public.directs(id) ON DELETE SET NULL,
  quarter_id UUID REFERENCES public.quarters(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','extracting','pending_review','confirmed','rejected'))
);

CREATE TABLE public.extraction_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES public.source_documents(id) ON DELETE CASCADE,
  raw_model_output JSONB,
  normalized_payload JSONB,
  confidence_notes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- HIGHLIGHTS
-- ============================================================
CREATE TABLE public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('new_investment','exit','top_mover','fund_metric_change')),
  body_md TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  draft BOOLEAN NOT NULL DEFAULT true,
  last_edited_by UUID REFERENCES auth.users(id),
  last_edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_highlights_quarter ON public.highlights(quarter_id, category, position);

-- ============================================================
-- SETTINGS / TAXONOMY / AUDIT
-- ============================================================
CREATE TABLE public.taxonomy_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('region','theme','industry','sub_industry','sdg','instrument','round','status','other_investor')),
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

CREATE TABLE public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  currency TEXT NOT NULL,
  usd_per_unit NUMERIC NOT NULL,
  source TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

-- ============================================================
-- SHARING
-- ============================================================
CREATE TABLE public.quarter_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_share_token ON public.quarter_share_tokens(token);

-- ============================================================
-- COMPUTED METRICS CACHE
-- ============================================================
CREATE TABLE public.computed_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  fund_id UUID REFERENCES public.funds(id) ON DELETE CASCADE,
  direct_id UUID REFERENCES public.directs(id) ON DELETE CASCADE,
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  net_irr NUMERIC,
  gross_irr NUMERIC,
  net_tvpi NUMERIC,
  gross_moic NUMERIC,
  dpi NUMERIC,
  rvpi NUMERIC,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, fund_id, direct_id, quarter_id)
);

-- ============================================================
-- updated_at triggers on all tables that have updated_at
-- ============================================================
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_quarters_updated BEFORE UPDATE ON public.quarters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_funds_updated BEFORE UPDATE ON public.funds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_fund_commitments_updated BEFORE UPDATE ON public.fund_commitments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_directs_updated BEFORE UPDATE ON public.directs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_fqs_updated BEFORE UPDATE ON public.fund_quarter_snapshots FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_uh_updated BEFORE UPDATE ON public.underlying_holdings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dqs_updated BEFORE UPDATE ON public.direct_quarter_snapshots FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS — enable on every table
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_quarter_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.underlying_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_quarter_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twh_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarter_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.computed_metrics ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- profiles: user can read own profile + admins can read all
-- ============================================================
CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_roles: user reads own; only admin writes
CREATE POLICY ur_select_self ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ur_select_admin ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY ur_admin_write ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Generic read-by-authenticated, write-by-admin policies for data tables
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'quarters','funds','fund_commitments','companies','directs',
      'fund_quarter_snapshots','underlying_holdings','direct_quarter_snapshots',
      'cash_flows','twh_ledger_entries','source_documents','extraction_drafts',
      'highlights','taxonomy_items','fx_rates','audit_log',
      'quarter_share_tokens','computed_metrics'
    ])
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t || '_admin_write', t);
  END LOOP;
END $$;

-- Public anonymous read of valid share tokens (for /share/{token})
CREATE POLICY share_tokens_anon_read ON public.quarter_share_tokens
  FOR SELECT TO anon
  USING (revoked = false AND (expires_at IS NULL OR expires_at > now()));

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY documents_admin_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'documents' AND public.is_admin(auth.uid()));

CREATE POLICY documents_authenticated_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
