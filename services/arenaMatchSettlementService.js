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
  ARENA_SCORING_PRIORITY,
  compareArenaAttemptScores,
  scoreArenaAttempt,
} = require("./arenaMatchScoringService");
const {
  isSundayDivisionLocked,
} = require("./arenaMatchService");
const {
  REVENGE_OUTCOMES,
  resolveRevengeSettlement,
} = require("./arenaDivisionRuleService");
const {
  finalizeExpiredAccessCycle,
} = require("./accessCycleDailyService");

const SUB_NORMAL_SETTLEMENT_VERSION =
  "SUB-NORMAL-SETTLEMENT-V1";
const SUB_REVENGE_SETTLEMENT_VERSION =
  "SUB-REVENGE-SETTLEMENT-V1";

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedTuple(tuple) {
  return {
    arenaRank: String(tuple?.arenaRank || ""),
    arenaPosition: numeric(tuple?.arenaPosition),
    arenaGp: numeric(tuple?.arenaGp),
  };
}

function tuplesEqual(left, right) {
  const a = normalizedTuple(left);
  const b = normalizedTuple(right);
  return (
    a.arenaRank === b.arenaRank &&
    a.arenaPosition === b.arenaPosition &&
    a.arenaGp === b.arenaGp
  );
}

function isBronzeTuple(tuple) {
  return ["BRONZE", "브론즈"].includes(
    String(tuple?.arenaRank || "").trim().toUpperCase()
  );
}

function buildSubNormalSettlementPlan({
  winnerRole,
  challengerTuple,
  defenderTuple,
  stakeDays = 1,
  bronzeRefundDays,
}) {
  const winner = String(winnerRole || "").toUpperCase();
  if (!["CHALLENGER", "DEFENDER"].includes(winner)) {
    throw statusError(
      400,
      "일반 쟁탈전 승자를 확인해주세요.",
      "INVALID_SUB_NORMAL_WINNER"
    );
  }
  if (Number(stakeDays) !== 1) {
    throw statusError(
      409,
      "Sub Division 일반 쟁탈전 예치 일수는 1일 고정입니다.",
      "INVALID_SUB_NORMAL_STAKE"
    );
  }
  const challengerBefore = normalizedTuple(challengerTuple);
  const defenderBefore = normalizedTuple(defenderTuple);
  const shouldRefundBronze =
    winner === "CHALLENGER" &&
    isBronzeTuple(challengerBefore) &&
    Number(bronzeRefundDays ?? 1) === 1;
  const challengerDelta = {
    availableLearningDays: shouldRefundBronze ? 1 : 0,
    paybackScoreDays: shouldRefundBronze ? 0 : -1,
    lockedLearningDays: -1,
    paidNormalAttacksCompleted: 1,
  };
  const defenderDelta = {
    availableLearningDays: winner === "DEFENDER" ? 1 : 0,
    paybackScoreDays: winner === "DEFENDER" ? 1 : 0,
    lockedLearningDays: 0,
  };
  return {
    winnerRole: winner,
    tupleAction: winner === "CHALLENGER" ? "SWAP" : "KEEP",
    challengerTupleBefore: challengerBefore,
    defenderTupleBefore: defenderBefore,
    challengerTupleAfter:
      winner === "CHALLENGER" ? defenderBefore : challengerBefore,
    defenderTupleAfter:
      winner === "CHALLENGER" ? challengerBefore : defenderBefore,
    challengerDelta,
    defenderDelta,
    challengerStakeOutcome: shouldRefundBronze
      ? "BRONZE_REFUND"
      : winner === "DEFENDER"
        ? "TRANSFERRED_TO_DEFENDER"
        : "BURNED",
    transferredLearningDays: winner === "DEFENDER" ? 1 : 0,
    burnedLearningDays:
      winner === "CHALLENGER" && !shouldRefundBronze ? 1 : 0,
    returnedLearningDays: shouldRefundBronze ? 1 : 0,
  };
}

function tieBreakStep(challengerScore, defenderScore) {
  for (const [key, direction] of ARENA_SCORING_PRIORITY) {
    const challengerRaw = Number(challengerScore?.[key]);
    const defenderRaw = Number(defenderScore?.[key]);
    const missing = direction === "DESC" ? -Infinity : Infinity;
    const challenger = Number.isFinite(challengerRaw)
      ? challengerRaw
      : missing;
    const defender = Number.isFinite(defenderRaw)
      ? defenderRaw
      : missing;
    if (challenger !== defender) return key;
  }
  return "FULL_TIE_DEFENDER_WINS";
}

function cycleAfter(cycle, delta) {
  return {
    availableLearningDays:
      numeric(cycle.availableLearningDays) +
      numeric(delta.availableLearningDays),
    paybackScoreDays:
      numeric(cycle.paybackScoreDays) +
      numeric(delta.paybackScoreDays),
    lockedLearningDays:
      numeric(cycle.lockedLearningDays) +
      numeric(delta.lockedLearningDays),
    reservedLearningDays: numeric(cycle.reservedLearningDays),
  };
}

