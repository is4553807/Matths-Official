const {
  randomInteger,
  choose,
  fraction,
  power,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId = "algebra";
const unitId =
  "exponential-logarithmic-functions";
const requiredConceptIds = [
  "algebra-01-01",
  "algebra-01-02",
  "algebra-01-03",
  "algebra-01-04",
  "algebra-01-05",
  "algebra-01-06",
  "algebra-01-07",
  "algebra-01-08",
];

const families = [
  {
    id: "exponential-quadratic-roots",
    titles: [
      "지수 치환 이차방정식의 두 해 합",
      "지수 치환 이차방정식의 두 해 곱",
    ],
    sourcePattern:
      "지수방정식을 a^x에 대한 이차식으로 치환한 뒤 양수 조건과 로그를 차례로 적용",
    estimatedMinutes: [10, 10],
    reasoningSteps: [
      [
        "t=a^x로 치환한다.",
        "t에 대한 이차방정식을 인수분해한다.",
        "각 t를 지수 꼴로 되돌려 x를 구한다.",
        "두 해의 합을 계산한다.",
      ],
      [
        "t=a^x로 치환한다.",
        "t의 두 양의 근을 구한다.",
        "지수함수의 일대일성을 이용해 x를 복원한다.",
        "두 해의 곱을 계산한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3]);
      const left = randomInteger(
        1,
        3
      );
      const right =
        left +
        randomInteger(2, 4);
      const sum =
        power(base, left) +
        power(base, right);
      const product = power(
        base,
        left + right
      );
      const answer =
        mode === 0
          ? left + right
          : left * right;

      return makeShortAnswer({
        prompt:
          `$${base}^{2x}-${sum}\\cdot${base}^{x}+${product}=0$의 서로 다른 두 실근을 ` +
          `$\\alpha,\\beta$라 할 때, $${ 
            mode === 0
              ? "\\alpha+\\beta"
              : "\\alpha\\beta"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? left + right
            : left * right,
        solution:
          `$t=${base}^{x}>0$으로 놓으면 $(t-${power(
            base,
            left
          )})(t-${power(
            base,
            right
          )})=0$이다. ` +
          `따라서 $x=${left},${right}$이고, 요구한 값은 $${answer}$이다.`,
        hintText:
          "지수식 전체를 한 문자로 치환한 뒤 양의 근만 되돌리세요.",
      });
    },
  },
  {
    id: "log-system-order",
    titles: [
      "로그 합·제곱합에서 로그의 차 복원",
      "로그 합·제곱합에서 가중 로그 복원",
    ],
    sourcePattern:
      "로그값을 두 미지수로 놓고 대칭식과 대소 조건으로 각각의 값을 복원",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "u=log_a x, v=log_a y로 놓는다.",
        "합과 제곱합에서 uv를 구한다.",
        "u,v를 두 근으로 갖는 이차방정식을 만든다.",
        "x>y 조건으로 순서를 정해 차를 계산한다.",
      ],
      [
        "두 로그를 u,v로 치환한다.",
        "대칭식으로 곱 uv를 구한다.",
        "이차방정식과 대소 조건으로 u,v를 구분한다.",
        "로그 성질로 목표식을 선형결합한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3, 5]);
      const low = randomInteger(1, 3);
      const high =
        low +
        randomInteger(2, 4);
      const sum = low + high;
      const squares =
        low ** 2 + high ** 2;
      const answer =
        mode === 0
          ? high - low
          : 2 * high + low;

      return makeShortAnswer({
        prompt:
          `양수 $x,y$가 $x>y$, $\\log_{${base}}x+\\log_{${base}}y=${sum}$, ` +
          `$(\\log_{${base}}x)^2+(\\log_{${base}}y)^2=${squares}$를 만족한다. ` +
          `$${ 
            mode === 0
              ? `\\log_{${base}}\\dfrac{x}{y}`
              : `\\log_{${base}}(x^2y)`
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? high - low
            : 2 * high + low,
        solution:
          `$u=\\log_{${base}}x$, $v=\\log_{${base}}y$라 하자. ` +
          `$uv=\\{${sum}^2-${squares}\\}/2=${high * low}$이므로 ` +
          `$u,v$는 $t^2-${sum}t+${high * low}=0$의 두 근이다. ` +
          `$x>y$에서 $u=${high},v=${low}$이므로 답은 $${answer}$이다.`,
        hintText:
          "두 로그값의 합과 곱을 먼저 만든 뒤 이차방정식의 두 근으로 보세요.",
      });
    },
  },
  {
    id: "symmetric-exponential-intersections",
    titles: [
      "대칭 지수함수 교점의 x좌표 합",
      "대칭 지수함수 교점 사이 거리",
    ],
    sourcePattern:
      "a^x+a^{m-x}의 대칭성과 지수 치환을 함께 이용하는 교점 유형",
    estimatedMinutes: [11, 11],
    reasoningSteps: [
      [
        "t=a^x로 치환해 분모를 제거한다.",
        "t에 대한 이차방정식을 인수분해한다.",
        "두 교점의 x좌표를 복원한다.",
        "대칭축을 확인해 합을 검산한다.",
      ],
      [
        "지수 치환으로 두 양의 근을 찾는다.",
        "일대일성을 이용해 두 x좌표를 구한다.",
        "두 좌표의 순서를 정한다.",
        "교점 사이의 거리를 계산한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3]);
      const total = randomInteger(
        5,
        8
      );
      const left = randomInteger(
        1,
        Math.floor(total / 2) - 1
      );
      const right = total - left;
      const constant =
        power(base, left) +
        power(base, right);
      const answer =
        mode === 0
          ? total
          : right - left;

      return makeShortAnswer({
        prompt:
          `방정식 $${base}^{x}+${base}^{${total}-x}=${constant}$의 서로 다른 두 실근을 ` +
          `$\\alpha<\\beta$라 할 때, $${ 
            mode === 0
              ? "\\alpha+\\beta"
              : "\\beta-\\alpha"
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? left + right
            : right - left,
        solution:
          `$t=${base}^{x}$로 놓고 ${base}^{x}를 곱해 정리하면 ` +
          `$t^2-${constant}t+${power(
            base,
            total
          )}=0$이다. 두 근은 $${base}^{${left}},${base}^{${right}}$이므로 ` +
          `$\\alpha=${left},\\beta=${right}$이고 답은 $${answer}$이다.`,
        hintText:
          "두 번째 지수항을 a^m/a^x로 바꾼 뒤 a^x를 치환하세요.",
      });
    },
  },
  {
    id: "common-log-place-value",
    titles: [
      "상용로그로 큰 수의 자릿수 판정",
      "상용로그로 작은 수의 첫 유효자리 위치 판정",
    ],
    sourcePattern:
      "상용로그의 정수부분을 실제 수의 자릿수 또는 소수점 위치로 해석",
    estimatedMinutes: [10, 10],
    reasoningSteps: [
      [
        "주어진 로그값으로 밑의 상용로그를 만든다.",
        "거듭제곱의 로그를 계산한다.",
        "로그의 정수부분을 찾는다.",
        "정수의 자릿수로 변환한다.",
      ],
      [
        "음의 지수의 상용로그를 계산한다.",
        "특성의 범위를 정한다.",
        "원래 수가 놓이는 10의 거듭제곱 구간을 찾는다.",
        "소수점 아래 첫 유효자리 위치를 결정한다.",
      ],
    ],
    generate(mode) {
      const exponent = randomInteger(
        18,
        32
      );
      const log2 = 0.301;
      const logValue =
        exponent * log2;
      const digits =
        Math.floor(logValue) + 1;
      const firstPlace =
        Math.floor(logValue) + 1;
      const answer =
        mode === 0
          ? digits
          : firstPlace;

      return makeShortAnswer({
        prompt:
          `$\\log 2=0.3010$으로 계산할 때, ${
            mode === 0
              ? `$2^{${exponent}}$의 자릿수`
              : `$2^{-${exponent}}$에서 소수점 아래 처음으로 0이 아닌 숫자가 나타나는 자리`
          }를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? Math.floor(
                exponent * 0.301
              ) + 1
            : Math.floor(
                exponent * 0.301
              ) + 1,
        solution:
          `$${exponent}\\log2=${logValue.toFixed(
            4
          )}$. ` +
          `${
            mode === 0
              ? `따라서 $10^{${digits - 1}}<2^{${exponent}}<10^{${digits}}$이므로 ${digits}자리이다.`
              : `따라서 $10^{-${firstPlace}}<2^{-${exponent}}<10^{-${firstPlace - 1}}$의 경계를 해석하면 첫 유효숫자는 소수점 아래 ${firstPlace}번째에 나타난다.`
          }`,
        hintText:
          "상용로그의 정수부분을 10의 거듭제곱 구간으로 바꾸세요.",
      });
    },
  },
  {
    id: "exponential-inequality-integers",
    titles: [
      "지수 이차부등식의 정수해 개수",
      "로그 이차부등식의 자연수해 개수",
    ],
    sourcePattern:
      "치환 부등식의 근 구간을 원래 변수의 정수·자연수 조건과 결합",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "t=a^x로 치환한다.",
        "이차부등식의 t 구간을 구한다.",
        "지수함수의 단조성으로 x 구간을 복원한다.",
        "끝점 포함 여부를 확인해 정수해를 센다.",
      ],
      [
        "u=log_a x로 치환한다.",
        "u에 대한 이차부등식을 푼다.",
        "로그의 단조성으로 x 범위를 구한다.",
        "자연수 조건을 적용해 개수를 센다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3]);
      const left = randomInteger(
        1,
        2
      );
      const right =
        left +
        randomInteger(2, 3);
      const answer =
        mode === 0
          ? right - left + 1
          : power(base, right) -
            power(base, left) +
            1;

      if (mode === 0) {
        const sum =
          power(base, left) +
          power(base, right);
        const product = power(
          base,
          left + right
        );

        return makeShortAnswer({
          prompt:
            `부등식 $${base}^{2x}-${sum}\\cdot${base}^{x}+${product}\\le0$을 만족하는 정수 $x$의 개수를 구하시오.`,
          answer,
          independentAnswer:
            right - left + 1,
          solution:
            `$t=${base}^{x}$로 놓으면 $(t-${power(
              base,
              left
            )})(t-${power(
              base,
              right
            )})\\le0$이다. ` +
            `따라서 $${left}\\le x\\le${right}$이고 정수해는 ${answer}개이다.`,
          hintText:
            "지수 치환 후 근 사이 구간을 구하고 다시 x의 범위로 돌아오세요.",
        });
      }

      return makeShortAnswer({
        prompt:
          `부등식 $(\\log_{${base}}x-${left})(\\log_{${base}}x-${right})\\le0$을 만족하는 자연수 $x$의 개수를 구하시오.`,
        answer,
        independentAnswer:
          power(base, right) -
          power(base, left) +
          1,
        solution:
          `$${left}\\le\\log_{${base}}x\\le${right}$이고 밑이 1보다 크므로 ` +
          `$${power(
            base,
            left
          )}\\le x\\le${power(
            base,
            right
          )}$. 자연수는 ${answer}개이다.`,
        hintText:
          "로그값의 범위를 먼저 구한 뒤 밑이 1보다 큰지 확인하세요.",
      });
    },
  },
  {
    id: "nested-change-of-base",
    titles: [
      "연쇄 로그 조건에서 밑변환 값 복원",
      "로그의 밑이 이어지는 조건에서 역수 로그 계산",
    ],
    sourcePattern:
      "log_a x와 log_x y를 연결해 log_a y를 만든 뒤 밑변환과 역수 관계를 적용",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "주어진 두 로그를 지수 관계로 바꾼다.",
        "연쇄 관계로 log_a y를 계산한다.",
        "밑변환 공식으로 목표 로그를 표현한다.",
        "요구한 선형결합을 계산한다.",
      ],
      [
        "log_a y를 두 주어진 로그의 곱으로 만든다.",
        "로그의 역수 관계를 적용한다.",
        "분수를 기약분수로 정리한다.",
        "원래 조건에 대입해 검산한다.",
      ],
    ],
    generate(mode) {
      const p = randomInteger(2, 4);
      const q = randomInteger(2, 5);
      const product = p * q;
      const answer =
        mode === 0
          ? product + p
          : fraction(1, product);

      return makeShortAnswer({
        prompt:
          `양수 $a,x,y$에 대하여 $a\\ne1$, $\\log_a x=${p}$, $\\log_x y=${q}$이다. ` +
          `$${mode === 0 ? "\\log_a y+\\log_a x" : "\\log_y a"}$의 값을 구하시오.` +
          `${mode === 1 ? " (기약분수로 입력)" : ""}`,
        answer,
        independentAnswer:
          mode === 0
            ? p * q + p
            : fraction(1, p * q),
        solution:
          `$\\log_a y=(\\log_a x)(\\log_x y)=${p}\\cdot${q}=${product}$이다. ` +
          `${mode === 0 ? `따라서 요구한 값은 $${product}+${p}=${answer}$이다.` : `$\\log_y a=1/\\log_a y=${answer}$이다.`}`,
        hintText:
          "중간 밑 x가 소거되도록 두 로그를 곱해 보세요.",
      });
    },
  },
  {
    id: "absolute-exponential-roots",
    titles: [
      "절댓값 지수방정식의 두 근 대칭성",
      "절댓값 지수방정식의 두 근 곱",
    ],
    sourcePattern:
      "지수함수의 일대일성으로 절댓값 방정식을 만들고 중심 대칭인 두 근을 복원",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "지수함수의 일대일성으로 지수를 비교한다.",
        "절댓값 방정식을 두 일차방정식으로 나눈다.",
        "두 근을 중심 기준으로 정렬한다.",
        "두 근의 합을 계산한다.",
      ],
      [
        "밑이 양수이고 1이 아님을 확인한다.",
        "절댓값을 풀어 두 근을 구한다.",
        "두 근이 서로 다른지 확인한다.",
        "두 근의 곱을 계산한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3, 5]);
      const center = randomInteger(3, 8);
      const distance = randomInteger(1, 3);
      const left = center - distance;
      const right = center + distance;
      const answer =
        mode === 0
          ? left + right
          : left * right;

      return makeShortAnswer({
        prompt:
          `방정식 $${base}^{|x-${center}|}=${base}^{${distance}}$의 서로 다른 두 실근을 ` +
          `$\\alpha<\\beta$라 할 때, $${mode === 0 ? "\\alpha+\\beta" : "\\alpha\\beta"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 * center
            : (center - distance) *
              (center + distance),
        solution:
          `지수함수의 일대일성에서 $|x-${center}|=${distance}$. ` +
          `따라서 $\\alpha=${left},\\beta=${right}$이고 요구한 값은 $${answer}$이다.`,
        hintText:
          "밑이 같은 지수식이므로 먼저 지수끼리 비교하세요.",
      });
    },
  },
  {
    id: "log-domain-quadratic",
    titles: [
      "로그 진수 조건을 포함한 이차방정식의 근 합",
      "로그 진수 조건을 포함한 이차방정식의 근 곱",
    ],
    sourcePattern:
      "로그의 일대일성과 진수 양수 조건을 함께 적용해 이차방정식의 후보근을 검증",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "로그의 밑과 진수 조건을 확인한다.",
        "로그의 일대일성으로 진수끼리 같게 놓는다.",
        "완전제곱 방정식의 두 근을 구한다.",
        "두 근을 진수 조건에 대입한 뒤 합을 계산한다.",
      ],
      [
        "정의역을 먼저 기록한다.",
        "로그를 제거해 이차방정식을 만든다.",
        "후보근 모두가 정의역에 속하는지 검사한다.",
        "남은 두 근의 곱을 계산한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3, 5]);
      const center = randomInteger(0, 5);
      const inner = choose([1, 2, 3]);
      const outer = inner + 2;
      const constant =
        outer ** 2 - inner ** 2;
      const left = center - outer;
      const right = center + outer;
      const answer =
        mode === 0
          ? left + right
          : left * right;

      return makeShortAnswer({
        prompt:
          `방정식 $\\log_{${base}}\\{(x-${center})^2-${inner ** 2}\\}=\\log_{${base}}${constant}$의 ` +
          `서로 다른 두 실근을 $\\alpha,\\beta$라 할 때, ` +
          `$${mode === 0 ? "\\alpha+\\beta" : "\\alpha\\beta"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 * center
            : center ** 2 -
              outer ** 2,
        solution:
          `로그의 일대일성에서 $(x-${center})^2-${inner ** 2}=${constant}$, 즉 ` +
          `$(x-${center})^2=${outer ** 2}$이다. 두 근에서는 진수가 $${constant}>0$이므로 모두 가능하다. ` +
          `근은 $${left},${right}$이고 답은 $${answer}$이다.`,
        hintText:
          "로그를 없애기 전에 진수가 양수여야 한다는 조건을 적어 두세요.",
      });
    },
  },
  {
    id: "inverse-exponential-function",
    titles: [
      "평행이동한 지수함수의 역함숫값",
      "지수함수와 역함수의 대응점 결합",
    ],
    sourcePattern:
      "평행이동한 지수함수의 식을 역으로 풀어 역함숫값과 대칭 대응점을 계산",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "y=f(x)를 x에 대해 푼다.",
        "역함수의 정의역 조건을 확인한다.",
        "주어진 함숫값에 대응하는 지수를 찾는다.",
        "평행이동량을 반영해 역함숫값을 구한다.",
      ],
      [
        "f와 f^{-1}의 좌표가 y=x에 대칭임을 사용한다.",
        "주어진 출력값을 만드는 입력을 구한다.",
        "역함수의 대응값을 기록한다.",
        "두 대응 좌표의 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3]);
      const horizontal = randomInteger(1, 4);
      const vertical = randomInteger(1, 5);
      const exponent = randomInteger(2, 4);
      const target =
        power(base, exponent) +
        vertical;
      const inverseValue =
        exponent + horizontal;
      const answer =
        mode === 0
          ? inverseValue
          : inverseValue + target;

      return makeShortAnswer({
        prompt:
          `함수 $f(x)=${base}^{x-${horizontal}}+${vertical}$의 역함수를 $g$라 하자. ` +
          `$${mode === 0 ? `g(${target})` : `g(${target})+${target}`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? exponent + horizontal
            : exponent +
              horizontal +
              target,
        solution:
          `$f(${exponent + horizontal})=${base}^{${exponent}}+${vertical}=${target}$이므로 ` +
          `$g(${target})=${inverseValue}$. 따라서 답은 $${answer}$이다.`,
        hintText:
          "역함숫값 g(y)는 f(x)=y를 만족하는 입력 x입니다.",
      });
    },
  },
  {
    id: "exponential-amgm-minimum",
    titles: [
      "서로 역수인 지수항의 최솟값",
      "지수 치환과 산술·기하평균의 등호 조건",
    ],
    sourcePattern:
      "a^x를 양수 변수로 치환하고 산술·기하평균과 등호 조건으로 최솟값과 위치를 결정",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "t=a^x>0으로 치환한다.",
        "두 양수항의 곱이 일정함을 확인한다.",
        "산술·기하평균으로 최솟값을 구한다.",
        "등호 조건에서 x를 구해 목표값을 계산한다.",
      ],
      [
        "지수식 두 항을 t와 상수/t로 바꾼다.",
        "AM-GM 부등식을 적용한다.",
        "등호가 성립하는 t를 찾는다.",
        "지수함수의 일대일성으로 x를 복원한다.",
      ],
    ],
    generate(mode) {
      const base = choose([2, 3]);
      const center = randomInteger(1, 4);
      const minimum =
        2 * power(base, center);
      const answer =
        mode === 0
          ? minimum
          : minimum + center;

      return makeShortAnswer({
        prompt:
          `실수 $x$에 대하여 $F(x)=${base}^{x}+${base}^{${2 * center}-x}$라 하자. ` +
          `$F(x)$의 최솟값을 $m$, 그때의 $x$를 $p$라 할 때, ` +
          `$${mode === 0 ? "m" : "m+p"}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 *
              power(base, center)
            : 2 *
                power(base, center) +
              center,
        solution:
          `$t=${base}^{x}>0$이라 하면 $F=t+${base}^{2 * center}/t\\ge2${base}^{center}=${minimum}$. ` +
          `등호는 $t=${base}^{center}$, 즉 $x=${center}$일 때 성립한다. 따라서 답은 $${answer}$이다.`,
        hintText:
          "두 지수항의 곱이 x와 무관하다는 점을 이용하세요.",
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
