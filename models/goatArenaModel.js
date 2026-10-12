const mongoose = require("mongoose");

const { Schema } = mongoose;

function updatedPolicyPaths(update = {}) {
  return new Set([
    ...Object.keys(update).filter(
      (key) => !key.startsWith("$")
    ),
    ...Object.keys(update.$set || {}),
    ...Object.keys(update.$unset || {}),
    ...Object.keys(update.$inc || {}),
  ]);
}

/*
 * 결제사가 보내는 승인 완료 통지를 이용 주기로 바꾸기 위한 감사 원장입니다.
 * 카드·계좌 정보나 결제사의 전체 응답은 저장하지 않고, 중복 적용을 막는
 * 식별자와 승인 결과만 보관합니다.
 */
const arenaPackagePaymentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    providerMode: {
      type: String,
      enum: ["TEST", "LIVE"],
      default: undefined,
      index: true,
    },
    providerPaymentKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    orderReference: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      unique: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      unique: true,
    },
    status: {
      type: String,
      enum: [
        "APPROVED",
        "APPLIED",
        "PARTIALLY_REFUNDED",
        "CANCELLED",
        "REFUNDED",
      ],
      default: "APPROVED",
      index: true,
    },
    approvedAt: {
      type: Date,
      required: true,
      index: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: "KRW",
    },
    approvedAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    productCode: {
      type: String,
      enum: ["PRO_MONTHLY"],
      default: "PRO_MONTHLY",
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      maxlength: 140,
      default: "Matths Pro",
    },
    // App Store Server Notifications V2는 로그인 세션 없이 도착한다. 최초 결제 때
    // 이 세 값을 원장에 남겨야 갱신·환불 통지를 사용자와 다시 연결할 수 있다.
    appleOriginalTransactionId: {
      type: String,
      trim: true,
      maxlength: 160,
      default: undefined,
    },
    appleAppAccountToken: {
      type: String,
      trim: true,
      maxlength: 64,
      default: undefined,
    },
    appleExpiresAt: {
      type: Date,
      default: undefined,
    },
    refundedAmount: { type: Number, min: 0, default: 0 },
    refundStatus: {
      type: String,
      enum: ["NONE", "REQUESTED", "CALCULATED", "PARTIAL", "FULL", "REJECTED"],
      default: "NONE",
      index: true,
    },
    latestRefundRequestId: {
      type: Schema.Types.ObjectId,
      ref: "RefundRequest",
      default: null,
      index: true,
    },
    refundProcessedAt: { type: Date, default: null },
    refundTransactions: {
      type: [{
        refundRequestId: { type: Schema.Types.ObjectId, ref: "RefundRequest", required: true },
        requestedAt: { type: Date, required: true },
        calculationInputs: { type: Schema.Types.Mixed, required: true },
        approvedAmount: { type: Number, min: 0, required: true },
        cancellationMode: { type: String, enum: ["FULL", "PARTIAL"], required: true },
        providerCancellationTransactionKey: { type: String, trim: true, maxlength: 200, required: true },
        providerCancelledAt: { type: Date, required: true },
        processedAt: { type: Date, required: true },
        idempotencyKey: { type: String, trim: true, maxlength: 200, required: true },
      }],
      default: [],
    },
    accountPlanStartsAt: {
      type: Date,
      default: null,
    },
    accountPlanEndsAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    accountDeletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/*
 * StoreKit appAccountToken의 Matths 계정 소유권 원장.
 *
 * 구매 시트는 앱 밖에서 끝나고 Ask to Buy 승인은 며칠 뒤 도착할 수 있다. 그 사이
 * Matths 로그인이 바뀌어도 거래를 "지금 로그인한 사람"에게 주면 안 되므로, 결제
 * 시작 전에 UUID를 Bearer 사용자에게 묶는다. 한 사용자가 여러 기기를 쓸 수 있어
 * userId는 비고유이고, 하나의 UUID만 두 계정에 붙지 못하도록 token만 고유다.
 */
const appleCommerceAccountTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 36,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);
appleCommerceAccountTokenSchema.index({ token: 1 }, { unique: true });
appleCommerceAccountTokenSchema.index({ userId: 1, updatedAt: -1 });

arenaPackagePaymentSchema.index(
  { provider: 1, providerPaymentKey: 1 },
  { unique: true }
);
arenaPackagePaymentSchema.index(
  { provider: 1, appleOriginalTransactionId: 1 },
  { partialFilterExpression: { appleOriginalTransactionId: { $type: "string" } } }
);
arenaPackagePaymentSchema.index(
  { provider: 1, appleAppAccountToken: 1 },
  { partialFilterExpression: { appleAppAccountToken: { $type: "string" } } }
);

const arenaAccessStateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    integrityStatus: {
      type: String,
      enum: ["CLEAR", "REVIEW_REQUIRED", "RESTRICTED"],
      default: "CLEAR",
      index: true,
    },
    integrityCaseId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaIntegrityRiskCase",
      default: null,
    },
    matchmakingRestrictedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    integrityPenaltyStartedAt: {
      type: Date,
      default: null,
    },
    integrityPenaltyReason: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    reasonCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const arenaIntegrityLinkSignalSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    signalType: {
      type: String,
      enum: [
        "DEVICE_TOKEN",
        "BROWSER_SIGNATURE",
        "NETWORK_ADDRESS",
        "NETWORK_BUCKET",
        "PAYMENT_INSTRUMENT",
      ],
      required: true,
      index: true,
    },
    signalHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      select: false,
    },
    sourceType: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    firstSeenAt: {
      type: Date,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      required: true,
      index: true,
    },
    occurrences: {
      type: Number,
      min: 0,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true, versionKey: false }
);
arenaIntegrityLinkSignalSchema.index(
  { userId: 1, signalType: 1, signalHash: 1 },
  { unique: true }
);
arenaIntegrityLinkSignalSchema.index({
  signalType: 1,
  signalHash: 1,
  expiresAt: 1,
});

const arenaIntegrityRiskReasonSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 80 },
    label: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: "", maxlength: 500 },
    points: { type: Number, min: 0, required: true },
    count: { type: Number, min: 0, default: 0 },
    relatedUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    relatedMatchIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "ArenaMatch" }],
      default: [],
    },
  },
  { _id: false }
);

const arenaIntegrityRiskProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["CLEAR", "REVIEW_REQUIRED", "RESTRICTED"],
      default: "CLEAR",
      index: true,
    },
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW",
    },
    signalCodes: { type: [String], default: [] },
    linkedUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    relatedMatchIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "ArenaMatch" }],
      default: [],
    },
    windowStartedAt: { type: Date, default: null },
    windowEndedAt: { type: Date, default: null },
    evaluatedAt: { type: Date, default: null, index: true },
    policyVersion: {
      type: String,
      default: "ARENA-INTEGRITY-RISK-V1",
    },
    evidenceHash: { type: String, default: "", maxlength: 64 },
    lastReviewedEvidenceHash: { type: String, default: "", maxlength: 64 },
    currentCaseId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaIntegrityRiskCase",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false }
);

const arenaIntegrityRiskCaseSchema = new Schema(
  {
    activeCaseKey: {
      type: String,
      trim: true,
      maxlength: 160,
      default: undefined,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "CLEARED", "CONFIRMED"],
      default: "OPEN",
      index: true,
    },
    riskScore: { type: Number, min: 0, max: 100, required: true },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      required: true,
    },
    reasons: { type: [arenaIntegrityRiskReasonSchema], default: [] },
    linkedUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    relatedMatchIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "ArenaMatch" }],
      default: [],
    },
    windowStartedAt: { type: Date, default: null },
    windowEndedAt: { type: Date, default: null },
    policyVersion: {
      type: String,
      default: "ARENA-INTEGRITY-RISK-V1",
    },
    evidenceHash: { type: String, required: true, maxlength: 64 },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decisionNote: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);
arenaIntegrityRiskCaseSchema.index(
  { activeCaseKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeCaseKey: { $type: "string" } },
  }
);

const arenaMatchParticipantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const arenaProblemChoiceSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    text: {
      type: String,
      required: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

const arenaProblemSolutionStepSchema = new Schema(
  {
    step: {
      type: Number,
      min: 1,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      required: true,
    },
    expression: {
      type: String,
      maxlength: 3000,
      default: "",
    },
    explanation: {
      type: String,
      maxlength: 5000,
      default: "",
    },
  },
  { _id: false }
);

const arenaProblemQuestionSchema = new Schema(
  {
    questionKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    typeId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    sourceTypeId: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    generatorEngineKey: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    category: {
      type: String,
      enum: [
        "basic-general",
        "general",
        "upper-general",
        "semi-killer",
        "killer",
      ],
      required: true,
    },
    courseId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    referenceFamily: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    skillTags: {
      type: [String],
      default: [],
    },
    difficultyScore: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    expectedTimeMs: {
      type: Number,
      min: 0,
      required: true,
    },
    designPolicyVersion: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 120,
      default: "",
    },
    designSlot: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    plannedCourseId: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    typeSkeletonId: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 120,
      default: "",
    },
    referenceFamilyIds: {
      type: [String],
      default: [],
    },
    referenceFamilyLabels: {
      type: [String],
      default: [],
    },
    referenceBasis: {
      type: String,
      enum: [
        "",
        "EBSI_ACCURACY_REFERENCE",
        "OFFICIAL_MOCK_REFERENCE",
        "CURRICULUM_TRANSFER",
      ],
      default: "",
    },
    difficultyPosition: {
      type: String,
      enum: ["", "LOW", "MID", "MID_HIGH", "HIGH"],
      default: "",
    },
    slotRole: {
      type: String,
      enum: ["", "REGULAR", "FINAL_29_30"],
      default: "",
    },
    difficultyClass: {
      type: String,
      enum: [
        "",
        "BASIC_GENERAL",
        "GENERAL",
        "UPPER_GENERAL",
        "SEMI_KILLER",
        "KILLER",
      ],
      default: "",
    },
    sourcePositionBand: {
      type: String,
      enum: [
        "",
        "Q13_14",
        "Q20_21",
        "Q27_28",
        "MIXED_SEMI_KILLER",
        "SOFTENED_Q29_30",
        "Q29_30_KILLER",
        "ACCURACY_BASIC_GENERAL",
        "ACCURACY_GENERAL",
        "ACCURACY_UPPER_GENERAL",
        "ACCURACY_SEMI_KILLER",
        "ACCURACY_KILLER",
        "ACCURACY_UNRESOLVED",
      ],
      default: "",
    },
    combinedConceptCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    conditionTransformSteps: {
      type: Number,
      min: 0,
      default: 0,
    },
    reasoningStepCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    generatorDifficulty: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    caseBranchCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    targetAccuracyMin: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    targetAccuracyMax: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    graphItem: {
      type: Boolean,
      default: false,
    },
    visualization: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    calculationLoad: {
      type: String,
      enum: ["", "LOW"],
      default: "",
    },
    prompt: {
      type: String,
      required: true,
      maxlength: 10000,
    },
    inputMode: {
      type: String,
      enum: ["short-answer"],
      required: true,
    },
    choices: {
      type: [arenaProblemChoiceSchema],
      default: [],
    },
    answer: {
      type: String,
      required: true,
      maxlength: 200,
    },
    solution: {
      type: String,
      maxlength: 20000,
      default: "",
    },
    solutionProcess: {
      type: [arenaProblemSolutionStepSchema],
      default: [],
    },
    finalCheck: {
      type: String,
      maxlength: 5000,
      default: "",
    },
    answerKey: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    points: {
      type: Number,
      min: 1,
      required: true,
    },
    validation: {
      passed: {
        type: Boolean,
        required: true,
      },
      solvable: {
        type: Boolean,
        required: true,
      },
      uniqueAnswer: {
        type: Boolean,
        required: true,
      },
      calculatorFree: {
        type: Boolean,
        required: true,
      },
      answerMatches: {
        type: Boolean,
        required: true,
      },
      semiKillerCertified: {
        type: Boolean,
        default: false,
      },
      accuracyClassCertified: {
        type: Boolean,
        default: false,
      },
      curriculumCompliant: {
        type: Boolean,
        default: false,
      },
      conditionsConsistent: {
        type: Boolean,
        default: false,
      },
      tierBurdenMatches: {
        type: Boolean,
        default: false,
      },
      structuralDifficultyPassed: {
        type: Boolean,
        default: false,
      },
      twoMinuteSolvable: {
        type: Boolean,
        default: false,
      },
      tenMinuteSolvable: {
        type: Boolean,
        default: false,
      },
      originalityChecked: {
        type: Boolean,
        default: false,
      },
      checkedAt: {
        type: Date,
        required: true,
      },
    },
  },
  { _id: false }
);

