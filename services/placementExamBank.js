const {
  randomUUID,
} = require("crypto");

const {
  EXAM_COURSES,
} = require("./examBankSource");
const {
  PLACEMENT_ADVANCED_TYPES,
  generateValidatedAdvancedQuestion,
  auditAdvancedTypeBank,
} = require("./placementAdvancedTypes");
const {
  isProblemTypeEnabled,
} = require("./problemTypeControlCache");
const {
  validateCalculatorFreeProblem,
} = require("./problemGenerators/utils");

const PLACEMENT_TIME_LIMIT_MS =
  100 * 60 * 1000;
const PLACEMENT_BANK_VERSION =
  "2026-08-04-semantic-unique-thirty-types-v6";
const PLACEMENT_TOTAL_POINTS = 100;
const PROBABILITY_TOTAL = 100;
const ADVANCED_CATEGORY_BY_NUMBER =
  new Map([
    [20, "semi-killer"],
    [21, "semi-killer"],
    [28, "killer"],
    [30, "killer"],
  ]);

const COURSE_META = {
  algebra: {
    label: "대수",
    unitId:
      "exponential-logarithmic-functions",
    subunitId: "radical",
    conceptId: "algebra-01-01",
  },
  "calculus-1": {
    label: "미적분Ⅰ",
    unitId: "limits-and-continuity",
    subunitId: "lim",
    conceptId:
      "calculus-1-01-01",
  },
  "probability-statistics": {
    label: "확률과 통계",
    unitId: "counting",
    subunitId: "perm",
    conceptId:
      "probability-statistics-01-01",
  },
};

const BANK_COURSE_IDS = {
  algebra: "algebra",
  calculus: "calculus-1",
  probstat:
    "probability-statistics",
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

function shuffle(values) {
  const result = [...values];

  for (
    let index = result.length - 1;
    index > 0;
    index -= 1
  ) {
    const target =
      randomInteger(0, index);
    [
      result[index],
      result[target],
    ] = [
      result[target],
      result[index],
    ];
  }

  return result;
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
  const divisor = gcd(
    numerator,
    denominator
  );
  const normalizedNumerator =
    numerator / divisor;
  const normalizedDenominator =
    denominator / divisor;

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
  if (r < 0 || r > n) return 0;
  return Math.round(
    factorial(n) /
      (
        factorial(r) *
        factorial(n - r)
      )
  );
}

function math(value) {
  return `$${value}$`;
}

function shiftedX(value) {
  if (value === 0) return "x";

  return value > 0
    ? `x-${value}`
    : `x+${-value}`;
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

function multipleChoice(
  prompt,
  answer,
  distractors,
  solution
) {
  const correct = String(answer);
  const wrong = [
    ...new Set(
      distractors
        .map(String)
        .filter(
          (value) =>
            value !== correct
        )
    ),
  ];

  if (wrong.length < 4) {
    return null;
  }

  const keys = [
    "a",
    "b",
    "c",
    "d",
    "e",
  ];
  const values = shuffle([
    correct,
    ...shuffle(wrong).slice(0, 4),
  ]);
  const choices = values.map(
    (text, index) => ({
      key: keys[index],
      text,
    })
  );

  return {
    prompt,
    inputMode:
      "multiple-choice",
    choices,
    answer:
      choices.find(
        (choice) =>
          choice.text === correct
      )?.key,
    solution,
  };
}

function flattenBankGenerators() {
  const records = [];

  for (const course of
    EXAM_COURSES) {
    for (const unit of
      course.units) {
      for (const subunit of
        unit.subs) {
        for (const generator of
          subunit.gens) {
          records.push({
            generator,
            bankCourseId:
              course.id,
            courseId:
              BANK_COURSE_IDS[
                course.id
              ],
            courseLabel:
              course.label,
            unitId: unit.id,
            unitLabel:
              unit.label,
            subunitId:
              subunit.id,
            subunitLabel:
              subunit.label,
          });
        }
      }
    }
  }

  return records;
}

const BANK_GENERATORS =
  flattenBankGenerators();
const BANK_GENERATOR_BY_ID =
  new Map(
    BANK_GENERATORS.map(
      (record) => [
        record.generator.id,
        record,
      ]
    )
  );

/*
 * 첨부 분석 문서에 등장하는 실제 수학 세부 유형 전체입니다.
 * "수식 중심·수동 검토 필요"는 유형이 아니라 원문 자동 분류의
 * 보류 표기이므로 출제 후보에서 제외합니다.
 */
const HISTORICAL_TYPE_CATALOG = {
  "inductive-reasoning": {
    label:
      "귀납적 정의·조건 추론",
    courseId: "algebra",
    generatorIds: [
      "alg-recur-linear",
      "alg-recur-parity",
    ],
  },
  "area-between-graphs": {
    label: "그래프 사이의 넓이",
    courseId: "calculus-1",
    generatorIds: [
      "cal-area-xaxis",
      "cal-area-twocurves",
    ],
  },
  "extrema-parameter": {
    label:
      "극값·증감·미정계수",
    courseId: "calculus-1",
    generatorIds: [
      "cal-ext-inverse",
      "cal-ext-value",
      "cal-ext-threeroots",
    ],
  },
  "derivative-calculation": {
    label:
      "도함수·미분계수 계산",
    courseId: "calculus-1",
    generatorIds: [
      "cal-deriv-def",
      "cal-deriv-product",
    ],
  },
  "geometric-sequence": {
    label: "등비수열의 항·공비",
    courseId: "algebra",
    generatorIds: [
      "alg-geom-term",
      "alg-geom-blocksum",
    ],
  },
  "arithmetic-sequence": {
    label: "등차수열의 항·공차",
    courseId: "algebra",
    generatorIds: [
      "alg-arith-term",
      "alg-arith-maxsum",
      "alg-arith-snformula",
    ],
  },
  "repeated-process-probability": {
    label:
      "반복 시행·과정 확률",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-prob-atleast",
      "ps-cond-bayes",
      "ps-indep-repeat",
    ],
  },
  "trigonometric-relation": {
    label:
      "삼각함수 값·관계식",
    courseId: "algebra",
    generatorIds: [
      "alg-trig-sincos",
      "alg-trig-tan",
    ],
  },
  "trigonometric-graph": {
    label:
      "삼각함수 그래프·방정식",
    courseId: "algebra",
    generatorIds: [
      "alg-trig-graph",
      "alg-trig-tan",
    ],
  },
  "triangle-measure": {
    label:
      "삼각형의 변·각·넓이",
    courseId: "algebra",
    generatorIds: [
      "alg-law-cos",
      "alg-law-sin",
      "alg-law-area",
    ],
  },
  "motion-derivative": {
    label: "속도·가속도·위치",
    courseId: "calculus-1",
    generatorIds: [
      "cal-app-motion",
      "cal-area-velocity",
    ],
  },
  "sequence-general-term": {
    label: "수열의 조건·일반항",
    courseId: "algebra",
    generatorIds: [
      "alg-arith-term",
      "alg-geom-term",
      "alg-recur-linear",
    ],
  },
  "sequence-sigma": {
    label: "수열의 합·시그마",
    courseId: "algebra",
    generatorIds: [
      "alg-sigma-formula",
      "alg-sigma-sqrt",
      "alg-sigma-partial",
    ],
  },
  "direct-counting": {
    label:
      "순열·조합의 직접 계산",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-perm-oddnat",
      "ps-hcomb-lowerbound",
      "ps-hcomb-inequality",
    ],
  },
  "continuity-parameter": {
    label: "연속 조건·미정계수",
    courseId: "calculus-1",
    generatorIds: [
      "cal-cont-removable",
      "cal-cont-piecewise",
    ],
  },
  "binomial-mean-variance": {
    label:
      "이항분포의 평균·분산",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-binorm-inverse",
    ],
  },
  "integral-defined-function": {
    label:
      "적분으로 정의된 함수·조건 추론",
    courseId: "calculus-1",
    generatorIds: [
      "cal-def-inverse",
      "cal-def-symmetry",
    ],
  },
  "tangent-derivative": {
    label: "접선·미분계수",
    courseId: "calculus-1",
    generatorIds: [
      "cal-tan-intercept",
      "cal-tan-point",
    ],
  },
  "normal-sampling": {
    label: "정규분포·표본추정",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-binorm-normal",
      "ps-sample-dist",
      "ps-sample-cin",
    ],
  },
  "integral-calculation": {
    label:
      "정적분·부정적분 계산",
    courseId: "calculus-1",
    generatorIds: [
      "cal-anti-value",
      "cal-def-basic",
      "cal-def-symmetry",
    ],
  },
  "constrained-counting": {
    label: "조건 있는 배열·조합",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-perm-endsA",
      "ps-hcomb-lowerbound",
      "ps-hcomb-inequality",
    ],
  },
  "exponent-log-calculation": {
    label: "지수·로그 계산",
    courseId: "algebra",
    generatorIds: [
      "alg-radical-value",
      "alg-radical-nested",
      "alg-log-chain",
      "alg-log-linear",
      "alg-log-digits",
    ],
  },
  "exponent-log-graph": {
    label:
      "지수·로그 그래프·교점",
    courseId: "algebra",
    generatorIds: [
      "alg-graph-shift",
      "alg-graph-inverse",
      "alg-graph-expmax",
    ],
  },
  "exponent-log-domain": {
    label:
      "지수·로그 방정식·정의조건",
    courseId: "algebra",
    generatorIds: [
      "alg-eq-expquad",
      "alg-eq-logquad",
      "alg-eq-expineq",
    ],
  },
  "sample-space-probability": {
    label:
      "표본공간·사건의 확률",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-prob-atleast",
      "ps-prob-addition",
    ],
  },
  "function-graph-reading": {
    label:
      "함수 조건·그래프 해석",
    courseId: "calculus-1",
    generatorIds: [
      "cal-ext-value",
      "cal-app-rootcount",
    ],
  },
  "limit-calculation": {
    label: "함수의 극한 계산",
    courseId: "calculus-1",
    generatorIds: [
      "cal-lim-factor",
      "cal-lim-sqrt",
      "cal-lim-inverse",
    ],
  },
  "random-variable-moments": {
    label:
      "확률분포의 평균·분산",
    courseId:
      "probability-statistics",
    generatorIds: [
      "ps-rv-linear",
      "ps-rv-table",
    ],
  },
};

