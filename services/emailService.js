const nodemailer = require("nodemailer");
const { SSL_OP_LEGACY_SERVER_CONNECT } = require("node:constants");
const {
  passwordResetCode,
  passwordResetLink,
} = require("../content/email/auth");
const {
  inquiryReceived,
  inquiryReply,
} = require("../content/email/support");

const DEFAULT_FROM_NAME = "Matths";
const DEFAULT_ADMIN_EMAIL = "admin@lsbproduction.com";

const transporterCache = new Map();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function buildBrandedHtml({
  heading,
  body = "",
  bodyHtml = "",
  kicker = "MATTHS",
  highlight = "",
  actionLabel = "",
  actionUrl = "",
  footer = "",
}) {
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : "";
  return `
    <div style="max-width:620px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#111426">
      <p style="color:#3157f6;font-weight:800;letter-spacing:1px">${escapeHtml(kicker)}</p>
      <h1 style="margin:8px 0 24px;font-size:24px">${escapeHtml(heading)}</h1>
      ${bodyHtml ? `<div style="line-height:1.8">${bodyHtml}</div>` : body ? `<div style="line-height:1.8">${textToHtml(body)}</div>` : ""}
      ${highlight ? `<div style="margin:24px 0;padding:20px;text-align:center;font-size:34px;font-weight:900;letter-spacing:10px;background:#f1f4ff;border-radius:16px">${escapeHtml(highlight)}</div>` : ""}
      ${safeActionUrl ? `<p style="margin:28px 0"><a href="${safeActionUrl}" style="display:inline-block;padding:15px 22px;color:#fff;background:#3157f6;border-radius:12px;text-decoration:none;font-weight:800">${escapeHtml(actionLabel || "확인하기")}</a></p>` : ""}
      ${footer ? `<p style="margin-top:24px;color:#687086">${textToHtml(footer)}</p>` : ""}
      ${safeActionUrl ? `<p style="word-break:break-all;color:#8b91a4;font-size:12px">${safeActionUrl}</p>` : ""}
    </div>
  `;
}

