const assert = require(
  "node:assert/strict"
);
const fs = require("node:fs");
const path = require("node:path");
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
  placementReferenceForScore,
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
        arenaGp: 40,
      },
      {
        ...students[1],
        arenaRank: "골드",
        arenaPosition: 1,
        arenaGp: 80,
      },
      {
        ...students[2],
        arenaRank: "실버",
        arenaPosition: 1,
        arenaGp: 20,
      },
    ],
    "u1",
    {
      key: "SUB",
      label:
        "Unranked",
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

const mixedTierEncodingPool =
  buildTierRankingPool(
    [
      { ...students[0], arenaRank: "BRONZE", arenaPosition: 2, arenaGp: 20 },
      { ...students[1], arenaRank: "브론즈", arenaPosition: 1, arenaGp: 60 },
      { ...students[2], arenaRank: "SILVER", arenaPosition: 1, arenaGp: 40 },
      { ...students[0], userId: "u4", arenaRank: "실버", arenaPosition: 2, arenaGp: 10 },
    ],
    "u1",
    { key: "SUB", label: "Unranked", dataState: "seed-preview" }
  );
assert.deepEqual(
  mixedTierEncodingPool.tierBoards.map((board) => [board.tierKey, board.memberCount]),
  [["silver", 2], ["bronze", 2]],
  "영문 코드와 한국어 표시명이 섞여도 티어 선택 항목은 하나씩만 표시되어야 합니다."
);

const gpOrderedTierPool =
  buildTierRankingPool(
    [
      {
        ...students[0],
        arenaRank: "골드",
        arenaPosition: 2,
        arenaGp: 40,
        rating: 1500,
      },
      {
        ...students[1],
        arenaRank: "골드",
        arenaPosition: 1,
        arenaGp: 80,
        rating: 900,
      },
    ],
    "u2",
    {
      key: "SUB",
      label:
        "Unranked",
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
    {
      userId: "university-1",
      displayName: "대학생1",
      universityCode: "university-a",
      universityName: "A대학교",
      universityCampus: "본교",
      universityRegion: "서울",
      grade: 14,
      educationStatus: "enrolled",
      finalRank: 12,
    },
    {
      userId: "university-2",
      displayName: "대학생2",
      universityCode: "university-a",
      universityName: "A대학교",
      universityCampus: "본교",
      universityRegion: "서울",
      grade: 14,
      educationStatus: "enrolled",
      finalRank: 28,
    },
    {
      userId: "worker",
      displayName: "직장인",
      grade: 15,
      educationStatus: "graduated",
      finalRank: 9,
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
assert.equal(finalRankingGroups.universities[0].averageFinalRank, 20);
assert.deepEqual(
  finalRankingGroups.universities[0].students.map((entry) => entry.userId),
  ["university-1", "university-2"]
);
assert.deepEqual(
  finalRankingGroups.workers.map((entry) => entry.userId),
  ["worker"]
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
assert.deepEqual(
  placementReferenceForScore(10),
  {
    policyVersion:
      "PLACEMENT_REFERENCE_V2_MOE_NINE_GRADE",
    positionBasis:
      "MOE_NINE_GRADE_REFERENCE_DISTRIBUTION",
    referenceStandard:
      "MOE_NINE_GRADE_CUMULATIVE_RANK_RATIO",
    referenceGrade: 9,
    score: 10,
    tierCode: "BRONZE",
    initialMmr: 493,
    estimatedPercentile: 0.9,
    estimatedTopPercent: 99.1,
    estimatedRankPopulation: 10000,
    estimatedRank: 9910,
    estimatedTopPercentMin: 96,
    estimatedTopPercentMax: 100,
  },
  "낮은 배치 점수는 실제 모집단 크기와 무관하게 브론즈 기준분포에 고정되어야 합니다."
);
assert.equal(
  placementReferenceForScore(82)
    .tierCode,
  "DIAMOND"
);
assert.deepEqual(
  [0, 43, 44, 53, 54, 62, 63, 70, 71, 77, 78, 84, 85, 89, 90, 94, 95, 100]
    .map((score) => {
      const reference = placementReferenceForScore(score);
      return [score, reference.referenceGrade, reference.estimatedTopPercent];
    }),
  [
    [0, 9, 100],
    [43, 9, 96],
    [44, 8, 96],
    [53, 8, 89],
    [54, 7, 89],
    [62, 7, 77],
    [63, 6, 77],
    [70, 6, 60],
    [71, 5, 60],
    [77, 5, 40],
    [78, 4, 40],
    [84, 4, 23],
    [85, 3, 23],
    [89, 3, 11],
    [90, 2, 11],
    [94, 2, 4],
    [95, 1, 4],
    [100, 1, 0],
  ],
  "티어의 누적 상위 구간은 교육부 석차 9등급 비율과 일치해야 합니다."
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

const rankingScrollScript =
  fs.readFileSync(
    path.join(
      __dirname,
      "../public/js/tier-rankings.js"
    ),
    "utf8"
  );
const goatArenaRankingView =
  fs.readFileSync(
    path.join(
      __dirname,
      "../views/goat-arena-rankings.ejs"
    ),
    "utf8"
  );
const matthsRankingView =
  fs.readFileSync(
    path.join(
      __dirname,
      "../views/war-of-masters-rankings.ejs"
    ),
    "utf8"
  );

assert.ok(
  rankingScrollScript.includes(
    '"[data-current-ranker]"'
  ) &&
    rankingScrollScript.includes(
      "currentCenter -"
    ),
  "랭킹 스크롤은 현재 사용자 행을 목록 중앙에 배치해야 합니다."
);
assert.ok(
  goatArenaRankingView.includes(
    "data-ranking-scroll"
  ) &&
    goatArenaRankingView.includes(
      "data-current-ranker"
    ),
  "GOAT Arena 최종 종합 랭킹에 현재 사용자 중심 스크롤 표식이 필요합니다."
);
assert.ok(
  matthsRankingView.includes(
    "data-ranking-scroll"
  ) &&
    matthsRankingView.includes(
      "data-current-ranker"
    ),
  "Matths 최종 종합 랭킹에 현재 사용자 중심 스크롤 표식이 필요합니다."
);
assert.equal(
  goatArenaRankingView.includes(
    "finalOverall.slice(0, 100)"
  ),
  false,
  "GOAT Arena 최종 종합 랭킹은 현재 사용자가 100위 밖일 때도 표시해야 합니다."
);
assert.equal(
  matthsRankingView.includes(
    "finalOverall.slice(0, 100)"
  ),
  false,
  "Matths 최종 종합 랭킹은 현재 사용자가 100위 밖일 때도 표시해야 합니다."
);

console.log(
  "MMR·티어·동점 기준·최종 종합·고등학교·대학교 평균·N수생·직장인 랭킹·내 순위 중심 스크롤 검증 완료"
);
