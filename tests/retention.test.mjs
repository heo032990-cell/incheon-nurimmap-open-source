import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=new PGlite();
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE programs(id text PRIMARY KEY,privacy_retention_years int);
 INSERT INTO programs VALUES('test',1);
 CREATE TABLE applications(id uuid PRIMARY KEY,program_id text,created_at timestamptz DEFAULT now(),privacy_agreed_at timestamptz,consent_version text,uploaded_file_path text);
 CREATE TABLE application_events(application_id uuid REFERENCES applications ON DELETE SET NULL,application_reference uuid);
 CREATE TABLE nurim_survey_submissions(id uuid REFERENCES applications ON DELETE CASCADE);
 INSERT INTO applications(id,program_id,created_at,consent_version) VALUES('00000000-0000-0000-0000-000000000001','test',now()-interval '2 years','global:1years');`);
 let sql=fs.readFileSync(new URL('../backend/retention.sql',import.meta.url),'utf8');
 sql=sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;[\s\S]*?COMMIT;/,'COMMIT;');
 // PGlite has one connection, so the production concurrency lock is unnecessary here.
 sql=sql.replace("IF NOT pg_try_advisory_xact_lock(1060916) THEN RETURN jsonb_build_object('skipped','already_running'); END IF;",'');
 await db.exec(sql);
 await db.exec(`INSERT INTO application_events VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
 INSERT INTO nurim_survey_submissions VALUES('00000000-0000-0000-0000-000000000001');
 INSERT INTO applications(id,program_id,privacy_agreed_at) VALUES('00000000-0000-0000-0000-000000000002','test',now());
 INSERT INTO applications(id,program_id,created_at,uploaded_file_path) VALUES('00000000-0000-0000-0000-000000000003','test',now()-interval '2 years','pending-file');
 UPDATE programs SET privacy_retention_years=30;
 UPDATE applications SET retention_years=30,retention_expires_at=now()+interval '30 years';`);
 assert.equal((await db.query('SELECT retention_years FROM applications LIMIT 1')).rows[0].retention_years,1);
 const result=(await db.query('SELECT nurim_private.purge_expired_applications() AS result')).rows[0].result;
 assert.deepEqual(result,{deleted_applications:1,deleted_events:1,storage_pending:1});
 assert.equal((await db.query('SELECT count(*)::int n FROM nurim_survey_submissions')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM applications')).rows[0].n,2);
 assert.equal((await db.query("SELECT has_function_privilege('authenticated','nurim_private.purge_expired_applications()','EXECUTE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query('SELECT nurim_private.purge_expired_applications() AS result')).rows[0].result.deleted_applications,0);
 console.log('PASS: expired-only deletion, consent snapshot protection, related records, storage safety, permissions, repeat run');
} finally {await db.close();}
