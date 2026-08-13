const {
  ArenaPackagePayment,
} = require("../models/goatArenaModel");
const { CheckoutIntent } = require("../models/parentModel");
const {
  applyApprovedPackagePayment,
} = require("./accessCycleService");
const {
  applyApprovedMockExamPayment,
} = require("./mockExamPaymentService");
const {
  cancelPayment,
  confirmPayment,
  getPaymentByOrderId,
  getTossConfig,
} = require("./tossPaymentService");

const COMPLETED_STATUS = "DONE";
const DEPOSIT_PENDING_STATUS = "WAITING_FOR_DEPOSIT";
const CANCELLED_STATUSES = new Set(["CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"]);

function clean(value, maxLength = 500) {
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

function safePublicOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
    return url.origin;
  } catch (_error) {
    throw statusError(500, "결제 결과 주소 설정을 확인해주세요.", "PAYMENT_BASE_URL_INVALID");
  }
}

function safeReceiptUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString().slice(0, 1000) : "";
  } catch (_error) {
    return "";
  }
}

function buildCheckoutClientConfig(
  intent,
  {
    baseUrl,
    customerEmail = "",
    customerName = "",
    environment = process.env,
  } = {}
) {
  const config = getTossConfig(environment);
  if (!intent?.orderId || !intent?.customerKey) {
    throw statusError(500, "결제 주문 정보를 불러오지 못했습니다.", "CHECKOUT_INTENT_INCOMPLETE");
  }
  if (intent.providerMode !== config.mode) {
    throw statusError(
      409,
      "결제 실행 모드가 변경되었습니다. 주문을 새로 만들어주세요.",
      "PAYMENT_MODE_CHANGED"
    );
  }
  const origin = safePublicOrigin(baseUrl);
  const email = clean(customerEmail, 100);
  return {
    clientKey: config.clientKey,
    mode: config.mode,
    customerKey: intent.customerKey,
    amount: Number(intent.amount),
    currency: intent.currency || "KRW",
    orderId: intent.orderId,
    orderName: clean(intent.productName, 100),
    customerEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    customerName: clean(customerName, 100),
    successUrl: `${origin}/payments/toss/success`,
    failUrl: `${origin}/payments/toss/fail`,
    paymentVariantKey: config.paymentVariantKey,
    agreementVariantKey: config.agreementVariantKey,
  };
}

function normalizeSuccessParameters({ paymentKey, orderId, amount } = {}) {
  const normalized = {
    paymentKey: clean(paymentKey, 200),
    orderId: clean(orderId, 64),
    amount: Number(amount),
  };
  if (normalized.paymentKey.length < 6) {
    throw statusError(400, "결제 승인 키가 누락되었습니다.", "PAYMENT_KEY_REQUIRED");
  }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(normalized.orderId)) {
    throw statusError(400, "주문번호 형식을 확인해주세요.", "ORDER_ID_INVALID");
  }
  if (!Number.isSafeInteger(normalized.amount) || normalized.amount < 1) {
    throw statusError(400, "결제 금액 형식을 확인해주세요.", "PAYMENT_AMOUNT_INVALID");
  }
  return normalized;
}

function assertPaymentMatchesIntent(payment, intent, expectedPaymentKey = "") {
  const totalAmount = Number(payment?.totalAmount);
  const paymentKey = clean(payment?.paymentKey, 200);
  const orderId = clean(payment?.orderId, 64);
  const currency = clean(payment?.currency || "KRW", 3).toUpperCase();
  if (
    !paymentKey ||
    (expectedPaymentKey && paymentKey !== expectedPaymentKey) ||
    orderId !== intent.orderId ||
    totalAmount !== Number(intent.amount) ||
    currency !== String(intent.currency || "KRW").toUpperCase()
  ) {
    throw statusError(
      409,
      "토스페이먼츠 승인 정보가 서버 주문과 일치하지 않습니다.",
      "TOSS_PAYMENT_MISMATCH"
    );
  }
  return {
    paymentKey,
    orderId,
    totalAmount,
    currency,
    status: clean(payment.status, 60).toUpperCase(),
    method: clean(payment.method, 80),
    approvedAt: payment.approvedAt ? new Date(payment.approvedAt) : null,
    receiptUrl: safeReceiptUrl(payment.receipt?.url),
  };
}

