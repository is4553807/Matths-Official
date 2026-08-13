const mongoose = require("mongoose");
const {
  ArenaPackagePayment,
  MockExamPackagePolicyVersion,
  MockExamSubscription,
} = require("../models/goatArenaModel");
const { User } = require("../models/matthsModel");
const {
  ensureDefaultMockExamPackagePolicy,
} = require("./mockExamPackageService");

const PRODUCT_CODE = "MOCK_EXAM_ONLY";
const PRODUCT_NAME = "Matths 주간 공식 모의고사 이용권";
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeApproval(input = {}) {
  const userId = clean(input.userId, 40);
  const approvedAt = new Date(input.approvedAt);
  const approvedAmount = Number(input.approvedAmount);
  const currency = clean(input.currency || "KRW", 3).toUpperCase();
  const purchaseMode = clean(input.purchaseMode || "SELF", 30).toUpperCase();
  const approval = {
    userId,
    provider: clean(input.provider, 40).toUpperCase(),
    providerMode: clean(input.providerMode, 10).toUpperCase(),
    providerPaymentKey: clean(input.providerPaymentKey, 160),
    orderReference: clean(input.orderReference, 160),
    idempotencyKey: clean(input.idempotencyKey, 160),
    currency,
    approvedAmount,
    approvedAt,
    productCode: PRODUCT_CODE,
    productName: clean(input.productName || PRODUCT_NAME, 140),
    purchaseMode,
  };
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(400, "결제 대상 사용자를 확인해주세요.", "INVALID_USER_ID");
  }
  if (
    !approval.provider ||
    !approval.providerPaymentKey ||
    !approval.orderReference ||
    !approval.idempotencyKey
  ) {
    throw statusError(400, "결제 승인 식별자가 누락되었습니다.", "PAYMENT_IDENTIFIER_REQUIRED");
  }
  if (approval.provider === "TOSS" && !["TEST", "LIVE"].includes(approval.providerMode)) {
    throw statusError(400, "토스페이먼츠 결제 실행 모드를 확인해주세요.", "PAYMENT_PROVIDER_MODE_REQUIRED");
  }
  if (!Number.isSafeInteger(approvedAmount) || approvedAmount < 0) {
    throw statusError(400, "결제 승인 금액을 확인해주세요.", "INVALID_APPROVED_AMOUNT");
  }
  if (currency !== "KRW" || Number.isNaN(approvedAt.getTime())) {
    throw statusError(400, "결제 통화 또는 승인 시각을 확인해주세요.", "INVALID_APPROVAL");
  }
  if (!["SELF", "PARENT_REQUEST"].includes(purchaseMode)) {
    throw statusError(400, "결제 요청 유형을 확인해주세요.", "INVALID_PURCHASE_MODE");
  }
  approval.userId = new mongoose.Types.ObjectId(userId);
  return approval;
}

function replayFilter(approval) {
  return {
    $or: [
      { idempotencyKey: approval.idempotencyKey },
      { orderReference: approval.orderReference },
      {
        provider: approval.provider,
        providerPaymentKey: approval.providerPaymentKey,
      },
    ],
  };
}

function assertSameApproval(existing, approval) {
  if (
    String(existing.userId) !== String(approval.userId) ||
    existing.provider !== approval.provider ||
    String(existing.providerMode || "") !== String(approval.providerMode || "") ||
    existing.providerPaymentKey !== approval.providerPaymentKey ||
    existing.orderReference !== approval.orderReference ||
    existing.idempotencyKey !== approval.idempotencyKey ||
    existing.currency !== approval.currency ||
    Number(existing.approvedAmount) !== approval.approvedAmount ||
    existing.productCode !== PRODUCT_CODE
  ) {
    throw statusError(
      409,
      "이미 사용된 결제 식별자와 승인 정보가 일치하지 않습니다.",
      "PAYMENT_IDEMPOTENCY_CONFLICT"
    );
  }
}

async function findAppliedPayment(approval, session = null) {
  const query = ArenaPackagePayment.findOne(replayFilter(approval));
  if (session) query.session(session);
  const payment = await query.lean();
  if (!payment) return null;
  assertSameApproval(payment, approval);
  if (payment.status !== "APPLIED" || !payment.mockExamSubscriptionId) {
    throw statusError(409, "결제 승인 처리가 아직 완료되지 않았습니다.", "PAYMENT_NOT_APPLIED");
  }
  const subscriptionQuery = MockExamSubscription.findById(
    payment.mockExamSubscriptionId
  );
  if (session) subscriptionQuery.session(session);
  const subscription = await subscriptionQuery.lean();
  if (!subscription) {
    throw statusError(500, "결제와 연결된 모의고사 이용권을 찾을 수 없습니다.", "SUBSCRIPTION_MISSING");
  }
  return { payment, subscription, replayed: true };
}

