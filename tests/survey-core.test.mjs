import assert from 'node:assert/strict';
import {validateSchema,validateAnswers,validDate,csv,printHTML} from '../survey-core.mjs';
const q={id:'q1',type:'rank',label:'희망 순위',help:'',required:true,options:['오전','오후']};
const s={title:'시험',description:'',questions:[q]};
const b={name:'테스트',birth:'2000-02-29',phone:'010-0000-0000'};
assert(validDate(b.birth));assert(!validDate('2001-02-29'));
validateSchema(s);validateAnswers(s,b,{q1:['오후','오전']});
assert.throws(()=>validateAnswers(s,b,{q1:['오전','오전']}));
assert.throws(()=>validateAnswers(s,b,{q1:['외부값']}));
assert.throws(()=>validateAnswers(s,b,{q1:[]}));
const consent={...q,type:'consent',blockRefusal:false};const sc={...s,questions:[consent]};
validateAnswers(sc,b,{q1:'disagree'});assert.throws(()=>validateSchema({...s,questions:[{...consent,blockRefusal:true}]}));
const payload=validateAnswers(s,b,{q1:['오후'],arbitrary:'not stored'});assert(!('arbitrary' in payload));
const text=csv(s,[{id:'1',name:'=HYPERLINK("bad")',birth:b.birth,answers:{q1:['오후']}}]);assert(text.includes("'=HYPERLINK"));
assert(printHTML({...s,title:'<script>x</script>'}).includes('&lt;script&gt;'));assert(printHTML(s).includes('______년 ___월 ___일'));
console.log('11 response, date, consent, export safety assertions passed');


// Promotion schedules must populate date controls without inventing a missing year.
const {readFileSync}=await import('node:fs');
const {runInNewContext}=await import('node:vm');
const scheduleWindow={};runInNewContext(readFileSync(new URL('../program-fields.js',import.meta.url),'utf8'),{window:scheduleWindow});
for(const text of ['활동기간: 2026년 9월 16일 ~ 2026년 10월 14일','실제 운영일정: 2026.9.16 ~ 10.14','일시: 2026/9/16 ~ 10/14']){
 const p=scheduleWindow.nurimParseSchedule(text);assert.equal(p.start,'2026-09-16');assert.equal(p.end,'2026-10-14');
}
assert.equal(scheduleWindow.nurimParseSchedule('활동기간: 9월 16일 ~ 10월 14일').start,'');
assert.equal(scheduleWindow.nurimParseSchedule('활동기간: 2026년 2월 30일').start,'');
assert.equal(scheduleWindow.nurimParseSchedule('매주 수요일 2026년 9월 16일 10:00').detail,'매주 수요일 10:00');
console.log('Activity period date formats, missing-year and invalid-date checks passed');
