
-- Create staged_internal_data table
CREATE TABLE IF NOT EXISTS public.staged_internal_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type TEXT NOT NULL,
  quarter_date DATE NOT NULL,
  cashflow_type TEXT,
  cashflow_amount NUMERIC,
  cashflow_description TEXT,
  lp_nav NUMERIC,
  nav_notes TEXT,
  entity_name TEXT,
  update_type TEXT,
  body TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  submitted_by TEXT,
  reviewer_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staged_internal_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_sid" ON public.staged_internal_data FOR ALL TO public USING (true) WITH CHECK (true);

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_staged_internal_data()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.data_type NOT IN ('lp_cashflow', 'nav_adjustment', 'commentary', 'highlight') THEN
    RAISE EXCEPTION 'Invalid data_type: %', NEW.data_type;
  END IF;
  IF NEW.status NOT IN ('pending_review', 'approved', 'rejected', 'needs_revision') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_staged_internal_data_trigger
BEFORE INSERT OR UPDATE ON public.staged_internal_data
FOR EACH ROW EXECUTE FUNCTION public.validate_staged_internal_data();

-- Create quarterly_commentary table
CREATE TABLE IF NOT EXISTS public.quarterly_commentary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_date DATE NOT NULL,
  section TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.quarterly_commentary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_qc" ON public.quarterly_commentary FOR ALL TO public USING (true) WITH CHECK (true);
