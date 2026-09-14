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
const { getAcademyStaffInvite, acceptAcademyStaffInvite } = require("./academyStaffInviteService");
const { validateAccount, validateInstitution } = require("./portalRegistrationValidation");

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
  branchName,
  address,
  contactPhone,
  authorityConfirmed,
  registrationFlow = "new",
  inviteToken,
  socialProfile = null,
}) {
  if (!["new", "staff"].includes(registrationFlow)) throw statusError(400, "학원 가입 경로를 다시 선택해주세요.");
  const credentials = validateAccount(require("./portalSocialAuthService").socialCredentials({ displayName, email, password, passwordConfirm, termsAccepted }, socialProfile), { nameLabel: "담당자 이름" });
  const teacherName = credentials.displayName;
  const cleanEmail = credentials.email;
  const secret = credentials.password;
  const institution = registrationFlow === "new" ? validateInstitution({ academyName, branchName, address, contactPhone, authorityConfirmed }) : null;
  const invited = registrationFlow === "staff" ? await getAcademyStaffInvite(inviteToken) : null;
  if (invited && invited.invite.email !== cleanEmail) throw statusError(400, "초대를 받은 이메일로 가입해주세요.");

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
      teacherAccessExpiresAt: invited ? invited.academy.contractEndsAt : null,
      ...(socialProfile ? { [require("./socialAuthService").socialIdPath(socialProfile.provider)]: socialProfile.providerUserId, emailVerifiedAt: now } : {}),
    });
    await require("./portalSocialAuthService").bindAppleAccount(socialProfile, { kind: "user", user: teacher });
    account = await AcademyAccount.create({
      teacherUserId: teacher._id,
      displayName: teacherName,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(secret, BCRYPT_ROUNDS),
      acceptedTermsAt: now,
      acceptedPrivacyAt: now,
      lastLoginAt: now,
      legacyPasswordDisabledAt: now,
      authorityConfirmedAt: institution ? now : null,
    });
    if (invited) {
      const joined = await acceptAcademyStaffInvite({ value: invited.token, teacherUserId: teacher._id, email: cleanEmail });
      return { account, teacher, academy: joined.academy, staff: joined.staff };
    }
    academy = await Academy.create({
      name: institution.academyName,
      nameNormalized: institution.academyName.toLocaleLowerCase("ko-KR"),
      branchName: institution.branchName,
      address: institution.address,
      contactPhone: institution.contactPhone,
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
    if (teacher?._id) await require("./portalSocialAuthService").removeAppleAccountBinding(socialProfile, teacher._id);
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
