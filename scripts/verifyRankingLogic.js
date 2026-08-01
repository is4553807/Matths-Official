const assert = require(
  "node:assert/strict"
);
const {
  _testing: {
    ranked,
    aggregateRankings,
    buildSchoolAndRetakerRankings,
    buildTierRankingPool,
  },
} = require(
  "../services/rankingService"
);
const {
  isArchiveAdmin,
} = require(
  "../services/archiveService"
);
const {
  calculateInitialMmr,
  processWeeklyMmr,
  resolveTier,
} = require(
  "../services/mmrService"
);

const students = [
  {
    userId: "u1",
    displayName: "가",
    schoolCode: "s1",
    schoolName: "첫고",
    region: "서울특별시",
    rating: 1200,
    latestPerformance: 0.7,
    recentPerformanceAverage:
      0.66,
    advancedPerformance: 0.7,
    totalScore: 70,
    placementScore: 70,
    elapsedTimeMs: 5000,
  },
  {
    userId: "u2",
    displayName: "나",
    schoolCode: "s1",
    schoolName: "첫고",
    region: "서울특별시",
    rating: 1200,
    latestPerformance: 0.7,
    recentPerformanceAverage:
      0.66,
    advancedPerformance: 0.7,
    totalScore: 70,
    placementScore: 70,
    elapsedTimeMs: 4000,
  },
  {
    userId: "u3",
    displayName: "다",
    schoolCode: "s2",
    schoolName: "둘고",
    region: "경기도",
    rating: 1000,
    latestPerformance: 0.6,
    recentPerformanceAverage:
      0.6,
    advancedPerformance: 0.5,
    totalScore: 60,
    placementScore: 60,
    elapsedTimeMs: 3000,
  },
];
const overall =
  ranked(students);

assert.equal(
  overall[0].userId,
  "u2",
  "동점이면 더 짧은 풀이 시간이 앞서야 합니다."
);
assert.equal(
  overall[0].rank,
  1
);
assert.equal(
  overall[1].rank,
  2
);

const schools =
  aggregateRankings(
    students,
    {
      key: (entry) =>
        entry.schoolCode,
      label: (entry) =>
        entry.schoolName,
    }
  );
const cities =
  aggregateRankings(
    students,
    {
      key: (entry) =>
        entry.region,
      label: (entry) =>
        entry.region,
    }
  );

assert.equal(
  schools[0].name,
  "첫고"
);
assert.equal(
  schools[0].rating,
  1200
);
assert.equal(
  schools[0].participantCount,
  2
);
assert.equal(
  cities[0].name,
  "서울특별시"
);
assert.equal(
  cities[0].participantCount,
  2
);

const tierPool =
  buildTierRankingPool(
    [
      {
        ...students[0],
        arenaRank: "골드",
        arenaPosition: 2,
        arenaGp: 1000,
      },
      {
        ...students[1],
        arenaRank: "골드",
        arenaPosition: 1,
        arenaGp: 1100,
      },
      {
        ...students[2],
        arenaRank: "실버",
        arenaPosition: 1,
        arenaGp: 900,
      },
    ],
    "u1",
    {
      key: "SUB",
      label:
        "Sub Division",
      dataState:
        "seed-preview",
    }
  );

assert.equal(
  tierPool.current.tier,
  "골드"
);
assert.equal(
  tierPool.current.tierRank,
  2,
  "랭킹은 전체 순위가 아니라 같은 티어 안에서 계산되어야 합니다."
);
assert.equal(
  tierPool.defaultTierKey,
  "gold"
);

const gpOrderedTierPool =
  buildTierRankingPool(
    [
      {
        ...students[0],
        arenaRank: "골드",
        arenaPosition: 2,
        arenaGp: 1000,
        rating: 1500,
      },
      {
        ...students[1],
        arenaRank: "골드",
        arenaPosition: 1,
        arenaGp: 1100,
        rating: 900,
      },
    ],
    "u2",
    {
      key: "SUB",
      label:
        "Sub Division",
      dataState:
        "seed-preview",
    }
  );

assert.equal(
  gpOrderedTierPool.current
    .tierRank,
  1,
  "GOAT Arena 티어 랭킹은 내부 MMR이 아니라 GP 내림차순이어야 합니다."
);

const finalRankingGroups =
  buildSchoolAndRetakerRankings([
    {
      userId: "student-1",
      displayName: "재학생1",
      schoolCode: "school-a",
      schoolName: "A고",
      region: "서울",
      grade: 11,
      educationStatus: "enrolled",
      finalRank: 10,
    },
    {
      userId: "student-2",
      displayName: "재학생2",
      schoolCode: "school-a",
      schoolName: "A고",
      region: "서울",
      grade: 12,
      educationStatus: "enrolled",
      finalRank: 30,
    },
    {
      userId: "graduate",
      displayName: "졸업생",
      schoolCode: "school-a",
      schoolName: "A고",
      region: "서울",
      grade: 12,
      educationStatus: "graduated",
      finalRank: 1,
    },
    {
      userId: "retaker",
      displayName: "N수생",
      schoolCode: "school-a",
      schoolName: "A고",
      region: "서울",
      grade: 13,
      educationStatus: "graduated",
      finalRank: 7,
    },
  ]);
assert.equal(finalRankingGroups.schools[0].averageFinalRank, 20);
assert.deepEqual(
  finalRankingGroups.schools[0].students.map((entry) => entry.userId),
  ["student-1", "student-2"]
);
assert.deepEqual(
  finalRankingGroups.retakers.map((entry) => entry.userId),
  ["retaker"]
);
assert.equal(
  isArchiveAdmin({
    role: "admin",
  }),
  true
);
assert.equal(
  isArchiveAdmin({
    role: "student",
    email:
      "student@example.com",
  }),
  false
);

assert.equal(
  calculateInitialMmr({
    placementScore: 80,
    populationMean: 65,
    populationStandardDeviation:
      15,
  }),
  1200,
  "배치 MMR은 1000 + 200z 공식을 따라야 합니다."
);
assert.equal(
  resolveTier({
    mmr: 1210,
    topPercentile: 0.2,
    activeRankerCount: 500,
  }).name,
  "DIAMOND"
);
const weekly =
  processWeeklyMmr({
    currentMmr: 1000,
    totalPercentile: 0.8,
    advancedPercentile: 0.7,
    consistencyScore: 0.9,
    recentPerformances: [
      0.6,
      0.55,
      0.5,
    ],
    placementExpectedPerformance:
      0.6,
    weeklyExamCount: 1,
    daysSinceLastExam: 7,
    rankStatus:
      "PROVISIONAL",
  });
assert.ok(
  weekly.deltaMmr > 0,
  "기대치보다 높은 주간 성과는 MMR을 올려야 합니다."
);
assert.ok(
  weekly.deltaMmr <= 100,
  "배치 확정 전 주간 변화량은 100을 넘을 수 없습니다."
);

console.log(
  "MMR·티어·동점 기준·최종 종합·재학생 학교 평균·N수생 랭킹 검증 완료"
);
