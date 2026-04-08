-- Add new columns to existing fund_extraction_templates table
ALTER TABLE public.fund_extraction_templates
  ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'quarterly_report',
  ADD COLUMN IF NOT EXISTS report_format text NOT NULL DEFAULT 'pdf',
  ADD COLUMN IF NOT EXISTS extraction_notes text,
  ADD COLUMN IF NOT EXISTS sample_document_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Drop the old one-to-one unique constraint on fund_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fund_extraction_templates_fund_id_key'
  ) THEN
    ALTER TABLE public.fund_extraction_templates DROP CONSTRAINT fund_extraction_templates_fund_id_key;
  END IF;
END $$;

-- Add a unique constraint per fund + document_type (one active template per type per fund)
ALTER TABLE public.fund_extraction_templates
  ADD CONSTRAINT fund_extraction_templates_fund_doc_type_key UNIQUE (fund_id, document_type);