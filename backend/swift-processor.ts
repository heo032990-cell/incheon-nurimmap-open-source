import {googleBasicApplication,googleProgram} from "./storage-policy.mjs";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "hint", "code"]) {
      if (typeof value[key] === "string" && value[key]) return value[key] as string;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "서버 처리 중 알 수 없는 오류가 발생했습니다.";
    }
  }
  return String(error || "서버 처리 중 알 수 없는 오류가 발생했습니다.");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function publicPromotionUrl(value: unknown): string {
  let url: URL;
  try { url = new URL(String(value || "")); }
  catch { throw new Error("올바른 공지사항 주소를 입력해 주세요."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("http 또는 https 공개 주소만 사용할 수 있습니다.");
  if (url.username || url.password) throw new Error("로그인 정보가 포함된 주소는 사용할 수 없습니다.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const blockedName = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  let blockedIp = false;
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) throw new Error("올바른 홈페이지 주소가 아닙니다.");
    blockedIp = parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
  }
  const blockedIpv6 = host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  if (blockedName || blockedIp || blockedIpv6) throw new Error("공개 홈페이지 주소만 사용할 수 있습니다.");
  url.hash = "";
  return url.href;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appsScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
  const webhookSecret = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !appsScriptUrl || !webhookSecret) {
    return json({ error: "서버 연동 설정이 완료되지 않았습니다." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let applicationId = "";
  try {
    const body = await request.json();
    const action = String(body.action || "sync-application");

    if (action === "record-google-form-submission" || action === "register-google-form-relay") {
      const programId = String(body.programId || "").trim();
      const relaySecret = String(body.relaySecret || "").trim();
      if (!programId || relaySecret.length < 32) return json({ error: "연결정보가 올바르지 않습니다." }, 400);
      const { data: relayConfig } = await admin.from("google_form_verification_configs")
        .select("relay_secret_hash, verification_mode").eq("program_id", programId).maybeSingle();
      if (!relayConfig?.relay_secret_hash || relayConfig.relay_secret_hash !== await sha256Hex(relaySecret)) {
        return json({ error: "기관 Google Form 연결키가 일치하지 않습니다." }, 403);
      }
      if (action === "register-google-form-relay") {
        const tokenEntry = String(body.tokenEntry || "").trim();
        if (!/^entry\.\d+$/.test(tokenEntry)) return json({ error: "확인번호 질문 연결값을 만들지 못했습니다." }, 400);
        await admin.from("google_form_verification_configs").update({ verification_mode: "relay", relay_connected_at: new Date().toISOString(), relay_token_entry: tokenEntry }).eq("program_id", programId);
        await admin.from("programs").update({ google_form_verification_enabled: true, google_form_token_entry: tokenEntry }).eq("id", programId);
        return json({ ok: true });
      }
      const token = String(body.token || "").trim().toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return json({ error: "제출 확인번호가 올바르지 않습니다." }, 400);
      const submittedAt = new Date(String(body.submittedAt || ""));
      const { error: receiptError } = await admin.from("google_form_submission_receipts").upsert({
        program_id: programId, token,
        submitted_at: Number.isNaN(submittedAt.getTime()) ? new Date().toISOString() : submittedAt.toISOString(),
      });
      if (receiptError) throw receiptError;
      return json({ ok: true });
    }

    if (action === "verify-survey-token") {
      const programId = String(body.programId || "").trim();
      const token = String(body.token || "").trim().toLowerCase();
      if (!programId || programId.length > 100 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
        return json({ error: "올바른 설문 확인정보가 아닙니다." }, 400);
      }
      const { data: program } = await admin.from("programs")
        .select("id, google_form_verification_enabled")
        .eq("id", programId)
        .maybeSingle();
      if (!program) return json({ error: "프로그램을 찾지 못했습니다." }, 404);
      const { data: config, error: configError } = await admin.from("google_form_verification_configs")
        .select("form_file_id, response_spreadsheet_id, response_sheet_name, token_column_name, verification_mode, relay_connected_at, relay_token_entry")
        .eq("program_id", programId)
        .maybeSingle();
      if (configError || !config) return json({ error: "관리자가 Google Form 제출 확인 설정을 완료해야 합니다." }, 409);
      if (!program.google_form_verification_enabled) {
        const recoverableRelay = config.verification_mode === "relay" && Boolean(config.relay_connected_at) && /^entry\.\d+$/.test(String(config.relay_token_entry || ""));
        if (!recoverableRelay) return json({ error: "관리자가 Google Form 제출 확인 설정을 완료해야 합니다." }, 409);
        await admin.from("programs").update({
          google_form_verification_enabled: true,
          google_form_token_entry: config.relay_token_entry,
        }).eq("id", programId);
      }
      if (config.verification_mode === "relay") {
        const { data: receipt } = await admin.from("google_form_submission_receipts")
          .select("submitted_at").eq("program_id", programId).eq("token", token).maybeSingle();
        return json({ ok: true, verified: Boolean(receipt), submittedAt: receipt?.submitted_at || null });
      }
      const verifyResponse = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          secret: webhookSecret,
          action: "verify-google-form-token",
          spreadsheetId: config.response_spreadsheet_id,
          sheetName: config.response_sheet_name,
          tokenColumnName: config.token_column_name,
          token,
        }),
      });
      const verifyText = await verifyResponse.text();
      let verifyResult: Record<string, unknown> = {};
      try { verifyResult = JSON.parse(verifyText); }
      catch { verifyResult = { error: verifyText.slice(0, 500) || "설문 확인 응답을 읽지 못했습니다." }; }
      if (!verifyResponse.ok || !verifyResult.ok) return json({ error: String(verifyResult.error || "설문 제출 확인에 실패했습니다.") }, 502);
      return json({ ok: true, verified: verifyResult.verified === true, submittedAt: verifyResult.submittedAt || null });
    }

    if (["list-managers", "create-manager", "update-manager", "delete-manager", "audit-program-owners", "assign-program-owner", "extract-promotion-draft", "extract-promotion-link", "auto-detect-google-form-config", "create-google-form-config", "get-google-form-config", "save-google-form-config", "prepare-google-form-relay"].includes(action)) {
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "관리자 로그인이 필요합니다." }, 401);
      const { data: profile } = await admin.from("profiles")
        .select("role, center_id, email, drive_folder_url")
        .eq("id", userData.user.id)
        .single();
      if (!["manager", "super"].includes(String(profile?.role || ""))) return json({ error: "프로그램 관리자 권한이 필요합니다." }, 403);

      if (action === "prepare-google-form-relay") {
        const programId = String(body.programId || "").trim();
        const { data: targetProgram } = await admin.from("programs").select("id, manager_id, center_id, google_form_url").eq("id", programId).maybeSingle();
        if (!targetProgram) return json({ error: "프로그램을 먼저 저장해 주세요." }, 404);
        const canManage = profile?.role === "super" || targetProgram.manager_id === userData.user.id ||
          (profile?.role === "manager" && targetProgram.center_id && targetProgram.center_id === profile.center_id);
        if (!canManage) return json({ error: "이 프로그램의 Google Form 연결 권한이 없습니다." }, 403);
        const { data: connectedRelay } = await admin.from("google_form_verification_configs")
          .select("verification_mode, relay_connected_at, relay_token_entry, relay_form_url")
          .eq("program_id", programId)
          .maybeSingle();
        if (connectedRelay?.verification_mode === "relay" && connectedRelay?.relay_connected_at && connectedRelay?.relay_form_url === targetProgram.google_form_url && /^entry\.\d+$/.test(String(connectedRelay.relay_token_entry || ""))) {
          await admin.from("programs").update({
            google_form_verification_enabled: true,
            google_form_token_entry: connectedRelay.relay_token_entry,
          }).eq("id", programId);
          return json({ ok: true, programId, alreadyConnected: true, connectedAt: connectedRelay.relay_connected_at, tokenEntry: connectedRelay.relay_token_entry });
        }
        const relaySecret = randomSecret();
        const { error: relayError } = await admin.from("google_form_verification_configs").upsert({
          program_id: programId, response_spreadsheet_id: null, response_sheet_name: "", token_column_name: "신청 확인번호",
          verification_mode: "relay", relay_secret_hash: await sha256Hex(relaySecret), relay_connected_at: null, relay_token_entry: null, relay_form_url: targetProgram.google_form_url,
          updated_by: userData.user.id, updated_at: new Date().toISOString(),
        });
        if (relayError) throw relayError;
        await admin.from("programs").update({ google_form_verification_enabled: false, google_form_token_entry: null }).eq("id", programId);
        return json({ ok: true, programId, relaySecret });
      }

      if (action === "create-google-form-config") {
        const programTitle = String(body.programTitle || "").trim();
        if (programTitle.length < 2 || programTitle.length > 100) return json({ error: "프로그램명을 먼저 입력해 주세요." }, 400);
        const folderId = String(profile?.drive_folder_url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || "";
        const createResponse = await fetch(appsScriptUrl, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ secret: webhookSecret, action: "create-google-form-config", programTitle, managerEmail: String(profile?.email || userData.user.email || ""), targetFolderId: folderId }),
        });
        const createText = await createResponse.text();
        let createResult: Record<string, unknown> = {};
        try { createResult = JSON.parse(createText); }
        catch { createResult = { error: /^\s*</.test(createText) ? "Google Apps Script 연결 권한을 다시 승인해 주세요." : (createText.slice(0, 300) || "설문 자동 생성 응답을 읽지 못했습니다.") }; }
        if (!createResponse.ok || !createResult.ok) return json({ error: String(createResult.error || "Google 설문을 자동 생성하지 못했습니다.") }, createResponse.ok ? 400 : 502);
        return json(createResult);
      }

      if (action === "auto-detect-google-form-config") {
        const formUrl = publicPromotionUrl(body.formUrl);
        const detectResponse = await fetch(appsScriptUrl, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ secret: webhookSecret, action: "auto-detect-google-form-config", formUrl }),
        });
        const detectText = await detectResponse.text();
        let detectResult: Record<string, unknown> = {};
        try { detectResult = JSON.parse(detectText); }
        catch { detectResult = { error: /^\s*</.test(detectText) ? "Google Apps Script 연결 주소 또는 공개 권한을 확인해 주세요." : (detectText.slice(0, 300) || "자동 연결 응답을 읽지 못했습니다.") }; }
        if (!detectResponse.ok || !detectResult.ok) return json({ error: String(detectResult.error || "연결정보를 자동으로 찾지 못했습니다.") }, detectResponse.ok ? 400 : 502);
        return json(detectResult);
      }

      if (action === "extract-promotion-draft") {
        const image = body.image || {};
        const dataUrl = String(image.dataUrl || "");
        const mimeType = String(image.mimeType || "");
        const supportedMime = mimeType.startsWith("image/") || mimeType === "application/pdf";
        if (!supportedMime || !/^data:(?:image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/.test(dataUrl)) {
          return json({ error: "올바른 이미지 또는 PDF 홍보지가 필요합니다." }, 400);
        }
        if (dataUrl.length > 14_000_000) return json({ error: "홍보지는 10MB 이하로 등록해 주세요." }, 413);
        const ocrResponse = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            secret: webhookSecret,
            action: "extract-promotion-draft",
            image: { name: String(image.name || "홍보지"), mimeType: String(image.mimeType), dataUrl },
          }),
        });
        const ocrText = await ocrResponse.text();
        let ocrResult: Record<string, unknown> = {};
        try { ocrResult = JSON.parse(ocrText); }
        catch { ocrResult = { error: ocrText.slice(0, 500) || "Google Apps Script 응답을 읽지 못했습니다." }; }
        if (!ocrResponse.ok || !ocrResult.ok) {
          const detail = String(ocrResult.error || "홍보지 인식에 실패했습니다.");
          console.error("promotion OCR failed", { status: ocrResponse.status, detail });
          return json({ error: detail, upstreamStatus: ocrResponse.status }, ocrResponse.ok ? 500 : 502);
        }
        return json(ocrResult);
      }

      if (action === "extract-promotion-link") {
        const url = publicPromotionUrl(body.url);
        const pageResponse = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ secret: webhookSecret, action: "extract-promotion-link", url }),
        });
        const pageText = await pageResponse.text();
        let pageResult: Record<string, unknown> = {};
        try { pageResult = JSON.parse(pageText); }
        catch { pageResult = { error: pageText.slice(0, 500) || "Google Apps Script 응답을 읽지 못했습니다." }; }
        if (!pageResponse.ok || !pageResult.ok) {
          const detail = String(pageResult.error || "공지 페이지 인식에 실패했습니다.");
          console.error("promotion link extraction failed", { status: pageResponse.status, detail });
          return json({ error: detail, upstreamStatus: pageResponse.status }, pageResponse.ok ? 422 : 502);
        }
        return json(pageResult);
      }

      if (action === "get-google-form-config" || action === "save-google-form-config") {
        const programId = String(body.programId || "").trim();
        const { data: targetProgram } = await admin.from("programs")
          .select("id, manager_id, center_id")
          .eq("id", programId)
          .maybeSingle();
        if (!targetProgram) return json({ error: "프로그램을 찾지 못했습니다." }, 404);
        const canManage = profile?.role === "super" ||
          targetProgram.manager_id === userData.user.id ||
          (profile?.role === "manager" && targetProgram.center_id && targetProgram.center_id === profile.center_id);
        if (!canManage) return json({ error: "이 프로그램의 Google Form 설정 권한이 없습니다." }, 403);

        if (action === "get-google-form-config") {
          const { data: config } = await admin.from("google_form_verification_configs")
            .select("form_file_id, response_spreadsheet_id, response_sheet_name, token_column_name, verification_mode, relay_connected_at, relay_token_entry")
            .eq("program_id", programId)
            .maybeSingle();
          return json({ ok: true, config: config ? {
            formFileId: config.form_file_id || "",
            spreadsheetId: config.response_spreadsheet_id,
            sheetName: config.response_sheet_name,
            tokenColumnName: config.token_column_name,
            verificationMode: config.verification_mode || "",
            relayConnectedAt: config.relay_connected_at || "",
            relayConnected: config.verification_mode === "relay" && Boolean(config.relay_connected_at),
            tokenEntry: config.relay_token_entry || "",
          } : null });
        }

        const enabled = body.enabled === true;
        if (!enabled) {
          const { data: existingRelay } = await admin.from("google_form_verification_configs")
            .select("verification_mode").eq("program_id", programId).maybeSingle();
          const { data: linkedProgram } = await admin.from("programs").select("google_form_url").eq("id", programId).maybeSingle();
          if (existingRelay?.verification_mode === "relay" && linkedProgram?.google_form_url) return json({ ok: true, preservedRelay: true });
          await admin.from("google_form_verification_configs").delete().eq("program_id", programId);
          await admin.from("programs").update({ google_form_verification_enabled: false, google_form_token_entry: null }).eq("id", programId);
          return json({ ok: true });
        }
        const tokenEntry = String(body.tokenEntry || "").trim();
        const formFileId = String(body.formFileId || "").trim();
        const spreadsheetId = String(body.spreadsheetId || "").trim();
        const sheetName = String(body.sheetName || "설문지 응답 1").trim();
        const tokenColumnName = String(body.tokenColumnName || "설문 확인번호").trim();
        if (!/^entry\.\d+$/.test(tokenEntry)) return json({ error: "확인번호 질문 entry 번호는 entry.숫자 형식으로 입력해 주세요." }, 400);
        if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) return json({ error: "올바른 응답 스프레드시트 ID를 입력해 주세요." }, 400);
        if (!sheetName || !tokenColumnName || sheetName.length > 100 || tokenColumnName.length > 100) return json({ error: "응답 탭 이름과 확인번호 열 제목을 확인해 주세요." }, 400);
        const { error: saveError } = await admin.from("google_form_verification_configs").upsert({
          program_id: programId,
          form_file_id: /^[a-zA-Z0-9_-]{10,}$/.test(formFileId) ? formFileId : null,
          response_spreadsheet_id: spreadsheetId,
          response_sheet_name: sheetName,
          token_column_name: tokenColumnName,
          updated_by: userData.user.id,
          updated_at: new Date().toISOString(),
        });
        if (saveError) throw saveError;
        await admin.from("programs").update({ google_form_verification_enabled: true, google_form_token_entry: tokenEntry }).eq("id", programId);
        return json({ ok: true });
      }

      if (profile?.role !== "super") return json({ error: "최고관리자만 실행할 수 있습니다." }, 403);

      if (action === "list-managers") {
        const { data: profiles, error } = await admin.from("profiles")
          .select("id, display_name, email, center_id, drive_folder_url, centers(name)")
          .eq("role", "manager")
          .order("display_name");
        if (error) throw error;
        return json({
          managers: (profiles || []).map((item) => ({
            id: item.id,
            displayName: item.display_name,
            email: item.email,
            centerId: item.center_id,
            centerName: Array.isArray(item.centers) ? item.centers[0]?.name : item.centers?.name,
            driveFolderUrl: item.drive_folder_url || "",
          })),
        });
      }

      if (action === "audit-program-owners") {
        const { data: profiles, error: managerError } = await admin.from("profiles")
          .select("id, display_name, center_id, drive_folder_url").eq("role", "manager").order("display_name");
        if (managerError) throw managerError;
        const { data: ownerPrograms, error: programOwnerError } = await admin.from("programs")
          .select("id, title, center_name, manager_id").order("title");
        if (programOwnerError) throw programOwnerError;
        const { data: ownerApplications, error: applicationOwnerError } = await admin.from("applications")
          .select("program_id, drive_folder_url").not("drive_folder_url", "is", null);
        if (applicationOwnerError) throw applicationOwnerError;
        const folderId = (value: unknown) => String(value || "").match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || "";
        const managerPayload = (profiles || []).map((item) => ({ managerId: item.id, folderId: folderId(item.drive_folder_url) })).filter((item) => item.folderId);
        const applicationFolders = new Map<string, Set<string>>();
        for (const item of ownerApplications || []) {
          const id = folderId(item.drive_folder_url);
          if (!id) continue;
          if (!applicationFolders.has(item.program_id)) applicationFolders.set(item.program_id, new Set());
          applicationFolders.get(item.program_id)?.add(id);
        }
        const driveResponse = await fetch(appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({
          secret: webhookSecret, action: "resolve-program-owners", managers: managerPayload,
          programs: (ownerPrograms || []).map((item) => ({ programId: item.id, folderIds: [...(applicationFolders.get(item.id) || [])] })),
        }) });
        if (!driveResponse.ok) throw new Error(`Google Drive 담당자 점검 응답 오류 (${driveResponse.status})`);
        const driveResult = await driveResponse.json();
        if (!driveResult.ok) throw new Error(driveResult.error || "Google Drive 담당자 점검에 실패했습니다.");
        const suggestions = new Map((driveResult.suggestions || []).map((item: Record<string, unknown>) => [String(item.programId), item]));
        return json({ ok: true,
          managers: (profiles || []).map((item) => ({ id: item.id, displayName: item.display_name, centerId: item.center_id, hasDrive: Boolean(folderId(item.drive_folder_url)) })),
          programs: (ownerPrograms || []).map((item) => { const suggestion = suggestions.get(item.id) as Record<string, unknown> | undefined; return {
            id: item.id, title: item.title, centerName: item.center_name, currentManagerId: item.manager_id,
            suggestedManagerId: suggestion?.managerId || null, confidence: suggestion?.confidence || "unknown",
          }; }),
        });
      }

      if (action === "assign-program-owner") {
        const programId = String(body.programId || "");
        const managerId = String(body.managerId || "");
        const { data: manager, error: managerError } = await admin.from("profiles")
          .select("id, email, center_id, centers(name)").eq("id", managerId).eq("role", "manager").single();
        if (managerError || !manager) return json({ error: "담당자를 찾지 못했습니다." }, 404);
        const { data: previousProgram } = await admin.from("programs").select("manager_id").eq("id", programId).maybeSingle();
        let previousEmail = "";
        if (previousProgram?.manager_id) {
          const { data: previousManager } = await admin.from("profiles").select("email").eq("id", previousProgram.manager_id).maybeSingle();
          previousEmail = String(previousManager?.email || "");
        }
        const { data: formConfig } = await admin.from("google_form_verification_configs")
          .select("form_file_id, response_spreadsheet_id").eq("program_id", programId).maybeSingle();
        const centerName = Array.isArray(manager.centers) ? manager.centers[0]?.name : manager.centers?.name;
        const { error: programError } = await admin.from("programs").update({ manager_id: manager.id, center_id: manager.center_id, center_name: centerName, updated_at: new Date().toISOString() }).eq("id", programId);
        if (programError) throw programError;
        const { error: applicationsError } = await admin.from("applications").update({ center_id: manager.center_id }).eq("program_id", programId);
        if (applicationsError) throw applicationsError;
        let shareWarning = "";
        if (formConfig && manager.email) {
          try {
            const shareResponse = await fetch(appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({
              secret: webhookSecret, action: "update-google-form-editors", formFileId: formConfig.form_file_id || "", spreadsheetId: formConfig.response_spreadsheet_id || "", newEmail: manager.email, oldEmail: previousEmail,
            }) });
            const shareResult = await shareResponse.json();
            shareWarning = String(shareResult.warning || (shareResult.ok ? "" : "Google 설문 공유 권한은 최고관리자가 확인해 주세요."));
          } catch { shareWarning = "프로그램 담당자는 변경됐지만 Google 설문 공유 권한은 최고관리자가 확인해 주세요."; }
        }
        return json({ ok: true, shareWarning });
      }
      if (action === "create-manager") {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const displayName = String(body.displayName || "").trim();
        const centerValue = String(body.centerId || "").trim();
        const driveFolderUrl = String(body.driveFolderUrl || "").trim();
        if (!email || password.length < 8 || !displayName || !centerValue) {
          return json({ error: "담당자 정보를 모두 올바르게 입력해 주세요." }, 400);
        }
        let centerId = centerValue;
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(centerId)) {
          const { data: matchedCenter, error: centerError } = await admin.from("centers")
            .select("id")
            .eq("name", centerValue)
            .maybeSingle();
          if (centerError) throw centerError;
          if (!matchedCenter) {
            return json({ error: "선택한 복지관을 데이터베이스에서 찾지 못했습니다." }, 400);
          }
          centerId = matchedCenter.id;
        }
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        let managerUser = created.user;
        let newlyCreated = Boolean(created.user);
        if (createError) {
          const isExistingEmail = createError.code === "email_exists"
            || /already (been )?registered|already exists/i.test(createError.message);
          if (!isExistingEmail) throw createError;

          const { data: users, error: usersError } = await admin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          if (usersError) throw usersError;
          managerUser = users.users.find((item) => item.email?.toLowerCase() === email) || null;
          newlyCreated = false;
          if (!managerUser) throw new Error("등록된 이메일 계정을 찾지 못했습니다.");

          const { data: existingProfile } = await admin.from("profiles")
            .select("role")
            .eq("id", managerUser.id)
            .maybeSingle();
          if (existingProfile?.role === "super") {
            return json({ error: "최고관리자 계정은 복지관 담당자로 변경할 수 없습니다." }, 409);
          }
          const { error: passwordError } = await admin.auth.admin.updateUserById(
            managerUser.id,
            { password, email_confirm: true },
          );
          if (passwordError) throw passwordError;
        }
        if (!managerUser) throw new Error("계정을 만들지 못했습니다.");

        const { error: profileError } = await admin.from("profiles").upsert({
          id: managerUser.id,
          display_name: displayName,
          email,
          role: "manager",
          center_id: centerId,
          drive_folder_url: driveFolderUrl || null,
        }, { onConflict: "id" });
        if (profileError) {
          if (newlyCreated) await admin.auth.admin.deleteUser(managerUser.id);
          throw profileError;
        }
        return json({ ok: true, linkedExisting: !newlyCreated });
      }

      const userId = String(body.userId || "");
      const { data: target } = await admin.from("profiles")
        .select("id, role, center_id, email")
        .eq("id", userId)
        .single();
      if (!target || target.role !== "manager") {
        return json({ error: "담당자 계정을 찾지 못했습니다." }, 404);
      }

      if (action === "update-manager") {
        const updates: Record<string, unknown> = {};
        let movedPrograms = 0;
        let newEmailForShare = "";
        let shareWarning = "";
        if (typeof body.centerId === "string" && body.centerId !== target.center_id) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.centerId)) return json({ error: "올바르지 않은 기관입니다." }, 400);
          const { data: moved, error: transferError } = await admin.rpc("transfer_manager_center", {
            p_manager_id: userId,
            p_new_center_id: body.centerId,
          });
          if (transferError) throw transferError;
          movedPrograms = Number(moved || 0);
        }
        if (typeof body.email === "string") {
          const email = body.email.trim().toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "올바른 이메일 주소를 입력해 주세요." }, 400);
          const { error: emailError } = await admin.auth.admin.updateUserById(userId, {
            email,
            email_confirm: true,
          });
          if (emailError) throw emailError;
          updates.email = email;
          newEmailForShare = email;
        }        if (typeof body.driveFolderUrl === "string") {
          updates.drive_folder_url = body.driveFolderUrl.trim() || null;
        }
        if (Object.keys(updates).length) {
          const { error } = await admin.from("profiles").update(updates).eq("id", userId);
          if (error) throw error;
        }
        if (newEmailForShare) {
          const { data: assignedPrograms } = await admin.from("programs").select("id").eq("manager_id", userId);
          const programIds = (assignedPrograms || []).map((item) => item.id);
          if (programIds.length) {
            const { data: configs } = await admin.from("google_form_verification_configs")
              .select("form_file_id, response_spreadsheet_id").in("program_id", programIds);
            for (const config of configs || []) {
              try {
                const shareResponse = await fetch(appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({
                  secret: webhookSecret, action: "update-google-form-editors", formFileId: config.form_file_id || "", spreadsheetId: config.response_spreadsheet_id || "", newEmail: newEmailForShare, oldEmail: String(target.email || ""),
                }) });
                const shareResult = await shareResponse.json();
                if (!shareResult.ok || shareResult.warning) shareWarning = String(shareResult.warning || "일부 Google 설문 공유 권한을 확인해 주세요.");
              } catch { shareWarning = "로그인 이메일은 변경됐지만 일부 Google 설문 공유 권한을 확인해 주세요."; }
            }
          }
        }
        if (typeof body.password === "string") {
          if (body.password.length < 8) return json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400);
          const { error } = await admin.auth.admin.updateUserById(userId, { password: body.password });
          if (error) throw error;
        }
        return json({ ok: true, movedPrograms, shareWarning });
      }

      if (action === "delete-manager") {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return json({ ok: true });
      }
    }

    applicationId = String(body.applicationId || "");
    const force = body.force === true;
    if (!/^[0-9a-f-]{36}$/i.test(applicationId)) {
      return json({ error: "올바르지 않은 신청번호입니다." }, 400);
    }

    const { data: application, error: applicationError } = await admin
      .from("applications")
      .select("*")
      .eq("id", applicationId)
      .single();
    if (applicationError || !application) return json({ error: "신청내역을 찾지 못했습니다." }, 404);
    if (force) {
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "관리자 로그인이 필요합니다." }, 401);
      const { data: profile } = await admin.from("profiles")
        .select("role, center_id, email, drive_folder_url")
        .eq("id", userData.user.id)
        .single();
      const permitted = profile?.role === "super"
        || (profile?.role === "manager" && profile.center_id === application.center_id);
      if (!permitted) return json({ error: "해당 신청내역을 수정할 권한이 없습니다." }, 403);
    }
    if (!force && application.drive_sync_status === "synced" && application.drive_folder_url) {
      return json({ ok: true, alreadySynced: true, folderUrl: application.drive_folder_url });
    }

    await admin.from("applications").update({
      drive_sync_status: "processing",
      drive_error: null,
    }).eq("id", applicationId);

    const { data: program, error: programError } = await admin
      .from("programs")
      .select("id, title, center_name, center_id, manager_id, consent_items, privacy_retention_years, selection_method, capacity")
      .eq("id", application.program_id)
      .single();
    if (programError || !program) throw new Error("프로그램 정보를 찾지 못했습니다.");

    const { data: formConfig } = await admin.from("google_form_verification_configs")
      .select("response_spreadsheet_id")
      .eq("program_id", program.id)
      .maybeSingle();
    const responseSpreadsheetId = String(formConfig?.response_spreadsheet_id || "");

    let managerQuery = admin.from("profiles")
      .select("drive_folder_url")
      .eq("role", "manager")
      .not("drive_folder_url", "is", null);
    managerQuery = program.manager_id
      ? managerQuery.eq("id", program.manager_id)
      : managerQuery.eq("center_id", application.center_id);
    const { data: manager } = await managerQuery.limit(1).maybeSingle();
    const folderMatch = String(manager?.drive_folder_url || "")
      .match(/\/folders\/([a-zA-Z0-9_-]+)/);
    const targetFolderId = folderMatch?.[1] || "YOUR_FOLDER_ID";

    let file: { name: string; mimeType: string; base64: string } | null = null;
    if (application.uploaded_file_path) {
      const { data: blob, error: downloadError } = await admin.storage
        .from("application-files")
        .download(application.uploaded_file_path);
      if (downloadError || !blob) throw new Error("제출파일을 불러오지 못했습니다.");
      file = {
        name: application.uploaded_file_name || "제출신청서",
        mimeType: application.uploaded_file_type || blob.type || "application/octet-stream",
        base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      };
    }

    const driveResponse = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: webhookSecret,
        application:googleBasicApplication(application),
        program:googleProgram(program),
        file,
        targetFolderId,
        responseSpreadsheetId,
      }),
    });
    if (!driveResponse.ok) throw new Error(`Google Drive 응답 오류 (${driveResponse.status})`);
    const driveResult = await driveResponse.json();
    if (!driveResult.ok) throw new Error(driveResult.error || "Google Drive 저장에 실패했습니다.");

    await admin.from("applications").update({
      drive_sync_status: "synced",
      drive_synced_at: new Date().toISOString(),
      drive_folder_url: driveResult.folderUrl || null,
      drive_roster_sheet_url: driveResult.rosterSpreadsheetUrl || null,
      drive_uploaded_file_url: driveResult.uploadedFileUrl || application.drive_uploaded_file_url || null,
      drive_error: null,
    }).eq("id", applicationId);
    if(application.uploaded_file_path&&driveResult.uploadedFileUrl){const removed=await admin.storage.from("application-files").remove([application.uploaded_file_path]);if(!removed.error)await admin.from("applications").update({uploaded_file_path:null}).eq("id",applicationId);}
    return json({
      ok: true,
      folderUrl: driveResult.folderUrl || null,
      rosterSpreadsheetUrl: driveResult.rosterSpreadsheetUrl || null,
      applicationStatus: application.application_status || "accepted",
      queueNumber: application.queue_number || null,
      waitlistNumber: application.application_status === "waitlist"
        ? Math.max(1, Number(application.queue_number || 0) - Number(program.capacity || 0))
        : null,
      selectionMethod: program.selection_method || "first_come",
    });
  } catch (error) {
    console.error("swift-processor failed", errorMessage(error));
    if (applicationId) {
      await admin.from("applications").update({
        drive_sync_status: "failed",
        drive_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
      }).eq("id", applicationId);
    }
    return json({ error: errorMessage(error) }, 500);
  }
});