const ARENA_PROBLEM_DIFFICULTY_TIERS = [
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "T7",
  "T8",
  "T9",
];

const arenaProblemTierConfigurationSchema = new Schema(
  {
    difficultyTier: {
      type: String,
      enum: ARENA_PROBLEM_DIFFICULTY_TIERS,
      required: true,
    },
    typeIds: {
      type: [String],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length >= 5 &&
          values.length === new Set(values).size,
        message:
          "각 난이도에는 서로 다른 1대1 문제 유형을 5개 이상 지정해야 합니다.",
      },
    },
  },
  { _id: false }
);

const arenaProblemDataValidationFailureSchema = new Schema(
  {
    typeId: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    sample: {
      type: Number,
      min: 0,
      default: 0,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  { _id: false }
);

const arenaProblemTypeSettingSchema = new Schema(
  {
    typeId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    selectionWeight: {
      type: Number,
      min: 1,
      max: 10,
      default: 1,
    },
    answerMin: {
      type: Number,
      min: 1,
      max: 999,
      default: 1,
    },
    answerMax: {
      type: Number,
      min: 1,
      max: 999,
      default: 999,
    },
    difficultyNote: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
  },
  { _id: false }
);

/*
 * 관리자가 선택하는 Arena 문제 데이터는 실행 코드가 아니라 버전 문서입니다.
 * 실제 문제 생성·검산 코드는 서버에 남고, ACTIVE 버전은 신규 경기만 참조합니다.
 */
const arenaProblemDataVersionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9._-]{2,79}$/,
      maxlength: 80,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "RETIRED"],
      default: "DRAFT",
    },
    engineVersion: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
      default: "ARENA-GENERATOR-JS-V1",
    },
    tierConfigurations: {
      type: [arenaProblemTierConfigurationSchema],
      required: true,
      validate: {
        validator: (values) => {
          if (!Array.isArray(values) || values.length !== 9) return false;
          const tiers = values.map((value) => value.difficultyTier);
          return (
            new Set(tiers).size === 9 &&
            ARENA_PROBLEM_DIFFICULTY_TIERS.every((tier) =>
              tiers.includes(tier)
            )
          );
        },
        message: "T1부터 T9까지 문제 유형 설정이 모두 필요합니다.",
      },
    },
    typeSettings: {
      type: [arenaProblemTypeSettingSchema],
      required: true,
      default: [],
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length >= 5 &&
          values.length === new Set(values.map((value) => value.typeId)).size &&
          values.every(
            (value) =>
              Number(value.answerMin) <= Number(value.answerMax) &&
              Number(value.selectionWeight) >= 1
          ),
        message: "문제 유형별 사용 여부·가중치·정답 범위를 확인해주세요.",
      },
    },
    changeSummary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    contentHash: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
      required: true,
    },
    validationReport: {
      passed: {
        type: Boolean,
        default: false,
      },
      sampledTypeCount: {
        type: Number,
        min: 0,
        default: 0,
      },
      sampleCount: {
        type: Number,
        min: 0,
        default: 0,
      },
      failures: {
        type: [arenaProblemDataValidationFailureSchema],
        default: [],
      },
      validatedAt: {
        type: Date,
        default: null,
      },
    },
    basedOnVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaProblemDataVersion",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

const arenaTierCatalogEngineBindingSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["ASSESSMENT_CENTER"],
      default: "ASSESSMENT_CENTER",
      required: true,
    },
    engineKey: { type: String, required: true, trim: true, maxlength: 500 },
    sourceHash: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },
    weight: { type: Number, min: 1, max: 100, default: 1 },
  },
  { _id: false }
);

const arenaTierCatalogTypeSchema = new Schema(
  {
    typeId: { type: String, required: true, trim: true, maxlength: 120 },
    label: { type: String, required: true, trim: true, maxlength: 240 },
    curriculumUnit: {
      type: String,
      enum: ["algebra", "calculus-1", "probability-statistics"],
      required: true,
    },
    referenceCount: { type: Number, min: 1, required: true },
    generatorBindings: {
      type: [arenaTierCatalogEngineBindingSchema],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length > 0 &&
          values.length === new Set(values.map((value) => value.engineKey)).size,
        message: "Arena 참고 유형마다 중복 없는 검산 생성기 연결이 필요합니다.",
      },
    },
  },
  { _id: false }
);

const arenaTierCatalogTypeWeightSchema = new Schema(
  {
    typeId: { type: String, required: true, trim: true, maxlength: 120 },
    weight: { type: Number, min: 1, max: 30, required: true },
    referenceQuestionIds: { type: [String], default: [] },
  },
  { _id: false }
);

const arenaTierCatalogConfigurationSchema = new Schema(
  {
    difficultyTier: {
      type: String,
      enum: ARENA_PROBLEM_DIFFICULTY_TIERS,
      required: true,
    },
    questionCount: { type: Number, enum: [30], required: true },
    typeWeights: {
      type: [arenaTierCatalogTypeWeightSchema],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length >= 5 &&
          values.length === new Set(values.map((value) => value.typeId)).size &&
          values.reduce((sum, value) => sum + Number(value.weight || 0), 0) === 30 &&
          values.every(
            (value) =>
              Array.isArray(value.referenceQuestionIds) &&
              value.referenceQuestionIds.length === Number(value.weight || 0)
          ),
        message: "각 T등급에는 합계 30개인 중복 없는 참고 유형과 문항 ID가 필요합니다.",
      },
    },
  },
  { _id: false }
);

const arenaTierReferenceQuestionSchema = new Schema(
  {
    questionId: { type: String, required: true, trim: true, maxlength: 40 },
    difficultyTier: {
      type: String,
      enum: ARENA_PROBLEM_DIFFICULTY_TIERS,
      required: true,
    },
    sequence: { type: Number, min: 1, max: 30, required: true },
    typeId: { type: String, required: true, trim: true, maxlength: 120 },
    problemText: { type: String, required: true, maxlength: 20000 },
    originalImage: { type: String, trim: true, maxlength: 1000, default: "" },
    imageNote: { type: String, trim: true, maxlength: 1000, default: "" },
    solutionProcess: {
      type: [{ step: Number, explanation: { type: String, maxlength: 3000 } }],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length > 0 &&
          values.every(
            (value) =>
              Number(value.step) >= 1 &&
              String(value.explanation || "").trim().length > 0
          ),
        message: "참고 문항의 풀이과정을 확인해주세요.",
      },
    },
    finalCheck: { type: String, trim: true, maxlength: 3000, default: "" },
    answer: { type: String, required: true, trim: true, maxlength: 1000 },
    normalizedAnswer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    answerFormat: {
      type: String,
      enum: ["MULTIPLE_CHOICE", "NATURAL_NUMBER"],
      required: true,
    },
    answerStructureValidated: { type: Boolean, required: true, default: false },
    source: {
      exam: { type: String, trim: true, maxlength: 500, default: "" },
      kind: { type: String, trim: true, maxlength: 100, default: "" },
      questionNumber: { type: Number, min: 0, default: 0 },
      pdfPage: { type: Number, min: 0, default: 0 },
    },
    liveQuestionEligible: { type: Boolean, default: false },
  },
  { _id: false }
);

const arenaTierQuestionCatalogVersionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9._-]{2,79}$/,
      maxlength: 80,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 240 },
    schemaVersion: { type: String, required: true, trim: true, maxlength: 40 },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "RETIRED"],
      default: "DRAFT",
      index: true,
    },
    sourceFileName: { type: String, required: true, trim: true, maxlength: 300 },
    sourceHash: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
      unique: true,
    },
    contentHash: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },
    typeDefinitions: {
      type: [arenaTierCatalogTypeSchema],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length > 0 &&
          values.length === new Set(values.map((value) => value.typeId)).size,
        message: "Arena 유형 정의의 식별자는 중복될 수 없습니다.",
      },
    },
    tierConfigurations: {
      type: [arenaTierCatalogConfigurationSchema],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length === 9 &&
          ARENA_PROBLEM_DIFFICULTY_TIERS.every((tier) =>
            values.some((value) => value.difficultyTier === tier)
          ),
        message: "T1부터 T9까지 카탈로그 구성이 모두 필요합니다.",
      },
    },
    referenceQuestions: {
      type: [arenaTierReferenceQuestionSchema],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length === 270 &&
          values.length === new Set(values.map((value) => value.questionId)).size,
        message: "T1~T9 참고 문항 270개와 고유 식별자가 필요합니다.",
      },
    },
    validationReport: {
      passed: { type: Boolean, default: false },
      typeCount: { type: Number, min: 0, default: 0 },
      referenceQuestionCount: { type: Number, min: 0, default: 0 },
      answeredReferenceQuestionCount: { type: Number, min: 0, default: 0 },
      solutionProcessReferenceCount: { type: Number, min: 0, default: 0 },
      multipleChoiceReferenceCount: { type: Number, min: 0, default: 0 },
      naturalNumberReferenceCount: { type: Number, min: 0, default: 0 },
      liveEligibleReferenceCount: { type: Number, min: 0, default: 0 },
      mappedEngineCount: { type: Number, min: 0, default: 0 },
      generatedSampleCount: { type: Number, min: 0, default: 0 },
      failures: { type: [String], default: [] },
      validatedAt: { type: Date, default: null },
    },
    activatedAt: { type: Date, default: null },
    retiredAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    activatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false }
);

arenaTierQuestionCatalogVersionSchema.index(
  { status: 1 },
  {
    unique: true,
    name: "active_arena_tier_question_catalog_unique",
    partialFilterExpression: { status: "ACTIVE" },
  }
);

const immutableArenaTierCatalogPaths = [
  "code",
  "displayName",
  "schemaVersion",
  "sourceFileName",
  "sourceHash",
  "contentHash",
  "typeDefinitions",
  "tierConfigurations",
  "referenceQuestions",
  "validationReport",
  "createdBy",
  "activatedBy",
  "activatedAt",
];

arenaTierQuestionCatalogVersionSchema.pre(
  "save",
  async function preventPublishedArenaTierCatalogMutation() {
    if (this.isNew) return;
    const current = await this.constructor.findById(this._id).select("status").lean();
    if (!current) return;
    if (
      ["ACTIVE", "RETIRED"].includes(current.status) &&
      immutableArenaTierCatalogPaths.some((path) => this.isModified(path))
    ) {
      throw new Error(
        "적용하거나 종료한 Arena 티어 문제 카탈로그는 수정할 수 없습니다. 새 버전을 가져와주세요."
      );
    }
    if (current.status === "RETIRED" && this.isModified("status")) {
      throw new Error("종료한 Arena 티어 문제 카탈로그는 다시 적용할 수 없습니다.");
    }
  }
);

arenaTierQuestionCatalogVersionSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function preventPublishedArenaTierCatalogQueryMutation() {
    const current = await this.model
      .findOne(this.getQuery())
      .select("status")
      .session(this.getOptions().session || null)
      .lean();
    if (!current) return;
    const changedPaths = updatedPolicyPaths(this.getUpdate() || {});
    const changesDefinition = immutableArenaTierCatalogPaths.some((protectedPath) =>
      [...changedPaths].some(
        (changedPath) =>
          changedPath === protectedPath ||
          changedPath.startsWith(`${protectedPath}.`)
      )
    );
    if (changesDefinition && ["ACTIVE", "RETIRED"].includes(current.status)) {
      throw new Error(
        "적용하거나 종료한 Arena 티어 문제 카탈로그는 수정할 수 없습니다. 새 버전을 가져와주세요."
      );
    }
    const nextStatus = this.getUpdate()?.status || this.getUpdate()?.$set?.status;
    if (current.status === "RETIRED" && nextStatus) {
      throw new Error("종료한 Arena 티어 문제 카탈로그는 다시 적용할 수 없습니다.");
    }
  }
);

arenaProblemDataVersionSchema.index(
  { status: 1 },
  {
    unique: true,
    name: "active_problem_data_unique",
    partialFilterExpression: { status: "ACTIVE" },
  }
);

const immutableArenaProblemDataPaths = [
  "code",
  "displayName",
  "engineVersion",
  "tierConfigurations",
  "typeSettings",
  "changeSummary",
  "contentHash",
  "validationReport",
  "basedOnVersionId",
  "createdBy",
];

arenaProblemDataVersionSchema.pre("save", async function preventPublishedProblemDataMutation() {
  if (this.isNew) return;
  const current = await this.constructor.findById(this._id).select("status").lean();
  if (!current) return;
  if (
    ["ACTIVE", "RETIRED"].includes(current.status) &&
    immutableArenaProblemDataPaths.some((path) => this.isModified(path))
  ) {
    throw new Error(
      "적용하거나 종료한 문제 데이터는 수정할 수 없습니다. 새 초안 버전을 만들어주세요."
    );
  }
  if (current.status === "RETIRED" && this.isModified("status")) {
    throw new Error("종료한 문제 데이터 버전은 다시 적용할 수 없습니다.");
  }
});

arenaProblemDataVersionSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function preventPublishedProblemDataQueryMutation() {
    const current = await this.model
      .findOne(this.getQuery())
      .select("status")
      .session(this.getOptions().session || null)
      .lean();
    if (!current) return;
    const changedPaths = updatedPolicyPaths(this.getUpdate() || {});
    const changesDefinition = immutableArenaProblemDataPaths.some((protectedPath) =>
      [...changedPaths].some(
        (changedPath) =>
          changedPath === protectedPath ||
          changedPath.startsWith(`${protectedPath}.`)
      )
    );
    if (changesDefinition && ["ACTIVE", "RETIRED"].includes(current.status)) {
      throw new Error(
        "적용하거나 종료한 문제 데이터는 수정할 수 없습니다. 새 초안 버전을 만들어주세요."
      );
    }
    const nextStatus = this.getUpdate()?.status || this.getUpdate()?.$set?.status;
    if (current.status === "RETIRED" && nextStatus) {
      throw new Error("종료한 문제 데이터 버전은 다시 적용할 수 없습니다.");
    }
  }
);

/*
 * Unranked 문제는 신청 순간 JS 생성기 검산을 통과해야 합니다.
 * 자동 검산 결과와 콘텐츠 해시가 SEALED로 고정된 팩만 경기에 배정합니다.
 */
const arenaProblemPackSchema = new Schema(
  {
    version: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9._-]{2,119}$/,
      maxlength: 120,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    status: {
      type: String,
      enum: ["DRAFT", "SEALED", "RETIRED"],
      default: "DRAFT",
      index: true,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
      index: true,
    },
    matchType: {
      type: String,
      enum: ["NORMAL", "FRIENDLY"],
      required: true,
      index: true,
    },
    tierPairKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
      index: true,
    },
    tierPairLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    generationMode: {
      type: String,
      enum: ["AUTO_ON_CHALLENGE", "MANUAL"],
      default: "AUTO_ON_CHALLENGE",
      immutable: true,
    },
    generatedForMatchKey: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
      index: true,
    },
    designPolicyVersion: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    contentSourceVersion: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    problemDataVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaProblemDataVersion",
      default: null,
      index: true,
    },
    tierCatalogVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaTierQuestionCatalogVersion",
      default: null,
      index: true,
    },
    designCompliance: {
      type: String,
      enum: ["PENDING_FINAL_GENERATORS", "ACTIVE"],
      required: true,
      index: true,
    },
    difficultyAnchor: {
      type: String,
      enum: ["DEFENDER"],
      required: true,
    },
    difficultyTier: {
      type: String,
      enum: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"],
      required: true,
      index: true,
    },
    difficultyCode: {
      type: String,
      enum: ["", "U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8", "U9", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"],
      default: "",
      index: true,
    },
    targetDefenderAccuracyMin: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    targetDefenderAccuracyMax: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    targetChallengerAccuracyMin: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    targetChallengerAccuracyMax: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    packCurve: {
      type: [String],
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length === 5 &&
          values.every((value) =>
            ["LOW", "MID", "MID_HIGH", "HIGH"].includes(value)
          ),
        message: "경기 문제 팩의 티어 내 난이도 곡선을 확인해주세요.",
      },
    },
    curriculumVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    curriculumCoverage: {
      type: [String],
      validate: {
        validator: (values) =>
          Array.isArray(values) && values.length > 0,
        message: "경기 문제 팩에는 교육과정 범위가 필요합니다.",
      },
    },
    questionCount: {
      type: Number,
      enum: [5],
      required: true,
    },
    totalPoints: {
      type: Number,
      min: 1,
      required: true,
    },
    timeLimitMs: {
      type: Number,
      min: 60 * 1000,
      max: 120 * 60 * 1000,
      required: true,
    },
    scoringVersion: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },
    variantMode: {
      type: String,
      enum: ["SAME"],
      default: "SAME",
      immutable: true,
    },
    questions: {
      type: [arenaProblemQuestionSchema],
      required: true,
      select: false,
    },
    contentHash: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
      default: undefined,
      select: false,
    },
    availableFrom: {
      type: Date,
      required: true,
      index: true,
    },
    availableUntil: {
      type: Date,
      default: null,
      index: true,
    },
    sealedAt: {
      type: Date,
      default: null,
    },
    sealedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    autoValidatedAt: {
      type: Date,
      default: null,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

arenaProblemPackSchema.index({
  status: 1,
  division: 1,
  matchType: 1,
  availableFrom: 1,
  availableUntil: 1,
});

arenaProblemPackSchema.path("questions").validate(
  function validatePackQuestions(questions) {
    if (!Array.isArray(questions)) return false;
    const keys = questions.map((question) => question.questionKey);
    const typeIds = questions.map((question) => question.typeId);
    const categoryByClass = {
      BASIC_GENERAL: "basic-general",
      GENERAL: "general",
      UPPER_GENERAL: "upper-general",
      SEMI_KILLER: "semi-killer",
      KILLER: "killer",
    };
    const activeAccuracyDesign = this.designCompliance === "ACTIVE";
    return (
      questions.length === Number(this.questionCount) &&
      new Set(keys).size === keys.length &&
      new Set(typeIds).size === typeIds.length &&
      questions.every(
        (question) => {
          const difficultyClass = String(
            question.difficultyClass || ""
          ).toUpperCase();
          const killerQuestion = difficultyClass === "KILLER";
          const expectedCategory = activeAccuracyDesign
            ? categoryByClass[difficultyClass]
            : question.category;
          const expectedFinalRole = activeAccuracyDesign
            ? killerQuestion
            : question.category === "killer";
          return (
            [
              "basic-general",
              "general",
              "upper-general",
              "semi-killer",
              "killer",
            ].includes(question.category) &&
            question.category === expectedCategory &&
            String(question.slotRole || "").toUpperCase() ===
              (expectedFinalRole ? "FINAL_29_30" : "REGULAR") &&
            question.validation?.passed === true &&
            question.validation?.solvable === true &&
            question.validation?.uniqueAnswer === true &&
            question.validation?.calculatorFree === true &&
            question.validation?.answerMatches === true
          );
        }
      ) &&
      questions.reduce(
        (sum, question) => sum + Number(question.points || 0),
        0
      ) === Number(this.totalPoints)
    );
  },
  "문항 수·고유 유형·배점 또는 자동 검산 결과를 확인해주세요."
);

arenaProblemPackSchema.pre("validate", function validateSealedPack() {
  if (
    !["SEALED", "RETIRED"].includes(
      this.status
    )
  ) {
    return;
  }
  if (!this.contentHash || !this.sealedAt) {
    this.invalidate(
      "contentHash",
      "봉인된 경기 문제 팩에는 콘텐츠 해시와 봉인 시각이 필요합니다."
    );
  }
});

const immutableArenaProblemPackPaths = [
  "version",
  "displayName",
  "division",
  "matchType",
  "tierPairKey",
  "tierPairLabel",
  "generationMode",
  "generatedForMatchKey",
  "designPolicyVersion",
  "contentSourceVersion",
  "problemDataVersionId",
  "tierCatalogVersionId",
  "designCompliance",
  "difficultyAnchor",
  "difficultyTier",
  "difficultyCode",
  "targetDefenderAccuracyMin",
  "targetDefenderAccuracyMax",
  "targetChallengerAccuracyMin",
  "targetChallengerAccuracyMax",
  "packCurve",
  "curriculumVersion",
  "curriculumCoverage",
  "questionCount",
  "totalPoints",
  "timeLimitMs",
  "scoringVersion",
  "variantMode",
  "questions",
  "contentHash",
  "availableFrom",
  "availableUntil",
  "sealedAt",
  "sealedBy",
  "autoValidatedAt",
];

arenaProblemPackSchema.pre("save", async function preventSealedPackMutation() {
  if (this.isNew) return;
  const current = await this.constructor
    .findById(this._id)
    .select("status")
    .lean();
  if (!current) return;
  if (
    ["SEALED", "RETIRED"].includes(
      current.status
    ) &&
    immutableArenaProblemPackPaths.some(
      (path) => this.isModified(path)
    )
  ) {
    throw new Error(
      "봉인하거나 종료한 경기 문제 팩의 내용은 수정할 수 없습니다. 새 버전을 만들어주세요."
    );
  }
  if (
    current.status === "SEALED" &&
    this.isModified("status") &&
    this.status !== "RETIRED"
  ) {
    throw new Error(
      "봉인한 경기 문제 팩은 종료 상태로만 전환할 수 있습니다."
    );
  }
  if (
    current.status === "RETIRED" &&
    this.isModified("status")
  ) {
    throw new Error(
      "종료한 경기 문제 팩은 다시 활성화할 수 없습니다."
    );
  }
});

arenaProblemPackSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function preventSealedPackQueryMutation() {
    const changedPaths = updatedPolicyPaths(
      this.getUpdate() || {}
    );
    const current = await this.model
      .findOne(this.getQuery())
      .select("status")
      .session(this.getOptions().session || null)
      .lean();
    if (!current) return;
    const changesDefinition =
      immutableArenaProblemPackPaths.some(
        (protectedPath) =>
          [...changedPaths].some(
            (changedPath) =>
              changedPath === protectedPath ||
              changedPath.startsWith(
                `${protectedPath}.`
              )
          )
      );
    if (
      changesDefinition &&
      ["SEALED", "RETIRED"].includes(
        current.status
      )
    ) {
      throw new Error(
        "봉인하거나 종료한 경기 문제 팩의 내용은 수정할 수 없습니다. 새 버전을 만들어주세요."
      );
    }
    const nextStatus =
      this.getUpdate()?.status ||
      this.getUpdate()?.$set?.status;
    if (
      current.status === "SEALED" &&
      nextStatus &&
      nextStatus !== "RETIRED"
    ) {
      throw new Error(
        "봉인한 경기 문제 팩은 종료 상태로만 전환할 수 있습니다."
      );
    }
    if (
      current.status === "RETIRED" &&
      nextStatus
    ) {
      throw new Error(
        "종료한 경기 문제 팩은 다시 활성화할 수 없습니다."
      );
    }
  }
);

