const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const {
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  generateValidatedArenaOneOnOneQuestion,
} = require("./arenaOneOnOneProblemTypes");
const {
  ARENA_ONE_ON_ONE_FINAL_TYPE_IDS,
  ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  getMainTierPair,
  getSubTierPair,
} = require("./arenaOneOnOneProblemBank");
const {
  ARENA_SOURCE_POSITION_BANDS,
  ARENA_LEGACY_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  PUBLIC_DIFFICULTY_SPECS,
  TIER_SPECS,
  assertActivePackDesign,
  difficultyClassForDifficultyCodeSlot,
  packCurveForPair,
  plannedPackSlots,
  resolveArenaDifficultyCode,
  resolveArenaDifficultyTier,
} = require("./arenaOneOnOneDifficultyPolicy");
const {
  problemWithVerifiedVisualization,
} = require("./arenaProblemVisualizationPolicy");
const {
  buildArenaGeneratedAnswerKey,
  normalizeSolutionProcess,
} = require("./arenaGeneratedAnswerKey");

const ARENA_PROBLEM_COUNT = 5;
const ARENA_TOTAL_POINTS = 100;
const ARENA_PROBLEM_CATEGORY =
  "semi-killer";
const ARENA_SOURCE_POSITION_BAND_SET = new Set(
  ARENA_SOURCE_POSITION_BANDS
);

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

function normalizeArenaVisualization(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch (_error) {
    throw statusError(
      422,
      "경기 문항의 그래프 데이터를 직렬화할 수 없습니다.",
      "INVALID_ARENA_VISUALIZATION"
    );
  }
  if (serialized.length > 50000) {
    throw statusError(
      422,
      "경기 문항의 그래프 데이터가 허용 크기를 초과했습니다.",
      "ARENA_VISUALIZATION_TOO_LARGE"
    );
  }
  return JSON.parse(serialized);
}

/*
 * Mongoose minimizes empty objects while persisting Mixed values. Generated
 * answer keys intentionally contain an empty parameterSnapshot when a type
 * has no variable parameters, so hashing the in-memory draft and the stored
 * document used to produce different payloads. Rehydrate that one semantic
 * default before hashing so existing sealed packs and newly stored packs are
 * verified with the same canonical representation.
 */
function normalizeAnswerKeyForPackHash(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value || null;
  }
  return {
    ...value,
    parameterSnapshot:
      value.parameterSnapshot &&
      typeof value.parameterSnapshot === "object" &&
      !Array.isArray(value.parameterSnapshot)
        ? value.parameterSnapshot
        : {},
  };
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
    difficultyCode: source.difficultyCode || "",
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
        typeSkeletonId: question.typeSkeletonId,
        referenceFamilyIds: question.referenceFamilyIds,
        referenceFamilyLabels: question.referenceFamilyLabels,
        referenceBasis: question.referenceBasis,
        difficultyPosition: question.difficultyPosition,
        slotRole: question.slotRole,
        difficultyClass: question.difficultyClass,
        sourcePositionBand: question.sourcePositionBand,
        combinedConceptCount: question.combinedConceptCount,
        conditionTransformSteps: question.conditionTransformSteps,
        reasoningStepCount: question.reasoningStepCount,
        generatorDifficulty: question.generatorDifficulty,
        caseBranchCount: question.caseBranchCount,
        targetAccuracyMin: question.targetAccuracyMin,
        targetAccuracyMax: question.targetAccuracyMax,
        graphItem: question.graphItem,
        visualization: question.visualization || null,
        calculationLoad: question.calculationLoad,
        prompt: question.prompt,
        inputMode: question.inputMode,
        choices: question.choices,
        answer: String(question.answer),
        solution: question.solution,
        solutionProcess: question.solutionProcess || [],
        finalCheck: question.finalCheck || "",
        answerKey: normalizeAnswerKeyForPackHash(question.answerKey),
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
          structuralDifficultyPassed:
            question.validation?.structuralDifficultyPassed,
          twoMinuteSolvable: question.validation?.twoMinuteSolvable,
          tenMinuteSolvable: question.validation?.tenMinuteSolvable,
          originalityChecked: question.validation?.originalityChecked,
        },
      })
    ),
  };
}

function packHashPayloadLegacyV3(pack) {
  const payload = packHashPayload(pack);
  for (const question of payload.questions || []) {
    delete question.reasoningStepCount;
    delete question.generatorDifficulty;
    delete question.caseBranchCount;
    delete question.targetAccuracyMin;
    delete question.targetAccuracyMax;
    delete question.solutionProcess;
    delete question.finalCheck;
    delete question.answerKey;
    if (question.validation) {
      delete question.validation.structuralDifficultyPassed;
    }
  }
  return payload;
}

