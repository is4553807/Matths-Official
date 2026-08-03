const mongoose = require("mongoose");
const { UserNotification } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatchAttempt,
  ArenaOutboxEvent,
  ArenaStanding,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const { kstDateKey, kstMidnight } = require("./accessCycleService");
const { addMatchTransfer, normalizeBuckets } = require("./mainLearningDayService");

const MAIN_DORMANCY_DAYS = 20;
const DORMANCY_REASON_CODE = "MAIN_DORMANT_20_DAYS_INACTIVE";
const SUB_DEMOTION_REASON_CODE = "MAIN_DORMANCY_BALANCE_DEPLETED";
const DORMANCY_RESERVE_REASON_CODE = "MAIN_DORMANCY_RESERVED_FOR_REENTRY";

function dateKeyToDayNumber(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function dayNumberToDateKey(dayNumber) {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

function inactivityDayCount({ startedAt, now = new Date() }) {
  if (!startedAt) return 0;
  const startDay = dateKeyToDayNumber(kstDateKey(startedAt));
  const currentDay = dateKeyToDayNumber(kstDateKey(now));
  return Math.max(0, currentDay - startDay + 1);
}

function dormancyConsumptionThroughDate(startedAt, { allowFinalDay = false } = {}) {
  if (!startedAt) return null;
  const startDay = dateKeyToDayNumber(kstDateKey(startedAt));
  return dayNumberToDateKey(
    startDay + MAIN_DORMANCY_DAYS - (allowFinalDay ? 1 : 2)
  );
}

function nextKstMidnight(value) {
  const dateKey = kstDateKey(value);
  return new Date(kstMidnight(dateKey).getTime() + 86_400_000);
}

function isolateDormancyReserve(cycle) {
  const availableLearningDays = Math.max(0, Number(cycle?.availableLearningDays || 0));
  const lockedLearningDays = Math.max(0, Number(cycle?.lockedLearningDays || 0));
  const reservedLearningDays = Math.max(0, Number(cycle?.reservedLearningDays || 0));
  return {
    availableLearningDays,
    hasUnsettledLearningDays: lockedLearningDays > 0 || reservedLearningDays > 0,
    buckets: normalizeBuckets(cycle).map((bucket) => ({
      ...bucket,
      availableDays: 0,
    })),
  };
}

async function initializeMainInactivityWindows({ now = new Date(), limit = 1000 } = {}) {
  const states = await ArenaAccessState.find({
    currentCompetitiveDivision: "MAIN",
    state: "PAID_ACTIVE",
    mainInactivityStartedAt: null,
  })
    .limit(Math.max(1, Math.min(5000, Number(limit) || 1000)))
    .lean();
  if (!states.length) return { scanned: 0, initialized: 0 };

  const cycles = await AccessCycle.find({
    _id: { $in: states.map((state) => state.accessCycleId).filter(Boolean) },
    division: "MAIN",
    status: "ACTIVE",
    availableLearningDays: { $gte: MAIN_DORMANCY_DAYS },
    dailyConsumptionPausedAt: null,
  }).lean();
  const cycleById = new Map(cycles.map((cycle) => [String(cycle._id), cycle]));
  let initialized = 0;
  for (const state of states) {
    const cycle = cycleById.get(String(state.accessCycleId));
    if (!cycle) continue;
    const baseline = state.lastMainQualifyingActivityAt || cycle.startsAt || now;
    const startedAt = nextKstMidnight(baseline);
    const result = await ArenaAccessState.updateOne(
      { _id: state._id, mainInactivityStartedAt: null, state: "PAID_ACTIVE" },
      {
        $set: {
          mainInactivityStartedAt: startedAt,
          mainInactivityStartAvailableDays: Number(cycle.availableLearningDays),
        },
      }
    );
    initialized += result.modifiedCount;
  }
  return { scanned: states.length, initialized };
}

async function refundTwentiethDayConsumption({ state, cycle, activityAt, session }) {
  if (
    inactivityDayCount({ startedAt: state.mainInactivityStartedAt, now: activityAt }) !==
      MAIN_DORMANCY_DAYS ||
    cycle.lastConsumptionDateKst !== kstDateKey(activityAt)
  ) {
    return cycle;
  }
  const idempotencyKey = `${cycle._id}:${kstDateKey(activityAt)}:MAIN_DORMANCY_DAY20_ACTIVITY_REFUND`;
  if (await ArenaLearningDayLedger.exists({ idempotencyKey }).session(session)) {
    return cycle;
  }
  const restored = addMatchTransfer(cycle, 1);
  await AccessCycle.updateOne(
    { _id: cycle._id, status: "ACTIVE", availableLearningDays: cycle.availableLearningDays },
    {
      $set: {
        availableLearningDays: restored.availableLearningDays,
        learningDayBuckets: restored.buckets,
        depletedAt: null,
      },
    },
    { session }
  );
  await ArenaLearningDayLedger.create(
    [
      {
        userId: state.userId,
        accessCycleId: cycle._id,
        idempotencyKey,
        eventType: "ADMIN_ADJUSTMENT",
        availableLearningDaysDelta: 1,
        balanceAfter: {
          availableLearningDays: restored.availableLearningDays,
          paybackScoreDays: cycle.paybackScoreDays,
          lockedLearningDays: cycle.lockedLearningDays,
          reservedLearningDays: cycle.reservedLearningDays || 0,
        },
        sourceType: "ArenaAccessState",
        sourceId: state._id,
        occurredAt: activityAt,
        metadata: { reason: "DAY_20_QUALIFYING_ACTIVITY" },
      },
    ],
    { session }
  );
  return { ...cycle, availableLearningDays: restored.availableLearningDays };
}

async function recordMainQualifyingActivity({ userId, activityAt = new Date(), sourceType }) {
  if (!mongoose.isValidObjectId(userId)) return { recorded: false, reason: "INVALID_USER" };
  const currentTime = new Date(activityAt);
  const session = await mongoose.startSession();
  let result = { recorded: false, reason: "NOT_MAIN" };
  try {
    await session.withTransaction(async () => {
      const state = await ArenaAccessState.findOne({ userId }).session(session).lean();
      if (!state || state.currentCompetitiveDivision !== "MAIN") return;
      let cycle = state.accessCycleId
        ? await AccessCycle.findById(state.accessCycleId).session(session).lean()
        : null;
      if (!cycle) return;

      if (state.state !== "PAID_ACTIVE") {
        result = { recorded: false, reason: "MAIN_NOT_ACTIVE" };
        return;
      }
      cycle = await refundTwentiethDayConsumption({
        state,
        cycle,
        activityAt: currentTime,
        session,
      });

      await ArenaAccessState.updateOne(
        { _id: state._id },
        {
          $set: {
            state: "PAID_ACTIVE",
            lastMainQualifyingActivityAt: currentTime,
            mainInactivityStartedAt: null,
            mainInactivityStartAvailableDays: null,
            mainDormancyStartedAt: null,
            mainDormancyFrozenLearningDays: null,
            mainDormancyRecoveryMode: null,
            defensePoolEligible: true,
            weeklyMockEligible: true,
            finalRankingActive: true,
            reasonCode: "",
          },
        },
        { session }
      );
      await ArenaOutboxEvent.updateOne(
        { idempotencyKey: `main-activity:${userId}:${sourceType}:${currentTime.toISOString()}` },
        {
          $setOnInsert: {
            eventType: "MainQualifyingActivityRecorded",
            aggregateType: "ArenaAccessState",
            aggregateId: state._id,
            idempotencyKey: `main-activity:${userId}:${sourceType}:${currentTime.toISOString()}`,
            payload: { userId: String(userId), sourceType, activityAt: currentTime },
          },
        },
        { upsert: true, session }
      );
      result = { recorded: true, resumed: false };
    });
  } finally {
    await session.endSession();
  }
  if (result.recorded) {
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: currentTime });
  }
  return result;
}

