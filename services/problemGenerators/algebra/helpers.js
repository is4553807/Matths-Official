const {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
} = require("../utils");
const {
  formatAlgebraMathText,
} = require("../../mathTextService");

function round4(value) {
  return Number(Number(value).toFixed(4));
}

function iterate(firstTerm, step, targetIndex) {
  let value = firstTerm;

  for (
    let index = 1;
    index < targetIndex;
    index += 1
  ) {
    value = step(value, index);
  }

  return value;
}

const GRAPH_CONCEPT_IDS = new Set([
  "algebra-01-04",
  "algebra-01-06",
  "algebra-01-07",
  "algebra-01-08",
  "algebra-02-02",
  "algebra-03-01",
  "algebra-03-02",
  "algebra-03-03",
  "algebra-03-06",
]);

function normalizeGraphPrompt(value) {
  const subscriptDigits = {
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
  };

  return String(value || "")
    .replace(/−/g, "-")
    .replace(/[₀-₉]/g, (digit) => subscriptDigits[digit])
    .replace(/\s+/g, " ")
    .trim();
}

function matchedNumber(text, pattern, fallback = null) {
  const match = text.match(pattern);
  const value = match ? Number(match[1]) : Number.NaN;

  return Number.isFinite(value) ? value : fallback;
}

function finiteAnswer(generated, fallback = null) {
  const value = Number(generated.answer);
  return Number.isFinite(value) ? value : fallback;
}

