import {validateGuardian} from "./guardian-core.mjs";
import {googleBasicApplication} from "./storage-policy.mjs";

import {createClient} from "npm:@supabase/supabase-js@2.112.4";
import {validateSchema,validateAnswers,matchingSignature} from "./survey-core.mjs";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const baseHeaders={"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-nurim-user-token","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};

const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const check=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
async function actor(req:Request){
 const token=(req.headers.get("x-nurim-user-token")||req.headers.get("authorization")||"").replace(/^Bearer /i,"");
 const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw Error("로그인이 필요합니다.");
 const p=check(await db.from("profiles").select("id,role,center_id,display_name,email,drive_folder_url").eq("id",data.user.id).single());
 if(!["manager","super"].includes(p.role))throw Error("담당자 권한이 필요합니다.");return p;
}
async function survey(id:string,a:any){
 const s=check(await db.from("nurim_surveys").select("*").eq("id",id).single());
 if(s.owner_id!==a.id&&a.role!=="super")throw Error("이 설문에 대한 권한이 없습니다.");return s;
}
async function program(id:string,a?:any){
 const p=check(await db.from("programs").select("*").eq("id",id).maybeSingle());
 if(!p)throw Error("프로그램을 찾을 수 없습니다.");
 if(a&&a.role!=="super"&&p.manager_id!==a.id)throw Error("이 프로그램에 대한 권한이 없습니다.");
 return p;
}
async function folder(owner:string,center:string){
 const p=check(await db.from("profiles").select("drive_folder_url").eq("id",owner).single());
 const c=center?check(await db.from("centers").select("drive_folder_url").eq("id",center).single()):null;
 const url=p.drive_folder_url||c?.drive_folder_url||"";
 const id=url.match(/\/folders\/([\w-]+)/)?.[1]||(/^[\w-]{15,}$/.test(url)?url:"");
 if(!id)throw Error("담당자 또는 기관의 Google Drive 폴더를 먼저 설정해 주세요.");return id;
}
async function google(action:string,payload:any){
 const url=Deno.env.get("GOOGLE_APPS_SCRIPT_URL"),secret=Deno.env.get("GOOGLE_DRIVE_WEBHOOK_SECRET");
 if(!url||!secret)throw Error("Google 연결 설정이 필요합니다.");
 const res=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,action,secret}),signal:AbortSignal.timeout(50000)});
 let data;try{data=await res.json();}catch{throw Error("Google 응답을 확인할 수 없습니다. 잠시 후 같은 신청으로 다시 시도해 주세요.");}
 if(!res.ok||!data.ok||data.protocol!=="nurim-survey-v78"){
  if(action==="nurim-survey-publish"){
   const detail=typeof data.error==="string"?data.error.split(secret).join("[비공개]").replace(/https?:\/\/[^\s]+/g,"[주소]").slice(0,500):"Google 응답 형식 또는 배포 버전을 확인해 주세요.";
   throw Error("설문 사용 준비 중 오류가 발생했습니다. 연결 점검은 폴더 접근만 확인하며, 이 단계에서는 시트와 PDF를 생성합니다. Google 오류: "+detail);
  }
  const failure=Error("Google 작업을 완료하지 못했습니다. 연결 설정과 파일 접근 권한을 확인해 주세요.");
  (failure as any).googleDetail=typeof data.error==="string"?data.error.split(secret).join("[비공개]").replace(/https?:\/\/[^\s]+/g,"[주소]").slice(0,700):"HTTP "+res.status;throw failure;
 }
 return data;
}
async function version(s:any,rev:number){return check(await db.from("nurim_survey_versions").select("*").eq("survey_id",s.id).eq("revision",rev).single());}
const digest=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))).map(v=>v.toString(16).padStart(2,"0")).join("");
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const allowed=(Deno.env.get("NURIM_ALLOWED_ORIGINS")||"").split(",").map(s=>s.trim()).filter(Boolean).includes(origin);
 const headers={...baseHeaders,Vary:"Origin",...(allowed?{"Access-Control-Allow-Origin":origin}:{})};
 const result=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!allowed)return result({ok:false,error:"허용되지 않은 사이트입니다."},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return result({ok:false,error:"POST only"},405);
 try{
  const raw=await req.text();if(raw.length>15000000)throw Error("요청이 너무 큽니다.");
  const b=JSON.parse(raw),action=b.action;
  if(action==="public"){
   const p=await program(b.programId);
   if(!p.published||p.hidden_from_public||!p.survey_id)throw Error("현재 신청할 수 없는 프로그램입니다.");
   const s=check(await db.from("nurim_surveys").select("*").eq("id",p.survey_id).single());
   if(!s.published_revision)throw Error("아직 배포되지 않은 설문입니다.");
   let rev=s.published_revision;
   if(uuid(b.id)&&uuid(b.token)){
    const pending=check(await db.from('nurim_survey_submissions').select('*').eq('id',b.id).maybeSingle());
    if(pending&&pending.survey_id===s.id&&pending.token_hash===await digest(b.token))rev=pending.revision;
   }
   const v=await version(s,rev);
   return result({ok:true,program:{id:p.id,title:p.title,start:p.start_date,end:p.end_date,contact:p.contact_phone},surveyId:s.id,revision:v.revision,schema:v.schema});
  }
  if(action==="submit"){
   if(!uuid(b.id)||!uuid(b.token))throw Error("신청 확인번호를 확인해 주세요.");
   const p=await program(b.programId);
   if(!p.published||p.hidden_from_public||!p.survey_id)throw Error("현재 신청할 수 없는 프로그램입니다.");
   const s=check(await db.from("nurim_surveys").select("*").eq("id",p.survey_id).single());
   const previous=check(await db.from("nurim_survey_submissions").select("*").eq("id",b.id).maybeSingle());
   const tokenHash=await digest(b.token);
   if(previous&&(previous.token_hash!==tokenHash||previous.survey_id!==s.id))throw Error("신청 확인번호가 올바르지 않습니다.");
   const rev=previous?.revision||s.published_revision;
   if(!rev||Number(b.revision)!==rev)throw Error("설문이 업데이트되었습니다. 창을 다시 열어 작성해 주세요.");
   if(previous?.completed_at)return result({ok:true,id:b.id,duplicate:true});
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date());
   if(!previous&&(today<p.start_date||today>p.end_date))throw Error("신청 기간이 아닙니다.");
   const v=await version(s,rev);
   const answers=validateAnswers(v.schema,b.basic,b.answers);
   const extra=b.extra||{};
   if(typeof extra.signature!=="string"||extra.signature.length>200||typeof extra.note!=="string"||extra.note.length>10000||typeof extra.participantType!=="string"||extra.participantType.length>100)throw Error("기본 신청 내용을 다시 확인해 주세요.");
   const consentItems=(p.consent_items||[]).filter((x:any)=>x.enabled!==false);
   const consentKeys=consentItems.flatMap((x:any)=>x.type==="matrix"?(x.rows||[]).map((r:any)=>r.id):[x.id]);
   if(consentKeys.length&&(!extra.signature.trim()||consentKeys.some((key:string)=>!["agree","disagree"].includes(extra.consentResponses?.[key]))))throw Error("개인정보 동의 항목과 서명을 확인해 주세요.");
   if(consentKeys.length&&!matchingSignature(b.basic.name,extra.signature))throw Error("전자서명은 신청자 이름과 같아야 합니다.");
   const guardian=validateGuardian(b.basic.birth,extra.guardian);
   if(guardian&&!matchingSignature(b.basic.name,extra.signature))throw Error("아동의 신청자 서명도 신청자 이름과 같아야 합니다.");
   const cleanExtra={signature:extra.signature,consentItems,consentResponses:Object.fromEntries(consentKeys.map((key:string)=>[key,extra.consentResponses[key]]))};
   let file=null;
   if(p.form_enabled){const f=b.file;if(!f||typeof f.name!=="string"||! /\.(pdf|hwp|hwpx|doc|docx|jpg|jpeg|png|webp|heic|heif|zip)$/i.test(f.name)||f.name.length>200||typeof f.dataUrl!=="string"||f.dataUrl.length>14000000||!/^data:[^;,]*;base64,[A-Za-z0-9+/=]+$/.test(f.dataUrl))throw Error("10MB 이하의 신청서 파일을 첨부해 주세요.");if(f.dataUrl.split(",")[1].length*3/4>10*1024*1024+2)throw Error("첨부 파일은 10MB 이하여야 합니다.");file={name:f.name,mimeType:String(f.type||"application/octet-stream").slice(0,100),base64:f.dataUrl.split(",")[1]};}

   const targetFolderId=await folder(s.owner_id,s.center_id);
   // Fail before reserving a basic record when the new Apps Script is not deployed.
   const readiness=await google("nurim-survey-health",{targetFolderId});
   if(!readiness.capabilities?.includes("application-extras-v87"))throw Error("관리자가 Google Drive 연결 스크립트를 v87로 업데이트해야 신청을 받을 수 있습니다.");
   if(previous){const prior=check(await db.from("applications").select("applicant_name,phone,birth_date,program_id").eq("id",b.id).single());if(prior.program_id!==p.id||prior.applicant_name.trim()!==b.basic.name.trim()||prior.phone.replace(/\D/g,"")!==b.basic.phone.replace(/\D/g,"")||prior.birth_date!==b.basic.birth)throw Object.assign(Error("이전 신청과 기본정보가 다릅니다."),{code:"APPLICATION_IDENTITY_MISMATCH"});b.basic={name:prior.applicant_name,phone:prior.phone,birth:prior.birth_date};}
   const app=check(await db.rpc("nurim_reserve_survey",{p_id:b.id,p_program:p.id,p_survey:s.id,p_revision:rev,p_token:tokenHash,p_basic:{...b.basic,signature:cleanExtra.signature,guardian}}));
   check(await db.from("applications").update({privacy_agree:consentKeys.length>0,signature:cleanExtra.signature,consent_responses:cleanExtra.consentResponses,base_consent_snapshot:consentItems,consent_version:"base-v90",privacy_agreed_at:app.created_at}).eq("id",b.id));
   let g;try{g=await google("nurim-survey-submit",{targetFolderId,surveyId:s.id,revision:rev,schema:v.schema,file,program:{id:p.id,title:p.title},record:{id:b.id,created_at:app.created_at,name:app.applicant_name,phone:app.phone,birth:app.birth_date,status:app.application_status,queue:app.queue_number,program_id:p.id,program_title:p.title,answers}});}catch(e){const detail=String((e as any).googleDetail||(e as Error).message).slice(0,1000);await db.from("applications").update({drive_sync_status:"failed",drive_error:detail}).eq("id",b.id);throw Error("제출을 완료하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 제출해 주세요.");}
   check(await db.from("applications").update({drive_sync_status:"synced",drive_folder_url:g.folderUrl,drive_roster_sheet_url:g.sheetUrl,drive_synced_at:new Date().toISOString(),drive_error:null}).eq("id",b.id));
   check(await db.from("nurim_survey_submissions").update({completed_at:new Date().toISOString()}).eq("id",b.id));
   return result({ok:true,id:b.id,status:app.application_status,queue:app.queue_number});
  }

  if(action==="sync"){
   if(!uuid(b.applicationId))throw Error("신청번호를 확인해 주세요.");
   const app=check(await db.from("applications").select("*").eq("id",b.applicationId).single());
   if(!app.survey_response)throw Error("통합 설문 신청이 아닙니다.");
   if(b.force){const a=await actor(req);await program(app.program_id,a);}
   else {
    const identity=b.identity||{};
    if(String(identity.name||"").trim().toLowerCase()!==app.applicant_name.trim().toLowerCase()
     ||identity.birth!==app.birth_date||!/^\d{4}$/.test(identity.last4||"")
     ||identity.last4!==app.phone.replace(/\D/g,"").slice(-4))throw Error("신청자 확인정보가 일치하지 않습니다.");
   }
   const meta=check(await db.from("nurim_survey_submissions").select("*").eq("id",app.id).single());
   if(!meta.completed_at)throw Error("Google 원본 저장이 완료되지 않았습니다. 신청 창에서 같은 내용으로 다시 제출해 주세요.");
   const s=check(await db.from("nurim_surveys").select("*").eq("id",meta.survey_id).single());
   const g=await google("nurim-survey-sync-basic",{targetFolderId:await folder(s.owner_id,s.center_id),surveyId:s.id,revision:meta.revision,application:googleBasicApplication(app)});
   check(await db.from("applications").update({drive_sync_status:"synced",drive_synced_at:new Date().toISOString(),drive_folder_url:g.folderUrl,drive_roster_sheet_url:g.sheetUrl,drive_error:null}).eq("id",app.id));
   return result({ok:true});
  }
  const a=await actor(req);
  if(action==="list"){
   let q=db.from("nurim_surveys").select("*").order("updated_at",{ascending:false});
   // Normal view is always the current manager's surveys, including super users.
   if(a.role!=='super'||b.scope!=='manage')q=q.eq('owner_id',a.id);
   const rows=check(await q);
   const owners=[...new Set(rows.map((s:any)=>s.owner_id))],centers=[...new Set(rows.map((s:any)=>s.center_id).filter(Boolean))];
   const profiles=owners.length?check(await db.from('profiles').select('id,display_name').in('id',owners)):[];
   const institutions=centers.length?check(await db.from('centers').select('id,name').in('id',centers)):[];
   return result({ok:true,role:a.role,surveys:rows.map((s:any)=>({...s,owner_name:profiles.find((p:any)=>p.id===s.owner_id)?.display_name||'담당자',center_name:institutions.find((c:any)=>c.id===s.center_id)?.name||''}))});
  }
  if(action==="health")return result(await google("nurim-survey-health",{targetFolderId:await folder(a.id,a.center_id)}));
  if(action==="save"){
   const schema=validateSchema(b.schema);
   const id=b.id||crypto.randomUUID();if(!uuid(id))throw Error("설문 ID를 확인해 주세요.");
   if(b.id)await survey(id,a);
   const s=check(await db.rpc("nurim_save_survey",{p_id:id,p_owner:a.id,p_center:a.center_id,p_schema:schema,p_revision:Number(b.revision||0),p_name:a.display_name||a.email}));
   return result({ok:true,survey:s});
  }
  const s=await survey(b.surveyId,a);
  if(action==="load"){
   const versions=check(await db.from("nurim_survey_versions").select("revision,saved_at,saved_name,drive_pdf_url,drive_folder_url").eq("survey_id",s.id).order("revision",{ascending:false}));
   const v=await version(s,b.revision||s.revision);
   return result({ok:true,survey:s,version:v,versions});
  }
  if(action==="publish"){
   if(b.revision!==s.revision)throw Error("최신 저장본을 다시 불러와 주세요.");
   const v=await version(s,s.revision);
   const g=await google("nurim-survey-publish",{targetFolderId:await folder(s.owner_id,s.center_id),surveyId:s.id,revision:s.revision,schema:v.schema});
   check(await db.from("nurim_survey_versions").update({drive_pdf_url:g.pdfUrl,drive_folder_url:g.folderUrl}).eq("survey_id",s.id).eq("revision",s.revision));
   const updated=check(await db.from("nurim_surveys").update({published_revision:s.revision}).eq("id",s.id).eq("revision",s.revision).select());
   if(!updated.length)throw Error("다른 담당자가 수정했습니다. 최신 저장본으로 다시 배포해 주세요.");
   return result({ok:true,...g});
  }
  if(action==="bind"){
   const p=await program(b.programId,a);
   if(!b.remove&&(!s.published_revision||s.owner_id!==p.manager_id&&a.role!=="super"))throw Error("프로그램 담당자의 배포된 설문을 선택해 주세요.");
   // Changing the form on an existing program is explicit; old responses keep their survey/version.
   check(await db.from("programs").update({survey_id:b.remove?null:s.id}).eq("id",p.id));
   return result({ok:true});
  }
  if(action==="responses"){
   const rev=Number(b.revision||s.revision);const v=await version(s,rev);
   const g=await google("nurim-survey-responses",{targetFolderId:await folder(s.owner_id,s.center_id),surveyId:s.id,revision:rev,offset:Math.max(0,Number(b.offset)||0)});
   return result({ok:true,...g,schema:v.schema});
  }
  throw Error("지원하지 않는 작업입니다.");
 }catch(e){return result({ok:false,error:e instanceof Error?e.message:"처리하지 못했습니다.",code:(e as any)?.code==="APPLICATION_IDENTITY_MISMATCH"?"APPLICATION_IDENTITY_MISMATCH":undefined},400);}
});


