const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaOutboxEvent,
  ArenaSnapshot,
  ArenaStanding,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const {
  hasPendingMatchSettlement,
  kstDateKey,
  kstMidnight,
} = require("./accessCycleService");
const {
  ARENA_TIER_CONFIG,
} = require("./arenaTierPolicy");
const {
  createMainToSubConversionResult,
} = require("./mainToSubConversionService");
const {
  processDuePaybackReviewHolds,
} = require("./arenaPaybackReviewService");
const {
  consumeAvailableDay,
} = require("./mainLearningDayService");
const {
  dormancyConsumptionThroughDate,
  inactivityDayCount,
  initializeMainInactivityWindows,
  processMainDormancyTransitions,
} = require("./arenaDormancyService");
const { withSchedulerLease } = require("./schedulerLeaseService");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCHEDULER_INTERVAL_MS =
  30 * 1000;

let dailyScheduleTimer = null;
let dailyScheduleRunning = false;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function dateKeyToDayNumber(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw statusError(
      500,
      "이용 주기의 한국 날짜 기준을 확인할 수 없습니다.",
      "INVALID_KST_DATE_KEY"
    );
  }
  const [year, month, day] = dateKey
    .split("-")
    .map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw statusError(
      500,
      "이용 주기의 한국 날짜 기준을 확인할 수 없습니다.",
      "INVALID_KST_DATE_KEY"
    );
  }
  return Math.floor(date.getTime() / DAY_MS);
}

function dayNumberToDateKey(dayNumber) {
  return new Date(dayNumber * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function buildDailyConsumptionPlan({
  cycle,
  throughDateKst,
}) {
  const firstDate = String(
    cycle?.firstConsumptionDateKst || ""
  );
  const lastDate = String(
    cycle?.lastConsumptionDateKst ||
      firstDate
  );
  const throughDate = String(
    throughDateKst || ""
  );
  const availableBefore = Number(
    cycle?.availableLearningDays
  );

  if (
    !Number.isSafeInteger(availableBefore) ||
    availableBefore < 0
  ) {
    throw statusError(
      500,
      "정기권 학습 가능 일수 원본을 확인해주세요.",
      "INVALID_AVAILABLE_LEARNING_DAYS"
    );
  }

  const lastDay =
    dateKeyToDayNumber(lastDate);
  const throughDay =
    dateKeyToDayNumber(throughDate);
  const consumptionDates = [];
  let cursor = lastDay + 1;
  let remaining = availableBefore;
  while (
    cursor <= throughDay &&
    remaining > 0
  ) {
    consumptionDates.push(
      dayNumberToDateKey(cursor)
    );
    cursor += 1;
    remaining -= 1;
  }

  return {
    availableBefore,
    availableAfter: remaining,
    consumptionDates,
    lastConsumptionDateKst:
      consumptionDates.at(-1) ||
      cycle?.lastConsumptionDateKst ||
      null,
    depletedAt:
      remaining === 0 &&
      consumptionDates.length
        ? kstMidnight(
            consumptionDates.at(-1)
          )
        : cycle?.depletedAt || null,
  };
}

function buildDailyLedgerEntries({
  cycle,
  plan,
  processedAt,
}) {
  return plan.consumptionDates.map(
    (consumptionDateKst, index) => ({
      userId: cycle.userId,
      accessCycleId: cycle._id,
      idempotencyKey:
        `${cycle._id}:${consumptionDateKst}:DAILY_ACCESS_CONSUMPTION`,
      eventType:
        "DAILY_ACCESS_CONSUMPTION",
      availableLearningDaysDelta: -1,
      paybackScoreDaysDelta: 0,
      lockedPaybackScoreDaysDelta: 0,
      lockedLearningDaysDelta: 0,
      reservedLearningDaysDelta: 0,
      balanceAfter: {
        availableLearningDays:
          plan.availableBefore - index - 1,
        paybackScoreDays:
          cycle.paybackScoreDays,
        lockedPaybackScoreDays:
          cycle.lockedPaybackScoreDays || 0,
        lockedLearningDays:
          cycle.lockedLearningDays,
        reservedLearningDays:
          cycle.reservedLearningDays || 0,
      },
      sourceType:
        "ACCESS_CYCLE_SCHEDULER",
      occurredAt:
        kstMidnight(consumptionDateKst),
      metadata: {
        consumptionDateKst,
        processedAt,
      },
    })
  );
}

function percentileFromPosition({
  position,
  participantCount,
}) {
  const count = Math.max(
    Number(participantCount) || 0,
    Number(position) || 0,
    1
  );
  const rank = Math.min(
    Math.max(Number(position) || 1, 1),
    count
  );
  return (
    Math.round(
      Math.max(
        0,
        Math.min(
          1,
          1 - (rank - 1) / count
        )
      ) * 1_000_000
    ) / 1_000_000
  );
}

async function upsertOutboxEvent({
  session,
  eventType,
  cycle,
  payload = {},
}) {
  const idempotencyKey =
    `${cycle._id}:${eventType}`;
  await ArenaOutboxEvent.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        eventType,
        aggregateType: "AccessCycle",
        aggregateId: cycle._id,
        idempotencyKey,
        payload: {
          userId: cycle.userId,
          accessCycleId: cycle._id,
          ...payload,
        },
      },
    },
    { upsert: true, session }
  );
}

