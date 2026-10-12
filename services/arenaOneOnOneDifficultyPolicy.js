/*
 * GOAT Arena 1대1 정답률 기반 난이도 설계 정책 v6.
 *
 * 이 파일은 일반전·경쟁전이 함께 사용하는 문제 설계의 단일 원본이다.
 * 실제 문항 생성기는 arenaOneOnOneProblemTypes.js에 독립적으로 두며,
 * 공식 모의평가 조사 카탈로그의 사고 유형과 아래 typeId를 연결한다.
 */

const {
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  ARENA_SUPPORTED_COURSES,
} = require("./arenaOneOnOneTypeSkeletons");
const {
  calibrationEvidenceForAccuracyRange,
} = require("./arenaPrivateMockResearchCatalog");
const {
  ARENA_DIFFICULTY_CLASS_SOURCE_BANDS,
  generatorDifficultyForClass,
  sourceBandForDifficultyClass,
} = require("./arenaAccuracyDifficultyPolicy");
const {
  RANKED_DIFFICULTY_PACKS,
  SOURCE_DIFFICULTY_BANDS,
  UNRANKED_DIFFICULTY_PACKS,
} = require("./arenaMatchDifficultyPlan");

const ARENA_QUESTION_DESIGN_POLICY_VERSION =
  "GOAT_ARENA_ACCURACY_LADDER_V7_PDF_POOL";
const ARENA_FALLBACK_CONTENT_VERSION =
  "GOAT_ARENA_FALLBACK_GENERATED_V1";
const ARENA_FINAL_CONTENT_VERSION =
  "GOAT_ARENA_OFFICIAL_MOCK_ACCURACY_TYPES_V4";

const ARENA_SOURCE_POSITION_BANDS = Object.freeze([
  "Q13_14",
  "Q20_21",
  "Q27_28",
  "MIXED_SEMI_KILLER",
  "Q29_30_KILLER",
  ...Object.values(ARENA_DIFFICULTY_CLASS_SOURCE_BANDS),
]);

const TIER_TYPE_SKELETON_CATALOG = Object.freeze(
  Object.fromEntries(
    Array.from({ length: 9 }, (_unused, index) => `T${index + 1}`).map((tier) => [
      tier,
      Object.freeze(
        Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS).filter(
          (definition) => definition.tier === tier
        )
      ),
    ])
  )
);

const TIER_ORDER = Object.freeze([
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
]);

const TIER_LABELS = Object.freeze({
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
});

const TIER_CODE_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(TIER_LABELS).flatMap(([code, label]) => [
      [code, code],
      [label, code],
    ])
  )
);

const TIER_SPECS = Object.freeze({
  T1: Object.freeze({ anchor: "BRONZE", defenderAccuracy: [0.6, 0.68], challengerAccuracy: [0.6, 0.68], concepts: 2, conditions: 1, interpretationDepth: 0, cases: 0, graphSupport: "FULL" }),
  T2: Object.freeze({ anchor: "SILVER", defenderAccuracy: [0.58, 0.65], challengerAccuracy: [0.42, 0.5], concepts: 2, conditions: 1, interpretationDepth: 0, cases: 1, graphSupport: "FULL" }),
  T3: Object.freeze({ anchor: "GOLD", defenderAccuracy: [0.56, 0.63], challengerAccuracy: [0.4, 0.48], concepts: 2, conditions: 2, interpretationDepth: 1, cases: 1, graphSupport: "FULL" }),
  T4: Object.freeze({ anchor: "PLATINUM", defenderAccuracy: [0.54, 0.61], challengerAccuracy: [0.38, 0.46], concepts: 2, conditions: 2, interpretationDepth: 1, cases: 2, graphSupport: "FULL" }),
  T5: Object.freeze({ anchor: "EMERALD", defenderAccuracy: [0.52, 0.59], challengerAccuracy: [0.36, 0.44], concepts: 2.5, conditions: 2, interpretationDepth: 1, cases: 2, graphSupport: "PARTIAL" }),
  T6: Object.freeze({ anchor: "DIAMOND", defenderAccuracy: [0.5, 0.57], challengerAccuracy: [0.34, 0.42], concepts: 3, conditions: 2, interpretationDepth: 2, cases: 3, graphSupport: "PARTIAL" }),
  T7: Object.freeze({ anchor: "MASTER", defenderAccuracy: [0.48, 0.55], challengerAccuracy: [0.32, 0.4], concepts: 3, conditions: 2.5, interpretationDepth: 2, cases: 3, graphSupport: "PARTIAL" }),
  T8: Object.freeze({ anchor: "GRANDMASTER", defenderAccuracy: [0.46, 0.53], challengerAccuracy: [0.3, 0.38], concepts: 3, conditions: 3, interpretationDepth: 2, cases: 3, graphSupport: "MINIMAL" }),
  T9: Object.freeze({ anchor: "CHALLENGER", defenderAccuracy: [0.44, 0.52], challengerAccuracy: [0.28, 0.36], concepts: 3, conditions: 3, interpretationDepth: 2, cases: 4, graphSupport: "NONE" }),
});

