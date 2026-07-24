const fs = require("fs");
const path = require("path");

const {
  generateValidProblem,
} = require("../services/problemGenerators/utils");

const generatorDirectory = path.resolve(
  __dirname,
  "..",
  "services",
  "problemGenerators",
  "algebra"
);
const requestedRuns = Number(
  process.argv[2] || 1000
);
const runsPerType =
  Number.isInteger(requestedRuns) &&
  requestedRuns > 0
    ? requestedRuns
    : 1000;
const unwrappedMathPattern =
  /[A-Za-z0-9πθΣ√∛∞₀-₉ₙₖ⁰-⁹ⁿᵏ≤≥≠×÷−°]/;

function assertMathIsWrapped(
  value,
  context
) {
  const outsideMath = String(value || "")
    .replace(/\\\([\s\S]*?\\\)/g, "")
    .replace(/\\\[[\s\S]*?\\\]/g, "");

  if (unwrappedMathPattern.test(outsideMath)) {
    throw new Error(
      `${context}: LaTeX 밖에 수식 문자가 남아 있습니다.`
    );
  }
}

const generatorFiles = fs
  .readdirSync(generatorDirectory)
  .filter(
    (file) =>
      file.endsWith(".js") &&
      file !== "helpers.js"
  )
  .sort();

let generatedCount = 0;

for (const file of generatorFiles) {
  const generator = require(
    path.join(generatorDirectory, file)
  );

  for (const problemType of generator.problemTypes) {
    const variationFingerprints = new Set();

    for (
      let run = 0;
      run < runsPerType;
      run += 1
    ) {
      const problem =
        generateValidProblem(problemType);
      const context =
        `${generator.key}/${problemType.id}`;

      assertMathIsWrapped(
        problem.prompt,
        `${context}/prompt`
      );
      assertMathIsWrapped(
        problem.solution,
        `${context}/solution`
      );
      assertMathIsWrapped(
        problem.hintText,
        `${context}/hint`
      );

      for (const choice of problem.choices || []) {
        assertMathIsWrapped(
          choice.text,
          `${context}/choice`
        );
      }

      variationFingerprints.add(
        JSON.stringify({
          prompt: problem.prompt,
          choices: problem.choices || [],
        })
      );
      generatedCount += 1;
    }

    if (
      runsPerType > 1 &&
      variationFingerprints.size < 2
    ) {
      throw new Error(
        `${generator.key}/${problemType.id}: ` +
          "같은 유형의 실제 문제 변형이 2개 미만입니다."
      );
    }
  }

  console.log(
    `✓ ${generator.key}: ${generator.problemTypes.length}개 유형 통과`
  );
}

console.log(
  `총 ${generatedCount.toLocaleString(
    "ko-KR"
  )}개 대수 문제를 검증했습니다.`
);
