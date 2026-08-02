const mongoose = require("mongoose");

const { Schema } = mongoose;

const paybackBandSchema = new Schema(
  {
    minScoreDays: {
      type: Number,
      min: 0,
      required: true,
    },
    maxScoreDays: {
      type: Number,
      min: 0,
      default: null,
    },
    ratePercent: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
  },
  { _id: false }
);

const mainLearningDayBucketSchema = new Schema(
  {
    sourceType: {
      type: String,
      enum: [
        "SUB_CARRYOVER",
        "MAIN_ENTRY_BONUS",
        "MAIN_MATCH_TRANSFER",
      ],
      required: true,
    },
    availableDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    reservedDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    lockedDays: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

function hasValidPaybackBands(bands) {
  if (!Array.isArray(bands) || !bands.length) {
    return false;
  }

  return bands.every((band, index) => {
    const min = Number(band.minScoreDays);
    const max =
      band.maxScoreDays === null ||
      band.maxScoreDays === undefined
        ? null
        : Number(band.maxScoreDays);
    const rate = Number(band.ratePercent);
    const previous = bands[index - 1];
    const previousMax = previous
      ? Number(previous.maxScoreDays)
      : null;

    if (
      !Number.isInteger(min) ||
      min < 0 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100
    ) {
      return false;
    }
    if (
      max !== null &&
      (!Number.isInteger(max) || max < min)
    ) {
      return false;
    }
    if (index === 0 && min !== 0) {
      return false;
    }
    if (
      index > 0 &&
      (!Number.isInteger(previousMax) ||
        min !== previousMax + 1 ||
        rate < Number(previous.ratePercent))
    ) {
      return false;
    }
    if (index < bands.length - 1 && max === null) {
      return false;
    }
    return index !== bands.length - 1 || max === null;
  });
}

/*
 * 가격·학습일·페이백 기준은 코드 상수가 아니라 버전 문서로 고정합니다.
 * 이용 주기는 시작 당시 policySnapshot을 별도로 보관하므로 다음 달 정책을
 * 바꾸더라도 이미 진행 중인 이용자에게 소급 적용되지 않습니다.
 */
const subscriptionPolicyVersionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9-]{2,79}$/,
      maxlength: 80,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "RETIRED"],
      default: "DRAFT",
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveUntil: {
      type: Date,
      default: null,
    },
    currency: {
      type: String,
      default: "KRW",
      uppercase: true,
      maxlength: 3,
    },
    timezone: {
      type: String,
      default: "Asia/Seoul",
      immutable: true,
    },
    priceAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    initialLearningDays: {
      type: Number,
      min: 1,
      default: 29,
    },
    initialPaybackScoreDays: {
      type: Number,
      min: 0,
      default: 29,
    },
    paymentDayCutoffKst: {
      type: String,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
      default: "20:00",
    },
    renewalGraceHours: {
      type: Number,
      min: 0,
      default: 72,
    },
    packagePurchaseRequiresZeroBalance: {
      type: Boolean,
      default: true,
    },
    packagePurchaseRequiresZeroLockedBalance: {
      type: Boolean,
      default: true,
    },
    lateRenewalTierPenalty: {
      type: Number,
      min: 1,
      default: 1,
    },
    matchStakeDays: {
      normal: {
        type: Number,
        min: 1,
        default: 1,
      },
      revenge: {
        type: Number,
        min: 1,
        default: 2,
      },
    },
    payback: {
      minimumStreakDays: {
        type: Number,
        min: 0,
        default: 29,
      },
      minimumPaidNormalAttacks: {
        type: Number,
        min: 0,
        default: 2,
      },
      minimumScoreDays: {
        type: Number,
        min: 0,
        default: 30,
      },
      bands: {
        type: [paybackBandSchema],
        default: () => [
          {
            minScoreDays: 0,
            maxScoreDays: 29,
            ratePercent: 0,
          },
          {
            minScoreDays: 30,
            maxScoreDays: 34,
            ratePercent: 50,
          },
          {
            minScoreDays: 35,
            maxScoreDays: 39,
            ratePercent: 80,
          },
          {
            minScoreDays: 40,
            maxScoreDays: null,
            ratePercent: 100,
          },
        ],
        validate: {
          validator: hasValidPaybackBands,
          message:
            "페이백 점수 구간은 0점부터 빈틈없이 이어지고 마지막 구간에 상한이 없어야 합니다.",
        },
      },
    },
    changeSummary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
    retiredBy: {
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

subscriptionPolicyVersionSchema.index({
  status: 1,
  effectiveFrom: -1,
});

subscriptionPolicyVersionSchema.path(
  "effectiveUntil"
).validate(function validatePolicyWindow(value) {
  return (
    !value ||
    !this.effectiveFrom ||
    new Date(value) > new Date(this.effectiveFrom)
  );
}, "정책 종료 시각은 적용 시작 시각보다 뒤여야 합니다.");

const immutablePolicyDefinitionPaths = [
  "displayName",
  "effectiveFrom",
  "currency",
  "timezone",
  "priceAmount",
  "initialLearningDays",
  "initialPaybackScoreDays",
  "paymentDayCutoffKst",
  "renewalGraceHours",
  "packagePurchaseRequiresZeroBalance",
  "packagePurchaseRequiresZeroLockedBalance",
  "lateRenewalTierPenalty",
  "matchStakeDays",
  "payback",
  "changeSummary",
];

subscriptionPolicyVersionSchema.pre(
  "save",
  function preventActivatedPolicyMutation() {
    if (
      this.isNew ||
      !["ACTIVE", "RETIRED"].includes(this.status)
    ) {
      return;
    }
    if (
      immutablePolicyDefinitionPaths.some((path) =>
        this.isModified(path)
      )
    ) {
      throw new Error(
        "적용 일정에 등록했거나 종료된 Arena 정책의 조건은 수정할 수 없습니다. 새 정책을 만들어주세요."
      );
    }
  }
);

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

subscriptionPolicyVersionSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function preventActivatedPolicyQueryMutation() {
    const changedPaths = updatedPolicyPaths(
      this.getUpdate() || {}
    );
    const changesDefinition =
      immutablePolicyDefinitionPaths.some((protectedPath) =>
        [...changedPaths].some(
          (changedPath) =>
            changedPath === protectedPath ||
            changedPath.startsWith(`${protectedPath}.`)
        )
      );
    if (!changesDefinition) return;

    const current = await this.model
      .findOne(this.getQuery())
      .select("status")
      .session(this.getOptions().session || null)
      .lean();
    if (
      current &&
      ["ACTIVE", "RETIRED"].includes(current.status)
    ) {
      throw new Error(
        "적용 일정에 등록했거나 종료된 Arena 정책의 조건은 수정할 수 없습니다. 새 정책을 만들어주세요."
      );
    }
  }
);

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
    policyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPolicyVersion",
      default: null,
    },
    policyVersionCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      default: null,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

arenaPackagePaymentSchema.index(
  { provider: 1, providerPaymentKey: 1 },
  { unique: true }
);

/*
 * Matths 주간 공식 모의고사만 이용하는 월 구독 상품입니다. Arena 학습권
 * 패키지와 권한·결제 이력을 섞지 않아 배치고사와 Arena 접근이 잘못
 * 열리지 않도록 별도 정책과 이용권으로 관리합니다.
 */
const mockExamPackagePolicyVersionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "모의고사 전용 패키지",
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "RETIRED"],
      default: "DRAFT",
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveUntil: {
      type: Date,
      default: null,
    },
    currency: {
      type: String,
      default: "KRW",
      uppercase: true,
      maxlength: 3,
    },
    monthlyPriceAmount: {
      type: Number,
      min: 0,
      required: true,
      default: 5000,
    },
    billingPeriodDays: {
      type: Number,
      min: 1,
      default: 30,
    },
    weeklyMockExamAllowed: {
      type: Boolean,
      default: true,
      immutable: true,
    },
    placementExamAllowed: {
      type: Boolean,
      default: false,
      immutable: true,
    },
    goatArenaAllowed: {
      type: Boolean,
      default: false,
      immutable: true,
    },
    placementCalibrationMinimumWeeklyExams: {
      type: Number,
      min: 1,
      default: 4,
    },
    changeSummary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: { type: Date, default: null },
    activatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    retiredAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);
mockExamPackagePolicyVersionSchema.index({
  status: 1,
  effectiveFrom: -1,
});

const mockExamSubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    policyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "MockExamPackagePolicyVersion",
      required: true,
    },
    policySnapshot: {
      code: { type: String, required: true },
      monthlyPriceAmount: { type: Number, min: 0, required: true },
      currency: { type: String, default: "KRW" },
      billingPeriodDays: { type: Number, min: 1, default: 30 },
      placementCalibrationMinimumWeeklyExams: {
        type: Number,
        min: 1,
        default: 4,
      },
    },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    purchaseMode: {
      type: String,
      enum: ["SELF", "PARENT_REQUEST", "ADMIN_GRANT"],
      required: true,
    },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    activatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);
mockExamSubscriptionSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);

const accessCycleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "ACTIVE",
        "EXPIRED",
        "PAYBACK_COMPLETED",
        "CANCELLED",
      ],
      default: "PENDING",
      index: true,
    },
    policyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPolicyVersion",
      required: true,
    },
    policyVersionCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    policySnapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    currency: {
      type: String,
      default: "KRW",
    },
    pricePaid: {
      type: Number,
      min: 0,
      required: true,
    },
    purchaseReference: {
      type: String,
      trim: true,
      maxlength: 160,
      default: undefined,
    },
    paidAt: {
      type: Date,
      required: true,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    baseExpiresAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    evaluationAt: {
      type: Date,
      required: true,
      index: true,
    },
    availableLearningDays: {
      type: Number,
      min: 0,
      default: 29,
    },
    paybackScoreDays: {
      type: Number,
      min: 0,
      default: 29,
    },
    lockedLearningDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    reservedLearningDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    learningDayBuckets: {
      type: [mainLearningDayBucketSchema],
      default: [],
    },
    sourceSubCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      default: null,
    },
    mainEntryBonusGrantedAt: {
      type: Date,
      default: null,
    },
    firstConsumptionDateKst: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
    },
    firstDayMode: {
      type: String,
      enum: ["SAME_DAY", "NEXT_DAY"],
      required: true,
    },
    firstDayConsumedAt: {
      type: Date,
      default: null,
    },
    lastConsumptionDateKst: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
      index: true,
    },
    dailyConsumptionPausedAt: {
      type: Date,
      default: null,
      index: true,
    },
    depletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    paidNormalAttacksCompleted: {
      type: Number,
      min: 0,
      default: 0,
    },
    streakDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastStreakDateKst: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
      index: true,
    },
    cashbackQualified: {
      type: Boolean,
      default: false,
    },
    paybackRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    paybackAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    paybackPayoutStatus: {
      type: String,
      enum: ["NOT_APPLICABLE", "PENDING", "COMPLETED", "CANCELLED"],
      default: "NOT_APPLICABLE",
      index: true,
    },
    paybackPayoutCompletedAt: {
      type: Date,
      default: null,
    },
    paybackDisqualifiers: {
      type: [String],
      default: [],
    },
    evaluatedAt: {
      type: Date,
      default: null,
      index: true,
    },
    renewalPolicyNotice: {
      required: {
        type: Boolean,
        default: false,
      },
      previousPolicyVersionCode: {
        type: String,
        default: "",
      },
      nextPolicyVersionCode: {
        type: String,
        default: "",
      },
      message: {
        type: String,
        maxlength: 1000,
        default: "",
      },
      acknowledgedAt: {
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

accessCycleSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "ACTIVE",
    },
  }
);
accessCycleSchema.path(
  "learningDayBuckets"
).validate(function validateUniqueLearningDayBuckets(buckets) {
  const sources = (buckets || []).map(
    (bucket) => bucket.sourceType
  );
  return sources.length === new Set(sources).size;
}, "Main Division 학습일수 출처를 중복 저장할 수 없습니다.");
accessCycleSchema.index({
  policyVersionCode: 1,
  startsAt: 1,
});
accessCycleSchema.index({
  userId: 1,
  paidAt: -1,
});
accessCycleSchema.index({
  status: 1,
  firstDayConsumedAt: 1,
  firstConsumptionDateKst: 1,
});
accessCycleSchema.index({
  status: 1,
  lastConsumptionDateKst: 1,
  availableLearningDays: 1,
});
accessCycleSchema.index({
  status: 1,
  availableLearningDays: 1,
  reservedLearningDays: 1,
  lockedLearningDays: 1,
});
accessCycleSchema.index(
  { purchaseReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      purchaseReference: {
        $type: "string",
      },
    },
  }
);

/*
 * 학습권 이용 종료 예정 알림의 채널별 발송 상태입니다. 이용 주기와
 * 72·24·6시간 구간 조합을 유일하게 만들어 스케줄러 재시작과 동시
 * 실행에서도 사이트 우편함·이메일이 중복 생성되지 않게 합니다.
 */
const accessCycleExpiryReminderSchema = new Schema(
  {
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    thresholdHours: {
      type: Number,
      enum: [72, 24, 6],
      required: true,
    },
    expiryAtSnapshot: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "SENDING",
        "PARTIAL",
        "SENT",
        "SKIPPED",
        "CANCELLED",
      ],
      default: "PENDING",
      index: true,
    },
    skipReason: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },
    siteStatus: {
      type: String,
      enum: ["PENDING", "SENT", "SKIPPED", "FAILED"],
      default: "PENDING",
    },
    siteNotificationId: {
      type: Schema.Types.ObjectId,
      ref: "UserNotification",
      default: null,
    },
    siteDeliveredAt: {
      type: Date,
      default: null,
    },
    emailStatus: {
      type: String,
      enum: [
        "PENDING",
        "SENT",
        "PREVIEW",
        "SKIPPED",
        "FAILED",
      ],
      default: "PENDING",
    },
    emailAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    emailLastAttemptAt: {
      type: Date,
      default: null,
    },
    emailNextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
    emailDeliveredAt: {
      type: Date,
      default: null,
    },
    emailProviderMessageId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    emailLastError: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    deliveryAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    leaseToken: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);
accessCycleExpiryReminderSchema.index(
  { accessCycleId: 1, thresholdHours: 1 },
  { unique: true }
);
accessCycleExpiryReminderSchema.index({
  status: 1,
  emailNextRetryAt: 1,
  leaseExpiresAt: 1,
});

const arenaStandingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
      trim: true,
      maxlength: 80,
    },
    sourcePlacementAttemptId: {
      type: Schema.Types.ObjectId,
      ref: "AssessmentAttempt",
      default: null,
    },
    seedPolicyVersion: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    seedPlacementScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    seedPlacementElapsedTimeMs: {
      type: Number,
      min: 0,
      default: null,
    },
    seedPlacementMmr: {
      type: Number,
      min: 0,
      default: null,
    },
    seedPlacementStartedAt: {
      type: Date,
      default: null,
    },
    seededAt: {
      type: Date,
      default: null,
    },
    arenaRank: {
      /* 브론즈·실버처럼 사용자가 차지한 Arena 티어 */
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    arenaPosition: {
      /* 현재 Arena 티어 안에서 몇 위인지 나타내는 정확한 순위 */
      type: Number,
      min: 1,
      required: true,
    },
    arenaGp: {
      type: Number,
      min: 0,
      max: 99,
      required: true,
    },
    gpScaleVersion: {
      type: String,
      default: "TIER_LOCAL_0_99_V1",
      immutable: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "LOCKED", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    reachedCurrentGpAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

arenaStandingSchema.index(
  { userId: 1, division: 1, seasonKey: 1 },
  { unique: true }
);

const arenaCohortRevisionSchema = new Schema(
  {
    seasonKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
    },
    revision: {
      type: Number,
      min: 0,
      default: 0,
    },
    recalculatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);
arenaCohortRevisionSchema.index(
  { seasonKey: 1, division: 1 },
  { unique: true }
);
arenaStandingSchema.index({
  division: 1,
  seasonKey: 1,
  arenaRank: 1,
  arenaGp: -1,
  reachedCurrentGpAt: 1,
});
arenaStandingSchema.index(
  {
    division: 1,
    seasonKey: 1,
    arenaRank: 1,
    arenaPosition: 1,
  },
  { unique: true }
);

const arenaAccessStateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    currentCompetitiveDivision: {
      type: String,
      enum: ["SUB", "MAIN", null],
      default: null,
    },
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      default: null,
    },
    standingId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaStanding",
      default: null,
    },
    state: {
      type: String,
      enum: [
        "PAID_ACTIVE",
        "MAIN_DEMOTED_TO_SUB",
        "SUB_ACCESS_EXPIRED_LOCKED",
        "PAID_PENDING_RENEWAL_ASSESSMENT",
        "SEASON_PLACEMENT_REQUIRED",
        "PAYMENT_REQUIRED",
        "MAIN_DORMANT",
      ],
      default: "SEASON_PLACEMENT_REQUIRED",
      index: true,
    },
    mainAchievementStatus: {
      type: String,
      enum: ["NOT_ACHIEVED", "ACHIEVED"],
      default: "NOT_ACHIEVED",
    },
    currentSeasonPlacementCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    renewalGraceDeadline: {
      type: Date,
      default: null,
    },
    dormancyReturnRequiredAt: {
      type: Date,
      default: null,
    },
    dormancySourceLastLoginAt: {
      type: Date,
      default: null,
    },
    lastMainQualifyingActivityAt: {
      type: Date,
      default: null,
      index: true,
    },
    mainInactivityStartedAt: {
      type: Date,
      default: null,
      index: true,
    },
    mainInactivityStartAvailableDays: {
      type: Number,
      min: 0,
      default: null,
    },
    mainDormancyStartedAt: {
      type: Date,
      default: null,
      index: true,
    },
    mainDormancyFrozenLearningDays: {
      type: Number,
      min: 0,
      default: null,
    },
    mainDormancyRecoveryMode: {
      type: String,
      enum: ["RESUME_MAIN", "SUB_STANDARD_FLOW", null],
      default: null,
    },
    lastMainSnapshotId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaSnapshot",
      default: null,
    },
    referenceSubPlacementId: {
      type: Schema.Types.ObjectId,
      ref: "MainToSubConversionResult",
      default: null,
    },
    defensePoolEligible: {
      type: Boolean,
      default: false,
    },
    weeklyMockEligible: {
      type: Boolean,
      default: false,
    },
    finalRankingActive: {
      type: Boolean,
      default: false,
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
        "PAYBACK_ACCOUNT",
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

const arenaLearningDayLedgerSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      unique: true,
    },
    eventType: {
      type: String,
      enum: [
        "PURCHASE_GRANTED",
        "FIRST_DAY_CONSUMPTION",
        "DAILY_ACCESS_CONSUMPTION",
        "MATCH_STAKE_LOCKED",
        "MATCH_STAKE_RELEASED",
        "MATCH_SETTLEMENT_TRANSFER",
        "MATCH_SETTLEMENT_BURN",
        "MAIN_CARRYOVER_GRANTED",
        "MAIN_ENTRY_BONUS_GRANTED",
        "MAIN_INVITATION_RESERVE",
        "MAIN_INVITATION_RELEASE",
        "MAIN_INVITATION_TO_MATCH_LOCK",
        "MAIN_INVITATION_CANCELLATION_FEE_BURN",
        "REVENGE_STAKE_LOCKED",
        "REVENGE_STAKE_RELEASED",
        "REVENGE_FEE_BURN",
        "REVENGE_NO_SHOW_PARTIAL_REFUND",
        "SHOP_ITEM_PURCHASE_BURN",
        "SHOP_ITEM_PURCHASE_REVERSAL",
        "SHOP_ITEM_EFFECT_APPLIED",
        "SHOP_ITEM_EFFECT_EXPIRED",
        "SHOP_ITEM_EFFECT_CANCELLED",
        "DEFENSE_SCHEDULE_PROTECTION_COMPENSATION_TRANSFER",
        "DEFENSE_SCHEDULE_PROTECTION_BURN",
        "DEFENSE_SCHEDULE_PROTECTION_DEPOSIT_RELEASE",
        "BONUS_GRANTED",
        "ADMIN_ADJUSTMENT",
      ],
      required: true,
      index: true,
    },
    availableLearningDaysDelta: {
      type: Number,
      default: 0,
    },
    paybackScoreDaysDelta: {
      type: Number,
      default: 0,
    },
    lockedLearningDaysDelta: {
      type: Number,
      default: 0,
    },
    reservedLearningDaysDelta: {
      type: Number,
      default: 0,
    },
    sourceBucket: {
      type: String,
      enum: [
        "UNSPECIFIED",
        "PACKAGE_BASE",
        "SUB_CARRYOVER",
        "MAIN_ENTRY_BONUS",
        "MAIN_MATCH_TRANSFER",
      ],
      default: "UNSPECIFIED",
    },
    balanceAfter: {
      availableLearningDays: {
        type: Number,
        min: 0,
        required: true,
      },
      paybackScoreDays: {
        type: Number,
        min: 0,
        required: true,
      },
      lockedLearningDays: {
        type: Number,
        min: 0,
        required: true,
      },
      reservedLearningDays: {
        type: Number,
        min: 0,
        default: 0,
      },
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
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
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

arenaLearningDayLedgerSchema.index({
  accessCycleId: 1,
  occurredAt: 1,
});

const mainStakeBandSchema = new Schema(
  {
    tierGap: {
      type: Number,
      min: 1,
      required: true,
    },
    stakeDays: {
      type: Number,
      min: 1,
      required: true,
    },
  },
  { _id: false }
);

const mainDivisionPolicyVersionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9-]{2,79}$/,
      maxlength: 80,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "RETIRED"],
      default: "DRAFT",
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveUntil: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      default: "Asia/Seoul",
      immutable: true,
    },
    mainEntryBonusDays: {
      type: Number,
      min: 0,
      default: 2,
    },
    mainCarryoverBaseDays: {
      type: Number,
      min: 0,
      default: 29,
    },
    stakeDaysByTierGap: {
      type: [mainStakeBandSchema],
      default: () => [
        { tierGap: 1, stakeDays: 1 },
        { tierGap: 2, stakeDays: 2 },
        { tierGap: 3, stakeDays: 3 },
      ],
    },
    maximumTargetTierGap: {
      type: Number,
      min: 1,
      default: 3,
    },
    unlimitedDailyAttacks: {
      type: Boolean,
      default: true,
    },
    unlimitedDailyDefenses: {
      type: Boolean,
      default: true,
    },
    maximumNetGainPerCycle: {
      type: Number,
      min: 0,
      default: null,
    },
    invitationRequestExpiresAt: {
      type: Date,
      default: null,
    },
    invitationOfferBatchSize: {
      type: Number,
      min: 1,
      default: null,
    },
    invitationCancellationFeeDays: {
      type: Number,
      min: 0,
      default: 1,
    },
    manualInvitationCancellationAllowed: {
      type: Boolean,
      default: true,
    },
    manualInvitationCancellationFeeDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    repeatOpponentExclusionDays: {
      type: Number,
      min: 0,
      default: 7,
    },
    maximumActiveInvitationReservationsPerTargetTier: {
      type: Number,
      min: 1,
      max: 1,
      default: 1,
    },
    requiresServerRandomOpponent: {
      type: Boolean,
      default: true,
    },
    requiresOpponentDaysGreaterThanStake: {
      type: Boolean,
      default: true,
    },
    revengeStakeMultiplier: {
      type: Number,
      min: 1,
      default: 2,
    },
    revengeFeeDays: {
      type: Number,
      min: 0,
      default: 1,
    },
    maximumUnresolvedOfficialMatches: {
      type: Number,
      min: 1,
      default: 1,
    },
    scoringPolicyVersion: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "SUB-STANDARD-V1",
    },
    changeSummary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
    retiredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

