const {
  randomInteger,
  choose,
  nCr,
  power,
  makeShortAnswer,
  defineAdvancedTemplates,
} = require("../shared");

const courseId =
  "probability-statistics";
const unitId = "counting";
const requiredConceptIds = [
  "probability-statistics-01-01",
  "probability-statistics-01-02",
  "probability-statistics-01-03",
];

function permutations(values, length) {
  if (length === 0) return [[]];

  return values.flatMap(
    (value, index) =>
      permutations(
        values.filter(
          (_, nextIndex) =>
            nextIndex !== index
        ),
        length - 1
      ).map((tail) => [
        value,
        ...tail,
      ])
  );
}

function factorial(value) {
  let result = 1;

  for (
    let factor = 2;
    factor <= value;
    factor += 1
  ) {
    result *= factor;
  }

  return result;
}

const families = [
  {
    id: "restricted-digit-arrangement",
    titles: [
      "첫자리·짝수·중복금지 조건의 자연수 배열",
      "양끝 조건이 다른 중복 없는 숫자 배열",
    ],
    sourcePattern:
      "첫자리 0 금지와 끝자리 성질을 먼저 분리한 뒤 남은 자리를 순열로 계산",
    estimatedMinutes: [11, 11],
    reasoningSteps: [
      [
        "끝자리의 짝수 후보를 0과 0이 아닌 경우로 나눈다.",
        "각 경우 첫자리에서 0과 사용한 숫자를 제외한다.",
        "가운데 자리를 순서 있게 선택한다.",
        "서로 겹치지 않는 경우를 합한다.",
      ],
      [
        "양 끝자리 후보를 조건별로 정한다.",
        "첫자리가 0인 배열을 제외한다.",
        "남은 자리를 순열로 배치한다.",
        "직접 열거 검산과 일치하는지 확인한다.",
      ],
    ],
    generate(mode) {
      const maximum =
        randomInteger(5, 7);
      const digits = Array.from(
        {
          length: maximum + 1,
        },
        (_, index) => index
      );
      const all = permutations(
        digits,
        4
      ).filter(
        (number) =>
          number[0] !== 0
      );
      const valid =
        mode === 0
          ? all.filter(
              (number) =>
                number[3] % 2 ===
                0
            )
          : all.filter(
              (number) =>
                number[0] % 2 ===
                  1 &&
                number[3] % 2 ===
                  0
            );
      const answer = valid.length;

      return makeShortAnswer({
        prompt:
          `$0,1,2,\\ldots,${maximum}$에서 서로 다른 네 숫자를 골라 만든 네 자리 자연수 중 ` +
          `${
            mode === 0
              ? "짝수"
              : "첫 자리는 홀수이고 끝자리는 짝수인 수"
          }의 개수를 구하시오.`,
        answer,
        independentAnswer:
          valid.length,
        solution:
          mode === 0
            ? "끝자리가 0인 경우와 0이 아닌 짝수인 경우를 나눈다. 각 경우 첫자리의 0 금지와 이미 쓴 숫자를 반영하고 가운데 두 자리를 순열로 배치해 합하면 답을 얻는다."
            : "홀수인 첫자리와 짝수인 끝자리를 먼저 고르되 끝자리가 0인 경우를 따로 처리한다. 남은 두 자리를 순서 있게 고른 경우를 합하면 답을 얻는다.",
        hintText:
          "끝자리가 0인 경우에는 첫자리 제한의 계산이 달라지므로 분리하세요.",
      });
    },
  },
  {
    id: "identical-letters-separation",
    titles: [
      "같은 문자들이 서로 이웃하지 않는 배열",
      "같은 문자 사이에 다른 문자가 반드시 들어가는 배열",
    ],
    sourcePattern:
      "한 종류의 문자를 먼저 배열하고 생긴 빈칸에 다른 같은 문자를 배치하는 간격법",
    estimatedMinutes: [10, 11],
    reasoningSteps: [
      [
        "B들을 먼저 일렬로 배열한다.",
        "B 사이와 양끝의 빈칸 수를 센다.",
        "A가 이웃하지 않도록 서로 다른 빈칸을 고른다.",
        "같은 문자 순열임을 반영해 조합으로 계산한다.",
      ],
      [
        "분리 역할을 하는 문자를 먼저 놓는다.",
        "사용 가능한 간격을 만든다.",
        "각 간격에 최대 하나씩 같은 문자를 넣는다.",
        "양끝 사용 조건을 반영해 조합값을 계산한다.",
      ],
    ],
    generate(mode) {
      const a = randomInteger(3, 5);
      const b =
        a +
        randomInteger(0, 2);
      const allSeparated = nCr(
        b + 1,
        a
      );
      const internalOnly =
        b - 1 >= a
          ? nCr(b - 1, a)
          : 0;
      const answer =
        mode === 0
          ? allSeparated
          : internalOnly;

      return makeShortAnswer({
        prompt:
          `같은 문자 A ${a}개와 같은 문자 B ${b}개를 모두 일렬로 나열한다. ` +
          `${
            mode === 0
              ? "어떤 두 A도 서로 이웃하지 않는"
              : "모든 A가 두 B 사이의 내부 간격에 놓이고 어떤 두 A도 이웃하지 않는"
          } 경우의 수를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? nCr(b + 1, a)
            : nCr(b - 1, a),
        solution:
          `B ${b}개를 먼저 놓으면 ${
            mode === 0
              ? `${b + 1}개의 빈칸`
              : `${b - 1}개의 내부 빈칸`
          }이 생긴다. A가 이웃하지 않으려면 서로 다른 ${a}개 빈칸을 고르면 되므로 답은 ${answer}이다.`,
        hintText:
          "B를 먼저 배열해 A가 들어갈 수 있는 간격을 만드세요.",
      });
    },
  },
  {
    id: "bounded-distribution",
    titles: [
      "하한과 상한이 함께 있는 정수해 개수",
      "중복조합과 포함배제로 용량 제한 분배",
    ],
    sourcePattern:
      "하한을 먼저 제거해 중복조합으로 바꾸고 상한 위반 경우를 포함배제로 제외",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "각 변수의 하한만큼 치환한다.",
        "남은 합의 음이 아닌 정수해를 중복조합으로 센다.",
        "상한을 넘는 변수가 있는 경우를 다시 치환해 센다.",
        "포함배제로 위반 경우를 뺀다.",
      ],
      [
        "공을 상자에 분배하는 정수해로 번역한다.",
        "제한 없는 중복조합 수를 구한다.",
        "각 상자의 용량을 넘는 경우를 센다.",
        "교집합 가능성을 확인하고 포함배제를 적용한다.",
      ],
    ],
    generate(mode) {
      const total =
        randomInteger(9, 13);
      const lower = 1;
      const upper =
        randomInteger(4, 6);
      let count = 0;

      for (
        let x = lower;
        x <= upper;
        x += 1
      ) {
        for (
          let y = lower;
          y <= upper;
          y += 1
        ) {
          for (
            let z = lower;
            z <= upper;
            z += 1
          ) {
            if (
              x + y + z ===
              total
            ) {
              count += 1;
            }
          }
        }
      }

      const answer = count;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `방정식 $x+y+z=${total}$을 만족하는 정수해 중 $1\\le x,y,z\\le${upper}$인 순서쌍 $(x,y,z)$의 개수를 구하시오.`
            : `서로 다른 세 상자에 같은 공 ${total}개를 나누어 넣는다. 각 상자에는 1개 이상 ${upper}개 이하를 넣을 때 경우의 수를 구하시오.`,
        answer,
        independentAnswer:
          count,
        solution:
          `$x'=x-1,y'=y-1,z'=z-1$로 하한을 제거한 뒤 제한 없는 중복조합을 센다. ` +
          `그중 어느 변수가 ${upper}를 넘는 경우를 새 변수로 치환해 포함배제로 빼면 ${answer}개이다.`,
        hintText:
          "먼저 각 변수에서 1을 빼 하한을 없앤 뒤 상한 위반 경우를 제외하세요.",
      });
    },
  },
  {
    id: "lattice-path-through-avoid",
    titles: [
      "특정 점을 지나지 않는 최단경로",
      "두 지정점 중 정확히 하나를 지나는 최단경로",
    ],
    sourcePattern:
      "전체 최단경로에서 지정점을 지나는 경로를 구간별 조합의 곱으로 세어 포함배제",
    estimatedMinutes: [12, 14],
    reasoningSteps: [
      [
        "전체 최단경로 수를 조합으로 센다.",
        "지정점까지의 경로 수를 센다.",
        "지정점부터 도착점까지의 경로 수를 센다.",
        "곱한 금지 경로를 전체에서 뺀다.",
      ],
      [
        "각 지정점을 지나는 경로 수를 구한다.",
        "두 점을 모두 지날 수 있는 순서를 확인한다.",
        "두 점을 모두 지나는 경로를 센다.",
        "대칭차 공식으로 정확히 하나만 지나는 경로를 구한다.",
      ],
    ],
    generate(mode) {
      const width =
        randomInteger(5, 7);
      const height =
        randomInteger(4, 6);
      const pointA = [2, 2];
      const pointB = [3, 3];
      const total = nCr(
        width + height,
        width
      );
      const through = (point) =>
        nCr(
          point[0] + point[1],
          point[0]
        ) *
        nCr(
          width -
            point[0] +
            height -
            point[1],
          width - point[0]
        );
      const throughA =
        through(pointA);
      const throughB =
        through(pointB);
      const throughBoth =
        nCr(4, 2) *
        nCr(2, 1) *
        nCr(
          width -
            pointB[0] +
            height -
            pointB[1],
          width - pointB[0]
        );
      const answer =
        mode === 0
          ? total - throughA
          : throughA +
            throughB -
            2 * throughBoth;

      return makeShortAnswer({
        prompt:
          `격자점 $(0,0)$에서 $(${width},${height})$까지 오른쪽 또는 위쪽으로만 한 칸씩 이동하는 최단경로 중 ` +
          `${
            mode === 0
              ? "점 (2,2)를 지나지 않는"
              : "점 (2,2)와 (3,3) 중 정확히 한 점만 지나는"
          } 경로의 수를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? total - throughA
            : throughA +
              throughB -
              2 * throughBoth,
        solution:
          mode === 0
            ? `전체 경로 $\\binom{${width + height}}{${width}}$에서 (2,2)를 지나는 두 구간 경로 수의 곱을 빼면 ${answer}이다.`
            : `A를 지나는 수와 B를 지나는 수를 더한 뒤, 두 점을 모두 지나는 경로는 두 집합에 각각 들어가므로 두 번 빼야 한다. 결과는 ${answer}이다.`,
        hintText:
          "지정점을 지나는 경로는 출발→지정점과 지정점→도착의 경우의 수를 곱하세요.",
      });
    },
  },
  {
    id: "binomial-coefficient-chain",
    titles: [
      "이항전개의 특정 차수 계수",
      "부호가 섞인 이항전개의 짝수차항 계수합",
    ],
    sourcePattern:
      "이항정리 일반항에서 지수 조건을 풀거나 x=1,-1 대입으로 계수합 분리",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "이항전개의 일반항을 쓴다.",
        "x의 지수를 목표 차수와 같게 둔다.",
        "선택 횟수 r을 결정한다.",
        "조합과 계수의 거듭제곱을 계산한다.",
      ],
      [
        "전체 계수합을 x=1로 구한다.",
        "짝·홀 차수 부호가 바뀐 합을 x=-1로 구한다.",
        "두 식을 더해 짝수차항만 남긴다.",
        "2로 나눠 목표 계수합을 구한다.",
      ],
    ],
    generate(mode) {
      const n =
        randomInteger(6, 9);
      const coefficient =
        randomInteger(2, 4);
      const r =
        randomInteger(2, n - 2);
      const targetPower = n - r;
      const specific =
        nCr(n, r) *
        power(coefficient, r);
      const evenSum =
        (
          power(
            1 + coefficient,
            n
          ) +
          power(
            1 - coefficient,
            n
          )
        ) / 2;
      const answer =
        mode === 0
          ? specific
          : evenSum;

      return makeShortAnswer({
        prompt:
          mode === 0
            ? `$(x+${coefficient})^{${n}}$의 전개식에서 $x^{${targetPower}}$의 계수를 구하시오.`
            : `$(x+${coefficient})^{${n}}=a_0+a_1x+\\cdots+a_${n}x^{${n}}$일 때, $a_0+a_2+a_4+\\cdots$의 값을 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? nCr(n, r) *
              power(
                coefficient,
                r
              )
            : evenSum,
        solution:
          mode === 0
            ? `일반항 $\\binom{${n}}r x^{${n}-r}${coefficient}^r$에서 $r=${r}$. 따라서 계수는 ${answer}이다.`
            : `$x=1$과 $x=-1$을 각각 대입한 두 식을 더하면 짝수 차수 계수만 2배로 남는다. 따라서 답은 ${answer}이다.`,
        hintText:
          mode === 0
            ? "일반항의 x 지수를 목표 지수와 같게 두세요."
            : "다항식에 x=1과 x=-1을 대입한 값을 더해 보세요.",
      });
    },
  },
  {
    id: "circular-adjacency",
    titles: [
      "원순열에서 지정된 두 사람을 이웃하게 배치",
      "원순열에서 지정된 두 사람이 이웃하지 않는 배치",
    ],
    sourcePattern:
      "회전이 같은 원순열에서 두 대상을 한 묶음으로 보거나 전체에서 인접한 경우를 제외",
    estimatedMinutes: [11, 12],
    reasoningSteps: [
      [
        "두 지정 인물을 하나의 블록으로 묶는다.",
        "블록을 포함한 대상들의 원순열을 센다.",
        "블록 내부 순서 두 가지를 곱한다.",
        "회전 중복이 제거됐는지 확인한다.",
      ],
      [
        "전체 원순열의 수를 구한다.",
        "두 지정 인물이 이웃한 경우를 블록으로 센다.",
        "전체에서 인접한 경우를 뺀다.",
        "작은 사례로 회전 중복을 검산한다.",
      ],
    ],
    generate(mode) {
      const people = randomInteger(6, 9);
      const adjacent =
        2 * factorial(people - 2);
      const total =
        factorial(people - 1);
      const answer =
        mode === 0
          ? adjacent
          : total - adjacent;

      return makeShortAnswer({
        prompt:
          `서로 다른 ${people}명이 원형 탁자에 둘러앉을 때, 두 사람 A, B가 ` +
          `${mode === 0 ? "서로 이웃하는" : "서로 이웃하지 않는"} 경우의 수를 구하시오. (회전하여 같은 것은 같은 배치)`,
        answer,
        independentAnswer:
          mode === 0
            ? 2 *
              factorial(
                people - 2
              )
            : factorial(
                people - 1
              ) -
              2 *
                factorial(
                  people - 2
                ),
        solution:
          `전체 원순열은 $(${people}-1)!$개이다. A, B를 한 블록으로 보면 인접한 경우는 ` +
          `$2(${people}-2)!$개이므로 요구한 수는 ${answer}이다.`,
        hintText:
          "A와 B를 내부 순서가 두 가지인 하나의 블록으로 보세요.",
      });
    },
  },
  {
    id: "surjective-distribution",
    titles: [
      "서로 다른 공을 빈 상자 없이 분배",
      "한 상자의 개수를 고정한 전사 분배",
    ],
    sourcePattern:
      "서로 다른 물건의 전체 함수 배치에서 빈 상자가 생기는 경우를 포함배제로 제거",
    estimatedMinutes: [13, 14],
    reasoningSteps: [
      [
        "각 공이 들어갈 상자를 고르는 전체 경우를 센다.",
        "특정 상자가 비는 경우를 센다.",
        "두 상자가 동시에 비는 중복을 보정한다.",
        "포함배제로 빈 상자가 없는 경우를 구한다.",
      ],
      [
        "지정 상자에 들어갈 두 공을 고른다.",
        "나머지 공을 두 상자에 분배한다.",
        "두 상자 중 하나가 비는 경우를 뺀다.",
        "선택과 분배의 수를 곱한다.",
      ],
    ],
    generate(mode) {
      const balls = randomInteger(5, 8);
      const onto =
        power(3, balls) -
        3 * power(2, balls) +
        3;
      const fixed =
        nCr(balls, 2) *
        (
          power(
            2,
            balls - 2
          ) -
          2
        );
      const answer =
        mode === 0
          ? onto
          : fixed;

      return makeShortAnswer({
        prompt:
          `서로 다른 공 ${balls}개를 서로 다른 상자 A, B, C에 넣는다. ` +
          `${mode === 0 ? "세 상자가 모두 비지 않게" : "A에는 정확히 2개를 넣고 B, C도 비지 않게"} 넣는 경우의 수를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? power(3, balls) -
              3 *
                power(2, balls) +
              3
            : nCr(balls, 2) *
              (
                power(
                  2,
                  balls - 2
                ) -
                2
              ),
        solution:
          mode === 0
            ? `전체 $3^{${balls}}$에서 한 상자가 빈 경우를 빼고 두 상자가 빈 중복을 더하면 ${answer}이다.`
            : `A에 넣을 두 공을 고른 뒤 남은 공을 B, C에 모두 사용하여 분배한다. $\\binom{${balls}}2(2^{${balls - 2}}-2)=${answer}$.`,
        hintText:
          "빈 상자가 생기는 경우를 포함배제로 제거하세요.",
      });
    },
  },
  {
    id: "vowel-consonant-arrangement",
    titles: [
      "모음이 모두 붙어 있는 서로 다른 문자 배열",
      "모음끼리 이웃하지 않는 문자 배열",
    ],
    sourcePattern:
      "모음을 하나의 블록으로 묶거나 자음 배열의 빈칸에 모음을 배치하는 문자열 순열",
    estimatedMinutes: [11, 13],
    reasoningSteps: [
      [
        "모음 전체를 하나의 블록으로 묶는다.",
        "블록과 자음을 배열한다.",
        "블록 내부 모음 순서를 센다.",
        "두 경우의 수를 곱한다.",
      ],
      [
        "자음을 먼저 일렬로 배열한다.",
        "자음 사이와 양 끝의 빈칸 수를 센다.",
        "서로 다른 빈칸에 모음을 배치한다.",
        "모음 내부 순서까지 곱한다.",
      ],
    ],
    generate(mode) {
      const vowels = randomInteger(2, 3);
      const consonants =
        vowels + randomInteger(1, 3);
      const together =
        factorial(consonants + 1) *
        factorial(vowels);
      const separated =
        factorial(consonants) *
        nCr(
          consonants + 1,
          vowels
        ) *
        factorial(vowels);
      const answer =
        mode === 0
          ? together
          : separated;

      return makeShortAnswer({
        prompt:
          `서로 다른 모음 ${vowels}개와 서로 다른 자음 ${consonants}개를 모두 한 줄로 배열할 때, ` +
          `${mode === 0 ? "모음이 모두 이웃하는" : "어느 두 모음도 이웃하지 않는"} 경우의 수를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? factorial(
                consonants + 1
              ) *
              factorial(vowels)
            : factorial(
                consonants
              ) *
              nCr(
                consonants + 1,
                vowels
              ) *
              factorial(vowels),
        solution:
          mode === 0
            ? `모음 블록 하나와 자음 ${consonants}개를 배열하고 블록 내부를 배열하면 ${answer}이다.`
            : `자음을 먼저 배열한 뒤 생기는 ${consonants + 1}개 빈칸 중 ${vowels}개를 골라 모음을 배열하면 ${answer}이다.`,
        hintText:
          mode === 0
            ? "모음 전체를 하나의 큰 문자처럼 묶으세요."
            : "자음을 먼저 놓고 그 사이의 빈칸을 세세요.",
      });
    },
  },
  {
    id: "committee-composition",
    titles: [
      "두 집단에서 최소 인원을 만족하는 위원회",
      "두 지정 인물의 포함 관계가 있는 위원회",
    ],
    sourcePattern:
      "집단별 선택 수를 나눠 조합의 곱을 더하거나 지정 인물의 포함·제외 조건으로 경우를 분할",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "위원회에 포함될 첫 집단 인원 수의 범위를 정한다.",
        "각 인원 수마다 두 집단의 조합 수를 곱한다.",
        "가능한 구성별 경우의 수를 더한다.",
        "전체 인원 조건을 다시 확인한다.",
      ],
      [
        "두 지정 인물 중 정확히 한 명을 고른다.",
        "남은 자리의 집단별 최소 조건을 확인한다.",
        "가능한 구성으로 나눠 조합을 계산한다.",
        "서로 겹치지 않는 경우를 합한다.",
      ],
    ],
    generate(mode) {
      const firstGroup =
        randomInteger(5, 7);
      const secondGroup =
        randomInteger(5, 7);
      const size = 4;
      const atLeastTwo = Array.from(
        { length: 3 },
        (_, index) => {
          const firstChosen =
            index + 2;
          const secondChosen =
            size - firstChosen;
          return secondChosen >= 1
            ? nCr(
                firstGroup,
                firstChosen
              ) *
                nCr(
                  secondGroup,
                  secondChosen
                )
            : 0;
        }
      ).reduce(
        (sum, value) => sum + value,
        0
      );
      const exactlyOneDesignated =
        2 *
        nCr(
          firstGroup +
            secondGroup -
            2,
          size - 1
        );
      const answer =
        mode === 0
          ? atLeastTwo
          : exactlyOneDesignated;

      return makeShortAnswer({
        prompt:
          `A집단 ${firstGroup}명과 B집단 ${secondGroup}명 중 ${size}명의 위원회를 만든다. ` +
          `${mode === 0 ? "A집단에서 적어도 2명, B집단에서 적어도 1명을 뽑는" : "서로 다른 지정 인물 P, Q 중 정확히 한 명만 뽑는"} 경우의 수를 구하시오.`,
        answer,
        independentAnswer:
          mode === 0
            ? [2, 3]
                .map(
                  (firstChosen) =>
                    nCr(
                      firstGroup,
                      firstChosen
                    ) *
                    nCr(
                      secondGroup,
                      size -
                        firstChosen
                    )
                )
                .reduce(
                  (sum, value) =>
                    sum + value,
                  0
                )
            : 2 *
              nCr(
                firstGroup +
                  secondGroup -
                  2,
                size - 1
              ),
        solution:
          mode === 0
            ? `가능한 구성은 (A,B)=(2,2),(3,1)이다. 각 조합의 곱을 더하면 ${answer}이다.`
            : `P, Q 중 포함할 한 명을 2가지로 고르고 나머지 ${size - 1}명을 다른 사람 중에서 고르면 ${answer}이다.`,
        hintText:
          "집단별로 몇 명을 뽑는지 가능한 구성을 먼저 모두 적으세요.",
      });
    },
  },
  {
    id: "laurent-binomial-term",
    titles: [
      "양의 지수와 음의 지수가 섞인 이항전개의 상수항",
      "로랑형 이항전개의 지정 차수 계수",
    ],
    sourcePattern:
      "(x^p+a/x)^n의 일반항에서 x의 전체 지수를 계산해 목표 차수와 같게 두는 유형",
    estimatedMinutes: [12, 13],
    reasoningSteps: [
      [
        "이항전개의 일반항을 쓴다.",
        "x의 양의 지수와 음의 지수를 합친다.",
        "전체 지수가 0이 되는 선택 횟수를 구한다.",
        "조합과 상수의 거듭제곱을 계산한다.",
      ],
      [
        "r번째 선택항의 x 지수를 식으로 나타낸다.",
        "목표 지수와 같게 두어 r을 푼다.",
        "허용 범위의 정수인지 확인한다.",
        "해당 일반항의 계수를 계산한다.",
      ],
    ],
    generate(mode) {
      const coefficient =
        randomInteger(2, 4);
      const n = 6;
      const target =
        mode === 0 ? 0 : 3;
      const selected =
        mode === 0 ? 4 : 3;
      const answer =
        nCr(n, selected) *
        power(
          coefficient,
          selected
        );

      return makeShortAnswer({
        prompt:
          `$(x^2+\\dfrac{${coefficient}}x)^6$의 전개식에서 ` +
          `${mode === 0 ? "상수항을" : "$x^3$의 계수를"} 구하시오.`,
        answer,
        independentAnswer:
          nCr(n, selected) *
          power(
            coefficient,
            selected
          ),
        solution:
          `두 번째 항을 r번 고른 일반항의 x 지수는 $2(6-r)-r=12-3r$이다. ` +
          `이를 ${target}과 같게 두면 $r=${selected}$이고 계수는 ${answer}이다.`,
        hintText:
          "두 번째 항을 r번 선택했을 때 x의 전체 지수를 먼저 계산하세요.",
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
