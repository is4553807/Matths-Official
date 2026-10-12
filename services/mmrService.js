const { currentArenaRatingState, applyArenaRatingState } = require("./arenaRatingStateService");
const mongoose = require("mongoose");

const {
  AssessmentAttempt,
  PrivateMockExamAttempt,
  PrivateMockWeeklyResult,
  RankingProfile,
} = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaWeeklyMockRatingSettlement,
} = require("../models/goatArenaModel");

const TIER_CONFIG = [
  {
    name: "BRONZE",
    label: "브론즈",
    minMmr: 0,
    maxMmr: 799,
  },
  {
    name: "SILVER",
    label: "실버",
    minMmr: 800,
    maxMmr: 924,
  },
  {
    name: "GOLD",
    label: "골드",
    minMmr: 925,
    maxMmr: 1024,
  },
  {
    name: "PLATINUM",
    label: "플래티넘",
    minMmr: 1025,
    maxMmr: 1119,
  },
  {
    name: "EMERALD",
    label: "에메랄드",
    minMmr: 1120,
    maxMmr: 1209,
  },
  {
    name: "DIAMOND",
    label: "다이아몬드",
    minMmr: 1210,
    maxMmr: 1329,
  },
  {
    name: "MASTER",
    label: "마스터",
    minMmr: 1330,
    maxMmr: 1439,
    maxTopPercentile: 0.05,
  },
  {
    name: "GRANDMASTER",
    label: "그랜드마스터",
    minMmr: 1440,
    maxMmr: 1519,
    maxTopPercentile: 0.015,
  },
  {
    name: "CHALLENGER",
    label: "챌린저",
    minMmr: 1520,
    maxMmr: Infinity,
    maxTopPercentile: 0.005,
  },
];

const ESTIMATED_RANK_POPULATION = 10000;
const ACTUAL_COHORT_RANK_MIN_SIZE = 100;

/*
 * placementScore를 만들 때 사용하는 원점수 난이도 보정 곡선이다. 아래
 * 교육부 9등급 티어 비율과 역할이 다르므로 별도 버전으로 고정한다.
 */
const PLACEMENT_RAW_SCORE_REFERENCE_POLICY = Object.freeze({
  version: "PLACEMENT_RAW_SCORE_REFERENCE_V1",
  bands: Object.freeze([
    { minScore: 0, maxScore: 43, percentileLower: 0, percentileUpper: 0.2 },
    { minScore: 44, maxScore: 53, percentileLower: 0.2, percentileUpper: 0.4 },
    { minScore: 54, maxScore: 62, percentileLower: 0.4, percentileUpper: 0.58 },
    { minScore: 63, maxScore: 70, percentileLower: 0.58, percentileUpper: 0.73 },
    { minScore: 71, maxScore: 77, percentileLower: 0.73, percentileUpper: 0.83 },
    { minScore: 78, maxScore: 84, percentileLower: 0.83, percentileUpper: 0.91 },
    { minScore: 85, maxScore: 89, percentileLower: 0.91, percentileUpper: 0.96 },
    { minScore: 90, maxScore: 94, percentileLower: 0.96, percentileUpper: 0.99 },
    { minScore: 95, maxScore: 100, percentileLower: 0.99, percentileUpper: 1 },
  ].map(Object.freeze)),
});

/*
 * 실제 사용자를 가장한 더미 계정을 랭킹 모집단에 넣지 않는다. 최초
 * 배치고사는 이 버전 고정 기준분포로 MMR·티어·예상 위치를 확정하고,
 * 실제 응시자 순위는 별도 필드로만 집계한다. 이후 기준을 보정할 때는
 * 새 버전을 추가하며 이미 확정된 배치 결과는 소급 재계산하지 않는다.
 */
const PLACEMENT_REFERENCE_POLICY = Object.freeze({
  version: "PLACEMENT_REFERENCE_V2_MOE_NINE_GRADE",
  referenceStandard: "MOE_NINE_GRADE_CUMULATIVE_RANK_RATIO",
  bands: Object.freeze([
    { tierCode: "BRONZE", referenceGrade: 9, minScore: 0, maxScore: 43, minMmr: 400, maxMmr: 799, percentileLower: 0, percentileUpper: 0.04 },
    { tierCode: "SILVER", referenceGrade: 8, minScore: 44, maxScore: 53, minMmr: 800, maxMmr: 924, percentileLower: 0.04, percentileUpper: 0.11 },
    { tierCode: "GOLD", referenceGrade: 7, minScore: 54, maxScore: 62, minMmr: 925, maxMmr: 1024, percentileLower: 0.11, percentileUpper: 0.23 },
    { tierCode: "PLATINUM", referenceGrade: 6, minScore: 63, maxScore: 70, minMmr: 1025, maxMmr: 1119, percentileLower: 0.23, percentileUpper: 0.4 },
    { tierCode: "EMERALD", referenceGrade: 5, minScore: 71, maxScore: 77, minMmr: 1120, maxMmr: 1209, percentileLower: 0.4, percentileUpper: 0.6 },
    { tierCode: "DIAMOND", referenceGrade: 4, minScore: 78, maxScore: 84, minMmr: 1210, maxMmr: 1329, percentileLower: 0.6, percentileUpper: 0.77 },
    { tierCode: "MASTER", referenceGrade: 3, minScore: 85, maxScore: 89, minMmr: 1330, maxMmr: 1439, percentileLower: 0.77, percentileUpper: 0.89 },
    { tierCode: "GRANDMASTER", referenceGrade: 2, minScore: 90, maxScore: 94, minMmr: 1440, maxMmr: 1519, percentileLower: 0.89, percentileUpper: 0.96 },
    { tierCode: "CHALLENGER", referenceGrade: 1, minScore: 95, maxScore: 100, minMmr: 1520, maxMmr: 1700, percentileLower: 0.96, percentileUpper: 1 },
  ].map(Object.freeze)),
});