async function disableDepletedAccess({
  cycle,
  accessState,
  session,
}) {
  await ArenaAccessState.updateOne(
    { userId: cycle.userId },
    {
      $set: {
        accessCycleId: cycle._id,
        defensePoolEligible: false,
        weeklyMockEligible: false,
        finalRankingActive: false,
        reasonCode:
          "LEARNING_DAYS_DEPLETED_PENDING_SETTLEMENT",
      },
      $setOnInsert: {
        currentCompetitiveDivision:
          cycle.division || "SUB",
        accessCycleId: cycle._id,
        state: "PAID_ACTIVE",
        currentSeasonPlacementCompleted:
          false,
      },
    },
    { upsert: true, session }
  );

  const standingId =
    accessState?.standingId || null;
  if (standingId) {
    await ArenaStanding.updateOne(
      { _id: standingId },
      { $set: { status: "LOCKED" } },
      { session }
    );
  } else {
    await ArenaStanding.updateMany(
      {
        userId: cycle.userId,
        status: "ACTIVE",
      },
      { $set: { status: "LOCKED" } },
      { session }
    );
  }

  await LiveFinalRankingProfile.updateMany(
    { userId: cycle.userId },
    {
      $set: {
        accessState:
          "SUB_ACCESS_EXPIRED_LOCKED",
        weeklyMockBonus: 0,
        status:
          "INACTIVE_ACCESS_EXPIRED",
      },
    },
    { session }
  );
  await upsertOutboxEvent({
    session,
    eventType: "LearningDaysDepleted",
    cycle,
    payload: {
      depletedAt:
        cycle.depletedAt || null,
    },
  });
}

async function findExpirationStanding({
  cycle,
  accessState,
  sourceDivision,
  session,
}) {
  if (accessState?.standingId) {
    const selected =
      await ArenaStanding.findById(
        accessState.standingId
      )
        .session(session)
        .lean();
    if (
      selected?.division ===
      sourceDivision
    ) {
      return selected;
    }
  }
  return ArenaStanding.findOne({
    userId: cycle.userId,
    division: sourceDivision,
    status: { $in: ["ACTIVE", "LOCKED"] },
  })
    .sort({ seasonKey: -1, updatedAt: -1 })
    .session(session)
    .lean();
}

