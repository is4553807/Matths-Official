const {
  createHash,
} = require("node:crypto");
const mongoose = require("mongoose");
const {
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  generateValidatedAdvancedQuestion,
} = require("./arenaOneOnOneProblemTypes");
const {
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  getMainTierPair,
  getSubTierPair,
} = require("./arenaOneOnOneProblemBank");
const {
  ARENA_LEGACY_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  TIER_SPECS,
  assertActivePackDesign,
  packCurveForPair,
  plannedPackSlots,
  resolveArenaDifficultyTier,
} = require("./arenaOneOnOneDifficultyPolicy");

const ARENA_PROBLEM_COUNT = 5;
const ARENA_TOTAL_POINTS = 100;
const ARENA_PROBLEM_CATEGORY =
  "semi-killer";

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanCode(value, label) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (
    code.length < 3 ||
    code.length > 120 ||
    !/^[A-Z0-9][A-Z0-9._-]+$/.test(code)
  ) {
    throw statusError(
      400,
      `${label} 코드를 확인해주세요.`,
      "INVALID_PROBLEM_PACK_CODE"
    );
  }
  return code;
}

function normalizedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date)
  ) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  if (value instanceof Date) {
    return normalizedDate(value);
  }
  return value;
}

function packHashPayload(pack) {
  const source =
    typeof pack?.toObject === "function"
      ? pack.toObject({ depopulate: true })
      : pack || {};
  return {
    version: source.version,
    division: source.division,
    matchType: source.matchType,
    tierPairKey: source.tierPairKey,
    tierPairLabel: source.tierPairLabel,
    generationMode: source.generationMode,
    generatedForMatchKey: source.generatedForMatchKey,
    designPolicyVersion: source.designPolicyVersion,
    contentSourceVersion: source.contentSourceVersion,
    problemDataVersionId: source.problemDataVersionId
      ? String(source.problemDataVersionId)
      : null,
    tierCatalogVersionId: source.tierCatalogVersionId
      ? String(source.tierCatalogVersionId)
      : null,
    designCompliance: source.designCompliance,
    difficultyAnchor: source.difficultyAnchor,
    difficultyTier: source.difficultyTier,
    targetDefenderAccuracyMin: source.targetDefenderAccuracyMin,
    targetDefenderAccuracyMax: source.targetDefenderAccuracyMax,
    targetChallengerAccuracyMin: source.targetChallengerAccuracyMin,
    targetChallengerAccuracyMax: source.targetChallengerAccuracyMax,
    packCurve: source.packCurve,
    curriculumVersion:
      source.curriculumVersion,
    curriculumCoverage:
      source.curriculumCoverage,
    questionCount: source.questionCount,
    totalPoints: source.totalPoints,
    timeLimitMs: source.timeLimitMs,
    scoringVersion: source.scoringVersion,
    variantMode: source.variantMode,
    questions: (source.questions || []).map(
      (question) => ({
        questionKey:
          question.questionKey,
        typeId: question.typeId,
        category: question.category,
        courseId: question.courseId,
        referenceFamily:
          question.referenceFamily,
        skillTags: question.skillTags,
        difficultyScore:
          question.difficultyScore,
        expectedTimeMs:
          question.expectedTimeMs,
        designPolicyVersion: question.designPolicyVersion,
        designSlot: question.designSlot,
        plannedCourseId: question.plannedCourseId,
        difficultyPosition: question.difficultyPosition,
        combinedConceptCount: question.combinedConceptCount,
        conditionTransformSteps: question.conditionTransformSteps,
        graphItem: question.graphItem,
        calculationLoad: question.calculationLoad,
        prompt: question.prompt,
        inputMode: question.inputMode,
        choices: question.choices,
        answer: String(question.answer),
        solution: question.solution,
        points: question.points,
        validation: {
          passed:
            question.validation?.passed,
          solvable:
            question.validation?.solvable,
          uniqueAnswer:
            question.validation
              ?.uniqueAnswer,
          calculatorFree:
            question.validation
              ?.calculatorFree,
          answerMatches:
            question.validation
              ?.answerMatches,
          semiKillerCertified: question.validation?.semiKillerCertified,
          curriculumCompliant: question.validation?.curriculumCompliant,
          conditionsConsistent: question.validation?.conditionsConsistent,
          tierBurdenMatches: question.validation?.tierBurdenMatches,
          twoMinuteSolvable: question.validation?.twoMinuteSolvable,
          originalityChecked: question.validation?.originalityChecked,
        },
      })
    ),
  };
}

