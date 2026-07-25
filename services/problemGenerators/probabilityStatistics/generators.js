const {
  randomInteger,
  inlineMath,
  factorial,
  combination,
  permutation,
  fractionText,
  round4,
  shortAnswer,
  multipleChoice,
  createProblemTypes,
  isCorrectAnswer,
} = require("./helpers");

function probability(numerator, denominator) {
  return round4(numerator / denominator);
}

function binomialProbability(n, p, k) {
  return round4(
    combination(n, k) * p ** k * (1 - p) ** (n - k)
  );
}

function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const coefficients = [
    0.254829592,
    -0.284496736,
    1.421413741,
    -1.453152027,
    1.061405429,
  ];
  let polynomial = coefficients[4];
  for (let index = 3; index >= 0; index -= 1) {
    polynomial = polynomial * t + coefficients[index];
  }
  const erf =
    sign * (1 - polynomial * t * Math.exp(-x * x));
  return (1 + erf) / 2;
}

function sa(prompt, answer, solution, hintText, visualization) {
  return shortAnswer({
    prompt,
    answer,
    solution,
    hintText,
    visualization,
  });
}

function mc(
  prompt,
  choices,
  answerIndex,
  solution,
  hintText,
  visualization
) {
  return multipleChoice({
    prompt,
    choices,
    answerIndex,
    solution,
    hintText,
    visualization,
  });
}

function countingVisual(data = {}) {
  return { kind: "probability-counting", ...data };
}

function vennVisual(data = {}) {
  return { kind: "probability-venn", ...data };
}

function treeVisual(data = {}) {
  return { kind: "probability-tree", ...data };
}

function distributionVisual(data = {}) {
  return { kind: "probability-distribution", ...data };
}

function binomialVisual(data = {}) {
  return { kind: "probability-binomial", ...data };
}

function normalVisual(data = {}) {
  return { kind: "probability-normal", ...data };
}

function samplingVisual(data = {}) {
  return { kind: "probability-sampling", ...data };
}

function confidenceVisual(data = {}) {
  return { kind: "probability-confidence", ...data };
}