const TIER_INDEX = new Map(
  TIER_CONFIG.map((tier, index) => [
    tier.name,
    index,
  ])
);

function clamp(
  value,
  minimum = 0,
  maximum = 1
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      Number(value) || 0
    )
  );
}

function average(values) {
  const normalized = (
    Array.isArray(values)
      ? values
      : []
  ).filter(Number.isFinite);

  if (!normalized.length) {
    return 0;
  }

  return (
    normalized.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / normalized.length
  );
}

function interpolate(
  minimum,
  maximum,
  progress
) {
  return (
    Number(minimum) +
    (
      Number(maximum) -
      Number(minimum)
    ) * clamp(progress)
  );
}

function estimatedRankForTopPercent(
  topPercent,
  population = ESTIMATED_RANK_POPULATION
) {
  const normalizedPopulation = Math.max(
    1,
    Math.round(Number(population) || ESTIMATED_RANK_POPULATION)
  );
  const normalizedTopPercent = clamp(
    Number(topPercent) / 100,
    0,
    1
  );

  return Math.max(
    1,
    Math.min(
      normalizedPopulation,
      Math.ceil(normalizedTopPercent * normalizedPopulation)
    )
  );
}

function percentileFromScoreBands(
  score,
  bands
) {
  const normalizedScore = clamp(
    Number(score),
    0,
    100
  );
  const band =
    bands.find(
      (candidate) =>
        normalizedScore <= candidate.maxScore
    ) || bands[bands.length - 1];
  const width = Math.max(
    1,
    band.maxScore - band.minScore
  );
  const progress = clamp(
    (normalizedScore - band.minScore) / width
  );

  return interpolate(
    band.percentileLower,
    band.percentileUpper,
    progress
  );
}

function placementReferenceForScore(
  score
) {
  const normalizedScore = clamp(
    Number(score),
    0,
    100
  );
  const band =
    PLACEMENT_REFERENCE_POLICY
      .bands.find(
        (candidate) =>
          normalizedScore <=
          candidate.maxScore
      ) ||
    PLACEMENT_REFERENCE_POLICY
      .bands[
        PLACEMENT_REFERENCE_POLICY
          .bands.length - 1
      ];
  const width = Math.max(
    1,
    band.maxScore -
      band.minScore
  );
  const progress = clamp(
    (
      normalizedScore -
      band.minScore
    ) / width
  );
  const percentile = interpolate(
    band.percentileLower,
    band.percentileUpper,
    progress
  );
  const estimatedTopPercent =
    Math.round(
      (1 - percentile) *
      1000
    ) / 10;
  const estimatedRank =
    estimatedRankForTopPercent(
      estimatedTopPercent
    );

  return {
    policyVersion:
      PLACEMENT_REFERENCE_POLICY
        .version,
    positionBasis:
      "MOE_NINE_GRADE_REFERENCE_DISTRIBUTION",
    referenceStandard:
      PLACEMENT_REFERENCE_POLICY
        .referenceStandard,
    referenceGrade:
      band.referenceGrade,
    score:
      Math.round(
        normalizedScore * 100
      ) / 100,
    tierCode: band.tierCode,
    initialMmr: Math.round(
      interpolate(
        band.minMmr,
        band.maxMmr,
        progress
      )
    ),
    estimatedPercentile:
      Math.round(
        percentile * 1000
      ) / 10,
    estimatedTopPercent,
    estimatedRankPopulation:
      ESTIMATED_RANK_POPULATION,
    estimatedRank,
    estimatedTopPercentMin:
      Math.round(
        (1 -
          band.percentileUpper) *
          1000
      ) / 10,
    estimatedTopPercentMax:
      Math.round(
        (1 -
          band.percentileLower) *
          1000
      ) / 10,
  };
}

function referencePercentileForScore(
  score
) {
  return (
    Math.round(
      percentileFromScoreBands(
        score,
        PLACEMENT_RAW_SCORE_REFERENCE_POLICY
          .bands
      ) * 1000
    ) / 1000
  );
}

