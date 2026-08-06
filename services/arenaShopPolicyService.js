const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { AdminActionLog, User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaTierQuestionCatalogVersion,
  MainInvitationRequest,
  MainShopEffect,
  MainShopPolicyVersion,
  MainShopPurchase,
} = require("../models/goatArenaModel");
const {
  addMatchTransfer,
  moveAvailable,
  settleLocked,
} = require("./mainLearningDayService");
const { scoreArenaAttempt } = require("./arenaMatchScoringService");
const {
  minimumPolicyEffectiveFrom,
} = require("./arenaPolicyService");
const {
  recordPolicyChangeScheduled,
} = require("./policyChangeOutboxService");
const {
  mainNormalMatchStakes,
} = require("./mainNormalMatchEconomyService");

const DAY_MS = 24 * 60 * 60 * 1000;

const MAIN_SHOP_POLICY_VERSION = "MAIN-SHOP-V1";
const DEFENSE_CONVENIENCE_COOLDOWN_DAYS = 7;
const SEASON_ROLLOVER_WINDOW_DAYS = 10;
const MATCH_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;
const MATCH_ANALYSIS_MAX_RETRIES = 2;

function buildMatchAnalysisQuestionReviews({
  problemPack,
  attempt,
  score,
  referenceQuestions = [],
} = {}) {
  const answerByKey = new Map(
    (attempt?.answers || []).map((answer) => [
      String(answer.questionKey),
      String(answer.value ?? ""),
    ])
  );
  const resultByKey = new Map(
    (score?.questionResults || []).map((result) => [
      String(result.questionKey),
      result,
    ])
  );
  const referenceByType = new Map();
  for (const reference of [...referenceQuestions].sort(
    (left, right) => Number(left.sequence || 0) - Number(right.sequence || 0)
  )) {
    if (
      String(reference.difficultyTier || "") ===
        String(problemPack?.difficultyTier || "") &&
      !referenceByType.has(String(reference.typeId || ""))
    ) {
      referenceByType.set(String(reference.typeId || ""), reference);
    }
  }
  return (problemPack?.questions || []).map((question, index) => {
    const key = String(question.questionKey || `Q${index + 1}`);
    const result = resultByKey.get(key) || {};
    const reference = referenceByType.get(String(question.typeId || ""));
    return {
      number: index + 1,
      questionKey: key,
      courseId: String(question.courseId || ""),
      typeId: String(question.typeId || ""),
      skillTags: (question.skillTags || []).map(String),
      prompt: String(question.prompt || ""),
      submittedAnswer: answerByKey.get(key) || "",
      correctAnswer: String(question.answer ?? ""),
      correct: result.correct === true,
      pointsAwarded: Number(result.pointsAwarded || 0),
      responseTimeMs:
        result.responseTimeMs === null || result.responseTimeMs === undefined
          ? null
          : Number(result.responseTimeMs),
      solution: String(question.solution || ""),
      referenceSolutionProcess: (reference?.solutionProcess || []).map((step) => ({
        step: Number(step.step),
        explanation: String(step.explanation || ""),
      })),
      referenceFinalCheck: String(reference?.finalCheck || ""),
    };
  });
}

const MAIN_SHOP_ITEMS = Object.freeze({
  MATCH_ANALYSIS: {
    itemCode: "MATCH_ANALYSIS",
    displayName: "Arena 경기 분석권",
    priceDays: 1,
  },
  DEFENSE_REST: {
    itemCode: "DEFENSE_REST",
    displayName: "방어 휴식권",
    priceDays: 1,
    cooldownGroup: "DEFENSE_CONVENIENCE",
  },
  DEFENSE_SCHEDULE_PROTECTION: {
    itemCode: "DEFENSE_SCHEDULE_PROTECTION",
    displayName: "방어 일정 보호권",
    priceDays: 2,
    cooldownGroup: "DEFENSE_CONVENIENCE",
  },
  INVITATION_ACCELERATION: {
    itemCode: "INVITATION_ACCELERATION",
    displayName: "초대 매칭 가속권",
    priceDays: 1,
  },
  MAIN_PROFILE_BORDER: {
    itemCode: "MAIN_PROFILE_BORDER",
    displayName: "Ranked 프로필 테두리",
    priceDays: 2,
  },
  STYLE_ENTRANCE: {
    itemCode: "STYLE_ENTRANCE",
    displayName: "스타일 칭호·입장 연출",
    priceDays: 1,
  },
});

