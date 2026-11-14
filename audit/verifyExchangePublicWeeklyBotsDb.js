const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { LIVE_WEEKLY_POLICY, traderId } = require("../services/exchangeBootstrapService");
const { runExchangeTick, terminalState } = require("../services/exchangeService");
const { placeOrder, TP_SCALE } = require("../services/exchangeTradingService");
const { mpiState } = require("../services/exchangeMpiService");

const {
  ExchangeMarket, ExchangeSetting, ExchangeExamBotAttempt, ExchangeOrder, ExchangeTrade, ExchangeWallet,
  ExchangeAccount, ExchangePosition, ExchangeTick, ExchangeBotReplayMpi, ExchangeBotReplayTrade,
} = models;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const opensAt = new Date("2026-11-15T06:00:00.000Z");
const at = (minutes) => new Date(+opensAt + minutes * MINUTE);
const points = [...Array(3).fill(2), ...Array(14).fill(3), ...Array(13).fill(4)];
const run = (now) => runExchangeTick(now, true, true, () => now);

async function examFor(admin, open) {
  const close = new Date(+open + 141 * HOUR);
  const weekKey = open.toISOString().slice(0, 10);
  const archive = await ArchiveItem.create({
    title: `Weekly bot audit paper ${weekKey}`, storedName: `weekly-${weekKey}.pdf`, originalName: "weekly.pdf", mimeType: "application/pdf",
    sizeBytes: 100, uploadedBy: admin._id, storageProvider: "R2", r2ObjectKey: `audit/weekly-${weekKey}.pdf`,
  });
  return PrivateMockExam.create({
    title: `Audit week ${weekKey}`, weekKey, formCode: "WEEKLY", attemptNumber: 1, status: "scheduled",
    releaseAt: open, closeAt: close, aggregationStartsAt: close, rankingPublishesAt: close,
    archiveAt: close, reviewPublishesAt: close, questionCount: points.length, points,
    answerKey: points.map(() => "1"), archiveItemId: archive._id, createdBy: admin._id,
  });
}

