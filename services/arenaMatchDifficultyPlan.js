/*
 * GOAT Arena 1대1 난이도 개편안의 독립 원본.
 *
 * - D1~D9는 EBSi 공개 문항별 정답률로 분류한 절대 난이도다.
 * - U1~U9와 R1~R9는 서로 다른 5문항 조합표를 가진다.
 * - 이 파일은 룰 페이지와 Arena 전용 문제 풀 런타임이 함께 읽는다.
 * - 활성화 뒤에도 이미 봉인된 문제 팩은 바꾸지 않고 신규 경기만 이 풀을 쓴다.
 * - Matths 평가센터 서비스·템플릿·문제 레지스트리를 import하지 않는다.
 */

const ARENA_MATCH_DIFFICULTY_PLAN_VERSION =
  "GOAT_ARENA_D1_D9_SPLIT_U_R_V2_ACTIVE";

const ARENA_MATCH_QUESTION_ROLLOUT = Object.freeze({
  preparedPoolId: "ARENA_PDF_SKELETONS_2016_2026_V1",
  status: "ACTIVE_NEW_MATCHES_ONLY",
  runtimeConnected: true,
  notice:
    "2016~2026 PDF 기반 Arena 전용 문제 풀을 신규 1대1 매치에 적용합니다. 기존 봉인 문제 팩은 유지됩니다.",
});

const SOURCE_DIFFICULTY_BANDS = Object.freeze({
  D1: Object.freeze({
    code: "D1",
    label: "기초 일반",
    minimumCorrectRatePercent: 70,
    maximumCorrectRatePercent: 100,
    rangeLabel: "70% 이상",
    observedReferenceMeanPercent: 73.1,
    observedReferenceCount: 45,
  }),
  D2: Object.freeze({
    code: "D2",
    label: "일반 하",
    minimumCorrectRatePercent: 60,
    maximumCorrectRatePercent: 70,
    rangeLabel: "60% 이상 70% 미만",
    observedReferenceMeanPercent: 64.5,
    observedReferenceCount: 174,
  }),
  D3: Object.freeze({
    code: "D3",
    label: "일반 상",
    minimumCorrectRatePercent: 50,
    maximumCorrectRatePercent: 60,
    rangeLabel: "50% 이상 60% 미만",
    observedReferenceMeanPercent: 55,
    observedReferenceCount: 231,
  }),
  D4: Object.freeze({
    code: "D4",
    label: "상위 일반 하",
    minimumCorrectRatePercent: 42,
    maximumCorrectRatePercent: 50,
    rangeLabel: "42% 이상 50% 미만",
    observedReferenceMeanPercent: 46.1,
    observedReferenceCount: 215,
  }),
  D5: Object.freeze({
    code: "D5",
    label: "상위 일반 상",
    minimumCorrectRatePercent: 35,
    maximumCorrectRatePercent: 42,
    rangeLabel: "35% 이상 42% 미만",
    observedReferenceMeanPercent: 38.6,
    observedReferenceCount: 159,
  }),
  D6: Object.freeze({
    code: "D6",
    label: "준킬러 하",
    minimumCorrectRatePercent: 25,
    maximumCorrectRatePercent: 35,
    rangeLabel: "25% 이상 35% 미만",
    observedReferenceMeanPercent: 30.1,
    observedReferenceCount: 165,
  }),
  D7: Object.freeze({
    code: "D7",
    label: "준킬러 상",
    minimumCorrectRatePercent: 15,
    maximumCorrectRatePercent: 25,
    rangeLabel: "15% 이상 25% 미만",
    observedReferenceMeanPercent: 20.1,
    observedReferenceCount: 126,
  }),
  D8: Object.freeze({
    code: "D8",
    label: "킬러 하",
    minimumCorrectRatePercent: 8,
    maximumCorrectRatePercent: 15,
    rangeLabel: "8% 이상 15% 미만",
    observedReferenceMeanPercent: 11.2,
    observedReferenceCount: 106,
  }),
  D9: Object.freeze({
    code: "D9",
    label: "킬러 상",
    minimumCorrectRatePercent: 0,
    maximumCorrectRatePercent: 8,
    rangeLabel: "8% 미만",
    observedReferenceMeanPercent: 4.8,
    observedReferenceCount: 136,
  }),
});

