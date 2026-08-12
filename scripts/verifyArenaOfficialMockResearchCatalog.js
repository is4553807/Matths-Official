#!/usr/bin/env node

const assert = require("node:assert/strict");
const catalog = require("../dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json");
const {
  activeRecords,
  familiesForDifficultyClass,
  getOfficialMockResearchSummary,
  runtimeDifficultyRecords,
} = require("../services/arenaOfficialMockResearchCatalog");
const {
  ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION,
  ARENA_DIFFICULTY_CLASSES,
  classifyAccuracyEvidence,
} = require("../services/arenaAccuracyDifficultyPolicy");
const {
  plannedPackSlots,
  tierForDifficultyCode,
} = require("../services/arenaOneOnOneDifficultyPolicy");

const targetQuestions = new Set(Array.from({ length: 30 }, (_, index) => index + 1));
const validClasses = new Set([
  ARENA_DIFFICULTY_CLASSES.BASIC_GENERAL,
  ARENA_DIFFICULTY_CLASSES.GENERAL,
  ARENA_DIFFICULTY_CLASSES.UPPER_GENERAL,
  ARENA_DIFFICULTY_CLASSES.SEMI_KILLER,
  ARENA_DIFFICULTY_CLASSES.KILLER,
]);
const validEvidenceKinds = new Set([
  "EBSI_OBSERVED_TOP15",
  "EBSI_TOP15_CENSORED_LOWER_BOUND",
  "UNAVAILABLE",
]);
const forbiddenContentKeys = new Set([
  "problemText",
  "answer",
  "solution",
  "solutionText",
  "intentText",
]);

assert.equal(catalog.schemaVersion, "ARENA_OFFICIAL_MOCK_RESEARCH_V3");
assert.equal(catalog.summary.researchWindow, "2016-2026");
assert.equal(catalog.summary.excludedExamType, "CSAT");
assert.equal(
  catalog.methodology.difficultyPolicyVersion,
  ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION
);
assert.deepEqual(catalog.methodology.targetQuestions, [...targetQuestions]);
assert.ok(catalog.summary.sourceForms >= 100);
assert.ok(catalog.summary.targetQuestionReferences >= 2_500);
assert.equal(catalog.records.length, catalog.summary.targetQuestionReferences);
assert.ok(catalog.summary.byAuthority.EDUCATION_OFFICE > 0);
assert.ok(catalog.summary.byAuthority.KICE > 0);
assert.equal(
  catalog.summary.activeReferences +
    catalog.summary.excludedReferences +
    catalog.summary.reviewRequired,
  catalog.summary.targetQuestionReferences
);

for (const record of catalog.records) {
  assert.ok(targetQuestions.has(record.questionNumber));
  assert.ok(record.year >= 2016 && record.year <= 2026);
  assert.ok(["KICE", "EDUCATION_OFFICE"].includes(record.sourceAuthority));
  assert.ok(!String(record.sourceId).includes("CSAT"));
  assert.ok(validEvidenceKinds.has(record.accuracyEvidence?.metricKind));
  for (const key of forbiddenContentKeys) {
    assert.ok(!(key in record), `제품 카탈로그에 원문 필드 ${key}를 저장할 수 없습니다.`);
  }

  const evidence = record.accuracyEvidence || {};
  const classification = classifyAccuracyEvidence(evidence);
  assert.equal(record.difficultyClass, classification.difficultyClass);
  assert.equal(
    evidence.classificationConfidence,
    classification.classificationConfidence
  );
  if (evidence.metricKind === "EBSI_OBSERVED_TOP15") {
    assert.equal(
      Number((evidence.correctRatePercent + evidence.wrongRatePercent).toFixed(1)),
      100
    );
  }
  if (evidence.metricKind === "EBSI_TOP15_CENSORED_LOWER_BOUND") {
    assert.equal(
      Number((evidence.correctRateLowerBoundPercent + evidence.wrongRateUpperBoundPercent).toFixed(1)),
      100
    );
  }
  if (record.runtimeDifficultyEligible) {
    assert.equal(record.status, "ACTIVE_REFERENCE");
    assert.ok(validClasses.has(record.difficultyClass));
  }
}

assert.equal(activeRecords().length, catalog.summary.activeReferences);
assert.equal(
  runtimeDifficultyRecords().length,
  catalog.summary.runtimeDifficultyEligibleReferences
);
for (const difficultyClass of validClasses) {
  assert.ok(catalog.summary.byDifficultyClass[difficultyClass] > 0);
  for (const courseId of ["algebra", "calculus-1", "probability-statistics"]) {
    assert.ok(familiesForDifficultyClass(difficultyClass, courseId).length > 0);
  }
}

const expectedMixes = {
  U1: ["BASIC_GENERAL", "BASIC_GENERAL", "GENERAL", "GENERAL", "GENERAL"],
  U2: Array(5).fill("GENERAL"),
  U3: ["GENERAL", "GENERAL", "UPPER_GENERAL", "UPPER_GENERAL", "UPPER_GENERAL"],
  U4: ["UPPER_GENERAL", "UPPER_GENERAL", "UPPER_GENERAL", "SEMI_KILLER", "SEMI_KILLER"],
  U5: ["UPPER_GENERAL", "UPPER_GENERAL", "SEMI_KILLER", "SEMI_KILLER", "SEMI_KILLER"],
  U6: ["UPPER_GENERAL", "SEMI_KILLER", "SEMI_KILLER", "SEMI_KILLER", "SEMI_KILLER"],
  U7: ["SEMI_KILLER", "SEMI_KILLER", "SEMI_KILLER", "SEMI_KILLER", "KILLER"],
  U8: ["SEMI_KILLER", "SEMI_KILLER", "SEMI_KILLER", "KILLER", "KILLER"],
  U9: ["SEMI_KILLER", "SEMI_KILLER", "KILLER", "KILLER", "KILLER"],
};
for (const [code, expected] of Object.entries(expectedMixes)) {
  for (const prefix of ["U", "R"]) {
    const currentCode = `${prefix}${code.slice(1)}`;
    const slots = plannedPackSlots("BRONZE", tierForDifficultyCode(currentCode), {
      division: prefix === "R" ? "MAIN" : "SUB",
    });
    assert.deepEqual(slots.map((slot) => slot.difficultyClass), expected);
    assert.deepEqual(
      slots.map((slot) => slot.slotRole),
      expected.map((difficultyClass) =>
        difficultyClass === "KILLER" ? "FINAL_29_30" : "REGULAR"
      )
    );
    assert.ok(slots.every((slot) => Array.isArray(slot.targetAccuracy)));
  }
}

const summary = getOfficialMockResearchSummary();
console.log(
  `Official Arena accuracy catalog verified: ${summary.sourceForms} forms, ` +
    `${summary.targetQuestionReferences} references, ` +
    `${summary.runtimeDifficultyEligibleReferences} runtime-eligible, ` +
    `${Object.keys(summary.byDifficultyClass).length} objective classes.`
);
