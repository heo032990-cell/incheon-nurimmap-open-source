const centerDefaults = {
  p1: ["부평장애인종합복지관", "무료", "https://www.bprwcd.or.kr/"],
  p2: ["남동장애인종합복지관", "월 10,000원", "https://www.ndjb.or.kr/"],
  p3: ["인천광역시장애인종합복지관", "무료", "https://www.icjb.or.kr/"]
};

programs = programs.map((program) => {
  const fallback = centerDefaults[program.id] || ["인천광역시 장애인복지관", "무료", ""];
  const inferredAgeGroup = program.title.includes("청소년") || program.audience.includes("청소년") ? "청소년"
    : program.title.includes("아동") || program.audience.includes("아동") ? "아동"
    : program.audience.includes("가족") || program.audience.includes("보호자") ? "전연령"
    : "성인";
  return {
    ...program,
    centerName: program.centerName || fallback[0],
    fee: program.fee || fallback[1],
    detailUrl: program.detailUrl || fallback[2],
    ageGroup: program.ageGroup || inferredAgeGroup
  };
});
save(keys.programs, programs);

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

let programPage = 1;
let lastProgramFilterKey = "";

function programColumnsForViewport() {
  const box=document.querySelector('#programs');
  const width=box?.clientWidth||window.innerWidth;
  const minimum=20*parseFloat(getComputedStyle(document.documentElement).fontSize);
  const columns=Math.max(1,Math.min(4,Math.floor((width+20)/(minimum+20))));
  if(box)box.style.gridTemplateColumns='repeat('+columns+',minmax(0,1fr))';
  return columns;
}

function renderProgramPagination(totalPages) {
  let pagination = document.querySelector("#programPagination");
  if (!pagination) {
    pagination = document.createElement("nav");
    pagination.id = "programPagination";
    pagination.className = "programPagination";
    pagination.setAttribute("aria-label", "프로그램 목록 페이지");
    document.querySelector("#programs").after(pagination);
  }
  pagination.replaceChildren();
  pagination.classList.toggle("hidden", totalPages <= 1);
  if (totalPages <= 1) return;

  const moveTo = (page) => {
    programPage = Math.min(totalPages, Math.max(1, page));
    renderPrograms();
    const heading = document.querySelector("#programResultsTitle");
    heading.focus();
    heading.scrollIntoView({ block: "start" });
  };
  const makeButton = (label, page, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = options.disabled === true;
    button.classList.toggle("active", options.active === true);
    if (options.active) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => moveTo(page));
    return button;
  };

  pagination.append(makeButton("이전", programPage - 1, { disabled: programPage === 1 }));
  const start = Math.max(1, Math.min(programPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let page = start; page <= end; page += 1) {
    pagination.append(makeButton(String(page), page, { active: page === programPage }));
  }
  const pageStatus = document.createElement("span");
  pageStatus.className = "programPageStatus";
  pageStatus.textContent = `${programPage} / ${totalPages}`;
  pagination.append(pageStatus, makeButton("다음", programPage + 1, { disabled: programPage === totalPages }));
}


function programDescriptionHtml(value) {
  const raw = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return "";
  let lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1 && /\s+[＊*•]\s*/.test(raw)) {
    lines = raw.split(/\s+(?=[＊*•]\s*)/).map((line) => line.trim()).filter(Boolean);
  }
  return lines.map((line) => {
    const match = line.match(/^[＊*•-]\s*(.+)$/);
    return match ? `<span class="descriptionBullet">• ${esc(match[1])}</span>` : `<span>${esc(line)}</span>`;
  }).join("<br>");
}