function normalizeAdminEmailSubject(value) {
  const cleanSubject = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  const unbrandedSubject =
    cleanSubject.replace(/^(?:\s*\[Matths\]\s*)+/i, "").trim() ||
    "운영 안내";

  return {
    display: unbrandedSubject,
    email: `[Matths] ${unbrandedSubject}`,
  };
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parsePort(value, fallback) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function normalizeTlsMinVersion(value, fallback = "") {
  const normalized = String(value || fallback || "").trim();
  return ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"].includes(normalized)
    ? normalized
    : "";
}

function normalizeSmtpAccount(raw = {}, fallback = {}) {
  const host = String(raw.host || fallback.host || "").trim();
  const secure = parseBoolean(raw.secure, parseBoolean(fallback.secure, false));
  const user = normalizeEmail(raw.user || fallback.user);
  const password = String(raw.password || raw.pass || fallback.password || "").trim();
  const port = parsePort(raw.port || fallback.port, secure ? 465 : 587);
  const fromAddress = normalizeEmail(raw.fromAddress || fallback.fromAddress || user);
  const fromName = String(raw.fromName || fallback.fromName || DEFAULT_FROM_NAME).trim();
  const tlsMinVersion = normalizeTlsMinVersion(
    raw.tlsMinVersion,
    fallback.tlsMinVersion
  );
  const tlsCiphers = String(raw.tlsCiphers || fallback.tlsCiphers || "").trim();
  const tlsAllowLegacyServerConnect = parseBoolean(
    raw.tlsAllowLegacyServerConnect,
    parseBoolean(fallback.tlsAllowLegacyServerConnect, false)
  );
  const tlsRejectUnauthorized = parseBoolean(
    raw.tlsRejectUnauthorized,
    parseBoolean(fallback.tlsRejectUnauthorized, true)
  );
  return {
    host,
    port,
    secure,
    user,
    password,
    fromAddress,
    fromName,
    tlsMinVersion,
    tlsCiphers,
    tlsAllowLegacyServerConnect,
    tlsRejectUnauthorized,
  };
}

function getDefaultSmtpAccount() {
  return getSupportSmtpAccount();
}

function createEmailSetupError(message = "이메일 발송 설정이 완료되지 않았습니다.") {
  const error = new Error(message);
  error.status = 503;
  error.code = "EMAIL_SMTP_NOT_CONFIGURED";
  return error;
}

function validateSmtpAccount(account, requestedFrom = "") {
  if (!account.host || !account.user || !account.password || !account.fromAddress) {
    throw createEmailSetupError(
      "이메일 발송 설정이 완료되지 않았습니다. SUPPORT_SMTP_HOST, SUPPORT_SMTP_USER, Gmail 앱 비밀번호를 확인해주세요."
    );
  }
  if (requestedFrom && account.fromAddress !== normalizeEmail(requestedFrom)) {
    throw createEmailSetupError(
      `${normalizeEmail(requestedFrom)} 운영자 메일의 SMTP 계정이 등록되지 않았습니다.`
    );
  }
  return account;
}

function getSupportSmtpAccount() {
  const account = normalizeSmtpAccount({
    host: process.env.SUPPORT_SMTP_HOST || "smtp.gmail.com",
    port: process.env.SUPPORT_SMTP_PORT || 465,
    secure:
      process.env.SUPPORT_SMTP_SECURE === undefined
        ? true
        : process.env.SUPPORT_SMTP_SECURE,
    user: process.env.SUPPORT_SMTP_USER,
    password: process.env.GMAIL_APP_PASSWORD,
    // SMTP 로그인 계정과 실제 From 주소를 항상 같게 유지한다.
    fromAddress: process.env.SUPPORT_SMTP_USER,
    fromName: process.env.SUPPORT_EMAIL_FROM_NAME || DEFAULT_FROM_NAME,
  });
  return validateSmtpAccount(account, account.fromAddress);
}

function getSmtpAccount(fromAddress = "") {
  // 운영자가 누구인지의 기록은 AdminActionLog에 남기고, 실제 발신 SMTP는
  // lsbproduction00@gmail.com 한 계정으로 고정한다. 호출부가 과거 방식의
  // fromAddress를 넘겨도 운영자 개인 주소로 발송되지 않는다.
  void fromAddress;
  return getSupportSmtpAccount();
}

function transporterSignature(account) {
  return [
    account.host,
    account.port,
    account.secure,
    account.user,
    account.password,
    account.tlsMinVersion,
    account.tlsCiphers,
    account.tlsAllowLegacyServerConnect,
    account.tlsRejectUnauthorized,
  ].join(":");
}

function getSmtpTransporter(account) {
  const signature = transporterSignature(account);
  const cached = transporterCache.get(signature);
  if (cached) return cached;
  const tls = {
    rejectUnauthorized: account.tlsRejectUnauthorized,
  };
  if (account.tlsMinVersion) tls.minVersion = account.tlsMinVersion;
  if (account.tlsCiphers) tls.ciphers = account.tlsCiphers;
  if (account.tlsAllowLegacyServerConnect) {
    tls.secureOptions = SSL_OP_LEGACY_SERVER_CONNECT;
  }
  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    requireTLS: !account.secure,
    tls,
    auth: { user: account.user, pass: account.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  transporterCache.set(signature, transporter);
  return transporter;
}

function logEmailError(error) {
  console.error("[email] SMTP 발송 실패", {
    code: error?.code || "",
    command: error?.command || "",
    responseCode: error?.responseCode || "",
    message: error?.message || "알 수 없는 오류",
  });
}

async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  headers,
  fromAddress = "",
  fromName = "",
  smtpAccount = null,
}) {
  const recipient = normalizeEmail(to);
  if (!recipient) {
    const error = new Error("이메일 수신 주소가 없습니다.");
    error.status = 400;
    throw error;
  }
  const account = smtpAccount || getSmtpAccount(fromAddress);
  const senderAddress = normalizeEmail(account.fromAddress);

  try {
    const result = await getSmtpTransporter(account).sendMail({
      from: {
        name: String(fromName || account.fromName || DEFAULT_FROM_NAME).trim(),
        address: senderAddress,
      },
      sender: account.user !== senderAddress ? account.user : undefined,
      to: recipient,
      replyTo: replyTo ? normalizeEmail(replyTo) : senderAddress,
      subject,
      text,
      html,
      headers,
    });
    const accepted = Array.isArray(result.accepted) ? result.accepted : [];
    if (!accepted.length) {
      const rejectedError = new Error("이메일 공급자가 수신자를 승인하지 않았습니다.");
      rejectedError.code = "EMAIL_RECIPIENT_REJECTED";
      throw rejectedError;
    }
    return {
      delivered: true,
      providerMessageId: String(result.messageId || ""),
      fromAddress: senderAddress,
    };
  } catch (providerError) {
    logEmailError(providerError);
    const error = new Error("이메일을 발송하지 못했습니다. SMTP 계정 설정을 확인해주세요.");
    error.status = 502;
    error.providerCode = providerError?.code || "";
    throw error;
  }
}

