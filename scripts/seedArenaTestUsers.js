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
  UserNotification,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaAchievementBadge,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaStanding,
  LiveFinalRankingProfile,
  MainShopEffect,
  MainShopPurchase,
} = require("../models/goatArenaModel");
const {
  ensureDefaultLearningPackagePolicy,
  policySnapshot,
} = require("../services/arenaPolicyService");
const { kstSeasonKey } = require("../services/arenaStandingService");

const TEST_BATCH_KEY = "GOAT-ARENA-E2E-200-20260803";
const TEST_PASSWORD = "REMOVED_FROM_HISTORY";
const TEST_COUNT_PER_DIVISION = 100;
const TEST_MATCH_ACTOR_USERNAME = "REMOVED_FROM_HISTORY";
const OUTPUT_PATH = path.resolve(
  __dirname,
  "..",
  "outputs",
  "019fb1e7-d977-7813-80d6-e222909a9a87",
  "arena-test-users-200.json"
);
const TIER_LABELS = {
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};
const TEST_DATASET_VERSION = "GOAT-ARENA-PLACEMENT-REALISTIC-V2";
const TIER_DISTRIBUTION = [
  { key: "BRONZE", count: 20, scoreMin: 28, scoreMax: 43, mmrMin: 620, mmrMax: 790 },
  { key: "SILVER", count: 18, scoreMin: 44, scoreMax: 53, mmrMin: 805, mmrMax: 915 },
  { key: "GOLD", count: 15, scoreMin: 54, scoreMax: 62, mmrMin: 930, mmrMax: 1015 },
  { key: "PLATINUM", count: 13, scoreMin: 63, scoreMax: 70, mmrMin: 1030, mmrMax: 1110 },
  { key: "EMERALD", count: 10, scoreMin: 71, scoreMax: 77, mmrMin: 1125, mmrMax: 1200 },
  { key: "DIAMOND", count: 8, scoreMin: 78, scoreMax: 84, mmrMin: 1215, mmrMax: 1320 },
  { key: "MASTER", count: 6, scoreMin: 85, scoreMax: 89, mmrMin: 1335, mmrMax: 1435 },
  { key: "GRANDMASTER", count: 5, scoreMin: 90, scoreMax: 94, mmrMin: 1445, mmrMax: 1510 },
  { key: "CHALLENGER", count: 5, scoreMin: 95, scoreMax: 99, mmrMin: 1530, mmrMax: 1600 },
];
const SCHOOLS = Array.from({ length: 10 }, (_, index) => ({
  code: `TEST-HS-${String(index + 1).padStart(2, "0")}`,
  name: `테스트고등학교 ${index + 1}`,
  region: ["서울특별시", "경기도", "인천광역시", "부산광역시", "대전광역시"][index % 5],
}));

function koreanNumber(value) {
  const units = ["", "십", "백"];
  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  if (value === 0) return "영";
  let number = Math.max(0, Math.min(999, Number(value) || 0));
  let result = "";
  for (let unit = 2; unit >= 0; unit -= 1) {
    const divisor = 10 ** unit;
    const digit = Math.floor(number / divisor);
    number %= divisor;
    if (!digit) continue;
    if (digit > 1 || unit === 0) result += digits[digit];
    result += units[unit];
  }
  return result;
}

function plusDays(value, days) {
  return new Date(new Date(value).getTime() + days * 86_400_000);
}

function interpolate(minimum, maximum, offset, count) {
  if (count <= 1) return Math.round((minimum + maximum) / 2);
  return Math.round(minimum + ((maximum - minimum) * offset) / (count - 1));
}

function placementProfileForIndex(localIndex) {
  let cursor = 0;
  for (const tier of TIER_DISTRIBUTION) {
    const nextCursor = cursor + tier.count;
    if (localIndex < nextCursor) {
      const offset = localIndex - cursor;
      const percentile = (localIndex + 0.5) / TEST_COUNT_PER_DIVISION;
      return {
        tierKey: tier.key,
        tierLabel: TIER_LABELS[tier.key],
        tierOffset: offset,
        tierCount: tier.count,
        placementScore: interpolate(tier.scoreMin, tier.scoreMax, offset, tier.count),
        placementMmr: interpolate(tier.mmrMin, tier.mmrMax, offset, tier.count),
        placementPercentile: percentile,
        arenaGp: interpolate(0, 99, offset, tier.count),
      };
    }
    cursor = nextCursor;
  }
  throw new Error(`테스트 티어 분포 범위를 벗어났습니다: ${localIndex}`);
}

