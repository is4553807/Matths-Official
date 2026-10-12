"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ArenaNormalBaselineQuestion,
} = require("../models/goatArenaModel");
const {
  NORMAL_BASELINE_TIERS,
  QUESTIONS_PER_TIER,
  baselineCombinationHash,
  buildNormalBaselineCaptureManifest,
  chooseAvailableBaselineCombination,
} = require("../services/arenaNormalBaselineQuestionService");

function allCombinations(values, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= values.length - (size - prefix.length); index += 1) {
    allCombinations(values, size, index + 1, [...prefix, values[index]], output);
  }
  return output;
}

async function main() {
  const manifest = buildNormalBaselineCaptureManifest();
  assert.equal(manifest.activationAllowed, false);
  assert.equal(manifest.questionCount, 63);
  assert.equal(manifest.questions.length, 63);
  assert.equal(new Set(manifest.questions.map((entry) => entry.baselineKey)).size, 63);
  assert.equal(
    new Set(manifest.questions.map((entry) => entry.expectedSolutionFileName)).size,
    63
  );

  for (const tier of NORMAL_BASELINE_TIERS) {
    const questions = manifest.questions.filter(
      (entry) => entry.difficultyCode === tier.difficultyCode
    );
    assert.equal(questions.length, QUESTIONS_PER_TIER);
    assert.equal(new Set(questions.map((entry) => entry.question.typeId)).size, 7);
    assert.equal(new Set(questions.map((entry) => entry.questionInstanceHash)).size, 7);
    assert.equal(
      questions.filter((entry) => entry.baselineCorrect).length,
      tier.baselineCorrectQuestionCount
    );
    assert.equal(
      questions.filter((entry) => !entry.baselineCorrect).length,
      QUESTIONS_PER_TIER - tier.baselineCorrectQuestionCount
    );
    assert.ok(questions.every((entry) => entry.sourceAccuracyEvidenceKind === "EXACT"));
    assert.ok(questions.every((entry) => entry.sourceAccuracyRate > 0 && entry.sourceAccuracyRate < 1));
    assert.ok(questions.every((entry) => entry.status === "EVIDENCE_PENDING"));

    const possible = allCombinations(questions, 5);
    assert.equal(possible.length, 21);
    assert.equal(new Set(possible.map(baselineCombinationHash)).size, 21);

    const used = [];
    for (let sequence = 0; sequence < 21; sequence += 1) {
      const selected = chooseAvailableBaselineCombination({
        records: questions,
        recentCombinationHashes: used,
        challengerUserId: "verification-user",
        sequence,
      });
      assert.ok(!used.includes(selected.combinationHash));
      used.push(selected.combinationHash);
    }
    assert.equal(new Set(used).size, 21);
    const released = chooseAvailableBaselineCombination({
      records: questions,
      recentCombinationHashes: used.slice(1),
      challengerUserId: "verification-user",
      sequence: 21,
    });
    assert.equal(released.combinationHash, used[0]);
  }

  const first = manifest.questions[0];
  const draft = new ArenaNormalBaselineQuestion(first);
  await draft.validate();

  const activeWithoutEvidence = new ArenaNormalBaselineQuestion({
    ...first,
    status: "ACTIVE",
    calibrationStatus: "SIMULATION_APPROVED",
  });
  await assert.rejects(
    activeWithoutEvidence.validate(),
    /손풀이 원본|기준 문항을 활성화/
  );

  const operatorId = new mongoose.Types.ObjectId();
  const active = new ArenaNormalBaselineQuestion({
    ...first,
    status: "ACTIVE",
    calibrationStatus: "SIMULATION_APPROVED",
    createdByUserId: operatorId,
    reviewedByUserId: operatorId,
    reviewedAt: new Date("2026-10-11T01:00:00.000Z"),
    activatedAt: new Date("2026-10-11T01:00:00.000Z"),
    solutionEvidenceFile: {
      originalName: first.expectedSolutionFileName,
      storedName: `${first.questionInstanceHash}.png`,
      mimeType: "image/png",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      storageProvider: "R2",
      storagePurpose: "ARENA_BASELINE_SOLUTION",
      r2ObjectKey: `arena/baseline/${first.expectedSolutionFileName}`,
      r2Sha256: "a".repeat(64),
      r2ETag: "verification",
    },
  });
  await active.validate();

  const wrongCorrectness = new ArenaNormalBaselineQuestion({
    ...first,
    baselineCorrect: !first.baselineCorrect,
  });
  await assert.rejects(wrongCorrectness.validate(), /정오 값/);

  process.stdout.write(JSON.stringify({
    ok: true,
    questionCount: manifest.questionCount,
    tiers: NORMAL_BASELINE_TIERS.length,
    combinationsPerTier: 21,
    totalCombinations: 21 * NORMAL_BASELINE_TIERS.length,
    activationGuardVerified: true,
    exactSourceAccuracyOnly: true,
  }, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
