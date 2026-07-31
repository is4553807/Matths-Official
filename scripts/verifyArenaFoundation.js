const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  FIRST_MONTH_ASSUMPTIONS,
  FIRST_MONTH_METRICS,
} = require("../dataAnalysis/metricCatalog");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaMatch,
  SubscriptionPolicyVersion,
  ArenaStanding,
  LiveFinalRankingProfile,
  MainToSubConversionPolicy,
  RenewalRankAssessment,
} = require("../models/goatArenaModel");
const {
  CommunityPost,
  User,
} = require("../models/matthsModel");
const {
  hasMaterialRenewalChange,
  policySnapshot,
} = require("../services/arenaPolicyService");
const {
  buildIdentityMatchHash,
  normalizeBirthDate,
} = require("../services/identityRiskService");
const {
  stableDimensions,
} = require("../services/dataAnalysisService");
const {
  TtlCache,
} = require("../services/ttlCacheService");
const {
  _testing: {
    assertCommunityBoardAccess,
  },
} = require("../services/communityService");
const {
  buildAccessCycleDraft,
  buildRenewalPolicyNotice,
  computeAccessCycleWindow,
} = require("../services/accessCycleService");
const {
  officialArenaEligibility,
  packagePurchaseEligibility,
} = require("../services/arenaEligibilityService");
const {
  _testing: {
    promotedEducationState,
  },
} = require("../services/userLifecycleService");
const {
  _testing: {
    buildArenaAccess,
    buildSeedState,
  },
} = require("../controllers/goatArenaController");

process.env.IDENTITY_MATCH_SECRET =
  "arena-foundation-verification-secret";

