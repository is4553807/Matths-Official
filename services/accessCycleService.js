const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaPackagePayment,
  ArenaStanding,
  SubscriptionPolicyVersion,
} = require("../models/goatArenaModel");
const {
  User,
} = require("../models/matthsModel");
const {
  hasMaterialRenewalChange,
  policySnapshot,
} = require("./arenaPolicyService");
const {
  packagePurchaseEligibility,
} = require("./arenaEligibilityService");
const {
  activateStandingForPaidPlacement,
  kstSeasonKey,
} = require("./arenaStandingService");
const {
  preparePaidMainRenewalInTransaction,
} = require("./arenaRenewalService");
const {
  burnAvailable: burnMainAvailableLearningDays,
} = require("./mainLearningDayService");
const { withSchedulerLease } = require("./schedulerLeaseService");

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_TIME_ZONE = "Asia/Seoul";
const DEFAULT_SCHEDULER_INTERVAL_MS =
  30 * 1000;
const UNSETTLED_MATCH_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
];

let accessCycleScheduleTimer = null;
let accessCycleScheduleRunning = false;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanSingleLine(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function kstDateParts(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: KST_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }
  ).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) =>
        part.type !== "literal"
      )
      .map((part) => [
        part.type,
        Number(part.value),
      ])
  );
}

