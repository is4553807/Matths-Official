const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ARENA_PROBLEM_DIFFICULTY_TIERS,
  availableArenaProblemTypes,
  computeProblemDataHash,
  defaultTierConfigurations,
  normalizeProblemDataInput,
  typeIdsForDifficultyTier,
  validateArenaProblemDataDefinition,
} = require("../services/arenaProblemDataService");
const {
  generateMainOneOnOneQuestions,
  generateSubOneOnOneQuestions,
} = require("../services/arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
  assertArenaProblemPackIntegrity,
} = require("../services/arenaProblemPackService");

async function run() {
  const types = availableArenaProblemTypes();
  assert.ok(types.length >= 5);
  assert.equal(defaultTierConfigurations().length, 9);

  const formInput = {
    code: "ARENA-PROBLEM-DATA-VERIFY-V2",
    displayName: "문제 데이터 검증 버전",
    changeSummary: "자동 검증",
  };
  for (const tier of ARENA_PROBLEM_DIFFICULTY_TIERS) {
    formInput[`types_${tier}`] = types.map((item) => item.typeId);
  }
  const normalized = normalizeProblemDataInput(formInput);
  assert.equal(normalized.contentHash, computeProblemDataHash(normalized));
  const report = await validateArenaProblemDataDefinition(normalized, {
    samplesPerType: 1,
  });
  assert.equal(report.passed, true);

  const version = {
    _id: new mongoose.Types.ObjectId(),
    ...normalized,
    status: "ACTIVE",
  };
  assert.ok(typeIdsForDifficultyTier(version, "T5").length >= 5);

  const subGeneration = generateSubOneOnOneQuestions({
    challengerTier: "BRONZE",
    defenderTier: "SILVER",
    matchKey: "verify-problem-data-sub",
    problemDataVersion: version,
  });
  assert.equal(subGeneration.questions.length, 5);
  assert.equal(new Set(subGeneration.questions.map((item) => item.typeId)).size, 5);
  assert.equal(subGeneration.contentSourceVersion, version.code);
  assert.equal(String(subGeneration.problemDataVersionId), String(version._id));

  const mainGeneration = generateMainOneOnOneQuestions({
    lowerTier: "GOLD",
    upperTier: "DIAMOND",
    matchKey: "verify-problem-data-main",
    problemDataVersion: version,
  });
  assert.equal(mainGeneration.questions.length, 5);
  assert.equal(mainGeneration.contentSourceVersion, version.code);

  const sealed = sealArenaProblemPackDraft(
    buildGeneratedArenaProblemPackDraft({
      generation: subGeneration,
      matchKey: "verify-problem-data-pack",
      generatedAt: new Date("2026-08-03T00:00:00.000Z"),
    }),
    { sealedAt: new Date("2026-08-03T00:00:00.000Z"), autoValidated: true }
  );
  assert.equal(String(sealed.problemDataVersionId), String(version._id));
  assert.equal(assertArenaProblemPackIntegrity(sealed), true);

  console.log(
    `Arena problem data verified: ${types.length} generators, 9 tiers, version-pinned Unranked/Ranked packs.`
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
