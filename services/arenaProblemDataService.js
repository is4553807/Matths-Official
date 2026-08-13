const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { AdminActionLog } = require("../models/matthsModel");
const {
  ArenaProblemDataVersion,
} = require("../models/goatArenaModel");
const {
  ARENA_ONE_ON_ONE_PROBLEM_TYPES,
  generateValidatedArenaOneOnOneQuestion,
} = require("./arenaOneOnOneProblemTypes");
const {
  isNaturalNumberMaxThreeDigits,
} = require("./arenaOneOnOneDifficultyPolicy");

const ARENA_PROBLEM_DIFFICULTY_TIERS = [
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "T7",
  "T8",
  "T9",
];
const ARENA_PROBLEM_ENGINE_VERSION = "ARENA-GENERATOR-JS-V1";
const DEFAULT_ARENA_PROBLEM_DATA_CODE = "ARENA-PROBLEM-DATA-V1";
const ACTIVE_CACHE_TTL_MS = 15 * 1000;

let activeVersionCache = null;
let activeVersionCacheExpiresAt = 0;
let problemDataChangeStream = null;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

function availableArenaProblemTypes() {
  return Object.entries(ARENA_ONE_ON_ONE_PROBLEM_TYPES)
    .filter(
      ([, definition]) =>
        definition.category === "semi-killer" &&
        definition.arenaNaturalAnswerEligible === true
    )
    .map(([typeId, definition]) => ({
      typeId,
      label: String(definition.label || typeId),
      courseId: String(definition.courseId || ""),
      referenceFamily: String(definition.referenceFamily || ""),
      skillTags: Array.isArray(definition.skillTags)
        ? definition.skillTags.map(String)
        : [],
      difficultyScore: Number(definition.difficultyScore || 0),
      expectedTimeMs: Number(definition.expectedTimeMs || 0),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "ko"));
}

function availableTypeIdSet() {
  return new Set(availableArenaProblemTypes().map((item) => item.typeId));
}

function defaultTierConfigurations() {
  const typeIds = availableArenaProblemTypes().map((item) => item.typeId);
  if (typeIds.length < 5) {
    throw new Error("Arena 기본 문제 데이터를 만들 일반 슬롯 유형이 5개 미만입니다.");
  }
  return ARENA_PROBLEM_DIFFICULTY_TIERS.map((difficultyTier, tierIndex) => ({
    difficultyTier,
    typeIds: typeIds.map(
      (_typeId, typeIndex) => typeIds[(typeIndex + tierIndex) % typeIds.length]
    ),
  }));
}

function defaultTypeSettings() {
  return availableArenaProblemTypes().map((item) => ({
    typeId: item.typeId,
    enabled: true,
    selectionWeight: 1,
    answerMin: 1,
    answerMax: 999,
    difficultyNote: "",
  }));
}

function boundedInteger(value, fallback, min, max, label) {
  const number = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw statusError(400, `${label}은(는) ${min}~${max}의 정수로 입력해주세요.`);
  }
  return number;
}

function normalizeTypeSettings(input = {}) {
  const types = availableArenaProblemTypes();
  const hasFormSettings = types.some(
    (item) => Object.hasOwn(input, `weight__${item.typeId}`)
  );
  const settings = types.map((item) => {
    const typeId = item.typeId;
    const existing = Array.isArray(input.typeSettings)
      ? input.typeSettings.find((setting) => setting?.typeId === typeId)
      : null;
    const enabled = hasFormSettings
      ? String(input[`enabled__${typeId}`] || "") === "1"
      : existing
        ? existing.enabled !== false
        : true;
    const selectionWeight = boundedInteger(
      hasFormSettings ? input[`weight__${typeId}`] : existing?.selectionWeight,
      1,
      1,
      10,
      `${item.label} 배정 가중치`
    );
    const answerMin = boundedInteger(
      hasFormSettings ? input[`answerMin__${typeId}`] : existing?.answerMin,
      1,
      1,
      999,
      `${item.label} 정답 최솟값`
    );
    const answerMax = boundedInteger(
      hasFormSettings ? input[`answerMax__${typeId}`] : existing?.answerMax,
      999,
      1,
      999,
      `${item.label} 정답 최댓값`
    );
    if (answerMin > answerMax) {
      throw statusError(400, `${item.label}의 정답 최솟값은 최댓값보다 클 수 없습니다.`);
    }
    return {
      typeId,
      enabled,
      selectionWeight,
      answerMin,
      answerMax,
      difficultyNote: String(
        hasFormSettings
          ? input[`difficultyNote__${typeId}`] || ""
          : existing?.difficultyNote || ""
      )
        .trim()
        .slice(0, 300),
    };
  });
  if (settings.filter((item) => item.enabled).length < 5) {
    throw statusError(400, "사용 상태인 Arena 문제 유형이 최소 5개 필요합니다.");
  }
  return settings;
}

