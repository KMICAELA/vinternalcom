-- investors
CREATE TABLE public.investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  commitment_amount numeric,
  commitment_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_investors_name ON public.investors(name);

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY investors_admin_all ON public.investors
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_investors_updated_at
  BEFORE UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- investor_quarter_snapshots
CREATE TABLE public.investor_quarter_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  quarter_id uuid NOT NULL REFERENCES public.quarters(id) ON DELETE RESTRICT,
  contribution_amount numeric NOT NULL DEFAULT 0,
  contribution_date date,
  distribution_amount numeric NOT NULL DEFAULT 0,
  distribution_date date,
  nav_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investor_id, quarter_id)
);

CREATE INDEX idx_iqs_quarter ON public.investor_quarter_snapshots(quarter_id);
CREATE INDEX idx_iqs_investor ON public.investor_quarter_snapshots(investor_id);

ALTER TABLE public.investor_quarter_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY iqs_admin_all ON public.investor_quarter_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_iqs_updated_at
  BEFORE UPDATE ON public.investor_quarter_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();