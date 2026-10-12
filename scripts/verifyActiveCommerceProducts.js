"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const { ArenaPackagePayment } = require("../models/goatArenaModel");
const {
  getAccountPlanConfig,
} = require("../services/accountPlanService");
const {
  getProduct,
  getProductCatalog,
} = require("../services/checkoutService");
const {
  productDestination,
} = require("../services/appCommerceService");
const {
  PRODUCT_RULES,
} = require("../services/refundPolicyService");

function loadAppleCommerce(proProductId) {
  const modulePath = require.resolve("../services/appleCommerceService");
  delete require.cache[modulePath];
  process.env.APPLE_PRO_PRODUCT_ID = proProductId;
  return require(modulePath);
}

async function main() {
  assert.deepEqual(getAccountPlanConfig({}), {
    proPriceAmount: 5500,
    proBillingPeriodDays: 30,
    currency: "KRW",
  });
  assert.deepEqual(
    getAccountPlanConfig({
      MATTHS_PRO_PRICE_KRW: "6600",
      MATTHS_PRO_BILLING_PERIOD_DAYS: "31",
    }),
    { proPriceAmount: 6600, proBillingPeriodDays: 31, currency: "KRW" }
  );

  const catalog = await getProductCatalog();
  assert.deepEqual(catalog.map((product) => product.code), ["PRO_MONTHLY"]);
  assert.equal((await getProduct("PRO_MONTHLY")).code, "PRO_MONTHLY");
  assert.equal(productDestination("PRO_MONTHLY", "self"), "/pricing/pro/self");

  const originalAppleProductId = process.env.APPLE_PRO_PRODUCT_ID;
  try {
    const proProductId = "kr.matths.app.pro.monthly";
    const apple = loadAppleCommerce(proProductId);
    assert.deepEqual(apple._testing.PRODUCT_BY_APPLE_ID, {
      [proProductId]: "PRO_MONTHLY",
    });
    assert.equal(
      apple._testing.resolveProduct(
        { productId: proProductId, transactionId: "active-pro" },
        "PRO_MONTHLY"
      ),
      "PRO_MONTHLY"
    );
    for (const retiredProductId of apple._testing.RETIRED_APPLE_PRODUCT_IDS) {
      assert.throws(
        () => apple._testing.resolveProduct(
          { productId: retiredProductId, transactionId: "retired" },
          null
        ),
        (error) => error.code === "APPLE_PRODUCT_RETIRED"
      );
    }

    const misconfigured = loadAppleCommerce("kr.matths.app.pass.29d");
    assert.equal(misconfigured._testing.configuredProProductIsActive, false);
    assert.deepEqual(misconfigured._testing.PRODUCT_BY_APPLE_ID, {});
  } finally {
    const modulePath = require.resolve("../services/appleCommerceService");
    delete require.cache[modulePath];
    if (originalAppleProductId === undefined) delete process.env.APPLE_PRO_PRODUCT_ID;
    else process.env.APPLE_PRO_PRODUCT_ID = originalAppleProductId;
  }

  assert.equal(ArenaPackagePayment.schema.path("productCode").defaultValue, "PRO_MONTHLY");
  assert.equal(ArenaPackagePayment.schema.path("productName").defaultValue, "Matths Pro");
  assert.deepEqual(
    ArenaPackagePayment.schema.path("productCode").enumValues,
    ["PRO_MONTHLY"]
  );
  assert.deepEqual(Object.keys(PRODUCT_RULES), ["PRO_MONTHLY"]);

  const server = read("server.js");
  const appleSource = read("services/appleCommerceService.js");
  assert.doesNotMatch(server, /ensureDefaultMockExamPackagePolicy/);
  assert.doesNotMatch(appleSource, /applyApprovedPackagePayment|applyApprovedMockExamPayment/);
  assert.match(read(".env.example"), /^APPLE_PRO_PRODUCT_ID=$/m);
  assert.match(read(".env.example"), /^APPLE_ALLOW_SANDBOX=false$/m);
  assert.match(read(".env.example"), /^MATTHS_PRO_PRICE_KRW=5500$/m);
  assert.match(
    read(".cloudtype/app.yaml"),
    /name:\s+APPLE_ALLOW_SANDBOX[\s\S]*?value:\s+"false"/
  );

  console.log(
    "Active commerce verified: configured 5,500 won Pro is the only purchasable, stored, and refundable product."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
