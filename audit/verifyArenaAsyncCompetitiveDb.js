"use strict";

process.env.ARENA_ASYNC_CLOSE_SCORE_THRESHOLD = "0.15";
// The production default remains disabled. This isolated suite explicitly
// enables the private-beta engine so its reservation and settlement paths can
// still be regression-tested before release.
process.env.ARENA_COMPETITIVE_ENABLED = "true";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaProblemPack,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const {
  cancelAsyncCompetitiveMatch,
  getAsyncCompetitiveResult,
  priorExposedQuestionHashes,
  questionInstanceHash,
  screenAndFinalizeAsyncCompetitiveMatch,
  settleAsyncCompetitiveMatch,
  startAsyncCompetitiveMatch,
} = require("../services/arenaAsyncCompetitiveService");
const {
  SCORING_VERSION,
  calculateCompetitivePerformance,
} = require("../services/arenaCompetitiveScoringService");
const {
  reviewHeldArenaV2Match,
} = require("../services/arenaV2IntegrityReviewAdapter");
const {
  forfeitArenaV2Match,
  settleArenaV2Match,
} = require("../services/arenaV2SettlementService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");

const now = new Date("2026-10-09T10:00:00.000Z");
const consentVersion = "ARENA21_SOLUTION_SHARE_V1";

function questions(prefix) {
  return Array.from({ length: 5 }, (_, index) => ({
    questionKey: `${prefix}-Q${index + 1}`,
    typeId: `${prefix}-TYPE-${index + 1}`,
    typeSkeletonId: `${prefix}-SKELETON-${index + 1}`,
    sourceTypeId: `${prefix}-SOURCE-${index + 1}`,
    prompt: `${prefix} 실제 문항 ${index + 1}`,
    choices: [],
    visualization: null,
    answer: String(index + 1),
    points: 20,
  }));
}

function answersFor(items, correctCount) {
  return items.map((question, index) => ({
    questionKey: question.questionKey,
    value: index < correctCount ? question.answer : "999",
    revision: 1,
    lastChangedAt: now,
  }));
}

function evidenceFile(name, hashCharacter) {
  return {
    originalName: `${name}.png`,
    storedName: `${name}.png`,
    mimeType: "image/png",
    sizeBytes: 12 * 1024,
    sha256: hashCharacter.repeat(64),
    storageProvider: "CLOUDINARY",
    storagePurpose: "USER_ARENA_EVIDENCE",
    cloudPublicId: `audit/${name}`,
    cloudResourceType: "image",
    cloudDeliveryType: "authenticated",
  };
}

async function insertPack(prefix) {
  const _id = new mongoose.Types.ObjectId();
  const items = questions(prefix);
  await ArenaProblemPack.collection.insertOne({
    _id,
    version: `AUDIT-${prefix}`,
    questions: items,
    createdAt: now,
    updatedAt: now,
  });
  return { _id, version: `AUDIT-${prefix}`, questions: items };
}

