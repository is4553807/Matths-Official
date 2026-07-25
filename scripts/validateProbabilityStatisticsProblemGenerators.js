const {
  generators,
} = require(
  "../services/problemGenerators/probabilityStatistics/generators"
);
const {
  generateValidProblem,
} = require("../services/problemGenerators/utils");

function answerValue(problem) {
  if (problem.inputMode === "multiple-choice") {
    return problem.answer;
  }
  return String(problem.answer);
}

function validateGenerator(generator, iterations) {
  if (generator.problemTypes.length !== 10) {
    throw new Error(
      `${generator.conceptId}: 문제 유형이 10개가 아닙니다.`
    );
  }

  for (const problemType of generator.problemTypes) {
    const variants = new Set();

    for (
      let iteration = 0;
      iteration < iterations;
      iteration += 1
    ) {
      const problem =
        generateValidProblem(problemType);
      const submitted = answerValue(problem);

      if (
        !generator.isCorrectAnswer(
          problem.answer,
          submitted
        )
      ) {
        throw new Error(
          `${generator.conceptId}/${problemType.id}: 정답 판정에 실패했습니다.`
        );
      }

      variants.add(
        JSON.stringify({
          prompt: problem.prompt,
          choices: problem.choices || [],
        })
      );
    }

    if (
      iterations > 1 &&
      variants.size < 2
    ) {
      throw new Error(
        `${generator.conceptId}/${problemType.id}: 반복 생성해도 문제 값 또는 보기가 바뀌지 않습니다.`
      );
    }
  }
}

function run() {
  const iterations = Math.max(
    1,
    Number(process.argv[2]) || 100
  );

  generators.forEach((generator) =>
    validateGenerator(generator, iterations)
  );

  console.log(
    `확통 ${generators.length}개 개념, ${
      generators.length * 10
    }개 유형, ${
      generators.length * 10 * iterations
    }문제 검증 완료`
  );
}

run();
