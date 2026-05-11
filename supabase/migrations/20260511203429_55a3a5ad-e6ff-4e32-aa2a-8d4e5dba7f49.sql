-- Enums
CREATE TYPE public.diff_change_type AS ENUM ('update','add','missing','fund_level');
CREATE TYPE public.diff_status AS ENUM ('pending','approved','rejected','edited');
CREATE TYPE public.report_diff_status AS ENUM ('extracting','pending_review','approved','rejected');

-- Add diff_status to reports
ALTER TABLE public.reports
  ADD COLUMN diff_status public.report_diff_status NULL;

-- Main staging table
CREATE TABLE public.report_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  change_type public.diff_change_type NOT NULL,
  holding_id uuid NULL REFERENCES public.underlying_holdings(id) ON DELETE SET NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  proposed_company_name text NULL,
  field_name text NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  requires_confirmation boolean NOT NULL DEFAULT false,
  status public.diff_status NOT NULL DEFAULT 'pending',
  resolution_reason text NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- resolution_reason only valid for 'missing' rows, and constrained to known values
  CONSTRAINT report_diffs_resolution_reason_chk CHECK (
    resolution_reason IS NULL
    OR (
      change_type = 'missing'
      AND resolution_reason IN ('exit','divest','extraction_error','gp_omission','keep')
    )
  )
);

CREATE INDEX report_diffs_report_id_idx ON public.report_diffs(report_id);
CREATE INDEX report_diffs_status_idx ON public.report_diffs(status);
CREATE INDEX report_diffs_holding_id_idx ON public.report_diffs(holding_id);

-- RLS — match project pattern
ALTER TABLE public.report_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_diffs_read
  ON public.report_diffs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY report_diffs_admin_write
  ON public.report_diffs FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));