function dateKeyFromUtcDay(dayNumber) {
  return new Date(dayNumber * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function dateKeyToUtcDay(dateKey) {
  const [year, month, day] = dateKey
    .split("-")
    .map(Number);
  return Math.floor(
    Date.UTC(year, month - 1, day) /
      DAY_MS
  );
}

function kstDateKey(value = new Date()) {
  const parts = kstDateParts(value);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function kstMidnight(dateKey) {
  return new Date(
    `${dateKey}T00:00:00.000+09:00`
  );
}

function computeAccessCycleWindow({
  purchasedAt,
  policy,
}) {
  const purchaseDate = new Date(purchasedAt);
  if (
    Number.isNaN(purchaseDate.getTime())
  ) {
    throw new Error(
      "결제 시각을 확인할 수 없습니다."
    );
  }
  const snapshot = policySnapshot(policy);
  if (!snapshot) {
    throw new Error(
      "적용할 Arena 정책이 없습니다."
    );
  }
  const purchaseDateKey =
    kstDateKey(purchaseDate);
  const firstDayNumber =
    dateKeyToUtcDay(purchaseDateKey) + 1;
  const firstConsumptionDateKey =
    dateKeyFromUtcDay(firstDayNumber);
  const evaluationDayCount =
    Number(snapshot.initialLearningDays) || 0;
  const expiresDateKey = dateKeyFromUtcDay(
    firstDayNumber +
      Number(snapshot.initialLearningDays)
  );
  const evaluationDateKey =
    dateKeyFromUtcDay(
      firstDayNumber + evaluationDayCount
    );

  return {
    startsAt: purchaseDate,
    firstConsumptionDateKst:
      firstConsumptionDateKey,
    firstDayMode: "NEXT_DAY",
    baseExpiresAt:
      kstMidnight(expiresDateKey),
    expiresAt:
      kstMidnight(expiresDateKey),
    evaluationAt:
      kstMidnight(evaluationDateKey),
  };
}

function buildRenewalPolicyNotice({
  previousCycle,
  nextPolicy,
}) {
  const previousSnapshot =
    previousCycle?.policySnapshot;
  const changed =
    hasMaterialRenewalChange(
      previousSnapshot,
      nextPolicy
    );
  const previousPaybackReceived =
    previousCycle?.status ===
      "PAYBACK_COMPLETED" ||
    previousCycle?.cashbackQualified ===
      true;

  if (!changed || previousPaybackReceived) {
    return {
      required: false,
      previousPolicyVersionCode:
        previousCycle
          ?.policyVersionCode || "",
      nextPolicyVersionCode:
        nextPolicy?.code || "",
      message: "",
      acknowledgedAt: null,
    };
  }

  return {
    required: true,
    previousPolicyVersionCode:
      previousCycle
        ?.policyVersionCode || "",
    nextPolicyVersionCode:
      nextPolicy?.code || "",
    message:
      "이전 이용 주기와 비교해 가격 또는 페이백 구간이 변경되었습니다. 새 결제 주기에 적용될 조건을 확인해주세요.",
    acknowledgedAt: null,
  };
}

function buildAccessCycleDraft({
  userId,
  division = "SUB",
  policy,
  purchasedAt = new Date(),
  purchaseReference,
  previousCycle = null,
}) {
  const snapshot = policySnapshot(policy);
  const window = computeAccessCycleWindow({
    purchasedAt,
    policy,
  });

  return {
    userId,
    division,
    status: "PENDING",
    policyVersionId:
      policy._id,
    policyVersionCode:
      policy.code,
    policySnapshot: snapshot,
    currency: policy.currency || "KRW",
    pricePaid:
      Number(policy.priceAmount) || 0,
    purchaseReference,
    paidAt:
      new Date(purchasedAt),
    ...window,
    availableLearningDays:
      Number(
        snapshot.initialLearningDays
      ),
    paybackScoreDays:
      Number(
        snapshot.initialPaybackScoreDays
      ),
    lockedPaybackScoreDays: 0,
    lockedLearningDays: 0,
    reservedLearningDays: 0,
    learningDayBuckets: [],
    firstDayConsumedAt: null,
    lastConsumptionDateKst: null,
    depletedAt: null,
    paidNormalAttacksCompleted: 0,
    attackParticipationDays: 0,
    lastAttackParticipationDateKst: null,
    // 구버전 앱·운영 데이터 호환용 별칭이다.
    streakDays: 0,
    lastStreakDateKst: null,
    cashbackQualified: false,
    paybackRate: 0,
    paybackAmount: 0,
    evaluatedAt: null,
    renewalPolicyNotice:
      buildRenewalPolicyNotice({
        previousCycle,
        nextPolicy: policy,
      }),
  };
}

function normalizePaymentApproval(input = {}) {
  const userId = cleanSingleLine(
    input.userId,
    40
  );
  const provider = cleanSingleLine(
    input.provider,
    40
  ).toUpperCase();
  const providerMode = cleanSingleLine(
    input.providerMode,
    10
  ).toUpperCase();
  const providerPaymentKey =
    cleanSingleLine(
      input.providerPaymentKey
    );
  const orderReference = cleanSingleLine(
    input.orderReference
  );
  const idempotencyKey = cleanSingleLine(
    input.idempotencyKey
  );
  const currency = cleanSingleLine(
    input.currency || "KRW",
    3
  ).toUpperCase();
  const approvedAmount = Number(
    input.approvedAmount
  );
  const approvedAt = new Date(
    input.approvedAt
  );
  const appleOriginalTransactionId =
    provider === "APPLE"
      ? cleanSingleLine(input.appleOriginalTransactionId, 160)
      : undefined;
  const appleAppAccountToken =
    provider === "APPLE"
      ? cleanSingleLine(input.appleAppAccountToken, 64) || undefined
      : undefined;
  const appleExpiresAt =
    provider === "APPLE" && input.appleExpiresAt
      ? new Date(input.appleExpiresAt)
      : undefined;

  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(
      400,
      "결제 대상 사용자를 확인해주세요.",
      "INVALID_USER_ID"
    );
  }
  if (
    !provider ||
    !providerPaymentKey ||
    !orderReference ||
    !idempotencyKey
  ) {
    throw statusError(
      400,
      "결제 승인 식별자가 누락되었습니다.",
      "PAYMENT_IDENTIFIER_REQUIRED"
    );
  }
  if (["TOSS", "APPLE"].includes(provider) && !["TEST", "LIVE"].includes(providerMode)) {
    throw statusError(
      400,
      "결제 실행 모드를 확인해주세요.",
      "PAYMENT_PROVIDER_MODE_REQUIRED"
    );
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw statusError(
      400,
      "결제 통화를 확인해주세요.",
      "INVALID_CURRENCY"
    );
  }
  if (
    !Number.isSafeInteger(approvedAmount) ||
    approvedAmount < 0
  ) {
    throw statusError(
      400,
      "결제 승인 금액을 확인해주세요.",
      "INVALID_APPROVED_AMOUNT"
    );
  }
  if (Number.isNaN(approvedAt.getTime())) {
    throw statusError(
      400,
      "결제 승인 시각을 확인해주세요.",
      "INVALID_APPROVED_AT"
    );
  }
  if (
    provider === "APPLE" &&
    (
      !appleOriginalTransactionId ||
      !appleExpiresAt ||
      Number.isNaN(appleExpiresAt.getTime()) ||
      appleExpiresAt.getTime() <= approvedAt.getTime()
    )
  ) {
    throw statusError(
      400,
      "App Store 구독 식별자 또는 만료 시각을 확인해주세요.",
      "APPLE_SUBSCRIPTION_METADATA_REQUIRED"
    );
  }

  return {
    userId: new mongoose.Types.ObjectId(
      userId
    ),
    provider,
    providerMode: providerMode || undefined,
    providerPaymentKey,
    orderReference,
    idempotencyKey,
    currency,
    approvedAmount,
    approvedAt,
    appleOriginalTransactionId,
    appleAppAccountToken,
    appleExpiresAt,
  };
}

function paymentReplayFilter(approval) {
  return {
    $or: [
      {
        idempotencyKey:
          approval.idempotencyKey,
      },
      {
        orderReference:
          approval.orderReference,
      },
      {
        provider: approval.provider,
        providerPaymentKey:
          approval.providerPaymentKey,
      },
    ],
  };
}

function assertSamePaymentApproval(
  existing,
  approval
) {
  const same =
    String(existing.userId) ===
      String(approval.userId) &&
    existing.provider ===
      approval.provider &&
    String(existing.providerMode || "") ===
      String(approval.providerMode || "") &&
    existing.providerPaymentKey ===
      approval.providerPaymentKey &&
    existing.orderReference ===
      approval.orderReference &&
    existing.idempotencyKey ===
      approval.idempotencyKey &&
    existing.currency ===
      approval.currency &&
    Number(existing.approvedAmount) ===
      approval.approvedAmount &&
    String(existing.appleOriginalTransactionId || "") ===
      String(approval.appleOriginalTransactionId || "") &&
    String(existing.appleAppAccountToken || "") ===
      String(approval.appleAppAccountToken || "") &&
    String(existing.appleExpiresAt ? new Date(existing.appleExpiresAt).toISOString() : "") ===
      String(approval.appleExpiresAt ? new Date(approval.appleExpiresAt).toISOString() : "");

  if (!same) {
    throw statusError(
      409,
      "이미 사용된 결제 식별자와 승인 정보가 일치하지 않습니다.",
      "PAYMENT_IDEMPOTENCY_CONFLICT"
    );
  }
}

function buildApprovedCycleState({
  cycleDraft,
  cycleId,
  paymentId,
  approvedAt,
}) {
  const initialAvailable = Number(
    cycleDraft.availableLearningDays
  );
  const initialPayback = Number(
    cycleDraft.paybackScoreDays
  );
  const immediateConsumption =
    cycleDraft.firstDayMode ===
    "SAME_DAY";
  const availableAfter =
    initialAvailable -
    (immediateConsumption ? 1 : 0);

  if (availableAfter < 0) {
    throw statusError(
      500,
      "정책의 정기권 학습 가능 일수가 올바르지 않습니다.",
      "INVALID_INITIAL_LEARNING_DAYS"
    );
  }

  const ledgerEntries = [
    {
      userId: cycleDraft.userId,
      accessCycleId: cycleId,
      idempotencyKey:
        `${cycleId}:PURCHASE_GRANTED`,
      eventType: "PURCHASE_GRANTED",
      availableLearningDaysDelta:
        initialAvailable,
      paybackScoreDaysDelta:
        initialPayback,
      lockedPaybackScoreDaysDelta: 0,
      lockedLearningDaysDelta: 0,
      balanceAfter: {
        availableLearningDays:
          initialAvailable,
        paybackScoreDays:
          initialPayback,
        lockedPaybackScoreDays: 0,
        lockedLearningDays: 0,
      },
      sourceType: "PACKAGE_PAYMENT",
      sourceId: paymentId,
      occurredAt: approvedAt,
      metadata: {
        policyVersionCode:
          cycleDraft.policyVersionCode,
      },
    },
  ];

  if (immediateConsumption) {
    ledgerEntries.push({
      userId: cycleDraft.userId,
      accessCycleId: cycleId,
      idempotencyKey:
        `${cycleId}:${cycleDraft.firstConsumptionDateKst}:FIRST_DAY_CONSUMPTION`,
      eventType:
        "FIRST_DAY_CONSUMPTION",
      availableLearningDaysDelta: -1,
      paybackScoreDaysDelta: 0,
      lockedPaybackScoreDaysDelta: 0,
      lockedLearningDaysDelta: 0,
      balanceAfter: {
        availableLearningDays:
          availableAfter,
        paybackScoreDays:
          initialPayback,
        lockedPaybackScoreDays: 0,
        lockedLearningDays: 0,
      },
      sourceType: "PACKAGE_PAYMENT",
      sourceId: paymentId,
      occurredAt: approvedAt,
      metadata: {
        firstConsumptionDateKst:
          cycleDraft.firstConsumptionDateKst,
        firstDayMode:
          cycleDraft.firstDayMode,
      },
    });
  }

  return {
    cycle: {
      ...cycleDraft,
      _id: cycleId,
      status: "ACTIVE",
      availableLearningDays:
        availableAfter,
      firstDayConsumedAt:
        immediateConsumption
          ? approvedAt
          : null,
      lastConsumptionDateKst:
        immediateConsumption
          ? cycleDraft.firstConsumptionDateKst
          : null,
      depletedAt:
        immediateConsumption &&
        availableAfter === 0
          ? approvedAt
          : null,
    },
    ledgerEntries,
    immediateConsumption,
  };
}

async function findAppliedPayment(
  approval,
  session = null
) {
  const query = ArenaPackagePayment.findOne(
    paymentReplayFilter(approval)
  );
  if (session) query.session(session);
  const existing = await query.lean();
  if (!existing) return null;

  assertSamePaymentApproval(
    existing,
    approval
  );
  if (
    existing.status !== "APPLIED" ||
    !existing.accessCycleId
  ) {
    throw statusError(
      409,
      "결제 승인 처리가 아직 완료되지 않았습니다.",
      "PAYMENT_NOT_APPLIED"
    );
  }

  const cycleQuery = AccessCycle.findById(
    existing.accessCycleId
  );
  if (session) cycleQuery.session(session);
  const cycle = await cycleQuery.lean();
  if (!cycle) {
    throw statusError(
      500,
      "결제와 연결된 이용 주기를 찾을 수 없습니다.",
      "PAYMENT_CYCLE_MISSING"
    );
  }
  return {
    payment: existing,
    cycle,
    replayed: true,
  };
}

async function findPolicyForApproval({
  approvedAt,
  session,
}) {
  return SubscriptionPolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: approvedAt },
    $or: [
      { effectiveUntil: null },
      { effectiveUntil: { $gt: approvedAt } },
    ],
  })
    .sort({ effectiveFrom: -1 })
    .session(session)
    .lean();
}

