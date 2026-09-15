(() => {
  const physical = /지체|뇌병변|시각|청각|언어|신장|심장|호흡기|간장애|안면|장루|요루|뇌전증|신체/;
  window.nurimBroadDisabilities = (values) => {
    if (!Array.isArray(values) || !values.length) return ['전체 장애유형'];
    return [...new Set(values.map(value => {
      if (/발달|지적|자폐/.test(value)) return '발달장애';
      if (value === '정신장애' || value === '비장애') return value;
      if (physical.test(value)) return '신체장애';
      if (value === '전체 장애유형') return value;
      return '분류 확인 필요';
    }))];
  };
  window.nurimMatchesDisability = (values, filter) => {
    const broad = window.nurimBroadDisabilities(values);
    return filter === 'all' || broad.includes(filter) ||
      (filter !== '비장애' && broad.includes('전체 장애유형'));
  };
  window.nurimParseSchedule = (value) => {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s*[~～∼]\s*(\d{4}-\d{2}-\d{2}))?(?:\s*\n([\s\S]*))?$/);
    const valid = (y,m,d) => {const dt=new Date(Date.UTC(+y,+m-1,+d));return dt.getUTCFullYear()===+y&&dt.getUTCMonth()===+m-1&&dt.getUTCDate()===+d;};
    const iso = (y,m,d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(match && valid(...match[1].split('-')) && (!match[2] || (valid(...match[2].split('-')) && match[2]>=match[1])))return {start:match[1],end:match[2]||'',detail:match[3]||''};
    const cleaned=text.replace(/^(?:(?:실제|프로그램)\s*)?(?:(?:운영|진행|활동|교육|수업|강의|행사|실시|사업)\s*)?(?:기간|일정|일시|날짜)\s*[:：]?\s*/,'');
    const date=cleaned.match(/(20\d{2})\s*[.\/년-]\s*(\d{1,2})\s*[.\/월-]\s*(\d{1,2})\s*일?\.?\s*(?:\([월화수목금토일](?:요일)?\))?/);
    if(!date || !valid(date[1],date[2],date[3]))return {start:'',end:'',detail:text};
    const prefix=cleaned.slice(0,date.index).trim();
    const start=iso(date[1],date[2],date[3]);let rest=cleaned.slice(date.index+date[0].length),end='';
    if(/^\s*(?:[~～∼–—-]|부터)/.test(rest)){
      const range=rest.match(/^\s*(?:[~～∼–—-]|부터)\s*(?:(20\d{2})\s*[.\/년-]\s*)?(?:(\d{1,2})\s*[.\/월-]\s*)?(\d{1,2})\s*일?\.?\s*(?:\([월화수목금토일](?:요일)?\))?(?:까지)?/);
      if(!range || !valid(range[1]||date[1],range[2]||date[2],range[3]))return {start:'',end:'',detail:text};
      end=iso(range[1]||date[1],range[2]||date[2],range[3]);if(end<start)return {start:'',end:'',detail:text};rest=rest.slice(range[0].length);
    }
    return {start,end,detail:[prefix,rest.replace(/^[\s/,:：]+/,'').trim()].filter(Boolean).join(' ')};
  };
  window.nurimFormatSchedule = (start, end, detail) => [start + (end && end !== start ? ' ~ ' + end : ''), detail.trim()].filter(Boolean).join('\n');
})();
