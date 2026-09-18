"use strict";

const {
  registerAcademyAccount,
} = require("../services/academyAccountService");
const { serviceUrl } = require("../services/serviceUrlService");
const auth = require("../middleware/authMiddleware");
const { AcademyAccount } = require("../models/academyModel");
const { accepted, statusError } = require("../services/portalRegistrationValidation");
const { getAcademyStaffInvite, createAcademyStaffInvite, acceptAcademyStaffInvite, revokeAcademyStaffInvite } = require("../services/academyStaffInviteService");
const { getPendingSocialRegistration, clearPendingSocialRegistration, publicProviderStatus } = require("../services/socialAuthService");
const { pendingForPortal, registrationUrl } = require("../services/portalSocialAuthService");
const { accountEmailLinkMismatch } = require("../services/accountLinkAccessService");

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function safeAcademyNext(value) {
  const next = String(value || "");
  return next === "/academy" || next.startsWith("/academy/")
    ? next
    : "/academy";
}

function loginLocals(req, overrides = {}) {
  const socialError = req.session?.socialOAuthError;
  if (req.session) delete req.session.socialOAuthError;
  return {
    accountType: "academy",
    disablePageAnalytics: /^\/academy\/staff-invite\//.test(String(req.query.next || req.body?.next || "")),
    error: socialError || null,
    success: req.query.reset === "1"
      ? "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."
      : req.query.registered === "1"
        ? "학원 계정 신청이 접수되었습니다. 로그인 후 승인 상태를 확인할 수 있습니다."
        : null,
    loginNotice: null,
    oldInput: { email: "" },
    next: safeAcademyNext(req.query.next),
    socialAuthProviders: require("../services/socialAuthService").publicProviderStatus(),
    ...overrides,
  };
}

async function establishAcademySession(req, teacher) {
  await regenerateSession(req);
  req.session.user = {
    id: String(teacher._id),
    name: teacher.name,
    realName: teacher.realName || "",
    email: teacher.email,
    role: "teacher",
    accountType: "academy",
    tokenVersion: Number(teacher.tokenVersion) || 0,
    loginAt: new Date(),
  };
  await saveSession(req);
}

exports.loginPage = (req, res) => { res.set("Referrer-Policy", "no-referrer"); return res.render("login", loginLocals(req)); };

exports.login = async (req, res, next) => {
  try {
    return res.redirect(await require("../services/webLoginService").loginWebAccount(req));
  } catch (error) {
    if ([400, 401, 403].includes(Number(error.status))) {
      return res.status(Number(error.status)).render("login", loginLocals(req, {
        error: error.message,
        oldInput: { email: String(req.body.email || "") },
        next: safeAcademyNext(req.body.next),
      }));
    }
    return next(error);
  }
};

function registrationLocals(overrides = {}) {
  return {
    accountType: "academy",
    error: null,
    oldInput: { displayName: "", academyName: "", branchName: "", address: "", contactPhone: "", email: "", registrationFlow: "new" },
    registrationInvite: null,
    socialAuthProviders: publicProviderStatus(),
    socialRegistration: null,
    ...overrides,
  };
}

exports.registerPage = async (req, res, next) => {
  try {
    const pending = getPendingSocialRegistration(req);
    if (pending && (pending.accountType !== "academy" || pending.inviteToken && req.query.invite !== pending.inviteToken)) return res.redirect(registrationUrl(pending));
    const invited = req.query.invite ? await getAcademyStaffInvite(req.query.invite) : null;
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    if (invited && await AcademyAccount.exists({ email: invited.invite.email })) return res.redirect(serviceUrl("academy", `/academy/login?next=${encodeURIComponent(`/academy/staff-invite/${invited.token}`)}`));
    return res.render("portal-register", registrationLocals({ socialRegistration: pendingForPortal(req, "academy"), ...(invited ? {
      registrationInvite: { token: invited.token, email: invited.invite.email, name: invited.academy.name, expiresAt: invited.invite.expiresAt },
      disablePageAnalytics: true,
      oldInput: { email: invited.invite.email, registrationFlow: "staff", inviteToken: invited.token },
    } : { oldInput: { registrationFlow: req.query.path === "staff" ? "staff" : "new" } }) }));
  } catch (error) { return next(error); }
};

exports.lookupRegistrationInvite = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const result = await getAcademyStaffInvite(req.query.token);
    return res.json({ token: result.token, email: result.invite.email, name: result.academy.name, expiresAt: result.invite.expiresAt });
  } catch (error) { return res.status(Number(error.status) || 500).json({ error: Number(error.status) ? error.message : "초대 확인에 실패했습니다. 다시 시도해주세요." }); }
};

