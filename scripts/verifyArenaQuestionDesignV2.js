const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const {
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  PACK_RULES,
  SUB_MATCH_TO_DIFFICULTY,
  TIER_SPECS,
  TIER_TYPE_CATALOG,
  assertActivePackDesign,
  evaluateDifficultyCalibration,
  isNaturalNumberMaxThreeDigits,
  plannedPackSlots,
  resolveArenaDifficultyTier,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  MAIN_TIER_PAIR_CONFIG,
  SUB_TIER_PAIR_CONFIG,
  generateMainOneOnOneQuestions,
  generateSubOneOnOneQuestions,
} = require("../services/arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  validateArenaProblemPackDefinition,
} = require("../services/arenaProblemPackService");
const {
  getArenaRulebook,
} = require("../services/arenaRulebookViewService");

const root = path.resolve(__dirname, "..");

assert.equal(ARENA_QUESTION_DESIGN_POLICY_VERSION, "GOAT_ARENA_SEMI_KILLER_V2");
assert.equal(Object.keys(TIER_SPECS).length, 9);
assert.equal(Object.keys(TIER_TYPE_CATALOG).length, 9);
assert.equal(
  Object.values(TIER_TYPE_CATALOG).reduce((sum, definitions) => sum + definitions.length, 0),
  75
);
assert.equal(Object.keys(SUB_MATCH_TO_DIFFICULTY).length, 10);

for (const pair of SUB_TIER_PAIR_CONFIG) {
  assert.equal(
    pair.difficultyTier,
    resolveArenaDifficultyTier(pair.challengerTier, pair.defenderTier)
  );
  assert.equal(pair.difficultyAnchor, "DEFENDER");
  assert.equal(pair.designPolicyVersion, ARENA_QUESTION_DESIGN_POLICY_VERSION);
  const slots = plannedPackSlots(pair.challengerTier, pair.defenderTier);
  assert.deepEqual(
    slots.reduce((counts, slot) => {
      counts[slot.courseId] = Number(counts[slot.courseId] || 0) + 1;
      return counts;
    }, {}),
    PACK_RULES.unitMix
  );
  const generation = generateSubOneOnOneQuestions({
    challengerTier: pair.challengerTier,
    defenderTier: pair.defenderTier,
    matchKey: `VERIFY-SUB-${pair.key}`,
  });
  assert.equal(generation.questions.length, 5);
  assert.equal(new Set(generation.questions.map((question) => question.typeId)).size, 5);
  assert.ok(
    generation.questions.every((question) =>
      isNaturalNumberMaxThreeDigits(question.problem.answer)
    )
  );
  const draft = buildGeneratedArenaProblemPackDraft({
    generation,
    matchKey: `VERIFY-SUB-${pair.key}`,
  });
  assert.equal(validateArenaProblemPackDefinition(draft), true);
}

for (const pair of MAIN_TIER_PAIR_CONFIG) {
  assert.equal(
    pair.difficultyTier,
    resolveArenaDifficultyTier(pair.challengerTier, pair.defenderTier)
  );
  assert.equal(pair.difficultyAnchor, "DEFENDER");
}

const mainSample = MAIN_TIER_PAIR_CONFIG.find((pair) => pair.tierGap === 3);
const mainGeneration = generateMainOneOnOneQuestions({
  lowerTier: mainSample.challengerTier,
  upperTier: mainSample.defenderTier,
  matchKey: "VERIFY-MAIN-GAP-THREE",
});
assert.ok(
  mainGeneration.questions.every((question) =>
    isNaturalNumberMaxThreeDigits(question.problem.answer)
  )
);

const notReady = evaluateDifficultyCalibration({ difficultyTier: "T5", sampleMatches: 29 });
assert.equal(notReady.ready, false);
const ready = evaluateDifficultyCalibration({
  difficultyTier: "T5",
  sampleMatches: 30,
  defenderAccuracy: 0.7,
  challengerAccuracy: 0.68,
  perfectScoreMatchRate: 0.2,
  zeroScoreMatchRate: 0.12,
  completeTieRate: 0.22,
});
assert.equal(ready.ready, true);
assert.ok(ready.actions.includes("INCREASE_CASES_OR_REDUCE_GRAPH_SUPPORT"));
assert.ok(ready.actions.includes("USE_LOW_MID_MID_HIGH_HIGH_CURVE"));

const activePack = {
  difficultyTier: "T5",
  packCurve: ["LOW", "MID", "MID", "MID_HIGH", "HIGH"],
  questions: ["algebra", "calculus-1", "probability-statistics", "algebra", "calculus-1"].map(
    (courseId, index) => ({
      typeId: `ACTIVE-T5-${index + 1}`,
      courseId,
      answer: String(index + 1),
      expectedTimeMs: 100000,
      combinedConceptCount: 2,
      conditionTransformSteps: 1,
      graphItem: index === 1,
      calculationLoad: "LOW",
      difficultyPosition: ["LOW", "MID", "MID", "MID_HIGH", "HIGH"][index],
      validation: {
        passed: true,
        solvable: true,
        uniqueAnswer: true,
        calculatorFree: true,
        answerMatches: true,
        semiKillerCertified: true,
        curriculumCompliant: true,
        conditionsConsistent: true,
        tierBurdenMatches: true,
        twoMinuteSolvable: true,
        originalityChecked: true,
      },
    })
  ),
};
assert.equal(assertActivePackDesign(activePack), true);
assert.throws(
  () =>
    assertActivePackDesign(activePack, {
      recentTypeIdsByMatch: [["ACTIVE-T5-1"]],
    }),
  /최근 유형 제외/
);

const subRulebook = getArenaRulebook("SUB");
const mainRulebook = getArenaRulebook("MAIN");
assert.deepEqual(subRulebook.problemDesign, mainRulebook.problemDesign);
assert.equal(subRulebook.problemDesign.matchupRows.length, 10);
assert.equal(subRulebook.problemDesign.accuracyRows.length, 9);
assert.ok(
  !JSON.stringify(subRulebook.rules).includes("분수·소수·동치식") &&
    !JSON.stringify(mainRulebook.rules).includes("분수·소수·동치식")
);

const rendered = ejs.render(
  fs.readFileSync(path.join(root, "views/goat-arena-rules.ejs"), "utf8"),
  {
    rulebook: subRulebook,
    activeArenaPage: "rules",
    arenaUser: { nickname: "verify" },
    filename: path.join(root, "views/goat-arena-rules.ejs"),
  }
);
assert.match(rendered, /항상 방어자 티어를 기준으로 출제합니다/);
assert.match(rendered, /3자리 이하 자연수 주관식/);

const commonRules = fs.readFileSync(
  path.join(root, "docs/logic/02_GOAT_ARENA_COMMON_MATCH_RULES.md"),
  "utf8"
);
for (const phrase of [
  "방어자 앵커 T1~T9",
  "2·2·1 단원",
  "직전 3경기",
  "최소 30경기",
  "PENDING_FINAL_GENERATORS",
]) {
  assert.match(commonRules, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log(
  `Arena question design verified: ${Object.keys(TIER_SPECS).length} tiers, ` +
    `${Object.values(TIER_TYPE_CATALOG).reduce((sum, entries) => sum + entries.length, 0)} type IDs, ` +
    `${SUB_TIER_PAIR_CONFIG.length + MAIN_TIER_PAIR_CONFIG.length} tier pairs.`
);
