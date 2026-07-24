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
];

let generatedCount = 0;

for (const generator of generators) {
  for (const problemType of generator.problemTypes) {
    for (
      let run = 0;
      run < runsPerType;
      run += 1
    ) {
      generateValidProblem(problemType);
      generatedCount += 1;
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
