const {
  isCorrectAnswer,
} = require(
  "../problemGenerators/utils"
);

function randomInteger(min, max) {
  return (
    Math.floor(
      Math.random() *
        (max - min + 1)
    ) + min
  );
}

function choose(values) {
  return values[
    randomInteger(
      0,
      values.length - 1
    )
  ];
}

function nonZeroInteger(
  min = -5,
  max = 5
) {
  let value = 0;

  while (value === 0) {
    value = randomInteger(
      min,
      max
    );
  }

  return value;
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
  if (denominator === 0) {
    throw new Error(
      "분모는 0일 수 없습니다."
    );
  }

  const sign =
    denominator < 0 ? -1 : 1;
  const common = gcd(
    numerator,
    denominator
  );
  const top =
    (sign * numerator) / common;
  const bottom =
    Math.abs(denominator) /
    common;

  return bottom === 1
    ? String(top)
    : `${top}/${bottom}`;
}

function nCr(n, r) {
  if (
    r < 0 ||
    r > n ||
    !Number.isInteger(n) ||
    !Number.isInteger(r)
  ) {
    return 0;
  }

  const k = Math.min(r, n - r);
  let value = 1;

  for (
    let index = 1;
    index <= k;
    index += 1
  ) {
    value =
      (value *
        (n - k + index)) /
      index;
  }

  return Math.round(value);
}

function power(value, exponent) {
  return value ** exponent;
}

function signed(value) {
  if (value === 0) return "";
  return value > 0
    ? `+${value}`
    : `${value}`;
}

function polynomialTerm(
  coefficient,
  exponent,
  variable = "x"
) {
  if (coefficient === 0) return "";

  const magnitude =
    Math.abs(coefficient);
  const coefficientText =
    exponent > 0 &&
    magnitude === 1
      ? ""
      : String(magnitude);
  const variableText =
    exponent === 0
      ? ""
      : exponent === 1
        ? variable
        : `${variable}^{${exponent}}`;

  return `${
    coefficient < 0 ? "-" : ""
  }${coefficientText}${variableText}`;
}

function polynomialTex(
  coefficients,
  variable = "x"
) {
  let result = "";

  for (
    let exponent =
      coefficients.length - 1;
    exponent >= 0;
    exponent -= 1
  ) {
    const coefficient =
      coefficients[exponent];

    if (!coefficient) continue;

    const term = polynomialTerm(
      coefficient,
      exponent,
      variable
    );

    if (!result) {
      result = term;
    } else if (coefficient > 0) {
      result += `+${term}`;
    } else {
      result += term;
    }
  }

  return result || "0";
}

function linearFactor(
  root,
  variable = "x"
) {
  if (root === 0) return variable;
  return root > 0
    ? `${variable}-${root}`
    : `${variable}+${Math.abs(
        root
      )}`;
}

function finiteAnswer(answer) {
  if (typeof answer === "number") {
    return Number.isFinite(answer);
  }

  const value = String(answer).trim();
  return Boolean(value) &&
    !/NaN|Infinity|undefined|null/.test(
      value
    );
}

function makeShortAnswer({
  prompt,
  answer,
  independentAnswer,
  solution,
  hintText,
  visualization = null,
  checks = [],
}) {
  const verified =
    independentAnswer === undefined
      ? answer
      : independentAnswer;

  return {
    prompt,
    inputMode: "short-answer",
    choices: [],
    answer,
    solution,
    hintText,
    visualization,
    validityChecks: [
      {
        name: "finite-answer",
        passed:
          finiteAnswer(answer),
        message:
          "정답이 유한한 값이어야 합니다.",
      },
      {
        name:
          "independent-solution-check",
        passed: isCorrectAnswer(
          answer,
          verified
        ),
        message:
          "생성식과 독립 검산식의 답이 다릅니다.",
      },
      {
        name: "unique-solution",
        passed: true,
        message:
          "주어진 조건에서 정답이 하나로 결정되어야 합니다.",
      },
      ...checks,
    ],
  };
}

function defineAdvancedTemplates({
  courseId,
  unitId,
  requiredConceptIds,
  families,
}) {
  return families.flatMap(
    (family, familyIndex) =>
      [0, 1].map((mode) => {
        const reasoningSteps =
          family.reasoningSteps[
            mode
          ] ||
          family.reasoningSteps[0];
        const title =
          family.titles[mode];
        const id =
          `${courseId}:${unitId}:advanced:${family.id}-${mode + 1}`;
        const templateRequiredConceptIds =
          (
            family.requiredConceptIds ||
            requiredConceptIds
          ).slice();

        if (
          !Array.isArray(
            reasoningSteps
          ) ||
          reasoningSteps.length < 3
        ) {
          throw new Error(
            `${id}: 심화 유형은 풀이 단계가 3개 이상이어야 합니다.`
          );
        }

        return {
          id,
          title,
          difficulty: 4,
          level: "advanced",
          estimatedMinutes:
            family.estimatedMinutes?.[
              mode
            ] ||
            family.estimatedMinutes ||
            10,
          reasoningSteps,
          requiredConceptIds:
            templateRequiredConceptIds,
          stages: (
            family.stages || [
              {
                id:
                  family.stageId ||
                  "learned-concepts-only",
                requiredConceptIds:
                  templateRequiredConceptIds,
                generate:
                  family.generate,
              },
            ]
          ).map((stage) => ({
            id: stage.id,
            requiredConceptIds:
              (
                stage.requiredConceptIds ||
                templateRequiredConceptIds
              ).slice(),
            generate: () =>
              stage.generate(mode),
          })),
          referenceArchetypeId:
            family.referenceArchetypeId ||
            family.id,
          sourcePattern:
            family.sourcePattern,
          generate() {
            return family.generate(
              mode
            );
          },
          validate(problem) {
            return (
              finiteAnswer(
                problem.answer
              ) &&
              problem.validityChecks.every(
                (check) =>
                  check.passed
              )
            );
          },
        };
      })
  );
}

function selectDeepestLearnedStage(
  stages,
  allowedConceptIds
) {
  const allowed = new Set(
    allowedConceptIds
  );

  return stages
    .filter((stage) =>
      (
        stage.requiredConceptIds ||
        []
      ).every((conceptId) =>
        allowed.has(conceptId)
      )
    )
    .sort(
      (left, right) =>
        (
          right.requiredConceptIds ||
          []
        ).length -
        (
          left.requiredConceptIds ||
          []
        ).length
    )[0] || null;
}

module.exports = {
  randomInteger,
  choose,
  nonZeroInteger,
  gcd,
  fraction,
  nCr,
  power,
  signed,
  polynomialTerm,
  polynomialTex,
  linearFactor,
  makeShortAnswer,
  defineAdvancedTemplates,
  selectDeepestLearnedStage,
};
