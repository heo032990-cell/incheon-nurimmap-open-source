(() => {
  const createSection = document.querySelector("#programManage");
  const form = document.querySelector("#programForm");
  const programList = document.querySelector("#adminProgramList");
  if (!createSection || !form || !programList) return;

  createSection.id = "programCreate";
  const manageSection = document.createElement("section");
  manageSection.id = "programManage";
  manageSection.className = "hidden";
  manageSection.innerHTML = '<div class="adminSectionIntro"><div><p class="smallLabel">등록된 프로그램</p><h3>프로그램 관리</h3><p>활동분류별로 프로그램을 찾고, 이전 프로그램을 복사해 새 모집을 빠르게 만들 수 있습니다.</p></div><button id="goProgramCreate" class="primary" type="button">새 프로그램 등록</button></div>';
  manageSection.append(programList);
  createSection.after(manageSection);

  const basicGrid = form.querySelector(":scope > .formGrid");
  const consentBox = form.querySelector(":scope > .adminConsentBox");
  const googleFormBox = form.querySelector(":scope > .adminGoogleFormBox");
  const fileBox = form.querySelector(":scope > .adminFileBox");
  const finalActions = form.querySelector(":scope > .formActions");

  const progress = document.createElement("ol");
  progress.className = "programWizardProgress";
  progress.setAttribute("aria-label", "프로그램 등록 단계");
  progress.innerHTML = '<li id="programBasicStepLabel" class="active"><span>1</span><strong>프로그램 기본정보</strong></li><li id="programApplicationStepLabel"><span>2</span><strong>신청정보 설정</strong></li>';

  const basicStep = document.createElement("section");
  basicStep.id = "programBasicStep";
  basicStep.className = "programWizardStep";
  basicStep.innerHTML = '<div class="wizardStepTitle"><p class="smallLabel">1단계</p><h3 tabindex="-1">프로그램 기본정보 입력</h3><p>프로그램 안내와 모집에 필요한 기본 내용을 입력해 주세요.</p></div>';
  basicStep.append(basicGrid);
  const basicActions = document.createElement("div");
  basicActions.className = "formActions";
  basicActions.innerHTML = '<button id="goApplicationSettings" class="primary" type="button">다음: 신청정보 설정</button>';
  basicStep.append(basicActions);

  const applicationStep = document.createElement("section");
  applicationStep.id = "programApplicationStep";
  applicationStep.className = "programWizardStep hidden";
  applicationStep.innerHTML = '<div class="wizardStepTitle"><p class="smallLabel">2단계</p><h3 tabindex="-1">신청 방법 설정</h3><p>기본 신청과 개인정보 동의로 접수합니다. 필요하면 추가 설문 또는 신청서 파일 제출을 선택하세요.</p></div>';
  applicationStep.append(consentBox, googleFormBox, fileBox);
  const backButton = document.createElement("button");
  backButton.id = "backProgramBasic";
  backButton.type = "button";
  backButton.textContent = "이전: 기본정보";
  finalActions.prepend(backButton);
  finalActions.querySelector('button[type="submit"]').textContent = "프로그램 최종 저장";
  applicationStep.append(finalActions);

  form.prepend(progress, basicStep, applicationStep);

  window.setProgramRegistrationStep = function setProgramRegistrationStep(step, focus = false) {
    const application = step === "application";
    basicStep.classList.toggle("hidden", application);
    applicationStep.classList.toggle("hidden", !application);
    document.querySelector("#programBasicStepLabel").classList.toggle("active", !application);
    document.querySelector("#programApplicationStepLabel").classList.toggle("active", application);
    if (focus) (application ? applicationStep : basicStep).querySelector("h3")?.focus();
  };

  function validateBasicStep() {
    window.reconcileAccessibleDateInputs?.(basicGrid);
    const controls = [...basicGrid.querySelectorAll("input,select,textarea")].filter((control) => !control.disabled);
    for (const control of controls) {
      if (!control.validity.valid) { control.reportValidity(); return false; }
    }
    return true;
  }

  document.querySelector("#goApplicationSettings").addEventListener("click", () => {
    if (!validateBasicStep()) return;
    window.setProgramRegistrationStep("application", true);
  });
  backButton.addEventListener("click", () => window.setProgramRegistrationStep("basic", true));
  document.querySelector("#goProgramCreate").addEventListener("click", () => {
    resetProgramForm();
    switchAdminTab("programCreate");
    window.setProgramRegistrationStep("basic", true);
  });
  document.querySelector('[data-tab="programCreate"]')?.addEventListener("click", () => window.setProgramRegistrationStep("basic"));

  const fillProgramBeforeWorkflow = fillProgram;
  fillProgram = function fillProgramAndOpenRegistration(program) {
    fillProgramBeforeWorkflow(program);
    window.reconcileAccessibleDateInputs?.(basicGrid);
    switchAdminTab("programCreate");
    window.setProgramRegistrationStep("basic", true);
  };

  const resetProgramFormBeforeWorkflow = resetProgramForm;
  resetProgramForm = function resetProgramFormAndWizard() {
    resetProgramFormBeforeWorkflow();
    window.setProgramRegistrationStep("basic");
  };

  window.setProgramRegistrationStep("basic");
})();