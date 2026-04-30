-- Enum for extraction status
DO $$ BEGIN
  CREATE TYPE public.report_extraction_status AS ENUM ('pending', 'success', 'error', 'needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  quarter_id uuid REFERENCES public.quarters(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  extraction_status public.report_extraction_status NOT NULL DEFAULT 'pending',
  extraction_summary jsonb,
  extracted_payload jsonb,
  committed_to_db boolean NOT NULL DEFAULT false,
  committed_at timestamptz,
  committed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_fund_quarter ON public.reports(fund_id, quarter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(extraction_status) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_reports_uploaded_at ON public.reports(uploaded_at DESC);

-- Updated-at trigger
DROP TRIGGER IF EXISTS reports_touch_updated_at ON public.reports;
CREATE TRIGGER reports_touch_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_read ON public.reports;
CREATE POLICY reports_read ON public.reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reports_admin_write ON public.reports;
CREATE POLICY reports_admin_write ON public.reports FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Provenance FKs on snapshot tables
ALTER TABLE public.underlying_holdings
  DROP CONSTRAINT IF EXISTS underlying_holdings_source_report_fk;
ALTER TABLE public.underlying_holdings
  ADD CONSTRAINT underlying_holdings_source_report_fk
  FOREIGN KEY (source_report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

ALTER TABLE public.fund_quarter_snapshots
  DROP CONSTRAINT IF EXISTS fund_quarter_snapshots_source_report_fk;
ALTER TABLE public.fund_quarter_snapshots
  ADD CONSTRAINT fund_quarter_snapshots_source_report_fk
  FOREIGN KEY (source_report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

ALTER TABLE public.direct_quarter_snapshots
  DROP CONSTRAINT IF EXISTS direct_quarter_snapshots_source_report_fk;
ALTER TABLE public.direct_quarter_snapshots
  ADD CONSTRAINT direct_quarter_snapshots_source_report_fk
  FOREIGN KEY (source_report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_uh_source_report ON public.underlying_holdings(source_report_id);
CREATE INDEX IF NOT EXISTS idx_fqs_source_report ON public.fund_quarter_snapshots(source_report_id);
CREATE INDEX IF NOT EXISTS idx_dqs_source_report ON public.direct_quarter_snapshots(source_report_id);