const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const { RefundRequest } = require("../models/refundModel");
const { CheckoutIntent } = require("../models/parentModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaMatch,
  ArenaPackagePayment,
  ArenaPaybackReview,
  MockExamSubscription,
} = require("../models/goatArenaModel");
const {
  AssessmentAttempt,
  AdminActionLog,
  PrivateMockExamAttempt,
  User,
  UserNotification,
} = require("../models/matthsModel");
const { PaybackPayoutRecord } = require("../models/paybackModel");
const { getActiveAdminSender } = require("./adminIdentityService");
const { sendAdminUserEmail } = require("./emailService");
const { calculateRefundQuote } = require("./refundPolicyService");
const {
  cancelPayment,
  getTossConfig,
} = require("./tossPaymentService");

const ADMIN_PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safePage(value) {
  return Math.max(1, Number.parseInt(value, 10) || 1);
}

function addBusinessDaysKst(value, count) {
  let cursor = new Date(value);
  let remaining = Math.max(0, Number(count) || 0);
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      weekday: "short",
    }).format(cursor);
    if (!new Set(["Sat", "Sun"]).has(weekday)) remaining -= 1;
  }
  return cursor;
}

function productName(payment) {
  return String(payment.productName || (
    payment.productCode === "MOCK_EXAM_ONLY"
      ? "Matths 주간 공식 모의고사 이용권"
      : "29일 학습권 패키지"
  ));
}

async function listRefundableOrders(userId) {
  const payments = await ArenaPackagePayment.find({
    userId,
    status: { $in: ["APPROVED", "APPLIED", "PARTIALLY_REFUNDED"] },
    $expr: { $lt: [{ $ifNull: ["$refundedAmount", 0] }, "$approvedAmount"] },
  })
    .sort({ approvedAt: -1 })
    .select("productCode productName orderReference approvedAt approvedAmount refundedAmount status")
    .lean();
  return payments.map((payment) => ({
    id: String(payment._id),
    productCode: payment.productCode || "LEARNING_PACKAGE_29",
    productName: productName(payment),
    orderReference: payment.orderReference,
    approvedAt: payment.approvedAt,
    approvedAmount: payment.approvedAmount,
    remainingAmount: Math.max(0, payment.approvedAmount - (payment.refundedAmount || 0)),
  }));
}

async function createRefundRequest({
  userId,
  paymentId,
  reasonType = "SIMPLE_CHANGE",
  reasonDetail,
  supportInquiryId = null,
  requestedByType = "STUDENT",
  parentAccountId = null,
  session = null,
}) {
  if (!mongoose.isValidObjectId(paymentId)) {
    throw statusError(400, "환불할 주문번호를 선택해주세요.");
  }
  const payment = await ArenaPackagePayment.findOne({
    _id: paymentId,
    userId,
    status: { $in: ["APPROVED", "APPLIED", "PARTIALLY_REFUNDED"] },
  }).session(session).lean();
  if (!payment || Number(payment.refundedAmount || 0) >= Number(payment.approvedAmount || 0)) {
    throw statusError(404, "환불 신청이 가능한 결제 주문을 찾을 수 없습니다.");
  }
  const active = await RefundRequest.exists({
    paymentId: payment._id,
    status: { $in: ["REQUESTED", "CALCULATED"] },
  }).session(session);
  if (active) throw statusError(409, "이미 처리 중인 환불 신청이 있습니다.");

  const requesterType = String(requestedByType || "STUDENT").toUpperCase();
  if (!["STUDENT", "PARENT"].includes(requesterType)) {
    throw statusError(400, "환불 신청자 유형을 확인해주세요.");
  }
  if (requesterType === "PARENT" && !mongoose.isValidObjectId(parentAccountId)) {
    throw statusError(400, "학부모 환불 신청 계정을 확인해주세요.");
  }
  const cleanReasonDetail = String(reasonDetail || "").trim().slice(0, 5000);
  if (cleanReasonDetail.length < 10) {
    throw statusError(400, "환불 사유를 10자 이상 작성해주세요.");
  }

  const requestedAt = new Date();
  const [request] = await RefundRequest.create([{
    requestKey: `refund-request:${randomUUID()}`,
    userId,
    paymentId: payment._id,
    supportInquiryId,
    requestedByType: requesterType,
    parentAccountId: requesterType === "PARENT" ? parentAccountId : null,
    productCode: payment.productCode || "LEARNING_PACKAGE_29",
    productNameSnapshot: productName(payment),
    orderReferenceSnapshot: payment.orderReference,
    providerPaymentKeySnapshot: payment.providerPaymentKey,
    reasonType: ["SIMPLE_CHANGE", "NOT_AS_DESCRIBED", "SERVICE_FAILURE", "OTHER"].includes(reasonType)
      ? reasonType
      : "OTHER",
    reasonDetail: cleanReasonDetail,
    requestedAt,
    processingDeadlineAt: addBusinessDaysKst(requestedAt, 3),
  }], { session });
  await ArenaPackagePayment.updateOne(
    { _id: payment._id },
    { $set: { refundStatus: "REQUESTED", latestRefundRequestId: request._id } },
    { session }
  );
  return request;
}

