(() => {
  const config = window.INCHEON_SUPABASE;
  if (!config || !window.supabase?.createClient) {
    console.error("Supabase 연결 모듈을 불러오지 못했습니다.");
    return;
  }

  window.__REMOTE_ADMIN_MODE__ = true;
  const db = window.supabase.createClient(config.url, config.publishableKey);
  let currentUser = null;
  let currentProfile = null;
  let remoteReady = false;
  let applicationsRealtimeChannel = null;
  let realtimeRefreshTimer = null;
  let programsRealtimeChannel = null;
  let programsRefreshTimer = null;
  const publicApplicationCounts = new Map();
  const fallbackGlobalConsentItems = [
    { id: "essential-collection", title: "개인정보 수집·이용 동의(필수)", text: "프로그램 신청과 이용자 확인을 위해 이름, 연락처, 생년월일, 참여자 구분 및 신청내용을 수집·이용합니다. 보유기간 경과 또는 처리 목적 달성 후 지체 없이 파기합니다.", type: "radio", enabled: true, required: true },
    { id: "essential-processing", title: "온라인 신청정보 처리 동의(필수)", text: "온라인 접수와 신청명단 관리를 위해 신청정보가 Supabase 및 기관의 Google Drive에 안전하게 저장·처리됩니다. 동의를 거부할 수 있으나 필수정보 처리에 동의하지 않으면 온라인 신청이 어렵습니다.", type: "radio", enabled: true, required: true }
  ];
  let globalConsentItems = fallbackGlobalConsentItems.map((item) => ({ ...item }));
  let globalConsentVersion = "global-1";

  window.incheonSupabase = db;

  const loginButton = document.querySelector("#login");
  const supabaseLoginButton = loginButton.cloneNode(true);
  loginButton.replaceWith(supabaseLoginButton);
  const usernameInput = document.querySelector("#adminUsername");
  usernameInput.placeholder = "관리자 이메일";
  usernameInput.autocomplete = "email";
  usernameInput.type = "email";
  document.querySelector("#loginBox p").textContent =
    "최고관리자와 복지관 담당자는 등록된 이메일과 비밀번호로 로그인합니다.";

  supabaseLoginButton.addEventListener("click", async () => {
    const email = usernameInput.value.trim();
    const password = document.querySelector("#adminCode").value;
    if (!email || !password) {
      alert("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    supabaseLoginButton.disabled = true;
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await applyAuthenticatedUser(data.user);
    } catch (error) {
      await db.auth.signOut({ scope: "local" });
      saveSession(null);
      alert(error.message === "Invalid login credentials"
        ? "이메일 또는 비밀번호가 맞지 않습니다."
        : error.message);
    } finally {
      supabaseLoginButton.disabled = false;
    }
  });

  [usernameInput, document.querySelector("#adminCode")].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        supabaseLoginButton.click();
      }
    });
  });

  // 온라인 화면에는 Supabase 자료만 표시하되, 이전 시제품 자료는 복구를 위해
  // 브라우저 저장공간에서 삭제하지 않고 그대로 보존합니다.
  const legacyProgramsSnapshot = Array.isArray(programs)
    ? programs.map((program) => ({ ...program }))
    : [];
  programs = [];
  applicants = [];
  try {
    renderAll();
    document.querySelector("#programs").innerHTML =
      '<p class="empty">온라인 프로그램 정보를 불러오고 있습니다.</p>';
  } catch (initialRenderError) {
    console.warn("초기 화면 정리 중 오류가 있었지만 Supabase 로그인은 계속 사용합니다.", initialRenderError);
  }

  const programSearchInput = document.querySelector("#search");
  const clearAutofilledAdminId = () => {
    if (programSearchInput && /@/.test(programSearchInput.value)) {
      programSearchInput.value = "";
      renderPrograms();
    }
  };
  window.addEventListener("pageshow", clearAutofilledAdminId);
  programSearchInput?.addEventListener("focus", clearAutofilledAdminId);

  function remoteProgramToLocal(row) {
    let formTemplate = null;
    let promotionImage = null;
    let promotionImages = [];
    if (Array.isArray(row.promotion_images)) {
      promotionImages = row.promotion_images.slice(0, 1).filter((item) => item?.path).map((item) => {
        const { data } = db.storage.from("program-templates").getPublicUrl(item.path);
        return { name: item.name || "홍보지", dataUrl: data.publicUrl, path: item.path };
      });
    }
    if (!promotionImages.length && row.promotion_image_path) {
      const { data } = db.storage.from("program-templates").getPublicUrl(row.promotion_image_path);
      promotionImages = [{ name: row.promotion_image_name || "홍보지", dataUrl: data.publicUrl, path: row.promotion_image_path }];
    }
    promotionImage = promotionImages[0] || null;
    if (row.template_file_path) {
      const { data } = db.storage.from("program-templates").getPublicUrl(row.template_file_path);
      formTemplate = {
        name: row.template_file_name || "신청서 양식",
        dataUrl: data.publicUrl
      };
    }
    return normalizeProgram({
      id: row.id,
      surveyId: row.survey_id || null,
      publicNumber: row.public_number,
      publicYear: row.public_year,
      publicCenter: row.public_center,
      createdAt: row.created_at || null,
      centerId: row.center_id,
      centerName: row.center_name,
      managerId: row.manager_id || null,
      title: row.title,
      fee: row.fee,
      ageGroup: row.age_group,
      activityCategory: row.activity_category || "기타",
      disabilityTypes: Array.isArray(row.disability_types) && row.disability_types.length ? row.disability_types : ["전체 장애유형"],
      audienceType: row.audience_type || "기타",
      audienceOther: row.audience_other || "",
      audience: row.audience,
      startDate: row.start_date,
      endDate: row.end_date,
      privacyRetentionYears: Number(row.privacy_retention_years || 5),
      selectionMethod: row.selection_method || "first_come",
      hiddenFromPublic: row.hidden_from_public === true,
      schedule: row.schedule,
      capacity: row.capacity,
      description: row.description,
      detailUrl: row.detail_url || "",
      contactPhone: row.contact_phone || "",
      applicationFields: [],
      promotionImagePath: promotionImages[0]?.path || row.promotion_image_path || null,
      promotionImage,
      promotionImages,
      consentEnabled: true,
      consentItems: consentItemsForPeriod_(Number(row.privacy_retention_years || 5), row.center_name),
      formEnabled: row.form_enabled,
      formGuide: row.form_guide || "",
      googleFormUrl: row.google_form_url || "",
      googleFormVerificationEnabled: row.google_form_verification_enabled === true,
      googleFormTokenEntry: row.google_form_token_entry || "",
      formTemplate
    });
  }

  async function loadGlobalConsentSettings() {
    const { data, error } = await db.from("app_settings")
      .select("consent_items, consent_version")
      .eq("id", "global")
      .maybeSingle();
    if (error) {
      console.warn("공통 개인정보 동의 설정을 불러오지 못해 기본 필수 항목을 사용합니다.", error.message);
      return;
    }
    if (Array.isArray(data?.consent_items) && data.consent_items.length) {
      globalConsentItems = data.consent_items.map((item) => ({ ...item, enabled: true, required: true }));
      globalConsentVersion = data.consent_version || globalConsentVersion;
    }
  }

  function consentItemsForPeriod_(retentionYears, centerName) {
    const years = Math.max(1, Number(retentionYears || 5));
    const periodText = `개인정보 수집·이용 및 보유기간: 동의일로부터 ${years}년`;
    const recipient = String(centerName || "신청 프로그램 운영기관");
    return globalConsentItems.map((item, index) => {
      let text = String(item.text || "");
      if (/제\s*3자|3자\s*제공/.test(String(item.title || ""))) {
        text = text
          .replace(/신청 프로그램 운영장애인복지관/g, recipient)
          .replace(/\{\{기관명\}\}|\[기관명\]|\[해당\s*프로그램\s*운영\s*장애인복지관명\]/g, recipient);
      }
      return {
        ...item,
        text: index === 0 ? `${text}\n\n${periodText}` : text,
        enabled: true,
        required: true
      };
    });
  }
  const localApplicationCount = count;
  count = function countApplicationsSafely(programId) {
    if (currentUser) return localApplicationCount(programId);
    return Number(publicApplicationCounts.get(String(programId))?.totalCount || 0);
  };

  async function loadPublicApplicationCounts() {
    const { data, error } = await db.rpc("public_program_application_counts");
    if (error) {
      console.warn("공개 신청 인원 집계를 불러오지 못했습니다.", error.message);
      return false;
    }
    publicApplicationCounts.clear();
    (data || []).forEach((row) => {
      publicApplicationCounts.set(String(row.program_id), {
        totalCount: Number(row.total_count || 0),
        acceptedCount: Number(row.accepted_count || 0),
        waitlistCount: Number(row.waitlist_count || 0),
        pendingSelectionCount: Number(row.pending_selection_count || 0)
      });
    });
    return true;
  }

  async function loadPublicPrograms() {
    await loadGlobalConsentSettings();
    let { data, error } = await db
      .from("programs")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Supabase 프로그램을 불러오지 못했습니다.", error.message);
      remoteReady = false;
      programs = [];
      renderAll();
      document.querySelector("#programs").innerHTML =
        '<p class="empty">프로그램 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
      return;
    }
    remoteReady = true;
    programs = (data || []).map(remoteProgramToLocal);
    await loadPublicApplicationCounts();
    applySearchConfig();
    renderAll();
  }

  function startProgramsRealtime() {
    if (programsRealtimeChannel) return;
    programsRealtimeChannel = db.channel("public-programs-live")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "programs"
      }, () => {
        clearTimeout(programsRefreshTimer);
        programsRefreshTimer = setTimeout(() => loadPublicPrograms(), 150);
      })
      .subscribe();
  }

  async function getProfile(userId) {
    const { data, error } = await db
      .from("profiles")
      .select("id, display_name, email, role, center_id, drive_folder_url, centers(name)")
      .eq("id", userId)
      .single();
    if (error) throw new Error("관리자 권한 정보를 확인할 수 없습니다.");
    return data;
  }

  window.__applyAuthenticatedUser = applyAuthenticatedUser;

  async function signedApplicationUrl(path) {
    if (!path) return "";
    const { data } = await db.storage
      .from("application-files")
      .createSignedUrl(path, 3600);
    return data?.signedUrl || "";
  }

  async function loadApplications() {
    if (!currentUser) return;
    const { data, error } = await db
      .from("applications")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error("신청내역을 불러오지 못했습니다.");
    applicants = await Promise.all((data || []).map(async (row) => {
      const downloadUrl = await signedApplicationUrl(row.uploaded_file_path);
      return {
        id: row.id,
        programId: row.program_id,
        surveyResponse: row.survey_response === true,
        name: row.applicant_name,
        phone: row.phone,
        birth: row.birth_date,
        type: row.participant_type,
        note: row.note || "",
        privacyAgree: row.privacy_agree,
        consentResponses: row.consent_responses || {},
        baseConsentSnapshot: row.base_consent_snapshot || [],
        applicationResponses: {},
        consentVersion: row.consent_version || "",
        signature: row.signature || "",
        guardianRequired: row.guardian_required === true,
        guardianName: row.guardian_name || "",
        guardianSignature: row.guardian_signature || "",
        guardianAgreedAt: row.guardian_agreed_at || "",
        guardianConsentText: row.guardian_consent_text || "",
        privacyAgreedAt: row.privacy_agreed_at || "",
        googleFormConfirmedAt: row.google_form_confirmed_at || "",
        createdAt: row.created_at,
        applicationStatus: row.application_status || "accepted",
        lifecycleStatus: row.lifecycle_status || "received",
        modifiedAt: row.modified_at || "",
        cancelledAt: row.cancelled_at || "",
        deletedAt: row.deleted_at || "",
        lastActionActor: row.last_action_actor || "applicant",
        lastActionAt: row.last_action_at || row.created_at,
        queueNumber: Number(row.queue_number || 0) || null,
        driveSyncStatus: row.drive_sync_status || "pending",
        driveError: row.drive_error || "",
        driveFolderUrl: row.drive_folder_url || "",
        driveRosterUrl: row.drive_roster_sheet_url || "",
        uploadedForm: (row.uploaded_file_path || row.drive_uploaded_file_url) ? {
          name: row.uploaded_file_name || "제출 신청서",
          type: row.uploaded_file_type || "application/octet-stream",
          size: row.uploaded_file_size || 0,
          dataUrl: row.drive_uploaded_file_url || downloadUrl,
          storagePath: row.uploaded_file_path
        } : null
      };
    }));
    localStorage.setItem(keys.applicants, JSON.stringify(applicants));
  }

  async function applyAuthenticatedUser(user) {
    currentUser = user;
    currentProfile = await getProfile(user.id);
    const center = currentProfile.centers;
    saveSession({
      role: currentProfile.role,
      accountId: currentProfile.id,
      name: currentProfile.display_name,
      centerId: currentProfile.center_id,
      centerName: center?.name || ""
    });

    // 인증과 권한 확인이 끝나면 관리자 화면을 먼저 엽니다.
    // 프로그램·신청자 데이터 일부가 늦거나 실패해도 로그인을 막지 않습니다.
    applyAdminAccess();
    applyRemoteDriveLink();

    try {
      await loadPublicPrograms();
      if (currentProfile.role === "super" && !programs.some((program) => program.centerId)) {
        await syncAllPrograms();
        await loadPublicPrograms();
      }
      await loadApplications();
      renderPrograms();
      applyAdminAccess();
      applyRemoteDriveLink();
      if (currentProfile.role === "super") await renderManagerSettings();
      renderGlobalConsentEditor();
      startApplicationsRealtime();
    } catch (dataError) {
      console.error("관리자 데이터 일부를 불러오지 못했습니다.", dataError);
      applyAdminAccess();
      alert(`로그인은 완료됐지만 일부 관리자 데이터를 불러오지 못했습니다: ${dataError?.message || dataError}`);
    }
  }

  function stopApplicationsRealtime() {
    if (applicationsRealtimeChannel) {
      db.removeChannel(applicationsRealtimeChannel);
      applicationsRealtimeChannel = null;
    }
    if (realtimeRefreshTimer) {
      clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = null;
    }
  }

  function startApplicationsRealtime() {
    stopApplicationsRealtime();
    if (!currentUser || !currentProfile) return;
    const changeConfig = {
      event: "*",
      schema: "public",
      table: "applications"
    };
    if (currentProfile.role === "manager" && currentProfile.center_id) {
      changeConfig.filter = `center_id=eq.${currentProfile.center_id}`;
    }
    applicationsRealtimeChannel = db
      .channel(`applications-admin-${currentUser.id}`)
      .on("postgres_changes", changeConfig, () => {
        clearTimeout(realtimeRefreshTimer);
        realtimeRefreshTimer = setTimeout(async () => {
          try {
            await loadApplications();
            renderAll();
          } catch (error) {
            console.warn("실시간 신청내역 갱신에 실패했습니다.", error);
          }
        }, 250);
      })
      .subscribe();
  }

  function applyRemoteDriveLink() {
    const link = document.querySelector("#assignedDriveLink");
    const driveUrl = currentProfile?.drive_folder_url || "";
    if (!link || currentProfile?.role === "super") return;
    link.classList.toggle("hidden", !driveUrl);
    if (driveUrl) link.href = driveUrl;
  }

  async function findOrCreateCenter(centerName) {
    const { data: existing } = await db
      .from("centers")
      .select("id, name")
      .eq("name", centerName)
      .maybeSingle();
    if (existing) return existing.id;
    if (currentProfile?.role !== "super") {
      if (currentProfile?.center_id) return currentProfile.center_id;
      throw new Error("담당 복지관이 지정되지 않았습니다.");
    }
    const { data, error } = await db
      .from("centers")
      .insert({ name: centerName })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function uploadTemplate(program) {
    if (!program.formTemplate?.dataUrl) return { path: null, name: null };
    if (!program.formTemplate.dataUrl.startsWith("data:")) {
      return {
        path: program.templateFilePath || null,
        name: program.formTemplate.name || null
      };
    }
    const response = await fetch(program.formTemplate.dataUrl);
    const blob = await response.blob();
    const extension = (program.formTemplate.name || "").split(".").pop().replace(/[^a-zA-Z0-9]/g, "");
    const path = `${program.id}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
    const { error } = await db.storage
      .from("program-templates")
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    return { path, name: program.formTemplate.name || "신청서 양식" };
  }

  async function uploadPromotionImages(program) {
    const source = Array.isArray(program.promotionImages) && program.promotionImages.length
      ? program.promotionImages.slice(0, 1)
      : (program.promotionImage ? [{ ...program.promotionImage, path: program.promotionImagePath || program.promotionImage.path || null }] : []);
    const uploaded = [];
    for (const image of source) {
      if (!image?.dataUrl) continue;
      if (!image.dataUrl.startsWith("data:")) {
        if (image.path) uploaded.push({ path: image.path, name: image.name || "홍보지" });
        continue;
      }
      const response = await fetch(image.dataUrl);
      const blob = await response.blob();
      const extension = (image.name || "").split(".").pop().replace(/[^a-zA-Z0-9]/g, "");
      const path = `${program.id}/promotion-${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
      const { error } = await db.storage.from("program-templates").upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      uploaded.push({ path, name: image.name || "홍보지" });
    }
    return uploaded;
  }

  async function saveGoogleFormVerificationConfig(programId, config) {
    const { data, error } = await db.functions.invoke("swift-processor", {
      body: {
        action: "save-google-form-config",
        programId,
        enabled: Boolean(config?.enabled),
        tokenEntry: String(config?.tokenEntry || ""),
        formFileId: String(config?.formFileId || ""),
        spreadsheetId: String(config?.spreadsheetId || ""),
        sheetName: String(config?.sheetName || "설문지 응답 1"),
        tokenColumnName: String(config?.tokenColumnName || "설문 확인번호")
      }
    });
    if (error) throw new Error(readableServerError(error));
    if (!data?.ok) throw new Error(data?.error || "Google Form 제출 확인 설정을 저장하지 못했습니다.");
  }

  window.createGoogleFormConfig = async function createGoogleFormConfig(programTitle) {
    if (!currentUser || !currentProfile || !["manager", "super"].includes(currentProfile.role)) throw new Error("관리자 로그인이 필요합니다.");
    const { data, error } = await db.functions.invoke("swift-processor", {
      body: { action: "create-google-form-config", programTitle }
    });
    if (error) {
      let detail = "";
      try { detail = String((await error.context?.clone?.().json())?.error || ""); } catch {}
      if (/^\s*</.test(detail)) detail = "Google Apps Script 연결 권한을 확인해 주세요.";
      throw new Error(detail || readableServerError(error));
    }
    if (!data?.ok) throw new Error(data?.error || "Google 신청서을 자동 생성하지 못했습니다.");
    return data;
  };

  window.autoDetectGoogleFormConfig = async function autoDetectGoogleFormConfig(formUrl, spreadsheetUrl) {
    if (!currentUser || !currentProfile || !["manager", "super"].includes(currentProfile.role)) throw new Error("관리자 로그인이 필요합니다.");
    const { data, error } = await db.functions.invoke("swift-processor", {
      body: { action: "auto-detect-google-form-config", formUrl, spreadsheetUrl }
    });
    if (error) {
      let detail = "";
      try { detail = String((await error.context?.clone?.().json())?.error || ""); } catch {}
      throw new Error(detail || readableServerError(error));
    }
    if (!data?.ok) throw new Error(data?.error || "연결정보를 자동으로 찾지 못했습니다.");
    return data;
  };

  window.prepareGoogleFormRelay = async function prepareGoogleFormRelay(programId) {
    if (!currentUser || !programId) throw new Error("프로그램을 먼저 저장해 주세요.");
    const { data, error } = await db.functions.invoke("swift-processor", { body: { action: "prepare-google-form-relay", programId } });
    if (error) throw new Error(readableServerError(error));
    if (!data?.ok) throw new Error(data?.error || "기관 Google Form 연결을 준비하지 못했습니다.");
    return data;
  };

  window.loadGoogleFormVerificationConfig = async function loadGoogleFormVerificationConfig(programId) {
    if (!currentUser || !programId) return null;
    const { data, error } = await db.functions.invoke("swift-processor", {
      body: { action: "get-google-form-config", programId }
    });
    if (error) throw new Error(readableServerError(error));
    return data?.config || null;
  };

  window.verifyGoogleFormSurveyToken = async function verifyGoogleFormSurveyToken(programId, token) {
    const { data, error } = await db.functions.invoke("swift-processor", {
      body: { action: "verify-survey-token", programId, token }
    });
    if (error) {
      let detail = "";
      try { detail = String((await error.context?.clone?.().json())?.error || ""); } catch {}
      throw new Error(detail || readableServerError(error));
    }
    return data || { verified: false };
  };

  async function upsertProgram(program) {
    const centerId = currentProfile?.role === "manager"
      ? currentProfile.center_id
      : await findOrCreateCenter(program.centerName);
    const template = await uploadTemplate(program);
    const promotions = await uploadPromotionImages(program);
    const promotion = promotions[0] || { path: null, name: null };
    const programRow = {
      id: program.id,
      survey_id: program.surveyId || null,
      center_id: centerId,
      center_name: program.centerName,
      title: program.title,
      fee: program.fee || "무료",
      age_group: program.ageGroup || "성인",
      activity_category: program.activityCategory || "기타",
      disability_types: Array.isArray(program.disabilityTypes) && program.disabilityTypes.length ? program.disabilityTypes : ["전체 장애유형"],
      audience_type: program.audienceType || "기타",
      audience_other: program.audienceType === "기타" ? (program.audienceOther || program.audience || null) : null,
      audience: program.audience,
      start_date: program.startDate,
      end_date: program.endDate,
      privacy_retention_years: Number(program.privacyRetentionYears || 5),
      selection_method: program.selectionMethod || "first_come",
      hidden_from_public: program.hiddenFromPublic === true,
      schedule: program.schedule,
      capacity: Number(program.capacity),
      description: program.description,
      contact_phone: program.contactPhone || null,
      application_fields: [],
      detail_url: program.detailUrl?.trim() || null,
      promotion_image_path: promotion.path,
      promotion_image_name: promotion.name,
      promotion_images: promotions,
      consent_enabled: true,
      consent_items: consentItemsForPeriod_(program.privacyRetentionYears, program.centerName),
      form_enabled: program.formEnabled === true,
      form_guide: program.formGuide || null,
      google_form_url: program.googleFormUrl?.trim() || null,
      google_form_verification_enabled: program.googleFormVerificationEnabled === true,
      google_form_token_entry: program.googleFormTokenEntry?.trim() || null,
      template_file_path: template.path,
      template_file_name: template.name,
      published: true,
      updated_at: new Date().toISOString()
    };

    if (currentProfile?.role === "manager") programRow.manager_id = currentUser.id;
    else if (program.surveyId) programRow.manager_id = program.managerId || currentUser.id;
    const { error } = await db.from("programs").upsert(programRow);
    if (error) throw error;
  }

  async function syncAllPrograms() {
    const targets = currentProfile?.role === "manager"
      ? programs.filter((program) => program.managerId === currentUser.id)
      : programs;
    for (const program of targets) await upsertProgram(program);
  }

  async function loadRemoteCenters() {
    const { data, error } = await db.from("centers")
      .select("id, name")
      .eq("active", true)
      .order("name");
    if (error || !data) return [];
    searchConfig.centers = data.map((center) => center.name);
    save(authKeys.config, searchConfig);
    applySearchConfig();
    return data;
  }

  function renderGlobalConsentEditor() {
    document.querySelector(".adminConsentBox")?.classList.add("hidden");
    document.querySelector("#centerConsentTool")?.remove();
    document.querySelector("#centerConsentOverview")?.remove();
    if (currentProfile?.role !== "super") return;
    let section = document.querySelector("#globalConsentEditor");
    if (!section) {
      section = document.createElement("details");
      section.id = "globalConsentEditor";
      section.className = "adminForm globalConsentEditor";
      section.innerHTML = `
        <summary class="consentToggle">전체 공통 개인정보 동의 항목<small>모든 기관과 프로그램에 공통 적용 · 필요할 때 펼쳐 수정</small></summary><div class="consentBody">
        <div class="globalConsentItems"></div>
        <div class="formActions"><button class="addGlobalConsent" type="button">필수 항목 추가</button><button class="primary saveGlobalConsent" type="button">동의 항목 저장</button></div></div>`;
      document.querySelector("#superManage").append(section);
      section.querySelector(".addGlobalConsent").addEventListener("click", () => {
        globalConsentItems.push({ id: `consent-${crypto.randomUUID()}`, title: "", text: "", type: "radio", enabled: true, required: true });
        renderGlobalConsentEditor();
      });
      section.querySelector(".saveGlobalConsent").addEventListener("click", saveGlobalConsentSettings);
    }
    const list = section.querySelector(".globalConsentItems");
    list.replaceChildren();
    globalConsentItems.forEach((item, index) => {
      const row = document.createElement("article");
      row.className = "globalConsentItem";
      row.innerHTML = `<label>항목명(필수)<input class="globalConsentTitle" value="${esc(item.title || "")}" required></label><label>안내 내용<textarea class="globalConsentText" required>${esc(item.text || "")}</textarea></label><button class="danger deleteGlobalConsent" type="button">항목 삭제</button>`;
      row.querySelector(".globalConsentTitle").addEventListener("input", (event) => { item.title = event.target.value; });
      row.querySelector(".globalConsentText").addEventListener("input", (event) => { item.text = event.target.value; });
      row.querySelector(".deleteGlobalConsent").addEventListener("click", () => {
        if (globalConsentItems.length <= 1) return alert("필수 동의 항목은 최소 1개가 필요합니다.");
        globalConsentItems.splice(index, 1);
        renderGlobalConsentEditor();
      });
      list.append(row);
    });
  }

  async function saveGlobalConsentSettings() {
    if (currentProfile?.role !== "super") return;
    const items = globalConsentItems.map((item) => ({ ...item, title: item.title.trim(), text: item.text.trim(), type: "radio", enabled: true, required: true }));
    if (!items.length || items.some((item) => !item.title || !item.text)) return alert("모든 필수 항목의 제목과 안내 내용을 입력해 주세요.");
    const version = `global-${Date.now()}`;
    const { error } = await db.from("app_settings").upsert({ id: "global", consent_items: items, consent_version: version, updated_at: new Date().toISOString() });
    if (error) return alert(`동의 항목을 저장하지 못했습니다: ${error.message}`);
    globalConsentItems = items;
    globalConsentVersion = version;
    await loadPublicPrograms();
    alert("전체 공통 개인정보 동의 항목을 저장했습니다.");
  }
  async function syncCenterCatalog() {
    if (currentProfile?.role !== "super") return;
    const names = [...new Set(document.querySelector("#configCenters").value
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean))];
    const { data: existing, error } = await db.from("centers").select("id, name, active");
    if (error) throw error;
    for (const center of existing || []) {
      await db.from("centers").update({ active: names.includes(center.name) }).eq("id", center.id);
    }
    for (const name of names) {
      if (!(existing || []).some((center) => center.name === name)) {
        const { error: insertError } = await db.from("centers").insert({ name, active: true });
        if (insertError) throw insertError;
      }
    }
    await loadRemoteCenters();
  }

  document.querySelector("#searchConfigForm").addEventListener("submit", () => {
    window.setTimeout(async () => {
      try {
        await syncCenterCatalog();
        await renderManagerSettings();
      } catch (error) {
        alert(`복지관 목록을 온라인에 반영하지 못했습니다: ${error.message}`);
      }
    }, 0);
  });

  const localManagerForm = document.querySelector("#managerForm");
  const supabaseManagerForm = localManagerForm.cloneNode(true);
  localManagerForm.replaceWith(supabaseManagerForm);
  const managerEmailInput = document.querySelector("#managerUsername");
  managerEmailInput.type = "email";
  managerEmailInput.autocomplete = "email";
  managerEmailInput.placeholder = "담당자 이메일";
  managerEmailInput.closest("label").childNodes[0].textContent = "담당자 이메일 ";
  document.querySelector("#managerPassword").minLength = 8;

  function readableServerError(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    if (typeof value === "object") {
      return readableServerError(value.message)
        || readableServerError(value.error_description)
        || readableServerError(value.details)
        || readableServerError(value.error)
        || JSON.stringify(value);
    }
    return String(value);
  }

  async function invokeAdmin(action, payload = {}) {
    const { data, error } = await db.functions.invoke("swift-processor", {
      body: { action, ...payload }
    });
    if (error) {
      let serverMessage = "";
      const response = error.context;
      if (response && typeof response.clone === "function") {
        try {
          const result = await response.clone().json();
          serverMessage = readableServerError(result?.error || result?.message || result);
        } catch {
          try {
            serverMessage = await response.clone().text();
          } catch {
            // 응답 본문을 읽을 수 없으면 Supabase 기본 오류를 사용합니다.
          }
        }
      }
      throw new Error(serverMessage || readableServerError(error));
    }
    if (data?.error) throw new Error(readableServerError(data.error));
    return data;
  }

  let programOwnershipAuditData = null;
  let programOwnershipCenterFilter = "all";
  let managerDirectoryCenterFilter = "all";

  function renderProgramOwnershipTool() {
    if (currentProfile?.role !== "super") return;
    let box = document.querySelector("#programOwnershipTool");
    if (!box) {
      box = document.createElement("section"); box.id = "programOwnershipTool"; box.className = "adminForm programOwnershipTool";
      document.querySelector("#managerList").before(box);
    }
    const managers = programOwnershipAuditData?.managers || [];
    const ownerPrograms = programOwnershipAuditData?.programs || [];
    const centers = [...new Set(ownerPrograms.map((program) => program.centerName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    if (programOwnershipCenterFilter !== "all" && !centers.includes(programOwnershipCenterFilter)) programOwnershipCenterFilter = "all";
    const visiblePrograms = ownerPrograms.filter((program) => programOwnershipCenterFilter === "all" || program.centerName === programOwnershipCenterFilter);
    box.innerHTML = `<div class="ownershipHeader"><div><h3>프로그램 담당자 연결 점검</h3><p class="sectionHelp">기관별 연결 상태와 담당자 정보를 확인합니다.</p></div><div class="ownershipActions"><button id="auditProgramOwners" type="button">연결 점검</button>${programOwnershipAuditData ? '<button id="resetProgramOwnerAudit" type="button">점검 결과 초기화</button>' : ""}</div></div>${programOwnershipAuditData ? `<div class="ownershipFilterRow"><label>복지관<select id="programOwnerCenterFilter"><option value="all">전체 복지관</option>${centers.map((center) => `<option value="${esc(center)}">${esc(center)}</option>`).join("")}</select></label><span>${visiblePrograms.length}개 프로그램</span></div>` : ""}<div id="programOwnerAuditResult">${programOwnershipAuditData ? "" : '<p class="empty">아직 점검하지 않았습니다.</p>'}</div>`;
    box.querySelector("#auditProgramOwners").addEventListener("click", loadProgramOwnershipAudit);
    box.querySelector("#resetProgramOwnerAudit")?.addEventListener("click", () => { programOwnershipAuditData = null; programOwnershipCenterFilter = "all"; renderProgramOwnershipTool(); });
    const centerFilter = box.querySelector("#programOwnerCenterFilter");
    if (centerFilter) {
      centerFilter.value = programOwnershipCenterFilter;
      centerFilter.addEventListener("change", (event) => { programOwnershipCenterFilter = event.target.value; renderProgramOwnershipTool(); });
    }
    if (!programOwnershipAuditData) return;
    const resultBox = box.querySelector("#programOwnerAuditResult");
    if (!ownerPrograms.length) { resultBox.innerHTML = '<p class="empty">등록된 프로그램이 없습니다.</p>'; return; }
    if (!visiblePrograms.length) { resultBox.innerHTML = '<p class="empty">선택한 기관에 등록된 프로그램이 없습니다.</p>'; return; }
    resultBox.innerHTML = visiblePrograms.map((program) => {
      const current = managers.find((manager) => manager.id === program.currentManagerId);
      const suggested = managers.find((manager) => manager.id === program.suggestedManagerId);
      const mismatch = current && suggested && current.id !== suggested.id;
      const selected = mismatch ? suggested.id : (program.currentManagerId || program.suggestedManagerId || "");
      const state = mismatch ? `확인 필요: 현재 ${current.displayName} / Drive 추천 ${suggested.displayName}` : current ? `연결됨: ${current.displayName}` : suggested ? `Drive 추천: ${suggested.displayName}` : program.confidence === "conflict" ? "여러 폴더가 확인되어 직접 선택 필요" : "담당자 직접 선택 필요";
      const centerManagers = managers.filter((manager) => !manager.centerName || manager.centerName === program.centerName);
      const selectableManagers = centerManagers.length ? centerManagers : managers;
      return `<article class="programOwnerRow"><div><strong>${esc(program.title)}</strong><p>${esc(program.centerName || "기관 미지정")} · ${esc(state)}</p></div><select data-owner-program="${esc(program.id)}"><option value="">담당자 선택</option>${selectableManagers.map((manager) => `<option value="${manager.id}" ${manager.id === selected ? "selected" : ""}>${esc(manager.displayName)}${manager.hasDrive ? " · Drive 연결" : ""}</option>`).join("")}</select><button type="button" data-save-owner="${esc(program.id)}">담당자 확정</button></article>`;
    }).join("");
    resultBox.querySelectorAll("[data-save-owner]").forEach((saveButton) => saveButton.addEventListener("click", async () => {
      const programId = saveButton.dataset.saveOwner; const managerId = resultBox.querySelector(`[data-owner-program="${CSS.escape(programId)}"]`).value;
      if (!managerId) return alert("담당자를 선택해 주세요.");
      if (!confirm("선택한 담당자에게 프로그램과 기존 신청내역의 기관을 연결할까요?")) return;
      saveButton.disabled = true;
      try { const assigned = await invokeAdmin("assign-program-owner", { programId, managerId }); await loadPublicPrograms(); await loadProgramOwnershipAudit(); alert(assigned?.shareWarning ? `프로그램 담당자를 변경했습니다. ${assigned.shareWarning}` : "프로그램 담당자와 Google 신청서 공유 권한을 함께 변경했습니다."); }
      catch (error) { alert(error.message); } finally { saveButton.disabled = false; }
    }));
  }
  async function loadProgramOwnershipAudit() {
    const resultBox = document.querySelector("#programOwnerAuditResult"); const button = document.querySelector("#auditProgramOwners");
    button.disabled = true; resultBox.innerHTML = "<p>Google Drive 폴더와 프로그램을 비교하고 있습니다.</p>";
    try { programOwnershipAuditData = await invokeAdmin("audit-program-owners"); renderProgramOwnershipTool(); }
    catch (error) { resultBox.innerHTML = `<p class="empty">${esc(error.message)}</p>`; button.disabled = false; }
  }  async function renderManagerSettings() {
    if (currentProfile?.role !== "super") return;
    const centers = await loadRemoteCenters();
    renderGlobalConsentEditor();
    renderProgramOwnershipTool();
    const centerSelect = document.querySelector("#managerCenter");
    centerSelect.innerHTML = centers
      .map((center) => `<option value="${center.id}">${esc(center.name)}</option>`)
      .join("");
    const list = document.querySelector("#managerList");
    list.innerHTML = "<p>담당자 계정을 불러오고 있습니다.</p>";
    try {
      const result = await invokeAdmin("list-managers");
      const managers = result.managers || [];
      const visibleManagers = managers;
      list.replaceChildren();
      visibleManagers.forEach((manager) => {
        const row = document.createElement("details");
        row.className = "row accountRow";
        row.innerHTML = `
          <summary class="managerSummary"><span><strong>${esc(manager.displayName)}</strong><small>${esc(manager.centerName || "복지관 미지정")}</small></span><span class="managerSummaryAction">상세보기</span></summary>
          <div class="accountInfo">
            <div class="managerCardHeader"><div><strong>담당자 상세 설정</strong><p>${esc(manager.email)}</p></div><button class="danger deleteManager" type="button">담당자 삭제</button></div>
            <div class="managerSettingsGrid">
              <div class="managerSetting"><label>담당 기관<select class="managerCenterEdit">${centers.map((center) => `<option value="${center.id}" ${center.id === manager.centerId ? "selected" : ""}>${esc(center.name)}</option>`).join("")}</select></label><button class="saveManagerCenter" type="button">담당 기관 변경</button></div>
              <div class="managerSetting"><label>로그인 이메일<input class="managerEmailEdit" type="email" value="${esc(manager.email || "")}" autocomplete="off"></label><button class="saveManagerEmail" type="button">이메일 변경</button></div>
              <div class="managerSetting"><label>Google Drive 폴더<input class="managerDriveEdit" type="url" value="${esc(manager.driveFolderUrl || "")}" placeholder="https://drive.google.com/drive/folders/..."></label><button class="saveManagerDrive" type="button">Drive 저장</button></div>
              <div class="managerSetting"><label>새 비밀번호<input class="managerNewPassword" type="password" minlength="8" placeholder="8자 이상"></label><button class="resetManagerPassword" type="button">비밀번호 변경</button></div>
            </div>
          </div>`;
        row.querySelector(".saveManagerCenter").addEventListener("click", async () => {
          const centerId = row.querySelector(".managerCenterEdit").value;
          const centerName = centers.find((center) => center.id === centerId)?.name || "선택 기관";
          if (centerId === manager.centerId) return alert("현재 담당 기관과 같습니다.");
          if (!confirm(`${manager.displayName} 담당자를 ${centerName}(으)로 변경할까요?\n담당자가 등록한 기존 프로그램과 신청내역의 기관도 함께 변경됩니다.`)) return;
          try {
            const result = await invokeAdmin("update-manager", { userId: manager.id, centerId });
            await loadPublicPrograms();
            await renderManagerSettings();
            alert(`담당 기관을 변경하고 기존 프로그램 ${result.movedPrograms || 0}개를 함께 이동했습니다.`);
          } catch (error) {
            alert(error.message);
          }
        });
        row.querySelector(".saveManagerEmail").addEventListener("click", async () => {
          const email = row.querySelector(".managerEmailEdit").value.trim().toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(email)) return alert("올바른 이메일 주소를 입력해 주세요.");
          if (email === String(manager.email || "").toLowerCase()) return alert("현재 로그인 이메일과 같습니다.");
          if (!confirm(`${manager.displayName} 담당자의 로그인 이메일을 ${email}(으)로 변경할까요?\n변경 후에는 새 이메일로 로그인해야 합니다.`)) return;
          try {
            const result = await invokeAdmin("update-manager", { userId: manager.id, email });
            await renderManagerSettings();
            alert(result?.shareWarning ? `로그인 이메일을 변경했습니다. ${result.shareWarning}` : "담당자 로그인 이메일과 Google 신청서 공유 권한을 함께 변경했습니다.");
          } catch (error) {
            alert(error.message);
          }
        });
        row.querySelector(".saveManagerDrive").addEventListener("click", async () => {
          const driveUrl = validDriveFolderUrl(row.querySelector(".managerDriveEdit").value.trim());
          if (!driveUrl) {
            alert("올바른 Google Drive 폴더 주소를 입력해 주세요.");
            return;
          }
          try {
            await invokeAdmin("update-manager", {
              userId: manager.id,
              driveFolderUrl: driveUrl
            });
            alert("담당자 Google Drive 폴더를 저장했습니다.");
          } catch (error) {
            alert(error.message);
          }
        });
        row.querySelector(".resetManagerPassword").addEventListener("click", async () => {
          const password = row.querySelector(".managerNewPassword").value;
          if (password.length < 8) {
            alert("새 비밀번호를 8자 이상 입력해 주세요.");
            return;
          }
          if (!confirm(`${manager.displayName} 담당자의 비밀번호를 변경할까요?`)) return;
          try {
            await invokeAdmin("update-manager", { userId: manager.id, password });
            row.querySelector(".managerNewPassword").value = "";
            alert("담당자 비밀번호를 변경했습니다.");
          } catch (error) {
            alert(error.message);
          }
        });
        row.querySelector(".deleteManager").addEventListener("click", async () => {
          if (!confirm(`${manager.displayName} 담당자 계정을 삭제할까요?`)) return;
          try {
            await invokeAdmin("delete-manager", { userId: manager.id });
            await renderManagerSettings();
          } catch (error) {
            alert(error.message);
          }
        });
        list.append(row);
      });
      window.nurimManagerDirectory.mount(list, managers, centers);
    } catch (error) {
      list.innerHTML = `<p class="empty">${esc(error.message)}</p>`;
    }
  }

  supabaseManagerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const driveFolderUrl = validDriveFolderUrl(document.querySelector("#managerDriveUrl").value.trim());
    if (!driveFolderUrl) {
      alert("올바른 Google Drive 폴더 주소를 입력해 주세요.");
      return;
    }
    try {
      await invokeAdmin("create-manager", {
        displayName: document.querySelector("#managerName").value.trim(),
        email: managerEmailInput.value.trim(),
        password: document.querySelector("#managerPassword").value,
        centerId: document.querySelector("#managerCenter").value,
        driveFolderUrl
      });
      event.target.reset();
      await renderManagerSettings();
      alert("복지관 담당자 계정을 만들었습니다.");
    } catch (error) {
      alert(error.message);
    }
  });

  const logoutButton = document.querySelector("#adminLogout");
  const supabaseLogoutButton = logoutButton.cloneNode(true);
  logoutButton.replaceWith(supabaseLogoutButton);
  supabaseLogoutButton.addEventListener("click", async () => {
    stopApplicationsRealtime();
    await db.auth.signOut({ scope: "local" });
    currentUser = null;
    currentProfile = null;
    saveSession(null);
    clearProtectedAdminContent();
    document.querySelector("#adminPanel").classList.add("hidden");
    document.querySelector("#loginBox").classList.remove("hidden");
    usernameInput.value = "";
    document.querySelector("#adminCode").value = "";
  });

  const passwordForm = document.querySelector("#superPasswordForm");
  const supabasePasswordForm = passwordForm.cloneNode(true);
  passwordForm.replaceWith(supabasePasswordForm);
  supabasePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentProfile?.role !== "super" || !currentUser) return;
    const currentPassword = document.querySelector("#currentSuperPassword").value;
    const newPassword = document.querySelector("#newSuperPassword").value;
    const confirmPassword = document.querySelector("#confirmSuperPassword").value;
    if (newPassword.length < 8) {
      alert("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    const { error: loginError } = await db.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword
    });
    if (loginError) {
      alert("현재 비밀번호가 맞지 않습니다.");
      return;
    }
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) {
      alert(error.message);
      return;
    }
    event.target.reset();
    alert("최고관리자 비밀번호를 변경했습니다.");
  });

  let applicationSubmitting = false;

  function setApplicationSubmitting_(submitting) {
    applicationSubmitting = submitting;
    [document.querySelector("#goConsent"), document.querySelector("#applySubmitButton")].filter(Boolean).forEach((button) => {
      if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
      button.disabled = submitting;
      button.setAttribute("aria-busy", submitting ? "true" : "false");
      button.textContent = submitting ? "신청 처리 중입니다…" : button.dataset.defaultText;
    });
  }

  function showApplicationSuccess_(message) {
    const dialog = document.querySelector("#applicationSuccessDialog");
    document.querySelector("#applicationSuccessMessage").textContent = message;
    if (!dialog.open) dialog.showModal();
    window.setTimeout(() => document.querySelector("#applicationSuccessClose")?.focus(), 0);
  }

  document.querySelector("#applicationSuccessClose")?.addEventListener("click", () => {
    document.querySelector("#applicationSuccessDialog")?.close();
  });

  const originalSubmitApplication = submitApplication;
  submitApplication = async function submitApplicationToSupabase() {
    if (!remoteReady) {
      await loadPublicPrograms();
    }
    const program = activeProgram || programs.find(
      (item) => item.id === document.querySelector("#applyProgramId").value
    );
    if (!program?.centerId) {
      alert("온라인 프로그램 정보가 아직 준비되지 않았습니다. 관리자에게 문의해 주세요.");
      return;
    }
    if (!window.NurimGuardian?.validate()) return;
    const guardian = window.NurimGuardian.collect();
    const useConsent = program.consentEnabled && activeConsentItems(program).length > 0;
    let consentResponses = {};
    let signature = "";
    let uploadFile = null;
    if (program.formEnabled) {
      if (!program.formTemplate?.dataUrl) {
        alert("관리자가 신청서 양식 파일을 먼저 등록해야 신청할 수 있습니다.");
        return;
      }
      const selectedFiles = [...document.querySelector("#applicantFile").files];
      if (!selectedFiles.length) {
        alert("다운로드한 양식을 작성한 뒤 신청서 파일을 업로드해 주세요.");
        return;
      }
      try {
        uploadFile = await window.prepareApplicationUploadFiles(selectedFiles);
      } catch (error) {
        alert(error?.message || "신청서 파일을 준비하지 못했습니다.");
        return;
      }
    }
    if (useConsent) {
      const consent = collectConsentResponses(program);
      consentResponses = consent.responses;
      signature = document.querySelector("#signature").value.trim();
      if (consent.missing) {
        alert("개인정보 동의서의 모든 항목에 동의 여부를 선택해 주세요.");
        return;
      }
      if (!signature) {
        alert("전자서명을 입력해 주세요.");
        return;
      }
    }

    if (!validateApplicationSignature()) return;
    if (applicationSubmitting) return;
    setApplicationSubmitting_(true);
    try {
    const applicationId = crypto.randomUUID();
    let uploadedPath = null;
    if (uploadFile) {
      const extension = uploadFile.name.includes(".")
        ? `.${uploadFile.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "")}`
        : "";
      uploadedPath = `${program.id}/${applicationId}/${crypto.randomUUID()}${extension}`;
      const { error: uploadError } = await db.storage
        .from("application-files")
        .upload(uploadedPath, uploadFile, {
          contentType: uploadFile.type || "application/octet-stream",
          upsert: false
        });
      if (uploadError) {
        alert(`신청서 파일 업로드에 실패했습니다: ${uploadError.message}`);
        return;
      }
    }

    const now = new Date().toISOString();
    const row = {
      id: applicationId,
      program_id: program.id,
      center_id: program.centerId,
      applicant_name: document.querySelector("#name").value.trim(),
      phone: document.querySelector("#phone").value.trim(),
      birth_date: document.querySelector("#birth").value,
      participant_type: document.querySelector("#type").value,
      note: document.querySelector("#note").value.trim() || null,
      application_responses: {},
      privacy_agree: useConsent,
      consent_responses: consentResponses,
      base_consent_snapshot: useConsent ? activeConsentItems(program) : [],
      consent_version: useConsent ? `${globalConsentVersion}:${program.privacyRetentionYears}years` : "none",
      signature: signature || null,
      guardian_name: guardian?.name || null,
      guardian_signature: guardian?.signature || null,
      guardian_agreed_at: guardian ? now : null,
      privacy_agreed_at: useConsent ? now : null,
      google_form_confirmed_at: program.googleFormUrl ? (window.currentSurveyVerification?.submittedAt || now) : null,
      survey_token: program.googleFormUrl ? (window.currentSurveyVerification?.token || null) : null,
      uploaded_file_path: uploadedPath,
      uploaded_file_name: uploadFile?.name || null,
      uploaded_file_type: uploadFile?.type || null,
      uploaded_file_size: uploadFile?.size || null,
      created_at: now
    };
    const { error } = await db.from("applications").insert(row);
    if (error) {
      alert(`신청 접수에 실패했습니다: ${error.message}`);
      return;
    }
    let driveData = null;
    let driveError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await db.functions.invoke("swift-processor", { body: { applicationId } });
      driveData = result.data;
      driveError = result.error;
      if (!driveError && driveData?.ok) break;
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    document.querySelector("#applyDialog").close();
    await loadPublicApplicationCounts();
    renderPrograms();
    if (driveError || !driveData?.ok) {
      console.warn("Google Drive 저장을 완료하지 못했습니다.", driveError || driveData);
      showApplicationSuccess_("신청 접수는 완료되었지만 Google Drive 신청명단 반영이 지연되고 있습니다. 담당자가 동기화 상태를 확인해 주세요.");
    } else if (driveData?.applicationStatus === "waitlist") showApplicationSuccess_(`신청 접수가 완료되었습니다. 대기 ${driveData.waitlistNumber || ""}번입니다.`);
    else if (driveData?.applicationStatus === "pending_selection") showApplicationSuccess_("신청 접수가 완료되었습니다. 추첨·배점 선정 대기 상태입니다.");
    else showApplicationSuccess_("프로그램 신청 접수와 Google Drive 신청명단 반영이 완료되었습니다.");
    } finally {
      setApplicationSubmitting_(false);
    }
  };

  let pendingRemoteProgramSave = null;
  document.querySelector("#programForm").addEventListener("submit", (event) => {
    if (!currentUser) return;
    pendingRemoteProgramSave = {
      editingId,
      existingIds: new Set(programs.map((program) => program.id)),
      surveyId: window.NurimSurvey?.selected() || null,
      surveyOwner: window.NurimSurvey?.selection()?.owner_id || null,
      title: document.querySelector("#programTitle").value.trim(),
      startDate: document.querySelector("#startDate").value,
      endDate: document.querySelector("#endDate").value,
      submitButton: event.submitter || document.querySelector("#programForm button[type=submit]"),
      connectInstitutionFormAfterSave: Boolean(document.querySelector("#googleFormUrl").value.trim()) &&
        !Boolean(editingId && programs.find((program) => program.id === editingId)?.googleFormVerificationEnabled),
      googleFormUrl: document.querySelector("#googleFormUrl").value.trim(),
      formVerification: {
        enabled: Boolean(document.querySelector("#googleFormTokenEntry").value.trim() && document.querySelector("#googleFormResponseSheetId").value.trim()),
        tokenEntry: document.querySelector("#googleFormTokenEntry").value.trim(),
        formFileId: document.querySelector("#googleFormFileId").value.trim(),
        spreadsheetId: (document.querySelector("#googleFormResponseSheetId").value.trim().match(/(?:spreadsheets\/d\/)?([a-zA-Z0-9_-]{20,})/) || [])[1] || document.querySelector("#googleFormResponseSheetId").value.trim(),
        sheetName: document.querySelector("#googleFormResponseTab").value.trim() || "설문지 응답 1",
        tokenColumnName: document.querySelector("#googleFormTokenColumn").value.trim() || "설문 확인번호"
      }
    };
  }, true);

  document.querySelector("#programForm").addEventListener("submit", () => {
    if (!currentUser || !pendingRemoteProgramSave) return;
    const pending = pendingRemoteProgramSave;
    pendingRemoteProgramSave = null;
    pending.submitButton.disabled = true;
    window.setTimeout(async () => {
      try {
        const savedProgram = pending.editingId
          ? programs.find((program) => program.id === pending.editingId)
          : programs.find((program) => !pending.existingIds.has(program.id) && program.title === pending.title && program.startDate === pending.startDate && program.endDate === pending.endDate);
        if (!savedProgram) throw new Error("저장된 프로그램을 확인하지 못했습니다. 입력 내용을 다시 확인해 주세요.");
        if (currentProfile?.role === "manager") {
          savedProgram.managerId = currentUser.id;
          savedProgram.centerId = currentProfile.center_id;
          savedProgram.centerName = currentProfile.centers?.name || savedProgram.centerName;
          localStorage.setItem(keys.programs, JSON.stringify(programs));
        }
        savedProgram.surveyId = pending.surveyId;
        if (currentProfile?.role === "super" && pending.surveyId && pending.surveyOwner && !pending.editingId) savedProgram.managerId = pending.surveyOwner;
        await upsertProgram(savedProgram);
        await saveGoogleFormVerificationConfig(savedProgram.id, pending.formVerification);
        await loadPublicPrograms();
        if (!programs.some((program) => program.id === savedProgram.id)) throw new Error("온라인 저장 확인에 실패했습니다.");
        switchAdminTab("programManage");
        if (pending.connectInstitutionFormAfterSave && window.openInstitutionFormRelay) {
          await window.openInstitutionFormRelay(savedProgram.id, pending.googleFormUrl);
        } else {
          alert("프로그램이 저장되었습니다. 프로그램 관리 탭에서 확인할 수 있습니다.");
        }
      } catch (error) {
        alert(`온라인 저장에 실패했습니다: ${readableServerError(error)}`);
      } finally {
        pending.submitButton.disabled = false;
      }
    }, 0);
  });

  const originalDeleteProgram = deleteProgram;
  deleteProgram = async function deleteRemoteProgram(programId) {
    if (!currentUser) return;
    const program = programs.find((item) => item.id === programId);
    if (!program || !confirm(`${program.title} 프로그램을 삭제할까요?`)) return;
    const { error } = await db.from("programs").delete().eq("id", programId);
    if (error) {
      alert(`삭제할 수 없습니다: ${error.message}`);
      return;
    }
    programs = programs.filter((item) => item.id !== programId);
    localStorage.setItem(keys.programs, JSON.stringify(programs));
    renderAll();
  };

  const renderApplicantsBase = renderApplicants;
  renderApplicants = function renderApplicantsWithDelete() {
    renderApplicantsBase();
    if (!currentUser) return;
    const permittedIds = new Set(allowedPrograms().map((program) => program.id));
    const visible = applicants
      .filter((applicant) => permittedIds.has(applicant.programId))
      .filter((applicant) => applicant.programId === selectedApplicantProgramId)
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    document.querySelectorAll("#applicantList .applicantSummaryRow").forEach((row, index) => {
      const applicant = visible[index];
      if (!applicant) return;
      const driveBox = document.createElement("div");
      driveBox.className = "applicationDriveStatus " + (applicant.driveSyncStatus || "pending");
      if (applicant.driveSyncStatus === "synced") {
        driveBox.innerHTML = '<strong>Google Drive 반영 완료</strong>' +
          (applicant.driveRosterUrl ? ` <a href="${esc(applicant.driveRosterUrl)}" target="_blank" rel="noopener">신청명단 열기</a>` : "");
        const resyncButton = document.createElement("button");
        resyncButton.type = "button";
        resyncButton.textContent = "Drive 다시 반영";
        resyncButton.addEventListener("click", async () => {
          resyncButton.disabled = true;
          resyncButton.textContent = "반영 중…";
          try {
            await syncApplicationToDrive(applicant.id, true);
            await loadApplications();
            renderApplicants();
            alert("CSV 신청명단과 Google Form 응답 Sheet 바로가기를 다시 반영했습니다.");
          } catch (error) {
            alert("Drive 재반영에 실패했습니다: " + readableServerError(error));
            resyncButton.disabled = false;
            resyncButton.textContent = "Drive 다시 반영";
          }
        });
        driveBox.append(resyncButton);
      } else {
        driveBox.innerHTML = `<strong>Google Drive 반영 필요</strong><span>${esc(applicant.driveError || "동기화 대기 중")}</span>`;
        const retryButton = document.createElement("button");
        retryButton.type = "button";
        retryButton.textContent = "Drive 다시 반영";
        retryButton.addEventListener("click", async () => {
          retryButton.disabled = true;
          retryButton.textContent = "반영 중…";
          try {
            await syncApplicationToDrive(applicant.id, true);
            await loadApplications();
            renderApplicants();
            alert("Google Drive 신청명단을 다시 반영했습니다.");
          } catch (error) {
            alert("Drive 반영에 실패했습니다: " + readableServerError(error));
            retryButton.disabled = false;
            retryButton.textContent = "Drive 다시 반영";
          }
        });
        driveBox.append(retryButton);
      }
      row.append(driveBox);
      if (applicant.lifecycleStatus === "deleted") {
        if (currentProfile?.role === "super") {
          const purgeButton = document.createElement("button");
          purgeButton.type = "button";
          purgeButton.className = "danger applicationPurgeButton";
          purgeButton.textContent = "앱에서 완전 삭제";
          purgeButton.addEventListener("click", () => purgeApplication(applicant));
          row.append(purgeButton);
        }
        return;
      }
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "applicationEditButton";
      editButton.textContent = "신청내용 수정";
      editButton.addEventListener("click", () => openApplicationEdit(applicant));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger applicationDeleteButton";
      deleteButton.textContent = "신청자 삭제";
      deleteButton.addEventListener("click", () => deleteApplication(applicant));
      if (applicant.lifecycleStatus === "cancelled") {
        const restoreButton = document.createElement("button");
        restoreButton.type = "button";
        restoreButton.className = "applicationRestoreButton";
        restoreButton.textContent = "취소 되돌리기";
        restoreButton.addEventListener("click", () => restoreCancelledApplication(applicant));
        row.append(restoreButton, deleteButton);
      } else row.append(editButton, deleteButton);
    });
  };

  function ensureApplicationEditDialog() {
    let dialog = document.querySelector("#applicationEditDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "applicationEditDialog";
    dialog.className = "applicationEditDialog";
    dialog.innerHTML = `<form id="applicationEditForm"><div class="dialogTitle"><div><p class="smallLabel">관리자 수정</p><h2>신청내용 수정</h2></div><button class="applicationEditClose" type="button">닫기</button></div><input id="editApplicationId" type="hidden"><div class="formGrid"><label>이름<input id="editApplicantName" required></label><label>연락처<input id="editApplicantPhone" required></label><label>생년월일<input id="editApplicantBirth" type="date" required></label><label>참여자 구분<select id="editApplicantType" required><option>장애 당사자</option><option>보호자</option><option>지역주민</option></select></label><label class="wide">요청사항<textarea id="editApplicantNote" rows="4"></textarea></label></div><p class="sectionHelp">개인정보 동의 응답과 전자서명은 신청자의 의사표시이므로 관리자가 수정할 수 없습니다.</p><div class="formActions"><button class="primary" type="submit">수정 후 Google Drive 갱신</button></div></form>`;
    document.body.append(dialog);
    dialog.querySelector(".applicationEditClose").addEventListener("click", () => dialog.close());
    dialog.querySelector("#applicationEditForm").addEventListener("submit", saveApplicationEdit);
    return dialog;
  }

  function openApplicationEdit(applicant) {
    const dialog = ensureApplicationEditDialog();
    dialog.querySelector("#editApplicationId").value = applicant.id;
    dialog.querySelector("#editApplicantName").value = applicant.name || "";
    dialog.querySelector("#editApplicantPhone").value = applicant.phone || "";
    dialog.querySelector("#editApplicantBirth").value = applicant.birth || "";
    dialog.querySelector("#editApplicantType").value = applicant.type || "지역주민";
    dialog.querySelector("#editApplicantNote").value = applicant.note || "";
    ['#editApplicantType','#editApplicantNote'].forEach(id=>{const el=dialog.querySelector(id);el.disabled=applicant.surveyResponse;el.closest('label').hidden=applicant.surveyResponse;});
    dialog.showModal();
  }

  async function saveApplicationEdit(event) {
    event.preventDefault();
    if (!currentUser || !currentProfile) return;
    const applicationId = document.querySelector("#editApplicationId").value;
    const changes = {
      applicant_name: document.querySelector("#editApplicantName").value.trim(),
      phone: document.querySelector("#editApplicantPhone").value.trim(),
      birth_date: document.querySelector("#editApplicantBirth").value,
      participant_type: document.querySelector("#editApplicantType").value,
      note: document.querySelector("#editApplicantNote").value.trim() || null,
      lifecycle_status: "modified",
      modified_at: new Date().toISOString(),
      last_action_actor: "administrator",
      last_action_at: new Date().toISOString(),
      drive_sync_status: "pending",
      drive_error: null
    };
    if(applicants.find(a=>a.id===applicationId)?.surveyResponse){changes.participant_type="";changes.note=null;}
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      const { error } = await db.from("applications").update(changes).eq("id", applicationId);
      if (error) throw error;
      await syncApplicationToDrive(applicationId,true);
      document.querySelector("#applicationEditDialog").close();
      await loadApplications();
      renderAll();
      alert("신청내용을 수정하고 Google Drive 신청명단도 갱신했습니다.");
    } catch (error) {
      alert(`신청내용 수정 또는 Drive 갱신에 실패했습니다: ${readableServerError(error)}`);
    } finally {
      if (submit) submit.disabled = false;
    }
  }
  async function syncApplicationToDrive(applicationId, force = false, identityOverride=null) {
    const app=applicants.find(a=>a.id===applicationId);
    const lookup=latestLookupRows.find(a=>a.application_id===applicationId);
    const integrated=app?.surveyResponse || (lookup && !lookup.participant_type && !lookup.note);
    const body=integrated?{action:'sync',applicationId,force,identity:force?null:(identityOverride||lookupIdentity())}:{applicationId,force};
    if(integrated){await window.NurimSurvey.api('sync',body);return;}
    const {data,error}=await db.functions.invoke('swift-processor',{body});
    if(error||!data?.ok)throw error||new Error(data?.error||'Google 갱신을 확인하지 못했습니다.');
  }

  async function deleteApplication(applicant) {
    if (!confirm(`${applicant.name} 신청자의 접수내역을 관리자 삭제 상태로 변경할까요? 기록과 CSV 행은 보존됩니다.`)) return;
    const now = new Date().toISOString();
    const { error } = await db.from("applications").update({
      lifecycle_status: "deleted", deleted_at: now, last_action_actor: "administrator", last_action_at: now,
      drive_sync_status: "pending", drive_error: null
    }).eq("id", applicant.id);
    if (error) { alert(`신청내역을 변경하지 못했습니다: ${error.message}`); return; }
    try { await syncApplicationToDrive(applicant.id, true); }
    catch (syncError) { console.warn("삭제 이력 Drive 갱신 실패", syncError); }
    await loadApplications(); renderAll();
    alert("신청서를 관리자 삭제 상태로 변경했으며 기록은 보존했습니다.");
  }

  async function restoreCancelledApplication(applicant) {
    if (!currentUser || !currentProfile || applicant.lifecycleStatus !== "cancelled") return;
    if (!confirm(`${applicant.name} 신청자의 취소를 되돌려 다시 접수 상태로 복원할까요?`)) return;
    const now = new Date().toISOString();
    const lifecycleStatus = applicant.modifiedAt ? "modified" : "received";
    const { error } = await db.from("applications").update({
      lifecycle_status: lifecycleStatus, cancelled_at: null, last_action_actor: "administrator", last_action_at: now,
      drive_sync_status: "pending", drive_error: null
    }).eq("id", applicant.id);
    if (error) { alert(`취소를 되돌리지 못했습니다: ${error.message}`); return; }
    try { await syncApplicationToDrive(applicant.id, true); }
    catch (syncError) { console.warn("취소 복원 Drive 갱신 실패", syncError); }
    await loadApplications(); renderAll();
    alert("취소를 되돌리고 신청내역과 Google Drive 명단을 갱신했습니다.");
  }

  async function purgeApplication(applicant) {
    if (currentProfile?.role !== "super" || applicant.lifecycleStatus !== "deleted") return;
    if (!confirm(`${applicant.name} 신청서를 앱과 Supabase 목록에서 완전히 삭제할까요? Google Drive CSV의 관리자 삭제 기록은 유지됩니다.`)) return;
    const answer = prompt('완전 삭제하려면 "완전삭제"를 입력해 주세요.');
    if (answer !== "완전삭제") return;
    const { error } = await db.from("applications").delete().eq("id", applicant.id).eq("lifecycle_status", "deleted");
    if (error) { alert(`완전 삭제하지 못했습니다: ${error.message}`); return; }
    await loadApplications(); renderAll();
    alert("최고관리자 권한으로 앱에서 완전히 삭제했습니다. Google Drive CSV의 삭제 이력은 유지됩니다.");
  }
  const lookupIdentity = () => ({
    name: document.querySelector("#lookupName").value.trim(),
    birth: document.querySelector("#lookupBirth").value,
    last4: document.querySelector("#lookupPhoneLast4").value.replace(/\D/g, "")
  });
  let latestLookupRows = [];

  function lifecycleText(item) {
    if (item.lifecycle_status === "modified") return "수정";
    if (item.lifecycle_status === "cancelled") return "취소";
    if (item.lifecycle_status === "deleted") return "관리자 삭제";
    return "접수";
  }
  function actorText(actor) { return actor === "administrator" ? "관리자" : "이용자"; }
  function actionTime(item) {
    const value = item.deleted_at || item.cancelled_at || item.modified_at || item.applied_at;
    return value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";
  }
  function renderLookupRows(rows) {
    const result = document.querySelector("#applicationLookupResult");
    result.innerHTML = rows.map((item) => {
      const active = !["cancelled", "deleted"].includes(item.lifecycle_status);
      const buttons = item.can_self_manage && active
        ? `<div class="lookupActions"><button type="button" class="lookupEditButton" data-id="${esc(item.application_id)}">신청내용 수정</button><button type="button" class="danger lookupCancelButton" data-id="${esc(item.application_id)}">신청 취소</button></div>`
        : `<p class="lookupContactNotice">${active ? "모집기간이 종료되어 담당기관을 통해서만 수정·취소할 수 있습니다." : "처리가 완료된 신청입니다."}</p>`;
      return `<article class="lookupResultCard lifecycle-${esc(item.lifecycle_status)}">
        <div class="lookupCardHead"><h3>${esc(item.program_title)}</h3><strong class="lifecycleTag ${esc(item.lifecycle_status)}">${lifecycleText(item)}</strong></div>
        <p class="lookupCenter">${esc(item.center_name)}</p><dl class="lookupDetails">
          <div><dt>신청자</dt><dd>${esc(item.applicant_name)} · ${esc(item.masked_phone)}</dd></div>
          <div><dt>생년월일</dt><dd>${esc(item.birth_date)}</dd></div>
          <div><dt>참여자 구분</dt><dd>${esc(item.participant_type)}</dd></div>
          <div><dt>접수일</dt><dd>${new Date(item.applied_at).toLocaleString("ko-KR")}</dd></div>
          <div><dt>최근 처리</dt><dd>${lifecycleText(item)} · ${actorText(item.last_action_actor)} · ${actionTime(item)}</dd></div>
          <div><dt>취소·수정 문의</dt><dd><a href="tel:${esc(item.center_contact_phone)}">${esc(item.center_contact_phone || "기관 연락처 확인 중")}</a></dd></div>
        </dl>${buttons}</article>`;
    }).join("");
    result.querySelectorAll(".lookupEditButton").forEach((button) => button.addEventListener("click", () => openSelfEdit(button.dataset.id)));
    result.querySelectorAll(".lookupCancelButton").forEach((button) => button.addEventListener("click", () => cancelSelfApplication(button.dataset.id)));
  }
  function ensureSelfEditDialog() {
    let dialog = document.querySelector("#selfApplicationEditDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog"); dialog.id = "selfApplicationEditDialog"; dialog.className = "applicationEditDialog";
    dialog.innerHTML = `<form id="selfApplicationEditForm"><div class="dialogTitle"><div><p class="smallLabel">모집기간 내 직접 수정</p><h2>신청내용 수정</h2></div><button type="button" class="selfEditClose">닫기</button></div>
      <input id="selfEditApplicationId" type="hidden"><div class="formGrid"><label>이름<input id="selfEditName" required></label>
      <label>새 연락처<input id="selfEditPhone" inputmode="tel" placeholder="변경하지 않으면 비워두세요"></label>
      <label>생년월일<input id="selfEditBirth" type="date" required></label><label>참여자 구분<select id="selfEditType" required><option>장애 당사자</option><option>보호자</option><option>지역주민</option></select></label>
      <label class="wide">요청사항<textarea id="selfEditNote" rows="4"></textarea></label></div><p class="sectionHelp">수정 일시와 처리 주체가 기록되고 Google Drive 신청명단도 갱신됩니다.</p><div class="formActions"><button class="primary" type="submit">수정 저장</button></div></form>`;
    document.body.append(dialog); dialog.querySelector(".selfEditClose").addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", saveSelfApplicationEdit); return dialog;
  }
  function openSelfEdit(id) {
    const item = latestLookupRows.find((row) => row.application_id === id); if (!item) return;
    const dialog = ensureSelfEditDialog(); dialog.querySelector("#selfEditApplicationId").value = id;
    dialog.querySelector("#selfEditName").value = item.applicant_name || ""; dialog.querySelector("#selfEditPhone").value = "";
    dialog.querySelector("#selfEditBirth").value = item.birth_date || ""; dialog.querySelector("#selfEditType").value = item.participant_type || "지역주민";
    dialog.querySelector('#selfEditNote').value = item.note || '';
    const basicOnly=!item.participant_type&&!item.note;
    ['#selfEditType','#selfEditNote'].forEach(id=>{const el=dialog.querySelector(id);el.disabled=basicOnly;el.closest('label').hidden=basicOnly;});
    dialog.showModal();
  }
  async function saveSelfApplicationEdit(event) {
    event.preventDefault(); const identity = lookupIdentity(); const button = event.submitter; if (button) button.disabled = true;
    try {
      const applicationId = document.querySelector("#selfEditApplicationId").value;
      const newName=document.querySelector('#selfEditName').value.trim(),newBirth=document.querySelector('#selfEditBirth').value,newPhone=document.querySelector('#selfEditPhone').value.trim();
      const { error } = await db.rpc("update_my_application", { p_application_id: applicationId, p_name: identity.name, p_birth_date: identity.birth,
        p_phone_last4: identity.last4, p_new_name: document.querySelector("#selfEditName").value.trim(), p_new_phone: document.querySelector("#selfEditPhone").value.trim(),
        p_new_birth_date: document.querySelector("#selfEditBirth").value, p_new_participant_type: document.querySelector("#selfEditType").disabled ? "" : document.querySelector("#selfEditType").value,
        p_new_note: document.querySelector("#selfEditNote").disabled ? null : document.querySelector("#selfEditNote").value.trim() });
      if (error) throw error; await syncApplicationToDrive(applicationId, false, {name:newName,birth:newBirth,last4:newPhone?newPhone.replace(/\D/g,"").slice(-4):identity.last4}); document.querySelector("#selfApplicationEditDialog").close();
      document.querySelector("#lookupName").value = newName; document.querySelector("#lookupBirth").value = newBirth;
      if (newPhone) document.querySelector("#lookupPhoneLast4").value = newPhone.replace(/\D/g, "").slice(-4);
      alert("신청내용이 수정되었고 수정 일시가 기록되었습니다."); document.querySelector("#applicationLookupForm").requestSubmit();
    } catch (error) { alert(`수정하지 못했습니다: ${readableServerError(error)}`); } finally { if (button) button.disabled = false; }
  }
  async function cancelSelfApplication(id) {
    if (!confirm("이 신청을 취소할까요? 취소 일시와 처리 주체가 기록됩니다.")) return;
    const identity = lookupIdentity(); const { error } = await db.rpc("cancel_my_application", { p_application_id: id, p_name: identity.name, p_birth_date: identity.birth, p_phone_last4: identity.last4 });
    if (error) { alert(`취소하지 못했습니다: ${readableServerError(error)}`); return; }
    try { await syncApplicationToDrive(id, false); } catch (syncError) { console.warn("취소 이력 Drive 갱신 실패", syncError); }
    alert("신청이 취소되었고 취소 일시가 기록되었습니다."); document.querySelector("#applicationLookupForm").requestSubmit();
  }

  document.querySelector("#applicationLookupForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const identity = lookupIdentity(); const result = document.querySelector("#applicationLookupResult"); result.classList.remove("hidden");
    if (identity.last4.length !== 4) { result.innerHTML = "<p>연락처 뒷번호 4자리를 숫자로 입력해 주세요.</p>"; return; }
    result.innerHTML = "<p>신청내역을 확인하고 있습니다.</p>";
    const { data, error } = await db.rpc("lookup_my_applications", { p_name: identity.name, p_birth_date: identity.birth, p_phone_last4: identity.last4 });
    if (error) { result.innerHTML = "<p>지금은 신청내역을 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.</p>"; return; }
    latestLookupRows = (data || []).slice().sort((a, b) => new Date(a.applied_at) - new Date(b.applied_at));
    if (!latestLookupRows.length) { result.innerHTML = "<p>입력한 이름, 생년월일, 연락처 뒷번호가 일치하는 신청내역이 없습니다.</p>"; return; }
    renderLookupRows(latestLookupRows);
  });
  toggleProgramVisibility = async function toggleRemoteProgramVisibility(program) {
    if (!currentUser || !currentProfile || !allowedPrograms().some((item) => item.id === program.id)) return;
    const nextHidden = program.hiddenFromPublic !== true;
    const { error } = await db.from("programs").update({ hidden_from_public: nextHidden, updated_at: new Date().toISOString() }).eq("id", program.id);
    if (error) {
      alert(`공개 상태를 변경하지 못했습니다: ${error.message}`);
      return;
    }
    program.hiddenFromPublic = nextHidden;
    await loadPublicPrograms();
    alert(nextHidden ? "이 프로그램을 이용자 화면에서 숨겼습니다." : "이 프로그램을 이용자 화면에 다시 공개했습니다.");
  };
  window.extractPromotionDraftFromImage = async function extractPromotionDraftFromImage(file) {
    if (!currentUser || !currentProfile || !["manager", "super"].includes(currentProfile.role)) throw new Error("관리자 로그인이 필요합니다.");
    const supported = file && (file.type?.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
    if (!supported) throw new Error("이미지 또는 PDF 홍보지를 선택해 주세요.");
    if (file.size > 10 * 1024 * 1024) throw new Error("10MB 이하 홍보지만 읽을 수 있습니다.");
    const encoded = await fileToData(file);
    const { data, error } = await db.functions.invoke("swift-processor", { body: { action: "extract-promotion-draft", image: { name: file.name, mimeType: file.type, dataUrl: encoded.dataUrl } } });
    if (error) {
      let detail = "";
      try {
        const payload = await error.context?.clone?.().json();
        detail = String(payload?.error || payload?.message || "");
      } catch {
        try { detail = await error.context?.clone?.().text() || ""; } catch {}
      }
      throw new Error(detail || readableServerError(error));
    }
    if (!data?.ok) throw new Error(data?.error || "홍보지 내용을 읽지 못했습니다.");
    return data;
  };

  window.extractPromotionDraftFromImages = async function extractPromotionDraftFromImages(images) {
    if (!currentUser || !currentProfile || !["manager", "super"].includes(currentProfile.role)) throw new Error("관리자 로그인이 필요합니다.");
    const targets = (images || []).slice(0, 1);
    if (!targets.length) throw new Error("이미지 또는 PDF 홍보지를 선택해 주세요.");
    const drafts = [];
    const texts = [];
    for (let index = 0; index < targets.length; index += 1) {
      const image = targets[index];
      if (!/^data:(?:image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/.test(image?.dataUrl || "")) continue;
      const { data, error } = await db.functions.invoke("swift-processor", {
        body: { action: "extract-promotion-draft", image: { name: image.name || "홍보지", mimeType: image.type || (image.dataUrl.startsWith("data:application/pdf") ? "application/pdf" : "image/jpeg"), dataUrl: image.dataUrl } }
      });
      if (error) {
        let detail = "";
        try { detail = String((await error.context?.clone?.().json())?.error || ""); } catch {}
        throw new Error(detail || `홍보지를 읽지 못했습니다: ${readableServerError(error)}`);
      }
      if (!data?.ok) throw new Error(data?.error || "홍보지를 읽지 못했습니다.");
      drafts.push(data.draft || {});
      if (data.rawText) texts.push(data.rawText);
    }
    const keys = ["title", "fee", "contactPhone", "audience", "capacity", "startDate", "endDate", "schedule", "ageGroup"];
    const draft = {};
    keys.forEach((key) => {
      const found = drafts.find((item) => item[key] !== undefined && item[key] !== null && item[key] !== "");
      if (found) draft[key] = found[key];
    });
    draft.selectionMethod = drafts.some((item) => item.selectionMethod === "lottery") ? "lottery"
      : drafts.some((item) => item.selectionMethod === "first_come") ? "first_come" : "open";
    const descriptionItems = [];
    drafts.forEach((item) => String(item.description || "").split(/\n+/).forEach((line) => {
      const normalized = line.trim();
      if (normalized && !descriptionItems.includes(normalized) && descriptionItems.length < 5) descriptionItems.push(normalized);
    }));
    draft.description = descriptionItems.join("\n");
    draft.warnings = [...new Set(drafts.flatMap((item) => Array.isArray(item.warnings) ? item.warnings : []))]
      .filter((field) => !draft[field === "프로그램명" ? "title" : field === "모집기간" ? "startDate" : field === "참여대상" ? "audience" : field === "연락처" ? "contactPhone" : ""]);
    draft.recognitionQuality = Math.max(0, 100 - draft.warnings.length * 20);
    return { ok: true, rawText: texts.join("\n\n"), draft };
  };

  window.extractPromotionDraftFromUrl = async function extractPromotionDraftFromUrl(url) {
    if (!currentUser || !currentProfile || !["manager", "super"].includes(currentProfile.role)) throw new Error("관리자 로그인이 필요합니다.");
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("올바른 홈페이지 주소를 입력해 주세요."); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("http 또는 https 공개 주소만 사용할 수 있습니다.");
    const { data, error } = await db.functions.invoke("swift-processor", { body: { action: "extract-promotion-link", url: parsed.href } });
    if (error) {
      let detail = "";
      try { detail = String((await error.context?.clone?.().json())?.error || ""); } catch {}
      throw new Error(detail || readableServerError(error));
    }
    if (!data?.ok) throw new Error(data?.error || "공지 페이지 내용을 읽지 못했습니다.");
    return data;
  };
  db.auth.getSession().then(async ({ data }) => {
    try {
      await loadPublicPrograms();
      startProgramsRealtime();
      await loadRemoteCenters();
    } catch (publicDataError) {
      console.error("공개 프로그램 초기화 중 오류가 발생했습니다.", publicDataError);
    }
    if (data.session?.user) {
      try {
        await applyAuthenticatedUser(data.session.user);
      } catch (profileError) {
        console.error("관리자 권한 정보를 불러오지 못했습니다.", profileError);
        saveSession(null);
        applyAdminAccess();
        alert(`로그인 계정의 관리자 권한을 확인하지 못했습니다: ${profileError?.message || profileError}`);
      }
    } else {
      saveSession(null);
      applyAdminAccess();
    }
  });

  window.setInterval(async () => {
    if (currentUser || document.visibilityState !== "visible") return;
    if (await loadPublicApplicationCounts()) renderPrograms();
  }, 30000);
})();