const arenaMatchAnswerSchema = new Schema(
  {
    questionKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    value: {
      type: String,
      maxlength: 200,
      default: "",
    },
    revision: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastChangedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const arenaMatchAttemptSchema = new Schema(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["CHALLENGER", "DEFENDER"],
      required: true,
    },
    integrityWatermarkTraceCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^ARM-[A-F0-9]{12}$/,
      default: undefined,
      index: true,
    },
    problemPackId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaProblemPack",
      required: true,
    },
    problemPackVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    variantCode: {
      type: String,
      enum: ["COMMON", "INDIVIDUAL"],
      default: "COMMON",
    },
    status: {
      type: String,
      enum: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED", "SUBMITTED"],
      default: "READY",
      index: true,
    },
    answers: {
      type: [arenaMatchAnswerSchema],
      default: [],
    },
    answerRevision: {
      type: Number,
      min: 0,
      default: 0,
    },
    startIdempotencyKey: {
      type: String,
      trim: true,
      maxlength: 200,
      default: undefined,
    },
    submissionIdempotencyKey: {
      type: String,
      trim: true,
      maxlength: 200,
      default: undefined,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    deadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    submissionMode: {
      type: String,
      enum: ["MANUAL", "TIME_LIMIT", null],
      default: null,
    },
    lastSavedAt: {
      type: Date,
      default: null,
    },
    lastHeartbeatAt: {
      type: Date,
      default: null,
    },
    focusState: {
      type: String,
      enum: ["FOCUSED", "BLURRED", "UNKNOWN"],
      default: "UNKNOWN",
    },
    activeSolveTimeMs: {
      type: Number,
      min: 0,
      default: null,
    },
    currentQuestionIndex: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    boardWriteVersion: { type: Number, min: 0, default: 0 },
    questionCompletionLock: { type: Schema.Types.Mixed, default: null },
    questionTimings: {
      type: [
        new Schema(
          {
            questionKey: { type: String, required: true },
            startedAt: { type: Date, required: true },
            completedAt: { type: Date, default: null },
            responseTimeMs: { type: Number, min: 0, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    evidenceDeadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    evidenceSubmittedAt: {
      type: Date,
      default: null,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    correctCount: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

arenaMatchAttemptSchema.index(
  { matchId: 1, userId: 1 },
  { unique: true }
);
arenaMatchAttemptSchema.index(
  { startIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      startIdempotencyKey: { $type: "string" },
    },
  }
);
arenaMatchAttemptSchema.index(
  { submissionIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      submissionIdempotencyKey: { $type: "string" },
    },
  }
);

const arenaAttemptAnswerChangeSchema = new Schema(
  {
    questionKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    value: {
      type: String,
      maxlength: 200,
      default: "",
    },
    clientAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const arenaAttemptSignalSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "HEARTBEAT",
        "FOCUS_GAINED",
        "FOCUS_LOST",
        "QUESTION_FOCUSED",
        "PAGE_EXITED",
      ],
      required: true,
    },
    questionKey: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    clientAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const arenaMatchAttemptEventSchema = new Schema(
  {
    attemptId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatchAttempt",
      required: true,
      index: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 220,
    },
    eventType: {
      type: String,
      enum: [
        "ATTEMPT_STARTED",
        "ANSWERS_SAVED",
        "ACTIVITY_RECORDED",
        "ATTEMPT_SUBMITTED",
        "QUESTION_ADVANCED",
        "EVIDENCE_SUBMITTED",
      ],
      required: true,
      index: true,
    },
    answerChanges: {
      type: [arenaAttemptAnswerChangeSchema],
      default: [],
    },
    signals: {
      type: [arenaAttemptSignalSchema],
      default: [],
    },
    serverAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true, versionKey: false }
);

arenaMatchAttemptEventSchema.index(
  { attemptId: 1, idempotencyKey: 1 },
  { unique: true }
);

const arenaMatchScoreSnapshotSchema = new Schema(
  {
    score: { type: Number, min: 0, max: 100, default: null },
    correctCount: { type: Number, min: 0, max: 5, default: null },
    correctAnswerSolveTimeMs: { type: Number, min: 0, default: null },
    totalSolveTimeMs: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const arenaMatchResultSnapshotSchema = new Schema(
  {
    scoringPolicyVersion: { type: String, trim: true, maxlength: 80, default: "" },
    challenger: { type: arenaMatchScoreSnapshotSchema, default: null },
    defender: { type: arenaMatchScoreSnapshotSchema, default: null },
    tieBreakStep: { type: String, trim: true, maxlength: 80, default: "" },
    winnerRole: {
      type: String,
      enum: ["CHALLENGER", "DEFENDER", null],
      default: null,
    },
    settlementSummary: { type: Schema.Types.Mixed, default: {} },
    resolvedAt: { type: Date, default: null },
  },
  { _id: false }
);

const arenaAsyncCompetitiveSnapshotSchema = new Schema(
  {
    enabled: { type: Boolean, default: false, immutable: true },
    historicalRecordId: { type: Schema.Types.ObjectId, ref: "ArenaCompetitiveRecord", default: null, immutable: true },
    historicalOwnerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
    challengerRatingBefore: { type: Schema.Types.Mixed, default: null, immutable: true },
    challengerSourceRates: { type: [Number], default: [], immutable: true },
    questionInstanceHashes: { type: [String], default: [], immutable: true },
    opponentQuestionInstanceHashes: { type: [String], default: [], immutable: true },
    reservationExpiresAt: { type: Date, default: null, immutable: true },
    pendingComparison: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

/* General matches pair one current challenger with one verified historical
 * record. Keep the per-match hidden matchmaking snapshot separate from the
 * internal competitive MMR so normal play can never mutate competitive state. */
const arenaAsyncNormalSnapshotSchema = new Schema(
  {
    enabled: { type: Boolean, default: false, immutable: true },
    historicalRecordId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaCompetitiveRecord",
      default: null,
      immutable: true,
    },
    historicalOwnerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      immutable: true,
    },
    baselineQuestionIds: {
      type: [{
        type: Schema.Types.ObjectId,
        ref: "ArenaNormalBaselineQuestion",
      }],
      default: [],
      immutable: true,
    },
    baselineBatchKey: { type: String, trim: true, default: "", immutable: true },
    baselineCombinationHash: { type: String, trim: true, default: "", immutable: true },
    baselineRatingSnapshot: { type: Schema.Types.Mixed, default: null, immutable: true },
    baselinePerformance: { type: Schema.Types.Mixed, default: null, immutable: true },
    firstRecord: { type: Boolean, default: false, immutable: true },
    challengerRatingBefore: { type: Schema.Types.Mixed, default: null, immutable: true },
    challengerSourceRates: { type: [Number], default: [], immutable: true },
    questionInstanceHashes: { type: [String], default: [], immutable: true },
    opponentQuestionInstanceHashes: { type: [String], default: [], immutable: true },
    matchmakingRating: { type: Number, min: 0, default: 1000, immutable: true },
    reservationExpiresAt: { type: Date, default: null, immutable: true },
    pendingComparison: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const arenaMatchSchema = new Schema(
  {
    inlineBoardWriteVersion: { type: Number, min: 0, default: 0 },
    matchKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 200,
    },
    arenaVersion: {
      type: String,
      enum: ["2.0"],
      default: "2.0",
      index: true,
    },
    gameMode: {
      type: String,
      enum: ["NORMAL", "COMPETITIVE", "FRIENDLY", null],
      default: null,
      index: true,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
      index: true,
    },
    seasonKey: {
      type: String,
      required: true,
      index: true,
    },
    /* 모든 Arena 경기는 통합 경쟁 풀(ALL)을 기준으로 기록한다. */
    competitivePool: {
      type: String,
      enum: ["ALL", "HIGH_SCHOOL", "RETAKER", "UNIVERSITY", "WORKER"],
      default: "ALL",
      required: true,
      index: true,
    },
    matchType: {
      type: String,
      enum: ["NORMAL", "FRIENDLY"],
      required: true,
    },
    matchOrigin: {
      type: String,
      enum: [
        "ARENA_2_MATCHMAKING",
        "ARENA_2_ASYNC_RECORD",
        "ARENA_2_FRIEND_INVITATION",
      ],
      default: "ARENA_2_MATCHMAKING",
      index: true,
    },
    requestInitiatorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tierPairKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
      index: true,
    },
    tierPairLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    challenger: {
      type: arenaMatchParticipantSchema,
      required: true,
    },
    defender: {
      type: arenaMatchParticipantSchema,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "MATCHED",
        "READY",
        "IN_PROGRESS",
        "SUBMITTED",
        "RESOLVED",
        "HELD",
        "INVALID",
        "SETTLED",
        "CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },
    policyVersionCode: {
      type: String,
      required: true,
    },
    resultSnapshot: {
      type: arenaMatchResultSnapshotSchema,
      default: null,
    },
    competitiveAsync: {
      type: arenaAsyncCompetitiveSnapshotSchema,
      default: null,
    },
    normalAsync: {
      type: arenaAsyncNormalSnapshotSchema,
      default: null,
    },
    questionExposure: {
      challengerLastShownAt: { type: Date, default: null },
      historicalOwnerLastShownAt: { type: Date, default: null },
      resultQuestionHashes: { type: [String], default: [] },
    },
    problemPackVersion: {
      type: String,
      required: true,
    },
    problemPackId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaProblemPack",
      default: null,
    },
    scoringVersion: {
      type: String,
      required: true,
    },
    timeLimitMs: {
      type: Number,
      min: 60 * 1000,
      max: 120 * 60 * 1000,
      default: null,
    },
    requestedAt: Date,
    startDeadlineAt: {
      type: Date,
      required: true,
      index: true,
    },
    completionDeadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    readyAt: Date,
    startedAt: Date,
    resolvedAt: Date,
    settledAt: Date,
    winnerRole: {
      type: String,
      enum: ["CHALLENGER", "DEFENDER", null],
      default: null,
    },
    integrityStatus: {
      type: String,
      enum: ["PENDING", "CLEAR", "SUSPICIOUS", "CONFIRMED", "INVALID"],
      default: "PENDING",
    },
    integrityScreenedRole: {
      type: String,
      enum: ["CHALLENGER", "DEFENDER", null],
      default: null,
    },
    integrityReviewStartedAt: {
      type: Date,
      default: null,
      index: true,
    },
    integrityReviewDeadlineAt: {
      type: Date,
      default: null,
      index: true,
    },
    integrityReviewCompletedAt: {
      type: Date,
      default: null,
    },
    settlementIdempotencyKey: {
      type: String,
      default: undefined,
    },
    noShowRole: {
      type: String,
      enum: ["CHALLENGER", "DEFENDER", "BOTH", null],
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

arenaMatchSchema.index({ "normalAsync.historicalOwnerUserId": 1, "challenger.userId": 1 });
arenaMatchSchema.index({ "competitiveAsync.historicalOwnerUserId": 1, "challenger.userId": 1 });

arenaMatchSchema.index({
  status: 1,
  "challenger.userId": 1,
});
arenaMatchSchema.index({
  status: 1,
  "defender.userId": 1,
});
arenaMatchSchema.index({
  division: 1,
  matchType: 1,
  "defender.userId": 1,
  requestedAt: -1,
});
arenaMatchSchema.index({ status: 1, createdAt: -1 });
arenaMatchSchema.index({ "challenger.userId": 1, createdAt: -1 });
arenaMatchSchema.index({ "defender.userId": 1, createdAt: -1 });

const arenaMatchParticipantLockSchema =
  new Schema(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
      },
      matchId: {
        type: Schema.Types.ObjectId,
        ref: "ArenaMatch",
        required: true,
        index: true,
      },
      acquiredAt: {
        type: Date,
        default: Date.now,
      },
    },
    { timestamps: true, versionKey: false }
  );

const arenaMatchEvidenceFileSchema = new Schema(
  {
    originalName: { type: String, required: true, maxlength: 255 },
    storedName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 120 },
    sizeBytes: { type: Number, min: 1, required: true },
    sha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    storageProvider: {
      type: String,
      enum: ["CLOUDINARY", "R2", "PURGED"],
      default: "CLOUDINARY",
    },
    storagePurpose: {
      type: String,
      enum: [
        "GENERIC",
        "USER_ARENA_EVIDENCE",
        "ARENA_BASELINE_SOLUTION",
      ],
      default: "GENERIC",
    },
    cloudPublicId: { type: String, maxlength: 500, default: "" },
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
    cloudVersion: { type: Number, default: null },
    cloudFormat: { type: String, maxlength: 40, default: "" },
    r2ObjectKey: { type: String, maxlength: 900, default: "" },
    r2Sha256: {
      type: String,
      match: /^$|^[a-f0-9]{64}$/,
      default: "",
    },
    r2ETag: { type: String, maxlength: 200, default: "" },
    questionSlot: { type: Number, min: 1, max: 5, default: null },
    revision: { type: Number, min: 1, default: null },
    strokeCount: { type: Number, min: 0, default: null },
    firstSavedAt: { type: Date, default: null },
    lastSavedAt: { type: Date, default: null },
  },
  { _id: false }
);

const arenaClientEvidenceReviewSchema = new Schema(
  {
    reviewId: { type: String, required: true, trim: true, maxlength: 180 },
    model: { type: String, required: true, trim: true, maxlength: 120 },
    modelVersion: { type: String, required: true, trim: true, maxlength: 240 },
    reviewState: {
      type: String,
      enum: ["normal", "suspicious", "inconclusive"],
      required: true,
    },
    signals: {
      type: [{ type: String, trim: true, maxlength: 100 }],
      validate: {
        validator: (values) => Array.isArray(values) && values.length <= 20,
        message: "기기 검토 신호는 20개 이하여야 합니다.",
      },
      default: [],
    },
    completedAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true, default: Date.now },
    clientBuildVersion: { type: String, trim: true, maxlength: 100, default: "" },
  },
  { _id: false }
);

const arenaMatchEvidenceSchema = new Schema(
  {
    attemptId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatchAttempt",
      required: true,
      unique: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    files: {
      type: [arenaMatchEvidenceFileSchema],
      validate: {
        // 필수 풀이 증거가 기한 안에 도착하지 않은 경우에도 운영자는 같은
        // 보존 문서에 추가 소명 요청을 남길 수 있어야 한다. 실제 최초 제출은
        // 서비스 계층에서 반드시 1~5장을 검증한다.
        validator: (files) =>
          Array.isArray(files) && files.length <= 5,
        message: "풀이 증거는 5장 이하로 제출해야 합니다.",
      },
      default: [],
    },
    // false인 문서는 최초 풀이 증거가 누락된 참가자에게만 만드는
    // '추가 소명 전용' 보존 문서다. 경기 정산에서는 이를 최초 증거로
    // 간주하지 않는다.
    originalEvidenceSubmitted: { type: Boolean, default: true, index: true },
    deadlineAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ["ON_TIME", "ANOMALY_FLAGGED", "REVIEWED"],
      default: "ON_TIME",
      index: true,
    },
    anomalyFlags: { type: [String], default: [] },
    sourceRiskFlags: { type: [String], default: [] },
    screenedAsWinner: { type: Boolean, default: false },
    // 온디바이스 비전 결과는 운영 검토 후보일 뿐이다. status·anomalyFlags와
    // 분리해 저장해야 앱 모델이 점수·정산·제재를 직접 바꾸는 경로가 생기지 않는다.
    clientReview: { type: arenaClientEvidenceReviewSchema, default: null },
    supplementalRequest: {
      status: {
        type: String,
        enum: ["NONE", "REQUESTED", "SUBMITTED", "EXPIRED"],
        default: "NONE",
        index: true,
      },
      requestedAt: { type: Date, default: null },
      deadlineAt: { type: Date, default: null, index: true },
      requestedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      requestMessage: { type: String, trim: true, maxlength: 500, default: "" },
      submittedAt: { type: Date, default: null },
      submittedLate: { type: Boolean, default: false },
      lateByMs: { type: Number, min: 0, default: 0 },
      files: {
        type: [arenaMatchEvidenceFileSchema],
        validate: {
          validator: (files) => !files || files.length <= 5,
          message: "추가 소명 자료는 5장 이하로 제출해야 합니다.",
        },
        default: [],
      },
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    retentionUntil: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      index: true,
    },
    retentionHoldReason: { type: String, trim: true, maxlength: 200, default: "" },
    retentionReferences: { type: [{
      referenceKey: { type: String, required: true },
      until: { type: Date, default: null },
      _id: false,
    }], default: [] },
    purgeLeaseToken: { type: String, default: "" },
    purgeLeaseExpiresAt: { type: Date, default: null },
    purgeNextAttemptAt: { type: Date, default: null },
    purgeAttempts: { type: Number, default: 0 },
    purgeDeletedAssetKeys: { type: [String], default: [] },
    purgeLastError: { type: String, maxlength: 1000, default: "" },
    contentPurgedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

arenaMatchEvidenceSchema.index({
  retentionUntil: 1,
  contentPurgedAt: 1,
  status: 1,
});

const arenaInlineSolutionBoardSchema = new Schema(
  {
    attemptId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatchAttempt",
      required: true,
      index: true,
    },
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    questionSlot: { type: Number, min: 1, max: 5, required: true },
    revision: { type: Number, min: 1, required: true },
    strokeCount: { type: Number, min: 0, required: true },
    drawingData: {
      type: Buffer,
      required: true,
      select: false,
    },
    file: { type: arenaMatchEvidenceFileSchema, required: true },
    finalizedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);
arenaInlineSolutionBoardSchema.index(
  { attemptId: 1, questionSlot: 1 },
  { unique: true }
);

const arenaOutboxEventSchema = new Schema(
  {
    eventType: {
      type: String,
      enum: [
        "ArenaMatchCreated",
        "ArenaMatchReady",
        "ArenaAttemptStarted",
        "ArenaAttemptSubmitted",
        "ArenaMatchSubmitted",
        "ArenaEvidenceSubmitted",
        "ArenaMatchIntegrityReviewStarted",
        "ArenaMatchSettled",
      ],
      required: true,
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
    },
    aggregateId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    nextPublishAttemptAt: { type: Date, default: null },
    publishAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    processingToken: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    processingLeaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastPublishError: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  { timestamps: true, versionKey: false }
);
arenaOutboxEventSchema.index({
  publishedAt: 1,
  processingLeaseExpiresAt: 1,
  createdAt: 1,
});

/* --------------------------------------------------
 * GOAT Arena 2.0
 *
 * 기존 유료 이용 주기/예치/스왑 문서는 역사 데이터로 보존하고, 무료
 * Arena의 진행 상태와 Glicko-2 값은 아래 독립 모델에 기록한다.
 * -------------------------------------------------- */

const arenaPlacementSampleSchema = new Schema(
  {
    attemptId: {
      type: Schema.Types.ObjectId,
      ref: "AssessmentAttempt",
      required: true,
    },
    score: { type: Number, min: 0, max: 100, required: true },
    estimatedRating: { type: Number, min: 0, required: true },
    completedAt: { type: Date, required: true },
  },
  { _id: false }
);

const arenaCompetitiveProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    rulesetVersion: {
      type: String,
      default: "GOAT_ARENA_2_2",
      immutable: true,
    },
    normalMatchesCompleted: { type: Number, min: 0, default: 0 },
    normalRatedMatchesCompleted: { type: Number, min: 0, default: 0 },
    normalWins: { type: Number, min: 0, default: 0 },
    normalLosses: { type: Number, min: 0, default: 0 },
    normalDraws: { type: Number, min: 0, default: 0 },
    normalMatchmakingRating: { type: Number, min: 0, default: null },
    normalMatchmakingRatingDeviation: { type: Number, min: 0, default: null },
    normalMatchmakingVolatility: { type: Number, min: 0, default: null },
    normalLastRatedAt: { type: Date, default: null },
    normalCurrentStreakType: {
      type: String,
      enum: ["NONE", "WIN", "LOSS"],
      default: "NONE",
    },
    normalCurrentStreakCount: { type: Number, min: 0, default: 0 },
    competitiveMatchesCompleted: { type: Number, min: 0, default: 0 },
    wins: { type: Number, min: 0, default: 0 },
    losses: { type: Number, min: 0, default: 0 },
    draws: { type: Number, min: 0, default: 0 },
    accountXp: { type: Number, min: 0, default: 0 },
    accountLevel: { type: Number, min: 1, default: 1 },
    placementSamples: { type: [arenaPlacementSampleSchema], default: [] },
    placementAttemptsUsed: { type: Number, min: 0, max: 5, default: 0 },
    placementProcessVersion: { type: String, default: null },
    placementProcessStartedAt: { type: Date, default: null },
    placementFinalizedAt: { type: Date, default: null, index: true },
    placementFinalizedReason: {
      type: String,
      enum: ["EARLY", "MAX_ATTEMPTS", null],
      default: null,
    },
    provisionalRating: { type: Number, min: 0, default: null },
    provisionalRatingDeviation: { type: Number, min: 0, default: null },
    provisionalVolatility: { type: Number, min: 0, default: null },
    provisionalTier: { type: String, trim: true, default: "UNPLACED" },
    rating: { type: Number, min: 0, default: null, index: true },
    ratingDeviation: { type: Number, min: 0, default: null },
    volatility: { type: Number, min: 0, default: null },
    competitiveScore: { type: Number, min: 0, default: null, index: true },
    scoreInitializedAt: { type: Date, default: null },
    lastScoreDelta: { type: Number, default: 0 },
    lastScoreChangedAt: { type: Date, default: null },
    tier: { type: String, trim: true, default: "UNPLACED", index: true },
    ratingInitializedAt: { type: Date, default: null },
    lastRatedAt: { type: Date, default: null },
    competitiveCurrentStreakType: {
      type: String,
      enum: ["NONE", "WIN", "LOSS"],
      default: "NONE",
    },
    competitiveCurrentStreakCount: { type: Number, min: 0, default: 0 },
    weeklyMockMatchesCompleted: { type: Number, min: 0, default: 0 },
    weeklyMockRecentPerformances: { type: [Number], default: [] },
    weeklyMockLastRatedAt: { type: Date, default: null },
    competitiveSolutionSharingConsentVersion: { type: String, trim: true, default: null },
    competitiveSolutionSharingConsentedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);
arenaCompetitiveProfileSchema.index({ rating: -1, updatedAt: 1 });
arenaCompetitiveProfileSchema.index({ competitiveScore: -1, lastScoreChangedAt: 1 });

const arenaCompetitiveRatingSnapshotSchema = new Schema({
  rating: { type: Number, min: 0, required: true },
  ratingDeviation: { type: Number, min: 0, required: true },
  volatility: { type: Number, min: 0, required: true },
  tier: { type: String, trim: true, required: true },
}, { _id: false });

const arenaCompetitiveRecordSchema = new Schema({
  recordMode: {
    type: String,
    enum: ["COMPETITIVE", "NORMAL"],
    default: "COMPETITIVE",
    index: true,
    immutable: true,
  },
  ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  sourceMatchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", required: true, index: true, immutable: true },
  sourceAttemptId: { type: Schema.Types.ObjectId, ref: "ArenaMatchAttempt", required: true, unique: true, immutable: true },
  sourceEvidenceId: { type: Schema.Types.ObjectId, ref: "ArenaMatchEvidence", required: true, immutable: true },
  sourceProblemPackId: { type: Schema.Types.ObjectId, ref: "ArenaProblemPack", required: true, immutable: true },
  ratingSnapshot: { type: arenaCompetitiveRatingSnapshotSchema, required: true, immutable: true },
  performance: { type: Schema.Types.Mixed, required: true, immutable: true },
  questionInstanceHashes: { type: [String], required: true, immutable: true },
  status: {
    type: String,
    enum: ["AVAILABLE", "RESERVED", "REVIEW_REQUIRED", "INVALID"],
    default: "AVAILABLE",
    index: true,
  },
  reservedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  reservedByMatchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", default: null },
  reservedAt: { type: Date, default: null },
  reservationExpiresAt: { type: Date, default: null, index: true },
  isBaseline: { type: Boolean, default: false, immutable: true },
  recordLabel: { type: String, trim: true, maxlength: 80, default: "과거 기록", immutable: true },
  consentVersion: { type: String, required: true, immutable: true },
  verifiedAt: { type: Date, required: true, immutable: true },
  integrityFlags: { type: [String], default: [] },
  integrityReviewedAt: { type: Date, default: null },
  integrityReviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  integrityReviewNote: { type: String, trim: true, maxlength: 1000, default: "" },
  usageCount: { type: Number, min: 0, default: 0 },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
arenaCompetitiveRecordSchema.index({ status: 1, "ratingSnapshot.rating": 1, createdAt: 1 });
arenaCompetitiveRecordSchema.index({ reservedByUserId: 1, status: 1, reservationExpiresAt: 1 });
arenaCompetitiveRecordSchema.index({ recordMode: 1, status: 1, usageCount: 1 });
arenaCompetitiveRecordSchema.index({
  recordMode: 1,
  status: 1,
  "ratingSnapshot.rating": 1,
  ownerUserId: 1,
});

/*
 * Cold-start 일반전 기준 기록은 완성된 가상 경기나 가상 사용자로 만들지
 * 않는다. 운영자가 검수한 문항 하나와 그 문항에 대한 기준 답안·풀이 시간·
 * 손풀이 원본을 독립적으로 보존하고, 경기 시작 시 같은 난이도의 다섯 문항을
 * 조합한다. ACTIVE 전환 전에는 어떤 매칭 쿼리에도 포함될 수 없다.
 */
const arenaNormalBaselineQuestionSchema = new Schema({
  schemaVersion: {
    type: String,
    enum: ["GOAT_ARENA_NORMAL_BASELINE_QUESTION_V1"],
    default: "GOAT_ARENA_NORMAL_BASELINE_QUESTION_V1",
    immutable: true,
  },
  batchKey: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z0-9][A-Z0-9._-]{2,119}$/,
    maxlength: 120,
    index: true,
    immutable: true,
  },
  baselineKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z0-9][A-Z0-9._-]{2,79}$/,
    maxlength: 80,
    immutable: true,
  },
  mode: {
    type: String,
    enum: ["NORMAL"],
    default: "NORMAL",
    index: true,
    immutable: true,
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
    required: true,
    index: true,
    immutable: true,
  },
  difficultyCode: {
    type: String,
    enum: ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8", "U9"],
    required: true,
    index: true,
    immutable: true,
  },
  targetMmr: {
    type: Number,
    min: 0,
    required: true,
    index: true,
    immutable: true,
  },
  question: {
    type: arenaProblemQuestionSchema,
    required: true,
    select: false,
    immutable: true,
  },
  questionInstanceHash: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
    index: true,
    immutable: true,
  },
  sourceReferenceId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
    immutable: true,
  },
  sourceAccuracyRate: {
    type: Number,
    min: Number.EPSILON,
    max: 1 - Number.EPSILON,
    required: true,
    immutable: true,
  },
  sourceAccuracyEvidenceKind: {
    type: String,
    enum: ["EXACT"],
    required: true,
    immutable: true,
  },
  sourceAccuracyEvidence: {
    type: Schema.Types.Mixed,
    required: true,
    immutable: true,
  },
  baselineSubmittedAnswer: {
    type: String,
    required: true,
    trim: true,
    match: /^[0-9]{1,3}$/,
    maxlength: 3,
    immutable: true,
  },
  baselineCorrect: {
    type: Boolean,
    required: true,
    immutable: true,
  },
  baselineSolveTimeMs: {
    type: Number,
    min: 1,
    max: 10 * 60 * 1000,
    required: true,
    immutable: true,
  },
  // Generated handwriting and modeled time are reference data, never a
  // claimed human attempt. Legacy operator captures have no provenance.
  generationProvenance: {
    type: Schema.Types.Mixed,
    default: null,
    immutable: true,
  },
  expectedSolutionFileName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
    immutable: true,
  },
  solutionEvidenceFile: {
    type: arenaMatchEvidenceFileSchema,
    default: null,
  },
  correctSolutionFile: {
    type: arenaMatchEvidenceFileSchema,
    default: null,
  },
  status: {
    type: String,
    enum: [
      "DRAFT",
      "EVIDENCE_PENDING",
      "REVIEW_PENDING",
      "ACTIVE",
      "RETIRED",
      "INVALID",
    ],
    default: "DRAFT",
    index: true,
  },
  calibrationStatus: {
    type: String,
    enum: ["UNVALIDATED_HYPOTHESIS", "SIMULATION_APPROVED"],
    default: "UNVALIDATED_HYPOTHESIS",
    index: true,
  },
  createdByUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },
  reviewedByUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reviewedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
  retiredAt: { type: Date, default: null },
  reviewNotes: { type: String, trim: true, maxlength: 2000, default: "" },
}, { timestamps: true, versionKey: false });

