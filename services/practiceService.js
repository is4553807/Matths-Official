const { randomUUID } = require("crypto");
const mongoose = require("mongoose");

const {
  ConceptProgress,
  Problem,
  ProblemAttempt,
  LearningEvent,
} = require("../models/matthsModel");

const {
  getProblemGenerator,
} = require("./problemGenerators");
const {
  generateValidProblem,
} = require("./problemGenerators/utils");
const {
  formatMathTextForCourse,
} = require("./mathTextService");
const {
  buildProblemTypeGuide,
} = require("./conceptGuideService");
const {
  getCoachView,
} = require("./coachMessageService");
const {
  conceptProblemEngineKey,
  isProblemTypeEnabled,
  problemTypeSelectionWeight,
} = require("./problemTypeCatalogService");

const QUESTION_EXPIRES_MS = 15 * 60 * 1000;
const MAX_SESSION_QUESTIONS = 30;
const REVIEW_VARIATION_ATTEMPTS = 16;
const MAX_REVIEW_PROMPT_ENTRIES = 50;

function generateReviewVariation({
  problemType,
  courseId,
  previousProblem,
}) {
  const fingerprint = (problem) =>
    JSON.stringify({
      prompt: formatMathTextForCourse(
        courseId,
        problem?.prompt || ""
      ),
      choices: (problem?.choices || []).map(
        (choice) =>
          formatMathTextForCourse(
            courseId,
            choice?.text || ""
          )
      ),
    });
  const normalizedPrevious =
    fingerprint(previousProblem);
  let generated = null;

  for (
    let attempt = 0;
    attempt < REVIEW_VARIATION_ATTEMPTS;
    attempt += 1
  ) {
    generated =
      generateValidProblem(problemType);

    if (
      fingerprint(generated) !==
      normalizedPrevious
    ) {
      return generated;
    }
  }

  /*
   * 정의 판별처럼 숫자가 없는 고정 문항은 같은 유형 자체가
   * 하나의 문장일 수 있다. 이 경우에도 복습을 막지는 않는다.
   */
  return generated;
}

function reviewPromptKey(reviewAttemptId) {
  return String(reviewAttemptId || "");
}

function getPreviousReviewProblem({
  req,
  reviewAttemptId,
  fallbackProblem,
}) {
  const key = reviewPromptKey(reviewAttemptId);

  return (
    req.session.reviewPreviousProblems?.[key]
      ?.problem ||
    fallbackProblem ||
    { prompt: "", choices: [] }
  );
}

function rememberReviewProblem({
  req,
  reviewAttemptId,
  problem,
}) {
  const key = reviewPromptKey(reviewAttemptId);
  if (!key || !problem?.prompt) return;

  req.session.reviewPreviousProblems ||= {};
  req.session.reviewPreviousProblems[key] = {
    problem: {
      prompt: problem.prompt,
      choices: problem.choices || [],
    },
    updatedAt: Date.now(),
  };

  const entries = Object.entries(
    req.session.reviewPreviousProblems
  );

  if (entries.length <= MAX_REVIEW_PROMPT_ENTRIES) {
    return;
  }

  entries
    .sort(
      ([, left], [, right]) =>
        Number(left?.updatedAt || 0) -
        Number(right?.updatedAt || 0)
    )
    .slice(
      0,
      entries.length - MAX_REVIEW_PROMPT_ENTRIES
    )
    .forEach(([staleKey]) => {
      delete req.session.reviewPreviousProblems[
        staleKey
      ];
    });
}

function clearReviewProblem({
  req,
  reviewAttemptId,
}) {
  const key = reviewPromptKey(reviewAttemptId);

  if (
    key &&
    req.session.reviewPreviousProblems
  ) {
    delete req.session.reviewPreviousProblems[key];
  }
}

function masteryView(progress) {
  const gate = progress.masteryGate || {};
  const correctTypeIds = gate.correctTypeIds || [];
  const required = gate.requiredDistinctTypes || 5;

  return {
    correctTypeIds,
    required,
    unlocked: correctTypeIds.length >= required,
    userCompleted: Boolean(gate.userCompleted),
  };
}

function reviewView(attempt) {
  if (!attempt) return null;

  const status =
    attempt.review?.status || "pending";

  return {
    attemptId: String(attempt._id),
    typeId:
      attempt.problemSnapshot?.typeId || null,
    status,
    completed: status === "completed",
    scheduled:
      status === "scheduled",
    scheduledAt:
      attempt.review?.scheduledAt ||
      null,
    reviewedAt:
      attempt.review?.reviewedAt || null,
  };
}

function nextReviewDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function requireReviewAttempt({
  userId,
  reviewAttemptId,
  courseId,
  unitId,
  conceptId,
}) {
  if (
    !reviewAttemptId ||
    !mongoose.isValidObjectId(reviewAttemptId)
  ) {
    const error = new Error(
      "복습할 오답 기록을 찾을 수 없습니다."
    );

    error.status = 404;
    throw error;
  }

  const attempt = await ProblemAttempt.findOne({
    _id: reviewAttemptId,
    userId,
    isCorrect: false,
    reviewSourceAttemptId: null,
    courseId,
    unitId,
    conceptId,
  });

  if (!attempt) {
    const error = new Error(
      "복습할 오답 기록을 찾을 수 없습니다."
    );

    error.status = 404;
    throw error;
  }

  return attempt;
}

async function getReviewContext({
  userId,
  reviewAttemptId,
  courseId,
  unitId,
  conceptId,
}) {
  const attempt = await requireReviewAttempt({
    userId,
    reviewAttemptId,
    courseId,
    unitId,
    conceptId,
  });

  return reviewView(attempt);
}

function requireGenerator({
  courseId,
  unitId,
  conceptId,
}) {
  const generator = getProblemGenerator({
    courseId,
    unitId,
    conceptId,
  });

  if (!generator) {
    const error = new Error(
      "이 개념의 문제 유형이 아직 등록되지 않았습니다."
    );

    error.status = 404;
    throw error;
  }

  if (!generator.problemTypes?.length) {
    const error = new Error(
      "등록된 문제 유형이 없습니다."
    );

    error.status = 500;
    throw error;
  }

  return generator;
}

function stableReviewIndex(
  reviewAttempt,
  length
) {
  if (length <= 1) return 0;

  const source = String(
    reviewAttempt?._id || ""
  );
  const hash = [...source].reduce(
    (total, character) =>
      (
        total * 31 +
        character.charCodeAt(0)
      ) >>> 0,
    0
  );

  return hash % length;
}

function enabledConceptProblemTypes({ generator, courseId, unitId, conceptId }) {
  const enabled = (generator.problemTypes || []).filter((problemType) =>
    isProblemTypeEnabled(
      "CONCEPT_PRACTICE",
      conceptProblemEngineKey({
        courseId,
        unitId,
        conceptId,
        typeId: problemType.id,
      })
    )
  );
  if (!enabled.length) {
    const error = new Error(
      "자동 검산을 통과해 사용 중인 문제 유형이 없습니다. 관리자에게 문의해주세요."
    );
    error.status = 503;
    throw error;
  }
  return enabled;
}