function cycleUpdateForDelta(delta) {
  const increments = {};
  for (const field of [
    "availableLearningDays",
    "paybackScoreDays",
    "lockedLearningDays",
    "paidNormalAttacksCompleted",
  ]) {
    if (numeric(delta[field]) !== 0) {
      increments[field] = numeric(delta[field]);
    }
  }
  return increments;
}

async function putSettlementHold({
  match,
  session,
  reasonCode,
  description,
  now,
}) {
  match.status = "HELD";
  match.integrityStatus = "SUSPICIOUS";
  await match.save({ session });
  await AdminTodo.findOneAndUpdate(
    {
      sourceType: "ArenaMatchSettlement",
      sourceId: match._id,
    },
    {
      $setOnInsert: {
        category: "integrity",
        title: "GOAT Arena 경기 정산 보류",
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
    {
      upsert: true,
      setDefaultsOnInsert: true,
      session,
    }
  );
  return {
    status: "HELD",
    held: true,
    reasonCode,
    settled: false,
    resolvedAt: now,
  };
}

async function updateCycle({
  cycle,
  delta,
  userId,
  session,
}) {
  const increments = cycleUpdateForDelta(delta);
  if (!Object.keys(increments).length) return cycleAfter(cycle, delta);
  const result = await AccessCycle.updateOne(
    {
      _id: cycle._id,
      userId,
      status: "ACTIVE",
      availableLearningDays: numeric(cycle.availableLearningDays),
      paybackScoreDays: numeric(cycle.paybackScoreDays),
      lockedLearningDays: numeric(cycle.lockedLearningDays),
      reservedLearningDays: numeric(cycle.reservedLearningDays),
    },
    { $inc: increments },
    { session }
  );
  if (!result.modifiedCount) {
    throw statusError(
      409,
      "경기 정산 중 학습일수 상태가 변경되었습니다. 다시 정산합니다.",
      "ARENA_SETTLEMENT_CYCLE_CONFLICT"
    );
  }
  return cycleAfter(cycle, delta);
}

function learningLedgerEntry({
  match,
  cycle,
  userId,
  delta,
  balanceAfter,
  eventType,
  role,
  now,
}) {
  return {
    userId,
    accessCycleId: cycle._id,
    idempotencyKey: `${match._id}:${SUB_NORMAL_SETTLEMENT_VERSION}:${role}:DAYS`,
    eventType,
    availableLearningDaysDelta: numeric(delta.availableLearningDays),
    paybackScoreDaysDelta: numeric(delta.paybackScoreDays),
    lockedLearningDaysDelta: numeric(delta.lockedLearningDays),
    reservedLearningDaysDelta: 0,
    balanceAfter,
    sourceType: "ArenaMatch",
    sourceId: match._id,
    occurredAt: now,
    metadata: {
      division: "SUB",
      matchType: "NORMAL",
      role,
      settlementVersion: SUB_NORMAL_SETTLEMENT_VERSION,
    },
  };
}

async function writeTupleSwap({
  match,
  challengerStanding,
  defenderStanding,
  challengerTupleBefore,
  defenderTupleBefore,
  challengerTupleAfter,
  defenderTupleAfter,
  session,
}) {
  const highestPosition = await ArenaStanding.findOne({
    division: match.division,
    seasonKey: match.seasonKey,
  })
    .sort({ arenaPosition: -1 })
    .select("arenaPosition")
    .session(session)
    .lean();
  const temporaryPosition =
    Math.max(
      numeric(highestPosition?.arenaPosition),
      numeric(challengerTupleBefore.arenaPosition),
      numeric(defenderTupleBefore.arenaPosition)
    ) + 1;
  const temporaryWrite = await ArenaStanding.updateOne(
    {
      _id: challengerStanding._id,
      arenaRank: challengerTupleBefore.arenaRank,
      arenaPosition: challengerTupleBefore.arenaPosition,
      arenaGp: challengerTupleBefore.arenaGp,
    },
    {
      $set: {
        arenaRank: challengerTupleBefore.arenaRank,
        arenaPosition: temporaryPosition,
        arenaGp: challengerTupleBefore.arenaGp,
      },
    },
    { session }
  );
  const defenderWrite = await ArenaStanding.updateOne(
    {
      _id: defenderStanding._id,
      arenaRank: defenderTupleBefore.arenaRank,
      arenaPosition: defenderTupleBefore.arenaPosition,
      arenaGp: defenderTupleBefore.arenaGp,
    },
    { $set: defenderTupleAfter },
    { session }
  );
  const challengerWrite = await ArenaStanding.updateOne(
    {
      _id: challengerStanding._id,
      arenaRank: challengerTupleBefore.arenaRank,
      arenaPosition: temporaryPosition,
      arenaGp: challengerTupleBefore.arenaGp,
    },
    { $set: challengerTupleAfter },
    { session }
  );
  if (
    !temporaryWrite.modifiedCount ||
    !challengerWrite.modifiedCount ||
    !defenderWrite.modifiedCount
  ) {
    throw statusError(
      409,
      "정산 중 Arena 순위가 변경되었습니다. 다시 정산합니다.",
      "ARENA_SETTLEMENT_STANDING_CONFLICT"
    );
  }
}

async function settleSubRevengeOutcome({
  matchId,
  outcome = null,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(400, "정산할 복수전 정보를 확인해주세요.");
  }
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result = null;
  let depletedCycleIds = [];
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "정산할 복수전을 찾을 수 없습니다.");
      if (match.status === "SETTLED") {
        result = { status: "SETTLED", settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD") {
        result = { status: "HELD", settled: false, held: true, replayed: true };
        return;
      }
      if (match.division !== "SUB" || match.matchType !== "REVENGE") {
        throw statusError(409, "현재 정산기는 Sub Division 복수전만 처리합니다.");
      }
      if (isSundayDivisionLocked(processedAt)) {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "SUNDAY_DIVISION_LOCK",
          description: "일요일 15시 이후 복수전 정산 요청을 운영자 검토로 보냈습니다.",
          now: processedAt,
        });
        return;
      }

      const attempts = await ArenaMatchAttempt.find({ matchId: match._id }).session(session).lean();
      const evidence = await ArenaMatchEvidence.find({ matchId: match._id }).session(session).lean();
      let resolvedOutcome = outcome ? String(outcome).toUpperCase() : null;
      let challengerScore = null;
      let defenderScore = null;
      let winnerRole = null;
      let tieBreak = "NO_SHOW";

      if (!resolvedOutcome) {
        if (
          match.status !== "SUBMITTED" ||
          attempts.length !== 2 ||
          attempts.some((attempt) => attempt.status !== "SUBMITTED") ||
          evidence.length !== 2
        ) {
          result = { status: match.status, settled: false, waiting: true };
          return;
        }
        if (
          evidence.some((entry) => entry.status === "ANOMALY_FLAGGED" || (entry.anomalyFlags || []).length) ||
          match.integrityStatus !== "CLEAR"
        ) {
          result = await putSettlementHold({
            match,
            session,
            reasonCode: "INTEGRITY_REVIEW_REQUIRED",
            description: "복수전 풀이 증거에 이상 징후가 있어 정산을 보류했습니다.",
            now: processedAt,
          });
          return;
        }
        const pack = await ArenaProblemPack.findById(match.problemPackId)
          .select("+questions")
          .session(session)
          .lean();
        if (!pack) {
          result = await putSettlementHold({
            match,
            session,
            reasonCode: "PROBLEM_PACK_NOT_FOUND",
            description: "복수전에 봉인된 문제 팩을 찾지 못했습니다.",
            now: processedAt,
          });
          return;
        }
        const byRole = new Map(attempts.map((attempt) => [attempt.role, attempt]));
        challengerScore = scoreArenaAttempt({ attempt: byRole.get("CHALLENGER"), problemPack: pack });
        defenderScore = scoreArenaAttempt({ attempt: byRole.get("DEFENDER"), problemPack: pack });
        winnerRole = compareArenaAttemptScores(challengerScore, defenderScore);
        resolvedOutcome = winnerRole === "CHALLENGER"
          ? REVENGE_OUTCOMES.ATTACKER_WIN
          : REVENGE_OUTCOMES.DEFENDER_WIN;
        tieBreak = tieBreakStep(challengerScore, defenderScore);
      } else {
        if (!match.completionDeadlineAt || new Date(match.completionDeadlineAt) > processedAt) {
          throw statusError(409, "복수전 완료 기한이 지나기 전에는 No-show 정산을 할 수 없습니다.");
        }
        const completedRole = resolvedOutcome === REVENGE_OUTCOMES.BOTH_NO_SHOW
          ? null
          : resolvedOutcome === REVENGE_OUTCOMES.ATTACKER_NO_SHOW
            ? "DEFENDER"
            : "CHALLENGER";
        const completedEvidence = evidence.find((entry) => {
          const attempt = attempts.find((candidate) => String(candidate._id) === String(entry.attemptId));
          return attempt?.role === completedRole;
        });
        if (
          completedEvidence &&
          (completedEvidence.status === "ANOMALY_FLAGGED" || (completedEvidence.anomalyFlags || []).length)
        ) {
          result = await putSettlementHold({
            match,
            session,
            reasonCode: "INTEGRITY_REVIEW_REQUIRED",
            description: "복수전 완료자의 풀이 증거에 이상 징후가 있어 No-show 정산을 보류했습니다.",
            now: processedAt,
          });
          return;
        }
        winnerRole = resolvedOutcome === REVENGE_OUTCOMES.BOTH_NO_SHOW
          ? null
          : resolvedOutcome === REVENGE_OUTCOMES.DEFENDER_NO_SHOW
            ? "CHALLENGER"
            : "DEFENDER";
      }

      const settlement = resolveRevengeSettlement({
        division: "SUB",
        outcome: resolvedOutcome,
        revengeStakeDays: match.economySnapshot?.challengerStakeDays,
        feeDays: match.economySnapshot?.feeDays,
      });
      const challengerBefore = normalizedTuple(match.challenger.tupleBefore);
      const defenderBefore = normalizedTuple(match.defender.tupleBefore);
      const challengerAfter = settlement.tupleAction === "SWAP" ? defenderBefore : challengerBefore;
      const defenderAfter = settlement.tupleAction === "SWAP" ? challengerBefore : defenderBefore;
      const [challengerStanding, defenderStanding, challengerCycle, defenderCycle] = await Promise.all([
        ArenaStanding.findById(match.challenger.standingId).session(session).lean(),
        ArenaStanding.findById(match.defender.standingId).session(session).lean(),
        AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
        AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
      ]);
      const stakeDays = Number(match.economySnapshot?.challengerStakeDays || 0);
      if (
        !challengerStanding || !defenderStanding || !challengerCycle || !defenderCycle ||
        !tuplesEqual(challengerStanding, challengerBefore) ||
        !tuplesEqual(defenderStanding, defenderBefore) ||
        challengerCycle.status !== "ACTIVE" || defenderCycle.status !== "ACTIVE" ||
        numeric(challengerCycle.lockedLearningDays) < stakeDays
      ) {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "SETTLEMENT_SOURCE_CHANGED",
          description: "복수전 생성 때 고정한 Arena 상태 또는 학습일수 원본이 달라졌습니다.",
          now: processedAt,
        });
        return;
      }
      if (settlement.tupleAction === "SWAP") {
        await writeTupleSwap({
          match,
          challengerStanding,
          defenderStanding,
          challengerTupleBefore: challengerBefore,
          defenderTupleBefore: defenderBefore,
          challengerTupleAfter: challengerAfter,
          defenderTupleAfter: defenderAfter,
          session,
        });
      }
      const challengerDelta = {
        availableLearningDays: settlement.returnToAttackerDays,
        paybackScoreDays: 0,
        lockedLearningDays: -stakeDays,
      };
      const defenderDelta = {
        availableLearningDays: settlement.transferToDefenderDays,
        paybackScoreDays: 0,
        lockedLearningDays: 0,
      };
      const challengerBalanceAfter = await updateCycle({ cycle: challengerCycle, delta: challengerDelta, userId: match.challenger.userId, session });
      const defenderBalanceAfter = await updateCycle({ cycle: defenderCycle, delta: defenderDelta, userId: match.defender.userId, session });

      await ArenaStandingChangeLedger.create(
        [
          { matchId: match._id, userId: match.challenger.userId, idempotencyKey: `${match._id}:${SUB_REVENGE_SETTLEMENT_VERSION}:CHALLENGER:TUPLE`, changeType: settlement.tupleAction === "SWAP" ? "TUPLE_SWAP" : "NO_TUPLE_WRITE", tupleBefore: challengerBefore, tupleAfter: challengerAfter, occurredAt: processedAt },
          { matchId: match._id, userId: match.defender.userId, idempotencyKey: `${match._id}:${SUB_REVENGE_SETTLEMENT_VERSION}:DEFENDER:TUPLE`, changeType: settlement.tupleAction === "SWAP" ? "TUPLE_SWAP" : "NO_TUPLE_WRITE", tupleBefore: defenderBefore, tupleAfter: defenderAfter, occurredAt: processedAt },
        ],
        { session, ordered: true }
      );
      const ledgerEntries = [
        {
          userId: match.challenger.userId,
          accessCycleId: challengerCycle._id,
          idempotencyKey: `${match._id}:${SUB_REVENGE_SETTLEMENT_VERSION}:CHALLENGER:DAYS`,
          eventType: settlement.returnToAttackerDays > 0 ? "REVENGE_NO_SHOW_PARTIAL_REFUND" : "REVENGE_FEE_BURN",
          availableLearningDaysDelta: challengerDelta.availableLearningDays,
          paybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: challengerDelta.lockedLearningDays,
          reservedLearningDaysDelta: 0,
          balanceAfter: challengerBalanceAfter,
          sourceType: "ArenaMatch",
          sourceId: match._id,
          occurredAt: processedAt,
          metadata: { outcome: resolvedOutcome, burnedLearningDays: settlement.burnDays },
        },
      ];
      if (settlement.transferToDefenderDays > 0) {
        ledgerEntries.push({
          userId: match.defender.userId,
          accessCycleId: defenderCycle._id,
          idempotencyKey: `${match._id}:${SUB_REVENGE_SETTLEMENT_VERSION}:DEFENDER:DAYS`,
          eventType: "MATCH_SETTLEMENT_TRANSFER",
          availableLearningDaysDelta: defenderDelta.availableLearningDays,
          paybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: 0,
          reservedLearningDaysDelta: 0,
          balanceAfter: defenderBalanceAfter,
          sourceType: "ArenaMatch",
          sourceId: match._id,
          occurredAt: processedAt,
          metadata: { outcome: resolvedOutcome, burnedLearningDays: settlement.burnDays },
        });
      }
      await ArenaLearningDayLedger.create(ledgerEntries, { session, ordered: true });

      const settlementSummary = {
        version: SUB_REVENGE_SETTLEMENT_VERSION,
        outcome: resolvedOutcome,
        tupleAction: settlement.tupleAction,
        returnedLearningDays: settlement.returnToAttackerDays,
        transferredLearningDays: settlement.transferToDefenderDays,
        burnedLearningDays: settlement.burnDays,
        challengerBalanceAfter,
        defenderBalanceAfter,
      };
      match.status = "SETTLED";
      match.winnerRole = winnerRole;
      match.noShowRole = resolvedOutcome === REVENGE_OUTCOMES.ATTACKER_NO_SHOW
        ? "CHALLENGER"
        : resolvedOutcome === REVENGE_OUTCOMES.DEFENDER_NO_SHOW
          ? "DEFENDER"
          : resolvedOutcome === REVENGE_OUTCOMES.BOTH_NO_SHOW
            ? "BOTH"
            : null;
      match.integrityStatus = "CLEAR";
      match.resolvedAt = processedAt;
      match.settledAt = processedAt;
      match.settlementIdempotencyKey = `${match._id}:${SUB_REVENGE_SETTLEMENT_VERSION}`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: challengerScore,
        defender: defenderScore,
        tieBreakStep: tieBreak,
        winnerRole,
        settlementSummary,
        resolvedAt: processedAt,
      };
      await match.save({ session });
      await Promise.all([
        ArenaMatchParticipantLock.deleteMany({ matchId: match._id }, { session }),
        ArenaRevengeRight.updateOne(
          { _id: match.revengeRightId, revengeMatchId: match._id },
          { $set: { status: "CONSUMED" } },
          { session }
        ),
      ]);
      const outbox = [
        {
          eventType: "ArenaMatchSettled",
          aggregateType: "ArenaMatch",
          aggregateId: match._id,
          idempotencyKey: `${match._id}:ArenaMatchSettled`,
          payload: { division: "SUB", matchType: "REVENGE", winnerRole, tupleAction: settlement.tupleAction, outcome: resolvedOutcome },
        },
      ];
      if ([REVENGE_OUTCOMES.ATTACKER_NO_SHOW, REVENGE_OUTCOMES.DEFENDER_NO_SHOW, REVENGE_OUTCOMES.BOTH_NO_SHOW].includes(resolvedOutcome)) {
        outbox.push({
          eventType: "ArenaRevengeNoShowSettled",
          aggregateType: "ArenaMatch",
          aggregateId: match._id,
          idempotencyKey: `${match._id}:ArenaRevengeNoShowSettled`,
          payload: { outcome: resolvedOutcome },
        });
      }
      await ArenaOutboxEvent.create(outbox, { session, ordered: true });
      depletedCycleIds = [
        challengerBalanceAfter.availableLearningDays === 0 && challengerBalanceAfter.lockedLearningDays === 0 && challengerBalanceAfter.reservedLearningDays === 0 ? challengerCycle._id : null,
        defenderBalanceAfter.availableLearningDays === 0 && defenderBalanceAfter.lockedLearningDays === 0 && defenderBalanceAfter.reservedLearningDays === 0 ? defenderCycle._id : null,
      ].filter(Boolean);
      result = { status: "SETTLED", settled: true, replayed: false, winnerRole, resultSnapshot: match.resultSnapshot };
    });
  } finally {
    await session.endSession();
  }
  if (result?.settled && depletedCycleIds.length) {
    await Promise.all(depletedCycleIds.map((cycleId) => finalizeExpiredAccessCycle({ cycleId, now: processedAt })));
  }
  if (result?.settled) {
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: processedAt });
  }
  return result;
}