const CUSTOM_TYPE_GENERATORS = {
  "duplicate-even-arrangement"() {
    const digitCount = pick([
      4,
      5,
      6,
    ]);
    const places = pick([3, 4]);
    const evenCount =
      Math.floor(digitCount / 2);
    const answer =
      digitCount **
        (places - 1) *
      evenCount;

    return multipleChoice(
      `숫자 ${Array.from(
        { length: digitCount },
        (_, index) => index + 1
      ).join(", ")}을 중복을 허용하여 ${places}자리 자연수를 만들 때, 짝수인 자연수의 개수를 구하시오.`,
      answer,
      [
        answer - evenCount,
        answer + evenCount,
        digitCount ** places,
        evenCount ** places,
        digitCount *
          evenCount *
          (places - 1),
      ],
      `마지막 자리는 ${evenCount}가지이고 나머지 ${places - 1}자리는 각각 ${digitCount}가지이므로 ${math(`${digitCount}^{${places - 1}}\\times ${evenCount}=${answer}`)}입니다.`
    );
  },

  "sample-proportion-standard-deviation"() {
    const setting = pick([
      {
        p: 0.5,
        n: 100,
        answer: 0.05,
      },
      {
        p: 0.36,
        n: 144,
        answer: 0.04,
      },
      {
        p: 0.64,
        n: 144,
        answer: 0.04,
      },
      {
        p: 0.75,
        n: 300,
        answer: 0.025,
      },
    ]);

    return multipleChoice(
      `모비율이 ${setting.p}인 모집단에서 크기 ${setting.n}인 표본을 임의추출하였다. 표본비율의 표준편차를 구하시오.`,
      setting.answer,
      [
        setting.answer * 2,
        setting.answer / 2,
        setting.answer + 0.01,
        Math.sqrt(
          setting.p *
            (1 - setting.p)
        ).toFixed(3),
        (
          setting.p *
          (1 - setting.p) /
          setting.n
        ).toFixed(4),
      ],
      `표본비율의 표준편차는 ${math(`\\sqrt{\\dfrac{p(1-p)}{n}}`)}이므로 ${setting.answer}입니다.`
    );
  },

  "exponential-absolute-graph"() {
    const base = pick([2, 3, 4]);
    const shift =
      randomInteger(-3, 3);
    const vertical =
      randomInteger(-4, 4);
    const answer = vertical + 1;

    return multipleChoice(
      `함수 ${math(`f(x)=${base}^{|${shiftedX(shift)}|}${vertical >= 0 ? "+" : ""}${vertical}`)}의 최솟값을 구하시오.`,
      answer,
      [
        vertical,
        answer + 1,
        answer - 1,
        base + vertical,
        base ** Math.abs(shift) +
          vertical,
      ],
      `${math(`|${shiftedX(shift)}|`)}의 최솟값은 0이고 그때 지수항은 1이므로 최솟값은 ${answer}입니다.`
    );
  },

  "card-parity-probability"() {
    const cards = shuffle([
      1,
      2,
      3,
      4,
      5,
      6,
    ]).slice(0, pick([4, 5]));
    const evenCount = cards.filter(
      (value) => value % 2 === 0
    ).length;
    const answer = fraction(
      evenCount,
      cards.length
    );

    return multipleChoice(
      `서로 다른 숫자 카드 ${cards.join(", ")} 중 한 장을 임의로 뽑을 때, 적힌 수가 짝수일 확률을 구하시오.`,
      answer,
      [
        fraction(
          cards.length -
            evenCount,
          cards.length
        ),
        fraction(
          evenCount,
          cards.length + 1
        ),
        fraction(
          Math.max(
            1,
            evenCount - 1
          ),
          cards.length
        ),
        fraction(
          evenCount + 1,
          cards.length
        ),
        String(evenCount),
      ],
      `전체 ${cards.length}장 중 짝수 카드가 ${evenCount}장이므로 확률은 ${answer}입니다.`
    );
  },

  "trigonometric-extrema"() {
    const amplitude = pick([
      2,
      3,
      4,
      5,
    ]);
    const vertical =
      randomInteger(-3, 3);
    const maximum =
      vertical + amplitude;

    return multipleChoice(
      `함수 ${math(`f(x)=${amplitude}\\sin ${pick([2, 3])}x${vertical >= 0 ? "+" : ""}${vertical}`)}의 최댓값을 구하시오.`,
      maximum,
      [
        vertical - amplitude,
        vertical,
        amplitude,
        maximum + 1,
        maximum - 1,
      ],
      `${math(`-1\\leq\\sin x\\leq1`)}이므로 최댓값은 ${math(`${amplitude}+${vertical}=${maximum}`)}입니다.`
    );
  },

  "polynomial-limit-existence"() {
    const root = randomInteger(
      -4,
      4
    );
    let other = randomInteger(
      -5,
      5
    );

    if (other === root) {
      other += 2;
    }

    const coefficient =
      -(root + other);

    return multipleChoice(
      `${math(`\\lim_{x\\to ${root}}\\dfrac{x^2+ax+${root * other}}{${shiftedX(root)}}`)}가 유한한 값으로 존재하도록 하는 상수 ${math("a")}를 구하시오.`,
      coefficient,
      [
        -coefficient,
        coefficient - 1,
        coefficient + 1,
        root + other,
        root * other,
      ],
      `분자가 ${math(`(${shiftedX(root)})(${shiftedX(other)})`)}로 인수분해되어야 하므로 ${math(`a=-(${root}+${other})=${coefficient}`)}입니다.`
    );
  },

  "absolute-definite-integral"() {
    const end = pick([4, 6, 8]);
    const split = pick(
      Array.from(
        { length: end - 1 },
        (_, index) => index + 1
      )
    );
    const numerator =
      split ** 2 +
      (end - split) ** 2;
    const answer = fraction(
      numerator,
      2
    );

    return multipleChoice(
      `${math(`\\int_0^{${end}}|x-${split}|\\,dx`)}의 값을 구하시오.`,
      answer,
      [
        fraction(
          numerator + 2,
          2
        ),
        fraction(
          numerator - 2,
          2
        ),
        split * (end - split),
        end ** 2 / 2,
        end + split,
      ],
      `${math(`x=${split}`)}에서 구간을 나누면 두 삼각형의 넓이 합이므로 ${math(`\\dfrac{${split}^2+${end - split}^2}{2}=${answer}`)}입니다.`
    );
  },

  "identical-card-arrangement"() {
    const firstCount = pick([
      2,
      3,
      4,
    ]);
    const secondCount = pick([
      2,
      3,
    ]);
    const total =
      firstCount + secondCount;
    const answer =
      2 *
      factorial(total - 2) /
      (
        factorial(
          firstCount - 1
        ) *
        factorial(
          secondCount - 1
        )
      );

    return shortAnswer(
      `서로 같은 A 카드 ${firstCount}장과 서로 같은 B 카드 ${secondCount}장을 일렬로 놓을 때, 양 끝의 문자가 서로 다른 배열의 수를 구하시오.`,
      answer,
      `양 끝을 A, B 또는 B, A로 정한 뒤 가운데를 배열하면 ${math(`2\\times\\dfrac{${total - 2}!}{${firstCount - 1}!${secondCount - 1}!}=${answer}`)}입니다.`
    );
  },

  "recover-function-value"() {
    const a = pick([1, 2, 3]);
    const b = randomInteger(
      -4,
      4
    );
    const constant =
      randomInteger(-5, 5);
    const knownX =
      randomInteger(-2, 2);
    let targetX =
      randomInteger(2, 5);

    if (targetX === knownX) {
      targetX += 1;
    }

    const valueAt = (x) =>
      a * x ** 2 +
      b * x +
      constant;
    const knownValue =
      valueAt(knownX);
    const answer =
      valueAt(targetX);

    return shortAnswer(
      `다항함수 ${math("f(x)")}가 ${math(`f'(x)=${2 * a}x${b >= 0 ? "+" : ""}${b}`)}, ${math(`f(${knownX})=${knownValue}`)}를 만족할 때 ${math(`f(${targetX})`)}의 값을 구하시오.`,
      answer,
      `적분하면 ${math(`f(x)=${a}x^2${b >= 0 ? "+" : ""}${b}x+C`)}이고 주어진 함수값에서 ${math(`C=${constant}`)}입니다. 따라서 답은 ${answer}입니다.`
    );
  },

  "alternating-sequence-sum"() {
    const oddSum =
      randomInteger(8, 30);
    const evenSum =
      randomInteger(8, 30);
    const answer =
      oddSum - evenSum;

    return shortAnswer(
      `${math(`\\sum_{k=1}^{n}a_{2k-1}=${oddSum}`)}, ${math(`\\sum_{k=1}^{n}a_{2k}=${evenSum}`)}일 때 ${math(`\\sum_{k=1}^{2n}(-1)^{k+1}a_k`)}의 값을 구하시오.`,
      answer,
      `교대합은 홀수 번째 항의 합에서 짝수 번째 항의 합을 뺀 값이므로 ${math(`${oddSum}-${evenSum}=${answer}`)}입니다.`
    );
  },

  "cubic-local-extrema"() {
    const distance = pick([
      1,
      2,
      3,
    ]);
    const constant =
      randomInteger(-5, 5);
    const answer =
      4 * distance ** 3;

    return shortAnswer(
      `함수 ${math(`f(x)=x^3-${3 * distance ** 2}x${constant >= 0 ? "+" : ""}${constant}`)}의 극댓값과 극솟값의 차를 구하시오.`,
      answer,
      `${math(`f'(x)=3(x-${distance})(x+${distance})`)}이므로 극대는 ${math(`x=-${distance}`)}, 극소는 ${math(`x=${distance}`)}에서 생기며 두 극값의 차는 ${math(`4\\times${distance}^3=${answer}`)}입니다.`
    );
  },

  "log-arithmetic-area"() {
    const base = pick([2, 3, 5]);
    const first =
      randomInteger(1, 4);
    const difference =
      randomInteger(1, 3);
    const index = pick([3, 4, 5]);
    const last =
      first +
      (index - 1) *
        difference;
    const twiceArea = Math.abs(
      last - index * first
    );
    const answer = fraction(
      twiceArea,
      2
    );

    return shortAnswer(
      `${math(`a_n=\\log_{${base}}(${base}^{${first}+(n-1)${difference}})`)}라 하자. 좌표평면의 세 점 ${math(`O(0,0),\\ A(1,a_1),\\ B(${index},a_${index})`)}가 이루는 삼각형의 넓이를 구하시오.`,
      answer,
      `${math(`a_n=${first}+(n-1)${difference}`)}이므로 ${math(`A(1,${first}),\\ B(${index},${last})`)}입니다. 행렬식으로 넓이는 ${math(`\\dfrac{|${last}-${index}\\times${first}|}{2}=${answer}`)}입니다.`
    );
  },

  "translated-absolute-continuity"() {
    const center =
      randomInteger(-3, 3);
    const vertical =
      randomInteger(-3, 4);
    const shift =
      randomInteger(-2, 2);
    const boundary =
      randomInteger(-2, 3);
    const slope = pick([
      -2,
      -1,
      1,
      2,
    ]);
    const leftValue =
      Math.abs(
        boundary -
          shift -
          center
      ) + vertical;
    const answer =
      leftValue -
      slope * boundary;

    return shortAnswer(
      `${math(`f(x)=|${shiftedX(center)}|${vertical >= 0 ? "+" : ""}${vertical}`)}이고 ${math(`g(x)=\\begin{cases}f(${shiftedX(shift)})&(x<${boundary})\\\\${slope}x+k&(x\\geq${boundary})\\end{cases}`)}이다. 함수 ${math("g")}가 실수 전체에서 연속이 되도록 하는 ${math("k")}를 구하시오.`,
      answer,
      `${math(`x=${boundary}`)}에서 좌극한은 ${math(`f(${boundary - shift})=${leftValue}`)}이고 함수값은 ${math(`${slope * boundary}+k`)}입니다. 두 값을 같게 하면 ${math(`k=${answer}`)}입니다.`
    );
  },

  "repeated-conditional-probability"() {
    const trials = pick([4, 5, 6]);
    const successes = pick(
      Array.from(
        {
          length:
            trials - 1,
        },
        (_, index) => index + 1
      )
    );
    const answer = fraction(
      choose(
        trials,
        successes
      ),
      2 ** trials - 1
    );

    return shortAnswer(
      `한 개의 동전을 ${trials}번 던졌다. 앞면이 한 번 이상 나왔다는 조건에서 앞면이 정확히 ${successes}번 나왔을 확률을 구하시오.`,
      answer,
      `조건을 만족하는 전체 결과는 ${math(`2^{${trials}}-1`)}가지이고, 앞면이 정확히 ${successes}번인 결과는 ${math(`\\binom{${trials}}{${successes}}`)}가지이므로 확률은 ${answer}입니다.`
    );
  },

  "piecewise-exponential-log-intersection"() {
    const base = pick([2, 3]);
    const exponent =
      randomInteger(1, 2);
    const lineHeight =
      base ** exponent;
    const logValue = pick([2, 3]);
    const boundary =
      exponent + 1;
    const vertical =
      lineHeight - logValue;
    const secondX =
      base ** logValue;
    const answer =
      exponent + secondX;

    return shortAnswer(
      `${math(`f(x)=\\begin{cases}${base}^x&(x\\leq${boundary})\\\\\\log_{${base}}x${vertical >= 0 ? "+" : ""}${vertical}&(x>${boundary})\\end{cases}`)}의 그래프와 직선 ${math(`y=${lineHeight}`)}의 두 교점의 ${math("x")}좌표의 합을 구하시오.`,
      answer,
      `첫 구간에서는 ${math(`${base}^x=${lineHeight}`)}이므로 ${math(`x=${exponent}`)}입니다. 둘째 구간에서는 ${math(`\\log_{${base}}x=${logValue}`)}이므로 ${math(`x=${secondX}`)}입니다. 합은 ${answer}입니다.`
    );
  },
};