function weightedProblemType({ problemTypes, courseId, unitId, conceptId }) {
  const weighted = problemTypes.map((problemType) => ({
    problemType,
    weight: problemTypeSelectionWeight(
      "CONCEPT_PRACTICE",
      conceptProblemEngineKey({
        courseId,
        unitId,
        conceptId,
        typeId: problemType.id,
      })
    ),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.problemType;
  }
  return weighted.at(-1).problemType;
}

function fallbackReviewProblemType({
  generator,
  reviewAttempt,
}) {
  const targetDifficulty = Math.max(
    1,
    Number(
      reviewAttempt
        .problemSnapshot
        ?.difficulty
    ) || 1
  );
  const distances =
    generator.problemTypes.map(
      (problemType) => ({
        problemType,
        distance: Math.abs(
          (
            Number(
              problemType.difficulty
            ) || 1
          ) - targetDifficulty
        ),
      })
    );
  const closestDistance =
    Math.min(
      ...distances.map(
        (item) => item.distance
      )
    );
  const candidates = distances
    .filter(
      (item) =>
        item.distance ===
        closestDistance
    )
    .map(
      (item) =>
        item.problemType
    );

  return candidates[
    stableReviewIndex(
      reviewAttempt,
      candidates.length
    )
  ];
}

async function findOrCreateProgress({
  userId,
  courseId,
  unitId,
  conceptId,
  requiredDistinctTypes,
}) {
  let progress = await ConceptProgress.findOne({
    userId,
    curriculumId: "kr-2022",
    courseId,
    unitId,
    conceptId,
  });

  if (!progress) {
    progress = new ConceptProgress({
      userId,
      curriculumId: "kr-2022",
      courseId,
      unitId,
      conceptId,
      masteryGate: {
        requiredDistinctTypes,
        correctTypeIds: [],
      },
    });
  } else {
    progress.masteryGate.requiredDistinctTypes =
      requiredDistinctTypes;
  }

  await progress.save();

  return progress;
}

async function ensureProblemTemplate({
  courseId,
  unitId,
  conceptId,
  problemType,
  generated,
}) {
  const externalId = [
    "generated",
    courseId,
    conceptId,
    problemType.id,
  ].join(":");

  return Problem.findOneAndUpdate(
    { externalId },
    {
      $set: {
        curriculumId: "kr-2022",
        courseId,
        unitId,
        conceptIds: [conceptId],
        primaryConceptId: conceptId,
        source: {
          type: "generated",
        },
        questionType:
          generated.inputMode ===
          "multiple-choice"
            ? "multiple-choice"
            : "short-answer",
        stem: `${problemType.label} 숫자 변형 문제`,
        correctAnswer: "__generated_on_request__",
        difficulty: problemType.difficulty || 1,
        estimatedTimeSeconds: 120,
        score: 1,
        tags: [
          "generated",
          conceptId,
          problemType.id,
        ],
        isPublished: true,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
}

function rememberQuestion(req, instanceId, question) {
  req.session.practiceQuestions ||= {};
  req.session.practiceQuestions[instanceId] = question;

  const storedIds = Object.keys(
    req.session.practiceQuestions
  );

  if (storedIds.length > MAX_SESSION_QUESTIONS) {
    storedIds
      .slice(
        0,
        storedIds.length - MAX_SESSION_QUESTIONS
      )
      .forEach((id) => {
        delete req.session.practiceQuestions[id];
      });
  }
}

async function recordLearningEvent(event) {
  try {
    await LearningEvent.create({
      clientEventId: randomUUID(),
      occurredAt: new Date(),
      ...event,
    });
  } catch (error) {
    console.error(
      "문제풀이 LearningEvent 저장 실패:",
      error
    );
  }
}

async function createNextProblem({
  req,
  userId,
  courseId,
  unitId,
  conceptId,
  reviewAttemptId,
}) {
  const generator = requireGenerator({
    courseId,
    unitId,
    conceptId,
  });
  const enabledTypes = enabledConceptProblemTypes({
    generator,
    courseId,
    unitId,
    conceptId,
  });

  const requiredDistinctTypes =
    generator.requiredDistinctTypes || 5;

  const reviewAttempt = reviewAttemptId
    ? await requireReviewAttempt({
        userId,
        reviewAttemptId,
        courseId,
        unitId,
        conceptId,
      })
    : null;

  const progress = await findOrCreateProgress({
    userId,
    courseId,
    unitId,
    conceptId,
    requiredDistinctTypes,
  });

  let problemType = null;

  if (reviewAttempt) {
    const reviewTypeId =
      reviewAttempt.problemSnapshot?.typeId;

    problemType = enabledTypes.find(
      (candidate) =>
        candidate.id === reviewTypeId
    );

    if (!problemType) {
      problemType =
        fallbackReviewProblemType({
          generator: {
            ...generator,
            problemTypes: enabledTypes,
          },
          reviewAttempt,
        });
    }
  } else {
    const completedTypes = new Set(
      progress.masteryGate?.correctTypeIds || []
    );

    const unseenTypes = enabledTypes.filter(
      (candidate) =>
        !completedTypes.has(candidate.id)
    );

    const candidates = unseenTypes.length
      ? unseenTypes
      : enabledTypes;

    problemType = weightedProblemType({
      problemTypes: candidates,
      courseId,
      unitId,
      conceptId,
    });
  }

  const generated = reviewAttempt
    ? generateReviewVariation({
        problemType,
        courseId,
        previousProblem: getPreviousReviewProblem({
          req,
          reviewAttemptId: reviewAttempt._id,
          fallbackProblem: {
            prompt:
              reviewAttempt.problemSnapshot
                ?.stem || "",
            choices:
              reviewAttempt.problemSnapshot
                ?.choices || [],
          },
        }),
      })
    : generateValidProblem(problemType);

  if (reviewAttempt) {
    rememberReviewProblem({
      req,
      reviewAttemptId: reviewAttempt._id,
      problem: generated,
    });
  }

  const problemTemplate =
    await ensureProblemTemplate({
      courseId,
      unitId,
      conceptId,
      problemType,
      generated,
    });

  const instanceId = randomUUID();

  rememberQuestion(req, instanceId, {
    userId: String(userId),
    problemId: String(problemTemplate._id),
    courseId,
    unitId,
    conceptId,
    typeId: problemType.id,
    typeLabel: problemType.label,
    difficulty: problemType.difficulty || 1,
    prompt: generated.prompt,
    inputMode: generated.inputMode,
    choices: generated.choices || [],
    answer: generated.answer,
    solution: generated.solution,
    hintText: generated.hintText || "",
    visualization: generated.visualization || null,
    reviewAttemptId: reviewAttempt
      ? String(reviewAttempt._id)
      : null,
    createdAt: Date.now(),
  });

  await recordLearningEvent({
    userId,
    sessionId: req.sessionID,
    eventType: "problem-opened",
    curriculumId: "kr-2022",
    courseId,
    unitId,
    conceptId,
    problemId: problemTemplate._id,
    metadata: {
      instanceId,
      problemTypeId: problemType.id,
      reviewAttemptId: reviewAttempt
        ? String(reviewAttempt._id)
        : null,
    },
  });

  if (reviewAttempt) {
    await recordLearningEvent({
      userId,
      sessionId: req.sessionID,
      eventType: "review-started",
      curriculumId: "kr-2022",
      courseId,
      unitId,
      conceptId,
      problemId: problemTemplate._id,
      attemptId: reviewAttempt._id,
      metadata: {
        instanceId,
        problemTypeId: problemType.id,
      },
    });
  }

  return {
    problem: {
      instanceId,
      typeId: problemType.id,
      typeLabel: problemType.label,
      prompt: generated.prompt,
      inputMode: generated.inputMode,
      choices: generated.choices || [],
      hintText: generated.hintText || "",
      visualization: generated.visualization || null,
      conceptGuide:
        buildProblemTypeGuide({
          courseId,
          problemType,
          problem: generated,
          order:
            generator.problemTypes.findIndex(
              (candidate) =>
                candidate.id ===
                problemType.id
            ) + 1,
        }),
      coachPrompt:
        getCoachView({
          mode:
            req.session?.user
              ?.preferences
              ?.coachMode,
          situation:
            "unanswered",
          seed: instanceId,
        }),
    },
    mastery: masteryView(progress),
    review: reviewView(reviewAttempt),
  };
}

async function submitProblem({
  req,
  userId,
  instanceId,
  submittedAnswer,
}) {
  const stored =
    req.session.practiceQuestions?.[instanceId];

  if (!stored || stored.userId !== String(userId)) {
    const error = new Error(
      "문제가 만료되었거나 이미 제출되었습니다."
    );

    error.status = 400;
    throw error;
  }

  delete req.session.practiceQuestions[instanceId];

  if (
    Date.now() - stored.createdAt >
    QUESTION_EXPIRES_MS
  ) {
    const error = new Error(
      "문제 풀이 시간이 만료되었습니다."
    );

    error.status = 400;
    throw error;
  }

  if (
    submittedAnswer === undefined ||
    submittedAnswer === null ||
    String(submittedAnswer).trim() === ""
  ) {
    const error = new Error("정답을 입력해주세요.");
    error.status = 400;
    throw error;
  }

  const generator = requireGenerator({
    courseId: stored.courseId,
    unitId: stored.unitId,
    conceptId: stored.conceptId,
  });

  const correct = generator.isCorrectAnswer(
    stored.answer,
    submittedAnswer
  );

  const responseTimeMs = Math.max(
    0,
    Date.now() - stored.createdAt
  );

  const progress = await findOrCreateProgress({
    userId,
    courseId: stored.courseId,
    unitId: stored.unitId,
    conceptId: stored.conceptId,
    requiredDistinctTypes:
      generator.requiredDistinctTypes || 5,
  });

  progress.signals.totalAttempts += 1;
  progress.signals.totalResponseTimeMs +=
    responseTimeMs;

  if (correct) {
    progress.signals.correctAttempts += 1;

    const correctTypes = new Set(
      progress.masteryGate?.correctTypeIds || []
    );

    correctTypes.add(stored.typeId);

    progress.masteryGate.correctTypeIds = [
      ...correctTypes,
    ];
  }

  progress.lastStudiedAt = new Date();
  await progress.save();

  const problemId = stored.problemId;

  const attemptNumber =
    (await ProblemAttempt.countDocuments({
      userId,
      problemId,
    })) + 1;

  const attempt = await ProblemAttempt.create({
    userId,
    problemId,
    reviewSourceAttemptId:
      stored.reviewAttemptId || null,
    curriculumId: "kr-2022",
    courseId: stored.courseId,
    unitId: stored.unitId,
    conceptId: stored.conceptId,
    attemptNumber,
    submittedAnswer,
    problemSnapshot: {
      typeId: stored.typeId,
      stem: stored.prompt,
      choices: stored.choices,
      solution: stored.solution,
      difficulty: stored.difficulty,
    },
    isCorrect: correct,
    score: correct ? 1 : 0,
    maxScore: 1,
    responseTimeMs,
    errorAnalysis: correct
      ? undefined
      : {
          errorType: "unknown",
          relatedConceptId: stored.conceptId,
        },
    review: {
      status: stored.reviewAttemptId
        ? "not-required"
        : correct
        ? "not-required"
        : "pending",
    },
    submittedAt: new Date(),
  });

  await recordLearningEvent({
    userId,
    sessionId: req.sessionID,
    eventType: correct
      ? "problem-correct"
      : "problem-wrong",
    curriculumId: "kr-2022",
    courseId: stored.courseId,
    unitId: stored.unitId,
    conceptId: stored.conceptId,
    problemId,
    attemptId: attempt._id,
    durationMs: responseTimeMs,
    correct,
    metadata: {
      instanceId,
      problemTypeId: stored.typeId,
      reviewAttemptId:
        stored.reviewAttemptId || null,
    },
  });

  let review = null;

  if (stored.reviewAttemptId) {
    const reviewFilter = {
      _id: stored.reviewAttemptId,
      userId,
      isCorrect: false,
      courseId: stored.courseId,
      unitId: stored.unitId,
      conceptId: stored.conceptId,
    };

    let originalAttempt = null;

    if (correct) {
      originalAttempt =
        await ProblemAttempt.findOneAndUpdate(
          reviewFilter,
          {
            $set: {
              "review.status": "completed",
              "review.reviewedAt": new Date(),
              "review.correctedAfterReview": true,
            },
            $unset: {
              "review.scheduledAt": 1,
            },
          },
          {
            returnDocument: "after",
          }
        );
    } else {
      originalAttempt =
        await ProblemAttempt.findOneAndUpdate(
          {
            ...reviewFilter,
            "review.status": {
              $ne: "completed",
            },
          },
          {
            $set: {
              "review.status": "scheduled",
              "review.scheduledAt":
                nextReviewDate(),
              "review.correctedAfterReview": false,
            },
            $unset: {
              "review.reviewedAt": 1,
            },
          },
          {
            returnDocument: "after",
          }
        );

      if (!originalAttempt) {
        originalAttempt =
          await ProblemAttempt.findOne(
            reviewFilter
          );
      }
    }

    review = reviewView(originalAttempt);

    if (correct && originalAttempt) {
      clearReviewProblem({
        req,
        reviewAttemptId:
          stored.reviewAttemptId,
      });

      await recordLearningEvent({
        userId,
        sessionId: req.sessionID,
        eventType: "review-completed",
        curriculumId: "kr-2022",
        courseId: stored.courseId,
        unitId: stored.unitId,
        conceptId: stored.conceptId,
        problemId,
        attemptId: originalAttempt._id,
        correct: true,
        metadata: {
          retryAttemptId: String(attempt._id),
          problemTypeId: stored.typeId,
        },
      });
    }
  }

  return {
    correct,
    solution: stored.solution,
    activityDurationMs:
      responseTimeMs,
    mastery: masteryView(progress),
    review,
    coachFeedback:
      getCoachView({
        mode:
          req.session?.user
            ?.preferences
            ?.coachMode,
        situation: correct
          ? "correct"
          : "incorrect",
        seed: instanceId,
      }),
  };
}

async function changeCompletion({
  userId,
  courseId,
  unitId,
  conceptId,
  completed,
  sessionId,
}) {
  const generator = requireGenerator({
    courseId,
    unitId,
    conceptId,
  });

  const progress = await findOrCreateProgress({
    userId,
    courseId,
    unitId,
    conceptId,
    requiredDistinctTypes:
      generator.requiredDistinctTypes || 5,
  });

  const gate = progress.masteryGate;
  const required = gate.requiredDistinctTypes || 5;
  const unlocked =
    gate.correctTypeIds.length >= required;

  if (completed && !unlocked) {
    const error = new Error(
      `서로 다른 유형 ${required}개를 먼저 맞혀야 합니다.`
    );

    error.status = 403;
    throw error;
  }

  gate.userCompleted = Boolean(completed);
  gate.completedAt = completed ? new Date() : null;
  progress.lastStudiedAt = new Date();

  await progress.save();

  await recordLearningEvent({
    userId,
    sessionId:
      sessionId || `server-${randomUUID()}`,
    eventType: completed
      ? "concept-completed"
      : "concept-closed",
    curriculumId: "kr-2022",
    courseId,
    unitId,
    conceptId,
    metadata: {
      userCompleted: Boolean(completed),
      correctTypeCount:
        gate.correctTypeIds.length,
    },
  });

  return masteryView(progress);
}

module.exports = {
  createNextProblem,
  submitProblem,
  changeCompletion,
  getReviewContext,
  generateReviewVariation,
  getPreviousReviewProblem,
  rememberReviewProblem,
  clearReviewProblem,
};
