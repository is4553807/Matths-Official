"use strict";

// Real Express/Mongo contracts; the OAuth provider itself is a localhost fixture.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
process.env.NODE_ENV = "test";
process.env.DISABLE_SCHEDULERS = "1";
const { User, PrivateMockExam, PrivateMockExamAttempt } = require("../models/matthsModel");
const { ParentAccount, ParentInvite, ParentChildLink } = require("../models/parentModel");
const { Academy, AcademyAccount, AcademyStaff, AcademyStaffInvite, AcademyStudentMembership } = require("../models/academyModel");
const { MongoSessionStore } = require("../services/mongoSessionStore");
const { loginDestination } = require("../services/webLoginService");
const { setPendingSocialRegistration } = require("../services/socialAuthService");
const { getWeeklyMockInsights, getAcademyWeeklyMockInsights } = require("../services/weeklyMockInsightService");
const { approveAcademyApplication } = require("../services/academyService");
const { createAcademyStaffInvite } = require("../services/academyStaffInviteService");
const auth = require("../middleware/authMiddleware");
const profiles = new Map();
const cookie = r => String(r.headers.get("set-cookie") || "").match(/connect\.sid=[^;]+/)?.[0] || "";
const email = prefix => `${prefix}-${crypto.randomUUID()}@qa.invalid`;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
let memory, listener;

