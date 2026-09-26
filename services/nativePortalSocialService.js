"use strict";
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { registrationCipher } = require("./nativeSocialRegistrationService");
const { resolveWebSocialAccount } = require("./portalSocialAuthService");
const { registerParentAccount } = require("./parentAccountService");
const { registerAcademyAccount } = require("./academyAccountService");
const { issueMobileAuthGrant } = require("./mobileSocialAuthGrantService");
const { inviteTokenFrom } = require("./portalRegistrationValidation");
const Ticket = mongoose.models.NativePortalTicket || mongoose.model("NativePortalTicket", new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  codeChallenge: { type: String, required: true, match: /^[A-Za-z0-9_-]{43}$/ },
  accountType: { type: String, enum: ["academy", "parent"], required: true },
  ciphertext: { type: String, required: true }, iv: { type: String, required: true }, tag: { type: String, required: true },
  status: { type: String, enum: ["NEW", "EXCHANGING", "REGISTRATION", "CONSUMED"], default: "NEW" },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true }));
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const challenge = value => crypto.createHash("sha256").update(value).digest("base64url");
function failure(message = "인증 시간이 지났습니다. 소셜 로그인부터 다시 진행해 주세요.", code = "PORTAL_AUTH_EXPIRED", status = 400) {
  return Object.assign(new Error(message), { status, code });
}
let indexes;
async function issuePortalProof(profile, context) {
  if (!profile?.emailVerified || !profile.providerUserId || !["apple", "google", "kakao"].includes(profile.provider) ||
      !["parent", "academy"].includes(context.accountType) || !/^[A-Za-z0-9_-]{43}$/.test(context.codeChallenge || "")) throw failure();
  if (!indexes) indexes = Ticket.createIndexes().catch(error => { indexes = null; throw error; });
  await indexes;
  const id = new mongoose.Types.ObjectId(), token = crypto.randomBytes(32).toString("base64url");
  const sealed = registrationCipher.seal(id, "portal", profile);
  await Ticket.create({ _id: id, tokenHash: hash(token), codeChallenge: context.codeChallenge,
    accountType: context.accountType, ...sealed, expiresAt: new Date(Date.now() + 15 * 60000) });
  return token;
}
async function ownedTicket(token, verifier) {
  if (typeof token !== "string" || typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw failure();
  const ticket = await Ticket.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } }).lean();
  if (!ticket || !crypto.timingSafeEqual(Buffer.from(ticket.codeChallenge), Buffer.from(challenge(verifier)))) throw failure();
  return ticket;
}
function verification(email) {
  return { status: "email_verification_required", verification: { email, message: "가입 이메일의 활성화 링크를 누른 뒤 다시 로그인해 주세요." } };
}
async function exchangePortalProof(token, verifier) {
  const ticket = await ownedTicket(token, verifier);
  const profile = registrationCipher.open(ticket._id, "portal", ticket);
  if (ticket.status === "REGISTRATION") return { status: "registration_required", accountType: ticket.accountType, email: profile.email, displayName: profile.displayName || "" };
  const claimed = await Ticket.updateOne({ _id: ticket._id, status: "NEW" }, { $set: { status: "EXCHANGING" } });
  if (claimed.modifiedCount !== 1) throw failure();
  try {
    const account = await resolveWebSocialAccount(profile, { accountType: ticket.accountType });
    if (!account) {
      await Ticket.updateOne({ _id: ticket._id, status: "EXCHANGING" }, { $set: { status: "REGISTRATION" } });
      return { status: "registration_required", accountType: ticket.accountType, email: profile.email, displayName: profile.displayName || "" };
    }
    await Ticket.updateOne({ _id: ticket._id }, { $set: { status: "CONSUMED" } });
    if (account.kind === "parent") {
      const session = await require("../controllers/nativeParentController").issueNativeParentSession(account.parent._id, { identity: profile });
      return { status: "authenticated", accountType: "parent", session };
    }
    return { status: "authenticated", accountType: "academy", code: await issueMobileAuthGrant(account.user._id, { codeChallenge: ticket.codeChallenge }) };
  } catch (error) {
    await Ticket.updateOne({ _id: ticket._id, status: "EXCHANGING" }, { $set: { status: "CONSUMED" } });
    if (error.code === "EMAIL_VERIFICATION_REQUIRED") return verification(error.email || profile.email);
    throw error;
  }
}
async function completePortalRegistration(body) {
  const ticket = await ownedTicket(body.registrationToken, body.codeVerifier);
  if (ticket.status !== "REGISTRATION") throw failure();
  const profile = registrationCipher.open(ticket._id, "portal", ticket);
  const claimed = await Ticket.updateOne({ _id: ticket._id, status: "REGISTRATION" }, { $set: { status: "CONSUMED" } });
  if (claimed.modifiedCount !== 1) throw failure();
  let account;
  try {
    const values = { displayName: body.displayName, termsAccepted: body.termsAccepted, socialProfile: profile };
    if (ticket.accountType === "parent") account = await registerParentAccount(values);
    else {
      const result = await registerAcademyAccount({ ...values, academyName: body.academyName, branchName: body.branchName,
        address: body.address, contactPhone: body.contactPhone, authorityConfirmed: body.authorityConfirmed,
        registrationFlow: body.registrationFlow,
        inviteToken: body.registrationFlow === "staff" ? inviteTokenFrom(body.inviteToken, "/academy/staff-invite/") : undefined });
      account = result.teacher;
    }
  } catch (error) {
    // Canonical registration services clean up failed partial creation. Preserve the validated proof for form corrections.
    await Ticket.updateOne({ _id: ticket._id, status: "CONSUMED", expiresAt: { $gt: new Date() } }, { $set: { status: "REGISTRATION" } });
    throw error;
  }
  const result = verification(account.email);
  try { await require("./emailVerificationService").sendVerificationForAccount(ticket.accountType === "parent" ? "parent" : "user", account._id); }
  catch { result.verification.message = "가입 신청은 저장됐지만 인증 메일을 보내지 못했습니다. 아래에서 다시 요청해 주세요."; }
  return result;
}
module.exports = { issuePortalProof, exchangePortalProof, completePortalRegistration };
