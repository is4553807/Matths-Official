/*
 * GOAT Arena의 공개 GP 구간입니다. 내부 실력 지표의 계산 설정을 import하지
 * 않도록 별도 파일에 둡니다. 숫자 구간은 기존 화면에서 합의된 GP 표시
 * 구간을 유지하지만, 이 값은 MMR 임계값이나 MMR 변경 경로가 아닙니다.
 */
const ARENA_TIER_CONFIG = [
  {
    code: "BRONZE",
    label: "브론즈",
    minGp: 0,
    maxGp: 799,
  },
  {
    code: "SILVER",
    label: "실버",
    minGp: 800,
    maxGp: 924,
  },
  {
    code: "GOLD",
    label: "골드",
    minGp: 925,
    maxGp: 1024,
  },
  {
    code: "PLATINUM",
    label: "플래티넘",
    minGp: 1025,
    maxGp: 1119,
  },
  {
    code: "EMERALD",
    label: "에메랄드",
    minGp: 1120,
    maxGp: 1209,
  },
  {
    code: "DIAMOND",
    label: "다이아몬드",
    minGp: 1210,
    maxGp: 1329,
  },
  {
    code: "MASTER",
    label: "마스터",
    minGp: 1330,
    maxGp: 1439,
    maxTopPercentile: 0.05,
  },
  {
    code: "GRANDMASTER",
    label: "그랜드마스터",
    minGp: 1440,
    maxGp: 1519,
    maxTopPercentile: 0.015,
  },
  {
    code: "CHALLENGER",
    label: "챌린저",
    minGp: 1520,
    maxGp: Infinity,
    maxTopPercentile: 0.005,
  },
];

const UPPER_TIER_POPULATION_RULES = [
  {
    minimumPopulation: 0,
    maximumPopulation: 99,
    highestAllowedTier: "MASTER",
  },
  {
    minimumPopulation: 100,
    maximumPopulation: 299,
    challengerMaximumCount: 1,
    grandmasterMaximumCount: 3,
    masterMaximumPercentile: 0.05,
  },
  {
    minimumPopulation: 300,
    maximumPopulation: Infinity,
    challengerMaximumPercentile: 0.005,
    grandmasterMaximumPercentile: 0.015,
    masterMaximumPercentile: 0.05,
  },
];

function arenaTierGuide() {
  return ARENA_TIER_CONFIG.map(
    (tier, index) => ({
      name: tier.label,
      english: tier.code,
      order: index + 1,
      gpRange: Number.isFinite(tier.maxGp)
        ? `${tier.minGp}–${tier.maxGp} GP`
        : `${tier.minGp} GP 이상`,
      topPercentLabel:
        Number.isFinite(
          tier.maxTopPercentile
        )
          ? `상위 ${tier.maxTopPercentile * 100}% 이내`
          : "",
    })
  );
}

module.exports = {
  ARENA_TIER_CONFIG,
  UPPER_TIER_POPULATION_RULES,
  arenaTierGuide,
};
