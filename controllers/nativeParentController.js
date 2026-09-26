"use strict";
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { ParentAccount } = require("../models/parentModel");
const { authenticateWebAccount } = require("../services/webLoginService");
const { registerParentAccount } = require("../services/parentAccountService");
const { getParentFamily } = require("../services/parentFamilyService");
const inbox = require("../services/parentNotificationService");
const { acceptParentInvite } = require("../services/checkoutService");
const { inviteTokenFrom, validateChildConsent } = require("../services/portalRegistrationValidation");
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  credentialHash: { type: String, required: true },
  identityProvider: { type: String, enum: ["google", "kakao", "apple"], default: undefined },
  identityHash: { type: String, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
const Session = mongoose.models.NativeParentSession || mongoose.model("NativeParentSession", schema);
let indexes;
async function ensureSessionIndexes() {
  if (!indexes) indexes = Session.createIndexes().catch(error => { indexes = null; throw error; });
  await indexes;
}
const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const publicParent = parent => ({ id: String(parent._id), name: parent.username, email: parent.email });
const fail = (status, message) => Object.assign(new Error(message), { status });
const pending = parent => ({ code: "EMAIL_VERIFICATION_REQUIRED", emailVerificationRequired: true,
  email: parent.email, message: "인증 메일의 활성화 링크를 누른 뒤 로그인해 주세요." });

async function issueNativeParentSession(parentId, { expectedPasswordHash = null, identity = null } = {}) {
  const parent = await ParentAccount.findById(parentId).select("+passwordHash +socialAuth.googleId +socialAuth.kakaoId +socialAuth.appleId").lean();
  if (!parent || !parent.isActive || (parent.emailVerificationRequiredAt && !parent.emailVerifiedAt)) {
    throw fail(403, "학부모 계정의 인증 상태를 확인해 주세요.");
  }
  if ((expectedPasswordHash !== null && parent.passwordHash !== expectedPasswordHash) ||
      (identity && parent.socialAuth?.[`${identity.provider}Id`] !== identity.providerUserId)) {
    throw fail(401, "계정 인증 정보가 변경됐습니다. 다시 로그인해 주세요.");
  }
  await ensureSessionIndexes();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 12 * 3600000);
  await Session.create({ tokenHash: hash(token), parentId: parent._id, credentialHash: hash(parent.passwordHash), expiresAt,
    ...(identity ? { identityProvider: identity.provider, identityHash: hash(identity.providerUserId) } : {}) });
  return { token, expiresAt, parent: publicParent(parent) };
}
exports.issueNativeParentSession = issueNativeParentSession;

