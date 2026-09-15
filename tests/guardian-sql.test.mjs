import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA nurim_private;
 CREATE TABLE applications(id uuid PRIMARY KEY,program_id text,center_id uuid,applicant_name text,phone text,birth_date date,participant_type text,drive_sync_status text,survey_response boolean,signature text,privacy_agreed_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE programs(id text,center_id uuid,survey_id uuid);
 CREATE TABLE nurim_survey_submissions(id uuid,survey_id uuid,revision int,token_hash text);
 INSERT INTO applications(id,applicant_name,birth_date) VALUES('00000000-0000-0000-0000-000000000001','기존 아동','2020-01-01');`);
 await db.exec(fs.readFileSync(new URL('../backend/guardian-consent.sql',import.meta.url),'utf8'));
 const insert=`INSERT INTO applications(id,applicant_name,birth_date,signature,guardian_name,guardian_signature,guardian_agreed_at) VALUES($1,'시험 아동',$2,$3,$4,$5,$6)`;
 await assert.rejects(db.query(insert,['00000000-0000-0000-0000-000000000002','2020-01-01','시험 아동',null,null,null]));
 await assert.rejects(db.query(insert,['00000000-0000-0000-0000-000000000002','2020-01-01','다른 아동','가상 보호자','가상 보호자',new Date()]));
 await db.query(insert,['00000000-0000-0000-0000-000000000002','2020-01-01','시험 아동','가상 보호자','가상 보호자',new Date()]);
 await db.query(insert,['00000000-0000-0000-0000-000000000003','2000-01-01','시험 아동','불필요','불필요',new Date()]);
 assert.equal((await db.query("SELECT guardian_name FROM applications WHERE id='00000000-0000-0000-0000-000000000003'")).rows[0].guardian_name,null);
 await db.exec("UPDATE applications SET guardian_name='변경시도',guardian_signature='변경시도';");
 assert.equal((await db.query("SELECT guardian_name FROM applications WHERE id='00000000-0000-0000-0000-000000000002'")).rows[0].guardian_name,'가상 보호자');
 await assert.rejects(db.exec("UPDATE applications SET birth_date='2020-01-01' WHERE id='00000000-0000-0000-0000-000000000003';"));
 assert.equal((await db.query("SELECT guardian_required FROM applications WHERE id='00000000-0000-0000-0000-000000000001'")).rows[0].guardian_required,false);
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.nurim_reserve_survey(uuid,text,uuid,integer,text,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
 console.log('PASS: DB rejects missing guardian/child signature, preserves legacy records, strips adult data, protects evidence, blocks age-bypass edits');
}finally{await db.close();}
