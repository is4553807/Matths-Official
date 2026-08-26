const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  generateReviewVariation,
  getPreviousReviewProblem,
  rememberReviewProblem,
  clearReviewProblem,
  nextReviewDate,
} = require("../services/practiceService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

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
  assert.equal(
    nextReviewDate(
      new Date("2026-08-26T14:59:59.000Z")
    ).toISOString(),
    "2026-08-26T15:00:00.000Z",
    "한국 날짜가 바뀌기 전에는 다음 날 0시(KST)로 예약해야 합니다."
  );
  assert.equal(
    nextReviewDate(
      new Date("2026-08-26T15:00:00.000Z")
    ).toISOString(),
    "2026-08-27T15:00:00.000Z",
    "한국 날짜가 바뀐 직후에도 서버 시간대와 무관하게 다음 날로 예약해야 합니다."
  );

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

  const reviewView = read("views/wrong-note-review.ejs");
  const reviewScript = read("public/js/wrong-note-review.js");
  const wrongNotesView = read("views/wrong-notes.ejs");

  assert.doesNotMatch(reviewView, /id="review-scheduled-link"/);
  assert.match(reviewView, /오답이면 내일 예약/);
  assert.doesNotMatch(reviewScript, /복습 예정으로 자동 예약했습니다/);
  assert.match(reviewScript, /scheduledDate \|\| "내일"} 복습 예정/);
  assert.match(reviewScript, /strong\.textContent = coachMessage/);
  assert.doesNotMatch(reviewScript, /strong\.textContent \+=/);
  assert.match(reviewScript, /지금 한 번 더 풀기/);
  assert.match(wrongNotesView, /‘비슷한 유형으로 복습’에서 다시 틀려/);

  console.log(
    "오답 노트 재출제 회귀 검증 완료"
  );
}

run();
