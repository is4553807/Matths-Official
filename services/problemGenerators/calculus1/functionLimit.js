const {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
} = require("../utils");

function inlineMath(tex) {
  return `\\(${tex}\\)`;
}

function displayMath(tex) {
  return `\\[${tex}\\]`;
}

function signedNumber(value) {
  if (value === 0) return "";
  return value > 0
    ? `+${value}`
    : `-${Math.abs(value)}`;
}

function xMinus(value) {
  return value >= 0
    ? `x-${value}`
    : `x+${Math.abs(value)}`;
}

function xPlus(value) {
  return value >= 0
    ? `x+${value}`
    : `x-${Math.abs(value)}`;
}

function linearExpression(slope, constant) {
  const xTerm =
    slope === 1
      ? "x"
      : slope === -1
        ? "-x"
        : `${slope}x`;

  return `${xTerm}${signedNumber(constant)}`;
}

function quadraticExpression(p, q, r) {
  const quadraticTerm =
    p === 1
      ? "x^2"
      : p === -1
        ? "-x^2"
        : `${p}x^2`;

  const linearTerm =
    q === 0
      ? ""
      : q === 1
        ? "+x"
        : q === -1
          ? "-x"
          : q > 0
            ? `+${q}x`
            : `-${Math.abs(q)}x`;

  return `${quadraticTerm}${linearTerm}${signedNumber(r)}`;
}