async function resolveServiceWindow(payment, session) {
  if (payment.productCode === "MOCK_EXAM_ONLY") {
    const subscription = payment.mockExamSubscriptionId
      ? await MockExamSubscription.findById(payment.mockExamSubscriptionId)
          .session(session)
          .lean()
      : await MockExamSubscription.findOne({
          userId: payment.userId,
          status: { $in: ["ACTIVE", "EXPIRED"] },
        }).sort({ startsAt: -1 }).session(session).lean();
    const used = await PrivateMockExamAttempt.exists({
      userId: payment.userId,
      startedAt: { $gte: subscription?.startsAt || payment.approvedAt },
    }).session(session);
    return {
      serviceStartAt: subscription?.startsAt || payment.approvedAt,
      serviceEndAt: subscription?.endsAt || null,
      paidFeatureUsed: Boolean(used),
      subscriptionId: subscription?._id || null,
    };
  }
  const cycle = payment.accessCycleId
    ? await AccessCycle.findById(payment.accessCycleId).session(session).lean()
    : null;
  const serviceStartAt = cycle?.startsAt || payment.approvedAt;
  const [placementUsed, mockUsed, arenaUsed] = await Promise.all([
    AssessmentAttempt.exists({
      userId: payment.userId,
      scopeType: "placement",
      placementPurpose: {
        $in: [
          "SEASON",
          "RENEWAL_RANK_ASSESSMENT",
        ],
      },
      createdAt: { $gte: serviceStartAt },
    }).session(session),
    PrivateMockExamAttempt.exists({
      userId: payment.userId,
      startedAt: { $gte: serviceStartAt },
    }).session(session),
    ArenaMatch.exists({
      createdAt: { $gte: serviceStartAt },
      $or: [
        { "challenger.userId": payment.userId },
        { "defender.userId": payment.userId },
      ],
    }).session(session),
  ]);
  return {
    serviceStartAt,
    serviceEndAt: cycle?.baseExpiresAt || cycle?.expiresAt || null,
    paidFeatureUsed: Boolean(placementUsed || mockUsed || arenaUsed),
    cycleId: cycle?._id || payment.accessCycleId || null,
  };
}

async function calculateRefundRequest({ adminUserId, refundRequestId, paidFeatureUsed }) {
  const actor = await getActiveAdminSender(adminUserId);
  const request = await RefundRequest.findById(refundRequestId);
  if (!request) throw statusError(404, "환불 신청을 찾을 수 없습니다.");
  if (!["REQUESTED", "CALCULATED"].includes(request.status)) {
    throw statusError(409, "이미 종료된 환불 신청입니다.");
  }
  const payment = await ArenaPackagePayment.findById(request.paymentId).lean();
  if (!payment) throw statusError(404, "결제 원장을 찾을 수 없습니다.");
  const window = await resolveServiceWindow(payment, null);
  const quote = calculateRefundQuote({
    productCode: request.productCode,
    approvedAmount: Math.max(0, payment.approvedAmount - (payment.refundedAmount || 0)),
    approvedAt: payment.approvedAt,
    serviceStartAt: window.serviceStartAt,
    serviceEndAt: window.serviceEndAt,
    requestedAt: request.requestedAt,
    paidFeatureUsed: Boolean(window.paidFeatureUsed || paidFeatureUsed === true),
  });
  request.status = "CALCULATED";
  request.calculation = {
    ...quote,
    calculatedAt: new Date(),
    calculatedBy: adminUserId,
  };
  await request.save();
  await ArenaPackagePayment.updateOne(
    { _id: payment._id },
    { $set: { refundStatus: "CALCULATED", latestRefundRequestId: request._id } }
  );
  await AdminActionLog.create({
    adminUserId,
    targetUserId: request.userId,
    action: "refund.calculate",
    detail: request.orderReferenceSnapshot,
    metadata: {
      refundRequestId: String(request._id),
      calculatedAmount: quote.calculatedAmount,
      paidFeatureUsed: quote.paidFeatureUsed,
      actorSnapshot: actor,
    },
  });
  return request;
}

