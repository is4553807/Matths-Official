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
const {
  finalizeExpiredAccessCycle,
} = require("./accessCycleDailyService");
const {
  createRankUpPresentationsForSettlement,
} = require("./arenaRankUpPresentationService");
const {
  mainNormalMatchStakes,
} = require("./mainNormalMatchEconomyService");

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
        title: "Ranked 경기 정산 보류",
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
    throw statusError(409, "Ranked 정산 중 Arena 상태가 변경되었습니다.", "MAIN_SETTLEMENT_STANDING_CONFLICT");
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
  // 단독 예치 상향 쟁탈전의 방어자는 예치 잔액이 0일 수 있다.
  // 이때 정산 결과도 잔액 변경이 없을 수 있으므로, 대상 문서가
  // 존재하면 낙관적 동시성 검증은 통과한 것으로 본다.
  if (!result.matchedCount) {
    throw statusError(409, "Ranked 학습일수 정산이 다른 요청과 충돌했습니다.", "MAIN_SETTLEMENT_CYCLE_CONFLICT");
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

async function settleMainNormalMatch({
  matchId,
  now = new Date(),
  forcedWinnerRole = null,
  automaticReason = "",
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(400, "정산할 Ranked 경기 정보를 확인해주세요.", "INVALID_MAIN_MATCH_ID");
  }
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result;
  let depletedCycleIds = [];
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "정산할 Ranked 경기를 찾을 수 없습니다.", "MAIN_MATCH_NOT_FOUND");
      if (match.status === "SETTLED") {
        result = { status: "SETTLED", settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD") {
        result = { status: "HELD", settled: false, held: true, replayed: true };
        return;
      }
      if (match.division !== "MAIN" || match.matchType !== "NORMAL") {
        throw statusError(409, "Ranked 일반 경기만 이 정산기로 처리할 수 있습니다.", "UNSUPPORTED_MAIN_SETTLEMENT_TYPE");
      }
      const forcedWinner = String(forcedWinnerRole || "").toUpperCase();
      const automaticSettlement = ["CHALLENGER", "DEFENDER"].includes(forcedWinner);
      if (!automaticSettlement && match.status !== "SUBMITTED") {
        result = { status: match.status, settled: false, waiting: true };
        return;
      }
      if (!automaticSettlement && isSundayDivisionLocked(processedAt)) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "SUNDAY_DIVISION_LOCK",
          description: "일요일 15시 이후 Ranked 정산을 공개 전환 전까지 보류했습니다.",
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
      if (!automaticSettlement && (
        attempts.length !== 2 ||
        attempts.some((attempt) => attempt.status !== "SUBMITTED") ||
        evidence.length !== 2 ||
        !problemPack
      )) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "INCOMPLETE_SETTLEMENT_INPUT",
          description: "Ranked 경기의 양측 답안·증거·문제 팩을 모두 확인하지 못했습니다.",
          now: processedAt,
        });
        return;
      }
      if (!automaticSettlement && (
        match.integrityStatus !== "CLEAR" ||
        evidence.some(
          (item) =>
            item.status !== "REVIEWED" &&
            (item.status === "ANOMALY_FLAGGED" ||
              (item.anomalyFlags || []).length > 0)
        )
      )) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "INTEGRITY_REVIEW_REQUIRED",
          description: "Ranked 풀이 증거 또는 경기 활동에 이상 징후가 있습니다.",
          now: processedAt,
        });
        return;
      }
      const byRole = new Map(attempts.map((attempt) => [attempt.role, attempt]));
      const challengerScore = automaticSettlement
        ? null
        : scoreArenaAttempt({ attempt: byRole.get("CHALLENGER"), problemPack });
      const defenderScore = automaticSettlement
        ? null
        : scoreArenaAttempt({ attempt: byRole.get("DEFENDER"), problemPack });
      const winnerRole = automaticSettlement
        ? forcedWinner
        : compareArenaAttemptScores(challengerScore, defenderScore);
      const [challengerStanding, defenderStanding, challengerCycle, defenderCycle] =
        await Promise.all([
          ArenaStanding.findById(match.challenger.standingId).session(session).lean(),
          ArenaStanding.findById(match.defender.standingId).session(session).lean(),
          AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
          AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
        ]);
      const challengerBefore = tuple(match.challenger.tupleBefore);
      const defenderBefore = tuple(match.defender.tupleBefore);
      const {
        challengerStakeDays,
        defenderStakeDays,
        normalStakeMode,
      } = mainNormalMatchStakes(match);
      if (
        !challengerStanding ||
        !defenderStanding ||
        !challengerCycle ||
        !defenderCycle ||
        !tuplesEqual(challengerStanding, challengerBefore) ||
        !tuplesEqual(defenderStanding, defenderBefore) ||
        challengerCycle.status !== "ACTIVE" ||
        defenderCycle.status !== "ACTIVE" ||
        Number(challengerCycle.lockedLearningDays || 0) < challengerStakeDays ||
        Number(defenderCycle.lockedLearningDays || 0) < defenderStakeDays
      ) {
        result = await holdMatch({
          match,
          session,
          reasonCode: "SETTLEMENT_SOURCE_CHANGED",
          description: "Ranked 경기 생성 시 고정한 Arena 상태 또는 예치 학습일수가 변경되었습니다.",
          now: processedAt,
        });
        return;
      }
      // Ranked는 소속과 무관한 단일 풀로 정산한다. 과거 분리 풀 경기 역시
      // 새 정산부터 통합 규칙을 적용하되, 참가자의 경기 전 Arena 상태는 그대로 보존한다.
      match.competitivePool = "ALL";
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
      const challengerWon = winnerRole === "CHALLENGER";
      const challengerReleased = settleLocked(challengerCycle, {
        returnDays: challengerWon ? challengerStakeDays : 0,
        removeDays: challengerStakeDays,
      });
      const defenderReleased = settleLocked(defenderCycle, {
        returnDays: challengerWon ? 0 : defenderStakeDays,
        removeDays: defenderStakeDays,
      });
      const challengerState = challengerWon
        ? addMatchTransfer(challengerReleased, defenderStakeDays)
        : challengerReleased;
      const defenderState = challengerWon
        ? defenderReleased
        : addMatchTransfer(defenderReleased, challengerStakeDays);
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
      await createRankUpPresentationsForSettlement({
        matchId,
        challengerUserId: match.challenger.userId,
        defenderUserId: match.defender.userId,
        challengerTupleBefore: challengerBefore,
        challengerTupleAfter: challengerAfter,
        defenderTupleBefore: defenderBefore,
        defenderTupleAfter: defenderAfter,
        occurredAt: processedAt,
        session,
      });
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
            lockedLearningDaysDelta: -challengerStakeDays,
            reservedLearningDaysDelta: 0,
            sourceBucket: "MAIN_MATCH_TRANSFER",
            balanceAfter: balanceAfter(challengerCycle, challengerState),
            sourceType: "ArenaMatch",
            sourceId: matchId,
            occurredAt: processedAt,
            metadata: {
              winnerRole,
              normalStakeMode,
              ownStakeReturnedDays: challengerWon ? challengerStakeDays : 0,
              transferredDays: challengerWon ? defenderStakeDays : 0,
              depositedDays: challengerStakeDays,
            },
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
            lockedLearningDaysDelta: -defenderStakeDays,
            reservedLearningDaysDelta: 0,
            sourceBucket: "MAIN_MATCH_TRANSFER",
            balanceAfter: balanceAfter(defenderCycle, defenderState),
            sourceType: "ArenaMatch",
            sourceId: matchId,
            occurredAt: processedAt,
            metadata: {
              winnerRole,
              normalStakeMode,
              ownStakeReturnedDays: challengerWon ? 0 : defenderStakeDays,
              transferredDays: challengerWon ? 0 : challengerStakeDays,
              depositedDays: defenderStakeDays,
            },
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
      const revengeRight = automaticSettlement
        ? null
        : await ArenaRevengeRight.findOneAndUpdate(
        { sourceMatchId: matchId },
        {
          $setOnInsert: {
            division: "MAIN",
            eligibleUserId: loserUserId,
            opponentUserId: winnerUserId,
            status: "AVAILABLE",
            originalStakeDays: challengerStakeDays,
            revengeStakeDays:
              challengerStakeDays * Number(match.economySnapshot?.revengeStakeMultiplier || 2),
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
        tieBreakStep: automaticSettlement
          ? String(automaticReason || "AUTO_FORFEIT")
          : scoreTieBreak(challengerScore, defenderScore),
        winnerRole,
        settlementSummary: {
          version: MAIN_NORMAL_SETTLEMENT_VERSION,
          tupleAction: swap ? "SWAP" : "KEEP",
          normalStakeMode,
          challengerStakeDays,
          defenderStakeDays,
          winnerOwnStakeReturnedDays: challengerWon
            ? challengerStakeDays
            : defenderStakeDays,
          loserStakeTransferredDays: challengerWon
            ? defenderStakeDays
            : challengerStakeDays,
          revengeRightId: revengeRight ? String(revengeRight._id) : null,
          automaticReason: automaticSettlement ? String(automaticReason || "AUTO_FORFEIT") : "",
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
          ...(revengeRight ? [{
            eventType: "ArenaRevengeRightCreated",
            aggregateType: "ArenaRevengeRight",
            aggregateId: revengeRight._id,
            idempotencyKey: `${revengeRight._id}:ArenaRevengeRightCreated`,
            payload: { division: "MAIN", sourceMatchId: matchId, eligibleUserId: loserUserId },
          }] : []),
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
      depletedCycleIds = [
        challengerState.availableLearningDays === 0 &&
        challengerState.reservedLearningDays === 0 &&
        challengerState.lockedLearningDays === 0
          ? challengerCycle._id
          : null,
        defenderState.availableLearningDays === 0 &&
        defenderState.reservedLearningDays === 0 &&
        defenderState.lockedLearningDays === 0
          ? defenderCycle._id
          : null,
      ].filter(Boolean);
    });
  } finally {
    await session.endSession();
  }
  if (result?.settled) {
    // 진행 중인 경기에서는 만료 전환을 막고, 잠긴 금액까지 정산한 직후에만
    // 실제 총 잔액을 기준으로 이용 종료를 판정한다.
    if (depletedCycleIds.length) {
      await Promise.all(
        depletedCycleIds.map((cycleId) =>
          finalizeExpiredAccessCycle({ cycleId, now: processedAt })
        )
      );
    }
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: processedAt });
  }
  return result;
}