const DEFENDER_TIER_TO_DIFFICULTY = Object.freeze(
  Object.fromEntries(
    Object.entries(TIER_SPECS).map(([difficultyTier, spec]) => [
      spec.anchor,
      difficultyTier,
    ])
  )
);

// T 코드는 기존 ACTIVE DB를 읽기 위한 내부 호환 키다. 공개 난이도는
// U1~U9·R1~R9이며, 같은 번호에서는 경쟁전 구간이 일반전 구간보다 어렵다.
// R3부터는 T9 생성기 안에서 조건 수·경우 분류·난도 점수를 추가 보정한다.
const RANKED_DEFENDER_TIER_TO_DIFFICULTY = Object.freeze({
  BRONZE: "T8",
  SILVER: "T9",
  GOLD: "T9",
  PLATINUM: "T9",
  EMERALD: "T9",
  DIAMOND: "T9",
  MASTER: "T9",
  GRANDMASTER: "T9",
  CHALLENGER: "T9",
});

// T 코드는 기존 DB 카탈로그와의 호환을 위한 내부 보정 키다. 사용자와
// 운영 화면에는 Division별 절대 난이도인 U1~U9, R1~R9만 노출한다.
const UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE = Object.freeze(
  Object.fromEntries(TIER_ORDER.map((tier, index) => [tier, `U${index + 1}`]))
);
const RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE = Object.freeze(
  Object.fromEntries(TIER_ORDER.map((tier, index) => [tier, `R${index + 1}`]))
);
const PUBLIC_DIFFICULTY_TO_CATALOG_TIER = Object.freeze({
  ...Object.fromEntries(Array.from({ length: 9 }, (_unused, index) => [`U${index + 1}`, `T${index + 1}`])),
  R1: "T8",
  R2: "T9",
  R3: "T9",
  R4: "T9",
  R5: "T9",
  R6: "T9",
  R7: "T9",
  R8: "T9",
  R9: "T9",
});

function difficultyClassForSourceDifficultyCode(sourceDifficultyCode = "") {
  const level = Number(String(sourceDifficultyCode || "").replace(/^D/i, ""));
  if (level === 1) return "BASIC_GENERAL";
  if (level <= 3) return "GENERAL";
  if (level <= 5) return "UPPER_GENERAL";
  if (level <= 7) return "SEMI_KILLER";
  if (level <= 9) return "KILLER";
  return "UNRESOLVED";
}

function sourceDifficultyPack(difficultyCode = "") {
  const normalized = String(difficultyCode || "").trim().toUpperCase();
  if (!/^[UR][1-9]$/.test(normalized)) return null;
  const packs = normalized.startsWith("R")
    ? RANKED_DIFFICULTY_PACKS
    : UNRANKED_DIFFICULTY_PACKS;
  return packs[Number(normalized.slice(1)) - 1] || null;
}

