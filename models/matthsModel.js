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

    /*
     * 공개 랭킹과 GOAT Arena에서는 항상 닉네임을 사용한다.
     * realName 값은 기존 저장 데이터 호환을 위해서만 유지한다.
     */
    rankingDisplayMode: {
      type: String,
      enum: ["nickname", "realName"],
      default: "nickname",
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

    /*
     * 닉네임의 대소문자·공백 차이를 무시하고 중복을 막기 위한 값입니다.
     * 기존 회원은 닉네임을 다음에 변경할 때 이 값이 채워집니다.
     */
    nameNormalized: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 30,
      default: undefined,
    },

    realName: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },

    /*
     * 생년월일 원본은 향후 페이백 계좌 명의 확인에만 사용합니다.
     * 일반 사용자 조회에서 실수로 노출되지 않도록 기본 select 대상에서
     * 제외하고, 중복 계정 탐지는 아래 단방향 해시로 수행합니다.
     */
    birthDate: {
      type: Date,
      default: null,
      select: false,
    },

    identityMatchHash: {
      type: String,
      trim: true,
      maxlength: 128,
      default: undefined,
      select: false,
    },

    identityMatchVersion: {
      type: String,
      enum: ["name-birthdate-school-v1"],
      default: undefined,
      select: false,
    },

    identityVerificationStatus: {
      type: String,
      enum: [
        "unverified",
        "review-required",
        "verified",
      ],
      default: "unverified",
      index: true,
    },

    identityDuplicateAlertedAt: {
      type: Date,
      default: null,
    },

    /*
     * 게시판 익명 작성 시 계정마다 한 번만 발급되는 고정 번호입니다.
     * 공개 화면에는 이 번호만 노출하고 운영 화면에서는 authorId로
     * 실제 계정을 계속 확인할 수 있습니다.
     */
    communityAnonymousNumber: {
      type: String,
      trim: true,
      match: /^\d{6}$/,
      default: undefined,
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
      enum: [
        "student",
        "teacher",
        "admin",
        "test",
      ],
      default: "student",
    },

    isTestAccount: {
      type: Boolean,
      default: false,
      index: true,
    },

    testBatchKey: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
      index: true,
    },

    /*
     * 실제 운영 계정을 테스트 전용 계정과 제한적으로 1대1 매칭할 때만
     * 운영자가 켜는 임시 권한입니다. 일반 사용자는 기본값 false이며,
     * 테스트 계정과의 매칭은 이 값이 명시적으로 true인 경우에만 허용합니다.
     */
    arenaTestMatchEnabled: {
      type: Boolean,
      default: false,
      select: false,
    },

    operatorRemark: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    schoolGrade: {
      type: Number,
      enum: [10, 11, 12, 13, 14, 15],
      default: 10,
    },

    learnerType: {
      type: String,
      enum: ["HIGH_SCHOOL", "RETAKER", "UNIVERSITY", "WORKER"],
      default: "HIGH_SCHOOL",
      index: true,
    },

    /*
     * 매년 3월 1일 학년 승급을 한 번만 적용하기 위한
     * 마지막 처리 학년도입니다. 13은 N수생을 뜻합니다.
     */
    lastGradePromotionYear: {
      type: Number,
      default: null,
    },

    /*
     * 재학/졸업 상태는 학교 정보와 별도로 유지합니다. 고3이 다음
     * 학사연도에 N수생으로 전환되어도 졸업 학교 정보는 보존됩니다.
     */
    educationStatus: {
      type: String,
      enum: ["enrolled", "graduated"],
      default: "enrolled",
      index: true,
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

    /*
     * 사이트 접속 시간은 요청 로그를 계속 쌓지 않고 사용자별 누적값만
     * 저장합니다. 브라우저 heartbeat 간격을 서버에서 검증해 여러 탭이나
     * 장시간 미접속 구간이 접속 시간으로 과다 계산되지 않게 합니다.
     */
    totalConnectedSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },

    lastConnectedAt: {
      type: Date,
      default: null,
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

    tokenVersion: {
      type: Number,
      min: 0,
      default: 0,
    },

    termsAcceptedAt: {
      type: Date,
      default: null,
    },

    termsVersion: {
      type: String,
      default: "2026-08-01",
    },

    privacyVersion: {
      type: String,
      default: "2026-08-01",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /*
     * isActive는 기존 코드와 모바일 API 호환을 위해 유지하고,
     * 실제 운영 상태와 제재 정보는 아래 필드에서 구분합니다.
     */
    accountStatus: {
      type: String,
      enum: [
        "active",
        "inactive",
        "suspended",
        "withdrawn",
      ],
      default: "active",
      index: true,
    },

    accountStatusReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    suspendedUntil: {
      type: Date,
      default: null,
    },

    accountStatusChangedAt: {
      type: Date,
      default: null,
    },

    warningCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    privateMockRestriction: {
      active: {
        type: Boolean,
        default: false,
      },
      remainingExamCount: {
        type: Number,
        min: 0,
        max: 3,
        default: 0,
      },
      remainingWeekCount: {
        type: Number,
        min: 0,
        max: 3,
        default: 0,
      },
      imposedAt: {
        type: Date,
        default: null,
      },
      reason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },
      imposedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      sourceIntegrityCaseId: {
        type: Schema.Types.ObjectId,
        ref: "PrivateMockIntegrityCase",
        default: null,
      },
      servedExamIds: {
        type: [Schema.Types.ObjectId],
        ref: "PrivateMockExam",
        default: [],
      },
      servedWeekKeys: {
        type: [String],
        default: [],
      },
      clearedAt: {
        type: Date,
        default: null,
      },
    },

    withdrawal: {
      anonymizedAt: {
        type: Date,
        default: null,
      },
      initiatedBy: {
        type: String,
        enum: [
          "self",
          "admin",
          null,
        ],
        default: null,
      },
      dataRetention: {
        type: String,
        enum: [
          "anonymous",
          "purged",
          null,
        ],
        default: null,
      },
    },

    school: {
      region: {
        type: String,
        default: "",
      },

      code: {
        type: String,
        default: "",
      },

      name: {
        type: String,
        default: "",
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

    university: {
      code: { type: String, default: "" },
      name: { type: String, default: "" },
      campus: { type: String, default: "" },
      region: { type: String, default: "" },
      institutionLevel: { type: String, default: "" },
      institutionType: { type: String, default: "" },
      establishment: { type: String, default: "" },
    },

    /*
     * 페이백 계좌는 선택 정보입니다. 계좌번호 원문은 저장하지 않고
     * AES-256-GCM 암호문만 보관합니다. 사용자 화면에는 마지막 4자리만,
     * 정산 권한이 있는 운영자 화면에서만 복호화한 값을 표시합니다.
     */
    paybackAccount: {
      status: {
        type: String,
        enum: ["UNLINKED", "CONFIRMED"],
        default: "UNLINKED",
        index: true,
      },
      bankName: {
        type: String,
        trim: true,
        maxlength: 40,
        default: "",
      },
      accountHolderName: {
        type: String,
        trim: true,
        maxlength: 40,
        default: "",
        select: false,
      },
      accountNumberEncrypted: {
        type: String,
        default: "",
        select: false,
      },
      accountNumberIv: {
        type: String,
        default: "",
        select: false,
      },
      accountNumberTag: {
        type: String,
        default: "",
        select: false,
      },
      accountNumberLast4: {
        type: String,
        trim: true,
        maxlength: 4,
        default: "",
      },
      confirmedAt: {
        type: Date,
        default: null,
      },
      updatedAt: {
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

userSchema.index(
  { email: 1 },
  { unique: true }
);
userSchema.index({
  "school.code": 1,
  schoolGrade: 1,
  isActive: 1,
});
userSchema.index({
  "university.code": 1,
  schoolGrade: 1,
  isActive: 1,
});
userSchema.index({
  name: 1,
});
userSchema.index(
  { nameNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: {
      nameNormalized: {
        $type: "string",
      },
    },
  }
);
userSchema.index(
  { communityAnonymousNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      communityAnonymousNumber: {
        $type: "string",
      },
    },
  }
);
userSchema.index({
  accountStatus: 1,
  suspendedUntil: 1,
});
userSchema.index({
  identityMatchHash: 1,
  identityMatchVersion: 1,
  "school.code": 1,
  accountStatus: 1,
});

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

    /*
     * 오답 복습 중 생성된 풀이 기록은 원래 오답과 연결하되,
     * 별도의 오답 노트 카드로 다시 생성하지 않는다.
     */
    reviewSourceAttemptId: {
      type: Schema.Types.ObjectId,
      ref: "ProblemAttempt",
      default: null,
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
  reviewSourceAttemptId: 1,
  submittedAt: -1,
});

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
 * 5. AssessmentAttempt
 * 소단원 중간평가 · 대단원 기말평가 · 과목 종합평가
 * -------------------------------------------------- */

const assessmentQuestionSchema =
  new Schema(
    {
      questionId: {
        type: String,
        required: true,
      },

      typeId: {
        type: String,
        required: true,
      },

      sourceTypeIds: {
        type: [String],
        default: [],
      },

      difficulty: {
        type: String,
        enum: [
          "mid-high",
          "applied",
          "advanced",
        ],
        required: true,
      },

      placementCategory: {
        type: String,
        enum: [
          "general",
          "advanced",
          "semi-killer",
          "killer",
        ],
        default: "general",
      },

      selectionProbability: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },

      distributionSource: {
        type: String,
        default: "",
      },

      placementNumber: {
        type: Number,
        min: 1,
        max: 30,
        default: null,
      },

      fixedCourseId: {
        type: String,
        default: "",
      },

      selectedTypeKey: {
        type: String,
        default: "",
      },

      selectedTypeLabel: {
        type: String,
        default: "",
      },

      semanticTypeId: {
        type: String,
        default: "",
        maxlength: 160,
      },

      difficultyScore: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      skillTags: {
        type: [String],
        default: [],
      },

      expectedTimeMs: {
        type: Number,
        min: 0,
        default: null,
      },

      similarGroupId: {
        type: String,
        default: "",
      },

      sourceCourseId: {
        type: String,
        required: true,
      },

      sourceUnitId: {
        type: String,
        required: true,
      },

      sourceSubunitId: {
        type: String,
        required: true,
      },

      sourceConceptId: {
        type: String,
        default: "",
      },

      retryTypeId: {
        type: String,
        default: "",
      },

      referenceExamIds: {
        type: [String],
        default: [],
      },

      sourcePattern: {
        type: String,
        default: "",
      },

      referenceArchetypeId: {
        type: String,
        default: "",
      },

      estimatedMinutes: {
        type: Number,
        min: 0,
        default: null,
      },

      reasoningSteps: {
        type: [String],
        default: [],
      },

      adaptationStage: {
        type: String,
        default: "",
      },

      prompt: {
        type: String,
        required: true,
      },

      inputMode: {
        type: String,
        enum: [
          "multiple-choice",
          "short-answer",
        ],
        required: true,
      },

      choices: {
        type: [choiceSchema],
        default: [],
      },

      answer: {
        type: Schema.Types.Mixed,
        required: true,
      },

      solution: {
        type: String,
        default: "",
      },

      points: {
        type: Number,
        min: 0,
        required: true,
      },

      submittedAnswer: {
        type: Schema.Types.Mixed,
        default: null,
      },

      selectedAnswer: {
        type: Schema.Types.Mixed,
        default: null,
      },

      isCorrect: {
        type: Boolean,
        default: null,
      },

      responseTimeMs: {
        type: Number,
        min: 0,
        default: 0,
      },

      answerChanges: {
        type: Number,
        min: 0,
        default: 0,
      },

      enteredAt: {
        type: Date,
        default: null,
      },

      exitedAt: {
        type: Date,
        default: null,
      },

      answeredAt: {
        type: Date,
        default: null,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      visitCount: {
        type: Number,
        min: 0,
        default: 0,
      },

      validation: {
        passed: {
          type: Boolean,
          default: false,
        },

        solvable: {
          type: Boolean,
          default: false,
        },

        uniqueAnswer: {
          type: Boolean,
          default: false,
        },

        calculatorFree: {
          type: Boolean,
          default: false,
        },

        answerMatches: {
          type: Boolean,
          default: false,
        },

        generationAttempts: {
          type: Number,
          min: 0,
          default: 0,
        },

        operationCount: {
          type: Number,
          min: 0,
          default: null,
        },

        maxInteger: {
          type: Number,
          min: 0,
          default: null,
        },

        checkedAt: {
          type: Date,
          default: null,
        },
      },
    },
    {
      _id: false,
    }
  );

const placementScoreBreakdownSchema =
  new Schema(
    {
      correct: {
        type: Number,
        min: 0,
        default: 0,
      },

      total: {
        type: Number,
        min: 0,
        default: 0,
      },

      rawAccuracy: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      adjustedAccuracy: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      question20: {
        type: Boolean,
        default: null,
      },

      question21: {
        type: Boolean,
        default: null,
      },

      question28: {
        type: Boolean,
        default: null,
      },

      question30: {
        type: Boolean,
        default: null,
      },
    },
    {
      _id: false,
    }
  );

const placementKeyQuestionSchema =
  new Schema(
    {
      questionNumber: {
        type: Number,
        required: true,
      },

      answered: {
        type: Boolean,
        default: false,
      },

      correct: {
        type: Boolean,
        default: false,
      },

      category: {
        type: String,
        enum: [
          "semi-killer",
          "killer",
        ],
        default: "semi-killer",
      },

      difficultyScore: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      skillTags: {
        type: [String],
        default: [],
      },

      responseTimeMs: {
        type: Number,
        min: 0,
        default: 0,
      },
    },
    {
      _id: false,
    }
  );

const placementAbilityProfileSchema =
  new Schema(
    {
      coreAbility: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      advancedAbilityBeforeVerification: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      advancedAbilityAfterVerification: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      consistency: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      placementConfidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      basicStability: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      possibleMistakeCount: {
        type: Number,
        min: 0,
        default: 0,
      },

      confirmedConceptGapCount: {
        type: Number,
        min: 0,
        default: 0,
      },
    },
    {
      _id: false,
    }
  );

const placementVerificationSchema =
  new Schema(
    {
      required: {
        type: Boolean,
        default: false,
      },

      flagScore: {
        type: Number,
        min: 0,
        default: 0,
      },

      reasons: {
        type: [String],
        default: [],
      },

      correct: {
        type: Number,
        min: 0,
        default: 0,
      },

      total: {
        type: Number,
        min: 0,
        default: 0,
      },

      result: {
        type: String,
        enum: [
          "not-required",
          "pending",
          "unconfirmed",
          "confirmed",
          "extended",
        ],
        default: "not-required",
      },

      questions: {
        type: [
          assessmentQuestionSchema,
        ],
        default: [],
      },

      timeLimitMs: {
        type: Number,
        min: 1000,
        default:
          40 * 60 * 1000,
      },

      startedAt: {
        type: Date,
        default: null,
      },

      submittedAt: {
        type: Date,
        default: null,
      },
    },
    {
      _id: false,
    }
  );

const placementResultSchema =
  new Schema(
    {
      threePoint: {
        type: placementScoreBreakdownSchema,
        default: () => ({}),
      },

      fourPoint: {
        type: placementScoreBreakdownSchema,
        default: () => ({}),
      },

      semiKiller: {
        type: placementScoreBreakdownSchema,
        default: () => ({}),
      },

      killer: {
        type: placementScoreBreakdownSchema,
        default: () => ({}),
      },

      keyQuestions: {
        type: [placementKeyQuestionSchema],
        default: [],
      },

      question20Correct: {
        type: Boolean,
        default: null,
      },

      question21Correct: {
        type: Boolean,
        default: null,
      },

      question28Correct: {
        type: Boolean,
        default: null,
      },

      question30Correct: {
        type: Boolean,
        default: null,
      },

      answeredCount: {
        type: Number,
        min: 0,
        default: 0,
      },

      unansweredCount: {
        type: Number,
        min: 0,
        default: 30,
      },

      totalScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },

      totalPercentile: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      abilityProfile: {
        type: placementAbilityProfileSchema,
        default: () => ({}),
      },

      verification: {
        type: placementVerificationSchema,
        default: () => ({}),
      },

      placementScore: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },

      initialMmr: {
        type: Number,
        min: 0,
        default: null,
      },

      tier: {
        type: String,
        default: "",
      },

      rankingStatus: {
        type: String,
        enum: [
          "provisional",
          "confirmed",
        ],
        default: "provisional",
      },

      matchesUntilConfirmed: {
        type: Number,
        min: 0,
        default: 2,
      },

      cohortSize: {
        type: Number,
        min: 0,
        default: 0,
      },

      cohortAverage: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },

      cohortStandardDeviation: {
        type: Number,
        min: 0,
        default: null,
      },

      standardizedScore: {
        type: Number,
        default: null,
      },

      percentile: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },

      initialRating: {
        type: Number,
        min: 0,
        default: null,
      },

      initialTier: {
        type: String,
        default: "",
      },
    },
    {
      _id: false,
    }
  );

