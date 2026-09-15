"use strict";

/*
 * 역할별 로그인 저장소, 세션 경계, 학생 화면 권한, 교사의 학생 과제
 * 미리보기를 실제 Express + Mongo 세션으로 검증한다.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");

const academyAuthController = require("../controllers/academyAuthController");
const academyController = require("../controllers/academyController");
const apiController = require("../controllers/apiController");
const matthsController = require("../controllers/matthsController");
const parentController = require("../controllers/parentController");
const authMiddleware = require("../middleware/authMiddleware");
const { isParentLoggedIn } = require("../middleware/parentAuthMiddleware");
const { MongoSessionStore } = require("../services/mongoSessionStore");
const { ensureParentAccountIndexes } = require("../services/parentFamilyService");
const { migrateLegacyAcademyAccounts } = require("../services/academyAccountService");
const { User, PasswordResetCode } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { resetPassword } = require("../services/passwordResetService");
const { authenticateWebAccount } = require("../services/webLoginService");
const {
  Academy,
  AcademyAccount,
  AcademyClass,
  AcademyClassWeek,
  AcademyStaff,
} = require("../models/academyModel");

function password() {
  return `Qa1!${crypto.randomBytes(24).toString("base64url")}`;
}

function sessionCookie(response) {
  const raw = String(response.headers.get("set-cookie") || "");
  const match = raw.match(/connect\.sid=[^;]+/);
  assert.ok(match, "로그인 성공 응답이 새 세션 쿠키를 설정해야 합니다.");
  return match[0];
}

async function postForm(origin, pathname, fields) {
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
    },
    body: new URLSearchParams(fields),
  });
}

async function sessionView(origin, cookie) {
  const response = await fetch(`${origin}/__test/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function main() {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    DISABLE_SCHEDULERS: process.env.DISABLE_SCHEDULERS,
    API_TOKEN_SECRET: process.env.API_TOKEN_SECRET,
  };
  process.env.NODE_ENV = "development";
  process.env.DISABLE_SCHEDULERS = "1";
  process.env.API_TOKEN_SECRET = crypto.randomBytes(48).toString("base64url");

  let replicaSet;
  let listener;
  try {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: "8.2.6" },
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    await mongoose.connect(replicaSet.getUri("matths_separated_portal_fixture"));
    await ensureParentAccountIndexes();
    await Promise.all([AcademyAccount.init(), AcademyStaff.init(), AcademyClassWeek.init()]);

    assert.notEqual(User.collection.name, ParentAccount.collection.name);
    assert.notEqual(User.collection.name, AcademyAccount.collection.name);
    assert.notEqual(ParentAccount.collection.name, AcademyAccount.collection.name);

    const now = new Date();
    const studentPassword = password();
    const teacherPassword = password();
    const adminPassword = password();
    const parentPassword = password();
    const student = await User.create({
      name: "역할분리학생",
      nameNormalized: "역할분리학생",
      realName: "역할 분리 학생",
      email: `student-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(studentPassword, 10),
      role: "student",
      isActive: true,
      accountStatus: "active",
      schoolGrade: 10,
      termsAcceptedAt: now,
    });
    const teacher = await User.create({
      name: "역할분리교사",
      nameNormalized: "역할분리교사",
      realName: "역할 분리 교사",
      email: `teacher-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(teacherPassword, 10),
      role: "teacher",
      isActive: true,
      accountStatus: "active",
      teacherAccessExpiresAt: new Date(Date.now() + 86_400_000),
      termsAcceptedAt: now,
    });
    const admin = await User.create({
      name: "역할분리운영자",
      nameNormalized: "역할분리운영자",
      realName: "역할 분리 운영자",
      email: `admin-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "admin",
      isActive: true,
      accountStatus: "active",
      termsAcceptedAt: now,
    });
    const academyAccount = await AcademyAccount.create({
      teacherUserId: teacher._id,
      displayName: teacher.realName,
      email: teacher.email,
      passwordHash: await bcrypt.hash(teacherPassword, 10),
      acceptedTermsAt: now,
      acceptedPrivacyAt: now,
    });
    const academy = await Academy.create({
      name: "분리 검증 학원",
      nameNormalized: "분리 검증 학원",
      status: "ACTIVE",
      contractStartsAt: new Date(Date.now() - 86_400_000),
      contractEndsAt: new Date(Date.now() + 86_400_000),
      createdByUserId: teacher._id,
    });
    await AcademyStaff.create({
      academyId: academy._id,
      userId: teacher._id,
      role: "OWNER",
      status: "ACTIVE",
      currentStaffKey: String(teacher._id),
      joinedAt: now,
    });
    const academyClass = await AcademyClass.create({
      academyId: academy._id,
      name: "고1 A반",
      nameNormalized: "고1 a반",
      createdByUserId: teacher._id,
      homeroomTeacherUserId: teacher._id,
    });
    const week = await AcademyClassWeek.create({
      academyId: academy._id,
      classId: academyClass._id,
      academicYear: 2026,
      weekNumber: 3,
      title: "함수의 극한",
      lessonSummary: "학생 화면 미리보기 검증 수업",
      concepts: [{
        curriculumId: "2015-revised",
        courseId: "math-2",
        courseTitle: "수학 II",
        unitId: "limits",
        unitTitle: "함수의 극한",
        conceptId: "limit-basics",
        conceptTitle: "함수의 극한값",
      }],
      assignmentTitle: "극한 기본문제 1–2번",
      assignmentInstructions: "문제를 풀고 답안지에 입력하세요.",
      assignmentOmr: {
        enabled: true,
        questionCount: 2,
        sections: [{ startNumber: 1, endNumber: 2, answerType: "SHORT_ANSWER", choiceCount: 5 }],
        answerKey: ["top-secret-answer", "2"],
        configuredByUserId: teacher._id,
      },
      createdByUserId: teacher._id,
      updatedByUserId: teacher._id,
    });

    const parent = await ParentAccount.create({
      username: "역할 분리 학부모",
      usernameNormalized: `parent-${crypto.randomUUID().slice(0, 20)}`,
      email: `parent-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(parentPassword, 10),
      childUserId: student._id,
      isActive: true,
    });
    const unlinkedParent = await ParentAccount.create({
      username: "연결 대기 학부모",
      usernameNormalized: `parent-${crypto.randomUUID().slice(0, 20)}`,
      email: `parent-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(password(), 10),
      childUserId: null,
      isActive: true,
    });
    assert.equal(unlinkedParent.childUserId, null, "학부모는 자녀 연결 전에도 독립 가입할 수 있어야 합니다.");

    const legacyTeacherPassword = password();
    const legacyTeacher = await User.create({
      name: "기존교사이전",
      nameNormalized: "기존교사이전",
      realName: "기존 교사 이전",
      email: `legacy-teacher-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(legacyTeacherPassword, 10),
      role: "teacher",
      isActive: true,
      accountStatus: "active",
      teacherAccessExpiresAt: new Date(Date.now() + 86_400_000),
      termsAcceptedAt: now,
    });
    const migration = await migrateLegacyAcademyAccounts();
    assert.equal(migration.migratedCount, 1);
    const migratedAccount = await AcademyAccount.findOne({ teacherUserId: legacyTeacher._id })
      .select("+passwordHash")
      .lean();
    assert.ok(await bcrypt.compare(legacyTeacherPassword, migratedAccount.passwordHash));
    const migratedLegacyUser = await User.findById(legacyTeacher._id).select("+passwordHash").lean();
    assert.equal(await bcrypt.compare(legacyTeacherPassword, migratedLegacyUser.passwordHash), false);
    assert.ok(migratedAccount.legacyPasswordDisabledAt);

    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.resolve(__dirname, "..", "views"));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({
      secret: crypto.randomBytes(48).toString("base64url"),
      resave: false,
      saveUninitialized: false,
      store: new MongoSessionStore({ ttlSeconds: 600 }),
      cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 600_000 },
    }));
    app.use((_req, res, next) => {
      res.locals.assetVersion = "test";
      next();
    });
    const setAccountType = (accountType) => (req, _res, next) => {
      req.authAccountType = accountType;
      next();
    };
    // Match production: this router is mounted before academy/matths routes.
    // Its student-only marker must not leak onto /admin or /academy requests.
    app.use("/", require("../routes/goat-arena-routes"));
    app.post("/student/login", setAccountType("student"), matthsController.login);
    app.post("/admin/login", setAccountType("admin"), matthsController.login);
    app.post("/academy/login", academyAuthController.login);
    app.post("/parent/login", parentController.login);
    app.post("/academy/register", academyAuthController.register);
    app.post("/parent/register", parentController.register);
    app.post("/api/login", apiController.login);
    app.get(
      "/admin",
      authMiddleware.isLoggedIn,
      authMiddleware.isAdmin,
      (_req, res) => res.send("admin-ok")
    );
    app.get(
      "/student-area",
      authMiddleware.requireStudentAccount,
      authMiddleware.isLoggedIn,
      (_req, res) => res.send("student-ok")
    );
    app.get(
      "/academy-area",
      authMiddleware.isLoggedIn,
      authMiddleware.isTeacher,
      (_req, res) => res.send("academy-ok")
    );
    app.get("/parent-area", isParentLoggedIn, (_req, res) => res.send("parent-ok"));
    app.get(
      "/academy/classes/:classId/weeks/:weekId/preview",
      authMiddleware.isLoggedIn,
      authMiddleware.isTeacher,
      academyController.studentAssignmentPreview
    );
    app.get("/__test/session", (req, res) => {
      res.json({
        userRole: req.session?.user?.role || null,
        userAccountType: req.session?.user?.accountType || null,
        parentId: req.session?.parent?.id || null,
      });
    });
    app.use((error, _req, res, _next) => {
      res.status(Number(error?.status) || 500).json({ code: error?.code || "", error: error?.message || "unexpected" });
    });
    listener = await new Promise((resolve) => {
      const server = app.listen(0, "127.0.0.1", () => resolve(server));
    });
    const origin = `http://127.0.0.1:${listener.address().port}`;

    const studentResponse = await postForm(origin, "/student/login", {
      email: student.email,
      password: studentPassword,
    });
    assert.equal(studentResponse.status, 302);
    assert.equal(studentResponse.headers.get("location"), "/main");
    const studentCookie = sessionCookie(studentResponse);
    assert.deepEqual(await sessionView(origin, studentCookie), {
      userRole: "student",
      userAccountType: "student",
      parentId: null,
    });

    const academyResponse = await postForm(origin, "/academy/login", {
      email: academyAccount.email,
      password: teacherPassword,
    });
    assert.equal(academyResponse.status, 302);
    assert.equal(academyResponse.headers.get("location"), "/academy");
    const academyCookie = sessionCookie(academyResponse);
    assert.deepEqual(await sessionView(origin, academyCookie), {
      userRole: "teacher",
      userAccountType: "academy",
      parentId: null,
    });
    const academyApiResponse = await postForm(origin, "/api/login", {
      email: academyAccount.email,
      password: teacherPassword,
    });
    const academyApiBody = await academyApiResponse.text();
    assert.equal(academyApiResponse.status, 200, academyApiBody);
    const academyApiLogin = JSON.parse(academyApiBody);
    assert.equal(academyApiLogin.user.role, "teacher");
    assert.match(academyApiLogin.accessToken, /\S+/);

    const adminResponse = await postForm(origin, "/admin/login", {
      email: admin.email,
      password: adminPassword,
    });
    assert.equal(adminResponse.status, 302);
    assert.equal(adminResponse.headers.get("location"), "/admin");
    const adminCookie = sessionCookie(adminResponse);
    assert.equal((await sessionView(origin, adminCookie)).userAccountType, "admin");
    assert.equal((await fetch(`${origin}/admin`, { headers: { Cookie: adminCookie }, redirect: "manual" })).status, 200, "admin must reach its dashboard after login with production router ordering");

    const parentResponse = await postForm(origin, "/parent/login", {
      email: parent.email,
      password: parentPassword,
    });
    assert.equal(parentResponse.status, 302);
    assert.equal(parentResponse.headers.get("location"), "/parent");
    const parentCookie = sessionCookie(parentResponse);
    assert.deepEqual(await sessionView(origin, parentCookie), {
      userRole: null,
      userAccountType: null,
      parentId: String(parent._id),
    });

    for (const pathname of ["/student/login", "/academy/login", "/parent/login", "/admin/login"]) {
      for (const [account, secret, destination, role, type] of [
        [student, studentPassword, "/main", "student", "student"],
        [teacher, teacherPassword, "/academy", "teacher", "academy"],
        [parent, parentPassword, "/parent", null, null],
        [admin, adminPassword, "/admin", "admin", "admin"],
      ]) {
        const response = await postForm(origin, pathname, { email: account.email, password: secret, next: destination === "/main" ? "/admin/users" : "/main" });
        assert.equal(response.status, 302, `${pathname} must authenticate an account independently of its role`);
        assert.equal(response.headers.get("location"), destination);
        const identity = await sessionView(origin, sessionCookie(response));
        assert.equal(identity.userRole, role);
        assert.equal(identity.userAccountType, type);
        assert.equal(identity.parentId, role ? null : String(parent._id));
        const wrong = await postForm(origin, pathname, { email: account.email, password: password() });
        assert.equal(wrong.status, 401);
      }
    }

    const newAcademyEmail = `academy-signup-${crypto.randomUUID()}@qa.invalid`;
    const academySignup = await postForm(origin, "/academy/register", {
      displayName: "신규 학원 담당자",
      academyName: "신규 가입 학원",
      address: "서울시 강남구 테스트로 10",
      contactPhone: "02-1234-5678",
      authorityConfirmed: "1",
      email: newAcademyEmail,
      password: "Academy1234",
      passwordConfirm: "Academy1234",
      termsAccepted: "1",
    });
    assert.equal(academySignup.status, 302);
    assert.equal(academySignup.headers.get("location"), "/academy/setup?registered=1");
    const createdAcademyAccount = await AcademyAccount.findOne({ email: newAcademyEmail }).lean();
    assert.ok(createdAcademyAccount?.teacherUserId);
    assert.equal((await User.findById(createdAcademyAccount.teacherUserId).lean()).role, "teacher");
    assert.equal((await Academy.findOne({ createdByUserId: createdAcademyAccount.teacherUserId }).lean()).status, "PENDING");

    const newParentEmail = `parent-signup-${crypto.randomUUID()}@qa.invalid`;
    const parentSignup = await postForm(origin, "/parent/register", {
      displayName: "신규 학부모",
      email: newParentEmail,
      password: "Parent1234",
      passwordConfirm: "Parent1234",
      termsAccepted: "1",
    });
    assert.equal(parentSignup.status, 302);
    assert.equal(parentSignup.headers.get("location"), "/parent?welcome=1");
    assert.equal((await ParentAccount.findOne({ email: newParentEmail }).lean()).childUserId, null);

    assert.equal((await fetch(`${origin}/student-area`, { headers: { Cookie: studentCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/student-area`, { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/academy-area`, { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/parent-area`, { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/academy-area`, { headers: { Cookie: academyCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/parent-area`, { headers: { Cookie: parentCookie } })).status, 200);
    assert.equal((await fetch(`${origin}/student-area`, { headers: { Cookie: academyCookie }, redirect: "manual" })).status, 403);
    assert.equal((await fetch(`${origin}/academy-area`, { headers: { Cookie: studentCookie }, redirect: "manual" })).status, 403);
    assert.equal((await fetch(`${origin}/student-area`, { headers: { Cookie: parentCookie }, redirect: "manual" })).status, 302);
    assert.equal((await fetch(`${origin}/parent-area`, { headers: { Cookie: studentCookie }, redirect: "manual" })).status, 302);
    for (const cookie of [studentCookie, academyCookie, parentCookie]) {
      const denied = await fetch(`${origin}/admin`, { headers: { Cookie: cookie }, redirect: "manual" });
      assert.ok([302, 403].includes(denied.status), "non-admin must never reach admin dashboard");
    }

    const previewResponse = await fetch(
      `${origin}/academy/classes/${academyClass._id}/weeks/${week._id}/preview`,
      { headers: { Cookie: academyCookie } }
    );
    assert.equal(previewResponse.status, 200);
    assert.equal(previewResponse.headers.get("x-robots-tag"), "noindex, nofollow");
    const previewHtml = await previewResponse.text();
    assert.match(previewHtml, /학생 화면 미리보기/);
    assert.match(previewHtml, /극한 기본문제 1–2번/);
    assert.match(previewHtml, /미리보기에서는 입력과 제출이 잠겨 있습니다/);
    assert.match(previewHtml, /name="answer_1"[^>]*disabled/);
    assert.doesNotMatch(previewHtml, /top-secret-answer/);
    assert.doesNotMatch(previewHtml, /과제 답안 제출 및 자동 채점/);

    const studentPreviewAttempt = await fetch(
      `${origin}/academy/classes/${academyClass._id}/weeks/${week._id}/preview`,
      { headers: { Cookie: studentCookie }, redirect: "manual" }
    );
    assert.equal(studentPreviewAttempt.status, 403);

    const resetCases = [
      ["student", student._id, student.email, studentPassword],
      ["academy", teacher._id, teacher.email, teacherPassword],
      ["parent", parent._id, parent.email, parentPassword],
      ["admin", admin._id, admin.email, adminPassword],
    ];
    for (const [accountType, userId, email, oldPassword] of resetCases) {
      const reset = await PasswordResetCode.create({
        userId,
        accountType,
        mode: "code",
        status: "verified",
        codeHash: `fixture-${accountType}`,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const newPassword = password();
      await resetPassword({
        resetId: reset._id,
        userId,
        accountType,
        password: newPassword,
        passwordConfirm: newPassword,
      });
      assert.equal((await PasswordResetCode.findById(reset._id)).status, "used");
      await assert.rejects(
        () => authenticateWebAccount({ email, password: oldPassword }),
        (error) => Number(error.status) === 401,
      );
      const relogin = await authenticateWebAccount({ email, password: newPassword });
      assert.equal(
        relogin.kind === "parent" ? "parent" : relogin.user.role,
        accountType === "academy" ? "teacher" : accountType,
      );
    }

    console.log("역할별 계정 검증 완료: DB 컬렉션·로그인·비밀번호 재설정·페이지 권한·교사 학생 화면 미리보기가 분리되어 있습니다.");
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (replicaSet) await replicaSet.stop();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