function sendSupportMailboxEmail({ to, subject, text, html, replyTo, headers }) {
  const account = getSupportSmtpAccount();
  return sendEmail({
    to,
    subject,
    text,
    html,
    replyTo,
    headers,
    fromAddress: account.fromAddress,
    fromName: account.fromName,
    smtpAccount: account,
  });
}

async function verifyEmailConnection(fromAddress = "") {
  let account;
  try {
    account = getSmtpAccount(fromAddress);
  } catch (error) {
    return { configured: false, connected: false, code: error.code || "" };
  }
  try {
    await getSmtpTransporter(account).verify();
    return { configured: true, connected: true, fromAddress: account.fromAddress };
  } catch (error) {
    logEmailError(error);
    return {
      configured: true,
      connected: false,
      fromAddress: account.fromAddress,
      code: String(error?.code || ""),
    };
  }
}

async function verifySupportEmailConnection() {
  let account;
  try {
    account = getSupportSmtpAccount();
  } catch (error) {
    return { configured: false, connected: false, code: error.code || "" };
  }
  try {
    await getSmtpTransporter(account).verify();
    return { configured: true, connected: true, fromAddress: account.fromAddress };
  } catch (error) {
    logEmailError(error);
    return {
      configured: true,
      connected: false,
      fromAddress: account.fromAddress,
      code: String(error?.code || ""),
    };
  }
}

async function sendPasswordResetCode({ to, code }) {
  const template = passwordResetCode({ code });
  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: buildBrandedHtml({
      ...template,
      body: "아래 6자리 코드를 비밀번호 재설정 화면에 입력해주세요.",
    }),
  });
}

async function sendPasswordResetLink({ to, resetUrl, fromAddress = "" }) {
  const template = passwordResetLink({ resetUrl });
  return sendEmail({
    to,
    fromAddress,
    subject: template.subject,
    text: template.text,
    html: buildBrandedHtml(template),
  });
}

async function sendSupportInquiryNotification({ inquiryId, user, subject, content }) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  const template = inquiryReceived({ inquiryId, user, subject, content });
  return sendSupportMailboxEmail({
    to: adminEmail,
    replyTo: template.replyTo,
    subject: template.subject,
    text: template.text,
    html: buildBrandedHtml(template),
  });
}

async function sendSupportReply({ to, subject, message, fromAddress = "" }) {
  const template = inquiryReply({ subject, message });
  return sendEmail({
    to,
    fromAddress,
    subject: template.subject,
    text: template.text,
    html: buildBrandedHtml(template),
  });
}

async function sendAdminUserEmail({
  to,
  subject,
  message,
  idempotencyKey = "",
  actionLabel = "",
  actionUrl = "",
  bodyHtml = "",
  fromAddress = "",
}) {
  const normalizedSubject = normalizeAdminEmailSubject(subject);
  const cleanMessage = String(message || "").trim();
  return sendEmail({
    to,
    fromAddress,
    subject: normalizedSubject.email,
    text: cleanMessage,
    html: buildBrandedHtml({
      heading: normalizedSubject.display,
      body: cleanMessage,
      bodyHtml,
      actionLabel,
      actionUrl,
    }),
    headers: idempotencyKey
      ? { "X-Matths-Idempotency-Key": String(idempotencyKey) }
      : undefined,
  });
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_FROM: DEFAULT_FROM_NAME,
  DEFAULT_FROM_NAME,
  buildBrandedHtml,
  getDefaultSmtpAccount,
  getSupportSmtpAccount,
  getSmtpAccount,
  normalizeAdminEmailSubject,
  sendEmail,
  sendAdminUserEmail,
  sendPasswordResetCode,
  sendPasswordResetLink,
  sendSupportReply,
  sendSupportInquiryNotification,
  sendSupportMailboxEmail,
  verifyEmailConnection,
  verifySupportEmailConnection,
};
