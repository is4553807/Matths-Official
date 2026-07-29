const nodemailer = require("nodemailer");
const {
  passwordResetCode,
  passwordResetLink,
} = require("../content/email/auth");
const {
  inquiryReceived,
  inquiryReply,
} = require("../content/email/support");

const DEFAULT_FROM_NAME = "Matths";
const DEFAULT_ADMIN_EMAIL =
  "admin@lsbproduction.com";

let cachedTransporter = null;
let cachedTransportSignature = "";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function textToHtml(value) {
  return escapeHtml(value).replace(
    /\r?\n/g,
    "<br />"
  );
}

function buildBrandedHtml({
  heading,
  body = "",
  kicker = "MATTHS",
  highlight = "",
  actionLabel = "",
  actionUrl = "",
  footer = "",
}) {
  const safeActionUrl =
    actionUrl
      ? escapeHtml(actionUrl)
      : "";
  return `
    <div style="max-width:620px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#111426">
      <p style="color:#3157f6;font-weight:800;letter-spacing:1px">${escapeHtml(kicker)}</p>
      <h1 style="margin:8px 0 24px;font-size:24px">${escapeHtml(heading)}</h1>
      ${body ? `<div style="line-height:1.8">${textToHtml(body)}</div>` : ""}
      ${highlight ? `<div style="margin:24px 0;padding:20px;text-align:center;font-size:34px;font-weight:900;letter-spacing:10px;background:#f1f4ff;border-radius:16px">${escapeHtml(highlight)}</div>` : ""}
      ${safeActionUrl ? `<p style="margin:28px 0"><a href="${safeActionUrl}" style="display:inline-block;padding:15px 22px;color:#fff;background:#3157f6;border-radius:12px;text-decoration:none;font-weight:800">${escapeHtml(actionLabel || "확인하기")}</a></p>` : ""}
      ${footer ? `<p style="margin-top:24px;color:#687086">${textToHtml(footer)}</p>` : ""}
      ${safeActionUrl ? `<p style="word-break:break-all;color:#8b91a4;font-size:12px">${safeActionUrl}</p>` : ""}
    </div>
  `;
}

function normalizeAdminEmailSubject(
  value
) {
  const cleanSubject = String(
    value || ""
  )
    .replace(/[\r\n]+/g, " ")
    .trim();
  const unbrandedSubject =
    cleanSubject
      .replace(
        /^(?:\s*\[Matths\]\s*)+/i,
        ""
      )
      .trim() ||
    "운영 안내";

  return {
    display:
      unbrandedSubject,
    email:
      `[Matths] ${unbrandedSubject}`,
  };
}

function getGmailCredentials() {
  return {
    user: normalizeEmail(
      process.env.GMAIL_USER
    ),
    appPassword: String(
      process.env
        .GMAIL_APP_PASSWORD || ""
    ).replace(/\s+/g, ""),
  };
}

function createEmailSetupError() {
  const error = new Error(
    "이메일 발송 설정이 완료되지 않았습니다. GMAIL_USER와 GMAIL_APP_PASSWORD를 확인해주세요."
  );
  error.status = 503;
  return error;
}

function getGmailTransporter() {
  const { user, appPassword } =
    getGmailCredentials();

  if (!user || !appPassword) {
    throw createEmailSetupError();
  }

  const signature =
    `${user}:${appPassword}`;

  if (
    cachedTransporter &&
    cachedTransportSignature ===
      signature
  ) {
    return cachedTransporter;
  }

  cachedTransporter =
    nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user,
        pass: appPassword,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  cachedTransportSignature =
    signature;

  return cachedTransporter;
}

function logEmailError(error) {
  console.error(
    "[email] Gmail SMTP 발송 실패",
    {
      code: error?.code || "",
      command:
        error?.command || "",
      responseCode:
        error?.responseCode || "",
      message:
        error?.message ||
        "알 수 없는 오류",
    }
  );
}

