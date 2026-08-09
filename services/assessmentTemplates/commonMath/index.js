const {
  generatorMap,
} = require("../../problemGenerators/commonMath/generators");
const {
  generateValidProblem,
} = require("../../problemGenerators/utils");

const UNIT_CONCEPTS = [
  {
    courseId: "common-math-1",
    unitId: "polynomials",
    conceptIds: [
      "polynomial-arithmetic",
      "identity-remainder-theorem",
      "polynomial-factorization",
    ],
  },
  {
    courseId: "common-math-1",
    unitId: "equations-and-inequalities",
    conceptIds: [
      "complex-numbers",
      "quadratic-discriminant",
      "quadratic-roots-and-coefficients",
      "quadratic-equation-and-function",
      "parabola-and-line",
      "quadratic-max-min-restricted",
      "cubic-and-quartic-equations",
      "simultaneous-quadratic-equations",
      "simultaneous-linear-inequalities",
      "absolute-linear-inequalities",
      "quadratic-inequalities",
    ],
  },
  {
    courseId: "common-math-1",
    unitId: "counting",
    conceptIds: [
      "addition-and-multiplication-principles",
      "permutations",
      "combinations",
    ],
  },
  {
    courseId: "common-math-1",
    unitId: "matrices",
    conceptIds: ["matrix-concept", "matrix-operations"],
  },
  {
    courseId: "common-math-2",
    unitId: "coordinate-geometry",
    conceptIds: [
      "distance-and-internal-division",
      "parallel-and-perpendicular-lines",
      "point-line-distance",
      "circle-equation",
      "circle-line-position",
      "geometric-translation",
      "geometric-reflection",
    ],
  },
  {
    courseId: "common-math-2",
    unitId: "sets-and-propositions",
    conceptIds: [
      "set-concept-and-representation",
      "set-inclusion",
      "set-operations",
      "proposition-and-condition",
      "converse-and-contrapositive",
      "sufficient-and-necessary-conditions",
      "proof-by-contrapositive-and-contradiction",
      "absolute-inequality",
    ],
  },
  {
    courseId: "common-math-2",
    unitId: "functions-and-graphs",
    conceptIds: [
      "function-concept-and-graph",
      "composite-function",
      "inverse-function",
      "rational-function",
      "irrational-function",
    ],
  },
];

function problemTypesForUnit({
  courseId,
  unitId,
  conceptIds,
}) {
  return conceptIds.flatMap((conceptId) => {
    const generator = generatorMap.get(
      [courseId, unitId, conceptId].join("/")
    );

    if (!generator) {
      throw new Error(
        `${courseId}/${unitId}/${conceptId}: 공통수학 문제 생성기가 없습니다.`
      );
    }

    return generator.problemTypes.map((problemType) => ({
      conceptId,
      problemType,
    }));
  });
}

function makeAdvancedTemplates(config) {
  const records = problemTypesForUnit(config);

  if (records.length < 20) {
    throw new Error(
      `${config.courseId}/${config.unitId}: 평가용 유형이 20개 미만입니다.`
    );
  }

  return records.slice(0, 20).map(({ conceptId, problemType }, index) => {
    const generateAdvancedProblem = () => {
      const problem = generateValidProblem(problemType);
      return {
        ...problem,
        prompt:
          `다음은 ${problemType.label}을 여러 조건과 함께 판단하는 심화 문항입니다. ` +
          problem.prompt,
      };
    };

    return ({
    id: `${config.courseId}:${config.unitId}:advanced:${problemType.id}`,
    title: `심화 유형 ${index + 1} · ${problemType.label}`,
    difficulty: 4,
    level: "advanced",
    estimatedMinutes: 10,
    reasoningSteps: [
      "문제의 대상과 성립 조건을 식·표·그래프 중 알맞은 표현으로 바꾼다.",
      "핵심 정의와 관계식을 적용해 가능한 결론을 단계적으로 좁힌다.",
      "구한 결과를 원래 조건에 다시 대입해 정의역·부호·중복을 검산한다.",
    ],
    requiredConceptIds: [conceptId],
    stages: [
      {
        id: "learned-concepts-only",
        requiredConceptIds: [conceptId],
        generate: generateAdvancedProblem,
      },
    ],
    referenceArchetypeId: problemType.id,
    sourcePattern: "공통수학 정의·조건·시각표현을 결합한 다단계 추론",
    generate: generateAdvancedProblem,
    validate(problem) {
      return (
        Array.isArray(problem?.validityChecks) &&
        problem.validityChecks.every((check) => check.passed)
      );
    },
    });
  });
}

const configs = UNIT_CONCEPTS.map((config) => ({
  ...config,
  requiredConceptIds: config.conceptIds.slice(),
  minimumAppliedPoolSize: 15,
  appliedPolicy: {
    includeBankTypes: false,
    minimumLocalDifficulty: 2,
  },
  advancedTemplates: makeAdvancedTemplates(config),
}));

module.exports = configs;
