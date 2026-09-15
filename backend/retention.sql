-- v106: consent-time retention snapshot and daily database cleanup.
-- Google Drive files and Storage objects are NOT deleted by this SQL.
BEGIN;
CREATE SCHEMA IF NOT EXISTS nurim_private;
REVOKE ALL ON SCHEMA nurim_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS retention_years integer;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

-- Prefer the period recorded in the original consent version for existing rows.
UPDATE public.applications a SET
 retention_years=COALESCE(CASE WHEN substring(a.consent_version from ':([0-9]{1,2})years$')::int BETWEEN 1 AND 30 THEN substring(a.consent_version from ':([0-9]{1,2})years$')::int END,p.privacy_retention_years),
 retention_expires_at=((COALESCE(a.privacy_agreed_at,a.created_at) AT TIME ZONE 'Asia/Seoul') + make_interval(years=>COALESCE(CASE WHEN substring(a.consent_version from ':([0-9]{1,2})years$')::int BETWEEN 1 AND 30 THEN substring(a.consent_version from ':([0-9]{1,2})years$')::int END,p.privacy_retention_years))) AT TIME ZONE 'Asia/Seoul'
FROM public.programs p WHERE p.id=a.program_id AND a.retention_expires_at IS NULL;
ALTER TABLE public.applications ALTER COLUMN retention_years SET NOT NULL;
ALTER TABLE public.applications ALTER COLUMN retention_expires_at SET NOT NULL;
ALTER TABLE public.applications ADD CONSTRAINT applications_retention_years_check CHECK(retention_years BETWEEN 1 AND 30);

CREATE OR REPLACE FUNCTION nurim_private.snapshot_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  NEW.retention_years:=OLD.retention_years;
  NEW.retention_expires_at:=OLD.retention_expires_at;
 ELSE
  SELECT p.privacy_retention_years INTO STRICT NEW.retention_years FROM public.programs p WHERE p.id=NEW.program_id;
  NEW.retention_expires_at:=((COALESCE(NEW.privacy_agreed_at,NEW.created_at) AT TIME ZONE 'Asia/Seoul') + make_interval(years=>NEW.retention_years)) AT TIME ZONE 'Asia/Seoul';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION nurim_private.snapshot_retention() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER applications_retention_snapshot BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION nurim_private.snapshot_retention();
CREATE INDEX applications_retention_expiry_idx ON public.applications(retention_expires_at);

CREATE TABLE nurim_private.retention_runs(
 run_at timestamptz NOT NULL DEFAULT now(), deleted_applications integer NOT NULL,
 deleted_events integer NOT NULL, storage_pending integer NOT NULL
);
REVOKE ALL ON TABLE nurim_private.retention_runs FROM PUBLIC,anon,authenticated;
ALTER TABLE nurim_private.retention_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION nurim_private.purge_expired_applications()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; app_count integer; event_count integer; pending_count integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(1060916) THEN RETURN jsonb_build_object('skipped','already_running'); END IF;
 -- Do not lose a remaining Storage file reference: those rows require Storage API cleanup first.
 SELECT count(*) INTO pending_count FROM public.applications WHERE retention_expires_at<=now() AND uploaded_file_path IS NOT NULL;
 SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.applications WHERE retention_expires_at<=now() AND uploaded_file_path IS NULL ORDER BY retention_expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED) q;
 DELETE FROM public.application_events WHERE application_id=ANY(ids) OR application_reference=ANY(ids);
 GET DIAGNOSTICS event_count=ROW_COUNT;
 -- nurim_survey_submissions is deleted by its ON DELETE CASCADE foreign key.
 DELETE FROM public.applications WHERE id=ANY(ids);
 GET DIAGNOSTICS app_count=ROW_COUNT;
 INSERT INTO nurim_private.retention_runs(deleted_applications,deleted_events,storage_pending) VALUES(app_count,event_count,pending_count);
 DELETE FROM nurim_private.retention_runs WHERE run_at<now()-interval '90 days';
 RETURN jsonb_build_object('deleted_applications',app_count,'deleted_events',event_count,'storage_pending',pending_count);
END $$;
REVOKE ALL ON FUNCTION nurim_private.purge_expired_applications() FROM PUBLIC,anon,authenticated;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- 18:00 UTC = 03:00 Asia/Seoul every day.
SELECT cron.schedule('nurim-retention-daily','0 18 * * *','SELECT nurim_private.purge_expired_applications();');
COMMIT;
