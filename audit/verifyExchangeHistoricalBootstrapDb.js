const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { syncWeeklyMarkets } = require("../services/exchangeMarketService");
const { runHistoricalBootstrap } = require("../services/exchangeHistoricalBootstrapService");
const { runExchangeTick, terminalState } = require("../services/exchangeService");
const { mpiState } = require("../services/exchangeMpiService");
const { placeOrder } = require("../services/exchangeTradingService");
const { EXCHANGE_WALLET_ID } = require("../services/exchangeFees");

const { ExchangeMarket, ExchangeOrder, ExchangeTrade, ExchangePosition, ExchangeAccount, ExchangeWallet,
  ExchangeSetting, ExchangeTick, ExchangeReference, ExchangeExamBotAttempt, ExchangeBotReplayTrade } = models;
const HOUR = 3_600_000;
const opensAt = new Date("2026-11-08T06:00:00Z");
const closeAt = new Date(+opensAt + 141 * HOUR);
const friday = new Date(+opensAt + 125 * HOUR + 1234);

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  process.env.EXCHANGE_OPERATOR_ONLY = "1";
  await mongoose.connect(process.env.DB);
  await Promise.all([...Object.values(models), ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User].map((model) => model.init()));
  const [admin, student] = await User.create([
    { name: "Bootstrap operator", email: "op@fixture.invalid", role: "admin", passwordHash: "test" },
    { name: "Existing student", email: "student@fixture.invalid", role: "student", passwordHash: "test" },
  ]);
  const archive = await ArchiveItem.create({
    title: "Weekly paper", storedName: "weekly.pdf", originalName: "weekly.pdf", mimeType: "application/pdf",
    sizeBytes: 100, uploadedBy: admin._id, storageProvider: "R2", r2ObjectKey: "audit/weekly.pdf",
  });
  const points = [...Array(3).fill(2), ...Array(14).fill(3), ...Array(13).fill(4)];
  const exam = await PrivateMockExam.create({
    title: "Weekly Exchange", weekKey: "2026-11-08", formCode: "WEEKLY", attemptNumber: 1, status: "open",
    releaseAt: opensAt, closeAt, aggregationStartsAt: closeAt, rankingPublishesAt: closeAt,
    archiveAt: closeAt, reviewPublishesAt: closeAt, questionCount: points.length, points,
    answerKey: points.map(() => "1"), archiveItemId: archive._id, createdBy: admin._id,
  });
  await ExchangeSetting.create({ _id: "default", automatedTradingDisabled: true });
  await ExchangeWallet.create({ _id: EXCHANGE_WALLET_ID, available: 300_000 });
  await syncWeeklyMarkets(new Date(+opensAt + HOUR));
  const market = await ExchangeMarket.findOne({ examId: exam._id });
  const marketId = market._id;
  const filter = { marketId };
  await ExchangeMarket.updateOne({ _id: marketId }, { $set: { minimumMpiAttempts: 1 } });
  const oldAt = new Date(+opensAt + 100 * HOUR);
  await PrivateMockExamAttempt.create({
    examId: exam._id, userId: student._id, weekKey: exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
    status: "submitted", score: 70, submittedAt: oldAt, submissionFinalization: { status: "completed", completedAt: oldAt },
  });
  const submit = (userId, direction, price, actorId) => placeOrder({
    marketId, userId, actorId, clock: () => oldAt,
    input: { action: "open", direction, price, quantity: 1, commandId: randomUUID() },
  });
  await submit(student._id, "short", 700);
  await submit(EXCHANGE_WALLET_ID, "long", 700, admin._id);
  const resting = await submit(EXCHANGE_WALLET_ID, "long", 500, admin._id);
  const originalTrade = await ExchangeTrade.findOne(filter).lean();
  const originalAccount = await ExchangeAccount.findOne({ marketId, userId: EXCHANGE_WALLET_ID }).lean();
  const originalTick = await ExchangeTick.create({
    marketId, kind: "observed", sampledAt: oldAt, dataCutoffAt: oldAt, publishAt: new Date(+oldAt + HOUR / 2),
    populationCount: 1, mpi: 700,
  });

  const complete = await runHistoricalBootstrap({ clock: () => friday });
  assert.equal(String(complete._id), String(marketId));
  assert.equal(complete.historicalBootstrap.status, "complete");
  assert.equal(+complete.historicalBootstrap.cursorAt, +friday);
  assert.equal(+complete.openedAt, +opensAt);
  assert.ok((await ExchangeTick.findById(originalTick._id)).supersededAt);
  assert.deepEqual(await ExchangeTrade.findById(originalTrade._id).lean(), originalTrade);
  assert.deepEqual(await ExchangeAccount.findById(originalAccount._id).lean(), originalAccount);
  assert.equal((await ExchangeOrder.findById(resting._id)).status, "working");
  assert.equal((await ExchangeSetting.findById("default")).automatedTradingDisabled, true);
  assert.equal(await ExchangeBotReplayTrade.countDocuments(filter), 0);

  const trades = await ExchangeTrade.find(filter).sort({ tradedAt: 1, sequence: 1 }).lean();
  const botBot = trades.filter((row) => row.makerSource === "BOT" && row.takerSource === "BOT");
  const botMM = trades.filter((row) => row.makerSource === "MM" && row.takerSource === "BOT");
  assert.ok(botBot.length > 0 && botMM.length > 0);
  assert.ok(trades.at(-1).tradedAt > new Date(+friday - 12 * HOUR));
  assert.equal(complete.lastPrice, trades.at(-1).price);
  assert.ok(botBot.every((row) => row.createdAt > row.tradedAt));
  const positions = await ExchangePosition.find(filter).lean();
  const long = positions.filter((row) => row.direction === "long").reduce((sum, row) => sum + row.remaining, 0);
  const short = positions.filter((row) => row.direction === "short").reduce((sum, row) => sum + row.remaining, 0);
  assert.equal(long, short);
  assert.equal(complete.escrow, long * 100_000);
  assert.equal(await ExchangeWallet.countDocuments({ available: { $lt: 0 } }), 0);
  assert.ok(await ExchangeReference.exists({ ...filter, "bids.0": { $exists: true } }));
  assert.ok(await ExchangeReference.exists({ ...filter, "asks.0": { $exists: true } }));

  const [futures, mpi] = await Promise.all([
    terminalState({ marketId: String(marketId), now: friday }), mpiState({ marketId: String(marketId), now: friday }),
  ]);
  assert.equal(futures.interval, "2h");
  assert.equal(futures.market.volume, trades.reduce((sum, row) => sum + row.quantity, 0));
  assert.ok(futures.bids.length && futures.asks.length);
  assert.ok(futures.candles[0]._id < +opensAt + 4 * HOUR);
  assert.ok(mpi.candles[0]._id < +opensAt + 4 * HOUR);
  assert.equal(mpi.interval, "2h");
  assert.equal(mpi.latest.humanPopulationCount, 1);
  assert.ok(mpi.latest.publishAt <= friday && +friday - +mpi.latest.dataCutoffAt >= HOUR / 2);

  const attempts = await ExchangeExamBotAttempt.countDocuments(filter);
  await runHistoricalBootstrap({ clock: () => friday });
  assert.equal(await ExchangeTrade.countDocuments(filter), trades.length);
  assert.equal(await ExchangeExamBotAttempt.countDocuments(filter), attempts);
  for (let minute = 1; minute <= 70; minute++) {
    const at = new Date(+friday + minute * 60_000);
    await runExchangeTick(at, true, true);
  }
  assert.ok(await ExchangeExamBotAttempt.countDocuments(filter) > attempts);
  assert.ok(await ExchangeTrade.exists({ ...filter, tradedAt: { $gt: friday } }));
  assert.equal((await ExchangeMarket.findById(marketId)).historicalBootstrap.status, "complete");

  const { server } = require("../server");
  const listener = await new Promise((resolve) => {
    const http = server.listen(0, "127.0.0.1", () => resolve(http));
  });
  try {
    const base = `http://127.0.0.1:${listener.address().port}`;
    assert.equal((await fetch(`${base}/api/exchange/markets/current`)).status, 401);
    assert.equal((await fetch(`${base}/exchange/futures`, { redirect: "manual" })).status, 302);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
  console.log(`Historical Exchange verified: ${attempts} submissions, ${botBot.length} BOT/BOT, ${botMM.length} MM/BOT, preserved manual ledger, live handoff and restricted HTTP.`);
}

main().catch((cause) => { console.error(cause); process.exitCode = 1; }).finally(() => mongoose.disconnect());
