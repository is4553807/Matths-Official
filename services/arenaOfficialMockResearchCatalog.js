const catalog = require("../dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json");

const COURSE_TRANSFER_FAMILIES = Object.freeze({
  "common-math-1": Object.freeze([
    Object.freeze({ familyId: "CM1-POLYNOMIAL", familyLabel: "다항식 항등식·나머지 조건 역추적" }),
    Object.freeze({ familyId: "CM1-EQUATION-INEQUALITY", familyLabel: "방정식·부등식의 해 조건 결합" }),
    Object.freeze({ familyId: "CM1-COUNTING", familyLabel: "경우의 수 제한 조건과 대칭성" }),
    Object.freeze({ familyId: "CM1-MATRIX", familyLabel: "행렬 연산과 미정 성분 조건 추론" }),
  ]),
  "common-math-2": Object.freeze([
    Object.freeze({ familyId: "CM2-COORDINATE-CIRCLE", familyLabel: "좌표도형·원·직선의 위치 관계" }),
    Object.freeze({ familyId: "CM2-SETS-PROPOSITIONS", familyLabel: "집합·명제의 필요충분조건 추론" }),
    Object.freeze({ familyId: "CM2-RATIONAL-RADICAL", familyLabel: "유리·무리함수 그래프와 정수 조건" }),
    Object.freeze({ familyId: "CM2-COMPOSITION-INVERSE", familyLabel: "합성함수·역함수 조건 역추적" }),
  ]),
});

function activeRecords() {
  return catalog.records.filter((record) => record.status === "ACTIVE_REFERENCE");
}

function familyStats() {
  const stats = new Map();
  for (const record of activeRecords()) {
    const current = stats.get(record.familyId) || {
      familyId: record.familyId,
      familyLabel: record.familyLabel,
      courseId: record.courseId,
      references: 0,
      tiers: {},
      regularReferences: 0,
      finalReferences: 0,
    };
    current.references += 1;
    current.tiers[record.difficultyTier] = Number(current.tiers[record.difficultyTier] || 0) + 1;
    if (record.finalSlotInfluence) current.finalReferences += 1;
    else current.regularReferences += 1;
    stats.set(record.familyId, current);
  }
  return [...stats.values()].sort(
    (left, right) => right.references - left.references || left.familyLabel.localeCompare(right.familyLabel, "ko")
  );
}

const FAMILY_STATS = Object.freeze(familyStats().map(Object.freeze));

function countActiveBy(key) {
  const counts = {};
  for (const record of activeRecords()) {
    const value = record[key];
    if (!value) continue;
    counts[value] = Number(counts[value] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function familiesForTier(tier, courseId, { slotRole = "REGULAR", limit = 4 } = {}) {
  const tierNumber = Number(String(tier || "T1").replace(/\D/g, "")) || 1;
  const finalSlot = slotRole === "FINAL_29_30";
  const direct = FAMILY_STATS
    .filter((family) => family.courseId === courseId)
    .map((family) => ({
      ...family,
      tierReferences: [tierNumber - 1, tierNumber, tierNumber + 1].reduce(
        (sum, currentTier) => sum + Number(family.tiers[`T${currentTier}`] || 0),
        0
      ),
      slotReferences: finalSlot ? family.finalReferences : family.regularReferences,
      basis: "OFFICIAL_MOCK_REFERENCE",
    }))
    .filter((family) => family.slotReferences > 0)
    .sort(
      (left, right) =>
        right.tierReferences - left.tierReferences ||
        right.slotReferences - left.slotReferences ||
        right.references - left.references
    );

  if (direct.length >= limit) return direct.slice(0, limit);
  const transfers = (COURSE_TRANSFER_FAMILIES[courseId] || []).map((family) => ({
    ...family,
    courseId,
    references: 0,
    tierReferences: 0,
    slotReferences: 0,
    basis: "CURRICULUM_TRANSFER",
  }));
  return [...direct, ...transfers.filter(
    (transfer) => !direct.some((family) => family.familyId === transfer.familyId)
  )].slice(0, limit);
}

function getOfficialMockResearchSummary() {
  return {
    ...catalog.summary,
    byCourse: countActiveBy("courseId"),
    byDifficulty: countActiveBy("difficultyTier"),
    byFamily: countActiveBy("familyId"),
    byPositionBand: countActiveBy("sourcePositionBand"),
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
    targetQuestions: [...catalog.methodology.targetQuestions],
    sourcePositionsAreAuxiliary: catalog.methodology.sourcePositionsAreAuxiliary === true,
    fifthSlotRule: catalog.methodology.fifthSlotRule,
    familyStats: FAMILY_STATS,
    transferFamilyCount: Object.values(COURSE_TRANSFER_FAMILIES).reduce(
      (sum, families) => sum + families.length,
      0
    ),
  };
}

module.exports = {
  COURSE_TRANSFER_FAMILIES,
  FAMILY_STATS,
  activeRecords,
  familiesForTier,
  getOfficialMockResearchSummary,
};