// U/R은 서로 독립된 D1~D9 5문항 조합을 사용한다. 호환 필드의
// 정답률은 해당 조합의 EBSi 정답률 구간 전체를 나타낸다.
const PUBLIC_DIFFICULTY_SPECS = Object.freeze(
  Object.fromEntries(
    ["U", "R"].flatMap((prefix) =>
      TIER_ORDER.map((tier, index) => {
        const sourcePack = (prefix === "R"
          ? RANKED_DIFFICULTY_PACKS
          : UNRANKED_DIFFICULTY_PACKS)[index];
        const classMix = sourcePack.map(difficultyClassForSourceDifficultyCode);
        const ranges = sourcePack.map((sourceDifficultyCode) => {
          const band = SOURCE_DIFFICULTY_BANDS[sourceDifficultyCode];
          return [
            band.minimumCorrectRatePercent / 100,
            band.maximumCorrectRatePercent / 100,
          ];
        });
        const overallAccuracy = [
          Math.min(...ranges.map((range) => range[0])),
          Math.max(...ranges.map((range) => range[1])),
        ];
        return [
          `${prefix}${index + 1}`,
          Object.freeze({
            ...TIER_SPECS[`T${index + 1}`],
            anchor: tier,
            classMix: Object.freeze(classMix),
            defenderAccuracy: Object.freeze(overallAccuracy),
            challengerAccuracy: Object.freeze(overallAccuracy),
            regularAccuracy: Object.freeze(overallAccuracy),
            finalAccuracy: classMix.includes("KILLER")
              ? Object.freeze(ranges[classMix.lastIndexOf("KILLER")])
              : undefined,
          }),
        ];
      })
    )
  )
);

function privateMockCalibrationForDifficulty(
  difficultyCode,
  { slotRole = "REGULAR", limit = 4 } = {}
) {
  const spec = PUBLIC_DIFFICULTY_SPECS[String(difficultyCode || "").toUpperCase()];
  if (!spec) return [];
  const targetAccuracy = slotRole === "FINAL_29_30"
    ? spec.finalAccuracy
    : spec.regularAccuracy;
  if (!targetAccuracy) return [];
  return calibrationEvidenceForAccuracyRange(targetAccuracy, { slotRole, limit });
}

const SUB_MATCH_TO_DIFFICULTY = Object.freeze({
  BRONZE_BRONZE: "T1",
  BRONZE_SILVER: "T2",
  SILVER_GOLD: "T3",
  GOLD_PLATINUM: "T4",
  PLATINUM_EMERALD: "T5",
  EMERALD_DIAMOND: "T6",
  DIAMOND_MASTER: "T7",
  MASTER_GRANDMASTER: "T8",
  GRANDMASTER_CHALLENGER: "T9",
  CHALLENGER_CHALLENGER: "T9",
});

const PACK_CURVE = Object.freeze(["LOW", "MID", "MID", "MID_HIGH", "HIGH"]);
const CHALLENGER_PACK_CURVE = Object.freeze(["MID", "MID", "HIGH", "HIGH", "HIGH"]);
const PACK_COURSE_SLOTS = Object.freeze([
  "algebra",
  "calculus-1",
  "probability-statistics",
  "algebra",
  "calculus-1",
]);

const PACK_RULES = Object.freeze({
  items: 5,
  perItemPoints: 20,
  totalScore: 100,
  timeLimitMinutes: 10,
  unitMix: Object.freeze({
    "calculus-1": 2,
    algebra: 2,
    "probability-statistics": 1,
  }),
  // 그래프는 풀이 편의를 위해 강제하지 않는다. 문제 본문 자체가 그래프·표를
  // 제시하고 정확한 라벨 데이터가 있을 때만 화면에 렌더링한다.
  minimumGraphItems: 0,
  maximumGraphItemsFromT5: 2,
  maximumSameUnit: 2,
  banRecentTypeIdsForMatches: 3,
  calculationLoad: "LOW",
  answerFormat: "NATURAL_NUMBER_MAX_3_DIGITS",
  minimumCombinedConcepts: 1,
  minimumConditionTransformSteps: 0,
  expectedTimePerItemMs: 10 * 60 * 1000,
});

const QUESTION_REVIEW_CHECKLIST = Object.freeze([
  "SEMI_KILLER_TWO_CONCEPTS_AND_TRANSFORM",
  "UNIQUE_ANSWER",
  "NATURAL_NUMBER_MAX_3_DIGITS",
  "CURRICULUM_COMMON_MATH1_COMMON_MATH2_ALGEBRA_PROBABILITY_STATISTICS_CALCULUS1",
  "NO_MISSING_OR_CONFLICTING_CONDITION",
  "INDEPENDENT_SOLUTION_MATCHES_ANSWER",
  "TIER_BURDEN_MATCHES",
  "SOLVABLE_WITHIN_TEN_MINUTES",
  "LOGIC_NOT_CALCULATION_LOAD",
  "NO_EXCESSIVE_SOURCE_COPYING",
]);

