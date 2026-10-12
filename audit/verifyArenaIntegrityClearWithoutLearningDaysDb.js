"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
} = require("../models/goatArenaModel");
const {
  AdminActionLog,
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  reviewHeldArenaV2Match,
} = require("../services/arenaV2IntegrityReviewAdapter");

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "This audit may only run against the isolated memory database."
  );
  await mongoose.connect(process.env.DB);
  const now = new Date("2026-10-11T03:00:00.000Z");
  try {
    const [admin, challenger, defender] = await User.create([
      {
        name: "integrity-admin-no-cycle",
        email: "integrity-admin-no-cycle@example.test",
        passwordHash: "audit-only",
        role: "admin",
        accountStatus: "active",
        isActive: true,
      },
      {
        name: "integrity-challenger-no-cycle",
        email: "integrity-challenger-no-cycle@example.test",
        passwordHash: "audit-only",
        role: "student",
        accountStatus: "active",
        isActive: true,
      },
      {
        name: "integrity-defender-no-cycle",
        email: "integrity-defender-no-cycle@example.test",
        passwordHash: "audit-only",
        role: "student",
        accountStatus: "active",
        isActive: true,
      },
    ]);
    const matchId = new mongoose.Types.ObjectId();
    const challengerAttemptId = new mongoose.Types.ObjectId();
    const defenderAttemptId = new mongoose.Types.ObjectId();
    await ArenaAccessState.create([
      {
        userId: challenger._id,
        integrityStatus: "REVIEW_REQUIRED",
        defensePoolEligible: false,
        reasonCode: "MATCH_INTEGRITY_REVIEW",
      },
      {
        userId: defender._id,
        integrityStatus: "REVIEW_REQUIRED",
        defensePoolEligible: false,
        reasonCode: "MATCH_INTEGRITY_REVIEW",
      },
    ]);
    await ArenaMatch.collection.insertOne({
      _id: matchId,
      matchKey: `AUDIT-INTEGRITY-NO-CYCLE:${matchId}`,
      arenaVersion: "2.0",
      gameMode: "NORMAL",
      division: "SUB",
      seasonKey: "2026-10",
      competitivePool: "ALL",
      matchType: "NORMAL",
      matchOrigin: "ARENA_2_MATCHMAKING",
      requestInitiatorUserId: challenger._id,
      tierPairKey: "BRONZE_SILVER",
      tierPairLabel: "브론즈-실버",
      challenger: { userId: challenger._id },
      defender: { userId: defender._id },
      status: "HELD",
      policyVersionCode: "AUDIT-NO-LEARNING-DAYS",
      problemPackVersion: "AUDIT-PACK",
      scoringVersion: "AUDIT-SCORE",
      startDeadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
      integrityStatus: "SUSPICIOUS",
      integrityScreenedRole: "CHALLENGER",
      integrityReviewStartedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      integrityReviewDeadlineAt: new Date(now.getTime() + 21 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });
    await ArenaMatchAttempt.collection.insertMany([
      {
        _id: challengerAttemptId,
        matchId,
        userId: challenger._id,
        role: "CHALLENGER",
        status: "SUBMITTED",
        answers: [{ questionKey: "Q1", value: "1" }],
        activeSolveTimeMs: 120000,
        currentQuestionIndex: 5,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: defenderAttemptId,
        matchId,
        userId: defender._id,
        role: "DEFENDER",
        status: "READY",
        answers: [],
        currentQuestionIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await ArenaMatchEvidence.collection.insertOne({
      attemptId: challengerAttemptId,
      matchId,
      userId: challenger._id,
      files: [{
        originalName: "solution.png",
        storedName: "solution.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
        storageProvider: "CLOUDINARY",
        storagePurpose: "USER_ARENA_EVIDENCE",
      }],
      originalEvidenceSubmitted: true,
      submittedAt: now,
      status: "ANOMALY_FLAGGED",
      anomalyFlags: ["FAST_COMPLETION_UNDER_FIVE_MINUTES"],
      screenedAsWinner: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await reviewHeldArenaV2Match({
      matchId,
      adminUserId: admin._id,
      decision: "CLEAR",
      note: "풀이 원본과 답안을 확인했으며 이상이 없습니다.",
      now,
    });
    assert.equal(result.decision, "CLEAR");
    assert.equal(result.status, "IN_PROGRESS");

    const [match, challengerAccess, defenderAccess, notice] = await Promise.all([
      ArenaMatch.findById(matchId).lean(),
      ArenaAccessState.findOne({ userId: challenger._id }).lean(),
      ArenaAccessState.findOne({ userId: defender._id }).lean(),
      UserNotification.findOne({
        dedupeKey: `arena2-integrity-review-result:${matchId}:CLEAR:${challenger._id}`,
      }).lean(),
    ]);
    assert.equal(match.integrityStatus, "CLEAR");
    assert.equal(challengerAccess.integrityStatus, "CLEAR");
    assert.equal(defenderAccess.integrityStatus, "CLEAR");
    assert.ok(notice);
    assert.doesNotMatch(notice.message, /연장|이용 기간 보상/);
    assert.equal(await AdminActionLog.countDocuments({
      action: "arena.integrity.match.cleared",
      "metadata.matchId": String(matchId),
    }), 2);
    console.log("Arena integrity CLEAR without learning-day cycles audit passed");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
