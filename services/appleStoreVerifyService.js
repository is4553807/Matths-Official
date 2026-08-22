"use strict";

const fs = require("node:fs");
const {
  X509Certificate,
  createVerify,
} = require("node:crypto");

/**
 * 애플 App Store 서명(JWS) 검증 경계.
 *
 * 왜 필요한가. 앱은 결제가 끝나면 서명된 거래(JWSTransaction)를 서버로 올린다.
 * 이때 **서명을 검증하지 않고 payload 만 믿으면** 누구든 productId·expiresDate 를
 * 원하는 대로 적어 보내 학습권을 공짜로 열 수 있다. 결제는 되돌리기 어려운 상태를
 * 만들기 때문에, 이 파일이 뚫리면 그대로 돈이 샌다.
 *
 * 왜 라이브러리를 안 쓰는가. 이 저장소에는 @apple/app-store-server-library 가 없고,
 * 새 의존성은 최소로 유지하기로 돼 있다. 애플이 요구하는 검증은 결국
 *   ① x5c 체인을 Apple Root CA - G3 까지 세우고
 *   ② 말단 인증서 공개키로 ES256 서명을 확인하는 것
 * 두 가지라, Node 24 내장 crypto(X509Certificate.checkIssued/verify)로 충분히 닫힌다.
 * 대신 체인 검증을 빼먹으면 **아무나 자기 키로 서명해서 통과**하므로, 체인은
 * 어떤 경로로도 우회되지 않게 verifyJws() 한 곳에서만 처리한다.
 *
 * 왜 루트 인증서를 파일이 아니라 상수로 박는가. 운영 배포에서 인증서 파일 하나를
 * 빠뜨리면 결제 검증이 통째로 죽는다(그리고 그 사고는 배포 직후에 난다).
 * 루트는 2039년까지 유효하고 바뀌지 않으므로, 코드에 함께 배포되는 편이 안전하다.
 * 회전·테스트가 필요할 때만 APPLE_ROOT_CA_PATH 로 덮어쓴다.
 *
 * environment 는 **거부하지 않고 그대로 실어 보낸다**. 심사자는 Sandbox 로 결제하기
 * 때문에, 여기서 Sandbox 를 막으면 심사가 떨어진다. 운영에서 Sandbox 거래를 받아줄지는
 * 호출부가 isSandboxAllowed() 로 판단한다.
 */

// Apple Root CA - G3 (CN=Apple Root CA - G3, 2014-04-30 ~ 2039-04-30)
// SHA-256 fingerprint:
//   63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer 에서 받은 DER 과
// macOS 시스템 신뢰 저장소의 같은 인증서가 바이트 단위로 일치함을 확인하고 넣었다.
const APPLE_ROOT_CA_G3_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS",
  "QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u",
  "IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN",
  "MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS",
  "b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y",
  "aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49",
  "AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf",
  "TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517",
  "IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr",
  "MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA",
  "MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4",
  "at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM",
  "6BgD56KyKA==",
  "-----END CERTIFICATE-----",
  "",
].join("\n");

const DEFAULT_BUNDLE_ID = "kr.matths.app";
// 애플 체인은 leaf/intermediate/root 3장이다. 넉넉히 잡되 무한정 파싱하지는 않는다.
const MAX_CHAIN_LENGTH = 8;

// 애플 인증서 용도 OID 를 DER TLV 로 인코딩한 것(태그 0x06, 길이 0x0A, 내용 10바이트).
// verifyCertificateChain 이 leaf 와 중간 인증서의 용도를 이걸로 제한한다 — 자세한 사유는
// 그 함수 안 주석에 있다. 값은 손으로 인코딩하지 말고 아래 대응표로 대조할 것:
//   1.2.840.113635.100.6.11.1 → 06 0a 2a 86 48 86 f7 63 64 06 0b 01
//   1.2.840.113635.100.6.2.1  → 06 0a 2a 86 48 86 f7 63 64 06 02 01
const APP_STORE_LEAF_OID_DER = Buffer.from("060a2a864886f76364060b01", "hex");
const APPLE_WWDR_OID_DER = Buffer.from("060a2a864886f76364060201", "hex");
// JWS 하나가 이보다 커질 이유가 없다. 파싱 전에 잘라서 메모리 폭주를 막는다.
const MAX_JWS_LENGTH = 256 * 1024;
// ES256 서명은 R||S 고정 64바이트다. DER 서명이 오면 애초에 애플 것이 아니다.
const ES256_SIGNATURE_BYTES = 64;
const VALID_ENVIRONMENTS = Object.freeze(["Sandbox", "Production"]);

