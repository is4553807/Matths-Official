const mongoose = require("mongoose");
const { AdminTodo } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaRevengeRight,
  ArenaStanding,
  ArenaStandingChangeLedger,
} = require("../models/goatArenaModel");
const {
  compareArenaAttemptScores,
  scoreArenaAttempt,
} = require("./arenaMatchScoringService");
const {
  isSundayDivisionLocked,
} = require("./arenaMatchService");
const {
  addMatchTransfer,
  settleLocked,
} = require("./mainLearningDayService");

const MAIN_NORMAL_SETTLEMENT_VERSION = "MAIN-NORMAL-SETTLEMENT-V1";

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function tuple(tupleValue) {
  return {
    arenaRank: String(tupleValue?.arenaRank || ""),
    arenaPosition: Number(tupleValue?.arenaPosition || 0),
    arenaGp: Number(tupleValue?.arenaGp || 0),
  };
}

function tuplesEqual(left, right) {
  const a = tuple(left);
  const b = tuple(right);
  return (
    a.arenaRank === b.arenaRank &&
    a.arenaPosition === b.arenaPosition &&
    a.arenaGp === b.arenaGp
  );
}

function scoreTieBreak(challenger, defender) {
  const rules = [
    ["score", "DESC"],
    ["correctCount", "DESC"],
    ["correctAnswerSolveTimeMs", "ASC"],
    ["totalSolveTimeMs", "ASC"],
  ];
  for (const [key, direction] of rules) {
    if (Number(challenger[key]) !== Number(defender[key])) return key;
  }
  return "FULL_TIE_DEFENDER_WINS";
}

async function holdMatch({ match, session, reasonCode, description, now }) {
  match.status = "HELD";
  match.integrityStatus = "SUSPICIOUS";
  await match.save({ session });
  await AdminTodo.findOneAndUpdate(
    { sourceType: "ArenaMatchSettlement", sourceId: match._id },
    {
      $setOnInsert: {
        category: "integrity",
        title: "Main Division 경기 정산 보류",
        description,
        href: `/admin/arena-matches#match-${match._id}`,
        targetUserId: match.challenger.userId,
        actorUserId: match.challenger.userId,
        sourceType: "ArenaMatchSettlement",
        sourceId: match._id,
        status: "pending",
        metadata: { reasonCode },
      },
    },
    { upsert: true, setDefaultsOnInsert: true, session }
  );
  return { status: "HELD", settled: false, held: true, reasonCode, resolvedAt: now };
}

async function swapStandings({
  match,
  challengerStanding,
  defenderStanding,
  challengerBefore,
  defenderBefore,
  session,
}) {
  const highest = await ArenaStanding.findOne({
    division: match.division,
    seasonKey: match.seasonKey,
  })
    .sort({ arenaPosition: -1 })
    .select("arenaPosition")
    .session(session)
    .lean();
  const temporaryPosition =
    Math.max(
      Number(highest?.arenaPosition || 0),
      challengerBefore.arenaPosition,
      defenderBefore.arenaPosition
    ) + 1;
  const first = await ArenaStanding.updateOne(
    {
      _id: challengerStanding._id,
      arenaRank: challengerBefore.arenaRank,
      arenaPosition: challengerBefore.arenaPosition,
      arenaGp: challengerBefore.arenaGp,
    },
    { $set: { ...challengerBefore, arenaPosition: temporaryPosition } },
    { session }
  );
  const second = await ArenaStanding.updateOne(
    {
      _id: defenderStanding._id,
      arenaRank: defenderBefore.arenaRank,
      arenaPosition: defenderBefore.arenaPosition,
      arenaGp: defenderBefore.arenaGp,
    },
    { $set: challengerBefore },
    { session }
  );
  const third = await ArenaStanding.updateOne(
    {
      _id: challengerStanding._id,
      arenaRank: challengerBefore.arenaRank,
      arenaPosition: temporaryPosition,
      arenaGp: challengerBefore.arenaGp,
    },
    { $set: defenderBefore },
    { session }
  );
  if (!first.modifiedCount || !second.modifiedCount || !third.modifiedCount) {
    throw statusError(409, "Main Division 정산 중 Arena 상태가 변경되었습니다.", "MAIN_SETTLEMENT_STANDING_CONFLICT");
  }
}

