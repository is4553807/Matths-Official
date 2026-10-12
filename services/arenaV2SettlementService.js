const mongoose = require("mongoose");
const {
  ArenaCompetitiveProfile,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const { scoreArenaAttempt } = require("./arenaMatchScoringService");
const { buildArenaActivityLevel } = require("./arenaActivityLevelService");
const { updateHeadToHead } = require("./glicko2Service");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const {
  ensureArenaV2Profile,
  tierForRating,
} = require("./arenaV2ProfileService");

const SETTLEMENT_VERSION = "GOAT-ARENA-2-SETTLEMENT-V1";

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function roundedRating(value) {
  return Math.round(Number(value) * 100) / 100;
}

function winnerFromScores(challenger, defender) {
  if (challenger.correctCount !== defender.correctCount) {
    return challenger.correctCount > defender.correctCount ? "CHALLENGER" : "DEFENDER";
  }
  const challengerTime = challenger.totalSolveTimeMs == null
    ? Number.NaN : Number(challenger.totalSolveTimeMs);
  const defenderTime = defender.totalSolveTimeMs == null
    ? Number.NaN : Number(defender.totalSolveTimeMs);
  const challengerHasTime = Number.isFinite(challengerTime);
  const defenderHasTime = Number.isFinite(defenderTime);
  if (challengerHasTime && defenderHasTime && challengerTime !== defenderTime) {
    return challengerTime < defenderTime ? "CHALLENGER" : "DEFENDER";
  }
  return null;
}

function scoreForRole(winnerRole, role) {
  if (!winnerRole) return 0.5;
  return winnerRole === role ? 1 : 0;
}

function outcomeName(winnerRole) {
  return winnerRole ? `${winnerRole}_WIN` : "DRAW";
}

function ratingState(profile) {
  return {
    rating: Number(profile.rating),
    ratingDeviation: Number(profile.ratingDeviation),
    volatility: Number(profile.volatility),
    tier: String(profile.tier || "UNPLACED"),
  };
}

function progressionUpdate(profile, { mode, role, winnerRole, validCompletion = true }) {
  if (mode === "FRIENDLY") return;
  if (validCompletion) {
    const xp = GOAT_ARENA_V2_CONFIG.progression.xpPerValidMatch;
    profile.accountXp = Number(profile.accountXp || 0) + xp;
    profile.accountLevel = buildArenaActivityLevel(profile.accountXp).level;
  }
  if (mode === "NORMAL" && validCompletion) {
    profile.normalMatchesCompleted = Number(profile.normalMatchesCompleted || 0) + 1;
  }
  if (mode === "COMPETITIVE") {
    profile.competitiveMatchesCompleted = Number(profile.competitiveMatchesCompleted || 0) + 1;
    if (!winnerRole) profile.draws = Number(profile.draws || 0) + 1;
    else if (winnerRole === role) profile.wins = Number(profile.wins || 0) + 1;
    else profile.losses = Number(profile.losses || 0) + 1;
  }
}

function ratingSummary(before, after) {
  if (!before || !after) return null;
  return {
    before: roundedRating(before.rating),
    delta: roundedRating(after.rating - before.rating),
    after: roundedRating(after.rating),
    ratingDeviationBefore: roundedRating(before.ratingDeviation),
    ratingDeviationAfter: roundedRating(after.ratingDeviation),
    volatilityBefore: before.volatility,
    volatilityAfter: after.volatility,
    tierBefore: before.tier,
    tierAfter: after.tier,
    tierBeforeLabel: tierForRating(before.rating).label,
    tierAfterLabel: tierForRating(after.rating).label,
  };
}

async function forfeitArenaV2Match({ matchId, userId, now = new Date() }) {
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(userId)) {
    throw statusError(400, "포기할 경기 정보를 확인해주세요.", "INVALID_ARENA_MATCH_ID");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findOne({
        _id: matchId,
        arenaVersion: "2.0",
        $or: [{ "challenger.userId": userId }, { "defender.userId": userId }],
      }).session(session);
      if (!match) throw statusError(404, "참가 중인 경기를 찾을 수 없습니다.");
      if (match.normalAsync?.enabled) {
        if (String(match.challenger.userId) !== String(userId)) {
          throw statusError(403, "상대는 현재 사용자의 일반전을 변경할 수 없습니다.", "ARENA_ASYNC_FORFEIT_FORBIDDEN");
        }
        result = await require("./arenaAsyncNormalService").cancelAsyncNormalMatch({
          matchId,
          userId,
          now,
          session,
          reason: "VOLUNTARY_FORFEIT",
        });
        return;
      }
      if (match.competitiveAsync?.enabled) {
        if (String(match.challenger.userId) !== String(userId)) {
          throw statusError(
            403,
            "상대는 현재 사용자의 경기를 포기 처리할 수 없습니다.",
            "ARENA_ASYNC_FORFEIT_FORBIDDEN"
          );
        }
        const { settleAsyncCompetitiveMatch } = require("./arenaAsyncCompetitiveService");
        const attempts = await ArenaMatchAttempt.find({ matchId }).session(session).lean();
        if (
          !["READY", "IN_PROGRESS"].includes(match.status) ||
          attempts.some((attempt) => !["READY", "IN_PROGRESS"].includes(attempt.status))
        ) {
          throw statusError(409, "풀이 제출 또는 검토가 시작된 경쟁전은 포기할 수 없습니다.", "ARENA_FORFEIT_NOT_ALLOWED");
        }
        result = await settleAsyncCompetitiveMatch({
          matchId,
          now,
          forcedWinnerRole: "DEFENDER",
          automaticReason: "VOLUNTARY_FORFEIT",
          session,
        });
        return;
      }
      if (match.normalAsync?.enabled) {
        const { cancelAsyncNormalMatch } = require("./arenaAsyncNormalService");
        result = await cancelAsyncNormalMatch({
          matchId,
          userId: match.challenger.userId,
          now,
          session,
        });
        return;
      }
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        if (match.status === "SETTLED" && match.resultSnapshot?.settlementSummary?.automaticReason !== "VOLUNTARY_FORFEIT") {
          throw statusError(409, "풀이 제출 및 정산이 완료된 경기는 포기할 수 없습니다.", "ARENA_FORFEIT_NOT_ALLOWED");
        }
        result = { status: match.status, replayed: true };
        return;
      }
      const attempts = await ArenaMatchAttempt.find({ matchId }).session(session).lean();
      if (
        !["READY", "IN_PROGRESS"].includes(match.status) ||
        attempts.some((attempt) => !["READY", "IN_PROGRESS"].includes(attempt.status))
      ) {
        throw statusError(409, "제출 또는 검토 중인 경기는 포기할 수 없습니다.", "ARENA_FORFEIT_NOT_ALLOWED");
      }
      result = await settleArenaV2Match({
        matchId,
        now,
        forcedWinnerRole: String(match.challenger.userId) === String(userId) ? "DEFENDER" : "CHALLENGER",
        automaticReason: "VOLUNTARY_FORFEIT",
        session,
      });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function cancelArenaV2Match({
  matchId,
  now = new Date(),
  reason = "INVALID_OR_INCOMPLETE_MATCH",
  session: existingSession = null,
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(400, "취소할 경기 정보를 확인해주세요.", "INVALID_ARENA_MATCH_ID");
  }
  const session = existingSession || await mongoose.startSession();
  const ownsSession = !existingSession;
  let result;
  try {
    const cancel = async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match || match.arenaVersion !== "2.0") {
        throw statusError(404, "취소할 GOAT Arena 2.0 경기를 찾을 수 없습니다.");
      }
      if (match.competitiveAsync?.enabled) {
        const { cancelAsyncCompetitiveMatch } = require("./arenaAsyncCompetitiveService");
        result = await cancelAsyncCompetitiveMatch({
          matchId,
          now,
          reason,
          session,
        });
        return;
      }
      if (match.normalAsync?.enabled) {
        const { cancelAsyncNormalMatch } = require("./arenaAsyncNormalService");
        result = await cancelAsyncNormalMatch({
          matchId,
          userId: match.challenger.userId,
          now,
          reason,
          session,
        });
        return;
      }
      if (["CANCELLED", "INVALID"].includes(match.status)) {
        result = { cancelled: true, replayed: true, status: match.status };
        return;
      }
      if (match.status === "SETTLED") {
        result = { cancelled: false, replayed: true, status: match.status };
        return;
      }
      match.status = "CANCELLED";
      match.integrityStatus = "CLEAR";
      match.resolvedAt = now;
      match.settledAt = now;
      match.settlementIdempotencyKey = `${match._id}:${SETTLEMENT_VERSION}:CANCEL`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        tieBreakStep: String(reason).slice(0, 80),
        winnerRole: null,
        settlementSummary: {
          version: SETTLEMENT_VERSION,
          gameMode: match.gameMode,
          valid: false,
          mmrChanged: false,
          xpAwarded: false,
          reason,
        },
        resolvedAt: now,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      result = { cancelled: true, replayed: false, status: match.status };
    };
    if (ownsSession) await session.withTransaction(cancel);
    else await cancel();
    return result;
  } finally {
    if (ownsSession) await session.endSession();
  }
}

