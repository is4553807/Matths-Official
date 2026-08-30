const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { ArenaPackagePayment } = require("../models/goatArenaModel");
const accessCycle = require("../services/accessCycleService");
const mockExam = require("../services/mockExamPaymentService");

const approvedAt = new Date("2026-08-30T12:00:00.000Z");
const expiresAt = new Date("2026-09-30T12:00:00.000Z");
const userId = new mongoose.Types.ObjectId().toString();

function appleInput(overrides = {}) {
  return {
    userId,
    provider: "APPLE",
    providerMode: "TEST",
    providerPaymentKey: "2000000000000001",
    orderReference: "apple-1000000000000001-2000000000000001",
    idempotencyKey: "apple-entitlement-2000000000000001",
    currency: "KRW",
    approvedAmount: 29000,
    approvedAt,
    productName: "29일 학습권 패키지",
    appleOriginalTransactionId: "1000000000000001",
    appleAppAccountToken: "9a11c6bd-43cc-4f54-981f-758fcd5fbf33",
    appleExpiresAt: expiresAt,
    ...overrides,
  };
}

function assertNormalized(normalize) {
  const value = normalize(appleInput());
  assert.equal(value.provider, "APPLE");
  assert.equal(value.providerMode, "TEST");
  assert.equal(value.appleOriginalTransactionId, "1000000000000001");
  assert.equal(value.appleAppAccountToken, "9a11c6bd-43cc-4f54-981f-758fcd5fbf33");
  assert.equal(value.appleExpiresAt.toISOString(), expiresAt.toISOString());

  assert.throws(
    () => normalize(appleInput({ appleOriginalTransactionId: "" })),
    (error) => error.code === "APPLE_SUBSCRIPTION_METADATA_REQUIRED"
  );
  assert.throws(
    () => normalize(appleInput({ appleExpiresAt: approvedAt })),
    (error) => error.code === "APPLE_SUBSCRIPTION_METADATA_REQUIRED"
  );
  assert.throws(
    () => normalize(appleInput({ providerMode: "" })),
    (error) => error.code === "PAYMENT_PROVIDER_MODE_REQUIRED"
  );
}

assertNormalized(accessCycle.normalizePaymentApproval);
assertNormalized(mockExam._testing.normalizeApproval);

const appleEnd = mockExam._testing.subscriptionEndsAt(
  mockExam._testing.normalizeApproval(appleInput({ approvedAmount: 5000 })),
  { billingPeriodDays: 30 }
);
assert.equal(appleEnd.toISOString(), expiresAt.toISOString());

const tossEnd = mockExam._testing.subscriptionEndsAt(
  {
    provider: "TOSS",
    approvedAt,
  },
  { billingPeriodDays: 30 }
);
assert.equal(tossEnd.toISOString(), "2026-09-29T12:00:00.000Z");

for (const field of [
  "appleOriginalTransactionId",
  "appleAppAccountToken",
  "appleExpiresAt",
]) {
  assert.ok(ArenaPackagePayment.schema.path(field), `ArenaPackagePayment.${field} missing`);
}

assert.throws(
  () => accessCycle._testing.assertSamePaymentApproval(
    accessCycle.normalizePaymentApproval(appleInput()),
    accessCycle.normalizePaymentApproval(
      appleInput({ appleOriginalTransactionId: "different-original" })
    )
  ),
  (error) => error.code === "PAYMENT_IDEMPOTENCY_CONFLICT"
);

console.log("Apple subscription lifecycle metadata verification passed");
