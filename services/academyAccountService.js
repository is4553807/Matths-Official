"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const {
  Academy,
  AcademyAccount,
  AcademyStaff,
} = require("../models/academyModel");
const { synchronizeAccountAccess } = require("./accountAccessService");

const BCRYPT_ROUNDS = 12;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validatePassword(password, passwordConfirm) {
  const value = String(password || "");
  if (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw statusError(400, "비밀번호는 영문과 숫자를 포함해 8자 이상으로 입력해주세요.");
  }
  if (Buffer.byteLength(value, "utf8") > 72) {
    throw statusError(400, "비밀번호가 너무 깁니다.");
  }
  if (value !== String(passwordConfirm || "")) {
    throw statusError(400, "비밀번호 확인이 일치하지 않습니다.");
  }
  return value;
}

async function disabledLegacyPasswordHash() {
  return bcrypt.hash(crypto.randomBytes(48).toString("base64url"), BCRYPT_ROUNDS);
}

async function disableLegacyTeacherCredential(account, passwordHash = "") {
  if (!account || account.legacyPasswordDisabledAt) return false;
  const disabledAt = new Date();
  const inaccessiblePasswordHash = passwordHash || await disabledLegacyPasswordHash();
  await User.updateOne(
    { _id: account.teacherUserId, role: "teacher" },
    { $set: { passwordHash: inaccessiblePasswordHash } }
  );
  await AcademyAccount.updateOne(
    { _id: account._id, legacyPasswordDisabledAt: null },
    { $set: { legacyPasswordDisabledAt: disabledAt } }
  );
  account.legacyPasswordDisabledAt = disabledAt;
  return true;
}

async function migrateLegacyTeacherAccount(email, password) {
  const legacyTeacher = await User.findOne({ email, role: "teacher" })
    .select("+passwordHash")
    .lean();
  if (!legacyTeacher) return null;
  const matches = await bcrypt.compare(password, legacyTeacher.passwordHash || "");
  if (!matches) return null;

  try {
    return await AcademyAccount.create({
      teacherUserId: legacyTeacher._id,
      displayName: normalizedName(legacyTeacher.realName || legacyTeacher.name || "선생님"),
      email,
      passwordHash: legacyTeacher.passwordHash,
      isActive: legacyTeacher.isActive !== false,
      acceptedTermsAt: legacyTeacher.termsAcceptedAt || new Date(),
      acceptedPrivacyAt: legacyTeacher.termsAcceptedAt || new Date(),
      migratedFromLegacyUserAt: new Date(),
    });
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    return AcademyAccount.findOne({ email }).select("+passwordHash");
  }
}

async function authenticateAcademyAccount({ email, password }) {
  const cleanEmail = normalizedEmail(email);
  const secret = String(password || "");
  let account = await AcademyAccount.findOne({ email: cleanEmail })
    .select("+passwordHash");

  if (!account) {
    account = await migrateLegacyTeacherAccount(cleanEmail, secret);
  }

  const matched = account
    ? await bcrypt.compare(secret, account.passwordHash || "")
    : false;
  if (!account || !matched) {
    throw statusError(401, "이메일 또는 비밀번호가 올바르지 않습니다.", "ACADEMY_LOGIN_INVALID");
  }
  if (account.isActive === false) {
    throw statusError(403, "이용이 중지된 학원 계정입니다.", "ACADEMY_ACCOUNT_INACTIVE");
  }

  const access = await synchronizeAccountAccess(account.teacherUserId);
  if (!access?.allowed || access.user?.role !== "teacher") {
    throw statusError(403, "학원 계정 이용 상태를 확인해주세요.", "ACADEMY_ACCOUNT_INACTIVE");
  }

  await disableLegacyTeacherCredential(account);
  account.lastLoginAt = new Date();
  await account.save();
  return { account, teacher: access.user };
}

