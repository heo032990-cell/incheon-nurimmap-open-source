BEGIN;
ALTER TABLE public.applications
 ADD COLUMN guardian_required boolean NOT NULL DEFAULT false,
 ADD COLUMN guardian_name text,
 ADD COLUMN guardian_signature text,
 ADD COLUMN guardian_agreed_at timestamptz,
 ADD COLUMN guardian_consent_version text,
 ADD COLUMN guardian_consent_text text;

CREATE OR REPLACE FUNCTION nurim_private.guardian_consent_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE minor boolean; reference_date date;
BEGIN
 reference_date := (now() AT TIME ZONE 'Asia/Seoul')::date;
 IF TG_OP='UPDATE' THEN
  IF NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
   reference_date := (COALESCE(OLD.privacy_agreed_at,OLD.created_at) AT TIME ZONE 'Asia/Seoul')::date;
   IF (NEW.birth_date > reference_date - interval '14 years') IS DISTINCT FROM (OLD.birth_date > reference_date - interval '14 years') THEN
    RAISE EXCEPTION '법정대리인 동의 대상이 달라지는 생년월일 수정은 기관에 문의하여 새 신청으로 진행해 주세요.';
   END IF;
  END IF;
  -- Keep the original consent evidence immutable, including historical records.
  NEW.guardian_required:=OLD.guardian_required;
  NEW.guardian_name:=OLD.guardian_name;
  NEW.guardian_signature:=OLD.guardian_signature;
  NEW.guardian_agreed_at:=OLD.guardian_agreed_at;
  NEW.guardian_consent_version:=OLD.guardian_consent_version;
  NEW.guardian_consent_text:=OLD.guardian_consent_text;
  RETURN NEW;
 END IF;
 IF NEW.birth_date>reference_date THEN RAISE EXCEPTION '생년월일을 확인해 주세요.'; END IF;
 minor := NEW.birth_date > reference_date - interval '14 years';
 NEW.guardian_required:=minor;
 IF minor THEN
  NEW.guardian_name:=normalize(trim(NEW.guardian_name),NFC);
  NEW.guardian_signature:=normalize(trim(NEW.guardian_signature),NFC);
  IF COALESCE(length(NEW.guardian_name),0) NOT BETWEEN 1 AND 80 OR NEW.guardian_signature IS DISTINCT FROM NEW.guardian_name OR NEW.guardian_agreed_at IS NULL THEN
   RAISE EXCEPTION '만 14세 미만 신청자는 보호자(법정대리인) 이름·서명·동의가 필요합니다.';
  END IF;
  IF normalize(trim(COALESCE(NEW.signature,'')),NFC)<>normalize(trim(NEW.applicant_name),NFC) THEN RAISE EXCEPTION '아동의 신청자 서명도 신청자 이름과 같아야 합니다.'; END IF;
  NEW.guardian_agreed_at:=now();
  NEW.guardian_consent_version:='guardian-v107';
  NEW.guardian_consent_text:='본인은 신청 아동의 법정대리인으로서, 신청 단계에 안내된 개인정보 처리 내용을 확인하고 아동을 대신하여 선택한 동의 내용에 동의합니다. 법정대리인 이름·서명·동의일시는 동의 확인을 위해 신청정보와 같은 기간 동안 보관됩니다.';
 ELSE
  NEW.guardian_name:=NULL; NEW.guardian_signature:=NULL; NEW.guardian_agreed_at:=NULL;
  NEW.guardian_consent_version:=NULL; NEW.guardian_consent_text:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION nurim_private.guardian_consent_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER applications_guardian_consent BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION nurim_private.guardian_consent_guard();

CREATE OR REPLACE FUNCTION public.nurim_reserve_survey(p_id uuid,p_program text,p_survey uuid,p_revision integer,p_token text,p_basic jsonb)
RETURNS public.applications LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.applications; m public.nurim_survey_submissions; c uuid;
BEGIN
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
 select * into m from public.nurim_survey_submissions where id=p_id;
 if found then
  if m.token_hash<>p_token or m.survey_id<>p_survey or m.revision<>p_revision then raise exception '신청 확인번호가 올바르지 않습니다.'; end if;
  select * into a from public.applications where id=p_id;
  if a.program_id<>p_program or a.applicant_name<>p_basic->>'name' or a.phone<>p_basic->>'phone' or a.birth_date::text<>p_basic->>'birth' then raise exception '재시도 시 기본정보를 변경할 수 없습니다. 새 신청 창을 열어 주세요.'; end if;
  if a.guardian_required and (a.guardian_name IS DISTINCT FROM p_basic->'guardian'->>'name' OR a.guardian_signature IS DISTINCT FROM p_basic->'guardian'->>'signature') then raise exception '이미 접수 중인 신청의 보호자 정보를 변경할 수 없습니다. 기관에 문의해 주세요.'; end if;
  return a;
 end if;
 select center_id into c from public.programs where id=p_program and survey_id=p_survey;
 if not found then raise exception '프로그램 설문 연결을 다시 확인해 주세요.'; end if;
 insert into public.applications(id,program_id,center_id,applicant_name,phone,birth_date,participant_type,drive_sync_status,survey_response,signature,guardian_name,guardian_signature,guardian_agreed_at)
 values(p_id,p_program,c,p_basic->>'name',p_basic->>'phone',(p_basic->>'birth')::date,'','pending',true,p_basic->>'signature',p_basic->'guardian'->>'name',p_basic->'guardian'->>'signature',CASE WHEN p_basic->'guardian'->>'agreed'='true' THEN now() END) returning * into a;
 insert into public.nurim_survey_submissions(id,survey_id,revision,token_hash) values(p_id,p_survey,p_revision,p_token);
 return a;
END $$;
REVOKE ALL ON FUNCTION public.nurim_reserve_survey(uuid,text,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nurim_reserve_survey(uuid,text,uuid,integer,text,jsonb) TO service_role;
COMMIT;