function normalizeTypeIds(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeTierConfigurations(
  input = {},
  { enabledTypeIds = availableTypeIdSet() } = {}
) {
  const knownTypeIds = availableTypeIdSet();
  const configurations = ARENA_PROBLEM_DIFFICULTY_TIERS.map((difficultyTier) => {
    const raw =
      input[`types_${difficultyTier}`] ??
      input?.tierConfigurations?.[difficultyTier] ??
      input?.tierConfigurations?.find?.(
        (item) => item?.difficultyTier === difficultyTier
      )?.typeIds;
    const typeIds = normalizeTypeIds(raw);
    if (typeIds.length < 5) {
      throw statusError(
        400,
        `${difficultyTier} 난이도에는 서로 다른 문제 유형을 5개 이상 선택해주세요.`,
        "ARENA_PROBLEM_TYPES_INSUFFICIENT"
      );
    }
    const unknownTypeId = typeIds.find((typeId) => !knownTypeIds.has(typeId));
    if (unknownTypeId) {
      throw statusError(
        400,
        `${difficultyTier}에 서버가 알지 못하는 문제 유형(${unknownTypeId})이 포함되어 있습니다.`,
        "UNKNOWN_ARENA_PROBLEM_TYPE"
      );
    }
    const disabledTypeId = typeIds.find((typeId) => !enabledTypeIds.has(typeId));
    if (disabledTypeId) {
      throw statusError(
        400,
        `${difficultyTier}에 사용 중지한 문제 유형(${disabledTypeId})이 선택되어 있습니다.`,
        "DISABLED_ARENA_PROBLEM_TYPE_SELECTED"
      );
    }
    return { difficultyTier, typeIds };
  });
  return configurations;
}

function cleanCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(code)) {
    throw statusError(
      400,
      "버전 코드는 영문 대문자·숫자·점·밑줄·하이픈으로 3~80자 입력해주세요.",
      "INVALID_ARENA_PROBLEM_DATA_CODE"
    );
  }
  return code;
}

function cleanRequiredText(value, label, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) {
    throw statusError(400, `${label}을(를) ${maxLength}자 이내로 입력해주세요.`);
  }
  return text;
}