async function policyForApproval(approvedAt, session) {
  return MockExamPackagePolicyVersion.findOne({
    status: "ACTIVE",
    effectiveFrom: { $lte: approvedAt },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: approvedAt } }],
  })
    .sort({ effectiveFrom: -1 })
    .session(session)
    .lean();
}

async function assertMockExamPurchaseEligible({
  userId,
  now = new Date(),
}) {
  const activeSubscription = await MockExamSubscription.findOne({
    userId,
    status: "ACTIVE",
    endsAt: { $gt: now },
  })
    .select("endsAt")
    .lean();
  if (activeSubscription) {
    throw statusError(
      409,
      "이미 사용 중인 모의고사 이용권이 있습니다. 만료 후 다시 구매해주세요.",
      "MOCK_SUBSCRIPTION_ALREADY_ACTIVE"
    );
  }
  return true;
}

async function applyApprovedMockExamPayment(input) {
  const approval = normalizeApproval(input);
  const replay = await findAppliedPayment(approval);
  if (replay) return replay;

  await ensureDefaultMockExamPackagePolicy();
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const transactionReplay = await findAppliedPayment(approval, session);
      if (transactionReplay) {
        result = transactionReplay;
        return;
      }
      const [user, policy, activeSubscription] = await Promise.all([
        User.findById(approval.userId)
          .select("accountStatus isActive")
          .session(session)
          .lean(),
        policyForApproval(approval.approvedAt, session),
        MockExamSubscription.findOne({
          userId: approval.userId,
          status: "ACTIVE",
        })
          .session(session)
          .lean(),
      ]);
      if (!user || user.accountStatus !== "active" || user.isActive === false) {
        throw statusError(403, "활성 상태인 계정만 이용권을 구매할 수 있습니다.", "ACCOUNT_NOT_ACTIVE");
      }
      if (!policy) {
        throw statusError(409, "결제 승인 시각에 적용되는 모의고사 정책이 없습니다.", "ACTIVE_POLICY_NOT_FOUND");
      }
      if (
        approval.currency !== String(policy.currency || "KRW").toUpperCase() ||
        approval.approvedAmount !== Number(policy.monthlyPriceAmount)
      ) {
        throw statusError(409, "결제 금액이 모의고사 이용권 가격과 일치하지 않습니다.", "PAYMENT_AMOUNT_MISMATCH");
      }
      if (
        activeSubscription &&
        new Date(activeSubscription.endsAt).getTime() > approval.approvedAt.getTime()
      ) {
        throw statusError(
          409,
          "이미 사용 중인 모의고사 이용권이 있습니다. 만료 후 다시 구매해주세요.",
          "MOCK_SUBSCRIPTION_ALREADY_ACTIVE"
        );
      }
      if (activeSubscription) {
        await MockExamSubscription.updateOne(
          { _id: activeSubscription._id, status: "ACTIVE" },
          { $set: { status: "EXPIRED" } },
          { session }
        );
      }

      const paymentId = new mongoose.Types.ObjectId();
      const subscriptionId = new mongoose.Types.ObjectId();
      const startsAt = new Date(approval.approvedAt);
      const endsAt = new Date(
        startsAt.getTime() + Number(policy.billingPeriodDays || 30) * DAY_MS
      );
      const [subscription] = await MockExamSubscription.create(
        [
          {
            _id: subscriptionId,
            userId: approval.userId,
            policyVersionId: policy._id,
            policySnapshot: {
              code: policy.code,
              monthlyPriceAmount: Number(policy.monthlyPriceAmount),
              currency: policy.currency || "KRW",
              billingPeriodDays: Number(policy.billingPeriodDays || 30),
              placementCalibrationMinimumWeeklyExams: Number(
                policy.placementCalibrationMinimumWeeklyExams || 4
              ),
            },
            status: "ACTIVE",
            purchaseMode: approval.purchaseMode,
            startsAt,
            endsAt,
            activatedAt: approval.approvedAt,
          },
        ],
        { session, ordered: true }
      );
      const [payment] = await ArenaPackagePayment.create(
        [
          {
            _id: paymentId,
            userId: approval.userId,
            provider: approval.provider,
            providerMode: approval.providerMode || undefined,
            providerPaymentKey: approval.providerPaymentKey,
            orderReference: approval.orderReference,
            idempotencyKey: approval.idempotencyKey,
            status: "APPLIED",
            approvedAt: approval.approvedAt,
            currency: approval.currency,
            approvedAmount: approval.approvedAmount,
            productCode: PRODUCT_CODE,
            productName: approval.productName,
            mockExamSubscriptionId: subscriptionId,
            processedAt: new Date(),
          },
        ],
        { session, ordered: true }
      );
      result = { payment, subscription, replayed: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateReplay = await findAppliedPayment(approval);
      if (duplicateReplay) return duplicateReplay;
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = {
  applyApprovedMockExamPayment,
  assertMockExamPurchaseEligible,
  _testing: {
    assertSameApproval,
    normalizeApproval,
    replayFilter,
  },
};
