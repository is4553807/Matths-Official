"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const {
  AdminActionLog,
  AdminTodo,
  AssessmentAttempt,
  User,
} = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaPlacementAttemptAdjustment,
  ArenaProblemPack,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const {
  placementBudget,
  recordPlacementServerFailure,
  resetExhaustedArenaPlacements,
} = require("../services/arenaPlacementPolicyService");
const {
  competitiveUnlockState,
  ensureArenaV2Profile,
  profileView,
} = require("../services/arenaV2ProfileService");
const { createPlacementAttempt } = require("../services/placementExamService");
const { joinArenaV2Queue } = require("../services/arenaV2MatchmakingService");
const { forfeitArenaV2Match } = require("../services/arenaV2SettlementService");
const { settleAsyncNormalMatch } = require("../services/arenaAsyncNormalService");
const { submitArenaMatchEvidence } = require("../services/arenaMatchEvidenceService");
const {
  advanceArenaMatchQuestion,
  startArenaMatchAttempt,
} = require("../services/arenaMatchAttemptService");
const { SCORING_VERSION } = require("../services/arenaCompetitiveScoringService");

async function placement(userId, index, status) {
  const row = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    paperId: `POLICY-${userId}-${index}`,
    scopeType: "placement",
    placementPurpose: "INITIAL",
    placementContextKey: `ARENA2:PLACEMENT:${index}`,
    status,
    scorePercent: 70,
    placementResult: { placementScore: 70 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (status === "submitted") row.submittedAt = new Date();
  await AssessmentAttempt.collection.insertOne(row);
  return row;
}

async function seedNormalBaseline(ownerUserId, now) {
  const sourceMatchId = new mongoose.Types.ObjectId();
  const sourceAttemptId = new mongoose.Types.ObjectId();
  const sourceEvidenceId = new mongoose.Types.ObjectId();
  const sourceProblemPackId = new mongoose.Types.ObjectId();
  const questions = Array.from({ length: 5 }, (_, index) => ({
    questionKey: `Q${index + 1}`,
    prompt: `AUDIT BASELINE ${index + 1}`,
    answer: String(index + 1),
    points: 20,
  }));
  await ArenaProblemPack.collection.insertOne({
    _id: sourceProblemPackId,
    version: `AUDIT-NORMAL-BASELINE-${sourceProblemPackId}`,
    questions,
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatchAttempt.collection.insertOne({
    _id: sourceAttemptId,
    matchId: sourceMatchId,
    userId: ownerUserId,
    role: "CHALLENGER",
    problemPackId: sourceProblemPackId,
    status: "SUBMITTED",
    answers: questions.map((question, index) => ({
      questionKey: question.questionKey,
      value: index < 3 ? question.answer : "0",
    })),
    activeSolveTimeMs: 420000,
    submittedAt: now,
  });
  await ArenaMatchEvidence.collection.insertOne({
    _id: sourceEvidenceId,
    matchId: sourceMatchId,
    attemptId: sourceAttemptId,
    userId: ownerUserId,
    originalEvidenceSubmitted: true,
    submittedAt: now,
    files: [{
      originalName: "baseline.png",
      storedName: `audit-baseline-${sourceEvidenceId}.png`,
      mimeType: "image/png",
      sizeBytes: 32768,
      sha256: createHash("sha256").update(String(sourceEvidenceId)).digest("hex"),
    }],
  });
  await ArenaCompetitiveRecord.create({
    recordMode: "NORMAL",
    ownerUserId,
    sourceMatchId,
    sourceAttemptId,
    sourceEvidenceId,
    sourceProblemPackId,
    ratingSnapshot: { rating: 1000, ratingDeviation: 350, volatility: 0.06, tier: "GOLD" },
    performance: {
      scoringVersion: SCORING_VERSION,
      observations: [],
      correctCount: 3,
      expectedCorrect: 2.5,
      variance: 1,
      z: 0.5,
      totalSolveTimeMs: 420000,
    },
    questionInstanceHashes: questions.map((_, index) => `audit-baseline-${index + 1}`),
    status: "AVAILABLE",
    isBaseline: true,
    recordLabel: "감사 테스트 일반전 기준 기록",
    consentVersion: "ARENA_NORMAL_SOLUTION_SHARE_V1",
    verifiedAt: now,
  });
}

async function main() {
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([
      ArenaPlacementAttemptAdjustment.init(),
      ArenaCompetitiveProfile.init(),
      AssessmentAttempt.init(),
      AdminTodo.init(),
    ]);

    const [admin, blocked, failed, exhausted, sundayA, sundayB, baselineOwner] =
      Array.from({ length: 7 }, () => new mongoose.Types.ObjectId());
    const users = [admin, blocked, failed, exhausted, sundayA, sundayB, baselineOwner];
    await User.collection.insertMany(users.map((id, index) => ({
      _id: id,
      name: `policy-${index}`,
      nameNormalized: `policy-${index}`,
      role: index === 0 ? "admin" : "student",
      accountStatus: "active",
      isActive: true,
      email: `policy-${index}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })));
    await ArenaCompetitiveProfile.create([
      { userId: blocked, normalMatchesCompleted: 2 },
      { userId: failed, normalMatchesCompleted: 3 },
      { userId: exhausted, normalMatchesCompleted: 3 },
    ]);

    assert.equal(profileView(await ensureArenaV2Profile(blocked)).canTakePlacement, false);
    await assert.rejects(
      createPlacementAttempt({ userId: blocked }),
      (error) => error.status === 403 && error.code === "PLACEMENT_NORMAL_MATCHES_REQUIRED"
    );
    await ArenaCompetitiveProfile.updateOne({ userId: blocked }, { $set: { normalMatchesCompleted: 3 } });
    assert.equal(profileView(await ensureArenaV2Profile(blocked)).canTakePlacement, true);
    const eligibleAttempt = await createPlacementAttempt({ userId: blocked });
    await AssessmentAttempt.updateOne({ _id: eligibleAttempt._id }, { $set: { status: "abandoned" } });
    assert.equal((await placementBudget(blocked)).attemptsUsed, 1);

    const failedAttempt = await placement(failed, 1, "submitted");
    await recordPlacementServerFailure({
      userId: failed,
      attemptId: failedAttempt._id,
      error: new Error("injected finalization failure"),
    });
    assert.equal((await placementBudget(failed)).attemptsUsed, 0);
    assert.equal(await ArenaPlacementAttemptAdjustment.countDocuments({ userId: failed, kind: "SERVER_ERROR" }), 1);

    for (let index = 1; index <= 5; index += 1) {
      await placement(exhausted, index, index % 2 ? "abandoned" : "disqualified");
    }
    assert.equal((await placementBudget(exhausted)).reviewRequired, true);
    await assert.rejects(
      createPlacementAttempt({ userId: exhausted }),
      (error) => error.code === "PLACEMENT_OPERATOR_REVIEW_REQUIRED"
    );
    const resetArgs = {
      userId: exhausted,
      adminUserId: admin,
      requestId: "reset-1",
      reason: "Operator reviewed five unusable attempts.",
    };
    const reset = await Promise.all([
      resetExhaustedArenaPlacements(resetArgs),
      resetExhaustedArenaPlacements(resetArgs),
    ]);
    assert.equal(reset.filter((result) => !result.replayed).length, 1);
    assert.equal(await AdminActionLog.countDocuments({
      targetUserId: exhausted,
      action: "arena.placement.authorized_reset",
    }), 1);
    assert.equal((await placementBudget(exhausted)).attemptsUsed, 0);

    const sunday = new Date("2026-10-11T22:00:00+09:00");
    await seedNormalBaseline(baselineOwner, sunday);
    const match = (await joinArenaV2Queue({ userId: sundayA, mode: "NORMAL", now: sunday })).match;
    assert.equal(match.normalAsync.matchmakingRating, 1000);
    const pack = await ArenaProblemPack.findById(match.problemPackId).select("+questions").lean();
    await startArenaMatchAttempt({
      matchId: match._id,
      userId: sundayA,
      requestId: "POLICY-SUNDAY-START",
      now: sunday,
    });
    for (let index = 0; index < 5; index += 1) {
      await advanceArenaMatchQuestion({
        matchId: match._id,
        userId: sundayA,
        requestId: `POLICY-SUNDAY-QUESTION-${index}`,
        value: String(pack.questions[index].answerKey?.correctAnswer ?? pack.questions[index].answer),
        now: new Date(sunday.getTime() + (index + 1) * 70000),
      });
    }
    const evidenceAt = new Date(sunday.getTime() + 351000);
    const preparedEvidenceFiles = Array.from({ length: 5 }, (_, index) => ({
      originalName: `solution-${index}.png`,
      storedName: `policy-${sundayA}-${index}.png`,
      sizeBytes: 32768,
      mimeType: "image/png",
      questionSlot: index + 1,
      sha256: createHash("sha256").update(`${sundayA}:${index}`).digest("hex"),
    }));
    await submitArenaMatchEvidence({
      matchId: match._id,
      userId: sundayA,
      preparedEvidenceFiles,
      files: [],
      receivedAt: evidenceAt,
      now: evidenceAt,
    });
    await assert.rejects(
      forfeitArenaV2Match({ matchId: match._id, userId: sundayA, now: evidenceAt }),
      (error) => error.code === "ARENA_FORFEIT_AFTER_SUBMISSION"
    );
    const settled = await Promise.all([
      settleAsyncNormalMatch({ matchId: match._id, userId: sundayA, now: evidenceAt }),
      settleAsyncNormalMatch({ matchId: match._id, userId: sundayA, now: evidenceAt }),
    ]);
    assert.equal(settled.filter((result) => !result.replayed).length, 1);
    const profile = await ArenaCompetitiveProfile.findOne({ userId: sundayA }).lean();
    assert.ok(profile.normalMatchmakingRating > 1000);
    assert.equal(profile.normalMatchesCompleted, 1);
    assert.equal(profile.rating, null);
    assert.equal(await ArenaMatchParticipantLock.countDocuments({ matchId: match._id }), 0);

    const forfeitedMatch = (await joinArenaV2Queue({
      userId: sundayB,
      mode: "NORMAL",
      now: new Date(evidenceAt.getTime() + 1000),
    })).match;
    await forfeitArenaV2Match({
      matchId: forfeitedMatch._id,
      userId: sundayB,
      now: new Date(evidenceAt.getTime() + 2000),
    });
    const forfeitedProfile = await ArenaCompetitiveProfile.findOne({ userId: sundayB }).lean();
    assert.ok(forfeitedProfile.normalMatchmakingRating < 1000);
    assert.equal(forfeitedProfile.normalMatchesCompleted, 0);
    assert.ok(await ArenaRatingSettlement.exists({
      matchId: forfeitedMatch._id,
      mode: "NORMAL",
      outcome: "DEFENDER_WIN",
    }));
    assert.equal(competitiveUnlockState(forfeitedProfile).unlocked, false);

    console.log("Arena product decisions DB verification passed: unlock, placement recovery, authorized reset, Sunday gameplay, idempotent settlement, and forfeit boundaries.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
