const assert = require("assert/strict");
const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");
const {
  ArenaOpponentSelectionAudit,
  ArenaRevengeRight,
  MainDivisionPolicyVersion,
  MainInvitationOffer,
  MainInvitationRequest,
} = require("../models/goatArenaModel");
const {
  compareArenaAttemptScores,
} = require("../services/arenaMatchScoringService");
const {
  assertMainStakeSelection,
  buildRevengeEconomySnapshot,
  calculateInvitationCancellation,
  invitationMatchingPaused,
  isRecentOpponentExcluded,
  officialMatchStartDeadline,
  revengeCompletionDeadline,
  resolveInvitationOfferCount,
  resolveRevengeSettlement,
} = require("../services/arenaDivisionRuleService");

async function run() {
  const root = path.resolve(__dirname, "..");
  const mainPolicy = new MainDivisionPolicyVersion({
    code: "MAIN-RULE-FOUNDATION-V1",
    displayName: "Main Division 기반 정책",
    status: "ACTIVE",
    effectiveFrom: new Date("2026-08-01T00:00:00+09:00"),
    stakeDaysByTierGap: [
      { tierGap: 1, stakeDays: 1 },
      { tierGap: 2, stakeDays: 2 },
      { tierGap: 3, stakeDays: 3 },
    ],
    maximumTargetTierGap: 3,
    revengeStakeMultiplier: 2,
    revengeFeeDays: 1,
  });
  await assert.doesNotReject(() => mainPolicy.validate());

  const requesterUserId = new mongoose.Types.ObjectId();
  const opponentUserId = new mongoose.Types.ObjectId();
  const invitationRequestId = new mongoose.Types.ObjectId();
  const selectionAudit = new ArenaOpponentSelectionAudit({
    requestId: "MAIN:INVITE:FOUNDATION:TEST",
    division: "MAIN",
    selectionType: "MAIN_LOWER_INVITATION_BATCH",
    requesterUserId,
    targetTier: "GOLD",
    candidateUserIds: [opponentUserId],
    selectedUserIds: [opponentUserId],
    candidatePoolHash: "a".repeat(64),
    randomSelectionSeed: "b".repeat(48),
    policyVersionCode: mainPolicy.code,
  });
  await assert.doesNotReject(() => selectionAudit.validate());
  const invitationOffer = new MainInvitationOffer({
    invitationRequestId,
    candidateUserId: opponentUserId,
    selectionAuditId: selectionAudit._id,
  });
  await assert.doesNotReject(() => invitationOffer.validate());
  const invitationRequest = new MainInvitationRequest({
    requestId: "MAIN:INVITE:RESERVATION:TEST",
    initiatorUserId: requesterUserId,
    initiatorStandingId: new mongoose.Types.ObjectId(),
    initiatorArenaTier: "CHALLENGER",
    targetTier: "BRONZE",
    stakeDays: 3,
    policyVersionId: mainPolicy._id,
    policyVersionCode: mainPolicy.code,
    reservedLearningDays: 3,
  });
  await assert.doesNotReject(() => invitationRequest.validate());
  assert.equal(
    invitationRequest.activeReservationKey,
    `${requesterUserId}:BRONZE`
  );
  const revengeRight = new ArenaRevengeRight({
    sourceMatchId: new mongoose.Types.ObjectId(),
    division: "MAIN",
    eligibleUserId: requesterUserId,
    opponentUserId,
    originalStakeDays: 3,
    revengeStakeDays: 6,
    feeDays: 1,
    policyVersionCode: mainPolicy.code,
  });
  await assert.doesNotReject(() => revengeRight.validate());
  assert.ok(
    MainInvitationOffer.schema.indexes().some(
      ([fields, options]) =>
        fields.invitationRequestId === 1 &&
        fields.status === 1 &&
        options.unique === true &&
        options.partialFilterExpression?.status === "ACCEPTED"
    ),
    "Main 초대는 한 요청에서 첫 수락자 한 명만 확정하도록 고유 인덱스가 필요합니다."
  );
  assert.ok(
    MainInvitationRequest.schema.indexes().some(
      ([fields, options]) =>
        fields.activeReservationKey === 1 &&
        options.unique === true
    ),
    "Main 초대는 생성자·목표 티어별 활성 예약 하나를 DB에서도 보장해야 합니다."
  );

  assert.deepEqual(
    assertMainStakeSelection({
      policy: mainPolicy,
      tierGap: 2,
      stakeDays: 4,
      availableLearningDays: 8,
    }),
    { tierGap: 2, minimumStakeDays: 2, stakeDays: 4 }
  );
  assert.throws(
    () =>
      assertMainStakeSelection({
        policy: mainPolicy,
        tierGap: 4,
        stakeDays: 4,
        availableLearningDays: 8,
      }),
    /최대 티어 차이/
  );
  assert.throws(
    () =>
      assertMainStakeSelection({
        policy: mainPolicy,
        tierGap: 3,
        stakeDays: 3,
        availableLearningDays: 3,
      }),
    /남아야/
  );

  assert.deepEqual(
    buildRevengeEconomySnapshot({
      division: "SUB",
      originalStakeDays: 1,
    }),
    {
      division: "SUB",
      originalStakeDays: 1,
      revengeStakeMultiplier: 2,
      revengeStakeDays: 2,
      feeDays: 1,
      recipientNoShowReturnDays: 1,
      recipientNoShowBurnDays: 1,
    }
  );
  assert.deepEqual(
    buildRevengeEconomySnapshot({
      division: "MAIN",
      originalStakeDays: 3,
      mainPolicy,
    }),
    {
      division: "MAIN",
      originalStakeDays: 3,
      revengeStakeMultiplier: 2,
      revengeStakeDays: 6,
      feeDays: 1,
      recipientNoShowReturnDays: 5,
      recipientNoShowBurnDays: 1,
    }
  );
  assert.deepEqual(
    calculateInvitationCancellation({
      reservedLearningDays: 3,
      cancellationFeeDays: 1,
    }),
    {
      releasedLearningDays: 2,
      burnedLearningDays: 1,
      shouldDemoteToSub: false,
    }
  );
  assert.equal(
    calculateInvitationCancellation({
      reservedLearningDays: 1,
      cancellationFeeDays: 1,
    }).shouldDemoteToSub,
    true
  );
  assert.deepEqual(
    calculateInvitationCancellation({
      reservedLearningDays: 3,
      cancellationType: "MANUAL",
      cancellationFeeDays: 1,
      manualCancellationFeeDays: 0,
    }),
    {
      releasedLearningDays: 3,
      burnedLearningDays: 0,
      shouldDemoteToSub: false,
    }
  );
  assert.equal(
    isRecentOpponentExcluded({
      lastMatchedAt: new Date("2026-07-27T12:00:00+09:00"),
      now: new Date("2026-08-02T12:00:00+09:00"),
      exclusionDays: 7,
    }),
    true
  );
  assert.equal(
    isRecentOpponentExcluded({
      lastMatchedAt: new Date("2026-07-25T11:59:59+09:00"),
      now: new Date("2026-08-02T12:00:00+09:00"),
      exclusionDays: 7,
    }),
    false
  );
  assert.deepEqual(
    resolveRevengeSettlement({
      division: "SUB",
      outcome: "DEFENDER_WIN",
      revengeStakeDays: 2,
    }),
    {
      division: "SUB",
      outcome: "DEFENDER_WIN",
      revengeStakeDays: 2,
      tupleAction: "KEEP",
      returnToAttackerDays: 0,
      transferToDefenderDays: 1,
      burnDays: 1,
    }
  );
  assert.deepEqual(
    resolveRevengeSettlement({
      division: "SUB",
      outcome: "BOTH_NO_SHOW",
      revengeStakeDays: 2,
      feeDays: 1,
    }),
    {
      division: "SUB",
      outcome: "BOTH_NO_SHOW",
      revengeStakeDays: 2,
      tupleAction: "KEEP",
      returnToAttackerDays: 0,
      transferToDefenderDays: 0,
      burnDays: 2,
    }
  );
  assert.deepEqual(
    resolveRevengeSettlement({
      division: "MAIN",
      outcome: "DEFENDER_NO_SHOW",
      revengeStakeDays: 6,
      feeDays: 1,
    }),
    {
      division: "MAIN",
      outcome: "DEFENDER_NO_SHOW",
      revengeStakeDays: 6,
      tupleAction: "SWAP",
      returnToAttackerDays: 5,
      transferToDefenderDays: 0,
      burnDays: 1,
    }
  );
  assert.deepEqual(
    resolveRevengeSettlement({
      division: "MAIN",
      outcome: "BOTH_NO_SHOW",
      revengeStakeDays: 6,
      feeDays: 1,
    }).burnDays,
    6
  );
  assert.equal(
    resolveInvitationOfferCount({
      eligibleCandidateCount: 12,
      invitationOfferBatchSize: null,
    }),
    12
  );

  const sunday1429 = new Date("2026-08-02T14:29:00+09:00");
  const sunday1430 = new Date("2026-08-02T14:30:00+09:00");
  assert.equal(invitationMatchingPaused(sunday1429), false);
  assert.equal(invitationMatchingPaused(sunday1430), true);
  assert.equal(
    officialMatchStartDeadline({
      now: new Date("2026-08-01T20:00:00+09:00"),
      division: "MAIN",
    }).toISOString(),
    sunday1430.toISOString()
  );
  assert.equal(
    revengeCompletionDeadline({
      now: new Date("2026-08-01T20:00:00+09:00"),
      division: "MAIN",
    }).toISOString(),
    sunday1430.toISOString()
  );

  const base = {
    score: 80,
    correctCount: 4,
    correctAnswerSolveTimeMs: 300000,
    totalSolveTimeMs: 500000,
  };
  assert.equal(
    compareArenaAttemptScores(base, base),
    "DEFENDER"
  );

  const routeSource = fs.readFileSync(
    path.join(root, "routes/goat-arena-routes.js"),
    "utf8"
  );
  const controllerSource = fs.readFileSync(
    path.join(root, "controllers/goatArenaController.js"),
    "utf8"
  );
  const featureViewSource = fs.readFileSync(
    path.join(root, "views/goat-arena-feature.ejs"),
    "utf8"
  );
  assert.ok(
    routeSource.includes(
      '"/goat-arena/:division/features/:featureKey"'
    ) &&
      controllerSource.includes("divisionFeaturePage") &&
      featureViewSource.includes("hasDivisionAccess"),
    "Division 기능별 로그인 보호 페이지 골격이 필요합니다."
  );
  assert.equal(
    compareArenaAttemptScores(
      { ...base, correctAnswerSolveTimeMs: 299999 },
      base
    ),
    "CHALLENGER"
  );
  assert.equal(
    compareArenaAttemptScores(
      { ...base, correctAnswerSolveTimeMs: null },
      base
    ),
    "DEFENDER"
  );

  console.log(
    "Sub·Main 예치·복수전·초대 취소·일요일 마감·승패 우선순위 기반 검증 완료"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
