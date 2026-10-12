"use strict";

const mongoose = require("mongoose");

const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaMatch,
  ArenaMatchEvidence,
  ArenaPlacementAttemptAdjustment,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const { ArenaNotificationEmailDelivery, ArenaNativeCommandReceipt, ArenaAssetDeletionTask } = require("../models/arenaDeliveryModel");
const { AdminActionLog, AdminTodo, User } = require("../models/matthsModel");
const { getAccountPlanConfig } = require("./accountPlanService");
const { getMatchmakingControl } = require("./arenaMatchmakingControlService");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");

const ACTIVE_MATCH_STATUSES = Object.freeze([
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "EVIDENCE_REQUIRED",
  "SUBMITTED",
  "HELD",
]);

function countMap(rows, primaryKey, secondaryKey = "") {
  const result = {};
  for (const row of rows || []) {
    const primary = String(row?._id?.[primaryKey] || row?._id || "UNKNOWN");
    if (!secondaryKey) {
      result[primary] = Number(row.count || 0);
      continue;
    }
    const secondary = String(row?._id?.[secondaryKey] || "UNKNOWN");
    if (!result[primary]) result[primary] = {};
    result[primary][secondary] = Number(row.count || 0);
  }
  return result;
}

function ttlMinutes(milliseconds) {
  return Math.round(Number(milliseconds || 0) / 60000);
}

function publicConfig() {
  const plan = getAccountPlanConfig();
  const config = GOAT_ARENA_V2_CONFIG;
  return {
    rulesetVersion: config.rulesetVersion,
    availability: { alwaysOpen: true, timezone: "Asia/Seoul" },
    plans: [
      { code: "FREE", label: "무료 플랜", priceAmount: 0, billingPeriodDays: 0 },
      {
        code: "PRO",
        label: "Pro 플랜",
        priceAmount: plan.proPriceAmount,
        billingPeriodDays: plan.proBillingPeriodDays,
      },
    ],
    normal: {
      questionCount: 5,
      minutesPerQuestion: 10,
      historicalMatchmaking: true,
      questionRepeatWindowMatches: config.asyncNormal.questionRepeatWindowMatches,
      solutionUploadRequired: true,
      affectsPublicMmr: false,
      affectsHiddenMatchmakingMmr: true,
      comparisonPolicy: "DIFFICULTY_CORRECTNESS_TIME_V1",
      difficultyMetric: "정오답·문항 난도·풀이 시간 기반 내부 평가",
      integrityChecks: true,
      integrityPenalty: false,
      flaggedRecordPoolPolicy: "OPERATOR_REVIEW_REQUIRED",
    },
    competitive: {
      enabled: config.asyncCompetitive.enabled,
      requiredNormalMatches: config.requiredNormalMatches,
      placementAttempts: {
        minimum: config.placement.minimumAttempts,
        maximum: config.placement.maximumAttempts,
      },
      questionCount: 5,
      minutesPerQuestion: 10,
      historicalMatchmaking: true,
      comparisonPolicy: "DIFFICULTY_CORRECTNESS_TIME_V1",
      difficultyMetric: "문항별 정답률 기반 내부 난도 보정 지표",
      currentChallengerOnlyRatingUpdate: true,
      publicScore: {
        kFactor: config.competitiveScore.kFactor,
        ratingScale: config.competitiveScore.ratingScale,
        minimumScore: config.competitiveScore.minimumScore,
      },
      solutionUploadRequired: true,
      integrityChecks: true,
      glicko2: {
        defaultRating: config.glicko2.defaultRating,
        defaultRatingDeviation: config.glicko2.defaultRatingDeviation,
        defaultVolatility: config.glicko2.defaultVolatility,
        tau: config.glicko2.systemConstant,
        placementRatingDeviationBySampleCount:
          config.placement.ratingDeviationByAttemptCount,
        placementVolatilityBySampleCount:
          config.placement.volatilityByAttemptCount,
        convergencePolicy: "GLICKO2_RD_CONTINUOUS_V1",
      },
      tiers: config.tiers,
    },
    friendly: {
      questionCount: 5,
      minutesPerQuestion: 10,
      solutionUploadRequired: true,
      affectsMmr: false,
      affectsXp: false,
      defaultRatingWhenBothRatingsMissing: config.asyncNormal.defaultRating,
      integrityChecks: false,
    },
    guestFriendly: {
      authenticatedSenderRequired: true,
      guestLoginRequired: false,
      linkTtlMinutes: ttlMinutes(config.guestChallenge.linkTtlMs),
      participantLimit: config.guestChallenge.participantLimit,
      leaderboardAttemptPolicy: config.guestChallenge.leaderboardAttemptPolicy,
      unlimitedRetries: config.guestChallenge.unlimitedRetries,
      nicknameRequired: true,
      solutionUploadRequired: true,
      integrityChecks: false,
    },
    weeklyMock: {
      participantResultAffectsMmr: true,
      absentMmrDelta: 0,
    },
  };
}

