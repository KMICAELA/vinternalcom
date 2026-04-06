
CREATE TABLE public.staged_direct_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_file_name TEXT,
  company_name TEXT NOT NULL,
  cost_basis NUMERIC,
  instrument TEXT,
  round TEXT,
  investment_date DATE,
  ownership_percentage NUMERIC,
  co_investors TEXT,
  strategy TEXT,
  geography TEXT,
  current_valuation NUMERIC,
  quarter_date DATE,
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewer_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  raw_extraction JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validate_staged_direct_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type NOT IN ('spreadsheet', 'deal_doc', 'manual') THEN
    RAISE EXCEPTION 'Invalid source_type: %', NEW.source_type;
  END IF;
  IF NEW.status NOT IN ('pending_review', 'approved', 'rejected', 'needs_revision') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_staged_direct
  BEFORE INSERT OR UPDATE ON public.staged_direct_imports
  FOR EACH ROW EXECUTE FUNCTION public.validate_staged_direct_status();

ALTER TABLE public.staged_direct_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_sdi" ON public.staged_direct_imports FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX idx_staged_direct_imports_status ON public.staged_direct_imports(status);
