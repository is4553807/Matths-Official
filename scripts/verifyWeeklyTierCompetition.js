"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PrivateMockWeeklyResult,
  WeeklyTierBoundarySettlement,
} = require("../models/matthsModel");
const {
  WEEKLY_TIER_COMPETITION_VERSION,
  WEEKLY_PROMOTION_MAX_CANDIDATES,
  buildWeeklyTierCompetitionPlan,
  compareWeeklyTierResults,
  hasConsecutiveSkillThreshold,
  isWeeklyTierCompetitionWeek,
} = require("../services/weeklyTierCompetitionService");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function entry({
  userId,
  tier,
  performance,
  rawScore,
  elapsedMs = 60_000,
  status = "ACTIVE",
  skillHistory = [],
}) {
  return {
    division: "SUB",
    tierAtStart: tier,
    standing: {
      _id: `standing-${userId}`,
      userId,
      division: "SUB",
      arenaRank: tier,
      arenaPosition: 1,
      arenaGp: 50,
      status,
    },
    result: {
      _id: `result-${userId}`,
      userId,
      representativePerformance: performance,
      representativeRawScore: rawScore,
      representativeElapsedMs: elapsedMs,
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
    },
    skillHistory,
  };
}

assert.equal(WEEKLY_TIER_COMPETITION_VERSION, "WEEKLY-TIER-BOUNDARY-V3");
assert.equal(WEEKLY_PROMOTION_MAX_CANDIDATES, 5);
assert.equal(isWeeklyTierCompetitionWeek("2026-08-22T14:59:59.999Z"), false);
assert.equal(isWeeklyTierCompetitionWeek("2026-08-22T15:00:00.000Z"), true);
assert.ok(
  compareWeeklyTierResults(
    entry({ userId: "fast", tier: "브론즈", performance: 0.7, rawScore: 80, elapsedMs: 50_000 }).result,
    entry({ userId: "slow", tier: "브론즈", performance: 0.7, rawScore: 80, elapsedMs: 70_000 }).result
  ) < 0
);

