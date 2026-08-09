/*
 * GOAT Arena 1대1 경기 전용 문제 유형 원본.
 *
 * 2016~2026 평가원 6·9월 모의평가의 13·14·20·21·27·28·29·30번
 * 사고 구조를 추상화한 Arena 독립 생성기다. 기출 문장과 수치를 복사하지
 * 않으며, 배치고사·평가센터 런타임을 import하지 않는다.
 */
const {
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
} = require("./arenaOneOnOneTypeSkeletons");

const ADVANCED_REFERENCE_FAMILIES = {
  "function-condition-graph": {
    label: "함수 조건과 그래프 추론",
    placementEligible: true,
    sourceFolder: "01_함수_조건과_그래프_추론",
  },
  "integral-defined-area": {
    label: "적분으로 정의된 함수와 넓이",
    placementEligible: true,
    sourceFolder: "02_적분으로_정의된_함수와_넓이",
  },
  "derivative-limit-motion": {
    label: "미분·극한·변화율·운동",
    placementEligible: true,
    sourceFolder: "03_미분_극한_변화율_운동",
  },
  "sequence-recurrence": {
    label: "수열·점화식·귀납적 구조",
    placementEligible: true,
    sourceFolder: "04_수열_점화식_귀납적_구조",
  },
  "probability-counting": {
    label: "확률·경우의 수·확률분포",
    placementEligible: true,
    sourceFolder: "05_확률_경우의수_확률분포",
  },
  "exponent-log-trig": {
    label: "지수·로그·삼각함수·주기성",
    placementEligible: true,
    sourceFolder: "06_지수로그_삼각함수_주기성",
  },
  geometry: {
    label: "도형·좌표·공간 기하",
    placementEligible: false,
    sourceFolder: "07_도형_좌표_공간_기하",
    exclusionReason:
      "현재 배치고사의 대수·미적분Ⅰ·확률과 통계 학습 범위를 벗어납니다.",
  },
  "compound-case-analysis": {
    label: "복합 조건과 경우 분기",
    placementEligible: true,
    sourceFolder: "08_복합조건_경우분기_기타",
  },
};

function randomInteger(min, max) {
  return (
    Math.floor(
      Math.random() *
        (max - min + 1)
    ) + min
  );
}

function pick(values) {
  return values[
    randomInteger(
      0,
      values.length - 1
    )
  ];
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b) {
    [a, b] = [b, a % b];
  }

  return a || 1;
}

