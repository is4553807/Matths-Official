const mongoose = require("mongoose");
const { AdminTodo } = require("../models/matthsModel");
const { ArenaCompetitiveProfile } = require("../models/goatArenaModel");
const {
  findBaseTier,
  placementReferenceForScore,
} = require("./mmrService");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { getArenaActivityLevel } = require("./arenaActivityLevelService");
const { placementBudget } = require("./arenaPlacementPolicyService");
const { initialCompetitiveScore } = require("./arenaCompetitivePointService");

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function tierForRating(rating) {
  const normalized = Math.max(0, Number(rating) || 0);
  // Legacy ranges have integer upper bounds (799, 924, ...). Glicko ratings
  // retain decimals, so use the existing lower bounds as continuous cutoffs
  // rather than letting values such as 799.5 fall through to Challenger.
  return [...GOAT_ARENA_V2_CONFIG.tiers].reverse()
    .find((tier) => normalized >= tier.minMmr) || findBaseTier(0);
}

function attemptRating(attempt) {
  const result = attempt?.placementResult || {};
  const stored = Number(result.initialMmr ?? result.initialRating);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const score = Number(result.placementScore ?? attempt?.scorePercent ?? 0);
  return Number(placementReferenceForScore(score).initialMmr);
}

function placementEstimate(attempts = []) {
  const maximum = GOAT_ARENA_V2_CONFIG.placement.maximumAttempts;
  const samples = attempts.slice(0, maximum).map((attempt) => ({
    attemptId: attempt._id,
    score: Math.max(
      0,
      Math.min(100, Number(attempt?.placementResult?.placementScore ?? attempt.scorePercent) || 0)
    ),
    estimatedRating: attemptRating(attempt),
    completedAt: attempt.submittedAt || attempt.updatedAt || new Date(),
  }));
  if (!samples.length) {
    return {
      samples,
      rating: null,
      ratingDeviation: null,
      volatility: null,
      tier: "UNPLACED",
    };
  }
  const rating = samples.reduce((sum, sample) => sum + sample.estimatedRating, 0) /
    samples.length;
  const ratingDeviation =
    GOAT_ARENA_V2_CONFIG.placement.ratingDeviationByAttemptCount[
      samples.length - 1
    ];
  const volatility =
    GOAT_ARENA_V2_CONFIG.placement.volatilityByAttemptCount[
      samples.length - 1
    ];
  return {
    samples,
    rating: round(rating),
    ratingDeviation: round(ratingDeviation),
    volatility,
    tier: tierForRating(rating).name,
  };
}

async function completedPlacementAttempts(userId, session = null) {
  return (await placementBudget(userId, { session })).validAttempts
    .slice(0, GOAT_ARENA_V2_CONFIG.placement.maximumAttempts);
}

async function ensureArenaV2Profile(userId, { session = null } = {}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(400, "Arena 프로필 사용자를 확인해주세요.", "INVALID_ARENA_USER");
  }
  const existingQuery = ArenaCompetitiveProfile.findOne({ userId });
  const existing = session ? await existingQuery.session(session) : await existingQuery;
  if (existing) return existing;

  // 기존 Arena 활동 레벨은 정상 종료 경기 수로 계산됐다. 2.0 프로필을
  // 처음 만들 때 그 누적치를 XP 기준선으로 가져와 기존 레벨을 보존한다.
  const currentActivity = await getArenaActivityLevel(userId);
  const options = {
    upsert: true,
    returnDocument: "after",
    setDefaultsOnInsert: true,
    ...(session ? { session } : {}),
  };
  return ArenaCompetitiveProfile.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        rulesetVersion: GOAT_ARENA_V2_CONFIG.rulesetVersion,
        accountXp: currentActivity.totalMatches,
        accountLevel: currentActivity.level,
        normalMatchesCompleted: 0,
        normalMatchmakingRating: GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating,
        normalMatchmakingRatingDeviation:
          GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRatingDeviation,
        normalMatchmakingVolatility:
          GOAT_ARENA_V2_CONFIG.asyncNormal.defaultVolatility,
      },
    },
    options
  );
}

