const assert = require("node:assert/strict");
const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "config.env"),
  quiet: true,
});

const {
  sendAdminUserEmail,
  sendPasswordResetCode,
  sendSupportInquiryNotification,
  verifyEmailConnection,
} = require("../services/emailService");
const {
  paybackCompletionEmailMessage,
} = require("../services/paybackAccountService");

async function run() {
  const recipient = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  assert.match(recipient, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);

  const connection = await verifyEmailConnection();
  assert.equal(connection.configured, true);
  assert.equal(connection.connected, true);

  const auditId = new Date().toISOString().replace(/[.:]/g, "-");
  const support = await sendSupportInquiryNotification({
    inquiryId: `SMTP-AUDIT-${auditId}`,
    user: {
      nickname: "SMTP감사계정",
      realName: "SMTP 감사",
      email: recipient,
      schoolName: "격리 감사 환경",
    },
    subject: `실제 문의 알림 수신 감사 ${auditId}`,
    content:
      "실제 문의 알림 템플릿과 운영자 라우팅을 검증하는 1회성 감사 메일입니다.",
  });
  const reset = await sendPasswordResetCode({
    to: recipient,
    code: "804215",
  });
  const payback = await sendAdminUserEmail({
    to: recipient,
    subject: `페이백 지급 완료 SMTP 감사 ${auditId}`,
    message: paybackCompletionEmailMessage({
      user: { realName: "SMTP 감사" },
      payoutRecord: {
        amount: 12345,
        paybackRate: 50,
        bankName: "감사은행",
        accountNumberLast4: "0815",
        completedAt: new Date(),
      },
    }),
    idempotencyKey: `live-payback-smtp-audit-${auditId}`,
  });

  for (const result of [support, reset, payback]) {
    assert.equal(result.delivered, true);
    assert.ok(result.providerMessageId);
  }
  console.log(
    `Live SMTP provider accepted support, password-reset, and payback audit messages. Subject suffix: ${auditId}`
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