async function recordSettledMainMatchActivities({ matchId, settledAt = new Date() }) {
  if (!mongoose.isValidObjectId(matchId)) return { recorded: 0 };
  const attempts = await ArenaMatchAttempt.find({
    matchId,
    status: "SUBMITTED",
  })
    .select("userId")
    .lean();
  const results = await Promise.all(
    attempts.map((attempt) =>
      recordMainQualifyingActivity({
        userId: attempt.userId,
        activityAt: settledAt,
        sourceType: `ARENA_MATCH:${matchId}`,
      })
    )
  );
  return { recorded: results.filter((item) => item.recorded).length };
}

async function transitionDormantState({ state, cycle, now, session }) {
  const startBalance = Number(state.mainInactivityStartAvailableDays || 0);
  if (startBalance < MAIN_DORMANCY_DAYS && state.state !== "MAIN_DORMANT") {
    return "NOT_READY";
  }
  const reserve = isolateDormancyReserve(cycle);
  if (reserve.hasUnsettledLearningDays) return "PENDING_SETTLEMENT";

  const reserveDays = reserve.availableLearningDays;
  const recoveryMode = reserveDays > 0
    ? "RESTORE_ON_MAIN_REENTRY"
    : "SUB_STANDARD_FLOW";
  const transitionKey = new Date(
    state.mainInactivityStartedAt || state.mainDormancyStartedAt || state.updatedAt || now
  ).toISOString();

  await Promise.all([
    AccessCycle.updateOne(
      { _id: cycle._id },
      {
        $set: {
          status: "EXPIRED",
          availableLearningDays: 0,
          learningDayBuckets: reserve.buckets,
          dailyConsumptionPausedAt: now,
          depletedAt: now,
        },
      },
      { session }
    ),
    ArenaAccessState.updateOne(
      { _id: state._id },
      {
        $set: {
          currentCompetitiveDivision: "SUB",
          state: "SUB_ACCESS_EXPIRED_LOCKED",
          currentSeasonPlacementCompleted: false,
          mainDormancyStartedAt: state.mainDormancyStartedAt || now,
          mainDormancyFrozenLearningDays: reserveDays,
          mainDormancyRecoveryMode: recoveryMode,
          finalRankingActive: false,
          defensePoolEligible: false,
          weeklyMockEligible: false,
          reasonCode: reserveDays > 0
            ? DORMANCY_RESERVE_REASON_CODE
            : SUB_DEMOTION_REASON_CODE,
        },
      },
      { session }
    ),
    ArenaStanding.updateOne(
      { _id: state.standingId },
      { $set: { status: "LOCKED" } },
      { session }
    ),
    LiveFinalRankingProfile.updateMany(
      { userId: state.userId },
      { $set: { status: "INACTIVE_DORMANT", stagedFinalRating: null, stagedFinalRank: null } },
      { session }
    ),
    UserNotification.create(
      [
        {
          userId: state.userId,
          title: "Main Division 휴면 강등",
          message: reserveDays > 0
            ? `20일 연속 공식 활동이 없어 Sub Division으로 강등되었습니다. 남아 있던 학습일수 ${reserveDays}일은 Sub Division에서 사용할 수 없으며, 일반 Sub 과정을 완료해 Main Division에 다시 진입할 때 복원됩니다.`
            : "20일 연속 공식 활동이 없어 학습일수를 모두 차감하고 Sub Division으로 강등되었습니다. 다시 이용하려면 일반 Sub Division 절차를 진행해야 합니다.",
          href: "/goat-arena/profile",
          kind: "account",
        },
      ],
      { session }
    ),
  ]);

  if (reserveDays > 0) {
    await ArenaLearningDayLedger.updateOne(
      { idempotencyKey: `${cycle._id}:MAIN_DORMANCY_RESERVE_HELD` },
      {
        $setOnInsert: {
          userId: state.userId,
          accessCycleId: cycle._id,
          idempotencyKey: `${cycle._id}:MAIN_DORMANCY_RESERVE_HELD`,
          eventType: "MAIN_DORMANCY_RESERVE_HELD",
          availableLearningDaysDelta: -reserveDays,
          sourceBucket: "MAIN_DORMANCY_RESTORE",
          balanceAfter: {
            availableLearningDays: 0,
            paybackScoreDays: Number(cycle.paybackScoreDays || 0),
            lockedLearningDays: 0,
            reservedLearningDays: 0,
          },
          sourceType: "ArenaAccessState",
          sourceId: state._id,
          occurredAt: now,
          metadata: { reserveDays, transitionKey },
        },
      },
      { upsert: true, session }
    );
  }
  await ArenaOutboxEvent.updateOne(
    { idempotencyKey: `main-dormancy-demotion:${state.userId}:${transitionKey}` },
    {
      $setOnInsert: {
        eventType: "MainDormancyDemotedToSub",
        aggregateType: "ArenaAccessState",
        aggregateId: state._id,
        idempotencyKey: `main-dormancy-demotion:${state.userId}:${transitionKey}`,
        payload: {
          userId: String(state.userId),
          deductedDays: MAIN_DORMANCY_DAYS,
          reservedForMainReentryDays: reserveDays,
          recoveryMode,
        },
      },
    },
    { upsert: true, session }
  );
  return reserveDays > 0 ? "DEMOTED_WITH_RESERVE" : "DEMOTED_TO_SUB";
}