function customType(
  key,
  label,
  courseId,
  source
) {
  return {
    key,
    label,
    courseId,
    customGenerator:
      CUSTOM_TYPE_GENERATORS[key],
    source,
  };
}

const TARGET_TYPE_CATALOG = {
  "radical-laws":
    HISTORICAL_TYPE_CATALOG[
      "exponent-log-calculation"
    ],
  "limit-continuity":
    HISTORICAL_TYPE_CATALOG[
      "limit-calculation"
    ],
  "duplicate-even-arrangement":
    customType(
      "duplicate-even-arrangement",
      "중복 허용 배열과 짝수 조건",
      "probability-statistics",
      {
        unitId: "counting",
        subunitId: "perm",
        conceptId:
          "probability-statistics-01-01",
      }
    ),
  "geometric-sequence":
    HISTORICAL_TYPE_CATALOG[
      "geometric-sequence"
    ],
  derivative:
    HISTORICAL_TYPE_CATALOG[
      "derivative-calculation"
    ],
  "sample-proportion-standard-deviation":
    customType(
      "sample-proportion-standard-deviation",
      "표본비율의 표준편차",
      "probability-statistics",
      {
        unitId: "statistics",
        subunitId: "sample",
        conceptId:
          "probability-statistics-03-03",
      }
    ),
  "radian-sector": {
    label: "호도법·부채꼴",
    courseId: "algebra",
    generatorIds: [
      "alg-sector-max",
      "alg-sector-inverse",
    ],
  },
  "definite-integral":
    HISTORICAL_TYPE_CATALOG[
      "integral-calculation"
    ],
  "union-probability":
    HISTORICAL_TYPE_CATALOG[
      "sample-space-probability"
    ],
  "exponential-absolute-graph":
    customType(
      "exponential-absolute-graph",
      "지수함수·절댓값 그래프",
      "algebra",
      {
        unitId:
          "exponential-logarithmic-functions",
        subunitId: "graph",
        conceptId:
          "algebra-01-06",
      }
    ),
  tangent:
    HISTORICAL_TYPE_CATALOG[
      "tangent-derivative"
    ],
  "card-parity-probability":
    customType(
      "card-parity-probability",
      "카드 배열과 홀짝 확률",
      "probability-statistics",
      {
        unitId: "probability",
        subunitId: "prob",
        conceptId:
          "probability-statistics-02-01",
      }
    ),
  "normal-distribution":
    HISTORICAL_TYPE_CATALOG[
      "normal-sampling"
    ],
  "conditional-sequence":
    HISTORICAL_TYPE_CATALOG[
      "inductive-reasoning"
    ],
  motion:
    HISTORICAL_TYPE_CATALOG[
      "motion-derivative"
    ],
  "trigonometric-extrema":
    customType(
      "trigonometric-extrema",
      "삼각함수의 최댓값·최솟값",
      "algebra",
      {
        unitId:
          "trigonometric-functions",
        subunitId: "trigfun",
        conceptId:
          "algebra-02-02",
      }
    ),
  "curve-line-area":
    HISTORICAL_TYPE_CATALOG[
      "area-between-graphs"
    ],
  "polynomial-limit-existence":
    customType(
      "polynomial-limit-existence",
      "다항함수와 극한 존재",
      "calculus-1",
      {
        unitId:
          "limits-and-continuity",
        subunitId: "lim",
        conceptId:
          "calculus-1-01-02",
      }
    ),
  "triangle-circle-trigonometry":
    HISTORICAL_TYPE_CATALOG[
      "triangle-measure"
    ],
  "absolute-definite-integral":
    customType(
      "absolute-definite-integral",
      "절댓값 정적분",
      "calculus-1",
      {
        unitId: "integration",
        subunitId: "defint",
        conceptId:
          "calculus-1-03-03",
      }
    ),
  "identical-card-arrangement":
    customType(
      "identical-card-arrangement",
      "같은 것이 있는 카드 배열",
      "probability-statistics",
      {
        unitId: "counting",
        subunitId: "perm",
        conceptId:
          "probability-statistics-01-01",
      }
    ),
  "log-domain":
    HISTORICAL_TYPE_CATALOG[
      "exponent-log-domain"
    ],
  "recover-function-value":
    customType(
      "recover-function-value",
      "도함수에서 함수값 복원",
      "calculus-1",
      {
        unitId:
          "differentiation",
        subunitId: "deriv",
        conceptId:
          "calculus-1-02-04",
      }
    ),
  "alternating-sequence-sum":
    customType(
      "alternating-sequence-sum",
      "수열의 합·교대합",
      "algebra",
      {
        unitId: "sequences",
        subunitId: "sigma",
        conceptId:
          "algebra-03-05",
      }
    ),
  "cubic-local-extrema":
    customType(
      "cubic-local-extrema",
      "삼차함수의 극대·극소",
      "calculus-1",
      {
        unitId:
          "differentiation",
        subunitId: "extrema",
        conceptId:
          "calculus-1-02-06",
      }
    ),
  "discrete-random-variable":
    HISTORICAL_TYPE_CATALOG[
      "random-variable-moments"
    ],
  "log-arithmetic-area":
    customType(
      "log-arithmetic-area",
      "로그·등차수열·넓이",
      "algebra",
      {
        unitId: "sequences",
        subunitId: "arith",
        conceptId:
          "algebra-03-02",
      }
    ),
  "translated-absolute-continuity":
    customType(
      "translated-absolute-continuity",
      "평행이동·절댓값·연속",
      "calculus-1",
      {
        unitId:
          "limits-and-continuity",
        subunitId: "cont",
        conceptId:
          "calculus-1-01-04",
      }
    ),
  "repeated-conditional-probability":
    customType(
      "repeated-conditional-probability",
      "반복 추출의 조건부확률",
      "probability-statistics",
      {
        unitId: "probability",
        subunitId: "cond",
        conceptId:
          "probability-statistics-02-03",
      }
    ),
  "piecewise-exponential-log-intersection":
    customType(
      "piecewise-exponential-log-intersection",
      "지수·로그 조각함수의 교점",
      "algebra",
      {
        unitId:
          "exponential-logarithmic-functions",
        subunitId: "graph",
        conceptId:
          "algebra-01-07",
      }
    ),
};