const assessmentAttemptSchema =
  new Schema(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      paperId: {
        type: String,
        required: true,
        unique: true,
      },

      generationVersion: {
        type: String,
        default: "",
        index: true,
      },

      scopeType: {
        type: String,
        enum: [
          "subunit",
          "unit",
          "course",
          "placement",
        ],
        required: true,
      },

      placementPurpose: {
        type: String,
        enum: [
          null,
          "INITIAL",
          "SEASON",
          "RENEWAL_RANK_ASSESSMENT",
        ],
        default: null,
        index: true,
      },

      placementContextKey: {
        type: String,
        trim: true,
        maxlength: 160,
        default: null,
        index: true,
      },

      curriculumId: {
        type: String,
        default: "kr-2022",
      },

      courseId: {
        type: String,
        required: true,
      },

      unitId: {
        type: String,
        default: null,
      },

      subunitId: {
        type: String,
        default: null,
      },

      title: {
        type: String,
        required: true,
      },

      subtitle: {
        type: String,
        default: "",
      },

      passScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 80,
      },

      questions: {
        type: [
          assessmentQuestionSchema,
        ],
        default: [],
      },

      totalPoints: {
        type: Number,
        min: 0,
        required: true,
      },

      earnedPoints: {
        type: Number,
        min: 0,
        default: 0,
      },

      scorePercent: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },

      passed: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum: [
          "in-progress",
          "submitted",
          "abandoned",
          "disqualified",
        ],
        default: "in-progress",
      },

      startedAt: {
        type: Date,
        default: Date.now,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      elapsedTimeMs: {
        type: Number,
        min: 0,
        default: 0,
      },

      timeLimitMs: {
        type: Number,
        min: 1000,
        default: null,
      },

      disqualifiedReason: {
        type: String,
        enum: [
          null,
          "time-limit",
        ],
        default: null,
      },

      lastSavedAt: {
        type: Date,
        default: null,
      },

      activeQuestionId: {
        type: String,
        default: "",
      },

      currentQuestionIndex: {
        type: Number,
        min: 0,
        default: 0,
      },

      questionTimingLastSeenAt: {
        type: Date,
        default: null,
      },

      placementResult: {
        type: placementResultSchema,
        default: null,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

assessmentAttemptSchema.index({
  userId: 1,
  scopeType: 1,
  courseId: 1,
  unitId: 1,
  subunitId: 1,
  passed: 1,
  submittedAt: -1,
});

/*
 * 배치고사는 INITIAL·시즌·랭크 복귀처럼 서버가 정한 동일 응시 구간에서
 * 한 번만 생성한다. 부분 고유 인덱스로 연속 클릭이나 동시 요청도 막는다.
 */
assessmentAttemptSchema.index(
  {
    userId: 1,
    scopeType: 1,
    placementContextKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      scopeType: "placement",
      placementContextKey: {
        $type: "string",
      },
    },
  }
);

/* --------------------------------------------------
 * 6. LearningEvent
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
 * 8. PasswordResetCode
 * 비밀번호 재설정용 일회성 이메일 인증코드
 * -------------------------------------------------- */

const passwordResetCodeSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        codeHash: {
            type: String,
            required: true,
            select: false,
        },

        mode: {
            type: String,
            enum: ["code", "link"],
            default: "code",
        },

        status: {
            type: String,
            enum: [
                "pending",
                "verified",
                "used",
                "locked",
            ],
            default: "pending",
        },

        failedAttempts: {
            type: Number,
            min: 0,
            default: 0,
        },

        expiresAt: {
            type: Date,
            required: true,
        },

        verifiedAt: {
            type: Date,
            default: null,
        },

        usedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

passwordResetCodeSchema.index(
    {
        expiresAt: 1,
    },
    {
        expireAfterSeconds: 0,
    }
);

passwordResetCodeSchema.index({
    userId: 1,
    createdAt: -1,
});

/* --------------------------------------------------
 * 9. QuickPracticeAttempt
 * 40초 안에 푸는 2·3점 짧은 문제 기록
 * -------------------------------------------------- */

const quickPracticeAttemptSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },

            instanceId: {
                type: String,
                required: true,
                unique: true,
            },

            pointValue: {
                type: Number,
                enum: [2, 3],
                required: true,
            },

            topicKey: {
                type: String,
                required: true,
            },

            topicLabel: {
                type: String,
                required: true,
            },

            variantKey: {
                type: String,
                default: "",
            },

            variantLabel: {
                type: String,
                default: "",
            },

            sourceScope: {
                type: String,
                default: "",
            },

            prompt: {
                type: String,
                required: true,
            },

            answer: {
                type: Schema.Types.Mixed,
                required: true,
                select: false,
            },

            solution: {
                type: String,
                default: "",
            },

            status: {
                type: String,
                enum: [
                    "active",
                    "correct",
                    "wrong",
                    "expired",
                ],
                default: "active",
            },

            startedAt: {
                type: Date,
                default: Date.now,
            },

            deadlineAt: {
                type: Date,
                required: true,
            },

            submittedAnswer: {
                type: Schema.Types.Mixed,
                default: null,
            },

            responseTimeMs: {
                type: Number,
                min: 0,
                default: null,
            },

            submittedAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

