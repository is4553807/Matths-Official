const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  AdminTodo,
  SupportInquiry,
  SupportInquirySubmissionGuard,
  User,
} = require("../models/matthsModel");

async function run() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/
  );
  await mongoose.connect(process.env.DB);
  try {
    const user = await User.findOne({
      name: "auditfresh0815",
    }).lean();
    assert.ok(user, "감사 사용자를 찾을 수 없습니다.");

    const inquiries = await SupportInquiry.find({
      userId: user._id,
      subject: "최종 DB 문의 멱등성 감사",
    }).lean();
    assert.equal(inquiries.length, 1);
    const [inquiry] = inquiries;
    assert.match(
      inquiry.requestId,
      /^[0-9a-f-]{36}$/
    );
    assert.equal(inquiry.status, "pending");
    assert.equal(
      inquiry.emailNotification.status,
      "failed"
    );

    const [todo, guard] = await Promise.all([
      AdminTodo.findOne({
        sourceType: "SupportInquiry",
        sourceId: inquiry._id,
      }).lean(),
      SupportInquirySubmissionGuard.findById(
        `STUDENT:${user._id}`
      ).lean(),
    ]);
    assert.ok(todo);
    assert.equal(todo.status, "pending");
    // The guard is intentionally ephemeral: MongoDB removes it through the
    // nextAllowedAt TTL index once the short submission cooldown expires.
    // Validate its contents only while it is still present; persistence of the
    // inquiry and admin todo must outlive that cooldown.
    if (guard) {
      assert.equal(guard.requestId, inquiry.requestId);
      assert.equal(String(guard.userId), String(user._id));
      assert.ok(guard.nextAllowedAt > inquiry.createdAt);
    }

    const inquiryIndexes =
      await SupportInquiry.collection.indexes();
    assert.ok(
      inquiryIndexes.some(
        (index) =>
          index.unique === true &&
          index.key.userId === 1 &&
          index.key.submittedByType === 1 &&
          index.key.parentAccountId === 1 &&
          index.key.requestId === 1
      )
    );
    const guardIndexes =
      await SupportInquirySubmissionGuard.collection.indexes();
    assert.ok(
      guardIndexes.some(
        (index) =>
          index.key.nextAllowedAt === 1 &&
          index.expireAfterSeconds === 0
      )
    );

    console.log(
      `Live isolated support inquiry DB verification passed: one inquiry, request key, failed-email state, admin todo, unique index, and TTL index persisted; cooldown guard ${guard ? "is valid" : "expired as designed"}.`
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