async function hasPendingMatchSettlement({
  userId,
  session,
}) {
  const [participantLock, unsettledMatch] =
    await Promise.all([
      ArenaMatchParticipantLock.exists({
        userId,
      }).session(session),
      ArenaMatch.exists({
        status: {
          $in: UNSETTLED_MATCH_STATUSES,
        },
        $or: [
          { "challenger.userId": userId },
          { "defender.userId": userId },
        ],
      }).session(session),
    ]);
  return Boolean(
    participantLock || unsettledMatch
  );
}

function packagePurchaseBlockedMessage(reasons = []) {
  const reasonMessages = {
    PAYBACK_ATTACK_WINDOW_ACTIVE:
      "현재 이용 주기의 마지막 페이백 공식 공격 제출 기간이 아직 끝나지 않았습니다.",
    AVAILABLE_BALANCE_REMAINS:
      "현재 학습권의 사용 가능한 학습일이 남아 있습니다.",
    LOCKED_BALANCE_REMAINS:
      "GOAT Arena 경기에 예치된 학습일이 남아 있습니다.",
    LOCKED_PAYBACK_SCORE_REMAINS:
      "GOAT Arena 경기에 예치된 페이백 점수가 남아 있습니다.",
    RESERVED_BALANCE_REMAINS:
      "Ranked 초대에 예약된 학습일이 남아 있습니다.",
    PENDING_SETTLEMENT:
      "아직 정산이 끝나지 않은 GOAT Arena 경기가 있습니다.",
  };
  const details = [...new Set(reasons)]
    .map((reason) => reasonMessages[reason])
    .filter(Boolean);
  return [
    "기존 29일 학습권을 정리한 뒤 새 학습권을 결제할 수 있습니다.",
    ...details,
  ].join(" ");
}

