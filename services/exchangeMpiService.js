const { ExchangeTick, ExchangeBotReplayMpi } = require("../models/exchangeModel");
const { readMpiMinimum, publishedMpiFilter } = require("./exchangeMarketService");
const { marketList, marketView } = require("./exchangeService");
const { intervalFor, bucketStart, candleWindow, indexCandles, aggregateCandles } = require("./exchangeChartService");
const chartCache = new Map();

function storeChart(key, value) {
  chartCache.delete(key);
  chartCache.set(key, value);
  if (chartCache.size > 40) chartCache.delete(chartCache.keys().next().value);
}

async function officialChart(visible, now, latest, interval) {
  const cutoff = candleWindow(latest.publishAt, interval.ms) - (interval.code === "1s" ? 1000 : 0);
  const through = +latest.publishAt;
  const key = `official:${visible.marketId}:${interval.code}:${visible.populationCount.$gte}`;
  const last = chartCache.get(key);
  if (last?.through === through && +now - last.updated < 60_000) return last;
  const reusable = last && last.through < through && last.through >= cutoff && +now - last.updated < 60_000;
  const [additions, priorTick] = await Promise.all([
    aggregateCandles(ExchangeTick, {
      match: {
        ...visible,
        publishAt: { ...(reusable ? { $gt: new Date(last.through) } : { $gte: new Date(cutoff) }), $lte: latest.publishAt },
      },
      dateField: "publishAt", priceField: "mpi", ms: interval.ms,
    }),
    ExchangeTick.findOne({ ...visible, publishAt: { $lt: new Date(cutoff) } })
      .sort({ publishAt: -1 }).select("mpi publishAt").lean(),
  ]);
  const candles = reusable ? last.candles.filter((row) => row._id >= cutoff).map((row) => ({ ...row })) : [];
  for (const row of additions) {
    const tail = candles.at(-1);
    if (tail?._id !== row._id) candles.push(row);
    else {
      tail.high = Math.max(tail.high, row.high);
      tail.low = Math.min(tail.low, row.low);
      tail.close = row.close;
    }
  }
  const cached = chartCache.get(key);
  const prior = priorTick && { _id: bucketStart(priorTick.publishAt, interval.ms), close: priorTick.mpi };
  const result = { through, updated: +now, candles, prior };
  if (!cached || cached.through <= through) storeChart(key, result);
  return result;
}

async function mpiState({ marketId, interval: requestedInterval, before, series, now = new Date() } = {}) {
  const interval = intervalFor(requestedInterval, "1m");
  const choices = (await marketList(now)).filter((market) => market.type === "weekly");
  const selected = marketId ? choices.find((market) => String(market._id) === String(marketId))
    : choices.find((market) => market.opensAt <= now && now < market.closeAt && market.phase === "scheduled")
      || choices.find((market) => market.opensAt > now);
  const markets = choices.map((market) => marketView(market, now));
  const replay = series === "replay";
  const base = { market: selected ? marketView(selected, now) : null, markets, interval: interval.code,
    latest: null, candles: [], source: replay ? "bot_replay" : "official" };
  if (!selected) return { ...base, minimumMpiAttempts: await readMpiMinimum() };

  const minimumMpiAttempts = await readMpiMinimum(selected);
  if (replay) {
    if (!selected.replayMpiCount) return { ...base, minimumMpiAttempts };
    const filter = { marketId: selected._id, reconstructedAt: { $lte: now } };
    const latest = await ExchangeBotReplayMpi.findOne({ ...filter, publishAt: { $lte: now } })
      .sort({ publishAt: -1 }).select("mpi sampledAt publishAt populationCount reconstructedAt -_id").lean();
    const anchor = before ? await ExchangeBotReplayMpi.findOne({ ...filter, publishAt: { $lt: new Date(bucketStart(before, interval.ms)), $lte: now } })
      .sort({ publishAt: -1 }).select("publishAt").lean() : latest;
    const candles = anchor ? await aggregateCandles(ExchangeBotReplayMpi, {
      match: { ...filter, publishAt: { $gte: new Date(candleWindow(anchor.publishAt, interval.ms)), $lte: anchor.publishAt } },
      dateField: "publishAt", priceField: "mpi", ms: interval.ms,
    }) : [];
    return { ...base, minimumMpiAttempts, latest, candles };
  }
  const visible = { ...publishedMpiFilter(selected._id, now), unavailable: { $ne: true }, populationCount: { $gte: minimumMpiAttempts } };
  const latest = await ExchangeTick.findOne(base.market.bootstrap ? publishedMpiFilter(selected._id, now) : visible).sort({ publishAt: -1 })
    .select("mpi sampledAt dataCutoffAt publishAt populationCount botPopulationCount humanPopulationCount reconstructedBotPopulationCount botWeight unavailable").lean();
  const state = { ...base, minimumMpiAttempts };
  if (!latest) return state;
  if (latest.unavailable && !before) return { ...state, latest };
  const anchor = before ? await ExchangeTick.findOne({ ...visible, publishAt: { $lte: now, $lt: before } })
    .sort({ publishAt: -1 }).select("publishAt").lean() : latest;
  const { candles, prior } = anchor ? await officialChart(visible, now, anchor, interval) : { candles: [] };
  return { ...state, latest, candles: indexCandles(candles, interval.ms, { prior }) };
}

module.exports = { mpiState };