async function writeMainCycleState({ cycle, state, session }) {
  const result = await AccessCycle.updateOne(
    {
      _id: cycle._id,
      status: "ACTIVE",
      availableLearningDays: Number(cycle.availableLearningDays || 0),
      reservedLearningDays: Number(cycle.reservedLearningDays || 0),
      lockedLearningDays: Number(cycle.lockedLearningDays || 0),
    },
    {
      $set: {
        learningDayBuckets: state.buckets,
        availableLearningDays: state.availableLearningDays,
        reservedLearningDays: state.reservedLearningDays,
        lockedLearningDays: state.lockedLearningDays,
      },
    },
    { session }
  );
  if (!result.modifiedCount) {
    throw statusError(409, "Main Division 학습일수 정산이 다른 요청과 충돌했습니다.", "MAIN_SETTLEMENT_CYCLE_CONFLICT");
  }
}

function balanceAfter(cycle, state) {
  return {
    availableLearningDays: state.availableLearningDays,
    paybackScoreDays: Number(cycle.paybackScoreDays || 0),
    lockedLearningDays: state.lockedLearningDays,
    reservedLearningDays: state.reservedLearningDays,
  };
}

async function settleMainNormalMatch({ matchId, now = new Date() }) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(400, "정산할 Main Division 경기 정보를 확인해주세요.", "INVALID_MAIN_MATCH_ID");
  }
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "정산할 Main Division 경기를 찾을 수 없습니다.", "MAIN_MATCH_NOT_FOUND");
      if (match.status === "SETTLED") {
        result = { status: "SETTLED", settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD") {
        result = { status: "HELD", settled: false, held: true, replayed: true };
        return;
      }
      if (match.division !== "MAIN" || match.matchType !== "NORMAL") {
        throw statusError(409, "Main Division 일반 경기만 이 정산기로 처리할 수 있습니다.", "UNSUPPORTED_MAIN_SETTLEMENT_TYPE");
      }
      if (match.status !== "SUBMITTED") {
        result = { status: match.status, settled: false, waiting: true };
        return;
      }
      if (isSundayDivisionLocked(processedAt)) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "SUNDAY_DIVISION_LOCK",
          description: "일요일 15시 이후 Main Division 정산을 공개 전환 전까지 보류했습니다.",
          now: processedAt,
        });
        return;
      }
      const [attempts, evidence, problemPack] = await Promise.all([
        ArenaMatchAttempt.find({ matchId }).session(session).lean(),
        ArenaMatchEvidence.find({ matchId }).session(session).lean(),
        ArenaProblemPack.findById(match.problemPackId)
          .select("+questions")
          .session(session)
          .lean(),
      ]);
      if (
        attempts.length !== 2 ||
        attempts.some((attempt) => attempt.status !== "SUBMITTED") ||
        evidence.length !== 2 ||
        !problemPack
      ) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "INCOMPLETE_SETTLEMENT_INPUT",
          description: "Main Division 경기의 양측 답안·증거·문제 팩을 모두 확인하지 못했습니다.",
          now: processedAt,
        });
        return;
      }
      if (
        match.integrityStatus !== "CLEAR" ||
        evidence.some(
          (item) =>
            item.status === "ANOMALY_FLAGGED" ||
            (item.anomalyFlags || []).length > 0
        )
      ) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "INTEGRITY_REVIEW_REQUIRED",
          description: "Main Division 풀이 증거 또는 경기 활동에 이상 징후가 있습니다.",
          now: processedAt,
        });
        return;
      }
      const byRole = new Map(attempts.map((attempt) => [attempt.role, attempt]));
      const challengerScore = scoreArenaAttempt({
        attempt: byRole.get("CHALLENGER"),
        problemPack,
      });
      const defenderScore = scoreArenaAttempt({
        attempt: byRole.get("DEFENDER"),
        problemPack,
      });
      const winnerRole = compareArenaAttemptScores(challengerScore, defenderScore);
      const [challengerStanding, defenderStanding, challengerCycle, defenderCycle] =
        await Promise.all([
          ArenaStanding.findById(match.challenger.standingId).session(session).lean(),
          ArenaStanding.findById(match.defender.standingId).session(session).lean(),
          AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
          AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
        ]);
      const challengerBefore = tuple(match.challenger.tupleBefore);
      const defenderBefore = tuple(match.defender.tupleBefore);
      const stakeDays = Number(match.economySnapshot?.originalStakeDays || 0);
      if (
        !challengerStanding ||
        !defenderStanding ||
        !challengerCycle ||
        !defenderCycle ||
        !tuplesEqual(challengerStanding, challengerBefore) ||
        !tuplesEqual(defenderStanding, defenderBefore) ||
        challengerCycle.status !== "ACTIVE" ||
        defenderCycle.status !== "ACTIVE" ||
        Number(challengerCycle.lockedLearningDays || 0) < stakeDays ||
        Number(defenderCycle.lockedLearningDays || 0) < stakeDays
      ) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "SETTLEMENT_SOURCE_CHANGED",
          description: "Main Division 경기 생성 시 고정한 Arena 상태 또는 예치 학습일수가 변경되었습니다.",
          now: processedAt,
        });
        return;
      }
      const swap = winnerRole === "CHALLENGER";
      if (swap) {
        await swapStandings({
          match,
          challengerStanding,
          defenderStanding,
          challengerBefore,
          defenderBefore,
          session,
        });
      }
      const challengerAfter = swap ? defenderBefore : challengerBefore;
      const defenderAfter = swap ? challengerBefore : defenderBefore;
      const winnerCycle = winnerRole === "CHALLENGER" ? challengerCycle : defenderCycle;
      const loserCycle = winnerRole === "CHALLENGER" ? defenderCycle : challengerCycle;
      const winnerReleased = settleLocked(winnerCycle, {
        returnDays: stakeDays,
        removeDays: stakeDays,
      });
      const winnerState = addMatchTransfer(
        { ...winnerCycle, learningDayBuckets: winnerReleased.buckets,
          availableLearningDays: winnerReleased.availableLearningDays,
          reservedLearningDays: winnerReleased.reservedLearningDays,
          lockedLearningDays: winnerReleased.lockedLearningDays },
        stakeDays
      );
      const loserState = settleLocked(loserCycle, {
        returnDays: 0,
        removeDays: stakeDays,
      });
      const challengerState =
        winnerRole === "CHALLENGER" ? winnerState : loserState;
      const defenderState =
        winnerRole === "DEFENDER" ? winnerState : loserState;
      await writeMainCycleState({ cycle: challengerCycle, state: challengerState, session });
      await writeMainCycleState({ cycle: defenderCycle, state: defenderState, session });
      await ArenaStandingChangeLedger.create(
        [
          {
            matchId,
            userId: match.challenger.userId,
            idempotencyKey: `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:CHALLENGER:TUPLE`,
            changeType: swap ? "TUPLE_SWAP" : "NO_TUPLE_WRITE",
            tupleBefore: challengerBefore,
            tupleAfter: challengerAfter,
            occurredAt: processedAt,
          },
          {
            matchId,
            userId: match.defender.userId,
            idempotencyKey: `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:DEFENDER:TUPLE`,
            changeType: swap ? "TUPLE_SWAP" : "NO_TUPLE_WRITE",
            tupleBefore: defenderBefore,
            tupleAfter: defenderAfter,
            occurredAt: processedAt,
          },
        ],
        { session, ordered: true }
      );
      await ArenaLearningDayLedger.create(
        [
          {
            userId: match.challenger.userId,
            accessCycleId: challengerCycle._id,
            idempotencyKey: `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:CHALLENGER:DAYS`,
            eventType: "MATCH_SETTLEMENT_TRANSFER",
            availableLearningDaysDelta:
              challengerState.availableLearningDays -
              Number(challengerCycle.availableLearningDays || 0),
            paybackScoreDaysDelta: 0,
            lockedLearningDaysDelta: -stakeDays,
            reservedLearningDaysDelta: 0,
            sourceBucket: "MAIN_MATCH_TRANSFER",
            balanceAfter: balanceAfter(challengerCycle, challengerState),
            sourceType: "ArenaMatch",
            sourceId: matchId,
            occurredAt: processedAt,
            metadata: { winnerRole, ownStakeReturnedDays: winnerRole === "CHALLENGER" ? stakeDays : 0, transferredDays: winnerRole === "CHALLENGER" ? stakeDays : 0 },
          },
          {
            userId: match.defender.userId,
            accessCycleId: defenderCycle._id,
            idempotencyKey: `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:DEFENDER:DAYS`,
            eventType: "MATCH_SETTLEMENT_TRANSFER",
            availableLearningDaysDelta:
              defenderState.availableLearningDays -
              Number(defenderCycle.availableLearningDays || 0),
            paybackScoreDaysDelta: 0,
            lockedLearningDaysDelta: -stakeDays,
            reservedLearningDaysDelta: 0,
            sourceBucket: "MAIN_MATCH_TRANSFER",
            balanceAfter: balanceAfter(defenderCycle, defenderState),
            sourceType: "ArenaMatch",
            sourceId: matchId,
            occurredAt: processedAt,
            metadata: { winnerRole, ownStakeReturnedDays: winnerRole === "DEFENDER" ? stakeDays : 0, transferredDays: winnerRole === "DEFENDER" ? stakeDays : 0 },
          },
        ],
        { session, ordered: true }
      );
      const loserUserId =
        winnerRole === "CHALLENGER"
          ? match.defender.userId
          : match.challenger.userId;
      const winnerUserId =
        winnerRole === "CHALLENGER"
          ? match.challenger.userId
          : match.defender.userId;
      const revengeRight = await ArenaRevengeRight.findOneAndUpdate(
        { sourceMatchId: matchId },
        {
          $setOnInsert: {
            division: "MAIN",
            eligibleUserId: loserUserId,
            opponentUserId: winnerUserId,
            status: "AVAILABLE",
            originalStakeDays: stakeDays,
            revengeStakeDays:
              stakeDays * Number(match.economySnapshot?.revengeStakeMultiplier || 2),
            feeDays: Number(match.economySnapshot?.feeDays || 1),
            policyVersionCode: match.divisionPolicyVersionCode,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
      );
      match.status = "SETTLED";
      match.winnerRole = winnerRole;
      match.integrityStatus = "CLEAR";
      match.resolvedAt = processedAt;
      match.settledAt = processedAt;
      match.settlementIdempotencyKey = `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: challengerScore,
        defender: defenderScore,
        tieBreakStep: scoreTieBreak(challengerScore, defenderScore),
        winnerRole,
        settlementSummary: {
          version: MAIN_NORMAL_SETTLEMENT_VERSION,
          tupleAction: swap ? "SWAP" : "KEEP",
          winnerOwnStakeReturnedDays: stakeDays,
          loserStakeTransferredDays: stakeDays,
          revengeRightId: String(revengeRight._id),
          challengerBalanceAfter: balanceAfter(challengerCycle, challengerState),
          defenderBalanceAfter: balanceAfter(defenderCycle, defenderState),
        },
        resolvedAt: processedAt,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId }, { session });
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "ArenaMatchSettled",
            aggregateType: "ArenaMatch",
            aggregateId: matchId,
            idempotencyKey: `${matchId}:ArenaMatchSettled`,
            payload: { division: "MAIN", matchType: "NORMAL", winnerRole, tupleAction: swap ? "SWAP" : "KEEP" },
          },
          {
            eventType: "ArenaRevengeRightCreated",
            aggregateType: "ArenaRevengeRight",
            aggregateId: revengeRight._id,
            idempotencyKey: `${revengeRight._id}:ArenaRevengeRightCreated`,
            payload: { division: "MAIN", sourceMatchId: matchId, eligibleUserId: loserUserId },
          },
        ],
        { session, ordered: true }
      );
      result = {
        status: "SETTLED",
        settled: true,
        replayed: false,
        winnerRole,
        resultSnapshot: match.resultSnapshot,
      };
    });
  } finally {
    await session.endSession();
  }
  if (result?.settled) {
    const { recordSettledMainMatchActivities } = require("./arenaDormancyService");
    await recordSettledMainMatchActivities({ matchId, settledAt: processedAt });
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: processedAt });
  }
  return result;
}

module.exports = {
  MAIN_NORMAL_SETTLEMENT_VERSION,
  settleMainNormalMatch,
  _testing: { scoreTieBreak, tuple, tuplesEqual },
};
