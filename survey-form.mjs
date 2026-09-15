import {esc,validateAnswers,surveyPages,selectionHint} from "./survey-core.mjs?v=105";
const params=new URLSearchParams(location.search),preview=params.has("preview");
const ticketKey='nurim-survey-ticket:'+params.get('program');
let ticket=null;try{ticket=JSON.parse(sessionStorage.getItem(ticketKey)||'null');}catch{}
let pageIndex=0,pages=[],application=null;
let data,id=ticket?.id||crypto.randomUUID(),token=ticket?.token||crypto.randomUUID(),busy=false;
const root=document.querySelector("main");
async function call(action,body={}){const r=await fetch(window.INCHEON_SUPABASE.url+"/functions/v1/nurim-survey",{method:"POST",headers:{"Content-Type":"application/json",apikey:window.INCHEON_SUPABASE.publishableKey,Authorization:"Bearer "+window.NURIM_SURVEY_ANON_KEY},body:JSON.stringify({action,...body})});const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error||"처리하지 못했습니다."),{code:d.code});return d;}
function field(q){
 if(q.type==='checkbox'&&q.options?.length===1&&q.options[0]==='동의합니다')q={...q,selectionMode:'any'};
 const req=q.required?" required":"",name="answer_"+q.id;
 const titleId=name+"_title",helpId=name+"_help",hintId=name+"_hint";
 const descriptions=[q.help?helpId:"",selectionHint(q)?hintId:""].filter(Boolean).join(" ");
 const described=descriptions?' aria-describedby="'+esc(descriptions)+'"':"";
 const labelled=' aria-labelledby="'+esc(titleId)+'"'+described;
 const choices=q.type==="consent"?[["agree","동의"],["disagree","미동의"]]:(q.options||[]).map(v=>[v,v]);
 const opts='<option value="">선택</option>'+choices.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join("");
 let html;
 if(q.type==="notice")html="";
 else if(q.type==="textarea")html='<textarea name="'+name+'"'+labelled+req+' maxlength="10000"></textarea>';
 else if(q.type==="select")html='<select name="'+name+'"'+labelled+req+'>'+opts+'</select>';
 else if(q.type==="rank")html=q.options.slice(0,q.rankCount||q.options.length).map((v,i)=>'<label><span id="'+name+'_rank_'+i+'">'+(i+1)+'순위</span><select name="'+name+'" aria-labelledby="'+esc(titleId)+' '+name+'_rank_'+i+'"'+described+(q.rankCount?req:i===0?req:"")+'>'+opts+'</select></label>').join("");
 else if(["radio","checkbox","consent"].includes(q.type))html=choices.map(([v,l])=>'<label class="choice"><input type="'+(q.type==="checkbox"?"checkbox":"radio")+'" name="'+name+'" value="'+esc(v)+'"'+described+(q.type!=="checkbox"?req:"")+'> '+esc(l)+'</label>').join("");
 else html='<input name="'+name+'" type="'+(q.type==="date"?"date":"text")+'"'+labelled+req+' maxlength="10000">';
 return '<fieldset><legend id="'+esc(titleId)+'">'+esc(q.label)+(q.required?' <span aria-label="필수">*</span>':"")+'</legend>'+(q.help?'<p id="'+esc(helpId)+'">'+esc(q.help)+'</p>':"")+(selectionHint(q)?'<p id="'+esc(hintId)+'" class="selectionHint">'+esc(selectionHint(q))+'</p>':'')+html+'</fieldset>';
}
function render(){
 if(!preview&&!application){root.textContent="프로그램 신청 화면에서 기본정보를 먼저 작성해 주세요.";return;}
 const s=data.schema;pages=surveyPages(s);pageIndex=preview?Math.min(pageIndex,pages.length-1):0;
 root.innerHTML='<h1>'+esc(s.title)+'</h1>'+(data.program?'<p>'+esc(data.program.title)+'</p>':"")+'<p>'+esc(s.description)+'</p>'+(preview?'<p class="notice">미리보기입니다. 입력 내용은 전송되지 않습니다.</p>':"")+'<form novalidate><p id="pageProgress" role="status"></p><div class="surveyPage" data-page="0"><fieldset class="basic"'+' hidden'+'><legend>신청 기본정보 · 한 번만 입력</legend><label>이름 *<input name="name" autocomplete="name" required maxlength="80"></label><label>생년월일 *<input name="birth" id="surveyBirth" type="date" required></label><label>연락처 *<input name="phone" type="tel" autocomplete="tel" required maxlength="24"></label></fieldset>'+pages[0].map(field).join("")+'</div>'+pages.slice(1).map((qs,i)=>'<div class="surveyPage" data-page="'+(i+1)+'" hidden>'+qs.map(field).join('')+'</div>').join('')+'<p role="status" id="status"></p><div class="pageNavigation"><button type="button" id="previousPage">이전</button><button type="button" id="nextPage">다음</button><button type="submit">'+(preview?"입력 내용 검증":"신청서 제출")+'</button></div></form>';
 root.querySelector("form").onsubmit=submit;
 root.querySelector("form").addEventListener('input',event=>{
  if(!event.target.name)return;
  for(const control of root.querySelectorAll('[aria-invalid]'))if(control.name===event.target.name){
   control.removeAttribute('aria-invalid');
   const ids=(control.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='status');
   if(ids.length)control.setAttribute('aria-describedby',ids.join(' '));else control.removeAttribute('aria-describedby');
  }
 });
 root.querySelector("#previousPage").onclick=()=>{if(!busy){if(pageIndex===0){parent.postMessage({type:'nurim-back'},location.origin);}else{pageIndex--;showPage();}}};
 root.querySelector("#nextPage").onclick=()=>{if(!busy&&checkPage()){pageIndex++;showPage();}};
 showPage(!preview);
}
function values(f,questions){
 const answers={};for(const q of questions){
  if(q.type==='notice')continue;
  const controls=[...f.querySelectorAll('[name="answer_'+q.id+'"]')];
  if(q.type==='rank'){const vals=controls.map(x=>x.value),gap=vals.indexOf('');if(gap>=0&&vals.slice(gap+1).some(Boolean))throw Error(q.label+': 1순위부터 빈칸 없이 선택해 주세요.');}
  answers[q.id]=q.type==='checkbox'?controls.filter(x=>x.checked).map(x=>x.value):q.type==='rank'?controls.map(x=>x.value).filter(Boolean):['radio','consent'].includes(q.type)?controls.find(x=>x.checked)?.value||'':controls[0].value;
 }return answers;
}
function basics(f){if(application)return application.basic;if(preview)return {name:'미리보기',birth:'2000-01-01',phone:'01000000000'};return {name:f.elements.namedItem('name').value.trim(),birth:f.elements.namedItem('birth').value,phone:f.elements.namedItem('phone').value.trim()};}
function showPage(focus=true){
 root.querySelectorAll('.surveyPage').forEach((el,i)=>{el.hidden=i!==pageIndex;});
 root.querySelector('#pageProgress').textContent=(pageIndex+1)+' / '+pages.length+' 설문 페이지';
 root.querySelector('#previousPage').hidden=pageIndex===0&&(preview||parent===window);
 root.querySelector('#previousPage').textContent=pageIndex===0?'이전: 신청정보·동의':'이전 설문 페이지';
 root.querySelector('#nextPage').hidden=pageIndex===pages.length-1;
 root.querySelector('button[type="submit"]').hidden=pageIndex!==pages.length-1;
 root.querySelector('#status').textContent='';
 const panel=root.querySelector('[data-page="'+pageIndex+'"]');panel.tabIndex=-1;
 panel.setAttribute('role','group');panel.setAttribute('aria-label',(pageIndex+1)+' / '+pages.length+' 설문 페이지');
 if(focus){panel.focus();window.scrollTo({top:0,behavior:'auto'});}
}
function checkPage(){
 const f=root.querySelector('form'),panel=f.querySelector('[data-page="'+pageIndex+'"]');
 try{
  for(const input of panel.querySelectorAll('input,select,textarea')){if(input.closest('[hidden]'))continue;if(!input.checkValidity()){input.reportValidity();return false;}}
  validateAnswers({...data.schema,questions:pages[pageIndex]},basics(f),values(f,pages[pageIndex]));return true;
 }catch(e){
  const status=f.querySelector('#status');status.textContent=e.message;
  const question=pages[pageIndex].find(q=>e.message.startsWith(q.label+':'));
  const control=question&&[...panel.querySelectorAll('input,select,textarea')].find(el=>el.name==='answer_'+question.id);
  if(control){control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',((control.getAttribute('aria-describedby')||'')+' status').trim());control.focus();}
  else{status.tabIndex=-1;status.focus();}
  return false;
 }
}
async function submit(e){
 e.preventDefault();if(busy)return;
 if(pageIndex<pages.length-1){if(checkPage()){pageIndex++;showPage();}return;}
 if(!checkPage())return;
 const f=e.target,basic=basics(f);let answers;
 try{answers=values(f,data.schema.questions);}catch(err){f.querySelector('#status').textContent=err.message;return;}
 const status=f.querySelector("#status"),button=f.querySelector('button[type="submit"]');
 try{
  validateAnswers(data.schema,basic,answers);
  if(preview){status.textContent="입력 내용을 확인했습니다. 실제 저장은 하지 않았습니다.";return;}
  busy=true;button.disabled=true;status.textContent="신청서를 제출하고 있습니다. 잠시만 기다려 주세요.";
  const signature=JSON.stringify([basic.name.trim(),basic.birth,basic.phone.replace(/\D/g,'')]);
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(ticket?.fingerprint&&ticket.fingerprint!==fingerprint){id=crypto.randomUUID();token=crypto.randomUUID();}
  ticket={id,token,fingerprint};try{sessionStorage.setItem(ticketKey,JSON.stringify(ticket));}catch{}
  let recovered=false,retried=false;
  while(true){try{await call("submit",{programId:data.program.id,revision:data.revision,basic,answers,id,token,extra:application.extra,file:application.file});break;}catch(error){
   if(error.code==="APPLICATION_IDENTITY_MISMATCH"&&!recovered){recovered=true;id=crypto.randomUUID();token=crypto.randomUUID();ticket={id,token,fingerprint};try{sessionStorage.setItem(ticketKey,JSON.stringify(ticket));}catch{}continue;}
   if(!retried&&(error instanceof TypeError||/잠시 후|제출을 완료하지 못/.test(error.message))){retried=true;status.textContent="접수 상태를 확인하고 있습니다. 잠시만 기다려 주세요.";await new Promise(resolve=>setTimeout(resolve,1200));continue;}
   throw error;
  }};
  try{sessionStorage.removeItem(ticketKey);}catch{}
  application=null;
  root.innerHTML='<section class="surveySuccess"><div class="successMark" aria-hidden="true">✓</div><h1>제출이 완료되었습니다.</h1><button id="confirmComplete" type="button">확인</button></section>';
  document.querySelector('#confirmComplete').onclick=()=>{if(parent!==window)parent.postMessage({type:'nurim-complete'},location.origin);else location.href='/';};document.querySelector('#confirmComplete').focus();

 }catch(err){if(err.code==="APPLICATION_IDENTITY_MISMATCH"){id=crypto.randomUUID();token=crypto.randomUUID();ticket=null;try{sessionStorage.removeItem(ticketKey);}catch{}status.textContent="기본정보를 새로 확인했습니다. 입력 내용은 유지됩니다. 신청서 제출을 다시 눌러 주세요.";}else status.textContent=err.message;button.disabled=false;}finally{busy=false;}
}
window.addEventListener("message",e=>{if(!preview&&e.origin===location.origin&&e.source===parent&&e.data?.type==="nurim-application-update"){application=e.data.application;return;}if(!preview&&e.origin===location.origin&&e.source===parent&&e.data?.type==="nurim-application"){application=e.data.application;if(data)render();return;}if(preview&&e.origin===location.origin&&e.source===parent&&e.data?.type==="nurim-preview"){data={schema:e.data.schema};render();}});
if(!preview)call("public",{programId:params.get("program"),id,token}).then(d=>{data=d;render();}).catch(e=>{root.textContent=e.message;});
