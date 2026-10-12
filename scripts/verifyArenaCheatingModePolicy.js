"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculateArenaIntegrityRisk,
} = require("../services/arenaIntegrityRiskService");
const {
  shouldEnforceArenaIntegrityForMode,
} = require("../services/arenaV2MatchmakingService");

const root = path.resolve(__dirname, "..");
const source = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const userId = "64b000000000000000000001";
const opponentId = "64b000000000000000000002";
const now = new Date("2026-10-09T12:00:00+09:00");

function matches(count, gameMode) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `64c0000000000000000000${index + 1}`,
    gameMode,
    matchType: gameMode === "FRIENDLY" ? "FRIENDLY" : "NORMAL",
    challenger: { userId },
    defender: { userId: opponentId },
    status: "SETTLED",
    winnerRole: "DEFENDER",
    settledAt: new Date(now.getTime() - index * 60 * 1000),
  }));
}

const sharedSignals = [{
  opponentUserId: opponentId,
  signalTypes: ["DEVICE_TOKEN", "NETWORK_ADDRESS"],
}];
const friendlyMatches = matches(20, "FRIENDLY");
const normalMatches = matches(3, "NORMAL");
const competitiveMatches = matches(3, "COMPETITIVE");

assert.equal(shouldEnforceArenaIntegrityForMode("NORMAL"), false);
assert.equal(shouldEnforceArenaIntegrityForMode("COMPETITIVE"), true);
assert.equal(shouldEnforceArenaIntegrityForMode("FRIENDLY"), false);
assert.equal(shouldEnforceArenaIntegrityForMode(""), false);

const friendlyOnly = calculateArenaIntegrityRisk({
  userId,
  matches: friendlyMatches,
  transfers: [{
    recipientUserId: opponentId,
    matchId: friendlyMatches[0]._id,
    days: 30,
  }],
  sharedSignals,
  now,
});
assert.equal(friendlyOnly.riskScore, 0);
assert.equal(friendlyOnly.reviewRequired, false);
assert.deepEqual(friendlyOnly.signalCodes, []);

const normalOnly = calculateArenaIntegrityRisk({
  userId,
  matches: normalMatches,
  sharedSignals,
  now,
});
assert.equal(normalOnly.riskScore, 0);
assert.deepEqual(normalOnly.signalCodes, []);

const competitiveOnly = calculateArenaIntegrityRisk({
  userId,
  matches: competitiveMatches,
  sharedSignals,
  now,
});
assert.ok(competitiveOnly.riskScore > 0);
assert.ok(competitiveOnly.signalCodes.includes("SHARED_DEVICE"));

const mixed = calculateArenaIntegrityRisk({
  userId,
  matches: [...friendlyMatches, ...matches(3, "COMPETITIVE")],
  sharedSignals,
  now,
});
assert.equal(mixed.riskScore, competitiveOnly.riskScore);
assert.deepEqual(mixed.signalCodes, competitiveOnly.signalCodes);

const evidenceSource = source("services/arenaMatchEvidenceService.js");
assert.match(
  evidenceSource,
  /String\(match\.gameMode \|\| ""\)\.toUpperCase\(\) === "COMPETITIVE"/
);
assert.match(evidenceSource, /shouldRunCheatingDetection\s*\? await detectEvidenceAnomalies/);
assert.match(evidenceSource, /const roleFlags = shouldRunCheatingDetection/);

const attemptSource = source("services/arenaMatchAttemptService.js");
assert.match(
  attemptSource,
  /String\(match\.gameMode \|\| ""\)\.toUpperCase\(\) !== "COMPETITIVE"/
);
assert.match(attemptSource, /recordedCount = 0;\s*return;/);

const normalSource = source("services/arenaAsyncNormalService.js");
assert.match(normalSource, /await detectEvidenceAnomalies\(/);
assert.match(normalSource, /사용자에게 패널티를 주지 않고 과거 기록 풀에서만 격리/);
assert.match(normalSource, /status: integrityFlags\.length \? "REVIEW_REQUIRED" : "AVAILABLE"/);
assert.doesNotMatch(normalSource, /send.*mail|send.*email/i);

const competitiveSource = source("services/arenaAsyncCompetitiveService.js");
assert.match(competitiveSource, /await detectEvidenceAnomalies\(/);
assert.match(competitiveSource, /match\.integrityStatus = "SUSPICIOUS"/);

const matchmakingSource = source("services/arenaV2MatchmakingService.js");
assert.match(
  matchmakingSource,
  /if \(shouldEnforceArenaIntegrityForMode\(normalizedMode\)\) \{\s*await assertArenaIntegrityEligible/
);

const guestSource = source("services/arenaGuestChallengeService.js");
assert.doesNotMatch(guestSource, /detectEvidenceAnomalies/);
assert.match(guestSource, /게스트 링크는 지인 간 친선전/);

const riskSource = source("services/arenaIntegrityRiskService.js");
assert.match(riskSource, /matchType: \{ \$ne: "FRIENDLY" \}/);
assert.match(riskSource, /gameMode: "COMPETITIVE"/);

const matchView = source("views/goat-arena-match.ejs");
assert.match(matchView, /채점 후 친선 경기 결과를 확정합니다/);
assert.match(
  matchView,
  /const showIntegrityNotice\s*=\s*matchData\.gameMode === "COMPETITIVE"/
);
assert.match(matchView, /if \(showIntegrityNotice\)/);

console.log("GOAT Arena cheating-detection mode policy verification passed");