async function processMainDormancyTransitions({ now = new Date(), limit = 1000 } = {}) {
  const currentTime = new Date(now);
  const states = await ArenaAccessState.find({
    $or: [
      {
        mainInactivityStartedAt: { $ne: null },
        mainInactivityStartAvailableDays: { $gte: MAIN_DORMANCY_DAYS },
        mainDormancyRecoveryMode: null,
        currentCompetitiveDivision: "MAIN",
        state: "PAID_ACTIVE",
      },
      {
        mainInactivityStartedAt: { $ne: null },
        mainInactivityStartAvailableDays: MAIN_DORMANCY_DAYS,
        mainDormancyRecoveryMode: null,
        currentCompetitiveDivision: "SUB",
        state: "SUB_ACCESS_EXPIRED_LOCKED",
      },
      {
        currentCompetitiveDivision: "MAIN",
        state: "MAIN_DORMANT",
        mainDormancyRecoveryMode: "RESUME_MAIN",
      },
    ],
  })
    .limit(Math.max(1, Math.min(5000, Number(limit) || 1000)))
    .lean();
  const summary = { scanned: states.length, reserved: 0, demoted: 0, pending: 0 };
  for (const state of states) {
    const legacyDormant = state.state === "MAIN_DORMANT";
    if (
      !legacyDormant &&
      inactivityDayCount({ startedAt: state.mainInactivityStartedAt, now: currentTime }) <
      MAIN_DORMANCY_DAYS + 1
    ) {
      summary.pending += 1;
      continue;
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const freshState = await ArenaAccessState.findById(state._id).session(session).lean();
        const cycle = freshState?.accessCycleId
          ? await AccessCycle.findById(freshState.accessCycleId).session(session).lean()
          : null;
        if (!freshState || !cycle) return;
        if (
          freshState.mainDormancyRecoveryMode &&
          freshState.mainDormancyRecoveryMode !== "RESUME_MAIN"
        ) return;
        const outcome = await transitionDormantState({
          state: freshState,
          cycle,
          now: currentTime,
          session,
        });
        if (outcome === "DEMOTED_WITH_RESERVE") summary.reserved += 1;
        else if (outcome === "DEMOTED_TO_SUB") summary.demoted += 1;
        else summary.pending += 1;
      });
    } finally {
      await session.endSession();
    }
  }
  if (summary.reserved || summary.demoted) {
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: currentTime });
  }
  return summary;
}

