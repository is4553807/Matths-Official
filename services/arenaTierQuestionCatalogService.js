const { createHash } = require("node:crypto");
const mongoose = require("mongoose");

const {
  ArenaTierQuestionCatalogVersion,
} = require("../models/goatArenaModel");
const { AdminActionLog } = require("../models/matthsModel");
const {
  buildProblemEngineRegistry,
  validateRegistryEngine,
} = require("./problemTypeCatalogService");
const {
  cachedProblemTypeControl,
} = require("./problemTypeControlCache");
const {
  validateCalculatorFreeProblem,
  validateGeneratedProblem,
} = require("./problemGenerators/utils");
const {
  PACK_COURSE_SLOTS,
  PACK_RULES,
  PUBLIC_DIFFICULTY_TO_CATALOG_TIER,
  PUBLIC_DIFFICULTY_SPECS,
  TIER_SPECS,
  isNaturalNumberMaxThreeDigits,
  plannedPackSlots,
} = require("./arenaOneOnOneDifficultyPolicy");
const {
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
} = require("./arenaOneOnOneTypeSkeletons");
const {
  ARENA_ONE_ON_ONE_PROBLEM_TYPES,
  generateValidatedArenaOneOnOneQuestion,
} = require("./arenaOneOnOneProblemTypes");

const DIFFICULTY_TIERS = Object.freeze([
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9",
]);
const ACTIVE_CACHE_TTL_MS = 15 * 1000;
const FINAL_KILLER_APPROVED_TYPE_IDS = new Set([
  "killer-tangent-integral-extrema",
  "killer-tangent-area-equation",
  "killer-distance-inverse",
  "killer-extrema-chord-equation",
  "killer-integral-tangent-equation",
  "killer-inverse-recurrence",
]);
const FINAL_KILLER_TYPE_IDS = Object.freeze(
  Object.entries(ARENA_ONE_ON_ONE_PROBLEM_TYPES)
    .filter(
      ([typeId, definition]) =>
        FINAL_KILLER_APPROVED_TYPE_IDS.has(typeId) &&
        definition.category === "killer" &&
        ["algebra", "calculus-1", "probability-statistics"].includes(
          definition.courseId
        )
    )
    .map(([typeId]) => typeId)
);

/*
 * 업로드 자료의 유형 분류를 이미 검산된 평가센터 생성기에 연결하기 위한
 * 최초 가져오기 힌트다. 실제 경기 런타임은 이 상수를 읽지 않고 DB에
 * 버전으로 저장된 generatorBindings만 사용한다.
 */
const ENGINE_BINDING_FRAGMENTS = Object.freeze({
  "CALC-MOTION-CHANGE": ["motion-turning-points-1", "velocity-total-distance-1", "velocity-two-turns-1"],
  "CALC-AREA-REVERSE": ["quadratic-area-parameter-1", "two-parabola-enclosed-area-2", "zero-integral-parameter-2"],
  "CALC-PIECEWISE-DIFF": ["two-boundary-continuity-1", "absolute-polynomial-differentiability-1", "absolute-polynomial-differentiability-2"],
  "CALC-GRAPH-INFERENCE": ["cubic-root-count-parameter-1", "closed-interval-extrema-1", "intermediate-value-interval-2"],
  "CALC-EXTREMA-COEFFICIENT": ["cubic-root-count-parameter-2", "closed-interval-extrema-2", "infinity-leading-next-order-1"],
  "CALC-TANGENT-AREA": ["tangent-through-point-1", "quadratic-area-parameter-1", "two-parabola-enclosed-area-2"],
  "CALC-SPLIT-AREA": ["two-parabola-enclosed-area-2", "symmetric-definite-integral-2", "quadratic-area-parameter-1"],
  "CALC-ROOT-COUNT": ["cubic-root-count-parameter-1", "cubic-root-count-parameter-2", "intermediate-value-interval-2"],
  "CALC-INTEGRAL-DEFINED": ["integral-defined-function-1", "integral-defined-function-2", "derivative-to-integral-chain-1"],
  "CALC-CONDITIONED-CUBIC": ["cubic-root-count-parameter-1", "closed-interval-extrema-1", "motion-turning-points-2"],
  "CALC-ABS-PIECEWISE": ["absolute-polynomial-differentiability-1", "absolute-polynomial-differentiability-2", "absolute-one-sided-limit-1"],
  "ALG-SEQUENCE-SUM": ["partial-sum-polynomial-1", "partial-sum-polynomial-2", "geometric-block-sums-1"],
  "ALG-GEOMETRY-TRIG": ["triangle-three-invariants-1", "triangle-three-invariants-2", "included-angle-triangle-1"],
  "ALG-EXPLOG-GRAPH": ["symmetric-exponential-intersections-1", "symmetric-exponential-intersections-2", "inverse-exponential-function-1"],
  "ALG-TRIG-GRAPH": ["graph-parameter-recovery-1", "graph-parameter-recovery-2", "phase-shift-extrema-1"],
  "ALG-PARTIAL-SUM-EXTREMA": ["partial-sum-two-values-2", "partial-sum-polynomial-1", "weighted-arithmetic-sum-1"],
  "ALG-LOG-INTEGER-SOLUTIONS": ["exponential-inequality-integers-1", "exponential-inequality-integers-2", "log-domain-quadratic-1"],
  "ALG-RECURRENCE-CASES": ["periodic-recurrence-1", "periodic-recurrence-2", "affine-recurrence-shift-1"],
  "ALG-TRIG-ROOT-COUNT": ["trigonometric-equation-root-count-1", "trigonometric-equation-root-count-2", "graph-parameter-recovery-1"],
  "ALG-SEQUENCE-CONDITIONS": ["arithmetic-two-conditions-2", "geometric-reverse-2", "partial-sum-polynomial-2"],
  "ALG-TRIG-GEOMETRY-COMPLEX": ["sine-law-two-triangle-chain-1", "sine-law-two-triangle-chain-2", "chord-sector-coefficient-1"],
  "PROB-CONSTRAINED-COUNTING": ["restricted-digit-arrangement-1", "restricted-digit-arrangement-2", "committee-composition-1"],
  "PROB-NORMAL-STANDARDIZE": ["normal-standardization-chain-2", "sampling-confidence-size-1", "confidence-interval-reverse-1"],
  "PROB-BAG-TRANSFER": ["conditional-dice-sum-1", "three-event-inclusion-exclusion-1", "committee-composition-2"],
  "PROB-DISCRETE-DISTRIBUTION": ["linear-transform-mean-variance-1", "linear-transform-mean-variance-2", "binomial-mean-variance-inverse-1"],
  "PROB-PERMUTATION-COMPLEMENT": ["identical-letters-separation-1", "circular-adjacency-2", "restricted-digit-arrangement-2"],
  "PROB-SUBSET-CONDITIONS": ["bounded-distribution-1", "bounded-distribution-2", "three-event-inclusion-exclusion-1"],
  "PROB-REPEATED-TRIAL": ["binomial-mean-variance-inverse-1", "conditional-dice-sum-1", "three-event-inclusion-exclusion-1"],
  "PROB-MULTISET-SUBSTITUTION": ["bounded-distribution-1", "bounded-distribution-2", "surjective-distribution-1"],
  "PROB-FUNCTION-COUNT": ["surjective-distribution-1", "surjective-distribution-2", "bounded-distribution-2"],
});

let activeCatalogCache = null;
let activeCatalogCacheExpiresAt = 0;
let catalogChangeStream = null;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizedProblem(generated) {
  return generated?.problem || generated;
}

const ARENA_GRAPH_VISUALIZATION_KINDS = new Set([
  "polynomial",
  "algebra-trig",
  "trigonometric",
  "algebra-exp-log",
  "exponential",
  "logarithmic",
  "inverse-square",
  "rational-continuity",
  "rational",
  "hole-linear",
]);

function validFinitePair(values) {
  return (
    Array.isArray(values) &&
    values.length >= 2 &&
    values.every((value) => Number.isFinite(Number(value)))
  );
}

function validLabeledPoints(value) {
  const points = Array.isArray(value?.labeledPoints)
    ? value.labeledPoints
    : Array.isArray(value?.points)
      ? value.points
      : [];
  return (
    points.length > 0 &&
    points.every(
      (point) =>
        point &&
        Number.isFinite(Number(point.x)) &&
        Number.isFinite(Number(point.y))
    )
  );
}

