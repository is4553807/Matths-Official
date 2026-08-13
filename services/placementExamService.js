const mongoose = require("mongoose");

const {
  AssessmentAttempt,
} = require("../models/matthsModel");
const {
  ArenaAccessState,
} = require("../models/goatArenaModel");
const {
  normalizeExamMath,
} = require("./assessmentService");
const {
  answersEquivalent,
} = require("./mathAnswerService");
const {
  PLACEMENT_BANK_VERSION,
  PLACEMENT_TIME_LIMIT_MS,
  buildPlacementPaper,
  buildPlacementVerificationQuestions,
} = require("./placementExamBank");
const {
  ESTIMATED_RANK_POPULATION,
  actualCohortStanding,
  ensureRankingProfile,
  estimatedRankForTopPercent,
  initialStanding,
  rankingProfileView,
  referencePercentileForScore,
  upsertInitialRankingProfile,
} = require("./mmrService");
const {
  kstSeasonKey,
  syncInitialArenaPlacement,
} = require("./arenaStandingService");
const {
  assertPaidPackageAccess,
} = require("./paidFeatureAccessService");

const KEY_QUESTION_NUMBERS = [
  20,
  21,
  28,
  30,
];
const QUESTION_TIMING_GAP_LIMIT_MS =
  15 * 1000;
const PLACEMENT_TERMINAL_STATUSES = [
  "submitted",
  "abandoned",
  "disqualified",
];

async function placementAttemptContext(userId, now = new Date()) {
  const [accessState, initialAttemptExists] = await Promise.all([
    ArenaAccessState.findOne({ userId }).lean(),
    AssessmentAttempt.exists({
      userId,
      scopeType: "placement",
      $or: [
        { placementPurpose: "INITIAL" },
        { placementPurpose: null },
        { placementPurpose: { $exists: false } },
      ],
    }),
  ]);
  if (accessState?.state === "PAID_PENDING_RENEWAL_ASSESSMENT") {
    return {
      purpose: "RENEWAL_RANK_ASSESSMENT",
      contextKey: `RENEWAL_RANK_ASSESSMENT:${accessState.accessCycleId}`,
      startLabel: "랭크 복귀전 시작",
    };
  }
  if (
    accessState?.state === "SEASON_PLACEMENT_REQUIRED" &&
    initialAttemptExists
  ) {
    return {
      purpose: "SEASON",
      contextKey: `SEASON:${kstSeasonKey(now)}:${accessState.currentCompetitiveDivision || "SUB"}`,
      startLabel: "시즌 배치고사 시작",
    };
  }
  return {
    purpose: "INITIAL",
    contextKey: "INITIAL",
    startLabel: "입단 배치고사 시작",
  };
}

function placementContextFilter(context) {
  if (context.purpose !== "INITIAL") {
    return { placementContextKey: context.contextKey };
  }
  return {
    $or: [
      { placementContextKey: "INITIAL" },
      { placementContextKey: null },
      { placementContextKey: { $exists: false } },
    ],
  };
}

function isInitialPlacementPurpose(purpose) {
  return !purpose || purpose === "INITIAL";
}

function placementAccessView(context) {
  const purpose = String(
    context?.purpose || "INITIAL"
  );
  return {
    purpose,
    freeInitialAttempt:
      isInitialPlacementPurpose(
        purpose
      ),
    requiresPaidAccess:
      !isInitialPlacementPurpose(
        purpose
      ),
  };
}

/*
 * 최초 배치고사는 모든 로그인 회원에게 한 번 공개한다. 이미 최초 배치를
 * 마친 뒤의 시즌 배치와 랭크 복귀전만 기존 학습권 권한을 계속 요구한다.
 * attemptId가 있는 요청은 URL만 바꿔 후속 유료 시험에 접근하지 못하도록
 * 해당 기록의 소유자와 purpose를 함께 확인한다.
 */
async function assertPlacementExamAccess({
  userId,
  attemptId = "",
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(
      403,
      "배치고사를 이용할 사용자 정보를 확인해주세요."
    );
  }

  if (attemptId) {
    validateAttemptId(attemptId);
    const attempt =
      await AssessmentAttempt.findOne({
        _id: attemptId,
        userId,
        scopeType: "placement",
      })
        .select("placementPurpose")
        .lean();
    if (!attempt) {
      throw httpError(
        404,
        "배치고사 기록을 찾을 수 없습니다."
      );
    }
    if (
      isInitialPlacementPurpose(
        attempt.placementPurpose
      )
    ) {
      return {
        accessType: "FREE_INITIAL",
        purpose: "INITIAL",
      };
    }
    await assertPaidPackageAccess(userId);
    return {
      accessType: "PAID_FOLLOW_UP",
      purpose: attempt.placementPurpose,
    };
  }

  const context =
    await placementAttemptContext(
      userId,
      now
    );
  if (
    isInitialPlacementPurpose(
      context.purpose
    )
  ) {
    return {
      accessType: "FREE_INITIAL",
      purpose: "INITIAL",
    };
  }
  await assertPaidPackageAccess(userId);
  return {
    accessType: "PAID_FOLLOW_UP",
    purpose: context.purpose,
  };
}

function shouldUpdateSkillMmr(attempt) {
  return !attempt?.placementPurpose || attempt.placementPurpose === "INITIAL";
}

async function refreshStaleEmptyAttempt(
  attempt
) {
  if (
    !attempt ||
    attempt.status !==
      "in-progress" ||
    attempt.generationVersion ===
      PLACEMENT_BANK_VERSION ||
    answeredCount(attempt) > 0
  ) {
    return attempt;
  }

  const paper =
    buildPlacementPaper();
  const startedAt =
    new Date();
  const firstQuestion =
    paper.questions[0];

  if (firstQuestion) {
    firstQuestion.enteredAt =
      startedAt;
    firstQuestion.visitCount = 1;
  }

  attempt.set({
    ...paper,
    earnedPoints: 0,
    scorePercent: 0,
    passed: false,
    status: "in-progress",
    startedAt,
    submittedAt: null,
    elapsedTimeMs: 0,
    disqualifiedReason: null,
    lastSavedAt: startedAt,
    activeQuestionId:
      firstQuestion
        ?.questionId || "",
    currentQuestionIndex: 0,
    questionTimingLastSeenAt:
      startedAt,
    placementResult: null,
  });
  await attempt.save();

  return attempt;
}

function clamp(
  value,
  minimum = 0,
  maximum = 1
) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function round(
  value,
  digits = 4
) {
  const scale =
    10 ** digits;
  return (
    Math.round(
      Number(value) * scale
    ) / scale
  );
}

function adjustedAccuracy(
  correct,
  total
) {
  return (
    (
      Number(correct) + 1
    ) /
    (
      Number(total) + 2
    )
  );
}

function scoreBreakdown(
  correct,
  total,
  keyValues = {}
) {
  return {
    correct,
    total,
    rawAccuracy:
      total > 0
        ? round(
            correct / total
          )
        : 0,
    adjustedAccuracy: round(
      adjustedAccuracy(
        correct,
        total
      )
    ),
    ...keyValues,
  };
}

