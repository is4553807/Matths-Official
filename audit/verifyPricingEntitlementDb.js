const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const {
  getPricingProductAccess,
} = require("../services/checkoutService");
const {
  assertProPurchaseEligible,
  proPlanDraft,
} = require("../services/accountPlanService");

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
    const now = new Date("2026-10-09T03:00:00.000Z");
    const [freeUser, proUser, expiredUser, admin] = await User.create([
      { name: "pricing-free", email: "pricing-free@example.invalid", passwordHash: "unused", role: "student" },
      {
        name: "pricing-pro",
        email: "pricing-pro@example.invalid",
        passwordHash: "unused",
        role: "student",
        accountPlan: proPlanDraft({ now, startsAt: now, endsAt: new Date("2026-11-08T03:00:00.000Z") }),
      },
      {
        name: "pricing-expired",
        email: "pricing-expired@example.invalid",
        passwordHash: "unused",
        role: "student",
        accountPlan: proPlanDraft({ now, startsAt: new Date("2026-09-01T00:00:00.000Z"), endsAt: now }),
      },
      { name: "pricing-admin", email: "pricing-admin@example.invalid", passwordHash: "unused", role: "admin" },
    ]);

    const [freeAccess, proAccess, expiredAccess, adminAccess] = await Promise.all([
      getPricingProductAccess(freeUser._id, now),
      getPricingProductAccess(proUser._id, now),
      getPricingProductAccess(expiredUser._id, now),
      getPricingProductAccess(admin._id, now),
    ]);
    assert.equal(freeAccess.PRO_MONTHLY.purchaseAllowed, true);
    assert.equal(proAccess.PRO_MONTHLY.active, true);
    assert.equal(proAccess.PRO_MONTHLY.purchaseAllowed, false);
    assert.equal(expiredAccess.PRO_MONTHLY.active, false);
    assert.equal(expiredAccess.PRO_MONTHLY.purchaseAllowed, true);
    assert.equal(adminAccess.PRO_MONTHLY.active, true);
    assert.equal(adminAccess.PRO_MONTHLY.purchaseAllowed, false);
    assert.deepEqual(
      await rejectionCode(assertProPurchaseEligible({ userId: proUser._id, now })),
      { status: 409, code: "PRO_PLAN_ALREADY_ACTIVE" }
    );
    assert.deepEqual(
      await rejectionCode(assertProPurchaseEligible({ userId: admin._id, now })),
      { status: 409, code: "ADMIN_PLAN_PURCHASE_NOT_REQUIRED" }
    );

    console.log(
      "Isolated DB pricing entitlement verification passed: FREE, active/expired Pro and administrator states."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
