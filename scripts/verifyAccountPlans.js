"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const { User } = require("../models/matthsModel");
const { ArenaPackagePayment } = require("../models/goatArenaModel");
const { CheckoutIntent, ParentInvite } = require("../models/parentModel");
const { RefundRequest } = require("../models/refundModel");
const {
  accountPlanView,
  getAccountPlanConfig,
} = require("../services/accountPlanService");
const {
  _testing: { buildPricingProductAccess },
  getProductCatalog,
} = require("../services/checkoutService");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

async function main() {
  const config = getAccountPlanConfig({});
  assert.equal(config.proPriceAmount, 5500);
  assert.equal(config.proBillingPeriodDays, 30);
  assert.ok(User.schema.path("accountPlan.code"));
  assert.deepEqual(User.schema.path("accountPlan.code").enumValues, ["FREE", "PRO"]);
  assert.ok(User.schema.indexes().some(([fields]) => fields["accountPlan.code"] === 1));
  for (const model of [ArenaPackagePayment, CheckoutIntent, ParentInvite, RefundRequest]) {
    assert.deepEqual(model.schema.path("productCode").enumValues, ["PRO_MONTHLY"]);
  }
  assert.ok(ArenaPackagePayment.schema.path("accountPlanStartsAt"));
  assert.ok(ArenaPackagePayment.schema.path("accountPlanEndsAt"));

  const now = new Date("2026-10-09T03:00:00.000Z");
  assert.equal(accountPlanView({ role: "student" }, { now }).code, "FREE");
  assert.equal(accountPlanView({ role: "admin" }, { now }).code, "SUPER_ADMIN");
  assert.equal(
    accountPlanView(
      {
        role: "student",
        accountPlan: {
          code: "PRO",
          status: "ACTIVE",
          priceAmount: 5500,
          startsAt: new Date("2026-10-01T00:00:00.000Z"),
          endsAt: new Date("2026-11-01T00:00:00.000Z"),
        },
      },
      { now }
    ).code,
    "PRO"
  );
  assert.equal(
    accountPlanView(
      {
        role: "student",
        accountPlan: {
          code: "PRO",
          status: "ACTIVE",
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          endsAt: now,
        },
      },
      { now }
    ).code,
    "FREE",
    "Pro 종료 시각은 배타적이어야 합니다."
  );

  const catalog = await getProductCatalog();
  assert.deepEqual(catalog.map((product) => product.code), ["PRO_MONTHLY"]);
  assert.equal(catalog[0].amount, 5500);
  assert.equal(catalog[0].periodLabel, "30일");
  assert.deepEqual(Object.keys(buildPricingProductAccess({ planAccess: { code: "FREE" } })), ["PRO_MONTHLY"]);
  assert.equal(buildPricingProductAccess({ planAccess: { code: "PRO", active: true } }).PRO_MONTHLY.purchaseAllowed, false);

  const pricingSource = read("views/pricing.ejs");
  assert.match(pricingSource, /무료 플랜/);
  assert.match(pricingSource, /Pro 플랜/);
  assert.match(pricingSource, /pricing\/pro\/self/);
  assert.doesNotMatch(pricingSource, /29일 학습권|모의고사 이용권|페이백/);
  const pricingHtml = await ejs.renderFile(path.join(root, "views/pricing.ejs"), {
    user: null,
    products: catalog,
    productAccess: null,
    checkoutEnabled: false,
    assetVersion: "verify",
  });
  assert.match(pricingHtml, /5,500/);

  const dashboard = read("views/main.ejs");
  assert.match(dashboard, /Pro 플랜 알아보기/);
  assert.doesNotMatch(dashboard, /남은 학습일|Arena 예치|예약됨/);
  const adminDetail = read("views/admin-user-detail.ejs");
  assert.match(adminDetail, /name="planCode"/);
  assert.match(adminDetail, /value="FREE"/);
  assert.match(adminDetail, /value="PRO"/);
  assert.doesNotMatch(adminDetail, /value="MOCK_EXAM_ONLY"|value="LEARNING_PACKAGE"/);

  const migration = read("scripts/migrateUsersToFreePlan.js");
  assert.match(migration, /role: \{ \$ne: "admin" \}/);
  assert.match(migration, /MIGRATE_ALL_NON_ADMIN_USERS_TO_FREE_V1/);
  assert.match(migration, /financialRecordsPreserved: true/);
  assert.match(migration, /adminPreserved: true/);

  console.log("Account plans verified: FREE/PRO schema, 5,500 won catalog, dashboard/admin surfaces, and guarded initialization.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
