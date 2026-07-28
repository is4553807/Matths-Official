const {
  getProblemGenerator,
} = require("./problemGenerators");
const {
  generateValidProblem,
} = require("./problemGenerators/utils");
const {
  formatMathTextForCourse,
} = require("./mathTextService");

function koreanizeGuideText(value) {
  return String(value || "")
      .replace(
        /\bcoefficient\b/gi,
        "계수"
      )
      .replace(
        /\bvertexX\b/g,
        "꼭짓점의 x좌표"
      )
      .replace(
        /\bshift\b/gi,
        "평행이동한 값"
      )
      .replace(
        /\broot\b/gi,
        "근"
      )
      .replace(
        /\bzero\b/gi,
        "영점"
      )
      .replace(
        /\bscale\b/gi,
        "배율"
      );
}

function formatProblemText(courseId, value) {
  return formatMathTextForCourse(
    courseId,
    koreanizeGuideText(value)
  );
}

function buildProblemTypeGuide({
  courseId,
  problemType,
  problem,
  order = 1,
}) {
  return {
    id: problemType.id,
    order,
    title: koreanizeGuideText(
      problemType.label ||
        `유형 ${order}`
    ),
    difficulty:
      Number(
        problemType.difficulty
      ) || 1,
    prompt: formatProblemText(
      courseId,
      problem.prompt
    ),
    choices: (
      problem.choices || []
    ).map((choice) => ({
      ...choice,
      text: formatProblemText(
        courseId,
        choice.text
      ),
    })),
    hint: formatProblemText(
      courseId,
      problem.hintText
    ),
    solution: formatProblemText(
      courseId,
      problem.solution
    ),
    usesGraph: Boolean(
      problem.visualization
    ),
  };
}

function getConceptTypeGuides({
  courseId,
  unitId,
  conceptId,
}) {
  const generator = getProblemGenerator({
    courseId,
    unitId,
    conceptId,
  });

  if (!generator?.problemTypes?.length) {
    return [];
  }

  return generator.problemTypes.map(
    (problemType, index) => {
      try {
        const sample =
          generateValidProblem(
            problemType
          );

        return buildProblemTypeGuide({
          courseId,
          problemType,
          problem: sample,
          order: index + 1,
        });
      } catch (error) {
        console.error(
          `${conceptId} 유형 설명 생성 실패:`,
          error.message
        );
        return null;
      }
    }
  ).filter(Boolean);
}

module.exports = {
  buildProblemTypeGuide,
  getConceptTypeGuides,
};
