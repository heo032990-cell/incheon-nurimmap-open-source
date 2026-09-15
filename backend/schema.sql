-- Fresh Supabase project only. Schema metadata snapshot; NO production rows.
-- Run schema.sql first, then storage-setup.sql. Historical SQL is not an install sequence.
BEGIN;
SET LOCAL check_function_bodies = false;
CREATE TABLE public."google_form_verification_configs" (
  "program_id" text NOT NULL,
  "response_spreadsheet_id" text,
  "response_sheet_name" text DEFAULT '설문지 응답 1'::text NOT NULL,
  "token_column_name" text DEFAULT '설문 확인번호'::text NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "form_file_id" text,
  "verification_mode" text DEFAULT 'sheet'::text NOT NULL,
  "relay_secret_hash" text,
  "relay_connected_at" timestamp with time zone,
  "relay_token_entry" text,
  "relay_form_url" text
);
CREATE TABLE public."google_form_submission_receipts" (
  "program_id" text NOT NULL,
  "token" uuid NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."app_settings" (
  "id" text DEFAULT 'global'::text NOT NULL,
  "consent_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "consent_version" text DEFAULT 'global-1'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "program_categories" text[] DEFAULT ARRAY['신체활동'::text, '문화·여가활동'::text, '교육활동'::text, '자조모임'::text, '가족지원'::text, '기타'::text] NOT NULL,
  "disability_types" text[] DEFAULT ARRAY['전체 장애유형'::text, '지체장애'::text, '뇌병변장애'::text, '시각장애'::text, '청각장애'::text, '언어장애'::text, '지적장애'::text, '자폐성장애'::text, '정신장애'::text, '신장장애'::text, '심장장애'::text, '호흡기장애'::text, '간장애'::text, '안면장애'::text, '장루·요루장애'::text, '뇌전증장애'::text, '기타'::text] NOT NULL,
  "audience_types" text[] DEFAULT ARRAY['장애 당사자'::text, '가족·보호자'::text, '지역주민'::text, '기타'::text] NOT NULL,
  "activity_category_icons" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "policy_settings" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE public."applications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "program_id" text NOT NULL,
  "center_id" uuid NOT NULL,
  "applicant_name" text NOT NULL,
  "phone" text NOT NULL,
  "birth_date" date NOT NULL,
  "participant_type" text NOT NULL,
  "note" text,
  "privacy_agree" boolean DEFAULT false NOT NULL,
  "consent_responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "consent_version" text,
  "signature" text,
  "privacy_agreed_at" timestamp with time zone,
  "uploaded_file_path" text,
  "uploaded_file_name" text,
  "uploaded_file_type" text,
  "uploaded_file_size" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "drive_sync_status" text DEFAULT 'pending'::text NOT NULL,
  "drive_synced_at" timestamp with time zone,
  "drive_folder_url" text,
  "drive_error" text,
  "drive_roster_sheet_url" text,
  "application_status" text DEFAULT 'accepted'::text NOT NULL,
  "queue_number" integer,
  "lifecycle_status" text DEFAULT 'received'::text NOT NULL,
  "modified_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "last_action_actor" text DEFAULT 'applicant'::text NOT NULL,
  "last_action_at" timestamp with time zone DEFAULT now() NOT NULL,
  "application_responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "google_form_confirmed_at" timestamp with time zone,
  "survey_token" uuid,
  "survey_response" boolean DEFAULT false NOT NULL,
  "drive_uploaded_file_url" text,
  "base_consent_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL
);
CREATE TABLE public."application_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "application_id" uuid,
  "action" text NOT NULL,
  "actor_type" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "before_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "after_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "application_reference" uuid NOT NULL,
  "center_id" uuid
);
CREATE TABLE public."programs" (
  "id" text NOT NULL,
  "center_id" uuid,
  "center_name" text NOT NULL,
  "title" text NOT NULL,
  "fee" text DEFAULT '무료'::text NOT NULL,
  "age_group" text NOT NULL,
  "audience" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "schedule" text NOT NULL,
  "capacity" integer NOT NULL,
  "description" text NOT NULL,
  "detail_url" text,
  "consent_enabled" boolean DEFAULT true NOT NULL,
  "consent_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "form_enabled" boolean DEFAULT false NOT NULL,
  "form_guide" text,
  "template_file_path" text,
  "template_file_name" text,
  "published" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "privacy_collection_start_date" date,
  "privacy_collection_end_date" date,
  "privacy_retention_years" integer DEFAULT 5 NOT NULL,
  "manager_id" uuid,
  "hidden_from_public" boolean DEFAULT false NOT NULL,
  "selection_method" text DEFAULT 'first_come'::text NOT NULL,
  "contact_phone" text,
  "promotion_image_path" text,
  "promotion_image_name" text,
  "application_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "google_form_url" text,
  "promotion_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "google_form_verification_enabled" boolean DEFAULT false NOT NULL,
  "google_form_token_entry" text,
  "activity_category" text DEFAULT '기타'::text NOT NULL,
  "disability_types" text[] DEFAULT ARRAY['전체 장애유형'::text] NOT NULL,
  "audience_type" text DEFAULT '기타'::text NOT NULL,
  "audience_other" text,
  "survey_id" uuid,
  "public_number" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "public_year" integer,
  "public_center" text
);
CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "role" text NOT NULL,
  "center_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email" text,
  "drive_folder_url" text
);
CREATE TABLE public."centers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "district" text,
  "drive_folder_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "consent_enabled" boolean DEFAULT false NOT NULL,
  "consent_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "consent_updated_at" timestamp with time zone
);
CREATE TABLE public."nurim_surveys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "center_id" uuid,
  "title" text NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "published_revision" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."nurim_survey_versions" (
  "survey_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "schema" jsonb NOT NULL,
  "saved_by" uuid NOT NULL,
  "saved_name" text NOT NULL,
  "saved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "drive_pdf_url" text,
  "drive_folder_url" text
);
CREATE TABLE public."nurim_survey_submissions" (
  "id" uuid NOT NULL,
  "survey_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "token_hash" text NOT NULL,
  "completed_at" timestamp with time zone
);
ALTER TABLE public."google_form_verification_configs" ADD CONSTRAINT "google_form_verification_configs_pkey" PRIMARY KEY (program_id);
ALTER TABLE public."google_form_submission_receipts" ADD CONSTRAINT "google_form_submission_receipts_pkey" PRIMARY KEY (program_id, token);
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_id_check" CHECK ((id = 'global'::text));
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."applications" ADD CONSTRAINT "applications_application_status_check" CHECK ((application_status = ANY (ARRAY['accepted'::text, 'waitlist'::text, 'pending_selection'::text])));
ALTER TABLE public."applications" ADD CONSTRAINT "applications_drive_sync_status_check" CHECK ((drive_sync_status = ANY (ARRAY['pending'::text, 'processing'::text, 'synced'::text, 'failed'::text])));
ALTER TABLE public."applications" ADD CONSTRAINT "applications_last_action_actor_check" CHECK ((last_action_actor = ANY (ARRAY['applicant'::text, 'administrator'::text])));
ALTER TABLE public."applications" ADD CONSTRAINT "applications_lifecycle_status_check" CHECK ((lifecycle_status = ANY (ARRAY['received'::text, 'modified'::text, 'cancelled'::text, 'deleted'::text])));
ALTER TABLE public."applications" ADD CONSTRAINT "applications_pkey" PRIMARY KEY (id);
ALTER TABLE public."application_events" ADD CONSTRAINT "application_events_action_check" CHECK ((action = ANY (ARRAY['modified'::text, 'cancelled'::text, 'deleted'::text])));
ALTER TABLE public."application_events" ADD CONSTRAINT "application_events_actor_type_check" CHECK ((actor_type = ANY (ARRAY['applicant'::text, 'administrator'::text])));
ALTER TABLE public."application_events" ADD CONSTRAINT "application_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."programs" ADD CONSTRAINT "programs_capacity_check" CHECK ((capacity >= 0));
ALTER TABLE public."programs" ADD CONSTRAINT "programs_pkey" PRIMARY KEY (id);
ALTER TABLE public."programs" ADD CONSTRAINT "programs_privacy_retention_years_check" CHECK (((privacy_retention_years >= 1) AND (privacy_retention_years <= 30)));
ALTER TABLE public."programs" ADD CONSTRAINT "programs_promotion_images_valid" CHECK (((jsonb_typeof(promotion_images) = 'array'::text) AND (jsonb_array_length(promotion_images) <= 10)));
ALTER TABLE public."programs" ADD CONSTRAINT "programs_selection_method_check" CHECK ((selection_method = ANY (ARRAY['first_come'::text, 'lottery'::text, 'open'::text])));
ALTER TABLE public."profiles" ADD CONSTRAINT "manager_must_have_center" CHECK (((role = 'super'::text) OR (center_id IS NOT NULL)));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['super'::text, 'manager'::text])));
ALTER TABLE public."centers" ADD CONSTRAINT "centers_name_key" UNIQUE (name);
ALTER TABLE public."centers" ADD CONSTRAINT "centers_pkey" PRIMARY KEY (id);
ALTER TABLE public."nurim_surveys" ADD CONSTRAINT "nurim_surveys_pkey" PRIMARY KEY (id);
ALTER TABLE public."nurim_survey_versions" ADD CONSTRAINT "nurim_survey_versions_pkey" PRIMARY KEY (survey_id, revision);
ALTER TABLE public."nurim_survey_submissions" ADD CONSTRAINT "nurim_survey_submissions_pkey" PRIMARY KEY (id);
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'super'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.sync_program_center_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.name is distinct from old.name then
    update public.programs
    set center_name = new.name,
        updated_at = now()
    where center_id = new.id;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.assign_application_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_method text;
  v_capacity integer;
  v_order integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.program_id, 0));

  select selection_method, capacity
  into v_method, v_capacity
  from public.programs
  where id = new.program_id
    and published = true
    and hidden_from_public = false;

  if not found then
    raise exception '현재 신청할 수 없는 프로그램입니다.';
  end if;

  select coalesce(max(queue_number), count(*)) + 1
  into v_order
  from public.applications
  where program_id = new.program_id;

  new.queue_number := v_order;

  if v_method = 'lottery' then
    new.application_status := 'pending_selection';
  elsif v_method = 'open' or v_capacity = 0 or v_order <= v_capacity then
    new.application_status := 'accepted';
  else
    new.application_status := 'waitlist';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_application_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_action text;