const TIER_PLAN_LABELS = Object.freeze([
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "에메랄드",
  "다이아몬드",
  "마스터",
  "그랜드마스터",
  "챌린저",
]);

const UNRANKED_DIFFICULTY_PACKS = Object.freeze([
  ["D1", "D1", "D1", "D1", "D2"],
  ["D1", "D1", "D2", "D2", "D2"],
  ["D1", "D2", "D2", "D2", "D3"],
  ["D2", "D2", "D3", "D3", "D3"],
  ["D2", "D3", "D3", "D4", "D4"],
  ["D3", "D3", "D4", "D4", "D5"],
  ["D3", "D4", "D4", "D5", "D5"],
  ["D4", "D4", "D5", "D5", "D6"],
  ["D4", "D5", "D5", "D6", "D6"],
].map(Object.freeze));

const RANKED_DIFFICULTY_PACKS = Object.freeze([
  ["D2", "D2", "D3", "D3", "D4"],
  ["D2", "D3", "D3", "D4", "D4"],
  ["D3", "D3", "D4", "D4", "D5"],
  ["D3", "D4", "D4", "D5", "D6"],
  ["D4", "D4", "D5", "D6", "D6"],
  ["D4", "D5", "D6", "D6", "D7"],
  ["D5", "D6", "D6", "D7", "D8"],
  ["D5", "D6", "D7", "D8", "D8"],
  ["D6", "D7", "D7", "D7", "D9"],
].map(Object.freeze));

function planRows(prefix, packs) {
  return Object.freeze(
    packs.map((difficultyCodes, index) => {
      const slots = difficultyCodes.map((code, slotIndex) => Object.freeze({
        order: slotIndex + 1,
        ...SOURCE_DIFFICULTY_BANDS[code],
      }));
      const referenceAveragePercent = Number((
        slots.reduce(
          (sum, slot) => sum + slot.observedReferenceMeanPercent,
          0
        ) / slots.length
      ).toFixed(1));
      return Object.freeze({
        stage: `${prefix}${index + 1}`,
        tierLabel: TIER_PLAN_LABELS[index],
        slots: Object.freeze(slots),
        referenceAveragePercent,
      });
    })
  );
}

const UNRANKED_DIFFICULTY_ROWS = planRows(
  "U",
  UNRANKED_DIFFICULTY_PACKS
);
const RANKED_DIFFICULTY_ROWS = planRows(
  "R",
  RANKED_DIFFICULTY_PACKS
);

function difficultyRowsForDivision(division) {
  return String(division || "SUB").toUpperCase() === "MAIN"
    ? RANKED_DIFFICULTY_ROWS
    : UNRANKED_DIFFICULTY_ROWS;
}

function difficultyBandsForDivision(division) {
  const codes = new Set(
    difficultyRowsForDivision(division)
      .flatMap((row) => row.slots.map((slot) => slot.code))
  );
  return Object.freeze(
    Object.values(SOURCE_DIFFICULTY_BANDS)
      .filter((band) => codes.has(band.code))
      .map((band) => Object.freeze({ ...band }))
  );
}

module.exports = {
  ARENA_MATCH_DIFFICULTY_PLAN_VERSION,
  ARENA_MATCH_QUESTION_ROLLOUT,
  RANKED_DIFFICULTY_PACKS,
  RANKED_DIFFICULTY_ROWS,
  SOURCE_DIFFICULTY_BANDS,
  UNRANKED_DIFFICULTY_PACKS,
  UNRANKED_DIFFICULTY_ROWS,
  difficultyBandsForDivision,
  difficultyRowsForDivision,
};
