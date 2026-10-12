"use strict";

const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");

function publicTierLabel(tier) {
  return GOAT_ARENA_V2_CONFIG.tiers.find((entry) => entry.name === tier)?.label || tier;
}

function publicCompetitivePointChange(change) {
  if (!change || ![change.before, change.delta, change.after].every(Number.isFinite)) return null;
  return {
    kind: "PUBLIC_COMPETITIVE_POINTS",
    before: change.before, delta: change.delta, after: change.after,
    tierBefore: change.tierBefore, tierAfter: change.tierAfter,
    tierBeforeLabel: publicTierLabel(change.tierBefore),
    tierAfterLabel: publicTierLabel(change.tierAfter),
  };
}

function publicEvidenceResult(result) {
  const safe = Object.fromEntries(["evidenceId", "attemptId", "matchId", "status", "matchStatus", "submittedAt", "retentionUntil", "replayed", "fileCount"]
    .filter((key) => result[key] !== undefined).map((key) => [key, result[key]]));
  if (safe.status !== undefined) safe.status = "RECEIVED";
  return safe;
}

function nativeArenaEvidenceHref({ matchId, mode, side, fileIndex }) {
  return `/api/v1/goat-arena/matches/${encodeURIComponent(matchId)}/${mode}-result/evidence/${encodeURIComponent(side)}/${fileIndex}`;
}

module.exports = { publicTierLabel, publicCompetitivePointChange, publicEvidenceResult, nativeArenaEvidenceHref };
