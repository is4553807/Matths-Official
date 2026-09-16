"use strict";

// Real production router ordering + isolated Mongo only. Never load config.env.
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
process.env.NODE_ENV = "development";
process.env.DISABLE_SCHEDULERS = "1";
process.env.API_TOKEN_SECRET = crypto.randomBytes(48).toString("hex");
process.env.PASSWORD_RESET_SECRET = crypto.randomBytes(48).toString("hex");
require("../services/emailService").sendEmail = async () => ({ delivered: false });

const { NicknameChangeRequest, PasswordResetCode, User, UserNotification } = require("../models/matthsModel");
const { ParentAccount, ParentAlertDelivery, ParentChildLink, ParentNotification } = require("../models/parentModel");
const { evaluateParentAlerts } = require("../services/parentAlertService");
const { Academy, AcademyAccount, AcademyClass, AcademyClassWeek, AcademyStaff, AcademyStudentMembership, AcademyAttendance, AcademyAttendanceSession, AcademyAssignmentSubmission } = require("../models/academyModel");
const { MongoSessionStore } = require("../services/mongoSessionStore");
const { createAccessToken } = require("../services/mobileAuthService");

async function main() {
  let mongo;
  let listener;
  try {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri("admin_page_access_fixture"));
    const password = "IsolatedAdmin1234";
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({ name: "권한검사관리자", email: "admin@fixture.invalid", passwordHash, role: "admin", isActive: true, accountStatus: "active", schoolGrade: 10 });
    const student = await User.create({ name: "권한검사학생", email: "student@fixture.invalid", passwordHash, role: "student", isActive: true, accountStatus: "active", schoolGrade: 10 });
    const testStudent = await User.create({ name: "권한검사테스트학생", email: "test@fixture.invalid", passwordHash, role: "test", isActive: true, accountStatus: "active", schoolGrade: 10 });
    const teacher = await User.create({ name: "권한검사교사", email: "teacher@fixture.invalid", passwordHash, role: "teacher", isActive: true, accountStatus: "active", teacherAccessExpiresAt: new Date(Date.now() + 86400000) });
    await AcademyAccount.create({ teacherUserId: teacher._id, displayName: teacher.name, email: teacher.email, passwordHash, legacyPasswordDisabledAt: new Date() });
    const parent = await ParentAccount.create({ username: "권한검사학부모", usernameNormalized: "admin-preview-parent", email: "parent@fixture.invalid", passwordHash, childUserId: student._id, isActive: true });
    const unlinkedParent = await ParentAccount.create({ username: "연결대기학부모", usernameNormalized: "admin-preview-unlinked", email: "unlinked@fixture.invalid", passwordHash, isActive: true });
    const academy = await Academy.create({ name: "관리자열람학원", nameNormalized: "관리자열람학원", status: "ACTIVE", createdByUserId: teacher._id });
    await AcademyStaff.create({ academyId: academy._id, userId: teacher._id, role: "OWNER", status: "ACTIVE", currentStaffKey: String(teacher._id) });
    const academyClass = await AcademyClass.create({ academyId: academy._id, name: "관리자열람반", nameNormalized: "관리자열람반", createdByUserId: teacher._id, homeroomTeacherUserId: teacher._id, schedule: { weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: "18:00", endTime: "19:00", effectiveFrom: "2000-01-01", timezone: "Asia/Seoul" } });
    const week = await AcademyClassWeek.create({ academyId: academy._id, classId: academyClass._id, academicYear: 2026, weekNumber: 1, title: "관리자 열람 과제", concepts: [{ curriculumId: "2015-revised", courseId: "math-2", courseTitle: "수학 II", unitId: "limits", unitTitle: "함수의 극한", conceptId: "limit-basics", conceptTitle: "함수의 극한값" }], assignmentTitle: "관리자 열람 과제", assignmentInstructions: "권한 검사 문제", status: "PUBLISHED", createdByUserId: teacher._id, updatedByUserId: teacher._id, publishedAt: new Date() });
    await AcademyStudentMembership.create({ academyId: academy._id, classId: academyClass._id, studentUserId: student._id, status: "APPROVED", currentMembershipKey: String(student._id), approvedAt: new Date(0), dataConsentAt: new Date(0) });
    await AcademyClassWeek.updateOne({ _id: week._id }, { $set: { dueAt: new Date(Date.now() - 86400000), assignmentOmr: { enabled: true, questionCount: 1, sections: [{ startNumber: 1, endNumber: 1, answerType: "SHORT_ANSWER", choiceCount: 5 }], answerKey: ["1"], configuredByUserId: teacher._id, missedSubmissionsFinalizedAt: null } } });

    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.resolve(__dirname, "..", "views"));
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(session({ secret: crypto.randomBytes(48).toString("hex"), resave: false, saveUninitialized: false, store: new MongoSessionStore({ ttlSeconds: 600 }), cookie: { httpOnly: true, sameSite: "lax" } }));
    app.use((req, res, next) => { res.locals.assetVersion = "fixture"; res.locals.user = req.session.user || null; next(); });
    app.get("/__fixture/identity", (req, res) => res.json({ role: req.session.user?.role, accountType: req.session.user?.accountType, parentId: req.session.parent?.id || null }));
    app.use("/api/v1", require("../routes/api-routes"));
    app.use("/", require("../routes/parent-routes"));
    app.use("/", require("../routes/goat-arena-routes"));
    app.use("/", require("../routes/academy-routes"));
    app.use("/", require("../routes/matths-routes"));
    app.use(require("../middleware/errorMiddleware").errorHandler);
    listener = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const origin = `http://127.0.0.1:${listener.address().port}`;
    async function request(url, cookie, init = {}, expected = 200) {
      const response = await fetch(origin + url, { redirect: "manual", ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) } });
      const text = await response.text();
      assert.equal(response.status, expected, `${url}: ${response.status} ${text.slice(0, 700)}`);
      return { response, text };
    }
    async function login(url, email) {
      const { response } = await request(url, null, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password }) }, 302);
      const cookie = response.headers.get("set-cookie")?.match(/connect\.sid=[^;]+/)?.[0];
      assert.ok(cookie);
      return cookie;
    }
    const adminCookie = await login("/admin/login", admin.email);
    const adminHome = await request("/admin", adminCookie);
    assert.match(adminHome.text, /학원 화면 미리보기/);
    assert.match(adminHome.text, /학부모 화면 미리보기/);
    const adminToken = createAccessToken(admin);
    const teacherToken = createAccessToken(teacher);
    async function apiRequest(url, token, expected = 200) {
      return request(`/api/v1${url}`, null, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, expected);
    }
    await apiRequest("/admin/users", adminToken);
    await apiRequest("/admin/users", null, 401);
    for (const account of [student, testStudent, teacher]) await apiRequest("/admin/users", createAccessToken(account), 403);
    await apiRequest("/academy/teacher", teacherToken);
    await apiRequest("/academy/teacher", createAccessToken(student), 403);
    await request("/archive/admin", adminCookie);
    for (const url of ["/main", "/my-learning", "/profile", "/store", "/private-mock-exams", "/goat-arena"]) await request(url, adminCookie);
    await request("/academy", adminCookie);
    await request("/academy/setup", adminCookie);
    const portal = await request(`/academy?academyId=${academy._id}&tab=classes`, adminCookie);
    assert.match(portal.text, /관리자 미리보기 · 읽기 전용/);
    assert.match(portal.text, /관리자열람학원/);
    await request(`/academy/classes/${academyClass._id}`, adminCookie);
    assert.equal(await AcademyAssignmentSubmission.countDocuments({ weekId: week._id }), 0, "admin viewing a class must not auto-grade student assignments");
    assert.equal((await AcademyClassWeek.findById(week._id).lean()).assignmentOmr.missedSubmissionsFinalizedAt, null);
    for (const tab of ["dashboard", "students", "classes", "attendance", "requests", "invites", "teachers", "settings"]) await request(`/academy?tab=${tab}`, adminCookie);
    assert.equal(await AcademyAttendanceSession.countDocuments({ academyId: academy._id }), 0);
    assert.equal(await AcademyAttendance.countDocuments({ academyId: academy._id }), 0);
    const adminCsv = await request(`/academy/attendance/export.csv?date=2026-09-14&classId=${academyClass._id}`, adminCookie);
    assert.match(adminCsv.response.headers.get("content-type"), /text\/csv/);
    assert.match(adminCsv.response.headers.get("content-disposition"), /attachment; filename="matths-attendance-2026-09-14.csv"/);
    assert.doesNotMatch(adminCsv.text, /admin-page-preview-bar|<script/);
    const preview = await request(`/academy/classes/${academyClass._id}/weeks/${week._id}/preview`, adminCookie);
    assert.match(preview.text, /관리자 열람 과제/);
    const redirectedWeek = await request(`/my-academy/weeks/${week._id}`, adminCookie, {}, 302);
    assert.match(redirectedWeek.response.headers.get("location"), /\/preview$/);
    await request("/my-academy/weeks/not-an-id", adminCookie, {}, 404);
    await request("/parent", adminCookie);
    const beforeLinks = await ParentChildLink.countDocuments({ parentAccountId: parent._id });
    const dashboard = await request(`/parent?parentId=${parent._id}`, adminCookie);
    assert.match(dashboard.text, /관리자 미리보기 · 읽기 전용/);
    assert.match(dashboard.text, /권한검사학생/);
    for (const url of ["/parent/notifications", "/parent/payments", "/parent/inquiries", "/parent/pricing", "/parent/checkout/MOCK_EXAM_ONLY"]) await request(url, adminCookie);
    assert.equal(await ParentChildLink.countDocuments({ parentAccountId: parent._id }), beforeLinks, "admin preview must not create legacy child links");
    await request(`/parent?parentId=${unlinkedParent._id}`, adminCookie);
    await request("/parent/notifications", adminCookie);
    await ParentAccount.updateOne({ _id: unlinkedParent._id }, { $set: { childUserId: testStudent._id } });
    await ParentChildLink.create({ parentAccountId: unlinkedParent._id, childUserId: testStudent._id, status: "REVOKED", linkedAt: new Date(0) });
    const revokedPreview = await request(`/parent?parentId=${unlinkedParent._id}`, adminCookie);
    assert.match(revokedPreview.text, /자녀 연결/);
    assert.doesNotMatch(revokedPreview.text, /권한검사테스트학생/);
    await request("/parent/notifications", adminCookie, { method: "POST" }, 403);
    await request(`/academy/classes/${academyClass._id}/weeks`, adminCookie, { method: "POST" }, 403);
    const identity = JSON.parse((await request("/__fixture/identity", adminCookie)).text);
    assert.deepEqual(identity, { role: "admin", accountType: "admin", parentId: null });
    assert.equal(await AcademyStaff.countDocuments({ userId: admin._id }), 0, "preview must not create staff membership for the administrator");
    const studentCookie = await login("/student/login", student.email);
    const testCookie = await login("/student/login", testStudent.email);
    const teacherCookie = await login("/academy/login", teacher.email);
    const pendingTeacher = await User.create({ name: "승인대기교사", email: "pending-teacher@fixture.invalid", passwordHash, role: "teacher", isActive: true, accountStatus: "active", teacherAccessExpiresAt: new Date(Date.now() + 86400000) });
    await AcademyAccount.create({ teacherUserId: pendingTeacher._id, displayName: pendingTeacher.name, email: pendingTeacher.email, passwordHash, legacyPasswordDisabledAt: new Date() });
    const pendingTeacherCookie = await login("/academy/login", pendingTeacher.email);
    const parentCookie = await login("/parent/login", parent.email);
    const unlinkedParentCookie = await login("/parent/login", unlinkedParent.email);
    const teacherNotice = await UserNotification.create({ userId: teacher._id, title: "교사 전용 안내", message: "교사 우편함 내용", href: "/academy", kind: "admin" });
    const pendingTeacherNotice = await UserNotification.create({ userId: pendingTeacher._id, title: "승인대기 교사 안내", message: "학원 연결 전에도 우편함 접근", href: "/academy/setup" });
    const parentNotice = await ParentNotification.create({ parentAccountId: parent._id, title: "학부모 전용 안내", message: "학부모 우편함 내용", href: "/parent/notifications" });
    const otherParentNotice = await ParentNotification.create({ parentAccountId: unlinkedParent._id, title: "다른 학부모 안내", message: "다른 학부모의 내용" });
    const teacherMailbox = await request("/academy?tab=mailbox", teacherCookie);
    assert.match(teacherMailbox.text, /교사 전용 안내/);
    assert.doesNotMatch(teacherMailbox.text, /학부모 전용 안내/);
    assert.doesNotMatch(teacherMailbox.text, /승인대기 교사 안내/);
    assert.match(teacherMailbox.text, /우편함\s*<b>1<\/b>/);
    assert.match((await request("/academy/setup", pendingTeacherCookie)).text, /우편함 확인/);
    const pendingMailbox = await request("/academy?tab=mailbox", pendingTeacherCookie);
    assert.match(pendingMailbox.text, /승인대기 교사 안내/);
    assert.doesNotMatch(pendingMailbox.text, /교사 전용 안내/);
    await request(`/academy?tab=mailbox&notificationId=${teacherNotice._id}`, pendingTeacherCookie, {}, 404);
    await request("/academy?tab=mailbox", studentCookie, {}, 403);
    const adminTeacherMailboxPreview = await request("/academy?tab=mailbox", adminCookie);
    assert.doesNotMatch(adminTeacherMailboxPreview.text, /교사 전용 안내/);
    await request(`/academy?tab=mailbox&notificationId=${teacherNotice._id}`, teacherCookie);
    assert.ok((await UserNotification.findById(teacherNotice._id).lean()).readAt);
    const parentMailbox = await request("/parent/mailbox", parentCookie);
    assert.match(parentMailbox.text, /학부모 전용 안내/);
    assert.match(parentMailbox.text, /우편함\s*<b>1<\/b>/);
    assert.doesNotMatch(parentMailbox.text, /다른 학부모 안내/);
    await request("/parent/mailbox", unlinkedParentCookie);
    await request(`/parent/mailbox?notificationId=${otherParentNotice._id}`, parentCookie, {}, 404);
    const adminParentMailboxPreview = await request(`/parent/mailbox?parentId=${parent._id}&notificationId=${parentNotice._id}`, adminCookie);
    assert.match(adminParentMailboxPreview.text, /관리자 미리보기 · 읽기 전용/);
    assert.equal((await ParentNotification.findById(parentNotice._id).lean()).readAt, null);
    await request(`/parent/mailbox?notificationId=${parentNotice._id}`, parentCookie);
    assert.ok((await ParentNotification.findById(parentNotice._id).lean()).readAt);
    await request("/parent/mailbox/read-all", adminCookie, { method: "POST" }, 403);
    const parentSend = await request(`/admin/parents/${parent._id}/notification`, adminCookie, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title: "운영자 학부모 안내", message: "운영자가 보낸 학부모 우편", href: "/parent" }),
    }, 302);
    assert.match(parentSend.response.headers.get("location"), /done=notification/);
    assert.match((await request("/parent/mailbox", parentCookie)).text, /운영자 학부모 안내/);
    const alertLink = await ParentChildLink.create({
      parentAccountId: parent._id, childUserId: student._id, status: "ACTIVE",
      notificationSettings: { emailEnabled: false, inactivity: { enabled: true, days: 3 }, lowLearning: { enabled: false } },
    });
    await User.updateOne({ _id: student._id }, { $set: { lastLoginAt: new Date(Date.now() - 8 * 86400000) } });
    const alertResult = await evaluateParentAlerts({ force: true, sendEmailFn: async () => { throw new Error("email was disabled"); } });
    assert.equal(alertResult.processed, 1);
    assert.equal((await ParentAlertDelivery.findOne({ parentChildLinkId: alertLink._id }).lean()).status, "IN_APP");
    assert.match((await request("/parent/mailbox", parentCookie)).text, /최근 접속을 확인해주세요/);
    await evaluateParentAlerts({ force: true, sendEmailFn: async () => { throw new Error("email was disabled"); } });
    assert.equal(await ParentNotification.countDocuments({ parentAccountId: parent._id, kind: "learning" }), 1, "scheduled alerts must be idempotent");
    await ParentChildLink.updateOne({ _id: alertLink._id }, { $set: { "notificationSettings.emailEnabled": true } });
    let emailCalls = 0;
    const emailAlert = await evaluateParentAlerts({
      force: true, now: new Date(Date.now() + 8 * 86400000),
      sendEmailFn: async () => { emailCalls += 1; return { delivered: true, providerMessageId: "isolated-fixture" }; },
    });
    assert.equal(emailAlert.processed, 1);
    assert.equal(emailCalls, 1);
    assert.equal(await ParentAlertDelivery.countDocuments({ parentChildLinkId: alertLink._id, status: "SENT" }), 1);
    assert.equal(await ParentNotification.countDocuments({ parentAccountId: parent._id, kind: "learning" }), 2, "email alerts must also reach the mailbox");
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetLink = await PasswordResetCode.create({
      userId: teacher._id, accountType: "academy", mode: "link", status: "pending",
      codeHash: crypto.createHmac("sha256", process.env.PASSWORD_RESET_SECRET).update(`${teacher._id}:${resetToken}`).digest("hex"),
      expiresAt: new Date(Date.now() + 600000),
    });
    const resetPath = `/forgot-password/link?resetId=${resetLink._id}&token=${resetToken}&accountType=academy`;
    const mismatchedReset = await request(resetPath, parentCookie, {}, 403);
    assert.match(mismatchedReset.text, /ACCOUNT_LINK_SESSION_MISMATCH/);
    assert.match(mismatchedReset.text, /현재 로그인된 계정은 이 이메일 링크의 대상 계정이 아니므로/);
    assert.match(mismatchedReset.text, /action="\/parent\/logout"/);
    assert.match(mismatchedReset.text, /현재 계정 로그아웃/);
    assert.equal((await PasswordResetCode.findById(resetLink._id).lean()).status, "pending", "mismatched login must not consume a valid email link");
    assert.match((await request(resetPath, studentCookie, {}, 403)).text, /action="\/logout"/);
    await request(resetPath, teacherCookie);
    assert.equal((await PasswordResetCode.findById(resetLink._id).lean()).status, "verified");
    const resetCode = "123456";
    const codeRecord = await PasswordResetCode.create({
      userId: teacher._id, accountType: "academy", mode: "code", status: "pending",
      codeHash: crypto.createHmac("sha256", process.env.PASSWORD_RESET_SECRET).update(`${teacher._id}:${resetCode}`).digest("hex"),
      expiresAt: new Date(Date.now() + 600000),
    });
    const verifyCodeRequest = {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: teacher.email, code: resetCode, accountType: "academy" }),
    };
    assert.match((await request("/forgot-password/verify", parentCookie, verifyCodeRequest, 403)).text, /action="\/parent\/logout"/);
    assert.equal((await PasswordResetCode.findById(codeRecord._id).lean()).status, "pending", "wrong session must not verify another account's code");
    await request("/forgot-password/verify", teacherCookie, verifyCodeRequest);
    assert.equal((await PasswordResetCode.findById(codeRecord._id).lean()).status, "verified");
    const parentLogoutCookie = await login("/parent/login", parent.email);
    assert.match((await request(resetPath, parentLogoutCookie, {}, 403)).text, /action="\/parent\/logout"/);
    await request("/parent/logout", parentLogoutCookie, { method: "POST" }, 302);
    assert.equal(JSON.parse((await request("/__fixture/identity", parentLogoutCookie)).text).parentId, null);
    const studentResetToken = crypto.randomBytes(32).toString("hex");
    const studentResetLink = await PasswordResetCode.create({
      userId: student._id, accountType: "student", mode: "link", status: "pending",
      codeHash: crypto.createHmac("sha256", process.env.PASSWORD_RESET_SECRET).update(`${student._id}:${studentResetToken}`).digest("hex"),
      expiresAt: new Date(Date.now() + 600000),
    });
    const studentResetPath = `/forgot-password/link?resetId=${studentResetLink._id}&token=${studentResetToken}&accountType=student`;
    const teacherLogoutCookie = await login("/academy/login", teacher.email);
    assert.match((await request(studentResetPath, teacherLogoutCookie, {}, 403)).text, /action="\/academy\/logout"/);
    await request("/academy/logout", teacherLogoutCookie, { method: "POST" }, 302);
    assert.equal(JSON.parse((await request("/__fixture/identity", teacherLogoutCookie)).text).role, undefined);
    assert.equal((await PasswordResetCode.findById(studentResetLink._id).lean()).status, "pending");
    const nicknameToken = crypto.randomBytes(32).toString("hex");
    const nicknameRequest = await NicknameChangeRequest.create({
      userId: teacher._id,
      requestedBy: admin._id,
      reason: "교사 닉네임 확인 요청",
      tokenHash: crypto.createHash("sha256").update(nicknameToken).digest("hex"),
      expiresAt: new Date(Date.now() + 86400000),
      previousName: teacher.name,
    });
    const nicknamePath = `/nickname-change?requestId=${nicknameRequest._id}&token=${nicknameToken}`;
    const teacherNicknamePage = await request(nicknamePath, teacherCookie);
    assert.match(teacherNicknamePage.text, /교사 닉네임 확인 요청/);
    assert.match(teacherNicknamePage.text, /학원 홈으로/);
    assert.doesNotMatch(teacherNicknamePage.text, /학습 메뉴/);
    assert.match((await request(nicknamePath, studentCookie, {}, 403)).text, /action="\/logout"/);
    await request(nicknamePath, adminCookie, {}, 403);
    await request(nicknamePath, parentCookie, {}, 403);
    const anonymousNicknamePage = await request(nicknamePath, null, {}, 302);
    assert.match(anonymousNicknamePage.response.headers.get("location"), /\/login$/);
    const pendingNicknameCookie = anonymousNicknamePage.response.headers.get("set-cookie")?.match(/connect\.sid=[^;]+/)?.[0];
    assert.ok(pendingNicknameCookie);
    const teacherLinkLogin = await request("/login", pendingNicknameCookie, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: teacher.email, password }),
    }, 302);
    assert.ok(teacherLinkLogin.response.headers.get("location")?.endsWith(nicknamePath), "teacher login must return to the nickname email link after anonymous entry");
    const nicknameCheck = await request("/nickname-change/check", teacherCookie, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ requestId: String(nicknameRequest._id), token: nicknameToken, nickname: "변경된교사닉네임" }),
    });
    const nicknameProof = JSON.parse(nicknameCheck.text).proof;
    assert.ok(nicknameProof);
    const nicknameCompleted = await request("/nickname-change", teacherCookie, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ requestId: String(nicknameRequest._id), token: nicknameToken, nickname: "변경된교사닉네임", proof: nicknameProof }),
    }, 302);
    assert.match(nicknameCompleted.response.headers.get("location"), /\/academy\?nicknameChanged=1$/);
    assert.equal((await User.findById(teacher._id).lean()).name, "변경된교사닉네임");
    assert.equal((await NicknameChangeRequest.findById(nicknameRequest._id).lean()).status, "completed");
    await request(nicknamePath, teacherCookie, {}, 404);
    for (const cookie of [studentCookie, testCookie, teacherCookie]) await request("/admin", cookie, {}, 403);
    for (const cookie of [studentCookie, testCookie]) {
      await request("/main", cookie);
      await request(`/academy?academyId=${academy._id}`, cookie, {}, 403);
      await request(`/parent?parentId=${parent._id}`, cookie, {}, 302);
    }
    await request("/admin", null, {}, 302);
    await request("/academy", null, {}, 302);
    await request("/parent", null, {}, 302);
    await request("/admin", parentCookie, {}, 302);
    await request("/academy/attendance/export.csv", studentCookie, {}, 403);
    await request("/academy/attendance/export.csv", parentCookie, {}, 302);
    await request("/academy/attendance/export.csv", null, {}, 302);
    await request(`/academy/attendance/export.csv?date=2026-09-14&classId=${academyClass._id}`, teacherCookie);
    await request("/main", teacherCookie, {}, 403);
    await request("/profile", teacherCookie, {}, 403);
    await request("/main", parentCookie, {}, 302);
    await request(`/academy?academyId=${academy._id}`, parentCookie, {}, 302);
    await request(`/parent?parentId=${parent._id}`, teacherCookie, {}, 302);
    await request(`/academy?academyId=${academy._id}`, studentCookie, {}, 403);
    await request(`/parent?parentId=${parent._id}`, studentCookie, {}, 302);
    const ownTeacher = await request("/academy?tab=classes", teacherCookie);
    assert.doesNotMatch(ownTeacher.text, /admin-page-preview-bar/);
    await User.updateOne({ _id: admin._id }, { $set: { role: "student" } });
    await request("/admin", adminCookie, {}, 403);
    await request("/academy?tab=classes", adminCookie, {}, 403);
    await request(`/parent?parentId=${parent._id}`, adminCookie, {}, 302);
    await apiRequest("/admin/users", adminToken, 403);
    await User.updateOne({ _id: teacher._id }, { $set: { teacherAccessExpiresAt: new Date(0) } });
    await request("/academy?tab=classes", teacherCookie, {}, 403);
    await request("/academy/attendance/export.csv", teacherCookie, {}, 403);
    await apiRequest("/academy/teacher", teacherToken, 403);
    await User.updateOne({ _id: student._id }, { $set: { isActive: false, accountStatus: "inactive" } });
    await request("/main", studentCookie, {}, 302);
    await apiRequest("/me", createAccessToken(student), 401);
    await ParentAccount.updateOne({ _id: parent._id }, { $set: { isActive: false } });
    await request("/parent", parentCookie, {}, 302);
    await User.updateOne({ _id: admin._id }, { $set: { role: "admin", accountStatus: "suspended", isActive: true } });
    await request("/admin", adminCookie, {}, 302);
    await apiRequest("/admin/users", adminToken, 401);
    console.log("Real mounted web/API routes verified: role-scoped teacher/parent mailboxes, admin direct parent notices, account-mismatched email links without token consumption, admin/student access and previews, nickname login return, read-only boundaries, revoked child links, role downgrades, inactive accounts, and expired teacher contracts.");
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