function packHashPayloadLegacyV2(pack) {
  const payload = packHashPayloadLegacyV3(pack);
  delete payload.difficultyCode;
  for (const question of payload.questions || []) {
    delete question.typeSkeletonId;
    delete question.referenceFamilyIds;
    delete question.referenceFamilyLabels;
    delete question.referenceBasis;
    delete question.slotRole;
    delete question.difficultyClass;
    delete question.sourcePositionBand;
    delete question.visualization;
    if (question.validation) {
      delete question.validation.tenMinuteSolvable;
    }
  }
  return payload;
}

function packHashPayloadLegacyV2_5(pack) {
  const payload = packHashPayloadLegacyV3(pack);
  delete payload.difficultyCode;
  for (const question of payload.questions || []) {
    delete question.difficultyClass;
  }
  return payload;
}

function computeHashFromPayload(payload) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize(
          payload
        )
      ),
      "utf8"
    )
    .digest("hex");
}

function computeArenaProblemPackHash(pack) {
  return computeHashFromPayload(packHashPayload(pack));
}

function computeArenaProblemPackHashCandidates(pack) {
  return [
    computeArenaProblemPackHash(pack),
    computeHashFromPayload(packHashPayloadLegacyV3(pack)),
    computeHashFromPayload(packHashPayloadLegacyV2_5(pack)),
    computeHashFromPayload(packHashPayloadLegacyV2(pack)),
  ];
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
  const v3Design = pack?.designPolicyVersion === ARENA_QUESTION_DESIGN_POLICY_VERSION;
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
  const normalizedDivision = String(pack?.division || "SUB").toUpperCase();
  const compositionValid = questions.every((question, index) => {
    const expectedClass = difficultyClassForDifficultyCodeSlot(
      pack?.difficultyCode,
      index
    );
    const categoryByClass = {
      BASIC_GENERAL: "basic-general",
      GENERAL: "general",
      UPPER_GENERAL: "upper-general",
      SEMI_KILLER: "semi-killer",
      KILLER: "killer",
    };
    const killerSlot = expectedClass === "KILLER";
    return (
      String(question.difficultyClass || "").toUpperCase() === expectedClass &&
      question.category === categoryByClass[expectedClass] &&
      String(question.slotRole || "").toUpperCase() ===
        (killerSlot ? "FINAL_29_30" : "REGULAR")
    );
  });
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
    (!activeDesign || !v3Design || compositionValid) &&
    Array.isArray(pack?.packCurve) &&
    pack.packCurve.length === ARENA_PROBLEM_COUNT &&
    activeDesignValid &&
    questions.every(
      (question) =>
        [
          "basic-general",
          "general",
          "upper-general",
          "semi-killer",
          "killer",
        ].includes(question.category) &&
        ARENA_SOURCE_POSITION_BAND_SET.has(
          String(question.sourcePositionBand || "").toUpperCase()
        ) &&
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

/*
 * A sealed pack is immutable, but the authoring schema keeps becoming more
 * specific as the Arena question policy evolves. Historical packs must not
 * fail at play time merely because a later policy added metadata such as a
 * public U/R difficulty code, source-position band, or final-slot role.
 *
 * This validator deliberately checks only the safety invariants shared by
 * every released pack. The exact historical payload is still authenticated
 * by its content hash in assertArenaProblemPackIntegrity, so this does not
 * permit a modified legacy pack to pass verification.
 */
function validateLegacySealedArenaProblemPack(pack) {
  const questions = Array.isArray(pack?.questions) ? pack.questions : [];
  const questionKeys = questions.map((question) => question.questionKey);
  const typeIds = questions.map((question) => question.typeId);
  const totalPoints = questions.reduce(
    (sum, question) => sum + Number(question.points || 0),
    0
  );
  const valid =
    Number(pack?.questionCount) === ARENA_PROBLEM_COUNT &&
    questions.length === ARENA_PROBLEM_COUNT &&
    new Set(questionKeys).size === ARENA_PROBLEM_COUNT &&
    new Set(typeIds).size === ARENA_PROBLEM_COUNT &&
    questionKeys.every(Boolean) &&
    typeIds.every(Boolean) &&
    Number(pack?.totalPoints) === ARENA_TOTAL_POINTS &&
    totalPoints === ARENA_TOTAL_POINTS &&
    Number(pack?.timeLimitMs) === ARENA_ONE_ON_ONE_TIME_LIMIT_MS &&
    Boolean(pack?.tierPairKey) &&
    Boolean(pack?.tierPairLabel) &&
    Boolean(pack?.scoringVersion) &&
    Boolean(pack?.designPolicyVersion) &&
    Boolean(pack?.contentSourceVersion) &&
    pack?.difficultyAnchor === "DEFENDER" &&
    Boolean(TIER_SPECS[pack?.difficultyTier]) &&
    Array.isArray(pack?.packCurve) &&
    pack.packCurve.length === ARENA_PROBLEM_COUNT &&
    questions.every(
      (question) =>
        ["semi-killer", "killer"].includes(question.category) &&
        question.inputMode === "short-answer" &&
        question.validation?.passed === true &&
        question.validation?.solvable === true &&
        question.validation?.uniqueAnswer === true &&
        question.validation?.calculatorFree === true &&
        question.validation?.answerMatches === true
    );

  if (!valid) {
    throw statusError(
      422,
      "봉인된 경기 문제 팩의 공통 안전 기준을 확인하지 못했습니다.",
      "INVALID_LEGACY_ARENA_PROBLEM_PACK"
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
  const difficultyCode = resolveArenaDifficultyCode(
    challengerTier,
    defenderTier,
    { division: "SUB" }
  );
  const difficultySpec =
    PUBLIC_DIFFICULTY_SPECS[difficultyCode] || TIER_SPECS[difficultyTier];
  const designSlots = plannedPackSlots(challengerTier, defenderTier);
  const questions = Array.from(
    { length: ARENA_PROBLEM_COUNT },
    (_, index) => {
      const design = designSlots[index];
      const eligibleTypeIds = (
        design.slotRole === "FINAL_29_30"
          ? ARENA_ONE_ON_ONE_FINAL_TYPE_IDS
          : ARENA_ONE_ON_ONE_SEMI_KILLER_TYPE_IDS
      ).filter((typeId) => !excludedTypeIds.includes(typeId));
      let generated = null;
      for (const typeId of eligibleTypeIds.sort(() => Math.random() - 0.5)) {
        try {
          const candidate = generateValidatedArenaOneOnOneQuestion({ typeId });
          if (candidate?.problem?.inputMode === "short-answer") {
            generated = candidate;
            break;
          }
        } catch (_error) {
          // 다른 승인 유형으로 재시도한다.
        }
      }
      if (!generated) {
        throw statusError(
          422,
          design.slotRole === "FINAL_29_30"
            ? `${index + 1}번에 배정할 서로 다른 29·30번형 킬러 문항을 자동 생성하지 못했습니다.`
            : "현재 난이도에 맞는 서로 다른 주관식 5문항을 자동 생성하지 못했습니다.",
          "ARENA_SHORT_ANSWER_GENERATION_FAILED"
        );
      }
      excludedTypeIds.push(
        generated.typeId
      );
      const { definition, problem } =
        generated;
      return {
        questionKey: `Q${index + 1}`,
        typeId: generated.typeId,
        category:
          design.slotRole === "FINAL_29_30"
            ? "killer"
            : ARENA_PROBLEM_CATEGORY,
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
        typeSkeletonId: design.typeSkeletonId,
        referenceFamilyIds: (design.referenceFamilies || []).map(
          (family) => family.familyId
        ),
        referenceFamilyLabels: (design.referenceFamilies || []).map(
          (family) => family.familyLabel
        ),
        referenceBasis: (design.referenceFamilies || []).some(
          (family) => family.basis === "OFFICIAL_MOCK_REFERENCE"
        ) ? "OFFICIAL_MOCK_REFERENCE" : "CURRICULUM_TRANSFER",
        difficultyPosition: design.difficultyPosition,
        slotRole: design.slotRole,
        difficultyClass: design.difficultyClass,
        sourcePositionBand: design.sourcePositionBand,
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
        solutionProcess: normalizeSolutionProcess(problem),
        finalCheck: String(problem.finalCheck || ""),
        answerKey:
          problem.answerKey ||
          buildArenaGeneratedAnswerKey({
            typeId: generated.typeId,
            problem,
            validation: generated.validation,
          }),
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
    difficultyCode,
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
  const rawProblem = question?.problem || question || {};
  const problem = problemWithVerifiedVisualization(rawProblem);
  const validation = question?.validation || problem.validation || {};
  const difficultyClass = String(
    question?.design?.difficultyClass ||
      (question?.design?.slotRole === "FINAL_29_30" ? "KILLER" : "SEMI_KILLER")
  ).toUpperCase();
  const answerKey =
    problem.answerKey ||
    buildArenaGeneratedAnswerKey({
      typeId: question?.typeId || problem.typeId,
      problem,
      parameters: question?.parameters || problem.parameters || {},
      validation,
    });
  return {
    questionKey: `Q${index + 1}`,
    typeId: String(question?.typeId || problem.typeId || "").trim(),
    sourceTypeId: String(
      question?.sourceTypeId || question?.typeId || problem.typeId || ""
    ).trim(),
    generatorEngineKey: String(question?.generatorEngineKey || "").trim(),
    category: ({
      BASIC_GENERAL: "basic-general",
      GENERAL: "general",
      UPPER_GENERAL: "upper-general",
      SEMI_KILLER: "semi-killer",
      KILLER: "killer",
    })[difficultyClass] || "general",
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
    typeSkeletonId: String(question?.design?.typeSkeletonId || ""),
    referenceFamilyIds: (question?.design?.referenceFamilies || [])
      .map((family) => String(family?.familyId || "").trim())
      .filter(Boolean),
    referenceFamilyLabels: (question?.design?.referenceFamilies || [])
      .map((family) => String(family?.familyLabel || "").trim())
      .filter(Boolean),
    referenceBasis: (question?.design?.referenceFamilies || [])
      .some((family) => family?.basis === "EBSI_ACCURACY_REFERENCE")
      ? "EBSI_ACCURACY_REFERENCE"
      : (question?.design?.referenceFamilies || [])
          .some((family) => family?.basis === "OFFICIAL_MOCK_REFERENCE")
        ? "OFFICIAL_MOCK_REFERENCE"
        : "CURRICULUM_TRANSFER",
    difficultyPosition: String(
      question?.design?.difficultyPosition || ""
    ).toUpperCase(),
    slotRole: String(question?.design?.slotRole || "").toUpperCase(),
    difficultyClass,
    sourcePositionBand: String(
      question?.design?.sourcePositionBand || ""
    ).toUpperCase(),
    combinedConceptCount: Number(
      question?.design?.combinedConceptCount || 0
    ),
    conditionTransformSteps: Number(
      question?.design?.conditionTransformSteps || 0
    ),
    reasoningStepCount: Number(
      question?.design?.reasoningStepCount || 0
    ),
    generatorDifficulty: Number(
      question?.design?.generatorDifficulty || 0
    ),
    caseBranchCount: Number(
      question?.design?.caseBranchCount || 0
    ),
    targetAccuracyMin: Number.isFinite(
      Number(question?.design?.targetAccuracy?.[0])
    )
      ? Number(question.design.targetAccuracy[0])
      : null,
    targetAccuracyMax: Number.isFinite(
      Number(question?.design?.targetAccuracy?.[1])
    )
      ? Number(question.design.targetAccuracy[1])
      : null,
    graphItem:
      question?.design?.graphItem === true && Boolean(problem.visualization),
    visualization: normalizeArenaVisualization(problem.visualization),
    calculationLoad: String(
      question?.design?.calculationLoad || ""
    ).toUpperCase(),
    prompt: String(problem.prompt || ""),
    inputMode: "short-answer",
    choices: [],
    answer: String(problem.answer ?? ""),
    solution: String(problem.solution || ""),
    solutionProcess: normalizeSolutionProcess(problem),
    finalCheck: String(problem.finalCheck || ""),
    answerKey,
    points: ARENA_TOTAL_POINTS / ARENA_PROBLEM_COUNT,
    validation: {
      passed: validation.passed === true,
      solvable: validation.solvable === true,
      uniqueAnswer: validation.uniqueAnswer === true,
      calculatorFree: validation.calculatorFree === true,
      answerMatches: validation.answerMatches === true,
      semiKillerCertified: validation.semiKillerCertified === true,
      accuracyClassCertified: validation.accuracyClassCertified === true,
      curriculumCompliant: validation.curriculumCompliant === true,
      conditionsConsistent: validation.conditionsConsistent === true,
      tierBurdenMatches: validation.tierBurdenMatches === true,
      structuralDifficultyPassed:
        validation.structuralDifficultyPassed === true,
      twoMinuteSolvable: validation.twoMinuteSolvable === true,
      tenMinuteSolvable: validation.tenMinuteSolvable === true,
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
      resolveArenaDifficultyTier(challengerTier, defenderTier, {
        division: normalizedDivision,
      })
  ).toUpperCase();
  const difficultyCode =
    generation?.difficultyCode ||
    resolveArenaDifficultyCode(challengerTier, defenderTier, {
      division: normalizedDivision,
    });
  const difficultySpec =
    PUBLIC_DIFFICULTY_SPECS[difficultyCode] || TIER_SPECS[difficultyTier];
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
    difficultyCode,
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
  const hashCandidates = computeArenaProblemPackHashCandidates(pack);
  const hashVersion = hashCandidates.indexOf(String(pack?.contentHash || ""));
  if (
    !["SEALED", "RETIRED"].includes(pack?.status) ||
    !pack?.contentHash ||
    hashVersion < 0
  ) {
    throw statusError(
      409,
      "봉인된 경기 문제 팩의 무결성을 확인하지 못했습니다.",
      "ARENA_PROBLEM_PACK_INTEGRITY_FAILED"
    );
  }
  if (hashVersion === 0) {
    validateArenaProblemPackDefinition(pack);
  } else {
    validateLegacySealedArenaProblemPack(pack);
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
  computeArenaProblemPackHashCandidates,
  packHashPayload,
  saveArenaProblemPack,
  sealArenaProblemPackDraft,
  validateArenaProblemPackDefinition,
};
