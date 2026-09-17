const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");
const { PUBLIC_CONTACT_EMAIL } = require("../contactEmail");

process.env.ADMIN_EMAIL = "admin@lsbproduction.com";
process.env.SUPPORT_SMTP_HOST = "smtp.gmail.com";
process.env.SUPPORT_SMTP_PORT = "465";
process.env.SUPPORT_SMTP_SECURE = "true";
process.env.SUPPORT_SMTP_USER = "lsbproduction00@gmail.com";
process.env.GMAIL_APP_PASSWORD = "verification-only-password";
process.env.SUPPORT_EMAIL_FROM_NAME = "Matths";

const {
  getSupportSmtpAccount,
  sendSupportInquiryNotification,
  sendSupportReply,
} = require("../services/emailService");

async function main() {
  const emailServiceSource = fs.readFileSync(
    path.resolve(__dirname, "../services/emailService.js"),
    "utf8"
  );
  assert.match(
    emailServiceSource,
    /sendSupportInquiryNotification[\s\S]*?to: PUBLIC_CONTACT_EMAIL,[\s\S]*?replyTo: template\.replyTo,[\s\S]*?sendSupportMailboxEmail/
  );
  assert.equal(PUBLIC_CONTACT_EMAIL, "matths-support@matths.kr");
  assert.match(emailServiceSource, /replyTo: replyTo \? normalizeEmail\(replyTo\) : PUBLIC_CONTACT_EMAIL/);
  assert.match(
    emailServiceSource,
    /function sendSupportMailboxEmail[\s\S]*?getSupportSmtpAccount\(\)[\s\S]*?sendEmail/
  );
  assert.doesNotMatch(
    emailServiceSource,
    /SUPPORT_MICROSOFT|graph\.microsoft\.com|supportGraphTokenCache/
  );

  const account = getSupportSmtpAccount();
  assert.equal(account.host, "smtp.gmail.com");
  assert.equal(account.port, 465);
  assert.equal(account.secure, true);
  assert.equal(account.user, "lsbproduction00@gmail.com");
  assert.equal(account.fromAddress, "lsbproduction00@gmail.com");

  const sent = [];
  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    sendMail: async (message) => {
      sent.push(message);
      return { accepted: [message.to], messageId: `fixture-${sent.length}` };
    },
  });
  try {
    await sendSupportInquiryNotification({
      inquiryId: "fixture-inquiry",
      user: { email: "customer@example.com", nickname: "고객" },
      subject: "문의",
      content: "테스트 문의입니다.",
    });
    await sendSupportReply({
      to: "customer@example.com",
      subject: "문의",
      message: "답변입니다.",
    });
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
  assert.equal(sent[0].to, PUBLIC_CONTACT_EMAIL);
  assert.equal(sent[0].replyTo, "customer@example.com");
  assert.equal(sent[1].to, "customer@example.com");
  assert.equal(sent[1].replyTo, PUBLIC_CONTACT_EMAIL);
  assert.equal(sent[0].from.address, "lsbproduction00@gmail.com");
  assert.equal(sent[1].from.address, "lsbproduction00@gmail.com");

  console.log("Support Gmail-to-group routing verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