async function findIntent(orderId) {
  return CheckoutIntent.findOne({ orderId })
    .select("+customerKey +confirmIdempotencyKey +providerPaymentKey")
    .exec();
}

function resultBackLink(intent) {
  if (intent?.requestedBy === "PARENT") {
    return { href: "/parent/pricing", label: "학부모 이용권으로 돌아가기" };
  }
  return { href: "/pricing", label: "이용권으로 돌아가기" };
}

async function replayResult(intent) {
  const payment = await ArenaPackagePayment.findOne({
    orderReference: intent.orderId,
  }).lean();
  if (!payment) {
    throw statusError(409, "결제 완료 기록을 확인 중입니다. 잠시 후 다시 시도해주세요.", "PAYMENT_LEDGER_PENDING");
  }
  return {
    state: "PAID",
    intent,
    payment,
    replayed: true,
    backLink: resultBackLink(intent),
  };
}

async function applyEntitlement(intent, payment, normalized) {
  const approval = {
    userId: intent.studentUserId,
    provider: "TOSS",
    providerMode: intent.providerMode,
    providerPaymentKey: normalized.paymentKey,
    orderReference: intent.orderId,
    idempotencyKey: `entitlement-${intent.orderId}`,
    currency: normalized.currency,
    approvedAmount: normalized.totalAmount,
    approvedAt: normalized.approvedAt,
    productCode: intent.productCode,
    productName: intent.productName,
  };
  if (intent.productCode === "MOCK_EXAM_ONLY") {
    return applyApprovedMockExamPayment({
      ...approval,
      purchaseMode: intent.requestedBy === "PARENT" ? "PARENT_REQUEST" : "SELF",
    });
  }
  if (intent.productCode === "LEARNING_PACKAGE_29") {
    return applyApprovedPackagePayment(approval);
  }
  throw statusError(409, "결제 상품을 확인할 수 없습니다.", "PAYMENT_PRODUCT_INVALID");
}

async function markIntentFromPayment(intent, normalized, status) {
  await CheckoutIntent.updateOne(
    { _id: intent._id },
    {
      $set: {
        status,
        providerPaymentKey: normalized.paymentKey,
        providerStatus: normalized.status,
        paymentMethod: normalized.method,
        approvedAt: normalized.approvedAt,
        receiptUrl: normalized.receiptUrl,
        failureCode: "",
        failureMessage: "",
      },
    }
  );
  Object.assign(intent, {
    status,
    providerPaymentKey: normalized.paymentKey,
    providerStatus: normalized.status,
    paymentMethod: normalized.method,
    approvedAt: normalized.approvedAt,
    receiptUrl: normalized.receiptUrl,
  });
}

async function rollbackApproval(intent, normalized, cause) {
  try {
    const entitlementFailureCode = clean(
      cause?.code || "ENTITLEMENT_APPLY_FAILED",
      100
    );
    const entitlementFailureMessage = clean(
      cause?.message || "이용권 지급 조건을 확인할 수 없습니다.",
      300
    );
    const cancellation = await cancelPayment({
      paymentKey: normalized.paymentKey,
      cancelReason: "Matths 이용권 지급 실패에 따른 자동 전체 취소",
      idempotencyKey: `rollback-${intent.orderId}`,
    });
    const latestCancel = Array.isArray(cancellation.cancels)
      ? cancellation.cancels.at(-1)
      : null;
    await CheckoutIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: "CANCELLED",
          providerPaymentKey: normalized.paymentKey,
          providerStatus: clean(cancellation.status || "CANCELED", 60),
          failureCode: entitlementFailureCode,
          failureMessage: clean(
            `결제 승인 후 이용권 지급에 실패해 자동 전체 취소했습니다. 원인: ${entitlementFailureMessage}`,
            500
          ),
          approvedAt: normalized.approvedAt,
        },
      }
    );
    const error = statusError(
      409,
      "이용권을 적용할 수 없어 승인된 결제를 자동으로 전체 취소했습니다.",
      "PAYMENT_AUTOMATICALLY_CANCELLED"
    );
    error.entitlementFailureCode = entitlementFailureCode;
    error.providerCancellationTransactionKey = clean(latestCancel?.transactionKey, 200);
    throw error;
  } catch (rollbackError) {
    if (rollbackError?.code === "PAYMENT_AUTOMATICALLY_CANCELLED") throw rollbackError;
    await CheckoutIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          providerPaymentKey: normalized.paymentKey,
          providerStatus: normalized.status,
          failureCode: "ENTITLEMENT_APPLY_FAILED_REVIEW_REQUIRED",
          failureMessage: "결제 승인과 이용권 상태를 운영자가 확인해야 합니다.",
        },
      }
    );
    const error = statusError(
      500,
      "결제 상태를 운영자가 확인하고 있습니다. 같은 결제를 다시 시도하지 말고 문의해주세요.",
      "PAYMENT_REVIEW_REQUIRED"
    );
    error.cause = cause;
    error.rollbackCause = rollbackError;
    throw error;
  }
}

