export const types={text:"짧은 답변",textarea:"긴 답변",radio:"단일 선택",checkbox:"복수 선택",select:"목록 선택",date:"날짜",rank:"우선순위",consent:"동의 여부",notice:"안내문"};
export const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return false;const d=new Date(v+"T00:00:00Z");return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
export function validateSchema(s){
 if(!s||typeof s.title!=="string"||!s.title.trim()||s.title.length>200)throw Error("설문 제목을 200자 이내로 입력해 주세요.");
 if(typeof s.description!=="string"||s.description.length>10000)throw Error("안내문은 10,000자 이내로 입력해 주세요.");
 if(!Array.isArray(s.questions)||s.questions.length>100)throw Error("문항은 최대 100개입니다.");
 const ids=new Set();
 for(const q of s.questions){
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(q.id)||ids.has(q.id))throw Error("문항 ID가 올바르지 않습니다.");ids.add(q.id);
  if(!Object.hasOwn(types,q.type)||typeof q.label!=="string"||!q.label.trim()||q.label.length>2000)throw Error("문항 제목과 유형을 확인해 주세요.");
  if(typeof q.help!=="string"||q.help.length>10000)throw Error("문항 설명을 확인해 주세요.");
  if(["radio","checkbox","select","rank"].includes(q.type)){
   if(!Array.isArray(q.options)||!q.options.length||q.options.length>50||q.options.some(x=>typeof x!=="string"||!x.trim()||x.length>1000)||new Set(q.options).size!==q.options.length)throw Error("선택지는 중복 없이 1~50개, 각 1,000자 이내로 입력해 주세요.");
  }
  if(q.type==='rank'&&q.rankCount!=null&&(!Number.isInteger(q.rankCount)||q.rankCount<1||q.rankCount>q.options.length))throw Error(q.label+': 순위 수는 선택지 수 이내의 정수로 입력해 주세요.');
  if(q.type==='checkbox'){
   if(q.selectionMode!=null&&!['any','all','exact'].includes(q.selectionMode))throw Error(q.label+': 선택 개수 설정을 확인해 주세요.');
   if(q.selectionMode==='exact'&&(!Number.isInteger(q.selectionCount)||q.selectionCount<1||q.selectionCount>q.options.length))throw Error(q.label+': 선택 개수는 선택지 수 이내의 정수로 입력해 주세요.');
  }
  if(q.type==="consent"&&q.blockRefusal&&!q.required)throw Error("미동의 시 접수를 제한하는 항목은 응답 필수로 설정해 주세요.");
  if(q.type==="consent"&&q.blockRefusal&&!q.help.trim())throw Error("미동의 시 접수가 제한되는 이유를 문항 설명에 적어 주세요.");
 }
 return {title:s.title.trim(),description:s.description,questions:s.questions.map(q=>({id:q.id,type:q.type,label:q.label,help:q.help,pageBreakBefore:q.pageBreakBefore===true,required:!!q.required,blockRefusal:!!q.blockRefusal,...(q.type==='rank'&&q.rankCount!=null?{rankCount:q.rankCount}:{}),...(q.type==='checkbox'?{selectionMode:q.selectionMode||'any',...(q.selectionMode==='exact'?{selectionCount:q.selectionCount}:{})}:{}),options:["radio","checkbox","select","rank"].includes(q.type)?q.options:[]}))};
}
export function validateAnswers(schema,basic,answers){
 if(!basic||typeof basic.name!=="string"||!basic.name.trim()||basic.name.length>80)throw Error("이름을 확인해 주세요.");
 if(typeof basic.phone!=="string"||!/^\+?[0-9 ()-]{8,24}$/.test(basic.phone)||basic.phone.replace(/\D/g,"").length<8)throw Error("연락처를 확인해 주세요.");
 if(!validDate(basic.birth)||basic.birth>new Date().toISOString().slice(0,10)||basic.birth<"1900-01-01")throw Error("생년월일을 확인해 주세요.");
 if(!answers||typeof answers!=="object"||Array.isArray(answers))throw Error("응답 형식을 확인해 주세요.");
 const clean={};
 for(const q of schema.questions){
  if(q.type==="notice")continue;
  const a=answers[q.id],empty=a===undefined||a===""||a===null||Array.isArray(a)&&a.length===0;
  if(empty){if(q.required)throw Error(q.label+": 답변해 주세요.");clean[q.id]="";continue;}
  if(["checkbox","rank"].includes(q.type)){if(!Array.isArray(a)||a.some(v=>!q.options.includes(v))||new Set(a).size!==a.length)throw Error(q.label+": 선택 내용을 확인해 주세요.");}
  else if(typeof a!=="string"||a.length>10000)throw Error(q.label+": 답변이 너무 길거나 잘못되었습니다.");
  if(["radio","select"].includes(q.type)&&!q.options.includes(a))throw Error(q.label+": 선택지를 확인해 주세요.");
  if(q.type==="consent"&&!["agree","disagree"].includes(a))throw Error(q.label+": 동의 여부를 선택해 주세요.");
  if(q.type==="consent"&&q.blockRefusal&&a==="disagree")throw Error(q.label+": "+q.help);
  if(q.type==="date"&&!validDate(a))throw Error(q.label+": 날짜를 확인해 주세요.");
  if(q.type==='rank'&&q.rankCount!=null&&a.length!==q.rankCount)throw Error(q.label+': '+q.rankCount+'순위까지 모두 선택해 주세요.');
  if(q.type==='checkbox'){
   const count=q.selectionMode==='all'?q.options.length:q.selectionMode==='exact'?q.selectionCount:null;
   if(count!=null&&a.length!==count)throw Error(q.label+': '+(q.selectionMode==='all'?'모든 항목을':count+'개를')+' 선택해 주세요.');
  }
  clean[q.id]=a;
 }
 if(JSON.stringify(clean).length>40000)throw Error("전체 답변은 40,000자 이내로 입력해 주세요.");
 return clean;
}
export const answerText=(q,a)=>q.type==="consent"?(a==="agree"?"동의":a==="disagree"?"미동의":""):Array.isArray(a)?a.map((v,i)=>q.type==="rank"?(i+1)+"순위 "+v:v).join(" / "):String(a??"");
export function csv(schema,rows){
 const safe=v=>{let s=String(v??"");if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return "\ufeff"+[["신청번호","신청일시","프로그램","이름","생년월일","연락처","접수상태",...schema.questions.filter(q=>q.type!=="notice").map(q=>q.label)],...rows.map(r=>[r.id,r.created_at,r.program_title,r.name,r.birth,r.phone,r.status,...schema.questions.filter(q=>q.type!=="notice").map(q=>answerText(q,r.answers[q.id]))])].map(r=>r.map(safe).join(",")).join("\r\n");
}
export function printHTML(s,record){
 const basic=record?'<div>이름: '+esc(record.name)+'</div><div>생년월일: '+esc(record.birth.replace(/(\d{4})-(\d{2})-(\d{2})/,"$1년 $2월 $3일"))+'</div><div>연락처: '+esc(record.phone)+'</div>':'<div>이름: __________________</div><div>생년월일: ______년 ___월 ___일</div><div>연락처: __________________</div>';
 let pageNumber=1,questionNumber=0;
 const pageDivider=(title,help)=>'<section class="surveyPageDivider"><h2>'+esc(pageNumber+'페이지'+(title?' · '+title:''))+'</h2>'+(help?'<p>'+esc(help)+'</p>':'')+'</section>';
 const items=s.questions.map((q,i)=>{
  if(q.pageBreakBefore)pageNumber++;
  const pageTitle=q.type==='notice'&&(String(q.id||'').startsWith('page_')||q.pageBreakBefore);
  if(pageTitle)return pageDivider(q.label,q.help);
  const divider=q.pageBreakBefore?pageDivider('',''):'';
  if(q.type==='notice')return divider+'<section class="question wide surveyNotice"><strong>'+esc(q.label)+'</strong>'+(q.help?'<p>'+esc(q.help)+'</p>':'')+'</section>';
  questionNumber++;
  const a=record?answerText(q,record.answers[q.id]):q.type==="date"?"______년 ___월 ___일":q.type==="consent"?"□ 동의   □ 미동의":q.options?.length?q.options.map((o,n)=>(q.type==="rank"?"("+ (n+1) +"순위) ":"□ ")+o).join("    "):q.type==="notice"?"":"________________________________________________________________";
  const long=q.type==="textarea"||q.help.length>70||q.label.length>45||(q.options||[]).join("").length>60||a.length>70;
  return divider+'<section class="question '+(long?"wide":"")+'"><strong>'+esc(questionNumber+". "+q.label)+(q.required?" *":"")+'</strong>'+(q.help?'<p>'+esc(q.help)+'</p>':"")+(selectionHint(q)?'<p>'+esc(selectionHint(q))+'</p>':'')+'<div class="answer">'+esc(a)+'</div></section>';
 }).join("");
 return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>'+esc(s.title)+'</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:Arial,"Malgun Gothic",sans-serif;color:#183b38;font-size:10pt;line-height:1.65}h1{font-size:19pt}p{white-space:pre-wrap;overflow-wrap:anywhere}.basic,.questions{display:flex;flex-wrap:wrap;gap:10px}.basic{padding:12px;border:1px solid #8ea9a3;font-size:9pt}.basic>div{flex:1 1 160px}.question{flex:1 1 45%;border-bottom:1px solid #a9bcb6;padding:10px 0;break-inside:avoid;min-width:0;overflow-wrap:anywhere}.question.wide{flex-basis:100%}.surveyPageDivider{flex:0 0 100%;width:100%;border-top:2px solid #507f72;margin-top:12px;padding:10px 0 2px;break-inside:avoid;break-after:avoid;page-break-after:avoid}.surveyPageDivider h2{font-size:12pt;margin:0 0 4px}.surveyPageDivider p{font-size:10pt;margin:0}.surveyNotice{break-after:avoid}.question p{font-size:9pt;margin:4px 0}.answer{white-space:pre-wrap;min-height:28px}.question:has(.answer:empty){break-inside:auto}@media print{button{display:none}}</style><body><button onclick="window.print()">인쇄 / PDF 저장</button><h1>'+esc(s.title)+'</h1><p>'+esc(s.description)+'</p><div class="basic">'+basic+'</div><div class="questions">'+items+'</div></body></html>';
}

export function surveyPages(schema){const pages=[[]];for(const q of schema.questions){if(q.pageBreakBefore)pages.push([]);pages.at(-1).push(q);}return pages;}


export function selectionHint(q){
 if(q.type==='rank')return q.rankCount?('1~'+q.rankCount+'순위를 중복 없이 선택해 주세요.'):'원하는 순위까지 중복 없이 선택해 주세요.';
 if(q.type==='checkbox')return q.selectionMode==='all'?'모든 항목을 선택해 주세요.':q.selectionMode==='exact'?q.selectionCount+'개를 선택해 주세요.':'원하는 항목을 여러 개 선택할 수 있습니다.';
 return '';
}
export function matchingSignature(name,signature){return typeof name==='string'&&typeof signature==='string'&&!!name.trim()&&name.trim().normalize('NFC')===signature.trim().normalize('NFC');}
