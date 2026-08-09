#!/usr/bin/env node

const assert = require("node:assert/strict");
const catalog = require("../dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json");
const {
  activeRecords,
  familiesForTier,
  getOfficialMockResearchSummary,
} = require("../services/arenaOfficialMockResearchCatalog");
const {
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  ARENA_SUPPORTED_COURSES,
} = require("../services/arenaOneOnOneTypeSkeletons");
const {
  designForCatalogType,
} = require("../services/arenaTierQuestionCatalogService");
const {
  plannedPackSlots,
} = require("../services/arenaOneOnOneDifficultyPolicy");

const targetQuestions = new Set([13, 14, 20, 21, 27, 28, 29, 30]);
const validBands = new Set([
  "Q13_14",
  "Q20_21",
  "Q27_28",
  "Q29_30_KILLER",
]);
const forbiddenContentKeys = new Set([
  "problemText",
  "answer",
  "solution",
  "solutionText",
  "intentText",
]);

assert.equal(catalog.schemaVersion, "ARENA_OFFICIAL_MOCK_RESEARCH_V1");
assert.equal(catalog.summary.researchWindow, "2016-2026");
assert.equal(catalog.summary.excludedExamType, "CSAT");
assert.equal(catalog.summary.sourceForms, 42);
assert.equal(catalog.summary.targetQuestionReferences, 292);
assert.equal(catalog.summary.activeReferences, 265);
assert.equal(catalog.summary.excludedReferences, 27);
assert.equal(catalog.summary.reviewRequired, 0);
assert.equal(catalog.records.length, 292);

for (const record of catalog.records) {
  assert.ok(targetQuestions.has(record.questionNumber));
  assert.ok(validBands.has(record.sourcePositionBand));
  assert.ok(record.year >= 2016 && record.year <= 2026);
  assert.ok([6, 8, 9].includes(record.administeredMonth));
  assert.equal(record.sourceAuthority, "KICE");
  assert.ok(!String(record.sourceId).includes("CSAT"));
  for (const key of forbiddenContentKeys) {
    assert.ok(!(key in record), `제품 카탈로그에 원문 필드 ${key}를 저장할 수 없습니다.`);
  }
  if (record.questionNumber >= 29) {
    assert.equal(record.finalSlotInfluence, true);
    assert.equal(record.sourcePositionBand, "Q29_30_KILLER");
  }
}

const active = activeRecords();
assert.equal(active.length, 265);
for (let index = 1; index <= 9; index += 1) {
  assert.ok(active.some((record) => record.difficultyTier === `T${index}`));
}

for (let index = 1; index <= 9; index += 1) {
  const tier = `T${index}`;
  for (const courseId of ARENA_SUPPORTED_COURSES) {
    assert.ok(familiesForTier(tier, courseId, { slotRole: "REGULAR" }).length > 0);
    assert.ok(familiesForTier(tier, courseId, { slotRole: "FINAL_29_30" }).length > 0);
  }
}

assert.equal(Object.keys(ARENA_ONE_ON_ONE_TYPE_SKELETONS).length, 90);
for (const skeleton of Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS)) {
  assert.ok(skeleton.referenceFamilies.length > 0);
  assert.ok(validBands.has(skeleton.sourcePositionBand));
  if (skeleton.slotRole === "FINAL_29_30") {
    assert.equal(skeleton.sourcePositionBand, "Q29_30_KILLER");
  }
}

const sampleSubSlots = plannedPackSlots("BRONZE", "SILVER", { division: "SUB" });
const sampleMainSlots = plannedPackSlots("BRONZE", "SILVER", { division: "MAIN" });
assert.equal(sampleSubSlots.length, 5);
assert.ok(sampleSubSlots.every((slot) => slot.slotRole === "REGULAR"));
assert.equal(sampleSubSlots[4].difficultyClass, "SEMI_KILLER");
assert.notEqual(sampleSubSlots[4].sourcePositionBand, "Q29_30_KILLER");
assert.equal(sampleMainSlots[4].slotRole, "FINAL_29_30");
assert.equal(sampleMainSlots[4].sourcePositionBand, "Q29_30_KILLER");
assert.ok(sampleSubSlots.every((slot) => slot.referenceFamilies.length > 0));
for (const courseId of ARENA_SUPPORTED_COURSES) {
  const regular = designForCatalogType(sampleSubSlots[0], {
    difficultyTier: "T2",
    curriculumUnit: courseId,
    slotRole: "REGULAR",
  });
  const final = designForCatalogType(sampleMainSlots[4], {
    difficultyTier: "T2",
    curriculumUnit: courseId,
    slotRole: "FINAL_29_30",
  });
  assert.equal(regular.typeSkeletonId, `T2-${({
    "common-math-1": "CM1",
    "common-math-2": "CM2",
    algebra: "ALG",
    "probability-statistics": "PROB",
    "calculus-1": "CALC",
  })[courseId]}-REGULAR`);
  assert.equal(final.sourcePositionBand, "Q29_30_KILLER");
  assert.ok(regular.referenceFamilies.length > 0);
  assert.ok(final.referenceFamilies.length > 0);
}

const summary = getOfficialMockResearchSummary();
assert.equal(summary.familyStats.length, 23);
assert.equal(
  Object.values(summary.byDifficulty).reduce((sum, count) => sum + count, 0),
  265
);

console.log(
  `Official Arena mock research verified: ${summary.sourceForms} forms, ` +
    `${summary.targetQuestionReferences} reviewed, ${summary.activeReferences} active, ` +
    `${summary.familyStats.length} families, 90 internal skeletons for U/R public difficulties.`
);