arenaNormalBaselineQuestionSchema.index({
  mode: 1,
  status: 1,
  calibrationStatus: 1,
  targetMmr: 1,
  difficultyCode: 1,
  batchKey: 1,
});
arenaNormalBaselineQuestionSchema.index(
  { batchKey: 1, questionInstanceHash: 1 },
  { unique: true }
);

arenaNormalBaselineQuestionSchema.pre("validate", function validateNormalBaselineQuestion() {
  const provenance = this.generationProvenance;
  if (provenance && (
    provenance.generationMethod !== "USER_HANDWRITING_FONT" ||
    provenance.isHumanSolveEvidence !== false ||
    provenance.solveTimeBasis !== "MODEL_ESTIMATE"
  )) {
    this.invalidate("generationProvenance", "자동 생성 기준 데이터의 생성 방식과 추정 시간 구분을 확인해주세요.");
  }
  if (this.correctSolutionFile && this.correctSolutionFile.storagePurpose !== "ARENA_BASELINE_SOLUTION") {
    this.invalidate("correctSolutionFile.storagePurpose", "정답 풀이 파일은 Arena 기준 풀이 용도로 저장해야 합니다.");
  }
  const expectedCorrect =
    String(this.baselineSubmittedAnswer || "").trim() ===
    String(this.question?.answer || "").trim();
  if (Boolean(this.baselineCorrect) !== expectedCorrect) {
    this.invalidate(
      "baselineCorrect",
      "기준 답안의 정오 값이 서버 정답과 일치하지 않습니다."
    );
  }
  if (this.solutionEvidenceFile) {
    if (this.solutionEvidenceFile.storagePurpose !== "ARENA_BASELINE_SOLUTION") {
      this.invalidate(
        "solutionEvidenceFile.storagePurpose",
        "기준 풀이 파일은 Arena 기준 풀이 용도로 저장해야 합니다."
      );
    }
    if (this.solutionEvidenceFile.originalName !== this.expectedSolutionFileName) {
      this.invalidate(
        "solutionEvidenceFile.originalName",
        "기준 풀이 파일명이 캡처 계획과 일치하지 않습니다."
      );
    }
  }
  if (this.status !== "ACTIVE") return;
  if (
    this.calibrationStatus !== "SIMULATION_APPROVED" ||
    !this.solutionEvidenceFile ||
    !this.reviewedByUserId ||
    !this.reviewedAt ||
    !this.activatedAt ||
    !this.createdByUserId
  ) {
    this.invalidate(
      "status",
      "정확한 정답률·손풀이 원본·운영 검수·시뮬레이션 승인이 모두 있어야 기준 문항을 활성화할 수 있습니다."
    );
  }
});