async function getAdminArenaV2Overview({ now = new Date() } = {}) {
  const [
    matchmaking,
    totalProfiles,
    placedProfiles,
    unlockedProfiles,
    profileTiers,
    recordRows,
    matchRows,
    ratingSettlements,
    guestRows,
    guestParticipantRows,
    guestAttemptRows,
    adjustmentRows,
    placementReviewProfiles,
    normalRecordReviewRows,
    planRows,
    recentRatingSettlementRows,
  ] = await Promise.all([
    getMatchmakingControl(),
    ArenaCompetitiveProfile.countDocuments({}),
    ArenaCompetitiveProfile.countDocuments({
      placementFinalizedAt: { $ne: null },
      rating: { $ne: null },
    }),
    ArenaCompetitiveProfile.countDocuments({
      normalMatchesCompleted: { $gte: GOAT_ARENA_V2_CONFIG.requiredNormalMatches },
    }),
    ArenaCompetitiveProfile.aggregate([
      { $group: { _id: "$tier", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    ArenaCompetitiveRecord.aggregate([
      { $group: { _id: { mode: "$recordMode", status: "$status" }, count: { $sum: 1 } } },
    ]),
    ArenaMatch.aggregate([
      { $group: { _id: { mode: "$gameMode", status: "$status" }, count: { $sum: 1 } } },
    ]),
    ArenaRatingSettlement.countDocuments({ mode: "COMPETITIVE" }),
    ArenaGuestChallenge.aggregate([
      {
        $project: {
          effectiveStatus: {
            $cond: [
              { $eq: ["$status", "REVOKED"] },
              "REVOKED",
              { $cond: [{ $lte: ["$expiresAt", now] }, "EXPIRED", "OPEN"] },
            ],
          },
        },
      },
      { $group: { _id: "$effectiveStatus", count: { $sum: 1 } } },
    ]),
    ArenaGuestChallengeAttempt.aggregate([
      { $group: { _id: { challengeId: "$challengeId", guestIdentityId: "$guestIdentityId" } } },
      { $count: "count" },
    ]),
    ArenaGuestChallengeAttempt.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ArenaPlacementAttemptAdjustment.aggregate([
      { $group: { _id: "$kind", count: { $sum: 1 } } },
    ]),
    ArenaCompetitiveProfile.find({
      placementAttemptsUsed: { $gte: GOAT_ARENA_V2_CONFIG.placement.maximumAttempts },
      placementFinalizedAt: null,
      "placementSamples.0": { $exists: false },
    })
      .select("userId placementAttemptsUsed placementSamples updatedAt")
      .populate("userId", "name realName email")
      .sort({ updatedAt: 1 })
      .limit(100)
      .lean(),
    ArenaCompetitiveRecord.find({
      recordMode: "NORMAL",
      status: "REVIEW_REQUIRED",
    })
      .select("ownerUserId sourceMatchId integrityFlags createdAt")
      .populate("ownerUserId", "name realName email")
      .sort({ createdAt: 1 })
      .limit(100)
      .lean(),
    User.aggregate([
      { $match: { role: { $ne: "admin" } } },
      { $group: { _id: { $ifNull: ["$accountPlan.code", "FREE"] }, count: { $sum: 1 } } },
    ]),
    ArenaRatingSettlement.find({
      mode: "COMPETITIVE",
      settledAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    })
      .select("outcome challenger settledAt")
      .lean(),
  ]);

  const matches = countMap(matchRows, "mode", "status");
  const activeMatchesByMode = {};
  for (const [mode, statuses] of Object.entries(matches)) {
    activeMatchesByMode[mode] = ACTIVE_MATCH_STATUSES.reduce(
      (sum, status) => sum + Number(statuses[status] || 0),
      0
    );
  }

  const mmrDeltas = recentRatingSettlementRows
    .map((entry) => Number(entry.challenger?.rating?.delta))
    .filter(Number.isFinite);
  const scoreDeltas = recentRatingSettlementRows
    .map((entry) => Number(entry.challenger?.competitiveScore?.delta))
    .filter(Number.isFinite);
  const mean = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const net = (values) => values.reduce((sum, value) => sum + value, 0);
  const averageMmrDelta = mean(mmrDeltas);
  const driftThreshold = GOAT_ARENA_V2_CONFIG.competitiveScore.driftWarningAverage;
  const outcomes = ["CHALLENGER_WIN", "DEFENDER_WIN", "DRAW"].map((outcome) => {
    const rows = recentRatingSettlementRows.filter((entry) => entry.outcome === outcome);
    const outcomeMmrDeltas = rows
      .map((entry) => Number(entry.challenger?.rating?.delta))
      .filter(Number.isFinite);
    const outcomeScoreDeltas = rows
      .map((entry) => Number(entry.challenger?.competitiveScore?.delta))
      .filter(Number.isFinite);
    return {
      outcome,
      count: rows.length,
      averageMmrDelta: mean(outcomeMmrDeltas),
      averageScoreDelta: mean(outcomeScoreDeltas),
    };
  });
  const beforeRatings = recentRatingSettlementRows
    .map((entry) => Number(entry.challenger?.rating?.before))
    .filter(Number.isFinite);
  const afterRatings = recentRatingSettlementRows
    .map((entry) => Number(entry.challenger?.rating?.after))
    .filter(Number.isFinite);

  const [emailRetry, emailUnknown, deletionFailed, stalePurgeLease, pendingCommands, assetDeleteRetry] = await Promise.all([
    ArenaNotificationEmailDelivery.countDocuments({ status: "RETRY" }),
    ArenaNotificationEmailDelivery.countDocuments({ status: "UNKNOWN" }),
    ArenaMatchEvidence.countDocuments({ contentPurgedAt: null, purgeLastError: { $nin: ["", null] } }),
    ArenaMatchEvidence.countDocuments({ contentPurgedAt: null, retentionHoldReason: "EVIDENCE_PURGE_IN_PROGRESS", purgeLeaseExpiresAt: { $lte: now } }),
    ArenaNativeCommandReceipt.countDocuments({ status: { $in: ["PROCESSING", "UNKNOWN"] }, startedAt: { $lte: new Date(now.getTime() - 120000) } }),
    ArenaAssetDeletionTask.countDocuments({ status: "RETRY" }),
  ]);
  return {
    generatedAt: new Date(now),
    operationalDelivery: { emailRetry, emailUnknown, deletionFailed: deletionFailed + assetDeleteRetry, stalePurgeLease, pendingCommands },
    config: publicConfig(),
    matchmaking: {
      isPaused: matchmaking?.isPaused === true,
      reason: String(matchmaking?.reason || ""),
      pausedAt: matchmaking?.pausedAt || null,
      resumedAt: matchmaking?.resumedAt || null,
      lastAdmissionAt: matchmaking?.lastAdmissionAt || null,
      admissionSequence: Number(matchmaking?.admissionSequence || 0),
    },
    profiles: {
      total: totalProfiles,
      unlocked: unlockedProfiles,
      placed: placedProfiles,
      awaitingPlacement: Math.max(0, totalProfiles - placedProfiles),
      byTier: countMap(profileTiers),
    },
    records: countMap(recordRows, "mode", "status"),
    matches,
    activeMatchesByMode,
    ratingSettlements,
    oneSidedRatingHealth: {
      periodDays: 30,
      settlementCount: mmrDeltas.length,
      averageMmrDelta,
      netMmrDelta: net(mmrDeltas),
      averageAbsoluteMmrDelta: mean(mmrDeltas.map(Math.abs)),
      positiveMmrTotal: net(mmrDeltas.filter((value) => value > 0)),
      negativeMmrTotal: net(mmrDeltas.filter((value) => value < 0)),
      averageScoreDelta: mean(scoreDeltas),
      netScoreDelta: net(scoreDeltas),
      averageRatingBefore: mean(beforeRatings),
      averageRatingAfter: mean(afterRatings),
      outcomes,
      driftWarningThreshold: driftThreshold,
      status: !mmrDeltas.length
        ? "NO_DATA"
        : Math.abs(averageMmrDelta) > driftThreshold
          ? "REVIEW_REQUIRED"
          : "WITHIN_THRESHOLD",
    },
    guestChallenges: countMap(guestRows),
    guestParticipation: {
      uniqueParticipants: Number(guestParticipantRows[0]?.count || 0),
      attempts: countMap(guestAttemptRows),
    },
    placementAdjustments: countMap(adjustmentRows),
    placementReviewQueue: placementReviewProfiles.map((profile) => ({
      profileId: String(profile._id),
      userId: String(profile.userId?._id || profile.userId || ""),
      nickname: String(profile.userId?.name || ""),
      realName: String(profile.userId?.realName || ""),
      email: String(profile.userId?.email || ""),
      attemptsUsed: Number(profile.placementAttemptsUsed || 0),
      validSamples: Array.isArray(profile.placementSamples)
        ? profile.placementSamples.length
        : 0,
      updatedAt: profile.updatedAt || null,
    })),
    normalRecordReviewQueue: normalRecordReviewRows.map((record) => ({
      recordId: String(record._id),
      matchId: String(record.sourceMatchId || ""),
      userId: String(record.ownerUserId?._id || record.ownerUserId || ""),
      nickname: String(record.ownerUserId?.name || ""),
      realName: String(record.ownerUserId?.realName || ""),
      email: String(record.ownerUserId?.email || ""),
      integrityFlags: record.integrityFlags || [],
      createdAt: record.createdAt || null,
    })),
    accountPlans: countMap(planRows),
  };
}

async function reviewNormalRecordIntegrity({
  recordId,
  adminUserId,
  decision,
  note,
  now = new Date(),
}) {
  const normalizedDecision = String(decision || "").trim().toUpperCase();
  const decisionNote = String(note || "").trim().slice(0, 1000);
  if (!mongoose.isValidObjectId(recordId) || !mongoose.isValidObjectId(adminUserId)) {
    throw Object.assign(new Error("검토 대상과 운영자 정보를 확인해주세요."), { status: 400 });
  }
  if (!["APPROVE", "REJECT"].includes(normalizedDecision) || !decisionNote) {
    throw Object.assign(new Error("기록 풀 승인 여부와 검토 근거를 입력해주세요."), { status: 400 });
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const record = await ArenaCompetitiveRecord.findOne({
        _id: recordId,
        recordMode: "NORMAL",
      }).session(session);
      if (!record) {
        throw Object.assign(new Error("검토 대기 중인 일반전 기록을 찾을 수 없습니다."), {
          status: 404,
        });
      }
      if (record.status !== "REVIEW_REQUIRED") {
        const expectedStatus = normalizedDecision === "APPROVE" ? "AVAILABLE" : "INVALID";
        if (record.integrityReviewedAt && record.status === expectedStatus &&
            String(record.integrityReviewedBy) === String(adminUserId) && record.integrityReviewNote === decisionNote) {
          result = { recordId: String(record._id), status: record.status, userPenaltyApplied: false, emailSent: false, replayed: true };
          return;
        }
        throw Object.assign(new Error("이미 다른 검토 결정이 적용된 기록입니다."), { status: 409, code: "ARENA_REVIEW_DECISION_CONFLICT" });
      }
      record.status = normalizedDecision === "APPROVE" ? "AVAILABLE" : "INVALID";
      record.integrityReviewedAt = now;
      record.integrityReviewedBy = adminUserId;
      record.integrityReviewNote = decisionNote;
      await record.save({ session });
      await AdminActionLog.create([{
        adminUserId,
        targetUserId: record.ownerUserId,
        action: normalizedDecision === "APPROVE"
          ? "arena.normal_record.approved"
          : "arena.normal_record.rejected",
        detail: decisionNote,
        metadata: {
          recordId: String(record._id),
          matchId: String(record.sourceMatchId),
          anomalyFlags: record.integrityFlags || [],
          userPenaltyApplied: false,
          emailSent: false,
        },
      }], { session });
      await AdminTodo.updateMany(
        { sourceType: "ArenaNormalRecordIntegrityReview", sourceId: record._id },
        { $set: { status: "completed", completedAt: now, completedBy: adminUserId } },
        { session }
      );
      result = {
        recordId: String(record._id),
        status: record.status,
        userPenaltyApplied: false,
        emailSent: false,
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function getAdminArenaV2Audit({ now = new Date() } = {}) {
  const [overview, expiredReservations, asyncWithoutRecord, normalIntegrity, friendlyIntegrity, openExpiredGuestLinks] =
    await Promise.all([
      getAdminArenaV2Overview({ now }),
      ArenaCompetitiveRecord.countDocuments({
        status: "RESERVED",
        reservationExpiresAt: { $lte: now },
      }),
      ArenaMatch.countDocuments({
        gameMode: { $in: ["NORMAL", "COMPETITIVE"] },
        status: { $in: ACTIVE_MATCH_STATUSES },
        $and: [
          {
            $or: [
              { "competitiveAsync.enabled": true },
              { "normalAsync.enabled": true },
            ],
          },
          {
            $or: [
              {
                "competitiveAsync.enabled": true,
                "competitiveAsync.historicalRecordId": null,
              },
              {
                "normalAsync.enabled": true,
                "normalAsync.historicalRecordId": null,
                "normalAsync.baselineQuestionIds.4": { $exists: false },
              },
            ],
          },
        ],
      }),
      ArenaCompetitiveRecord.countDocuments({
        recordMode: "NORMAL",
        status: "REVIEW_REQUIRED",
      }),
      ArenaMatch.countDocuments({
        $and: [
          { $or: [{ gameMode: "FRIENDLY" }, { matchType: "FRIENDLY" }] },
          { $or: [{ status: "HELD" }, { integrityStatus: "SUSPICIOUS" }] },
        ],
      }),
      ArenaGuestChallenge.countDocuments({ status: "OPEN", expiresAt: { $lte: now } }),
    ]);

  const issues = [];
  const addIssue = (key, severity, title, detail, count) => {
    if (!count) return;
    issues.push({ key, severity, title, detail, count: Number(count) });
  };
  addIssue(
    "EXPIRED_RECORD_RESERVATION",
    "warning",
    "만료된 과거 기록 예약",
    "예약 해제 작업이 지연된 기록입니다. 다음 매칭 전에 예약 복구 작업을 확인하세요.",
    expiredReservations
  );
  addIssue(
    "ASYNC_MATCH_WITHOUT_RECORD",
    "critical",
    "비교 상대 데이터가 없는 경기",
    "진행 중인 일반전 또는 경쟁전에 사용자 기록이나 검수 완료 기준 문제 조합이 연결되지 않았습니다.",
    asyncWithoutRecord
  );
  addIssue(
    "NORMAL_RECORD_INTEGRITY_REVIEW",
    "warning",
    "일반전 기록 풀 검토 대기",
    "사용자에게 불이익은 적용하지 않았습니다. 운영자가 확인하기 전까지 해당 경기 기록만 다음 상대 기록 풀에서 제외됩니다.",
    normalIntegrity
  );
  addIssue(
    "FRIENDLY_INTEGRITY_REVIEW",
    "critical",
    "친선전에 무결성 검토가 적용됨",
    "친선전과 게스트 친선전은 부정행위 감지 대상이 아닙니다.",
    friendlyIntegrity
  );
  addIssue(
    "OPEN_EXPIRED_GUEST_LINK",
    "warning",
    "만료 후 OPEN 상태인 게스트 링크",
    "생성 후 3일이 지난 링크의 상태 정리가 지연됐습니다.",
    openExpiredGuestLinks
  );

  return {
    generatedAt: new Date(now),
    health: issues.some((issue) => issue.severity === "critical")
      ? "ACTION_REQUIRED"
      : issues.length
        ? "REVIEW_RECOMMENDED"
        : "HEALTHY",
    summary: {
      criticalCount: issues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0),
      warningCount: issues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0),
      activeMatches: Object.values(overview.activeMatchesByMode).reduce((sum, count) => sum + count, 0),
      availableNormalRecords: Number(overview.records.NORMAL?.AVAILABLE || 0),
      availableCompetitiveRecords: Number(overview.records.COMPETITIVE?.AVAILABLE || 0),
      ratingSettlements: overview.ratingSettlements,
      placedProfiles: overview.profiles.placed,
    },
    issues,
    overview,
  };
}

module.exports = {
  ACTIVE_MATCH_STATUSES,
  getAdminArenaV2Audit,
  getAdminArenaV2Overview,
  publicConfig,
  reviewNormalRecordIntegrity,
};
