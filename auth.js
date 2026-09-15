const authKeys = { accounts: "incheon-manager-accounts", config: "incheon-search-config", session: "incheon-admin-session", superPassword: "incheon-super-password" };
const defaultConfig = {
  ageGroups: ["아동", "청소년", "성인", "전연령"],
  centers: [...new Set(programs.map((program) => program.centerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"))
};
const defaultDriveFolderUrl = "https://drive.google.com/drive/folders/YOUR_FOLDER_ID?usp=drive_link";
let adminAccounts = load(authKeys.accounts, []);
adminAccounts = adminAccounts.map((account) => ({ ...account, driveFolderUrl: account.driveFolderUrl || (account.id === "bupyeong-manager" ? defaultDriveFolderUrl : "") }));
save(authKeys.accounts, adminAccounts);
let searchConfig = load(authKeys.config, defaultConfig);
let superPassword = null;
let adminSession = loadSession();
let selectedApplicantProgramId = null;
let applicantCenterFilter = "all";
let adminProgramCenterFilter = "all";
let adminProgramStatusFilter = "all";
let adminProgramVisibilityFilter = "all";
let adminProgramCategoryFilter = "all";

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(authKeys.session)) || null; } catch { return null; }
}
function saveSession(session) {
  adminSession = session;
  if (session) {
    sessionStorage.setItem(authKeys.session, JSON.stringify(session));
    sessionStorage.setItem(keys.admin, "true");
  } else {
    sessionStorage.removeItem(authKeys.session);
    sessionStorage.removeItem(keys.admin);
  }
}
function isSuperAdmin() { return adminSession?.role === "super"; }
function allowedPrograms() { return isSuperAdmin() ? programs : programs.filter((program) => program.managerId === adminSession?.accountId); }
function activeManagerAccount() { return adminAccounts.find((account) => account.id === adminSession?.accountId) || null; }
function validDriveFolderUrl(value) {
  try { const url = new URL(value); return url.hostname === "drive.google.com" && url.pathname.includes("/drive/folders/") ? url.href : ""; } catch { return ""; }
}

function switchAdminTab(tabId = "programCreate") {
  const safeTabId = tabId === "superManage" && !isSuperAdmin() ? "programCreate" : tabId;
  ["programCreate", "programManage", "applicantManage", "superManage"].forEach((id) => {
    document.querySelector(`#${id}`)?.classList.toggle("hidden", id !== safeTabId);
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === safeTabId);
  });
}

function applySearchConfig() {
  const ageSelect = document.querySelector("#ageGroup");
  const currentAge = ageSelect.value;
  ageSelect.innerHTML = '<option value="all">전체 연령</option>' + searchConfig.ageGroups.map((age) => `<option value="${esc(age)}">${esc(age)}</option>`).join("") + '<option value="__custom__">기타·직접입력</option>';
  ageSelect.value = searchConfig.ageGroups.includes(currentAge) || currentAge === "__custom__" ? currentAge : "all";
  const programAgeSelect = document.querySelector("#programAgeGroup");
  const currentProgramAge = programAgeSelect.value;
  programAgeSelect.innerHTML = '<option value="">선택</option>' + searchConfig.ageGroups.map((age) => `<option value="${esc(age)}">${esc(age)}</option>`).join("") + '<option value="__custom__">직접입력</option>';
  programAgeSelect.value = searchConfig.ageGroups.includes(currentProgramAge) || currentProgramAge === "__custom__" ? currentProgramAge : "";
  refreshCenterFilter();
}

