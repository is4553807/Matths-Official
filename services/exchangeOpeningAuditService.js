const { createHash } = require("node:crypto");
const { ExchangeEvent, ExchangeMarket, ExchangeExamBotAttempt, ExchangeTick, ExchangeTrade } = require("../models/exchangeModel");
const { LIVE_OPENING_BOT_COUNT, LIVE_OPENING_DELAY_MS } = require("./exchangeScenarioService");
const { isLiveWeeklyBootstrap } = require("./exchangeBootstrapService");
const { EXCHANGE_WALLET_ID } = require("./exchangeFees");
const { activeLiquidityPlan, bookLevels, latestPublishedMpi, publicState, publishedMpiFilter, readMpiMinimum } = require("./exchangeMarketService");

const ACTION = "weekly-opening-check";
const MINUTE = 60_000;
const timeInSeoul = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function openingSummary({ openedAt, openingBatch, mpi, book, firstTrade, completedAt }) {
  return [
    openedAt ? `개장 ${timeInSeoul.format(openedAt)}` : "개장 미확인",
    openingBatch ? `Exam Bot ${openingBatch.count}건 (${timeInSeoul.format(openingBatch.submittedAt)})` : "Exam Bot 제출 미확인",
    mpi ? `첫 MPI ${mpi.value} (${timeInSeoul.format(mpi.publishedAt)})` : "첫 MPI 미확인",
    book ? `호가 매수 ${book.bidLevels}단 (최고 ${book.bestBid}) · 매도 ${book.askLevels}단 (최저 ${book.bestAsk}) (${timeInSeoul.format(book.at)})` : "양쪽 호가 미확인",
    firstTrade ? `자동 체결 ${firstTrade.price} × ${firstTrade.quantity} (${timeInSeoul.format(firstTrade.tradedAt)})` : "자동 체결 미확인",
    completedAt ? "점검 종료" : "점검 중",
  ].join(" / ");
}

async function observeBook(marketId, now) {
  const market = await ExchangeMarket.findById(marketId)
    .select("phase type paused openedAt opensAt closeAt minimumMpiAttempts liquidityPlan marketMakerEnabled marketMakerDecision.mode marketMakerDecision.quoteKey").lean();
  if (!market || publicState(market, now) !== "open") return null;
  const snapshot = await latestPublishedMpi(market, now);
  const maker = market.marketMakerEnabled !== false;
  const makerQuoteKey = maker && market.marketMakerDecision?.mode === "B" ? market.marketMakerDecision.quoteKey : undefined;
  const levels = await bookLevels(marketId, now, null, snapshot?._id ?? null, EXCHANGE_WALLET_ID,
    maker && Boolean(activeLiquidityPlan(market, now)), false, makerQuoteKey);
  const bids = levels.filter((level) => level._id.side === "buy").sort((a, b) => b._id.price - a._id.price);
  const asks = levels.filter((level) => level._id.side === "sell").sort((a, b) => a._id.price - b._id.price);
  if (!bids.length || !asks.length || bids[0]._id.price >= asks[0]._id.price) return null;
  return { at: now, bidLevels: bids.length, askLevels: asks.length, bestBid: bids[0]._id.price, bestAsk: asks[0]._id.price };
}

async function recordWeeklyOpeningAudit(market, now) {
  if (!isLiveWeeklyBootstrap(market) || now < market.opensAt) return;
  const batchAt = new Date(+market.opensAt + LIVE_OPENING_DELAY_MS);
  const deadline = new Date(+batchAt + 15 * MINUTE);
  if (now >= new Date(+deadline + 30 * MINUTE)) return;

  const marketId = market._id;
  const eventId = createHash("sha256").update(`${ACTION}:${marketId}`).digest("hex").slice(0, 24);
  const existing = await ExchangeEvent.findById(eventId).select("detail").lean();
  if (existing?.detail?.completedAt) return;

  const openedAt = market.openedAt && market.openedAt <= now ? market.openedAt : null;
  const detail = { ...existing?.detail, scheduledOpenAt: market.opensAt, scheduledBatchAt: batchAt, openedAt };
  if (now < batchAt && (!openedAt || existing)) return;

  if (now >= batchAt) {
    const [attempts, snapshot, firstTrade] = await Promise.all([
      ExchangeExamBotAttempt.find({ marketId, examId: market.examId, source: "BOT", openingBatch: true, reconstructedAt: null,
        submittedAt: { $gte: batchAt, $lte: now, $lt: deadline } })
        .select("submittedAt -_id").sort({ submittedAt: 1 }).lean(),
      ExchangeTick.findOne({ ...publishedMpiFilter(marketId, now), openingBotBatch: true, unavailable: false,
        publishAt: { $gte: batchAt, $lte: now, $lt: deadline } }).select("mpi publishAt populationCount botPopulationCount").lean(),
      ExchangeTrade.findOne({ marketId, botOnly: true, tradedAt: { $gte: batchAt, $lte: now, $lt: deadline } })
        .sort({ tradedAt: 1, sequence: 1 }).select("price quantity tradedAt makerSource takerSource -_id").lean(),
    ]);
    if (attempts.length) detail.openingBatch = { count: attempts.length, submittedAt: attempts[0].submittedAt };
    if (snapshot && snapshot.populationCount >= await readMpiMinimum(market)) {
      detail.mpi = { value: snapshot.mpi, publishedAt: snapshot.publishAt, botCount: snapshot.botPopulationCount };
    }
    if (!detail.book && now < deadline) detail.book = await observeBook(marketId, now);
    if (firstTrade) detail.firstTrade = firstTrade;
    if (now >= deadline || (openedAt && detail.openingBatch?.count === LIVE_OPENING_BOT_COUNT && detail.mpi && detail.book && detail.firstTrade)) {
      detail.completedAt = now;
    }
    if (!detail.completedAt && !detail.openingBatch && !detail.mpi && !detail.book && !detail.firstTrade && existing) return;
  }

  detail.reason = openingSummary(detail);
  if (detail.reason === existing?.detail?.reason) return;
  const saved = await ExchangeEvent.updateOne({ _id: eventId, "detail.completedAt": null }, {
    $setOnInsert: { action: ACTION, marketId }, $set: { at: now, detail },
  }, { upsert: !existing });
  if (detail.completedAt && (saved.modifiedCount || saved.upsertedCount)) console.info(`[exchange] ${ACTION} ${marketId} ${detail.reason}`);
}

module.exports = { recordWeeklyOpeningAudit };