begin
  if new.lifecycle_status='deleted' and old.lifecycle_status<>'deleted' then v_action:='deleted';
  elsif new.lifecycle_status='cancelled' and old.lifecycle_status<>'cancelled' then v_action:='cancelled';
  else v_action:='modified'; end if;
  insert into public.application_events(application_id,application_reference,center_id,action,actor_type,occurred_at,before_data,after_data)
  values(new.id,new.id,new.center_id,v_action,new.last_action_actor,coalesce(new.last_action_at,now()),to_jsonb(old),to_jsonb(new));
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.lookup_my_applications(p_name text, p_birth_date date, p_phone_last4 text)
 RETURNS TABLE(application_id uuid, applicant_name text, masked_phone text, birth_date date, program_title text, center_name text, center_contact_phone text, participant_type text, note text, applied_at timestamp with time zone, drive_sync_status text, lifecycle_status text, modified_at timestamp with time zone, cancelled_at timestamp with time zone, deleted_at timestamp with time zone, last_action_actor text, last_action_at timestamp with time zone, recruitment_end_date date, can_self_manage boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select a.id,a.applicant_name,regexp_replace(a.phone,'([0-9]{3})[0-9-]+([0-9]{4})$','\1-****-\2'),a.birth_date,
   pr.title,pr.center_name,coalesce(nullif(trim(pr.contact_phone),''),'기관 연락처 확인 중'),a.participant_type,coalesce(a.note,''),a.created_at,a.drive_sync_status,
   a.lifecycle_status,a.modified_at,a.cancelled_at,a.deleted_at,a.last_action_actor,a.last_action_at,pr.end_date,
   (current_date<=pr.end_date and a.lifecycle_status not in ('cancelled','deleted'))
 from public.applications a join public.programs pr on pr.id=a.program_id
 where lower(trim(a.applicant_name))=lower(trim(p_name)) and a.birth_date=p_birth_date
   and right(regexp_replace(a.phone,'[^0-9]','','g'),4)=regexp_replace(p_phone_last4,'[^0-9]','','g')
 order by a.created_at desc limit 20;
$function$
;
CREATE OR REPLACE FUNCTION public.update_my_application(p_application_id uuid, p_name text, p_birth_date date, p_phone_last4 text, p_new_name text, p_new_phone text, p_new_birth_date date, p_new_participant_type text, p_new_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_app public.applications%rowtype; v_end date;
begin
 select a.* into v_app from public.applications a
 where a.id=p_application_id and lower(trim(a.applicant_name))=lower(trim(p_name)) and a.birth_date=p_birth_date
   and right(regexp_replace(a.phone,'[^0-9]','','g'),4)=regexp_replace(p_phone_last4,'[^0-9]','','g') for update;
 if not found then raise exception '신청자 확인정보가 일치하지 않습니다.'; end if;
 select end_date into v_end from public.programs where id=v_app.program_id;
 if current_date>v_end then raise exception '모집기간이 끝나 담당기관을 통해서만 수정할 수 있습니다.'; end if;
 if v_app.lifecycle_status in ('cancelled','deleted') then raise exception '취소 또는 삭제된 신청은 수정할 수 없습니다.'; end if;
 update public.applications set applicant_name=trim(p_new_name),phone=case when nullif(trim(p_new_phone),'') is null then phone else trim(p_new_phone) end,
   birth_date=p_new_birth_date,participant_type=p_new_participant_type,note=nullif(trim(p_new_note),''),lifecycle_status='modified',modified_at=now(),
   last_action_actor='applicant',last_action_at=now(),drive_sync_status='pending',drive_error=null where id=p_application_id;
 return p_application_id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.cancel_my_application(p_application_id uuid, p_name text, p_birth_date date, p_phone_last4 text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_app public.applications%rowtype; v_end date;
begin
 select a.* into v_app from public.applications a
 where a.id=p_application_id and lower(trim(a.applicant_name))=lower(trim(p_name)) and a.birth_date=p_birth_date
   and right(regexp_replace(a.phone,'[^0-9]','','g'),4)=regexp_replace(p_phone_last4,'[^0-9]','','g') for update;
 if not found then raise exception '신청자 확인정보가 일치하지 않습니다.'; end if;
 select end_date into v_end from public.programs where id=v_app.program_id;
 if current_date>v_end then raise exception '모집기간이 끝나 담당기관을 통해서만 취소할 수 있습니다.'; end if;
 if v_app.lifecycle_status in ('cancelled','deleted') then raise exception '이미 취소 또는 삭제된 신청입니다.'; end if;
 update public.applications set lifecycle_status='cancelled',cancelled_at=now(),last_action_actor='applicant',last_action_at=now(),
   drive_sync_status='pending',drive_error=null where id=p_application_id;
 return p_application_id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.transfer_manager_center(p_manager_id uuid, p_new_center_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_new_center_name text; v_program_ids text[]:='{}'::text[]; v_count integer:=0;
begin
  perform 1 from public.profiles where id=p_manager_id and role='manager' for update;
  if not found then raise exception '담당자 계정을 찾지 못했습니다.'; end if;
  select name into v_new_center_name from public.centers where id=p_new_center_id and active=true;
  if not found then raise exception '변경할 기관을 찾지 못했습니다.'; end if;
  select coalesce(array_agg(id),'{}'::text[]) into v_program_ids from public.programs where manager_id=p_manager_id;
  v_count:=coalesce(array_length(v_program_ids,1),0);
  if v_count>0 then
    update public.programs set center_id=p_new_center_id,center_name=v_new_center_name,updated_at=now() where id=any(v_program_ids);
    update public.applications set center_id=p_new_center_id where program_id=any(v_program_ids);
  end if;
  update public.profiles set center_id=p_new_center_id where id=p_manager_id;
  return v_count;
end; $function$
;
CREATE OR REPLACE FUNCTION public.public_program_application_counts()
 RETURNS TABLE(program_id text, total_count bigint, accepted_count bigint, waitlist_count bigint, pending_selection_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id as program_id,
    count(a.id) filter (
      where coalesce(a.lifecycle_status, 'received') not in ('cancelled', 'deleted')
    ) as total_count,
    count(a.id) filter (
      where coalesce(a.lifecycle_status, 'received') not in ('cancelled', 'deleted')
        and coalesce(a.application_status, 'accepted') = 'accepted'
    ) as accepted_count,
    count(a.id) filter (
      where coalesce(a.lifecycle_status, 'received') not in ('cancelled', 'deleted')
        and a.application_status = 'waitlist'
    ) as waitlist_count,
    count(a.id) filter (
      where coalesce(a.lifecycle_status, 'received') not in ('cancelled', 'deleted')
        and a.application_status = 'pending_selection'
    ) as pending_selection_count
  from public.programs p
  left join public.applications a on a.program_id = p.id
  where p.published = true
    and coalesce(p.hidden_from_public, false) = false
  group by p.id;
$function$
;
CREATE OR REPLACE FUNCTION public.nurim_save_survey(p_id uuid, p_owner uuid, p_center uuid, p_schema jsonb, p_revision integer, p_name text)
 RETURNS nurim_surveys
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.nurim_surveys;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into s from public.nurim_surveys where id=p_id for update;
 if not found then
  if p_revision<>0 then raise exception '설문을 다시 불러와 주세요.'; end if;
  insert into public.nurim_surveys(id,owner_id,center_id,title) values(p_id,p_owner,p_center,p_schema->>'title') returning * into s;
 end if;
 if s.revision<>p_revision then raise exception '다른 담당자가 먼저 저장했습니다. 새로 불러온 뒤 수정해 주세요.'; end if;
 update public.nurim_surveys set title=p_schema->>'title',revision=revision+1,updated_at=now() where id=p_id returning * into s;
 insert into public.nurim_survey_versions(survey_id,revision,schema,saved_by,saved_name) values(p_id,s.revision,p_schema,p_owner,p_name);
 return s;
end $function$
;
CREATE OR REPLACE FUNCTION public.nurim_application_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='UPDATE' and old.survey_response then new.survey_response:=true; end if;
 if new.survey_response or exists(select 1 from public.programs where id=new.program_id and survey_id is not null) then
  new.survey_response:=true;
  if TG_OP='INSERT' and coalesce(auth.role(),'') <> 'service_role' then raise exception '통합 설문 접수 경로를 사용해 주세요.'; end if;
  if coalesce(new.note,'')<>'' or coalesce(new.participant_type,'')<>''
   or coalesce(new.application_responses,'{}'::jsonb)<>'{}'::jsonb
   or new.uploaded_file_path is not null then
   raise exception '통합 설문의 상세 응답은 Google Drive에만 저장해야 합니다.';
  end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.nurim_reserve_survey(p_id uuid, p_program text, p_survey uuid, p_revision integer, p_token text, p_basic jsonb)
 RETURNS applications
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.applications; m public.nurim_survey_submissions; c uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
 select * into m from public.nurim_survey_submissions where id=p_id;
 if found then
  if m.token_hash<>p_token or m.survey_id<>p_survey or m.revision<>p_revision then raise exception '신청 확인번호가 올바르지 않습니다.'; end if;
  select * into a from public.applications where id=p_id;
  if a.program_id<>p_program or a.applicant_name<>p_basic->>'name' or a.phone<>p_basic->>'phone' or a.birth_date::text<>p_basic->>'birth' then raise exception '재시도 시 기본정보를 변경할 수 없습니다. 새 신청 창을 열어 주세요.'; end if;
  return a;
 end if;
 select center_id into c from public.programs where id=p_program and survey_id=p_survey;
 if not found then raise exception '프로그램 설문 연결을 다시 확인해 주세요.'; end if;
 insert into public.applications(id,program_id,center_id,applicant_name,phone,birth_date,participant_type,drive_sync_status,survey_response)
 values(p_id,p_program,c,p_basic->>'name',p_basic->>'phone',(p_basic->>'birth')::date,'','pending',true) returning * into a;
 insert into public.nurim_survey_submissions(id,survey_id,revision,token_hash) values(p_id,p_survey,p_revision,p_token);
 return a;
end $function$
;
CREATE OR REPLACE FUNCTION public.nurim_binding_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.survey_id is not null and (TG_OP='INSERT' or new.survey_id is distinct from old.survey_id) then
  if not exists(select 1 from public.nurim_surveys where id=new.survey_id and owner_id=new.manager_id and published_revision is not null) then
   raise exception '프로그램 담당자가 배포한 설문만 연결할 수 있습니다.';
  end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.nurim_program_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if TG_OP='INSERT' then
  new.created_at:=now();
  new.public_year:=extract(year from new.created_at at time zone 'Asia/Seoul');
  new.public_center:=coalesce(nullif(trim(new.center_name),''),'복지관');
 else
  new.created_at:=old.created_at;
  new.public_number:=old.public_number;
  new.public_year:=old.public_year;
  new.public_center:=old.public_center;
 end if;
 return new;
end $function$
;
ALTER TABLE public."google_form_verification_configs" ADD CONSTRAINT "google_form_verification_configs_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE public."google_form_verification_configs" ADD CONSTRAINT "google_form_verification_configs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."google_form_submission_receipts" ADD CONSTRAINT "google_form_submission_receipts_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE public."applications" ADD CONSTRAINT "applications_center_id_fkey" FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE RESTRICT;
ALTER TABLE public."applications" ADD CONSTRAINT "applications_program_id_fkey" FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT;
ALTER TABLE public."application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL;
ALTER TABLE public."programs" ADD CONSTRAINT "programs_center_id_fkey" FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE RESTRICT;
ALTER TABLE public."programs" ADD CONSTRAINT "programs_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."programs" ADD CONSTRAINT "programs_survey_id_fkey" FOREIGN KEY (survey_id) REFERENCES nurim_surveys(id) ON DELETE RESTRICT;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_center_id_fkey" FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE RESTRICT;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."nurim_surveys" ADD CONSTRAINT "nurim_surveys_center_id_fkey" FOREIGN KEY (center_id) REFERENCES centers(id);
ALTER TABLE public."nurim_surveys" ADD CONSTRAINT "nurim_surveys_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id);
ALTER TABLE public."nurim_survey_versions" ADD CONSTRAINT "nurim_survey_versions_saved_by_fkey" FOREIGN KEY (saved_by) REFERENCES profiles(id);
ALTER TABLE public."nurim_survey_versions" ADD CONSTRAINT "nurim_survey_versions_survey_id_fkey" FOREIGN KEY (survey_id) REFERENCES nurim_surveys(id) ON DELETE RESTRICT;
ALTER TABLE public."nurim_survey_submissions" ADD CONSTRAINT "nurim_survey_submissions_id_fkey" FOREIGN KEY (id) REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE public."nurim_survey_submissions" ADD CONSTRAINT "nurim_survey_submissions_survey_id_fkey" FOREIGN KEY (survey_id) REFERENCES nurim_surveys(id);
ALTER TABLE public."nurim_survey_submissions" ADD CONSTRAINT "nurim_survey_submissions_survey_id_revision_fkey" FOREIGN KEY (survey_id, revision) REFERENCES nurim_survey_versions(survey_id, revision);
ALTER TABLE public."google_form_verification_configs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."google_form_verification_configs" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."google_form_submission_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."google_form_submission_receipts" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."app_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."app_settings" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."applications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."applications" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."application_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."application_events" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."programs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."programs" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."profiles" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."centers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."centers" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."nurim_surveys" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."nurim_surveys" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."nurim_survey_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."nurim_survey_versions" FROM PUBLIC, anon, authenticated;
ALTER TABLE public."nurim_survey_submissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."nurim_survey_submissions" FROM PUBLIC, anon, authenticated;
CREATE POLICY "public can read centers" ON public."centers" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);
CREATE POLICY "users can read own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "managers can read own center applications" ON public."applications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR (p.center_id = applications.center_id))))));
CREATE POLICY "managers can update own center applications" ON public."applications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR (p.center_id = applications.center_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR (p.center_id = applications.center_id))))));
CREATE POLICY "super can insert centers" ON public."centers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super'::text)))));
CREATE POLICY "super can update centers" ON public."centers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super'::text)))));
CREATE POLICY "managers can read managed programs" ON public."programs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR (p.center_id = programs.center_id))))));
CREATE POLICY "managers can delete own center applications" ON public."applications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR (p.center_id = applications.center_id))))));
CREATE POLICY "super can read all profiles" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = ( SELECT auth.uid() AS uid)) OR is_super_admin()));
CREATE POLICY "super can update manager profiles" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "app_settings_public_read" ON public."app_settings" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);
CREATE POLICY "app_settings_super_insert" ON public."app_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super'::text)))));
CREATE POLICY "app_settings_super_update" ON public."app_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super'::text)))));
CREATE POLICY "app_settings_super_delete" ON public."app_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super'::text)))));
CREATE POLICY "public can read published programs" ON public."programs" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (((published = true) AND (hidden_from_public = false)));
CREATE POLICY "public can submit applications" ON public."applications" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM programs pr
  WHERE ((pr.id = applications.program_id) AND (pr.center_id = applications.center_id) AND (pr.published = true) AND (pr.hidden_from_public = false)))));
