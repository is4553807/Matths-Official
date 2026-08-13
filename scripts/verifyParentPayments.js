const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { RefundRequest } = require("../models/refundModel");
const {
  _testing: parentPaymentTesting,
} = require("../services/parentPaymentService");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function main() {
  assert.ok(RefundRequest.schema.path("requestedByType"));
  assert.ok(RefundRequest.schema.path("parentAccountId"));

  assert.equal(
    parentPaymentTesting.effectiveCheckoutStatus(
      {
        status: "AWAITING_PG",
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
      },
      new Date("2026-08-13T00:01:00.000Z")
    ),
    "EXPIRED"
  );
  assert.equal(
    parentPaymentTesting.displayStatus({
      intentStatus: "PAID",
      payment: { status: "APPLIED", refundStatus: "NONE" },
      refund: { status: "REQUESTED" },
    }),
    "REFUND_REQUESTED"
  );
  assert.equal(
    parentPaymentTesting.displayStatus({
      intentStatus: "CANCELLED",
      payment: { status: "REFUNDED", refundStatus: "FULL" },
      refund: { status: "COMPLETED" },
    }),
    "REFUNDED"
  );
  assert.match(
    parentPaymentTesting.checkoutFailureDisplayMessage({
      status: "CANCELLED",
      failureCode: "AVAILABLE_BALANCE_REMAINS",
    }),
    /사용 가능한 학습일.*자동 취소/
  );

  const parentRoutes = read("routes/parent-routes.js");
  const parentService = read("services/parentPaymentService.js");
  const parentNavigation = read("views/partials/parent-navigation.ejs");
  assert.match(parentRoutes, /"\/parent\/payments"/);
  assert.match(parentRoutes, /"\/parent\/payments\/:paymentId\/refund"/);
  assert.match(parentService, /PARENT_PAYMENT_OWNERSHIP_REQUIRED/);
  assert.match(parentService, /requestedByType: "PARENT"/);
  assert.match(parentNavigation, /결제·환불/);

  const paymentData = {
    summary: {
      orderCount: 1,
      paidCount: 1,
      paidAmount: 29000,
      refundedAmount: 0,
      refundableCount: 1,
    },
    orders: [
      {
        id: "intent-1",
        orderId: "matths-parent-order-1",
        productCode: "LEARNING_PACKAGE_29",
        productName: "29일 학습권 패키지",
        amount: 29000,
        currency: "KRW",
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        approvedAt: new Date("2026-08-13T00:01:00.000Z"),
        paymentMethod: "카드",
        receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
        providerMode: "TEST",
        intentStatus: "PAID",
        status: "PAID",
        paymentId: "64b000000000000000000091",
        payment: { status: "APPLIED" },
        refund: null,
        remainingAmount: 29000,
        isRefundable: true,
      },
    ],
  };
  const html = await ejs.renderFile(
    path.join(root, "views", "parent-payments.ejs"),
    {
      parent: { _id: "parent", username: "학부모" },
      child: { _id: "child", name: "학생", realName: "김학생" },
      familyChildren: [
        {
          childId: "child",
          child: { name: "학생", realName: "김학생" },
        },
      ],
      selectedChildId: "child",
      paymentData,
      feedback: "",
      error: "",
    }
  );
  assert.match(html, /결제·환불 관리/);
  assert.match(html, /영수증 보기/);
  assert.match(html, /환불 신청 접수/);
  assert.match(html, /matths-parent-order-1/);
  assert.match(html, /29,000원/);

  console.log("Parent payment history, receipt access, refund ownership, status, and UI verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
