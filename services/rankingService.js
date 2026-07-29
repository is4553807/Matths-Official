const {
  AssessmentAttempt,
  RankingProfile,
  User,
} = require("../models/matthsModel");
const {
  _testing: {
    standingFromScores,
  },
} = require("./placementExamService");
const {
  divisionFromRankPoint,
  tierByName,
} = require("./mmrService");
const {
  getRankingDisplayName,
} = require("./userIdentityService");

function numberValue(
  value,
  fallback = 0
) {
  const normalized =
    Number(value);

  return Number.isFinite(
    normalized
  )
    ? normalized
    : fallback;
}

function ranked(entries) {
  const sorted = [
    ...entries,
  ].sort((left, right) => {
    if (
      right.rating !==
      left.rating
    ) {
      return (
        right.rating -
        left.rating
      );
    }

    if (
      right.latestPerformance !==
      left.latestPerformance
    ) {
      return (
        right.latestPerformance -
        left.latestPerformance
      );
    }

    if (
      right.recentPerformanceAverage !==
      left.recentPerformanceAverage
    ) {
      return (
        right.recentPerformanceAverage -
        left.recentPerformanceAverage
      );
    }

    if (
      right.advancedPerformance !==
      left.advancedPerformance
    ) {
      return (
        right.advancedPerformance -
        left.advancedPerformance
      );
    }

    if (
      right.totalScore !==
      left.totalScore
    ) {
      return (
        right.totalScore -
        left.totalScore
      );
    }

    const reachedDifference =
      new Date(
        left.reachedCurrentMmrAt ||
          0
      ).getTime() -
      new Date(
        right.reachedCurrentMmrAt ||
          0
      ).getTime();

    if (reachedDifference) {
      return reachedDifference;
    }

    return (
      left.elapsedTimeMs -
      right.elapsedTimeMs
    );
  });
  let previousKey = "";
  let previousRank = 0;

  return sorted.map(
    (entry, index) => {
      const key = [
        entry.rating,
        entry.latestPerformance,
        entry.recentPerformanceAverage,
        entry.advancedPerformance,
        entry.totalScore,
        entry.reachedCurrentMmrAt,
        entry.elapsedTimeMs,
      ].join(":");

      if (key !== previousKey) {
        previousRank =
          index + 1;
        previousKey = key;
      }

      return {
        ...entry,
        rank: previousRank,
      };
    }
  );
}

