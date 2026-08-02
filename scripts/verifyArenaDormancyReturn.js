const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { AccessCycle, ArenaAccessState, ArenaOutboxEvent } = require("../models/goatArenaModel");
const {
  MAIN_DORMANCY_DAYS,
  dormancyConsumptionThroughDate,
  inactivityDayCount,
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
  dailyConsumptionPausedAt: new Date("2026-08-23T00:00:00+09:00"),
});
const state = new ArenaAccessState({
  userId,
  accessCycleId: cycleId,
  currentCompetitiveDivision: "MAIN",
  state: "MAIN_DORMANT",
  currentSeasonPlacementCompleted: true,
  mainInactivityStartedAt: inactivityStartedAt,
  mainInactivityStartAvailableDays: 29,
  mainDormancyStartedAt: new Date("2026-08-23T00:00:00+09:00"),
  mainDormancyFrozenLearningDays: 9,
  mainDormancyRecoveryMode: "RESUME_MAIN",
  finalRankingActive: false,
});

Promise.all([
  cycle.validate(),
  state.validate(),
  new ArenaOutboxEvent({
    eventType: "MainDormancyStarted",
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
    assert.ok(dormancySource.includes('currentCompetitiveDivision: "MAIN"'));
    assert.ok(dormancySource.includes('state: "MAIN_DORMANT"'));
    assert.ok(dormancySource.includes('mainDormancyRecoveryMode: "SUB_STANDARD_FLOW"'));
    assert.ok(dailySource.includes("initializeMainInactivityWindows"));
    assert.ok(dailySource.includes("processMainDormancyTransitions"));
    assert.ok(mainSettlement.includes("recordSettledMainMatchActivities"));
    assert.ok(revengeSettlement.includes("recordSettledMainMatchActivities"));
    assert.ok(weeklyMock.includes("WEEKLY_OFFICIAL_MOCK"));
    assert.ok(!dormancySource.includes("LONG_DORMANCY_DAYS"));
    assert.ok(!dormancySource.includes("dormancySourceLastLoginAt:"));
    console.log(
      "Main Division 전용 20일 공식 경기·주간 공식 모의고사 미활동 휴면 경로 검증 완료"
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
