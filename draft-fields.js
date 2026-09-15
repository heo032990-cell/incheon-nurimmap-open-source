(() => {
  window.nurimPrepareDraft = (draft) => {
    const d={...draft,warnings:[...(draft.warnings||[])]};
    const parsed=window.nurimParseSchedule(d.schedule);
    if(parsed.start)d.schedule=window.nurimFormatSchedule(parsed.start,parsed.end,parsed.detail);
    else d.warnings.push('운영 시작일·종료일: 날짜를 확인해 주세요(원문은 상세일정에 보존)');
    return d;
  };
  const touched=new WeakSet();
  document.addEventListener('change',e=>{if(e.isTrusted && e.target.matches('#programDisabilityTypeOptions input'))touched.add(document.querySelector('#programDisabilityTypeOptions'));},true);
  document.querySelector('#programForm').addEventListener('reset',()=>touched.delete(document.querySelector('#programDisabilityTypeOptions')));
  window.nurimApplyExtraDraft = d => {
    let count=0;const warn=s=>{if(!d.warnings.includes(s))d.warnings.push(s);};
    const set=(id,value)=>{const el=document.querySelector(id);if(el.value)return;if(value && [...el.options].some(o=>o.value===value)){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));count++;}else warn(el.closest('label').childNodes[0].textContent.trim()+': 직접 확인');};
    const audience=String(d.audience||'');
    let audienceType=d.audienceType||(/어머니|아버지|부모|보호자|가족/.test(audience)?'가족·보호자':/장애/.test(audience)&&!/비장애/.test(audience)?'장애 당사자':/지역\s*주민|시민/.test(audience)?'지역주민':'');
    set('#programAudienceType',audienceType);
    const text=[d.title,d.description].filter(Boolean).join(' ');
    const categories=[['자조모임',/자조|자조모임/],['신체활동',/운동|체육|수영|배드민턴|요가|축구|탁구/],['문화·여가활동',/베이킹|요리|나들이|여행|미술|음악|공예|영화|공연|꽃꽂이/],['교육활동',/문해|디지털|컴퓨터|스마트폰|직업훈련/],['가족지원',/부모교육|가족상담|양육상담/]].filter(([,re])=>re.test(text)).map(([name])=>name);
    set('#programActivityCategory',d.activityCategory||(categories.length===1?categories[0]:''));
    // A relative's disability is not automatically a restriction on the participating parent.
    const types=d.disabilityTypes || (audienceType==='장애 당사자'?[...new Set((audience.match(/발달장애|지적장애|자폐(?:성)?장애|정신장애|지체장애|뇌병변장애|시각장애|청각장애|신체장애/g)||[]).map(v=>window.nurimBroadDisabilities([v])[0]))]:/비장애/.test(audience)?['비장애']:[]);
    const box=document.querySelector('#programDisabilityTypeOptions');
    const selected=[...box.querySelectorAll('input:checked')];
    if(!touched.has(box) && !editingId && selected.every(el=>el.value==='전체 장애유형')){
      const broad=window.nurimBroadDisabilities(types).filter(v=>v!=='전체 장애유형'&&v!=='분류 확인 필요');
      if(broad.length){box.querySelectorAll('input').forEach(el=>el.checked=broad.includes(el.value));count++;}
      else warn('장애유형: 원문 근거를 확인해 직접 선택');
    }
    if(!document.querySelector('#operationStart').value)warn('운영 시작일');
    return count;
  };
  const status=document.querySelector('#promotionDraftStatus');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
})();
