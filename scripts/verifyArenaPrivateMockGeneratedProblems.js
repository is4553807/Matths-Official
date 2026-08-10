#!/usr/bin/env node

const assert = require("node:assert/strict");
const schema = require("../dataAnalysis/arenaGeneratedAnswerKey.schema.json");
const {
  generateValidatedArenaOneOnOneQuestion,
} = require("../services/arenaOneOnOneProblemTypes");
const {
  scoreArenaAttempt,
} = require("../services/arenaMatchScoringService");

const TYPE_IDS = Object.freeze([
  "killer-private-adjacent-product-recurrence",
  "killer-private-inverse-function-substitution",
]);
const SAMPLE_COUNT = 120;

function assertAnswerKey(answerKey, problem, typeId) {
  assert.equal(answerKey.schemaVersion, schema.properties.schemaVersion.const);
  assert.equal(answerKey.typeId, typeId);
  assert.equal(answerKey.inputMode, "short-answer");
  assert.equal(answerKey.gradingMode, "MATHEMATICAL_EQUIVALENCE");
  assert.equal(answerKey.correctAnswer, String(problem.answer));
  assert.ok(answerKey.normalizedAnswer);
  assert.ok(answerKey.acceptedAnswers.includes(String(problem.answer)));
  assert.ok(answerKey.parameterSnapshot && typeof answerKey.parameterSnapshot === "object");
  assert.ok(Array.isArray(answerKey.solutionProcess));
  assert.ok(answerKey.solutionProcess.length >= 3);
  assert.match(answerKey.contentHash, /^[a-f0-9]{64}$/);
  for (const [index, step] of answerKey.solutionProcess.entries()) {
    assert.equal(step.step, index + 1);
    assert.ok(step.title);
    assert.doesNotMatch(`${step.expression}${step.explanation}`, /\{\{|\$\{/);
  }
  assert.doesNotMatch(problem.prompt, /\{\{|\$\{/);
  assert.doesNotMatch(problem.solution, /\{\{|\$\{/);
  assert.ok(problem.solution.includes(String(problem.answer)));
}

function assertAutomaticScoring(question) {
  const problemPack = {
    questions: [
      {
        questionKey: "Q1",
        answer: "legacy-answer-must-not-be-used",
        answerKey: question.problem.answerKey,
        points: 20,
      },
    ],
  };
  const correct = scoreArenaAttempt({
    problemPack,
    attempt: { answers: [{ questionKey: "Q1", value: question.problem.answer }] },
  });
  const wrong = scoreArenaAttempt({
    problemPack,
    attempt: {
      answers: [
        { questionKey: "Q1", value: String(Number(question.problem.answer) + 1) },
      ],
    },
  });
  assert.equal(correct.correctCount, 1);
  assert.equal(correct.score, 20);
  assert.equal(wrong.correctCount, 0);
}

for (const typeId of TYPE_IDS) {
  const parameterVariants = new Set();
  const promptVariants = new Set();
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const generated = generateValidatedArenaOneOnOneQuestion({
      typeId,
      allowedCategory: "killer",
    });
    assert.equal(generated.typeId, typeId);
    assert.equal(generated.validation.passed, true);
    assert.equal(generated.validation.solvable, true);
    assert.equal(generated.validation.uniqueAnswer, true);
    assert.equal(generated.validation.calculatorFree, true);
    assert.equal(generated.validation.answerMatches, true);
    assert.ok(Number.isInteger(Number(generated.problem.answer)));
    assert.ok(Number(generated.problem.answer) >= 1);
    assert.ok(Number(generated.problem.answer) <= 999);
    assertAnswerKey(generated.problem.answerKey, generated.problem, typeId);
    assertAutomaticScoring(generated);
    parameterVariants.add(
      JSON.stringify(generated.problem.answerKey.parameterSnapshot)
    );
    promptVariants.add(generated.problem.prompt);
  }
  assert.ok(parameterVariants.size >= 3, `${typeId}의 수치 조합이 충분하지 않습니다.`);
  assert.ok(promptVariants.size >= 3, `${typeId}의 문제 변형이 충분하지 않습니다.`);
  console.log(
    `${typeId}: ${SAMPLE_COUNT}회 생성·독립 검산·정답 JSON 채점·동적 풀이 일치 통과 ` +
      `(${parameterVariants.size} parameter variants)`
  );
}

console.log(
  `Private mock abstract generators verified: ${TYPE_IDS.length} types, ` +
    `${TYPE_IDS.length * SAMPLE_COUNT} generated questions.`
);
