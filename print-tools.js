function printableDate(value) {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : value + "T00:00:00");
  return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleString("ko-KR", value.includes("T") ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" });
}
function openPrintDocument(title, body) {
  const popup = window.open("", "_blank");
  if (!popup) { alert("인쇄 창이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요."); return; }
  const css = "@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:'Malgun Gothic',Arial,sans-serif;font-size:10.5pt;line-height:1.45}h1{margin:0 0 4mm;font-size:20pt;text-align:center}h2{margin:7mm 0 2.5mm;font-size:13pt}p{margin:1.5mm 0}.meta{display:flex;justify-content:space-between;gap:8mm;padding-bottom:3mm;border-bottom:2px solid #222;color:#333}.grid{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid #555;border-left:1px solid #555}.grid>div{min-height:15mm;padding:3mm;border-right:1px solid #555;border-bottom:1px solid #555}.grid .wide{grid-column:1/-1}.label{display:block;margin-bottom:1.5mm;color:#555;font-size:8.5pt;font-weight:700}.consents,.roster{width:100%;border-collapse:collapse}.consents th,.consents td,.roster th,.roster td{border:1px solid #555;padding:2.2mm;text-align:left}.consents th{width:76%}.signature{margin-top:10mm;text-align:right;font-size:12pt}.roster{table-layout:fixed}.roster th{background:#eee;text-align:center}.roster td{text-align:center;word-break:break-all}.roster .note{text-align:left}.footer{margin-top:5mm;color:#555;font-size:8.5pt;text-align:right}.applicationPrintPage{break-after:page;page-break-after:always}.applicationPrintPage:last-child{break-after:auto;page-break-after:auto}.applicationPrintPage.density-medium{font-size:9.5pt;line-height:1.32}.applicationPrintPage.density-medium h1{margin-bottom:2.5mm;font-size:17pt}.applicationPrintPage.density-medium h2{margin:4mm 0 1.5mm;font-size:11.5pt}.applicationPrintPage.density-medium .grid>div{min-height:10mm;padding:2mm}.applicationPrintPage.density-medium .consents th,.applicationPrintPage.density-medium .consents td{padding:1.5mm}.applicationPrintPage.density-medium .signature{margin-top:5mm;font-size:10.5pt}.applicationPrintPage.density-medium .printStatus{margin-bottom:3mm;padding:2mm;font-size:10.5pt}.applicationPrintPage.density-high{font-size:8.5pt;line-height:1.24}.applicationPrintPage.density-high h1{margin-bottom:2mm;font-size:15pt}.applicationPrintPage.density-high h2{margin:2.5mm 0 1mm;font-size:10pt}.applicationPrintPage.density-high .meta{padding-bottom:1.5mm}.applicationPrintPage.density-high .grid>div{min-height:7.5mm;padding:1.3mm}.applicationPrintPage.density-high .label{margin-bottom:.5mm;font-size:7.5pt}.applicationPrintPage.density-high .consents th,.applicationPrintPage.density-high .consents td{padding:1mm}.applicationPrintPage.density-high .signature{margin-top:3mm;font-size:9.5pt}.applicationPrintPage.density-high .printStatus{margin-bottom:2mm;padding:1.5mm;font-size:9.5pt}.printStatus{margin:0 0 5mm;padding:3mm;border:2px solid #333;text-align:center;font-size:12pt}.printStatus.cancelled,.printStatus.deleted{border-color:#b42318;background:#fff0f0;color:#8a1c13}.roster tr.status-cancelled td,.roster tr.status-deleted td{background:#fff0f0;color:#8a1c13;text-decoration:none}";
  popup.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
  popup.document.close();
  popup.setTimeout(function () { popup.focus(); popup.print(); }, 200);
}
function printableLifecycleStatus(applicant, program) {
  if (applicant.lifecycleStatus === "cancelled") return "취소자";
  if (applicant.lifecycleStatus === "deleted") return "관리자 삭제";
  let label = applicant.lifecycleStatus === "modified" ? "수정 접수" : "접수";
  if (program && program.selectionMethod === "first_come" && applicant.applicationStatus === "waitlist") {
    const waitNumber = Math.max(1, Number(applicant.queueNumber || 0) - Number(program.capacity || 0));
    label += "(대기" + waitNumber + ")";
  }
  return label;
}
function sortApplicantsByCreatedAt(items) {
  return items.slice().sort(function (a, b) {
    const timeDifference = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    return timeDifference || Number(a.queueNumber || 0) - Number(b.queueNumber || 0);
  });
}
function printableBirthDate(value) {
  if (!value) return "-";
  return printableDate(String(value).slice(0, 10));
}
function printableRequestNote(applicant) {
  const parts = [];
  if (applicant.note) parts.push(esc(applicant.note));
  if (applicant.cancelledAt) parts.push("취소신청: " + printableDate(applicant.cancelledAt));
  return parts.length ? parts.join("<br>") : "없음";
}
function printableStatusBanner(applicant, program) {
  const label = printableLifecycleStatus(applicant, program);
  return `<div class="printStatus ${esc(applicant.lifecycleStatus || "received")}">신청 상태: <strong>${label}</strong></div>`;
}
function applicationPrintBody(program, applicant) {
  const responses = Object.entries(applicant.consentResponses || {});
  const consentRows = responses.length ? responses.map(function (entry) { return '<tr><th>' + esc(consentLabel(program, entry[0])) + '</th><td>' + (entry[1] === "agree" ? "동의" : "미동의") + '</td></tr>'; }).join("") : '<tr><th>개인정보 동의</th><td>별도 동의서 미사용</td></tr>';
  return '<h1>프로그램 참여 신청서</h1>' + printableStatusBanner(applicant, program) + '<div class="meta"><strong>' + esc(program.centerName) + '</strong><span>접수일 ' + printableDate(applicant.createdAt) + '</span></div><h2>신청 프로그램</h2><div class="grid"><div class="wide"><span class="label">프로그램명</span>' + esc(program.title) + '</div><div><span class="label">운영 일정</span>' + esc(program.schedule) + '</div><div><span class="label">참여 대상</span>' + esc(program.audience) + '</div></div><h2>신청자 정보</h2><div class="grid"><div><span class="label">성명</span>' + esc(applicant.name) + '</div><div><span class="label">연락처</span>' + esc(applicant.phone) + '</div><div><span class="label">생년월일</span>' + printableBirthDate(applicant.birth) + '</div><div><span class="label">참여자 구분</span>' + esc(applicant.type) + '</div><div class="wide"><span class="label">요청사항</span>' + printableRequestNote(applicant) + '</div></div>';
}
function applicationPrintDensity(program, applicant) {
  const consentCount = Object.keys(applicant.consentResponses || {}).length;
  const totalItems = consentCount;
  if (totalItems >= 12) return "density-high";
  if (totalItems >= 8) return "density-medium";
  return "density-normal";
}
function printApplications(program, selectedApplicants) {
  if (!selectedApplicants.length) { alert("출력할 신청자를 선택해 주세요."); return; }
  const body = sortApplicantsByCreatedAt(selectedApplicants).map(function (applicant) { return '<section class="applicationPrintPage ' + applicationPrintDensity(program, applicant) + '">' + applicationPrintBody(program, applicant) + '</section>'; }).join("");
  openPrintDocument(program.title + " 신청서 " + selectedApplicants.length + "명", body);
}
function printApplication(program, applicant) {
  printApplications(program, [applicant]);
}
function printProgramRoster(program, programApplicants) {
  const rows = sortApplicantsByCreatedAt(programApplicants).map(function (applicant, index) { return '<tr class="status-' + esc(applicant.lifecycleStatus || "received") + '"><td>' + (index + 1) + '</td><td>' + esc(applicant.name) + '</td><td><strong>' + printableLifecycleStatus(applicant, program) + '</strong></td><td>' + esc(applicant.phone) + '</td><td>' + printableBirthDate(applicant.birth) + '</td><td>' + esc(applicant.type) + '</td><td class="note">' + printableRequestNote(applicant) + '</td></tr>'; }).join("");
  const body = '<h1>프로그램 신청 명단</h1><div class="meta"><strong>' + esc(program.centerName) + '</strong><span>출력일 ' + new Date().toLocaleDateString("ko-KR") + '</span></div><h2>' + esc(program.title) + '</h2><p>운영 일정: ' + esc(program.schedule) + ' · 신청 ' + programApplicants.length + '명 / 정원 ' + (Number(program.capacity) === 0 ? '제한 없음' : esc(program.capacity) + '명') + '</p><table class="roster"><thead><tr><th style="width:7%">번호</th><th style="width:12%">성명</th><th style="width:10%">상태</th><th style="width:18%">연락처</th><th style="width:15%">생년월일</th><th style="width:14%">구분</th><th>요청사항</th></tr></thead><tbody>' + rows + '</tbody></table><p class="footer">인천 누림지도 관리자 출력</p>';
  openPrintDocument(program.title + " 신청 명단", body);
}