const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  runtimeEnvironmentReport,
} = require("../services/runtimeEnvironmentService");

const validProductionEnvironment = {
  NODE_ENV: "production",
  DB: "mongodb://database.example/matths",
  SECRET: "s".repeat(64),
  APP_BASE_URL: "https://www.matths.kr",
  PUBLIC_BASE_URL: "https://www.matths.kr",
  CLOUDINARY_URL: "cloudinary://key:secret@example",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "matths-private",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "system@example.com",
  SMTP_PASSWORD: "password",
  SUPPORT_SMTP_HOST: "smtp.gmail.com",
  SUPPORT_SMTP_USER: "support@gmail.com",
  GMAIL_APP_PASSWORD: "app-password",
  DOCUMENT_WATERMARK_SECRET: "w".repeat(32),
  PASSWORD_RESET_SECRET: "p".repeat(32),
  FINANCE_PG_FEE_RESERVE_BPS: "350",
};

async function main() {
  const validReport = runtimeEnvironmentReport(validProductionEnvironment);
  assert.deepEqual(validReport.errors, []);

  const invalidReport = runtimeEnvironmentReport({ NODE_ENV: "production" });
  assert.ok(invalidReport.errors.length >= 8);

  const insecureUrlReport = runtimeEnvironmentReport({
    ...validProductionEnvironment,
    APP_BASE_URL: "http://www.matths.kr/path",
  });
  assert.ok(insecureUrlReport.errors.some((item) => item.includes("APP_BASE_URL")));

  const malformedOperatorReport = runtimeEnvironmentReport({
    ...validProductionEnvironment,
    OPERATOR_SMTP_ACCOUNTS_JSON: "not-json",
  });
  assert.ok(
    malformedOperatorReport.errors.some((item) => item.includes("OPERATOR_SMTP_ACCOUNTS_JSON"))
  );

  const apiController = require("../controllers/apiController");
  function responseRecorder() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
  }

  const liveResponse = responseRecorder();
  apiController.liveness({}, liveResponse);
  assert.equal(liveResponse.statusCode, 200);
  assert.equal(liveResponse.body.status, "ok");

  const readyResponse = responseRecorder();
  await apiController.readiness({}, readyResponse);
  assert.equal(readyResponse.statusCode, 503);
  assert.equal(readyResponse.body.status, "not_ready");

  const serverSource = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.match(serverSource, /frame-ancestors 'none'/);
  assert.match(serverSource, /X-Content-Type-Options/);
  assert.match(serverSource, /process\.once\("SIGTERM"/);
  assert.match(serverSource, /mongoose\.disconnect\(\)/);

  console.log("Runtime environment, health endpoints, and security headers verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
