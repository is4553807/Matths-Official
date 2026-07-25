const fs = require("node:fs");
const path = require("node:path");

const functionLimit = require(
  "../services/problemGenerators/calculus1/functionLimit"
);
const limitPropertiesAndCalculation = require(
  "../services/problemGenerators/calculus1/limitPropertiesAndCalculation"
);
const functionContinuity = require(
  "../services/problemGenerators/calculus1/functionContinuity"
);
const continuousFunctionProperties = require(
  "../services/problemGenerators/calculus1/continuousFunctionProperties"
);
const {
  generators: advancedCalculusGenerators,
} = require(
  "../services/problemGenerators/calculus1/advancedCalculus"
);
const {
  generateValidProblem,
} = require("../services/problemGenerators/utils");

const requestedRuns = Number(
  process.argv[2] || 1000
);
const runsPerType =
  Number.isInteger(requestedRuns) &&
  requestedRuns > 0
    ? requestedRuns
    : 1000;

const generators = [
  functionLimit,
  limitPropertiesAndCalculation,
  functionContinuity,
  continuousFunctionProperties,
  ...advancedCalculusGenerators,
];
const graphHintGeneratorKeys = new Set([
  functionLimit.key,
  functionContinuity.key,
  continuousFunctionProperties.key,
  ...advancedCalculusGenerators.map(
    (generator) => generator.key
  ),
]);
const wrongNoteRenderer =
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "public/js/wrong-note-review.js"
    ),
    "utf8"
  );

let generatedCount = 0;

for (const generator of generators) {
  for (const problemType of generator.problemTypes) {
    const variants = new Set();

    for (
      let run = 0;
      run < runsPerType;
      run += 1
    ) {
      const problem =
        generateValidProblem(problemType);

      if (
        graphHintGeneratorKeys.has(
          generator.key
        ) &&
        !problem.visualization
      ) {
        throw new Error(
          `${generator.key}/${problemType.id}: 그래프 개념인데 오답 힌트 시각화가 없습니다.`
        );
      }

      if (
        problem.visualization?.kind &&
        !wrongNoteRenderer.includes(
          `"${problem.visualization.kind}"`
        ) &&
        !(
          problem.visualization.kind.startsWith(
            "calculus-"
          ) &&
          wrongNoteRenderer.includes(
            'startsWith("calculus-")'
          )
        )
      ) {
        throw new Error(
          `${generator.key}/${problemType.id}: 오답 노트가 ${problem.visualization.kind} 시각화를 그릴 수 없습니다.`
        );
      }

      variants.add(
        JSON.stringify({
          prompt: problem.prompt,
          choices: problem.choices || [],
        })
      );
      generatedCount += 1;
    }

    if (
      runsPerType > 1 &&
      variants.size < 2
    ) {
      throw new Error(
        `${generator.key}/${problemType.id}: 반복 생성해도 문제 값 또는 보기가 바뀌지 않습니다.`
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
  )}개 문제를 검증했습니다.`
);
