const mongoose = require("mongoose");
const {
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  scoreArenaAttempt,
} = require("./arenaMatchScoringService");
const {
  availableArenaProblemTypes,
} = require("./arenaProblemDataService");

const DEFAULT_MATCH_LIMIT = 100;
const WEAK_CORRECT_RATE_MAX = 59;
const STRONG_CORRECT_RATE_MIN = 70;
const INSIGHT_LIST_LIMIT = 8;

const COURSE_LABELS = {
  algebra: "대수",
  "calculus-1": "미적분Ⅰ",
  "probability-statistics": "확률과 통계",
};

function emptyAdminArenaConceptInsights(matchLimit = DEFAULT_MATCH_LIMIT) {
  return {
    summary: {
      matchCount: 0,
      questionCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      correctRate: 0,
      conceptCount: 0,
      lastAnalyzedAt: null,
      matchLimit,
    },
    weakConcepts: [],
    strongConcepts: [],
    observingConcepts: [],
    thresholds: {
      weakCorrectRateMax: WEAK_CORRECT_RATE_MAX,
      strongCorrectRateMin: STRONG_CORRECT_RATE_MIN,
    },
  };
}

function cleanLabels(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function typeDefinitionMap() {
  return new Map(
    availableArenaProblemTypes().map((definition) => [
      String(definition.typeId),
      definition,
    ])
  );
}

function questionConceptLabels(question, definitions) {
  const definition = definitions.get(String(question?.typeId || ""));
  const skillTags = cleanLabels(
    question?.skillTags?.length
      ? question.skillTags
      : definition?.skillTags
  );
  if (skillTags.length) return skillTags;

  const referenceLabels = cleanLabels(question?.referenceFamilyLabels);
  if (referenceLabels.length) return referenceLabels;

  const fallback = String(
    definition?.label ||
      question?.referenceFamily ||
      question?.typeId ||
      "개념 미분류"
  ).trim();
  return [fallback || "개념 미분류"];
}

function conceptView(signal) {
  const attempts = Math.max(0, Number(signal.attempts) || 0);
  const correct = Math.max(0, Number(signal.correct) || 0);
  const incorrect = Math.max(0, attempts - correct);
  return {
    label: signal.label,
    courseId: signal.courseId,
    courseLabel:
      COURSE_LABELS[signal.courseId] || signal.courseId || "과목 미분류",
    attempts,
    correct,
    incorrect,
    correctRate: attempts ? Math.round((correct / attempts) * 100) : 0,
    lastSeenAt: signal.lastSeenAt || null,
    confidence: attempts >= 5 ? "충분" : attempts >= 3 ? "보통" : "초기",
  };
}

function buildAdminArenaConceptInsights({
  attempts = [],
  problemPacks = [],
  matchLimit = DEFAULT_MATCH_LIMIT,
} = {}) {
  const empty = emptyAdminArenaConceptInsights(matchLimit);
  const definitions = typeDefinitionMap();
  const packsById = new Map(
    problemPacks.map((pack) => [String(pack?._id || pack?.id || ""), pack])
  );
  const conceptSignals = new Map();
  const analyzedMatchIds = new Set();
  let questionCount = 0;
  let correctCount = 0;
  let lastAnalyzedAt = null;

  attempts.forEach((attempt) => {
    const pack = packsById.get(String(attempt?.problemPackId || ""));
    if (!pack?.questions?.length) return;

    const scored = scoreArenaAttempt({ attempt, problemPack: pack });
    const resultsByKey = new Map(
      scored.questionResults.map((result) => [result.questionKey, result])
    );
    const analyzedAt = attempt.submittedAt || attempt.updatedAt || null;
    const matchId = String(attempt.matchId || "");
    if (matchId) analyzedMatchIds.add(matchId);
    if (
      analyzedAt &&
      (!lastAnalyzedAt || new Date(analyzedAt) > new Date(lastAnalyzedAt))
    ) {
      lastAnalyzedAt = analyzedAt;
    }

    pack.questions.forEach((question) => {
      const result = resultsByKey.get(String(question.questionKey));
      if (!result) return;
      questionCount += 1;
      if (result.correct) correctCount += 1;

      const definition = definitions.get(String(question.typeId || ""));
      const courseId = String(
        question.courseId || definition?.courseId || ""
      ).trim();
      questionConceptLabels(question, definitions).forEach((label) => {
        const key = `${courseId}::${label}`;
        const current = conceptSignals.get(key) || {
          label,
          courseId,
          attempts: 0,
          correct: 0,
          lastSeenAt: null,
        };
        current.attempts += 1;
        current.correct += result.correct ? 1 : 0;
        if (
          analyzedAt &&
          (!current.lastSeenAt ||
            new Date(analyzedAt) > new Date(current.lastSeenAt))
        ) {
          current.lastSeenAt = analyzedAt;
        }
        conceptSignals.set(key, current);
      });
    });
  });

  if (!questionCount) return empty;

  const concepts = [...conceptSignals.values()].map(conceptView);
  const weakConcepts = concepts
    .filter(
      (concept) =>
        concept.incorrect > 0 &&
        concept.correctRate <= WEAK_CORRECT_RATE_MAX
    )
    .sort(
      (left, right) =>
        left.correctRate - right.correctRate ||
        right.incorrect - left.incorrect ||
        right.attempts - left.attempts ||
        left.label.localeCompare(right.label, "ko")
    )
    .slice(0, INSIGHT_LIST_LIMIT);
  const strongConcepts = concepts
    .filter(
      (concept) =>
        concept.correct > 0 &&
        concept.correctRate >= STRONG_CORRECT_RATE_MIN
    )
    .sort(
      (left, right) =>
        right.correctRate - left.correctRate ||
        right.correct - left.correct ||
        right.attempts - left.attempts ||
        left.label.localeCompare(right.label, "ko")
    )
    .slice(0, INSIGHT_LIST_LIMIT);
  const classified = new Set(
    [...weakConcepts, ...strongConcepts].map(
      (concept) => `${concept.courseId}::${concept.label}`
    )
  );
  const observingConcepts = concepts
    .filter(
      (concept) => !classified.has(`${concept.courseId}::${concept.label}`)
    )
    .sort((left, right) => right.attempts - left.attempts)
    .slice(0, INSIGHT_LIST_LIMIT);

  return {
    summary: {
      matchCount: analyzedMatchIds.size,
      questionCount,
      correctCount,
      incorrectCount: questionCount - correctCount,
      correctRate: Math.round((correctCount / questionCount) * 100),
      conceptCount: concepts.length,
      lastAnalyzedAt,
      matchLimit,
    },
    weakConcepts,
    strongConcepts,
    observingConcepts,
    thresholds: empty.thresholds,
  };
}

async function getAdminArenaConceptInsights(
  userId,
  { matchLimit = DEFAULT_MATCH_LIMIT } = {}
) {
  const safeLimit = Math.min(
    DEFAULT_MATCH_LIMIT,
    Math.max(1, Number.parseInt(matchLimit, 10) || DEFAULT_MATCH_LIMIT)
  );
  if (!mongoose.isValidObjectId(userId)) {
    return emptyAdminArenaConceptInsights(safeLimit);
  }

  const matches = await ArenaMatch.find({
    status: "SETTLED",
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  })
    .select("_id settledAt")
    .sort({ settledAt: -1, _id: -1 })
    .limit(safeLimit)
    .lean();
  if (!matches.length) return emptyAdminArenaConceptInsights(safeLimit);

  const matchIds = matches.map((match) => match._id);
  const attempts = await ArenaMatchAttempt.find({
    userId,
    matchId: { $in: matchIds },
    status: "SUBMITTED",
  })
    .select(
      "matchId problemPackId answers questionTimings activeSolveTimeMs submittedAt updatedAt"
    )
    .lean();
  const problemPackIds = [
    ...new Set(attempts.map((attempt) => String(attempt.problemPackId))),
  ].filter((value) => mongoose.isValidObjectId(value));
  const problemPacks = problemPackIds.length
    ? await ArenaProblemPack.find({ _id: { $in: problemPackIds } })
        .select("+questions")
        .lean()
    : [];

  return buildAdminArenaConceptInsights({
    attempts,
    problemPacks,
    matchLimit: safeLimit,
  });
}

module.exports = {
  DEFAULT_MATCH_LIMIT,
  STRONG_CORRECT_RATE_MIN,
  WEAK_CORRECT_RATE_MAX,
  buildAdminArenaConceptInsights,
  emptyAdminArenaConceptInsights,
  getAdminArenaConceptInsights,
};
