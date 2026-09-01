const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaPackagePayment,
  ArenaPaybackReview,
  MockExamSubscription,
} = require("../models/goatArenaModel");
const { PaybackPayoutRecord } = require("../models/paybackModel");
const {
  applyApprovedPackagePayment,
} = require("./accessCycleService");
const {
  applyApprovedMockExamPayment,
} = require("./mockExamPaymentService");
const {
  verifySignedTransaction,
  verifySignedNotification,
  isAppleStoreConfigured,
} = require("./appleStoreVerifyService");
const {
  issueAppleCommerceAccountToken,
  assertAppleCommerceAccountTokenOwner,
  findAppleCommerceAccountTokenOwner,
} = require("./appleCommerceAccountTokenService");

/**
 * App Store 인앱 결제 경계.
 *
 * ■ 왜 새 서비스인가
 *
 * 지금까지 결제는 토스 한 갈래였다(paymentService.applyEntitlement). iOS 앱은
 * 심사지침 3.1.1 때문에 인앱 결제만 쓸 수 있어서 갈래가 하나 늘었다.
 *
 * **권한 부여 로직은 새로 쓰지 않는다.** 토스가 부르는 것과 **똑같은 함수**를 부른다:
 *     applyApprovedPackagePayment / applyApprovedMockExamPayment
 * 사이클 생성·학습일 원장·페이백 심사 일정이 전부 거기 있고, 두 벌이 되는 순간 갈린다.
 * 이 파일이 하는 일은 "애플이 준 서명된 거래"를 "결제 승인(approval)"으로 번역하는 것뿐이다.
 * 그래서 아레나 룰·정산 로직은 한 줄도 건드리지 않는다.
 *
 * ■ 왜 앱이 보낸 productCode 를 믿지 않는가
 *
 * 앱이 보내는 값은 위조 가능하다. 29,000원짜리를 사고 5,500원짜리 코드를 보내는 것과
 * 그 반대가 둘 다 된다. **진실원은 JWS 안의 productId** 다. 앱이 보낸 코드는
 * 어긋났을 때 로그를 남기기 위한 대조용이다.
 *
 * ■ 멱등성
 *
 * 같은 거래가 여러 번 온다. 앱이 서버 실패 시 finish() 를 미루고 재시도하고,
 * 복원 흐름에서도 오고, Transaction.updates 리스너에서도 온다.
 * ArenaPackagePayment 의 (provider, providerPaymentKey) 유니크 인덱스가 최종 방어선이고,
 * 그 위에서 미리 조회해 duplicate 로 답한다. 사이클이 둘 생기면 학습일이 두 배가 된다.
 */

const BUNDLE_ID = String(process.env.APPLE_BUNDLE_ID || "kr.matths.app");

/** App Store Connect 제품 ID ↔ 서버 상품 코드. 앱의 MatthsProduct 와 같아야 한다. */
const PRODUCT_BY_APPLE_ID = Object.freeze({
  "kr.matths.app.pass.29d": "LEARNING_PACKAGE_29",
  "kr.matths.app.mock.30d": "MOCK_EXAM_ONLY",
});

const PRODUCT_NAME = Object.freeze({
  LEARNING_PACKAGE_29: "29일 학습권 패키지",
  MOCK_EXAM_ONLY: "Matths 주간 공식 모의고사 이용권",
});

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * 운영 DB 가 샌드박스 거래를 받을지.
 *
 * 심사자는 **샌드박스로 결제한다.** 심사 기간에 이걸 막으면 심사자가 유료 기능을
 * 하나도 못 보고 그대로 반려된다. 그래서 기본값을 막는 쪽으로 두되 환경변수로 연다.
 * 열더라도 어느 환경인지 ArenaPackagePayment.providerMode 에 남겨서, 나중에 매출을
 * 집계할 때 샌드박스가 섞이지 않게 한다.
 */
function sandboxAllowed(environment = process.env) {
  return String(environment.APPLE_ALLOW_SANDBOX || "").trim().toLowerCase() === "true";
}

/** 애플 environment("Sandbox"|"Production") → 우리 providerMode("TEST"|"LIVE"). */
function providerModeOf(appleEnvironment) {
  return String(appleEnvironment || "").toLowerCase() === "production" ? "LIVE" : "TEST";
}

function assertConfigured() {
  if (!isAppleStoreConfigured()) {
    throw statusError(
      503,
      "App Store 결제가 아직 준비되지 않았습니다.",
      "APPLE_STORE_NOT_CONFIGURED"
    );
  }
}

