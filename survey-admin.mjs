import {esc,types,validateSchema,csv,printHTML,matchingSignature} from "./survey-core.mjs?v=105";
const db=window.incheonSupabase;
const flags=window.NURIM_FEATURES||{survey:true,charts:true,programAddress:true};
let sessionGeneration=0,bindingRequest=0,activeQuestion=0,surveyRole="manager",centerChoice="",managerChoice="";
let list=[],current=null,revision=0,saved=null,dirty=false,loadedUser=null,viewRows=[];
async function api(action,body={}){const generation=sessionGeneration;const {data:{session}}=await db.auth.getSession();const r=await fetch(window.INCHEON_SUPABASE.url+"/functions/v1/nurim-survey",{method:"POST",headers:{"Content-Type":"application/json",apikey:window.INCHEON_SUPABASE.publishableKey,Authorization:"Bearer "+window.NURIM_SURVEY_ANON_KEY,...(session?{"x-nurim-user-token":session.access_token}:{})},body:JSON.stringify({action,...body})});const d=await r.json();if(generation!==sessionGeneration)throw Error("로그인 상태가 변경되었습니다.");if(!r.ok||!d.ok)throw Error(d.error||"처리하지 못했습니다.");return d;}
function download(text,name,type){const a=document.createElement("a"),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function print(s,r){const w=window.open("","_blank");if(!w)return alert("인쇄 미리보기를 열도록 팝업을 허용해 주세요.");w.document.write(printHTML(s,r));w.document.close();}
const section=document.createElement("section");section.id="surveyManage";section.className="hidden";document.querySelector("#adminPanel").append(section);
const tab=document.createElement("button");tab.type="button";tab.dataset.tab="surveyManage";tab.textContent="설문 관리";document.querySelector("#adminPanel .tabs").append(tab);
const originalTab=switchAdminTab;
switchAdminTab=function(id){if(dirty&&id!=="surveyManage"&&!confirm("저장하지 않은 설문 수정이 있습니다. 다른 메뉴로 이동할까요?"))return;originalTab(id);section.classList.toggle("hidden",id!=="surveyManage");if(id==="surveyManage")refresh().catch(showError);};
tab.hidden=flags.survey===false;tab.onclick=()=>switchAdminTab("surveyManage");
function showError(e){alert(e.message||String(e));}
const binding=document.createElement("section");binding.id="nurimSurveyBindingPanel";binding.className="adminGoogleFormBox";binding.innerHTML='<h3>추가 설문 연결 (선택)</h3><p>기본 신청과 개인정보 동의 외에 질문이 필요할 때만 연결하세요. 신청서 파일 제출은 아래에서 별도로 선택할 수 있습니다.</p><label>신청 설문 <select id="nurimSurveyBinding"><option value="">추가 설문 없음</option></select></label><p id="nurimProgramAddress"></p>';
document.querySelector('#programApplicationStep .wizardStepTitle').after(binding);
const legacyBoxes=[...document.querySelectorAll('#programApplicationStep > .adminConsentBox,#programApplicationStep > .adminGoogleFormBox,#programApplicationStep > .adminFileBox')].filter(x=>x!==binding);legacyBoxes.forEach(x=>x.classList.toggle('legacyApplicationSettings',x.classList.contains('adminGoogleFormBox')));
binding.insertAdjacentHTML('beforeend','<div class="bindingActions"><button type="button" id="openSurveyBuilder">설문 만들기·관리</button><button type="button" id="reloadSurveyChoices">목록 새로고침</button></div><p id="surveyBindingStatus" role="status"></p>');
document.querySelector('#openSurveyBuilder').onclick=()=>switchAdminTab('surveyManage');document.querySelector('#reloadSurveyChoices').onclick=()=>refreshBinding();
const select=binding.querySelector("select");let bindingWanted="";
async function refreshBinding(){
 const request=++bindingRequest,value=bindingWanted;select.disabled=true;
 try{const response=await api("list",{scope:"manage"});surveyRole=response.role||"manager";const next=response.surveys;if(request!==bindingRequest)return;list=next;select.innerHTML='<option value="">추가 설문 없음</option>'+list.filter(s=>s.published_revision&&(!editingId||!programs.find(p=>p.id===editingId)?.managerId||s.owner_id===programs.find(p=>p.id===editingId)?.managerId)).map(s=>'<option value="'+s.id+'">'+esc((surveyRole==='super'?(s.center_name||'미지정')+' · '+(s.owner_name||'담당자')+' · ':'')+s.title)+'</option>').join("");
 if(value&&!list.some(s=>s.id===value)){const o=new Option("현재 연결된 설문 (다른 담당자 관리)",value);select.append(o);}
 select.value=value;select.disabled=false;document.querySelector("#surveyBindingStatus").textContent=list.some(s=>s.published_revision)?"선택한 설문이 프로그램 신청 화면에 표시됩니다.":"추가 설문 없이도 신청을 받을 수 있습니다. 설문을 연결하려면 먼저 신청에 사용을 눌러 주세요.";
 }catch(e){if(request!==bindingRequest)return;select.innerHTML='<option value="'+esc(value)+'">설문 목록을 불러오지 못했습니다</option>';select.value=value;}
}
const oldFill=fillProgram;fillProgram=function(p){oldFill(p);bindingWanted=p.surveyId||"";refreshBinding();};
const oldReset=resetProgramForm;resetProgramForm=function(){oldReset();bindingWanted="";select.value="";};
select.onchange=()=>{bindingWanted=select.value;const item=list.find(s=>s.id===bindingWanted);document.querySelector('#surveyBindingStatus').textContent=item?'신청서: '+item.title+(surveyRole==='super'?' · 담당자: '+(item.owner_name||'미지정'):''):'';};
document.querySelector('[data-tab="programCreate"]').addEventListener("click",()=>refreshBinding());
window.NurimSurvey={api,selected:()=>bindingWanted,selection:()=>list.find(s=>s.id===bindingWanted),refreshBinding};
document.querySelector("#goApplicationSettings").addEventListener("click",refreshBinding);
document.addEventListener("submit",event=>{if(event.target.id!=="programForm")return;const existing=editingId&&programs.find(p=>p.id===editingId);if(bindingWanted){const chosen=list.find(s=>s.id===bindingWanted);if(chosen&&surveyRole==="super"&&chosen.center_name&&document.querySelector("#centerName").value.trim()!==chosen.center_name){event.preventDefault();event.stopImmediatePropagation();alert("프로그램 복지관과 설문 소속 기관이 다릅니다. 같은 기관의 설문을 선택해 주세요.");return;}["#googleFormUrl","#googleFormTokenEntry","#googleFormResponseSheetId"].forEach(id=>{const el=document.querySelector(id);if(el)el.value="";});}},true);
async function refresh(){
 const {data:{session}}=await db.auth.getSession();
 if(!session)throw Error("로그인이 필요합니다.");
 if(loadedUser!==session.user.id){loadedUser=session.user.id;current=null;saved=null;dirty=false;centerChoice="";managerChoice="";}
 const result=await api("list",{scope:"manage"});list=result.surveys;surveyRole=result.role||"manager";
 if(!current)renderList();
 refreshBinding();
}
function renderList(){
 current=null;dirty=false;
 const centers=[...new Set(list.map(s=>s.center_name||'기관 미지정'))].sort();
 const managers=[...new Map(list.filter(s=>!centerChoice||(s.center_name||'기관 미지정')===centerChoice).map(s=>[s.owner_id,s.owner_name||'담당자'])).entries()];
 const rows=list.filter(s=>(!centerChoice||(s.center_name||'기관 미지정')===centerChoice)&&(!managerChoice||s.owner_id===managerChoice));
 section.innerHTML='<h3>'+(surveyRole==='super'?'기관별 설문 관리':'내 설문 목록')+'</h3><p>설문을 선택해 문항·배포·응답을 함께 관리합니다. 복사는 응답을 가져오지 않습니다.</p><div class="formActions"><button data-action="new">새 설문 만들기</button><button data-action="health">연결 점검</button></div>'+(surveyRole==='super'?'<div class="surveyFilters"><label>기관<select id="surveyCenterFilter"><option value="">전체 기관</option>'+centers.map(c=>'<option'+(c===centerChoice?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label><label>담당자<select id="surveyManagerFilter"><option value="">전체 담당자</option>'+managers.map(([id,name])=>'<option value="'+id+'"'+(id===managerChoice?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label></div>':'')+'<p>'+rows.length+'개 설문</p><div class="surveyList">'+(rows.length?rows.map(s=>'<article class="row"><strong>'+esc(s.title)+'</strong><p>'+esc(s.center_name||'기관 미지정')+' · '+esc(s.owner_name||'담당자')+'</p><p>수정 '+s.revision+'회 · '+(s.published_revision?'신청용 배포 완료':'저장만 완료')+'</p><button data-action="load" data-id="'+s.id+'">열기</button><button data-action="copy" data-id="'+s.id+'">복사</button></article>').join(''):'<p>설문이 없습니다.</p>')+'</div>';
 section.querySelector('#surveyCenterFilter')?.addEventListener('change',e=>{centerChoice=e.target.value;managerChoice='';renderList();});
 section.querySelector('#surveyManagerFilter')?.addEventListener('change',e=>{managerChoice=e.target.value;renderList();});
}
function seed(){return {title:"새 프로그램 신청서",description:"",questions:[]};}
async function load(id,copy=false,rev){
 const d=await api("load",{surveyId:id,revision:rev});
 current=copy?{id:null,revision:0}:d.survey;revision=copy?0:d.version.revision;saved=structuredClone(d.version.schema);if(copy)saved.title+=" (복사)";
 dirty=copy;activeQuestion=0;renderEditor(d.versions);
}
function renderEditor(history=[]){
 normalizePages();
 section.innerHTML='<div class="formActions"><button data-action="list">설문 목록</button><strong>'+esc(saved.title)+'</strong><span id="surveySaveState">'+(dirty?"저장 전":"저장본 "+revision)+'</span></div><div class="surveyAdminGuide surveyStartGuide" role="note"><p><strong>기본정보는 한 번만 받습니다.</strong> 신청 첫 단계에서 입력한 이름·생년월일·연락처가 신청서와 신청명단에 함께 반영됩니다. 이 설문에는 필요한 추가 질문만 만드세요.</p></div><div class="surveyContext"><label>설문 제목<input id="surveyTitle" maxlength="200" value="'+esc(saved.title)+'"></label><label>설문 안내<textarea id="surveyDescription">'+esc(saved.description)+'</textarea></label></div><div class="surveyEditorLayout"><div id="surveyQuestions"></div><aside class="surveySideTools" aria-label="문항 도구"><button data-action="add">＋ 문항 추가</button><button data-action="addPage">＋ 페이지 추가</button><button data-action="copyQuestion">문항 복사</button><button data-action="collapse">모두 접기</button></aside></div><div class="surveyMainActions"><button data-action="save" class="primary">저장</button><button data-action="preview">미리보기</button><button data-action="print">인쇄 / PDF</button><button data-action="publish">신청에 사용</button><button data-action="responses">응답 확인</button></div><div class="surveyAdminGuide"><p><strong>저장 → 신청에 사용 → 프로그램에서 선택</strong><br>저장은 편집 내용을 보관합니다. 신청에 사용을 누르면 Google Drive에 출력용 설문과 응답 저장 공간을 준비하고, 연결된 프로그램에 저장한 내용을 적용합니다. 이미 제출된 응답은 바뀌지 않습니다.</p><p>인쇄 / PDF에서 종이 출력 또는 PDF 저장을 선택하세요. 응답 확인에서는 답변·그래프·CSV를 볼 수 있습니다.</p></div><details><summary>이전 수정 이력 ('+history.length+')</summary>'+history.map(v=>'<p>수정 '+v.revision+' · '+esc(v.saved_name)+' · '+new Date(v.saved_at).toLocaleString("ko-KR")+' <button data-action="history" data-revision="'+v.revision+'">문항 보기</button></p>').join("")+'</details><div id="surveyResults"></div>';
 renderQuestions();
}
function renderQuestions(){
 normalizePages();
 section.querySelector('#surveyQuestions').innerHTML=(saved.questions.length?'':'<p class="notice">빈 설문입니다. 문항 추가로 직접 구성하세요. 개인정보 동의도 동의 여부 유형으로 추가할 수 있습니다. 이름·생년월일·연락처는 실제 신청 첫 단계에서 한 번만 받으며 설문에 다시 추가하지 않아도 신청서에 반영됩니다.</p>')+saved.questions.map((q,i)=>'<details class="surveyQuestion" data-index="'+i+'"'+(i===activeQuestion?' open':'')+'><summary><span>'+(i+1)+'</span><strong class="questionTitle">'+esc(q.label||'새 문항')+'</strong><span class="questionType">'+(q.pageBreakBefore?'새 페이지 · ':'')+esc(types[q.type])+(q.required?' · 필수':'')+'</span></summary><div class="questionEditorBody"><div class="questionHeaderFields"><label>질문<input data-field="label" value="'+esc(q.label)+'"></label><label>유형<select data-field="type">'+Object.entries(types).map(([v,l])=>'<option value="'+v+'"'+(q.type===v?' selected':'')+'>'+l+'</option>').join('')+'</select></label></div><details class="questionHelp"><summary>설명·미동의 안내'+(q.help?' (작성됨)':' 추가')+'</summary><label>설명<textarea data-field="help">'+esc(q.help)+'</textarea></label></details><div class="questionToggles"><label><input type="checkbox" data-field="required"'+(q.required?' checked':'')+'>응답 필수</label>'+(q.type==='consent'?'<label><input type="checkbox" data-field="blockRefusal"'+(q.blockRefusal?' checked':'')+'>미동의 시 접수 제한</label>':'')+'</div>'+(['radio','checkbox','select','rank'].includes(q.type)?'<div class="surveyOptions">'+q.options.map((o,n)=>'<div class="surveyOption"><label>선택지 '+(n+1)+'<textarea rows="1" data-option="'+n+'">'+esc(o)+'</textarea></label><button data-action="removeOption" data-index="'+i+'" data-option="'+n+'">삭제</button></div>').join('')+'<button data-action="addOption" data-index="'+i+'">선택지 추가</button></div>':'')+(q.type==='rank'?'<label>몇 순위까지 선택하나요?<select data-field="rankCount"><option value="">기존 방식: 원하는 순위까지</option>'+q.options.map((_,n)=>'<option value="'+(n+1)+'"'+(q.rankCount===n+1?' selected':'')+'>'+(n+1)+'순위까지</option>').join('')+'</select></label>':'')+(q.type==='checkbox'?'<label>선택 개수<select data-field="selectionMode">'+[['any','자유롭게 여러 개'],['all','모두 선택'],['exact','정해진 개수 선택']].map(([v,l])=>'<option value="'+v+'"'+((q.selectionMode||'any')===v?' selected':'')+'>'+l+'</option>').join('')+'</select></label>'+(q.selectionMode==='exact'?'<label>선택할 개수<input data-field="selectionCount" type="number" min="1" max="'+q.options.length+'" value="'+(q.selectionCount||1)+'"></label>':''):'')+'<div class="formActions"><button data-action="up" data-index="'+i+'">위로</button><button data-action="down" data-index="'+i+'">아래로</button><button data-action="remove" data-index="'+i+'">문항 삭제</button></div></div></details>').join('');
 enhanceEditor();
}
section.addEventListener('toggle',e=>{if(!e.target.matches('.surveyQuestion')||!e.target.open)return;activeQuestion=Number(e.target.dataset.index);section.querySelectorAll('.surveyQuestion[open]').forEach(el=>{if(el!==e.target)el.open=false;});},true);
function read(){
 if(!saved)return;
 saved.title=section.querySelector("#surveyTitle").value.trim();saved.description=section.querySelector("#surveyDescription").value;
 section.querySelectorAll(".surveyQuestion").forEach(el=>{const q=saved.questions[Number(el.dataset.index)];el.querySelectorAll("[data-field]").forEach(f=>q[f.dataset.field]=f.type==="checkbox"?f.checked:["rankCount","selectionCount"].includes(f.dataset.field)?(f.value===""?undefined:Number(f.value)):(f.dataset.field==="type"&&f.dataset.unified&&f.value==="notice"?q.type:f.value));el.querySelectorAll("textarea[data-option]").forEach(f=>q.options[Number(f.dataset.option)]=f.value);});
}
section.addEventListener("input",e=>{schedulePreview();if(e.target.dataset.field==="label")e.target.closest(".surveyQuestion").querySelector(".questionTitle").textContent=e.target.value||"새 문항";dirty=true;const state=section.querySelector("#surveySaveState");if(state)state.textContent="저장하지 않은 수정";});
section.addEventListener("change",e=>{if(["type","selectionMode"].includes(e.target.dataset.field)){read();renderQuestions();}});
section.addEventListener("click",async e=>{
 const button=e.target.closest("button[data-action]");if(!button)return;
 const action=button.dataset.action,i=button.dataset.index===undefined?activeQuestion:Number(button.dataset.index);button.disabled=true;
 try{
  if(action==="new"){if(dirty&&!confirm("저장하지 않은 수정을 닫을까요?"))return;activeQuestion=0;current={id:null,revision:0};revision=0;saved=seed();dirty=true;renderEditor();return;}
  if(action==="load"||action==="copy"){await load(button.dataset.id,action==="copy");return;}
  if(action==="list"){if(dirty&&!confirm("저장하지 않은 수정을 닫을까요?"))return;current=null;await refresh();return;}
  if(action==="health"){await api("health");alert("연결이 잘 됐습니다.");return;}
  read();
  if(action==="collapse"){activeQuestion=-1;renderQuestions();return;}
  if(action==="copyQuestion"){if(i<0||!saved.questions[i]||isPage(saved.questions[i]))throw Error("복사할 문항을 먼저 선택해 주세요.");const q=structuredClone(saved.questions[i]);q.id="q_"+crypto.randomUUID().replaceAll("-","");saved.questions.splice(i+1,0,q);activeQuestion=i+1;dirty=true;renderQuestions();return;}
  if(["add","addPage","remove","up","down","addOption","removeOption"].includes(action)){
   if(action==="addPage")saved.questions.splice(Math.min(saved.questions.length,Math.max(0,activeQuestion+1)),0,{id:"page_"+crypto.randomUUID().replaceAll("-",""),type:"notice",label:"다음 페이지",help:"",required:false,blockRefusal:false,pageBreakBefore:true,options:[]});
   if(action==="add")saved.questions.splice(Math.max(0,activeQuestion+1),0,{id:"q_"+crypto.randomUUID().replaceAll("-",""),type:"text",label:"새 문항",help:"",required:false,blockRefusal:false,options:["선택지 1"]});
   if(action==="remove"){if(isPage(saved.questions[i])&&!confirm("페이지 구분을 삭제하고 문항을 앞 페이지로 합칠까요?"))return;saved.questions.splice(i,1);}
   if(action==="up"&&i>0&&!isPage(saved.questions[i]))[saved.questions[i-1],saved.questions[i]]=[saved.questions[i],saved.questions[i-1]];
   if(action==="down"&&i<saved.questions.length-1&&!isPage(saved.questions[i]))[saved.questions[i+1],saved.questions[i]]=[saved.questions[i],saved.questions[i+1]];
   if(action==="addOption")saved.questions[i].options.push("새 선택지");
   if(action==="removeOption")saved.questions[i].options.splice(Number(button.dataset.option),1);
   activeQuestion=["add","addPage"].includes(action)?Math.min(saved.questions.length-1,Math.max(0,activeQuestion+1)):action==="up"?Math.max(0,i-1):action==="down"?Math.min(saved.questions.length-1,i+1):Math.min(i,saved.questions.length-1);dirty=true;renderQuestions();const state=section.querySelector("#surveySaveState");if(state)state.textContent="저장하지 않은 수정";return;
  }
  if(action==="save"){validateSchema(saved);const d=await api("save",{id:current.id,revision:current.revision||0,schema:saved});await load(d.survey.id);await refreshBinding();return;}
  if(action==="preview"){validateSchema(saved);showSurveyFrame(null,saved);return;}
  if(action==="print"){validateSchema(saved);print(saved);return;}
  if(action==="html"){validateSchema(saved);download(printHTML(saved),saved.title+".html","text/html;charset=utf-8");return;}
  if(!current.id||dirty)throw Error("수정 내용을 먼저 저장해 주세요.");
  if(action==="history"){const d=await api("load",{surveyId:current.id,revision:Number(button.dataset.revision)});print(d.version.schema);return;}
  if(action==="publish"){if(!confirm("저장한 설문을 실제 신청에 사용할까요? 연결된 프로그램에도 이 내용이 적용됩니다."))return;await api("publish",{surveyId:current.id,revision:current.revision});alert("신청에 사용할 준비가 끝났습니다. 프로그램에서 이 설문을 선택하세요.");await load(current.id);await refreshBinding();return;}
  if(action==="responses"){await responses(current.revision);return;}
  if(action==="responseVersion"){await responses(Number(button.dataset.revision));return;}
  if(action==="csv"){download(csv(viewRows.schema,viewRows.rows),saved.title+"_응답.csv","text/csv;charset=utf-8");return;}
  if(action==="printResponse"){print(viewRows.schema,viewRows.rows[Number(button.dataset.row)]);return;}
 }catch(e){showError(e);}finally{button.disabled=false;}
});
async function responses(rev){
 const d=await api("load",{surveyId:current.id});let offset=0,rows=[],r;
 do{r=await api("responses",{surveyId:current.id,revision:rev,offset});rows.push(...r.rows);offset=r.nextOffset;}while(offset!==null);
 viewRows={schema:r.schema,rows};
 const charts=flags.charts?r.schema.questions.filter(q=>["radio","checkbox","select","consent","rank"].includes(q.type)).map(q=>{
 const values=q.type==="consent"?["agree","disagree"]:q.options;
 return '<section class="surveyChart"><h4>'+esc(q.label)+'</h4>'+values.map(v=>{const n=rows.filter(r=>Array.isArray(r.answers[q.id])?r.answers[q.id].includes(v):r.answers[q.id]===v).length;return '<p>'+esc(v==="agree"?"동의":v==="disagree"?"미동의":v)+' · '+n+'명 <meter min="0" max="'+Math.max(1,rows.length)+'" value="'+n+'"></meter></p>';}).join("")+'</section>';
 }).join(""):"";
 section.querySelector("#surveyResults").innerHTML='<h3>응답 '+rows.length+'건 · 수정 '+rev+' 문항</h3><div class="formActions">'+d.versions.map(v=>'<button data-action="responseVersion" data-revision="'+v.revision+'">수정 '+v.revision+' 응답</button>').join("")+'</div><p>복수선택·우선순위 그래프는 항목별 선택 인원입니다. 상세 순위는 CSV에서 확인합니다.</p><button data-action="csv">이 문항 버전 응답 CSV</button><a href="'+esc(r.sheetUrl)+'" target="_blank" rel="noopener">Google 응답 시트</a><a href="'+esc(r.folderUrl)+'" target="_blank" rel="noopener">Google Drive · 전체 신청명단 CSV</a>'+charts+rows.map((r,i)=>'<p>'+esc(r.name)+' · '+esc(r.program_title)+' <button data-action="printResponse" data-row="'+i+'">신청서 출력</button></p>').join("");
}
const dialog=document.createElement("dialog");dialog.id="nurimSurveyDialog";dialog.innerHTML='<div class="dialogTitle"><h2>프로그램 신청서</h2><button type="button">닫기</button></div><iframe title="프로그램 신청 설문"></iframe>';document.body.append(dialog);
dialog.querySelector("button").onclick=()=>dialog.close();
function showSurveyFrame(p,schema,application){
 const frame=dialog.querySelector("iframe");
 if(application&&resumableProgramId===p?.id){frame.contentWindow.postMessage({type:"nurim-application-update",application},location.origin);dialog.showModal();return;}
 resumableProgramId=null;frame.src="/survey.html"+(p?"?embedded=1&program="+encodeURIComponent(p.id):"?preview=1");
 frame.onload=()=>{if(application)frame.contentWindow.postMessage({type:"nurim-application",application},location.origin);if(schema)frame.contentWindow.postMessage({type:"nurim-preview",schema},location.origin);};
 dialog.showModal();
}

let surveyHandoff=false,handoffBusy=false,resumableProgramId=null,returningToApplication=false;
const oldSubmitApplication=submitApplication;
submitApplication=async function(){
 const p=activeProgram;if(!p?.surveyId)return oldSubmitApplication();if(handoffBusy)return;
 if(!window.NurimGuardian?.validate())return;
 const guardian=window.NurimGuardian.collect();
 const c=collectConsentResponses(p),signature=document.querySelector('#signature').value.trim();
 if(p.consentEnabled&&activeConsentItems(p).length&&!matchingSignature(document.querySelector('#name').value,signature)){alert('전자서명은 1페이지에 입력한 신청자 이름과 같아야 합니다.');document.querySelector('#signature').focus();return;}
 if(c.missing||(p.consentEnabled&&!signature)){alert('개인정보 동의 항목과 서명을 확인해 주세요.');return;}
 handoffBusy=true;
 try{
  let file=null;if(p.formEnabled){const files=[...document.querySelector('#applicantFile').files];if(!files.length)throw Error('작성한 신청서 파일을 첨부해 주세요.');file=await fileToData(await window.prepareApplicationUploadFiles(files));}
  const application={basic:{name:document.querySelector('#name').value.trim(),birth:document.querySelector('#birth').value,phone:document.querySelector('#phone').value.trim()},extra:{participantType:document.querySelector('#type').value,note:document.querySelector('#note').value.trim(),consentResponses:c.responses,signature,guardian},file};
  suppressedCloses++;document.querySelector('#applyDialog').close();surveyHandoff=true;showSurveyFrame(p,null,application);
 }catch(e){showError(e);}finally{handoffBusy=false;}
};
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==dialog.querySelector('iframe').contentWindow||e.data?.type!=='nurim-back'||!surveyHandoff||!activeProgram)return;
 resumableProgramId=activeProgram.id;returningToApplication=true;surveyHandoff=false;
 suppressedCloses++;dialog.close();
 const use=activeProgram.consentEnabled&&activeConsentItems(activeProgram).length>0;
 setApplyStep(use?'consent':'info');document.querySelector('#applyDialog').showModal();
 document.querySelector(use?'#signature':'#name').focus();
});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==dialog.querySelector('iframe').contentWindow||e.data?.type!=='nurim-complete')return;surveyHandoff=false;resumableProgramId=null;dialog.close();});
dialog.addEventListener('cancel',()=>{surveyHandoff=false;});
function programPath(p){return "/"+p.publicNumber+"/"+p.publicYear+"/"+encodeURIComponent(p.publicCenter||p.centerName);}
let changingHistory=false,openedFromPath=false,suppressedCloses=0,pathPending=true;
const originalOpen=openApply;
openApply=function(p){
 if(flags.programAddress&&p.publicNumber&&!changingHistory){history.pushState({nurimProgram:p.id},"",programPath(p));openedFromPath=true;}
 resumableProgramId=null;
 originalOpen(p);if(p.surveyId)document.querySelector("#applySubmitButton").textContent="다음: 추가 설문";
};
function closed(){if(suppressedCloses){suppressedCloses--;return;}if(changingHistory)return;if(openedFromPath){openedFromPath=false;history.back();}else if(/^\/\d+\/\d{4}\//.test(location.pathname))history.replaceState({},"","/");}
dialog.addEventListener("close",()=>{if(returningToApplication){returningToApplication=false;}else if(!dialog.open){resumableProgramId=null;dialog.querySelector("iframe").src="about:blank";}closed();});
document.querySelector("#applyDialog").addEventListener("close",closed);
function resolvePath(){
 if(!pathPending||document.querySelector("#adminDialog").open)return;
 const match=location.pathname.match(/^\/(\d+)\/(\d{4})\/([^/]+)\/?$/);if(!match){pathPending=false;return;}
 let requestedCenter;try{requestedCenter=decodeURIComponent(match[3]);}catch{return;}
 const p=programs.find(p=>String(p.publicNumber)===match[1]&&String(p.publicYear)===match[2]&&p.publicCenter===requestedCenter);
 if(p&&!dialog.open&&!document.querySelector("#applyDialog").open){pathPending=false;changingHistory=true;openApply(p);changingHistory=false;}
}
window.addEventListener("popstate",()=>{changingHistory=true;[dialog,document.querySelector("#applyDialog")].forEach(d=>{if(d.open){suppressedCloses++;d.close();}});changingHistory=false;openedFromPath=false;pathPending=true;resolvePath();});
const oldRender=renderAll;renderAll=function(){oldRender();resolvePath();};resolvePath();
window.addEventListener("beforeunload",e=>{if(dirty){e.preventDefault();e.returnValue="";}});
db.auth.onAuthStateChange((event)=>{if((event==="SIGNED_IN"||event==="SIGNED_OUT")&&document.querySelector("#adminDialog").open)clearApplicationNavigation();if(event==="SIGNED_OUT"){sessionGeneration++;bindingRequest++;bindingWanted="";select.value="";current=null;saved=null;list=[];viewRows=[];dirty=false;centerChoice="";managerChoice="";surveyRole="manager";section.innerHTML="";}});

function clearApplicationNavigation(){
 pathPending=false;openedFromPath=false;surveyHandoff=false;
 for(const d of [dialog,document.querySelector("#applyDialog")]){if(d.open){suppressedCloses++;d.close();}}
 if(/^\/\d+\/\d{4}\//.test(location.pathname))history.replaceState({},"","/");
}
document.querySelector("#adminOpen").addEventListener("click",()=>{clearApplicationNavigation();resetProgramForm();switchAdminTab("programCreate");setProgramRegistrationStep("basic");});


function isPage(q){return q?.type==='notice'&&q.id.startsWith('page_');}
function pageHeader(label,breakBefore){return {id:'page_'+crypto.randomUUID().replaceAll('-',''),type:'notice',label,help:'',required:false,blockRefusal:false,pageBreakBefore:breakBefore,options:[]};}
function normalizePages(){
 if(!saved)return;
 const out=[];for(const q of saved.questions){if(q.pageBreakBefore&&!isPage(q)){out.push(pageHeader('페이지 안내',out.length>0));q.pageBreakBefore=false;}out.push(q);}
 if(isPage(out[0])&&!out[0].pageBreakBefore&&out[0].label==='첫 페이지'&&!out[0].help.trim())out.shift();
 saved.questions=out;
}
let previewTimer,draggedQuestion=null;
section.addEventListener('dragend',()=>{draggedQuestion=null;});
function updateLivePreview(){const frame=section.querySelector('#surveyLivePreview');if(frame&&saved)frame.contentWindow.postMessage({type:'nurim-preview',schema:structuredClone(saved)},location.origin);}
function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(()=>{if(section.querySelector('#surveyTitle')){read();updateLivePreview();}},250);}
function enhanceEditor(){
 let split=section.querySelector('.surveyStudio');
 if(!split){split=document.createElement('div');split.className='surveyStudio';const layout=section.querySelector('.surveyEditorLayout');layout.before(split);const left=document.createElement('div');left.className='surveyStudioEditor';split.append(left);left.append(section.querySelector('.surveyContext'),layout);const preview=document.createElement('aside');preview.className='surveyStudioPreview';preview.innerHTML='<h3>이용자 화면 미리보기</h3><iframe id="surveyLivePreview" title="작성 중인 설문 이용자 화면" src="/survey.html?preview=1"></iframe>';split.append(preview);preview.querySelector('iframe').onload=updateLivePreview;}
 let number=1,questionNumber=0;
 section.querySelectorAll('.surveyQuestion').forEach(el=>{
 const i=Number(el.dataset.index),q=saved.questions[i];
 if(isPage(q)){if(q.pageBreakBefore)number++;el.classList.add('surveyPageHeader');el.querySelector('summary > span').textContent=number+'페이지';el.querySelector('.questionType').textContent='페이지 제목 · 설명';el.querySelector('[data-field="type"]').closest('label').hidden=true;el.querySelector('.questionToggles').hidden=true;el.querySelector('.questionHelp').open=true;el.querySelector('.questionHelp summary').textContent='페이지 설명';el.querySelector('[data-field="label"]').closest('label').firstChild.textContent='페이지 제목';el.querySelector('[data-action="remove"]').textContent='페이지 구분 삭제';el.querySelector('[data-action="up"]').remove();el.querySelector('[data-action="down"]').remove();if(i===0)el.querySelector('[data-action="remove"]').disabled=true;
 }else{el.querySelector('summary > span').textContent=++questionNumber;const handle=el.querySelector(':scope > summary');handle.draggable=true;handle.title='문항 제목을 끌어 순서를 바꿀 수 있습니다.';if(i===0)el.querySelector('[data-action="up"]').disabled=true;handle.addEventListener('dragstart',e=>{read();draggedQuestion=q.id;e.dataTransfer.setData('text/plain',q.id);e.dataTransfer.effectAllowed='move';});}
 const unified=q.type==='notice'&&!isPage(q)||q.type==='consent'||q.type==='checkbox'&&q.options?.length===1&&q.options[0]==='동의합니다';
 const type=el.querySelector('[data-field="type"]');type.querySelector('option[value="notice"]').textContent='안내문 · 동의';type.querySelector('option[value="consent"]').hidden=true;
 if(unified){el.querySelector('.questionType').textContent='안내 · 동의'+(q.required?' · 필수':'');type.value='notice';type.dataset.unified='true';const wrap=document.createElement('label');wrap.textContent='안내문 확인 방식';const mode=document.createElement('select');mode.innerHTML='<option value="notice">안내만 표시</option><option value="consent">동의 / 미동의</option><option value="only">동의만 (필수 확인)</option>';mode.value=q.type==='checkbox'?'only':q.type;wrap.append(mode);el.querySelector('.questionHeaderFields').after(wrap);mode.onchange=()=>{read();q.type=mode.value==='only'?'checkbox':mode.value;q.options=mode.value==='only'?['동의합니다']:[];q.required=mode.value==='only';q.blockRefusal=false;q.selectionMode='all';dirty=true;renderQuestions();};if(q.type==='checkbox'){el.querySelector('.surveyOptions')?.remove();el.querySelector('[data-field="selectionMode"]')?.closest('label').remove();el.querySelector('[data-field="required"]').disabled=true;}el.querySelector('.questionHelp').open=true;el.querySelector('.questionHelp summary').textContent='안내 내용';}
 el.addEventListener('dragover',e=>{if(draggedQuestion){e.preventDefault();e.dataTransfer.dropEffect='move';}});
 el.addEventListener('drop',e=>{e.preventDefault();if(!draggedQuestion)return;const from=saved.questions.findIndex(x=>x.id===draggedQuestion);draggedQuestion=null;if(from<0||from===i)return;const moving=saved.questions[from];saved.questions.splice(from,1);let to=saved.questions.findIndex(x=>x.id===q.id);if(isPage(q))to++;saved.questions.splice(Math.max(0,to),0,moving);activeQuestion=saved.questions.indexOf(moving);dirty=true;renderQuestions();section.querySelector('[data-index="'+activeQuestion+'"] summary')?.focus();});
 });updateLivePreview();
}
