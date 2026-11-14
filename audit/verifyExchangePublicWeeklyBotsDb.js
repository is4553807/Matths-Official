const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { LIVE_WEEKLY_POLICY, traderId } = require("../services/exchangeBootstrapService");
const { runExchangeTick, terminalState } = require("../services/exchangeService");
const { placeOrder, TP_SCALE } = require("../services/exchangeTradingService");
const { mpiState } = require("../services/exchangeMpiService");
const { botDepthOrderFilter, botDepthQuotes, isBotDepthOrder } = require("../services/exchangeBotDepthStrategy");

const {
  ExchangeMarket, ExchangeSetting, ExchangeExamBotAttempt, ExchangeOrder, ExchangeTrade, ExchangeWallet,
  ExchangeAccount, ExchangePosition, ExchangeTick, ExchangeBotReplayMpi, ExchangeBotReplayTrade,
} = models;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const opensAt = new Date("2026-11-15T06:00:00.000Z");
const marketId = new mongoose.Types.ObjectId("123456789123456789123456");
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
  await ExchangeMarket.create({ _id: marketId, key: `weekly:${exam._id}`, type: "weekly", examId: exam._id,
    title: exam.title, opensAt: exam.releaseAt, closeAt: exam.closeAt, botParticipation: false });
  await run(at(-60));
  const preregistered = await ExchangeMarket.findOne({ examId: exam._id });
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
  assert.equal(scheduled.interval, "2h");
  assert.equal((await terminalState({ marketId: String(marketId), now: at(-1), interval: "5m" })).interval, "5m");

  // Keep random-looking bot answers reproducible without substituting orders or submissions.
  await ExchangeMarket.updateOne({ _id: marketId }, { $set: { botSeed: "weekly-public-bots-audit" } });
  await PrivateMockExam.updateOne({ _id: exam._id }, { $set: { status: "open" } });
  await run(opensAt);
  assert.equal(+(await ExchangeMarket.findById(marketId)).openedAt, +opensAt);
  assert.equal(await ExchangeExamBotAttempt.countDocuments(filter), 0);

  await PrivateMockExamAttempt.create({
    examId: exam._id, userId: student._id, weekKey: exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
    status: "submitted", score: 71, submittedAt: at(29), submissionFinalization: { status: "completed", completedAt: at(29) },
  });
  await run(at(29));
  await assertNoMarketActivity(marketId);
  const before = await mpiState({ marketId: String(marketId), now: at(29), publicOnly: true });
  assert.equal(before.latest, null);
  assert.equal(before.candles.length, 0);

  await run(at(30));
  await run(at(31));
  const opening = await ExchangeExamBotAttempt.find(filter).select("+answers").sort({ number: 1 }).lean();
  assert.deepEqual(opening.map(({ number }) => number), [1, 2, 3, 4, 5]);
  assert.ok(opening.every(({ submittedAt, openingBatch, answers, score, reconstructedAt, source }) =>
    source === "BOT" && !reconstructedAt && answers.length === points.length
      && openingBatch && +submittedAt === +at(30)
      && answers.reduce((sum, answer, index) => sum + (answer === "1" ? points[index] : 0), 0) === score));
  const openingFilter = { ...filter, openingBotBatch: true };
  assert.equal(await ExchangeTick.countDocuments(openingFilter), 1);
  const openingTick = await ExchangeTick.findOne(openingFilter).select("+contributions").lean();
  assert.equal(openingTick.humanPopulationCount, 0);
  assert.equal(openingTick.humanScoreSum, 0);
  assert.deepEqual(openingTick.contributions.sort(), opening.map(({ botId, score }) => `${botId}:${score}`).sort());
  const botScoreSum = opening.reduce((sum, bot) => sum + bot.score, 0);
  const first = await mpiState({ marketId: String(marketId), now: at(30), publicOnly: true });
  assert.equal(first.latest.populationCount, 5);
  assert.equal(first.latest.humanPopulationCount, 0);
  assert.equal(first.latest.botPopulationCount, 5);
  assert.equal(first.latest.openingBotBatch, true);
  assert.equal(first.latest.mpi, botScoreSum * 2);
  assert.equal(+first.latest.publishAt, +at(30));
  assert.ok(first.candles.length);
  assert.ok(first.candles.every(({ close }) => close === first.latest.mpi));
  const openingLevels = await ExchangeOrder.find({ ...filter, ...botDepthOrderFilter, status: "working" }).lean();
  assert.ok(openingLevels.length >= 4 && openingLevels.length <= 6, `Opening has ${openingLevels.length} passive orders`);
  assert.ok(openingLevels.every((row) => row.quantity === 1 && row.price >= 250 && row.price <= 750));
  assert.ok(openingLevels.every((row) => +row.acceptedAt === +at(30)));
  assert.equal(await ExchangeTrade.countDocuments({ ...filter, takerOrderId: { $in: openingLevels.map(({ _id }) => _id) } }), 0);
  const healthyBook = await terminalState({ marketId: String(marketId), now: at(31), publicOnly: true });
  assert.ok(healthyBook.bids[0].price < healthyBook.asks[0].price);
  assert.ok(healthyBook.bids.length >= 2 && healthyBook.asks.length >= 2);
  const openDepthKey = { ...filter, ...botDepthOrderFilter, status: "working" };
  const snapshotAfterOpen = await ExchangeTick.findOne(openingFilter).lean();
  assert.equal(await ExchangeOrder.countDocuments({ ...openDepthKey, mpiSnapshotId: snapshotAfterOpen._id }), openingLevels.length);
  assert.equal(isBotDepthOrder({ ...openingLevels[0], source: "HUMAN", botId: undefined }), false);
  assert.equal(botDepthQuotes(600, 5, [{ side: "buy", price: 599 }, { side: "sell", price: 601 }]).length, 6);

  const stillOpening = await mpiState({ marketId: String(marketId), now: at(59), publicOnly: true });
  assert.equal(stillOpening.latest.humanPopulationCount, 0);
  assert.equal(stillOpening.latest.mpi, first.latest.mpi);
  const delayedAt = new Date(+at(60) + 1);
  const delayed = await mpiState({ marketId: String(marketId), now: delayedAt, publicOnly: true });
  assert.equal(delayed.latest.humanPopulationCount, 1);
  assert.equal(delayed.latest.mpi, Math.round((botScoreSum + 71) * 1000 / 6) / 100);
  assert.equal(+delayed.latest.publishAt, +delayedAt);

  // Simulate an offline worker in the second regular slot. Record the current
  // slot at the processing clock and leave the missed slot absent.
  await run(at(63));
  await run(at(103));
  const roster = await ExchangeExamBotAttempt.find(filter).sort({ number: 1 }).lean();
  assert.deepEqual(roster.map(({ number }) => number), [1, 2, 3, 4, 5, 6, 8]);
  assert.deepEqual(roster.slice(5).map(({ submittedAt }) => +submittedAt), [63, 103].map((minute) => +at(minute)));

  let tradeAt;
  let resting;
  for (let minute = 103; minute <= 245; minute++) {
    const now = at(minute);
    await run(now);
    const candidateBook = await terminalState({ marketId: String(marketId), now, publicOnly: true });
    for (const [side, best] of [["buy", candidateBook.bids[0]], ["sell", candidateBook.asks[0]]]) {
      if (!best?.botQuantity || best.botQuantity !== best.quantity) continue;
      resting = await ExchangeOrder.findOne({ ...filter, source: "BOT", side, price: best.price,
        status: "working", expiresAt: { $gt: now } }).sort({ acceptedAt: 1, sequence: 1 }).lean();
      if (resting) break;
    }
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

  console.log("Public weekly bot DB audit passed: opening batch, student MPI delay, live slots, attributed matching and separate MM.");
}

main().catch((cause) => { console.error(cause); process.exitCode = 1; }).finally(() => mongoose.disconnect());
