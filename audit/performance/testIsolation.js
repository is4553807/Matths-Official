// Preload only in the audit subprocesses, never in the application runtime.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const dotenv = require("dotenv");
const config = path.join(process.cwd(), "config.env");
const auditDatabaseUri = process.env.PERFORMANCE_TEST_DB;
if (fs.existsSync(config)) {
  for (const key of Object.keys(dotenv.parse(fs.readFileSync(config)))) process.env[key] = "";
}
for (const key of Object.keys(process.env)) {
  if (/SMTP|CLOUDINARY|R2_|OAUTH|APPLE_|INICIS|PAYPAL|STRIPE|GMAIL|OPENAI|GEMINI/.test(key)) process.env[key] = "";
}
if (auditDatabaseUri) process.env.DB = auditDatabaseUri;
Object.assign(process.env, {
  NODE_ENV: "test", DISABLE_SCHEDULERS: "1", ALLOW_TEST_DATA_MUTATION: "1",
  PAID_CHECKOUT_MODE: "disabled", FILE_STORAGE_PROVIDER: "local", PRIVATE_MOCK_STORAGE_DRIVER: "local",
  SECRET: "offline-performance-tests-session-secret-2026",
  PAYBACK_ACCOUNT_ENCRYPTION_KEY: "offline-performance-tests-payback-key-2026",
  TEST_ACCOUNT_PASSWORD: "Isolated-fixture-only-2026!",
});
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  const host = typeof options === "object" ? options.host : typeof args[1] === "string" ? args[1] : "localhost";
  if (host && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Audit isolation blocked external socket: ${host}`);
  }
  return connect.apply(this, args);
};
