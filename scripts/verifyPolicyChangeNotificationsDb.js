const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  ArenaOutboxEvent,
  PolicyChangeDelivery,
} = require("../models/goatArenaModel");
const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  processArenaOutboxEvents,
} = require("../services/arenaOutboxService");
const {
  processDuePolicyChangeDeliveries,
  queuePolicyChangeNotifications,
  registerPolicyChangeOutboxHandler,
} = require("../services/policyChangeNotificationService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  await Promise.all([PolicyChangeDelivery.init(), UserNotification.init()]);

  const token = randomUUID();
  const now = new Date();
  const userIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const directPolicyId = new mongoose.Types.ObjectId();
  const outboxPolicyId = new mongoose.Types.ObjectId();
  const outboxKey = `${outboxPolicyId}:PolicyChangeScheduled`;
  const policy = (id, summary) => ({
    _id: id,
    code: `POLICY-TEST-${token.slice(0, 8)}`,
    effectiveFrom: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    changeSummary: summary,
  });

  try {
    await User.collection.insertMany(
      userIds.map((userId, index) => ({
        _id: userId,
        name: `policy-notice-${token.slice(0, 8)}-${index}`,
        nameNormalized: `policy-notice-${token.slice(0, 8)}-${index}`,
        email: `policy-notice-${token}-${index}@example.com`,
        passwordHash: "test-only",
        role: "test",
        isActive: index === 0,
        accountStatus: index === 0 ? "active" : "suspended",
        createdAt: now,
        updatedAt: now,
      }))
    );

    const first = await queuePolicyChangeNotifications({
      policyType: "SUB_DIVISION",
      policy: policy(directPolicyId, "일일 공격·방어 상한 검증"),
      now,
      recipientUserIds: userIds,
      scheduleEmailDelivery: false,
    });
    assert.deepEqual(first, { queued: 2, siteDelivered: 2 });

    const replay = await queuePolicyChangeNotifications({
      policyType: "SUB_DIVISION",
      policy: policy(directPolicyId, "일일 공격·방어 상한 검증"),
      now,
      recipientUserIds: userIds,
      scheduleEmailDelivery: false,
    });
    assert.deepEqual(replay, { queued: 2, siteDelivered: 2 });
    assert.equal(
      await UserNotification.countDocuments({ sourceId: directPolicyId }),
      2
    );
    assert.equal(
      await PolicyChangeDelivery.countDocuments({ policyId: directPolicyId }),
      2
    );

    const sent = [];
    const emailResult = await processDuePolicyChangeDeliveries({
      now,
      limit: 10,
      filter: { policyId: directPolicyId },
      sendEmailFn: async (message) => {
        sent.push(message);
        return { delivered: true, preview: false, providerMessageId: token };
      },
    });
    assert.equal(emailResult.processed, 2);
    assert.equal(sent.length, 2);

    registerPolicyChangeOutboxHandler();
    await ArenaOutboxEvent.create({
      eventType: "PolicyChangeScheduled",
      aggregateType: "PolicyVersion",
      aggregateId: outboxPolicyId,
      idempotencyKey: outboxKey,
      payload: {
        policyType: "MAIN_DIVISION",
        policy: policy(outboxPolicyId, "Main 정책 사전 고지 검증"),
        recipientUserIds: userIds,
        scheduleEmailDelivery: false,
      },
    });
    const outboxResult = await processArenaOutboxEvents({
      filter: { idempotencyKey: outboxKey },
      limit: 2,
    });
    assert.deepEqual(outboxResult, { claimed: 1, published: 1, failed: 0 });
    assert.equal(
      await UserNotification.countDocuments({ sourceId: outboxPolicyId }),
      2
    );
    assert.equal(
      await PolicyChangeDelivery.countDocuments({ policyId: outboxPolicyId }),
      2
    );

    console.log("Atlas 정책 변경 30일 사전 고지·전체 우편함·이메일·outbox 재시도 검증 완료");
  } finally {
    await Promise.all([
      PolicyChangeDelivery.deleteMany({ policyId: { $in: [directPolicyId, outboxPolicyId] } }),
      UserNotification.deleteMany({ sourceId: { $in: [directPolicyId, outboxPolicyId] } }),
      ArenaOutboxEvent.deleteMany({ idempotencyKey: outboxKey }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