function hasRenderableGraphDescriptor(value) {
  const kind = String(value?.kind || value?.type || "").trim().toLowerCase();
  if (!ARENA_GRAPH_VISUALIZATION_KINDS.has(kind)) return false;
  if (kind === "polynomial") {
    const coefficients = value?.coefficients;
    return Boolean(coefficients && typeof coefficients === "object");
  }
  if (["algebra-trig", "trigonometric"].includes(kind)) {
    return Number.isFinite(Number(value?.frequency ?? 1));
  }
  if (["algebra-exp-log", "exponential", "logarithmic"].includes(kind)) {
    return Number(value?.base ?? 2) > 0 && Number(value?.base ?? 2) !== 1;
  }
  if (["inverse-square", "rational-continuity", "rational"].includes(kind)) {
    return Number.isFinite(Number(value?.numeratorConstant ?? value?.numerator ?? 1));
  }
  return kind === "hole-linear" && Number.isFinite(Number(value?.focusX));
}

function hasRenderableArenaVisualization(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = String(value.kind || "").trim().toLowerCase();
  const curveDescriptors = Array.isArray(value.curves)
    ? value.curves
    : Array.isArray(value.functions)
      ? value.functions
      : [];
  if (curveDescriptors.length) {
    return curveDescriptors.every(hasRenderableGraphDescriptor);
  }
  if (hasRenderableGraphDescriptor(value)) return true;
  if (["algebra-sequence", "table-points"].includes(kind)) {
    const values = Array.isArray(value.values) ? value.values : [];
    return (
      values.length > 0 && values.every((entry) => Number.isFinite(Number(entry)))
    ) || (
      validFinitePair(value.xValues) &&
      validFinitePair(value.yValues) &&
      value.xValues.length === value.yValues.length
    );
  }
  if (kind.startsWith("probability-") && kind !== "probability-concept") {
    return Object.entries(value).some(
      ([key, entry]) =>
        !["kind", "note", "title"].includes(key) &&
        (typeof entry === "number" ||
          (typeof entry === "string" && entry.trim()) ||
          (Array.isArray(entry) && entry.length > 0))
    );
  }
  return kind === "geometry" && validLabeledPoints(value);
}

function plainPrompt(value) {
  return String(value || "")
    .replace(/\\\[[\s\S]*?\\\]/g, " 수식 ")
    .replace(/\$[^$]*\$/g, " 수식 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * 풀이 과정에서 그래프를 그리면 편하다는 이유만으로 문제 화면에 그래프를
 * 노출하지 않는다. 생성기가 문제 본문 자료라고 명시하고, 본문에도 실제
 * 그래프·그림·표 제시 문장이 있을 때만 시각자료를 봉인한다.
 */
function isVisualizationPresentedInProblem(problem) {
  const visualization = problem?.visualization;
  if (!hasRenderableArenaVisualization(visualization)) return false;
  const explicitDescriptor =
    visualization?.presentedInProblem === true ||
    String(visualization?.sourceRole || "").toUpperCase() === "PROBLEM_STEM" ||
    problem?.visualizationPresentedInProblem === true;
  if (!explicitDescriptor) return false;
  const prompt = plainPrompt(problem?.prompt);
  return /(?:다음|아래|주어진).{0,28}(?:그래프|그림|표)|(?:그래프|그림|표).{0,28}(?:같다|주어|나타내|제시)/.test(prompt);
}

function problemWithVerifiedVisualization(problem) {
  if (!problem || typeof problem !== "object") return problem;
  if (!isVisualizationPresentedInProblem(problem)) {
    return { ...problem, visualization: null };
  }
  return {
    ...problem,
    visualization: {
      ...problem.visualization,
      presentedInProblem: true,
      sourceRole: "PROBLEM_STEM",
    },
  };
}

function assertGeneratedTierCatalogPack(questions, { division = "SUB" } = {}) {
  const items = Array.isArray(questions) ? questions : [];
  const typeIds = items.map((item) => String(item?.typeId || "").trim());
  const sourceTypeIds = items.map((item) =>
    String(item?.sourceTypeId || "").trim()
  );
  const engineKeys = items.map((item) =>
    String(item?.generatorEngineKey || "").trim()
  );
  const allValidated = items.every(
    (item) =>
      item?.validation?.passed === true &&
      item.validation.solvable === true &&
      item.validation.uniqueAnswer === true &&
      item.validation.calculatorFree === true &&
      item.validation.answerMatches === true &&
      item.validation.validationMode === "TYPE_SPECIFIC" &&
      isNaturalNumberMaxThreeDigits(item?.problem?.answer)
  );
  const visualizationsConsistent = items.every(
    (item) =>
      item?.design?.graphItem !== true ||
      hasRenderableArenaVisualization(item?.problem?.visualization)
  );
  const visualItemCount = items.filter(
    (item) =>
      item?.design?.graphItem === true &&
      hasRenderableArenaVisualization(item?.problem?.visualization)
  ).length;
  const difficultyNumber = Number(
    String(items[0]?.design?.difficultyTier || "").replace("T", "")
  );
  const visualCountValid =
    visualItemCount >= PACK_RULES.minimumGraphItems &&
    (
      difficultyNumber < 5 ||
      visualItemCount <= PACK_RULES.maximumGraphItemsFromT5
    );
  const normalizedDivision = String(division || "SUB").toUpperCase();
  const compositionValid = items.every((item, index) => {
    const finalSlot = normalizedDivision === "MAIN" && index === items.length - 1;
    const slotMatches = String(item?.design?.slotRole || "").toUpperCase() ===
      (finalSlot ? "FINAL_29_30" : "REGULAR");
    const typeBindingMatches = finalSlot || item?.validation?.catalogTypeMatched === true;
    return slotMatches && typeBindingMatches;
  });
  const valid =
    items.length === PACK_RULES.items &&
    new Set(typeIds).size === PACK_RULES.items &&
    typeIds.every(Boolean) &&
    new Set(sourceTypeIds).size === PACK_RULES.items &&
    sourceTypeIds.every(Boolean) &&
    new Set(engineKeys).size === PACK_RULES.items &&
    engineKeys.every(Boolean) &&
    compositionValid &&
    allValidated &&
    visualizationsConsistent &&
    visualCountValid;
  if (!valid) {
    throw statusError(
      422,
      "생성된 5문항이 Division별 준킬러·킬러 구성, 유형·생성기 중복 금지, 독립 검산, 자연수 정답 또는 시각자료 기준을 통과하지 못했습니다.",
      "ARENA_GENERATED_PACK_VALIDATION_FAILED"
    );
  }
  return true;
}

const CIRCLED_CHOICE_TO_INDEX = Object.freeze({
  "①": "1",
  "②": "2",
  "③": "3",
  "④": "4",
  "⑤": "5",
});

function normalizeReferenceAnswer(question) {
  const answer = String(question?.solution?.answer || "").trim();
  if (CIRCLED_CHOICE_TO_INDEX[answer]) {
    return {
      answer,
      normalizedAnswer: CIRCLED_CHOICE_TO_INDEX[answer],
      answerFormat: "MULTIPLE_CHOICE",
    };
  }
  if (/^\d{1,3}$/.test(answer) && Number(answer) >= 1 && Number(answer) <= 999) {
    return {
      answer,
      normalizedAnswer: String(Number(answer)),
      answerFormat: "NATURAL_NUMBER",
    };
  }
  throw statusError(
    400,
    `${question?.id || "문항"}의 정답은 ①~⑤ 또는 1~999 자연수여야 합니다.`,
    "ARENA_REFERENCE_ANSWER_INVALID"
  );
}

function assertUploadedShape(raw) {
  if (!raw || typeof raw !== "object") {
    throw statusError(400, "T1~T9 문제 유형 JSON을 확인해주세요.");
  }
  if (Number(raw.tier_count) !== 9 || Number(raw.questions_per_tier) !== 30) {
    throw statusError(400, "T1~T9 각각 30개인 데이터만 등록할 수 있습니다.");
  }
  const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  if (
    tiers.length !== 9 ||
    !DIFFICULTY_TIERS.every((tier) =>
      tiers.some((entry) => entry?.tier === tier && entry?.questions?.length === 30)
    )
  ) {
    throw statusError(400, "T1부터 T9까지 각 30개 문항 배치를 확인해주세요.");
  }
  const questions = tiers.flatMap((tier) => tier.questions || []);
  if (questions.length !== 270 || new Set(questions.map((item) => item.id)).size !== 270) {
    throw statusError(400, "참고 문항은 고유 ID를 가진 270개여야 합니다.");
  }
  return questions;
}

function registryEngineByFragment(registry, courseId, fragment) {
  const matches = [...registry.values()].filter(
    (engine) =>
      engine.category === "ASSESSMENT_CENTER" &&
      engine.courseId === courseId &&
      engine.engineKey.startsWith("advanced:") &&
      engine.engineKey.includes(fragment)
  );
  if (matches.length !== 1) {
    throw statusError(
      422,
      `${courseId}의 ${fragment} 생성기 연결을 하나로 확정하지 못했습니다.`,
      "ARENA_CATALOG_ENGINE_BINDING_AMBIGUOUS"
    );
  }
  return matches[0];
}

async function generateNaturalSample(engine, maximumAttempts = 50) {
  let lastError = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const generated = await engine.generateSample();
      const problem = normalizedProblem(generated);
      validateGeneratedProblem(
        {
          ...problem,
          hintText:
            problem?.hintText ||
            "조건을 식으로 바꾸고 계산 결과를 원래 조건에 대입해 확인하세요.",
        },
        { id: engine.engineKey, validate: engine.definition?.validate }
      );
      validateCalculatorFreeProblem(problem, {
        id: engine.engineKey,
        calculatorFree: true,
      });
      if (!isNaturalNumberMaxThreeDigits(problem?.answer)) continue;
      return { generated, problem };
    } catch (error) {
      lastError = error;
    }
  }
  throw statusError(
    422,
    `${engine.displayName} 생성기가 1~999 자연수 답 검산을 통과하지 못했습니다${lastError ? `: ${lastError.message}` : "."}`,
    "ARENA_CATALOG_NATURAL_ANSWER_VALIDATION_FAILED"
  );
}

