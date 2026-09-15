"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

process.env.DISABLE_SCHEDULERS = "1";

const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const {
  Academy,
  AcademyAccount,
  AcademyStaff,
} = require("../models/academyModel");

const CONFIRMATION = "VERIFY_LIVE_ROLE_LOGINS";
const ORIGINS = Object.freeze({
  student: "https://www.matths.kr",
  academy: "https://academy.matths.kr",
  parent: "https://parents.matths.kr",
  admin: "https://admin.matths.kr",
});

function loginPath(role) {
  return {
    student: "/student/login",
    academy: "/academy/login",
    parent: "/parent/login",
    admin: "/admin/login",
  }[role];
}

function destination(role) {
  return {
    student: "https://app.matths.kr/main",
    academy: "https://academy.matths.kr/academy",
    parent: "https://parents.matths.kr/parent",
    admin: "https://admin.matths.kr/admin",
  }[role];
}

function sessionCookie(response) {
  const raw = String(response.headers.get("set-cookie") || "");
  const match = raw.match(/connect\.sid=[^;]+/);
  assert.ok(match, "로그인 응답에 세션 쿠키가 없습니다.");
  assert.match(raw, /\bSecure\b/i, "운영 세션 쿠키는 Secure여야 합니다.");
  assert.match(raw, /\bHttpOnly\b/i, "운영 세션 쿠키는 HttpOnly여야 합니다.");
  return match[0];
}

async function responseMessage(response) {
  const body = await response.text();
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function login(role, account) {
  const origin = ORIGINS[role];
  const response = await fetch(`${origin}${loginPath(role)}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
      Referer: `${origin}${loginPath(role)}`,
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Matths live role login verifier",
    },
    body: new URLSearchParams({
      email: account.email,
      password: account.password,
    }),
  });
  if (response.status !== 302) {
    throw new Error(
      `${role} 로그인 실패 (${response.status}): ${await responseMessage(response)}`,
    );
  }
  assert.equal(response.headers.get("location"), destination(role));
  const cookie = sessionCookie(response);
  const dashboard = await fetch(destination(role), {
    redirect: "manual",
    headers: {
      Cookie: cookie,
      "User-Agent": "Matths live role login verifier",
    },
  });
  assert.equal(
    dashboard.status,
    200,
    `${role} 대시보드 접근 실패: ${dashboard.status} ${dashboard.headers.get("location") || ""}`,
  );
  return cookie;
}

async function logout(role, cookie) {
  const target = {
    student: ["https://app.matths.kr", "/logout"],
    academy: [ORIGINS.academy, "/academy/logout"],
    parent: [ORIGINS.parent, "/parent/logout"],
    admin: [ORIGINS.admin, "/logout"],
  }[role];
  if (!target || !cookie) return;
  await fetch(`${target[0]}${target[1]}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: cookie,
      Origin: target[0],
      Referer: destination(role),
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Matths live role login verifier",
    },
  }).catch(() => {});
}

