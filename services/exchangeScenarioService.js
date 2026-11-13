const { createHash } = require("node:crypto");
const { bucketStart, candleWindow, intervalFor, pushPrice } = require("./exchangeChartService");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ROUND_HOURS = 141;
const ORDER_LIFETIME = 6 * HOUR;
const MAX_MAKER_POSITION = 8;
const recentRounds = new Map();

function eligibleRound(market) {
  if (market.type !== "weekly" || +market.closeAt - +market.opensAt !== ROUND_HOURS * HOUR) return false;
  const opens = new Date(market.opensAt);
  return opens.getUTCDay() === 0 && opens.getUTCHours() === 6 && +opens % HOUR === 0;
}

function newParticipant(key, opensAt, hour) {
  const seed = createHash("sha256").update(`matths-scenario-v1:${key}:${hour}`).digest();
  const hourStart = +opensAt + hour * HOUR;
  const submittedAt = hourStart + (2 + seed[0] % 40) * MINUTE;
  const orderAt = submittedAt + (3 + seed[1] % 15) * MINUTE;
  const score = 34 + (seed[2] % 29) + (seed[3] % 29);
  const outlook = seed[4] % 241 - 120;
  const urgency = seed[5] % 49;
  return { submittedAt, orderAt, score, outlook, urgency };
}

function matchOrder(round, participant) {
  const { orderAt, score, outlook, urgency } = participant;
  round.orders = round.orders.filter((row) => row.expiresAt > orderAt);
  const mpi = round.samples.at(-1).mpi;
  const opinion = Math.round(0.55 * mpi + 4.5 * score + outlook);
  const side = opinion >= mpi ? "buy" : "sell";
  const buy = side === "buy";
  const limit = Math.max(1, Math.min(999, opinion + (buy ? urgency : -urgency)));
  const order = { side, price: limit, expiresAt: orderAt + ORDER_LIFETIME };

  const center = Math.round(mpi - 4 * round.makerPosition);
  const spread = Math.max(9, Math.ceil(40 / Math.sqrt(round.samples.length)));
  const quote = Math.max(1, Math.min(999, center + (buy ? spread : -spread)));
  const executable = (price) => buy ? price <= limit : price >= limit;
  const pricePriority = buy ? 1 : -1;
  const resting = round.orders.filter((row) => row.side !== side && executable(row.price))
    .sort((a, b) => pricePriority * (a.price - b.price))[0];
  const makerPosition = round.makerPosition + (buy ? -1 : 1);
  const canUseMaker = Math.abs(makerPosition) <= MAX_MAKER_POSITION && executable(quote);

  let price;
  if (resting && (!canUseMaker || pricePriority * (resting.price - quote) <= 0)) {
    price = resting.price;
    round.orders = round.orders.filter((row) => row !== resting);
  } else if (canUseMaker) {
    price = quote;
    round.makerPosition = makerPosition;
  } else {
    round.orders.push(order);
    return;
  }
  round.trades.push({ at: orderAt, price, quantity: 1, direction: buy ? "LONG" : "SHORT" });
}

function advance(round, market, now) {
  while (round.hour < ROUND_HOURS) {
    const participant = round.pending ?? newParticipant(round.key, market.opensAt, round.hour);
    if (participant.submittedAt > now) break;
    if (!round.pending) {
      round.totalScore += participant.score;
      const populationCount = round.hour + 1;
      const mpi = Math.round(round.totalScore * 1000 / populationCount) / 100;
      round.samples.push({ at: participant.submittedAt, mpi, populationCount });
      round.pending = participant;
    }
    if (participant.orderAt > now) break;
    matchOrder(round, participant);
    round.pending = null;
    round.hour += 1;
  }
}

function stateFor(market, now) {
  if (!eligibleRound(market)) return null;
  const key = `${market._id ?? market.id}:${+market.opensAt}`;
  const time = Math.min(+now, +market.closeAt - 1);
  let round = recentRounds.get(key);
  if (!round || time < round.through) {
    round = { key, hour: 0, totalScore: 0, makerPosition: 0, pending: null, samples: [], trades: [], orders: [] };
  }
  advance(round, market, time);
  round.through = time;
  recentRounds.delete(key);
  recentRounds.set(key, round);
  if (recentRounds.size > 24) recentRounds.delete(recentRounds.keys().next().value);
  return round;
}

function chartRows(rows, priceOf, ms, before, showVolume) {
  const priorTo = before ? bucketStart(before, ms) : Infinity;
  const visible = rows.filter((row) => row.at < priorTo);
  const latest = visible.at(-1);
  if (!latest) return [];
  const from = candleWindow(latest.at, ms);
  const candles = [];
  for (const row of visible) {
    if (row.at < from) continue;
    pushPrice(candles, row.at, priceOf(row), ms);
    if (showVolume) {
      const candle = candles.at(-1);
      candle.volume = (candle.volume ?? 0) + row.quantity;
    }
  }
  return candles;
}

function scenarioState(market, { interval, chart, before, now = new Date() } = {}) {
  const round = stateFor(market, now);
  if (!round) return null;
  const { ms, code } = intervalFor(interval, "1h");
  const latestMpi = round.samples.at(-1) ?? null;
  const latestTrade = round.trades.at(-1) ?? null;
  const candles = chart === "futures"
    ? chartRows(round.trades, (row) => row.price, ms, before, true)
    : chartRows(round.samples, (row) => row.mpi, ms, before, false);
  return { source: "simulation", marketId: String(market._id ?? market.id), interval: code, latestMpi, latestTrade,
    volume: round.trades.length, trades: round.trades.slice(-5).reverse(), candles };
}

module.exports = { scenarioState, advanceExchangeScenario: stateFor };
