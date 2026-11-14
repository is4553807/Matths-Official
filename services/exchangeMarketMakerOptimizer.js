const { TP_SCALE } = require("./exchangeFees");

const MAX_PRICE = 1000;
const MAX_SETTLEMENT = MAX_PRICE * TP_SCALE;
const TAIL_PROBABILITY = 0.05;
const SPREAD_MULTIPLIERS = [1, 1.5, 2];
const INVENTORY_SLOPES = [0, 4, 8];
const SIDES = ["buy", "sell"];
const EPSILON = 1e-8;

const collateral = (direction, price) => (direction === "long" ? price : MAX_PRICE - price) * TP_SCALE;
const opposite = (side) => side === "buy" ? "sell" : "buy";
const positionSize = (positions) => positions.reduce((sum, row) => sum + row.remaining, 0);
const isPrice = (price) => Number.isInteger(price) && price >= 0 && price <= MAX_PRICE;
const isSettlement = (value) => Number.isFinite(value) && value >= 0 && value <= MAX_PRICE;
const hasBudget = (amount) => Number.isFinite(amount) && amount >= 0;

function inventory(positions) {
  return {
    positions: positions.filter(({ remaining }) => remaining > 0),
    realized: positions.reduce((sum, row) => sum + (row.realized ?? 0), 0),
  };
}

function applyQuote(state, quote) {
  if (quote.action === "open") {
    if (state.positions.some((row) => row.direction !== quote.direction)) return null;
    return {
      ...state,
      positions: [...state.positions, { direction: quote.direction, price: quote.price, remaining: 1 }],
    };
  }
  const lot = state.positions.findIndex((row) => row.direction === quote.direction);
  if (lot < 0) return null;
  const positions = [...state.positions];
  const position = positions[lot];
  if (position.remaining === 1) positions.splice(lot, 1);
  else positions[lot] = { ...position, remaining: position.remaining - 1 };
  const realized = state.realized + collateral(quote.direction, quote.price) - collateral(position.direction, position.price);
  return { positions, realized };
}

function lossAt(state, settlement) {
  // A void credits the original deposits and reverses market P&L.
  if (settlement === null) return 0;
  const payout = Math.round(settlement * TP_SCALE);
  const profit = state.positions.reduce((sum, { direction, price, remaining }) => {
    const proceeds = direction === "long" ? payout : MAX_SETTLEMENT - payout;
    return sum + (proceeds - collateral(direction, price)) * remaining;
  }, state.realized);
  return Math.max(0, -profit);
}

function isValidQuote(quote) {
  return isPrice(quote.price) && quote.price > 0 && quote.price < MAX_PRICE
    && (quote.remaining ?? quote.quantity) === 1
    && ["open", "close"].includes(quote.action) && ["long", "short"].includes(quote.direction)
    && quote.side === ((quote.action === "open") === (quote.direction === "long") ? "buy" : "sell");
}

function reachableRisk(state, quotes) {
  let hardLoss = Math.max(lossAt(state, 0), lossAt(state, MAX_PRICE));
  let peakPosition = positionSize(state.positions);
  if (quotes.length > 2 || new Set(quotes.map(({ side }) => side)).size !== quotes.length || quotes.some((quote) => !isValidQuote(quote))) {
    return { hardLoss: Infinity, peakPosition: Infinity };
  }
  // Each allowed quote is one contract. Enumerate the two possible orders
  // of execution and every prefix, including no fill.
  for (const first of quotes) {
    const filled = applyQuote(state, first);
    if (!filled) return { hardLoss: Infinity, peakPosition: Infinity };
    hardLoss = Math.max(hardLoss, lossAt(filled, 0), lossAt(filled, MAX_PRICE));
    peakPosition = Math.max(peakPosition, positionSize(filled.positions));
    const second = quotes.find((quote) => quote !== first && !(first.action === "open" && quote.action === "open"));
    if (!second) continue;
    const both = applyQuote(filled, second);
    if (!both) return { hardLoss: Infinity, peakPosition: Infinity };
    hardLoss = Math.max(hardLoss, lossAt(both, 0), lossAt(both, MAX_PRICE));
    peakPosition = Math.max(peakPosition, positionSize(both.positions));
  }
  return { hardLoss, peakPosition };
}

function marketMakerReachableRisk({ positions, quotes }) {
  return reachableRisk(inventory(positions), quotes);
}

function marketMakerHardLoss({ positions, quotes, positionLimit = 2 }) {
  const risk = marketMakerReachableRisk({ positions, quotes });
  return risk.peakPosition <= positionLimit ? risk.hardLoss : Infinity;
}

function sameQuote(working, quote, now) {
  return working.retainable !== false && (working.expiresAt == null || +working.expiresAt > now)
    && working.side === quote.side && working.direction === quote.direction && working.action === quote.action
    && working.price === quote.price && working.remaining === quote.quantity;
}

