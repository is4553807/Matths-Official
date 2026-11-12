const { ExchangeMarket, ExchangeMpiDemo, ExchangeTick } = require("../models/exchangeModel");
const {
  calculateSample, error, publicState, readWeeklyExam, weeklyExamReady, publicSampleScope, sampleWithCutoff,
} = require("./exchangeMarketService");
const { marketList, marketView } = require("./exchangeService");

const DEMO_VARIATION = [-13, 4, -8, 7, 1, -3, 12, -9, 6, -2];
const { intervalFor, bucketStart, candleWindow, pushPrice, indexCandles, aggregateCandles } = require("./exchangeChartService");
const chartCache = new Map();

function storeChart(key, value) {
  chartCache.delete(key);
  chartCache.set(key, value);
  if (chartCache.size > 40) chartCache.delete(chartCache.keys().next().value);
}

function demoAttempts() {
  return Array.from({ length: 90 }, (_, index) => {
    const grade = index % 9 + 1;
    const groupIndex = Math.floor(index / 9);
    return {
      accountKey: `mpi-demo-${String(index + 1).padStart(3, "0")}`,
      exchangeMmrGrade: grade,
      score: Math.min(100, 95 - (grade - 1) * 8 + DEMO_VARIATION[(groupIndex + grade) % 10]),
      offsetSeconds: Math.floor(index / 3),
    };
  });
}

async function startMpiDemo({ marketId, examId, actorId, now = new Date() }) {
  const market = await ExchangeMarket.findOne({ _id: marketId, type: "weekly" }).lean();
  if (!market || (examId && String(market.examId) !== String(examId))) {
    throw error(404, "해당 주간 모의고사 시장을 찾을 수 없습니다.");
  }
  const exam = await readWeeklyExam(market.examId);
  if (publicState(market, now) !== "open" || exam?.status !== "open" ||
      now < exam.releaseAt || now >= exam.closeAt || !await weeklyExamReady(exam)) {
    throw error(409, "현재 열려 있는 주간 모의고사에서 시연할 수 있습니다.");
  }
  return ExchangeMpiDemo.findOneAndUpdate({ _id: market._id }, { $set: {
    examId: market.examId,
    startedAt: now,
    expiresAt: new Date(Math.min(+market.closeAt, +exam.closeAt)),
    attempts: demoAttempts(),
    startedBy: actorId || null,
  } }, { upsert: true, returnDocument: "after", runValidators: true }).lean();
}

function sampleFor(demo) {
  const grades = Array.from({ length: 9 }, () => []);
  for (const attempt of demo.attempts) grades[attempt.exchangeMmrGrade - 1]?.push(attempt.score);
  const completeAt = Math.max(...demo.attempts.map((attempt) => attempt.offsetSeconds));
  const balanced = grades.every((grade) => grade.length === 10);
  return (second) => {
    const sampledAt = new Date(+demo.startedAt + second * 1000);
    let seed = (+sampledAt / 1000) >>> 0;
    const pick = (limit) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor(seed / 4294967296 * limit);
    };
    const sample = balanced && second >= completeAt ? {
      mpi: Math.round(grades.reduce((sum, scores) => sum + scores[pick(scores.length)], 0) * 1000 / 9) / 100,
      populationCount: 90, sampleCount: 9,
    } : calculateSample(demo.attempts.filter((attempt) => attempt.offsetSeconds <= second), pick);
    return { ...sample, sampledAt, dataCutoffAt: sampledAt, publishAt: sampledAt };
  };
}

function demoChart(demo, now, interval) {
  const elapsed = Math.floor((+now - +demo.startedAt) / 1000);
  const key = `demo:${demo._id}:${+demo.startedAt}:${interval.code}`;
  const last = chartCache.get(key);
  if (last?.through === elapsed) return last;
  const cutoff = candleWindow(now, interval.ms) - (interval.code === "1s" ? 1000 : 0);
  const first = Math.max(0, Math.ceil((cutoff - +demo.startedAt) / 1000));
  const reusable = last && last.through < elapsed && last.through >= first;
  const candles = reusable ? last.candles.filter((row) => row._id >= cutoff).map((row) => ({ ...row })) : [];
  const sample = sampleFor(demo);
  let tick;
  for (let second = reusable ? last.through + 1 : first; second <= elapsed; second += 1) {
    tick = sample(second);
    if (tick.mpi !== null) pushPrice(candles, tick.sampledAt, tick.mpi, interval.ms);
  }
  const value = { through: elapsed, candles, latest: tick };
  if (!last || last.through <= elapsed) storeChart(key, value);
  return value;
}

async function officialChart(visible, startsAt, now, latest, interval) {
  const cutoff = candleWindow(latest.publishAt, interval.ms) - (interval.code === "1s" ? 1000 : 0);
  const through = +latest.publishAt;
  const key = `official:${visible.marketId}:${interval.code}:${startsAt ? +startsAt : "legacy"}`;
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

async function mpiState({ marketId, interval: requestedInterval, before, now = new Date() } = {}) {
  const interval = intervalFor(requestedInterval, "1m");
  const choices = (await marketList(now)).filter((market) => market.type === "weekly");
  const selected = marketId ? choices.find((market) => String(market._id) === String(marketId))
    : choices.find((market) => market.opensAt <= now && now < market.closeAt && market.phase === "scheduled")
      || choices.find((market) => market.opensAt > now);
  const markets = choices.map((market) => marketView(market, now));
  const base = { market: selected ? marketView(selected, now) : null, markets, interval: interval.code };
  if (!selected) return { ...base, latest: null, candles: [], source: "official" };

  const { filter, startsAt, firstMinuteAt } = await publicSampleScope(selected._id, now);
  const visible = { ...filter, mpi: { $gte: 0 } };
  const latest = await ExchangeTick.findOne(visible).sort({ publishAt: -1 })
    .select("mpi sampledAt dataCutoffAt publishAt populationCount sampleCount").lean();
  if (latest) {
    const anchor = before ? await ExchangeTick.findOne({ ...visible, publishAt: { $lte: now, $lt: before } })
      .sort({ publishAt: -1 }).select("publishAt").lean() : latest;
    const { candles, prior } = anchor ? await officialChart(visible, startsAt, now, anchor, interval) : { candles: [] };
    return { ...base, latest: sampleWithCutoff(latest),
      candles: indexCandles(candles, interval.ms, { prior, carryFrom: firstMinuteAt }), source: "official" };
  }
  if (publicState(selected, now) === "open") {
    const preview = await ExchangeMpiDemo.findOne({
      _id: selected._id, examId: selected.examId, startedAt: { $lte: now }, expiresAt: { $gt: now },
    }).lean();
    if (preview) {
      const anchor = before ? new Date(Math.min(+before - 1, +now)) : now;
      if (anchor < preview.startedAt) return { ...base, latest: null, candles: [], source: "demo" };
      const { latest: demoLatest, candles } = demoChart(preview, anchor, interval);
      return { ...base, latest: demoLatest, candles: indexCandles(candles, interval.ms), source: "demo" };
    }
  }
  return { ...base, latest: null, candles: [], source: "official" };
}

module.exports = { startMpiDemo, mpiState };