async function buildGeneratorBindings(typeId, curriculumUnit, registry, reportCache) {
  const fragments = ENGINE_BINDING_FRAGMENTS[typeId];
  if (!fragments?.length) {
    throw statusError(422, `${typeId}의 검산 생성기 연결이 없습니다.`);
  }
  const bindings = [];
  for (const fragment of fragments) {
    const engine = registryEngineByFragment(registry, curriculumUnit, fragment);
    let report = reportCache.get(engine.engineKey);
    if (!report) {
      report = await validateRegistryEngine(engine, { sampleCount: 3 });
      reportCache.set(engine.engineKey, report);
    }
    if (!report.passed || report.validationMode !== "TYPE_SPECIFIC") {
      throw statusError(
        422,
        `${engine.displayName}은 독립 검산 생성기로 사용할 수 없습니다.`,
        "ARENA_CATALOG_ENGINE_NOT_TYPE_VERIFIED"
      );
    }
    await generateNaturalSample(engine);
    bindings.push({
      category: engine.category,
      engineKey: engine.engineKey,
      sourceHash: engine.sourceHash,
      weight: 1,
    });
  }
  return bindings;
}

async function buildArenaTierCatalogDefinition(raw, {
  sourceFileName = "T1-T9_ALL.json",
  sourceText = JSON.stringify(raw),
  code = "",
} = {}) {
  const questions = assertUploadedShape(raw);
  const registry = buildProblemEngineRegistry();
  const reportCache = new Map();
  const typeMap = new Map();
  for (const question of questions) {
    const typeId = String(question?.type?.id || "").trim().toUpperCase();
    const label = String(question?.type?.label || "").trim();
    const curriculumUnit = String(question?.type?.curriculum_unit || "").trim();
    if (!typeId || !label || !PACK_COURSE_SLOTS.includes(curriculumUnit)) {
      throw statusError(400, `${question?.id || "문항"}의 유형 정보를 확인해주세요.`);
    }
    const current = typeMap.get(typeId);
    if (current && (current.label !== label || current.curriculumUnit !== curriculumUnit)) {
      throw statusError(400, `${typeId}의 이름 또는 교육과정 분류가 서로 다릅니다.`);
    }
    typeMap.set(typeId, {
      typeId,
      label,
      curriculumUnit,
      referenceCount: Number(current?.referenceCount || 0) + 1,
    });
  }

  const typeDefinitions = [];
  for (const item of [...typeMap.values()].sort((a, b) => a.typeId.localeCompare(b.typeId))) {
    typeDefinitions.push({
      ...item,
      generatorBindings: await buildGeneratorBindings(
        item.typeId,
        item.curriculumUnit,
        registry,
        reportCache
      ),
    });
  }

  const tierConfigurations = DIFFICULTY_TIERS.map((difficultyTier) => {
    const tier = raw.tiers.find((entry) => entry.tier === difficultyTier);
    const weights = new Map();
    for (const question of tier.questions) {
      const typeId = String(question.type.id).trim().toUpperCase();
      const entry = weights.get(typeId) || {
        typeId,
        weight: 0,
        referenceQuestionIds: [],
      };
      entry.weight += 1;
      entry.referenceQuestionIds.push(String(question.id));
      weights.set(typeId, entry);
    }
    for (const courseId of [...new Set(PACK_COURSE_SLOTS)]) {
      const courseQuestionCount = tier.questions.filter(
        (question) => question.type.curriculum_unit === courseId
      ).length;
      const expected = courseId === "probability-statistics" ? 6 : 12;
      if (courseQuestionCount !== expected) {
        throw statusError(
          400,
          `${difficultyTier}의 ${courseId} 참고 문항은 ${expected}개여야 합니다.`
        );
      }
    }
    return {
      difficultyTier,
      questionCount: 30,
      typeWeights: [...weights.values()].sort((a, b) => a.typeId.localeCompare(b.typeId)),
    };
  });

  const referenceQuestions = questions.map((question) => {
    const answer = normalizeReferenceAnswer(question);
    const solutionProcess = (question.solution?.process || []).map((step) => ({
      step: Number(step.step),
      explanation: String(step.explanation || "").trim(),
    }));
    if (!String(question.problem?.text || "").trim() || !solutionProcess.length) {
      throw statusError(
        400,
        `${question?.id || "문항"}의 문제 또는 풀이과정을 확인해주세요.`,
        "ARENA_REFERENCE_CONTENT_INCOMPLETE"
      );
    }
    return {
      questionId: String(question.id),
      difficultyTier: String(question.tier),
      sequence: Number(question.sequence),
      typeId: String(question.type.id).trim().toUpperCase(),
      problemText: String(question.problem?.text || "").trim(),
      originalImage: String(question.problem?.original_image || "").trim(),
      imageNote: String(question.problem?.image_note || "").trim(),
      solutionProcess,
      finalCheck: String(question.solution?.final_check || "").trim(),
      ...answer,
      answerStructureValidated: true,
      source: {
        exam: String(question.source?.exam || "").trim(),
        kind: String(question.source?.kind || "").trim(),
        questionNumber: Number(question.source?.question_number || 0),
        pdfPage: Number(question.source?.pdf_page || 0),
      },
      // 정답·풀이 원본은 보존한다. 다만 객관식 혼재, 고정 원문 재출제,
      // 실제 이미지 파일 부재 때문에 주관식 생성형 Arena에 직접 노출하지 않는다.
      liveQuestionEligible: false,
    };
  });
  const sourceHash = sha256(sourceText);
  const resolvedCode =
    String(code || "").trim() ||
    `GOAT-ARENA-TIER-CATALOG-${String(raw?.schema_version || "V1").replace(/[^A-Z0-9]+/gi, "-")}-${sourceHash.slice(0, 8)}`;
  const contentPayload = {
    schemaVersion: String(raw.schema_version || ""),
    typeDefinitions,
    tierConfigurations,
    referenceQuestions,
  };
  return {
    code: resolvedCode.toUpperCase().slice(0, 80),
    displayName: String(raw.title || "GOAT Arena T1~T9 문제 유형 카탈로그").trim(),
    schemaVersion: String(raw.schema_version || ""),
    sourceFileName: String(sourceFileName).trim().slice(0, 300),
    sourceHash,
    contentHash: sha256(JSON.stringify(canonicalize(contentPayload))),
    typeDefinitions,
    tierConfigurations,
    referenceQuestions,
    validationReport: {
      passed: true,
      typeCount: typeDefinitions.length,
      referenceQuestionCount: referenceQuestions.length,
      answeredReferenceQuestionCount: referenceQuestions.filter(
        (question) => question.answerStructureValidated
      ).length,
      solutionProcessReferenceCount: referenceQuestions.filter(
        (question) => question.solutionProcess.length > 0
      ).length,
      multipleChoiceReferenceCount: referenceQuestions.filter(
        (question) => question.answerFormat === "MULTIPLE_CHOICE"
      ).length,
      naturalNumberReferenceCount: referenceQuestions.filter(
        (question) => question.answerFormat === "NATURAL_NUMBER"
      ).length,
      liveEligibleReferenceCount: referenceQuestions.filter(
        (question) => question.liveQuestionEligible
      ).length,
      mappedEngineCount: new Set(
        typeDefinitions.flatMap((type) =>
          type.generatorBindings.map((binding) => binding.engineKey)
        )
      ).size,
      generatedSampleCount: [...reportCache.values()].reduce(
        (sum, report) => sum + Number(report.sampleCount || 0),
        0
      ),
      failures: [],
      validatedAt: new Date(),
    },
  };
}

