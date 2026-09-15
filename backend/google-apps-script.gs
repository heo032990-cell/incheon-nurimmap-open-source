/**
 * Google Apps Script 웹 앱
 * 대상 폴더: 테스트용
 * https://drive.google.com/drive/folders/YOUR_FOLDER_ID
 */
const TARGET_FOLDER_ID = PropertiesService.getScriptProperties().getProperty("TARGET_FOLDER_ID") || "";
const ROSTER_FILE_NAME = "신청명단.csv";
const ROSTER_FIXED_HEADERS = [
  "신청번호", "신청일시", "신청자 이름", "연락처", "생년월일",
  "참여자 구분", "요청사항", "모집방식", "접수상태", "대기번호",
  "개인정보 보유기간", "전자서명", "전자서명일",
  "신청 처리상태", "수정일시", "취소일시", "삭제일시", "처리 주체", "최종 처리일시", "Google Form 확인일시"
];
const ROSTER_FOLDER_HEADER = "신청서 폴더";

function doGet() {
  return jsonResponse_({ ok: true, service: "인천 장애인복지관 신청서 Drive 연동" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    if (!expectedSecret || body.secret !== expectedSecret) {
      return jsonResponse_({ ok: false, error: "인증에 실패했습니다." });
    }

    if (String(body.action || "").indexOf("nurim-survey-") === 0) return jsonResponse_(nurimSurveyRoute_(body));
    if (body.action === "auto-detect-google-form-config") {
      try {
        return jsonResponse_(autoDetectGoogleFormConfig_(body.formUrl, body.spreadsheetUrl));
      } catch (error) {
        return jsonResponse_({ ok: false, error: String(error && error.message || error) });
      }
    }

    if (body.action === "create-google-form-config") {
      try {
        return jsonResponse_(createGoogleFormConfig_(body));
      } catch (error) {
        return jsonResponse_({ ok: false, error: String(error && error.message || error) });
      }
    }

    if (body.action === "update-google-form-editors") {
      try {
        return jsonResponse_(updateGoogleFormEditors_(body));
      } catch (error) {
        return jsonResponse_({ ok: false, error: String(error && error.message || error) });
      }
    }

    if (body.action === "verify-google-form-token") {
      return jsonResponse_(verifyGoogleFormToken_(body));
    }

    if (body.action === "extract-promotion-draft") {
      return jsonResponse_(extractPromotionDraft_(body.image || {}));
    }
    if (body.action === "extract-promotion-link") {
      try {
        return jsonResponse_(extractPromotionDraftFromUrl_(body.url));
      } catch (error) {
        return jsonResponse_({ ok: false, error: String(error && error.message || error) });
      }
    }
    if (body.action === "resolve-program-owners") {
      return jsonResponse_({ ok: true, suggestions: resolveProgramOwners_(body.managers || [], body.programs || []) });
    }
    const application = body.application || {};
    const program = body.program || {};
    if (!application.id || !application.applicant_name || !program.title) {
      return jsonResponse_({ ok: false, error: "필수 신청정보가 없습니다." });
    }

    const targetFolderId = String(body.targetFolderId || TARGET_FOLDER_ID);
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(targetFolderId)) {
      return jsonResponse_({ ok: false, error: "올바르지 않은 대상 폴더입니다." });
    }
    const root = DriveApp.getFolderById(targetFolderId);
    const programFolder = getOrCreateFolder_(root, safeName_(program.title));
    const date = Utilities.formatDate(
      new Date(application.created_at || new Date()),
      Session.getScriptTimeZone() || "Asia/Seoul",
      "yyyyMMdd"
    );
    const applicantFolderName =
      `${safeName_(application.applicant_name)}_${date}_${String(application.id).slice(0, 8)}`;
    const applicantFolder = (body.file || application.drive_uploaded_file_url) ? getOrCreateFolder_(programFolder, "신청서 모음") : programFolder;


    let uploadedFileUrl=String(application.drive_uploaded_file_url||"");
    if (body.file && body.file.base64 && body.file.name) {
      var uploaded=nurimSaveAttachments_(applicantFolder,body.file,safeName_(application.applicant_name)+'_'+application.id+'_');
      uploadedFileUrl=uploaded.length===1?uploaded[0].url:applicantFolder.getUrl();
    }

    const roster = upsertProgramRosterCsv_(programFolder, application, program, applicantFolder);
    const responseSheetShortcut = ensureResponseSheetShortcut_(
      programFolder, String(body.responseSpreadsheetId || "")
    );

    return jsonResponse_({
      ok: true,
      folderId: applicantFolder.getId(),
      folderUrl: applicantFolder.getUrl(),
      rosterSpreadsheetId: roster.fileId,
      rosterSpreadsheetUrl: roster.fileUrl,
      rosterFileType: "text/csv",
      uploadedFileUrl,
      responseSheetShortcutUrl: responseSheetShortcut ? responseSheetShortcut.getUrl() : null
    });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

/** 프로그램별 CSV 신청명단을 만들고 동의 응답을 항목별 열로 분리합니다. */
function upsertProgramRosterCsv_(programFolder, application, program, applicantFolder) {
  const files = programFolder.getFilesByName(ROSTER_FILE_NAME);
  const rosterFile = files.hasNext() ? files.next() : null;
  let existingRows = [];
  if (rosterFile) {
    const existing = rosterFile.getBlob().getDataAsString("UTF-8").replace(/^\uFEFF/, "").trim();
    if (existing) existingRows = Utilities.parseCsv(existing);
  }

  const oldHeaders = existingRows.length ? existingRows[0] : [];
  const consentEntries=[];
  const headers = ROSTER_FIXED_HEADERS.filter(function(h){return ["참여자 구분","요청사항","개인정보 보유기간","전자서명","전자서명일","Google Form 확인일시"].indexOf(h)<0;}).concat([ROSTER_FOLDER_HEADER]);
  const rows = [headers];

  existingRows.slice(1).forEach(function(oldRow) {
    rows.push(headers.map(function(header) {
      const oldIndex = oldHeaders.indexOf(header);
      return oldIndex >= 0 ? oldRow[oldIndex] || "" : "";
    }));
  });

  const applicationId = String(application.id || "");
  const timezone = Session.getScriptTimeZone() || "Asia/Seoul";
  const createdAt = application.created_at
    ? Utilities.formatDate(new Date(application.created_at), timezone, "yyyy-MM-dd HH:mm:ss")
    : Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd HH:mm:ss");
  const fixedValues = [
    safeCell_(applicationId), createdAt, safeCell_(application.applicant_name),
    safeCell_(application.phone), safeCell_(application.birth_date),
    safeCell_(application.participant_type), safeCell_(application.note),
    safeCell_(selectionMethod_(program)), safeCell_(applicationStatus_(application)),
    safeCell_(waitlistNumber_(application, program)),
    safeCell_(privacyCollectionPeriod_(program)), safeCell_(application.signature),
    safeCell_(signatureDate_(application, timezone)),
    safeCell_(lifecycleStatus_(application)), safeCell_(formatTimestamp_(application.modified_at, timezone)),
    safeCell_(formatTimestamp_(application.cancelled_at, timezone)), safeCell_(formatTimestamp_(application.deleted_at, timezone)),
    safeCell_(application.last_action_actor === "administrator" ? "관리자" : "이용자"),
    safeCell_(formatTimestamp_(application.last_action_at, timezone)),
    safeCell_(formatTimestamp_(application.google_form_confirmed_at, timezone))
  ];
  const values = {};
  ROSTER_FIXED_HEADERS.forEach(function(header, index) { values[header] = fixedValues[index]; });


  consentEntries.forEach(function(entry) {
    values["동의 - " + consentLabel_(program, entry[0])] = consentValue_(entry[1]);
  });
  values[ROSTER_FOLDER_HEADER] = applicantFolder.getUrl();
  const row = headers.map(function(header) { return values[header] || ""; });

  const matchedIndex = rows.findIndex(function(item, index) {
    return index > 0 && String(item[0] || "").replace(/^'/, "") === applicationId;
  });
  if (matchedIndex >= 0) rows[matchedIndex] = row;
  else rows.push(row);

  const applicationDateIndex = headers.indexOf("신청일시");
  const applicationIdIndex = headers.indexOf("신청번호");
  const sortedDataRows = rows.slice(1).sort(function(left, right) {
    const dateOrder = String(left[applicationDateIndex] || "").localeCompare(String(right[applicationDateIndex] || ""));
    return dateOrder || String(left[applicationIdIndex] || "").localeCompare(String(right[applicationIdIndex] || ""));
  });
  rows.length = 1;
  Array.prototype.push.apply(rows, sortedDataRows);

  const csv = "\uFEFF" + rows.map(csvRow_).join("\r\n") + "\r\n";
  const file = rosterFile || programFolder.createFile(
    Utilities.newBlob(csv, "text/csv;charset=utf-8", ROSTER_FILE_NAME)
  );
  if (rosterFile) rosterFile.setContent(csv);
  const stored = file.getBlob().getDataAsString("UTF-8");
  if (stored.indexOf(applicationId) < 0) {
    throw new Error("신청명단.csv 갱신 확인에 실패했습니다. 다시 시도해 주세요.");
  }
  return { fileId: file.getId(), fileUrl: file.getUrl() };
}

function selectionMethod_(program) {
  if (program.selection_method === "open") return "";
  return program.selection_method === "lottery" ? "추첨·배점" : "선착순";
}
function applicationStatus_(application) {
  if (application.application_status === "pending_selection") return "선정 대기";
  if (application.application_status === "waitlist") return "대기";
  return "접수";
}
function lifecycleStatus_(application) {
  if (application.lifecycle_status === "modified") return "수정";
  if (application.lifecycle_status === "cancelled") return "취소";
  if (application.lifecycle_status === "deleted") return "관리자 삭제";
  return "접수";
}
function formatTimestamp_(value, timezone) {
  return value ? Utilities.formatDate(new Date(value), timezone, "yyyy-MM-dd HH:mm:ss") : "";
}function waitlistNumber_(application, program) {
  if (application.application_status !== "waitlist") return "";
  return Math.max(1, Number(application.queue_number || 0) - Number(program.capacity || 0));
}
function privacyCollectionPeriod_(program) {
  const years = Math.max(1, Number(program.privacy_retention_years || 5));
  return years + "년";
}
function signatureDate_(application, timezone) {
  return application.privacy_agreed_at
    ? Utilities.formatDate(new Date(application.privacy_agreed_at), timezone, "yyyy-MM-dd")
    : "";
}
function consentLabel_(program, key) {
  const items = Array.isArray(program.consent_items) ? program.consent_items : [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    if (item.id === key) return item.title || key;
    const rows = Array.isArray(item.rows) ? item.rows : [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (rows[rowIndex].id === key) return (item.title ? item.title + " - " : "") + (rows[rowIndex].label || key);
    }
  }
  return key;
}

function consentValue_(value) {
  if (value === "agree") return "동의";
  if (value === "disagree") return "미동의";
  return safeCell_(value);
}
/**
 * 기존 모든 신청명단 CSV에서 과거 "신청정보 -" 추가 질문 열을 제거합니다.
 * v39 적용 직후 Apps Script 편집기에서 이 함수를 한 번 직접 실행하세요.
 */
function cleanupAllRosterCustomQuestionColumns() {
  const result = { scanned: 0, updated: 0 };
  cleanupRosterFolder_(DriveApp.getFolderById(TARGET_FOLDER_ID), result);
  console.log(JSON.stringify(result));
  return result;
}

function cleanupRosterFolder_(folder, result) {
  const files = folder.getFilesByName(ROSTER_FILE_NAME);
  while (files.hasNext()) {
    result.scanned += 1;
    const file = files.next();
    const text = file.getBlob().getDataAsString("UTF-8").replace(/^\uFEFF/, "").trim();
    if (!text) continue;
    const rows = Utilities.parseCsv(text);
    if (!rows.length) continue;
    const keepIndexes = rows[0].map(function(header, index) {
      return String(header || "").indexOf("신청정보 - ") === 0 ? -1 : index;
    }).filter(function(index) { return index >= 0; });
    if (keepIndexes.length === rows[0].length) continue;
    const cleaned = rows.map(function(row) {
      return keepIndexes.map(function(index) { return row[index] || ""; });
    });
    file.setContent("\uFEFF" + cleaned.map(csvRow_).join("\r\n") + "\r\n");
    result.updated += 1;
  }
  const folders = folder.getFolders();
  while (folders.hasNext()) cleanupRosterFolder_(folders.next(), result);
}
function csvRow_(row) {
  return row.map(function(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }).join(",");
}
function safeCell_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
function makeConsentCell_(consent) {
  const entries = Object.entries(consent || {});
  return entries.length
    ? entries.map(function(entry) { return entry[0] + ": " + entry[1]; }).join("\n")
    : "별도 동의항목 없음";
}
function ensureResponseSheetShortcut_(programFolder, spreadsheetId) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) return null;
  const name = "Google Form 응답 스프레드시트";
  const existing = programFolder.getFilesByName(name);
  if (existing.hasNext()) return existing.next();
  try {
    const shortcut = programFolder.createShortcut(spreadsheetId);
    shortcut.setName(name);
    return shortcut;
  } catch (error) {
    throw new Error("Google Form 응답 Sheet 바로가기를 만들지 못했습니다. Apps Script 계정의 Sheet 및 프로그램 폴더 편집 권한을 확인해 주세요.");
  }
}

function getOrCreateApplicantFolder_(programFolder, name, applicationIdPrefix) {
  const suffix = "_" + applicationIdPrefix;
  const folders = programFolder.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (folder.getName().slice(-suffix.length) === suffix) {
      if (folder.getName() !== name) folder.setName(name);
      return folder;
    }
  }
  return programFolder.createFolder(name);
}
function getOrCreateFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function safeName_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "이름없음";
}

