const TOSS_API_ORIGIN = "https://api.tosspayments.com";
const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";
const TOSS_WIDGET_VARIANT_KEY = "DEFAULT";
const TOSS_AGREEMENT_VARIANT_KEY = "AGREEMENT";
const API_TIMEOUT_MS = 15_000;

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

function tossMode(environment = process.env) {
  const mode = clean(environment.TOSS_PAYMENTS_MODE || "TEST", 10).toUpperCase();
  if (!["TEST", "LIVE"].includes(mode)) {
    throw statusError(
      503,
      "토스페이먼츠 실행 모드는 TEST 또는 LIVE여야 합니다.",
      "TOSS_MODE_INVALID"
    );
  }
  return mode;
}

function keyNamesForMode(mode) {
  return mode === "LIVE"
    ? { client: "TOSS_LIVE_CLIENT_KEY", secret: "TOSS_LIVE_SECRET_KEY" }
    : { client: "TOSS_TEST_CLIENT_KEY", secret: "TOSS_TEST_SECRET_KEY" };
}

function validKeyPair({ mode, clientKey, secretKey }) {
  const prefix = mode === "LIVE" ? "live" : "test";
  return (
    new RegExp(`^${prefix}_gck_`).test(clientKey) &&
    new RegExp(`^${prefix}_gsk_`).test(secretKey)
  );
}

function getTossConfig(environment = process.env) {
  const mode = tossMode(environment);
  const names = keyNamesForMode(mode);
  const clientKey = clean(environment[names.client], 300);
  const secretKey = clean(environment[names.secret], 300);
  if (!clientKey || !secretKey) {
    throw statusError(
      503,
      `${names.client}와 ${names.secret}를 서버 환경변수에 등록해주세요.`,
      "TOSS_KEYS_REQUIRED"
    );
  }
  if (!validKeyPair({ mode, clientKey, secretKey })) {
    throw statusError(
      503,
      `${mode} 결제위젯의 클라이언트 키와 시크릿 키가 서로 맞지 않습니다.`,
      "TOSS_KEY_PAIR_INVALID"
    );
  }
  return {
    mode,
    clientKey,
    secretKey,
    paymentVariantKey: clean(
      environment.TOSS_WIDGET_VARIANT_KEY || TOSS_WIDGET_VARIANT_KEY,
      80
    ),
    agreementVariantKey: clean(
      environment.TOSS_AGREEMENT_VARIANT_KEY || TOSS_AGREEMENT_VARIANT_KEY,
      80
    ),
  };
}

function isTossConfigured(environment = process.env) {
  try {
    getTossConfig(environment);
    return true;
  } catch (_error) {
    return false;
  }
}

class TossApiError extends Error {
  constructor({ responseStatus, code, message, payload = null }) {
    super(clean(message, 500) || "토스페이먼츠 요청을 완료하지 못했습니다.");
    this.name = "TossApiError";
    this.status = responseStatus >= 500 || responseStatus === 401 ? 502 : 400;
    this.code = clean(code, 100) || "TOSS_API_ERROR";
    this.providerHttpStatus = responseStatus;
    this.providerPayload = payload;
    this.expose = responseStatus < 500 && responseStatus !== 401;
  }
}

async function tossApiRequest(
  path,
  {
    method = "GET",
    body,
    idempotencyKey = "",
    environment = process.env,
    fetchImpl = globalThis.fetch,
  } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw statusError(500, "서버의 HTTP 요청 기능을 사용할 수 없습니다.", "FETCH_UNAVAILABLE");
  }
  const { secretKey } = getTossConfig(environment);
  const headers = {
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = clean(idempotencyKey, 300);

  let response;
  try {
    response = await fetchImpl(`${TOSS_API_ORIGIN}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    const unavailable = statusError(
      502,
      "토스페이먼츠 승인 서버와 통신하지 못했습니다. 잠시 후 결제 상태를 다시 확인해주세요.",
      "TOSS_API_UNAVAILABLE"
    );
    unavailable.cause = error;
    throw unavailable;
  }

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      payload = { message: "토스페이먼츠 응답 형식이 올바르지 않습니다." };
    }
  }
  if (!response.ok) {
    throw new TossApiError({
      responseStatus: response.status,
      code: payload.code,
      message: payload.message,
      payload,
    });
  }
  return payload;
}

function confirmPayment(
  { paymentKey, orderId, amount, idempotencyKey },
  options = {}
) {
  return tossApiRequest("/v1/payments/confirm", {
    ...options,
    method: "POST",
    idempotencyKey,
    body: {
      paymentKey: clean(paymentKey, 200),
      orderId: clean(orderId, 64),
      amount: Number(amount),
    },
  });
}

function getPaymentByOrderId(orderId, options = {}) {
  return tossApiRequest(
    `/v1/payments/orders/${encodeURIComponent(clean(orderId, 64))}`,
    options
  );
}

function getPaymentByPaymentKey(paymentKey, options = {}) {
  return tossApiRequest(
    `/v1/payments/${encodeURIComponent(clean(paymentKey, 200))}`,
    options
  );
}

function cancelPayment(
  { paymentKey, cancelReason, cancelAmount, idempotencyKey },
  options = {}
) {
  const body = { cancelReason: clean(cancelReason, 200) };
  if (cancelAmount !== undefined && cancelAmount !== null) {
    body.cancelAmount = Number(cancelAmount);
  }
  return tossApiRequest(
    `/v1/payments/${encodeURIComponent(clean(paymentKey, 200))}/cancel`,
    {
      ...options,
      method: "POST",
      idempotencyKey,
      body,
    }
  );
}

module.exports = {
  TOSS_AGREEMENT_VARIANT_KEY,
  TOSS_API_ORIGIN,
  TOSS_SDK_URL,
  TOSS_WIDGET_VARIANT_KEY,
  TossApiError,
  cancelPayment,
  confirmPayment,
  getPaymentByOrderId,
  getPaymentByPaymentKey,
  getTossConfig,
  isTossConfigured,
  tossApiRequest,
  tossMode,
  _testing: {
    keyNamesForMode,
    validKeyPair,
  },
};