mainDivisionPolicyVersionSchema.path(
  "stakeDaysByTierGap"
).validate(function validateUniqueMainTierGaps(bands) {
  const gaps = (bands || []).map((band) => Number(band.tierGap));
  return gaps.length === new Set(gaps).size;
}, "Main Division 티어 차이별 예치 기준표에 같은 티어 차이를 중복할 수 없습니다.");

mainDivisionPolicyVersionSchema.path(
  "status"
).validate(function validateActiveMainPolicyCompleteness(status) {
  if (status !== "ACTIVE") return true;
  const maximumGap = Number(
    this.maximumTargetTierGap
  );
  const gaps = (this.stakeDaysByTierGap || [])
    .map((band) => Number(band.tierGap))
    .sort((left, right) => left - right);
  return (
    Number.isInteger(maximumGap) &&
    maximumGap > 0 &&
    gaps.length === maximumGap &&
    gaps.every(
      (gap, index) => gap === index + 1
    )
  );
}, "Main Division 활성 정책에는 티어별 예치 기준표와 최대 공격 티어 차이가 필요합니다.");

mainDivisionPolicyVersionSchema.path(
  "effectiveUntil"
).validate(function validateMainPolicyWindow(value) {
  return (
    !value ||
    !this.effectiveFrom ||
    new Date(value) > new Date(this.effectiveFrom)
  );
}, "Main Division 정책 종료 시각은 적용 시작 시각보다 뒤여야 합니다.");

mainDivisionPolicyVersionSchema.index({
  status: 1,
  effectiveFrom: -1,
});

const immutableMainPolicyDefinitionPaths = [
  "displayName",
  "effectiveFrom",
  "timezone",
  "mainEntryBonusDays",
  "mainCarryoverBaseDays",
  "stakeDaysByTierGap",
  "maximumTargetTierGap",
  "unlimitedDailyAttacks",
  "unlimitedDailyDefenses",
  "maximumNetGainPerCycle",
  "invitationRequestExpiresAt",
  "invitationOfferBatchSize",
  "invitationCancellationFeeDays",
  "manualInvitationCancellationAllowed",
  "manualInvitationCancellationFeeDays",
  "repeatOpponentExclusionDays",
  "maximumActiveInvitationReservationsPerTargetTier",
  "requiresServerRandomOpponent",
  "requiresOpponentDaysGreaterThanStake",
  "revengeStakeMultiplier",
  "revengeFeeDays",
  "maximumUnresolvedOfficialMatches",
  "scoringPolicyVersion",
  "changeSummary",
];

mainDivisionPolicyVersionSchema.pre(
  "save",
  function preventActivatedMainPolicyMutation() {
    if (
      this.isNew ||
      !["ACTIVE", "RETIRED"].includes(this.status)
    ) {
      return;
    }
    if (
      immutableMainPolicyDefinitionPaths.some((path) =>
        this.isModified(path)
      )
    ) {
      throw new Error(
        "활성화했거나 종료된 Main Division 정책은 수정할 수 없습니다. 새 버전을 만들어주세요."
      );
    }
  }
);

mainDivisionPolicyVersionSchema.pre(
  ["findOneAndUpdate", "updateOne"],
  async function preventActivatedMainPolicyQueryMutation() {
    const changedPaths = updatedPolicyPaths(
      this.getUpdate() || {}
    );
    const changesDefinition =
      immutableMainPolicyDefinitionPaths.some(
        (protectedPath) =>
          [...changedPaths].some(
            (changedPath) =>
              changedPath === protectedPath ||
              changedPath.startsWith(
                `${protectedPath}.`
              )
          )
      );
    if (!changesDefinition) return;
    const current = await this.model
      .findOne(this.getQuery())
      .select("status")
      .session(this.getOptions().session || null)
      .lean();
    if (
      current &&
      ["ACTIVE", "RETIRED"].includes(
        current.status
      )
    ) {
      throw new Error(
        "활성화했거나 종료된 Main Division 정책은 수정할 수 없습니다. 새 버전을 만들어주세요."
      );
    }
  }
);