function makeSummary_(application, program) {


  const consent = application.consent_responses || {};
  const consentText = Object.keys(consent).length
    ? Object.entries(consent).map(([key, value]) => `- ${key}: ${value}`).join("\n")
    : "- 별도 동의항목 없음";
  return [
    "인천광역시 장애인복지관 프로그램 신청내용",
    "",
    `복지관: ${program.center_name || ""}`,
    `프로그램: ${program.title || ""}`,
    `신청일시: ${application.created_at || ""}`,
    "",
    `이름: ${application.applicant_name || ""}`,
    `연락처: ${application.phone || ""}`,
    `생년월일: ${application.birth_date || ""}`,
    `참여자 구분: ${application.participant_type || ""}`,
    `요청사항: ${application.note || "없음"}`,
    `전자서명: ${application.signature || "해당 없음"}`,
    `전자서명일: ${application.privacy_agreed_at || "해당 없음"}`,

    "",
    "[개인정보 동의 응답]",
    consentText
  ].join("\n");
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 신청서 하위 폴더가 어느 담당자 공유폴더 안에 있는지 확인합니다. */
function resolveProgramOwners_(managers, programs) {
  const roots = (managers || []).map(function(manager) {
    return { managerId: String(manager.managerId || ""), folderId: String(manager.folderId || "") };
  }).filter(function(manager) { return manager.managerId && manager.folderId; });
  return (programs || []).map(function(program) {
    const matched = {};
    (program.folderIds || []).forEach(function(folderId) {
      roots.forEach(function(root) {
        if (folderIsInside_(String(folderId || ""), root.folderId)) matched[root.managerId] = true;
      });
    });
    const ids = Object.keys(matched);
    return { programId: String(program.programId || ""), managerId: ids.length === 1 ? ids[0] : null, confidence: ids.length === 1 ? "drive" : (ids.length > 1 ? "conflict" : "unknown") };
  });
}
function folderIsInside_(childFolderId, rootFolderId) {
  if (!childFolderId || !rootFolderId) return false;
  if (childFolderId === rootFolderId) return true;
  let current;
  try { current = DriveApp.getFolderById(childFolderId); } catch (error) { return false; }
  for (let depth = 0; depth < 12; depth += 1) {
    const parents = current.getParents();
    if (!parents.hasNext()) return false;
    let next = null;
    while (parents.hasNext()) {
      const parent = parents.next();
      if (parent.getId() === rootFolderId) return true;
      if (!next) next = parent;
    }
    if (!next) return false;
    current = next;
  }
  return false;
}
/**
 * 홍보지 OCR 배포 전에 편집기에서 한 번 직접 실행하여 새 권한을 승인합니다.
 */
function authorizePromotionOcr() {
  const response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Google Drive OCR 권한 확인 실패: " + response.getContentText());
  }
  return true;
}
function extractPromotionDraft_(image) {
  const dataUrl = String(image.dataUrl || "");
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.+)$/);
  if (!match) return { ok: false, error: "올바른 홍보 이미지 또는 PDF가 아닙니다." };
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 10 * 1024 * 1024) return { ok: false, error: "홍보 이미지는 10MB 이하로 등록해 주세요." };

  const boundary = "ocr_" + Utilities.getUuid().replace(/-/g, "");
  const metadata = JSON.stringify({
    name: "홍보지_OCR_" + new Date().getTime(),
    mimeType: "application/vnd.google-apps.document"
  });
  const prefix = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
    metadata + "\r\n--" + boundary + "\r\nContent-Type: " + match[1] + "\r\n\r\n";
  const suffix = "\r\n--" + boundary + "--";
  const payload = Utilities.newBlob(prefix).getBytes()
    .concat(bytes)
    .concat(Utilities.newBlob(suffix).getBytes());
  const token = ScriptApp.getOAuthToken();
  let documentId = "";
  try {
    const upload = UrlFetchApp.fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "post",
        contentType: "multipart/related; boundary=" + boundary,
        headers: { Authorization: "Bearer " + token },
        payload: payload,
        muteHttpExceptions: true
      }
    );
    if (upload.getResponseCode() < 200 || upload.getResponseCode() >= 300) {
      throw new Error("Google Drive OCR 변환 실패: " + upload.getContentText().slice(0, 300));
    }
    documentId = JSON.parse(upload.getContentText()).id;
    Utilities.sleep(1200);
    const exported = UrlFetchApp.fetch(
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(documentId) +
        "/export?mimeType=" + encodeURIComponent("text/plain"),
      { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true }
    );
    if (exported.getResponseCode() < 200 || exported.getResponseCode() >= 300) {
      throw new Error("OCR 글자 추출 실패: " + exported.getContentText().slice(0, 300));
    }
    const text = exported.getContentText("UTF-8").replace(/\r/g, "").trim();
    if (!text) throw new Error("홍보지에서 읽을 수 있는 글자를 찾지 못했습니다.");
    return { ok: true, rawText: text, draft: promotionDraftFromText_(text) };
  } catch (error) {
    return { ok: false, error: String(error && error.message || error) };
  } finally {
    if (documentId) {
      try { DriveApp.getFileById(documentId).setTrashed(true); } catch (ignore) {}
    }
  }
}


