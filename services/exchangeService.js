const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const {
  ExchangeMarket, ExchangeOrder, ExchangeTrade, ExchangeTick, ExchangeWallet, ExchangeAccount, ExchangePosition, ExchangeEvent,
} = models;
const {
  publicState, validAttempts, weeklyExamReady, readWeeklyExam, readSetting, syncWeeklyMarkets, saveSample,
} = require("./exchangeMarketService");
const { INITIAL_TP, TP_SCALE, processMarket } = require("./exchangeTradingService");
const { withSchedulerLease } = require("./schedulerLeaseService");

const STAGES = { scheduled: "개장 예정", waiting: "개장 조건 대기", open: "거래 중", paused: "일시 중지",
  verifying: "성적 검증 중", "awaiting-result": "성적 발표 대기", settling: "정산 중", settled: "정산 완료", void: "시장 취소" };
const { intervalFor, candleWindow, aggregateCandles } = require("./exchangeChartService");

function marketView(market, now) {
  const status = publicState(market, now);
  return {
    id: String(market._id), title: market.title, type: market.type, grade: market.grade, year: market.year,
    opensAt: market.opensAt, closeAt: market.closeAt, status, statusLabel: STAGES[status],
    lastPrice: market.lastPrice ?? null, volume: market.volume,
    settlement: status === "settled" ? market.settlement : null,
    resultUrl: status === "settled" ? market.resultUrl : undefined,
    settlementSource: status === "settled" ? market.settlementSource : undefined,
    questionCounts: market.questionCounts || null,
    examHref: market.examId ? `/private-mock-exams/${market.examId}` : null,
  };
}

async function marketList(now) {
  const [current, history] = await Promise.all([
    ExchangeMarket.find({ phase: "scheduled", closeAt: { $gt: now } }).sort({ opensAt: 1, _id: 1 }).limit(80).lean(),
    ExchangeMarket.find({ $or: [{ phase: { $ne: "scheduled" } }, { closeAt: { $lte: now } }] })
      .sort({ closeAt: -1, _id: -1 }).limit(20).lean(),
  ]);
  // A deleted or unpublished weekly source may be discovered between background passes.
  const ready = [];
  for (const market of current) {
    if (market.type !== "weekly" || await weeklyExamReady(await readWeeklyExam(market.examId))) ready.push(market);
  }
  return [...ready, ...history];
}

async function chart(marketId, interval, now) {
  const { ms } = intervalFor(interval, "1m");
  return aggregateCandles(ExchangeTrade, {
    match: { marketId, tradedAt: { $gte: new Date(candleWindow(now, ms)), $lte: now } },
    dateField: "tradedAt", priceField: "price", ms, volume: true,
  });
}

function orderView(row) {
  return { id: String(row._id), action: row.action, direction: row.direction, side: row.side, price: row.price,
    quantity: row.quantity, remaining: row.remaining, status: row.status, acceptedAt: row.acceptedAt };
}

async function ownMarketState(market, userId, now) {
  if (!userId) return { eligible: false, reason: "로그인 후 주문할 수 있습니다.", available: null, orders: [], positions: [] };
  const filter = { marketId: market._id, userId };
  const [wallet, account, orders, positions] = await Promise.all([
    ExchangeWallet.findById(userId).lean(),
    ExchangeAccount.findOne(filter).lean(),
    ExchangeOrder.find(filter).sort({ acceptedAt: -1 }).limit(30).lean(),
    ExchangePosition.find(filter).sort({ _id: -1 }).limit(60).lean(),
  ]);
  let reason = "";
  if (publicState(market, now) !== "open") reason = "현재 주문을 접수하지 않습니다.";
  else if (market.type === "weekly") {
    const exam = await readWeeklyExam(market.examId);
    if (exam?.status !== "open" || !await weeklyExamReady(exam)
      || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt) reason = "주간 모의고사 공개를 기다리는 중입니다.";
    else if (!await PrivateMockExamAttempt.exists({ ...validAttempts(exam, now), userId })) reason = "이번 주 모의고사를 완료하면 주문할 수 있습니다.";
  }
  return { eligible: !reason, reason, available: ((wallet?.available ?? INITIAL_TP) + (account?.cash ?? 0)) / TP_SCALE,
    orders: orders.map(orderView), positions: positions.map((row) => ({
      id: String(row._id), direction: row.direction, price: row.price, quantity: row.quantity,
      remaining: row.remaining, realized: market.decision === "void" ? 0 : row.realized / TP_SCALE,
    })) };
}