function httpError(
  status,
  message
) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isAnswered(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

function answeredCount(attempt) {
  return (
    attempt.questions || []
  ).filter((question) =>
    isAnswered(
      question.submittedAnswer
    )
  ).length;
}

function deadlineMs(attempt) {
  return (
    new Date(
      attempt.startedAt
    ).getTime() +
    (
      Number(
        attempt.timeLimitMs
      ) ||
      PLACEMENT_TIME_LIMIT_MS
    )
  );
}

function isOverdue(
  attempt,
  now = Date.now()
) {
  return (
    attempt.status ===
      "in-progress" &&
    now >= deadlineMs(attempt)
  );
}

function isVerificationPending(
  attempt
) {
  return (
    attempt?.status ===
      "submitted" &&
    attempt.placementResult
      ?.verification?.result ===
      "pending"
  );
}

function verificationQuestions(
  attempt
) {
  return (
    attempt.placementResult
      ?.verification?.questions ||
    []
  );
}

function verificationDeadlineMs(
  attempt
) {
  const verification =
    attempt.placementResult
      .verification;

  return (
    new Date(
      verification.startedAt
    ).getTime() +
    (
      Number(
        verification.timeLimitMs
      ) ||
      40 * 60 * 1000
    )
  );
}

function applyVerificationAnswers(
  attempt,
  answers = {},
  now = new Date()
) {
  for (const question of
    verificationQuestions(
      attempt
    )) {
    if (
      !Object.prototype.hasOwnProperty.call(
        answers,
        question.questionId
      )
    ) {
      continue;
    }

    const previous =
      question.submittedAnswer;
    const next =
      answers[
        question.questionId
      ];

    if (
      String(previous ?? "") !==
      String(next ?? "")
    ) {
      if (isAnswered(previous)) {
        question.answerChanges =
          (
            Number(
              question.answerChanges
            ) || 0
          ) + 1;
      }
      if (
        !question.answeredAt &&
        isAnswered(next)
      ) {
        question.answeredAt =
          now;
      }
    }

    question.submittedAnswer =
      next ?? "";
  }
}

function verificationAnsweredCount(
  attempt
) {
  return verificationQuestions(
    attempt
  ).filter((question) =>
    isAnswered(
      question.submittedAnswer
    )
  ).length;
}

function applyAnswers(
  attempt,
  answers = {},
  now = new Date()
) {
  for (const question of
    attempt.questions) {
    if (
      Object.prototype.hasOwnProperty.call(
        answers,
        question.questionId
      )
    ) {
      const previous =
        question.submittedAnswer;
      const next =
        answers[
          question.questionId
        ];
      const previousText =
        previous ===
          undefined ||
        previous === null
          ? ""
          : String(previous);
      const nextText =
        next === undefined ||
        next === null
          ? ""
          : String(next);

      if (
        previousText !== nextText
      ) {
        if (
          isAnswered(previous)
        ) {
          question.answerChanges =
            (
              Number(
                question.answerChanges
              ) || 0
            ) + 1;
        }

        if (
          !question.answeredAt &&
          isAnswered(next)
        ) {
          question.answeredAt =
            now;
        }
      }

      question.submittedAnswer =
        next;
    }
  }
}

function questionById(
  attempt,
  questionId
) {
  return (
    attempt.questions || []
  ).find(
    (question) =>
      String(
        question.questionId
      ) === String(questionId || "")
  );
}

function touchQuestionTiming(
  attempt,
  {
    activeQuestionId = "",
    currentQuestionIndex,
    close = false,
    now = new Date(),
  } = {}
) {
  if (
    attempt.scopeType !==
    "placement"
  ) {
    return;
  }

  const previousId =
    String(
      attempt.activeQuestionId ||
        ""
    );
  const previousQuestion =
    questionById(
      attempt,
      previousId
    );
  const lastSeenMs =
    attempt.questionTimingLastSeenAt
      ? new Date(
          attempt.questionTimingLastSeenAt
        ).getTime()
      : null;

  if (
    previousQuestion &&
    Number.isFinite(lastSeenMs)
  ) {
    const delta = Math.max(
      0,
      Math.min(
        now.getTime() -
          lastSeenMs,
        QUESTION_TIMING_GAP_LIMIT_MS
      )
    );
    previousQuestion.responseTimeMs =
      (
        Number(
          previousQuestion.responseTimeMs
        ) || 0
      ) + delta;
  }

  const nextId = close
    ? ""
    : String(
        activeQuestionId ||
          previousId ||
          ""
      );

  if (
    previousQuestion &&
    previousId !== nextId
  ) {
    previousQuestion.exitedAt =
      now;
  }

  if (
    nextId &&
    nextId !== previousId
  ) {
    const nextQuestion =
      questionById(
        attempt,
        nextId
      );

    if (nextQuestion) {
      nextQuestion.enteredAt =
        nextQuestion.enteredAt ||
        now;
      nextQuestion.visitCount =
        (
          Number(
            nextQuestion.visitCount
          ) || 0
        ) + 1;
    }
  }

  if (
    Number.isInteger(
      Number(
        currentQuestionIndex
      )
    )
  ) {
    attempt.currentQuestionIndex =
      Math.max(
        0,
        Math.min(
          (
            attempt.questions ||
            []
          ).length - 1,
          Number(
            currentQuestionIndex
          )
        )
      );
  }

  attempt.activeQuestionId =
    nextId;
  attempt.questionTimingLastSeenAt =
    close ? null : now;
}

async function disqualify(
  attempt,
  answers = {},
  timing = {}
) {
  if (
    attempt.status !==
    "in-progress"
  ) {
    return attempt;
  }

  const now = new Date();
  applyAnswers(
    attempt,
    answers,
    now
  );
  touchQuestionTiming(
    attempt,
    {
      ...timing,
      close: true,
      now,
    }
  );
  const limit =
    Number(
      attempt.timeLimitMs
    ) ||
    PLACEMENT_TIME_LIMIT_MS;

  attempt.status =
    "disqualified";
  attempt.disqualifiedReason =
    "time-limit";
  attempt.earnedPoints = 0;
  attempt.scorePercent = 0;
  attempt.passed = false;
  attempt.submittedAt = new Date(
    deadlineMs(attempt)
  );
  attempt.elapsedTimeMs = limit;
  attempt.lastSavedAt = new Date();
  attempt.placementResult = {
    threePoint:
      scoreBreakdown(0, 20),
    fourPoint:
      scoreBreakdown(0, 10),
    semiKiller:
      scoreBreakdown(0, 2, {
        question20: false,
        question21: false,
      }),
    killer:
      scoreBreakdown(0, 2, {
        question28: false,
        question30: false,
      }),
    keyQuestions:
      KEY_QUESTION_NUMBERS.map(
        (questionNumber) => ({
          questionNumber,
          answered: false,
          correct: false,
        })
      ),
    question20Correct: null,
    question21Correct: null,
    question28Correct: null,
    question30Correct: null,
    answeredCount:
      answeredCount(attempt),
    unansweredCount:
      Math.max(
        0,
        30 -
          answeredCount(attempt)
      ),
    totalScore: 0,
    totalPercentile: null,
    abilityProfile: {
      coreAbility: 0,
      advancedAbilityBeforeVerification:
        0,
      advancedAbilityAfterVerification:
        null,
      consistency: 0,
      placementConfidence: 0,
      basicStability: 0,
      possibleMistakeCount: 0,
      confirmedConceptGapCount:
        0,
    },
    verification: {
      required: false,
      flagScore: 0,
      reasons: [],
      correct: 0,
      total: 0,
      result: "not-required",
    },
    placementScore: 0,
    initialMmr: null,
    tier: "",
    rankingStatus:
      "provisional",
    matchesUntilConfirmed: 2,
    cohortSize: 0,
    cohortAverage: null,
    percentile: null,
    initialRating: null,
    initialTier: "",
  };

  await attempt.save();
  return attempt;
}

async function expireOverdueForUser(
  userId
) {
  const active =
    await AssessmentAttempt.find({
      userId,
      scopeType: "placement",
      status: "in-progress",
    });

  for (const attempt of active) {
    if (isOverdue(attempt)) {
      await disqualify(attempt);
    }
  }
}

function tierForRating(rating) {
  if (rating >= 2350) {
    return "챌린저";
  }
  if (rating >= 2200) {
    return "그랜드마스터";
  }
  if (rating >= 2050) {
    return "마스터";
  }
  if (rating >= 1900) {
    return "다이아몬드";
  }
  if (rating >= 1750) {
    return "에메랄드";
  }
  if (rating >= 1500) {
    return "플래티넘";
  }
  if (rating >= 1250) {
    return "골드";
  }
  if (rating >= 1000) {
    return "실버";
  }
  return "브론즈";
}

function divisionForRating(
  rating
) {
  const ranges = [
    [600, 1000],
    [1000, 1250],
    [1250, 1500],
    [1500, 1750],
    [1750, 1900],
    [1900, 2050],
    [2050, 2200],
    [2200, 2350],
    [2350, 2600],
  ];
  const range =
    ranges.find(
      ([minimum, maximum]) =>
        rating >= minimum &&
        rating < maximum
    ) ||
    ranges[ranges.length - 1];
  const progress = clamp(
    (
      rating - range[0]
    ) /
      (
        range[1] -
        range[0]
      )
  );

  return Math.max(
    1,
    4 -
      Math.floor(
        progress * 4
      )
  );
}

function placementScoreCohortFilter(
  purpose
) {
  if (
    isInitialPlacementPurpose(
      purpose
    )
  ) {
    return {
      $or: [
        { placementPurpose: "INITIAL" },
        { placementPurpose: null },
      ],
    };
  }

  return {
    placementPurpose: purpose,
  };
}

async function latestSubmittedScores(
  purpose = "INITIAL"
) {
  const attempts =
    await AssessmentAttempt.find({
      scopeType: "placement",
      status: "submitted",
      ...placementScoreCohortFilter(
        purpose
      ),
      "placementResult.verification.result":
        {
          $ne: "pending",
        },
    })
      .sort({
        submittedAt: -1,
      })
      .select(
        "userId scorePercent placementResult.placementScore submittedAt"
      )
      .populate({
        path: "userId",
        select:
          "isTestAccount accountStatus isActive",
      })
      .lean();
  const latestByUser = new Map();

  for (const attempt of attempts) {
    const learner =
      attempt.userId;

    if (
      !learner?._id ||
      learner.isTestAccount ===
        true ||
      learner.accountStatus !==
        "active" ||
      learner.isActive === false
    ) {
      continue;
    }

    const key = String(
      learner._id
    );

    if (!latestByUser.has(key)) {
      latestByUser.set(
        key,
        {
          ...attempt,
          userId: learner._id,
        }
      );
    }
  }

  return [
    ...latestByUser.values(),
  ];
}

function distributionStats(
  values,
  fallback
) {
  const normalized =
    values.filter(
      (value) =>
        Number.isFinite(value)
    );
  const mean =
    normalized.length
      ? normalized.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
        normalized.length
      : fallback;
  const variance =
    normalized.length > 1
      ? normalized.reduce(
          (sum, value) =>
            sum +
            (
              value - mean
            ) **
              2,
          0
        ) /
        normalized.length
      : 0;

  return {
    mean,
    standardDeviation:
      Math.sqrt(variance),
  };
}

function percentileForScore(
  score,
  scoreRecords,
  selector = (record) =>
    Number(
      record.scorePercent
    ) || 0
) {
  const scores =
    scoreRecords.map(selector);

  if (!scores.length) {
    return 0.5;
  }

  return clamp(
    scores.filter(
      (value) =>
        value <= score
    ).length / scores.length
  );
}

function stableTotalPercentile(
  score,
  _scoreRecords
) {
  return referencePercentileForScore(
    score
  );
}

function questionResults(
  attempt
) {
  return (
    attempt.questions || []
  ).map((question, index) => ({
    question,
    number: index + 1,
    correct:
      question.isCorrect === true,
    answered: isAnswered(
      question.submittedAnswer
    ),
    category:
      question.placementCategory ||
      (
        index + 1 === 20 ||
        index + 1 === 21
          ? "semi-killer"
          : index + 1 === 28 ||
              index + 1 === 30
            ? "killer"
            : index + 1 <= 14
              ? "general"
              : "advanced"
      ),
    difficulty:
      Number(
        question.difficultyScore
      ) || 0,
    skillTags:
      question.skillTags || [],
  }));
}

function consistencyMetrics(
  results
) {
  const bySkill = new Map();

  for (const result of results) {
    for (const skill of
      result.skillTags) {
      if (!bySkill.has(skill)) {
        bySkill.set(skill, []);
      }
      bySkill.get(skill).push(
        result
      );
    }
  }

  let comparisons = 0;
  let contradictions = 0;
  const possibleMistakes =
    new Set();

  for (const group of
    bySkill.values()) {
    const sorted = [...group].sort(
      (left, right) =>
        left.difficulty -
        right.difficulty
    );

    for (
      let left = 0;
      left < sorted.length;
      left += 1
    ) {
      for (
        let right = left + 1;
        right < sorted.length;
        right += 1
      ) {
        comparisons += 1;

        if (
          !sorted[left].correct &&
          sorted[right].correct
        ) {
          contradictions += 1;
          possibleMistakes.add(
            sorted[left].number
          );
        }
      }
    }
  }

  return {
    consistency:
      comparisons > 0
        ? round(
            1 -
              contradictions /
                comparisons
          )
        : 0.5,
    possibleMistakeCount:
      possibleMistakes.size,
    easyWrongHardCorrectSameSkill:
      contradictions > 0,
  };
}

function nearTierBoundary(
  placementScore
) {
  return [
    40,
    50,
    60,
    70,
    80,
    90,
  ].some(
    (boundary) =>
      Math.abs(
        placementScore -
          boundary
      ) <= 2
  );
}

function placementProfile({
  attempt,
  totalPercentile,
  threePointCorrect,
  fourPointCorrect,
  keyQuestions,
  answered,
}) {
  const results =
    questionResults(attempt);
  const keyMap = new Map(
    keyQuestions.map(
      (item) => [
        item.questionNumber,
        item,
      ]
    )
  );
  const semiCorrect = [
    20,
    21,
  ].filter(
    (number) =>
      keyMap.get(number)?.correct
  ).length;
  const killerCorrect = [
    28,
    30,
  ].filter(
    (number) =>
      keyMap.get(number)?.correct
  ).length;
  const threePoint =
    scoreBreakdown(
      threePointCorrect,
      20
    );
  const fourPoint =
    scoreBreakdown(
      fourPointCorrect,
      10
    );
  const semiKiller =
    scoreBreakdown(
      semiCorrect,
      2,
      {
        question20:
          keyMap.get(20)
            ?.correct || false,
        question21:
          keyMap.get(21)
            ?.correct || false,
      }
    );
  const killer =
    scoreBreakdown(
      killerCorrect,
      2,
      {
        question28:
          keyMap.get(28)
            ?.correct || false,
        question30:
          keyMap.get(30)
            ?.correct || false,
      }
    );
  const coreAbility = round(
    totalPercentile * 0.55 +
      threePoint.adjustedAccuracy *
        0.45
  );
  const advancedAbility = round(
    fourPoint.adjustedAccuracy *
      0.5 +
      semiKiller.adjustedAccuracy *
        0.2 +
      killer.adjustedAccuracy *
        0.3
  );
  const placementScore = round(
    (
      coreAbility * 0.65 +
      advancedAbility * 0.35
    ) * 100,
    2
  );
  const stability =
    consistencyMetrics(results);
  const generalResults =
    results.filter(
      (result) =>
        result.category ===
        "general"
    );
  const basicStability =
    generalResults.length
      ? round(
          generalResults.filter(
            (result) =>
              result.correct
          ).length /
            generalResults.length
        )
      : 0;
  const timingCoverage =
    results.filter(
      (result) =>
        Number(
          result.question
            .responseTimeMs
        ) > 0
    ).length /
    Math.max(1, results.length);
  const answeredRatio =
    answered /
    Math.max(1, results.length);
  const placementConfidence =
    round(
      clamp(
        answeredRatio * 0.4 +
          timingCoverage * 0.2 +
          stability.consistency *
            0.2 +
          0.2
      )
    );
  const hardCorrect =
    semiCorrect +
    killerCorrect;
  const fastHardCorrect =
    results.some(
      (result) =>
        [
          "semi-killer",
          "killer",
        ].includes(
          result.category
        ) &&
        result.correct &&
        Number(
          result.question
            .expectedTimeMs
        ) > 0 &&
        Number(
          result.question
            .responseTimeMs
        ) > 0 &&
        Number(
          result.question
            .responseTimeMs
        ) <
          Number(
            result.question
              .expectedTimeMs
          ) *
            0.2
    );
  let flagScore = 0;
  const reasons = [];

  if (
    totalPercentile < 0.45 &&
    hardCorrect >= 2
  ) {
    flagScore += 2;
    reasons.push(
      "LOW_TOTAL_HIGH_ADVANCED_CORRECT"
    );
  }

  if (
    threePoint.rawAccuracy <
      0.65 &&
    fourPoint.rawAccuracy >= 0.75
  ) {
    flagScore += 1;
    reasons.push(
      "FOUR_POINT_OUTPERFORMS_THREE_POINT"
    );
  }

  if (
    stability.easyWrongHardCorrectSameSkill
  ) {
    flagScore += 2;
    reasons.push(
      "EASY_WRONG_HARD_CORRECT_SAME_SKILL"
    );
  }

  if (fastHardCorrect) {
    flagScore += 1;
    reasons.push(
      "FAST_HARD_CORRECT"
    );
  }

  if (
    nearTierBoundary(
      placementScore
    )
  ) {
    flagScore += 1;
    reasons.push(
      "TIER_BOUNDARY"
    );
  }

  return {
    threePoint,
    fourPoint,
    semiKiller,
    killer,
    totalPercentile:
      round(totalPercentile),
    abilityProfile: {
      coreAbility,
      advancedAbilityBeforeVerification:
        advancedAbility,
      advancedAbilityAfterVerification:
        null,
      consistency:
        stability.consistency,
      placementConfidence,
      basicStability,
      possibleMistakeCount:
        stability.possibleMistakeCount,
      confirmedConceptGapCount:
        0,
    },
    verification: {
      required:
        flagScore >= 2,
      flagScore,
      reasons,
      correct: 0,
      total: 0,
      result:
        flagScore >= 2
          ? "pending"
          : "not-required",
    },
    placementScore,
  };
}

function standingFromScores(
  placementScore,
  scoreRecords
) {
  const scores =
    scoreRecords.map(
      (record) =>
        Number(
          record.placementResult
            ?.placementScore
        ) ||
        Number(
          record.scorePercent
        ) ||
        0
    );
  return initialStanding({
    placementScore,
    scoreValues: scores,
  });
}

function actualStandingFromScores(
  placementScore,
  scoreRecords
) {
  return actualCohortStanding({
    placementScore,
    scoreValues:
      scoreRecords.map(
        (record) =>
          Number(
            record.placementResult
              ?.placementScore
          ) ||
          Number(
            record.scorePercent
          ) ||
          0
      ),
  });
}

function frozenStandingView(
  result,
  actual
) {
  const estimatedRankPopulation =
    Number(
      result.estimatedRankPopulation
    ) || ESTIMATED_RANK_POPULATION;
  const estimatedRank =
    Number(result.estimatedRank) ||
    estimatedRankForTopPercent(
      result.estimatedTopPercent,
      estimatedRankPopulation
    );

  return {
    calibrationPolicyVersion:
      result
        .calibrationPolicyVersion,
    calibratedAt:
      result.calibratedAt,
    positionBasis:
      result.positionBasis,
    referenceStandard:
      result.referenceStandard,
    referenceGrade:
      result.referenceGrade,
    estimatedPercentile:
      result.estimatedPercentile,
    estimatedTopPercent:
      result.estimatedTopPercent,
    estimatedTopPercentMin:
      result
        .estimatedTopPercentMin,
    estimatedTopPercentMax:
      result
        .estimatedTopPercentMax,
    estimatedRankPopulation,
    estimatedRank,
    percentile:
      result.percentile,
    initialMmr:
      result.initialMmr,
    initialRating:
      result.initialRating,
    initialTier:
      result.initialTier,
    tier: result.tier,
    rankPoint:
      result.rankPoint,
    rankingStatus:
      result.rankingStatus,
    matchesUntilConfirmed:
      result.matchesUntilConfirmed,
    standardizedScore:
      result.standardizedScore,
    ...actual,
  };
}

async function currentStanding(
  attempt
) {
  if (
    !attempt ||
    attempt.status !==
      "submitted"
  ) {
    return null;
  }

  const records =
    await latestSubmittedScores(
      attempt.placementPurpose ||
        "INITIAL"
    );
  const placementScore =
    Number(
      attempt.placementResult
        ?.placementScore
    ) ||
    Number(
      attempt.scorePercent
    ) ||
    0;
  const actual =
    actualStandingFromScores(
      placementScore,
      records
    );

  if (
    attempt.placementResult
      ?.calibrationPolicyVersion
  ) {
    return frozenStandingView(
      attempt.placementResult,
      actual
    );
  }

  return {
    ...standingFromScores(
      placementScore,
      records
    ),
    calibratedAt: new Date(),
  };
}

async function getPlacementDashboardData(
  userId
) {
  await expireOverdueForUser(
    userId
  );
  const attemptContext = await placementAttemptContext(userId);
  const contextFilter = placementContextFilter(attemptContext);
  const staleActive =
    await AssessmentAttempt.findOne({
      userId,
      scopeType: "placement",
      status: "in-progress",
      ...contextFilter,
      generationVersion: {
        $ne:
          PLACEMENT_BANK_VERSION,
      },
    }).sort({
      createdAt: -1,
    });

  if (staleActive) {
    await refreshStaleEmptyAttempt(
      staleActive
    );
  }

  /*
   * 일반 이용 상태에서는 과거 데이터의 purpose가 SEASON으로 잘못
   * 저장된 최초 응시까지 포함해 이미 본 배치고사를 다시 열지 않는다.
   */
  const dashboardFilter =
    attemptContext.purpose === "INITIAL"
      ? {}
      : contextFilter;
  const attempts =
    await AssessmentAttempt.find({
      userId,
      scopeType: "placement",
      ...dashboardFilter,
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  const submitted =
    attempts.find(
      (attempt) =>
        attempt.status ===
        "submitted"
    );
  const active =
    attempts.find(
      (attempt) =>
        attempt.status ===
        "in-progress"
    );
  const terminal =
    attempts.find(
      (attempt) =>
        [
          "abandoned",
          "disqualified",
        ].includes(
          attempt.status
        )
    );

  if (submitted) {
    const placementResult =
      submitted.placementResult ||
      {};
    const verification =
      placementResult.verification ||
      {};

    if (
      verification.result ===
      "pending"
    ) {
      return {
        ...placementAccessView(
          {
            purpose:
              submitted.placementPurpose ||
              "INITIAL",
          }
        ),
        status:
          "verification-required",
        attemptId:
          String(
            submitted._id
          ),
        ctaLabel: "추가 실력 확인 4문항 풀기",
        ctaHref:
          `/war-of-masters/placement/${submitted._id}`,
        answeredCount:
          (
            verification.questions ||
            []
          ).filter(
            (question) =>
              isAnswered(
                question.submittedAnswer
              )
          ).length,
        result: null,
      };
    }

    /*
     * 레거시 완료 기록은 기준분포 값을 먼저 확정해야 과거의 소표본 MMR이
     * Arena 시작 위치에 복사되지 않는다. 이미 버전이 있는 결과에서는
     * 실제 응시자 순위 필드만 갱신된다.
     */
    const submittedDocument =
      await AssessmentAttempt.findById(
        submitted._id
      );
    const standing =
      await currentStanding(
        submittedDocument
      );
    Object.assign(
      submittedDocument
        .placementResult,
      standing
    );
    await submittedDocument.save();

    /* 기존 완료자도 대시보드 재방문 시 Unranked 배치를 멱등 복구한다. */
    await syncInitialArenaPlacement({
      userId,
      attemptId: submitted._id,
    });
    const rankingProfile =
      rankingProfileView(
        await ensureRankingProfile(
          userId
        )
      );

    return {
      ...placementAccessView(
        {
          purpose:
            submitted.placementPurpose ||
            "INITIAL",
        }
      ),
      status: "submitted",
      attemptId:
        String(submitted._id),
      ctaLabel: "배치 결과 확인",
      ctaHref:
        `/war-of-masters/placement/${submitted._id}`,
      answeredCount: 30,
      result: {
        correctCount:
          Number(
            placementResult
              .threePoint
              ?.correct
          ) +
          Number(
            placementResult
              .fourPoint
              ?.correct
          ),
        initialMmr:
          standing.initialMmr ??
          rankingProfile?.mmr,
        initialRating:
          standing.initialRating ??
          rankingProfile?.mmr,
        initialTier:
          standing.initialTier ||
          rankingProfile
            ?.tierLabel,
        tier: standing.tier,
        rankPoint:
          standing.rankPoint ??
          rankingProfile
            ?.rankPoint,
        rankingStatus:
          rankingProfile
            ?.status ||
          standing.rankingStatus,
        cohortSize:
          standing.cohortSize,
        cohortRank:
          standing.cohortRank,
        actualPercentile:
          standing.actualPercentile,
        calibrationPolicyVersion:
          standing
            .calibrationPolicyVersion,
        positionBasis:
          standing.positionBasis,
        referenceStandard:
          standing.referenceStandard,
        referenceGrade:
          standing.referenceGrade,
        estimatedTopPercent:
          standing
            .estimatedTopPercent,
        estimatedTopPercentMin:
          standing
            .estimatedTopPercentMin,
        estimatedTopPercentMax:
          standing
            .estimatedTopPercentMax,
        estimatedRankPopulation:
          standing
            .estimatedRankPopulation,
        estimatedRank:
          standing.estimatedRank,
        actualRankMinimumCohortSize:
          standing
            .actualRankMinimumCohortSize,
        actualRankPublished:
          standing.actualRankPublished,
        percentile:
          standing.percentile,
      },
    };
  }

  if (active) {
    return {
      ...placementAccessView(
        {
          purpose:
            active.placementPurpose ||
            "INITIAL",
        }
      ),
      status: "in-progress",
      attemptId:
        String(active._id),
      ctaLabel: "배치고사 이어서 응시",
      ctaHref:
        `/war-of-masters/placement/${active._id}`,
      answeredCount:
        answeredCount(active),
      result: null,
    };
  }

  if (terminal) {
    return {
      ...placementAccessView(
        {
          purpose:
            terminal.placementPurpose ||
            "INITIAL",
        }
      ),
      status: "attempt-used",
      attemptId:
        String(terminal._id),
      ctaLabel: "배치고사 응시 종료",
      ctaHref: null,
      answeredCount:
        answeredCount(terminal),
      result: null,
    };
  }

  return {
    ...placementAccessView(
      attemptContext
    ),
    status: "not-started",
    attemptId: null,
    ctaLabel:
      attemptContext.startLabel,
    ctaHref: null,
    answeredCount: 0,
    result: null,
  };
}

async function createPlacementAttempt({
  userId,
}) {
  await expireOverdueForUser(
    userId
  );

  const attemptContext = await placementAttemptContext(userId);
  const contextFilter =
    attemptContext.purpose === "INITIAL"
      ? {}
      : placementContextFilter(attemptContext);

  const terminal =
    await AssessmentAttempt.findOne({
      userId,
      scopeType: "placement",
      status: {
        $in:
          PLACEMENT_TERMINAL_STATUSES,
      },
      ...contextFilter,
    }).sort({
      createdAt: -1,
    });

  if (terminal) {
    const completed =
      terminal.status ===
      "submitted";
    const error = httpError(
      409,
      completed
        ? "이 배치고사는 이미 완료했습니다. 배치고사는 같은 응시 구간에서 한 번만 볼 수 있습니다."
        : "이 배치고사의 응시 기회를 이미 사용했습니다. 배치고사는 같은 응시 구간에서 한 번만 볼 수 있습니다."
    );
    error.code = completed
      ? "PLACEMENT_ATTEMPT_ALREADY_COMPLETED"
      : "PLACEMENT_ATTEMPT_ALREADY_USED";
    throw error;
  }

  const active =
    await AssessmentAttempt.findOne({
      userId,
      scopeType: "placement",
      status: "in-progress",
      ...contextFilter,
    }).sort({
      createdAt: -1,
    });

  if (active) {
    return refreshStaleEmptyAttempt(
      active
    );
  }

  const paper =
    buildPlacementPaper();
  const startedAt =
    new Date();
  const firstQuestion =
    paper.questions[0];

  if (firstQuestion) {
    firstQuestion.enteredAt =
      startedAt;
    firstQuestion.visitCount = 1;
  }

  try {
    return await AssessmentAttempt.create({
      userId,
      placementPurpose: attemptContext.purpose,
      placementContextKey: attemptContext.contextKey,
      ...paper,
      startedAt,
      activeQuestionId:
        firstQuestion
          ?.questionId || "",
      currentQuestionIndex: 0,
      questionTimingLastSeenAt:
        startedAt,
    });
  } catch (error) {
    if (
      Number(error?.code) === 11000
    ) {
      const duplicateError =
        httpError(
          409,
          "이미 생성된 배치고사가 있습니다. 대시보드에서 현재 응시 상태를 확인해주세요."
        );
      duplicateError.code =
        "PLACEMENT_ATTEMPT_ALREADY_EXISTS";
      throw duplicateError;
    }
    throw error;
  }
}

function validateAttemptId(
  attemptId
) {
  if (
    !mongoose.isValidObjectId(
      attemptId
    )
  ) {
    throw httpError(
      404,
      "배치고사 기록을 찾을 수 없습니다."
    );
  }
}

async function findPlacementAttempt({
  userId,
  attemptId,
}) {
  validateAttemptId(attemptId);
  const attempt =
    await AssessmentAttempt.findOne({
      _id: attemptId,
      userId,
      scopeType: "placement",
    });

  if (!attempt) {
    throw httpError(
      404,
      "배치고사 기록을 찾을 수 없습니다."
    );
  }

  return attempt;
}

async function finalizePlacementVerificationAttempt({
  attempt,
  answers = {},
  now = new Date(),
}) {
  if (
    !isVerificationPending(
      attempt
    )
  ) {
    return attempt;
  }

  const verification =
    attempt.placementResult
      .verification;
  applyVerificationAnswers(
    attempt,
    answers,
    now
  );
  let correct = 0;

  for (const question of
    verification.questions) {
    const submitted =
      question.submittedAnswer;
    const isCorrect =
      isAnswered(submitted) &&
      answersEquivalent(
        question.answer,
        submitted
      );

    question.selectedAnswer =
      submitted ?? "";
    question.isCorrect =
      isCorrect;
    question.submittedAt =
      now;
    if (isCorrect) {
      correct += 1;
    }
  }

  const total =
    verification.questions.length;
  const verificationAccuracy =
    total
      ? correct / total
      : 0;
  const abilities =
    attempt.placementResult
      .abilityProfile;
  const before =
    Number(
      abilities
        .advancedAbilityBeforeVerification
    ) || 0;
  const after = round(
    before * 0.35 +
      verificationAccuracy *
        0.65
  );

  abilities.advancedAbilityAfterVerification =
    after;
  abilities.confirmedConceptGapCount =
    total - correct;
  verification.correct =
    correct;
  verification.total = total;
  verification.result =
    correct >=
    Math.ceil(total / 2)
      ? "confirmed"
      : "unconfirmed";
  verification.submittedAt =
    now;
  attempt.placementResult.placementScore =
    round(
      (
        Number(
          abilities.coreAbility
        ) *
          0.65 +
        after * 0.35
      ) * 100,
      2
    );
  await attempt.save();

  const scoreRecords =
    await latestSubmittedScores(
      attempt.placementPurpose ||
        "INITIAL"
    );
  const standing = {
    ...standingFromScores(
      attempt.placementResult
        .placementScore,
      scoreRecords
    ),
    calibratedAt: new Date(),
  };

  Object.assign(
    attempt.placementResult,
    standing
  );
  await attempt.save();
  if (shouldUpdateSkillMmr(attempt)) {
    await upsertInitialRankingProfile({
      attempt,
      standing,
    });
  } else {
    /*
     * 시즌 배치는 기존 MMR을 변경하지 않는다. 다만 운영 초기화·데이터
     * 복구처럼 프로필 자체가 없는 예외에서는 현재 배치 결과로 최초
     * 프로필만 복구해 최종 종합 랭킹 계산이 누락되지 않게 한다.
     */
    await ensureRankingProfile(
      attempt.userId
    );
  }
  await syncInitialArenaPlacement({
    userId: attempt.userId,
    attemptId: attempt._id,
    now,
  });
  return attempt;
}

async function savePlacementDraft({
  userId,
  attemptId,
  answers = {},
  activeQuestionId = "",
  currentQuestionIndex = 0,
  closeQuestionTiming = false,
}) {
  const attempt =
    await findPlacementAttempt({
      userId,
      attemptId,
    });

  if (
    isVerificationPending(
      attempt
    )
  ) {
    const now = new Date();
    const verification =
      attempt.placementResult
        .verification;

    if (
      !verification.startedAt
    ) {
      verification.startedAt =
        now;
    }

    if (
      now.getTime() >=
      verificationDeadlineMs(
        attempt
      )
    ) {
      await finalizePlacementVerificationAttempt({
        attempt,
        answers,
        now,
      });
      return {
        status: "submitted",
        expired: true,
        redirectUrl:
          `/war-of-masters/placement/${attempt._id}`,
      };
    }

    applyVerificationAnswers(
      attempt,
      answers,
      now
    );
    attempt.lastSavedAt =
      now;
    await attempt.save();
    return {
      savedAt: now,
      elapsedTimeMs:
        now.getTime() -
        new Date(
          verification.startedAt
        ).getTime(),
      answeredCount:
        verificationAnsweredCount(
          attempt
        ),
      currentQuestionIndex:
        Number(
          currentQuestionIndex
        ) || 0,
    };
  }

  if (
    attempt.status !==
    "in-progress"
  ) {
    return {
      status: attempt.status,
      expired:
        attempt.status ===
        "disqualified",
      redirectUrl:
        `/war-of-masters/placement/${attempt._id}`,
    };
  }

  if (isOverdue(attempt)) {
    await disqualify(
      attempt,
      answers,
      {
        activeQuestionId,
        currentQuestionIndex,
      }
    );

    return {
      status:
        attempt.status,
      expired: true,
      redirectUrl:
        `/war-of-masters/placement/${attempt._id}`,
      elapsedTimeMs:
        attempt.elapsedTimeMs,
    };
  }

  const now = new Date();
  applyAnswers(
    attempt,
    answers,
    now
  );
  touchQuestionTiming(
    attempt,
      {
        activeQuestionId,
        currentQuestionIndex,
        close:
          closeQuestionTiming,
        now,
      }
  );
  const serverElapsed =
    Math.max(
      0,
      Date.now() -
        new Date(
          attempt.startedAt
        ).getTime()
    );

  attempt.elapsedTimeMs =
    Math.max(
      Number(
        attempt.elapsedTimeMs
      ) || 0,
      Math.min(
        serverElapsed,
        Number(
          attempt.timeLimitMs
        ) ||
          PLACEMENT_TIME_LIMIT_MS
      )
    );
  attempt.lastSavedAt =
    now;
  await attempt.save();

  return {
    savedAt:
      attempt.lastSavedAt,
    elapsedTimeMs:
      attempt.elapsedTimeMs,
    answeredCount:
      answeredCount(attempt),
    currentQuestionIndex:
      attempt.currentQuestionIndex,
  };
}

async function expirePlacementAttempt({
  userId,
  attemptId,
  answers = {},
  activeQuestionId = "",
  currentQuestionIndex = 0,
}) {
  const attempt =
    await findPlacementAttempt({
      userId,
      attemptId,
    });

  if (
    isVerificationPending(
      attempt
    )
  ) {
    const remaining =
      verificationDeadlineMs(
        attempt
      ) -
      Date.now();

    if (remaining > 0) {
      const error =
        httpError(
          409,
          "아직 추가 확인 제한 시간이 남아 있습니다."
        );
      error.remainingTimeMs =
        remaining;
      throw error;
    }

    return finalizePlacementVerificationAttempt({
      attempt,
      answers,
    });
  }

  if (
    attempt.status !==
    "in-progress"
  ) {
    return attempt;
  }

  if (!isOverdue(attempt)) {
    const error = httpError(
      409,
      "아직 제한 시간이 남아 있습니다."
    );
    error.remainingTimeMs =
      Math.max(
        0,
        deadlineMs(attempt) -
          Date.now()
      );
    throw error;
  }

  return disqualify(
    attempt,
    answers,
    {
      activeQuestionId,
      currentQuestionIndex,
    }
  );
}

async function submitPlacementAttempt({
  userId,
  attemptId,
  answers = {},
  activeQuestionId = "",
  currentQuestionIndex = 0,
}) {
  const attempt =
    await findPlacementAttempt({
      userId,
      attemptId,
    });

  if (
    isVerificationPending(
      attempt
    )
  ) {
    return finalizePlacementVerificationAttempt({
      attempt,
      answers,
    });
  }

  if (
    [
      "submitted",
      "disqualified",
    ].includes(attempt.status)
  ) {
    if (
      attempt.status === "submitted" &&
      !isVerificationPending(attempt)
    ) {
      await ensureRankingProfile(
        attempt.userId
      );
      await syncInitialArenaPlacement({
        userId: attempt.userId,
        attemptId: attempt._id,
      });
    }
    return attempt;
  }

  if (isOverdue(attempt)) {
    return disqualify(
      attempt,
      answers,
      {
        activeQuestionId,
        currentQuestionIndex,
      }
    );
  }

  const gradingStartedAt =
    new Date();
  applyAnswers(
    attempt,
    answers,
    gradingStartedAt
  );
  touchQuestionTiming(
    attempt,
    {
      activeQuestionId,
      currentQuestionIndex,
      close: true,
      now: gradingStartedAt,
    }
  );

  let earnedPoints = 0;
  let threePointCorrect = 0;
  let fourPointCorrect = 0;
  let answered = 0;
  const keyQuestions = [];

  attempt.questions.forEach(
    (question, index) => {
      const submitted =
        question.submittedAnswer;
      const hasAnswer =
        isAnswered(submitted);
      const correct =
        hasAnswer &&
        answersEquivalent(
          question.answer,
          submitted
        );
      const questionNumber =
        index + 1;

      question.submittedAnswer =
        submitted === undefined ||
        submitted === null
          ? ""
          : submitted;
      question.selectedAnswer =
        question.submittedAnswer;
      question.isCorrect =
        correct;
      question.submittedAt =
        gradingStartedAt;

      if (hasAnswer) {
        answered += 1;
      }

      if (correct) {
        earnedPoints +=
          Number(
            question.points
          ) || 0;

        if (
          Number(
            question.points
          ) === 3
        ) {
          threePointCorrect += 1;
        }

        if (
          Number(
            question.points
          ) === 4
        ) {
          fourPointCorrect += 1;
        }
      }

      if (
        KEY_QUESTION_NUMBERS.includes(
          questionNumber
        )
      ) {
        keyQuestions.push({
          questionNumber,
          answered: hasAnswer,
          correct,
          category:
            question.placementCategory ||
            (
              questionNumber <= 21
                ? "semi-killer"
                : "killer"
            ),
          difficultyScore:
            Number(
              question.difficultyScore
            ) || null,
          skillTags:
            question.skillTags || [],
          responseTimeMs:
            Number(
              question.responseTimeMs
            ) || 0,
        });
      }
    }
  );

  const submittedAt =
    new Date();

  attempt.earnedPoints =
    earnedPoints;
  attempt.scorePercent =
    earnedPoints;
  attempt.passed = true;
  attempt.status = "submitted";
  attempt.submittedAt =
    submittedAt;
  attempt.elapsedTimeMs =
    Math.min(
      Number(
        attempt.timeLimitMs
      ) ||
        PLACEMENT_TIME_LIMIT_MS,
      Math.max(
        0,
        submittedAt.getTime() -
          new Date(
            attempt.startedAt
          ).getTime()
      )
    );
  attempt.lastSavedAt =
    submittedAt;
  const existingScoreRecords =
    await latestSubmittedScores(
      attempt.placementPurpose ||
        "INITIAL"
    );
  const rawScoreRecords = [
    ...existingScoreRecords,
    {
      userId:
        attempt.userId,
      scorePercent:
        earnedPoints,
    },
  ];
  const totalPercentile =
    stableTotalPercentile(
      earnedPoints,
      rawScoreRecords
    );
  const profile =
    placementProfile({
      attempt,
      totalPercentile,
      threePointCorrect,
      fourPointCorrect,
      keyQuestions,
      answered,
    });
  const verificationQuestions =
    profile.verification
      .required
      ? buildPlacementVerificationQuestions({
          excludedTypeIds:
            attempt.questions
              .filter(
                (question) =>
                  [
                    "semi-killer",
                    "killer",
                  ].includes(
                    question
                      .placementCategory
                  )
              )
              .map(
                (question) =>
                  question.typeId
              ),
          excludedSemanticTypeIds:
            attempt.questions.map(
              (question) =>
                question.semanticTypeId ||
                question.similarGroupId ||
                question.typeId
            ),
        })
      : [];
  attempt.placementResult = {
    threePoint:
      profile.threePoint,
    fourPoint:
      profile.fourPoint,
    semiKiller:
      profile.semiKiller,
    killer:
      profile.killer,
    keyQuestions,
    question20Correct:
      keyQuestions.find(
        (item) =>
          item.questionNumber === 20
      )?.correct || false,
    question21Correct:
      keyQuestions.find(
        (item) =>
          item.questionNumber === 21
      )?.correct || false,
    question28Correct:
      keyQuestions.find(
        (item) =>
          item.questionNumber === 28
      )?.correct || false,
    question30Correct:
      keyQuestions.find(
        (item) =>
          item.questionNumber === 30
      )?.correct || false,
    answeredCount: answered,
    unansweredCount:
      30 - answered,
    totalScore:
      earnedPoints,
    totalPercentile:
      profile.totalPercentile,
    abilityProfile:
      profile.abilityProfile,
    verification:
      {
        ...profile.verification,
        questions:
          verificationQuestions,
        timeLimitMs:
          40 * 60 * 1000,
        startedAt: null,
        submittedAt: null,
      },
    placementScore:
      profile.placementScore,
    initialMmr: null,
    tier: "",
    rankingStatus:
      "provisional",
    matchesUntilConfirmed: 2,
    cohortSize: 0,
    cohortAverage: null,
    cohortStandardDeviation:
      null,
    standardizedScore: null,
    percentile: null,
    initialRating: null,
    initialTier: "",
  };

  await attempt.save();

  if (
    attempt.placementResult
      .verification.result ===
    "pending"
  ) {
    return attempt;
  }

  const scoreRecords =
    await latestSubmittedScores(
      attempt.placementPurpose ||
        "INITIAL"
    );
  const standing = {
    ...standingFromScores(
      attempt.placementResult
        .placementScore,
      scoreRecords
    ),
    calibratedAt: new Date(),
  };

  Object.assign(
    attempt.placementResult,
    standing
  );
  await attempt.save();
  if (shouldUpdateSkillMmr(attempt)) {
    await upsertInitialRankingProfile({
      attempt,
      standing,
    });
  } else {
    await ensureRankingProfile(
      attempt.userId
    );
  }
  await syncInitialArenaPlacement({
    userId: attempt.userId,
    attemptId: attempt._id,
  });

  return attempt;
}

function normalizeAttempt(
  attempt
) {
  const view = attempt.toObject();
  if (
    view.scopeType ===
    "placement"
  ) {
    view.title = view.placementPurpose === "SEASON"
      ? "GOAT Arena 시즌 배치고사"
      : view.placementPurpose === "RENEWAL_RANK_ASSESSMENT"
        ? "GOAT Arena 랭크 복귀전"
        : "GOAT Arena 입단 배치고사";
  }
  const verificationPending =
    isVerificationPending(
      view
    );

  if (verificationPending) {
    const verification =
      view.placementResult
        .verification;
    view.placementVerificationPending =
      true;
    view.status =
      "in-progress";
    view.title = view.placementPurpose === "SEASON"
      ? "시즌 배치 추가 실력 확인"
      : view.placementPurpose === "RENEWAL_RANK_ASSESSMENT"
        ? "랭크 복귀 추가 실력 확인"
        : "입단 배치 추가 실력 확인";
    view.subtitle =
      "준킬러 2문항 · 킬러 2문항";
    view.questions =
      verification.questions ||
      [];
    view.timeLimitMs =
      verification.timeLimitMs ||
      40 * 60 * 1000;
    view.startedAt =
      verification.startedAt;
    view.totalPoints =
      view.questions.reduce(
        (sum, question) =>
          sum +
          Number(
            question.points
          ),
        0
      );
    view.currentQuestionIndex =
      Math.max(
        0,
        view.questions.findIndex(
          (question) =>
            !isAnswered(
              question.submittedAnswer
            )
        )
      );
    view.placementResult =
      null;
  }

  view.timeLimitMs =
    Number(
      view.timeLimitMs
    ) ||
    PLACEMENT_TIME_LIMIT_MS;
  view.deadlineAt = new Date(
    deadlineMs(view)
  );
  const normalizedQuestions = (
    view.questions || []
  ).map((question) => ({
    ...question,
    prompt: normalizeExamMath(
      question.prompt
    ),
    choices: (
      question.choices || []
    ).map((choice) => ({
      ...choice,
      text: normalizeExamMath(
        choice.text
      ),
    })),
    solution: normalizeExamMath(
      question.solution
    ),
  }));
  view.questions =
    [
      "submitted",
      "disqualified",
    ].includes(view.status)
      ? []
      : normalizedQuestions.map(
          (question) => {
            const {
              answer,
              solution,
              isCorrect,
              ...publicQuestion
            } = question;

            return publicQuestion;
          }
        );

  if (
    view.status ===
      "submitted" &&
    view.placementResult
  ) {
    const result =
      view.placementResult;
    view.placementResult = {
      totalCorrect:
        (
          Number(
            result.threePoint
              ?.correct
          ) || 0
        ) +
        (
          Number(
            result.fourPoint
              ?.correct
          ) || 0
        ),
      placementScore:
        Number(
          result.placementScore
        ) || 0,
      calibrationPolicyVersion:
        result
          .calibrationPolicyVersion,
      calibratedAt:
        result.calibratedAt,
      positionBasis:
        result.positionBasis,
      referenceStandard:
        result.referenceStandard,
      referenceGrade:
        result.referenceGrade,
      estimatedPercentile:
        result.estimatedPercentile,
      estimatedTopPercent:
        result.estimatedTopPercent,
      estimatedTopPercentMin:
        result
          .estimatedTopPercentMin,
      estimatedTopPercentMax:
        result
          .estimatedTopPercentMax,
      estimatedRankPopulation:
        Number(
          result.estimatedRankPopulation
        ) || ESTIMATED_RANK_POPULATION,
      estimatedRank:
        Number(result.estimatedRank) ||
        estimatedRankForTopPercent(
          result.estimatedTopPercent,
          result.estimatedRankPopulation
        ),
      initialMmr:
        result.initialMmr,
      tier: result.tier,
      rankingStatus:
        result.rankingStatus,
      cohortSize:
        result.cohortSize,
      cohortRank:
        result.cohortRank,
      actualRankMinimumCohortSize:
        result
          .actualRankMinimumCohortSize,
      actualRankPublished:
        result.actualRankPublished,
      actualPercentile:
        result.actualPercentile,
      cohortAverage:
        result.cohortAverage,
      cohortStandardDeviation:
        result
          .cohortStandardDeviation,
      standardizedScore:
        result.standardizedScore,
      percentile:
        result.percentile,
      initialRating:
        result.initialRating,
      initialTier:
        result.initialTier,
      rankPoint:
        result.rankPoint,
    };
  }

  return view;
}

async function getPlacementAttempt({
  userId,
  attemptId,
}) {
  let attempt =
    await findPlacementAttempt({
      userId,
      attemptId,
    });
  attempt =
    await refreshStaleEmptyAttempt(
      attempt
    );

  if (isOverdue(attempt)) {
    attempt =
      await disqualify(attempt);
  }

  if (
    isVerificationPending(
      attempt
    )
  ) {
    const verification =
      attempt.placementResult
        .verification;

    if (
      !verification.startedAt
    ) {
      verification.startedAt =
        new Date();
      const firstQuestion =
        verification.questions?.[0];
      if (firstQuestion) {
        firstQuestion.enteredAt =
          verification.startedAt;
        firstQuestion.visitCount =
          Math.max(
            1,
            Number(
              firstQuestion.visitCount
            ) || 0
          );
      }
      await attempt.save();
    }

    if (
      Date.now() >=
      verificationDeadlineMs(
        attempt
      )
    ) {
      attempt =
        await finalizePlacementVerificationAttempt({
          attempt,
        });
    }
  }

  if (
    attempt.status ===
      "submitted" &&
    attempt.placementResult &&
    !isVerificationPending(
      attempt
    )
  ) {
    const standing =
      await currentStanding(
        attempt
      );

    Object.assign(
      attempt.placementResult,
      standing
    );
    await attempt.save();
  }

  return normalizeAttempt(
    attempt
  );
}

module.exports = {
  KEY_QUESTION_NUMBERS,
  assertPlacementExamAccess,
  getPlacementDashboardData,
  createPlacementAttempt,
  getPlacementAttempt,
  savePlacementDraft,
  expirePlacementAttempt,
  submitPlacementAttempt,
  _testing: {
    actualStandingFromScores,
    adjustedAccuracy,
    scoreBreakdown,
    percentileForScore,
    stableTotalPercentile,
    placementProfile,
    standingFromScores,
    isInitialPlacementPurpose,
    placementAccessView,
    frozenStandingView,
    touchQuestionTiming,
    refreshStaleEmptyAttempt,
  },
};