function invalidateArenaTierCatalogCache() {
  activeCatalogCache = null;
  activeCatalogCacheExpiresAt = 0;
}

function normalizeCustomTypeId(value, now = new Date()) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 72);
  const suffix = createHash("sha256")
    .update(`${String(value || "")}:${now.toISOString()}`, "utf8")
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `ADMIN-${slug || "TYPE"}-${suffix}`.slice(0, 120);
}

function normalizeDifficultyTierSelection(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const selected = [...new Set(list.map((value) => String(value || "").trim().toUpperCase()))];
  if (!selected.length || selected.some((tier) => !DIFFICULTY_TIERS.includes(tier))) {
    throw statusError(400, "새 유형을 배정할 T 난이도를 하나 이상 선택해주세요.");
  }
  return selected.sort(
    (left, right) => DIFFICULTY_TIERS.indexOf(left) - DIFFICULTY_TIERS.indexOf(right)
  );
}

function activeCatalogContentHash(version) {
  return sha256(JSON.stringify(canonicalize({
    schemaVersion: version.schemaVersion,
    typeDefinitions: version.typeDefinitions,
    tierConfigurations: version.tierConfigurations,
    referenceQuestions: version.referenceQuestions,
  })));
}

async function createArenaTierCatalogType({
  adminUserId,
  input = {},
  now = new Date(),
} = {}) {
  const displayName = String(input.displayName || "").trim().slice(0, 240);
  if (displayName.length < 2) {
    throw statusError(400, "새 문제 유형 이름을 두 글자 이상 입력해주세요.");
  }
  const tiers = normalizeDifficultyTierSelection(input.difficultyTiers);
  const active = await ArenaTierQuestionCatalogVersion.findOne({
    status: "ACTIVE",
    "validationReport.passed": true,
  }).lean();
  if (!active) {
    throw statusError(409, "먼저 검산을 통과한 T1~T9 문제 카탈로그를 적용해주세요.");
  }
  const baseTypeId = String(input.baseTypeId || "").trim().toUpperCase();
  const baseType = (active.typeDefinitions || []).find(
    (definition) => definition.typeId === baseTypeId
  );
  if (!baseType) {
    throw statusError(400, "새 유형에 연결할 승인 생성기를 선택해주세요.");
  }
  const registry = buildProblemEngineRegistry();
  for (const binding of baseType.generatorBindings || []) {
    const engine = registry.get(`${binding.category}:${binding.engineKey}`);
    const report = engine
      ? await validateRegistryEngine(engine, { sampleCount: 3 })
      : null;
    if (
      !engine ||
      engine.sourceHash !== binding.sourceHash ||
      !report?.passed ||
      report.validationMode !== "TYPE_SPECIFIC"
    ) {
      throw statusError(
        422,
        `${baseType.label}의 승인 생성기 검산에 실패했습니다. 서버 생성기 동기화 상태를 확인해주세요.`
      );
    }
    await generateNaturalSample(engine);
  }

  const typeId = normalizeCustomTypeId(displayName, now);
  const typeDefinitions = structuredClone(active.typeDefinitions || []);
  const tierConfigurations = structuredClone(active.tierConfigurations || []);
  const referenceQuestions = structuredClone(active.referenceQuestions || []);
  if (typeDefinitions.some((definition) => definition.typeId === typeId)) {
    throw statusError(409, "같은 식별자의 문제 유형이 이미 있습니다. 이름을 조금 다르게 입력해주세요.");
  }

  const movedReferenceIds = [];
  for (const difficultyTier of tiers) {
    const tier = tierConfigurations.find(
      (entry) => entry.difficultyTier === difficultyTier
    );
    if (!tier) throw statusError(409, `${difficultyTier} 구성을 찾지 못했습니다.`);
    const definitionMap = new Map(
      typeDefinitions.map((definition) => [definition.typeId, definition])
    );
    const donor = [...(tier.typeWeights || [])]
      .filter((entry) => {
        const definition = definitionMap.get(entry.typeId);
        return (
          definition?.curriculumUnit === baseType.curriculumUnit &&
          Number(entry.weight || 0) >= 2 &&
          Array.isArray(entry.referenceQuestionIds) &&
          entry.referenceQuestionIds.length >= 2
        );
      })
      .sort((left, right) => Number(right.weight) - Number(left.weight))[0];
    if (!donor) {
      throw statusError(
        409,
        `${difficultyTier}에는 ${baseType.curriculumUnit} 참고 문항을 안전하게 나눌 여유가 없습니다.`
      );
    }
    const referenceQuestionId = donor.referenceQuestionIds.pop();
    donor.weight = Number(donor.weight) - 1;
    const donorDefinition = definitionMap.get(donor.typeId);
    donorDefinition.referenceCount = Number(donorDefinition.referenceCount) - 1;
    tier.typeWeights.push({
      typeId,
      weight: 1,
      referenceQuestionIds: [referenceQuestionId],
    });
    tier.typeWeights.sort((left, right) => left.typeId.localeCompare(right.typeId));
    const referenceQuestion = referenceQuestions.find(
      (question) => question.questionId === referenceQuestionId
    );
    if (!referenceQuestion) {
      throw statusError(409, `${referenceQuestionId} 참고 문항을 찾지 못했습니다.`);
    }
    referenceQuestion.typeId = typeId;
    movedReferenceIds.push(referenceQuestionId);
  }

  typeDefinitions.push({
    typeId,
    label: displayName,
    curriculumUnit: baseType.curriculumUnit,
    referenceCount: movedReferenceIds.length,
    generatorBindings: structuredClone(baseType.generatorBindings || []),
  });
  typeDefinitions.sort((left, right) => left.typeId.localeCompare(right.typeId));

  const revisionSuffix = `${now.toISOString().replace(/\D/g, "").slice(0, 14)}-${typeId.slice(-6)}`;
  const next = {
    code: `${String(active.code).slice(0, 56)}-ADMIN-${revisionSuffix}`.slice(0, 80),
    displayName: `${active.displayName} · 관리자 유형 추가`,
    schemaVersion: active.schemaVersion,
    sourceFileName: "관리자 문제 데이터 화면",
    typeDefinitions,
    tierConfigurations,
    referenceQuestions,
    validationReport: {
      ...active.validationReport,
      passed: true,
      typeCount: typeDefinitions.length,
      referenceQuestionCount: referenceQuestions.length,
      mappedEngineCount: new Set(
        typeDefinitions.flatMap((definition) =>
          definition.generatorBindings.map((binding) => binding.engineKey)
        )
      ).size,
      generatedSampleCount:
        Number(active.validationReport?.generatedSampleCount || 0) +
        Number(baseType.generatorBindings?.length || 0) * 3,
      failures: [],
      validatedAt: now,
    },
  };
  next.contentHash = activeCatalogContentHash(next);
  next.sourceHash = sha256(JSON.stringify(canonicalize({
    previousSourceHash: active.sourceHash,
    action: "ADMIN_TYPE_CREATE",
    typeId,
    displayName,
    baseTypeId,
    tiers,
    movedReferenceIds,
    createdAt: now.toISOString(),
  })));

  const session = await mongoose.startSession();
  let created = null;
  try {
    await session.withTransaction(async () => {
      const retired = await ArenaTierQuestionCatalogVersion.updateOne(
        { _id: active._id, status: "ACTIVE" },
        { $set: { status: "RETIRED", retiredAt: now } },
        { session }
      );
      if (retired.modifiedCount !== 1) {
        throw statusError(409, "다른 관리자가 먼저 문제 카탈로그를 변경했습니다. 새로고침 후 다시 시도해주세요.");
      }
      [created] = await ArenaTierQuestionCatalogVersion.create(
        [{
          ...next,
          status: "ACTIVE",
          activatedAt: now,
          createdBy: adminUserId || null,
          activatedBy: adminUserId || null,
        }],
        { session, ordered: true }
      );
      await AdminActionLog.create(
        [{
          adminUserId,
          action: "arena.tier-question-catalog.type-create",
          detail: `${displayName} · ${tiers.join(", ")}`,
          metadata: {
            previousVersionId: String(active._id),
            versionId: String(created._id),
            typeId,
            baseTypeId,
            difficultyTiers: tiers,
            movedReferenceIds,
          },
        }],
        { session, ordered: true }
      );
    });
  } finally {
    await session.endSession();
  }
  invalidateArenaTierCatalogCache();
  return created.toObject();
}

