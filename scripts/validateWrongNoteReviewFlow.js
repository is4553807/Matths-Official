const assert = require("node:assert/strict");

const {
  generateReviewVariation,
  getPreviousReviewProblem,
  rememberReviewProblem,
  clearReviewProblem,
} = require("../services/practiceService");

function validProblem(prompt, choices = []) {
  const multipleChoice = choices.length > 0;

  return {
    prompt,
    inputMode: multipleChoice
      ? "multiple-choice"
      : "short-answer",
    choices,
    answer: multipleChoice
      ? choices[0].key
      : 1,
    solution: "검증용 풀이",
    hintText: "검증용 힌트",
  };
}

function sequentialProblemType(problems) {
  let index = 0;

  return {
    id: "review-flow-regression",
    generate() {
      const problem =
        problems[
          Math.min(index, problems.length - 1)
        ];
      index += 1;
      return problem;
    },
  };
}

function run() {
  const repeated = validProblem("값이 3인 문제");
  const changed = validProblem("값이 7인 문제");
  const generated = generateReviewVariation({
    problemType: sequentialProblemType([
      repeated,
      repeated,
      changed,
    ]),
    courseId: "probability-statistics",
    previousProblem: repeated,
  });

  assert.equal(
    generated.prompt,
    changed.prompt,
    "직전 문제와 같은 문장은 건너뛰어야 합니다."
  );

  const originalChoices = [
    { key: "A", text: "정답" },
    { key: "B", text: "오답" },
  ];
  const reorderedChoices = [
    { key: "A", text: "오답" },
    { key: "B", text: "정답" },
  ];
  const choiceVariant = generateReviewVariation({
    problemType: sequentialProblemType([
      validProblem("같은 판별 문제", originalChoices),
      validProblem("같은 판별 문제", reorderedChoices),
    ]),
    courseId: "probability-statistics",
    previousProblem: validProblem(
      "같은 판별 문제",
      originalChoices
    ),
  });

  assert.deepEqual(
    choiceVariant.choices,
    reorderedChoices,
    "문장이 같아도 보기 순서가 바뀌면 새 문제로 인정해야 합니다."
  );

  const req = { session: {} };
  const fallbackProblem = validProblem("최초 오답");

  assert.equal(
    getPreviousReviewProblem({
      req,
      reviewAttemptId: "attempt-1",
      fallbackProblem,
    }).prompt,
    "최초 오답"
  );

  rememberReviewProblem({
    req,
    reviewAttemptId: "attempt-1",
    problem: changed,
  });

  assert.equal(
    getPreviousReviewProblem({
      req,
      reviewAttemptId: "attempt-1",
      fallbackProblem,
    }).prompt,
    "값이 7인 문제",
    "다음 재출제는 최초 오답이 아니라 직전 문제와 비교해야 합니다."
  );

  clearReviewProblem({
    req,
    reviewAttemptId: "attempt-1",
  });

  assert.equal(
    getPreviousReviewProblem({
      req,
      reviewAttemptId: "attempt-1",
      fallbackProblem,
    }).prompt,
    "최초 오답"
  );

  console.log(
    "오답 노트 재출제 회귀 검증 완료"
  );
}

run();
