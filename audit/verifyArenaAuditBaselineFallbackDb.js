"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { ArenaNormalBaselineQuestion, ArenaNormalBaselineAssignment } = require("../models/goatArenaModel");
const { selectActiveNormalBaselineQuestionSet } = require("../services/arenaNormalBaselineQuestionService");

async function main() {
  assert.match(process.env.DB, /matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    const userId = new mongoose.Types.ObjectId(), owner = new mongoose.Types.ObjectId();
    const groups = [1000, 1100].map((targetMmr, group) => Array.from({ length: 7 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(), baselineKey: `AUDIT-G${group}-Q${index}`,
      batchKey: `AUDIT-G${group}`, difficultyCode: `U${group + 3}`, targetMmr,
      createdByUserId: owner, mode: "NORMAL", status: "ACTIVE", calibrationStatus: "SIMULATION_APPROVED",
      questionInstanceHash: String(group * 7 + index + 1).padStart(64, "0"),
      question: { sourceTypeId: "AUDIT", prompt: `Approved fixture ${group}:${index}`, answer: "1" },
    })));
    // These are approved-state selector fixtures, not real calibrated records.
    await ArenaNormalBaselineQuestion.collection.insertMany(groups.flat());
    await ArenaNormalBaselineAssignment.collection.insertOne({ challengerUserId: userId, sequence: 1,
      baselineQuestionIds: groups[0].slice(0, 5).map((row) => row._id), combinationHash: "prior" });
    const result = await selectActiveNormalBaselineQuestionSet({ challengerUserId: userId, rating: 1000, sequence: 2 });
    assert.equal(result.targetMmr, 1100); assert.equal(result.questions.length, 5);
    assert.ok(result.questions.every((row) => row.batchKey === "AUDIT-G1"));
    await assert.rejects(selectActiveNormalBaselineQuestionSet({ challengerUserId: userId, rating: 1000, sequence: 2,
      excludedQuestionHashes: groups[1].map((row) => row.questionInstanceHash) }), { code: "ARENA_BASELINE_COMBINATION_COOLDOWN" });
    console.log("Baseline fallback verified: exhausted closest pool uses the next eligible group; genuinely exhausted pools remain rejected.");
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
