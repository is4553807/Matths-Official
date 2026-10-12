const mongoose = require("mongoose");
const { AssessmentAttempt, User, AdminTodo, AdminActionLog } = require("../models/matthsModel");
const { ArenaCompetitiveProfile, ArenaPlacementAttemptAdjustment } = require("../models/goatArenaModel");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");

const NEW_PLACEMENT_CONTEXT = /^ARENA2:PLACEMENT:\d+$/;
const TERMINAL = ["submitted", "abandoned", "disqualified"];

function policyError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

async function placementBudget(userId, { session = null } = {}) {
  const attemptsQuery = AssessmentAttempt.find({
    userId, scopeType: "placement", placementPurpose: "INITIAL",
    placementContextKey: NEW_PLACEMENT_CONTEXT,
  }).sort({ createdAt: 1, _id: 1 }).lean();
  const adjustmentsQuery = ArenaPlacementAttemptAdjustment.find({ userId }).select("attemptId").lean();
  const attempts = await (session ? attemptsQuery.session(session) : attemptsQuery);
  const adjustments = await (session ? adjustmentsQuery.session(session) : adjustmentsQuery);
  const profileQuery = ArenaCompetitiveProfile.findOne({ userId }).select("placementProcessStartedAt").lean();
  const profile = await (session ? profileQuery.session(session) : profileQuery);
  const excluded = new Set(adjustments.map((item) => String(item.attemptId)));
  const eligible = attempts.filter((item) => !excluded.has(String(item._id)) &&
    // A submitted document without a finalized calibration or pending verification
    // is a partial server write, not a consumed or valid placement result.
    !(item.status === "submitted" && item.placementResult?.initialMmr == null &&
      item.placementResult?.verification?.result !== "pending") &&
    (!profile?.placementProcessStartedAt || new Date(item.createdAt) >= new Date(profile.placementProcessStartedAt)));
  const validAttempts = eligible.filter((item) => item.status === "submitted" &&
    item.placementResult?.verification?.result !== "pending" &&
    item.placementResult?.initialMmr != null &&
    Number.isFinite(Number(item.placementResult.initialMmr)) && Number(item.placementResult.initialMmr) >= 0);
  const activeAttempt = eligible.find((item) => item.status === "in-progress" ||
    (item.status === "submitted" && item.placementResult?.verification?.result === "pending"));
  const attemptsUsed = eligible.filter((item) => TERMINAL.includes(item.status)).length;
  return {
    attempts, currentAttempts: eligible, validAttempts, activeAttempt, attemptsUsed,
    nextContextKey: `ARENA2:PLACEMENT:${Math.max(0, ...attempts.map((item) => Number(item.placementContextKey.split(":").at(-1)))) + 1}`,
    reviewRequired: attemptsUsed >= GOAT_ARENA_V2_CONFIG.placement.maximumAttempts && validAttempts.length === 0,
  };
}

async function recordPlacementServerFailure({ userId, attemptId, error }) {
  if (error?.status && Number(error.status) < 500) return;
  const attempt = await AssessmentAttempt.findOne({ _id: attemptId, userId, scopeType: "placement" }).lean();
  if (!attempt || !NEW_PLACEMENT_CONTEXT.test(attempt.placementContextKey || "") ||
    !TERMINAL.includes(attempt.status) || attempt.placementResult?.verification?.result === "pending" ||
    attempt.placementResult?.initialMmr != null) return;
  // Called only from server-side exception boundaries, never from a client error
  // claim. Preserve the attempt and its answers; exclude it via an audit record.
  await ArenaPlacementAttemptAdjustment.updateOne({ attemptId }, { $setOnInsert: {
    attemptId, userId, kind: "SERVER_ERROR", requestId: `SERVER_ERROR:${attemptId}`,
    reason: `SERVER_FINALIZATION_FAILURE:${String(error?.code || error?.name || "ERROR").slice(0, 120)}`,
  } }, { upsert: true, runValidators: true });
}

async function requireArenaOperator(adminUserId, session = null) {
  if (!mongoose.isValidObjectId(adminUserId)) throw policyError(403, "운영자 승인이 필요합니다.", "ARENA_OPERATOR_REQUIRED");
  const query = User.findOne({ _id: adminUserId, role: "admin", accountStatus: "active", isActive: { $ne: false } }).lean();
  const admin = await (session ? query.session(session) : query);
  if (!admin) throw policyError(403, "활성 운영자만 이 작업을 승인할 수 있습니다.", "ARENA_OPERATOR_REQUIRED");
  return admin;
}

async function resetExhaustedArenaPlacements({ userId, adminUserId, requestId, reason }) {
  if (typeof requestId !== "string" || typeof reason !== "string") {
    throw policyError(400, "요청 ID와 검토 근거는 문자열이어야 합니다.", "PLACEMENT_RESET_INPUT_REQUIRED");
  }
  requestId = requestId.trim();
  reason = reason.trim();
  if (!mongoose.isValidObjectId(userId) || !requestId || requestId.length > 160 || !reason || reason.length > 1000) {
    throw policyError(400, "사용자, 요청 ID, 검토 근거가 필요합니다.", "PLACEMENT_RESET_INPUT_REQUIRED");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      await requireArenaOperator(adminUserId, session);
      const replay = await ArenaPlacementAttemptAdjustment.exists({ userId, requestId, kind: "OPERATOR_RESET" }).session(session);
      if (replay) { result = { reset: true, replayed: true }; return; }
      const profile = await ArenaCompetitiveProfile.findOne({ userId }).session(session);
      const budget = await placementBudget(userId, { session });
      if (!profile || profile.ratingInitializedAt || profile.placementFinalizedAt || budget.activeAttempt || !budget.reviewRequired) {
        throw policyError(409, "유효 결과 없이 다섯 기회를 소진한 계정만 검토 후 초기화할 수 있습니다.", "PLACEMENT_RESET_NOT_ALLOWED");
      }
      const alreadyExcluded = await ArenaPlacementAttemptAdjustment.find({ userId }).session(session).lean();
      const excluded = new Set(alreadyExcluded.map((item) => String(item.attemptId)));
      const consumed = budget.currentAttempts.filter((item) => TERMINAL.includes(item.status) && !excluded.has(String(item._id)));
      await ArenaPlacementAttemptAdjustment.create(consumed.map((attempt) => ({
        attemptId: attempt._id, userId, kind: "OPERATOR_RESET", authorizedBy: adminUserId,
        requestId: String(requestId).trim(), reason: String(reason).trim(),
      })), { session, ordered: true });
      await ArenaCompetitiveProfile.updateOne({ _id: profile._id }, { $set: {
        placementSamples: [], placementAttemptsUsed: 0, provisionalRating: null,
        provisionalRatingDeviation: null, provisionalTier: "UNPLACED",
      } }, { session });
      await AdminActionLog.create([{ adminUserId, targetUserId: userId, action: "arena.placement.authorized_reset",
        detail: String(reason).trim(), metadata: { requestId, attemptIds: consumed.map((item) => String(item._id)) } }], { session });
      await AdminTodo.updateMany({ sourceType: "ArenaPlacementExhausted", sourceId: profile._id, status: "pending" },
        { $set: { status: "completed", completedAt: new Date(), completedBy: adminUserId } }, { session });
      result = { reset: true, replayed: false, preservedAttempts: consumed.length };
    });
    return result;
  } finally { await session.endSession(); }
}

module.exports = { NEW_PLACEMENT_CONTEXT, placementBudget, recordPlacementServerFailure, requireArenaOperator, resetExhaustedArenaPlacements };
