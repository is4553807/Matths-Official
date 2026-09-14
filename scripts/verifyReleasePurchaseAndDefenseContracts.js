"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { getAppStorefront } = require("../services/appCommerceService");
const {
  listParticipantMatches,
} = require("../services/goatArenaProductionMatchReadService");

async function verifyNativeCheckoutBoundary() {
  const storefront = await getAppStorefront(new mongoose.Types.ObjectId(), {
    catalogLoader: async () => [],
    accessLoader: async () => ({}),
    environment: {
      APPLE_BUNDLE_ID: "kr.matths.app",
      PAID_CHECKOUT_ENABLED: "false",
      PAYMENT_PROVIDER: "DISABLED",
    },
    userEmail: "student@example.com",
  });
  assert.equal(storefront.checkoutEnabled, true);
  assert.equal(storefront.appleCheckoutEnabled, true);
  assert.equal(storefront.webCheckoutEnabled, false);
}

async function verifyDefenseQueryBoundary() {
  const userId = new mongoose.Types.ObjectId();
  let observedQuery = null;
  let observedLimit = null;
  const MatchModel = {
    find(query) {
      observedQuery = query;
      return {
        sort() { return this; },
        limit(value) { observedLimit = value; return this; },
        async lean() { return []; },
      };
    },
  };
  const AttemptModel = { find() { throw new Error("empty match page must not load attempts"); } };
  const result = await listParticipantMatches({
    userId,
    role: "DEFENDER",
    actionable: "true",
    limit: "50",
  }, { MatchModel, AttemptModel });

  assert.deepEqual(observedQuery["defender.userId"], new mongoose.Types.ObjectId(userId));
  assert.equal(observedQuery.$or, undefined);
  assert.deepEqual(observedQuery.status.$in, [
    "REQUESTED", "MATCHED", "READY", "IN_PROGRESS", "SUBMITTED", "HELD",
  ]);
  assert.equal(observedLimit, 51);
  assert.deepEqual(result.matches, []);
  assert.equal(result.scope, "ACTIONABLE_DEFENSES");
  assert.equal(result.complete, true);
  assert.equal(result.nextCursor, null);

  await assert.rejects(
    () => listParticipantMatches({ userId, role: "OWNER", actionable: true }, { MatchModel, AttemptModel }),
    (error) => error.code === "INVALID_MATCH_ROLE" && error.statusCode === 400
  );
}

Promise.all([
  verifyNativeCheckoutBoundary(),
  verifyDefenseQueryBoundary(),
]).then(() => {
  console.log("Native Apple checkout and complete actionable-defense query contracts verified");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
