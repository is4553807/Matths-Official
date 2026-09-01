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
    '"/academy/teacher/staff/:staffId/approve"',
    '"/academy/teacher/staff/:staffId/reject"',
    '"/academy/teacher/staff/:staffId/revoke"',
    'router.post("/academy/teacher/classes", ipadAcademyController.createTeacherClass)',
    '"/academy/teacher/classes/:classId/settings"',
    '"/academy/teacher/classes/:classId/archive"',
    '"/academy/teacher/classes/:classId/restore"',
    '"/academy/teacher/attendance/sessions/:sessionId/regenerate-code"',
    '"/academy/teacher/classes/:classId/classwork"',
    '"/academy/teacher/classes/:classId/classwork/weeks"',
    '"/academy/teacher/classes/:classId/classwork/weeks/:weekId/files/:fileId/remove"',
    '"/academy/teacher/classes/:classId/classwork/weeks/:weekId/delete"',
    '"/academy/teacher/classes/:classId/classwork/weeks/:weekId/files/:fileId"',
    'router.get("/academy/admin", ipadAcademyController.adminDashboard)',
    '"/academy/admin/applications/:academyId/approve"',
    '"/academy/admin/applications/:academyId/reject"',
  ]) {
    const position = source.indexOf(route);
    assert.ok(position > authBoundary, `${route}가 requireApiAuth 뒤에 등록되어야 합니다`);
  }
  assert.match(
    source.slice(authBoundary),
    /router\.get\(\s*"\/academy\/teacher\/attendance",\s*ipadAcademyController\.teacherAttendance\s*\)/,
    "교사 출결 조회 GET 경로가 인증 경계 뒤에 등록되어야 합니다"
  );
  assert.match(
    source.slice(authBoundary),
    /router\.post\(\s*"\/academy\/teacher\/attendance",\s*ipadAcademyController\.saveTeacherAttendance\s*\)/,
    "교사 출결 저장 POST 경로가 인증 경계 뒤에 등록되어야 합니다"
  );
  assert.match(
    source.slice(authBoundary),
    /router\.post\(\s*"\/academy\/teacher\/attendance\/sessions\/:sessionId\/regenerate-code",\s*ipadAcademyController\.regenerateTeacherAttendanceCode\s*\)/,
    "교사 출결 코드 재발급 경로가 인증 경계 뒤에 등록되어야 합니다"
  );
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
  assert.match(source, /getAcademyAttendanceRoster/);
  assert.match(source, /saveAcademyAttendanceRoster/);
  assert.match(source, /regenerateAttendanceSessionCode/);
  assert.match(source, /function serializeTeacherAttendance\(roster\)/);
  assert.match(source, /studentUserIds: records\.map/);
  assert.match(source, /getAcademyClassworkTeacherView/);
  assert.match(source, /saveAcademyClassWeek/);
  assert.match(source, /removeAcademyClassWeekFile/);
  assert.match(source, /deleteAcademyClassWeek/);
  assert.match(source, /getTeacherAcademyWeekFileDownload/);
  assert.match(source, /serializeTeacherClasswork/);
  assert.match(source, /serializeTeacherStaff/);
  assert.match(source, /approveAcademyStaff/);
  assert.match(source, /rejectAcademyStaff/);
  assert.match(source, /revokeAcademyStaff/);
  assert.match(source, /createAcademyClass/);
  assert.match(source, /updateAcademyClassSettings/);
  assert.match(source, /archiveAcademyClass/);
  assert.match(source, /restoreAcademyClass/);
  assert.match(source, /discardRequestUploads\(req\)/);
  const attendanceService = read("services/academyAttendanceService.js");
  assert.match(attendanceService, /!selectedClass && context\.staff\.role !== "OWNER"/);
  assert.match(attendanceService, /담당 반이 지정된 선생님만 출결을 기록할 수 있습니다/);
  assert.match(source, /adminDashboardPayload/);
  assert.match(source, /getAdminAcademyList/);
  assert.match(source, /approveAcademyApplication/);
  assert.match(source, /rejectAcademyApplication/);
  assert.match(source, /result\.academies\.map\(serializeAdminAcademyApplication\)/);
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