function dateValue(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label}을 확인해주세요.`);
  }
  return date;
}

function compareAcceleratedInvitationRequests(left, right) {
  const leftAccelerated = Boolean(left.acceleratedAt);
  const rightAccelerated = Boolean(right.acceleratedAt);
  if (leftAccelerated !== rightAccelerated) {
    return leftAccelerated ? -1 : 1;
  }
  if (leftAccelerated && rightAccelerated) {
    const accelerationDifference =
      dateValue(left.acceleratedAt, "가속 적용 시각") -
      dateValue(right.acceleratedAt, "가속 적용 시각");
    if (accelerationDifference !== 0) return accelerationDifference;
  }
  const createdDifference =
    dateValue(left.createdAt, "초대 요청 시각") -
    dateValue(right.createdAt, "초대 요청 시각");
  if (createdDifference !== 0) return createdDifference;
  return String(left._id || left.requestId || "").localeCompare(
    String(right._id || right.requestId || "")
  );
}

function isDefenseConvenienceCooldownActive({
  lastDefenseRestUsedAt = null,
  lastScheduleProtectionUsedAt = null,
  now = new Date(),
}) {
  const current = dateValue(now, "현재 시각");
  const lastUsedAt = [lastDefenseRestUsedAt, lastScheduleProtectionUsedAt]
    .filter(Boolean)
    .map((value) => dateValue(value, "방어 편의 기능 사용 시각"))
    .sort((left, right) => right - left)[0];
  if (!lastUsedAt) return false;
  return (
    current.getTime() - lastUsedAt.getTime() <
    DEFENSE_CONVENIENCE_COOLDOWN_DAYS * DAY_MS
  );
}

function cosmeticEffectEndsAt({
  purchasedAt,
  currentSeasonEndsAt,
  nextSeasonEndsAt,
}) {
  const purchased = dateValue(purchasedAt, "구매 시각");
  const currentEnd = dateValue(currentSeasonEndsAt, "현재 시즌 종료 시각");
  const rolloverEligible =
    purchased <= currentEnd &&
    currentEnd.getTime() - purchased.getTime() <=
      SEASON_ROLLOVER_WINDOW_DAYS * DAY_MS;
  if (!rolloverEligible) return currentEnd;
  return dateValue(nextSeasonEndsAt, "다음 시즌 종료 시각");
}

function matchAnalysisFailureAction({ elapsedMs, retryCount }) {
  const timedOut = Number(elapsedMs) >= MATCH_ANALYSIS_TIMEOUT_MS;
  if (!timedOut) return "WAIT";
  return Number(retryCount) <= MATCH_ANALYSIS_MAX_RETRIES
    ? "RETRY"
    : "AUTO_REFUND";
}

function insuredCancelledStatisticsPolicy() {
  return {
    officialWinLossIncluded: false,
    officialMatchPerformanceIncluded: false,
    finalRankingMatchPerformanceIncluded: false,
    repeatOpponentExclusionIncluded: true,
    abuseDetectionIncluded: true,
  };
}

function serverOperatorFaultCompensationPolicy() {
  return {
    automaticGrant: false,
    grantMode: "ADMIN_ADJUSTMENT",
    requiresOperatorReview: true,
    requiresAuditLog: true,
    userFacingReasonRequired: true,
  };
}

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isSundayShopLocked(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const value = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return value.weekday === "Sun" && Number(value.hour) >= 15;
}

function seasonBoundaries(now = new Date()) {
  const year = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
    }).format(new Date(now))
  );
  return {
    currentSeasonEndsAt: new Date(`${year}-12-31T23:59:59.999+09:00`),
    nextSeasonEndsAt: new Date(`${year + 1}-12-31T23:59:59.999+09:00`),
  };
}

function defaultPolicyItems() {
  return Object.values(MAIN_SHOP_ITEMS).map((item) => {
    const releasePhase = [
      "MATCH_ANALYSIS",
      "DEFENSE_REST",
      "MAIN_PROFILE_BORDER",
      "STYLE_ENTRANCE",
    ].includes(item.itemCode) ? 1 : 2;
    return {
      itemCode: item.itemCode,
      displayName: item.displayName,
      priceDays: item.priceDays,
      enabled: releasePhase === 1,
      releasePhase,
    };
  });
}

async function ensureDefaultMainShopPolicy(now = new Date()) {
  const existing = await MainShopPolicyVersion.findOne({
    code: MAIN_SHOP_POLICY_VERSION,
  }).lean();
  if (existing) return existing;
  try {
    return (
      await MainShopPolicyVersion.create({
        code: MAIN_SHOP_POLICY_VERSION,
        displayName: "Ranked 상점 정책 v1",
        status: "ACTIVE",
        effectiveFrom: new Date("2026-08-02T00:00:00+09:00"),
        items: defaultPolicyItems(),
        defenseConvenienceCooldownDays: DEFENSE_CONVENIENCE_COOLDOWN_DAYS,
        cosmeticRolloverWindowDays: SEASON_ROLLOVER_WINDOW_DAYS,
        analysisTimeoutMs: MATCH_ANALYSIS_TIMEOUT_MS,
        analysisMaximumRetries: MATCH_ANALYSIS_MAX_RETRIES,
        changeSummary: "Ranked 상점 확정 정책 v1.0",
      })
    ).toObject();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return MainShopPolicyVersion.findOne({ code: MAIN_SHOP_POLICY_VERSION }).lean();
  }
}

async function getActiveMainShopPolicy(now = new Date(), session = null) {
  const query = MainShopPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: now },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: now } }],
  }).sort({ effectiveFrom: -1 });
  if (session) query.session(session);
  let policy = await query.lean();
  if (!policy && !session) {
    await ensureDefaultMainShopPolicy(now);
    policy = await MainShopPolicyVersion.findOne({
      status: "ACTIVE",
      effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: now } }],
    })
      .sort({ effectiveFrom: -1 })
      .lean();
  }
  if (!policy) {
    throw statusError(503, "현재 적용 중인 Ranked 상점 정책이 없습니다.", "MAIN_SHOP_POLICY_UNAVAILABLE");
  }
  return policy;
}

async function loadShopContext({ userId, now = new Date(), session = null }) {
  const userQuery = User.findById(userId).select(
    "accountStatus isActive privateMockRestriction"
  );
  const accessQuery = ArenaAccessState.findOne({ userId });
  const cycleQuery = AccessCycle.findOne({ userId, division: "MAIN", status: "ACTIVE" });
  if (session) {
    userQuery.session(session);
    accessQuery.session(session);
    cycleQuery.session(session);
  }
  const [user, accessState, cycle] = await Promise.all([
    userQuery.lean(),
    accessQuery.lean(),
    cycleQuery.lean(),
  ]);
  const eligible = Boolean(
    user &&
      user.accountStatus === "active" &&
      user.isActive !== false &&
      user.privateMockRestriction?.active !== true &&
      accessState?.state === "PAID_ACTIVE" &&
      accessState?.currentCompetitiveDivision === "MAIN" &&
      accessState?.currentSeasonPlacementCompleted === true &&
      cycle
  );
  if (!eligible) {
    throw statusError(403, "Ranked 활성 사용자만 상점을 이용할 수 있습니다.", "MAIN_SHOP_ACCESS_REQUIRED");
  }
  if (isSundayShopLocked(now)) {
    throw statusError(409, "일요일 15시부터 월요일 0시까지는 Ranked 상점을 이용할 수 없습니다.", "SUNDAY_MAIN_SHOP_LOCK");
  }
  return { user, accessState, cycle };
}

function burnedAvailableState(cycle, priceDays) {
  const locked = moveAvailable(cycle, priceDays, "lockedDays");
  return settleLocked(
    { learningDayBuckets: locked.buckets },
    { returnDays: 0, removeDays: priceDays }
  );
}

async function writeCycleState({ cycle, state, session }) {
  const result = await AccessCycle.updateOne(
    {
      _id: cycle._id,
      status: "ACTIVE",
      availableLearningDays: Number(cycle.availableLearningDays || 0),
      reservedLearningDays: Number(cycle.reservedLearningDays || 0),
      lockedLearningDays: Number(cycle.lockedLearningDays || 0),
    },
    {
      $set: {
        learningDayBuckets: state.buckets,
        availableLearningDays: state.availableLearningDays,
        reservedLearningDays: state.reservedLearningDays,
        lockedLearningDays: state.lockedLearningDays,
      },
    },
    { session }
  );
  if (!result.modifiedCount) {
    throw statusError(409, "학습일수 잔액이 변경되었습니다. 다시 시도해주세요.", "MAIN_SHOP_BALANCE_CONFLICT");
  }
}

function ledgerBalance(cycle, state) {
  return {
    availableLearningDays: state.availableLearningDays,
    paybackScoreDays: Number(cycle.paybackScoreDays || 0),
    lockedLearningDays: state.lockedLearningDays,
    reservedLearningDays: state.reservedLearningDays,
  };
}

async function recordShopLedger({
  userId,
  cycle,
  purchaseId,
  idempotencyKey,
  eventType,
  availableDelta,
  lockedDelta = 0,
  state,
  now,
  metadata = {},
  session,
}) {
  await ArenaLearningDayLedger.create(
    [
      {
        userId,
        accessCycleId: cycle._id,
        idempotencyKey,
        eventType,
        availableLearningDaysDelta: availableDelta,
        lockedLearningDaysDelta: lockedDelta,
        reservedLearningDaysDelta: 0,
        paybackScoreDaysDelta: 0,
        balanceAfter: ledgerBalance(cycle, state),
        sourceType: "MainShopPurchase",
        sourceId: purchaseId,
        occurredAt: now,
        metadata,
      },
    ],
    { session, ordered: true }
  );
}

async function activeDefenseCooldown(userId, now, session = null) {
  const query = MainShopEffect.findOne({
    userId,
    itemCode: { $in: ["DEFENSE_REST", "DEFENSE_SCHEDULE_PROTECTION"] },
    status: { $in: ["ACTIVE", "APPLIED", "EXPIRED"] },
    startsAt: { $gt: new Date(new Date(now).getTime() - DEFENSE_CONVENIENCE_COOLDOWN_DAYS * DAY_MS) },
  });
  if (session) query.session(session);
  return query.lean();
}

async function validateItemTarget({ itemCode, userId, relatedMatchId, relatedInvitationId, now, session }) {
  if (itemCode === "DEFENSE_REST") {
    if (await activeDefenseCooldown(userId, now, session)) {
      throw statusError(409, "방어 편의 기능은 7일에 한 번만 사용할 수 있습니다.", "DEFENSE_CONVENIENCE_COOLDOWN");
    }
    return { effectStatus: "ACTIVE", endsAt: new Date(new Date(now).getTime() + DAY_MS), metadata: {} };
  }
  if (itemCode === "INVITATION_ACCELERATION") {
    const invitation = await MainInvitationRequest.findOne({
      _id: relatedInvitationId,
      initiatorUserId: userId,
      status: { $in: ["SEARCHING", "OFFERED", "PAUSED"] },
      acceleratedAt: null,
    }).session(session);
    if (!invitation) {
      throw statusError(409, "가속할 수 있는 대기 중 초대 요청을 찾을 수 없습니다.", "MAIN_INVITATION_ACCELERATION_TARGET_REQUIRED");
    }
    const active = await MainShopEffect.findOne({
      userId,
      itemCode,
      status: "ACTIVE",
      endsAt: { $gt: now },
    }).session(session).lean();
    if (active) {
      throw statusError(409, "동시에 한 개의 초대 요청만 가속할 수 있습니다.", "MAIN_INVITATION_ACCELERATION_ALREADY_ACTIVE");
    }
    return {
      invitation,
      effectStatus: "ACTIVE",
      endsAt: new Date(new Date(now).getTime() + 48 * 60 * 60 * 1000),
      metadata: {},
    };
  }
  if (itemCode === "MATCH_ANALYSIS") {
    const match = await ArenaMatch.findOne({
      _id: relatedMatchId,
      status: "SETTLED",
      $or: [{ "challenger.userId": userId }, { "defender.userId": userId }],
    }).session(session).lean();
    if (!match) {
      throw statusError(409, "정상 정산이 끝난 본인 경기만 분석할 수 있습니다.", "MATCH_ANALYSIS_TARGET_REQUIRED");
    }
    const attempt = await ArenaMatchAttempt.findOne({ matchId: match._id, userId })
      .session(session)
      .lean();
    return {
      effectStatus: "PENDING",
      endsAt: null,
      metadata: {
        matchId: String(match._id),
        analysisState: "QUEUED",
        retryCount: 0,
        queuedAt: now,
      },
    };
  }
  if (["MAIN_PROFILE_BORDER", "STYLE_ENTRANCE"].includes(itemCode)) {
    const active = await MainShopEffect.findOne({
      userId,
      itemCode,
      status: "ACTIVE",
      endsAt: { $gt: now },
    }).session(session).lean();
    if (active) {
      throw statusError(409, "이미 현재 시즌에 적용 중인 장식입니다.", "MAIN_COSMETIC_ALREADY_ACTIVE");
    }
    const boundaries = seasonBoundaries(now);
    return {
      effectStatus: "ACTIVE",
      endsAt: cosmeticEffectEndsAt({ purchasedAt: now, ...boundaries }),
      metadata: { rolloverApplied: new Date(now) > new Date(boundaries.currentSeasonEndsAt.getTime() - SEASON_ROLLOVER_WINDOW_DAYS * DAY_MS) },
    };
  }
  throw statusError(400, "상점 아이템을 확인해주세요.", "UNKNOWN_MAIN_SHOP_ITEM");
}

async function purchaseMainShopItem({
  userId,
  itemCode,
  requestId = randomUUID(),
  relatedMatchId = null,
  relatedInvitationId = null,
  now = new Date(),
}) {
  const code = String(itemCode || "").trim().toUpperCase();
  if (code === "DEFENSE_SCHEDULE_PROTECTION") {
    return useDefenseScheduleProtection({ userId, matchId: relatedMatchId, requestId, now });
  }
  const policy = await getActiveMainShopPolicy(now);
  const item = policy.items.find((entry) => entry.itemCode === code && entry.enabled);
  if (!item) throw statusError(404, "현재 판매 중인 아이템이 아닙니다.", "MAIN_SHOP_ITEM_NOT_AVAILABLE");
  const purchaseKey = `${userId}:${code}:${String(requestId || "")}`;
  const replay = await MainShopPurchase.findOne({ purchaseKey }).lean();
  if (replay) return { purchase: replay, replayed: true };
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const existing = await MainShopPurchase.findOne({ purchaseKey }).session(session).lean();
      if (existing) {
        result = { purchase: existing, replayed: true };
        return;
      }
      const context = await loadShopContext({ userId, now, session });
      if (Number(context.cycle.availableLearningDays || 0) <= Number(item.priceDays)) {
        throw statusError(409, "구매 후 최소 1일의 학습일수가 남아야 합니다.", "MAIN_SHOP_LAST_DAY_PROTECTED");
      }
      const target = await validateItemTarget({
        itemCode: code,
        userId,
        relatedMatchId,
        relatedInvitationId,
        now,
        session,
      });
      const state = burnedAvailableState(context.cycle, Number(item.priceDays));
      const purchaseId = new mongoose.Types.ObjectId();
      const effectId = new mongoose.Types.ObjectId();
      await writeCycleState({ cycle: context.cycle, state, session });
      const [purchase] = await MainShopPurchase.create(
        [
          {
            _id: purchaseId,
            purchaseKey,
            userId,
            accessCycleId: context.cycle._id,
            itemCode: code,
            itemDisplayName: item.displayName,
            policyVersionId: policy._id,
            policyVersionCode: policy.code,
            priceDays: item.priceDays,
            beforeAvailableDays: context.cycle.availableLearningDays,
            afterAvailableDays: state.availableLearningDays,
            relatedMatchId,
            relatedInvitationId,
            status: "COMPLETED",
            purchasedAt: now,
          },
        ],
        { session, ordered: true }
      );
      await MainShopEffect.create(
        [
          {
            _id: effectId,
            purchaseId,
            userId,
            itemCode: code,
            status: target.effectStatus,
            startsAt: now,
            endsAt: target.endsAt,
            relatedMatchId,
            relatedInvitationId,
            metadata: target.metadata,
            appliedAt: target.effectStatus === "APPLIED" ? now : null,
          },
        ],
        { session, ordered: true }
      );
      if (target.invitation) {
        target.invitation.acceleratedAt = now;
        target.invitation.accelerationEndsAt = target.endsAt;
        await target.invitation.save({ session });
      }
      await recordShopLedger({
        userId,
        cycle: context.cycle,
        purchaseId,
        idempotencyKey: `${purchaseId}:SHOP_ITEM_PURCHASE_BURN`,
        eventType: "SHOP_ITEM_PURCHASE_BURN",
        availableDelta: -Number(item.priceDays),
        state,
        now,
        metadata: { itemCode: code, policyVersionCode: policy.code },
        session,
      });
      const outboxEvents = [
        {
            eventType: "MainShopItemPurchased",
            aggregateType: "MainShopPurchase",
            aggregateId: purchaseId,
            idempotencyKey: `${purchaseId}:MainShopItemPurchased`,
            payload: { userId, itemCode: code, priceDays: item.priceDays },
        },
      ];
      if (target.effectStatus !== "PENDING") {
        outboxEvents.push({
            eventType: "MainShopEffectApplied",
            aggregateType: "MainShopEffect",
            aggregateId: effectId,
            idempotencyKey: `${effectId}:MainShopEffectApplied`,
            payload: { userId, itemCode: code, status: target.effectStatus },
        });
      }
      await ArenaOutboxEvent.create(outboxEvents, { session, ordered: true });
      result = { purchase: purchase.toObject(), effectId, replayed: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await MainShopPurchase.findOne({ purchaseKey }).lean();
      if (existing) return { purchase: existing, replayed: true };
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

async function useDefenseScheduleProtection({
  userId,
  matchId,
  requestId = randomUUID(),
  now = new Date(),
}) {
  const policy = await getActiveMainShopPolicy(now);
  const item = policy.items.find(
    (entry) => entry.itemCode === "DEFENSE_SCHEDULE_PROTECTION" && entry.enabled
  );
  if (!item) throw statusError(404, "현재 방어 일정 보호권을 사용할 수 없습니다.", "DEFENSE_PROTECTION_DISABLED");
  const purchaseKey = `${userId}:DEFENSE_SCHEDULE_PROTECTION:${String(requestId || "")}`;
  const replay = await MainShopPurchase.findOne({ purchaseKey }).lean();
  if (replay) return { purchase: replay, replayed: true };
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const context = await loadShopContext({ userId, now, session });
      if (Number(context.cycle.availableLearningDays || 0) <= 2) {
        throw statusError(409, "방어 일정 보호권 사용 후 최소 1일이 남아야 합니다.", "MAIN_SHOP_LAST_DAY_PROTECTED");
      }
      if (await activeDefenseCooldown(userId, now, session)) {
        throw statusError(409, "방어 편의 기능은 7일에 한 번만 사용할 수 있습니다.", "DEFENSE_CONVENIENCE_COOLDOWN");
      }
      const match = await ArenaMatch.findOne({
        _id: matchId,
        division: "MAIN",
        matchType: "NORMAL",
        matchOrigin: "MAIN_UPWARD_AUTO_MATCH",
        status: "READY",
        "defender.userId": userId,
      }).session(session);
      if (!match) throw statusError(409, "보호권을 적용할 수 있는 의무 방어 경기가 아닙니다.", "DEFENSE_PROTECTION_MATCH_REQUIRED");
      if (new Date(now).getTime() - new Date(match.readyAt || match.createdAt).getTime() > 3 * 60 * 60 * 1000) {
        throw statusError(409, "경기 배정 후 3시간이 지나 보호권을 사용할 수 없습니다.", "DEFENSE_PROTECTION_WINDOW_EXPIRED");
      }
      const attempts = await ArenaMatchAttempt.find({ matchId: match._id }).session(session).lean();
      if (
        attempts.length !== 2 ||
        attempts.some((attempt) => attempt.status !== "READY" || attempt.startedAt)
      ) {
        throw statusError(409, "문제 팩을 연 뒤에는 방어 일정 보호권을 사용할 수 없습니다.", "DEFENSE_PROTECTION_PACK_OPENED");
      }
      const attackerCycle = await AccessCycle.findById(match.challenger.accessCycleId).session(session).lean();
      if (!attackerCycle || Number(attackerCycle.lockedLearningDays || 0) < Number(match.challenger.stakeDays || 0)) {
        throw statusError(409, "공격자의 경기 예치 학습일수를 확인해주세요.", "DEFENSE_PROTECTION_ATTACKER_DEPOSIT_MISSING");
      }
      const {
        challengerStakeDays,
        defenderStakeDays,
        normalStakeMode,
      } = mainNormalMatchStakes(match);
      let attackerState = settleLocked(attackerCycle, {
        returnDays: challengerStakeDays,
        removeDays: challengerStakeDays,
      });
      attackerState = addMatchTransfer(attackerState, 1);
      const defenderReleased = settleLocked(context.cycle, {
        returnDays: defenderStakeDays,
        removeDays: defenderStakeDays,
      });
      const defenderState = burnedAvailableState(defenderReleased, 2);
      await writeCycleState({ cycle: attackerCycle, state: attackerState, session });
      await writeCycleState({ cycle: context.cycle, state: defenderState, session });
      const purchaseId = new mongoose.Types.ObjectId();
      const effectId = new mongoose.Types.ObjectId();
      const [purchase] = await MainShopPurchase.create(
        [
          {
            _id: purchaseId,
            purchaseKey,
            userId,
            accessCycleId: context.cycle._id,
            itemCode: item.itemCode,
            itemDisplayName: item.displayName,
            policyVersionId: policy._id,
            policyVersionCode: policy.code,
            priceDays: 2,
            beforeAvailableDays: context.cycle.availableLearningDays,
            afterAvailableDays: defenderState.availableLearningDays,
            relatedMatchId: match._id,
            status: "COMPLETED",
            purchasedAt: now,
          },
        ],
        { session, ordered: true }
      );
      await MainShopEffect.create(
        [
          {
            _id: effectId,
            purchaseId,
            userId,
            itemCode: item.itemCode,
            status: "APPLIED",
            startsAt: now,
            endsAt: new Date(new Date(now).getTime() + DEFENSE_CONVENIENCE_COOLDOWN_DAYS * DAY_MS),
            relatedMatchId: match._id,
            metadata: insuredCancelledStatisticsPolicy(),
            appliedAt: now,
          },
        ],
        { session, ordered: true }
      );
      match.status = "INSURED_CANCELLED";
      match.resolvedAt = now;
      match.settledAt = now;
      match.lastChangedAt = now;
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      await recordShopLedger({
        userId: match.challenger.userId,
        cycle: attackerCycle,
        purchaseId,
        idempotencyKey: `${match._id}:DEFENSE_PROTECTION_ATTACKER_RELEASE`,
        eventType: "DEFENSE_SCHEDULE_PROTECTION_DEPOSIT_RELEASE",
        availableDelta: challengerStakeDays,
        lockedDelta: -challengerStakeDays,
        state: attackerState,
        now,
        metadata: {
          depositReleasedDays: challengerStakeDays,
          normalStakeMode,
        },
        session,
      });
      await recordShopLedger({
        userId: match.challenger.userId,
        cycle: attackerCycle,
        purchaseId,
        idempotencyKey: `${match._id}:DEFENSE_PROTECTION_COMPENSATION_TRANSFER`,
        eventType: "DEFENSE_SCHEDULE_PROTECTION_COMPENSATION_TRANSFER",
        availableDelta: 1,
        state: attackerState,
        now,
        metadata: { compensationDays: 1, fromUserId: userId },
        session,
      });
      await recordShopLedger({
        userId,
        cycle: context.cycle,
        purchaseId,
        idempotencyKey: `${match._id}:DEFENSE_PROTECTION_DEFENDER_RELEASE`,
        eventType: "DEFENSE_SCHEDULE_PROTECTION_DEPOSIT_RELEASE",
        availableDelta: defenderStakeDays,
        lockedDelta: -defenderStakeDays,
        state: defenderState,
        now,
        metadata: {
          depositReleasedDays: defenderStakeDays,
          normalStakeMode,
        },
        session,
      });
      await recordShopLedger({
        userId,
        cycle: context.cycle,
        purchaseId,
        idempotencyKey: `${match._id}:DEFENSE_PROTECTION_BURN`,
        eventType: "DEFENSE_SCHEDULE_PROTECTION_BURN",
        availableDelta: -2,
        state: defenderState,
        now,
        metadata: { burnedDays: 1, compensationTransferredDays: 1 },
        session,
      });
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "MainShopItemPurchased",
            aggregateType: "MainShopPurchase",
            aggregateId: purchaseId,
            idempotencyKey: `${purchaseId}:MainShopItemPurchased`,
            payload: { userId, itemCode: item.itemCode, relatedMatchId: match._id },
          },
          {
            eventType: "MainShopEffectApplied",
            aggregateType: "MainShopEffect",
            aggregateId: effectId,
            idempotencyKey: `${effectId}:MainShopEffectApplied`,
            payload: { userId, itemCode: item.itemCode, matchStatus: "INSURED_CANCELLED" },
          },
          {
            eventType: "ArenaMatchInsuredCancelled",
            aggregateType: "ArenaMatch",
            aggregateId: match._id,
            idempotencyKey: `${match._id}:ArenaMatchInsuredCancelled`,
            payload: {
              userId,
              purchaseId,
              effectId,
              matchStatus: "INSURED_CANCELLED",
            },
          },
        ],
        { session, ordered: true }
      );
      result = { purchase: purchase.toObject(), matchId: match._id, replayed: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await MainShopPurchase.findOne({ purchaseKey }).lean();
      if (existing) return { purchase: existing, matchId: existing.relatedMatchId, replayed: true };
      throw statusError(
        409,
        "이미 방어 일정 보호권이 적용된 경기입니다.",
        "DEFENSE_PROTECTION_ALREADY_APPLIED"
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

async function expireMainShopEffects({ now = new Date() } = {}) {
  const effects = await MainShopEffect.find({
    status: "ACTIVE",
    endsAt: { $lte: now },
  }).lean();
  for (const effect of effects) {
    await MainShopEffect.updateOne(
      { _id: effect._id, status: "ACTIVE" },
      { $set: { status: "EXPIRED", expiredAt: now } }
    );
    if (effect.itemCode === "INVITATION_ACCELERATION" && effect.relatedInvitationId) {
      await MainInvitationRequest.updateOne(
        { _id: effect.relatedInvitationId },
        { $set: { accelerationEndsAt: now } }
      );
    }
    await ArenaOutboxEvent.create({
      eventType: "MainShopEffectExpired",
      aggregateType: "MainShopEffect",
      aggregateId: effect._id,
      idempotencyKey: `${effect._id}:MainShopEffectExpired`,
      payload: { userId: effect.userId, itemCode: effect.itemCode },
    }).catch((error) => {
      if (error?.code !== 11000) throw error;
    });
  }
  return effects.length;
}

async function reverseFailedAnalysis({ effect, reason, now }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await MainShopEffect.findOne({
        _id: effect._id,
        status: "PENDING",
      }).session(session);
      if (!current) return;
      const purchase = await MainShopPurchase.findOne({
        _id: current.purchaseId,
        status: "COMPLETED",
      }).session(session);
      if (!purchase) return;
      const cycle = await AccessCycle.findOne({
        _id: purchase.accessCycleId,
        status: "ACTIVE",
      }).session(session).lean();
      if (!cycle) {
        current.status = "FAILED";
        current.metadata = { ...current.metadata, analysisState: "REFUND_HELD", failureReason: reason };
        await current.save({ session });
        return;
      }
      const state = addMatchTransfer(cycle, Number(purchase.priceDays));
      await writeCycleState({ cycle, state, session });
      purchase.status = "REVERSED";
      purchase.reversedAt = now;
      purchase.reversalReason = reason;
      current.status = "CANCELLED";
      current.expiredAt = now;
      current.metadata = { ...current.metadata, analysisState: "AUTO_REFUNDED", failureReason: reason };
      await purchase.save({ session });
      await current.save({ session });
      await recordShopLedger({
        userId: purchase.userId,
        cycle,
        purchaseId: purchase._id,
        idempotencyKey: `${purchase._id}:SHOP_ITEM_PURCHASE_REVERSAL`,
        eventType: "SHOP_ITEM_PURCHASE_REVERSAL",
        availableDelta: Number(purchase.priceDays),
        state,
        now,
        metadata: { itemCode: purchase.itemCode, reason },
        session,
      });
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "MainShopItemReversed",
            aggregateType: "MainShopPurchase",
            aggregateId: purchase._id,
            idempotencyKey: `${purchase._id}:MainShopItemReversed`,
            payload: { userId: purchase.userId, reason },
          },
        ],
        { session, ordered: true }
      );
    });
  } finally {
    await session.endSession();
  }
}

async function processPendingMatchAnalyses({ now = new Date(), limit = 30 } = {}) {
  const effects = await MainShopEffect.find({
    itemCode: "MATCH_ANALYSIS",
    status: "PENDING",
  })
    .sort({ startsAt: 1 })
    .limit(Math.max(1, Math.min(100, Number(limit) || 30)))
    .lean();
  const summary = { scanned: effects.length, completed: 0, retried: 0, refunded: 0 };
  for (const effect of effects) {
    const previousRetryCount = Number(effect.metadata?.retryCount || 0);
    const previousElapsedMs = new Date(now).getTime() - new Date(effect.startsAt).getTime();
    if (previousRetryCount > MATCH_ANALYSIS_MAX_RETRIES) {
      if (previousElapsedMs >= MATCH_ANALYSIS_TIMEOUT_MS) {
        await reverseFailedAnalysis({
          effect,
          reason: effect.metadata?.lastFailureReason || "경기 분석 생성 제한시간 초과",
          now,
        });
        summary.refunded += 1;
      }
      continue;
    }
    try {
      const [match, attempt, problemPack] = await Promise.all([
        ArenaMatch.findOne({
          _id: effect.relatedMatchId,
          status: "SETTLED",
          $or: [{ "challenger.userId": effect.userId }, { "defender.userId": effect.userId }],
        }).lean(),
        ArenaMatchAttempt.findOne({ matchId: effect.relatedMatchId, userId: effect.userId }).lean(),
        ArenaMatch.findById(effect.relatedMatchId)
          .select("problemPackId")
          .lean()
          .then((row) => row?.problemPackId
            ? ArenaProblemPack.findById(row.problemPackId).select("+questions").lean()
            : null),
      ]);
      if (!match || !attempt || !problemPack) throw new Error("분석할 경기 자료가 완전하지 않습니다.");
      const score = scoreArenaAttempt({ attempt, problemPack });
      const questionByKey = new Map(
        (problemPack.questions || []).map((question) => [String(question.questionKey), question])
      );
      const incorrect = score.questionResults.filter((question) => !question.correct);
      const weakSkills = [...new Set(
        incorrect.flatMap((result) => questionByKey.get(result.questionKey)?.skillTags || [])
      )];
      await MainShopEffect.updateOne(
        { _id: effect._id, status: "PENDING" },
        {
          $set: {
            status: "APPLIED",
            appliedAt: now,
            metadata: {
              ...effect.metadata,
              analysisState: "READY",
              result: match.winnerRole === attempt.role ? "WIN" : "LOSS",
              score: score.score,
              correctCount: score.correctCount,
              totalSolveTimeMs: score.totalSolveTimeMs,
              incorrectQuestionKeys: incorrect.map((result) => result.questionKey),
              weakSkills,
              reviewProblemCount: Math.max(10, Math.min(15, incorrect.length * 3 || 10)),
              checklist: weakSkills.slice(0, 5),
              generatedAt: now,
            },
          },
        }
      );
      await ArenaOutboxEvent.create({
        eventType: "MainShopEffectApplied",
        aggregateType: "MainShopEffect",
        aggregateId: effect._id,
        idempotencyKey: `${effect._id}:MainShopEffectApplied`,
        payload: { userId: effect.userId, itemCode: "MATCH_ANALYSIS" },
      }).catch((outboxError) => {
        if (outboxError?.code !== 11000) throw outboxError;
      });
      summary.completed += 1;
    } catch (error) {
      const retryCount = Number(effect.metadata?.retryCount || 0) + 1;
      const elapsedMs = new Date(now).getTime() - new Date(effect.startsAt).getTime();
      const action = matchAnalysisFailureAction({ elapsedMs, retryCount });
      if (action === "AUTO_REFUND") {
        await reverseFailedAnalysis({ effect, reason: error.message, now });
        summary.refunded += 1;
      } else {
        await MainShopEffect.updateOne(
          { _id: effect._id, status: "PENDING" },
          {
            $set: {
              "metadata.retryCount": retryCount,
              "metadata.analysisState": "RETRY_WAIT",
              "metadata.lastFailureReason": String(error.message || "분석 생성 실패").slice(0, 300),
              "metadata.lastAttemptedAt": now,
            },
          }
        );
        summary.retried += 1;
      }
    }
  }
  return summary;
}

async function getMainShopPageData({ userId, now = new Date() }) {
  const [policy, context, effects, purchases, invitations] = await Promise.all([
    getActiveMainShopPolicy(now),
    loadShopContext({ userId, now }),
    MainShopEffect.find({ userId, status: { $in: ["PENDING", "ACTIVE", "APPLIED"] } })
      .sort({ startsAt: -1 })
      .lean(),
    MainShopPurchase.find({ userId }).sort({ purchasedAt: -1 }).limit(12).lean(),
    MainInvitationRequest.find({
      initiatorUserId: userId,
      status: { $in: ["SEARCHING", "OFFERED", "PAUSED"] },
    })
      .sort({ acceleratedAt: -1, createdAt: -1 })
      .lean(),
  ]);
  return {
    availableLearningDays: Number(context.cycle.availableLearningDays || 0),
    items: policy.items.filter((item) => item.enabled),
    effects,
    purchases,
    invitations,
    policyVersionCode: policy.code,
    policyDisplayName: policy.displayName || "Ranked 상점 운영 정책",
    policyEffectiveFrom: policy.effectiveFrom || null,
    sundayLocked: isSundayShopLocked(now),
  };
}

async function getMainShopAnalysisResult({ userId, effectId }) {
  if (!mongoose.isValidObjectId(effectId)) {
    throw statusError(404, "경기 분석 결과를 찾을 수 없습니다.", "MAIN_SHOP_ANALYSIS_NOT_FOUND");
  }
  const effect = await MainShopEffect.findOne({
    _id: effectId,
    userId,
    itemCode: "MATCH_ANALYSIS",
  }).lean();
  if (!effect) {
    throw statusError(404, "경기 분석 결과를 찾을 수 없습니다.", "MAIN_SHOP_ANALYSIS_NOT_FOUND");
  }
  const purchase = await MainShopPurchase.findOne({
    _id: effect.purchaseId,
    userId,
  }).lean();
  const isReady =
    effect.status === "APPLIED" && effect.metadata?.analysisState === "READY";
  let questionReviews = [];
  if (isReady && effect.relatedMatchId) {
    const match = await ArenaMatch.findOne({
      _id: effect.relatedMatchId,
      status: "SETTLED",
      $or: [{ "challenger.userId": userId }, { "defender.userId": userId }],
    })
      .select("problemPackId")
      .lean();
    if (!match?.problemPackId) {
      throw statusError(
        409,
        "분석권에 연결된 경기 문제를 확인할 수 없습니다.",
        "MAIN_SHOP_ANALYSIS_MATCH_DATA_MISSING"
      );
    }
    const [attempt, problemPack] = await Promise.all([
      ArenaMatchAttempt.findOne({ matchId: match._id, userId }).lean(),
      ArenaProblemPack.findById(match.problemPackId).select("+questions").lean(),
    ]);
    if (!attempt || !problemPack) {
      throw statusError(
        409,
        "분석권에 연결된 답안 또는 문제 팩을 확인할 수 없습니다.",
        "MAIN_SHOP_ANALYSIS_ATTEMPT_DATA_MISSING"
      );
    }
    const tierCatalog = problemPack.tierCatalogVersionId
      ? await ArenaTierQuestionCatalogVersion.findById(
          problemPack.tierCatalogVersionId
        )
          .select("referenceQuestions")
          .lean()
      : null;
    const score = scoreArenaAttempt({ attempt, problemPack });
    questionReviews = buildMatchAnalysisQuestionReviews({
      problemPack,
      attempt,
      score,
      referenceQuestions: tierCatalog?.referenceQuestions || [],
    });
  }
  return {
    id: String(effect._id),
    status: effect.status,
    analysisState: effect.metadata?.analysisState || "QUEUED",
    relatedMatchId: effect.relatedMatchId ? String(effect.relatedMatchId) : null,
    result: effect.metadata?.result || null,
    score: Number.isFinite(Number(effect.metadata?.score)) ? Number(effect.metadata.score) : null,
    correctCount: Number.isFinite(Number(effect.metadata?.correctCount))
      ? Number(effect.metadata.correctCount)
      : null,
    totalSolveTimeMs: Number.isFinite(Number(effect.metadata?.totalSolveTimeMs))
      ? Number(effect.metadata.totalSolveTimeMs)
      : null,
    incorrectQuestionKeys: effect.metadata?.incorrectQuestionKeys || [],
    weakSkills: effect.metadata?.weakSkills || [],
    reviewProblemCount: Number(effect.metadata?.reviewProblemCount || 0),
    checklist: effect.metadata?.checklist || [],
    questionReviews,
    generatedAt: effect.metadata?.generatedAt || effect.appliedAt || null,
    purchasedAt: purchase?.purchasedAt || effect.startsAt || null,
  };
}

async function getMainShopPolicyAdminData(now = new Date()) {
  await ensureDefaultMainShopPolicy(now);
  const [activePolicy, policies] = await Promise.all([
    getActiveMainShopPolicy(now),
    MainShopPolicyVersion.find().sort({ effectiveFrom: -1 }).limit(20).lean(),
  ]);
  return { activePolicy, policies };
}

async function updateMainShopPolicy({ adminUserId, itemPrices = {}, enabledItems = [], changeSummary = "", now = new Date() }) {
  await ensureDefaultMainShopPolicy(now);
  const current = await getActiveMainShopPolicy(now);
  const enabled = new Set((enabledItems || []).map((value) => String(value).toUpperCase()));
  const items = current.items.map((item) => {
    const price = Number(itemPrices[item.itemCode]);
    if (!Number.isSafeInteger(price) || price < 1 || price > 365) {
      throw statusError(400, `${item.displayName} 가격은 1~365일의 정수여야 합니다.`, "INVALID_MAIN_SHOP_PRICE");
    }
    return {
      itemCode: item.itemCode,
      displayName: item.displayName,
      priceDays: price,
      enabled: enabled.has(item.itemCode),
      releasePhase: item.releasePhase,
    };
  });
  if (!items.some((item) => item.enabled)) {
    throw statusError(400, "판매할 Ranked 상점 아이템을 한 개 이상 선택해주세요.", "MAIN_SHOP_ITEM_REQUIRED");
  }
  const session = await mongoose.startSession();
  let created;
  const effectiveFrom = minimumPolicyEffectiveFrom(now);
  try {
    await session.withTransaction(async () => {
      const existingAtStart = await MainShopPolicyVersion.findOne({
        status: "ACTIVE",
        effectiveFrom,
      }).session(session).lean();
      if (existingAtStart) {
        throw statusError(409, "같은 적용 시각에 이미 Ranked 상점 정책이 있습니다.");
      }
      const previous = await MainShopPolicyVersion.findOne({
        status: "ACTIVE",
        effectiveFrom: { $lt: effectiveFrom },
      }).sort({ effectiveFrom: -1 }).session(session).lean();
      const next = await MainShopPolicyVersion.findOne({
        status: "ACTIVE",
        effectiveFrom: { $gt: effectiveFrom },
      }).sort({ effectiveFrom: 1 }).session(session).lean();
      if (previous && (!previous.effectiveUntil || new Date(previous.effectiveUntil) > effectiveFrom)) {
        await MainShopPolicyVersion.updateOne(
          { _id: previous._id, status: "ACTIVE" },
          { $set: { effectiveUntil: effectiveFrom } },
          { session }
        );
      }
      const [document] = await MainShopPolicyVersion.create(
        [
          {
            code: `MAIN-SHOP-${effectiveFrom.toISOString().replace(/\D/g, "").slice(0, 14)}`,
            displayName: "Ranked 상점 운영 정책",
            status: "ACTIVE",
            effectiveFrom,
            effectiveUntil: next?.effectiveFrom || null,
            items,
            defenseConvenienceCooldownDays: current.defenseConvenienceCooldownDays,
            cosmeticRolloverWindowDays: current.cosmeticRolloverWindowDays,
            analysisTimeoutMs: current.analysisTimeoutMs,
            analysisMaximumRetries: current.analysisMaximumRetries,
            changeSummary: String(changeSummary || "").trim().slice(0, 1000),
          },
        ],
        { session, ordered: true }
      );
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.main-shop-policy-update",
            detail: "Ranked 상점 판매 가격·상태 변경",
            metadata: { policyId: String(document._id), policyCode: document.code },
          },
        ],
        { session, ordered: true }
      );
      await recordPolicyChangeScheduled({
        policyType: "MAIN_SHOP",
        policy: document,
        session,
      });
      created = document.toObject();
    });
  } finally {
    await session.endSession();
  }
  return created;
}

module.exports = {
  DEFENSE_CONVENIENCE_COOLDOWN_DAYS,
  MAIN_SHOP_ITEMS,
  MAIN_SHOP_POLICY_VERSION,
  MATCH_ANALYSIS_MAX_RETRIES,
  MATCH_ANALYSIS_TIMEOUT_MS,
  SEASON_ROLLOVER_WINDOW_DAYS,
  compareAcceleratedInvitationRequests,
  buildMatchAnalysisQuestionReviews,
  cosmeticEffectEndsAt,
  ensureDefaultMainShopPolicy,
  expireMainShopEffects,
  getActiveMainShopPolicy,
  getMainShopAnalysisResult,
  getMainShopPageData,
  getMainShopPolicyAdminData,
  insuredCancelledStatisticsPolicy,
  isDefenseConvenienceCooldownActive,
  isSundayShopLocked,
  matchAnalysisFailureAction,
  purchaseMainShopItem,
  processPendingMatchAnalyses,
  seasonBoundaries,
  serverOperatorFaultCompensationPolicy,
  useDefenseScheduleProtection,
  updateMainShopPolicy,
};
