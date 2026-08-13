const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(
    __dirname,
    "..",
    "config.env"
  ),
});

const {
  getDefaultSmtpAccount,
  verifyEmailConnection,
} = require("../services/emailService");

function maskEmail(email) {
  const [local, domain] =
    String(email || "").split("@");

  if (!local || !domain) {
    return "설정된 SMTP 계정";
  }

  const visible =
    local.slice(0, 2);

  return `${visible}${"*".repeat(
    Math.max(2, local.length - 2)
  )}@${domain}`;
}

async function main() {
  const credentials =
    getDefaultSmtpAccount();
  const result =
    await verifyEmailConnection();

  if (!result.configured) {
    console.error(
      "Gmail SMTP 설정이 없습니다. config.env의 SUPPORT_SMTP_HOST, SUPPORT_SMTP_USER, GMAIL_APP_PASSWORD를 확인해주세요."
    );
    process.exitCode = 1;
    return;
  }

  if (!result.connected) {
    console.error(
      `SMTP 연결에 실패했습니다. 오류 코드: ${result.code || "확인 불가"}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `${maskEmail(
      credentials.user
    )} SMTP 연결 성공`
  );
}

main().catch((error) => {
  console.error(
    "SMTP 설정 확인 중 오류가 발생했습니다.",
    error.message
  );
  process.exitCode = 1;
});