function actualCohortStanding({
  placementScore,
  scoreValues,
}) {
  const scores = (
    Array.isArray(scoreValues)
      ? scoreValues
      : []
  )
    .map(Number)
    .filter(Number.isFinite);
  const stats = populationStats(
    scores,
    placementScore
  );
  const higherCount =
    scores.filter(
      (candidate) =>
        candidate >
        Number(placementScore)
    ).length;
  const equalCount =
    scores.filter(
      (candidate) =>
        candidate ===
        Number(placementScore)
    ).length;
  const lowerCount =
    scores.length -
    higherCount -
    equalCount;
  const actualPercentile =
    scores.length
      ? (
          lowerCount +
          equalCount * 0.5
        ) / scores.length
      : null;

  return {
    cohortSize: scores.length,
    cohortRank:
      scores.length
        ? higherCount + 1
        : null,
    cohortAverage:
      Math.round(
        stats.mean * 10
      ) / 10,
    cohortStandardDeviation:
      Math.round(
        stats.standardDeviation *
          100
      ) / 100,
    actualPercentile:
      actualPercentile === null
        ? null
        : Math.round(
            actualPercentile *
              1000
          ) / 10,
    actualRankMinimumCohortSize:
      ACTUAL_COHORT_RANK_MIN_SIZE,
    actualRankPublished:
      scores.length >=
      ACTUAL_COHORT_RANK_MIN_SIZE,
  };
}

function populationStats(
  values,
  fallback = 0
) {
  const normalized = (
    Array.isArray(values)
      ? values
      : []
  )
    .map(Number)
    .filter(Number.isFinite);
  const mean =
    normalized.length
      ? average(normalized)
      : Number(fallback) || 0;
  const variance =
    normalized.length
      ? normalized.reduce(
          (sum, value) =>
            sum +
            (value - mean) ** 2,
          0
        ) / normalized.length
      : 0;

  return {
    mean,
    standardDeviation:
      Math.sqrt(variance),
  };
}

function percentileForValue(
  value,
  values
) {
  const normalized = (
    Array.isArray(values)
      ? values
      : []
  )
    .map(Number)
    .filter(Number.isFinite);

  if (normalized.length < 5) {
    return 0.5;
  }

  const lower =
    normalized.filter(
      (candidate) =>
        candidate < value
    ).length;
  const equal =
    normalized.filter(
      (candidate) =>
        candidate === value
    ).length;

  return clamp(
    (
      lower +
      equal * 0.5
    ) / normalized.length
  );
}

function calculateInitialMmr({
  placementScore,
  populationMean,
  populationStandardDeviation,
}) {
  const deviation =
    Number(
      populationStandardDeviation
    );

  if (
    !Number.isFinite(deviation) ||
    deviation <= 0.01
  ) {
    return 1000;
  }

  const zScore =
    (
      Number(placementScore) -
      Number(populationMean)
    ) / deviation;

  return Math.round(
    clamp(
      1000 + 200 * zScore,
      400,
      1700
    )
  );
}

function findBaseTier(mmr) {
  return (
    TIER_CONFIG.find(
      (tier) =>
        mmr >= tier.minMmr &&
        mmr <= tier.maxMmr
    ) ||
    TIER_CONFIG[
      TIER_CONFIG.length - 1
    ]
  );
}

function tierByName(name) {
  return (
    TIER_CONFIG.find(
      (tier) =>
        tier.name === name
    ) || TIER_CONFIG[2]
  );
}

function resolveTier({
  mmr,
  topPercentile = 1,
  activeRankerCount = 0,
}) {
  let tier =
    findBaseTier(
      Math.max(
        0,
        Number(mmr) || 0
      )
    );

  if (activeRankerCount < 100) {
    if (
      TIER_INDEX.get(tier.name) >
      TIER_INDEX.get("MASTER")
    ) {
      tier =
        tierByName("MASTER");
    }
    return tier;
  }

  if (
    activeRankerCount < 300
  ) {
    const challengerLimit =
      1 / activeRankerCount;
    const grandmasterLimit =
      3 / activeRankerCount;

    if (
      tier.name ===
        "CHALLENGER" &&
      topPercentile >
        challengerLimit
    ) {
      tier =
        tierByName(
          topPercentile <=
            grandmasterLimit
            ? "GRANDMASTER"
            : "MASTER"
        );
    }

    if (
      tier.name ===
        "GRANDMASTER" &&
      topPercentile >
        grandmasterLimit
    ) {
      tier =
        tierByName("MASTER");
    }
  } else {
    if (
      tier.name ===
        "CHALLENGER" &&
      topPercentile > 0.005
    ) {
      tier =
        tierByName(
          "GRANDMASTER"
        );
    }

    if (
      tier.name ===
        "GRANDMASTER" &&
      topPercentile > 0.015
    ) {
      tier =
        tierByName("MASTER");
    }
  }

  if (
    tier.name === "MASTER" &&
    topPercentile > 0.05
  ) {
    tier =
      tierByName("DIAMOND");
  }

  return tier;
}

function calculateRankPoint({
  mmr,
  tier,
}) {
  const config =
    typeof tier === "string"
      ? tierByName(tier)
      : tier;

  if (
    !Number.isFinite(
      config.maxMmr
    )
  ) {
    return 99;
  }

  return Math.min(
    99,
    Math.floor(
      clamp(
        (
          Number(mmr) -
          config.minMmr
        ) /
          (
            config.maxMmr -
            config.minMmr +
            1
          )
      ) * 100
    )
  );
}

function calculateActualPerformance({
  totalPercentile,
  advancedPercentile,
  consistencyScore,
}) {
  return clamp(
    clamp(totalPercentile) *
      0.7 +
      clamp(advancedPercentile) *
        0.2 +
      clamp(consistencyScore) *
        0.1
  );
}

