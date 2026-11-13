const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ExchangeAccount, ExchangeBotReplayMpi, ExchangeBotReplayTrade, ExchangeEvent, ExchangeExamBotAttempt, ExchangeMarket,
  ExchangeMpiDemo, ExchangeOrder, ExchangePosition, ExchangeReference, ExchangeSetting, ExchangeTick, ExchangeTrade, ExchangeWallet,
} = require("../models/exchangeModel");
const { User } = require("../models/matthsModel");
const { WebSession } = require("../models/sessionModel");
const { EXCHANGE_WALLET_ID } = require("../services/exchangeFees");
const { ensureOperationsTestAccounts } = require("../services/adminService");
const { setMarketMakerEnabled } = require("../services/exchangeTradingService");
const { cleanupExchangeBots, previewExchangeBotCleanup } = require("../services/exchangeBotCleanupService");

const marketId = "6af57a46ad86b97eba7fda52";
const opensAt = new Date("2026-11-08T06:00:00.000Z");
const closeAt = new Date("2026-11-14T03:00:00.000Z");
const humanAt = new Date("2026-11-13T05:00:06.904Z");
const botAt = new Date("2026-11-13T12:10:54.758Z");
const now = new Date("2026-11-13T12:12:00.000Z");
const oid = () => new mongoose.Types.ObjectId();