function computeArenaProblemPackHash(pack) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize(
          packHashPayload(pack)
        )
      ),
      "utf8"
    )
    .digest("hex");
}

function validateArenaProblemPackDefinition(pack) {
  const questions = Array.isArray(
    pack?.questions
  )
    ? pack.questions
    : [];
  const questionKeys = questions.map(
    (question) => question.questionKey
  );
  const typeIds = questions.map(
    (question) => question.typeId
  );
  const totalPoints = questions.reduce(
    (sum, question) =>
      sum + Number(question.points || 0),
    0
  );
  const activeDesign = pack?.designCompliance === "ACTIVE";
  let activeDesignValid = true;
  if (activeDesign) {
    try {
      activeDesignValid =
        questions.every(
          (question) =>
            question.designPolicyVersion === pack.designPolicyVersion &&
            Number.isInteger(Number(question.designSlot))
        ) && assertActivePackDesign(pack);
    } catch (_error) {
      activeDesignValid = false;
    }
  }
  const valid =
    Number(pack?.questionCount) ===
      ARENA_PROBLEM_COUNT &&
    questions.length ===
      ARENA_PROBLEM_COUNT &&
    new Set(questionKeys).size ===
      ARENA_PROBLEM_COUNT &&
    new Set(typeIds).size ===
      ARENA_PROBLEM_COUNT &&
    Number(pack?.totalPoints) ===
      ARENA_TOTAL_POINTS &&
    totalPoints === ARENA_TOTAL_POINTS &&
    Number(pack?.timeLimitMs) >=
      ARENA_ONE_ON_ONE_TIME_LIMIT_MS &&
    Number(pack?.timeLimitMs) <=
      ARENA_ONE_ON_ONE_TIME_LIMIT_MS &&
    Boolean(pack?.tierPairKey) &&
    Boolean(pack?.tierPairLabel) &&
    Boolean(pack?.scoringVersion) &&
    Boolean(pack?.designPolicyVersion) &&
    Boolean(pack?.contentSourceVersion) &&
    pack?.difficultyAnchor === "DEFENDER" &&
    Boolean(TIER_SPECS[pack?.difficultyTier]) &&
    Array.isArray(pack?.packCurve) &&
    pack.packCurve.length === ARENA_PROBLEM_COUNT &&
    activeDesignValid &&
    questions.every(
      (question) =>
        question.category ===
          ARENA_PROBLEM_CATEGORY &&
        question.inputMode ===
          "short-answer" &&
        question.validation?.passed ===
          true &&
        question.validation?.solvable ===
          true &&
        question.validation
          ?.uniqueAnswer === true &&
        question.validation
          ?.calculatorFree === true &&
        question.validation
          ?.answerMatches === true
    );

  if (!valid) {
    throw statusError(
      422,
      "경기 문제 팩의 문항 수·유형·배점·제한 시간 또는 검산 결과가 기준에 맞지 않습니다.",
      "INVALID_ARENA_PROBLEM_PACK"
    );
  }
  return true;
}

