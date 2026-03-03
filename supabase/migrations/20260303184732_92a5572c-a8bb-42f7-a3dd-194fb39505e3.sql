
CREATE TABLE public.fund_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id uuid NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  contribution numeric NOT NULL DEFAULT 0,
  distribution numeric NOT NULL DEFAULT 0,
  nav numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(quarter_id)
);

ALTER TABLE public.fund_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fund metrics" ON public.fund_metrics
  FOR SELECT USING (true);

CREATE POLICY "Anyone can manage fund metrics" ON public.fund_metrics
  FOR ALL USING (true) WITH CHECK (true);
