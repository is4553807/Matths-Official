"use strict";

const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const sent = [];
let failMail = false;
nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    if (failMail) throw Object.assign(new Error("fixture SMTP failure"), { code: "ECONNRESET" });
    sent.push(mail);
    return { accepted: [mail.to], messageId: `test-${sent.length}` };
  },
});
process.env.EMAIL_VERIFICATION_BASE_URL = "https://www.matths.kr";
process.env.SUPPORT_SMTP_HOST = "smtp.test.invalid";
process.env.SUPPORT_SMTP_USER = "sender@test.invalid";
process.env.GMAIL_APP_PASSWORD = "test-only";

const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { AcademyAccount } = require("../models/academyModel");
const EmailVerification = require("../models/emailVerificationModel");
const { synchronizeAccountAccess } = require("../services/accountAccessService");
const { authenticateWebAccount } = require("../services/webLoginService");
const { authenticateAcademyAccount } = require("../services/academyAccountService");
const apiController = require("../controllers/apiController");
const {
  activateAccount,
  resendVerification,
  sendVerificationForAccount,
} = require("../services/emailVerificationService");

function lastToken() {
  const match = sent.at(-1)?.text.match(/verify-email\?token=([A-Za-z0-9_-]{43})/);
  assert.ok(match, "인증 메일에 공개 URL과 토큰이 있어야 합니다.");
  return match[1];
}

