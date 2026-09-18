"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

const activationMails = [];
nodemailer.createTransport = () => ({ sendMail: async (mail) => {
  activationMails.push(mail);
  return { accepted: [mail.to], messageId: `fixture-${activationMails.length}` };
} });
process.env.EMAIL_VERIFICATION_BASE_URL = "https://www.matths.kr";
process.env.SUPPORT_SMTP_USER = "fixture@qa.invalid";
process.env.GMAIL_APP_PASSWORD = "fixture-password";

process.env.NODE_ENV = "development";
process.env.DISABLE_SCHEDULERS = "1";
const { User } = require("../models/matthsModel");
const { Academy, AcademyAccount, AcademyStaff, AcademyStaffInvite } = require("../models/academyModel");
const { ParentAccount, ParentChildLink, ParentInvite } = require("../models/parentModel");
const auth = require("../middleware/authMiddleware");
const { sameOriginProtection } = require("../middleware/requestSecurity");
const { MongoSessionStore } = require("../services/mongoSessionStore");
const { approveAcademyApplication, approveAcademyStaff } = require("../services/academyService");
const { acceptParentInvite } = require("../services/checkoutService");
const { activateAccount } = require("../services/emailVerificationService");
const { createAcademyStaffInvite, revokeAcademyStaffInvite } = require("../services/academyStaffInviteService");

