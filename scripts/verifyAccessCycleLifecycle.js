const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaLearningDayLedger,
  ArenaPackagePayment,
} = require("../models/goatArenaModel");
const {
  buildAccessCycleDraft,
  buildApprovedCycleState,
  computeAccessCycleWindow,
  normalizePaymentApproval,
  _testing: {
    assertPolicyPaymentMatches,
    kstDateKey,
  },
} = require("../services/accessCycleService");

async function run() {
  const root = path.resolve(__dirname, "..");
  const userId = new mongoose.Types.ObjectId();
  const policyId = new mongoose.Types.ObjectId();
  const paymentId = new mongoose.Types.ObjectId();
  const policy = {
    _id: policyId,
    code: "ARENA-ACCESS-CYCLE-TEST",
    displayName: "학습권 패키지 검증 정책",
    status: "ACTIVE",
    currency: "KRW",
    priceAmount: 29000,
    timezone: "Asia/Seoul",
    initialLearningDays: 29,
    initialPaybackScoreDays: 29,
    paymentDayCutoffKst: "20:00",
    renewalGraceHours: 72,
    packagePurchaseRequiresZeroBalance: true,
    packagePurchaseRequiresZeroLockedBalance: true,
    lateRenewalTierPenalty: 1,
    matchStakeDays: { normal: 1, revenge: 2 },
    payback: {
      minimumStreakDays: 30,
      minimumPaidNormalAttacks: 2,
      minimumScoreDays: 30,
      bands: [
        {
          minScoreDays: 0,
          maxScoreDays: 29,
          ratePercent: 0,
        },
        {
          minScoreDays: 30,
          maxScoreDays: null,
          ratePercent: 100,
        },
      ],
    },
  };

  const beforeCutoff = new Date(
    "2026-08-01T19:59:59+09:00"
  );
  const atCutoff = new Date(
    "2026-08-01T20:00:00+09:00"
  );
  const beforeWindow =
    computeAccessCycleWindow({
      purchasedAt: beforeCutoff,
      policy,
    });
  const cutoffWindow =
    computeAccessCycleWindow({
      purchasedAt: atCutoff,
      policy,
    });
  assert.equal(
    beforeWindow.firstDayMode,
    "SAME_DAY"
  );
  assert.equal(
    beforeWindow.firstConsumptionDateKst,
    "2026-08-01"
  );
  assert.equal(
    cutoffWindow.firstDayMode,
    "NEXT_DAY"
  );
  assert.equal(
    cutoffWindow.firstConsumptionDateKst,
    "2026-08-02"
  );
  assert.equal(
    kstDateKey(
      new Date("2026-08-01T15:01:00Z")
    ),
    "2026-08-02"
  );

  const sameDayDraft =
    buildAccessCycleDraft({
      userId,
      policy,
      purchasedAt: beforeCutoff,
      purchaseReference:
        "ORDER-BEFORE-CUTOFF",
    });
  const sameDayCycleId =
    new mongoose.Types.ObjectId();
  const sameDayState =
    buildApprovedCycleState({
      cycleDraft: sameDayDraft,
      cycleId: sameDayCycleId,
      paymentId,
      approvedAt: beforeCutoff,
    });
  assert.equal(
    sameDayState.cycle.status,
    "ACTIVE"
  );
  assert.equal(
    sameDayState.cycle.availableLearningDays,
    28
  );
  assert.equal(
    sameDayState.cycle.paybackScoreDays,
    29
  );
  assert.equal(
    sameDayState.ledgerEntries.length,
    2
  );
  assert.deepEqual(
    sameDayState.ledgerEntries.map(
      (entry) => entry.eventType
    ),
    [
      "PURCHASE_GRANTED",
      "FIRST_DAY_CONSUMPTION",
    ]
  );
  assert.equal(
    sameDayState.ledgerEntries[1]
      .idempotencyKey,
    `${sameDayCycleId}:2026-08-01:FIRST_DAY_CONSUMPTION`
  );

  const nextDayDraft =
    buildAccessCycleDraft({
      userId,
      policy,
      purchasedAt: atCutoff,
      purchaseReference:
        "ORDER-AT-CUTOFF",
    });
  const nextDayState =
    buildApprovedCycleState({
      cycleDraft: nextDayDraft,
      cycleId:
        new mongoose.Types.ObjectId(),
      paymentId:
        new mongoose.Types.ObjectId(),
      approvedAt: atCutoff,
    });
  assert.equal(
    nextDayState.cycle.availableLearningDays,
    29
  );
  assert.equal(
    nextDayState.cycle.firstDayConsumedAt,
    null
  );
  assert.equal(
    nextDayState.ledgerEntries.length,
    1
  );

  const approval = normalizePaymentApproval({
    userId,
    provider: "test-provider",
    providerPaymentKey:
      "PAYMENT-KEY-001",
    orderReference: "ORDER-001",
    idempotencyKey:
      "PAYMENT-WEBHOOK-001",
    currency: "krw",
    approvedAmount: 29000,
    approvedAt: atCutoff,
  });
  assert.equal(
    approval.provider,
    "TEST-PROVIDER"
  );
  assert.equal(approval.currency, "KRW");
  assert.doesNotThrow(() =>
    assertPolicyPaymentMatches(
      approval,
      policy
    )
  );
  assert.throws(
    () =>
      assertPolicyPaymentMatches(
        {
          ...approval,
          approvedAmount: 28000,
        },
        policy
      ),
    /결제 금액/
  );
  assert.throws(
    () =>
      normalizePaymentApproval({
        ...approval,
        approvedAt: "invalid",
      }),
    /승인 시각/
  );

  const payment = new ArenaPackagePayment({
    userId,
    provider: "test-provider",
    providerPaymentKey:
      "PAYMENT-MODEL-001",
    orderReference:
      "ORDER-MODEL-001",
    idempotencyKey:
      "IDEMPOTENCY-MODEL-001",
    status: "APPLIED",
    approvedAt: atCutoff,
    currency: "krw",
    approvedAmount: 29000,
    policyVersionId: policyId,
    policyVersionCode: policy.code,
    accessCycleId:
      nextDayState.cycle._id,
    processedAt: new Date(),
  });
  await assert.doesNotReject(() =>
    payment.validate()
  );
  assert.equal(payment.provider, "TEST-PROVIDER");
  assert.equal(payment.currency, "KRW");

  const cycle = new AccessCycle(
    nextDayState.cycle
  );
  await assert.doesNotReject(() =>
    cycle.validate()
  );
  for (const entry of
    sameDayState.ledgerEntries) {
    await assert.doesNotReject(() =>
      new ArenaLearningDayLedger(
        entry
      ).validate()
    );
  }

  const serviceSource = fs.readFileSync(
    path.join(
      root,
      "services/accessCycleService.js"
    ),
    "utf8"
  );
  const serverSource = fs.readFileSync(
    path.join(root, "server.js"),
    "utf8"
  );
  for (const requiredSource of [
    "session.withTransaction",
    "PAYMENT_IDEMPOTENCY_CONFLICT",
    "packagePurchaseEligibility",
    "FIRST_DAY_CONSUMPTION",
    "processDueFirstDayConsumptions",
    "MAIN_RENEWAL_WORKFLOW_REQUIRED",
    "lastMainSnapshotId",
  ]) {
    assert.ok(
      serviceSource.includes(requiredSource),
      `${requiredSource} 구현이 없습니다.`
    );
  }
  assert.ok(
    serverSource.includes(
      "startAccessCycleScheduler"
    ),
    "첫날 차감 스케줄러가 서버 시작 과정에 연결되지 않았습니다."
  );

  console.log(
    "학습권 패키지 승인 멱등 처리·이용 주기 생성·20시 첫날 차감 검증 완료"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