function projectQuotes(quotes, working, available, now) {
  const retained = new Set();
  let required = 0;
  const projected = quotes.map((quote) => {
    const current = working.find((order) => sameQuote(order, quote, now));
    if (current) {
      retained.add(current);
      return { ...quote, acceptedAt: +current.acceptedAt, sequence: current.sequence };
    }
    if (quote.action === "open") required += collateral(quote.direction, quote.price);
    return { ...quote, acceptedAt: now, sequence: Infinity };
  });
  // The transaction cancels every replaced quote before it reserves any
  // replacement. Retained quotes already have their collateral reserved.
  const released = working.reduce((sum, order) => sum + (
    !retained.has(order) && order.action === "open" ? collateral(order.direction, order.price) * order.remaining : 0
  ), 0);
  return {
    projected,
    orderChanges: working.length + quotes.length - 2 * retained.size,
    required,
    released,
    affordable: required <= available + released,
  };
}

function canQuote(quote, bookOrders, opensAllowed) {
  if (!isValidQuote(quote) || (!opensAllowed && quote.action === "open")) return false;
  const buy = quote.side === "buy";
  return !bookOrders.some((order) => {
    if (order.side !== quote.side) return buy ? order.price <= quote.price : order.price >= quote.price;
    return order.source !== "MM" && (buy ? order.price >= quote.price : order.price <= quote.price);
  });
}

function quoteAlternatives(forecast, state, bookOrders, opensAllowed) {
  const net = state.positions.reduce((sum, { direction, remaining }) => sum + (direction === "long" ? remaining : -remaining), 0);
  const halfSpread = Math.max(8, Math.ceil(0.25 * (forecast.p90 - forecast.p10)));
  const alternatives = new Map([["", []]]);
  for (const multiplier of SPREAD_MULTIPLIERS) {
    const spread = Math.ceil(halfSpread * multiplier);
    for (const slope of INVENTORY_SLOPES) {
      const center = forecast.mark - slope * net;
      const candidate = {
        buy: { side: "buy", direction: net < 0 ? "short" : "long", action: net < 0 ? "close" : "open",
          price: Math.floor(center - spread), quantity: 1 },
        sell: { side: "sell", direction: net > 0 ? "long" : "short", action: net > 0 ? "close" : "open",
          price: Math.ceil(center + spread), quantity: 1 },
      };
      for (const sides of [["buy"], ["sell"], SIDES]) {
        const quotes = sides.map((side) => candidate[side]);
        if (!quotes.every((quote) => canQuote(quote, bookOrders, opensAllowed))) continue;
        alternatives.set(quotes.map(({ side, price }) => `${side}:${price}`).join(","), quotes);
      }
    }
  }
  return alternatives.values();
}

function availableScenarioBook(bookOrders, quotes, now) {
  return bookOrders.map((order) => ({
    side: order.side, price: order.price, remaining: order.remaining,
    acceptedAt: order.acceptedAt == null ? -Infinity : +order.acceptedAt,
    sequence: order.sequence ?? 0,
    expiresAt: order.expiresAt == null ? Infinity : +order.expiresAt,
  })).concat(quotes.map((quote) => ({
    ...quote, remaining: quote.quantity, acceptedAt: Number.isFinite(quote.acceptedAt) ? quote.acceptedAt : now,
    sequence: quote.sequence ?? Infinity, expiresAt: Infinity, marketMaker: true,
  })));
}

function scenarioResult(initialState, quotes, bookOrders, flows, now) {
  let state = initialState;
  let quantity = 0;
  const book = availableScenarioBook(bookOrders, quotes, now);
  for (const flow of flows) {
    const at = now + flow.at;
    const buy = flow.side === "buy";
    const restingSide = opposite(flow.side);
    const matches = book.filter((order) => order.remaining > 0 && order.side === restingSide && order.expiresAt > at
      && (buy ? order.price <= flow.limitPrice : order.price >= flow.limitPrice))
      .sort((a, b) => (buy ? a.price - b.price : b.price - a.price)
        || a.acceptedAt - b.acceptedAt || a.sequence - b.sequence);
    let remaining = flow.quantity;
    for (const order of matches) {
      if (!remaining) break;
      const size = Math.min(order.remaining, remaining);
      order.remaining -= size;
      remaining -= size;
      if (!order.marketMaker) continue;
      state = applyQuote(state, order);
      quantity += size;
      if (order.action === "open") {
        for (const peer of book) {
          if (peer.marketMaker && peer.action === "open") peer.remaining = 0;
        }
      }
    }
    if (remaining) {
      book.push({ side: flow.side, price: flow.limitPrice, remaining, acceptedAt: at, sequence: Infinity, expiresAt: Infinity });
    }
  }
  return { state, quantity };
}

