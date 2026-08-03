const { createHash } = require("node:crypto");
const path = require("node:path");
const mongoose = require("mongoose");

const { ProblemTypeVersion } = require("../models/problemTypeModel");
const { AdminActionLog } = require("../models/matthsModel");
const {
  listProblemGeneratorRegistrations,
} = require("./problemGenerators");
const {
  generateValidProblem,
  validateGeneratedProblem,
} = require("./problemGenerators/utils");
const { EXAM_COURSES } = require("./examBankSource");
const { unitConfigs } = require("./assessmentTemplates");
const {
  PLACEMENT_QUESTION_BLUEPRINTS,
  generatePlacementQuestion,
} = require("./placementExamBank");
const {
  PLACEMENT_ADVANCED_TYPES,
  generateValidatedAdvancedQuestion,
} = require("./placementAdvancedTypes");
const {
  listQuickPracticeProblemTypes,
} = require("./quickPracticeService");
const {
  cachedProblemTypeControl,
  isProblemTypeEnabled,
  problemTypeSelectionWeight,
  setActiveProblemTypeControls,
} = require("./problemTypeControlCache");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CATEGORY_DEFINITIONS = Object.freeze({
  CONCEPT_PRACTICE: {
    label: "개념·유형 학습",
    description: "개념학습과 오답노트에서 숫자를 바꾸어 출제하는 유형",
  },
  ASSESSMENT_CENTER: {
    label: "평가센터",
    description: "40초 눈풀이와 소단원·대단원·과목 평가에 사용하는 중상·응용·심화 유형",
  },
  PLACEMENT_EXAM: {
    label: "배치고사",
    description: "30문항 배치고사의 번호별 출제 청사진과 준킬러·킬러 세부 생성 유형",
  },
});
const ACTIVE_CACHE_TTL_MS = 15 * 1000;

let registryCache = null;
let activeControlCacheExpiresAt = 0;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanCategory(value) {
  const category = String(value || "").trim().toUpperCase();
  if (!CATEGORY_DEFINITIONS[category]) {
    throw statusError(400, "문제 데이터 분류를 확인해주세요.");
  }
  return category;
}

function relativeFile(file) {
  if (!file) return "";
  return path.relative(PROJECT_ROOT, path.resolve(file));
}

function snapshotText(value) {
  if (typeof value === "function") return value.toString();
  return JSON.stringify(value, null, 2);
}

function boundedSnapshot(parts) {
  return parts.filter(Boolean).join("\n\n").slice(0, 23900);
}

function sourceHash(sourceSnapshot) {
  return createHash("sha256").update(sourceSnapshot, "utf8").digest("hex");
}

function conceptProblemEngineKey({ courseId, unitId, conceptId, typeId }) {
  return [courseId, unitId, conceptId, typeId].map(String).join("/");
}

function assessmentProblemEngineKey(typeId) {
  return String(typeId || "");
}

function placementProblemEngineKey(questionNumber) {
  return `question:${Number(questionNumber)}`;
}

function moduleSourceFile(target, fallback = "") {
  const cached = Object.values(require.cache).find(
    (entry) => entry?.exports === target
  );
  return relativeFile(cached?.filename || fallback);
}

function registerEngine(target, entry) {
  if (!entry.engineKey || target.has(`${entry.category}:${entry.engineKey}`)) {
    return;
  }
  const sourceSnapshot = boundedSnapshot(entry.sourceParts || []);
  target.set(`${entry.category}:${entry.engineKey}`, {
    ...entry,
    sourceSnapshot,
    sourceHash: sourceHash(sourceSnapshot),
  });
}

