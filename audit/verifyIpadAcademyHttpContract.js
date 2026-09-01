"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function verifyRouteRegistration() {
  const source = read("routes/api-routes.js");
  const authBoundary = source.indexOf("router.use(requireApiAuth)");
  assert.ok(authBoundary >= 0, "requireApiAuth 경계를 찾을 수 없습니다");
  for (const route of [
    'router.get("/academy/student", ipadAcademyController.dashboard)',
    'router.get("/academy/student/weeks/:weekId", ipadAcademyController.week)',
    '"/academy/student/weeks/:weekId/files/:fileId"',
    'router.post("/academy/student/join-code", ipadAcademyController.requestByCode)',
    'router.post("/academy/student/join", ipadAcademyController.requestByAcademy)',
    'router.post("/academy/student/leave", ipadAcademyController.leave)',
    'router.post("/academy/student/attendance/check-in", ipadAcademyController.checkIn)',
    'router.get("/academy/teacher", ipadAcademyController.teacherDashboard)',
    '"/academy/teacher/requests/:membershipId/approve"',
    '"/academy/teacher/requests/:membershipId/reject"',
    '"/academy/teacher/students/:membershipId/class"',
    'router.post("/academy/teacher/invites", ipadAcademyController.createInvite)',
    '"/academy/teacher/invites/:inviteId/revoke"',
  ]) {
    const position = source.indexOf(route);
    assert.ok(position > authBoundary, `${route}가 requireApiAuth 뒤에 등록되어야 합니다`);
  }
}

function verifySerializationBoundary() {
  const source = read("controllers/ipadAcademyController.js");
  for (const field of ["r2ObjectKey", "r2Sha256", "cloudPublicId", "activeStudentKey"]) {
    assert.ok(!source.includes(`${field}:`), `내부 저장 필드 ${field}를 앱 응답에 직렬화하면 안 됩니다`);
  }
  assert.match(source, /files:\s*\(week\.files \|\| \[\]\)\.map/);
  assert.match(source, /getStudentAttendanceDashboard/);
  assert.match(source, /getStudentAcademyWeekFileDownload/);
  assert.match(source, /teacherDashboardPayload/);
  assert.match(source, /portal\.students\.slice\(0, 50\)\.map\(serializeTeacherMembership\)/);
  assert.ok(!/res\.json\(\s*profile\s*\)/.test(source), "서비스 문서를 응답으로 그대로 내보내면 안 됩니다");
}

function main() {
  verifyRouteRegistration();
  verifySerializationBoundary();
  console.log("iPad 학원 HTTP 계약 통과");
}

Promise.resolve().then(main).then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