function safePromotionPageUrl_(value) {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) throw new Error("http 또는 https 공개 주소만 사용할 수 있습니다.");
  const hostMatch = text.match(/^https?:\/\/([^\/?#:]+)(?::\d+)?/i);
  const host = String(hostMatch && hostMatch[1] || "").toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(?:localhost|local|internal)$/.test(host) ||
      /^(?:0|10|127)\./.test(host) || /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      host === "::1" || /^(?:fc|fd|fe80:)/.test(host)) {
    throw new Error("공개 홈페이지 주소만 사용할 수 있습니다.");
  }
  return text;
}

function htmlText_(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function resolvePageUrl_(baseUrl, location) {
  const target = String(location || "").trim();
  if (/^https?:\/\//i.test(target)) return target;
  const base = String(baseUrl || "").match(/^(https?:\/\/[^\/]+)(\/[^?#]*)?/i);
  if (!base) throw new Error("공지 페이지 이동 주소가 올바르지 않습니다.");
  if (target.charAt(0) === "/") return base[1] + target;
  if (target.charAt(0) === "?") return base[1] + (base[2] || "/") + target;
  const parts = String(base[2] || "/").split("/");
  parts.pop();
  target.split("/").forEach(function(part) {
    if (!part || part === ".") return;
    if (part === "..") parts.pop(); else parts.push(part);
  });
  return base[1] + "/" + parts.filter(Boolean).join("/");
}

function responseCharset_(headers) {
  const type = String(headers["Content-Type"] || headers["content-type"] || "");
  const match = type.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  const charset = String(match && match[1] || "UTF-8").toLowerCase();
  if (/^(?:euc-kr|ks_c_5601-1987|windows-949|cp949)$/.test(charset)) return "EUC-KR";
  return /^(?:utf-8|utf8)$/.test(charset) ? "UTF-8" : "UTF-8";
}

function fetchPromotionPage_(value) {
  let url = safePromotionPageUrl_(value);
  let triedHttps = false;
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = UrlFetchApp.fetch(url, {
      method: "get",
      followRedirects: false,
      muteHttpExceptions: true,
      validateHttpsCertificates: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NurimProgramReader/1.1; +https://example.org/)",
        "Accept": "text/html,application/xhtml+xml,application/pdf,image/*;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5"
      }
    });
    const code = response.getResponseCode();
    if ([301, 302, 303, 307, 308].indexOf(code) >= 0) {
      const headers = response.getHeaders();
      const location = headers.Location || headers.location;
      if (!location) throw new Error("공지 페이지 이동 주소를 확인할 수 없습니다.");
      url = safePromotionPageUrl_(resolvePageUrl_(url, location));
      continue;
    }
    if ((code < 200 || code >= 300) && /^http:\/\//i.test(url) && !triedHttps) {
      triedHttps = true;
      url = safePromotionPageUrl_(url.replace(/^http:\/\//i, "https://"));
      continue;
    }
    return { response: response, url: url };
  }
  return { response: response, url: url };
}

function extractPromotionDraftFromUrl_(value) {
  const fetched = fetchPromotionPage_(value);
  const response = fetched.response;
  if (!response) throw new Error("공지 페이지를 열지 못했습니다.");
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("공지 페이지를 열지 못했습니다(응답 코드 " + code + "). 공개 주소인지, 기관 홈페이지가 외부 자동 열람을 차단하지 않았는지 확인해 주세요.");
  }
  const headers = response.getHeaders();
  const contentType = String(headers["Content-Type"] || headers["content-type"] || "").split(";")[0].toLowerCase();
  if (/^image\//.test(contentType) || contentType === "application/pdf") {
    const blob = response.getBlob();
    if (blob.getBytes().length > 10 * 1024 * 1024) throw new Error("링크 문서는 10MB 이하만 읽을 수 있습니다.");
    return extractPromotionDraft_({
      name: "공지 첨부문서",
      dataUrl: "data:" + contentType + ";base64," + Utilities.base64Encode(blob.getBytes())
    });
  }
  const text = htmlText_(response.getContentText(responseCharset_(headers))).slice(0, 30000);
  if (text.length < 20) throw new Error("공지 페이지에서 읽을 수 있는 내용을 찾지 못했습니다. 로그인이나 자바스크립트 실행이 필요한 페이지는 홍보지 파일을 이용해 주세요.");
  return { ok: true, rawText: text, draft: promotionDraftFromText_(text), sourceUrl: fetched.url };
}

function findGoogleFormResponseSheet_(spreadsheet, preferredColumnName) {
  const wanted = String(preferredColumnName || "설문 확인번호").replace(/\s+/g, "");
  const sheets = spreadsheet.getSheets();
  for (let index = 0; index < sheets.length; index += 1) {
    const candidate = sheets[index];
    const lastColumn = candidate.getLastColumn();
    if (lastColumn < 1) continue;
    const headers = candidate.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) { return String(value).trim(); });
    const tokenColumn = headers.findIndex(function(value) { return value.replace(/\s+/g, "") === wanted; });
    if (tokenColumn >= 0) return { sheet: candidate, sheetName: candidate.getName(), tokenColumnName: headers[tokenColumn] };
  }
  return null;
}

function autoDetectGoogleFormConfig_(formValue) {
  const formUrl = safePromotionPageUrl_(formValue);
  if (!/(?:docs\.google\.com\/forms|forms\.gle)\//i.test(formUrl)) throw new Error("Google Form 주소를 확인해 주세요.");
  let resolvedUrl = formUrl;
  try {
    const response = UrlFetchApp.fetch(formUrl, { method: "get", followRedirects: true, muteHttpExceptions: true });
    const html = response.getContentText("UTF-8");
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i);
    if (canonical && /^https:\/\/docs\.google\.com\/forms\//i.test(canonical[1])) resolvedUrl = canonical[1].replace(/&amp;/g, "&");
  } catch (error) {}
  let form;
  try { form = FormApp.openByUrl(resolvedUrl); }
  catch (error) { throw new Error("이 Google Form을 열 권한이 없습니다. Form을 최고관리자 Google 계정에 편집자로 공유해 주세요."); }
  let tokenItem = null;
  const items = form.getItems();
  for (let index = 0; index < items.length; index += 1) {
    if (String(items[index].getTitle() || "").replace(/\s+/g, "") === "설문확인번호") {
      if (items[index].getType() !== FormApp.ItemType.TEXT) throw new Error("‘설문 확인번호’ 질문은 단답형이어야 합니다.");
      tokenItem = items[index].asTextItem();
      tokenItem.setRequired(true).setHelpText("자동으로 입력됩니다. 수정하지 마세요.");
      break;
    }
  }
  if (!tokenItem) tokenItem = form.addTextItem().setTitle("설문 확인번호").setHelpText("자동으로 입력됩니다. 수정하지 마세요.").setRequired(true);
  let spreadsheetId = String(form.getDestinationId() || "");
  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create(form.getTitle() + " 응답");
    spreadsheetId = spreadsheet.getId();
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheetId);
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  SpreadsheetApp.flush();
  const responseSheet = findGoogleFormResponseSheet_(spreadsheet, "설문 확인번호");
  const sheet = responseSheet && responseSheet.sheet ? responseSheet.sheet : spreadsheet.getSheets()[0];
  const prefilled = form.createResponse().withItemResponse(tokenItem.createResponse("nurim-token-preview")).toPrefilledUrl();
  const entryMatch = prefilled.match(/[?&](entry\.\d+)=/);
  if (!entryMatch) throw new Error("신청서 확인번호 연결값을 만들지 못했습니다.");
  return { ok: true, formUrl: form.getPublishedUrl(), formFileId: form.getId(), formEditUrl: form.getEditUrl(), tokenEntry: entryMatch[1], spreadsheetId: spreadsheetId, spreadsheetUrl: spreadsheet.getUrl(), sheetName: sheet.getName(), tokenColumnName: responseSheet ? responseSheet.tokenColumnName : "설문 확인번호" };
}

function checkSurveyFolderSetup() {
  const folderId = String(PropertiesService.getScriptProperties().getProperty("SURVEY_FOLDER_ID") || "").trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(folderId)) throw new Error("프로젝트 설정의 스크립트 속성에 SURVEY_FOLDER_ID를 등록해 주세요.");
  const folder = DriveApp.getFolderById(folderId);
  Logger.log("Google 신청서 Form 전용 폴더 연결 완료: " + folder.getName() + " / " + folder.getUrl());
  return folder.getUrl();
}

function checkGoogleFormFolderSetup() { return checkSurveyFolderSetup(); }

function createGoogleFormConfig_(body) {
  const programTitle = String(body && body.programTitle || "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  if (programTitle.length < 2 || programTitle.length > 100) throw new Error("프로그램명을 먼저 입력해 주세요.");
  const managerEmail = String(body && body.managerEmail || "").trim().toLowerCase();
  const targetFolderId = String(PropertiesService.getScriptProperties().getProperty("SURVEY_FOLDER_ID") || "").trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(targetFolderId)) throw new Error("최고관리자가 Apps Script 속성에 SURVEY_FOLDER_ID를 먼저 등록해야 합니다.");

  const root = DriveApp.getFolderById(targetFolderId);
  const programFolder = getOrCreateFolder_(root, safeName_(programTitle));
  const form = FormApp.create(programTitle + " 신청서");
  form.setDescription("프로그램 참여 후 신청서를 작성해 주세요. 설문 확인번호는 자동으로 입력됩니다.");
  form.setAcceptingResponses(true);
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  try { if (typeof form.setRequireLogin === "function") form.setRequireLogin(false); } catch (error) {}
  const tokenItem = form.addTextItem()
    .setTitle("설문 확인번호")
    .setHelpText("자동으로 입력됩니다. 수정하지 마세요.")
    .setRequired(true);

  const spreadsheet = SpreadsheetApp.create(programTitle + " 신청서 응답");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
  SpreadsheetApp.flush();
  DriveApp.getFileById(form.getId()).moveTo(programFolder);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(programFolder);

  let shareWarning = "";
  if (managerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
    try {
      DriveApp.getFileById(form.getId()).addEditor(managerEmail);
      DriveApp.getFileById(spreadsheet.getId()).addEditor(managerEmail);
    } catch (error) {
      shareWarning = "설문은 생성됐지만 담당자 Google 계정 공유는 제한됐습니다. 최고관리자가 파일 권한을 확인해 주세요.";
    }
  }

  const response = form.createResponse().withItemResponse(tokenItem.createResponse("nurim-token-preview"));
  const prefilled = response.toPrefilledUrl();
  const entryMatch = prefilled.match(/[?&](entry\.\d+)=/);
  if (!entryMatch) throw new Error("설문은 생성됐지만 확인번호 연결값을 만들지 못했습니다.");
  const responseSheet = findGoogleFormResponseSheet_(spreadsheet, "설문 확인번호");
  const sheet = responseSheet && responseSheet.sheet ? responseSheet.sheet : spreadsheet.getSheets()[0];
  return {
    ok: true,
    formUrl: form.getPublishedUrl(),
    formFileId: form.getId(),
    formEditUrl: form.getEditUrl(),
    tokenEntry: entryMatch[1],
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: sheet.getName(),
    tokenColumnName: responseSheet ? responseSheet.tokenColumnName : "설문 확인번호",
    folderUrl: programFolder.getUrl(),
    shareWarning: shareWarning
  };
}

function updateGoogleFormEditors_(body) {
  const formFileId = String(body && body.formFileId || "").trim();
  const spreadsheetId = String(body && body.spreadsheetId || "").trim();
  const newEmail = String(body && body.newEmail || "").trim().toLowerCase();
  const oldEmail = String(body && body.oldEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("새 담당자 이메일을 확인해 주세요.");
  const ids = [formFileId, spreadsheetId].filter(function(id, index, values) {
    return /^[a-zA-Z0-9_-]{10,}$/.test(id) && values.indexOf(id) === index;
  });
  if (!ids.length) return { ok: true, updated: 0, warning: "자동 생성된 Google 설문 파일정보가 없어 공유 변경을 건너뛰었습니다." };
  let updated = 0;
  const warnings = [];
  ids.forEach(function(id) {
    try {
      const file = DriveApp.getFileById(id);
      file.addEditor(newEmail);
      if (oldEmail && oldEmail !== newEmail) {
        try { file.removeEditor(oldEmail); } catch (removeError) { warnings.push("이전 담당자 권한은 최고관리자가 확인해 주세요."); }
      }
      updated += 1;
    } catch (error) {
      warnings.push("일부 Google 파일의 담당자 공유를 갱신하지 못했습니다.");
    }
  });
  return { ok: true, updated: updated, warning: warnings.filter(function(value, index, values) { return values.indexOf(value) === index; }).join(" ") };
}

function verifyGoogleFormToken_(body) {
  const spreadsheetId = String(body.spreadsheetId || "").trim();
  const sheetName = String(body.sheetName || "설문지 응답 1").trim();
  const tokenColumnName = String(body.tokenColumnName || "설문 확인번호").trim();
  const token = String(body.token || "").trim().toLowerCase();
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return { ok: false, error: "올바른 설문 확인정보가 아닙니다." };
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    const detected = findGoogleFormResponseSheet_(spreadsheet, tokenColumnName);
    sheet = detected && detected.sheet;
  }
  if (!sheet) return { ok: false, error: "Google Form 응답 Sheet에서 확인번호 열을 찾지 못했습니다." };
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastColumn < 1 || lastRow < 2) return { ok: true, verified: false };
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) { return String(value).trim(); });
  const tokenColumn = headers.indexOf(tokenColumnName);
  if (tokenColumn < 0) return { ok: false, error: "응답 Sheet에서 확인번호 열을 찾지 못했습니다: " + tokenColumnName };
  const finder = sheet.getRange(2, tokenColumn + 1, lastRow - 1, 1)
    .createTextFinder(token)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();
  if (!finder) return { ok: true, verified: false };
  const timestamp = sheet.getRange(finder.getRow(), 1).getValue();
  return {
    ok: true,
    verified: true,
    submittedAt: timestamp instanceof Date
      ? Utilities.formatDate(timestamp, Session.getScriptTimeZone() || "Asia/Seoul", "yyyy-MM-dd'T'HH:mm:ssXXX")
      : String(timestamp || "")
  };
}


