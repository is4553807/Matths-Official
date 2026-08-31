const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * App Store 인앱 결제 HTTP 계약 검증.
 *
 * 무엇을 증명하고 무엇을 증명하지 않는지 먼저 적는다.
 *
 * 증명한다:
 *   · 두 경로가 등록돼 있다 (404 가 아니다)
 *   · redeem 은 인증 **뒤**, notifications 는 인증 **앞**에 있다.
 *     이 둘이 뒤집히는 것이 이 파일이 막으려는 사고다 —
 *     redeem 이 앞으로 나오면 아무나 남의 계정에 학습권을 열 수 있고,
 *     notifications 가 뒤로 가면 애플 환불 통지가 전부 401 로 떨어져
 *     서버가 환불을 영영 모른다.
 *   · JWS 검증이 leaf 용도 OID 를 확인한다 (체인만 보면 뚫린다 — 아래 참조)
 *   · 앱이 보낸 productCode 를 신뢰하지 않는다
 *
 * 증명하지 않는다:
 *   · 실제 애플 서명으로 끝까지 도는 흐름. 유효한 JWSTransaction 은 실제 Sandbox
 *     결제에서만 나오고 애플은 공개 테스트 벡터를 주지 않는다.
 *     **Sandbox 결제 1건으로 end-to-end 를 따로 확인해야 한다.**
 *     이게 통과했다고 "인앱 결제 검증 완료" 라고 쓰지 마라.
 *   · Mongo 문서 흐름(사이클 생성·멱등·환불 회수).
 */

process.env.NODE_ENV = "development";
process.env.HOST = "127.0.0.1";

const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);

const { server } = require("../server");

const ROOT = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

/** 라우터 스택을 직접 읽어 인증 경계를 확인한다. */
function verifyAuthBoundary() {
  const router = require("../routes/api-routes");
  let behindAuth = false;
  const seen = new Map();

  for (const layer of router.stack) {
    const handleName = layer.name || layer.handle?.name;
    if (handleName === "requireApiAuth") behindAuth = true;
    if (!layer.route) continue;
    if (!layer.route.path.includes("apple")) continue;
    seen.set(layer.route.path, behindAuth);
  }

  assert.equal(
    seen.get("/commerce/apple/redeem"),
    true,
    "/commerce/apple/redeem 이 requireApiAuth 앞에 있습니다 — 아무나 남의 계정에 학습권을 열 수 있습니다"
  );
  assert.equal(
    seen.get("/commerce/apple/account-token"),
    true,
    "/commerce/apple/account-token 이 requireApiAuth 앞에 있습니다 — 결제 계정 UUID를 아무나 선점할 수 있습니다"
  );
  assert.equal(
    seen.get("/commerce/apple/notifications"),
    false,
    "/commerce/apple/notifications 가 requireApiAuth 뒤에 있습니다 — 애플 서버는 우리 Bearer 토큰을 모르므로 모든 환불 통지가 401 로 사라집니다"
  );

  console.log("  ✓ 인증 경계 (account-token·redeem=뒤, notifications=앞)");
}

/**
 * leaf 용도 OID 검사가 살아 있는지.
 *
 * 체인이 Apple Root CA - G3 까지 선다고 해서 발급자가 App Store 인 것이 아니다.
 * WWDR(Apple Worldwide Developer Relations)도 같은 루트 아래 있고, 연 $99 개발자
 * 계정이면 누구나 거기서 leaf 를 발급받아 **개인키를 손에 쥔다.** 그 leaf 로 서명한
 * 위조 거래가 체인 검증만으로는 통과한다. 실측으로 확인된 경로다.
 */
