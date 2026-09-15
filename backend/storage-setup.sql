-- Fresh Supabase project, AFTER schema.sql. No production data.
BEGIN;
INSERT INTO storage.buckets(id, name, public, file_size_limit)
VALUES ('application-files','application-files',false,10485760),
       ('program-templates','program-templates',true,10485760)
ON CONFLICT(id) DO NOTHING;

-- Application files are uploaded by the authorized server, not anonymous clients.
CREATE POLICY "nurim application files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='application-files' AND EXISTS (
 SELECT 1 FROM public.applications a JOIN public.profiles p ON p.id=auth.uid()
 WHERE a.uploaded_file_path=storage.objects.name AND (p.role='super' OR (p.role='manager' AND p.center_id=a.center_id))
));
CREATE POLICY "nurim application files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='application-files' AND EXISTS (
 SELECT 1 FROM public.applications a JOIN public.profiles p ON p.id=auth.uid()
 WHERE a.uploaded_file_path=storage.objects.name AND (p.role='super' OR (p.role='manager' AND p.center_id=a.center_id))
));
-- Shared template bucket. Only registered staff may mutate template objects.
CREATE POLICY "nurim templates insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='program-templates' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('super','manager')));
CREATE POLICY "nurim templates read" ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='program-templates' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('super','manager')));
CREATE POLICY "nurim templates update" ON storage.objects FOR UPDATE TO authenticated
USING(bucket_id='program-templates' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('super','manager')))
WITH CHECK(bucket_id='program-templates' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('super','manager')));
CREATE POLICY "nurim templates delete" ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='program-templates' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('super','manager')));
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.programs, public.applications;
 END IF;
END $$;
COMMIT;
