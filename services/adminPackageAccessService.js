const mongoose = require("mongoose");
const {
  AdminActionLog,
  User,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaStanding,
  MockExamSubscription,
} = require("../models/goatArenaModel");
const {
  buildAccessCycleDraft,
  buildApprovedCycleState,
} = require("./accessCycleService");
const {
  kstSeasonKey,
} = require("./arenaStandingService");
const {
  ensureDefaultLearningPackagePolicy,
  getActiveArenaPolicy,
} = require("./arenaPolicyService");
const {
  ensureDefaultMockExamPackagePolicy,
  getActiveMockExamPackagePolicy,
} = require("./mockExamPackageService");

const ADMIN_PACKAGE_TYPES = Object.freeze({
  FREE: "FREE",
  MOCK_EXAM_ONLY: "MOCK_EXAM_ONLY",
  LEARNING_PACKAGE: "LEARNING_PACKAGE",
});
const UNRESOLVED_MATCH_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
];

function packageLabel(packageType) {
  return {
    FREE: "무료",
    MOCK_EXAM_ONLY: "모의고사 전용 패키지",
    LEARNING_PACKAGE: "29일 학습권 패키지",
  }[packageType] || packageType;
}

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getAdminPackageAccessSummary(userId, now = new Date()) {
  const [cycle, mockSubscription] = await Promise.all([
    AccessCycle.findOne({
      userId,
      status: "ACTIVE",
      $or: [
        { availableLearningDays: { $gt: 0 } },
        { reservedLearningDays: { $gt: 0 } },
        { lockedLearningDays: { $gt: 0 } },
      ],
    })
      .sort({ paidAt: -1 })
      .lean(),
    MockExamSubscription.findOne({
      userId,
      status: "ACTIVE",
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .sort({ endsAt: -1 })
      .lean(),
  ]);
  const packageType = cycle
    ? ADMIN_PACKAGE_TYPES.LEARNING_PACKAGE
    : mockSubscription
      ? ADMIN_PACKAGE_TYPES.MOCK_EXAM_ONLY
      : ADMIN_PACKAGE_TYPES.FREE;
  return {
    packageType,
    label: packageLabel(packageType),
    cycle,
    mockSubscription,
  };
}

async function assertPackageChangeSafe({ userId, cycle, session }) {
  if (
    cycle &&
    (Number(cycle.lockedLearningDays || 0) > 0 ||
      Number(cycle.reservedLearningDays || 0) > 0)
  ) {
    throw statusError(
      409,
      "경기 예치 또는 초대 예약 학습일수가 남아 있어 패키지 권한을 변경할 수 없습니다.",
      "ADMIN_PACKAGE_BALANCE_LOCKED"
    );
  }
  const unresolvedMatch = await ArenaMatch.exists({
    status: { $in: UNRESOLVED_MATCH_STATUSES },
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  }).session(session);
  if (unresolvedMatch) {
    throw statusError(
      409,
      "정산되지 않은 GOAT Arena 경기가 있어 패키지 권한을 변경할 수 없습니다.",
      "ADMIN_PACKAGE_PENDING_MATCH"
    );
  }
}

async function revokeCurrentLearningPackage({
  cycle,
  adminUserId,
  reason,
  now,
  session,
}) {
  if (!cycle) return;
  const available = Number(cycle.availableLearningDays || 0);
  const payback = Number(cycle.paybackScoreDays || 0);
  await AccessCycle.updateOne(
    { _id: cycle._id, status: "ACTIVE" },
    {
      $set: {
        status: "CANCELLED",
        availableLearningDays: 0,
        paybackScoreDays: 0,
        lockedLearningDays: 0,
        reservedLearningDays: 0,
        expiresAt: now,
      },
    },
    { session }
  );
  if (available || payback) {
    await ArenaLearningDayLedger.create(
      [
        {
          userId: cycle.userId,
          accessCycleId: cycle._id,
          idempotencyKey: `${cycle._id}:ADMIN_PACKAGE_REVOKED:${now.getTime()}`,
          eventType: "ADMIN_ADJUSTMENT",
          availableLearningDaysDelta: -available,
          paybackScoreDaysDelta: -payback,
          lockedLearningDaysDelta: 0,
          reservedLearningDaysDelta: 0,
          balanceAfter: {
            availableLearningDays: 0,
            paybackScoreDays: 0,
            lockedLearningDays: 0,
            reservedLearningDays: 0,
          },
          sourceType: "ADMIN_PACKAGE_MANAGEMENT",
          sourceId: adminUserId,
          occurredAt: now,
          metadata: { reason, action: "REVOKE" },
        },
      ],
      { session }
    );
  }
}

async function updateAdminPackageAccess({
  adminUserId,
  userId,
  packageType,
  reason,
  now = new Date(),
}) {
  const normalizedType = String(packageType || "").toUpperCase();
  if (!Object.values(ADMIN_PACKAGE_TYPES).includes(normalizedType)) {
    throw statusError(400, "적용할 패키지 권한을 선택해주세요.");
  }
  const cleanReason = String(reason || "").trim().slice(0, 500);
  if (!cleanReason) {
    throw statusError(400, "패키지 권한 변경 사유를 입력해주세요.");
  }
  if (
    !mongoose.isValidObjectId(adminUserId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    throw statusError(400, "관리자 또는 사용자 정보를 확인해주세요.");
  }
  const processedAt = new Date(now);
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session).lean();
      if (!user) throw statusError(404, "사용자를 찾을 수 없습니다.");
      if (user.role === "admin") {
        throw statusError(409, "관리자 계정에는 학습 상품 권한을 적용하지 않습니다.");
      }
      const [activeCycle, activeMock] = await Promise.all([
        AccessCycle.findOne({ userId, status: "ACTIVE" })
          .sort({ paidAt: -1 })
          .session(session)
          .lean(),
        MockExamSubscription.findOne({ userId, status: "ACTIVE" })
          .session(session)
          .lean(),
      ]);
      await assertPackageChangeSafe({ userId, cycle: activeCycle, session });
      await revokeCurrentLearningPackage({
        cycle: activeCycle,
        adminUserId,
        reason: cleanReason,
        now: processedAt,
        session,
      });
      if (activeMock) {
        await MockExamSubscription.updateOne(
          { _id: activeMock._id, status: "ACTIVE" },
          { $set: { status: "CANCELLED", cancelledAt: processedAt } },
          { session }
        );
      }
      await ArenaStanding.updateMany(
        { userId, status: "ACTIVE" },
        { $set: { status: "LOCKED" } },
        { session }
      );
      await ArenaAccessState.updateOne(
        { userId },
        {
          $set: {
            currentCompetitiveDivision: "SUB",
            accessCycleId: null,
            state: "PAYMENT_REQUIRED",
            currentSeasonPlacementCompleted: false,
            defensePoolEligible: false,
            weeklyMockEligible: false,
            finalRankingActive: false,
            reasonCode: "ADMIN_PACKAGE_ACCESS_UPDATED",
          },
        },
        { upsert: true, session }
      );

      let entitlement = null;
      if (normalizedType === ADMIN_PACKAGE_TYPES.MOCK_EXAM_ONLY) {
        let policy = await getActiveMockExamPackagePolicy(processedAt);
        if (!policy?._id) policy = await ensureDefaultMockExamPackagePolicy();
        const endsAt = new Date(
          processedAt.getTime() +
            Number(policy.billingPeriodDays || 30) * 24 * 60 * 60 * 1000
        );
        [entitlement] = await MockExamSubscription.create(
          [
            {
              userId,
              policyVersionId: policy._id,
              policySnapshot: {
                code: policy.code,
                monthlyPriceAmount: 0,
                currency: policy.currency || "KRW",
                billingPeriodDays: Number(policy.billingPeriodDays || 30),
                placementCalibrationMinimumWeeklyExams: Number(
                  policy.placementCalibrationMinimumWeeklyExams || 4
                ),
              },
              status: "ACTIVE",
              purchaseMode: "ADMIN_GRANT",
              startsAt: processedAt,
              endsAt,
              activatedAt: processedAt,
            },
          ],
          { session }
        );
      }

      if (normalizedType === ADMIN_PACKAGE_TYPES.LEARNING_PACKAGE) {
        let policy = await getActiveArenaPolicy(processedAt);
        if (!policy) policy = await ensureDefaultLearningPackagePolicy();
        const cycleId = new mongoose.Types.ObjectId();
        const draft = buildAccessCycleDraft({
          userId,
          division: "SUB",
          policy,
          purchasedAt: processedAt,
          purchaseReference: `ADMIN-GRANT-${userId}-${processedAt.getTime()}`,
          previousCycle: activeCycle,
        });
        draft.pricePaid = 0;
        const approved = buildApprovedCycleState({
          cycleDraft: draft,
          cycleId,
          paymentId: adminUserId,
          approvedAt: processedAt,
        });
        approved.ledgerEntries = approved.ledgerEntries.map((entry) => ({
          ...entry,
          sourceType: "ADMIN_PACKAGE_MANAGEMENT",
          sourceId: adminUserId,
          metadata: { ...entry.metadata, reason: cleanReason, action: "GRANT" },
        }));
        [entitlement] = await AccessCycle.create([approved.cycle], { session });
        await ArenaLearningDayLedger.create(approved.ledgerEntries, { session });
        await ArenaStanding.updateMany(
          {
            userId,
            division: "SUB",
            seasonKey: kstSeasonKey(processedAt),
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
        await ArenaAccessState.updateOne(
          { userId },
          {
            $set: {
              currentCompetitiveDivision: "SUB",
              accessCycleId: cycleId,
              state: "SEASON_PLACEMENT_REQUIRED",
              currentSeasonPlacementCompleted: false,
              defensePoolEligible: false,
              weeklyMockEligible: false,
              finalRankingActive: false,
              reasonCode: "ADMIN_LEARNING_PACKAGE_PLACEMENT_REQUIRED",
            },
          },
          { upsert: true, session }
        );
      }

      await AdminActionLog.create(
        [
          {
            adminUserId,
            targetUserId: userId,
            action: "user.package-access",
            detail: `${packageLabel(normalizedType)} 권한 적용 · ${cleanReason}`,
            metadata: {
              packageType: normalizedType,
              entitlementId: entitlement?._id || null,
              pricePaid: 0,
              adminGrant: true,
            },
          },
        ],
        { session }
      );
      result = { packageType: normalizedType, entitlement };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = {
  ADMIN_PACKAGE_TYPES,
  getAdminPackageAccessSummary,
  packageLabel,
  updateAdminPackageAccess,
};
