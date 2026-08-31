const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");

const root = path.join(__dirname, "..");
const servicePath = require.resolve(path.join(root, "services/appleCommerceService.js"));
const modelPath = require.resolve(path.join(root, "models/goatArenaModel.js"));
const paybackModelPath = require.resolve(path.join(root, "models/paybackModel.js"));
const accessPath = require.resolve(path.join(root, "services/accessCycleService.js"));
const mockPath = require.resolve(path.join(root, "services/mockExamPaymentService.js"));
const verifyPath = require.resolve(path.join(root, "services/appleStoreVerifyService.js"));
const ownershipPath = require.resolve(
  path.join(root, "services/appleCommerceAccountTokenService.js")
);

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();
const tokenA = "9a11c6bd-43cc-4f54-981f-758fcd5fbf33";
const tokenB = "8b22d7ce-54dd-4a65-a82f-869fce6fc044";
const payments = [];
const tokenOwners = new Map([[tokenA, userA], [tokenB, userB]]);
const approvals = [];
let notification;

function chain(value) {
  return {
    sort() { return this; },
    select() { return this; },
    async lean() { return value || null; },
  };
}

const ArenaPackagePayment = {
  findOne(query) {
    if (query.appleOriginalTransactionId) {
      return chain(payments.find((payment) =>
        payment.provider === query.provider
        && payment.appleOriginalTransactionId === query.appleOriginalTransactionId));
    }
    return chain(payments.find((payment) =>
      payment.provider === query.provider
      && payment.providerPaymentKey === query.providerPaymentKey));
  },
};

require.cache[modelPath] = {
  id: modelPath,
  filename: modelPath,
  loaded: true,
  exports: {
    AccessCycle: {},
    ArenaAccessState: {},
    ArenaPackagePayment,
    ArenaPaybackReview: {},
    MockExamSubscription: {},
  },
};
require.cache[paybackModelPath] = {
  id: paybackModelPath,
  filename: paybackModelPath,
  loaded: true,
  exports: { PaybackPayoutRecord: {} },
};
require.cache[accessPath] = {
  id: accessPath,
  filename: accessPath,
  loaded: true,
  exports: {
    async applyApprovedPackagePayment(approval) {
      approvals.push(approval);
      payments.push({ ...approval });
      return { payment: approval };
    },
  },
};
require.cache[mockPath] = {
  id: mockPath,
  filename: mockPath,
  loaded: true,
  exports: {
    async applyApprovedMockExamPayment() {
      throw new Error("unexpected mock-exam product");
    },
  },
};
require.cache[verifyPath] = {
  id: verifyPath,
  filename: verifyPath,
  loaded: true,
  exports: {
    async verifySignedTransaction() { throw new Error("unexpected direct redeem"); },
    async verifySignedNotification() { return notification; },
    isAppleStoreConfigured() { return true; },
  },
};
require.cache[ownershipPath] = {
  id: ownershipPath,
  filename: ownershipPath,
  loaded: true,
  exports: {
    async issueAppleCommerceAccountToken() { throw new Error("unexpected token issue"); },
    async assertAppleCommerceAccountTokenOwner() {
      throw new Error("unexpected direct owner assertion");
    },
    async findAppleCommerceAccountTokenOwner(token) {
      return tokenOwners.get(String(token || "").toLowerCase()) || null;
    },
  },
};

delete require.cache[servicePath];
const { handleAppleNotification } = require(servicePath);

function transaction(overrides = {}) {
  return {
    bundleId: "kr.matths.app",
    productId: "kr.matths.app.pass.29d",
    transactionId: "2000000000000001",
    originalTransactionId: "1000000000000001",
    appAccountToken: tokenA,
    environment: "Production",
    purchaseDate: "2026-09-01T00:00:00.000Z",
    expiresDate: "2026-10-01T00:00:00.000Z",
    currency: "KRW",
    price: 29000000,
    revocationDate: null,
    ...overrides,
  };
}

async function run() {
  notification = {
    bundleId: "kr.matths.app",
    notificationType: "SUBSCRIBED",
    transaction: transaction(),
  };
  const subscribed = await handleAppleNotification("signed-subscribed");
  assert.equal(subscribed.handled, true);
  assert.equal(subscribed.type, "SUBSCRIBED");
  assert.equal(approvals.length, 1);
  assert.equal(String(approvals[0].userId), userA);
  assert.equal(approvals[0].appleAppAccountToken, tokenA);

  const replay = await handleAppleNotification("signed-subscribed-replay");
  assert.equal(replay.duplicate, true);
  assert.equal(approvals.length, 1, "SUBSCRIBED 재전송이 권한을 두 번 열면 안 됩니다.");

  notification = {
    bundleId: "kr.matths.app",
    notificationType: "SUBSCRIBED",
    transaction: transaction({
      transactionId: "2000000000000002",
      originalTransactionId: "1000000000000002",
      appAccountToken: "7c33e8df-65ee-4b76-b93f-970fdf70d155",
    }),
  };
  const unknown = await handleAppleNotification("signed-unknown-token");
  assert.equal(unknown.handled, false);
  assert.equal(unknown.reason, "OWNER_NOT_FOUND");
  assert.equal(approvals.length, 1, "미등록 appAccountToken에 권한을 열면 안 됩니다.");

  notification = {
    bundleId: "kr.matths.app",
    notificationType: "DID_RENEW",
    transaction: transaction({
      transactionId: "2000000000000003",
      originalTransactionId: "1000000000000003",
    }),
  };
  const recoveredRenewal = await handleAppleNotification("signed-renewal");
  assert.equal(recoveredRenewal.handled, true);
  assert.equal(String(approvals.at(-1).userId), userA);

  payments.push({
    provider: "APPLE",
    providerPaymentKey: "old-owner-transaction",
    appleOriginalTransactionId: "1000000000000004",
    userId: userB,
  });
  notification = {
    bundleId: "kr.matths.app",
    notificationType: "DID_RENEW",
    transaction: transaction({
      transactionId: "2000000000000004",
      originalTransactionId: "1000000000000004",
      appAccountToken: tokenA,
    }),
  };
  await assert.rejects(
    handleAppleNotification("signed-owner-conflict"),
    (error) => error.code === "APPLE_TRANSACTION_OWNER_CONFLICT"
  );

  payments.push({
    provider: "APPLE",
    providerPaymentKey: "2000000000000005",
    appleOriginalTransactionId: "1000000000000005",
    userId: userB,
  });
  notification = {
    bundleId: "kr.matths.app",
    notificationType: "SUBSCRIBED",
    transaction: transaction({
      transactionId: "2000000000000005",
      originalTransactionId: "1000000000000005",
      appAccountToken: tokenA,
    }),
  };
  await assert.rejects(
    handleAppleNotification("signed-duplicate-owner-conflict"),
    (error) => error.code === "APPLE_TRANSACTION_OWNER_CONFLICT"
  );

  console.log(
    "Apple SUBSCRIBED/renewal recovery passed: pre-bound owner, idempotency, unknown-token refusal, and owner conflicts."
  );
}

run().finally(() => {
  delete require.cache[servicePath];
});
