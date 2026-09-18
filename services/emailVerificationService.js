"use strict";

const crypto = require("node:crypto");
const EmailVerification = require("../models/emailVerificationModel");
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { sendAccountActivation } = require("./emailService");
const { serviceOrigins } = require("./serviceUrlService");

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;
const INVALID_LINK_MESSAGE = "인증 링크가 올바르지 않거나 만료되었습니다. 인증 메일을 다시 요청해주세요.";
let indexPromise = null;

function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = Promise.all([
      EmailVerification.collection.createIndex({ accountType: 1, accountId: 1 }, { unique: true, name: "accountType_1_accountId_1" }),
      EmailVerification.collection.createIndex({ tokenHash: 1 }, { unique: true, name: "tokenHash_1" }),
      EmailVerification.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expiresAt_1" }),
    ]).catch((error) => { indexPromise = null; throw error; });
  }
  return indexPromise;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function modelFor(accountType) {
  if (accountType === "user") return User;
  if (accountType === "parent") return ParentAccount;
  throw new Error("지원하지 않는 계정 유형입니다.");
}

async function sendVerificationForAccount(accountType, accountId) {
  const Model = modelFor(accountType);
  const account = await Model.findOne({
    _id: accountId,
    emailVerificationRequiredAt: { $ne: null },
    emailVerifiedAt: null,
  }).select("email").lean();
  if (!account) return { sent: false, reason: "not-pending" };
  await ensureIndexes();

  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const tokenHash = hashToken(token);
  let reservation;
  try {
    reservation = await EmailVerification.updateOne(
      {
        accountType,
        accountId: account._id,
        sentAt: { $lt: new Date(now.getTime() - RESEND_WAIT_MS) },
      },
      { $set: { email: account.email, tokenHash, sentAt: now, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS) } },
      { upsert: true }
    );
  } catch (error) {
    if (error.code === 11000) return { sent: false, reason: "cooldown" };
    throw error;
  }
  if (!reservation.upsertedCount && !reservation.modifiedCount) {
    return { sent: false, reason: "cooldown" };
  }

  const publicOrigin = String(process.env.EMAIL_VERIFICATION_BASE_URL || serviceOrigins().public || "").trim();
  let activationUrl = "";
  try {
    const base = new URL(publicOrigin);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password ||
        (process.env.NODE_ENV === "production" && base.protocol !== "https:")) {
      throw new Error("Invalid public origin");
    }
    activationUrl = new URL(`/verify-email?token=${encodeURIComponent(token)}`, base.origin).toString();
  } catch (_error) {
    await EmailVerification.deleteOne({ accountType, accountId: account._id, tokenHash });
    const error = new Error("PUBLIC_BASE_URL 설정이 없어 인증 링크를 만들 수 없습니다.");
    error.status = 503;
    throw error;
  }
  try {
    await sendAccountActivation({ to: account.email, activationUrl });
  } catch (error) {
    await EmailVerification.deleteOne({ accountType, accountId: account._id, tokenHash });
    throw error;
  }
  return { sent: true };
}

async function resendVerification(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    const error = new Error("올바른 이메일 주소를 입력해주세요.");
    error.status = 400;
    throw error;
  }
  const [user, parent] = await Promise.all([
    User.findOne({ email: normalized, emailVerificationRequiredAt: { $ne: null }, emailVerifiedAt: null }).select("_id").lean(),
    ParentAccount.findOne({ email: normalized, emailVerificationRequiredAt: { $ne: null }, emailVerifiedAt: null }).select("_id").lean(),
  ]);
  if (user) await sendVerificationForAccount("user", user._id);
  if (parent) await sendVerificationForAccount("parent", parent._id);
  return { requested: true };
}

async function activateAccount(rawToken) {
  const token = String(rawToken || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return { activated: false, message: INVALID_LINK_MESSAGE };
  }
  const record = await EmailVerification.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!record) return { activated: false, message: INVALID_LINK_MESSAGE };

  const Model = modelFor(record.accountType);
  const account = await Model.findOneAndUpdate(
    { _id: record.accountId, email: record.email, emailVerificationRequiredAt: { $ne: null }, emailVerifiedAt: null },
    { $set: { emailVerifiedAt: new Date() }, $unset: { emailVerificationRequiredAt: "" } },
    { returnDocument: "after" }
  );
  if (!account) return { activated: false, message: INVALID_LINK_MESSAGE };
  const loginPath = record.accountType === "parent"
    ? "/parent/login"
    : account.role === "teacher" ? "/academy/login" : "/student/login";
  return { activated: true, loginPath };
}

module.exports = {
  activateAccount,
  resendVerification,
  sendVerificationForAccount,
};
