(() => {
 const state={query:'',center:'all',page:1,size:10,open:null};
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 function mount(list,managers,centers){
  const rows=[...list.querySelectorAll(':scope>details.accountRow')];
  let top=document.querySelector('#managerDirectoryTop');
  if(!top){top=make('section','managerDirectoryTop');top.id='managerDirectoryTop';list.before(top);}
  const audit=document.querySelector('#programOwnershipTool');if(audit)top.append(audit);
  document.querySelector('#managerDirectoryControls')?.remove();
  const quick=make('section','managerDirectoryControls');quick.id='managerDirectoryControls';
  const intro=make('div','directoryIntro');intro.append(make('h3','','기관 담당자 빠른 확인'),make('p','','복지관을 선택해 담당자를 확인하세요.'));
  const label=make('label','directoryCenter','복지관'),filter=make('select');filter.id='managerDirectoryCenterFilter';label.append(filter);quick.append(intro,label);top.append(quick);
  filter.add(new Option('전체 복지관','all'));
  centers.filter(c=>managers.some(m=>m.centerId===c.id)).forEach(c=>filter.add(new Option(c.name,c.id)));
  if(![...filter.options].some(o=>o.value===state.center))state.center='all';filter.value=state.center;
  let shell=document.querySelector('#managerDirectoryShell');
  if(!shell){shell=make('details','managerDirectoryShell');shell.id='managerDirectoryShell';list.before(shell);}
  shell.replaceChildren();const shellHeading=make('summary','directoryTitle','기관 담당자 목록');shell.append(shellHeading);
  const content=make('div','directoryBody');shell.append(content);
  const toolbar=make('div','directoryToolbar'),searchLabel=make('label','directorySearch');
  searchLabel.append(make('span','visuallyHidden','담당자 이름, 복지관 또는 기관 이메일 검색'));
  const search=make('input');search.type='search';search.placeholder='담당자 이름, 복지관 또는 기관 이메일 검색';search.value=state.query;searchLabel.append(search);
  const reset=make('button','','초기화');reset.type='button';
  const sizeLabel=make('label','directorySize');sizeLabel.append(make('span','visuallyHidden','페이지당 담당자 수'));
  const size=make('select');[10,20,50].forEach(n=>size.add(new Option(n+'명씩 보기',String(n))));size.value=state.size;sizeLabel.append(size);toolbar.append(searchLabel,reset,sizeLabel);
  const count=make('p','directoryCount');count.setAttribute('role','status');count.setAttribute('aria-live','polite');
  const heading=make('div','directoryColumnHead');heading.setAttribute('aria-hidden','true');['담당자','복지관','기관 이메일','관리'].forEach(t=>heading.append(make('span','',t)));
  const empty=make('p','directoryEmpty','검색 조건에 맞는 담당자가 없습니다.'),nav=make('nav','directoryPagination');nav.setAttribute('aria-label','담당자 목록 페이지');
  content.append(toolbar,count,heading,list,empty,nav);content.append(make('p','directoryFootnote','기관 이메일은 관리자 아이디와 동일합니다. 상세 설정은 한 명씩 펼칩니다.'));
  rows.forEach((row,i)=>{
   const m=managers[i],summary=row.querySelector('summary');row.dataset.managerId=m.id;
   summary.replaceChildren(make('strong','directoryName',m.displayName||'이름 미등록'),make('span','directoryInstitution',m.centerName||'복지관 미지정'),make('span','directoryEmail',m.email||'미등록'),make('span','managerSummaryAction','상세보기'));
   row.open=state.open===m.id;
   row.addEventListener('toggle',()=>{if(row.open){state.open=m.id;rows.forEach(other=>{if(other!==row)other.open=false;});}else if(state.open===m.id)state.open=null;});
  });
  function draw(){
   const query=state.query.trim().toLocaleLowerCase();
   const matching=managers.map((m,i)=>({m,row:rows[i]})).filter(({m})=>(state.center==='all'||m.centerId===state.center)&&[m.displayName,m.centerName,m.email].some(v=>String(v||'').toLocaleLowerCase().includes(query)));
   const pages=Math.max(1,Math.ceil(matching.length/state.size));state.page=Math.max(1,Math.min(state.page,pages));
   const start=(state.page-1)*state.size,visible=new Set(matching.slice(start,start+state.size).map(x=>x.row));
   rows.forEach(row=>row.hidden=!visible.has(row));empty.hidden=matching.length>0;
   count.textContent='전체 '+managers.length+'명 · 검색 결과 '+matching.length+'명'+(matching.length?' 중 '+(start+1)+'–'+Math.min(start+state.size,matching.length)+'명 표시':'');
   nav.replaceChildren();
   const button=(text,page,disabled=false)=>{const b=make('button','',text);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>{state.page=page;draw();nav.querySelector('[aria-current]')?.focus();});nav.append(b);return b;};
   button('이전',state.page-1,state.page===1);
   const numbers=[...new Set([1,...Array.from({length:5},(_,i)=>state.page-2+i).filter(n=>n>0&&n<=pages),pages])].sort((a,b)=>a-b);
   numbers.forEach((n,i)=>{if(i&&n-numbers[i-1]>1)nav.append(make('span','','…'));const b=button(String(n),n);b.setAttribute('aria-label',n+'페이지');if(n===state.page)b.setAttribute('aria-current','page');});
   button('다음',state.page+1,state.page===pages);nav.hidden=matching.length===0;
  }
  search.addEventListener('input',()=>{state.query=search.value;state.page=1;draw();});
  filter.addEventListener('change',()=>{state.center=filter.value;state.page=1;shell.open=true;draw();});
  size.addEventListener('change',()=>{state.size=Number(size.value);state.page=1;draw();});
  reset.addEventListener('click',()=>{state.query='';state.center='all';state.page=1;search.value='';filter.value='all';draw();search.focus();});
  draw();
 }
 window.nurimManagerDirectory={mount};
})();