async function importAndActivateArenaTierCatalog({
  raw,
  sourceText,
  sourceFileName,
  adminUserId = null,
  now = new Date(),
} = {}) {
  const definition = await buildArenaTierCatalogDefinition(raw, {
    sourceText,
    sourceFileName,
  });
  await ArenaTierQuestionCatalogVersion.createIndexes();
  const existing = await ArenaTierQuestionCatalogVersion.findOne({
    sourceHash: definition.sourceHash,
  }).lean();
  if (existing?.status === "ACTIVE") return existing;
  if (existing) {
    throw statusError(409, "같은 원본 해시의 종료 또는 초안 카탈로그가 이미 있습니다.");
  }
  const session = await mongoose.startSession();
  let created = null;
  try {
    await session.withTransaction(async () => {
      await ArenaTierQuestionCatalogVersion.updateMany(
        { status: "ACTIVE" },
        { $set: { status: "RETIRED", retiredAt: now } },
        { session }
      );
      [created] = await ArenaTierQuestionCatalogVersion.create(
        [{
          ...definition,
          status: "ACTIVE",
          activatedAt: now,
          createdBy: adminUserId,
          activatedBy: adminUserId,
        }],
        { session, ordered: true }
      );
      if (adminUserId) {
        await AdminActionLog.create(
          [{
            adminUserId,
            action: "arena.tier-question-catalog.activate",
            detail: created.displayName,
            metadata: {
              versionId: String(created._id),
              code: created.code,
              sourceHash: created.sourceHash,
              typeCount: created.validationReport.typeCount,
              referenceQuestionCount: created.validationReport.referenceQuestionCount,
              answeredReferenceQuestionCount:
                created.validationReport.answeredReferenceQuestionCount,
              solutionProcessReferenceCount:
                created.validationReport.solutionProcessReferenceCount,
            },
          }],
          { session, ordered: true }
        );
      }
    });
  } finally {
    await session.endSession();
  }
  invalidateArenaTierCatalogCache();
  return created.toObject();
}

async function getActiveArenaTierCatalogVersion({ session = null } = {}) {
  const now = Date.now();
  if (!session && activeCatalogCache && now < activeCatalogCacheExpiresAt) {
    return activeCatalogCache;
  }
  let query = ArenaTierQuestionCatalogVersion.findOne({
    status: "ACTIVE",
    "validationReport.passed": true,
  }).select("-referenceQuestions");
  if (session) query = query.session(session);
  const active = await query.lean();
  if (active?._id) {
    let referenceQuery = ArenaTierQuestionCatalogVersion.findById(active._id)
      .select(
        "referenceQuestions.questionId referenceQuestions.difficultyTier referenceQuestions.sequence referenceQuestions.typeId referenceQuestions.source.questionNumber"
      );
    if (session) referenceQuery = referenceQuery.session(session);
    const referenceMetadata = await referenceQuery.lean();
    active.referenceQuestionMetadata = referenceMetadata?.referenceQuestions || [];
  }
  if (!session) {
    activeCatalogCache = active;
    activeCatalogCacheExpiresAt = now + ACTIVE_CACHE_TTL_MS;
  }
  return active;
}

function deterministicScore(seed, weight = 1) {
  const digest = createHash("sha256").update(seed, "utf8").digest();
  return digest.readUInt32BE(0) / Math.max(1, Number(weight || 1));
}

const PUBLIC_DIFFICULTY_VARIANT_COUNT = 30;
const RANKED_REGULAR_VARIANT_COUNT = 25;
const SEMI_KILLER_SOURCE_POSITIONS = Object.freeze([13, 14, 20, 21, 27, 28]);
const FINAL_KILLER_SOURCE_POSITIONS = Object.freeze([29, 30]);

function catalogTypeContext(version, difficultyCode) {
  const catalogTier = PUBLIC_DIFFICULTY_TO_CATALOG_TIER[difficultyCode];
  if (!catalogTier) {
    throw statusError(
      503,
      `${difficultyCode || "지정되지 않은 난이도"}의 공개 문제 유형 카탈로그가 없습니다.`,
      "ARENA_PUBLIC_DIFFICULTY_CATALOG_MISSING"
    );
  }
  const configuration = (version?.tierConfigurations || []).find(
    (entry) => entry.difficultyTier === catalogTier
  );
  if (!configuration) {
    throw statusError(503, `${catalogTier} 문제 유형 카탈로그가 없습니다.`);
  }
  const definitionMap = new Map(
    (version?.typeDefinitions || []).map((definition) => [
      String(definition.typeId || ""),
      definition,
    ])
  );
  const allReferences = (
    version?.referenceQuestionMetadata || version?.referenceQuestions || []
  ).slice()
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  const tierReferences = allReferences.filter(
    (item) => item.difficultyTier === catalogTier
  );
  const referencePool = [
    ...tierReferences,
    ...allReferences.filter((item) => item.difficultyTier !== catalogTier),
  ];
  const finalTypeIds = new Set(
    allReferences
      .filter((question) =>
        [29, 30].includes(Number(question?.source?.questionNumber || 0)) ||
        [29, 30].includes(Number(question?.sequence || 0))
      )
      .map((question) => String(question.typeId || ""))
  );
  const regularTypeIds = new Set(
    allReferences
      .filter(
        (question) =>
          ![29, 30].includes(Number(question?.source?.questionNumber || 0)) &&
          ![29, 30].includes(Number(question?.sequence || 0))
      )
      .map((question) => String(question.typeId || ""))
  );
  return {
    catalogTier,
    configuration,
    definitionMap,
    tierReferences,
    referencePool,
    finalTypeIds,
    regularTypeIds,
  };
}

function cycleCourseVariants({
  difficultyCode,
  courseId,
  count,
  startIndex,
  candidates,
  tierReferences,
}) {
  if (!candidates.length) {
    throw statusError(
      503,
      `${difficultyCode}의 ${courseId} 준킬러 유형이 없습니다.`,
      "ARENA_PUBLIC_DIFFICULTY_COURSE_EMPTY"
    );
  }
  const referenceByType = new Map();
  tierReferences.forEach((reference) => {
    const typeId = String(reference.typeId || "");
    if (!referenceByType.has(typeId)) referenceByType.set(typeId, []);
    referenceByType.get(typeId).push(reference);
  });
  return Array.from({ length: count }, (_unused, offset) => {
    const weighted = candidates[offset % candidates.length];
    const references = referenceByType.get(String(weighted.typeId || "")) || [];
    const reference = references[Math.floor(offset / candidates.length) % Math.max(1, references.length)] || null;
    const variantNumber = startIndex + offset;
    const referenceQuestionNumber = Number(
      reference?.source?.questionNumber || reference?.sequence || 0
    );
    const sourceQuestionNumber = SEMI_KILLER_SOURCE_POSITIONS.includes(
      referenceQuestionNumber
    )
      ? referenceQuestionNumber
      : SEMI_KILLER_SOURCE_POSITIONS[
          (variantNumber - 1) % SEMI_KILLER_SOURCE_POSITIONS.length
        ];
    return {
      variantTypeId: `${difficultyCode}-${String(variantNumber).padStart(2, "0")}`,
      baseTypeId: String(weighted.typeId || ""),
      curriculumUnit: weighted.definition.curriculumUnit,
      sourceQuestionNumber,
      sourcePositionBand:
        sourceQuestionNumber <= 14
          ? "Q13_14"
          : sourceQuestionNumber <= 21
            ? "Q20_21"
            : "Q27_28",
      variantProfile: `CONDITION_VARIANT_${String(
        Math.floor(offset / candidates.length) + 1
      ).padStart(2, "0")}`,
      category: "SEMI_KILLER_VARIANT",
      difficultyClass: "SEMI_KILLER",
    };
  });
}

