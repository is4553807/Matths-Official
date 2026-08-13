const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PaybackPayoutRecord } = require("../models/paybackModel");
const { paybackCompletionEmailMessage } = require("../services/paybackAccountService");

const message = paybackCompletionEmailMessage({
  user: { name: "사용자" },
  payoutRecord: {
    amount: 14500,
    paybackRate: 50,
    bankName: "테스트은행",
    accountNumberLast4: "1234",
    completedAt: new Date("2026-08-13T00:00:00.000Z"),
  },
});
assert.match(message, /14,500원/);
assert.match(message, /50%/);
assert.match(message, /끝 1234/);
assert.match(message, /Matths와 GOAT Arena 우편함/);

for (const schemaPath of [
  "completedBy",
  "completedBySnapshot.email",
  "siteNotificationId",
  "emailStatus",
  "emailAttemptedAt",
]) {
  assert.ok(PaybackPayoutRecord.schema.path(schemaPath), `${schemaPath} 필드가 필요합니다.`);
}

const serviceSource = fs.readFileSync(
  path.resolve(__dirname, "../services/paybackAccountService.js"),
  "utf8"
);
assert.match(serviceSource, /session\.withTransaction/);
assert.match(serviceSource, /UserNotification\.create/);
assert.match(serviceSource, /finance\.payback-completed/);
assert.match(serviceSource, /fromAddress:\s*actor\.email/);

console.log("Payback completion notification workflow verification passed");
