const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { CheckoutIntent } = require("../models/parentModel");
const { ArenaPackagePayment } = require("../models/goatArenaModel");
const { SupportInquiry } = require("../models/matthsModel");
const { RefundRequest } = require("../models/refundModel");
const {
  calculateRefundQuote,
  getRefundDisclosure,
} = require("../services/refundPolicyService");

const root = path.resolve(__dirname, "..");
const views = path.join(root, "views");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function product(code, amount, periodLabel) {
  const value = {
    code,
    amount,
    periodLabel,
    name: code === "MOCK_EXAM_ONLY" ? "Matths 주간 공식 모의고사 이용권" : "29일 학습권 패키지",
    description: "검증용 상품",
  };
  return { ...value, refundPolicy: getRefundDisclosure(value) };
}

async function render(name, locals) {
  return ejs.renderFile(path.join(views, name), {
    publicContactEmail: "dltkddbs4553@matths.kr",
    adminTodoSummary: { pendingCount: 0, items: [] },
    ...locals,
  });
}

async function main() {
  const approvedAt = new Date("2026-08-01T00:00:00.000Z");
  const full = calculateRefundQuote({
    productCode: "LEARNING_PACKAGE_29",
    approvedAmount: 29000,
    approvedAt,
    serviceStartAt: approvedAt,
    requestedAt: new Date("2026-08-03T00:00:00.000Z"),
    paidFeatureUsed: false,
  });
  assert.equal(full.calculationType, "FULL");
  assert.equal(full.calculatedAmount, 29000);

  const partial = calculateRefundQuote({
    productCode: "LEARNING_PACKAGE_29",
    approvedAmount: 29000,
    approvedAt,
    serviceStartAt: approvedAt,
    requestedAt: new Date("2026-08-10T00:00:00.000Z"),
    paidFeatureUsed: true,
  });
  assert.equal(partial.usedDays, 10);
  assert.equal(partial.calculatedAmount, 19000);
  assert.doesNotMatch(partial.formula, /floor/i);
  assert.match(partial.formula, /일할 이용금액/);

  assert.ok(CheckoutIntent.schema.path("refundPolicyAcceptedAt"));
  assert.ok(ArenaPackagePayment.schema.path("refundedAmount"));
  assert.ok(SupportInquiry.schema.path("refundRequestId"));
  assert.ok(RefundRequest.schema.path("decision.providerCancellationTransactionKey"));
  const paymentIndexes = RefundRequest.schema.indexes().filter(
    ([keys]) => Object.keys(keys).length === 1 && keys.paymentId === 1
  );
  assert.equal(paymentIndexes.length, 1);
  assert.equal(paymentIndexes[0][1].unique, true);
  assert.deepEqual(paymentIndexes[0][1].partialFilterExpression, {
    status: { $in: ["REQUESTED", "CALCULATED"] },
  });

  const products = [product("MOCK_EXAM_ONLY", 5000, "30일"), product("LEARNING_PACKAGE_29", 29000, "29일")];
  const pricing = await render("pricing.ejs", {
    user: { id: "user", role: "student" },
    activePage: "pricing",
    mockExamPolicy: { monthlyPriceAmount: 5000 },
    learningPackagePolicy: { priceAmount: 29000 },
    products,
    productAccess: null,
    checkoutEnabled: true,
  });
  assert.match(pricing, /환불 기준/);
  assert.match(pricing, /7영업일/);
  assert.doesNotMatch(pricing, /floor/i);
  assert.match(pricing, /1원 미만 금액은 버/);

  const checkout = await render("checkout.ejs", {
    user: { id: "user", role: "student" },
    product: products[1],
    intent: null,
  });
  assert.match(checkout, /name="refundPolicyAccepted"/);
  assert.match(checkout, /3영업일/);
  assert.doesNotMatch(checkout, /floor/i);

  const contact = await render("contact.ejs", {
    user: { id: "user", role: "student" },
    contactData: {
      user: { nickname: "학생", schoolName: "학교", email: "user@example.com" },
      inquiries: [],
      refundableOrders: [{ id: "payment", productName: "29일 학습권", orderReference: "ORDER-1", approvedAt: new Date("2026-08-13T10:00:00+09:00"), remainingAmount: 19000 }],
    },
    feedback: null,
    inquiryRequestId: "5a8ebeb1-0b55-4d70-a200-8a1d58c85b2e",
    oldInput: { inquiryType: "REFUND", paymentId: "payment", refundReasonType: "SIMPLE_CHANGE", subject: "", content: "" },
  });
  assert.match(contact, /환불 신청/);
  assert.match(contact, /ORDER-1/);
  assert.match(contact, /ORDER-1 - 2026년 8월 13일/);

  const adminRefunds = await render("admin-refunds.ejs", {
    user: { id: "admin", role: "admin", realName: "홍길동" },
    feedback: null,
    refundData: {
      requests: [{
        _id: "refund-positive",
        userId: { realName: "학생", email: "student@example.com" },
        paymentId: { provider: "TOSS", providerMode: "TEST" },
        productNameSnapshot: "29일 학습권",
        orderReferenceSnapshot: "ORDER-1",
        reasonDetail: "환불 요청 사유입니다.",
        requestedAt: new Date("2026-08-13T10:00:00+09:00"),
        processingDeadlineAt: new Date("2026-08-18T10:00:00+09:00"),
        status: "CALCULATED",
        calculation: { approvedAmount: 29000, calculatedAmount: 19000, usedDays: 10, calculationType: "PARTIAL", formula: "부분 환불 산식", calculatedBy: { realName: "관리자" } },
      }, {
        _id: "refund-zero",
        userId: { realName: "학생", email: "student@example.com" },
        paymentId: { provider: "TOSS", providerMode: "TEST" },
        productNameSnapshot: "주간 모의고사 이용권",
        orderReferenceSnapshot: "ORDER-0",
        reasonDetail: "환불 요청 사유입니다.",
        requestedAt: new Date("2026-08-13T10:00:00+09:00"),
        processingDeadlineAt: new Date("2026-08-18T10:00:00+09:00"),
        status: "CALCULATED",
        calculation: { approvedAmount: 5000, calculatedAmount: 0, usedDays: 30, calculationType: "NONE", formula: "잔여 환불액 0원", calculatedBy: { realName: "관리자" } },
      }],
      status: "",
      page: 1,
      total: 2,
      totalPages: 1,
    },
  });
  assert.match(adminRefunds, /취소 API/);
  assert.match(adminRefunds, /환불 관리/);
  assert.match(adminRefunds, /환불 신청 반려/);
  assert.match(adminRefunds, /환불액 0원으로 종결/);
  assert.match(adminRefunds, /\/admin\/refunds\/refund-zero\/reject/);

  const refundService = read("services/refundService.js");
  assert.match(refundService, /withTransaction/);
  assert.match(refundService, /refund-complete:/);
  assert.match(refundService, /state: "PAYMENT_REQUIRED"/);
  assert.match(refundService, /paybackPayoutStatus: "CANCELLED"/);
  assert.match(refundService, /async function rejectRefundRequest/);
  assert.match(refundService, /refund\.close-zero/);
  assert.match(refundService, /status: \{ \$in: \["REQUESTED", "CALCULATED"\] \}/);
  assert.match(read("routes/matths-routes.js"), /"\/admin\/refunds\/:refundRequestId\/reject"/);
  assert.match(read("services/supportInquiryService.js"), /\/admin\/refunds#refund-/);
  assert.match(read("views/admin-inquiries.ejs"), /환불 관리에서 산정·완료·반려 처리/);
  assert.match(read("services/emailService.js"), /return getSupportSmtpAccount\(\)/);
  assert.doesNotMatch(read("services/emailService.js"), /OPERATOR_SMTP_ACCOUNTS_JSON/);

  console.log("Refund policy, disclosures, ledger schema, and atomic completion safeguards verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
