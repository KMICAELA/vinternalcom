
-- Quarters table
CREATE TABLE public.quarters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,  -- e.g. 'Q3 2025'
  sort_order INT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fund report upload statuses
CREATE TABLE public.fund_report_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter_id UUID NOT NULL REFERENCES public.quarters(id) ON DELETE CASCADE,
  fund_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded')),
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quarter_id, fund_name)
);

-- Enable RLS
ALTER TABLE public.quarters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_report_statuses ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed for this internal tool)
CREATE POLICY "Anyone can read quarters" ON public.quarters FOR SELECT USING (true);
CREATE POLICY "Anyone can manage quarters" ON public.quarters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read fund report statuses" ON public.fund_report_statuses FOR SELECT USING (true);
CREATE POLICY "Anyone can manage fund report statuses" ON public.fund_report_statuses FOR ALL USING (true) WITH CHECK (true);