async function createFixture({ suffix, challengerUserId, ownerUserId, challengerRating }) {
  const currentPack = await insertPack(`CURRENT-${suffix}`);
  const historicalPack = await insertPack(`HISTORICAL-${suffix}`);
  const sourceMatchId = new mongoose.Types.ObjectId();
  const sourceAttemptId = new mongoose.Types.ObjectId();
  const sourceEvidenceId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const attemptId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const recordId = new mongoose.Types.ObjectId();
  const rates = [0.5, 0.5, 0.5, 0.5, 0.5];
  const historicalPerformance = calculateCompetitivePerformance({
    questions: historicalPack.questions.map((question, index) => ({
      questionKey: question.questionKey,
      correct: index < 3,
      sourceAccuracyRate: rates[index],
    })),
    totalSolveTimeMs: 420000,
  });
  await ArenaMatchAttempt.create({
    _id: sourceAttemptId,
    matchId: sourceMatchId,
    userId: ownerUserId,
    role: "CHALLENGER",
    problemPackId: historicalPack._id,
    problemPackVersion: historicalPack.version,
    variantCode: "INDIVIDUAL",
    status: "SUBMITTED",
    answers: answersFor(historicalPack.questions, 3),
    activeSolveTimeMs: 700000,
    questionTimings: historicalPack.questions.map((question) => ({
      questionKey: question.questionKey,
      startedAt: now,
      completedAt: new Date(now.getTime() + 120000),
      responseTimeMs: 120000,
    })),
    submittedAt: now,
    evidenceSubmittedAt: now,
  });
  await ArenaMatchEvidence.create({
    _id: sourceEvidenceId,
    attemptId: sourceAttemptId,
    matchId: sourceMatchId,
    userId: ownerUserId,
    files: [evidenceFile(`historical-${suffix}`, "b")],
    originalEvidenceSubmitted: true,
    submittedAt: now,
    status: "ON_TIME",
  });
  await ArenaCompetitiveRecord.create({
    _id: recordId,
    ownerUserId,
    sourceMatchId,
    sourceAttemptId,
    sourceEvidenceId,
    sourceProblemPackId: historicalPack._id,
    ratingSnapshot: {
      rating: 1500,
      ratingDeviation: 200,
      volatility: 0.06,
      tier: "platinum",
    },
    performance: historicalPerformance,
    questionInstanceHashes: historicalPack.questions.map(questionInstanceHash),
    status: "RESERVED",
    reservedByUserId: challengerUserId,
    reservedByMatchId: matchId,
    reservedAt: now,
    isBaseline: false,
    recordLabel: "검증된 과거 기록",
    consentVersion,
    verifiedAt: now,
  });
  await ArenaMatch.create({
    _id: matchId,
    matchKey: `ARENA21:AUDIT:${suffix}`,
    arenaVersion: "2.0",
    gameMode: "COMPETITIVE",
    division: "MAIN",
    seasonKey: "2026-10",
    competitivePool: "ALL",
    matchType: "NORMAL",
    matchOrigin: "ARENA_2_ASYNC_RECORD",
    requestInitiatorUserId: challengerUserId,
    tierPairKey: "ARENA2_AUDIT",
    tierPairLabel: "통합 수능 수학",
    challenger: { userId: challengerUserId },
    defender: { userId: ownerUserId },
    status: "SUBMITTED",
    policyVersionCode: "GOAT_ARENA_2_1_COMPETITIVE",
    problemPackId: currentPack._id,
    problemPackVersion: currentPack.version,
    scoringVersion: SCORING_VERSION,
    timeLimitMs: 600000,
    startDeadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
    integrityStatus: "PENDING",
    competitiveAsync: {
      enabled: true,
      historicalRecordId: recordId,
      historicalOwnerUserId: ownerUserId,
      challengerRatingBefore: challengerRating,
      challengerSourceRates: rates,
      questionInstanceHashes: currentPack.questions.map(questionInstanceHash),
      pendingComparison: { closeScoreThreshold: 0.15 },
    },
  });
  await ArenaMatchAttempt.create({
    _id: attemptId,
    matchId,
    userId: challengerUserId,
    role: "CHALLENGER",
    problemPackId: currentPack._id,
    problemPackVersion: currentPack.version,
    variantCode: "INDIVIDUAL",
    status: "SUBMITTED",
    answers: answersFor(currentPack.questions, 4),
    activeSolveTimeMs: 700000,
    questionTimings: currentPack.questions.map((question) => ({
      questionKey: question.questionKey,
      startedAt: now,
      completedAt: new Date(now.getTime() + 120000),
      responseTimeMs: 120000,
    })),
    submittedAt: now,
    evidenceSubmittedAt: now,
  });
  await ArenaMatchEvidence.create({
    _id: evidenceId,
    attemptId,
    matchId,
    userId: challengerUserId,
    files: [evidenceFile(`challenger-${suffix}`, "a")],
    originalEvidenceSubmitted: true,
    submittedAt: now,
    status: "ON_TIME",
  });
  await ArenaMatchParticipantLock.create({ userId: challengerUserId, matchId });
  return { matchId, recordId };
}