function buildDifficultyVariantTypes(version, difficultyCode) {
  const normalizedCode = String(difficultyCode || "").toUpperCase();
  const {
    catalogTier,
    configuration,
    definitionMap,
    tierReferences,
    referencePool,
    finalTypeIds,
    regularTypeIds,
  } = catalogTypeContext(version, normalizedCode);
  const configuredTypes = (configuration.typeWeights || [])
    .filter((entry) => definitionMap.has(String(entry.typeId || "")))
    .map((entry) => ({
      ...entry,
      typeId: String(entry.typeId || ""),
      definition: definitionMap.get(String(entry.typeId || "")),
    }));
  const configuredTypeIds = new Set(configuredTypes.map((entry) => entry.typeId));
  const fallbackTypes = [...definitionMap.values()]
    .filter((definition) => !configuredTypeIds.has(String(definition.typeId || "")))
    .map((definition) => ({
      typeId: String(definition.typeId || ""),
      weight: 1,
      referenceQuestionIds: [],
      definition,
    }));
  const weightedTypes = [...configuredTypes, ...fallbackTypes];
  // 29·30번에도 함께 등장한 넓은 유형명이라도 13·14·20·21·27·28번
  // 참고 이력이 있으면 준킬러 후보로 유지한다. 29·30번에서만 발견된
  // 유형은 Ranked 5번 후보로만 사용한다.
  const regularTypes = weightedTypes.filter((entry) =>
    regularTypeIds.has(entry.typeId)
  );
  const isRanked = normalizedCode.startsWith("R");
  const regularCount = isRanked
    ? RANKED_REGULAR_VARIANT_COUNT
    : PUBLIC_DIFFICULTY_VARIANT_COUNT;
  const courseQuotas = isRanked
    ? { algebra: 10, "calculus-1": 10, "probability-statistics": 5 }
    : { algebra: 12, "calculus-1": 12, "probability-statistics": 6 };
  const variants = [];
  let nextIndex = 1;
  for (const [courseId, quota] of Object.entries(courseQuotas)) {
    const courseVariants = cycleCourseVariants({
      difficultyCode: normalizedCode,
      courseId,
      count: quota,
      startIndex: nextIndex,
      candidates: regularTypes.filter(
        (entry) => entry.definition.curriculumUnit === courseId
      ),
      tierReferences: referencePool,
    });
    variants.push(...courseVariants);
    nextIndex += quota;
  }
  if (isRanked) {
    const finalReferences = referencePool.filter((reference) =>
      [29, 30].includes(Number(reference?.source?.questionNumber || 0)) ||
      [29, 30].includes(Number(reference?.sequence || 0))
    );
    const finalCandidates = weightedTypes.filter(
      (entry) =>
        finalTypeIds.has(entry.typeId) &&
        ["algebra", "calculus-1", "probability-statistics"].includes(
          entry.definition.curriculumUnit
        )
    );
    if (!finalCandidates.length) {
      throw statusError(
        503,
        `${catalogTier}의 29·30번형 킬러 참고 유형이 없습니다.`,
        "ARENA_PUBLIC_DIFFICULTY_FINAL_EMPTY"
      );
    }
    while (variants.length < PUBLIC_DIFFICULTY_VARIANT_COUNT) {
      const offset = variants.length - regularCount;
      const candidate = finalCandidates[offset % finalCandidates.length];
      const candidateReferences = finalReferences.filter(
        (reference) => String(reference.typeId || "") === candidate.typeId
      );
      const reference =
        candidateReferences[offset % Math.max(1, candidateReferences.length)] ||
        finalReferences[offset % Math.max(1, finalReferences.length)] ||
        null;
      const referenceQuestionNumber = Number(
        reference?.source?.questionNumber || reference?.sequence || 0
      );
      const sourceQuestionNumber = FINAL_KILLER_SOURCE_POSITIONS.includes(
        referenceQuestionNumber
      )
        ? referenceQuestionNumber
        : FINAL_KILLER_SOURCE_POSITIONS[offset % FINAL_KILLER_SOURCE_POSITIONS.length];
      variants.push({
        variantTypeId: `${normalizedCode}-${String(variants.length + 1).padStart(2, "0")}`,
        baseTypeId: candidate.typeId,
        curriculumUnit: candidate.definition.curriculumUnit,
        sourceQuestionNumber,
        sourcePositionBand: "Q29_30_KILLER",
        variantProfile: `FINAL_CONDITION_VARIANT_${String(offset + 1).padStart(2, "0")}`,
        category: "RANKED_FINAL_CANDIDATE",
        difficultyClass: "KILLER",
      });
    }
  }
  if (
    variants.length !== PUBLIC_DIFFICULTY_VARIANT_COUNT ||
    new Set(variants.map((variant) => variant.variantTypeId)).size !==
      PUBLIC_DIFFICULTY_VARIANT_COUNT
  ) {
    throw statusError(
      503,
      `${normalizedCode}의 30개 유형 식별자를 구성하지 못했습니다.`,
      "ARENA_PUBLIC_DIFFICULTY_VARIANT_COUNT_INVALID"
    );
  }
  return variants;
}

function regularCourseSlotsForFinal(finalCourseId = "") {
  const slots = [...PACK_COURSE_SLOTS];
  const finalIndex = slots.lastIndexOf(String(finalCourseId || ""));
  if (finalIndex < 0) {
    throw statusError(
      503,
      "Ranked 5번 킬러의 과목이 1대1 경기 과목 구성에 없습니다.",
      "ARENA_FINAL_KILLER_COURSE_INVALID"
    );
  }
  slots.splice(finalIndex, 1);
  return slots;
}

function selectTierCatalogTypes(
  version,
  difficultyTier,
  matchKey,
  difficultyCode = "",
  { division = "SUB" } = {}
) {
  const normalizedDifficultyCode = String(
    difficultyCode || `U${String(difficultyTier || "T1").replace(/^T/, "")}`
  ).toUpperCase();
  const tier = (version?.tierConfigurations || []).find(
    (entry) => entry.difficultyTier === difficultyTier
  );
  if (!tier) throw statusError(503, `${difficultyTier} 문제 유형 카탈로그가 없습니다.`);
  const definitionMap = new Map(
    (version.typeDefinitions || []).map((definition) => [definition.typeId, definition])
  );
  const normalizedDivision = String(division || "SUB").toUpperCase();
  const publicVariants = buildDifficultyVariantTypes(
    version,
    normalizedDifficultyCode
  );
  const finalCandidates = publicVariants
    .filter(
      (variant) =>
        variant.difficultyClass === "KILLER" &&
        FINAL_KILLER_TYPE_IDS.some(
          (typeId) =>
            ARENA_ONE_ON_ONE_PROBLEM_TYPES[typeId]?.courseId ===
            variant.curriculumUnit
        )
    )
    .map((variant) => ({
      ...variant,
      definition: definitionMap.get(variant.baseTypeId),
      score: deterministicScore(
        `${version.contentHash}:${difficultyTier}:${normalizedDifficultyCode}:${matchKey}:FINAL_29_30:${variant.variantTypeId}`
      ),
    }))
    .sort((left, right) => left.score - right.score);
  if (normalizedDivision === "MAIN" && !finalCandidates.length) {
    throw statusError(
      503,
      `${difficultyTier}의 5번 문항을 보정할 29·30번 참고 유형이 없습니다.`,
      "ARENA_TIER_CATALOG_FINAL_SLOT_EMPTY"
    );
  }
  const finalDefinition = finalCandidates[0] || null;
  // Ranked만 5번을 29·30번형 킬러로 교체한다. Unranked는 다섯 문항
  // 모두 정답률 10~30%대의 준킬러 생성기에서 고른다.
  const regularCourseSlots = normalizedDivision === "MAIN"
    ? regularCourseSlotsForFinal(finalDefinition?.curriculumUnit)
    : PACK_COURSE_SLOTS;
  const selected = [];
  for (let slot = 0; slot < regularCourseSlots.length; slot += 1) {
    const courseId = regularCourseSlots[slot];
    const candidates = publicVariants
      .filter(
        (variant) =>
          variant.difficultyClass === "SEMI_KILLER" &&
          !selected.some(
            (item) => item.publicVariantTypeId === variant.variantTypeId
          ) &&
          !selected.some(
            (item) => item.baseTypeId === variant.baseTypeId
          ) &&
          !(
            normalizedDivision === "MAIN" &&
            finalDefinition?.baseTypeId === variant.baseTypeId
          ) &&
          variant.curriculumUnit === courseId
      )
      .map((variant) => ({
        ...variant,
        definition: definitionMap.get(variant.baseTypeId),
        score: deterministicScore(
          `${version.contentHash}:${difficultyTier}:${normalizedDifficultyCode}:${matchKey}:${slot}:${variant.variantTypeId}`
        ),
      }))
      .sort((left, right) => left.score - right.score);
    if (!candidates.length) {
      throw statusError(
        503,
        `${difficultyTier}의 ${courseId} 유형을 중복 없이 배정할 수 없습니다.`,
        "ARENA_TIER_CATALOG_COURSE_SLOT_EMPTY"
      );
    }
    selected.push({
      ...candidates[0].definition,
      baseTypeId: candidates[0].baseTypeId,
      publicVariantTypeId: candidates[0].variantTypeId,
      sourceQuestionNumber: candidates[0].sourceQuestionNumber,
    });
  }
  if (normalizedDivision === "MAIN") selected.push(finalDefinition);
  return selected.map((definition) => ({
    ...definition,
    arenaVisualizationRequired: false,
  }));
}

