"use strict";

const {
  authenticateAcademyAccount,
  registerAcademyAccount,
} = require("../services/academyAccountService");
const { serviceUrl } = require("../services/serviceUrlService");

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
  return {
    accountType: "academy",
    error: null,
    success: req.query.registered === "1"
      ? "학원 계정 신청이 접수되었습니다. 로그인 후 승인 상태를 확인할 수 있습니다."
      : null,
    loginNotice: null,
    oldInput: { email: "" },
    next: safeAcademyNext(req.query.next),
    socialAuthProviders: [],
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

exports.loginPage = (req, res) => res.render("login", loginLocals(req));

exports.login = async (req, res, next) => {
  try {
    const result = await authenticateAcademyAccount({
      email: req.body.email,
      password: req.body.password,
    });
    const destination = safeAcademyNext(req.body.next || req.session?.returnTo);
    await establishAcademySession(req, result.teacher);
    return res.redirect(serviceUrl("academy", destination));
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
    oldInput: { displayName: "", academyName: "", email: "" },
    ...overrides,
  };
}

exports.registerPage = (_req, res) => (
  res.render("portal-register", registrationLocals())
);

exports.register = async (req, res, next) => {
  try {
    const result = await registerAcademyAccount({
      displayName: req.body.displayName,
      academyName: req.body.academyName,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
      termsAccepted: ["1", "true", "on"].includes(String(req.body.termsAccepted || "")),
    });
    await establishAcademySession(req, result.teacher);
    return res.redirect(serviceUrl("academy", "/academy/setup?registered=1"));
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      return res.status(Number(error.status)).render("portal-register", registrationLocals({
        error: error.message,
        oldInput: {
          displayName: String(req.body.displayName || ""),
          academyName: String(req.body.academyName || ""),
          email: String(req.body.email || ""),
        },
      }));
    }
    return next(error);
  }
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
