
-- Table to track individual report status per fund per quarter
CREATE TABLE public.quarterly_report_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  quarter_date date NOT NULL,
  report_type text NOT NULL DEFAULT 'quarterly_report',
  status text NOT NULL DEFAULT 'not_received',
  received_at timestamp with time zone,
  received_via text,
  document_path text,
  expected_by date,
  days_since_quarter_end integer,
  processing_started_at timestamp with time zone,
  processing_completed_at timestamp with time zone,
  reviewed_by text,
  approved_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(fund_id, quarter_date, report_type)
);

ALTER TABLE public.quarterly_report_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_qrt" ON public.quarterly_report_tracking FOR ALL TO public USING (true) WITH CHECK (true);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_qrt_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('not_received', 'received', 'processing', 'extracted', 'review', 'approved', 'na') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: not_received, received, processing, extracted, review, approved, na', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_qrt_status_trigger
BEFORE INSERT OR UPDATE ON public.quarterly_report_tracking
FOR EACH ROW EXECUTE FUNCTION public.validate_qrt_status();

-- Table to store historical reporting patterns per fund
CREATE TABLE public.fund_reporting_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'quarterly_report',
  avg_days_to_report integer DEFAULT 45,
  last_received_days integer,
  typical_format text DEFAULT 'pdf',
  typical_sender_email text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(fund_id, report_type)
);

ALTER TABLE public.fund_reporting_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_frp" ON public.fund_reporting_patterns FOR ALL TO public USING (true) WITH CHECK (true);
