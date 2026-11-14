const assert = require("node:assert/strict");
const { TP_SCALE } = require("../services/exchangeFees");
const { marketMakerReachableRisk, optimizeMarketMakerQuotes } = require("../services/exchangeMarketMakerOptimizer");

const tp = (value) => value * TP_SCALE;
const now = Date.UTC(2026, 10, 14);
const flow = (side, limitPrice, quantity = 1, at = 0) => ({ side, limitPrice, quantity, at });
const forecast = (scenarios, prices = {}) => ({ flowReady: true, mark: 620, p10: 596, p90: 644, scenarios, ...prices });
const order = (side, action, direction, price) => ({ side, action, direction, price, quantity: 1 });
const evaluate = (inputs) => optimizeMarketMakerQuotes({
  positions: [], working: [], bookOrders: [], available: tp(2000), opensAllowed: true, now,
  expectedLossLimit: tp(1000), tailLossLimit: tp(1000), ...inputs,
});

const bid = order("buy", "open", "long", 608);
const ask = order("sell", "open", "short", 632);
const flat = marketMakerReachableRisk({ positions: [], quotes: [bid, ask] });
assert.deepEqual(flat, { hardLoss: tp(608), peakPosition: 1 }, "the first flat opening fill cancels the opposite quote");

const long = [{ direction: "long", price: 608, remaining: 1 }];
assert.deepEqual(marketMakerReachableRisk({ positions: long, quotes: [
  order("buy", "open", "long", 604), order("sell", "close", "long", 628),
] }), { hardLoss: tp(1212), peakPosition: 2 }, "opening before the close is reachable");
assert.deepEqual(marketMakerReachableRisk({ positions: [
  { direction: "long", price: 410, remaining: 1, realized: -tp(20) },
  { direction: "long", price: 430, remaining: 1, realized: 0 },
], quotes: [order("sell", "close", "long", 60)] }), { hardLoss: tp(860), peakPosition: 2 },
"preexisting FIFO position losses remain part of the risk budget");

const independent = forecast([
  { probability: 0.5, settlement: 700, flows: [flow("sell", 608)] },
  { probability: 0.5, settlement: 500, flows: [flow("buy", 632)] },
]);
const twoSided = evaluate({ forecast: independent, available: tp(976) });
assert.deepEqual(twoSided.quotes, [bid, ask]);
assert.equal(twoSided.expectedQuantity, 1);
assert.equal(twoSided.collateralRequired, tp(976));
assert.equal(evaluate({ forecast: independent, available: tp(975) }).quotes.length, 1, "both quotes require collateral even with atomic cancellation");
const retained = evaluate({ forecast: independent, available: 0, working: [
  { ...bid, remaining: 1, acceptedAt: new Date(now - 1000), sequence: 1, expiresAt: new Date(now + 60_000) },
  { ...ask, remaining: 1, acceptedAt: new Date(now - 1000), sequence: 1, expiresAt: new Date(now + 60_000) },
] });
assert.deepEqual(retained.quotes, [bid, ask]);
assert.equal(retained.orderChanges, 0);
assert.equal(retained.collateralRequired, 0);
const replaced = evaluate({ forecast: independent, available: 0, working: [
  { ...bid, price: 620, remaining: 1, retainable: false },
  { ...ask, price: 640, remaining: 1, retainable: false },
] });
assert.deepEqual(replaced.quotes, [bid, ask]);
assert.equal(replaced.collateralReleased, tp(980));
assert.equal(replaced.orderChanges, 4, "replacement first cancels both working orders and then reserves both new quotes");

const blocked = evaluate({ forecast: independent, bookOrders: [
  { side: "buy", price: 608, remaining: 1, source: "BOT" },
  { side: "sell", price: 631, remaining: 1, source: "HUMAN" },
] });
assert.deepEqual(blocked.quotes, [], "ordinary student and bot depth preempts same-side maker quotes");
const crossing = evaluate({ forecast: independent, bookOrders: [
  { side: "buy", price: 650, remaining: 1, source: "MM" },
  { side: "sell", price: 590, remaining: 1, source: "MM" },
] });
assert.deepEqual(crossing.quotes, [], "post-only also prevents crossing a manual operator order");

const sequential = forecast([{ probability: 1, settlement: 500, flows: [flow("buy", 640), flow("sell", 600, 1, 1)] }]);
const oneFill = evaluate({ forecast: sequential });
assert.equal(oneFill.expectedQuantity, 1, "opposite flat opener is unavailable after first fill");
assert.equal(oneFill.quotes.length, 1, "an unneeded sibling loses the order-change tie break");
const queue = evaluate({ forecast: sequential, bookOrders: [
  { side: "sell", price: 630, remaining: 1, source: "MM", acceptedAt: new Date(now - 1), sequence: 1 },
] });
assert.ok(queue.quotes.every(({ side }) => side === "buy"), "earlier better-priced resting order consumes demand before the maker");
const bookNeedsTwo = evaluate({ forecast: forecast([{ probability: 1, settlement: 720, flows: [
  flow("buy", 632, 2),
] }]), bookOrders: [
  { side: "sell", price: 632, remaining: 1, source: "MM", acceptedAt: new Date(now - 1), sequence: 1 },
] });
assert.deepEqual(bookNeedsTwo.quotes, [ask], "quantity remaining after prior same-price order can reach new maker quote");

const tail = evaluate({
  positions: [{ direction: "long", price: 400, remaining: 1 }],
  forecast: forecast([
    { probability: 0.03, settlement: 0, flows: [] },
    { probability: 0.04, settlement: 200, flows: [] },
    { probability: 0.93, settlement: null, flows: [] },
  ]),
});
assert.ok(Math.abs(tail.tailLoss - tp(320)) < 1e-6, "CVaR uses only 2% of the second-worst scenario");
assert.ok(Math.abs(tail.expectedLoss - tp(20)) < 1e-6, "void restores original deposits and cancels P&L");

const wider = evaluate({
  forecast: forecast([{ probability: 1, settlement: 500, flows: [flow("sell", 590)] }]),
  expectedLossLimit: tp(100), tailLossLimit: tp(100),
});
assert.equal(wider.quotes[0].price, 596, "wider grid choices remain available when the base spread would violate soft limits");

const fallback = evaluate({
  positions: [{ direction: "long", price: 700, remaining: 1 }],
  forecast: forecast([{ probability: 1, settlement: 0, flows: [flow("buy", 640)] }]),
  expectedLossLimit: tp(1), tailLossLimit: tp(1),
});
assert.equal(fallback.reason, "close-only");
assert.equal(fallback.closeOnly, true);
assert.equal(fallback.quotes[0].action, "close");
assert.equal(fallback.hardLoss, tp(700));
assert.equal(evaluate({ forecast: independent, tailLossLimit: undefined }).reason, "risk-policy-unavailable");
assert.equal(evaluate({ forecast: { ...independent, flowReady: false } }).reason, "forecast-unavailable");

console.log("Market Maker B verified: reachable fills, hard and soft risk, collateral, post-only, queue priority and close-only.");
