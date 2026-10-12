"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { AdminActionLog, User } = require("../models/matthsModel");
const {
  ArenaPackagePayment,
} = require("../models/goatArenaModel");
const {
  applyApprovedProPayment,
  getAccountPlanAccess,
  updateAccountPlanByAdmin,
} = require("../services/accountPlanService");

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([User.init(), ArenaPackagePayment.init(), AdminActionLog.init()]);
    const [admin, planUser, buyer, appleBuyer] = await User.create([
      { name: "plan-admin", email: "plan-admin@example.invalid", passwordHash: "unused", role: "admin" },
      { name: "plan-user", email: "plan-user@example.invalid", passwordHash: "unused", role: "student" },
      { name: "plan-buyer", email: "plan-buyer@example.invalid", passwordHash: "unused", role: "student" },
      { name: "plan-apple-buyer", email: "plan-apple@example.invalid", passwordHash: "unused", role: "student" },
    ]);
    assert.equal(admin.accountPlan, undefined, "관리자는 사용자 플랜을 만들지 않아야 합니다.");
    assert.equal(planUser.accountPlan.code, "FREE");

    const granted = await updateAccountPlanByAdmin({
      adminUserId: admin._id,
      userId: planUser._id,
      planCode: "PRO",
      reason: "DB 감사용 Pro 지급",
      now: new Date("2026-10-09T03:00:00.000Z"),
    });
    assert.equal(granted.code, "PRO");
    assert.equal(granted.priceAmount, 5500);
    assert.equal(
      (await User.findById(planUser._id).lean()).accountPlan.code,
      "PRO"
    );
    assert.equal(
      await AdminActionLog.countDocuments({ targetUserId: planUser._id, action: "user.account-plan" }),
      1
    );
    await assert.rejects(
      updateAccountPlanByAdmin({
        adminUserId: admin._id,
        userId: admin._id,
        planCode: "FREE",
        reason: "관리자는 변경되면 안 됨",
      }),
      (error) => error.code === "ADMIN_PLAN_IMMUTABLE"
    );

    const approval = {
      userId: buyer._id,
      provider: "INICIS",
      providerMode: "TEST",
      providerPaymentKey: "plan-payment-key-001",
      orderReference: "plan-order-001",
      idempotencyKey: "plan-entitlement-001",
      currency: "KRW",
      approvedAmount: 5500,
      approvedAt: new Date("2026-10-09T04:00:00.000Z"),
      productName: "Matths Pro",
    };
    const first = await applyApprovedProPayment(approval);
    assert.equal(first.replayed, false);
    assert.equal(first.payment.productCode, "PRO_MONTHLY");
    const replay = await applyApprovedProPayment(approval);
    assert.equal(replay.replayed, true);
    assert.equal(await ArenaPackagePayment.countDocuments({ userId: buyer._id }), 1);
    const buyerPlan = await getAccountPlanAccess(buyer._id, {
      now: new Date("2026-10-10T00:00:00.000Z"),
    });
    assert.equal(buyerPlan.code, "PRO");
    assert.equal(buyerPlan.priceAmount, 5500);
    assert.equal(buyerPlan.billingPeriodDays, 30);
    await assert.rejects(
      applyApprovedProPayment({
        ...approval,
        providerPaymentKey: "plan-payment-key-002",
        orderReference: "plan-order-002",
        idempotencyKey: "plan-entitlement-002",
      }),
      (error) => error.code === "PRO_PLAN_ALREADY_ACTIVE"
    );

    const appleApproval = {
      userId: appleBuyer._id,
      provider: "APPLE",
      providerMode: "TEST",
      providerPaymentKey: "apple-plan-payment-001",
      orderReference: "apple-plan-order-001",
      idempotencyKey: "apple-plan-entitlement-001",
      currency: "KRW",
      approvedAmount: 5500,
      approvedAt: new Date("2026-10-09T05:00:00.000Z"),
      productName: "Matths Pro",
      appleOriginalTransactionId: "apple-original-plan-001",
      appleAppAccountToken: "2f54c34e-a809-4fdc-b3ab-e5ff7a87bbd6",
      appleExpiresAt: new Date("2026-11-09T05:00:00.000Z"),
    };
    await applyApprovedProPayment(appleApproval);
    await applyApprovedProPayment({
      ...appleApproval,
      providerPaymentKey: "apple-plan-payment-002",
      orderReference: "apple-plan-order-002",
      idempotencyKey: "apple-plan-entitlement-002",
      approvedAt: new Date("2026-11-01T05:00:00.000Z"),
      appleExpiresAt: new Date("2026-12-09T05:00:00.000Z"),
    });
    const applePlan = await getAccountPlanAccess(appleBuyer._id, {
      now: new Date("2026-11-10T00:00:00.000Z"),
    });
    assert.equal(applePlan.code, "PRO");
    assert.equal(applePlan.endsAt.toISOString(), "2026-12-09T05:00:00.000Z");
    assert.equal(
      await ArenaPackagePayment.countDocuments({ userId: appleBuyer._id }),
      2,
      "App Store 갱신 거래는 각 승인 원장을 보존해야 합니다."
    );

    console.log("Account plan DB verified: admin isolation, transactional 5,500 won Pro grants, replay safety, and App Store renewal.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