function verifyLeafOidGate() {
  const source = read("services/appleStoreVerifyService.js");

  // OID DER TLV: 06 0a + 내용. 태그·길이까지 포함해야 다른 필드에 같은 바이트를
  // 심는 우회가 어려워진다.
  assert.match(
    source,
    /060a2a864886f76364060b01/,
    "App Store leaf OID(1.2.840.113635.100.6.11.1) 검사가 사라졌습니다 — WWDR 발급 인증서로 위조 결제가 통과합니다"
  );
  assert.match(
    source,
    /060a2a864886f76364060201/,
    "WWDR 중간 OID(1.2.840.113635.100.6.2.1) 검사가 사라졌습니다"
  );
  assert.match(
    source,
    /LEAF_OID_MISSING/,
    "leaf OID 거부 경로가 없습니다"
  );

  console.log("  ✓ leaf 용도 OID 게이트");
}

/** 앱이 보낸 값을 진실원으로 쓰지 않는지. */
function verifyClientInputNotTrusted() {
  const source = read("services/appleCommerceService.js");

  // productCode 는 JWS 의 productId 로 결정해야 한다.
  assert.match(
    source,
    /PRODUCT_BY_APPLE_ID\[\s*transaction\.productId\s*\]/,
    "상품 결정이 JWS 의 productId 가 아니라 앱이 보낸 값에 걸려 있습니다"
  );
  // bundleId 대조가 있어야 다른 앱의 거래를 막는다.
  assert.match(
    source,
    /transaction\.bundleId\s*!==\s*BUNDLE_ID/,
    "bundleId 대조가 없습니다 — 다른 앱의 결제가 통과합니다"
  );
  // 환불된 거래로 권한이 열리면 안 된다.
  assert.match(
    source,
    /transaction\.revocationDate/,
    "환불된 거래 차단이 없습니다"
  );

  console.log("  ✓ 앱 입력 불신 (productId·bundleId·revocation)");
}

