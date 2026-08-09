const {
  randomInteger,
  choose,
  polynomialTex,
  linearFactor,
  signed,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId = "calculus-1";
const unitId = "differentiation";
const requiredConceptIds = [
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

function cubicValue(
  coefficients,
  x
) {
  return coefficients.reduce(
    (sum, coefficient, exponent) =>
      sum +
      coefficient * x ** exponent,
    0
  );
}

const families = [
  {
    id: "extrema-coefficient-recovery",
    titles: [
      "두 극값 위치에서 삼차함수 계수와 함수값 복원",
      "극대·극소 조건으로 삼차함수의 계수 결합값 결정",
    ],
    sourcePattern:
      "도함수의 두 근을 극대·극소 위치와 연결하고 계수 비교 후 함수값 계산",
    estimatedMinutes: [12, 11],
    reasoningSteps: [
      [
        "삼차함수를 미분한다.",
        "두 극값 위치를 도함수의 두 근으로 둔다.",
        "도함수를 인수분해해 원함수 계수를 비교한다.",
        "복원한 함수에 극값 위치를 대입한다.",
      ],
      [
        "극대·극소에서 f'=0을 사용한다.",
        "도함수의 인수분해식과 계수를 비교한다.",
        "두 미지 계수를 구한다.",
        "요구한 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const left =
        randomInteger(-3, -1);
      const right =
        randomInteger(1, 3);
      const quadraticCoefficient =
        (-3 *
          (left + right)) /
        2;

      if (
        !Number.isInteger(
          quadraticCoefficient
        )
      ) {
        return families[0].generate(
          mode
        );
      }

      const linearCoefficient =
        3 * left * right;
      const constant =
        randomInteger(-5, 5);
      const coefficients = [
        constant,
        linearCoefficient,
        quadraticCoefficient,
        1,
      ];
      const valueSum =
        cubicValue(
          coefficients,
          left
        ) +
        cubicValue(
          coefficients,
          right
        );
      const answer =
        mode === 0
          ? valueSum
          : quadraticCoefficient +
            linearCoefficient;

      return makeShortAnswer({
        prompt:
          `삼차함수 $f(x)=x^3+ax^2+bx${constant >= 0 ? "+" : ""}${constant}$가 ` +
          `$x=${left}$에서 극대, $x=${right}$에서 극소일 때, $${ 
            mode === 0
              ? `f(${left})+f(${right})`
              : "a+b"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? valueSum
            : quadraticCoefficient +
              linearCoefficient,
        solution:
          `$f'(x)=3x^2+2ax+b=3(${linearFactor(
            left
          )})(${linearFactor(
            right
          )})$이다. ` +
          `계수 비교로 $a=${quadraticCoefficient},b=${linearCoefficient}$. ` +
          `${
            mode === 0
              ? `이를 원함수에 대입해 두 함수값을 더하면 ${answer}이다.`
              : `따라서 $a+b=${answer}$.`
          }`,
        hintText:
          "극대와 극소가 되는 x좌표는 도함수의 두 근입니다.",
      });
    },
  },
  {
    id: "tangent-through-point",
    titles: [
      "외부점에서 포물선에 그은 두 접선의 접점 복원",
      "두 접선의 기울기 관계와 접점 좌표 결합",
    ],
    sourcePattern:
      "접점을 t로 두고 접선식을 세운 뒤 외부점을 지난다는 조건을 t의 방정식으로 변환",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "접점의 x좌표를 t로 둔다.",
        "도함수로 접선의 기울기와 방정식을 만든다.",
        "외부점 좌표를 접선식에 대입해 t의 이차방정식을 얻는다.",
        "두 접점 좌표의 대칭식을 계산한다.",
      ],
      [
        "각 접선의 접점을 미지수로 둔다.",
        "외부점 통과 조건으로 두 접점의 방정식을 푼다.",
        "두 접선의 기울기를 구한다.",
        "기울기의 곱 또는 차를 계산한다.",
      ],
    ],
    generate(mode) {
      const c =
        randomInteger(-3, 3);
      const radius =
        randomInteger(2, 5);
      const externalY =
        c - radius ** 2;
      const left = -radius;
      const right = radius;
      const slopeProduct =
        (2 * left) *
        (2 * right);
      const answer =
        mode === 0
          ? left ** 2 +
            right ** 2
          : slopeProduct;

      return makeShortAnswer({
        prompt:
          `점 $P(0,${externalY})$에서 포물선 $y=x^2${c >= 0 ? "+" : ""}${c}$에 그은 서로 다른 두 접선의 ` +
          `접점의 x좌표를 $\\alpha<\\beta$, 두 접선의 기울기를 $m_1,m_2$라 할 때, $${ 
            mode === 0
              ? "\\alpha^2+\\beta^2"
              : "m_1m_2"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 * radius ** 2
            : -4 * radius ** 2,
        solution:
          `접점이 $(t,t^2${signed(
            c
          )})$이면 접선은 $y=2tx-t^2${signed(
            c
          )}$이다. ` +
          `P를 대입하면 $${externalY}=-t^2${signed(
            c
          )}$, 즉 $t=\\pm${radius}$. ` +
          `따라서 요구한 값은 ${answer}이다.`,
        hintText:
          "접점의 x좌표를 t로 두고 그 점에서의 접선식을 먼저 만드세요.",
      });
    },
  },
  {
    id: "cubic-root-count-parameter",
    titles: [
      "삼차함수 극값으로 방정식의 실근 개수 판정",
      "세 실근을 갖는 정수 매개변수 개수",
    ],
    sourcePattern:
      "삼차함수의 증가·감소와 극댓값·극솟값을 수평선 교점 개수 조건으로 변환",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "함수를 미분해 임계점을 구한다.",
        "각 임계점의 함수값을 계산한다.",
        "수평선의 높이를 극댓값·극솟값과 비교한다.",
        "그래프 교점 개수로 실근 개수를 판정한다.",
      ],
      [
        "도함수 부호표로 극댓값과 극솟값을 찾는다.",
        "세 실근 조건을 매개변수의 열린구간으로 바꾼다.",
        "끝점에서는 중근이 생김을 제외한다.",
        "구간 안의 정수 개수를 센다.",
      ],
    ],
    generate(mode) {
      const t = randomInteger(1, 3);
      const critical =
        2 * t ** 3;
      const level = choose([
        -critical - 1,
        -critical,
        0,
        critical,
        critical + 1,
      ]);
      const rootCount =
        Math.abs(level) <
        critical
          ? 3
          : Math.abs(level) ===
                critical
            ? 2
            : 1;
      const integerCount =
        2 * critical - 1;
      const answer =
        mode === 0
          ? rootCount
          : integerCount;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `방정식 $x^3-${3 * t ** 2}x=${level}$의 서로 다른 실근의 개수를 구하시오.`
            : `방정식 $x^3-${3 * t ** 2}x=k$가 서로 다른 세 실근을 갖게 하는 정수 $k$의 개수를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? rootCount
            : integerCount,
        solution:
          `$g'(x)=3(x-${t})(x+${t})$이고 극댓값은 ${critical}, 극솟값은 -${critical}이다. ` +
          `${
            mode === 0
              ? `수평선 $y=${level}$과의 교점은 ${rootCount}개이다.`
              : `세 교점 조건은 $-${critical}<k<${critical}$이므로 정수는 ${integerCount}개이다.`
          }`,
        hintText:
          "방정식의 해 개수를 함수 그래프와 수평선의 교점 개수로 바꾸세요.",
        visualization: {
          kind: "polynomial",
          degree: 3,
          coefficients: {
            cubic: 1,
            quadratic: 0,
            linear: -3 * t ** 2,
            constant: 0,
          },
          comparisonLineY: mode === 0 ? level : 0,
          focusX: 0,
          note:
            mode === 0
              ? `삼차함수와 수평선 y=${level}의 교점 개수를 확인하세요.`
              : "극댓값과 극솟값 사이의 수평선은 서로 다른 세 교점을 만듭니다.",
        },
      });
    },
  },
  {
    id: "motion-turning-points",
    referenceArchetypeId:
      "motion-derivative-integral-progression",
    stageId:
      "differentiate-before-integrating",
    titles: [
      "위치함수에서 방향 전환 시점과 위치차 계산",
      "속도 부호표로 구간 내 위치의 최댓값·최솟값 결정",
    ],
    sourcePattern:
      "위치함수를 미분해 속도의 영점과 부호를 구하고 방향 전환·위치 범위를 해석",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "위치함수를 미분해 속도를 구한다.",
        "속도가 0인 시점을 찾는다.",
        "속도 부호로 실제 방향 전환 여부를 확인한다.",
        "두 시점의 위치를 대입해 위치차를 계산한다.",
      ],
      [
        "속도의 근을 구한다.",
        "시간 구간에서 속도 부호표를 만든다.",
        "끝점과 임계점의 위치를 모두 계산한다.",
        "최댓값과 최솟값의 차를 구한다.",
      ],
    ],
    generate(mode) {
      const first =
        randomInteger(1, 2);
      const second =
        first +
        randomInteger(2, 3);
      const constant =
        randomInteger(-4, 4);
      const coefficients = [
        constant,
        3 * first * second,
        (-3 *
          (first + second)) /
          2,
        1,
      ];

      if (
        !Number.isInteger(
          coefficients[2]
        )
      ) {
        return families[3].generate(
          mode
        );
      }

      const firstPosition =
        cubicValue(
          coefficients,
          first
        );
      const secondPosition =
        cubicValue(
          coefficients,
          second
        );
      const endpointPosition =
        cubicValue(
          coefficients,
          second + 1
        );
      const values = [
        constant,
        firstPosition,
        secondPosition,
        endpointPosition,
      ];
      const range =
        Math.max(...values) -
        Math.min(...values);
      const answer =
        mode === 0
          ? Math.abs(
              firstPosition -
                secondPosition
            )
          : range;

      return makeShortAnswer({
        prompt:
          `수직선 위를 움직이는 점의 시각 $t$에서의 위치가 ` +
          `$s(t)=${polynomialTex(
            coefficients,
            "t"
          )}$이다. ${
            mode === 0
              ? "두 번의 방향 전환 시점에서 위치의 차"
              : `0\\le t\\le${second + 1}에서 위치의 최댓값과 최솟값의 차`
          }를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? Math.abs(
                firstPosition -
                  secondPosition
              )
            : range,
        solution:
          `$v(t)=s'(t)=3(${linearFactor(
            first,
            "t"
          )})(${linearFactor(
            second,
            "t"
          )})$이므로 방향 전환 시점은 ` +
          `$t=${first},${second}$. 속도 부호표와 끝점·두 임계점의 위치를 비교하면 답은 ${answer}이다.`,
        hintText:
          "위치함수를 미분한 속도의 근과 부호를 먼저 조사하세요.",
      });
    },
  },
  {
    id: "piecewise-differentiability",
    titles: [
      "구간별 함수의 연속·미분가능 조건 연립",
      "미분가능 경계에서 접선의 절편 계산",
    ],
    sourcePattern:
      "경계점에서 함수값 일치와 좌우미분계수 일치를 각각 적용해 두 매개변수 결정",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "경계점에서 좌우 함수값을 같게 둔다.",
        "양쪽 식을 미분해 좌우미분계수를 구한다.",
        "두 기울기를 같게 두어 계수를 결정한다.",
        "연속 조건으로 나머지 상수를 구해 결합한다.",
      ],
      [
        "미분가능성에서 연속 조건을 먼저 쓴다.",
        "좌우미분계수 일치로 직선의 기울기를 정한다.",
        "경계점의 함수값을 구한다.",
        "점-기울기식으로 접선의 절편을 계산한다.",
      ],
    ],
    generate(mode) {
      const point =
        randomInteger(-2, 3);
      const q =
        randomInteger(1, 3);
      const l =
        randomInteger(-4, 4);
      const c =
        randomInteger(-5, 5);
      const slope =
        2 * q * point + l;
      const value =
        q * point ** 2 +
        l * point +
        c;
      const intercept =
        value -
        slope * point;
      const answer =
        mode === 0
          ? slope + intercept
          : intercept;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=\\begin{cases}${polynomialTex(
            [c, l, q]
          )}&(x<${point})\\\\` +
          `ax+b&(x\\ge${point})\\end{cases}$가 $x=${point}$에서 미분가능하다. ${ 
            mode === 0
              ? "$a+b$"
              : `$x=${point}$에서 접선의 y절편`
          }의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? slope + intercept
            : intercept,
        solution:
          `좌우미분계수 일치에서 $a=${slope}$. 연속 조건 ` +
          `$${slope}\\cdot${point}+b=${value}$에서 $b=${intercept}$. ` +
          `경계점 접선은 바로 $y=${slope}x${intercept >= 0 ? "+" : ""}${intercept}$이므로 답은 ${answer}이다.`,
        hintText:
          "미분가능하려면 연속이어야 하고 좌우미분계수도 같아야 합니다.",
      });
    },
  },
  {
    id: "quartic-monotonicity-sign-chart",
    titles: [
      "세 임계점을 가진 사차함수의 증가구간 판정",
      "도함수 부호표에서 극값 위치 결합",
    ],
    sourcePattern:
      "인수분해된 삼차 도함수의 세 근을 배열하고 구간별 부호를 조사해 증가·감소와 극값을 판정",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "도함수의 세 근을 크기순으로 배열한다.",
        "각 근 사이에서 도함수의 부호를 조사한다.",
        "도함수가 양수인 증가구간을 고른다.",
        "유계 증가구간의 양 끝점을 결합한다.",
      ],
      [
        "도함수의 부호표를 완성한다.",
        "양에서 음으로 바뀌는 극대 위치를 찾는다.",
        "음에서 양으로 바뀌는 극소 위치를 찾는다.",
        "세 극값 위치의 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const left = randomInteger(-4, -2);
      const middle = randomInteger(-1, 1);
      const right = randomInteger(2, 4);
      const answer =
        mode === 0
          ? left + middle
          : left - middle + right;

      return makeShortAnswer({
        prompt:
          `사차함수 $f$의 도함수가 ` +
          `$f'(x)=(${linearFactor(left)})(${linearFactor(middle)})(${linearFactor(right)})$이다. ` +
          `${mode === 0 ? "유계인 증가구간의 양 끝점의 합" : "(극소가 되는 두 $x$좌표의 합)-(극대가 되는 $x$좌표)"}을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? left + middle
            : left + right -
              middle,
        solution:
          `세 근을 지나며 $f'$의 부호는 $-,+,-,+$로 바뀐다. ` +
          `따라서 증가는 $(${left},${middle})$, $(${right},\\infty)$에서이고 ` +
          `극소 위치는 ${left},${right}, 극대 위치는 ${middle}이다. 답은 ${answer}이다.`,
        hintText:
          "최고차항 계수가 양수인 삼차식의 부호를 오른쪽부터 번갈아 표시하세요.",
      });
    },
  },
  {
    id: "parallel-tangent-two-points",
    titles: [
      "주어진 직선과 평행한 두 접점의 좌표 합",
      "같은 기울기를 갖는 두 접점의 함수값 결합",
    ],
    sourcePattern:
      "접선 기울기 조건 f'(x)=m을 이차방정식으로 풀고 두 접점의 좌표 또는 함수값을 결합",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "삼차함수를 미분한다.",
        "접선의 기울기를 주어진 직선의 기울기와 같게 둔다.",
        "이차방정식의 두 근을 구한다.",
        "두 접점 x좌표의 합을 계산한다.",
      ],
      [
        "f'(x)=m을 풀어 두 접점을 찾는다.",
        "각 x좌표를 원함수에 대입한다.",
        "두 함수값을 각각 계산한다.",
        "요구한 함수값의 차를 구한다.",
      ],
    ],
    generate(mode) {
      const center = randomInteger(-2, 3);
      const distance = randomInteger(1, 3);
      const slope = randomInteger(-3, 4);
      const constant = randomInteger(-4, 4);
      const quadratic =
        -3 * center;
      const linear =
        slope +
        3 *
          (center ** 2 -
            distance ** 2);
      const coefficients = [
        constant,
        linear,
        quadratic,
        1,
      ];
      const left = center - distance;
      const right = center + distance;
      const valueDifference =
        cubicValue(
          coefficients,
          right
        ) -
        cubicValue(
          coefficients,
          left
        );
      const answer =
        mode === 0
          ? left + right
          : valueDifference;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=${polynomialTex(coefficients)}$의 그래프에서 직선 $y=${slope}x+1$과 평행한 ` +
          `서로 다른 두 접점의 x좌표를 $\\alpha<\\beta$라 하자. ` +
          `$${mode === 0 ? "\\alpha+\\beta" : "f(\\beta)-f(\\alpha)"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 * center
            : cubicValue(
                coefficients,
                right
              ) -
              cubicValue(
                coefficients,
                left
              ),
        solution:
          `$f'(x)=${slope}+3(${linearFactor(left)})(${linearFactor(right)})$이므로 ` +
          `$f'(x)=${slope}$의 두 해는 $${left},${right}$. 원함수에 대입해 정리하면 답은 ${answer}이다.`,
        hintText:
          "평행한 두 접선의 기울기는 주어진 직선의 기울기와 같습니다.",
      });
    },
  },
  {
    id: "closed-interval-extrema",
    titles: [
      "닫힌구간에서 삼차함수의 최댓값·최솟값 차",
      "끝점과 임계점을 모두 비교하는 절댓값 최댓값",
    ],
    sourcePattern:
      "도함수의 근과 닫힌구간의 양 끝점에서 함수값을 모두 계산해 전역 최댓값·최솟값을 결정",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "함수를 미분해 구간 안의 임계점을 찾는다.",
        "양 끝점과 각 임계점의 함수값을 계산한다.",
        "값들을 비교해 최댓값과 최솟값을 정한다.",
        "두 값의 차를 계산한다.",
      ],
      [
        "도함수 부호표로 극대·극소 위치를 찾는다.",
        "끝점과 임계점의 함수값 목록을 만든다.",
        "각 함수값의 절댓값을 비교한다.",
        "가장 큰 절댓값과 그 위치를 결합한다.",
      ],
    ],
    generate(mode) {
      const leftCritical = -1;
      const rightCritical = 1;
      const constant = randomInteger(-3, 3);
      const value = (x) =>
        x ** 3 -
        3 * x +
        constant;
      const leftEndpoint = -2;
      const rightEndpoint = 2;
      const candidates = [
        leftEndpoint,
        leftCritical,
        rightCritical,
        rightEndpoint,
      ].map((x) => ({
        x,
        y: value(x),
      }));
      const values = candidates.map(
        ({ y }) => y
      );
      const range =
        Math.max(...values) -
        Math.min(...values);
      const maxAbsolute = Math.max(
        ...values.map(Math.abs)
      );
      const answer =
        mode === 0
          ? range
          : maxAbsolute;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=x^3-3x${signed(constant)}$에 대하여 ` +
          `$[-2,2]$에서 ${mode === 0 ? "최댓값과 최솟값의 차" : "$|f(x)|$의 최댓값"}을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? Math.max(
                ...values
              ) -
              Math.min(
                ...values
              )
            : Math.max(
                ...values.map(
                  (number) =>
                    Math.abs(number)
                )
              ),
        solution:
          `$f'(x)=3(x-1)(x+1)$이므로 후보점은 $-2,-1,1,2$이다. ` +
          `각 점의 함수값을 비교하면 요구한 값은 ${answer}이다.`,
        hintText:
          "닫힌구간에서는 임계점뿐 아니라 양 끝점의 함수값도 반드시 비교하세요.",
        visualization: {
          kind: "polynomial",
          degree: 3,
          coefficients: {
            cubic: 1,
            quadratic: 0,
            linear: -3,
            constant,
          },
          domain: [-2, 2],
          focusX: 0,
          note: "닫힌구간의 양 끝점과 임계점에서 함수값을 비교하세요.",
        },
      });
    },
  },
  {
    id: "quartic-global-minimum",
    titles: [
      "사차함수의 전역 최솟값과 최적 상수",
      "도함수 부호와 대칭성을 이용한 최솟값",
    ],
    sourcePattern:
      "사차함수를 미분해 세 임계점을 찾고 함수값 비교로 모든 실수에서의 최솟값을 결정",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "사차함수를 미분하고 인수분해한다.",
        "세 임계점에서 도함수 부호 변화를 조사한다.",
        "각 극소점의 함수값을 비교한다.",
        "f(x)≥k를 만족하는 최대 k를 결정한다.",
      ],
      [
        "짝함수의 대칭성을 확인한다.",
        "도함수의 세 근을 구한다.",
        "극대와 두 극소를 구분한다.",
        "전역 최솟값과 극소 위치를 결합한다.",
      ],
    ],
    generate(mode) {
      const radius = choose([1, 2, 3]);
      const constant = randomInteger(-2, 5);
      const minimum =
        constant -
        radius ** 4;
      const answer =
        mode === 0
          ? minimum
          : minimum +
            2 * radius;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=x^4-${2 * radius ** 2}x^2${signed(constant)}$에 대하여 ` +
          `${mode === 0 ? "모든 실수 $x$에서 $f(x)\\ge k$가 성립하도록 하는 실수 $k$의 최댓값" : "최솟값 $m$과 두 극소점의 $x$좌표 차 $d$에 대한 $m+d$"}를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? constant -
              radius ** 4
            : constant -
              radius ** 4 +
              2 * radius,
        solution:
          `$f'(x)=4x(x-${radius})(x+${radius})$이다. 두 극소점 $x=\\pm${radius}$에서 ` +
          `최솟값은 ${minimum}이고 두 x좌표의 차는 ${2 * radius}. 따라서 답은 ${answer}이다.`,
        hintText:
          "도함수를 인수분해해 세 임계점의 종류를 구분하세요.",
      });
    },
  },
  {
    id: "absolute-polynomial-differentiability",
    titles: [
      "절댓값 이차함수의 미분가능 조건",
      "중근 조건과 절댓값 그래프의 매끄러운 접합",
    ],
    sourcePattern:
      "|이차식|이 영점에서 미분가능하려면 내부 다항식이 부호를 바꾸지 않는 중근을 가져야 함을 적용",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "절댓값 내부 이차식의 영점을 조사한다.",
        "단순근에서는 좌우 기울기가 달라짐을 확인한다.",
        "미분가능 조건을 판별식 0으로 바꾼다.",
        "매개변수를 풀어 목표값을 계산한다.",
      ],
      [
        "미분가능하지 않을 수 있는 점을 내부식의 근으로 한정한다.",
        "모든 영점이 중근이어야 함을 사용한다.",
        "완전제곱식이 되도록 계수를 정한다.",
        "접합점의 함수값과 매개변수를 결합한다.",
      ],
    ],
    generate(mode) {
      const root = randomInteger(-4, -1);
      const parameter =
        -2 * root;
      const constant = root ** 2;
      const answer =
        mode === 0
          ? parameter
          : parameter + constant;

      return makeShortAnswer({
        prompt:
          `양수 $a$에 대하여 함수 $f(x)=|x^2+ax+${constant}|$가 모든 실수에서 미분가능할 때, ` +
          `$${mode === 0 ? "a" : `a+f(${root})+${constant}`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? -2 * root
            : -2 * root +
              root ** 2,
        solution:
          `절댓값 내부식이 단순근을 가지면 그 점에서 뾰족해진다. 따라서 판별식이 0이어야 하므로 ` +
          `$a^2-4\\cdot${constant}=0$이고 중근이 ${root}이므로 $a=${parameter}$. 또한 $f(${root})=0$이어서 답은 ${answer}이다.`,
        hintText:
          "절댓값 내부식이 0을 지나며 부호가 바뀌면 좌우미분계수가 달라집니다.",
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
