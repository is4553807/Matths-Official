const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  AccessCycle,
  AccessCycleExpiryReminder,
} = require("../models/goatArenaModel");
const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  processDueAccessCycleExpiryReminders,
} = require("../services/accessCycleExpiryReminderService");
const {
  acquireSchedulerLease,
  releaseSchedulerLease,
} = require("../services/schedulerLeaseService");

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  await Promise.all([
    AccessCycleExpiryReminder.init(),
    UserNotification.init(),
  ]);

  const token = randomUUID();
  const userId = new mongoose.Types.ObjectId();
  const retryUserId = new mongoose.Types.ObjectId();
  const firstCycleId = new mongoose.Types.ObjectId();
  const retryCycleId = new mongoose.Types.ObjectId();
  const now = new Date();
  const dedupePrefix = `access-cycle-expiry:`;
  const cleanupFilter = {
    $or: [
      { accessCycleId: { $in: [firstCycleId, retryCycleId] } },
      { userId: { $in: [userId, retryUserId] } },
    ],
  };
  let schedulerLease = null;

  try {
    for (let attempt = 0; attempt < 20 && !schedulerLease; attempt += 1) {
      schedulerLease = await acquireSchedulerLease({
        name: "ACCESS_CYCLE_EXPIRY_REMINDERS",
        leaseMs: 5 * 60 * 1000,
      });
      if (!schedulerLease) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(schedulerLease, "실행 중인 만료 알림 스케줄러 임대를 테스트가 인계받지 못했습니다.");
    await User.collection.insertMany([
      {
        _id: userId,
        name: `reminder-test-${token.slice(0, 8)}`,
        email: `reminder-${token}@example.com`,
        passwordHash: "test-only",
        role: "test",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: retryUserId,
        name: `reminder-retry-${token.slice(0, 8)}`,
        email: `reminder-retry-${token}@example.com`,
        passwordHash: "test-only",
        role: "test",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await AccessCycle.collection.insertMany([
      {
        _id: firstCycleId,
        userId: retryUserId,
        division: "SUB",
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() + 5 * HOUR_MS),
        availableLearningDays: 1,
        reservedLearningDays: 0,
        lockedLearningDays: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: retryCycleId,
        userId,
        division: "MAIN",
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() + 70 * HOUR_MS),
        availableLearningDays: 3,
        reservedLearningDays: 0,
        lockedLearningDays: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const successfulDeliveries = [];
    const firstResult = await processDueAccessCycleExpiryReminders({
      now,
      sendEmailFn: async (delivery) => {
        successfulDeliveries.push(delivery);
        return { delivered: true, preview: false, providerMessageId: token };
      },
    });
    assert.equal(firstResult.delivered, 2);
    assert.equal(successfulDeliveries.length, 2);

    const firstReminders = await AccessCycleExpiryReminder.find({
      accessCycleId: firstCycleId,
    })
      .sort({ thresholdHours: -1 })
      .lean();
    assert.equal(firstReminders.length, 3);
    assert.deepEqual(
      firstReminders.map((item) => [item.thresholdHours, item.status]),
      [
        [72, "SKIPPED"],
        [24, "SKIPPED"],
        [6, "SENT"],
      ]
    );

    const firstReplay = await processDueAccessCycleExpiryReminders({
      now: new Date(now.getTime() + 1000),
      sendEmailFn: async (delivery) => {
        successfulDeliveries.push(delivery);
        return { delivered: true, preview: false };
      },
    });
    assert.equal(firstReplay.delivered, 0);
    assert.equal(successfulDeliveries.length, 2);

    /* 두 번째 이용 주기의 72시간 알림을 실패 상태로 되돌려 재시도한다. */
    await AccessCycleExpiryReminder.updateOne(
      { accessCycleId: retryCycleId, thresholdHours: 72 },
      {
        $set: {
          status: "PARTIAL",
          emailStatus: "FAILED",
          emailAttempts: 1,
          emailNextRetryAt: new Date(now.getTime() + 15 * 60 * 1000),
          emailDeliveredAt: null,
          deliveredAt: null,
        },
      }
    );
    let retryCalls = 0;
    await processDueAccessCycleExpiryReminders({
      now: new Date(now.getTime() + 10 * 60 * 1000),
      sendEmailFn: async () => {
        retryCalls += 1;
        return { delivered: true, preview: false };
      },
    });
    assert.equal(retryCalls, 0);
    await processDueAccessCycleExpiryReminders({
      now: new Date(now.getTime() + 16 * 60 * 1000),
      sendEmailFn: async () => {
        retryCalls += 1;
        return { delivered: true, preview: false, providerMessageId: `${token}-retry` };
      },
    });
    assert.equal(retryCalls, 1);

    const [retryReminder, notificationCount] = await Promise.all([
      AccessCycleExpiryReminder.findOne({
        accessCycleId: retryCycleId,
        thresholdHours: 72,
      }).lean(),
      UserNotification.countDocuments({
        userId: { $in: [userId, retryUserId] },
        dedupeKey: new RegExp(`^${dedupePrefix}`),
      }),
    ]);
    assert.equal(retryReminder.status, "SENT");
    assert.equal(retryReminder.emailAttempts, 2);
    assert.equal(notificationCount, 2);

    console.log("Atlas 학습권 만료 예정 알림 중복 방지·긴급 구간·이메일 재시도 검증 완료");
  } finally {
    await releaseSchedulerLease({
      lease: schedulerLease,
      result: { verification: true },
    }).catch(() => {});
    await Promise.all([
      AccessCycleExpiryReminder.deleteMany(cleanupFilter),
      UserNotification.deleteMany({
        userId: { $in: [userId, retryUserId] },
        dedupeKey: new RegExp(`^${dedupePrefix}`),
      }),
      AccessCycle.deleteMany({ _id: { $in: [firstCycleId, retryCycleId] } }),
      User.deleteMany({ _id: { $in: [userId, retryUserId] } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
