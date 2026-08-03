const {
  AssessmentAttempt,
  PrivateMockExamAttempt,
  PrivateMockWeeklyResult,
  RankingProfile,
} = require("../models/matthsModel");

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

  return Math.floor(
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
  consecutiveAbsences
) {
  return Number(
    consecutiveAbsences
  ) >= 3
    ? -10
    : -5;
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
  const scores = (
    Array.isArray(scoreValues)
      ? scoreValues
      : []
  )
    .map(Number)
    .filter(Number.isFinite);
  const stats =
    populationStats(
      scores,
      placementScore
    );
  const initialMmr =
    calculateInitialMmr({
      placementScore,
      populationMean:
        stats.mean,
      populationStandardDeviation:
        stats.standardDeviation,
    });
  const percentile =
    percentileForValue(
      placementScore,
      scores
    );
  const tier =
    resolveTier({
      mmr: initialMmr,
      topPercentile:
        1 - percentile,
      activeRankerCount:
        scores.length,
    });
  const rankPoint =
    calculateRankPoint({
      mmr: initialMmr,
      tier,
    });

  return {
    cohortSize: scores.length,
    cohortAverage:
      Math.round(
        stats.mean * 10
      ) / 10,
    cohortStandardDeviation:
      Math.round(
        stats.standardDeviation *
          100
      ) / 100,
    standardizedScore:
      stats.standardDeviation >
      0.01
        ? Math.round(
            (
              (
                placementScore -
                stats.mean
              ) /
              stats.standardDeviation
            ) * 10000
          ) / 10000
        : 0,
    percentile:
      Math.round(
        percentile * 1000
      ) / 10,
    initialMmr,
    tierCode: tier.name,
    tier: tier.label,
    rankPoint,
    rankingStatus:
      "provisional",
    matchesUntilConfirmed: 2,
    initialRating: initialMmr,
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
  const calculations = [];

  for (const metric of metrics) {
    const profile =
      await ensureRankingProfile(
        metric.attempt.userId
      ) ||
      new RankingProfile({
        userId:
          metric.attempt.userId,
        mmr: 1000,
        tier: "GOLD",
        rankPoint: 75,
        placementScore: 50,
        placementExpectedPerformance:
          0.5,
      });
    const alreadyProcessed =
      (
        profile.mmrHistory ||
        []
      ).some(
        (history) =>
          history.eventType ===
            "weekly-exam" &&
          String(
            history.examId || ""
          ) ===
            String(
              exam._id
            )
      );

    if (alreadyProcessed) {
      continue;
    }
    const totalPercentile =
      Number.isFinite(
        metric.totalPercentile
      )
        ? clamp(
            metric.totalPercentile
          )
        : percentileForValue(
            metric.score,
            scoreValues
          );
    const advancedPercentile =
      Number.isFinite(
        metric.advancedPercentile
      )
        ? clamp(
            metric.advancedPercentile
          )
        : percentileForValue(
            metric.advancedRaw,
            advancedValues
          );
    const weeklyExamCount =
      Number(
        profile.participation
          ?.weeklyExamCount
      ) || 0;
    const result =
      processWeeklyMmr({
        currentMmr:
          profile.mmr,
        totalPercentile,
        advancedPercentile,
        consistencyScore:
          metric.consistencyScore,
        recentPerformances:
          profile.recentPerformances,
        placementExpectedPerformance:
          profile
            .placementExpectedPerformance,
        weeklyExamCount,
        daysSinceLastExam:
          daysBetween(
            profile.participation
              ?.lastExamAt,
            now
          ),
        rankStatus:
          profile.status,
        actualPerformanceOverride:
          metric
            .actualPerformanceOverride,
      });

    calculations.push({
      ...metric,
      profile,
      totalPercentile,
      advancedPercentile,
      weeklyExamCount,
      result,
    });
  }

  const ordered = [
    ...calculations,
  ].sort(
    (left, right) =>
      right.result.newMmr -
        left.result.newMmr ||
      right.result
        .actualPerformance -
        left.result
          .actualPerformance ||
      right.advancedRaw -
        left.advancedRaw ||
      right.score -
        left.score
  );
  const activeCount =
    Math.max(
      await RankingProfile.countDocuments(),
      ordered.length
    );

  for (
    let index = 0;
    index < ordered.length;
    index += 1
  ) {
    const calculation =
      ordered[index];
    const {
      profile,
      result,
    } = calculation;
    const topPercentile =
      (
        index + 1
      ) /
      Math.max(
        1,
        activeCount
      );
    let tier =
      resolveTier({
        mmr: result.newMmr,
        topPercentile,
        activeRankerCount:
          activeCount,
      });
    const previousTier =
      tierByName(
        profile.tier
      );
    const isDemotion =
      TIER_INDEX.get(tier.name) <
      TIER_INDEX.get(
        previousTier.name
      );
    let protection = {
      active: false,
      consecutiveBelowThreshold:
        0,
      thresholdMmr: null,
    };

    if (isDemotion) {
      const evaluation =
        evaluateDemotion({
          previousTier:
            previousTier.name,
          newMmr:
            result.newMmr,
          consecutiveBelowThreshold:
            profile
              .demotionProtection
              ?.consecutiveBelowThreshold ||
            0,
        });

      protection = {
        active:
          !evaluation.shouldDemote,
        consecutiveBelowThreshold:
          evaluation
            .consecutiveBelowThreshold,
        thresholdMmr:
          evaluation.thresholdMmr,
      };

      if (
        !evaluation.shouldDemote
      ) {
        tier = previousTier;
      }
    }

    const nextWeeklyCount =
      calculation.weeklyExamCount +
      1;
    const nextStatus =
      nextWeeklyCount >= 2
        ? "CONFIRMED"
        : "PROVISIONAL";
    const rankPoint =
      calculateRankPoint({
        mmr: result.newMmr,
        tier,
      });

    profile.mmr =
      result.newMmr;
    profile.tier =
      tier.name;
    profile.rankPoint =
      rankPoint;
    profile.status =
      nextStatus;
    profile.weeklyExamsUntilConfirmed =
      Math.max(
        0,
        2 - nextWeeklyCount
      );
    profile.recentPerformances =
      [
        result.actualPerformance,
        ...(
          profile
            .recentPerformances ||
          []
        ),
      ].slice(0, 3);
    profile.lastAdvancedPerformance =
      calculation.advancedRaw;
    profile.lastRawScore =
      calculation.score;
    profile.reachedCurrentMmrAt =
      result.newMmr ===
      result.previousMmr
        ? profile
            .reachedCurrentMmrAt
        : now;
    profile.participation = {
      weeklyExamCount:
        nextWeeklyCount,
      consecutiveAbsences: 0,
      lastExamAt: now,
    };
    profile.demotionProtection =
      protection;
    profile.mmrHistory.push({
      examId: exam._id,
      eventType:
        "weekly-exam",
      previousMmr:
        result.previousMmr,
      newMmr:
        result.newMmr,
      deltaMmr:
        result.deltaMmr,
      rawScore:
        calculation.score,
      totalPercentile:
        calculation
          .totalPercentile,
      advancedPercentile:
        calculation
          .advancedPercentile,
      consistencyScore:
        calculation
          .consistencyScore,
      actualPerformance:
        result.actualPerformance,
      expectedPerformance:
        result
          .expectedPerformance,
      kFactor:
        result.kFactor,
      growthBonus:
        result.growthBonus,
      createdAt: now,
    });
    profile.mmrHistory =
      profile.mmrHistory.slice(-100);
    await profile.save();

    await PrivateMockExamAttempt.updateOne(
      {
        _id:
          calculation.attempt._id,
      },
      {
        $set: {
          mmrResult: {
            previousMmr:
              result.previousMmr,
            newMmr:
              result.newMmr,
            deltaMmr:
              result.deltaMmr,
            totalPercentile:
              calculation
                .totalPercentile,
            advancedPercentile:
              calculation
                .advancedPercentile,
            consistencyScore:
              calculation
                .consistencyScore,
            actualPerformance:
              result
                .actualPerformance,
            expectedPerformance:
              result
                .expectedPerformance,
            kFactor:
              result.kFactor,
            growthBonus:
              result.growthBonus,
            tier: tier.name,
            rankPoint,
          },
        },
      }
    );

    if (
      calculation
        .weeklyResultId
    ) {
      await PrivateMockWeeklyResult.updateOne(
        {
          _id:
            calculation
              .weeklyResultId,
        },
        {
          $set: {
            mmrResult: {
              previousMmr:
                result.previousMmr,
              newMmr:
                result.newMmr,
              deltaMmr:
                result.deltaMmr,
              expectedPerformance:
                result
                  .expectedPerformance,
              kFactor:
                result.kFactor,
              growthBonus:
                result
                  .growthBonus,
              tier:
                tier.name,
              rankPoint,
            },
          },
        }
      );
    }
  }

  const participantIds =
    new Set(
      (
        Array.isArray(
          seriesEntries
        )
          ? seriesEntries.map(
              (entry) =>
                entry
                  .representativeAttempt
            )
          : submitted
      ).map(
        (attempt) =>
          String(
            attempt.userId
          )
      )
    );
  const absentProfiles =
    await RankingProfile.find({
      datasetOnly: {
        $ne: true,
      },
      userId: {
        $nin: [
          ...participantIds,
        ],
      },
    });

  for (const profile of
    absentProfiles) {
    const alreadyProcessed =
      (
        profile.mmrHistory ||
        []
      ).some(
        (history) =>
          history.eventType ===
            "absence" &&
          String(
            history.examId || ""
          ) ===
            String(
              exam._id
            )
      );

    if (alreadyProcessed) {
      continue;
    }
    const nextAbsences =
      (
        Number(
          profile.participation
            ?.consecutiveAbsences
        ) || 0
      ) + 1;
    const penalty =
      calculateAbsencePenalty(
        nextAbsences
      );
    const previousMmr =
      profile.mmr;

    profile.mmr =
      Math.max(
        0,
        previousMmr + penalty
      );
    profile.participation = {
      weeklyExamCount:
        Number(
          profile.participation
            ?.weeklyExamCount
        ) || 0,
      consecutiveAbsences:
        nextAbsences,
      lastExamAt:
        profile.participation
          ?.lastExamAt ||
        null,
    };
    profile.mmrHistory.push({
      examId: exam._id,
      eventType: "absence",
      previousMmr,
      newMmr:
        profile.mmr,
      deltaMmr: penalty,
      createdAt: now,
    });
    profile.mmrHistory =
      profile.mmrHistory.slice(-100);
    await profile.save();
  }

  await refreshOverallRanks();

  return {
    updated:
      calculations.length,
    absent:
      absentProfiles.length,
  };
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
  TIER_CONFIG,
  calculateAbsencePenalty,
  calculateActualPerformance,
  calculateExpectedPerformance,
  calculateGrowthBonus,
  calculateInitialMmr,
  calculateMmrChange,
  calculateRankPoint,
  determineKFactor,
  ensureRankingProfile,
  evaluateDemotion,
  findBaseTier,
  getMmrDeltaLimit,
  initialStanding,
  metricForAttempt,
  percentileForValue,
  populationStats,
  processWeeklyExamMmr,
  processWeeklyMmr,
  rankingProfileView,
  refreshOverallRanks,
  resolveTier,
  tierByName,
  upsertInitialRankingProfile,
};
