const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
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
const OUTPUT_PATH = path.resolve(
  __dirname,
  "..",
  "outputs",
  "019fb1e7-d977-7813-80d6-e222909a9a87",
  "arena-test-users-200.json"
);
const TIER_KEYS = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
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
    const tierCounters = new Map();
    const users = [];
    const manifest = [];

    for (let index = 0; index < 200; index += 1) {
      const number = index + 1;
      const division = index < TEST_COUNT_PER_DIVISION ? "SUB" : "MAIN";
      const localIndex = index % TEST_COUNT_PER_DIVISION;
      const tierKey = TIER_KEYS[localIndex % TIER_KEYS.length];
      const tierLabel = TIER_LABELS[tierKey];
      const tierCounterKey = `${division}:${tierLabel}`;
      const inTierSequence = Number(tierCounters.get(tierCounterKey) || 0) + 1;
      tierCounters.set(tierCounterKey, inTierSequence);
      const arenaPosition = Number(positionBase.get(tierCounterKey) || 0) + inTierSequence;
      const arenaGp = Math.max(0, 99 - (inTierSequence - 1) * 8);
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
        role: "test",
        isTestAccount: true,
        testBatchKey: TEST_BATCH_KEY,
        operatorRemark: "test · GOAT Arena Sub/Main 전체 기능 검증용",
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
      const learningDays = row.learningDays;
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
        seedPolicyVersion: TEST_BATCH_KEY,
        seedPlacementScore: 50 + (row.number % 50),
        seedPlacementElapsedTimeMs: 300_000 + row.number * 1_000,
        seedPlacementMmr: 900 + row.number * 5,
        seedPlacementStartedAt: plusDays(now, -1),
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
        lastMainQualifyingActivityAt: row.division === "MAIN" ? now : null,
        defensePoolEligible: true,
        weeklyMockEligible: true,
        finalRankingActive: true,
        integrityStatus: "CLEAR",
        reasonCode: TEST_BATCH_KEY,
      });
      rankingProfiles.push({
        userId: user._id,
        placementScore: 50 + (row.number % 50),
        placementExpectedPerformance: 0.5 + (row.number % 40) / 100,
        mmr: 900 + row.number * 5,
        tier: row.tierCode,
        rankPoint: row.gp,
        overallRank: row.number,
        percentile: row.number / 200,
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
        skillMmr: 900 + row.number * 5,
        weeklyMockBonus: (row.number % 4) * 10,
        publishedWeeklyMockBonus: (row.number % 4) * 10,
        seasonSubCurrentPercentile: row.division === "SUB" ? row.number / 200 : null,
        seasonMainCurrentPercentile: row.division === "MAIN" ? row.number / 200 : null,
        seasonSettledNormalAttackCount: row.number % 6,
        finalRating: 2400 - row.number,
        finalRank: currentMaximumFinalRank + row.number,
        publishedFinalRating: 2400 - row.number,
        publishedFinalRank: currentMaximumFinalRank + row.number,
        lastPublishedAt: now,
        status: "ACTIVE",
        calculationKey: `${TEST_BATCH_KEY}:${row.number}`,
      });
      row.accessCycleId = String(cycleId);
      row.standingId = String(standingId);
    }

    await Promise.all([
      AccessCycle.insertMany(cycles, { ordered: true }),
      ArenaStanding.insertMany(standings, { ordered: true }),
      RankingProfile.insertMany(rankingProfiles, { ordered: true }),
      LiveFinalRankingProfile.insertMany(finalProfiles, { ordered: true }),
      ArenaLearningDayLedger.insertMany(initialLedgers, { ordered: true }),
    ]);
    await ArenaAccessState.insertMany(accessStates, { ordered: true });

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
