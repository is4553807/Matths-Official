const {
  answersEquivalent,
} = require("./mathAnswerService");

function scoreArenaAttempt({ attempt, problemPack }) {
  const answerByKey = new Map(
    (attempt?.answers || []).map((answer) => [
      String(answer.questionKey),
      String(answer.value ?? ""),
    ])
  );
  const timingByKey = new Map(
    (attempt?.questionTimings || []).map((timing) => [
      String(timing.questionKey),
      timing.responseTimeMs === null ||
      timing.responseTimeMs === undefined ||
      !Number.isFinite(Number(timing.responseTimeMs))
        ? null
        : Math.max(0, Number(timing.responseTimeMs)),
    ])
  );
  const questionResults = (problemPack?.questions || []).map((question) => {
    const submittedAnswer = answerByKey.get(String(question.questionKey)) || "";
    const correct = answersEquivalent(question.answer, submittedAnswer);
    return {
      questionKey: String(question.questionKey),
      correct,
      pointsAwarded: correct ? Number(question.points || 0) : 0,
      responseTimeMs:
        timingByKey.get(String(question.questionKey)) ?? null,
    };
  });
  return {
    score: questionResults.reduce(
      (sum, result) => sum + result.pointsAwarded,
      0
    ),
    correctCount: questionResults.filter((result) => result.correct).length,
    correctAnswerSolveTimeMs: (() => {
      const correctResults = questionResults.filter(
        (result) => result.correct
      );
      return correctResults.some(
        (result) => result.responseTimeMs === null
      )
        ? null
        : correctResults.reduce(
            (sum, result) => sum + result.responseTimeMs,
            0
          );
    })(),
    totalSolveTimeMs:
      attempt?.activeSolveTimeMs === null ||
      attempt?.activeSolveTimeMs === undefined ||
      !Number.isFinite(Number(attempt.activeSolveTimeMs))
        ? null
        : Math.max(0, Number(attempt.activeSolveTimeMs)),
    questionResults,
  };
}

function compareArenaAttemptScores(challengerScore, defenderScore) {
  const rules = ARENA_SCORING_PRIORITY;
  for (const [key, direction] of rules) {
    const challengerValue = challengerScore?.[key];
    const defenderValue = defenderScore?.[key];
    const challengerRaw =
      challengerValue === null || challengerValue === undefined
        ? Number.NaN
        : Number(challengerValue);
    const defenderRaw =
      defenderValue === null || defenderValue === undefined
        ? Number.NaN
        : Number(defenderValue);
    const missingValue =
      direction === "DESC"
        ? Number.NEGATIVE_INFINITY
        : Number.POSITIVE_INFINITY;
    const challenger = Number.isFinite(challengerRaw)
      ? challengerRaw
      : missingValue;
    const defender = Number.isFinite(defenderRaw)
      ? defenderRaw
      : missingValue;
    if (challenger === defender) continue;
    const challengerWins =
      direction === "DESC" ? challenger > defender : challenger < defender;
    return challengerWins ? "CHALLENGER" : "DEFENDER";
  }
  return "DEFENDER";
}

const ARENA_SCORING_PRIORITY = [
    ["score", "DESC"],
    ["correctCount", "DESC"],
    ["correctAnswerSolveTimeMs", "ASC"],
    ["totalSolveTimeMs", "ASC"],
  ];

module.exports = {
  ARENA_SCORING_PRIORITY,
  compareArenaAttemptScores,
  scoreArenaAttempt,
};