function scenarioInputs(forecast) {
  if (forecast?.flowReady !== true || !isSettlement(forecast.mark) || !isSettlement(forecast.p10)
    || !isSettlement(forecast.p90) || forecast.p10 > forecast.p90
    || !Array.isArray(forecast.scenarios) || !forecast.scenarios.length) return null;
  const scenarios = [];
  for (const scenario of forecast.scenarios) {
    if (!hasBudget(scenario.probability) || (scenario.settlement !== null && !isSettlement(scenario.settlement))
      || !Array.isArray(scenario.flows)
      || scenario.flows.some(({ side, quantity, limitPrice, at }) =>
        !SIDES.includes(side) || !Number.isInteger(quantity) || quantity < 1 || !isPrice(limitPrice) || !hasBudget(at))) return null;
    scenarios.push({ ...scenario, flows: [...scenario.flows].sort((a, b) => a.at - b.at) });
  }
  const total = scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return scenarios.filter(({ probability }) => probability > 0)
    .map((scenario) => ({ ...scenario, probability: scenario.probability / total }));
}

function expectedMetrics(state, quotes, bookOrders, scenarios, now) {
  const results = scenarios.map(({ settlement, probability, flows }) => {
    const result = scenarioResult(state, quotes, bookOrders, flows, now);
    return { probability, quantity: result.quantity, loss: lossAt(result.state, settlement) };
  });
  const expectedQuantity = results.reduce((sum, row) => sum + row.probability * row.quantity, 0);
  const expectedLoss = results.reduce((sum, row) => sum + row.probability * row.loss, 0);
  let tailWeight = TAIL_PROBABILITY;
  let weightedTail = 0;
  for (const { probability, loss } of results.sort((a, b) => b.loss - a.loss)) {
    const weight = Math.min(tailWeight, probability);
    weightedTail += weight * loss;
    tailWeight -= weight;
    if (tailWeight <= 0) break;
  }
  return { expectedQuantity, expectedLoss, tailLoss: weightedTail / TAIL_PROBABILITY };
}

function outranks(candidate, best) {
  if (!best) return true;
  const differences = [candidate.expectedQuantity - best.expectedQuantity, best.tailLoss - candidate.tailLoss,
    best.expectedLoss - candidate.expectedLoss, best.orderChanges - candidate.orderChanges];
  return (differences.find((difference) => Math.abs(difference) > EPSILON) ?? 0) > 0;
}

function optimizeMarketMakerQuotes({
  forecast, positions, working = [], bookOrders = [], available, now = 0,
  opensAllowed = false, positionLimit = 2, hardLossLimit = 1000 * TP_SCALE, expectedLossLimit, tailLossLimit,
}) {
  now = +now;
  const state = inventory(positions);
  const baseline = reachableRisk(state, []);
  const empty = { quotes: [], hardLoss: baseline.hardLoss, orderChanges: working.length, closeOnly: false };
  const scenarios = scenarioInputs(forecast);
  if (!scenarios) return { ...empty, reason: "forecast-unavailable" };
  if (![available, expectedLossLimit, tailLossLimit, hardLossLimit].every(hasBudget)
    || !Number.isFinite(now) || !Number.isInteger(positionLimit) || positionLimit < 1) {
    return { ...empty, reason: "risk-policy-unavailable" };
  }
  const external = bookOrders.filter((order) => order.remaining > 0
    && (order.acceptedAt == null || +order.acceptedAt <= now) && (order.expiresAt == null || +order.expiresAt > now));
  let best;
  let fallback;
  let noQuotes;
  for (const quotes of quoteAlternatives(forecast, state, external, opensAllowed)) {
    const funding = projectQuotes(quotes, working, available, now);
    if (!funding.affordable) continue;
    const risk = reachableRisk(state, quotes);
    const isClose = quotes.length === 1 && quotes[0].action === "close";
    const withinHardLimits = risk.hardLoss <= hardLossLimit && risk.peakPosition <= positionLimit;
    const safeClose = isClose && risk.hardLoss <= baseline.hardLoss && risk.peakPosition <= baseline.peakPosition;
    if (!withinHardLimits && !safeClose && quotes.length) continue;
    const metrics = expectedMetrics(state, funding.projected, external, scenarios, now);
    const candidate = { quotes, ...metrics, hardLoss: risk.hardLoss, orderChanges: funding.orderChanges,
      collateralRequired: funding.required, collateralReleased: funding.released, closeOnly: false };
    if (!quotes.length) noQuotes = candidate;
    if (withinHardLimits && metrics.expectedLoss <= expectedLossLimit + EPSILON && metrics.tailLoss <= tailLossLimit + EPSILON) {
      if (outranks(candidate, best)) best = candidate;
    }
    if (safeClose && outranks(candidate, fallback)) fallback = candidate;
  }
  if (best) return { ...best, reason: best.quotes.length ? "selected" : "no-quote" };
  if (fallback) return { ...fallback, closeOnly: true, reason: "close-only" };
  return { ...(noQuotes ?? empty), reason: "risk-limit" };
}

module.exports = { marketMakerHardLoss, marketMakerReachableRisk, optimizeMarketMakerQuotes };
