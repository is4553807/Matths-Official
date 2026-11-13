const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const {
  ExchangeMarket, ExchangeOrder, ExchangeTrade, ExchangeTick, ExchangeWallet, ExchangeAccount, ExchangePosition, ExchangeEvent, ExchangeReference,
} = models;
const {
  publicState, validAttempts, weeklyExamReady, readWeeklyExam, readSetting, readMpiMinimum, syncWeeklyMarkets, saveObservedMpi,
  publishedMpiFilter, latestPublishedMpi, activeLiquidityPlan, bookLevels, marketReference, liveAttemptRows, pendingAttempts, sampleMinute,
} = require("./exchangeMarketService");
const { TP_SCALE, processMarket, maintainMarketMaker } = require("./exchangeTradingService");
const { EXCHANGE_WALLET_ID, FEE_RATES, initialBalance } = require("./exchangeFees");
const { withSchedulerLease } = require("./schedulerLeaseService");

const STAGES = { scheduled: "개장 예정", waiting: "개장 조건 대기", open: "거래 중", paused: "일시 중지",
  verifying: "성적 검증 중", "awaiting-result": "성적 발표 대기", settling: "정산 중", settled: "정산 완료", void: "시장 취소" };
const { intervalFor, bucketStart, candleWindow, aggregateCandles } = require("./exchangeChartService");

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

async function futuresChartHistory(marketId, interval, before, now = new Date()) {
  const { ms } = intervalFor(interval, "1m");
  // History cursors are exclusive candle boundaries, including for off-boundary requests.
  const tradedAt = before ? { $lt: new Date(bucketStart(before, ms)), $lte: now } : { $lte: now };
  const latest = await ExchangeTrade.findOne({
    marketId, tradedAt,
  }).select("marketId tradedAt").sort({ tradedAt: -1 }).lean();
  return latest ? chart(latest.marketId, interval, latest.tradedAt) : [];
}

function orderView(row) {
  return { id: String(row._id), action: row.action, direction: row.direction, side: row.side, price: row.price,
    quantity: row.quantity, remaining: row.remaining, feeReserved: (row.feeReserved ?? 0) / TP_SCALE,
    feesPaid: (row.feesPaid ?? 0) / TP_SCALE, status: row.status, acceptedAt: row.acceptedAt };
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
    else if (String(userId) !== EXCHANGE_WALLET_ID && !await PrivateMockExamAttempt.exists({ ...validAttempts(exam, now), userId })) reason = "이번 주 모의고사를 완료하면 주문할 수 있습니다.";
  }
  const walletBalance = wallet?.available ?? initialBalance(userId);
  return { eligible: !reason, reason, available: (walletBalance + (account?.cash ?? 0)) / TP_SCALE,
    feeAvailable: walletBalance / TP_SCALE,
    feeRates: String(userId) === EXCHANGE_WALLET_ID ? { maker: 0, taker: 0 } : FEE_RATES,
    orders: orders.map(orderView), positions: positions.map((row) => ({
      id: String(row._id), direction: row.direction, price: row.price, quantity: row.quantity,
      remaining: row.remaining, realized: market.decision === "void" ? 0 : row.realized / TP_SCALE,
    })) };
}