const immutableNormalBaselineQuestionPaths = [
  "schemaVersion",
  "batchKey",
  "baselineKey",
  "mode",
  "tier",
  "difficultyCode",
  "targetMmr",
  "question",
  "questionInstanceHash",
  "sourceReferenceId",
  "sourceAccuracyRate",
  "sourceAccuracyEvidenceKind",
  "sourceAccuracyEvidence",
  "baselineSubmittedAnswer",
  "baselineCorrect",
  "baselineSolveTimeMs",
  "generationProvenance",
  "expectedSolutionFileName",
  "solutionEvidenceFile",
  "correctSolutionFile",
  "calibrationStatus",
  "createdByUserId",
  "reviewedByUserId",
  "reviewedAt",
  "activatedAt",
];

arenaNormalBaselineQuestionSchema.pre("save", async function preventActiveBaselineMutation() {
  if (this.isNew) return;
  const current = await this.constructor.findById(this._id).select("status").lean();
  if (!current) return;
  if (
    ["ACTIVE", "RETIRED"].includes(current.status) &&
    immutableNormalBaselineQuestionPaths.some((path) => this.isModified(path))
  ) {
    throw new Error(
      "활성화하거나 종료한 일반전 기준 문항은 수정할 수 없습니다. 새 배치를 만들어주세요."
    );
  }
  if (
    current.status === "ACTIVE" &&
    this.isModified("status") &&
    this.status !== "RETIRED"
  ) {
    throw new Error("활성 일반전 기준 문항은 종료 상태로만 전환할 수 있습니다.");
  }
  if (current.status === "RETIRED" && this.isModified("status")) {
    throw new Error("종료한 일반전 기준 문항은 다시 활성화할 수 없습니다.");
  }
});

arenaNormalBaselineQuestionSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function preventActiveBaselineQueryMutation() {
    const current = await this.model
      .findOne(this.getQuery())
      .select("status")
      .session(this.getOptions().session || null)
      .lean();
    if (!current) return;
    const changedPaths = updatedPolicyPaths(this.getUpdate() || {});
    const changesDefinition = immutableNormalBaselineQuestionPaths.some(
      (protectedPath) =>
        [...changedPaths].some(
          (changedPath) =>
            changedPath === protectedPath ||
            changedPath.startsWith(`${protectedPath}.`)
        )
    );
    if (changesDefinition && ["ACTIVE", "RETIRED"].includes(current.status)) {
      throw new Error(
        "활성화하거나 종료한 일반전 기준 문항은 수정할 수 없습니다. 새 배치를 만들어주세요."
      );
    }
    const nextStatus = this.getUpdate()?.status || this.getUpdate()?.$set?.status;
    if (current.status === "ACTIVE" && nextStatus && nextStatus !== "RETIRED") {
      throw new Error("활성 일반전 기준 문항은 종료 상태로만 전환할 수 있습니다.");
    }
    if (current.status === "RETIRED" && nextStatus) {
      throw new Error("종료한 일반전 기준 문항은 다시 활성화할 수 없습니다.");
    }
  }
);

const arenaNormalBaselineAssignmentSchema = new Schema({
  batchKey: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 120,
    immutable: true,
  },
  baselineQuestionIds: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: "ArenaNormalBaselineQuestion",
      required: true,
    }],
    validate: {
      validator: (values) =>
        Array.isArray(values) &&
        values.length === 5 &&
        new Set(values.map(String)).size === 5,
      message: "일반전 기준 조합에는 서로 다른 다섯 문항이 필요합니다.",
    },
    immutable: true,
  },
  combinationHash: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
    index: true,
    immutable: true,
  },
  challengerUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
    immutable: true,
  },
  matchId: {
    type: Schema.Types.ObjectId,
    ref: "ArenaMatch",
    required: true,
    unique: true,
    immutable: true,
  },
  sequence: {
    type: Number,
    min: 1,
    required: true,
    index: true,
  },
  assignedAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  },
  settledAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

arenaNormalBaselineAssignmentSchema.index({ combinationHash: 1, sequence: -1 });
arenaNormalBaselineAssignmentSchema.index(
  { combinationHash: 1, sequence: 1 },
  { unique: true }
);
arenaNormalBaselineAssignmentSchema.index({ challengerUserId: 1, sequence: -1 });

const arenaNormalMatchCounterSchema = new Schema({
  key: { type: String, enum: ["GLOBAL"], default: "GLOBAL", unique: true },
  sequence: { type: Number, min: 0, default: 0 },
}, { timestamps: true, versionKey: false });

const arenaGuestIdentitySchema = new Schema({
  nickname: { type: String, trim: true, minlength: 2, maxlength: 30, required: true },
  nicknameNormalized: { type: String, trim: true, lowercase: true, maxlength: 30, required: true, unique: true },
  claimSecretHash: { type: String, match: /^[a-f0-9]{64}$/, required: true, select: false },
  birthDateHash: {
    type: String,
    match: /^[a-f0-9]{64}$/,
    required() { return this.isNew; },
    immutable: true,
    select: false,
  },
  firstChallengeAcceptedAt: { type: Date, default: null, immutable: true },
  claimedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  claimedAt: { type: Date, default: null },
  proofGeneration: { type: Number, min: 0, default: 0 },
  proofExpiresAt: { type: Date, default: null },
  anonymizedAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });
arenaGuestIdentitySchema.pre("validate", function validateNewGuestIdentityBinding() {
  // The raw birth date is never stored here; only the keyed digest is persisted.
  if (!this.isNew) return;
  if (!this.birthDateHash) {
    this.invalidate(
      "birthDateHash",
      "새 게스트 신원에는 서버에서 확인한 생년월일 해시가 필요합니다."
    );
  }
  const acceptedAt = this.firstChallengeAcceptedAt;
  if (!(acceptedAt instanceof Date) || Number.isNaN(acceptedAt.getTime())) {
    this.invalidate(
      "firstChallengeAcceptedAt",
      "새 게스트 신원에는 최초 도전장 수락 시각이 필요합니다."
    );
  }
});
arenaGuestIdentitySchema.index(
  { claimedByUserId: 1 },
  { unique: true, partialFilterExpression: { claimedByUserId: { $type: "objectId" } } }
);