function buildArenaProblemPackDraft({
  version,
  displayName,
  timeLimitMinutes,
  scoringVersion,
  availableFrom = new Date(),
  availableUntil = null,
  tierPairKey = "EMERALD_DIAMOND",
  tierPairLabel = "에메랄드-다이아몬드",
  generationMode = "LEGACY_MANUAL",
  generatedForMatchKey = "",
} = {}) {
  const safeVersion = cleanCode(
    version,
    "문제 팩 버전"
  );
  const safeScoringVersion = cleanCode(
    scoringVersion,
    "채점 버전"
  );
  const minutes = Number(
    timeLimitMinutes
  );
  if (
    !Number.isInteger(minutes) ||
    minutes !== 10
  ) {
    throw statusError(
      400,
      "Unranked 1대1 경기 제한 시간은 10분입니다.",
      "INVALID_ARENA_TIME_LIMIT"
    );
  }
  const normalizedPairKey = String(tierPairKey || "")
    .trim()
    .toUpperCase();
  const [challengerTier, defenderTier] =
    normalizedPairKey.split("_");
  const tierPair = getSubTierPair(challengerTier, defenderTier);
  if (!tierPair) {
    throw statusError(
      400,
      "Unranked 문제 팩의 티어 조합을 확인해주세요.",
      "INVALID_ARENA_TIER_PAIR"
    );
  }
  const from = new Date(availableFrom);
  const until = availableUntil
    ? new Date(availableUntil)
    : null;
  if (
    Number.isNaN(from.getTime()) ||
    (until &&
      (Number.isNaN(until.getTime()) ||
        until <= from))
  ) {
    throw statusError(
      400,
      "문제 팩 사용 기간을 확인해주세요.",
      "INVALID_ARENA_PACK_WINDOW"
    );
  }

  const excludedTypeIds = [];
  const difficultyTier = resolveArenaDifficultyTier(
    challengerTier,
    defenderTier
  );
  const difficultySpec = TIER_SPECS[difficultyTier];
  const designSlots = plannedPackSlots(challengerTier, defenderTier);
  const questions = Array.from(
    { length: ARENA_PROBLEM_COUNT },
    (_, index) => {
      let generated = null;
      for (let retry = 0; retry < 100; retry += 1) {
        const candidate = generateValidatedAdvancedQuestion({
          category: ARENA_PROBLEM_CATEGORY,
          excludedTypeIds,
        });
        if (candidate?.problem?.inputMode === "short-answer") {
          generated = candidate;
          break;
        }
        excludedTypeIds.push(candidate.typeId);
      }
      if (!generated) {
        throw statusError(
          422,
          "서로 다른 주관식 준킬러 5문항을 자동 생성하지 못했습니다.",
          "ARENA_SHORT_ANSWER_GENERATION_FAILED"
        );
      }
      excludedTypeIds.push(
        generated.typeId
      );
      const { definition, problem } =
        generated;
      const design = designSlots[index];
      return {
        questionKey: `Q${index + 1}`,
        typeId: generated.typeId,
        category:
          ARENA_PROBLEM_CATEGORY,
        courseId: definition.courseId,
        referenceFamily:
          definition.referenceFamily,
        skillTags:
          definition.skillTags || [],
        difficultyScore:
          definition.difficultyScore,
        expectedTimeMs:
          definition.expectedTimeMs,
        designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
        designSlot: design.order,
        plannedCourseId: design.courseId,
        difficultyPosition: design.difficultyPosition,
        combinedConceptCount: 0,
        conditionTransformSteps: 0,
        graphItem: false,
        calculationLoad: "",
        prompt: problem.prompt,
        inputMode: problem.inputMode,
        choices: (problem.choices || []).map(
          (choice) => ({
            key: String(choice.key),
            text: String(choice.text),
          })
        ),
        answer: String(problem.answer),
        solution:
          problem.solution || "",
        points:
          ARENA_TOTAL_POINTS /
          ARENA_PROBLEM_COUNT,
        validation: {
          passed:
            generated.validation.passed,
          solvable:
            generated.validation.solvable,
          uniqueAnswer:
            generated.validation
              .uniqueAnswer,
          calculatorFree:
            generated.validation
              .calculatorFree,
          answerMatches:
            generated.validation
              .answerMatches,
          semiKillerCertified: false,
          curriculumCompliant: false,
          conditionsConsistent: false,
          tierBurdenMatches: false,
          twoMinuteSolvable: false,
          originalityChecked: false,
          checkedAt:
            generated.validation
              .checkedAt || new Date(),
        },
      };
    }
  );
  const draft = {
    version: safeVersion,
    displayName:
      String(displayName || safeVersion)
        .trim()
        .slice(0, 160),
    status: "DRAFT",
    division: "SUB",
    matchType: "NORMAL",
    tierPairKey: tierPair.key,
    tierPairLabel: tierPairLabel || tierPair.label,
    generationMode,
    generatedForMatchKey,
    designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
    contentSourceVersion: ARENA_LEGACY_CONTENT_VERSION,
    designCompliance: "PENDING_FINAL_GENERATORS",
    difficultyAnchor: "DEFENDER",
    difficultyTier,
    targetDefenderAccuracyMin: difficultySpec.defenderAccuracy[0],
    targetDefenderAccuracyMax: difficultySpec.defenderAccuracy[1],
    targetChallengerAccuracyMin: difficultySpec.challengerAccuracy[0],
    targetChallengerAccuracyMax: difficultySpec.challengerAccuracy[1],
    packCurve: packCurveForPair(challengerTier, defenderTier),
    curriculumVersion: "KR-2022",
    curriculumCoverage: [
      ...new Set(
        questions.map(
          (question) =>
            question.courseId
        )
      ),
    ],
    questionCount:
      ARENA_PROBLEM_COUNT,
    totalPoints: ARENA_TOTAL_POINTS,
    timeLimitMs: minutes * 60 * 1000,
    scoringVersion:
      safeScoringVersion,
    variantMode: "SAME",
    questions,
    availableFrom: from,
    availableUntil: until,
  };
  validateArenaProblemPackDefinition(draft);
  draft.contentHash =
    computeArenaProblemPackHash(draft);
  return draft;
}