async function createExpirationSnapshot({
  cycle,
  accessState,
  sourceDivision,
  wasMain,
  expiredAt,
  session,
}) {
  const standing =
    await findExpirationStanding({
      cycle,
      accessState,
      sourceDivision,
      session,
    });
  if (!standing) {
    if (wasMain) {
      throw statusError(
        409,
        "Main Division 만료 전 마지막 순위 스냅샷 원본이 필요합니다.",
        "MAIN_STANDING_REQUIRED_FOR_DEMOTION"
      );
    }
    return {
      snapshot: null,
      standing: null,
    };
  }

  const snapshotReason = wasMain
    ? "MAIN_DEMOTION"
    : "ACCESS_EXPIRED";
  const existing = await ArenaSnapshot.findOne({
    accessCycleId: cycle._id,
    snapshotReason,
  })
    .session(session)
    .lean();
  if (existing) {
    return { snapshot: existing, standing };
  }

  const [divisionStandings, finalProfile] =
    await Promise.all([
      ArenaStanding.find({
        division: sourceDivision,
        seasonKey: standing.seasonKey,
        $or: [
          { status: "ACTIVE" },
          { _id: standing._id },
        ],
      })
        .select("_id arenaRank arenaGp reachedCurrentGpAt createdAt")
        .session(session)
        .lean(),
      LiveFinalRankingProfile.findOne({
        userId: cycle.userId,
      })
        .sort({ updatedAt: -1 })
        .session(session)
        .lean(),
    ]);
  const tierOrder = new Map();
  ARENA_TIER_CONFIG.forEach((tier, index) => {
    tierOrder.set(tier.code, index);
    tierOrder.set(tier.label, index);
  });
  const orderedDivisionStandings = [...divisionStandings].sort(
    (left, right) => {
      const tierDifference =
        Number(tierOrder.get(right.arenaRank) ?? -1) -
        Number(tierOrder.get(left.arenaRank) ?? -1);
      if (tierDifference !== 0) return tierDifference;
      const gpDifference = Number(right.arenaGp) - Number(left.arenaGp);
      if (gpDifference !== 0) return gpDifference;
      const reachedDifference =
        new Date(left.reachedCurrentGpAt || left.createdAt || 0).getTime() -
        new Date(right.reachedCurrentGpAt || right.createdAt || 0).getTime();
      if (reachedDifference !== 0) return reachedDifference;
      return String(left._id).localeCompare(String(right._id));
    }
  );
  const overallPosition = Math.max(
    1,
    orderedDivisionStandings.findIndex(
      (candidate) => String(candidate._id) === String(standing._id)
    ) + 1
  );
  const safeParticipantCount = Math.max(
    orderedDivisionStandings.length,
    overallPosition
  );
  const [snapshot] = await ArenaSnapshot.create(
    [
      {
        userId: cycle.userId,
        accessCycleId: cycle._id,
        seasonKey: standing.seasonKey,
        division: sourceDivision,
        arenaTuple: {
          arenaRank: standing.arenaRank,
          arenaPosition:
            standing.arenaPosition,
          arenaGp: standing.arenaGp,
        },
        participantCount:
          safeParticipantCount,
        overallPosition,
        positionReachedAt:
          standing.reachedCurrentGpAt || standing.createdAt || expiredAt,
        percentile:
          percentileFromPosition({
            position:
              overallPosition,
            participantCount:
              safeParticipantCount,
          }),
        finalRating:
          finalProfile?.finalRating ?? null,
        snapshotReason,
        capturedAt: expiredAt,
      },
    ],
    { session }
  );
  return {
    snapshot: snapshot.toObject(),
    standing,
  };
}

function buildExpiredAccessStateUpdate({
  cycle,
  accessState,
  expiredAt,
  snapshotId = null,
}) {
  const sourceDivision =
    accessState?.currentCompetitiveDivision ||
    cycle.division ||
    "SUB";
  const wasMain =
    sourceDivision === "MAIN";
  const renewalGraceHours = Math.max(
    Number(
      cycle.policySnapshot
        ?.renewalGraceHours
    ) || 72,
    0
  );
  const renewalGraceDeadline = wasMain
    ? new Date(
        expiredAt.getTime() +
          renewalGraceHours * 60 * 60 * 1000
      )
    : null;
  const accessUpdate = {
    currentCompetitiveDivision: "SUB",
    accessCycleId: cycle._id,
    state: "SUB_ACCESS_EXPIRED_LOCKED",
    currentSeasonPlacementCompleted: false,
    expiredAt,
    renewalGraceDeadline,
    defensePoolEligible: false,
    weeklyMockEligible: false,
    finalRankingActive: false,
    reasonCode: wasMain
      ? "MAIN_DEMOTED_LEARNING_DAYS_DEPLETED"
      : "LEARNING_DAYS_DEPLETED",
  };
  if (wasMain) {
    if (!snapshotId) {
      throw statusError(
        500,
        "Main Division 강등 스냅샷을 확인할 수 없습니다.",
        "MAIN_DEMOTION_SNAPSHOT_REQUIRED"
      );
    }
    accessUpdate.mainAchievementStatus =
      "ACHIEVED";
    accessUpdate.lastMainSnapshotId =
      snapshotId;
  }
  return {
    sourceDivision,
    wasMain,
    renewalGraceDeadline,
    accessUpdate,
  };
}

