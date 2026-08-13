const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  AssessmentAttempt,
  RankingProfile,
  User,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaStanding,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const {
  ParentAccount,
  ParentChildLink,
} = require("../models/parentModel");
const {
  withdrawUserAccount,
} = require("../services/accountDeletionService");
const {
  ADMIN_PACKAGE_TYPES,
  updateAdminPackageAccess,
} = require("../services/adminPackageAccessService");
const { findUniversity } = require("../services/universityService");
const { kstSeasonKey } = require("../services/arenaStandingService");
const {
  saveConfirmedPaybackAccount,
} = require("../services/paybackAccountService");

const BATCH_KEY = "GOAT-ARENA-FOCUSED-LAUNCH-E2E-20260807";
const TEST_PASSWORD = String(process.env.TEST_ACCOUNT_PASSWORD || "");
const OUTPUT_PATH = path.resolve(
  __dirname,
  "..",
  "outputs",
  "launch-focused-test-accounts.json"
);
const DAY_MS = 86_400_000;

const SCHOOL = {
  region: "서울특별시",
  code: "FOCUSED-LAUNCH-HS-01",
  name: "맵쓰테스트고등학교",
  roadAddress: "테스트 전용",
  establishment: "테스트",
  highSchoolType: "일반고",
};
const UNIVERSITY = findUniversity("0000063") || {
  code: "0000063",
  name: "가천대학교",
  campus: "본교",
  region: "경기",
  institutionLevel: "대학",
  institutionType: "대학교",
  establishment: "사립",
};

const SCENARIOS = [
  { key: "hs-free", learnerType: "HIGH_SCHOOL", schoolGrade: 10, packageType: "FREE" },
  { key: "hs-mock", learnerType: "HIGH_SCHOOL", schoolGrade: 11, packageType: "MOCK_EXAM_ONLY" },
  { key: "placement-required", learnerType: "HIGH_SCHOOL", schoolGrade: 12, packageType: "LEARNING_PACKAGE", placement: false },
  { key: "hs-unranked-a", learnerType: "HIGH_SCHOOL", schoolGrade: 10, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "SILVER", gp: 52 },
  { key: "hs-unranked-b", learnerType: "HIGH_SCHOOL", schoolGrade: 11, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "GOLD", gp: 21 },
  { key: "retaker", learnerType: "RETAKER", schoolGrade: 13, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "SILVER", gp: 34 },
  { key: "university", learnerType: "UNIVERSITY", schoolGrade: 14, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "GOLD", gp: 46 },
  { key: "worker", learnerType: "WORKER", schoolGrade: 15, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "BRONZE", gp: 67 },
  { key: "ranked-a", learnerType: "HIGH_SCHOOL", schoolGrade: 12, packageType: "LEARNING_PACKAGE", placement: true, division: "MAIN", tier: "SILVER", gp: 61 },
  { key: "ranked-b", learnerType: "UNIVERSITY", schoolGrade: 14, packageType: "LEARNING_PACKAGE", placement: true, division: "MAIN", tier: "GOLD", gp: 43 },
  { key: "integrity-penalty", learnerType: "HIGH_SCHOOL", schoolGrade: 11, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "BRONZE", gp: 18, integrityPenalty: true },
  { key: "payback-ready", learnerType: "RETAKER", schoolGrade: 13, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "GOLD", gp: 74, paybackReady: true },
  { key: "warning", learnerType: "WORKER", schoolGrade: 15, packageType: "LEARNING_PACKAGE", placement: true, division: "SUB", tier: "SILVER", gp: 11, warningCount: 1 },
  { key: "suspended", learnerType: "HIGH_SCHOOL", schoolGrade: 10, packageType: "FREE", suspended: true },
];

function usernameFor(key) {
  return `launch${String(key).replace(/[^a-z0-9]/gi, "")}`.toLowerCase();
}