/**
 * 검증된 거래를 우리 상품으로 번역한다.
 * 여기서 걸러야 할 것을 전부 걸러 놓고, 통과한 것만 권한 부여로 넘어간다.
 */
function resolveProduct(transaction, productCodeHint) {
  const productCode = PRODUCT_BY_APPLE_ID[transaction.productId];
  if (!productCode) {
    throw statusError(
      409,
      "확인할 수 없는 상품입니다.",
      "APPLE_PRODUCT_UNKNOWN"
    );
  }
  if (productCodeHint && productCodeHint !== productCode) {
    // 위조일 수도, 앱과 App Store Connect 의 매핑이 어긋난 것일 수도 있다.
    // 어느 쪽이든 사람이 봐야 한다. 거래는 JWS 를 따라 계속 진행한다.
    console.error(
      "[apple] productCode 불일치 — 앱=%s JWS=%s tx=%s",
      productCodeHint,
      productCode,
      transaction.transactionId
    );
  }
  return productCode;
}

function assertTransactionUsable(transaction) {
  if (transaction.bundleId !== BUNDLE_ID) {
    throw statusError(
      403,
      "다른 앱의 결제입니다.",
      "APPLE_BUNDLE_MISMATCH"
    );
  }
  if (providerModeOf(transaction.environment) === "TEST" && !sandboxAllowed()) {
    throw statusError(
      403,
      "테스트 결제는 사용할 수 없습니다.",
      "APPLE_SANDBOX_NOT_ALLOWED"
    );
  }
  if (transaction.revocationDate) {
    // 환불·회수된 거래다. 복원 흐름에서 올 수 있다.
    throw statusError(
      409,
      "환불 처리된 결제입니다.",
      "APPLE_TRANSACTION_REVOKED"
    );
  }
}

/**
 * POST /api/v1/commerce/apple/redeem 의 본체.
 *
 * 앱은 이 호출이 성공해야 애플에 거래 완료(finish)를 알린다. 그래서 실패해도
 * 거래가 사라지지 않고 다음 실행에 다시 온다 — 여기서 조용히 삼키면 안 되고,
 * 실패는 실패로 답해야 한다.
 */
