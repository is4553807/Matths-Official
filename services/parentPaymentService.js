const mongoose = require("mongoose");
const {
  ArenaPackagePayment,
} = require("../models/goatArenaModel");
const { CheckoutIntent } = require("../models/parentModel");
const { RefundRequest } = require("../models/refundModel");
const { createAdminTodo } = require("./adminTodoService");
const { createRefundRequest } = require("./refundService");

const REFUNDABLE_PAYMENT_STATUSES = new Set([
  "APPROVED",
  "APPLIED",
  "PARTIALLY_REFUNDED",
]);
const ACTIVE_REFUND_STATUSES = new Set(["REQUESTED", "CALCULATED"]);

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertIds(parentAccountId, studentUserId) {
  if (
    !mongoose.isValidObjectId(parentAccountId) ||
    !mongoose.isValidObjectId(studentUserId)
  ) {
    throw statusError(400, "학부모 또는 자녀 계정 정보를 확인해주세요.");
  }
}

function effectiveCheckoutStatus(intent, now) {
  if (
    ["AWAITING_PG", "AWAITING_DEPOSIT"].includes(intent.status) &&
    new Date(intent.expiresAt).getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return intent.status;
}

function displayStatus({ intentStatus, payment, refund }) {
  if (payment?.refundStatus === "FULL" || payment?.status === "REFUNDED") {
    return "REFUNDED";
  }
  if (payment?.refundStatus === "PARTIAL" || payment?.status === "PARTIALLY_REFUNDED") {
    return "PARTIALLY_REFUNDED";
  }
  if (refund?.status === "CALCULATED") return "REFUND_CALCULATED";
  if (refund?.status === "REQUESTED") return "REFUND_REQUESTED";
  return intentStatus;
}

function checkoutFailureDisplayMessage(intent = {}) {
  if (intent.status !== "CANCELLED") return "";
  const codes = String(intent.failureCode || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const messages = {
    AVAILABLE_BALANCE_REMAINS:
      "자녀 계정에 기존 학습권의 사용 가능한 학습일이 남아 있어 결제가 자동 취소되었습니다.",
    LOCKED_BALANCE_REMAINS:
      "GOAT Arena 경기에 예치된 학습일이 있어 결제가 자동 취소되었습니다.",
    LOCKED_PAYBACK_SCORE_REMAINS:
      "GOAT Arena 경기에 예치된 페이백 점수가 있어 결제가 자동 취소되었습니다.",
    RESERVED_BALANCE_REMAINS:
      "Ranked 초대에 예약된 학습일이 있어 결제가 자동 취소되었습니다.",
    PENDING_SETTLEMENT:
      "정산이 끝나지 않은 GOAT Arena 경기가 있어 결제가 자동 취소되었습니다.",
    PACKAGE_PURCHASE_NOT_ELIGIBLE:
      "자녀 계정의 기존 학습권 상태 때문에 결제가 자동 취소되었습니다.",
    MOCK_SUBSCRIPTION_ALREADY_ACTIVE:
      "이미 사용 중인 모의고사 이용권이 있어 결제가 자동 취소되었습니다.",
    ACTIVE_POLICY_NOT_FOUND:
      "승인 시각에 적용할 이용권 정책을 찾지 못해 결제가 자동 취소되었습니다.",
    PAYMENT_AMOUNT_MISMATCH:
      "승인 금액과 적용 가격이 일치하지 않아 결제가 자동 취소되었습니다.",
    PAYMENT_CURRENCY_MISMATCH:
      "승인 통화와 적용 통화가 일치하지 않아 결제가 자동 취소되었습니다.",
    ACCOUNT_NOT_ACTIVE:
      "자녀 계정이 활성 상태가 아니어서 결제가 자동 취소되었습니다.",
  };
  return (
    codes.map((code) => messages[code]).find(Boolean) ||
    "이용권 적용 조건을 충족하지 못해 결제가 자동 취소되었습니다. 실제 승인 금액은 KG이니시스에서 전체 취소 처리되었습니다."
  );
}

async function getParentPaymentManagement({
  parentAccountId,
  studentUserId,
  now = new Date(),
}) {
  assertIds(parentAccountId, studentUserId);
  const intents = await CheckoutIntent.find({
    parentAccountId,
    studentUserId,
    requestedBy: "PARENT",
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .lean();
  const orderIds = intents.map((intent) => intent.orderId).filter(Boolean);
  const payments = orderIds.length
    ? await ArenaPackagePayment.find({
        userId: studentUserId,
        orderReference: { $in: orderIds },
      })
        .select(
          "userId orderReference status approvedAt approvedAmount currency productCode productName refundedAmount refundStatus provider providerMode"
        )
        .lean()
    : [];
  const paymentIds = payments.map((payment) => payment._id);
  const refunds = paymentIds.length
    ? await RefundRequest.find({ paymentId: { $in: paymentIds } })
        .sort({ requestedAt: -1, _id: -1 })
        .select(
          "paymentId requestedByType parentAccountId status requestedAt processingDeadlineAt reasonType reasonDetail calculation decision"
        )
        .lean()
    : [];

  const paymentByOrder = new Map(
    payments.map((payment) => [String(payment.orderReference), payment])
  );
  const latestRefundByPayment = new Map();
  for (const refund of refunds) {
    const key = String(refund.paymentId);
    if (!latestRefundByPayment.has(key)) latestRefundByPayment.set(key, refund);
  }

  const orders = intents.map((intent) => {
    const payment = paymentByOrder.get(String(intent.orderId)) || null;
    const refund = payment
      ? latestRefundByPayment.get(String(payment._id)) || null
      : null;
    const remainingAmount = payment
      ? Math.max(
          0,
          Number(payment.approvedAmount || 0) - Number(payment.refundedAmount || 0)
        )
      : 0;
    const intentStatus = effectiveCheckoutStatus(intent, now);
    const activeRefund = refund && ACTIVE_REFUND_STATUSES.has(refund.status);
    return {
      id: String(intent._id),
      orderId: intent.orderId || String(intent._id),
      productCode: intent.productCode,
      productName: intent.productName,
      amount: Number(intent.amount || 0),
      currency: intent.currency || "KRW",
      createdAt: intent.createdAt,
      expiresAt: intent.expiresAt,
      approvedAt: intent.approvedAt || payment?.approvedAt || null,
      paymentMethod: intent.paymentMethod || "",
      receiptUrl: intent.receiptUrl || "",
      providerMode: intent.providerMode || payment?.providerMode || "",
      intentStatus,
      status: displayStatus({ intentStatus, payment, refund }),
      failureCode: intent.failureCode || "",
      failureDisplayMessage:
        checkoutFailureDisplayMessage(intent),
      paymentId: payment ? String(payment._id) : "",
      payment,
      refund,
      remainingAmount,
      isRefundable: Boolean(
        payment &&
        remainingAmount > 0 &&
        REFUNDABLE_PAYMENT_STATUSES.has(payment.status) &&
        !activeRefund
      ),
    };
  });

  const paidPayments = payments.filter((payment) =>
    ["APPLIED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)
  );
  return {
    orders,
    summary: {
      orderCount: intents.length,
      paidCount: paidPayments.length,
      paidAmount: paidPayments.reduce(
        (sum, payment) => sum + Number(payment.approvedAmount || 0),
        0
      ),
      refundedAmount: paidPayments.reduce(
        (sum, payment) => sum + Number(payment.refundedAmount || 0),
        0
      ),
      refundableCount: orders.filter((order) => order.isRefundable).length,
    },
  };
}

async function requestParentPaymentRefund({
  parentAccountId,
  studentUserId,
  paymentId,
  reasonType,
  reasonDetail,
}) {
  assertIds(parentAccountId, studentUserId);
  if (!mongoose.isValidObjectId(paymentId)) {
    throw statusError(400, "환불할 결제 주문을 확인해주세요.");
  }
  const payment = await ArenaPackagePayment.findOne({
    _id: paymentId,
    userId: studentUserId,
  }).lean();
  if (!payment) {
    throw statusError(404, "환불할 결제 기록을 찾을 수 없습니다.");
  }
  const ownedIntent = await CheckoutIntent.exists({
    parentAccountId,
    studentUserId,
    requestedBy: "PARENT",
    orderId: payment.orderReference,
  });
  if (!ownedIntent) {
    throw statusError(
      403,
      "이 학부모 계정에서 결제한 주문만 환불을 신청할 수 있습니다.",
      "PARENT_PAYMENT_OWNERSHIP_REQUIRED"
    );
  }

  const request = await createRefundRequest({
    userId: studentUserId,
    paymentId: payment._id,
    reasonType,
    reasonDetail,
    requestedByType: "PARENT",
    parentAccountId,
  });
  await createAdminTodo({
    category: "inquiry",
    title: `학부모 환불 신청 · ${request.productNameSnapshot}`,
    description: request.reasonDetail,
    href: `/admin/refunds?status=REQUESTED#refund-${request._id}`,
    targetUserId: studentUserId,
    actorUserId: null,
    sourceType: "RefundRequest",
    sourceId: request._id,
    metadata: {
      requestedByType: "PARENT",
      parentAccountId: String(parentAccountId),
      orderReference: request.orderReferenceSnapshot,
    },
  });
  return request;
}

module.exports = {
  getParentPaymentManagement,
  requestParentPaymentRefund,
  _testing: {
    checkoutFailureDisplayMessage,
    displayStatus,
    effectiveCheckoutStatus,
  },
};