function buildProblemEngineRegistry() {
  if (registryCache) return registryCache;
  const registry = new Map();
  const registrations = listProblemGeneratorRegistrations();

  for (const registration of registrations) {
    for (const problemType of registration.generator.problemTypes || []) {
      const conceptKey = conceptProblemEngineKey({
        ...registration,
        typeId: problemType.id,
      });
      const sourceFile = relativeFile(registration.sourceFile);
      const sourceParts = [
        `// ${conceptKey}`,
        snapshotText(problemType.generate),
        typeof problemType.validate === "function"
          ? snapshotText(problemType.validate)
          : "",
      ];
      registerEngine(registry, {
        category: "CONCEPT_PRACTICE",
        engineKey: conceptKey,
        displayName: problemType.label || problemType.id,
        courseId: registration.courseId,
        unitId: registration.unitId,
        conceptId: registration.conceptId,
        sourceFile,
        sourceParts,
        definition: problemType,
        generateSample: () => generateValidProblem(problemType, 40),
      });

      const assessmentKey = assessmentProblemEngineKey(
        `bank:local-${registration.conceptId}-${problemType.id}`
      );
      registerEngine(registry, {
        category: "ASSESSMENT_CENTER",
        engineKey: assessmentKey,
        displayName: `${problemType.label || problemType.id} · 평가센터 연동`,
        courseId: registration.courseId,
        unitId: registration.unitId,
        conceptId: registration.conceptId,
        sourceFile,
        sourceParts,
        definition: problemType,
        generateSample: () => generateValidProblem(problemType, 40),
      });
    }
  }

  for (const course of EXAM_COURSES) {
    for (const unit of course.units || []) {
      for (const subunit of unit.subs || []) {
        for (const generator of subunit.gens || []) {
          registerEngine(registry, {
            category: "ASSESSMENT_CENTER",
            engineKey: assessmentProblemEngineKey(`bank:${generator.id}`),
            displayName: generator.label || generator.id,
            courseId: course.id,
            unitId: unit.id,
            conceptId: "",
            sourceFile: "services/examBankSource.js",
            sourceParts: [
              `// ${generator.id}`,
              snapshotText(generator.generate),
            ],
            definition: generator,
            generateSample: () => generator.generate(),
          });
        }
      }
    }
  }

  const templateSourceByUnit = {
    "algebra/exponential-logarithmic-functions":
      "services/assessmentTemplates/algebra/exponentialLogarithmicFunctions.js",
    "algebra/trigonometric-functions":
      "services/assessmentTemplates/algebra/trigonometricFunctions.js",
    "algebra/sequences": "services/assessmentTemplates/algebra/sequences.js",
    "calculus-1/limits-and-continuity":
      "services/assessmentTemplates/calculus1/limitsAndContinuity.js",
    "calculus-1/differentiation":
      "services/assessmentTemplates/calculus1/differentiation.js",
    "calculus-1/integration":
      "services/assessmentTemplates/calculus1/integration.js",
    "probability-statistics/counting":
      "services/assessmentTemplates/probabilityStatistics/counting.js",
    "probability-statistics/probability":
      "services/assessmentTemplates/probabilityStatistics/probability.js",
    "probability-statistics/statistics":
      "services/assessmentTemplates/probabilityStatistics/statistics.js",
  };
  for (const config of unitConfigs) {
    for (const template of config.advancedTemplates || []) {
      registerEngine(registry, {
        category: "ASSESSMENT_CENTER",
        engineKey: assessmentProblemEngineKey(`advanced:${template.id}`),
        displayName: template.title || template.id,
        courseId: config.courseId,
        unitId: config.unitId,
        conceptId: (template.requiredConceptIds || []).at(-1) || "",
        sourceFile:
          templateSourceByUnit[`${config.courseId}/${config.unitId}`] || "",
        sourceParts: [
          `// ${template.id}`,
          snapshotText(template.generate),
          snapshotText(template.validate),
        ],
        definition: template,
        generateSample: () => generateValidProblem(template, 60),
      });
    }
  }

  for (const problemType of listQuickPracticeProblemTypes()) {
    registerEngine(registry, {
      category: "ASSESSMENT_CENTER",
      engineKey: problemType.id,
      displayName: `40초 눈풀이 · ${problemType.label}`,
      courseId: "quick-practice",
      unitId: `${problemType.points}-point`,
      conceptId: problemType.templateKey,
      sourceFile: "services/quickPracticeService.js",
      sourceParts: problemType.sourceParts,
      definition: problemType,
      generateSample: () => problemType.generate(),
    });
  }

  for (const blueprint of PLACEMENT_QUESTION_BLUEPRINTS) {
    registerEngine(registry, {
      category: "PLACEMENT_EXAM",
      engineKey: placementProblemEngineKey(blueprint.number),
      displayName: `배치고사 ${blueprint.number}번 · ${blueprint.targetTypeLabel}`,
      courseId: blueprint.fixedCourseId || "integrated-placement",
      unitId: "",
      conceptId: "",
      sourceFile: "services/placementExamBank.js",
      sourceParts: [
        `// 배치고사 ${blueprint.number}번 청사진`,
        snapshotText(blueprint),
      ],
      definition: blueprint,
      validationMode: "PAPER_BLUEPRINT",
      generateSample: () =>
        generatePlacementQuestion(blueprint, new Set(), new Set()),
    });
  }

  for (const [typeId, definition] of Object.entries(PLACEMENT_ADVANCED_TYPES)) {
    registerEngine(registry, {
      category: "PLACEMENT_EXAM",
      engineKey: `advanced:${typeId}`,
      displayName: `배치고사 고난도 · ${definition.label}`,
      courseId: definition.courseId,
      unitId: definition.referenceFamily,
      conceptId: "",
      sourceFile: "services/placementAdvancedTypes.js",
      sourceParts: [
        `// advanced:${typeId}`,
        definition.generate.toString(),
        definition.validate.toString(),
      ],
      definition: {
        ...definition,
        validate: null,
      },
      generateSample: () =>
        generateValidatedAdvancedQuestion({
          category: definition.category,
          courseId: definition.courseId,
          typeWeights: { [typeId]: 1 },
        }),
    });
  }

  registryCache = registry;
  return registryCache;
}