const tiers = ["브론즈", "실버", "골드", "플래티넘", "에메랄드"];
const hundredUsers = Array.from({ length: 100 }, (_, index) => {
  const tierIndex = Math.floor(index / 20);
  const offset = index % 20;
  return entry({
    userId: `student-${String(index + 1).padStart(3, "0")}`,
    tier: tiers[tierIndex],
    performance: 0.99 - offset * 0.01 - tierIndex * 0.001,
    rawScore: 100 - offset,
    elapsedMs: 50_000 + offset * 1_000,
  });
});
const hundredPlan = buildWeeklyTierCompetitionPlan(hundredUsers);
assert.equal(hundredPlan.rankings.length, 100);
assert.equal(hundredPlan.boundaries.length, (tiers.length - 1) * 4);
for (const tier of tiers) {
  const tierRows = hundredPlan.rankings.filter((row) => row.tierAtStart === tier);
  assert.deepEqual(
    tierRows.map((row) => row.tierRank),
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
}
for (const boundary of hundredPlan.boundaries) {
  assert.ok(boundary.challenger.tierRank <= 4);
  assert.equal(boundary.defender.tierRank, 21 - boundary.slotNumber);
}

const promotePlan = buildWeeklyTierCompetitionPlan([
  entry({ userId: "bronze-top", tier: "브론즈", performance: 0.9, rawScore: 95 }),
  entry({ userId: "bronze-2", tier: "브론즈", performance: 0.5, rawScore: 70 }),
  entry({ userId: "silver-top", tier: "실버", performance: 0.8, rawScore: 90 }),
  entry({ userId: "silver-bottom", tier: "실버", performance: 0.6, rawScore: 80 }),
]);
assert.equal(promotePlan.boundaries[0].challenger.result.userId, "bronze-top");
assert.equal(promotePlan.boundaries[0].defender.result.userId, "silver-bottom");
assert.equal(promotePlan.boundaries[0].shouldPromote, true);

const multiCandidatePlan = buildWeeklyTierCompetitionPlan([
  ...Array.from({ length: 15 }, (_, index) => entry({
    userId: `lower-${index + 1}`,
    tier: "브론즈",
    performance: 0.95 - index * 0.01,
    rawScore: 98 - index,
  })),
  ...Array.from({ length: 15 }, (_, index) => entry({
    userId: `upper-${index + 1}`,
    tier: "실버",
    performance: 0.9 - index * 0.01,
    rawScore: 95 - index,
  })),
]);
assert.equal(multiCandidatePlan.boundaries.length, 3, "top 20% of 15 must yield 3 candidates");
assert.deepEqual(
  multiCandidatePlan.boundaries.map((boundary) => boundary.challenger.tierRank),
  [1, 2, 3]
);
assert.deepEqual(
  multiCandidatePlan.boundaries.map((boundary) => boundary.defender.tierRank),
  [15, 14, 13]
);

const qualifyingHistory = [
  { eventType: "weekly-exam", newMmr: 805 },
  { eventType: "weekly-exam", newMmr: 820 },
];
assert.equal(hasConsecutiveSkillThreshold({ skillHistory: qualifyingHistory }, 800), true);
assert.equal(
  hasConsecutiveSkillThreshold({
    skillHistory: [qualifyingHistory[0], { eventType: "absence", newMmr: 805 }],
  }, 800),
  false,
  "an absence must break the two-week skill streak"
);
const streakPlan = buildWeeklyTierCompetitionPlan([
  ...Array.from({ length: 10 }, (_, index) => entry({
    userId: `streak-lower-${index + 1}`,
    tier: "브론즈",
    performance: 0.95 - index * 0.03,
    rawScore: 98 - index,
    skillHistory: index === 4 ? qualifyingHistory : [],
  })),
  ...Array.from({ length: 10 }, (_, index) => entry({
    userId: `streak-upper-${index + 1}`,
    tier: "실버",
    performance: 0.9 - index * 0.02,
    rawScore: 95 - index,
  })),
]);
assert.equal(streakPlan.boundaries.length, 3);
assert.equal(streakPlan.boundaries[2].challenger.tierRank, 5);
assert.equal(streakPlan.boundaries[2].candidateReason, "SKILL_INDEX_STREAK");

const cappedPlan = buildWeeklyTierCompetitionPlan([
  ...Array.from({ length: 40 }, (_, index) => entry({
    userId: `cap-lower-${index + 1}`,
    tier: "브론즈",
    performance: 0.99 - index * 0.01,
    rawScore: 100 - index,
  })),
  ...Array.from({ length: 40 }, (_, index) => entry({
    userId: `cap-upper-${index + 1}`,
    tier: "실버",
    performance: 0.98 - index * 0.01,
    rawScore: 99 - index,
  })),
]);
assert.equal(cappedPlan.boundaries.length, 5, "candidate count must be capped at five");

const tiePlan = buildWeeklyTierCompetitionPlan([
  entry({ userId: "lower", tier: "브론즈", performance: 0.7, rawScore: 80, elapsedMs: 60_000 }),
  entry({ userId: "upper", tier: "실버", performance: 0.7, rawScore: 80, elapsedMs: 60_000 }),
]);
assert.equal(tiePlan.boundaries[0].shouldPromote, false, "an exact tie must defend the upper tier");

const mockOnlyPlan = buildWeeklyTierCompetitionPlan([
  entry({
    userId: "mock-only-lower",
    tier: "브론즈",
    performance: 0.92,
    rawScore: 96,
    status: "LOCKED",
  }),
  entry({
    userId: "arena-upper",
    tier: "실버",
    performance: 0.7,
    rawScore: 82,
    status: "ACTIVE",
  }),
]);
assert.equal(mockOnlyPlan.rankings.length, 2);
assert.equal(mockOnlyPlan.boundaries[0].challenger.result.userId, "mock-only-lower");
assert.equal(
  mockOnlyPlan.boundaries[0].shouldPromote,
  true,
  "a mock-exam-only user with a LOCKED Arena match standing must still be eligible for weekly promotion"
);

assert.ok(PrivateMockWeeklyResult.schema.path("tierCompetition.tierRank"));
assert.ok(PrivateMockWeeklyResult.schema.path("tierCompetition.outcome"));
assert.ok(PrivateMockWeeklyResult.schema.path("tierCompetition.candidateReason"));
assert.ok(
  WeeklyTierBoundarySettlement.schema.indexes().some(
    ([keys, options]) =>
      options.unique === true &&
      keys.weekKey === 1 &&
      keys.seasonKey === 1 &&
      keys.division === 1 &&
      keys.lowerTier === 1 &&
      keys.upperTier === 1
      && keys.slotNumber === 1
  ),
  "weekly boundary settlement must be idempotent"
);

const privateMockSource = read("services/privateMockExamService.js");
const competitionSource = read("services/weeklyTierCompetitionService.js");
const accessSource = read("services/paidFeatureAccessService.js");
const mmrSource = read("services/mmrService.js");
const ipadWeeklyMockSource = read("controllers/ipadWeeklyMockController.js");
assert.match(privateMockSource, /await processWeeklyTierCompetition\(\{/);
assert.match(competitionSource, /ArenaStanding\.findById/);
assert.match(competitionSource, /writeStandingTupleSwap/);
assert.match(competitionSource, /temporaryPosition/);
assert.match(competitionSource, /ensureWeeklyTierCompetitionIndexes\(\)/);
assert.match(competitionSource, /unique: true/);
assert.match(competitionSource, /status: \{ \$in: \["ACTIVE", "LOCKED"\] \}/);
assert.match(competitionSource, /RankingProfile\.bulkWrite/);
assert.match(accessSource, /packageType: "MOCK_EXAM_ONLY"[\s\S]*?placementRequired: true/);
assert.match(mmrSource, /2주 연속 승급 준비도 후보 판정/);
assert.match(ipadWeeklyMockSource, /weeklyRanking: raw\.weeklyRanking \|\| \[\]/);

console.log("top-20%-plus-skill-streak candidates, five-slot cap, mock-only promotion, tie defense, and authoritative tier sync verified");