const definitions = [
  {
    conceptId: "probability-statistics-01-01",
    unitId: "counting",
    key: "probstat-repeated-multiset-permutation",
    title: "중복순열과 같은 것이 있는 순열",
    labels: [
      "중복순열", "비밀번호 만들기", "같은 것이 있는 순열", "문자 배열",
      "원순열과 구별", "특정 기호 포함", "자리 제한", "같은 수 묶기",
      "두 종류의 중복", "종합 배열",
    ],
    buildProblems() {
      const n = randomInteger(2, 5);
      const r = randomInteger(2, 5);
      const a = randomInteger(2, 4);
      const b = randomInteger(2, 4);
      const total = a + b;
      const repeated = n ** r;
      const multiset = factorial(total) / (factorial(a) * factorial(b));
      const uniqueCount = randomInteger(2, 4);
      const duplicateCount = randomInteger(2, 3);
      const letterTotal =
        uniqueCount + duplicateCount;
      const letterArrangement =
        factorial(letterTotal) /
        factorial(duplicateCount);
      const circleCount = randomInteger(4, 7);
      const circleArrangement =
        factorial(circleCount - 1);
      const thirdGroup = randomInteger(2, 3);
      const threeGroupTotal = total + thirdGroup;
      const threeGroupArrangement =
        factorial(threeGroupTotal) /
        (factorial(a) *
          factorial(b) *
          factorial(thirdGroup));
      return [
        sa(`${n}개의 문자를 중복을 허용하여 ${r}자리로 나열하는 경우의 수를 구하세요.`, repeated, `각 자리마다 ${n}가지이므로 ${inlineMath(`${n}^{${r}}=${repeated}`)}입니다.`, "선택한 뒤에도 다음 자리의 선택지 수가 줄지 않습니다.", countingVisual({ mode: "repeated", choices: n, slots: r })),
        sa(`숫자 ${n}개로 중복 가능한 ${r}자리 비밀번호를 만드는 경우의 수는?`, repeated, `${r}개 자리에 각각 ${n}가지가 들어가므로 ${repeated}가지입니다.`, "자리별 선택지 수를 곱하세요.", countingVisual({ mode: "repeated", choices: n, slots: r })),
        sa(`A가 ${a}개, B가 ${b}개인 ${total}개 문자를 모두 나열하는 경우의 수를 구하세요.`, multiset, `${inlineMath(`\\frac{${total}!}{${a}!${b}!}=${multiset}`)}입니다.`, "모두 다르다고 센 뒤 A끼리, B끼리의 자리바꿈을 나눕니다.", countingVisual({ mode: "multiset", groups: [a, b] })),
        sa(`같은 문자 A가 ${duplicateCount}개이고 서로 다른 문자가 ${uniqueCount}개일 때, ${letterTotal}개 문자를 모두 나열하는 방법의 수는?`, letterArrangement, `${inlineMath(`\\frac{${letterTotal}!}{${duplicateCount}!}=${letterArrangement}`)}입니다.`, "같은 A끼리의 자리바꿈은 새로운 배열을 만들지 않습니다.", countingVisual({ mode: "multiset", groups: [duplicateCount, ...Array(uniqueCount).fill(1)] })),
        mc(`서로 다른 ${circleCount}개를 원형으로 배열하는 경우의 수는?`, [`${circleCount}!`, `${circleCount}^2`, `${circleCount - 1}!`, `${circleCount}!/2!`], 2, `회전하여 같은 배열을 하나로 보므로 (${circleCount}-1)!=${circleArrangement}입니다.`, "원순열은 중복순열과 다른 기준으로 중복을 제거합니다.", countingVisual({ mode: "circle", slots: circleCount })),
        sa(`0과 1로 만든 ${r}자리 문자열 중 1이 적어도 한 번 나오는 문자열 수는?`, 2 ** r - 1, `전체 ${inlineMath(`2^{${r}}`)}개에서 0만 있는 한 가지를 뺍니다.`, "여사건인 '1이 한 번도 없음'을 먼저 세세요.", countingVisual({ mode: "repeated", choices: 2, slots: r })),
        sa(`${n}개의 숫자를 중복 허용하여 만든 ${r + 1}자리 문자열 중 첫 자리가 고정된 경우의 수는?`, n ** r, `첫 자리는 고정되고 나머지 ${r}자리는 각각 ${n}가지이므로 ${inlineMath(`${n}^{${r}}=${n ** r}`)}입니다.`, "고정된 자리는 선택지 곱에서 제외합니다.", countingVisual({ mode: "repeated", choices: n, slots: r })),
        sa(`같은 빨간 공 ${a}개와 같은 파란 공 ${b}개를 일렬로 놓는 방법의 수는?`, multiset, `${total}자리 중 빨간 공의 자리 ${a}개를 고르면 ${inlineMath(`\\binom{${total}}{${a}}=${multiset}`)}입니다.`, "빨간 공의 자리만 정하면 나머지는 자동으로 파란 공입니다.", countingVisual({ mode: "multiset", groups: [a, b] })),
        sa(`A ${a}개, B ${b}개, C ${thirdGroup}개를 모두 나열하는 경우의 수는?`, threeGroupArrangement, `${inlineMath(`\\frac{${threeGroupTotal}!}{${a}!${b}!${thirdGroup}!}=${threeGroupArrangement}`)}입니다.`, "각 종류 안에서 생기는 중복을 모두 나눕니다.", countingVisual({ mode: "multiset", groups: [a, b, thirdGroup] })),
        sa(`같은 문자 A ${a}개, N ${b}개와 서로 다른 문자 1개를 모두 나열하는 방법의 수는?`, factorial(total + 1) / (factorial(a) * factorial(b)), `전체 ${total + 1}개 중 A끼리와 N끼리의 중복을 나누면 ${inlineMath(`\\frac{${total + 1}!}{${a}!${b}!}`)}입니다.`, "같은 문자가 몇 개씩 있는지 먼저 표시하세요.", countingVisual({ mode: "multiset", groups: [a, b, 1] })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-01-02",
    unitId: "counting",
    key: "probstat-repeated-combination",
    title: "중복조합",
    labels: [
      "중복조합 공식", "사탕 고르기", "음이 아닌 해", "적어도 하나",
      "종류별 선택", "별과 막대", "상한이 있는 선택", "양의 정수해",
      "두 조건 결합", "종합 중복조합",
    ],
    buildProblems() {
      const n = randomInteger(3, 6);
      const r = randomInteger(2, 5);
      const value = combination(n + r - 1, r);
      const boundedItems = randomInteger(4, 8);
      const boundedValue = 2 * boundedItems + 1;
      const positiveSum = randomInteger(6, 11);
      const positiveValue =
        combination(positiveSum - 1, 2);
      const requiredItems = randomInteger(4, 8);
      const requiredValue =
        combination(
          n + requiredItems - 2,
          requiredItems - 1
        );
      const drinkTypes = randomInteger(4, 7);
      const drinkCount = randomInteger(3, 6);
      const drinkValue =
        combination(
          drinkTypes + drinkCount - 1,
          drinkCount
        );
      return [
        sa(`${n}종류에서 중복을 허용하여 ${r}개를 고르는 방법의 수는?`, value, `${inlineMath(`{}_{${n}}H_{${r}}=\\binom{${n + r - 1}}{${r}}=${value}`)}입니다.`, "중복조합을 조합으로 바꿀 때 n+r-1을 사용합니다.", countingVisual({ mode: "stars-bars", groups: n, items: r })),
        sa(`서로 다른 맛 ${n}종류의 사탕을 중복 가능하게 ${r}개 고르는 방법의 수는?`, value, `맛별 개수의 합이 ${r}인 음이 아닌 정수해와 같아 ${value}가지입니다.`, "사탕을 별, 맛 사이 경계를 막대로 생각하세요.", countingVisual({ mode: "stars-bars", groups: n, items: r })),
        sa(`${inlineMath(`x_1+x_2+x_3=${r}`)}의 음이 아닌 정수해의 개수는?`, combination(r + 2, 2), `${inlineMath(`\\binom{${r + 2}}{2}`)}입니다.`, "별 r개와 막대 2개를 배열합니다.", countingVisual({ mode: "stars-bars", groups: 3, items: r })),
        sa(`${inlineMath(`x_1+x_2+x_3=${r + 3}`)}에서 각 ${inlineMath("x_i\\ge1")}인 정수해의 개수는?`, combination(r + 2, 2), `각 변수에 1씩 먼저 주면 남은 합이 ${r}이므로 ${inlineMath(`\\binom{${r + 2}}2`)}입니다.`, "최솟값을 먼저 배정한 뒤 음이 아닌 해로 바꾸세요.", countingVisual({ mode: "stars-bars", groups: 3, items: r })),
        sa(`빵 ${n}종류를 합하여 ${r}개 사되, 어떤 종류도 사지 않아도 될 때 경우의 수는?`, value, `중복조합 ${inlineMath(`{}_${n}H_${r}`)}이므로 ${value}가지입니다.`, "순서는 중요하지 않고 같은 종류를 여러 번 고를 수 있습니다.", countingVisual({ mode: "stars-bars", groups: n, items: r })),
        mc(`별과 막대에서 종류가 ${n}개이면 필요한 막대 수는?`, [`${n - 1}개`, `${n}개`, `${n + 1}개`, "선택 개수와 같다"], 0, `${n}개 구역을 만들려면 막대는 ${n - 1}개입니다.`, "종류 수보다 막대가 하나 적습니다.", countingVisual({ mode: "stars-bars", groups: n, items: r })),
        sa(`세 종류에서 중복을 허용해 ${boundedItems}개를 고르되 첫 종류는 최대 1개인 경우의 수는?`, boundedValue, `첫 종류가 0개일 때 ${boundedItems + 1}가지, 1개일 때 ${boundedItems}가지이므로 ${boundedValue}가지입니다.`, "상한에 따라 첫 종류의 개수를 0,1로 나누세요.", countingVisual({ mode: "stars-bars", groups: 3, items: boundedItems })),
        sa(`${inlineMath(`x+y+z=${positiveSum}`)}의 양의 정수해 개수는?`, positiveValue, `각 변수에 1씩 주면 남은 합은 ${positiveSum - 3}, 따라서 ${inlineMath(`\\binom{${positiveSum - 1}}2=${positiveValue}`)}입니다.`, "양의 조건을 제거하려면 각 변수에서 1을 빼세요.", countingVisual({ mode: "stars-bars", groups: 3, items: positiveSum - 3 })),
        sa(`${n}종류의 과일을 ${requiredItems}개 고르되 첫 종류를 적어도 1개 고르는 방법의 수는?`, requiredValue, `첫 종류 1개를 먼저 고른 뒤 ${n}종류에서 ${requiredItems - 1}개를 중복조합하므로 ${inlineMath(`\\binom{${n + requiredItems - 2}}{${requiredItems - 1}}=${requiredValue}`)}입니다.`, "필수 개수를 먼저 배정하세요.", countingVisual({ mode: "stars-bars", groups: n, items: requiredItems - 1 })),
        sa(`${drinkTypes}종류의 음료를 중복 허용하여 ${drinkCount}개 고르는 방법의 수는?`, drinkValue, `${inlineMath(`{}_${drinkTypes}H_${drinkCount}=\\binom{${drinkTypes + drinkCount - 1}}{${drinkCount}}=${drinkValue}`)}입니다.`, "종류 수와 선택 개수를 별과 막대로 바꿔보세요.", countingVisual({ mode: "stars-bars", groups: drinkTypes, items: drinkCount })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-01-03",
    unitId: "counting",
    key: "probstat-binomial-theorem",
    title: "이항정리",
    labels: [
      "일반항", "특정 항의 계수", "상수항", "계수의 합", "홀수항 계수",
      "파스칼 삼각형", "이항계수 대칭", "두 항의 부호", "중앙항", "종합 전개",
    ],
    buildProblems() {
      const n = randomInteger(4, 8);
      const k = randomInteger(1, n - 1);
      const coefficient = randomInteger(2, 4);
      const constant = randomInteger(2, 4);
      const power = randomInteger(3, 6);
      const evenPower =
        2 * randomInteger(2, 5);
      const signPower = randomInteger(4, 7);
      const signConstant = randomInteger(2, 4);
      const targetPower = randomInteger(
        1,
        signPower - 1
      );
      const signCoefficient =
        combination(signPower, targetPower) *
        (-signConstant) **
          (signPower - targetPower);
      const squareCoefficient =
        combination(power, 2) *
        coefficient ** 2 *
        (-1) ** (power - 2);
      return [
        mc(`${inlineMath(`(a+b)^{${n}}`)}의 일반항으로 옳은 것은?`, [inlineMath(`\\binom{${n}}r a^{${n}-r}b^r`), inlineMath(`\\binom{${n}}r a^r b^r`), inlineMath(`${n}a^{${n}-r}b^r`), inlineMath(`a^{${n}}+b^{${n}}`)], 0, "b를 r번 고른 항의 계수는 이항계수이고 a의 지수는 n-r입니다.", "각 인수에서 b를 고르는 위치 r개를 선택합니다.", countingVisual({ mode: "pascal", row: n })),
        sa(`${inlineMath(`(x+1)^{${n}}`)}에서 ${inlineMath(`x^{${n - k}}`)}의 계수를 구하세요.`, combination(n, k), `계수는 ${inlineMath(`\\binom{${n}}{${k}}=${combination(n, k)}`)}입니다.`, "1을 k번 고르는 항을 찾으세요.", countingVisual({ mode: "pascal", row: n, focus: k })),
        sa(`${inlineMath(`(${coefficient}x+${constant})^${power}`)}의 상수항을 구하세요.`, constant ** power, `x가 들어 있는 항을 한 번도 고르지 않을 때 상수항은 ${inlineMath(`${constant}^${power}=${constant ** power}`)}입니다.`, "상수항은 x의 지수가 0인 항입니다.", countingVisual({ mode: "pascal", row: power, focus: power })),
        sa(`${inlineMath(`(2x+3)^{${n}}`)}의 모든 계수의 합을 구하세요.`, 5 ** n, `${inlineMath("x=1")}을 대입하면 ${inlineMath(`5^{${n}}=${5 ** n}`)}입니다.`, "계수의 합은 다항식에 x=1을 대입한 값입니다.", countingVisual({ mode: "pascal", row: n })),
        sa(`${inlineMath(`(1+x)^${evenPower}`)}에서 홀수차항 계수의 합을 구하세요.`, 2 ** (evenPower - 1), `${inlineMath(`\\frac{2^${evenPower}-0^${evenPower}}2=${2 ** (evenPower - 1)}`)}입니다.`, "P(1)과 P(-1)을 빼면 홀수차항만 두 배로 남습니다.", countingVisual({ mode: "pascal", row: evenPower })),
        sa(`파스칼의 삼각형에서 ${n}번째 행(0번째 행부터 시작)의 계수 합은?`, 2 ** n, `이항계수 합은 ${inlineMath(`2^${n}=${2 ** n}`)}입니다.`, `행의 계수는 ${inlineMath(`(1+1)^${n}`)}의 전개계수입니다.`, countingVisual({ mode: "pascal", row: n })),
        mc(`${inlineMath(`\\binom{${n}}{${k}}`)}와 항상 같은 것은?`, [inlineMath(`\\binom{${n}}{${n - k}}`), inlineMath(`\\binom{${n - 1}}{${k}}`), inlineMath(`\\binom{${k}}{${n}}`), inlineMath(`${n - k}`)], 0, "고른 것과 고르지 않은 것을 바꾸어 세면 같은 값입니다.", "이항계수의 대칭성을 떠올리세요.", countingVisual({ mode: "pascal", row: n, focus: k })),
        sa(`${inlineMath(`(x-${signConstant})^${signPower}`)}에서 ${inlineMath(`x^${targetPower}`)}의 계수를 구하세요.`, signCoefficient, `${inlineMath(`\\binom{${signPower}}{${targetPower}}(-${signConstant})^{${signPower - targetPower}}=${signCoefficient}`)}입니다.`, `x를 ${targetPower}번 고르고 상수항의 부호도 함께 계산하세요.`, countingVisual({ mode: "pascal", row: signPower, focus: signPower - targetPower })),
        sa(`${inlineMath(`(x+1)^${evenPower}`)}의 중앙항 계수를 구하세요.`, combination(evenPower, evenPower / 2), `중앙항은 r=${evenPower / 2}이므로 ${inlineMath(`\\binom{${evenPower}}{${evenPower / 2}}=${combination(evenPower, evenPower / 2)}`)}입니다.`, "지수가 짝수이면 가운데 이항계수 하나가 중앙에 있습니다.", countingVisual({ mode: "pascal", row: evenPower, focus: evenPower / 2 })),
        sa(`${inlineMath(`(${coefficient}x-1)^${power}`)}에서 ${inlineMath("x^2")}의 계수를 구하세요.`, squareCoefficient, `${inlineMath(`\\binom{${power}}2${coefficient}^2(-1)^{${power - 2}}=${squareCoefficient}`)}입니다.`, `${coefficient}x를 두 번, -1을 ${power - 2}번 고릅니다.`, countingVisual({ mode: "pascal", row: power, focus: power - 2 })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-02-01",
    unitId: "probability",
    key: "probstat-basic-probability",
    title: "확률의 개념과 기본 성질",
    labels: [
      "수학적 확률", "상대도수", "확률의 범위", "전체사건", "공사건",
      "주사위", "동전", "표본공간", "공정성", "종합 확률",
    ],
    buildProblems() {
      const favorable = randomInteger(1, 5);
      const total = randomInteger(favorable + 1, 12);
      const trialUnit = randomInteger(2, 8);
      const trials = trialUnit * 50;
      const successes = randomInteger(
        trialUnit * 10,
        trialUnit * 40
      );
      const dieThreshold = randomInteger(2, 5);
      const coinTosses = randomInteger(2, 5);
      const spinnerSides = randomInteger(4, 10);
      const cardMultiplier = randomInteger(2, 5);
      const cardTotal = randomInteger(
        2,
        4
      ) * cardMultiplier;
      const multipleCount = Math.floor(
        cardTotal / cardMultiplier
      );
      return [
        sa(`동일하게 일어날 가능성이 있는 ${total}개 결과 중 원하는 결과가 ${favorable}개일 때 확률을 소수로 구하세요.`, probability(favorable, total), `${inlineMath(`P(A)=\\frac{${favorable}}{${total}}=${round4(favorable / total)}`)}입니다.`, "유리한 경우의 수를 전체 경우의 수로 나눕니다.", vennVisual({ total, a: favorable })),
        sa(`어떤 실험을 ${trials}번 시행해 사건 A가 ${successes}번 일어났을 때 상대도수는?`, round4(successes / trials), `${inlineMath(`\\frac{${successes}}{${trials}}=${round4(successes / trials)}`)}입니다.`, "발생 횟수를 시행 횟수로 나누세요.", distributionVisual({ values: [successes / trials, 1 - successes / trials], labels: ["A", "A 아님"] })),
        mc("사건 A의 확률로 가능한 값은?", ["-0.2", "0.65", "1.4", "2"], 1, "확률은 항상 0 이상 1 이하입니다.", "확률의 범위를 확인하세요.", vennVisual({ a: 0.65 })),
        mc("표본공간 전체인 사건 S의 확률 P(S)는?", ["0", "1", "표본점 수", "항상 1보다 크다"], 1, "반드시 일어나는 전체사건의 확률은 1입니다.", "모든 결과를 포함하는 사건입니다.", vennVisual({ total: 1, a: 1 })),
        mc("절대로 일어나지 않는 공사건의 확률은?", ["0", "1", "-1", "정할 수 없다"], 0, "공사건에는 유리한 결과가 없으므로 확률은 0입니다.", "유리한 경우의 수가 0개입니다.", vennVisual({ total: 1, a: 0 })),
        sa(`공정한 주사위를 한 번 던져 ${dieThreshold} 이하의 눈이 나올 확률을 소수로 구하세요.`, round4(dieThreshold / 6), `${dieThreshold}가지 눈이 유리하므로 ${inlineMath(`\\frac{${dieThreshold}}6=${round4(dieThreshold / 6)}`)}입니다.`, `표본공간 {1,2,3,4,5,6}에서 ${dieThreshold} 이하를 표시하세요.`, vennVisual({ total: 6, a: dieThreshold })),
        sa(`공정한 동전을 ${coinTosses}번 던져 앞면이 정확히 한 번 나올 확률은?`, round4(coinTosses / 2 ** coinTosses), `앞면의 위치를 ${coinTosses}곳 중 하나 고르므로 ${inlineMath(`\\frac{${coinTosses}}{2^${coinTosses}}=${round4(coinTosses / 2 ** coinTosses)}`)}입니다.`, "앞면이 나오는 위치를 고르고 전체 결과 수로 나누세요.", treeVisual({ levels: coinTosses, probability: 0.5 })),
        sa(`${spinnerSides}칸이 같은 크기로 나뉜 공정한 회전판을 한 번 돌리는 실험의 표본공간 원소 수는?`, spinnerSides, `가능한 칸은 모두 ${spinnerSides}개입니다.`, "가능한 결과를 빠짐없이 나열하세요.", vennVisual({ total: spinnerSides, a: 0 })),
        mc("모든 결과가 같은 가능성을 가질 때 사용할 수 있는 확률 정의는?", ["수학적 확률", "조건부확률", "표본평균", "표준편차"], 0, "동등 가능성이 확보되면 경우의 수 비로 수학적 확률을 구합니다.", "전체 결과가 같은 가능성인지가 핵심입니다.", vennVisual({ total: 8, a: 3 })),
        sa(`1부터 ${cardTotal}까지 적힌 카드 중 한 장을 뽑아 ${cardMultiplier}의 배수가 나올 확률을 소수로 구하세요.`, round4(multipleCount / cardTotal), `유리한 카드는 ${multipleCount}장이므로 ${inlineMath(`\\frac{${multipleCount}}{${cardTotal}}=${round4(multipleCount / cardTotal)}`)}입니다.`, "유리한 카드를 먼저 나열하세요.", vennVisual({ total: cardTotal, a: multipleCount })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-02-02",
    unitId: "probability",
    key: "probstat-addition-rule",
    title: "확률의 덧셈정리",
    labels: [
      "합사건", "교집합 빼기", "배반사건", "두 조건", "벤다이어그램",
      "주사위 합사건", "카드 합사건", "확률 역산", "세 영역 읽기", "종합 덧셈정리",
    ],
    buildProblems() {
      const aOnly = randomInteger(1, 3) / 10;
      const bOnly = randomInteger(1, 3) / 10;
      const intersection =
        randomInteger(1, 2) / 10;
      const pa = round4(aOnly + intersection);
      const pb = round4(bOnly + intersection);
      const union = round4(pa + pb - intersection);
      const disjointA = randomInteger(2, 5) / 10;
      const disjointB =
        randomInteger(1, 9 - disjointA * 10) /
        10;
      const contextTotal =
        randomInteger(8, 10) * 10;
      const contextA = randomInteger(20, 35);
      const contextB = randomInteger(15, 30);
      const contextBoth = randomInteger(
        5,
        Math.min(contextA, contextB, 10)
      );
      const cardTotal = randomInteger(8, 15);
      const cardA = randomInteger(2, cardTotal - 4);
      const cardB = randomInteger(2, cardTotal - cardA);
      const cardBoth = randomInteger(
        1,
        Math.min(cardA, cardB)
      );
      return [
        sa(`P(A)=${pa}, P(B)=${pb}, P(A∩B)=${intersection}일 때 P(A∪B)는?`, union, `${inlineMath(`P(A\\cup B)=${pa}+${pb}-${intersection}=${union}`)}입니다.`, "겹치는 부분은 두 번 더해졌으므로 한 번 뺍니다.", vennVisual({ a: pa, b: pb, intersection })),
        sa(`P(A)=${pa}, P(B)=${pb}, P(A∩B)=${intersection}일 때 P(A∪B)는?`, union, `${pa}+${pb}-${intersection}=${union}입니다.`, "A와 B의 겹침을 빼세요.", vennVisual({ a: pa, b: pb, intersection })),
        sa(`A와 B가 배반이고 P(A)=${disjointA}, P(B)=${disjointB}일 때 P(A∪B)는?`, round4(disjointA + disjointB), `배반이면 교집합 확률이 0이므로 ${disjointA}+${disjointB}=${round4(disjointA + disjointB)}입니다.`, "배반사건은 겹치는 영역이 없습니다.", vennVisual({ a: disjointA, b: disjointB, intersection: 0 })),
        sa(`${contextTotal}명 중 A에 속한 학생이 ${contextA}명, B에 속한 학생이 ${contextB}명이고 둘 다 속한 학생이 ${contextBoth}명일 때 적어도 하나에 속할 확률은?`, round4((contextA + contextB - contextBoth) / contextTotal), `합집합 인원은 ${contextA}+${contextB}-${contextBoth}=${contextA + contextB - contextBoth}명이므로 확률은 ${round4((contextA + contextB - contextBoth) / contextTotal)}입니다.`, "둘 다 속한 학생은 한 번만 세어야 합니다.", vennVisual({ total: contextTotal, a: contextA, b: contextB, intersection: contextBoth })),
        mc("P(A∪B)를 나타내는 식은?", ["P(A)+P(B)", "P(A)+P(B)-P(A∩B)", "P(A)P(B)", "1-P(A)"], 1, "덧셈정리는 교집합을 한 번 뺍니다.", "벤다이어그램에서 겹침이 몇 번 세어졌는지 보세요.", vennVisual({ a: 0.5, b: 0.4, intersection: 0.2 })),
        sa(`전체 ${cardTotal}개의 같은 가능성 결과에서 A가 ${cardA}개, B가 ${cardB}개, 두 사건에 모두 속한 결과가 ${cardBoth}개일 때 합사건의 확률은?`, round4((cardA + cardB - cardBoth) / cardTotal), `유리한 결과는 ${cardA}+${cardB}-${cardBoth}=${cardA + cardB - cardBoth}개입니다.`, "교집합에 속한 결과는 한 번만 셉니다.", vennVisual({ total: cardTotal, a: cardA, b: cardB, intersection: cardBoth })),
        sa(`1부터 ${cardTotal}까지의 카드에서 사건 A에 ${cardA}장, 사건 B에 ${cardB}장, 두 사건에 모두 ${cardBoth}장이 속할 때 A 또는 B인 카드를 뽑을 확률은?`, round4((cardA + cardB - cardBoth) / cardTotal), `${inlineMath(`\\frac{${cardA}+${cardB}-${cardBoth}}{${cardTotal}}=${round4((cardA + cardB - cardBoth) / cardTotal)}`)}입니다.`, "겹치는 카드는 한 번만 셉니다.", vennVisual({ total: cardTotal, a: cardA, b: cardB, intersection: cardBoth })),
        sa(`P(A∪B)=${union}, P(A)=${pa}, P(B)=${pb}일 때 P(A∩B)는?`, intersection, `P(A∩B)=${pa}+${pb}-${union}=${intersection}입니다.`, "덧셈정리를 교집합에 대해 정리하세요.", vennVisual({ a: pa, b: pb, intersection })),
        sa(`A만의 확률이 ${aOnly}, B만의 확률이 ${bOnly}, 교집합 확률이 ${intersection}일 때 P(A∪B)는?`, union, `서로 겹치지 않는 세 영역을 더해 ${union}입니다.`, "A만, 겹침, B만을 각각 한 번씩 더하세요.", vennVisual({ aOnly, bOnly, intersection })),
        sa(`P(A)=${pa}, P(B)=${pb}이고 P(A∪B)=${union}일 때 P(A∩B)는?`, intersection, `${pa}+${pb}-${union}=${intersection}입니다.`, "합사건 식을 교집합 확률에 대해 풀어보세요.", vennVisual({ a: pa, b: pb, intersection })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-02-03",
    unitId: "probability",
    key: "probstat-complement",
    title: "여사건의 확률",
    labels: [
      "여사건 공식", "적어도 하나", "한 번도 없음", "최대 조건", "주사위 반복",
      "불량품", "생일 조건", "합격 확률", "범위의 여사건", "종합 여사건",
    ],
    buildProblems() {
      const p = randomInteger(1, 8) / 10;
      const repeatedP = randomInteger(1, 7) / 10;
      const repeatedN = randomInteger(2, 6);
      const threshold = randomInteger(2, 5);
      const dieRepeats = randomInteger(2, 5);
      const defectRate =
        randomInteger(1, 8) / 100;
      const productCount = randomInteger(3, 8);
      const passProbability =
        randomInteger(55, 90) / 100;
      const cardMultiple = randomInteger(2, 6);
      const cardTotal =
        cardMultiple * randomInteger(3, 6);
      const notProbability =
        randomInteger(1, 8) / 10;
      return [
        sa(`P(A)=${p}일 때 P(Aᶜ)는?`, round4(1 - p), `${inlineMath(`P(A^c)=1-${p}=${round4(1 - p)}`)}입니다.`, "사건과 여사건은 표본공간 전체를 나눕니다.", vennVisual({ a: p, complement: true })),
        sa(`성공 확률이 ${repeatedP}인 시행을 ${repeatedN}번 독립적으로 할 때 적어도 한 번 성공할 확률은?`, round4(1 - (1 - repeatedP) ** repeatedN), `한 번도 성공하지 않을 확률 ${inlineMath(`(1-${repeatedP})^${repeatedN}`)}을 1에서 빼면 ${round4(1 - (1 - repeatedP) ** repeatedN)}입니다.`, "'적어도 한 번'의 여사건은 '한 번도 없음'입니다.", treeVisual({ levels: repeatedN, probability: repeatedP, complement: true })),
        sa(`앞면 확률이 ${repeatedP}인 동전을 ${repeatedN}번 던져 앞면이 한 번도 안 나올 확률은?`, round4((1 - repeatedP) ** repeatedN), `${inlineMath(`(1-${repeatedP})^${repeatedN}=${round4((1 - repeatedP) ** repeatedN)}`)}입니다.`, "모든 시행에서 앞면이 나오지 않아야 합니다.", treeVisual({ levels: repeatedN, probability: repeatedP })),
        sa(`주사위를 ${repeatedN}번 던져 나온 눈이 모두 ${threshold} 이하일 확률은?`, round4((threshold / 6) ** repeatedN), `${inlineMath(`(${threshold}/6)^${repeatedN}=${round4((threshold / 6) ** repeatedN)}`)}입니다.`, `각 시행에서 허용되는 눈은 1부터 ${threshold}까지입니다.`, treeVisual({ levels: repeatedN, probability: threshold / 6 })),
        sa(`주사위를 ${dieRepeats}번 던져 6이 적어도 한 번 나올 확률을 소수로 구하세요.`, round4(1 - (5 / 6) ** dieRepeats), `${inlineMath(`1-(5/6)^${dieRepeats}=${round4(1 - (5 / 6) ** dieRepeats)}`)}입니다.`, "6이 한 번도 나오지 않는 경우를 빼세요.", treeVisual({ levels: dieRepeats, probability: 1 / 6, complement: true })),
        sa(`불량률이 ${defectRate}인 제품 ${productCount}개가 독립일 때 적어도 하나가 불량일 확률을 소수로 구하세요.`, round4(1 - (1 - defectRate) ** productCount), `${inlineMath(`1-(1-${defectRate})^${productCount}=${round4(1 - (1 - defectRate) ** productCount)}`)}입니다.`, "모두 정상일 확률의 여사건입니다.", treeVisual({ levels: productCount, probability: defectRate, complement: true })),
        mc("'적어도 두 사람이 같은 생일'의 여사건은?", ["모두 생일이 다르다", "모두 생일이 같다", "정확히 두 명만 같다", "한 명만 생일이 있다"], 0, "같은 생일 쌍이 하나도 없다는 것은 모두 다르다는 뜻입니다.", "적어도 하나의 충돌이 없다고 바꿔 말하세요.", vennVisual({ complement: true })),
        sa(`시험에 합격할 확률이 ${passProbability}일 때 불합격할 확률은?`, round4(1 - passProbability), `1-${passProbability}=${round4(1 - passProbability)}입니다.`, "합격과 불합격은 서로 여사건입니다.", vennVisual({ a: passProbability, complement: true })),
        sa(`1부터 ${cardTotal} 카드 중 ${cardMultiple}의 배수가 아닌 카드를 뽑을 확률은?`, round4(1 - 1 / cardMultiple), `${cardMultiple}의 배수는 ${cardTotal / cardMultiple}개이므로 ${inlineMath(`1-\\frac{${cardTotal / cardMultiple}}{${cardTotal}}=${round4(1 - 1 / cardMultiple)}`)}입니다.`, `먼저 ${cardMultiple}의 배수 확률을 구하세요.`, vennVisual({ total: cardTotal, a: cardTotal / cardMultiple, complement: true })),
        sa(`어떤 사건이 일어나지 않을 확률이 ${notProbability}일 때 그 사건이 일어날 확률은?`, round4(1 - notProbability), `1-${notProbability}=${round4(1 - notProbability)}입니다.`, "사건과 여사건의 확률 합은 1입니다.", vennVisual({ a: 1 - notProbability, complement: true })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-02-04",
    unitId: "probability",
    key: "probstat-conditional-probability",
    title: "조건부확률",
    labels: [
      "조건부확률 공식", "표본공간 축소", "표에서 계산", "카드 조건", "주사위 조건",
      "검사 결과", "조건 역산", "나무도표", "인과 오해", "종합 조건부확률",
    ],
    buildProblems() {
      const conditionProbability =
        randomInteger(3, 8) / 10;
      const withinRatio =
        randomInteger(2, 8) / 10;
      const jointProbability = round4(
        conditionProbability * withinRatio
      );
      const conditionCount =
        randomInteger(2, 8) * 10;
      const jointCount = randomInteger(
        1,
        conditionCount / 10 - 1
      ) * 10;
      const groupCount = randomInteger(15, 40);
      const favorableCount = randomInteger(
        3,
        groupCount - 2
      );
      const dieConditionCount = randomInteger(3, 6);
      const prevalence =
        randomInteger(1, 4) / 10;
      const sensitivity =
        randomInteger(6, 9) / 10;
      const firstPath =
        randomInteger(2, 7) / 10;
      const secondPath =
        randomInteger(2, 8) / 10;
      return [
        sa(`P(A∩B)=${jointProbability}, P(B)=${conditionProbability}일 때 P(A|B)는?`, withinRatio, `${inlineMath(`P(A|B)=${jointProbability}/${conditionProbability}=${withinRatio}`)}입니다.`, "조건 B가 새 표본공간의 전체가 됩니다.", vennVisual({ b: conditionProbability, intersection: jointProbability, conditional: "B" })),
        sa(`${conditionCount + randomInteger(10, 50)}명 중 조건 B에 속한 학생이 ${conditionCount}명이고, 그중 ${jointCount}명이 사건 A에 속한다. B라는 조건에서 A일 확률은?`, round4(jointCount / conditionCount), `조건에 맞는 ${conditionCount}명만 남기고 ${inlineMath(`\\frac{${jointCount}}{${conditionCount}}=${round4(jointCount / conditionCount)}`)}입니다.`, "전체 인원이 아니라 조건 집단의 인원이 분모입니다.", vennVisual({ b: conditionCount, intersection: jointCount, conditional: "B" })),
        sa(`한 집단 ${groupCount}명 중 특정 활동을 좋아하는 사람이 ${favorableCount}명일 때, 이 집단에 속한다는 조건에서 활동을 좋아할 확률은?`, round4(favorableCount / groupCount), `${inlineMath(`\\frac{${favorableCount}}{${groupCount}}=${round4(favorableCount / groupCount)}`)}입니다.`, "조건 집단 안에서의 비율을 구하세요.", vennVisual({ b: groupCount, intersection: favorableCount, conditional: "B" })),
        sa(`조건 B에 해당하는 카드가 ${conditionCount}장이고 그중 사건 A에도 속하는 카드가 ${jointCount}장일 때 P(A|B)는?`, round4(jointCount / conditionCount), `${inlineMath(`\\frac{${jointCount}}{${conditionCount}}=${round4(jointCount / conditionCount)}`)}입니다.`, "조건 B의 카드만 남겨 새 표본공간을 만드세요.", vennVisual({ b: conditionCount, intersection: jointCount, conditional: "B" })),
        sa(`조건을 만족하는 주사위 결과가 ${dieConditionCount}개이고 그중 사건 A에 속하는 결과가 2개일 때 조건부확률을 구하세요.`, round4(2 / dieConditionCount), `${inlineMath(`\\frac2{${dieConditionCount}}=${round4(2 / dieConditionCount)}`)}입니다.`, "조건을 만족하는 눈부터 나열하세요.", vennVisual({ b: dieConditionCount, intersection: 2, conditional: "B" })),
        sa(`질병 유병률이 ${prevalence}이고, 환자가 양성일 확률이 ${sensitivity}일 때 환자이면서 양성일 확률은?`, round4(prevalence * sensitivity), `${prevalence}×${sensitivity}=${round4(prevalence * sensitivity)}입니다.`, "P(환자∩양성)=P(환자)P(양성|환자)입니다.", treeVisual({ first: prevalence, conditional: sensitivity })),
        sa(`P(A|B)=${withinRatio}, P(B)=${conditionProbability}일 때 P(A∩B)는?`, jointProbability, `${withinRatio}×${conditionProbability}=${jointProbability}입니다.`, "조건부확률 공식을 교집합에 대해 정리하세요.", vennVisual({ b: conditionProbability, intersection: jointProbability, conditional: "B" })),
        sa(`첫 상자 선택 확률이 ${firstPath}이고, 그 상자에서 빨간 공을 뽑을 조건부확률이 ${secondPath}일 때 그 경로의 확률은?`, round4(firstPath * secondPath), `나무의 한 경로는 ${firstPath}×${secondPath}=${round4(firstPath * secondPath)}입니다.`, "한 경로의 가지 확률을 곱하세요.", treeVisual({ first: firstPath, conditional: secondPath })),
        mc("P(A|B)가 크다는 사실만으로 말할 수 없는 것은?", ["B인 경우 A의 비율이 크다", "B가 A의 원인이다", "표본공간이 B로 줄었다", "P(A∩B)/P(B)로 계산한다"], 1, "조건부확률은 연관을 나타내지만 인과관계를 자동으로 뜻하지 않습니다.", "시간 순서나 원인을 확률식만으로 단정할 수 없습니다.", vennVisual({ conditional: "B" })),
        sa(`P(A∩B)=${jointProbability}, P(B)=${conditionProbability}일 때 P(A|B)는?`, withinRatio, `${jointProbability}/${conditionProbability}=${withinRatio}입니다.`, "이번에는 B가 조건이므로 분모가 P(B)입니다.", vennVisual({ b: conditionProbability, intersection: jointProbability, conditional: "B" })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-02-05",
    unitId: "probability",
    key: "probstat-independence",
    title: "사건의 독립과 종속",
    labels: [
      "독립 판정", "조건부확률 판정", "종속 판정", "동전 시행", "비복원 추출",
      "복원 추출", "독립의 곱", "배반과 독립", "표 자료 판정", "종합 독립성",
    ],
    buildProblems() {
      const independentA =
        randomInteger(2, 7) / 10;
      const independentB =
        randomInteger(2, 7) / 10;
      const independentIntersection =
        round4(independentA * independentB);
      const independentUnion = round4(
        independentA +
          independentB -
          independentIntersection
      );
      return [
        mc("P(A)=0.4, P(B)=0.5, P(A∩B)=0.2일 때 두 사건의 관계는?", ["독립", "종속", "배반", "판단 불가"], 0, "0.4×0.5=0.2이므로 독립입니다.", "교집합 확률과 두 확률의 곱을 비교하세요.", vennVisual({ a: 0.4, b: 0.5, intersection: 0.2 })),
        mc("P(A|B)=P(A)이고 P(B)>0일 때 A와 B의 관계는?", ["독립", "종속", "배반", "여사건"], 0, "B가 일어나도 A의 확률이 바뀌지 않으므로 독립입니다.", "조건이 정보를 주었을 때 확률이 변하는지 보세요.", vennVisual({ independent: true })),
        mc("P(A)=0.5, P(B)=0.4, P(A∩B)=0.3일 때 두 사건의 관계는?", ["독립", "종속", "배반", "여사건"], 1, "0.5×0.4=0.2이지만 교집합은 0.3이므로 종속입니다.", "독립이라면 교집합은 곱과 같아야 합니다.", vennVisual({ a: 0.5, b: 0.4, intersection: 0.3 })),
        mc("공정한 동전을 두 번 던질 때 첫 번째가 앞면인 사건과 두 번째가 앞면인 사건의 관계는?", ["독립", "종속", "배반", "같은 사건"], 0, "첫 시행 결과는 둘째 시행의 확률을 바꾸지 않습니다.", "서로 다른 독립 시행입니다.", treeVisual({ levels: 2, probability: 0.5 })),
        mc("주머니에서 공을 비복원으로 두 번 뽑을 때 첫 결과와 둘째 결과는 일반적으로?", ["독립", "종속", "배반", "여사건"], 1, "첫 공을 빼면 주머니 구성이 바뀌므로 둘째 확률이 변합니다.", "첫 시행 뒤 전체 개수가 줄어듭니다.", treeVisual({ withoutReplacement: true })),
        mc("공을 뽑고 다시 넣은 뒤 두 번째 공을 뽑으면 두 시행은?", ["독립", "종속", "배반", "불가능"], 0, "복원하면 주머니 구성이 원래대로 돌아와 확률이 변하지 않습니다.", "두 번째 시행 전에 상태가 복구됩니다.", treeVisual({ replacement: true })),
        sa(`독립인 A, B에 대해 P(A)=${independentA}, P(B)=${independentB}일 때 P(A∩B)는?`, independentIntersection, `독립이므로 ${independentA}×${independentB}=${independentIntersection}입니다.`, "독립 사건의 교집합 확률은 곱입니다.", vennVisual({ a: independentA, b: independentB, intersection: independentIntersection })),
        mc("확률이 모두 양수인 두 배반사건은 독립인가?", ["항상 독립", "독립이 아니다", "항상 같은 사건", "판단 불가"], 1, "배반이면 교집합은 0이지만 확률의 곱은 양수라 같지 않습니다.", "배반과 독립은 서로 다른 개념입니다.", vennVisual({ intersection: 0 })),
        mc("전체 100명 중 A 40명, B 50명, 둘 다 20명일 때 A와 B는?", ["독립", "종속", "배반", "여사건"], 0, "P(A∩B)=0.2이고 P(A)P(B)=0.4×0.5=0.2입니다.", "빈도를 확률로 바꿔 곱과 비교하세요.", vennVisual({ total: 100, a: 40, b: 50, intersection: 20 })),
        sa(`독립인 A와 B에 대해 P(A∪B)=${independentUnion}, P(A)=${independentA}, P(B)=${independentB}일 때 P(A∩B)는?`, independentIntersection, `독립이므로 ${independentA}×${independentB}=${independentIntersection}이고 덧셈정리와도 일치합니다.`, "독립 조건을 먼저 사용하세요.", vennVisual({ a: independentA, b: independentB, intersection: independentIntersection })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-02-06",
    unitId: "probability",
    key: "probstat-multiplication-rule",
    title: "확률의 곱셈정리",
    labels: [
      "곱셈정리", "연속 추출", "나무 경로", "독립 시행", "비복원",
      "두 경로 합", "조건부확률 활용", "세 단계 경로", "역산", "종합 곱셈정리",
    ],
    buildProblems() {
      const first = randomInteger(2, 8) / 10;
      const conditional =
        randomInteger(2, 8) / 10;
      const pathProbability = round4(
        first * conditional
      );
      const red = randomInteger(3, 7);
      const blue = randomInteger(2, 6);
      const ballTotal = red + blue;
      const branchA = randomInteger(2, 6) / 10;
      const successA = randomInteger(2, 8) / 10;
      const successB = randomInteger(2, 8) / 10;
      const threePath = [
        randomInteger(2, 8) / 10,
        randomInteger(2, 8) / 10,
        randomInteger(2, 8) / 10,
      ];
      const tosses = randomInteger(2, 5);
      return [
        sa(`P(A)=${first}, P(B|A)=${conditional}일 때 P(A∩B)는?`, pathProbability, `${first}×${conditional}=${pathProbability}입니다.`, "첫 사건 확률과 그 뒤 조건부확률을 곱합니다.", treeVisual({ first, conditional })),
        sa(`빨간 공 ${red}개, 파란 공 ${blue}개에서 비복원으로 빨간 공을 연속 두 번 뽑을 확률은?`, round4((red / ballTotal) * ((red - 1) / (ballTotal - 1))), `${inlineMath(`\\frac{${red}}{${ballTotal}}\\times\\frac{${red - 1}}{${ballTotal - 1}}=${round4((red / ballTotal) * ((red - 1) / (ballTotal - 1)))}`)}입니다.`, "첫 빨간 공을 뽑은 뒤 빨간 공과 전체 공이 모두 하나씩 줄어듭니다.", treeVisual({ withoutReplacement: true, first: red / ballTotal, conditional: (red - 1) / (ballTotal - 1) })),
        sa(`나무도표에서 한 경로의 가지 확률이 ${first}와 ${conditional}일 때 경로 확률은?`, pathProbability, `${first}×${conditional}=${pathProbability}입니다.`, "한 경로에서는 가지를 곱합니다.", treeVisual({ first, conditional })),
        sa(`성공확률 ${conditional}인 독립 시행을 ${tosses}번 모두 성공할 확률은?`, round4(conditional ** tosses), `${inlineMath(`${conditional}^${tosses}=${round4(conditional ** tosses)}`)}입니다.`, "독립 시행의 같은 경로 확률을 곱하세요.", treeVisual({ levels: tosses, probability: conditional })),
        sa(`${ballTotal}개 중 불량품 ${blue}개를 비복원으로 두 개 뽑아 모두 불량일 확률을 소수로 구하세요.`, round4((blue / ballTotal) * ((blue - 1) / (ballTotal - 1))), `${inlineMath(`\\frac{${blue}}{${ballTotal}}\\times\\frac{${blue - 1}}{${ballTotal - 1}}=${round4((blue / ballTotal) * ((blue - 1) / (ballTotal - 1)))}`)}입니다.`, "첫 불량품을 뽑은 뒤 남은 불량품은 하나 줄어듭니다.", treeVisual({ withoutReplacement: true, first: blue / ballTotal, conditional: (blue - 1) / (ballTotal - 1) })),
        sa(`상자 A를 고를 확률이 ${branchA}, A에서 성공할 확률이 ${successA}, 상자 B에서 성공할 확률이 ${successB}일 때 전체 성공확률은?`, round4(branchA * successA + (1 - branchA) * successB), `두 성공 경로를 더해 ${inlineMath(`${branchA}\\cdot${successA}+${round4(1 - branchA)}\\cdot${successB}=${round4(branchA * successA + (1 - branchA) * successB)}`)}입니다.`, "경로 안에서는 곱하고, 서로 다른 경로끼리는 더합니다.", treeVisual({ paths: [[branchA, successA], [1 - branchA, successB]] })),
        sa(`P(A∩B)=${pathProbability}, P(A)=${first}일 때 P(B|A)는?`, conditional, `${pathProbability}/${first}=${conditional}입니다.`, "곱셈정리를 조건부확률에 대해 정리하세요.", treeVisual({ first, conditional })),
        sa(`세 단계 경로의 확률이 각각 ${threePath.join(", ")}일 때 전체 경로 확률은?`, round4(threePath.reduce((value, item) => value * item, 1)), `${threePath.join("×")}=${round4(threePath.reduce((value, item) => value * item, 1))}입니다.`, "같은 경로에 놓인 모든 가지를 곱합니다.", treeVisual({ path: threePath })),
        sa(`P(A∩B)=${pathProbability}, P(B|A)=${conditional}일 때 P(A)는?`, first, `P(A)=${pathProbability}/${conditional}=${first}입니다.`, "P(A∩B)=P(A)P(B|A)를 사용하세요.", treeVisual({ first, conditional })),
        sa(`공정한 동전을 ${tosses}번 던져 미리 정한 한 가지 순서로 나올 확률은?`, round4((1 / 2) ** tosses), `${inlineMath(`(1/2)^${tosses}=${round4((1 / 2) ** tosses)}`)}입니다.`, "정해진 한 경로의 가지 확률을 모두 곱합니다.", treeVisual({ path: Array(tosses).fill(0.5) })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-01",
    unitId: "statistics",
    key: "probstat-random-variable",
    title: "확률변수와 확률분포",
    labels: [
      "확률변수 뜻", "분포표 완성", "확률의 합", "함숫값 확률", "누적확률",
      "주사위 확률변수", "동전 확률변수", "미지 확률", "분포 판정", "종합 분포",
    ],
    buildProblems() {
      const p1 = randomInteger(1, 3) / 10;
      const p2 =
        randomInteger(
          1,
          8 - Math.round(p1 * 10)
        ) / 10;
      const p3 = round4(1 - p1 - p2);
      const dieFocus = randomInteger(1, 6);
      const coinTosses = randomInteger(2, 5);
      const coinHeads = randomInteger(
        1,
        coinTosses - 1
      );
      const weight = randomInteger(2, 5);
      const symmetricValue = randomInteger(1, 5);
      const symmetricProbability =
        randomInteger(1, 4) / 10;
      return [
        mc("확률변수 X에 대한 설명으로 옳은 것은?", ["표본공간의 결과를 수에 대응시키는 함수", "항상 연속인 함수", "확률 그 자체", "표본의 개수"], 0, "확률변수는 각 결과를 실수값에 대응시키는 함수입니다.", "결과를 숫자로 바꾸는 규칙이라고 생각하세요.", distributionVisual({ values: [0, 1, 2], probabilities: [0.2, 0.5, 0.3] })),
        sa(`P(X=0)=${p1}, P(X=1)=${p2}일 때 P(X=2)는?`, p3, `확률의 합이 1이므로 1-${p1}-${p2}=${p3}입니다.`, "분포표의 모든 확률을 더하면 1입니다.", distributionVisual({ values: [0, 1, 2], probabilities: [p1, p2, p3] })),
        sa(`X가 1,2,3을 각각 확률 ${p1}, ${p2}, ${p3}으로 가질 때 확률의 합은?`, 1, `${p1}+${p2}+${p3}=1입니다.`, "완전한 확률분포의 막대 높이 합을 보세요.", distributionVisual({ values: [1, 2, 3], probabilities: [p1, p2, p3] })),
        sa(`P(X=1)=${p1}, P(X=2)=${p2}, P(X=3)=${p3}일 때 P(X≥2)는?`, round4(p2 + p3), `${p2}+${p3}=${round4(p2 + p3)}입니다.`, "조건을 만족하는 막대의 확률만 더하세요.", distributionVisual({ values: [1, 2, 3], probabilities: [p1, p2, p3], focusFrom: 2 })),
        sa(`P(X=1)=${p1}, P(X=2)=${p2}, P(X=3)=${p3}일 때 P(X≤2)는?`, round4(p1 + p2), `${p1}+${p2}=${round4(p1 + p2)}입니다.`, "2 이하의 막대를 모두 더합니다.", distributionVisual({ values: [1, 2, 3], probabilities: [p1, p2, p3], focusTo: 2 })),
        sa(`주사위를 한 번 던져 X를 나온 눈이라 할 때 P(X=${dieFocus})는?`, probability(1, 6), "각 눈은 동일하게 1/6입니다.", `X=${dieFocus}에 해당하는 표본점은 하나입니다.`, distributionVisual({ values: [1, 2, 3, 4, 5, 6], probabilities: Array(6).fill(1 / 6), focus: dieFocus })),
        sa(`동전을 ${coinTosses}번 던져 X를 앞면 수라 할 때 P(X=${coinHeads})는?`, binomialProbability(coinTosses, 0.5, coinHeads), `${inlineMath(`\\binom{${coinTosses}}{${coinHeads}}(0.5)^${coinTosses}=${binomialProbability(coinTosses, 0.5, coinHeads)}`)}입니다.`, `X=${coinHeads}이 되는 앞면 위치를 고르세요.`, distributionVisual({ values: Array.from({ length: coinTosses + 1 }, (_, index) => index), probabilities: Array.from({ length: coinTosses + 1 }, (_, index) => binomialProbability(coinTosses, 0.5, index)), focus: coinHeads })),
        sa(`P(X=0)=a, P(X=1)=${weight}a, P(X=2)=a일 때 a는?`, round4(1 / (weight + 2)), `a+${weight}a+a=1이므로 a=${round4(1 / (weight + 2))}입니다.`, "모든 확률의 합이 1이라는 식을 세우세요.", distributionVisual({ values: [0, 1, 2], probabilities: [1 / (weight + 2), weight / (weight + 2), 1 / (weight + 2)] })),
        mc("확률분포가 될 수 없는 것은?", ["0.2, 0.3, 0.5", "0.1, 0.1, 0.8", "-0.1, 0.5, 0.6", "0, 0.4, 0.6"], 2, "확률은 음수가 될 수 없습니다.", "각 값의 범위와 전체 합을 모두 확인하세요.", distributionVisual({ values: [0, 1, 2], probabilities: [-0.1, 0.5, 0.6] })),
        sa(`X의 값이 -${symmetricValue},0,${symmetricValue}이고 확률이 각각 ${symmetricProbability},${round4(1 - 2 * symmetricProbability)},${symmetricProbability}일 때 P(|X|=${symmetricValue})는?`, round4(2 * symmetricProbability), `양 끝 확률을 더해 ${round4(2 * symmetricProbability)}입니다.`, `|X|=${symmetricValue}가 되는 두 막대를 고르세요.`, distributionVisual({ values: [-symmetricValue, 0, symmetricValue], probabilities: [symmetricProbability, 1 - 2 * symmetricProbability, symmetricProbability], focusValues: [-symmetricValue, symmetricValue] })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-02",
    unitId: "statistics",
    key: "probstat-expectation-deviation",
    title: "이산확률변수의 기댓값과 표준편차",
    labels: [
      "기댓값", "분산", "표준편차", "선형변환 평균", "선형변환 분산",
      "공정한 게임", "미지 확률 평균", "편차 제곱", "두 점 분포", "종합 통계량",
    ],
    buildProblems() {
      const highValue = randomInteger(2, 6);
      const values = [0, 1, highValue];
      const firstProbability =
        randomInteger(1, 3) / 10;
      const secondProbability =
        randomInteger(2, 5) / 10;
      const thirdProbability = round4(
        1 -
          firstProbability -
          secondProbability
      );
      const probabilities = [
        firstProbability,
        secondProbability,
        thirdProbability,
      ];
      const mean = round4(
        values.reduce(
          (sum, value, index) =>
            sum +
            value * probabilities[index],
          0
        )
      );
      const variance = round4(
        values.reduce(
          (sum, value, index) =>
            sum +
            (value - mean) ** 2 *
              probabilities[index],
          0
        )
      );
      const standardDeviation = randomInteger(1, 4);
      const baseMean = randomInteger(1, 6);
      const scale = randomInteger(2, 4);
      const shift = randomInteger(-3, 6);
      const baseVariance = randomInteger(1, 6);
      const win = randomInteger(5, 15) * 100;
      const loss = randomInteger(1, 8) * 100;
      const twoPointHigh = randomInteger(2, 8);
      const highProbability =
        randomInteger(2, 8) / 10;
      const deviationMean = randomInteger(-2, 5);
      const deviationValue =
        deviationMean + randomInteger(2, 6);
      const low = randomInteger(-3, 3);
      const high = low + 2 * randomInteger(1, 5);
      const midpoint = (low + high) / 2;
      const twoPointVariance =
        ((high - low) / 2) ** 2;
      return [
        sa(`X가 ${values.join(",")}를 확률 ${probabilities.join(",")}로 가질 때 E(X)는?`, mean, `각 값에 확률을 곱해 더하면 ${mean}입니다.`, "각 값에 그 확률을 곱해 모두 더하세요.", distributionVisual({ values, probabilities, mean })),
        sa(`X가 ${values.join(",")}를 확률 ${probabilities.join(",")}로 가질 때 V(X)를 구하세요.`, variance, `평균 ${mean}을 기준으로 편차 제곱을 가중평균하면 ${variance}입니다.`, "E(X²)-[E(X)]²을 계산하세요.", distributionVisual({ values, probabilities, mean, variance })),
        sa(`V(X)=${standardDeviation ** 2}일 때 표준편차 σ(X)는?`, standardDeviation, `표준편차는 분산의 양의 제곱근이므로 ${standardDeviation}입니다.`, "표준편차는 음수가 아닙니다.", distributionVisual({ variance: standardDeviation ** 2 })),
        sa(`E(X)=${baseMean}일 때 E(${scale}X${shift >= 0 ? `+${shift}` : shift})는?`, scale * baseMean + shift, `E(${scale}X${shift >= 0 ? `+${shift}` : shift})=${scale}E(X)${shift >= 0 ? `+${shift}` : shift}=${scale * baseMean + shift}입니다.`, "평균에는 곱과 더하기가 모두 반영됩니다.", distributionVisual({ mean: baseMean, transformedMean: scale * baseMean + shift })),
        sa(`V(X)=${baseVariance}일 때 V(${scale}X${shift >= 0 ? `+${shift}` : shift})는?`, scale ** 2 * baseVariance, `상수 이동은 분산을 바꾸지 않고 배율의 제곱을 곱하므로 ${scale}²×${baseVariance}=${scale ** 2 * baseVariance}입니다.`, `분산에는 ${scale}이 아니라 ${scale}²이 곱해집니다.`, distributionVisual({ variance: baseVariance, transformedVariance: scale ** 2 * baseVariance })),
        sa(`50% 확률로 ${win}원을 얻고 50% 확률로 ${loss}원을 잃는 게임의 기대수익은?`, (win - loss) / 2, `${win}×0.5+(-${loss})×0.5=${(win - loss) / 2}원입니다.`, "손실은 음수로 넣으세요.", distributionVisual({ values: [-loss, win], probabilities: [0.5, 0.5], mean: (win - loss) / 2 })),
        sa(`X가 0과 ${twoPointHigh}를 확률 p, 1-p로 갖고 E(X)=${round4(twoPointHigh * (1 - highProbability))}일 때 p는?`, highProbability, `${twoPointHigh}(1-p)=${round4(twoPointHigh * (1 - highProbability))}이므로 p=${highProbability}입니다.`, "기댓값 식을 p에 대해 푸세요.", distributionVisual({ values: [0, twoPointHigh], probabilities: [highProbability, 1 - highProbability], mean: twoPointHigh * (1 - highProbability) })),
        sa(`평균이 ${deviationMean}일 때 값 ${deviationValue}의 편차 제곱은?`, (deviationValue - deviationMean) ** 2, `(${deviationValue}-${deviationMean})²=${(deviationValue - deviationMean) ** 2}입니다.`, "값에서 평균을 뺀 뒤 제곱합니다.", distributionVisual({ values: [deviationMean, deviationValue], mean: deviationMean, focus: deviationValue })),
        sa(`X가 ${low}와 ${high}를 같은 확률로 가질 때 E(X)는?`, midpoint, `(${low}+${high})/2=${midpoint}입니다.`, "같은 확률인 두 점의 무게중심은 가운데입니다.", distributionVisual({ values: [low, high], probabilities: [0.5, 0.5], mean: midpoint })),
        sa(`X가 ${low}와 ${high}를 같은 확률로 가질 때 V(X)는?`, twoPointVariance, `평균 ${midpoint}에서 두 값까지의 거리는 ${(high - low) / 2}이므로 분산은 ${twoPointVariance}입니다.`, "각 편차 제곱을 확률로 가중평균하세요.", distributionVisual({ values: [low, high], probabilities: [0.5, 0.5], mean: midpoint, variance: twoPointVariance })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-03",
    unitId: "statistics",
    key: "probstat-binomial-distribution",
    title: "이항분포",
    labels: [
      "이항확률", "정확히 k번", "한 번도 성공하지 않음", "적어도 한 번",
      "평균", "분산", "표준편차", "최빈값 관찰", "확률 비교", "종합 이항분포",
    ],
    buildProblems() {
      const n = randomInteger(4, 7);
      const p = [0.2, 0.3, 0.4, 0.5][randomInteger(0, 3)];
      const k = randomInteger(1, n - 1);
      const standardDeviation = randomInteger(1, 4);
      const standardDeviationN =
        4 * standardDeviation ** 2;
      const defectN = randomInteger(5, 10);
      const defectP =
        [0.1, 0.2, 0.3][randomInteger(0, 2)];
      const defectK = randomInteger(
        1,
        Math.min(2, defectN - 1)
      );
      const probs = Array.from({ length: n + 1 }, (_, index) =>
        binomialProbability(n, p, index)
      );
      return [
        sa(`${inlineMath(`X\\sim B(${n},${p})`)}일 때 P(X=${k})를 소수로 구하세요.`, binomialProbability(n, p, k), `${inlineMath(`\\binom{${n}}{${k}}${p}^{${k}}(1-${p})^{${n - k}}`)}입니다.`, "성공 위치를 고르는 이항계수와 한 경로의 확률을 곱하세요.", binomialVisual({ n, p, probabilities: probs, focus: k })),
        sa(`성공확률 ${p}인 시행을 ${n}번 하여 정확히 ${k}번 성공할 확률은?`, binomialProbability(n, p, k), `${inlineMath(`\\binom{${n}}{${k}}${p}^{${k}}(1-${p})^{${n - k}}=${binomialProbability(n, p, k)}`)}입니다.`, `성공 ${k}번의 위치를 고르는 경우의 수를 포함하세요.`, binomialVisual({ n, p, focus: k })),
        sa(`${inlineMath(`X\\sim B(${n},${p})`)}일 때 P(X=0)는?`, round4((1 - p) ** n), `${inlineMath(`(1-${p})^{${n}}`)}입니다.`, "모든 시행이 실패하는 한 경로입니다.", binomialVisual({ n, p, probabilities: probs, focus: 0 })),
        sa(`성공확률 ${p}인 시행을 ${n}번 하여 적어도 한 번 성공할 확률은?`, round4(1 - (1 - p) ** n), `${inlineMath(`1-(1-${p})^{${n}}=${round4(1 - (1 - p) ** n)}`)}입니다.`, "X≥1의 여사건은 X=0입니다.", binomialVisual({ n, p, focusFrom: 1 })),
        sa(`${inlineMath(`X\\sim B(${n},${p})`)}의 평균을 구하세요.`, round4(n * p), `${inlineMath(`E(X)=np=${n}\\times${p}=${round4(n * p)}`)}입니다.`, "시행 횟수와 성공확률을 곱하세요.", binomialVisual({ n, p, mean: n * p })),
        sa(`${inlineMath(`X\\sim B(${n},${p})`)}의 분산을 구하세요.`, round4(n * p * (1 - p)), `${inlineMath(`V(X)=np(1-p)=${round4(n * p * (1 - p))}`)}입니다.`, "q=1-p를 먼저 구하세요.", binomialVisual({ n, p, mean: n * p })),
        sa(`${inlineMath(`X\\sim B(${standardDeviationN},0.5)`)}의 표준편차를 구하세요.`, standardDeviation, `${inlineMath(`\\sqrt{${standardDeviationN}\\cdot0.5\\cdot0.5}=${standardDeviation}`)}입니다.`, "분산 npq의 양의 제곱근입니다.", binomialVisual({ n: standardDeviationN, p: 0.5, mean: standardDeviationN / 2 })),
        mc("B(10,0.5)의 분포에서 중심에 가장 가까운 값은?", ["0", "2", "5", "10"], 2, "평균 np=5이고 대칭분포의 중심도 5입니다.", "p=0.5이면 분포가 중앙을 기준으로 대칭입니다.", binomialVisual({ n: 10, p: 0.5, mean: 5 })),
        mc("B(6,0.5)에서 P(X=2)와 P(X=4)의 관계는?", ["P(X=2)>P(X=4)", "같다", "P(X=2)<P(X=4)", "둘 다 0"], 1, "p=0.5인 분포는 n/2를 중심으로 대칭입니다.", "2와 4는 중심 3에서 같은 거리입니다.", binomialVisual({ n: 6, p: 0.5, focusValues: [2, 4] })),
        sa(`불량률 ${defectP}인 제품 ${defectN}개 중 정확히 ${defectK}개가 불량일 확률을 소수로 구하세요.`, binomialProbability(defectN, defectP, defectK), `${inlineMath(`\\binom{${defectN}}{${defectK}}${defectP}^{${defectK}}(1-${defectP})^{${defectN - defectK}}=${binomialProbability(defectN, defectP, defectK)}`)}입니다.`, `불량품 ${defectK}개의 위치를 고르는 경우의 수를 포함하세요.`, binomialVisual({ n: defectN, p: defectP, focus: defectK })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-04",
    unitId: "statistics",
    key: "probstat-normal-binomial",
    title: "정규분포와 이항분포의 관계",
    labels: [
      "정규분포 대칭", "표준화", "구간확률", "평균 이동", "표준편차 변화",
      "이항분포 근사", "연속성 수정", "68% 규칙", "꼬리확률", "종합 정규분포",
    ],
    buildProblems() {
      const mean = randomInteger(5, 20) * 5;
      const sd = randomInteger(2, 10);
      const z = [0.5, 1, 1.5, 2][
        randomInteger(0, 3)
      ];
      const focus = round4(mean + z * sd);
      const intervalZ = [0.5, 1, 1.5][
        randomInteger(0, 2)
      ];
      const binomialN =
        randomInteger(5, 20) * 10;
      const binomialP =
        [0.2, 0.3, 0.4, 0.5, 0.6, 0.7][
          randomInteger(0, 5)
        ];
      const binomialMean =
        binomialN * binomialP;
      const binomialSd = Math.sqrt(
        binomialN *
          binomialP *
          (1 - binomialP)
      );
      const continuityBoundary =
        randomInteger(
          Math.max(0, Math.floor(binomialMean - binomialSd)),
          Math.ceil(binomialMean + binomialSd)
        );
      const tailZ = [0.5, 1, 1.5, 2][
        randomInteger(0, 3)
      ];
      const intervalMean =
        randomInteger(3, 15) * 5;
      const intervalSd = randomInteger(2, 8);
      return [
        sa(`정규분포 ${inlineMath(`N(${mean},${sd ** 2})`)}에서 평균보다 작은 값이 나올 확률은?`, 0.5, "정규분포는 평균을 중심으로 대칭이므로 왼쪽 넓이는 0.5입니다.", "평균을 지나는 세로선이 넓이를 반으로 나눕니다.", normalVisual({ mean, sd, shadeTo: mean })),
        sa(`${inlineMath(`X\\sim N(${mean},${sd ** 2})`)}에서 X=${focus}의 표준점수 z는?`, z, `표준편차는 ${sd}이므로 z=(${focus}-${mean})/${sd}=${z}입니다.`, "두 번째 모수는 분산이므로 먼저 제곱근을 구하세요.", normalVisual({ mean, sd, focus })),
        sa(`표준정규분포에서 P(-${intervalZ}≤Z≤${intervalZ})를 소수로 구하세요.`, round4(normalCdf(intervalZ) - normalCdf(-intervalZ)), `표준정규 누적확률의 차는 ${round4(normalCdf(intervalZ) - normalCdf(-intervalZ))}입니다.`, "양쪽 경계의 누적확률 차를 구하세요.", normalVisual({ mean: 0, sd: 1, shadeFrom: -intervalZ, shadeTo: intervalZ })),
        mc("정규분포의 평균이 커지면 그래프는 어떻게 변하는가?", ["오른쪽으로 이동", "폭만 넓어짐", "왼쪽으로 이동", "높이만 2배"], 0, "평균은 곡선의 중심 위치를 결정합니다.", "모양은 그대로이고 중심 좌표만 바뀝니다.", normalVisual({ mean: 2, sd: 1 })),
        mc("평균이 같고 표준편차가 커지면 정규곡선은?", ["더 좁고 높아진다", "더 넓고 낮아진다", "오른쪽 이동", "변하지 않는다"], 1, "전체 넓이는 1이므로 폭이 넓어지면 높이는 낮아집니다.", "표준편차는 자료가 중심에서 퍼진 정도입니다.", normalVisual({ mean: 0, sd: 2 })),
        sa(`${inlineMath(`X\\sim B(${binomialN},${binomialP})`)}를 정규근사할 때 근사 정규분포의 평균은?`, binomialMean, `np=${binomialN}×${binomialP}=${binomialMean}입니다.`, "이항분포와 근사 정규분포는 평균을 맞춥니다.", normalVisual({ mean: binomialMean, sd: binomialSd, binomial: true })),
        sa(`${inlineMath(`X\\sim B(${binomialN},${binomialP})`)}를 정규근사할 때 P(X≤${continuityBoundary})는 연속성 수정 후 어떤 경계까지 보는가?`, continuityBoundary + 0.5, `이산값 ${continuityBoundary}까지 포함하므로 연속 구간은 ${continuityBoundary + 0.5}까지입니다.`, "막대 하나의 폭을 1로 보고 오른쪽 경계를 사용하세요.", normalVisual({ mean: binomialMean, sd: binomialSd, shadeTo: continuityBoundary + 0.5, binomial: true })),
        sa(`정규분포 ${inlineMath(`N(${mean},${sd ** 2})`)}에서 평균±1표준편차 안에 들어갈 확률을 근사값으로 구하세요.`, round4(normalCdf(1) - normalCdf(-1)), "약 0.6827, 즉 68.27%입니다.", "분포의 평균과 표준편차가 달라도 표준화하면 -1부터 1까지입니다.", normalVisual({ mean, sd, shadeFrom: mean - sd, shadeTo: mean + sd })),
        sa(`표준정규분포에서 P(Z≥${tailZ})를 소수로 구하세요.`, round4(1 - normalCdf(tailZ)), `1-Φ(${tailZ})≈${round4(1 - normalCdf(tailZ))}입니다.`, "오른쪽 꼬리는 전체 1에서 왼쪽 누적확률을 뺍니다.", normalVisual({ mean: 0, sd: 1, shadeFrom: tailZ })),
        sa(`${inlineMath(`X\\sim N(${intervalMean},${intervalSd ** 2})`)}일 때 P(${intervalMean - intervalSd}≤X≤${intervalMean + intervalSd})를 소수로 구하세요.`, round4(normalCdf(1) - normalCdf(-1)), `표준편차는 ${intervalSd}이므로 두 경계의 z는 -1,1이고 확률은 약 0.6827입니다.`, `분산 ${intervalSd ** 2}의 제곱근이 표준편차 ${intervalSd}입니다.`, normalVisual({ mean: intervalMean, sd: intervalSd, shadeFrom: intervalMean - intervalSd, shadeTo: intervalMean + intervalSd })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-05",
    unitId: "statistics",
    key: "probstat-population-sampling",
    title: "모집단과 표본추출",
    labels: [
      "모집단", "표본", "전수조사", "임의추출", "편향 판정",
      "층화추출", "군집추출", "표본 크기", "복원추출", "종합 표본설계",
    ],
    buildProblems() {
      return [
        mc("전국 고등학생의 평균 수면시간을 조사할 때 모집단은?", ["조사한 100명", "전국의 모든 고등학생", "조사원", "수면시간 평균"], 1, "알고 싶은 대상 전체가 모집단입니다.", "연구 결과를 적용하려는 전체 대상을 찾으세요.", samplingVisual({ population: 100, sample: 12 })),
        mc("전국 고등학생 중 무작위로 고른 500명은?", ["모수", "표본", "모집단", "확률변수"], 1, "모집단에서 실제 조사한 일부가 표본입니다.", "전체에서 선택된 일부 집단입니다.", samplingVisual({ population: 100, sample: 20 })),
        mc("모든 구성원을 조사하는 방법은?", ["표본조사", "전수조사", "층화추출", "계통추출"], 1, "모집단 전체를 빠짐없이 조사하면 전수조사입니다.", "일부가 아닌 전체를 조사합니다.", samplingVisual({ population: 60, sample: 60 })),
        mc("단순임의추출의 핵심 조건은?", ["편한 사람만 선택", "각 표본이 같은 선택 가능성", "항상 10명 선택", "남학생만 선택"], 1, "각 가능한 표본이 같은 기회를 갖도록 무작위화합니다.", "선택 가능성의 공정성을 확인하세요.", samplingVisual({ population: 80, sample: 10, random: true })),
        mc("학교 급식 만족도를 조사하면서 급식실 앞의 만족한 학생만 조사하면?", ["대표성이 높다", "선택 편향이 생길 수 있다", "전수조사다", "표본오차가 0이다"], 1, "응답자가 모집단을 고르게 대표하지 못할 수 있습니다.", "누가 조사에서 빠졌는지 생각하세요.", samplingVisual({ population: 80, sample: 10, biased: true })),
        mc("학년별 비율에 맞춰 각 학년에서 무작위로 뽑는 방법은?", ["층화추출", "군집추출", "편의추출", "전수조사"], 0, "모집단을 중요한 특성별 층으로 나눈 뒤 각 층에서 뽑습니다.", "각 학년을 하나의 층으로 봅니다.", samplingVisual({ strata: [30, 30, 40], sample: 15 })),
        mc("무작위로 몇 개 학급을 골라 그 학급 학생 전원을 조사하는 방법은?", ["층화추출", "군집추출", "계통추출", "복원추출"], 1, "자연스럽게 묶인 집단을 골라 집단 전체를 조사하는 군집추출입니다.", "개인이 아니라 학급 단위로 선택합니다.", samplingVisual({ clusters: 8, selectedClusters: 2 })),
        mc("일반적으로 같은 조건에서 표본 크기가 커지면?", ["표본오차가 줄어드는 경향", "편향이 자동으로 사라짐", "모집단이 작아짐", "모수가 변함"], 0, "표본 변동은 줄어들지만 잘못된 추출 방식의 편향이 자동으로 없어지는 것은 아닙니다.", "무작위 오차와 체계적 편향을 구분하세요.", samplingVisual({ population: 100, sample: 35 })),
        mc("뽑은 대상을 다시 모집단에 넣고 다음 대상을 뽑는 것은?", ["비복원추출", "복원추출", "층화추출", "군집추출"], 1, "매번 뽑은 대상을 되돌려 모집단 구성이 유지됩니다.", "다음 추출 전에 원래 상태로 돌아갑니다.", samplingVisual({ replacement: true })),
        mc("성별과 학년 비율을 모두 반영하고 싶을 때 가장 적절한 방법은?", ["편의추출", "관련 층을 만든 층화추출", "한 학급만 조사", "자원자만 조사"], 1, "중요한 하위집단을 층으로 나누고 비율에 맞게 무작위 추출합니다.", "대표해야 할 특성을 추출 설계에 포함하세요.", samplingVisual({ strata: [25, 25, 25, 25], sample: 20 })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-06",
    unitId: "statistics",
    key: "probstat-sample-statistics",
    title: "표본통계량과 모수의 관계",
    labels: [
      "모수 판정", "통계량 판정", "표본평균의 평균", "표본평균 표준편차",
      "표본 크기 효과", "불편성", "표집분포", "표본비율", "표준오차", "종합 관계",
    ],
    buildProblems() {
      const populationMean =
        randomInteger(4, 20) * 5;
      const sampleRoot = randomInteger(3, 10);
      const sampleSize = sampleRoot ** 2;
      const standardError = randomInteger(1, 5);
      const populationSd =
        sampleRoot * standardError;
      const populationProportion =
        randomInteger(2, 8) / 10;
      const proportionRoot =
        randomInteger(5, 20);
      const proportionSampleSize =
        proportionRoot ** 2;
      const targetRoot = randomInteger(3, 10);
      const targetStandardError =
        randomInteger(1, 4);
      const targetPopulationSd =
        targetRoot * targetStandardError;
      return [
        mc("모집단 전체의 평균 μ는?", ["모수", "통계량", "표본", "사건"], 0, "모집단의 특성을 나타내는 고정된 수이므로 모수입니다.", "모집단 전체의 값인지 표본에서 계산한 값인지 구분하세요.", samplingVisual({ populationMean: 50 })),
        mc("한 표본에서 계산한 평균 x̄는?", ["모수", "통계량", "모집단", "확률"], 1, "표본 자료로부터 계산한 값이므로 통계량입니다.", "표본이 바뀌면 값도 바뀔 수 있습니다.", samplingVisual({ sampleMeans: [48, 51, 50, 52] })),
        sa(`모평균 μ=${populationMean}일 때 표본평균 X̄의 평균 E(X̄)는?`, populationMean, "표본평균의 기대값은 모평균과 같습니다.", "표본평균은 모평균의 불편추정량입니다.", samplingVisual({ populationMean, samplingMean: populationMean })),
        sa(`모표준편차 σ=${populationSd}, 표본크기 n=${sampleSize}일 때 표본평균의 표준편차는?`, standardError, `${inlineMath(`\\sigma/\\sqrt n=${populationSd}/${sampleRoot}=${standardError}`)}입니다.`, "표본평균의 표준오차는 σ/√n입니다.", samplingVisual({ populationSd, sampleSize, standardError })),
        mc("표본 크기를 4배로 하면 표본평균의 표준오차는?", ["4배", "2배", "1/2배", "변하지 않음"], 2, "표준오차는 1/√n에 비례하므로 4배 표본에서 절반입니다.", "제곱근 관계를 사용하세요.", samplingVisual({ sampleSizes: [25, 100] })),
        mc("E(X̄)=μ가 뜻하는 것은?", ["항상 X̄=μ", "표본평균이 모평균의 불편추정량", "표본오차가 0", "모집단이 정규분포"], 1, "여러 표본평균의 장기적인 중심이 모평균이라는 뜻입니다.", "한 번의 표본값과 표집분포의 평균을 구분하세요.", samplingVisual({ populationMean: 50, sampleMeans: [46, 49, 51, 54] })),
        mc("같은 크기의 표본을 반복해서 뽑아 얻은 X̄들의 분포는?", ["모집단", "표집분포", "조건부확률", "이항계수"], 1, "통계량이 반복 표집에서 만드는 확률분포입니다.", "분포를 이루는 값이 원자료인지 통계량인지 보세요.", samplingVisual({ sampleMeans: [47, 49, 50, 50, 51, 53] })),
        sa(`모비율 p=${populationProportion}일 때 표본비율 p̂의 평균은?`, populationProportion, `E(p̂)=p=${populationProportion}입니다.`, "표본비율도 모비율의 불편추정량입니다.", samplingVisual({ populationProportion, samplingMean: populationProportion })),
        sa(`p=${populationProportion}, n=${proportionSampleSize}일 때 표본비율의 표준편차는?`, round4(Math.sqrt(populationProportion * (1 - populationProportion) / proportionSampleSize)), `${inlineMath(`\\sqrt{${populationProportion}\\cdot${round4(1 - populationProportion)}/${proportionSampleSize}}\\approx${round4(Math.sqrt(populationProportion * (1 - populationProportion) / proportionSampleSize))}`)}입니다.`, "표본비율의 표준오차 공식 √(p(1-p)/n)을 사용하세요.", samplingVisual({ populationProportion, sampleSize: proportionSampleSize, standardError: Math.sqrt(populationProportion * (1 - populationProportion) / proportionSampleSize) })),
        sa(`모표준편차가 ${targetPopulationSd}일 때 표본평균의 표준오차를 ${targetStandardError}로 만들기 위한 표본크기 n은?`, targetRoot ** 2, `${inlineMath(`${targetPopulationSd}/\\sqrt n=${targetStandardError}`)}에서 √n=${targetRoot}, n=${targetRoot ** 2}입니다.`, "표준오차 식을 n에 대해 푸세요.", samplingVisual({ populationSd: targetPopulationSd, sampleSize: targetRoot ** 2, standardError: targetStandardError })),
      ];
    },
  },
  {
    conceptId: "probability-statistics-03-07",
    unitId: "statistics",
    key: "probstat-estimation",
    title: "모평균과 모비율의 추정",
    labels: [
      "모평균 신뢰구간", "오차한계", "표본 크기 효과", "신뢰수준 효과", "구간 해석",
      "모비율 신뢰구간", "표준오차", "하한과 상한", "필요 표본크기", "종합 추정",
    ],
    buildProblems() {
      const meanCenter =
        randomInteger(5, 20) * 5;
      const meanRoot = randomInteger(5, 12);
      const meanSampleSize = meanRoot ** 2;
      const meanSd = randomInteger(5, 15);
      const meanMargin = round4(
        1.96 * meanSd / meanRoot
      );
      const intervalCenter =
        randomInteger(5, 25) * 4;
      const intervalMargin =
        randomInteger(1, 8);
      const estimateProportion =
        randomInteger(2, 8) / 10;
      const estimateRoot =
        randomInteger(10, 25);
      const estimateSampleSize =
        estimateRoot ** 2;
      const proportionStandardError =
        Math.sqrt(
          estimateProportion *
            (1 - estimateProportion) /
            estimateSampleSize
        );
      const lowerCenter =
        randomInteger(10, 30) * 3;
      const lowerMargin = randomInteger(1, 8);
      const requiredRoot =
        randomInteger(4, 12);
      const requiredMargin =
        randomInteger(1, 5);
      const requiredSd =
        (requiredRoot * requiredMargin) / 2;
      const upperCenter =
        randomInteger(8, 30) * 3;
      const upperRoot =
        randomInteger(4, 12);
      const upperSd = randomInteger(2, 10);
      const upperMargin =
        round4(2 * upperSd / upperRoot);
      return [
        sa(`x̄=${meanCenter}, σ=${meanSd}, n=${meanSampleSize}일 때 95% 모평균 신뢰구간의 오차한계(1.96 사용)는?`, meanMargin, `${inlineMath(`1.96\\cdot${meanSd}/\\sqrt{${meanSampleSize}}=${meanMargin}`)}입니다.`, "임계값×표준오차를 계산하세요.", confidenceVisual({ center: meanCenter, margin: meanMargin })),
        sa(`추정값이 ${intervalCenter}이고 오차한계가 ${intervalMargin}일 때 신뢰구간의 길이는?`, 2 * intervalMargin, `하한 ${intervalCenter - intervalMargin}, 상한 ${intervalCenter + intervalMargin}이므로 전체 길이는 오차한계의 두 배인 ${2 * intervalMargin}입니다.`, "오차한계는 중심에서 한쪽 끝까지의 거리입니다.", confidenceVisual({ center: intervalCenter, margin: intervalMargin })),
        mc("다른 조건이 같을 때 표본 크기가 커지면 신뢰구간은?", ["넓어진다", "좁아진다", "중심이 0이 된다", "항상 같다"], 1, "표준오차가 1/√n에 따라 작아져 구간이 좁아집니다.", "표본 크기와 표준오차의 관계를 보세요.", confidenceVisual({ intervals: [[50, 4], [50, 2]] })),
        mc("다른 조건이 같을 때 신뢰수준을 높이면 신뢰구간은?", ["좁아진다", "넓어진다", "사라진다", "중심만 이동"], 1, "더 높은 포착률을 원하면 더 넓은 구간이 필요합니다.", "신뢰수준과 정밀도 사이의 교환관계입니다.", confidenceVisual({ intervals: [[50, 2], [50, 3]] })),
        mc("95% 신뢰구간 [48,52]의 올바른 해석에 가장 가까운 것은?", ["모평균이 반드시 50이다", "같은 절차를 반복하면 약 95%의 구간이 모평균을 포함한다", "자료의 95%가 48~52다", "표본평균이 95% 확률로 변한다"], 1, "신뢰수준은 반복되는 구간 생성 절차의 장기적 포함률입니다.", "모수는 고정되고 구간이 표본마다 달라집니다.", confidenceVisual({ center: 50, margin: 2 })),
        sa(`표본비율 p̂=${estimateProportion}, n=${estimateSampleSize}일 때 95% 모비율 신뢰구간의 오차한계를 소수로 구하세요. (1.96 사용)`, round4(1.96 * proportionStandardError), `${inlineMath(`1.96\\sqrt{${estimateProportion}\\cdot${round4(1 - estimateProportion)}/${estimateSampleSize}}\\approx${round4(1.96 * proportionStandardError)}`)}입니다.`, "표본비율 표준오차에 1.96을 곱하세요.", confidenceVisual({ center: estimateProportion, margin: 1.96 * proportionStandardError })),
        sa(`p̂=${estimateProportion}, n=${estimateSampleSize}일 때 표본비율의 표준오차를 구하세요.`, round4(proportionStandardError), `${inlineMath(`\\sqrt{${estimateProportion}\\cdot${round4(1 - estimateProportion)}/${estimateSampleSize}}\\approx${round4(proportionStandardError)}`)}입니다.`, "√(p̂(1-p̂)/n)을 사용하세요.", confidenceVisual({ center: estimateProportion, margin: proportionStandardError })),
        sa(`중심이 ${lowerCenter}이고 오차한계가 ${lowerMargin}인 신뢰구간의 하한은?`, lowerCenter - lowerMargin, `${lowerCenter}-${lowerMargin}=${lowerCenter - lowerMargin}입니다.`, "중심에서 오차한계를 빼세요.", confidenceVisual({ center: lowerCenter, margin: lowerMargin })),
        sa(`σ=${requiredSd}, 오차한계 ${requiredMargin}, 95% 임계값을 2로 근사할 때 필요한 표본크기 n은?`, requiredRoot ** 2, `${inlineMath(`2\\cdot${requiredSd}/\\sqrt n=${requiredMargin}`)}에서 √n=${requiredRoot}, n=${requiredRoot ** 2}입니다.`, "오차한계 공식을 n에 대해 정리하세요.", confidenceVisual({ center: 0, margin: requiredMargin, sampleSize: requiredRoot ** 2 })),
        sa(`x̄=${upperCenter}, σ=${upperSd}, n=${upperRoot ** 2}일 때 95% 모평균 신뢰구간의 상한을 구하세요. (임계값 2 사용)`, round4(upperCenter + upperMargin), `오차한계는 ${inlineMath(`2\\cdot${upperSd}/${upperRoot}=${upperMargin}`)}이므로 상한은 ${round4(upperCenter + upperMargin)}입니다.`, "먼저 표준오차, 다음 오차한계, 마지막 상한 순서입니다.", confidenceVisual({ center: upperCenter, margin: upperMargin })),
      ];
    },
  },
];

const generators = definitions.map((definition) => ({
  key: definition.key,
  courseId: "probability-statistics",
  unitId: definition.unitId,
  conceptId: definition.conceptId,
  requiredDistinctTypes: 5,
  problemTypes: createProblemTypes({
    conceptId: definition.conceptId,
    conceptTitle: definition.title,
    labels: definition.labels,
    buildProblems: definition.buildProblems,
  }),
  isCorrectAnswer,
}));

const generatorMap = new Map(
  generators.map((generator) => [
    [
      generator.courseId,
      generator.unitId,
      generator.conceptId,
    ].join("/"),
    generator,
  ])
);

module.exports = {
  definitions,
  generators,
  generatorMap,
};
