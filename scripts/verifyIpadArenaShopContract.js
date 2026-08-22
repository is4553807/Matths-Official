const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
for (const route of [
  'router.get(\n  "/goat-arena/main/shop"',
  'router.post(\n  "/goat-arena/main/shop/purchases"',
  'router.get(\n  "/goat-arena/main/shop/analyses/:effectId"',
]) {
  assert.ok(routes.includes(route), `missing iPad shop route: ${route}`);
}

const controller = require("../controllers/ipadArenaShopController");
const adapter = require("../services/ipadArenaShopAdapter");

const input = controller._testing.purchaseInput({
  body: {
    itemCode: "MATCH_ANALYSIS",
    purchaseConfirmed: true,
    relatedMatchId: "match-1",
  },
  get(name) {
    return name === "Idempotency-Key" ? "shop:operation-1" : undefined;
  },
});
assert.deepEqual(input, {
  itemCode: "MATCH_ANALYSIS",
  purchaseId: "shop:operation-1",
  relatedMatchId: "match-1",
  relatedInvitationId: null,
});
assert.throws(
  () =>
    controller._testing.purchaseInput({
      body: { itemCode: "MATCH_ANALYSIS", purchaseConfirmed: true },
      get() {
        return "";
      },
    }),
  /Idempotency-Key/
);

const purchase = adapter._testing.purchaseDto({
  _id: "purchase-1",
  itemCode: "MATCH_ANALYSIS",
  itemDisplayName: "Arena 경기 분석권",
  policyVersionCode: "MAIN-SHOP-V1",
  priceDays: 1,
  beforeAvailableDays: 5,
  afterAvailableDays: 4,
  status: "COMPLETED",
  relatedMatchId: "match-1",
});
assert.deepEqual(Object.keys(purchase), [
  "id",
  "itemCode",
  "displayName",
  "policyVersionCode",
  "priceDays",
  "beforeAvailableDays",
  "afterAvailableDays",
  "status",
  "purchasedAt",
  "reversedAt",
  "reversalReason",
  "relatedMatchId",
  "relatedInvitationId",
]);
assert.equal(purchase.status, "APPLIED");

const effect = adapter._testing.effectDto({
  _id: "effect-1",
  itemCode: "MATCH_ANALYSIS",
  status: "APPLIED",
  metadata: { analysisState: "READY" },
});
assert.equal(effect.status, "ANALYSIS_READY");
assert.equal(effect.analysisState, "READY");
assert.equal(adapter._testing.demotionRisk(1), "FINAL_DAY");
assert.equal(adapter._testing.demotionRisk(2), "NORMAL");

console.log("iPad Arena shop routes, idempotency input, and DTO contract verified");
