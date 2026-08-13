const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { CheckoutIntent } = require("../models/parentModel");
const {
  buildCheckoutClientConfig,
  _testing: paymentTesting,
} = require("../services/paymentService");
const {
  getTossConfig,
  isTossConfigured,
  tossApiRequest,
} = require("../services/tossPaymentService");
const {
  isPaidCheckoutEnabled,
} = require("../services/checkoutService");
const {
  _testing: accessCycleTesting,
} = require("../services/accessCycleService");

const root = path.resolve(__dirname, "..");
const fakeEnvironment = {
  PAID_CHECKOUT_ENABLED: "true",
  PAYMENT_PROVIDER: "TOSS",
  TOSS_PAYMENTS_MODE: "TEST",
  TOSS_TEST_CLIENT_KEY: "test_gck_verification_client",
  TOSS_TEST_SECRET_KEY: "test_gsk_verification_secret",
};

async function main() {
  const config = getTossConfig(fakeEnvironment);
  assert.equal(config.mode, "TEST");
  assert.equal(isTossConfigured(fakeEnvironment), true);
  assert.equal(isPaidCheckoutEnabled(fakeEnvironment), true);
  assert.match(
    accessCycleTesting.packagePurchaseBlockedMessage([
      "AVAILABLE_BALANCE_REMAINS",
      "PENDING_SETTLEMENT",
    ]),
    /사용 가능한 학습일.*정산이 끝나지 않은 GOAT Arena 경기/
  );
  assert.equal(
    isPaidCheckoutEnabled({ ...fakeEnvironment, TOSS_TEST_SECRET_KEY: "" }),
    false
  );
  assert.throws(
    () => getTossConfig({
      ...fakeEnvironment,
      TOSS_PAYMENTS_MODE: "LIVE",
      TOSS_LIVE_CLIENT_KEY: "test_gck_wrong_mode",
      TOSS_LIVE_SECRET_KEY: "test_gsk_wrong_mode",
    }),
    /LIVE 결제위젯/
  );

  const intent = {
    orderId: "matths-0123456789abcdef0123456789abcdef",
    customerKey: "customer-01234567-89ab-cdef-0123-456789abcdef",
    providerMode: "TEST",
    productName: "29일 학습권 패키지",
    amount: 29000,
    currency: "KRW",
  };
  const browserConfig = buildCheckoutClientConfig(intent, {
    baseUrl: "https://www.matths.kr/path-is-ignored",
    customerEmail: "student@example.com",
    customerName: "김학생",
    environment: fakeEnvironment,
  });
  assert.equal(browserConfig.successUrl, "https://www.matths.kr/payments/toss/success");
  assert.equal(browserConfig.failUrl, "https://www.matths.kr/payments/toss/fail");
  assert.equal(browserConfig.amount, 29000);
  assert.equal(JSON.stringify(browserConfig).includes("verification_secret"), false);

  const normalized = paymentTesting.normalizeSuccessParameters({
    paymentKey: "payment-key-test",
    orderId: intent.orderId,
    amount: "29000",
  });
  assert.equal(normalized.amount, 29000);
  assert.throws(
    () => paymentTesting.normalizeSuccessParameters({
      paymentKey: "payment-key-test",
      orderId: intent.orderId,
      amount: "29001.5",
    }),
    /결제 금액 형식/
  );
  const matched = paymentTesting.assertPaymentMatchesIntent(
    {
      paymentKey: "payment-key-test",
      orderId: intent.orderId,
      totalAmount: 29000,
      currency: "KRW",
      status: "DONE",
      approvedAt: "2026-08-13T08:00:00.000Z",
      method: "카드",
      receipt: { url: "https://dashboard.tosspayments.com/receipt/test" },
    },
    intent,
    "payment-key-test"
  );
  assert.equal(matched.status, "DONE");
  assert.throws(
    () => paymentTesting.assertPaymentMatchesIntent(
      {
        paymentKey: "payment-key-test",
        orderId: intent.orderId,
        totalAmount: 1,
        currency: "KRW",
      },
      intent,
      "payment-key-test"
    ),
    /승인 정보가 서버 주문과 일치/
  );

  let capturedRequest = null;
  const apiPayload = await tossApiRequest("/v1/payments/confirm", {
    method: "POST",
    body: { paymentKey: "payment-key-test", orderId: intent.orderId, amount: 29000 },
    idempotencyKey: "confirm-idempotency-test",
    environment: fakeEnvironment,
    fetchImpl: async (url, request) => {
      capturedRequest = { url, request };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "DONE" }),
      };
    },
  });
  assert.equal(apiPayload.status, "DONE");
  assert.equal(capturedRequest.url, "https://api.tosspayments.com/v1/payments/confirm");
  assert.equal(capturedRequest.request.headers["Idempotency-Key"], "confirm-idempotency-test");
  assert.equal(
    capturedRequest.request.headers.Authorization,
    `Basic ${Buffer.from("test_gsk_verification_secret:").toString("base64")}`
  );

  assert.ok(CheckoutIntent.schema.path("orderId"));
  assert.ok(CheckoutIntent.schema.path("confirmIdempotencyKey"));
  assert.ok(CheckoutIntent.schema.path("providerPaymentKey"));
  const checkoutIndexes = CheckoutIntent.schema.indexes();
  assert.equal(
    checkoutIndexes.some(([, options]) => Number.isFinite(Number(options.expireAfterSeconds))),
    false,
    "결제 감사 주문은 TTL로 자동 삭제하면 안 됩니다."
  );

  const checkoutHtml = await ejs.renderFile(
    path.join(root, "views", "checkout.ejs"),
    {
      user: { id: "user", name: "학생", role: "student" },
      product: {
        name: intent.productName,
        description: "테스트",
        periodLabel: "29일",
        amount: 29000,
        refundPolicy: {},
      },
      intent,
      checkoutConfig: browserConfig,
    }
  );
  assert.match(checkoutHtml, /https:\/\/js\.tosspayments\.com\/v2\/standard/);
  assert.match(checkoutHtml, /widgets\.requestPayment/);
  assert.match(checkoutHtml, /토스 테스트 결제/);

  const routes = [
    fs.readFileSync(path.join(root, "routes", "matths-routes.js"), "utf8"),
    fs.readFileSync(path.join(root, "routes", "api-routes.js"), "utf8"),
  ].join("\n");
  assert.match(routes, /\/payments\/toss\/success/);
  assert.match(routes, /\/payments\/toss\/fail/);
  assert.match(routes, /\/payments\/toss\/webhook/);

  const refundService = fs.readFileSync(
    path.join(root, "services", "refundService.js"),
    "utf8"
  );
  assert.match(refundService, /cancelPayment/);
  assert.match(refundService, /idempotencyKey: `refund-/);
  assert.match(refundService, /providerMode !== tossConfig\.mode/);
  const checkoutService = fs.readFileSync(
    path.join(root, "services", "checkoutService.js"),
    "utf8"
  );
  assert.match(checkoutService, /assertPackagePurchaseEligible/);
  assert.match(checkoutService, /assertMockExamPurchaseEligible/);
  assert.match(checkoutService, /PRODUCT_POLICY_UNAVAILABLE/);

  console.log("Toss Payments TEST integration verified: keys, widget, preflight eligibility, amount validation, idempotency, routes, refunds, and retained checkout audit.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
