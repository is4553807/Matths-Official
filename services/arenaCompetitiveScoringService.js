/* Shared production scoring contract for different-question normal/competitive matches. */
const SCORING_VERSION = "ARENA22-DIFFICULTY-CORRECTNESS-TIME-V1";

function scoringError(message, code) {
  return Object.assign(new Error(message), { status: 422, code });
}

function calculateCompetitivePerformance({ questions, totalSolveTimeMs }) {
  if (!Array.isArray(questions) || questions.length !== 5) {
    throw scoringError("Competitive performance requires five actual question results.", "ARENA_COMPETITIVE_QUESTIONS_INVALID");
  }
  const observations = questions.map((question, index) => {
    if (!question || typeof question !== "object") {
      throw scoringError("An actual question result is required.", "ARENA_COMPETITIVE_QUESTIONS_INVALID");
    }
    const { correct, sourceAccuracyRate } = question;
    if (![true, false, 0, 1].includes(correct)) {
      throw scoringError("Correctness must be determined by the server.", "ARENA_COMPETITIVE_CORRECTNESS_INVALID");
    }
    // Accept decimals only. Never infer percentages, impute missing data, clamp
    // extreme rates, or modify the original source evidence without a policy.
    if (typeof sourceAccuracyRate !== "number" || !Number.isFinite(sourceAccuracyRate) || sourceAccuracyRate <= 0 || sourceAccuracyRate >= 1) {
      throw scoringError("An exact, non-extreme source accuracy rate is required.", "ARENA_COMPETITIVE_ACCURACY_INVALID");
    }
    return { slot: index + 1, questionKey: typeof question.questionKey === "string" ? question.questionKey : null,
      x: correct === true || correct === 1 ? 1 : 0, p: sourceAccuracyRate, adjustment: "NONE" };
  });
  const correctCount = observations.reduce((sum, item) => sum + item.x, 0);
  const expectedCorrect = observations.reduce((sum, item) => sum + item.p, 0);
  const variance = observations.reduce((sum, item) => sum + item.p * (1 - item.p), 0);
  const z = (correctCount - expectedCorrect) / Math.sqrt(variance);
  if (!(variance > 0) || !Number.isFinite(z)) {
    throw scoringError("The source rates do not support a numerically valid score.", "ARENA_COMPETITIVE_VARIANCE_INVALID");
  }
  return { scoringVersion: SCORING_VERSION, observations, correctCount, expectedCorrect, variance, z,
    totalSolveTimeMs: typeof totalSolveTimeMs === "number" && Number.isFinite(totalSolveTimeMs) && totalSolveTimeMs > 0
      ? totalSolveTimeMs : null };
}

function compareCompetitivePerformance(challenger, historicalOpponent, { closeScoreThreshold } = {}) {
  if (typeof closeScoreThreshold !== "number" || !Number.isFinite(closeScoreThreshold) || closeScoreThreshold < 0) {
    throw scoringError("An explicitly configured close-score threshold is required.", "ARENA_COMPETITIVE_THRESHOLD_REQUIRED");
  }
  const competitors = [challenger, historicalOpponent];
  if (competitors.some((item) => item?.scoringVersion !== SCORING_VERSION || !Number.isFinite(item?.z))) {
    throw scoringError("Both competitors must use the same valid scoring version.", "ARENA_COMPETITIVE_PERFORMANCE_INVALID");
  }
  const audit = { scoringVersion: SCORING_VERSION, closeScoreThreshold,
    comparisonPolicy: "DIFFICULTY_CORRECTNESS_TIME_V1",
    challenger: structuredClone(challenger), historicalOpponent: structuredClone(historicalOpponent),
    zDifference: challenger.z - historicalOpponent.z };
  // Invalid required timing is explicitly invalid, not an invented draw or a
  // rated outcome. Upload/camera time must already be excluded by the caller.
  if (competitors.some((item) => typeof item.totalSolveTimeMs !== "number" || !Number.isFinite(item.totalSolveTimeMs) || item.totalSolveTimeMs <= 0)) {
    return { ...audit, valid: false, winnerRole: null, reason: "INVALID_SOLVE_TIME", explanation: "유효 풀이 시간 기록을 확인할 수 없어 공식 경기로 판정하지 않았습니다." };
  }
  if (Math.abs(audit.zDifference) > closeScoreThreshold) {
    const winnerRole = audit.zDifference > 0 ? "CHALLENGER" : "DEFENDER";
    return { ...audit, valid: true, winnerRole, reason: "DIFFICULTY_ADJUSTED_PERFORMANCE",
      explanation: `정오답과 문항 난도를 함께 반영한 내부 성취 지표가 더 높아 ${winnerRole === "CHALLENGER" ? "내가" : "상대가"} 이겼습니다. 풀이 시간은 두 지표가 근소할 때만 보조 기준으로 사용합니다.` };
  }
  if (challenger.totalSolveTimeMs === historicalOpponent.totalSolveTimeMs) {
    return { ...audit, valid: true, winnerRole: null, reason: "DRAW", explanation: "성취 점수 차이가 설정된 근소 범위 안이고 유효 풀이 시간도 같아 무승부입니다." };
  }
  const winnerRole = challenger.totalSolveTimeMs < historicalOpponent.totalSolveTimeMs ? "CHALLENGER" : "DEFENDER";
  return { ...audit, valid: true, winnerRole, reason: "CLOSE_SCORE_SOLVE_TIME",
    explanation: `정오답과 문항 난도를 반영한 내부 성취 지표가 근소하여, 더 짧은 유효 풀이 시간으로 ${winnerRole === "CHALLENGER" ? "내가" : "상대가"} 이겼습니다. 풀이 사진 촬영·업로드 시간은 포함하지 않습니다.` };
}

