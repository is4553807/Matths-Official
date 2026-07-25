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
const unitId =
  "limits-and-continuity";
const requiredConceptIds = [
  "calculus-1-01-01",
  "calculus-1-01-02",
  "calculus-1-01-03",
  "calculus-1-01-04",
];

const families = [
  {
    id: "finite-limit-parameter",
    titles: [
      "유한한 극한 조건에서 이차식 계수 복원",
      "인수 소거와 극한값으로 매개변수 결합값 결정",
    ],
    sourcePattern:
      "0/0 꼴이 유한한 값을 갖는 조건과 약분 후 극한값을 차례로 사용",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "극한이 유한하려면 분자가 경계점에서 0이어야 함을 사용한다.",
        "분자 계수 사이 첫 관계를 구한다.",
        "인수분해·약분 후 극한값으로 두 번째 관계를 구한다.",
        "두 계수를 복원해 결합값을 계산한다.",
      ],
      [
        "분모가 0이 되는 점에서 분자도 0이 되게 한다.",
        "나머지정리로 한 계수를 다른 계수로 나타낸다.",
        "약분된 일차식의 극한을 주어진 값과 비교한다.",
        "요구한 계수식을 계산한다.",
      ],
    ],
    generate(mode) {
      const point =
        randomInteger(-3, 3);
      const other =
        point +
        choose([-4, -2, 2, 4]);
      const linear =
        -(point + other);
      const constant =
        point * other;
      const limit =
        point - other;
      const answer =
        mode === 0
          ? linear + constant
          : linear * constant;

      return makeShortAnswer({
        prompt:
          `이차식 $f(x)=x^2+mx+n$에 대하여 ` +
          `$\\displaystyle\\lim_{x\\to ${point}}\\dfrac{f(x)}{${linearFactor(
            point
          )}}=${limit}$이다. ` +
          `$${ 
            mode === 0
              ? "m+n"
              : "mn"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? linear + constant
            : linear * constant,
        solution:
          `극한이 유한하므로 $f(${point})=0$. 또 분자를 $(${linearFactor(
            point
          )})(${linearFactor(
            other
          )})$로 쓰면 ` +
          `약분 후 극한은 $(${point})-(${other})=${limit}$. 따라서 ` +
          `$m=${linear}$, $n=${constant}$이고 답은 ${answer}이다.`,
        hintText:
          "먼저 분자가 분모와 같은 인수를 가져야 한다는 조건을 사용하세요.",
      });
    },
  },
  {
    id: "two-boundary-continuity",
    titles: [
      "두 경계점 연속 조건의 매개변수 연립",
      "세 구간 함수의 연속 조건에서 끝 식 복원",
    ],
    sourcePattern:
      "세 구간으로 정의된 함수가 두 경계에서 연속이라는 조건을 각각 세워 연립",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "첫 경계점에서 좌극한과 가운데 식의 값을 같게 둔다.",
        "둘째 경계점에서 가운데 식과 우극한을 같게 둔다.",
        "두 매개변수를 각각 구한다.",
        "요구한 결합값을 계산한다.",
      ],
      [
        "각 경계의 일방극한을 구한다.",
        "함숫값과 두 일방극한의 일치를 식으로 만든다.",
        "상수항 두 개를 복원한다.",
        "두 값의 곱을 계산한다.",
      ],
    ],
    generate(mode) {
      const leftBoundary = -1;
      const rightBoundary = 2;
      const quadratic =
        [
          randomInteger(-3, 3),
          randomInteger(-3, 3),
          1,
        ];
      const middleAtLeft =
        quadratic[0] -
        quadratic[1] +
        1;
      const middleAtRight =
        quadratic[0] +
        2 * quadratic[1] +
        4;
      const leftSlope =
        randomInteger(1, 4);
      const rightSlope =
        randomInteger(-3, 3);
      const leftConstant =
        middleAtLeft +
        leftSlope;
      const rightConstant =
        middleAtRight -
        2 * rightSlope;
      const answer =
        mode === 0
          ? leftConstant +
            rightConstant
          : leftConstant *
            rightConstant;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=\\begin{cases}` +
          `${leftSlope}x+p&(x<${leftBoundary})\\\\` +
          `${polynomialTex(
            quadratic
          )}&(${leftBoundary}\\le x<${rightBoundary})\\\\` +
          `${rightSlope}x+q&(x\\ge${rightBoundary})` +
          `\\end{cases}$가 실수 전체에서 연속일 때, $${ 
            mode === 0
              ? "p+q"
              : "pq"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? leftConstant +
              rightConstant
            : leftConstant *
              rightConstant,
        solution:
          `$x=${leftBoundary}$에서 연속 조건으로 $p=${leftConstant}$, ` +
          `$x=${rightBoundary}$에서 연속 조건으로 $q=${rightConstant}$을 얻는다. ` +
          `두 경계 조건은 서로 독립이며 답은 ${answer}이다.`,
        hintText:
          "두 경계점마다 왼쪽 식과 오른쪽 식의 값을 따로 같게 두세요.",
      });
    },
  },
  {
    id: "radical-infinity-next-order",
    titles: [
      "무한대 유리화 극한에서 매개변수 복원",
      "두 무리식 극한의 차를 유리화해 계수 결정",
    ],
    sourcePattern:
      "무한대로 가는 무리식의 ∞-∞ 꼴을 유리화하고 최고차항으로 극한 계산",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "∞-∞ 꼴임을 확인한다.",
        "켤레식을 곱해 유리화한다.",
        "분자·분모를 x로 나눈다.",
        "극한값과 비교해 매개변수를 구한다.",
      ],
      [
        "두 무리식 각각을 유리화한다.",
        "각 극한을 일차항 계수의 절반으로 바꾼다.",
        "주어진 극한 차로 계수 관계를 구한다.",
        "요구한 계수 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const first =
        choose([2, 4, 6, 8]);
      const second =
        choose([2, 4, 6]);
      const firstLimit =
        first / 2;
      const secondLimit =
        second / 2;
      const answer =
        mode === 0
          ? first
          : first + second;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `$\\displaystyle\\lim_{x\\to\\infty}(\\sqrt{x^2+kx+${randomInteger(
                1,
                5
              )}}-x)=${firstLimit}$일 때, 상수 $k$의 값을 구하시오.`
            : `$\\displaystyle\\lim_{x\\to\\infty}\\{(\\sqrt{x^2+${first}x+1}-x)-(\\sqrt{x^2+kx+4}-x)\\}=${firstLimit - secondLimit}$일 때, $${first}+k$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 * firstLimit
            : first + second,
        solution:
          mode === 0
            ? `켤레식으로 유리화하면 극한은 $k/2$이다. $k/2=${firstLimit}$이므로 $k=${first}$.`
            : `각 무리식을 유리화한 극한은 일차항 계수의 절반이다. 따라서 ` +
              `$(${first}-k)/2=${firstLimit - secondLimit}$에서 $k=${second}$이고 답은 ${answer}이다.`,
        hintText:
          "켤레식을 곱한 뒤 분자와 분모를 x로 나누세요.",
      });
    },
  },
  {
    id: "absolute-one-sided-limit",
    titles: [
      "절댓값 좌우극한으로 매개변수 결정",
      "절댓값 포함 구간별 극한의 존재 조건",
    ],
    sourcePattern:
      "|x-a|/(x-a)의 좌우 부호 차이를 이용해 일방극한과 극한 존재 조건을 해석",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "x<a와 x>a에서 절댓값을 각각 푼다.",
        "좌극한을 계산한다.",
        "우극한을 계산한다.",
        "주어진 일방극한 값으로 매개변수를 정한다.",
      ],
      [
        "절댓값 식을 좌우 구간으로 나눈다.",
        "두 일방극한을 각각 매개변수로 표현한다.",
        "극한 존재 조건으로 두 값을 같게 둔다.",
        "매개변수 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const point =
        randomInteger(-3, 3);
      const coefficient =
        randomInteger(2, 6);
      const constant =
        randomInteger(-4, 4);
      const leftLimit =
        -coefficient + constant;
      const rightLimit =
        coefficient + constant;
      const answer =
        mode === 0
          ? coefficient
          : constant;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `함수 $f(x)=k\\dfrac{|${linearFactor(
                point
              )}|}{${linearFactor(
                point
              )}}${constant >= 0 ? "+" : ""}${constant}$에 대하여 ` +
              `$\\displaystyle\\lim_{x\\to ${point}^{-}}f(x)=${leftLimit}$, $k>0$일 때 $k$를 구하시오.`
            : `함수 $f(x)=\\dfrac{|${linearFactor(
                point
              )}|}{${linearFactor(
                point
              )}}+c$의 좌극한과 우극한의 합이 ${2 * constant}일 때 $c$를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? constant -
              leftLimit
            : constant,
        solution:
          `$x<${point}$에서는 $|${linearFactor(
            point
          )}|/(${linearFactor(
            point
          )})=-1$, ` +
          `$x>${point}$에서는 1이다. ${
            mode === 0
              ? `좌극한은 $-k${constant >= 0 ? "+" : ""}${constant}=${leftLimit}$이므로 $k=${coefficient}$.`
              : `두 일방극한은 $-1+c$, $1+c$이고 합은 $2c=${2 * constant}$이므로 $c=${constant}$.`
          }`,
        hintText:
          "절댓값 안의 식이 양수인지 음수인지 경계의 양쪽에서 따로 판단하세요.",
      });
    },
  },
  {
    id: "intermediate-value-interval",
    titles: [
      "중간값 정리로 근이 보장되는 단위구간 판정",
      "연속함수의 부호표에서 서로 다른 근의 최소 개수",
    ],
    sourcePattern:
      "연속성과 양 끝값의 부호 변화를 결합해 근의 존재 구간 또는 최소 개수를 판정",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "함수가 연속임을 확인한다.",
        "후보 정수점에서 함수값의 부호를 계산한다.",
        "부호가 바뀌는 인접 구간을 찾는다.",
        "중간값 정리로 근이 보장되는 구간 수를 센다.",
      ],
      [
        "주어진 점들을 x좌표 순서로 배열한다.",
        "이웃한 함수값의 부호를 비교한다.",
        "서로 겹치지 않는 부호 변화 구간을 고른다.",
        "각 구간의 근 존재를 합해 최소 개수를 구한다.",
      ],
    ],
    generate(mode) {
      const roots = [
        -2.5,
        0.5,
        3.5,
      ];
      const value = (x) =>
        (
          x - roots[0]
        ) *
        (
          x - roots[1]
        ) *
        (
          x - roots[2]
        );
      const intervals = [
        [-3, -2],
        [0, 1],
        [3, 4],
      ];
      const signs = [
        -3,
        -2,
        0,
        1,
        3,
        4,
      ].map((x) => ({
        x,
        value: value(x),
      }));
      const answer = 3;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `연속함수 $f(x)=(2x+5)(2x-1)(2x-7)$에 대하여 ` +
              `열린구간 $(-3,-2),(0,1),(3,4)$ 중 중간값 정리로 $f(x)=0$의 해가 존재함이 보장되는 구간의 개수를 구하시오.`
            : `연속함수 $f$가 ${signs
                .map(
                  ({ x, value: y }) =>
                    `$f(${x})=${y > 0 ? 1 : -1}$`
                )
                .join(", ")}을 만족할 때, $f(x)=0$의 서로 다른 실근의 최소 개수를 구하시오.`,
        answer,
        independentAnswer:
          intervals.filter(
            ([left, right]) =>
              value(left) *
                value(right) <
              0
          ).length,
        solution:
          `각 인접 구간의 양 끝에서 함수값의 부호가 반대이고 함수가 연속이다. ` +
          `세 구간은 서로 겹치지 않으므로 각 구간마다 적어도 한 근이 존재한다. 따라서 답은 3이다.`,
        hintText:
          "연속함수의 양 끝값 곱이 음수인 서로 겹치지 않는 구간을 찾으세요.",
      });
    },
  },
  {
    id: "composed-limit-recovery",
    titles: [
      "합·곱의 극한에서 두 함수의 극한 복원",
      "두 극한 관계에서 합성 유리식의 극한 계산",
    ],
    sourcePattern:
      "두 함수의 합과 곱의 극한으로 각각의 극한값을 복원하고 유리식에 대입",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "두 함수의 극한값을 u,v로 둔다.",
        "합과 곱 조건으로 이차방정식을 만든다.",
        "대소 조건으로 u,v의 순서를 정한다.",
        "목표 유리식의 극한에 대입한다.",
      ],
      [
        "극한의 사칙연산으로 u+v와 uv를 읽는다.",
        "u,v를 두 근으로 갖는 방정식을 푼다.",
        "추가 조건으로 각 값을 구분한다.",
        "분모가 0이 아님을 확인하고 목표 극한을 계산한다.",
      ],
    ],
    generate(mode) {
      const low = randomInteger(1, 3);
      const high =
        low + randomInteger(2, 4);
      const answer =
        mode === 0
          ? fraction(
              high + 1,
              low + 1
            )
          : fraction(
              high ** 2 + low,
              high - low
            );

      return makeShortAnswer({
        prompt:
          `함수 $f,g$에 대하여 $\\lim_{x\\to a}\\{f(x)+g(x)\\}=${low + high}$, ` +
          `$\\lim_{x\\to a}f(x)g(x)=${low * high}$이고 ` +
          `$\\lim_{x\\to a}f(x)>\\lim_{x\\to a}g(x)$이다. ` +
          `$\\displaystyle\\lim_{x\\to a}${mode === 0 ? "\\dfrac{f(x)+1}{g(x)+1}" : "\\dfrac{f(x)^2+g(x)}{f(x)-g(x)}"}$의 값을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                high + 1,
                low + 1
              )
            : fraction(
                high ** 2 + low,
                high - low
              ),
        solution:
          `두 극한값을 $u>v$라 하면 $u+v=${low + high}$, $uv=${low * high}$이므로 ` +
          `$u=${high},v=${low}$. 목표식에 대입하면 $${answer}$이다.`,
        hintText:
          "두 극한값을 이차방정식의 두 근으로 복원하세요.",
      });
    },
  },
  {
    id: "infinity-leading-next-order",
    titles: [
      "무한대 극한의 최고차항과 다음 계수 복원",
      "두 무한대 극한으로 유리함수 계수 결정",
    ],
    sourcePattern:
      "유리함수의 무한대 극한에서 최고차항 비를 먼저 정하고 차를 곱한 다음 극한으로 다음 차수 계수를 결정",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "첫 극한에서 최고차항 계수의 비를 구한다.",
        "유리함수에서 그 극한값을 빼 통분한다.",
        "x를 곱한 뒤 남는 최고차항을 비교한다.",
        "두 계수의 결합값을 계산한다.",
      ],
      [
        "분자와 분모를 x²으로 나눠 첫 매개변수를 찾는다.",
        "극한값과 함수의 차를 한 분수로 합친다.",
        "다음 차수 항의 계수로 두 번째 매개변수를 구한다.",
        "원식의 두 조건을 다시 확인한다.",
      ],
    ],
    generate(mode) {
      const leading = randomInteger(2, 5);
      const next = randomInteger(-4, 4);
      const constant = randomInteger(1, 5);
      const answer =
        mode === 0
          ? leading + next
          : leading * next;

      return makeShortAnswer({
        prompt:
          `함수 $F(x)=\\dfrac{ax^2+bx+${constant}}{x^2+1}$이 ` +
          `$\\lim_{x\\to\\infty}F(x)=${leading}$, ` +
          `$\\lim_{x\\to\\infty}x\\{F(x)-${leading}\\}=${next}$를 만족한다. ` +
          `$${mode === 0 ? "a+b" : "ab"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? leading + next
            : leading * next,
        solution:
          `첫 극한에서 $a=${leading}$. 이를 대입하면 ` +
          `$x(F-${leading})=\\dfrac{${next}x^2${signed(constant - leading)}x}{x^2+1}$ 꼴이므로 둘째 극한에서 $b=${next}$. ` +
          `따라서 답은 ${answer}이다.`,
        hintText:
          "첫 극한으로 최고차항 계수를 정한 뒤 그 극한값을 함수에서 빼세요.",
      });
    },
  },
  {
    id: "two-removable-holes",
    titles: [
      "두 약분 가능 불연속점의 연속 확장값",
      "두 구멍을 메운 함수값의 결합",
    ],
    sourcePattern:
      "분자·분모의 공통인수를 약분한 뒤 원래 정의되지 않은 두 점의 극한으로 연속 확장",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "분자와 분모의 공통인수를 찾는다.",
        "두 점을 제외한 구간에서 식을 약분한다.",
        "각 구멍에서 약분된 식의 극한을 구한다.",
        "두 연속 확장값을 결합한다.",
      ],
      [
        "원래 식의 정의되지 않는 두 점을 확인한다.",
        "공통 이차인수를 제거한다.",
        "연속이 되기 위한 두 함수값을 각각 결정한다.",
        "두 값의 곱 또는 차를 계산한다.",
      ],
    ],
    generate(mode) {
      const left = randomInteger(-3, -1);
      const right = randomInteger(1, 4);
      const slope = choose([2, 3]);
      const intercept = randomInteger(1, 5);
      const leftValue =
        slope * left + intercept;
      const rightValue =
        slope * right + intercept;
      const answer =
        mode === 0
          ? leftValue + rightValue
          : leftValue * rightValue;

      return makeShortAnswer({
        prompt:
          `함수 $f$가 $x\\ne${left},${right}$에서 ` +
          `$f(x)=\\dfrac{(${linearFactor(left)})(${linearFactor(right)})(${slope}x${signed(intercept)})}{(${linearFactor(left)})(${linearFactor(right)})}$이고, ` +
          `모든 실수에서 연속이 되도록 정의된다. ` +
          `$${mode === 0 ? `f(${left})+f(${right})` : `f(${left})f(${right})`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? slope *
                (left + right) +
              2 * intercept
            : (slope * left +
                intercept) *
              (slope * right +
                intercept),
        solution:
          `두 공통인수를 약분하면 $f(x)=${slope}x${signed(intercept)}$이다. ` +
          `연속 확장값은 $f(${left})=${leftValue}$, $f(${right})=${rightValue}$이므로 답은 ${answer}이다.`,
        hintText:
          "정의되지 않은 점을 바로 대입하지 말고 먼저 공통인수를 약분하세요.",
      });
    },
  },
  {
    id: "absolute-value-continuity-parameter",
    titles: [
      "절댓값 분기점에서 연속이 되는 매개변수",
      "절댓값 함수와 일차함수의 접합 조건",
    ],
    sourcePattern:
      "절댓값의 분기점 양쪽 식을 나누고 함수값·좌우극한 일치 조건으로 매개변수를 결정",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "절댓값 안의 식이 바뀌는 경계점을 찾는다.",
        "왼쪽과 오른쪽 식을 각각 전개한다.",
        "경계에서 좌우극한과 함수값을 같게 놓는다.",
        "매개변수의 결합값을 계산한다.",
      ],
      [
        "접합점 양쪽의 함수식을 분리한다.",
        "각 일방극한을 계산한다.",
        "연속 조건으로 미지 계수를 구한다.",
        "다른 점의 함숫값에 대입해 검산한다.",
      ],
    ],
    generate(mode) {
      const point = randomInteger(1, 5);
      const slope = choose([2, 3, 4]);
      const value = randomInteger(-3, 5);
      const intercept =
        value - slope * point;
      const answer =
        mode === 0
          ? intercept
          : value + intercept;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=\\begin{cases}${slope}x+b,&x<${point}\\\\|x-${point}|${signed(value)},&x\\ge${point}\\end{cases}$가 ` +
          `$x=${point}$에서 연속일 때, $${mode === 0 ? "b" : `b+f(${point})`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? value -
              slope * point
            : 2 * value -
              slope * point,
        solution:
          `오른쪽 식에서 $f(${point})=${value}$. 왼쪽 극한은 $${slope * point}+b$이므로 ` +
          `$${slope * point}+b=${value}$, $b=${intercept}$. 따라서 답은 ${answer}이다.`,
        hintText:
          "접합점에서 왼쪽 극한과 실제 함수값을 같게 놓으세요.",
      });
    },
  },
  {
    id: "bisection-sign-certification",
    titles: [
      "중간값 정리와 이분 탐색으로 근의 구간 좁히기",
      "함숫값 부호표에서 보장되는 근 구간 판정",
    ],
    sourcePattern:
      "연속함수의 부호가 바뀌는 구간을 찾고 중점을 추가 조사해 근의 위치를 더 좁히는 유형",
    estimatedMinutes: [13, 13],
    reasoningSteps: [
      [
        "다항함수의 연속성을 확인한다.",
        "초기 구간 양 끝의 부호를 계산한다.",
        "중점의 함수값 부호를 계산한다.",
        "부호가 다른 절반 구간의 끝점 합을 구한다.",
      ],
      [
        "주어진 부호표를 x좌표 순서로 정렬한다.",
        "서로 겹치지 않는 부호 변화 구간을 찾는다.",
        "중간점 정보로 한 구간을 절반으로 줄인다.",
        "새 구간을 나타내는 지표를 계산한다.",
      ],
    ],
    generate(mode) {
      const root =
        randomInteger(1, 5) +
        choose([0.25, 0.75]);
      const left = Math.floor(root);
      const middle = left + 0.5;
      const right = left + 1;
      const narrowLeft =
        root < middle
          ? left
          : middle;
      const narrowRight =
        root < middle
          ? middle
          : right;
      const scale = 4;
      const answer =
        mode === 0
          ? scale *
              (narrowLeft +
                narrowRight)
          : scale *
              (narrowRight -
                narrowLeft);

      return makeShortAnswer({
        prompt:
          `연속함수 $f(x)=4x-${4 * root}$의 영점을 포함하는 구간 $(${left},${right})$을 이분한다. ` +
          `중점에서의 함수값 부호까지 이용해 얻는 길이 $1/2$인 구간을 $(a,b)$라 할 때, ` +
          `$${mode === 0 ? "4(a+b)" : "4(b-a)"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 4 *
              (narrowLeft +
                narrowRight)
            : 4 *
              (narrowRight -
                narrowLeft),
        solution:
          `$f(${left})<0<f(${right})$이고 $f(${middle})$의 부호를 조사하면 근은 ` +
          `$(${narrowLeft},${narrowRight})$에 있다. 따라서 답은 ${answer}이다.`,
        hintText:
          "중점의 함수값이 어느 끝점과 같은 부호인지 확인하고 그쪽 절반을 버리세요.",
      });
    },
  },
];

module.exports = {
  courseId,
  unitId,
  requiredConceptIds,
  minimumAppliedPoolSize: 15,
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
