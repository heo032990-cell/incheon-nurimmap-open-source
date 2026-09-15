(() => {
 const panel=document.querySelector('#programSearch'),filters=document.querySelector('#programFilters'),toggle=document.querySelector('#toggleSearchFilters');
 if(!panel||!filters||!toggle)return;
 let choice=null,compact=false;
 function apply(){const open=!compact||(choice===true);panel.classList.toggle('compactSearch',compact);panel.classList.toggle('filtersCollapsed',!open);toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'검색조건 접기':'검색조건 펼치기';}
 toggle.addEventListener('click',()=>{choice=toggle.getAttribute('aria-expanded')!=='true';apply();});
 new ResizeObserver(()=>{const next=panel.clientWidth<1050;if(next!==compact){compact=next;choice=null;}apply();}).observe(panel);
 document.querySelector('#resetFilters')?.addEventListener('click',()=>{choice=null;apply();});
 compact=panel.clientWidth<1050;apply();
})();