const H = (
  typeKey,
  weight
) => ({
  typeKey,
  weight,
});

const ADVANCED_TYPE_WEIGHTS_BY_NUMBER =
  new Map([
    [
      20,
      {
        "semi-absolute-graph-area":
          20,
        "semi-tangent-area": 20,
        "semi-extrema-chord-area":
          20,
        "semi-velocity-turning-distance":
          20,
        "semi-integral-differentiability":
          20,
      },
    ],
    [
      21,
      {
        "semi-repeated-arrangement":
          20,
        "semi-conditional-selection":
          20,
        "semi-random-variable-moment":
          20,
        "semi-bayes-two-boxes":
          20,
        "semi-endpoint-gap-selection":
          20,
      },
    ],
    [
      28,
      {
        "killer-divisor-map": 20,
        "killer-subset-condition":
          20,
        "killer-surjective-condition":
          20,
        "killer-lattice-return-condition":
          20,
        "killer-bounded-distribution":
          20,
      },
    ],
    [
      30,
      {
        "killer-tangent-integral-extrema":
          20,
        "killer-tangent-area-equation":
          20,
        "killer-distance-inverse":
          20,
        "killer-extrema-chord-equation":
          20,
        "killer-integral-tangent-equation":
          20,
      },
    ],
  ]);

/*
 * historicalWeights는 첨부 문서의 공식 39회 번호별 세부 유형
 * 비율을 그대로 보존합니다. 실제 추첨 때에는 fixedCourseId와
 * 다른 과목 유형 및 자동 분류 보류 항목을 제거합니다. 같은 과목의
 * 공개 비율은 그대로 두고, 비는 확률은 2028 평가원 예시 기준형과
 * 같은 과목·난이도 구간의 공식 유형에 나누어 배정합니다.
 */
