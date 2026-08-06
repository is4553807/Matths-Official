const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
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
  sealArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  ARENA_LEGACY_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  TIER_SPECS,
  packCurveForPair,
  resolveArenaDifficultyTier,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  settleSubRevengeMatch,
} = require("../services/arenaMatchSettlementService");

dotenv.config({ path: "./config.env" });

function question(index, checkedAt) {
  return {
    questionKey: `Q${index}`,
    typeId: `E2E-REVENGE-TYPE-${index}`,
    category: "semi-killer",
    courseId: "algebra",
    referenceFamily: "E2E-REVENGE",
    skillTags: ["e2e"],
    difficultyScore: 0.7,
    expectedTimeMs: 90000,
    prompt: `${index} + 2의 값을 구하세요.`,
    inputMode: "short-answer",
    choices: [],
    answer: String(index + 2),
    solution: `${index} + 2 = ${index + 2}`,
    points: 20,
    validation: {
      passed: true,
      solvable: true,
      uniqueAnswer: true,
      calculatorFree: true,
      answerMatches: true,
      checkedAt,
    },
  };
}

async function cleanup(ids) {
  await Promise.all([
    ArenaLearningDayLedger.deleteMany({ sourceId: ids.matchId }),
    ArenaStandingChangeLedger.deleteMany({ matchId: ids.matchId }),
    ArenaOutboxEvent.deleteMany({
      aggregateId: { $in: [ids.matchId, ids.revengeRightId] },
    }),
    ArenaMatchParticipantLock.deleteMany({ matchId: ids.matchId }),
    ArenaMatchEvidence.deleteMany({ matchId: ids.matchId }),
    ArenaMatchAttempt.deleteMany({ matchId: ids.matchId }),
    ArenaMatch.deleteOne({ _id: ids.matchId }),
    ArenaProblemPack.deleteOne({ _id: ids.problemPackId }),
    ArenaRevengeRight.deleteOne({ _id: ids.revengeRightId }),
    AccessCycle.deleteMany({ _id: { $in: ids.cycleIds } }),
    ArenaStanding.deleteMany({ _id: { $in: ids.standingIds } }),
  ]);
}