function calculateExpectedPerformance({
  recentPerformances,
  placementExpectedPerformance,
}) {
  const recent = (
    Array.isArray(
      recentPerformances
    )
      ? recentPerformances
      : []
  )
    .slice(0, 3)
    .map((value) =>
      clamp(value)
    );
  const placement =
    clamp(
      placementExpectedPerformance
    );

  if (!recent.length) {
    return placement;
  }

  if (recent.length === 1) {
    return clamp(
      placement * 0.4 +
        recent[0] * 0.6
    );
  }

  if (recent.length === 2) {
    return clamp(
      recent[0] * 0.6 +
        recent[1] * 0.4
    );
  }

  return clamp(
    recent[0] * 0.5 +
      recent[1] * 0.3 +
      recent[2] * 0.2
  );
}

function determineKFactor({
  weeklyExamCount,
  daysSinceLastExam,
  rankStatus,
}) {
  if (
    Number(daysSinceLastExam) >=
    35
  ) {
    return 160;
  }

  if (
    rankStatus ===
    "PROVISIONAL"
  ) {
    return 200;
  }

  if (
    Number(weeklyExamCount) <=
    2
  ) {
    return 200;
  }

  if (
    Number(weeklyExamCount) <=
    5
  ) {
    return 140;
  }

  return 100;
}

function calculateGrowthBonus({
  actualPerformance,
  recentPerformances,
}) {
  const recent = Array.isArray(
    recentPerformances
  )
    ? recentPerformances
        .slice(0, 3)
        .map(Number)
        .filter(Number.isFinite)
    : [];

  if (!recent.length) {
    return 0;
  }

  const growth =
    actualPerformance -
    average(recent);

  if (growth >= 0.2) return 12;
  if (growth >= 0.15) return 8;
  if (growth >= 0.1) return 5;
  if (growth >= 0.05) return 2;
  return 0;
}

function getMmrDeltaLimit({
  rankStatus,
  weeklyExamCount,
}) {
  if (
    rankStatus ===
    "PROVISIONAL"
  ) {
    return 100;
  }

  return Number(
    weeklyExamCount
  ) >= 6
    ? 55
    : 70;
}

function calculateAbsencePenalty(
  _consecutiveAbsences
) {
  /*
   * 주간 공식 모의고사는 선택형 MMR 표본이다. 응시자는 성과에 따라
   * 갱신하지만, 미응시자의 MMR은 오르거나 내려서는 안 된다.
   *
   * 결시 이벤트 자체는 2주 연속 승급 준비도에서 건너뛴 주를 연속
   * 응시로 오인하지 않도록 남기고, 변화량만 항상 0으로 고정한다.
   */
  return 0;
}

function calculateMmrChange({
  actualPerformance,
  expectedPerformance,
  kFactor,
  growthBonus,
  deltaLimit,
}) {
  const rawDelta =
    Number(kFactor) *
      (
        actualPerformance -
        expectedPerformance
      ) +
    Number(growthBonus);

  return Math.round(
    clamp(
      rawDelta,
      -Math.abs(deltaLimit),
      Math.abs(deltaLimit)
    )
  );
}

function processWeeklyMmr({
  currentMmr,
  totalPercentile,
  advancedPercentile,
  consistencyScore,
  recentPerformances,
  placementExpectedPerformance,
  weeklyExamCount,
  daysSinceLastExam,
  rankStatus,
  actualPerformanceOverride,
}) {
  const actualPerformance =
    Number.isFinite(
      Number(
        actualPerformanceOverride
      )
    )
      ? clamp(
          actualPerformanceOverride
        )
      : calculateActualPerformance({
          totalPercentile,
          advancedPercentile,
          consistencyScore,
        });
  const expectedPerformance =
    calculateExpectedPerformance({
      recentPerformances,
      placementExpectedPerformance,
    });
  const kFactor =
    determineKFactor({
      weeklyExamCount,
      daysSinceLastExam,
      rankStatus,
    });
  const growthBonus =
    calculateGrowthBonus({
      actualPerformance,
      recentPerformances,
    });
  const deltaLimit =
    getMmrDeltaLimit({
      rankStatus,
      weeklyExamCount,
    });
  const deltaMmr =
    calculateMmrChange({
      actualPerformance,
      expectedPerformance,
      kFactor,
      growthBonus,
      deltaLimit,
    });

  return {
    previousMmr:
      Math.max(
        0,
        Math.round(
          Number(currentMmr) ||
            0
        )
      ),
    newMmr:
      Math.max(
        0,
        Math.round(
          (
            Number(currentMmr) ||
            0
          ) + deltaMmr
        )
      ),
    deltaMmr,
    actualPerformance,
    expectedPerformance,
    kFactor,
    growthBonus,
  };
}

function evaluateDemotion({
  previousTier,
  newMmr,
  consecutiveBelowThreshold,
}) {
  const config =
    tierByName(previousTier);

  if (
    config.name === "BRONZE"
  ) {
    return {
      shouldDemote: false,
      consecutiveBelowThreshold: 0,
      thresholdMmr: 0,
    };
  }

  const thresholdMmr =
    Math.max(
      0,
      config.minMmr - 20
    );

  if (newMmr >= thresholdMmr) {
    return {
      shouldDemote: false,
      consecutiveBelowThreshold: 0,
      thresholdMmr,
    };
  }

  const nextCount =
    Number(
      consecutiveBelowThreshold
    ) + 1;

  return {
    shouldDemote:
      nextCount >= 2,
    consecutiveBelowThreshold:
      nextCount,
    thresholdMmr,
  };
}