function normalizePromotionText_(text) {
  let normalized = String(text || "").replace(/\r/g, "").replace(/[｜│]/g, "|").replace(/[：﹕]/g, ":")
    .replace(/[〜～]/g, "~").replace(/[‐‑‒–—]/g, "-").replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  const labels = [
    ["프\\s*로\\s*그\\s*램\\s*명", "프로그램명"], ["사\\s*업\\s*명", "사업명"], ["강\\s*좌\\s*명", "프로그램명"], ["교\\s*육\\s*명", "프로그램명"], ["행\\s*사\\s*명", "프로그램명"],
    ["(?:활\\s*동|교\\s*육|운\\s*영|진\\s*행|사\\s*업|수\\s*업|강\\s*의|행\\s*사|실\\s*시|여\\s*행|프\\s*로\\s*그\\s*램)\\s*(?:기\\s*간|일\\s*정|일\\s*시)", "활동기간"],
    ["(?:활\\s*동|교\\s*육|운\\s*영|진\\s*행|수\\s*업|강\\s*의|행\\s*사|실\\s*시|프\\s*로\\s*그\\s*램)\\s*시\\s*간", "활동시간"],
    ["(?:활\\s*동|교\\s*육|운\\s*영|진\\s*행)\\s*장\\s*소", "활동장소"],
    ["(?:활\\s*동|모\\s*집|참\\s*여|선\\s*발)\\s*인\\s*원", "활동인원"],
    ["(?:활\\s*동|교\\s*육|프\\s*로\\s*그\\s*램|주\\s*요|세\\s*부)\\s*내\\s*용", "활동내용"],
    ["(?:모\\s*집|참\\s*여|신\\s*청|이\\s*용|지\\s*원)\\s*(?:대\\s*상|자\\s*격)", "모집대상"],
    ["(?:모\\s*집|신\\s*청|접\\s*수)\\s*(?:기\\s*간|일\\s*정)", "모집기간"],
    ["(?:신\\s*청|접\\s*수)\\s*방\\s*법", "신청방법"], ["(?:선\\s*정|선\\s*발)\\s*방\\s*법", "선정방법"],
    ["(?:선\\s*정|선\\s*발)\\s*발\\s*표", "선정발표"], ["공\\s*개\\s*추\\s*첨", "공개추첨"],
    ["(?:이\\s*용\\s*료|참\\s*가\\s*비|참\\s*여\\s*비|수\\s*강\\s*료|재\\s*료\\s*비|자\\s*부\\s*담|비\\s*용)", "이용료"],
    ["(?:문\\s*의\\s*사\\s*항|문\\s*의\\s*처|담\\s*당\\s*자\\s*연\\s*락\\s*처)", "문의사항"], ["문\\s*의", "문의"],
    ["준\\s*비\\s*물", "준비물"], ["참\\s*고\\s*사\\s*항", "참고사항"], ["유\\s*의\\s*사\\s*항", "유의사항"]
  ];
  labels.forEach(function(pair) { normalized = normalized.replace(new RegExp(pair[0], "g"), pair[1]); });
  return normalized;
}

function validIsoDate_(year, month, day) {
  year = Number(year); month = Number(month); day = Number(day);
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return year + "-" + ("0" + month).slice(-2) + "-" + ("0" + day).slice(-2);
}

function cleanPromotionFieldValue_(value) {
  const nextLabel = /\s+(?=(?:프로그램명|사업명|모집기간|활동기간|활동시간|활동장소|활동인원|활동내용|모집대상|이용료|문의사항|문의|정원|신청방법|선정방법|선정발표|공개추첨|준비물|참고사항|유의사항)\s*(?::|[|])?)/i;
  return String(value || "").split(nextLabel)[0].replace(/^[\s:|\-–—]+|[\s|]+$/g, "").trim();
}

function normalizedCompareKey_(value) {
  return String(value || "").toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
}

function looksLikeProgramTitle_(value) {
  const title = cleanPromotionFieldValue_(value);
  if (title.length < 3 || title.length > 70) return false;
  if (/(?:모집|신청|접수|운영|활동|교육|여행)?\s*(?:기간|일정|일시|대상|방법|장소|인원|내용|문의|연락처|이용료|참가비|정원)\s*:?/i.test(title)) return false;
  if (/20\d{2}\s*년|20\d{2}[.\/-]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}:\d{2}|\d+\s*박\s*\d+\s*일/.test(title)) return false;
  if (/0\d{1,2}[- )]?\d{3,4}[- ]?\d{4}|https?:\/\/|@|\d[\d,]*\s*원/.test(title)) return false;
  return true;
}

