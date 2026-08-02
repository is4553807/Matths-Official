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
const { sealArenaProblemPackDraft } = require("../services/arenaProblemPackService");
const { settleMainNormalMatch } = require("../services/mainArenaSettlementService");
const { settleMainRevengeNoShow } = require("../services/mainArenaRevengeService");
const { moveAvailable } = require("../services/mainLearningDayService");

dotenv.config({ path: "./config.env" });

function questions(now) {
  return Array.from({ length: 5 }, (_, index) => ({
    questionKey: `Q${index + 1}`,
    typeId: `MAIN-E2E-${index + 1}`,
    category: "semi-killer",
    courseId: "algebra",
    referenceFamily: "MAIN-E2E",
    skillTags: [`type-${index + 1}`],
    difficultyScore: 0.75,
    expectedTimeMs: 90000,
    prompt: `${index + 1} + 2의 값을 구하세요.`,
    inputMode: "short-answer",
    choices: [],
    answer: String(index + 3),
    solution: `${index + 1} + 2 = ${index + 3}`,
    points: 20,
    validation: {
      passed: true,
      solvable: true,
      uniqueAnswer: true,
      calculatorFree: true,
      answerMatches: true,
      checkedAt: now,
    },
  }));
}

function attempt({ matchId, userId, role, pack, answers, now }) {
  return {
    matchId,
    userId,
    role,
    problemPackId: pack._id,
    problemPackVersion: pack.version,
    status: "SUBMITTED",
    answers: answers.map((value, index) => ({
      questionKey: `Q${index + 1}`,
      value,
      revision: 1,
      lastChangedAt: now,
    })),
    questionTimings: answers.map((_value, index) => ({
      questionKey: `Q${index + 1}`,
      startedAt: new Date(now.getTime() - (index + 1) * 60000),
      completedAt: now,
      responseTimeMs: 60000,
    })),
    activeSolveTimeMs: 300000,
    currentQuestionIndex: 5,
    submittedAt: now,
    evidenceSubmittedAt: now,
  };
}