async function applyExpirationTransition({
  cycle,
  expiredAt,
  session,
}) {
  if (
    Number(cycle.availableLearningDays) !== 0
  ) {
    return {
      expired: false,
      reason: "AVAILABLE_BALANCE_REMAINS",
    };
  }
  if (
    Number(cycle.reservedLearningDays || 0) !== 0
  ) {
    return {
      expired: false,
      reason: "RESERVED_BALANCE_REMAINS",
    };
  }
  if (
    cycle.division === "MAIN" &&
    Number(cycle.lockedLearningDays || 0) !== 0
  ) {
    return {
      expired: false,
      reason: "LOCKED_BALANCE_REMAINS",
    };
  }
  if (
    cycle.division === "SUB" &&
    Number(cycle.lockedPaybackScoreDays || 0) !== 0
  ) {
    await disableDepletedAccess({
      cycle,
      accessState: await ArenaAccessState.findOne({ userId: cycle.userId })
        .session(session)
        .lean(),
      session,
    });
    return {
      expired: false,
      reason: "LOCKED_PAYBACK_SCORE_REMAINS",
    };
  }
  const accessState =
    await ArenaAccessState.findOne({
      userId: cycle.userId,
    })
      .session(session)
      .lean();
  await disableDepletedAccess({
    cycle,
    accessState,
    session,
  });

  if (Number(cycle.lockedLearningDays) !== 0) {
    return {
      expired: false,
      reason: "BALANCE_OR_LOCK_REMAINS",
    };
  }
  if (Number(cycle.lockedPaybackScoreDays || 0) !== 0) {
    return {
      expired: false,
      reason: "LOCKED_PAYBACK_SCORE_REMAINS",
    };
  }
  const pendingSettlement =
    await hasPendingMatchSettlement({
      userId: cycle.userId,
      session,
    });
  if (pendingSettlement) {
    return {
      expired: false,
      reason: "PENDING_SETTLEMENT",
    };
  }

  const sourceDivision =
    accessState?.currentCompetitiveDivision ||
    cycle.division ||
    "SUB";
  const wasMain =
    sourceDivision === "MAIN";
  const { snapshot, standing } =
    await createExpirationSnapshot({
      cycle,
      accessState,
      sourceDivision,
      wasMain,
      expiredAt,
      session,
    });
  const cycleUpdate = await AccessCycle.updateOne(
    {
      _id: cycle._id,
      status: "ACTIVE",
      availableLearningDays: 0,
      reservedLearningDays: { $in: [0, null] },
      lockedPaybackScoreDays: { $in: [0, null] },
      lockedLearningDays: 0,
    },
    {
      $set: {
        status: "EXPIRED",
        expiresAt: expiredAt,
        depletedAt:
          cycle.depletedAt || expiredAt,
      },
    },
    { session }
  );
  if (!cycleUpdate.modifiedCount) {
    return {
      expired: false,
      replayed: true,
      reason: "ALREADY_EXPIRED",
    };
  }

  const expirationState =
    buildExpiredAccessStateUpdate({
      cycle,
      accessState,
      expiredAt,
      snapshotId: snapshot?._id || null,
    });
  const { accessUpdate } = expirationState;
  const { renewalGraceDeadline } =
    expirationState;
  const conversionResult = expirationState.wasMain
    ? await createMainToSubConversionResult({
        snapshot,
        renewalGraceDeadline,
        session,
      })
    : null;
  if (conversionResult) {
    accessUpdate.referenceSubPlacementId = conversionResult._id;
  }
  await ArenaAccessState.updateOne(
    { userId: cycle.userId },
    {
      $set: accessUpdate,
      $setOnInsert: {
        standingId:
          standing?._id || null,
      },
    },
    { upsert: true, session }
  );

  if (standing) {
    await ArenaStanding.updateOne(
      { _id: standing._id },
      { $set: { status: "LOCKED" } },
      { session }
    );
  }
  await LiveFinalRankingProfile.updateMany(
    { userId: cycle.userId },
    {
      $set: {
        accessState:
          "SUB_ACCESS_EXPIRED_LOCKED",
        currentCompetitiveDivision:
          "SUB",
        weeklyMockBonus: 0,
        status:
          "INACTIVE_ACCESS_EXPIRED",
      },
    },
    { session }
  );
  if (wasMain) {
    await upsertOutboxEvent({
      session,
      eventType: "MainToSubConverted",
      cycle,
      payload: {
        conversionResultId: conversionResult._id,
        referenceSubRank: conversionResult.referenceSubRank,
        referenceSubGp: conversionResult.referenceSubGp,
        referenceSubOverallPosition:
          conversionResult.referenceSubOverallPosition,
        policyVersion: conversionResult.policyVersion,
      },
    });
    await upsertOutboxEvent({
      session,
      eventType: "MainDemotedToSub",
      cycle,
      payload: {
        expiredAt,
        renewalGraceDeadline,
        lastMainSnapshotId:
          snapshot._id,
        referenceSubPlacementId:
          conversionResult._id,
      },
    });
  }
  await upsertOutboxEvent({
    session,
    eventType: "AccessExpired",
    cycle,
    payload: {
      expiredAt,
      previousDivision: sourceDivision,
      currentCompetitiveDivision: "SUB",
    },
  });

  return {
    expired: true,
    replayed: false,
    wasMain,
    snapshot,
    conversionResult,
    renewalGraceDeadline,
  };
}