async function settleSubRevengeMatch({ matchId, now = new Date() }) {
  return settleSubRevengeOutcome({ matchId, now });
}

async function settleSubRevengeNoShow({ matchId, noShowRole, now = new Date() }) {
  const role = String(noShowRole || "").toUpperCase();
  const outcome = role === "CHALLENGER"
    ? REVENGE_OUTCOMES.ATTACKER_NO_SHOW
    : role === "DEFENDER"
      ? REVENGE_OUTCOMES.DEFENDER_NO_SHOW
      : REVENGE_OUTCOMES.BOTH_NO_SHOW;
  return settleSubRevengeOutcome({ matchId, outcome, now });
}

async function settleArenaMatch({ matchId, now = new Date() }) {
  const match = await ArenaMatch.findById(matchId).select("division matchType").lean();
  if (!match) throw statusError(404, "정산할 경기를 찾을 수 없습니다.");
  if (match.division === "SUB" && match.matchType === "NORMAL") {
    return settleSubNormalMatch({ matchId, now });
  }
  if (match.division === "SUB" && match.matchType === "REVENGE") {
    return settleSubRevengeMatch({ matchId, now });
  }
  if (match.division === "MAIN" && match.matchType === "NORMAL") {
    const {
      settleMainNormalMatch,
    } = require("./mainArenaSettlementService");
    return settleMainNormalMatch({ matchId, now });
  }
  if (match.division === "MAIN" && match.matchType === "REVENGE") {
    const {
      settleMainRevengeMatch,
    } = require("./mainArenaRevengeService");
    return settleMainRevengeMatch({ matchId, now });
  }
  throw statusError(409, "현재 자동 정산에 연결되지 않은 경기 유형입니다.");
}