const PLACEMENT_QUESTION_BLUEPRINTS = [
  [1, "algebra", "radical-laws", [H("exponent-log-calculation", 100)]],
  [2, "calculus-1", "limit-continuity", [H("limit-calculation", 64.1), H("derivative-calculation", 15.4), H("integral-calculation", 5.1), H("arithmetic-sequence", 5.1), H("geometric-sequence", 5.1)]],
  [3, "probability-statistics", "duplicate-even-arrangement", [H("geometric-sequence", 28.2), H("trigonometric-relation", 25.6), H("arithmetic-sequence", 10.3), H("sequence-general-term", 10.3), H("sequence-sigma", 7.7)]],
  [4, "algebra", "geometric-sequence", [H("limit-calculation", 46.2), H("continuity-parameter", 30.8), H("integral-calculation", 5.1), H("derivative-calculation", 5.1), H("sequence-sigma", 2.6)]],
  [5, "calculus-1", "derivative", [H("derivative-calculation", 48.7), H("trigonometric-relation", 15.4), H("continuity-parameter", 7.7), H("geometric-sequence", 5.1)]],
  [6, "probability-statistics", "sample-proportion-standard-deviation", [H("trigonometric-relation", 35.9), H("extrema-parameter", 10.3), H("exponent-log-calculation", 10.3), H("continuity-parameter", 7.7), H("trigonometric-graph", 7.7)]],
  [7, "algebra", "radian-sector", [H("extrema-parameter", 17.9), H("derivative-calculation", 12.8), H("sequence-sigma", 12.8), H("area-between-graphs", 12.8), H("tangent-derivative", 10.3)]],
  [8, "calculus-1", "definite-integral", [H("trigonometric-relation", 12.8), H("exponent-log-calculation", 12.8), H("derivative-calculation", 10.3), H("function-graph-reading", 7.7), H("area-between-graphs", 5.1)]],
  [9, "probability-statistics", "union-probability", [H("integral-defined-function", 20.5), H("function-graph-reading", 12.8), H("motion-derivative", 12.8), H("inductive-reasoning", 10.3)]],
  [10, "algebra", "exponential-absolute-graph", [H("motion-derivative", 17.9), H("exponent-log-graph", 12.8), H("trigonometric-graph", 10.3), H("triangle-measure", 7.7)]],
  [11, "calculus-1", "tangent", [H("motion-derivative", 28.2), H("integral-defined-function", 10.3), H("sequence-sigma", 10.3), H("trigonometric-graph", 7.7), H("exponent-log-graph", 7.7)]],
  [12, "probability-statistics", "card-parity-probability", [H("inductive-reasoning", 20.5), H("area-between-graphs", 17.9), H("sequence-sigma", 10.3), H("continuity-parameter", 7.7), H("limit-calculation", 7.7)]],
  [13, "probability-statistics", "normal-distribution", [H("area-between-graphs", 28.2), H("triangle-measure", 20.5), H("function-graph-reading", 17.9), H("inductive-reasoning", 7.7)]],
  [14, "algebra", "conditional-sequence", [H("triangle-measure", 15.4), H("integral-defined-function", 12.8), H("function-graph-reading", 12.8), H("motion-derivative", 7.7)]],
  [15, "calculus-1", "motion", [H("inductive-reasoning", 38.5), H("integral-defined-function", 17.9), H("triangle-measure", 10.3), H("constrained-counting", 7.7), H("derivative-calculation", 5.1)]],
  [16, "algebra", "trigonometric-extrema", [H("exponent-log-domain", 41), H("exponent-log-calculation", 20.5), H("inductive-reasoning", 10.3), H("derivative-calculation", 7.7)]],
  [17, "calculus-1", "curve-line-area", [H("derivative-calculation", 53.8), H("integral-calculation", 7.7), H("integral-defined-function", 7.7), H("extrema-parameter", 5.1), H("function-graph-reading", 5.1)]],
  [18, "calculus-1", "polynomial-limit-existence", [H("sequence-sigma", 35.9), H("derivative-calculation", 7.7), H("extrema-parameter", 5.1), H("integral-defined-function", 5.1)]],
  [19, "algebra", "triangle-circle-trigonometry", [H("extrema-parameter", 23.1), H("motion-derivative", 15.4), H("tangent-derivative", 10.3), H("trigonometric-relation", 7.7)]],
  [20, "calculus-1", "absolute-definite-integral", [H("integral-defined-function", 20.5), H("function-graph-reading", 10.3), H("inductive-reasoning", 10.3), H("area-between-graphs", 7.7), H("triangle-measure", 7.7)]],
  [21, "probability-statistics", "identical-card-arrangement", [H("inductive-reasoning", 12.8), H("exponent-log-graph", 12.8), H("triangle-measure", 10.3), H("function-graph-reading", 10.3), H("exponent-log-domain", 10.3)]],
  [22, "algebra", "log-domain", [H("derivative-calculation", 23.1), H("inductive-reasoning", 17.9), H("integral-defined-function", 15.4), H("exponent-log-graph", 12.8), H("function-graph-reading", 7.7)]],
  [23, "calculus-1", "recover-function-value", [H("direct-counting", 71.8), H("binomial-mean-variance", 10.3), H("sample-space-probability", 10.3), H("constrained-counting", 5.1), H("normal-sampling", 2.6)]],
  [24, "algebra", "alternating-sequence-sum", [H("sample-space-probability", 53.8), H("direct-counting", 30.8), H("constrained-counting", 7.7), H("binomial-mean-variance", 5.1)]],
  [25, "calculus-1", "cubic-local-extrema", [H("constrained-counting", 30.8), H("sample-space-probability", 28.2), H("direct-counting", 15.4), H("random-variable-moments", 10.3)]],
  [26, "probability-statistics", "discrete-random-variable", [H("constrained-counting", 23.1), H("normal-sampling", 20.5), H("sample-space-probability", 15.4), H("direct-counting", 15.4), H("repeated-process-probability", 12.8)]],
  [27, "algebra", "log-arithmetic-area", [H("constrained-counting", 35.9), H("random-variable-moments", 15.4), H("normal-sampling", 12.8), H("direct-counting", 7.7)]],
  [28, "probability-statistics", "killer-divisor-map", [H("constrained-counting", 35.9), H("repeated-process-probability", 23.1), H("sample-space-probability", 12.8), H("normal-sampling", 12.8), H("direct-counting", 7.7)]],
  [29, "probability-statistics", "repeated-conditional-probability", [H("constrained-counting", 41), H("normal-sampling", 15.4), H("random-variable-moments", 12.8), H("repeated-process-probability", 12.8)]],
  [30, "calculus-1", "killer-tangent-integral-extrema", [H("constrained-counting", 48.7), H("repeated-process-probability", 25.6), H("sample-space-probability", 10.3), H("random-variable-moments", 2.6)]],
].map(
  ([
    number,
    fixedCourseId,
    targetTypeKey,
    historicalWeights,
  ]) => ({
    number,
    fixedCourseId,
    targetTypeKey,
    historicalWeights,
    advancedTypeWeights:
      ADVANCED_TYPE_WEIGHTS_BY_NUMBER.get(
        number
      ) || null,
    points:
      number <= 20 ? 3 : 4,
    difficulty:
      number <= 14
        ? "mid-high"
        : number <= 22
          ? "applied"
          : "advanced",
    placementCategory:
      ADVANCED_CATEGORY_BY_NUMBER.get(
        number
      ) ||
      (
        number <= 14
          ? "general"
          : "advanced"
      ),
  })
);

const COURSE_FALLBACK_TYPES = {
  algebra: {
    general: [
      "exponent-log-calculation",
      "geometric-sequence",
      "arithmetic-sequence",
      "trigonometric-relation",
      "sequence-sigma",
      "exponent-log-graph",
      "triangle-measure",
    ],
    applied: [
      "exponent-log-domain",
      "inductive-reasoning",
      "exponent-log-graph",
      "triangle-measure",
      "trigonometric-graph",
      "sequence-sigma",
    ],
    advanced: [
      "inductive-reasoning",
      "sequence-sigma",
      "exponent-log-domain",
      "exponent-log-graph",
      "triangle-measure",
    ],
  },
  "calculus-1": {
    general: [
      "limit-calculation",
      "derivative-calculation",
      "continuity-parameter",
      "integral-calculation",
      "tangent-derivative",
      "motion-derivative",
    ],
    applied: [
      "derivative-calculation",
      "extrema-parameter",
      "integral-defined-function",
      "area-between-graphs",
      "function-graph-reading",
      "tangent-derivative",
      "motion-derivative",
    ],
    advanced: [
      "extrema-parameter",
      "integral-defined-function",
      "area-between-graphs",
      "function-graph-reading",
      "tangent-derivative",
      "continuity-parameter",
    ],
  },
  "probability-statistics": {
    general: [
      "direct-counting",
      "sample-space-probability",
      "binomial-mean-variance",
      "normal-sampling",
      "random-variable-moments",
      "repeated-process-probability",
    ],
    applied: [
      "constrained-counting",
      "repeated-process-probability",
      "normal-sampling",
      "random-variable-moments",
      "sample-space-probability",
      "direct-counting",
    ],
    advanced: [
      "constrained-counting",
      "repeated-process-probability",
      "normal-sampling",
      "random-variable-moments",
      "direct-counting",
    ],
  },
};

function blueprintBand(
  blueprint
) {
  if (
    blueprint.placementCategory ===
      "killer" ||
    blueprint.number >= 23
  ) {
    return "advanced";
  }

  if (blueprint.number >= 15) {
    return "applied";
  }

  return "general";
}

function officialWeightAcrossNumbers(
  typeKey
) {
  return (
    PLACEMENT_QUESTION_BLUEPRINTS.reduce(
      (sum, blueprint) =>
        sum +
        blueprint.historicalWeights
          .filter(
            (record) =>
              record.typeKey ===
              typeKey
          )
          .reduce(
            (subtotal, record) =>
              subtotal +
              Number(
                record.weight
              ),
            0
          ),
      0
    ) || 1
  );
}

function weightedPick(records) {
  const total = records.reduce(
    (sum, record) =>
      sum + record.weight,
    0
  );
  let cursor =
    Math.random() * total;

  for (const record of records) {
    cursor -= record.weight;

    if (cursor <= 0) {
      return record;
    }
  }

  return records[
    records.length - 1
  ];
}

function weightedCandidateOrder(
  candidates
) {
  return candidates
    .map((candidate) => ({
      candidate,
      /*
       * 가중치가 큰 유형이 앞에 올 확률을 유지하면서도, 한 시험지 안에서는
       * 같은 유형을 두 번 배정하지 않기 위한 weighted-without-replacement 키다.
       */
      order:
        -Math.log(
          Math.max(
            Number.EPSILON,
            Math.random()
          )
        ) /
        Math.max(
          Number.EPSILON,
          Number(candidate.weight) || 0
        ),
    }))
    .sort(
      (left, right) =>
        left.order - right.order
    )
    .map(
      ({ candidate }) =>
        candidate
    );
}

function typeDefinition(
  typeKey,
  target = false
) {
  return target
    ? TARGET_TYPE_CATALOG[
        typeKey
      ]
    : HISTORICAL_TYPE_CATALOG[
        typeKey
      ];
}

function placementTypeIdentity(
  blueprint,
  candidate
) {
  if (candidate.semanticFamilyId) {
    return candidate.semanticFamilyId;
  }

  const definition =
    typeDefinition(
      candidate.typeKey,
      candidate.target
    );

  if (!definition) {
    throw new Error(
      `${blueprint.number}번 배치고사 유형 정의를 찾을 수 없습니다: ${candidate.typeKey}`
    );
  }

  return `${definition.courseId}:${definition.label}`;
}

/*
 * 표시 이름이 달라도 같은 실제 생성기를 공유하면 같은 문제 유형이다.
 * 먼저 선언된 구체 유형을 대표 의미군으로 삼아, 예를 들어
 * sequence-general-term에서 alg-arith-term이 선택되더라도
 * arithmetic-sequence와 중복 배정되지 않게 한다.
 */
const SEMANTIC_FAMILY_BY_GENERATOR_ID =
  new Map();

for (const [typeKey, definition] of
  Object.entries(
    HISTORICAL_TYPE_CATALOG
  )) {
  for (const generatorId of
    definition.generatorIds || []) {
    if (
      !SEMANTIC_FAMILY_BY_GENERATOR_ID.has(
        generatorId
      )
    ) {
      SEMANTIC_FAMILY_BY_GENERATOR_ID.set(
        generatorId,
        typeKey
      );
    }
  }
}

