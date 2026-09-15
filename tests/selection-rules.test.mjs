import assert from 'node:assert/strict';
import {validateSchema,validateAnswers,matchingSignature,printHTML} from '../survey-core.mjs';
const basic={name:'홍길동',birth:'2000-01-01',phone:'01012345678'};
const q={id:'choice',type:'rank',label:'희망 활동',help:'',options:['A','B','C'],required:true,rankCount:2};
const schema=question=>validateSchema({title:'신청',description:'',questions:[question]});
const rank=schema(q);
assert.equal(rank.questions[0].rankCount,2);
assert.deepEqual(validateAnswers(rank,basic,{choice:['C','A']}),{choice:['C','A']});
for(const a of [[],['A'],['A','B','C'],['A','A'],['A','outside']])assert.throws(()=>validateAnswers(rank,basic,{choice:a}));
for(const rankCount of [0,4,1.5,'2'])assert.throws(()=>schema({...q,rankCount}));
const legacy=schema({...q,rankCount:undefined});validateAnswers(legacy,basic,{choice:['A']});
for(const [selectionMode,selectionCount,wanted] of [['all',undefined,3],['exact',2,2],['any',undefined,null]]){
 const s=schema({...q,type:'checkbox',selectionMode,selectionCount});
 const answers=q.options.slice(0,wanted||1);validateAnswers(s,basic,{choice:answers});
 if(wanted)assert.throws(()=>validateAnswers(s,basic,{choice:['A']}));
 const optional=schema({...s.questions[0],required:false});validateAnswers(optional,basic,{choice:[]});
 if(wanted)assert.throws(()=>validateAnswers(optional,basic,{choice:['A']}));
}
assert.throws(()=>schema({...q,type:'checkbox',selectionMode:'exact',selectionCount:4}));
assert(matchingSignature(' 홍길동 ','홍길동'));assert(!matchingSignature('홍길동','김길동'));assert(!matchingSignature('',''));
assert(printHTML(rank).includes('1~2순위'));
console.log('v94 rank counts, checkbox modes, legacy compatibility, optional answers and signature matching passed');
