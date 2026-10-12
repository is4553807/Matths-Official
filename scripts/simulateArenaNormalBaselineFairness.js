"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  PUBLIC_DIFFICULTY_SPECS,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  NORMAL_BASELINE_TIERS,
  buildNormalBaselineCaptureManifest,
} = require("../services/arenaNormalBaselineQuestionService");
const {
  calculateCompetitivePerformance,
  compareCompetitivePerformance,
} = require("../services/arenaCompetitiveScoringService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");

const TRIALS_PER_TIER = 100_000;
const FAIR_WIN_RATE_MIN = 0.4;
const FAIR_WIN_RATE_MAX = 0.6;

function combinations(values, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= values.length - (size - prefix.length); index += 1) {
    combinations(values, size, index + 1, [...prefix, values[index]], output);
  }
  return output;
}

function seededRandom(seed = 0x12345678) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function rounded(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function simulateTier({ tier, questions, random }) {
  const questionSets = combinations(questions, 5);
  const targetRange = PUBLIC_DIFFICULTY_SPECS[tier.difficultyCode].defenderAccuracy;
  const targetAccuracy = (targetRange[0] + targetRange[1]) / 2;
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (let trial = 0; trial < TRIALS_PER_TIER; trial += 1) {
    const questionSet = questionSets[Math.floor(random() * questionSets.length)];
    const challengerCorrectness = [];
    let baselineSolveTimeMs = 0;
    let challengerSolveTimeMs = 0;
    for (const question of questionSet) {
      challengerCorrectness.push(random() < targetAccuracy);
      baselineSolveTimeMs += question.baselineSolveTimeMs;
      // Timing is deliberately symmetric around the baseline assumption and
      // is used when the difficulty-adjusted scores fall in the close band.
      challengerSolveTimeMs +=
        question.baselineSolveTimeMs * (0.75 + random() * 0.5);
    }
    const challengerPerformance = calculateCompetitivePerformance({
      questions: questionSet.map((question, index) => ({
        questionKey: question.baselineKey,
        correct: challengerCorrectness[index],
        sourceAccuracyRate: question.sourceAccuracyRate,
      })),
      totalSolveTimeMs: challengerSolveTimeMs,
    });
    const baselinePerformance = calculateCompetitivePerformance({
      questions: questionSet.map((question) => ({
        questionKey: question.baselineKey,
        correct: question.baselineCorrect,
        sourceAccuracyRate: question.sourceAccuracyRate,
      })),
      totalSolveTimeMs: baselineSolveTimeMs,
    });
    const comparison = compareCompetitivePerformance(
      challengerPerformance,
      baselinePerformance,
      { closeScoreThreshold: GOAT_ARENA_V2_CONFIG.asyncNormal.closeScoreThreshold }
    );
    if (comparison.winnerRole === "CHALLENGER") wins += 1;
    else if (comparison.winnerRole === "DEFENDER") losses += 1;
    else draws += 1;
  }

  const baselineCorrectCounts = questionSets.map((questionSet) =>
    questionSet.reduce((sum, question) => sum + (question.baselineCorrect ? 1 : 0), 0)
  );
  const winRate = wins / TRIALS_PER_TIER;
  return {
    tier: tier.tier,
    difficultyCode: tier.difficultyCode,
    targetMmr: tier.targetMmr,
    targetAccuracyRange: targetRange,
    simulatedMatchedUserAccuracy: targetAccuracy,
    poolCorrectQuestions: tier.baselineCorrectQuestionCount,
    poolQuestionCount: questions.length,
    combinationCount: questionSets.length,
    baselineCorrectCountAcrossCombinations: {
      minimum: Math.min(...baselineCorrectCounts),
      maximum: Math.max(...baselineCorrectCounts),
      mean: rounded(
        baselineCorrectCounts.reduce((sum, value) => sum + value, 0) /
          baselineCorrectCounts.length
      ),
    },
    trials: TRIALS_PER_TIER,
    challengerWinRate: rounded(winRate),
    challengerLossRate: rounded(losses / TRIALS_PER_TIER),
    drawRate: rounded(draws / TRIALS_PER_TIER),
    withinProvisionalFairnessBand:
      winRate >= FAIR_WIN_RATE_MIN && winRate <= FAIR_WIN_RATE_MAX,
  };
}

function main() {
  const manifest = buildNormalBaselineCaptureManifest();
  const random = seededRandom();
  const tiers = NORMAL_BASELINE_TIERS.map((tier) =>
    simulateTier({
      tier,
      questions: manifest.questions.filter(
        (question) => question.difficultyCode === tier.difficultyCode
      ),
      random,
    })
  );
  const results = {
    schemaVersion: "GOAT_ARENA_NORMAL_BASELINE_SIMULATION_V1",
    generatedAt: new Date("2026-10-11T00:00:00.000Z").toISOString(),
    batchKey: manifest.batchKey,
    activationApproved: false,
    provisionalFairnessBand: [FAIR_WIN_RATE_MIN, FAIR_WIN_RATE_MAX],
    assumptions: [
      "A same-MMR challenger answers each question independently at the midpoint of the existing tier target-accuracy range.",
      "Difficulty-adjusted correctness uses the production scoring function; solve time is sampled symmetrically from 75% to 125% and used inside the configured close-score band.",
      "This is a hypothesis test only; real matched-user calibration data is still required before activation.",
    ],
    allTiersWithinProvisionalFairnessBand: tiers.every(
      (tier) => tier.withinProvisionalFairnessBand
    ),
    tiers,
  };
  const outputPath = path.resolve(
    __dirname,
    "..",
    "audit",
    "GOAT_ARENA_NORMAL_BASELINE_SIMULATION_RESULTS.json"
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (!results.allTiersWithinProvisionalFairnessBand) process.exitCode = 2;
}

if (require.main === module) main();