function normalizeGeneratedArenaQuestion(question, index, checkedAt) {
  const definition = question?.definition || {};
  const problem = question?.problem || question || {};
  const validation = question?.validation || problem.validation || {};
  return {
    questionKey: `Q${index + 1}`,
    typeId: String(question?.typeId || problem.typeId || "").trim(),
    category: ARENA_PROBLEM_CATEGORY,
    courseId: String(
      question?.courseId || definition.courseId || problem.courseId || ""
    ).trim(),
    referenceFamily: String(
      question?.referenceFamily ||
        definition.referenceFamily ||
        problem.referenceFamily ||
        ""
    ).trim(),
    skillTags:
      question?.skillTags || definition.skillTags || problem.skillTags || [],
    difficultyScore: Number(
      question?.difficultyScore ??
        definition.difficultyScore ??
        problem.difficultyScore
    ),
    expectedTimeMs: Number(
      question?.expectedTimeMs ??
        definition.expectedTimeMs ??
        problem.expectedTimeMs
    ),
    designPolicyVersion: String(
      question?.design?.policyVersion || ""
    ).toUpperCase(),
    designSlot: Number(question?.design?.order || index + 1),
    plannedCourseId: String(question?.design?.courseId || ""),
    difficultyPosition: String(
      question?.design?.difficultyPosition || ""
    ).toUpperCase(),
    combinedConceptCount: Number(
      question?.design?.combinedConceptCount || 0
    ),
    conditionTransformSteps: Number(
      question?.design?.conditionTransformSteps || 0
    ),
    graphItem: question?.design?.graphItem === true,
    calculationLoad: String(
      question?.design?.calculationLoad || ""
    ).toUpperCase(),
    prompt: String(problem.prompt || ""),
    inputMode: "short-answer",
    choices: [],
    answer: String(problem.answer ?? ""),
    solution: String(problem.solution || ""),
    points: ARENA_TOTAL_POINTS / ARENA_PROBLEM_COUNT,
    validation: {
      passed: validation.passed === true,
      solvable: validation.solvable === true,
      uniqueAnswer: validation.uniqueAnswer === true,
      calculatorFree: validation.calculatorFree === true,
      answerMatches: validation.answerMatches === true,
      semiKillerCertified: validation.semiKillerCertified === true,
      curriculumCompliant: validation.curriculumCompliant === true,
      conditionsConsistent: validation.conditionsConsistent === true,
      tierBurdenMatches: validation.tierBurdenMatches === true,
      twoMinuteSolvable: validation.twoMinuteSolvable === true,
      originalityChecked: validation.originalityChecked === true,
      checkedAt: validation.checkedAt
        ? new Date(validation.checkedAt)
        : checkedAt,
    },
  };
}