async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
}) {
  const { user, appPassword } =
    getGmailCredentials();
  const isProduction =
    process.env.NODE_ENV ===
    "production";

  if (!user || !appPassword) {
    if (isProduction) {
      throw createEmailSetupError();
    }

    return {
      delivered: false,
      preview: true,
    };
  }

  try {
    const configuredFrom =
      normalizeEmail(
        process.env
          .EMAIL_FROM_ADDRESS ||
          user
      );
    const result =
      await getGmailTransporter()
        .sendMail({
          from: {
            name:
              String(
                process.env
                  .EMAIL_FROM_NAME ||
                  DEFAULT_FROM_NAME
              ).trim() ||
              DEFAULT_FROM_NAME,
            address:
              configuredFrom,
          },
          sender:
            configuredFrom !== user
              ? user
              : undefined,
          to: normalizeEmail(to),
          replyTo:
            replyTo
              ? normalizeEmail(
                  replyTo
                )
              : undefined,
          subject,
          text,
          html,
        });
    const accepted =
      Array.isArray(
        result.accepted
      )
        ? result.accepted
        : [];

    if (!accepted.length) {
      const rejectedError =
        new Error(
          "Gmail이 수신자를 승인하지 않았습니다."
        );
      rejectedError.code =
        "EMAIL_RECIPIENT_REJECTED";
      throw rejectedError;
    }

    return {
      delivered: true,
      preview: false,
      providerMessageId:
        String(
          result.messageId || ""
        ),
    };
  } catch (providerError) {
    logEmailError(providerError);

    const error = new Error(
      "이메일을 발송하지 못했습니다. Gmail 계정과 앱 비밀번호를 확인해주세요."
    );
    error.status = 502;
    error.providerCode =
      providerError?.code || "";
    throw error;
  }
}

async function verifyEmailConnection() {
  const { user, appPassword } =
    getGmailCredentials();

  if (!user || !appPassword) {
    return {
      configured: false,
      connected: false,
    };
  }

  try {
    await getGmailTransporter()
      .verify();

    return {
      configured: true,
      connected: true,
    };
  } catch (error) {
    logEmailError(error);

    return {
      configured: true,
      connected: false,
      code:
        String(error?.code || ""),
    };
  }
}

async function sendPasswordResetCode({
  to,
  code,
}) {
  const template =
    passwordResetCode({
      code,
    });
  return sendEmail({
    to,
    subject:
      template.subject,
    text:
      template.text,
    html:
      buildBrandedHtml({
        ...template,
        body:
          "아래 6자리 코드를 비밀번호 재설정 화면에 입력해주세요.",
      }),
  });
}

async function sendPasswordResetLink({
  to,
  resetUrl,
}) {
  const template =
    passwordResetLink({
      resetUrl,
    });
  return sendEmail({
    to,
    subject:
      template.subject,
    text:
      template.text,
    html:
      buildBrandedHtml(
        template
      ),
  });
}

async function sendSupportInquiryNotification({
  inquiryId,
  user,
  subject,
  content,
}) {
  const adminEmail =
    normalizeEmail(
      process.env.ADMIN_EMAIL ||
        DEFAULT_ADMIN_EMAIL
    );
  const template =
    inquiryReceived({
      inquiryId,
      user,
      subject,
      content,
    });
  return sendEmail({
    to: adminEmail,
    replyTo:
      template.replyTo,
    subject:
      template.subject,
    text:
      template.text,
    html:
      buildBrandedHtml(
        template
      ),
  });
}

async function sendSupportReply({
  to,
  subject,
  message,
}) {
  const template =
    inquiryReply({
      subject,
      message,
    });
  return sendEmail({
    to,
    subject:
      template.subject,
    text:
      template.text,
    html:
      buildBrandedHtml(
        template
      ),
  });
}

async function sendAdminUserEmail({
  to,
  subject,
  message,
}) {
  const normalizedSubject =
    normalizeAdminEmailSubject(
      subject
    );
  const cleanMessage = String(
    message || ""
  ).trim();

  return sendEmail({
    to,
    subject:
      normalizedSubject.email,
    text: cleanMessage,
    html:
      buildBrandedHtml({
        heading:
          normalizedSubject.display,
        body:
          cleanMessage,
      }),
  });
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_FROM:
    DEFAULT_FROM_NAME,
  DEFAULT_FROM_NAME,
  buildBrandedHtml,
  getGmailCredentials,
  normalizeAdminEmailSubject,
  sendEmail,
  sendAdminUserEmail,
  sendPasswordResetCode,
  sendPasswordResetLink,
  sendSupportReply,
  sendSupportInquiryNotification,
  verifyEmailConnection,
};