function activePaybackAttackWindow(
  cycle,
  now = new Date()
) {
  const evaluationAt = new Date(
    cycle?.evaluationAt
  );
  const current = new Date(now);
  return Boolean(
    cycle?.division === "SUB" &&
      cycle?.status === "ACTIVE" &&
      Number(cycle?.availableLearningDays) === 0 &&
      !Number.isNaN(evaluationAt.getTime()) &&
      !Number.isNaN(current.getTime()) &&
      current < evaluationAt
  );
}

async function getPackagePurchaseEligibilityForUser({
  userId,
  session = null,
  now = new Date(),
}) {
  const cycleQuery = AccessCycle.findOne({
    userId,
    status: "ACTIVE",
  }).select(
    "division status evaluationAt availableLearningDays reservedLearningDays lockedLearningDays lockedPaybackScoreDays"
  );
  if (session) cycleQuery.session(session);
  const [activeCycle, pendingSettlement] = await Promise.all([
    cycleQuery.lean(),
    hasPendingMatchSettlement({ userId, session }),
  ]);
  const eligibility = packagePurchaseEligibility({
    availableLearningDays:
      activeCycle?.availableLearningDays || 0,
    reservedLearningDays:
      activeCycle?.reservedLearningDays || 0,
    lockedLearningDays:
      activeCycle?.lockedLearningDays || 0,
    lockedPaybackScoreDays:
      activeCycle?.lockedPaybackScoreDays || 0,
    hasPendingSettlement: pendingSettlement,
    activePaybackAttackWindow:
      activePaybackAttackWindow(
        activeCycle,
        now
      ),
  });
  return { ...eligibility, activeCycle };
}

async function assertPackagePurchaseEligible({
  userId,
  session = null,
}) {
  const eligibility =
    await getPackagePurchaseEligibilityForUser({ userId, session });
  if (!eligibility.eligible) {
    const error = statusError(
      409,
      packagePurchaseBlockedMessage(eligibility.reasons),
      "PACKAGE_PURCHASE_NOT_ELIGIBLE"
    );
    error.reasons = eligibility.reasons;
    throw error;
  }
  return eligibility;
}

function assertPolicyPaymentMatches(
  approval,
  policy
) {
  const policyCurrency = String(
    policy.currency || "KRW"
  ).toUpperCase();
  if (approval.currency !== policyCurrency) {
    throw statusError(
      409,
      "결제 통화가 적용 정책과 일치하지 않습니다.",
      "PAYMENT_CURRENCY_MISMATCH"
    );
  }
  if (
    approval.approvedAmount !==
    Number(policy.priceAmount)
  ) {
    throw statusError(
      409,
      "결제 금액이 적용 정책의 학습권 패키지 가격과 일치하지 않습니다.",
      "PAYMENT_AMOUNT_MISMATCH"
    );
  }
}

