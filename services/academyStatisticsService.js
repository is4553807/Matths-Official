const mongoose = require("mongoose");
const {
  ConceptProgress,
  LearningEvent,
  ProblemAttempt,
} = require("../models/matthsModel");

const KST_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const VISIBLE_PERIOD_COUNT = 2;
const DEFINITIVE_ACTIVITY_EVENT_TYPES = [
  "problem-attempted",
  "problem-correct",
  "problem-wrong",
  "topic-completed",
  "concept-completed",
  "review-completed",
];

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

function getKstMonthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("now must be a valid date");
  const parts = Object.fromEntries(
    monthFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}`;
}

function shiftMonthKey(monthKey, offset) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) throw new TypeError("monthKey must use YYYY-MM");
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function createPeriodOptions(now = new Date()) {
  const currentKey = getKstMonthKey(now);
  return Array.from({ length: VISIBLE_PERIOD_COUNT }, (_, index) => {
    const key = shiftMonthKey(currentKey, -index);
    return {
      key,
      label: `${monthLabel(key)}${index === 0 ? " (이번 달)" : " (지난달)"}`,
    };
  });
}

function resolvePeriod(periodKey, now = new Date()) {
  const options = createPeriodOptions(now);
  const selected = options.find((option) => option.key === String(periodKey || "")) || options[0];
  const [year, month] = selected.key.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
  const nextMonthStart = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
  const nowDate = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const reportCutoff = nextMonthStart < nowDate ? nextMonthStart : new Date(nowDate.getTime() + 1);

  return {
    ...selected,
    options,
    start,
    nextMonthStart,
    reportCutoff,
    isCurrent: selected.key === options[0].key,
  };
}

function asObjectId(value) {
  if (!mongoose.isValidObjectId(value)) throw new TypeError("studentUserId must be a valid ObjectId");
  return new mongoose.Types.ObjectId(String(value));
}

function percentage(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((Number(numerator || 0) / Number(denominator)) * 100);
}

function formatMetric(value, suffix) {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

function metricDetail(label, sampleSize) {
  if (!sampleSize) return `${label} · 데이터 부족`;
  return `${label} · ${sampleSize}문제 기준`;
}

function buildSummary({ period, values, samples, hasActivity }) {
  if (!hasActivity) {
    return {
      bullets: [
        {
          label: "데이터 안내",
          text: `${period.label.replace(/ \(.+\)$/, "")}에 확인할 수 있는 학습 기록이 아직 없습니다.`,
        },
      ],
      nextDirection: "학습 기록이 쌓인 뒤 다음 학습 방향을 제안합니다.",
    };
  }

  const bullets = [
    {
      label: "학습 참여",
      text: values.activeLearningDays === null
        ? "학습일을 계산할 수 있는 기록이 충분하지 않습니다."
        : `총 ${values.activeLearningDays}일 동안 의미 있는 학습 활동이 확인됐습니다.`,
    },
    {
      label: "개념 진도",
      text: `완료 처리된 개념은 ${values.completedConcepts}개입니다.`,
    },
    {
      label: "문제 풀이",
      text: values.uniqueProblems === null
        ? "이 기간에는 문제 풀이 기록이 없습니다."
        : `중복을 제외하고 서로 다른 문제 ${values.uniqueProblems}개를 풀었습니다.`,
    },
    {
      label: "첫 시도 정답률",
      text: values.firstAttemptAccuracy === null
        ? "첫 제출 기록이 없어 정답률을 계산하지 않았습니다."
        : `첫 제출 ${samples.firstAttempts}문제 중 ${samples.firstAttemptCorrect}문제를 맞혀 정답률은 ${values.firstAttemptAccuracy}%입니다.`,
    },
    {
      label: "오답 복습",
      text: values.wrongAnswerReviewRate === null
        ? "이 기간에 새로 발생한 오답이 없어 복습률을 계산하지 않았습니다."
        : `발생한 오답 ${samples.wrongAnswers}개 중 ${samples.reviewedWrongAnswers}개를 기간 안에 복습해 완료율은 ${values.wrongAnswerReviewRate}%입니다.`,
    },
    {
      label: "재도전",
      text: values.retrySuccessRate === null
        ? "오답 재도전 기록이 없어 성공률을 계산하지 않았습니다."
        : `재도전한 오답 ${samples.retriedWrongAnswers}개 중 ${samples.successfulRetries}개를 맞혀 성공률은 ${values.retrySuccessRate}%입니다.`,
    },
  ];

  let nextDirection = "현재 학습 흐름을 유지하면서 완료 개념과 문제 풀이 기록을 꾸준히 쌓는 것이 좋습니다.";
  if (values.wrongAnswerReviewRate !== null && values.wrongAnswerReviewRate < 70) {
    nextDirection = "아직 복습하지 않은 오답을 먼저 정리해 오답 복습률을 높이는 것이 좋습니다.";
  } else if (values.firstAttemptAccuracy !== null && samples.firstAttempts >= 3 && values.firstAttemptAccuracy < 70) {
    nextDirection = "첫 시도 정답률을 높이기 위해 풀이 전 핵심 개념과 조건을 다시 확인하는 학습이 좋습니다.";
  } else if (values.retrySuccessRate !== null && values.retrySuccessRate < 70) {
    nextDirection = "재도전 전에 이전 풀이의 오류 원인을 짧게 적고 다시 푸는 연습이 좋습니다.";
  } else if (values.completedConcepts === 0) {
    nextDirection = "학습 중인 개념 하나를 끝까지 완료하는 것을 다음 단기 목표로 잡는 것이 좋습니다.";
  }

  bullets.push({ label: "다음 학습 방향", text: nextDirection });
  return { bullets, nextDirection };
}

async function getStudentMonthlyStatistics({ studentUserId, periodKey, now = new Date() }) {
  const userId = asObjectId(studentUserId);
  const period = resolvePeriod(periodKey, now);
  const range = { $gte: period.start, $lt: period.reportCutoff };
  const kstDayExpression = (field) => ({
    $dateToString: { date: field, format: "%Y-%m-%d", timezone: KST_TIME_ZONE },
  });

  const [learningDays, attemptResult, completionResult] = await Promise.all([
    LearningEvent.aggregate([
      {
        $match: {
          userId,
          occurredAt: range,
          $or: [
            { eventType: { $in: DEFINITIVE_ACTIVITY_EVENT_TYPES } },
            { durationMs: { $gt: 0 } },
          ],
        },
      },
      { $group: { _id: kstDayExpression("$occurredAt") } },
    ]),
    ProblemAttempt.aggregate([
      { $match: { userId, submittedAt: range } },
      {
        $facet: {
          days: [
            { $group: { _id: kstDayExpression("$submittedAt") } },
          ],
          totals: [
            { $group: { _id: null, attemptCount: { $sum: 1 }, problemIds: { $addToSet: "$problemId" } } },
            { $project: { _id: 0, attemptCount: 1, uniqueProblems: { $size: "$problemIds" } } },
          ],
          firstAttempts: [
            { $match: { reviewSourceAttemptId: null, attemptNumber: 1 } },
            { $group: { _id: null, total: { $sum: 1 }, correct: { $sum: { $cond: ["$isCorrect", 1, 0] } } } },
          ],
          wrongAnswers: [
            { $match: { reviewSourceAttemptId: null, isCorrect: false } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                reviewed: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$review.status", "completed"] },
                          { $ne: ["$review.reviewedAt", null] },
                          { $lt: ["$review.reviewedAt", period.reportCutoff] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          retries: [
            { $match: { reviewSourceAttemptId: { $ne: null } } },
            { $group: { _id: "$reviewSourceAttemptId", succeeded: { $max: { $cond: ["$isCorrect", 1, 0] } } } },
            { $group: { _id: null, total: { $sum: 1 }, correct: { $sum: "$succeeded" } } },
          ],
        },
      },
    ]),
    ConceptProgress.aggregate([
      { $match: { userId, status: "completed", completedAt: range } },
      {
        $facet: {
          days: [
            { $group: { _id: kstDayExpression("$completedAt") } },
          ],
          totals: [
            { $count: "total" },
          ],
        },
      },
    ]),
  ]);

  const attemptFacets = attemptResult[0] || {};
  const completionFacets = completionResult[0] || {};
  const activityDayKeys = new Set(
    [...learningDays, ...(attemptFacets.days || []), ...(completionFacets.days || [])]
      .map((row) => row._id)
      .filter(Boolean)
  );
  const totals = attemptFacets.totals?.[0] || { attemptCount: 0, uniqueProblems: 0 };
  const firstAttempts = attemptFacets.firstAttempts?.[0] || { total: 0, correct: 0 };
  const wrongAnswers = attemptFacets.wrongAnswers?.[0] || { total: 0, reviewed: 0 };
  const retries = attemptFacets.retries?.[0] || { total: 0, correct: 0 };
  const completedConcepts = Number(completionFacets.totals?.[0]?.total || 0);
  const hasActivity = activityDayKeys.size > 0 || Number(totals.attemptCount) > 0 || completedConcepts > 0;

  const values = {
    activeLearningDays: activityDayKeys.size ? activityDayKeys.size : null,
    completedConcepts: hasActivity ? completedConcepts : null,
    uniqueProblems: Number(totals.attemptCount) ? Number(totals.uniqueProblems) : null,
    firstAttemptAccuracy: percentage(firstAttempts.correct, firstAttempts.total),
    wrongAnswerReviewRate: percentage(wrongAnswers.reviewed, wrongAnswers.total),
    retrySuccessRate: percentage(retries.correct, retries.total),
  };
  const samples = {
    firstAttempts: Number(firstAttempts.total || 0),
    firstAttemptCorrect: Number(firstAttempts.correct || 0),
    wrongAnswers: Number(wrongAnswers.total || 0),
    reviewedWrongAnswers: Number(wrongAnswers.reviewed || 0),
    retriedWrongAnswers: Number(retries.total || 0),
    successfulRetries: Number(retries.correct || 0),
  };
  const summary = buildSummary({ period, values, samples, hasActivity });

  return {
    period: {
      key: period.key,
      label: period.label,
      options: period.options,
      isCurrent: period.isCurrent,
    },
    hasActivity,
    values,
    samples,
    cards: [
      { label: "학습일", value: formatMetric(values.activeLearningDays, "일"), detail: "의미 있는 월간 학습일" },
      { label: "완료 개념", value: formatMetric(values.completedConcepts, "개"), detail: "기간 안에 완료 처리" },
      { label: "문제 풀이", value: formatMetric(values.uniqueProblems, "개"), detail: "중복을 제외한 문제 수" },
      { label: "첫 시도 정답률", value: formatMetric(values.firstAttemptAccuracy, "%"), detail: metricDetail("첫 제출 기준", samples.firstAttempts) },
      { label: "오답 복습률", value: formatMetric(values.wrongAnswerReviewRate, "%"), detail: metricDetail("새로 발생한 오답", samples.wrongAnswers) },
      { label: "재도전 성공률", value: formatMetric(values.retrySuccessRate, "%"), detail: metricDetail("재도전한 오답", samples.retriedWrongAnswers) },
    ],
    summary,
  };
}

module.exports = {
  getStudentMonthlyStatistics,
  _private: {
    buildSummary,
    createPeriodOptions,
    getKstMonthKey,
    resolvePeriod,
  },
};
