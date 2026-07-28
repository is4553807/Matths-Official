const DEFAULT_FROM =
  "Matths <admin@lsbproduction.com>";
const DEFAULT_ADMIN_EMAIL =
  "admin@lsbproduction.com";
const DEFAULT_API_URL =
  "https://api.resend.com/emails";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendEmail({
  to,
  subject,
  text,
  html,
}) {
  const apiKey =
    process.env.EMAIL_API_KEY;
  const isProduction =
    process.env.NODE_ENV ===
    "production";

  if (!apiKey) {
    if (isProduction) {
      const error = new Error(
        "이메일 발송 설정이 완료되지 않았습니다."
      );
      error.status = 503;
      throw error;
    }

    return {
      delivered: false,
      preview: true,
    };
  }

  const response = await fetch(
    process.env.EMAIL_API_URL ||
      DEFAULT_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.EMAIL_FROM ||
          DEFAULT_FROM,
        to: [to],
        subject,
        text,
        html,
      }),
    }
  );

  let providerResult = {};

  try {
    providerResult =
      await response.json();
  } catch (error) {
    providerResult = {};
  }

  if (!response.ok) {
    const error = new Error(
      "이메일을 발송하지 못했습니다."
    );
    error.status = 502;
    throw error;
  }

  return {
    delivered: true,
    preview: false,
    providerMessageId:
      String(
        providerResult.id || ""
      ),
  };
}

async function sendPasswordResetCode({
  to,
  code,
}) {
  const safeCode =
    escapeHtml(code);

  return sendEmail({
    to,
    subject:
      "[Matths] 비밀번호 재설정 인증코드",
    text: [
      "Matths 비밀번호 재설정 인증코드입니다.",
      "",
      String(code),
      "",
      "인증코드는 10분 동안 유효합니다.",
      "본인이 요청하지 않았다면 이 이메일을 무시해주세요.",
    ].join("\n"),
    html: `
      <div style="max-width:520px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#111426">
        <p style="color:#3157f6;font-weight:800">MATTHS</p>
        <h1 style="font-size:24px">비밀번호 재설정 인증코드</h1>
        <p>아래 6자리 코드를 비밀번호 재설정 화면에 입력해주세요.</p>
        <div style="margin:24px 0;padding:20px;text-align:center;font-size:34px;font-weight:900;letter-spacing:10px;background:#f1f4ff;border-radius:16px">${safeCode}</div>
        <p style="color:#687086">인증코드는 10분 동안 유효합니다. 본인이 요청하지 않았다면 이 이메일을 무시해주세요.</p>
      </div>
    `,
  });
}

async function sendSupportInquiryNotification({
  inquiryId,
  user,
  subject,
  content,
}) {
  const adminEmail =
    String(
      process.env.ADMIN_EMAIL ||
        DEFAULT_ADMIN_EMAIL
    )
      .trim()
      .toLowerCase();
  const cleanSubject =
    String(subject || "")
      .replace(/[\r\n]+/g, " ")
      .trim();
  const safeSubject =
    escapeHtml(cleanSubject);
  const safeContent =
    escapeHtml(content).replace(
      /\r?\n/g,
      "<br />"
    );
  const safeNickname =
    escapeHtml(
      user.nickname || "학생"
    );
  const safeRealName =
    escapeHtml(user.realName || "");
  const safeEmail =
    escapeHtml(user.email || "");
  const safeSchool =
    escapeHtml(
      user.schoolName || "학교 미설정"
    );
  const safeInquiryId =
    escapeHtml(inquiryId);

  return sendEmail({
    to: adminEmail,
    subject:
      `[Matths 문의] ${cleanSubject}`,
    text: [
      "Matths 사용자 문의가 접수되었습니다.",
      "",
      `문의 번호: ${inquiryId}`,
      `닉네임: ${user.nickname}`,
      `실명: ${user.realName || "미입력"}`,
      `가입 이메일: ${user.email}`,
      `학교: ${user.schoolName || "미설정"}`,
      "",
      `제목: ${cleanSubject}`,
      "",
      String(content || ""),
      "",
      "관리자 페이지에서 확인 후 가입 이메일로 답변해주세요.",
    ].join("\n"),
    html: `
      <div style="max-width:620px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#111426">
        <p style="color:#3157f6;font-weight:800;letter-spacing:1px">MATTHS SUPPORT</p>
        <h1 style="margin:8px 0 24px;font-size:24px">새 사용자 문의가 접수되었습니다.</h1>
        <div style="padding:18px;background:#f5f7fc;border-radius:14px;line-height:1.8">
          <b>문의 번호</b> ${safeInquiryId}<br />
          <b>닉네임</b> ${safeNickname}<br />
          <b>실명</b> ${safeRealName || "미입력"}<br />
          <b>가입 이메일</b> ${safeEmail}<br />
          <b>학교</b> ${safeSchool}
        </div>
        <h2 style="margin:28px 0 12px;font-size:18px">${safeSubject}</h2>
        <div style="padding:20px;border:1px solid #e1e5ef;border-radius:14px;line-height:1.8">${safeContent}</div>
        <p style="margin-top:24px;color:#687086">관리자 페이지에서 확인 후 가입 이메일로 답변해주세요.</p>
      </div>
    `,
  });
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_FROM,
  sendEmail,
  sendPasswordResetCode,
  sendSupportInquiryNotification,
};