async function main() {

const birthDate = normalizeBirthDate(
  "2008-02-29"
).birthDate;
assert.equal(
  birthDate.toISOString().slice(0, 10),
  "2008-02-29"
);
assert.throws(
  () => normalizeBirthDate("2007-02-29"),
  /생년월일/
);
assert.equal(
  buildIdentityMatchHash({
    realName: "홍 길동",
    birthDate,
    schoolCode: "SCHOOL-001",
  }),
  buildIdentityMatchHash({
    realName: "홍길동",
    birthDate: "2008-02-29",
    schoolCode: "school-001",
  })
);
assert.notEqual(
  buildIdentityMatchHash({
    realName: "홍길동",
    birthDate,
    schoolCode: "SCHOOL-001",
  }),
  buildIdentityMatchHash({
    realName: "홍길동",
    birthDate: "2008-03-01",
    schoolCode: "SCHOOL-001",
  })
);
assert.notEqual(
  buildIdentityMatchHash({
    realName: "홍길동",
    birthDate,
    schoolCode: "SCHOOL-001",
  }),
  buildIdentityMatchHash({
    realName: "홍길동",
    birthDate,
    schoolCode: "SCHOOL-002",
  })
);
assert.throws(
  () =>
    buildIdentityMatchHash({
      realName: "홍길동",
      birthDate,
      schoolCode: "",
    }),
  /고등학교/
);

const retaker = new User({
  realName: "김학생",
  name: "재도전자",
  nameNormalized: "재도전자",
  email: "retaker@example.com",
  passwordHash: "hashed",
  schoolGrade: 13,
  educationStatus: "graduated",
});
await assert.doesNotReject(
  () => retaker.validate(),
  "N수생 계정은 학교 없이도 스키마 검증을 통과해야 합니다."
);

const retakerPost = new CommunityPost({
  authorId: new mongoose.Types.ObjectId(),
  authorName: "재도전자",
  boardType: "retaker",
  title: "학습 계획 공유",
  content: "이번 주 학습 계획을 공유합니다.",
});
await assert.doesNotReject(
  () => retakerPost.validate()
);
assert.doesNotThrow(() =>
  assertCommunityBoardAccess(
    { boardType: "retaker" },
    { schoolGrade: 13, role: "student" }
  )
);
assert.throws(
  () =>
    assertCommunityBoardAccess(
      { boardType: "retaker" },
      { schoolGrade: 12, role: "student" }
    ),
  /N수생 게시판/
);
assert.throws(
  () =>
    assertCommunityBoardAccess(
      {
        boardType: "school",
        schoolCode: "S1",
      },
      {
        schoolGrade: 13,
        role: "student",
        school: { code: "S1" },
      }
    ),
  /N수생 계정/
);
assert.deepEqual(
  promotedEducationState({
    schoolGrade: 12,
    baseAcademicYear: 2025,
    currentAcademicYear: 2026,
  }),
  {
    schoolGrade: 13,
    educationStatus: "graduated",
    promotions: 1,
  }
);

const policy = new SubscriptionPolicyVersion({
  code: "LAUNCH-TEST",
  status: "DRAFT",
  effectiveFrom: new Date(
    "2026-08-01T00:00:00+09:00"
  ),
  priceAmount: 0,
});
await assert.doesNotReject(
  () => policy.validate()
);
const snapshot = policySnapshot(policy);
assert.equal(snapshot.initialLearningDays, 29);
assert.equal(snapshot.initialPaybackScoreDays, 29);
assert.equal(snapshot.payback.bands[1].ratePercent, 50);
assert.equal(
  computeAccessCycleWindow({
    purchasedAt:
      "2026-08-01T19:59:59+09:00",
    policy,
  }).firstConsumptionDateKst,
  "2026-08-01"
);
assert.equal(
  computeAccessCycleWindow({
    purchasedAt:
      "2026-08-01T20:00:00+09:00",
    policy,
  }).firstConsumptionDateKst,
  "2026-08-02"
);

const changedPolicy = {
  ...snapshot,
  code: "MONTH-2",
  priceAmount: 9900,
};
assert.equal(
  hasMaterialRenewalChange(
    snapshot,
    changedPolicy
  ),
  true
);
assert.equal(
  buildRenewalPolicyNotice({
    previousCycle: {
      status: "EXPIRED",
      policyVersionCode:
        snapshot.code,
      policySnapshot: snapshot,
      cashbackQualified: false,
    },
    nextPolicy: changedPolicy,
  }).required,
  true
);

const userId = new mongoose.Types.ObjectId();
const policyId = new mongoose.Types.ObjectId();
const cycle = new AccessCycle({
  userId,
  division: "SUB",
  status: "ACTIVE",
  policyVersionId: policyId,
  policyVersionCode: "LAUNCH-TEST",
  policySnapshot: snapshot,
  pricePaid: 0,
  paidAt: new Date(),
  startsAt: new Date(),
  baseExpiresAt: new Date(
    Date.now() + 29 * 86400000
  ),
  expiresAt: new Date(
    Date.now() + 29 * 86400000
  ),
  evaluationAt: new Date(
    Date.now() + 30 * 86400000
  ),
  firstConsumptionDateKst:
    "2026-08-02",
  firstDayMode: "NEXT_DAY",
});
await assert.doesNotReject(
  () => cycle.validate()
);
const cycleDraft = buildAccessCycleDraft({
  userId,
  policy,
  purchasedAt:
    "2026-08-01T20:00:00+09:00",
  purchaseReference: "test-order-1",
});
assert.equal(
  cycleDraft.firstConsumptionDateKst,
  "2026-08-02"
);
assert.equal(
  cycleDraft.availableLearningDays,
  29
);

const standing = new ArenaStanding({
  userId,
  division: "SUB",
  seasonKey: "2026-W31",
  arenaRank: "브론즈",
  arenaPosition: 1,
  arenaGp: 800,
});
await assert.doesNotReject(
  () => standing.validate()
);

const accessState = new ArenaAccessState({
  userId,
  currentCompetitiveDivision: "SUB",
  state: "PAID_ACTIVE",
  currentSeasonPlacementCompleted: true,
  accessCycleId: cycle._id,
  standingId: standing._id,
  defensePoolEligible: true,
  weeklyMockEligible: true,
  finalRankingActive: true,
});
await assert.doesNotReject(
  () => accessState.validate()
);
assert.equal(
  packagePurchaseEligibility({
    availableLearningDays: 1,
    lockedLearningDays: 0,
    hasPendingSettlement: false,
  }).eligible,
  false
);
assert.equal(
  packagePurchaseEligibility({
    availableLearningDays: 0,
    lockedLearningDays: 0,
    hasPendingSettlement: false,
  }).eligible,
  true
);
assert.equal(
  officialArenaEligibility({
    accountStatus: "active",
    accessState: "PAID_ACTIVE",
    availableLearningDays: 1,
    currentSeasonPlacementCompleted: true,
    sundayDivisionLock: false,
  }).eligible,
  true
);
assert.equal(
  buildArenaAccess(
    {
      accountStatus: "active",
      role: "student",
    },
    {
      accessState: {
        state: "PAID_ACTIVE",
        currentCompetitiveDivision: "SUB",
        currentSeasonPlacementCompleted: false,
      },
      accessCycle: {
        availableLearningDays: 10,
      },
    }
  ).canUseSub,
  false,
  "시즌 배치 미완료 사용자는 Division 기능을 사용할 수 없어야 합니다."
);
assert.equal(
  buildArenaAccess(
    {
      accountStatus: "active",
      role: "student",
    },
    {
      accessState: {
        state: "PAID_ACTIVE",
        currentCompetitiveDivision: "SUB",
        currentSeasonPlacementCompleted: true,
      },
      accessCycle: {
        availableLearningDays: 10,
      },
    }
  ).canUseSub,
  true
);
assert.equal(
  buildSeedState(
    {
      status: "submitted",
      result: { initialMmr: 1200 },
    },
    {
      tier: "다이아몬드",
      division: "SUB",
      rating: 1200,
      gp: null,
    }
  ).code,
  "PROFILE_PENDING",
  "내부 실력 지표의 티어를 Arena 상태로 표시하면 안 됩니다."
);
assert.equal(
  buildSeedState(
    {
      status: "submitted",
      result: { initialMmr: 1200 },
    },
    {
      arenaRank: "골드",
      arenaDivision: "SUB",
      arenaPosition: 4,
      tierRank: 4,
      gp: 1010,
    }
  ).code,
  "READY"
);

assert.ok(ArenaMatch.modelName);
assert.ok(LiveFinalRankingProfile.modelName);
assert.ok(MainToSubConversionPolicy.modelName);
assert.ok(RenewalRankAssessment.modelName);

assert.ok(
  FIRST_MONTH_METRICS.length >= 20,
  "첫 달 필수 지표 카탈로그가 누락되었습니다."
);
assert.ok(
  FIRST_MONTH_ASSUMPTIONS.length >= 10,
  "출시 전 시뮬레이션 가정이 누락되었습니다."
);
assert.deepEqual(
  stableDimensions({ tier: "골드", division: "SUB" }),
  stableDimensions({ division: "SUB", tier: "골드" })
);

const cache = new TtlCache();
cache.set("ranking:sub", { count: 20 }, 1000);
assert.equal(cache.get("ranking:sub").count, 20);
cache.deleteByPrefix("ranking:");
assert.equal(cache.get("ranking:sub"), undefined);

console.log(
  "Arena foundation verification passed"
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