function initialStanding({
  placementScore,
  scoreValues,
}) {
  const reference =
    placementReferenceForScore(
      placementScore
    );
  const actual =
    actualCohortStanding({
      placementScore,
      scoreValues,
    });
  const tier = tierByName(
    reference.tierCode
  );
  const rankPoint =
    calculateRankPoint({
      mmr:
        reference.initialMmr,
      tier,
    });

  return {
    ...actual,
    calibrationPolicyVersion:
      reference.policyVersion,
    positionBasis:
      reference.positionBasis,
    referenceStandard:
      reference.referenceStandard,
    referenceGrade:
      reference.referenceGrade,
    estimatedPercentile:
      reference.estimatedPercentile,
    estimatedTopPercent:
      reference.estimatedTopPercent,
    estimatedRankPopulation:
      reference.estimatedRankPopulation,
    estimatedRank:
      reference.estimatedRank,
    estimatedTopPercentMin:
      reference
        .estimatedTopPercentMin,
    estimatedTopPercentMax:
      reference
        .estimatedTopPercentMax,
    standardizedScore:
      actual
        .cohortStandardDeviation >
      0.01
        ? Math.round(
            (
              (
                placementScore -
                actual.cohortAverage
              ) /
              actual
                .cohortStandardDeviation
            ) * 10000
          ) / 10000
        : 0,
    /* 레거시 화면은 percentile을 읽으므로 기준분포 백분위를 유지한다. */
    percentile:
      reference.estimatedPercentile,
    initialMmr:
      reference.initialMmr,
    tierCode: tier.name,
    tier: tier.label,
    rankPoint,
    rankingStatus:
      "provisional",
    matchesUntilConfirmed: 2,
    initialRating:
      reference.initialMmr,
    initialTier: tier.label,
  };
}

async function upsertInitialRankingProfile({
  attempt,
  standing,
}) {
  if (
    !attempt?.userId ||
    !attempt?._id ||
    !standing
  ) {
    return null;
  }

  const existing =
    await RankingProfile.findOne({
      userId: attempt.userId,
    });

  if (
    existing &&
    String(
      existing.placementAttemptId ||
        ""
    ) === String(attempt._id) &&
    existing.mmrHistory.some(
      (history) =>
        [
          "placement",
          "placement-calibration",
        ].includes(history.eventType) &&
        String(
          history
            .placementAttemptId ||
            ""
        ) === String(attempt._id)
    )
  ) {
    return existing;
  }

  const profile =
    existing ||
    new RankingProfile({
      userId: attempt.userId,
    });
  const previousMmr =
    Number(profile.mmr) ||
    standing.initialMmr;
  const placementScore =
    Number(
      attempt.placementResult
        ?.placementScore
    ) ||
    Number(
      attempt.scorePercent
    ) ||
    0;

  /*
   * Matths 주간 공식 모의고사 이용권으로 공식 모의고사를 4회 이상 치른 사용자는 이미
   * 충분한 실력 시계열을 가지고 있습니다. 이후 학습권 패키지를 구매해
   * 배치고사를 볼 때 기존 MMR을 초기화하지 않고, 기존 공식 모의고사
   * 표본 수와 배치 결과를 각각 한 표본으로 보아 가중 평균으로 보정합니다.
   */
  const weeklyExamCount = Number(
    profile.participation?.weeklyExamCount || 0
  );
  if (existing && weeklyExamCount >= 4) {
    const placementMmr = Number(standing.initialMmr) || 1000;
    const calibratedMmr = Math.max(
      0,
      Math.round(
        (previousMmr * weeklyExamCount + placementMmr) /
          (weeklyExamCount + 1)
      )
    );
    const calibratedTier = findBaseTier(calibratedMmr);
    profile.placementAttemptId = attempt._id;
    profile.placementScore = placementScore;
    profile.placementExpectedPerformance = clamp(
      placementScore / 100
    );
    profile.mmr = calibratedMmr;
    profile.tier = calibratedTier.name;
    profile.rankPoint = calculateRankPoint({
      mmr: calibratedMmr,
      tier: calibratedTier,
    });
    profile.status = "CONFIRMED";
    profile.weeklyExamsUntilConfirmed = 0;
    profile.reachedCurrentMmrAt =
      calibratedMmr === previousMmr
        ? profile.reachedCurrentMmrAt
        : new Date();
    profile.mmrHistory.push({
      placementAttemptId: attempt._id,
      eventType: "placement-calibration",
      previousMmr,
      newMmr: calibratedMmr,
      deltaMmr: calibratedMmr - previousMmr,
      rawScore: attempt.scorePercent,
      totalPercentile:
        Number(attempt.placementResult?.totalPercentile) || null,
      advancedPercentile:
        Number(
          attempt.placementResult?.abilityProfile
            ?.advancedAbilityAfterVerification ??
            attempt.placementResult?.abilityProfile
              ?.advancedAbilityBeforeVerification
        ) || null,
      consistencyScore:
        Number(
          attempt.placementResult?.abilityProfile?.consistency
        ) || null,
      actualPerformance: profile.placementExpectedPerformance,
      expectedPerformance: profile.placementExpectedPerformance,
      kFactor: 0,
      growthBonus: 0,
      createdAt: new Date(),
    });
    profile.mmrHistory = profile.mmrHistory.slice(-100);
    await profile.save();
    return profile;
  }

  profile.placementAttemptId =
    attempt._id;
  profile.placementScore =
    placementScore;
  profile.placementExpectedPerformance =
    clamp(
      placementScore / 100
    );
  profile.mmr =
    standing.initialMmr;
  profile.tier =
    standing.tierCode ||
    findBaseTier(
      standing.initialMmr
    ).name;
  profile.rankPoint =
    standing.rankPoint ??
    calculateRankPoint({
      mmr:
        standing.initialMmr,
      tier: profile.tier,
    });
  profile.status =
    "PROVISIONAL";
  profile.weeklyExamsUntilConfirmed =
    2;
  profile.recentPerformances =
    [];
  profile.lastAdvancedPerformance =
    Number(
      attempt.placementResult
        ?.abilityProfile
        ?.advancedAbilityAfterVerification ??
        attempt.placementResult
          ?.abilityProfile
          ?.advancedAbilityBeforeVerification
    ) || 0;
  profile.lastRawScore =
    Number(
      attempt.scorePercent
    ) || 0;
  profile.reachedCurrentMmrAt =
    new Date();
  profile.participation = {
    weeklyExamCount: 0,
    consecutiveAbsences: 0,
    lastExamAt: null,
  };
  profile.demotionProtection = {
    active: false,
    consecutiveBelowThreshold:
      0,
    thresholdMmr: null,
  };
  profile.mmrHistory.push({
    placementAttemptId:
      attempt._id,
    eventType: "placement",
    previousMmr,
    newMmr:
      standing.initialMmr,
    deltaMmr:
      standing.initialMmr -
      previousMmr,
    rawScore:
      attempt.scorePercent,
    totalPercentile:
      Number(
        attempt.placementResult
          ?.totalPercentile
      ) || null,
    advancedPercentile:
      profile
        .lastAdvancedPerformance,
    consistencyScore:
      Number(
        attempt.placementResult
          ?.abilityProfile
          ?.consistency
      ) || null,
    actualPerformance:
      profile
        .placementExpectedPerformance,
    expectedPerformance:
      profile
        .placementExpectedPerformance,
    kFactor: 0,
    growthBonus: 0,
    createdAt: new Date(),
  });
  profile.mmrHistory =
    profile.mmrHistory.slice(-100);
  await profile.save();

  return profile;
}

