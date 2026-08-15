const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "config.env"),
  quiet: true,
});

const sourceDatabaseUri = String(process.env.DB || "");
const queryIndex = sourceDatabaseUri.indexOf("?");
const base = queryIndex >= 0 ? sourceDatabaseUri.slice(0, queryIndex) : sourceDatabaseUri;
const query = queryIndex >= 0 ? sourceDatabaseUri.slice(queryIndex) : "";
const authorityEnd = base.indexOf("/", base.indexOf("://") + 3);
if (!sourceDatabaseUri || authorityEnd < 0) {
  throw new Error("격리 MongoDB 연결 문자열을 만들 수 없습니다.");
}

process.env.DB = `${base.slice(0, authorityEnd + 1)}matths_audit_zero_assumption_20260815${query}`;
process.env.NODE_ENV = "production";
process.env.HOST = "127.0.0.1";
process.env.PORT = String(process.env.CANONICAL_AUDIT_PORT || "8125");
process.env.APP_BASE_URL = "https://www.matths.kr";
process.env.PUBLIC_BASE_URL = "https://www.matths.kr";
process.env.DISABLE_SCHEDULERS = "1";
process.env.ALLOW_TEST_DATA_MUTATION = "1";
process.env.PAID_CHECKOUT_ENABLED = "false";
process.env.PAYMENT_PROVIDER = "DISABLED";

const { startApplication } = require("../server");
startApplication().catch((error) => {
  console.error("Canonical production audit startup failed:", error);
  process.exitCode = 1;
});
