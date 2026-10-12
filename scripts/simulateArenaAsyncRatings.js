/* Synthetic sensitivity study, not production calibration or human records. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { adaptiveRatingUpdate } = require("../services/arenaAdaptiveRatingService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");
const { POOL_ENTRIES } = require("../services/arenaPdfOneOnOneQuestionPool");
const { SCORING_VERSION, calculateCompetitivePerformance, compareCompetitivePerformance } = require("../services/arenaCompetitiveScoringService");

function randomSource(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function round(value) { return Math.round(value * 10000) / 10000; }
function normal(random) { return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random()); }
const rates = POOL_ENTRIES.filter((entry) => entry.source.accuracyEvidence?.correctRatePercent != null)
  .map((entry) => Number(entry.source.accuracyEvidence.correctRatePercent) / 100)
  .filter((p) => Number.isFinite(p) && p > 0 && p < 1);
assert.ok(rates.length > 0);

function performance(random, { ability = 0, cohortShift = 0, setBias = 0, ratePool = rates } = {}) {
  const probabilities = Array.from({ length: 5 }, () => ratePool[Math.floor(random() * ratePool.length)]);
  const correct = probabilities.map((p) => random() < 1 / (1 + Math.exp(-(Math.log(p / (1 - p)) + ability + cohortShift + setBias))));
  const time = Math.max(1, Math.round(300000 * (1 + mean(probabilities.map((p) => -Math.log(p))) / 3) * Math.exp(-ability / 5 + normal(random) / 5)));
  const scoring = calculateCompetitivePerformance({ questions: probabilities.map((p, index) => ({ sourceAccuracyRate: p, correct: correct[index] })), totalSolveTimeMs: time });
  return { ...scoring, count: scoring.correctCount, time };
}

function compare(left, right, threshold) {
  const decision = compareCompetitivePerformance(left, right, { closeScoreThreshold: threshold });
  assert.equal(decision.valid, true);
  return decision.winnerRole === "CHALLENGER" ? 1 : decision.winnerRole === "DEFENDER" ? 0 : 0.5;
}

function simulate({ seed, matches = 10000, threshold = 0.1, snapshotTiming = "BEFORE", cohortShift = 0, bestOf = 1, placementSamples = 5 }) {
  const random = randomSource(seed);
  const config = GOAT_ARENA_V2_CONFIG.glicko2;
  const placementIndex = Math.max(
    0,
    Math.min(GOAT_ARENA_V2_CONFIG.placement.maximumAttempts - 1, placementSamples - 1)
  );
  const players = Array.from({ length: 90 }, (_, index) => ({ id: index,
    ability: [-0.8, 0, 0.8][index % 3], rating: config.defaultRating,
    ratingDeviation: GOAT_ARENA_V2_CONFIG.placement.ratingDeviationByAttemptCount[placementIndex],
    volatility: GOAT_ARENA_V2_CONFIG.placement.volatilityByAttemptCount[placementIndex],
    competitiveMatchesCompleted: 0,
    competitiveCurrentStreakType: "NONE",
    competitiveCurrentStreakCount: 0 }));
  // Keep one reusable synthetic record per owner. Production retains every
  // approved record and appends a new one after a valid match; bounding the
  // synthetic pool this way keeps the sensitivity study tractable without
  // modeling the obsolete consume-and-replace policy.
  const pool = players.map((player) => Object.freeze({ owner: player.id, rating: player.rating,
    ratingDeviation: player.ratingDeviation, volatility: player.volatility,
    performance: performance(random, player) }));
  let wins = 0;
  let created = 0;
  let reused = 0;
  for (let match = 0; match < matches; match += 1) {
    const player = players[Math.floor(random() * players.length)];
    const eligible = pool.map((record, index) => ({ record, index, gap: Math.abs(record.rating - player.rating) }))
      .filter((item) => item.record.owner !== player.id)
      .sort((a, b) => a.gap - b.gap);
    const target = eligible[Math.floor(random() * Math.min(5, eligible.length))];
    const record = target.record;
    const snapshot = JSON.stringify(record);
    const ownerState = JSON.stringify(players[record.owner]);
    let current = performance(random, { ability: player.ability, cohortShift });
    // bestOf>1 deliberately models illicit retry/record cherry-picking. Real
    // official records must come from a single validated attempt, not this model.
    for (let retry = 1; retry < bestOf; retry += 1) {
      const alternate = performance(random, { ability: player.ability, cohortShift });
      if (alternate.z > current.z) current = alternate;
    }
    const before = { rating: player.rating, ratingDeviation: player.ratingDeviation, volatility: player.volatility };
    const score = compare(current, record.performance, threshold);
    wins += score;
    const winnerRole = score === 1 ? "CHALLENGER" : score === 0 ? "DEFENDER" : null;
    const adaptive = adaptiveRatingUpdate({
      before,
      opponent: record,
      winnerRole,
      profile: player,
      mode: "COMPETITIVE",
    });
    const updated = adaptive.after;
    Object.assign(player, updated);
    player.competitiveMatchesCompleted += 1;
    assert.equal(JSON.stringify(record), snapshot, "historical snapshots must remain fixed");
    assert.equal(JSON.stringify(players[record.owner]), ownerState, "historical owners must not be updated");
    const rating = snapshotTiming === "BEFORE" ? before : updated;
    // The selected historical record stays eligible after settlement. Replace
    // only this challenger's prior synthetic snapshot with the newly approved
    // record so every owner remains represented in the bounded model.
    pool[player.id] = Object.freeze({ owner: player.id, ...rating, performance: current });
    reused += 1;
    created += 1;
  }
  assert.equal(pool.length, players.length);
  assert.equal(created, reused);
  return { meanMmr: mean(players.map((player) => player.rating)),
    drift: mean(players.map((player) => player.rating)) - config.defaultRating,
    winRate: wins / matches,
    groupMmr: [-0.8, 0, 0.8].map((ability) => mean(players.filter((player) => player.ability === ability).map((player) => player.rating))) };
}

function evaluateDifferentSets(seed = 8128, pairs = 50000, ratePools = [rates, rates]) {
  const random = randomSource(seed);
  const scores = [[], []];
  const wins = [];
  for (let index = 0; index < pairs; index += 1) {
    const left = performance(random, { ratePool: ratePools[0] });
    const right = performance(random, { ratePool: ratePools[1] });
    scores[0].push(left.z); scores[1].push(right.z);
    wins.push(compare(left, right, 0));
  }
  return { pairs, expectedZ: scores.map((group) => round(mean(group))),
    equalAbilityWinRate: round(mean(wins)), meanSourceRateBySet: ratePools.map((pool) => round(mean(pool))),
    note: "Unbiased only in the synthetic independent-Bernoulli model. Does not validate transformed questions or real cohorts." };
}

function main() {
  const orderedRates = [...rates].sort((left, right) => left - right);
  const quartileSize = Math.floor(rates.length / 4);
  const difficultyStress = evaluateDifferentSets(8128, 50000,
    [orderedRates.slice(0, quartileSize), orderedRates.slice(-quartileSize)]);
  const scenarios = [
    { name: "before_snapshot_sensitivity", snapshotTiming: "BEFORE", threshold: 0.1 },
    { name: "production_after_snapshot", snapshotTiming: "AFTER", threshold: 0.1 },
    { name: "production_one_placement_sample", snapshotTiming: "AFTER", threshold: 0.1, placementSamples: 1 },
    { name: "production_three_placement_samples", snapshotTiming: "AFTER", threshold: 0.1, placementSamples: 3 },
    { name: "production_threshold_0_1", snapshotTiming: "AFTER", threshold: 0.1 },
    { name: "production_threshold_0_2", snapshotTiming: "AFTER", threshold: 0.2 },
    { name: "production_cohort_shift_plus_0_3", snapshotTiming: "AFTER", threshold: 0.1, cohortShift: 0.3 },
    { name: "production_cohort_shift_minus_0_3", snapshotTiming: "AFTER", threshold: 0.1, cohortShift: -0.3 },
    { name: "production_illicit_best_of_3_sensitivity", snapshotTiming: "AFTER", threshold: 0.1, bestOf: 3 },
  ];
  const results = scenarios.map((scenario) => {
    const runs = Array.from({ length: 10 }, (_, index) => simulate({ ...scenario, seed: 8000 + index }));
    return { scenario: scenario.name, modelParameters: scenario, runs: runs.length, matchesPerRun: 10000,
      meanMmrDrift: round(mean(runs.map((run) => run.drift))),
      minMmrDrift: round(Math.min(...runs.map((run) => run.drift))),
      maxMmrDrift: round(Math.max(...runs.map((run) => run.drift))),
      meanWinRate: round(mean(runs.map((run) => run.winRate))),
      groupMmrLowMidHigh: [0, 1, 2].map((index) => round(mean(runs.map((run) => run.groupMmr[index])))) };
  });
  const report = { study: "ASYNC_ONE_SIDED_ADAPTIVE_GLICKO_SYNTHETIC_V2", seedRange: [8000, 8009],
    scoringVersion: SCORING_VERSION, scoringRuntimeIntegrated: true,
    productionRecordSnapshotTiming: "AFTER",
    ratingDefaults: GOAT_ARENA_V2_CONFIG.glicko2,
    placementRdHypothesis: GOAT_ARENA_V2_CONFIG.placement.ratingDeviationByAttemptCount,
    placementVolatilityHypothesis: GOAT_ARENA_V2_CONFIG.placement.volatilityByAttemptCount,
    adaptiveRatingPolicy: {
      ...GOAT_ARENA_V2_CONFIG.adaptiveRating,
      convergencePolicy: "GLICKO2_RD_CONTINUOUS_V1",
      fixedMatchBoundary: false,
    },
    productionRecordReusePolicy: "REUSABLE_APPROVED_RECORDS_WITH_NEW_RECORD_APPEND",
    simulationPoolApproximation: "ONE_REUSABLE_LATEST_RECORD_PER_OWNER",
    exactSourceRatesUsed: rates.length, fairness: evaluateDifferentSets(),
    hardVersusEasySetStress: { ...difficultyStress,
      note: "Deliberately mismatched source-accuracy quartiles; left receives harder sets. A five-question Z score can have equal means but unequal outcome distributions. This stress input is not the production pack policy." },
    scenarios: results,
    productionValidated: false,
    limitations: ["No human calibration data", "Raw source accuracy is not validated for parameter variants",
      "Thresholds are experimental sensitivity inputs, not approved production constants", "No one-sided rating conservation guarantee",
      "The bounded synthetic pool keeps one reusable latest record per owner; production retains all approved records, so record distribution and concurrency still need staging tests"],
  };
  const outputPath = path.resolve(__dirname, "..", "audit", "GOAT_ARENA_ASYNC_SIMULATION_RESULTS.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = { compare, performance, simulate, evaluateDifferentSets };
