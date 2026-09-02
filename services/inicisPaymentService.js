const { createHash } = require("node:crypto");

const INICIS_LIVE_SDK_URL =
  "https://paypro.inicis.com/std/payment/js/INIPayPro_v2.js";
const INICIS_TEST_SDK_URL =
  "https://stgpaypro.inicis.com/std/payment/js/INIPayPro_v2.js";
const INICIS_LIVE_CANCEL_URL = "https://iniapi.inicis.com/api/v1/refund";
const INICIS_TEST_CANCEL_URL = "https://stginiapi.inicis.com/api/v1/refund";
const API_TIMEOUT_MS = 15_000;
const ALLOWED_IDC_NAMES = new Set(["fc", "ks", "stg"]);

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

function inicisMode(environment = process.env) {
  const mode = clean(environment.INICIS_PAYMENTS_MODE || "TEST", 10).toUpperCase();
  if (!["TEST", "LIVE"].includes(mode)) {
    throw statusError(
      503,
      "KG이니시스 실행 모드는 TEST 또는 LIVE여야 합니다.",
      "INICIS_MODE_INVALID"
    );
  }
  return mode;
}

function keyNamesForMode(mode) {
  const prefix = mode === "LIVE" ? "INICIS_LIVE" : "INICIS_TEST";
  return {
    mid: `${prefix}_MID`,
    hashKey: `${prefix}_HASH_KEY`,
    apiKey: `${prefix}_API_KEY`,
    clientIp: `${prefix}_CLIENT_IP`,
  };
}