// 루트 인증서 파싱은 비싸지 않지만 요청마다 반복할 이유도 없다. 경로별로 캐시한다.
const rootCertificateCache = new Map();

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * 검증 실패는 이유가 무엇이든 호출부에는 하나의 코드로 나간다.
 *
 * 왜 이유별로 코드를 나누지 않는가. 앱에 "번들이 다릅니다" / "체인이 끊겼습니다" 를
 * 구분해서 돌려주면, 위조를 시도하는 쪽에 어디까지 통과했는지 알려주는 꼴이다.
 * 대신 서버 로그용으로 error.reason 을 달아 둔다.
 */
function jwsError(reason, message = "결제 서명을 확인하지 못했습니다.") {
  const error = statusError(400, message, "APPLE_JWS_INVALID");
  error.reason = reason;
  return error;
}

function readBundleId(environment = process.env) {
  const value = String(environment.APPLE_BUNDLE_ID || "").trim();
  return value || DEFAULT_BUNDLE_ID;
}

/**
 * 운영이 Sandbox 거래를 받아줄지. 기본은 거부(false)다.
 *
 * 이 모듈은 environment 를 절대 거부하지 않는다. 심사 기간에만 이 값을 켜고
 * 심사가 끝나면 끄는 식으로, 판단을 호출부(라우트·서비스)에 남겨 둔다.
 */
function isSandboxAllowed(environment = process.env) {
  return String(environment.APPLE_ALLOW_SANDBOX || "").trim().toLowerCase() === "true";
}

/**
 * 신뢰 루트를 돌려준다. 기본은 코드에 박힌 Apple Root CA - G3.
 *
 * APPLE_ROOT_CA_PATH 는 **인증서 회전과 테스트용 뒷문**이다. 이 값을 바꾸면 이 모듈의
 * 신뢰 기준이 통째로 바뀌므로, 운영에서는 비워 두는 것이 정상이다.
 */
function loadTrustedRoot(environment = process.env) {
  const overridePath = String(environment.APPLE_ROOT_CA_PATH || "").trim();
  const cacheKey = overridePath || ":builtin:";
  const cached = rootCertificateCache.get(cacheKey);
  if (cached) return cached;

  let certificate = null;
  if (overridePath) {
    // 경로가 지정됐는데 읽히지 않으면 내장 루트로 조용히 되돌아가면 안 된다.
    // 운영자가 의도한 신뢰 기준과 실제 기준이 달라지는 것이 가장 위험하다.
    const pem = fs.readFileSync(overridePath, "utf8");
    certificate = new X509Certificate(pem);
  } else {
    certificate = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  }
  rootCertificateCache.set(cacheKey, certificate);
  return certificate;
}

/**
 * 운영 설정이 갖춰졌는지. 라우트 게이트에 쓴다.
 *
 * 번들 ID 모양과 **루트 인증서를 실제로 파싱할 수 있는지**까지 본다.
 * 루트를 못 읽는 서버는 모든 결제를 거부하게 되므로, 결제 경로를 아예 열지 않는 편이 낫다.
 */
function isAppleStoreConfigured(environment = process.env) {
  const bundleId = readBundleId(environment);
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{1,254}$/.test(bundleId)) return false;
  try {
    return Boolean(loadTrustedRoot(environment));
  } catch {
    return false;
  }
}

function decodeBase64UrlSegment(segment, reason) {
  const value = String(segment || "");
  // base64url 패딩(=)은 JWS 규격상 오지 않는다. 관대하게 받으면 서명 입력이
  // 여러 표현으로 갈라져 비교 기준이 흔들린다.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw jwsError(reason);
  const buffer = Buffer.from(value, "base64url");
  if (!buffer.length) throw jwsError(reason);
  return buffer;
}

function parseJsonSegment(buffer, reason) {
  let parsed = null;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw jwsError(reason);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw jwsError(reason);
  }
  return parsed;
}

