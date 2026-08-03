const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculateMainToSubReference,
  compareSimultaneousReentries,
} = require("../services/mainToSubConversionService");
const {
  compareAcceleratedInvitationRequests,
  buildMatchAnalysisQuestionReviews,
  cosmeticEffectEndsAt,
  insuredCancelledStatisticsPolicy,
  isDefenseConvenienceCooldownActive,
  matchAnalysisFailureAction,
  serverOperatorFaultCompensationPolicy,
  isSundayShopLocked,
  seasonBoundaries,
} = require("../services/arenaShopPolicyService");
const {
  _testing: seasonTesting,
  softResetMmr,
} = require("../services/arenaSeasonService");
const { SchedulerLease } = require("../models/operationModel");
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
const analysisQuestions = buildMatchAnalysisQuestionReviews({
  problemPack: {
    difficultyTier: "T5",
    questions: [
      {
        questionKey: "Q1",
        courseId: "algebra",
        typeId: "ALG-SEQUENCE-SUM",
        skillTags: ["수열"],
        prompt: "a₁=1인 등차수열의 합을 구하세요.",
        answer: "15",
        solution: "등차수열의 합 공식을 적용하면 15이다.",
      },
    ],
  },
  attempt: { answers: [{ questionKey: "Q1", value: "15" }] },
  score: {
    questionResults: [
      { questionKey: "Q1", correct: true, pointsAwarded: 20, responseTimeMs: 90000 },
    ],
  },
  referenceQuestions: [
    {
      difficultyTier: "T5",
      typeId: "ALG-SEQUENCE-SUM",
      sequence: 1,
      solutionProcess: [{ step: 1, explanation: "주어진 조건을 식으로 정리한다." }],
      finalCheck: "계산 결과를 원래 조건에 대입한다.",
    },
  ],
});
assert.equal(analysisQuestions.length, 1);
assert.equal(analysisQuestions[0].correctAnswer, "15");
assert.equal(analysisQuestions[0].solution, "등차수열의 합 공식을 적용하면 15이다.");
assert.equal(
  analysisQuestions[0].referenceSolutionProcess[0].explanation,
  "주어진 조건을 식으로 정리한다."
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
assert.equal(seasonTesting.SEASON_LEASE_MS, 30 * 60 * 1000);
assert.ok(
  SchedulerLease.schema.indexes().some(
    ([fields, options]) => fields.name === 1 && options.unique === true
  ),
  "연간 시즌 작업에는 다중 서버 단일 실행용 고유 lease가 필요합니다."
);
const seasonSource = fs.readFileSync(
  path.join(path.resolve(__dirname, ".."), "services/arenaSeasonService.js"),
  "utf8"
);
assert.ok(seasonSource.includes("ARENA_SEASON_OPEN:${seasonId}"));
assert.ok(seasonSource.includes("accessState.standingId?.seasonKey"));
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
assert.ok(goatRoutes.includes('"/goat-arena/main/shop/analyses/:effectId"'));

const goatController = fs.readFileSync(
  path.join(root, "controllers/goatArenaController.js"),
  "utf8"
);
assert.ok(goatController.includes('req.body.purchaseConfirmed !== "1"'));

const shopView = fs.readFileSync(
  path.join(root, "views/goat-arena-main-shop.ejs"),
  "utf8"
);
const shopAnalysisView = fs.readFileSync(
  path.join(root, "views/goat-arena-main-shop-analysis.ejs"),
  "utf8"
);
assert.ok(shopView.includes('name="purchaseConfirmed"'));
assert.ok(shopView.includes("가격·효과·사용 기간·반환 조건"));
assert.ok(shopAnalysisView.includes("경기 상세 분석"));
assert.ok(shopAnalysisView.includes("경기 분석권을 사용한 본인에게만"));
assert.ok(shopAnalysisView.includes("문항별 풀이과정"));
assert.ok(shopAnalysisView.includes("상대의 답안과 풀이 증거는 공개하지 않습니다."));

console.log("최신 Arena 전환·상점·관리자 권한 정책 검증 완료");
