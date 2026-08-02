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
const { addMatchTransfer } = require("./mainLearningDayService");

const MAIN_DORMANCY_DAYS = 20;
const DORMANCY_REASON_CODE = "MAIN_DORMANT_20_DAYS_INACTIVE";
const SUB_DEMOTION_REASON_CODE = "MAIN_DORMANCY_BALANCE_DEPLETED";

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

      if (state.state === "MAIN_DORMANT" && state.mainDormancyRecoveryMode === "RESUME_MAIN") {
        await AccessCycle.updateOne(
          { _id: cycle._id },
          { $set: { dailyConsumptionPausedAt: null } },
          { session }
        );
        await ArenaStanding.updateOne(
          { _id: state.standingId },
          { $set: { status: "ACTIVE" } },
          { session }
        );
        await UserNotification.create(
          [
            {
              userId,
              title: "Main Division 활동 재개",
              message: `동결된 정기권 학습 가능 일수 ${Number(
                state.mainDormancyFrozenLearningDays || cycle.availableLearningDays
              )}일로 Main Division 이용을 계속합니다.`,
              href: "/goat-arena",
              kind: "account",
            },
          ],
          { session }
        );
      } else if (state.state !== "PAID_ACTIVE") {
        result = { recorded: false, reason: "MAIN_NOT_ACTIVE" };
        return;
      } else {
        cycle = await refundTwentiethDayConsumption({
          state,
          cycle,
          activityAt: currentTime,
          session,
        });
      }

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
      result = { recorded: true, resumed: state.state === "MAIN_DORMANT" };
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
  if (startBalance === MAIN_DORMANCY_DAYS && Number(cycle.availableLearningDays) === 0) {
    await ArenaAccessState.updateOne(
      { _id: state._id },
      {
        $set: {
          currentCompetitiveDivision: "SUB",
          state: "SUB_ACCESS_EXPIRED_LOCKED",
          mainDormancyStartedAt: now,
          mainDormancyFrozenLearningDays: 0,
          mainDormancyRecoveryMode: "SUB_STANDARD_FLOW",
          finalRankingActive: false,
          defensePoolEligible: false,
          weeklyMockEligible: false,
          reasonCode: SUB_DEMOTION_REASON_CODE,
        },
      },
      { session }
    );
    await ArenaOutboxEvent.updateOne(
      { idempotencyKey: `main-dormancy-demotion:${state.userId}:${state.mainInactivityStartedAt.toISOString()}` },
      {
        $setOnInsert: {
          eventType: "MainDormancyDemotedToSub",
          aggregateType: "ArenaAccessState",
          aggregateId: state._id,
          idempotencyKey: `main-dormancy-demotion:${state.userId}:${state.mainInactivityStartedAt.toISOString()}`,
          payload: { userId: String(state.userId), deductedDays: MAIN_DORMANCY_DAYS },
        },
      },
      { upsert: true, session }
    );
    return "DEMOTED_TO_SUB";
  }
  if (startBalance >= MAIN_DORMANCY_DAYS + 1 && Number(cycle.availableLearningDays) > 0) {
    await Promise.all([
      AccessCycle.updateOne(
        { _id: cycle._id, status: "ACTIVE" },
        { $set: { dailyConsumptionPausedAt: now } },
        { session }
      ),
      ArenaAccessState.updateOne(
        { _id: state._id, state: "PAID_ACTIVE" },
        {
          $set: {
            state: "MAIN_DORMANT",
            mainDormancyStartedAt: now,
            mainDormancyFrozenLearningDays: Number(cycle.availableLearningDays),
            mainDormancyRecoveryMode: "RESUME_MAIN",
            finalRankingActive: false,
            defensePoolEligible: false,
            weeklyMockEligible: false,
            reasonCode: DORMANCY_REASON_CODE,
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
            title: "Main Division 휴면 전환",
            message: `공식 경기와 Matths 주간 공식 모의고사를 20일 연속 완료하지 않아 남은 학습일수 ${Number(
              cycle.availableLearningDays
            )}일을 동결했습니다. 공식 활동을 완료하면 Main Division에서 그대로 재개합니다.`,
            href: "/goat-arena",
            kind: "account",
          },
        ],
        { session }
      ),
    ]);
    await ArenaOutboxEvent.updateOne(
      { idempotencyKey: `main-dormancy:${state.userId}:${state.mainInactivityStartedAt.toISOString()}` },
      {
        $setOnInsert: {
          eventType: "MainDormancyStarted",
          aggregateType: "ArenaAccessState",
          aggregateId: state._id,
          idempotencyKey: `main-dormancy:${state.userId}:${state.mainInactivityStartedAt.toISOString()}`,
          payload: { userId: String(state.userId), frozenLearningDays: Number(cycle.availableLearningDays) },
        },
      },
      { upsert: true, session }
    );
    return "DORMANT";
  }
  return "NOT_READY";
}

