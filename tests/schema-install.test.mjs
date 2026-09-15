import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
// Temporary database only; auth/storage are minimal test stubs, not Supabase services.
const db=new PGlite();
try{
await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint); CREATE TABLE storage.objects(id uuid,bucket_id text,name text);");
await db.exec(fs.readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../backend/storage-setup.sql',import.meta.url),'utf8'));
let retention=fs.readFileSync(new URL('../backend/retention.sql',import.meta.url),'utf8').replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;[\s\S]*?COMMIT;/,'COMMIT;');await db.exec(retention);await db.exec(fs.readFileSync(new URL('../backend/guardian-consent.sql',import.meta.url),'utf8'));
assert.equal((await db.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND rowsecurity")).rows[0].n,11);
assert.equal((await db.query("SELECT count(*)::int n FROM public.app_settings")).rows[0].n,1);
await db.exec("INSERT INTO public.centers(id,name) VALUES ('11111111-1111-4111-8111-111111111111','가상기관 A'),('22222222-2222-4222-8222-222222222222','가상기관 B'); INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); INSERT INTO public.profiles(id,display_name,role,center_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','가상담당자','manager','11111111-1111-4111-8111-111111111111');");
for(const [id,center,published] of [['own-hidden','11111111-1111-4111-8111-111111111111',false],['other-hidden','22222222-2222-4222-8222-222222222222',false],['public-demo','22222222-2222-4222-8222-222222222222',true]]){
await db.query("INSERT INTO public.programs(id,center_id,center_name,title,age_group,audience,start_date,end_date,schedule,capacity,description,published) VALUES ($1,$2,'가상기관','가상 프로그램','전체','전체','2026-01-01','2026-12-31','예제',10,'시험 데이터',$3)",[id,center,published]);}
await db.exec("SET ROLE anon;");
assert.deepEqual((await db.query("SELECT id FROM public.programs ORDER BY id")).rows.map(r=>r.id),['public-demo']);
assert.equal((await db.query("SELECT has_table_privilege(current_user,'public.applications','TRUNCATE') allowed")).rows[0].allowed,false);
assert.equal((await db.query("UPDATE public.profiles SET role='super' RETURNING id")).rows.length,0);
await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false); SET ROLE authenticated;");
assert.deepEqual((await db.query("SELECT id FROM public.programs ORDER BY id")).rows.map(r=>r.id),['own-hidden','public-demo']);
await db.exec("UPDATE public.profiles SET role='super';");
assert.equal((await db.query("SELECT role FROM public.profiles")).rows[0].role,'manager');
console.log('Fresh schema/storage SQL, RLS, private program visibility and role escalation checks passed (local PostgreSQL; auth/storage stubs).');
}finally{await db.close();}
