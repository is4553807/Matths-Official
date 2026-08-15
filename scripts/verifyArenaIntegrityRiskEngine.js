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
assert.match(source("views/admin-arena-matches.ejs"), /각 문제별 답안|제출 답/);
assert.match(source("views/admin-arena-matches.ejs"), /이상 없음 · 제한 해제/);
assert.match(source("views/admin-arena-matches.ejs"), /처리 필요/);
assert.match(source("views/admin-arena-matches.ejs"), /처리 완료/);
assert.match(
  source("views/admin-arena-matches.ejs"),
  /value="CHALLENGER_CHEATING"/
);
assert.match(source("views/admin-arena-matches.ejs"), /value="DEFENDER_CHEATING"/);
assert.match(source("views/admin-arena-matches.ejs"), /value="BOTH_CHEATING"/);
assert.match(source("views/admin-arena-matches.ejs"), /양측 부정행위 확정/);
assert.match(source("views/admin-arena-matches.ejs"), /EVIDENCE_REQUIRED/);
assert.match(source("views/admin-arena-matches.ejs"), /시스템 오류 확인/);
assert.match(source("views/admin-arena-matches.ejs"), /arena-held-match-overview/);
assert.match(source("views/admin-arena-matches.ejs"), /data-arena-question-details/);
assert.match(source("views/admin-arena-matches.ejs"), /formatAdminMath\(question\.prompt\)/);
assert.match(source("views/admin-arena-matches.ejs"), /\/vendor\/mathjax\/tex-svg\.js/);
assert.match(source("services/arenaIntegrityRiskService.js"), /reviewHeldArenaMatch/);
assert.match(source("services/arenaIntegrityRiskService.js"), /attemptsFinished/);
assert.match(source("services/arenaIntegrityRiskService.js"), /cancelClearedUnscorableMatch/);
assert.match(source("services/arenaIntegrityRiskService.js"), /scoreArenaAttempt/);
assert.match(source("services/arenaIntegrityRiskService.js"), /TRANSFERRED_TO_DEFENDER/);
assert.match(source("services/arenaIntegrityRiskService.js"), /MATCH_SETTLEMENT_BURN/);
assert.match(source("services/arenaIntegrityRiskService.js"), /INTEGRITY_PENALTY_5_DAYS/);
assert.match(source("services/arenaIntegrityRiskService.js"), /INTEGRITY_VIOLATION_CONFIRMED/);
assert.match(source("services/arenaIntegrityRiskService.js"), /warningCount: 1/);
assert.doesNotMatch(
  source("services/arenaIntegrityRiskService.js"),
  /integrityStatus: "REVIEW_REQUIRED",\s*integrityCaseId: riskCase\._id,\s*defensePoolEligible: false/
);
assert.match(source("services/arenaNotificationService.js"), /방어해야 할 경기가 배정되었습니다/);
assert.match(source("services/arenaNotificationService.js"), /검토는 24시간 안에 이루어집니다/);
assert.match(source("services/arenaNotificationService.js"), /ArenaMatchIntegrityReviewStarted/);
assert.match(source("services/arenaMatchEvidenceService.js"), /ArenaMatchIntegrityReviewStarted/);
assert.match(source("services/arenaMatchEvidenceService.js"), /ArenaMatchIntegrityReview/);
assert.match(source("services/arenaMatchEvidenceService.js"), /compareArenaAttemptScores/);
assert.match(source("services/arenaMatchEvidenceService.js"), /MATCH_PAGE_EXITED/);
assert.match(source("services/arenaMatchEvidenceService.js"), /PAGE_EXITED/);
assert.match(source("views\/admin-arena-matches.ejs"), /경기 중 문제 화면 이탈/);
assert.match(source("services/arenaMatchEvidenceService.js"), /screenedAsWinner/);
assert.match(source("services/arenaMatchEvidenceService.js"), /submitArenaSupplementalEvidence/);
assert.doesNotMatch(source("services/arenaMatchEvidenceService.js"), /eventType:\s*"ArenaEvidenceAnomalyDetected"/);
assert.match(source("services/arenaRulebookViewService.js"), /공정한 경기와 운영 검토/);
assert.match(source("services/arenaRulebookViewService.js"), /자동 감지와 공개 범위/);
assert.match(source("services/arenaRulebookViewService.js"), /추가 소명 자료/);
assert.match(source("services/arenaRulebookViewService.js"), /요청 시점부터 24시간 안에/);
assert.match(source("services/arenaRulebookViewService.js"), /추가 소명 자료가 없는 것으로 처리하며, 기한이 끝난 뒤에는 제출할 수 없습니다/);
assert.match(source("services/arenaRulebookViewService.js"), /악용 방지를 위해 구체적인 감지 기준과 판정 방식은 공개하지 않습니다/);
assert.match(source("services/arenaIntegrityRiskService.js"), /requestArenaSupplementalEvidence/);
assert.match(source("services/arenaIntegrityRiskService.js"), /compensateIntegrityPauseForRoles/);
assert.match(source("services/arenaIntegrityRiskService.js"), /integrityReviewCompensationMs/);
assert.doesNotMatch(source("services/arenaIntegrityRiskService.js"), /자동 감지 대상이 된 잠정 승자 역할에 대해서만/);
assert.match(source("services/arenaNotificationService.js"), /양측의 새로운 매치메이킹/);
assert.match(source("services/arenaRulebookViewService.js"), /검토 신호는 부정행위 확정이 아니며 최종 판정은 운영 검토 뒤 안내합니다/);
assert.match(source("views/admin-arena-matches.ejs"), /arena-recent-evidence-panel/);
assert.match(source("services/arenaPaybackReviewService.js"), /조건 미달로 확정하지 않습니다/);
assert.match(source("services/arenaPaybackReviewService.js"), /실제 매치메이킹 일시정지 시간만큼 이용 주기와 심사 시각을 연장합니다/);
assert.match(source("views/admin-arena-matches.ejs"), /추가 소명 자료 요청/);
assert.match(source("views/admin-arena-matches.ejs"), /data-admin-supplemental-timer/);
assert.match(source("views/admin-arena-matches.ejs"), /추가 소명자료 미제출/);
assert.match(source("views/goat-arena-supplemental-evidence.ejs"), /data-supplemental-timer/);
assert.match(source("services/arenaMatchEvidenceService.js"), /ARENA_SUPPLEMENTAL_DEADLINE_EXPIRED/);
assert.doesNotMatch(source("services/arenaMatchEvidenceService.js"), /\$in: \["REQUESTED", "EXPIRED"\]/);
assert.match(source("services/arenaNotificationService.js"), /\\n\\n판정 근거:/);
assert.doesNotMatch(source("views/profile.ejs"), /ranking-identity-settings/);
assert.deepEqual(require("../services/userIdentityService").RANKING_DISPLAY_MODES, ["nickname"]);
assert.match(source("views/partials/goat-arena-navigation.ejs"), /data-arena-mailbox/);
assert.match(source("views/partials/goat-arena-navigation.ejs"), /arena-nav-alert-dot/);
assert.doesNotMatch(source("views/partials/goat-arena-navigation.ejs"), /action="\/logout"/);
assert.match(source("views/goat-arena-profile.ejs"), /action="\/logout"/);
assert.match(source("views/goat-arena-match.ejs"), /arena-evidence-timer/);
assert.match(source("views/goat-arena-match.ejs"), /required data-arena-evidence-input/);
assert.match(source("services/arenaMatchEvidenceService.js"), /attempt\.status !== "EVIDENCE_REQUIRED"/);
assert.match(source("services/arenaMatchEvidenceService.js"), /ARENA_EVIDENCE_DEADLINE_EXPIRED/);
assert.match(source("scripts/resetAdminOperationalState.js"), /policyCollectionsTouched: \[\]/);
assert.match(source("views/goat-arena-division.ejs"), /arena-command-alert-dot/);
assert.doesNotMatch(source("controllers/goatArenaController.js"), /subDefenseInbox/);
assert.doesNotMatch(source("views/goat-arena-feature.ejs"), /권위 DB에서 불러온 최신 상태입니다/);
assert.match(source("server.js"), /registerArenaNotificationOutboxHandlers/);
assert.match(source("services/accountDeletionService.js"), /ArenaIntegrityLinkSignal\.deleteMany/);

console.log("GOAT Arena 장기 무결성 위험 점수·HMAC 신호·관리자 검토 연결 검증 완료");
