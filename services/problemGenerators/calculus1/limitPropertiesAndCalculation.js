const {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
  inlineMath,
  xMinus,
  linearExpression,
  quadraticExpression,
  fractionTex,
  linearCombinationTex,
} = require("./helpers");

const problemTypes = [
  {
    id: "sum-and-difference-law",
    label: "유형 1 · 합과 차의 극한",
    difficulty: 1,

    generate() {
      const fLimit = randomInteger(-5, 5);
      const gLimit = randomInteger(-5, 5);
      const fCoefficient = nonZeroInteger(-3, 3);
      const gCoefficient = nonZeroInteger(-3, 3);
      const expression = linearCombinationTex([
        {
          coefficient: fCoefficient,
          expression: "f(x)",
        },
        {
          coefficient: gCoefficient,
          expression: "g(x)",
        },
      ]);
      const answer =
        fCoefficient * fLimit +
        gCoefficient * gLimit;

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}f(x)=${fLimit}`
          )}, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}g(x)=${gLimit}`
          )}일 때, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}\\{${expression}\\}`
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `합·차와 상수배의 극한 성질을 적용하면 ` +
          `${inlineMath(
            `${fCoefficient}\\times(${fLimit})` +
              `${gCoefficient < 0 ? "" : "+"}` +
              `${gCoefficient}\\times(${gLimit})=${answer}`
          )}입니다.`,
        hintText:
          `1단계: ${inlineMath(
            `f(x)\\to ${fLimit},\\quad g(x)\\to ${gLimit}`
          )}로 바꿉니다.\n` +
          `2단계: 현재 식은 ${inlineMath(
            `${fCoefficient}(${fLimit})` +
              `${gCoefficient < 0 ? "" : "+"}` +
              `${gCoefficient}(${gLimit})`
          )}가 됩니다. 이제 마지막 정수 계산만 해보세요.`,
        visualization: null,
      };
    },
  },

  {
    id: "product-law",
    label: "유형 2 · 곱의 극한",
    difficulty: 1,

    generate() {
      const fLimit = nonZeroInteger(-5, 5);
      const gLimit = nonZeroInteger(-5, 5);
      const answer = fLimit * gLimit;

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}f(x)=${fLimit}`
          )}, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}g(x)=${gLimit}`
          )}일 때, ` +
          `${inlineMath(
            "\\displaystyle\\lim_{x\\to a}f(x)g(x)"
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `곱의 극한은 각 극한값의 곱이므로 ` +
          `${inlineMath(
            `(${fLimit})\\times(${gLimit})=${answer}`
          )}입니다.`,
        hintText:
          `곱의 극한은 각 극한값의 곱으로 바꿀 수 있습니다.\n` +
          `현재 숫자를 넣으면 ${inlineMath(
            `(${fLimit})\\times(${gLimit})`
          )}입니다. 부호부터 확인한 뒤 곱하세요.`,
        visualization: null,
      };
    },
  },

  {
    id: "quotient-law",
    label: "유형 3 · 몫의 극한",
    difficulty: 2,

    generate() {
      const fLimit = nonZeroInteger(-6, 6);
      const gLimit = nonZeroInteger(-6, 6);
      const answer = fLimit / gLimit;
      const answerTex = fractionTex(
        fLimit,
        gLimit
      );

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}f(x)=${fLimit}`
          )}, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}g(x)=${gLimit}`
          )}일 때, ` +
          `${inlineMath(
            "\\displaystyle\\lim_{x\\to a}\\frac{f(x)}{g(x)}"
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `${inlineMath(
            `\\lim_{x\\to a}g(x)=${gLimit}\\ne0`
          )}이므로 몫의 성질을 적용할 수 있습니다. ` +
          `정답은 ${inlineMath(answerTex)}입니다.`,
        hintText:
          `분모의 극한값은 ${inlineMath(
            String(gLimit)
          )}이므로 0이 아닙니다.\n` +
          `따라서 몫의 성질을 적용해 ${inlineMath(
            `\\frac{${fLimit}}{${gLimit}}`
          )}를 약분하면 됩니다.`,
        visualization: null,
        validityChecks: [
          {
            name: "non-zero-limit-denominator",
            passed: gLimit !== 0,
            message:
              "몫의 극한에서 분모의 극한값은 0일 수 없습니다.",
          },
        ],
      };
    },
  },

  {
    id: "power-and-polynomial-law",
    label: "유형 4 · 거듭제곱과 다항식",
    difficulty: 2,

    generate() {
      const fLimit = randomInteger(-3, 3);
      const quadratic = nonZeroInteger(-3, 3);
      const linear = randomInteger(-4, 4);
      const constant = randomInteger(-5, 5);
      const expression = quadraticExpression(
        quadratic,
        linear,
        constant,
        "f(x)"
      );
      const answer =
        quadratic * fLimit * fLimit +
        linear * fLimit +
        constant;

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}f(x)=${fLimit}`
          )}일 때, ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to a}\\{${expression}\\}`
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `거듭제곱, 합·차, 상수배의 극한 성질을 차례로 적용해 ` +
          `${inlineMath(
            `${quadratic}(${fLimit})^2` +
              `${linear < 0 ? "" : "+"}${linear}(${fLimit})` +
              `${constant < 0 ? "" : "+"}${constant}` +
              `=${answer}`
          )}을 얻습니다.`,
        hintText:
          `${inlineMath(
            `f(x)\\to ${fLimit}`
          )}이므로 식 안의 모든 ${inlineMath(
            "f(x)"
          )}를 ${inlineMath(`(${fLimit})`)}로 바꿉니다.\n` +
          `현재 계산식은 ${inlineMath(
            `${quadratic}(${fLimit})^2` +
              `${linear < 0 ? "" : "+"}${linear}(${fLimit})` +
              `${constant < 0 ? "" : "+"}${constant}`
          )}입니다. 제곱을 먼저 계산하세요.`,
        visualization: null,
      };
    },
  },

  {
    id: "rational-direct-substitution",
    label: "유형 5 · 유리함수 직접 대입",
    difficulty: 1,

    generate() {
      const a = randomInteger(-3, 3);
      const numeratorSlope =
        nonZeroInteger(-4, 4);
      const numeratorConstant =
        randomInteger(-5, 5);
      const denominatorSlope =
        nonZeroInteger(-3, 3);
      let denominatorConstant =
        randomInteger(-5, 5);

      while (
        denominatorSlope * a +
          denominatorConstant ===
        0
      ) {
        denominatorConstant =
          randomInteger(-5, 5);
      }

      const numeratorValue =
        numeratorSlope * a +
        numeratorConstant;
      const denominatorValue =
        denominatorSlope * a +
        denominatorConstant;
      const answer =
        numeratorValue / denominatorValue;
      const answerTex = fractionTex(
        numeratorValue,
        denominatorValue
      );

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{${linearExpression(
              numeratorSlope,
              numeratorConstant
            )}}{${linearExpression(
              denominatorSlope,
              denominatorConstant
            )}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `분모에 ${inlineMath(`x=${a}`)}를 대입한 값이 ` +
          `${inlineMath(String(denominatorValue))}로 0이 아니므로 ` +
          `직접 대입할 수 있습니다. 정답은 ` +
          `${inlineMath(answerTex)}입니다.`,
        hintText:
          `${inlineMath(`x=${a}`)}를 넣으면 분자는 ${inlineMath(
            String(numeratorValue)
          )}, 분모는 ${inlineMath(
            String(denominatorValue)
          )}가 됩니다.\n` +
          `분모가 0이 아니므로 식을 변형하지 말고 ${inlineMath(
          `\\frac{${numeratorValue}}{${denominatorValue}}`
          )}를 정리하세요.`,
        visualization: null,
        validityChecks: [
          {
            name: "non-zero-substitution-denominator",
            passed: denominatorValue !== 0,
            message:
              "직접 대입 문제의 분모가 0이 되었습니다.",
          },
        ],
      };
    },
  },

  {
    id: "difference-of-squares",
    label: "유형 6 · 제곱의 차 약분",
    difficulty: 2,

    generate() {
      const a = nonZeroInteger(-6, 6);
      const answer = 2 * a;

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{x^2-${a ** 2}}{${xMinus(a)}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `${inlineMath(
            `x^2-${a ** 2}=(${xMinus(a)})(x${a < 0 ? "" : "+"}${a})`
          )}로 인수분해한 뒤 공통 인자를 약분합니다. ` +
          `남은 식에 ${inlineMath(`x=${a}`)}를 대입하면 ` +
          `${inlineMath(String(answer))}입니다.`,
        hintText:
          `${inlineMath("A^2-B^2=(A-B)(A+B)")}를 이용해 ` +
          "분모와 같은 인자를 찾아보세요.",
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
    id: "expanded-factor-cancellation",
    label: "유형 7 · 이차식 인수분해",
    difficulty: 3,

    generate() {
      const a = nonZeroInteger(-4, 4);
      const slope = nonZeroInteger(-3, 3);
      const constant = randomInteger(-5, 5);
      const quadratic = slope;
      const linear = constant - slope * a;
      const expandedConstant = -a * constant;
      const numerator = quadraticExpression(
        quadratic,
        linear,
        expandedConstant
      );
      const answer = slope * a + constant;

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{${numerator}}{${xMinus(a)}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `분자를 ${inlineMath(
            `(${xMinus(a)})(${linearExpression(
              slope,
              constant
            )})`
          )}로 인수분해합니다. 공통 인자를 약분한 뒤 ` +
          `${inlineMath(`x=${a}`)}를 대입하면 정답은 ` +
          `${inlineMath(String(answer))}입니다.`,
        hintText:
          `분자에 ${inlineMath(`x=${a}`)}를 대입하면 0입니다. ` +
          `따라서 ${inlineMath(xMinus(a))}가 분자의 인수입니다.`,
        visualization: {
          kind: "hole-linear",
          focusX: a,
          slope,
          intercept: constant,
        },
      };
    },
  },

  {
    id: "root-rationalization",
    label: "유형 8 · 무리식 유리화",
    difficulty: 3,

    generate() {
      const root = randomInteger(2, 6);
      const a = root ** 2;
      const answer = 1 / (2 * root);

      return {
        prompt: `${inlineMath(
          `\\displaystyle\\lim_{x\\to ${a}}` +
            `\\frac{\\sqrt{x}-${root}}{x-${a}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `분자와 분모에 ${inlineMath(
            `\\sqrt{x}+${root}`
          )}를 이용해 유리화하면 ${inlineMath(
            `\\frac{1}{\\sqrt{x}+${root}}`
          )}이 됩니다. 따라서 정답은 ${inlineMath(
            `\\frac{1}{${2 * root}}`
          )}입니다.`,
        hintText:
          "분자의 켤레식을 곱하면 분자에 있던 제곱근의 차가 " +
          "분모와 같은 인자로 바뀝니다.",
        visualization: {
          kind: "rationalized-root",
          focusX: a,
          root,
        },
        validityChecks: [
          {
            name: "perfect-square-focus",
            passed:
              a === root ** 2 && root > 0,
            message:
              "유리화 문제의 접근점과 제곱근 조건이 맞지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "parameter-for-finite-limit",
    label: "유형 9 · 극한값으로 매개변수 구하기",
    difficulty: 3,

    generate() {
      const a = nonZeroInteger(-4, 4);
      const parameter = randomInteger(-5, 5);
      const target = a + parameter;
      const linearCoefficient =
        a > 0
          ? `(m-${a})x`
          : `(m+${Math.abs(a)})x`;
      const constantTerm =
        a > 0
          ? `-${a}m`
          : `+${Math.abs(a)}m`;
      const numerator =
        `x^2+${linearCoefficient}${constantTerm}`;

      return {
        prompt:
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}}` +
              `\\frac{${numerator}}{${xMinus(a)}}=${target}`
          )}일 때, 상수 ${inlineMath("m")}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer: parameter,
        solution:
          `분자는 ${inlineMath(
            `(${xMinus(a)})(x+m)`
          )}로 인수분해됩니다. 약분한 식의 극한은 ` +
          `${inlineMath(`${a}+m=${target}`)}이므로 ` +
          `${inlineMath(`m=${parameter}`)}입니다.`,
        hintText:
          `분자에서 ${inlineMath(xMinus(a))}를 인수로 묶은 뒤, ` +
          "약분하고 남은 일차식의 극한을 이용하세요.",
        visualization: {
          kind: "hole-linear",
          focusX: a,
          slope: 1,
          intercept: parameter,
        },
      };
    },
  },

  {
    id: "infinity-leading-coefficients",
    label: "유형 10 · 무한대에서 최고차항 비교",
    difficulty: 3,

    generate() {
      const numeratorLeading =
        nonZeroInteger(-5, 5);
      const denominatorLeading =
        nonZeroInteger(-5, 5);
      const numerator = quadraticExpression(
        numeratorLeading,
        randomInteger(-5, 5),
        randomInteger(-5, 5)
      );
      const denominator = quadraticExpression(
        denominatorLeading,
        randomInteger(-5, 5),
        randomInteger(-5, 5)
      );
      const answer =
        numeratorLeading /
        denominatorLeading;
      const answerTex = fractionTex(
        numeratorLeading,
        denominatorLeading
      );

      return {
        prompt: `${inlineMath(
          "\\displaystyle\\lim_{x\\to\\infty}" +
            `\\frac{${numerator}}{${denominator}}`
        )}의 값을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `분자와 분모를 ${inlineMath("x^2")}으로 나누면 ` +
          `낮은 차수의 항은 모두 0으로 갑니다. 따라서 정답은 ` +
          `최고차항 계수의 비 ${inlineMath(answerTex)}입니다.`,
        hintText:
          `분자와 분모의 최고차항은 각각 ${inlineMath(
            `${numeratorLeading}x^2`
          )}, ${inlineMath(
            `${denominatorLeading}x^2`
          )}입니다.\n` +
          `${inlineMath("x^2")}으로 나누면 낮은 차수의 항은 0으로 ` +
          `가므로 계수의 비 ${inlineMath(
          `\\frac{${numeratorLeading}}{${denominatorLeading}}`
          )}만 정리하면 됩니다.`,
        visualization: null,
        validityChecks: [
          {
            name: "non-zero-leading-coefficients",
            passed:
              numeratorLeading !== 0 &&
              denominatorLeading !== 0,
            message:
              "최고차항 계수는 0일 수 없습니다.",
          },
        ],
      };
    },
  },
];

module.exports = {
  key: "calculus-limit-properties-calculation",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