refreshCenterFilter = function () {
  const select = document.querySelector("#centerFilter");
  const selected = select.value;
  const centers = [...new Set([...searchConfig.centers, ...programs.map((program) => program.centerName)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = '<option value="all">전체 복지관</option>' + centers.map((center) => `<option value="${esc(center)}">${esc(center)}</option>`).join("");
  select.value = centers.includes(selected) ? selected : "all";
};

function applyAdminAccess() {
  const loggedIn = Boolean(adminSession);
  document.querySelector("#loginBox").classList.toggle("hidden", loggedIn);
  document.querySelector("#adminPanel").classList.toggle("hidden", !loggedIn);
  if (!loggedIn) {
    clearProtectedAdminContent();
    return;
  }
  document.querySelector("#adminRoleBadge").textContent = isSuperAdmin() ? "최고관리자" : "일반 관리자";
  document.querySelector("#adminIdentityText").textContent = isSuperAdmin() ? "인천광역시 통합 관리" : `${adminSession.name} · ${adminSession.centerName}`;
  document.querySelector("#superTab").classList.toggle("hidden", !isSuperAdmin());
  switchAdminTab("programCreate");
  const centerInput = document.querySelector("#centerName");
  centerInput.readOnly = !isSuperAdmin();
  if (!isSuperAdmin()) centerInput.value = adminSession.centerName;
  syncRegistrationCenter();
  const driveLink = document.querySelector("#assignedDriveLink");
  const assignedDriveUrl = isSuperAdmin() ? "" : validDriveFolderUrl(activeManagerAccount()?.driveFolderUrl || "");
  driveLink.classList.toggle("hidden", !assignedDriveUrl);
  if (assignedDriveUrl) driveLink.href = assignedDriveUrl;
  renderAdminPrograms();
  renderApplicants();
  if (isSuperAdmin()) renderSuperSettings();
}

function ensureAdminProgramControls(permittedPrograms) {
  let controls = document.querySelector("#adminProgramControls");
  if (!controls) {
    controls = document.createElement("section");
    controls.id = "adminProgramControls";
    controls.className = "adminProgramControls";
    document.querySelector("#adminProgramList").before(controls);
  }
  const centers = [...new Set(permittedPrograms.map((program) => program.centerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const categories = [...new Set(permittedPrograms.map((program) => program.activityCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  if (!isSuperAdmin()) adminProgramCenterFilter = centers[0] || "all";
  if (adminProgramCenterFilter !== "all" && !centers.includes(adminProgramCenterFilter)) adminProgramCenterFilter = "all";
  if (adminProgramCategoryFilter !== "all" && !categories.includes(adminProgramCategoryFilter)) adminProgramCategoryFilter = "all";
  controls.innerHTML = `<div><h3>프로그램 빠른 정리</h3><p>${isSuperAdmin() ? "기관과 " : ""}활동분류·모집상태를 골라 비슷한 프로그램을 찾고 복사할 수 있습니다.</p></div>
    <div class="adminProgramFilterRow">${isSuperAdmin() ? `<label>복지관<select id="adminProgramCenterFilter"><option value="all">전체 복지관</option>${centers.map((center) => `<option value="${esc(center)}">${esc(center)}</option>`).join("")}</select></label>` : ""}<label>활동분류<select id="adminProgramCategoryFilter"><option value="all">전체 활동분류</option>${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}</select></label><label>모집상태<select id="adminProgramStatusFilter"><option value="all">전체</option><option value="open">모집중</option><option value="upcoming">모집예정</option><option value="closed">마감</option></select></label><label>공개상태<select id="adminProgramVisibilityFilter"><option value="all">전체</option><option value="public">이용자에게 공개</option><option value="hidden">숨김</option></select></label></div>`;
  if (isSuperAdmin()) {
    controls.querySelector("#adminProgramCenterFilter").value = adminProgramCenterFilter;
    controls.querySelector("#adminProgramCenterFilter").addEventListener("change", (event) => { adminProgramCenterFilter = event.target.value; renderAdminPrograms(); });
  }
  controls.querySelector("#adminProgramCategoryFilter").value = adminProgramCategoryFilter;
  controls.querySelector("#adminProgramStatusFilter").value = adminProgramStatusFilter;
  controls.querySelector("#adminProgramVisibilityFilter").value = adminProgramVisibilityFilter;
  controls.querySelector("#adminProgramCategoryFilter").addEventListener("change", (event) => { adminProgramCategoryFilter = event.target.value; renderAdminPrograms(); });
  controls.querySelector("#adminProgramStatusFilter").addEventListener("change", (event) => { adminProgramStatusFilter = event.target.value; renderAdminPrograms(); });
  controls.querySelector("#adminProgramVisibilityFilter").addEventListener("change", (event) => { adminProgramVisibilityFilter = event.target.value; renderAdminPrograms(); });
}

function applicationQueueLabel(applicant, program) {
  if (applicant.lifecycleStatus === "deleted") return "관리자 삭제";
  if (applicant.lifecycleStatus === "cancelled") return "취소";
  if (applicant.lifecycleStatus === "modified") return "수정";
  if (applicant.applicationStatus === "pending_selection") return "접수 · 선정 대기";
  if (applicant.applicationStatus === "waitlist") return `접수 · 대기 ${Math.max(1, Number(applicant.queueNumber || 0) - Number(program.capacity || 0))}번`;
  return "접수";
}
function applicationLifecycleTime(applicant) {
  const value = applicant.deletedAt || applicant.cancelledAt || applicant.modifiedAt || applicant.createdAt;
  return value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";
}
function applicationSelectionLabel(program) {
  if (program.selectionMethod === "open") return "누구나 참여";
  return program.selectionMethod === "lottery" ? "추첨·배점" : "선착순";
}

async function toggleProgramVisibility(program) {
  if (!allowedPrograms().some((item) => item.id === program.id)) return;
  program.hiddenFromPublic = !program.hiddenFromPublic;
  save(keys.programs, programs);
  renderAll();
}

function copyProgramAsNew(program) {
  if (!allowedPrograms().some((item) => item.id === program.id)) return;
  const copy = JSON.parse(JSON.stringify(program));
  Object.assign(copy, {
    id: `copy-${Date.now()}`,
    title: `${program.title} (복사본)`,
    startDate: "",
    endDate: "",
    hiddenFromPublic: true,
    detailUrl: "",
    promotionImages: [],
    promotionImage: null,
    promotionImagePath: null,
    formTemplate: null,
    googleFormUrl: "",
    googleFormVerificationEnabled: false,
    googleFormTokenEntry: ""
  });
  fillProgram(copy);
  editingId = null;
  document.querySelector("#programTitle").focus();
  alert("새 프로그램 초안으로 복사했습니다. 프로그램명, 모집기간, 운영일정을 확인하고 새 홍보지·신청서·Google Form이 필요하면 다시 연결해 주세요.");
}

function renderAdminPrograms() {
  const box = document.querySelector("#adminProgramList");
  box.innerHTML = "";
  const permitted = allowedPrograms();
  ensureAdminProgramControls(permitted);
  const visible = permitted.filter((program) => (adminProgramCenterFilter === "all" || program.centerName === adminProgramCenterFilter)
    && (adminProgramCategoryFilter === "all" || program.activityCategory === adminProgramCategoryFilter)
    && (adminProgramStatusFilter === "all" || statusOf(program).key === adminProgramStatusFilter)
    && (adminProgramVisibilityFilter === "all" || (adminProgramVisibilityFilter === "hidden") === (program.hiddenFromPublic === true)));
  if (!visible.length) { box.innerHTML = '<p class="empty">선택한 조건에 맞는 프로그램이 없습니다.</p>'; return; }
  visible.forEach((program) => {
    const status = statusOf(program);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="rowHead"><div><p class="managerCenter">${esc(program.centerName)}</p><h3>${esc(program.title)}</h3><div class="adminProgramBadges"><span class="badge ${status.key}">${status.label}</span>${program.activityCategory ? `<span>${esc(program.activityCategory)}</span>` : ""}<span>${applicationSelectionLabel(program)}</span><span class="${program.hiddenFromPublic ? "hiddenState" : "publicState"}">${program.hiddenFromPublic ? "이용자에게 숨김" : "공개 중"}</span></div><p>${dateText(program.startDate)} - ${dateText(program.endDate)} · 신청 ${count(program.id)}명${Number(program.capacity) === 0 ? " · 제한 없음" : `/${program.capacity}명`}</p></div><div><button class="toggleVisibility" type="button">${program.hiddenFromPublic ? "다시 공개" : "이용자에게 숨기기"}</button><button class="copy" type="button">복사해서 새로 만들기</button><button class="edit" type="button">수정</button><button class="danger delete" type="button">삭제</button></div></div>`;
    row.querySelector(".toggleVisibility").addEventListener("click", () => toggleProgramVisibility(program));
    row.querySelector(".edit").addEventListener("click", () => fillProgram(program));
    row.querySelector(".copy").addEventListener("click", () => copyProgramAsNew(program));
    row.querySelector(".delete").addEventListener("click", () => deleteProgram(program.id));
    box.append(row);
  });
}

function renderApplicants() {
  const box = document.querySelector("#applicantList");
  box.innerHTML = "";
  if (!adminSession) return;
  const permittedPrograms = allowedPrograms();
  const permittedIds = new Set(permittedPrograms.map((program) => program.id));
  const visible = applicants
    .filter((applicant) => permittedIds.has(applicant.programId))
    .slice()
    .sort((a, b) => {
      const createdOrder = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      return createdOrder || Number(a.queueNumber || 0) - Number(b.queueNumber || 0);
    });
  if (!visible.length) { box.innerHTML = '<p class="empty">접수된 신청자가 없습니다.</p>'; return; }
  const programsWithApplicants = permittedPrograms.filter((program) => visible.some((applicant) => applicant.programId === program.id));
  const centers = [...new Set(programsWithApplicants.map((program) => program.centerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  if (!isSuperAdmin()) applicantCenterFilter = centers[0] || "all";
  if (applicantCenterFilter !== "all" && !centers.includes(applicantCenterFilter)) applicantCenterFilter = "all";
  const centerPrograms = programsWithApplicants.filter((program) => applicantCenterFilter === "all" || program.centerName === applicantCenterFilter);
  if (!centerPrograms.some((program) => program.id === selectedApplicantProgramId)) selectedApplicantProgramId = centerPrograms[0]?.id || null;
  const controls = document.createElement("section");
  controls.className = "applicantSelectionControls";
  controls.innerHTML = `<div><h3>신청자 빠른 찾기</h3><p>${isSuperAdmin() ? "복지관을 먼저 고른 뒤 " : ""}프로그램을 선택해 신청자를 확인하세요.</p></div><div class="applicantSelectionRow">${isSuperAdmin() ? `<label>복지관<select id="applicantCenterSelect"><option value="all">전체 복지관</option>${centers.map((center) => `<option value="${esc(center)}">${esc(center)}</option>`).join("")}</select></label>` : ""}<label>프로그램<select id="applicantProgramSelect">${centerPrograms.map((program) => { const programCount = visible.filter((applicant) => applicant.programId === program.id).length; return `<option value="${esc(program.id)}">${esc(program.title)} (${programCount}명)</option>`; }).join("")}</select></label></div>`;
  if (isSuperAdmin()) {
    controls.querySelector("#applicantCenterSelect").value = applicantCenterFilter;
    controls.querySelector("#applicantCenterSelect").addEventListener("change", (event) => { applicantCenterFilter = event.target.value; selectedApplicantProgramId = null; renderApplicants(); });
  }
  const programSelect = controls.querySelector("#applicantProgramSelect");
  programSelect.value = selectedApplicantProgramId || "";
  programSelect.addEventListener("change", (event) => { selectedApplicantProgramId = event.target.value; renderApplicants(); });
  box.append(controls);
  centerPrograms.filter((program) => program.id === selectedApplicantProgramId).forEach((program) => {
    const programApplicants = visible.filter((applicant) => applicant.programId === program.id);
    if (!programApplicants.length) return;
    const group = document.createElement("section");
    group.className = "applicantProgramGroup";
    group.innerHTML = `<div class="programGroupHeader"><div><p>${esc(program.centerName)}</p><h3>${esc(program.title)}</h3></div><div class="programPrintTools"><span>${programApplicants.length}명 신청</span><label class="selectAllApplicants"><input type="checkbox">전체 선택</label><button class="printSelectedApplications" type="button">선택 신청서 인쇄</button><button class="printAllApplications" type="button">전체 신청서 인쇄</button><button class="printRosterButton" type="button">명단 A4 인쇄</button></div></div><div class="programApplicantList"></div>`;
    group.querySelectorAll(".selectAllApplicants,.printSelectedApplications,.printAllApplications,.printRosterButton").forEach(node=>node.hidden=true);
    const csvButton=document.createElement("button");csvButton.type="button";csvButton.textContent="참여 명단 CSV";csvButton.onclick=()=>downloadBasicRoster(program,programApplicants);group.querySelector(".programPrintTools").append(csvButton);
    const list = group.querySelector(".programApplicantList");
    const selectAll = group.querySelector(".selectAllApplicants input");
    const checkedApplicants = () => {
      const ids = new Set([...list.querySelectorAll(".applicantPrintCheck:checked")].map((input) => input.value));
      return programApplicants.filter((applicant) => ids.has(applicant.id));
    };
    selectAll.addEventListener("change", () => {
      list.querySelectorAll(".applicantPrintCheck").forEach((input) => { input.checked = selectAll.checked; });
      selectAll.indeterminate = false;
    });
    list.addEventListener("change", (event) => {
      if (!event.target.matches(".applicantPrintCheck")) return;
      const checks = [...list.querySelectorAll(".applicantPrintCheck")];
      const checkedCount = checks.filter((input) => input.checked).length;
      selectAll.checked = checkedCount === checks.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
    });
    group.querySelector(".printSelectedApplications").addEventListener("click", () => printApplications(program, checkedApplicants()));
    group.querySelector(".printAllApplications").addEventListener("click", () => printApplications(program, programApplicants));
    group.querySelector(".printRosterButton").addEventListener("click", () => printProgramRoster(program, programApplicants));
    programApplicants.forEach((applicant) => {
      const uploadedFile = applicant.uploadedForm;
      const multipleFiles = /^__nurim_attachments_v101_\d+\.zip$/.test(uploadedFile?.name || "");
      const storedFileName = multipleFiles ? "제출한 신청서·증빙자료" : driveFileName(applicant, program, uploadedFile?.name);
      const downloadArea = uploadedFile?.dataUrl
        ? `<div class="submittedFile"><div><span>제출 신청서</span><strong>${esc(storedFileName)}</strong></div><a class="fileDownload" href="${uploadedFile.dataUrl}" ${multipleFiles ? 'target="_blank" rel="noopener"' : 'download="'+esc(storedFileName)+'"'}>${multipleFiles ? '첨부파일 모음 보기' : '신청서 다운로드'}</a></div>`
        : '<div class="submittedFile emptyFile"><span>제출된 신청서 파일이 없습니다.</span></div>';
      const consentProgram={...program,consentItems:applicant.baseConsentSnapshot?.length?applicant.baseConsentSnapshot:program.consentItems};
      const consentEntries = Object.entries(applicant.consentResponses || {});
      const consentDetails = consentEntries.length
        ? consentEntries.map(([key, value]) => `<div><dt>${esc(consentLabel(consentProgram, key))}</dt><dd class="${value === "agree" ? "agreed" : "disagreed"}">${value === "agree" ? "동의" : "미동의"}</dd></div>`).join("")
        : '<div><dt>개인정보 동의</dt><dd>이 프로그램은 별도 동의서를 사용하지 않았습니다.</dd></div>';
      const applicationDetails = `<details class="applicationDetails"><summary>신청서 내용 상세보기</summary><div class="applicationDetailGrid"><div><dt>신청자 이름</dt><dd>${esc(applicant.name)}</dd></div><div><dt>연락처</dt><dd>${esc(applicant.phone)}</dd></div><div><dt>생년월일</dt><dd>${esc(applicant.birth)}</dd></div><div><dt>참여자 구분</dt><dd>${esc(applicant.type)}</dd></div><div><dt>접수 상태</dt><dd>${applicationQueueLabel(applicant, program)}</dd></div><div><dt>최근 처리</dt><dd>${applicant.lastActionActor === "administrator" ? "관리자" : "이용자"} · ${applicationLifecycleTime(applicant)}</dd></div><div><dt>Google Form 확인</dt><dd>${program.googleFormUrl ? (applicant.googleFormConfirmedAt ? new Date(applicant.googleFormConfirmedAt).toLocaleString("ko-KR") : "확인 기록 없음") : "사용하지 않음"}</dd></div><div class="fullDetail"><dt>요청사항</dt><dd>${applicant.note ? esc(applicant.note) : "없음"}</dd></div><div><dt>전자서명</dt><dd>${esc(applicant.signature || "해당 없음")}</dd></div><div><dt>동의 일시</dt><dd>${applicant.privacyAgreedAt ? new Date(applicant.privacyAgreedAt).toLocaleString("ko-KR") : "해당 없음"}</dd></div></div>${applicant.guardianRequired ? `<section class="guardianConsentRecord"><h4>아동·보호자 동의 기록</h4><p>신청 아동: ${esc(applicant.name)} / 신청자 서명: ${esc(applicant.signature)}</p><p>보호자(법정대리인): ${esc(applicant.guardianName)} / 보호자 서명: ${esc(applicant.guardianSignature)}</p><p>보호자 동의일시: ${esc(new Date(applicant.guardianAgreedAt).toLocaleString("ko-KR"))}</p><p>${esc(applicant.guardianConsentText)}</p><p>이름·서명 입력 기록이며 법정대리인 신원·관계의 별도 확인 완료를 뜻하지 않습니다.</p></section>` : ""}<h4>개인정보 동의 응답</h4><dl class="consentResponseList">${consentDetails}</dl>${(applicant.baseConsentSnapshot||[]).map(item=>`<details><summary>${esc(item.title||"개인정보 동의 내용")}</summary><p style="white-space:pre-wrap">${esc(item.text||"")}</p></details>`).join("")}${downloadArea}</details>`;
      const row = document.createElement("article");
      row.className = `applicantSummaryRow lifecycle-${applicant.lifecycleStatus || "received"}`;
      row.innerHTML = `<div class="applicantIdentity"><label class="applicantSelect"><input class="applicantPrintCheck" type="checkbox" value="${esc(applicant.id)}"><span>출력 선택</span></label><strong>${esc(applicant.name)}</strong><span class="applicationQueueTag ${applicant.lifecycleStatus || "received"}">${applicationQueueLabel(applicant, program)}</span><a href="tel:${esc(applicant.phone)}">${esc(applicant.phone)}</a></div>${applicationDetails}`;
      const printApplicationButton = document.createElement("button");
      printApplicationButton.type = "button";
      printApplicationButton.className = "printApplicationButton";
      printApplicationButton.textContent = "신청서 A4 인쇄";
      printApplicationButton.addEventListener("click", () => printApplication(program, applicant));
      row.querySelector(".applicantSelect").hidden=true;
      if(program.surveyId&&applicant.driveFolderUrl){const link=document.createElement("a");link.href=applicant.driveFolderUrl;link.target="_blank";link.rel="noopener";link.textContent="설문 신청서 보기";row.querySelector(".applicantIdentity").append(link);}
      list.append(row);
    });
    box.append(group);
  });
}

function driveFileName(applicant, program, originalName) {
  const extension = originalName && originalName.includes(".") ? `.${originalName.split(".").pop().replace(/[^a-zA-Z0-9]/g, "")}` : "";
  const clean = (value) => String(value || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${clean(applicant.name)}_${clean(program.title)}${extension}`;
}

function consentLabel(program, key) {
  for (const item of program?.consentItems || []) {
    if (item.id === key) return item.title;
    const row = (item.rows || []).find((entry) => entry.id === key);
    if (row) return `${item.title} - ${row.label}`;
  }
  return key;
}

function renderSuperSettings() {
  document.querySelector("#configAgeGroups").value = searchConfig.ageGroups.join("\n");
  document.querySelector("#configCenters").value = searchConfig.centers.join("\n");
  // Supabase 연결 후에는 원격 담당자 목록을 supabase-integration.js에서만 표시합니다.
  // 브라우저에 남은 예전 계정 목록이 원격 목록을 다시 덮어쓰는 현상을 방지합니다.
  if (window.__REMOTE_ADMIN_MODE__) return;
  const centerSelect = document.querySelector("#managerCenter");
  centerSelect.innerHTML = searchConfig.centers.map((center) => `<option value="${esc(center)}">${esc(center)}</option>`).join("");
  const list = document.querySelector("#managerList");
  list.innerHTML = adminAccounts.length ? "" : '<p class="empty">등록된 복지관 담당자가 없습니다.</p>';
  adminAccounts.forEach((account) => {
    const row = document.createElement("div");
    row.className = "row accountRow";
    const driveUrl = validDriveFolderUrl(account.driveFolderUrl || "");
    row.innerHTML = `<div class="accountInfo"><strong>${esc(account.name)}</strong><p>${esc(account.centerName)} · 아이디 ${esc(account.username)}</p><label>담당 Google Drive 폴더<input class="accountDriveInput" type="url" value="${esc(account.driveFolderUrl || "")}" placeholder="https://drive.google.com/drive/folders/..."></label><div class="accountActions"><button class="saveDrive" type="button">폴더 저장</button>${driveUrl ? `<a href="${esc(driveUrl)}" target="_blank" rel="noopener noreferrer">폴더 확인 ↗</a>` : ""}</div></div><button class="danger deleteAccount" type="button">계정 삭제</button>`;
    row.querySelector(".saveDrive").addEventListener("click", () => {
      const folderUrl = validDriveFolderUrl(row.querySelector(".accountDriveInput").value.trim());
      if (!folderUrl) { alert("올바른 Google Drive 폴더 주소를 입력해 주세요."); return; }
      adminAccounts = adminAccounts.map((item) => item.id === account.id ? { ...item, driveFolderUrl: folderUrl } : item);
      save(authKeys.accounts, adminAccounts);
      renderSuperSettings();
      alert("담당자 Drive 폴더를 저장했습니다.");
    });
    row.querySelector(".deleteAccount").addEventListener("click", () => { if (!confirm(`${account.name} 담당자 계정을 삭제할까요?`)) return; adminAccounts = adminAccounts.filter((item) => item.id !== account.id); save(authKeys.accounts, adminAccounts); renderSuperSettings(); });
    list.append(row);
  });
}

const oldLogin = document.querySelector("#login");
const newLogin = oldLogin.cloneNode(true);
oldLogin.replaceWith(newLogin);
newLogin.addEventListener("click", async () => {
  if (window.__REMOTE_ADMIN_MODE__) {
    const email = document.querySelector("#adminUsername").value.trim();
    const password = document.querySelector("#adminCode").value;
    if (!email || !password) { alert("이메일과 비밀번호를 입력해 주세요."); return; }
    const config = window.INCHEON_SUPABASE;
    const db = window.incheonSupabase || (config && window.supabase?.createClient ? window.supabase.createClient(config.url, config.publishableKey) : null);
    if (!db) { alert("로그인 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."); return; }
    newLogin.disabled = true;
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (typeof window.__applyAuthenticatedUser === "function") await window.__applyAuthenticatedUser(data.user);
      else window.location.reload();
    } catch (error) {
      alert(error?.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 맞지 않습니다." : `로그인에 실패했습니다: ${error?.message || error}`);
    } finally {
      newLogin.disabled = false;
    }
    return;
  }
  const username = document.querySelector("#adminUsername").value.trim();
  const password = document.querySelector("#adminCode").value;
  if (username === "superadmin" && superPassword && password === superPassword) saveSession({ role: "super", name: "최고관리자" });
  else {
    const account = adminAccounts.find((item) => item.username === username && item.password === password);
    if (!account) { alert("아이디 또는 비밀번호가 맞지 않습니다."); return; }
    saveSession({ role: "manager", accountId: account.id, name: account.name, centerName: account.centerName });
  }
  applyAdminAccess();
});
document.querySelector("#adminOpen").addEventListener("click", applyAdminAccess);
document.querySelector("#adminLogout").addEventListener("click", () => {
  saveSession(null);
  switchAdminTab("programCreate");
  clearProtectedAdminContent();
  document.querySelector("#adminPanel").classList.add("hidden");
  document.querySelector("#loginBox").classList.remove("hidden");
  document.querySelector("#adminUsername").value = "";
  document.querySelector("#adminCode").value = "";
});

function clearProtectedAdminContent() {
  document.querySelector("#applicantList").replaceChildren();
  document.querySelector("#adminProgramList").replaceChildren();
  document.querySelector("#assignedDriveLink").classList.add("hidden");
  document.querySelector("#assignedDriveLink").removeAttribute("href");
  selectedApplicantProgramId = null;
}

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
  switchAdminTab(button.dataset.tab);
}));

document.querySelector("#programForm").addEventListener("submit", (event) => {
  if (!adminSession) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (!isSuperAdmin()) document.querySelector("#centerName").value = adminSession.centerName;
  const retentionYears = Number(document.querySelector("#privacyRetentionYears").value);
  if (!Number.isInteger(retentionYears) || retentionYears < 1 || retentionYears > 30) { event.preventDefault(); event.stopImmediatePropagation(); alert("개인정보 보유기간을 1년부터 30년 사이의 연 단위로 입력해 주세요."); return; }
  if (editingId && !allowedPrograms().some((program) => program.id === editingId)) { event.preventDefault(); event.stopImmediatePropagation(); alert("이 프로그램을 수정할 권한이 없습니다."); }
}, true);
document.querySelector("#programForm").addEventListener("submit", () => {
  if (!isSuperAdmin() && adminSession) document.querySelector("#centerName").value = adminSession.centerName;
});
document.querySelector("#resetProgram").addEventListener("click", () => {
  if (!isSuperAdmin() && adminSession) document.querySelector("#centerName").value = adminSession.centerName;
});

document.querySelector("#searchConfigForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isSuperAdmin()) return;
  const lines = (id) => [...new Set(document.querySelector(id).value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
  const ageGroups = lines("#configAgeGroups");
  const centers = lines("#configCenters");
  if (!ageGroups.length || !centers.length) { alert("이용 연령과 복지관을 각각 하나 이상 입력해 주세요."); return; }
  searchConfig = { ageGroups, centers };
  save(authKeys.config, searchConfig);
  applySearchConfig();
  renderSuperSettings();
  renderPrograms();
  alert("상세검색 항목을 저장했습니다.");
});

document.querySelector("#superPasswordForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isSuperAdmin()) return;
  const currentPassword = document.querySelector("#currentSuperPassword").value;
  const newPassword = document.querySelector("#newSuperPassword").value;
  const confirmPassword = document.querySelector("#confirmSuperPassword").value;
  if (currentPassword !== superPassword) { alert("현재 비밀번호가 맞지 않습니다."); return; }
  if (newPassword.length < 8) { alert("새 비밀번호는 8자 이상으로 입력해 주세요."); return; }
  if (newPassword !== confirmPassword) { alert("새 비밀번호 확인이 일치하지 않습니다."); return; }
  if (newPassword === currentPassword) { alert("현재 비밀번호와 다른 비밀번호를 입력해 주세요."); return; }
  superPassword = newPassword;
  save(authKeys.superPassword, superPassword);
  event.target.reset();
  alert("최고관리자 비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.");
  document.querySelector("#adminLogout").click();
});

document.querySelector("#managerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isSuperAdmin()) return;
  const username = document.querySelector("#managerUsername").value.trim();
  if (username === "superadmin" || adminAccounts.some((account) => account.username === username)) { alert("이미 사용 중인 관리자 아이디입니다."); return; }
  const driveFolderUrl = validDriveFolderUrl(document.querySelector("#managerDriveUrl").value.trim());
  if (!driveFolderUrl) { alert("올바른 Google Drive 폴더 주소를 입력해 주세요."); return; }
  adminAccounts.push({ id: id(), name: document.querySelector("#managerName").value.trim(), username, password: document.querySelector("#managerPassword").value, centerName: document.querySelector("#managerCenter").value, driveFolderUrl });
  save(authKeys.accounts, adminAccounts);
  event.target.reset();
  renderSuperSettings();
});

applySearchConfig();
applyAdminAccess();

function downloadBasicRoster(program,items){
 const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const rows=[['신청번호','프로그램','이름','생년월일','연락처','접수상태'],...items.map(a=>[a.id,program.title,a.name,a.birth,a.phone,a.lifecycleStatus==='cancelled'?'취소':a.lifecycleStatus==='deleted'?'삭제':a.applicationStatus||'접수'])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=(program.title||'프로그램')+'_참여명단.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}


// Keep the authenticated institution through new/copy/reset registration flows.
function syncRegistrationCenter(){
 const input=document.querySelector('#centerName');if(!input)return;
 const manager=!!adminSession&&!isSuperAdmin();
 input.readOnly=manager;
 input.placeholder=manager?'등록된 기관명이 없습니다. 최고관리자에게 확인해 주세요.':'예: 인천광역시장애인종합복지관';
 if(manager)input.value=adminSession.centerName||'';
}
const resetBeforeInstitution=resetProgramForm;
resetProgramForm=function(){resetBeforeInstitution();syncRegistrationCenter();};
const fillBeforeInstitution=fillProgram;
fillProgram=function(p){fillBeforeInstitution(p);syncRegistrationCenter();};
document.querySelector('#programForm').addEventListener('reset',()=>queueMicrotask(syncRegistrationCenter));
document.querySelectorAll('[data-tab="programCreate"]').forEach(b=>b.addEventListener('click',syncRegistrationCenter));

function validateApplicationSignature(){
 const p=typeof activeProgram!=='undefined'?activeProgram:null;
 if(!p?.consentEnabled||!activeConsentItems(p).length)return true;
 const name=document.querySelector('#name').value.trim().normalize('NFC');
 const signature=document.querySelector('#signature');
 if(!name||name!==signature.value.trim().normalize('NFC')){alert('전자서명은 1페이지에 입력한 신청자 이름과 같아야 합니다.');signature.focus();return false;}
 return true;
}
document.addEventListener('submit',e=>{if(e.target.id==='applyForm'&&!validateApplicationSignature()){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('click',e=>{if(e.target.closest('#applySubmitButton')&&!validateApplicationSignature()){e.preventDefault();e.stopImmediatePropagation();}},true);
