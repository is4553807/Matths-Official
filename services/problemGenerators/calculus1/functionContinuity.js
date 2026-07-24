const {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
  inlineMath,
  displayMath,
  signedNumber,
  xMinus,
  linearExpression,
} = require("./helpers");

function yesNoChoices() {
  return [
    {
      key: "yes",
      text: "연속이다",
    },
    {
      key: "no",
      text: "연속이 아니다",
    },
  ];
}

function piecewiseDefinition(
  leftExpression,
  rightExpression,
  boundary,
  rightIncludesBoundary = true
) {
  const leftCondition = rightIncludesBoundary
    ? `x<${boundary}`
    : `x\\le ${boundary}`;
  const rightCondition = rightIncludesBoundary
    ? `x\\ge ${boundary}`
    : `x>${boundary}`;

  return (
    "f(x)=\\begin{cases}" +
    `${leftExpression},&${leftCondition}\\\\` +
    `${rightExpression},&${rightCondition}` +
    "\\end{cases}"
  );
}

const problemTypes = [
  {
    id: "three-continuity-conditions",
    label: "유형 1 · 연속의 세 조건",
    difficulty: 1,

    generate() {
      const a = randomInteger(-4, 4);

      return {
        prompt:
          `함수 ${inlineMath("f(x)")}가 ${inlineMath(
            `x=${a}`
          )}에서 연속이기 위한 조건으로 옳은 것을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "all-three",
            text:
              `${inlineMath(`f(${a})`)}가 정의되고, 극한이 존재하며, ` +
              `${inlineMath(
                `\\lim_{x\\to ${a}}f(x)=f(${a})`
              )}이다.`,
          },
          {
            key: "point-only",
            text:
              `${inlineMath(`f(${a})`)}의 값만 존재하면 된다.`,
          },
          {
            key: "limit-only",
            text:
              `극한값만 존재하면 함수값과 달라도 된다.`,
          },
          {
            key: "one-side",
            text:
              `좌극한과 함수값만 같으면 된다.`,
          },
        ],
        answer: "all-three",
        solution:
          `점에서의 연속은 함수값의 존재, 양쪽 극한의 존재, ` +
          `그리고 ${inlineMath(
            `\\lim_{x\\to ${a}}f(x)=f(${a})`
          )}라는 세 조건이 모두 필요합니다.`,
        hintText:
          `${inlineMath(`x=${a}`)}에서 다음 세 항목을 순서대로 ` +
          `확인하세요.\n① ${inlineMath(`f(${a})`)}가 정의되는가\n` +
          `② 좌극한과 우극한이 같은가\n` +
          `③ 그 공통 극한값이 ${inlineMath(`f(${a})`)}와 같은가`,
        visualization: null,
      };
    },
  },

  {
    id: "judge-from-limit-and-value",
    label: "유형 2 · 극한과 함수값으로 판정",
    difficulty: 2,

    generate() {
      const a = randomInteger(-3, 3);
      const limitValue = randomInteger(-4, 4);
      const caseIndex = randomInteger(0, 3);
      let leftLimit = limitValue;
      let rightLimit = limitValue;
      let pointValue = limitValue;
      let pointDefined = true;
      let answer = "yes";
      let reason =
        "좌극한, 우극한, 함수값이 모두 같은 값입니다.";
      let visualization = {
        kind: "polynomial",
        focusX: a,
        coefficients: {
          quadratic: 0,
          linear: 0,
          constant: limitValue,
        },
      };

      if (caseIndex === 1) {
        rightLimit += nonZeroInteger(-3, 3);
        pointValue = randomInteger(-4, 4);
        answer = "no";
        reason =
          "좌극한과 우극한이 달라 극한이 존재하지 않습니다.";
        visualization = {
          kind: "one-sided-limits",
          focusX: a,
          leftLimit,
          rightLimit,
        };
      } else if (caseIndex === 2) {
        pointValue += nonZeroInteger(-3, 3);
        answer = "no";
        reason =
          "극한값은 존재하지만 함수값과 다릅니다.";
        visualization = {
          kind: "limit-point-example",
          focusX: a,
          limitValue,
          pointValue,
        };
      } else if (caseIndex === 3) {
        pointDefined = false;
        answer = "no";
        reason =
          "극한값이 존재하더라도 함수값이 정의되지 않았습니다.";
        visualization = {
          kind: "hole-linear",
          focusX: a,
          slope: 0,
          intercept: limitValue,
        };
      }

      return {
        prompt:
          `${inlineMath(
            `\\lim_{x\\to ${a}^{-}}f(x)=${leftLimit}`
          )}, ` +
          `${inlineMath(
            `\\lim_{x\\to ${a}^{+}}f(x)=${rightLimit}`
          )}이고, ` +
          (pointDefined
            ? `${inlineMath(
                `f(${a})=${pointValue}`
              )}입니다.`
            : `${inlineMath(
                `f(${a})`
              )}는 정의되지 않았습니다.`) +
          ` 함수 ${inlineMath("f(x)")}는 ${inlineMath(
            `x=${a}`
          )}에서 연속입니까?`,
        inputMode: "multiple-choice",
        choices: yesNoChoices(),
        answer,
        solution:
          `${reason} 따라서 ${inlineMath(
            `x=${a}`
          )}에서 ${answer === "yes" ? "연속입니다." : "연속이 아닙니다."}`,
        hintText:
          "좌극한과 우극한을 먼저 비교하고, 그 공통값이 " +
          "실제 함수값과 같은지 확인하세요.",
        visualization,
      };
    },
  },

  {
    id: "fill-removable-hole",
    label: "유형 3 · 구멍을 메우는 함수값",
    difficulty: 2,

    generate() {
      const a = nonZeroInteger(-5, 5);
      const answer = 2 * a;
      const definition =
        "f(x)=\\begin{cases}" +
        `\\dfrac{x^2-${a ** 2}}{${xMinus(a)}},&x\\ne ${a}\\\\` +
        `k,&x=${a}` +
        "\\end{cases}";

      return {
        prompt:
          `${displayMath(definition)}` +
          `${inlineMath("f(x)")}가 ${inlineMath(
            `x=${a}`
          )}에서 연속이 되도록 하는 ${inlineMath("k")}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `${inlineMath(`x\\ne ${a}`)}에서 식을 약분하면 ` +
          `${inlineMath(`f(x)=x${a < 0 ? "" : "+"}${a}`)}입니다. ` +
          `따라서 극한값 ${inlineMath(String(answer))}과 ` +
          `함수값 ${inlineMath("k")}가 같아야 하므로 ` +
          `${inlineMath(`k=${answer}`)}입니다.`,
        hintText:
          "먼저 분자를 제곱의 차로 인수분해해 극한값을 구한 뒤, " +
          "그 값을 빈 점에 채우세요.",
        visualization: {
          kind: "hole-linear",
          focusX: a,
          slope: 1,
          intercept: a,
        },
      };
    },
  },

  {
    id: "piecewise-intercept-parameter",
    label: "유형 4 · 조각함수의 상수항",
    difficulty: 3,

    generate() {
      const a = randomInteger(-3, 3);
      const leftSlope = nonZeroInteger(-3, 3);
      const leftConstant = randomInteger(-4, 4);
      const rightSlope = nonZeroInteger(-3, 3);
      const leftValue =
        leftSlope * a + leftConstant;
      const parameter =
        leftValue - rightSlope * a;
      const rightExpression =
        rightSlope === 1
          ? "x+k"
          : rightSlope === -1
            ? "-x+k"
            : `${rightSlope}x+k`;
      const definition = piecewiseDefinition(
        linearExpression(
          leftSlope,
          leftConstant
        ),
        rightExpression,
        a
      );

      return {
        prompt:
          `${displayMath(definition)}` +
          `${inlineMath("f(x)")}가 ${inlineMath(
            `x=${a}`
          )}에서 연속이 되도록 하는 ${inlineMath("k")}를 구하세요.`,
        inputMode: "short-answer",
        answer: parameter,
        solution:
          `왼쪽 식의 극한은 ${inlineMath(
            String(leftValue)
          )}입니다. 오른쪽 식과 함수값도 같아야 하므로 ` +
          `${inlineMath(
            `${rightSlope}\\times(${a})+k=${leftValue}`
          )}에서 ${inlineMath(
            `k=${parameter}`
          )}를 얻습니다.`,
        hintText:
          `${inlineMath(`x=${a}`)}를 왼쪽 식과 오른쪽 식에 각각 ` +
          "대입한 값이 같아지도록 식을 세우세요.",
        visualization: {
          kind: "piecewise-linear",
          focusX: a,
          left: {
            slope: leftSlope,
            constant: leftConstant,
          },
          right: {
            slope: rightSlope,
            constant: parameter,
          },
        },
      };
    },
  },

  {
    id: "piecewise-slope-parameter",
    label: "유형 5 · 조각함수의 기울기",
    difficulty: 3,

    generate() {
      const a = nonZeroInteger(-4, 4);
      const leftSlope = nonZeroInteger(-3, 3);
      const leftConstant = randomInteger(-4, 4);
      const parameter = randomInteger(-4, 4);
      const leftValue =
        leftSlope * a + leftConstant;
      const rightConstant =
        leftValue - parameter * a;
      const rightExpression =
        `mx${signedNumber(rightConstant)}`;
      const definition = piecewiseDefinition(
        linearExpression(
          leftSlope,
          leftConstant
        ),
        rightExpression,
        a
      );

      return {
        prompt:
          `${displayMath(definition)}` +
          `${inlineMath("f(x)")}가 ${inlineMath(
            `x=${a}`
          )}에서 연속이 되도록 하는 ${inlineMath("m")}을 구하세요.`,
        inputMode: "short-answer",
        answer: parameter,
        solution:
          `양쪽 식에 ${inlineMath(`x=${a}`)}를 대입한 값이 ` +
          `같아야 합니다. ${inlineMath(
            `${leftValue}=${a}m${signedNumber(
              rightConstant
            )}`
          )}을 풀면 ${inlineMath(
            `m=${parameter}`
          )}입니다.`,
        hintText:
          "경계의 왼쪽 높이와 오른쪽 높이가 같아야 그래프가 " +
          "끊기지 않습니다.",
        visualization: {
          kind: "piecewise-linear",
          focusX: a,
          left: {
            slope: leftSlope,
            constant: leftConstant,
          },
          right: {
            slope: parameter,
            constant: rightConstant,
          },
        },
      };
    },
  },

  {
    id: "rational-continuity-at-point",
    label: "유형 6 · 유리함수의 한 점 연속",
    difficulty: 2,

    generate() {
      const a = randomInteger(-4, 4);
      const isContinuous = Math.random() >= 0.5;
      const excludedPoint = isContinuous
        ? a + nonZeroInteger(-3, 3)
        : a;
      const numeratorConstant =
        randomInteger(-4, 4);

      return {
        prompt:
          `${inlineMath(
            `f(x)=\\dfrac{x${signedNumber(
              numeratorConstant
            )}}{${xMinus(excludedPoint)}}`
          )}일 때, ${inlineMath("f(x)")}는 ${inlineMath(
            `x=${a}`
          )}에서 연속입니까?`,
        inputMode: "multiple-choice",
        choices: yesNoChoices(),
        answer: isContinuous ? "yes" : "no",
        solution: isContinuous
          ? `${inlineMath(`x=${a}`)}에서 분모는 0이 아니므로 ` +
            "유리함수는 그 점에서 연속입니다."
          : `${inlineMath(`x=${a}`)}에서 분모가 0이 되어 ` +
            "함수값이 정의되지 않으므로 연속이 아닙니다.",
        hintText:
          `유리함수는 분모가 0이 아닌 점에서 연속입니다.\n` +
          `${inlineMath(`x=${a}`)}를 분모에 넣으면 ${inlineMath(
          `(${a})-(${excludedPoint})=${a - excludedPoint}`
          )}입니다. 이 값이 0인지 판단하세요.`,
        visualization: null,
        validityChecks: [
          {
            name: "rational-domain-condition",
            passed:
              isContinuous ===
              (a !== excludedPoint),
            message:
              "유리함수의 정의역과 연속 판정이 일치하지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "rational-continuity-interval",
    label: "유형 7 · 연속인 구간 찾기",
    difficulty: 2,

    generate() {
      const excludedPoint =
        randomInteger(-4, 4);

      return {
        prompt:
          `${inlineMath(
            `f(x)=\\dfrac{1}{${xMinus(excludedPoint)}}`
          )}가 구간 전체에서 연속인 것을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "safe",
            text: inlineMath(
              `[${excludedPoint + 1},${excludedPoint + 3}]`
            ),
          },
          {
            key: "left-end",
            text: inlineMath(
              `[${excludedPoint - 2},${excludedPoint}]`
            ),
          },
          {
            key: "middle",
            text: inlineMath(
              `[${excludedPoint - 1},${excludedPoint + 1}]`
            ),
          },
          {
            key: "right-end",
            text: inlineMath(
              `[${excludedPoint},${excludedPoint + 2}]`
            ),
          },
        ],
        answer: "safe",
        solution:
          `이 함수는 분모가 0이 되는 ${inlineMath(
            `x=${excludedPoint}`
          )}에서만 불연속입니다. 이 점을 포함하지 않는 ` +
          `${inlineMath(
            `[${excludedPoint + 1},${excludedPoint + 3}]`
          )}에서 연속입니다.`,
        hintText:
          `분모 ${inlineMath(
            xMinus(excludedPoint)
          )}가 0이 되는 곳은 ${inlineMath(
            `x=${excludedPoint}`
          )}입니다.\n` +
          `보기의 양 끝점도 포함하여 이 값을 전혀 포함하지 않는 ` +
          `구간을 찾으세요.`,
        visualization: null,
        validityChecks: [
          {
            name: "unique-safe-interval",
            passed:
              !(
                excludedPoint >=
                  excludedPoint + 1 &&
                excludedPoint <=
                  excludedPoint + 3
              ) &&
              excludedPoint >=
                excludedPoint - 2 &&
              excludedPoint <=
                excludedPoint &&
              excludedPoint >=
                excludedPoint - 1 &&
              excludedPoint <=
                excludedPoint + 1 &&
              excludedPoint >=
                excludedPoint &&
              excludedPoint <=
                excludedPoint + 2,
            message:
              "연속인 구간 보기에 정답이 하나로 결정되지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "endpoint-continuity",
    label: "유형 8 · 닫힌구간의 끝점",
    difficulty: 2,

    generate() {
      const a = randomInteger(-5, 0);
      const b = randomInteger(1, 6);

      return {
        prompt:
          `함수 ${inlineMath("f(x)")}가 ${inlineMath(
            `(${a},${b})`
          )}의 모든 점에서 연속이고, ` +
          `${inlineMath(
            `\\lim_{x\\to ${a}^{+}}f(x)=f(${a})`
          )}, ` +
          `${inlineMath(
            `\\lim_{x\\to ${b}^{-}}f(x)=f(${b})`
          )}입니다. 연속인 구간을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "closed",
            text: inlineMath(`[${a},${b}]`),
          },
          {
            key: "open",
            text: inlineMath(`(${a},${b})`),
          },
          {
            key: "left-open",
            text: inlineMath(`(${a},${b}]`),
          },
          {
            key: "right-open",
            text: inlineMath(`[${a},${b})`),
          },
        ],
        answer: "closed",
        solution:
          "구간 내부에서 연속이고, 왼쪽 끝점에서는 우극한이, " +
          "오른쪽 끝점에서는 좌극한이 각각 함수값과 같습니다. " +
          `따라서 ${inlineMath(`[${a},${b}]`)}에서 연속입니다.`,
        hintText:
          `내부 ${inlineMath(
            `(${a},${b})`
          )}에서는 이미 연속입니다.\n` +
          `왼쪽 끝 ${inlineMath(`x=${a}`)}에서는 우극한을, ` +
          `오른쪽 끝 ${inlineMath(`x=${b}`)}에서는 좌극한을 ` +
          `확인했으므로 두 끝점을 포함할 수 있는지 판단하세요.`,
        visualization: null,
      };
    },
  },

  {
    id: "classify-discontinuity",
    label: "유형 9 · 불연속 유형 판별",
    difficulty: 2,

    generate() {
      const a = randomInteger(-3, 3);
      const limitValue = randomInteger(-4, 4);
      const caseIndex = randomInteger(0, 2);
      let rightLimit = limitValue;
      let pointValue = limitValue;
      let answer = "continuous";
      let visualization = {
        kind: "polynomial",
        focusX: a,
        coefficients: {
          quadratic: 0,
          linear: 0,
          constant: limitValue,
        },
      };

      if (caseIndex === 1) {
        pointValue += nonZeroInteger(-3, 3);
        answer = "removable";
        visualization = {
          kind: "limit-point-example",
          focusX: a,
          limitValue,
          pointValue,
        };
      } else if (caseIndex === 2) {
        rightLimit += nonZeroInteger(-3, 3);
        answer = "jump";
        visualization = {
          kind: "one-sided-limits",
          focusX: a,
          leftLimit: limitValue,
          rightLimit,
        };
      }

      return {
        prompt:
          `${inlineMath(
            `\\lim_{x\\to ${a}^{-}}f(x)=${limitValue}`
          )}, ` +
          `${inlineMath(
            `\\lim_{x\\to ${a}^{+}}f(x)=${rightLimit}`
          )}, ` +
          `${inlineMath(
            `f(${a})=${pointValue}`
          )}일 때 ${inlineMath(`x=${a}`)}에서의 상태를 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "continuous",
            text: "연속",
          },
          {
            key: "removable",
            text: "제거 가능한 불연속",
          },
          {
            key: "jump",
            text: "점프 불연속",
          },
        ],
        answer,
        solution:
          answer === "continuous"
            ? "좌극한, 우극한, 함수값이 모두 같으므로 연속입니다."
            : answer === "removable"
              ? "양쪽 극한은 같지만 함수값만 다르므로 그 점의 값을 " +
                "바꾸면 연속이 되는 제거 가능한 불연속입니다."
              : "좌극한과 우극한이 서로 달라 그래프가 뛰어오르는 " +
                "점프 불연속입니다.",
        hintText:
          "먼저 양쪽 극한이 같은지 보고, 같다면 함수값까지 " +
          "일치하는지 확인하세요.",
        visualization,
      };
    },
  },

  {
    id: "continuity-from-table",
    label: "유형 10 · 표에서 연속 판정",
    difficulty: 2,

    generate() {
      const a = randomInteger(-2, 2);
      const target = randomInteger(-4, 4);
      const isContinuous = Math.random() >= 0.5;
      const pointValue = isContinuous
        ? target
        : target + nonZeroInteger(-3, 3);
      const xValues = [
        a - 0.1,
        a - 0.01,
        a,
        a + 0.01,
        a + 0.1,
      ];
      const yValues = [
        target - 0.1,
        target - 0.01,
        pointValue,
        target + 0.01,
        target + 0.1,
      ];
      const table = displayMath(
        "\\begin{array}{c|ccccc}" +
          `x&${xValues.join("&")}\\\\` +
          `f(x)&${yValues
            .map((value) => value.toFixed(2))
            .join("&")}` +
          "\\end{array}"
      );

      return {
        prompt:
          `${table}` +
          `표를 바탕으로 ${inlineMath("f(x)")}가 ${inlineMath(
            `x=${a}`
          )}에서 연속인지 판단하세요.`,
        inputMode: "multiple-choice",
        choices: yesNoChoices(),
        answer: isContinuous ? "yes" : "no",
        solution:
          `주변의 함수값은 양쪽에서 ${inlineMath(
            String(target)
          )}에 가까워지고, ${inlineMath(
            `f(${a})=${pointValue}`
          )}입니다. 따라서 ` +
          (isContinuous
            ? "극한값과 함수값이 같아 연속입니다."
            : "극한값과 함수값이 달라 연속이 아닙니다."),
        hintText:
          `${inlineMath(`x=${a}`)}인 열을 잠시 가리고 양쪽 값이 ` +
          "향하는 높이를 찾은 뒤, 가운데 함수값과 비교하세요.",
        visualization: {
          kind: "limit-point-example",
          focusX: a,
          limitValue: target,
          pointValue,
        },
      };
    },
  },
];

module.exports = {
  key: "calculus-function-continuity",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
