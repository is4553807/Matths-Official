/*
 * GOAT Arena 문항 난이도의 객관적 분류 원본.
 *
 * `correctRatePercent`는 EBSi가 공개한 해당 모의고사 응시 표본의 문항별
 * 정답률이다. 문제 번호는 보조 정보로만 남기고, 운영 난이도 분류에는
 * 정답률 또는 정답률의 검증 가능한 하한만 사용한다.
 */

const ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION =
  "GOAT_ARENA_EBSI_ACCURACY_BANDS_V1";

const ARENA_DIFFICULTY_CLASSES = Object.freeze({
  BASIC_GENERAL: "BASIC_GENERAL",
  GENERAL: "GENERAL",
  UPPER_GENERAL: "UPPER_GENERAL",
  SEMI_KILLER: "SEMI_KILLER",
  KILLER: "KILLER",
  UNRESOLVED: "UNRESOLVED",
});

const ARENA_DIFFICULTY_CLASS_LABELS = Object.freeze({
  BASIC_GENERAL: "기초 일반",
  GENERAL: "일반",
  UPPER_GENERAL: "상위 일반",
  SEMI_KILLER: "준킬러",
  KILLER: "킬러",
  UNRESOLVED: "정답률 근거 보류",
});

// EBSi 자체분석 정답률 기준. 경계값은 서로 겹치지 않으며 상한은
// KILLER를 제외하고 미포함이다. 비공개 문항은 TOP15의 최저 오답률로
// 계산한 정답률 하한이 한 구간 안에 완전히 들어올 때만 확정한다.
const ARENA_ACCURACY_BANDS = Object.freeze([
  Object.freeze({
    difficultyClass: "KILLER",
    minimumCorrectRatePercent: 0,
    maximumCorrectRatePercent: 15,
    generatorDifficulty: 5,
  }),
  Object.freeze({
    difficultyClass: "SEMI_KILLER",
    minimumCorrectRatePercent: 15,
    maximumCorrectRatePercent: 35,
    generatorDifficulty: 4,
  }),
  Object.freeze({
    difficultyClass: "UPPER_GENERAL",
    minimumCorrectRatePercent: 35,
    maximumCorrectRatePercent: 50,
    generatorDifficulty: 3,
  }),
  Object.freeze({
    difficultyClass: "GENERAL",
    minimumCorrectRatePercent: 50,
    maximumCorrectRatePercent: 70,
    generatorDifficulty: 2,
  }),
  Object.freeze({
    difficultyClass: "BASIC_GENERAL",
    minimumCorrectRatePercent: 70,
    maximumCorrectRatePercent: 100.000001,
    generatorDifficulty: 1,
  }),
]);

const ARENA_DIFFICULTY_CLASS_SOURCE_BANDS = Object.freeze({
  BASIC_GENERAL: "ACCURACY_BASIC_GENERAL",
  GENERAL: "ACCURACY_GENERAL",
  UPPER_GENERAL: "ACCURACY_UPPER_GENERAL",
  SEMI_KILLER: "ACCURACY_SEMI_KILLER",
  KILLER: "ACCURACY_KILLER",
  UNRESOLVED: "ACCURACY_UNRESOLVED",
});

function normalizedPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
}

function accuracyBandForPercent(correctRatePercent) {
  const percent = normalizedPercent(correctRatePercent);
  if (percent === null) return null;
  return ARENA_ACCURACY_BANDS.find(
    (band) =>
      percent >= band.minimumCorrectRatePercent &&
      percent < band.maximumCorrectRatePercent
  ) || null;
}

function classifyAccuracyEvidence({
  correctRatePercent,
  correctRateLowerBoundPercent,
  correctRateUpperBoundPercent,
} = {}) {
  const exact = normalizedPercent(correctRatePercent);
  if (exact !== null) {
    const band = accuracyBandForPercent(exact);
    return Object.freeze({
      difficultyClass: band?.difficultyClass || "UNRESOLVED",
      classificationConfidence: band ? "EXACT" : "UNRESOLVED",
      correctRatePercent: exact,
      correctRateLowerBoundPercent: exact,
      correctRateUpperBoundPercent: exact,
    });
  }

  const lower = normalizedPercent(correctRateLowerBoundPercent);
  const upper = normalizedPercent(correctRateUpperBoundPercent) ?? 100;
  if (lower === null || upper < lower) {
    return Object.freeze({
      difficultyClass: "UNRESOLVED",
      classificationConfidence: "UNRESOLVED",
      correctRatePercent: null,
      correctRateLowerBoundPercent: lower,
      correctRateUpperBoundPercent: upper,
    });
  }
  const lowerBand = accuracyBandForPercent(lower);
  const upperBand = accuracyBandForPercent(Math.max(lower, upper - 0.000001));
  const resolved =
    lowerBand && upperBand && lowerBand.difficultyClass === upperBand.difficultyClass;
  return Object.freeze({
    difficultyClass: resolved ? lowerBand.difficultyClass : "UNRESOLVED",
    classificationConfidence: resolved ? "CENSORED_BOUND" : "UNRESOLVED",
    correctRatePercent: null,
    correctRateLowerBoundPercent: lower,
    correctRateUpperBoundPercent: upper,
  });
}

function accuracyRangeForDifficultyClass(difficultyClass) {
  const normalized = String(difficultyClass || "").trim().toUpperCase();
  const band = ARENA_ACCURACY_BANDS.find(
    (candidate) => candidate.difficultyClass === normalized
  );
  if (!band) return null;
  return Object.freeze([
    Number((band.minimumCorrectRatePercent / 100).toFixed(3)),
    Number((Math.min(100, band.maximumCorrectRatePercent) / 100).toFixed(3)),
  ]);
}

function generatorDifficultyForClass(difficultyClass) {
  const normalized = String(difficultyClass || "").trim().toUpperCase();
  return ARENA_ACCURACY_BANDS.find(
    (band) => band.difficultyClass === normalized
  )?.generatorDifficulty || 0;
}

function sourceBandForDifficultyClass(difficultyClass) {
  return ARENA_DIFFICULTY_CLASS_SOURCE_BANDS[
    String(difficultyClass || "UNRESOLVED").trim().toUpperCase()
  ] || ARENA_DIFFICULTY_CLASS_SOURCE_BANDS.UNRESOLVED;
}

module.exports = {
  ARENA_ACCURACY_BANDS,
  ARENA_ACCURACY_DIFFICULTY_POLICY_VERSION,
  ARENA_DIFFICULTY_CLASSES,
  ARENA_DIFFICULTY_CLASS_LABELS,
  ARENA_DIFFICULTY_CLASS_SOURCE_BANDS,
  accuracyBandForPercent,
  accuracyRangeForDifficultyClass,
  classifyAccuracyEvidence,
  generatorDifficultyForClass,
  sourceBandForDifficultyClass,
};
