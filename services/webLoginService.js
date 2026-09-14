"use strict";

const bcrypt = require("bcrypt");
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { AcademyAccount } = require("../models/academyModel");
const { authenticateAcademyAccount } = require("./academyAccountService");
const { synchronizeAccountAccess } = require("./accountAccessService");
const { synchronizeUserLifecycle, lifecycleSessionView } = require("./userLifecycleService");
const { serviceUrl } = require("./serviceUrlService");

function failure(status, message) { return Object.assign(new Error(message), { status }); }
function accountTypeForRole(role) { return role === "teacher" ? "academy" : role === "admin" ? "admin" : "student"; }
function safePath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  // Browser normalization must not turn a permitted-looking next into another role's path.
  if (/%(?:2f|5c|2e)/i.test(pathname) || pathname.split("/").some(part => part === "." || part === "..")) return null;
  if (/^\/(?:auth|student)(?:\/|$)/.test(pathname) || /\/(?:login|register|logout)(?:\/|$)/.test(pathname)) return null;
  return pathname;
}

function loginDestination(account, next) {
  const role = account.kind === "parent" ? "parent" : account.user?.role;
  const pathname = safePath(next);
  if (role === "parent") return serviceUrl("parents", pathname && /^\/parent(?:\/|$)/.test(pathname) ? next : "/parent");
  if (role === "admin") return serviceUrl("admin", pathname && /^\/(?:admin|archive\/admin)(?:\/|$)/.test(pathname) ? next : "/admin");
  if (role === "teacher") return serviceUrl("academy", pathname && /^\/academy(?:\/|$)/.test(pathname) && !/^\/academy\/join\//.test(pathname) ? next : "/academy");
  if (!pathname || (/^\/(?:admin|academy|parent|api)(?:\/|$)/.test(pathname) && !/^\/academy\/join\/[^/]+$/.test(pathname)) || ["/login", "/register", "/logout", "/forgot-password", "/reset-password"].includes(pathname)) return serviceUrl("app", "/main");
  const surface = /^\/academy\/join\//.test(pathname) ? "academy" : /^\/(?:community|contact)(?:\/|$)/.test(pathname) ? "public" : "app";
  return serviceUrl(surface, next);
}

async function activeUser(userId) {
  const access = await synchronizeAccountAccess(userId);
  if (!access?.allowed || !["student", "test", "teacher", "admin"].includes(access.user?.role)) throw failure(403, "계정 이용 상태를 확인해주세요.");
  if (access.user.role === "teacher") {
    const academy = await AcademyAccount.findOne({ teacherUserId: userId }).select("isActive").lean();
    if (!academy || academy.isActive === false) throw failure(403, "이용이 중지되었거나 확인이 필요한 학원 계정입니다.");
  }
  return access.user;
}

async function authenticateWebAccount({ email, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const secret = String(password || "");
  if (!cleanEmail || !secret) throw failure(400, "이메일과 비밀번호를 모두 입력해주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) throw failure(400, "올바른 이메일 주소를 입력해주세요.");
  if (Buffer.byteLength(secret, "utf8") > 72) throw failure(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  const [user, parent, academy] = await Promise.all([
    User.findOne({ email: cleanEmail }).select("+passwordHash").lean(),
    ParentAccount.findOne({ email: cleanEmail }).select("+passwordHash").lean(),
    AcademyAccount.findOne({ email: cleanEmail }).select("teacherUserId").lean(),
  ]);
  // Never choose a role from the login URL or from ambiguous cross-store identities.
  if ((parent && (user || academy)) || (academy && user && (user.role !== "teacher" || String(academy.teacherUserId) !== String(user._id)))) throw failure(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  if (academy || user?.role === "teacher") {
    const result = await authenticateAcademyAccount({ email: cleanEmail, password: secret });
    return { kind: "user", user: result.teacher };
  }
  const credential = parent || user;
  if (!credential || !await bcrypt.compare(secret, credential.passwordHash || "")) throw failure(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  if (parent) {
    if (parent.isActive === false) throw failure(403, "이용이 중지된 학부모 계정입니다.");
    return { kind: "parent", parent };
  }
  return { kind: "user", user: await activeUser(user._id) };
}

async function establishWebSession(req, account) {
  let user, parent;
  const loginAt = new Date();
  if (account.kind === "parent") {
    parent = await ParentAccount.findOne({ _id: account.parent._id, isActive: true }).lean();
    if (!parent) throw failure(403, "이용이 중지된 학부모 계정입니다.");
    await ParentAccount.updateOne({ _id: parent._id, isActive: true }, { $set: { lastLoginAt: loginAt } });
  } else {
    user = await activeUser(account.user._id);
    if (["student", "test"].includes(user.role)) user = await synchronizeUserLifecycle(user._id);
    user = await activeUser(user._id);
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: loginAt } });
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  if (parent) {
    req.session.parent = { id: String(parent._id), username: parent.username, email: parent.email, childUserId: String(parent.childUserId || ""), selectedChildUserId: String(parent.childUserId || ""), accountType: "parent" };
  } else {
    req.session.user = { id: String(user._id), name: user.name, realName: user.realName || "", email: user.email, role: user.role, accountType: accountTypeForRole(user.role), tokenVersion: Number(user.tokenVersion) || 0, loginAt, schoolGrade: user.schoolGrade, educationStatus: user.educationStatus, preferences: user.preferences, school: user.school?.code ? user.school : null, university: user.university?.code ? user.university : null, ...lifecycleSessionView(user) };
  }
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  return parent ? { kind: "parent", parent } : { kind: "user", user };
}

async function loginWebAccount(req) {
  const next = req.body.next || req.session?.returnTo;
  const account = await establishWebSession(req, await authenticateWebAccount(req.body));
  return loginDestination(account, next);
}

module.exports = { accountTypeForRole, activeUser, authenticateWebAccount, establishWebSession, loginDestination, loginWebAccount, safePath };
