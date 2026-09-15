(() => {
  const form=document.querySelector('#searchConfigForm');
  form.querySelector('.sectionHelp').textContent='필요한 항목만 펼쳐 수정한 뒤 아래 저장 버튼을 눌러 주세요. 접어도 입력한 내용은 유지됩니다.';
  const sections=[
    ['configProgramCategories','활동분류·아이콘','활동 이름과 컬러 아이콘 선택'],
    ['configDisabilityTypes','장애유형','현재 제공하는 대분류 확인'],
    ['configAudienceTypes','참여대상','참여대상 분류 추가·수정'],
    ['configCenters','복지관 목록','기관 이름 추가·수정'],
    ['configAgeGroups','이용 연령','연령 분류 추가·수정']
  ];
  sections.forEach(([id,title,hint])=>{
    const field=document.getElementById(id),label=field.closest('label');
    const details=document.createElement('details');details.className='compactSetting';
    const summary=document.createElement('summary');const heading=document.createElement('strong');heading.textContent=title;
    const description=document.createElement('span');description.textContent=hint;summary.append(heading,description);
    const body=document.createElement('div');body.className='compactSettingBody';
    form.querySelector('.formActions').before(details);details.append(summary,body);body.append(label);
    field.rows=5;
    if(id==='configProgramCategories'){
      details.classList.add('activitySetting');body.classList.add('activitySettingBody');
      const names=document.createElement('fieldset');names.className='activityNamesPanel';
      const legend=document.createElement('legend');legend.textContent='프로그램 활동분류';
      label.firstChild.textContent='';field.setAttribute('aria-label','프로그램 활동분류');
      names.append(legend,label);body.append(names,document.querySelector('.activityIconSettings'));
    }
  });
  // Preserve original forms and IDs so authentication and submission hooks remain unchanged.
  ['superPasswordForm','managerForm'].forEach(id=>{
    const panel=document.getElementById(id);if(!panel)return;
    const heading=panel.querySelector('h3'),details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
    details.className='compactSetting';body.className='compactSettingBody';summary.textContent=heading.textContent;heading.remove();
    while(panel.firstChild)body.append(panel.firstChild);
    details.append(summary,body);panel.append(details);
    panel.addEventListener('invalid',()=>{details.open=true;},true);
  });
})();
