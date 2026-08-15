const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const {
  randomInt,
  randomUUID,
} = require("crypto");
const {
  Problem,
  ProblemAttempt,
  QuickPracticeAttempt,
} = require("../models/matthsModel");
const {
  answersEquivalent,
} = require("./mathAnswerService");
const {
  recordStudyActivity,
} = require("./userLifecycleService");
const {
  isProblemTypeEnabled,
  problemTypeSelectionWeight,
} = require("./problemTypeControlCache");
const {
  validateCalculatorFreeProblem,
} = require("./problemGenerators/utils");
const {
  getCoachView,
} = require("./coachMessageService");

const QUICK_PRACTICE_LIMIT_MS = 40 * 1000;
const MAX_GENERATION_ATTEMPTS = 40;
const CATALOG_PATH = path.join(
  __dirname,
  "..",
  "content_folder",
  "quick-practice-types.yaml"
);

async function recordQuickPracticeWrongNote(
  attempt
) {
  if (
    !attempt ||
    !["wrong", "expired"].includes(
      String(attempt.status)
    )
  ) {
    return null;
  }

  const courseId = "quick-practice";
  const unitId =
    `${Number(attempt.pointValue) || 2}-point`;
  const conceptId =
    String(
      attempt.topicLabel ||
        attempt.topicKey ||
        "40초 눈풀이"
    );
  const externalId =
    `quick-practice:${attempt.instanceId}`;
  const problem =
    await Problem.findOneAndUpdate(
      { externalId },
      {
        $set: {
          curriculumId:
            "quick-practice",
          courseId,
          unitId,
          conceptIds: [
            String(
              attempt.topicKey ||
                conceptId
            ),
          ],
          primaryConceptId:
            String(
              attempt.topicKey ||
                conceptId
            ),
          source: {
            type: "custom",
            organization:
              "Matths 40초 눈풀이",
          },
          questionType:
            "short-answer",
          stem: attempt.prompt,
          correctAnswer:
            attempt.answer,
          solutionSteps:
            attempt.solution
              ? [
                  {
                    step: 1,
                    title: "풀이",
                    explanation:
                      attempt.solution,
                  },
                ]
              : [],
          difficulty:
            Number(
              attempt.pointValue
            ) === 3
              ? 3
              : 2,
          estimatedTimeSeconds: 40,
          score:
            Number(
              attempt.pointValue
            ) || 2,
          tags: [
            "quick-practice",
            String(
              attempt.topicKey ||
                ""
            ),
          ].filter(Boolean),
          isPublished: true,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );
  const submittedAnswer =
    attempt.submittedAnswer ===
      null ||
    attempt.submittedAnswer ===
      undefined ||
    String(
      attempt.submittedAnswer
    ).trim() === ""
      ? "미응답"
      : attempt.submittedAnswer;

  await ProblemAttempt.updateOne(
    {
      userId: attempt.userId,
      problemId: problem._id,
      attemptNumber: 1,
    },
    {
      $setOnInsert: {
        curriculumId:
          "quick-practice",
        courseId,
        unitId,
        conceptId,
        submittedAnswer,
        problemSnapshot: {
          typeId:
            attempt.variantLabel ||
            attempt.variantKey ||
            attempt.topicLabel,
          stem: attempt.prompt,
          choices: [],
          solution:
            attempt.solution || "",
          difficulty:
            Number(
              attempt.pointValue
            ) === 3
              ? 3
              : 2,
        },
        isCorrect: false,
        score: 0,
        maxScore:
          Number(
            attempt.pointValue
          ) || 2,
        responseTimeMs:
          Number(
            attempt.responseTimeMs
          ) ||
          QUICK_PRACTICE_LIMIT_MS,
        errorAnalysis: {
          errorType: "unknown",
          relatedConceptId:
            String(
              attempt.topicKey ||
                ""
            ),
        },
        review: {
          status: "pending",
        },
        submittedAt:
          attempt.submittedAt ||
          new Date(),
      },
    },
    {
      upsert: true,
    }
  );

  return problem;
}

async function syncQuickPracticeWrongNotes(
  userId
) {
  const attempts =
    await QuickPracticeAttempt.find({
      userId,
      status: {
        $in: [
          "wrong",
          "expired",
        ],
      },
    })
      .sort({
        submittedAt: -1,
      })
      .limit(500)
      .select("+answer");
  const externalIds =
    attempts.map(
      (attempt) =>
        `quick-practice:${attempt.instanceId}`
    );
  const existingProblems =
    externalIds.length
      ? await Problem.find({
          externalId: {
            $in: externalIds,
          },
        })
          .select(
            "externalId"
          )
          .lean()
      : [];
  const existingAttemptProblemIds =
    existingProblems.length
      ? await ProblemAttempt.find({
          userId,
          problemId: {
            $in:
              existingProblems.map(
                (problem) =>
                  problem._id
              ),
          },
          attemptNumber: 1,
        })
          .select("problemId")
          .lean()
      : [];
  const recordedProblemIds =
    new Set(
      existingAttemptProblemIds.map(
        (attempt) =>
          String(
            attempt.problemId
          )
      )
    );
  const completedExternalIds =
    new Set(
      existingProblems
        .filter(
          (problem) =>
            recordedProblemIds.has(
              String(
                problem._id
              )
            )
        )
        .map(
          (problem) =>
            problem.externalId
        )
    );
  const missingAttempts =
    attempts.filter(
      (attempt) =>
        !completedExternalIds.has(
          `quick-practice:${attempt.instanceId}`
        )
    );

  for (const attempt of missingAttempts) {
    await recordQuickPracticeWrongNote(
      attempt
    );
  }

  return missingAttempts.length;
}

function pick(values) {
  if (!values.length) {
    throw new Error(
      "선택할 눈풀이 항목이 없습니다."
    );
  }

  return values[randomInt(values.length)];
}

function quickPracticeEngineKey(templateKey, variantKey) {
  return `quick-practice:${templateKey}:${variantKey}`;
}

function weightedQuickPracticePick(values, weightForValue) {
  const weighted = values.map((value) => ({
    value,
    weight: Math.max(1, Number(weightForValue(value)) || 1),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.value;
  }
  return weighted.at(-1)?.value;
}

function nonZero(min, max) {
  let value = 0;

  while (value === 0) {
    value = randomInt(min, max + 1);
  }

  return value;
}

function gcd(first, second) {
  let a = Math.abs(first);
  let b = Math.abs(second);

  while (b) {
    [a, b] = [b, a % b];
  }

  return a || 1;
}

function fraction(
  numerator,
  denominator
) {
  if (denominator === 0) {
    throw new Error(
      "분모는 0일 수 없습니다."
    );
  }

  const sign =
    denominator < 0 ? -1 : 1;
  const divisor = gcd(
    numerator,
    denominator
  );
  const top =
    (sign * numerator) / divisor;
  const bottom =
    Math.abs(denominator) / divisor;

  return bottom === 1
    ? String(top)
    : `${top}/${bottom}`;
}

function texValue(value) {
  const source = String(value);
  const matched = source.match(
    /^(-?\d+)\/(\d+)$/
  );

  if (!matched) return source;

  return `\\frac{${matched[1]}}{${matched[2]}}`;
}

function polynomialToTex(terms) {
  const rendered = [];

  for (const {
    coefficient,
    power,
  } of terms) {
    if (!coefficient) continue;

    const sign =
      coefficient < 0 ? "-" : "+";
    const absolute =
      Math.abs(coefficient);
    const body =
      power === 0
        ? String(absolute)
        : `${absolute === 1 ? "" : absolute}x${
            power === 1
              ? ""
              : `^{${power}}`
          }`;

    if (!rendered.length) {
      rendered.push(
        sign === "-" ? `-${body}` : body
      );
    } else {
      rendered.push(`${sign}${body}`);
    }
  }

  return rendered.join("") || "0";
}

function piecewiseTex(
  rows,
  variable = "x"
) {
  return `\\begin{cases}${rows
    .map(
      ([expression, condition]) =>
        `${expression} & (${variable}${condition})`
    )
    .join("\\\\")}\\end{cases}`;
}

const pythagoreanTriples = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
];

const generationByVariant = {
  "exponent-laws:same-base"() {
    const base = randomInt(2, 5);
    const first = randomInt(2, 5);
    const second = randomInt(1, 4);
    const quotient = randomInt(
      1,
      Math.min(3, first + second - 1)
    );
    const exponent =
      first + second - quotient;

    return {
      prompt: `\\(\\displaystyle\\frac{${base}^{${first}}\\times ${base}^{${second}}}{${base}^{${quotient}}}\\)의 값은?`,
      answer: base ** exponent,
      solution: `지수를 더하고 빼면 \\(${base}^{${first}+${second}-${quotient}}=${base}^{${exponent}}=${base ** exponent}\\)입니다.`,
      parameters: {
        base,
        exponent,
      },
    };
  },

  "exponent-laws:rational-power"() {
    const base = randomInt(2, 6);
    const root = pick([2, 3]);
    const first = randomInt(1, 4);
    const second = randomInt(0, 3);
    const exponent = first + second;

    return {
      prompt: `\\(\\left(${base}^{${root}}\\right)^{\\frac{${first}}{${root}}}\\times ${base}^{${second}}\\)의 값은?`,
      answer: base ** exponent,
      solution: `\\((${base}^{${root}})^{${first}/${root}}=${base}^{${first}}\\)이므로 \\(${base}^{${exponent}}=${base ** exponent}\\)입니다.`,
      parameters: {
        base,
        exponent,
      },
    };
  },

  "exponent-laws:radical-power"() {
    const base = randomInt(2, 5);
    const root = pick([2, 3]);
    const extractedPower =
      randomInt(2, 5);
    const divisorPower =
      randomInt(
        0,
        extractedPower - 1
      );
    const exponent =
      extractedPower -
      divisorPower;

    return {
      prompt: `\\(\\displaystyle\\frac{\\sqrt[${root}]{${base}^{${root * extractedPower}}}}{${base}^{${divisorPower}}}\\)의 값은?`,
      answer: base ** exponent,
      solution: `근호를 지수로 바꾸면 \\(${base}^{${extractedPower}}\\div ${base}^{${divisorPower}}=${base}^{${exponent}}=${base ** exponent}\\)입니다.`,
      parameters: {
        base,
        exponent,
      },
    };
  },

  "polynomial-derivative:direct-value"() {
    const degree = pick([2, 3]);
    const leading = nonZero(-3, 4);
    const linear = randomInt(-5, 6);
    const constant = randomInt(-7, 8);
    const at = randomInt(-2, 4);
    const answer =
      leading *
        degree *
        at ** (degree - 1) +
      linear;
    const polynomial =
      polynomialToTex([
        {
          coefficient: leading,
          power: degree,
        },
        {
          coefficient: linear,
          power: 1,
        },
        {
          coefficient: constant,
          power: 0,
        },
      ]);

    return {
      prompt: `함수 \\(f(x)=${polynomial}\\)에 대하여 \\(f'(${at})\\)의 값은?`,
      answer,
      solution: `\\(f'(x)=${polynomialToTex([
        {
          coefficient:
            leading * degree,
          power: degree - 1,
        },
        {
          coefficient: linear,
          power: 0,
        },
      ])}\\)이므로 정답은 \\(${answer}\\)입니다.`,
      parameters: {
        leading,
        degree,
        linear,
        at,
      },
    };
  },

  "polynomial-derivative:definition-limit"() {
    const leading = nonZero(-3, 4);
    const linear = randomInt(-5, 6);
    const constant = randomInt(-6, 7);
    const at = randomInt(-2, 4);
    const answer =
      2 * leading * at + linear;
    const polynomial =
      polynomialToTex([
        {
          coefficient: leading,
          power: 2,
        },
        {
          coefficient: linear,
          power: 1,
        },
        {
          coefficient: constant,
          power: 0,
        },
      ]);

    return {
      prompt: `\\(f(x)=${polynomial}\\)일 때, \\(\\displaystyle\\lim_{h\\to0}\\frac{f(${at}+h)-f(${at})}{h}\\)의 값은?`,
      answer,
      solution: `주어진 극한은 \\(f'(${at})\\)이고, \\(f'(x)=${2 * leading}x${linear >= 0 ? "+" : ""}${linear}\\)이므로 \\(${answer}\\)입니다.`,
      parameters: {
        leading,
        degree: 2,
        linear,
        at,
      },
    };
  },

  "polynomial-derivative:missing-coefficient"() {
    const cubic = nonZero(-2, 3);
    const quadratic =
      nonZero(-4, 5);
    const constant = randomInt(-8, 9);
    const at = randomInt(-2, 3);
    const answer =
      3 * cubic * at ** 2 +
      2 * quadratic * at;
    const polynomial =
      polynomialToTex([
        {
          coefficient: cubic,
          power: 3,
        },
        {
          coefficient: quadratic,
          power: 2,
        },
        {
          coefficient: constant,
          power: 0,
        },
      ]);

    return {
      prompt: `함수 \\(f(x)=${polynomial}\\)에 대하여 \\(f'(${at})\\)의 값은?`,
      answer,
      solution: `일차항이 없으므로 \\(f'(x)=${polynomialToTex([
        {
          coefficient: 3 * cubic,
          power: 2,
        },
        {
          coefficient:
            2 * quadratic,
          power: 1,
        },
      ])}\\)입니다. 따라서 정답은 \\(${answer}\\)입니다.`,
      parameters: {
        leading: cubic,
        degree: 3,
        quadratic,
        at,
      },
    };
  },

  "antiderivative-value:recover-constant"() {
    const quadratic =
      nonZero(-3, 4);
    const linear = randomInt(-5, 6);
    const integrationConstant =
      randomInt(-6, 7);
    const knownAt = randomInt(-2, 3);
    let targetAt = randomInt(-2, 4);

    while (targetAt === knownAt) {
      targetAt = randomInt(-2, 4);
    }

    const valueAt = (x) =>
      quadratic * x ** 2 +
      linear * x +
      integrationConstant;
    const knownValue =
      valueAt(knownAt);
    const answer = valueAt(targetAt);

    return {
      prompt: `함수 \\(f(x)\\)가 \\(f'(x)=${2 * quadratic}x${linear >= 0 ? "+" : ""}${linear}\\), \\(f(${knownAt})=${knownValue}\\)를 만족할 때, \\(f(${targetAt})\\)의 값은?`,
      answer,
      solution: `\\(f(x)=${quadratic}x^2${linear >= 0 ? "+" : ""}${linear}x+C\\)에 \\(f(${knownAt})=${knownValue}\\)를 대입해 적분상수를 정하면 \\(C=${integrationConstant}\\)입니다. 따라서 정답은 \\(${answer}\\)입니다.`,
      parameters: {
        quadratic,
        linear,
        integrationConstant,
        targetAt,
      },
    };
  },

  "antiderivative-value:difference-without-constant"() {
    const quadratic =
      nonZero(-3, 4);
    const linear = randomInt(-5, 6);
    const firstAt = randomInt(-2, 2);
    const secondAt =
      firstAt + randomInt(1, 4);
    const answer =
      quadratic *
        (secondAt ** 2 -
          firstAt ** 2) +
      linear *
        (secondAt - firstAt);

    return {
      prompt: `\\(f'(x)=${2 * quadratic}x${linear >= 0 ? "+" : ""}${linear}\\)일 때, \\(f(${secondAt})-f(${firstAt})\\)의 값은?`,
      answer,
      solution: `적분상수는 두 함숫값의 차에서 사라집니다. \\([${quadratic}x^2${linear >= 0 ? "+" : ""}${linear}x]_{${firstAt}}^{${secondAt}}=${answer}\\)입니다.`,
      parameters: {
        quadratic,
        linear,
        firstAt,
        secondAt,
      },
    };
  },

  "trigonometric-ratio:quadrant-sum"() {
    const [horizontal, vertical, radius] =
      pick(pythagoreanTriples);
    const quadrant = pick([2, 3, 4]);
    const cosineSign =
      [2, 3].includes(quadrant)
        ? -1
        : 1;
    const sineSign =
      [3, 4].includes(quadrant)
        ? -1
        : 1;
    const answer = fraction(
      cosineSign * horizontal +
        sineSign * vertical,
      radius
    );
    const intervals = {
      2: "\\frac{\\pi}{2}<\\theta<\\pi",
      3: "\\pi<\\theta<\\frac{3\\pi}{2}",
      4: "\\frac{3\\pi}{2}<\\theta<2\\pi",
    };

    return {
      prompt: `\\(${intervals[quadrant]}\\)이고 \\(\\lvert\\cos\\theta\\rvert=\\frac{${horizontal}}{${radius}}\\)일 때, \\(\\sin\\theta+\\cos\\theta\\)의 값은?`,
      answer,
      solution: `${quadrant}사분면의 부호를 적용하면 \\(\\cos\\theta=${texValue(
        fraction(
          cosineSign * horizontal,
          radius
        )
      )}\\), \\(\\sin\\theta=${texValue(
        fraction(
          sineSign * vertical,
          radius
        )
      )}\\)입니다. 따라서 합은 \\(${texValue(answer)}\\)입니다.`,
      parameters: {
        horizontal,
        vertical,
        radius,
        cosineSign,
        sineSign,
        operation: "sum",
      },
    };
  },

  "trigonometric-ratio:quadrant-tangent"() {
    const [horizontal, vertical, radius] =
      pick(pythagoreanTriples);
    const quadrant = pick([2, 3, 4]);
    const cosineSign =
      [2, 3].includes(quadrant)
        ? -1
        : 1;
    const sineSign =
      [3, 4].includes(quadrant)
        ? -1
        : 1;
    const answer = fraction(
      sineSign * vertical,
      cosineSign * horizontal
    );
    const intervals = {
      2: "\\frac{\\pi}{2}<\\theta<\\pi",
      3: "\\pi<\\theta<\\frac{3\\pi}{2}",
      4: "\\frac{3\\pi}{2}<\\theta<2\\pi",
    };

    return {
      prompt: `\\(${intervals[quadrant]}\\)이고 \\(\\lvert\\sin\\theta\\rvert=\\frac{${vertical}}{${radius}}\\)일 때, \\(\\tan\\theta\\)의 값은?`,
      answer,
      solution: `${quadrant}사분면에서 사인과 코사인의 부호를 정한 뒤 \\(\\tan\\theta=\\frac{\\sin\\theta}{\\cos\\theta}\\)를 계산하면 \\(${texValue(answer)}\\)입니다.`,
      parameters: {
        horizontal,
        vertical,
        cosineSign,
        sineSign,
        operation: "tangent",
      },
    };
  },

  "trigonometric-ratio:shifted-angle"() {
    const [horizontal, vertical, radius] =
      pick(pythagoreanTriples);
    const quadrant = pick([1, 2]);
    const cosineSign =
      quadrant === 2 ? -1 : 1;
    const answer = fraction(
      -cosineSign * horizontal,
      radius
    );
    const interval =
      quadrant === 1
        ? "0<\\theta<\\frac{\\pi}{2}"
        : "\\frac{\\pi}{2}<\\theta<\\pi";

    return {
      prompt: `\\(${interval}\\)이고 \\(\\sin\\theta=\\frac{${vertical}}{${radius}}\\)일 때, \\(\\cos(\\pi+\\theta)\\)의 값은?`,
      answer,
      solution: `사분면에서 \\(\\cos\\theta=${texValue(
        fraction(
          cosineSign * horizontal,
          radius
        )
      )}\\)이고, \\(\\cos(\\pi+\\theta)=-\\cos\\theta\\)이므로 \\(${texValue(answer)}\\)입니다.`,
      parameters: {
        horizontal,
        radius,
        cosineSign,
        operation: "shifted-cosine",
      },
    };
  },

  "geometric-sequence-relations:term-ratio"() {
    const first = randomInt(1, 5);
    const ratio = pick([2, 3]);
    const knownOrder = pick([2, 3]);
    const targetOrder =
      knownOrder + pick([2, 3]);
    const known =
      first *
      ratio ** (knownOrder - 1);
    const answer =
      ratio **
      (targetOrder - knownOrder);

    return {
      prompt: `모든 항이 양수인 등비수열 \\(\\{a_n\\}\\)에서 \\(a_1=${first}\\), \\(a_${knownOrder}=${known}\\)일 때, \\(\\frac{a_${targetOrder}}{a_${knownOrder}}\\)의 값은?`,
      answer,
      solution: `공비는 \\(${ratio}\\)이고 두 항의 번호 차가 \\(${targetOrder - knownOrder}\\)이므로 비는 \\(${ratio}^{${targetOrder - knownOrder}}=${answer}\\)입니다.`,
      parameters: {
        ratio,
        exponent:
          targetOrder -
          knownOrder,
        operation: "power",
      },
    };
  },

  "geometric-sequence-relations:recover-term"() {
    const first = randomInt(1, 5);
    const ratio = pick([2, 3]);
    const knownOrder = pick([2, 3, 4]);
    const targetOrder =
      knownOrder + pick([1, 2]);
    const known =
      first *
      ratio ** (knownOrder - 1);
    const answer =
      first *
      ratio ** (targetOrder - 1);

    return {
      prompt: `모든 항이 양수인 등비수열 \\(\\{a_n\\}\\)에서 \\(a_1=${first}\\), \\(a_${knownOrder}=${known}\\)일 때, \\(a_${targetOrder}\\)의 값은?`,
      answer,
      solution: `공비는 \\(${ratio}\\)이므로 \\(a_${targetOrder}=${first}\\times ${ratio}^{${targetOrder - 1}}=${answer}\\)입니다.`,
      parameters: {
        first,
        ratio,
        exponent:
          targetOrder - 1,
        operation: "term",
      },
    };
  },

  "geometric-sequence-relations:product-relation"() {
    const first = randomInt(1, 4);
    const ratio = pick([2, 3]);
    const product =
      first ** 2 * ratio ** 4;
    const answer = ratio ** 4;

    return {
      prompt: `모든 항이 양수인 등비수열 \\(\\{a_n\\}\\)에서 \\(a_1=${first}\\), \\(a_2a_4=${product}\\)일 때, \\(\\frac{a_7}{a_3}\\)의 값은?`,
      answer,
      solution: `\\(a_2a_4=a_1^2r^4\\)이므로 \\(r^4=${answer}\\)입니다. 또한 \\(\\frac{a_7}{a_3}=r^4\\)이므로 정답은 \\(${answer}\\)입니다.`,
      parameters: {
        ratio,
        exponent: 4,
        operation: "power",
      },
    };
  },

  "sigma-transform:linear-transform"() {
    const count = randomInt(4, 9);
    const originalSum =
      randomInt(-8, 13);
    const multiplier =
      nonZero(-3, 4);
    const constant = randomInt(-4, 5);
    const answer =
      multiplier * originalSum +
      constant * count;

    return {
      prompt: `\\(\\displaystyle\\sum_{k=1}^{${count}}a_k=${originalSum}\\)일 때, \\(\\displaystyle\\sum_{k=1}^{${count}}(${multiplier}a_k${constant >= 0 ? "+" : ""}${constant})\\)의 값은?`,
      answer,
      solution: `합을 나누면 \\(${multiplier}\\sum a_k${constant >= 0 ? "+" : ""}${constant}\\times ${count}\\)이므로 값은 \\(${answer}\\)입니다.`,
      parameters: {
        count,
        originalSum,
        multiplier,
        constant,
        operation: "linear",
      },
    };
  },

  "sigma-transform:extend-sum"() {
    const count = randomInt(4, 9);
    const originalSum =
      randomInt(-8, 13);
    const nextTerm =
      randomInt(-7, 10);
    const answer =
      originalSum + nextTerm;

    return {
      prompt: `\\(\\displaystyle\\sum_{k=1}^{${count}}a_k=${originalSum}\\), \\(a_${count + 1}=${nextTerm}\\)일 때, \\(\\displaystyle\\sum_{k=1}^{${count + 1}}a_k\\)의 값은?`,
      answer,
      solution: `기존 합에 다음 항을 더하면 \\(${originalSum}${nextTerm >= 0 ? "+" : ""}${nextTerm}=${answer}\\)입니다.`,
      parameters: {
        originalSum,
        nextTerm,
        operation: "extend",
      },
    };
  },

  "sigma-transform:recover-original-sum"() {
    const count = randomInt(4, 9);
    const originalSum =
      randomInt(-8, 13);
    const multiplier =
      pick([2, 3, 4]);
    const constant = randomInt(-3, 4);
    const transformed =
      multiplier * originalSum +
      constant * count;

    return {
      prompt: `\\(\\displaystyle\\sum_{k=1}^{${count}}(${multiplier}a_k${constant >= 0 ? "+" : ""}${constant})=${transformed}\\)일 때, \\(\\displaystyle\\sum_{k=1}^{${count}}a_k\\)의 값은?`,
      answer: originalSum,
      solution: `\\(${multiplier}\\sum a_k${constant >= 0 ? "+" : ""}${constant}\\times ${count}=${transformed}\\)을 풀면 원래 합은 \\(${originalSum}\\)입니다.`,
      parameters: {
        count,
        transformed,
        multiplier,
        constant,
        operation: "recover",
      },
    };
  },

  "one-sided-limit:piecewise-sum"() {
    const boundary = randomInt(-2, 4);
    const leftSlope = nonZero(-3, 4);
    const leftConstant =
      randomInt(-5, 6);
    const rightSlope =
      nonZero(-3, 4);
    const rightConstant =
      randomInt(-5, 6);
    const left =
      leftSlope * boundary +
      leftConstant;
    const right =
      rightSlope * boundary +
      rightConstant;
    const answer = left + right;

    return {
      prompt: `\\(f(x)=${piecewiseTex([
        [
          polynomialToTex([
            {
              coefficient: leftSlope,
              power: 1,
            },
            {
              coefficient:
                leftConstant,
              power: 0,
            },
          ]),
          `<${boundary}`,
        ],
        [
          polynomialToTex([
            {
              coefficient:
                rightSlope,
              power: 1,
            },
            {
              coefficient:
                rightConstant,
              power: 0,
            },
          ]),
          `\\ge ${boundary}`,
        ],
      ])}\\)일 때, \\(\\displaystyle\\lim_{x\\to ${boundary}-}f(x)+\\lim_{x\\to ${boundary}+}f(x)\\)의 값은?`,
      answer,
      solution: `좌극한은 \\(${left}\\), 우극한은 \\(${right}\\)이므로 합은 \\(${answer}\\)입니다.`,
      parameters: {
        left,
        right,
        leftWeight: 1,
        rightWeight: 1,
      },
    };
  },

  "one-sided-limit:two-boundaries"() {
    const firstBoundary =
      randomInt(-3, 1);
    const secondBoundary =
      firstBoundary +
      randomInt(2, 5);
    const firstConstant =
      randomInt(-6, 7);
    const middleSlope =
      nonZero(-3, 4);
    const middleConstant =
      randomInt(-5, 6);
    const lastConstant =
      randomInt(-6, 7);
    const answer =
      firstConstant + lastConstant;

    return {
      prompt: `\\(f(x)=${piecewiseTex([
        [
          String(firstConstant),
          `<${firstBoundary}`,
        ],
        [
          polynomialToTex([
            {
              coefficient:
                middleSlope,
              power: 1,
            },
            {
              coefficient:
                middleConstant,
              power: 0,
            },
          ]),
          `\\ge ${firstBoundary},\\ x<${secondBoundary}`,
        ],
        [
          String(lastConstant),
          `\\ge ${secondBoundary}`,
        ],
      ])}\\)일 때, \\(\\displaystyle\\lim_{x\\to ${firstBoundary}-}f(x)+\\lim_{x\\to ${secondBoundary}+}f(x)\\)의 값은?`,
      answer,
      solution: `첫 경계의 좌극한은 \\(${firstConstant}\\), 둘째 경계의 우극한은 \\(${lastConstant}\\)이므로 합은 \\(${answer}\\)입니다.`,
      parameters: {
        left: firstConstant,
        right: lastConstant,
        leftWeight: 1,
        rightWeight: 1,
      },
    };
  },

  "one-sided-limit:weighted-limits"() {
    const boundary = randomInt(-2, 4);
    const leftSlope = nonZero(-3, 4);
    const rightSlope =
      nonZero(-3, 4);
    const leftConstant =
      randomInt(-5, 6);
    const rightConstant =
      randomInt(-5, 6);
    const left =
      leftSlope * boundary +
      leftConstant;
    const right =
      rightSlope * boundary +
      rightConstant;
    const leftWeight =
      pick([2, 3]);
    const rightWeight =
      pick([-2, -1, 2]);
    const answer =
      leftWeight * left +
      rightWeight * right;

    return {
      prompt: `\\(f(x)=${piecewiseTex([
        [
          polynomialToTex([
            {
              coefficient: leftSlope,
              power: 1,
            },
            {
              coefficient:
                leftConstant,
              power: 0,
            },
          ]),
          `<${boundary}`,
        ],
        [
          polynomialToTex([
            {
              coefficient:
                rightSlope,
              power: 1,
            },
            {
              coefficient:
                rightConstant,
              power: 0,
            },
          ]),
          `\\ge ${boundary}`,
        ],
      ])}\\)일 때, \\(${leftWeight}\\displaystyle\\lim_{x\\to ${boundary}-}f(x)${rightWeight >= 0 ? "+" : ""}${rightWeight}\\displaystyle\\lim_{x\\to ${boundary}+}f(x)\\)의 값은?`,
      answer,
      solution: `좌극한 \\(${left}\\), 우극한 \\(${right}\\)을 대입하면 \\(${leftWeight}\\times ${left}${rightWeight >= 0 ? "+" : ""}${rightWeight}\\times ${right}=${answer}\\)입니다.`,
      parameters: {
        left,
        right,
        leftWeight,
        rightWeight,
      },
    };
  },

  "piecewise-continuity:additive-parameter"() {
    const boundary = randomInt(-2, 4);
    const leftSlope = nonZero(-3, 4);
    const rightSlope =
      nonZero(-3, 4);
    const rightConstant =
      randomInt(-6, 7);
    const answer =
      rightSlope * boundary +
      rightConstant -
      leftSlope * boundary;

    return {
      prompt: `함수 \\(f(x)=${piecewiseTex([
        [
          `${polynomialToTex([
            {
              coefficient: leftSlope,
              power: 1,
            },
          ])}+a`,
          `\\le ${boundary}`,
        ],
        [
          polynomialToTex([
            {
              coefficient:
                rightSlope,
              power: 1,
            },
            {
              coefficient:
                rightConstant,
              power: 0,
            },
          ]),
          `>${boundary}`,
        ],
      ])}\\)가 실수 전체에서 연속일 때, \\(a\\)의 값은?`,
      answer,
      solution: `\\(x=${boundary}\\)에서 양쪽 식의 값이 같아야 합니다. 따라서 \\(${leftSlope}\\times ${boundary}+a=${rightSlope}\\times ${boundary}${rightConstant >= 0 ? "+" : ""}${rightConstant}\\)에서 \\(a=${answer}\\)입니다.`,
      parameters: {
        boundary,
        leftSlope,
        rightSlope,
        rightConstant,
        operation: "additive",
      },
    };
  },

  "piecewise-continuity:slope-parameter"() {
    const boundary = nonZero(-3, 4);
    const answer = nonZero(-4, 5);
    const leftConstant =
      randomInt(-5, 6);
    const rightSlope =
      nonZero(-3, 4);
    const rightConstant =
      answer * boundary +
      leftConstant -
      rightSlope * boundary;

    return {
      prompt: `함수 \\(f(x)=${piecewiseTex([
        [
          `ax${leftConstant >= 0 ? "+" : ""}${leftConstant}`,
          `\\le ${boundary}`,
        ],
        [
          polynomialToTex([
            {
              coefficient:
                rightSlope,
              power: 1,
            },
            {
              coefficient:
                rightConstant,
              power: 0,
            },
          ]),
          `>${boundary}`,
        ],
      ])}\\)가 실수 전체에서 연속일 때, \\(a\\)의 값은?`,
      answer,
      solution: `\\(x=${boundary}\\)에서 두 식의 값을 같게 두면 \\(${boundary}a${leftConstant >= 0 ? "+" : ""}${leftConstant}=${rightSlope * boundary + rightConstant}\\)이므로 \\(a=${answer}\\)입니다.`,
      parameters: {
        boundary,
        leftConstant,
        rightSlope,
        rightConstant,
        operation: "slope",
      },
    };
  },

  "piecewise-continuity:shared-parameter"() {
    const boundary = 1;
    const leftSlope = nonZero(-4, 5);
    const answer = nonZero(-4, 5);
    const rightSlope =
      leftSlope + 2 * answer;

    return {
      prompt: `함수 \\(f(x)=${piecewiseTex([
        [
          `${polynomialToTex([
            {
              coefficient: leftSlope,
              power: 1,
            },
          ])}+a`,
          "\\le 1",
        ],
        [
          `${polynomialToTex([
            {
              coefficient:
                rightSlope,
              power: 1,
            },
          ])}-a`,
          ">1",
        ],
      ])}\\)가 실수 전체에서 연속일 때, \\(a\\)의 값은?`,
      answer,
      solution: `\\(x=1\\)에서 \\(${leftSlope}+a=${rightSlope}-a\\)이므로 \\(2a=${rightSlope - leftSlope}\\), 따라서 \\(a=${answer}\\)입니다.`,
      parameters: {
        leftSlope,
        rightSlope,
        operation: "shared",
      },
    };
  },
};

function expectedAnswer(
  familyKey,
  parameters
) {
  if (familyKey === "exponent-laws") {
    return (
      parameters.base **
      parameters.exponent
    );
  }

  if (
    familyKey ===
    "polynomial-derivative"
  ) {
    if (
      parameters.quadratic !==
      undefined
    ) {
      return (
        3 *
          parameters.leading *
          parameters.at ** 2 +
        2 *
          parameters.quadratic *
          parameters.at
      );
    }

    return (
      parameters.leading *
        parameters.degree *
        parameters.at **
          (parameters.degree - 1) +
      parameters.linear
    );
  }

  if (
    familyKey ===
    "antiderivative-value"
  ) {
    if (
      parameters.targetAt !==
      undefined
    ) {
      return (
        parameters.quadratic *
          parameters.targetAt ** 2 +
        parameters.linear *
          parameters.targetAt +
        parameters.integrationConstant
      );
    }

    return (
      parameters.quadratic *
        (parameters.secondAt ** 2 -
          parameters.firstAt ** 2) +
      parameters.linear *
        (parameters.secondAt -
          parameters.firstAt)
    );
  }

  if (
    familyKey ===
    "trigonometric-ratio"
  ) {
    if (
      parameters.operation ===
      "sum"
    ) {
      return fraction(
        parameters.cosineSign *
          parameters.horizontal +
          parameters.sineSign *
            parameters.vertical,
        parameters.radius
      );
    }

    if (
      parameters.operation ===
      "tangent"
    ) {
      return fraction(
        parameters.sineSign *
          parameters.vertical,
        parameters.cosineSign *
          parameters.horizontal
      );
    }

    return fraction(
      -parameters.cosineSign *
        parameters.horizontal,
      parameters.radius
    );
  }

  if (
    familyKey ===
    "geometric-sequence-relations"
  ) {
    if (
      parameters.operation ===
      "term"
    ) {
      return (
        parameters.first *
        parameters.ratio **
          parameters.exponent
      );
    }

    return (
      parameters.ratio **
      parameters.exponent
    );
  }

  if (
    familyKey === "sigma-transform"
  ) {
    if (
      parameters.operation ===
      "linear"
    ) {
      return (
        parameters.multiplier *
          parameters.originalSum +
        parameters.constant *
          parameters.count
      );
    }

    if (
      parameters.operation ===
      "extend"
    ) {
      return (
        parameters.originalSum +
        parameters.nextTerm
      );
    }

    return (
      (parameters.transformed -
        parameters.constant *
          parameters.count) /
      parameters.multiplier
    );
  }

  if (
    familyKey === "one-sided-limit"
  ) {
    return (
      parameters.leftWeight *
        parameters.left +
      parameters.rightWeight *
        parameters.right
    );
  }

  if (
    familyKey ===
    "piecewise-continuity"
  ) {
    if (
      parameters.operation ===
      "additive"
    ) {
      return (
        parameters.rightSlope *
          parameters.boundary +
        parameters.rightConstant -
        parameters.leftSlope *
          parameters.boundary
      );
    }

    if (
      parameters.operation ===
      "slope"
    ) {
      return (
        (parameters.rightSlope *
          parameters.boundary +
          parameters.rightConstant -
          parameters.leftConstant) /
        parameters.boundary
      );
    }

    return (
      (parameters.rightSlope -
        parameters.leftSlope) /
      2
    );
  }

  return undefined;
}

function loadCatalog() {
  const document = yaml.load(
    fs.readFileSync(
      CATALOG_PATH,
      "utf8"
    )
  );

  if (
    !document?.meta ||
    !Array.isArray(document.types)
  ) {
    throw new Error(
      "눈풀이 유형 파일의 형식이 올바르지 않습니다."
    );
  }

  return document;
}

const catalog = loadCatalog();
const templates = catalog.types.map(
  (definition) => ({
    key: definition.key,
    points: Number(
      definition.points
    ),
    label: definition.label,
    generator:
      definition.generator,
    observedIn:
      definition.observedIn || [],
    variants:
      definition.variants || [],
    generate({
      excludedVariantKeys = [],
    } = {}) {
      const enabledVariants = this.variants.filter((variant) =>
        isProblemTypeEnabled(
          "ASSESSMENT_CENTER",
          quickPracticeEngineKey(this.key, variant.key)
        )
      );
      const unrepeatedVariants = enabledVariants.filter(
        (variant) => !excludedVariantKeys.includes(variant.key)
      );
      const available = unrepeatedVariants.length
        ? unrepeatedVariants
        : enabledVariants;
      if (!enabledVariants.length) {
        throw new Error(`${this.label}: 사용 중인 세부 출제 유형이 없습니다.`);
      }
      const variant = weightedQuickPracticePick(
        available,
        (item) => problemTypeSelectionWeight(
          "ASSESSMENT_CENTER",
          quickPracticeEngineKey(this.key, item.key)
        )
      );
      const generator =
        generationByVariant[
          `${this.generator}:${variant.key}`
        ];

      if (!generator) {
        throw new Error(
          `${this.key}/${variant.key} 생성기가 없습니다.`
        );
      }

      return {
        ...generator(),
        variantKey: variant.key,
        variantLabel: variant.label,
      };
    },
    verify(generated) {
      const expected =
        expectedAnswer(
          this.generator,
          generated.parameters
        );

      return (
        expected !== undefined &&
        answersEquivalent(
          expected,
          generated.answer
        )
      );
    },
  })
);

function generateVerifiedProblem(
  template,
  options = {}
) {
  for (
    let attempt = 0;
    attempt <
    MAX_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const generated =
      template.generate(options);

    if (
      generated.prompt &&
      generated.solution &&
      generated.answer !==
        undefined &&
      template.verify(generated)
    ) {
      validateCalculatorFreeProblem(
        {
          ...generated,
          inputMode: "short-answer",
          choices: [],
          calculatorFree: true,
        },
        { id: quickPracticeEngineKey(template.key, generated.variantKey) }
      );
      return generated;
    }
  }

  throw new Error(
    `${template.label} 문항이 자동 검산을 통과하지 못했습니다.`
  );
}

function chooseTemplate(
  eligible,
  recentHistory
) {
  const avoidCount = Math.min(
    Math.max(eligible.length - 1, 0),
    3
  );
  const recentKeys = new Set(
    recentHistory
      .slice(0, avoidCount)
      .map((row) => row.topicKey)
  );
  const available = eligible.filter(
    (template) =>
      !recentKeys.has(template.key)
  );

  return weightedQuickPracticePick(
    available.length ? available : eligible,
    (template) => template.variants
      .filter((variant) => isProblemTypeEnabled(
        "ASSESSMENT_CENTER",
        quickPracticeEngineKey(template.key, variant.key)
      ))
      .reduce(
        (sum, variant) => sum + problemTypeSelectionWeight(
          "ASSESSMENT_CENTER",
          quickPracticeEngineKey(template.key, variant.key)
        ),
        0
      )
  );
}

function listQuickPracticeProblemTypes() {
  return templates.flatMap((template) =>
    template.variants.map((variant) => {
      const engineKey = quickPracticeEngineKey(template.key, variant.key);
      const generator = generationByVariant[`${template.generator}:${variant.key}`];
      return {
        id: engineKey,
        label: `${template.label} · ${variant.label}`,
        points: template.points,
        templateKey: template.key,
        variantKey: variant.key,
        sourceParts: [
          `// ${engineKey}`,
          generator?.toString() || "",
          expectedAnswer.toString(),
        ],
        generate() {
          const generated = generator();
          const answerMatches = template.verify(generated);
          return {
            ...generated,
            inputMode: "short-answer",
            choices: [],
            hintText: "식을 간단히 정리한 뒤 원래 조건에 대입해 확인하세요.",
            calculatorFree: true,
            validityChecks: [
              {
                name: "independent-answer-check",
                passed: answerMatches,
                message: "독립 정답 계산 결과가 일치해야 합니다.",
              },
            ],
            validation: {
              calculatorFree: true,
              answerMatches,
            },
          };
        },
        validate(problem) {
          return template.verify(problem);
        },
      };
    })
  );
}

function publicAttempt(attempt) {
  return {
    instanceId: attempt.instanceId,
    pointValue: attempt.pointValue,
    topicKey: attempt.topicKey,
    topicLabel: attempt.topicLabel,
    variantKey:
      attempt.variantKey || "",
    variantLabel:
      attempt.variantLabel || "",
    sourceScope:
      attempt.sourceScope || "",
    prompt: attempt.prompt,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
  };
}

function getQuickPracticeCatalogSummary() {
  return {
    title: catalog.meta.title,
    scope: catalog.meta.scope,
    sourceArchive:
      catalog.meta.sourceArchive,
    typeCount: templates.length,
    variantCount: templates.reduce(
      (total, template) =>
        total +
        template.variants.length,
      0
    ),
    byPoint: [2, 3].map(
      (points) => ({
        points,
        types: templates
          .filter(
            (template) =>
              template.points ===
              points
          )
          .map((template) => ({
            key: template.key,
            label: template.label,
            variants:
              template.variants.map(
                (variant) =>
                  variant.label
              ),
          })),
      })
    ),
  };
}

async function createQuickPracticeAttempt({
  userId,
  pointValue,
  coachMode,
}) {
  const allowedPoints = [2, 3];
  const normalizedPoints =
    allowedPoints.includes(
      Number(pointValue)
    )
      ? Number(pointValue)
      : pick(allowedPoints);
  const now = new Date();

  const activeAttempts =
    await QuickPracticeAttempt.find(
    {
      userId,
      status: "active",
    }
  ).select("+answer");

  for (const activeAttempt of activeAttempts) {
    activeAttempt.status =
      "expired";
    activeAttempt.submittedAt =
      now;
    activeAttempt.responseTimeMs =
      QUICK_PRACTICE_LIMIT_MS;
    await activeAttempt.save();
    await recordQuickPracticeWrongNote(
      activeAttempt
    );
  }

  const recentHistory =
    await QuickPracticeAttempt.find({
      userId,
      pointValue: normalizedPoints,
    })
      .sort({
        startedAt: -1,
      })
      .limit(8)
      .select(
        "topicKey variantKey"
      )
      .lean();
  const eligible = templates.filter(
    (item) =>
      item.points ===
        normalizedPoints &&
      item.variants.some((variant) =>
        isProblemTypeEnabled(
          "ASSESSMENT_CENTER",
          quickPracticeEngineKey(item.key, variant.key)
        )
      )
  );
  if (!eligible.length) {
    const error = new Error("자동 검산을 통과해 사용 중인 40초 눈풀이 유형이 없습니다.");
    error.status = 503;
    throw error;
  }
  const template = chooseTemplate(
    eligible,
    recentHistory
  );
  const excludedVariantKeys =
    recentHistory
      .filter(
        (row) =>
          row.topicKey ===
          template.key
      )
      .slice(0, 2)
      .map(
        (row) => row.variantKey
      )
      .filter(Boolean);
  const generated =
    generateVerifiedProblem(
      template,
      {
        excludedVariantKeys,
      }
    );
  const attempt =
    await QuickPracticeAttempt.create({
      userId,
      instanceId: randomUUID(),
      pointValue: template.points,
      topicKey: template.key,
      topicLabel: template.label,
      variantKey:
        generated.variantKey,
      variantLabel:
        generated.variantLabel,
      sourceScope:
        catalog.meta.scope,
      prompt: generated.prompt,
      answer: generated.answer,
      solution: generated.solution,
      startedAt: now,
      deadlineAt: new Date(
        now.getTime() +
          QUICK_PRACTICE_LIMIT_MS
      ),
    });

  return {
    ...publicAttempt(attempt),
    coachPrompt: getCoachView({
      mode: coachMode,
      situation: "unanswered",
      seed: attempt.instanceId,
    }),
  };
}

async function submitQuickPracticeAttempt({
  userId,
  instanceId,
  submittedAnswer,
  coachMode,
}) {
  const attempt =
    await QuickPracticeAttempt.findOne({
      userId,
      instanceId,
    }).select("+answer");

  if (!attempt) {
    const error = new Error(
      "짧은 문제 기록을 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  if (attempt.status !== "active") {
    const error = new Error(
      "이미 종료된 문제입니다."
    );
    error.status = 409;
    throw error;
  }

  const now = new Date();
  const responseTimeMs = Math.max(
    0,
    now.getTime() -
      attempt.startedAt.getTime()
  );

  if (
    now.getTime() >
    attempt.deadlineAt.getTime()
  ) {
    attempt.status = "expired";
    attempt.responseTimeMs =
      QUICK_PRACTICE_LIMIT_MS;
    attempt.submittedAt = now;
    await attempt.save();
    await recordQuickPracticeWrongNote(
      attempt
    );
    await recordStudyActivity(
      userId,
      now,
      QUICK_PRACTICE_LIMIT_MS
    );

    return {
      expired: true,
      correct: false,
      solution: attempt.solution,
      answer: attempt.answer,
      responseTimeMs:
        QUICK_PRACTICE_LIMIT_MS,
      coachFeedback: getCoachView({
        mode: coachMode,
        situation: "unanswered",
        seed: instanceId,
      }),
    };
  }

  const correct = answersEquivalent(
    attempt.answer,
    submittedAnswer
  );

  attempt.status = correct
    ? "correct"
    : "wrong";
  attempt.submittedAnswer =
    submittedAnswer;
  attempt.responseTimeMs =
    responseTimeMs;
  attempt.submittedAt = now;
  await attempt.save();
  if (!correct) {
    await recordQuickPracticeWrongNote(
      attempt
    );
  }
  await recordStudyActivity(
    userId,
    now,
    responseTimeMs
  );

  return {
    expired: false,
    correct,
    solution: attempt.solution,
    answer: attempt.answer,
    responseTimeMs,
    coachFeedback: getCoachView({
      mode: coachMode,
      situation: correct
        ? "correct"
        : "incorrect",
      seed: instanceId,
    }),
  };
}

async function expireQuickPracticeAttempt({
  userId,
  instanceId,
  coachMode,
}) {
  const now = new Date();
  const activeAttempt =
    await QuickPracticeAttempt.findOne({
      userId,
      instanceId,
      status: "active",
    }).select("+answer");

  if (!activeAttempt) {
    return null;
  }

  if (
    activeAttempt.deadlineAt.getTime() >
    now.getTime()
  ) {
    return {
      pending: true,
      expired: false,
      deadlineAt:
        activeAttempt.deadlineAt,
    };
  }

  activeAttempt.status = "expired";
  activeAttempt.submittedAt = now;
  activeAttempt.responseTimeMs =
    QUICK_PRACTICE_LIMIT_MS;
  await activeAttempt.save();
  await recordQuickPracticeWrongNote(
    activeAttempt
  );
  await recordStudyActivity(
    userId,
    now,
    QUICK_PRACTICE_LIMIT_MS
  );

  return {
    expired: true,
    correct: false,
    solution:
      activeAttempt.solution,
    answer: activeAttempt.answer,
    responseTimeMs:
      QUICK_PRACTICE_LIMIT_MS,
    coachFeedback: getCoachView({
      mode: coachMode,
      situation: "unanswered",
      seed: instanceId,
    }),
  };
}

async function getQuickPracticeStats(
  userId
) {
  const rows =
    await QuickPracticeAttempt.aggregate([
      {
        $match: {
          userId:
            new (
              require("mongoose")
                .Types.ObjectId
            )(String(userId)),
          status: {
            $in: [
              "correct",
              "wrong",
              "expired",
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: 1,
          },
          correct: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "correct",
                  ],
                },
                1,
                0,
              ],
            },
          },
          averageMs: {
            $avg: "$responseTimeMs",
          },
        },
      },
    ]);

  const stats = rows[0] || {};

  return {
    total: Number(stats.total) || 0,
    correct:
      Number(stats.correct) || 0,
    accuracy: stats.total
      ? Math.round(
          (stats.correct /
            stats.total) *
            100
        )
      : 0,
    averageMs:
      Math.round(
        Number(stats.averageMs) || 0
      ),
  };
}

module.exports = {
  QUICK_PRACTICE_LIMIT_MS,
  createQuickPracticeAttempt,
  expireQuickPracticeAttempt,
  generateVerifiedProblem,
  getQuickPracticeCatalogSummary,
  getQuickPracticeStats,
  recordQuickPracticeWrongNote,
  syncQuickPracticeWrongNotes,
  submitQuickPracticeAttempt,
  templates,
  listQuickPracticeProblemTypes,
  quickPracticeEngineKey,
};
