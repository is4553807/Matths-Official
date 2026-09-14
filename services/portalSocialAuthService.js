"use strict";

const crypto = require("node:crypto");
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { getPendingSocialRegistration, socialIdPath } = require("./socialAuthService");
const { activeUser } = require("./webLoginService");

function conflict(message = "소셜 계정 연결 정보가 다른 계정과 충돌합니다.") {
  return Object.assign(new Error(message), { status: 409, code: "SOCIAL_AUTH_ACCOUNT_CONFLICT" });
}
function pendingForPortal(req, accountType) {
  const pending = getPendingSocialRegistration(req);
  return pending?.accountType === accountType && pending.mobile !== true && ["google", "kakao"].includes(pending.provider) ? pending : null;
}
function registrationUrl(pending) {
  const type = ["academy", "parent"].includes(pending?.accountType) ? pending.accountType : "student";
  const params = new URLSearchParams();
  if (pending?.inviteToken) params.set("invite", pending.inviteToken);
  if (type === "academy" && pending?.registrationFlow === "staff") params.set("path", "staff");
  return `/${type}/register${params.size ? "?" + params : ""}`;
}
function socialCredentials(values, social) {
  if (!social) return values;
  // Only a server-side, verified pending profile may bypass password entry.
  const password = "Social1!" + crypto.randomBytes(32).toString("base64url");
  return { ...values, email: social.email, password, passwordConfirm: password };
}

async function resolveWebSocialAccount(profile) {
  if (!profile.emailVerified || !profile.providerUserId || !["google", "kakao"].includes(profile.provider)) throw conflict("검증된 소셜 계정을 확인해주세요.");
  const key = socialIdPath(profile.provider);
  const select = "+socialAuth.googleId +socialAuth.kakaoId";
  const [providerUser, emailUser, providerParent, emailParent] = await Promise.all([
    User.findOne({ [key]: profile.providerUserId }).select(select),
    User.findOne({ email: profile.email }).select(select),
    ParentAccount.findOne({ [key]: profile.providerUserId }).select(select),
    ParentAccount.findOne({ email: profile.email }).select(select),
  ]);
  if ((providerUser && emailUser && String(providerUser._id) !== String(emailUser._id)) || (providerParent && emailParent && String(providerParent._id) !== String(emailParent._id))) throw conflict();
  const user = providerUser || emailUser;
  const parent = providerParent || emailParent;
  if (user && parent) throw conflict();
  const candidate = user || parent;
  if (!candidate) return null;
  const linked = String(candidate.get(key) || "");
  if (linked && linked !== profile.providerUserId) throw conflict("이미 다른 소셜 계정이 연결된 이메일입니다.");
  if (user) await activeUser(user._id);
  else if (parent.isActive === false) throw Object.assign(new Error("이용이 중지된 학부모 계정입니다."), { status: 403, code: "SOCIAL_AUTH_ACCOUNT_BLOCKED" });
  const model = user ? User : ParentAccount;
  const updated = await model.findOneAndUpdate({ _id: candidate._id, $or: [{ [key]: { $exists: false } }, { [key]: null }, { [key]: profile.providerUserId }] }, { $set: { [key]: profile.providerUserId, emailVerifiedAt: candidate.emailVerifiedAt || new Date() } }, { returnDocument: "after" });
  if (!updated) throw conflict();
  return user ? { kind: "user", user: updated } : { kind: "parent", parent: updated };
}

module.exports = { pendingForPortal, registrationUrl, resolveWebSocialAccount, socialCredentials };
