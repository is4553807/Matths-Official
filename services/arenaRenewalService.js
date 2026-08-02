const {
  AssessmentAttempt,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaOutboxEvent,
  ArenaStanding,
  MainToSubConversionResult,
  RenewalRankAssessment,
} = require("../models/goatArenaModel");
const {
  ARENA_TIER_CONFIG,
  arenaTierByValue,
  arenaTierIndex,
} = require("./arenaTierPolicy");
const {
  initialArenaTupleFromPlacement,
  kstSeasonKey,
  rebalanceArenaCohortInTransaction,
} = require("./arenaStandingService");

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function oneTierLowerTuple(reference) {
  const index = arenaTierIndex(reference.referenceSubRank);
  const lower = ARENA_TIER_CONFIG[Math.max(0, index - 1)];
  return {
    arenaRank: lower.label,
    arenaPosition: 1,
    arenaGp: Math.max(0, Math.min(99, Number(reference.referenceSubGp) || 0)),
  };
}

function lowerArenaTuple(left, right) {
  const leftTier = arenaTierIndex(left.arenaRank);
  const rightTier = arenaTierIndex(right.arenaRank);
  if (leftTier !== rightTier) {
    return leftTier < rightTier ? left : right;
  }
  if (Number(left.arenaGp) !== Number(right.arenaGp)) {
    return Number(left.arenaGp) < Number(right.arenaGp) ? left : right;
  }
  return left;
}

async function upsertRenewalSubStanding({
  userId,
  tuple,
  session,
  now,
  seed = {},
}) {
  const seasonKey = kstSeasonKey(now);
  const lastInTier = await ArenaStanding.findOne({
    division: "SUB",
    seasonKey,
    arenaRank: arenaTierByValue(tuple.arenaRank).label,
  })
    .sort({ arenaPosition: -1 })
    .select("arenaPosition")
    .session(session)
    .lean();
  const standing = await ArenaStanding.findOneAndUpdate(
    { userId, division: "SUB", seasonKey },
    {
      $set: {
        arenaRank: arenaTierByValue(tuple.arenaRank).label,
        arenaGp: Math.max(0, Math.min(99, Number(tuple.arenaGp) || 0)),
        status: "ACTIVE",
        reachedCurrentGpAt: now,
        ...seed,
      },
      $setOnInsert: {
        userId,
        division: "SUB",
        seasonKey,
        arenaPosition: Math.max(1, Number(lastInTier?.arenaPosition || 0) + 1),
      },
    },
    { upsert: true, returnDocument: "after", session }
  );
  const layout = await rebalanceArenaCohortInTransaction({
    session,
    seasonKey,
    division: "SUB",
    now,
  });
  const placed = layout.find(
    (entry) => String(entry._id) === String(standing._id)
  );
  return { standing, placed: placed || standing };
}

async function preparePaidMainRenewalInTransaction({
  userId,
  cycleId,
  accessState,
  approvedAt,
  session,
}) {
  if (!accessState?.referenceSubPlacementId || !accessState?.lastMainSnapshotId) {
    throw statusError(
      409,
      "Main Division 재구독 기준 순위를 찾을 수 없습니다.",
      "MAIN_RENEWAL_REFERENCE_REQUIRED"
    );
  }
  const reference = await MainToSubConversionResult.findOne({
    _id: accessState.referenceSubPlacementId,
    userId,
  })
    .session(session)
    .lean();
  if (
    !reference ||
    reference.snapshotValid !== true ||
    reference.integrityStatus !== "CLEAR"
  ) {
    throw statusError(
      409,
      "Main Division 재구독 기준 순위가 유효하지 않습니다.",
      "MAIN_RENEWAL_REFERENCE_INVALID"
    );
  }
  const withinGrace =
    new Date(approvedAt).getTime() <=
    new Date(reference.renewalGraceDeadline).getTime();

  if (withinGrace) {
    const tuple = {
      arenaRank: reference.referenceSubRank,
      arenaPosition: reference.referenceSubOverallPosition,
      arenaGp: reference.referenceSubGp,
    };
    const { standing } = await upsertRenewalSubStanding({
      userId,
      tuple,
      session,
      now: approvedAt,
      seed: {
        seedPolicyVersion: reference.policyVersion,
        sourcePlacementAttemptId: null,
        seededAt: approvedAt,
      },
    });
    await ArenaAccessState.updateOne(
      { userId },
      {
        $set: {
          currentCompetitiveDivision: "SUB",
          accessCycleId: cycleId,
          standingId: standing._id,
          state: "PAID_ACTIVE",
          currentSeasonPlacementCompleted: true,
          defensePoolEligible: true,
          weeklyMockEligible: true,
          finalRankingActive: true,
          reasonCode: "MAIN_RENEWAL_WITHIN_72_HOURS",
        },
      },
      { session }
    );
    await ArenaOutboxEvent.create(
      [
        {
          eventType: "RenewalGraceQualified",
          aggregateType: "AccessCycle",
          aggregateId: cycleId,
          idempotencyKey: `${cycleId}:RenewalGraceQualified`,
          payload: {
            userId,
            referenceSubPlacementId: reference._id,
          },
        },
        {
          eventType: "SubReentryActivated",
          aggregateType: "AccessCycle",
          aggregateId: cycleId,
          idempotencyKey: `${cycleId}:SubReentryActivated`,
          payload: { userId, standingId: standing._id },
        },
      ],
      { session }
    );
    return { withinGrace: true, placementCompleted: true, standing };
  }

  const lateRenewalCeiling = oneTierLowerTuple(reference);
  const assessment = await RenewalRankAssessment.findOneAndUpdate(
    { cycleId },
    {
      $setOnInsert: {
        userId,
        cycleId,
        sourceMainSnapshotId: accessState.lastMainSnapshotId,
        referenceSubPlacementId: reference._id,
        lateRenewalCeiling,
        status: "REQUIRED",
        integrityStatus: "PENDING",
      },
    },
    { upsert: true, returnDocument: "after", session }
  );
  await ArenaStanding.updateMany(
    {
      userId,
      division: "SUB",
      seasonKey: kstSeasonKey(approvedAt),
      status: { $ne: "ARCHIVED" },
    },
    { $set: { status: "LOCKED" } },
    { session }
  );
  await ArenaAccessState.updateOne(
    { userId },
    {
      $set: {
        currentCompetitiveDivision: "SUB",
        accessCycleId: cycleId,
        state: "PAID_PENDING_RENEWAL_ASSESSMENT",
        currentSeasonPlacementCompleted: false,
        defensePoolEligible: false,
        weeklyMockEligible: false,
        finalRankingActive: false,
        reasonCode: "MAIN_RENEWAL_AFTER_72_HOURS",
      },
    },
    { session }
  );
  await ArenaOutboxEvent.create(
    [
      {
        eventType: "RenewalGraceExpired",
        aggregateType: "AccessCycle",
        aggregateId: cycleId,
        idempotencyKey: `${cycleId}:RenewalGraceExpired`,
        payload: { userId, referenceSubPlacementId: reference._id },
      },
      {
        eventType: "RenewalRankAssessmentRequired",
        aggregateType: "RenewalRankAssessment",
        aggregateId: assessment._id,
        idempotencyKey: `${cycleId}:RenewalRankAssessmentRequired`,
        payload: { userId, cycleId },
      },
    ],
    { session }
  );
  return { withinGrace: false, placementCompleted: false, assessment };
}