async function createFixtures(batchKey) {
  const suffix = batchKey.split(":").at(-1).slice(0, 10);
  const password = `Role1!${crypto.randomBytes(24).toString("base64url")}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  const common = {
    isActive: true,
    accountStatus: "active",
    termsAcceptedAt: now,
    isTestAccount: true,
    testBatchKey: batchKey,
  };
  const student = await User.create({
    ...common,
    name: `실로그인학생-${suffix}`,
    nameNormalized: `실로그인학생-${suffix}`,
    realName: "실로그인 학생",
    email: `student-${suffix}@role-login.invalid`,
    passwordHash,
    role: "student",
    birthDate: new Date("2009-01-15T00:00:00.000Z"),
    schoolGrade: 11,
  });
  const teacher = await User.create({
    ...common,
    name: `실로그인교사-${suffix}`,
    nameNormalized: `실로그인교사-${suffix}`,
    realName: "실로그인 교사",
    email: `academy-${suffix}@role-login.invalid`,
    passwordHash: await bcrypt.hash(
      crypto.randomBytes(48).toString("base64url"),
      12,
    ),
    role: "teacher",
    teacherAccessExpiresAt: new Date(now.getTime() + 86_400_000),
  });
  const admin = await User.create({
    ...common,
    name: `실로그인운영자-${suffix}`,
    nameNormalized: `실로그인운영자-${suffix}`,
    realName: "실로그인 운영자",
    email: `admin-${suffix}@role-login.invalid`,
    passwordHash,
    role: "admin",
  });
  const parent = await ParentAccount.create({
    username: "실로그인 학부모",
    usernameNormalized: `live-parent-${suffix}`,
    email: `parent-${suffix}@role-login.invalid`,
    passwordHash,
    childUserId: student._id,
    isActive: true,
    acceptedTermsAt: now,
    acceptedPrivacyAt: now,
  });
  const academyAccount = await AcademyAccount.create({
    teacherUserId: teacher._id,
    displayName: teacher.realName,
    email: teacher.email,
    passwordHash,
    isActive: true,
    acceptedTermsAt: now,
    acceptedPrivacyAt: now,
    authorityConfirmedAt: now,
    legacyPasswordDisabledAt: now,
  });
  const academy = await Academy.create({
    name: `실로그인 검증 학원 ${suffix}`,
    nameNormalized: `실로그인 검증 학원 ${suffix}`,
    status: "ACTIVE",
    contractStartsAt: new Date(now.getTime() - 86_400_000),
    contractEndsAt: new Date(now.getTime() + 86_400_000),
    createdByUserId: teacher._id,
  });
  const staff = await AcademyStaff.create({
    academyId: academy._id,
    userId: teacher._id,
    role: "OWNER",
    status: "ACTIVE",
    currentStaffKey: String(teacher._id),
    requestedAt: now,
    joinedAt: now,
  });
  return {
    student: { id: student._id, email: student.email, password },
    academy: { id: teacher._id, email: teacher.email, password },
    parent: { id: parent._id, email: parent.email, password },
    admin: { id: admin._id, email: admin.email, password },
    ids: {
      users: [student._id, teacher._id, admin._id],
      parent: parent._id,
      academyAccount: academyAccount._id,
      academy: academy._id,
      staff: staff._id,
    },
  };
}

async function cleanup(batchKey) {
  const suffix = batchKey.split(":").at(-1).slice(0, 10);
  const users = await User.find({ testBatchKey: batchKey }).select("_id").lean();
  const userIds = users.map((user) => user._id);
  const academies = await Academy.find({
    createdByUserId: { $in: userIds },
    name: `실로그인 검증 학원 ${suffix}`,
  }).select("_id").lean();
  const academyIds = academies.map((academy) => academy._id);
  if (userIds.length || academyIds.length) {
    await AcademyStaff.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        { academyId: { $in: academyIds } },
      ],
    });
  }
  await Promise.all([
    AcademyAccount.deleteMany({ email: `academy-${suffix}@role-login.invalid` }),
    ParentAccount.deleteMany({ email: `parent-${suffix}@role-login.invalid` }),
    Academy.deleteMany({ _id: { $in: academyIds } }),
  ]);
  await User.deleteMany({ testBatchKey: batchKey });
  await mongoose.connection
    .collection("sessions")
    .deleteMany({ session: { $regex: suffix } })
    .catch(() => {});
}

async function main() {
  require("dotenv").config({ path: "config.env", quiet: true });
  if (!process.argv.includes(`--confirm=${CONFIRMATION}`)) {
    throw new Error(`--confirm=${CONFIRMATION}가 필요합니다.`);
  }
  await mongoose.connect(process.env.DB, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 15_000,
  });
  const batchKey = `role-login-live:${crypto.randomUUID()}`;
  let fixtures;
  let verified = false;
  const cookies = {};
  try {
    fixtures = await createFixtures(batchKey);
    for (const role of ["student", "academy", "parent", "admin"]) {
      cookies[role] = await login(role, fixtures[role]);
    }
    verified = true;
  } finally {
    await Promise.all(
      Object.entries(cookies).map(([role, cookie]) => logout(role, cookie)),
    );
    await cleanup(batchKey);
    await mongoose.disconnect();
  }
  if (verified) {
    console.log(
      JSON.stringify({
        verified: true,
        roles: ["student", "academy", "parent", "admin"],
        checks: [
          "production password authentication",
          "secure session cookie",
          "role redirect",
          "dashboard access",
        ],
        temporaryAccountsRemoved: true,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
