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
const {
  buildGoatArenaReadModel,
  READ_MODEL_VERSION,
} = require("../services/goatArenaReadService");

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
  assert.equal(READ_MODEL_VERSION, "GOAT_ARENA_V1");
  const arena = buildGoatArenaReadModel({
    userId: "student-1",
    user: { name: "학생" },
    cycle: null,
    policy: null,
    season: null,
    arenaProfile: null,
    rankingProfile: null,
    activeMatch: null,
    now: new Date("2026-08-15T00:00:00.000Z"),
  });
  assert.equal(arena.readModelVersion, "GOAT_ARENA_V1");
  assert.equal(arena.state, "NO_ACTIVE_CYCLE");
  assert.equal(arena.identity.displayName, "학생");
  assert.equal(arena.activeMatch, null);

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
    PAYMENT_PROVIDER: "TOSS",
    TOSS_PAYMENTS_MODE: "TEST",
    TOSS_TEST_CLIENT_KEY: "test_gck_contract",
    TOSS_TEST_SECRET_KEY: "test_gsk_contract",
    PUBLIC_BASE_URL: "https://www.matths.kr",
  };
  const storefront = await getAppStorefront("student-1", {
    environment,
    catalogLoader: async () => [{
      code: "LEARNING_PACKAGE_29",
      name: "학습 이용권",
      amount: 29000,
      periodLabel: "29일",
      description: "학습 패키지",
    }],
    accessLoader: async () => ({
      packageType: null,
      learningPackage: { active: false },
      mockExamOnlyPackage: { active: false },
      arenaAllowed: false,
    }),
  });
  assert.equal(storefront.products.length, 1);
  assert.equal(storefront.products[0].amount, 29000);

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
    productCode: "LEARNING_PACKAGE_29",
    mode: "self",
    model,
    environment,
  });
  const token = new URL(issued.url).pathname.split("/").at(-1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(stored.tokenHash, token);
  assert.equal((await consumeAppCommerceHandoff(token, { model })).userId, "student-1");
  assert.equal(await consumeAppCommerceHandoff(token, { model }), null);

  // 검증 스크립트가 읽기 어댑터 추가를 이유로 Arena 정책/가격을 재정의하지 못하게 한다.
  const changedPolicyFiles = [
    "services/arenaShopPolicyService.js",
    "services/arenaMatchSettlementService.js",
    "services/arenaDivisionRuleService.js",
    "services/arenaPolicyService.js",
  ].filter((file) => {
    const { status } = require("node:child_process").spawnSync(
      "git", ["diff", "--quiet", "HEAD", "--", file], { cwd: root }
    );
    return status !== 0;
  });
  assert.deepEqual(changedPolicyFiles, [], "iPad adapter must not change Arena rules or prices");

  console.log("iPad server data, commerce, and GOAT Arena read surfaces verified");
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
