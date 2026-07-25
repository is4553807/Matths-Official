const {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
  inlineMath,
  displayMath,
  signedNumber,
  xMinus,
} = require("./helpers");

function guaranteedChoices() {
  return [
    {
      key: "guaranteed",
      text: "존재가 보장된다",
    },
    {
      key: "not-guaranteed",
      text: "존재가 보장되지 않는다",
    },
  ];
}

const problemTypes = [
  {
    id: "algebra-of-continuous-functions",
    label: "유형 1 · 연속함수의 사칙연산",
    difficulty: 1,

    generate() {
      const a = randomInteger(-4, 4);

      return {
        prompt:
          `두 함수 ${inlineMath("f(x)")}, ${inlineMath(
            "g(x)"
          )}가 모두 ${inlineMath(
            `x=${a}`
          )}에서 연속일 때, 옳은 설명을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "sum-product",
            text:
              `${inlineMath("f(x)+g(x)")}와 ` +
              `${inlineMath("f(x)g(x)")}는 모두 연속이다.`,
          },
          {
            key: "quotient-always",
            text:
              `${inlineMath(
                "\\dfrac{f(x)}{g(x)}"
              )}는 ${inlineMath(`g(${a})=0`)}이어도 항상 연속이다.`,
          },
          {
            key: "difference-never",
            text:
              `${inlineMath("f(x)-g(x)")}는 항상 불연속이다.`,
          },
          {
            key: "reciprocal-always",
            text:
              `${inlineMath(
                "\\dfrac{1}{f(x)}"
              )}는 함수값과 관계없이 항상 연속이다.`,
          },
        ],
        answer: "sum-product",
        solution:
          "연속함수의 합, 차, 곱은 연속입니다. 몫과 역수는 " +
          "해당 점에서 분모가 0이 아니라는 조건이 추가로 필요합니다.",
        hintText:
          `${inlineMath(`x=${a}`)}에서 연속인 두 함수의 합·차·곱은 ` +
          `추가 조건 없이 연속입니다.\n` +
          `보기 중 분모가 생기는 몫이나 역수에는 분모의 함수값이 ` +
          `0이 아니라는 조건이 빠졌는지 확인하세요.`,
        visualization: {
          kind: "limit-law-combination",
          focusX: a,
          fLimit: 2,
          gLimit: -1,
          resultLimit: 1,
          note:
            "연속인 두 곡선은 같은 x에서 합·차·곱을 해도 끊기지 않습니다.",
        },
      };
    },
  },

  {
    id: "quotient-continuity-condition",
    label: "유형 2 · 몫의 연속 조건",
    difficulty: 2,

    generate() {
      const a = randomInteger(-4, 4);
      const fValue = randomInteger(-5, 5);
      const denominatorIsZero =
        Math.random() >= 0.5;
      const gValue = denominatorIsZero
        ? 0
        : nonZeroInteger(-5, 5);

      return {
        prompt:
          `${inlineMath("f(x)")}, ${inlineMath(
            "g(x)"
          )}가 ${inlineMath(`x=${a}`)}에서 연속이고 ` +
          `${inlineMath(`f(${a})=${fValue}`)}, ` +
          `${inlineMath(`g(${a})=${gValue}`)}입니다. ` +
          `${inlineMath(
            `h(x)=\\dfrac{f(x)}{g(x)}`
          )}가 ${inlineMath(`x=${a}`)}에서 연속인지 판단하세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "continuous",
            text: "연속이다",
          },
          {
            key: "not-continuous",
            text: "연속이 아니다",
          },
        ],
        answer: denominatorIsZero
          ? "not-continuous"
          : "continuous",
        solution: denominatorIsZero
          ? `${inlineMath(`g(${a})=0`)}이므로 몫이 그 점에서 ` +
            "정의되지 않아 연속이 아닙니다."
          : `${inlineMath(`g(${a})=${gValue}\\ne0`)}이므로 ` +
            "연속함수의 몫도 그 점에서 연속입니다.",
        hintText:
          `분자 ${inlineMath(
            `f(${a})=${fValue}`
          )}보다 분모를 먼저 봅니다.\n` +
          `현재 ${inlineMath(
            `g(${a})=${gValue}`
          )}이므로 이 값이 0인지 확인해 몫의 연속 성질을 ` +
          `적용할 수 있는지 판단하세요.`,
        visualization: {
          kind: "rational-continuity",
          focusX: a,
          pole: denominatorIsZero
            ? a
            : a + (a < 3 ? 2 : -2),
          numeratorConstant: fValue,
          note: denominatorIsZero
            ? "분모가 0인 표시점에서는 몫의 그래프가 정의되지 않습니다."
            : "표시점에서 분모가 0이 아니므로 몫의 그래프가 이어집니다.",
        },
      };
    },
  },

  {
    id: "composition-continuity",
    label: "유형 3 · 합성함수의 연속",
    difficulty: 2,

    generate() {
      const a = randomInteger(-3, 3);
      const b = randomInteger(-4, 4);
      const value = randomInteger(-6, 6);

      return {
        prompt:
          `${inlineMath("g(x)")}가 ${inlineMath(
            `x=${a}`
          )}에서 연속이고 ${inlineMath(`g(${a})=${b}`)}, ` +
          `${inlineMath("f(x)")}가 ${inlineMath(
            `x=${b}`
          )}에서 연속이며 ${inlineMath(`f(${b})=${value}`)}입니다. ` +
          `${inlineMath(
            `\\displaystyle\\lim_{x\\to ${a}}f(g(x))`
          )}를 구하세요.`,
        inputMode: "short-answer",
        answer: value,
        solution:
          `연속성에 의해 ${inlineMath(
            `\\lim_{x\\to ${a}}g(x)=g(${a})=${b}`
          )}이고, 다시 ${inlineMath("f")}의 연속성을 적용하면 ` +
          `${inlineMath(
            `\\lim_{x\\to ${a}}f(g(x))=f(${b})=${value}`
          )}입니다.`,
        hintText:
          `안쪽 함수부터 보면 연속성에 의해 ${inlineMath(
            `g(x)\\to g(${a})=${b}`
          )}입니다.\n` +
          `따라서 바깥 함수의 입력은 ${inlineMath(
            String(b)
          )}가 되고, 문제에 주어진 ${inlineMath(
            `f(${b})=${value}`
          )}를 이용할 수 있습니다.`,
        visualization: {
          kind: "continuous-interval",
          focusX: a,
          left: a - 2,
          right: a + 2,
          leftValue: value - 2,
          midpoint: a,
          midpointValue: value,
          rightValue: value + 2,
          target: value,
          note:
            "안쪽 함수가 b로 다가가면 바깥 연속함수의 값은 f(b)로 이어집니다.",
        },
      };
    },
  },

  {
    id: "extreme-value-theorem",
    label: "유형 4 · 최대·최소 정리",
    difficulty: 1,

    generate() {
      const a = randomInteger(-5, -1);
      const b = randomInteger(1, 5);

      return {
        prompt:
          `함수 ${inlineMath("f(x)")}가 닫힌구간 ${inlineMath(
            `[${a},${b}]`
          )}에서 연속일 때 반드시 보장되는 것을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "both-extremes",
            text: "최댓값과 최솟값을 모두 갖는다.",
          },
          {
            key: "increasing",
            text: "구간 전체에서 증가한다.",
          },
          {
            key: "one-root",
            text: "방정식 f(x)=0의 해를 정확히 하나 갖는다.",
          },
          {
            key: "endpoints",
            text: "최댓값과 최솟값을 모두 끝점에서 갖는다.",
          },
        ],
        answer: "both-extremes",
        solution:
          "닫힌구간에서 연속인 함수는 최대·최소 정리에 의해 " +
          "그 구간에서 최댓값과 최솟값을 모두 갖습니다.",
        hintText:
          `조건은 “${inlineMath(
            `[${a},${b}]`
          )}라는 닫힌구간”과 “그 구간에서 연속”입니다.\n` +
          `최대·최소 정리가 정확히 보장하는 것은 값의 위치나 ` +
          `근의 개수가 아니라 최댓값과 최솟값의 존재입니다.`,
        visualization: {
          kind: "continuous-interval",
          focusX: (a + b) / 2,
          left: a,
          right: b,
          leftValue: 1,
          midpoint: (a + b) / 2,
          midpointValue: -2,
          rightValue: 2,
          note:
            "닫힌구간의 연속인 곡선에는 가장 높은 점과 가장 낮은 점이 모두 존재합니다.",
        },
      };
    },
  },

  {
    id: "quadratic-extreme-value",
    label: "유형 5 · 닫힌구간의 최대·최소 계산",
    difficulty: 2,

    generate() {
      const vertexX = randomInteger(-3, 3);
      const vertexY = randomInteger(-4, 4);
      const leftDistance = randomInteger(1, 4);
      const rightDistance = randomInteger(1, 4);
      const intervalStart =
        vertexX - leftDistance;
      const intervalEnd =
        vertexX + rightDistance;
      const asksMaximum = Math.random() >= 0.5;
      const minimum = vertexY;
      const maximum =
        vertexY +
        Math.max(
          leftDistance ** 2,
          rightDistance ** 2
        );
      const answer = asksMaximum
        ? maximum
        : minimum;

      return {
        prompt:
          `${inlineMath(
            `f(x)=(${xMinus(vertexX)})^2${signedNumber(
              vertexY
            )}`
          )}일 때, 닫힌구간 ${inlineMath(
            `[${intervalStart},${intervalEnd}]`
          )}에서의 ${asksMaximum ? "최댓값" : "최솟값"}을 구하세요.`,
        inputMode: "short-answer",
        answer,
        solution:
          `꼭짓점은 ${inlineMath(
            `(${vertexX},${vertexY})`
          )}이므로 최솟값은 ${inlineMath(
            String(minimum)
          )}입니다. 두 끝점의 함수값도 비교하면 최댓값은 ` +
          `${inlineMath(String(maximum))}입니다. 따라서 물은 값은 ` +
          `${inlineMath(String(answer))}입니다.`,
        hintText:
          "위로 열린 포물선이므로 꼭짓점과 닫힌구간의 두 끝점, " +
          "총 세 곳의 높이를 비교하세요.",
        visualization: {
          kind: "polynomial",
          focusX: vertexX,
          coefficients: {
            quadratic: 1,
            linear: -2 * vertexX,
            constant:
              vertexX ** 2 + vertexY,
          },
        },
      };
    },
  },

  {
    id: "intermediate-target-value",
    label: "유형 6 · 중간값의 존재 판정",
    difficulty: 2,

    generate() {
      const a = randomInteger(-5, -1);
      const b = randomInteger(1, 5);
      const firstValue = randomInteger(-6, 0);
      const secondValue = randomInteger(2, 8);
      const isBetween = Math.random() >= 0.5;
      const target = isBetween
        ? randomInteger(
            firstValue + 1,
            secondValue - 1
          )
        : secondValue + randomInteger(1, 4);

      return {
        prompt:
          `${inlineMath("f(x)")}가 ${inlineMath(
            `[${a},${b}]`
          )}에서 연속이고, ${inlineMath(
            `f(${a})=${firstValue}`
          )}, ${inlineMath(
            `f(${b})=${secondValue}`
          )}입니다. ${inlineMath(
            `f(c)=${target}`
          )}인 ${inlineMath(`c\\in(${a},${b})`)}의 존재가 ` +
          "사잇값 정리로 보장됩니까?",
        inputMode: "multiple-choice",
        choices: guaranteedChoices(),
        answer: isBetween
          ? "guaranteed"
          : "not-guaranteed",
        solution: isBetween
          ? `${inlineMath(String(target))}은 두 끝점의 함수값 ` +
            `${inlineMath(String(firstValue))}과 ${inlineMath(
              String(secondValue)
            )} 사이에 있으므로 존재가 보장됩니다.`
          : `${inlineMath(String(target))}은 두 끝점의 함수값 사이에 ` +
            "있지 않으므로 사잇값 정리만으로는 존재를 보장할 수 없습니다.",
        hintText:
          `두 끝점의 높이는 ${inlineMath(
            String(firstValue)
          )}와 ${inlineMath(
            String(secondValue)
          )}이고 목표 높이는 ${inlineMath(
            String(target)
          )}입니다.\n` +
          `${inlineMath(
            `${firstValue}<${target}<${secondValue}`
          )}가 성립하는지 그대로 비교하세요.`,
        visualization: {
          kind: "continuous-interval",
          focusX: (a + b) / 2,
          left: a,
          right: b,
          leftValue: firstValue,
          rightValue: secondValue,
          target,
          note: isBetween
            ? "목표 높이가 두 끝값 사이에 있어 연속인 곡선과 만납니다."
            : "목표 높이가 두 끝값 바깥에 있어 사잇값 정리만으로 교점을 보장할 수 없습니다.",
        },
        validityChecks: [
          {
            name: "intermediate-target-condition",
            passed: isBetween
              ? firstValue < target &&
                target < secondValue
              : target < firstValue ||
                target > secondValue,
            message:
              "목표값이 의도한 사잇값 범위와 맞지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "root-from-sign-change",
    label: "유형 7 · 부호 변화와 근의 존재",
    difficulty: 2,

    generate() {
      const a = randomInteger(-5, -1);
      const b = randomInteger(1, 5);
      const firstValue = -randomInteger(1, 6);
      const secondValue = randomInteger(1, 6);

      return {
        prompt:
          `${inlineMath("f(x)")}가 ${inlineMath(
            `[${a},${b}]`
          )}에서 연속이고 ${inlineMath(
            `f(${a})=${firstValue}`
          )}, ${inlineMath(
            `f(${b})=${secondValue}`
          )}일 때 반드시 옳은 것을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "root-exists",
            text:
              `${inlineMath(`f(c)=0`)}인 ` +
              `${inlineMath(`c\\in(${a},${b})`)}가 적어도 하나 존재한다.`,
          },
          {
            key: "one-root",
            text: "근이 정확히 하나만 존재한다.",
          },
          {
            key: "no-root",
            text: "구간 안에 근이 존재하지 않는다.",
          },
          {
            key: "endpoint-root",
            text: "두 끝점 중 하나가 반드시 근이다.",
          },
        ],
        answer: "root-exists",
        solution:
          `끝점의 함수값 부호가 서로 다르고 함수가 연속이므로, ` +
          `사잇값 정리에 의해 ${inlineMath(
            `f(c)=0`
          )}인 점이 열린구간 안에 적어도 하나 존재합니다.`,
        hintText:
          `${inlineMath(
            `f(${a})=${firstValue}<0`
          )}이고 ${inlineMath(
            `f(${b})=${secondValue}>0`
          )}입니다.\n` +
          `연속인 그래프가 음수 높이에서 양수 높이로 이동하면 ` +
          `중간 높이 0을 적어도 한 번 지나야 합니다.`,
        visualization: {
          kind: "continuous-interval",
          focusX: (a + b) / 2,
          left: a,
          right: b,
          leftValue: firstValue,
          rightValue: secondValue,
          target: 0,
          note:
            "음수 높이에서 양수 높이로 이어지는 곡선은 x축을 적어도 한 번 지납니다.",
        },
        validityChecks: [
          {
            name: "opposite-endpoint-signs",
            passed:
              firstValue * secondValue < 0,
            message:
              "근의 존재 문제에서 끝점 함수값의 부호가 다르지 않습니다.",
          },
        ],
      };
    },
  },

  {
    id: "polynomial-root-interval",
    label: "유형 8 · 다항방정식의 근이 있는 구간",
    difficulty: 3,

    generate() {
      const lower = randomInteger(1, 3);
      const lowerCube = lower ** 3;
      const upperCube = (lower + 1) ** 3;
      const constant = randomInteger(
        lowerCube + 1,
        upperCube - 1
      );

      return {
        prompt:
          `방정식 ${inlineMath(
            `x^3-${constant}=0`
          )}의 양의 실근이 있음을 사잇값 정리로 보일 수 있는 ` +
          "구간을 고르세요.",
        inputMode: "multiple-choice",
        choices: [
          {
            key: "correct",
            text: inlineMath(
              `[${lower},${lower + 1}]`
            ),
          },
          {
            key: "right",
            text: inlineMath(
              `[${lower + 1},${lower + 2}]`
            ),
          },
          {
            key: "left",
            text: inlineMath(`[0,${lower}]`),
          },
          {
            key: "negative",
            text: inlineMath(`[-${lower},0]`),
          },
        ],
        answer: "correct",
        solution:
          `${inlineMath(
            `${lower ** 3}-${constant}<0`
          )}이고 ${inlineMath(
            `${(lower + 1) ** 3}-${constant}>0`
          )}입니다. 다항함수는 연속이므로 ${inlineMath(
            `[${lower},${lower + 1}]`
          )} 안에 근이 존재합니다.`,
        hintText:
          `${inlineMath(
            `f(x)=x^3-${constant}`
          )}로 놓습니다.\n` +
          `${inlineMath(
            `f(${lower})=${lower ** 3}-${constant}<0`
          )}, ${inlineMath(
          `f(${lower + 1})=${(lower + 1) ** 3}-${constant}>0`
          )}이므로 이 두 점을 양 끝으로 갖는 구간을 찾으세요.`,
        visualization: {
          kind: "continuous-interval",
          focusX: lower + 0.5,
          left: lower,
          right: lower + 1,
          coefficients: [
            -constant,
            0,
            0,
            1,
          ],
          target: 0,
          note:
            "구간의 양 끝에서 함수값의 부호가 바뀌므로 그 사이에 x축과의 교점이 있습니다.",
        },
        validityChecks: [
          {
            name: "root-bracketing-interval",
            passed:
              lowerCube < constant &&
              constant < upperCube,
            message:
              "선택한 구간이 다항방정식의 근을 끼우지 못합니다.",
          },
        ],
      };
    },
  },

  {
    id: "bisection-step",
    label: "유형 9 · 사잇값 정리로 구간 좁히기",
    difficulty: 3,

    generate() {
      const a = randomInteger(-4, 0);
      const midpoint = a + 2;
      const b = a + 4;
      const rootInLeftHalf =
        Math.random() >= 0.5;
      const firstValue = -randomInteger(1, 6);
      const midpointValue = rootInLeftHalf
        ? randomInteger(1, 6)
        : -randomInteger(1, 6);
      const lastValue = randomInteger(1, 6);

      return {
        prompt:
          `${inlineMath("f(x)")}가 ${inlineMath(
            `[${a},${b}]`
          )}에서 연속이고 ${inlineMath(
            `f(${a})=${firstValue}`
          )}, ${inlineMath(
            `f(${midpoint})=${midpointValue}`
          )}, ${inlineMath(
            `f(${b})=${lastValue}`
          )}입니다. ${inlineMath(
            "f(x)=0"
          )}의 근이 있음을 보장하면서 구간을 절반으로 좁힌 것을 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "left",
            text: inlineMath(`[${a},${midpoint}]`),
          },
          {
            key: "right",
            text: inlineMath(`[${midpoint},${b}]`),
          },
          {
            key: "outside-left",
            text: inlineMath(
              `[${a - 2},${a}]`
            ),
          },
          {
            key: "outside-right",
            text: inlineMath(
              `[${b},${b + 2}]`
            ),
          },
        ],
        answer: rootInLeftHalf
          ? "left"
          : "right",
        solution:
          `함수값의 부호가 바뀌는 두 점은 ` +
          (rootInLeftHalf
            ? `${inlineMath(`x=${a}`)}와 ${inlineMath(
                `x=${midpoint}`
              )}`
            : `${inlineMath(
                `x=${midpoint}`
              )}와 ${inlineMath(`x=${b}`)}`) +
          `입니다. 따라서 ${inlineMath(
            rootInLeftHalf
              ? `[${a},${midpoint}]`
              : `[${midpoint},${b}]`
          )} 안에 근이 존재합니다.`,
        hintText:
          `왼쪽 절반의 끝값은 ${inlineMath(
            `${firstValue},\\ ${midpointValue}`
          )}, 오른쪽 절반의 끝값은 ${inlineMath(
            `${midpointValue},\\ ${lastValue}`
          )}입니다.\n` +
          `두 값의 부호가 서로 다른 쪽 구간에서만 근의 존재가 ` +
          `보장됩니다.`,
        visualization: {
          kind: "continuous-interval",
          focusX: midpoint,
          left: a,
          right: b,
          leftValue: firstValue,
          midpoint,
          midpointValue,
          rightValue: lastValue,
          target: 0,
          selectedInterval: rootInLeftHalf
            ? [a, midpoint]
            : [midpoint, b],
          note:
            "세 점 중 함수값의 부호가 바뀌는 이웃한 두 점을 새 구간으로 선택하세요.",
        },
        validityChecks: [
          {
            name: "single-bisection-sign-change",
            passed: rootInLeftHalf
              ? firstValue * midpointValue < 0 &&
                midpointValue * lastValue > 0
              : firstValue * midpointValue > 0 &&
                midpointValue * lastValue < 0,
            message:
              "이분한 두 구간의 부호 변화 조건이 의도와 다릅니다.",
          },
        ],
      };
    },
  },

  {
    id: "missing-ivt-hypothesis",
    label: "유형 10 · 사잇값 정리의 조건",
    difficulty: 2,

    generate() {
      const jumpX = randomInteger(-4, 4);
      const leftValue = -randomInteger(1, 5);
      const rightValue = randomInteger(1, 5);
      const intervalRadius = randomInteger(1, 4);
      const leftEndpoint =
        jumpX - intervalRadius;
      const rightEndpoint =
        jumpX + intervalRadius;
      const definition =
        "f(x)=\\begin{cases}" +
        `${leftValue},&x<${jumpX}\\\\` +
        `${rightValue},&x\\ge${jumpX}` +
        "\\end{cases}";

      return {
        prompt:
          `${displayMath(definition)}` +
          `${inlineMath(
            `f(${leftEndpoint})=${leftValue}<0<f(${rightEndpoint})=${rightValue}`
          )}이지만 ` +
          `${inlineMath("f(c)=0")}인 ${inlineMath(
            `c\\in(${leftEndpoint},${rightEndpoint})`
          )}는 없습니다. 사잇값 정리를 적용할 수 없는 이유를 고르세요.`,
        inputMode: "multiple-choice",
        choices: [
          {
            key: "not-continuous",
            text:
              `${inlineMath("f(x)")}가 ${inlineMath(
                `[${leftEndpoint},${rightEndpoint}]`
              )}에서 연속이 아니기 때문이다.`,
          },
          {
            key: "not-closed",
            text:
              `${inlineMath(
                `[${leftEndpoint},${rightEndpoint}]`
              )}이 닫힌구간이 아니기 때문이다.`,
          },
          {
            key: "same-sign",
            text: "두 끝점의 함수값 부호가 같기 때문이다.",
          },
          {
            key: "zero-endpoint",
            text: "끝점 중 하나가 0이기 때문이다.",
          },
        ],
        answer: "not-continuous",
        solution:
          `함수는 ${inlineMath(`x=${jumpX}`)}에서 ${leftValue}에서 ${rightValue}로 뛰어 ` +
          "올라 불연속입니다. 연속이라는 핵심 가정이 없으므로 " +
          "중간 높이 0을 지나지 않아도 됩니다.",
        hintText:
          `그래프가 ${leftValue}의 높이에서 ${rightValue}의 높이로 이동할 때 ` +
          "중간을 지나지 않고 점프하는 지점을 찾으세요.",
        visualization: {
          kind: "one-sided-limits",
          focusX: jumpX,
          leftLimit: leftValue,
          rightLimit: rightValue,
        },
      };
    },
  },
];

module.exports = {
  key: "calculus-continuous-function-properties",
  requiredDistinctTypes: 5,
  problemTypes,
  isCorrectAnswer,
};
