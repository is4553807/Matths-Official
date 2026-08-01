const assert = require("assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
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
  ArenaStanding,
  ArenaStandingChangeLedger,
} = require("../models/goatArenaModel");
const {
  sealArenaProblemPackDraft,
} = require("../services/arenaProblemPackService");
const {
  settleSubNormalMatch,
} = require("../services/arenaMatchSettlementService");

dotenv.config({ path: "./config.env" });

function question(index, checkedAt) {
  return {
    questionKey: `Q${index}`,
    typeId: `E2E-TYPE-${index}`,
    category: "semi-killer",
    courseId: "algebra",
    referenceFamily: "E2E",
    skillTags: ["e2e"],
    difficultyScore: 0.7,
    expectedTimeMs: 90000,
    prompt: `${index} + 1의 값을 구하세요.`,
    inputMode: "short-answer",
    choices: [],
    answer: String(index + 1),
    solution: `${index} + 1 = ${index + 1}`,
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

async function cleanupFixture(ids) {
  const operations = [
    ArenaLearningDayLedger.deleteMany({ sourceId: ids.matchId }),
    ArenaStandingChangeLedger.deleteMany({ matchId: ids.matchId }),
    ArenaOutboxEvent.deleteMany({ aggregateId: ids.matchId }),
    ArenaMatchParticipantLock.deleteMany({ matchId: ids.matchId }),
    ArenaMatchEvidence.deleteMany({ matchId: ids.matchId }),
    ArenaMatchAttempt.deleteMany({ matchId: ids.matchId }),
    ArenaMatch.deleteOne({ _id: ids.matchId }),
    ArenaProblemPack.deleteOne({ _id: ids.problemPackId }),
    AccessCycle.deleteMany({ _id: { $in: ids.cycleIds } }),
    ArenaStanding.deleteMany({ _id: { $in: ids.standingIds } }),
    AdminTodo.deleteMany({ sourceId: ids.matchId }),
  ];
  await Promise.all(operations);
}

async function run() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  const now = new Date();
  const suffix = randomUUID().replace(/-/g, "").toUpperCase();
  const challengerUserId = new mongoose.Types.ObjectId();
  const defenderUserId = new mongoose.Types.ObjectId();
  const challengerStandingId = new mongoose.Types.ObjectId();
  const defenderStandingId = new mongoose.Types.ObjectId();
  const challengerCycleId = new mongoose.Types.ObjectId();
  const defenderCycleId = new mongoose.Types.ObjectId();
  const problemPackId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const policyVersionId = new mongoose.Types.ObjectId();
  const ids = {
    matchId,
    problemPackId,
    cycleIds: [challengerCycleId, defenderCycleId],
    standingIds: [challengerStandingId, defenderStandingId],
  };

  try {
    const questions = Array.from({ length: 5 }, (_, index) =>
      question(index + 1, now)
    );
    const sealedPack = sealArenaProblemPackDraft(
      {
        version: `E2E.SUB.NORMAL.${suffix}`,
        displayName: "Sub 일반 쟁탈전 실연결 E2E",
        status: "DRAFT",
        division: "SUB",
        matchType: "NORMAL",
        tierPairKey: "SILVER_GOLD",
        tierPairLabel: "실버-골드",
        generationMode: "AUTO_ON_CHALLENGE",
        generatedForMatchKey: `E2E:SUB:NORMAL:${suffix}`,
        curriculumVersion: "E2E-V1",
        curriculumCoverage: ["algebra"],
        questionCount: 5,
        totalPoints: 100,
        timeLimitMs: 10 * 60 * 1000,
        scoringVersion: "SUB-STANDARD-V1",
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
              seasonKey: "E2E",
              arenaRank: "실버",
              arenaPosition: 7,
              arenaGp: 1200,
              status: "ACTIVE",
            },
            {
              _id: defenderStandingId,
              userId: defenderUserId,
              division: "SUB",
              seasonKey: "E2E",
              arenaRank: "골드",
              arenaPosition: 2,
              arenaGp: 1500,
              status: "ACTIVE",
            },
          ],
          { session, ordered: true }
        );
        const cycleBase = {
          division: "SUB",
          status: "ACTIVE",
          policyVersionId,
          policyVersionCode: "E2E-SUB-POLICY",
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
              availableLearningDays: 9,
              paybackScoreDays: 10,
              lockedLearningDays: 1,
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
        await ArenaMatch.create(
          [
            {
              _id: matchId,
              matchKey: `E2E:SUB:NORMAL:${suffix}`,
              division: "SUB",
              seasonKey: "E2E",
              matchType: "NORMAL",
              matchOrigin: "SUB_UPWARD_AUTO_MATCH",
              requestInitiatorUserId: challengerUserId,
              targetTier: "GOLD",
              tierPairKey: "SILVER_GOLD",
              tierPairLabel: "실버-골드",
              challenger: {
                userId: challengerUserId,
                standingId: challengerStandingId,
                accessCycleId: challengerCycleId,
                tupleBefore: {
                  arenaRank: "실버",
                  arenaPosition: 7,
                  arenaGp: 1200,
                },
                stakeDays: 1,
                submittedAt: now,
              },
              defender: {
                userId: defenderUserId,
                standingId: defenderStandingId,
                accessCycleId: defenderCycleId,
                tupleBefore: {
                  arenaRank: "골드",
                  arenaPosition: 2,
                  arenaGp: 1500,
                },
                stakeDays: 0,
                submittedAt: now,
              },
              status: "SUBMITTED",
              policyVersionCode: "E2E-SUB-POLICY",
              subscriptionPolicyVersionId: policyVersionId,
              subscriptionPolicyVersionCode: "E2E-SUB-POLICY",
              economySnapshot: {
                originalStakeDays: 1,
                challengerStakeDays: 1,
                defenderStakeDays: 0,
                revengeStakeMultiplier: 2,
                feeDays: 0,
                bronzeChallengerWinRefundDays: 0,
              },
              problemPackId,
              problemPackVersion: sealedPack.version,
              scoringVersion: sealedPack.scoringVersion,
              timeLimitMs: sealedPack.timeLimitMs,
              requestedAt: now,
              startDeadlineAt: new Date(now.getTime() + 86400000),
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
        const timings = questions.map((item, index) => ({
          questionKey: item.questionKey,
          startedAt: new Date(now.getTime() - (index + 1) * 60000),
          completedAt: now,
          responseTimeMs: 60000,
        }));
        const [challengerAttempt, defenderAttempt] =
          await ArenaMatchAttempt.create(
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
                score: 100,
                correctCount: 5,
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
                score: 0,
                correctCount: 0,
              },
            ],
            { session, ordered: true }
          );
        await ArenaMatchEvidence.create(
          [challengerAttempt, defenderAttempt].map((attempt, index) => ({
            attemptId: attempt._id,
            matchId,
            userId: index === 0 ? challengerUserId : defenderUserId,
            files: [
              {
                originalName: `e2e-${index}.png`,
                storedName: `e2e-${suffix}-${index}.png`,
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

    const settlement = await settleSubNormalMatch({ matchId, now });
    assert.equal(settlement.settled, true);
    assert.equal(settlement.winnerRole, "CHALLENGER");
    const [match, challengerStanding, defenderStanding, challengerCycle] =
      await Promise.all([
        ArenaMatch.findById(matchId).lean(),
        ArenaStanding.findById(challengerStandingId).lean(),
        ArenaStanding.findById(defenderStandingId).lean(),
        AccessCycle.findById(challengerCycleId).lean(),
      ]);
    assert.equal(match.status, "SETTLED");
    assert.equal(challengerStanding.arenaRank, "골드");
    assert.equal(challengerStanding.arenaGp, 1500);
    assert.equal(challengerStanding.arenaPosition, 2);
    assert.equal(defenderStanding.arenaRank, "실버");
    assert.equal(defenderStanding.arenaGp, 1200);
    assert.equal(challengerCycle.availableLearningDays, 9);
    assert.equal(challengerCycle.paybackScoreDays, 9);
    assert.equal(challengerCycle.lockedLearningDays, 0);
    assert.equal(challengerCycle.paidNormalAttacksCompleted, 1);
    assert.equal(
      await ArenaMatchParticipantLock.countDocuments({ matchId }),
      0
    );
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
        winnerRole: settlement.winnerRole,
        tupleSwapped: true,
        learningDayLedgerVerified: true,
      })
    );
  } finally {
    await cleanupFixture(ids);
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