exports.register = async (req, res, next) => {
  try {
    const result = await registerAcademyAccount({
      displayName: req.body.displayName,
      academyName: req.body.academyName,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
      termsAccepted: ["1", "true", "on"].includes(String(req.body.termsAccepted || "")),
      branchName: req.body.branchName,
      address: req.body.address,
      contactPhone: req.body.contactPhone,
      authorityConfirmed: accepted(req.body.authorityConfirmed),
      registrationFlow: String(req.body.registrationFlow || "new"),
      inviteToken: req.body.inviteToken || req.body.inviteLink,
      socialProfile: pendingForPortal(req, "academy"),
    });
    clearPendingSocialRegistration(req);
    if (!result.teacher.emailVerifiedAt && result.teacher.emailVerificationRequiredAt) {
      return require("./emailVerificationController").finishPasswordRegistration(res, {
        accountType: "user", accountId: result.teacher._id, email: result.teacher.email,
      });
    }
    await establishAcademySession(req, result.teacher);
    return res.redirect(serviceUrl("academy", "/academy/setup?registered=1"));
  } catch (error) {
    if ([400, 403, 404, 409, 410].includes(Number(error.status))) {
      return res.status(Number(error.status)).render("portal-register", registrationLocals({
        error: error.message,
        disablePageAnalytics: req.body.registrationFlow === "staff",
        socialRegistration: pendingForPortal(req, "academy"),
        oldInput: {
          displayName: String(req.body.displayName || ""),
          academyName: String(req.body.academyName || ""),
          email: String(req.body.email || ""),
          branchName: String(req.body.branchName || ""),
          address: String(req.body.address || ""),
          contactPhone: String(req.body.contactPhone || ""),
          registrationFlow: req.body.registrationFlow === "staff" ? "staff" : "new",
          inviteToken: String(req.body.inviteToken || ""),
          termsAccepted: accepted(req.body.termsAccepted),
          authorityConfirmed: accepted(req.body.authorityConfirmed),
        },
      }));
    }
    return next(error);
  }
};

exports.staffInvitePage = async (req, res, next) => {
  try {
    const result = await getAcademyStaffInvite(req.params.token);
    const mismatch = accountEmailLinkMismatch(req.session, result.invite.email, "academy");
    if (mismatch) throw mismatch;
    if (!req.session?.user && !req.session?.parent) {
      if (await AcademyAccount.exists({ email: result.invite.email })) return res.redirect(serviceUrl("academy", `/academy/login?next=${encodeURIComponent(`/academy/staff-invite/${result.token}`)}`));
      return res.redirect(`/academy/register?invite=${encodeURIComponent(result.token)}`);
    }
    if (!req.session?.user) return auth.isLoggedOut(req, res, next);
    return auth.isLoggedIn(req, res, (error) => {
      if (error) return next(error);
      if (req.authenticatedUser?.role !== "teacher" || req.session.user.accountType !== "academy") return next(accountEmailLinkMismatch(req.session, result.invite.email, "academy") || statusError(403, "교사 초대는 초대받은 학원 계정으로 이용해주세요."));
      const currentMismatch = accountEmailLinkMismatch(req.session, result.invite.email, "academy");
      if (currentMismatch) return next(currentMismatch);
      res.set("Cache-Control", "no-store");
      res.set("Referrer-Policy", "no-referrer");
      return res.render("academy-staff-invite", { invitation: result, disablePageAnalytics: true, error: null });
    });
  } catch (error) { return next(error); }
};

exports.acceptStaffInvite = async (req, res, next) => {
  try {
    if (!accepted(req.body.inviteConsent)) throw statusError(400, "초대 학원과 교사 권한을 확인하고 참여 요청에 동의해주세요.");
    await acceptAcademyStaffInvite({ value: req.params.token, teacherUserId: req.session.user.id, email: req.authenticatedUser.email });
    return res.redirect("/academy/setup");
  } catch (error) {
    if ([400, 403, 409].includes(Number(error.status))) {
      try { return res.status(error.status).render("academy-staff-invite", { invitation: await getAcademyStaffInvite(req.params.token), disablePageAnalytics: true, error: error.message }); } catch (lookupError) { return next(lookupError); }
    }
    return next(error);
  }
};

exports.createStaffInvite = async (req, res, next) => {
  try {
    const result = await createAcademyStaffInvite({ teacherUserId: req.session.user.id, email: req.body.email });
    req.session.createdStaffInvite = { id: String(result.invite._id), email: result.invite.email, path: `/academy/staff-invite/${result.token}` };
    await saveSession(req);
    return res.redirect("/academy?tab=teachers");
  } catch (error) { return next(error); }
};

exports.revokeStaffInvite = async (req, res, next) => {
  try {
    await revokeAcademyStaffInvite({ teacherUserId: req.session.user.id, inviteId: req.params.inviteId });
    delete req.session.createdStaffInvite;
    await saveSession(req);
    return res.redirect("/academy?tab=teachers");
  } catch (error) { return next(error); }
};

exports.logout = (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("connect.sid", {
      path: "/",
      ...(process.env.SESSION_COOKIE_DOMAIN
        ? { domain: process.env.SESSION_COOKIE_DOMAIN }
        : {}),
    });
    return res.redirect(serviceUrl("academy", "/academy/login"));
  });
};
