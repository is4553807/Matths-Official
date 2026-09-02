const mongoose = require("mongoose");
const {
  ArenaMatchEvidence,
} = require("../models/goatArenaModel");

const REVIEW_STATES = new Set(["normal", "suspicious", "inconclusive"]);

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  return error;
}

function requiredText(value, maximum, code) {
  const text = String(value || "").trim();
  if (!text || text.length > maximum) {
    throw statusError(400, "기기 검토 정보를 확인해주세요.", code);
  }
  return text;
}

function normalizeSignals(values) {
  if (!Array.isArray(values) || values.length > 20) {
    throw statusError(
      400,
      "기기 검토 신호 형식을 확인해주세요.",
      "ARENA_CLIENT_REVIEW_SIGNALS_INVALID"
    );
  }
  return [...new Set(values.map((value) => String(value || "").trim()))]
    .filter(Boolean)
    .map((value) => value.slice(0, 100));
}

async function attachArenaClientReview({
  matchId,
  evidenceId,
  userId,
  reviewId,
  model,
  modelVersion,
  reviewState,
  signals,
  completedAt,
  clientBuildVersion = "",
  now = new Date(),
}) {
  if (
    !mongoose.isValidObjectId(matchId) ||
    !mongoose.isValidObjectId(evidenceId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    throw statusError(
      404,
      "기기 검토를 연결할 풀이 증거를 찾을 수 없습니다.",
      "ARENA_CLIENT_REVIEW_EVIDENCE_NOT_FOUND"
    );
  }
  const normalizedReviewId = requiredText(
    reviewId,
    180,
    "ARENA_CLIENT_REVIEW_ID_INVALID"
  );
  const normalizedState = String(reviewState || "").trim().toLowerCase();
  if (!REVIEW_STATES.has(normalizedState)) {
    throw statusError(
      400,
      "기기 검토 상태를 확인해주세요.",
      "ARENA_CLIENT_REVIEW_STATE_INVALID"
    );
  }
  const finishedAt = new Date(completedAt);
  if (Number.isNaN(finishedAt.getTime()) || finishedAt > new Date(now.getTime() + 5 * 60 * 1000)) {
    throw statusError(
      400,
      "기기 검토 완료 시각을 확인해주세요.",
      "ARENA_CLIENT_REVIEW_TIME_INVALID"
    );
  }

  const target = await ArenaMatchEvidence.findOne({
    _id: evidenceId,
    matchId,
    userId,
  }).select("clientReview");
  if (!target) {
    throw statusError(
      404,
      "기기 검토를 연결할 풀이 증거를 찾을 수 없습니다.",
      "ARENA_CLIENT_REVIEW_EVIDENCE_NOT_FOUND"
    );
  }
  if (target.clientReview?.reviewId) {
    if (target.clientReview.reviewId === normalizedReviewId) {
      return { reviewId: normalizedReviewId, replayed: true, accepted: true };
    }
    throw statusError(
      409,
      "이 풀이 증거에는 이미 기기 검토 결과가 연결되어 있습니다.",
      "ARENA_CLIENT_REVIEW_ALREADY_ATTACHED"
    );
  }

  const review = {
    reviewId: normalizedReviewId,
    model: requiredText(model, 120, "ARENA_CLIENT_REVIEW_MODEL_INVALID"),
    modelVersion: requiredText(
      modelVersion,
      240,
      "ARENA_CLIENT_REVIEW_MODEL_VERSION_INVALID"
    ),
    reviewState: normalizedState,
    signals: normalizeSignals(signals),
    completedAt: finishedAt,
    receivedAt: now,
    clientBuildVersion: String(clientBuildVersion || "").trim().slice(0, 100),
  };
  const updated = await ArenaMatchEvidence.findOneAndUpdate(
    {
      _id: evidenceId,
      matchId,
      userId,
      "clientReview.reviewId": { $exists: false },
    },
    { $set: { clientReview: review } },
    { returnDocument: "after" }
  ).select("clientReview");
  if (updated) {
    return { reviewId: normalizedReviewId, replayed: false, accepted: true };
  }

  const raced = await ArenaMatchEvidence.findOne({
    _id: evidenceId,
    matchId,
    userId,
  }).select("clientReview");
  if (raced?.clientReview?.reviewId === normalizedReviewId) {
    return { reviewId: normalizedReviewId, replayed: true, accepted: true };
  }
  throw statusError(
    409,
    "이 풀이 증거에는 이미 다른 기기 검토 결과가 연결되어 있습니다.",
    "ARENA_CLIENT_REVIEW_ALREADY_ATTACHED"
  );
}

module.exports = {
  REVIEW_STATES,
  attachArenaClientReview,
};
