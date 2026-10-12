const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const {
  _testing: { buildPricingProductAccess },
} = require("../services/checkoutService");

const views = path.resolve(__dirname, "..", "views");
const products = [
  {
    code: "PRO_MONTHLY",
    name: "Matths Pro",
    amount: 5500,
    periodLabel: "30일",
    description: "검증용 Pro 플랜",
    refundPolicy: {
      fullRefund: "검증용 전액 환불 기준",
      partialRefund: "검증용 부분 환불 기준",
      formula: "검증용 환불 산식",
    },
  },
];
const user = {
  id: "507f1f77bcf86cd799439011",
  name: "pricing-audit-user",
  role: "student",
};

function state({ code = "FREE", active = false } = {}) {
  return buildPricingProductAccess({ planAccess: { code, active } });
}

async function renderPricing(productAccess) {
  return ejs.renderFile(path.join(views, "pricing.ejs"), {
    user,
    activePage: "pricing",
    products,
    productAccess,
    checkoutEnabled: true,
  });
}

async function renderParentPricing(productAccess) {
  return ejs.renderFile(path.join(views, "parent-pricing.ejs"), {
    parent: { id: "parent", username: "parent-audit" },
    child: { _id: user.id, name: "pricing-audit-child" },
    familyChildren: [],
    selectedChildId: user.id,
    products,
    productAccess,
    checkoutEnabled: true,
  });
}

async function main() {
  const free = state();
  const pro = state({ code: "PRO", active: true });
  const admin = state({ code: "SUPER_ADMIN", active: true });

  assert.equal(free.PRO_MONTHLY.purchaseAllowed, true);
  assert.equal(pro.PRO_MONTHLY.purchaseAllowed, false);
  assert.equal(pro.PRO_MONTHLY.active, true);
  assert.equal(admin.PRO_MONTHLY.purchaseAllowed, false);

  const freeHtml = await renderPricing(free);
  assert.match(freeHtml, /\/pricing\/pro\/self/);
  assert.match(freeHtml, /\/pricing\/pro\/parent-request/);
  assert.match(freeHtml, /5,500/);
  assert.doesNotMatch(freeHtml, /mock-exam-only|learning-package/);

  const proHtml = await renderPricing(pro);
  assert.doesNotMatch(proHtml, /\/pricing\/pro\/(?:self|parent-request)/);
  assert.match(proHtml, /Pro 플랜 이용 중/);
  assert.match(proHtml, /Pro 계속 이용하기/);

  const parentFreeHtml = await renderParentPricing(free);
  assert.match(parentFreeHtml, /\/parent\/checkout\/PRO_MONTHLY/);
  const parentProHtml = await renderParentPricing(pro);
  assert.doesNotMatch(parentProHtml, /\/parent\/checkout\//);
  assert.match(parentProHtml, /현재 이용 중인 상품입니다/);

  console.log("Pricing entitlement CTA verification passed: FREE, PRO, administrator and parent states.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