CREATE POLICY "managers can update own center programs" ON public."programs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR ((p.role = 'manager'::text) AND (programs.manager_id = p.id))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR ((p.role = 'manager'::text) AND (p.center_id = programs.center_id) AND (programs.manager_id = p.id)))))));
CREATE POLICY "managers can delete own center programs" ON public."programs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR ((p.role = 'manager'::text) AND (programs.manager_id = p.id)))))));
CREATE POLICY "admins can read application events" ON public."application_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR (p.center_id = ( SELECT a.center_id
           FROM applications a
          WHERE (a.id = application_events.application_id))))))));
CREATE POLICY "super can delete applications" ON public."applications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super'::text)))));
CREATE POLICY "managers can insert own center programs" ON public."programs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super'::text) OR ((p.role = 'manager'::text) AND (p.center_id = programs.center_id) AND (programs.manager_id = p.id)))))));
CREATE INDEX applications_program_id_created_at_idx ON public.applications USING btree (program_id, created_at DESC);
CREATE INDEX applications_center_id_created_at_idx ON public.applications USING btree (center_id, created_at DESC);
CREATE INDEX applications_drive_sync_status_idx ON public.applications USING btree (drive_sync_status, created_at);
CREATE UNIQUE INDEX applications_survey_token_uidx ON public.applications USING btree (survey_token) WHERE (survey_token IS NOT NULL);
CREATE INDEX application_events_application_time_idx ON public.application_events USING btree (application_id, occurred_at DESC);
CREATE INDEX programs_activity_category_idx ON public.programs USING btree (activity_category);
CREATE INDEX programs_disability_types_gin_idx ON public.programs USING gin (disability_types);
CREATE INDEX programs_center_id_idx ON public.programs USING btree (center_id);
CREATE UNIQUE INDEX programs_public_number_unique ON public.programs USING btree (public_number);
CREATE INDEX programs_manager_id_idx ON public.programs USING btree (manager_id);
CREATE INDEX nurim_surveys_owner ON public.nurim_surveys USING btree (owner_id);
CREATE INDEX nurim_survey_submissions_survey ON public.nurim_survey_submissions USING btree (survey_id, revision);
CREATE TRIGGER centers_sync_program_name AFTER UPDATE OF name ON public.centers FOR EACH ROW EXECUTE FUNCTION sync_program_center_name();
CREATE TRIGGER applications_assign_queue BEFORE INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION assign_application_queue();
CREATE TRIGGER applications_audit_change AFTER UPDATE ON public.applications FOR EACH ROW WHEN (((old.applicant_name IS DISTINCT FROM new.applicant_name) OR (old.phone IS DISTINCT FROM new.phone) OR (old.birth_date IS DISTINCT FROM new.birth_date) OR (old.participant_type IS DISTINCT FROM new.participant_type) OR (old.note IS DISTINCT FROM new.note) OR (old.lifecycle_status IS DISTINCT FROM new.lifecycle_status))) EXECUTE FUNCTION audit_application_change();
CREATE TRIGGER nurim_program_identity BEFORE INSERT OR UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION nurim_program_identity();
CREATE TRIGGER nurim_application_guard BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION nurim_application_guard();
CREATE TRIGGER nurim_binding_guard BEFORE INSERT OR UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION nurim_binding_guard();
GRANT INSERT ON public."google_form_verification_configs" TO "anon";
GRANT SELECT ON public."google_form_verification_configs" TO "anon";
GRANT UPDATE ON public."google_form_verification_configs" TO "anon";
GRANT DELETE ON public."google_form_verification_configs" TO "anon";
GRANT INSERT ON public."google_form_verification_configs" TO "authenticated";
GRANT SELECT ON public."google_form_verification_configs" TO "authenticated";
GRANT UPDATE ON public."google_form_verification_configs" TO "authenticated";
GRANT DELETE ON public."google_form_verification_configs" TO "authenticated";
GRANT INSERT ON public."google_form_verification_configs" TO "service_role";
GRANT SELECT ON public."google_form_verification_configs" TO "service_role";
GRANT UPDATE ON public."google_form_verification_configs" TO "service_role";
GRANT DELETE ON public."google_form_verification_configs" TO "service_role";
GRANT TRUNCATE ON public."google_form_verification_configs" TO "service_role";
GRANT REFERENCES ON public."google_form_verification_configs" TO "service_role";
GRANT TRIGGER ON public."google_form_verification_configs" TO "service_role";
GRANT INSERT ON public."google_form_submission_receipts" TO "anon";
GRANT SELECT ON public."google_form_submission_receipts" TO "anon";
GRANT UPDATE ON public."google_form_submission_receipts" TO "anon";
GRANT DELETE ON public."google_form_submission_receipts" TO "anon";
GRANT INSERT ON public."google_form_submission_receipts" TO "authenticated";
GRANT SELECT ON public."google_form_submission_receipts" TO "authenticated";
GRANT UPDATE ON public."google_form_submission_receipts" TO "authenticated";
GRANT DELETE ON public."google_form_submission_receipts" TO "authenticated";
GRANT INSERT ON public."google_form_submission_receipts" TO "service_role";
GRANT SELECT ON public."google_form_submission_receipts" TO "service_role";
GRANT UPDATE ON public."google_form_submission_receipts" TO "service_role";
GRANT DELETE ON public."google_form_submission_receipts" TO "service_role";
GRANT TRUNCATE ON public."google_form_submission_receipts" TO "service_role";
GRANT REFERENCES ON public."google_form_submission_receipts" TO "service_role";
GRANT TRIGGER ON public."google_form_submission_receipts" TO "service_role";
GRANT INSERT ON public."app_settings" TO "anon";
GRANT SELECT ON public."app_settings" TO "anon";
GRANT UPDATE ON public."app_settings" TO "anon";
GRANT DELETE ON public."app_settings" TO "anon";
GRANT INSERT ON public."app_settings" TO "authenticated";
GRANT SELECT ON public."app_settings" TO "authenticated";
GRANT UPDATE ON public."app_settings" TO "authenticated";
GRANT DELETE ON public."app_settings" TO "authenticated";
GRANT INSERT ON public."app_settings" TO "service_role";
GRANT SELECT ON public."app_settings" TO "service_role";
GRANT UPDATE ON public."app_settings" TO "service_role";
GRANT DELETE ON public."app_settings" TO "service_role";
GRANT TRUNCATE ON public."app_settings" TO "service_role";
GRANT REFERENCES ON public."app_settings" TO "service_role";
GRANT TRIGGER ON public."app_settings" TO "service_role";
GRANT INSERT ON public."applications" TO "anon";
GRANT SELECT ON public."applications" TO "anon";
GRANT UPDATE ON public."applications" TO "anon";
GRANT DELETE ON public."applications" TO "anon";
GRANT INSERT ON public."applications" TO "authenticated";
GRANT SELECT ON public."applications" TO "authenticated";
GRANT UPDATE ON public."applications" TO "authenticated";
GRANT DELETE ON public."applications" TO "authenticated";
GRANT INSERT ON public."applications" TO "service_role";
GRANT SELECT ON public."applications" TO "service_role";
GRANT UPDATE ON public."applications" TO "service_role";
GRANT DELETE ON public."applications" TO "service_role";
GRANT TRUNCATE ON public."applications" TO "service_role";
GRANT REFERENCES ON public."applications" TO "service_role";
GRANT TRIGGER ON public."applications" TO "service_role";
GRANT INSERT ON public."application_events" TO "anon";
GRANT SELECT ON public."application_events" TO "anon";
GRANT UPDATE ON public."application_events" TO "anon";
GRANT DELETE ON public."application_events" TO "anon";
GRANT INSERT ON public."application_events" TO "authenticated";
GRANT SELECT ON public."application_events" TO "authenticated";
GRANT UPDATE ON public."application_events" TO "authenticated";
GRANT DELETE ON public."application_events" TO "authenticated";
GRANT INSERT ON public."application_events" TO "service_role";
GRANT SELECT ON public."application_events" TO "service_role";
GRANT UPDATE ON public."application_events" TO "service_role";
GRANT DELETE ON public."application_events" TO "service_role";
GRANT TRUNCATE ON public."application_events" TO "service_role";
GRANT REFERENCES ON public."application_events" TO "service_role";
GRANT TRIGGER ON public."application_events" TO "service_role";
GRANT INSERT ON public."programs" TO "anon";
GRANT SELECT ON public."programs" TO "anon";
GRANT UPDATE ON public."programs" TO "anon";
GRANT DELETE ON public."programs" TO "anon";
GRANT INSERT ON public."programs" TO "authenticated";
GRANT SELECT ON public."programs" TO "authenticated";
GRANT UPDATE ON public."programs" TO "authenticated";
GRANT DELETE ON public."programs" TO "authenticated";
GRANT INSERT ON public."programs" TO "service_role";
GRANT SELECT ON public."programs" TO "service_role";
GRANT UPDATE ON public."programs" TO "service_role";
GRANT DELETE ON public."programs" TO "service_role";
GRANT TRUNCATE ON public."programs" TO "service_role";
GRANT REFERENCES ON public."programs" TO "service_role";
GRANT TRIGGER ON public."programs" TO "service_role";
GRANT INSERT ON public."profiles" TO "anon";
GRANT SELECT ON public."profiles" TO "anon";
GRANT UPDATE ON public."profiles" TO "anon";
GRANT DELETE ON public."profiles" TO "anon";
GRANT INSERT ON public."profiles" TO "authenticated";
GRANT SELECT ON public."profiles" TO "authenticated";
GRANT UPDATE ON public."profiles" TO "authenticated";
GRANT DELETE ON public."profiles" TO "authenticated";
GRANT INSERT ON public."profiles" TO "service_role";
GRANT SELECT ON public."profiles" TO "service_role";
GRANT UPDATE ON public."profiles" TO "service_role";
GRANT DELETE ON public."profiles" TO "service_role";
GRANT TRUNCATE ON public."profiles" TO "service_role";
GRANT REFERENCES ON public."profiles" TO "service_role";
GRANT TRIGGER ON public."profiles" TO "service_role";
GRANT INSERT ON public."centers" TO "anon";
GRANT SELECT ON public."centers" TO "anon";
GRANT UPDATE ON public."centers" TO "anon";
GRANT DELETE ON public."centers" TO "anon";
GRANT INSERT ON public."centers" TO "authenticated";
GRANT SELECT ON public."centers" TO "authenticated";
GRANT UPDATE ON public."centers" TO "authenticated";
GRANT DELETE ON public."centers" TO "authenticated";
GRANT INSERT ON public."centers" TO "service_role";
GRANT SELECT ON public."centers" TO "service_role";
GRANT UPDATE ON public."centers" TO "service_role";
GRANT DELETE ON public."centers" TO "service_role";
GRANT TRUNCATE ON public."centers" TO "service_role";
GRANT REFERENCES ON public."centers" TO "service_role";
GRANT TRIGGER ON public."centers" TO "service_role";
GRANT INSERT ON public."nurim_surveys" TO "service_role";
GRANT SELECT ON public."nurim_surveys" TO "service_role";
GRANT UPDATE ON public."nurim_surveys" TO "service_role";
GRANT DELETE ON public."nurim_surveys" TO "service_role";
GRANT TRUNCATE ON public."nurim_surveys" TO "service_role";
GRANT REFERENCES ON public."nurim_surveys" TO "service_role";
GRANT TRIGGER ON public."nurim_surveys" TO "service_role";
GRANT INSERT ON public."nurim_survey_versions" TO "service_role";
GRANT SELECT ON public."nurim_survey_versions" TO "service_role";
GRANT UPDATE ON public."nurim_survey_versions" TO "service_role";
GRANT DELETE ON public."nurim_survey_versions" TO "service_role";
GRANT TRUNCATE ON public."nurim_survey_versions" TO "service_role";
GRANT REFERENCES ON public."nurim_survey_versions" TO "service_role";
GRANT TRIGGER ON public."nurim_survey_versions" TO "service_role";
GRANT INSERT ON public."nurim_survey_submissions" TO "service_role";
GRANT SELECT ON public."nurim_survey_submissions" TO "service_role";
GRANT UPDATE ON public."nurim_survey_submissions" TO "service_role";
GRANT DELETE ON public."nurim_survey_submissions" TO "service_role";
GRANT TRUNCATE ON public."nurim_survey_submissions" TO "service_role";
GRANT REFERENCES ON public."nurim_survey_submissions" TO "service_role";
GRANT TRIGGER ON public."nurim_survey_submissions" TO "service_role";
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_program_center_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_application_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_application_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lookup_my_applications(text,date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_my_application(uuid,text,date,text,text,text,date,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_my_application(uuid,text,date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_manager_center(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_program_application_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nurim_save_survey(uuid,uuid,uuid,jsonb,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nurim_application_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nurim_reserve_survey(uuid,text,uuid,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nurim_binding_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nurim_program_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO "anon";
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO "service_role";
GRANT EXECUTE ON FUNCTION public.sync_program_center_name() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_program_center_name() TO "anon";
GRANT EXECUTE ON FUNCTION public.sync_program_center_name() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.sync_program_center_name() TO "service_role";
GRANT EXECUTE ON FUNCTION public.assign_application_queue() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_application_queue() TO "anon";
GRANT EXECUTE ON FUNCTION public.assign_application_queue() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.assign_application_queue() TO "service_role";
GRANT EXECUTE ON FUNCTION public.audit_application_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_application_change() TO "anon";
GRANT EXECUTE ON FUNCTION public.audit_application_change() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.audit_application_change() TO "service_role";
GRANT EXECUTE ON FUNCTION public.lookup_my_applications(text,date,text) TO "anon";
GRANT EXECUTE ON FUNCTION public.lookup_my_applications(text,date,text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.lookup_my_applications(text,date,text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.update_my_application(uuid,text,date,text,text,text,date,text,text) TO "anon";
GRANT EXECUTE ON FUNCTION public.update_my_application(uuid,text,date,text,text,text,date,text,text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.update_my_application(uuid,text,date,text,text,text,date,text,text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.cancel_my_application(uuid,text,date,text) TO "anon";
GRANT EXECUTE ON FUNCTION public.cancel_my_application(uuid,text,date,text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.cancel_my_application(uuid,text,date,text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.transfer_manager_center(uuid,uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public.public_program_application_counts() TO "anon";
GRANT EXECUTE ON FUNCTION public.public_program_application_counts() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.public_program_application_counts() TO "service_role";
GRANT EXECUTE ON FUNCTION public.nurim_save_survey(uuid,uuid,uuid,jsonb,integer,text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.nurim_application_guard() TO "service_role";
GRANT EXECUTE ON FUNCTION public.nurim_reserve_survey(uuid,text,uuid,integer,text,jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION public.nurim_binding_guard() TO "service_role";
GRANT EXECUTE ON FUNCTION public.nurim_program_identity() TO "service_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
INSERT INTO public.app_settings (id) VALUES ('global');
COMMIT;
