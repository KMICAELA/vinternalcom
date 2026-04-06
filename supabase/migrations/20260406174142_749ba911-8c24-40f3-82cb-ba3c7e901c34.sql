
-- Table: staged_fund_extractions
CREATE TABLE public.staged_fund_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  quarter_date DATE NOT NULL,
  source_file_path TEXT,
  source_file_name TEXT,
  extracted_nav NUMERIC,
  extracted_capital_called NUMERIC,
  extracted_distributions NUMERIC,
  extracted_gross_irr NUMERIC,
  extracted_gross_tvpi NUMERIC,
  extracted_net_irr NUMERIC,
  extracted_net_tvpi NUMERIC,
  extracted_dpi NUMERIC,
  extracted_rvpi NUMERIC,
  extracted_pic NUMERIC,
  extracted_commitment NUMERIC,
  extracted_unfunded NUMERIC,
  extracted_companies JSONB DEFAULT '[]'::jsonb,
  raw_extraction JSONB,
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewer_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  extraction_model TEXT DEFAULT 'gemini-2.5-pro',
  confidence_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_staged_extraction_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('pending_review', 'approved', 'rejected', 'needs_revision') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: pending_review, approved, rejected, needs_revision', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_staged_extraction_status
  BEFORE INSERT OR UPDATE ON public.staged_fund_extractions
  FOR EACH ROW EXECUTE FUNCTION public.validate_staged_extraction_status();

ALTER TABLE public.staged_fund_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_sfe" ON public.staged_fund_extractions FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX idx_staged_fund_extractions_status ON public.staged_fund_extractions(status);
CREATE INDEX idx_staged_fund_extractions_quarter ON public.staged_fund_extractions(quarter_date);

-- Table: fund_extraction_templates
CREATE TABLE public.fund_extraction_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  template_name TEXT,
  field_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_extraction JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fund_id)
);

ALTER TABLE public.fund_extraction_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_fet" ON public.fund_extraction_templates FOR ALL TO public USING (true) WITH CHECK (true);

-- Table: reconciliation_checks
CREATE TABLE public.reconciliation_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_date DATE NOT NULL,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_name TEXT,
  expected_value NUMERIC,
  actual_value NUMERIC,
  variance_pct NUMERIC,
  description TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Validation trigger for severity
CREATE OR REPLACE FUNCTION public.validate_reconciliation_severity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity NOT IN ('info', 'warning', 'error') THEN
    RAISE EXCEPTION 'Invalid severity: %. Must be one of: info, warning, error', NEW.severity;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_reconciliation_severity
  BEFORE INSERT OR UPDATE ON public.reconciliation_checks
  FOR EACH ROW EXECUTE FUNCTION public.validate_reconciliation_severity();

ALTER TABLE public.reconciliation_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_rc" ON public.reconciliation_checks FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX idx_reconciliation_checks_quarter ON public.reconciliation_checks(quarter_date);
CREATE INDEX idx_reconciliation_checks_unresolved ON public.reconciliation_checks(resolved) WHERE resolved = FALSE;
