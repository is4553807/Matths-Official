"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const mongoose = require("mongoose");

const root = path.join(__dirname, "..");
const servicePath = require.resolve(path.join(root, "services/appleCommerceService.js"));
const modelPath = require.resolve(path.join(root, "models/goatArenaModel.js"));
const matthsModelPath = require.resolve(path.join(root, "models/matthsModel.js"));
const accountPlanPath = require.resolve(path.join(root, "services/accountPlanService.js"));
const verifyPath = require.resolve(path.join(root, "services/appleStoreVerifyService.js"));
const ownershipPath = require.resolve(
  path.join(root, "services/appleCommerceAccountTokenService.js")
);

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();
const previousProductId = process.env.APPLE_PRO_PRODUCT_ID;
process.env.APPLE_PRO_PRODUCT_ID = "kr.matths.app.pro.monthly";

let transaction;
let grantCount = 0;
let ownerAssertionCount = 0;
const payments = [{
  _id: new mongoose.Types.ObjectId(),
  provider: "APPLE",
  providerPaymentKey: "applied-pro-transaction",
  appleOriginalTransactionId: "applied-pro-original",
  userId: userA,
  productCode: "PRO_MONTHLY",
  accountPlanEndsAt: new Date("2026-11-10T00:00:00.000Z"),
}];

function chain(value) {
  return {
    select() { return this; },
    sort() { return this; },
    async lean() { return value || null; },
  };
}

const ArenaPackagePayment = {
  findOne(query) {
    if (query.providerPaymentKey) {
      return chain(payments.find((payment) => (
        payment.provider === query.provider &&
        payment.providerPaymentKey === query.providerPaymentKey
      )));
    }
    if (query.appleOriginalTransactionId) {
      return chain(payments.find((payment) => (
        payment.provider === query.provider &&
        payment.appleOriginalTransactionId === query.appleOriginalTransactionId
      )));
    }
    return chain(null);
  },
};

require.cache[modelPath] = {
  id: modelPath,
  filename: modelPath,
  loaded: true,
  exports: {
    ArenaPackagePayment,
  },
};
require.cache[matthsModelPath] = {
  id: matthsModelPath,
  filename: matthsModelPath,
  loaded: true,
  exports: { User: {} },
};
require.cache[accountPlanPath] = {
  id: accountPlanPath,
  filename: accountPlanPath,
  loaded: true,
  exports: {
    async applyApprovedProPayment(approval) {
      grantCount += 1;
      return {
        payment: {
          ...approval,
          accountPlanEndsAt: new Date("2026-11-10T00:00:00.000Z"),
        },
      };
    },
    freePlanDraft() { return { code: "FREE" }; },
    getProAppleProductId() { return process.env.APPLE_PRO_PRODUCT_ID || ""; },
    isProAppleProductConfigured() { return true; },
    RETIRED_APPLE_PRODUCT_IDS: [
      "kr.matths.app.pass.29d",
      "kr.matths.app.mock.30d",
    ],
  },
};
require.cache[verifyPath] = {
  id: verifyPath,
  filename: verifyPath,
  loaded: true,
  exports: {
    async verifySignedTransaction() { return transaction; },
    async verifySignedNotification() { throw new Error("unexpected notification"); },
    isAppleStoreConfigured() { return true; },
  },
};
require.cache[ownershipPath] = {
  id: ownershipPath,
  filename: ownershipPath,
  loaded: true,
  exports: {
    async issueAppleCommerceAccountToken() { throw new Error("unexpected token issue"); },
    async assertAppleCommerceAccountTokenOwner() { ownerAssertionCount += 1; },
    async findAppleCommerceAccountTokenOwner() { return null; },
  },
};

delete require.cache[servicePath];
const { redeemAppleTransaction } = require(servicePath);

function appleTransaction(overrides = {}) {
  return {
    bundleId: "kr.matths.app",
    productId: "kr.matths.app.pro.monthly",
    transactionId: "applied-pro-transaction",
    originalTransactionId: "applied-pro-original",
    appAccountToken: "9a11c6bd-43cc-4f54-981f-758fcd5fbf33",
    environment: "Production",
    purchaseDate: "2026-10-10T00:00:00.000Z",
    expiresDate: "2026-11-10T00:00:00.000Z",
    currency: "KRW",
    price: 5500000,
    revocationDate: null,
    ...overrides,
  };
}

async function main() {
  transaction = appleTransaction();
  const replay = await redeemAppleTransaction({
    userId: userA,
    jws: "signed-existing-pro",
    productCode: "PRO_MONTHLY",
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.granted, true);
  assert.equal(grantCount, 0, "거래 재전송이 새 권한을 지급하면 안 됩니다.");

  await assert.rejects(
    redeemAppleTransaction({
      userId: userB,
      jws: "signed-existing-pro-other-owner",
      productCode: "PRO_MONTHLY",
    }),
    (error) => error.code === "APPLE_TRANSACTION_OWNER_CONFLICT"
  );

  transaction = appleTransaction({
    productId: "kr.matths.app.pass.29d",
    transactionId: "new-retired-transaction",
    originalTransactionId: "new-retired-original",
  });
  await assert.rejects(
    redeemAppleTransaction({
      userId: userA,
      jws: "signed-new-retired",
      productCode: "PRO_MONTHLY",
    }),
    (error) => error.code === "APPLE_PRODUCT_RETIRED"
  );
  assert.equal(grantCount, 0);

  transaction = appleTransaction({
    productId: "kr.matths.app.pro.monthly",
    transactionId: "new-pro-transaction",
    originalTransactionId: "new-pro-original",
  });
  const pro = await redeemAppleTransaction({
    userId: userA,
    jws: "signed-new-pro",
    productCode: "PRO_MONTHLY",
  });
  assert.equal(pro.duplicate, false);
  assert.equal(pro.granted, true);
  assert.equal(grantCount, 1);
  assert.equal(ownerAssertionCount, 1);

  console.log(
    "Apple active-product boundary verified: Pro replay finishes without regrant; unavailable products are rejected; configured Pro grants once."
  );
}

main().finally(() => {
  for (const modulePath of [
    servicePath,
    modelPath,
    matthsModelPath,
    accountPlanPath,
    verifyPath,
    ownershipPath,
  ]) {
    delete require.cache[modulePath];
  }
  if (previousProductId === undefined) delete process.env.APPLE_PRO_PRODUCT_ID;
  else process.env.APPLE_PRO_PRODUCT_ID = previousProductId;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
