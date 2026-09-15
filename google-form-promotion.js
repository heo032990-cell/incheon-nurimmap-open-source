(() => {
  const formUrlInput = document.querySelector("#googleFormUrl");
  const applyForm = document.querySelector("#applyForm");
  const googleStep = document.querySelector("#applyStepGoogleForm");
  if (!formUrlInput || !applyForm || !googleStep) return;

  let surveyToken = "";
  let googleFormVerified = false;
  let googleFormSubmittedAt = "";

  function normalizeGoogleFormUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") return "";
      if (url.hostname === "forms.gle") return url.toString();
      if (url.hostname !== "docs.google.com") return "";
      const match = url.pathname.match(/^(\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[^/]+)(?:\/(?:edit|viewform|formResponse))?\/?$/);
      if (!match) return "";
      url.pathname = match[1] + "/viewform";
      url.searchParams.delete("edit_requested");
      url.searchParams.delete("embedded");
      return url.toString();
    } catch { return ""; }
  }

  function embeddedGoogleFormUrl(value, token = "", tokenEntry = "") {
    const normalized = normalizeGoogleFormUrl(value);
    if (!normalized) return "";
    try {
      const url = new URL(normalized);
      if (url.hostname === "forms.gle") return token ? "" : url.toString();
      if (token && /^entry\.\d+$/.test(tokenEntry)) url.searchParams.set(tokenEntry, token);
      url.searchParams.set("embedded", "true");
      return url.toString();
    } catch { return ""; }
  }

  function spreadsheetIdFromValue(value) {
    const match = String(value || "").trim().match(/(?:spreadsheets\/d\/)?([a-zA-Z0-9_-]{20,})/);
    return match ? match[1] : "";
  }

  function currentUsesGoogleForm() {
    return Boolean(activeProgram && activeProgram.googleFormUrl);
  }
  function currentUsesConsent() {
    return Boolean(activeProgram && activeProgram.consentEnabled && activeConsentItems(activeProgram).length > 0);
  }
  function currentCanVerifyGoogleForm() {
    return Boolean(activeProgram?.googleFormVerificationEnabled && /^entry\.\d+$/.test(activeProgram?.googleFormTokenEntry || ""));
  }

  function updateStepper(program) {
    const useGoogle = Boolean(program?.googleFormUrl);
    const useConsent = Boolean(program?.consentEnabled && activeConsentItems(program).length > 0);
    const stepper = document.querySelector("#applyStepper");
    const googleLabel = document.querySelector("#stepGoogleFormLabel");
    const consentLabel = document.querySelector("#stepConsentLabel");
    googleLabel.classList.toggle("hidden", !useGoogle);
    googleLabel.textContent = "2. 추가 신청서";
    consentLabel.textContent = `${useGoogle ? 3 : 2}. 개인정보 동의`;
    consentLabel.classList.toggle("hidden", !useConsent);
    document.querySelector("#continueAfterGoogleForm").textContent = useConsent ? "다음: 개인정보 동의" : "신청 완료";
    stepper.classList.toggle("hidden", !useGoogle && !useConsent);
    document.querySelector("#goConsent").textContent = useGoogle ? "다음: 추가 신청서" : (useConsent ? "다음: 개인정보 동의" : "신청 완료");
  }

  function setVerificationStatus(message, state = "") {
    const box = document.querySelector(".googleFormVerification");
    const status = document.querySelector("#googleFormVerificationStatus");
    box.classList.toggle("isVerified", state === "verified");
    box.classList.toggle("isError", state === "error");
    status.textContent = message;
  }

  function prepareGoogleForm(program) {
    surveyToken = crypto.randomUUID();
    googleFormVerified = false;
    googleFormSubmittedAt = "";
    window.currentSurveyVerification = { token: surveyToken, verified: false, submittedAt: "" };
    const canVerify = Boolean(program?.googleFormVerificationEnabled && /^entry\.\d+$/.test(program?.googleFormTokenEntry || ""));
    const embedded = canVerify ? embeddedGoogleFormUrl(program?.googleFormUrl, surveyToken, program.googleFormTokenEntry) : "";
    const frame = document.querySelector("#googleFormFrame");
    const openLink = document.querySelector("#googleFormOpenNew");
    const verifyButton = document.querySelector("#verifyGoogleFormSubmission");
    document.querySelector("#continueAfterGoogleForm").disabled = true;
    verifyButton.disabled = !canVerify;
    if (embedded) {
      frame.src = embedded;
      const openUrl = new URL(embedded);
      openUrl.searchParams.delete("embedded");
      openLink.href = openUrl.toString();
      setVerificationStatus("Google Form 제출 후 ‘신청서 제출 확인’을 눌러 주세요.");
    } else {
      frame.removeAttribute("src");
      openLink.removeAttribute("href");
      setVerificationStatus(canVerify ? "Google Form 주소를 확인해 주세요." : "관리자가 신청서 제출 확인 설정을 완료해야 신청할 수 있습니다.", "error");
    }
  }

  async function verifySurveySubmission(silent = false) {
    if (!currentUsesGoogleForm() || !currentCanVerifyGoogleForm() || !surveyToken) return false;
    const button = document.querySelector("#verifyGoogleFormSubmission");
    button.disabled = true;
    if (!silent) setVerificationStatus("Google Form 제출 여부를 확인하고 있습니다.");
    try {
      const result = await window.verifyGoogleFormSurveyToken(activeProgram.id, surveyToken);
      googleFormVerified = result?.verified === true;
      googleFormSubmittedAt = String(result?.submittedAt || "");
      window.currentSurveyVerification = { token: surveyToken, verified: googleFormVerified, submittedAt: googleFormSubmittedAt };
      document.querySelector("#continueAfterGoogleForm").disabled = !googleFormVerified;
      if (googleFormVerified) {
        setVerificationStatus("신청서 제출이 확인되었습니다. 다음 단계로 진행할 수 있습니다.", "verified");
      } else if (!silent) {
        setVerificationStatus("아직 제출 응답을 찾지 못했습니다. Form 제출 후 몇 초 뒤 다시 확인해 주세요.", "error");
      }
      return googleFormVerified;
    } catch (error) {
      if (!silent) setVerificationStatus(`신청서 제출을 확인하지 못했습니다: ${error?.message || error}`, "error");
      return false;
    } finally {
      button.disabled = false;
    }
  }

  const originalOpenApply = openApply;
  openApply = function openApplyWithGoogleForm(program) {
    originalOpenApply(program);
    prepareGoogleForm(program);
    updateStepper(program);
  };

  const originalSetApplyStep = setApplyStep;
  setApplyStep = function setApplyStepWithGoogleForm(step) {
    if (step !== "google") {
      originalSetApplyStep(step);
      googleStep.classList.add("hidden");
    } else {
      document.querySelector("#applyStepInfo").classList.add("hidden");
      document.querySelector("#applyStepConsent").classList.add("hidden");
      googleStep.classList.remove("hidden");
      document.querySelector("#stepInfoLabel").classList.remove("active");
      document.querySelector("#stepConsentLabel").classList.remove("active");
      document.querySelector("#stepGoogleFormLabel").classList.add("active");
    }
    if (step !== "google") document.querySelector("#stepGoogleFormLabel").classList.remove("active");
  };

  document.querySelector("#goConsent").addEventListener("click", (event) => {
    if (!currentUsesGoogleForm()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!validateInfoStep()) return;
    if (!currentCanVerifyGoogleForm()) return alert("관리자가 Google Form 제출 확인 설정을 완료해야 합니다.");
    setApplyStep("google");
  }, true);

  document.querySelector("#verifyGoogleFormSubmission").addEventListener("click", () => verifySurveySubmission(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !googleStep.classList.contains("hidden") && !googleFormVerified) verifySurveySubmission(true);
  });
  document.querySelector("#backGoogleForm").addEventListener("click", () => setApplyStep("info"));
  document.querySelector("#continueAfterGoogleForm").addEventListener("click", () => {
    if (!googleFormVerified) return alert("Google Form 실제 제출 확인이 필요합니다.");
    if (currentUsesConsent()) setApplyStep("consent");
    else submitApplication();
  });
  document.querySelector("#backInfo").addEventListener("click", (event) => {
    if (!currentUsesGoogleForm()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setApplyStep("google");
  }, true);

  const originalSubmitApplication = submitApplication;
  submitApplication = async function submitApplicationWithGoogleFormCheck() {
    if (currentUsesGoogleForm() && !googleFormVerified) {
      alert("Google Form 실제 제출 확인이 필요합니다.");
      setApplyStep("google");
      return;
    }
    return originalSubmitApplication();
  };

  const createGoogleFormButton = document.querySelector("#createGoogleFormConfig");
  const clearCreatedGoogleLinks = () => {
    const links = document.querySelector("#googleFormCreatedLinks");
    if (links) { links.innerHTML = ""; links.classList.add("hidden"); }
  };
  createGoogleFormButton?.addEventListener("click", async () => {
    const title = document.querySelector("#programTitle").value.trim();
    const status = document.querySelector("#googleFormCreateStatus");
    if (!title) return alert("프로그램명을 먼저 입력해 주세요.");
    if (formUrlInput.value.trim() && !confirm("이미 연결된 Google Form이 있습니다. 새 신청서을 다시 만들까요?")) return;
    if (!window.createGoogleFormConfig) return alert("관리자 온라인 연동을 확인한 뒤 다시 시도해 주세요.");
    createGoogleFormButton.disabled = true;
    createGoogleFormButton.textContent = "신청서 만드는 중…";
    status.textContent = "Google Form과 응답 스프레드시트를 자동으로 만들고 있습니다.";
    clearCreatedGoogleLinks();
    try {
      const config = await window.createGoogleFormConfig(title);
      formUrlInput.value = config.formUrl || "";
      document.querySelector("#googleFormTokenEntry").value = config.tokenEntry || "";
      document.querySelector("#googleFormFileId").value = config.formFileId || "";
      document.querySelector("#googleFormResponseSheetId").value = config.spreadsheetUrl || config.spreadsheetId || "";
      document.querySelector("#googleFormResponseTab").value = config.sheetName || "신청서지 응답 1";
      document.querySelector("#googleFormTokenColumn").value = config.tokenColumnName || "설문 확인번호";
      const links = document.querySelector("#googleFormCreatedLinks");
      const addLink = (label, url) => {
        if (!url || !/^https:\/\//i.test(url)) return;
        const link = document.createElement("a");
        link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = label + " ↗";
        links.append(link);
      };
      addLink("신청서 질문 편집", config.formEditUrl);
      addLink("응답 스프레드시트", config.spreadsheetUrl);
      addLink("프로그램 Drive 폴더", config.folderUrl);
      links.classList.toggle("hidden", !links.childElementCount);
      status.textContent = config.shareWarning || "신청서과 응답 Sheet 연결이 완료됐습니다. 프로그램을 저장해 주세요.";
    } catch (error) {
      const message = String(error?.message || error || "신청서을 만들지 못했습니다.");
      status.textContent = /^\s*</.test(message) ? "Google Apps Script 연결 권한을 확인해 주세요." : message;
      alert("새 Google 신청서 자동 생성 실패: " + status.textContent);
    } finally {
      createGoogleFormButton.disabled = false;
      createGoogleFormButton.textContent = "새 Google 신청서 자동 생성";
    }
  });

  function institutionConnectorCode(config) {
    const endpoint = `${window.INCHEON_SUPABASE.url}/functions/v1/swift-processor`;
    const apiKey = window.INCHEON_SUPABASE.publishableKey;
    return [
      `const NURIM = ${JSON.stringify({ endpoint, apiKey, programId: config.programId, relaySecret: config.relaySecret }, null, 2)};`,
      `function nurimPost_(body) {`,
      `  const response = UrlFetchApp.fetch(NURIM.endpoint, { method: "post", contentType: "application/json", headers: { apikey: NURIM.apiKey, Authorization: "Bearer " + NURIM.apiKey }, payload: JSON.stringify(body), muteHttpExceptions: true });`,
      `  const result = JSON.parse(response.getContentText() || "{}");`,
      `  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.ok) throw new Error(result.error || "인천누림지도 연결 실패");`,
      `  return result;`,
      `}`,
      `function setupNurimConnection() {`,
      `  const form = FormApp.getActiveForm();`,
      `  if (!form) throw new Error("연결할 Google Form에서 Apps Script를 열어 실행해 주세요.");`,
      `  let item = form.getItems(FormApp.ItemType.TEXT).map(function(x){ return x.asTextItem(); }).find(function(x){ return /^(신청|설문)\\s*확인번호$/.test(x.getTitle().trim()); });`,
      `  if (!item) item = form.addTextItem().setTitle("신청 확인번호");`,
      `  item.setRequired(true).setHelpText("자동으로 입력됩니다. 수정하지 마세요.");`,
      `  const prefilled = form.createResponse().withItemResponse(item.createResponse("nurim-token-preview")).toPrefilledUrl();`,
      `  const match = prefilled.match(/[?&](entry\\.\\d+)=/);`,
      `  if (!match) throw new Error("확인번호 연결값을 만들지 못했습니다.");`,
      `  ScriptApp.getProjectTriggers().filter(function(t){ return t.getHandlerFunction() === "sendNurimSubmissionReceipt"; }).forEach(function(t){ ScriptApp.deleteTrigger(t); });`,
      `  ScriptApp.newTrigger("sendNurimSubmissionReceipt").forForm(form).onFormSubmit().create();`,
      `  nurimPost_({ action: "register-google-form-relay", programId: NURIM.programId, relaySecret: NURIM.relaySecret, tokenEntry: match[1] });`,

      `  Logger.log("인천누림지도 연결 완료");`,
      `}`,
      `function sendNurimSubmissionReceipt(e) {`,
      `  const response = e && e.response;`,
      `  if (!response) return;`,
      `  const answer = response.getItemResponses().find(function(r){ return /^(신청|설문)\\s*확인번호$/.test(r.getItem().getTitle().trim()); });`,
      `  const token = answer ? String(answer.getResponse() || "").trim() : "";`,
      `  if (!token) return;`,
      `  nurimPost_({ action: "record-google-form-submission", programId: NURIM.programId, relaySecret: NURIM.relaySecret, token: token, submittedAt: response.getTimestamp().toISOString() });`,
      `}`
    ].join("\n");
  }

  window.openInstitutionFormRelay = async function openInstitutionFormRelay(programId, value) {
    const normalized = normalizeGoogleFormUrl(value);
    if (!programId) return alert("프로그램 저장을 완료하지 못했습니다. 다시 저장해 주세요.");
    if (!normalized) return alert("Google Form 주소를 확인해 주세요. 편집 주소도 자동으로 응답 주소로 바뀝니다.");
    formUrlInput.value = normalized;
    const button = document.querySelector("#prepareInstitutionFormRelay");
    const status = document.querySelector("#googleFormAutoStatus");
    button.disabled = true;
    status.textContent = "기관 전용 연결키를 만들고 있습니다.";
    try {
      const config = await window.prepareGoogleFormRelay(programId);
      if (config?.alreadyConnected) {
        status.textContent = "이 Google Form은 이미 안전하게 연결되어 있습니다. 다시 승인할 필요가 없습니다.";
        const dialog = document.querySelector("#institutionFormRelayDialog");
        if (dialog?.open) dialog.close();
        alert("이미 연결된 Google Form입니다. 추가 승인 없이 그대로 사용하면 됩니다.");
        return true;
      }
      const textarea = document.querySelector("#institutionFormRelayCode");
      textarea.value = institutionConnectorCode(config);
      document.querySelector("#institutionFormRelayDialog").showModal();
      status.textContent = "프로그램 저장이 완료되었습니다. 이제 기관 Google Form에서 최초 연결만 완료해 주세요.";
      return true;
    } catch (error) {
      status.textContent = `연결 준비 실패: ${error?.message || error}`;
      alert(status.textContent);
      return false;
    } finally { button.disabled = false; }
  };

  document.querySelector("#openGoogleFormHelp")?.addEventListener("click", () => {
    document.querySelector("#googleFormHelpDialog")?.showModal();
  });
  document.querySelector("#prepareInstitutionFormRelay")?.addEventListener("click", () => {
    window.openInstitutionFormRelay(editingId, formUrlInput.value.trim());
  });

  document.querySelector("#copyInstitutionFormRelayCode")?.addEventListener("click", async () => {
    const textarea = document.querySelector("#institutionFormRelayCode");
    const status = document.querySelector("#institutionFormRelayCopyStatus");
    const value = String(textarea?.value || "");
    if (!value) return alert("복사할 연결 코드가 없습니다. 연결 코드를 다시 만들어 주세요.");
    let copied = false;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch (error) {
      console.warn("Clipboard API 복사가 차단되었습니다. 기존 복사 방식을 시도합니다.", error);
    }
    if (!copied) {
      textarea.removeAttribute("readonly");
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, value.length);
      try { copied = document.execCommand("copy") === true; } catch (error) { console.warn("연결 코드 대체 복사가 실패했습니다.", error); }
      textarea.setAttribute("readonly", "readonly");
    }
    if (copied) {
      if (status) status.textContent = "복사 완료! Apps Script 화면에 붙여넣으세요.";
      alert("연결 코드를 실제로 복사했습니다. Apps Script 화면에서 붙여넣으세요.");
    } else {
      textarea.focus();
      textarea.select();
      if (status) status.textContent = "자동 복사가 차단되었습니다. 코드가 선택되어 있으니 Ctrl+C를 눌러 주세요.";
      alert("브라우저가 자동 복사를 차단했습니다. 선택된 코드에서 Ctrl+C를 눌러 직접 복사해 주세요.");
    }
  });

  document.querySelector("#autoDetectGoogleFormConfig").addEventListener("click", async () => {
    const button = document.querySelector("#autoDetectGoogleFormConfig");
    const status = document.querySelector("#googleFormAutoStatus");
    const formUrl = formUrlInput.value.trim();
    const spreadsheetUrl = document.querySelector("#googleFormResponseSheetId").value.trim();
    if (!formUrl) return alert("Google Form 주소를 입력해 주세요.");
    if (!window.autoDetectGoogleFormConfig) return alert("관리자 온라인 연동을 확인한 뒤 다시 시도해 주세요.");
    button.disabled = true;
    button.textContent = "연결정보 찾는 중…";
    status.textContent = "Google Form에서 설문 확인번호 질문을 찾고 있습니다.";
    try {
      const config = await window.autoDetectGoogleFormConfig(formUrl, "");
      formUrlInput.value = config.formUrl || formUrl;
      document.querySelector("#googleFormTokenEntry").value = config.tokenEntry || "";
      document.querySelector("#googleFormFileId").value = config.formFileId || "";
      document.querySelector("#googleFormResponseSheetId").value = config.spreadsheetId || spreadsheetIdFromValue(spreadsheetUrl);
      document.querySelector("#googleFormResponseTab").value = config.sheetName || "신청서지 응답 1";
      document.querySelector("#googleFormTokenColumn").value = config.tokenColumnName || "설문 확인번호";
      status.innerHTML = "<strong>연결정보를 찾았습니다.</strong> 이제 프로그램을 저장하면 됩니다.";
    } catch (error) {
      status.textContent = "자동 연결 실패: " + (error?.message || error);
      const advanced = document.querySelector(".googleFormAdvanced");
      if (advanced) advanced.open = true;
      alert(status.textContent);
    } finally {
      button.disabled = false;
      button.textContent = "연결정보 자동 찾기";
    }
  });

  document.querySelector("#programForm").addEventListener("submit", (event) => {
    const value = formUrlInput.value.trim();
    if (value) {
      const normalized = normalizeGoogleFormUrl(value);
      if (normalized) formUrlInput.value = normalized;
    }
    if (!value) return;
    if (!embeddedGoogleFormUrl(value)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("Google Form 주소를 확인해 주세요. 편집 주소도 자동으로 응답 주소로 바뀝니다.");
      document.querySelector(".adminGoogleFormBox").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, true);

  const fillProgramBeforeGoogleVerification = fillProgram;
  fillProgram = function fillProgramWithGoogleVerification(program) {
    fillProgramBeforeGoogleVerification(program);
    clearCreatedGoogleLinks();
    document.querySelector("#googleFormCreateStatus").textContent = program.googleFormUrl ? "연결된 Google 신청서 설정을 불러왔습니다." : "기관 관리자는 버튼 한 번만 누르면 됩니다.";
    document.querySelector("#googleFormTokenEntry").value = program.googleFormTokenEntry || "";
    document.querySelector("#googleFormFileId").value = "";
    document.querySelector("#googleFormResponseSheetId").value = "";
    document.querySelector("#googleFormResponseTab").value = "신청서지 응답 1";
    document.querySelector("#googleFormTokenColumn").value = "설문 확인번호";
    if (program.googleFormUrl && window.loadGoogleFormVerificationConfig) {
      window.loadGoogleFormVerificationConfig(program.id).then((config) => {
        if (!config || editingId !== program.id) return;
        document.querySelector("#googleFormResponseSheetId").value = config.spreadsheetId || "";
        document.querySelector("#googleFormFileId").value = config.formFileId || "";
        document.querySelector("#googleFormResponseTab").value = config.sheetName || "신청서지 응답 1";
        document.querySelector("#googleFormTokenColumn").value = config.tokenColumnName || "설문 확인번호";
        if (config.relayConnected) {
          document.querySelector("#googleFormTokenEntry").value = config.tokenEntry || program.googleFormTokenEntry || "";
          program.googleFormVerificationEnabled = true;
          program.googleFormTokenEntry = config.tokenEntry || program.googleFormTokenEntry || "";
          document.querySelector("#googleFormAutoStatus").textContent = "연결 완료: 이 Google Form은 다시 승인할 필요가 없습니다.";
        }
      }).catch((error) => console.warn("Google Form 비공개 설정을 불러오지 못했습니다.", error));
    }
  };
  document.querySelector("#resetProgram").addEventListener("click", () => {
    clearCreatedGoogleLinks();
    document.querySelector("#googleFormCreateStatus").textContent = "기관 관리자는 버튼 한 번만 누르면 됩니다.";
    document.querySelector("#googleFormTokenEntry").value = "";
    document.querySelector("#googleFormFileId").value = "";
    document.querySelector("#googleFormResponseSheetId").value = "";
    document.querySelector("#googleFormResponseTab").value = "신청서지 응답 1";
    document.querySelector("#googleFormTokenColumn").value = "설문 확인번호";
  });

  function setDraftValue(selector, value, overwrite = false) {
    const control = document.querySelector(selector);
    if (!control || value === undefined || value === null || value === "") return false;
    if (selector === "#schedule" && window.nurimApplyScheduleDraft) return window.nurimApplyScheduleDraft(String(value));
    if (!overwrite && String(control.value || "").trim()) return false;
    control.value = String(value);
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function sanitizePromotionDraft(draft) {
    const safe = { ...(draft || {}) };
    const title = String(safe.title || "").trim();
    if (/20\d{2}\s*년|20\d{2}[.\/-]\d|\d{1,2}\s*월\s*\d{1,2}\s*일|(?:모집|신청|운영|활동)\s*(?:기간|일정)|\d{1,2}:\d{2}/.test(title)) safe.title = "";
    const fee = String(safe.fee || "").trim();
    if (/^(?:문의|별도\s*문의|전화\s*문의|담당자\s*문의)$/i.test(fee) || (fee && !/(무료|\d[\d,]*\s*원)/.test(fee))) safe.fee = "";
    const metadata = [safe.title, safe.fee, safe.contactPhone, safe.audience, safe.schedule].map((value) => String(value || "").replace(/[^가-힣a-zA-Z0-9]/g, "")).filter((value) => value.length >= 5);
    safe.description = String(safe.description || "").split(/\n+/).filter((line) => {
      const value = line.replace(/^[\s•*\-]+/, "").trim();
      if (!value || /(모집\s*기간|신청\s*기간|문의|연락처|이용료|참가비|모집\s*대상|참여\s*대상|정원)/.test(value)) return false;
      if (/20\d{2}\s*년|20\d{2}[.\/-]\d|\d{1,2}\s*월\s*\d{1,2}\s*일|0\d{1,2}[- )]?\d{3,4}[- ]?\d{4}|\d[\d,]*\s*원/.test(value)) return false;
      const key = value.replace(/[^가-힣a-zA-Z0-9]/g, "");
      return !metadata.some((meta) => key === meta || key.includes(meta) || meta.includes(key));
    }).slice(0, 9).map((line) => `• ${line.replace(/^[\s•*\-]+/, "").trim()}`).join("\n");
    return safe;
  }
  document.querySelector("#extractPromotionDraft").addEventListener("click", async () => {
    const images = currentPromotionImages.filter((image) => /^data:(?:image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/.test(image?.dataUrl || ""));
    if (!images.length) return alert("먼저 이미지 또는 PDF 홍보지를 추가해 주세요.");
    if (!window.extractPromotionDraftFromImages) return alert("관리자 온라인 연동을 확인한 뒤 다시 시도해 주세요.");
    const button = document.querySelector("#extractPromotionDraft");
    const status = document.querySelector("#promotionDraftStatus");
    button.disabled = true;
    button.textContent = "홍보지 읽는 중…";
    status.textContent = "홍보지 글자를 읽고 프로그램 정보 초안을 만들고 있습니다.";
    try {
      const result = await window.extractPromotionDraftFromImages(images);
      const draft = window.nurimPrepareDraft(sanitizePromotionDraft(result?.draft));
      let filled = 0;
      filled += setDraftValue("#programTitle", draft.title) ? 1 : 0;
      filled += setDraftValue("#fee", draft.fee) ? 1 : 0;
      filled += setDraftValue("#contactPhone", draft.contactPhone) ? 1 : 0;
      filled += setDraftValue("#audience", draft.audience) ? 1 : 0;
      filled += setDraftValue("#capacity", draft.capacity) ? 1 : 0;
      filled += setDraftValue("#selectionMethod", draft.selectionMethod, true) ? 1 : 0;
      filled += setDraftValue("#startDate", draft.startDate) ? 1 : 0;
      filled += setDraftValue("#endDate", draft.endDate) ? 1 : 0;
      filled += setDraftValue("#schedule", draft.schedule) ? 1 : 0;
      filled += setDraftValue("#description", draft.description) ? 1 : 0;
      filled += setDraftValue("#programAgeGroup", draft.ageGroup) ? 1 : 0;
      filled += window.nurimApplyExtraDraft(draft);
      const warningText = Array.isArray(draft.warnings) && draft.warnings.length ? ` 자동인식이 어려운 항목: ${draft.warnings.join(", ")}.` : "";
      status.textContent = `${filled}개 항목에 초안을 입력했습니다.${warningText} 날짜·정원·비용·연락처를 확인한 뒤 저장해 주세요.`;
    } catch (error) {
      status.textContent = `홍보지를 읽지 못했습니다: ${error?.message || error}`;
      alert(status.textContent);
    } finally {
      button.disabled = false;
      button.textContent = "홍보지 내용 자동입력";
    }
  });

  document.querySelector("#extractPromotionLinkDraft").addEventListener("click", async () => {
    const url = document.querySelector("#detailUrl").value.trim();
    if (!url) return alert("먼저 홍보 홈페이지 주소를 입력해 주세요.");
    if (!window.extractPromotionDraftFromUrl) return alert("관리자 온라인 연동을 확인한 뒤 다시 시도해 주세요.");
    const button = document.querySelector("#extractPromotionLinkDraft");
    const status = document.querySelector("#promotionDraftStatus");
    button.disabled = true;
    button.textContent = "링크 읽는 중…";
    status.textContent = "공지 페이지 내용을 읽고 프로그램 정보 초안을 만들고 있습니다.";
    try {
      const result = await window.extractPromotionDraftFromUrl(url);
      const draft = window.nurimPrepareDraft(sanitizePromotionDraft(result?.draft));
      let filled = 0;
      filled += setDraftValue("#programTitle", draft.title) ? 1 : 0;
      filled += setDraftValue("#fee", draft.fee) ? 1 : 0;
      filled += setDraftValue("#contactPhone", draft.contactPhone) ? 1 : 0;
      filled += setDraftValue("#audience", draft.audience) ? 1 : 0;
      filled += setDraftValue("#capacity", draft.capacity) ? 1 : 0;
      filled += setDraftValue("#selectionMethod", draft.selectionMethod, true) ? 1 : 0;
      filled += setDraftValue("#startDate", draft.startDate) ? 1 : 0;
      filled += setDraftValue("#endDate", draft.endDate) ? 1 : 0;
      filled += setDraftValue("#schedule", draft.schedule) ? 1 : 0;
      filled += setDraftValue("#description", draft.description) ? 1 : 0;
      filled += setDraftValue("#programAgeGroup", draft.ageGroup) ? 1 : 0;
      filled += window.nurimApplyExtraDraft(draft);
      const warningText = Array.isArray(draft.warnings) && draft.warnings.length ? ` 자동인식이 어려운 항목: ${draft.warnings.join(", ")}.` : "";
      status.textContent = `${filled}개 항목에 초안을 입력했습니다.${warningText} 자동입력 내용을 확인한 뒤 저장해 주세요.`;
    } catch (error) {
      status.textContent = `링크 내용을 읽지 못했습니다: ${error?.message || error}`;
      alert(status.textContent);
    } finally {
      button.disabled = false;
      button.textContent = "링크 내용 자동입력";
    }
  });
})();
