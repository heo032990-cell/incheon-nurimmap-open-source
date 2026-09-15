import {validateGuardian} from "../guardian-core.mjs";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const records={profiles:[{id:'a',role:'manager',center_id:'c1',display_name:'A'},{id:'b',role:'manager',center_id:'c2',display_name:'B'},{id:'s',role:'super',center_id:'c1',display_name:'S'},{id:'u',role:'user'}],centers:[{id:'c1',name:'기관 A'},{id:'c2',name:'기관 B'}],nurim_surveys:[{id:'one',owner_id:'a',center_id:'c1'},{id:'two',owner_id:'b',center_id:'c2'}]};
function query(name){let rows=records[name]||[];const q={select(){return q},order(){return q},eq(key,v){rows=rows.filter(r=>r[key]===v);return q},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q},single(){return Promise.resolve({data:rows[0],error:rows[0]?null:{message:'not found'}})},then(done,fail){return Promise.resolve({data:rows,error:null}).then(done,fail)}};return q;}
let handler;const db={auth:{getUser:async token=>({data:{user:records.profiles.find(p=>p.id===token)?{id:token}:null},error:null})},from:query};
const source=readFileSync(new URL('../backend/nurim-survey.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
runInNewContext(stripTypeScriptTypes(source),{validateGuardian,createClient:()=>db,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Request,Response,AbortSignal,Intl,crypto,TextEncoder,console});
async function call(token,body){const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json','x-nurim-user-token':token},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};}
const own=await call('a',{action:'list',scope:'manage'});assert.equal(own.status,200);assert.deepEqual(own.surveys.map(s=>s.id),['one']);assert.equal(own.surveys[0].center_name,'기관 A');
const all=await call('s',{action:'list',scope:'manage'});assert.equal(all.surveys.length,2);assert.equal(all.role,'super');
const defaultSuper=await call('s',{action:'list'});assert.equal(defaultSuper.surveys.length,0);
assert.equal((await call('a',{action:'load',surveyId:'two'})).status,400);
assert.equal((await call('u',{action:'list',scope:'manage'})).status,400);
assert.equal((await call('unknown',{action:'list',scope:'manage'})).status,400);
console.log('Manager isolation, super institution list and unauthorized access checks passed');