async function completeRenewalRankAssessmentInTransaction({
  userId,
  attemptId,
  session,
  now = new Date(),
}) {
  const accessState = await ArenaAccessState.findOne({
    userId,
    state: "PAID_PENDING_RENEWAL_ASSESSMENT",
  })
    .session(session)
    .lean();
  if (!accessState) return null;
  const assessment = await RenewalRankAssessment.findOne({
    userId,
    cycleId: accessState.accessCycleId,
    status: { $in: ["REQUIRED", "IN_PROGRESS", "SUBMITTED", "HELD"] },
  })
    .session(session)
    .lean();
  if (!assessment) return null;
  const attempt = await AssessmentAttempt.findOne({
    _id: attemptId,
    userId,
    scopeType: "placement",
    status: "submitted",
  })
    .session(session)
    .lean();
  if (!attempt || attempt.placementResult?.verification?.result === "pending") {
    throw statusError(
      409,
      "랭크 복귀전에 사용할 완료된 배치고사를 찾을 수 없습니다.",
      "RENEWAL_ASSESSMENT_PLACEMENT_REQUIRED"
    );
  }
  const examTuple = initialArenaTupleFromPlacement(attempt);
  const finalTuple = lowerArenaTuple(examTuple, assessment.lateRenewalCeiling);
  const { standing, placed } = await upsertRenewalSubStanding({
    userId,
    tuple: finalTuple,
    session,
    now,
    seed: {
      sourcePlacementAttemptId: attempt._id,
      seedPolicyVersion: "RENEWAL_RANK_ASSESSMENT_V1",
      seedPlacementScore: attempt.placementResult?.placementScore ?? null,
      seedPlacementElapsedTimeMs: attempt.elapsedTimeMs ?? null,
      seedPlacementMmr:
        attempt.placementResult?.initialMmr ??
        attempt.placementResult?.initialRating ??
        null,
      seedPlacementStartedAt: attempt.startedAt || attempt.createdAt,
      seededAt: now,
    },
  });
  await RenewalRankAssessment.updateOne(
    { _id: assessment._id },
    {
      $set: {
        startedAt: assessment.startedAt || attempt.startedAt || attempt.createdAt,
        submittedAt: attempt.submittedAt || now,
        score: attempt.placementResult?.placementScore ?? attempt.scorePercent,
        integrityStatus: "CLEAR",
        examDerivedSubPlacement: examTuple,
        finalSubPlacement: {
          arenaRank: placed.arenaRank,
          arenaPosition: placed.arenaPosition,
          arenaGp: placed.arenaGp,
        },
        status: "COMPLETED",
      },
    },
    { session }
  );
  await ArenaAccessState.updateOne(
    { _id: accessState._id },
    {
      $set: {
        standingId: standing._id,
        state: "PAID_ACTIVE",
        currentSeasonPlacementCompleted: true,
        defensePoolEligible: true,
        weeklyMockEligible: true,
        finalRankingActive: true,
        reasonCode: "RENEWAL_RANK_ASSESSMENT_COMPLETED",
      },
    },
    { session }
  );
  await ArenaOutboxEvent.create(
    [
      {
        eventType: "RenewalRankAssessmentCompleted",
        aggregateType: "RenewalRankAssessment",
        aggregateId: assessment._id,
        idempotencyKey: `${assessment._id}:RenewalRankAssessmentCompleted`,
        payload: { userId, cycleId: accessState.accessCycleId },
      },
      {
        eventType: "SubReentryActivated",
        aggregateType: "AccessCycle",
        aggregateId: accessState.accessCycleId,
        idempotencyKey: `${accessState.accessCycleId}:SubReentryActivated`,
        payload: { userId, standingId: standing._id },
      },
    ],
    { session }
  );
  return { assessment, standing, placed };
}

module.exports = {
  completeRenewalRankAssessmentInTransaction,
  lowerArenaTuple,
  oneTierLowerTuple,
  preparePaidMainRenewalInTransaction,
};
