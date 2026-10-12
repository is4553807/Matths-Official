const assert = require("node:assert/strict");

const {
  TIER_CONFIG,
  calculateAbsencePenalty,
  calculateMmrChange,
  calculateRankPoint,
  evaluateDemotion,
  findBaseTier,
  placementReferenceForScore,
  resolveTier,
} = require("../services/mmrService");
const { _testing: rankingTesting } = require("../services/rankingService");
const { calculateRefundQuote } = require("../services/refundPolicyService");

// MMR tier edges: immediately below, exactly at, and immediately above every boundary.
for (let index = 1; index < TIER_CONFIG.length; index += 1) {
  const lower = TIER_CONFIG[index - 1];
  const upper = TIER_CONFIG[index];
  assert.equal(findBaseTier(upper.minMmr - 1).name, lower.name);
  assert.equal(findBaseTier(upper.minMmr).name, upper.name);
  assert.equal(findBaseTier(upper.minMmr + 1).name, upper.name);
}
assert.equal(calculateRankPoint({ mmr: 800, tier: "SILVER" }), 0);
assert.equal(calculateRankPoint({ mmr: 924, tier: "SILVER" }), 99);
assert.equal(calculateRankPoint({ mmr: 1000, tier: "SILVER" }), 99);
assert.equal(calculateAbsencePenalty(2), 0);
assert.equal(calculateAbsencePenalty(3), 0);
assert.equal(calculateMmrChange({ actualPerformance: 1, expectedPerformance: 0, kFactor: 200, growthBonus: 12, deltaLimit: 70 }), 70);
assert.equal(calculateMmrChange({ actualPerformance: 0, expectedPerformance: 1, kFactor: 200, growthBonus: 0, deltaLimit: 70 }), -70);
assert.deepEqual(evaluateDemotion({ previousTier: "SILVER", newMmr: 779, consecutiveBelowThreshold: 0 }), {
  shouldDemote: false,
  consecutiveBelowThreshold: 1,
  thresholdMmr: 780,
});
assert.equal(evaluateDemotion({ previousTier: "SILVER", newMmr: 779, consecutiveBelowThreshold: 1 }).shouldDemote, true);
assert.equal(evaluateDemotion({ previousTier: "SILVER", newMmr: 780, consecutiveBelowThreshold: 1 }).consecutiveBelowThreshold, 0);

const placementEdges = [
  [43, "BRONZE", 799], [44, "SILVER", 800],
  [53, "SILVER", 924], [54, "GOLD", 925],
  [62, "GOLD", 1024], [63, "PLATINUM", 1025],
  [70, "PLATINUM", 1119], [71, "EMERALD", 1120],
  [77, "EMERALD", 1209], [78, "DIAMOND", 1210],
  [84, "DIAMOND", 1329], [85, "MASTER", 1330],
  [89, "MASTER", 1439], [90, "GRANDMASTER", 1440],
  [94, "GRANDMASTER", 1519], [95, "CHALLENGER", 1520],
];
for (const [score, tierCode, initialMmr] of placementEdges) {
  const result = placementReferenceForScore(score);
  assert.equal(result.tierCode, tierCode, `placement score ${score}`);
  assert.equal(result.initialMmr, initialMmr, `placement MMR ${score}`);
}
assert.equal(resolveTier({ mmr: 1700, activeRankerCount: 99, topPercentile: 0 }).name, "MASTER");
assert.equal(resolveTier({ mmr: 1700, activeRankerCount: 100, topPercentile: 0.01 }).name, "CHALLENGER");
assert.equal(resolveTier({ mmr: 1700, activeRankerCount: 100, topPercentile: 0.010001 }).name, "GRANDMASTER");
assert.equal(resolveTier({ mmr: 1700, activeRankerCount: 300, topPercentile: 0.005 }).name, "CHALLENGER");
assert.equal(resolveTier({ mmr: 1700, activeRankerCount: 300, topPercentile: 0.005001 }).name, "GRANDMASTER");

const baseRankEntry = {
  latestPerformance: 0.8,
  recentPerformanceAverage: 0.75,
  advancedPerformance: 0.7,
  totalScore: 90,
  reachedCurrentMmrAt: "2026-08-01T00:00:00.000Z",
  elapsedTimeMs: 1000,
};
const ranked = rankingTesting.ranked([
  { id: "c", rating: 999, ...baseRankEntry },
  { id: "a", rating: 1000, ...baseRankEntry },
  { id: "b", rating: 1000, ...baseRankEntry },
]);
assert.deepEqual(ranked.map(({ id, rank }) => [id, rank]), [["a", 1], ["b", 1], ["c", 3]]);

// Refund: the seven-day period is elapsed-time based, partial use is inclusive, expiry is zero.
const refundBase = {
  productCode: "PRO_MONTHLY",
  approvedAmount: 5500,
  approvedAt: "2026-08-01T00:00:00.000+09:00",
  serviceStartAt: "2026-08-01T00:00:00.000+09:00",
  serviceEndAt: "2026-08-31T00:00:00.000+09:00",
};
assert.equal(calculateRefundQuote({ ...refundBase, requestedAt: "2026-08-07T23:59:59.999+09:00", paidFeatureUsed: false }).calculationType, "FULL");
const exactSeven = calculateRefundQuote({ ...refundBase, requestedAt: "2026-08-08T00:00:00.000+09:00", paidFeatureUsed: false });
assert.equal(exactSeven.calculationType, "PARTIAL");
assert.equal(exactSeven.usedDays, 8);
assert.equal(exactSeven.calculatedAmount, 4034);
assert.equal(calculateRefundQuote({ ...refundBase, requestedAt: refundBase.serviceEndAt, paidFeatureUsed: true }).calculatedAmount, 0);

console.log("Independent business-boundary audit passed: MMR tiers, ranking ties, and refunds.");