const digest = token => crypto.createHash("sha256").update(token).digest("hex");
const email = prefix => `${prefix}-${crypto.randomUUID()}@qa.invalid`;
const cookie = response => String(response.headers.get("set-cookie") || "").match(/connect\.sid=[^;]+/)?.[0] || "";
const account = (address, name = "가입 테스트") => ({ displayName: name, email: address, password: "Signup1234!", passwordConfirm: "Signup1234!", termsAccepted: "1" });
const institution = { academyName: "가입 검증 학원", branchName: "본점", address: "서울시 강남구 테스트로 10", contactPhone: "02-1234-5678", authorityConfirmed: "1", registrationFlow: "new" };
async function activateLatest() {
  const token = activationMails.at(-1)?.text.match(/verify-email\?token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(token);
  assert.equal((await activateAccount(token)).activated, true);
}

async function main() {
  let memory, listener;
  try {
    memory = await MongoMemoryServer.create();
    await mongoose.connect(memory.getUri(), { dbName: "portal_registration_verify" });
    await Promise.all([User.init(), AcademyAccount.init(), AcademyStaff.init(), AcademyStaffInvite.init(), ParentAccount.init(), ParentChildLink.init(), ParentInvite.init()]);
    const app = express();
    app.set("trust proxy", 1); // Simulate separate clients without bypassing auth limits.
    app.set("view engine", "ejs"); app.set("views", path.resolve(__dirname, "..", "views"));
    app.use(express.static(path.resolve(__dirname, "..", "public")));
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: crypto.randomBytes(48).toString("base64url"), store: new MongoSessionStore({ ttlSeconds: 600 }), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: false } }));
    app.use((_req, res, next) => {
      res.locals.assetVersion = "portal-test";
      const render = res.render.bind(res);
      res.render = (view, locals) => { res.set("X-Fixture-Analytics-Disabled", locals.disablePageAnalytics === true ? "1" : "0"); return render(view, locals); };
      next();
    });
    app.use(sameOriginProtection);
    app.get("/__fixture/identity", (req, res) => res.json({ role: req.session.user?.role || null, accountType: req.session.user?.accountType || null, parentId: req.session.parent?.id || null }));
    app.get("/__fixture/student-area", auth.requireStudentAccount, auth.isLoggedIn, (_req, res) => res.send("student-only"));
    app.post("/__fixture/session", async (req, res) => {
      const user = await User.findById(req.body.id).lean();
      req.session.user = { id: String(user._id), email: user.email, name: user.name, role: user.role, accountType: user.role === "teacher" ? "academy" : user.role, tokenVersion: user.tokenVersion || 0 };
      req.session.save(() => res.send("fixture-only"));
    });
    app.use("/", require("../routes/parent-routes"));
    app.use("/", require("../routes/goat-arena-routes"));
    app.use("/", require("../routes/academy-routes"));
    app.use((error, _req, res, _next) => res.status(Number(error.status) || 500).send(error.message));
    listener = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const origin = `http://127.0.0.1:${listener.address().port}`;
    async function get(url, sessionCookie = "") { const response = await fetch(origin + url, { redirect: "manual", headers: sessionCookie ? { Cookie: sessionCookie } : {} }); return { response, text: await response.text() }; }
    let clientNumber = 0;
    async function post(url, fields, sessionCookie = "") { return fetch(origin + url, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, "X-Forwarded-For": `192.0.2.${++clientNumber}`, ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body: new URLSearchParams(fields) }); }
    async function createUser(role, label) { return User.create({ name: label, realName: label, email: email(role), role, passwordHash: "fixture-unused", accountStatus: "active", isActive: true }); }
    async function inviteChild(parentEmail, child = null) {
      const student = child || await createUser("student", "초대 자녀");
      const token = crypto.randomBytes(32).toString("base64url");
      const invite = await ParentInvite.create({ childUserId: student._id, parentEmail, productCode: "LEARNING_PACKAGE_29", tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000) });
      return { token, invite, student };
    }

    const academyPage = await get("/academy/register");
    assert.equal(academyPage.response.status, 200); assert.match(academyPage.text, /data-registration-stage="institution"/); assert.match(academyPage.text, /name="authorityConfirmed"/); assert.match(academyPage.text, /지점 이름/);
    const staffPage = await get("/academy/register?path=staff"); assert.match(staffPage.text, /name="registrationFlow" value="staff"/);
    const parentPage = await get("/parent/register"); assert.equal(parentPage.response.status, 200); assert.match(parentPage.text, /data-registration-stage="child"/); assert.match(parentPage.text, /나중에 연결하기/); assert.doesNotMatch(parentPage.text, /name="(?:schoolGrade|birthDate|academyName)"/);
    assert.equal(academyPage.response.headers.get("cache-control"), "no-store");

    for (const overrides of [{ authorityConfirmed: "" }, { address: "" }, { contactPhone: "abc" }, { termsAccepted: "" }, { password: "한".repeat(24) + "A1", passwordConfirm: "한".repeat(24) + "A1" }]) {
      const address = email("invalid-academy"); const rejected = await post("/academy/register", { ...account(address), ...institution, ...overrides });
      assert.equal(rejected.status, 400, await rejected.text()); assert.equal(await AcademyAccount.exists({ email: address }), null); assert.equal(await User.exists({ email: address }), null);
    }
    const ownerEmail = email("owner");
    const signup = await post("/academy/register", { ...account(ownerEmail, "학원 원장"), ...institution, role: "admin", status: "ACTIVE", contractEndsAt: "2099-01-01" });
    assert.equal(signup.status, 202, await signup.text());
    assert.ok(cookie(signup), "인증 메일 재발송용 대기 세션이 있어야 합니다.");
    assert.equal(JSON.parse((await get("/__fixture/identity", cookie(signup))).text).role, null, "대기 세션에는 로그인 권한이 없어야 합니다.");
    await activateLatest();
    const ownerCookie = cookie(await post("/academy/login", { email: ownerEmail, password: "Signup1234!" })); assert.ok(ownerCookie);
    const ownerAccount = await AcademyAccount.findOne({ email: ownerEmail }).select("+passwordHash").lean();
    const owner = await User.findById(ownerAccount.teacherUserId).select("+passwordHash").lean();
    assert.equal(owner.role, "teacher"); assert.ok(ownerAccount.authorityConfirmedAt); assert.notEqual(owner.passwordHash, ownerAccount.passwordHash);
    let academy = await Academy.findOne({ createdByUserId: owner._id }).lean();
    assert.equal(academy.status, "PENDING"); assert.equal(academy.contractEndsAt, null); assert.equal(academy.address, institution.address); assert.equal(academy.branchName, "본점");
    assert.equal((await get("/academy", ownerCookie)).response.headers.get("location"), "/academy/setup");
    assert.match((await get("/academy/setup", ownerCookie)).text, /등록 검토 대기 중/);
    const duplicated = await post("/parent/register", account(ownerEmail)); assert.equal(duplicated.status, 409);
    const admin = await createUser("admin", "가입 검증 관리자");
    const contractEndsAt = new Date(Date.now() + 30 * 86400000);
    await User.updateOne({ _id: owner._id }, { $set: { teacherAccessExpiresAt: contractEndsAt } });
    await Academy.updateOne({ _id: academy._id }, { $set: { contractStartsAt: new Date(Date.now() - 86400000), contractEndsAt } });
    academy = await approveAcademyApplication({ adminUserId: admin._id, academyId: academy._id });

    const invitedEmail = email("invited-teacher");
    const invitationResponse = await post("/academy/staff-invites", { email: invitedEmail, academyId: new mongoose.Types.ObjectId(), role: "OWNER" }, ownerCookie);
    assert.equal(invitationResponse.status, 302, await invitationResponse.text());
    const teachersHtml = (await get("/academy?tab=teachers", ownerCookie)).text;
    const staffPath = teachersHtml.match(/href="(\/academy\/staff-invite\/[A-Za-z0-9_-]{43})"/)?.[1]; assert.ok(staffPath, teachersHtml);
    const staffToken = staffPath.split("/").pop();
    const storedInvite = await AcademyStaffInvite.findOne({ email: invitedEmail }).select("+tokenHash").lean();
    assert.equal(storedInvite.tokenHash, digest(staffToken)); assert.equal(String(storedInvite.academyId), String(academy._id)); assert.equal(storedInvite.token, undefined);
    const lookup = await get(`/academy/register/invite?token=${staffToken}`); assert.equal(lookup.response.status, 200); assert.equal(JSON.parse(lookup.text).email, invitedEmail); assert.doesNotMatch(lookup.text, /tokenHash|passwordHash|createdByUserId/);
    assert.equal((await get(staffPath)).response.headers.get("location"), `/academy/register?invite=${staffToken}`);
    const invitedPage = await get(`/academy/register?invite=${staffToken}`); assert.match(invitedPage.text, new RegExp(`value="${invitedEmail}"[^>]*readonly`));
    assert.equal(invitedPage.response.headers.get("x-fixture-analytics-disabled"), "1");
    const mismatchAddress = email("wrong-invite-email"); const mismatch = await post("/academy/register", { ...account(mismatchAddress), registrationFlow: "staff", inviteToken: staffToken }); assert.equal(mismatch.status, 400); assert.equal(await AcademyAccount.exists({ email: mismatchAddress }), null);
    const staffSignup = await post("/academy/register", { ...account(invitedEmail, "초대 교사"), registrationFlow: "staff", inviteToken: staffToken, role: "OWNER", academyId: new mongoose.Types.ObjectId() });
    assert.equal(staffSignup.status, 202, await staffSignup.text());
    await activateLatest();
    const teacherCookie = cookie(await post("/academy/login", { email: invitedEmail, password: "Signup1234!" })), teacherAccount = await AcademyAccount.findOne({ email: invitedEmail }).lean();
    const teacherStaff = await AcademyStaff.findOne({ userId: teacherAccount.teacherUserId }).lean(); assert.equal(teacherStaff.role, "TEACHER"); assert.equal(teacherStaff.status, "PENDING"); assert.equal(String(teacherStaff.academyId), String(academy._id));
    assert.equal((await get("/academy", teacherCookie)).response.headers.get("location"), "/academy/setup");
    assert.equal((await get(`/academy/register/invite?token=${staffToken}`)).response.status, 410);
    await approveAcademyStaff({ teacherUserId: owner._id, staffId: teacherStaff._id });
    assert.equal((await get("/academy?tab=teachers", teacherCookie)).response.status, 200);
    assert.doesNotMatch((await get("/academy?tab=teachers", teacherCookie)).text, /action="\/academy\/staff-invites"/);
    assert.equal((await post("/academy/staff-invites", { email: email("forbidden") }, teacherCookie)).status, 403);
    assert.equal((await get("/__fixture/student-area", teacherCookie)).response.status, 403);
    const student = await createUser("student", "검증 학생"); const studentCookie = cookie(await post("/__fixture/session", { id: student._id }));
    assert.equal((await post("/academy/staff-invites", { email: email("forbidden") }, studentCookie)).status, 403);
    const adminCookie = cookie(await post("/__fixture/session", { id: admin._id })); assert.equal((await post("/academy/staff-invites", { email: email("forbidden") }, adminCookie)).status, 403);

    const replacementEmail = email("replace-teacher"); const firstInvite = await createAcademyStaffInvite({ teacherUserId: owner._id, email: replacementEmail }); const replacement = await createAcademyStaffInvite({ teacherUserId: owner._id, email: replacementEmail });
    assert.equal((await get(`/academy/register/invite?token=${firstInvite.token}`)).response.status, 410);
    await revokeAcademyStaffInvite({ teacherUserId: owner._id, inviteId: replacement.invite._id }); assert.equal((await get(`/academy/register/invite?token=${replacement.token}`)).response.status, 410);
    const expired = await createAcademyStaffInvite({ teacherUserId: owner._id, email: email("expired-teacher") }); await AcademyStaffInvite.updateOne({ _id: expired.invite._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } }); assert.equal((await get(`/academy/register/invite?token=${expired.token}`)).response.status, 410);
    const disabledOwnerInvite = await createAcademyStaffInvite({ teacherUserId: owner._id, email: email("disabled-owner") }); await AcademyAccount.updateOne({ _id: ownerAccount._id }, { $set: { isActive: false } }); assert.equal((await get(`/academy/register/invite?token=${disabledOwnerInvite.token}`)).response.status, 410); await AcademyAccount.updateOne({ _id: ownerAccount._id }, { $set: { isActive: true } });
    assert.equal((await get(`/academy/register/invite?token=${crypto.randomBytes(32).toString("base64url")}`)).response.status, 404);

    // An existing standalone academy account can accept its own invitation.
    const standalone = await createUser("teacher", "기존 교사");
    await AcademyAccount.create({ teacherUserId: standalone._id, displayName: "기존 교사", email: standalone.email, passwordHash: "fixture-unused" });
    const standaloneCookie = cookie(await post("/__fixture/session", { id: standalone._id }));
    const existingInvite = await createAcademyStaffInvite({ teacherUserId: owner._id, email: standalone.email });
    assert.equal((await get(`/academy/staff-invite/${existingInvite.token}`)).response.headers.get("location"), `/academy/login?next=${encodeURIComponent(`/academy/staff-invite/${existingInvite.token}`)}`);
    assert.equal((await get(`/academy/login?next=${encodeURIComponent(`/academy/staff-invite/${existingInvite.token}`)}`)).response.headers.get("x-fixture-analytics-disabled"), "1");
    assert.match((await get(`/academy/staff-invite/${existingInvite.token}`, standaloneCookie)).text, /교사 참여 신청/);
    assert.equal((await post(`/academy/staff-invite/${existingInvite.token}/accept`, {}, standaloneCookie)).status, 400);
    assert.equal((await post(`/academy/staff-invite/${existingInvite.token}/accept`, { inviteConsent: "1" }, teacherCookie)).status, 403);
    assert.equal((await post(`/academy/staff-invite/${existingInvite.token}/accept`, { inviteConsent: "1" }, standaloneCookie)).status, 302);
    assert.equal((await AcademyStaff.findOne({ userId: standalone._id }).lean()).status, "PENDING");

    const parentEmail = email("unlinked-parent");
    const parentSignup = await post("/parent/register", { ...account(parentEmail, "학부모"), childUserId: student._id, role: "admin" }); assert.equal(parentSignup.status, 202, await parentSignup.text());
    await activateLatest();
    const parentCookie = cookie(await post("/parent/login", { email: parentEmail, password: "Signup1234!" })), parent = await ParentAccount.findOne({ email: parentEmail }).lean();
    assert.equal(parent.childUserId, null); assert.equal(await User.exists({ email: parentEmail }), null); assert.equal(await ParentChildLink.countDocuments({ parentAccountId: parent._id }), 0);
    assert.match((await get("/parent", parentCookie)).text, /자녀 계정 연결을 기다리고/); assert.equal((await get("/__fixture/student-area", parentCookie)).response.status, 302);
    assert.equal((await post("/academy/staff-invites", { email: email("forbidden") }, parentCookie)).status, 302);
    assert.equal((await post("/parent/register", account(email("another-parent")), parentCookie)).status, 302);
    const invitedParentEmail = email("linked-parent"); const childInvite = await inviteChild(invitedParentEmail);
    const childLookup = await get(`/parent/register/invite?token=${childInvite.token}`); assert.equal(childLookup.response.status, 200); assert.equal(JSON.parse(childLookup.text).email, invitedParentEmail);
    const childSignupPage = await get(`/parent/invite/${childInvite.token}`); assert.equal(childSignupPage.response.status, 200); assert.match(childSignupPage.text, /data-registration-stage="child"/); assert.doesNotMatch(childSignupPage.text, /data-connect-later/); assert.match(childSignupPage.text, /name="termsAccepted"/);
    assert.equal(childSignupPage.response.headers.get("x-fixture-analytics-disabled"), "1");
    const mismatchParentEmail = email("wrong-parent"); const mismatchedParent = await post("/parent/register", { ...account(mismatchParentEmail), inviteToken: childInvite.token, relationship: "MOTHER", linkConsent: "1" }); assert.equal(mismatchedParent.status, 400); assert.equal(await ParentAccount.exists({ email: mismatchParentEmail }), null);
    for (const overrides of [{ termsAccepted: "" }, { relationship: "" }, { linkConsent: "" }]) {
      const result = await post(`/parent/invite/${childInvite.token}`, { ...account(invitedParentEmail), relationship: "MOTHER", linkConsent: "1", ...overrides }); assert.equal(result.status, 400, await result.text()); assert.equal(await ParentAccount.exists({ email: invitedParentEmail }), null); assert.equal((await ParentInvite.findById(childInvite.invite._id).lean()).status, "PENDING");
    }
    const linkedSignup = await post(`/parent/invite/${childInvite.token}`, { ...account(invitedParentEmail, "연결 학부모"), email: email("tampered"), childUserId: student._id, relationship: "MOTHER", linkConsent: "1" });
    assert.equal(linkedSignup.status, 202, await linkedSignup.text());
    await activateLatest();
    const linkedCookie = cookie(await post("/parent/login", { email: invitedParentEmail, password: "Signup1234!" }));
    assert.equal((await get("/parent", linkedCookie)).response.status, 200);
    const linkedParent = await ParentAccount.findOne({ email: invitedParentEmail }).lean(); assert.equal(String(linkedParent.childUserId), String(childInvite.student._id));
    const childLink = await ParentChildLink.findOne({ parentAccountId: linkedParent._id }).lean(); assert.equal(childLink.relationship, "MOTHER"); assert.ok(childLink.linkConsentAt); assert.equal(childLink.status, "ACTIVE");
    assert.equal((await get(`/parent/register/invite?token=${childInvite.token}`)).response.status, 410);
    const secondChild = await inviteChild(parentEmail);
    assert.equal((await get(`/parent/login?next=${encodeURIComponent(`/parent/invite/${secondChild.token}`)}`)).response.headers.get("x-fixture-analytics-disabled"), "1");
    assert.match((await get(`/parent/invite/${secondChild.token}`, parentCookie)).text, /name="linkConsent"/);
    assert.equal((await post(`/parent/invite/${secondChild.token}/link`, { relationship: "FATHER" }, parentCookie)).status, 400); assert.equal(await ParentChildLink.countDocuments({ parentAccountId: parent._id }), 0);
    assert.equal((await post(`/parent/invite/${secondChild.token}/link`, { relationship: "FATHER", linkConsent: "1" }, parentCookie)).status, 302);
    assert.equal((await ParentChildLink.findOne({ parentAccountId: parent._id }).lean()).relationship, "FATHER");
    const revokedChild = await inviteChild(email("revoked-parent")); await ParentInvite.updateOne({ _id: revokedChild.invite._id }, { $set: { status: "REVOKED" } }); assert.equal((await get(`/parent/register/invite?token=${revokedChild.token}`)).response.status, 410);
    const blockedChild = await inviteChild(email("blocked-parent")); await User.updateOne({ _id: blockedChild.student._id }, { $set: { accountStatus: "suspended" } }); assert.equal((await get(`/parent/register/invite?token=${blockedChild.token}`)).response.status, 410);
    const alreadyLinkedEmail = email("conflicting-parent"); const conflictingInvite = await inviteChild(alreadyLinkedEmail, childInvite.student); const conflict = await post("/parent/register", { ...account(alreadyLinkedEmail), inviteToken: conflictingInvite.token, relationship: "GUARDIAN", linkConsent: "1" }); assert.equal(conflict.status, 409); assert.equal(await ParentAccount.exists({ email: alreadyLinkedEmail }), null); assert.equal((await ParentInvite.findById(conflictingInvite.invite._id).lean()).status, "PENDING");
    const concurrent = await inviteChild(parentEmail);
    const outcomes = await Promise.allSettled([1, 2].map(() => acceptParentInvite({ rawToken: concurrent.token, parentAccountId: parent._id, relationship: "FATHER", linkConsentAt: new Date() })));
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1); assert.equal(await ParentChildLink.countDocuments({ parentAccountId: parent._id, childUserId: concurrent.student._id }), 1);

    console.log("Portal signup verified: institution/authority validation, isolated credentials, email-bound single-use staff invitations, approval-only access, optional parent linking, child consent, revoked/expired links and concurrent acceptance.");
    if (process.env.PORTAL_REGISTRATION_PREVIEW === "1") {
      const previewStaff = await createAcademyStaffInvite({ teacherUserId: owner._id, email: "preview-teacher@qa.invalid" });
      const previewChild = await inviteChild("preview-parent@qa.invalid");
      console.log(JSON.stringify({ origin, academy: `${origin}/academy/register`, parent: `${origin}/parent/register`, teacherInvite: `${origin}/academy/register?invite=${previewStaff.token}`, parentInvite: `${origin}/parent/invite/${previewChild.token}` }));
      await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
    }
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    await mongoose.disconnect(); if (memory) await memory.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
