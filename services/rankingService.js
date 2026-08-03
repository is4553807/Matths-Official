const {
  AssessmentAttempt,
  RankingProfile,
  User,
} = require("../models/matthsModel");
const {
  ArenaStanding,
  ArenaStandingChangeLedger,
  LiveFinalRankingProfile,
  MainShopEffect,
} = require("../models/goatArenaModel");
const {
  _testing: {
    standingFromScores,
  },
} = require("./placementExamService");
const {
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

const TIER_DISPLAY_ORDER = [
  "챌린저",
  "그랜드마스터",
  "마스터",
  "다이아몬드",
  "에메랄드",
  "플래티넘",
  "골드",
  "실버",
  "브론즈",
];

function tierKey(tier) {
  const aliases = {
    챌린저: "challenger",
    그랜드마스터:
      "grandmaster",
    마스터: "master",
    다이아몬드: "diamond",
    에메랄드: "emerald",
    플래티넘: "platinum",
    골드: "gold",
    실버: "silver",
    브론즈: "bronze",
  };

  return (
    aliases[
      String(tier || "")
    ] || "bronze"
  );
}

function buildTierRankingPool(
  entries,
  currentUserId,
  {
    key,
    label,
    dataState,
  }
) {
  const normalizedUserId =
    String(currentUserId || "");
  const grouped =
    new Map();

  for (const entry of entries) {
    const gp = Number(
      entry.arenaGp
    );
    if (!Number.isFinite(gp)) {
      continue;
    }
    const tier =
      String(entry.arenaRank || "");
    const arenaPosition =
      Number(entry.arenaPosition);
    if (
      !tier ||
      !Number.isInteger(
        arenaPosition
      ) ||
      arenaPosition < 1
    ) {
      continue;
    }
    const current =
      grouped.get(tier) || [];
    current.push({
      ...entry,
      /*
       * GOAT Arena의 공개 티어 랭킹은 내부 rating/MMR이 아니라
       * 화면에 표시되는 GP를 기준으로 정렬한다.
      */
      rating: gp,
      tier,
      gp,
      arenaPosition,
    });
    grouped.set(
      tier,
      current
    );
  }

  const orderedTiers = [
    ...TIER_DISPLAY_ORDER.filter(
      (tier) =>
        grouped.has(tier)
    ),
    ...[
      ...grouped.keys(),
    ].filter(
      (tier) =>
        !TIER_DISPLAY_ORDER.includes(
          tier
        )
    ),
  ];
  const tierBoards =
    orderedTiers.map(
      (tier) => {
        const allEntries = [
          ...grouped.get(tier),
        ]
          .sort((left, right) => {
            if (right.gp !== left.gp) {
              return right.gp - left.gp;
            }
            if (
              left.arenaPosition !==
              right.arenaPosition
            ) {
              return (
                left.arenaPosition -
                right.arenaPosition
              );
            }
            return left.userId.localeCompare(
              right.userId
            );
          })
          .map(
            (entry) => ({
              ...entry,
              tierRank:
                entry.arenaPosition,
            })
          );
        const containsCurrentUser =
          allEntries.some(
            (entry) =>
              entry.userId ===
              normalizedUserId
          );

        return {
          tier,
          tierKey:
            tierKey(tier),
          memberCount:
            allEntries.length,
          containsCurrentUser,
          isTopTwentyOnly:
            !containsCurrentUser,
          entries:
            containsCurrentUser
              ? allEntries
              : allEntries.slice(
                  0,
                  20
                ),
          allEntries,
        };
      }
    );
  const current =
    tierBoards
      .flatMap(
        (board) =>
          board.allEntries
      )
      .find(
        (entry) =>
          entry.userId ===
          normalizedUserId
      ) || null;

  return {
    key,
    label,
    dataState,
    cohortSize:
      entries.length,
    current,
    defaultTierKey:
      (
        tierBoards.find(
          (board) =>
            board
              .containsCurrentUser
        ) ||
        tierBoards[0] ||
        {}
      ).tierKey ||
      "",
    tierBoards:
      tierBoards.map(
        ({
          allEntries,
          ...board
        }) => board
      ),
  };
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

function buildSchoolAndRetakerRankings(finalEntries = []) {
  const schools = new Map();
  const retakers = [];
  for (const entry of finalEntries) {
    if (Number(entry.grade) === 13) {
      retakers.push(entry);
      continue;
    }
    if (entry.educationStatus !== "enrolled") continue;
    if (!entry.schoolCode || !entry.schoolName) continue;
    const group = schools.get(entry.schoolCode) || {
      id: entry.schoolCode,
      name: entry.schoolName,
      region: entry.region,
      students: [],
    };
    group.students.push(entry);
    schools.set(entry.schoolCode, group);
  }
  const schoolRankings = [...schools.values()]
    .map((group) => {
      const students = [...group.students].sort(
        (left, right) => left.finalRank - right.finalRank
      );
      return {
        ...group,
        students,
        participantCount: students.length,
        averageFinalRank:
          Math.round(
            (students.reduce((sum, student) => sum + student.finalRank, 0) /
              students.length) *
              10
          ) / 10,
        bestFinalRank: students[0]?.finalRank || null,
      };
    })
    .sort((left, right) => {
      if (left.averageFinalRank !== right.averageFinalRank) {
        return left.averageFinalRank - right.averageFinalRank;
      }
      if (right.participantCount !== left.participantCount) {
        return right.participantCount - left.participantCount;
      }
      return left.bestFinalRank - right.bestFinalRank;
    })
    .map((group, index) => ({ ...group, rank: index + 1 }));

  return {
    schools: schoolRankings,
    retakers: [...retakers]
      .sort((left, right) => left.finalRank - right.finalRank)
      .map((entry, index) => ({ ...entry, retakerRank: index + 1 })),
  };
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
  const [attempts, liveFinalProfiles] = await Promise.all([
    latestPlacementAttempts(),
    LiveFinalRankingProfile.find({
      status: { $in: ["ACTIVE", "SUNDAY_DISPLAY_FROZEN"] },
    })
      .sort({ finalRank: 1 })
      .lean(),
  ]);
  const arenaStandings = await ArenaStanding.find({
    status: "ACTIVE",
  })
    .sort({ updatedAt: -1 })
    .lean();
  const standingChanges = await ArenaStandingChangeLedger.find({
    userId: { $in: arenaStandings.map((standing) => standing.userId) },
  })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(5000)
    .lean();
  const latestStandingChangeByUser = new Map();
  for (const change of standingChanges) {
    const userId = String(change.userId);
    if (!latestStandingChangeByUser.has(userId)) {
      latestStandingChangeByUser.set(userId, change);
    }
  }
  const rankingUserIds = [
    ...new Set([
      ...attempts.map((attempt) => String(attempt.userId)),
      ...arenaStandings.map((standing) => String(standing.userId)),
      ...liveFinalProfiles.map((profile) => String(profile.userId)),
    ]),
  ];
  const users =
    await User.find({
      _id: {
        $in: rankingUserIds,
      },
      isActive: true,
    })
      .select(
        "name realName preferences.rankingDisplayMode school schoolGrade educationStatus accountStatus"
      )
      .lean();
  const activeMainProfileBorders = await MainShopEffect.find({
    userId: { $in: rankingUserIds },
    itemCode: "MAIN_PROFILE_BORDER",
    status: "ACTIVE",
    endsAt: { $gt: new Date() },
  })
    .select("userId")
    .lean();
  const mainProfileBorderUserIds = new Set(
    activeMainProfileBorders.map((effect) => String(effect.userId))
  );
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
  const finalUserIds = liveFinalProfiles.map((profile) => profile.userId);
  const finalUsers = await User.find({
    _id: { $in: finalUserIds },
    isActive: true,
    accountStatus: "active",
  })
    .select(
      "name realName preferences.rankingDisplayMode school schoolGrade educationStatus"
    )
    .lean();
  const finalUserById = new Map(
    finalUsers.map((user) => [String(user._id), user])
  );
  const finalOverall = liveFinalProfiles
    .map((profile) => {
      const user = finalUserById.get(String(profile.userId));
      if (!user) return null;
      return {
        userId: String(user._id),
        displayName: getRankingDisplayName(user),
        schoolCode: String(user.school?.code || ""),
        schoolName: String(user.school?.name || ""),
        region: String(user.school?.region || ""),
        grade: numberValue(user.schoolGrade),
        educationStatus: String(
          user.educationStatus || "enrolled"
        ),
        finalRating: numberValue(
          profile.status === "SUNDAY_DISPLAY_FROZEN"
            ? profile.publishedFinalRating ?? profile.finalRating
            : profile.finalRating
        ),
        finalRank: numberValue(
          profile.status === "SUNDAY_DISPLAY_FROZEN"
            ? profile.publishedFinalRank ?? profile.finalRank
            : profile.finalRank
        ),
        previousFinalRank: numberValue(profile.previousPublishedFinalRank, 0) || null,
        rankDelta: profile.previousPublishedFinalRank
          ? Number(profile.previousPublishedFinalRank) -
            numberValue(
              profile.status === "SUNDAY_DISPLAY_FROZEN"
                ? profile.publishedFinalRank ?? profile.finalRank
                : profile.finalRank
            )
          : 0,
        lastPublishedAt: profile.lastPublishedAt || profile.updatedAt || null,
        division: profile.currentCompetitiveDivision,
        hasMainProfileBorder: mainProfileBorderUserIds.has(String(user._id)),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.finalRank - right.finalRank);
  const schoolAndRetakerRankings =
    buildSchoolAndRetakerRankings(finalOverall);
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
          hasMainProfileBorder: mainProfileBorderUserIds.has(String(user._id)),
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
  const baseEntryByUserId =
    new Map(
      entries.map((entry) => [
        entry.userId,
        entry,
      ])
    );
  const latestStandingByUserDivision =
    new Map();
  for (const standing of arenaStandings) {
    const key = `${standing.userId}:${standing.division}`;
    if (!latestStandingByUserDivision.has(key)) {
      latestStandingByUserDivision.set(
        key,
        standing
      );
    }
  }
  const arenaEntries = [
    ...latestStandingByUserDivision.values(),
  ]
    .map((standing) => {
      const user = userById.get(
        String(standing.userId)
      );
      if (!user || user.accountStatus !== "active") return null;
      const base =
        baseEntryByUserId.get(
          String(standing.userId)
        );
      const rankingIdentity = base || {
        userId: String(user._id),
        hasMainProfileBorder: mainProfileBorderUserIds.has(String(user._id)),
        displayName: getRankingDisplayName(user),
        schoolCode: String(user.school?.code || ""),
        schoolName:
          Number(user.schoolGrade) === 13
            ? "N수생"
            : String(user.school?.name || "학교 미설정"),
        region: String(user.school?.region || "지역 미설정"),
        grade: numberValue(user.schoolGrade),
        educationStatus: String(user.educationStatus || "enrolled"),
      };
      return {
        ...rankingIdentity,
        division:
          standing.division,
        tier: standing.arenaRank,
        arenaRank:
          standing.arenaRank,
        rating:
          numberValue(
            standing.arenaGp
          ),
        arenaGp:
          numberValue(
            standing.arenaGp
          ),
        gp:
          numberValue(
            standing.arenaGp
          ),
        arenaPosition:
          standing.arenaPosition,
        reachedCurrentMmrAt:
          standing.reachedCurrentGpAt ||
          standing.updatedAt,
        rankDelta: (() => {
          const change = latestStandingChangeByUser.get(String(standing.userId));
          if (!change || change.tupleAfter?.arenaRank !== standing.arenaRank) return 0;
          return Number(change.tupleBefore?.arenaPosition || 0) -
            Number(change.tupleAfter?.arenaPosition || 0);
        })(),
        lastRankChangedAt:
          latestStandingChangeByUser.get(String(standing.userId))?.occurredAt ||
          standing.updatedAt,
      };
    })
    .filter(Boolean);
  const subArenaEntries =
    arenaEntries.filter(
      (entry) =>
        entry.division === "SUB"
    );
  const mainArenaEntries =
    arenaEntries.filter(
      (entry) =>
        entry.division === "MAIN"
    );
  const subPool =
    buildTierRankingPool(
      subArenaEntries,
      currentUserId,
      {
        key: "SUB",
        label:
          "Sub Division",
        dataState:
          subArenaEntries.length
            ? "arena-standing"
            : "awaiting-arena-profile",
      }
    );
  const mainPool =
    buildTierRankingPool(
      mainArenaEntries,
      currentUserId,
      {
        key: "MAIN",
        label:
          "Main Division",
        dataState:
          mainArenaEntries.length
            ? "arena-standing"
            : "awaiting-arena-profile",
      }
    );
  const currentArenaEntry =
    arenaEntries.find(
      (entry) =>
        entry.userId ===
        String(currentUserId)
      ) || null;
  const currentRankingEntry =
    currentEntry || currentArenaEntry;

  return {
    current: currentRankingEntry
      ? {
          ...currentRankingEntry,
          ...(currentArenaEntry
            ? {
                gp:
                  currentArenaEntry.gp,
                arenaDivision:
                  currentArenaEntry.division,
                arenaRank:
                  currentArenaEntry.arenaRank,
                arenaPosition:
                  currentArenaEntry.arenaPosition,
              }
            : {
                gp: null,
                arenaDivision: null,
                arenaRank: null,
                arenaPosition: null,
              }),
          tierRank:
            (
              currentArenaEntry
                ?.division === "MAIN"
                ? mainPool.current
                : subPool.current
            )?.tierRank ||
            null,
          overallRank:
            currentEntry?.rank || null,
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
    finalOverall,
    latestPublishedAt:
      finalOverall.reduce((latest, entry) => {
        const time = new Date(entry.lastPublishedAt || 0).getTime();
        return time > new Date(latest || 0).getTime() ? entry.lastPublishedAt : latest;
      }, null),
    latestCalculatedAt:
      liveFinalProfiles.reduce((latest, profile) => {
        const value = profile.updatedAt || profile.lastPublishedAt || null;
        return new Date(value || 0).getTime() > new Date(latest || 0).getTime()
          ? value
          : latest;
      }, null),
    schoolRankings: schoolAndRetakerRankings.schools,
    retakerRankings: schoolAndRetakerRankings.retakers,
    currentFinal:
      finalOverall.find(
        (entry) => entry.userId === String(currentUserId)
      ) || null,
    pools: {
      sub: subPool,
      main: mainPool,
    },
  };
}

module.exports = {
  getRankingData,
  _testing: {
    ranked,
    aggregateRankings,
    buildSchoolAndRetakerRankings,
    buildTierRankingPool,
  },
};
