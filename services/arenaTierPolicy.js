/* GOAT Arena의 공개 GP는 모든 티어에서 0~99이며 레이팅 컷오프는 별도다. */
const ARENA_TIER_CONFIG = [
  {
    code: "BRONZE",
    label: "브론즈",
    minGp: 0,
    maxGp: 99,
    ratingMin: 0,
    ratingMax: 799,
    estimatedPercentLabel: "상위 80~100%",
  },
  {
    code: "SILVER",
    label: "실버",
    minGp: 0,
    maxGp: 99,
    ratingMin: 800,
    ratingMax: 924,
    estimatedPercentLabel: "상위 60~80%",
  },
  {
    code: "GOLD",
    label: "골드",
    minGp: 0,
    maxGp: 99,
    ratingMin: 925,
    ratingMax: 1024,
    estimatedPercentLabel: "상위 42~60%",
  },
  {
    code: "PLATINUM",
    label: "플래티넘",
    minGp: 0,
    maxGp: 99,
    ratingMin: 1025,
    ratingMax: 1119,
    estimatedPercentLabel: "상위 27~42%",
  },
  {
    code: "EMERALD",
    label: "에메랄드",
    minGp: 0,
    maxGp: 99,
    ratingMin: 1120,
    ratingMax: 1209,
    estimatedPercentLabel: "상위 17~27%",
  },
  {
    code: "DIAMOND",
    label: "다이아몬드",
    minGp: 0,
    maxGp: 99,
    ratingMin: 1210,
    ratingMax: 1329,
    estimatedPercentLabel: "상위 9~17%",
  },
  {
    code: "MASTER",
    label: "마스터",
    minGp: 0,
    maxGp: 99,
    ratingMin: 1330,
    ratingMax: 1439,
    maxTopPercentile: 0.05,
    estimatedPercentLabel: "상위 4~9%",
  },
  {
    code: "GRANDMASTER",
    label: "그랜드마스터",
    minGp: 0,
    maxGp: 99,
    ratingMin: 1440,
    ratingMax: 1519,
    maxTopPercentile: 0.015,
    estimatedPercentLabel: "상위 1~4%",
  },
  {
    code: "CHALLENGER",
    label: "챌린저",
    minGp: 0,
    maxGp: 99,
    ratingMin: 1520,
    ratingMax: Infinity,
    maxTopPercentile: 0.005,
    estimatedPercentLabel: "상위 1%",
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

function arenaTierByValue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return (
    ARENA_TIER_CONFIG.find(
      (tier) =>
        tier.code === normalized ||
        tier.label === String(value || "").trim()
    ) || ARENA_TIER_CONFIG[0]
  );
}

function arenaTierIndex(value) {
  return ARENA_TIER_INDEX.get(arenaTierByValue(value).code) || 0;
}

function arenaTierForRating(rating) {
  const value = Math.max(
    0,
    Number(rating) || 0
  );
  return (
    ARENA_TIER_CONFIG.find(
      (tier) =>
        value >= tier.ratingMin &&
        value <= tier.ratingMax
    ) ||
    ARENA_TIER_CONFIG[
      ARENA_TIER_CONFIG.length - 1
    ]
  );
}

/*
 * Unranked는 배치고사 또는 현재 Arena 상태의 티어를 그대로 사용합니다.
 * 활성 모집단 규모에 따른 인원·백분위 상한은 Ranked에만 적용합니다.
 * 내부 MMR과 공개 경쟁전 점수를 혼합하지 않는다. 공개 티어는 경쟁전
 * 점수 컷오프를 표시할 때만 이 정책으로 계산한다.
 */
function resolveArenaTier({
  division = "MAIN",
  rank = null,
  gp,
  topPercentile = 1,
  activeRankerCount = 0,
}) {
  let tier = rank
    ? arenaTierByValue(rank)
    : arenaTierForRating(gp);
  const count = Math.max(
    0,
    Number(activeRankerCount) || 0
  );
  const percentile = Math.max(
    0,
    Math.min(1, Number(topPercentile) || 0)
  );
  const normalizedDivision = String(
    division || ""
  ).trim().toUpperCase();

  if (
    !["MAIN", "RANKED"].includes(
      normalizedDivision
    )
  ) {
    return tier;
  }

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
      estimatedPercentLabel: tier.estimatedPercentLabel,
    })
  );
}

function percentLabel(value) {
  const percent = Number(value) * 100;
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)));
}

function arenaUpperTierPopulationGuide() {
  return UPPER_TIER_POPULATION_RULES.map((rule) => {
    const maximum = Number.isFinite(rule.maximumPopulation)
      ? Number(rule.maximumPopulation)
      : null;
    const populationLabel = maximum === null
      ? `Ranked 활성 ${rule.minimumPopulation}명 이상`
      : Number(rule.minimumPopulation) === 0
        ? `Ranked 활성 ${maximum}명 이하`
        : `Ranked 활성 ${rule.minimumPopulation}~${maximum}명`;
    if (rule.highestAllowedTier) {
      const tier = arenaTierByValue(rule.highestAllowedTier);
      return {
        populationLabel,
        headline: `최고 ${tier.label}`,
        description: `${ARENA_TIER_CONFIG.slice(arenaTierIndex(tier.code) + 1).map((item) => item.label).join("와 ")}는 아직 열리지 않습니다.`,
      };
    }
    if (Number.isInteger(rule.challengerMaximumCount)) {
      return {
        populationLabel,
        headline: `챌린저 ${rule.challengerMaximumCount}명`,
        description: `그랜드마스터는 최대 ${rule.grandmasterMaximumCount}명, 마스터는 상위 ${percentLabel(rule.masterMaximumPercentile)}% 이내입니다.`,
      };
    }
    return {
      populationLabel,
      headline: "상위 비율 적용",
      description: `챌린저 ${percentLabel(rule.challengerMaximumPercentile)}%, 그랜드마스터 ${percentLabel(rule.grandmasterMaximumPercentile)}%, 마스터 ${percentLabel(rule.masterMaximumPercentile)}% 이내입니다.`,
    };
  });
}

module.exports = {
  ARENA_TIER_CONFIG,
  UPPER_TIER_POPULATION_RULES,
  arenaTierByCode,
  arenaTierByValue,
  arenaTierIndex,
  arenaTierGuide,
  arenaUpperTierPopulationGuide,
  arenaTierForRating,
  resolveArenaTier,
};
