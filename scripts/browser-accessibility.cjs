const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);const file=path.join(root,p==='/'||/^\/\d+\//.test(p)?'index.html':p);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
const schema={title:'접근성 설문',description:'점검 전용',questions:[
 {id:'text',type:'text',label:'희망 활동',help:'원하는 활동을 입력하세요',required:true},
 {id:'long',type:'textarea',label:'추가 의견',required:false},
 {id:'select',type:'select',label:'참여 시간',options:['오전','오후'],required:false},
 {id:'date',type:'date',label:'희망 날짜',required:false},
 {id:'rank',type:'rank',label:'활동 우선순위',options:['독서','산책','미술'],rankCount:2,required:true},
 {id:'checks',type:'checkbox',label:'관심 분야',options:['가','나','다'],selectionMode:'exact',selectionCount:2,required:true}
]};
(async()=>{let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.route('**/config.local.js',route=>route.fulfill({contentType:'text/javascript',body:'window.NURIM_CONFIG={supabaseUrl:"https://mock.supabase.co",publishableKey:"public-test-key",anonKey:"test-anon-key"};'}));
 await page.route('**/assets/supabase-js-2.min.js*',route=>route.fulfill({contentType:'text/javascript',path:path.join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js')}));
 await page.route('**/*supabase.co/**',async route=>{const req=route.request();let body={};try{body=req.postDataJSON()||{};}catch{}
  if(body.action==='submit')throw Error('Unexpected real submission attempt');
  const data=req.url().includes('/functions/')?(body.action==='public'?{ok:true,program:{id:'a11y-open',title:'접근성 열린 프로그램'},revision:1,schema}:{ok:true,surveys:[],role:'manager'}):req.url().includes('/auth/')?{user:null,session:null}:[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(process.env.NURIM_TEST_URL||'http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.NurimSurvey);
 await page.evaluate(()=>{programs=[normalizeProgram({id:'a11y-open',title:'접근성 열린 프로그램',audience:'지역주민',description:'키보드 점검',centerName:'점검기관',ageGroup:'성인',activityCategory:'교육활동',disabilityTypes:['전체 장애유형'],startDate:'2020-01-01',endDate:'2099-12-31',capacity:0,selectionMethod:'lottery',surveyId:'survey-test',consentEnabled:true,consentItems:[{id:'one',title:'정보 수집 동의',text:'점검용 설명',type:'radio',enabled:true},{id:'two',title:'선택적 활용 동의',text:'점검용 설명',type:'matrix',rows:[{id:'photo',label:'사진 활용'}],enabled:true}]}),normalizeProgram({id:'a11y-future',title:'접근성 예정 프로그램',audience:'지역주민',description:'예정',centerName:'다른기관',ageGroup:'성인',activityCategory:'교육활동',disabilityTypes:['전체 장애유형'],startDate:'2099-01-01',endDate:'2099-12-31',capacity:0})];renderPrograms();});
 const search=page.getByRole('searchbox',{name:'프로그램 검색',exact:true});
 await search.fill('예정');await page.waitForFunction(()=>document.querySelector('#a11yLive').textContent.includes('1개'));
 assert.equal(await page.locator('#programs .card').count(),1);assert.match(await page.locator('#programs').innerText(),/제한 없음/);assert.match(await page.locator('#programs .apply').innerText(),/모집예정/);
 await search.fill('없는 결과');await page.waitForFunction(()=>document.querySelector('#a11yLive').textContent.includes('0개'));assert.equal(await page.locator('#programs .card').count(),0);
 await search.fill('열린');await page.waitForFunction(()=>document.querySelector('#a11yLive').textContent.includes('1개'));assert.equal(await page.locator('#resultSummary').getAttribute('aria-live'),null);
 const opener=page.locator('#programs .apply');await opener.press('Enter');await page.locator('#applyDialog[open]').waitFor();
 const dlg=page.locator('#applyDialog');await dlg.getByRole('textbox',{name:'이름',exact:true}).fill('접근성점검');await dlg.getByRole('textbox',{name:'연락처',exact:true}).fill('01000000000');
 await dlg.getByRole('combobox',{name:'생년월일 연도',exact:true}).selectOption('1990');await dlg.getByRole('combobox',{name:'생년월일 월',exact:true}).selectOption('01');await dlg.getByRole('combobox',{name:'생년월일 일',exact:true}).selectOption('01');await dlg.getByRole('combobox',{name:'참여자 구분',exact:true}).selectOption({label:'지역주민'});
 await page.locator('#goConsent').press('Enter');await page.waitForFunction(()=>document.activeElement.id==='applyStepConsent-heading');
 assert.equal(await dlg.getByRole('radiogroup',{name:'정보 수집 동의',exact:true}).count(),1);assert.equal(await dlg.getByRole('radiogroup',{name:'선택적 활용 동의 사진 활용',exact:true}).count(),1);
 await page.locator('#backInfo').press('Enter');await page.waitForFunction(()=>document.activeElement.id==='applyStepInfo-heading');assert.equal(await page.locator('#name').inputValue(),'접근성점검');
 // Replacing the card must not prevent returning to the program's button.
 await page.evaluate(()=>renderPrograms());await page.locator('#applyClose').press('Enter');await page.waitForFunction(()=>document.activeElement.matches('#programs .apply'));
 await opener.press('Enter');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.matches('#programs .apply'));
 // Reopen and check the complete base-form → survey → back handoff, using mocked endpoints only.
 await opener.press('Enter');await page.locator('#name').fill('접근성점검');await page.locator('#phone').fill('01000000000');await dlg.getByRole('combobox',{name:'생년월일 연도',exact:true}).selectOption('1990');await dlg.getByRole('combobox',{name:'생년월일 월',exact:true}).selectOption('01');await dlg.getByRole('combobox',{name:'생년월일 일',exact:true}).selectOption('01');await page.locator('#type').selectOption({label:'지역주민'});await page.locator('#goConsent').click();
 await dlg.getByRole('radiogroup',{name:'정보 수집 동의',exact:true}).getByRole('radio',{name:'동의함',exact:true}).check();await dlg.getByRole('radiogroup',{name:'선택적 활용 동의 사진 활용',exact:true}).getByRole('radio',{name:'동의함',exact:true}).check();await page.locator('#signature').fill('접근성점검');await page.locator('#applySubmitButton').click();
 const frame=page.frameLocator('#nurimSurveyDialog iframe');await frame.getByRole('heading',{name:'접근성 설문',exact:true}).waitFor();
 assert.equal(await frame.getByRole('textbox',{name:'희망 활동',exact:false}).count(),1);assert.equal(await frame.getByRole('textbox',{name:'추가 의견',exact:true}).count(),1);assert.equal(await frame.getByRole('combobox',{name:'참여 시간',exact:true}).count(),1);assert.equal(await frame.getByLabel('희망 날짜',{exact:true}).count(),1);
 assert.equal(await frame.getByRole('combobox',{name:/활동 우선순위.*1순위/}).count(),1);assert.equal(await frame.getByRole('combobox',{name:/활동 우선순위.*2순위/}).count(),1);
 await frame.getByRole('textbox',{name:/희망 활동/}).fill('독서');await frame.getByRole('combobox',{name:/활동 우선순위.*1순위/}).selectOption('독서');await frame.getByRole('combobox',{name:/활동 우선순위.*2순위/}).selectOption('산책');await frame.getByRole('checkbox',{name:'가',exact:true}).check();await frame.getByRole('button',{name:'신청서 제출',exact:true}).click();
 assert.match(await frame.locator('#status').innerText(),/2개/);assert.equal(await frame.getByRole('checkbox',{name:'가',exact:true}).getAttribute('aria-invalid'),'true');
 await frame.getByRole('checkbox',{name:'나',exact:true}).check();assert.equal(await frame.getByRole('checkbox',{name:'가',exact:true}).getAttribute('aria-invalid'),null);
 await frame.getByRole('button',{name:'이전: 신청정보·동의',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#applyDialog').open);assert.equal(await page.locator('#signature').inputValue(),'접근성점검');assert(await page.locator('#applyDialog').evaluate(d=>d.contains(document.activeElement)));
 await page.locator('#applySubmitButton').click();assert.equal(await frame.getByRole('textbox',{name:/희망 활동/}).inputValue(),'독서');await page.locator('#nurimSurveyDialog > .dialogTitle button').press('Enter');await page.waitForFunction(()=>document.activeElement.matches('#programs .apply'));
 assert.deepEqual(errors,[]);console.log('PASS: search/count/status, named consent groups, step focus, rerender/Escape focus restoration, all survey labels, validation focus, survey handoff and preserved answers. No backend writes.');
 }finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