function calculatorFreeCheck(problem, generated) {
  const explicit =
    generated?.validation?.calculatorFree ??
    problem?.validation?.calculatorFree ??
    problem?.calculatorFree;
  if (explicit === false) return false;
  const prompt = String(problem?.prompt || "");
  const solution = String(problem?.solution || "");
  if (/계산기\s*(?:사용|필요)|calculator\s+required/i.test(`${prompt} ${solution}`)) {
    return false;
  }
  const answer = String(problem?.answer ?? "").trim();
  if (!answer || answer.length > 120 || /NaN|undefined|null/i.test(answer)) {
    return false;
  }
  return true;
}

function answerVerificationMode(problem, definition, generated, validationMode) {
  if (
    generated?.validation?.answerMatches === true ||
    problem?.validation?.answerMatches === true
  ) {
    return { verified: true, mode: validationMode || "TYPE_SPECIFIC" };
  }
  const checks = Array.isArray(problem?.validityChecks)
    ? problem.validityChecks
    : [];
  if (checks.length && checks.every((check) => check?.passed === true)) {
    return { verified: true, mode: "TYPE_SPECIFIC" };
  }
  if (typeof definition?.validate === "function" && definition.validate(problem)) {
    return { verified: true, mode: "TYPE_SPECIFIC" };
  }
  return {
    verified: Boolean(problem?.solution && String(problem.solution).trim()),
    mode: validationMode || "BOUNDED_ENGINE",
  };
}