function parseCertificate(base64Der, reason) {
  const value = String(base64Der || "");
  // x5c 는 base64url 이 아니라 표준 base64 다(RFC 7515 §4.1.6).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw jwsError(reason);
  try {
    return new X509Certificate(Buffer.from(value, "base64"));
  } catch {
    throw jwsError(reason);
  }
}

function assertCertificateWindow(certificate, now, reason) {
  const notBefore = Date.parse(certificate.validFrom);
  const notAfter = Date.parse(certificate.validTo);
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter)) throw jwsError(reason);
  if (now < notBefore || now > notAfter) throw jwsError(reason);
}

/**
 * 발급 관계 + 서명을 함께 본다.
 *
 * checkIssued() 는 이름·AKID 가 맞는지만 보고 서명은 확인하지 않는다.
 * 반대로 verify() 만 쓰면 엉뚱한 발급자의 키로도 우연히 맞물릴 여지를 남긴다.
 * 둘 다 통과해야 한 칸을 올라간다.
 */
function isSignedBy(child, issuer) {
  try {
    return child.checkIssued(issuer) && child.verify(issuer.publicKey);
  } catch {
    return false;
  }
}

/**
 * x5c 체인을 신뢰 루트까지 세우고 말단(leaf) 인증서를 돌려준다.
 *
 * 이 함수가 이 모듈의 전부다. 여기를 건너뛰면 서명 검증은 "자기가 만든 키로
 * 자기가 서명한 것"을 확인하는 자기 완결적 통과 의식이 된다.
 */
function verifyCertificateChain(x5c, trustedRoot, now) {
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > MAX_CHAIN_LENGTH) {
    throw jwsError("X5C_SHAPE");
  }
  const chain = x5c.map((entry) => parseCertificate(entry, "X5C_PARSE"));

  for (const certificate of chain) {
    assertCertificateWindow(certificate, now, "CERT_WINDOW");
  }
  // 중간 인증서가 CA 가 아니면 체인이 아니다. leaf 는 CA 여부를 강제하지 않는다.
  for (let index = 1; index < chain.length; index += 1) {
    if (chain[index].ca !== true) throw jwsError("CHAIN_NON_CA");
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    if (!isSignedBy(chain[index], chain[index + 1])) throw jwsError("CHAIN_BROKEN");
  }

  const top = chain[chain.length - 1];
  if (!top.raw.equals(trustedRoot.raw)) {
    // 애플은 루트까지 x5c 에 실어 보내지만, 규격상 생략도 가능하다.
    // 그 경우 최상단이 우리가 신뢰하는 루트로 서명돼 있어야 한다.
    assertCertificateWindow(trustedRoot, now, "ROOT_WINDOW");
    if (trustedRoot.ca !== true) throw jwsError("ROOT_NON_CA");
    if (!isSignedBy(top, trustedRoot)) throw jwsError("ROOT_NOT_ANCHORED");
  }

  // ── leaf 용도 제한 — 여기가 없으면 체인 검증이 사실상 무의미하다 ──────────────
  //
  // "Apple Root CA - G3 까지 체인이 서면 발급자는 애플"이라는 추론은 **틀렸다.**
  // Apple Worldwide Developer Relations CA(WWDR)도 그 루트 아래 있고, WWDR 은
  // 연 $99 개발자 계정 누구에게나 CSR 을 받아 leaf 를 발급한다. 개인키는 발급받은
  // 쪽이 쥔다. 이 머신의 키체인에서 실제로 확인했다 — WWDR G6 는 ca=true 이고
  // Apple Root CA - G3 에 checkIssued()·verify() 가 둘 다 통과한다.
  //
  // 즉 이 검사가 없으면 공격자가 x5c=[본인 WWDR leaf, WWDR G6, Apple Root G3] 으로
  // productId·expiresDate 를 임의로 적은 거래를 **직접 서명**해 만들 수 있고,
  // 우리는 그것을 정상 결제로 받는다. 학습권이 공짜로 열린다.
  //
  // 그래서 leaf 가 **App Store 전용**으로 발급된 것인지 확인한다. 애플 공식
  // app-store-server-library 가 검사하는 것과 같은 OID 다:
  //     leaf  1.2.840.113635.100.6.11.1  (App Store Server)
  //     중간  1.2.840.113635.100.6.2.1   (WWDR)
  //
  // Node 의 X509Certificate 로는 임의 확장을 읽을 수 없어 DER 바이트를 직접 찾는다.
  // 다만 OID 내용 바이트만 찾으면 약하다 — 공격자가 자기 인증서의 다른 필드에
  // 같은 바이트열을 심으면 통과한다. 그래서 **태그와 길이까지(06 0A …)** 붙여
  // 찾는다. 그 12바이트가 나온다는 것은 DER 어딘가에서 그 값이 실제로 OBJECT
  // IDENTIFIER 로 인코딩돼 있다는 뜻이라, 임의 문자열 필드에 밀어 넣기 어렵다.
  //
  // 완전한 DER 파싱(확장 영역인지까지 확인)보다는 약하다. 그 차이를 감수하는 이유는
  // 이 검사가 **체인 검증에 더해지는 것**이지 대신하는 것이 아니기 때문이다.
  // 공격자는 여전히 WWDR 이 발급한 진짜 인증서와 그 개인키를 가져야 한다.
  const leafCert = chain[0];
  if (!leafCert.raw.includes(APP_STORE_LEAF_OID_DER)) {
    throw jwsError("LEAF_OID_MISSING");
  }
  if (!chain.slice(1).some((cert) => cert.raw.includes(APPLE_WWDR_OID_DER))) {
    throw jwsError("INTERMEDIATE_OID_MISSING");
  }
  return chain[0];
}

