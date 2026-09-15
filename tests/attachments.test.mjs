import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context={window:{},document:{querySelector:()=>null},File,TextEncoder,Uint32Array,Uint8Array,DataView};vm.runInNewContext(fs.readFileSync(new URL('../application-file-upload.js',import.meta.url),'utf8'),context);
const originals=Array.from({length:10},(_,i)=>new File([new Uint8Array([i,255,0,42])],['신청서.pdf','증빙.hwp','가족.hwpx','자료.doc','자료.docx','사진.jpg','사진.png','사진.webp','증명.heic','묶음.zip'][i],{type:'application/octet-stream',lastModified:1}));
const packed=await context.window.prepareApplicationUploadFiles(originals);assert.match(packed.name,/v101_10.zip$/);const base64=Buffer.from(await packed.arrayBuffer()).toString('base64');
const stored=new Map();const folder={getFilesByName:name=>({hasNext:()=>stored.has(name),next:()=>stored.get(name)}),createFile:b=>{const f={getUrl:()=>b.name};stored.set(b.name,{...f,bytes:b.bytes});return f}};
const gas={PropertiesService:{getScriptProperties:()=>({getProperty:()=>""})},Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob:(bytes,mime,name)=>({bytes,mime,name,getDataAsString:()=>Buffer.from(bytes).toString('utf8')})}};vm.runInNewContext(fs.readFileSync(new URL('../backend/google-apps-script.gs',import.meta.url),'utf8'),gas);
const payload={name:packed.name,mimeType:packed.type,base64};const parts=gas.nurimAttachmentParts_(payload);assert.equal(parts.length,10);for(let i=0;i<10;i++)assert.deepEqual(Array.from(parts[i].bytes),Array.from(new Uint8Array(await originals[i].arrayBuffer())));
assert.equal(gas.nurimSaveAttachments_(folder,payload,'신청자_id_').length,10);gas.nurimSaveAttachments_(folder,payload,'신청자_id_');assert.equal(stored.size,10);
await assert.rejects(context.window.prepareApplicationUploadFiles([...originals,originals[0]]),/10개/);await assert.rejects(context.window.prepareApplicationUploadFiles([new File([new Uint8Array(10*1024*1024+1)],'큰파일.pdf')]),/10MB/);
const zip=new File(['unchanged'],'증빙.zip');assert.equal(await context.window.prepareApplicationUploadFiles([zip]),zip);assert.equal(gas.nurimAttachmentParts_({name:'증빙.zip',base64:Buffer.from('unchanged').toString('base64')}).length,1);
const broken=Buffer.from(base64,'base64');broken[broken.readUInt16LE(26)+30]^=1;assert.throws(()=>gas.nurimAttachmentParts_({...payload,base64:broken.toString('base64')}),/손상/);
assert.throws(()=>gas.nurimAttachmentParts_({...payload,name:'__nurim_attachments_v101_9.zip'}),/개수/);
console.log('10 mixed originals preserved byte-for-byte, independent storage, retry dedupe, ordinary ZIP, count/size/corruption guards passed');