async function redeemAppleTransaction({ userId, jws, productCode: productCodeHint }) {
  assertConfigured();
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(400, "결제 대상 사용자를 확인해주세요.", "INVALID_USER_ID");
  }
  if (!jws || typeof jws !== "string") {
    throw statusError(400, "결제 정보가 없습니다.", "APPLE_JWS_REQUIRED");
  }

  const transaction = await verifySignedTransaction(jws);
  assertTransactionUsable(transaction);
  const productCode = resolveProduct(transaction, productCodeHint);
  const originalTransactionId = String(transaction.originalTransactionId);

  // appAccountToken은 구매 시트가 열리기 전에 Bearer 사용자에게 귀속된다. 지연 승인
  // 도착 전에 앱 로그인이 바뀌어도 "지금 로그인한 사람"에게 권한을 주지 않는다.
  // 구버전 거래에 토큰 원장이 없으면 기존 최초 거래의 userId를 정본으로 삼는다.
  const existingOrigin = await ArenaPackagePayment.findOne({
    provider: "APPLE",
    appleOriginalTransactionId: originalTransactionId,
  }).select("userId").lean();
  if (existingOrigin && String(existingOrigin.userId) !== String(userId)) {
    throw statusError(
      409,
      "이 App Store 결제는 다른 Matths 계정에 연결되어 있습니다.",
      "APPLE_TRANSACTION_OWNER_CONFLICT"
    );
  }
  await assertAppleCommerceAccountTokenOwner({
    userId,
    token: transaction.appAccountToken,
  });

  // 애플의 거래 식별자는 두 가지다. originalTransactionId 는 갱신을 거쳐도 유지되는
  // "구독의 정체성"이고, transactionId 는 갱신마다 새로 발급된다. 사이클은 갱신마다
  // 하나씩 생겨야 하므로 **transactionId** 를 결제 키로 쓴다. originalTransactionId 만
  // 쓰면 두 번째 달 갱신이 중복으로 걸려 학습권이 안 열린다.
  const providerPaymentKey = String(transaction.transactionId);

  const existing = await ArenaPackagePayment.findOne({
    provider: "APPLE",
    providerPaymentKey,
  }).lean();
  if (existing) {
    if (String(existing.userId) !== String(userId)) {
      throw statusError(
        409,
        "이 App Store 결제는 다른 Matths 계정에 연결되어 있습니다.",
        "APPLE_TRANSACTION_OWNER_CONFLICT"
      );
    }
    // 같은 거래를 다시 보낸 것이다. 오류가 아니다 — 앱이 finish() 할 수 있게 성공으로 답한다.
    const cycle = existing.accessCycleId
      ? await AccessCycle.findById(existing.accessCycleId).select("expiresAt").lean()
      : null;
    return {
      granted: true,
      duplicate: true,
      expiresAt: cycle?.expiresAt ? new Date(cycle.expiresAt).toISOString() : null,
    };
  }

  const approval = {
    userId: String(userId),
    provider: "APPLE",
    providerMode: providerModeOf(transaction.environment),
    providerPaymentKey,
    // 주문 참조는 사람이 읽고 애플 거래를 찾아갈 수 있어야 한다.
    orderReference: `apple-${originalTransactionId}-${providerPaymentKey}`,
    idempotencyKey: `apple-entitlement-${providerPaymentKey}`,
    currency: String(transaction.currency || "KRW").toUpperCase(),
    // 애플이 준 실제 청구액(price)은 1/1000 단위 정수다. 없으면 0 으로 두고
    // 정산은 애플 재무 보고서를 진실원으로 삼는다 — 여기서 추측한 금액을 넣으면
    // 그 값이 매출로 굳어 버린다.
    approvedAmount: Number.isFinite(transaction.price)
      ? Math.round(Number(transaction.price) / 1000)
      : 0,
    approvedAt: new Date(transaction.purchaseDate),
    productCode,
    productName: PRODUCT_NAME[productCode],
    // ASSN 은 세션 없이 온다. 그때 누구 거래인지 찾는 열쇠를 지금 남겨 둔다.
    appleOriginalTransactionId: originalTransactionId,
    appleAppAccountToken: transaction.appAccountToken || null,
    // 자동갱신 구독이면 애플이 만료를 정한다. 서버가 30일을 세면 달마다 어긋난다.
    appleExpiresAt: transaction.expiresDate ? new Date(transaction.expiresDate) : null,
  };

  const applied = productCode === "MOCK_EXAM_ONLY"
    ? await applyApprovedMockExamPayment({ ...approval, purchaseMode: "SELF" })
    : await applyApprovedPackagePayment(approval);

  // applyApprovedPackagePayment 는 { payment: { …, accessCycleId } } 를 돌려준다
  // (accessCycleService.js 의 result 조립부). 모의고사 경로는 모양이 달라
  // 세 자리를 다 본다 — 여기서 못 찾으면 만료일이 null 로 나가고, 앱은 남은
  // 기간을 못 그린다(권한 자체는 이미 열린 뒤라 결제는 성공이다).
  const cycleId =
    applied?.payment?.accessCycleId || applied?.cycle?._id || applied?.accessCycleId || null;
  const cycle = cycleId
    ? await AccessCycle.findById(cycleId).select("expiresAt").lean()
    : null;

  return {
    granted: true,
    duplicate: false,
    expiresAt: cycle?.expiresAt ? new Date(cycle.expiresAt).toISOString() : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// App Store Server Notifications V2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 애플이 승인한 환불로 학습권을 회수한다.
 *
 * ■ 왜 refundService.completeRefundRequest 를 쓰지 않는가
 *
 * 그 함수는 **운영자가 심사해서 환불을 승인하는** 흐름이다. RefundRequest 레코드가
 * 먼저 있어야 하고, 페이백이 이미 송금됐으면 409 로 거절해 사람이 처리하게 한다.
 *
 * 애플 환불은 다르다. **애플이 이미 돈을 돌려줬고 우리에게 거부권이 없다.**
 * 여기서 409 를 던지면 애플은 재시도하다 포기하고, 우리는 환불된 학습권을 계속
 * 열어 둔 채로 남는다. 그래서 이 경로는 거절하지 않는다 — 상태를 맞추고,
 * 사람이 봐야 하는 경우에는 표시를 남긴다.
 *
 * 상태 변경은 refundService 가 하는 것과 같은 필드를 같은 값으로 쓴다. 두 경로가
 * 서로 다른 모양을 남기면 나중에 어느 쪽이 맞는지 아무도 모른다.
 */
async function revokeForAppleRefund(transaction) {
  const providerPaymentKey = String(transaction.transactionId);
  const payment = await ArenaPackagePayment.findOne({
    provider: "APPLE",
    providerPaymentKey,
  }).lean();

  if (!payment) {
    // redeem 이 서버에 닿지 못한 거래일 수 있다. 회수할 학습권 자체가 없으니
    // 정상 종료지만, 통지가 왔다는 사실은 남긴다.
    console.warn("[apple] 환불 통지에 대응하는 결제 기록 없음 tx=%s", providerPaymentKey);
    return { revoked: false, reason: "PAYMENT_NOT_FOUND" };
  }

  const cancelTime = transaction.revocationDate
    ? new Date(transaction.revocationDate)
    : new Date();

  // 페이백이 이미 나갔는지 **먼저** 본다. 거절하지는 않지만, 나갔다면 돈이 두 번
  // 나간 것이라 사람이 반드시 봐야 한다.
  const paidOut = payment.accessCycleId
    ? await PaybackPayoutRecord.exists({
        cycleId: payment.accessCycleId,
        status: "COMPLETED",
      })
    : null;

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
        $addToSet: {
          paybackDisqualifiers: paidOut
            ? "APPLE_REFUND_AFTER_PAYOUT"
            : "REFUND_COMPLETED",
        },
      }
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
      }
    );
    await ArenaPaybackReview.updateMany(
      {
        cycleId: payment.accessCycleId,
        status: { $in: ["PENDING", "QUALIFIED", "HELD"] },
      },
      {
        $set: {
          status: "NOT_QUALIFIED",
          evaluatedAt: cancelTime,
          result: { qualified: false, reason: "REFUND_COMPLETED" },
        },
      }
    );
  }

  if (payment.productCode === "MOCK_EXAM_ONLY" && payment.mockExamSubscriptionId) {
    await MockExamSubscription.updateMany(
      { _id: payment.mockExamSubscriptionId },
      // MockExamSubscription의 진실 필드는 endsAt이다. expiresAt을 쓰면 Mongoose가
      // 알 수 없는 필드를 버리고 환불 뒤에도 기존 endsAt까지 권한이 열린다.
      { $set: { status: "CANCELLED", endsAt: cancelTime } }
    );
  }

  await ArenaPackagePayment.updateOne(
    { _id: payment._id },
    { $set: { status: "REFUNDED", processedAt: new Date() } }
  );

  if (paidOut) {
    // 로그로만 남기지 않는다. 조회 가능한 상태(paybackDisqualifiers)에 이미 박아 뒀고,
    // 여기서는 운영자가 눈으로 놓치지 않게 error 수준으로 한 번 더 외친다.
    console.error(
      "[apple] 페이백 송금 후 환불 — 이중 지급 확인 필요 user=%s cycle=%s tx=%s",
      payment.userId,
      payment.accessCycleId,
      providerPaymentKey
    );
  }

  return { revoked: true, paybackAlreadyPaid: Boolean(paidOut) };
}