async function assertNoRealAccountCollision() {
  const names = Array.from({ length: 200 }, (_, index) => `test${index + 1}`);
  const emails = names.map((name) => `${name}@test.com`);
  const collisions = await User.find({
    $or: [
      { nameNormalized: { $in: names } },
      { email: { $in: emails } },
    ],
    $nor: [
      { isTestAccount: true },
      { role: "test", testBatchKey: TEST_BATCH_KEY },
    ],
  })
    .select("name email role isTestAccount testBatchKey")
    .lean();
  if (collisions.length) {
    throw new Error(
      `실제 계정과 충돌할 수 있어 중단했습니다: ${collisions
        .slice(0, 5)
        .map((user) => `${user.name}/${user.email}`)
        .join(", ")}`
    );
  }
}

async function cleanupTaggedTestAccounts() {
  const users = await User.find({
    isTestAccount: true,
    testBatchKey: TEST_BATCH_KEY,
  })
    .select("_id")
    .lean();
  const userIds = users.map((user) => user._id);
  if (!userIds.length) return { removedUsers: 0 };

  const matches = await ArenaMatch.find({
    $or: [
      { "challenger.userId": { $in: userIds } },
      { "defender.userId": { $in: userIds } },
    ],
  })
    .select("_id")
    .lean();
  const matchIds = matches.map((match) => match._id);

  await Promise.all([
    AssessmentAttempt.deleteMany({ userId: { $in: userIds }, scopeType: "placement" }),
    RankingProfile.deleteMany({ userId: { $in: userIds } }),
    UserNotification.deleteMany({ userId: { $in: userIds } }),
    AccessCycle.deleteMany({ userId: { $in: userIds } }),
    ArenaAccessState.deleteMany({ userId: { $in: userIds } }),
    ArenaAchievementBadge.deleteMany({ userId: { $in: userIds } }),
    ArenaIntegrityRiskCase.deleteMany({ userId: { $in: userIds } }),
    ArenaIntegrityRiskProfile.deleteMany({ userId: { $in: userIds } }),
    ArenaLearningDayLedger.deleteMany({ userId: { $in: userIds } }),
    ArenaStanding.deleteMany({ userId: { $in: userIds } }),
    LiveFinalRankingProfile.deleteMany({ userId: { $in: userIds } }),
    MainShopEffect.deleteMany({ userId: { $in: userIds } }),
    MainShopPurchase.deleteMany({ userId: { $in: userIds } }),
    matchIds.length ? ArenaMatchAttempt.deleteMany({ matchId: { $in: matchIds } }) : null,
    matchIds.length ? ArenaMatchEvidence.deleteMany({ matchId: { $in: matchIds } }) : null,
    matchIds.length ? ArenaMatch.deleteMany({ _id: { $in: matchIds } }) : null,
  ].filter(Boolean));
  await User.deleteMany({ _id: { $in: userIds } });
  return { removedUsers: userIds.length, removedMatches: matchIds.length };
}

async function setTestMatchActorAccess(enabled) {
  return User.updateOne(
    {
      nameNormalized: TEST_MATCH_ACTOR_USERNAME,
      role: { $ne: "admin" },
      isActive: { $ne: false },
      accountStatus: { $ne: "withdrawn" },
    },
    { $set: { arenaTestMatchEnabled: enabled === true } }
  );
}

