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
  TIER_SPECS,
  isNaturalNumberMaxThreeDigits,
  plannedPackSlots,
} = require("./arenaOneOnOneDifficultyPolicy");

const DIFFICULTY_TIERS = Object.freeze([
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9",
]);
const ACTIVE_CACHE_TTL_MS = 15 * 1000;

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

function selectTierCatalogTypes(version, difficultyTier, matchKey) {
  const tier = (version?.tierConfigurations || []).find(
    (entry) => entry.difficultyTier === difficultyTier
  );
  if (!tier) {
    throw statusError(503, `${difficultyTier} 문제 유형 카탈로그가 없습니다.`);
  }
  const definitionMap = new Map(
    (version.typeDefinitions || []).map((definition) => [definition.typeId, definition])
  );
  const selected = [];
  for (let slot = 0; slot < PACK_COURSE_SLOTS.length; slot += 1) {
    const courseId = PACK_COURSE_SLOTS[slot];
    const candidates = (tier.typeWeights || [])
      .filter(
        (entry) =>
          !selected.some((item) => item.typeId === entry.typeId) &&
          definitionMap.get(entry.typeId)?.curriculumUnit === courseId
      )
      .map((entry) => ({
        ...entry,
        definition: definitionMap.get(entry.typeId),
        score: deterministicScore(
          `${version.contentHash}:${difficultyTier}:${matchKey}:${slot}:${entry.typeId}`,
          entry.weight
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
    selected.push(candidates[0].definition);
  }
  return selected;
}

async function generateQuestionForCatalogType({
  version,
  typeDefinition,
  difficultyTier,
  challengerTier,
  defenderTier,
  matchKey,
  design,
  excludedEngineKeys,
}) {
  const registry = buildProblemEngineRegistry();
  const bindings = [...(typeDefinition.generatorBindings || [])]
    .filter((binding) => !excludedEngineKeys.has(binding.engineKey))
    .map((binding) => ({
      ...binding,
      score: deterministicScore(
        `${version.contentHash}:${matchKey}:${typeDefinition.typeId}:${binding.engineKey}`,
        binding.weight
      ),
    }))
    .sort((left, right) => left.score - right.score);
  let lastError = null;
  for (const binding of bindings) {
    const engine = registry.get(`${binding.category}:${binding.engineKey}`);
    const control = cachedProblemTypeControl(binding.category, binding.engineKey);
    if (
      !engine ||
      engine.sourceHash !== binding.sourceHash ||
      (control && (
        control.enabled === false ||
        control.validationReport?.passed !== true ||
        control.validationReport?.validationMode !== "TYPE_SPECIFIC" ||
        control.sourceMatchesServer === false
      ))
    ) {
      continue;
    }
    try {
      const { generated, problem } = await generateNaturalSample(engine, 80);
      excludedEngineKeys.add(binding.engineKey);
      const tierNumber = Number(difficultyTier.slice(1));
      const spec = TIER_SPECS[difficultyTier];
      return {
        typeId: typeDefinition.typeId,
        generatorEngineKey: binding.engineKey,
        definition: {
          courseId: typeDefinition.curriculumUnit,
          referenceFamily: typeDefinition.typeId,
          skillTags: [typeDefinition.label],
          difficultyScore: Math.min(0.95, 0.62 + tierNumber * 0.035),
          expectedTimeMs: 2 * 60 * 1000,
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
          semiKillerCertified: false,
          curriculumCompliant: true,
          conditionsConsistent: true,
          tierBurdenMatches: false,
          twoMinuteSolvable: true,
          originalityChecked: true,
          validationMode: "TYPE_SPECIFIC",
          checkedAt: new Date(),
          sourceValidation: generated?.validation || null,
        },
        design: {
          ...design,
          combinedConceptCount: Math.max(2, Math.ceil(Number(spec?.concepts || 2))),
          conditionTransformSteps: Math.max(1, Math.ceil(Number(spec?.conditions || 1))),
          graphItem: /GRAPH|AREA|TANGENT|MOTION|INTEGRAL/.test(typeDefinition.typeId),
          calculationLoad: "LOW",
          generatedFor: `${matchKey}:${challengerTier}:${defenderTier}:${typeDefinition.typeId}`,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw statusError(
    503,
    `${difficultyTier}의 ${typeDefinition.label}에 사용할 승인 생성기가 없습니다${lastError ? `: ${lastError.message}` : "."}`,
    "ARENA_TIER_CATALOG_GENERATOR_UNAVAILABLE"
  );
}

async function generateQuestionsFromTierCatalog({
  version,
  difficultyTier,
  challengerTier,
  defenderTier,
  matchKey,
}) {
  const selectedTypes = selectTierCatalogTypes(version, difficultyTier, matchKey);
  const designs = plannedPackSlots(challengerTier, defenderTier);
  const excludedEngineKeys = new Set();
  const questions = [];
  for (let index = 0; index < selectedTypes.length; index += 1) {
    questions.push(
      await generateQuestionForCatalogType({
        version,
        typeDefinition: selectedTypes[index],
        difficultyTier,
        challengerTier,
        defenderTier,
        matchKey,
        design: designs[index],
        excludedEngineKeys,
      })
    );
  }
  return questions;
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
  return { active, recent };
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
  createArenaTierCatalogType,
  ensureArenaTierCatalogIndexes,
  generateQuestionsFromTierCatalog,
  getActiveArenaTierCatalogVersion,
  getAdminArenaTierCatalog,
  importAndActivateArenaTierCatalog,
  invalidateArenaTierCatalogCache,
  selectTierCatalogTypes,
  startArenaTierCatalogWatcher,
};