async function ensureRankingProfile(
  userId
) {
  const existing =
    await RankingProfile.findOne({
      userId,
    });

  if (existing) {
    return existing;
  }

  const placement =
    await AssessmentAttempt.findOne({
      userId,
      scopeType: "placement",
      status: "submitted",
      "placementResult.verification.result":
        {
          $ne: "pending",
        },
    })
      .sort({
        submittedAt: -1,
      });

  if (!placement) {
    return null;
  }

  const placementScore =
    Number(
      placement.placementResult
        ?.placementScore
    ) ||
    Number(
      placement.scorePercent
    ) ||
    0;
  const storedMmr =
    Number(
      placement.placementResult
        ?.initialMmr
    ) || 1000;
  const tier =
    findBaseTier(storedMmr);
  const rankPoint =
    calculateRankPoint({
      mmr: storedMmr,
      tier,
    });

  return upsertInitialRankingProfile({
    attempt: placement,
    standing: {
      initialMmr: storedMmr,
      tierCode: tier.name,
      rankPoint,
    },
  });
}

function accuracy(
  correct,
  total
) {
  return total > 0
    ? clamp(correct / total)
    : 0;
}

function metricForAttempt(
  attempt,
  points
) {
  const correctness =
    Array.isArray(
      attempt.correctByQuestion
    )
      ? attempt.correctByQuestion
      : [];
  let threeCorrect = 0;
  let threeTotal = 0;
  let fourCorrect = 0;
  let fourTotal = 0;

  points.forEach(
    (point, index) => {
      if (Number(point) === 3) {
        threeTotal += 1;
        if (correctness[index]) {
          threeCorrect += 1;
        }
      }

      if (Number(point) === 4) {
        fourTotal += 1;
        if (correctness[index]) {
          fourCorrect += 1;
        }
      }
    }
  );

  const semiNumbers = [
    20,
    21,
  ].filter(
    (number) =>
      number <= points.length
  );
  const killerNumbers = [
    28,
    30,
  ].filter(
    (number) =>
      number <= points.length
  );
  const semiCorrect =
    semiNumbers.filter(
      (number) =>
        correctness[number - 1]
    ).length;
  const killerCorrect =
    killerNumbers.filter(
      (number) =>
        correctness[number - 1]
    ).length;
  const advancedRaw =
    accuracy(
      fourCorrect,
      fourTotal
    ) *
      0.5 +
    accuracy(
      semiCorrect,
      semiNumbers.length
    ) *
      0.2 +
    accuracy(
      killerCorrect,
      killerNumbers.length
    ) *
      0.3;
  const completion =
    points.length
      ? clamp(
          Number(
            attempt.answeredCount
          ) / points.length
        )
      : 0;
  const consistencyScore =
    clamp(
      accuracy(
        threeCorrect,
        threeTotal
      ) *
        0.75 +
        completion * 0.25
    );

  return {
    attempt,
    advancedRaw,
    consistencyScore,
    score:
      Number(attempt.score) || 0,
  };
}

