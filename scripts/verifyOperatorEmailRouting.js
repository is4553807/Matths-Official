const assert = require("node:assert/strict");

process.env.SUPPORT_SMTP_HOST = "smtp.gmail.com";
process.env.SUPPORT_SMTP_PORT = "465";
process.env.SUPPORT_SMTP_SECURE = "true";
process.env.SUPPORT_SMTP_USER = "lsbproduction00@gmail.com";
process.env.GMAIL_APP_PASSWORD = "verification-only-password";

const { getSmtpAccount } = require("../services/emailService");

const systemAccount = getSmtpAccount();
assert.equal(systemAccount.host, "smtp.gmail.com");
assert.equal(systemAccount.port, 465);
assert.equal(systemAccount.secure, true);
assert.equal(systemAccount.tlsRejectUnauthorized, true);
assert.equal(systemAccount.fromAddress, "lsbproduction00@gmail.com");

const operatorAccount = getSmtpAccount("account1@matths.kr");
assert.equal(operatorAccount.user, "lsbproduction00@gmail.com");
assert.equal(operatorAccount.fromAddress, "lsbproduction00@gmail.com");
assert.equal(operatorAccount.host, "smtp.gmail.com");
assert.equal(getSmtpAccount("unregistered@matths.kr").fromAddress, "lsbproduction00@gmail.com");

console.log("Unified Gmail routing verification passed");
