const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const {
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  ARENA_SOURCE_POSITION_BANDS,
  PACK_RULES,
  PUBLIC_DIFFICULTY_SPECS,
  PUBLIC_DIFFICULTY_TO_CATALOG_TIER,
  SUB_MATCH_TO_DIFFICULTY,
  TIER_SPECS,
  TIER_TYPE_CATALOG,
  assertActivePackDesign,
  difficultyGateForQuestion,
  evaluateDifficultyCalibration,
  isNaturalNumberMaxThreeDigits,
  plannedPackSlots,
  resolveArenaDifficultyTier,
  targetAccuracyRangeForSlot,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  hasRenderableArenaVisualization,
  isVisualizationPresentedInProblem,
  problemWithVerifiedVisualization,
} = require("../services/arenaTierQuestionCatalogService");
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
const modelValidationPromises = [];

function assertRenderableMathPrompt(prompt, label = "문항") {
  const source = String(prompt || "");
  assert.ok(source.trim(), `${label}: 문제 본문이 비어 있습니다.`);
  assert.equal(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(source),
    false,
    `${label}: TeX 이스케이프가 제어문자로 변환되었습니다.`
  );
  const dollarCount = (source.match(/(?<!\\)\$/g) || []).length;
  assert.equal(dollarCount % 2, 0, `${label}: $ 수식 구분자가 닫히지 않았습니다.`);
}

assert.equal(ARENA_QUESTION_DESIGN_POLICY_VERSION, "GOAT_ARENA_U_R_DIFFICULTY_V5");
assert.equal(Object.keys(TIER_SPECS).length, 9);
assert.equal(Object.keys(TIER_TYPE_CATALOG).length, 9);
assert.equal(
  Object.values(TIER_TYPE_CATALOG).reduce((sum, definitions) => sum + definitions.length, 0),
  90
);
assert.equal(Object.keys(SUB_MATCH_TO_DIFFICULTY).length, 10);
assert.equal(Object.keys(PUBLIC_DIFFICULTY_SPECS).length, 18);
assert.equal(PUBLIC_DIFFICULTY_TO_CATALOG_TIER.U9, "T9");
assert.equal(PUBLIC_DIFFICULTY_TO_CATALOG_TIER.R1, "T8");
assert.equal(PUBLIC_DIFFICULTY_TO_CATALOG_TIER.R2, "T9");
for (let level = 1; level <= 9; level += 1) {
  const unranked = PUBLIC_DIFFICULTY_SPECS[`U${level}`];
  const ranked = PUBLIC_DIFFICULTY_SPECS[`R${level}`];
  assert.ok(
    ranked.regularAccuracy[1] < unranked.regularAccuracy[1],
    `R${level}은 U${level}보다 낮은 목표 정답률이어야 합니다.`
  );
  assert.ok(ranked.finalAccuracy[1] < 0.1, `R${level} 5번은 한 자릿수 목표여야 합니다.`);
}
assert.deepEqual(PUBLIC_DIFFICULTY_SPECS.U1.regularAccuracy, [0.35, 0.399]);
assert.deepEqual(PUBLIC_DIFFICULTY_SPECS.U9.regularAccuracy, [0.19, 0.24]);
assert.deepEqual(PUBLIC_DIFFICULTY_SPECS.R1.regularAccuracy, [0.28, 0.34]);
assert.deepEqual(PUBLIC_DIFFICULTY_SPECS.R9.finalAccuracy, [0.01, 0.025]);
assert.deepEqual(
  targetAccuracyRangeForSlot({ difficultyCode: "R6", order: 5, division: "MAIN" }),
  [0.03, 0.034]
);
assert.ok(
  targetAccuracyRangeForSlot({ difficultyCode: "U5", order: 1, division: "SUB" })[0] >
    targetAccuracyRangeForSlot({ difficultyCode: "U5", order: 5, division: "SUB" })[0]
);
assert.deepEqual(
  difficultyGateForQuestion({ difficultyCode: "R9", order: 5, slotRole: "FINAL_29_30" }),
  {
    minimumCombinedConcepts: 5,
    minimumConditionTransformSteps: 5,
    minimumReasoningSteps: 5,
    minimumGeneratorDifficulty: 4,
    minimumDifficultyScore: 0.9,
    order: 5,
  }
);
const persistedSourceBands = new Set(
  ArenaProblemPack.schema
    .path("questions")
    .schema.path("sourcePositionBand")
    .enumValues.filter(Boolean)
);
assert.ok(
  ARENA_SOURCE_POSITION_BANDS.every((band) => persistedSourceBands.has(band)),
  "현재 출제 정책의 모든 문항 위치 구간을 문제 팩 스키마가 저장할 수 있어야 합니다."
);
const persistedQuestionSchema = ArenaProblemPack.schema.path("questions").schema;
[
  "reasoningStepCount",
  "generatorDifficulty",
  "caseBranchCount",
  "targetAccuracyMin",
  "targetAccuracyMax",
].forEach((pathName) => {
  assert.ok(
    persistedQuestionSchema.path(pathName),
    `${pathName} 난이도 검증값을 문제 팩에 저장해야 합니다.`
  );
});