const CALIBRATION_RULES = Object.freeze({
  minimumMatchesPerType: 30,
  defenderHighMargin: 0.08,
  defenderLowMargin: 0.08,
  minimumTierGapSignal: 0.08,
  maximumTierGapSignal: 0.25,
  perfectScoreRateMaximum: 0.15,
  zeroScoreRateMaximum: 0.1,
  completeTieRateMaximum: 0.2,
});

function normalizeTierCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return TIER_CODE_ALIASES[normalized] || normalized;
}

function resolveArenaDifficultyTier(
  _challengerTier,
  defenderTier,
  { division = "SUB" } = {}
) {
  const normalizedDefender = normalizeTierCode(defenderTier);
  const normalizedDivision = String(division || "SUB").trim().toUpperCase();
  const mapping = normalizedDivision === "MAIN"
    ? RANKED_DEFENDER_TIER_TO_DIFFICULTY
    : DEFENDER_TIER_TO_DIFFICULTY;
  const difficultyTier = mapping[normalizedDefender];
  if (!difficultyTier) {
    const error = new Error("방어자 티어에 맞는 Arena 문제 난이도를 찾을 수 없습니다.");
    error.status = 409;
    error.code = "ARENA_DEFENDER_DIFFICULTY_NOT_CONFIGURED";
    throw error;
  }
  return difficultyTier;
}

function resolveArenaDifficultyCode(
  _challengerTier,
  defenderTier,
  { division = "SUB" } = {}
) {
  const normalizedDefender = normalizeTierCode(defenderTier);
  const normalizedDivision = String(division || "SUB").trim().toUpperCase();
  const mapping = normalizedDivision === "MAIN"
    ? RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE
    : UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE;
  const difficultyCode = mapping[normalizedDefender];
  if (!difficultyCode) {
    const error = new Error("방어자 티어에 맞는 공개 Arena 난이도를 찾을 수 없습니다.");
    error.status = 409;
    error.code = "ARENA_PUBLIC_DIFFICULTY_NOT_CONFIGURED";
    throw error;
  }
  return difficultyCode;
}

function packCurveForPair(challengerTier, defenderTier) {
  const challenger = normalizeTierCode(challengerTier);
  const defender = normalizeTierCode(defenderTier);
  return challenger === "CHALLENGER" && defender === "CHALLENGER"
    ? [...CHALLENGER_PACK_CURVE]
    : [...PACK_CURVE];
}

function targetAccuracyRangeForSlot({
  difficultyCode,
  order,
  division: _division = "SUB",
} = {}) {
  const normalizedCode = String(difficultyCode || "").trim().toUpperCase();
  const normalizedOrder = Math.max(1, Math.min(5, Number(order) || 1));
  const sourceDifficultyCode = sourceDifficultyPack(normalizedCode)?.[
    normalizedOrder - 1
  ];
  const band = SOURCE_DIFFICULTY_BANDS[sourceDifficultyCode];
  if (!band) return null;
  return [
    band.minimumCorrectRatePercent / 100,
    band.maximumCorrectRatePercent / 100,
  ];
}

function publicDifficultyLevel(difficultyCode = "") {
  return Math.max(
    1,
    Math.min(9, Number(String(difficultyCode || "").replace(/^[UR]/i, "")) || 1)
  );
}

function tierForDifficultyCode(difficultyCode = "") {
  const normalized = String(difficultyCode || "").trim().toUpperCase();
  if (!/^[UR][1-9]$/.test(normalized)) return "";
  return TIER_ORDER[publicDifficultyLevel(normalized) - 1] || "";
}

function difficultyClassForDifficultyCodeSlot(difficultyCode = "", index = 0) {
  const pack = sourceDifficultyPack(difficultyCode);
  const sourceDifficultyCode = pack?.[
    Math.max(0, Math.min(4, Number(index) || 0))
  ];
  return difficultyClassForSourceDifficultyCode(sourceDifficultyCode);
}

function isAllKillerDifficultyCode(difficultyCode = "") {
  const pack = sourceDifficultyPack(difficultyCode);
  return Boolean(pack?.length) && pack.every(
    (sourceDifficultyCode) =>
      difficultyClassForSourceDifficultyCode(sourceDifficultyCode) === "KILLER"
  );
}

