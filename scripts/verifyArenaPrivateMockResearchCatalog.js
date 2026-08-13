#!/usr/bin/env node

const assert = require("node:assert/strict");
const catalog = require("../dataAnalysis/arenaPrivateMockResearchCatalog.json");
const {
  abstractTypeEvidence,
  activeCalibrationMetrics,
  activeCalibrationSources,
  calibrationEvidenceForAccuracyRange,
  getPrivateMockResearchSummary,
  hasAllRequiredComponents,
} = require("../services/arenaPrivateMockResearchCatalog");
const {
  PUBLIC_DIFFICULTY_SPECS,
  privateMockCalibrationForDifficulty,
} = require("../services/arenaOneOnOneDifficultyPolicy");

const forbiddenContentKeys = new Set([
  "problemText",
  "questionText",
  "answer",
  "correctAnswer",
  "solution",
  "solutionText",
  "workedSolutionText",
]);
const validBands = new Set(["Q13_14", "Q20_21", "Q27_28", "Q29_30_KILLER"]);

function assertNoCopiedContent(value, path = "catalog") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!forbiddenContentKeys.has(key), `${path}에 사설 원문 필드 ${key}를 저장할 수 없습니다.`);
    assertNoCopiedContent(nested, `${path}.${key}`);
  }
}

assert.equal(catalog.schemaVersion, "ARENA_PRIVATE_MOCK_RESEARCH_V1");
assertNoCopiedContent(catalog);
assert.equal(catalog.sources.length, catalog.summary.reviewedSources);
assert.equal(catalog.summary.copiedProblemTexts, 0);
assert.equal(catalog.summary.copiedAnswers, 0);
assert.equal(catalog.summary.copiedSolutions, 0);
assert.equal(catalog.summary.integratedAbstractGenerators, 2);
assert.equal(catalog.generatedQuestionIntegration.generatorTypeIds.length, 2);
assert.equal(
  catalog.generatedQuestionIntegration.copiesPrivateProblemText,
  false
);
assert.equal(
  catalog.generatedQuestionIntegration.copiesPrivateNumericValues,
  false
);
assert.equal(
  catalog.generatedQuestionIntegration.copiesPrivateWorkedSolutions,
  false
);

const activeSources = activeCalibrationSources();
assert.equal(activeSources.length, catalog.summary.activeCalibrationSources);
for (const source of activeSources) {
  assert.equal(source.runtimeStatus, "ACTIVE_CALIBRATION");
  assert.equal(source.confidence, "HIGH");
  assert.equal(hasAllRequiredComponents(source), true);
  assert.ok(Number(source.sample?.reported || 0) >= 100);
  assert.notEqual(source.releaseBasis, "AUTHOR_PUBLIC_DISTRIBUTION_RESTRICTED");
}

const activeMetrics = activeCalibrationMetrics();
assert.equal(activeMetrics.length, catalog.summary.activeCalibrationMetrics);
assert.deepEqual(
  activeMetrics.map((metric) => metric.questionNumber).sort((a, b) => a - b),
  [13, 14, 20, 21, 27, 28, 29, 30]
);
for (const metric of catalog.itemMetrics) {
  assert.ok(validBands.has(metric.sourcePositionBand));
  assert.ok(["REGULAR", "FINAL_29_30"].includes(metric.slotRole));
  if (metric.questionNumber >= 29) {
    assert.equal(metric.slotRole, "FINAL_29_30");
    assert.equal(metric.sourcePositionBand, "Q29_30_KILLER");
  }
  if (metric.runtimeEligible === true) {
    assert.ok(activeSources.some((source) => source.sourceId === metric.sourceId));
  }
}

const restricted = catalog.sources.find(
  (source) => source.runtimeStatus === "EXCLUDED_RIGHTS_RESTRICTION"
);
assert.ok(restricted);
assert.ok(!activeSources.some((source) => source.sourceId === restricted.sourceId));

const lowConfidence = catalog.sources.find((source) => source.confidence === "LOW");
assert.ok(lowConfidence);
assert.equal(lowConfidence.runtimeStatus, "RESEARCH_ONLY");
assert.ok(!activeSources.some((source) => source.sourceId === lowConfidence.sourceId));

for (let index = 1; index <= 9; index += 1) {
  const unrankedCode = `U${index}`;
  const rankedCode = `R${index}`;
  assert.ok(PUBLIC_DIFFICULTY_SPECS[unrankedCode]);
  assert.ok(PUBLIC_DIFFICULTY_SPECS[rankedCode]);
  assert.ok(privateMockCalibrationForDifficulty(unrankedCode, { slotRole: "REGULAR" }).length > 0);
  assert.ok(privateMockCalibrationForDifficulty(rankedCode, { slotRole: "REGULAR" }).length > 0);
  const expectedFinalCalibration =
    PUBLIC_DIFFICULTY_SPECS[rankedCode].classMix.includes("KILLER");
  assert.equal(
    privateMockCalibrationForDifficulty(rankedCode, { slotRole: "FINAL_29_30" }).length > 0,
    expectedFinalCalibration
  );
}

assert.ok(
  calibrationEvidenceForAccuracyRange([0.25, 0.3], { slotRole: "REGULAR" })
    .some((evidence) => evidence.questionNumber === 14 || evidence.questionNumber === 28)
);
assert.ok(
  calibrationEvidenceForAccuracyRange([0.04, 0.06], { slotRole: "FINAL_29_30" })
    .some((evidence) => evidence.questionNumber === 29 && evidence.withinTarget)
);
assert.equal(abstractTypeEvidence({ slotRole: "FINAL_29_30" }).length, 2);

const summary = getPrivateMockResearchSummary();
assert.equal(summary.activeCalibrationSources, 1);
assert.equal(summary.activeCalibrationMetrics, 8);
assert.equal(summary.activeAbstractTypeEvidence.length, 2);

console.log(
  `Private mock research verified: ${summary.reviewedSources} sources reviewed, ` +
    `${summary.activeCalibrationSources} active source, ${summary.activeCalibrationMetrics} active metrics, ` +
    `${summary.researchOnlySources} low-confidence research source, ` +
    `${summary.excludedSources} excluded without runtime use.`
);
