const { createHash } = require("node:crypto");
const { botLabel, traderSignal } = require("./exchangeBootstrapService");

const ORDER_TTL_MS = 30 * 60_000;
const ACTIVE_BOTS = 4;

function bestOrder(orders, side) {
  const direction = side === "buy" ? -1 : 1;
  return orders.filter((order) => order.side === side)
    .sort((a, b) => direction * (a.price - b.price) || a.sequence - b.sequence)[0];
}

// Reconstruct a disposable BOT-only book. This function never calls the matching engine
// or creates TP ledger entries. Callers must disclose the provenance of its output.
function replayBotFills(attempts, snapshots, { before, reconstructedAt }) {
  const cutoff = Math.min(+before, +reconstructedAt);
  if (before == null || reconstructedAt == null || !Number.isFinite(cutoff)) return [];
  const roster = attempts.filter((attempt) => attempt.source === "BOT" && attempt.botId
    && Number.isInteger(attempt.number) && attempt.number > 0 && Number.isFinite(attempt.score)
    && attempt.score >= 0 && attempt.score <= 100 && attempt.submittedAt != null
    && Number.isFinite(+attempt.submittedAt) && +attempt.submittedAt < cutoff)
    .sort((a, b) => +a.submittedAt - +b.submittedAt || a.number - b.number || String(a.botId).localeCompare(String(b.botId)));
  const publications = snapshots.filter((snapshot) => !snapshot.unavailable && Number.isFinite(snapshot.mpi)
    && snapshot.mpi >= 0 && snapshot.mpi <= 1000 && snapshot.publishAt != null
    && Number.isFinite(+snapshot.publishAt) && +snapshot.publishAt < cutoff)
    .sort((a, b) => +a.publishAt - +b.publishAt
      || +(a.dataCutoffAt ?? a.sampledAt ?? a.publishAt) - +(b.dataCutoffAt ?? b.sampledAt ?? b.publishAt)
      || a.mpi - b.mpi);
  const positions = new Map();
  const fills = [];
  let working = [];
  let previous;
  let sequence = 0;

  for (const snapshot of publications) {
    const tradedAt = +snapshot.publishAt;
    const submittedThrough = +(snapshot.dataCutoffAt ?? snapshot.sampledAt ?? snapshot.publishAt);
    if (!Number.isFinite(submittedThrough) || submittedThrough > tradedAt || +previous?.publishAt === tradedAt) continue;
    working = working.filter((order) => order.expiresAt > tradedAt);
    const submitted = roster.filter((bot) => +bot.submittedAt <= submittedThrough);
    const latest = new Set(submitted.slice(-ACTIVE_BOTS).map((bot) => String(bot.botId)));
    const active = submitted.filter((bot) => latest.has(String(bot.botId)) || positions.has(String(bot.botId)));
    for (const bot of active) {
      const botId = String(bot.botId);
      if (working.some((order) => order.botId === botId)) continue;
      const bid = bestOrder(working, "buy");
      const ask = bestOrder(working, "sell");
      const signal = traderSignal(bot, snapshot, previous, { bid: bid?.price, ask: ask?.price });
      if (!signal) continue;
      const side = signal.direction === "long" ? "buy" : "sell";
      const held = positions.get(botId);
      if (held === side) continue;
      const order = { botId, label: botLabel("TraderBot", bot.number), side, price: signal.price,
        expiresAt: tradedAt + ORDER_TTL_MS, sequence: sequence++ };
      const maker = side === "buy" ? ask : bid;
      const crosses = maker && (side === "buy" ? order.price >= maker.price : order.price <= maker.price);
      if (!crosses) {
        working.push(order);
        continue;
      }
      working = working.filter((row) => row !== maker);
      for (const fill of [maker, order]) {
        if (positions.has(fill.botId)) positions.delete(fill.botId);
        else positions.set(fill.botId, fill.side);
      }
      const replayId = createHash("sha256").update(`exchange-bot-replay:v1:${tradedAt}:${maker.botId}:${botId}`).digest("hex");
      fills.push({ replayId, tradedAt: new Date(tradedAt), reconstructedAt: new Date(+reconstructedAt), price: maker.price,
        quantity: 1, makerLabel: maker.label, takerLabel: order.label, makerSource: "BOT", takerSource: "BOT", source: "BOT_REPLAY" });
    }
    previous = snapshot;
  }
  return fills;
}

module.exports = { replayBotFills };