const mainInvitationRequestSchema = new Schema(
  {
    requestId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    initiatorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    initiatorStandingId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaStanding",
      required: true,
    },
    initiatorArenaTier: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    targetTier: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
      index: true,
    },
    stakeDays: {
      type: Number,
      min: 1,
      required: true,
    },
    policyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "MainDivisionPolicyVersion",
      required: true,
    },
    policyVersionCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: [
        "SEARCHING",
        "OFFERED",
        "PAUSED",
        "MATCH_FORMING",
        "MATCHED",
        "CANCELLED",
        "INVALID",
      ],
      default: "SEARCHING",
      index: true,
    },
    reservedLearningDays: {
      type: Number,
      min: 0,
      required: true,
    },
    selectedCandidateId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    acceptedCandidateId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    matchedOfferId: {
      type: Schema.Types.ObjectId,
      ref: "MainInvitationOffer",
      default: null,
    },
    candidatePoolSnapshot: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
      select: false,
    },
    candidatePoolHash: {
      type: String,
      trim: true,
      maxlength: 128,
      default: "",
    },
    selectionPolicyVersion: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    randomSelectionSeed: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
      select: false,
    },
    requestExpiresAt: {
      type: Date,
      default: null,
    },
    selectedAt: {
      type: Date,
      default: null,
    },
    matchedAt: {
      type: Date,
      default: null,
    },
    acceleratedAt: {
      type: Date,
      default: null,
      index: true,
    },
    accelerationEndsAt: {
      type: Date,
      default: null,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    resumedAt: {
      type: Date,
      default: null,
    },
    cancellationFeeDays: {
      type: Number,
      min: 0,
      default: 1,
    },
    releasedLearningDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    burnedLearningDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    activeReservationKey: {
      type: String,
      trim: true,
      maxlength: 180,
      default: undefined,
      select: false,
    },
  },
  { timestamps: true, versionKey: false }
);

mainInvitationRequestSchema.index({
  status: 1,
  targetTier: 1,
  createdAt: 1,
});
mainInvitationRequestSchema.index(
  { initiatorUserId: 1, requestId: 1 },
  { unique: true }
);
mainInvitationRequestSchema.index(
  { activeReservationKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      activeReservationKey: { $type: "string" },
    },
  }
);
mainInvitationRequestSchema.pre(
  "validate",
  function maintainActiveInvitationReservationKey() {
    const activeStatuses = new Set([
      "SEARCHING",
      "OFFERED",
      "PAUSED",
      "MATCH_FORMING",
    ]);
    this.activeReservationKey = activeStatuses.has(this.status)
      ? `${String(this.initiatorUserId)}:${String(this.targetTier).trim().toUpperCase()}`
      : undefined;
  }
);
mainInvitationRequestSchema.path(
  "requestExpiresAt"
).validate(
  (value) => value === null || value === undefined,
  "Main Division 하위 티어 초대 예약에는 고정 만료시각을 둘 수 없습니다."
);

const arenaOpponentSelectionAuditSchema = new Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 160,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
      index: true,
    },
    selectionType: {
      type: String,
      enum: [
        "SUB_UPWARD_AUTO_MATCH",
        "MAIN_UPWARD_AUTO_MATCH",
        "MAIN_LOWER_INVITATION_BATCH",
      ],
      required: true,
      index: true,
    },
    requesterUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetTier: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    candidateUserIds: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
      select: false,
    },
    selectedUserIds: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    candidatePoolHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    randomSelectionSeed: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      select: false,
    },
    policyVersionCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    selectedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  { timestamps: true, versionKey: false }
);

const mainInvitationOfferSchema = new Schema(
  {
    invitationRequestId: {
      type: Schema.Types.ObjectId,
      ref: "MainInvitationRequest",
      required: true,
      index: true,
    },
    candidateUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    selectionAuditId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaOpponentSelectionAudit",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "OFFERED",
        "ACCEPTED",
        "DECLINED",
        "SUPERSEDED",
        "INELIGIBLE",
        "PAUSED",
      ],
      default: "OFFERED",
      index: true,
    },
    offeredAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    responseReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true, versionKey: false }
);
mainInvitationOfferSchema.index(
  { invitationRequestId: 1, candidateUserId: 1 },
  { unique: true }
);
mainInvitationOfferSchema.index(
  { invitationRequestId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "ACCEPTED",
    },
  }
);

const arenaRevengeRightSchema = new Schema(
  {
    sourceMatchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      required: true,
      unique: true,
      index: true,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
      index: true,
    },
    eligibleUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    opponentUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "AVAILABLE",
        "CLAIMED",
        "FORFEITED",
        "CONSUMED",
        "CANCELLED",
      ],
      default: "AVAILABLE",
      index: true,
    },
    originalStakeDays: {
      type: Number,
      min: 1,
      required: true,
    },
    revengeStakeDays: {
      type: Number,
      min: 1,
      required: true,
    },
    feeDays: {
      type: Number,
      min: 0,
      required: true,
    },
    policyVersionCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    decisionIdempotencyKey: {
      type: String,
      trim: true,
      maxlength: 160,
      default: undefined,
    },
    revengeMatchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      default: null,
    },
    claimedAt: { type: Date, default: null },
    forfeitedAt: { type: Date, default: null },
    completionDeadlineAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);
arenaRevengeRightSchema.index(
  { decisionIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      decisionIdempotencyKey: { $type: "string" },
    },
  }
);

/*
 * 아래 모델은 1대1 정산을 바로 구현하기 위한 코드가 아니라, 문서의
 * 권위 경계와 멱등 키를 먼저 고정하는 foundation schema입니다.
 */
const finalRankingPolicyVersionSchema =
  new Schema(
    {
      code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
      status: {
        type: String,
        enum: ["DRAFT", "ACTIVE", "RETIRED"],
        default: "DRAFT",
        index: true,
      },
      effectiveFrom: {
        type: Date,
        required: true,
        index: true,
      },
      weeklyMockBonusCompleted: {
        type: Number,
        default: 30,
      },
      weeklyMockBonusMissed: {
        type: Number,
        default: 0,
      },
      divisionLockStartsAt: {
        type: String,
        default: "SUNDAY_15_00",
      },
      divisionLockEndsAt: {
        type: String,
        default: "MONDAY_00_00",
      },
      softResetCenter: {
        type: Number,
        default: 1500,
      },
      softResetRetention: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.6,
      },
    },
    { timestamps: true, versionKey: false }
  );

const arenaTupleSchema = new Schema(
  {
    arenaRank: {
      type: String,
      required: true,
      trim: true,
    },
    arenaPosition: {
      type: Number,
      min: 1,
      required: true,
    },
    arenaGp: {
      type: Number,
      min: 0,
      max: 99,
      required: true,
    },
    gpScaleVersion: {
      type: String,
      default: "TIER_LOCAL_0_99_V1",
      immutable: true,
    },
  },
  { _id: false }
);

const arenaSnapshotSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      default: null,
    },
    seasonKey: {
      type: String,
      required: true,
      trim: true,
    },
    division: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
    },
    arenaTuple: {
      type: arenaTupleSchema,
      required: true,
    },
    participantCount: {
      type: Number,
      min: 0,
      required: true,
    },
    overallPosition: {
      type: Number,
      min: 1,
      default: null,
    },
    positionReachedAt: {
      type: Date,
      default: null,
    },
    percentile: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    finalRating: {
      type: Number,
      default: null,
    },
    snapshotReason: {
      type: String,
      enum: [
        "ACCESS_EXPIRED",
        "MAIN_DEMOTION",
        "SEASON_ARCHIVE",
        "ADMIN_REVIEW",
      ],
      required: true,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

arenaSnapshotSchema.index(
  { accessCycleId: 1, snapshotReason: 1 },
  {
    unique: true,
    partialFilterExpression: {
      accessCycleId: { $type: "objectId" },
    },
  }
);

const mainToSubConversionPolicySchema =
  new Schema(
    {
      version: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
      status: {
        type: String,
        enum: ["DRAFT", "ACTIVE", "RETIRED"],
        default: "DRAFT",
        index: true,
      },
      effectiveAt: {
        type: Date,
        required: true,
      },
      mainPercentileBands: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      subRankMappings: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      subGpSeedRules: {
        type: Schema.Types.Mixed,
        default: {},
      },
      maximumSubRank: {
        type: String,
        default: "",
      },
    },
    { timestamps: true, versionKey: false }
  );

const mainToSubConversionResultSchema =
  new Schema(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      sourceMainSnapshotId: {
        type: Schema.Types.ObjectId,
        ref: "ArenaSnapshot",
        required: true,
        unique: true,
      },
      policyVersion: {
        type: String,
        required: true,
      },
      referenceSubRank: {
        type: String,
        required: true,
      },
      referenceSubPositionBand: {
        type: String,
        required: true,
      },
      mainPercentile: {
        type: Number,
        min: 0,
        max: 1,
        required: true,
      },
      referenceSubOverallPosition: {
        type: Number,
        min: 1,
        required: true,
      },
      subParticipantCountAtConversion: {
        type: Number,
        min: 0,
        required: true,
      },
      referenceSubGp: {
        type: Number,
        min: 0,
        required: true,
      },
      referenceSubPercentile: {
        type: Number,
        min: 0,
        max: 1,
        required: true,
      },
      renewalGraceDeadline: {
        type: Date,
        required: true,
      },
      snapshotValid: {
        type: Boolean,
        default: true,
      },
      integrityStatus: {
        type: String,
        enum: ["CLEAR", "HELD", "INVALID"],
        default: "CLEAR",
      },
    },
    { timestamps: true, versionKey: false }
  );

const renewalRankAssessmentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
      unique: true,
    },
    sourceMainSnapshotId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaSnapshot",
      required: true,
    },
    referenceSubPlacementId: {
      type: Schema.Types.ObjectId,
      ref: "MainToSubConversionResult",
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    score: {
      type: Number,
      default: null,
    },
    integrityStatus: {
      type: String,
      enum: ["PENDING", "CLEAR", "HELD", "INVALID"],
      default: "PENDING",
    },
    examDerivedSubPlacement: {
      type: arenaTupleSchema,
      default: null,
    },
    lateRenewalCeiling: {
      type: arenaTupleSchema,
      default: null,
    },
    finalSubPlacement: {
      type: arenaTupleSchema,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "REQUIRED",
        "IN_PROGRESS",
        "SUBMITTED",
        "HELD",
        "COMPLETED",
        "INVALID",
      ],
      default: "REQUIRED",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

const liveFinalRankingProfileSchema = new Schema(
  {
    seasonId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accessState: {
      type: String,
      required: true,
    },
    currentCompetitiveDivision: {
      type: String,
      enum: ["SUB", "MAIN"],
      required: true,
    },
    skillMmr: {
      type: Number,
      required: true,
    },
    weeklyMockBonus: {
      type: Number,
      default: 0,
    },
    stagedWeeklyMockBonus: {
      type: Number,
      default: null,
    },
    publishedWeeklyMockBonus: {
      type: Number,
      default: 0,
    },
    seasonSubStartPercentile: Number,
    seasonSubCurrentPercentile: Number,
    seasonSubEndPercentile: Number,
    seasonMainStartPercentile: Number,
    seasonMainCurrentPercentile: Number,
    referenceSubPercentile: Number,
    actualRenewalSubPercentile: Number,
    frozenSubGrowth: {
      type: Number,
      default: 0,
    },
    seasonSettledNormalAttackCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    temporaryAdjustment: {
      type: Number,
      default: 0,
    },
    finalRating: {
      type: Number,
      required: true,
    },
    finalRank: {
      type: Number,
      min: 1,
      required: true,
    },
    stagedFinalRating: {
      type: Number,
      default: null,
    },
    stagedFinalRank: {
      type: Number,
      min: 1,
      default: null,
    },
    publishedFinalRating: {
      type: Number,
      default: null,
    },
    publishedFinalRank: {
      type: Number,
      min: 1,
      default: null,
    },
    previousPublishedFinalRating: {
      type: Number,
      default: null,
    },
    previousPublishedFinalRank: {
      type: Number,
      min: 1,
      default: null,
    },
    lastPublishedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "ACTIVE",
        "INACTIVE_ACCESS_EXPIRED",
        "INACTIVE_PLACEMENT_REQUIRED",
        "INACTIVE_DORMANT",
        "PENDING_RENEWAL_RANK_ASSESSMENT",
        "SUNDAY_DISPLAY_FROZEN",
      ],
      required: true,
      index: true,
    },
    calculationKey: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true, versionKey: false }
);
liveFinalRankingProfileSchema.index(
  { seasonId: 1, userId: 1 },
  { unique: true }
);

const mainShopPolicyItemSchema = new Schema(
  {
    itemCode: { type: String, required: true, trim: true, uppercase: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    priceDays: { type: Number, min: 1, required: true },
    enabled: { type: Boolean, default: true },
    releasePhase: { type: Number, min: 1, max: 2, default: 1 },
  },
  { _id: false }
);

const mainShopPolicyVersionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "RETIRED"],
      default: "DRAFT",
      index: true,
    },
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveUntil: { type: Date, default: null, index: true },
    timezone: { type: String, default: "Asia/Seoul" },
    items: { type: [mainShopPolicyItemSchema], default: [] },
    defenseConvenienceCooldownDays: { type: Number, min: 1, default: 7 },
    cosmeticRolloverWindowDays: { type: Number, min: 0, default: 10 },
    analysisTimeoutMs: { type: Number, min: 1000, default: 5 * 60 * 1000 },
    analysisMaximumRetries: { type: Number, min: 0, default: 2 },
    changeSummary: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true, versionKey: false }
);
mainShopPolicyVersionSchema.index({ status: 1, effectiveFrom: -1 });
mainShopPolicyVersionSchema.path("items").validate(function validateUniqueShopItems(items) {
  const codes = (items || []).map((item) => String(item.itemCode || "").toUpperCase());
  return codes.length > 0 && codes.length === new Set(codes).size;
}, "Main Division 상점 정책에는 중복되지 않은 아이템이 하나 이상 필요합니다.");