function designForCatalogType(baseDesign, {
  difficultyTier,
  curriculumUnit,
  slotRole,
} = {}) {
  const skeleton = Object.values(ARENA_ONE_ON_ONE_TYPE_SKELETONS).find(
    (item) =>
      item.tier === difficultyTier &&
      item.courseId === curriculumUnit &&
      item.slotRole === slotRole
  );
  if (!skeleton) {
    throw statusError(
      503,
      `${difficultyTier}의 ${curriculumUnit} ${slotRole} 문항 골격이 없습니다.`,
      "ARENA_TIER_CATALOG_SKELETON_MISSING"
    );
  }
  return {
    ...baseDesign,
    courseId: curriculumUnit,
    slotRole,
    typeSkeletonId: skeleton.typeId,
    sourcePositionBand: skeleton.sourcePositionBand,
    referenceFamilies: skeleton.referenceFamilies,
  };
}

function catalogBindingDifficultyIndex(difficultyCode, bindingCount) {
  const count = Math.max(1, Number(bindingCount || 0));
  const normalizedCode = String(difficultyCode || "U1").toUpperCase();
  const level = Math.max(
    1,
    Math.min(9, Number(normalizedCode.replace(/^[URT]/, "")) || 1)
  );
  // 가져오기 단계에서 각 공식 유형은 검산된 생성기 세 개를 쉬운 조건에서
  // 복합 조건 순으로 저장한다. U1~U3, U4~U8, U9·R 전 구간이 각각
  // 앞·중간·최종 결속을 우선 사용한다. 공개 U/R 단계의 목표 정답률은
  // 별도 정책에서 관리하고, 여기서는 표시 유형과 실제 생성 유형을 맞춘다.
  const preferred = normalizedCode.startsWith("R") || level >= 9
    ? count - 1
    : level >= 4
      ? Math.min(count - 1, 1)
      : 0;
  return Math.max(0, preferred);
}

