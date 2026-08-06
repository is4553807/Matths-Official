const mongoose = require("mongoose");
const {
  User,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaAchievementBadge,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaOutboxEvent,
  ArenaPaybackReview,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  getActiveMainDivisionPolicy,
} = require("./arenaPolicyService");
const {
  kstSeasonKey,
  rebalanceArenaCohortInTransaction,
} = require("./arenaStandingService");
const {
  resolveMainCompetitivePool,
} = require("./mainCompetitivePoolService");
const {
  deliverModerationNotice,
} = require("./moderationNoticeService");

const PAYBACK_EVALUATION_VERSION = "PAYBACK-EVALUATION-V1";
const DAY_MS = 24 * 60 * 60 * 1000;
const UNRESOLVED_MATCH_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
];

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function kstDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function paybackBandForScore(bands, scoreDays) {
  return (Array.isArray(bands) ? bands : []).find((band) => {
    const minimum = numeric(band.minScoreDays);
    const maximum =
      band.maxScoreDays === null ||
      band.maxScoreDays === undefined
        ? Infinity
        : numeric(band.maxScoreDays);
    return scoreDays >= minimum && scoreDays <= maximum;
  }) || null;
}

function calculatePaybackDecision(cycle, { integrityClear = true } = {}) {
  const paybackPolicy = cycle?.policySnapshot?.payback || {};
  const streakDays = Math.max(0, numeric(cycle?.streakDays));
  const paidNormalAttacksCompleted = Math.max(
    0,
    numeric(cycle?.paidNormalAttacksCompleted)
  );
  const paybackScoreDays = Math.max(0, numeric(cycle?.paybackScoreDays));
  const minimumStreakDays = Math.max(
    0,
    numeric(
      paybackPolicy.minimumStreakDays ??
        cycle?.policySnapshot?.initialLearningDays ??
        29
    )
  );
  const minimumScoreDays = Math.max(
    0,
    numeric(paybackPolicy.minimumScoreDays ?? 30)
  );
  const disqualifiers = [...new Set(
    (Array.isArray(cycle?.paybackDisqualifiers)
      ? cycle.paybackDisqualifiers
      : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
  if (streakDays < minimumStreakDays) {
    disqualifiers.push("MINIMUM_STREAK_NOT_MET");
  }
  if (paybackScoreDays < minimumScoreDays) {
    disqualifiers.push("MINIMUM_PAYBACK_SCORE_NOT_MET");
  }
  if (!integrityClear) {
    disqualifiers.push("INTEGRITY_NOT_CLEAR");
  }
  const qualified = disqualifiers.length === 0;
  const band = paybackBandForScore(
    paybackPolicy.bands,
    paybackScoreDays
  );
  const paybackRate = qualified
    ? Math.max(0, Math.min(100, numeric(band?.ratePercent)))
    : 0;
  const paybackAmount = qualified
    ? Math.round(numeric(cycle?.pricePaid) * paybackRate / 100)
    : 0;
  return {
    qualified,
    paybackRate,
    paybackAmount,
    disqualifiers,
    inputs: {
      streakDays,
      paidNormalAttacksCompleted,
      paybackScoreDays,
      integrityStatus: integrityClear ? "CLEAR" : "HELD",
      minimumStreakDays,
      minimumScoreDays,
    },
  };
}

async function unresolvedMatchesForCycle(cycle, session = null) {
  const query = ArenaMatch.find({
    status: { $in: UNRESOLVED_MATCH_STATUSES },
    $or: [
      { "challenger.accessCycleId": cycle._id },
      { "defender.accessCycleId": cycle._id },
    ],
  }).select("_id status matchType division integrityStatus");
  if (session) query.session(session);
  return query.lean();
}

async function holdPaybackReviewForPendingMatch({
  cycle,
  now = new Date(),
}) {
  const unresolvedMatches = await unresolvedMatchesForCycle(cycle);
  if (!unresolvedMatches.length) {
    return { held: false, reason: "NO_UNRESOLVED_MATCH" };
  }

  const review = await ArenaPaybackReview.findOneAndUpdate(
    {
      cycleId: cycle._id,
      evaluationVersion: PAYBACK_EVALUATION_VERSION,
    },
    {
      $set: {
        userId: cycle.userId,
        status: "HELD",
        evaluatedInputs: {
          evaluationAt: cycle.evaluationAt,
          unresolvedMatches: unresolvedMatches.map((match) => ({
            matchId: match._id,
            division: match.division,
            matchType: match.matchType,
            status: match.status,
          })),
        },
        "result.reasonCode": "UNRESOLVED_ARENA_MATCH",
        evaluatedAt: null,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  await sendReviewNoticeOnce({
    review,
    now,
    title: "페이백 심사가 잠시 보류되었습니다",
    message:
      "아직 정산이 끝나지 않은 GOAT Arena 경기가 있어 페이백 심사를 보류했습니다. 이 상태에서는 조건 미달로 확정하지 않습니다. 경기 정산 또는 운영자 검토가 끝나면 같은 결제주기 기준으로 심사를 다시 진행하며, 운영 검토에서 이상 없음으로 판정되면 실제 매치메이킹 일시정지 시간만큼 이용 주기와 심사 시각을 연장합니다.",
    emailSubject: "[Matths] 페이백 심사 보류 안내",
  });
  return { held: true, review };
}

function mainCycleDraft({
  cycle,
  mainDays,
  carryoverDays,
  bonusDays,
  now,
}) {
  const startsAt = new Date(now);
  const nominalExpiresAt = new Date(
    startsAt.getTime() + Math.max(1, mainDays) * DAY_MS
  );
  const entryDateKst = kstDateKey(startsAt);
  return {
    userId: cycle.userId,
    division: "MAIN",
    status: "ACTIVE",
    policyVersionId: cycle.policyVersionId,
    policyVersionCode: cycle.policyVersionCode,
    policySnapshot: cycle.policySnapshot,
    currency: cycle.currency || "KRW",
    pricePaid: 0,
    paidAt: startsAt,
    startsAt,
    baseExpiresAt: nominalExpiresAt,
    expiresAt: nominalExpiresAt,
    evaluationAt: startsAt,
    availableLearningDays: mainDays,
    paybackScoreDays: 0,
    lockedLearningDays: 0,
    reservedLearningDays: 0,
    learningDayBuckets: [
      {
        sourceType: "SUB_CARRYOVER",
        availableDays: carryoverDays,
        reservedDays: 0,
        lockedDays: 0,
      },
      {
        sourceType: "MAIN_ENTRY_BONUS",
        availableDays: bonusDays,
        reservedDays: 0,
        lockedDays: 0,
      },
    ].filter((bucket) => bucket.availableDays > 0),
    sourceSubCycleId: cycle._id,
    mainEntryBonusGrantedAt: startsAt,
    firstConsumptionDateKst: entryDateKst,
    firstDayMode: "SAME_DAY",
    firstDayConsumedAt: startsAt,
    lastConsumptionDateKst: entryDateKst,
    depletedAt: null,
    paidNormalAttacksCompleted: 0,
    streakDays: 0,
    lastStreakDateKst: null,
    cashbackQualified: false,
    paybackRate: 0,
    paybackAmount: 0,
    paybackPayoutStatus: "NOT_APPLICABLE",
    evaluatedAt: startsAt,
  };
}

async function createOrActivateMainStanding({
  cycle,
  session,
  now,
}) {
  const seasonKey = kstSeasonKey(now);
  const [subStanding, user] = await Promise.all([
    ArenaStanding.findOne({
      userId: cycle.userId,
      division: "SUB",
      seasonKey,
      status: { $ne: "ARCHIVED" },
    })
      .session(session)
      .lean(),
    User.findById(cycle.userId)
      .select("schoolGrade")
      .session(session)
      .lean(),
  ]);
  if (!subStanding) {
    const error = new Error(
      "Ranked로 승급할 Unranked 순위를 찾을 수 없습니다."
    );
    error.status = 409;
    error.code = "SUB_STANDING_REQUIRED_FOR_MAIN_ENTRY";
    throw error;
  }
  if (!user) {
    const error = new Error("Ranked 진입 사용자를 찾을 수 없습니다.");
    error.status = 404;
    error.code = "MAIN_ENTRY_USER_NOT_FOUND";
    throw error;
  }
  const competitivePool = resolveMainCompetitivePool(user);

  await ArenaStanding.updateOne(
    { _id: subStanding._id },
    { $set: { status: "LOCKED" } },
    { session }
  );
  const lastMain = await ArenaStanding.findOne({
    division: "MAIN",
    seasonKey,
    competitivePool,
    arenaRank: subStanding.arenaRank,
  })
    .sort({ arenaPosition: -1 })
    .select("arenaPosition")
    .session(session)
    .lean();
  const mainStanding = await ArenaStanding.findOneAndUpdate(
    {
      userId: cycle.userId,
      division: "MAIN",
      seasonKey,
    },
    {
      $set: {
        arenaRank: subStanding.arenaRank,
        arenaGp: subStanding.arenaGp,
        competitivePool,
        status: "ACTIVE",
        reachedCurrentGpAt: now,
      },
      $setOnInsert: {
        userId: cycle.userId,
        division: "MAIN",
        seasonKey,
        arenaPosition: Math.max(1, numeric(lastMain?.arenaPosition) + 1),
        seedPolicyVersion: "SUB_PAYBACK_MAIN_ENTRY_V1",
        seededAt: now,
      },
    },
    { upsert: true, returnDocument: "after", session }
  );
  await rebalanceArenaCohortInTransaction({
    session,
    seasonKey,
    division: "MAIN",
    competitivePool,
    now,
  });
  return mainStanding;
}

async function finalizePaybackReview({
  cycleId,
  now = new Date(),
}) {
  const mainPolicy = await getActiveMainDivisionPolicy(now);
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const cycle = await AccessCycle.findById(cycleId)
        .session(session)
        .lean();
      if (!cycle) {
        const error = new Error("페이백 심사 이용 주기를 찾을 수 없습니다.");
        error.status = 404;
        throw error;
      }
      if (cycle.evaluatedAt) {
        const existing = await ArenaPaybackReview.findOne({
          cycleId: cycle._id,
          evaluationVersion: PAYBACK_EVALUATION_VERSION,
        })
          .session(session)
          .lean();
        result = { review: existing, cycle, replayed: true };
        return;
      }
      const unresolvedMatches = await unresolvedMatchesForCycle(cycle, session);
      if (unresolvedMatches.length) {
        result = { held: true, cycle };
        return;
      }
      const integrityIssue = await ArenaMatch.exists({
        $or: [
          { "challenger.accessCycleId": cycle._id },
          { "defender.accessCycleId": cycle._id },
        ],
        integrityStatus: { $in: ["SUSPICIOUS", "CONFIRMED", "INVALID"] },
      }).session(session);
      const decision = calculatePaybackDecision(cycle, {
        integrityClear: !integrityIssue,
      });
      const reviewedAt = new Date(now);
      const reviewId = new mongoose.Types.ObjectId();

      let mainCycle = null;
      let mainStanding = null;
      if (decision.qualified) {
        const carryoverBaseDays = Math.max(
          0,
          numeric(mainPolicy?.mainCarryoverBaseDays ?? 29)
        );
        const bonusDays = Math.max(
          0,
          numeric(mainPolicy?.mainEntryBonusDays ?? 2)
        );
        const carryoverDays = Math.max(
          0,
          decision.inputs.paybackScoreDays - carryoverBaseDays
        );
        const mainDays = carryoverDays + bonusDays;
        const mainCycleId = new mongoose.Types.ObjectId();

        mainStanding = await createOrActivateMainStanding({
          cycle,
          session,
          now: reviewedAt,
        });
        await AccessCycle.updateOne(
          { _id: cycle._id, evaluatedAt: null },
          {
            $set: {
              status: "PAYBACK_COMPLETED",
              cashbackQualified: true,
              paybackRate: decision.paybackRate,
              paybackAmount: decision.paybackAmount,
              paybackDisqualifiers: [],
              paybackPayoutStatus:
                decision.paybackAmount > 0 ? "PENDING" : "NOT_APPLICABLE",
              evaluatedAt: reviewedAt,
            },
          },
          { session }
        );
        [mainCycle] = await AccessCycle.create(
          [
            {
              _id: mainCycleId,
              ...mainCycleDraft({
                cycle,
                mainDays,
                carryoverDays,
                bonusDays,
                now: reviewedAt,
              }),
            },
          ],
          { session }
        );
        const ledgers = [];
        if (carryoverDays > 0) {
          ledgers.push({
            userId: cycle.userId,
            accessCycleId: mainCycleId,
            idempotencyKey: `${cycle._id}:MAIN_CARRYOVER_GRANTED`,
            eventType: "MAIN_CARRYOVER_GRANTED",
            availableLearningDaysDelta: carryoverDays,
            sourceBucket: "SUB_CARRYOVER",
            balanceAfter: {
              availableLearningDays: carryoverDays,
              paybackScoreDays: 0,
              lockedLearningDays: 0,
              reservedLearningDays: 0,
            },
            sourceType: "SUB_PAYBACK_REVIEW",
            sourceId: reviewId,
            occurredAt: reviewedAt,
          });
        }
        if (bonusDays > 0) {
          ledgers.push({
            userId: cycle.userId,
            accessCycleId: mainCycleId,
            idempotencyKey: `${cycle._id}:MAIN_ENTRY_BONUS`,
            eventType: "MAIN_ENTRY_BONUS_GRANTED",
            availableLearningDaysDelta: bonusDays,
            sourceBucket: "MAIN_ENTRY_BONUS",
            balanceAfter: {
              availableLearningDays: carryoverDays + bonusDays,
              paybackScoreDays: 0,
              lockedLearningDays: 0,
              reservedLearningDays: 0,
            },
            sourceType: "SUB_PAYBACK_REVIEW",
            sourceId: reviewId,
            occurredAt: reviewedAt,
          });
        }
        if (ledgers.length) {
          await ArenaLearningDayLedger.create(ledgers, { session });
        }
        await ArenaAccessState.updateOne(
          { userId: cycle.userId },
          {
            $set: {
              currentCompetitiveDivision: "MAIN",
              mainCompetitivePool: mainStanding.competitivePool,
              accessCycleId: mainCycleId,
              standingId: mainStanding._id,
              state: "PAID_ACTIVE",
              mainAchievementStatus: "ACHIEVED",
              currentSeasonPlacementCompleted: true,
              defensePoolEligible: true,
              weeklyMockEligible: true,
              finalRankingActive: true,
              expiredAt: null,
              renewalGraceDeadline: null,
              reasonCode: "SUB_PAYBACK_MAIN_ENTRY",
            },
          },
          { upsert: true, session }
        );
        await ArenaAchievementBadge.updateOne(
          {
            userId: cycle.userId,
            badgeCode: "MAIN_ACHIEVED",
            seasonKey: kstSeasonKey(reviewedAt),
          },
          {
            $setOnInsert: {
              userId: cycle.userId,
              badgeCode: "MAIN_ACHIEVED",
              displayName: "Ranked 진입",
              description: "Unranked 페이백 조건을 달성해 Ranked에 진입했습니다.",
              seasonKey: kstSeasonKey(reviewedAt),
              sourceType: "MAIN_ACHIEVEMENT",
              awardedAt: reviewedAt,
              metadata: { sourceSubCycleId: cycle._id },
            },
          },
          { upsert: true, session }
        );
        await ArenaOutboxEvent.create(
          [
            {
              eventType: "ArenaPaybackQualified",
              aggregateType: "AccessCycle",
              aggregateId: cycle._id,
              idempotencyKey: `${cycle._id}:ArenaPaybackQualified`,
              payload: {
                paybackRate: decision.paybackRate,
                paybackAmount: decision.paybackAmount,
              },
            },
            {
              eventType: "MainEntryActivated",
              aggregateType: "AccessCycle",
              aggregateId: mainCycleId,
              idempotencyKey: `${cycle._id}:MainEntryActivated`,
              payload: {
                sourceSubCycleId: cycle._id,
                mainStartingLearningDays: mainDays,
              },
            },
          ],
          { session }
        );
      } else {
        await AccessCycle.updateOne(
          { _id: cycle._id, evaluatedAt: null },
          {
            $set: {
              cashbackQualified: false,
              paybackRate: 0,
              paybackAmount: 0,
              paybackDisqualifiers: decision.disqualifiers,
              paybackPayoutStatus: "NOT_APPLICABLE",
              evaluatedAt: reviewedAt,
            },
          },
          { session }
        );
        await ArenaOutboxEvent.create(
          [
            {
              eventType: "ArenaPaybackNotQualified",
              aggregateType: "AccessCycle",
              aggregateId: cycle._id,
              idempotencyKey: `${cycle._id}:ArenaPaybackNotQualified`,
              payload: { disqualifiers: decision.disqualifiers },
            },
          ],
          { session }
        );
      }

      const review = await ArenaPaybackReview.findOneAndUpdate(
        {
          cycleId: cycle._id,
          evaluationVersion: PAYBACK_EVALUATION_VERSION,
        },
        {
          $set: {
            userId: cycle.userId,
            status: decision.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
            evaluatedInputs: decision.inputs,
            result: {
              paybackRate: decision.paybackRate,
              paybackAmount: decision.paybackAmount,
              disqualifiers: decision.disqualifiers,
              mainAccessCycleId: mainCycle?._id || null,
              mainStandingId: mainStanding?._id || null,
              payoutStatus:
                decision.paybackAmount > 0 && decision.qualified
                  ? "PENDING"
                  : "NOT_APPLICABLE",
            },
            evaluatedAt: reviewedAt,
          },
          $setOnInsert: { _id: reviewId },
        },
        { upsert: true, returnDocument: "after", session }
      );
      result = {
        held: false,
        review: review.toObject ? review.toObject() : review,
        decision,
        mainCycle,
        replayed: false,
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function sendReviewNoticeOnce({
  review,
  now,
  title,
  message,
  emailSubject,
}) {
  if (!review?._id) return;
  const noticeClaim = await ArenaPaybackReview.findOneAndUpdate(
    {
      _id: review._id,
      "result.userNoticeSentAt": { $exists: false },
      "result.userNoticeClaimedAt": { $exists: false },
    },
    { $set: { "result.userNoticeClaimedAt": new Date(now) } },
    { returnDocument: "after" }
  );
  if (!noticeClaim) return;
  const user = await User.findById(review.userId)
    .select("_id name realName email")
    .lean();
  if (!user) {
    await ArenaPaybackReview.updateOne(
      { _id: review._id },
      { $unset: { "result.userNoticeClaimedAt": "" } }
    );
    return;
  }
  await deliverModerationNotice({
    user,
    title,
    message,
    kind: "system",
    href: "/goat-arena/profile",
    emailSubject,
  });
  await ArenaPaybackReview.updateOne(
    { _id: review._id },
    {
      $set: { "result.userNoticeSentAt": new Date(now) },
      $unset: { "result.userNoticeClaimedAt": "" },
    }
  );
}

async function processDuePaybackReviewHolds({
  now = new Date(),
  limit = 200,
} = {}) {
  const cycles = await AccessCycle.find({
    division: "SUB",
    evaluationAt: { $lte: now },
    evaluatedAt: null,
    status: { $in: ["ACTIVE", "EXPIRED"] },
  })
    .sort({ evaluationAt: 1, _id: 1 })
    .limit(Math.max(1, Math.min(1000, Number(limit) || 200)))
    .lean();
  const summary = {
    scanned: cycles.length,
    held: 0,
    qualified: 0,
    notQualified: 0,
    replayed: 0,
    failed: 0,
  };
  for (const cycle of cycles) {
    try {
      const hold = await holdPaybackReviewForPendingMatch({ cycle, now });
      if (hold.held) {
        summary.held += 1;
        continue;
      }
      const item = await finalizePaybackReview({
        cycleId: cycle._id,
        now,
      });
      if (item.replayed) summary.replayed += 1;
      else if (item.decision?.qualified) summary.qualified += 1;
      else summary.notQualified += 1;
      if (item.review) {
        const qualified = item.decision?.qualified;
        await sendReviewNoticeOnce({
          review: item.review,
          now,
          title: qualified
            ? "페이백 조건을 달성했습니다"
            : "이번 결제주기 페이백 심사가 완료되었습니다",
          message: qualified
            ? `페이백 ${item.decision.paybackRate}%가 확정되었고 Ranked가 활성화되었습니다. 실제 송금은 지급 대기 상태에서 운영자가 처리합니다.`
            : "이번 결제주기에는 페이백 조건을 모두 충족하지 못했습니다. 다음 결제주기에는 새 정책 기준으로 다시 도전할 수 있습니다.",
          emailSubject: qualified
            ? "[Matths] 페이백 확정 및 Ranked 진입 안내"
            : "[Matths] 페이백 심사 결과 안내",
        });
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`페이백 심사 실패 (${cycle._id}):`, error);
    }
  }
  return summary;
}

module.exports = {
  PAYBACK_EVALUATION_VERSION,
  UNRESOLVED_MATCH_STATUSES,
  calculatePaybackDecision,
  finalizePaybackReview,
  holdPaybackReviewForPendingMatch,
  paybackBandForScore,
  processDuePaybackReviewHolds,
};
