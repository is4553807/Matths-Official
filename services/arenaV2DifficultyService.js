"use strict";

const {
  resolveArenaDifficultyCode,
  resolveArenaDifficultyTier,
} = require("./arenaOneOnOneDifficultyPolicy");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { tierForRating } = require("./arenaV2ProfileService");

function effectiveArenaRating(
  profile,
  fallback = GOAT_ARENA_V2_CONFIG.glicko2.defaultRating,
  { includeNormal = false, preferNormal = false, finalizedOnly = false } = {}
) {
  const competitive = finalizedOnly
    ? (profile?.placementFinalizedAt ? profile?.rating : null)
    : (profile?.rating ?? profile?.provisionalRating);
  const normal = profile?.normalMatchmakingRating;
  const stored = preferNormal
    ? (normal ?? competitive)
    : (competitive ?? (includeNormal ? normal : null));
  if (stored === null || stored === undefined || stored === "") {
    return fallback;
  }
  const rating = Number(stored);
  return Number.isFinite(rating) && rating >= 0
    ? rating
    : fallback;
}

function ratingForArenaMode(profile, mode) {
  const normalizedMode = String(mode || "NORMAL").trim().toUpperCase();
  if (normalizedMode === "NORMAL") {
    return effectiveArenaRating(
      profile,
      GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating,
      { includeNormal: true, preferNormal: true }
    );
  }
  if (normalizedMode === "FRIENDLY") {
    return effectiveArenaRating(
      profile,
      GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating,
      { includeNormal: true, finalizedOnly: true }
    );
  }
  return effectiveArenaRating(
    profile,
    GOAT_ARENA_V2_CONFIG.glicko2.defaultRating
  );
}

function arenaV2DifficultyPlan({ mode, challengerProfile, defenderProfile }) {
  const normalizedMode = String(mode || "NORMAL").trim().toUpperCase();
  if (!["NORMAL", "COMPETITIVE", "FRIENDLY"].includes(normalizedMode)) {
    const error = new Error("경기 문제 난이도를 계산할 모드를 확인해주세요.");
    error.status = 400;
    error.code = "INVALID_ARENA_DIFFICULTY_MODE";
    throw error;
  }

  const challengerRating = ratingForArenaMode(challengerProfile, normalizedMode);
  const defenderRating = ratingForArenaMode(defenderProfile, normalizedMode);
  const rating = normalizedMode === "FRIENDLY"
    ? (challengerRating + defenderRating) / 2
    : challengerRating;
  const division = normalizedMode === "COMPETITIVE" ? "MAIN" : "SUB";
  const tier = tierForRating(rating).name;

  return {
    mode: normalizedMode,
    division,
    rating,
    tier,
    difficultyTier: resolveArenaDifficultyTier(tier, tier, { division }),
    difficultyCode: resolveArenaDifficultyCode(tier, tier, { division }),
    policy: normalizedMode === "FRIENDLY"
      ? "MEAN_PARTICIPANT_MMR_V1"
      : "CHALLENGER_MMR_V1",
  };
}

module.exports = {
  arenaV2DifficultyPlan,
  effectiveArenaRating,
  ratingForArenaMode,
};
