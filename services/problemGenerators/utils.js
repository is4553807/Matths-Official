function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nonZeroInteger(min = -5, max = 5) {
  let value = 0;

  while (value === 0) {
    value = randomInteger(min, max);
  }

  return value;
}

function parseNumber(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");

  if (/^-?\d+\/-?\d+$/.test(normalized)) {
    const [numerator, denominator] = normalized
      .split("/")
      .map(Number);

    if (denominator === 0) {
      return Number.NaN;
    }

    return numerator / denominator;
  }

  return Number(normalized);
}

function isCorrectAnswer(expected, submitted) {
  if (typeof expected === "number") {
    const submittedNumber = parseNumber(submitted);

    return (
      Number.isFinite(submittedNumber) &&
      Math.abs(submittedNumber - expected) < 0.0001
    );
  }

  return (
    String(expected).trim().toLowerCase() ===
    String(submitted ?? "").trim().toLowerCase()
  );
}

class InvalidGeneratedProblemError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidGeneratedProblemError";
  }
}

function hasOnlyFiniteNumbers(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(hasOnlyFiniteNumbers);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.values(value).every(
      hasOnlyFiniteNumbers
    );
  }

  return true;
}

function validateGeneratedProblem(
  problem,
  problemType
) {
  const typeLabel =
    problemType?.id || "unknown-type";

  if (!problem || typeof problem !== "object") {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 생성 결과가 객체가 아닙니다.`
    );
  }

  if (
    typeof problem.prompt !== "string" ||
    !problem.prompt.trim()
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 문제 문장이 비어 있습니다.`
    );
  }

  const dollarCount = (
    problem.prompt.match(/\$/g) ||
    []
  ).length;

  if (dollarCount % 2 !== 0) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 문제의 수식 구분자($)가 닫히지 않았습니다.`
    );
  }

  if (
    !["short-answer", "multiple-choice"].includes(
      problem.inputMode
    )
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 지원하지 않는 입력 방식입니다.`
    );
  }

  if (
    problem.answer === undefined ||
    problem.answer === null ||
    String(problem.answer).trim() === ""
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 정답이 비어 있습니다.`
    );
  }

  if (
    typeof problem.answer === "number" &&
    !Number.isFinite(problem.answer)
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 정답이 유한한 수가 아닙니다.`
    );
  }

  if (
    typeof problem.solution !== "string" ||
    !problem.solution.trim()
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 풀이가 비어 있습니다.`
    );
  }

  if (
    typeof problem.hintText !== "string" ||
    !problem.hintText.trim()
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 힌트가 비어 있습니다.`
    );
  }

  if (problem.inputMode === "multiple-choice") {
    if (
      !Array.isArray(problem.choices) ||
      problem.choices.length < 2
    ) {
      throw new InvalidGeneratedProblemError(
        `${typeLabel}: 객관식 보기가 부족합니다.`
      );
    }

    const choiceKeys = problem.choices.map(
      (choice) => String(choice.key)
    );
    const choiceTexts =
      problem.choices.map(
        (choice) =>
          String(choice.text)
            .replace(/\s+/g, "")
            .trim()
      );
    const uniqueChoiceKeys = new Set(choiceKeys);
    const uniqueChoiceTexts = new Set(
      choiceTexts
    );

    if (
      uniqueChoiceKeys.size !==
      choiceKeys.length
    ) {
      throw new InvalidGeneratedProblemError(
        `${typeLabel}: 객관식 보기 키가 중복됩니다.`
      );
    }

    if (
      !uniqueChoiceKeys.has(
        String(problem.answer)
      )
    ) {
      throw new InvalidGeneratedProblemError(
        `${typeLabel}: 정답과 일치하는 보기가 없습니다.`
      );
    }

    if (
      uniqueChoiceTexts.size !==
      choiceTexts.length
    ) {
      throw new InvalidGeneratedProblemError(
        `${typeLabel}: 같은 내용의 보기가 중복됩니다.`
      );
    }
  }

  if (
    problem.visualization &&
    !hasOnlyFiniteNumbers(
      problem.visualization
    )
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 그래프 데이터에 유효하지 않은 수가 있습니다.`
    );
  }

  const validityChecks = Array.isArray(
    problem.validityChecks
  )
    ? problem.validityChecks
    : [];

  const failedCheck = validityChecks.find(
    (check) => !check?.passed
  );

  if (failedCheck) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: ${
        failedCheck.message ||
        failedCheck.name ||
        "수학적 출제 조건을 만족하지 않습니다."
      }`
    );
  }

  if (
    typeof problemType?.validate ===
      "function" &&
    !problemType.validate(problem)
  ) {
    throw new InvalidGeneratedProblemError(
      `${typeLabel}: 유형별 검증에 실패했습니다.`
    );
  }

  return true;
}

function generateValidProblem(
  problemType,
  maximumAttempts = 30
) {
  let lastValidationError = null;

  for (
    let attempt = 0;
    attempt < maximumAttempts;
    attempt += 1
  ) {
    let problem = null;

    try {
      problem = problemType.generate();
      validateGeneratedProblem(
        problem,
        problemType
      );
      return problem;
    } catch (error) {
      if (
        !(
          error instanceof
          InvalidGeneratedProblemError
        )
      ) {
        throw error;
      }

      lastValidationError = error;
    }
  }

  const error = new Error(
    `유효한 문제를 생성하지 못했습니다: ${
      problemType?.id || "unknown-type"
    }`
  );
  error.cause = lastValidationError;
  error.status = 503;
  throw error;
}

module.exports = {
  randomInteger,
  nonZeroInteger,
  isCorrectAnswer,
  validateGeneratedProblem,
  generateValidProblem,
};
