CREATE TABLE public.pcap_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  quarter_date date NOT NULL,
  document_path text,
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, quarter_date)
);

ALTER TABLE public.pcap_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_pcap" ON public.pcap_extractions FOR ALL TO public USING (true) WITH CHECK (true);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_pcap_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.extraction_status NOT IN ('pending', 'extracted', 'reviewed', 'approved', 'error') THEN
    RAISE EXCEPTION 'Invalid extraction_status: %. Must be one of: pending, extracted, reviewed, approved, error', NEW.extraction_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_pcap_extraction_status
BEFORE INSERT OR UPDATE ON public.pcap_extractions
FOR EACH ROW EXECUTE FUNCTION public.validate_pcap_status();