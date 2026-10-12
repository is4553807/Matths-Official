"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { AdminActionLog, AdminTodo, User, UserNotification } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const {
  getAdminArenaV2Audit,
  getAdminArenaV2Overview,
  reviewNormalRecordIntegrity,
} = require("../services/adminArenaV2Service");

const now = new Date("2026-10-11T03:00:00.000Z");

function recordInput(ownerUserId, suffix) {
  return {
    recordMode: "NORMAL",
    ownerUserId,
    sourceMatchId: new mongoose.Types.ObjectId(),
    sourceAttemptId: new mongoose.Types.ObjectId(),
    sourceEvidenceId: new mongoose.Types.ObjectId(),
    sourceProblemPackId: new mongoose.Types.ObjectId(),
    ratingSnapshot: {
      rating: 1000,
      ratingDeviation: 200,
      volatility: 0.06,
      tier: "GOLD",
    },
    performance: { correctCount: 3, totalSolveTimeMs: 420000 },
    questionInstanceHashes: Array.from({ length: 5 }, (_, index) => `${suffix}-Q${index + 1}`),
    status: "REVIEW_REQUIRED",
    recordLabel: "일반전 과거 기록",
    consentVersion: "ARENA_NORMAL_SOLUTION_SHARE_V1",
    verifiedAt: now,
    integrityFlags: ["FAST_COMPLETION_UNDER_FIVE_MINUTES"],
    usageCount: 0,
  };
}

