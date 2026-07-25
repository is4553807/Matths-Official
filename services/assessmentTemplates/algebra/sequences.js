const {
  randomInteger,
  choose,
  fraction,
  power,
  signed,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId = "algebra";
const unitId = "sequences";
const requiredConceptIds = [
  "algebra-03-01",
  "algebra-03-02",
  "algebra-03-03",
  "algebra-03-04",
  "algebra-03-05",
  "algebra-03-06",
  "algebra-03-07",
];

function arithmeticTerm(
  first,
  difference,
  index
) {
  return (
    first +
    (index - 1) * difference
  );
}

function arithmeticSum(
  first,
  difference,
  count
) {
  return (
    (count *
      (
        2 * first +
        (count - 1) *
          difference
      )) /
    2
  );
}

const families = [
  {
    id: "arithmetic-two-conditions",
    titles: [
      "두 항 조건에서 등차수열의 부분합 복원",
      "두 항 조건에서 등차수열의 특정 항 결합",
    ],
    sourcePattern:
      "서로 다른 두 항의 조건을 연립해 첫째항과 공차를 복원한 뒤 부분합 또는 항 결합 계산",
    estimatedMinutes: [10, 10],
    reasoningSteps: [
      [
        "일반항 a_n=a_1+(n-1)d를 세운다.",
        "두 항 조건을 연립해 공차를 구한다.",
        "첫째항을 복원한다.",
        "부분합 공식을 적용한다.",
      ],
      [
        "두 일반항 식을 뺀다.",
        "공차를 구하고 첫째항을 찾는다.",
        "요구한 두 항을 각각 계산한다.",
        "항의 결합값을 구한다.",
      ],
    ],
    generate(mode) {
      const first =
        randomInteger(-5, 6);
      const difference =
        choose([-3, -2, 2, 3, 4]);
      const p = randomInteger(2, 4);
      const q =
        p +
        randomInteger(3, 5);
      const target = q + 3;
      const answer =
        mode === 0
          ? arithmeticSum(
              first,
              difference,
              target
            )
          : arithmeticTerm(
              first,
              difference,
              target
            ) +
            arithmeticTerm(
              first,
              difference,
              p + 1
            );

      return makeShortAnswer({
        prompt:
          `등차수열 $\\{a_n\\}$이 $a_${p}=${arithmeticTerm(
            first,
            difference,
            p
          )}$, $a_${q}=${arithmeticTerm(
            first,
            difference,
            q
          )}$를 만족한다. ${
            mode === 0
              ? `첫째항부터 제${target}항까지의 합`
              : `$a_${target}+a_${p + 1}$`
          }을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? arithmeticSum(
                first,
                difference,
                target
              )
            : arithmeticTerm(
                first,
                difference,
                target
              ) +
              arithmeticTerm(
                first,
                difference,
                p + 1
              ),
        solution:
          `두 식을 빼면 $(${q}-${p})d=${(q - p) * difference}$이므로 $d=${difference}$. ` +
          `$a_1=${first}$을 얻는다. ${
            mode === 0
              ? `$S_${target}=\\frac{${target}}2\\{2(${first})+${target - 1}(${difference})\\}=${answer}$.`
              : `일반항을 대입하면 요구한 값은 ${answer}이다.`
          }`,
        hintText:
          "두 항의 차에서는 첫째항이 소거됩니다. 공차부터 구하세요.",
      });
    },
  },
  {
    id: "partial-sum-two-values",
    titles: [
      "두 부분합에서 등차수열의 계수 복원",
      "부분합 조건으로 음수가 되는 첫 항 찾기",
    ],
    sourcePattern:
      "등차수열 부분합을 이차식으로 보고 두 조건에서 첫째항·공차 또는 부호 전환 시점 복원",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "등차수열의 부분합 공식을 쓴다.",
        "두 부분합 조건을 연립한다.",
        "첫째항과 공차를 구한다.",
        "목표 부분합을 계산한다.",
      ],
      [
        "부분합 조건으로 수열을 복원한다.",
        "일반항을 구한다.",
        "부등식 a_n<0을 푼다.",
        "가장 작은 자연수 n을 고른다.",
      ],
    ],
    generate(mode) {
      const first =
        randomInteger(6, 12);
      const difference =
        choose([-3, -2]);
      const m = 3;
      const n = 6;
      const target = 9;
      const firstNegative =
        Math.floor(
          first /
            -difference
        ) + 2;
      const answer =
        mode === 0
          ? arithmeticSum(
              first,
              difference,
              target
            )
          : firstNegative;

      return makeShortAnswer({
        prompt:
          `등차수열 $\\{a_n\\}$의 첫째항부터 제$n$항까지의 합을 $S_n$이라 하자. ` +
          `$S_${m}=${arithmeticSum(
            first,
            difference,
            m
          )}$, $S_${n}=${arithmeticSum(
            first,
            difference,
            n
          )}$일 때, ${
            mode === 0
              ? `$S_${target}$`
              : "$a_n<0$이 되는 가장 작은 자연수 $n$"
          }을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? arithmeticSum(
                first,
                difference,
                target
              )
            : firstNegative,
        solution:
          `부분합 공식 두 식을 연립하면 $a_1=${first},d=${difference}$이다. ` +
          `${
            mode === 0
              ? `따라서 $S_${target}=${answer}$.`
              : `$a_n=${first}+(${difference})(n-1)<0$을 풀면 가장 작은 자연수는 ${answer}이다.`
          }`,
        hintText:
          "부분합 두 식을 첫째항과 공차에 대한 연립방정식으로 보세요.",
      });
    },
  },
  {
    id: "geometric-reverse",
    titles: [
      "두 등비수열 항에서 공비와 부분합 복원",
      "등비수열 항의 곱 조건에서 중간항 복원",
    ],
    sourcePattern:
      "떨어진 두 항의 비 또는 곱을 이용해 공비·중간항을 찾고 합까지 연결",
    estimatedMinutes: [11, 10],
    reasoningSteps: [
      [
        "두 항의 비로 r의 거듭제곱을 만든다.",
        "양의 공비 조건으로 r을 결정한다.",
        "첫째항을 복원한다.",
        "등비수열의 합 공식을 적용한다.",
      ],
      [
        "등비수열에서 같은 거리의 항 곱 성질을 찾는다.",
        "가운데 항의 제곱으로 바꾼다.",
        "양수 조건으로 가운데 항을 구한다.",
        "요구한 항 결합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const first =
        randomInteger(1, 4);
      const ratio = choose([2, 3]);
      const p = 2;
      const q = 5;
      const count = 6;
      const sum =
        first *
        (
          power(ratio, count) -
          1
        ) /
        (ratio - 1);
      const middle =
        first * power(ratio, 3);
      const answer =
        mode === 0
          ? sum
          : middle;

      return makeShortAnswer({
        prompt:
          `모든 항이 양수인 등비수열 $\\{a_n\\}$에서 $a_${p}=${first * power(ratio, p - 1)}$, ` +
          `$a_${q}=${first * power(ratio, q - 1)}$이다. ${
            mode === 0
              ? `$a_1+a_2+\\cdots+a_${count}$`
              : `$\\sqrt{a_2a_6}$`
          }의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? sum
            : Math.sqrt(
                (
                  first * ratio
                ) *
                  (
                    first *
                    power(
                      ratio,
                      5
                    )
                  )
              ),
        solution:
          `$a_${q}/a_${p}=r^{${q - p}}=${power(
            ratio,
            q - p
          )}$이고 $r>0$이므로 $r=${ratio}$, $a_1=${first}$. ` +
          `${
            mode === 0
              ? `등비수열의 합은 ${sum}이다.`
              : `$a_2a_6=a_4^2$이고 모든 항이 양수이므로 $\\sqrt{a_2a_6}=a_4=${middle}$.`
          }`,
        hintText:
          "떨어진 두 항의 비로 공비의 거듭제곱을 먼저 구하세요.",
      });
    },
  },
  {
    id: "partial-sum-polynomial",
    titles: [
      "부분합 다항식에서 일반항과 홀수항 합 복원",
      "부분합 식에서 특정 구간의 항 합 계산",
    ],
    sourcePattern:
      "S_n-S_{n-1}로 일반항을 복원하고 필요한 항만 다시 합하는 유형",
    estimatedMinutes: [11, 10],
    reasoningSteps: [
      [
        "a_1=S_1을 따로 확인한다.",
        "n≥2에서 a_n=S_n-S_{n-1}을 계산한다.",
        "홀수 번째 항의 일반식을 만든다.",
        "등차수열의 합으로 정리한다.",
      ],
      [
        "부분합에서 일반항을 복원한다.",
        "구간합을 부분합의 차로도 표현한다.",
        "두 계산 경로가 일치하는지 확인한다.",
        "목표 구간합을 계산한다.",
      ],
    ],
    generate(mode) {
      const c = randomInteger(
        -2,
        4
      );
      const m = randomInteger(4, 6);
      const partial = (n) =>
        n ** 2 + c * n;
      const oddSum = Array.from(
        { length: m },
        (_, index) => {
          const n = 2 * index + 1;
          return 2 * n - 1 + c;
        }
      ).reduce(
        (sum, value) =>
          sum + value,
        0
      );
      const rangeSum =
        partial(m + 3) -
        partial(2);
      const answer =
        mode === 0
          ? oddSum
          : rangeSum;

      return makeShortAnswer({
        prompt:
          `수열 $\\{a_n\\}$의 첫째항부터 제$n$항까지의 합이 $S_n=n^2${signed(
            c
          )}n$이다. ` +
          `$${ 
            mode === 0
              ? `a_1+a_3+\\cdots+a_${2 * m - 1}`
              : `a_3+a_4+\\cdots+a_${m + 3}`
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? oddSum
            : partial(m + 3) -
              partial(2),
        solution:
          `$a_n=S_n-S_{n-1}=2n${signed(
            c - 1
          )}$이다. ` +
          `${
            mode === 0
              ? `홀수 번째 지수를 대입해 ${m}개 항을 합하면 ${answer}이다.`
              : `또는 바로 $S_${m + 3}-S_2=${answer}$로 계산할 수 있다.`
          }`,
        hintText:
          "일반항은 부분합의 이웃한 두 값의 차입니다.",
      });
    },
  },
  {
    id: "periodic-recurrence",
    titles: [
      "주기 2 점화식의 장기 합",
      "주기 점화식의 특정 항과 부분합 결합",
    ],
    sourcePattern:
      "점화식을 여러 번 적용해 짧은 주기를 발견하고 큰 지수의 항·합을 블록으로 계산",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "점화식으로 앞의 몇 항을 계산한다.",
        "a_{n+2}=a_n인 주기를 증명한다.",
        "두 항씩 묶은 합을 구한다.",
        "블록 수를 이용해 전체 합을 계산한다.",
      ],
      [
        "초기 항에서 주기 2를 찾는다.",
        "목표 항의 홀짝을 판정한다.",
        "완전한 두 항 블록의 합을 계산한다.",
        "목표 항과 부분합을 결합한다.",
      ],
    ],
    generate(mode) {
      const constant =
        randomInteger(5, 12);
      const first = randomInteger(
        1,
        constant - 1
      );
      const pairs =
        randomInteger(8, 14);
      const evenCount = 2 * pairs;
      const answer =
        mode === 0
          ? pairs * constant
          : pairs * constant +
            first;

      return makeShortAnswer({
        prompt:
          `수열 $\\{a_n\\}$이 $a_1=${first}$, $a_{n+1}=${constant}-a_n$을 만족한다. ` +
          `$${ 
            mode === 0
              ? `\\sum_{k=1}^{${evenCount}}a_k`
              : `\\sum_{k=1}^{${evenCount}}a_k+a_${evenCount + 1}`
          }$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? pairs * constant
            : pairs * constant +
              first,
        solution:
          `$a_{n+2}=${constant}-a_{n+1}=a_n$이므로 주기는 2이고 ` +
          `$a_{2j-1}+a_{2j}=${constant}$이다. 완전한 블록이 ${pairs}개이며 ` +
          `${mode === 0 ? "" : `$a_${evenCount + 1}=a_1=${first}$이므로 `}답은 ${answer}이다.`,
        hintText:
          "점화식을 두 번 연속 적용해 a_{n+2}와 a_n을 비교하세요.",
      });
    },
  },
  {
    id: "weighted-arithmetic-sum",
    titles: [
      "등차수열과 자연수의 가중합",
      "홀수 가중치를 곱한 등차수열의 합",
    ],
    sourcePattern:
      "등차수열의 일반항을 복원한 뒤 자연수 또는 홀수 가중치를 곱해 시그마 공식으로 합산",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "두 항 조건으로 첫째항과 공차를 구한다.",
        "일반항을 n의 일차식으로 나타낸다.",
        "k a_k를 이차식으로 전개한다.",
        "자연수의 합과 제곱의 합을 적용한다.",
      ],
      [
        "등차수열의 일반항을 구한다.",
        "(2k-1)a_k를 이차식으로 정리한다.",
        "필요한 시그마 공식을 각각 적용한다.",
        "합친 값을 직접 합산해 검산한다.",
      ],
    ],
    generate(mode) {
      const first = randomInteger(1, 5);
      const difference = choose([2, 3]);
      const count = randomInteger(5, 8);
      const weight = (index) =>
        mode === 0
          ? index
          : 2 * index - 1;
      const answer = Array.from(
        { length: count },
        (_, index) =>
          weight(index + 1) *
          arithmeticTerm(
            first,
            difference,
            index + 1
          )
      ).reduce(
        (sum, value) => sum + value,
        0
      );

      return makeShortAnswer({
        prompt:
          `등차수열 $\\{a_n\\}$이 $a_1=${first}$, $a_4=${arithmeticTerm(first, difference, 4)}$를 만족한다. ` +
          `$\\sum_{k=1}^{${count}}${mode === 0 ? "k" : "(2k-1)"}a_k$의 값을 구하시오.`,
        answer,
        independentAnswer: Array.from(
          { length: count },
          (_, index) =>
            weight(index + 1) *
            (first +
              index * difference)
        ).reduce(
          (sum, value) =>
            sum + value,
          0
        ),
        solution:
          `$a_n=${first}${signed(difference)}(n-1)$이고 이를 합 안에 대입한다. ` +
          `$\\sum k=${count * (count + 1) / 2}$, ` +
          `$\\sum k^2=${count * (count + 1) * (2 * count + 1) / 6}$을 이용해 정리하면 ${answer}이다.`,
        hintText:
          "일반항을 먼저 구한 뒤 가중치와 곱해 k의 다항식으로 전개하세요.",
      });
    },
  },
  {
    id: "geometric-block-sums",
    titles: [
      "등비수열의 연속 블록 합 비율",
      "두 블록 합에서 공비와 다음 블록 합 복원",
    ],
    sourcePattern:
      "길이가 같은 연속 구간의 합이 공비의 거듭제곱배가 된다는 성질로 다음 블록을 계산",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "첫 블록을 등비수열의 합으로 나타낸다.",
        "다음 블록의 각 항이 공비의 일정 거듭제곱배임을 확인한다.",
        "두 블록 합의 비를 계산한다.",
        "주어진 첫 블록 합으로 목표 합을 구한다.",
      ],
      [
        "같은 길이 블록 사이의 배율을 구한다.",
        "양의 공비 조건에서 공비를 복원한다.",
        "다음 블록에도 같은 배율을 적용한다.",
        "요구한 두 블록 합의 차를 계산한다.",
      ],
    ],
    generate(mode) {
      const ratio = choose([2, 3]);
      const block = choose([2, 3]);
      const first = randomInteger(1, 3);
      const blockSum = (start) =>
        Array.from(
          { length: block },
          (_, index) =>
            first *
            power(
              ratio,
              start + index - 1
            )
        ).reduce(
          (sum, value) =>
            sum + value,
          0
        );
      const firstBlock =
        blockSum(1);
      const secondBlock =
        blockSum(block + 1);
      const thirdBlock =
        blockSum(2 * block + 1);
      const answer =
        mode === 0
          ? secondBlock
          : thirdBlock - secondBlock;

      return makeShortAnswer({
        prompt:
          `공비가 양수인 등비수열 $\\{a_n\\}$에서 ` +
          `$a_1+\\cdots+a_${block}=${firstBlock}$, ` +
          `$a_${block + 1}=${power(ratio, block)}a_1$이다. ` +
          `$${mode === 0 ? `a_${block + 1}+\\cdots+a_${2 * block}` : `(a_${2 * block + 1}+\\cdots+a_${3 * block})-(a_${block + 1}+\\cdots+a_${2 * block})`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? firstBlock *
              power(ratio, block)
            : firstBlock *
                power(
                  ratio,
                  2 * block
                ) -
              firstBlock *
                power(ratio, block),
        solution:
          `$r^{${block}}=${power(ratio, block)}$이고 $r>0$이므로 $r=${ratio}$. ` +
          `길이가 ${block}인 다음 블록의 합은 앞 블록 합의 $r^{${block}}=${power(ratio, block)}$배이다. ` +
          `${mode === 0 ? "" : `따라서 셋째 블록 합은 ${thirdBlock}이고 `}요구한 값은 ${answer}이다.`,
        hintText:
          "같은 길이만큼 지수가 이동하면 블록 전체에 같은 r의 거듭제곱이 곱해집니다.",
      });
    },
  },
  {
    id: "telescoping-reciprocal-sum",
    titles: [
      "부분분수 분해로 소거되는 수열의 합",
      "간격이 있는 역수 곱의 망원합",
    ],
    sourcePattern:
      "연속하거나 일정 간격인 두 일차식의 곱을 부분분수로 분해해 중간항을 소거",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "일반항을 두 단위분수의 차로 분해한다.",
        "앞의 몇 항을 써 소거 구조를 확인한다.",
        "처음과 마지막에 남는 항만 모은다.",
        "기약분수로 정리한다.",
      ],
      [
        "1/((k+c)(k+c+d))를 간격 d를 반영해 분해한다.",
        "시그마를 두 합의 차로 나눈다.",
        "겹치는 중간항을 소거한다.",
        "경계항을 통분해 답을 구한다.",
      ],
    ],
    generate(mode) {
      const count = randomInteger(5, 10);
      const gap = mode === 0 ? 1 : 2;
      const start = randomInteger(1, 3);
      let numerator = 0;
      let denominator = 1;
      for (
        let index = 1;
        index <= count;
        index += 1
      ) {
        const termDenominator =
          (index + start) *
          (index + start + gap);
        numerator =
          numerator *
            termDenominator +
          denominator;
        denominator *=
          termDenominator;
        const divisor = (function common(
          left,
          right
        ) {
          return right
            ? common(
                right,
                left % right
              )
            : Math.abs(left);
        })(numerator, denominator);
        numerator /= divisor;
        denominator /= divisor;
      }
      const answer = fraction(
        numerator,
        denominator
      );

      return makeShortAnswer({
        prompt:
          `$\\sum_{k=1}^{${count}}\\dfrac{1}{(k+${start})(k+${start + gap})}$의 값을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          fraction(
            numerator,
            denominator
          ),
        solution:
          `일반항은 $\\dfrac1{${gap}}\\{\\dfrac1{k+${start}}-\\dfrac1{k+${start + gap}}\\}$로 분해된다. ` +
          `중간항을 소거하고 경계항을 합치면 $${answer}$이다.`,
        hintText:
          "분모의 두 일차식 각각을 분모로 갖는 두 분수의 차로 바꾸세요.",
      });
    },
  },
  {
    id: "affine-recurrence-shift",
    titles: [
      "상수 평행이동으로 등비수열이 되는 점화식",
      "일차 점화식의 불변점과 부분합",
    ],
    sourcePattern:
      "a_{n+1}=ra_n+c의 불변점을 찾아 수열을 평행이동한 뒤 등비수열로 해석",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "점화식의 불변점 L을 구한다.",
        "b_n=a_n-L로 새 수열을 정의한다.",
        "b_n이 등비수열임을 확인한다.",
        "일반항을 복원해 목표 항을 계산한다.",
      ],
      [
        "상수항이 사라지는 평행이동량을 찾는다.",
        "변환한 등비수열의 일반항을 구한다.",
        "원래 수열의 부분합을 등비합과 상수합으로 나눈다.",
        "두 합을 결합해 답을 구한다.",
      ],
    ],
    generate(mode) {
      const ratio = choose([2, 3]);
      const fixed = randomInteger(1, 4);
      const first =
        fixed + randomInteger(1, 3);
      const count = randomInteger(5, 7);
      const term = (index) =>
        fixed +
        (first - fixed) *
          power(
            ratio,
            index - 1
          );
      const answer =
        mode === 0
          ? term(count)
          : Array.from(
              { length: count },
              (_, index) =>
                term(index + 1)
            ).reduce(
              (sum, value) =>
                sum + value,
              0
            );

      return makeShortAnswer({
        prompt:
          `수열 $\\{a_n\\}$이 $a_1=${first}$, ` +
          `$a_{n+1}=${ratio}a_n${signed((1 - ratio) * fixed)}$을 만족한다. ` +
          `$${mode === 0 ? `a_${count}` : `\\sum_{k=1}^{${count}}a_k`}$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? fixed +
              (first - fixed) *
                power(
                  ratio,
                  count - 1
                )
            : count * fixed +
              (first - fixed) *
                (
                  power(ratio, count) -
                  1
                ) /
                (ratio - 1),
        solution:
          `$b_n=a_n-${fixed}$라 하면 $b_{n+1}=${ratio}b_n$이고 $b_1=${first - fixed}$. ` +
          `$a_n=${fixed}+${first - fixed}\\cdot${ratio}^{n-1}$이므로 요구한 값은 ${answer}이다.`,
        hintText:
          "점화식에 대입해도 그대로 유지되는 상수값을 찾아 빼 보세요.",
      });
    },
  },
  {
    id: "arithmetic-geometric-sum",
    titles: [
      "등차·등비가 섞인 합의 이동 소거",
      "k와 지수항의 곱을 포함한 시그마",
    ],
    sourcePattern:
      "등차계수와 등비항이 곱해진 합에 공비를 곱하고 한 칸 이동해 두 식을 빼는 유형",
    estimatedMinutes: [14, 15],
    reasoningSteps: [
      [
        "구하려는 합을 S로 둔다.",
        "S에 공비를 곱해 항을 한 칸 맞춘다.",
        "두 식을 빼 중간의 등비항을 정리한다.",
        "등비수열의 합을 적용해 S를 구한다.",
      ],
      [
        "k r^{k-1} 형태의 합을 쓴다.",
        "공비를 곱한 식과 원식을 뺀다.",
        "남은 상수배 등비합을 계산한다.",
        "끝항을 포함해 최종값을 검산한다.",
      ],
    ],
    generate(mode) {
      const ratio = choose([2, 3]);
      const count = randomInteger(5, 7);
      const answer = Array.from(
        { length: count },
        (_, index) => {
          const k = index + 1;
          return (
            (mode === 0
              ? k
              : 2 * k - 1) *
            power(ratio, k - 1)
          );
        }
      ).reduce(
        (sum, value) => sum + value,
        0
      );

      return makeShortAnswer({
        prompt:
          `$\\sum_{k=1}^{${count}}${mode === 0 ? "k" : "(2k-1)"}\\cdot${ratio}^{k-1}$의 값을 구하시오.`,
        answer,
        independentAnswer: Array.from(
          { length: count },
          (_, index) =>
            (mode === 0
              ? index + 1
              : 2 * index + 1) *
            power(ratio, index)
        ).reduce(
          (sum, value) =>
            sum + value,
          0
        ),
        solution:
          `주어진 합을 $S$라 하고 ${ratio}S를 한 항씩 밀어 쓴 뒤 두 식을 뺀다. ` +
          `남은 등비수열의 합과 마지막 항을 정리하면 $S=${answer}$이다.`,
        hintText:
          "합 전체에 공비를 곱한 식을 원래 식과 위아래로 맞춰 빼세요.",
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