async function validateRegistryEngine(engine, { sampleCount = 2 } = {}) {
  const failures = [];
  let completed = 0;
  let calculatorFree = true;
  let answerVerified = true;
  let validationMode = engine.validationMode || "BOUNDED_ENGINE";
  for (let sample = 0; sample < sampleCount; sample += 1) {
    let generated = null;
    let problem = null;
    let lastError = null;
    for (let retry = 0; retry < 40; retry += 1) {
      try {
        generated = await engine.generateSample();
        problem = generated?.problem || generated;
        validateGeneratedProblem(
          {
            ...problem,
            hintText:
              problem?.hintText ||
              "조건을 식으로 옮기고 풀이 결과를 원래 조건에 대입해 확인하세요.",
          },
          { id: engine.engineKey, validate: engine.definition?.validate }
        );
        const currentCalculatorFree = calculatorFreeCheck(problem, generated);
        const answerCheck = answerVerificationMode(
          problem,
          engine.definition,
          generated,
          engine.validationMode
        );
        if (!currentCalculatorFree || !answerCheck.verified) {
          throw new Error(
            !currentCalculatorFree
              ? "계산기 없이 풀이 가능한 수치 범위 검증에 실패했습니다."
              : "정답 검산 근거를 확인할 수 없습니다."
          );
        }
        calculatorFree &&= currentCalculatorFree;
        answerVerified &&= answerCheck.verified;
        validationMode = answerCheck.mode;
        completed += 1;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) {
      failures.push(String(lastError.message || lastError).slice(0, 1000));
      break;
    }
  }
  return {
    passed: failures.length === 0 && completed === sampleCount,
    sampleCount: completed,
    validationMode,
    calculatorFree: failures.length === 0 && calculatorFree,
    answerVerified: failures.length === 0 && answerVerified,
    failures,
    validatedAt: new Date(),
  };
}

function versionDocument(engine, validationReport, overrides = {}) {
  return {
    category: engine.category,
    engineKey: engine.engineKey,
    revision: Number(overrides.revision || 1),
    status: "ACTIVE",
    displayName: engine.displayName,
    courseId: engine.courseId || "",
    unitId: engine.unitId || "",
    conceptId: engine.conceptId || "",
    sourceFile: engine.sourceFile || "",
    sourceHash: engine.sourceHash,
    sourceSnapshot: engine.sourceSnapshot,
    enabled: overrides.enabled !== false,
    selectionWeight: Number(overrides.selectionWeight || 1),
    calculatorPolicyId: "CALCULATOR_FREE_BOUNDED_V1",
    operatorNote: String(overrides.operatorNote || "").trim().slice(0, 1000),
    validationReport,
    basedOnVersionId: overrides.basedOnVersionId || null,
    createdBy: overrides.createdBy || null,
  };
}

async function reloadActiveProblemTypeControls() {
  const active = await ProblemTypeVersion.find({ status: "ACTIVE" }).lean();
  const registry = buildProblemEngineRegistry();
  const activeControlCache = new Map(
    active.map((version) => {
      const registryKey = `${version.category}:${version.engineKey}`;
      const serverEngine = registry.get(registryKey);
      return [
        registryKey,
        {
          ...version,
          sourceMatchesServer:
            Boolean(serverEngine) && serverEngine.sourceHash === version.sourceHash,
        },
      ];
    })
  );
  setActiveProblemTypeControls(activeControlCache);
  activeControlCacheExpiresAt = Date.now() + ACTIVE_CACHE_TTL_MS;
  return activeControlCache;
}

async function syncProblemTypeRegistry({
  adminUserId = null,
  activateSourceChanges = false,
} = {}) {
  await ProblemTypeVersion.createIndexes();
  const registry = buildProblemEngineRegistry();
  const active = await ProblemTypeVersion.find({ status: "ACTIVE" }).lean();
  const activeByKey = new Map(
    active.map((version) => [`${version.category}:${version.engineKey}`, version])
  );
  const inserted = [];
  const updated = [];
  const newDocuments = [];
  for (const [registryKey, engine] of registry) {
    const current = activeByKey.get(registryKey);
    if (current && (!activateSourceChanges || current.sourceHash === engine.sourceHash)) {
      continue;
    }
    const validationReport = await validateRegistryEngine(engine, {
      sampleCount: activateSourceChanges ? 3 : 1,
    });
    if (!validationReport.passed) {
      throw statusError(
        422,
        `${engine.displayName} 검산 실패: ${validationReport.failures[0] || "문제 생성기를 확인해주세요."}`,
        "PROBLEM_TYPE_VALIDATION_FAILED"
      );
    }
    if (!current) {
      newDocuments.push(
        versionDocument(engine, validationReport, { createdBy: adminUserId })
      );
      inserted.push(engine.engineKey);
      continue;
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ProblemTypeVersion.updateOne(
          { _id: current._id, status: "ACTIVE" },
          { $set: { status: "RETIRED", retiredAt: new Date() } },
          { session }
        );
        await ProblemTypeVersion.create(
          [
            versionDocument(engine, validationReport, {
              revision: Number(current.revision) + 1,
              enabled: current.enabled,
              selectionWeight: current.selectionWeight,
              operatorNote: current.operatorNote,
              basedOnVersionId: current._id,
              createdBy: adminUserId,
            }),
          ],
          { session, ordered: true }
        );
      });
    } finally {
      await session.endSession();
    }
    updated.push(engine.engineKey);
  }
  if (newDocuments.length) {
    await ProblemTypeVersion.insertMany(newDocuments, {
      ordered: false,
    });
  }
  await reloadActiveProblemTypeControls();
  if (adminUserId && (inserted.length || updated.length)) {
    await AdminActionLog.create({
      adminUserId,
      action: "problem-types.registry-sync",
      detail: `신규 ${inserted.length}개 · 소스 갱신 ${updated.length}개`,
      metadata: { inserted, updated },
    });
  }
  return { inserted, updated, total: registry.size };
}

async function ensureActiveControlCache() {
  if (Date.now() >= activeControlCacheExpiresAt) {
    return reloadActiveProblemTypeControls();
  }
  return null;
}

