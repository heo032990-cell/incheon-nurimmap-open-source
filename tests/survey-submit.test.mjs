import {validateGuardian} from "../guardian-core.mjs";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {validateAnswers,validateSchema,matchingSignature} from '../survey-core.mjs';
const pid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const question={id:'q',label:'희망',help:'',type:'rank',rankCount:2,required:true,options:['A','B','C']};
const schema=validateSchema({title:'검사',description:'',questions:[question]});
const records={programs:[{id:pid,published:true,survey_id:sid,start_date:'2020-01-01',end_date:'2099-12-31',consent_items:[{id:'consent',type:'radio',enabled:true}]}],nurim_surveys:[{id:sid,published_revision:1}],nurim_survey_versions:[{survey_id:sid,revision:1,schema}],nurim_survey_submissions:[]};
let writes=0,handler;
function query(name){let rows=records[name]||[];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},single(){return Promise.resolve({data:rows[0]||null,error:null})},maybeSingle(){return q.single()},insert(){writes++;throw Error('Unexpected write')},update(){writes++;throw Error('Unexpected write')}};return q;}
const source=readFileSync(new URL('../backend/nurim-survey.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
runInNewContext(stripTypeScriptTypes(source),{validateGuardian,createClient:()=>({from:query}),Deno:{env:{get:()=>''},serve:f=>handler=f},validateAnswers,validateSchema,matchingSignature,Request,Response,crypto,TextEncoder,Intl,Error,console});
async function submit(answers,signature,birth="2000-01-01",guardian=null){const r=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({action:'submit',id:crypto.randomUUID(),token:crypto.randomUUID(),programId:pid,revision:1,basic:{name:'홍길동',phone:'01012345678',birth},answers,extra:{signature,guardian,note:'',participantType:'장애 당사자',consentResponses:{consent:'agree'}}})}));return {status:r.status,body:await r.json()};}
const mismatch=await submit({q:['A','B']},'다른이름');assert.equal(mismatch.status,400);assert.match(mismatch.body.error,/이름과 같아야/);
const tooFew=await submit({q:['A']},'홍길동');assert.equal(tooFew.status,400);assert.match(tooFew.body.error,/2순위/);
schema.questions=[{...question,type:'checkbox',selectionMode:'exact',selectionCount:2}];
const checkbox=await submit({q:['A']},'홍길동');assert.equal(checkbox.status,400);assert.match(checkbox.body.error,/2개/);
const missingGuardian=await submit({q:['A','B']},'홍길동','2020-01-01');assert.equal(missingGuardian.status,400);assert.match(missingGuardian.body.error,/보호자/);
assert.equal(writes,0);console.log('Server rejects mismatching signatures and invalid selection counts before writes or Google calls');