async function processMainDormancyTransitions({ now = new Date(), limit = 1000 } = {}) {
  const currentTime = new Date(now);
  const states = await ArenaAccessState.find({
    mainInactivityStartedAt: { $ne: null },
    mainInactivityStartAvailableDays: { $gte: MAIN_DORMANCY_DAYS },
    mainDormancyRecoveryMode: null,
    $or: [
      { currentCompetitiveDivision: "MAIN", state: "PAID_ACTIVE" },
      { currentCompetitiveDivision: "SUB", state: "SUB_ACCESS_EXPIRED_LOCKED" },
    ],
  })
    .limit(Math.max(1, Math.min(5000, Number(limit) || 1000)))
    .lean();
  const summary = { scanned: states.length, dormant: 0, demoted: 0, pending: 0 };
  for (const state of states) {
    if (
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
        if (!freshState || !cycle || freshState.mainDormancyRecoveryMode) return;
        const outcome = await transitionDormantState({
          state: freshState,
          cycle,
          now: currentTime,
          session,
        });
        if (outcome === "DORMANT") summary.dormant += 1;
        else if (outcome === "DEMOTED_TO_SUB") summary.demoted += 1;
        else summary.pending += 1;
      });
    } finally {
      await session.endSession();
    }
  }
  if (summary.dormant || summary.demoted) {
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
  let result = { required: false, reason: "NOT_MAIN_DORMANT" };
  try {
    await session.withTransaction(async () => {
      const state = await ArenaAccessState.findOne({
        userId,
        currentCompetitiveDivision: "MAIN",
        state: "MAIN_DORMANT",
        mainDormancyRecoveryMode: "RESUME_MAIN",
      })
        .session(session)
        .lean();
      if (!state) return;
      const cycle = await AccessCycle.findOne({
        _id: state.accessCycleId,
        status: "ACTIVE",
        availableLearningDays: { $gt: 0 },
      })
        .session(session)
        .lean();
      if (!cycle) {
        result = { required: false, reason: "DORMANT_CYCLE_NOT_AVAILABLE" };
        return;
      }
      const idempotencyKey = `main-dormancy-resume:${userId}:${new Date(
        state.mainDormancyStartedAt || state.updatedAt
      ).toISOString()}`;
      await Promise.all([
        AccessCycle.updateOne(
          { _id: cycle._id },
          { $set: { dailyConsumptionPausedAt: null } },
          { session }
        ),
        ArenaAccessState.updateOne(
          { _id: state._id, state: "MAIN_DORMANT" },
          {
            $set: {
              state: "PAID_ACTIVE",
              mainInactivityStartedAt: nextKstMidnight(currentTime),
              mainInactivityStartAvailableDays: Number(cycle.availableLearningDays),
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
        ),
        ArenaStanding.updateOne(
          { _id: state.standingId },
          { $set: { status: "ACTIVE" } },
          { session }
        ),
        UserNotification.create(
          [
            {
              userId,
              title: "Main Division 활동 재개",
              message: `동결된 정기권 학습 가능 일수 ${Number(
                cycle.availableLearningDays
              )}일로 Main Division 이용을 계속합니다. 로그인만으로 공식 활동 기록이 초기화되지는 않습니다.`,
              href: "/goat-arena",
              kind: "account",
            },
          ],
          { session }
        ),
        ArenaOutboxEvent.updateOne(
          { idempotencyKey },
          {
            $setOnInsert: {
              eventType: "MainDormancyResumed",
              aggregateType: "ArenaAccessState",
              aggregateId: state._id,
              idempotencyKey,
              payload: {
                userId: String(userId),
                restoredLearningDays: Number(cycle.availableLearningDays),
              },
            },
          },
          { upsert: true, session }
        ),
      ]);
      result = { required: true, resumed: true, restoredLearningDays: cycle.availableLearningDays };
    });
  } finally {
    await session.endSession();
  }
  if (result.resumed) {
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: currentTime });
  }
  return result;
}

module.exports = {
  DORMANCY_REASON_CODE,
  MAIN_DORMANCY_DAYS,
  SUB_DEMOTION_REASON_CODE,
  dormancyConsumptionThroughDate,
  inactivityDayCount,
  initializeMainInactivityWindows,
  processMainDormancyTransitions,
  recordMainQualifyingActivity,
  recordSettledMainMatchActivities,
  synchronizeDormantArenaReturn,
};
