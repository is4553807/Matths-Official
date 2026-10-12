const { TIER_CONFIG } = require("./mmrService");

function finiteNumber(value, fallback, { minimum = -Infinity } = {}) {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Invalid Arena numeric setting: expected a finite number >= ${minimum}.`);
  }
  return parsed;
}

function boundedNumber(value, fallback, { minimum, maximum, name }) {
  const parsed = value == null || String(value).trim() === ""
    ? fallback
    : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function positiveInteger(value, fallback, name) {
  const parsed = value == null || String(value).trim() === ""
    ? fallback
    : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function fixedProductSeconds(value, expected, name) {
  if (value == null || String(value).trim() === "") return expected;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed !== expected) {
    throw new Error(`${name} is fixed at ${expected} seconds by the current product policy.`);
  }
  return parsed;
}

function boundedProductSeconds(value, fallback, { minimum, name }) {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${name} must be at least ${minimum} seconds.`);
  }
  return parsed;
}

function numberList(value, fallback) {
  if (!String(value || "").trim()) return fallback;
  const parsed = String(value)
    .split(",")
    .map((entry) => Number(entry.trim()));
  if (parsed.length !== fallback.length || parsed.some((entry, index) =>
    !Number.isFinite(entry) || entry < 1 || (index > 0 && entry >= parsed[index - 1])
  )) {
    throw new Error("ARENA_GLICKO_PLACEMENT_RD_BY_COUNT must contain five positive, strictly decreasing RD values.");
  }
  return parsed;
}

function decreasingPositiveNumberList(value, fallback, name) {
  if (!String(value || "").trim()) return fallback;
  const parsed = String(value)
    .split(",")
    .map((entry) => Number(entry.trim()));
  if (parsed.length !== fallback.length || parsed.some((entry, index) =>
    !Number.isFinite(entry) || entry <= 0 || (index > 0 && entry >= parsed[index - 1])
  )) {
    throw new Error(`${name} must contain five positive, strictly decreasing values.`);
  }
  return parsed;
}

function matchmakingWindows(value) {
  const parsed = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [afterSeconds, ratingGap] = entry.split(":").map(Number);
      return { afterSeconds, ratingGap };
    })
    .filter(
      (entry) =>
        Number.isFinite(entry.afterSeconds) &&
        entry.afterSeconds >= 0 &&
        Number.isFinite(entry.ratingGap) &&
        entry.ratingGap > 0
    )
    .sort((left, right) => left.afterSeconds - right.afterSeconds);

  return parsed.length
    ? parsed
    : [
        { afterSeconds: 0, ratingGap: 100 },
        { afterSeconds: 30, ratingGap: 150 },
        { afterSeconds: 60, ratingGap: 200 },
        { afterSeconds: 120, ratingGap: 300 },
      ];
}

const maximumPlacementAttempts = 5;
const initialRatingDeviation = finiteNumber(
  process.env.ARENA_GLICKO_INITIAL_RD,
  350,
  { minimum: 1 }
);
const configuredPlacementRds = numberList(
  process.env.ARENA_GLICKO_PLACEMENT_RD_BY_COUNT,
  // Initial configurable hypothesis, not a calibrated production RD curve.
  Array.from(
    { length: maximumPlacementAttempts },
    (_unused, index) => initialRatingDeviation / Math.sqrt(index + 1)
  )
);
const configuredPlacementVolatilities = decreasingPositiveNumberList(
  process.env.ARENA_GLICKO_PLACEMENT_VOLATILITY_BY_COUNT,
  // Fewer placement samples deliberately retain more uncertainty. These are
  // configurable launch hypotheses and must be validated by simulation.
  [0.10, 0.09, 0.08, 0.07, 0.06],
  "ARENA_GLICKO_PLACEMENT_VOLATILITY_BY_COUNT"
);

const guestChallengeLinkTtlDays = 3;
const guestChallengeLinkTtlSeconds = guestChallengeLinkTtlDays * 24 * 60 * 60;
const guestChallengeQuestionCount = 5;
const guestChallengeQuestionTimeLimitSeconds = 10 * 60;
// A final submission needs its own bounded window after all five ten-minute
// question windows. The current upload contract allows at least one minute.
const guestChallengeSubmissionBufferSeconds = 60;
const guestChallengeMinimumCompletionGraceSeconds =
  guestChallengeQuestionCount * guestChallengeQuestionTimeLimitSeconds +
  guestChallengeSubmissionBufferSeconds;