async function todoFor(record, userId) {
  return AdminTodo.create({
    category: "integrity",
    title: "일반전 과거 기록 풀 검토 필요",
    description: "사용자 결과는 확정했고 기록만 격리했습니다.",
    href: "/admin/arena-policies#normal-record-review",
    targetUserId: userId,
    actorUserId: userId,
    sourceType: "ArenaNormalRecordIntegrityReview",
    sourceId: record._id,
    status: "pending",
    metadata: { recordId: String(record._id), penaltyApplied: false },
  });
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([
      ArenaCompetitiveRecord.init(),
      ArenaRatingSettlement.init(),
    ]);
    const passwordHash = "$2b$10$audit.only.hash.not.used.for.authentication";
    const [admin, firstUser, secondUser] = await User.create([
      { name: "arena-admin", email: "arena-admin@example.test", passwordHash, role: "admin", accountStatus: "active", isActive: true },
      { name: "normal-review-one", email: "normal-review-one@example.test", passwordHash, role: "student", accountStatus: "active", isActive: true, warningCount: 0 },
      { name: "normal-review-two", email: "normal-review-two@example.test", passwordHash, role: "student", accountStatus: "active", isActive: true, warningCount: 0 },
    ]);
    await ArenaCompetitiveProfile.create([
      {
        userId: firstUser._id,
        normalMatchesCompleted: 3,
        placementFinalizedAt: now,
        ratingInitializedAt: now,
        rating: 1500,
        ratingDeviation: 180,
        volatility: 0.06,
        competitiveScore: 1500,
        scoreInitializedAt: now,
        tier: "MASTER",
      },
      {
        userId: secondUser._id,
        normalMatchesCompleted: 3,
        placementFinalizedAt: now,
        ratingInitializedAt: now,
        rating: 1480,
        ratingDeviation: 180,
        volatility: 0.06,
        competitiveScore: 1490,
        scoreInitializedAt: now,
        tier: "MASTER",
      },
    ]);
    const [approveRecord, rejectRecord] = await ArenaCompetitiveRecord.create([
      recordInput(firstUser._id, "APPROVE"),
      recordInput(secondUser._id, "REJECT"),
    ]);
    await Promise.all([
      todoFor(approveRecord, firstUser._id),
      todoFor(rejectRecord, secondUser._id),
    ]);

    await ArenaRatingSettlement.create([
      {
        matchId: new mongoose.Types.ObjectId(),
        mode: "COMPETITIVE",
        outcome: "CHALLENGER_WIN",
        challenger: {
          rating: { before: 1500, delta: 5, after: 1505 },
          competitiveScore: { before: 1500, delta: 16, after: 1516 },
        },
        defender: {},
        settledAt: new Date(now.getTime() - 1000),
      },
      {
        matchId: new mongoose.Types.ObjectId(),
        mode: "COMPETITIVE",
        outcome: "DEFENDER_WIN",
        challenger: {
          rating: { before: 1500, delta: -3, after: 1497 },
          competitiveScore: { before: 1500, delta: -16, after: 1484 },
        },
        defender: {},
        settledAt: now,
      },
    ]);

    const before = await getAdminArenaV2Overview({ now: new Date(now.getTime() + 1000) });
    assert.equal(before.normalRecordReviewQueue.length, 2);
    assert.equal(before.records.NORMAL.REVIEW_REQUIRED, 2);
    assert.equal(before.oneSidedRatingHealth.settlementCount, 2);
    assert.equal(before.oneSidedRatingHealth.netMmrDelta, 2);
    assert.equal(before.oneSidedRatingHealth.averageMmrDelta, 1);
    assert.equal(before.oneSidedRatingHealth.status, "WITHIN_THRESHOLD");
    assert.equal(before.oneSidedRatingHealth.netScoreDelta, 0);

    const approved = await reviewNormalRecordIntegrity({
      recordId: approveRecord._id,
      adminUserId: admin._id,
      decision: "APPROVE",
      note: "원본 풀이와 제출 시간을 확인해 정상 기록으로 승인했습니다.",
      now: new Date(now.getTime() + 2000),
    });
    assert.deepEqual(approved, {
      recordId: String(approveRecord._id),
      status: "AVAILABLE",
      userPenaltyApplied: false,
      emailSent: false,
    });
    const replay = await reviewNormalRecordIntegrity({ recordId: approveRecord._id, adminUserId: admin._id,
      decision: "APPROVE", note: "원본 풀이와 제출 시간을 확인해 정상 기록으로 승인했습니다.", now: new Date(now.getTime() + 2500) });
    assert.equal(replay.replayed, true);
    await assert.rejects(reviewNormalRecordIntegrity({ recordId: approveRecord._id, adminUserId: admin._id,
      decision: "REJECT", note: "다른 결정", now }), (error) => error.status === 409);
    const rejected = await reviewNormalRecordIntegrity({
      recordId: rejectRecord._id,
      adminUserId: admin._id,
      decision: "REJECT",
      note: "검토 결과 상대 기록 풀에 사용할 수 없는 기록으로 판단했습니다.",
      now: new Date(now.getTime() + 3000),
    });
    assert.equal(rejected.status, "INVALID");
    assert.equal(rejected.userPenaltyApplied, false);
    assert.equal(rejected.emailSent, false);

    assert.equal((await ArenaCompetitiveRecord.findById(approveRecord._id).lean()).status, "AVAILABLE");
    assert.equal((await ArenaCompetitiveRecord.findById(rejectRecord._id).lean()).status, "INVALID");
    assert.equal(await AdminTodo.countDocuments({
      sourceType: "ArenaNormalRecordIntegrityReview",
      status: "completed",
    }), 2);
    assert.equal(await AdminActionLog.countDocuments({
      action: { $in: ["arena.normal_record.approved", "arena.normal_record.rejected"] },
    }), 2);
    assert.equal((await User.findById(firstUser._id).lean()).warningCount, 0);
    assert.equal((await User.findById(secondUser._id).lean()).warningCount, 0);
    assert.equal(await UserNotification.countDocuments({
      userId: { $in: [firstUser._id, secondUser._id] },
    }), 0);

    const after = await getAdminArenaV2Overview({ now: new Date(now.getTime() + 4000) });
    assert.equal(after.normalRecordReviewQueue.length, 0);
    assert.equal(after.records.NORMAL.AVAILABLE, 1);
    assert.equal(after.records.NORMAL.INVALID, 1);
    const audit = await getAdminArenaV2Audit({ now: new Date(now.getTime() + 4000) });
    assert.equal(audit.issues.find((issue) => issue.key === "NORMAL_RECORD_INTEGRITY_REVIEW")?.count || 0, 0);

    console.log("Arena current admin operations DB audit passed: rating-health metrics and penalty-free normal-record review.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
