const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const {
  AdminActionLog,
  AdminTodo,
  SupportInquiry,
  User,
  UserNotification,
} = require("../models/matthsModel");
const { ArenaPackagePayment } = require("../models/goatArenaModel");
const { RefundRequest } = require("../models/refundModel");
const { createAdminTodo } = require("../services/adminTodoService");
const { rejectRefundRequest } = require("../services/refundService");

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const ids = { users: [], payment: null, inquiry: null, refund: null };
  try {
    const [admin, student] = await User.create([{
      name: `refundadmin${suffix}`,
      nameNormalized: `refundadmin${suffix}`,
      realName: "환불검증관리자",
      email: `refund-admin-${suffix}@audit.invalid`,
      passwordHash: "$2b$12$auditonlyauditonlyauditonlyauditonlyauditonlyauditonlyaudit",
      role: "admin",
      isActive: true,
      accountStatus: "active",
    }, {
      name: `refundstudent${suffix}`,
      nameNormalized: `refundstudent${suffix}`,
      realName: "환불검증학생",
      email: `refund-student-${suffix}@audit.invalid`,
      passwordHash: "$2b$12$auditonlyauditonlyauditonlyauditonlyauditonlyauditonlyaudit",
      role: "student",
      isActive: true,
      accountStatus: "active",
    }]);
    ids.users = [admin._id, student._id];

    const approvedAt = new Date("2026-07-01T00:00:00.000Z");
    const payment = await ArenaPackagePayment.create({
      userId: student._id,
      provider: "INICIS",
      providerMode: "TEST",
      providerPaymentKey: `audit-payment-${suffix}`,
      orderReference: `audit-order-${suffix}`,
      idempotencyKey: `audit-idempotency-${suffix}`,
      status: "APPLIED",
      approvedAt,
      approvedAmount: 5000,
      productCode: "MOCK_EXAM_ONLY",
      productName: "Matths 주간 공식 모의고사 이용권",
      refundStatus: "CALCULATED",
    });
    ids.payment = payment._id;

    const inquiry = await SupportInquiry.create({
      userId: student._id,
      requestId: randomUUID(),
      submittedByType: "STUDENT",
      authorNickname: student.name,
      authorRealName: student.realName,
      contactEmail: student.email,
      schoolName: "감사학교",
      inquiryType: "REFUND",
      paymentId: payment._id,
      orderReferenceSnapshot: payment.orderReference,
      subject: "0원 환불 종결 검증",
      content: "이용 기간이 종료된 주문의 환불 처리를 확인합니다.",
      status: "in_review",
    });
    ids.inquiry = inquiry._id;

    const refund = await RefundRequest.create({
      requestKey: `refund-request:${randomUUID()}`,
      userId: student._id,
      paymentId: payment._id,
      supportInquiryId: inquiry._id,
      requestedByType: "STUDENT",
      productCode: "MOCK_EXAM_ONLY",
      productNameSnapshot: payment.productName,
      orderReferenceSnapshot: payment.orderReference,
      providerPaymentKeySnapshot: payment.providerPaymentKey,
      reasonType: "SIMPLE_CHANGE",
      reasonDetail: inquiry.content,
      status: "CALCULATED",
      requestedAt: new Date("2026-08-20T00:00:00.000Z"),
      processingDeadlineAt: new Date("2026-08-25T00:00:00.000Z"),
      calculation: {
        approvedAmount: 5000,
        calculatedAmount: 0,
        usedDays: 30,
        calculationType: "NONE",
        formula: "이용 기간 종료로 잔여 환불액 0원",
        calculatedAt: new Date("2026-08-24T00:00:00.000Z"),
        calculatedBy: admin._id,
      },
    });
    ids.refund = refund._id;
    await Promise.all([
      SupportInquiry.updateOne(
        { _id: inquiry._id },
        { $set: { refundRequestId: refund._id } }
      ),
      ArenaPackagePayment.updateOne(
        { _id: payment._id },
        { $set: { latestRefundRequestId: refund._id } }
      ),
      createAdminTodo({
        category: "inquiry",
        title: "0원 환불 종결 검증",
        href: `/admin/inquiries#inquiry-${inquiry._id}`,
        targetUserId: student._id,
        actorUserId: student._id,
        sourceType: "SupportInquiry",
        sourceId: inquiry._id,
        status: "pending",
      }),
    ]);
    await createAdminTodo({
      category: "inquiry",
      title: "0원 환불 종결 검증",
      href: `/admin/refunds#refund-${refund._id}`,
      targetUserId: student._id,
      actorUserId: student._id,
      sourceType: "SupportInquiry",
      sourceId: inquiry._id,
      metadata: { refundRequestId: String(refund._id) },
      refreshExisting: true,
    });

    const result = await rejectRefundRequest({
      adminUserId: admin._id,
      refundRequestId: refund._id,
      operatorNote: "이용 기간 종료로 환불 가능 잔액이 없습니다.",
    });
    assert.equal(result.zeroAmountClosure, true);

    const [savedRefund, savedPayment, savedInquiry, savedTodo, notification, action] =
      await Promise.all([
        RefundRequest.findById(refund._id).lean(),
        ArenaPackagePayment.findById(payment._id).lean(),
        SupportInquiry.findById(inquiry._id).lean(),
        AdminTodo.findOne({ sourceType: "SupportInquiry", sourceId: inquiry._id }).lean(),
        UserNotification.findOne({ dedupeKey: `refund-rejected:${refund._id}` }).lean(),
        AdminActionLog.findOne({ action: "refund.close-zero", "metadata.refundRequestId": String(refund._id) }).lean(),
      ]);
    assert.equal(savedRefund.status, "REJECTED");
    assert.equal(savedRefund.decision.approvedAmount, 0);
    assert.equal(savedRefund.decision.cancellationMode, "");
    assert.match(savedRefund.decision.operatorNote, /환불 가능 잔액/);
    assert.equal(savedPayment.status, "APPLIED");
    assert.equal(savedPayment.refundStatus, "REJECTED");
    assert.equal(savedPayment.refundedAmount, 0);
    assert.equal(savedInquiry.status, "closed");
    assert.equal(savedTodo.status, "completed");
    assert.equal(savedTodo.href, `/admin/refunds#refund-${refund._id}`);
    assert.ok(notification);
    assert.ok(action);

    console.log("Isolated DB refund rejection verification passed: zero-won closure, payment preservation, inquiry/todo closure, notification, and audit log.");
  } finally {
    await Promise.all([
      UserNotification.deleteMany({ userId: { $in: ids.users } }),
      AdminActionLog.deleteMany({ targetUserId: { $in: ids.users } }),
      AdminTodo.deleteMany({ $or: [{ targetUserId: { $in: ids.users } }, { actorUserId: { $in: ids.users } }] }),
      SupportInquiry.deleteMany({ _id: ids.inquiry }),
      RefundRequest.deleteMany({ _id: ids.refund }),
      ArenaPackagePayment.deleteMany({ _id: ids.payment }),
      User.deleteMany({ _id: { $in: ids.users } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
