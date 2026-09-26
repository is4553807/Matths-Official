"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const bcrypt = require("bcrypt");
const { ParentAccount, ParentNotification, ParentInvite } = require("../models/parentModel");
const crypto = require("node:crypto");
const { User } = require("../models/matthsModel");
const { createAccessToken } = require("../services/mobileAuthService");
let resetCode;
require("../services/emailService").sendPasswordResetCode = async ({ code }) => { resetCode = code; return { sent: true }; };
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");
require("../services/emailVerificationService").sendVerificationForAccount = async () => ({ sent: true });

async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  let server;
  try {
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function request(path, { body, token } = {}) {
      const response = await fetch(origin + path, { method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    }
    const prefix = "/parent-native/";
    assert.equal((await request(prefix + "login", { body: {} })).status, 400);
    const legacyTeacher = await User.create({ name: "기존 교사", email: "legacy-parent-boundary@example.test", passwordHash: await bcrypt.hash("LegacyPass123", 4), role: "teacher" });
    assert.equal((await request(prefix + "login", { body: { email: legacyTeacher.email, password: "LegacyPass123" } })).status, 401);
    assert.equal(await require("../models/academyModel").AcademyAccount.countDocuments({ teacherUserId: legacyTeacher._id }), 0,
      "wrong-role parent login must not migrate teacher credentials");
    const academyBody = { displayName: "학원 테스트 담당자", email: "native-academy@example.test", password: "AcademyTest123", passwordConfirm: "AcademyTest123",
      termsAccepted: true, academyName: "네이티브 테스트 학원", address: "서울특별시 테스트로 123", contactPhone: "01000000000", registrationFlow: "new" };
    assert.equal((await request("/auth/academy/register", { body: { ...academyBody, authorityConfirmed: false } })).status, 400);
    const academySignup = await request("/auth/academy/register", { body: { ...academyBody, authorityConfirmed: true, role: "admin" } });
    assert.equal(academySignup.status, 202, JSON.stringify(academySignup.body));
    const teacher = await User.findOne({ email: academyBody.email });
    assert.equal(teacher.role, "teacher"); assert.ok(teacher.emailVerificationRequiredAt);
    const institution = await require("../models/academyModel").Academy.findOne({ createdByUserId: teacher._id });
    assert.equal(institution.status, "PENDING");
    assert.equal(academySignup.body.accessToken, undefined);
    const academyModels = require("../models/academyModel");
    await academyModels.Academy.updateOne({ _id: institution._id }, { $set: { status: "ACTIVE", contractStartsAt: new Date(Date.now() - 86400000), contractEndsAt: new Date(Date.now() + 30 * 86400000) } });
    const invitedTeacher = await User.create({ name: "초대 교사", email: "native-invited-teacher@example.test", passwordHash: "fixture", role: "teacher" });
    const staffInvite = await require("../services/academyStaffInviteService").createAcademyStaffInvite({ teacherUserId: teacher._id, email: invitedTeacher.email });
    assert.equal((await request("/academy/teacher/staff-invite/accept", { token: createAccessToken(legacyTeacher), body: { inviteToken: staffInvite.token } })).status, 403);
    const joined = await request("/academy/teacher/staff-invite/accept", { token: createAccessToken(invitedTeacher), body: { inviteToken: staffInvite.token } });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.equal((await academyModels.AcademyStaff.findOne({ userId: invitedTeacher._id })).status, "PENDING");
    assert.equal((await request("/academy/teacher/staff-invite/accept", { token: createAccessToken(invitedTeacher), body: { inviteToken: staffInvite.token } })).status, 410);
    const email = "native-parent@example.test", password = "AuditParent123!";
    const signup = await request(prefix + "register", { body: { displayName: "테스트 보호자", email, password,
      passwordConfirm: password, termsAccepted: true, socialProfile: { provider: "apple", providerUserId: "untrusted" } } });
    assert.equal(signup.status, 202, JSON.stringify(signup.body));
    assert.equal(signup.body.emailVerificationRequired, true);
    assert.equal(signup.body.token, undefined);
    assert.equal(signup.cache, "no-store");
    const parent = await ParentAccount.findOne({ email }).select("+socialAuth.appleId");
    assert.ok(parent.emailVerificationRequiredAt);
    assert.ok(!parent.socialAuth?.appleId);
    const denied = await request(prefix + "login", { body: { email, password } });
    assert.equal(denied.status, 403); assert.equal(denied.body.code, "EMAIL_VERIFICATION_REQUIRED");
    await ParentAccount.updateOne({ _id: parent._id }, { $set: { emailVerifiedAt: new Date() }, $unset: { emailVerificationRequiredAt: 1 } });
    const login = await request(prefix + "login", { body: { email, password } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const token = login.body.token;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const dashboard = await request(prefix + "dashboard", { token });
    assert.equal(dashboard.status, 200); assert.deepEqual(dashboard.body.children, []);
    assert.equal(JSON.stringify(dashboard.body).includes("password"), false);
    const own = await ParentNotification.create({ parentAccountId: parent._id, title: "테스트 안내", message: "테스트 내용", kind: "admin" });
    const other = await ParentAccount.create({ username: "다른 보호자", usernameNormalized: "other-native-parent", email: "other-native-parent@example.test", passwordHash: await bcrypt.hash(password, 4), isActive: true });
    const foreign = await ParentNotification.create({ parentAccountId: other._id, title: "다른 계정 안내", message: "노출 금지", kind: "admin" });
    const administrator = await User.create({ name: "미리보기 운영자", email: "parent-preview-admin@example.test", passwordHash: "test", role: "admin" });
    const previewPath = `/admin/parents/${parent._id}/native-preview`;
    assert.equal((await request(previewPath, { token })).status, 401);
    const preview = await request(previewPath, { token: createAccessToken(administrator) });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.dashboard.parent.id, String(parent._id));
    assert.equal(preview.body.inbox.notifications.length, 1);
    assert.equal((await ParentNotification.findById(own._id)).readAt, null);
    assert.equal(await mongoose.model("ParentChildLink").countDocuments({ parentAccountId: parent._id }), 0);
    const inbox = await request(prefix + "mailbox", { token });
    assert.equal(inbox.body.notifications.length, 1); assert.equal(inbox.body.stats.unread, 1);
    assert.equal((await request(prefix + `mailbox/${own._id}`, { token })).status, 200);
    assert.equal((await ParentNotification.findById(own._id)).readAt, null);
    assert.equal((await request(prefix + `mailbox/${foreign._id}`, { token })).status, 404);
    assert.equal((await request(prefix + `mailbox/${foreign._id}/read`, { token, body: {} })).status, 404);
    assert.equal((await request(prefix + `mailbox/${own._id}/read`, { token, body: {} })).status, 200);
    assert.equal((await request(prefix + "mailbox", { token })).body.stats.unread, 0);
    assert.equal((await ParentNotification.findById(foreign._id)).readAt, null);
    const student = await User.create({ name: "테스트 학생", email: "parent-boundary@example.test", passwordHash: "test", role: "student" });
    const invitation = crypto.randomBytes(32).toString("base64url");
    await ParentInvite.create({ childUserId: student._id, parentEmail: email, productCode: "MOCK_EXAM_ONLY",
      tokenHash: crypto.createHash("sha256").update(invitation).digest("hex"), expiresAt: new Date(Date.now() + 3600000) });
    assert.equal((await request(prefix + "invite", { token, body: { inviteToken: invitation, relationship: "GUARDIAN", linkConsent: false } })).status, 400);
    assert.equal((await request(prefix + "invite", { token, body: { inviteToken: invitation, relationship: "GUARDIAN", linkConsent: true } })).status, 200);
    assert.equal((await request(prefix + "dashboard", { token })).body.children[0].id, String(student._id));
    assert.equal((await request(prefix + "invite", { token, body: { inviteToken: invitation, relationship: "GUARDIAN", linkConsent: true } })).status, 410);
    assert.equal((await request(prefix + "dashboard", { token: createAccessToken(student) })).status, 401);
    assert.equal((await request("/me", { token })).status, 401);
    const oldPasswordHash = (await ParentAccount.findById(parent._id).select("+passwordHash")).passwordHash;
    const resetRequest = await request("/auth/password-reset/request", { body: { email, accountType: "parent" } });
    assert.equal(resetRequest.status, 200); assert.ok(resetCode);
    const verified = await request("/auth/password-reset/verify", { body: { email, code: resetCode, accountType: "parent" } });
    assert.equal(verified.status, 200);
    const resetBody = { ...verified.body.resetAuthorization, password: "ChangedPassword123", passwordConfirm: "ChangedPassword123" };
    assert.equal((await request("/auth/password-reset/complete", { body: { ...resetBody, accountType: "student" } })).status, 400);
    assert.equal((await request("/auth/password-reset/complete", { body: { ...resetBody, accountType: "parent" } })).status, 200);
    await assert.rejects(require("../controllers/nativeParentController").issueNativeParentSession(parent._id, { expectedPasswordHash: oldPasswordHash }), error => error.status === 401);
    assert.equal((await request(prefix + "dashboard", { token })).status, 401);
    const nextLogin = await request(prefix + "login", { body: { email, password: "ChangedPassword123" } });
    assert.equal(nextLogin.status, 200);
    assert.equal((await request(prefix + "logout", { token: nextLogin.body.token, body: {} })).status, 200);
    assert.equal((await request(prefix + "dashboard", { token: nextLogin.body.token })).status, 401);
    console.log("PASS native parent: activation gating, isolated session, no social identity injection, child-link gate, mailbox isolation, password invalidation, logout revocation");
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
