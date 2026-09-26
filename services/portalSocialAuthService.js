"use strict";

const crypto = require("node:crypto");
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const {
  getPendingSocialRegistration,
  socialIdPath,
} = require("./socialAuthService");
const { activeUser } = require("./webLoginService");
const AppleAuthCredential = require("../models/appleAuthCredentialModel");

function conflict(message = "소셜 계정 연결 정보가 다른 계정과 충돌합니다.") {
  return Object.assign(new Error(message), {
    status: 409,
    code: "SOCIAL_AUTH_ACCOUNT_CONFLICT",
  });
}
function pendingForPortal(req, accountType) {
  const pending = getPendingSocialRegistration(req);
  return pending?.accountType === accountType &&
    pending.mobile !== true &&
    ["google", "kakao", "apple"].includes(pending.provider)
    ? pending
    : null;
}
function registrationUrl(pending) {
  const type = ["academy", "parent"].includes(pending?.accountType)
    ? pending.accountType
    : "student";
  const params = new URLSearchParams();
  if (pending?.inviteToken) params.set("invite", pending.inviteToken);
  if (type === "academy" && pending?.registrationFlow === "staff")
    params.set("path", "staff");
  return `/${type}/register${params.size ? "?" + params : ""}`;
}
function socialCredentials(values, social) {
  if (!social) return values;
  // Only a server-side, verified pending profile may bypass password entry.
  const password = "Social1!" + crypto.randomBytes(32).toString("base64url");
  return {
    ...values,
    email: social.email,
    password,
    passwordConfirm: password,
  };
}

async function resolveWebSocialAccount(profile, { accountType = null } = {}) {
  if (
    !profile.emailVerified ||
    !profile.providerUserId ||
    !["google", "kakao", "apple"].includes(profile.provider)
  )
    throw conflict("검증된 소셜 계정을 확인해주세요.");
  const key = socialIdPath(profile.provider);
  const select = "+socialAuth.googleId +socialAuth.kakaoId +socialAuth.appleId";
  const [providerUser, emailUser, providerParent, emailParent] =
    await Promise.all([
      User.findOne({ [key]: profile.providerUserId }).select(select),
      User.findOne({ email: profile.email }).select(select),
      ParentAccount.findOne({ [key]: profile.providerUserId }).select(select),
      ParentAccount.findOne({ email: profile.email }).select(select),
    ]);
  if (
    (providerUser &&
      emailUser &&
      String(providerUser._id) !== String(emailUser._id)) ||
    (providerParent &&
      emailParent &&
      String(providerParent._id) !== String(emailParent._id))
  )
    throw conflict();
  const appleCredential =
    profile.provider === "apple"
      ? await AppleAuthCredential.findOne({
          appleSubject: profile.providerUserId,
        })
      : null;
  const credentialUser =
    appleCredential && appleCredential.ownerModel !== "ParentAccount"
      ? await User.findById(appleCredential.userId).select(select)
      : null;
  const credentialParent =
    appleCredential?.ownerModel === "ParentAccount"
      ? await ParentAccount.findById(appleCredential.userId).select(select)
      : null;
  if (appleCredential && !credentialUser && !credentialParent)
    throw conflict("Apple 계정 연결을 확인해주세요.");
  const user = providerUser || credentialUser || emailUser;
  const parent = providerParent || credentialParent || emailParent;
  if (
    (credentialUser &&
      emailUser &&
      String(credentialUser._id) !== String(emailUser._id)) ||
    (credentialParent &&
      emailParent &&
      String(credentialParent._id) !== String(emailParent._id))
  )
    throw conflict();
  if (user && parent) throw conflict();
  const candidate = user || parent;
  if (!candidate) return null;
  if ((accountType === "parent" && !parent) ||
      (accountType === "academy" && (!user || user.role !== "teacher"))) {
    throw conflict("선택한 계정 유형과 연결된 소셜 계정이 다릅니다. 기존 계정 유형으로 로그인해 주세요.");
  }
  if (candidate.emailVerificationRequiredAt && !candidate.emailVerifiedAt) {
    throw Object.assign(new Error("이메일 인증이 필요합니다. 받은 메일의 계정 활성화 링크를 눌러주세요."), {
      status: 403,
      code: "EMAIL_VERIFICATION_REQUIRED",
      email: candidate.email,
    });
  }
  const linked = String(candidate.get(key) || "");
  if (linked && linked !== profile.providerUserId)
    throw conflict("이미 다른 소셜 계정이 연결된 이메일입니다.");
  if (user) await activeUser(user._id);
  else if (parent.isActive === false)
    throw Object.assign(new Error("이용이 중지된 학부모 계정입니다."), {
      status: 403,
      code: "SOCIAL_AUTH_ACCOUNT_BLOCKED",
    });
  const model = user ? User : ParentAccount;
  await bindAppleAccount(
    profile,
    user ? { kind: "user", user } : { kind: "parent", parent },
  );
  const updated = await model.findOneAndUpdate(
    {
      _id: candidate._id,
      $or: [
        { [key]: { $exists: false } },
        { [key]: null },
        { [key]: profile.providerUserId },
      ],
    },
    {
      $set: {
        [key]: profile.providerUserId,
        emailVerifiedAt: candidate.emailVerifiedAt || new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw conflict();
  return user
    ? { kind: "user", user: updated }
    : { kind: "parent", parent: updated };
}

async function bindAppleAccount(profile, account) {
  if (profile?.provider !== "apple") return;
  const owner = account.kind === "parent" ? account.parent : account.user;
  const ownerModel = account.kind === "parent" ? "ParentAccount" : "User";
  const authorization = profile.appleAuthorization;
  const tokenFields = authorization
    ? {
        authorizationCode: authorization.authorizationCode,
        refreshToken: authorization.refreshToken,
        appleClientId: authorization.appleClientId,
        authorizationCodeIssuedAt: new Date(authorization.issuedAt),
        refreshTokenIssuedAt: new Date(authorization.issuedAt),
        revokedAt: null,
        lastRevokeError: null,
      }
    : {};
  try {
    // Never overwrite another owner, including an owner in the other store.
    await AppleAuthCredential.updateOne(
      {
        appleSubject: profile.providerUserId,
        userId: owner._id,
        ...(ownerModel === "User"
          ? { $or: [{ ownerModel }, { ownerModel: { $exists: false } }] }
          : { ownerModel }),
      },
      { $set: { ownerModel, ...tokenFields } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code === 11000) throw conflict();
    throw error;
  }
}

async function removeAppleAccountBinding(profile, accountId) {
  if (profile?.provider === "apple")
    await AppleAuthCredential.deleteOne({
      appleSubject: profile.providerUserId,
      userId: accountId,
    });
}

module.exports = {
  bindAppleAccount,
  removeAppleAccountBinding,
  pendingForPortal,
  registrationUrl,
  resolveWebSocialAccount,
  socialCredentials,
};
