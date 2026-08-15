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
const {
  compareArenaAttemptScores,
  scoreArenaAttempt,
} = require("../services/arenaMatchScoringService");
const {
  computeAccessCycleWindow,
  kstDateKey,
} = require("../services/accessCycleService");
const {
  buildDailyConsumptionPlan,
  _testing: dailyTesting,
} = require("../services/accessCycleDailyService");
const {
  isSundayDivisionLocked,
  isSundayMatchRequestLocked,
  nextSundayMatchCutoff,
} = require("../services/arenaMatchService");
const {
  REVENGE_OUTCOMES,
  assertMainUpwardStakeSelection,
  isRecentOpponentExcluded,
  resolveInvitationOfferCount,
  resolveRevengeSettlement,
} = require("../services/arenaDivisionRuleService");
const {
  arenaTupleFromLegacyGp,
  resolveArenaTier,
} = require("../services/arenaTierPolicy");
const {
  MAIN_NORMAL_STAKE_MODES,
  mainNormalMatchStakes,
  mainNormalStakeSnapshot,
} = require("../services/mainNormalMatchEconomyService");

const iso = (value) => new Date(value).toISOString();

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
assert.equal(calculateAbsencePenalty(2), -5);
assert.equal(calculateAbsencePenalty(3), -10);
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
  productCode: "LEARNING_PACKAGE_29",
  approvedAmount: 29000,
  approvedAt: "2026-08-01T00:00:00.000+09:00",
  serviceStartAt: "2026-08-01T00:00:00.000+09:00",
  serviceEndAt: "2026-08-30T00:00:00.000+09:00",
};
assert.equal(calculateRefundQuote({ ...refundBase, requestedAt: "2026-08-07T23:59:59.999+09:00", paidFeatureUsed: false }).calculationType, "FULL");
const exactSeven = calculateRefundQuote({ ...refundBase, requestedAt: "2026-08-08T00:00:00.000+09:00", paidFeatureUsed: false });
assert.equal(exactSeven.calculationType, "PARTIAL");
assert.equal(exactSeven.usedDays, 8);
assert.equal(exactSeven.calculatedAmount, 21000);
assert.equal(calculateRefundQuote({ ...refundBase, requestedAt: refundBase.serviceEndAt, paidFeatureUsed: true }).calculatedAmount, 0);

// Scoring priority is score → correct count → correct-answer time → total time; exact ties defend.
assert.equal(compareArenaAttemptScores({ score: 80, correctCount: 3, correctAnswerSolveTimeMs: 100, totalSolveTimeMs: 100 }, { score: 79, correctCount: 5, correctAnswerSolveTimeMs: 1, totalSolveTimeMs: 1 }), "CHALLENGER");
assert.equal(compareArenaAttemptScores({ score: 80, correctCount: 4, correctAnswerSolveTimeMs: 101, totalSolveTimeMs: 10 }, { score: 80, correctCount: 4, correctAnswerSolveTimeMs: 100, totalSolveTimeMs: 999 }), "DEFENDER");
assert.equal(compareArenaAttemptScores({ score: 80, correctCount: 4, correctAnswerSolveTimeMs: 100, totalSolveTimeMs: 100 }, { score: 80, correctCount: 4, correctAnswerSolveTimeMs: 100, totalSolveTimeMs: 100 }), "DEFENDER");
const scored = scoreArenaAttempt({
  attempt: {
    answers: [{ questionKey: "q1", value: " 2/4 " }, { questionKey: "q2", value: "3" }],
    questionTimings: [{ questionKey: "q1", responseTimeMs: 1200 }, { questionKey: "q2", responseTimeMs: 800 }],
    activeSolveTimeMs: 5000,
  },
  problemPack: { questions: [
    { questionKey: "q1", answer: "1/2", points: 40 },
    { questionKey: "q2", answer: "4", points: 60 },
  ] },
});
assert.deepEqual({ score: scored.score, correctCount: scored.correctCount, correctAnswerSolveTimeMs: scored.correctAnswerSolveTimeMs }, { score: 40, correctCount: 1, correctAnswerSolveTimeMs: 1200 });

// KST cutoffs and calendar-date consumption.
const policy = { initialLearningDays: 29, paymentDayCutoffKst: "20:00", payback: { minimumStreakDays: 29 } };
const beforeCutoff = computeAccessCycleWindow({ purchasedAt: "2026-08-15T19:59:59.999+09:00", policy });
const atCutoff = computeAccessCycleWindow({ purchasedAt: "2026-08-15T20:00:00.000+09:00", policy });
assert.equal(beforeCutoff.firstConsumptionDateKst, "2026-08-15");
assert.equal(atCutoff.firstConsumptionDateKst, "2026-08-16");
assert.equal(kstDateKey("2026-08-15T14:59:59.999Z"), "2026-08-15");
assert.equal(kstDateKey("2026-08-15T15:00:00.000Z"), "2026-08-16");
const catchup = buildDailyConsumptionPlan({ cycle: { availableLearningDays: 2, firstConsumptionDateKst: "2026-08-14", lastConsumptionDateKst: "2026-08-14", depletedAt: null }, throughDateKst: "2026-08-17" });
assert.deepEqual(catchup.consumptionDates, ["2026-08-15", "2026-08-16"]);
assert.equal(catchup.availableAfter, 0);
assert.equal(dailyTesting.dateKeyToDayNumber("2026-08-16") - dailyTesting.dateKeyToDayNumber("2026-08-15"), 1);

