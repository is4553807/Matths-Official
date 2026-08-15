const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "config.env"),
  quiet: true,
});

const sourceDatabaseUri = String(process.env.DB || "");
if (!sourceDatabaseUri) {
  throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
}

const auditDatabaseName = "matths_audit_zero_assumption_20260815";
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
process.env.PORT = String(process.env.PROVIDER_AUDIT_PORT || "8124");
process.env.APP_BASE_URL = `http://127.0.0.1:${process.env.PORT}`;
process.env.PUBLIC_BASE_URL = process.env.APP_BASE_URL;
process.env.DISABLE_SCHEDULERS = "1";
process.env.ALLOW_TEST_DATA_MUTATION = "1";
process.env.PAID_CHECKOUT_ENABLED = "true";
process.env.PAYMENT_PROVIDER = "TOSS";
process.env.TOSS_PAYMENTS_MODE = "TEST";
process.env.TEST_ACCOUNT_PASSWORD = String(
  process.env.AUDIT_TEST_PASSWORD || "Audit2026!MatthsLocal"
);

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
  path.basename(target) === "server.js" &&
  typeof loadedTarget.startApplication === "function"
) {
  loadedTarget.startApplication().catch((error) => {
    console.error("Provider audit application startup failed:", error);
    process.exitCode = 1;
  });
}