function renderPrograms() {
  const box = document.querySelector("#programs");
  const query = document.querySelector("#search").value.trim().toLowerCase();
  const filter = document.querySelector("#status").value;
  const ageGroup = document.querySelector("#ageGroup").value;
  const center = document.querySelector("#centerFilter").value;
  const activityCategory = document.querySelector("#activityCategoryFilter")?.value || "all";
  const disabilityType = document.querySelector("#disabilityFilter")?.value || "all";
  const audienceType = document.querySelector("#audienceTypeFilter")?.value || "all";
  const sort = document.querySelector("#programSort")?.value || "default";
  box.innerHTML = "";

  let visible = programs.filter((program) => {
    const status = statusOf(program).key;
    const searchable = [program.title, program.centerName, program.activityCategory, ...(program.disabilityTypes || []), program.audienceType, program.audience, program.description, program.schedule, program.fee].join(" ").toLowerCase();
    return (filter === "all" || filter === status)
      && (ageGroup === "all" || (ageGroup === "__custom__" ? !searchConfig.ageGroups.includes(program.ageGroup) : program.ageGroup === ageGroup))
      && (center === "all" || program.centerName === center)
      && (activityCategory === "all" || program.activityCategory === activityCategory)
      && window.nurimMatchesDisability(program.disabilityTypes, disabilityType)
      && (audienceType === "all" || (program.audienceType || "기타") === audienceType)
      && program.hiddenFromPublic !== true
      && (!query || searchable.includes(query));
  });

  const dateValue = (value) => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const statusRank = { open: 0, upcoming: 1, closed: 2 };
  const urgentRank = (program) => {
    if (statusOf(program).key !== "open") return 1;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(`${program.endDate}T00:00:00`);
    const days = Math.ceil((end - today) / 86400000);
    return days >= 0 && days <= 3 ? 0 : 1;
  };
  const defaultCompare = (a, b) => urgentRank(a) - urgentRank(b)
    || (statusRank[statusOf(a).key] ?? 9) - (statusRank[statusOf(b).key] ?? 9)
    || dateValue(a.endDate) - dateValue(b.endDate);
  visible = [...visible].sort((a, b) => {
    if (sort === "newest") return dateValue(b.createdAt) - dateValue(a.createdAt) || defaultCompare(a, b);
    if (sort === "closing") {
      const aOpen = statusOf(a).key === "open" ? 0 : 1;
      const bOpen = statusOf(b).key === "open" ? 0 : 1;
      return aOpen - bOpen || dateValue(a.endDate) - dateValue(b.endDate);
    }
    if (sort === "recentlyClosed") {
      const aClosed = statusOf(a).key === "closed" ? 0 : 1;
      const bClosed = statusOf(b).key === "closed" ? 0 : 1;
      return aClosed - bClosed || (aClosed === 0 ? dateValue(b.endDate) - dateValue(a.endDate) : defaultCompare(a, b));
    }
    return defaultCompare(a, b);
  });

  const filterKey = [query, filter, ageGroup, center, activityCategory, disabilityType, audienceType, sort].join("|");
  if (filterKey !== lastProgramFilterKey) { programPage = 1; lastProgramFilterKey = filterKey; }
  const pageSize = programColumnsForViewport() * 2;
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  programPage = Math.min(programPage, totalPages);
  const pagePrograms = visible.slice((programPage - 1) * pageSize, programPage * pageSize);
  document.querySelector("#resultSummary").textContent = visible.length
    ? `검색 결과 ${visible.length}개 프로그램 · ${programPage}/${totalPages} 페이지`
    : "검색 결과 0개 프로그램";

  if (!visible.length) {
    box.innerHTML = '<p class="empty">조건에 맞는 프로그램이 없습니다.</p>';
    renderProgramPagination(0);
    return;
  }

  pagePrograms.forEach((program) => {
    const status = statusOf(program);
    const applicantsCount = count(program.id);
    const unlimited = Number(program.capacity) === 0;
    const full = !unlimited && applicantsCount >= Number(program.capacity);
    const selectionMethod = program.selectionMethod || "first_come";
    const waitCount = unlimited ? 0 : Math.max(0, applicantsCount - Number(program.capacity));
    const countText = selectionMethod === "open" ? `신청 ${applicantsCount}명` : unlimited ? `신청 ${applicantsCount}명 · 제한 없음` : selectionMethod === "lottery" ? `신청 ${applicantsCount}명 · 정원 ${program.capacity}명` : `${applicantsCount}/${program.capacity}명${waitCount ? ` · 대기 ${waitCount}명` : ""}`;
    const applyText = status.key !== "open" ? status.label : selectionMethod === "first_come" && full ? "대기 신청" : "신청하기";
    const selectionBadge = selectionMethod === "open" ? "" : `<span class="selectionBadge ${selectionMethod}">${selectionMethod === "lottery" ? "추첨·배점" : "선착순"}</span>`;
    const detailUrl = safeExternalUrl(program.detailUrl);
    const publicTemplate = program.formEnabled && program.formTemplate?.dataUrl ? program.formTemplate : null;
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.programId = program.id;
    card.innerHTML = `
      <div class="cardTop"><div class="badgeGroup"><span class="badge ${status.key}">${status.label}</span>${selectionBadge}</div><span class="count">${countText}</span></div>
      <div class="programLabels"><p class="centerName"><span aria-hidden="true">●</span> ${esc(program.centerName)}</p><div class="programTagGroup"><span class="categoryTag">${esc(program.activityCategory || "기타")}</span><span class="ageTag">${esc(program.ageGroup)}</span></div></div>
      <h2>${esc(program.title)}</h2>
      <div class="programContentBox"><span>프로그램 내용</span><div tabindex="0" role="region" aria-label="${esc(program.title)} 프로그램 내용, 스크롤하여 전체 내용 보기">${programDescriptionHtml(program.description)}</div></div>
      <dl class="meta">
        <div><dt>모집 기간</dt><dd>${dateText(program.startDate)} - ${dateText(program.endDate)}</dd></div>
        <div><dt>참여 대상</dt><dd>${esc(program.audience)}</dd></div>
        <div><dt>장애 유형</dt><dd>${esc(window.nurimBroadDisabilities(program.disabilityTypes).join(", "))}</dd></div>
        <div><dt>이용료</dt><dd>${esc(program.fee)}</dd></div>
        <div><dt>운영 일정</dt><dd class="scheduleValue">${esc(program.schedule)}</dd></div>
        <div><dt>문의</dt><dd>${esc(program.contactPhone || "기관 연락처 확인 중")}</dd></div>
      </dl>

      <div class="cardActions">
        ${publicTemplate ? `<a class="publicTemplateLink" href="${publicTemplate.dataUrl}" download="${esc(publicTemplate.name || "신청서양식")}" aria-label="${esc(program.title)} 신청서 양식 다운로드">신청서 양식 다운로드 ↓</a>` : ""}
        ${detailUrl ? `<a class="detailLink" href="${esc(detailUrl)}" target="_blank" rel="noopener noreferrer">홈페이지 <span aria-hidden="true">↗</span></a>` : ""}
        ${!detailUrl ? '<span class="detailLink disabled" aria-disabled="true">홍보 공지 준비중</span>' : ""}
        <button class="primary apply" type="button">${applyText}</button>
      </div>`;
    const applyButton = card.querySelector(".apply");
    applyButton.disabled = status.key !== "open";
    applyButton.addEventListener("click", () => openApply(program));
    box.append(card);
  });
  renderProgramPagination(totalPages);
}

