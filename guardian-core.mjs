export const GUARDIAN_VERSION='guardian-v107';
export const GUARDIAN_TEXT='본인은 신청 아동의 법정대리인으로서, 신청 단계에 안내된 개인정보 처리 내용을 확인하고 아동을 대신하여 선택한 동의 내용에 동의합니다. 법정대리인 이름·서명·동의일시는 동의 확인을 위해 신청정보와 같은 기간 동안 보관됩니다.';
export function koreaToday(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=type=>parts.find(p=>p.type===type).value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
export function isUnder14(birth,today=koreaToday()) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birth||'')||birth>today)throw Error('생년월일을 확인해 주세요.');
 const d=new Date(birth+'T00:00:00Z');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==birth)throw Error('생년월일을 확인해 주세요.');
 const [y,m,day]=birth.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
 return ty-y-((tm<m||tm===m&&td<day)?1:0)<14;
}
export function validateGuardian(birth,guardian,today=koreaToday()) {
 if(!isUnder14(birth,today))return null;
 const name=typeof guardian?.name==='string'?guardian.name.trim().normalize('NFC'):'';
 const signature=typeof guardian?.signature==='string'?guardian.signature.trim().normalize('NFC'):'';
 if(!name||name.length>80)throw Error('보호자(법정대리인) 이름을 입력해 주세요.');
 if(signature!==name)throw Error('보호자 서명은 보호자 이름과 같아야 합니다.');
 if(guardian?.agreed!==true)throw Error('보호자(법정대리인) 동의 내용을 확인해 주세요.');
 return {name,signature,agreed:true,version:GUARDIAN_VERSION,text:GUARDIAN_TEXT};
}