/*
 * 결제사 서명과 승인 진위 확인을 끝낸 뒤 호출하는 내부 경계입니다.
 * 결제 승인 기록, 새 이용 주기, 최초 원장, 접근 상태를 한 트랜잭션으로
 * 저장하므로 동일 웹훅을 다시 받아도 이용 주기는 한 번만 생성됩니다.
 */
async function applyApprovedPackagePayment(
  input
) {
  const approval =
    normalizePaymentApproval(input);
  const paymentInstrumentFingerprint = cleanSingleLine(
    input?.paymentInstrumentFingerprint,
    500
  );
  const recordPaymentLinkSignal = async () => {
    if (!paymentInstrumentFingerprint) return;
    try {
      const { recordTrustedIntegritySignal } = require("./arenaIntegrityRiskService");
      await recordTrustedIntegritySignal({
        userId: approval.userId,
        signalType: "PAYMENT_INSTRUMENT",
        rawValue: paymentInstrumentFingerprint,
        sourceType: "VERIFIED_PAYMENT_APPROVAL",
        now: approval.approvedAt,
      });
    } catch (error) {
      console.error("결제수단 무결성 연관 신호 기록 실패:", error);
    }
  };
  const replay = await findAppliedPayment(
    approval
  );
  if (replay) {
    await recordPaymentLinkSignal();
    return replay;
  }

  const session =
    await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(
      async () => {
        const transactionReplay =
          await findAppliedPayment(
            approval,
            session
          );
        if (transactionReplay) {
          result = transactionReplay;
          return;
        }

        const user = await User.findById(
          approval.userId
        )
          .select("accountStatus isActive")
          .session(session)
          .lean();
        if (!user) {
          throw statusError(
            404,
            "결제 대상 사용자를 찾을 수 없습니다.",
            "USER_NOT_FOUND"
          );
        }
        if (
          user.accountStatus !== "active" ||
          user.isActive === false
        ) {
          throw statusError(
            403,
            "활성 상태인 계정만 학습권 패키지를 이용할 수 있습니다.",
            "ACCOUNT_NOT_ACTIVE"
          );
        }

        const policy =
          await findPolicyForApproval({
            approvedAt:
              approval.approvedAt,
            session,
          });
        if (!policy) {
          throw statusError(
            409,
            "결제 승인 시각에 적용되는 Arena 정책이 없습니다.",
            "ACTIVE_POLICY_NOT_FOUND"
          );
        }
        assertPolicyPaymentMatches(
          approval,
          policy
        );

        const [
          activeCycle,
          previousCycle,
          accessState,
          pendingSettlement,
        ] = await Promise.all([
          AccessCycle.findOne({
            userId: approval.userId,
            status: "ACTIVE",
          })
            .session(session)
            .lean(),
          AccessCycle.findOne({
            userId: approval.userId,
          })
            .sort({ paidAt: -1, _id: -1 })
            .session(session)
            .lean(),
          ArenaAccessState.findOne({
            userId: approval.userId,
          })
            .session(session)
            .lean(),
          hasPendingMatchSettlement({
            userId: approval.userId,
            session,
          }),
        ]);

        const isMainRenewal = Boolean(
          accessState
            ?.currentCompetitiveDivision ===
            "MAIN" ||
          (accessState?.state ===
            "SUB_ACCESS_EXPIRED_LOCKED" &&
            accessState
              ?.mainAchievementStatus ===
              "ACHIEVED" &&
            accessState?.lastMainSnapshotId)
        );

        const eligibility =
          packagePurchaseEligibility({
            availableLearningDays:
              activeCycle
                ?.availableLearningDays || 0,
            reservedLearningDays:
              activeCycle
                ?.reservedLearningDays || 0,
            lockedLearningDays:
              activeCycle
                ?.lockedLearningDays || 0,
            lockedPaybackScoreDays:
              activeCycle
                ?.lockedPaybackScoreDays || 0,
            hasPendingSettlement:
              pendingSettlement,
            activePaybackAttackWindow:
              activePaybackAttackWindow(
                activeCycle,
                approval.approvedAt
              ),
          });
        if (!eligibility.eligible) {
          throw statusError(
            409,
            "남은 정기권 학습 가능 일수, 초대 예약 일수, 경기 예치 학습일 또는 미정산 대전을 먼저 정리해주세요.",
            eligibility.reasons.join(",")
          );
        }

        if (activeCycle) {
          await AccessCycle.updateOne(
            {
              _id: activeCycle._id,
              status: "ACTIVE",
              availableLearningDays: 0,
              lockedPaybackScoreDays: { $in: [0, null] },
              lockedLearningDays: 0,
            },
            {
              $set: { status: "EXPIRED" },
            },
            { session }
          );
        }

        const paymentId =
          new mongoose.Types.ObjectId();
        const cycleId =
          new mongoose.Types.ObjectId();
        const draft = buildAccessCycleDraft({
          userId: approval.userId,
          division: "SUB",
          policy,
          purchasedAt:
            approval.approvedAt,
          purchaseReference:
            approval.orderReference,
          previousCycle,
        });
        const approvedState =
          buildApprovedCycleState({
            cycleDraft: draft,
            cycleId,
            paymentId,
            approvedAt:
              approval.approvedAt,
          });

        await ArenaPackagePayment.create(
          [
            {
              _id: paymentId,
              ...approval,
              status: "APPLIED",
              policyVersionId: policy._id,
              policyVersionCode:
                policy.code,
              accessCycleId: cycleId,
              processedAt: new Date(),
            },
          ],
          { session }
        );
        await AccessCycle.create(
          [approvedState.cycle],
          { session }
        );
        await ArenaLearningDayLedger.create(
          approvedState.ledgerEntries,
          { session }
        );

        let renewalResult = null;
        if (isMainRenewal) {
          renewalResult =
            await preparePaidMainRenewalInTransaction({
              userId: approval.userId,
              cycleId,
              accessState,
              approvedAt: approval.approvedAt,
              session,
            });
        }

        const placementStanding =
          renewalResult?.standing ||
          (!previousCycle &&
          accessState
            ?.currentSeasonPlacementCompleted &&
          accessState?.standingId
            ? await ArenaStanding.findOne({
                _id: accessState.standingId,
                userId: approval.userId,
                division: "SUB",
                seasonKey: kstSeasonKey(
                  approval.approvedAt
                ),
                status: {
                  $ne: "ARCHIVED",
                },
              })
                .select("_id")
                .session(session)
                .lean()
            : null);
        const placementCompleted = renewalResult
          ? Boolean(renewalResult.placementCompleted)
          : Boolean(placementStanding);

        if (!renewalResult && !placementCompleted && previousCycle) {
          await ArenaStanding.updateMany(
            {
              userId: approval.userId,
              division: "SUB",
              seasonKey: kstSeasonKey(
                approval.approvedAt
              ),
              status: { $ne: "ARCHIVED" },
            },
            {
              $set: {
                status: "LOCKED",
                sourcePlacementAttemptId: null,
                seedPlacementScore: null,
                seedPlacementElapsedTimeMs: null,
                seedPlacementMmr: null,
                seedPlacementStartedAt: null,
                seededAt: null,
              },
            },
            { session }
          );
        }

        if (!renewalResult) {
          await ArenaAccessState.updateOne(
          { userId: approval.userId },
          {
            $set: {
              currentCompetitiveDivision:
                "SUB",
              accessCycleId: cycleId,
              state: placementCompleted
                ? "PAID_ACTIVE"
                : "SEASON_PLACEMENT_REQUIRED",
              currentSeasonPlacementCompleted:
                placementCompleted,
              defensePoolEligible:
                placementCompleted &&
                !["REVIEW_REQUIRED", "RESTRICTED"].includes(
                  accessState?.integrityStatus
                ),
              weeklyMockEligible:
                placementCompleted,
              finalRankingActive:
                placementCompleted,
              expiredAt: null,
              renewalGraceDeadline: null,
              reasonCode: placementCompleted
                ? "PACKAGE_PAYMENT_AND_PLACEMENT_ACTIVE"
                : "PACKAGE_PAYMENT_PLACEMENT_REQUIRED",
            },
            $setOnInsert: {
              mainAchievementStatus:
                "NOT_ACHIEVED",
            },
          },
          { upsert: true, session }
          );
        }

        if (placementCompleted && !renewalResult) {
          await activateStandingForPaidPlacement({
            userId: approval.userId,
            standingId:
              placementStanding._id,
            session,
            now: approval.approvedAt,
          });
        }

        const outboxEvents = [
          {
            eventType:
              "RenewalPaymentCompleted",
            aggregateType:
              "AccessCycle",
            aggregateId: cycleId,
            idempotencyKey:
              `${paymentId}:RenewalPaymentCompleted`,
            payload: {
              userId: approval.userId,
              accessCycleId: cycleId,
              policyVersionCode:
                policy.code,
              firstDayMode:
                approvedState.cycle
                  .firstDayMode,
            },
          },
        ];
        if (
          approvedState.immediateConsumption
        ) {
          outboxEvents.push({
            eventType: "FirstDayConsumed",
            aggregateType:
              "AccessCycle",
            aggregateId: cycleId,
            idempotencyKey:
              `${cycleId}:${draft.firstConsumptionDateKst}:FirstDayConsumed`,
            payload: {
              userId: approval.userId,
              accessCycleId: cycleId,
              firstConsumptionDateKst:
                draft.firstConsumptionDateKst,
            },
          });
        }
        await ArenaOutboxEvent.create(
          outboxEvents,
          { session }
        );

        result = {
          payment: {
            _id: paymentId,
            ...approval,
            status: "APPLIED",
            policyVersionId: policy._id,
            policyVersionCode:
              policy.code,
            accessCycleId: cycleId,
          },
          cycle: approvedState.cycle,
          replayed: false,
        };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateReplay =
        await findAppliedPayment(
          approval
        );
      if (duplicateReplay) {
        await recordPaymentLinkSignal();
        return duplicateReplay;
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (result?.cycle || result?.payment) {
    await recordPaymentLinkSignal();
    const { recalculateFinalRanking } = require("./finalRankingService");
    await recalculateFinalRanking({ now: approval.approvedAt });
  }
  return result;
}

async function consumeFirstLearningDay({
  cycleId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(cycleId)) {
    throw statusError(
      400,
      "이용 주기를 확인해주세요.",
      "INVALID_ACCESS_CYCLE_ID"
    );
  }
  const processedAt = new Date(now);
  if (Number.isNaN(processedAt.getTime())) {
    throw statusError(
      400,
      "첫날 차감 처리 시각을 확인해주세요.",
      "INVALID_PROCESSING_TIME"
    );
  }

  const session =
    await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(
      async () => {
        const cycle = await AccessCycle.findById(
          cycleId
        )
          .session(session)
          .lean();
        if (!cycle) {
          throw statusError(
            404,
            "이용 주기를 찾을 수 없습니다.",
            "ACCESS_CYCLE_NOT_FOUND"
          );
        }
        if (cycle.firstDayConsumedAt) {
          result = {
            cycle,
            consumed: false,
            replayed: true,
          };
          return;
        }
        if (cycle.status !== "ACTIVE") {
          result = {
            cycle,
            consumed: false,
            replayed: false,
            reason: "ACCESS_CYCLE_NOT_ACTIVE",
          };
          return;
        }
        if (
          cycle.firstConsumptionDateKst >
          kstDateKey(processedAt)
        ) {
          result = {
            cycle,
            consumed: false,
            replayed: false,
            reason: "FIRST_DAY_NOT_DUE",
          };
          return;
        }

        const availableBefore = Number(
          cycle.availableLearningDays
        );
        if (availableBefore <= 0) {
          throw statusError(
            409,
            "첫날 차감할 정기권 학습 가능 일수가 없습니다.",
            "LEARNING_DAYS_DEPLETED"
          );
        }
        const occurredAt = kstMidnight(
          cycle.firstConsumptionDateKst
        );
        const ledgerKey =
          `${cycle._id}:${cycle.firstConsumptionDateKst}:FIRST_DAY_CONSUMPTION`;
        const cycleSet = {
          firstDayConsumedAt:
            occurredAt,
          lastConsumptionDateKst:
            cycle.firstConsumptionDateKst,
        };
        // Ranked는 사용 가능·초대 예약·경기 예치 잔액을 출처별 묶음에도
        // 함께 보관한다. 첫날 차감 시 숫자 필드만 줄이면 이후 친선 경기처럼
        // 묶음 기준으로 계산하는 작업이 이전 잔액을 다시 덮어쓸 수 있다.
        // 따라서 첫날 차감도 다른 Ranked 차감과 동일하게 묶음을 함께 소각한다.
        let mainLearningDayState = null;
        if (cycle.division === "MAIN") {
          mainLearningDayState = burnMainAvailableLearningDays(cycle, 1);
          cycleSet.learningDayBuckets = mainLearningDayState.buckets;
        }
        if (availableBefore === 1) {
          cycleSet.depletedAt = occurredAt;
        }
        const updateResult =
          await AccessCycle.updateOne(
            {
              _id: cycle._id,
              status: "ACTIVE",
              firstDayConsumedAt: null,
              availableLearningDays:
                availableBefore,
            },
            {
              $set: cycleSet,
              $inc: {
                availableLearningDays: -1,
              },
            },
            { session }
          );
        if (!updateResult.modifiedCount) {
          throw statusError(
            409,
            "첫날 차감 상태가 동시에 변경되었습니다. 다시 처리합니다.",
            "FIRST_DAY_CONCURRENT_UPDATE"
          );
        }

        await ArenaLearningDayLedger.create(
          [
            {
              userId: cycle.userId,
              accessCycleId: cycle._id,
              idempotencyKey: ledgerKey,
              eventType:
                "FIRST_DAY_CONSUMPTION",
              availableLearningDaysDelta:
                -1,
              paybackScoreDaysDelta: 0,
              lockedPaybackScoreDaysDelta: 0,
              lockedLearningDaysDelta: 0,
              balanceAfter: {
                availableLearningDays:
                  availableBefore - 1,
                paybackScoreDays:
                  cycle.paybackScoreDays,
                lockedPaybackScoreDays:
                  cycle.lockedPaybackScoreDays || 0,
                lockedLearningDays:
                  cycle.lockedLearningDays,
              },
              sourceType:
                "ACCESS_CYCLE_SCHEDULER",
              occurredAt,
              metadata: {
                processedAt,
                firstConsumptionDateKst:
                  cycle.firstConsumptionDateKst,
                firstDayMode:
                  cycle.firstDayMode,
              },
            },
          ],
          { session }
        );
        await ArenaOutboxEvent.create(
          [
            {
              eventType:
                "FirstDayConsumed",
              aggregateType:
                "AccessCycle",
              aggregateId: cycle._id,
              idempotencyKey:
                `${cycle._id}:${cycle.firstConsumptionDateKst}:FirstDayConsumed`,
              payload: {
                userId: cycle.userId,
                accessCycleId: cycle._id,
                firstConsumptionDateKst:
                  cycle.firstConsumptionDateKst,
              },
            },
          ],
          { session }
        );

        result = {
          cycle: {
            ...cycle,
            availableLearningDays:
              availableBefore - 1,
            firstDayConsumedAt:
              occurredAt,
            lastConsumptionDateKst:
              cycle.firstConsumptionDateKst,
            learningDayBuckets:
              mainLearningDayState?.buckets ||
              cycle.learningDayBuckets,
            depletedAt:
              availableBefore === 1
                ? occurredAt
                : cycle.depletedAt || null,
          },
          consumed: true,
          replayed: false,
        };
      }
    );
  } catch (error) {
    if (
      error?.code === 11000 ||
      error?.code ===
        "FIRST_DAY_CONCURRENT_UPDATE"
    ) {
      const cycle = await AccessCycle.findById(
        cycleId
      ).lean();
      if (cycle?.firstDayConsumedAt) {
        return {
          cycle,
          consumed: false,
          replayed: true,
        };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

async function processDueFirstDayConsumptions({
  now = new Date(),
  limit = 200,
} = {}) {
  const processedAt = new Date(now);
  const safeLimit = Math.min(
    Math.max(Number(limit) || 1, 1),
    1000
  );
  const dueCycles = await AccessCycle.find({
    status: "ACTIVE",
    firstDayConsumedAt: null,
    firstConsumptionDateKst: {
      $lte: kstDateKey(processedAt),
    },
  })
    .sort({ firstConsumptionDateKst: 1, _id: 1 })
    .limit(safeLimit)
    .select("_id")
    .lean();

  const summary = {
    scanned: dueCycles.length,
    consumed: 0,
    replayed: 0,
    skipped: 0,
    failed: 0,
  };
  for (const cycle of dueCycles) {
    try {
      const item =
        await consumeFirstLearningDay({
          cycleId: cycle._id,
          now: processedAt,
        });
      if (item.consumed) {
        summary.consumed += 1;
      } else if (item.replayed) {
        summary.replayed += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error(
        `이용 주기 ${cycle._id} 첫날 차감 실패:`,
        error
      );
    }
  }
  return summary;
}

async function runAccessCycleSchedule() {
  if (accessCycleScheduleRunning) return;
  accessCycleScheduleRunning = true;
  try {
    await processDueFirstDayConsumptions();
  } finally {
    accessCycleScheduleRunning = false;
  }
}

function startAccessCycleScheduler({
  intervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
} = {}) {
  if (accessCycleScheduleTimer) {
    return accessCycleScheduleTimer;
  }
  const run = () => withSchedulerLease(
    { name: "ACCESS_CYCLE_FIRST_DAY", leaseMs: 5 * 60 * 1000 },
    runAccessCycleSchedule
  );
  run().catch((error) => {
    console.error(
      "학습권 패키지 이용 주기 스케줄 초기화 실패:",
      error
    );
  });
  accessCycleScheduleTimer = setInterval(
    () => {
      run().catch(
        (error) => {
          console.error(
            "학습권 패키지 이용 주기 스케줄 처리 실패:",
            error
          );
        }
      );
    },
    Math.max(Number(intervalMs) || 0, 1000)
  );
  accessCycleScheduleTimer.unref?.();
  return accessCycleScheduleTimer;
}

function stopAccessCycleScheduler() {
  if (accessCycleScheduleTimer) {
    clearInterval(accessCycleScheduleTimer);
    accessCycleScheduleTimer = null;
  }
}

module.exports = {
  applyApprovedPackagePayment,
  assertPackagePurchaseEligible,
  buildAccessCycleDraft,
  buildApprovedCycleState,
  buildRenewalPolicyNotice,
  computeAccessCycleWindow,
  consumeFirstLearningDay,
  hasPendingMatchSettlement,
  getPackagePurchaseEligibilityForUser,
  kstDateKey,
  kstMidnight,
  normalizePaymentApproval,
  processDueFirstDayConsumptions,
  startAccessCycleScheduler,
  stopAccessCycleScheduler,
  _testing: {
    activePaybackAttackWindow,
    assertPolicyPaymentMatches,
    assertSamePaymentApproval,
    kstDateKey,
    kstMidnight,
    paymentReplayFilter,
    packagePurchaseBlockedMessage,
  },
};