function getInicisConfig(environment = process.env) {
  const mode = inicisMode(environment);
  const names = keyNamesForMode(mode);
  const mid = clean(environment[names.mid], 10);
  const hashKey = clean(environment[names.hashKey], 300);
  const apiKey = clean(environment[names.apiKey], 300);
  const clientIp = clean(environment[names.clientIp], 45);
  const missing = Object.entries({
    [names.mid]: mid,
    [names.hashKey]: hashKey,
    [names.apiKey]: apiKey,
    [names.clientIp]: clientIp,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw statusError(
      503,
      `${missing.join(", ")}를 서버 환경변수에 등록해주세요.`,
      "INICIS_KEYS_REQUIRED"
    );
  }
  if (!/^[A-Za-z0-9_-]{2,10}$/.test(mid)) {
    throw statusError(
      503,
      `${names.mid} 상점 아이디 형식을 확인해주세요.`,
      "INICIS_MID_INVALID"
    );
  }
  if (hashKey.length < 16 || apiKey.length < 8) {
    throw statusError(
      503,
      "KG이니시스 HashKey 또는 INIAPIKey 형식을 확인해주세요.",
      "INICIS_KEY_INVALID"
    );
  }
  return {
    mode,
    mid,
    hashKey,
    apiKey,
    clientIp,
    sdkUrl: mode === "LIVE" ? INICIS_LIVE_SDK_URL : INICIS_TEST_SDK_URL,
    cancelUrl:
      mode === "LIVE" ? INICIS_LIVE_CANCEL_URL : INICIS_TEST_CANCEL_URL,
  };
}

function isInicisConfigured(environment = process.env) {
  try {
    getInicisConfig(environment);
    return true;
  } catch (_error) {
    return false;
  }
}

function createPaymentHash({ amount, orderId, timestamp, hashKey }) {
  const plainText = `${Number(amount)}${clean(orderId, 40)}${clean(
    timestamp,
    13
  )}${String(hashKey || "")}`;
  return createHash("sha512").update(plainText, "utf8").digest("base64");
}

function createRefundHash({
  apiKey,
  type,
  paymethod,
  timestamp,
  clientIp,
  mid,
  tid,
  price,
  confirmPrice,
}) {
  const partial = clean(type, 20) === "PartialRefund";
  const plainText = [apiKey, type, paymethod, timestamp, clientIp, mid, tid]
    .concat(partial ? [Number(price), Number(confirmPrice)] : [])
    .join("");
  return createHash("sha512").update(plainText, "utf8").digest("hex");
}

function kstTimestamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function inicisDateTime(dateValue, timeValue) {
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

function approvalOrigin(idcName, mode = "") {
  const idc = clean(idcName, 3).toLowerCase();
  if (!ALLOWED_IDC_NAMES.has(idc)) {
    throw statusError(
      400,
      "KG이니시스 승인 센터 정보를 확인할 수 없습니다.",
      "INICIS_IDC_INVALID"
    );
  }
  if (
    (mode === "TEST" && idc !== "stg") ||
    (mode === "LIVE" && !new Set(["fc", "ks"]).has(idc))
  ) {
    throw statusError(
      409,
      "KG이니시스 결제 모드와 승인 센터가 일치하지 않습니다.",
      "INICIS_IDC_MODE_MISMATCH"
    );
  }
  return `https://${idc}paypro.inicis.com`;
}

function parseProviderPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_error) {
    // INIpay PRO 승인 응답은 상점 설정에 따라 NVP 형식일 수 있습니다.
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

class InicisApiError extends Error {
  constructor({ responseStatus = 0, code = "", message = "", payload = null }) {
    super(clean(message, 500) || "KG이니시스 요청을 완료하지 못했습니다.");
    this.name = "InicisApiError";
    this.status = responseStatus >= 500 || responseStatus === 0 ? 502 : 400;
    this.code = clean(code, 100) || "INICIS_API_ERROR";
    this.providerHttpStatus = responseStatus;
    this.providerPayload = payload;
    this.expose = responseStatus > 0 && responseStatus < 500;
  }
}

async function postForm(
  url,
  body,
  { fetchImpl = globalThis.fetch, unavailableCode = "INICIS_API_UNAVAILABLE" } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw statusError(500, "서버의 HTTP 요청 기능을 사용할 수 없습니다.", "FETCH_UNAVAILABLE");
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(
        Object.entries(body).map(([key, value]) => [key, String(value ?? "")])
      ).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    const unavailable = statusError(
      502,
      "KG이니시스 승인 서버와 통신하지 못했습니다. 잠시 후 결제 상태를 확인해주세요.",
      unavailableCode
    );
    unavailable.cause = error;
    throw unavailable;
  }
  const payload = parseProviderPayload(await response.text());
  if (!response.ok) {
    throw new InicisApiError({
      responseStatus: response.status,
      code: payload.P_STATUS || payload.resultCode,
      message: payload.P_RMESG || payload.resultMsg,
      payload,
    });
  }
  return payload;
}

async function approvePayment(
  { authTid, amount, idcName },
  { environment = process.env, fetchImpl = globalThis.fetch } = {}
) {
  const config = getInicisConfig(environment);
  const payload = await postForm(
    `${approvalOrigin(idcName, config.mode)}/payment/v1/rest/payAppl.ini`,
    {
      P_MID: config.mid,
      P_AUTH_TID: clean(authTid, 40),
      P_AMT: Number(amount),
      P_CHARSET: "UTF-8",
    },
    { fetchImpl, unavailableCode: "INICIS_APPROVAL_UNAVAILABLE" }
  );
  if (clean(payload.P_STATUS, 10) !== "00") {
    throw new InicisApiError({
      responseStatus: 400,
      code: payload.P_STATUS,
      message: payload.P_RMESG || "KG이니시스 결제 승인이 거절되었습니다.",
      payload,
    });
  }
  return payload;
}

async function networkCancelPayment(
  { authTid, amount, orderId, idcName, reason = "Matths entitlement failure" },
  { environment = process.env, fetchImpl = globalThis.fetch } = {}
) {
  const config = getInicisConfig(environment);
  const timestamp = String(Date.now());
  const payload = await postForm(
    `${approvalOrigin(idcName, config.mode)}/payment/v1/rest/payNetCancel.ini`,
    {
      P_MID: config.mid,
      P_AUTH_TID: clean(authTid, 40),
      P_AMT: Number(amount),
      P_OID: clean(orderId, 40),
      P_CANCEL_MSG: clean(reason, 100),
      P_TIMESTAMP: timestamp,
      P_CHKFAKE: createPaymentHash({
        amount,
        orderId,
        timestamp,
        hashKey: config.hashKey,
      }),
      P_CHARSET: "UTF-8",
    },
    { fetchImpl, unavailableCode: "INICIS_NETWORK_CANCEL_UNAVAILABLE" }
  );
  if (clean(payload.P_STATUS, 10) !== "00") {
    throw new InicisApiError({
      responseStatus: 400,
      code: payload.P_STATUS,
      message: payload.P_RMESG || "KG이니시스 망취소가 거절되었습니다.",
      payload,
    });
  }
  return payload;
}

async function cancelPayment(
  {
    paymentKey,
    cancelReason,
    cancelAmount,
    remainingAmount,
    paymentMethod = "CARD",
    fullCancellation = false,
  },
  { environment = process.env, fetchImpl = globalThis.fetch } = {}
) {
  const config = getInicisConfig(environment);
  const type = fullCancellation ? "Refund" : "PartialRefund";
  const paymethod = clean(paymentMethod, 20).toUpperCase() === "CARD" ? "Card" : "";
  if (!paymethod) {
    throw statusError(
      400,
      "현재 KG이니시스 카드 결제만 자동 취소할 수 있습니다.",
      "INICIS_REFUND_METHOD_UNSUPPORTED"
    );
  }
  const timestamp = kstTimestamp();
  const body = {
    type,
    paymethod,
    timestamp,
    clientIp: config.clientIp,
    mid: config.mid,
    tid: clean(paymentKey, 40),
    msg: clean(cancelReason || "Matths refund", 80),
  };
  if (!fullCancellation) {
    body.price = Number(cancelAmount);
    body.confirmPrice = Number(remainingAmount);
    body.currency = "WON";
  }
  body.hashData = createRefundHash({
    apiKey: config.apiKey,
    ...body,
  });
  const payload = await postForm(config.cancelUrl, body, {
    fetchImpl,
    unavailableCode: "INICIS_REFUND_UNAVAILABLE",
  });
  if (clean(payload.resultCode, 10) !== "00") {
    throw new InicisApiError({
      responseStatus: 400,
      code: payload.resultCode,
      message: payload.resultMsg || "KG이니시스 결제 취소가 거절되었습니다.",
      payload,
    });
  }
  const date = clean(payload.prtcDate || payload.cancelDate, 8);
  const time = clean(payload.prtcTime || payload.cancelTime, 6);
  return {
    ...payload,
    transactionKey:
      clean(payload.tid, 40) || `INICIS-${clean(paymentKey, 40)}-${date}${time}`,
    cancelledAt: inicisDateTime(date, time),
  };
}

module.exports = {
  INICIS_LIVE_CANCEL_URL,
  INICIS_LIVE_SDK_URL,
  INICIS_TEST_CANCEL_URL,
  INICIS_TEST_SDK_URL,
  InicisApiError,
  approvePayment,
  cancelPayment,
  createPaymentHash,
  createRefundHash,
  getInicisConfig,
  inicisMode,
  isInicisConfigured,
  networkCancelPayment,
  _testing: {
    approvalOrigin,
    inicisDateTime,
    keyNamesForMode,
    kstTimestamp,
    parseProviderPayload,
    postForm,
  },
};
