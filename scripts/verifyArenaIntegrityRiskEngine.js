"use strict";

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

const now = new Date("2026-10-11T12:00:00.000+09:00");
const userId = "64b000000000000000000001";
const opponentId = "64b000000000000000000002";
const buildMatches = (count, overrides = {}) =>
  Array.from({ length: count }, (_, index) => ({
    _id: `64c0000000000000000000${index + 1}`,
    gameMode: "COMPETITIVE",
    matchType: "NORMAL",
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

const repeatedNoShow = calculateArenaIntegrityRisk({
  userId,
  matches: buildMatches(3, { noShowRole: "CHALLENGER" }),
  now,
});
assert.equal(repeatedNoShow.riskScore, 35);
assert.ok(repeatedNoShow.signalCodes.includes("REPEATED_NO_SHOW"));

const normalMode = calculateArenaIntegrityRisk({
  userId,
  matches: buildMatches(20, { gameMode: "NORMAL" }),
  sharedSignals: [{ opponentUserId: opponentId, signalTypes: ["DEVICE_TOKEN"] }],
  now,
});
assert.equal(normalMode.riskScore, 0);
assert.deepEqual(normalMode.signalCodes, []);

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
const riskSource = source("services/arenaIntegrityRiskService.js");
const evidenceSource = source("services/arenaMatchEvidenceService.js");
const notificationSource = source("services/arenaNotificationService.js");
const adapterSource = source("services/arenaV2IntegrityReviewAdapter.js");
const rulebookSource = source("services/goatArenaV22RulebookService.js");

assert.match(source("models/goatArenaModel.js"), /ArenaIntegrityRiskCase/);
assert.match(source("server.js"), /startArenaIntegrityRiskScheduler/);
assert.match(source("views/admin-arena-matches.ejs"), /계정·경기 연관성 검토/);
assert.match(source("views/admin-arena-matches.ejs"), /각 문제별 답안|제출 답/);
assert.match(source("views/admin-arena-matches.ejs"), /이상 없음 · 제한 해제/);
assert.match(riskSource, /gameMode: "COMPETITIVE"/);
assert.match(riskSource, /requestArenaSupplementalEvidence/);
assert.doesNotMatch(riskSource, /PAYBACK_ACCOUNT|ONE_WAY_LEARNING_DAY_TRANSFER/);
assert.match(adapterSource, /reviewHeldArenaV2Match/);
assert.match(evidenceSource, /ArenaMatchIntegrityReviewStarted/);
assert.match(evidenceSource, /MATCH_PAGE_EXITED/);
assert.match(evidenceSource, /submitArenaSupplementalEvidence/);
assert.match(evidenceSource, /ARENA_SUPPLEMENTAL_DEADLINE_EXPIRED/);
assert.doesNotMatch(notificationSource, /방어해야 할 경기가 배정되었습니다/);
assert.match(notificationSource, /검토는 24시간 안에 이루어집니다/);
assert.match(notificationSource, /ArenaMatchIntegrityReviewStarted/);
assert.match(rulebookSource, /추가 확인이 필요한 경기는 검토 상태와 최종 결과/);
assert.match(source("views/admin-arena-matches.ejs"), /추가 소명 자료 요청/);
assert.match(source("views/goat-arena-supplemental-evidence.ejs"), /data-supplemental-timer/);
assert.deepEqual(require("../services/userIdentityService").RANKING_DISPLAY_MODES, ["nickname"]);
assert.match(source("views/partials/goat-arena-navigation.ejs"), /data-arena-mailbox/);
assert.match(source("views/goat-arena-profile.ejs"), /action="\/logout"/);
assert.match(source("views/goat-arena-match.ejs"), /required data-arena-evidence-input/);
assert.match(source("server.js"), /registerArenaNotificationOutboxHandlers/);
assert.match(source("services/accountDeletionService.js"), /ArenaIntegrityLinkSignal\.deleteMany/);

console.log("GOAT Arena 경쟁전 무결성 위험 점수·신호·운영 검토 연결 검증 완료");