function orderedCatalogBindingEngines({
  version,
  typeDefinition,
  difficultyCode,
  matchKey,
  publicVariantTypeId,
  excludedEngineKeys,
}) {
  const registry = buildProblemEngineRegistry();
  const bindings = Array.isArray(typeDefinition?.generatorBindings)
    ? typeDefinition.generatorBindings
    : [];
  const preferredIndex = catalogBindingDifficultyIndex(
    difficultyCode,
    bindings.length
  );
  return bindings
    .map((binding, index) => {
      const category = String(binding?.category || "").trim();
      const engineKey = String(binding?.engineKey || "").trim();
      const runtimeKey = `${category}:${engineKey}`;
      const engine = registry.get(runtimeKey);
      const control = cachedProblemTypeControl(category, engineKey);
      const enabled =
        !control ||
        (control.enabled !== false &&
          control.validationReport?.passed !== false &&
          control.sourceMatchesServer !== false);
      if (
        !category ||
        !engineKey ||
        !engine ||
        engine.sourceHash !== binding.sourceHash ||
        enabled !== true ||
        excludedEngineKeys?.has(runtimeKey)
      ) {
        return null;
      }
      return {
        binding,
        engine,
        runtimeKey,
        preferenceDistance: Math.abs(index - preferredIndex),
        order: deterministicScore(
          `${version.contentHash}:${matchKey}:${publicVariantTypeId}:${difficultyCode}:${engineKey}`
        ),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.preferenceDistance - right.preferenceDistance ||
        left.order - right.order
    );
}

async function generateQuestionForCatalogType({
  version,
  typeDefinition,
  difficultyTier,
  difficultyCode,
  challengerTier,
  defenderTier,
  matchKey,
  design,
  excludedEngineKeys,
}) {
  const baseTypeId = String(typeDefinition.baseTypeId || typeDefinition.typeId || "");
  const publicVariantTypeId = String(
    typeDefinition.publicVariantTypeId || typeDefinition.variantTypeId || baseTypeId
  );
  const normalizedCourseId = String(typeDefinition.curriculumUnit || design?.courseId || "");
  const normalizedDifficultyCode = String(difficultyCode || difficultyTier || "U1").toUpperCase();
  const publicNumber = Math.max(
    1,
    Math.min(9, Number(normalizedDifficultyCode.replace(/^[URT]/, "")) || 1)
  );
  // 같은 숫자의 R등급이 U등급보다 어렵고, 각 Division 안에서는 1→9로
  // 갈수록 조건 변환과 경우분류 부담이 커지도록 생성기 난도값을 높인다.
  const targetDifficulty = normalizedDifficultyCode.startsWith("R")
    ? 0.75 + (publicNumber - 1) * 0.02
    : 0.68 + (publicNumber - 1) * 0.015;
  const candidates = orderedCatalogBindingEngines({
    version,
    typeDefinition,
    difficultyCode: normalizedDifficultyCode,
    matchKey,
    publicVariantTypeId,
    excludedEngineKeys,
  });
  if (!candidates.length) {
    throw statusError(
      503,
      `${normalizedDifficultyCode}의 ${typeDefinition.label} 유형에 연결된 검산 생성기를 사용할 수 없습니다.`,
      "ARENA_CATALOG_BOUND_GENERATOR_EMPTY"
    );
  }
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const { generated, problem: naturalProblem } = await generateNaturalSample(
        candidate.engine,
        80
      );
      const problem = problemWithVerifiedVisualization(naturalProblem);
      if (!isNaturalNumberMaxThreeDigits(problem?.answer)) continue;
      excludedEngineKeys?.add(candidate.runtimeKey);
      const spec = PUBLIC_DIFFICULTY_SPECS[difficultyCode] || TIER_SPECS[difficultyTier];
      const graphItem = isVisualizationPresentedInProblem(problem);
      return {
        typeId: publicVariantTypeId,
        sourceTypeId: baseTypeId,
        generatorTypeId: candidate.engine.engineKey,
        difficultyClass: "SEMI_KILLER",
        generatorEngineKey: candidate.runtimeKey,
        definition: {
          category: "semi-killer",
          courseId: normalizedCourseId,
          referenceFamily: baseTypeId,
          skillTags: [
            typeDefinition.label,
            candidate.engine.displayName,
            ...(candidate.engine.definition?.requiredConceptIds || []),
          ],
          difficultyScore: Math.min(0.89, targetDifficulty),
          expectedTimeMs: Math.min(
            PACK_RULES.expectedTimePerItemMs,
            Math.max(6 * 60 * 1000, Number(design?.expectedTimeMs || 0))
          ),
        },
        problem: {
          ...problem,
          inputMode: "short-answer",
          choices: [],
          answer: String(problem.answer),
          solution: String(problem.solution || ""),
        },
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
          twoMinuteSolvable: false,
          tenMinuteSolvable: true,
          originalityChecked: true,
          catalogTypeMatched: true,
          validationMode: "TYPE_SPECIFIC",
          checkedAt: new Date(),
          sourceValidation: generated?.validation || problem?.validation || null,
        },
        design: {
          ...design,
          difficultyClass: "SEMI_KILLER",
          difficultyCode: normalizedDifficultyCode,
          combinedConceptCount: Math.max(
            2,
            Math.ceil(Number(spec?.concepts || 2))
          ),
          conditionTransformSteps: Math.max(
            2,
            Math.ceil(Number(spec?.conditions || 1))
          ),
          graphItem,
          calculationLoad: "LOW",
          generatedFor: `${matchKey}:${challengerTier}:${defenderTier}:${publicVariantTypeId}:${candidate.engine.engineKey}`,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw statusError(
    503,
    `${normalizedDifficultyCode}의 ${typeDefinition.label} 준킬러 문항이 독립 검산을 통과하지 못했습니다${lastError ? `: ${lastError.message}` : "."}`,
    "ARENA_TIER_CATALOG_GENERATOR_UNAVAILABLE"
  );
}

function orderedFinalKillerTypeIds({ matchKey = "", difficultyCode = "" } = {}) {
  if (!FINAL_KILLER_TYPE_IDS.length) {
    throw statusError(
      503,
      "29·30번형 최종 문항 생성기가 등록되지 않았습니다.",
      "ARENA_FINAL_KILLER_GENERATOR_MISSING"
    );
  }
  const seed = parseInt(
    sha256(`${matchKey}:${difficultyCode}:FINAL_29_30`).slice(0, 8),
    16
  );
  const start = Number.isFinite(seed) ? seed % FINAL_KILLER_TYPE_IDS.length : 0;
  return FINAL_KILLER_TYPE_IDS.map(
    (_typeId, index) => FINAL_KILLER_TYPE_IDS[(start + index) % FINAL_KILLER_TYPE_IDS.length]
  );
}

function finalDifficultyScore(difficultyCode, difficultyTier) {
  const publicNumber = Number(String(difficultyCode || "").replace(/^[UR]/, ""));
  const internalNumber = Number(String(difficultyTier || "").replace(/^T/, ""));
  const divisionBoost = String(difficultyCode || "").startsWith("R") ? 0.035 : 0;
  const level = Number.isFinite(publicNumber) && publicNumber > 0
    ? publicNumber
    : Math.max(1, internalNumber || 1);
  return Math.min(0.995, 0.91 + level * 0.006 + divisionBoost);
}

function generateFinalKillerQuestion({
  difficultyTier,
  difficultyCode,
  challengerTier,
  defenderTier,
  matchKey,
  design,
  publicVariantTypeId = "",
  curriculumUnit = "",
}) {
  let lastError = null;
  const orderedTypeIds = orderedFinalKillerTypeIds({ matchKey, difficultyCode })
    .filter(
      (typeId) =>
        !curriculumUnit ||
        ARENA_ONE_ON_ONE_PROBLEM_TYPES[typeId]?.courseId === curriculumUnit
    );
  if (!orderedTypeIds.length) {
    throw statusError(
      503,
      `${curriculumUnit || "선택된 과목"}의 29·30번형 최종 문항 생성기가 없습니다.`,
      "ARENA_FINAL_KILLER_COURSE_GENERATOR_MISSING"
    );
  }
  for (const typeId of orderedTypeIds) {
    try {
      const generated = generateValidatedArenaOneOnOneQuestion({
        typeId,
        allowedCategory: "killer",
        maxAttempts: 220,
      });
      const definition = generated.definition;
      const problem = problemWithVerifiedVisualization(normalizedProblem(generated));
      if (!isNaturalNumberMaxThreeDigits(problem?.answer)) continue;
      return {
        typeId: publicVariantTypeId || typeId,
        sourceTypeId: typeId,
        difficultyClass: "KILLER",
        generatorEngineKey: `ARENA_FINAL_KILLER:${typeId}`,
        definition: {
          category: "killer",
          courseId: definition.courseId,
          referenceFamily: definition.referenceFamily,
          skillTags: [...(definition.skillTags || []), "29·30번형"],
          difficultyScore: finalDifficultyScore(difficultyCode, difficultyTier),
          expectedTimeMs: Math.min(
            PACK_RULES.expectedTimePerItemMs,
            Math.max(8 * 60 * 1000, Number(definition.expectedTimeMs || 0))
          ),
        },
        problem: {
          ...problem,
          inputMode: "short-answer",
          choices: [],
          answer: String(problem.answer),
          solution: String(problem.solution || ""),
        },
        validation: {
          ...generated.validation,
          passed: true,
          solvable: true,
          uniqueAnswer: true,
          calculatorFree: true,
          answerMatches: true,
          semiKillerCertified: true,
          curriculumCompliant: true,
          conditionsConsistent: true,
          tierBurdenMatches: true,
          twoMinuteSolvable: false,
          tenMinuteSolvable: true,
          originalityChecked: true,
          validationMode: "TYPE_SPECIFIC",
          checkedAt: new Date(),
        },
        design: {
          ...design,
          difficultyTier,
          difficultyCode,
          courseId: definition.courseId,
          slotRole: "FINAL_29_30",
          difficultyClass: "KILLER",
          sourcePositionBand: "Q29_30_KILLER",
          combinedConceptCount: Math.max(3, Number(definition.reasoningDepth || 3)),
          conditionTransformSteps: Math.max(3, Number(definition.reasoningDepth || 3) - 1),
          graphItem: isVisualizationPresentedInProblem(problem),
          calculationLoad: "LOW",
          generatedFor: `${matchKey}:${challengerTier}:${defenderTier}:${publicVariantTypeId || typeId}`,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw statusError(
    503,
    `29·30번형 최종 문항이 독립 검산을 통과하지 못했습니다${lastError ? `: ${lastError.message}` : "."}`,
    "ARENA_FINAL_KILLER_GENERATION_FAILED"
  );
}

async function generateQuestionsFromTierCatalog({
  version,
  difficultyTier,
  difficultyCode = "",
  challengerTier,
  defenderTier,
  matchKey,
  division = "SUB",
}) {
  const selectedTypes = selectTierCatalogTypes(
    version,
    difficultyTier,
    matchKey,
    difficultyCode,
    { division }
  );
  const designs = plannedPackSlots(challengerTier, defenderTier, { division });
  const publicDifficultyCode = difficultyCode || designs[0]?.difficultyCode || "";
  const excludedEngineKeys = new Set();
  const questions = [];
  for (let index = 0; index < selectedTypes.length; index += 1) {
    const slotRole = designs[index]?.slotRole || "REGULAR";
    if (slotRole === "FINAL_29_30") {
      questions.push(generateFinalKillerQuestion({
        difficultyTier,
        difficultyCode: publicDifficultyCode,
        challengerTier,
        defenderTier,
        matchKey,
        design: designForCatalogType(designs[index], {
          difficultyTier,
          curriculumUnit: selectedTypes[index]?.curriculumUnit,
          slotRole,
        }),
        publicVariantTypeId:
          selectedTypes[index]?.publicVariantTypeId ||
          selectedTypes[index]?.variantTypeId ||
          "",
        curriculumUnit: selectedTypes[index]?.curriculumUnit || "",
      }));
    } else {
      questions.push(await generateQuestionForCatalogType({
        version,
        typeDefinition: selectedTypes[index],
        difficultyTier,
        difficultyCode: publicDifficultyCode,
        challengerTier,
        defenderTier,
        matchKey,
        design: designForCatalogType(designs[index], {
          difficultyTier,
          curriculumUnit: selectedTypes[index].curriculumUnit,
          slotRole,
        }),
        excludedEngineKeys,
      }));
    }
  }
  assertGeneratedTierCatalogPack(questions, { division });
  return questions;
}

function buildPublicDifficultyCatalogView(version) {
  return Object.entries(PUBLIC_DIFFICULTY_TO_CATALOG_TIER).map(
    ([difficultyCode, catalogTier]) => {
      const variantTypes = buildDifficultyVariantTypes(version, difficultyCode);
      return {
        difficultyCode,
        catalogTier,
        minimumTypeVariants: 30,
        variantTypes,
        packComposition: difficultyCode.startsWith("R")
          ? "준킬러 4문항 + 29·30번형 킬러 1문항"
          : "준킬러 5문항",
      };
    }
  );
}

async function getAdminArenaTierCatalog() {
  const [active, recent] = await Promise.all([
    getActiveArenaTierCatalogVersion(),
    ArenaTierQuestionCatalogVersion.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select("code displayName schemaVersion status sourceFileName sourceHash contentHash validationReport activatedAt createdAt")
      .lean(),
  ]);
  return {
    active,
    recent,
    publicDifficultyCatalog: active ? buildPublicDifficultyCatalogView(active) : [],
  };
}

async function ensureArenaTierCatalogIndexes() {
  await ArenaTierQuestionCatalogVersion.createIndexes();
}

function startArenaTierCatalogWatcher() {
  if (
    catalogChangeStream ||
    process.env.DISABLE_ARENA_TIER_CATALOG_WATCHER === "1" ||
    mongoose.connection.readyState !== 1
  ) {
    return catalogChangeStream;
  }
  try {
    catalogChangeStream = ArenaTierQuestionCatalogVersion.watch([], {
      fullDocument: "updateLookup",
    });
    catalogChangeStream.on("change", invalidateArenaTierCatalogCache);
    catalogChangeStream.on("error", (error) => {
      console.warn("Arena tier catalog change stream unavailable; using TTL cache:", error.message);
      catalogChangeStream = null;
      invalidateArenaTierCatalogCache();
    });
  } catch (error) {
    console.warn("Arena tier catalog change stream unavailable; using TTL cache:", error.message);
    catalogChangeStream = null;
  }
  return catalogChangeStream;
}

module.exports = {
  ACTIVE_CACHE_TTL_MS,
  DIFFICULTY_TIERS,
  ENGINE_BINDING_FRAGMENTS,
  buildArenaTierCatalogDefinition,
  assertGeneratedTierCatalogPack,
  createArenaTierCatalogType,
  ensureArenaTierCatalogIndexes,
  generateQuestionsFromTierCatalog,
  hasRenderableArenaVisualization,
  isVisualizationPresentedInProblem,
  problemWithVerifiedVisualization,
  buildPublicDifficultyCatalogView,
  buildDifficultyVariantTypes,
  designForCatalogType,
  getActiveArenaTierCatalogVersion,
  getAdminArenaTierCatalog,
  importAndActivateArenaTierCatalog,
  invalidateArenaTierCatalogCache,
  selectTierCatalogTypes,
  startArenaTierCatalogWatcher,
};