function buildGeneratedArenaProblemPackDraft({
  generation,
  matchKey,
  generatedAt = new Date(),
  scoringVersion = "ARENA-SCORING-V1",
  division = "SUB",
  matchType = "NORMAL",
} = {}) {
  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    throw statusError(
      400,
      "문제 생성 시각을 확인해주세요.",
      "INVALID_ARENA_GENERATION_TIME"
    );
  }
  const pairKey = String(generation?.pairKey || "").toUpperCase();
  const [challengerTier, defenderTier] = pairKey.split("_");
  const normalizedDivision = String(division || "SUB").toUpperCase();
  const pair = normalizedDivision === "MAIN"
    ? getMainTierPair(challengerTier, defenderTier)
    : getSubTierPair(challengerTier, defenderTier);
  if (!pair || !matchKey) {
    throw statusError(
      400,
      "자동 생성 문제의 경기와 티어 조합을 확인해주세요.",
      "INVALID_GENERATED_ARENA_PACK_TARGET"
    );
  }
  const questions = (generation.questions || []).map(
    (question, index) =>
      normalizeGeneratedArenaQuestion(question, index, generatedDate)
  );
  const difficultyTier = String(
    generation?.difficultyTier ||
      resolveArenaDifficultyTier(challengerTier, defenderTier)
  ).toUpperCase();
  const difficultySpec = TIER_SPECS[difficultyTier];
  const versionHash = createHash("sha256")
    .update(String(matchKey), "utf8")
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  const draft = {
    version: `${normalizedDivision}-AUTO-${pair.key}-${versionHash}`,
    displayName: `${pair.label} 자동 생성 경기 문제`,
    status: "DRAFT",
    division: normalizedDivision,
    matchType: String(matchType || "NORMAL").toUpperCase(),
    tierPairKey: pair.key,
    tierPairLabel: pair.label,
    generationMode: "AUTO_ON_CHALLENGE",
    generatedForMatchKey: String(matchKey),
    designPolicyVersion:
      generation.designPolicyVersion || ARENA_QUESTION_DESIGN_POLICY_VERSION,
    contentSourceVersion:
      generation.contentSourceVersion || ARENA_LEGACY_CONTENT_VERSION,
    problemDataVersionId: generation.problemDataVersionId || null,
    tierCatalogVersionId: generation.tierCatalogVersionId || null,
    designCompliance:
      generation.designCompliance || "PENDING_FINAL_GENERATORS",
    difficultyAnchor: "DEFENDER",
    difficultyTier,
    targetDefenderAccuracyMin: difficultySpec.defenderAccuracy[0],
    targetDefenderAccuracyMax: difficultySpec.defenderAccuracy[1],
    targetChallengerAccuracyMin: difficultySpec.challengerAccuracy[0],
    targetChallengerAccuracyMax: difficultySpec.challengerAccuracy[1],
    packCurve:
      generation.packCurve || packCurveForPair(challengerTier, defenderTier),
    curriculumVersion: "KR-2022",
    curriculumCoverage: [
      ...new Set(questions.map((question) => question.courseId).filter(Boolean)),
    ],
    questionCount: ARENA_PROBLEM_COUNT,
    totalPoints: ARENA_TOTAL_POINTS,
    timeLimitMs: ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
    scoringVersion: cleanCode(scoringVersion, "채점 버전"),
    variantMode: "SAME",
    questions,
    availableFrom: generatedDate,
    availableUntil: null,
  };
  validateArenaProblemPackDefinition(draft);
  draft.contentHash = computeArenaProblemPackHash(draft);
  return draft;
}

function sealArenaProblemPackDraft(
  draft,
  {
    sealedAt = new Date(),
    sealedBy = null,
    autoValidated = false,
  } = {}
) {
  validateArenaProblemPackDefinition(draft);
  if (!autoValidated && !mongoose.isValidObjectId(sealedBy)) {
    throw statusError(
      400,
      "문제 팩을 검토한 운영자 정보를 확인해주세요.",
      "ARENA_PROBLEM_PACK_REVIEWER_REQUIRED"
    );
  }
  const sealed = {
    ...draft,
    status: "SEALED",
    contentHash:
      computeArenaProblemPackHash(draft),
    sealedAt: new Date(sealedAt),
    sealedBy,
    autoValidatedAt: autoValidated
      ? new Date(sealedAt)
      : null,
  };
  return sealed;
}

function assertArenaProblemPackIntegrity(pack) {
  validateArenaProblemPackDefinition(pack);
  const actual =
    computeArenaProblemPackHash(pack);
  if (
    !["SEALED", "RETIRED"].includes(
      pack?.status
    ) ||
    !pack?.contentHash ||
    actual !== pack.contentHash
  ) {
    throw statusError(
      409,
      "봉인된 경기 문제 팩의 무결성을 확인하지 못했습니다.",
      "ARENA_PROBLEM_PACK_INTEGRITY_FAILED"
    );
  }
  return true;
}

async function saveArenaProblemPack(pack) {
  validateArenaProblemPackDefinition(pack);
  const existing =
    await ArenaProblemPack.findOne({
      version: pack.version,
    });
  if (
    existing &&
    ["SEALED", "RETIRED"].includes(
      existing.status
    )
  ) {
    throw statusError(
      409,
      "이미 봉인하거나 종료한 경기 문제 팩 버전은 덮어쓸 수 없습니다.",
      "ARENA_PROBLEM_PACK_IMMUTABLE"
    );
  }
  if (!existing) {
    return ArenaProblemPack.create(pack);
  }
  existing.set(pack);
  return existing.save();
}

module.exports = {
  ARENA_PROBLEM_CATEGORY,
  ARENA_PROBLEM_COUNT,
  ARENA_TOTAL_POINTS,
  assertArenaProblemPackIntegrity,
  buildArenaProblemPackDraft,
  buildGeneratedArenaProblemPackDraft,
  computeArenaProblemPackHash,
  packHashPayload,
  saveArenaProblemPack,
  sealArenaProblemPackDraft,
  validateArenaProblemPackDefinition,
};
