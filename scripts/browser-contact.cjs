const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),writes=[],errors=[],alerts=[];
const pid='11111111-1111-4111-8111-111111111111';
const server=http.createServer((req,res)=>{const file=path.join(root,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
 await page.route('**/config.local.js',route=>route.fulfill({contentType:'text/javascript',body:'window.NURIM_CONFIG={supabaseUrl:"https://mock.supabase.co",publishableKey:"public-test-key",anonKey:"test-anon-key"};'}));
 await page.route('**/assets/supabase-js-2.min.js*',route=>route.fulfill({contentType:'text/javascript',path:path.join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js')}));
 await page.route('**/*supabase.co/**',async route=>{const req=route.request();let b={};try{b=req.postDataJSON()||{};}catch{}let data=[];
  if(req.url().includes('/functions/')){if(b.action==='public')data={ok:true,program:{id:pid,title:'가상 프로그램'},revision:1,schema:{title:'추가 설문',description:'',questions:[{id:'q',label:'희망 활동',type:'text',required:true,options:[]}]}};else{if(b.action==='submit')writes.push(b);data={ok:true,surveys:[]};}}
  else if(req.url().includes('/auth/'))data={user:null,session:null};
  else if(req.method()==='POST'&&req.url().includes('/rest/v1/applications')){writes.push(b);data=b;}
  else if(req.url().includes('/storage/'))data={Key:'test-file'};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(process.env.NURIM_TEST_URL||'http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.NurimGuardian&&window.NurimSurvey);await page.waitForTimeout(250);
 async function open(kind){await page.evaluate(({pid,kind})=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();const p=normalizeProgram({...defaultPrograms[0],id:pid,centerId:'22222222-2222-4222-8222-222222222222',surveyId:kind==='survey'?'survey-test':null,consentEnabled:true,consentItems:[{id:'basic',type:'radio',title:'개인정보 동의',text:'가상 동의',enabled:true}],formEnabled:kind==='file',formTemplate:kind==='file'?{name:'양식.pdf',dataUrl:'data:application/pdf;base64,JVBERg=='}:null,centerName:'가상 기관',startDate:'2026-01-01',endDate:'2099-12-31'});programs=[p];window.testProgram=p;openApply(p);},{pid,kind});}
 async function birth(year){await page.locator('#applyDialog').getByLabel('생년월일 연도',{exact:true}).selectOption(year);await page.locator('#applyDialog').getByLabel('생년월일 월',{exact:true}).selectOption('01');await page.locator('#applyDialog').getByLabel('생년월일 일',{exact:true}).selectOption('01');}
 for(const kind of ['basic','file','survey']){
  await open(kind);await page.locator('#name').fill('시험 아동');await page.locator('#phone').fill('01000000000');await page.locator('#type').selectOption({label:'장애 당사자'});await birth('2020');
  assert(await page.locator('#guardianFields').isVisible());await page.locator('#goConsent').click();assert.match(alerts.at(-1),/보호자/);
  await page.locator('#guardianName').fill('가상 보호자');await page.locator('#guardianSignature').fill('가상 보호자');await page.locator('#guardianAgree').check();
  assert.equal(await page.evaluate(()=>document.querySelector('#guardianFields').scrollWidth>document.querySelector('#guardianFields').clientWidth),false);
  if(kind==='file')await page.locator('#applicantFile').setInputFiles({name:'가상신청서.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fictional test')});
  await page.locator('#goConsent').click();await page.locator('#applyStepConsent').waitFor({state:'visible'});
  assert.match(await page.locator('#guardianConsentSummary').innerText(),/시험 아동[\s\S]*가상 보호자/);
  await page.locator('#consentItems input[value="agree"]').check();await page.locator('#signature').fill('시험 아동');
  if(kind==='basic'){fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/v107-guardian-consent-mobile.png'),fullPage:true});}
  await page.locator('#applySubmitButton').click();
  if(kind==='survey'){const frame=page.frameLocator('#nurimSurveyDialog iframe');await frame.locator('[name="answer_q"]').fill('가상 응답');await frame.locator('button[type="submit"]').click();await frame.getByRole('heading',{name:'제출이 완료되었습니다.'}).waitFor();assert.equal(writes.at(-1).extra.guardian.name,'가상 보호자');}
  else{await page.waitForFunction(()=>!document.querySelector('#applySubmitButton').disabled);await page.waitForTimeout(200);assert.equal(writes.at(-1).guardian_name,'가상 보호자');assert.equal(writes.at(-1).signature,'시험 아동');}
 }
 await open('basic');await birth('2020');await page.locator('#guardianName').fill('가상 보호자');await page.locator('#guardianSignature').fill('가상 보호자');await page.locator('#guardianAgree').check();await birth('2000');assert(!(await page.locator('#guardianFields').isVisible()));assert.equal(await page.locator('#guardianName').inputValue(),'');assert.equal(await page.evaluate(()=>window.NurimGuardian.collect()),null);
 await page.evaluate(()=>{window.NurimPolicyContact={operatorName:'공통 기관',phone:'032-111-1111'};updateMinorConsentContact({centerName:'첫 기관',contactPhone:'032-222-2222'});});
 assert.equal(await page.locator('[data-program-consent="center"]').textContent(),'첫 기관');
 assert.equal(await page.locator('[data-program-consent="phone"]').textContent(),'032-222-2222');
 await page.evaluate(()=>updateMinorConsentContact({centerName:'다른 기관',contactPhone:''}));
 assert.equal(await page.locator('[data-program-consent="center"]').textContent(),'다른 기관');
 assert.equal(await page.locator('[data-program-consent="phone"]').textContent(),'032-111-1111');
 assert.equal(await page.locator('#extractPromotionLinkDraft').isVisible(),false);

 assert.equal(await page.locator('#extractPromotionDraft').count(),1);
 console.log('PASS: per-program contact, other institution fallback, paused link input, poster OCR retained');
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const sizes=await page.locator('#a11yTextSize,#a11yContrast,#adminOpen').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize,width:n.getBoundingClientRect().width})));assert.equal(new Set(sizes.map(s=>s.height)).size,1);assert.equal(new Set(sizes.map(s=>s.font)).size,1);assert.equal(new Set(sizes.map(s=>s.width)).size,1);}
 await page.screenshot({path:path.join(root,'artifacts/header-mobile.png')});
 console.log('PASS: equal header control dimensions at desktop and mobile widths');
 await page.goto(new URL('/admin.html',page.url()).href);await page.locator('#adminDialog').waitFor({state:'visible'});
 await page.locator('#adminA11yTextSize').click();assert.equal(await page.locator('html').getAttribute('class').then(s=>s.includes('a11yLargeText')),true);assert.equal(await page.locator('#a11yTextSize').getAttribute('aria-pressed'),'true');
 await page.locator('#adminA11yContrast').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('html').getAttribute('class').then(s=>s.includes('a11yHighContrast')),true);
 await page.screenshot({path:path.join(root,'artifacts/admin-accessibility.png')});
 await page.locator('#adminA11yTextSize').click();await page.locator('#adminA11yContrast').click();assert.equal(await page.locator('#a11yContrast').getAttribute('aria-pressed'),'false');
 console.log('PASS: admin large text and contrast keyboard toggle; shared state synchronized');
 await page.evaluate(()=>{document.querySelector('#loginBox').classList.add('hidden');document.querySelector('#adminPanel').classList.remove('hidden');switchAdminTab('programCreate');setProgramRegistrationStep('basic');});
 assert.equal(await page.locator('#detailUrl').isVisible(),true);await page.locator('#detailUrl').fill('https://example.org/program');assert.equal(await page.locator('#detailUrl').inputValue(),'https://example.org/program');
 assert.equal(await page.locator('#extractPromotionLinkDraft').isVisible(),false);assert.equal(await page.locator('#extractPromotionDraft').isVisible(),true);assert.match(await page.locator('#promotionDraftStatus').innerText(),/이미지·PDF 홍보지/);assert.doesNotMatch(await page.locator('#promotionDraftStatus').innerText(),/홈페이지 주소 또는/);console.log('PASS: v109 website URL input restored, link import hidden, poster import retained');
 assert.deepEqual(errors,[]);console.log('PASS: basic/file/survey payloads, missing guardian blocked, both names shown, mobile layout, adult clears guardian; all network writes mocked');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
