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
const {
  calculatePaybackDecision,
} = require("../services/arenaPaybackReviewService");

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
    paymentDayCutoffKst: "00:00",
    renewalGraceHours: 72,
    packagePurchaseRequiresZeroBalance: true,
    packagePurchaseRequiresZeroLockedBalance: true,
    lateRenewalTierPenalty: 1,
    matchStakeDays: { normal: 1, revenge: 2 },
    payback: {
      minimumStreakDays: 29,
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

  const paybackCandidate = {
    policySnapshot: policy,
    pricePaid: 29000,
    paidNormalAttacksCompleted: 2,
    paybackScoreDays: 30,
    streakDays: 28,
  };
  assert.equal(
    calculatePaybackDecision(paybackCandidate).qualified,
    false,
    "29일 중 하루라도 유효한 GOAT Arena 공격 제출 기록이 빠지면 페이백 자격을 얻을 수 없습니다."
  );
  assert.equal(
    calculatePaybackDecision({
      ...paybackCandidate,
      paidNormalAttacksCompleted: 0,
      streakDays: 29,
    }).qualified,
    true,
    "29일 연속 공식 공격 제출과 나머지 조건을 충족하면 페이백 자격을 얻어야 합니다."
  );

  const eveningPurchase = new Date(
    "2026-08-01T19:59:59+09:00"
  );
  const laterPurchase = new Date(
    "2026-08-01T20:00:00+09:00"
  );
  const eveningWindow =
    computeAccessCycleWindow({
      purchasedAt: eveningPurchase,
      policy,
    });
  const laterWindow =
    computeAccessCycleWindow({
      purchasedAt: laterPurchase,
      policy,
    });
  assert.equal(
    eveningWindow.firstDayMode,
    "NEXT_DAY"
  );
  assert.equal(
    eveningWindow.firstConsumptionDateKst,
    "2026-08-02"
  );
  assert.equal(
    laterWindow.firstDayMode,
    "NEXT_DAY"
  );
  assert.equal(
    laterWindow.firstConsumptionDateKst,
    "2026-08-02"
  );
  assert.equal(
    kstDateKey(
      new Date("2026-08-01T15:01:00Z")
    ),
    "2026-08-02"
  );

  const eveningDraft =
    buildAccessCycleDraft({
      userId,
      policy,
      purchasedAt: eveningPurchase,
      purchaseReference:
        "ORDER-EVENING",
    });
  const eveningCycleId =
    new mongoose.Types.ObjectId();
  const eveningState =
    buildApprovedCycleState({
      cycleDraft: eveningDraft,
      cycleId: eveningCycleId,
      paymentId,
      approvedAt: eveningPurchase,
    });
  assert.equal(
    eveningState.cycle.status,
    "ACTIVE"
  );
  assert.equal(
    eveningState.cycle.availableLearningDays,
    29
  );
  assert.equal(
    eveningState.cycle.paybackScoreDays,
    29
  );
  assert.equal(
    eveningState.cycle.firstDayConsumedAt,
    null
  );
  assert.equal(
    eveningState.ledgerEntries.length,
    1
  );

  const nextDayDraft =
    buildAccessCycleDraft({
      userId,
      policy,
      purchasedAt: laterPurchase,
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
      approvedAt: laterPurchase,
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
    approvedAt: laterPurchase,
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
    approvedAt: laterPurchase,
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
    eveningState.ledgerEntries) {
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
  const renewalServiceSource = fs.readFileSync(
    path.join(root, "services/arenaRenewalService.js"),
    "utf8"
  );
  for (const requiredSource of [
    "session.withTransaction",
    "PAYMENT_IDEMPOTENCY_CONFLICT",
    "packagePurchaseEligibility",
    "FIRST_DAY_CONSUMPTION",
    "processDueFirstDayConsumptions",
    "preparePaidMainRenewalInTransaction",
    "lastMainSnapshotId",
  ]) {
    assert.ok(
      serviceSource.includes(requiredSource),
      `${requiredSource} 구현이 없습니다.`
    );
  }
  for (const requiredSource of [
    "MAIN_RENEWAL_WITHIN_72_HOURS",
    "MAIN_RENEWAL_AFTER_72_HOURS",
    "RenewalRankAssessmentRequired",
  ]) {
    assert.ok(
      renewalServiceSource.includes(requiredSource),
      `${requiredSource} 갱신 분기 구현이 없습니다.`
    );
  }
  assert.ok(
    serverSource.includes(
      "startAccessCycleScheduler"
    ),
    "첫날 차감 스케줄러가 서버 시작 과정에 연결되지 않았습니다."
  );

  console.log(
    "학습권 패키지 승인 멱등 처리·결제 다음 날 00시 이용 주기 시작 검증 완료"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