function normalizePromotionFee_(value, fullText) {
  const candidate = cleanPromotionFieldValue_(value).replace(/\s+/g, " ");
  if (/^(?:문의|별도\s*문의|전화\s*문의|담당자\s*문의)$/i.test(candidate)) return "";
  if (/무료|무\s*료/.test(candidate)) return "무료";
  const amount = candidate.match(/(?:(?:월|회당|1회|총)\s*)?\d[\d,]*(?:\s*원)(?:\s*\([^\n)]{1,30}\))?/);
  if (amount) return amount[0].replace(/\s+/g, " ").trim();
  const feeLine = normalizePromotionText_(fullText).split("\n").find(function(line) { return /(?:이용료|참가비|참여비|수강료|비용)/.test(line); }) || "";
  if (/무료|무\s*료/.test(feeLine)) return "무료";
  const fallback = feeLine.match(/(?:(?:월|회당|1회|총)\s*)?\d[\d,]*(?:\s*원)(?:\s*\([^\n)]{1,30}\))?/);
  return fallback ? fallback[0].replace(/\s+/g, " ").trim() : "";
}

function extractPromotionActivitySection_(text) {
  const lines = normalizePromotionText_(text).split("\n").map(function(line) { return line.trim(); });
  const start = /^(?:활동내용)\s*(?::|[|])?\s*/;
  const stop = /^(?:모집대상|모집기간|신청방법|선정방법|선정발표|공개추첨|이용료|문의사항|문의|활동기간|활동시간|활동장소|활동인원|준비물|참고사항|유의사항)\b/;
  const result = [];
  let collecting = false;
  for (const line of lines) {
    if (!collecting && start.test(line)) {
      collecting = true;
      const remainder = line.replace(start, "").trim();
      if (remainder) result.push(remainder);
      continue;
    }
    if (!collecting) continue;
    if (stop.test(line)) break;
    if (line) result.push(line);
  }
  return result;
}

function summarizeProgramActivities_(text, metadataValues) {
  const clean = normalizePromotionText_(text);
  if (!clean) return "";
  const section = extractPromotionActivitySection_(clean);
  const excludedLabel = /(모집기간|신청방법|접수방법|문의|연락처|전화|이용료|모집대상|정원|활동인원|개인정보|제출서류|선정방법|홈페이지|이메일|활동장소|활동시간|활동기간|준비물|프로그램명|사업명|(?:참여자|이용자)\s*모집|사회복지법인|재단법인|사단법인|복지재단|복지관|주최|주관|후원|협찬)/;
  const activity = /(활동|운동|교육|교실|체험|상담|훈련|지도|연습|복습|관람|여행|프로그램|강의|만들기|치료|지원|놀이|요리|베이킹|쿠키|빵|브레드|머핀|케이크|파이|미술|음악|체육|배드민턴|수영|문화|여가|공연|캠프|동아리|나들이|견학|학습|실습|소통|휴식)/;
  const metadataKeys = (metadataValues || []).map(normalizedCompareKey_).filter(function(key) { return key.length >= 5; });
  const source = section.length ? section : clean.split(/\n+|(?<=[.!?。])\s+/);
  const candidates = source
    .map(function(value) { return value.replace(/^[\s＊*•·▪■□▶▷:|\-–—]+/, "").replace(/\s+/g, " ").trim(); })
    .filter(function(value) {
      if (value.length < 3 || value.length > 220 || excludedLabel.test(value) || (/사업$/.test(value) && value.length <= 35)) return false;
      if (!section.length && !activity.test(value)) return false;
      if (/20\d{2}\s*년|20\d{2}[.\/-]\d|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}:\d{2}|0\d{1,2}[- )]?\d{3,4}[- ]?\d{4}|https?:\/\/|\S+@\S+|\d[\d,]*\s*원/.test(value)) return false;
      const key = normalizedCompareKey_(value);
      return !metadataKeys.some(function(meta) { return key === meta || key.indexOf(meta) >= 0 || meta.indexOf(key) >= 0; });
    });
  const unique = [];
  candidates.forEach(function(value) {
    if (unique.length >= 5) return;
    const key = normalizedCompareKey_(value).slice(0, 80);
    if (key && !unique.some(function(item) { return item.key === key || item.key.indexOf(key) >= 0 || key.indexOf(item.key) >= 0; })) unique.push({ key: key, value: value });
  });
  return unique.map(function(item) { return "• " + item.value; }).join("\n");
}

function combineProgramDescription_(activities, extras) {
  const rows = [];
  (extras || []).forEach(function(item) {
    const value = cleanPromotionFieldValue_(item && item.value);
    if (value) rows.push("• " + item.label + ": " + value);
  });
  String(activities || "").split("\n").filter(Boolean).forEach(function(row) { rows.push(row); });
  const seen = {};
  return rows.filter(function(row) {
    const key = normalizedCompareKey_(row);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 9).join("\n");
}

function promotionDraftFromText_(text) {
  const clean = normalizePromotionText_(text);
  const lines = clean.split("\n").map(function(line) { return line.trim(); }).filter(function(line) { return line && normalizedCompareKey_(line); });
  const labeled = function(pattern) {
    const found = clean.match(new RegExp("(?:^|\\n)\\s*(?:" + pattern + ")\\s*(?::|[|])?\\s*([^\\n|]+)", "i"));
    return found ? cleanPromotionFieldValue_(found[1].replace(/^[-]\s*/, "")) : "";
  };
  const labeledAll = function(pattern) {
    const values = [];
    const expression = new RegExp("(?:^|\\n)\\s*(?:" + pattern + ")\\s*(?::|[|])?\\s*([^\\n|]+)", "ig");
    let found;
    while ((found = expression.exec(clean))) {
      const value = cleanPromotionFieldValue_(found[1].replace(/^[-]\s*/, ""));
      const key = normalizedCompareKey_(value);
      if (value && key && !values.some(function(item) { return normalizedCompareKey_(item) === key; })) values.push(value);
    }
    return values;
  };
  const ranges = [];
  const rangePattern = /(20\d{2})\s*(?:년|[.\/-])\s*(\d{1,2})\s*(?:월|[.\/-])\s*(\d{1,2})\s*일?\s*[.]?\s*(?:\([^)]*\))?\s*(?:~|-)\s*(?:(20\d{2})\s*(?:년|[.\/-])\s*)?(?:(\d{1,2})\s*(?:월|[.\/-])\s*)?(\d{1,2})\s*일?\s*[.]?/g;
  let match;
  while ((match = rangePattern.exec(clean))) {
    const sy = Number(match[1]), sm = Number(match[2]);
    const before = clean.slice(Math.max(0, match.index - 80), match.index);
    const labelContext = before.slice(before.lastIndexOf("\n") + 1);
    ranges.push({ raw: match[0].trim(), start: validIsoDate_(sy, sm, match[3]), end: validIsoDate_(match[4] || sy, match[5] || sm, match[6]),
      kind: /(모집|신청|접수)/.test(labelContext) ? "recruitment" : /(운영|교육|활동|여행|진행|일정)/.test(labelContext) ? "schedule" : "unknown" });
  }

  let title = labeled("프로그램\\s*명|사업\\s*명|강좌\\s*명|교육\\s*명|행사\\s*명");
  if (!title) {
    const recruitHeadingIndex = lines.findIndex(function(line) { return /(?:참여자|이용자)\s*모집/.test(line); });
    if (recruitHeadingIndex >= 0) {
      let heading = lines[recruitHeadingIndex].replace(/^\s*20\d{2}년\s*(?:상|하)반기?\s*/, "").replace(/\s*(?:참여자|이용자)\s*모집.*$/, "").trim();
      const previous = recruitHeadingIndex > 0 ? lines[recruitHeadingIndex - 1].replace(/^\s*20\d{2}년\s*(?:상|하)반기?\s*/, "").trim() : "";
      if (previous && !/(기간|일정|인원|대상|방법|장소|문의|이용료)/.test(previous) && (heading.length < 12 || /반$/.test(heading))) heading = previous + " " + heading;
      title = heading;
    }
  }
  if (!looksLikeProgramTitle_(title)) title = "";
  if (!title) {
    const quoted = clean.match(/[‘'“"]([^’'”"\n]{3,60})[’'”"]/);
    if (quoted && looksLikeProgramTitle_(quoted[1])) title = quoted[1].trim();
  }
  if (!title) {
    const candidates = lines.filter(looksLikeProgramTitle_);
    title = candidates.find(function(line) { return /(여행|교실|프로그램|활동|강좌|교육|모임|축제|캠프|대회|나들이|베이킹|요리|쿠키|체험|지원)/.test(line) && !/지원사업$/.test(line); }) || candidates[0] || "";
  }
  title = cleanPromotionFieldValue_(title).replace(/^\s*20\d{2}년\s*/, "").replace(/\s*(?:참여자|이용자)?\s*모집\s*$/, "").replace(/^[_\s]+|[_\s]+$/g, "").trim();
  if (!looksLikeProgramTitle_(title)) title = "";

  let audience = labeled("모집대상|참여\\s*대상|지원\\s*대상|신청\\s*자격|이용\\s*대상|대상자|대상");
  if (!audience || /20\d{2}.*[~-]/.test(audience)) {
    audience = lines.find(function(line) { return /(장애인|보호자|가족|지역주민|아동|청소년|성인|누구나)/.test(line) && /(거주|대상|가족|\d+\s*명|누구나)/.test(line) && !/(지원사업|프로그램명|개인정보)/.test(line); }) || audience;
  }
  audience = cleanPromotionFieldValue_(String(audience || "").replace(/^\s*(?:모집\s*대상|참여\s*대상)\s*:?\s*/, "").replace(/[,\s]+$/, "")).slice(0, 180);
  const phoneLine = lines.find(function(line) { return /(문의|연락처|담당)/.test(line) && /0\d{1,2}[- )]?\d{3,4}[- ]?\d{4}/.test(line); }) || clean;
  const phoneMatch = phoneLine.match(/(?:0\d{1,2})[- )]?\d{3,4}[- ]?\d{4}/);
  let capacityMatch = clean.match(/(?:정원|활동인원|모집\s*인원|모집인원|선발\s*인원|모집\s*정원)\s*:?\s*(?:총\s*)?(\d+)\s*(?:명|가족|팀)/i);
  if (!capacityMatch && audience) capacityMatch = audience.match(/(?:총\s*)?(\d+)\s*명(?:\s*(?:모집|선정))?\s*$/);
  if (capacityMatch) audience = audience.replace(new RegExp("\\s*" + capacityMatch[1] + "\\s*명(?:\\s*(?:모집|선정))?\\s*$"), "").replace(/[,\\s]+$/, "").trim();

  const feeRaw = labeled("이용료|참가비|참여비|수강료|재료비|자부담|비용");
  const fee = normalizePromotionFee_(feeRaw, clean);
  const activityPeriods = labeledAll("활동기간|(?:운영|진행|교육|활동|여행|사업|수업|강의|행사|실시|프로그램)\\s*(?:기간|일정|일시)|일시");
  const activityTimes = labeledAll("활동시간|(?:운영|교육|진행|수업|강의|행사|실시|프로그램)\\s*시간|요일");
  const activityPlace = labeled("활동장소|장소");
  const materials = labeled("준비물");
  const applicationMethod = labeled("신청방법|접수방법");
  const referenceNote = labeled("참고사항|유의사항|기타사항|비고");
  let scheduleParts = activityPeriods.concat(activityTimes);
  ranges.filter(function(item) { return item.kind === "schedule"; }).forEach(function(item) {
    const key = normalizedCompareKey_(item.raw);
    if (key && !scheduleParts.some(function(value) { const existing = normalizedCompareKey_(value); return existing.indexOf(key) >= 0 || key.indexOf(existing) >= 0; })) scheduleParts.push(item.raw);
  });
  scheduleParts = scheduleParts.filter(function(value, index, values) {
    const key = normalizedCompareKey_(value);
    return key && values.findIndex(function(other) { return normalizedCompareKey_(other) === key; }) === index;
  });
  let schedule = scheduleParts.join(" / ");
  const duration = clean.match(/\d+\s*박\s*\d+\s*일/);
  if (duration && schedule && schedule.indexOf(duration[0]) < 0) schedule += ", " + duration[0];
  schedule = cleanPromotionFieldValue_(schedule).slice(0, 250);

  const ageGroup = /아동|초등/.test(audience) ? "아동" : /청소년|중학생|고등학생/.test(audience) ? "청소년" : /성인|어머니|아버지|부모|보호자/.test(audience) ? "성인" : /(전\s*연령|누구나|가족)/.test(audience) ? "전연령" : "";
  const selectionMethod = /추첨|배점/.test(clean) ? "lottery" : /선착순/.test(clean) ? "first_come" : "open";
  const recruitment = ranges.find(function(item) { return item.kind === "recruitment"; }) || {};
  const activities = summarizeProgramActivities_(clean, [title, fee, phoneMatch ? phoneMatch[0] : "", audience, schedule, recruitment.raw || "", activityPlace, materials, applicationMethod, referenceNote]);
  const description = combineProgramDescription_(activities, [
    { label: "장소", value: activityPlace },
    { label: "준비물", value: materials },
    { label: "신청방법", value: applicationMethod },
    { label: "참고", value: referenceNote }
  ]);
  const warnings = [];
  if (!title) warnings.push("프로그램명");
  if (!recruitment.start || !recruitment.end) warnings.push("모집기간");
  if (!audience) warnings.push("참여대상");
  if (!phoneMatch) warnings.push("연락처");
  if (!description) warnings.push("프로그램 내용");
  return {
    title: title, fee: fee,
    contactPhone: phoneMatch ? phoneMatch[0] : "", audience: audience, capacity: capacityMatch ? Number(capacityMatch[1]) : "",
    selectionMethod: selectionMethod, startDate: recruitment.start || "", endDate: recruitment.end || "",
    schedule: schedule, description: description, ageGroup: ageGroup,
    warnings: warnings, recognitionQuality: Math.max(0, 100 - warnings.length * 16)
  };
}





