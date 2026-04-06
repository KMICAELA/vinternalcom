
CREATE OR REPLACE FUNCTION public.validate_staged_extraction_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending_review', 'approved', 'rejected', 'needs_revision') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: pending_review, approved, rejected, needs_revision', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_reconciliation_severity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.severity NOT IN ('info', 'warning', 'error') THEN
    RAISE EXCEPTION 'Invalid severity: %. Must be one of: info, warning, error', NEW.severity;
  END IF;
  RETURN NEW;
END;
$$;
