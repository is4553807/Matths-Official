const { createHash } = require("node:crypto");
const { normalizeAnswerText } = require("./mathAnswerService");

const ARENA_GENERATED_ANSWER_SCHEMA_VERSION =
  "ARENA_GENERATED_ANSWER_V1";

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function normalizeSolutionProcess(problem) {
  const provided = Array.isArray(problem?.solutionProcess)
    ? problem.solutionProcess
    : [];
  if (provided.length) {
    return provided.map((step, index) => ({
      step: index + 1,
      title: String(step?.title || `${index + 1}단계`),
      expression: String(step?.expression || ""),
      explanation: String(step?.explanation || ""),
    }));
  }
  const fallback = String(problem?.solution || "").trim();
  return fallback
    ? [
        {
          step: 1,
          title: "풀이",
          expression: "",
          explanation: fallback,
        },
      ]
    : [];
}

function buildArenaGeneratedAnswerKey({
  typeId,
  problem,
  parameters = {},
  validation = {},
} = {}) {
  const correctAnswer = String(problem?.answer ?? "").trim();
  if (!correctAnswer) {
    throw new Error("생성 문항의 정답 JSON을 만들 수 없습니다.");
  }
  const payload = {
    schemaVersion: ARENA_GENERATED_ANSWER_SCHEMA_VERSION,
    typeId: String(typeId || problem?.typeId || "").trim(),
    inputMode: String(problem?.inputMode || "short-answer"),
    gradingMode: "MATHEMATICAL_EQUIVALENCE",
    correctAnswer,
    normalizedAnswer: normalizeAnswerText(correctAnswer),
    acceptedAnswers: [correctAnswer],
    parameterSnapshot: stableValue(parameters || {}),
    solutionProcess: normalizeSolutionProcess(problem),
    finalCheck: String(problem?.finalCheck || ""),
    validation: {
      passed: validation?.passed === true,
      solvable: validation?.solvable === true,
      uniqueAnswer: validation?.uniqueAnswer === true,
      calculatorFree: validation?.calculatorFree === true,
      answerMatches: validation?.answerMatches === true,
    },
  };
  return {
    ...payload,
    contentHash: createHash("sha256")
      .update(JSON.stringify(stableValue(payload)), "utf8")
      .digest("hex"),
  };
}

module.exports = {
  ARENA_GENERATED_ANSWER_SCHEMA_VERSION,
  buildArenaGeneratedAnswerKey,
  normalizeSolutionProcess,
};
