const mongoose = require("mongoose");

const { Schema } = mongoose;

/* --------------------------------------------------
 * 1. User
 * 사용자 계정 및 개인 설정
 * -------------------------------------------------- */

const preferenceSchema = new Schema(
  {
    coachMode: {
      type: String,
      enum: ["mild", "spicy", "silent"],
      default: "spicy",
    },

    autoplayMotion: {
      type: Boolean,
      default: true,
    },

    backgroundMusic: {
      type: Boolean,
      default: true,
    },

    reducedMotion: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // 원본 비밀번호가 아닌 암호화된 값만 저장
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
    },

    schoolGrade: {
      type: Number,
      enum: [10, 11, 12],
      default: 10,
    },

    preferences: {
      type: preferenceSchema,
      default: () => ({}),
    },

    totalStudySeconds: {
      type: Number,
      min: 0,
      default: 0,
    },

    currentStreak: {
      type: Number,
      min: 0,
      default: 0,
    },

    longestStreak: {
      type: Number,
      min: 0,
      default: 0,
    },

    lastStudyDate: {
      type: Date,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    school: {
      region: {
        type: String,
        required: true,
      },

      code: {
        type: String,
        required: true,
      },

      name: {
        type: String,
        required: true,
      },

      roadAddress: {
        type: String,
        default: "",
      },

      establishment: {
        type: String,
        default: "",
      },

      highSchoolType: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.index(
  { email: 1 },
  { unique: true }
);

/* --------------------------------------------------
 * 2. ConceptProgress
 * 학생별 개념 진도 및 ML 숙련도
 * -------------------------------------------------- */

const conceptProgressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    curriculumId: {
      type: String,
      required: true,
      default: "kr-2022",
    },

    courseId: {
      type: String,
      required: true,
    },

    unitId: {
      type: String,
      required: true,
    },

    conceptId: {
      type: String,
      required: true,
    },

    topicCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    completedTopicIndexes: {
      type: [Number],
      default: [],
    },

    completedTopics: {
      type: Number,
      min: 0,
      default: 0,
    },

    // 화면에 표시되는 진도
    completionPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // ML이 계산한 실제 개념 숙련 확률
    masteryProbability: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },

    status: {
      type: String,
      enum: ["not-started", "in-progress", "completed"],
      default: "not-started",
    },

    signals: {
      totalAttempts: {
        type: Number,
        min: 0,
        default: 0,
      },

      correctAttempts: {
        type: Number,
        min: 0,
        default: 0,
      },

      totalResponseTimeMs: {
        type: Number,
        min: 0,
        default: 0,
      },

      hintsUsed: {
        type: Number,
        min: 0,
        default: 0,
      },

      visualizationReplays: {
        type: Number,
        min: 0,
        default: 0,
      },
    },

    masteryModel: {
      name: {
        type: String,
        default: null,
      },

      version: {
        type: String,
        default: null,
      },

      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      calculatedAt: {
        type: Date,
        default: null,
      },
    },

    lastStudiedAt: {
      type: Date,
      default: null,
    },

    nextReviewAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
    masteryGate: {
      requiredDistinctTypes: {
        type: Number,
        min: 1,
        default: 5,
      },

      correctTypeIds: {
        type: [String],
        default: [],
      },

      unlockedAt: {
        type: Date,
        default: null,
      },

      userCompleted: {
        type: Boolean,
        default: false,
      },

      completedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * 한 학생에게 같은 개념 진도 문서가
 * 여러 개 생기지 않도록 방지
 */
conceptProgressSchema.index(
  {
    userId: 1,
    curriculumId: 1,
    courseId: 1,
    unitId: 1,
    conceptId: 1,
  },
  {
    unique: true,
  }
);

conceptProgressSchema.index({
  userId: 1,
  lastStudiedAt: -1,
});

conceptProgressSchema.index({
  userId: 1,
  nextReviewAt: 1,
});

/**
 * 완료한 topic을 기준으로
 * completedTopics, completionPercent, status 자동 계산
 */
conceptProgressSchema.pre("validate", function () {
  const totalTopics = Math.max(
    0,
    Number(this.topicCount) || 0
  );

  const completedIndexes = [
    ...new Set(
      (this.completedTopicIndexes || [])
        .map(Number)
        .filter(
          (index) =>
            Number.isInteger(index) &&
            index >= 0 &&
            (
              totalTopics === 0 ||
              index < totalTopics
            )
        )
    ),
  ].sort((a, b) => a - b);

  this.completedTopicIndexes = completedIndexes;
  this.completedTopics = completedIndexes.length;

  if (!this.masteryGate) {
    this.masteryGate = {};
  }

  const requiredTypes = Math.max(
    1,
    Number(
      this.masteryGate.requiredDistinctTypes
    ) || 5
  );

  const correctTypeIds = [
    ...new Set(
      (this.masteryGate.correctTypeIds || [])
        .map(String)
        .filter(Boolean)
    ),
  ];

  this.masteryGate.requiredDistinctTypes =
    requiredTypes;

  this.masteryGate.correctTypeIds =
    correctTypeIds;

  const masteryUnlocked =
    correctTypeIds.length >= requiredTypes;

  if (masteryUnlocked) {
    this.masteryGate.unlockedAt =
      this.masteryGate.unlockedAt ||
      new Date();
  } else {
    this.masteryGate.unlockedAt = null;
    this.masteryGate.userCompleted = false;
    this.masteryGate.completedAt = null;
  }

  /*
   * 진도 계산
   *
   * 개념 설명 항목: 최대 30%
   * 서로 다른 문제 유형: 최대 60%
   * 완료 체크: 100%
   */

  const topicProgress = totalTopics
    ? Math.round(
        (completedIndexes.length / totalTopics) *
          30
      )
    : 0;

  const problemProgress = Math.round(
    Math.min(
      correctTypeIds.length / requiredTypes,
      1
    ) * 60
  );

  if (
    masteryUnlocked &&
    this.masteryGate.userCompleted
  ) {
    this.completionPercent = 100;
    this.status = "completed";

    const completedAt =
      this.masteryGate.completedAt ||
      this.completedAt ||
      new Date();

    this.completedAt = completedAt;
    this.masteryGate.completedAt =
      completedAt;
  } else {
    this.completionPercent = Math.min(
      90,
      topicProgress + problemProgress
    );

    this.completedAt = null;
    this.masteryGate.completedAt = null;

    this.status =
      this.completionPercent > 0
        ? "in-progress"
        : "not-started";
  }
});

/* --------------------------------------------------
 * 3. Problem
 * 모든 학생이 공용으로 사용하는 문제
 * -------------------------------------------------- */

const choiceSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
    },

    text: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const solutionStepSchema = new Schema(
  {
    step: {
      type: Number,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    explanation: {
      type: String,
      required: true,
    },

    visualizationCue: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const problemSchema = new Schema(
  {
    externalId: {
      type: String,
      required: true,
    },

    curriculumId: {
      type: String,
      required: true,
      default: "kr-2022",
    },

    courseId: {
      type: String,
      required: true,
    },

    unitId: {
      type: String,
      required: true,
    },

    conceptIds: {
      type: [String],
      required: true,
      default: [],
    },

    primaryConceptId: {
      type: String,
      required: true,
    },

    source: {
      type: {
        type: String,
        enum: [
          "textbook",
          "mock-exam",
          "generated",
          "custom",
        ],
        required: true,
      },

      year: {
        type: Number,
        default: null,
      },

      month: {
        type: Number,
        min: 1,
        max: 12,
        default: null,
      },

      organization: {
        type: String,
        default: null,
      },

      questionNumber: {
        type: Number,
        default: null,
      },
    },

    questionType: {
      type: String,
      enum: [
        "multiple-choice",
        "short-answer",
        "essay",
      ],
      required: true,
    },

    stem: {
      type: String,
      required: true,
    },

    choices: {
      type: [choiceSchema],
      default: [],
    },

    // 서버 채점에서만 사용
    correctAnswer: {
      type: Schema.Types.Mixed,
      required: true,
      select: false,
    },

    solutionSteps: {
      type: [solutionStepSchema],
      default: [],
    },

    difficulty: {
      type: Number,
      min: 1,
      max: 5,
      default: 1,
    },

    estimatedTimeSeconds: {
      type: Number,
      min: 0,
      default: null,
    },

    score: {
      type: Number,
      min: 0,
      default: 0,
    },

    tags: {
      type: [String],
      default: [],
    },

    visualizationTemplateId: {
      type: String,
      default: null,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

problemSchema.index(
  { externalId: 1 },
  { unique: true }
);

problemSchema.index({
  curriculumId: 1,
  courseId: 1,
  unitId: 1,
  primaryConceptId: 1,
  difficulty: 1,
});

/* --------------------------------------------------
 * 4. ProblemAttempt
 * 학생이 문제를 푼 결과
 * 오답 노트도 이 컬렉션에서 조회
 * -------------------------------------------------- */

const problemAttemptSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },

    curriculumId: {
      type: String,
      required: true,
    },

    courseId: {
      type: String,
      required: true,
    },

    unitId: {
      type: String,
      required: true,
    },

    conceptId: {
      type: String,
      required: true,
    },

    attemptNumber: {
      type: Number,
      min: 1,
      required: true,
    },

    submittedAnswer: {
      type: Schema.Types.Mixed,
      required: true,
    },

    /*
     * 숫자가 바뀌는 생성형 문제는 공용 Problem 문서만으로
     * 실제 출제 문장을 복원할 수 없으므로 시도 당시 내용을 보관한다.
     */
    problemSnapshot: {
      typeId: {
        type: String,
        default: null,
      },

      stem: {
        type: String,
        default: "",
      },

      choices: {
        type: [choiceSchema],
        default: [],
      },

      solution: {
        type: String,
        default: "",
      },

      difficulty: {
        type: Number,
        min: 1,
        max: 5,
        default: 1,
      },
    },

    isCorrect: {
      type: Boolean,
      required: true,
    },

    score: {
      type: Number,
      min: 0,
      default: 0,
    },

    maxScore: {
      type: Number,
      min: 0,
      default: 0,
    },

    responseTimeMs: {
      type: Number,
      min: 0,
      default: 0,
    },

    hintsUsed: {
      type: Number,
      min: 0,
      default: 0,
    },

    visualizationReplayCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    stoppedAtStep: {
      type: Number,
      min: 1,
      default: null,
    },

    errorAnalysis: {
      errorType: {
        type: String,
        enum: [
          "calculation-error",
          "formula-confusion",
          "missing-condition",
          "sign-error",
          "concept-not-understood",
          "prerequisite-missing",
          "unknown",
        ],
        default: null,
      },

      relatedConceptId: {
        type: String,
        default: null,
      },

      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      modelVersion: {
        type: String,
        default: null,
      },

      analyzedAt: {
        type: Date,
        default: null,
      },
    },

    review: {
      status: {
        type: String,
        enum: [
          "not-required",
          "pending",
          "scheduled",
          "completed",
        ],
        default: "not-required",
      },

      scheduledAt: {
        type: Date,
        default: null,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      correctedAfterReview: {
        type: Boolean,
        default: false,
      },
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

problemAttemptSchema.index(
  {
    userId: 1,
    problemId: 1,
    attemptNumber: 1,
  },
  {
    unique: true,
  }
);

problemAttemptSchema.index({
  userId: 1,
  isCorrect: 1,
  submittedAt: -1,
});

problemAttemptSchema.index({
  userId: 1,
  "review.status": 1,
  "review.scheduledAt": 1,
});

problemAttemptSchema.index({
  conceptId: 1,
  submittedAt: -1,
});

/* --------------------------------------------------
 * 5. LearningEvent
 * ML 데이터셋으로 사용할 학습 행동 로그
 * -------------------------------------------------- */

const learningEventSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 중복 이벤트 저장 방지용 UUID
    clientEventId: {
      type: String,
      required: true,
    },

    sessionId: {
      type: String,
      required: true,
      index: true,
    },

    schemaVersion: {
      type: Number,
      default: 1,
    },

    eventType: {
      type: String,
      required: true,
      enum: [
        "concept-opened",
        "concept-closed",
        "step-viewed",
        "step-replayed",
        "hint-used",
        "problem-opened",
        "problem-attempted",
        "problem-correct",
        "problem-wrong",
        "topic-completed",
        "topic-uncompleted",
        "concept-completed",
        "review-started",
        "review-completed",
        "recommendation-shown",
        "recommendation-clicked",
      ],
    },

    curriculumId: {
      type: String,
      default: "kr-2022",
    },

    courseId: {
      type: String,
      default: null,
    },

    unitId: {
      type: String,
      default: null,
    },

    conceptId: {
      type: String,
      default: null,
    },

    topicIndex: {
      type: Number,
      min: 0,
      default: null,
    },

    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      default: null,
    },

    attemptId: {
      type: Schema.Types.ObjectId,
      ref: "ProblemAttempt",
      default: null,
    },

    stepNumber: {
      type: Number,
      min: 1,
      default: null,
    },

    durationMs: {
      type: Number,
      min: 0,
      default: null,
    },

    correct: {
      type: Boolean,
      default: null,
    },

    // 이벤트별 추가 정보
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

learningEventSchema.index(
  {
    userId: 1,
    clientEventId: 1,
  },
  {
    unique: true,
  }
);

learningEventSchema.index({
  userId: 1,
  occurredAt: -1,
});

learningEventSchema.index({
  userId: 1,
  conceptId: 1,
  occurredAt: -1,
});

learningEventSchema.index({
  eventType: 1,
  occurredAt: -1,
});

/* --------------------------------------------------
 * 6. ConceptLesson
 * 실제 개념 학습 콘텐츠
 * YAML은 교육과정 구조, 이 컬렉션은 콘텐츠를 담당
 * -------------------------------------------------- */

const lessonStepSchema = new Schema(
    {
        order: {
            type: Number,
            required: true,
        },

        title: {
            type: String,
            required: true,
        },

        description: {
            type: String,
            default: "",
        },

        motionAssetUrl: {
            type: String,
            default: null,
        },

        lottieAssetUrl: {
            type: String,
            default: null,
        },
    },
    {
        _id: false,
    }
);

const previewBlockSchema = new Schema(
    {
        label: {
            type: String,
            required: true,
        },

        tone: {
            type: String,
            enum: ["primary", "secondary", "accent"],
            default: "secondary",
        },
    },
    {
        _id: false,
    }
);

const conceptLessonSchema = new Schema(
    {
        curriculumId: {
            type: String,
            required: true,
            default: "kr-2022",
        },

        courseId: {
            type: String,
            required: true,
        },

        unitId: {
            type: String,
            required: true,
        },

        conceptId: {
            type: String,
            required: true,
        },

        estimatedMinutes: {
            type: Number,
            min: 1,
            default: 10,
        },

        steps: {
            type: [lessonStepSchema],
            default: [],
        },

        dashboardPreview: {
            type: {
                type: String,
                enum: [
                    "area-model",
                    "graph",
                    "formula",
                    "motion",
                ],
                default: "formula",
            },

            title: {
                type: String,
                default: "",
            },

            formula: {
                type: String,
                default: "",
            },

            blocks: {
                type: [previewBlockSchema],
                default: [],
            },
        },

        isPublished: {
            type: Boolean,
            default: false,
        },
        summary: {
          type: String,
          default: "",
        },

        keyTakeaway: {
          type: String,
          default: "",
        },

        motion: {
          assetUrl: {
            type: String,
            default: null,
          },

          posterUrl: {
            type: String,
            default: null,
          },

          durationSeconds: {
            type: Number,
            min: 0,
            default: null,
          },
        },

        playgroundKey: {
          type: String,
          default: null,
        },

        practice: {
          generatorKey: {
            type: String,
            default: null,
          },

          requiredDistinctTypes: {
            type: Number,
            min: 1,
            default: 5,
          },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

conceptLessonSchema.index(
    {
        curriculumId: 1,
        courseId: 1,
        unitId: 1,
        conceptId: 1,
    },
    {
        unique: true,
    }
);

/* --------------------------------------------------
 * 7. DailyPlan
 * 학생별 오늘의 학습 계획
 * -------------------------------------------------- */

const dailyTaskSchema = new Schema({
    kind: {
        type: String,
        enum: ["concept", "practice", "review"],
        required: true,
    },

    title: {
        type: String,
        required: true,
    },

    description: {
        type: String,
        default: "",
    },

    href: {
        type: String,
        required: true,
    },

    estimatedMinutes: {
        type: Number,
        min: 0,
        default: 0,
    },

    status: {
        type: String,
        enum: ["pending", "completed"],
        default: "pending",
    },
});

const dailyPlanSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        dateKey: {
            type: String,
            required: true,
        },

        tasks: {
            type: [dailyTaskSchema],
            default: [],
        },

        messages: {
            empty: {
                type: String,
                default: "",
            },

            partial: {
                type: String,
                default: "",
            },

            complete: {
                type: String,
                default: "",
            },
        },

        coachMessages: {
            mild: {
                type: String,
                default: "",
            },

            spicy: {
                type: String,
                default: "",
            },

            silent: {
                type: String,
                default: "",
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

dailyPlanSchema.index(
    {
        userId: 1,
        dateKey: 1,
    },
    {
        unique: true,
    }
);

/* --------------------------------------------------
 * Model 생성
 * -------------------------------------------------- */

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

const ConceptProgress =
  mongoose.models.ConceptProgress ||
  mongoose.model(
    "ConceptProgress",
    conceptProgressSchema
  );

const Problem =
  mongoose.models.Problem ||
  mongoose.model("Problem", problemSchema);

const ProblemAttempt =
  mongoose.models.ProblemAttempt ||
  mongoose.model(
    "ProblemAttempt",
    problemAttemptSchema
  );

const LearningEvent =
  mongoose.models.LearningEvent ||
  mongoose.model(
    "LearningEvent",
    learningEventSchema
  );

const ConceptLesson =
    mongoose.models.ConceptLesson ||
    mongoose.model(
        "ConceptLesson",
        conceptLessonSchema
    );

const DailyPlan =
    mongoose.models.DailyPlan ||
    mongoose.model(
        "DailyPlan",
        dailyPlanSchema
    );

module.exports = {
    User,
    ConceptProgress,
    Problem,
    ProblemAttempt,
    LearningEvent,
    ConceptLesson,
    DailyPlan,
};
