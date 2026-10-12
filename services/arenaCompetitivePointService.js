"use strict";

const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { arenaTierForRating } = require("./arenaTierPolicy");

function outcomeScore(winnerRole) {
  if (!winnerRole) return 0.5;
  return String(winnerRole).toUpperCase() === "CHALLENGER" ? 1 : 0;
}

function expectedScore(playerMmr, opponentMmr) {
  const scale = GOAT_ARENA_V2_CONFIG.competitiveScore.ratingScale;
  return 1 / (1 + (10 ** ((Number(opponentMmr) - Number(playerMmr)) / scale)));
}

function initialCompetitiveScore(rating) {
  return Math.max(
    GOAT_ARENA_V2_CONFIG.competitiveScore.minimumScore,
    Math.round(Number(rating) || 0)
  );
}

function competitivePointUpdate({ beforeScore, playerMmr, opponentMmr, winnerRole }) {
  const scoreBefore = Number.isFinite(Number(beforeScore))
    ? Number(beforeScore)
    : initialCompetitiveScore(playerMmr);
  const expected = expectedScore(playerMmr, opponentMmr);
  const actual = outcomeScore(winnerRole);
  let requestedDelta = Math.round(
    GOAT_ARENA_V2_CONFIG.competitiveScore.kFactor * (actual - expected)
  );
  if (actual === 1 && requestedDelta < 1) requestedDelta = 1;
  if (actual === 0 && requestedDelta > -1) requestedDelta = -1;
  const after = Math.max(
    GOAT_ARENA_V2_CONFIG.competitiveScore.minimumScore,
    scoreBefore + requestedDelta
  );
  return {
    policyVersion: "ARENA_COMPETITIVE_POINTS_V1",
    before: scoreBefore,
    delta: after - scoreBefore,
    after,
    expectedOutcome: Math.round(expected * 10000) / 10000,
    actualOutcome: actual,
    tierBefore: arenaTierForRating(scoreBefore).code,
    tierAfter: arenaTierForRating(after).code,
  };
}

module.exports = {
  competitivePointUpdate,
  expectedScore,
  initialCompetitiveScore,
  outcomeScore,
};
