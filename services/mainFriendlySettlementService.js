const mongoose = require("mongoose");
const {
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  compareArenaAttemptScores,
  scoreArenaAttempt,
} = require("./arenaMatchScoringService");

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function scoreSnapshot(score) {
  return {
    score: Number(score?.score || 0),
    correctCount: Number(score?.correctCount || 0),
    correctAnswerSolveTimeMs: Number(score?.correctAnswerSolveTimeMs || 0),
    totalSolveTimeMs: Number(score?.totalSolveTimeMs || 0),
  };
}

function tieBreakStep(challenger, defender) {
  if (Number(challenger.score) !== Number(defender.score)) return "SCORE";
  if (Number(challenger.correctCount) !== Number(defender.correctCount)) return "CORRECT_COUNT";
  if (Number(challenger.correctAnswerSolveTimeMs) !== Number(defender.correctAnswerSolveTimeMs)) return "CORRECT_ANSWER_SOLVE_TIME";
  if (Number(challenger.totalSolveTimeMs) !== Number(defender.totalSolveTimeMs)) return "TOTAL_SOLVE_TIME";
  return "FULL_TIE_DEFENDER_WINS";
}

async function settleMainFriendlyMatchResult({
  matchId,
  now = new Date(),
  forcedWinnerRole = null,
  automaticReason = "",
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(400, "친선 경기 정보를 확인해주세요.", "FRIENDLY_MATCH_ID_INVALID");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "친선 경기를 찾을 수 없습니다.", "FRIENDLY_MATCH_NOT_FOUND");
      if (match.matchType !== "FRIENDLY" || match.division !== "MAIN") {
        throw statusError(409, "GOAT Arena 친선 경기만 정산할 수 있습니다.", "FRIENDLY_MATCH_TYPE_INVALID");
      }
      if (match.status === "SETTLED") {
        result = { settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD") {
        result = { settled: false, held: true, replayed: true };
        return;
      }
      const forcedWinner = String(forcedWinnerRole || "").toUpperCase();
      const automaticSettlement = ["CHALLENGER", "DEFENDER"].includes(forcedWinner);
      if (!automaticSettlement && match.status !== "SUBMITTED") {
        result = { settled: false, waiting: true, status: match.status };
        return;
      }
      const attempts = await ArenaMatchAttempt.find({ matchId: match._id }).session(session).lean();
      const evidence = await ArenaMatchEvidence.find({ matchId: match._id }).session(session).lean();
      if (!automaticSettlement && (attempts.length !== 2 || attempts.some((attempt) => attempt.status !== "SUBMITTED") || evidence.length !== 2)) {
        result = { settled: false, waiting: true, status: match.status };
        return;
      }
      const pack = await ArenaProblemPack.findById(match.problemPackId).select("+questions").session(session).lean();
      if (!pack) throw statusError(409, "친선 경기 문제를 찾을 수 없습니다.", "FRIENDLY_PROBLEM_PACK_MISSING");
      const challengerAttempt = attempts.find((attempt) => attempt.role === "CHALLENGER");
      const defenderAttempt = attempts.find((attempt) => attempt.role === "DEFENDER");
      if (!challengerAttempt || !defenderAttempt) {
        throw statusError(409, "친선 경기 참가자 기록을 확인해주세요.", "FRIENDLY_ATTEMPT_ROLE_MISSING");
      }
      const challengerScore = scoreArenaAttempt({ attempt: challengerAttempt, problemPack: pack });
      const defenderScore = scoreArenaAttempt({ attempt: defenderAttempt, problemPack: pack });
      const winnerRole = automaticSettlement
        ? forcedWinner
        : compareArenaAttemptScores(challengerScore, defenderScore);
      match.status = "SETTLED";
      match.integrityStatus = "CLEAR";
      match.winnerRole = winnerRole;
      match.resolvedAt = now;
      match.settledAt = now;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: scoreSnapshot(challengerScore),
        defender: scoreSnapshot(defenderScore),
        tieBreakStep: tieBreakStep(challengerScore, defenderScore),
        winnerRole,
        settlementSummary: {
          tupleAction: "KEEP",
          friendly: true,
          learningDayTransfer: 0,
          learningDayStake: 0,
          feeDaysEach: Number(match.economySnapshot?.feeDays || 1),
          message: "친선 경기는 티어·순위·학습일수 이전에 영향을 주지 않습니다.",
          automaticReason: automaticReason || "",
        },
        resolvedAt: now,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "ArenaMatchSettled",
            aggregateType: "ArenaMatch",
            aggregateId: match._id,
            idempotencyKey: `${match._id}:ArenaMatchSettled`,
            payload: {
              division: "MAIN",
              matchType: "FRIENDLY",
              winnerRole,
              tupleAction: "KEEP",
              learningDayTransfer: 0,
            },
          },
        ],
        { session, ordered: true }
      );
      result = { settled: true, winnerRole, resultSnapshot: match.resultSnapshot };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { settleMainFriendlyMatchResult };
