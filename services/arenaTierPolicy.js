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

const ARENA_TIER_INDEX = new Map(
  ARENA_TIER_CONFIG.map((tier, index) => [
    tier.code,
    index,
  ])
);

function arenaTierByCode(code) {
  return (
    ARENA_TIER_CONFIG.find(
      (tier) => tier.code === code
    ) || ARENA_TIER_CONFIG[0]
  );
}

function baseArenaTierForGp(gp) {
  const value = Math.max(
    0,
    Number(gp) || 0
  );
  return (
    ARENA_TIER_CONFIG.find(
      (tier) =>
        value >= tier.minGp &&
        value <= tier.maxGp
    ) ||
    ARENA_TIER_CONFIG[
      ARENA_TIER_CONFIG.length - 1
    ]
  );
}

/*
 * 상위 티어는 GP 구간을 먼저 만족한 사용자에게만 허용하고, 활성 모집단
 * 규모에 따른 인원·백분위 상한으로 한 번 더 제한합니다. Skill MMR 설정은
 * 가져오지 않으며 ArenaStanding 재배치에서만 사용합니다.
 */
function resolveArenaTier({
  gp,
  topPercentile = 1,
  activeRankerCount = 0,
}) {
  let tier = baseArenaTierForGp(gp);
  const count = Math.max(
    0,
    Number(activeRankerCount) || 0
  );
  const percentile = Math.max(
    0,
    Math.min(1, Number(topPercentile) || 0)
  );

  if (count < 100) {
    if (
      ARENA_TIER_INDEX.get(tier.code) >
      ARENA_TIER_INDEX.get("MASTER")
    ) {
      tier = arenaTierByCode("MASTER");
    }
    return tier;
  }

  if (count < 300) {
    const challengerLimit = 1 / count;
    const grandmasterLimit = 3 / count;
    if (
      tier.code === "CHALLENGER" &&
      percentile > challengerLimit
    ) {
      tier = arenaTierByCode(
        percentile <= grandmasterLimit
          ? "GRANDMASTER"
          : "MASTER"
      );
    }
    if (
      tier.code === "GRANDMASTER" &&
      percentile > grandmasterLimit
    ) {
      tier = arenaTierByCode("MASTER");
    }
    if (
      tier.code === "MASTER" &&
      percentile > 0.05
    ) {
      tier = arenaTierByCode("DIAMOND");
    }
    return tier;
  }

  if (
    tier.code === "CHALLENGER" &&
    percentile > 0.005
  ) {
    tier = arenaTierByCode(
      percentile <= 0.015
        ? "GRANDMASTER"
        : "MASTER"
    );
  }
  if (
    tier.code === "GRANDMASTER" &&
    percentile > 0.015
  ) {
    tier = arenaTierByCode("MASTER");
  }
  if (
    tier.code === "MASTER" &&
    percentile > 0.05
  ) {
    tier = arenaTierByCode("DIAMOND");
  }
  return tier;
}

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
  arenaTierByCode,
  arenaTierGuide,
  baseArenaTierForGp,
  resolveArenaTier,
};