function userEducation(scenario) {
  if (scenario.learnerType === "HIGH_SCHOOL") {
    return { school: SCHOOL, university: undefined, educationStatus: "enrolled" };
  }
  if (scenario.learnerType === "UNIVERSITY") {
    return { school: undefined, university: UNIVERSITY, educationStatus: "enrolled" };
  }
  return {
    school: undefined,
    university: undefined,
    educationStatus: scenario.learnerType === "RETAKER" ? "graduated" : "enrolled",
  };
}

async function removePreviousBatch() {
  const previousUsers = await User.find({ isTestAccount: true, testBatchKey: BATCH_KEY })
    .select("_id")
    .lean();
  const previousIds = previousUsers.map((user) => user._id);
  const parents = await ParentAccount.find({ usernameNormalized: /^launchparent/ })
    .select("_id")
    .lean();
  if (parents.length) {
    await ParentChildLink.deleteMany({ parentAccountId: { $in: parents.map((parent) => parent._id) } });
    await ParentAccount.deleteMany({ _id: { $in: parents.map((parent) => parent._id) } });
  }
  for (const userId of previousIds) {
    await withdrawUserAccount({
      userId,
      initiatedBy: "focused-launch-e2e-reseed",
      retainAnonymousData: false,
    });
  }
  return previousIds.length;
}

async function nextTierPositions(seasonKey) {
  const rows = await ArenaStanding.aggregate([
    { $match: { seasonKey, status: "ACTIVE" } },
    { $group: { _id: { division: "$division", tier: "$arenaRank" }, maximum: { $max: "$arenaPosition" } } },
  ]);
  return new Map(rows.map((row) => [`${row._id.division}:${row._id.tier}`, Number(row.maximum || 0)]));
}

function placementScoreForTier(tier) {
  return {
    BRONZE: 38,
    SILVER: 50,
    GOLD: 59,
    PLATINUM: 67,
    EMERALD: 74,
    DIAMOND: 81,
    MASTER: 87,
    GRANDMASTER: 92,
    CHALLENGER: 97,
  }[tier] || 50;
}

function placementMmrForTier(tier) {
  return {
    BRONZE: 720,
    SILVER: 860,
    GOLD: 980,
    PLATINUM: 1080,
    EMERALD: 1170,
    DIAMOND: 1280,
    MASTER: 1400,
    GRANDMASTER: 1490,
    CHALLENGER: 1570,
  }[tier] || 860;
}

