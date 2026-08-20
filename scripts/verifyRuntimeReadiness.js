const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
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
  GOOGLE_OAUTH_CLIENT_ID:
    "runtime-google-client",
  GOOGLE_OAUTH_CLIENT_SECRET:
    "runtime-google-secret",
  GOOGLE_OAUTH_REDIRECT_URI:
    "https://www.matths.kr/auth/google/callback",
  KAKAO_OAUTH_REST_API_KEY:
    "runtime-kakao-rest-api-key",
  KAKAO_OAUTH_CLIENT_SECRET:
    "runtime-kakao-client-secret",
  KAKAO_OAUTH_REDIRECT_URI:
    "https://www.matths.kr/auth/kakao/callback",
  CLOUDINARY_URL: "cloudinary://key:secret@example",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "matths-private",
  SUPPORT_SMTP_HOST: "smtp.gmail.com",
  SUPPORT_SMTP_USER: "support@gmail.com",
  GMAIL_APP_PASSWORD: "app-password",
  DOCUMENT_WATERMARK_SECRET: "w".repeat(32),
  PASSWORD_RESET_SECRET: "p".repeat(32),
  FINANCE_PG_FEE_RESERVE_BPS: "350",
};

function verifyHealthHandlersInIsolatedProcess() {
  const controllerPath = path.resolve(
    __dirname,
    "../controllers/apiController.js"
  );
  const probe = String.raw`
    const apiController = require(process.argv[1]);

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

    async function main() {
      const liveResponse = responseRecorder();
      apiController.liveness({}, liveResponse);

      const readyResponse = responseRecorder();
      await apiController.readiness({}, readyResponse);

      process.stdout.write(JSON.stringify({
        live: liveResponse,
        ready: readyResponse,
      }));
    }

    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  const result = spawnSync(
    process.execPath,
    ["-e", probe, controllerPath],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DISABLE_SCHEDULERS: "1",
        NODE_ENV: "development",
      },
      timeout: 20_000,
    }
  );

  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(
      "Health handler probe timed out while loading local dependencies. " +
        "Reinstall or hydrate node_modules (npm ci) and retry."
    );
  }
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    result.stderr || "Health handler probe failed."
  );

  const health = JSON.parse(result.stdout);
  assert.equal(health.live.statusCode, 200);
  assert.equal(health.live.body.status, "ok");
  assert.equal(health.ready.statusCode, 503);
  assert.equal(health.ready.body.status, "not_ready");
}

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

  const invalidGoogleRedirectReport =
    runtimeEnvironmentReport({
      ...validProductionEnvironment,
      GOOGLE_OAUTH_REDIRECT_URI:
        "https://matths.kr/auth/google/callback",
    });
  assert.ok(
    invalidGoogleRedirectReport.errors.some(
      (item) =>
        item.includes(
          "GOOGLE_OAUTH_REDIRECT_URI"
        )
    )
  );

  const invalidKakaoRedirectReport =
    runtimeEnvironmentReport({
      ...validProductionEnvironment,
      KAKAO_OAUTH_REDIRECT_URI:
        "https://matths.kr/auth/kakao/callback",
    });
  assert.ok(
    invalidKakaoRedirectReport.errors.some(
      (item) =>
        item.includes(
          "KAKAO_OAUTH_REDIRECT_URI"
        )
    )
  );

  const missingTossKeysReport = runtimeEnvironmentReport({
    ...validProductionEnvironment,
    PAID_CHECKOUT_ENABLED: "true",
    PAYMENT_PROVIDER: "TOSS",
    TOSS_PAYMENTS_MODE: "TEST",
  });
  assert.ok(missingTossKeysReport.errors.some((item) => item.includes("TOSS_TEST_CLIENT_KEY")));
  const testPaymentsReport = runtimeEnvironmentReport({
    ...validProductionEnvironment,
    PAID_CHECKOUT_ENABLED: "true",
    PAYMENT_PROVIDER: "TOSS",
    TOSS_PAYMENTS_MODE: "TEST",
    TOSS_TEST_CLIENT_KEY: "test_gck_runtime_verification",
    TOSS_TEST_SECRET_KEY: "test_gsk_runtime_verification",
  });
  assert.deepEqual(testPaymentsReport.errors, []);
  assert.ok(testPaymentsReport.warnings.some((item) => item.includes("TEST 모드")));

  verifyHealthHandlersInIsolatedProcess();

  const serverSource = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.match(serverSource, /frame-ancestors 'none'/);
  assert.match(serverSource, /frame-src https:\/\/\*\.tosspayments\.com/);
  assert.match(serverSource, /https:\/\/js\.tosspayments\.com/);
  assert.match(serverSource, /X-Content-Type-Options/);
  assert.match(serverSource, /process\.once\("SIGTERM"/);
  assert.match(serverSource, /mongoose\.disconnect\(\)/);

  console.log("Runtime environment, health endpoints, and security headers verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