/** 갱신·환불 통지가 세션 없이도 최초 결제와 다시 이어지는지. */
function verifySubscriptionLifecyclePersistence() {
  const model = read("models/goatArenaModel.js");
  const apple = read("services/appleCommerceService.js");
  const cycle = read("services/accessCycleService.js");
  const mock = read("services/mockExamPaymentService.js");

  for (const field of [
    "appleOriginalTransactionId",
    "appleAppAccountToken",
    "appleExpiresAt",
  ]) {
    assert.match(model, new RegExp(`${field}\\s*:`), `결제 원장에 ${field} 필드가 없습니다`);
    assert.match(cycle, new RegExp(`${field}`), `학습권 승인 경계가 ${field}를 버립니다`);
    assert.match(mock, new RegExp(`${field}`), `모의고사 승인 경계가 ${field}를 버립니다`);
  }
  assert.match(
    apple,
    /appleOriginalTransactionId:\s*String\(transaction\.originalTransactionId\)/,
    "최초 거래 ID를 결제 승인에 전달하지 않습니다"
  );
  assert.match(
    apple,
    /provider:\s*"APPLE",\s*appleOriginalTransactionId:/,
    "DID_RENEW가 최초 Apple 결제 원장을 찾지 않습니다"
  );
  assert.match(
    apple,
    /case\s+"SUBSCRIBED":[\s\S]*?case\s+"DID_RENEW":/,
    "앱 종료 중 도착한 최초 SUBSCRIBED 통지를 처리하지 않습니다"
  );
  assert.match(
    apple,
    /findAppleCommerceAccountTokenOwner\([\s\S]*?transaction\.appAccountToken/,
    "Apple 서버 통지가 구매 전 사전 귀속 계정을 역조회하지 않습니다"
  );
  assert.match(
    apple,
    /origin\?\.userId\s*\|\|\s*tokenOwnerId/,
    "원거래가 없는 최초 결제를 appAccountToken 소유자에게 복구하지 않습니다"
  );
  assert.match(
    mock,
    /approval\.provider\s*===\s*"APPLE"[\s\S]*?new Date\(approval\.appleExpiresAt\)/,
    "모의고사 구독이 Apple의 실제 expiresDate 대신 고정 일수를 씁니다"
  );
  assert.match(
    apple,
    /status:\s*"CANCELLED",\s*endsAt:\s*cancelTime/,
    "모의고사 환불이 실제 endsAt을 닫지 않습니다"
  );
  console.log("  ✓ Apple 구독 갱신 식별자·실제 만료·환불 회수 영속성");
}

/** 구매 시점의 Matths 계정과 StoreKit 거래가 서버 원장으로 고정되는지. */
function verifyAppAccountOwnershipBoundary() {
  const model = read("models/goatArenaModel.js");
  const apple = read("services/appleCommerceService.js");
  const ownership = read("services/appleCommerceAccountTokenService.js");

  assert.match(
    model,
    /appleCommerceAccountTokenSchema\.index\(\{ token: 1 \}, \{ unique: true \}\)/,
    "appAccountToken 소유권 원장에 UUID 고유 인덱스가 없습니다"
  );
  assert.match(
    apple,
    /assertAppleCommerceAccountTokenOwner\(\{/,
    "JWS appAccountToken의 Matths 계정 소유권을 확인하지 않습니다"
  );
  assert.match(
    apple,
    /String\(existing\.userId\) !== String\(userId\)/,
    "중복 거래가 다른 Bearer 사용자에게 성공으로 응답할 수 있습니다"
  );
  assert.match(
    ownership,
    /APPLE_APP_ACCOUNT_OWNER_CONFLICT/,
    "다른 Matths 계정이 같은 appAccountToken을 소비하는 거부 경로가 없습니다"
  );
  console.log("  ✓ appAccountToken ↔ Matths 계정 소유권 경계");
}

/**
 * 애플 로그인이 body 의 이메일을 계정 연결 키로 쓰지 않는지.
 *
 * 썼을 때 실제로 계정 탈취가 됐다. 공격자가 자기 애플 계정으로 서명·aud·nonce·exp
 * 를 전부 통과하는 **진짜 토큰**을 받은 뒤 body 에 피해자 이메일만 넣으면 그 계정이
 * 넘어간다. 매핑이 영구 저장되므로 진짜 소유자는 자기 애플 ID 를 다시 연결하지 못한다.
 */
function verifyAppleAuthEmailBoundary() {
  const source = read("services/appleAuthService.js");

  assert.ok(
    !/claims\.email\s*\|\|\s*String\(\s*email/.test(source),
    "body 의 email 이 계정 연결에 다시 쓰이고 있습니다 — 계정 탈취 경로입니다"
  );
  assert.match(
    source,
    /claims\.emailVerified === true/,
    "기존 계정 연결에 emailVerified 확인이 없습니다"
  );
  assert.ok(
    !/async function linkAppleIdentity\(\{[^}]*\bemail\b/.test(source),
    "linkAppleIdentity 가 다시 email 을 받고 있습니다"
  );

  console.log("  ✓ 애플 로그인 이메일 경계");
}

/** 탈퇴 시 애플 토큰 폐기 — 심사 요구사항 5.1.1(v). */
function verifyRevokeWired() {
  const source = read("services/accountDeletionService.js");
  assert.match(
    source,
    /revokeAppleTokens\(/,
    "탈퇴 경로에서 revokeAppleTokens 를 부르지 않습니다 — 심사 요구사항 5.1.1(v) 미충족입니다"
  );
  assert.match(
    source,
    /forgetAppleCredential\(/,
    "완전 삭제 시 애플 자격 증명을 지우지 않습니다 — 같은 애플 ID 의 재가입이 막힙니다"
  );
  assert.match(
    source,
    /AppleCommerceAccountToken\.deleteMany\(\{ userId \}\)/,
    "탈퇴 시 App Store 결제 계정 UUID 원장이 남습니다"
  );
  console.log("  ✓ 탈퇴 시 애플 토큰 폐기 배선");
}

/** 애플 수수료 유보율이 0 으로 내려가지 않는지. */
function verifyAppleFeeFloor() {
  delete require.cache[require.resolve("../services/financeService")];
  const previous = process.env.FINANCE_APPLE_FEE_RESERVE_BPS;
  process.env.FINANCE_APPLE_FEE_RESERVE_BPS = "0";
  try {
    const finance = require("../services/financeService");
    const config =
      (finance._testing && finance._testing.providerFeeReserveConfiguration) ||
      finance.providerFeeReserveConfiguration;
    if (typeof config !== "function") {
      console.log("  · providerFeeReserveConfiguration 미노출 — 유보율 검사 건너뜀");
      return;
    }
    assert.ok(
      Number(config().providerBps.APPLE) > 0,
      "FINANCE_APPLE_FEE_RESERVE_BPS=0 이 그대로 채택됩니다 — 애플 몫 전액이 출금가능액으로 흘러나갑니다"
    );
    console.log("  ✓ 애플 수수료 유보율 하한");
  } finally {
    if (previous === undefined) delete process.env.FINANCE_APPLE_FEE_RESERVE_BPS;
    else process.env.FINANCE_APPLE_FEE_RESERVE_BPS = previous;
    delete require.cache[require.resolve("../services/financeService")];
  }
}

async function verifyOverHttp(origin) {
  const accountToken = await fetch(`${origin}/api/v1/commerce/apple/account-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposedToken: "9a11c6bd-43cc-4f54-981f-758fcd5fbf33" }),
    redirect: "manual",
  });
  assert.notEqual(
    accountToken.status,
    404,
    "/commerce/apple/account-token 이 등록되지 않았습니다"
  );
  assert.equal(
    accountToken.status,
    401,
    `account-token 은 Bearer 없이 401 이어야 합니다 (받은 값 ${accountToken.status})`
  );

  // redeem 은 Bearer 없이 401.
  const redeem = await fetch(`${origin}/api/v1/commerce/apple/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jws: "x", productCode: "LEARNING_PACKAGE_29" }),
    redirect: "manual",
  });
  assert.notEqual(redeem.status, 404, "/commerce/apple/redeem 이 등록되지 않았습니다");
  assert.equal(
    redeem.status,
    401,
    `redeem 은 Bearer 없이 401 이어야 합니다 (받은 값 ${redeem.status})`
  );

  // notifications 는 인증 없이 닿아야 한다. 401 이면 애플 통지가 사라진다.
  const notify = await fetch(`${origin}/api/v1/commerce/apple/notifications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
    redirect: "manual",
  });
  assert.notEqual(notify.status, 404, "/commerce/apple/notifications 가 등록되지 않았습니다");
  assert.notEqual(
    notify.status,
    401,
    "notifications 가 401 입니다 — 애플 서버는 Bearer 를 보내지 않습니다"
  );
  assert.equal(
    notify.status,
    400,
    `signedPayload 없는 요청은 400 이어야 합니다 (받은 값 ${notify.status})`
  );

  console.log("  ✓ HTTP 경계 (account-token·redeem 401 · notifications 400)");
}

async function main() {
  console.log("App Store 인앱 결제 HTTP 계약");

  verifyAuthBoundary();
  verifyLeafOidGate();
  verifyClientInputNotTrusted();
  verifySubscriptionLifecyclePersistence();
  verifyAppAccountOwnershipBoundary();
  verifyAppleAuthEmailBoundary();
  verifyRevokeWired();
  verifyAppleFeeFloor();

  let listener;
  try {
    listener = await new Promise((resolve, reject) => {
      const value = server.listen(0, "127.0.0.1");
      value.once("error", reject);
      value.once("listening", () => resolve(value));
    });
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    console.log("  · 소켓 바인딩 불가(EPERM) — HTTP 검사는 건너뜀");
    console.log("App Store 인앱 결제 HTTP 계약 통과 (부분)");
    return;
  }

  try {
    await verifyOverHttp(`http://127.0.0.1:${listener.address().port}`);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }

  console.log("App Store 인앱 결제 HTTP 계약 통과");
  console.log("  ⚠️ 실제 Sandbox 결제 1건으로 end-to-end 확인이 별도로 필요합니다");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
