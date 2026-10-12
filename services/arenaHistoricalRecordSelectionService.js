"use strict";

const { ArenaCompetitiveRecord } = require("../models/goatArenaModel");

const OWNER_CANDIDATE_LIMIT = 200;
const RECORD_CANDIDATE_LIMIT = 50;

function normalizedRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0) {
    const error = new Error("과거 기록을 선택할 MMR을 확인해주세요.");
    error.status = 400;
    error.code = "ARENA_HISTORICAL_RECORD_RATING_INVALID";
    throw error;
  }
  return rating;
}

function distanceStage(rating) {
  return {
    $addFields: {
      matchmakingDistance: {
        $abs: { $subtract: ["$ratingSnapshot.rating", normalizedRating(rating)] },
      },
    },
  };
}

async function orderedHistoricalRecordOwners({ eligibility, rating, limit = OWNER_CANDIDATE_LIMIT }) {
  return ArenaCompetitiveRecord.aggregate([
    { $match: eligibility },
    distanceStage(rating),
    {
      $group: {
        _id: "$ownerUserId",
        bestDistance: { $min: "$matchmakingDistance" },
        totalUsageCount: { $sum: { $ifNull: ["$usageCount", 0] } },
        lastUsedAt: { $max: "$lastUsedAt" },
        oldestVerifiedAt: { $min: "$verifiedAt" },
        availableRecordCount: { $sum: 1 },
      },
    },
    {
      // MMR compatibility is primary. Exposure is counted once per owner so
      // prolific users do not receive extra lottery tickets merely by owning
      // more historical records.
      $sort: {
        bestDistance: 1,
        totalUsageCount: 1,
        lastUsedAt: 1,
        oldestVerifiedAt: 1,
        _id: 1,
      },
    },
    { $limit: Math.max(1, Number(limit) || OWNER_CANDIDATE_LIMIT) },
  ]);
}

async function orderedHistoricalRecordsForOwner({
  eligibility,
  ownerUserId,
  rating,
  limit = RECORD_CANDIDATE_LIMIT,
}) {
  return ArenaCompetitiveRecord.aggregate([
    { $match: { ...eligibility, ownerUserId } },
    distanceStage(rating),
    {
      $sort: {
        matchmakingDistance: 1,
        usageCount: 1,
        lastUsedAt: 1,
        verifiedAt: 1,
        _id: 1,
      },
    },
    { $limit: Math.max(1, Number(limit) || RECORD_CANDIDATE_LIMIT) },
  ]);
}

module.exports = {
  OWNER_CANDIDATE_LIMIT,
  RECORD_CANDIDATE_LIMIT,
  orderedHistoricalRecordOwners,
  orderedHistoricalRecordsForOwner,
};