async function finalizeVerifiedPayment(intent, payment, expectedPaymentKey = "") {
  const normalized = assertPaymentMatchesIntent(payment, intent, expectedPaymentKey);
  if (normalized.status === DEPOSIT_PENDING_STATUS) {
    await markIntentFromPayment(intent, normalized, "AWAITING_DEPOSIT");
    return {
      state: "AWAITING_DEPOSIT",
      intent,
      payment,
      backLink: resultBackLink(intent),
    };
  }
  if (normalized.status !== COMPLETED_STATUS || !normalized.approvedAt) {
    throw statusError(
      409,
      "결제가 아직 최종 승인 상태가 아닙니다.",
      "PAYMENT_NOT_COMPLETED"
    );
  }
  let entitlement;
  try {
    entitlement = await applyEntitlement(intent, payment, normalized);
  } catch (error) {
    return rollbackApproval(intent, normalized, error);
  }
  await markIntentFromPayment(intent, normalized, "PAID");
  return {
    state: "PAID",
    intent,
    payment: entitlement.payment || payment,
    entitlement,
    replayed: Boolean(entitlement.replayed),
    backLink: resultBackLink(intent),
  };
}

async function confirmTossCheckout(parameters) {
  const input = normalizeSuccessParameters(parameters);
  const intent = await findIntent(input.orderId);
  if (!intent) {
    throw statusError(404, "결제 주문을 찾을 수 없습니다.", "CHECKOUT_INTENT_NOT_FOUND");
  }
  const { mode } = getTossConfig();
  if (intent.provider !== "TOSS" || intent.providerMode !== mode) {
    throw statusError(409, "주문과 현재 결제 환경이 일치하지 않습니다.", "PAYMENT_MODE_MISMATCH");
  }
  if (Number(intent.amount) !== input.amount) {
    throw statusError(
      409,
      "결제창 금액이 서버 주문 금액과 일치하지 않습니다.",
      "PAYMENT_AMOUNT_MISMATCH"
    );
  }
  if (intent.status === "PAID") {
    if (intent.providerPaymentKey && intent.providerPaymentKey !== input.paymentKey) {
      throw statusError(409, "이미 완료된 주문의 결제 키와 일치하지 않습니다.", "PAYMENT_KEY_MISMATCH");
    }
    return replayResult(intent);
  }
  if (["CANCELLED", "EXPIRED"].includes(intent.status)) {
    throw statusError(410, "취소되었거나 만료된 결제 주문입니다.", "CHECKOUT_INTENT_CLOSED");
  }
  if (new Date(intent.expiresAt).getTime() < Date.now()) {
    await CheckoutIntent.updateOne(
      { _id: intent._id, status: { $in: ["AWAITING_PG", "AWAITING_DEPOSIT"] } },
      { $set: { status: "EXPIRED" } }
    );
    throw statusError(410, "결제 주문 유효시간이 지났습니다. 주문을 새로 만들어주세요.", "CHECKOUT_INTENT_EXPIRED");
  }

  let payment;
  try {
    payment = await confirmPayment({
      paymentKey: input.paymentKey,
      orderId: intent.orderId,
      amount: intent.amount,
      idempotencyKey: intent.confirmIdempotencyKey,
    });
  } catch (confirmError) {
    try {
      const current = await getPaymentByOrderId(intent.orderId);
      const normalized = assertPaymentMatchesIntent(current, intent, input.paymentKey);
      if ([COMPLETED_STATUS, DEPOSIT_PENDING_STATUS].includes(normalized.status)) {
        payment = current;
      } else {
        throw confirmError;
      }
    } catch (_lookupError) {
      await CheckoutIntent.updateOne(
        { _id: intent._id },
        {
          $set: {
            failureCode: clean(confirmError?.code || "TOSS_CONFIRM_FAILED", 100),
            failureMessage: clean(confirmError?.message, 500),
          },
        }
      );
      throw confirmError;
    }
  }
  return finalizeVerifiedPayment(intent, payment, input.paymentKey);
}

