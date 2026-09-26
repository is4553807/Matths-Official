"use strict";

const {
  activateAccount,
  resendVerification,
  sendVerificationForAccount,
} = require("../services/emailVerificationService");
const { serviceUrl } = require("../services/serviceUrlService");

function renderVerification(res, { state, email = "", message, loginPath = null, status = 200 }) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res.status(status).render("email-verification", { state, email, message, loginPath, disablePageAnalytics: true });
}

async function sendRegistrationVerification({ accountType, accountId }) {
  let sent = false;
  try {
    const delivery = await sendVerificationForAccount(accountType, accountId);
    sent = delivery.sent;
  } catch (error) {
    console.error("[auth] 가입 인증 메일 발송 실패", { code: error.code || error.providerCode || "", message: error.message });
  }
  return {
    sent,
    message: sent
      ? "가입 이메일로 계정 활성화 링크를 보냈습니다. 메일함에서 링크를 눌러주세요."
      : "계정은 생성됐지만 인증 메일 발송에 실패했습니다. 아래에서 다시 요청해주세요.",
  };
}

async function finishRegistration(req, res, { accountType, accountId, email }) {
  req.session.pendingEmailVerification = { email: String(email || "").trim().toLowerCase() };
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  const delivery = await sendRegistrationVerification({ accountType, accountId });
  return renderVerification(res, {
    state: delivery.sent ? "pending" : "send-error",
    email,
    status: delivery.sent ? 202 : 503,
    message: delivery.message,
  });
}

async function verificationPage(req, res, next) {
  try {
    if (!req.query.token) {
      const pendingEmail = String(req.session?.pendingEmailVerification?.email || "");
      return renderVerification(res, {
        state: pendingEmail ? "pending" : "request",
        email: pendingEmail,
        message: pendingEmail
          ? "이메일 인증이 필요합니다. 받은 메일의 계정 활성화 링크를 눌러주세요."
          : "가입 이메일을 확인할 수 없습니다. 가입한 계정으로 로그인한 뒤 다시 시도해주세요.",
      });
    }
    const result = await activateAccount(req.query.token);
    if (result.activated && req.session?.pendingEmailVerification) delete req.session.pendingEmailVerification;
    const pendingEmail = String(req.session?.pendingEmailVerification?.email || "");
    return renderVerification(res, result.activated
      ? {
          state: "activated",
          message: "이메일 인증이 완료되어 계정이 활성화되었습니다. 로그인해주세요.",
          loginPath: serviceUrl(result.loginPath.startsWith("/parent") ? "parents" : result.loginPath.startsWith("/academy") ? "academy" : "public", result.loginPath),
        }
      : { state: "invalid", email: pendingEmail, message: pendingEmail ? result.message : `${result.message} 가입한 계정으로 로그인한 뒤 재발송할 수 있습니다.`, status: 400 });
  } catch (error) {
    return next(error);
  }
}

async function resendPage(req, res, next) {
  const email = String(req.session?.pendingEmailVerification?.email || "");
  if (!email) {
    return renderVerification(res, {
      state: "request",
      status: 403,
      message: "가입 이메일을 확인할 수 없습니다. 가입한 계정으로 로그인한 뒤 다시 시도해주세요.",
    });
  }
  try {
    await resendVerification(email);
    return renderVerification(res, {
      state: "resent",
      email,
      message: "인증이 필요한 계정에는 활성화 링크가 발송됩니다. 방금 요청했다면 1분 뒤 다시 시도해주세요.",
    });
  } catch (error) {
    if (Number(error.status) === 400) {
      return renderVerification(res, { state: "request", email, message: error.message, status: 400 });
    }
    console.error("[auth] 인증 메일 재발송 실패", { code: error.code || error.providerCode || "", message: error.message });
    return renderVerification(res, {
      state: "send-error",
      email,
      message: "메일 발송을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
      status: 503,
    });
  }
}

async function resendApi(req, res, next) {
  res.set("Cache-Control", "no-store");
  try {
    await resendVerification(req.body.email);
    return res.json({ requested: true, message: "인증이 필요한 계정에는 활성화 링크가 발송됩니다. 방금 요청했다면 1분 뒤 다시 시도해주세요." });
  } catch (error) {
    if (Number(error.status) === 400) return res.status(400).json({ code: "INVALID_EMAIL", message: error.message });
    return next(error);
  }
}

module.exports = { finishRegistration, sendRegistrationVerification, verificationPage, resendPage, resendApi };
