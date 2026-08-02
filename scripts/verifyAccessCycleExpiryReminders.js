const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildReminderCopy,
  getDueThresholdHours,
  mostUrgentThreshold,
  reminderDedupeKey,
} = require("../services/accessCycleExpiryReminderService");

const now = new Date("2026-08-02T12:00:00.000+09:00");
const afterHours = (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000);

assert.deepEqual(getDueThresholdHours({ expiresAt: afterHours(73), now }), []);
assert.deepEqual(getDueThresholdHours({ expiresAt: afterHours(72), now }), [72]);
assert.deepEqual(getDueThresholdHours({ expiresAt: afterHours(25), now }), [72]);
assert.deepEqual(getDueThresholdHours({ expiresAt: afterHours(24), now }), [72, 24]);
assert.deepEqual(getDueThresholdHours({ expiresAt: afterHours(6), now }), [72, 24, 6]);
assert.deepEqual(getDueThresholdHours({ expiresAt: afterHours(-1), now }), []);
assert.equal(mostUrgentThreshold([72, 24, 6]), 6);
assert.equal(mostUrgentThreshold([]), null);

const copy = buildReminderCopy({
  cycle: {
    division: "MAIN",
    expiresAt: afterHours(24),
    availableLearningDays: 2,
    reservedLearningDays: 1,
    lockedLearningDays: 3,
  },
  thresholdHours: 24,
});
assert.match(copy.title, /24시간/);
assert.match(copy.message, /Main Division/);
assert.match(copy.message, /경기 예치 3일/);
assert.equal(copy.href, "/pricing");
assert.equal(
  reminderDedupeKey({ accessCycleId: "cycle-1", thresholdHours: 6 }),
  "access-cycle-expiry:cycle-1:6h"
);

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
assert.match(source("models/goatArenaModel.js"), /AccessCycleExpiryReminder/);
assert.match(source("models/matthsModel.js"), /dedupeKey/);
assert.match(source("services/emailService.js"), /X-Matths-Idempotency-Key/);
assert.match(
  source("services/accountDeletionService.js"),
  /AccessCycleExpiryReminder\.deleteMany/
);
assert.match(source("server.js"), /startAccessCycleExpiryReminderScheduler/);

console.log("학습권 이용 종료 72·24·6시간 알림 경계·멱등 연결 검증 완료");