/** v78 integrated survey: callers are authenticated by doPost's shared secret. */
function nurimSurveyRoute_(b) {
  var protocol="nurim-survey-v78";
  var folderId=String(b.targetFolderId||"");
  if(!/^[a-zA-Z0-9_-]{10,}$/.test(folderId))throw new Error("기관 Drive 폴더가 필요합니다.");
  var root=DriveApp.getFolderById(folderId);
  if(b.action==="nurim-survey-health")return {ok:true,protocol:protocol,ready:true,capabilities:["application-extras-v87","web-consent-v90","individual-attachments-v101"]};
  if(!/^[a-f0-9-]{36}$/i.test(b.surveyId))throw new Error("설문 ID 오류");
  var folder=nurimTemplateFolder_(root,b.surveyId);
  var previous=getOrCreateFolder_(folder,"이전버전");
  var revision=Number(b.revision);
  if(!Number.isInteger(revision)||revision<1)throw new Error("버전 오류");
  var sheetFiles=folder.getFilesByName("설문응답");
  var book;
  if(sheetFiles.hasNext())book=SpreadsheetApp.openById(sheetFiles.next().getId());
  else{
    book=SpreadsheetApp.create("설문응답");
    DriveApp.getFileById(book.getId()).moveTo(folder);
    book.getSheets()[0].setName("안내").getRange(1,1).setValue("응답은 문항 업데이트별 탭으로 보존됩니다. 각 탭의 원본기록 열은 시스템용입니다.");
  }
  if(b.action==="nurim-survey-publish"){
    var latestRevision=book.getSheets().reduce(function(n,t){var m=t.getName().match(/^v(\d+)$/);return m?Math.max(n,Number(m[1])):n;},0);
    if(revision<latestRevision)throw new Error('최신 문항 버전으로 다시 배포해 주세요.');
    var name="빈설문지_v"+revision+".pdf";
    var files=folder.getFiles(),old=[];
    while(files.hasNext()){var f=files.next();if(/^빈설문지_v\d+\.pdf$/.test(f.getName())&&f.getName()!==name)old.push(f);}
    var pdf=nurimPdf_(folder,name,b.schema,null);
    old.forEach(function(f){f.moveTo(previous);});
    var tab=book.getSheetByName("v"+revision)||book.insertSheet("v"+revision);
    nurimHeaders_(tab,b.schema);
    var schemaName="문항_v"+revision+".json";
    if(!previous.getFilesByName(schemaName).hasNext())previous.createFile(schemaName,JSON.stringify(b.schema,null,2),MimeType.PLAIN_TEXT);
    return {ok:true,protocol:protocol,pdfUrl:pdf.getUrl(),folderUrl:folder.getUrl(),sheetUrl:book.getUrl()};
  }
  // Templates are shared; new response rows belong to the actual program only.
  if(b.action==="nurim-survey-responses")return nurimProgramResponses_(root,folder,book,b,protocol);
  var templateBook=book;
  var appId=b.record?b.record.id:b.application&&b.application.id;
  var legacyTab=templateBook.getSheetByName("v"+revision);
  var isLegacy=nurimHasApplication_(legacyTab,appId);
  if(!isLegacy&&(b.action==="nurim-survey-submit"||b.action==="nurim-survey-sync-basic")){
    if(!legacyTab)throw new Error("설문 배포본을 먼저 저장해 주세요.");
    var programId=b.program?b.program.id:b.application.program_id;
    var programTitle=b.program?b.program.title:b.application.program_title;
    var destination=nurimProgramFolderById_(root,programId);
    if(!destination){if(b.action!=="nurim-survey-submit")throw new Error("프로그램 신청 폴더를 찾을 수 없습니다.");destination=nurimProgramFolder_(root,folder,programId,programTitle,templateBook);}
    book=nurimResponseBook_(destination,b.surveyId,true);
    var responseTab=book.getSheetByName("v"+revision);
    if(!responseTab){
      if(b.action!=="nurim-survey-submit")throw new Error("Google 원본 응답이 없습니다.");
      responseTab=book.insertSheet("v"+revision);nurimHeaders_(responseTab,b.schema);
    }
  }
  var tab=book.getSheetByName("v"+revision);
  if(!tab)throw new Error("설문 배포본을 먼저 저장해 주세요.");
  if(b.action==="nurim-survey-submit"){
    var r=b.record;
    if(!r||!r.id||!r.name)throw new Error("신청 정보 오류");
    var ids=tab.getLastRow()>1?tab.getRange(2,1,tab.getLastRow()-1,1).getDisplayValues().map(function(x){return x[0];}):[];
    var idx=ids.indexOf(r.id),row=idx<0?tab.getLastRow()+1:idx+2;
    // Retry uses the original Google record after a partial success.
    if(idx>=0)r=JSON.parse(tab.getRange(row,10).getValue());
    var programFolder=nurimProgramFolder_(root,folder,b.program.id,b.program.title,book);
    var answersFolder=nurimApplicationFolder_(programFolder);
    var pdf=nurimPdf_(answersFolder,safeName_(r.name)+"_신청서_"+r.id+".pdf",b.schema,r);
    r.pdf_url=pdf.getUrl();
    if(b.file){r.uploads=nurimSaveAttachments_(answersFolder,b.file,safeName_(r.name)+'_첨부_'+r.id+'_');r.upload_url=r.uploads.length===1?r.uploads[0].url:answersFolder.getUrl();}
    var values=[r.id,r.created_at,r.program_title,r.name,r.birth,r.phone,r.status,r.queue,pdf.getUrl(),JSON.stringify(r)];
    b.schema.questions.filter(function(q){return q.type!=="notice";}).forEach(function(q){values.push(nurimAnswer_(q,r.answers[q.id]));});
    if(row>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),row-tab.getMaxRows());
    tab.getRange(row,1,1,values.length).setNumberFormat("@").setValues([values.map(nurimSafeCell_)]);
    SpreadsheetApp.flush();
    nurimProgramCsv_(programFolder,templateBook,r.program_title,b.program?b.program.id:b.application.program_id);
    return {ok:true,protocol:protocol,folderUrl:answersFolder.getUrl(),sheetUrl:book.getUrl(),pdfUrl:pdf.getUrl()};
  }

  if(b.action==="nurim-survey-sync-basic"){
    var app=b.application;
    var ids=tab.getLastRow()>1?tab.getRange(2,1,tab.getLastRow()-1,1).getDisplayValues().map(function(x){return x[0];}):[];
    var idx=ids.indexOf(app.id);if(idx<0)throw new Error("Google 원본 응답이 없습니다.");
    var row=idx+2,r=JSON.parse(tab.getRange(row,10).getValue());delete r.extra;
    r.name=app.applicant_name;r.phone=app.phone;r.birth=app.birth_date;
    r.status=["cancelled","deleted"].indexOf(app.lifecycle_status)>=0?app.lifecycle_status:app.application_status;
    r.last_action_at=app.last_action_at;
    var schemaFile=previous.getFilesByName("문항_v"+revision+".json");
    if(!schemaFile.hasNext())throw new Error("문항 원본을 확인할 수 없습니다.");
    var schema=JSON.parse(schemaFile.next().getBlob().getDataAsString("UTF-8"));
    var programFolder=nurimProgramFolder_(root,folder,app.program_id,r.program_title,book);
    var answersFolder=nurimApplicationFolder_(programFolder);
    var name=safeName_(r.name)+"_신청서_"+app.id+"_"+String(app.last_action_at).replace(/[^0-9]/g,"")+".pdf";
    var pdf=nurimPdf_(answersFolder,name,schema,r);
    if(r.pdf_url&&r.pdf_url!==pdf.getUrl()){
      var oldId=r.pdf_url.match(/\/d\/([\w-]+)/);
      if(oldId)DriveApp.getFileById(oldId[1]).moveTo(getOrCreateFolder_(answersFolder,"이전버전"));
    }
    r.pdf_url=pdf.getUrl();
    var values=[r.id,r.created_at,r.program_title,r.name,r.birth,r.phone,r.status,r.queue,pdf.getUrl(),JSON.stringify(r)];
    tab.getRange(row,1,1,10).setNumberFormat("@").setValues([values.map(nurimSafeCell_)]);
    SpreadsheetApp.flush();nurimProgramCsv_(programFolder,templateBook,r.program_title,app.program_id);
    return {ok:true,protocol:protocol,folderUrl:answersFolder.getUrl(),sheetUrl:book.getUrl()};
  }


  if(b.action==="nurim-survey-responses"){
    var offset=Math.max(0,Math.floor(Number(b.offset)||0)),total=Math.max(0,tab.getLastRow()-1),n=Math.min(200,Math.max(0,total-offset));
    var rows=n?tab.getRange(offset+2,10,n,1).getValues().map(function(x){return JSON.parse(x[0]);}):[];
    return {ok:true,protocol:protocol,rows:rows,total:total,nextOffset:offset+n<total?offset+n:null,sheetUrl:book.getUrl(),folderUrl:folder.getUrl()};
  }
  throw new Error("알 수 없는 설문 작업");
}
function nurimSafeCell_(v){var s=String(v==null?"":v);return /^[\s]*[=+@-]/.test(s)?"'"+s:s;}
function nurimHeaders_(tab,s){
  if(tab.getLastRow())return;
  var headers=["신청번호","신청일시","프로그램","이름","생년월일","연락처","접수상태","접수순번","출력 신청서","원본기록"];
  s.questions.filter(function(q){return q.type!=="notice";}).forEach(function(q){headers.push(q.label);});
  if(headers.length>tab.getMaxColumns())tab.insertColumnsAfter(tab.getMaxColumns(),headers.length-tab.getMaxColumns());
  tab.getRange(1,1,1,headers.length).setValues([headers.map(nurimSafeCell_)]).setFontWeight("bold");
  tab.setFrozenRows(1);tab.hideColumns(10);tab.autoResizeColumns(1,9);
}
function nurimAnswer_(q,a){
 if(q.type==="consent")return a==="agree"?"동의":a==="disagree"?"미동의":"";
 return Array.isArray(a)?a.map(function(v,i){return q.type==="rank"?(i+1)+"순위 "+v:v;}).join(" / "):String(a==null?"":a);
}
function nurimPdf_(folder,name,s,r){
 if(r&&r.pdf_url&&name.endsWith("_"+r.id+".pdf")){var oldId=r.pdf_url.match(/\/d\/([\w-]+)/);if(oldId){var oldPdf=DriveApp.getFileById(oldId[1]);oldPdf.setName(name);return oldPdf;}}
 var existing=folder.getFilesByName(name);if(existing.hasNext())return existing.next();
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const answerText=(q,a)=>q.type==="consent"?(a==="agree"?"동의":a==="disagree"?"미동의":""):Array.isArray(a)?a.map((v,i)=>q.type==="rank"?(i+1)+"순위 "+v:v).join(" / "):String(a??"");
 function printHTML(s,record){
 const basic=record?'<div>이름: '+esc(record.name)+'</div><div>생년월일: '+esc(record.birth.replace(/(\d{4})-(\d{2})-(\d{2})/,"$1년 $2월 $3일"))+'</div><div>연락처: '+esc(record.phone)+'</div>':'<div>이름: __________________</div><div>생년월일: ______년 ___월 ___일</div><div>연락처: __________________</div>';
 let pageNumber=1,questionNumber=0;
 const pageDivider=(title,help)=>'<section class="surveyPageDivider"><h2>'+esc(pageNumber+'페이지'+(title?' · '+title:''))+'</h2>'+(help?'<p>'+esc(help)+'</p>':'')+'</section>';
 const items=s.questions.map((q,i)=>{
  if(q.pageBreakBefore)pageNumber++;
  const pageTitle=q.type==='notice'&&(String(q.id||'').startsWith('page_')||q.pageBreakBefore);
  if(pageTitle)return pageDivider(q.label,q.help);
  const divider=q.pageBreakBefore?pageDivider('',''):'';
  if(q.type==='notice')return divider+'<section class="question wide surveyNotice"><strong>'+esc(q.label)+'</strong>'+(q.help?'<p>'+esc(q.help)+'</p>':'')+'</section>';
  questionNumber++;
  const a=record?answerText(q,record.answers[q.id]):q.type==="date"?"______년 ___월 ___일":q.type==="consent"?"□ 동의   □ 미동의":q.options?.length?q.options.map((o,n)=>(q.type==="rank"?"("+ (n+1) +"순위) ":"□ ")+o).join("    "):q.type==="notice"?"":"________________________________________________________________";
  const long=q.type==="textarea"||q.help.length>70||q.label.length>45||(q.options||[]).join("").length>60||a.length>70;
  return divider+'<section class="question '+(long?"wide":"")+'"><strong>'+esc(questionNumber+". "+q.label)+(q.required?" *":"")+'</strong>'+(q.help?'<p>'+esc(q.help)+'</p>':"")+'<div class="answer">'+esc(a)+'</div></section>';
 }).join("");
 return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>'+esc(s.title)+'</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:Arial,"Malgun Gothic",sans-serif;color:#183b38;font-size:10pt;line-height:1.65}h1{font-size:19pt}p{white-space:pre-wrap;overflow-wrap:anywhere}.basic,.questions{display:flex;flex-wrap:wrap;gap:10px}.basic{padding:12px;border:1px solid #8ea9a3;font-size:9pt}.basic>div{flex:1 1 160px}.question{flex:1 1 45%;border-bottom:1px solid #a9bcb6;padding:10px 0;break-inside:avoid;min-width:0;overflow-wrap:anywhere}.question.wide{flex-basis:100%}.surveyPageDivider{flex:0 0 100%;width:100%;border-top:2px solid #507f72;margin-top:12px;padding:10px 0 2px;break-inside:avoid;break-after:avoid;page-break-after:avoid}.surveyPageDivider h2{font-size:12pt;margin:0 0 4px}.surveyPageDivider p{font-size:10pt;margin:0}.surveyNotice{break-after:avoid}.question p{font-size:9pt;margin:4px 0}.answer{white-space:pre-wrap;min-height:28px}.question:has(.answer:empty){break-inside:auto}@media print{button{display:none}}</style><body><button onclick="window.print()">인쇄 / PDF 저장</button><h1>'+esc(s.title)+'</h1><p>'+esc(s.description)+'</p><div class="basic">'+basic+'</div><div class="questions">'+items+'</div></body></html>';
}
 var html=printHTML(s,r).replace(/<button[\s\S]*?<\/button>/g,"");
 var blob=HtmlService.createHtmlOutput(html).getAs(MimeType.PDF).setName(name);
 return folder.createFile(blob);
}
function nurimCsv_(folder,book,programTitle,programId){
 var lines=[["신청번호","신청일시","프로그램","이름","생년월일","연락처","접수상태","접수순번","신청서","문항버전"]];
 book.getSheets().filter(function(s){return /^v\d+$/.test(s.getName());}).forEach(function(s){
  if(s.getLastRow()<2)return;
  s.getRange(2,1,s.getLastRow()-1,10).getDisplayValues().forEach(function(r){var original={};try{original=JSON.parse(r[9]);}catch(e){}if(!programId||(original.program_id?original.program_id===programId:r[2]===programTitle))lines.push(r.slice(0,9).concat(s.getName()));});
 });
 var csv="\ufeff"+lines.map(function(r){return r.map(function(v){return '"'+nurimSafeCell_(v).replace(/"/g,'""')+'"';}).join(",");}).join("\r\n");
 var files=folder.getFilesByName("전체신청명단.csv");
 if(files.hasNext())files.next().setContent(csv);else folder.createFile("전체신청명단.csv",csv,MimeType.CSV);
}


function authorizeNurimSurveyV78() {
 var blob=HtmlService.createHtmlOutput('<html><meta charset="utf-8"><body>누림 설문 PDF 변환 점검</body></html>').getAs(MimeType.PDF);
 if(!blob.getBytes().length)throw new Error('PDF 변환 결과를 확인해 주세요.');
 return 'PDF 변환 확인 완료. Google 문서 생성은 사용하지 않습니다.';
}

function nurimProgramFolder_(root,surveyFolder,id,title,book){
 var marker='nurim-program:'+id,folders=root.getFolders(),target=null,migrated=false;
 while(folders.hasNext()){var f=folders.next();if(f.getDescription()===marker){target=f;break;}}
 if(!target){var old=surveyFolder.getFoldersByName('프로그램_'+id);if(old.hasNext()){target=old.next();target.moveTo(root);migrated=true;}else target=root.createFolder(safeName_(title)+' ['+id+']');target.setDescription(marker);}
 var name=safeName_(title)+' ['+id+']';if(target.getName()!==name)target.setName(name);
 if(migrated&&book){book.getSheets().filter(function(t){return /^v\d+$/.test(t.getName())&&t.getLastRow()>1;}).forEach(function(t){t.getRange(2,10,t.getLastRow()-1,1).getValues().forEach(function(row){var r;try{r=JSON.parse(row[0]);}catch(e){return;}if(r.program_id?r.program_id!==id:r.program_title!==title)return;var m=String(r.pdf_url||'').match(/\/d\/([\w-]+)/);if(m)DriveApp.getFileById(m[1]).setName(safeName_(r.name)+'_신청서_'+r.id+'.pdf');});});}
 return target;
}
function nurimApplicationFolder_(programFolder){var old=programFolder.getFoldersByName('작성된신청서');var current=programFolder.getFoldersByName('신청서 모음');if(current.hasNext())return current.next();if(old.hasNext()){var f=old.next();f.setName('신청서 모음');return f;}return programFolder.createFolder('신청서 모음');}

/** v91: one response destination per program; template folder contains reusable originals. */
function nurimTemplateFolder_(root,id){
 var management=getOrCreateFolder_(root,"설문 양식 관리");
 var old=root.getFoldersByName("설문_"+id);
 if(old.hasNext()){var existing=old.next();existing.moveTo(management);return existing;}
 return getOrCreateFolder_(management,"설문_"+id);
}
function nurimProgramFolderById_(root,id){var items=root.getFolders();while(items.hasNext()){var f=items.next();if(f.getDescription()==="nurim-program:"+id)return f;}return null;}
function nurimHasApplication_(tab,id){return !!(tab&&id&&tab.getLastRow()>1&&tab.getRange(2,1,tab.getLastRow()-1,1).getDisplayValues().some(function(r){return r[0]===id;}));}
function nurimResponseBook_(folder,id,create){
 var name="설문응답_"+id,files=folder.getFilesByName(name);
 if(files.hasNext())return SpreadsheetApp.openById(files.next().getId());
 if(!create)return null;
 var book=SpreadsheetApp.create(name);DriveApp.getFileById(book.getId()).moveTo(folder);
 book.getSheets()[0].setName("안내").getRange(1,1).setValue("이 프로그램에 제출된 신청서만 저장됩니다. 문항 버전별 탭에서 확인하세요.");return book;
}
function nurimProgramResponses_(root,folder,legacy,b,protocol){
 var books=[legacy],items=root.getFolders();
 while(items.hasNext()){var f=items.next();if(String(f.getDescription()).indexOf("nurim-program:")!==0)continue;var book=nurimResponseBook_(f,b.surveyId,false);if(book)books.push(book);}
 var rows=[],seen={};books.forEach(function(book){var tab=book.getSheetByName("v"+Number(b.revision));if(!tab||tab.getLastRow()<2)return;tab.getRange(2,10,tab.getLastRow()-1,1).getValues().forEach(function(x){var r=JSON.parse(x[0]);if(!seen[r.id]){seen[r.id]=true;rows.push(r);}});});
 rows.sort(function(a,b){return String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id));});
 var offset=Math.max(0,Math.floor(Number(b.offset)||0)),end=Math.min(rows.length,offset+200);
 return {ok:true,protocol:protocol,rows:rows.slice(offset,end),total:rows.length,nextOffset:end<rows.length?end:null,sheetUrl:books.length===2?books[1].getUrl():undefined,folderUrl:root.getUrl()};
}
function nurimProgramCsv_(folder,legacy,title,id){
 var books=[legacy],files=folder.getFiles();
 while(files.hasNext()){var f=files.next();if(/^설문응답_[a-f0-9-]{36}$/i.test(f.getName()))books.push(SpreadsheetApp.openById(f.getId()));}
 var seen={};nurimCsv_(folder,{getSheets:function(){var tabs=[];books.forEach(function(book){book.getSheets().forEach(function(tab){tabs.push({getName:function(){return tab.getName();},getLastRow:function(){return tab.getLastRow();},getRange:function(){var range=tab.getRange.apply(tab,arguments);return {getDisplayValues:function(){return range.getDisplayValues().filter(function(r){if(seen[r[0]])return false;seen[r[0]]=true;return true;});}};}});});});return tabs;}},title,id);
}

/** v101: unpack only the bounded, uncompressed browser transport; preserve ordinary ZIP uploads. */
function nurimAttachmentParts_(file){
 var bytes=Utilities.base64Decode(file.base64),limit=10*1024*1024;
 if(bytes.length>limit)throw new Error('첨부파일 합계는 10MB 이하여야 합니다.');
 if(!/^__nurim_attachments_v101_(?:[2-9]|10)\.zip$/.test(file.name))return [{name:file.name,mime:file.mimeType||'application/octet-stream',bytes:bytes}];
 var data=bytes.map(function(b){return b&255;}),offset=0,parts=[],total=0;
 function u16(p){if(p+2>data.length)throw Error('첨부 전송 형식 오류');return data[p]+data[p+1]*256;}
 function u32(p){return (u16(p)+u16(p+2)*65536)>>>0;}
 function crc(a){var c=0xffffffff;for(var i=0;i<a.length;i++){c^=a[i]&255;for(var j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
 var mime={pdf:'application/pdf',hwp:'application/x-hwp',hwpx:'application/hwp+zip',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',zip:'application/zip'};
 while(offset+30<=data.length&&u32(offset)===0x04034b50){
  if(parts.length>=10||u16(offset+6)!==0x0800||u16(offset+8)!==0)throw Error('첨부 전송 형식 오류');
  var size=u32(offset+18),plain=u32(offset+22),names=u16(offset+26),extra=u16(offset+28),begin=offset+30+names+extra;
  if(size!==plain||!size||names>800||extra!==0||begin+size>data.length||(total+=size)>limit)throw Error('첨부파일 용량 또는 형식 오류');
  var name=Utilities.newBlob(bytes.slice(offset+30,offset+30+names)).getDataAsString('UTF-8');
  var ext=(name.toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1];
  if(!mime[ext]||/[\\/]/.test(name)||name.indexOf('..')===0)throw Error('지원하지 않는 첨부파일 형식');
  var content=bytes.slice(begin,begin+size);if(crc(content)!==u32(offset+14))throw Error('첨부 전송 중 파일이 손상되었습니다. 다시 제출해 주세요.');
  parts.push({name:name,mime:mime[ext],bytes:content});offset=begin+size;
 }
 if(parts.length!==Number(file.name.match(/_(\d+)\.zip$/)[1])||u32(offset)!==0x02014b50)throw Error('첨부파일 개수가 올바르지 않습니다.');
 return parts;
}
function nurimSaveAttachments_(folder,file,prefix){
 var parts=nurimAttachmentParts_(file);
 return parts.map(function(part){var name=prefix+safeName_(part.name),existing=folder.getFilesByName(name);var saved=existing.hasNext()?existing.next():folder.createFile(Utilities.newBlob(part.bytes,part.mime,name));return {name:part.name,url:saved.getUrl()};});
}
