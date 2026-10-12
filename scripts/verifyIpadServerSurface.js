"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  consumeAppCommerceHandoff,
  getAppStorefront,
  issueAppCommerceHandoff,
} = require("../services/appCommerceService");
const {
  buildDashboardActivity,
} = require("../services/dashboardActivityService");
const {
  canonicalProgressView,
} = require("../services/progressTypeIdService");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function verify() {
  const apiRoutes = read("routes/api-routes.js");
  for (const route of [
    "/commerce/storefront",
    "/commerce/handoffs",
    "/learning/progress",
    "/dashboard/activity",
    "/goat-arena",
    "/goat-arena/rulebook",
    "/goat-arena/matches",
  ]) {
    assert.ok(apiRoutes.includes(`"${route}"`), `missing iPad API route ${route}`);
  }
  assert.match(read("routes/matths-routes.js"), /\/app\/commerce\/:token/);
  const arenaController = read("controllers/goatArenaController.js");
  const arenaReadService = read("services/goatArenaV2ReadService.js");
  assert.match(arenaController, /getGoatArenaV2ReadModel\(req\.apiUser/);
  assert.match(arenaReadService, /schemaVersion:\s*"GOAT_ARENA_2_0"/);
  assert.doesNotMatch(arenaReadService, /payback|learningDayDeposit|tierSwap/);

  const progress = canonicalProgressView({
    topicCount: 4,
    completedTopicIndexes: [0, 1],
    masteryGate: {
      requiredDistinctTypes: 5,
      correctTypeIds: ["web-a", "a", "b"],
      userCompleted: false,
    },
  });
  assert.deepEqual(progress.correctTypeIds, ["a", "b"]);
  assert.equal(progress.completionPercent, 39);

  const activity = buildDashboardActivity([
    {
      _id: "2026-08-15",
      durationMs: 12 * 60 * 1000,
      solvedProblems: 4,
      correctProblems: 3,
    },
  ], { now: new Date("2026-08-15T12:00:00.000Z") });
  assert.equal(activity.stats.weeklyStudyMinutes, 12);
  assert.equal(activity.stats.weeklySolvedProblems, 4);
  assert.equal(activity.stats.correctRate, 75);
  assert.equal(activity.weeklyActivity.days.length, 7);

  const environment = {
    PAID_CHECKOUT_ENABLED: "true",
    PAYMENT_PROVIDER: "INICIS",
    INICIS_PAYMENTS_MODE: "TEST",
    INICIS_TEST_MID: "INIpayTest",
    INICIS_TEST_HASH_KEY: "h".repeat(32),
    INICIS_TEST_API_KEY: "a".repeat(32),
    INICIS_TEST_CLIENT_IP: "203.0.113.10",
    INICIS_TEST_REVIEW_EMAILS: "kginicis@test.com",
    PUBLIC_BASE_URL: "https://www.matths.kr",
  };
  const storefront = await getAppStorefront("student-1", {
    environment,
    userEmail: "kginicis@test.com",
    catalogLoader: async () => [{
      code: "PRO_MONTHLY",
      name: "Matths Pro",
      amount: 5500,
      periodLabel: "30일",
      description: "Matths Pro 월 플랜",
    }],
    accessLoader: async () => ({
      packageType: "FREE",
      plan: { code: "FREE" },
      active: true,
      arenaAllowed: false,
    }),
  });
  assert.equal(storefront.products.length, 1);
  assert.equal(storefront.products[0].code, "PRO_MONTHLY");
  assert.equal(storefront.products[0].amount, 5500);

  let stored = null;
  const model = {
    async create(value) {
      stored = { ...value, consumedAt: null };
      return stored;
    },
    findOneAndUpdate(query, update) {
      return {
        lean: async () => {
          if (!stored || stored.consumedAt || query.tokenHash !== stored.tokenHash) return null;
          stored = { ...stored, ...update.$set };
          return stored;
        },
      };
    },
  };
  const issued = await issueAppCommerceHandoff({
    userId: "student-1",
    productCode: "PRO_MONTHLY",
    mode: "self",
    model,
    environment,
    userEmail: "kginicis@test.com",
  });
  const token = new URL(issued.url).pathname.split("/").at(-1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(stored.tokenHash, token);
  assert.equal((await consumeAppCommerceHandoff(token, { model })).userId, "student-1");
  assert.equal(await consumeAppCommerceHandoff(token, { model }), null);

  console.log("iPad server data, Free/Pro commerce, and GOAT Arena 2.0 read surfaces verified");
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