for (const pair of SUB_TIER_PAIR_CONFIG) {
  assert.equal(
    pair.difficultyTier,
    resolveArenaDifficultyTier(pair.challengerTier, pair.defenderTier)
  );
  assert.equal(pair.difficultyAnchor, "DEFENDER");
  assert.equal(pair.designPolicyVersion, ARENA_QUESTION_DESIGN_POLICY_VERSION);
  const slots = plannedPackSlots(pair.challengerTier, pair.defenderTier, {
    division: "SUB",
  });
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
  generation.questions.forEach((question, index) => {
    assertRenderableMathPrompt(question.problem?.prompt, `${pair.key} ${index + 1}번`);
  });
  const allKiller = Number(String(generation.difficultyCode).replace(/^U/, "")) >= 7;
  assert.equal(
    generation.questions.every((question) =>
      question.design.slotRole === (allKiller ? "FINAL_29_30" : "REGULAR")
    ),
    true
  );
  assert.equal(
    generation.questions.every((question) =>
      question.design.difficultyClass === (allKiller ? "KILLER" : "SEMI_KILLER")
    ),
    true
  );
  assert.equal(
    generation.questions.every((question) =>
      allKiller
        ? question.design.sourcePositionBand === "Q29_30_KILLER"
        : question.design.sourcePositionBand !== "Q29_30_KILLER"
    ),
    true
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
    resolveArenaDifficultyTier(pair.challengerTier, pair.defenderTier, {
      division: "MAIN",
    })
  );
  assert.equal(pair.difficultyAnchor, "DEFENDER");
  const generation = generateMainOneOnOneQuestions({
    lowerTier: pair.challengerTier,
    upperTier: pair.defenderTier,
    matchKey: `VERIFY-MAIN-${pair.key}`,
  });
  assert.equal(generation.questions.length, 5);
  assert.equal(new Set(generation.questions.map((question) => question.typeId)).size, 5);
  const allKiller = Number(String(generation.difficultyCode).replace(/^R/, "")) >= 7;
  assert.equal(
    generation.questions.filter((question) => question.design.slotRole === "FINAL_29_30").length,
    allKiller ? 5 : 1
  );
  assert.equal(
    generation.questions.filter(
      (question) => question.design.sourcePositionBand === "Q29_30_KILLER"
    ).length,
    allKiller ? 5 : 1
  );
  generation.questions.forEach((question, index) => {
    assertRenderableMathPrompt(question.problem?.prompt, `${pair.key} ${index + 1}번`);
  });
  const draft = buildGeneratedArenaProblemPackDraft({
    generation,
    matchKey: `VERIFY-MAIN-${pair.key}`,
    division: "MAIN",
  });
  assert.equal(validateArenaProblemPackDefinition(draft), true);
  modelValidationPromises.push(
    new ArenaProblemPack(draft).validate().catch((error) => {
      error.message =
        `${pair.key}: Ranked 단계별 준킬러·킬러 구성을 ` +
        `DB 스키마가 허용해야 합니다. ${error.message}`;
      throw error;
    })
  );
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
assert.equal(mainGeneration.questions[4].design.slotRole, "FINAL_29_30");
assert.equal(mainGeneration.questions[4].design.sourcePositionBand, "Q29_30_KILLER");

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
  division: "SUB",
  difficultyTier: "T5",
  packCurve: ["LOW", "MID", "MID", "MID_HIGH", "HIGH"],
  questions: ["algebra", "calculus-1", "probability-statistics", "algebra", "calculus-1"].map(
    (courseId, index) => ({
      typeId: `ACTIVE-T5-${index + 1}`,
      difficultyClass: "SEMI_KILLER",
      slotRole: "REGULAR",
      courseId,
      answer: String(index + 1),
      expectedTimeMs: 100000,
      combinedConceptCount: 2,
      conditionTransformSteps: 1,
      graphItem: false,
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
assert.notDeepEqual(subRulebook.problemDesign, mainRulebook.problemDesign);
assert.equal(subRulebook.problemDesign.matchupRows.length, 9);
assert.equal(mainRulebook.problemDesign.matchupRows.length, 9);
assert.equal(subRulebook.problemDesign.accuracyRows.length, 9);
assert.equal(mainRulebook.problemDesign.accuracyRows.length, 9);
assert.equal(subRulebook.problemDesign.difficultyPrefix, "U");
assert.equal(mainRulebook.problemDesign.difficultyPrefix, "R");
assert.equal(
  subRulebook.problemDesign.accuracyRows.every((row) => row.stage.startsWith("U")),
  true
);
assert.equal(
  mainRulebook.problemDesign.accuracyRows.every((row) => row.stage.startsWith("R")),
  true
);
assert.equal(subRulebook.problemDesign.curveRows.length, 2);
assert.ok(subRulebook.problemDesign.structuralDifficultyPrinciples.length >= 3);
assert.ok(
  !JSON.stringify(subRulebook.rules).includes("분수·소수·동치식") &&
    !JSON.stringify(mainRulebook.rules).includes("분수·소수·동치식")
);

const solutionOnlyGraph = {
  prompt: "함수의 최댓값을 구하여라.",
  visualization: {
    kind: "polynomial",
    coefficients: { 2: 1, 0: -1 },
  },
};
assert.equal(hasRenderableArenaVisualization(solutionOnlyGraph.visualization), true);
assert.equal(isVisualizationPresentedInProblem(solutionOnlyGraph), false);
assert.equal(problemWithVerifiedVisualization(solutionOnlyGraph).visualization, null);

const stemProvidedGraph = {
  prompt: "아래 그래프는 함수 f(x)를 나타낸 것이다. f(1)의 값을 구하여라.",
  visualization: {
    kind: "polynomial",
    coefficients: { 2: 1, 0: -1 },
    presentedInProblem: true,
    sourceRole: "PROBLEM_STEM",
  },
};
assert.equal(isVisualizationPresentedInProblem(stemProvidedGraph), true);
assert.equal(
  problemWithVerifiedVisualization(stemProvidedGraph).visualization.sourceRole,
  "PROBLEM_STEM"
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
assert.match(rendered, /Division과 방어자 티어를 기준으로 출제합니다/);
assert.match(rendered, /3자리 이하 자연수 주관식/);
assert.match(rendered, /2016~2026 고3 3·5·6·7·9·10·11월 모의고사/);
assert.match(rendered, /29·30번형 킬러/);
assert.match(rendered, /114개/);
assert.match(rendered, /707건/);
assert.match(rendered, /U7~U9/);
assert.doesNotMatch(rendered, /R7~R9/);

const renderedMain = ejs.render(
  fs.readFileSync(path.join(root, "views/goat-arena-rules.ejs"), "utf8"),
  {
    rulebook: mainRulebook,
    activeArenaPage: "rules",
    arenaUser: { nickname: "verify" },
    filename: path.join(root, "views/goat-arena-rules.ejs"),
  }
);
assert.match(renderedMain, /R7~R9/);
assert.doesNotMatch(renderedMain, /U7~U9/);
assert.match(renderedMain, /다섯 문항 모두 29·30번형/);

const commonRules = fs.readFileSync(
  path.join(root, "docs/logic/02_GOAT_ARENA_COMMON_MATCH_RULES.md"),
  "utf8"
);
for (const phrase of [
  "Division·방어자 앵커 U1~U9·R1~R9",
  "FINAL_29_30",
  "최근 공식 경기 5개",
  "최소 30경기",
  "공통수학Ⅰ·Ⅱ",
]) {
  assert.match(commonRules, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

Promise.all(modelValidationPromises)
  .then(() => {
    console.log(
      `Arena question design verified: ${Object.keys(PUBLIC_DIFFICULTY_SPECS).length} public difficulties, ` +
        `30 public variants each, ${Object.keys(TIER_SPECS).length} internal tiers, ` +
        `${Object.values(TIER_TYPE_CATALOG).reduce((sum, entries) => sum + entries.length, 0)} internal skeleton IDs, ` +
        `${SUB_TIER_PAIR_CONFIG.length + MAIN_TIER_PAIR_CONFIG.length} tier pairs.`
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
