const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const {
  buildSubNormalSettlementPlan,
  settleArenaMatch,
  settleSubRevengeMatch,
  tieBreakStep,
  tuplesEqual,
} = require("../services/arenaMatchSettlementService");
const {
  scoreArenaAttempt,
} = require("../services/arenaMatchScoringService");

function run() {
  const root = path.resolve(__dirname, "..");
  const bronze = {
    arenaRank: "브론즈",
    arenaPosition: 8,
    arenaGp: 20,
  };
  const silver = {
    arenaRank: "실버",
    arenaPosition: 3,
    arenaGp: 60,
  };
  const gold = {
    arenaRank: "골드",
    arenaPosition: 2,
    arenaGp: 90,
  };

  const bronzeWin = buildSubNormalSettlementPlan({
    winnerRole: "CHALLENGER",
    challengerTuple: bronze,
    defenderTuple: silver,
    stakeDays: 1,
    bronzeRefundDays: 1,
  });
  assert.equal(bronzeWin.tupleAction, "SWAP");
  assert.deepEqual(bronzeWin.challengerTupleAfter, silver);
  assert.deepEqual(bronzeWin.defenderTupleAfter, bronze);
  assert.deepEqual(bronzeWin.challengerDelta, {
    availableLearningDays: 0,
    paybackScoreDays: 1,
    lockedPaybackScoreDays: -1,
    lockedLearningDays: 0,
    paidNormalAttacksCompleted: 1,
  });
  assert.equal(bronzeWin.returnedPaybackScore, 1);

  const silverWin = buildSubNormalSettlementPlan({
    winnerRole: "CHALLENGER",
    challengerTuple: silver,
    defenderTuple: gold,
    stakeDays: 1,
    bronzeRefundDays: 0,
  });
  assert.deepEqual(silverWin.challengerTupleAfter, gold);
  assert.equal(silverWin.challengerDelta.paybackScoreDays, 0);
  assert.equal(silverWin.challengerDelta.lockedPaybackScoreDays, -1);
  assert.equal(silverWin.burnedPaybackScore, 1);

  const defenderWin = buildSubNormalSettlementPlan({
    winnerRole: "DEFENDER",
    challengerTuple: silver,
    defenderTuple: gold,
    stakeDays: 1,
  });
  assert.equal(defenderWin.tupleAction, "KEEP");
  assert.deepEqual(defenderWin.challengerTupleAfter, silver);
  assert.deepEqual(defenderWin.defenderTupleAfter, gold);
  assert.equal(defenderWin.challengerDelta.paybackScoreDays, 0);
  assert.equal(defenderWin.challengerDelta.lockedPaybackScoreDays, -1);
  assert.equal(defenderWin.defenderDelta.availableLearningDays, 0);
  assert.equal(defenderWin.defenderDelta.paybackScoreDays, 1);
  assert.equal(defenderWin.transferredPaybackScore, 1);
  assert.equal(tuplesEqual(silver, defenderWin.challengerTupleAfter), true);

  assert.equal(
    tieBreakStep(
      {
        score: 80,
        correctCount: 4,
        correctAnswerSolveTimeMs: 300000,
        totalSolveTimeMs: 520000,
      },
      {
        score: 80,
        correctCount: 4,
        correctAnswerSolveTimeMs: 310000,
        totalSolveTimeMs: 490000,
      }
    ),
    "correctAnswerSolveTimeMs"
  );
  assert.equal(
    tieBreakStep(
      { score: 100, correctCount: 5, correctAnswerSolveTimeMs: 400000, totalSolveTimeMs: 500000 },
      { score: 100, correctCount: 5, correctAnswerSolveTimeMs: 400000, totalSolveTimeMs: 500000 }
    ),
    "FULL_TIE_DEFENDER_WINS"
  );
  const missingTimingScore = scoreArenaAttempt({
    attempt: {
      answers: [{ questionKey: "Q1", value: "2" }],
      questionTimings: [{ questionKey: "Q1", responseTimeMs: null }],
      activeSolveTimeMs: null,
    },
    problemPack: {
      questions: [{ questionKey: "Q1", answer: "2", points: 20 }],
    },
  });
  assert.equal(missingTimingScore.correctAnswerSolveTimeMs, null);
  assert.equal(missingTimingScore.totalSolveTimeMs, null);

  const source = fs.readFileSync(
    path.join(root, "services/arenaMatchSettlementService.js"),
    "utf8"
  );
  for (const required of [
    "session.withTransaction",
    "ArenaStandingChangeLedger.create",
    "ArenaLearningDayLedger.create",
    "ArenaMatchParticipantLock.deleteMany",
    'eventType: "ArenaMatchSettled"',
    "finalizeExpiredAccessCycle",
  ]) {
    assert.ok(source.includes(required), `정산 필수 경로가 없습니다: ${required}`);
  }

  const controller = fs.readFileSync(
    path.join(root, "controllers/goatArenaController.js"),
    "utf8"
  );
  const view = fs.readFileSync(
    path.join(root, "views/goat-arena-match.ejs"),
    "utf8"
  );
  assert.ok(
    controller.includes("settleArenaMatch") &&
      view.includes("arena-match-result-card") &&
      view.includes("복수하기"),
    "두 번째 증거 제출 뒤 경기 유형별 자동 정산과 복수전 화면 연결이 필요합니다."
  );
  assert.equal(typeof settleArenaMatch, "function");
  assert.equal(typeof settleSubRevengeMatch, "function");

  console.log(
    "Sub 일반 쟁탈전·복수전 순위·GP·티어 스왑, 페이백 점수 정산, 증거 제출 후 자동 연결 검증 완료"
  );
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
