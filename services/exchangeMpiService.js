const { ExchangeMarket, ExchangeMpiDemo, ExchangeTick } = require("../models/exchangeModel");
const { calculateSample, error, publicState, readWeeklyExam, weeklyExamReady } = require("./exchangeMarketService");
const { marketList, marketView } = require("./exchangeService");

const DEMO_VARIATION = [-13, 4, -8, 7, 1, -3, 12, -9, 6, -2];
const MAX_TICKS = 120;

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

function demoTicks(demo, now) {
  const elapsed = Math.floor((+now - +demo.startedAt) / 1000);
  if (elapsed < 0 || now >= demo.expiresAt) return [];
  const ticks = [];
  for (let second = Math.max(0, elapsed - MAX_TICKS + 1); second <= elapsed; second += 1) {
    const sampledAt = new Date(+demo.startedAt + second * 1000);
    let seed = (+sampledAt / 1000) >>> 0;
    const pick = (limit) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor(seed / 4294967296 * limit);
    };
    const visible = demo.attempts.filter((attempt) => attempt.offsetSeconds <= second);
    ticks.push({ ...calculateSample(visible, pick), sampledAt, publishAt: sampledAt });
  }
  return ticks;
}

async function mpiState({ marketId, demo = false, now = new Date() } = {}) {
  const choices = (await marketList(now)).filter((market) => market.type === "weekly");
  const selected = marketId ? choices.find((market) => String(market._id) === String(marketId))
    : choices.find((market) => market.opensAt <= now && now < market.closeAt && market.phase === "scheduled")
      || choices.find((market) => market.opensAt > now);
  const markets = choices.map((market) => marketView(market, now));
  if (!selected) return { market: null, markets, ticks: [], source: "official", demoAvailable: false };

  const preview = await ExchangeMpiDemo.findOne({
    _id: selected._id, examId: selected.examId, expiresAt: { $gt: now },
  }).lean();
  const demoAvailable = Boolean(preview && publicState(selected, now) === "open");
  if (demo && demoAvailable) {
    return { market: marketView(selected, now), markets, ticks: demoTicks(preview, now), source: "demo", demoAvailable };
  }
  const ticks = await ExchangeTick.find({ marketId: selected._id, publishAt: { $lte: now } })
    .sort({ publishAt: -1 }).limit(MAX_TICKS).select("mpi sampledAt publishAt populationCount sampleCount").lean();
  return { market: marketView(selected, now), markets, ticks: ticks.reverse(), source: "official", demoAvailable };
}

module.exports = { startMpiDemo, mpiState };
