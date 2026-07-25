const {
  randomInteger,
  choose,
  fraction,
  nCr,
  power,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId =
  "probability-statistics";
const unitId = "probability";
const requiredConceptIds = [
  "probability-statistics-02-01",
  "probability-statistics-02-02",
  "probability-statistics-02-03",
  "probability-statistics-02-04",
  "probability-statistics-02-05",
  "probability-statistics-02-06",
];

const families = [
  {
    id: "bayes-two-sources",
    titles: [
      "두 주머니의 결과에서 원인을 역추론하는 조건부확률",
      "서로 다른 사전확률을 가진 두 원인의 베이즈 계산",
    ],
    sourcePattern:
      "원인을 먼저 선택하고 결과를 관찰한 상황에서 곱셈정리와 전체확률로 사후확률 계산",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "각 주머니가 선택될 확률을 정한다.",
        "각 주머니에서 빨간 공이 나올 결합확률을 구한다.",
        "빨간 공이 나올 전체확률을 더한다.",
        "목표 결합확률을 전체확률로 나눈다.",
      ],
      [
        "사전확률과 조건부확률을 곱한다.",
        "두 원인의 관찰 결과 확률을 구한다.",
        "전체확률법칙으로 분모를 만든다.",
        "베이즈 형태로 사후확률을 계산한다.",
      ],
    ],
    generate(mode) {
      const totalA =
        randomInteger(5, 8);
      const totalB =
        randomInteger(5, 8);
      const redA =
        randomInteger(
          1,
          totalA - 1
        );
      const redB =
        randomInteger(
          1,
          totalB - 1
        );
      const priorA =
        mode === 0 ? 1 : 2;
      const priorB =
        mode === 0 ? 1 : 1;
      const numerator =
        priorA *
        redA *
        totalB;
      const denominator =
        numerator +
        priorB *
          redB *
          totalA;
      const answer = fraction(
        numerator,
        denominator
      );

      return makeShortAnswer({
        prompt:
          `주머니 A에는 빨간 공 ${redA}개를 포함해 ${totalA}개, B에는 빨간 공 ${redB}개를 포함해 ${totalB}개의 공이 있다. ` +
          `${
            mode === 0
              ? "두 주머니 중 하나를 같은 확률로"
              : "A와 B를 각각 2/3, 1/3의 확률로"
          } 골라 공 한 개를 꺼냈더니 빨간 공이었다. A를 골랐을 확률을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          fraction(
            numerator,
            denominator
          ),
        solution:
          `A에서 빨강이 나오는 결합확률과 B에서 빨강이 나오는 결합확률을 각각 구한다. ` +
          `조건부확률은 전자를 두 결합확률의 합으로 나눈 값이므로 ${answer}이다.`,
        hintText:
          "원인 선택 확률×그 원인에서 결과가 나올 확률을 두 경우 각각 계산하세요.",
      });
    },
  },
  {
    id: "without-replacement-condition",
    titles: [
      "비복원 추출에서 첫 결과를 조건으로 한 확률",
      "두 번 추출의 결과를 관찰한 뒤 첫 추출 역추론",
    ],
    sourcePattern:
      "비복원 추출에서 첫 시행 후 남은 구성 변화를 반영하거나 관찰 결과로 순서를 역추론",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "첫 추출 결과로 남은 공의 구성을 갱신한다.",
        "조건이 된 표본공간을 고정한다.",
        "둘째 추출의 유리한 경우와 전체 경우를 센다.",
        "조건부확률을 기약분수로 정리한다.",
      ],
      [
        "가능한 색 순서를 나열한다.",
        "각 순서의 결합확률을 곱셈정리로 구한다.",
        "관찰 조건을 만족하는 순서만 남긴다.",
        "목표 순서의 확률을 조건 전체로 나눈다.",
      ],
    ],
    generate(mode) {
      const red =
        randomInteger(3, 6);
      const blue =
        randomInteger(3, 6);
      const total = red + blue;
      const answer =
        mode === 0
          ? fraction(
              red - 1,
              total - 1
            )
          : "1/2";

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `빨간 공 ${red}개와 파란 공 ${blue}개가 든 주머니에서 공을 한 개씩 되돌려 넣지 않고 두 번 꺼낸다. 첫째 공이 빨간색일 때 둘째 공도 빨간색일 확률을 구하시오.`
            : `빨간 공 ${red}개와 파란 공 ${blue}개가 든 주머니에서 공을 한 개씩 되돌려 넣지 않고 두 번 꺼냈더니 두 공의 색이 달랐다. 첫째 공이 빨간색이었을 확률을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                red - 1,
                total - 1
              )
            : fraction(
                red * blue,
                red * blue +
                  blue * red
              ),
        solution:
          mode === 0
            ? `첫째 공이 빨강이면 남은 ${total - 1}개 중 빨간 공은 ${red - 1}개이므로 확률은 ${answer}.`
            : `색이 다른 순서는 RB와 BR이다. 두 순서의 확률은 모두 $\\frac{${red}}{${total}}\\frac{${blue}}{${total - 1}}$로 같으므로 조건 아래에서 각각 1/2이다.`,
        hintText:
          "되돌려 넣지 않으므로 첫 추출 뒤 분자와 분모가 어떻게 바뀌는지 적으세요.",
      });
    },
  },
  {
    id: "independent-repeated-events",
    titles: [
      "독립 반복에서 적어도 한 번 성공할 확률",
      "첫 성공 시점이 제한 안에 있을 조건부확률",
    ],
    sourcePattern:
      "독립시행의 여사건 또는 첫 성공 시점별 배반사건을 이용한 반복확률",
    estimatedMinutes: [10, 12],
    reasoningSteps: [
      [
        "한 번 실패할 확률을 구한다.",
        "모두 실패하는 확률을 독립 곱으로 계산한다.",
        "여사건을 취한다.",
        "분수를 기약화한다.",
      ],
      [
        "첫 성공이 각 시행에서 일어날 사건을 나눈다.",
        "각 사건의 확률을 독립 곱으로 구한다.",
        "조건 사건의 전체확률을 구한다.",
        "목표 시점까지의 확률을 나눠 조건부확률을 계산한다.",
      ],
    ],
    generate(mode) {
      const denominator =
        choose([3, 4, 5]);
      const numerator =
        denominator - 1;
      const trials =
        randomInteger(3, 5);
      const fail =
        denominator -
        numerator;
      const atLeast =
        fraction(
          power(
            denominator,
            trials
          ) -
            power(fail, trials),
          power(
            denominator,
            trials
          )
        );
      const byTwoGivenByN =
        fraction(
          (
            denominator ** 2 -
            fail ** 2
          ) *
            denominator **
              (trials - 2),
          denominator ** trials -
            fail ** trials
        );
      const answer =
        mode === 0
          ? atLeast
          : byTwoGivenByN;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `한 번 성공할 확률이 $\\frac{${numerator}}{${denominator}}$인 독립시행을 ${trials}번 할 때 적어도 한 번 성공할 확률을 구하시오.`
            : `한 번 성공할 확률이 $\\frac{${numerator}}{${denominator}}$인 독립시행을 성공할 때까지 반복하되 최대 ${trials}번만 한다. ${trials}번 안에 성공했다는 조건에서 2번 안에 성공했을 확률을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? atLeast
            : fraction(
                (
                  denominator ** 2 -
                  fail ** 2
                ) *
                  denominator **
                    (trials - 2),
                denominator **
                    trials -
                  fail ** trials
              ),
        solution:
          mode === 0
            ? `모두 실패할 확률을 1에서 빼면 ${answer}이다.`
            : `2번 안에 성공할 사건은 ${trials}번 안에 성공할 사건에 포함된다. 따라서 ` +
              `$\\frac{1-q^2}{1-q^{${trials}}}$를 계산하면 답을 얻는다.`,
        hintText:
          "적어도 한 번 성공은 모두 실패의 여사건입니다.",
      });
    },
  },
  {
    id: "three-event-inclusion-exclusion",
    titles: [
      "세 사건의 합사건 확률 포함배제",
      "적어도 두 사건이 일어날 확률",
    ],
    sourcePattern:
      "세 사건의 개별·쌍별·삼중 교집합 확률을 포함배제 또는 지시함수 계수로 결합",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "세 개별사건 확률을 더한다.",
        "쌍별 교집합을 한 번씩 뺀다.",
        "삼중 교집합을 다시 더한다.",
        "여사건이 필요하면 마지막에 1에서 뺀다.",
      ],
      [
        "정확히 세 사건이 일어나는 확률을 분리한다.",
        "쌍별 교집합 합에서 삼중교집합이 세 번 세어짐을 확인한다.",
        "적어도 두 사건 확률로 계수를 보정한다.",
        "기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const denominator = 20;
      const singles = [9, 10, 11];
      const pairs = [4, 3, 5];
      const triple = 2;
      const union =
        singles.reduce(
          (sum, value) =>
            sum + value,
          0
        ) -
        pairs.reduce(
          (sum, value) =>
            sum + value,
          0
        ) +
        triple;
      const atLeastTwo =
        pairs.reduce(
          (sum, value) =>
            sum + value,
          0
        ) -
        2 * triple;
      const answer =
        mode === 0
          ? fraction(
              union,
              denominator
            )
          : fraction(
              atLeastTwo,
              denominator
            );

      return makeShortAnswer({
        prompt:
          `세 사건 $A,B,C$에 대하여 $P(A),P(B),P(C)$의 분자가 각각 ${singles.join(
            ","
          )}, ` +
          `$P(A\\cap B),P(B\\cap C),P(C\\cap A)$의 분자가 각각 ${pairs.join(
            ","
          )}, ` +
          `$P(A\\cap B\\cap C)$의 분자가 ${triple}이고 모든 분모는 ${denominator}이다. ` +
          `${
            mode === 0
              ? "P(A\\cup B\\cup C)"
              : "세 사건 중 적어도 두 사건이 일어날 확률"
          }을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                union,
                denominator
              )
            : fraction(
                atLeastTwo,
                denominator
              ),
        solution:
          mode === 0
            ? "세 개별확률의 합에서 세 쌍별 교집합을 빼고 삼중교집합을 더한다."
            : "쌍별 교집합의 합에서는 삼중교집합이 세 번 세어지지만 적어도 두 사건 확률에서는 한 번만 세어야 하므로 두 번 뺀다.",
        hintText:
          "삼중교집합이 현재 몇 번 세어졌는지 계수를 추적하세요.",
      });
    },
  },
  {
    id: "conditional-dice-sum",
    titles: [
      "두 주사위 합 조건에서 곱의 성질 확률",
      "최댓값 조건으로 축소된 표본공간의 조건부확률",
    ],
    sourcePattern:
      "관찰된 합·최댓값 조건을 만족하는 순서쌍만 다시 열거해 조건부 표본공간 구성",
    estimatedMinutes: [11, 11],
    reasoningSteps: [
      [
        "두 주사위 순서쌍을 표본점으로 둔다.",
        "합 조건을 만족하는 순서쌍만 나열한다.",
        "그중 곱의 목표 성질을 만족하는 경우를 센다.",
        "조건 표본공간 크기로 나눈다.",
      ],
      [
        "최댓값 조건을 만족하는 순서쌍을 센다.",
        "두 눈이 다른 경우만 추린다.",
        "조건 아래 모든 순서쌍이 같은 가능성인지 확인한다.",
        "유리한 경우를 전체로 나눈다.",
      ],
    ],
    generate(mode) {
      const targetSum =
        randomInteger(6, 9);
      const targetMax =
        randomInteger(3, 6);
      const pairs = [];

      for (
        let first = 1;
        first <= 6;
        first += 1
      ) {
        for (
          let second = 1;
          second <= 6;
          second += 1
        ) {
          pairs.push([
            first,
            second,
          ]);
        }
      }

      const condition =
        mode === 0
          ? pairs.filter(
              ([a, b]) =>
                a + b ===
                targetSum
            )
          : pairs.filter(
              ([a, b]) =>
                Math.max(a, b) ===
                targetMax
            );
      const favorable =
        mode === 0
          ? condition.filter(
              ([a, b]) =>
                (a * b) % 2 === 0
            )
          : condition.filter(
              ([a, b]) => a !== b
            );
      const answer = fraction(
        favorable.length,
        condition.length
      );

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `서로 다른 두 주사위를 던져 나온 눈의 합이 ${targetSum}이었다. 두 눈의 곱이 짝수일 확률을 구하시오.`
            : `서로 다른 두 주사위를 던져 나온 두 눈의 최댓값이 ${targetMax}였다. 두 눈이 서로 다를 확률을 구하시오.`,
        answer,
        independentAnswer:
          fraction(
            favorable.length,
            condition.length
          ),
        solution:
          `조건을 만족하는 순서쌍을 모두 나열하면 ${condition.length}개이고, 그중 목표 사건은 ${favorable.length}개이다. ` +
          `조건부확률은 ${answer}이다.`,
        hintText:
          "원래 36개가 아니라 관찰 조건을 만족하는 순서쌍만 새 표본공간으로 쓰세요.",
      });
    },
  },
  {
    id: "fixed-position-permutation",
    titles: [
      "무작위 순열에서 두 지정 원소가 모두 제자리를 피할 확률",
      "무작위 순열에서 두 지정 원소가 모두 제자리일 확률",
    ],
    sourcePattern:
      "전체 순열에서 지정 원소의 고정 사건을 포함배제로 세거나 두 자리를 고정한 뒤 나머지를 배열",
    estimatedMinutes: [12, 11],
    reasoningSteps: [
      [
        "전체 순열의 수를 센다.",
        "각 지정 원소가 제자리인 사건의 크기를 구한다.",
        "두 사건의 교집합 크기를 구한다.",
        "포함배제로 두 원소가 모두 제자리를 피할 확률을 계산한다.",
      ],
      [
        "두 지정 원소의 자리를 고정한다.",
        "나머지 원소의 순열 수를 센다.",
        "전체 순열 수로 나눈다.",
        "계승을 약분해 기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const size = randomInteger(5, 8);
      const numerator =
        mode === 0
          ? size ** 2 -
            3 * size +
            3
          : 1;
      const denominator =
        size * (size - 1);
      const answer = fraction(
        numerator,
        denominator
      );

      return makeShortAnswer({
        prompt:
          `서로 다른 ${size}개의 카드를 무작위로 한 줄에 배열한다. 지정된 두 카드 A, B에 대하여 ` +
          `${mode === 0 ? "A와 B가 모두 원래 자기 자리에 놓이지 않을" : "A와 B가 모두 원래 자기 자리에 놓일"} 확률을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                size ** 2 -
                  3 * size +
                  3,
                size *
                  (size - 1)
              )
            : fraction(
                1,
                size *
                  (size - 1)
              ),
        solution:
          mode === 0
            ? `A 또는 B가 제자리인 확률에 포함배제를 적용하면 $1-2/${size}+1/(${size}(${size}-1))=${answer}$이다.`
            : `두 자리를 고정한 배열은 $(${size}-2)!$개, 전체는 $${size}!$개이므로 확률은 ${answer}이다.`,
        hintText:
          mode === 0
            ? "A가 제자리인 사건과 B가 제자리인 사건의 합집합을 먼저 구하세요."
            : "두 자리를 고정한 뒤 나머지만 배열하세요.",
      });
    },
  },
  {
    id: "first-success-stopping",
    titles: [
      "독립시행에서 첫 성공 시점의 확률",
      "기한 내 성공 조건에서 마지막 시행 첫 성공의 조건부확률",
    ],
    sourcePattern:
      "독립 베르누이 시행에서 앞선 실패들의 곱과 현재 성공확률을 결합하고 조건부 표본공간으로 정규화",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "한 시행의 성공확률과 실패확률을 구분한다.",
        "목표 시점 전까지 모두 실패할 확률을 곱한다.",
        "목표 시점에 성공할 확률을 곱한다.",
        "거듭제곱을 계산해 기약분수로 정리한다.",
      ],
      [
        "k회째 첫 성공 사건의 확률을 구한다.",
        "k회 이내 적어도 한 번 성공할 확률을 여사건으로 구한다.",
        "첫 사건이 조건 사건에 포함됨을 확인한다.",
        "두 확률의 비로 조건부확률을 계산한다.",
      ],
    ],
    generate(mode) {
      const denominator = choose([2, 3, 4]);
      const successNumerator = 1;
      const failureNumerator =
        denominator - 1;
      const attempt = randomInteger(3, 5);
      const firstNumerator =
        power(
          failureNumerator,
          attempt - 1
        ) *
        successNumerator;
      const firstDenominator =
        power(
          denominator,
          attempt
        );
      const byAttemptNumerator =
        power(
          denominator,
          attempt
        ) -
        power(
          failureNumerator,
          attempt
        );
      const answer =
        mode === 0
          ? fraction(
              firstNumerator,
              firstDenominator
            )
          : fraction(
              firstNumerator,
              byAttemptNumerator
            );

      return makeShortAnswer({
        prompt:
          `성공확률이 $1/${denominator}$인 독립시행을 반복한다. ` +
          `${mode === 0 ? `제${attempt}회 시행에서 처음 성공할` : `제${attempt}회 이내에 성공했다는 조건 아래 제${attempt}회에서 처음 성공했을`} 확률을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                power(
                  denominator - 1,
                  attempt - 1
                ),
                power(
                  denominator,
                  attempt
                )
              )
            : fraction(
                power(
                  denominator - 1,
                  attempt - 1
                ),
                power(
                  denominator,
                  attempt
                ) -
                  power(
                    denominator - 1,
                    attempt
                  )
              ),
        solution:
          `제${attempt}회 첫 성공 확률은 $(${denominator - 1}/${denominator})^{${attempt - 1}}(1/${denominator})$` +
          `${mode === 0 ? `이므로 ${answer}이다.` : `이고, ${attempt}회 이내 성공 확률은 $1-(${denominator - 1}/${denominator})^{${attempt}}$이다. 두 확률의 비는 ${answer}이다.`}`,
        hintText:
          "첫 성공 전의 시행은 모두 실패해야 하며, 조건부확률에서는 기한 내 성공 확률로 나눕니다.",
      });
    },
  },
  {
    id: "independent-unknown-probability",
    titles: [
      "독립사건의 합집합에서 미지 확률 복원",
      "독립사건의 교집합·여사건 결합",
    ],
    sourcePattern:
      "독립성 P(A∩B)=P(A)P(B)를 합집합 또는 여사건 공식에 대입해 미지확률을 결정",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "P(B)=p로 둔다.",
        "독립성으로 교집합 확률을 표현한다.",
        "합집합 공식에 대입해 p의 일차방정식을 푼다.",
        "구한 확률로 목표 사건을 계산한다.",
      ],
      [
        "두 여사건도 독립임을 사용한다.",
        "적어도 하나가 일어날 확률의 여사건을 만든다.",
        "미지 확률을 복원한다.",
        "교집합 확률을 곱셈정리로 계산한다.",
      ],
    ],
    generate(mode) {
      const aNumerator = choose([1, 2]);
      const aDenominator = 3;
      const bNumerator = choose([1, 2, 3]);
      const bDenominator = 4;
      const unionNumerator =
        aNumerator *
          bDenominator +
        bNumerator *
          aDenominator -
        aNumerator *
          bNumerator;
      const unionDenominator =
        aDenominator *
        bDenominator;
      const intersection =
        fraction(
          aNumerator * bNumerator,
          aDenominator *
            bDenominator
        );
      const answer =
        mode === 0
          ? fraction(
              bNumerator,
              bDenominator
            )
          : intersection;

      return makeShortAnswer({
        prompt:
          `서로 독립인 두 사건 $A,B$에 대하여 $P(A)=${fraction(aNumerator, aDenominator)}$, ` +
          `$P(A\\cup B)=${fraction(unionNumerator, unionDenominator)}$이다. ` +
          `$${mode === 0 ? "P(B)" : "P(A\\cap B)"}$를 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          mode === 0
            ? fraction(
                bNumerator,
                bDenominator
              )
            : fraction(
                aNumerator *
                  bNumerator,
                aDenominator *
                  bDenominator
              ),
        solution:
          `$P(B)=p$라 하면 독립성에서 $P(A\\cap B)=P(A)p$. ` +
          `합집합 공식에 대입해 $p=${fraction(bNumerator, bDenominator)}$를 얻고, ` +
          `${mode === 0 ? "" : `다시 곱하면 $P(A\\cap B)=${intersection}$.`} 답은 ${answer}이다.`,
        hintText:
          "합집합 공식의 교집합을 P(A)P(B)로 바꾸세요.",
      });
    },
  },
  {
    id: "bayes-three-sources",
    titles: [
      "세 생산라인의 불량품 원인 역추론",
      "서로 다른 사전확률을 가진 세 원인의 사후확률",
    ],
    sourcePattern:
      "세 원인의 사전확률과 각 조건부 발생확률을 곱해 전체확률을 만들고 특정 원인의 사후확률 계산",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "각 생산라인에서 불량이 나올 결합확률을 구한다.",
        "세 결합확률을 더해 전체 불량확률을 구한다.",
        "목표 생산라인의 결합확률을 분자로 둔다.",
        "베이즈 정리로 사후확률을 계산한다.",
      ],
      [
        "원인별 사전확률과 관찰확률을 곱한다.",
        "관찰 사건의 전체확률로 정규화한다.",
        "두 목표 원인의 사후확률을 각각 구한다.",
        "두 사후확률의 합을 기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const production = [2, 3, 5];
      const defect = [
        randomInteger(1, 2),
        randomInteger(2, 3),
        randomInteger(3, 4),
      ];
      const weights = production.map(
        (share, index) =>
          share * defect[index]
      );
      const total = weights.reduce(
        (sum, value) => sum + value,
        0
      );
      const numerator =
        mode === 0
          ? weights[2]
          : weights[1] +
            weights[2];
      const answer = fraction(
        numerator,
        total
      );

      return makeShortAnswer({
        prompt:
          `공장 A, B, C의 생산비율이 각각 $2/10,3/10,5/10$이고 불량률이 각각 ` +
          `$${defect[0]}/100,${defect[1]}/100,${defect[2]}/100$이다. 임의의 제품이 불량품일 때, ` +
          `${mode === 0 ? "공장 C에서 생산되었을" : "공장 B 또는 C에서 생산되었을"} 확률을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          fraction(
            numerator,
            total
          ),
        solution:
          `불량품이면서 각 공장 제품일 상대 가중치는 ` +
          `$${weights[0]}:${weights[1]}:${weights[2]}$이고 합은 ${total}이다. 목표 가중치를 합으로 나누면 ${answer}이다.`,
        hintText:
          "각 공장의 생산비율과 그 공장의 불량률을 먼저 곱하세요.",
      });
    },
  },
  {
    id: "conditional-card-composition",
    titles: [
      "적어도 한 장이 빨간색일 때 두 장 모두 빨간색",
      "적어도 한 장이 빨간색일 때 정확히 한 장만 빨간색",
    ],
    sourcePattern:
      "비복원 추출의 조합 표본공간에서 관찰 조건에 맞지 않는 경우를 제외하고 조건부확률 계산",
    estimatedMinutes: [12, 12],
    reasoningSteps: [
      [
        "두 장을 고르는 전체 조합 수를 구한다.",
        "빨간색이 한 장도 없는 경우를 센다.",
        "조건 사건의 크기를 여사건으로 구한다.",
        "두 장 모두 빨간 경우를 조건 사건 크기로 나눈다.",
      ],
      [
        "적어도 한 장 빨간 조건의 경우의 수를 구한다.",
        "빨간 한 장과 파란 한 장을 고르는 경우를 센다.",
        "조건부 표본공간 안에서 비율을 만든다.",
        "기약분수로 정리한다.",
      ],
    ],
    generate(mode) {
      const red = randomInteger(3, 6);
      const blue = randomInteger(3, 6);
      const condition =
        nCr(red + blue, 2) -
        nCr(blue, 2);
      const favorable =
        mode === 0
          ? nCr(red, 2)
          : red * blue;
      const answer = fraction(
        favorable,
        condition
      );

      return makeShortAnswer({
        prompt:
          `빨간 카드 ${red}장과 파란 카드 ${blue}장 중 동시에 2장을 임의로 뽑았다. ` +
          `적어도 한 장이 빨간 카드였을 때, ${mode === 0 ? "두 장 모두 빨간 카드일" : "정확히 한 장만 빨간 카드일"} 확률을 구하시오. (기약분수로 입력)`,
        answer,
        independentAnswer:
          fraction(
            favorable,
            condition
          ),
        solution:
          `조건 사건의 경우의 수는 $\\binom{${red + blue}}2-\\binom{${blue}}2=${condition}$. ` +
          `목표 사건은 ${mode === 0 ? `$\\binom{${red}}2$` : `${red}\\cdot${blue}`}가지이므로 확률은 ${answer}이다.`,
        hintText:
          "조건부 표본공간은 전체 두 장 조합에서 파란 카드만 뽑은 경우를 뺀 것입니다.",
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