function computeProblemDataHash(definition) {
  const payload = canonicalize({
    code: definition.code,
    engineVersion: definition.engineVersion,
    tierConfigurations: definition.tierConfigurations,
    typeSettings: definition.typeSettings,
  });
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function normalizeProblemDataInput(input = {}) {
  const typeSettings = normalizeTypeSettings(input);
  const enabledTypeIds = new Set(
    typeSettings.filter((item) => item.enabled).map((item) => item.typeId)
  );
  const definition = {
    code: cleanCode(input.code),
    displayName: cleanRequiredText(input.displayName, "버전 이름", 160),
    engineVersion: ARENA_PROBLEM_ENGINE_VERSION,
    tierConfigurations: normalizeTierConfigurations(input, { enabledTypeIds }),
    typeSettings,
    changeSummary: cleanRequiredText(input.changeSummary, "변경 사유", 1000),
  };
  return {
    ...definition,
    contentHash: computeProblemDataHash(definition),
  };
}

function selectedUniqueTypeIds(tierConfigurations) {
  return [
    ...new Set(
      (tierConfigurations || []).flatMap((configuration) =>
        Array.isArray(configuration.typeIds) ? configuration.typeIds : []
      )
    ),
  ];
}

async function validateArenaProblemDataDefinition(
  definition,
  { samplesPerType = 3 } = {}
) {
  const typeIds = selectedUniqueTypeIds(definition.tierConfigurations);
  const settingMap = new Map(
    (definition.typeSettings?.length ? definition.typeSettings : defaultTypeSettings()).map(
      (setting) => [setting.typeId, setting]
    )
  );
  const failures = [];
  let sampleCount = 0;
  for (const typeId of typeIds) {
    for (let sample = 1; sample <= samplesPerType; sample += 1) {
      sampleCount += 1;
      let passed = false;
      let lastError = null;
      for (let retry = 0; retry < 40; retry += 1) {
        try {
          const generated = generateValidatedArenaOneOnOneQuestion({ typeId });
          const numericAnswer = Number(generated?.problem?.answer);
          const setting = settingMap.get(typeId) || {
            enabled: true,
            answerMin: 1,
            answerMax: 999,
          };
          passed =
            setting.enabled !== false &&
            generated?.validation?.passed === true &&
            generated?.validation?.solvable === true &&
            generated?.validation?.uniqueAnswer === true &&
            generated?.validation?.calculatorFree === true &&
            generated?.validation?.answerMatches === true &&
            isNaturalNumberMaxThreeDigits(generated?.problem?.answer) &&
            numericAnswer >= Number(setting.answerMin ?? 1) &&
            numericAnswer <= Number(setting.answerMax ?? 999);
          if (passed) break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!passed) {
        failures.push({
          typeId,
          sample,
          message: lastError
            ? String(lastError.message || lastError).slice(0, 1000)
            : "자동 검산 또는 3자리 이하 자연수 정답 조건을 통과하지 못했습니다.",
        });
        break;
      }
    }
  }
  return {
    passed: failures.length === 0,
    sampledTypeCount: typeIds.length,
    sampleCount,
    failures,
    validatedAt: new Date(),
  };
}

function invalidateArenaProblemDataCache() {
  activeVersionCache = null;
  activeVersionCacheExpiresAt = 0;
}

async function ensureDefaultArenaProblemDataVersion() {
  const existing = await ArenaProblemDataVersion.findOne({ status: "ACTIVE" }).lean();
  if (existing) return existing;
  const tierConfigurations = defaultTierConfigurations();
  const typeSettings = defaultTypeSettings();
  const definition = {
    code: DEFAULT_ARENA_PROBLEM_DATA_CODE,
    displayName: "GOAT Arena 기본 문제 데이터",
    engineVersion: ARENA_PROBLEM_ENGINE_VERSION,
    tierConfigurations,
    typeSettings,
    changeSummary: "기존 Arena 준킬러 문제 유형을 DB 버전으로 최초 등록",
  };
  const validationReport = await validateArenaProblemDataDefinition(definition, {
    samplesPerType: 1,
  });
  if (!validationReport.passed) {
    throw new Error("Arena 기본 문제 데이터가 자동 검산을 통과하지 못했습니다.");
  }
  try {
    const created = await ArenaProblemDataVersion.create({
      ...definition,
      contentHash: computeProblemDataHash(definition),
      status: "ACTIVE",
      validationReport,
      activatedAt: new Date(),
    });
    invalidateArenaProblemDataCache();
    return created.toObject();
  } catch (error) {
    if (Number(error?.code) === 11000) {
      const raced = await ArenaProblemDataVersion.findOne({ status: "ACTIVE" }).lean();
      if (raced) return raced;
    }
    throw error;
  }
}

async function ensureArenaProblemDataIndexes() {
  await ArenaProblemDataVersion.createIndexes();
}

async function getActiveArenaProblemDataVersion({ session = null } = {}) {
  const now = Date.now();
  if (!session && activeVersionCache && now < activeVersionCacheExpiresAt) {
    return activeVersionCache;
  }
  let query = ArenaProblemDataVersion.findOne({ status: "ACTIVE" });
  if (session) query = query.session(session);
  let active = await query.lean();
  if (!active && !session) active = await ensureDefaultArenaProblemDataVersion();
  if (!active) {
    throw statusError(
      503,
      "현재 적용 중인 Arena 문제 데이터가 없습니다.",
      "ACTIVE_ARENA_PROBLEM_DATA_MISSING"
    );
  }
  if (!session) {
    activeVersionCache = active;
    activeVersionCacheExpiresAt = now + ACTIVE_CACHE_TTL_MS;
  }
  return active;
}

function typeIdsForDifficultyTier(version, difficultyTier) {
  const tier = String(difficultyTier || "").toUpperCase();
  const configuration = (version?.tierConfigurations || []).find(
    (item) => item.difficultyTier === tier
  );
  if (!configuration || !Array.isArray(configuration.typeIds) || configuration.typeIds.length < 5) {
    throw statusError(
      503,
      `${tier || "해당"} 난이도의 적용 문제 데이터가 올바르지 않습니다.`,
      "ARENA_PROBLEM_TIER_DATA_INVALID"
    );
  }
  const settings = new Map(
    (version?.typeSettings?.length ? version.typeSettings : defaultTypeSettings()).map(
      (setting) => [setting.typeId, setting]
    )
  );
  const enabledTypeIds = configuration.typeIds.filter(
    (typeId) => settings.get(typeId)?.enabled !== false
  );
  if (enabledTypeIds.length < 5) {
    throw statusError(
      503,
      `${tier} 난이도에서 사용 가능한 문제 유형이 5개 미만입니다.`,
      "ARENA_PROBLEM_TIER_ENABLED_DATA_INSUFFICIENT"
    );
  }
  return enabledTypeIds;
}

function problemTypeSetting(version, typeId) {
  return (
    (version?.typeSettings || []).find((setting) => setting.typeId === typeId) ||
    defaultTypeSettings().find((setting) => setting.typeId === typeId) ||
    { typeId, enabled: true, selectionWeight: 1, answerMin: 1, answerMax: 999 }
  );
}

function weightedTypeIdsForPack(version, difficultyTier, packIndex) {
  return typeIdsForDifficultyTier(version, difficultyTier)
    .map((typeId) => {
      const setting = problemTypeSetting(version, typeId);
      const digest = createHash("sha256")
        .update(`${version?.code || "LEGACY"}:${difficultyTier}:${packIndex}:${typeId}`, "utf8")
        .digest();
      return {
        typeId,
        weightedScore:
          digest.readUInt32BE(0) / Math.max(1, Number(setting.selectionWeight || 1)),
      };
    })
    .sort((left, right) => left.weightedScore - right.weightedScore)
    .map((item) => item.typeId);
}

async function createArenaProblemDataDraft({ adminUserId, input }) {
  const normalized = normalizeProblemDataInput(input);
  if (await ArenaProblemDataVersion.exists({ code: normalized.code })) {
    throw statusError(409, "이미 사용 중인 문제 데이터 버전 코드입니다.");
  }
  const active = await getActiveArenaProblemDataVersion();
  const validationReport = await validateArenaProblemDataDefinition(normalized, {
    samplesPerType: 1,
  });
  const created = await ArenaProblemDataVersion.create({
    ...normalized,
    status: "DRAFT",
    validationReport,
    basedOnVersionId: active?._id || null,
    createdBy: adminUserId,
  });
  await AdminActionLog.create({
    adminUserId,
    action: "arena.problem-data-draft-create",
    detail: created.displayName,
    metadata: { versionId: String(created._id), code: created.code },
  });
  return created;
}

async function updateArenaProblemDataDraft({ adminUserId, versionId, input }) {
  if (!mongoose.isValidObjectId(versionId)) {
    throw statusError(400, "수정할 문제 데이터 버전을 확인해주세요.");
  }
  const draft = await ArenaProblemDataVersion.findById(versionId);
  if (!draft) throw statusError(404, "문제 데이터 초안을 찾지 못했습니다.");
  if (draft.status !== "DRAFT") {
    throw statusError(409, "초안 상태의 문제 데이터만 수정할 수 있습니다.");
  }
  const normalized = normalizeProblemDataInput(input);
  const duplicate = await ArenaProblemDataVersion.exists({
    _id: { $ne: draft._id },
    code: normalized.code,
  });
  if (duplicate) throw statusError(409, "이미 사용 중인 문제 데이터 버전 코드입니다.");
  const validationReport = await validateArenaProblemDataDefinition(normalized, {
    samplesPerType: 1,
  });
  draft.set({ ...normalized, validationReport });
  await draft.save();
  await AdminActionLog.create({
    adminUserId,
    action: "arena.problem-data-draft-update",
    detail: draft.displayName,
    metadata: { versionId: String(draft._id), code: draft.code },
  });
  return draft;
}

async function activateArenaProblemDataVersion({ adminUserId, versionId, now = new Date() }) {
  if (!mongoose.isValidObjectId(versionId)) {
    throw statusError(400, "적용할 문제 데이터 버전을 확인해주세요.");
  }
  const draft = await ArenaProblemDataVersion.findById(versionId).lean();
  if (!draft) throw statusError(404, "문제 데이터 초안을 찾지 못했습니다.");
  if (draft.status !== "DRAFT") {
    throw statusError(409, "초안 상태의 문제 데이터만 적용할 수 있습니다.");
  }
  const validationReport = await validateArenaProblemDataDefinition(draft, {
    samplesPerType: 5,
  });
  if (!validationReport.passed) {
    await ArenaProblemDataVersion.updateOne(
      { _id: draft._id, status: "DRAFT" },
      { $set: { validationReport } }
    );
    throw statusError(
      422,
      `자동 검산에 실패했습니다: ${validationReport.failures[0]?.message || "문제 유형을 확인해주세요."}`,
      "ARENA_PROBLEM_DATA_VALIDATION_FAILED"
    );
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ArenaProblemDataVersion.updateMany(
        { status: "ACTIVE" },
        { $set: { status: "RETIRED", retiredAt: now } },
        { session }
      );
      const activated = await ArenaProblemDataVersion.findOneAndUpdate(
        { _id: draft._id, status: "DRAFT" },
        {
          $set: {
            status: "ACTIVE",
            validationReport,
            activatedAt: now,
            activatedBy: adminUserId,
          },
        },
        { session, returnDocument: "after", runValidators: true }
      );
      if (!activated) {
        throw statusError(409, "문제 데이터 초안 상태가 변경되었습니다. 새로고침해주세요.");
      }
      await AdminActionLog.create(
        [
          {
            adminUserId,
            action: "arena.problem-data-activate",
            detail: activated.displayName,
            metadata: {
              versionId: String(activated._id),
              code: activated.code,
              sampleCount: validationReport.sampleCount,
            },
          },
        ],
        { session, ordered: true }
      );
    });
  } finally {
    await session.endSession();
  }
  invalidateArenaProblemDataCache();
  return ArenaProblemDataVersion.findById(versionId).lean();
}