async function consumeDueDailyLearningDays({
  cycleId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(cycleId)) {
    throw statusError(
      400,
      "이용 주기를 확인해주세요.",
      "INVALID_ACCESS_CYCLE_ID"
    );
  }
  const processedAt = new Date(now);
  if (Number.isNaN(processedAt.getTime())) {
    throw statusError(
      400,
      "일일 차감 처리 시각을 확인해주세요.",
      "INVALID_PROCESSING_TIME"
    );
  }

  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const cycle = await AccessCycle.findById(
        cycleId
      )
        .session(session)
        .lean();
      if (!cycle) {
        throw statusError(
          404,
          "이용 주기를 찾을 수 없습니다.",
          "ACCESS_CYCLE_NOT_FOUND"
        );
      }
      if (cycle.status !== "ACTIVE") {
        result = {
          cycle,
          consumedDates: [],
          replayed: true,
          expired:
            cycle.status === "EXPIRED",
        };
        return;
      }
      if (cycle.dailyConsumptionPausedAt) {
        result = {
          cycle,
          consumedDates: [],
          replayed: true,
          expired: false,
          reason: "MAIN_DORMANCY_FROZEN",
        };
        return;
      }
      if (!cycle.firstDayConsumedAt) {
        result = {
          cycle,
          consumedDates: [],
          replayed: false,
          expired: false,
          reason: "FIRST_DAY_NOT_CONSUMED",
        };
        return;
      }

      let throughDateKst =
        kstDateKey(processedAt);
      if (cycle.division === "MAIN") {
        const dormancyState = await ArenaAccessState.findOne({
          userId: cycle.userId,
          currentCompetitiveDivision: "MAIN",
          state: "PAID_ACTIVE",
          mainInactivityStartedAt: { $ne: null },
          mainInactivityStartAvailableDays: { $gte: 20 },
          mainDormancyRecoveryMode: null,
        })
          .session(session)
          .lean();
        const dormancyThroughDate = dormancyConsumptionThroughDate(
          dormancyState?.mainInactivityStartedAt,
          {
            allowFinalDay:
              inactivityDayCount({
                startedAt: dormancyState?.mainInactivityStartedAt,
                now: processedAt,
              }) >= 21,
          }
        );
        if (dormancyThroughDate && dormancyThroughDate < throughDateKst) {
          throughDateKst = dormancyThroughDate;
        }
      }
      const plan = buildDailyConsumptionPlan({
        cycle,
        throughDateKst,
      });
      if (!plan.consumptionDates.length) {
        if (
          Number(cycle.availableLearningDays) ===
          0
        ) {
          const expiration =
            await applyExpirationTransition({
              cycle,
              expiredAt:
                cycle.depletedAt ||
                processedAt,
              session,
            });
          result = {
            cycle,
            consumedDates: [],
            replayed: false,
            ...expiration,
          };
          return;
        }
        result = {
          cycle,
          consumedDates: [],
          replayed: true,
          expired: false,
        };
        return;
      }

      const expectedLastDate =
        cycle.lastConsumptionDateKst || null;
      let mainBucketState = null;
      if (cycle.division === "MAIN") {
        mainBucketState = {
          learningDayBuckets: cycle.learningDayBuckets,
        };
        for (const _date of plan.consumptionDates) {
          mainBucketState = consumeAvailableDay(mainBucketState);
        }
      }
      const update = {
        $set: {
          availableLearningDays:
            plan.availableAfter,
          lastConsumptionDateKst:
            plan.lastConsumptionDateKst,
        },
      };
      if (mainBucketState) {
        update.$set.learningDayBuckets =
          mainBucketState.buckets;
      }
      if (plan.depletedAt) {
        update.$set.depletedAt =
          plan.depletedAt;
      }
      const updateResult =
        await AccessCycle.updateOne(
          {
            _id: cycle._id,
            status: "ACTIVE",
            availableLearningDays:
              plan.availableBefore,
            lastConsumptionDateKst:
              expectedLastDate,
          },
          update,
          { session }
        );
      if (!updateResult.modifiedCount) {
        throw statusError(
          409,
          "일일 차감 상태가 동시에 변경되었습니다. 다시 처리합니다.",
          "DAILY_CONSUMPTION_CONCURRENT_UPDATE"
        );
      }

      const ledgerEntries =
        buildDailyLedgerEntries({
          cycle,
          plan,
          processedAt,
        });
      await ArenaLearningDayLedger.create(
        ledgerEntries,
        { session }
      );

      const updatedCycle = {
        ...cycle,
        availableLearningDays:
          plan.availableAfter,
        lastConsumptionDateKst:
          plan.lastConsumptionDateKst,
        depletedAt:
          plan.depletedAt ||
          cycle.depletedAt ||
          null,
        learningDayBuckets:
          mainBucketState?.buckets ||
          cycle.learningDayBuckets,
      };
      let expiration = {
        expired: false,
        replayed: false,
      };
      if (plan.availableAfter === 0) {
        expiration =
          await applyExpirationTransition({
            cycle: updatedCycle,
            expiredAt: plan.depletedAt,
            session,
          });
      }
      result = {
        cycle: updatedCycle,
        consumedDates:
          plan.consumptionDates,
        ...expiration,
      };
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } catch (error) {
    if (
      error?.code === 11000 ||
      error?.code ===
        "DAILY_CONSUMPTION_CONCURRENT_UPDATE"
    ) {
      const cycle = await AccessCycle.findById(
        cycleId
      ).lean();
      if (
        cycle &&
        cycle.lastConsumptionDateKst >=
          kstDateKey(processedAt)
      ) {
        return {
          cycle,
          consumedDates: [],
          replayed: true,
          expired:
            cycle.status === "EXPIRED",
        };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

async function finalizeExpiredAccessCycle({
  cycleId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(cycleId)) {
    throw statusError(
      400,
      "이용 주기를 확인해주세요.",
      "INVALID_ACCESS_CYCLE_ID"
    );
  }
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const cycle = await AccessCycle.findById(
        cycleId
      )
        .session(session)
        .lean();
      if (!cycle) {
        throw statusError(
          404,
          "이용 주기를 찾을 수 없습니다.",
          "ACCESS_CYCLE_NOT_FOUND"
        );
      }
      if (cycle.status !== "ACTIVE") {
        result = {
          expired:
            cycle.status === "EXPIRED",
          replayed: true,
          cycle,
        };
        return;
      }
      const expiration =
        await applyExpirationTransition({
          cycle,
          expiredAt:
            cycle.depletedAt || processedAt,
          session,
        });
      result = { cycle, ...expiration };
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function processDueDailyConsumptions({
  now = new Date(),
  limit = 200,
} = {}) {
  const processedAt = new Date(now);
  const throughDateKst =
    kstDateKey(processedAt);
  const safeLimit = Math.min(
    Math.max(Number(limit) || 1, 1),
    1000
  );
  const dueCycles = await AccessCycle.find({
    status: "ACTIVE",
    dailyConsumptionPausedAt: null,
    firstDayConsumedAt: { $ne: null },
    availableLearningDays: { $gt: 0 },
    $or: [
      { lastConsumptionDateKst: null },
      {
        lastConsumptionDateKst: {
          $lt: throughDateKst,
        },
      },
    ],
  })
    .sort({ lastConsumptionDateKst: 1, _id: 1 })
    .limit(safeLimit)
    .select("_id")
    .lean();
  const summary = {
    scanned: dueCycles.length,
    consumedCycles: 0,
    consumedDays: 0,
    expired: 0,
    skipped: 0,
    failed: 0,
  };
  for (const cycle of dueCycles) {
    try {
      const item =
        await consumeDueDailyLearningDays({
          cycleId: cycle._id,
          now: processedAt,
        });
      if (item.consumedDates.length) {
        summary.consumedCycles += 1;
        summary.consumedDays +=
          item.consumedDates.length;
      } else {
        summary.skipped += 1;
      }
      if (item.expired) {
        summary.expired += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error(
        `이용 주기 ${cycle._id} 일일 차감 실패:`,
        error
      );
    }
  }
  return summary;
}

async function processDepletedAccessCycles({
  now = new Date(),
  limit = 200,
} = {}) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 1, 1),
    1000
  );
  const cycles = await AccessCycle.find({
    status: "ACTIVE",
    availableLearningDays: 0,
    reservedLearningDays: { $in: [0, null] },
    lockedPaybackScoreDays: { $in: [0, null] },
    lockedLearningDays: 0,
  })
    .sort({ depletedAt: 1, _id: 1 })
    .limit(safeLimit)
    .select("_id")
    .lean();
  const summary = {
    scanned: cycles.length,
    expired: 0,
    pending: 0,
    failed: 0,
  };
  for (const cycle of cycles) {
    try {
      const item =
        await finalizeExpiredAccessCycle({
          cycleId: cycle._id,
          now,
        });
      if (item.expired && !item.replayed) {
        summary.expired += 1;
      } else {
        summary.pending += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error(
        `이용 주기 ${cycle._id} 만료 전환 실패:`,
        error
      );
    }
  }
  return summary;
}

async function runDailyAccessCycleSchedule() {
  if (dailyScheduleRunning) return;
  dailyScheduleRunning = true;
  try {
    await initializeMainInactivityWindows();
    await processDueDailyConsumptions();
    await processMainDormancyTransitions();
    const {
      cancelZeroAvailableMainInvitations,
      refreshMainInvitationOffers,
      synchronizeMainInvitationPauseState,
    } = require("./mainArenaMatchService");
    await synchronizeMainInvitationPauseState();
    await cancelZeroAvailableMainInvitations();
    await refreshMainInvitationOffers();
    const {
      expireMainShopEffects,
      processPendingMatchAnalyses,
    } = require("./arenaShopPolicyService");
    await expireMainShopEffects();
    await processPendingMatchAnalyses();
    const {
      openAnnualArenaSeason,
    } = require("./arenaSeasonService");
    await openAnnualArenaSeason();
    await processDepletedAccessCycles();
    await processDuePaybackReviewHolds();
    const {
      recalculateFinalRanking,
    } = require("./finalRankingService");
    await recalculateFinalRanking();
  } finally {
    dailyScheduleRunning = false;
  }
}

function startDailyAccessCycleScheduler({
  intervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
} = {}) {
  if (dailyScheduleTimer) {
    return dailyScheduleTimer;
  }
  const run = () => withSchedulerLease(
    { name: "ACCESS_CYCLE_DAILY", leaseMs: 15 * 60 * 1000 },
    runDailyAccessCycleSchedule
  );
  run().catch(
    (error) => {
      console.error(
        "정기권 학습 가능 일수 일일 차감 스케줄 초기화 실패:",
        error
      );
    }
  );
  dailyScheduleTimer = setInterval(
    () => {
      run().catch(
        (error) => {
          console.error(
            "정기권 학습 가능 일수 일일 차감 스케줄 처리 실패:",
            error
          );
        }
      );
    },
    Math.max(Number(intervalMs) || 0, 1000)
  );
  dailyScheduleTimer.unref?.();
  return dailyScheduleTimer;
}

function stopDailyAccessCycleScheduler() {
  if (dailyScheduleTimer) {
    clearInterval(dailyScheduleTimer);
    dailyScheduleTimer = null;
  }
}

module.exports = {
  buildDailyConsumptionPlan,
  buildDailyLedgerEntries,
  buildExpiredAccessStateUpdate,
  consumeDueDailyLearningDays,
  finalizeExpiredAccessCycle,
  processDepletedAccessCycles,
  processDueDailyConsumptions,
  startDailyAccessCycleScheduler,
  stopDailyAccessCycleScheduler,
  _testing: {
    dateKeyToDayNumber,
    dayNumberToDateKey,
    percentileFromPosition,
  },
};