function expLogVisualization({
  conceptId,
  typeId,
  generated,
  text,
}) {
  const fractionBase = matchedNumber(
    text,
    /\(1\/(\d+(?:\.\d+)?)\)\^/
  );
  const logBase = matchedNumber(text, /log_(\d+(?:\.\d+)?)/);
  const exponentialBase = matchedNumber(
    text,
    /(?:^|[=\s])(\d+(?:\.\d+)?)\^\(?x/
  );
  const base =
    fractionBase
      ? 1 / fractionBase
      : logBase || exponentialBase || 2;
  const answer = finiteAnswer(generated);
  const isLog = text.includes("log");
  const isInverse =
    typeId === "inverse-relation" ||
    typeId === "symmetry-yx" ||
    typeId === "log-inverse";
  const functionType = isInverse
    ? "both"
    : isLog
      ? "log"
      : "exp";
  const minusShift = matchedNumber(
    text,
    /log_[^( ]+\s*\(x\s*-\s*(-?\d+(?:\.\d+)?)/
  );
  const plusShift = matchedNumber(
    text,
    /log_[^( ]+\s*\(x\s*\+\s*(\d+(?:\.\d+)?)/
  );
  const shiftX =
    minusShift !== null
      ? minusShift
      : plusShift !== null
        ? -plusShift
        : 0;
  const expShift = matchedNumber(
    text,
    /\^x\s*\+\s*(-?\d+(?:\.\d+)?)/
  );
  const expMinusShift = matchedNumber(
    text,
    /\^x\s*-\s*(\d+(?:\.\d+)?)/
  );
  const exponentOffset = matchedNumber(
    text,
    /\^\(x\s*\+\s*(-?\d+(?:\.\d+)?)\)/
  ) ?? 0;
  const shiftY =
    expShift !== null
      ? expShift
      : expMinusShift !== null
        ? -expMinusShift
        : 0;
  let focusX = functionType === "log" ? shiftX + 1 : 0;
  let targetY = null;
  let inequality = null;

  const functionInput = matchedNumber(
    text,
    /[fg]\((-?\d+(?:\.\d+)?)\)/
  );
  const interval = text.match(
    /(-?\d+(?:\.\d+)?)≤x≤(-?\d+(?:\.\d+)?)/
  );
  const point = text.match(
    /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/
  );
  const logArgument = matchedNumber(
    text,
    /log_\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)/
  );

  if (functionInput !== null) {
    focusX = functionInput;
  } else if (interval) {
    const left = Number(interval[1]);
    const right = Number(interval[2]);
    const asksMaximum =
      text.includes("최댓값") || text.includes("최대");

    focusX = asksMaximum ? right : left;
  } else if (point) {
    focusX = Number(point[1]);
  } else if (
    [
      "exp-equation",
      "exp-equation-base",
      "exp-inequality",
      "exp-eq-two",
      "exp-solve",
    ].includes(typeId) &&
    answer !== null
  ) {
    focusX = answer;
  } else if (
    typeId === "exp-sub" &&
    answer !== null
  ) {
    focusX =
      Math.log(Math.max(answer, 0.0001)) /
      Math.log(base);
  } else if (
    [
      "log-eq-def",
      "log-equation",
      "log-inequality",
      "log-eq-two",
    ].includes(typeId) &&
    answer !== null
  ) {
    focusX = answer;
  } else if (logArgument !== null) {
    focusX = logArgument;
  } else if (typeId === "compound-growth") {
    focusX =
      matchedNumber(text, /(\d+)기간/, 1);
  } else if (typeId === "log-scale") {
    focusX = matchedNumber(
      text,
      /x=(-?\d+(?:\.\d+)?)/,
      shiftX + 1
    );
  }

  if (
    [
      "exp-equation",
      "exp-equation-base",
      "exp-inequality",
      "exp-eq-two",
      "exp-solve",
    ].includes(typeId)
  ) {
    targetY =
      base ** (focusX + exponentOffset) +
      shiftY;
  } else if (typeId === "exp-sub") {
    targetY = answer;
  } else if (
    [
      "log-eq-def",
      "log-equation",
      "log-inequality",
      "log-eq-two",
    ].includes(typeId)
  ) {
    const argument = Math.max(0.0001, focusX - shiftX);
    targetY =
      Math.log(argument) / Math.log(base);
  }

  if (typeId.includes("inequality")) {
    if (text.includes(">")) inequality = "greater";
    if (text.includes("<")) inequality = "less";
  }

  return {
    kind: "algebra-exp-log",
    conceptId,
    typeId,
    functionType,
    base,
    shiftX,
    shiftY,
    exponentOffset,
    focusX,
    targetY,
    inequality,
    focusFunction: isLog ? "log" : "exp",
    reflectY:
      typeId === "reflect-exp",
    showInverseLine: isInverse,
    note:
      inequality
        ? "교점의 양쪽에서 두 그래프의 높이를 비교하세요."
        : isInverse
          ? "지수함수와 로그함수의 대응점은 y=x에 대해 대칭입니다."
          : "표시한 점과 점근선을 문제의 식과 함께 확인하세요.",
  };
}

function trigVisualization({
  conceptId,
  typeId,
  generated,
  text,
}) {
  const functionName =
    text.match(/\b(sin|cos|tan)\b/)?.[1] || "sin";
  const quadrant = matchedNumber(text, /제(\d)사분면/);
  const degree = matchedNumber(
    text,
    /(?:sin|cos|tan)\s*(\d+(?:\.\d+)?)°/
  );
  const amplitude =
    matchedNumber(text, /y=(-?\d+(?:\.\d+)?)sin/, 1);
  const frequency =
    matchedNumber(text, /sin\((\d+(?:\.\d+)?)x\)/, 1);
  const verticalShift =
    matchedNumber(
      text,
      /sin x\s*\+\s*(-?\d+(?:\.\d+)?)/,
      0
    );
  const answer = finiteAnswer(generated);
  let focusDegree =
    degree !== null
      ? degree
      : quadrant !== null
        ? [45, 135, 225, 315][quadrant - 1]
        : 90;

  if (typeId === "simple-equation" && answer !== null) {
    focusDegree = answer;
  } else if (typeId === "graph-min") {
    focusDegree = 270 / frequency;
  } else if (typeId === "graph-max") {
    focusDegree = 90 / frequency;
  }

  return {
    kind: "algebra-trig",
    conceptId,
    typeId,
    functionName,
    amplitude,
    frequency,
    verticalShift,
    focusDegree,
    note:
      typeId === "quadrant-sign"
        ? "표시점이 어느 사분면에 있는지 보고 좌표의 부호를 확인하세요."
        : "표시한 각에서 그래프의 높이가 삼각함수 값입니다.",
  };
}

function sequenceBasicsValues(typeId, text, answer) {
  let count = Math.max(
    6,
    matchedNumber(text, /a_(\d+)/, 6)
  );
  count = Math.min(10, count);
  let evaluate = (n) => 2 * n + 1;
  const linear = text.match(
    /a_n=(-?\d+(?:\.\d+)?)n\+(-?\d+(?:\.\d+)?)/
  );

  if (linear) {
    const coefficient = Number(linear[1]);
    const constant = Number(linear[2]);
    evaluate = (n) => coefficient * n + constant;
  } else if (text.includes("a_n=n²")) {
    evaluate = (n) => n * n;
  } else if (text.includes("a_n=n(n+1)")) {
    evaluate = (n) => n * (n + 1);
  } else if (text.includes("(-1)ⁿ") || text.includes("(−1)ⁿ")) {
    evaluate = (n) => (n % 2 ? -1 : 1) * n;
  } else if (text.includes("a_n=2ⁿ")) {
    evaluate = (n) => 2 ** n;
  } else if (typeId === "an-from-Sn") {
    evaluate = (n) => 2 * n - 1;
  } else if (typeId === "next-term-pattern") {
    const listed = text
      .match(/수열\s+([^.]*)\.\.\./)?.[1]
      ?.match(/-?\d+(?:\.\d+)?/g)
      ?.map(Number);

    if (Array.isArray(listed) && listed.length >= 3) {
      return [
        ...listed.slice(0, 4),
        answer,
      ].filter(Number.isFinite);
    }
  }

  return Array.from(
    { length: count },
    (_, index) => evaluate(index + 1)
  );
}

function arithmeticValues(typeId, text, answer) {
  let first = matchedNumber(text, /첫째항 (-?\d+(?:\.\d+)?)/);
  let difference = matchedNumber(text, /공차 (-?\d+(?:\.\d+)?)/);
  let count = Math.max(
    6,
    matchedNumber(text, /제(\d+)항/, 6),
    matchedNumber(text, /a_(\d+)/, 6)
  );

  const firstTwo = text.match(
    /a1=(-?\d+(?:\.\d+)?), a2=(-?\d+(?:\.\d+)?)/
  );
  const twoTerms = text.match(
    /a_(\d+)=(-?\d+(?:\.\d+)?), a_(\d+)=(-?\d+(?:\.\d+)?)/
  );
  const endpoints = text.match(
    /첫째항 (-?\d+(?:\.\d+)?), 제(\d+)항 (-?\d+(?:\.\d+)?)/
  );
  const knownTerm = text.match(
    /공차 (-?\d+(?:\.\d+)?) 인 등차수열에서 a_(\d+)=(-?\d+(?:\.\d+)?)/
  );
  const three = text.match(
    /등차항이 (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)/
  );
  const mean = text.match(
    /세 수 (-?\d+(?:\.\d+)?), x, (-?\d+(?:\.\d+)?)/
  );

  if (firstTwo) {
    first = Number(firstTwo[1]);
    difference = Number(firstTwo[2]) - first;
  } else if (twoTerms) {
    const firstIndex = Number(twoTerms[1]);
    const firstValue = Number(twoTerms[2]);
    const secondIndex = Number(twoTerms[3]);
    const secondValue = Number(twoTerms[4]);
    difference =
      (secondValue - firstValue) /
      (secondIndex - firstIndex);
    first =
      firstValue -
      (firstIndex - 1) * difference;
    count = Math.max(count, secondIndex);
  } else if (endpoints) {
    first = Number(endpoints[1]);
    count = Number(endpoints[2]);
    difference =
      (Number(endpoints[3]) - first) /
      Math.max(1, count - 1);
  } else if (knownTerm) {
    difference = Number(knownTerm[1]);
    count = Math.max(count, Number(knownTerm[2]));
    first =
      Number(knownTerm[3]) -
      (Number(knownTerm[2]) - 1) *
        difference;
  } else if (three) {
    return [
      Number(three[1]),
      Number(three[2]),
      Number(three[3]),
    ];
  } else if (mean) {
    return [
      Number(mean[1]),
      answer,
      Number(mean[2]),
    ];
  }

  first = first ?? 2;
  difference = difference ?? 2;
  count = Math.min(10, count);

  return Array.from(
    { length: count },
    (_, index) => first + index * difference
  );
}

function geometricValues(typeId, text, answer) {
  let first = matchedNumber(text, /첫째항 (-?\d+(?:\.\d+)?)/);
  let ratio = matchedNumber(text, /공비 (-?\d+(?:\.\d+)?)/);
  let count = Math.max(
    6,
    matchedNumber(text, /제(\d+)항/, 6),
    matchedNumber(text, /a_(\d+)/, 6)
  );

  const firstTwo = text.match(
    /a1=(-?\d+(?:\.\d+)?), a2=(-?\d+(?:\.\d+)?)/
  );
  const thirdTerm = text.match(
    /a1=(-?\d+(?:\.\d+)?), a3=(-?\d+(?:\.\d+)?)/
  );
  const knownTerm = text.match(
    /공비 (-?\d+(?:\.\d+)?) 인 등비수열에서 a_(\d+)=(-?\d+(?:\.\d+)?)/
  );
  const secondTerm = text.match(
    /공비 (-?\d+(?:\.\d+)?) 인 등비수열에서 a2=(-?\d+(?:\.\d+)?)/
  );
  const three = text.match(
    /등비항이 (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)/
  );
  const mean = text.match(
    /세 양수 1, x, (\d+(?:\.\d+)?)/
  );

  if (firstTwo) {
    first = Number(firstTwo[1]);
    ratio = Number(firstTwo[2]) / first;
  } else if (thirdTerm) {
    first = Number(thirdTerm[1]);
    ratio = Math.sqrt(
      Number(thirdTerm[2]) / first
    );
  } else if (knownTerm) {
    ratio = Number(knownTerm[1]);
    count = Math.max(count, Number(knownTerm[2]));
    first =
      Number(knownTerm[3]) /
      ratio ** (Number(knownTerm[2]) - 1);
  } else if (secondTerm) {
    ratio = Number(secondTerm[1]);
    first = Number(secondTerm[2]) / ratio;
  } else if (three) {
    return [
      Number(three[1]),
      Number(three[2]),
      Number(three[3]),
    ];
  } else if (mean) {
    return [1, answer, Number(mean[1])];
  }

  first = first ?? 1;
  ratio = ratio ?? 2;
  count = Math.min(9, count);

  return Array.from(
    { length: count },
    (_, index) => first * ratio ** index
  );
}

function recursiveValues(typeId, text) {
  const first =
    matchedNumber(text, /a1=(-?\d+(?:\.\d+)?)/, 1);
  const second = matchedNumber(text, /a2=(-?\d+(?:\.\d+)?)/);
  const targetIndices = Array.from(
    text.matchAll(/a(\d+)/g),
    (match) => Number(match[1])
  );
  const count = Math.min(
    9,
    Math.max(6, ...targetIndices)
  );
  const values = [first];

  if (typeId === "rec-fib") {
    values.push(second ?? 1);

    while (values.length < count) {
      values.push(
        values[values.length - 1] +
        values[values.length - 2]
      );
    }

    return values;
  }

  const additive = matchedNumber(
    text,
    /a_\{n\+1\}=a_n\+(-?\d+(?:\.\d+)?)/
  );
  const multiplier = matchedNumber(
    text,
    /a_\{n\+1\}=(-?\d+(?:\.\d+)?)·?a_n/
  );

  while (values.length < count) {
    const n = values.length;
    const previous = values[values.length - 1];
    let next;

    if (typeId === "rec-add-n") {
      next = previous + 2 * n;
    } else if (typeId === "rec-affine") {
      next = 2 * previous + 1;
    } else if (typeId === "rec-half") {
      next = previous / 2;
    } else if (typeId === "rec-add-nsq") {
      next = previous + n * n;
    } else if (typeId === "rec-known-two") {
      next =
        values.length === 1 && second !== null
          ? second
          : previous +
            ((second ?? first + 1) - first);
    } else if (multiplier !== null) {
      next = previous * multiplier;
    } else {
      next = previous + (additive ?? 2);
    }

    values.push(next);
  }

  return values;
}

function sequenceVisualization({
  conceptId,
  typeId,
  generated,
  text,
}) {
  const answer = finiteAnswer(generated);
  let values;

  if (conceptId === "algebra-03-01") {
    values = sequenceBasicsValues(typeId, text, answer);
  } else if (conceptId === "algebra-03-02") {
    values = arithmeticValues(typeId, text, answer);
  } else if (conceptId === "algebra-03-03") {
    values = geometricValues(typeId, text, answer);
  } else {
    values = recursiveValues(typeId, text);
  }

  const explicitIndices = Array.from(
    text.matchAll(/a_?(\d+)/g),
    (match) => Number(match[1])
  ).filter(Number.isFinite);
  const requestedIndex = explicitIndices.length
    ? Math.max(...explicitIndices)
    : values.length;

  return {
    kind: "algebra-sequence",
    conceptId,
    typeId,
    values: values
      .map(Number)
      .filter(Number.isFinite)
      .slice(0, 10),
    focusIndex: Math.min(
      values.length,
      Math.max(1, requestedIndex)
    ),
    note:
      conceptId === "algebra-03-02"
        ? "점 사이의 세로 변화량이 일정한지 확인하세요."
        : conceptId === "algebra-03-03"
          ? "앞 항에서 다음 항으로 갈 때의 비율을 확인하세요."
          : conceptId === "algebra-03-06"
            ? "앞 항에서 같은 규칙을 적용해 다음 항을 만듭니다."
            : "수열은 자연수 위치에 찍힌 점들의 모임입니다.",
  };
}

function buildAlgebraGraphVisualization({
  conceptId,
  typeId,
  generated,
}) {
  if (!GRAPH_CONCEPT_IDS.has(conceptId)) {
    return {
      kind: "algebra-concept",
      conceptId,
      typeId,
    };
  }

  const text = normalizeGraphPrompt(
    generated.prompt
  );

  if (conceptId.startsWith("algebra-01-")) {
    return expLogVisualization({
      conceptId,
      typeId,
      generated,
      text,
    });
  }

  if (conceptId === "algebra-02-02") {
    return trigVisualization({
      conceptId,
      typeId,
      generated,
      text,
    });
  }

  return sequenceVisualization({
    conceptId,
    typeId,
    generated,
    text,
  });
}

function createAlgebraProblemType(
  problemType,
  { conceptId, conceptTitle }
) {
  return {
    ...problemType,

    generate() {
      const generated = problemType.generate();
      const typeTitle = problemType.label.replace(
        /^유형\s*\d+\s*·\s*/,
        ""
      );

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
          ? generated.choices.map(
              (choice) => ({
                ...choice,
                text: formatAlgebraMathText(
                  choice.text
                ),
              })
            )
          : generated.choices,
        hintText:
          formatAlgebraMathText(
            generated.hintText ||
              (generated.inputMode === "multiple-choice"
                ? `${conceptTitle}의 정의와 조건을 먼저 확인한 뒤 각 선택지를 비교해보세요.`
                : `문제에 주어진 수와 기호를 ${typeTitle}의 관계식에 표시한 뒤, 한 줄에 한 단계씩 정리해보세요.`)
          ),
        visualization:
          generated.visualization ||
          {
            ...buildAlgebraGraphVisualization({
              conceptId,
              typeId: problemType.id,
              generated,
            }),
            difficulty:
              problemType.difficulty || 1,
          },
        validityChecks: [
          ...(generated.validityChecks || []),
          {
            name: "algebra-generated-answer",
            passed:
              generated.answer !== undefined &&
              generated.answer !== null &&
              String(generated.answer).trim() !== "",
            message:
              "생성된 문제의 정답이 비어 있습니다.",
          },
        ],
      };
    },
  };
}

module.exports = {
  randomInteger,
  nonZeroInteger,
  round4,
  iterate,
  isCorrectAnswer,
  buildAlgebraGraphVisualization,
  createAlgebraProblemType,
};