function fraction(
  numerator,
  denominator
) {
  const sign =
    denominator < 0 ? -1 : 1;
  const divisor = gcd(
    numerator,
    denominator
  );
  const normalizedNumerator =
    (
      sign * numerator
    ) / divisor;
  const normalizedDenominator =
    Math.abs(denominator) /
    divisor;

  return normalizedDenominator === 1
    ? String(normalizedNumerator)
    : `${normalizedNumerator}/${normalizedDenominator}`;
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

function choose(n, r) {
  if (r < 0 || r > n) {
    return 0;
  }

  return Math.round(
    factorial(n) /
      (
        factorial(r) *
        factorial(n - r)
      )
  );
}

function shortAnswer(
  prompt,
  answer,
  solution
) {
  return {
    prompt,
    inputMode: "short-answer",
    choices: [],
    answer: String(answer),
    solution,
  };
}

function polynomialIntegral(
  coefficients,
  lower,
  upper
) {
  const at = (x) =>
    coefficients.reduce(
      (sum, coefficient, power) =>
        sum +
        (
          coefficient *
          x ** (power + 1)
        ) /
          (power + 1),
      0
    );

  return at(upper) - at(lower);
}

function uniquePermutations(
  counts
) {
  const symbols = Object.keys(counts);
  const length = Object.values(
    counts
  ).reduce(
    (sum, count) =>
      sum + count,
    0
  );
  const current = [];
  const results = [];

  function walk() {
    if (
      current.length === length
    ) {
      results.push(
        current.join("")
      );
      return;
    }

    for (const symbol of symbols) {
      if (counts[symbol] <= 0) {
        continue;
      }

      counts[symbol] -= 1;
      current.push(symbol);
      walk();
      current.pop();
      counts[symbol] += 1;
    }
  }

  walk();
  return results;
}

function allMappings(size) {
  const values = Array(size).fill(
    1
  );
  const mappings = [];

  function walk(index) {
    if (index === size) {
      mappings.push([...values]);
      return;
    }

    for (
      let value = 1;
      value <= size;
      value += 1
    ) {
      values[index] = value;
      walk(index + 1);
    }
  }

  walk(0);
  return mappings;
}

function fixedSizeSubsets(
  size,
  selectedCount
) {
  const results = [];

  function walk(
    next,
    selected
  ) {
    if (
      selected.length ===
      selectedCount
    ) {
      results.push([
        ...selected,
      ]);
      return;
    }

    for (
      let value = next;
      value <= size;
      value += 1
    ) {
      selected.push(value);
      walk(
        value + 1,
        selected
      );
      selected.pop();
    }
  }

  walk(1, []);
  return results;
}

function mappingsToValues(
  length,
  maximumValue
) {
  const values =
    Array(length).fill(1);
  const mappings = [];

  function walk(index) {
    if (index === length) {
      mappings.push([...values]);
      return;
    }

    for (
      let value = 1;
      value <= maximumValue;
      value += 1
    ) {
      values[index] = value;
      walk(index + 1);
    }
  }

  walk(0);
  return mappings;
}

function divisorPreservingCounts(
  size,
  event
) {
  let total = 0;
  let favorable = 0;

  for (const mapping of
    allMappings(size)) {
    let valid = true;

    for (
      let left = 1;
      left <= size && valid;
      left += 1
    ) {
      for (
        let right = 1;
        right <= size;
        right += 1
      ) {
        if (
          right % left === 0 &&
          mapping[right - 1] %
            mapping[left - 1] !==
            0
        ) {
          valid = false;
          break;
        }
      }
    }

    if (!valid) continue;
    total += 1;

    if (event(mapping[size - 1])) {
      favorable += 1;
    }
  }

  return {
    total,
    favorable,
  };
}

function traceRecurrence({
  start,
  steps,
  oddAdd,
}) {
  let value = start;
  const trace = [value];

  for (
    let index = 1;
    index < steps;
    index += 1
  ) {
    value =
      value % 2 === 0
        ? value / 2 + index
        : value + oddAdd + index;
    trace.push(value);
  }

  return trace;
}

function generateAbsoluteGraphArea() {
  const setting = pick([
    {
      a: 4,
      insideRoot: 1,
      outsideRight: 6,
    },
    {
      a: 6,
      insideRoot: 0,
      outsideRight: 9,
    },
    {
      a: 9,
      insideRoot: 2,
      outsideRight: 13,
    },
    {
      a: 9,
      insideRoot: 5,
      outsideRight: 12,
    },
  ]);
  const { a } = setting;
  const m = setting.insideRoot;
  const t =
    a ** 2 -
    m * (m + 1);
  const outsideLeft =
    1 - setting.outsideRight;
  const roots = [
    outsideLeft,
    -m - 1,
    m,
    setting.outsideRight,
  ];
  const innerIntegral =
    polynomialIntegral(
      [
        a ** 2 - t,
        -1,
        -1,
      ],
      m,
      a
    );
  const outerIntegral =
    polynomialIntegral(
      [
        -(a ** 2 + t),
        -1,
        1,
      ],
      a,
      setting.outsideRight
    );
  const scaledArea = Math.round(
    -6 *
      (
        innerIntegral +
        outerIntegral
      )
  );

  return {
    problem: shortAnswer(
      `두 함수 $f(x)=|x^2-${a ** 2}|-2x$, $g(x)=-x+${t}$의 그래프가 만나는 네 점의 $x$좌표를 작은 수부터 $x_1,x_2,x_3,x_4$라 하자. 닫힌구간 $[x_3,x_4]$에서 두 그래프로 둘러싸인 부분의 넓이를 $S$라 할 때, $6S$의 값을 구하시오.`,
      scaledArea,
      `교점 조건은 $|x^2-${a ** 2}|-x-${t}=0$입니다. $|x|<${a}$와 $|x|\\ge ${a}$로 나누어 풀면 교점은 ${roots.join(", ")}이고, $[${m},${setting.outsideRight}]$를 $x=${a}$에서 나누어 두 함수의 차를 적분하면 $6S=${scaledArea}$입니다.`
    ),
    parameters: {
      a,
      t,
      roots,
      scaledArea,
    },
    operationCount: 18,
    maxInteger: Math.max(
      t,
      scaledArea
    ),
  };
}

function validateAbsoluteGraphArea(
  generated
) {
  const {
    a,
    t,
    roots,
    scaledArea,
  } = generated.parameters;
  const evaluateDifference = (x) =>
    Math.abs(x ** 2 - a ** 2) -
    x -
    t;
  const rootsValid =
    new Set(roots).size === 4 &&
    roots.every(
      (root) =>
        Math.abs(
          evaluateDifference(root)
        ) < 1e-9
    ) &&
    roots.every(
      (root, index) =>
        index === 0 ||
        roots[index - 1] < root
    );

  return {
    solvable:
      rootsValid &&
      Number.isInteger(
        scaledArea
      ) &&
      scaledArea > 0,
    uniqueAnswer: true,
    calculatorFree:
      scaledArea <= 3000,
    solvedAnswer:
      String(scaledArea),
  };
}

function generateTangentArea() {
  const a = pick([1, 2, 3]);
  const constant =
    randomInteger(-5, 5);
  const scaledArea =
    27 * a ** 4;

  return {
    problem: shortAnswer(
      `삼차함수 $f(x)$가 $f'(x)=3(x-${a})(x+${a})$, $f(0)=${constant}$를 만족한다. 곡선 $y=f(x)$ 위의 점 $x=${a}$에서 그은 접선과 곡선이 $x=-${2 * a}$부터 $x=${a}$까지 둘러싸는 넓이를 $S$라 할 때, $4S$의 값을 구하시오.`,
      scaledArea,
      `먼저 $f(x)=x^3-${3 * a ** 2}x+${constant}$를 얻습니다. $x=${a}$에서의 접선은 수평선이고, 곡선과 접선의 차는 $(x-${a})^2(x+${2 * a})$입니다. 이를 $-${2 * a}$부터 ${a}까지 적분하면 $S=\\dfrac{27}{4}\\times ${a}^4$이므로 $4S=${scaledArea}$입니다.`
    ),
    parameters: {
      a,
      constant,
      scaledArea,
    },
    operationCount: 14,
    maxInteger: scaledArea,
  };
}

function validateTangentArea(
  generated
) {
  const {
    a,
    scaledArea,
  } = generated.parameters;
  const recalculated = Math.round(
    4 *
      polynomialIntegral(
        [
          2 * a ** 3,
          -3 * a ** 2,
          0,
          1,
        ],
        -2 * a,
        a
      )
  );

  return {
    solvable:
      recalculated ===
        scaledArea &&
      scaledArea > 0,
    uniqueAnswer: true,
    calculatorFree:
      scaledArea <= 2200,
    solvedAnswer:
      String(recalculated),
  };
}

function generateRepeatedArrangement() {
  const setting = pick([
    {
      A: 3,
      B: 2,
      C: 2,
    },
    {
      A: 2,
      B: 3,
      C: 2,
    },
    {
      A: 3,
      B: 3,
      C: 2,
    },
    {
      A: 3,
      B: 3,
      C: 1,
    },
  ]);
  const arrangements =
    uniquePermutations({
      ...setting,
    });
  const valid =
    arrangements.filter(
      (value) =>
        !value.includes("AA") &&
        value[0] !==
          value[value.length - 1]
    );
  const answer = valid.length;

  return {
    problem: shortAnswer(
      `서로 같은 A 카드 ${setting.A}장, 서로 같은 B 카드 ${setting.B}장, 서로 같은 C 카드 ${setting.C}장을 모두 일렬로 놓는다. A 카드끼리는 이웃하지 않고 양 끝의 문자가 서로 다른 배열의 수를 구하시오.`,
      answer,
      `먼저 A가 아닌 ${setting.B + setting.C}장을 배열한 뒤 생기는 틈에 A를 배치하고, 양 끝이 같은 경우를 제외합니다. 중복을 고려해 경우를 나누면 조건을 만족하는 배열은 ${answer}가지입니다.`
    ),
    parameters: {
      counts: setting,
      answer,
    },
    operationCount: 16,
    maxInteger: answer,
  };
}

function validateRepeatedArrangement(
  generated
) {
  const arrangements =
    uniquePermutations({
      ...generated.parameters
        .counts,
    });
  const answer =
    arrangements.filter(
      (value) =>
        !value.includes("AA") &&
        value[0] !==
          value[value.length - 1]
    ).length;

  return {
    solvable: answer > 0,
    uniqueAnswer: true,
    calculatorFree:
      answer <= 500,
    solvedAnswer: String(answer),
  };
}

function conditionalSelectionCounts(
  setting
) {
  const total =
    choose(
      setting.special +
        setting.regular,
      setting.draw
    ) -
    choose(
      setting.regular,
      setting.draw
    );
  const favorable =
    choose(
      setting.special,
      setting.targetSpecial
    ) *
    choose(
      setting.regular,
      setting.draw -
        setting.targetSpecial
    );

  return {
    total,
    favorable,
  };
}

function generateConditionalSelection() {
  const setting = pick([
    {
      special: 4,
      regular: 5,
      draw: 3,
      targetSpecial: 2,
    },
    {
      special: 5,
      regular: 5,
      draw: 4,
      targetSpecial: 2,
    },
    {
      special: 4,
      regular: 6,
      draw: 4,
      targetSpecial: 2,
    },
  ]);
  const counts =
    conditionalSelectionCounts(
      setting
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    problem: shortAnswer(
      `서로 다른 특별 카드 ${setting.special}장과 일반 카드 ${setting.regular}장 중 ${setting.draw}장을 동시에 뽑는다. 특별 카드가 한 장 이상 뽑혔다는 조건에서 특별 카드가 정확히 ${setting.targetSpecial}장 뽑혔을 확률을 구하시오.`,
      answer,
      `조건을 만족하는 전체 경우는 $\\binom{${setting.special + setting.regular}}{${setting.draw}}-\\binom{${setting.regular}}{${setting.draw}}=${counts.total}$가지입니다. 특별 카드가 정확히 ${setting.targetSpecial}장인 경우는 $\\binom{${setting.special}}{${setting.targetSpecial}}\\binom{${setting.regular}}{${setting.draw - setting.targetSpecial}}=${counts.favorable}$가지이므로 확률은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      counts,
      answer,
    },
    operationCount: 15,
    maxInteger:
      counts.total,
  };
}

function validateConditionalSelection(
  generated
) {
  const counts =
    conditionalSelectionCounts(
      generated.parameters
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    solvable:
      counts.favorable > 0 &&
      counts.favorable <
        counts.total,
    uniqueAnswer: true,
    calculatorFree:
      counts.total <= 300,
    solvedAnswer: answer,
  };
}

function momentConstraintValues(
  setting
) {
  let denominator = 0;
  let firstMomentNumerator = 0;
  let secondMomentNumerator = 0;

  for (
    let value = 0;
    value <= setting.maximum;
    value += 1
  ) {
    const weight =
      value + setting.shift;
    denominator += weight;
    firstMomentNumerator +=
      value * weight;
    secondMomentNumerator +=
      value ** 2 * weight;
  }

  return {
    denominator,
    firstMomentNumerator,
    secondMomentNumerator,
    scaledVariance:
      secondMomentNumerator *
        denominator -
      firstMomentNumerator ** 2,
  };
}

function generateMomentConstraint() {
  const setting = pick([
    {
      maximum: 3,
      shift: 1,
    },
    {
      maximum: 4,
      shift: 1,
    },
    {
      maximum: 3,
      shift: 2,
    },
  ]);
  const values =
    momentConstraintValues(
      setting
    );

  return {
    problem: shortAnswer(
      `확률변수 $X$가 $0,1,\\ldots,${setting.maximum}$의 값을 가지며 $P(X=k)=c(k+${setting.shift})$이다. $c=\\dfrac{1}{q}$일 때, $q^2\\operatorname{Var}(X)$의 값을 구하시오.`,
      values.scaledVariance,
      `확률의 합에서 $q=${values.denominator}$를 구합니다. 이어서 $qE(X)=${values.firstMomentNumerator}$, $qE(X^2)=${values.secondMomentNumerator}$이므로 $q^2\\operatorname{Var}(X)=${values.secondMomentNumerator}\\times${values.denominator}-${values.firstMomentNumerator}^2=${values.scaledVariance}$입니다.`
    ),
    parameters: {
      ...setting,
      ...values,
    },
    operationCount: 18,
    maxInteger:
      values.scaledVariance,
  };
}

function validateMomentConstraint(
  generated
) {
  const values =
    momentConstraintValues(
      generated.parameters
    );

  return {
    solvable:
      values.denominator > 0 &&
      values.scaledVariance >
        0,
    uniqueAnswer: true,
    calculatorFree:
      values.scaledVariance <=
      500,
    solvedAnswer: String(
      values.scaledVariance
    ),
  };
}

function generateDivisorMap() {
  const size = pick([4, 5]);
  const eventType = pick([
    "even",
    "prime",
  ]);
  const isPrime = (value) =>
    value >= 2 &&
    Array.from(
      {
        length:
          Math.floor(
            Math.sqrt(value)
          ) - 1,
      },
      (_, index) => index + 2
    ).every(
      (divisor) =>
        value % divisor !== 0
    );
  const event =
    eventType === "even"
      ? (value) =>
          value % 2 === 0
      : isPrime;
  const counts =
    divisorPreservingCounts(
      size,
      event
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    problem: shortAnswer(
      `집합 $X=\\{1,2,\\ldots,${size}\\}$에 대하여 $X$에서 $X$로의 모든 함수 중 하나를 임의로 고른다. 모든 $a,b\\in X$에 대하여 $a$가 $b$의 약수이면 $f(a)$도 $f(b)$의 약수라는 조건을 만족한다고 할 때, $f(${size})$이 ${eventType === "even" ? "짝수" : "소수"}일 확률을 구하시오.`,
      answer,
      `정의역 원소 사이의 약수 관계를 먼저 정리한 뒤, 각 함수값도 같은 포함 관계를 보존하도록 경우를 나눕니다. 조건을 만족하는 함수는 ${counts.total}개, 그중 사건을 만족하는 함수는 ${counts.favorable}개이므로 확률은 ${answer}입니다.`
    ),
    parameters: {
      size,
      eventType,
      counts,
      answer,
    },
    operationCount: 28,
    maxInteger: counts.total,
  };
}

function validateDivisorMap(
  generated
) {
  const {
    size,
    eventType,
  } = generated.parameters;
  const isPrime = (value) => {
    if (value < 2) return false;

    for (
      let divisor = 2;
      divisor ** 2 <= value;
      divisor += 1
    ) {
      if (
        value % divisor === 0
      ) {
        return false;
      }
    }

    return true;
  };
  const counts =
    divisorPreservingCounts(
      size,
      eventType === "even"
        ? (value) =>
            value % 2 === 0
        : isPrime
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    solvable:
      counts.total > 0 &&
      counts.favorable > 0 &&
      counts.favorable <
        counts.total,
    uniqueAnswer: true,
    calculatorFree:
      counts.total <= 300,
    solvedAnswer: answer,
  };
}

function subsetConditionCounts(
  setting
) {
  const subsets =
    fixedSizeSubsets(
      setting.size,
      setting.selectedCount
    );
  const valid = subsets.filter(
    (values) => {
      const noAdjacent =
        values.every(
          (value, index) =>
            index === 0 ||
            value -
              values[index - 1] >
              1
        );
      const residue =
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) %
        setting.modulus;

      return (
        noAdjacent &&
        residue ===
          setting.residue
      );
    }
  );

  return {
    total: subsets.length,
    favorable: valid.length,
  };
}

function generateSubsetCondition() {
  const setting = pick([
    {
      size: 9,
      selectedCount: 4,
      modulus: 3,
      residue: 0,
    },
    {
      size: 10,
      selectedCount: 4,
      modulus: 3,
      residue: 1,
    },
    {
      size: 10,
      selectedCount: 4,
      modulus: 4,
      residue: 2,
    },
  ]);
  const counts =
    subsetConditionCounts(
      setting
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    problem: shortAnswer(
      `집합 $\\{1,2,\\ldots,${setting.size}\\}$의 ${setting.selectedCount}개 원소로 이루어진 부분집합 중 하나를 임의로 고른다. 선택한 어떤 두 수도 연속하지 않고, 선택한 원소의 합을 ${setting.modulus}로 나눈 나머지가 ${setting.residue}일 확률을 구하시오.`,
      answer,
      `전체 경우는 $\\binom{${setting.size}}{${setting.selectedCount}}=${counts.total}$가지입니다. 연속하지 않는 조건으로 간격을 먼저 배치한 뒤 합의 나머지에 따라 경우를 나누면 조건을 모두 만족하는 경우는 ${counts.favorable}가지이므로 확률은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      counts,
      answer,
    },
    operationCount: 28,
    maxInteger:
      counts.total,
  };
}

function validateSubsetCondition(
  generated
) {
  const counts =
    subsetConditionCounts(
      generated.parameters
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    solvable:
      counts.favorable > 0 &&
      counts.favorable <
        counts.total,
    uniqueAnswer: true,
    calculatorFree:
      counts.total <= 300,
    solvedAnswer: answer,
  };
}

function surjectiveConditionCounts(
  setting
) {
  const mappings =
    mappingsToValues(
      setting.size,
      3
    );
  const surjective =
    mappings.filter(
      (mapping) =>
        new Set(mapping).size === 3
    );
  const favorable =
    surjective.filter(
      (mapping) => {
        const counts = [1, 2, 3].map(
          (value) =>
            mapping.filter(
              (mapped) =>
                mapped === value
            ).length
        );
        const evenCount =
          counts.filter(
            (count) =>
              count % 2 === 0
          ).length;

        return (
          mapping[0] <
            mapping[
              mapping.length - 1
            ] &&
          evenCount ===
            setting.evenFiberCount
        );
      }
    );

  return {
    total: surjective.length,
    favorable:
      favorable.length,
  };
}

function generateSurjectiveCondition() {
  const size = pick([6, 7]);
  const setting = {
    size,
    evenFiberCount:
      size % 2 === 0 ? 1 : 2,
  };
  const counts =
    surjectiveConditionCounts(
      setting
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    problem: shortAnswer(
      `집합 $X=\\{1,2,\\ldots,${setting.size}\\}$에서 $Y=\\{1,2,3\\}$으로의 모든 전사함수 중 하나를 임의로 고른다. $f(1)<f(${setting.size})$이고 세 집합 $f^{-1}(1),f^{-1}(2),f^{-1}(3)$ 중 원소의 개수가 짝수인 집합이 정확히 ${setting.evenFiberCount}개일 확률을 구하시오.`,
      answer,
      `먼저 포함배제로 전사함수의 수 ${counts.total}을 구합니다. 세 원상의 크기를 합이 ${setting.size}인 양의 정수로 나누고, 짝수인 크기가 정확히 ${setting.evenFiberCount}개인 경우만 남긴 뒤 양 끝 함수값 조건을 적용하면 ${counts.favorable}가지입니다. 따라서 확률은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      counts,
      answer,
    },
    operationCount: 32,
    maxInteger:
      counts.total,
  };
}

function validateSurjectiveCondition(
  generated
) {
  const counts =
    surjectiveConditionCounts(
      generated.parameters
    );
  const answer = fraction(
    counts.favorable,
    counts.total
  );

  return {
    solvable:
      counts.favorable > 0 &&
      counts.favorable <
        counts.total,
    uniqueAnswer: true,
    calculatorFree:
      counts.total <= 2000,
    solvedAnswer: answer,
  };
}

function generateTangentIntegralExtrema() {
  const setting = pick([
    {
      first: 1,
      second: 2,
    },
    {
      first: 1,
      second: 3,
    },
    {
      first: 2,
      second: 3,
    },
  ]);
  const sumSquares =
    setting.first ** 2 +
    setting.second ** 2;
  const productSquares =
    setting.first ** 2 *
    setting.second ** 2;
  const answer =
    setting.first +
    setting.second;

  return {
    problem: shortAnswer(
      `실수 전체에서 미분가능한 함수 $f(x)$의 도함수가 $f'(x)=\\dfrac{x^5}{5}-\\dfrac{${sumSquares}}{3}x^3+${productSquares}x$이다. 양수 $a$에 대하여 점 $(a,f(a))$에서의 접선을 $y=g_a(x)$라 하고, $h_a(x)=\\int_0^x\\{f(t)-g_a(t)\\}\\,dt$라 하자. $x=a$에서 $h_a(x)$가 극값을 갖게 하는 모든 양수 $a$의 합을 구하시오.`,
      answer,
      `$h_a'(x)=f(x)-g_a(x)$이고 접점에서는 $h_a'(a)=h_a''(a)=0$입니다. 극값을 가지려면 처음으로 0이 아닌 항의 차수가 홀수여야 하므로 $f''(a)=0$을 확인합니다. $f''(x)=(x^2-${setting.first ** 2})(x^2-${setting.second ** 2})$이므로 양수 해는 ${setting.first}, ${setting.second}이고 합은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      sumSquares,
      productSquares,
      answer,
    },
    operationCount: 24,
    maxInteger: productSquares,
  };
}

function validateTangentIntegralExtrema(
  generated
) {
  const {
    first,
    second,
    sumSquares,
    productSquares,
  } = generated.parameters;
  const roots = [];

  for (
    let candidate = 1;
    candidate <= 10;
    candidate += 1
  ) {
    const value =
      candidate ** 4 -
      sumSquares *
        candidate ** 2 +
      productSquares;

    if (value === 0) {
      roots.push(candidate);
    }
  }
  const answer = roots.reduce(
    (sum, value) =>
      sum + value,
    0
  );

  return {
    solvable:
      roots.length === 2 &&
      roots[0] === first &&
      roots[1] === second,
    uniqueAnswer: true,
    calculatorFree:
      productSquares <= 40,
    solvedAnswer: String(answer),
  };
}

function generateTangentAreaEquation() {
  const setting = pick([
    {
      first: 1,
      second: 2,
    },
    {
      first: 1,
      second: 3,
    },
    {
      first: 2,
      second: 3,
    },
  ]);
  const sumSquares =
    setting.first ** 2 +
    setting.second ** 2;
  const productSquares =
    setting.first ** 2 *
    setting.second ** 2;
  const answer =
    setting.first +
    setting.second;

  return {
    problem: shortAnswer(
      `함수 $f(x)=x^3-3x$에 대하여 양수 $a$에서의 접선과 곡선 $y=f(x)$가 둘러싸는 부분의 넓이를 $S(a)$라 하자. 방정식 $4S(a)-${27 * sumSquares}a^2+${27 * productSquares}=0$을 만족하는 모든 양수 $a$의 합을 구하시오.`,
      answer,
      `접선과 곡선의 차를 인수분해하면 교점은 $x=a$와 $x=-2a$이고, 구간별 부호를 확인하여 적분하면 $4S(a)=27a^4$입니다. 따라서 $(a^2-${setting.first ** 2})(a^2-${setting.second ** 2})=0$이고 양수 해의 합은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      sumSquares,
      productSquares,
      answer,
    },
    operationCount: 26,
    maxInteger:
      27 * productSquares,
  };
}

function validateTangentAreaEquation(
  generated
) {
  const {
    first,
    second,
    sumSquares,
    productSquares,
  } = generated.parameters;
  const roots = [];

  for (
    let candidate = 1;
    candidate <= 8;
    candidate += 1
  ) {
    const value =
      candidate ** 4 -
      sumSquares *
        candidate ** 2 +
      productSquares;

    if (value === 0) {
      roots.push(candidate);
    }
  }

  return {
    solvable:
      roots.length === 2 &&
      roots[0] === first &&
      roots[1] === second,
    uniqueAnswer: true,
    calculatorFree:
      27 * productSquares <=
      1100,
    solvedAnswer: String(
      roots.reduce(
        (sum, value) =>
          sum + value,
        0
      )
    ),
  };
}

function generateInverseRecurrence() {
  const setting = pick([
    {
      maximum: 24,
      steps: 5,
      oddAdd: 3,
      target: 8,
    },
    {
      maximum: 30,
      steps: 5,
      oddAdd: 1,
      target: 9,
    },
    {
      maximum: 32,
      steps: 6,
      oddAdd: 3,
      target: 10,
    },
  ]);
  const starts = [];

  for (
    let start = 1;
    start <= setting.maximum;
    start += 1
  ) {
    const trace =
      traceRecurrence({
        start,
        steps:
          setting.steps,
        oddAdd:
          setting.oddAdd,
      });

    if (
      trace[
        trace.length - 1
      ] === setting.target
    ) {
      starts.push(start);
    }
  }
  const answer = starts.reduce(
    (sum, value) =>
      sum + value,
    0
  );

  return {
    problem: shortAnswer(
      `수열 $\\{a_n\\}$을 $a_{n+1}=\\begin{cases}\\dfrac{a_n}{2}+n&(a_n\\text{이 짝수})\\\\a_n+${setting.oddAdd}+n&(a_n\\text{이 홀수})\\end{cases}$로 정의한다. $1\\le a_1\\le ${setting.maximum}$인 자연수 $a_1$ 중 $a_${setting.steps}=${setting.target}$을 만족하는 모든 $a_1$의 합을 구하시오.`,
      answer,
      `마지막 항에서 출발해 각 단계의 짝수 경우와 홀수 경우를 거꾸로 추적하고, 자연수·홀짝 조건을 동시에 확인합니다. 가능한 첫째항은 ${starts.join(", ")}이므로 합은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      starts,
      answer,
    },
    operationCount: 26,
    maxInteger: Math.max(
      setting.maximum,
      answer
    ),
  };
}

function validateInverseRecurrence(
  generated
) {
  const setting =
    generated.parameters;
  const starts = [];

  for (
    let start = 1;
    start <= setting.maximum;
    start += 1
  ) {
    const trace =
      traceRecurrence({
        start,
        steps: setting.steps,
        oddAdd:
          setting.oddAdd,
      });

    if (
      trace.at(-1) ===
      setting.target
    ) {
      starts.push(start);
    }
  }
  const answer = starts.reduce(
    (sum, value) =>
      sum + value,
    0
  );

  return {
    solvable:
      starts.length >= 1 &&
      starts.length <= 8,
    uniqueAnswer: true,
    calculatorFree:
      answer <= 300,
    solvedAnswer: String(answer),
  };
}

function generateSymmetricExponentialInvariant() {
  const setting = pick([
    { base: 2, exponentSum: 8, firstRoot: 2 },
    { base: 2, exponentSum: 9, firstRoot: 2 },
    { base: 2, exponentSum: 10, firstRoot: 3 },
    { base: 3, exponentSum: 7, firstRoot: 2 },
    { base: 3, exponentSum: 8, firstRoot: 3 },
  ]);
  const secondRoot = setting.exponentSum - setting.firstRoot;
  const coefficient =
    setting.base ** setting.firstRoot + setting.base ** secondRoot;
  const answer =
    setting.firstRoot * secondRoot +
    (secondRoot - setting.firstRoot) ** 2;

  return {
    problem: shortAnswer(
      `방정식 $${setting.base}^{2x}-${coefficient}\\cdot ${setting.base}^{x}+${setting.base ** setting.exponentSum}=0$의 서로 다른 두 실근을 $\\alpha,\\beta\\;(\\alpha<\\beta)$라 하자. $\\alpha\\beta+(\\beta-\\alpha)^2$의 값을 구하시오.`,
      answer,
      `$t=${setting.base}^x\\;(t>0)$로 놓으면 $t^2-${coefficient}t+${setting.base ** setting.exponentSum}=0$입니다. 두 근은 $${setting.base}^{${setting.firstRoot}},${setting.base}^{${secondRoot}}$이므로 $\\alpha=${setting.firstRoot},\\beta=${secondRoot}$이고, 구하는 값은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      secondRoot,
      coefficient,
      answer,
    },
    operationCount: 22,
    maxInteger: Math.max(coefficient, answer),
  };
}

function validateSymmetricExponentialInvariant(generated) {
  const setting = generated.parameters;
  const firstT = setting.base ** setting.firstRoot;
  const secondT = setting.base ** setting.secondRoot;
  const sumMatches = firstT + secondT === setting.coefficient;
  const productMatches =
    firstT * secondT === setting.base ** setting.exponentSum;
  const solvedAnswer =
    setting.firstRoot * setting.secondRoot +
    (setting.secondRoot - setting.firstRoot) ** 2;

  return {
    solvable:
      setting.firstRoot < setting.secondRoot &&
      sumMatches &&
      productMatches,
    uniqueAnswer: true,
    calculatorFree: setting.coefficient <= 2200 && solvedAnswer <= 999,
    solvedAnswer: String(solvedAnswer),
  };
}

function alternatingAffineTrace({ first, parameter, length }) {
  const values = [Number(first)];
  for (let index = 1; index < length; index += 1) {
    values.push(2 * values.at(-1) + (index % 2 === 0 ? parameter : -parameter));
  }
  return values;
}

function generateAlternatingAffineRecurrence() {
  const setting = pick([
    { first: 3, parameter: 2 },
    { first: 4, parameter: 3 },
    { first: 5, parameter: 2 },
    { first: 5, parameter: 4 },
  ]);
  const values = alternatingAffineTrace({ ...setting, length: 7 });
  const answer = setting.first + setting.parameter + values[4];
  return {
    problem: shortAnswer(
      `자연수 $c$와 수열 $\\{a_n\\}$이 $a_{n+1}=2a_n+(-1)^n c$를 만족한다. $a_3=${values[2]},\\;a_6=${values[5]}$일 때, $a_1+c+a_5$의 값을 구하시오.`,
      answer,
      `점화식을 차례로 전개하면 $a_3=4a_1-c$, $a_6=32a_1-11c$입니다. 두 조건을 연립하여 $a_1=${setting.first},c=${setting.parameter}$를 얻고, $a_5=${values[4]}$이므로 구하는 값은 ${answer}입니다.`
    ),
    parameters: { ...setting, values, answer },
    operationCount: 28,
    maxInteger: Math.max(...values, answer),
  };
}

function validateAlternatingAffineRecurrence(generated) {
  const setting = generated.parameters;
  const candidates = [];
  for (let first = 1; first <= 20; first += 1) {
    for (let parameter = 1; parameter <= 12; parameter += 1) {
      const values = alternatingAffineTrace({ first, parameter, length: 7 });
      if (values[2] === setting.values[2] && values[5] === setting.values[5]) {
        candidates.push({ first, parameter, values });
      }
    }
  }
  const only = candidates[0];
  const solvedAnswer = only
    ? only.first + only.parameter + only.values[4]
    : Number.NaN;
  return {
    solvable: candidates.length === 1,
    uniqueAnswer: candidates.length === 1,
    calculatorFree: Number.isInteger(solvedAnswer) && solvedAnswer >= 1 && solvedAnswer <= 999,
    solvedAnswer: String(solvedAnswer),
  };
}

function generateSubsetResidueNaturalAnswer() {
  const original = generateSubsetCondition();
  const [numerator, denominator] = String(original.problem.answer)
    .split("/")
    .map(Number);
  const answer = numerator + denominator;
  return {
    ...original,
    problem: shortAnswer(
      original.problem.prompt.replace(
        /확률을 구하시오\.$/,
        "확률을 서로소인 자연수 $p,q$에 대하여 $\\dfrac{p}{q}$라 할 때, $p+q$의 값을 구하시오."
      ),
      answer,
      `${original.problem.solution} 따라서 $p=${numerator},q=${denominator}$이므로 $p+q=${answer}$입니다.`
    ),
    parameters: {
      original,
      numerator,
      denominator,
      answer,
    },
    operationCount: Number(original.operationCount || 0) + 3,
    maxInteger: Math.max(Number(original.maxInteger || 0), answer),
  };
}

function validateSubsetResidueNaturalAnswer(generated) {
  const setting = generated.parameters;
  const independent = validateSubsetCondition(setting.original);
  const [numerator, denominator] = String(independent.solvedAnswer)
    .split("/")
    .map(Number);
  const solvedAnswer = numerator + denominator;
  return {
    solvable: independent.solvable === true && Number.isInteger(solvedAnswer),
    uniqueAnswer: independent.uniqueAnswer === true,
    calculatorFree:
      independent.calculatorFree === true && solvedAnswer >= 1 && solvedAnswer <= 999,
    solvedAnswer: String(solvedAnswer),
  };
}

function generateExtremaChordArea() {
  const a = pick([1, 2, 3, 4]);
  const constant =
    randomInteger(-6, 6);
  const scaledArea = a ** 4;

  return {
    problem: shortAnswer(
      `삼차함수 $f(x)=x^3-${3 * a ** 2}x${constant >= 0 ? "+" : ""}${constant}$의 극대점과 극소점을 잇는 직선과 곡선으로 둘러싸인 부분의 넓이를 $S$라 하자. $2S$의 값을 구하시오.`,
      scaledArea,
      `도함수 $f'(x)=3(x-${a})(x+${a})$에서 두 극값의 $x$좌표는 $-${a},${a}$입니다. 두 점을 잇는 직선과 $f$의 차를 인수분해한 뒤 $x=0$에서 나누어 절댓값을 적분하면 $S=\\dfrac{${a}^4}{2}$이므로 $2S=${scaledArea}$입니다.`
    ),
    parameters: {
      a,
      constant,
      scaledArea,
    },
    operationCount: 18,
    maxInteger: scaledArea,
  };
}

function validateExtremaChordArea(
  generated
) {
  const { a } =
    generated.parameters;
  const area =
    2 *
    polynomialIntegral(
      [0, a ** 2, 0, -1],
      0,
      a
    );
  const solvedAnswer =
    Math.round(2 * area);

  return {
    solvable:
      solvedAnswer === a ** 4 &&
      solvedAnswer > 0,
    uniqueAnswer: true,
    calculatorFree:
      solvedAnswer <= 256,
    solvedAnswer: String(
      solvedAnswer
    ),
  };
}

function velocityDistance(setting) {
  const coefficients = [
    setting.a * setting.b,
    -(setting.a + setting.b),
    1,
  ];
  const stops = [
    0,
    setting.a,
    setting.b,
    setting.end,
  ];

  return stops
    .slice(0, -1)
    .reduce(
      (sum, lower, index) =>
        sum +
        Math.abs(
          polynomialIntegral(
            coefficients,
            lower,
            stops[index + 1]
          )
        ),
      0
    );
}

function generateVelocityTurningDistance() {
  const setting = pick([
    { a: 1, b: 3, end: 5 },
    { a: 1, b: 4, end: 6 },
    { a: 2, b: 4, end: 6 },
    { a: 2, b: 5, end: 7 },
  ]);
  const distance =
    velocityDistance(setting);
  const scaledDistance =
    Math.round(6 * distance);

  return {
    problem: shortAnswer(
      `수직선 위를 움직이는 점 P의 시각 $t$에서의 속도가 $v(t)=(t-${setting.a})(t-${setting.b})$이다. $t=0$부터 $t=${setting.end}$까지 P가 움직인 거리를 $D$라 할 때, $6D$의 값을 구하시오.`,
      scaledDistance,
      `속도가 0이 되는 시각 ${setting.a}, ${setting.b}를 기준으로 부호를 나눕니다. 각 구간에서 속도를 적분한 값의 절댓값을 더하면 이동 거리이고, 계산하면 $6D=${scaledDistance}$입니다.`
    ),
    parameters: {
      ...setting,
      scaledDistance,
    },
    operationCount: 20,
    maxInteger: scaledDistance,
  };
}

function validateVelocityTurningDistance(
  generated
) {
  const distance =
    velocityDistance(
      generated.parameters
    );
  const solvedAnswer =
    Math.round(6 * distance);

  return {
    solvable:
      solvedAnswer > 0 &&
      Math.abs(
        solvedAnswer -
          6 * distance
      ) < 1e-8,
    uniqueAnswer: true,
    calculatorFree:
      solvedAnswer <= 2500,
    solvedAnswer: String(
      solvedAnswer
    ),
  };
}

function integralCubicValue(
  setting,
  x
) {
  return (
    x ** 3 / 3 -
    setting.p * x ** 2 / 2 +
    setting.q * x
  );
}

function generateIntegralDifferentiability() {
  const setting = pick([
    { p: 4, q: 3, c: 1 },
    { p: 5, q: 4, c: 2 },
    { p: 6, q: 5, c: 2 },
    { p: 7, q: 10, c: 3 },
  ]);
  const value =
    integralCubicValue(
      setting,
      setting.c
    );
  const slope =
    setting.c ** 2 -
    setting.p *
      setting.c +
    setting.q;
  const intercept =
    value -
    slope * setting.c;
  const scaledAnswer =
    Math.round(
      6 *
        (
          slope +
          intercept
        )
    );

  return {
    problem: shortAnswer(
      `함수 $F(x)=\\int_0^x(t^2-${setting.p}t+${setting.q})\\,dt$에 대하여 $g(x)=\\begin{cases}F(x)&(x<${setting.c})\\\\mx+n&(x\\ge ${setting.c})\\end{cases}$라 하자. $g$가 $x=${setting.c}$에서 미분가능할 때, $6(m+n)$의 값을 구하시오.`,
      scaledAnswer,
      `연속 조건에서 $m${setting.c}+n=F(${setting.c})$, 미분가능 조건에서 $m=F'(${setting.c})$를 얻습니다. 두 식에 적분값과 미분값을 대입하면 $6(m+n)=${scaledAnswer}$입니다.`
    ),
    parameters: {
      ...setting,
      scaledAnswer,
    },
    operationCount: 17,
    maxInteger:
      Math.abs(scaledAnswer),
  };
}

function validateIntegralDifferentiability(
  generated
) {
  const setting =
    generated.parameters;
  const value =
    integralCubicValue(
      setting,
      setting.c
    );
  const slope =
    setting.c ** 2 -
    setting.p *
      setting.c +
    setting.q;
  const intercept =
    value -
    slope * setting.c;
  const solvedAnswer =
    Math.round(
      6 *
        (
          slope +
          intercept
        )
    );

  return {
    solvable:
      Number.isInteger(
        solvedAnswer
      ),
    uniqueAnswer: true,
    calculatorFree:
      Math.abs(
        solvedAnswer
      ) <= 600,
    solvedAnswer: String(
      solvedAnswer
    ),
  };
}

function generateBayesTwoBoxes() {
  const setting = pick([
    {
      first: { red: 4, blue: 3 },
      second: { red: 2, blue: 5 },
    },
    {
      first: { red: 5, blue: 3 },
      second: { red: 3, blue: 5 },
    },
    {
      first: { red: 3, blue: 4 },
      second: { red: 5, blue: 2 },
    },
    {
      first: { red: 6, blue: 3 },
      second: { red: 3, blue: 6 },
    },
  ]);
  const firstTotal =
    setting.first.red +
    setting.first.blue;
  const secondTotal =
    setting.second.red +
    setting.second.blue;
  const firstWeight =
    setting.first.red *
    setting.first.blue *
    choose(secondTotal, 2);
  const secondWeight =
    setting.second.red *
    setting.second.blue *
    choose(firstTotal, 2);
  const answer = fraction(
    firstWeight,
    firstWeight + secondWeight
  );

  return {
    problem: shortAnswer(
      `A상자에는 빨간 공 ${setting.first.red}개와 파란 공 ${setting.first.blue}개, B상자에는 빨간 공 ${setting.second.red}개와 파란 공 ${setting.second.blue}개가 있다. 두 상자 중 하나를 같은 확률로 골라 공 2개를 동시에 꺼냈더니 색이 서로 달랐다. 선택한 상자가 A일 확률을 구하시오.`,
      answer,
      `A와 B에서 서로 다른 색이 나올 확률을 각각 조합으로 계산한 뒤 베이즈 정리를 적용합니다. 두 상자의 사전확률이 같으므로 가능도만 비교하면 답은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      firstWeight,
      secondWeight,
      answer,
    },
    operationCount: 18,
    maxInteger:
      firstWeight +
      secondWeight,
  };
}

function validateBayesTwoBoxes(
  generated
) {
  const setting =
    generated.parameters;
  const firstTotal =
    setting.first.red +
    setting.first.blue;
  const secondTotal =
    setting.second.red +
    setting.second.blue;
  const firstWeight =
    setting.first.red *
    setting.first.blue *
    choose(secondTotal, 2);
  const secondWeight =
    setting.second.red *
    setting.second.blue *
    choose(firstTotal, 2);

  return {
    solvable:
      firstWeight > 0 &&
      secondWeight > 0,
    uniqueAnswer: true,
    calculatorFree:
      firstWeight +
        secondWeight <=
      5000,
    solvedAnswer: fraction(
      firstWeight,
      firstWeight + secondWeight
    ),
  };
}

function noAdjacent(values) {
  return values.every(
    (value, index) =>
      index === 0 ||
      value -
        values[index - 1] >
        1
  );
}

function generateEndpointGapSelection() {
  const setting = pick([
    { size: 7, selected: 3 },
    { size: 8, selected: 3 },
    { size: 9, selected: 4 },
    { size: 10, selected: 4 },
  ]);
  const valid =
    fixedSizeSubsets(
      setting.size,
      setting.selected
    ).filter(noAdjacent);
  const favorable =
    valid.filter(
      (values) =>
        values.includes(1) !==
        values.includes(
          setting.size
        )
    );
  const answer = fraction(
    favorable.length,
    valid.length
  );

  return {
    problem: shortAnswer(
      `집합 $\\{1,2,\\ldots,${setting.size}\\}$에서 ${setting.selected}개의 원소를 임의로 고른다. 이웃한 두 수를 함께 고르지 않았다는 조건에서, 1과 ${setting.size} 중 정확히 하나만 고를 확률을 구하시오.`,
      answer,
      `먼저 이웃하지 않게 ${setting.selected}개를 고르는 전체 경우를 간격 치환으로 셉니다. 이어서 양 끝 중 하나만 포함하는 두 경우를 나누어 세면 조건부확률은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      total: valid.length,
      favorable:
        favorable.length,
      answer,
    },
    operationCount: 18,
    maxInteger:
      valid.length,
  };
}

function validateEndpointGapSelection(
  generated
) {
  const setting =
    generated.parameters;
  const valid =
    fixedSizeSubsets(
      setting.size,
      setting.selected
    ).filter(noAdjacent);
  const favorable =
    valid.filter(
      (values) =>
        values.includes(1) !==
        values.includes(
          setting.size
        )
    );

  return {
    solvable:
      favorable.length > 0 &&
      favorable.length <
        valid.length,
    uniqueAnswer: true,
    calculatorFree:
      valid.length <= 300,
    solvedAnswer: fraction(
      favorable.length,
      valid.length
    ),
  };
}

function generateLatticeReturnCondition() {
  const size = pick([4, 5, 6]);
  const paths =
    uniquePermutations({
      R: size,
      U: size,
    });
  const valid =
    paths.filter((path) => {
      let balance = 0;

      for (const step of path) {
        balance +=
          step === "R"
            ? 1
            : -1;

        if (balance < 0) {
          return false;
        }
      }

      return balance === 0;
    });
  const favorable =
    valid.filter((path) => {
      let balance = 0;
      let intermediateReturns = 0;

      [
        ...path,
      ].forEach(
        (step, index) => {
          balance +=
            step === "R"
              ? 1
              : -1;

          if (
            balance === 0 &&
            index <
              path.length - 1
          ) {
            intermediateReturns += 1;
          }
        }
      );

      return (
        intermediateReturns === 0
      );
    });
  const answer = fraction(
    favorable.length,
    valid.length
  );

  return {
    problem: shortAnswer(
      `점 P가 $(0,0)$에서 출발하여 오른쪽 또는 위로 한 칸씩 이동해 $(${size},${size})$에 도착한다. 이동하는 동안 항상 $y\\le x$를 만족하는 경로를 임의로 하나 고를 때, 도착하기 전에는 직선 $y=x$와 다시 만나지 않을 확률을 구하시오.`,
      answer,
      `먼저 카탈란 경로의 수를 구하고, 도착 전에 대각선으로 돌아오는지에 따라 경로를 분해합니다. 처음 돌아오는 시점이 도착점인 원시 경로의 수를 전체 카탈란 경로의 수로 나누면 ${answer}입니다.`
    ),
    parameters: {
      size,
      total: valid.length,
      favorable:
        favorable.length,
      answer,
    },
    operationCount: 28,
    maxInteger:
      paths.length,
  };
}

function validateLatticeReturnCondition(
  generated
) {
  const size =
    generated.parameters.size;
  const paths =
    uniquePermutations({
      R: size,
      U: size,
    });
  let total = 0;
  let favorable = 0;

  for (const path of paths) {
    let balance = 0;
    let valid = true;
    let intermediateReturns = 0;

    [
      ...path,
    ].forEach(
      (step, index) => {
        balance +=
          step === "R"
            ? 1
            : -1;
        if (balance < 0) {
          valid = false;
        }
        if (
          balance === 0 &&
          index <
            path.length - 1
        ) {
          intermediateReturns += 1;
        }
      }
    );

    if (!valid) continue;
    total += 1;
    if (
      intermediateReturns === 0
    ) {
      favorable += 1;
    }
  }

  return {
    solvable:
      favorable > 0 &&
      favorable < total,
    uniqueAnswer: true,
    calculatorFree:
      paths.length <= 1000,
    solvedAnswer: fraction(
      favorable,
      total
    ),
  };
}

function boundedCompositions({
  total,
  parts,
  cap,
}) {
  const results = [];
  const current =
    Array(parts).fill(0);

  function walk(
    index,
    remaining
  ) {
    if (index === parts - 1) {
      if (
        remaining >= 0 &&
        remaining <= cap
      ) {
        current[index] =
          remaining;
        results.push([
          ...current,
        ]);
      }
      return;
    }

    for (
      let value = 0;
      value <=
      Math.min(cap, remaining);
      value += 1
    ) {
      current[index] = value;
      walk(
        index + 1,
        remaining - value
      );
    }
  }

  walk(0, total);
  return results;
}

function generateBoundedDistribution() {
  const setting = pick([
    {
      total: 7,
      parts: 4,
      cap: 4,
    },
    {
      total: 8,
      parts: 4,
      cap: 5,
    },
    {
      total: 9,
      parts: 5,
      cap: 4,
    },
  ]);
  const valid =
    boundedCompositions(
      setting
    ).filter(
      (values) =>
        values.filter(
          (value) =>
            value === 0
        ).length === 1
    );
  const favorable =
    valid.filter(
      (values) =>
        values[0] <
          values.at(-1) &&
        values.reduce(
          (
            sum,
            value,
            index
          ) =>
            sum +
            (
              index + 1
            ) *
              value,
          0
        ) %
          2 ===
          0
    );
  const answer = fraction(
    favorable.length,
    valid.length
  );

  return {
    problem: shortAnswer(
      `서로 같은 공 ${setting.total}개를 서로 다른 상자 ${setting.parts}개에 넣되, 각 상자에는 ${setting.cap}개 이하를 넣는다. 빈 상자가 정확히 하나인 배분을 임의로 하나 고를 때, 첫째 상자의 공 수가 마지막 상자보다 작고 $\\sum_{k=1}^{${setting.parts}}kx_k$가 짝수일 확률을 구하시오. 단, $x_k$는 $k$번째 상자의 공 수이다.`,
      answer,
      `상한과 빈 상자 조건을 함께 만족하는 정수해를 먼저 셉니다. 그중 첫째·마지막 상자의 대소 조건과 가중합의 홀짝 조건을 동시에 만족하는 경우를 분류하면 확률은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      totalCases:
        valid.length,
      favorableCases:
        favorable.length,
      answer,
    },
    operationCount: 32,
    maxInteger:
      valid.length,
  };
}

function validateBoundedDistribution(
  generated
) {
  const setting =
    generated.parameters;
  const valid =
    boundedCompositions(
      setting
    ).filter(
      (values) =>
        values.filter(
          (value) =>
            value === 0
        ).length === 1
    );
  const favorable =
    valid.filter(
      (values) =>
        values[0] <
          values.at(-1) &&
        values.reduce(
          (
            sum,
            value,
            index
          ) =>
            sum +
            (
              index + 1
            ) *
              value,
          0
        ) %
          2 ===
          0
    );

  return {
    solvable:
      favorable.length > 0 &&
      favorable.length <
        valid.length,
    uniqueAnswer: true,
    calculatorFree:
      valid.length <= 1000,
    solvedAnswer: fraction(
      favorable.length,
      valid.length
    ),
  };
}

function generateDistanceInverse() {
  const options = [
    {
      a: 1,
      end: 6,
      candidateMax: 5,
      b: 3,
    },
    {
      a: 1,
      end: 7,
      candidateMax: 6,
      b: 4,
    },
    {
      a: 2,
      end: 8,
      candidateMax: 7,
      b: 5,
    },
  ];
  const setting = pick(options);
  const scaledDistance =
    Math.round(
      6 *
        velocityDistance({
          ...setting,
          b: setting.b,
        })
    );
  const candidates = [];

  for (
    let b = setting.a + 1;
    b <= setting.candidateMax;
    b += 1
  ) {
    const candidate =
      Math.round(
        6 *
          velocityDistance({
            ...setting,
            b,
          })
      );
    if (
      candidate ===
      scaledDistance
    ) {
      candidates.push(b);
    }
  }
  const answer =
    candidates.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return {
    problem: shortAnswer(
      `점 P의 속도가 $v(t)=(t-${setting.a})(t-b)$이고 $${setting.a}<b\\le ${setting.candidateMax}$인 자연수이다. $t=0$부터 $t=${setting.end}$까지 움직인 거리를 $D$라 할 때 $6D=${scaledDistance}$이다. 가능한 모든 $b$의 합을 구하시오.`,
      answer,
      `미지수 $b$에서 속도의 부호가 바뀌므로 $0,${setting.a},b,${setting.end}$로 구간을 나눕니다. 각 구간의 변위의 절댓값을 더해 거리식을 만들고 자연수 범위를 검산하면 가능한 $b$는 ${candidates.join(", ")}이며 합은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      scaledDistance,
      candidates,
      answer,
    },
    operationCount: 34,
    maxInteger:
      scaledDistance,
  };
}

function validateDistanceInverse(
  generated
) {
  const setting =
    generated.parameters;
  const candidates = [];

  for (
    let b = setting.a + 1;
    b <= setting.candidateMax;
    b += 1
  ) {
    if (
      Math.round(
        6 *
          velocityDistance({
            ...setting,
            b,
          })
      ) === setting.scaledDistance
    ) {
      candidates.push(b);
    }
  }
  const answer =
    candidates.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return {
    solvable:
      candidates.length >= 1 &&
      candidates.length <= 3,
    uniqueAnswer: true,
    calculatorFree:
      setting.scaledDistance <=
      6000,
    solvedAnswer: String(answer),
  };
}

function generateExtremaChordEquation() {
  const setting = pick([
    {
      first: 1,
      second: 2,
    },
    {
      first: 1,
      second: 3,
    },
    {
      first: 2,
      second: 3,
    },
  ]);
  const sumSquares =
    setting.first ** 2 +
    setting.second ** 2;
  const productSquares =
    setting.first ** 2 *
    setting.second ** 2;
  const answer =
    setting.first +
    setting.second;

  return {
    problem: shortAnswer(
      `양수 $a$에 대하여 $f_a(x)=x^3-3a^2x$라 하고, $f_a$의 극대점과 극소점을 잇는 직선과 곡선으로 둘러싸인 넓이를 $S(a)$라 하자. 방정식 $2S(a)-${sumSquares}a^2+${productSquares}=0$을 만족하는 모든 양수 $a$의 합을 구하시오.`,
      answer,
      `두 극값의 위치를 구해 두 점을 잇는 직선을 세웁니다. 곡선과 직선의 차를 인수분해하고 구간별로 적분하면 $2S(a)=a^4$입니다. 따라서 $(a^2-${setting.first ** 2})(a^2-${setting.second ** 2})=0$이므로 양수 해의 합은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      sumSquares,
      productSquares,
      answer,
    },
    operationCount: 31,
    maxInteger:
      productSquares,
  };
}

function validateExtremaChordEquation(
  generated
) {
  const setting =
    generated.parameters;
  const roots = [];

  for (
    let candidate = 1;
    candidate <= 10;
    candidate += 1
  ) {
    if (
      candidate ** 4 -
        setting.sumSquares *
          candidate ** 2 +
        setting.productSquares ===
      0
    ) {
      roots.push(candidate);
    }
  }

  return {
    solvable:
      roots.length === 2 &&
      roots[0] ===
        setting.first &&
      roots[1] ===
        setting.second,
    uniqueAnswer: true,
    calculatorFree:
      setting.productSquares <=
      100,
    solvedAnswer: String(
      roots.reduce(
        (sum, value) =>
          sum + value,
        0
      )
    ),
  };
}

function generateIntegralTangentEquation() {
  const setting = pick([
    {
      center: 4,
      first: 1,
      second: 2,
    },
    {
      center: 5,
      first: 1,
      second: 3,
    },
    {
      center: 6,
      first: 2,
      second: 3,
    },
  ]);
  const sumSquares =
    setting.first ** 2 +
    setting.second ** 2;
  const productSquares =
    setting.first ** 2 *
    setting.second ** 2;
  const roots = [
    setting.center -
      setting.second,
    setting.center -
      setting.first,
    setting.center +
      setting.first,
    setting.center +
      setting.second,
  ].filter(
    (value) =>
      value > 0
  );
  const answer =
    roots.reduce(
      (sum, value) =>
        sum + value,
      0
    );
  const p =
    2 * setting.center;

  return {
    problem: shortAnswer(
      `함수 $F(x)=\\int_0^x(t^2-${p}t+1)\\,dt$에 대하여 $x=c$에서의 접선과 곡선 $y=F(x)$가 둘러싸는 넓이를 $S(c)$라 하자. 방정식 $4S(c)-${9 * sumSquares}(c-${setting.center})^2+${9 * productSquares}=0$을 만족하는 모든 양수 $c$의 합을 구하시오.`,
      answer,
      `접선과 $F$의 차를 인수분해하면 다른 교점까지의 거리는 $3|c-${setting.center}|$입니다. 이를 적분하면 $4S(c)=9(c-${setting.center})^4$입니다. $u=(c-${setting.center})^2$로 치환해 두 값을 구하고 양수인 $c$를 모두 복원하면 합은 ${answer}입니다.`
    ),
    parameters: {
      ...setting,
      p,
      sumSquares,
      productSquares,
      roots,
      answer,
    },
    operationCount: 36,
    maxInteger:
      9 * productSquares,
  };
}

function validateIntegralTangentEquation(
  generated
) {
  const setting =
    generated.parameters;
  const roots = [];

  for (
    let candidate = 1;
    candidate <=
    setting.center +
      setting.second +
      2;
    candidate += 1
  ) {
    const shifted =
      candidate -
      setting.center;
    const value =
      shifted ** 4 -
      setting.sumSquares *
        shifted ** 2 +
      setting.productSquares;

    if (value === 0) {
      roots.push(candidate);
    }
  }

  return {
    solvable:
      roots.length >= 2 &&
      roots.length <= 4,
    uniqueAnswer: true,
    calculatorFree:
      setting.productSquares <=
      100,
    solvedAnswer: String(
      roots.reduce(
        (sum, value) =>
          sum + value,
        0
      )
    ),
  };
}

const PLACEMENT_ADVANCED_TYPES = {
  "semi-exponential-root-invariant": {
    label: "지수방정식 치환과 두 근의 불변량",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "algebra",
    referenceFamily: "exponential-logarithmic-equation",
    skillTags: ["지수방정식", "치환", "근과 계수의 관계"],
    difficultyScore: 0.82,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId: "symmetric-exponential-root-invariant",
    generate: generateSymmetricExponentialInvariant,
    validate: validateSymmetricExponentialInvariant,
  },
  "semi-inverse-recurrence": {
    label: "홀짝 점화식의 역추적과 경우 분기",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "algebra",
    referenceFamily: "sequence-recurrence",
    skillTags: ["점화식", "홀짝 분기", "역추론"],
    difficultyScore: 0.84,
    expectedTimeMs: 9 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "inverse-piecewise-recurrence-semi",
    generate: generateInverseRecurrence,
    validate: validateInverseRecurrence,
  },
  "semi-alternating-affine-recurrence": {
    label: "교대 부호 점화식의 미정계수 역추론",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "algebra",
    referenceFamily: "sequence-recurrence",
    skillTags: ["점화식", "미정계수", "연립 추론"],
    difficultyScore: 0.86,
    expectedTimeMs: 9 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "alternating-affine-recurrence",
    generate: generateAlternatingAffineRecurrence,
    validate: validateAlternatingAffineRecurrence,
  },
  "semi-tangent-area-parameter-reverse": {
    label: "접선 넓이 방정식의 매개변수 역추론",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "calculus-1",
    referenceFamily: "integral-defined-area",
    skillTags: ["접선", "정적분 넓이", "매개변수 역추론"],
    difficultyScore: 0.86,
    expectedTimeMs: 9 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "tangent-area-parameter-reverse-semi",
    generate: generateTangentAreaEquation,
    validate: validateTangentAreaEquation,
  },
  "semi-distance-parameter-reverse": {
    label: "이동 거리 조건의 속도 영점 역추론",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "calculus-1",
    referenceFamily: "derivative-limit-motion",
    skillTags: ["속도", "이동 거리", "매개변수 역추론"],
    difficultyScore: 0.85,
    expectedTimeMs: 9 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "distance-parameter-reverse-semi",
    generate: generateDistanceInverse,
    validate: validateDistanceInverse,
  },
  "semi-subset-residue-natural": {
    label: "간격·합동 조건 부분집합의 확률 역산",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "probability-statistics",
    referenceFamily: "probability-counting",
    skillTags: ["부분집합", "간격 조건", "나머지 경우분류"],
    difficultyScore: 0.85,
    expectedTimeMs: 9 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId: "subset-residue-natural-semi",
    generate: generateSubsetResidueNaturalAnswer,
    validate: validateSubsetResidueNaturalAnswer,
  },
  "semi-absolute-graph-area": {
    label:
      "절댓값 그래프의 교점과 구간별 넓이",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    arenaSlotRole: "REGULAR",
    sourcePositionBand: "Q27_28",
    courseId: "calculus-1",
    referenceFamily:
      "function-condition-graph",
    skillTags: [
      "절댓값 함수",
      "그래프 교점",
      "정적분 넓이",
    ],
    difficultyScore: 0.79,
    expectedTimeMs: 7 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "absolute-graph-intersection-area",
    generate:
      generateAbsoluteGraphArea,
    validate:
      validateAbsoluteGraphArea,
  },
  "semi-tangent-area": {
    label:
      "도함수 복원과 접선 사이의 넓이",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId: "calculus-1",
    referenceFamily:
      "integral-defined-area",
    skillTags: [
      "도함수",
      "접선",
      "정적분 넓이",
    ],
    difficultyScore: 0.75,
    expectedTimeMs: 6 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "polynomial-tangent-area",
    generate: generateTangentArea,
    validate: validateTangentArea,
  },
  "semi-extrema-chord-area": {
    label:
      "극대·극소점과 현 사이의 넓이",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    arenaSlotRole: "REGULAR",
    sourcePositionBand: "Q27_28",
    courseId: "calculus-1",
    referenceFamily:
      "function-condition-graph",
    skillTags: [
      "극대와 극소",
      "두 점을 지나는 직선",
      "정적분 넓이",
    ],
    difficultyScore: 0.8,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "extrema-chord-area",
    generate:
      generateExtremaChordArea,
    validate:
      validateExtremaChordArea,
  },
  "semi-velocity-turning-distance": {
    label:
      "속도의 부호 변화와 이동 거리",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    arenaSlotRole: "REGULAR",
    sourcePositionBand: "Q27_28",
    courseId: "calculus-1",
    referenceFamily:
      "derivative-limit-motion",
    skillTags: [
      "속도",
      "방향 전환",
      "정적분 거리",
    ],
    difficultyScore: 0.81,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "velocity-turning-distance",
    generate:
      generateVelocityTurningDistance,
    validate:
      validateVelocityTurningDistance,
  },
  "semi-integral-differentiability": {
    label:
      "적분함수와 미분가능 조건",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    arenaSlotRole: "REGULAR",
    sourcePositionBand: "Q27_28",
    courseId: "calculus-1",
    referenceFamily:
      "integral-defined-area",
    skillTags: [
      "적분으로 정의된 함수",
      "연속",
      "미분가능",
    ],
    difficultyScore: 0.8,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "integral-piecewise-differentiability",
    generate:
      generateIntegralDifferentiability,
    validate:
      validateIntegralDifferentiability,
  },
  "semi-repeated-arrangement": {
    label:
      "같은 것이 있는 배열의 복합 조건",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    courseId:
      "probability-statistics",
    referenceFamily:
      "probability-counting",
    skillTags: [
      "같은 것이 있는 순열",
      "이웃하지 않는 배열",
      "경우 분류",
    ],
    difficultyScore: 0.77,
    expectedTimeMs: 7 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "repeated-symbol-constrained-arrangement",
    generate:
      generateRepeatedArrangement,
    validate:
      validateRepeatedArrangement,
  },
  "semi-conditional-selection": {
    label:
      "적어도 하나 조건이 있는 조합 확률",
    category: "semi-killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "probability-counting",
    skillTags: [
      "조건부확률",
      "조합",
      "여사건",
    ],
    difficultyScore: 0.78,
    expectedTimeMs: 7 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "conditional-combination-selection",
    generate:
      generateConditionalSelection,
    validate:
      validateConditionalSelection,
  },
  "semi-random-variable-moment": {
    label:
      "확률분포의 상수와 분산 연결",
    category: "semi-killer",
    arenaNaturalAnswerEligible: true,
    arenaSlotRole: "REGULAR",
    sourcePositionBand: "Q27_28",
    courseId:
      "probability-statistics",
    referenceFamily:
      "probability-counting",
    skillTags: [
      "확률분포",
      "기댓값",
      "분산",
    ],
    difficultyScore: 0.8,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "weighted-distribution-moment",
    generate:
      generateMomentConstraint,
    validate:
      validateMomentConstraint,
  },
  "semi-bayes-two-boxes": {
    label:
      "두 상자의 선택을 역추론하는 조건부확률",
    category: "semi-killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "probability-counting",
    skillTags: [
      "조건부확률",
      "베이즈 정리",
      "조합",
    ],
    difficultyScore: 0.8,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "bayes-two-boxes",
    generate:
      generateBayesTwoBoxes,
    validate:
      validateBayesTwoBoxes,
  },
  "semi-endpoint-gap-selection": {
    label:
      "간격 조건과 양 끝 원소 선택",
    category: "semi-killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "probability-counting",
    skillTags: [
      "조합",
      "이웃하지 않는 선택",
      "조건부확률",
    ],
    difficultyScore: 0.81,
    expectedTimeMs: 8 * 60 * 1000,
    reasoningDepth: 4,
    similarGroupId:
      "endpoint-gap-selection",
    generate:
      generateEndpointGapSelection,
    validate:
      validateEndpointGapSelection,
  },
  "killer-divisor-map": {
    label:
      "약수 관계를 보존하는 함수의 확률",
    category: "killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "compound-case-analysis",
    skillTags: [
      "함수의 개수",
      "약수 관계",
      "조건부 경우의 수",
    ],
    difficultyScore: 0.94,
    expectedTimeMs: 11 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "relation-preserving-random-map",
    generate: generateDivisorMap,
    validate: validateDivisorMap,
  },
  "killer-subset-condition": {
    label:
      "간격과 합동 조건을 만족하는 부분집합",
    category: "killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "compound-case-analysis",
    skillTags: [
      "부분집합",
      "이웃하지 않는 선택",
      "나머지에 따른 경우 분류",
    ],
    difficultyScore: 0.93,
    expectedTimeMs: 11 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "nonadjacent-subset-residue",
    generate:
      generateSubsetCondition,
    validate:
      validateSubsetCondition,
  },
  "killer-surjective-condition": {
    label:
      "전사함수의 원상 크기와 끝값 조건",
    category: "killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "compound-case-analysis",
    skillTags: [
      "전사함수",
      "원상의 크기",
      "포함배제",
      "경우 분류",
    ],
    difficultyScore: 0.95,
    expectedTimeMs: 12 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "surjective-map-fiber-condition",
    generate:
      generateSurjectiveCondition,
    validate:
      validateSurjectiveCondition,
  },
  "killer-lattice-return-condition": {
    label:
      "대각선 제약 경로의 첫 귀환",
    category: "killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "compound-case-analysis",
    skillTags: [
      "격자 경로",
      "카탈란 구조",
      "조건부확률",
    ],
    difficultyScore: 0.95,
    expectedTimeMs: 12 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "lattice-first-return",
    generate:
      generateLatticeReturnCondition,
    validate:
      validateLatticeReturnCondition,
  },
  "killer-bounded-distribution": {
    label:
      "상한과 빈 상자 조건이 있는 배분",
    category: "killer",
    courseId:
      "probability-statistics",
    referenceFamily:
      "compound-case-analysis",
    skillTags: [
      "중복조합",
      "정수해",
      "복합 조건 분류",
    ],
    difficultyScore: 0.94,
    expectedTimeMs: 11 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "bounded-box-distribution",
    generate:
      generateBoundedDistribution,
    validate:
      validateBoundedDistribution,
  },
  "killer-tangent-integral-extrema": {
    label:
      "접선과 적분함수의 극값 역추론",
    category: "killer",
    courseId: "calculus-1",
    referenceFamily:
      "derivative-limit-motion",
    skillTags: [
      "접선",
      "미분",
      "적분으로 정의된 함수",
      "극대와 극소",
    ],
    difficultyScore: 0.96,
    expectedTimeMs: 12 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "tangent-integral-local-extrema",
    generate:
      generateTangentIntegralExtrema,
    validate:
      validateTangentIntegralExtrema,
  },
  "killer-tangent-area-equation": {
    label:
      "접선과 곡선의 넓이에서 매개변수 역추론",
    category: "killer",
    courseId: "calculus-1",
    referenceFamily:
      "integral-defined-area",
    skillTags: [
      "접선",
      "교점의 중근",
      "정적분 넓이",
      "매개변수 방정식",
    ],
    difficultyScore: 0.95,
    expectedTimeMs: 12 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "tangent-area-parameter-equation",
    generate:
      generateTangentAreaEquation,
    validate:
      validateTangentAreaEquation,
  },
  "killer-distance-inverse": {
    label:
      "이동 거리에서 속도 영점을 역추론",
    category: "killer",
    courseId: "calculus-1",
    referenceFamily:
      "derivative-limit-motion",
    skillTags: [
      "속도",
      "이동 거리",
      "매개변수 역추론",
    ],
    difficultyScore: 0.94,
    expectedTimeMs: 11 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "distance-parameter-inverse",
    generate:
      generateDistanceInverse,
    validate:
      validateDistanceInverse,
  },
  "killer-extrema-chord-equation": {
    label:
      "극값을 잇는 현의 넓이 방정식",
    category: "killer",
    courseId: "calculus-1",
    referenceFamily:
      "function-condition-graph",
    skillTags: [
      "극대와 극소",
      "정적분 넓이",
      "방정식 역추론",
    ],
    difficultyScore: 0.95,
    expectedTimeMs: 12 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "extrema-chord-area-equation",
    generate:
      generateExtremaChordEquation,
    validate:
      validateExtremaChordEquation,
  },
  "killer-integral-tangent-equation": {
    label:
      "적분함수의 접선 넓이와 매개변수",
    category: "killer",
    courseId: "calculus-1",
    referenceFamily:
      "integral-defined-area",
    skillTags: [
      "적분으로 정의된 함수",
      "접선",
      "넓이 방정식",
    ],
    difficultyScore: 0.96,
    expectedTimeMs: 12 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "integral-tangent-area-equation",
    generate:
      generateIntegralTangentEquation,
    validate:
      validateIntegralTangentEquation,
  },
  "killer-inverse-recurrence": {
    label:
      "점화식을 거꾸로 추적하는 경우 분기",
    category: "killer",
    courseId: "algebra",
    referenceFamily:
      "sequence-recurrence",
    skillTags: [
      "점화식",
      "홀짝 분기",
      "역추론",
    ],
    difficultyScore: 0.91,
    expectedTimeMs: 10 * 60 * 1000,
    reasoningDepth: 5,
    similarGroupId:
      "inverse-piecewise-recurrence",
    generate:
      generateInverseRecurrence,
    validate:
      validateInverseRecurrence,
  },
};

function validateAdvancedGenerated(
  definition,
  generated
) {
  const problem =
    generated?.problem;
  const independent =
    definition.validate(
      generated
    );
  const answer =
    String(
      problem?.answer ?? ""
    ).trim();
  const answerMatches =
    answer !== "" &&
    answer ===
      String(
        independent.solvedAnswer
      ).trim();
  const basicShape =
    typeof problem?.prompt ===
      "string" &&
    problem.prompt.trim() &&
    problem.inputMode ===
      "short-answer" &&
    typeof problem.solution ===
      "string" &&
    problem.solution.trim();
  const reasoningDepth =
    Number(
      definition.reasoningDepth
    ) || 0;
  const depthPass =
    definition.category ===
      "killer"
      ? reasoningDepth >= 5
      : reasoningDepth >= 4;

  return {
    passed: Boolean(
      basicShape &&
        answerMatches &&
        independent.solvable &&
        independent.uniqueAnswer &&
        independent.calculatorFree &&
        depthPass
    ),
    solvable: Boolean(
      independent.solvable
    ),
    uniqueAnswer: Boolean(
      independent.uniqueAnswer
    ),
    calculatorFree: Boolean(
      independent.calculatorFree
    ),
    answerMatches,
    reasoningDepth,
    operationCount:
      generated.operationCount,
    maxInteger:
      generated.maxInteger,
  };
}

function generateValidatedAdvancedQuestion({
  category,
  courseId,
  excludedTypeIds = [],
  typeWeights = null,
  maxAttempts = 160,
} = {}) {
  const excluded = new Set(
    excludedTypeIds
  );
  const eligible = Object.entries(
    PLACEMENT_ADVANCED_TYPES
  ).filter(
    ([key, definition]) =>
      definition.category ===
        category &&
      (
        !courseId ||
        definition.courseId ===
          courseId
      ) &&
      !excluded.has(key)
  );

  if (!eligible.length) {
    throw new Error(
      `${courseId || "전체 과목"}의 ${category} 출제 유형이 부족합니다.`
    );
  }

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    const positiveWeights =
      eligible.map(
        ([typeId]) =>
          Math.max(
            0,
            Number(
              typeWeights?.[
                typeId
              ]
            ) || 0
          )
      );
    const hasPreferredWeights =
      positiveWeights.some(
        (weight) =>
          weight > 0
      );
    let selectedIndex = 0;

    if (hasPreferredWeights) {
      const total =
        positiveWeights.reduce(
          (sum, weight) =>
            sum + weight,
          0
        );
      let cursor =
        Math.random() * total;

      for (
        let index = 0;
        index <
        positiveWeights.length;
        index += 1
      ) {
        cursor -=
          positiveWeights[index];

        if (cursor <= 0) {
          selectedIndex = index;
          break;
        }
      }
    } else {
      selectedIndex =
        randomInteger(
          0,
          eligible.length - 1
        );
    }

    const [typeId, definition] =
      eligible[selectedIndex];
    const generated =
      definition.generate();
    const validation =
      validateAdvancedGenerated(
        definition,
        generated
      );

    if (!validation.passed) {
      continue;
    }

    return {
      typeId,
      definition,
      problem:
        generated.problem,
      validation: {
        ...validation,
        attempts: attempt,
        checkedAt:
          new Date(),
      },
    };
  }

  throw new Error(
    `${courseId || "전체 과목"}의 ${category} 문항이 ${maxAttempts}회 안에 검산을 통과하지 못했습니다.`
  );
}

function generateValidatedArenaOneOnOneQuestion({
  typeId,
  allowedCategory = "semi-killer",
  maxAttempts = 160,
} = {}) {
  const normalizedTypeId = String(typeId || "").trim();
  const definition = PLACEMENT_ADVANCED_TYPES[normalizedTypeId];
  const normalizedCategory = String(allowedCategory || "semi-killer").trim();
  if (!definition || definition.category !== normalizedCategory) {
    throw new Error(
      `${normalizedTypeId || "선택한 유형"}은 GOAT Arena 1대1 ${normalizedCategory === "killer" ? "29·30번형 킬러" : "준킬러"} 유형이 아닙니다.`
    );
  }

  const generated = generateValidatedAdvancedQuestion({
    category: normalizedCategory,
    excludedTypeIds: Object.keys(PLACEMENT_ADVANCED_TYPES).filter(
      (candidateTypeId) => candidateTypeId !== normalizedTypeId
    ),
    maxAttempts,
  });
  if (normalizedCategory === "killer") {
    generated.definition = {
      ...generated.definition,
      arenaSlotRole: "FINAL_29_30",
      sourcePositionBand: "Q29_30_KILLER",
      expectedTimeMs: Math.min(10 * 60 * 1000, Number(generated.definition.expectedTimeMs || 10 * 60 * 1000)),
    };
  }
  return generated;
}

function auditAdvancedTypeBank(
  samplesPerType = 40
) {
  const failures = [];

  for (const [
    typeId,
    definition,
  ] of Object.entries(
    PLACEMENT_ADVANCED_TYPES
  )) {
    for (
      let sample = 0;
      sample < samplesPerType;
      sample += 1
    ) {
      const generated =
        definition.generate();
      const validation =
        validateAdvancedGenerated(
          definition,
          generated
        );

      if (!validation.passed) {
        failures.push({
          typeId,
          sample,
          validation,
        });
        break;
      }
    }
  }

  return {
    referenceFamilyCount:
      Object.keys(
        ADVANCED_REFERENCE_FAMILIES
      ).length,
    typeCount:
      Object.keys(
        PLACEMENT_ADVANCED_TYPES
      ).length,
    semiKillerTypeCount:
      Object.values(
        PLACEMENT_ADVANCED_TYPES
      ).filter(
        (definition) =>
          definition.category ===
          "semi-killer"
      ).length,
    killerTypeCount:
      Object.values(
        PLACEMENT_ADVANCED_TYPES
      ).filter(
        (definition) =>
          definition.category ===
          "killer"
      ).length,
    failures,
  };
}

module.exports = {
  ADVANCED_REFERENCE_FAMILIES,
  PLACEMENT_ADVANCED_TYPES,
  ARENA_ONE_ON_ONE_PROBLEM_TYPES: PLACEMENT_ADVANCED_TYPES,
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
  generateValidatedAdvancedQuestion,
  generateValidatedArenaOneOnOneQuestion,
  validateAdvancedGenerated,
  auditAdvancedTypeBank,
};