/**
 * 애플 서버 통지 처리.
 *
 * 인증이 없는 공개 경로라 **서명 검증이 유일한 방어선**이다. 검증 전에는 payload 의
 * 어떤 값도 믿지 않는다.
 *
 * 애플은 2xx 가 아니면 재시도한다(최대 며칠). 그래서 "우리가 모르는 통지"에는
 * 200 을 줘야 한다 — 500 을 주면 애플이 같은 통지를 계속 두드린다. 반대로 처리하다
 * 진짜로 실패했으면 500 을 줘서 재시도를 받아야 한다.
 */
async function handleAppleNotification(signedPayload) {
  assertConfigured();
  const notification = await verifySignedNotification(signedPayload);

  if (notification.bundleId && notification.bundleId !== BUNDLE_ID) {
    throw statusError(403, "다른 앱의 통지입니다.", "APPLE_BUNDLE_MISMATCH");
  }

  const type = String(notification.notificationType || "");
  const transaction = notification.transaction;

  switch (type) {
    case "REFUND":
    case "REVOKE": {
      if (!transaction) return { handled: false, reason: "NO_TRANSACTION" };
      const result = await revokeForAppleRefund(transaction);
      return { handled: true, type, ...result };
    }

    case "SUBSCRIBED":
    case "DID_RENEW": {
      // 최초 결제 또는 자동갱신. 앱이 StoreKit 성공 직후 종료되어 redeem하지 못해도,
      // 구매 시트 전에 저장한 appAccountToken 원장으로 원래 Matths 계정을 찾는다.
      // 구버전 거래는 기존 원거래 userId를 그대로 쓴다.
      if (!transaction) return { handled: false, reason: "NO_TRANSACTION" };
      const origin = await ArenaPackagePayment.findOne({
        provider: "APPLE",
        appleOriginalTransactionId: String(transaction.originalTransactionId),
      })
        .sort({ createdAt: -1 })
        .lean();
      const tokenOwnerId = await findAppleCommerceAccountTokenOwner(
        transaction.appAccountToken
      );
      if (origin && tokenOwnerId && String(origin.userId) !== tokenOwnerId) {
        throw statusError(
          409,
          "App Store 거래의 계정 소유권이 일치하지 않습니다.",
          "APPLE_TRANSACTION_OWNER_CONFLICT"
        );
      }
      const ownerId = origin?.userId || tokenOwnerId;
      if (!ownerId) {
        console.warn(
          "[apple] %s 통지의 계정 소유자를 찾지 못함 original=%s token=%s",
          type,
          transaction.originalTransactionId,
          transaction.appAccountToken || "none"
        );
        return {
          handled: false,
          reason: "OWNER_NOT_FOUND",
        };
      }
      if (type === "DID_RENEW" && !origin) {
        console.warn(
          "[apple] 원거래 없이 사전 귀속 토큰으로 갱신 복구 original=%s",
          transaction.originalTransactionId
        );
      }
      // redeem 과 같은 경로를 탄다. 앱이 리스너로 같은 거래를 보낼 수도 있는데,
      // 그때는 멱등 조회에 걸려 duplicate 로 끝난다.
      const applied = await redeemAppleTransactionFromNotification(ownerId, transaction);
      return { handled: true, type, ...applied };
    }

    case "EXPIRED": {
      if (!transaction) return { handled: false, reason: "NO_TRANSACTION" };
      // 만료는 이미 사이클의 expiresAt 이 처리한다. 스케줄러가 EXPIRED 로 넘긴다.
      // 여기서 따로 손대면 두 곳이 같은 상태를 다투게 된다. 기록만 남긴다.
      console.info(
        "[apple] 구독 만료 통지 original=%s",
        transaction.originalTransactionId
      );
      return { handled: true, type, noop: true };
    }

    case "DID_FAIL_TO_RENEW":
      // 유예 기간(Grace Period)이다. 아직 회수하면 안 된다 — 결제가 다시 시도된다.
      return { handled: true, type, noop: true };

    default:
      // 모르는 통지에 500 을 주면 애플이 같은 것을 계속 재시도한다.
      console.info("[apple] 처리하지 않는 통지 type=%s", type);
      return { handled: false, type, reason: "UNHANDLED_TYPE" };
  }
}