async function fixture() {
  const [human, admin, opsTest, unrelatedTest] = await User.create([
    { name: "Cleanup audit student", email: "student@fixture.invalid", role: "student", passwordHash: "unused" },
    { name: "Cleanup audit admin", email: "admin@fixture.invalid", role: "admin", passwordHash: "unused" },
    { name: "Exchange 운영 테스트 01", email: "exchange-operations-test-01@matths.invalid", role: "test",
      isTestAccount: true, testBatchKey: "exchange-operations-test", isActive: false, accountStatus: "inactive", passwordHash: "unused" },
    { name: "Unrelated QA", email: "unrelated@fixture.invalid", role: "test",
      isTestAccount: true, testBatchKey: "unrelated-audit", isActive: false, accountStatus: "inactive", passwordHash: "unused" },
  ]);
  const examId = oid();
  const mmId = oid();
  const traderId = oid();
  const botId = oid();
  const market = await ExchangeMarket.create({
    _id: marketId, key: `weekly:${examId}`, type: "weekly", title: "Bot cleanup audit", examId, opensAt, openedAt: opensAt, closeAt,
    escrow: 200_000, marketMakerId: mmId, marketMakerEnabled: true, botParticipation: false, tradingBotsEnabled: true,
    bootstrapPolicy: { version: 2, fadeMinutes: 60, stepMinutes: 5, minimumHumans: 5, tradingStopMinutesBeforeClose: 30 },
    botSeed: "fixture-bootstrap-seed", examBotsStartedAt: botAt, botWeight: 1, botOnlyVolume: 1, tradeSequence: 2,
    volume: 1, lastPrice: 600, lastTradeAt: humanAt, replayRecordedAt: botAt, replayVolume: 1, replayMpiCount: 1,
    internalBotCount: 1, botScoreSum: 68, humanScoreSum: 12, internalMpiCount: 1, internalMpi: 400,
  });
  await ExchangeWallet.create([
    { _id: EXCHANGE_WALLET_ID, available: 197_643, collectedFees: 43, botFundingAt: botAt },
    { _id: human._id, available: 139_957 },
    { _id: mmId, available: 162_400 },
    { _id: traderId, available: 0, parentWalletId: EXCHANGE_WALLET_ID },
  ]);
  await ExchangeEvent.create({ marketId, action: "bot-initial-funding", detail: { amountTp: 2000 }, createdAt: new Date(+botAt + 3400) });
  await ExchangeAccount.create([
    { marketId, userId: human._id, allocated: 60_000 },
    { marketId, userId: EXCHANGE_WALLET_ID, allocated: 40_000 },
    { marketId, userId: mmId, allocated: 37_600 },
    { marketId, userId: traderId, allocated: 62_400 },
  ]);
  const [manual, student, mm, trader, restingMm] = await ExchangeOrder.create([
    { userId: EXCHANGE_WALLET_ID, actorId: admin._id, direction: "short", side: "sell", price: 600 },
    { userId: human._id, direction: "long", side: "buy", price: 600, source: "HUMAN", feesPaid: 43 },
    { userId: mmId, direction: "short", side: "sell", price: 624, source: "MM", liquidityProvider: "matths", botLabel: "MM1" },
    { userId: traderId, direction: "long", side: "buy", price: 624, source: "BOT", botId, botLabel: "TraderBot1" },
    { userId: mmId, direction: "short", side: "buy", price: 600, source: "MM", liquidityProvider: "matths", botLabel: "MM1",
      action: "close", status: "working", remaining: 1, expiresAt: closeAt },
  ].map((order, index) => ({
    marketId, action: "open", status: "filled", quantity: 1, remaining: 0, feeReserved: 0,
    acceptedAt: index < 2 ? humanAt : botAt, commandId: `exchange-cleanup-order-${index}`, sequence: index + 1, ...order,
  })));
  const [humanTrade, botTrade] = await ExchangeTrade.create([
    { marketId, price: 600, quantity: 1, makerOrderId: manual._id, takerOrderId: student._id, liquidityProvider: "matths", takerSource: "HUMAN",
      makerFee: 0, takerFee: 43, feeCollected: true, tradedAt: humanAt, sequence: 1 },
    { marketId, price: 624, quantity: 1, makerOrderId: mm._id, takerOrderId: trader._id, makerSource: "MM", takerSource: "BOT",
      makerFee: 0, takerFee: 0, feeCollected: false, botOnly: true, tradedAt: botAt, sequence: 2 },
  ]);
  await ExchangePosition.create([manual, student, mm, trader].map((order, index) => ({
    marketId, userId: order.userId, botId: order.botId, price: order.price, direction: order.direction,
    quantity: 1, remaining: 1, realized: 0, tradeId: index < 2 ? humanTrade._id : botTrade._id,
  })));
  const [humanTick, botTick] = await ExchangeTick.create([
    { marketId, kind: "observed", sampledAt: humanAt, publishAt: new Date(+humanAt + 1_800_000),
      mpi: 120, populationCount: 1, humanPopulationCount: 1, botPopulationCount: 0, humanScoreSum: 12 },
    { marketId, kind: "observed", sampledAt: botAt, publishAt: new Date(+botAt + 1_800_000),
      mpi: 400, populationCount: 2, humanPopulationCount: 1, botPopulationCount: 1, humanScoreSum: 12, botScoreSum: 68 },
  ]);
  await ExchangeExamBotAttempt.create({
    marketId, examId, botId, number: 1, label: "ExamBot1", source: "BOT", submittedAt: botAt, score: 68,
  });
  await ExchangeBotReplayTrade.create({
    marketId, replayId: "audit-replayed-fill", source: "BOT_REPLAY", tradedAt: opensAt, reconstructedAt: botAt,
    price: 490, quantity: 1,
  });
  await ExchangeBotReplayMpi.create({
    marketId, sampledAt: opensAt, publishAt: new Date(+opensAt + 1_800_000), reconstructedAt: botAt, mpi: 490, populationCount: 1,
  });
  await ExchangeMpiDemo.create({
    _id: marketId, examId, startedAt: opensAt, expiresAt: new Date(Date.UTC(2100, 0, 1)),
    attempts: [{ accountKey: "legacy-bot", score: 70 }],
  });
  await ExchangeReference.create({ marketId, at: humanAt, sequence: 1, price: 600, source: "students" });
  await WebSession.create({
    sid: "exchange-cleanup-test-session", expiresAt: new Date(Date.UTC(2100, 0, 1)),
    session: { user: { id: String(opsTest._id), role: "test" } },
  });
  return { market, human, admin, opsTest, unrelatedTest, mmId, traderId, manual, student, mm, trader, restingMm, humanTrade, botTrade, humanTick, botTick };
}

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    const sample = await fixture();
    const contaminated = await ExchangeTrade.create({
      marketId, price: 624, quantity: 1, makerOrderId: sample.trader._id, takerOrderId: sample.student._id,
      makerSource: "BOT", takerSource: "HUMAN", tradedAt: botAt, sequence: 3,
    });
    const blocked = await previewExchangeBotCleanup();
    assert.ok(blocked.blockers.length > 0);
    await assert.rejects(cleanupExchangeBots(blocked.fingerprint, { now }));
    assert.equal(await ExchangeTrade.countDocuments({ marketId }), 3);
    assert.equal((await ExchangeWallet.findById(EXCHANGE_WALLET_ID).lean()).available, 197_643);
    await ExchangeTrade.deleteOne({ _id: contaminated._id });

    const initial = await previewExchangeBotCleanup();
    assert.equal(typeof initial.fingerprint, "string");
    assert.ok(initial.fingerprint.length >= 32);
    assert.deepEqual(initial.blockers, []);
    await assert.rejects(cleanupExchangeBots("0".repeat(64), { now }));
    assert.equal(await ExchangeTrade.countDocuments({ marketId }), 2);

    const result = await cleanupExchangeBots(initial.fingerprint, { now });
    assert.ok(result.counts);
    assert.equal((await ExchangeSetting.findById("default").lean()).automatedTradingDisabled, true);
    const market = await ExchangeMarket.findById(marketId).select("+botSeed").lean();
    assert.equal(market.escrow, 100_000);
    assert.equal(market.volume, 1);
    assert.equal(market.lastPrice, 600);
    assert.equal(+market.lastTradeAt, +humanAt);
    assert.ok(!market.botOnlyVolume && !market.replayVolume && !market.replayMpiCount);
    assert.ok(!market.marketMakerId && !market.bootstrapPolicy?.version && !market.botSeed);
    assert.equal(market.marketMakerEnabled, false);
    assert.notEqual(market.tradingBotsEnabled, true);
    for (const Model of [ExchangeExamBotAttempt, ExchangeBotReplayTrade, ExchangeBotReplayMpi]) {
      assert.equal(await Model.countDocuments({ marketId }), 0, Model.modelName);
    }
    assert.equal(await ExchangeMpiDemo.countDocuments({ _id: marketId }), 0);
    assert.equal(await ExchangeTick.countDocuments({ _id: sample.humanTick._id }), 1);
    assert.equal(await ExchangeTick.countDocuments({ _id: sample.botTick._id }), 0);
    assert.equal(await ExchangeTrade.countDocuments({ _id: sample.botTrade._id }), 0);
    assert.equal(await ExchangeTrade.countDocuments({ _id: sample.humanTrade._id }), 1);
    assert.equal(await ExchangeOrder.countDocuments({ _id: { $in: [sample.mm._id, sample.trader._id, sample.restingMm._id] } }), 0);
    assert.equal(await ExchangeOrder.countDocuments({ _id: { $in: [sample.manual._id, sample.student._id] } }), 2);
    assert.equal(await ExchangePosition.countDocuments({ marketId, userId: { $in: [sample.mmId, sample.traderId] } }), 0);
    assert.equal(await ExchangePosition.countDocuments({ marketId, tradeId: sample.humanTrade._id, remaining: 1 }), 2);
    assert.equal(await ExchangeAccount.countDocuments({ marketId, userId: { $in: [sample.mmId, sample.traderId] } }), 0);
    assert.equal(await ExchangeAccount.countDocuments({ marketId, userId: { $in: [EXCHANGE_WALLET_ID, sample.human._id] } }), 2);
    assert.equal(await ExchangeWallet.countDocuments({ _id: { $in: [sample.mmId, sample.traderId] } }), 0);
    const parent = await ExchangeWallet.findById(EXCHANGE_WALLET_ID).lean();
    assert.equal(parent.available, 60_043);
    assert.equal(parent.collectedFees, 43);
    assert.equal((await ExchangeWallet.findById(sample.human._id).lean()).available, 139_957);
    assert.equal(await User.countDocuments({ _id: sample.opsTest._id }), 0);
    assert.equal(await User.countDocuments({ _id: sample.unrelatedTest._id }), 1);
    assert.equal(await User.countDocuments({ _id: sample.human._id }), 1);
    assert.equal(await WebSession.countDocuments({ sid: "exchange-cleanup-test-session" }), 0);
    await assert.rejects(ensureOperationsTestAccounts(sample.admin._id), { status: 409 });
    await assert.rejects(setMarketMakerEnabled(marketId, true, sample.admin._id, "audit", now), { status: 409 });
    const repeated = await previewExchangeBotCleanup();
    assert.deepEqual(repeated.blockers, []);
    assert.ok(Object.values(repeated.counts).every((count) => count === 0));
    await cleanupExchangeBots(repeated.fingerprint);
    assert.equal((await ExchangeWallet.findById(EXCHANGE_WALLET_ID).lean()).available, 60_043);
    console.log("Exchange bot cleanup verified: actual mixed operator/student fill retained, isolated automation unwound, replay and operations-test accounts removed.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
