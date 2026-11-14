const BOT_DEPTH_LEVELS = 3;
const BOT_DEPTH_STEP = 6;
const BOT_DEPTH_MIN_PRICE = 250;
const BOT_DEPTH_MAX_PRICE = 750;
const BOT_DEPTH_MAX_DISTANCE = 48;
const BOT_DEPTH_COMMAND = /^bot-depth-(buy|sell)-([0-2])-[a-f0-9]{24}-\d+$/;
const botDepthOrderFilter = { source: "BOT", botId: { $ne: null }, commandId: BOT_DEPTH_COMMAND };

function isBotDepthOrder(order) {
  return order.source === "BOT" && order.botId != null && BOT_DEPTH_COMMAND.test(order.commandId);
}

function depthSlot(order) {
  const [, side, rung] = BOT_DEPTH_COMMAND.exec(order.commandId);
  return `${side}-${rung}`;
}

function botDepthQuotes(mpi, population, externalOrders) {
  const bid = externalOrders.reduce((best, row) => row.side === "buy" ? Math.max(best, row.price) : best, -Infinity);
  const ask = externalOrders.reduce((best, row) => row.side === "sell" ? Math.min(best, row.price) : best, Infinity);
  const halfSpread = Math.max(8, Math.ceil(40 / Math.sqrt(population)));
  const quotes = [];
  for (const side of ["buy", "sell"]) {
    const buy = side === "buy";
    const best = buy ? Math.min(Math.floor(mpi - halfSpread), bid === -Infinity ? Infinity : bid - 1, ask - 1)
      : Math.max(Math.ceil(mpi + halfSpread), ask === Infinity ? -Infinity : ask + 1, bid + 1);
    for (let rung = 0; rung < BOT_DEPTH_LEVELS; rung++) {
      const price = best + (buy ? -1 : 1) * rung * BOT_DEPTH_STEP;
      if (price < BOT_DEPTH_MIN_PRICE || price > BOT_DEPTH_MAX_PRICE || Math.abs(price - mpi) > BOT_DEPTH_MAX_DISTANCE) break;
      quotes.push({ side, rung, price, direction: buy ? "long" : "short" });
    }
  }
  return quotes;
}

module.exports = { botDepthQuotes, botDepthOrderFilter, depthSlot, isBotDepthOrder, BOT_DEPTH_MIN_PRICE, BOT_DEPTH_MAX_PRICE };
