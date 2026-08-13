const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.ADMIN_EMAIL = "admin@lsbproduction.com";
process.env.SUPPORT_SMTP_HOST = "smtp.gmail.com";
process.env.SUPPORT_SMTP_PORT = "465";
process.env.SUPPORT_SMTP_SECURE = "true";
process.env.SUPPORT_SMTP_USER = "lsbproduction00@gmail.com";
process.env.GMAIL_APP_PASSWORD = "verification-only-password";
process.env.SUPPORT_EMAIL_FROM_NAME = "Matths";

const { getSupportSmtpAccount } = require("../services/emailService");

function main() {
  const emailServiceSource = fs.readFileSync(
    path.resolve(__dirname, "../services/emailService.js"),
    "utf8"
  );
  assert.match(
    emailServiceSource,
    /sendSupportInquiryNotification[\s\S]*?to: adminEmail,[\s\S]*?replyTo: template\.replyTo,[\s\S]*?sendSupportMailboxEmail/
  );
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

  console.log("Support Gmail-to-admin routing verification passed");
}

main();