function aggregateRankings(
  entries,
  {
    key,
    label,
  }
) {
  const grouped = new Map();

  for (const entry of entries) {
    const groupKey =
      key(entry);
    const groupLabel =
      label(entry);

    if (
      !groupKey ||
      !groupLabel
    ) {
      continue;
    }

    const current =
      grouped.get(groupKey) || {
        id: groupKey,
        name: groupLabel,
        region:
          entry.region || "",
        participantCount: 0,
        ratingTotal: 0,
        placementScoreTotal: 0,
        bestRating: 0,
      };
    current.participantCount += 1;
    current.ratingTotal +=
      entry.rating;
    current.placementScoreTotal +=
      entry.placementScore;
    current.bestRating =
      Math.max(
        current.bestRating,
        entry.rating
      );
    grouped.set(
      groupKey,
      current
    );
  }

  return [
    ...grouped.values(),
  ]
    .map((group) => ({
      ...group,
      rating: Math.round(
        group.ratingTotal /
          group.participantCount
      ),
      placementScore:
        Math.round(
          (
            group.placementScoreTotal /
            group.participantCount
          ) * 10
        ) / 10,
      elapsedTimeMs: 0,
    }))
    .sort((left, right) => {
      if (
        right.rating !==
        left.rating
      ) {
        return (
          right.rating -
          left.rating
        );
      }

      if (
        right.participantCount !==
        left.participantCount
      ) {
        return (
          right.participantCount -
          left.participantCount
        );
      }

      return (
        right.bestRating -
        left.bestRating
      );
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

async function latestPlacementAttempts() {
  const attempts =
    await AssessmentAttempt.find({
      scopeType: "placement",
      status: "submitted",
      "placementResult.placementScore":
        { $ne: null },
      "placementResult.verification.result":
        {
          $ne: "pending",
        },
    })
      .sort({
        submittedAt: -1,
      })
      .select(
        "userId scorePercent elapsedTimeMs placementResult submittedAt"
      )
      .lean();
  const latestByUser = new Map();

  for (const attempt of attempts) {
    const userId = String(
      attempt.userId
    );

    if (
      !latestByUser.has(userId)
    ) {
      latestByUser.set(
        userId,
        attempt
      );
    }
  }

  return [
    ...latestByUser.values(),
  ];
}

function findRank(
  entries,
  predicate
) {
  return (
    entries.find(
      predicate
    ) || null
  );
}

async function getRankingData(
  currentUserId
) {
  const attempts =
    await latestPlacementAttempts();
  const users =
    await User.find({
      _id: {
        $in: attempts.map(
          (attempt) =>
            attempt.userId
        ),
      },
      isActive: true,
    })
      .select(
        "name realName preferences.rankingDisplayMode school schoolGrade"
      )
      .lean();
  const profiles =
    await RankingProfile.find({
      userId: {
        $in: attempts.map(
          (attempt) =>
            attempt.userId
        ),
      },
    }).lean();
  const profileByUserId =
    new Map(
      profiles.map(
        (profile) => [
          String(
            profile.userId
          ),
          profile,
        ]
      )
    );
  const userById = new Map(
    users.map((user) => [
      String(user._id),
      user,
    ])
  );
  const eligibleAttempts =
    attempts.filter((attempt) =>
      userById.has(
        String(attempt.userId)
      )
    );
  const scoreRecords =
    eligibleAttempts.map(
      (attempt) => ({
        placementResult: {
          placementScore:
            numberValue(
              attempt
                .placementResult
                ?.placementScore,
              numberValue(
                attempt.scorePercent
              )
            ),
        },
      })
    );
  const entries =
    eligibleAttempts
      .map((attempt) => {
        const user =
          userById.get(
            String(
              attempt.userId
            )
          );

        if (!user) {
          return null;
        }

        const placementScore =
          numberValue(
            attempt
              .placementResult
              ?.placementScore,
            numberValue(
              attempt.scorePercent
            )
          );
        const standing =
          standingFromScores(
            placementScore,
            scoreRecords
          );
        const profile =
          profileByUserId.get(
            String(user._id)
          );
        const rating =
          numberValue(
            profile?.mmr,
            standing.initialMmr
          );
        const tier =
          profile
            ? tierByName(
                profile.tier
              )
            : null;
        const recentPerformances =
          Array.isArray(
            profile
              ?.recentPerformances
          )
            ? profile
                .recentPerformances
            : [];

        return {
          userId: String(
            user._id
          ),
          displayName:
            getRankingDisplayName(
              user
            ),
          schoolCode:
            String(
              user.school?.code ||
                ""
            ),
          schoolName:
            String(
              user.school?.name ||
                "학교 미설정"
            ),
          region: String(
            user.school?.region ||
              "지역 미설정"
          ),
          grade:
            numberValue(
              user.schoolGrade
            ),
          rating,
          tier:
            tier?.label ||
            standing.tier,
          division:
            profile
              ? divisionFromRankPoint(
                  profile.rankPoint
                )
              : standing.division,
          rankPoint:
            profile
              ?.rankPoint ??
            standing.rankPoint ??
            0,
          rankingStatus:
            profile?.status ||
            standing.rankingStatus,
          placementScore:
            Math.round(
              placementScore *
                10
            ) / 10,
          totalScore:
            numberValue(
              attempt.scorePercent
            ),
          elapsedTimeMs:
            numberValue(
              attempt.elapsedTimeMs,
              Number.MAX_SAFE_INTEGER
            ),
          submittedAt:
            attempt.submittedAt,
          latestPerformance:
            numberValue(
              recentPerformances[0],
              numberValue(
                profile
                  ?.placementExpectedPerformance,
                placementScore /
                  100
              )
            ),
          recentPerformanceAverage:
            recentPerformances.length
              ? recentPerformances.reduce(
                  (
                    sum,
                    value
                  ) =>
                    sum +
                    numberValue(
                      value
                    ),
                  0
                ) /
                recentPerformances.length
              : placementScore /
                100,
          advancedPerformance:
            numberValue(
              profile
                ?.lastAdvancedPerformance,
              numberValue(
                attempt
                  .placementResult
                  ?.abilityProfile
                  ?.advancedAbilityAfterVerification ??
                  attempt
                    .placementResult
                    ?.abilityProfile
                    ?.advancedAbilityBeforeVerification
              )
            ),
          reachedCurrentMmrAt:
            profile
              ?.reachedCurrentMmrAt ||
            attempt.submittedAt,
        };
      })
      .filter(Boolean);
  const overall =
    ranked(entries);
  const currentEntry =
    overall.find(
      (entry) =>
        entry.userId ===
        String(currentUserId)
    ) || null;
  const sameSchool =
    currentEntry?.schoolCode
      ? ranked(
          entries.filter(
            (entry) =>
              entry.schoolCode ===
              currentEntry.schoolCode
          )
        )
      : [];
  const schools =
    aggregateRankings(
      entries,
      {
        key: (entry) =>
          entry.schoolCode,
        label: (entry) =>
          entry.schoolName,
      }
    );
  const cities =
    aggregateRankings(
      entries,
      {
        key: (entry) =>
          entry.region,
        label: (entry) =>
          entry.region,
      }
    );
  const mySchool =
    currentEntry
      ? findRank(
          schools,
          (entry) =>
            entry.id ===
            currentEntry.schoolCode
        )
      : null;
  const myCity =
    currentEntry
      ? findRank(
          cities,
          (entry) =>
            entry.id ===
            currentEntry.region
        )
      : null;

  return {
    current: currentEntry
      ? {
          ...currentEntry,
          overallRank:
            currentEntry.rank,
          schoolStudentRank:
            findRank(
              sameSchool,
              (entry) =>
                entry.userId ===
                String(
                  currentUserId
                )
            )?.rank || null,
          schoolRank:
            mySchool?.rank ||
            null,
          cityRank:
            myCity?.rank ||
            null,
        }
      : null,
    cohortSize:
      overall.length,
    overall:
      overall.slice(0, 100),
    sameSchool:
      sameSchool.slice(0, 100),
    schools:
      schools.slice(0, 100),
    cities:
      cities.slice(0, 100),
  };
}

module.exports = {
  getRankingData,
  _testing: {
    ranked,
    aggregateRankings,
  },
};