quickPracticeAttemptSchema.index({
    userId: 1,
    createdAt: -1,
});

/* --------------------------------------------------
 * 10. CoachMessageSuggestion
 * 학생이 제안하고 운영자가 승인하는 코치 문구
 * -------------------------------------------------- */

const coachMessageSuggestionSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },

            authorName: {
                type: String,
                required: true,
                maxlength: 30,
            },

            mode: {
                type: String,
                enum: [
                    "mild",
                    "spicy",
                    "silent",
                ],
                required: true,
            },

            situation: {
                type: String,
                enum: [
                    "correct",
                    "incorrect",
                    "unanswered",
                ],
                required: true,
            },

            message: {
                type: String,
                required: true,
                minlength: 4,
                maxlength: 120,
            },

            status: {
                type: String,
                enum: [
                    "pending",
                    "approved",
                    "rejected",
                ],
                default: "pending",
            },

            moderatedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },

            moderatedAt: {
                type: Date,
                default: null,
            },

            rejectionReason: {
                type: String,
                maxlength: 200,
                default: "",
            },

            useCount: {
                type: Number,
                min: 0,
                default: 0,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

coachMessageSuggestionSchema.index({
    status: 1,
    mode: 1,
    situation: 1,
    createdAt: -1,
});

/* --------------------------------------------------
 * 11. SupportInquiry
 * 로그인 사용자의 문의와 관리자 답변 상태
 * -------------------------------------------------- */

const supportInquirySchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },

            authorNickname: {
                type: String,
                required: true,
                maxlength: 30,
            },

            authorRealName: {
                type: String,
                maxlength: 40,
                default: "",
            },

            /*
             * 관리자가 나중에 회원의 현재 정보와 독립적으로
             * 당시 가입 이메일을 확인하고 답변할 수 있도록
             * 문의 접수 시점의 주소를 함께 보관합니다.
             */
            contactEmail: {
                type: String,
                required: true,
                trim: true,
                lowercase: true,
            },

            schoolName: {
                type: String,
                maxlength: 120,
                default: "",
            },

            subject: {
                type: String,
                required: true,
                minlength: 2,
                maxlength: 120,
            },

            content: {
                type: String,
                required: true,
                minlength: 10,
                maxlength: 5000,
            },

            status: {
                type: String,
                enum: [
                    "pending",
                    "in_review",
                    "replied",
                    "closed",
                ],
                default: "pending",
            },

            emailNotification: {
                status: {
                    type: String,
                    enum: [
                        "pending",
                        "sent",
                        "preview",
                        "failed",
                    ],
                    default: "pending",
                },
                attemptedAt: {
                    type: Date,
                    default: null,
                },
                providerMessageId: {
                    type: String,
                    maxlength: 200,
                    default: "",
                },
                errorMessage: {
                    type: String,
                    maxlength: 300,
                    default: "",
                },
            },

            adminReply: {
                message: {
                    type: String,
                    maxlength: 5000,
                    default: "",
                },
                sentTo: {
                    type: String,
                    maxlength: 320,
                    default: "",
                },
                repliedAt: {
                    type: Date,
                    default: null,
                },
                repliedBy: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    default: null,
                },
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

supportInquirySchema.index({
    userId: 1,
    createdAt: -1,
});

supportInquirySchema.index({
    status: 1,
    createdAt: -1,
});

/* --------------------------------------------------
 * 12. ArchiveItem
 * 로그인 사용자에게 제공하는 운영자 업로드 자료
 * -------------------------------------------------- */

