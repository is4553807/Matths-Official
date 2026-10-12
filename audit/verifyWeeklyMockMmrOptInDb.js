"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { PrivateMockExamAttempt } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaWeeklyMockRatingSettlement,
} = require("../models/goatArenaModel");
const { processWeeklyExamMmr } = require("../services/mmrService");

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([
      ArenaCompetitiveProfile.init(),
      ArenaWeeklyMockRatingSettlement.init(),
    ]);

    const participantUserId = new mongoose.Types.ObjectId();
    const nonParticipantUserId = new mongoose.Types.ObjectId();
    const examId = new mongoose.Types.ObjectId();
    const attemptId = new mongoose.Types.ObjectId();
    const now = new Date("2026-10-11T12:00:00.000Z");
    const placedProfile = (userId) => ({
      userId,
      normalMatchesCompleted: 3,
      placementFinalizedAt: new Date("2026-10-01T00:00:00.000Z"),
      ratingInitializedAt: new Date("2026-10-01T00:00:00.000Z"),
      rating: 1500,
      ratingDeviation: 200,
      volatility: 0.06,
      competitiveScore: 1500,
      scoreInitializedAt: new Date("2026-10-01T00:00:00.000Z"),
      tier: "MASTER",
    });
    await ArenaCompetitiveProfile.create([
      placedProfile(participantUserId),
      placedProfile(nonParticipantUserId),
    ]);
    await PrivateMockExamAttempt.collection.insertOne({
      _id: attemptId,
      examId,
      userId: participantUserId,
      weekKey: "2026-W41",
      attemptNumber: 1,
      formCode: "CUSTOM",
      status: "submitted",
      score: 90,
      createdAt: now,
      updatedAt: now,
    });

    const input = {
      exam: { _id: examId, weekKey: "2026-W41", points: [3, 4] },
      attempts: [],
      seriesEntries: [{
        representativeAttempt: {
          _id: attemptId,
          userId: participantUserId,
          status: "submitted",
        },
        rawScore: 90,
        totalPercentile: 0.9,
        advancedPercentile: 0.9,
        consistencyScore: 0.9,
        mmrPerformance: 0.9,
      }],
      now,
    };

    const result = await processWeeklyExamMmr(input);
    assert.deepEqual(result, {
      updated: 1,
      absent: 0,
      skippedUnplaced: 0,
      publicScoreChanges: 0,
    });

    const participant = await ArenaCompetitiveProfile.findOne({ userId: participantUserId }).lean();
    const nonParticipant = await ArenaCompetitiveProfile.findOne({ userId: nonParticipantUserId }).lean();
    assert.ok(participant.rating > 1500, "높은 주간 성과는 응시자의 내부 MMR에 반영되어야 합니다.");
    assert.equal(participant.competitiveScore, 1500, "주간 모의고사는 공개 경쟁전 점수를 바꾸면 안 됩니다.");
    assert.equal(participant.tier, "MASTER", "주간 모의고사는 공개 티어를 바꾸면 안 됩니다.");
    assert.equal(nonParticipant.rating, 1500, "미응시자의 내부 MMR은 유지되어야 합니다.");
    assert.equal(nonParticipant.competitiveScore, 1500, "미응시자의 공개 점수도 유지되어야 합니다.");
    assert.equal(await ArenaWeeklyMockRatingSettlement.countDocuments({
      userId: participantUserId,
      weekKey: "2026-W41",
    }), 1);

    await processWeeklyExamMmr(input);
    const retried = await ArenaCompetitiveProfile.findOne({ userId: participantUserId }).lean();
    assert.equal(retried.rating, participant.rating, "동일 주차 재처리는 내부 MMR을 중복 변경하면 안 됩니다.");
    assert.equal(retried.competitiveScore, 1500);

    const corrected = {
      ...input,
      seriesEntries: [{ ...input.seriesEntries[0], mmrPerformance: 0.7 }],
      now: new Date("2026-10-11T13:00:00.000Z"),
    };
    await processWeeklyExamMmr(corrected);
    const afterCorrection = await ArenaCompetitiveProfile.findOne({ userId: participantUserId }).lean();
    assert.ok(afterCorrection.rating < participant.rating, "정정은 기존 주차 정산과의 차이만 보정해야 합니다.");
    assert.equal(afterCorrection.competitiveScore, 1500);
    assert.equal(await ArenaWeeklyMockRatingSettlement.countDocuments({
      userId: participantUserId,
      weekKey: "2026-W41",
    }), 1);

    console.log("Weekly mock internal-MMR verification passed: participant-only updates, public-score isolation, retry idempotency, and correction deltas.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