async function settleArenaV2Match({
  matchId,
  now = new Date(),
  forcedWinnerRole = null,
  automaticReason = "",
  session: existingSession = null,
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(400, "정산할 경기 정보를 확인해주세요.", "INVALID_ARENA_MATCH_ID");
  }
  const session = existingSession || await mongoose.startSession();
  const ownsSession = !existingSession;
  let result;
  try {
    const settle = async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match || match.arenaVersion !== "2.0") {
        throw statusError(404, "정산할 GOAT Arena 2.0 경기를 찾을 수 없습니다.");
      }
      if (match.competitiveAsync?.enabled) {
        const { settleAsyncCompetitiveMatch } = require("./arenaAsyncCompetitiveService");
        result = await settleAsyncCompetitiveMatch({
          matchId,
          now,
          forcedWinnerRole,
          automaticReason,
          session,
        });
        return;
      }
      if (match.status === "SETTLED") {
        result = {
          status: "SETTLED",
          settled: true,
          replayed: true,
          winnerRole: match.winnerRole,
          resultSnapshot: match.resultSnapshot,
        };
        return;
      }
      if (["CANCELLED", "INVALID"].includes(match.status)) {
        result = { status: match.status, settled: false, replayed: true };
        return;
      }
      if (match.status === "HELD" || match.integrityStatus === "SUSPICIOUS") {
        result = { status: "HELD", settled: false, held: true };
        return;
      }
      const forced = String(forcedWinnerRole || "").toUpperCase();
      const automatic = ["CHALLENGER", "DEFENDER"].includes(forced);
      if (!automatic && (match.status !== "SUBMITTED" || match.integrityStatus !== "CLEAR")) {
        result = { status: match.status, settled: false, waiting: true };
        return;
      }
      const attempts = await ArenaMatchAttempt.find({ matchId: match._id })
        .session(session)
        .lean();
      if (attempts.length !== 2) {
        throw statusError(409, "양쪽 경기 기록을 확인할 수 없습니다.", "ARENA_ATTEMPTS_INCOMPLETE");
      }
      if (!automatic) {
        const evidenceCount = await ArenaMatchEvidence.countDocuments({
          matchId: match._id,
          originalEvidenceSubmitted: true,
          submittedAt: { $ne: null },
          "files.0": { $exists: true },
        })
          .session(session);
        if (attempts.some((attempt) => attempt.status !== "SUBMITTED") || evidenceCount !== 2) {
          result = { status: match.status, settled: false, waiting: true };
          return;
        }
      }
      const problemPack = await ArenaProblemPack.findById(match.problemPackId)
        .select("+questions")
        .session(session)
        .lean();
      if (!problemPack) {
        throw statusError(409, "경기에 고정된 문제 팩을 찾을 수 없습니다.");
      }
      const attemptByRole = new Map(attempts.map((attempt) => [attempt.role, attempt]));
      const challengerScore = scoreArenaAttempt({
        attempt: attemptByRole.get("CHALLENGER"),
        problemPack,
      });
      const defenderScore = scoreArenaAttempt({
        attempt: attemptByRole.get("DEFENDER"),
        problemPack,
      });
      const winnerRole = automatic ? forced : winnerFromScores(challengerScore, defenderScore);
      const challengerProfile = await ensureArenaV2Profile(match.challenger.userId, { session });
      const defenderProfile = await ensureArenaV2Profile(match.defender.userId, { session });
      let challengerBefore = null;
      let defenderBefore = null;
      let challengerAfter = null;
      let defenderAfter = null;
      if (match.gameMode === "COMPETITIVE") {
        if (!challengerProfile.placementFinalizedAt || !defenderProfile.placementFinalizedAt) {
          throw statusError(409, "확정된 경쟁전 레이팅을 찾을 수 없습니다.");
        }
        challengerBefore = ratingState(challengerProfile);
        defenderBefore = ratingState(defenderProfile);
        const updated = updateHeadToHead(
          challengerBefore,
          defenderBefore,
          scoreForRole(winnerRole, "CHALLENGER")
        );
        challengerAfter = {
          ...updated.left,
          tier: tierForRating(updated.left.rating).name,
        };
        defenderAfter = {
          ...updated.right,
          tier: tierForRating(updated.right.rating).name,
        };
        Object.assign(challengerProfile, challengerAfter, { lastRatedAt: now });
        Object.assign(defenderProfile, defenderAfter, { lastRatedAt: now });
      }
      progressionUpdate(challengerProfile, {
        mode: match.gameMode,
        role: "CHALLENGER",
        winnerRole,
        validCompletion: !automatic,
      });
      progressionUpdate(defenderProfile, {
        mode: match.gameMode,
        role: "DEFENDER",
        winnerRole,
        validCompletion: !automatic,
      });
      await challengerProfile.save({ session });
      await defenderProfile.save({ session });
      const challengerRating = ratingSummary(challengerBefore, challengerAfter);
      const defenderRating = ratingSummary(defenderBefore, defenderAfter);
      const settlementSummary = {
        version: SETTLEMENT_VERSION,
        gameMode: match.gameMode,
        valid: true,
        result: outcomeName(winnerRole),
        automaticReason: automatic ? String(automaticReason || "FORFEIT") : "",
        completedForUnlock: !automatic && match.gameMode === "NORMAL",
        mmrChanged: match.gameMode === "COMPETITIVE",
        xpAwarded: !automatic && match.gameMode !== "FRIENDLY",
        xpPerPlayer:
          automatic || match.gameMode === "FRIENDLY"
            ? 0
            : GOAT_ARENA_V2_CONFIG.progression.xpPerValidMatch,
        challengerRating,
        defenderRating,
      };
      await ArenaRatingSettlement.create(
        [
          {
            matchId: match._id,
            mode: match.gameMode,
            outcome: outcomeName(winnerRole),
            challenger: {
              userId: String(match.challenger.userId),
              rating: challengerRating,
              xpAfter: challengerProfile.accountXp,
              levelAfter: challengerProfile.accountLevel,
            },
            defender: {
              userId: String(match.defender.userId),
              rating: defenderRating,
              xpAfter: defenderProfile.accountXp,
              levelAfter: defenderProfile.accountLevel,
            },
            settledAt: now,
          },
        ],
        { session, ordered: true }
      );
      match.status = "SETTLED";
      match.winnerRole = winnerRole;
      match.integrityStatus = "CLEAR";
      match.resolvedAt = now;
      match.settledAt = now;
      match.settlementIdempotencyKey = `${match._id}:${SETTLEMENT_VERSION}`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: challengerScore,
        defender: defenderScore,
        tieBreakStep: automatic
          ? String(automaticReason || "FORFEIT")
          : challengerScore.correctCount !== defenderScore.correctCount
            ? "CORRECT_COUNT"
            : winnerRole
              ? "TOTAL_SOLVE_TIME"
              : "DRAW",
        winnerRole,
        settlementSummary,
        resolvedAt: now,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      await ArenaOutboxEvent.findOneAndUpdate(
        { idempotencyKey: `${match._id}:ArenaMatchSettled` },
        {
          $setOnInsert: {
            eventType: "ArenaMatchSettled",
            aggregateType: "ArenaMatch",
            aggregateId: match._id,
            idempotencyKey: `${match._id}:ArenaMatchSettled`,
            payload: {
              arenaVersion: "2.0",
              gameMode: match.gameMode,
              winnerRole,
              settlementVersion: SETTLEMENT_VERSION,
            },
          },
        },
        { upsert: true, setDefaultsOnInsert: true, session }
      );
      result = {
        status: "SETTLED",
        settled: true,
        replayed: false,
        winnerRole,
        resultSnapshot: match.resultSnapshot,
      };
    };
    if (ownsSession) await session.withTransaction(settle);
    else await settle();
    return result;
  } catch (error) {
    if (ownsSession && Number(error?.code) === 11000) {
      const match = await ArenaMatch.findById(matchId).lean();
      if (match?.status === "SETTLED") {
        return {
          status: "SETTLED",
          settled: true,
          replayed: true,
          winnerRole: match.winnerRole,
          resultSnapshot: match.resultSnapshot,
        };
      }
    }
    throw error;
  } finally {
    if (ownsSession) await session.endSession();
  }
}

module.exports = {
  SETTLEMENT_VERSION,
  cancelArenaV2Match,
  forfeitArenaV2Match,
  outcomeName,
  settleArenaV2Match,
  winnerFromScores,
};
