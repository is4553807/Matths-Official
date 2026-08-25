const mongoose = require("mongoose");
const {
  ArenaMatch,
  ArenaMatchEvidence,
} = require("../models/goatArenaModel");

const ARENA_ACTIVITY_MAX_LEVEL = 10;
const ARENA_ACTIVITY_MATCH_TYPES = Object.freeze([
  "NORMAL",
  "REVENGE",
]);
const ARENA_ACTIVITY_COUNTED_STATUS = "SETTLED";

function requiredMatchesForLevel(level) {
  const normalizedLevel = Math.min(
    ARENA_ACTIVITY_MAX_LEVEL,
    Math.max(1, Math.floor(Number(level) || 1))
  );
  return (5 * normalizedLevel * (normalizedLevel - 1)) / 2;
}

function buildArenaActivityLevel(totalMatches) {
  const normalizedMatches = Math.max(
    0,
    Math.floor(Number(totalMatches) || 0)
  );
  let level = 1;

  for (
    let candidate = 2;
    candidate <= ARENA_ACTIVITY_MAX_LEVEL;
    candidate += 1
  ) {
    if (normalizedMatches < requiredMatchesForLevel(candidate)) break;
    level = candidate;
  }

  const currentLevelStart = requiredMatchesForLevel(level);
  const nextLevelThreshold =
    level < ARENA_ACTIVITY_MAX_LEVEL
      ? requiredMatchesForLevel(level + 1)
      : null;
  const matchesToNext =
    nextLevelThreshold === null
      ? 0
      : Math.max(0, nextLevelThreshold - normalizedMatches);
  const levelSpan =
    nextLevelThreshold === null
      ? 0
      : nextLevelThreshold - currentLevelStart;
  const levelProgress =
    nextLevelThreshold === null
      ? 100
      : Math.min(
          100,
          Math.round(
            ((normalizedMatches - currentLevelStart) / levelSpan) * 100
          )
        );

  return {
    level,
    maxLevel: ARENA_ACTIVITY_MAX_LEVEL,
    totalMatches: normalizedMatches,
    currentLevelStart,
    nextLevelThreshold,
    matchesToNext,
    levelProgress,
    isMaxLevel: level === ARENA_ACTIVITY_MAX_LEVEL,
  };
}

function completedEvidenceFilter(userIds) {
  return {
    userId: { $in: userIds },
    originalEvidenceSubmitted: true,
    submittedAt: { $ne: null },
  };
}

function normalizeObjectIds(userIds) {
  const uniqueIds = new Map();
  (Array.isArray(userIds) ? userIds : [userIds]).forEach((userId) => {
    if (!mongoose.isValidObjectId(userId)) return;
    const objectId = new mongoose.Types.ObjectId(String(userId));
    uniqueIds.set(String(objectId), objectId);
  });
  return [...uniqueIds.values()];
}

async function getArenaActivityLevel(userId) {
  const [normalizedUserId] = normalizeObjectIds([userId]);
  if (!normalizedUserId) return buildArenaActivityLevel(0);

  const levelsByUserId = await getArenaActivityLevels([
    normalizedUserId,
  ]);
  return (
    levelsByUserId.get(String(normalizedUserId)) ||
    buildArenaActivityLevel(0)
  );
}

async function getArenaActivityLevels(userIds) {
  const normalizedUserIds = normalizeObjectIds(userIds);
  const levelsByUserId = new Map(
    normalizedUserIds.map((userId) => [
      String(userId),
      buildArenaActivityLevel(0),
    ])
  );
  if (!normalizedUserIds.length) return levelsByUserId;

  const counts = await ArenaMatchEvidence.aggregate([
    { $match: completedEvidenceFilter(normalizedUserIds) },
    {
      $lookup: {
        from: ArenaMatch.collection.name,
        localField: "matchId",
        foreignField: "_id",
        as: "activityMatch",
      },
    },
    { $unwind: "$activityMatch" },
    {
      $match: {
        "activityMatch.status": ARENA_ACTIVITY_COUNTED_STATUS,
        "activityMatch.matchType": {
          $in: ARENA_ACTIVITY_MATCH_TYPES,
        },
      },
    },
    {
      $group: {
        _id: "$userId",
        totalMatches: { $sum: 1 },
      },
    },
  ]);

  counts.forEach((entry) => {
    levelsByUserId.set(
      String(entry._id),
      buildArenaActivityLevel(entry.totalMatches)
    );
  });
  return levelsByUserId;
}

module.exports = {
  ARENA_ACTIVITY_COUNTED_STATUS,
  ARENA_ACTIVITY_MATCH_TYPES,
  ARENA_ACTIVITY_MAX_LEVEL,
  buildArenaActivityLevel,
  getArenaActivityLevel,
  getArenaActivityLevels,
  requiredMatchesForLevel,
};