async function syncArenaV2PlacementProfile(userId, { session = null } = {}) {
  const profile = await ensureArenaV2Profile(userId, { session });
  const budget = await placementBudget(userId, { session });
  const estimate = placementEstimate(budget.validAttempts);
  profile.placementSamples = estimate.samples;
  profile.placementAttemptsUsed = Math.min(
    GOAT_ARENA_V2_CONFIG.placement.maximumAttempts,
    Math.max(0, Number(budget.attemptsUsed) || 0)
  );
  profile.provisionalRating = estimate.rating;
  profile.provisionalRatingDeviation = estimate.ratingDeviation;
  profile.provisionalVolatility = estimate.volatility;
  profile.provisionalTier = estimate.tier;

  // Abandoned or disqualified attempts consume one of the five slots but do not
  // become rating samples. Once all slots are used, finalize from the valid
  // samples that remain so a single invalid attempt cannot leave the account in
  // an unfinishable placement state. At least one valid sample is still required.
  const reachedMaximum =
    profile.placementAttemptsUsed >= GOAT_ARENA_V2_CONFIG.placement.maximumAttempts &&
    estimate.samples.length >= GOAT_ARENA_V2_CONFIG.placement.minimumAttempts;
  await profile.save(session ? { session } : undefined);
  if (budget.reviewRequired) {
    await AdminTodo.findOneAndUpdate({ sourceType: "ArenaPlacementExhausted", sourceId: profile._id },
      { $setOnInsert: { category: "other", title: "배치고사 기회 소진: 운영자 검토 필요",
        description: "유효 결과 없이 다섯 기회를 소진했습니다. 검토 근거를 기록한 승인 초기화만 허용됩니다.",
        targetUserId: userId, sourceType: "ArenaPlacementExhausted", sourceId: profile._id,
        href: "/admin/todos" }, $set: { status: "pending", completedAt: null, completedBy: null } }, { upsert: true, ...(session ? { session } : {}) });
  }
  const initializedAt = profile.placementFinalizedAt || (reachedMaximum ? new Date() : null);
  if (initializedAt && estimate.rating !== null && !profile.ratingInitializedAt) {
    // Initialize only once, even if dashboard reads and finalization race with
    // the first competitive settlement. Never restore the placement rating
    // over a rating that has already been updated by a match.
    const initialized = await ArenaCompetitiveProfile.findOneAndUpdate(
      { _id: profile._id, ratingInitializedAt: null },
      { $set: {
        placementFinalizedAt: initializedAt,
        placementFinalizedReason: profile.placementFinalizedReason || "MAX_ATTEMPTS",
        rating: estimate.rating,
        ratingDeviation: estimate.ratingDeviation,
        volatility: estimate.volatility,
        competitiveScore: initialCompetitiveScore(estimate.rating),
        scoreInitializedAt: initializedAt,
        lastScoreDelta: 0,
        lastScoreChangedAt: initializedAt,
        tier: tierForRating(initialCompetitiveScore(estimate.rating)).name,
        ratingInitializedAt: initializedAt,
        placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
      } },
      { returnDocument: "after", runValidators: true, ...(session ? { session } : {}) }
    );
    if (initialized) return initialized;
    const latest = ArenaCompetitiveProfile.findById(profile._id);
    return session ? latest.session(session) : latest;
  }
  return profile;
}

async function finalizeArenaV2Placement(userId, { now = new Date() } = {}) {
  const profile = await syncArenaV2PlacementProfile(userId);
  const count = profile.placementSamples.length;
  if (profile.placementFinalizedAt) {
    if (profile.placementProcessVersion !== GOAT_ARENA_V2_CONFIG.placement.processVersion) {
      throw statusError(409, "현재 배치 규칙에 맞는 새 배치고사를 완료해주세요.", "PLACEMENT_PROCESS_VERSION_MISMATCH");
    }
    return profile;
  }
  if (count < GOAT_ARENA_V2_CONFIG.placement.minimumAttempts) {
    throw statusError(
      409,
      "배치고사를 한 번 이상 완료한 뒤 초기 티어를 확정할 수 있습니다.",
      "PLACEMENT_ATTEMPT_REQUIRED"
    );
  }
  const activeAttempt = (await placementBudget(userId)).activeAttempt;
  if (activeAttempt) {
    throw statusError(
      409,
      "진행 중인 배치고사를 먼저 완료해주세요.",
      "PLACEMENT_ATTEMPT_IN_PROGRESS"
    );
  }
  const finalized = await ArenaCompetitiveProfile.findOneAndUpdate(
    { _id: profile._id, placementFinalizedAt: null, ratingInitializedAt: null },
    { $set: {
      placementFinalizedAt: new Date(now),
      placementFinalizedReason: "EARLY",
      rating: profile.provisionalRating,
      ratingDeviation: profile.provisionalRatingDeviation,
      volatility:
        profile.provisionalVolatility ||
        GOAT_ARENA_V2_CONFIG.placement.volatilityByAttemptCount[
          Math.max(0, count - 1)
        ],
      competitiveScore: initialCompetitiveScore(profile.provisionalRating),
      scoreInitializedAt: new Date(now),
      lastScoreDelta: 0,
      lastScoreChangedAt: new Date(now),
      tier: tierForRating(initialCompetitiveScore(profile.provisionalRating)).name,
      ratingInitializedAt: new Date(now),
      placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
    } },
    { returnDocument: "after", runValidators: true }
  );
  return finalized || ArenaCompetitiveProfile.findById(profile._id);
}