const mainShopPurchaseSchema = new Schema(
  {
    purchaseKey: { type: String, required: true, unique: true, trim: true, maxlength: 180 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accessCycleId: { type: Schema.Types.ObjectId, ref: "AccessCycle", required: true, index: true },
    itemCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    itemDisplayName: { type: String, required: true, trim: true, maxlength: 120 },
    policyVersionId: { type: Schema.Types.ObjectId, ref: "MainShopPolicyVersion", required: true },
    policyVersionCode: { type: String, required: true, trim: true, maxlength: 80 },
    priceDays: { type: Number, min: 1, required: true },
    beforeAvailableDays: { type: Number, min: 0, required: true },
    afterAvailableDays: { type: Number, min: 0, required: true },
    relatedMatchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", default: null, index: true },
    relatedInvitationId: { type: Schema.Types.ObjectId, ref: "MainInvitationRequest", default: null },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "REVERSED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    purchasedAt: { type: Date, required: true, default: Date.now },
    reversedAt: { type: Date, default: null },
    reversalReason: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const mainShopEffectSchema = new Schema(
  {
    purchaseId: { type: Schema.Types.ObjectId, ref: "MainShopPurchase", required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "APPLIED", "EXPIRED", "CANCELLED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    startsAt: { type: Date, required: true, default: Date.now },
    endsAt: { type: Date, default: null, index: true },
    relatedMatchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", default: null, index: true },
    relatedInvitationId: { type: Schema.Types.ObjectId, ref: "MainInvitationRequest", default: null, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    appliedAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);
mainShopEffectSchema.index({ userId: 1, itemCode: 1, status: 1 });

const arenaMatchParticipantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    standingId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaStanding",
      required: true,
    },
    accessCycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
    },
    tupleBefore: {
      type: arenaTupleSchema,
      required: true,
    },
    stakeDays: {
      type: Number,
      min: 0,
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
    category: {
      type: String,
      enum: ["semi-killer"],
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
      checkedAt: {
        type: Date,
        required: true,
      },
    },
  },
  { _id: false }
);

/*
 * Sub Division 문제는 신청 순간 JS 생성기 검산을 통과해야 합니다.
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
      enum: ["NORMAL", "REVENGE"],
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
      enum: ["AUTO_ON_CHALLENGE", "LEGACY_MANUAL"],
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
    return (
      questions.length === Number(this.questionCount) &&
      new Set(keys).size === keys.length &&
      new Set(typeIds).size === typeIds.length &&
      questions.every(
        (question) =>
          question.category === "semi-killer" &&
          question.validation?.passed === true &&
          question.validation?.solvable === true &&
          question.validation?.uniqueAnswer === true &&
          question.validation?.calculatorFree === true &&
          question.validation?.answerMatches === true
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
      enum: ["COMMON"],
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

const arenaMatchEconomySnapshotSchema = new Schema(
  {
    originalStakeDays: { type: Number, min: 0, default: 0 },
    challengerStakeDays: { type: Number, min: 0, default: 0 },
    defenderStakeDays: { type: Number, min: 0, default: 0 },
    revengeStakeMultiplier: { type: Number, min: 1, default: 1 },
    feeDays: { type: Number, min: 0, default: 0 },
    recipientNoShowReturnDays: { type: Number, min: 0, default: 0 },
    recipientNoShowBurnDays: { type: Number, min: 0, default: 0 },
    bronzeChallengerWinRefundDays: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
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

const arenaMatchSchema = new Schema(
  {
    matchKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 200,
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
    matchType: {
      type: String,
      enum: ["NORMAL", "REVENGE"],
      required: true,
    },
    matchOrigin: {
      type: String,
      enum: [
        "SUB_UPWARD_AUTO_MATCH",
        "MAIN_UPWARD_AUTO_MATCH",
        "MAIN_LOWER_INVITATION",
        "REVENGE",
      ],
      default: "SUB_UPWARD_AUTO_MATCH",
      index: true,
    },
    requestInitiatorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetTier: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    selectionAuditId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaOpponentSelectionAudit",
      default: null,
    },
    invitationRequestId: {
      type: Schema.Types.ObjectId,
      ref: "MainInvitationRequest",
      default: null,
    },
    revengeRightId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaRevengeRight",
      default: null,
    },
    originalMatchId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaMatch",
      default: null,
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
        "INSURED_CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },
    policyVersionCode: {
      type: String,
      required: true,
    },
    subscriptionPolicyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPolicyVersion",
      default: null,
    },
    subscriptionPolicyVersionCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    divisionPolicyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "MainDivisionPolicyVersion",
      default: null,
    },
    divisionPolicyVersionCode: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    economySnapshot: {
      type: arenaMatchEconomySnapshotSchema,
      default: () => ({}),
    },
    resultSnapshot: {
      type: arenaMatchResultSnapshotSchema,
      default: null,
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

arenaMatchSchema.index({
  status: 1,
  "challenger.userId": 1,
});
arenaMatchSchema.index({
  status: 1,
  "defender.userId": 1,
});

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
      enum: ["LOCAL", "CLOUDINARY", "PURGED"],
      default: "LOCAL",
    },
    storagePurpose: {
      type: String,
      enum: ["GENERIC", "USER_ARENA_EVIDENCE"],
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
        validator: (files) =>
          Array.isArray(files) && files.length >= 1 && files.length <= 5,
        message: "풀이 증거는 1장 이상 5장 이하로 제출해야 합니다.",
      },
    },
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["ON_TIME", "ANOMALY_FLAGGED", "REVIEWED"],
      default: "ON_TIME",
      index: true,
    },
    anomalyFlags: { type: [String], default: [] },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    retentionUntil: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      index: true,
    },
    retentionHoldReason: { type: String, trim: true, maxlength: 200, default: "" },
    contentPurgedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

arenaMatchEvidenceSchema.index({
  retentionUntil: 1,
  contentPurgedAt: 1,
  status: 1,
});

const arenaStandingChangeLedgerSchema =
  new Schema(
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
      },
      idempotencyKey: {
        type: String,
        required: true,
        unique: true,
      },
      changeType: {
        type: String,
        enum: ["TUPLE_SWAP", "NO_TUPLE_WRITE", "ADJUSTMENT"],
        required: true,
      },
      tupleBefore: {
        type: arenaTupleSchema,
        required: true,
      },
      tupleAfter: {
        type: arenaTupleSchema,
        required: true,
      },
      occurredAt: {
        type: Date,
        default: Date.now,
        immutable: true,
      },
    },
    { timestamps: true, versionKey: false }
  );

const arenaPaybackReviewSchema = new Schema(
  {
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: "AccessCycle",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    evaluationVersion: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "QUALIFIED", "NOT_QUALIFIED", "HELD"],
      default: "PENDING",
      index: true,
    },
    evaluatedInputs: {
      type: Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: Schema.Types.Mixed,
      default: {},
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);
arenaPaybackReviewSchema.index(
  { cycleId: 1, evaluationVersion: 1 },
  { unique: true }
);

const arenaAchievementBadgeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    badgeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    seasonKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    sourceType: {
      type: String,
      enum: ["MAIN_SEASON_REWARD", "MAIN_ACHIEVEMENT", "ADMIN_GRANT"],
      required: true,
    },
    awardedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true, versionKey: false }
);
arenaAchievementBadgeSchema.index(
  { userId: 1, badgeCode: 1, seasonKey: 1 },
  { unique: true }
);

const arenaOutboxEventSchema = new Schema(
  {
    eventType: {
      type: String,
      enum: [
        "LearningDaysDepleted",
        "MainDemotedToSub",
        "AccessExpired",
        "RenewalPaymentCompleted",
        "RenewalGraceQualified",
        "RenewalGraceExpired",
        "MainToSubConverted",
        "RenewalRankAssessmentRequired",
        "RenewalRankAssessmentCompleted",
        "SubReentryActivated",
        "FirstDayConsumed",
        "WeeklyMockAccessDenied",
        "ArenaPlacementCompleted",
        "ArenaMatchCreated",
        "ArenaMatchReady",
        "ArenaAttemptStarted",
        "ArenaAttemptSubmitted",
        "ArenaMatchSubmitted",
        "ArenaEvidenceSubmitted",
        "ArenaEvidenceAnomalyDetected",
        "ArenaMatchNoShowDetected",
        "ArenaMatchSettled",
        "ArenaOpponentSelected",
        "MainInvitationCreated",
        "MainInvitationOffered",
        "MainInvitationAccepted",
        "MainInvitationDeclined",
        "MainInvitationSuperseded",
        "MainInvitationPaused",
        "MainInvitationResumed",
        "MainInvitationCancelled",
        "ArenaRevengeRightCreated",
        "ArenaRevengeClaimed",
        "ArenaRevengeForfeited",
        "ArenaRevengeMatchCreated",
        "ArenaRevengeNoShowSettled",
        "ArenaPaybackQualified",
        "ArenaPaybackNotQualified",
        "ArenaPaybackPayoutCompleted",
        "MainEntryActivated",
        "FinalRankingRecalculated",
        "FinalRankingFrozen",
        "FinalRankingPublished",
        "ArenaSeasonArchived",
        "ArenaSeasonOpened",
        "ArenaDormancyReturnRequired",
        "MainQualifyingActivityRecorded",
        "MainDormancyStarted",
        "MainDormancyResumed",
        "MainDormancyDemotedToSub",
        "ArenaMatchInsuredCancelled",
        "MainShopItemPurchased",
        "MainShopItemReversed",
        "MainShopEffectApplied",
        "MainShopEffectExpired",
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
  },
  { timestamps: true, versionKey: false }
);

const SubscriptionPolicyVersion =
  mongoose.models.SubscriptionPolicyVersion ||
  mongoose.model(
    "SubscriptionPolicyVersion",
    subscriptionPolicyVersionSchema
  );
const ArenaPackagePayment =
  mongoose.models.ArenaPackagePayment ||
  mongoose.model(
    "ArenaPackagePayment",
    arenaPackagePaymentSchema
  );
const MockExamPackagePolicyVersion =
  mongoose.models.MockExamPackagePolicyVersion ||
  mongoose.model(
    "MockExamPackagePolicyVersion",
    mockExamPackagePolicyVersionSchema
  );
const MockExamSubscription =
  mongoose.models.MockExamSubscription ||
  mongoose.model(
    "MockExamSubscription",
    mockExamSubscriptionSchema
  );
const AccessCycle =
  mongoose.models.AccessCycle ||
  mongoose.model("AccessCycle", accessCycleSchema);
const AccessCycleExpiryReminder =
  mongoose.models.AccessCycleExpiryReminder ||
  mongoose.model(
    "AccessCycleExpiryReminder",
    accessCycleExpiryReminderSchema
  );
const ArenaStanding =
  mongoose.models.ArenaStanding ||
  mongoose.model(
    "ArenaStanding",
    arenaStandingSchema
  );
const ArenaCohortRevision =
  mongoose.models.ArenaCohortRevision ||
  mongoose.model(
    "ArenaCohortRevision",
    arenaCohortRevisionSchema
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
const ArenaLearningDayLedger =
  mongoose.models.ArenaLearningDayLedger ||
  mongoose.model(
    "ArenaLearningDayLedger",
    arenaLearningDayLedgerSchema
  );
const MainDivisionPolicyVersion =
  mongoose.models.MainDivisionPolicyVersion ||
  mongoose.model(
    "MainDivisionPolicyVersion",
    mainDivisionPolicyVersionSchema
  );
const MainInvitationRequest =
  mongoose.models.MainInvitationRequest ||
  mongoose.model(
    "MainInvitationRequest",
    mainInvitationRequestSchema
  );
const ArenaOpponentSelectionAudit =
  mongoose.models.ArenaOpponentSelectionAudit ||
  mongoose.model(
    "ArenaOpponentSelectionAudit",
    arenaOpponentSelectionAuditSchema
  );
const MainInvitationOffer =
  mongoose.models.MainInvitationOffer ||
  mongoose.model(
    "MainInvitationOffer",
    mainInvitationOfferSchema
  );
const ArenaRevengeRight =
  mongoose.models.ArenaRevengeRight ||
  mongoose.model(
    "ArenaRevengeRight",
    arenaRevengeRightSchema
  );
const FinalRankingPolicyVersion =
  mongoose.models.FinalRankingPolicyVersion ||
  mongoose.model(
    "FinalRankingPolicyVersion",
    finalRankingPolicyVersionSchema
  );
const ArenaSnapshot =
  mongoose.models.ArenaSnapshot ||
  mongoose.model(
    "ArenaSnapshot",
    arenaSnapshotSchema
  );
const MainToSubConversionPolicy =
  mongoose.models.MainToSubConversionPolicy ||
  mongoose.model(
    "MainToSubConversionPolicy",
    mainToSubConversionPolicySchema
  );
const MainToSubConversionResult =
  mongoose.models.MainToSubConversionResult ||
  mongoose.model(
    "MainToSubConversionResult",
    mainToSubConversionResultSchema
  );
const RenewalRankAssessment =
  mongoose.models.RenewalRankAssessment ||
  mongoose.model(
    "RenewalRankAssessment",
    renewalRankAssessmentSchema
  );
const LiveFinalRankingProfile =
  mongoose.models.LiveFinalRankingProfile ||
  mongoose.model(
    "LiveFinalRankingProfile",
    liveFinalRankingProfileSchema
  );
const MainShopPolicyVersion =
  mongoose.models.MainShopPolicyVersion ||
  mongoose.model(
    "MainShopPolicyVersion",
    mainShopPolicyVersionSchema
  );
const MainShopPurchase =
  mongoose.models.MainShopPurchase ||
  mongoose.model(
    "MainShopPurchase",
    mainShopPurchaseSchema
  );
const MainShopEffect =
  mongoose.models.MainShopEffect ||
  mongoose.model(
    "MainShopEffect",
    mainShopEffectSchema
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
const ArenaStandingChangeLedger =
  mongoose.models.ArenaStandingChangeLedger ||
  mongoose.model(
    "ArenaStandingChangeLedger",
    arenaStandingChangeLedgerSchema
  );
const ArenaPaybackReview =
  mongoose.models.ArenaPaybackReview ||
  mongoose.model(
    "ArenaPaybackReview",
    arenaPaybackReviewSchema
  );
const ArenaAchievementBadge =
  mongoose.models.ArenaAchievementBadge ||
  mongoose.model(
    "ArenaAchievementBadge",
    arenaAchievementBadgeSchema
  );
const ArenaOutboxEvent =
  mongoose.models.ArenaOutboxEvent ||
  mongoose.model(
    "ArenaOutboxEvent",
    arenaOutboxEventSchema
  );

module.exports = {
  AccessCycle,
  AccessCycleExpiryReminder,
  ArenaCohortRevision,
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskProfile,
  ArenaIntegrityRiskCase,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaOpponentSelectionAudit,
  ArenaPackagePayment,
  ArenaPaybackReview,
  ArenaAchievementBadge,
  ArenaProblemPack,
  ArenaRevengeRight,
  SubscriptionPolicyVersion,
  ArenaSnapshot,
  ArenaStanding,
  ArenaStandingChangeLedger,
  FinalRankingPolicyVersion,
  LiveFinalRankingProfile,
  MainDivisionPolicyVersion,
  MainInvitationOffer,
  MainInvitationRequest,
  MainShopEffect,
  MainShopPolicyVersion,
  MainShopPurchase,
  MainToSubConversionPolicy,
  MainToSubConversionResult,
  MockExamPackagePolicyVersion,
  MockExamSubscription,
  RenewalRankAssessment,
};
