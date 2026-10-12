"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  _testing: {
    ranked,
    aggregateRankings,
    buildSchoolAndRetakerRankings,
    buildTierRankingPool,
  },
} = require("../services/rankingService");
const { calculateAbsencePenalty } = require("../services/mmrService");

const entries = [
  { userId: "u1", displayName: "가", finalRating: 1510, lastScoreChangedAt: "2026-01-02", schoolCode: "s1", schoolName: "첫고", region: "서울", grade: 11, educationStatus: "enrolled", arenaRank: "GRANDMASTER", arenaGp: 1510 },
  { userId: "u2", displayName: "나", finalRating: 1510, lastScoreChangedAt: "2026-01-01", schoolCode: "s1", schoolName: "첫고", region: "서울", grade: 12, educationStatus: "enrolled", arenaRank: "GRANDMASTER", arenaGp: 1510 },
  { userId: "u3", displayName: "다", finalRating: 1200, lastScoreChangedAt: "2026-01-03", schoolCode: "s2", schoolName: "둘고", region: "경기", grade: 13, educationStatus: "graduated", arenaRank: "EMERALD", arenaGp: 1200 },
];

const overall = ranked(entries);
assert.equal(overall[0].userId, "u2", "같은 점수라면 먼저 도달한 사용자를 먼저 표시해야 합니다.");
assert.equal(overall[0].finalRank, 1);
assert.equal(overall[1].finalRank, 1, "동일 경쟁전 점수는 공동 순위여야 합니다.");
assert.equal(overall[2].finalRank, 3);

const groups = buildSchoolAndRetakerRankings(overall);
assert.equal(groups.schools[0].name, "첫고");
assert.equal(groups.schools[0].averageCompetitiveScore, 1510);
assert.deepEqual(groups.retakers.map((entry) => entry.userId), ["u3"]);

const cities = aggregateRankings(
  overall,
  (entry) => entry.region,
  (entry) => ({ name: entry.region })
);
assert.equal(cities[0].name, "서울");
assert.equal(cities[0].participantCount, 2);

const pool = buildTierRankingPool(overall, "u1", { key: "MAIN", label: "경쟁전" });
assert.equal(pool.cohortSize, 3);
assert.equal(pool.current.tierRank, 2);
assert.equal(pool.current.tier, "GRANDMASTER");
assert.equal(pool.entries.every((entry) => entry.rating == null || entry.rating === entry.finalRating), true);

assert.equal(calculateAbsencePenalty(1), 0);
assert.equal(calculateAbsencePenalty(100), 0, "주간 모의고사 미응시는 내부 MMR도 바꾸지 않아야 합니다.");

const rankingSource = fs.readFileSync(path.join(__dirname, "../services/rankingService.js"), "utf8");
assert.ok(rankingSource.includes("ArenaCompetitiveProfile"));
assert.ok(rankingSource.includes("competitiveScore"));
assert.ok(!/ArenaStanding|LiveFinalRankingProfile|RankingProfile/.test(rankingSource));

const view = fs.readFileSync(path.join(__dirname, "../views/war-of-masters-rankings.ejs"), "utf8");
assert.ok(view.includes("경쟁전 전체 랭킹"));
assert.ok(view.includes("경쟁전 점수"));
assert.ok(!view.includes("최종 종합 랭킹"));
assert.ok(view.includes("data-current-ranker"));

const weeklyMockService = fs.readFileSync(
  path.join(__dirname, "../services/privateMockExamService.js"),
  "utf8"
);
const weeklyMockView = fs.readFileSync(
  path.join(__dirname, "../views/private-mock-exams.ejs"),
  "utf8"
);
assert.ok(weeklyMockService.includes("ArenaCompetitiveProfile"));
assert.ok(weeklyMockService.includes("processWeeklyExamMmr"));
assert.ok(!weeklyMockService.includes("getWeeklyRankingEntries"));
assert.ok(!weeklyMockService.includes("RankingProfile"));
assert.ok(!weeklyMockView.includes("private-mock-ranking-list"));
assert.ok(!weeklyMockView.includes("이번 주 랭킹"));

console.log("경쟁전 점수 기반 전체·학교·사용자 유형 랭킹 검증 완료");