const CUSTOM_SEMANTIC_FAMILY_BY_TYPE_KEY =
  Object.freeze({
    "duplicate-even-arrangement":
      "direct-counting",
    "sample-proportion-standard-deviation":
      "normal-sampling",
    "exponential-absolute-graph":
      "exponent-log-graph",
    "trigonometric-extrema":
      "trigonometric-graph",
    "polynomial-limit-existence":
      "limit-calculation",
    "absolute-definite-integral":
      "integral-calculation",
    "identical-card-arrangement":
      "constrained-counting",
    "recover-function-value":
      "derivative-calculation",
    "alternating-sequence-sum":
      "sequence-sigma",
    "translated-absolute-continuity":
      "continuity-parameter",
    "card-parity-probability":
      "sample-space-probability",
    "repeated-conditional-probability":
      "repeated-process-probability",
    "cubic-local-extrema":
      "extrema-parameter",
    "piecewise-exponential-log-intersection":
      "exponent-log-graph",
  });

const ADVANCED_TYPE_BY_ID = new Map(
  Object.entries(
    PLACEMENT_ADVANCED_TYPES
  )
);

function semanticFamilyId({
  typeKey,
  generatorId,
  definition,
  advanced = false,
}) {
  if (advanced) {
    const advancedDefinition =
      ADVANCED_TYPE_BY_ID.get(
        typeKey
      );
    return `advanced:${
      advancedDefinition
        ?.similarGroupId || typeKey
    }`;
  }

  const familyKey =
    CUSTOM_SEMANTIC_FAMILY_BY_TYPE_KEY[
      typeKey
    ] ||
    SEMANTIC_FAMILY_BY_GENERATOR_ID.get(
      generatorId
    ) ||
    typeKey;
  return `${definition.courseId}:${familyKey}`;
}

function expandCandidateGenerators(
  candidates
) {
  return candidates.flatMap(
    (candidate) => {
      if (candidate.advanced) {
        const definition =
          ADVANCED_TYPE_BY_ID.get(
            candidate.typeKey
          );
        if (!definition) {
          return [];
        }
        return [
          {
            ...candidate,
            generatorId:
              candidate.typeKey,
            semanticFamilyId:
              semanticFamilyId({
                typeKey:
                  candidate.typeKey,
                generatorId:
                  candidate.typeKey,
                definition,
                advanced: true,
              }),
          },
        ];
      }

      const definition =
        typeDefinition(
          candidate.typeKey,
          candidate.target
        );
      if (!definition) {
        return [];
      }

      const generatorIds =
        typeof definition.customGenerator ===
        "function"
          ? [
              definition.key ||
                candidate.typeKey,
            ]
          : (
              definition.generatorIds ||
              []
            ).filter((generatorId) =>
              BANK_GENERATOR_BY_ID.has(
                generatorId
              )
            );
      if (!generatorIds.length) {
        return [];
      }
      const weight =
        Number(candidate.weight) /
        generatorIds.length;

      return generatorIds.map(
        (generatorId) => ({
          ...candidate,
          weight,
          generatorId,
          semanticFamilyId:
            semanticFamilyId({
              typeKey:
                candidate.typeKey,
              generatorId,
              definition,
            }),
        })
      );
    }
  );
}

function planUniquePlacementTypes() {
  const records =
    PLACEMENT_QUESTION_BLUEPRINTS.map(
      (blueprint) => ({
        blueprint,
        candidates:
          candidateTypesForBlueprint(
            blueprint
          ).map(
            (candidate) => ({
              ...candidate,
              identity:
                placementTypeIdentity(
                  blueprint,
                  candidate
                ),
            })
          ),
      })
    );
  const selectedByNumber =
    new Map();
  const usedIdentities =
    new Set();

  function assign(remaining) {
    if (!remaining.length) {
      return true;
    }

    /*
     * 남은 선택지가 가장 적은 번호부터 배정해야 후반 번호가 막히지 않는다.
     * 단순 1번부터 재추첨하면 확률적으로 마지막 번호의 후보가 모두 소진될
     * 수 있어 시험지 생성이 간헐적으로 실패한다.
     */
    const ordered = remaining
      .map((record) => ({
        record,
        available:
          record.candidates.filter(
            (candidate) =>
              !usedIdentities.has(
                candidate.identity
              )
          ),
      }))
      .sort(
        (left, right) =>
          left.available.length -
            right.available.length ||
          left.record.blueprint.number -
            right.record.blueprint.number
      );
    const current = ordered[0];

    if (!current.available.length) {
      return false;
    }

    const nextRemaining =
      remaining.filter(
        (record) =>
          record !== current.record
      );

    for (const candidate of
      weightedCandidateOrder(
        current.available
      )) {
      selectedByNumber.set(
        current.record.blueprint.number,
        candidate
      );
      usedIdentities.add(
        candidate.identity
      );

      if (assign(nextRemaining)) {
        return true;
      }

      selectedByNumber.delete(
        current.record.blueprint.number
      );
      usedIdentities.delete(
        candidate.identity
      );
    }

    return false;
  }

  if (!assign(records)) {
    throw new Error(
      "배치고사 30문항에 서로 다른 유형을 배정하지 못했습니다. 문제 유형 구성을 확인해주세요."
    );
  }

  return selectedByNumber;
}

function candidateTypesForBlueprint(
  blueprint
) {
  if (
    blueprint.advancedTypeWeights
  ) {
    return expandCandidateGenerators(
      Object.entries(
        blueprint.advancedTypeWeights
      ).map(
        ([typeKey, weight]) => ({
          typeKey,
          weight:
            Number(weight),
          target: true,
          advanced: true,
          probabilitySources: [
            "번호별 고난도 유형표",
          ],
        })
      )
    );
  }

  const eligibleHistorical =
    blueprint.historicalWeights.filter(
      (historical) =>
        typeDefinition(
          historical.typeKey
        )?.courseId ===
        blueprint.fixedCourseId
    );
  const recordedWeight =
    eligibleHistorical.reduce(
      (sum, historical) =>
        sum +
        Number(
          historical.weight
        ),
      0
    );
  const targetWeight =
    Math.max(
      0,
      PROBABILITY_TOTAL -
        Math.min(
          PROBABILITY_TOTAL,
          recordedWeight
        )
    );
  const candidatesByLabel =
    new Map();

  const addCandidate = ({
    typeKey,
    weight,
    target,
    source,
  }) => {
    if (!(weight > 0)) {
      return;
    }

    const definition =
      typeDefinition(
        typeKey,
        target
      );

    if (!definition) {
      return;
    }

    const identity =
      definition.label;
    const existing =
      candidatesByLabel.get(
        identity
      );

    if (existing) {
      existing.weight += weight;
      existing.probabilitySources.push(
        source
      );
      return;
    }

    candidatesByLabel.set(
      identity,
      {
        typeKey,
        weight,
        target,
        probabilitySources: [
          source,
        ],
      }
    );
  };

  for (const historical of
    eligibleHistorical) {
    addCandidate({
      ...historical,
      target: false,
      source:
        "번호별 공식 39회 분포",
    });
  }

  const targetShare =
    targetWeight * 0.35;
  const fallbackShare =
    targetWeight -
    targetShare;
  const fallbackPool = (
    COURSE_FALLBACK_TYPES[
      blueprint.fixedCourseId
    ]?.[
      blueprintBand(
        blueprint
      )
    ] || []
  ).filter((typeKey) => {
    const definition =
      typeDefinition(typeKey);
    const targetDefinition =
      typeDefinition(
        blueprint.targetTypeKey,
        true
      );

    return (
      definition?.courseId ===
        blueprint.fixedCourseId &&
      definition.label !==
        targetDefinition?.label &&
      !eligibleHistorical.some(
        (historical) =>
          typeDefinition(
            historical.typeKey
          )?.label ===
          definition.label
      )
    );
  });
  const fallbackWeightTotal =
    fallbackPool.reduce(
      (sum, typeKey) =>
        sum +
        officialWeightAcrossNumbers(
          typeKey
        ),
      0
    );

  addCandidate({
    typeKey:
      blueprint.targetTypeKey,
    weight:
      targetShare +
      (
        fallbackPool.length
          ? 0
          : fallbackShare
      ),
    target: true,
    source:
      "2028 평가원 예시 기준형",
  });

  for (const typeKey of
    fallbackPool) {
    addCandidate({
      typeKey,
      weight:
        fallbackShare *
        (
          officialWeightAcrossNumbers(
            typeKey
          ) /
          fallbackWeightTotal
        ),
      target: false,
      source:
        "고정 과목 내 공식 분포 보완",
    });
  }

  return expandCandidateGenerators(
    [
      ...candidatesByLabel.values(),
    ].filter(
      (candidate) =>
        candidate.weight > 0
    )
  );
}

function sourceForRecord(
  record,
  courseId
) {
  const courseMeta =
    COURSE_META[courseId];

  return {
    sourceCourseId: courseId,
    sourceUnitId:
      record?.unitId ||
      courseMeta.unitId,
    sourceSubunitId:
      record?.subunitId ||
      courseMeta.subunitId,
    sourceConceptId:
      courseMeta.conceptId,
  };
}

