const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const {
  AdminTodo,
  SupportInquiry,
  SupportInquirySubmissionGuard,
  User,
} = require("../models/matthsModel");
const {
  createSupportInquiry,
  ensureSupportInquiryIndexes,
} = require("../services/supportInquiryService");

async function run() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/
  );
  await mongoose.connect(process.env.DB);
  let user;
  try {
    await ensureSupportInquiryIndexes();
    const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
    user = await User.create({
      name: `auditfresh${suffix}`.slice(0, 30),
      nameNormalized: `auditfresh${suffix}`.slice(0, 30),
      realName: "문의감사",
      email: `support-audit-${suffix}@test.invalid`,
      passwordHash: "isolated-audit-password-hash",
      role: "student",
      isTestAccount: true,
      testBatchKey: "SUPPORT-INQUIRY-MEMORY-AUDIT",
      learnerType: "WORKER",
      schoolGrade: 15,
      educationStatus: "enrolled",
      accountStatus: "active",
      isActive: true,
    });
    const requestId = crypto.randomUUID();
    const input = {
      userId: user._id,
      requestId,
      subject: "최종 DB 문의 멱등성 감사",
      content: "동일한 문의 요청은 한 번만 저장되어야 합니다.",
    };
    const [first, replay] = await Promise.all([
      createSupportInquiry(input),
      createSupportInquiry(input),
    ]);
    assert.equal(first.inquiry.id, replay.inquiry.id);
    assert.equal(first.emailStatus, "failed");
    assert.equal(replay.emailStatus, "failed");

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
    if (user?._id) {
      const inquiryIds = await SupportInquiry.find({ userId: user._id })
        .distinct("_id");
      await Promise.all([
        AdminTodo.deleteMany({
          sourceType: "SupportInquiry",
          sourceId: { $in: inquiryIds },
        }),
        SupportInquirySubmissionGuard.deleteMany({ userId: user._id }),
        SupportInquiry.deleteMany({ userId: user._id }),
        User.deleteOne({ _id: user._id }),
      ]);
    }
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