async function terminalState({ marketId, userId, interval = "1m", marketType, now = new Date() } = {}) {
  const list = await marketList(now);
  const choices = marketType ? list.filter((row) => row.type === marketType) : list;
  const market = marketId ? list.find((row) => String(row._id) === marketId) || await ExchangeMarket.findById(marketId).lean()
    : choices.find((row) => publicState(row, now) === "open")
      || choices.find((row) => ["scheduled", "waiting", "paused"].includes(publicState(row, now)));
  const result = { serverNow: now, markets: list.map((row) => marketView(row, now)), market: null };
  if (!market) return result;

  const view = marketView(market, now);
  if (view.status === "open" && market.type === "weekly") {
    const exam = await readWeeklyExam(market.examId);
    if (exam?.status !== "open" || !await weeklyExamReady(exam) || +exam.closeAt !== +market.closeAt) {
      view.status = "waiting";
      view.statusLabel = STAGES.waiting;
    }
  }
  const [book, trades, candles, ticks, own] = await Promise.all([
    ExchangeOrder.aggregate([
      { $match: { marketId: market._id, status: "working" } },
      { $group: { _id: { side: "$side", price: "$price" }, quantity: { $sum: "$remaining" } } },
    ]),
    ExchangeTrade.find({ marketId: market._id }).sort({ tradedAt: -1, sequence: -1 }).limit(20)
      .select("price quantity tradedAt").lean(),
    chart(market._id, interval, new Date(Math.min(+now, +(market.lastTradeAt || market.closeAt)))),
    ExchangeTick.find({ marketId: market._id, publishAt: { $lte: now } }).sort({ publishAt: -1 }).limit(120)
      .select("mpi sampledAt publishAt populationCount sampleCount").lean(),
    ownMarketState(market, userId, now),
  ]);
  const side = (key, sign) => book.filter((row) => row._id.side === key)
    .sort((a, b) => sign * (a._id.price - b._id.price)).slice(0, 10)
    .map((row) => ({ price: row._id.price, quantity: row.quantity }));
  const showBook = view.status === "open" || view.status === "paused";
  return { ...result, market: view, bids: showBook ? side("buy", -1) : [], asks: showBook ? side("sell", 1) : [], trades, candles,
    ticks: ticks.reverse(), own: { ...own, eligible: own.eligible && view.status === "open" } };
}

async function leaderboard() {
  const rows = await ExchangePosition.aggregate([
    { $lookup: { from: ExchangeMarket.collection.name, localField: "marketId", foreignField: "_id", as: "market" } },
    { $match: { "market.phase": "settled" } },
    { $group: { _id: "$userId", profit: { $sum: "$realized" } } },
    { $lookup: { from: ExchangeWallet.collection.name, localField: "_id", foreignField: "_id", as: "wallet" } },
    { $match: { "wallet.rankingVisible": true } },
    { $sort: { profit: -1, _id: 1 } },
    { $limit: 50 },
  ]);
  const users = await User.find({ _id: { $in: rows.map((row) => row._id) } })
    .select("name").lean();
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  return rows.filter((row) => names.has(String(row._id))).map((row) => ({ name: names.get(String(row._id)), profit: row.profit / TP_SCALE }));
}

async function adminState(year, grade, now = new Date()) {
  const [markets, settings, events, schedules, sourceExams] = await Promise.all([
    marketList(now), readSetting(), ExchangeEvent.find().sort({ createdAt: -1 }).limit(25).lean(),
    ExchangeMarket.find({ year, grade, type: { $in: ["mock", "csat"] } }).lean(),
    PrivateMockExam.find({ formCode: "WEEKLY", isTest: { $ne: true }, closeAt: { $gt: now } })
      .select("title status releaseAt closeAt questionCount archiveItemId +answerKey +points").sort({ releaseAt: 1 }).limit(12).lean(),
  ]);
  const controls = [];
  for (const market of markets) {
    const [openOrders, latestTick] = await Promise.all([
      ExchangeOrder.countDocuments({ marketId: market._id, status: "working" }),
      ExchangeTick.findOne({ marketId: market._id }).sort({ sampledAt: -1 }).lean(),
    ]);
    controls.push({ ...marketView(market, now), openOrders, latestTick, appliedMinimum: market.appliedMinimum,
      minimumAttempts: market.minimumAttempts ?? settings, escrow: market.escrow / TP_SCALE, reason: market.reason,
      settlementSource: market.settlementSource, population: market.population });
  }
  const exams = [];
  for (const exam of sourceExams) {
    const [ready, count, file] = await Promise.all([
      weeklyExamReady(exam), PrivateMockExamAttempt.countDocuments(validAttempts(exam, now)),
      exam.archiveItemId ? ArchiveItem.exists({ _id: exam.archiveItemId, deletedAt: null }) : null,
    ]);
    exams.push({ id: String(exam._id), title: exam.title, status: exam.status, releaseAt: exam.releaseAt, count, ready, file: Boolean(file) });
  }
  return { markets: controls, settings, events, schedules, exams };
}

async function runExchangeTick(now = new Date(), maintain = true) {
  if (maintain) await syncWeeklyMarkets(now);
  const weekly = await ExchangeMarket.find({ type: "weekly", phase: "scheduled", opensAt: { $lte: now }, closeAt: { $gt: now } }).lean();
  for (const market of weekly) await saveSample(market, now);
  if (!maintain) return;
  const markets = await ExchangeMarket.find({ $or: [
    { phase: "settling" },
    { phase: "scheduled", bookClosedAt: null, closeAt: { $lte: now } },
    { phase: "scheduled", type: "weekly", opensAt: { $lte: now } },
  ] }).sort({ updatedAt: 1 }).limit(50).lean();
  for (const market of markets) {
    try { await processMarket(market, now); }
    catch (cause) { console.error("[exchange] market maintenance failed", String(market._id), cause.message); }
  }
}

async function startExchangeScheduler() {
  await Promise.all(Object.values(models).map((model) => model.init()));
  if (process.env.DISABLE_SCHEDULERS === "1") return;
  let running = false;
  let lastMaintenance = 0;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await withSchedulerLease({ name: "exchange", leaseMs: 10_000 }, async () => {
        const now = new Date();
        const maintain = +now - lastMaintenance >= 5000;
        await runExchangeTick(now, maintain);
        if (maintain) lastMaintenance = +now;
      });
    } catch (cause) {
      console.error("[exchange] scheduler failed", cause.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, 1000);
  timer.unref();
  void run();
}

module.exports = { marketList, marketView, terminalState, orderView, adminState, leaderboard, runExchangeTick, startExchangeScheduler };