const problemTypes = [
  {
    id: "direct-substitution",
    label: "유형 1 · 직접 대입",
    difficulty: 1,

    generate() {
      const a = randomInteger(-3, 3);
      const p = nonZeroInteger(-3, 3);
      const q = randomInteger(-5, 5);
      const r = randomInteger(-5, 5);
      const answer = p * a * a + q * a + r;
      const expression = quadraticExpression(p, q, r);

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}\\left(${expression}\\right)`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution: `다항함수는 연속이므로 ${inlineMath(
          `x=${a}`
        )}를 직접 대입합니다. 정답은 ${inlineMath(
          String(answer)
        )}입니다.`,
        hintText:
          `${inlineMath(`y=${expression}`)}의 그래프에서 ` +
          `${inlineMath(`x=${a}`)}일 때의 높이를 확인해보세요.`,
        visualization: {
          kind: "polynomial",
          focusX: a,
          coefficients: {
            quadratic: p,
            linear: q,
            constant: r,
          },
        },
        validityChecks: [
          {
            name: "direct-substitution-answer",
            passed:
              answer === p * a * a + q * a + r,
            message:
              "직접 대입으로 계산한 값과 정답이 일치하지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "factor-cancellation",
    label: "유형 2 · 인수분해와 약분",
    difficulty: 2,

    generate() {
      const a = nonZeroInteger(-5, 5);
      const answer = 2 * a;

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{x^2-${a ** 2}}{${xMinus(a)}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution: `${inlineMath(
          `x^2-${a ** 2}=(${xMinus(a)})(${xPlus(a)})`
        )}이므로 ${inlineMath(
          `x\\ne ${a}`
        )}에서 ${inlineMath(
          xPlus(a)
        )}로 약분됩니다. 정답은 ${inlineMath(
          String(answer)
        )}입니다.`,
        hintText:
          `약분한 뒤의 그래프는 ${inlineMath(
            `y=${xPlus(a)}`
          )}이지만 ${inlineMath(
            `x=${a}`
          )}인 한 점만 비어 있습니다. 빈 점으로 다가가 보세요.`,
        visualization: {
          kind: "hole-linear",
          focusX: a,
          slope: 1,
          intercept: a,
        },
        validityChecks: [
          {
            name: "factor-cancellation-identity",
            passed:
              answer === 2 * a &&
              a !== 0,
            message:
              "인수분해 뒤의 식 또는 극한값이 올바르지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "rationalization",
    label: "유형 3 · 유리화",
    difficulty: 3,

    generate() {
      const root = randomInteger(2, 5);
      const a = root ** 2;
      const answer = 1 / (2 * root);

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{\\sqrt{x}-${root}}{x-${a}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution: `분자를 유리화하면 ${inlineMath(
          `\\frac{1}{\\sqrt{x}+${root}}`
        )}이 됩니다. 따라서 정답은 ${inlineMath(
          `\\frac{1}{${2 * root}}`
        )}입니다.`,
        hintText:
          `유리화한 ${inlineMath(
            `y=\\frac{1}{\\sqrt{x}+${root}}`
          )}의 그래프에서 ${inlineMath(
            `x=${a}`
          )}로 접근해보세요.`,
        visualization: {
          kind: "rationalized-root",
          focusX: a,
          root,
        },
        validityChecks: [
          {
            name: "rationalization-domain",
            passed:
              root > 0 &&
              a === root ** 2 &&
              answer === 1 / (2 * root),
            message:
              "근호의 정의역 또는 유리화 결과가 올바르지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "left-hand-limit",
    label: "유형 4 · 좌극한",
    difficulty: 2,

    generate() {
      const a = randomInteger(-2, 2);
      const leftSlope = nonZeroInteger(-3, 3);
      const leftConstant = randomInteger(-4, 4);
      const rightSlope = nonZeroInteger(-3, 3);
      const rightConstant = randomInteger(-4, 4);
      const answer = leftSlope * a + leftConstant;
      const definition =
        "f(x)=\\begin{cases}" +
        `${linearExpression(leftSlope, leftConstant)},&x<${a}\\\\` +
        `${linearExpression(rightSlope, rightConstant)},&x\\ge ${a}` +
        "\\end{cases}";

      return {
        prompt:
          `${displayMath(definition)}` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}^{-}}f(x)`
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution: `왼쪽에서 접근하므로 ${inlineMath(
          `x<${a}`
        )}인 식만 사용합니다. 정답은 ${inlineMath(
          String(answer)
        )}입니다.`,
        hintText:
          `${inlineMath(`x=${a}`)}의 왼쪽에 있는 초록색 선을 따라 ` +
          `경계점으로 접근해보세요.`,
        visualization: {
          kind: "piecewise-linear",
          focusX: a,
          focusSide: "left",
          left: {
            slope: leftSlope,
            constant: leftConstant,
          },
          right: {
            slope: rightSlope,
            constant: rightConstant,
          },
        },
        validityChecks: [
          {
            name: "left-hand-limit-answer",
            passed:
              answer ===
              leftSlope * a + leftConstant,
            message:
              "좌극한에 왼쪽 식이 적용되지 않았습니다.",
          },
        ],
      };
    },
  },

  {
    id: "right-hand-limit",
    label: "유형 5 · 우극한",
    difficulty: 2,

    generate() {
      const a = randomInteger(-2, 2);
      const leftSlope = nonZeroInteger(-3, 3);
      const leftConstant = randomInteger(-4, 4);
      const rightSlope = nonZeroInteger(-3, 3);
      const rightConstant = randomInteger(-4, 4);
      const answer = rightSlope * a + rightConstant;
      const definition =
        "f(x)=\\begin{cases}" +
        `${linearExpression(leftSlope, leftConstant)},&x<${a}\\\\` +
        `${linearExpression(rightSlope, rightConstant)},&x\\ge ${a}` +
        "\\end{cases}";

      return {
        prompt:
          `${displayMath(definition)}` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}^{+}}f(x)`
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution: `오른쪽에서 접근하므로 ${inlineMath(
          `x\\ge ${a}`
        )}인 식을 사용합니다. 정답은 ${inlineMath(
          String(answer)
        )}입니다.`,
        hintText:
          `${inlineMath(`x=${a}`)}의 오른쪽에 있는 보라색 선을 따라 ` +
          `경계점으로 접근해보세요.`,
        visualization: {
          kind: "piecewise-linear",
          focusX: a,
          focusSide: "right",
          left: {
            slope: leftSlope,
            constant: leftConstant,
          },
          right: {
            slope: rightSlope,
            constant: rightConstant,
          },
        },
        validityChecks: [
          {
            name: "right-hand-limit-answer",
            passed:
              answer ===
              rightSlope * a + rightConstant,
            message:
              "우극한에 오른쪽 식이 적용되지 않았습니다.",
          },
        ],
      };
    },
  },

  {
    id: "two-sided-existence",
    label: "유형 6 · 극한의 존재 판정",
    difficulty: 2,

    generate() {
      const a = randomInteger(-2, 2);
      const leftLimit = randomInteger(-4, 4);
      const exists = Math.random() >= 0.5;
      const rightLimit = exists
        ? leftLimit
        : leftLimit + nonZeroInteger(-3, 3);

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}^{-}}f(x)=${leftLimit}`
          )}, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}^{+}}f(x)=${rightLimit}`
          )}입니다. ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}}f(x)`
          )}는 존재합니까?`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "exists",
            text: "존재한다",
          },
          {
            key: "dne",
            text: "존재하지 않는다",
          },
        ],
        answer: exists ? "exists" : "dne",
        solution: exists
          ? `좌극한과 우극한이 모두 ${inlineMath(
              String(leftLimit)
            )}이므로 극한이 존재합니다.`
          : `좌극한 ${inlineMath(
              String(leftLimit)
            )}과 우극한 ${inlineMath(
              String(rightLimit)
            )}이 다르므로 극한이 존재하지 않습니다.`,
        hintText:
          `양쪽 극한을 비교하세요. 좌극한과 우극한이 같을 때만 ` +
          `두 방향의 움직임이 한 점에서 만납니다.`,
        visualization: {
          kind: "one-sided-limits",
          focusX: a,
          leftLimit,
          rightLimit,
        },
        validityChecks: [
          {
            name: "two-sided-limit-existence",
            passed:
              exists ===
              (leftLimit === rightLimit),
            message:
              "좌우극한과 존재 여부가 서로 일치하지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "point-value-independence",
    label: "유형 7 · 함수값과 극한값",
    difficulty: 2,

    generate() {
      const a = randomInteger(-3, 3);
      const limitValue = randomInteger(-4, 4);
      let pointValue = randomInteger(-4, 4);

      while (pointValue === limitValue) {
        pointValue = randomInteger(-4, 4);
      }

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}}f(x)=${limitValue}`
          )}이고 ` +
          `${inlineMath(
            `f(${a})=${pointValue}`
          )}입니다. 극한값을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "limit",
            text: inlineMath(String(limitValue)),
          },
          {
            key: "point",
            text: inlineMath(String(pointValue)),
          },
          {
            key: "dne",
            text: "존재하지 않는다",
          },
        ],
        answer: "limit",
        solution: `극한은 ${inlineMath(
          `x=${a}`
        )} 주변에서 함수값이 향하는 값을 봅니다. ` +
          `${inlineMath(
            `f(${a})`
          )}와 무관하게 극한값은 ${inlineMath(
            String(limitValue)
          )}입니다.`,
        hintText:
          `빈 점은 주변 값이 향하는 곳이고, 채운 점은 실제 함수값입니다. ` +
          `극한에서는 빈 점의 높이를 보세요.`,
        visualization: {
          kind: "limit-point-example",
          focusX: a,
          limitValue,
          pointValue,
        },
        validityChecks: [
          {
            name: "limit-point-distinction",
            passed:
              limitValue !== pointValue,
            message:
              "극한값과 함수값을 구분하는 예제가 아닙니다.",
          },
        ],
      };
    },
  },

  {
    id: "infinite-limit",
    label: "유형 8 · 무한대 극한",
    difficulty: 3,

    generate() {
      const a = randomInteger(-3, 3);
      const coefficient = randomInteger(1, 5);

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{${coefficient}}{(${xMinus(a)})^2}`
        )}의 값을 판단하세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "+infinity",
            text: inlineMath("+\\infty"),
          },
          {
            key: "-infinity",
            text: inlineMath("-\\infty"),
          },
          {
            key: "zero",
            text: inlineMath("0"),
          },
          {
            key: "dne",
            text: "존재하지 않는다",
          },
        ],
        answer: "+infinity",
        solution: `분모는 양수인 상태로 ${inlineMath(
          "0"
        )}에 가까워지므로 함수값은 ${inlineMath(
          "+\\infty"
        )}로 커집니다.`,
        hintText:
          `${inlineMath(`x=${a}`)}에 가까워질수록 분모는 양수인 채로 ` +
          `${inlineMath("0")}에 가까워집니다. 그래프가 어느 방향으로 ` +
          `뻗는지 확인해보세요.`,
        visualization: {
          kind: "inverse-square",
          focusX: a,
          coefficient,
        },
        validityChecks: [
          {
            name: "positive-infinite-limit",
            passed:
              coefficient > 0 &&
              Number.isFinite(a),
            message:
              "양의 무한대 극한을 보장하는 계수 조건을 만족하지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "limit-law",
    label: "유형 9 · 극한의 성질",
    difficulty: 2,

    generate() {
      const fLimit = randomInteger(-4, 4);
      const gLimit = randomInteger(-4, 4);
      const answer = 2 * fLimit - 3 * gLimit;

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}f(x)=${fLimit}`
          )}, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}g(x)=${gLimit}`
          )}일 때 ` +
          `${inlineMath(
            "\\displaystyle\\lim_{x\\to a}\\{2f(x)-3g(x)\\}"
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution: `극한의 성질을 적용하면 ${inlineMath(
          `2\\times(${fLimit})-3\\times(${gLimit})=${answer}`
        )}입니다.`,
        hintText:
          `${inlineMath(
            `f(x)\\to ${fLimit},\\quad g(x)\\to ${gLimit}`
          )}를 식에 그대로 넣습니다.\n` +
          `현재 계산식은 ${inlineMath(
            `2\\times(${fLimit})-3\\times(${gLimit})`
          )}입니다. 각 곱셈을 먼저 계산한 뒤 빼세요.`,
        visualization: {
          kind: "limit-law-combination",
          focusX: 0,
          fLimit,
          gLimit,
          resultLimit: answer,
          note:
            "두 함수가 각각 향하는 높이를 확인한 뒤 계수를 곱해 결합하세요.",
        },
        validityChecks: [
          {
            name: "limit-law-answer",
            passed:
              answer ===
              2 * fLimit - 3 * gLimit,
            message:
              "극한의 선형성으로 계산한 값과 정답이 일치하지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "table-inference",
    label: "유형 10 · 표에서 극한 읽기",
    difficulty: 1,

    generate() {
      const a = randomInteger(-2, 2);
      const target = randomInteger(-4, 4);
      const xValues = [
        a - 0.1,
        a - 0.01,
        a + 0.01,
        a + 0.1,
      ];

      const yValues = [
        target - 0.1,
        target - 0.01,
        target + 0.01,
        target + 0.1,
      ];

      const table = displayMath(
        "\\begin{array}{c|cccc}" +
          `x&${xValues.join("&")}\\\\` +
          `f(x)&${yValues
            .map((value) => value.toFixed(2))
            .join("&")}` +
          "\\end{array}"
      );

      return {
        prompt:
          `${table}` +
          `표를 보고 ${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}}f(x)`
          )}를 추정하세요.`,
        inputMode: "short-answer",
        answer: target,
        solution: `${inlineMath(
          "x"
        )}가 ${inlineMath(
          String(a)
        )}의 양쪽에서 가까워질수록 ${inlineMath(
          "f(x)"
        )}는 ${inlineMath(
          String(target)
        )}에 가까워집니다.`,
        hintText:
          `표의 네 점을 좌표평면에 옮겼습니다. ${inlineMath(
            `x=${a}`
          )}의 양쪽 점들이 향하는 높이를 관찰하세요.`,
        visualization: {
          kind: "table-points",
          focusX: a,
          target,
          xValues,
          yValues,
        },
        validityChecks: [
          {
            name: "table-approaches-from-both-sides",
            passed:
              xValues.some((value) => value < a) &&
              xValues.some((value) => value > a) &&
              yValues.every(
                (value, index) =>
                  Math.abs(
                    Math.abs(value - target) -
                    Math.abs(xValues[index] - a)
                  ) < 1e-9
              ),
            message:
              "표의 값이 목표점의 양쪽에서 같은 값으로 수렴하지 않습니다.",
          },
        ],
      };
    },
  },
];

module.exports = {
  key: "calculus-limit-meaning",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
