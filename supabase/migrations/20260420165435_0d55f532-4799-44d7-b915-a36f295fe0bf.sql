ALTER TABLE public.extraction_drafts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS fund_id uuid,
  ADD COLUMN IF NOT EXISTS quarter_id uuid,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_extraction_drafts_status ON public.extraction_drafts (status);
CREATE INDEX IF NOT EXISTS idx_extraction_drafts_fund_quarter ON public.extraction_drafts (fund_id, quarter_id);

DROP TRIGGER IF EXISTS trg_extraction_drafts_touch ON public.extraction_drafts;
CREATE TRIGGER trg_extraction_drafts_touch
BEFORE UPDATE ON public.extraction_drafts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();