async function synchronizeDormantArenaReturn({ userId, now = new Date() }) {
  if (!mongoose.isValidObjectId(userId)) {
    return { required: false, reason: "INVALID_USER" };
  }
  const currentTime = new Date(now);
  const session = await mongoose.startSession();
  let result = { required: false, resumed: false, reason: "NOT_DORMANCY_REENTRY" };
  let migratedLegacyDormancy = false;
  try {
    await session.withTransaction(async () => {
      const state = await ArenaAccessState.findOne({
        userId,
      })
        .session(session)
        .lean();
      if (!state) return;
      if (
        state.currentCompetitiveDivision === "MAIN" &&
        state.state === "MAIN_DORMANT" &&
        state.mainDormancyRecoveryMode === "RESUME_MAIN"
      ) {
        const cycle = await AccessCycle.findById(state.accessCycleId).session(session).lean();
        if (!cycle) {
          result = { required: false, resumed: false, reason: "DORMANT_CYCLE_NOT_AVAILABLE" };
          return;
        }
        const outcome = await transitionDormantState({
          state,
          cycle,
          now: currentTime,
          session,
        });
        migratedLegacyDormancy = outcome === "DEMOTED_WITH_RESERVE" || outcome === "DEMOTED_TO_SUB";
        result = {
          required: outcome === "DEMOTED_WITH_RESERVE",
          resumed: false,
          reason: outcome === "DEMOTED_WITH_RESERVE"
            ? "MAIN_REENTRY_REQUIRED"
            : "SUB_STANDARD_FLOW_REQUIRED",
          reservedLearningDays: outcome === "DEMOTED_WITH_RESERVE"
            ? Number(cycle.availableLearningDays || 0)
            : 0,
        };
        return;
      }
      if (state.mainDormancyRecoveryMode === "RESTORE_ON_MAIN_REENTRY") {
        result = {
          required: true,
          resumed: false,
          reason: "MAIN_REENTRY_REQUIRED",
          reservedLearningDays: Number(state.mainDormancyFrozenLearningDays || 0),
        };
      } else if (state.mainDormancyRecoveryMode === "SUB_STANDARD_FLOW") {
        result = { required: false, resumed: false, reason: "SUB_STANDARD_FLOW_REQUIRED" };
      }
    });
  } finally {
    await session.endSession();
  }
  if (migratedLegacyDormancy) {
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: currentTime });
  }
  return result;
}

module.exports = {
  DORMANCY_RESERVE_REASON_CODE,
  DORMANCY_REASON_CODE,
  MAIN_DORMANCY_DAYS,
  SUB_DEMOTION_REASON_CODE,
  dormancyConsumptionThroughDate,
  inactivityDayCount,
  isolateDormancyReserve,
  initializeMainInactivityWindows,
  processMainDormancyTransitions,
  recordMainQualifyingActivity,
  recordSettledMainMatchActivities,
  synchronizeDormantArenaReturn,
};
