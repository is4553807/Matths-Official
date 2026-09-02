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
  approvePayment,
  createPaymentHash,
  getInicisConfig,
  networkCancelPayment,
} = require("./inicisPaymentService");

const COMPLETED_STATUS = "DONE";
const DEPOSIT_PENDING_STATUS = "WAITING_FOR_DEPOSIT";

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

function utf8Truncate(value, maxBytes) {
  let result = "";
  for (const character of clean(value, maxBytes)) {
    if (Buffer.byteLength(result + character, "utf8") > maxBytes) break;
    result += character;
  }
  return result;
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
  const config = getInicisConfig(environment);
  if (!intent?.orderId) {
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
  const timestamp = String(Date.now());
  const fields = {
    P_MID: config.mid,
    P_OID: intent.orderId,
    P_PAY_TYPE: "CARD",
    P_DEVICE_TYPE: "",
    P_IDCCODE: "Y",
    P_AMT: Number(intent.amount),
    P_GOODS: utf8Truncate(intent.productName, 80),
    P_UNAME: utf8Truncate(customerName || "Matths 회원", 30),
    P_NEXT_URL: `${origin}/payments/inicis/return`,
    P_CLOSE_URL: `${origin}/payments/inicis/close?orderId=${encodeURIComponent(
      intent.orderId
    )}`,
    P_TIMESTAMP: timestamp,
    P_CHARSET: "UTF-8",
    P_LANG: "ko",
    P_NOTI: intent.orderId,
    P_CHKFAKE: createPaymentHash({
      amount: intent.amount,
      orderId: intent.orderId,
      timestamp,
      hashKey: config.hashKey,
    }),
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.P_RESERVED = JSON.stringify({ email: utf8Truncate(email, 64) });
  }
  return {
    sdkUrl: config.sdkUrl,
    mode: config.mode,
    fields,
  };
}

function normalizeAuthenticationParameters(parameters = {}) {
  const normalized = {
    status: clean(parameters.P_STATUS, 10),
    message: clean(parameters.P_RMESG, 500),
    mid: clean(parameters.P_MID, 10),
    authTid: clean(parameters.P_AUTH_TID, 40),
    orderId: clean(parameters.P_OID, 40),
    amount: Number(parameters.P_AMT),
    idcName: clean(parameters.P_IDCNAME, 3).toLowerCase(),
    noti: clean(parameters.P_NOTI, 600),
    charset: clean(parameters.P_CHARSET || "UTF-8", 10).toUpperCase(),
  };
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(normalized.orderId)) {
    throw statusError(400, "주문번호 형식을 확인해주세요.", "ORDER_ID_INVALID");
  }
  if (normalized.status !== "00") return normalized;
  if (normalized.authTid.length < 6) {
    throw statusError(400, "결제 인증 거래번호가 누락되었습니다.", "INICIS_AUTH_TID_REQUIRED");
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
      "KG이니시스 승인 정보가 서버 주문과 일치하지 않습니다.",
      "INICIS_PAYMENT_MISMATCH"
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
    authTid: clean(payment.authTid, 40),
    idcName: clean(payment.idcName, 3).toLowerCase(),
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
    provider: "INICIS",
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
    const cancellation = await networkCancelPayment({
      authTid: normalized.authTid,
      amount: normalized.totalAmount,
      orderId: intent.orderId,
      idcName: normalized.idcName,
      reason: "Matths entitlement failure",
    });
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
    error.providerCancellationTransactionKey = clean(cancellation.P_APPL_TID, 200);
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

function approvedAtFromInicis(dateValue, timeValue) {
  const date = clean(dateValue, 8);
  const time = clean(timeValue, 6);
  if (!/^\d{8}$/.test(date) || !/^\d{6}$/.test(time)) return null;
  const value = new Date(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(
      0,
      2
    )}:${time.slice(2, 4)}:${time.slice(4, 6)}+09:00`
  );
  return Number.isNaN(value.getTime()) ? null : value;
}

function normalizeApprovedPayment(payment, intent, input, expectedMid) {
  const status = clean(payment.P_STATUS, 10);
  const paymentKey = clean(payment.P_APPL_TID, 40);
  const orderId = clean(payment.P_OID, 40);
  const amount = Number(payment.P_AMT);
  const mid = clean(payment.P_MID, 10);
  const method = clean(payment.P_TYPE, 20).toUpperCase();
  const noti = clean(payment.P_NOTI, 600);
  const approvedAt = approvedAtFromInicis(payment.P_APPL_DT, payment.P_APPL_TM);
  if (
    status !== "00" ||
    paymentKey.length < 6 ||
    orderId !== intent.orderId ||
    amount !== Number(intent.amount) ||
    mid !== expectedMid ||
    method !== "CARD" ||
    !approvedAt ||
    (noti && noti !== intent.orderId)
  ) {
    throw statusError(
      409,
      "KG이니시스 승인 정보가 서버 주문과 일치하지 않습니다.",
      "INICIS_APPROVAL_MISMATCH"
    );
  }
  return {
    paymentKey,
    orderId,
    totalAmount: amount,
    currency: "KRW",
    status: COMPLETED_STATUS,
    method,
    approvedAt,
    receipt: { url: "" },
    authTid: clean(payment.P_AUTH_TID || input.authTid, 40),
    idcName: input.idcName,
  };
}

async function rollbackInvalidApproval(intent, input, cause) {
  try {
    const cancellation = await networkCancelPayment({
      authTid: input.authTid,
      amount: intent.amount,
      orderId: intent.orderId,
      idcName: input.idcName,
      reason: "Matths approval verification failure",
    });
    await CheckoutIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: "CANCELLED",
          providerStatus: clean(cancellation.P_STATUS || "CANCELED", 60),
          failureCode: clean(cause?.code || "INICIS_APPROVAL_MISMATCH", 100),
          failureMessage: "승인 결과 검증에 실패해 결제를 즉시 망취소했습니다.",
        },
      }
    );
    throw statusError(
      409,
      "승인 정보가 주문과 일치하지 않아 결제를 자동 취소했습니다.",
      "PAYMENT_AUTOMATICALLY_CANCELLED"
    );
  } catch (rollbackError) {
    if (rollbackError?.code === "PAYMENT_AUTOMATICALLY_CANCELLED") throw rollbackError;
    await CheckoutIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          failureCode: "APPROVAL_VERIFICATION_REVIEW_REQUIRED",
          failureMessage: "결제 승인 결과와 망취소 상태를 운영자가 확인해야 합니다.",
        },
      }
    );
    const reviewError = statusError(
      500,
      "결제 상태를 운영자가 확인하고 있습니다. 같은 결제를 다시 시도하지 말고 문의해주세요.",
      "PAYMENT_REVIEW_REQUIRED"
    );
    reviewError.cause = cause;
    reviewError.rollbackCause = rollbackError;
    throw reviewError;
  }
}

async function confirmInicisCheckout(parameters) {
  const input = normalizeAuthenticationParameters(parameters);
  const intent = await findIntent(input.orderId);
  if (!intent) {
    throw statusError(404, "결제 주문을 찾을 수 없습니다.", "CHECKOUT_INTENT_NOT_FOUND");
  }
  const { mode, mid } = getInicisConfig();
  if (intent.provider !== "INICIS" || intent.providerMode !== mode) {
    throw statusError(409, "주문과 현재 결제 환경이 일치하지 않습니다.", "PAYMENT_MODE_MISMATCH");
  }
  if (
    input.mid !== mid ||
    input.noti !== intent.orderId ||
    input.charset !== "UTF-8"
  ) {
    throw statusError(
      409,
      "결제 인증 정보가 서버 주문과 일치하지 않습니다.",
      "INICIS_AUTH_MISMATCH"
    );
  }
  if (input.status !== "00") {
    const failure = await recordInicisCheckoutFailure({
      orderId: input.orderId,
      code: input.status || "INICIS_AUTH_FAILED",
      message: input.message || "결제 인증이 완료되지 않았습니다.",
    });
    return failure ? { state: "FAILED", ...failure } : null;
  }
  if (Number(intent.amount) !== input.amount) {
    throw statusError(
      409,
      "결제창 금액이 서버 주문 금액과 일치하지 않습니다.",
      "PAYMENT_AMOUNT_MISMATCH"
    );
  }
  if (intent.status === "PAID") {
    return replayResult(intent);
  }
  if (["CANCELLED", "EXPIRED"].includes(intent.status)) {
    throw statusError(410, "취소되었거나 만료된 결제 주문입니다.", "CHECKOUT_INTENT_CLOSED");
  }
  if (intent.status === "REVIEW_REQUIRED") {
    throw statusError(
      409,
      "결제 상태를 운영자가 확인하고 있습니다. 같은 결제를 다시 시도하지 말고 문의해주세요.",
      "PAYMENT_REVIEW_REQUIRED"
    );
  }
  if (new Date(intent.expiresAt).getTime() < Date.now()) {
    await CheckoutIntent.updateOne(
      { _id: intent._id, status: { $in: ["AWAITING_PG", "AWAITING_DEPOSIT"] } },
      { $set: { status: "EXPIRED" } }
    );
    throw statusError(410, "결제 주문 유효시간이 지났습니다. 주문을 새로 만들어주세요.", "CHECKOUT_INTENT_EXPIRED");
  }

  const claim = await CheckoutIntent.updateOne(
    { _id: intent._id, status: "AWAITING_PG" },
    {
      $set: {
        status: "APPROVING",
        providerStatus: "AUTHENTICATED",
        failureCode: "",
        failureMessage: "",
      },
    }
  );
  if (claim.modifiedCount !== 1) {
    const current = await findIntent(intent.orderId);
    if (current?.status === "PAID") return replayResult(current);
    if (current?.status === "APPROVING") {
      throw statusError(
        409,
        "이미 결제 승인을 처리하고 있습니다. 잠시 후 결제 내역을 확인해주세요.",
        "PAYMENT_APPROVAL_IN_PROGRESS"
      );
    }
    if (current?.status === "REVIEW_REQUIRED") {
      throw statusError(
        409,
        "결제 상태를 운영자가 확인하고 있습니다. 같은 결제를 다시 시도하지 말고 문의해주세요.",
        "PAYMENT_REVIEW_REQUIRED"
      );
    }
    throw statusError(409, "결제 주문 상태가 변경되었습니다.", "CHECKOUT_INTENT_STATE_CHANGED");
  }
  intent.status = "APPROVING";

  let approved;
  try {
    approved = await approvePayment({
      authTid: input.authTid,
      amount: intent.amount,
      idcName: input.idcName,
    });
  } catch (approvalError) {
    const uncertain =
      Number(approvalError?.status) >= 500 ||
      Number(approvalError?.providerHttpStatus) >= 500;
    await CheckoutIntent.updateOne(
      { _id: intent._id, status: "APPROVING" },
      {
        $set: {
          status: uncertain ? "REVIEW_REQUIRED" : "CANCELLED",
          failureCode: clean(approvalError?.code || "INICIS_APPROVAL_FAILED", 100),
          failureMessage: clean(approvalError?.message, 500),
        },
      }
    );
    throw approvalError;
  }
  let payment;
  try {
    payment = normalizeApprovedPayment(approved, intent, input, mid);
  } catch (verificationError) {
    return rollbackInvalidApproval(intent, input, verificationError);
  }
  const result = await finalizeVerifiedPayment(intent, payment, payment.paymentKey);
  return result;
}

async function recordInicisCheckoutFailure({ orderId, code, message } = {}) {
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

module.exports = {
  buildCheckoutClientConfig,
  confirmInicisCheckout,
  recordInicisCheckoutFailure,
  resultBackLink,
  _testing: {
    approvedAtFromInicis,
    assertPaymentMatchesIntent,
    normalizeApprovedPayment,
    normalizeAuthenticationParameters,
    safePublicOrigin,
    utf8Truncate,
  },
};
