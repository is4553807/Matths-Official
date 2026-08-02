const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaLearningDayLedger,
  ArenaSnapshot,
} = require("../models/goatArenaModel");
const {
  buildDailyConsumptionPlan,
  buildDailyLedgerEntries,
  buildExpiredAccessStateUpdate,
  _testing: {
    percentileFromPosition,
  },
} = require("../services/accessCycleDailyService");

async function run() {
  const root = path.resolve(__dirname, "..");
  const userId = new mongoose.Types.ObjectId();
  const cycleId = new mongoose.Types.ObjectId();
  const policyId = new mongoose.Types.ObjectId();
  const snapshotId = new mongoose.Types.ObjectId();
  const processedAt = new Date(
    "2026-08-04T00:00:30+09:00"
  );
  const cycle = {
    _id: cycleId,
    userId,
    division: "SUB",
    status: "ACTIVE",
    policyVersionId: policyId,
    policyVersionCode:
      "ARENA-DAILY-CYCLE-TEST",
    policySnapshot: {
      initialLearningDays: 29,
      initialPaybackScoreDays: 29,
      renewalGraceHours: 72,
    },
    currency: "KRW",
    pricePaid: 29000,
    paidAt: new Date(
      "2026-08-01T19:00:00+09:00"
    ),
    startsAt: new Date(
      "2026-08-01T19:00:00+09:00"
    ),
    baseExpiresAt: new Date(
      "2026-08-30T00:00:00+09:00"
    ),
    expiresAt: new Date(
      "2026-08-30T00:00:00+09:00"
    ),
    evaluationAt: new Date(
      "2026-08-31T00:00:00+09:00"
    ),
    availableLearningDays: 28,
    paybackScoreDays: 29,
    lockedLearningDays: 0,
    firstConsumptionDateKst:
      "2026-08-01",
    firstDayMode: "SAME_DAY",
    firstDayConsumedAt: new Date(
      "2026-08-01T19:00:00+09:00"
    ),
    lastConsumptionDateKst:
      "2026-08-01",
  };

  const catchupPlan =
    buildDailyConsumptionPlan({
      cycle,
      throughDateKst: "2026-08-04",
    });
  assert.deepEqual(
    catchupPlan.consumptionDates,
    [
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]
  );
  assert.equal(
    catchupPlan.availableAfter,
    25
  );
  assert.equal(
    catchupPlan.depletedAt,
    null
  );

  const ledgerEntries =
    buildDailyLedgerEntries({
      cycle,
      plan: catchupPlan,
      processedAt,
    });
  assert.equal(ledgerEntries.length, 3);
  assert.deepEqual(
    ledgerEntries.map(
      (entry) =>
        entry.balanceAfter
          .availableLearningDays
    ),
    [27, 26, 25]
  );
  assert.ok(
    ledgerEntries.every(
      (entry) =>
        entry.paybackScoreDaysDelta === 0 &&
        entry.balanceAfter
          .paybackScoreDays === 29
    )
  );
  assert.equal(
    ledgerEntries[0].idempotencyKey,
    `${cycleId}:2026-08-02:DAILY_ACCESS_CONSUMPTION`
  );

  const depletionPlan =
    buildDailyConsumptionPlan({
      cycle: {
        ...cycle,
        availableLearningDays: 2,
      },
      throughDateKst: "2026-08-10",
    });
  assert.deepEqual(
    depletionPlan.consumptionDates,
    ["2026-08-02", "2026-08-03"]
  );
  assert.equal(
    depletionPlan.availableAfter,
    0
  );
  assert.equal(
    depletionPlan.depletedAt.toISOString(),
    "2026-08-02T15:00:00.000Z"
  );

  const expiredAt = new Date(
    "2026-08-03T00:00:00+09:00"
  );
  const mainExpiration =
    buildExpiredAccessStateUpdate({
      cycle,
      accessState: {
        currentCompetitiveDivision:
          "MAIN",
      },
      expiredAt,
      snapshotId,
    });
  assert.equal(mainExpiration.wasMain, true);
  assert.equal(
    mainExpiration.accessUpdate
      .currentCompetitiveDivision,
    "SUB"
  );
  assert.equal(
    mainExpiration.accessUpdate.state,
    "SUB_ACCESS_EXPIRED_LOCKED"
  );
  assert.equal(
    mainExpiration.accessUpdate
      .mainAchievementStatus,
    "ACHIEVED"
  );
  assert.equal(
    mainExpiration.renewalGraceDeadline
      .toISOString(),
    "2026-08-05T15:00:00.000Z"
  );
  assert.equal(
    String(
      mainExpiration.accessUpdate
        .lastMainSnapshotId
    ),
    String(snapshotId)
  );
  assert.equal(
    mainExpiration.accessUpdate
      .finalRankingActive,
    false
  );

  const subExpiration =
    buildExpiredAccessStateUpdate({
      cycle,
      accessState: {
        currentCompetitiveDivision:
          "SUB",
      },
      expiredAt,
    });
  assert.equal(subExpiration.wasMain, false);
  assert.equal(
    subExpiration.renewalGraceDeadline,
    null
  );
  assert.throws(
    () =>
      buildExpiredAccessStateUpdate({
        cycle,
        accessState: {
          currentCompetitiveDivision:
            "MAIN",
        },
        expiredAt,
      }),
    /강등 스냅샷/
  );
  assert.equal(
    percentileFromPosition({
      position: 1,
      participantCount: 100,
    }),
    1
  );
  assert.equal(
    percentileFromPosition({
      position: 100,
      participantCount: 100,
    }),
    0.01
  );

  const cycleDocument = new AccessCycle({
    ...cycle,
    availableLearningDays: 25,
    lastConsumptionDateKst:
      catchupPlan.lastConsumptionDateKst,
  });
  await assert.doesNotReject(() =>
    cycleDocument.validate()
  );
  for (const entry of ledgerEntries) {
    await assert.doesNotReject(() =>
      new ArenaLearningDayLedger(
        entry
      ).validate()
    );
  }
  const snapshot = new ArenaSnapshot({
    _id: snapshotId,
    userId,
    accessCycleId: cycleId,
    seasonKey: "2026",
    division: "MAIN",
    arenaTuple: {
      arenaRank: "마스터",
      arenaPosition: 4,
      arenaGp: 88,
    },
    participantCount: 100,
    percentile: 0.97,
    finalRating: 1750,
    snapshotReason: "MAIN_DEMOTION",
    capturedAt: expiredAt,
  });
  await assert.doesNotReject(() =>
    snapshot.validate()
  );

  const serviceSource = fs.readFileSync(
    path.join(
      root,
      "services/accessCycleDailyService.js"
    ),
    "utf8"
  );
  const privateMockSource = fs.readFileSync(
    path.join(
      root,
      "services/privateMockExamService.js"
    ),
    "utf8"
  );
  const serverSource = fs.readFileSync(
    path.join(root, "server.js"),
    "utf8"
  );
  for (const requiredSource of [
    "session.withTransaction",
    "DAILY_ACCESS_CONSUMPTION",
    "LearningDaysDepleted",
    "MainDemotedToSub",
    "AccessExpired",
    "PENDING_SETTLEMENT",
    "INACTIVE_ACCESS_EXPIRED",
  ]) {
    assert.ok(
      serviceSource.includes(requiredSource),
      `${requiredSource} 일일 만료 구현이 없습니다.`
    );
  }
  assert.ok(
    privateMockSource.includes(
      'status: "payment-required"'
    ),
    "학습권 만료자의 Matths 주간 공식 모의고사 차단이 없습니다."
  );
  assert.ok(
    privateMockSource.includes(
      "withoutExpiredArenaAttempts"
    ) &&
      privateMockSource.includes(
        'availableLearningDays: 0'
      ),
    "학습권 만료 사용자를 주간 성적·내부 실력 지표 집계에서 제외하지 않았습니다."
  );
  assert.ok(
    serverSource.includes(
      "startDailyAccessCycleScheduler"
    ),
    "일일 차감 스케줄러가 서버 시작 과정에 연결되지 않았습니다."
  );

  console.log(
    "KST 일일 차감·누락 날짜 복구·Sub 만료 잠금·Main 강등과 72시간 유예 검증 완료"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
