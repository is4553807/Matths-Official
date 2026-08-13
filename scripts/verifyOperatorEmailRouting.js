const assert = require("node:assert/strict");

process.env.SMTP_HOST = "smtp.cafe24.com";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_TLS_MIN_VERSION = "TLSv1";
process.env.SMTP_TLS_CIPHERS = "DEFAULT@SECLEVEL=0";
process.env.SMTP_TLS_ALLOW_LEGACY_SERVER_CONNECT = "true";
process.env.SMTP_USER = "admin@lsbproduction.com";
process.env.SMTP_PASSWORD = "verification-only-password";
process.env.EMAIL_FROM_ADDRESS = "admin@lsbproduction.com";
process.env.OPERATOR_SMTP_ACCOUNTS_JSON = JSON.stringify({
  "account1@matths.kr": {
    user: "account1@matths.kr",
    password: "verification-only-operator-password",
  },
});

const { getSmtpAccount } = require("../services/emailService");

const systemAccount = getSmtpAccount();
assert.equal(systemAccount.host, "smtp.cafe24.com");
assert.equal(systemAccount.port, 587);
assert.equal(systemAccount.secure, false);
assert.equal(systemAccount.tlsMinVersion, "TLSv1");
assert.equal(systemAccount.tlsCiphers, "DEFAULT@SECLEVEL=0");
assert.equal(systemAccount.tlsAllowLegacyServerConnect, true);
assert.equal(systemAccount.tlsRejectUnauthorized, true);
assert.equal(systemAccount.fromAddress, "admin@lsbproduction.com");

const operatorAccount = getSmtpAccount("account1@matths.kr");
assert.equal(operatorAccount.user, "account1@matths.kr");
assert.equal(operatorAccount.fromAddress, "account1@matths.kr");
assert.equal(operatorAccount.host, "smtp.cafe24.com");

assert.throws(
  () => getSmtpAccount("unregistered@matths.kr"),
  (error) => error?.status === 503 && /등록되지 않았습니다/.test(error.message),
  "등록되지 않은 운영자 주소를 기본 계정으로 대신 보내면 안 됩니다."
);

console.log("Operator email routing verification passed");