/**
 * JWS 하나를 검증하고 payload 를 돌려준다. 서명·체인 검증은 오직 여기 한 곳이다.
 */
function verifyJws(jws, { environment = process.env, now = Date.now() } = {}) {
  const token = String(jws || "").trim();
  if (!token || token.length > MAX_JWS_LENGTH) throw jwsError("JWS_SIZE");

  const parts = token.split(".");
  if (parts.length !== 3) throw jwsError("JWS_SHAPE");
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = parseJsonSegment(
    decodeBase64UrlSegment(headerSegment, "HEADER_ENCODING"),
    "HEADER_JSON"
  );
  // alg 를 고정하지 않으면 alg:"none" 이나 HS256 혼동 공격이 열린다.
  if (header.alg !== "ES256") throw jwsError("ALG_NOT_ES256");

  let trustedRoot = null;
  try {
    trustedRoot = loadTrustedRoot(environment);
  } catch {
    // 루트를 못 읽는 상태에서 통과시키는 것보다 전부 거부하는 편이 안전하다.
    throw jwsError("ROOT_UNAVAILABLE", "결제 검증 설정을 확인할 수 없습니다.");
  }

  const leaf = verifyCertificateChain(header.x5c, trustedRoot, now);

  const publicKey = leaf.publicKey;
  const keyDetails = publicKey.asymmetricKeyDetails || {};
  if (publicKey.asymmetricKeyType !== "ec" || keyDetails.namedCurve !== "prime256v1") {
    throw jwsError("LEAF_KEY_MISMATCH");
  }

  const signature = decodeBase64UrlSegment(signatureSegment, "SIGNATURE_ENCODING");
  if (signature.length !== ES256_SIGNATURE_BYTES) throw jwsError("SIGNATURE_SIZE");

  let signatureValid = false;
  try {
    signatureValid = createVerify("SHA256")
      .update(`${headerSegment}.${payloadSegment}`, "ascii")
      // JWS 의 ES256 서명은 DER 이 아니라 R||S 고정폭이다.
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw jwsError("SIGNATURE_INVALID");

  return parseJsonSegment(
    decodeBase64UrlSegment(payloadSegment, "PAYLOAD_ENCODING"),
    "PAYLOAD_JSON"
  );
}

function assertBundleId(value, environment) {
  const expected = readBundleId(environment);
  if (String(value || "") !== expected) throw jwsError("BUNDLE_ID_MISMATCH");
  return expected;
}

function msNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]+/g, "").trim();
  return text || null;
}

/**
 * environment 는 애플이 보낸 값이 규격 안에 있을 때만 통과시킨다.
 *
 * 모르는 값을 "Production" 으로 추측해서 채우면, Sandbox 결제가 운영 결제로
 * 둔갑해 학습권이 열린다. 판단이 안 서면 null 을 주고 호출부가 막게 한다.
 */
function normalizeEnvironment(value) {
  const text = cleanString(value);
  return VALID_ENVIRONMENTS.includes(text) ? text : null;
}

