const OPTIONS = [
  ["1s", "1초", 1], ["15m", "15분", 900], ["1h", "1시간", 3600], ["4h", "4시간", 14400], ["3d", "3일", 259200],
  ["1m", "1분", 60], ["3m", "3분", 180], ["5m", "5분", 300], ["30m", "30분", 1800], ["2h", "2시간", 7200],
  ["6h", "6시간", 21600], ["8h", "8시간", 28800], ["12h", "12시간", 43200], ["1d", "1일", 86400], ["1w", "1주", 604800],
].map(([code, label, seconds]) => ({ code, label, ms: seconds * 1000 }));
const DEFAULT_INTERVAL = "1s";
const MAX_CANDLES = 120;
const KST = 9 * 3600 * 1000;

function intervalFor(code, fallback = DEFAULT_INTERVAL) {
  return OPTIONS.find((item) => item.code === code) || OPTIONS.find((item) => item.code === fallback);
}

function bucketStart(time, ms) {
  return Math.floor((+time + KST) / ms) * ms - KST;
}

function candleWindow(time, ms) {
  return bucketStart(time, ms) - (MAX_CANDLES - 1) * ms;
}

async function aggregateCandles(model, { match, dateField, priceField, ms, volume = false, tradeSources = false }) {
  const price = `$${priceField}`;
  const shifted = { $add: [{ $toLong: `$${dateField}` }, KST] };
  const makerAutomated = { $in: ["$makerSource", ["BOT", "MM"]] };
  const takerAutomated = { $in: ["$takerSource", ["BOT", "MM"]] };
  const botOnly = { $eq: ["$botOnly", true] };
  const hasAutomated = { $or: [botOnly, makerAutomated, takerAutomated] };
  const hasHuman = { $and: [{ $not: [botOnly] }, { $not: [{ $and: [makerAutomated, takerAutomated] }] }] };
  return model.aggregate([
    { $match: match },
    { $sort: { [dateField]: 1, ...(volume ? { sequence: 1, _id: 1 } : {}) } },
    { $group: {
      _id: { $subtract: [{ $subtract: [shifted, { $mod: [shifted, ms] }] }, KST] },
      open: { $first: price }, high: { $max: price }, low: { $min: price }, close: { $last: price },
      ...(volume ? { volume: { $sum: "$quantity" } } : {}),
      ...(tradeSources ? {
        hasAutomated: { $max: { $cond: [hasAutomated, 1, 0] } },
        hasHuman: { $max: { $cond: [hasHuman, 1, 0] } },
      } : {}),
    } },
    { $sort: { _id: 1 } },
  ]);
}

module.exports = { OPTIONS, DEFAULT_INTERVAL, MAX_CANDLES, intervalFor, bucketStart, candleWindow, aggregateCandles };
