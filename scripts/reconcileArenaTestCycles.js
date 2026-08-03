const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaLearningDayLedger,
} = require("../models/goatArenaModel");

const TEST_BATCH_KEY = "GOAT-ARENA-E2E-200-20260803";
const RECONCILIATION_VERSION = "TEST-CYCLE-LEDGER-V2";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function balance(source = {}) {
  return {
    availableLearningDays: number(source.availableLearningDays),
    paybackScoreDays: number(source.paybackScoreDays),
    lockedPaybackScoreDays: number(source.lockedPaybackScoreDays),
    lockedLearningDays: number(source.lockedLearningDays),
    reservedLearningDays: number(source.reservedLearningDays),
  };
}

function delta(target, current) {
  return Object.fromEntries(
    Object.keys(target).map((key) => [key, number(target[key]) - number(current[key])])
  );
}

function hasDelta(value) {
  return Object.values(value).some((item) => number(item) !== 0);
}

function reconcileMainBuckets(cycle) {
  if (cycle.division !== "MAIN") return null;
  const buckets = Array.isArray(cycle.learningDayBuckets)
    ? structuredClone(cycle.learningDayBuckets)
    : [];
  let adminBucket = buckets.find((item) => item.sourceType === "ADMIN_GRANT");
  if (!adminBucket) {
    adminBucket = {
      sourceType: "ADMIN_GRANT",
      availableDays: 0,
      reservedDays: 0,
      lockedDays: 0,
    };
    buckets.push(adminBucket);
  }
  const sums = buckets.reduce(
    (result, bucket) => ({
      availableDays: result.availableDays + number(bucket.availableDays),
      reservedDays: result.reservedDays + number(bucket.reservedDays),
      lockedDays: result.lockedDays + number(bucket.lockedDays),
    }),
    { availableDays: 0, reservedDays: 0, lockedDays: 0 }
  );
  adminBucket.availableDays =
    number(adminBucket.availableDays) +
    number(cycle.availableLearningDays) -
    sums.availableDays;
  adminBucket.reservedDays =
    number(adminBucket.reservedDays) +
    number(cycle.reservedLearningDays) -
    sums.reservedDays;
  adminBucket.lockedDays =
    number(adminBucket.lockedDays) +
    number(cycle.lockedLearningDays) -
    sums.lockedDays;
  if (
    adminBucket.availableDays < 0 ||
    adminBucket.reservedDays < 0 ||
    adminBucket.lockedDays < 0
  ) {
    throw new Error(`${cycle._id}의 Main 학습일수 출처 묶음을 음수 없이 보정할 수 없습니다.`);
  }
  return buckets;
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 15_000 });
  try {
    const users = await User.find({
      isTestAccount: true,
      testBatchKey: TEST_BATCH_KEY,
    })
      .select("_id")
      .lean();
    const userIds = users.map((user) => user._id);
    const cycles = await AccessCycle.find({ userId: { $in: userIds } }).lean();
    const cycleIds = cycles.map((cycle) => cycle._id);
    const summaries = cycleIds.length
      ? await ArenaLearningDayLedger.aggregate([
          { $match: { accessCycleId: { $in: cycleIds } } },
          {
            $group: {
              _id: "$accessCycleId",
              availableLearningDays: { $sum: "$availableLearningDaysDelta" },
              paybackScoreDays: { $sum: "$paybackScoreDaysDelta" },
              lockedPaybackScoreDays: { $sum: "$lockedPaybackScoreDaysDelta" },
              lockedLearningDays: { $sum: "$lockedLearningDaysDelta" },
              reservedLearningDays: { $sum: "$reservedLearningDaysDelta" },
            },
          },
        ])
      : [];
    const summaryByCycle = new Map(
      summaries.map((summary) => [String(summary._id), balance(summary)])
    );
    const plans = cycles
      .map((cycle) => {
        const target = balance(cycle);
        const current = summaryByCycle.get(String(cycle._id)) || balance();
        const adjustment = delta(target, current);
        const buckets = reconcileMainBuckets(cycle);
        const bucketChanged =
          buckets && JSON.stringify(buckets) !== JSON.stringify(cycle.learningDayBuckets || []);
        return { cycle, target, adjustment, buckets, bucketChanged };
      })
      .filter((plan) => hasDelta(plan.adjustment) || plan.bucketChanged);

    console.log(JSON.stringify({
      apply,
      batchKey: TEST_BATCH_KEY,
      users: users.length,
      cycles: cycles.length,
      plannedAdjustments: plans.length,
      balanceAdjustments: plans.filter((plan) => hasDelta(plan.adjustment)).length,
      bucketAdjustments: plans.filter((plan) => plan.bucketChanged).length,
    }, null, 2));
    if (!apply || !plans.length) return;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const plan of plans) {
          if (plan.bucketChanged) {
            await AccessCycle.updateOne(
              { _id: plan.cycle._id, userId: plan.cycle.userId },
              { $set: { learningDayBuckets: plan.buckets } },
              { session }
            );
          }
          if (hasDelta(plan.adjustment)) {
            await ArenaLearningDayLedger.updateOne(
              {
                idempotencyKey: `${plan.cycle._id}:${RECONCILIATION_VERSION}`,
              },
              {
                $setOnInsert: {
                  userId: plan.cycle.userId,
                  accessCycleId: plan.cycle._id,
                  idempotencyKey: `${plan.cycle._id}:${RECONCILIATION_VERSION}`,
                  eventType: "ADMIN_ADJUSTMENT",
                  availableLearningDaysDelta:
                    plan.adjustment.availableLearningDays,
                  paybackScoreDaysDelta: plan.adjustment.paybackScoreDays,
                  lockedPaybackScoreDaysDelta:
                    plan.adjustment.lockedPaybackScoreDays,
                  lockedLearningDaysDelta: plan.adjustment.lockedLearningDays,
                  reservedLearningDaysDelta:
                    plan.adjustment.reservedLearningDays,
                  sourceBucket:
                    plan.cycle.division === "MAIN" ? "ADMIN_GRANT" : "PACKAGE_BASE",
                  balanceAfter: plan.target,
                  sourceType: "ARENA_TEST_DATASET_RECONCILIATION",
                  sourceId: plan.cycle.userId,
                  occurredAt: new Date(),
                  metadata: {
                    testBatchKey: TEST_BATCH_KEY,
                    reconciliationVersion: RECONCILIATION_VERSION,
                    reason: "테스트 데이터 초기 원장 및 학습일수 출처 묶음 보정",
                  },
                },
              },
              { upsert: true, session }
            );
          }
        }
      });
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify({ ok: true, applied: plans.length }, null, 2));
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exit(1);
});
