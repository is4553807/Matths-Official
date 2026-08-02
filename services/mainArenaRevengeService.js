const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
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
  arenaTupleFromStanding,
  isSundayDivisionLocked,
  isSundayMatchRequestLocked,
  loadMatchActorContext,
} = require("./arenaMatchService");
const {
  generateMainOneOnOneQuestions,
  getMainTierPair,
} = require("./arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const {
  revengeCompletionDeadline,
  resolveRevengeSettlement,
  REVENGE_OUTCOMES,
} = require("./arenaDivisionRuleService");
const {
  addMatchTransfer,
  moveAvailable,
  settleLocked,
} = require("./mainLearningDayService");
const { kstSeasonKey } = require("./arenaStandingService");
const { normalizeDecisionId } = require("./arenaRevengeService");

const MAIN_REVENGE_SETTLEMENT_VERSION = "MAIN-REVENGE-SETTLEMENT-V1";

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function revengeMatchKey(right) {
  return `MAIN:REVENGE:${right.sourceMatchId}:${createHash("sha256")
    .update(`${right._id}:${right.eligibleUserId}`, "utf8")
    .digest("hex")}`;
}

function normalizedTuple(value) {
  return {
    arenaRank: String(value?.arenaRank || ""),
    arenaPosition: Number(value?.arenaPosition || 0),
    arenaGp: Number(value?.arenaGp || 0),
  };
}

function tuplesEqual(left, right) {
  const a = normalizedTuple(left);
  const b = normalizedTuple(right);
  return a.arenaRank === b.arenaRank &&
    a.arenaPosition === b.arenaPosition &&
    a.arenaGp === b.arenaGp;
}

function balanceAfter(cycle, state) {
  return {
    availableLearningDays: state.availableLearningDays,
    paybackScoreDays: Number(cycle.paybackScoreDays || 0),
    lockedLearningDays: state.lockedLearningDays,
    reservedLearningDays: state.reservedLearningDays,
  };
}