async function main() {
  await mongoose.connect(process.env.DB);
  try {
    await EmailVerification.init();
    const passwordHash = await bcrypt.hash("Password123", 4);
    const student = await User.create({
      name: "인증학생", email: "verification-student@test.invalid", passwordHash,
      role: "student", emailVerificationRequiredAt: new Date(),
    });
    const legacy = await User.create({
      name: "기존학생", email: "verification-legacy@test.invalid", passwordHash,
      role: "student",
    });
    assert.equal((await synchronizeAccountAccess(student._id)).status, "email-unverified");
    assert.equal((await synchronizeAccountAccess(student._id)).allowed, false);
    assert.equal((await synchronizeAccountAccess(legacy._id)).allowed, true);
    await assert.rejects(authenticateWebAccount({ email: student.email, password: "Password123" }), { status: 403 });

    assert.equal((await sendVerificationForAccount("user", student._id)).sent, true);
    const firstToken = lastToken();
    const stored = await EmailVerification.findOne({ accountId: student._id }).select("+tokenHash").lean();
    assert.notEqual(stored.tokenHash, firstToken, "토큰 원문을 DB에 저장하면 안 됩니다.");
    assert.equal((await sendVerificationForAccount("user", student._id)).reason, "cooldown");
    assert.equal(sent.length, 1);
    assert.equal((await activateAccount(firstToken)).activated, true);
    assert.equal((await activateAccount(firstToken)).activated, false, "링크는 한 번만 사용합니다.");
    assert.equal((await synchronizeAccountAccess(student._id)).allowed, true);
    assert.equal((await authenticateWebAccount({ email: student.email, password: "Password123" })).kind, "user");

    const apiResponse = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await apiController.register({ body: {
      realName: "앱 가입 학생", name: "앱가입학생", email: "verification-app@test.invalid",
      password: "Password123", birthDate: "1990-01-01", schoolGrade: 15,
      termsAccepted: true,
    } }, apiResponse, (error) => { throw error; });
    assert.equal(apiResponse.statusCode, 202);
    assert.equal(apiResponse.body.code, "EMAIL_VERIFICATION_REQUIRED");
    assert.equal(apiResponse.body.accessToken, undefined, "인증 전 앱 토큰을 발급하면 안 됩니다.");
    const apiUser = await User.findOne({ email: "verification-app@test.invalid" }).lean();
    assert.equal((await synchronizeAccountAccess(apiUser._id)).allowed, false);
    assert.equal((await activateAccount(lastToken())).activated, true);

    const retryUser = await User.create({
      name: "재발송학생", email: "verification-retry@test.invalid", passwordHash,
      role: "student", emailVerificationRequiredAt: new Date(),
    });
    failMail = true;
    await assert.rejects(sendVerificationForAccount("user", retryUser._id), { status: 502 });
    assert.equal(await EmailVerification.exists({ accountId: retryUser._id }), null, "발송 실패 토큰은 제거합니다.");
    failMail = false;
    assert.equal((await sendVerificationForAccount("user", retryUser._id)).sent, true);

    const teacher = await User.create({
      name: "인증교사", email: "verification-teacher@test.invalid", passwordHash,
      role: "teacher", emailVerificationRequiredAt: new Date(),
    });
    await AcademyAccount.create({ teacherUserId: teacher._id, displayName: "인증교사", email: teacher.email,
      passwordHash, legacyPasswordDisabledAt: new Date() });
    await assert.rejects(authenticateAcademyAccount({ email: teacher.email, password: "Password123" }), { code: "EMAIL_VERIFICATION_REQUIRED" });
    await sendVerificationForAccount("user", teacher._id);
    assert.equal((await activateAccount(lastToken())).loginPath, "/academy/login");
    assert.equal((await authenticateAcademyAccount({ email: teacher.email, password: "Password123" })).teacher.role, "teacher");

    const parent = await ParentAccount.create({
      username: "인증학부모", usernameNormalized: "verification-parent",
      email: "verification-parent@test.invalid", passwordHash,
      emailVerificationRequiredAt: new Date(),
    });
    await assert.rejects(authenticateWebAccount({ email: parent.email, password: "Password123" }), { status: 403 });
    await sendVerificationForAccount("parent", parent._id);
    const parentToken = lastToken();
    await EmailVerification.updateOne({ accountId: parent._id }, { $set: { sentAt: new Date(Date.now() - 61_000) } });
    await resendVerification(parent.email);
    const replacementToken = lastToken();
    assert.notEqual(replacementToken, parentToken);
    assert.equal((await activateAccount(parentToken)).activated, false, "재발송하면 이전 링크는 무효입니다.");
    await EmailVerification.updateOne({ accountId: parent._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await activateAccount(replacementToken)).activated, false, "만료된 링크는 무효입니다.");
    await EmailVerification.deleteOne({ accountId: parent._id });
    await resendVerification(parent.email);
    assert.equal((await activateAccount(lastToken())).loginPath, "/parent/login");
    assert.equal((await authenticateWebAccount({ email: parent.email, password: "Password123" })).kind, "parent");

    // 실제 라우터를 통과하는 학생 웹 가입 → 링크 클릭 → 로그인 흐름.
    const { server } = require("../server");
    const listener = await new Promise((resolve) => {
      const started = server.listen(0, "127.0.0.1", () => resolve(started));
    });
    try {
      const origin = `http://127.0.0.1:${listener.address().port}`;
      const signup = await fetch(`${origin}/student/register`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({
          realName: "웹가입학생", name: "웹가입학생", email: "verification-web@test.invalid",
          password: "Password123", passwordConfirm: "Password123", birthDate: "1990-01-01",
          schoolGrade: "15", termsAccepted: "on",
        }),
      });
      assert.equal(signup.status, 202, await signup.text());
      const pendingCookie = String(signup.headers.get("set-cookie") || "").match(/connect\.sid=[^;]+/)?.[0];
      assert.ok(pendingCookie, "재발송용 대기 세션이 있어야 합니다.");
      const pendingPage = await fetch(`${origin}/verify-email`, { headers: { Cookie: pendingCookie } });
      const pendingHtml = await pendingPage.text();
      assert.match(pendingHtml, /verification-web@test\.invalid/);
      assert.doesNotMatch(pendingHtml, /<input[^>]+name="email"/, "가입 이메일은 편집할 수 없어야 합니다.");
      const otherPending = await User.create({
        name: "다른 인증 대기 학생", email: "verification-other@test.invalid", passwordHash,
        role: "student", emailVerificationRequiredAt: new Date(),
      });
      assert.ok(otherPending);
      await EmailVerification.updateOne({ email: "verification-web@test.invalid" }, { $set: { sentAt: new Date(Date.now() - 61_000) } });
      const tamperedResend = await fetch(`${origin}/verify-email/resend`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", origin, Cookie: pendingCookie },
        body: new URLSearchParams({ email: otherPending.email }),
      });
      assert.equal(tamperedResend.status, 200);
      assert.equal(sent.at(-1).to, "verification-web@test.invalid", "요청 본문의 이메일로 재발송하면 안 됩니다.");
      const anonymousResend = await fetch(`${origin}/verify-email/resend`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({ email: otherPending.email }),
      });
      assert.equal(anonymousResend.status, 403, "대기 세션이 없으면 재발송할 수 없어야 합니다.");
      const webToken = lastToken();
      const login = () => fetch(`${origin}/student/login`, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({ email: "verification-web@test.invalid", password: "Password123" }),
      });
      const blocked = await login();
      assert.equal(blocked.status, 302);
      assert.equal(blocked.headers.get("location"), "/verify-email");
      const activated = await fetch(`${origin}/verify-email?token=${webToken}`);
      assert.equal(activated.status, 200);
      const activationHtml = await activated.text();
      assert.match(activationHtml, /계정이 활성화되었습니다/);
      assert.doesNotMatch(activationHtml, /googletagmanager/);
      assert.equal((await login()).status, 302);
      assert.equal((await fetch(`${origin}/verify-email?token=${webToken}`)).status, 400);
    } finally {
      await new Promise((resolve) => listener.close(resolve));
    }
    console.log("Email verification DB flow passed");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