async function main() {
  memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri(), { dbName: "portal_social_login_verify" });
  await Promise.all([User, ParentAccount, ParentInvite, ParentChildLink, AcademyAccount, AcademyStaff, AcademyStaffInvite].map(m => m.init()));
  const app = express();
  app.set("trust proxy", 1);
  app.set("view engine", "ejs"); app.set("views", path.resolve(__dirname, "..", "views"));
  app.use(express.static(path.resolve(__dirname, "..", "public")));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(session({ secret: crypto.randomBytes(48).toString("base64url"), store: new MongoSessionStore({ ttlSeconds: 600 }), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: false } }));
  app.use((_req, res, next) => { res.locals.assetVersion = "social-test"; next(); });
  app.post("/__provider/:provider/token", (req, res) => res.json({ access_token: req.body.code }));
  app.get("/__provider/:provider/profile", (req, res) => {
    const profile = profiles.get(String(req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!profile) return res.status(401).json({});
    return res.json(req.params.provider === "google" ? { sub: profile.subject, email: profile.email, email_verified: profile.verified !== false, name: "소셜 가입 테스트" } : { id: profile.subject, kakao_account: { email: profile.email, is_email_valid: true, is_email_verified: profile.verified !== false, email_needs_agreement: false, profile: { nickname: "소셜 가입 테스트" } } });
  });
  app.get("/__fixture/session", (req, res) => res.json({ userRole: req.session.user?.role || null, accountType: req.session.user?.accountType || null, parentId: req.session.parent?.id || null, pendingType: req.session.pendingSocialRegistration?.accountType || null }));
  app.get("/__fixture/student", auth.requireStudentAccount, auth.isLoggedIn, (_req, res) => res.send("student-only"));
  if (process.env.PORTAL_SOCIAL_PREVIEW === "1") {
    // Local, disposable DB only: preview an already verified profile without submitting an account.
    app.get("/__fixture/social-registration/:type", (req, res) => {
      if (!["academy", "parent"].includes(req.params.type)) return res.sendStatus(404);
      setPendingSocialRegistration(req, { provider: "google", providerUserId: crypto.randomUUID(), email: "preview@qa.invalid", emailVerified: true, displayName: "소셜 가입 미리보기" }, { accountType: req.params.type });
      return req.session.save(() => res.redirect(`/${req.params.type}/register`));
    });
  }
  app.use("/", require("../routes/parent-routes"));
  app.use("/", require("../routes/goat-arena-routes"));
  app.use("/", require("../routes/academy-routes"));
  app.use("/", require("../routes/matths-routes"));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  listener = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  for (const [provider, prefix, key] of [["google", "GOOGLE_OAUTH", "GOOGLE_OAUTH_CLIENT_ID"], ["kakao", "KAKAO_OAUTH", "KAKAO_OAUTH_REST_API_KEY"]]) {
    process.env[key] = "fixture-client";
    process.env[`${prefix}_CLIENT_SECRET`] = "fixture-secret";
    process.env[`${prefix}_REDIRECT_URI`] = `${origin}/auth/${provider}/callback`;
    process.env[`${prefix}_TEST_TOKEN_URL`] = `${origin}/__provider/${provider}/token`;
    process.env[`${prefix}_TEST_PROFILE_URL`] = `${origin}/__provider/${provider}/profile`;
  }
  let clientNumber = 0;
  const get = (pathname, sessionCookie = "") => fetch(origin + pathname, { redirect: "manual", headers: sessionCookie ? { Cookie: sessionCookie } : {} });
  const post = (pathname, fields, sessionCookie = "") => fetch(origin + pathname, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, "X-Forwarded-For": `192.0.2.${++clientNumber}`, ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body: new URLSearchParams(fields) });
  const identity = async sessionCookie => (await get("/__fixture/session", sessionCookie)).json();
  async function oauth(provider, type, address, options = {}) {
    const start = await get(`/auth/${provider}?accountType=${type}${options.invite ? "&invite=" + options.invite : ""}${options.staff ? "&path=staff" : ""}&next=${encodeURIComponent(options.next || "/admin/users")}`);
    assert.equal(start.status, 302);
    assert.equal(start.headers.get("referrer-policy"), "no-referrer");
    const authUrl = new URL(start.headers.get("location"));
    const state = authUrl.searchParams.get("state");
    const code = crypto.randomUUID();
    profiles.set(code, { email: address, subject: options.subject || `${provider}-${crypto.randomUUID()}`, verified: options.verified });
    const sessionCookie = cookie(start);
    const response = await get(`/auth/${provider}/callback?code=${code}&state=${options.invalidState ? "wrong-state" : state}${options.callbackType ? "&accountType=" + options.callbackType : ""}`, sessionCookie);
    return { response, cookie: cookie(response) || sessionCookie, oldCookie: sessionCookie, state, code };
  }

  for (const type of ["academy", "parent"]) for (const page of ["login", "register"]) {
    const response = await get(`/${type}/${page}`); assert.equal(response.status, 200);
    const html = await response.text();
    for (const provider of ["google", "kakao"]) assert.match(html, new RegExp(`/auth/${provider}\\?accountType=${type}`));
  }
  const admin = await User.create({ name: "소셜 운영자", email: email("admin"), passwordHash: "unused", role: "admin" });
  const student = await User.create({ name: "소셜 학생", email: email("student"), passwordHash: "unused", role: "student" });
  const teacher = await User.create({ name: "소셜 교사", email: email("teacher"), passwordHash: "unused", role: "teacher" });
  await AcademyAccount.create({ teacherUserId: teacher._id, displayName: teacher.name, email: teacher.email, passwordHash: "unused" });
  const parent = await ParentAccount.create({ username: "소셜 학부모", usernameNormalized: crypto.randomUUID().slice(0, 30), email: email("parent"), passwordHash: "unused" });
  let adminCookie;
  for (const provider of ["google", "kakao"]) {
    for (const source of ["student", "academy", "parent"]) for (const [account, role, destination] of [[admin, "admin", "/admin"], [student, "student", "/main"], [teacher, "teacher", "/academy"], [parent, "parent", "/parent"]]) {
      const result = await oauth(provider, source, account.email, { subject: `${provider}-${account._id}`, next: role === "admin" ? "/main" : "/admin/users" });
      assert.equal(result.response.status, 302);
      assert.equal(result.response.headers.get("location"), destination);
      const data = await identity(result.cookie);
      assert.equal(role === "parent" ? data.parentId : data.userRole, role === "parent" ? String(parent._id) : role);
      assert.equal(data.accountType, role === "parent" ? null : role === "teacher" ? "academy" : role);
      if (role === "admin") adminCookie = result.cookie;
      if (["parent", "teacher"].includes(role)) assert.notEqual((await get("/__fixture/student", result.cookie)).status, 200);
      if (role !== "admin") assert.notEqual((await get("/admin/users", result.cookie)).status, 200);
    }
    const address = email("new-parent");
    const signup = await oauth(provider, "parent", address, { callbackType: "academy" });
    assert.equal(signup.response.headers.get("location"), "/parent/register", "callback query must not change the state-bound signup role");
    const form = await get("/parent/register", signup.cookie); const html = await form.text();
    assert.match(html, /인증 완료/); assert.doesNotMatch(html, /name="password"/);
    const rejected = await post("/parent/register", { displayName: "소셜 학부모" }, signup.cookie); assert.equal(rejected.status, 400);
    const created = await post("/parent/register", { displayName: "소셜 학부모", email: "forged@qa.invalid", role: "admin", termsAccepted: "1" }, signup.cookie);
    assert.equal(created.status, 302, await created.text());
    const newParent = await ParentAccount.findOne({ email: address }); assert.ok(newParent); assert.equal(newParent.childUserId, null);
    assert.equal(await User.exists({ email: address }), null);
    assert.equal((await identity(cookie(created))).parentId, String(newParent._id));
    assert.equal((await identity(cookie(created))).pendingType, null);

    const academyEmail = email("new-academy");
    const academySignup = await oauth(provider, "academy", academyEmail);
    assert.equal(academySignup.response.headers.get("location"), "/academy/register");
    const academyForm = await get("/academy/register", academySignup.cookie); assert.doesNotMatch(await academyForm.text(), /name="password"/);
    const registered = await post("/academy/register", { displayName: "소셜 학원 담당자", academyName: "소셜 검증 학원", address: "서울시 강남구 테스트로 10", contactPhone: "02-1234-5678", termsAccepted: "1", authorityConfirmed: "1", role: "admin", registrationFlow: "new" }, academySignup.cookie);
    assert.equal(registered.status, 302, await registered.text());
    const newTeacher = await User.findOne({ email: academyEmail }); assert.equal(newTeacher.role, "teacher");
    const institution = await Academy.findOne({ createdByUserId: newTeacher._id }); assert.equal(institution.status, "PENDING");
    assert.equal((await get("/academy", cookie(registered))).headers.get("location"), "/academy/setup");
    assert.equal((await get("/__fixture/student", cookie(registered))).status, 403);

    const invitedParentEmail = email("invited-social-parent");
    const childToken = crypto.randomBytes(32).toString("base64url");
    const child = await User.create({ name: "소셜 초대 자녀", email: email("invited-child"), role: "student", passwordHash: "unused" });
    const childInvite = await ParentInvite.create({ childUserId: child._id, parentEmail: invitedParentEmail, productCode: "LEARNING_PACKAGE_29", tokenHash: digest(childToken), expiresAt: new Date(Date.now() + 3600000) });
    const parentInviteSignup = await oauth(provider, "parent", invitedParentEmail, { invite: childToken });
    assert.equal(parentInviteSignup.response.headers.get("location"), `/parent/register?invite=${childToken}`);
    for (const overrides of [{ linkConsent: "" }, { relationship: "" }]) {
      assert.equal((await post("/parent/register", { displayName: "초대 소셜 학부모", termsAccepted: "1", inviteToken: childToken, relationship: "MOTHER", linkConsent: "1", ...overrides }, parentInviteSignup.cookie)).status, 400);
      assert.equal(await ParentAccount.exists({ email: invitedParentEmail }), null);
    }
    const linkedParentSignup = await post("/parent/register", { displayName: "초대 소셜 학부모", termsAccepted: "1", inviteToken: childToken, relationship: "MOTHER", linkConsent: "1" }, parentInviteSignup.cookie);
    assert.equal(linkedParentSignup.status, 302, await linkedParentSignup.text());
    const linkedParent = await ParentAccount.findOne({ email: invitedParentEmail });
    const link = await ParentChildLink.findOne({ parentAccountId: linkedParent._id, childUserId: child._id });
    assert.equal(link.status, "ACTIVE"); assert.ok(link.linkConsentAt);
    assert.equal((await ParentInvite.findById(childInvite._id)).status, "ACCEPTED");

    const contractEndsAt = new Date(Date.now() + 30 * 86400000);
    await User.updateOne({ _id: newTeacher._id }, { $set: { teacherAccessExpiresAt: contractEndsAt } });
    await Academy.updateOne({ _id: institution._id }, { $set: { contractStartsAt: new Date(), contractEndsAt } });
    await approveAcademyApplication({ adminUserId: admin._id, academyId: institution._id });
    const staffEmail = email("invited-social-staff");
    const staffInvite = await createAcademyStaffInvite({ teacherUserId: newTeacher._id, email: staffEmail });
    const staffSignup = await oauth(provider, "academy", staffEmail, { invite: staffInvite.token, staff: true });
    assert.equal(staffSignup.response.headers.get("location"), `/academy/register?invite=${staffInvite.token}&path=staff`);
    const staffRegistered = await post("/academy/register", { displayName: "소셜 초대 교사", termsAccepted: "1", registrationFlow: "staff", inviteToken: staffInvite.token, role: "OWNER", academyId: crypto.randomUUID() }, staffSignup.cookie);
    assert.equal(staffRegistered.status, 302, await staffRegistered.text());
    const staffUser = await User.findOne({ email: staffEmail }); assert.equal(staffUser.role, "teacher");
    const staff = await AcademyStaff.findOne({ userId: staffUser._id });
    assert.equal(String(staff.academyId), String(institution._id)); assert.equal(staff.role, "TEACHER"); assert.equal(staff.status, "PENDING");
    assert.equal((await get("/academy", cookie(staffRegistered))).headers.get("location"), "/academy/setup");

    const denied = await oauth(provider, "parent", email("unverified"), { verified: false });
    assert.equal(denied.response.headers.get("location"), "/parent/login"); assert.equal((await identity(denied.cookie)).parentId, null);
    const invalid = await oauth(provider, "academy", email("invalid-state"), { invalidState: true });
    assert.equal(invalid.response.headers.get("location"), "/academy/login"); assert.equal((await identity(invalid.cookie)).pendingType, null);
    const replay = await get(`/auth/${provider}/callback?code=${academySignup.code}&state=${academySignup.state}`, academySignup.oldCookie);
    assert.notEqual((await identity(cookie(replay) || academySignup.oldCookie)).userRole, "admin");
    const conflicting = await oauth(provider, "student", student.email, { subject: `different-${provider}` });
    assert.equal(conflicting.response.headers.get("location"), "/student/login"); assert.equal((await identity(conflicting.cookie)).userRole, null);
    await AcademyAccount.updateOne({ teacherUserId: teacher._id }, { $set: { isActive: false } });
    const inactiveTeacher = await oauth(provider, "parent", teacher.email, { subject: `${provider}-${teacher._id}` });
    assert.equal(inactiveTeacher.response.headers.get("location"), "/parent/login"); assert.equal((await identity(inactiveTeacher.cookie)).userRole, null);
    await AcademyAccount.updateOne({ teacherUserId: teacher._id }, { $set: { isActive: true } });
    await ParentAccount.updateOne({ _id: parent._id }, { $set: { isActive: false } });
    const inactiveParent = await oauth(provider, "academy", parent.email, { subject: `${provider}-${parent._id}` });
    assert.equal(inactiveParent.response.headers.get("location"), "/academy/login"); assert.equal((await identity(inactiveParent.cookie)).parentId, null);
    await ParentAccount.updateOne({ _id: parent._id }, { $set: { isActive: true } });
    await User.updateOne({ _id: student._id }, { $set: { isActive: false, accountStatus: "suspended" } });
    const suspendedStudent = await oauth(provider, "academy", student.email, { subject: `${provider}-${student._id}` });
    assert.equal(suspendedStudent.response.headers.get("location"), "/academy/login"); assert.equal((await identity(suspendedStudent.cookie)).userRole, null);
    await User.updateOne({ _id: student._id }, { $set: { isActive: true, accountStatus: "active" } });
  }

  const questionConcepts = Array.from({ length: 21 }, (_, i) => ({ conceptId: `admin-concept-${i}`, conceptTitle: `운영자 분석 개념 ${String(i + 1).padStart(2, "0")}`, courseTitle: "공통수학", unitTitle: "개별 강약점" }));
  const examId = new mongoose.Types.ObjectId();
  const flaggedExamId = new mongoose.Types.ObjectId(), pendingExamId = new mongoose.Types.ObjectId();
  await PrivateMockExam.collection.insertMany([examId, flaggedExamId, pendingExamId].map((_id, i) => ({ _id, archiveItemId: new mongoose.Types.ObjectId(), weekKey: `admin-verify-${i}`, title: "운영자 개별 분석 검증", status: "open", isTest: false, releaseAt: new Date(Date.now() - (i + 1) * 86400000), questionCount: 21, questionConcepts })));
  await PrivateMockExamAttempt.collection.insertMany([
    { examId, userId: student._id, status: "submitted", score: 60, correctByQuestion: questionConcepts.map((_, i) => i >= 10), integrityStatus: "CLEAR" },
    { examId, userId: new mongoose.Types.ObjectId(), status: "submitted", score: 0, correctByQuestion: questionConcepts.map(() => false), integrityStatus: "CLEAR" },
    { examId: flaggedExamId, userId: student._id, status: "submitted", score: 100, correctByQuestion: questionConcepts.map(() => true), integrityStatus: "FLAGGED" },
    { examId: pendingExamId, userId: student._id, status: "submitted", score: 100, correctByQuestion: questionConcepts.map(() => true), integrityStatus: "CLEAR", submissionFinalization: { status: "pending" } },
  ]);
  const insight = await getWeeklyMockInsights({ studentUserIds: [student._id] });
  const metricAcademyId = new mongoose.Types.ObjectId();
  await AcademyStudentMembership.create({ academyId: metricAcademyId, studentUserId: student._id, status: "APPROVED", dataConsentAt: new Date(), approvedAt: new Date() });
  const academyInsight = (await getAcademyWeeklyMockInsights({ academyId: metricAcademyId })).overall;
  for (const key of ["participantCount", "submissionCount", "averageScore", "conceptCount", "examCount", "concepts", "hardestConcept"]) assert.deepEqual(insight[key], academyInsight[key], `Admin and academy ${key} must use identical metrics`);
  assert.equal(insight.participantCount, 1); assert.equal(insight.submissionCount, 1); assert.equal(insight.averageScore, 60); assert.equal(insight.conceptCount, 21);
  assert.equal(insight.concepts.find(c => c.conceptId === "admin-concept-20").difficulty, 0);
  assert.equal(insight.concepts.find(c => c.conceptId === "admin-concept-0").difficulty, 100);
  const userDetail = await get(`/admin/users/${student._id}`, adminCookie); assert.equal(userDetail.status, 200, await userDetail.clone().text());
  const userDetailHtml = await userDetail.text();
  assert.match(userDetailHtml, /주간 모의고사 개념 강·약점/); assert.match(userDetailHtml, /운영자 분석 개념 21/); assert.match(userDetailHtml, /60점/);
  assert.doesNotMatch(userDetailHtml, /상위 18개 개념/);
  console.log("Administrator per-user weekly mock verified: academy's canonical metrics, scoped student only, all 21 strong/weak concepts, flagged/pending exclusion, and real admin-only detail page.");

  for (const next of ["//evil.invalid", "/\\evil.invalid", "/academy/../admin", "/academy/%2e%2e/admin", "/academy/login", "/parent/register", "/student/login"]) {
    assert.equal(loginDestination({ kind: "user", user: teacher }, next), "/academy");
    assert.equal(loginDestination({ kind: "parent", parent }, next), "/parent");
  }
  console.log("Portal social login verified: Google/Kakao across every role portal, isolated parent/academy signup, state-bound roles, approval and consent, CSRF/replay/unverified/conflicting identity rejection, and role-safe destinations.");
  if (process.env.PORTAL_SOCIAL_PREVIEW === "1") {
    app.get("/__fixture/admin-preview", async (req, res, next) => {
      try { await require("../services/webLoginService").establishWebSession(req, { kind: "user", user: admin }); return res.redirect(`/admin/users/${student._id}`); } catch (error) { return next(error); }
    });
    console.log(JSON.stringify({ origin, academyLogin: origin + "/academy/login", parentLogin: origin + "/parent/login", academySignup: origin + "/academy/register", parentSignup: origin + "/parent/register" }));
    await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (listener) await new Promise(resolve => listener.close(resolve));
  await mongoose.disconnect(); if (memory) await memory.stop();
});
