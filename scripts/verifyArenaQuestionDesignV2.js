#!/usr/bin/env node

const assert = require("node:assert/strict");
const { ArenaProblemPack } = require("../models/goatArenaModel");
const {
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  ARENA_SOURCE_POSITION_BANDS,
  PACK_RULES,
  PUBLIC_DIFFICULTY_SPECS,
  TIER_ORDER,
  difficultyClassForDifficultyCodeSlot,
  difficultyGateForQuestion,
  isNaturalNumberMaxThreeDigits,
  plannedPackSlots,
  sourceDifficultyPack,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  hasRenderableArenaVisualization,
  isVisualizationPresentedInProblem,
  problemWithVerifiedVisualization,
} = require("../services/arenaTierQuestionCatalogService");
const {
  generateArenaPdfOneOnOneQuestions,
} = require("../services/arenaPdfOneOnOneQuestionPool");
const {
  MAIN_TIER_PAIR_CONFIG,
  SUB_TIER_PAIR_CONFIG,
} = require("../services/arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  validateArenaProblemPackDefinition,
} = require("../services/arenaProblemPackService");

const categoryByClass = {
  BASIC_GENERAL: "basic-general",
  GENERAL: "general",
  UPPER_GENERAL: "upper-general",
  SEMI_KILLER: "semi-killer",
  KILLER: "killer",
};

assert.equal(
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  "GOAT_ARENA_ACCURACY_LADDER_V7_PDF_POOL"
);
assert.equal(Object.keys(PUBLIC_DIFFICULTY_SPECS).length, 18);
assert.deepEqual(PUBLIC_DIFFICULTY_SPECS.U1.classMix, [
  "BASIC_GENERAL",
  "BASIC_GENERAL",
  "BASIC_GENERAL",
  "BASIC_GENERAL",
  "GENERAL",
]);
assert.deepEqual(PUBLIC_DIFFICULTY_SPECS.R9.classMix, [
  "SEMI_KILLER",
  "SEMI_KILLER",
  "SEMI_KILLER",
  "SEMI_KILLER",
  "KILLER",
]);

const persistedQuestionSchema = ArenaProblemPack.schema.path("questions").schema;
const persistedSourceBands = new Set(
  persistedQuestionSchema.path("sourcePositionBand").enumValues.filter(Boolean)
);
assert.ok(ARENA_SOURCE_POSITION_BANDS.every((band) => persistedSourceBands.has(band)));
for (const difficultyClass of Object.keys(categoryByClass)) {
  assert.ok(persistedQuestionSchema.path("difficultyClass").enumValues.includes(difficultyClass));
  assert.ok(persistedQuestionSchema.path("category").enumValues.includes(categoryByClass[difficultyClass]));
}
assert.ok(persistedQuestionSchema.path("validation.accuracyClassCertified"));

async function verifyGeneratedPack({ prefix, level }) {
  const division = prefix === "R" ? "MAIN" : "SUB";
  const defenderTier = TIER_ORDER[level - 1];
  const pairPool = prefix === "R" ? MAIN_TIER_PAIR_CONFIG : SUB_TIER_PAIR_CONFIG;
  const pair = pairPool.find((candidate) => candidate.defenderTier === defenderTier);
  const challengerTier = pair?.challengerTier || defenderTier;
  const difficultyTier = pair?.difficultyTier || `T${level}`;
  const difficultyCode = `${prefix}${level}`;
  const designs = plannedPackSlots(challengerTier, defenderTier, { division });
  const expectedMix = PUBLIC_DIFFICULTY_SPECS[difficultyCode].classMix;
  assert.deepEqual(designs.map((design) => design.difficultyClass), expectedMix);
  assert.equal(designs.length, sourceDifficultyPack(difficultyCode).length);

  const questions = generateArenaPdfOneOnOneQuestions({
    difficultyCode,
    matchKey: `VERIFY-${difficultyCode}`,
    packCurve: designs.map((design) => design.difficultyPosition),
    recentTypeIds: [],
  });
  assert.equal(questions.length, PACK_RULES.items);
  assert.equal(new Set(questions.map((question) => question.typeId)).size, 5);
  assert.equal(new Set(questions.map((question) => question.sourceTypeId)).size, 5);
  questions.forEach((question, index) => {
    const expectedClass = difficultyClassForDifficultyCodeSlot(difficultyCode, index);
    const gate = difficultyGateForQuestion({ difficultyCode, order: index + 1 });
    assert.equal(question.design.difficultyClass, expectedClass);
    assert.equal(question.design.generatorDifficulty, gate.minimumGeneratorDifficulty);
    assert.equal(question.validation.accuracyClassCertified, true);
    assert.ok(question.design.referenceFamilies.length > 0);
    assert.ok(isNaturalNumberMaxThreeDigits(question.problem.answer));
  });

  // Ranked Bronze는 현재 매치 조합이 없지만 정책·생성기 카탈로그는 유지한다.
  if (!pair) return;
  const generation = {
    pairKey: pair.key,
    pairLabel: pair.label,
    difficultyTier,
    difficultyCode,
    designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    contentSourceVersion: "VERIFY-ACCURACY-RUNTIME",
    designCompliance: "ACTIVE",
    targetAccuracy: PUBLIC_DIFFICULTY_SPECS[difficultyCode],
    packCurve: designs.map((design) => design.difficultyPosition),
    questions,
  };
  const draft = buildGeneratedArenaProblemPackDraft({
    generation,
    matchKey: `VERIFY-${difficultyCode}`,
    division,
  });
  assert.equal(validateArenaProblemPackDefinition(draft), true);
  await new ArenaProblemPack(draft).validate();
}

async function main() {
  for (const prefix of ["U", "R"]) {
    for (let level = 1; level <= 9; level += 1) {
      await verifyGeneratedPack({ prefix, level });
    }
  }

  const solutionOnlyGraph = {
    prompt: "함수의 최댓값을 구하여라.",
    visualization: { kind: "polynomial", coefficients: { 2: 1, 0: -1 } },
  };
  assert.equal(hasRenderableArenaVisualization(solutionOnlyGraph.visualization), true);
  assert.equal(isVisualizationPresentedInProblem(solutionOnlyGraph), false);
  assert.equal(problemWithVerifiedVisualization(solutionOnlyGraph).visualization, null);

  console.log(
    "Arena accuracy design verified: 18 U/R policies, 90 generated questions, " +
      "5 objective classes, all pack/model validations passed."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
