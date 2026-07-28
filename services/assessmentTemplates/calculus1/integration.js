const {
  randomInteger,
  choose,
  fraction,
  polynomialTex,
  linearFactor,
  signed,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId = "calculus-1";
const unitId = "integration";
const differentiationConceptIds = [
  "calculus-1-02-01",
  "calculus-1-02-02",
  "calculus-1-02-03",
  "calculus-1-02-04",
  "calculus-1-02-05",
  "calculus-1-02-06",
  "calculus-1-02-07",
  "calculus-1-02-08",
  "calculus-1-02-09",
  "calculus-1-02-10",
];
const requiredConceptIds = [
  "calculus-1-03-01",
  "calculus-1-03-02",
  "calculus-1-03-03",
  "calculus-1-03-04",
  "calculus-1-03-05",
  "calculus-1-03-06",
];

function antiderivativeValue(
  derivativeCoefficients,
  constant,
  x
) {
  return derivativeCoefficients.reduce(
    (sum, coefficient, exponent) =>
      sum +
      (
        coefficient /
        (exponent + 1)
      ) *
        x ** (exponent + 1),
    constant
  );
}

const families = [
  {
    id: "derivative-to-integral-chain",
    titles: [
      "도함수와 한 함수값에서 원함수 복원 후 정적분",
      "도함수 조건·원함수 복원·구간 함수값 결합",
    ],
    sourcePattern:
      "미분 단계에서 계수를 확인하고 적분상수를 결정한 뒤 정적분 또는 함수값까지 이어지는 유형",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "도함수를 항별로 적분한다.",
        "주어진 함수값으로 적분상수를 정한다.",
        "복원한 원함수를 다시 미분해 검산한다.",
        "목표 정적분을 계산한다.",
      ],
      [
        "도함수의 원시함수를 구한다.",
        "초기 조건으로 상수를 결정한다.",
        "두 끝점의 함수값을 계산한다.",
        "미적분의 기본정리와 함수값 결합을 계산한다.",
      ],
    ],
    generate(mode) {
      const quadratic =
        choose([3, 6]);
      const linear =
        choose([-4, -2, 2, 4]);
      const constantDerivative =
        randomInteger(-3, 3);
      const initial =
        randomInteger(-4, 4);
      const bound =
        randomInteger(2, 4);
      const derivative = [
        constantDerivative,
        linear,
        quadratic,
      ];
      const atBound =
        antiderivativeValue(
          derivative,
          initial,
          bound
        );
      const atZero = initial;
      const integralOfFPrime =
        atBound - atZero;
      const answer =
        mode === 0
          ? integralOfFPrime
          : atBound +
            integralOfFPrime;

      return makeShortAnswer({
        prompt:
          `다항함수 $f$가 $f'(x)=${polynomialTex(
            derivative
          )}$, $f(0)=${initial}$을 만족한다. ${
            mode === 0
              ? `$\\displaystyle\\int_0^{${bound}}f'(x)\\,dx$`
              : `$f(${bound})+\\displaystyle\\int_0^{${bound}}f'(x)\\,dx$`
          }의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? atBound - atZero
            : atBound +
              atBound -
              atZero,
        solution:
          `도함수를 적분하고 $f(0)=${initial}$을 적용하면 $f(${bound})=${atBound}$. ` +
          `미적분의 기본정리로 $\\int_0^{${bound}}f'(x)dx=f(${bound})-f(0)=${integralOfFPrime}$. ` +
          `따라서 답은 ${answer}이다.`,
        hintText:
          "원함수를 복원한 뒤 정적분을 함수값의 차로도 검산하세요.",
      });
    },
  },
  {
    id: "quadratic-area-parameter",
    titles: [
      "두 교점과 넓이 조건에서 이차함수 계수 복원",
      "포물선·직선 사이 넓이와 교점 거리 결합",
    ],
    sourcePattern:
      "교점을 먼저 구하고 함수의 대소를 판정한 뒤 차함수를 적분해 넓이 계산",
    estimatedMinutes: [13, 13],
    reasoningSteps: [
      [
        "두 그래프의 교점 방정식을 푼다.",
        "교점 사이에서 위쪽 함수를 판정한다.",
        "차함수를 정적분한다.",
        "넓이 조건과 비교해 매개변수를 구한다.",
      ],
      [
        "교점 두 개를 구한다.",
        "차함수의 부호를 확인한다.",
        "넓이를 적분으로 계산한다.",
        "교점 거리와 넓이를 결합한다.",
      ],
    ],
    generate(mode) {
      const gap =
        randomInteger(2, 5);
      const slope =
        randomInteger(1, 4);
      const area = fraction(
        gap ** 3,
        6
      );
      const numericArea =
        gap ** 3 / 6;
      const answer =
        mode === 0
          ? slope
          : numericArea + gap;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `곡선 $y=x^2$과 직선 $y=kx$로 둘러싸인 부분의 넓이가 $\\dfrac{${slope ** 3}}6$일 때, 양수 $k$를 구하시오.`
            : `곡선 $y=x^2$과 직선 $y=${gap}x$의 두 교점 사이 거리를 $d$, 둘러싸인 넓이를 $S$라 할 때 $S+d$를 구하시오. (분수 입력 가능)`,
        answer,
        independentAnswer:
          mode === 0
            ? slope
            : gap ** 3 / 6 +
              gap,
        solution:
          `교점은 $x=0,k$이고 그 사이에서는 직선이 위에 있다. ` +
          `$S=\\int_0^k(kx-x^2)dx=k^3/6$. ${
            mode === 0
              ? `양수 조건에서 $k=${slope}$.`
              : `$S=${area}$, $d=${gap}$이므로 답은 ${answer}.`
          }`,
        hintText:
          "교점을 구한 뒤 위 함수에서 아래 함수를 빼 적분하세요.",
      });
    },
  },
  {
    id: "velocity-total-distance",
    referenceArchetypeId:
      "motion-derivative-integral-progression",
    stageId:
      "differentiate-and-integrate",
    titles: [
      "속도 부호 변화가 있는 구간의 총 이동거리",
      "변위와 이동거리의 차 계산",
    ],
    sourcePattern:
      "속도의 영점으로 구간을 나누고 각 구간 적분의 절댓값을 합하는 이동거리 유형",
    estimatedMinutes: [13, 13],
    reasoningSteps: [
      [
        "속도의 영점을 찾는다.",
        "시간축에서 속도 부호표를 만든다.",
        "부호가 일정한 각 구간에서 변위를 적분한다.",
        "각 변위의 절댓값을 합한다.",
      ],
      [
        "속도의 부호 변화 시점을 구한다.",
        "전체 변위를 한 번 적분한다.",
        "총 이동거리를 구간별 절댓값 적분으로 계산한다.",
        "두 값의 차를 계산한다.",
      ],
    ],
    generate(mode) {
      const turn =
        randomInteger(2, 5);
      const end = 2 * turn;
      const primitive = (t) =>
        turn * t ** 2 / 2 -
        t ** 3 / 3;
      const firstDistance =
        primitive(turn);
      const secondDisplacement =
        primitive(end) -
        primitive(turn);
      const totalDistance =
        Math.abs(firstDistance) +
        Math.abs(
          secondDisplacement
        );
      const displacement =
        primitive(end);
      const answer =
        mode === 0
          ? fraction(
              Math.round(
                totalDistance * 6
              ),
              6
            )
          : fraction(
              Math.round(
                (
                  totalDistance -
                  Math.abs(
                    displacement
                  )
                ) * 6
              ),
              6
            );

      return makeShortAnswer({
        prompt:
          `수직선 위를 움직이는 점 P의 속도가 $v(t)=${turn}t-t^2$이다. ` +
          `$0\\le t\\le${end}$에서 ${
            mode === 0
              ? "P가 움직인 거리"
              : "P가 움직인 거리와 변위의 절댓값의 차"
          }를 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                Math.round(
                  totalDistance * 6
                ),
                6
              )
            : fraction(
                Math.round(
                  (
                    totalDistance -
                    Math.abs(
                      displacement
                    )
                  ) * 6
                ),
                6
              ),
        solution:
          `$v(t)=t(${turn}-t)$이므로 $t=${turn}$에서 부호가 바뀐다. ` +
          `$[0,${turn}]$과 $[${turn},${end}]$의 정적분을 각각 계산하고 절댓값을 합하면 ` +
          `총 이동거리를 얻는다. 요구한 값은 ${answer}이다.`,
        hintText:
          "속도가 0인 시점에서 적분 구간을 나누고 각 구간 변위에 절댓값을 취하세요.",
      });
    },
  },
  {
    id: "integral-defined-function",
    titles: [
      "정적분으로 정의된 함수의 값과 도함수 결합",
      "적분함수의 조건에서 매개변수 결정",
    ],
    sourcePattern:
      "F(x)=∫f(t)dt를 미분해 F'=f를 얻고 함수값 조건과 함께 적용",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "적분으로 정의된 함수에 미적분의 기본정리를 적용한다.",
        "F'(x)를 피적분함수로 바꾼다.",
        "F(a)는 직접 정적분한다.",
        "두 값을 결합한다.",
      ],
      [
        "F'(x)=f(x)를 구한다.",
        "주어진 도함수 조건으로 매개변수를 정한다.",
        "복원한 피적분함수를 적분한다.",
        "목표 함수값을 계산한다.",
      ],
    ],
    generate(mode) {
      const parameter =
        randomInteger(-4, 5);
      const point =
        randomInteger(2, 4);
      const integral =
        point ** 3 +
        parameter *
          point ** 2 /
          2;
      const derivativeAt =
        3 * point ** 2 +
        parameter * point;
      const answer =
        mode === 0
          ? integral +
            derivativeAt
          : parameter;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `함수 $F(x)=\\displaystyle\\int_0^x(3t^2${signed(
                parameter
              )}t)dt$에 대하여 $F(${point})+F'(${point})$의 값을 구하시오.`
            : `함수 $F(x)=\\displaystyle\\int_0^x(3t^2+kt)dt$가 $F'(${point})=${derivativeAt}$을 만족할 때, 상수 $k$를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? point ** 3 +
              parameter *
                point ** 2 /
                2 +
              3 * point ** 2 +
              parameter * point
            : (
                derivativeAt -
                3 * point ** 2
              ) / point,
        solution:
          `미적분의 기본정리로 $F'(x)=3x^2${
            mode === 0
              ? `${signed(
                  parameter
              )}x`
              : "+kx"
          }$. ` +
          `${
            mode === 0
              ? `또 $F(${point})=${integral}$이므로 답은 ${answer}.`
              : `$x=${point}$을 대입해 일차방정식을 풀면 $k=${parameter}$.`
          }`,
        hintText:
          "상한이 x인 정적분을 미분하면 피적분함수에 x를 대입한 식이 됩니다.",
      });
    },
  },
  {
    id: "tangent-and-enclosed-area",
    requiredConceptIds: [
      ...differentiationConceptIds,
      ...requiredConceptIds,
    ],
    titles: [
      "접선 결정 후 곡선과 접선 사이 넓이",
      "미분으로 접점을 찾고 적분으로 넓이 계산",
    ],
    sourcePattern:
      "접선 조건을 미분으로 해결한 뒤 교점과 함수의 대소를 구해 정적분까지 이어지는 완전형",
    estimatedMinutes: [14, 15],
    reasoningSteps: [
      [
        "도함수로 접선의 기울기를 구한다.",
        "점-기울기식으로 접선 방정식을 만든다.",
        "곡선과 접선의 추가 교점을 구한다.",
        "두 그래프의 차를 적분해 넓이를 계산한다.",
      ],
      [
        "주어진 기울기와 도함수를 같게 두어 접점을 찾는다.",
        "접선 방정식을 구한다.",
        "교점 구간에서 위아래 그래프를 판정한다.",
        "정적분으로 둘러싸인 넓이를 구한다.",
      ],
    ],
    generate(mode) {
      const contact =
        randomInteger(1, 3);
      const other =
        contact +
        randomInteger(2, 4);
      const gap =
        other - contact;
      /*
       * f(x)-L(x)=(x-contact)^2(x-other)인 삼차함수를
       * 구성하면 x=contact에서 L과 접하고 x=other에서
       * 한 번 더 만납니다. 넓이는 gap^4/12입니다.
       */
      const area = fraction(
        gap ** 4,
        12
      );
      const scaled = fraction(
        gap ** 4,
        3
      );
      const answer =
        mode === 0
          ? area
          : scaled;

      return makeShortAnswer({
        prompt:
          `곡선 $y=(x-${contact})^2(x-${other})$와 이 곡선 위의 점 $(${contact},0)$에서의 접선, ` +
          `그리고 직선 $x=${other}$로 둘러싸인 부분의 넓이를 $S$라 하자. ${
            mode === 0
              ? "S"
              : "4S"
          }의 값을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                gap ** 4,
                12
              )
            : fraction(
                gap ** 4,
                3
              ),
        solution:
          `$f'(${contact})=0$이므로 접선은 $y=0$. ` +
          `$${contact}<x<${other}$에서 함수값은 음수이므로 ` +
          `$S=-\\int_{${contact}}^{${other}}(x-${contact})^2(x-${other})dx=${area}$. ` +
          `따라서 답은 ${answer}이다.`,
        hintText:
          "접선이 x축임을 확인한 뒤 함수의 부호를 보고 절댓값 넓이를 적분하세요.",
      });
    },
  },
  {
    id: "symmetric-definite-integral",
    titles: [
      "대칭구간에서 홀수항을 소거하는 정적분",
      "f(x)+f(-x) 조건으로 정적분 복원",
    ],
    sourcePattern:
      "대칭구간에서 홀함수 부분의 정적분이 0임을 이용해 짝함수 부분만 적분",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "다항식을 짝수차항과 홀수차항으로 나눈다.",
        "대칭구간에서 홀수차항의 적분이 0임을 확인한다.",
        "남은 짝수차항을 적분한다.",
        "양쪽 구간의 값을 합쳐 목표값을 구한다.",
      ],
      [
        "f(x)+f(-x)에서 홀수 부분이 소거됨을 사용한다.",
        "주어진 식으로 f의 짝수 부분을 복원한다.",
        "대칭구간 적분을 짝수 부분의 적분으로 바꾼다.",
        "정적분 값을 계산한다.",
      ],
    ],
    generate(mode) {
      const bound = randomInteger(2, 4);
      const evenQuadratic = choose([3, 6]);
      const constant = randomInteger(-3, 4);
      const oddCubic = randomInteger(-4, 4);
      const oddLinear = randomInteger(-4, 4);
      const integral =
        2 *
        (
          evenQuadratic *
            bound ** 3 /
            3 +
          constant * bound
        );
      const answer =
        mode === 0
          ? integral
          : integral / 2;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `다항함수 $f(x)=${polynomialTex([constant, oddLinear, evenQuadratic, oddCubic])}$에 대하여 $\\displaystyle\\int_{-${bound}}^{${bound}}f(x)\\,dx$의 값을 구하시오.`
            : `연속함수 $f$가 $f(x)+f(-x)=${2 * evenQuadratic}x^2${signed(2 * constant)}$를 만족한다. $\\dfrac12\\displaystyle\\int_{0}^{${bound}}\\{f(x)+f(-x)\\}\\,dx$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 *
              (
                evenQuadratic *
                  bound ** 3 /
                  3 +
                constant * bound
              )
            : evenQuadratic *
                bound ** 3 /
                3 +
              constant * bound,
        solution:
          `대칭구간에서 홀수차항의 정적분은 0이다. 따라서 짝수 부분만 적분하면 ` +
          `${mode === 0 ? "" : "$f(x)+f(-x)$ 자체가 짝수 부분의 두 배이므로 "}답은 ${answer}이다.`,
        hintText:
          "대칭구간에서는 홀함수 부분의 넓이가 부호를 달리해 서로 소거됩니다.",
      });
    },
  },
  {
    id: "two-parabola-enclosed-area",
    titles: [
      "두 포물선의 교점과 둘러싸인 넓이",
      "차함수의 근과 최고차항에서 넓이 복원",
    ],
    sourcePattern:
      "두 이차함수의 차를 인수분해해 교점을 찾고 구간 내 부호를 판정한 뒤 정적분",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "두 포물선의 차를 구한다.",
        "차함수를 인수분해해 두 교점을 찾는다.",
        "교점 사이에서 위쪽 그래프를 판정한다.",
        "차함수를 정적분해 넓이를 계산한다.",
      ],
      [
        "교점의 x좌표를 차함수의 두 근으로 해석한다.",
        "최고차항 부호로 위아래 그래프를 정한다.",
        "근 사이의 이차식 적분을 계산한다.",
        "넓이와 교점 거리의 결합값을 구한다.",
      ],
    ],
    generate(mode) {
      const left = randomInteger(-3, 0);
      const gap = randomInteger(3, 6);
      const right = left + gap;
      const scale = choose([1, 2, 3]);
      const area = fraction(
        scale * gap ** 3,
        6
      );
      const answer =
        mode === 0
          ? area
          : scale * gap ** 2;

      return makeShortAnswer({
        prompt:
          `두 곡선 $y=x^2$와 ` +
          `$y=x^2+${scale}(${linearFactor(left)})(${right}-x)$의 두 교점의 x좌표를 $a<b$, 둘러싸인 넓이를 $S$라 하자. ` +
          `$${mode === 0 ? "S" : "\\dfrac{6S}{b-a}"}$의 값을 구하시오.${mode === 0 ? " (기약분수로 입력)" : ""}`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                scale *
                  (right - left) ** 3,
                6
              )
            : scale *
              (right - left) ** 2,
        solution:
          `두 그래프는 $x=${left},${right}$에서 만나고 그 사이의 차는 ` +
          `$${scale}(${linearFactor(left)})(${right}-x)\\ge0$이다. 이를 ${left}부터 ${right}까지 적분하면 $S=${area}$이고, 요구한 값은 ${answer}이다.`,
        hintText:
          "두 함수의 차를 먼저 구하면 교점과 위쪽 그래프를 동시에 확인할 수 있습니다.",
      });
    },
  },
  {
    id: "zero-integral-parameter",
    titles: [
      "정적분이 0이 되는 일차함수의 매개변수",
      "구간 평균과 정적분 조건의 역문제",
    ],
    sourcePattern:
      "정적분값 조건을 매개변수에 대한 방정식으로 만들고 구간 평균 또는 끝점 값을 함께 계산",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "피적분함수를 항별로 적분한다.",
        "정적분이 0인 조건을 매개변수 방정식으로 만든다.",
        "매개변수를 구한다.",
        "복원한 함수의 목표점 값을 계산한다.",
      ],
      [
        "정적분을 구간 길이와 평균값의 곱으로 해석한다.",
        "일차함수의 구간 평균이 중점값임을 확인한다.",
        "중점에서 함수값이 0이 되도록 매개변수를 정한다.",
        "두 끝점 함수값의 차를 계산한다.",
      ],
    ],
    generate(mode) {
      const left = randomInteger(-3, 1);
      const right =
        left +
        choose([2, 4, 6]);
      const slope = choose([2, 3, 4]);
      const center =
        (left + right) / 2;
      const parameter =
        -slope * center;
      const answer =
        mode === 0
          ? parameter
          : slope *
            (right - left);

      return makeShortAnswer({
        prompt:
          `상수 $a$에 대하여 $\\displaystyle\\int_{${left}}^{${right}}(${slope}x+a)\\,dx=0$이다. ` +
          `$${mode === 0 ? "a" : `(${slope}\\cdot${right}+a)-(${slope}\\cdot${left}+a)`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? -slope *
              (left + right) /
              2
            : slope *
              (right - left),
        solution:
          `일차함수의 구간 평균은 중점 $x=${center}$에서의 값이다. 정적분이 0이므로 ` +
          `$${slope}\\cdot${center}+a=0$, $a=${parameter}$. 따라서 답은 ${answer}이다.`,
        hintText:
          "일차함수의 정적분 평균은 구간 중점에서의 함수값과 같습니다.",
      });
    },
  },
  {
    id: "cubic-absolute-area",
    titles: [
      "세 영점을 가진 삼차함수와 x축 사이 총넓이",
      "부호가 두 번 바뀌는 곡선의 넓이 분할",
    ],
    sourcePattern:
      "삼차함수의 세 영점에서 적분구간을 나누고 구간별 부호에 따라 정적분의 절댓값을 합산",
    estimatedMinutes: [14, 15],
    reasoningSteps: [
      [
        "삼차함수의 세 영점을 확인한다.",
        "각 영점 사이에서 함수 부호를 조사한다.",
        "두 구간의 정적분을 각각 계산한다.",
        "각 정적분의 절댓값을 합한다.",
      ],
      [
        "인수분해식으로 부호표를 만든다.",
        "x축 아래 구간의 적분에 음수를 붙인다.",
        "x축 위 구간의 적분을 더한다.",
        "총넓이를 기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const scale = choose([1, 2]);
      const value = (x) =>
        scale *
        (x + 1) *
        x *
        (x - 2);
      const primitive = (x) =>
        scale *
        (
          x ** 4 / 4 -
          x ** 3 / 3 -
          x ** 2
        );
      const firstIntegral =
        primitive(0) -
        primitive(-1);
      const secondIntegral =
        primitive(2) -
        primitive(0);
      const area =
        Math.abs(firstIntegral) +
        Math.abs(secondIntegral);
      const answer =
        mode === 0
          ? fraction(
              Math.round(area * 12),
              12
            )
          : fraction(
              Math.round(
                2 * area * 12
              ),
              12
            );

      return makeShortAnswer({
        prompt:
          `곡선 $y=${scale === 1 ? "" : scale}(x+1)x(x-2)$와 x축으로 둘러싸인 두 부분의 넓이의 합을 $S$라 하자. ` +
          `$${mode === 0 ? "S" : "2S"}$의 값을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                Math.round(
                  (
                    Math.abs(
                      primitive(0) -
                        primitive(-1)
                    ) +
                    Math.abs(
                      primitive(2) -
                        primitive(0)
                    )
                  ) * 12
                ),
                12
              )
            : fraction(
                Math.round(
                  2 *
                    (
                      Math.abs(
                        primitive(0) -
                          primitive(-1)
                      ) +
                      Math.abs(
                        primitive(2) -
                          primitive(0)
                      )
                    ) *
                    12
                ),
                12
              ),
        solution:
          `영점은 $-1,0,2$이고 두 구간에서 부호가 다르다. ` +
          `$[-1,0]$, $[0,2]$의 정적분에 각각 절댓값을 취해 더하면 $S=${fraction(Math.round(area * 12), 12)}$. 따라서 답은 ${answer}이다.`,
        hintText:
          "x축과 만나는 세 점에서 구간을 나누고 각 구간 정적분의 부호를 확인하세요.",
      });
    },
  },
  {
    id: "velocity-two-turns",
    titles: [
      "두 번 방향을 바꾸는 운동의 총 이동거리",
      "세 시간구간의 변위와 이동거리 비교",
    ],
    sourcePattern:
      "속도의 두 양의 영점에서 시간구간을 셋으로 나누고 변위의 절댓값을 합산",
    estimatedMinutes: [14, 15],
    reasoningSteps: [
      [
        "속도가 0이 되는 두 시각을 구한다.",
        "세 시간구간에서 속도의 부호를 조사한다.",
        "각 구간의 속도를 적분해 변위를 구한다.",
        "세 변위의 절댓값을 합해 이동거리를 구한다.",
      ],
      [
        "속도 부호표로 방향 전환 시점을 찾는다.",
        "전체 변위를 한 번의 정적분으로 계산한다.",
        "구간별 이동거리를 따로 계산한다.",
        "이동거리와 변위 절댓값의 차를 구한다.",
      ],
    ],
    generate(mode) {
      const first = 1;
      const second = 3;
      const end = 4;
      const scale = choose([3, 6]);
      const primitive = (time) =>
        scale *
        (
          time ** 3 / 3 -
          2 * time ** 2 +
          3 * time
        );
      const displacements = [
        primitive(first) -
          primitive(0),
        primitive(second) -
          primitive(first),
        primitive(end) -
          primitive(second),
      ];
      const distance =
        displacements.reduce(
          (sum, value) =>
            sum +
            Math.abs(value),
          0
        );
      const total =
        primitive(end) -
        primitive(0);
      const exactDistance =
        Math.round(
          distance * 1e9
        ) / 1e9;
      const exactTotal =
        Math.round(
          total * 1e9
        ) / 1e9;
      const answer =
        mode === 0
          ? exactDistance
          : exactDistance -
            Math.abs(exactTotal);

      return makeShortAnswer({
        prompt:
          `수직선 위를 움직이는 점의 속도가 $v(t)=${scale}(t-1)(t-3)$이다. ` +
          `$0\\le t\\le4$에서 ${mode === 0 ? "점이 움직인 총거리" : "총 이동거리에서 전체 변위의 절댓값을 뺀 값"}을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? displacements.reduce(
                (sum, value) =>
                  sum +
                  Math.abs(value),
                0
              ).toFixed(9).replace(/\.?0+$/, "")
            : String(
                Math.round(
                  (
                    displacements.reduce(
                (sum, value) =>
                  sum +
                  Math.abs(value),
                0
                    ) -
                    Math.abs(
                      displacements.reduce(
                        (sum, value) =>
                          sum + value,
                        0
                      )
                    )
                  ) * 1e9
                ) / 1e9
              ),
        solution:
          `속도는 $t=1,3$에서 부호가 바뀐다. 세 구간 $[0,1]$, $[1,3]$, $[3,4]$에서 ` +
          `속도를 각각 적분하고 절댓값을 합하면 총 이동거리는 ${exactDistance}이다. 따라서 답은 ${answer}이다.`,
        hintText:
          "속도가 0인 두 시각에서 적분구간을 반드시 나누세요.",
      });
    },
  },
];

module.exports = {
  courseId,
  unitId,
  requiredConceptIds,
  minimumAppliedPoolSize: 16,
  appliedPolicy: {
    includeBankTypes: true,
    minimumLocalDifficulty: 3,
  },
  advancedTemplates:
    defineAdvancedTemplates({
      courseId,
      unitId,
      requiredConceptIds,
      families,
    }),
};
