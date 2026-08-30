const mongoose = require("mongoose");
const {
  PAYBACK_ATTACK_PARTICIPATION_DAYS,
} = require("../constants/paybackParticipation");

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

const arenaTierDailyLimitSchema = new Schema(
  {
    tier: {
      type: String,
      enum: [
        "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD",
        "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
      ],
      required: true,
    },
    attackLimit: { type: Number, min: 0, max: 20, required: true },
    defenseLimit: { type: Number, min: 0, max: 20, required: true },
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
        "ADMIN_GRANT",
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
      default: "00:00",
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
    dailyMatchLimitsByTier: {
      type: [arenaTierDailyLimitSchema],
      default: () => [],
    },
    payback: {
      minimumAttackParticipationDays: {
        type: Number,
        min: 1,
        default: PAYBACK_ATTACK_PARTICIPATION_DAYS,
      },
      // 이전 정책 문서를 읽기 위한 호환 필드다. 새 정책과 심사는
      // minimumAttackParticipationDays를 정본으로 사용한다.
      minimumStreakDays: {
        type: Number,
        min: 0,
        default: undefined,
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
  "dailyMatchLimitsByTier",
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
      enum: ["MOCK_EXAM_ONLY", "LEARNING_PACKAGE_29"],
      default: "LEARNING_PACKAGE_29",
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      maxlength: 140,
      default: "29일 학습권 패키지",
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
    mockExamSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "MockExamSubscription",
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
      default: "Matths 주간 공식 모의고사 이용권",
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
    lockedPaybackScoreDays: {
      type: Number,
      min: 0,
      default: 0,
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
    depletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    paidNormalAttacksCompleted: {
      type: Number,
      min: 0,
      default: 0,
      // 운영 분석 지표다. 페이백 자격 판정에는 사용하지 않는다.
    },
    streakDays: {
      type: Number,
      min: 0,
      default: 0,
      // 구버전 앱·운영 데이터 호환용 별칭이다. 새 코드에서는
      // attackParticipationDays와 같은 누적 참여일 값을 기록한다.
    },
    lastStreakDateKst: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
      index: true,
    },
    attackParticipationDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastAttackParticipationDateKst: {
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
    integrityReviewCompensationMs: {
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
}, "Ranked 학습일수 출처를 중복 저장할 수 없습니다.");
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

/*
 * 운영 정책 변경 공지의 사용자별 전달 원장입니다. 정책 한 건과 사용자
 * 한 명의 조합을 유일하게 만들어 사이트 우편함과 이메일을 각각 정확히
 * 한 번 전달하고, SMTP 장애가 나도 별도 재시도할 수 있게 합니다.
 */
const policyChangeDeliverySchema = new Schema(
  {
    policyType: {
      type: String,
      enum: [
        "SUB_DIVISION",
        "MAIN_DIVISION",
        "LEARNING_PACKAGE",
        "MOCK_EXAM_PACKAGE",
        "MAIN_SHOP",
      ],
      required: true,
      index: true,
    },
    policyId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    policyCode: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
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
      trim: true,
      maxlength: 500,
      default: "/goat-arena/rules/sub",
    },
    // 정책 공지에 함께 보여줄 변경 전·후 표의 행입니다. 원문 정책 전체를
    // 복제하지 않고, 사용자에게 안내할 변경점만 전달 원장에 고정한다.
    comparisonRows: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, maxlength: 120 },
            before: { type: String, maxlength: 500, default: "" },
            after: { type: String, maxlength: 500, default: "" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    siteStatus: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED"],
      default: "PENDING",
      index: true,
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
      enum: ["PENDING", "SENDING", "SENT", "PREVIEW", "SKIPPED", "FAILED"],
      default: "PENDING",
      index: true,
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
policyChangeDeliverySchema.index(
  { policyType: 1, policyId: 1, userId: 1 },
  { unique: true }
);
policyChangeDeliverySchema.index({
  emailStatus: 1,
  emailNextRetryAt: 1,
  leaseExpiresAt: 1,
  createdAt: 1,
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
    /* Unranked와 Ranked 모두 하나의 통합 Arena 경쟁 풀(ALL)을 사용한다. */
    competitivePool: {
      type: String,
      enum: ["ALL", "HIGH_SCHOOL", "RETAKER", "UNIVERSITY", "WORKER"],
      default: "ALL",
      required: true,
      index: true,
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
    qualifiedArenaRank: {
      /* Ranked 인원 상한 적용 전, 현재 Arena 상태가 자격을 얻은 원본 티어 */
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
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
arenaStandingSchema.index({ status: 1, updatedAt: -1 });

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
  {
    unique: true,
    partialFilterExpression: {
      status: "ACTIVE",
    },
  }
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
    /* 현재 활성 Ranked standing의 통합 경쟁 풀(ALL) 빠른 조회용 사본이다. */
    mainCompetitivePool: {
      type: String,
      enum: ["ALL", "HIGH_SCHOOL", "RETAKER", "UNIVERSITY", "WORKER", null],
      default: null,
      index: true,
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
    automaticDefenseNoShowCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    automaticDefenseSuspendedAt: {
      type: Date,
      default: null,
      index: true,
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
    paybackDisqualifiedAt: {
      type: Date,
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
        "INTEGRITY_PENALTY_BURN",
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
        "FRIENDLY_MATCH_FEE_BURN",
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
    lockedPaybackScoreDaysDelta: {
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
        "ADMIN_GRANT",
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
      lockedPaybackScoreDays: {
        type: Number,
        min: 0,
        default: 0,
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
}, "Ranked 티어 차이별 예치 기준표에 같은 티어 차이를 중복할 수 없습니다.");

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
}, "Ranked 활성 정책에는 티어별 예치 기준표와 최대 공격 티어 차이가 필요합니다.");

mainDivisionPolicyVersionSchema.path(
  "effectiveUntil"
).validate(function validateMainPolicyWindow(value) {
  return (
    !value ||
    !this.effectiveFrom ||
    new Date(value) > new Date(this.effectiveFrom)
  );
}, "Ranked 정책 종료 시각은 적용 시작 시각보다 뒤여야 합니다.");

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
  "invitationOfferBatchSize",
  "invitationCancellationFeeDays",
  "manualInvitationCancellationAllowed",
  "manualInvitationCancellationFeeDays",
  "repeatOpponentExclusionDays",
  "maximumActiveInvitationReservationsPerTargetTier",
  "revengeStakeMultiplier",
  "revengeFeeDays",
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
        "활성화했거나 종료된 Ranked 정책은 수정할 수 없습니다. 새 버전을 만들어주세요."
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
        "활성화했거나 종료된 Ranked 정책은 수정할 수 없습니다. 새 버전을 만들어주세요."
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
    /* 초대 예약은 소속과 무관한 통합 Ranked 경쟁 풀에서 처리한다. */
    competitivePool: {
      type: String,
      enum: ["ALL", "HIGH_SCHOOL", "RETAKER", "UNIVERSITY", "WORKER"],
      required: true,
      default: "ALL",
      index: true,
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

/*
 * Ranked 친선 경기는 순위·티어·정기권 학습일수의 승패 이전과 분리한다.
 * 초대 수락 순간에만 양측의 1일 이용 수수료를 소각하고, 경기 자체는
 * 일반 Arena 경기 화면과 동일한 문제·풀이 증거 흐름을 사용한다.
 */
const mainFriendlyInvitationSchema = new Schema(
  {
    requestId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    inviterUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inviteeUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inviterStandingId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaStanding",
      required: true,
    },
    inviteeStandingId: {
      type: Schema.Types.ObjectId,
      ref: "ArenaStanding",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    feeDays: { type: Number, min: 1, max: 1, default: 1 },
    expiresAt: { type: Date, required: true, index: true },
    respondedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    matchId: { type: Schema.Types.ObjectId, ref: "ArenaMatch", default: null },
  },
  { timestamps: true, versionKey: false }
);
mainFriendlyInvitationSchema.index(
  { inviterUserId: 1, requestId: 1 },
  { unique: true }
);
mainFriendlyInvitationSchema.index({ inviteeUserId: 1, status: 1, createdAt: -1 });
mainFriendlyInvitationSchema.index({ inviterUserId: 1, status: 1, createdAt: -1 });

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
  "Ranked 하위 티어 초대 예약에는 고정 만료시각을 둘 수 없습니다."
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
arenaRevengeRightSchema.index({
  eligibleUserId: 1,
  status: 1,
  createdAt: -1,
});

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
    qualifiedArenaRank: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
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
liveFinalRankingProfileSchema.index({ status: 1, finalRank: 1 });

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
}, "Ranked 상점 정책에는 중복되지 않은 아이템이 하나 이상 필요합니다.");

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
mainShopEffectSchema.index(
  { relatedMatchId: 1, itemCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      itemCode: "DEFENSE_SCHEDULE_PROTECTION",
      relatedMatchId: { $type: "objectId" },
    },
  }
);

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
      enum: ["NORMAL", "REVENGE", "FRIENDLY"],
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

const arenaMatchEconomySnapshotSchema = new Schema(
  {
    originalStakeDays: { type: Number, min: 0, default: 0 },
    normalStakeMode: {
      type: String,
      enum: [
        "INITIATOR_ONLY",
        "BILATERAL_ACCEPTED_INVITATION",
        "LEGACY_BILATERAL",
        "FRIENDLY_FEE_ONLY",
        "",
      ],
      default: "",
    },
    challengerStakeDays: { type: Number, min: 0, default: 0 },
    defenderStakeDays: { type: Number, min: 0, default: 0 },
    revengeStakeMultiplier: { type: Number, min: 1, default: 1 },
    feeDays: { type: Number, min: 0, default: 0 },
    recipientNoShowReturnDays: { type: Number, min: 0, default: 0 },
    recipientNoShowBurnDays: { type: Number, min: 0, default: 0 },
    challengerWinRefundDays: { type: Number, min: 0, default: null },
    // 과거 경기 스냅샷 호환용. 신규 Unranked 일반 쟁탈전은
    // challengerWinRefundDays를 사용한다.
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
      enum: ["NORMAL", "REVENGE", "FRIENDLY"],
      required: true,
    },
    matchOrigin: {
      type: String,
      enum: [
        "SUB_UPWARD_AUTO_MATCH",
        "MAIN_UPWARD_AUTO_MATCH",
        "MAIN_LOWER_INVITATION",
        "MAIN_FRIENDLY_INVITATION",
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
    friendlyInvitationId: {
      type: Schema.Types.ObjectId,
      ref: "MainFriendlyInvitation",
      default: null,
      index: true,
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
    integrityPauseCompensationMs: {
      type: Number,
      min: 0,
      default: 0,
    },
    integrityPauseCompensatedAt: {
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
    automaticDefenseNoShowRecordedAt: {
      type: Date,
      default: null,
      index: true,
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
      enum: ["CLOUDINARY", "PURGED"],
      default: "CLOUDINARY",
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
    questionSlot: { type: Number, min: 1, max: 5, default: null },
    revision: { type: Number, min: 1, default: null },
    strokeCount: { type: Number, min: 0, default: null },
    firstSavedAt: { type: Date, default: null },
    lastSavedAt: { type: Date, default: null },
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
arenaStandingChangeLedgerSchema.index({
  userId: 1,
  occurredAt: -1,
  _id: -1,
});

/*
 * 티어 승급 연출은 현재 티어를 보고 추측해서 재생하지 않습니다.
 * 실제 경기 정산 트랜잭션이 승급을 확정할 때만 이 1회성 표시 이벤트를
 * 만들고, 브라우저가 연출을 열면 DISPLAYED로 확인 처리합니다.
 */
const arenaRankUpPresentationSchema =
  new Schema(
    {
      presentationId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 240,
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
      fromTier: {
        type: String,
        enum: [
          "bronze", "silver", "gold", "platinum", "emerald",
          "diamond", "master", "grandmaster", "challenger",
        ],
        required: true,
      },
      toTier: {
        type: String,
        enum: [
          "bronze", "silver", "gold", "platinum", "emerald",
          "diamond", "master", "grandmaster", "challenger",
        ],
        required: true,
      },
      status: {
        type: String,
        enum: ["PENDING", "DISPLAYED"],
        default: "PENDING",
        required: true,
        index: true,
      },
      occurredAt: {
        type: Date,
        required: true,
        default: Date.now,
        immutable: true,
      },
      displayedAt: {
        type: Date,
        default: null,
      },
    },
    { timestamps: true, versionKey: false }
  );

arenaRankUpPresentationSchema.index(
  { matchId: 1, userId: 1 },
  { unique: true }
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
        "ArenaMatchIntegrityReviewStarted",
        "ArenaMatchNoShowDetected",
        "ArenaAutomaticDefenseSuspended",
        "ArenaMatchSettled",
        "ArenaOpponentSelected",
        "MainInvitationCreated",
        "MainFriendlyInvitationCreated",
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
        "PolicyChangeScheduled",
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
const PolicyChangeDelivery =
  mongoose.models.PolicyChangeDelivery ||
  mongoose.model(
    "PolicyChangeDelivery",
    policyChangeDeliverySchema
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
const MainFriendlyInvitation =
  mongoose.models.MainFriendlyInvitation ||
  mongoose.model("MainFriendlyInvitation", mainFriendlyInvitationSchema);
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
const ArenaStandingChangeLedger =
  mongoose.models.ArenaStandingChangeLedger ||
  mongoose.model(
    "ArenaStandingChangeLedger",
    arenaStandingChangeLedgerSchema
  );
const ArenaRankUpPresentation =
  mongoose.models.ArenaRankUpPresentation ||
  mongoose.model(
    "ArenaRankUpPresentation",
    arenaRankUpPresentationSchema
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
  PolicyChangeDelivery,
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
  ArenaInlineSolutionBoard,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaOpponentSelectionAudit,
  ArenaPackagePayment,
  ArenaPaybackReview,
  ArenaAchievementBadge,
  ArenaProblemPack,
  ArenaProblemDataVersion,
  ArenaTierQuestionCatalogVersion,
  ArenaRevengeRight,
  SubscriptionPolicyVersion,
  ArenaSnapshot,
  ArenaStanding,
  ArenaStandingChangeLedger,
  ArenaRankUpPresentation,
  FinalRankingPolicyVersion,
  LiveFinalRankingProfile,
  MainDivisionPolicyVersion,
  MainInvitationOffer,
  MainFriendlyInvitation,
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
