const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const { MockExamSubscription } = require("../models/goatArenaModel");
const {
  getPricingProductAccess,
} = require("../services/checkoutService");
const {
  assertPackagePurchaseEligible,
} = require("../services/accessCycleService");
const {
  assertMockExamPurchaseEligible,
} = require("../services/mockExamPaymentService");

async function rejectionCode(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return { status: error.status, code: error.code };
  }
}

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);
  try {
    const [freeUser, mockUser, learningUser] = await Promise.all([
      User.findOne({ name: "launchhsfree" }).select("_id").lean(),
      User.findOne({ name: "launchhsmock" }).select("_id").lean(),
      User.findOne({ name: "launchplacementrequired" }).select("_id").lean(),
    ]);
    assert.ok(freeUser && mockUser && learningUser, "목적형 감사 계정이 필요합니다.");

    const [freeAccess, mockAccess, learningAccess] = await Promise.all([
      getPricingProductAccess(freeUser._id),
      getPricingProductAccess(mockUser._id),
      getPricingProductAccess(learningUser._id),
    ]);

    assert.equal(freeAccess.MOCK_EXAM_ONLY.purchaseAllowed, true);
    assert.equal(freeAccess.LEARNING_PACKAGE_29.purchaseAllowed, true);

    assert.equal(mockAccess.MOCK_EXAM_ONLY.active, true);
    assert.equal(mockAccess.MOCK_EXAM_ONLY.purchaseAllowed, false);
    assert.equal(mockAccess.LEARNING_PACKAGE_29.purchaseAllowed, true);
    assert.deepEqual(
      await rejectionCode(assertMockExamPurchaseEligible({ userId: mockUser._id })),
      { status: 409, code: "MOCK_SUBSCRIPTION_ALREADY_ACTIVE" }
    );

    assert.equal(learningAccess.MOCK_EXAM_ONLY.active, true);
    assert.equal(learningAccess.MOCK_EXAM_ONLY.includedByLearningPackage, true);
    assert.equal(learningAccess.MOCK_EXAM_ONLY.purchaseAllowed, false);
    assert.equal(learningAccess.LEARNING_PACKAGE_29.active, true);
    assert.equal(learningAccess.LEARNING_PACKAGE_29.purchaseAllowed, false);
    assert.deepEqual(
      await rejectionCode(assertMockExamPurchaseEligible({ userId: learningUser._id })),
      { status: 409, code: "LEARNING_PACKAGE_ALREADY_INCLUDES_MOCK" }
    );
    const packageRejection = await rejectionCode(
      assertPackagePurchaseEligible({ userId: learningUser._id })
    );
    assert.equal(packageRejection?.status, 409);
    assert.equal(packageRejection?.code, "PACKAGE_PURCHASE_NOT_ELIGIBLE");

    const subscription = await MockExamSubscription.findOne({
      userId: mockUser._id,
      status: "ACTIVE",
    })
      .select("endsAt")
      .lean();
    assert.ok(subscription?.endsAt);
    const afterExpiry = await getPricingProductAccess(
      mockUser._id,
      new Date(new Date(subscription.endsAt).getTime() + 1000)
    );
    assert.equal(afterExpiry.MOCK_EXAM_ONLY.active, false);
    assert.equal(afterExpiry.MOCK_EXAM_ONLY.purchaseAllowed, true);

    console.log(
      "Isolated DB pricing entitlement verification passed: free, mock-only, learning-package, direct duplicate guards, and post-expiry CTA state."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
