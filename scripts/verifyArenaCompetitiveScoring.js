const assert = require("node:assert/strict");
const {
  calculateCompetitivePerformance,
  compareCompetitivePerformance,
  compareCountThenTimePerformance,
} = require("../services/arenaCompetitiveScoringService");

function performance(count, p, time) {
  if (arguments.length < 3) time = 300000;
  return calculateCompetitivePerformance({ questions: Array.from({ length: 5 }, (_, index) => ({ correct: index < count, sourceAccuracyRate: p })),
    totalSolveTimeMs: time });
}

const hard = performance(2, 0.1);
const easy = performance(4, 0.9);
assert.ok(Math.abs(hard.expectedCorrect - 0.5) < 1e-12);
assert.ok(Math.abs(hard.variance - 0.45) < 1e-12);
assert.ok(Math.abs(hard.z - 1.5 / Math.sqrt(0.45)) < 1e-12);
const snapshots = JSON.stringify([hard, easy]);
const result = compareCompetitivePerformance(hard, easy, { closeScoreThreshold: 0.1 });
assert.equal(result.winnerRole, "CHALLENGER", "more correct answers must not automatically win across different sets");
assert.equal(result.reason, "DIFFICULTY_ADJUSTED_PERFORMANCE");
assert.equal(result.scoringVersion, hard.scoringVersion);
assert.equal(JSON.stringify([hard, easy]), snapshots, "historical scoring inputs must remain unchanged");
hard.observations[0].p = 0.2;
assert.equal(result.challenger.observations[0].p, 0.1, "the audit snapshot must not alias later caller mutations");
hard.observations[0].p = 0.1;
assert.equal(compareCompetitivePerformance(performance(3, 0.49, 500000), performance(3, 0.5, 200000),
  { closeScoreThreshold: 0.1 }).winnerRole, "DEFENDER");
assert.equal(compareCompetitivePerformance(performance(3, 0.49, 500000), performance(3, 0.5, 200000),
  { closeScoreThreshold: 0 }).winnerRole, "CHALLENGER");
assert.equal(compareCompetitivePerformance(hard, hard, { closeScoreThreshold: 0.1 }).reason, "DRAW");
const normalCountPriority = compareCountThenTimePerformance(
  performance(3, 0.1, 100000),
  performance(4, 0.9, 500000)
);
assert.equal(normalCountPriority.winnerRole, "DEFENDER", "same-question guest challenges prioritize correct count before time");
assert.equal(normalCountPriority.reason, "MORE_CORRECT_ANSWERS");
assert.equal(
  compareCountThenTimePerformance(performance(3, 0.3, 500000), performance(3, 0.7, 200000)).winnerRole,
  "DEFENDER",
  "equal correct counts must use solve time regardless of Z-score"
);
assert.equal(
  compareCountThenTimePerformance(performance(3, 0.3, 200000), performance(3, 0.7, 200000)).reason,
  "DRAW"
);
for (const time of [null, undefined, -1, 0, NaN, Infinity, "300000"]) {
  const invalid = compareCompetitivePerformance(performance(2, 0.1, time), easy, { closeScoreThreshold: 0.1 });
  assert.equal(invalid.valid, false); assert.equal(invalid.reason, "INVALID_SOLVE_TIME");
}
for (const p of [null, undefined, 0, 1, 35, -0.1, NaN, Infinity, "0.35"]) {
  assert.throws(() => performance(3, p), (error) => error.code === "ARENA_COMPETITIVE_ACCURACY_INVALID");
}
assert.throws(() => calculateCompetitivePerformance({ questions: [], totalSolveTimeMs: 1 }),
  (error) => error.code === "ARENA_COMPETITIVE_QUESTIONS_INVALID");
assert.throws(() => calculateCompetitivePerformance({ questions: Array.from({ length: 5 }, () => ({ correct: "true", sourceAccuracyRate: 0.5 })) }),
  (error) => error.code === "ARENA_COMPETITIVE_CORRECTNESS_INVALID");
for (const threshold of [undefined, null, -1, NaN, Infinity, "0.1"]) {
  assert.throws(() => compareCompetitivePerformance(hard, easy, { closeScoreThreshold: threshold }),
    (error) => error.code === "ARENA_COMPETITIVE_THRESHOLD_REQUIRED");
}
assert.equal(JSON.stringify(result).includes("answerKey"), false);
  console.log("Arena 2.2 scoring verified: different-set difficulty/correctness comparison, close-score time tie-break, same-set guest comparison, exact audit snapshots, invalid-time exclusion, and immutable historical inputs.");