const programForm = document.querySelector("#programForm");
let pendingProgramMeta = null;
let currentPromotionImages = [];
let currentPromotionImage = null;
let currentPromotionImagePath = null;
function syncLegacyPromotionImageState() {
  currentPromotionImage = currentPromotionImages[0] || null;
  currentPromotionImagePath = currentPromotionImage?.path || null;
}
programForm.addEventListener("submit", () => {
  pendingProgramMeta = {
    editingId,
    existingIds: programs.map((program) => program.id),
    title: document.querySelector("#programTitle").value.trim(),
    startDate: document.querySelector("#startDate").value,
    endDate: document.querySelector("#endDate").value,
    centerName: document.querySelector("#centerName").value.trim(),
    fee: document.querySelector("#fee").value.trim(),
    detailUrl: document.querySelector("#detailUrl").value.trim(),
    contactPhone: document.querySelector("#contactPhone").value.trim(),
    promotionImages: currentPromotionImages.slice(0, 1),
    promotionImage: currentPromotionImages[0] || null,
    promotionImagePath: currentPromotionImages[0]?.path || null,
    ageGroup: document.querySelector("#programAgeGroup").value === "__custom__" ? document.querySelector("#programAgeGroupCustom").value.trim() : document.querySelector("#programAgeGroup").value
  };
}, true);