async function registerAcademyAccount({
  displayName,
  academyName,
  email,
  password,
  passwordConfirm,
  termsAccepted,
}) {
  const teacherName = normalizedName(displayName);
  const organizationName = normalizedName(academyName);
  const cleanEmail = normalizedEmail(email);
  const secret = validatePassword(password, passwordConfirm);

  if (teacherName.length < 2 || teacherName.length > 40) {
    throw statusError(400, "선생님 이름은 2자 이상 40자 이하로 입력해주세요.");
  }
  if (organizationName.length < 2 || organizationName.length > 80) {
    throw statusError(400, "학원 이름은 2자 이상 80자 이하로 입력해주세요.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw statusError(400, "올바른 이메일 주소를 입력해주세요.");
  }
  if (termsAccepted !== true) {
    throw statusError(400, "이용약관과 개인정보처리방침에 동의해주세요.");
  }

  const [userExists, academyAccountExists, parentExists] = await Promise.all([
    User.exists({ email: cleanEmail }),
    AcademyAccount.exists({ email: cleanEmail }),
    ParentAccount.exists({ email: cleanEmail }),
  ]);
  if (userExists || academyAccountExists || parentExists) {
    throw statusError(409, "이미 사용 중인 이메일입니다.");
  }

  let teacher = null;
  let account = null;
  let academy = null;
  try {
    const now = new Date();
    const inaccessibleLegacyPassword = await bcrypt.hash(
      crypto.randomBytes(48).toString("base64url"),
      BCRYPT_ROUNDS
    );
    teacher = await User.create({
      name: teacherName,
      realName: teacherName,
      email: cleanEmail,
      passwordHash: inaccessibleLegacyPassword,
      role: "teacher",
      isActive: true,
      accountStatus: "active",
      termsAcceptedAt: now,
      termsVersion: "2026-08-13",
      privacyVersion: "2026-08-13",
      lastLoginAt: now,
    });
    account = await AcademyAccount.create({
      teacherUserId: teacher._id,
      displayName: teacherName,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(secret, BCRYPT_ROUNDS),
      acceptedTermsAt: now,
      acceptedPrivacyAt: now,
      lastLoginAt: now,
      legacyPasswordDisabledAt: now,
    });
    academy = await Academy.create({
      name: organizationName,
      nameNormalized: organizationName.toLocaleLowerCase("ko-KR"),
      status: "PENDING",
      createdByUserId: teacher._id,
      contractStartsAt: null,
      contractEndsAt: null,
      planCode: "ACADEMY_MOCK_INCLUDED",
      includesMockExam: true,
    });
    await AcademyStaff.create({
      academyId: academy._id,
      userId: teacher._id,
      role: "OWNER",
      status: "ACTIVE",
      currentStaffKey: String(teacher._id),
      requestedAt: now,
      joinedAt: null,
    });
    return { account, teacher, academy };
  } catch (error) {
    if (academy?._id) await Academy.deleteOne({ _id: academy._id }).catch(() => {});
    if (account?._id) await AcademyAccount.deleteOne({ _id: account._id }).catch(() => {});
    if (teacher?._id) await User.deleteOne({ _id: teacher._id }).catch(() => {});
    if (Number(error?.code) === 11000) {
      throw statusError(409, "이미 사용 중인 이메일 또는 학원 계정입니다.");
    }
    throw error;
  }
}

async function migrateLegacyAcademyAccounts() {
  const teachers = await User.find({ role: "teacher" })
    .select("+passwordHash name realName email isActive termsAcceptedAt")
    .lean();
  if (!teachers.length) return { migratedCount: 0, disabledLegacyPasswordCount: 0 };

  const accounts = await AcademyAccount.find({
    $or: [
      { teacherUserId: { $in: teachers.map((teacher) => teacher._id) } },
      { email: { $in: teachers.map((teacher) => teacher.email) } },
    ],
  }).select("+passwordHash");
  const accountByTeacherId = new Map(accounts.map((account) => [String(account.teacherUserId), account]));
  const accountByEmail = new Map(accounts.map((account) => [String(account.email), account]));
  let migratedCount = 0;

  for (const teacher of teachers) {
    let account = accountByTeacherId.get(String(teacher._id));
    const emailAccount = accountByEmail.get(String(teacher.email));
    if (emailAccount && String(emailAccount.teacherUserId) !== String(teacher._id)) {
      throw statusError(409, `학원 계정 이메일 연결이 충돌합니다: ${teacher.email}`, "ACADEMY_ACCOUNT_MIGRATION_CONFLICT");
    }
    if (!account) {
      account = await AcademyAccount.create({
        teacherUserId: teacher._id,
        displayName: normalizedName(teacher.realName || teacher.name || "선생님"),
        email: teacher.email,
        passwordHash: teacher.passwordHash,
        isActive: teacher.isActive !== false,
        acceptedTermsAt: teacher.termsAcceptedAt || new Date(),
        acceptedPrivacyAt: teacher.termsAcceptedAt || new Date(),
        migratedFromLegacyUserAt: new Date(),
      });
      migratedCount += 1;
    }
    accountByTeacherId.set(String(teacher._id), account);
    accountByEmail.set(String(teacher.email), account);
  }

  const accountsToDisable = [...accountByTeacherId.values()]
    .filter((account) => !account.legacyPasswordDisabledAt);
  const sharedDisabledHash = accountsToDisable.length
    ? await disabledLegacyPasswordHash()
    : "";
  let disabledLegacyPasswordCount = 0;
  for (const account of accountsToDisable) {
    if (await disableLegacyTeacherCredential(account, sharedDisabledHash)) {
      disabledLegacyPasswordCount += 1;
    }
  }
  return { migratedCount, disabledLegacyPasswordCount };
}

module.exports = {
  authenticateAcademyAccount,
  migrateLegacyAcademyAccounts,
  registerAcademyAccount,
};
