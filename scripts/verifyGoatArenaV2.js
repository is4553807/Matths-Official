const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const mongoose = require("mongoose");
const {
  ArenaCompetitiveProfile,
  ArenaFriendRequest,
  ArenaFriendship,
  ArenaMatch,
  ArenaMatchmakingEntry,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");
const { normalizedPlayer, updateGlicko2Player, updateHeadToHead } = require("../services/glicko2Service");
const {
  competitiveUnlockState,
  placementEstimate,
  profileView,
  tierForRating,
} = require("../services/arenaV2ProfileService");
const { winnerFromScores } = require("../services/arenaV2SettlementService");
const { arenaV2DifficultyPlan } = require("../services/arenaV2DifficultyService");
const { adaptiveRatingUpdate } = require("../services/arenaAdaptiveRatingService");
const { friendlyDifficultyPlan } = require("../services/arenaOneOnOneProblemBank");
const {
  generateArenaPdfOneOnOneQuestions,
} = require("../services/arenaPdfOneOnOneQuestionPool");
const {
  _testing: {
    matchmakingRating: normalMatchmakingRating,
    normalSourceRates,
    ratingSnapshot: normalRatingSnapshot,
    updateNormalMatchmakingRating,
  },
} = require("../services/arenaAsyncNormalService");

async function main() {
  assert.equal(GOAT_ARENA_V2_CONFIG.glicko2.defaultRating, 1500);
  assert.equal(GOAT_ARENA_V2_CONFIG.glicko2.defaultRatingDeviation, 350);
  assert.equal(GOAT_ARENA_V2_CONFIG.glicko2.defaultVolatility, 0.06);
  assert.equal(GOAT_ARENA_V2_CONFIG.glicko2.systemConstant, 0.5);
  assert.equal(GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating, 1000);
  assert.equal(GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRatingDeviation, 350);
  assert.equal(GOAT_ARENA_V2_CONFIG.asyncNormal.defaultVolatility, 0.06);
  const publicProfile = profileView({
    normalMatchesCompleted: 3,
    placementFinalizedAt: new Date(),
    ratingInitializedAt: new Date(),
    placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
    rating: 1600,
    ratingDeviation: 90,
    volatility: 0.06,
    competitiveScore: 1540,
    tier: "MASTER",
  });
  assert.equal(publicProfile.competitiveScore, 1540);
  for (const internalField of [
    "rating",
    "ratingDeviation",
    "volatility",
    "provisionalRating",
    "provisionalRatingDeviation",
    "provisionalVolatility",
  ]) {
    assert.equal(internalField in publicProfile, false, `${internalField} must stay out of the public profile`);
  }
  assert.equal(
    GOAT_ARENA_V2_CONFIG.asyncNormal.baselineRatingDeviation,
    GOAT_ARENA_V2_CONFIG.placement.ratingDeviationByAttemptCount[4]
  );
  assert.equal(GOAT_ARENA_V2_CONFIG.asyncNormal.baselineVolatility, 0.06);
  assert.equal(GOAT_ARENA_V2_CONFIG.asyncNormal.closeScoreThreshold, 0.1);
  assert.deepEqual(
    GOAT_ARENA_V2_CONFIG.placement.volatilityByAttemptCount,
    [0.10, 0.09, 0.08, 0.07, 0.06]
  );
  const normalConfigProbe =
    "const {GOAT_ARENA_V2_CONFIG:c}=require('./services/goatArenaV2Config'); console.log(JSON.stringify(c.asyncNormal));";
  const customNormal = JSON.parse(execFileSync(process.execPath, ["-e", normalConfigProbe], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      ARENA_NORMAL_HIDDEN_MMR_DEFAULT: "925",
      ARENA_NORMAL_HIDDEN_RD_DEFAULT: "240",
      ARENA_NORMAL_HIDDEN_VOLATILITY_DEFAULT: "0.05",
    },
    encoding: "utf8",
  }));
  assert.equal(customNormal.defaultRating, 925);
  assert.equal(customNormal.defaultRatingDeviation, 240);
  assert.equal(customNormal.defaultVolatility, 0.05);
  const competitiveFlagProbe =
    "const {GOAT_ARENA_V2_CONFIG:c}=require('./services/goatArenaV2Config'); console.log(String(c.asyncCompetitive.enabled));";
  const defaultFlagEnv = { ...process.env };
  delete defaultFlagEnv.ARENA_COMPETITIVE_ENABLED;
  assert.equal(
    execFileSync(process.execPath, ["-e", competitiveFlagProbe], {
      cwd: path.resolve(__dirname, ".."),
      env: defaultFlagEnv,
      encoding: "utf8",
    }).trim(),
    "false",
    "경쟁전은 명시적으로 활성화하기 전까지 기본 비활성 상태여야 합니다."
  );
  assert.equal(normalizedPlayer({ rating: null }).rating, 1500);
  assert.equal(normalizedPlayer({ rating: "" }).rating, 1500);
  assert.equal(normalizedPlayer({ rating: 0 }).rating, 0, "a real zero rating is not an unset default");
  const configProbe = "const {GOAT_ARENA_V2_CONFIG:c}=require('./services/goatArenaV2Config'); const {normalizedPlayer}=require('./services/glicko2Service'); console.log(JSON.stringify({glicko:c.glicko2,rds:c.placement.ratingDeviationByAttemptCount,vols:c.placement.volatilityByAttemptCount,player:normalizedPlayer({rating:null})}));";
  const custom = JSON.parse(execFileSync(process.execPath, ["-e", configProbe], { cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ARENA_GLICKO_DEFAULT_RATING: "1600", ARENA_GLICKO_INITIAL_RD: "300",
      ARENA_GLICKO_DEFAULT_VOLATILITY: "0.08", ARENA_GLICKO_TAU: "0.7", ARENA_GLICKO_EPSILON: "0.00001",
      ARENA_GLICKO_PLACEMENT_RD_BY_COUNT: "300,220,180,150,130",
      ARENA_GLICKO_PLACEMENT_VOLATILITY_BY_COUNT: "0.12,0.10,0.08,0.07,0.05" }, encoding: "utf8" }));
  assert.equal(custom.player.rating, 1600); assert.equal(custom.player.ratingDeviation, 300);
  assert.equal(custom.player.volatility, 0.08); assert.equal(custom.glicko.systemConstant, 0.7);
  assert.equal(custom.glicko.convergenceTolerance, 0.00001);
  assert.deepEqual(custom.rds, [300, 220, 180, 150, 130]);
  assert.deepEqual(custom.vols, [0.12, 0.10, 0.08, 0.07, 0.05]);
  assert.throws(() => execFileSync(process.execPath, ["-e", configProbe], { cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ARENA_GLICKO_PLACEMENT_RD_BY_COUNT: "350,350,200,175,150" }, stdio: "pipe" }),
    /Command failed/);
  assert.equal(GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlDays, 3);
  assert.equal(GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlMs, 3 * 24 * 60 * 60 * 1000);
  assert.ok(
    GOAT_ARENA_V2_CONFIG.guestChallenge.minimumCompletionGraceMs > 5 * 10 * 60 * 1000
  );
  assert.ok(
    GOAT_ARENA_V2_CONFIG.guestChallenge.completionGraceMs >=
      GOAT_ARENA_V2_CONFIG.guestChallenge.minimumCompletionGraceMs
  );
  const guestConfigProbe = "const {GOAT_ARENA_V2_CONFIG:c}=require('./services/goatArenaV2Config'); console.log(JSON.stringify(c.guestChallenge));";
  assert.throws(() => execFileSync(process.execPath, ["-e", guestConfigProbe], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ARENA_GUEST_LINK_TTL_SECONDS: "1800" },
    stdio: "pipe",
  }), /Command failed/, "a runtime override cannot make the link expiry disagree with the three-day UI policy");
  assert.throws(() => execFileSync(process.execPath, ["-e", guestConfigProbe], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ARENA_GUEST_COMPLETION_GRACE_SECONDS: String(5 * 10 * 60) },
    stdio: "pipe",
  }), /Command failed/, "completion grace must include a submission window after five full question timers");
  const officialExample = updateGlicko2Player(
    { rating: 1500, ratingDeviation: 200, volatility: 0.06 },
    [
      { opponent: { rating: 1400, ratingDeviation: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, ratingDeviation: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, ratingDeviation: 300, volatility: 0.06 }, score: 0 },
    ]
  );
  assert.ok(Math.abs(officialExample.rating - 1464.06) < 0.02);
  assert.ok(Math.abs(officialExample.ratingDeviation - 151.52) < 0.02);
  assert.ok(Math.abs(officialExample.volatility - 0.059996) < 0.000002);

  const draw = updateHeadToHead(
    { rating: 1500, ratingDeviation: 80, volatility: 0.06 },
    { rating: 1500, ratingDeviation: 80, volatility: 0.06 },
    0.5
  );
  assert.ok(Math.abs(draw.left.rating - 1500) < 0.001);
  assert.ok(Math.abs(draw.right.rating - 1500) < 0.001);
  assert.throws(() => updateHeadToHead({}, {}, 0.25), /0, 0.5, 1/);
  const friendlyDifficulty = arenaV2DifficultyPlan({
    mode: "FRIENDLY",
    challengerProfile: { rating: 800 },
    defenderProfile: { rating: 1200 },
  });
  assert.equal(friendlyDifficulty.rating, 1000);
  assert.equal(friendlyDifficulty.tier, "GOLD");
  assert.equal(friendlyDifficulty.difficultyCode, "U3");
  assert.equal(friendlyDifficulty.policy, "MEAN_PARTICIPANT_MMR_V1");
  const friendlyHiddenDifficulty = arenaV2DifficultyPlan({
    mode: "FRIENDLY",
    challengerProfile: { normalMatchmakingRating: 900 },
    defenderProfile: { normalMatchmakingRating: 1100 },
  });
  assert.equal(friendlyHiddenDifficulty.rating, 1000);
  const friendlyDefaultDifficulty = arenaV2DifficultyPlan({
    mode: "FRIENDLY",
    challengerProfile: {},
    defenderProfile: {},
  });
  assert.equal(friendlyDefaultDifficulty.rating, 1000);
  const normalDifficulty = arenaV2DifficultyPlan({
    mode: "NORMAL",
    challengerProfile: { rating: 800 },
    defenderProfile: { rating: 1500 },
  });
  assert.equal(normalDifficulty.rating, 800);
  assert.equal(normalDifficulty.difficultyCode, "U2");
  const competitiveDifficulty = arenaV2DifficultyPlan({
    mode: "COMPETITIVE",
    challengerProfile: { rating: 800 },
    defenderProfile: { rating: 1500 },
  });
  assert.equal(competitiveDifficulty.rating, 800);
  assert.equal(competitiveDifficulty.difficultyCode, "R2");
  const unplacedDifficulty = arenaV2DifficultyPlan({
    mode: "NORMAL",
    challengerProfile: { rating: null, provisionalRating: null },
    defenderProfile: { rating: null, provisionalRating: null },
  });
  assert.equal(
    unplacedDifficulty.rating,
    GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating
  );
  assert.equal(unplacedDifficulty.difficultyCode, "U3");
  assert.equal(normalMatchmakingRating({ rating: 1700 }), 1000);
  assert.deepEqual(normalRatingSnapshot({ rating: 1700 }), {
    rating: 1000,
    ratingDeviation: 350,
    volatility: 0.06,
    tier: "GOLD",
  });
  const normalWinRating = updateNormalMatchmakingRating({
    before: normalRatingSnapshot({}),
    opponent: { rating: 1000, ratingDeviation: 350, volatility: 0.06 },
    winnerRole: "CHALLENGER",
  });
  const normalLossRating = updateNormalMatchmakingRating({
    before: normalRatingSnapshot({}),
    opponent: { rating: 1000, ratingDeviation: 350, volatility: 0.06 },
    winnerRole: "DEFENDER",
  });
  assert.ok(normalWinRating.rating > 1000);
  assert.ok(normalLossRating.rating < 1000);
  assert.equal(arenaV2DifficultyPlan({
    mode: "NORMAL",
    challengerProfile: normalLossRating,
    defenderProfile: normalLossRating,
  }).difficultyCode, "U2");
  const u3Questions = generateArenaPdfOneOnOneQuestions({
    difficultyCode: "U3",
    matchKey: "VERIFY-NORMAL-U3-PUBLISHED-ACCURACY",
  });
  assert.equal(normalSourceRates({ questions: u3Questions }).length, 5);
  const generatedPlan = friendlyDifficultyPlan({
    inviterTier: "SILVER",
    inviterDivision: "MAIN",
    inviteeTier: "CHALLENGER",
    inviteeDivision: "MAIN",
    difficultyAnchorTier: competitiveDifficulty.tier,
    difficultyDivision: competitiveDifficulty.division,
  });
  assert.equal(generatedPlan.anchorTier, "SILVER");
  assert.equal(generatedPlan.difficultyCode, "R2");

  assert.equal(
    winnerFromScores(
      { correctCount: 5, totalSolveTimeMs: 500000 },
      { correctCount: 4, totalSolveTimeMs: 100000 }
    ),
    "CHALLENGER"
  );
  assert.equal(
    winnerFromScores(
      { correctCount: 4, totalSolveTimeMs: 320000 },
      { correctCount: 4, totalSolveTimeMs: 360000 }
    ),
    "CHALLENGER"
  );
  assert.equal(
    winnerFromScores(
      { correctCount: 4, totalSolveTimeMs: 320000 },
      { correctCount: 4, totalSolveTimeMs: 320000 }
    ),
    null
  );
  assert.equal(
    winnerFromScores(
      { correctCount: 4, totalSolveTimeMs: null },
      { correctCount: 4, totalSolveTimeMs: 320000 }
    ),
    null
  );

  const attempts = Array.from({ length: 5 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    scorePercent: 50 + index,
    placementResult: { initialMmr: 1400 + index * 25, placementScore: 50 + index },
    submittedAt: new Date(2026, 0, index + 1),
  }));
  const onePlacement = placementEstimate(attempts.slice(0, 1));
  const fivePlacements = placementEstimate(attempts);
  assert.equal(onePlacement.samples.length, 1);
  assert.equal(fivePlacements.samples.length, 5);
  assert.ok(onePlacement.ratingDeviation > fivePlacements.ratingDeviation);
  assert.ok(onePlacement.volatility > fivePlacements.volatility);
  assert.equal(onePlacement.volatility, 0.10);
  assert.equal(fivePlacements.volatility, 0.06);
  assert.equal(fivePlacements.rating, 1450);

  const rawWin = updateGlicko2Player(
    { rating: 1500, ratingDeviation: 200, volatility: 0.08 },
    [{ opponent: { rating: 1500, ratingDeviation: 200, volatility: 0.06 }, score: 1 }]
  );
  const reversalProfile = {
    competitiveMatchesCompleted: 2,
    competitiveCurrentStreakType: "LOSS",
    competitiveCurrentStreakCount: 3,
  };
  const reversal = adaptiveRatingUpdate({
    before: { rating: 1500, ratingDeviation: 200, volatility: 0.08 },
    opponent: { rating: 1500, ratingDeviation: 200, volatility: 0.06 },
    winnerRole: "CHALLENGER",
    profile: reversalProfile,
    mode: "COMPETITIVE",
  });
  assert.ok(reversal.after.rating > 1500);
  assert.ok(reversal.after.rating < rawWin.rating);
  assert.equal(reversal.audit.reversalMultiplier, 0.7);
  assert.equal(reversalProfile.competitiveCurrentStreakType, "WIN");
  assert.equal(reversalProfile.competitiveCurrentStreakCount, 1);
  assert.ok(reversal.after.ratingDeviation < 200);
  assert.ok(Number.isFinite(reversal.after.volatility));

  const continuousProfile = {
    competitiveMatchesCompleted: 5,
    competitiveCurrentStreakType: "WIN",
    competitiveCurrentStreakCount: 1,
  };
  const continuous = adaptiveRatingUpdate({
    before: { rating: 1500, ratingDeviation: 180, volatility: 0.09 },
    opponent: { rating: 1500, ratingDeviation: 200, volatility: 0.06 },
    winnerRole: "CHALLENGER",
    profile: continuousProfile,
    mode: "COMPETITIVE",
  });
  assert.equal(continuous.audit.convergencePolicy, "GLICKO2_RD_CONTINUOUS_V1");
  assert.equal(continuous.audit.deltaMultiplier, 1);
  assert.equal(continuous.audit.stabilized, undefined);
  assert.equal(continuous.audit.stabilizationMultiplier, undefined);
  assert.ok(continuous.after.ratingDeviation < 180);
  assert.ok(Number.isFinite(continuous.after.volatility));

  assert.deepEqual(
    competitiveUnlockState({ normalMatchesCompleted: 2, placementFinalizedAt: new Date(), placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion }),
    {
      unlocked: false,
      normalMatchesCompleted: 2,
      requiredNormalMatches: 3,
      normalMatchesRemaining: 1,
      placementAttempts: 0,
      maximumPlacementAttempts: 5,
      placementFinalized: true,
    }
  );
  assert.equal(
    competitiveUnlockState({
      normalMatchesCompleted: 3,
      placementFinalizedAt: new Date(),
      placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
      placementSamples: [{}],
    }).unlocked,
    true
  );
  assert.equal(tierForRating(1500).name, GOAT_ARENA_V2_CONFIG.tiers.find((tier) => tier.minMmr <= 1500 && tier.maxMmr >= 1500).name);
  GOAT_ARENA_V2_CONFIG.tiers.forEach((tier, index, tiers) => {
    assert.equal(tierForRating(tier.minMmr).name, tier.name);
    if (index > 0) assert.equal(tierForRating(tier.minMmr - 0.01).name, tiers[index - 1].name);
    if (Number.isFinite(tier.maxMmr)) assert.equal(tierForRating(tier.maxMmr + 0.5).name, tier.name);
  });

  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  await Promise.all([
    new ArenaCompetitiveProfile({ userId: userA }).validate(),
    new ArenaMatchmakingEntry({
      userId: userA,
      activeKey: `ARENA2:${userA}`,
      mode: "COMPETITIVE",
      pool: "ALL",
      ratingSnapshot: 1500,
    }).validate(),
    new ArenaRatingSettlement({
      matchId,
      mode: "COMPETITIVE",
      outcome: "DRAW",
      challenger: {},
      defender: {},
    }).validate(),
    new ArenaFriendRequest({
      pairKey: `${userA}:${userB}`,
      requesterUserId: userA,
      recipientUserId: userB,
    }).validate(),
    new ArenaFriendship({
      pairKey: `${userA}:${userB}`,
      userLowId: userA,
      userHighId: userB,
      acceptedRequestId: new mongoose.Types.ObjectId(),
    }).validate(),
    new ArenaMatch({
      matchKey: `ARENA2:VERIFY:${matchId}`,
      arenaVersion: "2.0",
      gameMode: "NORMAL",
      division: "SUB",
      seasonKey: "2026-10",
      competitivePool: "ALL",
      matchType: "NORMAL",
      matchOrigin: "ARENA_2_MATCHMAKING",
      requestInitiatorUserId: userA,
      tierPairKey: "ARENA2_T1",
      tierPairLabel: "통합 수능 수학",
      challenger: { userId: userA },
      defender: { userId: userB },
      status: "READY",
      policyVersionCode: "GOAT_ARENA_2_0",
      problemPackVersion: "VERIFY-V1",
      scoringVersion: "ARENA2-SCORING-V1",
      timeLimitMs: 600000,
      startDeadlineAt: new Date(Date.now() + 60000),
    }).validate(),
  ]);

  const root = path.resolve(__dirname, "..");
  const protectedFiles = [
    "middleware/arenaEvidenceUpload.js",
    "middleware/uploadContentValidation.js",
    "services/arenaClientEvidenceReviewService.js",
    "public/js/goat-arena-match.js",
  ];
  for (const file of protectedFiles) {
    const baseline = execFileSync("git", ["show", `HEAD:${file}`], { cwd: root });
    assert.deepEqual(fs.readFileSync(path.join(root, file)), baseline, `${file} must remain unchanged`);
  }
  const inlineBoards = fs.readFileSync(
    path.join(root, "services/arenaInlineSolutionBoardService.js"),
    "utf8"
  );
  assert.match(inlineBoards, /submitArenaMatchEvidence\(/);
  assert.match(
    inlineBoards,
    /finalizeArenaMatchAfterEvidence\(\{\s*matchId,\s*userId,\s*evidenceResult: evidence,\s*now,?\s*\}\)/
  );
  const routes = fs.readFileSync(path.join(root, "routes/goat-arena-routes.js"), "utf8");
  const matchmaking = fs.readFileSync(path.join(root, "services/arenaV2MatchmakingService.js"), "utf8");
  assert.match(routes, /matchmaking\/:mode\/join/);
  assert.doesNotMatch(
    routes,
    /retiredArenaEconomyAction|rankings|main\/battle|main\/shop|payback-account|revenge/,
    "현재 Arena 라우터에는 사용하지 않는 경제·구형 경기 경로가 없어야 합니다."
  );
  assert.match(matchmaking, /pool:\s*"ALL"/);
  assert.doesNotMatch(matchmaking, /AccessCycle|ArenaLearningDayLedger|ArenaStanding/);
  assert.equal(GOAT_ARENA_V2_CONFIG.requiredNormalMatches, 3);
  assert.equal(GOAT_ARENA_V2_CONFIG.placement.maximumAttempts, 5);

  console.log("GOAT Arena 2.0 unit verification passed: Glicko-2, placement, unlock, scoring, MMR-based difficulty selection, schemas, and free single-pool wiring.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
