/*
 * GOAT Arena의 공개 GP는 모든 티어에서 0~99입니다. `legacyMinGp`와
 * `legacyMaxGp`는 과거 누적 GP를 일회성으로 변환할 때만 사용하며 신규
 * 순위·화면·정산에서는 티어와 티어 내부 GP를 하나의 tuple로 취급합니다.
 */
const ARENA_TIER_CONFIG = [
  {
    code: "BRONZE",
    label: "브론즈",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 0,
    legacyMaxGp: 799,
    estimatedPercentLabel: "상위 80~100%",
  },
  {
    code: "SILVER",
    label: "실버",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 800,
    legacyMaxGp: 924,
    estimatedPercentLabel: "상위 60~80%",
  },
  {
    code: "GOLD",
    label: "골드",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 925,
    legacyMaxGp: 1024,
    estimatedPercentLabel: "상위 42~60%",
  },
  {
    code: "PLATINUM",
    label: "플래티넘",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 1025,
    legacyMaxGp: 1119,
    estimatedPercentLabel: "상위 27~42%",
  },
  {
    code: "EMERALD",
    label: "에메랄드",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 1120,
    legacyMaxGp: 1209,
    estimatedPercentLabel: "상위 17~27%",
  },
  {
    code: "DIAMOND",
    label: "다이아몬드",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 1210,
    legacyMaxGp: 1329,
    estimatedPercentLabel: "상위 9~17%",
  },
  {
    code: "MASTER",
    label: "마스터",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 1330,
    legacyMaxGp: 1439,
    maxTopPercentile: 0.05,
    estimatedPercentLabel: "상위 4~9%",
  },
  {
    code: "GRANDMASTER",
    label: "그랜드마스터",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 1440,
    legacyMaxGp: 1519,
    maxTopPercentile: 0.015,
    estimatedPercentLabel: "상위 1~4%",
  },
  {
    code: "CHALLENGER",
    label: "챌린저",
    minGp: 0,
    maxGp: 99,
    legacyMinGp: 1520,
    legacyMaxGp: Infinity,
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

function baseArenaTierForGp(gp) {
  const value = Math.max(
    0,
    Number(gp) || 0
  );
  return (
    ARENA_TIER_CONFIG.find(
      (tier) =>
        value >= tier.legacyMinGp &&
        value <= tier.legacyMaxGp
    ) ||
    ARENA_TIER_CONFIG[
      ARENA_TIER_CONFIG.length - 1
    ]
  );
}

function localGpFromLegacyGp(gp, tierValue = null) {
  const value = Math.max(0, Number(gp) || 0);
  const tier = tierValue
    ? arenaTierByValue(tierValue)
    : baseArenaTierForGp(value);
  if (!Number.isFinite(tier.legacyMaxGp)) {
    return Math.max(0, Math.min(99, Math.round(value - tier.legacyMinGp)));
  }
  const width = Math.max(1, tier.legacyMaxGp - tier.legacyMinGp);
  return Math.max(
    0,
    Math.min(99, Math.round(((value - tier.legacyMinGp) / width) * 99))
  );
}

function arenaTupleFromLegacyGp(gp) {
  const tier = baseArenaTierForGp(gp);
  return {
    arenaRank: tier.label,
    arenaGp: localGpFromLegacyGp(gp, tier.code),
  };
}

/*
 * 상위 티어는 GP 구간을 먼저 만족한 사용자에게만 허용하고, 활성 모집단
 * 규모에 따른 인원·백분위 상한으로 한 번 더 제한합니다. Skill MMR 설정은
 * 가져오지 않으며 ArenaStanding 재배치에서만 사용합니다.
 */
function resolveArenaTier({
  rank = null,
  gp,
  topPercentile = 1,
  activeRankerCount = 0,
}) {
  let tier = rank
    ? arenaTierByValue(rank)
    : baseArenaTierForGp(gp);
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
      estimatedPercentLabel: tier.estimatedPercentLabel,
    })
  );
}

module.exports = {
  ARENA_TIER_CONFIG,
  UPPER_TIER_POPULATION_RULES,
  arenaTierByCode,
  arenaTierByValue,
  arenaTierIndex,
  arenaTierGuide,
  arenaTupleFromLegacyGp,
  baseArenaTierForGp,
  localGpFromLegacyGp,
  resolveArenaTier,
};
