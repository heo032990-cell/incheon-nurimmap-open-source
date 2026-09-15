(() => {
  "use strict";
  const reconciliations = new WeakMap();
  const currentYear = new Date().getFullYear();
  const option = (value, label = value) => { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; };
  function enhance(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "date" || input.dataset.scrollDateReady) return;
    input.dataset.scrollDateReady = "true";
    const label = input.closest("label");
    const title = (label?.childNodes?.[0]?.textContent || input.getAttribute("aria-label") || "날짜").trim();
    const isBirth = /birth|생년월일/i.test(`${input.id} ${title}`);
    const group = document.createElement("div");
    group.className = "scrollDateInput"; group.setAttribute("role", "group"); group.setAttribute("aria-label", `${title} 연 월 일 선택`);
    const year = document.createElement("select"), month = document.createElement("select"), day = document.createElement("select");
    year.append(option("", "연도")); month.append(option("", "월")); day.append(option("", "일"));
    const firstYear = isBirth ? currentYear : currentYear - 5, lastYear = isBirth ? 1920 : currentYear + 15, step = isBirth ? -1 : 1;
    for (let value = firstYear; isBirth ? value >= lastYear : value <= lastYear; value += step) year.append(option(String(value), `${value}년`));
    for (let value = 1; value <= 12; value += 1) month.append(option(String(value).padStart(2, "0"), `${value}월`));
    year.setAttribute("aria-label", `${title} 연도`); month.setAttribute("aria-label", `${title} 월`); day.setAttribute("aria-label", `${title} 일`);
    year.required = input.required; month.required = input.required; day.required = input.required;
    const direct = document.createElement("button"); direct.type = "button"; direct.className = "scrollDateDirect"; direct.textContent = "직접 입력"; direct.setAttribute("aria-expanded", "false");
    function syncValidation() {
      const partial = Boolean(year.value || month.value || day.value) && !(year.value && month.value && day.value);
      [year, month, day].forEach(select => { select.required = input.required;select.setAttribute('aria-required',String(input.required)); });
      input.setAttribute('aria-required',String(input.required));
      year.setCustomValidity(!group.classList.contains('isDirect') && partial ? '연도, 월, 일을 모두 선택하거나 날짜를 비워 주세요.' : '');
    }
    function rebuildDays(selected = day.value) {
      const count = year.value && month.value ? new Date(Number(year.value), Number(month.value), 0).getDate() : 31;
      day.replaceChildren(option("", "일"));
      for (let value = 1; value <= count; value += 1) day.append(option(String(value).padStart(2, "0"), `${value}일`));
      day.value = Number(selected) <= count ? selected : "";
    }
    let lastNativeValue = input.value;
    function syncNative() {
      const complete = Boolean(year.value && month.value && day.value);
      input.value = complete ? `${year.value}-${month.value}-${day.value}` : "";
      lastNativeValue = input.value;
      syncValidation();
      // 연·월만 고르는 중에는 기존 화면에 change 이벤트를 보내 선택이 초기화되지 않게 한다.
      if (complete) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    function syncSelects() {
      lastNativeValue = input.value;
      const match = String(input.value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match?.[1] && ![...year.options].some((item) => item.value === match[1])) year.append(option(match[1], `${match[1]}년`));
      year.value = match?.[1] || ""; month.value = match?.[2] || ""; rebuildDays(match?.[3] || "");
      syncValidation();
    }
    function setDirectMode(enabled) {
      group.classList.toggle("isDirect", enabled); input.classList.toggle("scrollDateNativeVisible", enabled);
      year.disabled = enabled; month.disabled = enabled; day.disabled = enabled;
      syncValidation();
      direct.textContent = enabled ? "연·월·일 선택" : "직접 입력"; direct.setAttribute("aria-expanded", String(enabled));
      direct.setAttribute('aria-label', title + (enabled ? ' 연·월·일 선택으로 전환' : ' 직접 입력으로 전환'));
      input.tabIndex = enabled ? 0 : -1;
      if(enabled)input.removeAttribute('aria-hidden');else input.setAttribute('aria-hidden','true');
      if (enabled) input.focus(); else year.focus();
    }
    year.addEventListener("change", () => { rebuildDays(); syncNative(); }); month.addEventListener("change", () => { rebuildDays(); syncNative(); }); day.addEventListener("change", syncNative);
    input.addEventListener("change", syncSelects); group.addEventListener("focusin", () => { if (input.value && input.value !== `${year.value}-${month.value}-${day.value}`) syncSelects(); }); direct.addEventListener("click", () => setDirectMode(!group.classList.contains("isDirect")));
    reconciliations.set(input,()=>{if(input.value!==lastNativeValue)syncSelects();});
    input.classList.add("scrollDateNative"); input.before(group); group.append(year, month, day, direct, input); syncSelects();
    input.tabIndex=-1;input.setAttribute('aria-hidden','true');direct.setAttribute('aria-label',title+' 직접 입력으로 전환');
    input.addEventListener('invalid',event=>{if(!group.classList.contains('isDirect')){event.preventDefault();year.focus();}});
    new MutationObserver(syncValidation).observe(input, {attributes:true,attributeFilter:['required']});
    input.form?.addEventListener('reset', () => setTimeout(syncSelects, 0));
  }
  function enhanceAll(scope = document) { if (scope.matches?.('input[type="date"]')) enhance(scope); scope.querySelectorAll?.('input[type="date"]').forEach(enhance); }
  window.reconcileAccessibleDateInputs = (scope=document) => scope.querySelectorAll('input[type="date"]').forEach(input=>reconciliations.get(input)?.());
  window.syncAccessibleDateInputs = () => document.querySelectorAll('input[type="date"][data-scroll-date-ready]').forEach((input) => input.dispatchEvent(new Event("change")));
  enhanceAll();
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node instanceof Element) enhanceAll(node); }))).observe(document.body, { childList: true, subtree: true });
})();