/** 갱신 통지에서 온 거래를 권한 부여로 넘긴다. redeem 과 같은 규칙을 쓴다. */
async function redeemAppleTransactionFromNotification(userId, transaction) {
  assertTransactionUsable(transaction);
  const productCode = resolveProduct(transaction, null);
  const providerPaymentKey = String(transaction.transactionId);

  const existing = await ArenaPackagePayment.findOne({
    provider: "APPLE",
    providerPaymentKey,
  }).lean();
  if (existing) {
    if (String(existing.userId) !== String(userId)) {
      throw statusError(
        409,
        "이 App Store 결제는 다른 Matths 계정에 연결되어 있습니다.",
        "APPLE_TRANSACTION_OWNER_CONFLICT"
      );
    }
    return { granted: true, duplicate: true };
  }

  const approval = {
    userId: String(userId),
    provider: "APPLE",
    providerMode: providerModeOf(transaction.environment),
    providerPaymentKey,
    orderReference: `apple-${transaction.originalTransactionId}-${providerPaymentKey}`,
    idempotencyKey: `apple-entitlement-${providerPaymentKey}`,
    currency: String(transaction.currency || "KRW").toUpperCase(),
    approvedAmount: Number.isFinite(transaction.price)
      ? Math.round(Number(transaction.price) / 1000)
      : 0,
    approvedAt: new Date(transaction.purchaseDate),
    productCode,
    productName: PRODUCT_NAME[productCode],
    appleOriginalTransactionId: String(transaction.originalTransactionId),
    appleAppAccountToken: transaction.appAccountToken || null,
    appleExpiresAt: transaction.expiresDate ? new Date(transaction.expiresDate) : null,
  };

  if (productCode === "MOCK_EXAM_ONLY") {
    await applyApprovedMockExamPayment({ ...approval, purchaseMode: "SELF" });
  } else {
    await applyApprovedPackagePayment(approval);
  }
  return { granted: true, duplicate: false };
}

module.exports = {
  issueAppleCommerceAccountToken,
  redeemAppleTransaction,
  handleAppleNotification,
  isAppleStoreConfigured,
  _testing: {
    PRODUCT_BY_APPLE_ID,
    providerModeOf,
    resolveProduct,
    assertTransactionUsable,
    revokeForAppleRefund,
  },
};