async function writeCycleState({ cycle, state, session }) {
  const update = await AccessCycle.updateOne(
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
  if (!update.modifiedCount) {
    throw statusError(409, "Main 복수전 학습일수 상태가 변경되었습니다.", "MAIN_REVENGE_CYCLE_CONFLICT");
  }
}

async function swapStandings({ match, challengerStanding, defenderStanding, challengerBefore, defenderBefore, session }) {
  const highest = await ArenaStanding.findOne({ division: "MAIN", seasonKey: match.seasonKey })
    .sort({ arenaPosition: -1 })
    .select("arenaPosition")
    .session(session)
    .lean();
  const temporaryPosition = Math.max(
    Number(highest?.arenaPosition || 0),
    challengerBefore.arenaPosition,
    defenderBefore.arenaPosition
  ) + 1;
  const first = await ArenaStanding.updateOne(
    { _id: challengerStanding._id, ...challengerBefore },
    { $set: { ...challengerBefore, arenaPosition: temporaryPosition } },
    { session }
  );
  const second = await ArenaStanding.updateOne(
    { _id: defenderStanding._id, ...defenderBefore },
    { $set: challengerBefore },
    { session }
  );
  const third = await ArenaStanding.updateOne(
    { _id: challengerStanding._id, arenaRank: challengerBefore.arenaRank, arenaPosition: temporaryPosition, arenaGp: challengerBefore.arenaGp },
    { $set: defenderBefore },
    { session }
  );
  if (!first.modifiedCount || !second.modifiedCount || !third.modifiedCount) {
    throw statusError(409, "Main 복수전 정산 중 Arena 상태가 변경되었습니다.", "MAIN_REVENGE_STANDING_CONFLICT");
  }
}

async function createMainRevengeMatch({
  revengeRightId,
  userId,
  requestId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(revengeRightId) || !mongoose.isValidObjectId(userId)) {
    throw statusError(400, "Main 복수전 권리와 사용자 정보를 확인해주세요.");
  }
  const decisionId = normalizeDecisionId(requestId);
  if (isSundayMatchRequestLocked(now, "MAIN")) {
    throw statusError(423, "일요일 14시 30분부터 새 Main 복수전을 신청할 수 없습니다.", "SUNDAY_REVENGE_LOCK");
  }
  const rightPreview = await ArenaRevengeRight.findById(revengeRightId).lean();
  if (!rightPreview || rightPreview.division !== "MAIN") {
    throw statusError(404, "사용 가능한 Main 복수전 권리를 찾지 못했습니다.");
  }
  const previewAttacker = await loadMatchActorContext({
    userId,
    division: "MAIN",
    now,
  });
  const previewDefender = await loadMatchActorContext({
    userId: rightPreview.opponentUserId,
    division: "MAIN",
    now,
  });
  const previewKey = revengeMatchKey(rightPreview);
  const previewGeneration = generateMainOneOnOneQuestions({
    lowerTier: previewAttacker.standing?.arenaRank,
    upperTier: previewDefender.standing?.arenaRank,
    matchKey: previewKey,
  });
  sealArenaProblemPackDraft(
    buildGeneratedArenaProblemPackDraft({
      generation: previewGeneration,
      matchKey: previewKey,
      generatedAt: now,
      division: "MAIN",
      matchType: "REVENGE",
    }),
    { sealedAt: now, autoValidated: true }
  );

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const right = await ArenaRevengeRight.findById(revengeRightId).session(session);
      if (!right || right.division !== "MAIN") {
        throw statusError(404, "사용 가능한 Main 복수전 권리를 찾지 못했습니다.");
      }
      if (String(right.eligibleUserId) !== String(userId)) {
        throw statusError(403, "이 Main 복수전 권리를 사용할 수 없습니다.");
      }
      if (right.status === "CLAIMED" && right.revengeMatchId) {
        result = { matchId: String(right.revengeMatchId), replayed: true };
        return;
      }
      if (right.status !== "AVAILABLE") {
        throw statusError(409, "이미 사용하거나 포기한 Main 복수전 권리입니다.");
      }
      const [attacker, defender, sourceMatch] = await Promise.all([
        loadMatchActorContext({ userId: right.eligibleUserId, division: "MAIN", now, session }),
        loadMatchActorContext({ userId: right.opponentUserId, division: "MAIN", now, session }),
        ArenaMatch.findById(right.sourceMatchId).session(session).lean(),
      ]);
      if (!attacker.eligible || !defender.eligible) {
        throw statusError(409, "Main 복수전 참가자의 현재 이용 상태를 확인해주세요.", "MAIN_REVENGE_PARTICIPANT_INELIGIBLE");
      }
      if (Number(attacker.accessCycle.availableLearningDays || 0) <= Number(right.revengeStakeDays)) {
        throw statusError(409, "복수전 예치 후에도 최소 1일의 사용 가능한 학습일수가 남아야 합니다.", "MAIN_REVENGE_REQUIRES_REMAINING_DAY");
      }
      if (!sourceMatch || sourceMatch.status !== "SETTLED") {
        throw statusError(409, "원경기 정산이 끝난 뒤에만 Main 복수전을 시작할 수 있습니다.");
      }
      const pair = getMainTierPair(attacker.standing.arenaRank, defender.standing.arenaRank);
      if (!pair) {
        throw statusError(409, "현재 Arena 상태로 Main 복수전을 만들 수 없습니다.", "MAIN_REVENGE_TIER_PAIR_CHANGED");
      }
      const matchKey = revengeMatchKey(right);
      const existing = await ArenaMatch.findOne({ matchKey }).session(session).lean();
      if (existing) {
        result = { matchId: String(existing._id), replayed: true };
        return;
      }
      const participantIds = [attacker.user._id, defender.user._id];
      const lock = await ArenaMatchParticipantLock.findOne({ userId: { $in: participantIds } }).session(session).lean();
      if (lock) throw statusError(409, "참가자 중 진행 중인 공식 경기가 있습니다.");
      const generation = generateMainOneOnOneQuestions({
        lowerTier: attacker.standing.arenaRank,
        upperTier: defender.standing.arenaRank,
        matchKey,
      });
      const sealed = sealArenaProblemPackDraft(
        buildGeneratedArenaProblemPackDraft({ generation, matchKey, generatedAt: now, division: "MAIN", matchType: "REVENGE" }),
        { sealedAt: now, autoValidated: true }
      );
      const economy = {
        originalStakeDays: Number(right.originalStakeDays),
        revengeStakeMultiplier:
          Number(right.revengeStakeDays) / Number(right.originalStakeDays),
        revengeStakeDays: Number(right.revengeStakeDays),
        feeDays: Number(right.feeDays),
        recipientNoShowReturnDays:
          Number(right.revengeStakeDays) - Number(right.feeDays),
        recipientNoShowBurnDays: Number(right.feeDays),
      };
      const matchId = new mongoose.Types.ObjectId();
      const problemPackId = new mongoose.Types.ObjectId();
      const deadline = revengeCompletionDeadline({ now, division: "MAIN" });
      const matchDraft = {
        _id: matchId,
        matchKey,
        division: "MAIN",
        seasonKey: kstSeasonKey(now),
        matchType: "REVENGE",
        matchOrigin: "REVENGE",
        requestInitiatorUserId: attacker.user._id,
        targetTier: defender.standing.arenaRank,
        revengeRightId: right._id,
        originalMatchId: sourceMatch._id,
        tierPairKey: pair.key,
        tierPairLabel: pair.label,
        challenger: {
          userId: attacker.user._id,
          standingId: attacker.standing._id,
          accessCycleId: attacker.accessCycle._id,
          tupleBefore: arenaTupleFromStanding(attacker.standing),
          stakeDays: economy.revengeStakeDays,
        },
        defender: {
          userId: defender.user._id,
          standingId: defender.standing._id,
          accessCycleId: defender.accessCycle._id,
          tupleBefore: arenaTupleFromStanding(defender.standing),
          stakeDays: 0,
        },
        status: "READY",
        policyVersionCode: right.policyVersionCode,
        divisionPolicyVersionId: sourceMatch.divisionPolicyVersionId,
        divisionPolicyVersionCode: sourceMatch.divisionPolicyVersionCode,
        economySnapshot: {
          originalStakeDays: economy.originalStakeDays,
          challengerStakeDays: economy.revengeStakeDays,
          defenderStakeDays: 0,
          revengeStakeMultiplier: economy.revengeStakeMultiplier,
          feeDays: economy.feeDays,
          recipientNoShowReturnDays: economy.recipientNoShowReturnDays,
          recipientNoShowBurnDays: economy.recipientNoShowBurnDays,
        },
        problemPackId,
        problemPackVersion: sealed.version,
        scoringVersion: sealed.scoringVersion,
        timeLimitMs: sealed.timeLimitMs,
        requestedAt: now,
        startDeadlineAt: deadline,
        completionDeadlineAt: deadline,
        readyAt: now,
        integrityStatus: "PENDING",
      };
      await ArenaProblemPack.create([{ ...sealed, _id: problemPackId }], { session, ordered: true });
      await ArenaMatch.create([matchDraft], { session, ordered: true });
      const answers = sealed.questions.map((question) => ({
        questionKey: question.questionKey,
        value: "",
        revision: 0,
        lastChangedAt: null,
      }));
      await ArenaMatchAttempt.create(
        [
          { matchId, userId: attacker.user._id, role: "CHALLENGER", problemPackId, problemPackVersion: sealed.version, status: "READY", answers },
          { matchId, userId: defender.user._id, role: "DEFENDER", problemPackId, problemPackVersion: sealed.version, status: "READY", answers },
        ],
        { session, ordered: true }
      );
      await ArenaMatchParticipantLock.create(
        participantIds.map((participantId) => ({ userId: participantId, matchId, acquiredAt: now })),
        { session, ordered: true }
      );
      const state = moveAvailable(attacker.accessCycle, economy.revengeStakeDays, "lockedDays");
      await writeCycleState({ cycle: attacker.accessCycle, state, session });
      await ArenaLearningDayLedger.create(
        [
          {
            userId: attacker.user._id,
            accessCycleId: attacker.accessCycle._id,
            idempotencyKey: `${matchId}:MAIN_REVENGE_STAKE_LOCKED`,
            eventType: "REVENGE_STAKE_LOCKED",
            availableLearningDaysDelta: -economy.revengeStakeDays,
            paybackScoreDaysDelta: 0,
            lockedLearningDaysDelta: economy.revengeStakeDays,
            reservedLearningDaysDelta: 0,
            sourceBucket: "UNSPECIFIED",
            balanceAfter: balanceAfter(attacker.accessCycle, state),
            sourceType: "ArenaMatch",
            sourceId: matchId,
            occurredAt: now,
            metadata: { division: "MAIN", feeDays: economy.feeDays },
          },
        ],
        { session, ordered: true }
      );
      right.status = "CLAIMED";
      right.decisionIdempotencyKey = `${right._id}:CLAIM:${decisionId}`;
      right.revengeMatchId = matchId;
      right.claimedAt = now;
      right.completionDeadlineAt = deadline;
      await right.save({ session });
      await ArenaOutboxEvent.create(
        [
          { eventType: "ArenaRevengeClaimed", aggregateType: "ArenaRevengeRight", aggregateId: right._id, idempotencyKey: `${right._id}:ArenaRevengeClaimed`, payload: { matchId, deadline } },
          { eventType: "ArenaRevengeMatchCreated", aggregateType: "ArenaMatch", aggregateId: matchId, idempotencyKey: `${matchId}:ArenaRevengeMatchCreated`, payload: { division: "MAIN", sourceMatchId: sourceMatch._id, stakeDays: economy.revengeStakeDays } },
        ],
        { session, ordered: true }
      );
      result = { matchId: String(matchId), replayed: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function forfeitMainRevengeRight({ revengeRightId, userId, requestId, now = new Date() }) {
  const decisionId = normalizeDecisionId(requestId);
  const right = await ArenaRevengeRight.findOneAndUpdate(
    { _id: revengeRightId, eligibleUserId: userId, division: "MAIN", status: "AVAILABLE" },
    { $set: { status: "FORFEITED", decisionIdempotencyKey: `${revengeRightId}:FORFEIT:${decisionId}`, forfeitedAt: now } },
    { returnDocument: "after" }
  );
  if (!right) throw statusError(409, "이미 사용했거나 포기한 Main 복수전 권리입니다.");
  await ArenaOutboxEvent.findOneAndUpdate(
    { idempotencyKey: `${right._id}:ArenaRevengeForfeited` },
    { $setOnInsert: { eventType: "ArenaRevengeForfeited", aggregateType: "ArenaRevengeRight", aggregateId: right._id, idempotencyKey: `${right._id}:ArenaRevengeForfeited`, payload: { division: "MAIN", sourceMatchId: right.sourceMatchId } } },
    { upsert: true }
  );
  return { forfeited: true, sourceMatchId: right.sourceMatchId };
}

async function holdSettlement({ match, session, reasonCode, description, now }) {
  match.status = "HELD";
  match.integrityStatus = "SUSPICIOUS";
  await match.save({ session });
  await AdminTodo.findOneAndUpdate(
    { sourceType: "ArenaMatchSettlement", sourceId: match._id },
    { $setOnInsert: { category: "integrity", title: "Main 복수전 정산 보류", description, href: `/admin/arena-matches#match-${match._id}`, targetUserId: match.challenger.userId, actorUserId: match.challenger.userId, sourceType: "ArenaMatchSettlement", sourceId: match._id, status: "pending", metadata: { reasonCode } } },
    { upsert: true, setDefaultsOnInsert: true, session }
  );
  return { status: "HELD", held: true, settled: false, reasonCode, resolvedAt: now };
}

async function settleMainRevengeOutcome({ matchId, outcome = null, now = new Date() }) {
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "정산할 Main 복수전을 찾을 수 없습니다.");
      if (match.status === "SETTLED") {
        result = { status: "SETTLED", settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD") {
        result = { status: "HELD", held: true, settled: false, replayed: true };
        return;
      }
      if (match.division !== "MAIN" || match.matchType !== "REVENGE") {
        throw statusError(409, "Main Division 복수전만 이 정산기로 처리할 수 있습니다.");
      }
      if (isSundayDivisionLocked(processedAt)) {
        result = await holdSettlement({ match, session, reasonCode: "SUNDAY_DIVISION_LOCK", description: "일요일 15시 이후 Main 복수전 정산을 보류했습니다.", now: processedAt });
        return;
      }
      const attempts = await ArenaMatchAttempt.find({ matchId }).session(session).lean();
      const evidence = await ArenaMatchEvidence.find({ matchId }).session(session).lean();
      let resolvedOutcome = outcome ? String(outcome).toUpperCase() : null;
      let challengerScore = null;
      let defenderScore = null;
      let winnerRole = null;
      let tieBreakStep = "NO_SHOW";
      if (!resolvedOutcome) {
        if (match.status !== "SUBMITTED" || attempts.length !== 2 || attempts.some((attempt) => attempt.status !== "SUBMITTED") || evidence.length !== 2) {
          result = { status: match.status, settled: false, waiting: true };
          return;
        }
        if (match.integrityStatus !== "CLEAR" || evidence.some((item) => item.status === "ANOMALY_FLAGGED" || (item.anomalyFlags || []).length)) {
          result = await holdSettlement({ match, session, reasonCode: "INTEGRITY_REVIEW_REQUIRED", description: "Main 복수전 풀이 증거에 이상 징후가 있습니다.", now: processedAt });
          return;
        }
        const pack = await ArenaProblemPack.findById(match.problemPackId).select("+questions").session(session).lean();
        if (!pack) {
          result = await holdSettlement({ match, session, reasonCode: "PROBLEM_PACK_NOT_FOUND", description: "Main 복수전 문제 팩을 찾지 못했습니다.", now: processedAt });
          return;
        }
        const byRole = new Map(attempts.map((attempt) => [attempt.role, attempt]));
        challengerScore = scoreArenaAttempt({ attempt: byRole.get("CHALLENGER"), problemPack: pack });
        defenderScore = scoreArenaAttempt({ attempt: byRole.get("DEFENDER"), problemPack: pack });
        winnerRole = compareArenaAttemptScores(challengerScore, defenderScore);
        resolvedOutcome = winnerRole === "CHALLENGER" ? REVENGE_OUTCOMES.ATTACKER_WIN : REVENGE_OUTCOMES.DEFENDER_WIN;
        const comparisons = ["score", "correctCount", "correctAnswerSolveTimeMs", "totalSolveTimeMs"];
        tieBreakStep = comparisons.find((key) => Number(challengerScore[key]) !== Number(defenderScore[key])) || "FULL_TIE_DEFENDER_WINS";
      } else {
        if (!match.completionDeadlineAt || new Date(match.completionDeadlineAt) > processedAt) {
          throw statusError(409, "복수전 완료 기한 전에는 No-show 정산을 할 수 없습니다.");
        }
        winnerRole = resolvedOutcome === REVENGE_OUTCOMES.DEFENDER_NO_SHOW
          ? "CHALLENGER"
          : resolvedOutcome === REVENGE_OUTCOMES.BOTH_NO_SHOW
            ? null
            : "DEFENDER";
      }
      const settlement = resolveRevengeSettlement({
        division: "MAIN",
        outcome: resolvedOutcome,
        revengeStakeDays: match.economySnapshot.challengerStakeDays,
        feeDays: match.economySnapshot.feeDays,
      });
      const [challengerStanding, defenderStanding, challengerCycle, defenderCycle] = await Promise.all([
        ArenaStanding.findById(match.challenger.standingId).session(session).lean(),
        ArenaStanding.findById(match.defender.standingId).session(session).lean(),
        AccessCycle.findById(match.challenger.accessCycleId).session(session).lean(),
        AccessCycle.findById(match.defender.accessCycleId).session(session).lean(),
      ]);
      const challengerBefore = normalizedTuple(match.challenger.tupleBefore);
      const defenderBefore = normalizedTuple(match.defender.tupleBefore);
      const stakeDays = Number(match.economySnapshot.challengerStakeDays || 0);
      if (!challengerStanding || !defenderStanding || !challengerCycle || !defenderCycle || !tuplesEqual(challengerStanding, challengerBefore) || !tuplesEqual(defenderStanding, defenderBefore) || Number(challengerCycle.lockedLearningDays || 0) < stakeDays) {
        result = await holdSettlement({ match, session, reasonCode: "SETTLEMENT_SOURCE_CHANGED", description: "Main 복수전 원본 Arena 상태 또는 예치 학습일수가 변경되었습니다.", now: processedAt });
        return;
      }
      if (settlement.tupleAction === "SWAP") {
        await swapStandings({ match, challengerStanding, defenderStanding, challengerBefore, defenderBefore, session });
      }
      const challengerReleased = settleLocked(challengerCycle, {
        returnDays: settlement.returnToAttackerDays,
        removeDays: stakeDays,
      });
      const challengerState = challengerReleased;
      const defenderState = settlement.transferToDefenderDays > 0
        ? addMatchTransfer(defenderCycle, settlement.transferToDefenderDays)
        : {
            buckets: require("./mainLearningDayService").normalizeBuckets(defenderCycle),
            availableLearningDays: Number(defenderCycle.availableLearningDays || 0),
            reservedLearningDays: Number(defenderCycle.reservedLearningDays || 0),
            lockedLearningDays: Number(defenderCycle.lockedLearningDays || 0),
          };
      await writeCycleState({ cycle: challengerCycle, state: challengerState, session });
      if (settlement.transferToDefenderDays > 0) {
        await writeCycleState({ cycle: defenderCycle, state: defenderState, session });
      }
      const challengerAfter = settlement.tupleAction === "SWAP" ? defenderBefore : challengerBefore;
      const defenderAfter = settlement.tupleAction === "SWAP" ? challengerBefore : defenderBefore;
      await ArenaStandingChangeLedger.create(
        [
          { matchId, userId: match.challenger.userId, idempotencyKey: `${matchId}:${MAIN_REVENGE_SETTLEMENT_VERSION}:CHALLENGER:TUPLE`, changeType: settlement.tupleAction === "SWAP" ? "TUPLE_SWAP" : "NO_TUPLE_WRITE", tupleBefore: challengerBefore, tupleAfter: challengerAfter, occurredAt: processedAt },
          { matchId, userId: match.defender.userId, idempotencyKey: `${matchId}:${MAIN_REVENGE_SETTLEMENT_VERSION}:DEFENDER:TUPLE`, changeType: settlement.tupleAction === "SWAP" ? "TUPLE_SWAP" : "NO_TUPLE_WRITE", tupleBefore: defenderBefore, tupleAfter: defenderAfter, occurredAt: processedAt },
        ],
        { session, ordered: true }
      );
      const ledgers = [
        {
          userId: match.challenger.userId,
          accessCycleId: challengerCycle._id,
          idempotencyKey: `${matchId}:${MAIN_REVENGE_SETTLEMENT_VERSION}:CHALLENGER:DAYS`,
          eventType: settlement.returnToAttackerDays > 0 ? "REVENGE_NO_SHOW_PARTIAL_REFUND" : "REVENGE_FEE_BURN",
          availableLearningDaysDelta: settlement.returnToAttackerDays,
          paybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: -stakeDays,
          reservedLearningDaysDelta: 0,
          sourceBucket: "UNSPECIFIED",
          balanceAfter: balanceAfter(challengerCycle, challengerState),
          sourceType: "ArenaMatch",
          sourceId: matchId,
          occurredAt: processedAt,
          metadata: { outcome: resolvedOutcome, burnedLearningDays: settlement.burnDays },
        },
      ];
      if (settlement.transferToDefenderDays > 0) {
        ledgers.push({
          userId: match.defender.userId,
          accessCycleId: defenderCycle._id,
          idempotencyKey: `${matchId}:${MAIN_REVENGE_SETTLEMENT_VERSION}:DEFENDER:DAYS`,
          eventType: "MATCH_SETTLEMENT_TRANSFER",
          availableLearningDaysDelta: settlement.transferToDefenderDays,
          paybackScoreDaysDelta: 0,
          lockedLearningDaysDelta: 0,
          reservedLearningDaysDelta: 0,
          sourceBucket: "MAIN_MATCH_TRANSFER",
          balanceAfter: balanceAfter(defenderCycle, defenderState),
          sourceType: "ArenaMatch",
          sourceId: matchId,
          occurredAt: processedAt,
          metadata: { outcome: resolvedOutcome, burnedLearningDays: settlement.burnDays },
        });
      }
      await ArenaLearningDayLedger.create(ledgers, { session, ordered: true });
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
      match.settlementIdempotencyKey = `${matchId}:${MAIN_REVENGE_SETTLEMENT_VERSION}`;
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        challenger: challengerScore,
        defender: defenderScore,
        tieBreakStep,
        winnerRole,
        settlementSummary: {
          version: MAIN_REVENGE_SETTLEMENT_VERSION,
          outcome: resolvedOutcome,
          tupleAction: settlement.tupleAction,
          returnedLearningDays: settlement.returnToAttackerDays,
          transferredLearningDays: settlement.transferToDefenderDays,
          burnedLearningDays: settlement.burnDays,
          challengerBalanceAfter: balanceAfter(challengerCycle, challengerState),
          defenderBalanceAfter: balanceAfter(defenderCycle, defenderState),
        },
        resolvedAt: processedAt,
      };
      await match.save({ session });
      await Promise.all([
        ArenaMatchParticipantLock.deleteMany({ matchId }, { session }),
        ArenaRevengeRight.updateOne({ _id: match.revengeRightId }, { $set: { status: "CONSUMED" } }, { session }),
      ]);
      await ArenaOutboxEvent.create(
        [
          { eventType: "ArenaMatchSettled", aggregateType: "ArenaMatch", aggregateId: matchId, idempotencyKey: `${matchId}:ArenaMatchSettled`, payload: { division: "MAIN", matchType: "REVENGE", winnerRole, outcome: resolvedOutcome, tupleAction: settlement.tupleAction } },
          ...(match.noShowRole ? [{ eventType: "ArenaRevengeNoShowSettled", aggregateType: "ArenaMatch", aggregateId: matchId, idempotencyKey: `${matchId}:ArenaRevengeNoShowSettled`, payload: { outcome: resolvedOutcome } }] : []),
        ],
        { session, ordered: true }
      );
      result = { status: "SETTLED", settled: true, replayed: false, winnerRole, resultSnapshot: match.resultSnapshot };
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

async function settleMainRevengeMatch({ matchId, now = new Date() }) {
  return settleMainRevengeOutcome({ matchId, now });
}

async function settleMainRevengeNoShow({ matchId, noShowRole, now = new Date() }) {
  const role = String(noShowRole || "").toUpperCase();
  const outcome = role === "CHALLENGER"
    ? REVENGE_OUTCOMES.ATTACKER_NO_SHOW
    : role === "DEFENDER"
      ? REVENGE_OUTCOMES.DEFENDER_NO_SHOW
      : REVENGE_OUTCOMES.BOTH_NO_SHOW;
  return settleMainRevengeOutcome({ matchId, outcome, now });
}

async function settleExpiredMainRevengeMatches({ now = new Date(), limit = 100 } = {}) {
  const matches = await ArenaMatch.find({
    division: "MAIN",
    matchType: "REVENGE",
    status: { $in: ["READY", "IN_PROGRESS", "SUBMITTED", "RESOLVED"] },
    completionDeadlineAt: { $lte: now },
  })
    .select("_id")
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  for (const match of matches) {
    const attempts = await ArenaMatchAttempt.find({ matchId: match._id }).select("role status").lean();
    const completed = new Set(attempts.filter((attempt) => attempt.status === "SUBMITTED").map((attempt) => attempt.role));
    const noShowRole = completed.size === 2 ? null : completed.size === 1 ? (completed.has("CHALLENGER") ? "DEFENDER" : "CHALLENGER") : "BOTH";
    if (noShowRole) await settleMainRevengeNoShow({ matchId: match._id, noShowRole, now });
    else await settleMainRevengeMatch({ matchId: match._id, now });
  }
  return { scanned: matches.length };
}

module.exports = {
  MAIN_REVENGE_SETTLEMENT_VERSION,
  createMainRevengeMatch,
  forfeitMainRevengeRight,
  revengeMatchKey,
  settleExpiredMainRevengeMatches,
  settleMainRevengeMatch,
  settleMainRevengeNoShow,
  settleMainRevengeOutcome,
};
