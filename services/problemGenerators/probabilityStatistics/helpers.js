const {
  randomInteger,
  isCorrectAnswer,
} = require("../utils");
const {
  formatAlgebraMathText,
} = require("../../mathTextService");

function inlineMath(tex) {
  return `\\(${tex}\\)`;
}

function displayMath(tex) {
  return `\\[${tex}\\]`;
}

function factorial(n) {
  let value = 1;
  for (let index = 2; index <= n; index += 1) {
    value *= index;
  }
  return value;
}

function combination(n, r) {
  if (r < 0 || r > n) return 0;
  const k = Math.min(r, n - r);
  let value = 1;
  for (let index = 1; index <= k; index += 1) {
    value = (value * (n - k + index)) / index;
  }
  return Math.round(value);
}

function permutation(n, r) {
  return factorial(n) / factorial(n - r);
}

function gcd(a, b) {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right) {
    [left, right] = [right, left % right];
  }
  return left || 1;
}

function fractionText(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  const n = numerator / divisor;
  const d = denominator / divisor;
  return d === 1 ? String(n) : `\\frac{${n}}{${d}}`;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function shortAnswer({
  prompt,
  answer,
  solution,
  hintText,
  visualization,
}) {
  return {
    prompt,
    inputMode: "short-answer",
    answer: round4(answer),
    solution,
    hintText,
    visualization,
  };
}

function multipleChoice({
  prompt,
  choices,
  answerIndex,
  solution,
  hintText,
  visualization,
}) {
  const shuffledChoices = choices.map(
    (text, index) => ({
      text,
      correct: index === answerIndex,
    })
  );

  for (
    let index = shuffledChoices.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex = randomInteger(0, index);
    [
      shuffledChoices[index],
      shuffledChoices[swapIndex],
    ] = [
      shuffledChoices[swapIndex],
      shuffledChoices[index],
    ];
  }
  const normalizedChoices = shuffledChoices.map(
    (choice, index) => ({
      key: String.fromCharCode(65 + index),
      text: choice.text,
      correct: choice.correct,
    })
  );
  const correctChoice = normalizedChoices.find(
    (choice) => choice.correct
  );

  return {
    prompt,
    inputMode: "multiple-choice",
    choices: normalizedChoices.map(
      ({ key, text }) => ({ key, text })
    ),
    answer: correctChoice.key,
    solution,
    hintText,
    visualization,
  };
}

function createProblemTypes({
  conceptId,
  conceptTitle,
  labels,
  buildProblems,
}) {
  return labels.map((label, index) => ({
    id: `${conceptId}-type-${String(index + 1).padStart(2, "0")}`,
    label: `유형 ${index + 1} · ${label}`,
    difficulty: index < 3 ? 1 : index < 7 ? 2 : 3,
    generate() {
      const problems = buildProblems();
      const generated = problems[index];

      if (!generated) {
        throw new Error(
          `${conceptTitle}의 ${index + 1}번 문제 유형이 없습니다.`
        );
      }

      return {
        ...generated,
        prompt: formatAlgebraMathText(
          generated.prompt
        ),
        solution: formatAlgebraMathText(
          generated.solution
        ),
        choices: Array.isArray(
          generated.choices
        )
          ? generated.choices.map((choice) => ({
              ...choice,
              text: formatAlgebraMathText(
                choice.text
              ),
            }))
          : generated.choices,
        hintText:
          formatAlgebraMathText(
            generated.hintText ||
              `${conceptTitle}의 정의를 먼저 쓰고, 문제에 주어진 수를 한 단계씩 대입해보세요.`
          ),
        visualization:
          generated.visualization || {
            kind: "probability-concept",
            conceptId,
            typeIndex: index,
          },
        validityChecks: [
          ...(generated.validityChecks || []),
          {
            name: "probability-statistics-answer",
            passed:
              generated.answer !== undefined &&
              generated.answer !== null &&
              String(generated.answer).trim() !== "",
            message: "정답이 비어 있습니다.",
          },
        ],
      };
    },
  }));
}

module.exports = {
  randomInteger,
  inlineMath,
  displayMath,
  factorial,
  combination,
  permutation,
  fractionText,
  round4,
  shortAnswer,
  multipleChoice,
  createProblemTypes,
  isCorrectAnswer,
};
