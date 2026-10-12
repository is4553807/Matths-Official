"use strict";

const { updateGlicko2Player } = require("./glicko2Service");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");

function outcomeForWinner(winnerRole) {
  if (!winnerRole) return "DRAW";
  return String(winnerRole).toUpperCase() === "CHALLENGER" ? "WIN" : "LOSS";
}

function scoreForOutcome(outcome) {
  if (outcome === "WIN") return 1;
  if (outcome === "LOSS") return 0;
  return 0.5;
}

function streakFields(mode) {
  return String(mode).toUpperCase() === "COMPETITIVE"
    ? {
        type: "competitiveCurrentStreakType",
        count: "competitiveCurrentStreakCount",
      }
    : {
        type: "normalCurrentStreakType",
        count: "normalCurrentStreakCount",
      };
}

function reversalDeltaMultiplier(profile, mode, outcome) {
  if (outcome === "DRAW") return 1;
  const fields = streakFields(mode);
  const priorType = String(profile?.[fields.type] || "NONE").toUpperCase();
  const priorCount = Math.max(0, Number(profile?.[fields.count]) || 0);
  const reversed =
    (outcome === "WIN" && priorType === "LOSS") ||
    (outcome === "LOSS" && priorType === "WIN");
  const policy = GOAT_ARENA_V2_CONFIG.adaptiveRating;
  if (!reversed || priorCount < policy.reversalMinimumStreak) return 1;
  return Math.max(
    policy.reversalMinimumMultiplier,
    1 - (priorCount - 1) * policy.reversalDeltaStep
  );
}

function updateStreak(profile, mode, outcome) {
  const fields = streakFields(mode);
  if (outcome === "DRAW") {
    profile[fields.type] = "NONE";
    profile[fields.count] = 0;
    return;
  }
  const priorType = String(profile?.[fields.type] || "NONE").toUpperCase();
  const priorCount = Math.max(0, Number(profile?.[fields.count]) || 0);
  profile[fields.type] = outcome;
  profile[fields.count] = priorType === outcome ? priorCount + 1 : 1;
}

function adaptiveRatingUpdate({
  before,
  opponent,
  winnerRole,
  profile,
  mode,
}) {
  const normalizedMode = String(mode || "NORMAL").toUpperCase();
  const outcome = outcomeForWinner(winnerRole);
  const rawAfter = updateGlicko2Player(before, [{
    opponent,
    score: scoreForOutcome(outcome),
  }]);
  const reversalMultiplier = reversalDeltaMultiplier(
    profile,
    normalizedMode,
    outcome
  );
  // RD and volatility already make uncertain profiles move more and gradually
  // converge as evidence accumulates. Keep that curve continuous instead of
  // introducing an artificial fifth/sixth-match step.
  const deltaMultiplier = reversalMultiplier;
  const after = {
    ...rawAfter,
    rating:
      Number(before.rating) +
      (Number(rawAfter.rating) - Number(before.rating)) * deltaMultiplier,
  };

  updateStreak(profile, normalizedMode, outcome);
  return {
    after,
    audit: {
      policyVersion: "ARENA_ADAPTIVE_GLICKO2_V1",
      outcome,
      reversalMultiplier,
      convergencePolicy: "GLICKO2_RD_CONTINUOUS_V1",
      deltaMultiplier,
      rawRatingAfter: rawAfter.rating,
      rawRatingDeviationAfter: rawAfter.ratingDeviation,
      rawVolatilityAfter: rawAfter.volatility,
    },
  };
}

module.exports = {
  adaptiveRatingUpdate,
  outcomeForWinner,
  reversalDeltaMultiplier,
  updateStreak,
};