async function settleExpiredSubRevengeMatches({ now = new Date(), limit = 100 } = {}) {
  const matches = await ArenaMatch.find({
    division: "SUB",
    matchType: "REVENGE",
    status: { $in: ["READY", "IN_PROGRESS", "SUBMITTED", "RESOLVED"] },
    completionDeadlineAt: { $lte: now },
  })
    .select("_id")
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let settled = 0;
  let held = 0;
  for (const match of matches) {
    const attempts = await ArenaMatchAttempt.find({ matchId: match._id })
      .select("role status")
      .lean();
    const completed = new Set(
      attempts.filter((attempt) => attempt.status === "SUBMITTED").map((attempt) => attempt.role)
    );
    const noShowRole = completed.size === 2
      ? null
      : completed.size === 1
        ? (completed.has("CHALLENGER") ? "DEFENDER" : "CHALLENGER")
        : "BOTH";
    const outcome = noShowRole
      ? await settleSubRevengeNoShow({ matchId: match._id, noShowRole, now })
      : await settleSubRevengeMatch({ matchId: match._id, now });
    if (outcome?.settled) settled += 1;
    if (outcome?.held) held += 1;
  }
  return { scanned: matches.length, settled, held };
}

async function settleSubNormalMatch({
  matchId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId)) {
    throw statusError(
      400,
      "정산할 경기 정보를 확인해주세요.",
      "INVALID_ARENA_SETTLEMENT_MATCH"
    );
  }
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result = null;
  let depletedCycleIds = [];
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) {
        throw statusError(404, "정산할 경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
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
      if (match.status === "HELD") {
        result = {
          status: "HELD",
          settled: false,
          held: true,
          replayed: true,
        };
        return;
      }
      if (
        match.division !== "SUB" ||
        match.matchType !== "NORMAL"
      ) {
        throw statusError(
          409,
          "현재 정산기는 Sub Division 일반 쟁탈전만 처리합니다.",
          "UNSUPPORTED_ARENA_SETTLEMENT_TYPE"
        );
      }
      if (match.status !== "SUBMITTED") {
        result = {
          status: match.status,
          settled: false,
          waiting: true,
        };
        return;
      }
      if (isSundayDivisionLocked(processedAt)) {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "SUNDAY_DIVISION_LOCK",
          description:
            "일요일 15시 정산 잠금 이후 제출되어 공개 순위 변경을 보류했습니다.",
          now: processedAt,
        });
        return;
      }

      const attempts = await ArenaMatchAttempt.find({ matchId: match._id })
        .session(session)
        .lean();
      const evidence = await ArenaMatchEvidence.find({ matchId: match._id })
        .session(session)
        .lean();
      if (
        attempts.length !== 2 ||
        attempts.some((attempt) => attempt.status !== "SUBMITTED") ||
        evidence.length !== 2
      ) {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "INCOMPLETE_SETTLEMENT_INPUT",
          description:
            "양측 제출·풀이 증거 원본이 모두 확인되지 않아 자동 정산을 보류했습니다.",
          now: processedAt,
        });
        return;
      }
      const suspiciousEvidence = evidence.some(
        (entry) =>
          entry.status === "ANOMALY_FLAGGED" ||
          (entry.anomalyFlags || []).length > 0
      );
      if (suspiciousEvidence || match.integrityStatus !== "CLEAR") {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "INTEGRITY_REVIEW_REQUIRED",
          description:
            "풀이 증거 또는 경기 활동에 이상 징후가 있어 운영자 검토 전까지 순위와 학습일수를 변경하지 않습니다.",
          now: processedAt,
        });
        return;
      }

      const problemPack = await ArenaProblemPack.findById(match.problemPackId)
        .select("+questions")
        .session(session)
        .lean();
      if (!problemPack) {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "PROBLEM_PACK_NOT_FOUND",
          description:
            "경기에 봉인된 문제 팩을 찾을 수 없어 자동 정산을 보류했습니다.",
          now: processedAt,
        });
        return;
      }
      const attemptByRole = new Map(
        attempts.map((attempt) => [attempt.role, attempt])
      );
      const challengerScore = scoreArenaAttempt({
        attempt: attemptByRole.get("CHALLENGER"),
        problemPack,
      });
      const defenderScore = scoreArenaAttempt({
        attempt: attemptByRole.get("DEFENDER"),
        problemPack,
      });
      const winnerRole = compareArenaAttemptScores(
        challengerScore,
        defenderScore
      );
      const plan = buildSubNormalSettlementPlan({
        winnerRole,
        challengerTuple: match.challenger.tupleBefore,
        defenderTuple: match.defender.tupleBefore,
        stakeDays: match.economySnapshot?.challengerStakeDays,
        bronzeRefundDays:
          match.economySnapshot?.bronzeChallengerWinRefundDays,
      });

      const [challengerStanding, defenderStanding, challengerCycle, defenderCycle] =
        await Promise.all([
          ArenaStanding.findById(match.challenger.standingId).session(session).lean(),
          ArenaStanding.findById(match.defender.standingId).session(session).lean(),
          AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
          AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
        ]);
      const invalidSource =
        !challengerStanding ||
        !defenderStanding ||
        !challengerCycle ||
        !defenderCycle ||
        !tuplesEqual(challengerStanding, plan.challengerTupleBefore) ||
        !tuplesEqual(defenderStanding, plan.defenderTupleBefore) ||
        challengerCycle.status !== "ACTIVE" ||
        defenderCycle.status !== "ACTIVE" ||
        numeric(challengerCycle.lockedLearningDays) < 1 ||
        numeric(challengerCycle.paybackScoreDays) < 1;
      if (invalidSource) {
        result = await putSettlementHold({
          match,
          session,
          reasonCode: "SETTLEMENT_SOURCE_CHANGED",
          description:
            "경기 생성 시 고정한 순위 또는 학습일수 원본이 변경되어 자동 정산을 보류했습니다.",
          now: processedAt,
        });
        return;
      }

      if (plan.tupleAction === "SWAP") {
        const highestPosition = await ArenaStanding.findOne({
          division: match.division,
          seasonKey: match.seasonKey,
        })
          .sort({ arenaPosition: -1 })
          .select("arenaPosition")
          .session(session)
          .lean();
        const temporaryPosition =
          Math.max(
            numeric(highestPosition?.arenaPosition),
            plan.challengerTupleBefore.arenaPosition,
            plan.defenderTupleBefore.arenaPosition
          ) + 1;
        const temporaryWrite = await ArenaStanding.updateOne(
          {
            _id: challengerStanding._id,
            arenaRank: plan.challengerTupleBefore.arenaRank,
            arenaPosition: plan.challengerTupleBefore.arenaPosition,
            arenaGp: plan.challengerTupleBefore.arenaGp,
          },
          {
            $set: {
              arenaRank: plan.challengerTupleBefore.arenaRank,
              arenaPosition: temporaryPosition,
              arenaGp: plan.challengerTupleBefore.arenaGp,
            },
          },
          { session }
        );
        const defenderWrite = await ArenaStanding.updateOne(
          {
            _id: defenderStanding._id,
            arenaRank: plan.defenderTupleBefore.arenaRank,
            arenaPosition: plan.defenderTupleBefore.arenaPosition,
            arenaGp: plan.defenderTupleBefore.arenaGp,
          },
          { $set: plan.defenderTupleAfter },
          { session }
        );
        const challengerWrite = await ArenaStanding.updateOne(
          {
            _id: challengerStanding._id,
            arenaRank: plan.challengerTupleBefore.arenaRank,
            arenaPosition: temporaryPosition,
            arenaGp: plan.challengerTupleBefore.arenaGp,
          },
          { $set: plan.challengerTupleAfter },
          { session }
        );
        if (
          !temporaryWrite.modifiedCount ||
          !challengerWrite.modifiedCount ||
          !defenderWrite.modifiedCount
        ) {
          throw statusError(
            409,
            "정산 중 Arena 순위가 변경되었습니다. 다시 정산합니다.",
            "ARENA_SETTLEMENT_STANDING_CONFLICT"
          );
        }
      }

      const challengerBalanceAfter = await updateCycle({
        cycle: challengerCycle,
        delta: plan.challengerDelta,
        userId: match.challenger.userId,
        session,
      });
      const defenderBalanceAfter = await updateCycle({
        cycle: defenderCycle,
        delta: plan.defenderDelta,
        userId: match.defender.userId,
        session,
      });

      await ArenaStandingChangeLedger.create(
        [
          {
            matchId: match._id,
            userId: match.challenger.userId,
            idempotencyKey: `${match._id}:${SUB_NORMAL_SETTLEMENT_VERSION}:CHALLENGER:TUPLE`,
            changeType: plan.tupleAction === "SWAP" ? "TUPLE_SWAP" : "NO_TUPLE_WRITE",
            tupleBefore: plan.challengerTupleBefore,
            tupleAfter: plan.challengerTupleAfter,
            occurredAt: processedAt,
          },
          {
            matchId: match._id,
            userId: match.defender.userId,
            idempotencyKey: `${match._id}:${SUB_NORMAL_SETTLEMENT_VERSION}:DEFENDER:TUPLE`,
            changeType: plan.tupleAction === "SWAP" ? "TUPLE_SWAP" : "NO_TUPLE_WRITE",
            tupleBefore: plan.defenderTupleBefore,
            tupleAfter: plan.defenderTupleAfter,
            occurredAt: processedAt,
          },
        ],
        { session, ordered: true }
      );

      const learningEntries = [
        learningLedgerEntry({
          match,
          cycle: challengerCycle,
          userId: match.challenger.userId,
          delta: plan.challengerDelta,
          balanceAfter: challengerBalanceAfter,
          eventType:
            plan.challengerStakeOutcome === "BRONZE_REFUND"
              ? "MATCH_STAKE_RELEASED"
              : plan.challengerStakeOutcome === "BURNED"
                ? "MATCH_SETTLEMENT_BURN"
                : "MATCH_SETTLEMENT_TRANSFER",
          role: "CHALLENGER",
          now: processedAt,
        }),
      ];
      if (plan.transferredLearningDays > 0) {
        learningEntries.push(
          learningLedgerEntry({
            match,
            cycle: defenderCycle,
            userId: match.defender.userId,
            delta: plan.defenderDelta,
            balanceAfter: defenderBalanceAfter,
            eventType: "MATCH_SETTLEMENT_TRANSFER",
            role: "DEFENDER",
            now: processedAt,
          })
        );
      }
      await ArenaLearningDayLedger.create(learningEntries, {
        session,
        ordered: true,
      });

      const loserUserId = winnerRole === "CHALLENGER"
        ? match.defender.userId
        : match.challenger.userId;
      const opponentUserId = winnerRole === "CHALLENGER"
        ? match.challenger.userId
        : match.defender.userId;
      const revengeRight = await ArenaRevengeRight.findOneAndUpdate(
        { sourceMatchId: match._id },
        {
          $setOnInsert: {
            division: "SUB",
            eligibleUserId: loserUserId,
            opponentUserId,
            status: "AVAILABLE",
            originalStakeDays: 1,
            revengeStakeDays: 2,
            feeDays: 1,
            policyVersionCode: match.policyVersionCode,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
          session,
        }
      );
      const settlementSummary = {
        version: SUB_NORMAL_SETTLEMENT_VERSION,
        tupleAction: plan.tupleAction,
        challengerStakeOutcome: plan.challengerStakeOutcome,
        transferredLearningDays: plan.transferredLearningDays,
        burnedLearningDays: plan.burnedLearningDays,
        returnedLearningDays: plan.returnedLearningDays,
        challengerBalanceAfter,
        defenderBalanceAfter,
        revengeRightId: String(revengeRight._id),
      };
      match.status = "SETTLED";
      match.winnerRole = winnerRole;
      match.integrityStatus = "CLEAR";
      match.resolvedAt = processedAt;
      match.settledAt = processedAt;
      match.settlementIdempotencyKey =
        `${match._id}:${SUB_NORMAL_SETTLEMENT_VERSION}`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: challengerScore,
        defender: defenderScore,
        tieBreakStep: tieBreakStep(challengerScore, defenderScore),
        winnerRole,
        settlementSummary,
        resolvedAt: processedAt,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany(
        { matchId: match._id },
        { session, ordered: true }
      );
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "ArenaMatchSettled",
            aggregateType: "ArenaMatch",
            aggregateId: match._id,
            idempotencyKey: `${match._id}:ArenaMatchSettled`,
            payload: {
              division: "SUB",
              matchType: "NORMAL",
              winnerRole,
              tupleAction: plan.tupleAction,
              settlementVersion: SUB_NORMAL_SETTLEMENT_VERSION,
            },
          },
          {
            eventType: "ArenaRevengeRightCreated",
            aggregateType: "ArenaRevengeRight",
            aggregateId: revengeRight._id,
            idempotencyKey: `${revengeRight._id}:ArenaRevengeRightCreated`,
            payload: {
              sourceMatchId: match._id,
              eligibleUserId: loserUserId,
              opponentUserId,
              division: "SUB",
              revengeStakeDays: 2,
            },
          },
        ],
        { session, ordered: true }
      );
      depletedCycleIds = [
        challengerBalanceAfter.availableLearningDays === 0 &&
        challengerBalanceAfter.lockedLearningDays === 0 &&
        challengerBalanceAfter.reservedLearningDays === 0
          ? challengerCycle._id
          : null,
        defenderBalanceAfter.availableLearningDays === 0 &&
        defenderBalanceAfter.lockedLearningDays === 0 &&
        defenderBalanceAfter.reservedLearningDays === 0
          ? defenderCycle._id
          : null,
      ].filter(Boolean);
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

  if (result?.settled && depletedCycleIds.length) {
    await Promise.all(
      depletedCycleIds.map((cycleId) =>
        finalizeExpiredAccessCycle({
          cycleId,
          now: processedAt,
        })
      )
    );
  }
  if (result?.settled) {
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: processedAt });
  }
  return result;
}

module.exports = {
  SUB_NORMAL_SETTLEMENT_VERSION,
  SUB_REVENGE_SETTLEMENT_VERSION,
  buildSubNormalSettlementPlan,
  settleSubNormalMatch,
  settleSubRevengeMatch,
  settleSubRevengeNoShow,
  settleSubRevengeOutcome,
  settleArenaMatch,
  settleExpiredSubRevengeMatches,
  tieBreakStep,
  tuplesEqual,
};
