const mongoose = require("mongoose");

const { ProblemAttempt } = require("../models/matthsModel");
const { loadCurriculum } = require("./curriculumService");
const {
  formatMathTextForCourse,
} = require("./mathTextService");
const {
  getProblemGenerator,
} = require("./problemGenerators");

const PAGE_SIZE = 10;
const MAX_RECENT_ATTEMPTS = 500;

const ERROR_LABELS = {
  "calculation-error": "계산 과정에서 실수",
  "formula-confusion": "공식 적용이 헷갈림",
  "missing-condition": "문제 조건을 놓침",
  "sign-error": "부호 계산에서 실수",
  "concept-not-understood": "핵심 개념 이해가 부족함",
  "prerequisite-missing": "선행 개념 복습이 필요함",
  unknown: "풀이 과정을 다시 확인해야 함",
};

const REVIEW_LABELS = {
  pending: "복습 대기",
  scheduled: "복습 예정",
  completed: "복습 완료",
};

function createCurriculumIndex(curriculumData) {
  const index = new Map();

  for (const course of curriculumData.courses || []) {
    index.set(`course:${course.id}`, { course });

    for (const unit of course.units || []) {
      index.set(`unit:${course.id}/${unit.id}`, { course, unit });

      for (const concept of unit.concepts || []) {
        index.set(
          [course.id, unit.id, concept.id].join("/"),
          { course, unit, concept }
        );
      }
    }
  }

  return index;
}

function normalizeReviewStatus(status) {
  if (status === "completed") return "completed";
  if (status === "scheduled") return "scheduled";
  return "pending";
}

function formatKoreanDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatAnswer(answer) {
  if (answer === null || answer === undefined || answer === "") {
    return "답안 없음";
  }

  if (typeof answer === "object") {
    try {
      return JSON.stringify(answer);
    } catch (error) {
      return String(answer);
    }
  }

  return String(answer);
}

function formatMathAnswer(answer, choices = []) {
  const text = formatAnswer(answer);

  const selectedChoice = choices.find(
    (choice) => String(choice.key) === text
  );

  if (selectedChoice?.text) {
    return String(selectedChoice.text);
  }

  if (/^[-+]?\d+(?:\.\d+)?$/.test(text)) {
    return `\\(${text}\\)`;
  }

  const fraction = text.match(
    /^([-+]?\d+)\s*\/\s*([-+]?\d+)$/
  );

  if (fraction && Number(fraction[2]) !== 0) {
    return `\\(\\frac{${fraction[1]}}{${fraction[2]}}\\)`;
  }

  return text;
}

