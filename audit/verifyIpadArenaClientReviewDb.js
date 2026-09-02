const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ArenaMatchEvidence,
} = require("../models/goatArenaModel");
const {
  attachArenaClientReview,
} = require("../services/arenaClientEvidenceReviewService");

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);
  const attemptId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const now = new Date("2026-09-02T00:01:00.000Z");
  try {
    await ArenaMatchEvidence.create({
      _id: evidenceId,
      attemptId,
      matchId,
      userId,
      files: [],
      submittedAt: new Date("2026-09-02T00:00:00.000Z"),
      deadlineAt: new Date("2026-09-02T00:02:00.000Z"),
      status: "ON_TIME",
      anomalyFlags: [],
      sourceRiskFlags: [],
    });

    const input = {
      matchId,
      evidenceId,
      userId,
      reviewId: "ipad-review-idempotency-key",
      model: "Qwen vision",
      modelVersion: "qwen-vision.gguf",
      reviewState: "suspicious",
      signals: ["unexplained-jump", "unexplained-jump"],
      completedAt: new Date("2026-09-02T00:00:30.000Z"),
      clientBuildVersion: "1.0.0(16)",
      now,
    };
    const first = await attachArenaClientReview(input);
    assert.deepEqual(first, {
      reviewId: input.reviewId,
      replayed: false,
      accepted: true,
    });
    const replay = await attachArenaClientReview(input);
    assert.equal(replay.replayed, true);

    const stored = await ArenaMatchEvidence.findById(evidenceId).lean();
    assert.equal(stored.clientReview.reviewId, input.reviewId);
    assert.equal(stored.clientReview.reviewState, "suspicious");
    assert.deepEqual(stored.clientReview.signals, ["unexplained-jump"]);
    assert.equal(stored.status, "ON_TIME");
    assert.deepEqual(stored.anomalyFlags, []);
    assert.deepEqual(stored.sourceRiskFlags, []);

    await assert.rejects(
      attachArenaClientReview({ ...input, reviewId: "different-review" }),
      (error) => error?.code === "ARENA_CLIENT_REVIEW_ALREADY_ATTACHED"
    );
    await assert.rejects(
      attachArenaClientReview({ ...input, userId: new mongoose.Types.ObjectId() }),
      (error) => error?.code === "ARENA_CLIENT_REVIEW_EVIDENCE_NOT_FOUND"
    );

    console.log(
      "iPad Arena client review DB verification passed: ownership, idempotency, " +
        "bounded metadata, and scoring/settlement isolation."
    );
  } finally {
    await ArenaMatchEvidence.deleteMany({ _id: evidenceId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