async function getAdminArenaProblemData({ editVersionId = "" } = {}) {
  const active = await getActiveArenaProblemDataVersion();
  const drafts = await ArenaProblemDataVersion.find({ status: "DRAFT" })
    .sort({ updatedAt: -1 })
    .lean();
  const recent = await ArenaProblemDataVersion.find({})
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();
  let editable = null;
  if (mongoose.isValidObjectId(editVersionId)) {
    editable = drafts.find((item) => String(item._id) === String(editVersionId)) || null;
  }
  const formSource = editable || active;
  return {
    active,
    drafts,
    recent,
    editable,
    availableTypes: availableArenaProblemTypes(),
    difficultyTiers: ARENA_PROBLEM_DIFFICULTY_TIERS,
    form: {
      code: editable ? editable.code : "",
      displayName: editable ? editable.displayName : "",
      changeSummary: editable ? editable.changeSummary : "",
      tierConfigurations: (formSource?.tierConfigurations || defaultTierConfigurations()).map(
        (item) => ({ difficultyTier: item.difficultyTier, typeIds: [...item.typeIds] })
      ),
      typeSettings: (formSource?.typeSettings?.length
        ? formSource.typeSettings
        : defaultTypeSettings()
      ).map((setting) => ({ ...setting })),
    },
  };
}