function generateFromDefinition(
  definition,
  courseId,
  forcedGeneratorId = ""
) {
  if (
    typeof definition
      ?.customGenerator ===
    "function"
  ) {
    return {
      problem:
        definition.customGenerator(),
      generatorId:
        definition.key,
      source: {
        sourceCourseId:
          courseId,
        sourceUnitId:
          definition.source
            ?.unitId ||
          COURSE_META[courseId]
            .unitId,
        sourceSubunitId:
          definition.source
            ?.subunitId ||
          COURSE_META[courseId]
            .subunitId,
        sourceConceptId:
          definition.source
            ?.conceptId ||
          COURSE_META[courseId]
            .conceptId,
      },
    };
  }

  const records = (
    definition?.generatorIds || []
  )
    .map((id) =>
      BANK_GENERATOR_BY_ID.get(id)
    )
    .filter(
      (record) =>
        record?.courseId ===
          courseId &&
        (
          !forcedGeneratorId ||
          record.generator.id ===
            forcedGeneratorId
        )
    );

  if (!records.length) {
    return null;
  }

  const record = pick(records);

  return {
    problem:
      record.generator.generate(),
    generatorId:
      record.generator.id,
    source: sourceForRecord(
      record,
      courseId
    ),
  };
}

function validateGeneratedProblem(
  problem
) {
  if (
    !problem ||
    typeof problem.prompt !==
      "string" ||
    !problem.prompt.trim() ||
    ![
      "multiple-choice",
      "short-answer",
    ].includes(problem.inputMode) ||
    problem.answer === undefined ||
    problem.answer === null ||
    String(problem.answer).trim() ===
      ""
  ) {
    return false;
  }

  try {
    validateCalculatorFreeProblem(
      problem,
      { id: "placement-exam" }
    );
  } catch (_error) {
    return false;
  }

  if (
    problem.inputMode ===
    "multiple-choice"
  ) {
    const choices =
      problem.choices || [];
    const keys = new Set(
      choices.map(
        (choice) =>
          String(choice.key)
      )
    );
    const texts = new Set(
      choices.map(
        (choice) =>
          String(choice.text)
      )
    );

    return (
      choices.length >= 4 &&
      keys.size === choices.length &&
      texts.size ===
        choices.length &&
      keys.has(
        String(problem.answer)
      )
    );
  }

  return true;
}

function difficultyScoreForNumber(
  number
) {
  if (number >= 28) return 0.94;
  if (number >= 23) return 0.84;
  if (number >= 20) return 0.77;
  if (number >= 15) return 0.68;
  if (number >= 8) return 0.56;
  return 0.42;
}

function expectedTimeForNumber(
  number
) {
  if (number >= 28) {
    return 10 * 60 * 1000;
  }
  if (number >= 23) {
    return 6 * 60 * 1000;
  }
  if (number >= 20) {
    return 5 * 60 * 1000;
  }
  if (number >= 15) {
    return 4 * 60 * 1000;
  }
  return 2 * 60 * 1000;
}

function advancedSource(
  typeId,
  courseId
) {
  if (
    typeId ===
    "semi-absolute-graph-area"
  ) {
    return {
      sourceCourseId: courseId,
      sourceUnitId:
        "integration",
      sourceSubunitId:
        "defint",
      sourceConceptId:
        "calculus-1-03-03",
    };
  }

  if (
    typeId ===
    "semi-tangent-area"
  ) {
    return {
      sourceCourseId: courseId,
      sourceUnitId:
        "differentiation",
      sourceSubunitId:
        "tangent",
      sourceConceptId:
        "calculus-1-02-05",
    };
  }

  if (
    typeId ===
    "killer-tangent-integral-extrema"
  ) {
    return {
      sourceCourseId: courseId,
      sourceUnitId:
        "differentiation",
      sourceSubunitId:
        "extrema",
      sourceConceptId:
        "calculus-1-02-06",
    };
  }

  if (
    typeId ===
      "semi-repeated-arrangement" ||
    typeId ===
      "killer-divisor-map"
  ) {
    return {
      sourceCourseId: courseId,
      sourceUnitId: "counting",
      sourceSubunitId: "perm",
      sourceConceptId:
        "probability-statistics-01-01",
    };
  }

  return {
    sourceCourseId: courseId,
    sourceUnitId: "sequences",
    sourceSubunitId: "recur",
    sourceConceptId:
      "algebra-03-06",
  };
}

function advancedReasoningSteps(
  category
) {
  const common = [
    "조건을 개념별로 분리하고 사용할 식을 정한다.",
    "가능한 경우를 빠짐없이 나눈다.",
    "각 경우의 중간 결과를 연결한다.",
    "범위와 제외 조건을 다시 확인한다.",
  ];

  return category === "killer"
    ? [
        ...common,
        "독립된 계산으로 답을 한 번 더 검산한다.",
      ]
    : common;
}

function generateAdvancedPlacementQuestion(
  blueprint,
  seenPrompts,
  seenTypeIds,
  seenSemanticTypeIds = new Set()
) {
  for (
    let attempt = 0;
    attempt < 120;
    attempt += 1
  ) {
    const generated =
      generateValidatedAdvancedQuestion(
        {
          category:
            blueprint.placementCategory,
          courseId:
            blueprint.fixedCourseId,
          typeWeights:
            blueprint.advancedTypeWeights,
          excludedTypeIds: [
            ...seenTypeIds,
          ],
        }
      );
    const {
      definition,
      problem,
      typeId,
      validation,
    } = generated;
    const semanticTypeId =
      `advanced:${
        definition.similarGroupId ||
        typeId
      }`;

    if (
      seenPrompts.has(
        problem.prompt
      ) ||
      seenSemanticTypeIds.has(
        semanticTypeId
      )
    ) {
      continue;
    }

    seenPrompts.add(
      problem.prompt
    );
    seenTypeIds.add(typeId);
    seenSemanticTypeIds.add(
      semanticTypeId
    );

    return {
      questionId: randomUUID(),
      typeId,
      sourceTypeIds: [
        definition.referenceFamily,
        typeId,
      ],
      difficulty:
        blueprint.difficulty,
      placementCategory:
        definition.category,
      selectionProbability:
        blueprint.advancedTypeWeights
          ? (
              (
                Number(
                  blueprint
                    .advancedTypeWeights[
                    typeId
                  ]
                ) || 0
              ) /
              Object.values(
                blueprint.advancedTypeWeights
              ).reduce(
                (sum, weight) =>
                  sum +
                  Number(weight),
                0
              )
            ) * 100
          : null,
      distributionSource:
        "번호별 공식 분포·고정 과목·고난도 유형표",
      difficultyScore:
        definition.difficultyScore,
      skillTags:
        definition.skillTags,
      expectedTimeMs:
        definition.expectedTimeMs,
      similarGroupId:
        definition.similarGroupId,
      semanticTypeId,
      ...advancedSource(
        typeId,
        blueprint.fixedCourseId ||
          definition.courseId
      ),
      retryTypeId: typeId,
      referenceExamIds: [
        "long-form-reference-collection",
        `reference-family-${definition.referenceFamily}`,
      ],
      sourcePattern:
        definition.label,
      referenceArchetypeId:
        definition.referenceFamily,
      estimatedMinutes:
        Math.round(
          definition.expectedTimeMs /
            60000
        ),
      reasoningSteps:
        advancedReasoningSteps(
          definition.category
        ),
      adaptationStage:
        "validated-numeric-variant",
      validation: {
        passed:
          validation.passed,
        solvable:
          validation.solvable,
        uniqueAnswer:
          validation.uniqueAnswer,
        calculatorFree:
          validation.calculatorFree,
        answerMatches:
          validation.answerMatches,
        generationAttempts:
          validation.attempts,
        operationCount:
          validation.operationCount,
        maxInteger:
          validation.maxInteger,
        checkedAt:
          validation.checkedAt,
      },
      prompt: problem.prompt,
      inputMode:
        problem.inputMode,
      choices:
        problem.choices || [],
      answer: problem.answer,
      solution:
        problem.solution || "",
      points: blueprint.points,
      submittedAnswer: null,
      isCorrect: null,
      placementNumber:
        blueprint.number,
      fixedCourseId:
        blueprint.fixedCourseId ||
        definition.courseId,
      selectedTypeKey:
        typeId,
      selectedTypeLabel:
        definition.label,
    };
  }

  throw new Error(
    `${blueprint.number}번 고난도 문항이 중복 제거와 검산을 통과하지 못했습니다.`
  );
}