async function assertNoMarketActivity(marketId) {
  for (const model of [ExchangeExamBotAttempt, ExchangeOrder, ExchangeTrade, ExchangeTick]) {
    assert.equal(await model.countDocuments({ marketId }), 0);
  }
}

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  process.env.EXCHANGE_OPERATOR_ONLY = "0";
  await mongoose.connect(process.env.DB);
  await Promise.all([...Object.values(models), ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User].map((model) => model.init()));
  const [admin, student] = await User.create([
    { name: "Weekly bot audit admin", email: "admin@weekly-bots.fixture.invalid", role: "admin", passwordHash: "test" },
    { name: "Weekly bot audit student", email: "student@weekly-bots.fixture.invalid", role: "student", passwordHash: "test" },
  ]);
  const exam = await examFor(admin, opensAt);
  await ExchangeSetting.create({ _id: "default", automatedTradingDisabled: true, publicMarketMakerEnabled: true });
  await run(at(-60));
  const preregistered = await ExchangeMarket.findOne({ examId: exam._id });
  const marketId = preregistered._id;
  const filter = { marketId };
  assert.equal(preregistered.botParticipation, false);
  assert.equal(preregistered.openedAt, undefined);
  assert.equal(preregistered.marketMakerEnabled, true);

  const next = await examFor(admin, new Date(+opensAt + 7 * 24 * HOUR));
  const offSchedule = await examFor(admin, new Date(+opensAt + 2 * 24 * HOUR));
  await ExchangeSetting.updateOne({ _id: "default" }, { $set: { publicWeeklyBotsEnabled: true } });
  await run(at(-1));
  const prepared = await ExchangeMarket.findOne({ examId: exam._id }).select("+botSeed").lean();
  assert.equal(String(prepared?._id), String(marketId));
  assert.equal(prepared.bootstrapPolicy?.version, LIVE_WEEKLY_POLICY.version);
  assert.equal(prepared.bootstrapPolicy.submissionMinutes, 20);
  assert.ok(prepared.botSeed);
  assert.equal(prepared.botParticipation, true);
  assert.equal(prepared.tradingBotsEnabled, true);
  assert.equal(prepared.marketMakerEnabled, true);
  assert.equal(prepared.historicalBootstrap?.status, undefined);
  const future = await ExchangeMarket.findOne({ examId: next._id }).lean();
  assert.equal(future.bootstrapPolicy?.version, LIVE_WEEKLY_POLICY.version);
  assert.equal((await ExchangeMarket.findOne({ examId: offSchedule._id })).botParticipation, false);
  await assertNoMarketActivity(marketId);
  await assertNoMarketActivity(future._id);
  const scheduled = await terminalState({ marketId: String(marketId), now: at(-1), publicOnly: true });
  assert.equal(scheduled.market?.status, "scheduled");
  assert.equal(scheduled.market?.liveWeeklyBots, true);
  assert.equal(scheduled.market?.historicalBootstrap, false);

  // Keep random-looking bot answers reproducible without substituting orders or submissions.
  await ExchangeMarket.updateOne({ _id: marketId }, { $set: { botSeed: "weekly-public-bots-audit" } });
  await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "open" } });
  await run(opensAt);
  assert.equal(+(await ExchangeMarket.findById(marketId)).openedAt, +opensAt);
  assert.equal(await ExchangeExamBotAttempt.countDocuments(filter), 0);

  // Simulate an offline worker in the second slot. The next pass records the
  // current slot at the processing clock, with no catch-up for slot two.
  for (const minute of [13, 53, 73, 93, 113]) await run(at(minute));
  const roster = await ExchangeExamBotAttempt.find(filter).select("+answers").sort({ submittedAt: 1 }).lean();
  assert.deepEqual(roster.map(({ number }) => number), [1, 3, 4, 5, 6]);
  assert.deepEqual(roster.map(({ submittedAt }) => +submittedAt), [13, 53, 73, 93, 113].map((minute) => +at(minute)));
  assert.ok(roster.every(({ answers, score, reconstructedAt, source }) =>
    source === "BOT" && !reconstructedAt && answers.length === points.length
      && answers.reduce((sum, answer, index) => sum + (answer === "1" ? points[index] : 0), 0) === score));
  const before = await mpiState({ marketId: String(marketId), now: at(142), publicOnly: true });
  assert.equal(before.latest, null);
  assert.equal(before.candles.length, 0);
  const first = await mpiState({ marketId: String(marketId), now: at(143), publicOnly: true });
  assert.equal(first.latest.populationCount, 5);
  assert.equal(first.latest.humanPopulationCount, 0);
  assert.equal(first.latest.botPopulationCount, 5);
  assert.equal(+first.latest.publishAt, +at(143));
  assert.ok(first.candles.length);

  let tradeAt;
  let resting;
  for (let minute = 143; minute <= 245; minute++) {
    const now = at(minute);
    await run(now);
    resting = await ExchangeOrder.findOne({ ...filter, source: "BOT", status: "working", expiresAt: { $gt: now } }).lean();
    if (resting) {
      tradeAt = now;
      break;
    }
  }
  assert.ok(resting, "A deterministic published snapshot should produce a real funded bot order");
  const makerMarket = await ExchangeMarket.findById(marketId).lean();
  assert.ok(makerMarket.marketMakerId);
  assert.notEqual(String(resting.userId), String(makerMarket.marketMakerId));
  assert.equal(String(resting.userId), traderId(resting.botId));
  assert.ok(await ExchangeWallet.exists({ _id: resting.userId, parentWalletId: null, available: { $gte: 0 } }));
  assert.ok(await ExchangeOrder.exists({ ...filter, source: "MM", userId: makerMarket.marketMakerId }));
  const funded = await ExchangeAccount.findOne({ ...filter, userId: resting.userId }).lean();
  assert.ok(funded.allocated >= (resting.direction === "long" ? resting.price : 1000 - resting.price) * TP_SCALE);
  assert.ok(await ExchangeExamBotAttempt.exists({ ...filter, botId: resting.botId, submittedAt: { $lte: resting.acceptedAt } }));
  const botView = await terminalState({ marketId: String(marketId), now: tradeAt, publicOnly: true });
  const botDepth = resting.side === "buy" ? botView.bids : botView.asks;
  assert.ok(botDepth.some(({ price, botQuantity }) => price === resting.price && botQuantity > 0));
  assert.ok([...botView.bids, ...botView.asks].every(({ quantity, botQuantity = 0, operatorQuantity = 0 }) =>
    botQuantity + operatorQuantity <= quantity));

  await PrivateMockExamAttempt.create({
    examId: exam._id, userId: student._id, weekKey: exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
    status: "submitted", score: 71, submittedAt: tradeAt, submissionFinalization: { status: "completed", completedAt: tradeAt },
  });
  const takerAt = new Date(+tradeAt + 1);
  await placeOrder({
    marketId, userId: student._id, clock: () => takerAt,
    input: { action: "open", direction: resting.side === "buy" ? "short" : "long", price: resting.price,
      quantity: 1, commandId: randomUUID() },
  });
  const trade = await ExchangeTrade.findOne({ ...filter, makerOrderId: resting._id }).lean();
  assert.equal(trade?.price, resting.price);
  assert.equal(+trade.tradedAt, +takerAt);
  assert.equal(trade.makerSource, "BOT");
  assert.equal(trade.takerSource, "HUMAN");
  const view = await terminalState({ marketId: String(marketId), now: takerAt, publicOnly: true });
  assert.ok(view.trades.some(({ makerSource, takerSource }) => makerSource === "BOT" && takerSource === "HUMAN"));
  assert.ok(view.candles.some(({ source }) => source === "MIXED"));
  assert.ok(await ExchangePosition.exists({ ...filter, botId: resting.botId, tradeId: trade._id, remaining: 1 }));
  const attempts = await ExchangeExamBotAttempt.countDocuments(filter);
  await run(tradeAt);
  assert.equal(await ExchangeExamBotAttempt.countDocuments(filter), attempts);

  await ExchangeSetting.updateOne({ _id: "default" }, { $set: { publicWeeklyBotsEnabled: false } });
  const afterStop = at(Math.floor((+tradeAt - +opensAt) / MINUTE) + 20);
  await run(afterStop);
  assert.equal(await ExchangeExamBotAttempt.countDocuments(filter), attempts);
  assert.equal(await ExchangeOrder.countDocuments({ ...filter, source: "BOT", status: "working" }), 0);
  assert.ok(await ExchangeOrder.exists({ ...filter, source: "MM", userId: makerMarket.marketMakerId, status: "working",
    expiresAt: { $gt: afterStop } }));
  assert.deepEqual(await ExchangeTrade.findById(trade._id).lean(), trade);
  assert.equal(await ExchangeBotReplayMpi.countDocuments(filter), 0);
  assert.equal(await ExchangeBotReplayTrade.countDocuments(filter), 0);
  assert.equal((await ExchangeSetting.findById("default")).automatedTradingDisabled, true);

  console.log("Public weekly bot DB audit passed: recurring prep, live slots, delayed MPI, attributed matching and separate MM.");
}

main().catch((cause) => { console.error(cause); process.exitCode = 1; }).finally(() => mongoose.disconnect());