programForm.addEventListener("submit", () => {
  if (!pendingProgramMeta) return;
  const savedProgram = pendingProgramMeta.editingId
    ? programs.find((program) => program.id === pendingProgramMeta.editingId && program.title === pendingProgramMeta.title && program.startDate === pendingProgramMeta.startDate && program.endDate === pendingProgramMeta.endDate)
    : programs.find((program) => !pendingProgramMeta.existingIds.includes(program.id));
  if (!savedProgram) {
    pendingProgramMeta = null;
    return;
  }
  const { centerName, fee, detailUrl, contactPhone, promotionImages, promotionImage, promotionImagePath, ageGroup } = pendingProgramMeta;
  programs = programs.map((program) => program.id === savedProgram.id ? { ...program, centerName, fee, detailUrl, contactPhone, promotionImages, promotionImage, promotionImagePath, ageGroup } : program);
  save(keys.programs, programs);
  pendingProgramMeta = null;
  currentPromotionImages = [];
  syncLegacyPromotionImageState();
  document.querySelector("#promotionImageFile").value = "";
  updatePromotionImageInfo();
  refreshCenterFilter();
  renderAll();
});

const originalFillProgram = fillProgram;
fillProgram = function (program) {
  originalFillProgram(program);
  document.querySelector("#centerName").value = program.centerName || "";
  document.querySelector("#fee").value = program.fee || "";
  document.querySelector("#detailUrl").value = program.detailUrl || "";
  document.querySelector("#contactPhone").value = program.contactPhone || "";
  currentPromotionImages = Array.isArray(program.promotionImages) && program.promotionImages.length
    ? program.promotionImages.slice(0, 1)
    : (program.promotionImage ? [{ ...program.promotionImage, path: program.promotionImagePath || program.promotionImage.path || null }] : []);
  syncLegacyPromotionImageState();
  updatePromotionImageInfo();
  const ageSelect = document.querySelector("#programAgeGroup");
  const ageCustom = document.querySelector("#programAgeGroupCustom");
  const knownAge = [...ageSelect.options].some((option) => option.value === program.ageGroup && option.value !== "__custom__");
  ageSelect.value = knownAge ? program.ageGroup : "__custom__";
  ageCustom.value = knownAge ? "" : (program.ageGroup || "");
  ageCustom.classList.toggle("hidden", knownAge);
  ageCustom.required = !knownAge;
};