exports.login = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !String(req.body?.password || "")) throw fail(400, "이메일과 비밀번호를 모두 입력해 주세요.");
    if (!await ParentAccount.exists({ email })) throw fail(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
    const account = await authenticateWebAccount(req.body || {});
    if (account.kind !== "parent") throw fail(403, "학부모 계정으로 로그인해 주세요. 학생·선생님은 기존 로그인 화면을 이용해 주세요.");
    return res.json(await issueNativeParentSession(account.parent._id, { expectedPasswordHash: account.parent.passwordHash }));
  } catch (error) { return next(error); }
};
exports.register = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    // Never trust socialProfile or a parent/child identity supplied by the client.
    const body = req.body || {};
    const parent = await registerParentAccount({ displayName: body.displayName, email: body.email,
      password: body.password, passwordConfirm: body.passwordConfirm, termsAccepted: body.termsAccepted });
    let emailSent = false;
    try { emailSent = (await require("../services/emailVerificationService").sendVerificationForAccount("parent", parent._id)).sent === true; }
    catch { /* Account remains pending; public resend supports recovery. */ }
    return res.status(202).json({ ...pending(parent), emailSent,
      ...(!emailSent ? { message: "계정은 만들어졌지만 인증 메일을 보내지 못했습니다. 아래에서 다시 요청해 주세요." } : {}) });
  } catch (error) { return next(error); }
};
exports.registerAcademy = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const body = req.body || {};
    const { teacher } = await require("../services/academyAccountService").registerAcademyAccount({
      displayName: body.displayName, email: body.email, password: body.password, passwordConfirm: body.passwordConfirm,
      termsAccepted: body.termsAccepted, academyName: body.academyName, branchName: body.branchName,
      address: body.address, contactPhone: body.contactPhone, authorityConfirmed: body.authorityConfirmed,
      registrationFlow: body.registrationFlow,
      inviteToken: body.registrationFlow === "staff" ? inviteTokenFrom(body.inviteToken, "/academy/staff-invite/") : undefined,
    });
    let emailSent = false;
    try { emailSent = (await require("../services/emailVerificationService").sendVerificationForAccount("user", teacher._id)).sent === true; }
    catch { /* Keep pending and offer resend. */ }
    return res.status(202).json({ ...pending(teacher), emailSent,
      ...(!emailSent ? { message: "가입 신청은 저장됐지만 인증 메일을 보내지 못했습니다. 아래에서 다시 요청해 주세요." } : {}) });
  } catch (error) { return next(error); }
};
exports.requireParent = async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw fail(401, "다시 로그인해 주세요.");
    const session = await Session.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } }).lean();
    if (!session) throw fail(401, "로그인 시간이 지났습니다. 다시 로그인해 주세요.");
    const parent = await ParentAccount.findById(session.parentId).select("+passwordHash +socialAuth.googleId +socialAuth.kakaoId +socialAuth.appleId").lean();
    if (!parent || !parent.isActive || hash(parent.passwordHash) !== session.credentialHash ||
        (session.identityProvider && hash(parent.socialAuth?.[`${session.identityProvider}Id`] || "") !== session.identityHash) ||
        (parent.emailVerificationRequiredAt && !parent.emailVerifiedAt)) throw fail(401, "학부모 계정으로 다시 로그인해 주세요.");
    req.nativeParent = parent; req.nativeParentSessionId = session._id;
    return next();
  } catch (error) { return next(error); }
};
exports.dashboard = async (req, res, next) => {
  try {
    let children = [];
    try {
      const family = await getParentFamily({ parentId: req.nativeParent._id });
      children = family.children.map(item => ({ id: item.childId, name: item.child.realName || item.child.name,
        schoolName: item.child.school?.name || item.child.university?.name || "" }));
    } catch (error) { if (error.code !== "PARENT_CHILD_LINK_REQUIRED") throw error; }
    return res.json({ parent: publicParent(req.nativeParent), children });
  } catch (error) { return next(error); }
};
exports.mailbox = async (req, res, next) => {
  try {
    const data = await inbox.getParentNotificationInbox({ parentId: req.nativeParent._id, page: req.query.page });
    return res.json({ stats: data.stats, pagination: data.pagination,
      notifications: data.notifications.map(item => ({ id: item.id, title: item.title,
        message: item.message, readAt: item.readAt || null, createdAt: item.createdAt })) });
  } catch (error) { return next(error); }
};
exports.read = async (req, res, next) => {
  try { await inbox.getParentNotificationDetail({ parentId: req.nativeParent._id, notificationId: req.params.id }); return res.json({ ok: true }); }
  catch (error) { return next(error); }
};
exports.notification = async (req, res, next) => {
  try {
    const item = await inbox.getParentNotificationDetail({ parentId: req.nativeParent._id, notificationId: req.params.id, readOnly: true });
    return res.json({ id: item.id, title: item.title, message: item.message, readAt: item.readAt || null, createdAt: item.createdAt });
  } catch (error) { return next(error); }
};
exports.readAll = async (req, res, next) => {
  try { await inbox.markAllParentNotificationsRead(req.nativeParent._id); return res.json({ ok: true }); }
  catch (error) { return next(error); }
};
exports.link = async (req, res, next) => {
  try {
    const rawToken = inviteTokenFrom(req.body.inviteToken, "/parent/invite/");
    await acceptParentInvite({ rawToken, parentAccountId: req.nativeParent._id, ...validateChildConsent(req.body) });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
};
exports.logout = async (req, res, next) => {
  try { await Session.deleteOne({ _id: req.nativeParentSessionId }); return res.json({ ok: true }); }
  catch (error) { return next(error); }
};