function expectedSlotRole({
  difficultyCode = "",
  division: _division = "SUB",
  index = 0,
  questionCount = PACK_RULES.items,
} = {}) {
  return difficultyClassForDifficultyCodeSlot(difficultyCode, index) === "KILLER"
    ? "FINAL_29_30"
    : "REGULAR";
}

function difficultyGateForQuestion({
  difficultyCode,
  order,
  slotRole: _slotRole = "REGULAR",
} = {}) {
  const normalizedCode = String(difficultyCode || "").trim().toUpperCase();
  const difficultyClass = difficultyClassForDifficultyCodeSlot(
    normalizedCode,
    Math.max(1, Math.min(5, Number(order) || 1)) - 1
  );
  const gates = {
    BASIC_GENERAL: [1, 0, 1, 1, 0.2],
    GENERAL: [1, 1, 1, 2, 0.35],
    UPPER_GENERAL: [2, 2, 2, 3, 0.5],
    SEMI_KILLER: [2, 3, 4, 4, 0.68],
    KILLER: [3, 5, 5, 5, 0.9],
  };
  const gate = gates[difficultyClass] || gates.GENERAL;
  return Object.freeze({
    difficultyClass,
    minimumCombinedConcepts: gate[0],
    minimumConditionTransformSteps: gate[1],
    minimumReasoningSteps: gate[2],
    minimumGeneratorDifficulty: gate[3],
    minimumDifficultyScore: gate[4],
    order: Math.max(1, Math.min(5, Number(order) || 1)),
  });
}

function plannedPackSlots(challengerTier, defenderTier, options = {}) {
  const difficultyTier = resolveArenaDifficultyTier(
    challengerTier,
    defenderTier,
    options
  );
  const difficultyCode = resolveArenaDifficultyCode(
    challengerTier,
    defenderTier,
    options
  );
  const curve = packCurveForPair(challengerTier, defenderTier);
  const isRanked = String(options.division || "SUB").trim().toUpperCase() === "MAIN";
  return PACK_COURSE_SLOTS.map((courseId, index) => {
    const difficultyClass = difficultyClassForDifficultyCodeSlot(
      difficultyCode,
      index
    );
    const slotRole = expectedSlotRole({
      difficultyCode,
      division: isRanked ? "MAIN" : "SUB",
      index,
      questionCount: PACK_COURSE_SLOTS.length,
    });
    const skeleton = Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS).find(
      (item) =>
        item.tier === difficultyTier &&
        item.courseId === courseId &&
        item.slotRole === slotRole
    );
    return {
      order: index + 1,
      policyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
      courseId,
      difficultyPosition: curve[index],
      difficultyTier,
      difficultyCode,
      slotRole,
      typeSkeletonId: skeleton?.typeId || "",
      sourcePositionBand: sourceBandForDifficultyClass(difficultyClass),
      difficultyClass,
      generatorDifficulty: generatorDifficultyForClass(difficultyClass),
      targetAccuracy: targetAccuracyRangeForSlot({
        difficultyCode,
        order: index + 1,
        division: isRanked ? "MAIN" : "SUB",
      }),
      referenceFamilies: skeleton?.referenceFamilies || [],
    };
  });
}

function isNaturalNumberMaxThreeDigits(value) {
  return /^[1-9][0-9]{0,2}$/.test(String(value ?? "").trim());
}