async function run() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  // 실행한 실제 요일에 따라 일요일 마감 규칙으로 보류되지 않도록
  // 월요일 KST의 고정 시각에서 정산 경계를 검증한다.
  const now = new Date("2026-08-03T10:00:00.000+09:00");
  const suffix = randomUUID().replace(/-/g, "").toUpperCase();
  const ids = {
    challengerUserId: new mongoose.Types.ObjectId(),
    defenderUserId: new mongoose.Types.ObjectId(),
    challengerStandingId: new mongoose.Types.ObjectId(),
    defenderStandingId: new mongoose.Types.ObjectId(),
    challengerCycleId: new mongoose.Types.ObjectId(),
    defenderCycleId: new mongoose.Types.ObjectId(),
    problemPackId: new mongoose.Types.ObjectId(),
    matchId: new mongoose.Types.ObjectId(),
    policyVersionId: new mongoose.Types.ObjectId(),
    revengeMatchId: new mongoose.Types.ObjectId(),
  };
  try {
    const packQuestions = questions(now);
    const sealed = sealArenaProblemPackDraft(
      {
        _id: ids.problemPackId,
        version: `E2E.MAIN.NORMAL.${suffix}`,
        displayName: "Main Division 일반 쟁탈전 실연결 E2E",
        status: "DRAFT",
        division: "MAIN",
        matchType: "NORMAL",
        tierPairKey: "SILVER_GOLD",
        tierPairLabel: "실버-골드",
        generationMode: "AUTO_ON_CHALLENGE",
        generatedForMatchKey: `E2E:MAIN:NORMAL:${suffix}`,
        curriculumVersion: "E2E-V1",
        curriculumCoverage: ["algebra"],
        questionCount: 5,
        totalPoints: 100,
        timeLimitMs: 10 * 60 * 1000,
        scoringVersion: "MAIN-STANDARD-V1",
        variantMode: "SAME",
        questions: packQuestions,
        availableFrom: now,
        availableUntil: null,
      },
      { sealedAt: now, autoValidated: true }
    );
    sealed._id = ids.problemPackId;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ArenaStanding.create(
          [
            {
              _id: ids.challengerStandingId,
              userId: ids.challengerUserId,
              division: "MAIN",
              seasonKey: `E2E-${suffix}`,
              arenaRank: "실버",
              arenaPosition: 8,
              arenaGp: 35,
              status: "ACTIVE",
            },
            {
              _id: ids.defenderStandingId,
              userId: ids.defenderUserId,
              division: "MAIN",
              seasonKey: `E2E-${suffix}`,
              arenaRank: "골드",
              arenaPosition: 2,
              arenaGp: 88,
              status: "ACTIVE",
            },
          ],
          { session, ordered: true }
        );
        const cycleBase = {
          division: "MAIN",
          status: "ACTIVE",
          policyVersionId: ids.policyVersionId,
          policyVersionCode: "E2E-MAIN-POLICY",
          policySnapshot: {},
          currency: "KRW",
          pricePaid: 0,
          paidAt: now,
          startsAt: now,
          baseExpiresAt: new Date(now.getTime() + 30 * 86400000),
          expiresAt: new Date(now.getTime() + 30 * 86400000),
          evaluationAt: new Date(now.getTime() + 30 * 86400000),
          firstDayMode: "NEXT_DAY",
          availableLearningDays: 9,
          paybackScoreDays: 0,
          lockedLearningDays: 1,
          reservedLearningDays: 0,
          learningDayBuckets: [
            { sourceType: "MAIN_MATCH_TRANSFER", availableDays: 9, reservedDays: 0, lockedDays: 1 },
          ],
        };
        await AccessCycle.create(
          [
            { ...cycleBase, _id: ids.challengerCycleId, userId: ids.challengerUserId },
            { ...cycleBase, _id: ids.defenderCycleId, userId: ids.defenderUserId },
          ],
          { session, ordered: true }
        );
        await ArenaProblemPack.create([sealed], { session, ordered: true });
        await ArenaMatch.create(
          [
            {
              _id: ids.matchId,
              matchKey: `E2E:MAIN:NORMAL:${suffix}`,
              division: "MAIN",
              seasonKey: `E2E-${suffix}`,
              matchType: "NORMAL",
              matchOrigin: "MAIN_UPWARD_AUTO_MATCH",
              requestInitiatorUserId: ids.challengerUserId,
              targetTier: "GOLD",
              tierPairKey: "SILVER_GOLD",
              tierPairLabel: "실버-골드",
              challenger: {
                userId: ids.challengerUserId,
                standingId: ids.challengerStandingId,
                accessCycleId: ids.challengerCycleId,
                tupleBefore: { arenaRank: "실버", arenaPosition: 8, arenaGp: 35 },
                stakeDays: 1,
                submittedAt: now,
              },
              defender: {
                userId: ids.defenderUserId,
                standingId: ids.defenderStandingId,
                accessCycleId: ids.defenderCycleId,
                tupleBefore: { arenaRank: "골드", arenaPosition: 2, arenaGp: 88 },
                stakeDays: 1,
                submittedAt: now,
              },
              status: "SUBMITTED",
              policyVersionCode: "E2E-MAIN-POLICY",
              divisionPolicyVersionId: ids.policyVersionId,
              divisionPolicyVersionCode: "E2E-MAIN-POLICY",
              economySnapshot: {
                originalStakeDays: 1,
                challengerStakeDays: 1,
                defenderStakeDays: 1,
                revengeStakeMultiplier: 2,
                feeDays: 1,
              },
              problemPackId: ids.problemPackId,
              problemPackVersion: sealed.version,
              scoringVersion: sealed.scoringVersion,
              timeLimitMs: sealed.timeLimitMs,
              requestedAt: now,
              startDeadlineAt: new Date(now.getTime() + 86400000),
              readyAt: now,
              integrityStatus: "CLEAR",
            },
          ],
          { session, ordered: true }
        );
        const attempts = await ArenaMatchAttempt.create(
          [
            attempt({
              matchId: ids.matchId,
              userId: ids.challengerUserId,
              role: "CHALLENGER",
              pack: sealed,
              answers: packQuestions.map((question) => question.answer),
              now,
            }),
            attempt({
              matchId: ids.matchId,
              userId: ids.defenderUserId,
              role: "DEFENDER",
              pack: sealed,
              answers: packQuestions.map(() => "999"),
              now,
            }),
          ],
          { session, ordered: true }
        );
        await ArenaMatchEvidence.create(
          attempts.map((entry, index) => ({
            attemptId: entry._id,
            matchId: ids.matchId,
            userId: index === 0 ? ids.challengerUserId : ids.defenderUserId,
            files: [
              {
                originalName: `main-e2e-${index}.png`,
                storedName: `main-e2e-${suffix}-${index}.png`,
                mimeType: "image/png",
                sizeBytes: 10240,
                sha256: String(index + 3).repeat(64),
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
            { userId: ids.challengerUserId, matchId: ids.matchId, acquiredAt: now },
            { userId: ids.defenderUserId, matchId: ids.matchId, acquiredAt: now },
          ],
          { session, ordered: true }
        );
      });
    } finally {
      await session.endSession();
    }

    const result = await settleMainNormalMatch({ matchId: ids.matchId, now });
    assert.equal(result.settled, true);
    assert.equal(result.winnerRole, "CHALLENGER");
    const [match, challengerStanding, defenderStanding, challengerCycle, defenderCycle, revengeRight] =
      await Promise.all([
        ArenaMatch.findById(ids.matchId).lean(),
        ArenaStanding.findById(ids.challengerStandingId).lean(),
        ArenaStanding.findById(ids.defenderStandingId).lean(),
        AccessCycle.findById(ids.challengerCycleId).lean(),
        AccessCycle.findById(ids.defenderCycleId).lean(),
        ArenaRevengeRight.findOne({ sourceMatchId: ids.matchId }).lean(),
      ]);
    assert.equal(match.status, "SETTLED");
    assert.deepEqual(
      [challengerStanding.arenaRank, challengerStanding.arenaPosition, challengerStanding.arenaGp],
      ["골드", 2, 88]
    );
    assert.deepEqual(
      [defenderStanding.arenaRank, defenderStanding.arenaPosition, defenderStanding.arenaGp],
      ["실버", 8, 35]
    );
    assert.equal(challengerCycle.availableLearningDays, 11);
    assert.equal(challengerCycle.lockedLearningDays, 0);
    assert.equal(defenderCycle.availableLearningDays, 9);
    assert.equal(defenderCycle.lockedLearningDays, 0);
    assert.equal(revengeRight.revengeStakeDays, 2);
    assert.equal(revengeRight.feeDays, 1);
    assert.equal(await ArenaLearningDayLedger.countDocuments({ sourceId: ids.matchId }), 2);
    assert.equal(await ArenaStandingChangeLedger.countDocuments({ matchId: ids.matchId }), 2);

    const revengeAttackerCycle = await AccessCycle.findById(ids.defenderCycleId).lean();
    const revengeStakeState = moveAvailable(revengeAttackerCycle, 2, "lockedDays");
    const revengeDeadline = new Date(now.getTime() - 1000);
    const revengeSession = await mongoose.startSession();
    try {
      await revengeSession.withTransaction(async () => {
        await AccessCycle.updateOne(
          { _id: ids.defenderCycleId, availableLearningDays: 9, lockedLearningDays: 0 },
          {
            $set: {
              learningDayBuckets: revengeStakeState.buckets,
              availableLearningDays: revengeStakeState.availableLearningDays,
              reservedLearningDays: revengeStakeState.reservedLearningDays,
              lockedLearningDays: revengeStakeState.lockedLearningDays,
            },
          },
          { session: revengeSession }
        );
        await ArenaMatch.create(
          [
            {
              _id: ids.revengeMatchId,
              matchKey: `E2E:MAIN:REVENGE:${suffix}`,
              division: "MAIN",
              seasonKey: `E2E-${suffix}`,
              matchType: "REVENGE",
              matchOrigin: "REVENGE",
              requestInitiatorUserId: ids.defenderUserId,
              targetTier: "GOLD",
              revengeRightId: revengeRight._id,
              originalMatchId: ids.matchId,
              tierPairKey: "SILVER_GOLD",
              tierPairLabel: "실버-골드",
              challenger: {
                userId: ids.defenderUserId,
                standingId: ids.defenderStandingId,
                accessCycleId: ids.defenderCycleId,
                tupleBefore: { arenaRank: "실버", arenaPosition: 8, arenaGp: 35 },
                stakeDays: 2,
              },
              defender: {
                userId: ids.challengerUserId,
                standingId: ids.challengerStandingId,
                accessCycleId: ids.challengerCycleId,
                tupleBefore: { arenaRank: "골드", arenaPosition: 2, arenaGp: 88 },
                stakeDays: 0,
              },
              status: "READY",
              policyVersionCode: "E2E-MAIN-POLICY",
              divisionPolicyVersionId: ids.policyVersionId,
              divisionPolicyVersionCode: "E2E-MAIN-POLICY",
              economySnapshot: {
                originalStakeDays: 1,
                challengerStakeDays: 2,
                defenderStakeDays: 0,
                revengeStakeMultiplier: 2,
                feeDays: 1,
              },
              problemPackId: ids.problemPackId,
              problemPackVersion: sealed.version,
              scoringVersion: sealed.scoringVersion,
              timeLimitMs: sealed.timeLimitMs,
              requestedAt: now,
              startDeadlineAt: revengeDeadline,
              completionDeadlineAt: revengeDeadline,
              readyAt: now,
              integrityStatus: "PENDING",
            },
          ],
          { session: revengeSession, ordered: true }
        );
        await ArenaMatchParticipantLock.create(
          [
            { userId: ids.defenderUserId, matchId: ids.revengeMatchId, acquiredAt: now },
            { userId: ids.challengerUserId, matchId: ids.revengeMatchId, acquiredAt: now },
          ],
          { session: revengeSession, ordered: true }
        );
        await ArenaRevengeRight.updateOne(
          { _id: revengeRight._id },
          {
            $set: {
              status: "CLAIMED",
              revengeMatchId: ids.revengeMatchId,
              claimedAt: now,
              completionDeadlineAt: revengeDeadline,
            },
          },
          { session: revengeSession }
        );
      });
    } finally {
      await revengeSession.endSession();
    }

    const revengeResult = await settleMainRevengeNoShow({
      matchId: ids.revengeMatchId,
      noShowRole: "DEFENDER",
      now,
    });
    assert.equal(
      revengeResult.settled,
      true,
      JSON.stringify(revengeResult)
    );
    assert.equal(revengeResult.winnerRole, "CHALLENGER");
    const [revengeAttackerStanding, revengeDefenderStanding, revengeAttackerAfter] =
      await Promise.all([
        ArenaStanding.findById(ids.defenderStandingId).lean(),
        ArenaStanding.findById(ids.challengerStandingId).lean(),
        AccessCycle.findById(ids.defenderCycleId).lean(),
      ]);
    assert.deepEqual(
      [revengeAttackerStanding.arenaRank, revengeAttackerStanding.arenaPosition, revengeAttackerStanding.arenaGp],
      ["골드", 2, 88]
    );
    assert.deepEqual(
      [revengeDefenderStanding.arenaRank, revengeDefenderStanding.arenaPosition, revengeDefenderStanding.arenaGp],
      ["실버", 8, 35]
    );
    assert.equal(revengeAttackerAfter.availableLearningDays, 8);
    assert.equal(revengeAttackerAfter.lockedLearningDays, 0);
    console.log(JSON.stringify({ ok: true, database: mongoose.connection.name, tupleSwapped: true, winnerDays: 11, loserDays: 9, revengeRight: true }));
  } finally {
    const right = await ArenaRevengeRight.findOne({ sourceMatchId: ids.matchId }).lean();
    await Promise.all([
      ArenaLearningDayLedger.deleteMany({ sourceId: { $in: [ids.matchId, ids.revengeMatchId] } }),
      ArenaStandingChangeLedger.deleteMany({ matchId: { $in: [ids.matchId, ids.revengeMatchId] } }),
      ArenaOutboxEvent.deleteMany({ aggregateId: { $in: [ids.matchId, ids.revengeMatchId, right?._id].filter(Boolean) } }),
      ArenaMatchParticipantLock.deleteMany({ matchId: { $in: [ids.matchId, ids.revengeMatchId] } }),
      ArenaMatchEvidence.deleteMany({ matchId: { $in: [ids.matchId, ids.revengeMatchId] } }),
      ArenaMatchAttempt.deleteMany({ matchId: { $in: [ids.matchId, ids.revengeMatchId] } }),
      ArenaRevengeRight.deleteMany({ sourceMatchId: ids.matchId }),
      ArenaMatch.deleteMany({ _id: { $in: [ids.matchId, ids.revengeMatchId] } }),
      ArenaProblemPack.deleteOne({ _id: ids.problemPackId }),
      AccessCycle.deleteMany({ _id: { $in: [ids.challengerCycleId, ids.defenderCycleId] } }),
      ArenaStanding.deleteMany({ _id: { $in: [ids.challengerStandingId, ids.defenderStandingId] } }),
    ]);
    console.log(JSON.stringify({ cleanup: (await ArenaMatch.countDocuments({ _id: ids.matchId })) === 0 }));
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
