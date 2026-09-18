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
process.env.SUPPORT_SMTP_USER = "fixture@qa.invalid";
process.env.GMAIL_APP_PASSWORD = "fixture-password";
process.env.NODE_ENV = "test";
process.env.SECRET = crypto.randomBytes(48).toString("base64url");
process.env.APPLE_SERVICES_ID = "kr.matths.web";
process.env.APPLE_TEAM_ID = "TESTTEAM01";
process.env.APPLE_KEY_ID = "TESTKEY001";
process.env.APPLE_PRIVATE_KEY = crypto
  .generateKeyPairSync("ec", { namedCurve: "P-256" })
  .privateKey.export({ type: "pkcs8", format: "pem" });
process.env.PUBLIC_BASE_URL = "https://www.matths.kr";
process.env.APPLE_OAUTH_REDIRECT_URI =
  "https://www.matths.kr/auth/apple/callback";
process.env.DISABLE_SCHEDULERS = "1";
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { Academy, AcademyAccount } = require("../models/academyModel");
const Credential = require("../models/appleAuthCredentialModel");
const { _testing: native } = require("../services/appleAuthService");
const { loginDestination } = require("../services/webLoginService");
const { registerAcademyAccount } = require("../services/academyAccountService");
const { activateAccount } = require("../services/emailVerificationService");
const auth = require("../middleware/authMiddleware");
const realFetch = global.fetch;
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...rsa.publicKey.export({ format: "jwk" }),
  kid: "fixture",
  alg: "RS256",
  use: "sig",
};
const grants = new Map();
const encode = (data) =>
  Buffer.from(JSON.stringify(data)).toString("base64url");