async function marketSamples(market, now, limit, { forAdmin = false } = {}) {
  if (market.type !== "weekly") return [];
  const filter = forAdmin ? { marketId: market._id, kind: "observed" }
    : { ...publishedMpiFilter(market._id, now), populationCount: { $gte: await readMpiMinimum(market) } };
  return ExchangeTick.find(filter).sort({ publishAt: -1 }).limit(limit)
    .select("mpi sampledAt dataCutoffAt publishAt populationCount").lean();
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
  const snapshot = market.type === "weekly" ? await latestPublishedMpi(market, now) : undefined;
  const chartEnd = new Date(Math.min(+now, +market.closeAt));
  const { ms } = intervalFor(interval, "1m");
  const [book, trades, candles, ticks, own, references] = await Promise.all([
    view.status === "open" ? bookLevels(market._id, now, null, snapshot?._id ?? null, EXCHANGE_WALLET_ID,
      market.marketMakerEnabled !== false && Boolean(activeLiquidityPlan(market, now))) : [],
    ExchangeTrade.find({ marketId: market._id }).sort({ tradedAt: -1, sequence: -1 }).limit(20)
      .select("price quantity tradedAt -_id").lean(),
    chart(market._id, interval, new Date(Math.min(+now, +(market.lastTradeAt || market.closeAt)))),
    marketSamples(market, now, 120),
    ownMarketState(market, userId, now),
    market.type === "weekly" ? ExchangeReference.find({
      marketId: market._id, at: { $gte: new Date(candleWindow(chartEnd, ms)), $lte: chartEnd },
    }).sort({ at: -1, sequence: -1 }).limit(400).select("at price -_id").lean() : [],
  ]);
  references.reverse();
  const side = (key, sign) => book.filter((row) => row._id.side === key)
    .sort((a, b) => sign * (a._id.price - b._id.price)).slice(0, 10)
    .map((row) => ({ price: row._id.price, quantity: row.quantity, operatorQuantity: row.operatorQuantity }));
  const bids = side("buy", -1);
  const asks = side("sell", 1);
  const { price } = marketReference(bids[0], asks[0]);
  const reference = { price };
  if (market.type === "weekly" && (reference.price !== null || references.at(-1)?.price != null)) {
    references.push({ at: chartEnd, ...reference });
  }
  const publicLevels = (levels) => levels.map(({ price, quantity }) => ({ price, quantity }));
  return { ...result, market: view, bids: publicLevels(bids), asks: publicLevels(asks), reference, references, trades, candles,
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
  const [markets, settings, minimumMpiAttempts, events, schedules, sourceExams] = await Promise.all([
    marketList(now), readSetting(), readMpiMinimum(), ExchangeEvent.find().sort({ createdAt: -1 }).limit(25).lean(),
    ExchangeMarket.find({ year, grade, type: { $in: ["mock", "csat"] } }).lean(),
    PrivateMockExam.find({ formCode: "WEEKLY", isTest: { $ne: true }, closeAt: { $gt: now } })
      .select("title status releaseAt closeAt questionCount archiveItemId +answerKey +points").sort({ releaseAt: 1 }).limit(12).lean(),
  ]);
  const controls = [];
  for (const market of markets) {
    const [openOrders, [latestTick], pending] = await Promise.all([
      ExchangeOrder.countDocuments({ marketId: market._id, status: "working" }),
      marketSamples(market, now, 1, { forAdmin: true }),
      market.type === "weekly" && publicState(market, now) === "verifying"
        ? readWeeklyExam(market.examId).then((exam) => exam ? pendingAttempts(exam, now) : []) : [],
    ]);
    controls.push({ ...marketView(market, now), openOrders, latestTick, appliedMinimum: market.appliedMinimum, marketMakerEnabled: market.marketMakerEnabled !== false,
      pendingVerification: pending.length > 0, internalMpiCount: market.internalMpiCount, liquidityPlan: market.liquidityPlan,
      liquidityPlanPending: market.liquidityPlan?.endsAt > now && !market.liquidityPlan?.stoppingAt,
      minimumAttempts: market.minimumAttempts ?? settings,
      minimumMpiAttempts: Math.max(5, market.minimumMpiAttempts ?? minimumMpiAttempts), mpiMinimumOverride: market.minimumMpiAttempts,
      escrow: market.escrow / TP_SCALE, reason: market.reason,
      settlementSource: market.settlementSource, population: market.population });
  }
  const exams = [];
  for (const exam of sourceExams) {
    const [ready, count, file] = await Promise.all([
      weeklyExamReady(exam), liveAttemptRows(validAttempts(exam, now)).append({ $count: "count" }).then(([row]) => row?.count ?? 0),
      exam.archiveItemId ? ArchiveItem.exists({ _id: exam.archiveItemId, deletedAt: null }) : null,
    ]);
    exams.push({ id: String(exam._id), title: exam.title, status: exam.status, releaseAt: exam.releaseAt, count, ready, file: Boolean(file) });
  }
  return { markets: controls, settings, minimumMpiAttempts, events, schedules, exams };
}

async function runExchangeTick(now = new Date(), maintain = true, sample = true, clock = () => now) {
  if (maintain) await syncWeeklyMarkets(now);
  if (sample) {
    const weekly = await ExchangeMarket.find({ type: "weekly", phase: "scheduled", opensAt: { $lte: now }, closeAt: { $gt: now } }).lean();
    for (const market of weekly) {
      try { await saveObservedMpi(market, now, clock); }
      catch (cause) { console.error("[exchange] MPI update failed", String(market._id), cause.message); }
    }
  }
  if (!maintain) return;
  const markets = await ExchangeMarket.find({ $or: [
    { phase: "settling" },
    { phase: "scheduled", bookClosedAt: null, closeAt: { $lte: now } },
    { phase: "scheduled", type: "weekly", opensAt: { $lte: now } },
  ] }).sort({ updatedAt: 1 }).limit(50).lean();
  for (const market of markets) {
    try {
      await processMarket(market, now);
      if (market.type === "weekly" && market.openedAt && market.phase === "scheduled" && now < market.closeAt) {
        await maintainMarketMaker(market._id, clock);
      }
    }
    catch (cause) { console.error("[exchange] market maintenance failed", String(market._id), cause.message); }
  }
}

async function startExchangeScheduler() {
  await Promise.all(Object.values(models).map((model) => model.init()));
  await ExchangeWallet.updateOne({ _id: EXCHANGE_WALLET_ID },
    { $setOnInsert: { available: 0, collectedFees: 0 } }, { upsert: true, setDefaultsOnInsert: false });
  if (process.env.DISABLE_SCHEDULERS === "1") return;
  let running = false;
  let lastMaintenance = 0;
  let lastSampleMinute;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const maintain = +now - lastMaintenance >= 5000;
      const minute = +sampleMinute(now);
      const sample = minute !== lastSampleMinute;
      if (!maintain && !sample) return;
      await withSchedulerLease({ name: "exchange", leaseMs: 10_000 }, async () => {
        await runExchangeTick(now, maintain, sample, () => new Date());
        if (maintain) lastMaintenance = +now;
        if (sample) lastSampleMinute = minute;
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

module.exports = { marketList, marketView, terminalState, futuresChartHistory, orderView, adminState, leaderboard, runExchangeTick, startExchangeScheduler };
