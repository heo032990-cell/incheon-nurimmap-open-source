(() => {
  "use strict";
  const config = window.INCHEON_SUPABASE;
  if (!config || !window.supabase?.createClient) return;
  const db = window.incheonSupabase || window.supabase.createClient(config.url, config.publishableKey);
  const defaults = Object.freeze({
    operatorName: "000", address: "000", phone: "000", email: "000", businessHours: "000",
    privacyOfficer: "000", privacyDepartment: "000", accessibilityDepartment: "000", serviceDepartment: "000",
    effectiveDate: "2026년 00월 00일", programRecipient: "해당 프로그램 운영기관(기관별 표시)",
    cloudDetails: "실제 계약과 저장 위치 확인 후 입력", overseasDetails: "실제 국외 이전 내역 확인 후 입력",
    childConsentMethod: "운영기관에 문의", trackingDetails: "광고 목적 추적도구 사용 안 함(운영환경 확인 필요)",
    accessibilityCertification: "미확정", pageContents: {}, published: false
  });
  const fields = [
    ["operatorName", "운영기관명", "text"], ["phone", "대표전화", "text"], ["email", "대표 이메일", "text"],
    ["address", "주소", "text"], ["businessHours", "운영시간", "text"], ["effectiveDate", "정책 시행일", "text"],
    ["privacyOfficer", "개인정보 보호책임자", "text"], ["privacyDepartment", "개인정보 담당부서", "text"],
    ["serviceDepartment", "사이트·오류 담당부서", "text"], ["accessibilityDepartment", "접근성 담당부서", "text"]
  ];
  const detailFields = ["programRecipient", "cloudDetails", "overseasDetails", "childConsentMethod", "trackingDetails", "accessibilityCertification"];
  const pages = [
    { key: "privacy", label: "개인정보 처리방침", url: "./privacy.html" },
    { key: "terms", label: "이용약관", url: "./terms.html" },
    { key: "accessibility", label: "웹 접근성 안내", url: "./accessibility.html" },
    { key: "contact", label: "운영기관·문의", url: "./contact.html" }
  ];
  let settings = { ...defaults, pageContents: {} };

  function settingValue(key) { return String(settings[key] ?? defaults[key] ?? "000") || "000"; }
  function replaceTokens(text) {
    return String(text || "").replace(/\{\{([a-zA-Z0-9]+)\}\}/g, (_, key) => settingValue(key));
  }

  function renderPlainContent(container, source) {
    container.replaceChildren();
    const lines = replaceTokens(source).replace(/\r/g, "").split("\n");
    let list = null;
    const closeList = () => { list = null; };
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) { closeList(); return; }
      if (/^(?:\d+\.|제\s*\d+\s*조)/.test(line)) {
        closeList(); const heading = document.createElement("h2"); heading.textContent = line; container.append(heading); return;
      }
      if (line.startsWith("- ")) {
        if (!list) { list = document.createElement("ul"); container.append(list); }
        const item = document.createElement("li"); item.textContent = line.slice(2); list.append(item); return;
      }
      closeList(); const paragraph = document.createElement("p"); paragraph.textContent = line; container.append(paragraph);
    });
  }

  function renderPageOverride() {
    const key = document.body.dataset.policyPage;
    if (!key) return;
    const main = document.querySelector(".policyMain");
    if (!main) return;
    const source = String(settings.pageContents?.[key] || "").trim();
    let custom = main.querySelector(":scope > .policyCustomContent");
    [...main.children].forEach((child) => {
      if (child === custom || child.matches(".policyDraftNotice,.policyMeta,.policyBack")) return;
      child.classList.toggle("hidden", Boolean(source));
      child.dataset.policyDefault = "true";
    });
    if (!source) { custom?.remove(); return; }
    if (!custom) {
      custom = document.createElement("section"); custom.className = "policyCustomContent";
      const back = main.querySelector(":scope > .policyBack"); main.insertBefore(custom, back || null);
    }
    renderPlainContent(custom, source);
  }

  function applySettings() {
    window.NurimPolicyContact = {operatorName: settingValue("operatorName"), phone: settingValue("phone")};
    window.updateMinorConsentContact?.();
    document.querySelectorAll("[data-policy]").forEach((node) => { node.textContent = settingValue(node.dataset.policy); });
    document.querySelectorAll("[data-policy-email]").forEach((node) => {
      const email = String(settings.email || "").trim(); if (email && email !== "000") node.href = `mailto:${email}`; else node.removeAttribute("href");
    });
    document.querySelectorAll("[data-policy-phone]").forEach((node) => {
      const phone = String(settings.phone || "").replace(/[^0-9+]/g, ""); if (phone && phone !== "000") node.href = `tel:${phone}`; else node.removeAttribute("href");
    });
    document.querySelectorAll(".policyDraftNotice").forEach((node) => node.classList.toggle("hidden", settings.published === true));
    renderPageOverride();
  }

  async function loadSettings() {
    const { data, error } = await db.from("app_settings").select("policy_settings").eq("id", "global").maybeSingle();
    if (error) { console.warn("정책 설정을 불러오지 못했습니다.", error.message); applySettings(); return; }
    const incoming = data?.policy_settings || {};
    settings = { ...defaults, ...incoming, pageContents: { ...(incoming.pageContents || {}) } };
    applySettings(); fillEditor();
  }

  function elementText(element) {
    if (element.matches("h2,h3")) return `${element.textContent.trim()}\n`;
    if (element.matches("ul,ol")) return [...element.querySelectorAll(":scope > li")].map((item) => `- ${item.textContent.trim()}`).join("\n") + "\n";
    if (element.matches("table")) return [...element.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.textContent.trim()).join(" | ")).join("\n") + "\n";
    if (element.matches("dl")) { const parts = []; let label = ""; [...element.children].forEach((child) => { if (child.tagName === "DT") label = child.textContent.trim(); if (child.tagName === "DD") parts.push(`${label}: ${child.textContent.trim()}`); }); return parts.join("\n") + "\n"; }
    return `${element.textContent.trim()}\n`;
  }

  async function loadBasePageText(page) {
    try {
      const response = await fetch(page.url, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      doc.querySelectorAll("[data-policy]").forEach((node) => { node.textContent = `{{${node.dataset.policy}}}`; });
      const main = doc.querySelector(".policyMain");
      if (!main) return "";
      return [...main.children].filter((item) => !item.matches(".policyDraftNotice,.policyMeta,.policyBack,script")).map(elementText).join("\n").trim();
    } catch (error) { return `기본 원문을 불러오지 못했습니다. (${error.message})`; }
  }

  async function fillPageEditors() {
    const form = document.querySelector("#policySettingsForm"); if (!form) return;
    for (const page of pages) {
      const area = form.querySelector(`[data-page-content="${page.key}"]`); if (!area) continue;
      const saved = String(settings.pageContents?.[page.key] || "");
      const baseText = saved || await loadBasePageText(page);
      if (area.dataset.edited === "true") continue;
      area.value = baseText; area.dataset.edited = "false"; area.dataset.reset = "false"; area.dataset.hasOverride = String(Boolean(saved));
    }
  }

  function fillEditor() {
    const form = document.querySelector("#policySettingsForm"); if (!form) return;
    fields.forEach(([key]) => { const input = form.elements.namedItem(key); if (input) input.value = settings[key] || ""; });
    detailFields.forEach((key) => { const input = form.elements.namedItem(key); if (input) input.value = settings[key] || ""; });
    form.elements.namedItem("published").checked = settings.published === true;
    fillPageEditors();
  }

  function renderEditor() {
    const host = document.querySelector("#superManage");
    if (!host || document.querySelector("#policySettingsForm")) return;
    const form = document.createElement("form"); form.id = "policySettingsForm"; form.className = "adminForm policySettingsForm";
    form.innerHTML = `<details class="policyEditorShell"><summary><strong>사이트 안내정보 관리</strong><span>운영기관·연락처·정책 원문 수정</span></summary><div class="policyEditorBody">
      <p class="sectionHelp">아래 기본정보를 한 번 저장하면 사이트 하단과 네 안내 페이지에 함께 반영됩니다.</p>
      <div class="policySettingsGrid">${fields.map(([key, label, type]) => `<label>${label}<input name="${key}" type="${type}" required></label>`).join("")}</div>
      <details class="policyOriginalEditor"><summary>페이지별 세부항목과 원문 수정</summary><div class="policyOriginalEditorBody">
        <div class="policySettingsGrid"><label>프로그램 신청정보 제공기관<input name="programRecipient"></label><label>만 14세 미만 동의 확인방법<input name="childConsentMethod"></label><label class="wide">클라우드·처리위탁 확인내용<textarea name="cloudDetails" rows="3"></textarea></label><label class="wide">국외 이전 확인내용<textarea name="overseasDetails" rows="3"></textarea></label><label class="wide">접속정보·추적도구 확인내용<textarea name="trackingDetails" rows="2"></textarea></label><label>웹 접근성 인증 여부<input name="accessibilityCertification"></label></div>
        <p class="policyOriginalHelp">각 페이지의 원문을 직접 수정할 수 있습니다. <code>{{operatorName}}</code> 같은 표시는 위 기본정보와 자동으로 연결되므로 그대로 두는 것이 좋습니다.</p>
        ${pages.map((page) => `<section class="policyPageEditor"><div><h4>${page.label} 원문</h4><button type="button" data-reset-page="${page.key}">기본 원문으로 되돌리기</button></div><textarea data-page-content="${page.key}" rows="16" aria-label="${page.label} 원문"></textarea></section>`).join("")}
      </div></details>
      <label class="policyPublishToggle"><input name="published" type="checkbox"> 000 항목 검토 완료 — 정책 페이지의 ‘검토용 기본안’ 표시 숨기기</label>
      <div class="formActions"><button class="primary" type="submit">안내정보 한 번에 저장</button></div><p class="policySaveStatus" role="status" aria-live="polite"></p>
    </div></details>`;
    host.append(form);
    form.addEventListener("submit", saveSettings);
    form.querySelectorAll("[data-page-content]").forEach((area) => area.addEventListener("input", () => { area.dataset.edited = "true"; area.dataset.reset = "false"; }));
    form.querySelectorAll("[data-reset-page]").forEach((button) => button.addEventListener("click", async () => {
      const page = pages.find((item) => item.key === button.dataset.resetPage), area = form.querySelector(`[data-page-content="${button.dataset.resetPage}"]`);
      if (!page || !area) return; area.value = await loadBasePageText(page); area.dataset.edited = "true"; area.dataset.reset = "true"; area.focus();
    }));
    fillEditor();
  }

  async function saveSettings(event) {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type="submit"]'), status = form.querySelector(".policySaveStatus");
    const next = { ...settings, pageContents: { ...(settings.pageContents || {}) } };
    fields.forEach(([key]) => { next[key] = String(form.elements.namedItem(key).value || "").trim() || "000"; });
    detailFields.forEach((key) => { next[key] = String(form.elements.namedItem(key).value || "").trim() || "000"; });
    form.querySelectorAll("[data-page-content]").forEach((area) => {
      if (area.dataset.edited !== "true") return;
      if (area.dataset.reset === "true" || !area.value.trim()) delete next.pageContents[area.dataset.pageContent]; else next.pageContents[area.dataset.pageContent] = area.value.trim();
    });
    next.published = form.elements.namedItem("published").checked;
    const unfinished = fields.some(([key]) => !String(next[key] || "").trim() || String(next[key]).trim() === "000" || (key === "effectiveDate" && /00월|00일/.test(next[key])));
    if (next.published && unfinished) { status.textContent = "000 기본정보를 모두 실제 내용으로 바꾼 뒤 검토 완료를 선택해 주세요."; return; }
    button.disabled = true; status.textContent = "저장하고 있습니다.";
    const { error } = await db.from("app_settings").upsert({ id: "global", policy_settings: next, updated_at: new Date().toISOString() });
    button.disabled = false;
    if (error) { status.textContent = `저장하지 못했습니다: ${error.message}`; return; }
    settings = next; applySettings(); await fillPageEditors(); status.textContent = "저장했습니다. 새로고침한 이용자 화면에도 바로 반영됩니다.";
  }

  async function enableEditorForSuper() {
    const { data: sessionData } = await db.auth.getSession(); const user = sessionData?.session?.user; if (!user) return;
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle(); if (profile?.role === "super") renderEditor();
  }

  loadSettings();
  if (document.querySelector("#superManage")) { enableEditorForSuper(); db.auth.onAuthStateChange(() => setTimeout(enableEditorForSuper, 0)); }
})();