async function completeRefundRequest({
  adminUserId,
  refundRequestId,
  approvedAmount,
  cancellationMode,
  providerCancellationTransactionKey,
  providerCancelledAt,
  operatorNote,
}) {
  const actor = await getActiveAdminSender(adminUserId);
  const requestedAmount = Math.floor(Number(approvedAmount));
  const mode = String(cancellationMode || "").toUpperCase();
  let transactionKey = String(providerCancellationTransactionKey || "").trim();
  let cancelTime = new Date(providerCancelledAt || new Date());
  const requestReceivedAt = new Date();
  if (!Number.isSafeInteger(requestedAmount) || requestedAmount < 1) {
    throw statusError(400, "실제 취소 승인금액을 1원 이상의 정수로 입력해주세요.");
  }
  if (!["FULL", "PARTIAL"].includes(mode)) {
    throw statusError(400, "전체 또는 부분 취소를 선택해주세요.");
  }
  const preflightRequest = await RefundRequest.findById(refundRequestId).lean();
  if (!preflightRequest) throw statusError(404, "환불 신청을 찾을 수 없습니다.");
  if (preflightRequest.status === "COMPLETED") return preflightRequest;
  if (preflightRequest.status !== "CALCULATED") {
    throw statusError(409, "환불액 산정을 먼저 완료해주세요.");
  }
  const preflightPayment = await ArenaPackagePayment.findById(
    preflightRequest.paymentId
  ).lean();
  if (!preflightPayment) throw statusError(404, "결제 원장을 찾을 수 없습니다.");
  const preflightRemaining = Math.max(
    0,
    Number(preflightPayment.approvedAmount) - Number(preflightPayment.refundedAmount || 0)
  );
  if (requestedAmount > preflightRemaining) {
    throw statusError(409, "남은 결제금액보다 많이 환불할 수 없습니다.");
  }
  if (mode === "FULL" && requestedAmount !== preflightRemaining) {
    throw statusError(400, "전체 취소 승인금액은 남은 결제금액과 같아야 합니다.");
  }
  if (mode === "PARTIAL" && requestedAmount >= preflightRemaining) {
    throw statusError(400, "남은 결제금액 전부를 취소했다면 전체 취소로 처리해주세요.");
  }
  const preflightPayoutExists = preflightPayment.accessCycleId
    ? await PaybackPayoutRecord.exists({
        cycleId: preflightPayment.accessCycleId,
        status: "COMPLETED",
      })
    : null;
  if (preflightPayoutExists) {
    throw statusError(
      409,
      "이미 페이백 송금이 완료된 주기입니다. 중복 지급 조정 후 별도 처리해주세요.",
      "PAYBACK_ALREADY_PAID"
    );
  }

  if (preflightPayment.provider === "TOSS") {
    const tossConfig = getTossConfig();
    if (preflightPayment.providerMode !== tossConfig.mode) {
      throw statusError(
        409,
        `${preflightPayment.providerMode || "확인 불가"} 결제는 현재 ${tossConfig.mode} 키로 취소할 수 없습니다.`,
        "TOSS_REFUND_MODE_MISMATCH"
      );
    }
    const cancellation = await cancelPayment({
      paymentKey: preflightPayment.providerPaymentKey,
      cancelReason: `Matths 환불 신청 ${preflightRequest.requestKey}`,
      cancelAmount: requestedAmount,
      idempotencyKey: `refund-${preflightRequest._id}`,
    });
    const providerCancellation = Array.isArray(cancellation.cancels)
      ? [...cancellation.cancels]
          .reverse()
          .find((entry) => Number(entry.cancelAmount) === requestedAmount)
      : null;
    transactionKey = String(providerCancellation?.transactionKey || "").trim();
    cancelTime = new Date(providerCancellation?.canceledAt || new Date());
    if (!providerCancellation || transactionKey.length < 6) {
      throw statusError(
        502,
        "토스페이먼츠 취소 응답의 거래 정보를 확인할 수 없습니다. 결제 상태를 운영자가 확인해주세요.",
        "TOSS_CANCELLATION_RESULT_INVALID"
      );
    }
  }
  if (transactionKey.length < 6 || transactionKey.length > 200) {
    throw statusError(400, "결제사 취소 거래키를 정확히 입력해주세요.");
  }
  if (Number.isNaN(cancelTime.getTime())) throw statusError(400, "취소 처리시각을 확인해주세요.");
  if (cancelTime.getTime() > requestReceivedAt.getTime() + 5 * 60 * 1000) {
    throw statusError(400, "취소 처리시각은 현재보다 미래일 수 없습니다.");
  }

  const session = await mongoose.startSession();
  let completed;
  let recipient;
  try {
    await session.withTransaction(async () => {
      const request = await RefundRequest.findById(refundRequestId).session(session);
      if (!request) throw statusError(404, "환불 신청을 찾을 수 없습니다.");
      const idempotencyKey = `refund-complete:${request._id}`;
      if (request.status === "COMPLETED") {
        if (request.decision.idempotencyKey === idempotencyKey) {
          completed = request;
          return;
        }
        throw statusError(409, "이미 완료된 환불 신청입니다.");
      }
      if (request.status !== "CALCULATED") {
        throw statusError(409, "환불액 산정을 먼저 완료해주세요.");
      }
      const payment = await ArenaPackagePayment.findById(request.paymentId).session(session);
      if (!payment) throw statusError(404, "결제 원장을 찾을 수 없습니다.");
      const remaining = Math.max(0, payment.approvedAmount - (payment.refundedAmount || 0));
      if (cancelTime < new Date(payment.approvedAt)) {
        throw statusError(400, "취소 처리시각은 결제 승인시각보다 빠를 수 없습니다.");
      }
      if (requestedAmount > remaining) throw statusError(409, "남은 결제금액보다 많이 환불할 수 없습니다.");
      if (mode === "FULL" && requestedAmount !== remaining) {
        throw statusError(400, "전체 취소 승인금액은 남은 결제금액과 같아야 합니다.");
      }
      if (mode === "PARTIAL" && requestedAmount >= remaining) {
        throw statusError(400, "남은 결제금액 전부를 취소했다면 전체 취소로 처리해주세요.");
      }
      const payoutExists = payment.accessCycleId
        ? await PaybackPayoutRecord.exists({ cycleId: payment.accessCycleId, status: "COMPLETED" }).session(session)
        : null;
      if (payoutExists) {
        throw statusError(409, "이미 페이백 송금이 완료된 주기입니다. 중복 지급 조정 후 별도 처리해주세요.", "PAYBACK_ALREADY_PAID");
      }

      if (payment.accessCycleId) {
        await AccessCycle.updateOne(
          { _id: payment.accessCycleId, userId: payment.userId },
          {
            $set: {
              status: "CANCELLED",
              expiresAt: cancelTime,
              availableLearningDays: 0,
              paybackScoreDays: 0,
              lockedPaybackScoreDays: 0,
              lockedLearningDays: 0,
              reservedLearningDays: 0,
              cashbackQualified: false,
              paybackRate: 0,
              paybackAmount: 0,
              paybackPayoutStatus: "CANCELLED",
              evaluatedAt: cancelTime,
            },
            $addToSet: { paybackDisqualifiers: "REFUND_COMPLETED" },
          },
          { session }
        );
        await ArenaAccessState.updateOne(
          { userId: payment.userId, accessCycleId: payment.accessCycleId },
          {
            $set: {
              state: "PAYMENT_REQUIRED",
              currentCompetitiveDivision: null,
              accessCycleId: null,
              defensePoolEligible: false,
              weeklyMockEligible: false,
              finalRankingActive: false,
              expiredAt: cancelTime,
              paybackDisqualifiedAt: cancelTime,
              reasonCode: "REFUND_COMPLETED",
            },
          },
          { session }
        );
        await ArenaPaybackReview.updateMany(
          { cycleId: payment.accessCycleId, status: { $in: ["PENDING", "QUALIFIED", "HELD"] } },
          {
            $set: {
              status: "NOT_QUALIFIED",
              evaluatedAt: cancelTime,
              result: { qualified: false, reason: "REFUND_COMPLETED" },
            },
          },
          { session }
        );
      }
      if (payment.productCode === "MOCK_EXAM_ONLY") {
        await MockExamSubscription.updateMany(
          payment.mockExamSubscriptionId
            ? { _id: payment.mockExamSubscriptionId, userId: payment.userId }
            : { userId: payment.userId, status: "ACTIVE" },
          { $set: { status: "REFUNDED", endsAt: cancelTime, cancelledAt: cancelTime } },
          { session }
        );
      }

      const refundedAmount = (payment.refundedAmount || 0) + requestedAmount;
      payment.refundedAmount = refundedAmount;
      payment.refundStatus = refundedAmount >= payment.approvedAmount ? "FULL" : "PARTIAL";
      payment.status = refundedAmount >= payment.approvedAmount ? "REFUNDED" : "PARTIALLY_REFUNDED";
      payment.refundProcessedAt = cancelTime;
      payment.latestRefundRequestId = request._id;
      payment.refundTransactions.push({
        refundRequestId: request._id,
        requestedAt: request.requestedAt,
        calculationInputs: request.calculation.toObject
          ? request.calculation.toObject()
          : request.calculation,
        approvedAmount: requestedAmount,
        cancellationMode: mode,
        providerCancellationTransactionKey: transactionKey,
        providerCancelledAt: cancelTime,
        processedAt: new Date(),
        idempotencyKey,
      });
      await payment.save({ session });

      await CheckoutIntent.updateOne(
        { orderId: payment.orderReference, provider: payment.provider },
        {
          $set: {
            status: "CANCELLED",
            providerStatus: refundedAmount >= payment.approvedAmount
              ? "CANCELED"
              : "PARTIAL_CANCELED",
          },
        },
        { session }
      );

      request.status = "COMPLETED";
      request.decision = {
        approvedAmount: requestedAmount,
        cancellationMode: mode,
        providerCancellationTransactionKey: transactionKey,
        providerCancelledAt: cancelTime,
        processedAt: new Date(),
        processedBy: adminUserId,
        processedBySnapshot: actor,
        idempotencyKey,
        operatorNote: String(operatorNote || "").trim().slice(0, 1000),
      };
      await request.save({ session });

      const notificationKey = `refund-completed:${request._id}`;
      await UserNotification.updateOne(
        { dedupeKey: notificationKey },
        {
          $setOnInsert: {
            userId: request.userId,
            title: "환불 처리가 완료되었습니다",
            message: `${request.productNameSnapshot} ${requestedAmount.toLocaleString("ko-KR")}원이 원 결제수단으로 취소되었습니다.`,
            href: "/contact",
            dedupeKey: notificationKey,
            sourceType: "RefundRequest",
            sourceId: request._id,
            kind: "account",
          },
        },
        { upsert: true, session }
      );
      await AdminActionLog.create([{
        adminUserId,
        targetUserId: request.userId,
        action: "refund.complete",
        detail: request.orderReferenceSnapshot,
        metadata: {
          refundRequestId: String(request._id),
          approvedAmount: requestedAmount,
          cancellationMode: mode,
          providerCancellationTransactionKey: transactionKey,
          actorSnapshot: actor,
        },
      }], { session });
      recipient = await User.findById(request.userId).select("email").session(session).lean();
      completed = request;
    });
  } catch (error) {
    if (Number(error?.code) === 11000) {
      throw statusError(409, "이미 기록된 결제사 취소 거래이거나 다른 운영자가 먼저 처리했습니다.");
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (recipient?.email && completed) {
    try {
      await sendAdminUserEmail({
        to: recipient.email,
        subject: "환불 처리가 완료되었습니다",
        message: `${completed.productNameSnapshot} 환불 ${requestedAmount.toLocaleString("ko-KR")}원이 원 결제수단으로 취소되었습니다. 카드사·은행의 실제 반영 시점은 기관별로 다를 수 있습니다.`,
        idempotencyKey: `refund-completed:${completed._id}`,
      });
    } catch (error) {
      console.error("[refund] 완료 이메일 발송 실패", { refundRequestId, message: error?.message || "" });
    }
  }
  return completed;
}

async function getAdminRefundData({ page = 1, status = "" } = {}) {
  const allowed = new Set(["REQUESTED", "CALCULATED", "COMPLETED", "REJECTED"]);
  const normalizedStatus = allowed.has(String(status).toUpperCase()) ? String(status).toUpperCase() : "";
  const filter = normalizedStatus ? { status: normalizedStatus } : {};
  const total = await RefundRequest.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const currentPage = Math.min(safePage(page), totalPages);
  const requests = await RefundRequest.find(filter)
    .sort({ requestedAt: -1 })
    .skip((currentPage - 1) * ADMIN_PAGE_SIZE)
    .limit(ADMIN_PAGE_SIZE)
    .populate("userId", "name realName email")
    .populate("paymentId", "provider providerMode")
    .populate("calculation.calculatedBy", "name realName email")
    .populate("decision.processedBy", "name realName email")
    .lean();
  return { requests, status: normalizedStatus, page: currentPage, total, totalPages };
}

module.exports = {
  ADMIN_PAGE_SIZE,
  addBusinessDaysKst,
  calculateRefundRequest,
  completeRefundRequest,
  createRefundRequest,
  getAdminRefundData,
  listRefundableOrders,
};
