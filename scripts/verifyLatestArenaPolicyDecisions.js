const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculateMainToSubReference,
  compareSimultaneousReentries,
} = require("../services/mainToSubConversionService");
const {
  compareAcceleratedInvitationRequests,
  cosmeticEffectEndsAt,
  insuredCancelledStatisticsPolicy,
  isDefenseConvenienceCooldownActive,
  matchAnalysisFailureAction,
  serverOperatorFaultCompensationPolicy,
  isSundayShopLocked,
  seasonBoundaries,
} = require("../services/arenaShopPolicyService");
const {
  softResetMmr,
} = require("../services/arenaSeasonService");
const {
  calculateFinalRating,
} = require("../services/finalRankingService");
const {
  arenaTierGuide,
} = require("../services/arenaTierPolicy");

const midpoint = calculateMainToSubReference({
  mainPosition: 51,
  mainParticipantCount: 101,
  currentSubParticipantCount: 1000,
});
assert.equal(midpoint.mainPercentile, 0.5);
assert.equal(midpoint.referenceSubPercentile, 0.79);
assert.equal(midpoint.referenceSubRank, "EMERALD");
assert.equal(midpoint.referenceSubGp, 60);
assert.equal(midpoint.referenceSubOverallPosition, 210);

const first = calculateMainToSubReference({
  mainPosition: 1,
  mainParticipantCount: 1,
  currentSubParticipantCount: 1000,
});
assert.equal(first.referenceSubRank, "CHALLENGER");
assert.equal(first.referenceSubGp, 99);
assert.equal(first.referenceSubOverallPosition, 1);

assert.ok(
  compareSimultaneousReentries(
    {
      referenceSubPercentile: 0.9,
      mainGpSnapshot: 50,
      mainPositionSnapshot: 3,
      mainPositionReachedAt: "2026-08-01T00:00:00Z",
      paymentApprovedAt: "2026-08-02T00:00:00Z",
      userId: "b",
    },
    {
      referenceSubPercentile: 0.8,
      mainGpSnapshot: 99,
      mainPositionSnapshot: 1,
      mainPositionReachedAt: "2026-07-01T00:00:00Z",
      paymentApprovedAt: "2026-07-02T00:00:00Z",
      userId: "a",
    }
  ) < 0
);

assert.ok(
  compareAcceleratedInvitationRequests(
    { acceleratedAt: "2026-08-02T01:00:00Z", createdAt: "2026-08-02T00:00:00Z", _id: "b" },
    { acceleratedAt: null, createdAt: "2026-08-01T00:00:00Z", _id: "a" }
  ) < 0
);
assert.equal(
  matchAnalysisFailureAction({ elapsedMs: 5 * 60 * 1000, retryCount: 1 }),
  "RETRY"
);
assert.equal(
  matchAnalysisFailureAction({ elapsedMs: 5 * 60 * 1000, retryCount: 2 }),
  "RETRY"
);
assert.equal(
  matchAnalysisFailureAction({ elapsedMs: 5 * 60 * 1000, retryCount: 3 }),
  "AUTO_REFUND"
);
assert.equal(
  isDefenseConvenienceCooldownActive({
    lastDefenseRestUsedAt: "2026-08-01T00:00:00Z",
    now: "2026-08-02T00:00:00Z",
  }),
  true
);
assert.equal(
  cosmeticEffectEndsAt({
    purchasedAt: "2026-08-25T00:00:00Z",
    currentSeasonEndsAt: "2026-08-31T00:00:00Z",
    nextSeasonEndsAt: "2026-09-30T00:00:00Z",
  }).toISOString(),
  "2026-09-30T00:00:00.000Z"
);
assert.deepEqual(insuredCancelledStatisticsPolicy(), {
  officialWinLossIncluded: false,
  officialMatchPerformanceIncluded: false,
  finalRankingMatchPerformanceIncluded: false,
  repeatOpponentExclusionIncluded: true,
  abuseDetectionIncluded: true,
});
assert.deepEqual(serverOperatorFaultCompensationPolicy(), {
  automaticGrant: false,
  grantMode: "ADMIN_ADJUSTMENT",
  requiresOperatorReview: true,
  requiresAuditLog: true,
  userFacingReasonRequired: true,
});
assert.equal(isSundayShopLocked(new Date("2026-08-02T15:00:00+09:00")), true);
assert.equal(isSundayShopLocked(new Date("2026-08-03T00:00:00+09:00")), false);
assert.equal(seasonBoundaries(new Date("2026-08-02T00:00:00+09:00")).currentSeasonEndsAt.toISOString(), "2026-12-31T14:59:59.999Z");
assert.equal(softResetMmr(2000), 1800);
assert.equal(
  calculateFinalRating({
    division: "SUB",
    skillMmr: 1500,
    weeklyMockBonus: 30,
    seasonSubStartPercentile: 0.5,
    seasonSubCurrentPercentile: 0.75,
  }),
  1572.5
);
assert.deepEqual(
  Object.fromEntries(arenaTierGuide().map((tier) => [tier.english, tier.estimatedPercentLabel])),
  {
    BRONZE: "상위 80~100%",
    SILVER: "상위 60~80%",
    GOLD: "상위 42~60%",
    PLATINUM: "상위 27~42%",
    EMERALD: "상위 17~27%",
    DIAMOND: "상위 9~17%",
    MASTER: "상위 4~9%",
    GRANDMASTER: "상위 1~4%",
    CHALLENGER: "상위 1%",
  }
);

const root = path.resolve(__dirname, "..");
const adminView = fs.readFileSync(
  path.join(root, "views/admin-user-detail.ejs"),
  "utf8"
);
assert.ok(adminView.includes('name="packageType"'));
assert.ok(adminView.includes("보유 휘장"));
assert.ok(adminView.includes("29일 학습권 패키지"));

const routes = fs.readFileSync(
  path.join(root, "routes/matths-routes.js"),
  "utf8"
);
assert.ok(routes.includes('"/admin/users/:userId/package-access"'));
assert.ok(routes.includes('"/admin/arena-policies/main-shop"'));

const goatRoutes = fs.readFileSync(
  path.join(root, "routes/goat-arena-routes.js"),
  "utf8"
);
assert.ok(goatRoutes.includes('"/goat-arena/main/shop"'));
assert.ok(goatRoutes.includes('"/goat-arena/main/shop/purchases"'));

console.log("최신 Arena 전환·상점·관리자 권한 정책 검증 완료");