function compareCountThenTimePerformance(challenger, historicalOpponent) {
  const competitors = [challenger, historicalOpponent];
  if (competitors.some((item) =>
    item?.scoringVersion !== SCORING_VERSION ||
    !Number.isFinite(item?.z) ||
    !Number.isSafeInteger(item?.correctCount) ||
    item.correctCount < 0 ||
    item.correctCount > 5
  )) {
    throw scoringError("Both competitors must use the same valid scoring version.", "ARENA_COMPARISON_PERFORMANCE_INVALID");
  }
  const audit = {
    scoringVersion: SCORING_VERSION,
    comparisonPolicy: "CORRECT_COUNT_THEN_SOLVE_TIME_V1",
    challenger: structuredClone(challenger),
    historicalOpponent: structuredClone(historicalOpponent),
    correctCountDifference: challenger.correctCount - historicalOpponent.correctCount,
    zDifference: challenger.z - historicalOpponent.z,
  };
  if (competitors.some((item) =>
    typeof item.totalSolveTimeMs !== "number" ||
    !Number.isFinite(item.totalSolveTimeMs) ||
    item.totalSolveTimeMs <= 0
  )) {
    return {
      ...audit,
      valid: false,
      winnerRole: null,
      reason: "INVALID_SOLVE_TIME",
      explanation: "유효 풀이 시간 기록을 확인할 수 없어 공식 경기로 판정하지 않았습니다.",
    };
  }
  if (audit.correctCountDifference !== 0) {
    const winnerRole = audit.correctCountDifference > 0 ? "CHALLENGER" : "DEFENDER";
    return {
      ...audit,
      valid: true,
      winnerRole,
      reason: "MORE_CORRECT_ANSWERS",
      explanation: `정답 수가 ${challenger.correctCount} 대 ${historicalOpponent.correctCount}로 ${winnerRole === "CHALLENGER" ? "내가" : "상대가"} 이겼습니다. 서로 다른 문제 세트의 Z-score는 난도 비교 정보로 함께 표시합니다.`,
    };
  }
  if (challenger.totalSolveTimeMs === historicalOpponent.totalSolveTimeMs) {
    return {
      ...audit,
      valid: true,
      winnerRole: null,
      reason: "DRAW",
      explanation: `정답 수가 ${challenger.correctCount} 대 ${historicalOpponent.correctCount}로 같고 유효 풀이 시간도 같아 무승부입니다.`,
    };
  }
  const winnerRole = challenger.totalSolveTimeMs < historicalOpponent.totalSolveTimeMs
    ? "CHALLENGER"
    : "DEFENDER";
  return {
    ...audit,
    valid: true,
    winnerRole,
    reason: "EQUAL_CORRECT_FASTER_SOLVE_TIME",
    explanation: `정답 수가 ${challenger.correctCount} 대 ${historicalOpponent.correctCount}로 같아 유효 풀이 시간이 더 짧은 ${winnerRole === "CHALLENGER" ? "내가" : "상대가"} 이겼습니다. 풀이 촬영·업로드 시간은 포함하지 않습니다.`,
  };
}

module.exports = {
  SCORING_VERSION,
  calculateCompetitivePerformance,
  compareCompetitivePerformance,
  compareCountThenTimePerformance,
};