function createSourceLabel(source = {}) {
  if (source.type === "mock-exam") {
    return [
      source.year ? `${source.year}년` : "",
      source.month ? `${source.month}월` : "",
      source.organization || "모의고사",
      source.questionNumber ? `${source.questionNumber}번` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const sourceLabels = {
    textbook: "교과서 문제",
    generated: "개념 확인 문제",
    custom: "Matths 문제",
  };

  return sourceLabels[source.type] || "출처 미등록";
}

function isSameOrBeforeToday(value) {
  if (!value) return false;

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  return new Date(value) <= todayEnd;
}

function getAttemptIdentity(attempt) {
  return String(
    attempt.problemId?._id ||
      attempt.problemId ||
      attempt._id
  );
}

function serializeAttempt(attempt, curriculumIndex) {
  const exactMetadata = curriculumIndex.get(
    [attempt.courseId, attempt.unitId, attempt.conceptId].join("/")
  );
  const unitMetadata = curriculumIndex.get(
    `unit:${attempt.courseId}/${attempt.unitId}`
  );
  const courseMetadata = curriculumIndex.get(
    `course:${attempt.courseId}`
  );
  const metadata = exactMetadata || unitMetadata || courseMetadata;
  const reviewStatus = normalizeReviewStatus(attempt.review?.status);
  const problem = attempt.problemId || {};
  const snapshot = attempt.problemSnapshot || {};
  const retryGenerator =
    getProblemGenerator({
      courseId: attempt.courseId,
      unitId: attempt.unitId,
      conceptId: attempt.conceptId,
    });

  return {
    id: String(attempt._id),
    problemId: problem?._id ? String(problem._id) : null,
    stem: formatMathTextForCourse(
      attempt.courseId,
      snapshot.stem ||
        problem.stem ||
        "삭제되었거나 비공개 처리된 문제입니다."
    ),
    typeId: snapshot.typeId || null,
    solution: formatMathTextForCourse(
      attempt.courseId,
      snapshot.solution || ""
    ),
    retryAvailable: Boolean(
      retryGenerator
        ?.problemTypes?.length
    ),
    sourceLabel: createSourceLabel(problem.source),
    courseId: attempt.courseId,
    unitId: attempt.unitId,
    conceptId: attempt.conceptId,
    courseTitle: metadata?.course.officialTitle || attempt.courseId,
    unitTitle:
      exactMetadata?.unit.title ||
      unitMetadata?.unit.title ||
      attempt.unitId,
    conceptTitle:
      exactMetadata?.concept.title ||
      attempt.conceptId,
    standardCode: exactMetadata?.concept.standardCode || "",
    difficulty: Math.max(
      1,
      Math.min(
        5,
        Number(snapshot.difficulty) ||
          Number(problem.difficulty) ||
          1
      )
    ),
    submittedAnswer: formatMathTextForCourse(
      attempt.courseId,
      formatMathAnswer(
        attempt.submittedAnswer,
        Array.isArray(snapshot.choices)
          ? snapshot.choices
          : []
      )
    ),
    score: Number(attempt.score) || 0,
    maxScore: Number(attempt.maxScore) || Number(problem.score) || 0,
    errorType: attempt.errorAnalysis?.errorType || "unknown",
    errorLabel:
      ERROR_LABELS[attempt.errorAnalysis?.errorType] ||
      ERROR_LABELS.unknown,
    reviewStatus,
    reviewLabel: REVIEW_LABELS[reviewStatus],
    scheduledAt: attempt.review?.scheduledAt || null,
    scheduledAtLabel: formatKoreanDate(attempt.review?.scheduledAt),
    submittedAt: attempt.submittedAt || attempt.createdAt,
    submittedAtLabel: formatKoreanDate(
      attempt.submittedAt || attempt.createdAt
    ),
    isDue: reviewStatus === "scheduled"
      ? isSameOrBeforeToday(attempt.review?.scheduledAt)
      : reviewStatus === "pending",
    reviewHref:
      `/wrong-notes/${encodeURIComponent(String(attempt._id))}/review`,
    conceptHref:
      `/learn/${encodeURIComponent(attempt.courseId)}/` +
      `${encodeURIComponent(attempt.unitId)}/` +
      `${encodeURIComponent(attempt.conceptId)}`,
  };
}

function normalizeFilters(query = {}) {
  const allowedStatuses = new Set([
    "all",
    "pending",
    "scheduled",
    "completed",
  ]);
  const allowedSorts = new Set([
    "newest",
    "oldest",
    "difficulty",
    "priority",
  ]);

  const status = allowedStatuses.has(String(query.status))
    ? String(query.status)
    : "all";
  const sort = allowedSorts.has(String(query.sort))
    ? String(query.sort)
    : "priority";

  return {
    status,
    course: String(query.course || "").trim(),
    errorType: String(query.errorType || "").trim(),
    search: String(query.search || "").trim().slice(0, 80),
    sort,
    page: Math.max(1, Number.parseInt(query.page, 10) || 1),
  };
}

function applyFilters(items, filters) {
  const normalizedSearch = filters.search.toLocaleLowerCase("ko");

  return items.filter((item) => {
    if (
      filters.status !== "all" &&
      item.reviewStatus !== filters.status
    ) {
      return false;
    }

    if (filters.course && item.courseId !== filters.course) {
      return false;
    }

    if (
      filters.errorType &&
      item.errorType !== filters.errorType
    ) {
      return false;
    }

    if (normalizedSearch) {
      const searchableText = [
        item.stem,
        item.courseTitle,
        item.unitTitle,
        item.conceptTitle,
        item.sourceLabel,
      ]
        .join(" ")
        .toLocaleLowerCase("ko");

      if (!searchableText.includes(normalizedSearch)) {
        return false;
      }
    }

    return true;
  });
}

function sortItems(items, sort) {
  const result = [...items];
  const timestamp = (item) =>
    new Date(item.submittedAt || 0).getTime();

  if (sort === "oldest") {
    return result.sort((left, right) => timestamp(left) - timestamp(right));
  }

  if (sort === "difficulty") {
    return result.sort(
      (left, right) =>
        right.difficulty - left.difficulty ||
        timestamp(right) - timestamp(left)
    );
  }

  if (sort === "priority") {
    const statusPriority = {
      pending: 0,
      scheduled: 1,
      completed: 2,
    };

    return result.sort(
      (left, right) =>
        Number(right.isDue) - Number(left.isDue) ||
        statusPriority[left.reviewStatus] -
          statusPriority[right.reviewStatus] ||
        timestamp(right) - timestamp(left)
    );
  }

  return result.sort((left, right) => timestamp(right) - timestamp(left));
}

async function getWrongNoteData(userId, query = {}) {
  const curriculumData = loadCurriculum();
  const curriculumIndex = createCurriculumIndex(curriculumData);
  const filters = normalizeFilters(query);

  const attempts = await ProblemAttempt.find({
    userId,
    isCorrect: false,
    reviewSourceAttemptId: null,
  })
    .sort({ submittedAt: -1 })
    .limit(MAX_RECENT_ATTEMPTS)
    .populate({
      path: "problemId",
      select: "externalId stem source difficulty score",
    })
    .lean();

  /*
   * 같은 문제를 여러 번 틀렸더라도 오답노트에는 최신 기록 한 건만 표시한다.
   */
  const latestAttemptByProblem = new Map();

  for (const attempt of attempts) {
    const identity = getAttemptIdentity(attempt);

    if (!latestAttemptByProblem.has(identity)) {
      latestAttemptByProblem.set(identity, attempt);
    }
  }

  const allItems = Array.from(latestAttemptByProblem.values()).map(
    (attempt) => serializeAttempt(attempt, curriculumIndex)
  );
  const filteredItems = sortItems(
    applyFilters(allItems, filters),
    filters.sort
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / PAGE_SIZE)
  );
  const currentPage = Math.min(filters.page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const courseOptions = Array.from(
    new Map(
      allItems.map((item) => [
        item.courseId,
        {
          id: item.courseId,
          title: item.courseTitle,
        },
      ])
    ).values()
  ).sort((left, right) =>
    left.title.localeCompare(right.title, "ko")
  );

  return {
    items: filteredItems.slice(pageStart, pageStart + PAGE_SIZE),
    filters: {
      ...filters,
      page: currentPage,
    },
    options: {
      courses: courseOptions,
      errorTypes: Object.entries(ERROR_LABELS).map(([id, label]) => ({
        id,
        label,
      })),
    },
    stats: {
      total: allItems.length,
      pending: allItems.filter(
        (item) => item.reviewStatus === "pending"
      ).length,
      scheduled: allItems.filter(
        (item) => item.reviewStatus === "scheduled"
      ).length,
      completed: allItems.filter(
        (item) => item.reviewStatus === "completed"
      ).length,
      due: allItems.filter((item) => item.isDue).length,
      filtered: filteredItems.length,
    },
    pagination: {
      currentPage,
      totalPages,
      pageSize: PAGE_SIZE,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < totalPages,
    },
  };
}

async function getWrongNoteReviewData({
  userId,
  attemptId,
}) {
  if (!mongoose.isValidObjectId(attemptId)) {
    const error = new Error(
      "복습할 오답 기록을 찾을 수 없습니다."
    );

    error.status = 404;
    throw error;
  }

  const attempt = await ProblemAttempt.findOne({
    _id: attemptId,
    userId,
    isCorrect: false,
    reviewSourceAttemptId: null,
  })
    .populate({
      path: "problemId",
      select: "externalId stem source difficulty score",
    })
    .lean();

  if (!attempt) {
    const error = new Error(
      "복습할 오답 기록을 찾을 수 없습니다."
    );

    error.status = 404;
    throw error;
  }

  const curriculumData = loadCurriculum();
  const curriculumIndex =
    createCurriculumIndex(curriculumData);

  const serialized = serializeAttempt(
    attempt,
    curriculumIndex
  );

  return serialized;
}

module.exports = {
  getWrongNoteData,
  getWrongNoteReviewData,
};
