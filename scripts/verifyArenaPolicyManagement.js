const assert = require("assert/strict");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const {
  MainDivisionPolicyVersion,
  SubscriptionPolicyVersion,
} = require("../models/goatArenaModel");
const {
  hasMaterialRenewalChange,
  mainPolicySnapshot,
  minimumMainStakeDaysForTierGap,
  normalizeMainPolicyDraftInput,
  normalizePolicyDraftInput,
  planPolicyActivation,
  policySnapshot,
  validatePaybackBands,
} = require("../services/arenaPolicyService");

async function run() {
  const root = path.resolve(__dirname, "..");
  const normalized = normalizePolicyDraftInput({
    displayName: "첫 달 무료 운영 정책",
    effectiveFrom: "2026-08-01T00:00",
    priceAmount: "0",
    initialLearningDays: "29",
    initialPaybackScoreDays: "29",
    paymentDayCutoffKst: "20:00",
    renewalGraceHours: "72",
    lateRenewalTierPenalty: "1",
    normalStakeDays: "1",
    revengeStakeDays: "2",
    minimumStreakDays: "29",
    minimumPaidNormalAttacks: "2",
    minimumScoreDays: "30",
    bandMinScores: ["0", "30", "35", "40"],
    bandMaxScores: ["29", "34", "39", ""],
    bandRates: ["0", "50", "80", "100"],
    packagePurchaseRequiresZeroBalance: ["false", "true"],
    packagePurchaseRequiresZeroLockedBalance: ["false", "true"],
  });

  assert.equal(normalized.priceAmount, 0);
  assert.equal(
    normalized.effectiveFrom.toISOString(),
    "2026-07-31T15:00:00.000Z"
  );
  assert.equal(normalized.matchStakeDays.normal, 1);
  assert.equal(normalized.matchStakeDays.revenge, 2);
  assert.equal(normalized.payback.bands[3].maxScoreDays, null);
  assert.equal(normalized.packagePurchaseRequiresZeroBalance, true);
  assert.deepEqual(
    normalizePolicyDraftInput({
      ...normalized,
      displayName: "Sub 고정 경기 일수 검증",
      effectiveFrom: "2026-08-02T00:00",
      normalStakeDays: "9",
      revengeStakeDays: "9",
    }).matchStakeDays,
    { normal: 1, revenge: 2 }
  );

  const normalizedMain = normalizeMainPolicyDraftInput({
    displayName: "Main Division 정식 운영 정책",
    effectiveFrom: "2026-08-03T00:00",
    maximumTargetTierGap: "3",
    mainTierGaps: ["1", "2", "3"],
    mainMinimumStakeDays: ["1", "2", "3"],
    mainEntryBonusDays: "2",
    mainCarryoverBaseDays: "29",
    invitationCancellationFeeDays: "1",
    repeatOpponentExclusionDays: "7",
    maximumActiveInvitationReservationsPerTargetTier: "1",
    invitationOfferBatchSize: "",
    revengeStakeMultiplier: "2",
    revengeFeeDays: "1",
  });
  assert.deepEqual(
    normalizedMain.stakeDaysByTierGap,
    [
      { tierGap: 1, stakeDays: 1 },
      { tierGap: 2, stakeDays: 2 },
      { tierGap: 3, stakeDays: 3 },
    ]
  );
  assert.equal(normalizedMain.invitationOfferBatchSize, null);
  assert.equal(normalizedMain.revengeStakeMultiplier, 2);
  assert.equal(normalizedMain.manualInvitationCancellationFeeDays, 0);
  assert.equal(normalizedMain.repeatOpponentExclusionDays, 7);
  assert.equal(
    normalizedMain.maximumActiveInvitationReservationsPerTargetTier,
    1
  );

  const mainPolicy = new MainDivisionPolicyVersion({
    code: "MAIN-20260803-TEST",
    status: "ACTIVE",
    ...normalizedMain,
  });
  await assert.doesNotReject(() => mainPolicy.validate());
  const mainSnapshot = mainPolicySnapshot(mainPolicy);
  assert.equal(mainSnapshot.manualInvitationCancellationAllowed, true);
  assert.equal(mainSnapshot.manualInvitationCancellationFeeDays, 0);
  assert.equal(
    minimumMainStakeDaysForTierGap(mainSnapshot, 3),
    3
  );
  assert.throws(
    () => minimumMainStakeDaysForTierGap(mainSnapshot, 4),
    /최대 티어 차이/
  );

  assert.throws(
    () =>
      validatePaybackBands([
        { minScoreDays: 0, maxScoreDays: 29, ratePercent: 0 },
        { minScoreDays: 31, maxScoreDays: null, ratePercent: 50 },
      ]),
    /빈틈이나 중복/
  );
  assert.throws(
    () =>
      normalizePolicyDraftInput({
        ...normalized,
        displayName: "오류 정책",
        effectiveFrom: "2026-08-01T00:00",
        paymentDayCutoffKst: "25:00",
      }),
    /첫날 차감 기준 시각/
  );

  const policy = new SubscriptionPolicyVersion({
    code: "ARENA-20260801-TEST",
    displayName: normalized.displayName,
    status: "DRAFT",
    effectiveFrom: normalized.effectiveFrom,
    priceAmount: normalized.priceAmount,
    initialLearningDays: normalized.initialLearningDays,
    initialPaybackScoreDays: normalized.initialPaybackScoreDays,
    paymentDayCutoffKst: normalized.paymentDayCutoffKst,
    renewalGraceHours: normalized.renewalGraceHours,
    lateRenewalTierPenalty: normalized.lateRenewalTierPenalty,
    matchStakeDays: normalized.matchStakeDays,
    payback: normalized.payback,
  });
  await assert.doesNotReject(() => policy.validate());

  const snapshot = policySnapshot(policy);
  policy.priceAmount = 29000;
  policy.payback.bands[1].ratePercent = 40;
  assert.equal(snapshot.priceAmount, 0);
  assert.equal(snapshot.payback.bands[1].ratePercent, 50);
  assert.equal(snapshot.matchStakeDays.normal, 1);
  assert.equal(
    hasMaterialRenewalChange(snapshot, policy),
    true
  );

  const previousId = new mongoose.Types.ObjectId();
  const candidateId = new mongoose.Types.ObjectId();
  const nextId = new mongoose.Types.ObjectId();
  const plan = planPolicyActivation({
    candidate: {
      _id: candidateId,
      effectiveFrom: new Date("2026-09-01T00:00:00+09:00"),
    },
    activePolicies: [
      {
        _id: previousId,
        effectiveFrom: new Date("2026-08-01T00:00:00+09:00"),
        effectiveUntil: null,
      },
      {
        _id: nextId,
        effectiveFrom: new Date("2026-10-01T00:00:00+09:00"),
        effectiveUntil: null,
      },
    ],
  });
  assert.equal(String(plan.previousPolicyId), String(previousId));
  assert.equal(plan.closePrevious, true);
  assert.equal(String(plan.nextPolicyId), String(nextId));
  assert.equal(
    new Date(plan.candidateEffectiveUntil).toISOString(),
    "2026-09-30T15:00:00.000Z"
  );

  assert.throws(
    () =>
      planPolicyActivation({
        candidate: {
          _id: candidateId,
          effectiveFrom: new Date("2026-08-01T00:00:00+09:00"),
        },
        activePolicies: [
          {
            _id: previousId,
            effectiveFrom: new Date("2026-08-01T00:00:00+09:00"),
          },
        ],
      }),
    /같은 적용 시각/
  );

  const invalidWindow = new SubscriptionPolicyVersion({
    code: "ARENA-INVALID-WINDOW",
    displayName: "잘못된 적용 구간",
    status: "DRAFT",
    effectiveFrom: new Date("2026-09-01T00:00:00+09:00"),
    effectiveUntil: new Date("2026-08-01T00:00:00+09:00"),
    priceAmount: 0,
  });
  await assert.rejects(
    () => invalidWindow.validate(),
    /정책 종료 시각은 적용 시작 시각보다 뒤여야/
  );

  const routeSource = fs.readFileSync(
    path.join(root, "routes/matths-routes.js"),
    "utf8"
  );
  const controllerSource = fs.readFileSync(
    path.join(root, "controllers/matthsController.js"),
    "utf8"
  );
  const navigationSource = fs.readFileSync(
    path.join(root, "views/partials/admin-navigation.ejs"),
    "utf8"
  );
  for (const route of [
    '"/admin/arena-policies"',
    '"/admin/arena-policies/sub"',
    '"/admin/arena-policies/main"',
    '"/admin/arena-policies/main/:policyId/activate"',
    '"/admin/arena-policies/main/:policyId/retire"',
  ]) {
    assert.ok(routeSource.includes(route), `${route} 관리자 라우트가 없습니다.`);
  }
  for (const handler of [
    "adminArenaPoliciesPage",
    "adminCreateArenaPolicy",
    "adminCreateMainArenaPolicy",
    "adminActivateArenaPolicy",
    "adminActivateMainArenaPolicy",
    "adminRetireArenaPolicy",
    "adminRetireMainArenaPolicy",
  ]) {
    assert.ok(controllerSource.includes(handler), `${handler} 처리기가 없습니다.`);
  }
  assert.ok(
    navigationSource.includes('label: "GOAT Arena"') &&
      navigationSource.includes('label: "정책·상품"'),
    "관리자 메뉴에 Arena 정책 화면이 없습니다."
  );

  console.log(
    "Sub·Main Arena 정책 작성·구간 검증·예약 활성화·런타임 스냅샷 검증 완료"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
