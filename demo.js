'use strict';
const programs=[
{title:'함께 걷는 동네 산책',area:'부평구',category:'신체활동',text:'편안한 속도로 함께 걷고 이웃을 만나는 활동입니다. 예제기관 A의 가상 프로그램입니다.'},
{title:'색으로 만나는 나의 하루',area:'남동구',category:'문화·여가',text:'다양한 색과 재료로 일상의 이야기를 표현합니다. 예제기관 B의 가상 프로그램입니다.'},
{title:'생활 속 디지털 첫걸음',area:'연수구',category:'교육',text:'생활에 필요한 디지털 기초를 천천히 익힙니다. 예제기관 C의 가상 프로그램입니다.'},
{title:'가족과 만드는 주말 정원',area:'서구',category:'가족지원',text:'가족과 함께 작은 화분을 만들고 돌보는 활동입니다. 예제기관 D의 가상 프로그램입니다.'},
{title:'리듬을 따라 움직여요',area:'미추홀구',category:'신체활동',text:'음악에 맞추어 즐겁게 몸을 움직이는 활동입니다. 예제기관 E의 가상 프로그램입니다.'},
{title:'책으로 여는 이야기 모임',area:'계양구',category:'문화·여가',text:'책을 함께 읽고 각자의 생각을 나눕니다. 예제기관 F의 가상 프로그램입니다.'}
];
const query=document.getElementById('query'),category=document.getElementById('category'),cards=document.getElementById('cards'),dialog=document.getElementById('detail');
function render(){const value=query.value.trim().toLowerCase();const matches=programs.filter(p=>(p.title+' '+p.area).toLowerCase().includes(value)&&(category.value==='전체 활동'||category.value===p.category));cards.replaceChildren();document.getElementById('count').textContent='가상 프로그램 '+matches.length+'개';
for(const p of matches){const card=document.createElement('button');card.type='button';card.className='card';for(const [tag,cls,text] of [['span','tag',p.category],['h3','',p.title],['p','',p.area+' · 예제 프로그램'],['span','more','상세 보기 →']]){const e=document.createElement(tag);e.className=cls;e.textContent=text;card.append(e);}card.onclick=()=>{document.getElementById('detailTitle').textContent=p.title;document.getElementById('detailCategory').textContent=p.area+' · '+p.category;document.getElementById('detailText').textContent=p.text;dialog.showModal();};cards.append(card);}
if(!matches.length){const p=document.createElement('p');p.textContent='검색 결과가 없습니다. 다른 검색어나 활동을 선택해 주세요.';cards.append(p);}}
query.addEventListener('input',render);category.addEventListener('change',render);render();