const arenaGuestChallengeSchema = new Schema({
  tokenHash: { type: String, match: /^[a-f0-9]{64}$/, required: true, unique: true, select: false },
  creatorUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
    required() { return this.isNew; },
  },
  creatorAnonymizedAt: { type: Date, default: null },
  sourceKind: {
    type: String,
    enum: ["ARENA_MATCH", "GUEST_ATTEMPT"],
    default: "ARENA_MATCH",
    required() { return this.isNew; },
    immutable: true,
  },
  sourceMatchId: {
    type: Schema.Types.ObjectId,
    ref: "ArenaMatch",
    default: null,
    index: true,
    immutable: true,
    required() { return (this.sourceKind || "ARENA_MATCH") === "ARENA_MATCH"; },
  },
  sourceAttemptId: {
    type: Schema.Types.ObjectId,
    ref: "ArenaMatchAttempt",
    default: null,
    immutable: true,
    required() { return (this.sourceKind || "ARENA_MATCH") === "ARENA_MATCH"; },
  },
  sourceEvidenceId: {
    type: Schema.Types.ObjectId,
    ref: "ArenaMatchEvidence",
    default: null,
    immutable: true,
    required() { return (this.sourceKind || "ARENA_MATCH") === "ARENA_MATCH"; },
  },
  sourceGuestAttemptId: {
    type: Schema.Types.ObjectId,
    ref: "ArenaGuestChallengeAttempt",
    default: null,
    immutable: true,
    required() { return this.sourceKind === "GUEST_ATTEMPT"; },
  },
  sourceProblemPackId: { type: Schema.Types.ObjectId, ref: "ArenaProblemPack", required: true, immutable: true },
  sourcePerformance: { type: Schema.Types.Mixed, required: true, immutable: true },
  creatorRatingSnapshot: { type: Number, min: 0, default: null, immutable: true },
  difficultyCodeSnapshot: {
    type: String,
    enum: [
      "",
      "U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8", "U9",
      "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9",
    ],
    default: "",
    immutable: true,
  },
  difficultyPolicy: { type: String, trim: true, maxlength: 80, default: "", immutable: true },
  status: { type: String, enum: ["OPEN", "EXPIRED", "REVOKED"], default: "OPEN", index: true },
  expiresAt: { type: Date, required: true, index: true },
  resultsReleasedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
arenaGuestChallengeSchema.pre("validate", function validateGuestChallengeSourceBranch() {
  const sourceKind = this.sourceKind || "ARENA_MATCH";
  const arenaMatchSourceValues = [
    this.sourceMatchId,
    this.sourceAttemptId,
    this.sourceEvidenceId,
  ];
  const hasAnyArenaMatchSource = arenaMatchSourceValues.some(Boolean);
  const hasCompleteArenaMatchSource = arenaMatchSourceValues.every(Boolean);
  const hasGuestAttemptSource = Boolean(this.sourceGuestAttemptId);
  if (sourceKind === "ARENA_MATCH" && (!hasCompleteArenaMatchSource || hasGuestAttemptSource)) {
    this.invalidate(
      "sourceKind",
      "회원 경기 도전장은 경기·시도·풀이 원본만 source로 가져야 합니다."
    );
  }
  if (sourceKind === "GUEST_ATTEMPT" && (hasAnyArenaMatchSource || !hasGuestAttemptSource)) {
    this.invalidate(
      "sourceKind",
      "역도전장은 완료된 게스트 시도만 source로 가져야 합니다."
    );
  }
});
arenaGuestChallengeSchema.index({ creatorUserId: 1, sourceMatchId: 1, createdAt: -1 });
arenaGuestChallengeSchema.index(
  { sourceGuestAttemptId: 1, creatorUserId: 1, createdAt: -1 },
  { partialFilterExpression: { sourceKind: "GUEST_ATTEMPT" } }
);
arenaGuestChallengeSchema.index(
  { sourceKind: 1, sourceEvidenceId: 1 },
  { partialFilterExpression: { sourceKind: "ARENA_MATCH" } }
);

const arenaGuestChallengeAttemptSchema = new Schema({
  challengeId: { type: Schema.Types.ObjectId, ref: "ArenaGuestChallenge", required: true, index: true },
  guestIdentityId: { type: Schema.Types.ObjectId, ref: "ArenaGuestIdentity", required: true, index: true },
  claimedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  attemptNumber: { type: Number, min: 1, required: true },
  status: { type: String, enum: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED", "SETTLED", "ABANDONED"], default: "READY", index: true },
  problemPackId: { type: Schema.Types.ObjectId, ref: "ArenaProblemPack", required: true },
  answers: { type: [arenaMatchAnswerSchema], default: [] },
  currentQuestionIndex: { type: Number, min: 0, max: 5, default: 0 },
  questionTimings: {
    type: [new Schema({
      questionKey: { type: String, required: true },
      startedAt: { type: Date, required: true },
      completedAt: { type: Date, default: null },
      responseTimeMs: { type: Number, min: 0, default: null },
    }, { _id: false })],
    default: [],
  },
  startedAt: { type: Date, default: null },
  deadlineAt: { type: Date, default: null, index: true },
  submittedAt: { type: Date, default: null },
  activeSolveTimeMs: { type: Number, min: 0, default: null },
  evidenceFiles: { type: [arenaMatchEvidenceFileSchema], default: [] },
  evidenceSubmittedAt: { type: Date, default: null },
  scoring: { type: Schema.Types.Mixed, default: null },
  performance: { type: Schema.Types.Mixed, default: null },
  comparison: { type: Schema.Types.Mixed, default: null },
  result: { type: String, enum: ["CHALLENGER_WIN", "CREATOR_WIN", "DRAW", null], default: null },
  settledAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
arenaGuestChallengeAttemptSchema.index({ challengeId: 1, guestIdentityId: 1 }, { unique: true });
arenaGuestChallengeAttemptSchema.index({ challengeId: 1, status: 1, settledAt: 1 });
arenaGuestChallengeAttemptSchema.index({
  challengeId: 1,
  status: 1,
  "performance.correctCount": -1,
  "performance.totalSolveTimeMs": 1,
  attemptNumber: 1,
});
arenaGuestChallengeAttemptSchema.index({
  guestIdentityId: 1,
  status: 1,
  "performance.correctCount": -1,
  "performance.totalSolveTimeMs": 1,
  attemptNumber: 1,
});

const arenaGuestSolutionBoardSchema = new Schema({
  attemptId: { type: Schema.Types.ObjectId, ref: "ArenaGuestChallengeAttempt", required: true, index: true },
  guestIdentityId: { type: Schema.Types.ObjectId, ref: "ArenaGuestIdentity", required: true, index: true },
  questionSlot: { type: Number, min: 1, max: 5, required: true },
  revision: { type: Number, min: 1, required: true },
  strokeCount: { type: Number, min: 0, required: true },
  drawingData: { type: Buffer, required: true, select: false },
  file: { type: arenaMatchEvidenceFileSchema, required: true },
  finalizedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
arenaGuestSolutionBoardSchema.index({ attemptId: 1, questionSlot: 1 }, { unique: true });

const arenaPlacementAttemptAdjustmentSchema = new Schema({
  attemptId: { type: Schema.Types.ObjectId, ref: "AssessmentAttempt", required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  kind: { type: String, enum: ["SERVER_ERROR", "OPERATOR_RESET"], required: true, immutable: true },
  requestId: { type: String, required: true, maxlength: 160, immutable: true },
  authorizedBy: { type: Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  reason: { type: String, required: true, maxlength: 1000, immutable: true },
}, { timestamps: true, versionKey: false });
arenaPlacementAttemptAdjustmentSchema.index({ userId: 1, requestId: 1 });

const arenaMatchmakingEntrySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activeKey: {
      type: String,
      default: undefined,
    },
    mode: {
      type: String,
      enum: ["NORMAL", "COMPETITIVE"],
      required: true,
      index: true,
    },
    pool: { type: String, enum: ["ALL"], default: "ALL", required: true },
    ratingSnapshot: { type: Number, min: 0, required: true, index: true },
    status: {
      type: String,
      enum: ["WAITING", "MATCHING", "MATCHED", "CANCELLED", "EXPIRED"],
      default: "WAITING",
      index: true,
    },
    joinedAt: { type: Date, default: Date.now, required: true, index: true },
    heartbeatAt: { type: Date, default: Date.now },
    matchedAt: { type: Date, default: null },
    matchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", default: null },
  },
  { timestamps: true, versionKey: false }
);
arenaMatchmakingEntrySchema.index(
  { activeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  }
);
arenaMatchmakingEntrySchema.index({ mode: 1, pool: 1, status: 1, ratingSnapshot: 1, joinedAt: 1 });

const arenaRatingSettlementSchema = new Schema(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      unique: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["NORMAL", "COMPETITIVE", "FRIENDLY"],
      required: true,
    },
    outcome: {
      type: String,
      enum: ["CHALLENGER_WIN", "DEFENDER_WIN", "DRAW"],
      required: true,
    },
    challenger: { type: Schema.Types.Mixed, default: {} },
    defender: { type: Schema.Types.Mixed, default: {} },
    settledAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true, versionKey: false }
);

const arenaWeeklyMockRatingSettlementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    weekKey: { type: String, required: true, trim: true, maxlength: 40 },
    examId: { type: Schema.Types.ObjectId, ref: "PrivateMockExam", required: true },
    representativeAttemptId: {
      type: Schema.Types.ObjectId,
      ref: "PrivateMockExamAttempt",
      required: true,
    },
    performance: { type: Number, min: 0, max: 1, required: true },
    referenceRatingSnapshot: {
      type: arenaCompetitiveRatingSnapshotSchema,
      required: true,
    },
    before: { type: arenaCompetitiveRatingSnapshotSchema, required: true },
    after: { type: arenaCompetitiveRatingSnapshotSchema, required: true },
    delta: { type: Number, required: true },
    publicScoreChanged: { type: Boolean, default: false, immutable: true },
    settledAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true, versionKey: false }
);
arenaWeeklyMockRatingSettlementSchema.index(
  { userId: 1, weekKey: 1 },
  { unique: true }
);

const arenaFriendRequestSchema = new Schema(
  {
    pairKey: { type: String, required: true, index: true },
    requesterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);
arenaFriendRequestSchema.index(
  { pairKey: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } }
);

const arenaFriendshipSchema = new Schema(
  {
    pairKey: { type: String, required: true, unique: true, index: true },
    userLowId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userHighId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    acceptedRequestId: { type: Schema.Types.ObjectId, ref: "ArenaFriendRequest", required: true },
    acceptedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true, versionKey: false }
);

const arenaFriendlyInvitationV2Schema = new Schema(
  {
    requestId: { type: String, required: true, trim: true, maxlength: 160 },
    inviterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    inviteeUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    respondedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    matchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", default: null },
  },
  { timestamps: true, versionKey: false }
);
arenaFriendlyInvitationV2Schema.index({ inviterUserId: 1, requestId: 1 }, { unique: true });
arenaFriendlyInvitationV2Schema.index({ inviteeUserId: 1, status: 1, createdAt: -1 });

const ArenaPackagePayment =
  mongoose.models.ArenaPackagePayment ||
  mongoose.model(
    "ArenaPackagePayment",
    arenaPackagePaymentSchema
  );
const AppleCommerceAccountToken =
  mongoose.models.AppleCommerceAccountToken ||
  mongoose.model(
    "AppleCommerceAccountToken",
    appleCommerceAccountTokenSchema
  );
const ArenaAccessState =
  mongoose.models.ArenaAccessState ||
  mongoose.model(
    "ArenaAccessState",
    arenaAccessStateSchema
  );
const ArenaIntegrityLinkSignal =
  mongoose.models.ArenaIntegrityLinkSignal ||
  mongoose.model(
    "ArenaIntegrityLinkSignal",
    arenaIntegrityLinkSignalSchema
  );
const ArenaIntegrityRiskProfile =
  mongoose.models.ArenaIntegrityRiskProfile ||
  mongoose.model(
    "ArenaIntegrityRiskProfile",
    arenaIntegrityRiskProfileSchema
  );
const ArenaIntegrityRiskCase =
  mongoose.models.ArenaIntegrityRiskCase ||
  mongoose.model(
    "ArenaIntegrityRiskCase",
    arenaIntegrityRiskCaseSchema
  );
const ArenaMatch =
  mongoose.models.ArenaMatch ||
  mongoose.model(
    "ArenaMatch",
    arenaMatchSchema
  );
const ArenaProblemPack =
  mongoose.models.ArenaProblemPack ||
  mongoose.model(
    "ArenaProblemPack",
    arenaProblemPackSchema
  );
const ArenaProblemDataVersion =
  mongoose.models.ArenaProblemDataVersion ||
  mongoose.model(
    "ArenaProblemDataVersion",
    arenaProblemDataVersionSchema
  );
const ArenaTierQuestionCatalogVersion =
  mongoose.models.ArenaTierQuestionCatalogVersion ||
  mongoose.model(
    "ArenaTierQuestionCatalogVersion",
    arenaTierQuestionCatalogVersionSchema
  );
const ArenaMatchAttempt =
  mongoose.models.ArenaMatchAttempt ||
  mongoose.model(
    "ArenaMatchAttempt",
    arenaMatchAttemptSchema
  );
const ArenaMatchAttemptEvent =
  mongoose.models.ArenaMatchAttemptEvent ||
  mongoose.model(
    "ArenaMatchAttemptEvent",
    arenaMatchAttemptEventSchema
  );
const ArenaMatchParticipantLock =
  mongoose.models.ArenaMatchParticipantLock ||
  mongoose.model(
    "ArenaMatchParticipantLock",
    arenaMatchParticipantLockSchema
  );
const ArenaMatchEvidence =
  mongoose.models.ArenaMatchEvidence ||
  mongoose.model(
    "ArenaMatchEvidence",
    arenaMatchEvidenceSchema
  );
const ArenaInlineSolutionBoard =
  mongoose.models.ArenaInlineSolutionBoard ||
  mongoose.model(
    "ArenaInlineSolutionBoard",
    arenaInlineSolutionBoardSchema
  );
const ArenaOutboxEvent =
  mongoose.models.ArenaOutboxEvent ||
  mongoose.model(
    "ArenaOutboxEvent",
    arenaOutboxEventSchema
  );
const ArenaCompetitiveProfile =
  mongoose.models.ArenaCompetitiveProfile ||
  mongoose.model(
    "ArenaCompetitiveProfile",
    arenaCompetitiveProfileSchema
  );
const ArenaMatchmakingEntry =
  mongoose.models.ArenaMatchmakingEntry ||
  mongoose.model(
    "ArenaMatchmakingEntry",
    arenaMatchmakingEntrySchema
  );
const ArenaRatingSettlement =
  mongoose.models.ArenaRatingSettlement ||
  mongoose.model(
    "ArenaRatingSettlement",
    arenaRatingSettlementSchema
  );
const ArenaWeeklyMockRatingSettlement =
  mongoose.models.ArenaWeeklyMockRatingSettlement ||
  mongoose.model(
    "ArenaWeeklyMockRatingSettlement",
    arenaWeeklyMockRatingSettlementSchema
  );
const ArenaCompetitiveRecord =
  mongoose.models.ArenaCompetitiveRecord ||
  mongoose.model("ArenaCompetitiveRecord", arenaCompetitiveRecordSchema);
const ArenaNormalBaselineQuestion =
  mongoose.models.ArenaNormalBaselineQuestion ||
  mongoose.model(
    "ArenaNormalBaselineQuestion",
    arenaNormalBaselineQuestionSchema
  );
const ArenaNormalBaselineAssignment =
  mongoose.models.ArenaNormalBaselineAssignment ||
  mongoose.model(
    "ArenaNormalBaselineAssignment",
    arenaNormalBaselineAssignmentSchema
  );
const ArenaFriendRequest =
  mongoose.models.ArenaFriendRequest ||
  mongoose.model(
    "ArenaFriendRequest",
    arenaFriendRequestSchema
  );
const ArenaFriendship =
  mongoose.models.ArenaFriendship ||
  mongoose.model(
    "ArenaFriendship",
    arenaFriendshipSchema
  );
const ArenaFriendlyInvitationV2 =
  mongoose.models.ArenaFriendlyInvitationV2 ||
  mongoose.model(
    "ArenaFriendlyInvitationV2",
    arenaFriendlyInvitationV2Schema
  );
const ArenaNormalMatchCounter = mongoose.models.ArenaNormalMatchCounter ||
  mongoose.model("ArenaNormalMatchCounter", arenaNormalMatchCounterSchema);
const ArenaGuestIdentity = mongoose.models.ArenaGuestIdentity ||
  mongoose.model("ArenaGuestIdentity", arenaGuestIdentitySchema);
const ArenaGuestChallenge = mongoose.models.ArenaGuestChallenge ||
  mongoose.model("ArenaGuestChallenge", arenaGuestChallengeSchema);
const ArenaGuestChallengeAttempt = mongoose.models.ArenaGuestChallengeAttempt ||
  mongoose.model("ArenaGuestChallengeAttempt", arenaGuestChallengeAttemptSchema);
const ArenaGuestSolutionBoard = mongoose.models.ArenaGuestSolutionBoard ||
  mongoose.model("ArenaGuestSolutionBoard", arenaGuestSolutionBoardSchema);

const ArenaPlacementAttemptAdjustment = mongoose.models.ArenaPlacementAttemptAdjustment ||
  mongoose.model("ArenaPlacementAttemptAdjustment", arenaPlacementAttemptAdjustmentSchema);
module.exports = {
  ArenaPlacementAttemptAdjustment,
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskProfile,
  ArenaIntegrityRiskCase,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaInlineSolutionBoard,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  AppleCommerceAccountToken,
  ArenaPackagePayment,
  ArenaCompetitiveProfile,
  ArenaMatchmakingEntry,
  ArenaRatingSettlement,
  ArenaWeeklyMockRatingSettlement,
  ArenaCompetitiveRecord,
  ArenaNormalBaselineQuestion,
  ArenaNormalBaselineAssignment,
  ArenaFriendRequest,
  ArenaFriendship,
  ArenaFriendlyInvitationV2,
  ArenaNormalMatchCounter,
  ArenaGuestIdentity,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestSolutionBoard,
  ArenaProblemPack,
  ArenaProblemDataVersion,
  ArenaTierQuestionCatalogVersion,
};