function token(subject, email, nonce) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "RS256", kid: "fixture" })}.${encode({ iss: "https://appleid.apple.com", aud: process.env.APPLE_SERVICES_ID, sub: subject, email, email_verified: "true", nonce, iat: now, exp: now + 300 })}`;
  return `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), rsa.privateKey).toString("base64url")}`;
}
global.fetch = async (url, options) => {
  if (String(url) === native.APPLE_JWKS_URL)
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  if (String(url) === native.APPLE_TOKEN_URL) {
    const code = options.body.get("code");
    const grant = grants.get(code);
    grants.delete(code);
    return new Response(
      JSON.stringify(
        grant
          ? { refresh_token: `secret-${code}`, id_token: grant }
          : { error: "invalid_grant" },
      ),
      { status: grant ? 200 : 400 },
    );
  }
  return realFetch(url, options);
};
const cookie = (response) =>
  String(response.headers.get("set-cookie") || "").match(
    /connect\.sid=[^;]+/,
  )?.[0] || "";
let memory, listener;
async function main() {
  memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri());
  await Promise.all(
    [User, ParentAccount, AcademyAccount, Credential].map((model) =>
      model.init(),
    ),
  );
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.resolve(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: process.env.SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { sameSite: "lax" },
    }),
  );
  app.use((_req, res, next) => {
    res.locals.assetVersion = "apple-test";
    next();
  });
  app.get("/__session", (req, res) =>
    res.json({
      user: req.session.user,
      parent: req.session.parent,
      pending: req.session.pendingSocialRegistration?.accountType,
    }),
  );
  app.get(
    "/__student",
    auth.requireStudentAccount,
    auth.isLoggedIn,
    (_req, res) => res.send("student"),
  );
  app.use(require("../routes/parent-routes"));
  app.use(require("../routes/academy-routes"));
  app.use(require("../routes/matths-routes"));
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).send(error.message),
  );
  listener = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  const get = (url, sid) =>
    fetch(origin + url, {
      redirect: "manual",
      headers: sid ? { Cookie: sid } : {},
    });
  const post = (url, fields, sid) =>
    fetch(origin + url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: url.startsWith("/auth/apple")
          ? "https://appleid.apple.com"
          : origin,
        ...(sid ? { Cookie: sid } : {}),
      },
      body: new URLSearchParams(fields),
    });
  async function apple(type, email, subject = email, query = "") {
    const start = await get(
      `/auth/apple?accountType=${type}&next=/admin/users${query}`,
    );
    assert.equal(start.status, 302);
    const url = new URL(start.headers.get("location"));
    const code = crypto.randomUUID(),
      idToken = token(subject, email, url.searchParams.get("nonce"));
    grants.set(code, idToken);
    const fields = {
      code,
      id_token: idToken,
      state: url.searchParams.get("state"),
      accountType: "admin",
      user: JSON.stringify({
        name: { firstName: "애플", lastName: "데모" },
        email: "forged@qa.invalid",
      }),
    };
    // Deliberately omit the start cookie: cross-site form_post may not send Lax cookies.
    const response = await post("/auth/apple/callback", fields);
    return { response, sid: cookie(response), fields };
  }
  const teacherResult = await registerAcademyAccount({
    displayName: "애플 교사",
    email: "teacher@qa.invalid",
    password: "Password1!",
    passwordConfirm: "Password1!",
    termsAccepted: "1",
    academyName: "애플 학원",
    address: "서울시 테스트로 1",
    contactPhone: "02-1234-5678",
    authorityConfirmed: "1",
  });
  await Academy.updateOne(
    { _id: teacherResult.academy._id },
    {
      $set: {
        status: "ACTIVE",
        contractEndsAt: new Date(Date.now() + 86400000 * 30),
      },
    },
  );
  await User.updateOne(
    { _id: teacherResult.teacher._id },
    { $set: { teacherAccessExpiresAt: new Date(Date.now() + 86400000 * 30), emailVerifiedAt: new Date() }, $unset: { emailVerificationRequiredAt: "" } },
  );
  const admin = await User.create({
    name: "애플 관리자",
    email: "admin@qa.invalid",
    passwordHash: "unused",
    role: "admin",
  });
  const student = await User.create({
    name: "애플 학생",
    email: "student@qa.invalid",
    passwordHash: "unused",
    role: "student",
    birthDate: "2009-01-01",
  });
  const parent = await ParentAccount.create({
    username: "애플 학부모",
    usernameNormalized: "apple-parent",
    email: "parent@qa.invalid",
    passwordHash: "unused",
  });
  for (const type of ["student", "academy", "parent"])
    for (const account of [
      { kind: "user", user: admin },
      { kind: "user", user: student },
      { kind: "user", user: teacherResult.teacher },
      { kind: "parent", parent },
    ]) {
      const owner = account.user || account.parent;
      const result = await apple(type, owner.email);
      assert.equal(
        result.response.headers.get("location"),
        loginDestination(account, "/admin/users"),
        await result.response.text(),
      );
      const identity = await (await get("/__session", result.sid)).json();
      assert.equal(
        String(identity.parent?.id || identity.user?.id),
        String(owner._id),
      );
      if (account.kind === "parent" || account.user.role === "teacher")
        assert.notEqual((await get("/__student", result.sid)).status, 200);
      assert.notEqual(
        (await post("/auth/apple/callback", result.fields)).headers.get(
          "location",
        ),
        loginDestination(account, "/admin/users"),
        "authorization code replay must fail",
      );
    }
  const studentEmail = "new-apple-student@qa.invalid";
  const studentSignup = await apple("student", studentEmail);
  assert.equal(new URL(studentSignup.response.headers.get("location"), origin).pathname, "/student/register");
  const studentRegistration = await post("/student/register", {
    realName: "애플 신규 학생", name: "애플신규학생", email: studentEmail,
    birthDate: "1990-01-01", schoolGrade: "15", termsAccepted: "on",
  }, studentSignup.sid);
  assert.equal(studentRegistration.status, 202, await studentRegistration.text());
  const registeredStudent = await User.findOne({ email: studentEmail });
  assert.ok(registeredStudent.emailVerificationRequiredAt);
  assert.equal(registeredStudent.emailVerifiedAt, null);
  const pendingStudentLogin = await apple("student", studentEmail);
  assert.equal(new URL(pendingStudentLogin.response.headers.get("location"), origin).pathname, "/verify-email");
  assert.match(await (await get("/verify-email", pendingStudentLogin.sid)).text(), /이메일 인증이 필요합니다/);
  const pendingStudentSession = await (await get("/__session", pendingStudentLogin.sid)).json();
  assert.equal(pendingStudentSession.user?.id, undefined);
  const studentActivationToken = activationMails.at(-1)?.text.match(/verify-email\?token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(studentActivationToken);
  assert.equal((await activateAccount(studentActivationToken)).activated, true);
  const verifiedStudentLogin = await apple("student", studentEmail);
  assert.equal(new URL(verifiedStudentLogin.response.headers.get("location"), origin).pathname, "/main");

  for (const type of ["academy", "parent"]) {
    for (const page of ["login", "register"])
      assert.match(
        await (await get(`/${type}/${page}`)).text(),
        new RegExp(`/auth/apple\\?accountType=${type}`),
      );
    const address = `new-${type}@qa.invalid`,
      result = await apple(type, address);
    assert.equal(
      new URL(result.response.headers.get("location"), origin).pathname,
      `/${type}/register`,
    );
    assert.equal(
      await User.exists({ email: address }),
      null,
      "no provisional student for portal signup",
    );
    const form = await (await get(`/${type}/register`, result.sid)).text();
    assert.match(form, /인증 완료/);
    assert.doesNotMatch(form, /name="password"/);
    assert.equal(
      (
        await post(
          `/${type}/register`,
          { displayName: "애플 가입자" },
          result.sid,
        )
      ).status,
      400,
    );
    const fields = {
      displayName: "애플 가입자",
      email: "forged@qa.invalid",
      role: "admin",
      termsAccepted: "1",
      ...(type === "academy"
        ? {
            academyName: "애플 신규 학원",
            address: "서울시 테스트로 1",
            contactPhone: "02-1234-5678",
            authorityConfirmed: "1",
            registrationFlow: "new",
          }
        : {}),
    };
    const created = await post(`/${type}/register`, fields, result.sid);
    assert.equal(created.status, 202, await created.text());
    const owner = await (type === "parent" ? ParentAccount : User)
      .findOne({ email: address })
      .select("+socialAuth.appleId");
    assert.equal(owner.socialAuth.appleId, address);
    assert.ok(owner.emailVerificationRequiredAt);
    assert.equal(owner.emailVerifiedAt, null);
    const pendingLogin = await apple(type, address);
    assert.equal(new URL(pendingLogin.response.headers.get("location"), origin).pathname, "/verify-email");
    assert.match(await (await get("/verify-email", pendingLogin.sid)).text(), /이메일 인증이 필요합니다/);
    const pendingSession = await (await get("/__session", pendingLogin.sid)).json();
    assert.equal(pendingSession.user?.id || pendingSession.parent?.id, undefined);
    const activationToken = activationMails.at(-1)?.text.match(/verify-email\?token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(activationToken);
    assert.equal((await activateAccount(activationToken)).activated, true);
    const verifiedLogin = await apple(type, address);
    assert.equal(verifiedLogin.response.headers.get("location"), loginDestination(type === "parent" ? { kind: "parent", parent: owner } : { kind: "user", user: owner }, "/admin/users"));
    const credential = await Credential.findOne({ userId: owner._id }).select(
      "+refreshToken",
    );
    assert.equal(
      credential.ownerModel,
      type === "parent" ? "ParentAccount" : "User",
    );
    assert.match(credential.refreshToken, /^v1\./);
    if (type === "academy")
      assert.equal(
        (await Academy.findOne({ createdByUserId: owner._id })).status,
        "PENDING",
      );
    else assert.equal(await User.exists({ email: address }), null);
  }
  await assert.rejects(
    () =>
      native.linkAppleIdentity({
        claims: {
          subject: parent.email,
          email: parent.email,
          emailVerified: true,
        },
      }),
    (error) => error.code === "SOCIAL_AUTH_PARENT_ACCOUNT",
  );
  const tampered = await apple("parent", "tamper@qa.invalid");
  assert.equal(
    new URL(
      (
        await post("/auth/apple/callback", {
          ...tampered.fields,
          state: tampered.fields.state + "x",
        })
      ).headers.get("location"),
    ).pathname,
    "/student/login",
  );
  assert.equal(await User.exists({ email: "tamper@qa.invalid" }), null);
  console.log(
    "Apple portal HTTP/Mongo verified: student/academy/parent signup waits for email activation; existing role redirects, encrypted credentials, signed state, one-use code, consent and approval.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    global.fetch = realFetch;
    if (listener) await new Promise((resolve) => listener.close(resolve));
    await mongoose.disconnect();
    if (memory) await memory.stop();
  });
