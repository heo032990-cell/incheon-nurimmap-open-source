(() => {
  const defaults = {
    programCategories: ["신체활동", "문화·여가활동", "교육활동", "자조모임", "가족지원", "기타"],
    disabilityTypes: ["전체 장애유형", "발달장애", "신체장애", "정신장애", "비장애"],
    audienceTypes: ["장애 당사자", "가족·보호자", "지역주민", "기타"]
  };
  let taxonomy = JSON.parse(JSON.stringify(defaults));
  const iconChoices = [['🔵','기본'],['☀️','신체활동'],['🎵','음악·문화'],['📚','교육'],['👥','모임'],['💗','가족·돌봄'],['🧩','기타'],['💼','직업·취업'],['🎨','미술'],['🍳','요리'],['🌿','자연'],['⚽','스포츠'],['🚌','여행·이동'],['💬','상담'],['🤝','교류'],['⭐','별']];
  const oldIcons={'•':'🔵','☀':'☀️','♫':'🎵','▤':'📚','♧':'👥','♡':'💗','⋯':'🧩'};
  const normalizeIcon=value=>Object.hasOwn(oldIcons,value)?oldIcons[value]:value;
  const defaultIcons = {'신체활동':'☀️','문화·여가활동':'🎵','교육활동':'📚','자조모임':'👥','가족지원':'💗','기타':'🧩'};
  const validIcon = value => iconChoices.some(([icon])=>icon===value);
  let categoryIcons = {};
  let draftIcons = {};
  const iconFor = name => Object.hasOwn(categoryIcons,name)&&validIcon(categoryIcons[name]) ? categoryIcons[name] : Object.hasOwn(defaultIcons,name)?defaultIcons[name]:'🔵';
  const iconPanel=document.createElement('fieldset');
  iconPanel.className='activityIconSettings';
  iconPanel.innerHTML='<legend>활동분류 아이콘</legend><p>분류를 고른 뒤 아이콘을 선택하세요. 다른 분류로 이동해도 선택한 내용은 유지됩니다.</p><div id="activityIconEditors"><label>1. 활동분류<select id="iconCategoryChoice"></select></label><label>2. 컬러 아이콘<select id="iconSymbolChoice"></select></label></div><p id="iconSelectionPreview" aria-live="polite"></p>';
  const iconStatus=document.createElement('p');iconStatus.id='activityIconSaveStatus';iconStatus.setAttribute('role','status');iconStatus.setAttribute('aria-live','polite');
  document.querySelector('#searchConfigForm').append(iconStatus);
  document.querySelector('#configProgramCategories').closest('label').after(iconPanel);
  const categoryChoice=iconPanel.querySelector('#iconCategoryChoice');
  const symbolChoice=iconPanel.querySelector('#iconSymbolChoice');
  iconChoices.forEach(([icon,description])=>{const option=document.createElement('option');option.value=icon;option.textContent=icon+' '+description;symbolChoice.append(option);});
  const previewIcon=()=>{iconPanel.querySelector('#iconSelectionPreview').textContent='미리보기: '+symbolChoice.value+' '+categoryChoice.value;};
  function showChosenIcon(){const name=categoryChoice.value;symbolChoice.dataset.category=name;symbolChoice.value=Object.hasOwn(draftIcons,name)&&validIcon(draftIcons[name])?draftIcons[name]:iconFor(name);previewIcon();}
  categoryChoice.addEventListener('change',showChosenIcon);
  symbolChoice.addEventListener('change',()=>{draftIcons=Object.fromEntries([...Object.entries(draftIcons),[categoryChoice.value,symbolChoice.value]]);previewIcon();});
  function renderIconEditors(){
    const names=uniqueLines(document.querySelector('#configProgramCategories').value,defaults.programCategories);
    if(!names.includes('기타'))names.push('기타');
    const selected=categoryChoice.value;categoryChoice.replaceChildren();
    names.forEach(name=>{
      const option=document.createElement('option');option.value=name;option.textContent=name;categoryChoice.append(option);
    });
    if(names.includes(selected))categoryChoice.value=selected;showChosenIcon();
  }
  document.querySelector('#configProgramCategories').addEventListener('input',renderIconEditors);
  const db = window.incheonSupabase;
  const uniqueLines = (value, fallback) => {
    const values = [...new Set(String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
    return values.length ? values : fallback.slice();
  };
  const optionHtml = (values, firstValue, firstLabel) => `<option value="${firstValue}">${firstLabel}</option>` + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");

  programs = programs.map((program) => ({
    ...program,
    activityCategory: program.activityCategory || "기타",
    disabilityTypes: Array.isArray(program.disabilityTypes) && program.disabilityTypes.length ? program.disabilityTypes : ["전체 장애유형"],
    audienceType: program.audienceType || "기타",
    audienceOther: program.audienceOther || (program.audienceType === "기타" ? program.audience || "" : "")
  }));
  save(keys.programs, programs);

  const categorySection = document.createElement("section");
  categorySection.className = "activityCategoryTabs";
  categorySection.setAttribute("aria-label", "프로그램 활동분류");
  categorySection.innerHTML = '<strong>활동별 보기</strong><div id="activityCategoryButtons"></div><select id="activityCategoryFilter" class="visuallyHidden" aria-label="활동분류"><option value="all">전체</option></select>';
  (document.querySelector("#resultBanner") || document.querySelector("#resultSummary"))?.before(categorySection);

  function renderCategoryTabs() {
    const select = document.querySelector("#activityCategoryFilter");
    const selected = select.value || "all";
    select.innerHTML = optionHtml(taxonomy.programCategories, "all", "전체");
    select.value = taxonomy.programCategories.includes(selected) ? selected : "all";
    const buttons = document.querySelector("#activityCategoryButtons");
    buttons.replaceChildren();
    [{ value: "all", label: "전체" }, ...taxonomy.programCategories.map((value) => ({ value, label: value }))].forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = 'activityIcon';
      icon.textContent = item.value==='all' ? '🌱' : iconFor(item.value);
      button.append(icon, document.createTextNode(item.label));
      button.setAttribute('aria-pressed', String(select.value === item.value));
      button.classList.toggle("active", select.value === item.value);
      button.addEventListener("click", () => {
        select.value = item.value;
        renderCategoryTabs();
        renderPrograms();
      });
      buttons.append(button);
    });
  }

  function renderDisabilityChecks(selected = ["전체 장애유형"]) {
    selected = window.nurimBroadDisabilities(selected);
    const box = document.querySelector("#programDisabilityTypeOptions");
    box.innerHTML = taxonomy.disabilityTypes.map((value) => `<label><input type="checkbox" value="${esc(value)}" ${selected.includes(value) ? "checked" : ""}>${esc(value)}</label>`).join("");
    box.querySelectorAll('input[type="checkbox"]').forEach((input) => input.addEventListener("change", () => {
      if (input.value === "전체 장애유형" && input.checked) box.querySelectorAll('input[type="checkbox"]').forEach((item) => { if (item !== input && item.value !== "비장애") item.checked = false; });
      if (input.value !== "전체 장애유형" && input.value !== "비장애" && input.checked) box.querySelector('input[value="전체 장애유형"]')?.removeAttribute("checked");
      const all = box.querySelector('input[value="전체 장애유형"]');
      if (input.value !== "전체 장애유형" && input.value !== "비장애" && input.checked && all) all.checked = false;
      if (![...box.querySelectorAll('input:checked')].length && all) all.checked = true;
    }));
  }

  function applyTaxonomy() {
    const activity = document.querySelector("#programActivityCategory");
    const activityValue = activity.value;
    activity.innerHTML = optionHtml(taxonomy.programCategories, "", "선택");
    activity.value = taxonomy.programCategories.includes(activityValue) ? activityValue : "";
    const audience = document.querySelector("#programAudienceType");
    const audienceValue = audience.value;
    audience.innerHTML = optionHtml(taxonomy.audienceTypes, "", "선택");
    audience.value = taxonomy.audienceTypes.includes(audienceValue) ? audienceValue : "";
    const disabilityFilter = document.querySelector("#disabilityFilter");
    const disabilityValue = disabilityFilter.value;
    disabilityFilter.innerHTML = optionHtml(taxonomy.disabilityTypes.filter((value) => value !== "전체 장애유형"), "all", "전체 장애유형");
    disabilityFilter.value = taxonomy.disabilityTypes.includes(disabilityValue) ? disabilityValue : "all";
    const audienceFilter = document.querySelector("#audienceTypeFilter");
    const audienceFilterValue = audienceFilter.value;
    audienceFilter.innerHTML = optionHtml(taxonomy.audienceTypes, "all", "전체 참여대상");
    audienceFilter.value = taxonomy.audienceTypes.includes(audienceFilterValue) ? audienceFilterValue : "all";
    renderCategoryTabs();
    if (!document.querySelector("#programDisabilityTypeOptions input")) renderDisabilityChecks();
    document.querySelector("#configProgramCategories").value = taxonomy.programCategories.join("\n");
    document.querySelector("#configDisabilityTypes").value = taxonomy.disabilityTypes.join("\n");
    document.querySelector("#configDisabilityTypes").readOnly = true;
    document.querySelector("#configAudienceTypes").value = taxonomy.audienceTypes.join("\n");
    draftIcons={...categoryIcons};renderIconEditors();
  }

  async function loadTaxonomy() {
    if (!db) return applyTaxonomy();
    const { data, error } = await db.from("app_settings").select("*").eq("id", "global").maybeSingle();
    if (!error && data) {
      if (Array.isArray(data.program_categories) && data.program_categories.length) taxonomy.programCategories = data.program_categories;
      taxonomy.disabilityTypes = defaults.disabilityTypes.slice();
      if (Array.isArray(data.audience_types) && data.audience_types.length) taxonomy.audienceTypes = data.audience_types;
      if(data.activity_category_icons && typeof data.activity_category_icons==='object' && !Array.isArray(data.activity_category_icons)) categoryIcons=Object.fromEntries(Object.entries(data.activity_category_icons).map(([name,value])=>[name,normalizeIcon(value)]).filter(([,value])=>validIcon(value)));
    }
    applyTaxonomy();
    renderPrograms();
  }

  document.querySelector("#disabilityFilter").addEventListener("change", renderPrograms);
  document.querySelector("#audienceTypeFilter").addEventListener("change", renderPrograms);
  document.querySelector("#resetFilters").addEventListener("click", () => window.setTimeout(renderCategoryTabs, 0));
  document.querySelector("#programAudienceType").addEventListener("change", (event) => {
    const detail = document.querySelector("#audience");
    detail.placeholder = event.target.value === "기타" ? "기타 참여대상을 직접 입력" : "예: 성인 장애 당사자 10명";
    if (event.target.value !== "기타" && !detail.value.trim()) detail.value = event.target.value;
  });

  let pendingTaxonomy = null;
  document.querySelector("#programForm").addEventListener("submit", () => {
    pendingTaxonomy = {
      editingId,
      existingIds: new Set(programs.map((program) => program.id)),
      title: document.querySelector("#programTitle").value.trim(),
      activityCategory: document.querySelector("#programActivityCategory").value || "기타",
      disabilityTypes: [...document.querySelectorAll('#programDisabilityTypeOptions input:checked')].map((input) => input.value),
      audienceType: document.querySelector("#programAudienceType").value || "기타",
      audienceOther: document.querySelector("#programAudienceType").value === "기타" ? document.querySelector("#audience").value.trim() : ""
    };
  }, true);
  document.querySelector("#programForm").addEventListener("submit", () => {
    if (!pendingTaxonomy) return;
    const target = pendingTaxonomy.editingId
      ? programs.find((program) => program.id === pendingTaxonomy.editingId)
      : programs.find((program) => !pendingTaxonomy.existingIds.has(program.id) && program.title === pendingTaxonomy.title);
    if (target) Object.assign(target, { activityCategory: pendingTaxonomy.activityCategory, disabilityTypes: pendingTaxonomy.disabilityTypes.length ? pendingTaxonomy.disabilityTypes : ["전체 장애유형"], audienceType: pendingTaxonomy.audienceType, audienceOther: pendingTaxonomy.audienceOther });
    save(keys.programs, programs);
    pendingTaxonomy = null;
  });

  const fillProgramBeforeTaxonomy = fillProgram;
  fillProgram = function fillProgramWithTaxonomy(program) {
    fillProgramBeforeTaxonomy(program);
    document.querySelector("#programActivityCategory").value = program.activityCategory || "기타";
    document.querySelector("#programAudienceType").value = program.audienceType || "기타";
    renderDisabilityChecks(program.disabilityTypes || ["전체 장애유형"]);
  };
  const resetProgramBeforeTaxonomy = resetProgramForm;
  resetProgramForm = function resetProgramWithTaxonomy() {
    resetProgramBeforeTaxonomy();
    document.querySelector("#programActivityCategory").value = "";
    document.querySelector("#programAudienceType").value = "";
    renderDisabilityChecks();
  };

  document.querySelector("#searchConfigForm").addEventListener("submit", async () => {
    if (!isSuperAdmin()) return;
    const nextTaxonomy = {
      programCategories: uniqueLines(document.querySelector("#configProgramCategories").value, defaults.programCategories),
      disabilityTypes: defaults.disabilityTypes.slice(),
      audienceTypes: uniqueLines(document.querySelector("#configAudienceTypes").value, defaults.audienceTypes)
    };
    if (!nextTaxonomy.programCategories.includes("기타")) nextTaxonomy.programCategories.push("기타");
    if (!nextTaxonomy.audienceTypes.includes("기타")) nextTaxonomy.audienceTypes.push("기타");
    const nextIcons=Object.fromEntries(nextTaxonomy.programCategories.map(name=>[name,Object.hasOwn(draftIcons,name)&&validIcon(draftIcons[name])?draftIcons[name]:iconFor(name)]));
    const status=document.querySelector('#activityIconSaveStatus');status.textContent='활동분류와 아이콘 저장 중…';
    if (db) {
      try {
        const { error } = await db.from("app_settings").upsert({ id: "global", program_categories: nextTaxonomy.programCategories, disability_types: nextTaxonomy.disabilityTypes, audience_types: nextTaxonomy.audienceTypes, activity_category_icons: nextIcons, updated_at: new Date().toISOString() });
        if(error)throw error;
      }catch(error){status.textContent='활동분류·아이콘 저장 실패. v70 SQL 적용 및 관리자 권한을 확인한 후 다시 저장해 주세요. '+(error.message||'연결 오류');return;}
    }
    taxonomy=nextTaxonomy;categoryIcons=nextIcons;
    applyTaxonomy();
    renderPrograms();
    status.textContent=db?'활동분류와 아이콘을 저장했습니다.':'미리보기에 반영했습니다. 데이터베이스가 연결되지 않아 새로고침하면 초기화됩니다.';
  });

  function showDeadlineNotifications() {
    const panel = document.querySelector("#adminPanel");
    if (!panel || panel.classList.contains("hidden") || isSuperAdmin()) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const recentlyClosed = allowedPrograms().filter((program) => {
      const end = new Date(`${program.endDate}T00:00:00`);
      const days = Math.floor((today - end) / 86400000);
      return days >= 1 && days <= 14;
    });
    let box = document.querySelector("#deadlineNotificationBox");
    if (!recentlyClosed.length) { box?.remove(); return; }
    if (!box) {
      box = document.createElement("aside");
      box.id = "deadlineNotificationBox";
      box.className = "deadlineNotificationBox";
      panel.prepend(box);
    }
    box.innerHTML = `<div><strong>모집 마감 알림</strong><p>${recentlyClosed.map((program) => `${esc(program.title)} · ${dateText(program.endDate)} 마감`).join("<br>")}</p></div><button type="button">확인</button>`;
    box.querySelector("button").addEventListener("click", () => box.remove());
  }
  new MutationObserver(showDeadlineNotifications).observe(document.querySelector("#adminPanel"), { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") showDeadlineNotifications(); });

  loadTaxonomy();
})();

