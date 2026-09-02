const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "config.env"),
  quiet: true,
});

const sourceDatabaseUri = String(process.env.DB || "");
if (!sourceDatabaseUri) {
  throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
}

const auditDatabaseName = String(
  process.env.AUDIT_DATABASE_NAME || "matths_audit_zero_assumption_20260815"
);
if (!/^matths_audit_[a-z0-9_]{4,80}$/.test(auditDatabaseName)) {
  throw new Error("격리 감사 DB 이름은 matths_audit_ 접두사를 사용해야 합니다.");
}
const queryIndex = sourceDatabaseUri.indexOf("?");
const base = queryIndex >= 0 ? sourceDatabaseUri.slice(0, queryIndex) : sourceDatabaseUri;
const query = queryIndex >= 0 ? sourceDatabaseUri.slice(queryIndex) : "";
const authorityEnd = base.indexOf("/", base.indexOf("://") + 3);
if (authorityEnd < 0) {
  throw new Error("DB 연결 문자열에서 데이터베이스 경계를 찾지 못했습니다.");
}

process.env.DB = `${base.slice(0, authorityEnd + 1)}${auditDatabaseName}${query}`;
process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";
process.env.PORT = String(process.env.AUDIT_PORT || "8123");
process.env.APP_BASE_URL = `http://127.0.0.1:${process.env.PORT}`;
process.env.PUBLIC_BASE_URL = process.env.APP_BASE_URL;
process.env.DISABLE_SCHEDULERS = "1";
process.env.ALLOW_TEST_DATA_MUTATION = "1";
process.env.PAID_CHECKOUT_ENABLED = "false";
process.env.PAYMENT_PROVIDER = "DISABLED";
process.env.FILE_STORAGE_PROVIDER = "local";
process.env.TEST_ACCOUNT_PASSWORD = String(
  process.env.AUDIT_TEST_PASSWORD || "Audit2026!MatthsLocal"
);

// The audit environment must never deliver email or touch production file stores.
for (const name of [
  "CLOUDINARY_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "SUPPORT_SMTP_HOST",
  "SUPPORT_SMTP_USER",
  "SUPPORT_SMTP_PASSWORD",
  "GMAIL_APP_PASSWORD",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "KAKAO_OAUTH_REST_API_KEY",
  "KAKAO_OAUTH_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "INICIS_TEST_MID",
  "INICIS_TEST_HASH_KEY",
  "INICIS_TEST_API_KEY",
  "INICIS_TEST_CLIENT_IP",
  "INICIS_LIVE_MID",
  "INICIS_LIVE_HASH_KEY",
  "INICIS_LIVE_API_KEY",
  "INICIS_LIVE_CLIENT_IP",
]) {
  process.env[name] = "";
}

const requestedTarget = process.argv[2];
if (!requestedTarget) {
  throw new Error("실행할 저장소 내부 JavaScript 파일 경로가 필요합니다.");
}
const repositoryRoot = path.resolve(__dirname, "..");
const target = path.resolve(repositoryRoot, requestedTarget);
if (!target.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error("감사 실행 대상은 저장소 내부에 있어야 합니다.");
}

process.argv.splice(1, 2, target);
const loadedTarget = require(target);
if (
  path.basename(target) === "server.js"
  && typeof loadedTarget.startApplication === "function"
) {
  loadedTarget.startApplication().catch((error) => {
    console.error("Isolated audit application startup failed:", error);
    process.exitCode = 1;
  });
}