async function createAvailableHistoricalRecord({ suffix, ownerUserId }) {
  const pack = await insertPack(`AVAILABLE-${suffix}`);
  const sourceMatchId = new mongoose.Types.ObjectId();
  const attemptId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const rates = [0.5, 0.5, 0.5, 0.5, 0.5];
  await ArenaMatchAttempt.create({
    _id: attemptId,
    matchId: sourceMatchId,
    userId: ownerUserId,
    role: "CHALLENGER",
    problemPackId: pack._id,
    problemPackVersion: pack.version,
    variantCode: "INDIVIDUAL",
    status: "SUBMITTED",
    answers: answersFor(pack.questions, 3),
    activeSolveTimeMs: 700000,
    submittedAt: now,
    evidenceSubmittedAt: now,
  });
  await ArenaMatchEvidence.create({
    _id: evidenceId,
    attemptId,
    matchId: sourceMatchId,
    userId: ownerUserId,
    files: [evidenceFile(`available-${suffix}`, "c")],
    originalEvidenceSubmitted: true,
    submittedAt: now,
    status: "ON_TIME",
  });
  return ArenaCompetitiveRecord.create({
    ownerUserId,
    sourceMatchId,
    sourceAttemptId: attemptId,
    sourceEvidenceId: evidenceId,
    sourceProblemPackId: pack._id,
    ratingSnapshot: { rating: 1500, ratingDeviation: 200, volatility: 0.06, tier: "platinum" },
    performance: calculateCompetitivePerformance({
      questions: pack.questions.map((question, index) => ({
        questionKey: question.questionKey,
        correct: index < 3,
        sourceAccuracyRate: rates[index],
      })),
      totalSolveTimeMs: 700000,
    }),
    questionInstanceHashes: pack.questions.map(questionInstanceHash),
    status: "AVAILABLE",
    isBaseline: true,
    recordLabel: "검증된 기준 기록",
    consentVersion,
    verifiedAt: now,
  });
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  const challengerUserId = new mongoose.Types.ObjectId();
  const ownerUserId = new mongoose.Types.ObjectId();
  const outsiderUserId = new mongoose.Types.ObjectId();
  await User.collection.insertMany([
    { _id: challengerUserId, name: "async-challenger", email: "async-challenger@example.com", accountStatus: "active", isActive: true, createdAt: now, updatedAt: now },
    { _id: ownerUserId, name: "historical-owner", email: "historical-owner@example.com", accountStatus: "active", isActive: true, isTestAccount: true, createdAt: now, updatedAt: now },
    { _id: outsiderUserId, name: "outsider", email: "outsider@example.com", accountStatus: "active", isActive: true, createdAt: now, updatedAt: now },
  ]);
  const baseProfile = {
    normalMatchesCompleted: 3,
    placementFinalizedAt: now,
    placementFinalizedReason: "EARLY",
    rating: 1500,
    ratingDeviation: 200,
    volatility: 0.06,
    competitiveScore: 1500,
    scoreInitializedAt: now,
    tier: "platinum",
    ratingInitializedAt: now,
    placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
    competitiveSolutionSharingConsentVersion: consentVersion,
    competitiveSolutionSharingConsentedAt: now,
  };
  await ArenaCompetitiveProfile.create([
    { ...baseProfile, userId: challengerUserId, accountXp: 3, accountLevel: 1 },
    { ...baseProfile, userId: ownerUserId, accountXp: 9, accountLevel: 2 },
  ]);
  await Promise.all([
    ArenaCompetitiveRecord.init(),
    ArenaRatingSettlement.init(),
    ArenaMatchParticipantLock.init(),
  ]);
  try {
    const available = await createAvailableHistoricalRecord({ suffix: "START", ownerUserId });
    const started = await startAsyncCompetitiveMatch({
      userId: challengerUserId,
      now: new Date(now.getTime() + 500),
    });
    assert.equal(started.match.matchOrigin, "ARENA_2_ASYNC_RECORD");
    assert.equal(started.match.competitiveAsync.enabled, true);
    assert.equal(await ArenaMatchAttempt.countDocuments({ matchId: started.match._id }), 1);
    assert.equal(await ArenaMatchParticipantLock.countDocuments({ matchId: started.match._id, userId: ownerUserId }), 0);
    assert.equal((await ArenaCompetitiveRecord.findById(available._id).lean()).status, "RESERVED");
    const [startedAttempt, availableSnapshot] = await Promise.all([
      ArenaMatchAttempt.findOne({ matchId: started.match._id, userId: challengerUserId }).lean(),
      ArenaCompetitiveRecord.findById(available._id).lean(),
    ]);
    const startedPack = await ArenaProblemPack.findById(startedAttempt.problemPackId).select("+questions").lean();
    const exposedHashes = await priorExposedQuestionHashes(challengerUserId);
    for (const question of startedPack.questions) {
      assert.equal(exposedHashes.has(questionInstanceHash(question)), true,
        "questions already assigned to the challenger must enter the exposure set");
    }
    for (const hash of availableSnapshot.questionInstanceHashes) {
      assert.equal(exposedHashes.has(hash), true,
        "historical questions exposed by an async result must enter the exposure set");
    }
    await assert.rejects(
      () => forfeitArenaV2Match({
        matchId: started.match._id,
        userId: ownerUserId,
        now: new Date(now.getTime() + 600),
      }),
      (error) => error.status === 403 && error.code === "ARENA_ASYNC_FORFEIT_FORBIDDEN"
    );
    await cancelAsyncCompetitiveMatch({ matchId: started.match._id, userId: challengerUserId, reason: "AUDIT_START_ONLY" });
    assert.equal((await ArenaCompetitiveRecord.findById(available._id).lean()).status, "AVAILABLE");

    const ownerBefore = await ArenaCompetitiveProfile.findOne({ userId: ownerUserId }).lean();
    const first = await createFixture({
      suffix: "SETTLE",
      challengerUserId,
      ownerUserId,
      challengerRating: {
        rating: 1500,
        ratingDeviation: 200,
        volatility: 0.06,
        tier: "platinum",
      },
    });
    await assert.rejects(
      () => forfeitArenaV2Match({
        matchId: first.matchId,
        userId: challengerUserId,
        now: new Date(now.getTime() + 900),
      }),
      (error) => error.status === 409 && error.code === "ARENA_FORFEIT_NOT_ALLOWED"
    );
    const settled = await screenAndFinalizeAsyncCompetitiveMatch({
      matchId: first.matchId,
      userId: challengerUserId,
      now: new Date(now.getTime() + 1000),
    });
    assert.equal(settled.status, "SETTLED");
    assert.equal(settled.winnerRole, "CHALLENGER");
    assert.equal(settled.resultSnapshot.settlementSummary.historicalOpponentRatingChanged, false);
    const [challengerAfter, ownerAfter, reusedRecord, settlementRows, records] = await Promise.all([
      ArenaCompetitiveProfile.findOne({ userId: challengerUserId }).lean(),
      ArenaCompetitiveProfile.findOne({ userId: ownerUserId }).lean(),
      ArenaCompetitiveRecord.findById(first.recordId).lean(),
      ArenaRatingSettlement.countDocuments({ matchId: first.matchId }),
      ArenaCompetitiveRecord.find({ ownerUserId: challengerUserId }).lean(),
    ]);
    assert.ok(challengerAfter.rating > 1500, "challenger rating must update");
    assert.ok(challengerAfter.competitiveScore > 1500, "public competitive points must update separately");
    assert.equal(challengerAfter.competitiveMatchesCompleted, 1);
    assert.equal(challengerAfter.accountXp, 4);
    assert.equal(ownerAfter.rating, ownerBefore.rating, "historical owner rating must remain immutable");
    assert.equal(ownerAfter.competitiveScore, ownerBefore.competitiveScore, "historical owner points must remain immutable");
    assert.equal(ownerAfter.competitiveMatchesCompleted, ownerBefore.competitiveMatchesCompleted);
    assert.equal(reusedRecord.status, "AVAILABLE");
    assert.equal(reusedRecord.usageCount, 1);
    assert.equal(settlementRows, 1);
    assert.equal(records.length, 1, "valid clear challenger result must become one new record");
    const result = await getAsyncCompetitiveResult({ matchId: first.matchId, userId: ownerUserId });
    const viewedMatch = await ArenaMatch.findById(first.matchId).lean();
    assert.ok(viewedMatch.questionExposure.historicalOwnerLastShownAt instanceof Date);
    const viewedPack = await ArenaProblemPack.findById(viewedMatch.problemPackId).select("+questions").lean();
    const ownerExposure = await priorExposedQuestionHashes(ownerUserId);
    for (const question of viewedPack.questions) {
      assert.ok(ownerExposure.has(questionInstanceHash(question)),
        "the historical owner must exclude the challenger question actually returned in the result");
    }
    assert.equal(result.historicalOpponent.isViewer, true);
    assert.equal(result.challenger.isViewer, false);
    assert.equal(result.challenger.questions.length, 5);
    assert.equal(result.historicalOpponent.questions.length, 5);
    assert.equal(result.challenger.questions[0].submittedAnswer, "1");
    assert.equal(result.challenger.questions[4].submittedAnswer, "999");
    assert.equal(result.historicalOpponent.questions[0].submittedAnswer, "1");
    assert.equal(result.historicalOpponent.questions[4].submittedAnswer, "999");
    assert.notEqual(result.challenger.questions[0].prompt, result.historicalOpponent.questions[0].prompt);
    assert.equal("answer" in result.challenger.questions[0], false);
    assert.equal("solution" in result.historicalOpponent.questions[0], false);
    assert.equal("sourceCorrectRate" in result.challenger.questions[0], false);
    assert.equal("sourceCorrectRateLabel" in result.challenger.questions[0], false);
    assert.equal("performanceScoreZ" in result.challenger, false);
    assert.equal("scoringVersion" in result, false);
    assert.equal("closeScoreThreshold" in result, false);
    assert.match(result.challenger.solutions[0].href, /\/competitive-result\/evidence\/challenger\/1$/);
    await assert.rejects(
      () => getAsyncCompetitiveResult({ matchId: first.matchId, userId: outsiderUserId }),
      (error) => error.status === 403 && error.code === "ARENA_RESULT_FORBIDDEN"
    );
    assert.deepEqual([...(await priorExposedQuestionHashes(outsiderUserId))], []);
    const replayed = await Promise.all([
      settleAsyncCompetitiveMatch({ matchId: first.matchId }),
      settleAsyncCompetitiveMatch({ matchId: first.matchId }),
    ]);
    assert.ok(replayed.every((entry) => entry.replayed === true));
    assert.equal(await ArenaRatingSettlement.countDocuments({ matchId: first.matchId }), 1);

    const challengerCurrent = await ArenaCompetitiveProfile.findOne({ userId: challengerUserId }).lean();
    const second = await createFixture({
      suffix: "CANCEL",
      challengerUserId,
      ownerUserId,
      challengerRating: {
        rating: challengerCurrent.rating,
        ratingDeviation: challengerCurrent.ratingDeviation,
        volatility: challengerCurrent.volatility,
        tier: challengerCurrent.tier,
      },
    });
    await cancelAsyncCompetitiveMatch({
      matchId: second.matchId,
      userId: challengerUserId,
      reason: "START_DEADLINE_NO_SHOW",
    });
    const released = await ArenaCompetitiveRecord.findById(second.recordId).lean();
    const challengerAfterCancel = await ArenaCompetitiveProfile.findOne({ userId: challengerUserId }).lean();
    assert.equal(released.status, "AVAILABLE");
    assert.equal(challengerAfterCancel.rating, challengerCurrent.rating);
    assert.equal(await ArenaRatingSettlement.countDocuments({ matchId: second.matchId }), 0);

    const concurrent = await createFixture({
      suffix: "CONCURRENT",
      challengerUserId,
      ownerUserId,
      challengerRating: {
        rating: challengerAfterCancel.rating,
        ratingDeviation: challengerAfterCancel.ratingDeviation,
        volatility: challengerAfterCancel.volatility,
        tier: challengerAfterCancel.tier,
      },
    });
    await ArenaMatch.updateOne(
      { _id: concurrent.matchId },
      { $set: { integrityStatus: "CLEAR" } }
    );
    const concurrentResults = await Promise.all([
      settleAsyncCompetitiveMatch({ matchId: concurrent.matchId, now: new Date(now.getTime() + 2000) }),
      settleAsyncCompetitiveMatch({ matchId: concurrent.matchId, now: new Date(now.getTime() + 2000) }),
    ]);
    assert.equal(concurrentResults.filter((entry) => entry.replayed === false).length, 1);
    assert.equal(await ArenaRatingSettlement.countDocuments({ matchId: concurrent.matchId }), 1);

    const beforeReviewProfile = await ArenaCompetitiveProfile.findOne({ userId: challengerUserId }).lean();
    const held = await createFixture({
      suffix: "HELD-CLEAR",
      challengerUserId,
      ownerUserId,
      challengerRating: {
        rating: beforeReviewProfile.rating,
        ratingDeviation: beforeReviewProfile.ratingDeviation,
        volatility: beforeReviewProfile.volatility,
        tier: beforeReviewProfile.tier,
      },
    });
    await ArenaMatchAttempt.updateOne(
      { matchId: held.matchId, userId: challengerUserId },
      { $set: { questionTimings: [] } }
    );
    const heldResult = await screenAndFinalizeAsyncCompetitiveMatch({
      matchId: held.matchId,
      userId: challengerUserId,
      now: new Date(now.getTime() + 3000),
    });
    assert.equal(heldResult.status, "HELD");
    const reviewed = await reviewHeldArenaV2Match({
      matchId: held.matchId,
      adminUserId: outsiderUserId,
      decision: "CLEAR",
      note: "격리 감사에서 원본 풀이와 시간 기록을 확인했습니다.",
      now: new Date(now.getTime() + 4000),
    });
    assert.equal(reviewed.status, "SETTLED");
    assert.equal(await ArenaRatingSettlement.countDocuments({ matchId: held.matchId }), 1);

    console.log("GOAT Arena 2.1 async competitive DB audit passed.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