async function run() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  const now = new Date("2026-08-01T12:00:00+09:00");
  const suffix = randomUUID().replace(/-/g, "").toUpperCase();
  const challengerUserId = new mongoose.Types.ObjectId();
  const defenderUserId = new mongoose.Types.ObjectId();
  const challengerStandingId = new mongoose.Types.ObjectId();
  const defenderStandingId = new mongoose.Types.ObjectId();
  const challengerCycleId = new mongoose.Types.ObjectId();
  const defenderCycleId = new mongoose.Types.ObjectId();
  const problemPackId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const revengeRightId = new mongoose.Types.ObjectId();
  const sourceMatchId = new mongoose.Types.ObjectId();
  const policyVersionId = new mongoose.Types.ObjectId();
  const ids = {
    matchId,
    revengeRightId,
    problemPackId,
    cycleIds: [challengerCycleId, defenderCycleId],
    standingIds: [challengerStandingId, defenderStandingId],
  };

  try {
    const difficultyTier = resolveArenaDifficultyTier("SILVER", "GOLD");
    const difficultySpec = TIER_SPECS[difficultyTier];
    const questions = Array.from({ length: 5 }, (_, index) =>
      question(index + 1, now)
    );
    const sealedPack = sealArenaProblemPackDraft(
      {
        version: `E2E.SUB.REVENGE.${suffix}`,
        displayName: "Unranked 복수전 실연결 E2E",
        status: "DRAFT",
        division: "SUB",
        matchType: "REVENGE",
        tierPairKey: "SILVER_GOLD",
        tierPairLabel: "실버-골드",
        generationMode: "AUTO_ON_CHALLENGE",
        generatedForMatchKey: `E2E:SUB:REVENGE:${suffix}`,
        designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
        contentSourceVersion: ARENA_LEGACY_CONTENT_VERSION,
        designCompliance: "PENDING_FINAL_GENERATORS",
        difficultyAnchor: "DEFENDER",
        difficultyTier,
        targetDefenderAccuracyMin: difficultySpec.defenderAccuracy[0],
        targetDefenderAccuracyMax: difficultySpec.defenderAccuracy[1],
        targetChallengerAccuracyMin: difficultySpec.challengerAccuracy[0],
        targetChallengerAccuracyMax: difficultySpec.challengerAccuracy[1],
        packCurve: packCurveForPair("SILVER", "GOLD"),
        curriculumVersion: "E2E-V1",
        curriculumCoverage: ["algebra"],
        questionCount: 5,
        totalPoints: 100,
        timeLimitMs: 10 * 60 * 1000,
        scoringVersion: "SUB-REVENGE-V1",
        variantMode: "SAME",
        questions,
        availableFrom: now,
        availableUntil: null,
      },
      { sealedAt: now, autoValidated: true }
    );

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ArenaStanding.create(
          [
            {
              _id: challengerStandingId,
              userId: challengerUserId,
              division: "SUB",
              seasonKey: `E2E-REVENGE-${suffix}`,
              arenaRank: "실버",
              arenaPosition: 7,
              arenaGp: 40,
              status: "ACTIVE",
            },
            {
              _id: defenderStandingId,
              userId: defenderUserId,
              division: "SUB",
              seasonKey: `E2E-REVENGE-${suffix}`,
              arenaRank: "골드",
              arenaPosition: 2,
              arenaGp: 90,
              status: "ACTIVE",
            },
          ],
          { session, ordered: true }
        );
        const cycleBase = {
          division: "SUB",
          status: "ACTIVE",
          policyVersionId,
          policyVersionCode: "E2E-SUB-REVENGE-POLICY",
          policySnapshot: { matchStakeDays: { normal: 1, revenge: 2 } },
          currency: "KRW",
          pricePaid: 0,
          paidAt: now,
          startsAt: now,
          baseExpiresAt: new Date(now.getTime() + 30 * 86400000),
          expiresAt: new Date(now.getTime() + 30 * 86400000),
          evaluationAt: new Date(now.getTime() + 30 * 86400000),
          firstDayMode: "NEXT_DAY",
          reservedLearningDays: 0,
        };
        await AccessCycle.create(
          [
            {
              ...cycleBase,
              _id: challengerCycleId,
              userId: challengerUserId,
              availableLearningDays: 8,
              paybackScoreDays: 10,
              lockedPaybackScoreDays: 2,
              lockedLearningDays: 0,
            },
            {
              ...cycleBase,
              _id: defenderCycleId,
              userId: defenderUserId,
              availableLearningDays: 10,
              paybackScoreDays: 10,
              lockedLearningDays: 0,
            },
          ],
          { session, ordered: true }
        );
        await ArenaProblemPack.create(
          [{ ...sealedPack, _id: problemPackId }],
          { session, ordered: true }
        );
        await ArenaRevengeRight.create(
          [
            {
              _id: revengeRightId,
              sourceMatchId,
              division: "SUB",
              eligibleUserId: challengerUserId,
              opponentUserId: defenderUserId,
              status: "CLAIMED",
              originalStakeDays: 1,
              revengeStakeDays: 2,
              feeDays: 1,
              policyVersionCode: "E2E-SUB-REVENGE-POLICY",
              revengeMatchId: matchId,
              claimedAt: now,
              completionDeadlineAt: new Date(now.getTime() + 86400000),
            },
          ],
          { session, ordered: true }
        );
        await ArenaMatch.create(
          [
            {
              _id: matchId,
              matchKey: `E2E:SUB:REVENGE:${suffix}`,
              division: "SUB",
              seasonKey: `E2E-REVENGE-${suffix}`,
              matchType: "REVENGE",
              matchOrigin: "REVENGE",
              requestInitiatorUserId: challengerUserId,
              targetTier: "GOLD",
              revengeRightId,
              originalMatchId: sourceMatchId,
              tierPairKey: "SILVER_GOLD",
              tierPairLabel: "실버-골드",
              challenger: {
                userId: challengerUserId,
                standingId: challengerStandingId,
                accessCycleId: challengerCycleId,
                tupleBefore: {
                  arenaRank: "실버",
                  arenaPosition: 7,
                  arenaGp: 40,
                },
                stakeDays: 2,
                submittedAt: now,
              },
              defender: {
                userId: defenderUserId,
                standingId: defenderStandingId,
                accessCycleId: defenderCycleId,
                tupleBefore: {
                  arenaRank: "골드",
                  arenaPosition: 2,
                  arenaGp: 90,
                },
                stakeDays: 0,
                submittedAt: now,
              },
              status: "SUBMITTED",
              policyVersionCode: "E2E-SUB-REVENGE-POLICY",
              subscriptionPolicyVersionId: policyVersionId,
              subscriptionPolicyVersionCode: "E2E-SUB-REVENGE-POLICY",
              economySnapshot: {
                originalStakeDays: 1,
                challengerStakeDays: 2,
                defenderStakeDays: 0,
                revengeStakeMultiplier: 2,
                feeDays: 1,
                recipientNoShowReturnDays: 1,
                recipientNoShowBurnDays: 1,
              },
              problemPackId,
              problemPackVersion: sealedPack.version,
              scoringVersion: sealedPack.scoringVersion,
              timeLimitMs: sealedPack.timeLimitMs,
              requestedAt: now,
              startDeadlineAt: new Date(now.getTime() + 86400000),
              completionDeadlineAt: new Date(now.getTime() + 86400000),
              readyAt: now,
              startedAt: now,
              integrityStatus: "CLEAR",
            },
          ],
          { session, ordered: true }
        );

        const correctAnswers = questions.map((item) => ({
          questionKey: item.questionKey,
          value: item.answer,
          revision: 1,
          lastChangedAt: now,
        }));
        const wrongAnswers = questions.map((item) => ({
          questionKey: item.questionKey,
          value: "999",
          revision: 1,
          lastChangedAt: now,
        }));
        const timings = questions.map((item) => ({
          questionKey: item.questionKey,
          startedAt: new Date(now.getTime() - 60000),
          completedAt: now,
          responseTimeMs: 60000,
        }));
        const attempts = await ArenaMatchAttempt.create(
          [
            {
              matchId,
              userId: challengerUserId,
              role: "CHALLENGER",
              problemPackId,
              problemPackVersion: sealedPack.version,
              status: "SUBMITTED",
              answers: correctAnswers,
              questionTimings: timings,
              activeSolveTimeMs: 300000,
              currentQuestionIndex: 5,
              submittedAt: now,
              evidenceSubmittedAt: now,
            },
            {
              matchId,
              userId: defenderUserId,
              role: "DEFENDER",
              problemPackId,
              problemPackVersion: sealedPack.version,
              status: "SUBMITTED",
              answers: wrongAnswers,
              questionTimings: timings,
              activeSolveTimeMs: 300000,
              currentQuestionIndex: 5,
              submittedAt: now,
              evidenceSubmittedAt: now,
            },
          ],
          { session, ordered: true }
        );
        await ArenaMatchEvidence.create(
          attempts.map((attempt, index) => ({
            attemptId: attempt._id,
            matchId,
            userId: index === 0 ? challengerUserId : defenderUserId,
            files: [
              {
                originalName: `e2e-revenge-${index}.png`,
                storedName: `e2e-revenge-${suffix}-${index}.png`,
                mimeType: "image/png",
                sizeBytes: 10240,
                sha256: String(index + 1).repeat(64),
              },
            ],
            deadlineAt: new Date(now.getTime() + 60000),
            submittedAt: now,
            status: "ON_TIME",
            anomalyFlags: [],
          })),
          { session, ordered: true }
        );
        await ArenaMatchParticipantLock.create(
          [
            { userId: challengerUserId, matchId, acquiredAt: now },
            { userId: defenderUserId, matchId, acquiredAt: now },
          ],
          { session, ordered: true }
        );
      });
    } finally {
      await session.endSession();
    }

    const settlement = await settleSubRevengeMatch({ matchId, now });
    const [match, challengerStanding, defenderStanding, challengerCycle, right] =
      await Promise.all([
        ArenaMatch.findById(matchId).lean(),
        ArenaStanding.findById(challengerStandingId).lean(),
        ArenaStanding.findById(defenderStandingId).lean(),
        AccessCycle.findById(challengerCycleId).lean(),
        ArenaRevengeRight.findById(revengeRightId).lean(),
      ]);
    assert.equal(
      settlement.settled,
      true,
      JSON.stringify(settlement)
    );
    assert.equal(settlement.winnerRole, "CHALLENGER");
    assert.equal(match.status, "SETTLED");
    assert.equal(challengerStanding.arenaRank, "골드");
    assert.equal(challengerStanding.arenaGp, 90);
    assert.equal(defenderStanding.arenaRank, "실버");
    assert.equal(defenderStanding.arenaGp, 40);
    assert.equal(challengerCycle.availableLearningDays, 8);
    assert.equal(challengerCycle.paybackScoreDays, 11);
    assert.equal(challengerCycle.lockedPaybackScoreDays, 0);
    assert.equal(challengerCycle.lockedLearningDays, 0);
    assert.equal(right.status, "CONSUMED");
    assert.equal(match.resultSnapshot.settlementSummary.returnedPaybackScore, 1);
    assert.equal(match.resultSnapshot.settlementSummary.burnedPaybackScore, 1);
    assert.equal(
      await ArenaStandingChangeLedger.countDocuments({ matchId }),
      2
    );
    assert.equal(
      await ArenaLearningDayLedger.countDocuments({ sourceId: matchId }),
      1
    );
    console.log(
      JSON.stringify({
        ok: true,
        database: mongoose.connection.name,
        matchType: "REVENGE",
        tupleSwapped: true,
        returnedPaybackScore: 1,
        burnedPaybackScore: 1,
      })
    );
  } finally {
    await cleanup(ids);
    const remaining = await ArenaMatch.countDocuments({ _id: matchId });
    console.log(JSON.stringify({ cleanup: remaining === 0 }));
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