const GOAT_ARENA_V2_CONFIG = Object.freeze({
  rulesetVersion: "GOAT_ARENA_2_2",
  requiredNormalMatches: 3,
  placement: Object.freeze({
    processVersion: "ARENA2_PLACEMENT_UNCERTAINTY_V2",
    minimumAttempts: 1,
    maximumAttempts: maximumPlacementAttempts,
    ratingDeviationByAttemptCount: Object.freeze(
      Array.from(
        { length: maximumPlacementAttempts },
        (_unused, index) =>
          finiteNumber(
            configuredPlacementRds[index],
            initialRatingDeviation / Math.sqrt(index + 1),
            { minimum: 1 }
          )
      )
    ),
    volatilityByAttemptCount: Object.freeze(
      configuredPlacementVolatilities.map((value) =>
        finiteNumber(value, 0.06, { minimum: Number.EPSILON })
      )
    ),
  }),
  glicko2: Object.freeze({
    systemConstant: finiteNumber(process.env.ARENA_GLICKO_TAU, 0.5, {
      minimum: 0.01,
    }),
    convergenceTolerance: finiteNumber(
      process.env.ARENA_GLICKO_EPSILON,
      0.000001,
      { minimum: Number.EPSILON }
    ),
    scale: 173.7178,
    defaultRating: finiteNumber(process.env.ARENA_GLICKO_DEFAULT_RATING, 1500, {
      minimum: 0,
    }),
    defaultRatingDeviation: initialRatingDeviation,
    defaultVolatility: finiteNumber(
      process.env.ARENA_GLICKO_DEFAULT_VOLATILITY,
      0.06,
      { minimum: Number.EPSILON }
    ),
  }),
  matchmaking: Object.freeze({
    windows: Object.freeze(matchmakingWindows(process.env.ARENA_MATCHMAKING_WINDOWS)),
    entryTtlMs:
      finiteNumber(process.env.ARENA_MATCHMAKING_ENTRY_TTL_SECONDS, 600, {
        minimum: 30,
      }) * 1000,
    recentOpponentWindowMs:
      finiteNumber(process.env.ARENA_RECENT_OPPONENT_WINDOW_SECONDS, 3600, {
        minimum: 0,
      }) * 1000,
  }),
  asyncCompetitive: Object.freeze({
    enabled: String(process.env.ARENA_COMPETITIVE_ENABLED || "false").toLowerCase() === "true",
    solutionSharingConsentVersion: "ARENA21_SOLUTION_SHARE_V1",
    closeScoreThreshold: finiteNumber(
      process.env.ARENA_ASYNC_CLOSE_SCORE_THRESHOLD,
      0.1,
      { minimum: 0 }
    ),
    reservationTtlMs: finiteNumber(
      process.env.ARENA_ASYNC_RECORD_RESERVATION_SECONDS,
      15 * 60,
      { minimum: 60 }
    ) * 1000,
  }),
  asyncNormal: Object.freeze({
    // General-play skill is intentionally separate from the public competitive
    // rating. It only selects the next opponent record and U1-U9 difficulty.
    defaultRating: finiteNumber(
      process.env.ARENA_NORMAL_HIDDEN_MMR_DEFAULT,
      1000,
      { minimum: 0 }
    ),
    defaultRatingDeviation: finiteNumber(
      process.env.ARENA_NORMAL_HIDDEN_RD_DEFAULT,
      initialRatingDeviation,
      { minimum: 1 }
    ),
    defaultVolatility: finiteNumber(
      process.env.ARENA_NORMAL_HIDDEN_VOLATILITY_DEFAULT,
      0.06,
      { minimum: Number.EPSILON }
    ),
    baselineRatingDeviation: finiteNumber(
      process.env.ARENA_NORMAL_BASELINE_RD,
      configuredPlacementRds[maximumPlacementAttempts - 1],
      { minimum: 1 }
    ),
    baselineVolatility: finiteNumber(
      process.env.ARENA_NORMAL_BASELINE_VOLATILITY,
      0.06,
      { minimum: Number.EPSILON }
    ),
    // Shared by normal and competitive play, including result-only exposure.
    // The user-approved ten-match policy cannot be shortened by an old env.
    questionRepeatWindowMatches: 10,
    reservationTtlMs: finiteNumber(
      process.env.ARENA_NORMAL_RECORD_RESERVATION_SECONDS,
      15 * 60,
      { minimum: 60 }
    ) * 1000,
    closeScoreThreshold: finiteNumber(
      process.env.ARENA_ASYNC_NORMAL_CLOSE_SCORE_THRESHOLD,
      0.1,
      { minimum: 0 }
    ),
  }),
  adaptiveRating: Object.freeze({
    // Glicko-2 RD now controls convergence continuously. There is no abrupt
    // multiplier boundary between the fifth and sixth rated match.
    reversalMinimumStreak: positiveInteger(
      process.env.ARENA_RATING_REVERSAL_MINIMUM_STREAK,
      2,
      "ARENA_RATING_REVERSAL_MINIMUM_STREAK"
    ),
    reversalDeltaStep: boundedNumber(
      process.env.ARENA_RATING_REVERSAL_DELTA_STEP,
      0.15,
      {
        minimum: 0,
        maximum: 1,
        name: "ARENA_RATING_REVERSAL_DELTA_STEP",
      }
    ),
    reversalMinimumMultiplier: boundedNumber(
      process.env.ARENA_RATING_REVERSAL_MINIMUM_MULTIPLIER,
      0.55,
      {
        minimum: Number.EPSILON,
        maximum: 1,
        name: "ARENA_RATING_REVERSAL_MINIMUM_MULTIPLIER",
      }
    ),
  }),
  competitiveScore: Object.freeze({
    // Public competitive points are deliberately separate from internal MMR.
    // These are configurable launch hypotheses and remain visible to operators.
    kFactor: finiteNumber(process.env.ARENA_COMPETITIVE_SCORE_K_FACTOR, 32, {
      minimum: 1,
    }),
    ratingScale: finiteNumber(
      process.env.ARENA_COMPETITIVE_SCORE_RATING_SCALE,
      400,
      { minimum: 1 }
    ),
    minimumScore: finiteNumber(
      process.env.ARENA_COMPETITIVE_SCORE_MINIMUM,
      0,
      { minimum: 0 }
    ),
    driftWarningAverage: finiteNumber(
      process.env.ARENA_ONE_SIDED_MMR_DRIFT_WARNING_AVERAGE,
      2,
      { minimum: 0 }
    ),
  }),
  guestChallenge: Object.freeze({
    linkTtlDays: guestChallengeLinkTtlDays,
    linkTtlMs: fixedProductSeconds(
      process.env.ARENA_GUEST_LINK_TTL_SECONDS,
      guestChallengeLinkTtlSeconds,
      "ARENA_GUEST_LINK_TTL_SECONDS"
    ) * 1000,
    completionGraceMs: boundedProductSeconds(
      process.env.ARENA_GUEST_COMPLETION_GRACE_SECONDS,
      75 * 60,
      {
        minimum: guestChallengeMinimumCompletionGraceSeconds,
        name: "ARENA_GUEST_COMPLETION_GRACE_SECONDS",
      }
    ) * 1000,
    minimumCompletionGraceMs: guestChallengeMinimumCompletionGraceSeconds * 1000,
    participantLimit: null,
    leaderboardAttemptPolicy: "ONE_ATTEMPT_PER_NICKNAME_BIRTHDATE",
    unlimitedRetries: false,
  }),
  progression: Object.freeze({
    // 기존 활동 레벨이 정상 완료 경기 수를 사용하므로 1경기를 1 XP로 옮긴다.
    xpPerValidMatch: finiteNumber(process.env.ARENA_XP_PER_VALID_MATCH, 1, {
      minimum: 0,
    }),
  }),
  friends: Object.freeze({
    invitationTtlMs:
      finiteNumber(process.env.ARENA_FRIEND_INVITATION_TTL_SECONDS, 86400, {
        minimum: 60,
      }) * 1000,
    onlineWindowMs:
      finiteNumber(process.env.ARENA_ONLINE_WINDOW_SECONDS, 180, {
        minimum: 30,
      }) * 1000,
  }),
  tiers: Object.freeze(
    (Array.isArray(TIER_CONFIG) ? TIER_CONFIG : []).map((tier) =>
      Object.freeze({ ...tier })
    )
  ),
});

module.exports = {
  GOAT_ARENA_V2_CONFIG,
  matchmakingWindows,
};
