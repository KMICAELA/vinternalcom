
CREATE TABLE public.highlight_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter_date DATE NOT NULL,
  entity_name TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'Other',
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.highlight_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_he" ON public.highlight_entries FOR ALL TO public USING (true) WITH CHECK (true);