// 양측 모두 시작하지 않은 Ranked 일반 경기는 승패 없이 취소한다. 경기 생성 때
// 고정한 예치 금액만 그대로 되돌리고, 이후 정책 변경 값은 참조하지 않는다.
async function cancelMainNormalNoStart({
  matchId,
  now = new Date(),
  cancellationReason = "BOTH_START_DEADLINE_NO_SHOW",
}) {
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "취소할 Ranked 경기를 찾을 수 없습니다.", "MAIN_MATCH_NOT_FOUND");
      if (match.status === "CANCELLED") {
        result = { status: "CANCELLED", cancelled: true, replayed: true };
        return;
      }
      if (match.status === "SETTLED" || match.status === "HELD") {
        result = { status: match.status, cancelled: false, replayed: true };
        return;
      }
      if (match.division !== "MAIN" || match.matchType !== "NORMAL") {
        throw statusError(409, "Ranked 일반 경기만 미시작 취소할 수 있습니다.", "UNSUPPORTED_MAIN_NO_START_CANCEL");
      }
      const [challengerCycle, defenderCycle] = await Promise.all([
        AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
        AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
      ]);
      const { challengerStakeDays, defenderStakeDays } = mainNormalMatchStakes(match);
      if (
        !challengerCycle || !defenderCycle ||
        challengerCycle.status !== "ACTIVE" || defenderCycle.status !== "ACTIVE" ||
        Number(challengerCycle.lockedLearningDays || 0) < challengerStakeDays ||
        Number(defenderCycle.lockedLearningDays || 0) < defenderStakeDays
      ) {
        throw statusError(409, "반환할 Ranked 예치 학습일수 원본이 변경되었습니다.", "MAIN_NO_START_STAKE_CONFLICT");
      }
      const challengerState = settleLocked(challengerCycle, {
        returnDays: challengerStakeDays,
        removeDays: challengerStakeDays,
      });
      const defenderState = settleLocked(defenderCycle, {
        returnDays: defenderStakeDays,
        removeDays: defenderStakeDays,
      });
      await writeMainCycleState({ cycle: challengerCycle, state: challengerState, session });
      await writeMainCycleState({ cycle: defenderCycle, state: defenderState, session });
      await ArenaLearningDayLedger.create([
        {
          userId: match.challenger.userId,
          accessCycleId: challengerCycle._id,
          idempotencyKey: `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:BOTH_NO_START:CHALLENGER`,
          eventType: "MATCH_STAKE_RELEASED",
          availableLearningDaysDelta: challengerStakeDays,
          paybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: -challengerStakeDays,
          reservedLearningDaysDelta: 0,
          sourceBucket: "MAIN_MATCH_TRANSFER",
          balanceAfter: balanceAfter(challengerCycle, challengerState),
          sourceType: "ArenaMatch",
          sourceId: matchId,
          occurredAt: processedAt,
          metadata: { outcome: "BOTH_NO_START_CANCELLED" },
        },
        {
          userId: match.defender.userId,
          accessCycleId: defenderCycle._id,
          idempotencyKey: `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:BOTH_NO_START:DEFENDER`,
          eventType: "MATCH_STAKE_RELEASED",
          availableLearningDaysDelta: defenderStakeDays,
          paybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: -defenderStakeDays,
          reservedLearningDaysDelta: 0,
          sourceBucket: "MAIN_MATCH_TRANSFER",
          balanceAfter: balanceAfter(defenderCycle, defenderState),
          sourceType: "ArenaMatch",
          sourceId: matchId,
          occurredAt: processedAt,
          metadata: { outcome: "BOTH_NO_START_CANCELLED" },
        },
      ], { session, ordered: true });
      match.status = "CANCELLED";
      match.integrityStatus = "CLEAR";
      match.noShowRole = cancellationReason === "BOTH_START_DEADLINE_NO_SHOW"
        ? "BOTH"
        : null;
      match.resolvedAt = processedAt;
      match.settlementIdempotencyKey = `${matchId}:${MAIN_NORMAL_SETTLEMENT_VERSION}:${cancellationReason}:CANCEL`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: null,
        defender: null,
        tieBreakStep: cancellationReason,
        winnerRole: null,
        settlementSummary: {
          version: MAIN_NORMAL_SETTLEMENT_VERSION,
          outcome: cancellationReason,
          challengerStakeReturned: challengerStakeDays,
          defenderStakeReturned: defenderStakeDays,
        },
        resolvedAt: processedAt,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId }, { session });
      await ArenaOutboxEvent.findOneAndUpdate(
        { idempotencyKey: `${matchId}:ArenaMatchCancelled:${cancellationReason}` },
        { $setOnInsert: {
          eventType: "ArenaMatchCancelled",
          aggregateType: "ArenaMatch",
          aggregateId: matchId,
          idempotencyKey: `${matchId}:ArenaMatchCancelled:${cancellationReason}`,
          payload: { division: "MAIN", matchType: "NORMAL", reason: cancellationReason, challengerStakeDays, defenderStakeDays },
        } },
        { upsert: true, setDefaultsOnInsert: true, session }
      );
      result = { status: "CANCELLED", cancelled: true, replayed: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = {
  MAIN_NORMAL_SETTLEMENT_VERSION,
  cancelMainNormalNoStart,
  settleMainNormalMatch,
  _testing: { scoreTieBreak, tuple, tuplesEqual },
};
