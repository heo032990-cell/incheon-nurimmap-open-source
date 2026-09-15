import {validateGuardian} from "../guardian-core.mjs";
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../backend/nurim-survey.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');const ctx={createClient:()=>({}),Deno:{env:{get:k=>k==='GOOGLE_DRIVE_WEBHOOK_SECRET'?'test-secret':'https://example.invalid'},serve:()=>{}},AbortSignal,fetch:async()=>({ok:true,json:async()=>({ok:false,error:'DocumentApp permission test-secret https://private.invalid/path'})})};runInNewContext(stripTypeScriptTypes(source)+'\nglobalThis.testGoogle=google;',ctx);
await assert.rejects(ctx.testGoogle('nurim-survey-publish',{}),e=>e.message.includes('DocumentApp permission')&&!e.message.includes('test-secret')&&!e.message.includes('private.invalid'));
await assert.rejects(ctx.testGoogle('nurim-survey-submit',{}),e=>!e.message.includes('DocumentApp'));
console.log('Manager publish diagnosis with secret redaction; public error stays generic');
