"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { AdminTodo, User, UserNotification } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaNormalBaselineAssignment,
  ArenaNormalBaselineQuestion,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  getAsyncNormalResult,
  settleAsyncNormalMatch,
  startAsyncNormalMatch,
} = require("../services/arenaAsyncNormalService");
const {
  buildNormalBaselineCaptureManifest,
} = require("../services/arenaNormalBaselineQuestionService");

function solutionFile(question, index) {
  return {
    originalName: question.expectedSolutionFileName,
    storedName: `${question.questionInstanceHash}-${index}.png`,
    mimeType: "image/png",
    sizeBytes: 1024,
    sha256: String(index + 1).padStart(64, "a").slice(-64),
    storageProvider: "R2",
    storagePurpose: "ARENA_BASELINE_SOLUTION",
    r2ObjectKey: `arena/baseline/${question.expectedSolutionFileName}`,
    r2Sha256: String(index + 1).padStart(64, "a").slice(-64),
    r2ETag: `baseline-${index + 1}`,
  };
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  const now = new Date("2026-10-11T12:00:00.000+09:00");
  const challengerUserId = new mongoose.Types.ObjectId();
  const operatorUserId = new mongoose.Types.ObjectId();
  try {
    await User.collection.insertMany([
      {
        _id: challengerUserId,
        name: "baseline-challenger",
        nameNormalized: "baseline-challenger",
        email: "baseline-challenger@example.com",
        role: "student",
        accountStatus: "active",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: operatorUserId,
        name: "baseline-operator",
        nameNormalized: "baseline-operator",
        email: "baseline-operator@example.com",
        role: "admin",
        accountStatus: "active",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await ArenaCompetitiveProfile.create({
      userId: challengerUserId,
      normalMatchmakingRating: 1000,
      normalMatchmakingRatingDeviation: 350,
      normalMatchmakingVolatility: 0.06,
    });

    const manifest = buildNormalBaselineCaptureManifest();
    const drafts = manifest.questions
      .filter((question) => question.difficultyCode === "U3")
      .map((question, index) => ({
        ...question,
        status: "ACTIVE",
        calibrationStatus: "SIMULATION_APPROVED",
        createdByUserId: operatorUserId,
        reviewedByUserId: operatorUserId,
        reviewedAt: now,
        activatedAt: now,
        solutionEvidenceFile: solutionFile(question, index),
      }));
    assert.equal(drafts.length, 7);
    await ArenaNormalBaselineQuestion.create(drafts);

    const started = await startAsyncNormalMatch({ userId: challengerUserId, now });
    assert.equal(started.baseline, true);
    assert.equal(started.match.normalAsync.baselineQuestionIds.length, 5);
    assert.equal(started.match.normalAsync.historicalRecordId, null);
    assert.equal(
      await ArenaNormalBaselineAssignment.countDocuments({ matchId: started.match._id }),
      1
    );

    const attempt = await ArenaMatchAttempt.findOne({
      matchId: started.match._id,
      userId: challengerUserId,
    });
    const pack = await ArenaProblemPack.findById(attempt.problemPackId)
      .select("+questions")
      .lean();
    attempt.status = "SUBMITTED";
    attempt.answers = pack.questions.map((question) => ({
      questionKey: question.questionKey,
      value: String(question.answer),
      revision: 1,
      lastChangedAt: now,
    }));
    attempt.questionTimings = pack.questions.map((question, index) => ({
      questionKey: question.questionKey,
      startedAt: new Date(now.getTime() + index * 60_000),
      completedAt: new Date(now.getTime() + (index + 1) * 60_000),
      responseTimeMs: 60_000,
    }));
    attempt.activeSolveTimeMs = 5 * 60_000;
    attempt.submittedAt = new Date(now.getTime() + 5 * 60_000);
    await attempt.save();
    await ArenaMatchEvidence.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      attemptId: attempt._id,
      matchId: started.match._id,
      userId: challengerUserId,
      files: pack.questions.map((question, index) => ({
        originalName: `challenger-${index + 1}.png`,
        storedName: `challenger-${index + 1}.png`,
        mimeType: "image/png",
        sizeBytes: 1024,
        sha256: String(index + 11).padStart(64, "b").slice(-64),
        storageProvider: "R2",
        storagePurpose: "USER_ARENA_EVIDENCE",
        r2ObjectKey: `arena/evidence/${started.match._id}/${question.questionKey}.png`,
        r2Sha256: String(index + 11).padStart(64, "b").slice(-64),
        r2ETag: `challenger-${index + 1}`,
      })),
      originalEvidenceSubmitted: true,
      submittedAt: attempt.submittedAt,
      status: "PENDING",
      sourceRiskFlags: ["SHOULD_BE_CLEARED_FOR_GENERAL"],
      anomalyFlags: ["SHOULD_BE_CLEARED_FOR_GENERAL"],
      createdAt: now,
      updatedAt: now,
    });
    await ArenaMatch.updateOne(
      { _id: started.match._id },
      { $set: { status: "SUBMITTED", integrityStatus: "PENDING" } }
    );

    const settled = await settleAsyncNormalMatch({
      matchId: started.match._id,
      userId: challengerUserId,
      now: new Date(now.getTime() + 6 * 60_000),
    });
    assert.equal(settled.settled, true);
    const profile = await ArenaCompetitiveProfile.findOne({
      userId: challengerUserId,
    }).lean();
    assert.equal(profile.normalRatedMatchesCompleted, 1);
    assert.notEqual(profile.normalMatchmakingRating, 1000);
    assert.ok(profile.normalMatchmakingRatingDeviation < 350);
    assert.ok(Number.isFinite(profile.normalMatchmakingVolatility));
    const evidence = await ArenaMatchEvidence.findOne({
      matchId: started.match._id,
    }).lean();
    assert.deepEqual(evidence.sourceRiskFlags, ["SHOULD_BE_CLEARED_FOR_GENERAL"]);
    assert.ok(evidence.anomalyFlags.includes("SHOULD_BE_CLEARED_FOR_GENERAL"));
    assert.equal(evidence.status, "ANOMALY_FLAGGED");
    assert.equal((await ArenaMatch.findById(started.match._id).lean()).integrityStatus, "SUSPICIOUS");
    const quarantinedRecord = await ArenaCompetitiveRecord.findOne({
      sourceMatchId: started.match._id,
      ownerUserId: challengerUserId,
    }).lean();
    assert.equal(quarantinedRecord.status, "REVIEW_REQUIRED");
    assert.ok(await AdminTodo.exists({
      sourceType: "ArenaNormalRecordIntegrityReview",
      sourceId: quarantinedRecord._id,
      status: "pending",
    }));
    assert.equal(Number((await User.findById(challengerUserId).lean()).warningCount || 0), 0);
    assert.equal(await UserNotification.countDocuments({ userId: challengerUserId }), 0);
    const assignment = await ArenaNormalBaselineAssignment.findOne({
      matchId: started.match._id,
    }).lean();
    assert.equal(assignment.sequence, 1);
    assert.ok(assignment.settledAt);

    const result = await getAsyncNormalResult({
      matchId: started.match._id,
      userId: challengerUserId,
    });
    assert.equal(result.firstRecord, false);
    assert.equal(result.historicalOpponent.questions.length, 5);
    assert.equal(result.historicalOpponent.solutions.length, 5);
    assert.ok(result.historicalOpponent.questions.every((question) => question.submittedAnswer));
    assert.equal(result.historicalOpponent.user.id, null);
    assert.equal(result.officialAnswersIncluded, false);
    const viewedMatch = await ArenaMatch.findById(started.match._id).lean();
    assert.ok(viewedMatch.questionExposure.challengerLastShownAt instanceof Date);
    assert.ok(viewedMatch.questionExposure.resultQuestionHashes.length >= 10);
    assert.ok(viewedMatch.normalAsync.opponentQuestionInstanceHashes.length >= 5);
    await assert.rejects(
      getAsyncNormalResult({ matchId: started.match._id, userId: operatorUserId }),
      (error) => error?.status === 403 && error?.code === "ARENA_RESULT_FORBIDDEN"
    );

    console.log(
      "Normal baseline runtime DB verified: active per-question records form a five-question opponent, settle hidden adaptive rating without user penalty, quarantine a flagged record for operator review, preserve solution/answer result detail, and exclude the operator from participant access."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
