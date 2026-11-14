const { ExchangeTick, ExchangeBotReplayMpi } = require("../models/exchangeModel");
const { readMpiMinimum, publishedMpiFilter, mpiDataCutoff } = require("./exchangeMarketService");
const { marketList, marketView } = require("./exchangeService");
const { isHistoricalBootstrap } = require("./exchangeBootstrapService");
const { intervalFor, bucketStart, candleWindow } = require("./exchangeChartService");

const chartCache = new Map();
const dataTime = (row) => row.dataCutoffAt ?? row.sampledAt;

function mpiCandles(rows, ms, replay = false) {
  const bars = new Map();
  const sorted = [...rows].sort((a, b) => +dataTime(a) - +dataTime(b) || +a.publishAt - +b.publishAt);
  for (const row of sorted) {
    const id = bucketStart(dataTime(row), ms);
    const bar = bars.get(id);
    if (!bar) {
      bars.set(id, { _id: id, open: row.mpi, high: row.mpi, low: row.mpi, close: row.mpi,
        ...(replay ? { source: "REPLAY" } : {}) });
    } else {
      bar.high = Math.max(bar.high, row.mpi);
      bar.low = Math.min(bar.low, row.mpi);
      bar.close = row.mpi;
    }
  }
  return bars;
}

function inDataRange(range) {
  return { $or: [{ dataCutoffAt: range }, { dataCutoffAt: null, sampledAt: range }] };
}

async function chartFor({ visible, replayFilter, latest, before, interval, market, now }) {
  const { ms } = interval;
  const exclusiveEnd = before ? new Date(bucketStart(before, ms)) : null;
  const replayRange = exclusiveEnd ? { $lt: exclusiveEnd } : undefined;
  const replayQuery = replayFilter ? { ...replayFilter, ...(replayRange ? { sampledAt: replayRange } : {}) } : null;
  const key = [market._id, interval.code, visible.populationCount.$gte, latest?._id, +exclusiveEnd,
    replayFilter ? +market.replayRecordedAt : "", replayFilter ? market.replayMpiCount : 0].join(":");
  const cached = chartCache.get(key);
  if (cached && +now >= cached.at && +now - cached.at < 60_000) return cached.candles;

  const [liveAnchor, replayAnchor] = await Promise.all([
    exclusiveEnd ? ExchangeTick.findOne({ ...visible, $and: [inDataRange({ $lt: exclusiveEnd })] })
      .sort({ publishAt: -1 }).select("dataCutoffAt sampledAt").lean() : latest?.unavailable ? null : latest,
    replayQuery ? ExchangeBotReplayMpi.findOne(replayQuery).sort({ sampledAt: -1 }).select("sampledAt").lean() : null,
  ]);
  const anchor = Math.max(+(dataTime(liveAnchor ?? {}) ?? 0), +(replayAnchor?.sampledAt ?? 0));
  if (!anchor) return [];
  const range = { $gte: new Date(candleWindow(anchor, ms)), ...(exclusiveEnd ? { $lt: exclusiveEnd } : {}) };
  const restoredRange = replayFilter ? { ...range, $lte: replayFilter.sampledAt.$lte } : null;
  const [live, restored] = await Promise.all([
    ExchangeTick.find({ ...visible, $and: [inDataRange(range)] }).select("mpi dataCutoffAt sampledAt publishAt -_id").lean(),
    replayQuery ? ExchangeBotReplayMpi.find({ ...replayQuery, sampledAt: restoredRange }).select("mpi sampledAt publishAt -_id").lean() : [],
  ]);
  // Observed values take precedence whenever both sources land in the same bucket.
  const bars = mpiCandles(restored, ms, true);
  for (const [id, bar] of mpiCandles(live, ms)) bars.set(id, bar);
  const candles = [...bars.values()].sort((a, b) => a._id - b._id);
  chartCache.delete(key);
  chartCache.set(key, { at: +now, candles });
  if (chartCache.size > 40) chartCache.delete(chartCache.keys().next().value);
  return candles;
}

async function mpiState({ marketId, interval: requestedInterval, before, now = new Date(), publicOnly = false } = {}) {
  const choices = (await marketList(now, { publicOnly })).filter((market) => market.type === "weekly");
  const selected = marketId ? choices.find((market) => String(market._id) === String(marketId))
    : choices.find((market) => market.opensAt <= now && now < market.closeAt && market.phase === "scheduled")
      || choices.find((market) => market.opensAt > now);
  const historical = isHistoricalBootstrap(selected);
  const interval = intervalFor(requestedInterval, historical ? "2h" : selected?.replayMpiCount ? "1h" : "1m");
  const markets = choices.map((market) => marketView(market, now));
  const dataThroughAt = mpiDataCutoff(now);
  const base = { market: selected ? marketView(selected, now) : null, markets, interval: interval.code,
    latest: null, candles: [], source: "official", dataThroughAt };
  if (!selected) return { ...base, minimumMpiAttempts: await readMpiMinimum() };

  const minimumMpiAttempts = await readMpiMinimum(selected);
  const published = publishedMpiFilter(selected._id, now);
  const visible = { ...published, unavailable: { $ne: true }, populationCount: { $gte: minimumMpiAttempts } };
  const latest = await ExchangeTick.findOne(base.market.bootstrap ? published : visible).sort({ publishAt: -1 })
    .select("mpi sampledAt dataCutoffAt publishAt populationCount botPopulationCount humanPopulationCount reconstructedBotPopulationCount botWeight unavailable").lean();
  const replayFilter = !historical && selected.replayMpiCount && selected.replayRecordedAt <= now
    ? { marketId: selected._id, reconstructedAt: { $lte: now }, sampledAt: { $lte: dataThroughAt }, publishAt: { $lte: now } }
    : null;
  const candles = await chartFor({ visible, replayFilter, latest, before, interval, market: selected, now });
  return { ...base, dataThroughAt: new Date(Math.min(+dataThroughAt, +selected.closeAt)), minimumMpiAttempts, latest, candles };
}

module.exports = { mpiState };