function buildPlacementVerificationQuestions({
  excludedTypeIds = [],
  excludedSemanticTypeIds = [],
} = {}) {
  const seenPrompts =
    new Set();
  const seenTypeIds =
    new Set(
      excludedTypeIds
    );
  const seenSemanticTypeIds =
    new Set(
      excludedSemanticTypeIds
    );
  const categories = [
    "semi-killer",
    "semi-killer",
    "killer",
    "killer",
  ];

  return categories.map(
    (category, index) => {
      const question =
        generateAdvancedPlacementQuestion(
          {
            number:
              category ===
              "semi-killer"
                ? 20 + index
                : 26 + index,
            placementCategory:
              category,
            fixedCourseId:
              null,
            advancedTypeWeights:
              null,
            difficulty:
              category ===
              "killer"
                ? "advanced"
                : "applied",
            points: 1,
          },
          seenPrompts,
          seenTypeIds,
          seenSemanticTypeIds
        );

      question.placementNumber =
        null;
      question.points = 1;
      return question;
    }
  );
}

function generatePlacementQuestion(
  blueprint,
  seenPrompts,
  seenTypeIds = new Set(),
  plannedCandidate = null
) {
  if (
    [
      "semi-killer",
      "killer",
    ].includes(
      blueprint.placementCategory
    )
  ) {
    return generateAdvancedPlacementQuestion(
      plannedCandidate
        ? {
            ...blueprint,
            advancedTypeWeights: {
              [plannedCandidate.typeKey]:
                1,
            },
          }
        : blueprint,
      seenPrompts,
      seenTypeIds
    );
  }

  const candidates = plannedCandidate
    ? [plannedCandidate]
    : candidateTypesForBlueprint(
        blueprint
      );
  const candidateWeightTotal =
    candidates.reduce(
      (sum, candidate) =>
        sum +
        candidate.weight,
      0
    );

  for (
    let attempt = 0;
    attempt < 120;
    attempt += 1
  ) {
    const selected =
      weightedPick(candidates);
    const definition =
      typeDefinition(
        selected.typeKey,
        selected.target
      );
    const generated =
      generateFromDefinition(
        definition,
        blueprint.fixedCourseId,
        selected.generatorId
      );
    const problem =
      generated?.problem;

    if (
      !validateGeneratedProblem(
        problem
      ) ||
      seenPrompts.has(
        problem.prompt
      )
    ) {
      continue;
    }

    seenPrompts.add(
      problem.prompt
    );

    return {
      questionId: randomUUID(),
      typeId:
        generated.generatorId,
      sourceTypeIds: [
        selected.typeKey,
        generated.generatorId,
      ],
      difficulty:
        blueprint.difficulty,
      placementCategory:
        blueprint.placementCategory,
      selectionProbability:
        Math.round(
          (
            (
              selected.weight /
              candidateWeightTotal
            ) *
            100
          ) *
            10
        ) / 10,
      distributionSource:
        selected.probabilitySources
          ?.join(" + ") ||
        "번호별 공식 분포",
      difficultyScore:
        difficultyScoreForNumber(
          blueprint.number
        ),
      skillTags: [
        definition.label,
      ],
      expectedTimeMs:
        expectedTimeForNumber(
          blueprint.number
        ),
      similarGroupId:
        selected.semanticFamilyId ||
        selected.typeKey,
      ...generated.source,
      retryTypeId:
        generated.generatorId,
      referenceExamIds: [
        "placement-distribution-official-39",
        "kr-2028-integrated-sample",
      ],
      sourcePattern:
        definition.label,
      referenceArchetypeId:
        blueprint.targetTypeKey,
      estimatedMinutes:
        blueprint.number >= 28
          ? 10
          : blueprint.number >= 23
            ? 7
            : blueprint.number >= 15
              ? 4
              : 2,
      reasoningSteps:
        blueprint.number >= 23
          ? [
              "조건을 식으로 정리한다.",
              "필요한 개념을 연결해 계산한다.",
              "범위와 답을 다시 검산한다.",
            ]
          : [
              "주어진 조건을 확인한다.",
              "해당 개념의 식으로 계산한다.",
            ],
      adaptationStage:
        selected.target
          ? "2028-target"
          : "historical-weighted",
      validation: {
        passed: true,
        solvable: true,
        uniqueAnswer: true,
        calculatorFree: true,
        answerMatches: true,
        generationAttempts:
          attempt + 1,
        operationCount: null,
        maxInteger: null,
        checkedAt: new Date(),
      },
      prompt: problem.prompt,
      inputMode:
        problem.inputMode,
      choices:
        problem.choices || [],
      answer: problem.answer,
      solution:
        problem.solution || "",
      points: blueprint.points,
      submittedAnswer: null,
      isCorrect: null,
      placementNumber:
        blueprint.number,
      fixedCourseId:
        blueprint.fixedCourseId,
      selectedTypeKey:
        selected.typeKey,
      selectedTypeLabel:
        definition.label,
      semanticTypeId:
        selected.semanticFamilyId ||
        placementTypeIdentity(
          blueprint,
          selected
        ),
    };
  }

  throw new Error(
    `${blueprint.number}번 문항을 검산 가능한 상태로 생성하지 못했습니다.`
  );
}

function buildPlacementPaper() {
  const disabledBlueprint = PLACEMENT_QUESTION_BLUEPRINTS.find(
    (blueprint) =>
      !isProblemTypeEnabled(
        "PLACEMENT_EXAM",
        `question:${blueprint.number}`
      )
  );
  if (disabledBlueprint) {
    const error = new Error(
      `배치고사 ${disabledBlueprint.number}번 문제 유형이 관리자 검산 대기 상태입니다.`
    );
    error.status = 503;
    throw error;
  }
  const seenPrompts = new Set();
  const seenTypeIds =
    new Set();
  const plannedTypes =
    planUniquePlacementTypes();
  const questions =
    PLACEMENT_QUESTION_BLUEPRINTS.map(
      (blueprint) =>
        generatePlacementQuestion(
          blueprint,
          seenPrompts,
          seenTypeIds,
          plannedTypes.get(
            blueprint.number
          )
        )
    );
  const totalPoints =
    questions.reduce(
      (sum, question) =>
        sum + question.points,
      0
    );

  if (
    questions.length !== 30 ||
    totalPoints !==
      PLACEMENT_TOTAL_POINTS ||
    new Set(
      questions.map(
        (question) =>
          question.semanticTypeId ||
          question.similarGroupId
      )
    ).size !== 30
  ) {
    throw new Error(
      "배치고사 문항 수·총점·유형 고유성 검산에 실패했습니다."
    );
  }

  return {
    paperId:
      `placement-${Date.now()}-${randomUUID()}`,
    generationVersion:
      PLACEMENT_BANK_VERSION,
    scopeType: "placement",
    curriculumId: "kr-2022",
    courseId:
      "integrated-placement",
    unitId: null,
    subunitId: null,
    title:
      "GOAT Arena 입단 배치고사",
    subtitle:
      "대수 · 미적분Ⅰ · 확률과 통계 통합 30문항",
    passScore: 0,
    questions,
    totalPoints,
    timeLimitMs:
      PLACEMENT_TIME_LIMIT_MS,
  };
}

function auditPlacementBank(
  sampleCount = 5
) {
  const failures = [];
  const advancedAudit =
    auditAdvancedTypeBank(
      sampleCount
    );

  for (const [
    typeKey,
    definition,
  ] of Object.entries(
    HISTORICAL_TYPE_CATALOG
  )) {
    for (
      let index = 0;
      index < sampleCount;
      index += 1
    ) {
      const generated =
        generateFromDefinition(
          definition,
          definition.courseId
        );

      if (
        !validateGeneratedProblem(
          generated?.problem
        )
      ) {
        failures.push(typeKey);
        break;
      }
    }
  }

  for (const blueprint of
    PLACEMENT_QUESTION_BLUEPRINTS) {
    try {
      for (
        let index = 0;
        index < sampleCount;
        index += 1
      ) {
        generatePlacementQuestion(
          blueprint,
          new Set()
        );
      }
    } catch (error) {
      failures.push(
        `question-${blueprint.number}`
      );
    }
  }

  return {
    historicalTypeCount:
      Object.keys(
        HISTORICAL_TYPE_CATALOG
      ).length,
    targetTypeCount:
      Object.keys(
        TARGET_TYPE_CATALOG
      ).length,
    questionBlueprintCount:
      PLACEMENT_QUESTION_BLUEPRINTS.length,
    advancedReferenceFamilyCount:
      advancedAudit.referenceFamilyCount,
    semiKillerTypeCount:
      advancedAudit.semiKillerTypeCount,
    killerTypeCount:
      advancedAudit.killerTypeCount,
    failures: [
      ...new Set(failures),
      ...advancedAudit.failures.map(
        (failure) =>
          failure.typeId
      ),
    ],
  };
}

module.exports = {
  PLACEMENT_TIME_LIMIT_MS,
  PLACEMENT_BANK_VERSION,
  PLACEMENT_TOTAL_POINTS,
  HISTORICAL_TYPE_CATALOG,
  TARGET_TYPE_CATALOG,
  PLACEMENT_ADVANCED_TYPES,
  PLACEMENT_QUESTION_BLUEPRINTS,
  candidateTypesForBlueprint,
  planUniquePlacementTypes,
  placementTypeIdentity,
  generatePlacementQuestion,
  validateGeneratedProblem,
  buildPlacementPaper,
  buildPlacementVerificationQuestions,
  auditPlacementBank,
};