const archiveItemSchema =
    new Schema(
        {
            folderId: {
                type: Schema.Types.ObjectId,
                ref: "ArchiveFolder",
                default: null,
                index: true,
            },

            title: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 120,
            },

            description: {
                type: String,
                trim: true,
                maxlength: 1000,
                default: "",
            },

            category: {
                type: String,
                enum: [
                    "문제지",
                    "해설",
                    "개념 자료",
                    "기타",
                ],
                default: "기타",
            },

            originalName: {
                type: String,
                required: true,
                maxlength: 255,
            },

            storedName: {
                type: String,
                required: true,
                unique: true,
                maxlength: 255,
            },

            mimeType: {
                type: String,
                required: true,
                maxlength: 160,
            },

            sizeBytes: {
                type: Number,
                min: 1,
                required: true,
            },

            uploadedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },

            downloadCount: {
                type: Number,
                min: 0,
                default: 0,
            },

            isPublished: {
                type: Boolean,
                default: true,
            },
            storageProvider: {
                type: String,
                enum: ["LOCAL", "CLOUDINARY"],
                default: "LOCAL",
            },
            storagePurpose: {
                type: String,
                enum: [
                    "GENERIC",
                    "ADMIN_ARCHIVE",
                    "ADMIN_WEEKLY_MOCK",
                    "USER_PRIVATE_MOCK_INTEGRITY",
                ],
                default: "GENERIC",
            },
            cloudPublicId: {
                type: String,
                maxlength: 500,
                default: "",
            },
            cloudResourceType: {
                type: String,
                enum: ["image", "video", "raw", ""],
                default: "",
            },
            cloudDeliveryType: {
                type: String,
                enum: ["authenticated", "private", "upload", ""],
                default: "",
            },
            cloudVersion: {
                type: Number,
                default: null,
            },
            cloudFormat: {
                type: String,
                maxlength: 40,
                default: "",
            },
            backupProvider: {
                type: String,
                enum: ["NONE", "R2"],
                default: "NONE",
            },
            backupObjectKey: {
                type: String,
                maxlength: 700,
                default: "",
            },
            backupSha256: {
                type: String,
                match: /^$|^[a-f0-9]{64}$/,
                default: "",
            },
            backupStatus: {
                type: String,
                enum: ["NOT_CONFIGURED", "PENDING", "BACKED_UP", "FAILED"],
                default: "PENDING",
            },
            backedUpAt: {
                type: Date,
                default: null,
            },
            lastRestoredAt: {
                type: Date,
                default: null,
            },
            backupError: {
                type: String,
                maxlength: 500,
                default: "",
            },
            deletedAt: {
                type: Date,
                default: null,
                index: true,
            },
            purgeAfter: {
                type: Date,
                default: null,
                index: true,
            },
            deletedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            publishedBeforeDelete: {
                type: Boolean,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

archiveItemSchema.index({
    isPublished: 1,
    createdAt: -1,
});
archiveItemSchema.index({
    deletedAt: 1,
    purgeAfter: 1,
});

/* --------------------------------------------------
 * 13. Admin operations
 * 공지, 개인 알림, 아카이브 폴더 및 관리자 작업 이력
 * -------------------------------------------------- */

const announcementSchema =
    new Schema(
        {
            title: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 120,
            },
            content: {
                type: String,
                required: true,
                trim: true,
                minlength: 5,
                maxlength: 5000,
            },
            boardCategory: {
                type: String,
                enum: [
                    "notice",
                    "rules",
                    "policies",
                    "manuals",
                    "inquiry-rules",
                ],
                default: "notice",
                index: true,
            },
            href: {
                type: String,
                trim: true,
                maxlength: 500,
                default: "/main",
            },
            isPublished: {
                type: Boolean,
                default: false,
                index: true,
            },
            publishedAt: {
                type: Date,
                default: null,
            },
            deliveredAt: {
                type: Date,
                default: null,
            },
            dashboardEndsAt: {
                type: Date,
                default: null,
                index: true,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

announcementSchema.index({
    isPublished: 1,
    publishedAt: -1,
});
announcementSchema.index({
    boardCategory: 1,
    isPublished: 1,
    publishedAt: -1,
});

const userNotificationSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            title: {
                type: String,
                required: true,
                trim: true,
                maxlength: 100,
            },
            message: {
                type: String,
                required: true,
                trim: true,
                maxlength: 1000,
            },
            href: {
                type: String,
                default: "/main",
                maxlength: 500,
            },
            /*
             * 자동 알림 작업이 재실행되어도 같은 우편을 두 번 만들지 않기
             * 위한 서버 멱등 키입니다. 운영자가 직접 보내는 알림에는 값을
             * 넣지 않아 기존 동작을 그대로 유지합니다.
             */
            dedupeKey: {
                type: String,
                trim: true,
                maxlength: 240,
                default: undefined,
            },
            sourceType: {
                type: String,
                trim: true,
                maxlength: 80,
                default: "",
            },
            sourceId: {
                type: Schema.Types.ObjectId,
                default: null,
            },
            kind: {
                type: String,
                enum: [
                    "admin",
                    "system",
                    "warning",
                    "account",
                    "nickname",
                    "announcement",
                    "integrity",
                ],
                default: "admin",
            },
            // GOAT Arena 우편함의 시각적 우선순위. 일반 Matths 알림에는
            // 빈 값으로 두어 기존 표시를 변경하지 않는다.
            tone: {
                type: String,
                trim: true,
                maxlength: 32,
                default: "",
            },
            announcementId: {
                type: Schema.Types.ObjectId,
                ref: "Announcement",
                default: null,
            },
            readAt: {
                type: Date,
                default: null,
            },
            dashboardDismissedAt: {
                type: Date,
                default: null,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

userNotificationSchema.index({
    userId: 1,
    readAt: 1,
    createdAt: -1,
});
userNotificationSchema.index(
    {
        userId: 1,
        announcementId: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            announcementId: {
                $type: "objectId",
            },
        },
    }
);
userNotificationSchema.index(
    { dedupeKey: 1 },
    {
        unique: true,
        partialFilterExpression: {
            dedupeKey: {
                $type: "string",
            },
        },
    }
);

/* --------------------------------------------------
 * 14. CommunityPost
 * 통합·고등학교·대학교·N수생·직장인 커뮤니티 게시글
 * -------------------------------------------------- */

const communityAttachmentSchema =
    new Schema(
        {
            originalName: {
                type: String,
                required: true,
                maxlength: 255,
            },
            storedName: {
                type: String,
                required: true,
                maxlength: 255,
            },
            mimeType: {
                type: String,
                required: true,
                maxlength: 160,
            },
            sizeBytes: {
                type: Number,
                min: 1,
                required: true,
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
            storageProvider: {
                type: String,
                enum: ["LOCAL", "CLOUDINARY"],
                default: "LOCAL",
            },
            storagePurpose: {
                type: String,
                enum: ["GENERIC", "USER_COMMUNITY"],
                default: "GENERIC",
            },
            cloudPublicId: {
                type: String,
                maxlength: 500,
                default: "",
            },
            cloudResourceType: {
                type: String,
                enum: ["image", "video", "raw", ""],
                default: "",
            },
            cloudDeliveryType: {
                type: String,
                enum: ["authenticated", "private", "upload", ""],
                default: "",
            },
            cloudVersion: {
                type: Number,
                default: null,
            },
            cloudFormat: {
                type: String,
                maxlength: 40,
                default: "",
            },
        },
        {
            versionKey: false,
        }
    );

const communityPostSchema =
    new Schema(
        {
            authorId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            boardType: {
                type: String,
                enum: [
                    "math",
                    "high-school",
                    "school",
                    "retaker",
                    "university",
                    "worker",
                ],
                required: true,
                index: true,
            },
            schoolCode: {
                type: String,
                trim: true,
                maxlength: 100,
                default: "",
                index: true,
            },
            schoolName: {
                type: String,
                trim: true,
                maxlength: 120,
                default: "",
            },
            universityCode: {
                type: String,
                trim: true,
                maxlength: 100,
                default: "",
                index: true,
            },
            universityName: {
                type: String,
                trim: true,
                maxlength: 160,
                default: "",
            },
            authorRegion: {
                type: String,
                trim: true,
                maxlength: 80,
                default: "",
            },
            authorSchoolGrade: {
                type: Number,
                enum: [10, 11, 12, 13, 14, 15],
                default: null,
            },
            authorName: {
                type: String,
                required: true,
                trim: true,
                maxlength: 30,
            },
            isAnonymous: {
                type: Boolean,
                default: false,
            },
            anonymousNumber: {
                type: String,
                trim: true,
                maxlength: 6,
                default: "",
            },
            title: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 120,
            },
            content: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 10000,
            },
            attachments: {
                type: [
                    communityAttachmentSchema,
                ],
                default: [],
                validate: {
                    validator: (value) =>
                        Array.isArray(value) &&
                        value.length <= 5,
                    message:
                        "게시글 첨부파일은 최대 5개까지 저장할 수 있습니다.",
                },
            },
            status: {
                type: String,
                enum: [
                    "published",
                    "hidden",
                    "deleted",
                ],
                default: "published",
                index: true,
            },
            isPinned: {
                type: Boolean,
                default: false,
                index: true,
            },
            pinnedAt: {
                type: Date,
                default: null,
            },
            pinnedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            viewCount: {
                type: Number,
                min: 0,
                default: 0,
            },
            upvoteCount: {
                type: Number,
                min: 0,
                default: 0,
            },
            downvoteCount: {
                type: Number,
                min: 0,
                default: 0,
            },
            voteScore: {
                type: Number,
                default: 0,
            },
            warningIssued: {
                type: Boolean,
                default: false,
            },
            moderationReason: {
                type: String,
                trim: true,
                maxlength: 500,
                default: "",
            },
            moderatedAt: {
                type: Date,
                default: null,
            },
            moderatedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            editedAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

communityPostSchema.index({
    boardType: 1,
    schoolCode: 1,
    status: 1,
    isPinned: -1,
    pinnedAt: -1,
    createdAt: -1,
});
communityPostSchema.index({
    boardType: 1,
    universityCode: 1,
    status: 1,
    isPinned: -1,
    pinnedAt: -1,
    createdAt: -1,
});
communityPostSchema.index({
    title: "text",
    content: "text",
});

const communityPostingQuotaSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            dayKey: {
                type: String,
                required: true,
                match: /^\d{4}-\d{2}-\d{2}$/,
            },
            count: {
                type: Number,
                min: 0,
                max: 5,
                required: true,
                default: 0,
            },
            expiresAt: {
                type: Date,
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

communityPostingQuotaSchema.index(
    {
        userId: 1,
        dayKey: 1,
    },
    {
        unique: true,
    }
);
communityPostingQuotaSchema.index(
    {
        expiresAt: 1,
    },
    {
        expireAfterSeconds: 0,
    }
);

const communityBoardNoticeSchema =
    new Schema(
        {
            boardType: {
                type: String,
                enum: [
                    "high-school",
                    "school",
                    "retaker",
                    "university",
                    "worker",
                ],
                required: true,
                index: true,
            },
            schoolCode: {
                type: String,
                trim: true,
                maxlength: 100,
                default: "",
                index: true,
            },
            schoolName: {
                type: String,
                trim: true,
                maxlength: 120,
                default: "",
            },
            universityCode: {
                type: String,
                trim: true,
                maxlength: 100,
                default: "",
                index: true,
            },
            universityName: {
                type: String,
                trim: true,
                maxlength: 160,
                default: "",
            },
            title: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 120,
            },
            content: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 10000,
            },
            status: {
                type: String,
                enum: [
                    "published",
                    "hidden",
                    "deleted",
                ],
                default: "published",
                index: true,
            },
            isPinned: {
                type: Boolean,
                default: true,
                index: true,
            },
            pinnedAt: {
                type: Date,
                default: Date.now,
            },
            systemKey: {
                type: String,
                trim: true,
                maxlength: 100,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            updatedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

communityBoardNoticeSchema.index({
    boardType: 1,
    schoolCode: 1,
    status: 1,
    isPinned: -1,
    pinnedAt: -1,
    createdAt: -1,
});
communityBoardNoticeSchema.index({
    boardType: 1,
    universityCode: 1,
    status: 1,
    isPinned: -1,
    pinnedAt: -1,
    createdAt: -1,
});
communityBoardNoticeSchema.index(
    {
        systemKey: 1,
    },
    {
        unique: true,
        partialFilterExpression: {
            systemKey: {
                $type: "string",
            },
        },
    }
);

/* --------------------------------------------------
 * 15. CommunityComment
 * 공개 게시글에 로그인 회원이 남기는 댓글
 * -------------------------------------------------- */

const communityCommentSchema =
    new Schema(
        {
            postId: {
                type: Schema.Types.ObjectId,
                ref: "CommunityPost",
                required: true,
                index: true,
            },
            authorId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            authorName: {
                type: String,
                required: true,
                trim: true,
                maxlength: 30,
            },
            isAnonymous: {
                type: Boolean,
                default: false,
            },
            anonymousNumber: {
                type: String,
                trim: true,
                maxlength: 6,
                default: "",
            },
            content: {
                type: String,
                required: true,
                trim: true,
                minlength: 1,
                maxlength: 2000,
            },
            status: {
                type: String,
                enum: [
                    "published",
                    "hidden",
                    "deleted",
                ],
                default: "published",
                index: true,
            },
            warningIssued: {
                type: Boolean,
                default: false,
            },
            moderationReason: {
                type: String,
                trim: true,
                maxlength: 500,
                default: "",
            },
            moderatedAt: {
                type: Date,
                default: null,
            },
            moderatedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            editedAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

communityCommentSchema.index({
    postId: 1,
    status: 1,
    createdAt: 1,
});

/* --------------------------------------------------
 * 16. CommunityVote
 * 게시글 추천·비추천 기록. 한 회원은 한 게시글에 한 표만 갖습니다.
 * -------------------------------------------------- */

const communityVoteSchema =
    new Schema(
        {
            postId: {
                type: Schema.Types.ObjectId,
                ref: "CommunityPost",
                required: true,
                index: true,
            },
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            value: {
                type: Number,
                enum: [-1, 1],
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

communityVoteSchema.index(
    {
        postId: 1,
        userId: 1,
    },
    {
        unique: true,
    }
);

const communityReportSchema =
    new Schema(
        {
            postId: {
                type: Schema.Types.ObjectId,
                ref: "CommunityPost",
                required: true,
                index: true,
            },
            reporterUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            reportedUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            reason: {
                type: String,
                required: true,
                trim: true,
                minlength: 5,
                maxlength: 1000,
            },
            status: {
                type: String,
                enum: ["pending", "reviewing", "resolved", "rejected"],
                default: "pending",
                index: true,
            },
            resolution: {
                type: String,
                trim: true,
                maxlength: 1000,
                default: "",
            },
            handledBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            handledAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

communityReportSchema.index(
    { postId: 1, reporterUserId: 1 },
    { unique: true }
);

/* --------------------------------------------------
 * 17. PrivateMockExam
 * 매주 일요일 3회 공개되는 Matths 주간 공식 모의고사 회차
 * -------------------------------------------------- */

const privateMockExamSchema =
    new Schema(
        {
            weekKey: {
                type: String,
                required: true,
                trim: true,
                index: true,
            },
            attemptNumber: {
                type: Number,
                enum: [0, 1, 2, 3],
                required: true,
                index: true,
            },
            formCode: {
                type: String,
                // TEST는 기존 DB 회차 조회 호환용이며 신규 등록은 CUSTOM만 사용합니다.
                enum: ["A", "B", "C", "CUSTOM", "TEST"],
                required: true,
            },
            isTest: {
                type: Boolean,
                default: false,
                index: true,
            },
            title: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 120,
            },
            releaseAt: {
                type: Date,
                required: true,
                unique: true,
                index: true,
            },
            closeAt: {
                type: Date,
                required: true,
                index: true,
            },
            aggregationStartsAt: {
                type: Date,
                required: true,
                index: true,
            },
            rankingPublishesAt: {
                type: Date,
                required: true,
                index: true,
            },
            archiveAt: {
                type: Date,
                required: true,
                index: true,
            },
            reviewPublishesAt: {
                type: Date,
                required: true,
                index: true,
            },
            durationMinutes: {
                type: Number,
                min: 10,
                max: 180,
                default: 100,
            },
            questionCount: {
                type: Number,
                min: 0,
                max: 60,
                default: 0,
            },
            answerKey: {
                type: [String],
                default: [],
                select: false,
            },
            points: {
                type: [Number],
                default: [],
                select: false,
            },
            questionModes: {
                type: [
                    {
                        type: String,
                        enum: [
                            "multiple-choice",
                            "short-answer",
                        ],
                    },
                ],
                default: [],
            },
            explanations: {
                type: [Schema.Types.Mixed],
                default: [],
                select: false,
            },
            archiveItemId: {
                type: Schema.Types.ObjectId,
                ref: "ArchiveItem",
                required: true,
                unique: true,
            },
            answerSheetArchiveItemId: {
                type: Schema.Types.ObjectId,
                ref: "ArchiveItem",
                default: null,
                index: true,
            },
            status: {
                type: String,
                enum: [
                    "pending-review",
                    "scheduled",
                    "open",
                    "locked",
                    "aggregating",
                    "ranked",
                    "archived",
                    "finalizing",
                    "finalized",
                    "cancelled",
                ],
                default: "scheduled",
                index: true,
            },
            announcementId: {
                type: Schema.Types.ObjectId,
                ref: "Announcement",
                default: null,
            },
            notificationSentAt: {
                type: Date,
                default: null,
            },
            rankingFinalizedAt: {
                type: Date,
                default: null,
            },
            aggregationStartedAt: {
                type: Date,
                default: null,
            },
            aggregationCompletedAt: {
                type: Date,
                default: null,
            },
            rankingSummary: {
                participantCount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                averageScore: {
                    type: Number,
                    min: 0,
                    max: 100,
                    default: 0,
                },
                medianScore: {
                    type: Number,
                    min: 0,
                    max: 100,
                    default: 0,
                },
                scoreStandardDeviation: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                averageElapsedMs: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                highestScore: {
                    type: Number,
                    min: 0,
                    max: 100,
                    default: 0,
                },
                lowestScore: {
                    type: Number,
                    min: 0,
                    max: 100,
                    default: 0,
                },
            },
            archivedAt: {
                type: Date,
                default: null,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockExamSchema.index({
    status: 1,
    releaseAt: 1,
    closeAt: 1,
});
privateMockExamSchema.index({
    weekKey: 1,
    attemptNumber: 1,
});
privateMockExamSchema.index({
  status: 1,
  aggregationStartsAt: 1,
  rankingPublishesAt: 1,
  archiveAt: 1,
});
privateMockExamSchema.index({
  "answerReview.status": 1,
});
privateMockExamSchema.index({
  parentFolderId: 1,
});

const privateMockUploadReminderSchema =
    new Schema(
        {
            releaseAt: {
                type: Date,
                required: true,
                unique: true,
                index: true,
            },
            status: {
                type: String,
                enum: [
                    "pending",
                    "sending",
                    "sent",
                    "failed",
                ],
                default: "pending",
                index: true,
            },
            attempts: {
                type: Number,
                min: 0,
                default: 0,
            },
            lastAttemptAt: {
                type: Date,
                default: null,
            },
            nextRetryAt: {
                type: Date,
                default: null,
            },
            sentAt: {
                type: Date,
                default: null,
            },
            deliveryMode: {
                type: String,
                enum: [
                    "",
                    "email",
                    "preview",
                ],
                default: "",
            },
            lastError: {
                type: String,
                default: "",
                maxlength: 500,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

const privateMockExamAttemptSchema =
    new Schema(
        {
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                required: true,
                index: true,
            },
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            weekKey: {
                type: String,
                required: true,
                trim: true,
                index: true,
            },
            attemptNumber: {
                type: Number,
                enum: [0, 1, 2, 3],
                required: true,
            },
            formCode: {
                type: String,
                // TEST는 기존 DB 응시 기록 조회 호환용이며 신규 회차는 CUSTOM만 사용합니다.
                enum: ["A", "B", "C", "CUSTOM", "TEST"],
                required: true,
            },
            answers: {
                type: [String],
                default: [],
            },
            answeredCount: {
                type: Number,
                min: 0,
                default: 0,
            },
            score: {
                type: Number,
                min: 0,
                default: 0,
            },
            correctCount: {
                type: Number,
                min: 0,
                default: 0,
            },
            correctByQuestion: {
                type: [Boolean],
                default: [],
            },
            scoreBreakdown: {
                threePointCorrect: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                threePointTotal: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                fourPointCorrect: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                fourPointTotal: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                semiKillerCorrect: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                killerCorrect: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
            },
            mmrResult: {
                previousMmr: {
                    type: Number,
                    min: 0,
                    default: null,
                },
                newMmr: {
                    type: Number,
                    min: 0,
                    default: null,
                },
                deltaMmr: {
                    type: Number,
                    default: null,
                },
                totalPercentile: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                advancedPercentile: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                consistencyScore: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                actualPerformance: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                expectedPerformance: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                kFactor: {
                    type: Number,
                    min: 0,
                    default: null,
                },
                growthBonus: {
                    type: Number,
                    default: 0,
                },
                tier: {
                    type: String,
                    default: "",
                },
                rankPoint: {
                    type: Number,
                    min: 0,
                    max: 99,
                    default: null,
                },
            },
            standardMetrics: {
                totalPercentile: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                advancedPercentile: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                consistencyScore: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                actualPerformance: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                cohortSize: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                calculatedAt: {
                    type: Date,
                    default: null,
                },
            },
            isRepresentative: {
                type: Boolean,
                default: false,
            },
            usedForWeeklyRanking: {
                type: Boolean,
                default: false,
            },
            usedForMmrStability: {
                type: Boolean,
                default: false,
            },
            usedForCalibration: {
                type: Boolean,
                default: true,
            },
            usedForIntegrityAnalysis: {
                type: Boolean,
                default: true,
            },
            integrityStatus: {
                type: String,
                enum: [
                    "NOT_REVIEWED",
                    "PENDING_INTEGRITY_REVIEW",
                    "CLEAR",
                    "INVALIDATED",
                ],
                default: "NOT_REVIEWED",
                index: true,
            },
            integrityCaseId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockIntegrityCase",
                default: null,
                index: true,
            },
            integritySummary: {
                riskScore: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                signalCodes: {
                    type: [String],
                    default: [],
                },
                analyzedAt: {
                    type: Date,
                    default: null,
                },
            },
            elapsedMs: {
                type: Number,
                min: 0,
                default: 0,
            },
            rank: {
                type: Number,
                min: 1,
                default: null,
            },
            status: {
                type: String,
                enum: [
                    "in_progress",
                    "submitted",
                    "expired",
                ],
                default: "in_progress",
                index: true,
            },
            startedAt: {
                type: Date,
                required: true,
                default: Date.now,
            },
            lastSavedAt: {
                type: Date,
                default: null,
            },
            submittedAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockExamAttemptSchema.index(
    {
        examId: 1,
        userId: 1,
    },
    {
        unique: true,
    }
);
privateMockExamAttemptSchema.index({
    examId: 1,
    status: 1,
    score: -1,
    elapsedMs: 1,
});
privateMockExamAttemptSchema.index({
    weekKey: 1,
    userId: 1,
    attemptNumber: 1,
});

const privateMockExamEventSchema =
    new Schema(
        {
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                required: true,
                index: true,
            },
            attemptId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExamAttempt",
                required: true,
                index: true,
            },
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            eventType: {
                type: String,
                required: true,
                maxlength: 60,
                index: true,
            },
            questionNumber: {
                type: Number,
                min: 1,
                max: 60,
                default: null,
            },
            clientAt: {
                type: Date,
                default: null,
            },
            serverAt: {
                type: Date,
                required: true,
                default: Date.now,
            },
            metadata: {
                type: Schema.Types.Mixed,
                default: {},
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockExamEventSchema.index({
    attemptId: 1,
    serverAt: 1,
});

const privateMockResourceSchema =
    new Schema(
        {
            resourceType: {
                type: String,
                enum: ["formula-pdf"],
                required: true,
                index: true,
            },
            archiveItemId: {
                type: Schema.Types.ObjectId,
                ref: "ArchiveItem",
                required: true,
                unique: true,
            },
            versionLabel: {
                type: String,
                trim: true,
                maxlength: 80,
                default: "",
            },
            isActive: {
                type: Boolean,
                default: true,
                index: true,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockResourceSchema.index({
    resourceType: 1,
    isActive: 1,
    createdAt: -1,
});

const privateMockIntegrityCaseSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                required: true,
                index: true,
            },
            attemptId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExamAttempt",
                required: true,
                unique: true,
            },
            weekKey: {
                type: String,
                required: true,
                trim: true,
                index: true,
            },
            status: {
                type: String,
                enum: [
                    "EVIDENCE_REQUIRED",
                    "SUBMITTED",
                    "UNDER_REVIEW",
                    "CLEARED",
                    "INSUFFICIENT_EVIDENCE",
                    "CONFIRMED_CHEATING",
                    "OVERDUE_PENALIZED",
                ],
                default: "EVIDENCE_REQUIRED",
                index: true,
            },
            riskScore: {
                type: Number,
                min: 0,
                default: 0,
            },
            suspicionSignals: {
                type: [Schema.Types.Mixed],
                default: [],
            },
            requestedQuestionNumbers: {
                type: [Number],
                default: [],
            },
            evidenceRequest: {
                requestedAt: {
                    type: Date,
                    default: Date.now,
                },
                requestedBy: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    default: null,
                },
                deadlineAt: {
                    type: Date,
                    required: true,
                },
                instructions: {
                    type: String,
                    maxlength: 1000,
                    default: "",
                },
            },
            evidenceSubmissions: {
                type: [
                    {
                        receiptId: {
                            type: String,
                            required: true,
                        },
                        files: {
                            type: [
                                {
                                    archiveItemId: {
                                        type: Schema.Types.ObjectId,
                                        ref: "ArchiveItem",
                                        required: true,
                                    },
                                    originalName: String,
                                    mimeType: String,
                                    sizeBytes: Number,
                                    uploadedAt: Date,
                                },
                            ],
                            default: [],
                        },
                        note: {
                            type: String,
                            maxlength: 2000,
                            default: "",
                        },
                        submittedAt: {
                            type: Date,
                            required: true,
                        },
                    },
                ],
                default: [],
            },
            notificationId: {
                type: Schema.Types.ObjectId,
                ref: "UserNotification",
                default: null,
            },
            decision: {
                result: {
                    type: String,
                    default: "",
                },
                reason: {
                    type: String,
                    maxlength: 2000,
                    default: "",
                },
                decidedAt: {
                    type: Date,
                    default: null,
                },
                decidedBy: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    default: null,
                },
            },
            penaltyAppliedAt: {
                type: Date,
                default: null,
            },
            warningAppliedAt: {
                type: Date,
                default: null,
            },
            penaltyRevokedAt: {
                type: Date,
                default: null,
            },
            warningRevokedAt: {
                type: Date,
                default: null,
            },
            decisionNoticeSentAt: {
                type: Date,
                default: null,
            },
            decisionNoticeResult: {
                type: String,
                enum: ["", "no_penalty", "penalty"],
                default: "",
            },
            reviewStatus: {
                type: String,
                enum: ["unreviewed", "reviewing", "completed"],
                default: "unreviewed",
                index: true,
            },
            penaltyDecision: {
                type: String,
                enum: ["pending", "no_penalty", "penalty"],
                default: "pending",
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockIntegrityCaseSchema.index({
    userId: 1,
    status: 1,
    createdAt: -1,
});

const privateMockAnswerCorrectionSchema =
    new Schema(
        {
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                required: true,
                index: true,
            },
            corrections: {
                type: [
                    {
                        questionNumber: {
                            type: Number,
                            min: 1,
                            max: 60,
                            required: true,
                        },
                        questionContent: {
                            type: String,
                            required: true,
                            maxlength: 3000,
                        },
                        oldAnswer: {
                            type: String,
                            required: true,
                            maxlength: 80,
                        },
                        newAnswer: {
                            type: String,
                            required: true,
                            maxlength: 80,
                        },
                    },
                ],
                required: true,
            },
            reason: {
                type: String,
                required: true,
                maxlength: 2000,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            sourceObjectionId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockObjection",
                default: null,
                index: true,
            },
            affectedAttemptCount: {
                type: Number,
                min: 0,
                default: 0,
            },
            notificationStats: {
                recipientCount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                emailDeliveredCount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                emailFailedCount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockAnswerCorrectionSchema.index({
    examId: 1,
    createdAt: -1,
});

const privateMockObjectionSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                required: true,
                index: true,
            },
            archiveItemId: {
                type: Schema.Types.ObjectId,
                ref: "ArchiveItem",
                required: true,
            },
            examTitle: {
                type: String,
                required: true,
                maxlength: 160,
            },
            questionNumber: {
                type: Number,
                min: 1,
                max: 60,
                required: true,
            },
            issueDetail: {
                type: String,
                required: true,
                minlength: 10,
                maxlength: 5000,
            },
            status: {
                type: String,
                enum: [
                    "pending",
                    "reviewing",
                    "accepted",
                    "rejected",
                ],
                default: "pending",
                index: true,
            },
            reviewReason: {
                type: String,
                maxlength: 2000,
                default: "",
            },
            reviewedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            reviewedAt: {
                type: Date,
                default: null,
            },
            correctionId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockAnswerCorrection",
                default: null,
            },
            announcementId: {
                type: Schema.Types.ObjectId,
                ref: "Announcement",
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockObjectionSchema.index({
    status: 1,
    createdAt: 1,
});

const privateMockWeeklyAttemptSchema =
    new Schema(
        {
            attemptId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExamAttempt",
                required: true,
            },
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                required: true,
            },
            attemptNumber: {
                type: Number,
                enum: [1, 2, 3],
                required: true,
            },
            formCode: {
                type: String,
                enum: ["A", "B", "C"],
                required: true,
            },
            rawScore: {
                type: Number,
                min: 0,
                max: 100,
                required: true,
            },
            totalPercentile: {
                type: Number,
                min: 0,
                max: 1,
                required: true,
            },
            advancedPercentile: {
                type: Number,
                min: 0,
                max: 1,
                required: true,
            },
            consistencyScore: {
                type: Number,
                min: 0,
                max: 1,
                required: true,
            },
            actualPerformance: {
                type: Number,
                min: 0,
                max: 1,
                required: true,
            },
            submittedAt: {
                type: Date,
                required: true,
            },
        },
        {
            _id: false,
        }
    );

const privateMockWeeklyResultSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            weekKey: {
                type: String,
                required: true,
                trim: true,
                index: true,
            },
            attempts: {
                type: [privateMockWeeklyAttemptSchema],
                default: [],
            },
            selectedAttemptId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExamAttempt",
                default: null,
            },
            selectionState: {
                type: String,
                enum: [
                    "pending",
                    "deferred",
                    "selected",
                    "auto",
                    "locked",
                ],
                default: "pending",
            },
            selectionReason: {
                type: String,
                enum: [
                    "",
                    "user-selected",
                    "only-submission",
                    "highest-standardized",
                    "no-submission",
                ],
                default: "",
            },
            representativeAttemptId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExamAttempt",
                default: null,
            },
            representativePerformance: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            representativeRawScore: {
                type: Number,
                min: 0,
                max: 100,
                default: null,
            },
            representativeElapsedMs: {
                type: Number,
                min: 0,
                default: null,
            },
            mmrPerformance: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            attemptCount: {
                type: Number,
                min: 0,
                max: 3,
                default: 0,
            },
            rank: {
                type: Number,
                min: 1,
                default: null,
            },
            status: {
                type: String,
                enum: [
                    "open",
                    "locked",
                    "published",
                ],
                default: "open",
                index: true,
            },
            lockedAt: {
                type: Date,
                default: null,
            },
            publishedAt: {
                type: Date,
                default: null,
            },
            mmrResult: {
                previousMmr: {
                    type: Number,
                    min: 0,
                    default: null,
                },
                newMmr: {
                    type: Number,
                    min: 0,
                    default: null,
                },
                deltaMmr: {
                    type: Number,
                    default: null,
                },
                expectedPerformance: {
                    type: Number,
                    min: 0,
                    max: 1,
                    default: null,
                },
                kFactor: {
                    type: Number,
                    min: 0,
                    default: null,
                },
                growthBonus: {
                    type: Number,
                    default: 0,
                },
                tier: {
                    type: String,
                    default: "",
                },
                rankPoint: {
                    type: Number,
                    min: 0,
                    max: 99,
                    default: null,
                },
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

privateMockWeeklyResultSchema.index(
    {
        userId: 1,
        weekKey: 1,
    },
    {
        unique: true,
    }
);
privateMockWeeklyResultSchema.index({
    weekKey: 1,
    status: 1,
    representativePerformance: -1,
});

const rankingMmrHistorySchema =
    new Schema(
        {
            examId: {
                type: Schema.Types.ObjectId,
                ref: "PrivateMockExam",
                default: null,
            },
            placementAttemptId: {
                type: Schema.Types.ObjectId,
                ref: "AssessmentAttempt",
                default: null,
            },
            eventType: {
                type: String,
                enum: [
                    "placement",
                    "placement-calibration",
                    "weekly-exam",
                    "absence",
                    "season-reset",
                ],
                required: true,
            },
            previousMmr: {
                type: Number,
                min: 0,
                required: true,
            },
            newMmr: {
                type: Number,
                min: 0,
                required: true,
            },
            deltaMmr: {
                type: Number,
                required: true,
            },
            rawScore: {
                type: Number,
                min: 0,
                default: null,
            },
            totalPercentile: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            advancedPercentile: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            consistencyScore: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            actualPerformance: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            expectedPerformance: {
                type: Number,
                min: 0,
                max: 1,
                default: null,
            },
            kFactor: {
                type: Number,
                min: 0,
                default: null,
            },
            growthBonus: {
                type: Number,
                default: 0,
            },
            createdAt: {
                type: Date,
                default: Date.now,
            },
        },
        {
            _id: false,
        }
    );

const rankingProfileSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                unique: true,
                index: true,
            },
            placementAttemptId: {
                type: Schema.Types.ObjectId,
                ref: "AssessmentAttempt",
                default: null,
            },
            placementScore: {
                type: Number,
                min: 0,
                max: 100,
                default: 50,
            },
            placementExpectedPerformance: {
                type: Number,
                min: 0,
                max: 1,
                default: 0.5,
            },
            mmr: {
                type: Number,
                min: 0,
                default: 1000,
                index: true,
            },
            tier: {
                type: String,
                enum: [
                    "BRONZE",
                    "SILVER",
                    "GOLD",
                    "PLATINUM",
                    "EMERALD",
                    "DIAMOND",
                    "MASTER",
                    "GRANDMASTER",
                    "CHALLENGER",
                ],
                default: "GOLD",
                index: true,
            },
            rankPoint: {
                type: Number,
                min: 0,
                max: 99,
                default: 0,
            },
            overallRank: {
                type: Number,
                min: 1,
                default: null,
            },
            percentile: {
                type: Number,
                min: 0,
                max: 1,
                default: 0.5,
            },
            status: {
                type: String,
                enum: [
                    "PROVISIONAL",
                    "CONFIRMED",
                ],
                default: "PROVISIONAL",
            },
            /*
             * 탈퇴 후 익명 데이터셋으로만 보존되는 프로필은
             * 실시간 랭킹과 결석 감점 계산에서 제외한다.
             */
            datasetOnly: {
                type: Boolean,
                default: false,
                index: true,
            },
            weeklyExamsUntilConfirmed: {
                type: Number,
                min: 0,
                default: 2,
            },
            seasonId: {
                type: String,
                default: "2026-season-1",
            },
            recentPerformances: {
                type: [Number],
                default: [],
            },
            lastAdvancedPerformance: {
                type: Number,
                min: 0,
                max: 1,
                default: 0,
            },
            lastRawScore: {
                type: Number,
                min: 0,
                default: 0,
            },
            reachedCurrentMmrAt: {
                type: Date,
                default: Date.now,
            },
            demotionProtection: {
                active: {
                    type: Boolean,
                    default: false,
                },
                consecutiveBelowThreshold: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                thresholdMmr: {
                    type: Number,
                    min: 0,
                    default: null,
                },
            },
            participation: {
                weeklyExamCount: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                consecutiveAbsences: {
                    type: Number,
                    min: 0,
                    default: 0,
                },
                lastExamAt: {
                    type: Date,
                    default: null,
                },
            },
            mmrHistory: {
                type: [rankingMmrHistorySchema],
                default: [],
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

rankingProfileSchema.index({
    mmr: -1,
    reachedCurrentMmrAt: 1,
});

/* --------------------------------------------------
 * 18. NicknameChangeRequest
 * 관리자가 사유와 함께 발급하는 닉네임 변경 요청
 * -------------------------------------------------- */

const nicknameChangeRequestSchema =
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            requestedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            reason: {
                type: String,
                required: true,
                trim: true,
                maxlength: 500,
            },
            tokenHash: {
                type: String,
                required: true,
                select: false,
            },
            status: {
                type: String,
                enum: [
                    "pending",
                    "completed",
                    "cancelled",
                    "expired",
                ],
                default: "pending",
                index: true,
            },
            expiresAt: {
                type: Date,
                required: true,
                index: true,
            },
            completedAt: {
                type: Date,
                default: null,
            },
            previousName: {
                type: String,
                required: true,
                maxlength: 30,
            },
            nextName: {
                type: String,
                maxlength: 30,
                default: "",
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

nicknameChangeRequestSchema.index({
    userId: 1,
    status: 1,
    createdAt: -1,
});

const archiveFolderSchema =
    new Schema(
        {
            parentFolderId: {
                type: Schema.Types.ObjectId,
                ref: "ArchiveFolder",
                default: null,
                index: true,
            },
            name: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 80,
                unique: true,
            },
            description: {
                type: String,
                trim: true,
                maxlength: 500,
                default: "",
            },
            slug: {
                type: String,
                required: true,
                unique: true,
                maxlength: 120,
            },
            isPublished: {
                type: Boolean,
                default: true,
            },
            accessLevel: {
                type: String,
                enum: ["AUTHENTICATED", "PAID_PACKAGE"],
                default: "AUTHENTICATED",
                index: true,
            },
            isPinned: {
                type: Boolean,
                default: false,
                index: true,
            },
            pinnedAt: {
                type: Date,
                default: null,
            },
            pinnedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

archiveFolderSchema.index({
    isPublished: 1,
    parentFolderId: 1,
    isPinned: -1,
    pinnedAt: -1,
    name: 1,
});

const adminActionLogSchema =
    new Schema(
        {
            adminUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            targetUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
                index: true,
            },
            action: {
                type: String,
                required: true,
                maxlength: 80,
            },
            detail: {
                type: String,
                maxlength: 1000,
                default: "",
            },
            metadata: {
                type: Schema.Types.Mixed,
                default: {},
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

adminActionLogSchema.index({
    createdAt: -1,
});

const adminTodoSchema =
    new Schema(
        {
            category: {
                type: String,
                enum: ["inquiry", "community-report", "integrity", "other"],
                required: true,
                index: true,
            },
            title: {
                type: String,
                required: true,
                trim: true,
                maxlength: 160,
            },
            description: {
                type: String,
                trim: true,
                maxlength: 1000,
                default: "",
            },
            href: {
                type: String,
                trim: true,
                maxlength: 500,
                default: "/admin/todos",
            },
            targetUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
                index: true,
            },
            actorUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            sourceType: {
                type: String,
                trim: true,
                maxlength: 80,
                required: true,
            },
            sourceId: {
                type: Schema.Types.ObjectId,
                required: true,
            },
            status: {
                type: String,
                enum: ["pending", "completed"],
                default: "pending",
                index: true,
            },
            completedAt: {
                type: Date,
                default: null,
            },
            completedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            metadata: {
                type: Schema.Types.Mixed,
                default: {},
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

adminTodoSchema.index(
    { sourceType: 1, sourceId: 1 },
    { unique: true }
);
adminTodoSchema.index({
    status: 1,
    category: 1,
    createdAt: 1,
});
adminTodoSchema.index({
    status: 1,
    category: 1,
    completedAt: -1,
});

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

const AssessmentAttempt =
  mongoose.models.AssessmentAttempt ||
  mongoose.model(
    "AssessmentAttempt",
    assessmentAttemptSchema
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

const PasswordResetCode =
    mongoose.models.PasswordResetCode ||
    mongoose.model(
        "PasswordResetCode",
        passwordResetCodeSchema
    );

const QuickPracticeAttempt =
    mongoose.models.QuickPracticeAttempt ||
    mongoose.model(
        "QuickPracticeAttempt",
        quickPracticeAttemptSchema
    );

const CoachMessageSuggestion =
    mongoose.models.CoachMessageSuggestion ||
    mongoose.model(
        "CoachMessageSuggestion",
        coachMessageSuggestionSchema
    );

const SupportInquiry =
    mongoose.models.SupportInquiry ||
    mongoose.model(
        "SupportInquiry",
        supportInquirySchema
    );

const ArchiveItem =
    mongoose.models.ArchiveItem ||
    mongoose.model(
        "ArchiveItem",
        archiveItemSchema
    );

const Announcement =
    mongoose.models.Announcement ||
    mongoose.model(
        "Announcement",
        announcementSchema
    );

const UserNotification =
    mongoose.models.UserNotification ||
    mongoose.model(
        "UserNotification",
        userNotificationSchema
    );

const CommunityPost =
    mongoose.models.CommunityPost ||
    mongoose.model(
        "CommunityPost",
        communityPostSchema
    );

const CommunityPostingQuota =
    mongoose.models.CommunityPostingQuota ||
    mongoose.model(
        "CommunityPostingQuota",
        communityPostingQuotaSchema
    );

const CommunityBoardNotice =
    mongoose.models.CommunityBoardNotice ||
    mongoose.model(
        "CommunityBoardNotice",
        communityBoardNoticeSchema
    );

const CommunityComment =
    mongoose.models.CommunityComment ||
    mongoose.model(
        "CommunityComment",
        communityCommentSchema
    );

const CommunityVote =
    mongoose.models.CommunityVote ||
    mongoose.model(
        "CommunityVote",
        communityVoteSchema
    );

const CommunityReport =
    mongoose.models.CommunityReport ||
    mongoose.model(
        "CommunityReport",
        communityReportSchema
    );

const PrivateMockExam =
    mongoose.models.PrivateMockExam ||
    mongoose.model(
        "PrivateMockExam",
        privateMockExamSchema
    );

const PrivateMockUploadReminder =
    mongoose.models
        .PrivateMockUploadReminder ||
    mongoose.model(
        "PrivateMockUploadReminder",
        privateMockUploadReminderSchema
    );

const PrivateMockExamAttempt =
    mongoose.models.PrivateMockExamAttempt ||
    mongoose.model(
        "PrivateMockExamAttempt",
        privateMockExamAttemptSchema
    );

const PrivateMockExamEvent =
    mongoose.models.PrivateMockExamEvent ||
    mongoose.model(
        "PrivateMockExamEvent",
        privateMockExamEventSchema
    );

const PrivateMockResource =
    mongoose.models.PrivateMockResource ||
    mongoose.model(
        "PrivateMockResource",
        privateMockResourceSchema
    );

const PrivateMockIntegrityCase =
    mongoose.models.PrivateMockIntegrityCase ||
    mongoose.model(
        "PrivateMockIntegrityCase",
        privateMockIntegrityCaseSchema
    );

const PrivateMockAnswerCorrection =
    mongoose.models
        .PrivateMockAnswerCorrection ||
    mongoose.model(
        "PrivateMockAnswerCorrection",
        privateMockAnswerCorrectionSchema
    );

const PrivateMockObjection =
    mongoose.models.PrivateMockObjection ||
    mongoose.model(
        "PrivateMockObjection",
        privateMockObjectionSchema
    );

const PrivateMockWeeklyResult =
    mongoose.models.PrivateMockWeeklyResult ||
    mongoose.model(
        "PrivateMockWeeklyResult",
        privateMockWeeklyResultSchema
    );

const RankingProfile =
    mongoose.models.RankingProfile ||
    mongoose.model(
        "RankingProfile",
        rankingProfileSchema
    );

const NicknameChangeRequest =
    mongoose.models.NicknameChangeRequest ||
    mongoose.model(
        "NicknameChangeRequest",
        nicknameChangeRequestSchema
    );

const ArchiveFolder =
    mongoose.models.ArchiveFolder ||
    mongoose.model(
        "ArchiveFolder",
        archiveFolderSchema
    );

const AdminActionLog =
    mongoose.models.AdminActionLog ||
    mongoose.model(
        "AdminActionLog",
        adminActionLogSchema
    );

const AdminTodo =
    mongoose.models.AdminTodo ||
    mongoose.model(
        "AdminTodo",
        adminTodoSchema
    );

module.exports = {
    User,
    ConceptProgress,
    Problem,
    ProblemAttempt,
    AssessmentAttempt,
    LearningEvent,
    ConceptLesson,
    DailyPlan,
    PasswordResetCode,
    QuickPracticeAttempt,
    CoachMessageSuggestion,
    SupportInquiry,
    ArchiveItem,
    Announcement,
    UserNotification,
    CommunityPost,
    CommunityPostingQuota,
    CommunityBoardNotice,
    CommunityComment,
    CommunityVote,
    CommunityReport,
    PrivateMockExam,
    PrivateMockUploadReminder,
    PrivateMockExamAttempt,
    PrivateMockExamEvent,
    PrivateMockResource,
    PrivateMockIntegrityCase,
    PrivateMockAnswerCorrection,
    PrivateMockObjection,
    PrivateMockWeeklyResult,
    RankingProfile,
    NicknameChangeRequest,
    ArchiveFolder,
    AdminActionLog,
    AdminTodo,
};