function daysBetween(
  earlier,
  later
) {
  if (!earlier) {
    return 0;
  }

  return Math.max(
    0,
    (
      new Date(later).getTime() -
      new Date(earlier).getTime()
    ) /
      (
        24 *
        60 *
        60 *
        1000
      )
  );
}

async function refreshOverallRanks() {
  const profiles =
    await RankingProfile.find({
      datasetOnly: {
        $ne: true,
      },
    })
      .sort({
        mmr: -1,
        reachedCurrentMmrAt: 1,
      });
  const count = profiles.length;

  for (
    let index = 0;
    index < profiles.length;
    index += 1
  ) {
    profiles[index].overallRank =
      index + 1;
    profiles[index].percentile =
      count
        ? clamp(
            1 -
              index / count
          )
        : 0.5;
    await profiles[index].save();
  }
}

async function processWeeklyExamMmr({
  exam,
  attempts,
  seriesEntries,
  now = new Date(),
}) {
  // Loaded lazily to keep goatArenaV2Config -> TIER_CONFIG compatibility from
  // forming a module-initialization cycle.
  const { updateGlicko2Player } = require("./glicko2Service");
  const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
  const submitted = (
    Array.isArray(attempts)
      ? attempts
      : []
  ).filter(
    (attempt) =>
      attempt.status ===
      "submitted"
  );

  const points =
    Array.isArray(exam.points)
      ? exam.points.map(Number)
      : [];
  const metrics =
    Array.isArray(seriesEntries)
      ? seriesEntries.map(
          (entry) => ({
            attempt:
              entry
                .representativeAttempt,
            advancedRaw:
              Number(
                entry
                  .advancedPercentile
              ) || 0,
            consistencyScore:
              Number(
                entry
                  .consistencyScore
              ) || 0,
            score:
              Number(
                entry.rawScore
              ) || 0,
            totalPercentile:
              Number(
                entry.totalPercentile
              ),
            advancedPercentile:
              Number(
                entry
                  .advancedPercentile
              ),
            actualPerformanceOverride:
              Number(
                entry.mmrPerformance
              ),
            weeklyResultId:
              entry.weeklyResultId,
          })
        )
      : submitted.map(
          (attempt) =>
            metricForAttempt(
              attempt,
              points
            )
        );
  const scoreValues =
    metrics.map(
      (metric) =>
        metric.score
    );
  const advancedValues =
    metrics.map(
      (metric) =>
        metric.advancedRaw
    );
  const participantIds = [...new Set(metrics.map((metric) => String(metric.attempt?.userId || "")).filter(Boolean))];
  const profiles = await ArenaCompetitiveProfile.find({
    userId: { $in: participantIds },
    placementFinalizedAt: { $ne: null },
    rating: { $ne: null },
  }).lean();
  const profileByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile]));
  const cohortRating = profiles.length
    ? profiles.reduce((sum, profile) => sum + Number(profile.rating), 0) / profiles.length
    : GOAT_ARENA_V2_CONFIG.glicko2.defaultRating;
  const weekKey = String(exam.weekKey || exam._id);
  let updated = 0;
  let skippedUnplaced = 0;

  for (const metric of metrics) {
    const baseProfile = profileByUserId.get(String(metric.attempt?.userId || ""));
    if (!baseProfile) {
      skippedUnplaced += 1;
      continue;
    }
    const totalPercentile = Number.isFinite(metric.totalPercentile)
      ? clamp(metric.totalPercentile)
      : percentileForValue(metric.score, scoreValues);
    const advancedPercentile = Number.isFinite(metric.advancedPercentile)
      ? clamp(metric.advancedPercentile)
      : percentileForValue(metric.advancedRaw, advancedValues);
    const performance = Number.isFinite(metric.actualPerformanceOverride)
      ? clamp(metric.actualPerformanceOverride)
      : calculateActualPerformance({
          totalPercentile,
          advancedPercentile,
          consistencyScore: metric.consistencyScore,
        });
    const session = await mongoose.startSession();
    let appliedNewSettlement = false;
    try {
      await session.withTransaction(async () => {
        appliedNewSettlement = false;
        const profile = await ArenaCompetitiveProfile.findOne({
          userId: baseProfile.userId,
          placementFinalizedAt: { $ne: null },
          rating: { $ne: null },
        }).session(session);
        if (!profile) return;
        const existingSettlement = await ArenaWeeklyMockRatingSettlement.findOne({
          userId: profile.userId,
          weekKey,
        }).session(session);

        const publicTier = String(profile.tier || "UNPLACED");
        const before = existingSettlement?.before ? {
          rating: Number(existingSettlement.before.rating),
          ratingDeviation: Number(existingSettlement.before.ratingDeviation),
          volatility: Number(existingSettlement.before.volatility),
          tier: String(existingSettlement.before.tier || publicTier),
        } : {
          ...currentArenaRatingState(profile),
          tier: publicTier,
        };
        const reference = existingSettlement?.referenceRatingSnapshot ? {
          rating: Number(existingSettlement.referenceRatingSnapshot.rating),
          ratingDeviation: Number(existingSettlement.referenceRatingSnapshot.ratingDeviation),
          volatility: Number(existingSettlement.referenceRatingSnapshot.volatility),
          tier: String(existingSettlement.referenceRatingSnapshot.tier || "INTERNAL_REFERENCE"),
        } : {
          rating: cohortRating,
          ratingDeviation: GOAT_ARENA_V2_CONFIG.glicko2.defaultRatingDeviation,
          volatility: GOAT_ARENA_V2_CONFIG.glicko2.defaultVolatility,
          tier: "INTERNAL_REFERENCE",
        };
        const calculated = updateGlicko2Player(before, [{
          opponent: reference,
          score: performance,
        }]);
        const after = { ...calculated, tier: publicTier };
        const nextState = existingSettlement ? {
          rating: Math.max(0, Number(profile.rating) + (after.rating - Number(existingSettlement.after.rating))),
          ratingDeviation: Math.max(1, Number(profile.ratingDeviation) + (after.ratingDeviation - Number(existingSettlement.after.ratingDeviation))),
          volatility: Math.max(Number.EPSILON, Number(profile.volatility) + (after.volatility - Number(existingSettlement.after.volatility))),
        } : after;
        const ratingChanged = !existingSettlement || ["rating", "ratingDeviation", "volatility"]
          .some((key) => after[key] !== Number(existingSettlement.after[key]));
        if (ratingChanged) {
          applyArenaRatingState(profile, nextState, now);
          profile.weeklyMockLastRatedAt = now;
        }
        profile.weeklyMockMatchesCompleted = Number(profile.weeklyMockMatchesCompleted || 0) + (existingSettlement ? 0 : 1);
        if (ratingChanged) profile.weeklyMockRecentPerformances = [
          performance,
          ...(profile.weeklyMockRecentPerformances || []),
        ].slice(0, 5);
        // competitiveScore and tier intentionally remain unchanged.
        await profile.save({ session });
        if (existingSettlement) {
          existingSettlement.examId = exam._id;
          existingSettlement.representativeAttemptId = metric.attempt._id;
          existingSettlement.performance = performance;
          existingSettlement.referenceRatingSnapshot = reference;
          existingSettlement.after = after;
          existingSettlement.delta = after.rating - before.rating;
          existingSettlement.publicScoreChanged = false;
          existingSettlement.settledAt = now;
          await existingSettlement.save({ session });
        } else {
          await ArenaWeeklyMockRatingSettlement.create([{
            userId: profile.userId,
            weekKey,
            examId: exam._id,
            representativeAttemptId: metric.attempt._id,
            performance,
            referenceRatingSnapshot: reference,
            before,
            after,
            delta: after.rating - before.rating,
            publicScoreChanged: false,
            settledAt: now,
          }], { session });
        }

        const mmrResult = {
          previousMmr: before.rating,
          newMmr: after.rating,
          deltaMmr: after.rating - before.rating,
          totalPercentile,
          advancedPercentile,
          consistencyScore: metric.consistencyScore,
          actualPerformance: performance,
          tier: publicTier,
          rankPoint: null,
        };
        await PrivateMockExamAttempt.updateOne(
          { _id: metric.attempt._id },
          { $set: { mmrResult } },
          { session }
        );
        if (metric.weeklyResultId) {
          await PrivateMockWeeklyResult.updateOne(
            { _id: metric.weeklyResultId },
            { $set: { mmrResult } },
            { session }
          );
        }
        if (!existingSettlement) appliedNewSettlement = true;
      });
      if (appliedNewSettlement) updated += 1;
    } finally {
      await session.endSession();
    }
  }

  return { updated, absent: 0, skippedUnplaced, publicScoreChanges: 0 };
}

