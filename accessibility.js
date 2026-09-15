(() => {
  "use strict";
  const live = document.querySelector("#a11yLive");
  const programBox = document.querySelector("#programs");
  const summary = document.querySelector("#resultSummary");
  const root = document.documentElement;
  let announceTimer = null;
  let lastFocusedBeforeDialog = null;
  let lastProgramId = null;
  let lastResultMessage = "";
  let messageTimer = null;

  function announce(message) {
    if (!live || !message) return;
    clearTimeout(messageTimer);
    live.textContent = "";
    messageTimer = window.setTimeout(() => { live.textContent = message; }, 30);
  }
  function labelText(control) {
    const label = control.closest("label");
    return (control.getAttribute("aria-label") || label?.textContent || control.name || "입력항목").replace(/\s+/g, " ").trim();
  }
  function decorateRequiredFields(scope = document) {
    scope.querySelectorAll("input[required], select[required], textarea[required]").forEach((control) => {
      control.setAttribute("aria-required", "true");
    });
  }
  function decorateProgramCards() {
    const cards = [...programBox.querySelectorAll(".card")];
    cards.forEach((card, index) => {
      const heading = card.querySelector("h2, h3");
      if (!heading) return;
      if (!heading.id) heading.id = `program-card-title-${index + 1}`;
      card.setAttribute("aria-labelledby", heading.id);
      const title = heading.textContent.trim();
      card.querySelectorAll("button, a").forEach((control) => {
        const visible = control.textContent.replace(/↗/g, "").replace(/\s+/g, " ").trim();
        if (visible && !control.getAttribute("aria-label")) control.setAttribute("aria-label", `${title} ${visible}`);
      });
      card.querySelectorAll("img").forEach((image) => {
        if (!image.getAttribute("alt")) image.alt = `${title} 홍보 이미지`;
      });
      card.setAttribute("aria-posinset", String(index + 1));
      card.setAttribute("aria-setsize", String(cards.length));
    });
    // The renderer owns the full result count and pagination; never replace it with this page's card count.
    const message = summary?.textContent.trim() || (cards.length ? `현재 페이지에 ${cards.length}개 프로그램이 있습니다.` : "조건에 맞는 프로그램이 없습니다.");
    const resultKey = message + cards.map(card => card.dataset.programId).join("|");
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      if (resultKey !== lastResultMessage) { lastResultMessage = resultKey; announce(message); }
    }, 180);
  }
  function updateStepper() {
    document.querySelectorAll("#applyStepper li").forEach((item) => {
      if (item.classList.contains("active")) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }
  function prepareDialog(dialog) {
    if (dialog.dataset.a11yReady) return;
    dialog.dataset.a11yReady = "true";
    const heading = dialog.querySelector("h2");
    if (heading) {
      if (!heading.id) heading.id = `${dialog.id || "dialog"}-title`;
      dialog.setAttribute("aria-labelledby", heading.id);
    }
    dialog.addEventListener("close", () => {
      // Closing the base form may open a survey immediately. Do not steal its focus.
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const replacement = lastProgramId && [...document.querySelectorAll("#programs .card")]
          .find(card => card.dataset.programId === lastProgramId)?.querySelector(".apply");
        const target = replacement || (lastFocusedBeforeDialog?.isConnected ? lastFocusedBeforeDialog : null);
        (target && !target.disabled ? target : document.querySelector("#programResultsTitle"))?.focus();
        lastFocusedBeforeDialog = null;
        lastProgramId = null;
      });
    });
  }
  function applyPreference(name, enabled) {
    root.classList.toggle(name, enabled);
    localStorage.setItem(`incheon-${name}`, enabled ? "true" : "false");
    const buttons = document.querySelectorAll(name === "a11yLargeText" ? "#a11yTextSize,#adminA11yTextSize" : "#a11yContrast,#adminA11yContrast");
    for (const button of buttons) {
    button?.setAttribute("aria-pressed", String(enabled));
    if (button) {
      const normalLabel = name === "a11yLargeText" ? "큰 글씨" : "색반전";
      button.textContent = enabled ? `${normalLabel} 해제` : normalLabel;
      button.setAttribute("aria-label", enabled ? `${normalLabel} 사용을 해제하고 원래대로` : normalLabel);
      button.title = enabled ? `${normalLabel} 해제` : `${normalLabel} 사용`;
    }
  }
  }
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("button, a");
    if (opener && (opener.matches(".apply, #adminOpen, .lookupEditButton, .applicationEditButton") || opener.getAttribute("aria-haspopup") === "dialog")) {
      lastFocusedBeforeDialog = opener;
      lastProgramId = opener.closest(".card")?.dataset.programId || null;
    }
  }, true);
  document.addEventListener("invalid", (event) => {
    const control = event.target;
    control.setAttribute("aria-invalid", "true");
    announce(`${labelText(control)}을 확인해 주세요. ${control.validationMessage || "필수 입력 항목입니다."}`);
  }, true);
  ['input','change'].forEach(type=>document.addEventListener(type, event=>{if(event.target.matches('input,select,textarea')&&event.target.validity.valid)event.target.removeAttribute('aria-invalid');},true));
  document.querySelector("#adminA11yTextSize")?.addEventListener("click",()=>document.querySelector("#a11yTextSize").click());
  document.querySelector("#adminA11yContrast")?.addEventListener("click",()=>document.querySelector("#a11yContrast").click());
  document.querySelector("#a11yTextSize")?.addEventListener("click", () => { const enabled = !root.classList.contains("a11yLargeText"); applyPreference("a11yLargeText", enabled); announce(enabled ? "큰 글씨를 사용합니다." : "기본 글씨 크기를 사용합니다."); });
  document.querySelector("#a11yContrast")?.addEventListener("click", () => { const enabled = !root.classList.contains("a11yHighContrast"); applyPreference("a11yHighContrast", enabled); announce(enabled ? "색반전 화면을 사용합니다. 검정 배경에 흰색과 노란색으로 표시합니다." : "기본 화면 색상을 사용합니다."); });

  applyPreference("a11yLargeText", localStorage.getItem("incheon-a11yLargeText") === "true");
  applyPreference("a11yHighContrast", localStorage.getItem("incheon-a11yHighContrast") === "true");
  decorateRequiredFields();
  // Add a named group for each consent question and each matrix row.
  const originalConsentRenderer = renderConsentItems;
  renderConsentItems = function(program) {
    originalConsentRenderer(program);
    document.querySelectorAll("#consentItems .consentItem").forEach((item, index) => {
      const title = item.querySelector("summary");
      title.id = `consent-title-${index}`;
      const description = item.querySelector(".consentText");
      description.id = `consent-description-${index}`;
      item.querySelectorAll(".radioRow, .matrixRow").forEach((group, row) => {
        const rowTitle = group.querySelector("strong");
        if (rowTitle) rowTitle.id = `consent-row-${index}-${row}`;
        group.setAttribute("role", "radiogroup");
        group.setAttribute("aria-labelledby", [title.id, rowTitle?.id].filter(Boolean).join(" "));
        group.setAttribute("aria-describedby", description.id);
      });
    });
  };
  const originalSetApplyStep = setApplyStep;
  setApplyStep = function(step) {
    originalSetApplyStep(step);
    const dialog = document.querySelector("#applyDialog");
    const panel = [...dialog.querySelectorAll(".applyStep")].find(el => !el.classList.contains("hidden"));
    if (!panel) return;
    let heading = panel.querySelector("h3");
    if (!heading || panel.id === "applyStepInfo") {
      heading = panel.querySelector(".applicationStepHeading");
      if (!heading) {
        heading = document.createElement("h3");
        heading.className = "applicationStepHeading srOnly";
        heading.textContent = "신청 정보";
        panel.prepend(heading);
      }
    }
    heading.tabIndex = -1;
    if (!heading.id) heading.id = `${panel.id}-heading`;
    panel.setAttribute("aria-labelledby", heading.id);
    // On initial opening, the native dialog handles focus. On step changes, read the new heading.
    if (dialog.open) heading.focus();
  };
  document.querySelectorAll("dialog").forEach(prepareDialog);
  decorateProgramCards(); updateStepper();

  const observer = new MutationObserver((records) => {
    let programsChanged = false;
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches("dialog")) prepareDialog(node);
        node.querySelectorAll?.("dialog").forEach(prepareDialog);
        decorateRequiredFields(node);
      });
      if (record.target === programBox || programBox.contains(record.target)) programsChanged = true;
    });
    if (programsChanged) decorateProgramCards();
    updateStepper();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open"] });
})();
