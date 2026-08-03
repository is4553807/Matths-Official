const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  RAPID_SUBMISSION_THRESHOLD_MS,
  REVIEW_THRESHOLD,
  calculateArenaIntegrityRisk,
  hashIntegritySignal,
  networkBucket,
  normalizeIp,
  stableEvidenceHash,
} = require("../services/arenaIntegrityRiskService");
const {
  FAST_COMPLETION_REVIEW_THRESHOLD_MS,
  timingAnomalyFlags,
} = require("../services/arenaMatchEvidenceService");

const now = new Date("2026-08-02T12:00:00.000+09:00");
const userId = "64b000000000000000000001";
const opponentId = "64b000000000000000000002";
const buildMatches = (count, overrides = {}) =>
  Array.from({ length: count }, (_, index) => ({
    _id: `64c0000000000000000000${index + 1}`,
    challenger: { userId },
    defender: { userId: opponentId },
    status: "SETTLED",
    winnerRole: "DEFENDER",
    settledAt: new Date(now.getTime() - index * 60 * 60 * 1000),
    ...overrides,
  }));

const networkOnly = calculateArenaIntegrityRisk({
  userId,
  matches: buildMatches(3),
  sharedSignals: [{ opponentUserId: opponentId, signalTypes: ["NETWORK_ADDRESS"] }],
  now,
});
assert.equal(networkOnly.riskScore, 25);
assert.equal(networkOnly.reviewRequired, false);

const sharedDevice = calculateArenaIntegrityRisk({
  userId,
  matches: buildMatches(3),
  sharedSignals: [{ opponentUserId: opponentId, signalTypes: ["DEVICE_TOKEN"] }],
  now,
});
assert.equal(sharedDevice.riskScore, REVIEW_THRESHOLD);
assert.equal(sharedDevice.reviewRequired, true);

const noShowMatches = buildMatches(3).map((match) => ({
  ...match,
  noShowRole: "CHALLENGER",
}));
const transferRisk = calculateArenaIntegrityRisk({
  userId,
  matches: noShowMatches,
  transfers: noShowMatches.map((match) => ({
    recipientUserId: opponentId,
    matchId: match._id,
    days: 1,
  })),
  now,
});
assert.equal(transferRisk.riskScore, 60);
assert.equal(transferRisk.riskLevel, "HIGH");
assert.ok(transferRisk.signalCodes.includes("REPEATED_NO_SHOW"));
assert.ok(transferRisk.signalCodes.includes("ONE_WAY_LEARNING_DAY_TRANSFER"));

const volumeRisk = calculateArenaIntegrityRisk({
  userId,
  matches: buildMatches(20),
  now,
});
assert.ok(volumeRisk.signalCodes.includes("EXTREME_DAILY_MATCH_VOLUME"));
assert.ok(volumeRisk.riskScore >= REVIEW_THRESHOLD);

assert.equal(RAPID_SUBMISSION_THRESHOLD_MS, 5 * 60 * 1000);
assert.equal(FAST_COMPLETION_REVIEW_THRESHOLD_MS, 5 * 60 * 1000);
assert.deepEqual(
  timingAnomalyFlags({
    attempt: { activeSolveTimeMs: 4 * 60 * 1000 },
    scoring: {
      questionResults: [
        { correct: true, responseTimeMs: 45_000 },
        { correct: true, responseTimeMs: 59_000 },
        { correct: true, responseTimeMs: 60_000 },
        { correct: true, responseTimeMs: 61_000 },
      ],
    },
  }),
  ["FAST_COMPLETION_UNDER_FIVE_MINUTES", "MULTIPLE_RAPID_CORRECT_ANSWERS"]
);
assert.deepEqual(
  timingAnomalyFlags({
    attempt: { activeSolveTimeMs: 5 * 60 * 1000 },
    scoring: {
      questionResults: [
        { correct: true, responseTimeMs: 45_000 },
        { correct: true, responseTimeMs: 59_000 },
      ],
    },
  }),
  []
);

assert.equal(stableEvidenceHash(sharedDevice), stableEvidenceHash(sharedDevice));
assert.notEqual(stableEvidenceHash(sharedDevice), stableEvidenceHash(networkOnly));
assert.equal(normalizeIp("::ffff:192.168.10.24"), "192.168.10.24");
assert.equal(networkBucket("192.168.10.24"), "192.168.10.0/24");
const rawSignal = "raw-device-token-that-must-not-be-stored";
const signalHash = hashIntegritySignal("DEVICE_TOKEN", rawSignal);
assert.match(signalHash, /^[a-f0-9]{64}$/);
assert.equal(signalHash.includes(rawSignal), false);

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
assert.match(source("models/goatArenaModel.js"), /ArenaIntegrityRiskCase/);
assert.match(source("services/arenaMatchService.js"), /INTEGRITY_REVIEW_REQUIRED/);
assert.match(source("server.js"), /startArenaIntegrityRiskScheduler/);
assert.match(source("views/admin-arena-matches.ejs"), /계정·경기 연관성 검토/);
assert.match(source("services/accountDeletionService.js"), /ArenaIntegrityLinkSignal\.deleteMany/);

console.log("GOAT Arena 장기 무결성 위험 점수·HMAC 신호·관리자 검토 연결 검증 완료");
