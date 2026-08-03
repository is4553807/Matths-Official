const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaOutboxEvent,
  MainShopEffect,
  MainShopPurchase,
} = require("../models/goatArenaModel");
const {
  ensureDefaultMainShopPolicy,
  purchaseMainShopItem,
} = require("../services/arenaShopPolicyService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });

  const token = randomUUID();
  const userId = new mongoose.Types.ObjectId();
  const cycleId = new mongoose.Types.ObjectId();
  const policyVersionId = new mongoose.Types.ObjectId();
  const protectionMatchId = new mongoose.Types.ObjectId();
  const protectionEffectIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const now = new Date("2026-08-03T12:00:00+09:00");
  let purchaseIds = [];

  try {
    await ensureDefaultMainShopPolicy(now);
    await MainShopEffect.createIndexes();
    await User.collection.insertOne({
      _id: userId,
      name: `shop-e2e-${token.slice(0, 8)}`,
      email: `shop-e2e-${token}@example.com`,
      passwordHash: "test-only",
      role: "test",
      accountStatus: "active",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await AccessCycle.create({
      _id: cycleId,
      userId,
      division: "MAIN",
      status: "ACTIVE",
      policyVersionId,
      policyVersionCode: `SHOP-E2E-${token}`,
      policySnapshot: {},
      pricePaid: 0,
      paidAt: now,
      startsAt: now,
      baseExpiresAt: new Date("2026-12-31T23:59:59+09:00"),
      expiresAt: new Date("2026-12-31T23:59:59+09:00"),
      evaluationAt: now,
      availableLearningDays: 10,
      paybackScoreDays: 0,
      lockedLearningDays: 0,
      reservedLearningDays: 0,
      learningDayBuckets: [{
        sourceType: "ADMIN_GRANT",
        availableDays: 10,
        reservedDays: 0,
        lockedDays: 0,
      }],
      firstDayMode: "SAME_DAY",
      firstDayConsumedAt: now,
    });
    await ArenaAccessState.create({
      userId,
      accessCycleId: cycleId,
      currentCompetitiveDivision: "MAIN",
      state: "PAID_ACTIVE",
      currentSeasonPlacementCompleted: true,
      defensePoolEligible: true,
      weeklyMockEligible: true,
      finalRankingActive: true,
    });
    await ArenaLearningDayLedger.create({
      userId,
      accessCycleId: cycleId,
      idempotencyKey: `${token}:INITIAL_BALANCE`,
      eventType: "ADMIN_ADJUSTMENT",
      availableLearningDaysDelta: 10,
      sourceBucket: "ADMIN_GRANT",
      balanceAfter: {
        availableLearningDays: 10,
        paybackScoreDays: 0,
        lockedLearningDays: 0,
        reservedLearningDays: 0,
      },
      sourceType: "ArenaShopResilienceE2E",
      sourceId: cycleId,
      occurredAt: now,
    });

    const requestId = `same-request-${token}`;
    const attempts = await Promise.allSettled([
      purchaseMainShopItem({ userId, itemCode: "MAIN_PROFILE_BORDER", requestId, now }),
      purchaseMainShopItem({ userId, itemCode: "MAIN_PROFILE_BORDER", requestId, now }),
    ]);
    assert.ok(attempts.some((entry) => entry.status === "fulfilled"));
    const purchases = await MainShopPurchase.find({ userId }).lean();
    const effects = await MainShopEffect.find({ userId }).lean();
    const cycleAfterPurchase = await AccessCycle.findById(cycleId).lean();
    purchaseIds = purchases.map((purchase) => purchase._id);
    assert.equal(purchases.length, 1);
    assert.equal(effects.length, 1);
    assert.equal(cycleAfterPurchase.availableLearningDays, 8);
    assert.equal(
      await ArenaLearningDayLedger.countDocuments({
        sourceType: "MainShopPurchase",
        sourceId: purchases[0]._id,
        eventType: "SHOP_ITEM_PURCHASE_BURN",
      }),
      1
    );

    const beforeFailedPurchase = cycleAfterPurchase.availableLearningDays;
    await assert.rejects(
      () => purchaseMainShopItem({
        userId,
        itemCode: "MATCH_ANALYSIS",
        requestId: `invalid-target-${token}`,
        relatedMatchId: new mongoose.Types.ObjectId(),
        now,
      }),
      (error) => error?.code === "MATCH_ANALYSIS_TARGET_REQUIRED"
    );
    assert.equal((await AccessCycle.findById(cycleId).lean()).availableLearningDays, beforeFailedPurchase);
    assert.equal(
      await MainShopPurchase.countDocuments({
        purchaseKey: `${userId}:MATCH_ANALYSIS:invalid-target-${token}`,
      }),
      0
    );

    await MainShopEffect.collection.insertOne({
      _id: protectionEffectIds[0],
      purchaseId: new mongoose.Types.ObjectId(),
      userId,
      itemCode: "DEFENSE_SCHEDULE_PROTECTION",
      status: "APPLIED",
      startsAt: now,
      relatedMatchId: protectionMatchId,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    await assert.rejects(
      () => MainShopEffect.collection.insertOne({
        _id: protectionEffectIds[1],
        purchaseId: new mongoose.Types.ObjectId(),
        userId,
        itemCode: "DEFENSE_SCHEDULE_PROTECTION",
        status: "APPLIED",
        startsAt: now,
        relatedMatchId: protectionMatchId,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      }),
      (error) => error?.code === 11000
    );

    console.log(JSON.stringify({
      ok: true,
      concurrentSameRequestChargedOnce: true,
      failedTargetRolledBack: true,
      duplicateProtectionBlockedByDatabase: true,
    }));
  } finally {
    await ArenaOutboxEvent.deleteMany({
      $or: [
        { aggregateId: { $in: purchaseIds } },
        { "payload.userId": userId },
      ],
    });
    await ArenaLearningDayLedger.deleteMany({ userId });
    await MainShopEffect.deleteMany({
      $or: [{ userId }, { _id: { $in: protectionEffectIds } }],
    });
    await MainShopPurchase.deleteMany({ userId });
    await ArenaAccessState.deleteMany({ userId });
    await AccessCycle.deleteMany({ userId });
    await User.deleteMany({ _id: userId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