async function recordTossCheckoutFailure({ orderId, code, message } = {}) {
  const normalizedOrderId = clean(orderId, 64);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(normalizedOrderId)) return null;
  const intent = await findIntent(normalizedOrderId);
  if (!intent) return null;
  if (["AWAITING_PG", "AWAITING_DEPOSIT"].includes(intent.status)) {
    await CheckoutIntent.updateOne(
      { _id: intent._id, status: { $in: ["AWAITING_PG", "AWAITING_DEPOSIT"] } },
      {
        $set: {
          status: "CANCELLED",
          failureCode: clean(code || "PAYMENT_WINDOW_FAILED", 100),
          failureMessage: clean(message || "결제가 완료되지 않았습니다.", 500),
        },
      }
    );
    intent.status = "CANCELLED";
  }
  return { intent, backLink: resultBackLink(intent) };
}

function webhookOrderId(payload = {}) {
  return clean(payload?.data?.orderId || payload?.orderId, 64);
}

async function reconcileTossWebhook(payload = {}) {
  const orderId = webhookOrderId(payload);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) {
    return { action: "IGNORED", reason: "ORDER_ID_MISSING" };
  }
  const intent = await findIntent(orderId);
  if (!intent) return { action: "IGNORED", reason: "ORDER_NOT_OURS" };
  const payment = await getPaymentByOrderId(orderId);
  const normalized = assertPaymentMatchesIntent(payment, intent);
  if (normalized.status === COMPLETED_STATUS) {
    if (intent.status === "PAID") return { action: "REPLAYED", orderId };
    const result = await finalizeVerifiedPayment(intent, payment, normalized.paymentKey);
    return { action: result.state, orderId };
  }
  if (normalized.status === DEPOSIT_PENDING_STATUS) {
    await markIntentFromPayment(intent, normalized, "AWAITING_DEPOSIT");
    return { action: "AWAITING_DEPOSIT", orderId };
  }
  if (CANCELLED_STATUSES.has(normalized.status)) {
    if (intent.status === "PAID") {
      console.error("[payments] Toss cancellation requires entitlement review", {
        orderId,
        providerStatus: normalized.status,
      });
      await CheckoutIntent.updateOne(
        { _id: intent._id },
        { $set: { providerStatus: normalized.status } }
      );
      return { action: "REVIEW_REQUIRED", orderId };
    }
    await CheckoutIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: "CANCELLED",
          providerStatus: normalized.status,
          providerPaymentKey: normalized.paymentKey,
        },
      }
    );
    return { action: "CANCELLED", orderId };
  }
  await CheckoutIntent.updateOne(
    { _id: intent._id },
    { $set: { providerStatus: normalized.status } }
  );
  return { action: "NO_CHANGE", orderId, providerStatus: normalized.status };
}

module.exports = {
  buildCheckoutClientConfig,
  confirmTossCheckout,
  recordTossCheckoutFailure,
  reconcileTossWebhook,
  resultBackLink,
  _testing: {
    assertPaymentMatchesIntent,
    normalizeSuccessParameters,
    safePublicOrigin,
    webhookOrderId,
  },
};
