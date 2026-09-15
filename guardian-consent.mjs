import {isUnder14,validateGuardian,GUARDIAN_TEXT} from './guardian-core.mjs?v=107';
const $=s=>document.querySelector(s),birth=$('#birth'),name=$('#name');
const box=document.createElement('fieldset');box.id='guardianFields';box.hidden=true;
box.innerHTML='<legend>만 14세 미만 신청자의 보호자(법정대리인)</legend><p>법정대리인이 직접 내용을 확인하고 이름과 서명을 입력해 주세요.</p><div class="formGrid"><label>보호자 이름 <input id="guardianName" autocomplete="off" maxlength="80"></label><label>보호자 서명 <input id="guardianSignature" autocomplete="off" maxlength="80" placeholder="보호자 이름을 한 번 더 입력해 주세요"></label></div><label class="guardianAgreeLabel"><input id="guardianAgree" type="checkbox"> <span id="guardianAgreementText"></span></label>';
$('#applyStepInfo .formGrid').after(box);$('#guardianAgreementText').textContent=GUARDIAN_TEXT;
const summary=document.createElement('p');summary.id='guardianConsentSummary';summary.hidden=true;summary.setAttribute('aria-live','polite');$('#applyStepConsent .consentIntro').append(summary);
const style=document.createElement('style');style.textContent='#guardianFields{margin:16px 0;padding:16px;border:1px solid #c5d7db;border-radius:12px}#guardianFields[hidden],#guardianConsentSummary[hidden]{display:none!important}.guardianAgreeLabel{display:flex;align-items:flex-start;gap:8px;margin-top:12px}.guardianAgreeLabel input{width:auto;flex:none;margin-top:5px}#guardianConsentSummary{padding:12px;background:#eef6f7;border-radius:8px;white-space:pre-line}';document.head.append(style);
function minor(){try{return isUnder14(birth.value);}catch{return false;}}
function refresh(){
 const show=minor();box.hidden=!show;
 for(const el of box.querySelectorAll('input')){el.disabled=!show;el.required=show;if(!show){if(el.type==='checkbox')el.checked=false;else el.value='';}}
 summary.hidden=!show;
 summary.textContent=show?'신청 아동: '+(name.value.trim()||'이름을 입력해 주세요')+'\n보호자(법정대리인): '+($('#guardianName').value.trim()||'이름을 입력해 주세요')+'\n아동의 신청자 서명과 보호자의 추가 서명을 각각 기록합니다.':'';
}
function collect(){return validateGuardian(birth.value,{name:$('#guardianName').value,signature:$('#guardianSignature').value,agreed:$('#guardianAgree').checked});}
function validate(){try{refresh();collect();return true;}catch(e){alert(e.message);const field=/서명/.test(e.message)?$('#guardianSignature'):/동의/.test(e.message)?$('#guardianAgree'):/보호자/.test(e.message)?$('#guardianName'):birth;field.focus();return false;}}
window.NurimGuardian={collect,validate,refresh};
for(const el of [birth,name,...box.querySelectorAll('input')]){el.addEventListener('input',refresh);el.addEventListener('change',refresh);}
$('#applyForm').addEventListener('reset',()=>setTimeout(refresh,0));
new MutationObserver(refresh).observe($('#applyDialog'),{attributes:true,attributeFilter:['open']});
document.addEventListener('click',e=>{if(e.target.closest('#goConsent,#applySubmitButton')&&!validate()){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('submit',e=>{if(e.target.id==='applyForm'&&!validate()){e.preventDefault();e.stopImmediatePropagation();}},true);
refresh();