// Sunday 14:00 blocks new matches; 15:00 locks the division. These UTC values are KST Sunday.
assert.equal(isSundayMatchRequestLocked("2026-08-16T04:59:59.999Z"), false);
assert.equal(isSundayMatchRequestLocked("2026-08-16T05:00:00.000Z"), true);
assert.equal(isSundayDivisionLocked("2026-08-16T05:59:59.999Z"), false);
assert.equal(isSundayDivisionLocked("2026-08-16T06:00:00.000Z"), true);
assert.equal(iso(nextSundayMatchCutoff("2026-08-16T04:00:00.000Z")), "2026-08-16T05:00:00.000Z");
assert.equal(iso(nextSundayMatchCutoff("2026-08-16T05:00:00.000Z")), "2026-08-23T05:00:00.000Z");

assert.throws(() => assertMainUpwardStakeSelection({ tierGap: 0, stakeDays: 1, availableLearningDays: 10 }), /1~3단계/);
assert.throws(() => assertMainUpwardStakeSelection({ tierGap: 3, stakeDays: 2, availableLearningDays: 10 }), /최소 예치/);
assert.throws(() => assertMainUpwardStakeSelection({ tierGap: 3, stakeDays: 6, availableLearningDays: 10 }), /최대 예치/);
assert.throws(() => assertMainUpwardStakeSelection({ tierGap: 3, stakeDays: 5, availableLearningDays: 5 }), /남아야/);
assert.equal(assertMainUpwardStakeSelection({ tierGap: 3, stakeDays: 5, availableLearningDays: 6 }).stakeDays, 5);
assert.equal(isRecentOpponentExcluded({ lastMatchedAt: "2026-08-08T00:00:00Z", now: "2026-08-15T00:00:00Z" }), true);
assert.equal(isRecentOpponentExcluded({ lastMatchedAt: "2026-08-07T23:59:59.999Z", now: "2026-08-15T00:00:00Z" }), false);
assert.equal(resolveInvitationOfferCount({ eligibleCandidateCount: 3, invitationOfferBatchSize: 5 }), 3);
for (const outcome of Object.values(REVENGE_OUTCOMES)) {
  const settlement = resolveRevengeSettlement({ division: "MAIN", outcome, revengeStakeDays: 5, feeDays: 1 });
  assert.equal(settlement.returnToAttackerDays + settlement.transferToDefenderDays + settlement.burnDays, 5);
}

assert.deepEqual(mainNormalStakeSnapshot({ matchOrigin: "MAIN_UPWARD_CHALLENGE", stakeDays: 3 }), { normalStakeMode: MAIN_NORMAL_STAKE_MODES.INITIATOR_ONLY, challengerStakeDays: 3, defenderStakeDays: 0 });
assert.deepEqual(mainNormalStakeSnapshot({ matchOrigin: "MAIN_LOWER_INVITATION", stakeDays: 3 }), { normalStakeMode: MAIN_NORMAL_STAKE_MODES.BILATERAL_ACCEPTED_INVITATION, challengerStakeDays: 3, defenderStakeDays: 3 });
assert.equal(mainNormalMatchStakes({ economySnapshot: { defenderStakeDays: 2 }, challenger: { stakeDays: 2 } }).normalStakeMode, MAIN_NORMAL_STAKE_MODES.LEGACY_BILATERAL);
assert.deepEqual(arenaTupleFromLegacyGp(799), { arenaRank: "브론즈", arenaGp: 99 });
assert.deepEqual(arenaTupleFromLegacyGp(800), { arenaRank: "실버", arenaGp: 0 });
assert.equal(resolveArenaTier({ division: "SUB", rank: "CHALLENGER", activeRankerCount: 1, topPercentile: 1 }).code, "CHALLENGER");
assert.equal(resolveArenaTier({ division: "MAIN", rank: "CHALLENGER", activeRankerCount: 99, topPercentile: 0 }).code, "MASTER");
assert.equal(resolveArenaTier({ division: "MAIN", rank: "CHALLENGER", activeRankerCount: 300, topPercentile: 0.005001 }).code, "GRANDMASTER");

console.log("Independent business-boundary audit passed: MMR, tiers, ranking ties, refunds, scoring, KST cutoffs, daily consumption, Sunday locks, stakes, revenge accounting, and legacy GP conversion.");
