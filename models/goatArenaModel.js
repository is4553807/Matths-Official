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
      maxlength: 80,
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
    payback: {
      minimumStreakDays: {
        type: Number,
        min: 0,
        default: 30,
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
accessCycleSchema.index({
  policyVersionCode: 1,
  startsAt: 1,
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
      required: true,
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
    weeklyMockEligible: {
      type: Boolean,
      default: false,
    },
    finalRankingActive: {
      type: Boolean,
      default: false,
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
      required: true,
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
    seasonSubStartPercentile: Number,
    seasonSubCurrentPercentile: Number,
    seasonSubEndPercentile: Number,
    seasonMainStartPercentile: Number,
    seasonMainCurrentPercentile: Number,
    referenceSubPercentile: Number,
    actualRenewalSubPercentile: Number,
    finalRating: {
      type: Number,
      required: true,
    },
    finalRank: {
      type: Number,
      min: 1,
      required: true,
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

const arenaMatchSchema = new Schema(
  {
    matchKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    problemPackVersion: {
      type: String,
      required: true,
    },
    scoringVersion: {
      type: String,
      required: true,
    },
    requestedAt: Date,
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
  },
  { timestamps: true, versionKey: false }
);

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
const AccessCycle =
  mongoose.models.AccessCycle ||
  mongoose.model("AccessCycle", accessCycleSchema);
const ArenaStanding =
  mongoose.models.ArenaStanding ||
  mongoose.model(
    "ArenaStanding",
    arenaStandingSchema
  );
const ArenaAccessState =
  mongoose.models.ArenaAccessState ||
  mongoose.model(
    "ArenaAccessState",
    arenaAccessStateSchema
  );
const ArenaLearningDayLedger =
  mongoose.models.ArenaLearningDayLedger ||
  mongoose.model(
    "ArenaLearningDayLedger",
    arenaLearningDayLedgerSchema
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
const ArenaMatch =
  mongoose.models.ArenaMatch ||
  mongoose.model(
    "ArenaMatch",
    arenaMatchSchema
  );
const ArenaMatchParticipantLock =
  mongoose.models.ArenaMatchParticipantLock ||
  mongoose.model(
    "ArenaMatchParticipantLock",
    arenaMatchParticipantLockSchema
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
const ArenaOutboxEvent =
  mongoose.models.ArenaOutboxEvent ||
  mongoose.model(
    "ArenaOutboxEvent",
    arenaOutboxEventSchema
  );

module.exports = {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaPaybackReview,
  SubscriptionPolicyVersion,
  ArenaSnapshot,
  ArenaStanding,
  ArenaStandingChangeLedger,
  FinalRankingPolicyVersion,
  LiveFinalRankingProfile,
  MainToSubConversionPolicy,
  MainToSubConversionResult,
  RenewalRankAssessment,
};