async function activatePlacedAccount({ user, scenario, now, seasonKey, positions }) {
  const cycle = await AccessCycle.findOne({ userId: user._id, status: "ACTIVE" }).sort({ paidAt: -1 });
  if (!cycle) throw new Error(`${scenario.key}: 활성 학습권 이용 주기가 없습니다.`);

  const tier = scenario.tier;
  const positionKey = `${scenario.division}:${tier}`;
  const position = Number(positions.get(positionKey) || 0) + 1;
  positions.set(positionKey, position);
  const score = placementScoreForTier(tier);
  const mmr = placementMmrForTier(tier);
  const submittedAt = new Date(now.getTime() - DAY_MS);
  const startedAt = new Date(submittedAt.getTime() - 2_400_000);
  const attempt = await AssessmentAttempt.create({
    userId: user._id,
    paperId: `focused-placement-${scenario.key}`,
    generationVersion: BATCH_KEY,
    scopeType: "placement",
    placementPurpose: "INITIAL",
    placementContextKey: "INITIAL",
    curriculumId: "kr-2022",
    courseId: "integrated-placement",
    title: "GOAT Arena 입단 배치고사",
    subtitle: "출시 전 목적형 검증 계정",
    passScore: 0,
    questions: [],
    totalPoints: 100,
    earnedPoints: score,
    scorePercent: score,
    passed: true,
    status: "submitted",
    startedAt,
    submittedAt,
    elapsedTimeMs: 2_400_000,
    timeLimitMs: 3_600_000,
    lastSavedAt: submittedAt,
    placementResult: {
      threePoint: { correct: Math.round(score / 5), total: 20, rawAccuracy: score / 100, adjustedAccuracy: score / 100 },
      fourPoint: { correct: Math.round(score / 10), total: 10, rawAccuracy: score / 100, adjustedAccuracy: score / 100 },
      semiKiller: { correct: Math.max(0, Math.round((score - 40) / 12)), total: 5, rawAccuracy: Math.max(0, (score - 35) / 65), adjustedAccuracy: Math.max(0, (score - 35) / 65) },
      killer: { correct: Math.max(0, Math.round((score - 75) / 12)), total: 2, rawAccuracy: Math.max(0, (score - 70) / 30), adjustedAccuracy: Math.max(0, (score - 70) / 30) },
      answeredCount: 30,
      unansweredCount: 0,
      totalScore: score,
      totalPercentile: score / 100,
      abilityProfile: { coreAbility: score / 100, advancedAbilityBeforeVerification: score / 100, advancedAbilityAfterVerification: score / 100, consistency: 0.8, placementConfidence: 0.9, basicStability: 0.75, possibleMistakeCount: 0, confirmedConceptGapCount: 0 },
      verification: { required: false, flagScore: 0, reasons: [], correct: 0, total: 0, result: "not-required" },
      placementScore: score,
      initialMmr: mmr,
      tier,
      rankingStatus: "confirmed",
      matchesUntilConfirmed: 0,
      cohortSize: SCENARIOS.length,
      cohortAverage: 65,
      cohortStandardDeviation: 15,
      standardizedScore: (score - 65) / 15,
      percentile: score,
      initialRating: mmr,
      initialTier: tier,
    },
  });
  const standing = await ArenaStanding.create({
    userId: user._id,
    division: scenario.division,
    seasonKey,
    sourcePlacementAttemptId: attempt._id,
    seedPolicyVersion: BATCH_KEY,
    seedPlacementScore: score,
    seedPlacementElapsedTimeMs: 2_400_000,
    seedPlacementMmr: mmr,
    seedPlacementStartedAt: startedAt,
    seededAt: now,
    arenaRank: tier,
    arenaPosition: position,
    arenaGp: scenario.gp,
    status: "ACTIVE",
    reachedCurrentGpAt: now,
  });

  cycle.division = scenario.division;
  cycle.availableLearningDays = scenario.division === "MAIN" ? 30 : 29;
  cycle.paybackScoreDays = scenario.division === "MAIN" ? 0 : scenario.paybackReady ? 30 : 20;
  cycle.streakDays = scenario.paybackReady ? 29 : 5;
  cycle.learningDayBuckets = scenario.division === "MAIN"
    ? [{ sourceType: "ADMIN_GRANT", availableDays: 30, reservedDays: 0, lockedDays: 0 }]
    : [];
  if (scenario.integrityPenalty) {
    cycle.paybackDisqualifiers = ["INTEGRITY_VIOLATION"];
  }
  await cycle.save();

  await ArenaAccessState.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        currentCompetitiveDivision: scenario.division,
        mainCompetitivePool: null,
        accessCycleId: cycle._id,
        standingId: standing._id,
        state: "PAID_ACTIVE",
        mainAchievementStatus: scenario.division === "MAIN" ? "ACHIEVED" : "NOT_ACHIEVED",
        currentSeasonPlacementCompleted: true,
        defensePoolEligible: !scenario.integrityPenalty,
        weeklyMockEligible: true,
        finalRankingActive: true,
        integrityStatus: scenario.integrityPenalty ? "RESTRICTED" : "CLEAR",
        matchmakingRestrictedUntil: scenario.integrityPenalty
          ? new Date(now.getTime() + 5 * DAY_MS)
          : null,
        integrityPenaltyStartedAt: scenario.integrityPenalty ? now : null,
        integrityPenaltyReason: scenario.integrityPenalty
          ? "출시 전 제재 안내 화면 검증"
          : "",
        paybackDisqualifiedAt: scenario.integrityPenalty ? now : null,
        reasonCode: scenario.integrityPenalty
          ? "INTEGRITY_PENALTY_5_DAYS"
          : BATCH_KEY,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  await RankingProfile.create({
    userId: user._id,
    placementScore: score,
    placementExpectedPerformance: score / 100,
    mmr,
    tier,
    rankPoint: scenario.gp,
    overallRank: position,
    percentile: score / 100,
    status: "CONFIRMED",
    weeklyExamsUntilConfirmed: 0,
    seasonId: seasonKey,
    reachedCurrentMmrAt: now,
  });
  const maxFinalRank = Number((await LiveFinalRankingProfile.findOne({ seasonId: seasonKey }).sort({ finalRank: -1 }).select("finalRank").lean())?.finalRank || 0);
  await LiveFinalRankingProfile.create({
    seasonId: seasonKey,
    userId: user._id,
    accessState: "PAID_ACTIVE",
    currentCompetitiveDivision: scenario.division,
    skillMmr: mmr,
    weeklyMockBonus: 0,
    publishedWeeklyMockBonus: 0,
    seasonSubCurrentPercentile: scenario.division === "SUB" ? score / 100 : null,
    seasonMainCurrentPercentile: scenario.division === "MAIN" ? score / 100 : null,
    seasonSettledNormalAttackCount: 0,
    finalRating: mmr,
    finalRank: maxFinalRank + 1,
    publishedFinalRating: mmr,
    publishedFinalRank: maxFinalRank + 1,
    lastPublishedAt: now,
    status: "ACTIVE",
    calculationKey: `${BATCH_KEY}:${scenario.key}`,
  });

  return { cycleId: String(cycle._id), standingId: String(standing._id) };
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  if (process.env.ALLOW_TEST_DATA_MUTATION !== "1") {
    throw new Error(
      "테스트 데이터 변경은 기본적으로 차단됩니다. 실행하려면 ALLOW_TEST_DATA_MUTATION=1을 명시하세요."
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.CONFIRM_PRODUCTION_TEST_DATA_MUTATION !== BATCH_KEY
  ) {
    throw new Error(
      `운영 DB 테스트 데이터 변경을 확인하려면 CONFIRM_PRODUCTION_TEST_DATA_MUTATION=${BATCH_KEY}가 필요합니다.`
    );
  }
  if (TEST_PASSWORD.length < 12) {
    throw new Error("TEST_ACCOUNT_PASSWORD에 12자 이상의 전용 테스트 비밀번호가 필요합니다.");
  }
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 15_000, connectTimeoutMS: 15_000 });
  const now = new Date();
  try {
    const removedPrevious = await removePreviousBatch();
    const admin = await User.findOne({ role: "admin", isActive: { $ne: false }, accountStatus: { $ne: "withdrawn" } })
      .select("_id")
      .lean();
    if (!admin?._id) throw new Error("패키지 부여 이력을 기록할 관리자 계정을 찾을 수 없습니다.");
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    const seasonKey = kstSeasonKey(now);
    const positions = await nextTierPositions(seasonKey);
    const manifest = [];
    const userByKey = new Map();

    for (const [index, scenario] of SCENARIOS.entries()) {
      const username = usernameFor(scenario.key);
      const education = userEducation(scenario);
      const suspendedUntil = scenario.suspended ? new Date(now.getTime() + 5 * DAY_MS) : null;
      const user = await User.create({
        name: username,
        nameNormalized: username,
        realName: `출시검증${index + 1}`,
        email: `${username}@test.com`,
        passwordHash,
        role: "student",
        isTestAccount: true,
        testBatchKey: BATCH_KEY,
        arenaTestMatchEnabled: true,
        operatorRemark: `launch-e2e · ${scenario.key}`,
        schoolGrade: scenario.schoolGrade,
        learnerType: scenario.learnerType,
        educationStatus: education.educationStatus,
        ...(education.school ? { school: education.school } : {}),
        ...(education.university ? { university: education.university } : {}),
        termsAcceptedAt: now,
        termsVersion: "2026-08-07",
        privacyVersion: "2026-08-07",
        lastLoginAt: now,
        lastConnectedAt: now,
        totalConnectedSeconds: (index + 1) * 1800,
        totalStudySeconds: (index + 1) * 2400,
        isActive: true,
        accountStatus: scenario.suspended ? "suspended" : "active",
        accountStatusReason: scenario.suspended ? "출시 전 계정 상태 화면 검증" : "",
        suspendedUntil,
        warningCount: Number(scenario.warningCount || scenario.integrityPenalty || 0),
      });
      userByKey.set(scenario.key, user);

      const packageType = ADMIN_PACKAGE_TYPES[scenario.packageType];
      if (packageType && packageType !== ADMIN_PACKAGE_TYPES.FREE) {
        await updateAdminPackageAccess({
          adminUserId: admin._id,
          userId: user._id,
          packageType,
          reason: `출시 전 목적형 검증 계정 구성 · ${scenario.key}`,
          now: new Date(now.getTime() + index * 1000),
        });
      }
      let arena = {};
      if (scenario.placement) {
        arena = await activatePlacedAccount({ user, scenario, now, seasonKey, positions });
      }
      if (scenario.paybackReady && arena.cycleId) {
        await saveConfirmedPaybackAccount(user._id, {
          bankName: "테스트은행",
          accountHolderName: user.realName,
          accountNumber: "123456789012",
        });
        await AccessCycle.updateOne(
          { _id: arena.cycleId },
          {
            $set: {
              cashbackQualified: true,
              paybackRate: 100,
              paybackAmount: 29000,
              paybackPayoutStatus: "PENDING",
              paybackDisqualifiers: [],
              evaluatedAt: now,
            },
          }
        );
      }
      manifest.push({
        scenario: scenario.key,
        username,
        email: `${username}@test.com`,
        password: TEST_PASSWORD,
        learnerType: scenario.learnerType,
        schoolGrade: scenario.schoolGrade,
        packageType: scenario.packageType,
        placementCompleted: Boolean(scenario.placement),
        division: scenario.division || "",
        tier: scenario.tier || "",
        userId: String(user._id),
        ...arena,
      });
    }

    const firstChild = userByKey.get("hs-unranked-a");
    const secondChild = userByKey.get("university");
    const parentUsername = "launchparentfamily";
    const parent = await ParentAccount.create({
      username: parentUsername,
      usernameNormalized: parentUsername,
      email: "launch-parent-family@test.com",
      passwordHash,
      childUserId: firstChild._id,
      isActive: true,
      acceptedTermsAt: now,
    });
    await ParentChildLink.insertMany([
      {
        parentAccountId: parent._id,
        childUserId: firstChild._id,
        status: "ACTIVE",
        linkedAt: now,
        notificationSettings: {
          emailEnabled: true,
          lowLearning: { enabled: true, minimumMinutesPerDay: 20, consecutiveDays: 3 },
          inactivity: { enabled: true, days: 7 },
          updatedAt: now,
        },
      },
      {
        parentAccountId: parent._id,
        childUserId: secondChild._id,
        status: "ACTIVE",
        linkedAt: now,
      },
    ]);
    manifest.push({
      scenario: "parent-multiple-children",
      username: parentUsername,
      email: "launch-parent-family@test.com",
      password: TEST_PASSWORD,
      parentAccountId: String(parent._id),
      childUserIds: [String(firstChild._id), String(secondChild._id)],
    });

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: now.toISOString(), database: mongoose.connection.name, batchKey: BATCH_KEY, removedPrevious, accounts: manifest }, null, 2));
    console.log(JSON.stringify({ ok: true, database: mongoose.connection.name, batchKey: BATCH_KEY, studentAccounts: SCENARIOS.length, parentAccounts: 1, outputPath: OUTPUT_PATH }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