function refreshCenterFilter() {
  const select = document.querySelector("#centerFilter");
  const selected = select.value;
  const centers = [...new Set(programs.map((program) => program.centerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = '<option value="all">전체 복지관</option>' + centers.map((center) => `<option value="${esc(center)}">${esc(center)}</option>`).join("");
  select.value = centers.includes(selected) ? selected : "all";
}

const renderConsentItemsWithoutAgreeAll = renderConsentItems;
renderConsentItems = function renderConsentItemsWithAgreeAll(program) {
  renderConsentItemsWithoutAgreeAll(program);
  const box = document.querySelector("#consentItems");
  if (!box || !box.children.length) return;
  const control = document.createElement("label");
  control.className = "consentAgreeAll";
  control.innerHTML = `<input id="consentAgreeAll" type="checkbox"><span><strong>개인정보 동의 항목 모두 동의</strong><small>모든 필수 항목을 한 번에 동의합니다.</small></span>`;
  box.prepend(control);
  const checkbox = control.querySelector("input");
  checkbox.addEventListener("change", () => {
    box.querySelectorAll(`input[type="radio"][value="agree"]`).forEach((radio) => { radio.checked = checkbox.checked; });
  });
  box.addEventListener("change", (event) => {
    if (!event.target.matches(`input[type="radio"]`)) return;
    const groups = [...new Set([...box.querySelectorAll(`input[type="radio"]`)].map((radio) => radio.name))];
    checkbox.checked = groups.length > 0 && groups.every((name) => box.querySelector(`input[name="${name}"][value="agree"]`)?.checked);
  });
};

document.querySelector("#programAgeGroup").addEventListener("change", (event) => {
  const custom = document.querySelector("#programAgeGroupCustom");
  const direct = event.target.value === "__custom__";
  custom.classList.toggle("hidden", !direct);
  custom.required = direct;
  if (direct) custom.focus(); else custom.value = "";
});
document.querySelector("#resetProgram").addEventListener("click", () => window.setTimeout(() => {
  const custom = document.querySelector("#programAgeGroupCustom");
  custom.value = "";
  custom.required = false;
  custom.classList.add("hidden");
}, 0));

document.querySelector("#ageGroup").addEventListener("change", renderPrograms);
document.querySelector("#centerFilter").addEventListener("change", renderPrograms);
document.querySelector("#programSort")?.addEventListener("change", renderPrograms);
document.querySelector("#resetFilters").addEventListener("click", () => {
  document.querySelector("#search").value = "";
  document.querySelector("#ageGroup").value = "all";
  document.querySelector("#centerFilter").value = "all";
  if (document.querySelector("#activityCategoryFilter")) document.querySelector("#activityCategoryFilter").value = "all";
  if (document.querySelector("#disabilityFilter")) document.querySelector("#disabilityFilter").value = "all";
  if (document.querySelector("#audienceTypeFilter")) document.querySelector("#audienceTypeFilter").value = "all";
  document.querySelector("#status").value = "all";
  document.querySelector("#programSort").value = "default";
  renderPrograms();
});

refreshCenterFilter();
renderAll();


let programResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(programResizeTimer);
  programResizeTimer = setTimeout(() => renderPrograms(), 150);
});

function updatePromotionImageInfo() {
  const info = document.querySelector("#promotionImageInfo");
  if (!info) return;
  info.innerHTML = "";
  if (!currentPromotionImages.length) {
    info.textContent = "등록된 홍보지가 없습니다.";
    return;
  }
  currentPromotionImages.forEach((image, index) => {
    const item = document.createElement("span");
    item.className = "promotionImageItem";
    const name = document.createElement("span");
    name.textContent = image.name || "홍보지";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "promotionImageRemove";
    remove.setAttribute("aria-label", `${image.name || "홍보지"} 삭제`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      currentPromotionImages.splice(index, 1);
      syncLegacyPromotionImageState();
      updatePromotionImageInfo();
    });
    item.append(name, remove);
    info.append(item);
  });
}
document.querySelector("#addPromotionImages").addEventListener("click", () => {
  document.querySelector("#promotionImageFile").click();
});
document.querySelector("#promotionImageFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const isPromotionFile = file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPromotionFile) return alert("홍보지는 이미지 또는 PDF 파일만 등록할 수 있습니다.");
  if (file.size > 10 * 1024 * 1024) return alert("홍보지는 10MB 이하로 등록해 주세요.");
  currentPromotionImages = [await fileToData(file)];
  syncLegacyPromotionImageState();
  updatePromotionImageInfo();
});
document.querySelector("#removePromotionImage").addEventListener("click", () => {
  currentPromotionImages = [];
  syncLegacyPromotionImageState();
  document.querySelector("#promotionImageFile").value = "";
  updatePromotionImageInfo();
});
document.querySelector("#resetProgram").addEventListener("click", () => {
  currentPromotionImages = [];
  syncLegacyPromotionImageState();
  document.querySelector("#promotionImageFile").value = "";
  updatePromotionImageInfo();
});
updatePromotionImageInfo();
