ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_storage_path_not_inline_chk;

CREATE OR REPLACE FUNCTION public.prevent_inline_report_storage_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.storage_path LIKE 'inline/%' THEN
    RAISE EXCEPTION
      USING MESSAGE = 'reports.storage_path cannot use inline/% paths',
            ERRCODE = '23514',
            CONSTRAINT = 'reports_storage_path_not_inline_chk';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.storage_path IS DISTINCT FROM NEW.storage_path
     AND NEW.storage_path LIKE 'inline/%' THEN
    RAISE EXCEPTION
      USING MESSAGE = 'reports.storage_path cannot use inline/% paths',
            ERRCODE = '23514',
            CONSTRAINT = 'reports_storage_path_not_inline_chk';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_storage_path_not_inline_trg ON public.reports;

CREATE TRIGGER reports_storage_path_not_inline_trg
BEFORE INSERT OR UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inline_report_storage_path();