function startArenaProblemDataVersionWatcher() {
  if (
    problemDataChangeStream ||
    process.env.DISABLE_ARENA_PROBLEM_DATA_WATCHER === "1" ||
    mongoose.connection.readyState !== 1
  ) {
    return problemDataChangeStream;
  }
  try {
    problemDataChangeStream = ArenaProblemDataVersion.watch([], {
      fullDocument: "updateLookup",
    });
    problemDataChangeStream.on("change", invalidateArenaProblemDataCache);
    problemDataChangeStream.on("error", (error) => {
      console.warn("Arena problem data change stream unavailable; using TTL cache:", error.message);
      problemDataChangeStream = null;
      invalidateArenaProblemDataCache();
    });
  } catch (error) {
    console.warn("Arena problem data change stream unavailable; using TTL cache:", error.message);
    problemDataChangeStream = null;
  }
  return problemDataChangeStream;
}

module.exports = {
  ACTIVE_CACHE_TTL_MS,
  ARENA_PROBLEM_DIFFICULTY_TIERS,
  ARENA_PROBLEM_ENGINE_VERSION,
  activateArenaProblemDataVersion,
  availableArenaProblemTypes,
  computeProblemDataHash,
  createArenaProblemDataDraft,
  defaultTypeSettings,
  defaultTierConfigurations,
  ensureDefaultArenaProblemDataVersion,
  ensureArenaProblemDataIndexes,
  getActiveArenaProblemDataVersion,
  getAdminArenaProblemData,
  invalidateArenaProblemDataCache,
  normalizeProblemDataInput,
  normalizeTypeSettings,
  normalizeTierConfigurations,
  startArenaProblemDataVersionWatcher,
  typeIdsForDifficultyTier,
  problemTypeSetting,
  weightedTypeIdsForPack,
  updateArenaProblemDataDraft,
  validateArenaProblemDataDefinition,
};
