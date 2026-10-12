const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedPlayer(player = {}) {
  const config = GOAT_ARENA_V2_CONFIG.glicko2;
  return {
    rating: Math.max(0, player.rating != null && player.rating !== "" && Number.isFinite(Number(player.rating))
      ? Number(player.rating)
      : config.defaultRating),
    ratingDeviation: positiveNumber(
      player.ratingDeviation,
      config.defaultRatingDeviation
    ),
    volatility: positiveNumber(player.volatility, config.defaultVolatility),
  };
}

function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectation(mu, opponentMu, opponentPhi) {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

function nextVolatility({ phi, volatility, variance, delta, tau, epsilon }) {
  const a = Math.log(volatility * volatility);
  const f = (x) => {
    const exponential = Math.exp(x);
    const numerator = exponential * (delta * delta - phi * phi - variance - exponential);
    const denominator = 2 * Math.pow(phi * phi + variance + exponential, 2);
    return numerator / denominator - (x - a) / (tau * tau);
  };

  let lower = a;
  let upper;
  if (delta * delta > phi * phi + variance) {
    upper = Math.log(delta * delta - phi * phi - variance);
  } else {
    let step = 1;
    while (f(a - step * tau) < 0) step += 1;
    upper = a - step * tau;
  }

  let lowerValue = f(lower);
  let upperValue = f(upper);
  while (Math.abs(upper - lower) > epsilon) {
    const candidate = lower + ((lower - upper) * lowerValue) / (upperValue - lowerValue);
    const candidateValue = f(candidate);
    if (candidateValue * upperValue <= 0) {
      lower = upper;
      lowerValue = upperValue;
    } else {
      lowerValue /= 2;
    }
    upper = candidate;
    upperValue = candidateValue;
  }
  return Math.exp(lower / 2);
}

function updateGlicko2Player(player, results = [], options = {}) {
  const config = {
    ...GOAT_ARENA_V2_CONFIG.glicko2,
    ...options,
  };
  const current = normalizedPlayer(player);
  const mu = (current.rating - 1500) / config.scale;
  const phi = current.ratingDeviation / config.scale;
  const normalizedResults = (Array.isArray(results) ? results : [])
    .map((result) => ({
      opponent: normalizedPlayer(result.opponent),
      score: Number(result.score),
    }))
    // Head-to-head matches pass 0/0.5/1. A weekly mock uses its normalized
    // performance on the same mathematically valid [0, 1] score interval.
    .filter((result) => Number.isFinite(result.score) && result.score >= 0 && result.score <= 1);

  if (!normalizedResults.length) {
    return {
      ...current,
      ratingDeviation:
        Math.sqrt(phi * phi + current.volatility * current.volatility) * config.scale,
    };
  }

  const observations = normalizedResults.map(({ opponent, score }) => {
    const opponentMu = (opponent.rating - 1500) / config.scale;
    const opponentPhi = opponent.ratingDeviation / config.scale;
    const expected = expectation(mu, opponentMu, opponentPhi);
    return { score, expected, weight: g(opponentPhi) };
  });
  const variance = 1 / observations.reduce(
    (sum, result) =>
      sum + result.weight * result.weight * result.expected * (1 - result.expected),
    0
  );
  const delta = variance * observations.reduce(
    (sum, result) => sum + result.weight * (result.score - result.expected),
    0
  );
  const volatility = nextVolatility({
    phi,
    volatility: current.volatility,
    variance,
    delta,
    tau: config.systemConstant,
    epsilon: config.convergenceTolerance,
  });
  const preRatingPhi = Math.sqrt(phi * phi + volatility * volatility);
  const nextPhi = 1 / Math.sqrt(1 / (preRatingPhi * preRatingPhi) + 1 / variance);
  const nextMu = mu + nextPhi * nextPhi * observations.reduce(
    (sum, result) => sum + result.weight * (result.score - result.expected),
    0
  );

  return {
    rating: Math.max(0, 1500 + config.scale * nextMu),
    ratingDeviation: config.scale * nextPhi,
    volatility,
  };
}

function updateHeadToHead(left, right, leftScore, options = {}) {
  const normalizedScore = Number(leftScore);
  if (![0, 0.5, 1].includes(normalizedScore)) {
    throw new TypeError("Glicko-2 경기 결과는 0, 0.5, 1 중 하나여야 합니다.");
  }
  const leftBefore = normalizedPlayer(left);
  const rightBefore = normalizedPlayer(right);
  return {
    left: updateGlicko2Player(
      leftBefore,
      [{ opponent: rightBefore, score: normalizedScore }],
      options
    ),
    right: updateGlicko2Player(
      rightBefore,
      [{ opponent: leftBefore, score: 1 - normalizedScore }],
      options
    ),
  };
}

module.exports = {
  expectation,
  g,
  normalizedPlayer,
  updateGlicko2Player,
  updateHeadToHead,
};