async function nextTierPositions(seasonKey) {
  const rows = await ArenaStanding.aggregate([
    { $match: { seasonKey, status: "ACTIVE" } },
    {
      $group: {
        _id: { division: "$division", arenaRank: "$arenaRank" },
        maximum: { $max: "$arenaPosition" },
      },
    },
  ]);
  return new Map(
    rows.map((row) => [
      `${row._id.division}:${row._id.arenaRank}`,
      Number(row.maximum || 0),
    ])
  );
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  const now = new Date();
  try {
    await assertNoRealAccountCollision();
    const cleanup = await cleanupTaggedTestAccounts();
    if (process.argv.includes("--cleanup-only")) {
      await setTestMatchActorAccess(false);
      console.log(JSON.stringify({
        ok: true,
        cleanupOnly: true,
        database: mongoose.connection.name,
        batchKey: TEST_BATCH_KEY,
        ...cleanup,
      }));
      return;
    }
    const policy = await ensureDefaultLearningPackagePolicy(now);
    if (!policy?._id) throw new Error("활성 29일 학습권 정책을 준비하지 못했습니다.");
    const snapshot = policySnapshot(policy);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    const seasonKey = kstSeasonKey(now);
    const positionBase = await nextTierPositions(seasonKey);
    const users = [];
    const manifest = [];

    for (let index = 0; index < 200; index += 1) {
      const number = index + 1;
      const division = index < TEST_COUNT_PER_DIVISION ? "SUB" : "MAIN";
      const localIndex = index % TEST_COUNT_PER_DIVISION;
      const placementProfile = placementProfileForIndex(localIndex);
      const tierKey = placementProfile.tierKey;
      const tierLabel = placementProfile.tierLabel;
      const tierCounterKey = `${division}:${tierLabel}`;
      const arenaPosition = Number(positionBase.get(tierCounterKey) || 0) +
        (placementProfile.tierCount - placementProfile.tierOffset);
      const arenaGp = placementProfile.arenaGp;
      const finalRankOffset =
        (TEST_COUNT_PER_DIVISION - localIndex - 1) * 2 +
        (division === "MAIN" ? 1 : 2);
      const school = SCHOOLS[localIndex % SCHOOLS.length];
      const username = `test${number}`;
      const email = `${username}@test.com`;
      const realName = `테스트${koreanNumber(number)}`;
      const userId = new mongoose.Types.ObjectId();
      users.push({
        _id: userId,
        name: username,
        nameNormalized: username,
        realName,
        email,
        passwordHash,
        /*
         * 실제 학생과 같은 인증·권한 경로를 타게 하되, 운영 데이터와의
         * 격리는 isTestAccount/testBatchKey로 유지한다.
         */
        role: "student",
        isTestAccount: true,
        testBatchKey: TEST_BATCH_KEY,
        operatorRemark: "test · GOAT Arena Unranked/Ranked 전체 기능 검증용",
        schoolGrade: [10, 11, 12][localIndex % 3],
        educationStatus: "enrolled",
        school: {
          region: school.region,
          code: school.code,
          name: school.name,
          roadAddress: "테스트 데이터",
          establishment: "테스트",
          highSchoolType: "테스트",
        },
        termsAcceptedAt: now,
        lastLoginAt: now,
        lastConnectedAt: now,
        totalConnectedSeconds: (localIndex + 1) * 180,
        isActive: true,
        accountStatus: "active",
        accountStatusReason: "",
        warningCount: 0,
      });
      manifest.push({
        number,
        username,
        email,
        password: TEST_PASSWORD,
        realName,
        division,
        tier: tierLabel,
        tierCode: tierKey,
        tierRank: arenaPosition,
        gp: arenaGp,
        placementScore: placementProfile.placementScore,
        initialMmr: placementProfile.placementMmr,
        placementPercentile: placementProfile.placementPercentile,
        finalRankOffset,
        package: "29일 학습권 패키지",
        learningDays: division === "MAIN" ? 30 : 29,
        paybackScore: division === "SUB" ? 29 : 0,
        school: school.name,
        grade: [10, 11, 12][localIndex % 3],
        remark: "test",
        scenario: [
          "기본 활성",
          "빠른 정답 검증",
          "경기 매칭 검증",
          "상점 구매 검증",
          "랭킹 스크롤 검증",
        ][localIndex % 5],
        userId: String(userId),
      });
    }

    const insertedUsers = await User.insertMany(users, { ordered: true });
    const userById = new Map(insertedUsers.map((user) => [String(user._id), user]));
    const cycles = [];
    const initialLedgers = [];
    const standings = [];
    const accessStates = [];
    const rankingProfiles = [];
    const finalProfiles = [];
    const placementAttempts = [];
    const currentMaximumFinalRank = Number(
      (await LiveFinalRankingProfile.findOne({
        status: { $in: ["ACTIVE", "SUNDAY_DISPLAY_FROZEN"] },
      })
        .sort({ finalRank: -1 })
        .select("finalRank")
        .lean())?.finalRank || 0
    );

    for (const row of manifest) {
      const user = userById.get(row.userId);
      const cycleId = new mongoose.Types.ObjectId();
      const standingId = new mongoose.Types.ObjectId();
      const placementAttemptId = new mongoose.Types.ObjectId();
      const learningDays = row.learningDays;
      const placementSubmittedAt = new Date(
        now.getTime() - (3 + (row.number % 21)) * 86_400_000 - row.number * 60_000
      );
      const placementElapsedTimeMs = 1_080_000 + (row.number % 19) * 42_000;
      const placementStartedAt = new Date(
        placementSubmittedAt.getTime() - placementElapsedTimeMs
      );
      placementAttempts.push({
        _id: placementAttemptId,
        userId: user._id,
        paperId: `test-placement-${TEST_BATCH_KEY}-${row.number}`,
        generationVersion: TEST_DATASET_VERSION,
        scopeType: "placement",
        placementPurpose: "INITIAL",
        placementContextKey: "INITIAL",
        curriculumId: "kr-2022",
        courseId: "integrated-placement",
        title: "War of GOAT 입단 배치고사",
        subtitle: "GOAT Arena 실전 검증용 테스트 응시 기록",
        passScore: 0,
        questions: [],
        totalPoints: 100,
        earnedPoints: row.placementScore,
        scorePercent: row.placementScore,
        passed: true,
        status: "submitted",
        startedAt: placementStartedAt,
        submittedAt: placementSubmittedAt,
        elapsedTimeMs: placementElapsedTimeMs,
        timeLimitMs: 3_600_000,
        lastSavedAt: placementSubmittedAt,
        placementResult: {
          threePoint: {
            correct: Math.min(20, Math.max(0, Math.round(row.placementScore / 5))),
            total: 20,
            rawAccuracy: Math.min(1, row.placementScore / 100),
            adjustedAccuracy: Math.min(1, row.placementScore / 100),
          },
          fourPoint: {
            correct: Math.min(10, Math.max(0, Math.round(row.placementScore / 10))),
            total: 10,
            rawAccuracy: Math.min(1, row.placementScore / 100),
            adjustedAccuracy: Math.min(1, row.placementScore / 100),
          },
          semiKiller: {
            correct: Math.min(5, Math.max(0, Math.round((row.placementScore - 45) / 11))),
            total: 5,
            rawAccuracy: Math.min(1, Math.max(0, (row.placementScore - 35) / 65)),
            adjustedAccuracy: Math.min(1, Math.max(0, (row.placementScore - 35) / 65)),
          },
          killer: {
            correct: Math.min(2, Math.max(0, Math.round((row.placementScore - 75) / 12))),
            total: 2,
            rawAccuracy: Math.min(1, Math.max(0, (row.placementScore - 70) / 30)),
            adjustedAccuracy: Math.min(1, Math.max(0, (row.placementScore - 70) / 30)),
          },
          answeredCount: 30,
          unansweredCount: 0,
          totalScore: row.placementScore,
          totalPercentile: row.placementPercentile,
          abilityProfile: {
            coreAbility: Math.min(1, row.placementScore / 100),
            advancedAbilityBeforeVerification: Math.min(1, row.placementScore / 100),
            advancedAbilityAfterVerification: Math.min(1, row.placementScore / 100),
            consistency: 0.72 + (row.number % 20) / 100,
            placementConfidence: 0.9,
            basicStability: Math.min(1, 0.55 + row.placementScore / 220),
            possibleMistakeCount: row.number % 3,
            confirmedConceptGapCount: Math.max(0, Math.round((70 - row.placementScore) / 12)),
          },
          verification: {
            required: false,
            flagScore: 0,
            reasons: [],
            correct: 0,
            total: 0,
            result: "not-required",
          },
          placementScore: row.placementScore,
          initialMmr: row.initialMmr,
          tier: row.tier,
          rankingStatus: "confirmed",
          matchesUntilConfirmed: 0,
          cohortSize: 200,
          cohortAverage: 66,
          cohortStandardDeviation: 19,
          standardizedScore: Math.round(((row.placementScore - 66) / 19) * 1000) / 1000,
          percentile: Math.round(row.placementPercentile * 1000) / 10,
          initialRating: row.initialMmr,
          initialTier: row.tier,
        },
      });
      cycles.push({
        _id: cycleId,
        userId: user._id,
        division: row.division,
        status: "ACTIVE",
        policyVersionId: policy._id,
        policyVersionCode: snapshot.code,
        policySnapshot: snapshot,
        pricePaid: 0,
        purchaseReference: `TEST-${TEST_BATCH_KEY}-${row.number}`,
        paidAt: now,
        startsAt: now,
        baseExpiresAt: plusDays(now, learningDays),
        expiresAt: plusDays(now, learningDays),
        evaluationAt: plusDays(now, learningDays),
        availableLearningDays: learningDays,
        paybackScoreDays: row.paybackScore,
        lockedPaybackScoreDays: 0,
        lockedLearningDays: 0,
        reservedLearningDays: 0,
        learningDayBuckets: row.division === "MAIN"
          ? [{ sourceType: "ADMIN_GRANT", availableDays: learningDays, reservedDays: 0, lockedDays: 0 }]
          : [],
        firstDayMode: "SAME_DAY",
        firstConsumptionDateKst: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now),
        paidNormalAttacksCompleted: row.number % 3,
        streakDays: row.division === "SUB" ? 29 : 0,
      });
      initialLedgers.push({
        userId: user._id,
        accessCycleId: cycleId,
        idempotencyKey: `${cycleId}:TEST_INITIAL_GRANT:${TEST_BATCH_KEY}`,
        eventType: "PURCHASE_GRANTED",
        availableLearningDaysDelta: learningDays,
        paybackScoreDaysDelta: row.paybackScore,
        lockedPaybackScoreDaysDelta: 0,
        lockedLearningDaysDelta: 0,
        reservedLearningDaysDelta: 0,
        sourceBucket: row.division === "MAIN" ? "ADMIN_GRANT" : "PACKAGE_BASE",
        balanceAfter: {
          availableLearningDays: learningDays,
          paybackScoreDays: row.paybackScore,
          lockedPaybackScoreDays: 0,
          lockedLearningDays: 0,
          reservedLearningDays: 0,
        },
        sourceType: "ARENA_TEST_DATASET",
        sourceId: policy._id,
        occurredAt: now,
        metadata: {
          testBatchKey: TEST_BATCH_KEY,
          reason: "테스트 이용 주기 초기 잔액 생성",
        },
      });
      standings.push({
        _id: standingId,
        userId: user._id,
        division: row.division,
        seasonKey,
        sourcePlacementAttemptId: placementAttemptId,
        seedPolicyVersion: TEST_BATCH_KEY,
        seedPlacementScore: row.placementScore,
        seedPlacementElapsedTimeMs: placementElapsedTimeMs,
        seedPlacementMmr: row.initialMmr,
        seedPlacementStartedAt: placementStartedAt,
        seededAt: now,
        arenaRank: row.tier,
        arenaPosition: row.tierRank,
        arenaGp: row.gp,
        status: "ACTIVE",
        reachedCurrentGpAt: new Date(now.getTime() + row.number * 1000),
      });
      accessStates.push({
        userId: user._id,
        currentCompetitiveDivision: row.division,
        accessCycleId: cycleId,
        standingId,
        state: "PAID_ACTIVE",
        mainAchievementStatus: row.division === "MAIN" ? "ACHIEVED" : "NOT_ACHIEVED",
        currentSeasonPlacementCompleted: true,
        defensePoolEligible: true,
        weeklyMockEligible: true,
        finalRankingActive: true,
        integrityStatus: "CLEAR",
        reasonCode: TEST_BATCH_KEY,
      });
      rankingProfiles.push({
        userId: user._id,
        placementScore: row.placementScore,
        placementExpectedPerformance: Math.min(0.99, row.placementScore / 100),
        mmr: row.initialMmr,
        tier: row.tierCode,
        rankPoint: row.gp,
        overallRank: row.finalRankOffset,
        percentile: row.placementPercentile,
        status: "CONFIRMED",
        weeklyExamsUntilConfirmed: 0,
        seasonId: seasonKey,
        reachedCurrentMmrAt: now,
      });
      finalProfiles.push({
        seasonId: seasonKey,
        userId: user._id,
        accessState: "PAID_ACTIVE",
        currentCompetitiveDivision: row.division,
        skillMmr: row.initialMmr,
        weeklyMockBonus: (row.number % 4) * 10,
        publishedWeeklyMockBonus: (row.number % 4) * 10,
        seasonSubCurrentPercentile: row.division === "SUB" ? row.placementPercentile : null,
        seasonMainCurrentPercentile: row.division === "MAIN" ? row.placementPercentile : null,
        seasonSettledNormalAttackCount: row.number % 6,
        finalRating: row.initialMmr + (row.division === "MAIN" ? 1 : 0),
        finalRank: currentMaximumFinalRank + row.finalRankOffset,
        publishedFinalRating: row.initialMmr + (row.division === "MAIN" ? 1 : 0),
        publishedFinalRank: currentMaximumFinalRank + row.finalRankOffset,
        lastPublishedAt: now,
        status: "ACTIVE",
        calculationKey: `${TEST_BATCH_KEY}:${row.number}`,
      });
      row.accessCycleId = String(cycleId);
      row.standingId = String(standingId);
      row.placementAttemptId = String(placementAttemptId);
      row.placementStartedAt = placementStartedAt.toISOString();
      row.placementSubmittedAt = placementSubmittedAt.toISOString();
      row.placementElapsedTimeMs = placementElapsedTimeMs;
    }

    await Promise.all([
      AssessmentAttempt.insertMany(placementAttempts, { ordered: true }),
      AccessCycle.insertMany(cycles, { ordered: true }),
      ArenaStanding.insertMany(standings, { ordered: true }),
      RankingProfile.insertMany(rankingProfiles, { ordered: true }),
      LiveFinalRankingProfile.insertMany(finalProfiles, { ordered: true }),
      ArenaLearningDayLedger.insertMany(initialLedgers, { ordered: true }),
    ]);
    await ArenaAccessState.insertMany(accessStates, { ordered: true });
    const testActorUpdate = await setTestMatchActorAccess(true);
    if (Number(testActorUpdate.matchedCount || 0) !== 1) {
      throw new Error(
        `${TEST_MATCH_ACTOR_USERNAME} 테스트 실행 계정을 찾지 못해 더미 계정 매칭 권한을 켜지 못했습니다.`
      );
    }

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(
      OUTPUT_PATH,
      JSON.stringify(
        {
          generatedAt: now.toISOString(),
          database: mongoose.connection.name,
          batchKey: TEST_BATCH_KEY,
          cleanup,
          password: TEST_PASSWORD,
          accounts: manifest,
        },
        null,
        2
      )
    );
    console.log(
      JSON.stringify({
        ok: true,
        database: mongoose.connection.name,
        batchKey: TEST_BATCH_KEY,
        subUsers: manifest.filter((row) => row.division === "SUB").length,
        mainUsers: manifest.filter((row) => row.division === "MAIN").length,
        testMatchActor: TEST_MATCH_ACTOR_USERNAME,
        testMatchingEnabled: true,
        manifestPath: OUTPUT_PATH,
      })
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
