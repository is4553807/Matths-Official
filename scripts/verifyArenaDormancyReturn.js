const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { AccessCycle, ArenaAccessState, ArenaOutboxEvent } = require("../models/goatArenaModel");
const {
  MAIN_DORMANCY_DAYS,
  dormancyConsumptionThroughDate,
  inactivityDayCount,
  isolateDormancyReserve,
} = require("../services/arenaDormancyService");

const root = path.resolve(__dirname, "..");
const userId = new mongoose.Types.ObjectId();
const cycleId = new mongoose.Types.ObjectId();
const inactivityStartedAt = new Date("2026-08-02T15:00:00.000Z"); // 8월 3일 00:00 KST

assert.equal(MAIN_DORMANCY_DAYS, 20);
assert.equal(
  inactivityDayCount({
    startedAt: inactivityStartedAt,
    now: new Date("2026-08-21T23:00:00+09:00"),
  }),
  19
);
assert.equal(
  inactivityDayCount({
    startedAt: inactivityStartedAt,
    now: new Date("2026-08-22T10:00:00+09:00"),
  }),
  20
);
assert.equal(
  inactivityDayCount({
    startedAt: inactivityStartedAt,
    now: new Date("2026-08-23T00:00:00+09:00"),
  }),
  21
);
assert.equal(dormancyConsumptionThroughDate(inactivityStartedAt), "2026-08-21");
assert.equal(
  dormancyConsumptionThroughDate(inactivityStartedAt, { allowFinalDay: true }),
  "2026-08-22"
);

const cycle = new AccessCycle({
  _id: cycleId,
  userId,
  division: "MAIN",
  status: "ACTIVE",
  policyVersionId: new mongoose.Types.ObjectId(),
  policyVersionCode: "TEST",
  policySnapshot: {},
  pricePaid: 29000,
  paidAt: inactivityStartedAt,
  startsAt: inactivityStartedAt,
  baseExpiresAt: new Date("2026-09-30T00:00:00+09:00"),
  expiresAt: new Date("2026-09-30T00:00:00+09:00"),
  evaluationAt: new Date("2026-09-01T00:00:00+09:00"),
  availableLearningDays: 9,
  paybackScoreDays: 0,
  firstDayMode: "SAME_DAY",
  firstDayConsumedAt: inactivityStartedAt,
  learningDayBuckets: [
    {
      sourceType: "MAIN_ENTRY_BONUS",
      availableDays: 9,
      reservedDays: 0,
      lockedDays: 0,
    },
  ],
});
const state = new ArenaAccessState({
  userId,
  accessCycleId: cycleId,
  currentCompetitiveDivision: "SUB",
  state: "SUB_ACCESS_EXPIRED_LOCKED",
  currentSeasonPlacementCompleted: false,
  mainInactivityStartedAt: inactivityStartedAt,
  mainInactivityStartAvailableDays: 29,
  mainDormancyStartedAt: new Date("2026-08-23T00:00:00+09:00"),
  mainDormancyFrozenLearningDays: 9,
  mainDormancyRecoveryMode: "RESTORE_ON_MAIN_REENTRY",
  finalRankingActive: false,
});
const reserve = isolateDormancyReserve(cycle.toObject());
assert.equal(reserve.availableLearningDays, 9);
assert.equal(reserve.hasUnsettledLearningDays, false);
assert.equal(reserve.buckets.reduce((sum, bucket) => sum + bucket.availableDays, 0), 0);

Promise.all([
  cycle.validate(),
  state.validate(),
  new ArenaOutboxEvent({
    eventType: "MainDormancyDemotedToSub",
    aggregateType: "ArenaAccessState",
    aggregateId: state._id,
    idempotencyKey: `main-dormancy:${userId}:test`,
  }).validate(),
])
  .then(() => {
    const dormancySource = fs.readFileSync(
      path.join(root, "services/arenaDormancyService.js"),
      "utf8"
    );
    const dailySource = fs.readFileSync(
      path.join(root, "services/accessCycleDailyService.js"),
      "utf8"
    );
    const mainSettlement = fs.readFileSync(
      path.join(root, "services/mainArenaSettlementService.js"),
      "utf8"
    );
    const revengeSettlement = fs.readFileSync(
      path.join(root, "services/mainArenaRevengeService.js"),
      "utf8"
    );
    const weeklyMock = fs.readFileSync(
      path.join(root, "services/privateMockExamService.js"),
      "utf8"
    );
    const paybackSource = fs.readFileSync(
      path.join(root, "services/arenaPaybackReviewService.js"),
      "utf8"
    );
    assert.ok(dormancySource.includes('currentCompetitiveDivision: "SUB"'));
    assert.ok(dormancySource.includes('mainDormancyRecoveryMode: recoveryMode'));
    assert.ok(dormancySource.includes('"RESTORE_ON_MAIN_REENTRY"'));
    assert.ok(dormancySource.includes('"SUB_STANDARD_FLOW"'));
    assert.ok(paybackSource.includes('eventType: "MAIN_DORMANCY_RESERVE_RESTORED"'));
    assert.ok(paybackSource.includes('sourceType: "MAIN_DORMANCY_RESTORE"'));
    assert.ok(dailySource.includes("initializeMainInactivityWindows"));
    assert.ok(dailySource.includes("processMainDormancyTransitions"));
    assert.ok(mainSettlement.includes("recordSettledMainMatchActivities"));
    assert.ok(revengeSettlement.includes("recordSettledMainMatchActivities"));
    assert.ok(weeklyMock.includes("WEEKLY_OFFICIAL_MOCK"));
    assert.ok(!dormancySource.includes("LONG_DORMANCY_DAYS"));
    assert.ok(!dormancySource.includes("dormancySourceLastLoginAt:"));
    console.log(
      "Main Division 20일 미활동 Sub 강등·잔여 일수 분리·Main 재진입 복원 경로 검증 완료"
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