async function reviseProblemTypeVersion({ adminUserId, versionId, input = {} }) {
  if (!mongoose.isValidObjectId(versionId)) {
    throw statusError(400, "수정할 문제 유형 버전을 확인해주세요.");
  }
  const current = await ProblemTypeVersion.findOne({
    _id: versionId,
    status: "ACTIVE",
  }).lean();
  if (!current) throw statusError(404, "현재 적용 중인 문제 유형을 찾지 못했습니다.");
  const engine = buildProblemEngineRegistry().get(
    `${current.category}:${current.engineKey}`
  );
  if (!engine) {
    throw statusError(409, "현재 서버 생성기에서 이 문제 유형을 찾지 못했습니다.");
  }
  const selectionWeight = Number(input.selectionWeight || 1);
  if (!Number.isInteger(selectionWeight) || selectionWeight < 1 || selectionWeight > 100) {
    throw statusError(400, "출제 가중치는 1~100의 정수로 입력해주세요.");
  }
  const validationReport = await validateRegistryEngine(engine, { sampleCount: 5 });
  if (!validationReport.passed) {
    throw statusError(
      422,
      `자동 검산에 실패했습니다: ${validationReport.failures[0] || "생성기를 확인해주세요."}`
    );
  }
  const enabled = ["1", "true", "on"].includes(String(input.enabled || "").toLowerCase());
  const session = await mongoose.startSession();
  let created = null;
  try {
    await session.withTransaction(async () => {
      await ProblemTypeVersion.updateOne(
        { _id: current._id, status: "ACTIVE" },
        { $set: { status: "RETIRED", retiredAt: new Date() } },
        { session }
      );
      [created] = await ProblemTypeVersion.create(
        [
          versionDocument(engine, validationReport, {
            revision: Number(current.revision) + 1,
            enabled,
            selectionWeight,
            operatorNote: input.operatorNote,
            basedOnVersionId: current._id,
            createdBy: adminUserId,
          }),
        ],
        { session, ordered: true }
      );
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "problem-types.revise",
            detail: `${current.displayName} r${Number(current.revision) + 1}`,
            metadata: {
              previousVersionId: String(current._id),
              versionId: String(created._id),
              category: current.category,
              engineKey: current.engineKey,
              enabled,
              selectionWeight,
            },
          },
        ],
        { session, ordered: true }
      );
    });
  } finally {
    await session.endSession();
  }
  await reloadActiveProblemTypeControls();
  return created;
}

async function getAdminProblemTypeCatalog({
  category = "CONCEPT_PRACTICE",
  query = "",
  inspectVersionId = "",
} = {}) {
  await ensureActiveControlCache();
  const selectedCategory = cleanCategory(category);
  const search = String(query || "").trim().slice(0, 120);
  const filter = { category: selectedCategory, status: "ACTIVE" };
  if (search) {
    filter.$or = [
      { displayName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { engineKey: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    ];
  }
  const [entries, counts] = await Promise.all([
    ProblemTypeVersion.find(filter)
      .sort({ courseId: 1, unitId: 1, conceptId: 1, engineKey: 1 })
      .limit(150)
      .lean(),
    Promise.all(
      Object.keys(CATEGORY_DEFINITIONS).map(async (key) => [
        key,
        await ProblemTypeVersion.countDocuments({ category: key, status: "ACTIVE" }),
      ])
    ),
  ]);
  let inspected = null;
  let history = [];
  if (mongoose.isValidObjectId(inspectVersionId)) {
    inspected = await ProblemTypeVersion.findOne({
      _id: inspectVersionId,
      category: selectedCategory,
    }).lean();
    if (inspected) {
      history = await ProblemTypeVersion.find({
        category: inspected.category,
        engineKey: inspected.engineKey,
      })
        .sort({ revision: -1 })
        .limit(30)
        .select(
          "revision status enabled selectionWeight validationReport createdAt retiredAt operatorNote sourceHash"
        )
        .lean();
    }
  }
  const registry = buildProblemEngineRegistry();
  return {
    categories: Object.entries(CATEGORY_DEFINITIONS).map(([key, value]) => ({
      key,
      ...value,
      count: new Map(counts).get(key) || 0,
    })),
    selectedCategory,
    selectedCategoryInfo: CATEGORY_DEFINITIONS[selectedCategory],
    query: search,
    entries: entries.map((entry) => ({
      ...entry,
      codeChanged:
        registry.get(`${entry.category}:${entry.engineKey}`)?.sourceHash !==
        entry.sourceHash,
    })),
    inspected: inspected
      ? {
          ...inspected,
          currentServerSnapshot:
            registry.get(`${inspected.category}:${inspected.engineKey}`)?.sourceSnapshot || "",
          currentServerHash:
            registry.get(`${inspected.category}:${inspected.engineKey}`)?.sourceHash || "",
        }
      : null,
    history,
  };
}

module.exports = {
  ACTIVE_CACHE_TTL_MS,
  CATEGORY_DEFINITIONS,
  assessmentProblemEngineKey,
  buildProblemEngineRegistry,
  cachedProblemTypeControl,
  conceptProblemEngineKey,
  ensureActiveControlCache,
  getAdminProblemTypeCatalog,
  isProblemTypeEnabled,
  placementProblemEngineKey,
  problemTypeSelectionWeight,
  reloadActiveProblemTypeControls,
  reviseProblemTypeVersion,
  syncProblemTypeRegistry,
  validateRegistryEngine,
};