function assertNaturalNumberMaxThreeDigits(value, { allowBlank = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (allowBlank && !normalized) return "";
  if (!isNaturalNumberMaxThreeDigits(normalized)) {
    const error = new Error("답은 1부터 999까지의 자연수로 입력해주세요.");
    error.status = 400;
    error.code = "INVALID_ARENA_NATURAL_NUMBER_ANSWER";
    throw error;
  }
  return normalized;
}

function assertActiveQuestionDesign(question, options = {}) {
  const validCourses = new Set(ARENA_SUPPORTED_COURSES);
  const review = question?.validation || {};
  const withinTimeLimit =
    review.tenMinuteSolvable === true || review.twoMinuteSolvable === true;
  const difficultyCode = String(options.difficultyCode || "").toUpperCase();
  const gate = difficultyCode
    ? difficultyGateForQuestion({
        difficultyCode,
        order: options.order || question?.designSlot,
        slotRole: question?.slotRole,
      })
    : null;
  const difficultyGatePassed = !gate || (
    Number(question?.combinedConceptCount) >= gate.minimumCombinedConcepts &&
    Number(question?.conditionTransformSteps) >= gate.minimumConditionTransformSteps &&
    Number(question?.reasoningStepCount) >= gate.minimumReasoningSteps &&
    Number(question?.generatorDifficulty) >= gate.minimumGeneratorDifficulty &&
    Number(question?.difficultyScore) >= gate.minimumDifficultyScore
  );
  const valid =
    isNaturalNumberMaxThreeDigits(question?.answer) &&
    validCourses.has(String(question?.courseId || "")) &&
    Number(question?.combinedConceptCount) >= PACK_RULES.minimumCombinedConcepts &&
    Number(question?.conditionTransformSteps) >=
      PACK_RULES.minimumConditionTransformSteps &&
    Number(question?.expectedTimeMs) > 0 &&
    Number(question?.expectedTimeMs) <= PACK_RULES.expectedTimePerItemMs &&
    question?.calculationLoad === PACK_RULES.calculationLoad &&
    review.passed === true &&
    review.solvable === true &&
    review.uniqueAnswer === true &&
    review.calculatorFree === true &&
    review.answerMatches === true &&
    (review.accuracyClassCertified === true ||
      review.semiKillerCertified === true) &&
    review.curriculumCompliant === true &&
    review.conditionsConsistent === true &&
    review.tierBurdenMatches === true &&
    withinTimeLimit &&
    review.originalityChecked === true &&
    difficultyGatePassed;
  if (!valid) {
    const error = new Error(
      "활성 Arena 문항이 난이도·교육과정·풀이시간·자연수 답 검수 기준을 통과하지 못했습니다."
    );
    error.status = 422;
    error.code = "INVALID_ACTIVE_ARENA_QUESTION_DESIGN";
    throw error;
  }
  return true;
}

function assertActivePackDesign(
  pack,
  { recentTypeIdsByMatch = [] } = {}
) {
  const questions = Array.isArray(pack?.questions) ? pack.questions : [];
  if (questions.length !== PACK_RULES.items) {
    throw new Error("활성 Arena 문제 팩은 정확히 5문항이어야 합니다.");
  }
  questions.forEach((question, index) =>
    assertActiveQuestionDesign(question, {
      difficultyCode: pack?.difficultyCode,
      order: index + 1,
    })
  );
  const courseCounts = questions.reduce((counts, question) => {
    counts[question.courseId] = Number(counts[question.courseId] || 0) + 1;
    return counts;
  }, {});
  const courseMixValid = Object.entries(PACK_RULES.unitMix).every(
    ([courseId, count]) => Number(courseCounts[courseId] || 0) === count
  );
  const graphCount = questions.filter((question) => question.graphItem === true).length;
  const activeTierNumber = Number(String(pack?.difficultyTier || "").replace("T", ""));
  const graphValid =
    graphCount >= PACK_RULES.minimumGraphItems &&
    (activeTierNumber < 5 || graphCount <= PACK_RULES.maximumGraphItemsFromT5);
  const recentMatches = recentTypeIdsByMatch
    .slice(0, PACK_RULES.banRecentTypeIdsForMatches)
    .flat();
  const recentTypeSet = new Set(recentMatches.map(String));
  const historyValid = questions.every(
    (question) =>
      !recentTypeSet.has(String(question.sourceTypeId || question.typeId)) &&
      !recentTypeSet.has(String(question.typeId))
  );
  const curveValid =
    Array.isArray(pack?.packCurve) &&
    pack.packCurve.length === PACK_RULES.items &&
    questions.every(
      (question, index) =>
        question.difficultyPosition === pack.packCurve[index]
    );
  const division = String(pack?.division || "SUB").trim().toUpperCase();
  const compositionValid = questions.every((question, index) => {
    const expectedRole = expectedSlotRole({
      difficultyCode: pack?.difficultyCode,
      division,
      index,
      questionCount: questions.length,
    });
    const expectedClass = difficultyClassForDifficultyCodeSlot(
      pack?.difficultyCode,
      index
    );
    return (
      String(question?.slotRole || "").toUpperCase() === expectedRole &&
      String(question?.difficultyClass || expectedClass).toUpperCase() === expectedClass
    );
  });
  if (!courseMixValid || !graphValid || !historyValid || !curveValid || !compositionValid) {
    const error = new Error(
      "활성 Arena 문제 팩이 단원 2·2·1, 티어별 정답률 난이도 구성, 시각자료, 난이도 곡선 또는 최근 유형 제외 기준을 통과하지 못했습니다."
    );
    error.status = 422;
    error.code = "INVALID_ACTIVE_ARENA_PACK_DESIGN";
    throw error;
  }
  return true;
}

function evaluateDifficultyCalibration({
  difficultyTier,
  sampleMatches,
  defenderAccuracy,
  challengerAccuracy,
  perfectScoreMatchRate,
  zeroScoreMatchRate,
  completeTieRate,
} = {}) {
  const spec = TIER_SPECS[difficultyTier];
  if (!spec) throw new Error("보정할 난이도 등급을 확인해주세요.");
  const sampleCount = Number(sampleMatches || 0);
  if (sampleCount < CALIBRATION_RULES.minimumMatchesPerType) {
    return { ready: false, minimumRequired: CALIBRATION_RULES.minimumMatchesPerType, actions: [] };
  }
  const actions = [];
  const [defenderMin, defenderMax] = spec.defenderAccuracy;
  if (Number(defenderAccuracy) > defenderMax + CALIBRATION_RULES.defenderHighMargin) {
    actions.push("INCREASE_CASES_OR_REDUCE_GRAPH_SUPPORT");
  }
  if (Number(defenderAccuracy) < defenderMin - CALIBRATION_RULES.defenderLowMargin) {
    actions.push("REDUCE_CONDITIONS_OR_INCREASE_GRAPH_SUPPORT");
  }
  const accuracyGap = Number(defenderAccuracy) - Number(challengerAccuracy);
  if (accuracyGap < CALIBRATION_RULES.minimumTierGapSignal) {
    actions.push("RAISE_HIGH_SLOT_ONE_TIER");
  }
  if (accuracyGap > CALIBRATION_RULES.maximumTierGapSignal) {
    actions.push("LOWER_LOW_SLOT_ONE_TIER");
  }
  if (Number(perfectScoreMatchRate) > CALIBRATION_RULES.perfectScoreRateMaximum) {
    actions.push("RAISE_SLOT_FIVE");
  }
  if (Number(zeroScoreMatchRate) > CALIBRATION_RULES.zeroScoreRateMaximum) {
    actions.push("LOWER_SLOT_ONE");
  }
  if (Number(completeTieRate) > CALIBRATION_RULES.completeTieRateMaximum) {
    actions.push("USE_LOW_MID_MID_HIGH_HIGH_CURVE");
  }
  return { ready: true, policyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION, actions };
}

module.exports = {
  ARENA_FINAL_CONTENT_VERSION,
  ARENA_FALLBACK_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  ARENA_SOURCE_POSITION_BANDS,
  ARENA_SUPPORTED_COURSES,
  CALIBRATION_RULES,
  CHALLENGER_PACK_CURVE,
  DEFENDER_TIER_TO_DIFFICULTY,
  RANKED_DEFENDER_TIER_TO_DIFFICULTY,
  UNRANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE,
  RANKED_DEFENDER_TIER_TO_DIFFICULTY_CODE,
  PUBLIC_DIFFICULTY_TO_CATALOG_TIER,
  PUBLIC_DIFFICULTY_SPECS,
  PACK_COURSE_SLOTS,
  PACK_CURVE,
  PACK_RULES,
  QUESTION_REVIEW_CHECKLIST,
  SUB_MATCH_TO_DIFFICULTY,
  TIER_LABELS,
  TIER_ORDER,
  TIER_SPECS,
  TIER_TYPE_CATALOG: TIER_TYPE_SKELETON_CATALOG,
  assertActivePackDesign,
  assertActiveQuestionDesign,
  assertNaturalNumberMaxThreeDigits,
  evaluateDifficultyCalibration,
  isNaturalNumberMaxThreeDigits,
  normalizeTierCode,
  packCurveForPair,
  plannedPackSlots,
  targetAccuracyRangeForSlot,
  difficultyGateForQuestion,
  difficultyClassForDifficultyCodeSlot,
  difficultyClassForSourceDifficultyCode,
  expectedSlotRole,
  isAllKillerDifficultyCode,
  publicDifficultyLevel,
  sourceDifficultyPack,
  tierForDifficultyCode,
  privateMockCalibrationForDifficulty,
  resolveArenaDifficultyTier,
  resolveArenaDifficultyCode,
};