function competitiveUnlockState(profile) {
  const normalMatchesCompleted = Math.max(
    0,
    Number(profile?.normalMatchesCompleted) || 0
  );
  const placementAttempts = Array.isArray(profile?.placementSamples)
    ? profile.placementSamples.length
    : 0;
  const placementFinalized = Boolean(profile?.placementFinalizedAt) &&
    profile?.placementProcessVersion === GOAT_ARENA_V2_CONFIG.placement.processVersion;
  const requiredNormalMatches = GOAT_ARENA_V2_CONFIG.requiredNormalMatches;
  return {
    unlocked:
      normalMatchesCompleted >= requiredNormalMatches && placementFinalized,
    normalMatchesCompleted,
    requiredNormalMatches,
    normalMatchesRemaining: Math.max(
      0,
      requiredNormalMatches - normalMatchesCompleted
    ),
    placementAttempts,
    maximumPlacementAttempts: GOAT_ARENA_V2_CONFIG.placement.maximumAttempts,
    placementFinalized,
  };
}

async function assertArenaV2PlacementStartEligibility(
  userId,
  { session = null } = {}
) {
  const profile = await ensureArenaV2Profile(userId, { session });
  const unlock = competitiveUnlockState(profile);
  if (unlock.normalMatchesRemaining > 0) {
    throw statusError(
      403,
      `배치고사는 유효한 일반전 ${unlock.requiredNormalMatches}경기를 완료한 뒤 시작할 수 있습니다.`,
      "PLACEMENT_NORMAL_MATCHES_REQUIRED"
    );
  }
  return unlock;
}

function profileView(profile) {
  const unlock = competitiveUnlockState(profile);
  const provisionalTier =
    profile?.provisionalTier && profile.provisionalTier !== "UNPLACED"
      ? tierForRating(profile.provisionalRating)
      : null;
  const currentTier =
    unlock.placementFinalized && profile?.tier && profile.tier !== "UNPLACED"
      ? tierForRating(profile.competitiveScore ?? profile.rating)
      : null;
  return {
    id: profile?._id ? String(profile._id) : null,
    ...unlock,
    canTakePlacement:
      unlock.normalMatchesRemaining === 0 &&
      !unlock.placementFinalized &&
      !profile?.ratingInitializedAt &&
      Number(profile?.placementAttemptsUsed || 0) < unlock.maximumPlacementAttempts,
    placementReviewRequired: !unlock.placementFinalized &&
      Number(profile?.placementAttemptsUsed || 0) >= unlock.maximumPlacementAttempts && unlock.placementAttempts === 0,
    placementAttemptsUsed: Number(profile?.placementAttemptsUsed) || 0,
    provisionalTier: provisionalTier?.name || "UNPLACED",
    provisionalTierLabel: provisionalTier?.label || "미배치",
    competitiveScore:
      profile?.competitiveScore === null || profile?.competitiveScore === undefined
        ? null
        : Math.round(Number(profile.competitiveScore)),
    tier: currentTier?.name || "UNPLACED",
    tierLabel: currentTier?.label || "미배치",
    accountXp: Number(profile?.accountXp) || 0,
    accountLevel: Number(profile?.accountLevel) || 1,
    competitiveMatchesCompleted: Number(profile?.competitiveMatchesCompleted) || 0,
    wins: Number(profile?.wins) || 0,
    losses: Number(profile?.losses) || 0,
    draws: Number(profile?.draws) || 0,
    solutionSharingConsentVersion:
      profile?.competitiveSolutionSharingConsentVersion || null,
    solutionSharingConsentRequired:
      profile?.competitiveSolutionSharingConsentVersion !==
      GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion,
  };
}

module.exports = {
  assertArenaV2PlacementStartEligibility,
  competitiveUnlockState,
  completedPlacementAttempts,
  ensureArenaV2Profile,
  finalizeArenaV2Placement,
  placementEstimate,
  profileView,
  syncArenaV2PlacementProfile,
  tierForRating,
};
