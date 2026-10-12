const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { findActiveMatchForUser } = require("./arenaActiveMatchService");
const { getArenaV2QueueState } = require("./arenaV2MatchmakingService");
const { profileView, syncArenaV2PlacementProfile } = require("./arenaV2ProfileService");
const { getGoatArenaV22Rulebook } = require("./goatArenaV22RulebookService");

async function activeMatch(userId) {
  const match = await findActiveMatchForUser({ userId });
  if (!match) return null;
  return {
    id: String(match._id),
    arenaVersion: match.arenaVersion || "2.0",
    mode: match.gameMode || null,
    status: match.status,
  };
}

async function getGoatArenaV2ReadModel(user, now = new Date()) {
  const userId = user?._id || user?.id;
  const [profileDocument, queue, currentMatch] = await Promise.all([
    syncArenaV2PlacementProfile(userId),
    getArenaV2QueueState({ userId, now, rematch: false }),
    activeMatch(userId),
  ]);
  const profile = profileView(profileDocument);
  return {
    schemaVersion: "GOAT_ARENA_2_0",
    generatedAt: new Date(now).toISOString(),
    free: true,
    profile,
    modes: {
      normal: {
        label: "일반전",
        available: true,
        awardsXp: true,
        changesRating: false,
      },
      competitive: {
        label: "경쟁전",
        available: GOAT_ARENA_V2_CONFIG.asyncCompetitive.enabled && profile.unlocked,
        eligible: profile.unlocked,
        releaseStatus: GOAT_ARENA_V2_CONFIG.asyncCompetitive.enabled
          ? "ENABLED"
          : "DISABLED_PENDING_VALIDATION",
        awardsXp: true,
        changesRating: true,
        unlock: {
          normalMatchesCompleted: profile.normalMatchesCompleted,
          requiredNormalMatches: profile.requiredNormalMatches,
          placementFinalized: profile.placementFinalized,
        },
      },
      friendly: {
        label: "친선전",
        available: true,
        awardsXp: false,
        changesRating: false,
        friendsOnly: true,
      },
    },
    matchmaking: {
      pool: "ALL",
      curriculum: ["algebra", "calculus-1", "probability-statistics"],
      questionCount: 5,
      queue: queue
        ? {
            id: String(queue._id),
            mode: queue.mode,
            status: queue.status,
            joinedAt: queue.joinedAt,
            matchId: queue.matchId ? String(queue.matchId) : null,
          }
        : null,
    },
    activeMatch: currentMatch,
    placement: {
      minimumAttempts: GOAT_ARENA_V2_CONFIG.placement.minimumAttempts,
      maximumAttempts: GOAT_ARENA_V2_CONFIG.placement.maximumAttempts,
      completedAttempts: profile.placementAttempts,
      finalized: profile.placementFinalized,
      canTakeAnother: profile.canTakePlacement,
      provisionalTier: profile.provisionalTierLabel,
    },
  };
}

function goatArenaV2Rulebook(now = new Date(), division = null) {
  return getGoatArenaV22Rulebook(now, division);
}

module.exports = {
  getGoatArenaV2ReadModel,
  goatArenaV2Rulebook,
};
