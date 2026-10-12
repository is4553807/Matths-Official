"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "routes/api-routes.js"), "utf8");
const source = fs.readFileSync(
  path.join(root, "controllers/ipadAdminArenaPolicyController.js"),
  "utf8"
);
const calls = [];

function install(filename, value) {
  const resolved = require.resolve(filename);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: value };
}

const overview = {
  config: {
    plans: [
      { code: "FREE", priceAmount: 0 },
      { code: "PRO", priceAmount: 5500 },
    ],
    normal: { historicalMatchmaking: true, questionRepeatWindowMatches: 10 },
    competitive: { enabled: false, currentChallengerOnlyRatingUpdate: true },
  },
  placementReviewQueue: [],
};
install("../services/adminArenaV2Service", {
  getAdminArenaV2Overview: async () => overview,
  reviewNormalRecordIntegrity: async (value) => {
    calls.push(["normalRecordReview", value]);
    return { recordId: value.recordId, status: "AVAILABLE", userPenaltyApplied: false, emailSent: false };
  },
});
install("../services/arenaMatchmakingControlService", {
  setMatchmakingPaused: async (value) => calls.push(["matchmaking", value]),
});
install("../services/arenaPlacementPolicyService", {
  resetExhaustedArenaPlacements: async (value) => {
    calls.push(["placementReset", value]);
    return { reset: true, preservedAttempts: 5 };
  },
});

for (const value of [
  '"/admin/arena-policies"',
  '"/admin/arena-policies/matchmaking"',
  '"/admin/arena-users/:userId/placement/reset"',
  '"/admin/arena-records/:recordId/integrity-review"',
]) {
  assert(routes.includes(value), `missing ${value}`);
}
for (const retired of [
  '"/admin/arena-policies/learning-package"',
  '"/admin/arena-policies/shop"',
  '"/admin/arena-policies/unranked"',
  '"/admin/arena-policies/ranked"',
]) {
  assert(!routes.includes(retired), `retired route remains ${retired}`);
}
assert(source.includes("req.apiUser"));
assert(!source.includes("req.session"));

const controller = require("../controllers/ipadAdminArenaPolicyController");

async function invoke(handler, { role = "admin", params = {}, body = {} } = {}) {
  let payload;
  let error;
  const headers = new Map();
  const req = {
    apiUser: { _id: "507f1f77bcf86cd799439011", role },
    params,
    body,
  };
  const res = {
    set(key, value) { headers.set(key, value); return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, headers };
}

(async () => {
  assert.equal((await invoke(controller.dashboard, { role: "student" })).error?.status, 403);
  const dashboard = await invoke(controller.dashboard);
  assert.equal(dashboard.payload.schemaVersion, "ADMIN_ARENA_POLICY_NATIVE_V2");
  assert.deepEqual(
    dashboard.payload.dashboard.config.plans.map((plan) => [plan.code, plan.priceAmount]),
    [["FREE", 0], ["PRO", 5500]]
  );
  await invoke(controller.matchmaking, { body: { action: "PAUSE", reason: "ops" } });
  const reset = await invoke(controller.placementReset, {
    params: { userId: "507f1f77bcf86cd799439012" },
    body: { requestId: "reset-1", reason: "server logs reviewed" },
  });
  assert.equal(reset.payload.placementReset.reset, true);
  const recordReview = await invoke(controller.normalRecordReview, {
    params: { recordId: "507f1f77bcf86cd799439013" },
    body: { decision: "APPROVE", note: "source verified" },
  });
  assert.equal(recordReview.payload.normalRecordReview.status, "AVAILABLE");
  assert.deepEqual(calls.map(([name]) => name), ["matchmaking", "placementReset", "normalRecordReview"]);
  console.log("iPad native admin Arena V2 policy HTTP contract passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
