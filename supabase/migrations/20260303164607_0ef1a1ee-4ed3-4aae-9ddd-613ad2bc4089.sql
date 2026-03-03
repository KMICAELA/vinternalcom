
INSERT INTO storage.buckets (id, name, public)
VALUES ('fund-reports', 'fund-reports', false);

CREATE POLICY "Anyone can upload fund reports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'fund-reports');

CREATE POLICY "Anyone can read fund reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'fund-reports');

CREATE POLICY "Anyone can delete fund reports"
ON storage.objects FOR DELETE
USING (bucket_id = 'fund-reports');