function rankingProfileView(
  profile
) {
  if (!profile) {
    return null;
  }

  const tier =
    tierByName(
      profile.tier
    );

  return {
    mmr:
      Number(profile.mmr),
    rating:
      Number(profile.mmr),
    tier:
      profile.tier,
    tierLabel:
      tier.label,
    rankPoint:
      Number(
        profile.rankPoint
      ) || 0,
    status:
      profile.status,
    weeklyExamsUntilConfirmed:
      profile
        .weeklyExamsUntilConfirmed,
    overallRank:
      profile.overallRank,
    percentile:
      profile.percentile,
    recentPerformances:
      profile
        .recentPerformances ||
      [],
  };
}

module.exports = {
  ACTUAL_COHORT_RANK_MIN_SIZE,
  ESTIMATED_RANK_POPULATION,
  PLACEMENT_REFERENCE_POLICY,
  PLACEMENT_RAW_SCORE_REFERENCE_POLICY,
  TIER_CONFIG,
  actualCohortStanding,
  calculateAbsencePenalty,
  calculateActualPerformance,
  calculateExpectedPerformance,
  calculateGrowthBonus,
  calculateInitialMmr,
  calculateMmrChange,
  calculateRankPoint,
  determineKFactor,
  estimatedRankForTopPercent,
  ensureRankingProfile,
  evaluateDemotion,
  findBaseTier,
  getMmrDeltaLimit,
  initialStanding,
  metricForAttempt,
  percentileForValue,
  placementReferenceForScore,
  populationStats,
  processWeeklyExamMmr,
  processWeeklyMmr,
  referencePercentileForScore,
  rankingProfileView,
  refreshOverallRanks,
  resolveTier,
  tierByName,
  upsertInitialRankingProfile,
};
