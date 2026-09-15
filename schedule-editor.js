(() => {
  const original = document.querySelector('#schedule');
  const form = document.querySelector('#programForm');
  const oldLabel = original.closest('label');
  const group = document.createElement('fieldset');
  group.className = 'wide operationSchedule';
  group.innerHTML = `<legend>운영 일정</legend><div class="operationDates"><label>운영 시작일<input id="operationStart" type="date"></label><label>운영 종료일 (선택)<input id="operationEnd" type="date"></label></div><div class="scheduleHint"><small>하루 프로그램은 시작일만 입력하세요. 모집기간과는 별개입니다.</small><button type="button" id="clearOperationEnd">종료일 비우기</button></div><label>상세 운영일정<input id="operationDetail" placeholder="예: 매주 수요일 10:00~11:30 / 총 8회"></label><p id="legacyScheduleHint" class="sectionHelp hidden">기존 일정 문구를 보존했습니다. 날짜를 확인한 뒤 운영 시작일·종료일을 입력해 주세요.</p>`;
  oldLabel.before(group);
  original.type = 'hidden'; original.required = false;
  group.append(original); oldLabel.remove();
  const start = group.querySelector('#operationStart'), end = group.querySelector('#operationEnd'), detail = group.querySelector('#operationDetail');
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  let legacy = false;
  function read(value) {
    const parsed = window.nurimParseSchedule(value);
    start.value = parsed.start; end.value = parsed.end; detail.value = parsed.detail;
    legacy = Boolean(parsed.detail && !parsed.start && editingId);
    start.required = !legacy;
    group.querySelector('#legacyScheduleHint').classList.toggle('hidden', !parsed.detail || Boolean(parsed.start));
    start.setCustomValidity(''); end.setCustomValidity('');
    sync();
    [start,end].forEach(input => input.dispatchEvent(new Event('change')));
  }
  function sync() {
    end.min = start.value || '';
    end.setCustomValidity(end.value && (!start.value || end.value < start.value) ? '종료일은 운영 시작일 이후로 입력해 주세요.' : '');
    descriptor.set.call(original, window.nurimFormatSchedule(start.value,end.value,detail.value));
  }
  // Apply extracted dates independently: existing detail text must not block empty date fields.
  window.nurimApplyScheduleDraft = value => {
    const parsed=window.nurimParseSchedule(value);
    const entered=input=>Boolean(input.value || [...(input.closest('.scrollDateInput')?.querySelectorAll('select')||[])].some(select=>select.value));
    let changed=false;
    if(parsed.start&&!entered(start)){start.value=parsed.start;changed=true;}
    if(parsed.end&&!entered(end)&&start.value&&parsed.end>=start.value){end.value=parsed.end;changed=true;}
    if(!detail.value.trim()&&parsed.detail){detail.value=parsed.detail;changed=true;}
    if(changed){sync();[start,end].forEach(input=>{if(input.value)input.dispatchEvent(new Event('change'));});}
    group.querySelector('#legacyScheduleHint').classList.toggle('hidden',!detail.value||Boolean(start.value));
    return changed;
  };
  Object.defineProperty(original, 'value', {configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);read(value);}});
  group.addEventListener('input', sync); group.addEventListener('change', sync);
  group.querySelector('#clearOperationEnd').addEventListener('click', () => {end.value='';end.dispatchEvent(new Event('change',{bubbles:true}));});
  form.addEventListener('reset', () => setTimeout(() => {descriptor.set.call(original, '');read('');}, 0));
  document.addEventListener('submit', event => {
    if (event.target !== form) return;
    if (!document.querySelector('#programDisabilityTypeOptions input:checked')) {
      event.preventDefault();event.stopImmediatePropagation();
      alert('장애유형 대분류를 하나 이상 선택해 주세요. 기존 분류를 확인해 주세요.');
      document.querySelector('#programDisabilityTypeOptions input')?.focus();return;
    }
    sync();
    if (!start.checkValidity() || !end.checkValidity()) {
      event.preventDefault();event.stopImmediatePropagation();
      (start.checkValidity() ? end : start).reportValidity();
    }
  }, true);
  read(original.value);

  // Align each visible row without truncating titles or long metadata.
  const cards = document.querySelector('#programs');
  let frame;
  function align() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const articles = [...cards.querySelectorAll('.card')];
      const selectors = ['.cardTop','.programLabels','h2',...Array.from({length:6},(_,i)=>`.meta > div:nth-child(${i+1})`)];
      articles.forEach(card => selectors.forEach(selector => {const el=card.querySelector(selector);if(el)el.style.minHeight='';}));
      const rows = new Map();
      articles.forEach(card => {const top=Math.round(card.getBoundingClientRect().top);if(!rows.has(top))rows.set(top,[]);rows.get(top).push(card);});
      rows.forEach(row => {
        if(row.length<2)return;
        selectors.forEach(selector => {const els=row.map(card=>card.querySelector(selector)).filter(Boolean);const height=Math.max(...els.map(el=>el.getBoundingClientRect().height));els.forEach(el=>el.style.minHeight=height+'px');});
      });
    });
  }
  new MutationObserver(align).observe(cards,{childList:true,subtree:true});
  let lastWidth=0;
  new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==lastWidth){lastWidth=width;align();}}).observe(cards);
  new MutationObserver(align).observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
  document.fonts?.ready.then(align);window.addEventListener('resize',align);align();
})();
