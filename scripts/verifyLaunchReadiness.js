const { spawnSync } = require("node:child_process");

const checks = [
  "oauth-mobile:verify",
  "oauth-kakao:verify",
  "ipad-server-surface:verify",
  "deployment-surface:verify",
  "runtime:verify",
  "http-surface:verify",
  "request-security:verify",
  "upload-security:verify",
  "error-page:verify",
  "session-store:verify",
  "email-routing:verify",
  "support-email-routing:verify",
  "admin-audit:verify",
  "account-deletion:verify",
  "finance:verify",
  "refund:verify",
  "payments:toss:verify",
  "pricing-entitlements:verify",
  "parent-payments:verify",
  "parent-inquiries:verify",
  "support-inquiry-concurrency:verify",
  "placement-story:verify",
  "payback-completion:verify",
  "payback-daily-learning:verify",
  "product-foundation:verify",
  "launch-views:verify",
  "ui:verify",
  "math-rendering:verify",
  "navigation:verify",
  "canonical-host:verify",
  "coach-content:verify",
  "coach-idempotency:verify",
  "dynamic-id-errors:verify",
  "platform-expansion:verify",
  "auth-rate-limit:verify",
  "brand:verify",
  "logic-parity:verify",
  "arena-foundation:verify",
  "arena-question-design:verify",
  "arena-official-mock-research:verify",
  "arena-private-mock-research:verify",
  "arena-private-mock-generated:verify",
  "arena-problem-data:verify",
  "arena-pdf-runtime:verify",
];

for (const check of checks) {
  console.log(`\n[launch verify] ${check}`);
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", check],
    { cwd: process.cwd(), stdio: "inherit", env: process.env }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    process.exit();
  }
}

console.log(`\nLaunch verification passed: ${checks.length} checks.`);