/**
 * 애플 payload 를 그대로 두되, 호출부가 반드시 쓰는 필드는 타입을 고정해 덮어쓴다.
 * 날짜는 전부 ms 숫자, 없으면 null 이다("0" 이나 문자열이 섞여 들어오지 않게).
 */
function normalizeTransaction(payload) {
  return {
    ...payload,
    productId: cleanString(payload.productId),
    transactionId: cleanString(payload.transactionId),
    originalTransactionId: cleanString(payload.originalTransactionId),
    purchaseDate: msNumber(payload.purchaseDate),
    expiresDate: msNumber(payload.expiresDate),
    bundleId: cleanString(payload.bundleId),
    environment: normalizeEnvironment(payload.environment),
    appAccountToken: cleanString(payload.appAccountToken),
    revocationDate: msNumber(payload.revocationDate),
    type: cleanString(payload.type),
    quantity: Number.isFinite(Number(payload.quantity)) ? Number(payload.quantity) : null,
  };
}

function normalizeRenewalInfo(payload) {
  return {
    ...payload,
    productId: cleanString(payload.productId),
    originalTransactionId: cleanString(payload.originalTransactionId),
    autoRenewProductId: cleanString(payload.autoRenewProductId),
    autoRenewStatus: Number.isFinite(Number(payload.autoRenewStatus))
      ? Number(payload.autoRenewStatus)
      : null,
    expirationIntent: Number.isFinite(Number(payload.expirationIntent))
      ? Number(payload.expirationIntent)
      : null,
    gracePeriodExpiresDate: msNumber(payload.gracePeriodExpiresDate),
    renewalDate: msNumber(payload.renewalDate),
    environment: normalizeEnvironment(payload.environment),
  };
}

/**
 * 앱이 올린 거래 JWS 를 검증하고 payload 를 돌려준다.
 *
 * environment 는 검사하지 않고 실어만 보낸다(심사자는 Sandbox 로 결제한다).
 * bundleId 는 반드시 대조한다 — 다른 앱의 정상 서명을 그대로 가져와도 통과하면 안 된다.
 */
async function verifySignedTransaction(jws, { environment = process.env, now = Date.now() } = {}) {
  const payload = verifyJws(jws, { environment, now });
  assertBundleId(payload.bundleId, environment);
  return normalizeTransaction(payload);
}

/**
 * App Store Server Notifications V2 의 signedPayload 를 검증한다.
 *
 * 바깥 통지와 안쪽 signedTransactionInfo·signedRenewalInfo 는 **각각 서명된 별개의 JWS** 다.
 * 바깥만 검증하고 안쪽 payload 를 그대로 믿으면 검증을 한 셈이 아니라서, 셋 다 돌린다.
 */
async function verifySignedNotification(signedPayload, { environment = process.env, now = Date.now() } = {}) {
  const payload = verifyJws(signedPayload, { environment, now });
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : {};

  // TEST 통지처럼 data 가 비어 오는 경우가 있어, bundleId 가 실렸을 때만 대조한다.
  // 값이 있는데 다르면 그건 남의 앱 통지이므로 거부한다.
  const bundleId = cleanString(data.bundleId);
  if (bundleId !== null) assertBundleId(bundleId, environment);

  let transaction = null;
  if (data.signedTransactionInfo) {
    const decoded = normalizeTransaction(
      verifyJws(data.signedTransactionInfo, { environment, now })
    );
    assertBundleId(decoded.bundleId, environment);
    transaction = decoded;
  }

  let renewalInfo = null;
  if (data.signedRenewalInfo) {
    // renewalInfo 에는 bundleId 가 없다. 체인·서명만 확인하고 대조는 건너뛴다.
    renewalInfo = normalizeRenewalInfo(
      verifyJws(data.signedRenewalInfo, { environment, now })
    );
  }

  return {
    ...payload,
    notificationType: cleanString(payload.notificationType),
    subtype: cleanString(payload.subtype),
    notificationUUID: cleanString(payload.notificationUUID),
    transaction,
    renewalInfo,
    bundleId: bundleId || (transaction && transaction.bundleId) || null,
    environment:
      normalizeEnvironment(data.environment) ||
      (transaction && transaction.environment) ||
      null,
  };
}

module.exports = {
  verifySignedTransaction,
  verifySignedNotification,
  isAppleStoreConfigured,
  isSandboxAllowed,
  APPLE_ROOT_CA_G3_PEM,
};
