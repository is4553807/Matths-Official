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
  approvePayment,
  cancelPayment,
  createPaymentHash,
  createRefundHash,
  getInicisConfig,
  isInicisConfigured,
} = require("../services/inicisPaymentService");
const {
  ensureCheckoutIntentIndexes,
  isPaidCheckoutAllowedForEmail,
  isPaidCheckoutEnabled,
} = require("../services/checkoutService");
const { _testing: accessCycleTesting } = require("../services/accessCycleService");

const root = path.resolve(__dirname, "..");
const fakeEnvironment = {
  PAID_CHECKOUT_ENABLED: "true",
  PAYMENT_PROVIDER: "INICIS",
  INICIS_PAYMENTS_MODE: "TEST",
  INICIS_TEST_MID: "INIpayTest",
  INICIS_TEST_HASH_KEY: "123456789012345678901234567890",
  INICIS_TEST_API_KEY: "test-api-key-123456789012345678",
  INICIS_TEST_CLIENT_IP: "203.0.113.10",
  INICIS_TEST_REVIEW_EMAILS: "kginicis@test.com",
};

function response(payload, { json = false } = {}) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      json ? JSON.stringify(payload) : new URLSearchParams(payload).toString(),
  };
}

async function main() {
  const originalIndexes = CheckoutIntent.collection.indexes;
  const originalDropIndex = CheckoutIntent.collection.dropIndex;
  const originalCreateIndexes = CheckoutIntent.createIndexes;
  const originalUpdateMany = CheckoutIntent.updateMany;
  const droppedIndexes = [];
  try {
    CheckoutIntent.collection.indexes = async () => [
      { name: "_id_", key: { _id: 1 } },
      {
        name: "provider_1_providerOrderId_1",
        key: { provider: 1, providerOrderId: 1 },
        unique: true,
      },
      { name: "orderId_1", key: { orderId: 1 }, unique: true },
    ];
    CheckoutIntent.collection.dropIndex = async (name) => {
      droppedIndexes.push(name);
    };
    CheckoutIntent.createIndexes = async () => [];
    CheckoutIntent.updateMany = async () => ({ modifiedCount: 0 });
    const migration = await ensureCheckoutIntentIndexes();
    assert.equal(
      migration.removedLegacyProviderOrderIndex,
      "provider_1_providerOrderId_1"
    );
    assert.deepEqual(droppedIndexes, ["provider_1_providerOrderId_1"]);
  } finally {
    CheckoutIntent.collection.indexes = originalIndexes;
    CheckoutIntent.collection.dropIndex = originalDropIndex;
    CheckoutIntent.createIndexes = originalCreateIndexes;
    CheckoutIntent.updateMany = originalUpdateMany;
  }

  const config = getInicisConfig(fakeEnvironment);
  assert.equal(config.mode, "TEST");
  assert.equal(config.mid, "INIpayTest");
  assert.match(config.sdkUrl, /^https:\/\/stgpaypro\.inicis\.com\//);
  assert.equal(isInicisConfigured(fakeEnvironment), true);
  assert.equal(isPaidCheckoutEnabled(fakeEnvironment), true);
  assert.equal(
    isPaidCheckoutAllowedForEmail("KGINICIS@test.com", fakeEnvironment),
    true
  );
  assert.equal(
    isPaidCheckoutAllowedForEmail("student@example.com", fakeEnvironment),
    false
  );
  assert.equal(
    isPaidCheckoutEnabled({ ...fakeEnvironment, INICIS_TEST_HASH_KEY: "" }),
    false
  );
  await assert.rejects(
    () =>
      approvePayment(
        { authTid: "auth-tid-verification", amount: 29000, idcName: "fc" },
        { environment: fakeEnvironment, fetchImpl: async () => response({}) }
      ),
    (error) => error.code === "INICIS_IDC_MODE_MISMATCH"
  );
  assert.match(
    accessCycleTesting.packagePurchaseBlockedMessage([
      "AVAILABLE_BALANCE_REMAINS",
      "PENDING_SETTLEMENT",
    ]),
    /사용 가능한 학습일.*정산이 끝나지 않은 GOAT Arena 경기/
  );

  assert.equal(
    createPaymentHash({
      amount: 1000,
      orderId: "20150515208799704",
      timestamp: "1431678259",
      hashKey: "123456789012345678901234567890",
    }),
    "hE/Q+F//ZmnoGFNercEp6qyTaIuq7CLbrrUHtFWRKyktueQl97wjjISvqBB0aZC25b79YNs7bLxPT/hKMwySNA==",
    "공식 KG이니시스 P_CHKFAKE 예제와 동일해야 합니다."
  );

  const intent = {
    orderId: "matths-0123456789abcdef0123456789abcdef",
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
  assert.equal(browserConfig.fields.P_NEXT_URL, "https://www.matths.kr/payments/inicis/return");
  assert.equal(
    browserConfig.fields.P_CLOSE_URL,
    `https://www.matths.kr/payments/inicis/close?orderId=${intent.orderId}`
  );
  assert.equal(browserConfig.fields.P_AMT, 29000);
  assert.equal(browserConfig.fields.P_PAY_TYPE, "CARD");
  assert.equal(browserConfig.fields.P_NOTI, intent.orderId);
  assert.equal(JSON.stringify(browserConfig).includes(fakeEnvironment.INICIS_TEST_HASH_KEY), false);
  assert.equal(JSON.stringify(browserConfig).includes(fakeEnvironment.INICIS_TEST_API_KEY), false);

  const authentication = paymentTesting.normalizeAuthenticationParameters({
    P_STATUS: "00",
    P_MID: "INIpayTest",
    P_AUTH_TID: "auth-tid-verification",
    P_OID: intent.orderId,
    P_AMT: "29000",
    P_IDCNAME: "stg",
    P_NOTI: intent.orderId,
    P_CHARSET: "UTF-8",
  });
  assert.equal(authentication.amount, 29000);
  assert.throws(
    () =>
      paymentTesting.normalizeAuthenticationParameters({
        P_STATUS: "00",
        P_AUTH_TID: "auth-tid-verification",
        P_OID: intent.orderId,
        P_AMT: "29001.5",
      }),
    /결제 금액 형식/
  );
  const approved = paymentTesting.normalizeApprovedPayment(
    {
      P_STATUS: "00",
      P_MID: "INIpayTest",
      P_AUTH_TID: "auth-tid-verification",
      P_APPL_TID: "approval-tid-verification",
      P_OID: intent.orderId,
      P_AMT: "29000",
      P_TYPE: "CARD",
      P_NOTI: intent.orderId,
      P_APPL_DT: "20260902",
      P_APPL_TM: "102030",
    },
    intent,
    authentication,
    "INIpayTest"
  );
  assert.equal(approved.paymentKey, "approval-tid-verification");
  assert.equal(approved.approvedAt.toISOString(), "2026-09-02T01:20:30.000Z");

  let approvalRequest;
  const approvalPayload = await approvePayment(
    { authTid: "auth-tid-verification", amount: 29000, idcName: "stg" },
    {
      environment: fakeEnvironment,
      fetchImpl: async (url, request) => {
        approvalRequest = { url, request };
        return response({
          P_STATUS: "00",
          P_APPL_TID: "approval-tid-verification",
        });
      },
    }
  );
  assert.equal(approvalPayload.P_STATUS, "00");
  assert.equal(
    approvalRequest.url,
    "https://stgpaypro.inicis.com/payment/v1/rest/payAppl.ini"
  );
  const approvalForm = new URLSearchParams(approvalRequest.request.body);
  assert.equal(approvalForm.get("P_MID"), "INIpayTest");
  assert.equal(approvalForm.get("P_AUTH_TID"), "auth-tid-verification");

  let refundRequest;
  const refund = await cancelPayment(
    {
      paymentKey: "approval-tid-verification",
      cancelReason: "Matths verification refund",
      cancelAmount: 9000,
      remainingAmount: 20000,
      paymentMethod: "CARD",
      fullCancellation: false,
    },
    {
      environment: fakeEnvironment,
      fetchImpl: async (url, request) => {
        refundRequest = { url, request };
        return response(
          {
            resultCode: "00",
            resultMsg: "정상처리",
            prtcDate: "20260902",
            prtcTime: "103000",
            tid: "partial-refund-tid",
          },
          { json: true }
        );
      },
    }
  );
  assert.equal(refund.transactionKey, "partial-refund-tid");
  assert.equal(refund.cancelledAt.toISOString(), "2026-09-02T01:30:00.000Z");
  assert.equal(refundRequest.url, "https://stginiapi.inicis.com/api/v1/refund");
  const refundForm = new URLSearchParams(refundRequest.request.body);
  assert.equal(refundForm.get("type"), "PartialRefund");
  assert.equal(refundForm.get("paymethod"), "Card");
  assert.equal(refundForm.get("price"), "9000");
  assert.equal(refundForm.get("confirmPrice"), "20000");
  assert.equal(
    refundForm.get("hashData"),
    createRefundHash({
      apiKey: fakeEnvironment.INICIS_TEST_API_KEY,
      type: refundForm.get("type"),
      paymethod: refundForm.get("paymethod"),
      timestamp: refundForm.get("timestamp"),
      clientIp: refundForm.get("clientIp"),
      mid: refundForm.get("mid"),
      tid: refundForm.get("tid"),
      price: refundForm.get("price"),
      confirmPrice: refundForm.get("confirmPrice"),
    })
  );

  assert.ok(CheckoutIntent.schema.path("orderId"));
  assert.equal(CheckoutIntent.schema.path("providerOrderId"), undefined);
  assert.ok(CheckoutIntent.schema.path("providerPaymentKey"));
  assert.ok(CheckoutIntent.schema.path("provider").enumValues.includes("INICIS"));
  assert.equal(
    CheckoutIntent.schema
      .indexes()
      .some(([, options]) => Number.isFinite(Number(options.expireAfterSeconds))),
    false,
    "결제 감사 주문은 TTL로 자동 삭제하면 안 됩니다."
  );
  const checkoutServiceSource = fs.readFileSync(
    path.join(root, "services", "checkoutService.js"),
    "utf8"
  );
  assert.match(checkoutServiceSource, /legacyProviderOrderIndex/);
  assert.match(checkoutServiceSource, /providerOrderId/);

  const checkoutHtml = await ejs.renderFile(path.join(root, "views", "checkout.ejs"), {
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
  });
  assert.match(checkoutHtml, /stgpaypro\.inicis\.com\/std\/payment\/js\/INIPayPro_v2\.js/);
  assert.match(checkoutHtml, /Object\.fromEntries\(new FormData\(form\)\.entries\(\)\)/);
  assert.match(checkoutHtml, /INIPayPro\.requestPayment\(paymentFields\)/);
  assert.match(checkoutHtml, /"MOBILE"[\s\S]*"WEB"/);
  assert.match(checkoutHtml, /KG이니시스 테스트 결제/);
  assert.doesNotMatch(checkoutHtml, /TossPayments|tosspayments/);

  const routes = fs.readFileSync(path.join(root, "routes", "matths-routes.js"), "utf8");
  assert.match(routes, /\/payments\/inicis\/return/);
  assert.match(routes, /\/payments\/inicis\/close/);
  assert.doesNotMatch(routes, /\/payments\/toss/);

  const refundService = fs.readFileSync(
    path.join(root, "services", "refundService.js"),
    "utf8"
  );
  assert.match(refundService, /provider === "INICIS"/);
  assert.match(refundService, /providerMode !== inicisConfig\.mode/);
  assert.match(refundService, /fullCancellation: mode === "FULL"/);

  console.log(
    "KG이니시스 TEST integration verified: official hash, signed request, server approval, amount/order validation, unified checkout, routes, and full/partial refund wiring."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
