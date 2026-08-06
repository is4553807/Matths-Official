const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const {
  AccessCycle,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaRevengeRight,
} = require("../models/goatArenaModel");
const {
  arenaTupleFromStanding,
  assertMatchContext,
  isSundayMatchRequestLocked,
  loadMatchActorContext,
} = require("./arenaMatchService");
const {
  generateSubOneOnOneQuestionsFromActiveData,
  getSubTierPair,
} = require("./arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const {
  buildRevengeEconomySnapshot,
  revengeCompletionDeadline,
} = require("./arenaDivisionRuleService");
const { kstSeasonKey } = require("./arenaStandingService");
const { assertMatchmakingOpen } = require("./arenaMatchmakingControlService");

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeDecisionId(value) {
  const clean = String(value || "").trim();
  if (clean.length < 16 || clean.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(clean)) {
    throw statusError(400, "복수전 요청 식별자를 확인해주세요.", "INVALID_REVENGE_DECISION_ID");
  }
  return clean;
}

function revengeMatchKey(right) {
  return `SUB:REVENGE:${right.sourceMatchId}:${createHash("sha256")
    .update(`${right._id}:${right.eligibleUserId}`, "utf8")
    .digest("hex")}`;
}

async function createSubRevengeMatch({
  revengeRightId,
  userId,
  requestId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(revengeRightId) || !mongoose.isValidObjectId(userId)) {
    throw statusError(400, "복수전 권리와 사용자 정보를 확인해주세요.");
  }
  const decisionId = normalizeDecisionId(requestId);
  if (isSundayMatchRequestLocked(now, "SUB")) {
    throw statusError(423, "일요일 14시부터 새 복수전을 신청할 수 없습니다.", "SUNDAY_REVENGE_LOCK");
  }
  await assertMatchmakingOpen();
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const right = await ArenaRevengeRight.findById(revengeRightId).session(session);
      if (!right || right.division !== "SUB") {
        throw statusError(404, "사용할 수 있는 Unranked 복수전 권리를 찾지 못했습니다.");
      }
      if (String(right.eligibleUserId) !== String(userId)) {
        throw statusError(403, "이 복수전 권리를 사용할 수 없습니다.");
      }
      if (right.status === "CLAIMED" && right.revengeMatchId) {
        result = { matchId: String(right.revengeMatchId), replayed: true };
        return;
      }
      if (right.status !== "AVAILABLE") {
        throw statusError(409, "이미 사용하거나 포기한 복수전 권리입니다.", "REVENGE_RIGHT_NOT_AVAILABLE");
      }

      const [attacker, defender, sourceMatch] = await Promise.all([
        loadMatchActorContext({
          userId: right.eligibleUserId,
          division: "SUB",
          now,
          session,
          requiredAvailableDays: Number(right.revengeStakeDays),
        }),
        loadMatchActorContext({
          userId: right.opponentUserId,
          division: "SUB",
          now,
          session,
          requiredAvailableDays: 0,
          requireDefensePool: true,
        }),
        ArenaMatch.findById(right.sourceMatchId).session(session).lean(),
      ]);
      assertMatchContext(attacker);
      assertMatchContext(defender);
      if (!sourceMatch || sourceMatch.status !== "SETTLED") {
        throw statusError(409, "원경기 정산이 끝난 뒤에만 복수전을 시작할 수 있습니다.");
      }
      const pair = getSubTierPair(
        attacker.standing.arenaRank,
        defender.standing.arenaRank
      );
      if (!pair) {
        throw statusError(409, "현재 두 사용자의 티어로 Unranked 복수전을 만들 수 없습니다.", "REVENGE_TIER_PAIR_CHANGED");
      }
      const participantIds = [attacker.user._id, defender.user._id];
      const lock = await ArenaMatchParticipantLock.findOne({
        userId: { $in: participantIds },
      }).session(session).lean();
      if (lock) {
        throw statusError(409, "참가자 중 진행 중인 공식 경기가 있습니다.");
      }

      const matchId = new mongoose.Types.ObjectId();
      const matchKey = revengeMatchKey(right);
      const existing = await ArenaMatch.findOne({ matchKey }).session(session).lean();
      if (existing) {
        result = { matchId: String(existing._id), replayed: true };
        return;
      }
      const generation = await generateSubOneOnOneQuestionsFromActiveData({
        challengerTier: attacker.standing.arenaRank,
        defenderTier: defender.standing.arenaRank,
        matchKey,
      });
      const sealed = sealArenaProblemPackDraft(
        buildGeneratedArenaProblemPackDraft({ generation, matchKey, generatedAt: now }),
        { sealedAt: now, autoValidated: true }
      );
      const problemPackId = new mongoose.Types.ObjectId();
      const deadline = revengeCompletionDeadline({ now, division: "SUB" });
      const economy = buildRevengeEconomySnapshot({
        division: "SUB",
        originalStakeDays: right.originalStakeDays,
      });
      const matchDraft = {
        _id: matchId,
        matchKey,
        division: "SUB",
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
        subscriptionPolicyVersionId: attacker.accessCycle.policyVersionId,
        subscriptionPolicyVersionCode: attacker.accessCycle.policyVersionCode,
        economySnapshot: {
          originalStakeDays: economy.originalStakeDays,
          challengerStakeDays: economy.revengeStakeDays,
          defenderStakeDays: 0,
          revengeStakeMultiplier: economy.revengeStakeMultiplier,
          feeDays: economy.feeDays,
          recipientNoShowReturnDays: economy.recipientNoShowReturnDays,
          recipientNoShowBurnDays: economy.recipientNoShowBurnDays,
          bronzeChallengerWinRefundDays: 0,
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
      await ArenaProblemPack.create(
        [{ ...sealed, _id: problemPackId }],
        { session, ordered: true }
      );
      await assertMatchmakingOpen({ session, claim: true, now });
      await ArenaMatch.create(
        [matchDraft],
        { session, ordered: true }
      );
      const answers = sealed.questions.map((question) => ({
        questionKey: question.questionKey,
        value: "",
        revision: 0,
        lastChangedAt: null,
      }));
      await ArenaMatchAttempt.create(
        [
          { matchId, userId: attacker.user._id, role: "CHALLENGER", problemPackId, problemPackVersion: sealed.version, variantCode: "COMMON", status: "READY", answers },
          { matchId, userId: defender.user._id, role: "DEFENDER", problemPackId, problemPackVersion: sealed.version, variantCode: "COMMON", status: "READY", answers },
        ],
        { session, ordered: true }
      );
      await ArenaMatchParticipantLock.create(
        participantIds.map((participantId) => ({ userId: participantId, matchId, acquiredAt: now })),
        { session, ordered: true }
      );
      const stakeDays = economy.revengeStakeDays;
      const cycleWrite = await AccessCycle.updateOne(
        {
          _id: attacker.accessCycle._id,
          userId: attacker.user._id,
          status: "ACTIVE",
          paybackScoreDays: { $gte: stakeDays },
          lockedPaybackScoreDays: { $in: [0, null] },
          lockedLearningDays: 0,
        },
        { $inc: { paybackScoreDays: -stakeDays, lockedPaybackScoreDays: stakeDays } },
        { session, ordered: true }
      );
      if (!cycleWrite.modifiedCount) {
        throw statusError(409, "복수전에 필요한 페이백 점수 2점을 예치하지 못했습니다.");
      }
      await ArenaLearningDayLedger.create(
        [
          {
            userId: attacker.user._id,
            accessCycleId: attacker.accessCycle._id,
            idempotencyKey: `${matchId}:REVENGE_STAKE_LOCKED`,
            eventType: "REVENGE_STAKE_LOCKED",
            availableLearningDaysDelta: 0,
            paybackScoreDaysDelta: -stakeDays,
            lockedPaybackScoreDaysDelta: stakeDays,
            lockedLearningDaysDelta: 0,
            reservedLearningDaysDelta: 0,
            balanceAfter: {
              availableLearningDays: Number(attacker.accessCycle.availableLearningDays),
              paybackScoreDays: Number(attacker.accessCycle.paybackScoreDays) - stakeDays,
              lockedPaybackScoreDays: Number(attacker.accessCycle.lockedPaybackScoreDays || 0) + stakeDays,
              lockedLearningDays: Number(attacker.accessCycle.lockedLearningDays),
              reservedLearningDays: Number(attacker.accessCycle.reservedLearningDays || 0),
            },
            sourceType: "ArenaMatch",
            sourceId: matchId,
            occurredAt: now,
            metadata: { division: "SUB", matchType: "REVENGE", feeDays: economy.feeDays },
          },
        ],
        { session }
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
          { eventType: "ArenaRevengeMatchCreated", aggregateType: "ArenaMatch", aggregateId: matchId, idempotencyKey: `${matchId}:ArenaRevengeMatchCreated`, payload: { sourceMatchId: sourceMatch._id, stakeDays } },
        ],
        { session, ordered: true }
      );
      result = { matchId: String(matchId), replayed: false };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function forfeitSubRevengeRight({ revengeRightId, userId, requestId, now = new Date() }) {
  if (!mongoose.isValidObjectId(revengeRightId) || !mongoose.isValidObjectId(userId)) {
    throw statusError(400, "포기할 복수전 권리를 확인해주세요.");
  }
  const decisionId = normalizeDecisionId(requestId);
  const right = await ArenaRevengeRight.findOneAndUpdate(
    { _id: revengeRightId, eligibleUserId: userId, division: "SUB", status: "AVAILABLE" },
    {
      $set: {
        status: "FORFEITED",
        decisionIdempotencyKey: `${revengeRightId}:FORFEIT:${decisionId}`,
        forfeitedAt: now,
      },
    },
    { returnDocument: "after" }
  );
  if (!right) {
    const replay = await ArenaRevengeRight.findOne({
      _id: revengeRightId,
      eligibleUserId: userId,
      status: "FORFEITED",
    }).lean();
    if (replay) return { forfeited: true, replayed: true, sourceMatchId: replay.sourceMatchId };
    throw statusError(409, "이미 사용했거나 포기한 복수전 권리입니다.");
  }
  await ArenaOutboxEvent.findOneAndUpdate(
    { idempotencyKey: `${right._id}:ArenaRevengeForfeited` },
    {
      $setOnInsert: {
        eventType: "ArenaRevengeForfeited",
        aggregateType: "ArenaRevengeRight",
        aggregateId: right._id,
        idempotencyKey: `${right._id}:ArenaRevengeForfeited`,
        payload: { sourceMatchId: right.sourceMatchId },
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return { forfeited: true, replayed: false, sourceMatchId: right.sourceMatchId };
}

module.exports = {
  createSubRevengeMatch,
  forfeitSubRevengeRight,
  normalizeDecisionId,
  revengeMatchKey,
};
