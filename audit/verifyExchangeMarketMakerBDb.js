const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { HISTORICAL_POLICY } = require("../services/exchangeBootstrapService");
const { saveObservedMpi, startMpiBotFade } = require("../services/exchangeMarketService");
const { adminState, terminalState } = require("../services/exchangeService");
const { maintainMarketMaker, placeOrder, TP_SCALE } = require("../services/exchangeTradingService");

const {
  ExchangeMarket, ExchangeMarketMakerHistory, ExchangeOrder, ExchangePosition, ExchangeSetting, ExchangeTick,
  ExchangeTrade, ExchangeWallet,
} = models;
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
const opensAt = new Date("2026-11-08T06:00:00Z");
const closeAt = new Date(+opensAt + 141 * HOUR);
const elapsed = 36 * HOUR + HOUR / 2;
const now = new Date(+opensAt + elapsed);
const fadeStartsAt = new Date(+now + 3000);
const fadeSampledAt = new Date(+fadeStartsAt + HOUR);
const fadePublishedAt = new Date(+fadeSampledAt + HOUR / 2);
const objectId = () => new mongoose.Types.ObjectId();

function quoteClock(at) {
  return () => at;
}

function studentOrder(marketId, userId, at, direction, price) {
  return placeOrder({ marketId, userId, clock: quoteClock(at),
    input: { action: "open", direction, price, quantity: 1, commandId: randomUUID() } });
}

async function createCurrentMarket(admin, students) {
  const archive = await ArchiveItem.create({
    title: "Market Maker audit exam", storedName: "weekly.pdf", originalName: "weekly.pdf", mimeType: "application/pdf",
    sizeBytes: 100, uploadedBy: admin._id, storageProvider: "R2", r2ObjectKey: "audit/weekly.pdf",
  });
  const points = [...Array(3).fill(2), ...Array(14).fill(3), ...Array(13).fill(4)];
  const exam = await PrivateMockExam.create({
    title: "Market Maker audit", weekKey: "2026-11-08", formCode: "WEEKLY", attemptNumber: 1, status: "open",
    releaseAt: opensAt, closeAt, aggregationStartsAt: closeAt, rankingPublishesAt: closeAt,
    archiveAt: closeAt, reviewPublishesAt: closeAt, questionCount: points.length, points,
    answerKey: points.map(() => "1"), archiveItemId: archive._id, createdBy: admin._id,
  });
  const market = await ExchangeMarket.create({
    key: `weekly:${exam._id}`, type: "weekly", title: exam.title, examId: exam._id, opensAt, closeAt, openedAt: opensAt,
    minimumMpiAttempts: 1, bootstrapPolicy: HISTORICAL_POLICY, botWeight: 1, tradingBotsEnabled: false, mpiCheckedAt: now,
    historicalBootstrap: { status: "complete", completedAt: opensAt }, botSeed: randomBytes(32).toString("hex"),
  });
  const submittedAt = new Date(+opensAt + HOUR);
  await PrivateMockExamAttempt.insertMany(students.map((student) => ({
    examId: exam._id, userId: student._id, weekKey: exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
    status: "submitted", score: 62, submittedAt, submissionFinalization: { status: "completed", completedAt: submittedAt },
  })));
  const cutoff = new Date(+now - HOUR / 2);
  await ExchangeTick.create({
    marketId: market._id, kind: "observed", sampledAt: cutoff, dataCutoffAt: cutoff, publishAt: now,
    populationCount: students.length, humanPopulationCount: students.length, mpi: 620, botWeight: 1,
  });
  return market;
}

async function addPastRounds(student) {
  for (let index = 1; index <= 8; index++) {
    const open = new Date(+opensAt - WEEK * index);
    const close = new Date(+open + 141 * HOUR);
    const decidedAt = new Date(+close + HOUR);
    const archiveId = objectId();
    const prior = await ExchangeMarket.create({
      key: `weekly:${archiveId}`, type: "weekly", title: `Completed week ${index}`, examId: archiveId,
      opensAt: open, closeAt: close, openedAt: open, decision: "normal", phase: "settled",
      settledAt: decidedAt, decisionAt: decidedAt, participantCount: 20, settlement: 600,
      createdAt: open, updatedAt: decidedAt,
    });
    const historicalCutoffs = [+now - HOUR / 2, +fadeSampledAt].map((at) => new Date(+open + at - +opensAt));
    await ExchangeMarketMakerHistory.create({
      marketId: prior._id, examId: prior.examId, version: 1, decidedAt, participantCount: 20, scoreSum: 12000,
      createdAt: decidedAt, updatedAt: decidedAt, flowOrderCount: 2,
      cohorts: historicalCutoffs.map((cutoffAt) => ({
        snapshotId: objectId(), cutoffAt, publishAt: new Date(+cutoffAt + HOUR / 2),
        earlyMean: 600, remainingCount: 10, remainingScoreSum: 6000,
      })),
    });

    // Alternate buy and sell paths across completed markets.
    const buy = index % 2 === 0;
    for (const [sequence, windowAt] of [now, fadePublishedAt].entries()) {
      const acceptedAt = new Date(+open + +windowAt - +opensAt + 10_000);
      const order = await ExchangeOrder.create({
        marketId: prior._id, userId: student._id, commandId: randomUUID(), source: "HUMAN", action: "open",
        direction: buy ? "long" : "short", side: buy ? "buy" : "sell", price: buy ? 700 : 500,
        quantity: 1, status: "filled", sequence, remaining: 0, acceptedAt, createdAt: acceptedAt, updatedAt: acceptedAt,
      });
      await ExchangeTrade.create({
        marketId: prior._id, takerOrderId: order._id, makerOrderId: objectId(), quantity: 1, takerSource: "HUMAN",
        makerSource: "HUMAN", price: 600, tradedAt: new Date(+acceptedAt + 100), sequence,
        createdAt: acceptedAt, updatedAt: acceptedAt,
      });
    }
  }
}

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  await mongoose.connect(process.env.DB);
  await Promise.all([...Object.values(models), ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User].map((model) => model.init()));
  const [admin, ...students] = await User.create([
    { name: "Market Maker audit admin", email: "operator@maker.fixture.invalid", role: "admin", passwordHash: "test" },
    ...Array.from({ length: 5 }, (_, index) => ({
      name: `Market Maker audit student ${index}`, email: `student-${index}@maker.fixture.invalid`, role: "student", passwordHash: "test",
    })),
  ]);
  const market = await createCurrentMarket(admin, students);
  const marketId = market._id;
  const filter = { marketId };
  const tradeAt = new Date(+now - 60_000);
  await studentOrder(marketId, students[0]._id, tradeAt, "short", 750);
  await studentOrder(marketId, students[1]._id, tradeAt, "long", 750);
  const previousTrade = await ExchangeTrade.findOne(filter).lean();
  assert.ok(previousTrade);
  const humanPositions = await ExchangePosition.find(filter).sort({ _id: 1 }).lean();
  assert.equal(humanPositions.length, 2);

  await ExchangeSetting.create({ _id: "default", marketMakerPolicy: "B",
    marketMakerExpectedLossLimitTp: 100, marketMakerTailLossLimitTp: 250 });
  await maintainMarketMaker(marketId, quoteClock(now));
  let current = await ExchangeMarket.findById(marketId).lean();
  assert.equal(current.marketMakerDecision.mode, "baseline", JSON.stringify(current.marketMakerDecision));
  assert.equal(current.marketMakerDecision.reason, "insufficient-history");
  assert.equal(current.marketMakerDecision.restorableRoundCount, 0);
  const makerId = current.marketMakerId;
  assert.ok(makerId);
  const makerFilter = { ...filter, userId: makerId, status: "working", expiresAt: { $gt: now } };
  const baseline = await ExchangeOrder.find(makerFilter).sort({ price: 1 }).lean();
  assert.deepEqual(baseline.map((order) => order.price), [602, 638]);

  await addPastRounds(students[0]);
  const bAt = new Date(+now + 1000);
  await maintainMarketMaker(marketId, quoteClock(bAt));
  current = await ExchangeMarket.findById(marketId).lean();
  assert.equal(current.marketMakerDecision.mode, "B", JSON.stringify(current.marketMakerDecision));
  assert.equal(current.marketMakerDecision.reason, "selected");
  assert.equal(current.marketMakerDecision.scenarioCount, 8);
  assert.ok(current.marketMakerDecision.mark > 600 && current.marketMakerDecision.mark < 620);
  assert.ok(current.marketMakerDecision.expectedLossTp <= 100);
  assert.ok(current.marketMakerDecision.cvarTp <= 250);
  assert.ok(current.marketMakerDecision.hardLossTp <= 1000);
  assert.equal(String(current.marketMakerId), String(makerId));
  assert.deepEqual(await ExchangeTrade.findById(previousTrade._id).lean(), previousTrade);
  assert.deepEqual(await ExchangePosition.find(filter).sort({ _id: 1 }).lean(), humanPositions);

  const quotes = await ExchangeOrder.find(makerFilter).sort({ price: 1 }).lean();
  assert.equal(quotes.length, 2);
  assert.ok(quotes.every((quote) => quote.source === "MM" && quote.remaining === 1));
  assert.ok(quotes[0].price < quotes[1].price);
  const acceptAt = new Date(+bAt + 1000);
  const view = await terminalState({ marketId: String(marketId), now: acceptAt });
  assert.equal(view.bids[0].price, quotes[0].price);
  assert.equal(view.asks[0].price, quotes[1].price);
  const details = await adminState(2026, 1, acceptAt);
  assert.equal(details.markets.find((entry) => entry.id === String(marketId)).marketMakerDecision.mode, "B");

  // An unchanged maintenance cycle keeps price-time priority.
  await maintainMarketMaker(marketId, quoteClock(acceptAt));
  assert.deepEqual((await ExchangeOrder.find(makerFilter).sort({ price: 1 }).lean()).map((order) => String(order._id)),
    quotes.map((order) => String(order._id)));
  assert.equal(await ExchangeTrade.countDocuments(filter), 1);
  await studentOrder(marketId, students[2]._id, acceptAt, "long", quotes[1].price);
  const match = await ExchangeTrade.findOne({ ...filter, makerOrderId: quotes[1]._id }).lean();
  assert.equal(match?.makerSource, "MM");
  assert.equal(match?.price, quotes[1].price);
  assert.equal((await ExchangeOrder.findById(quotes[0]._id)).status, "cancelled");
  const makerPosition = await ExchangePosition.findOne({ ...filter, userId: makerId }).lean();
  assert.equal(makerPosition.direction, "short");
  assert.equal(makerPosition.remaining, 1);
  assert.ok((await ExchangeWallet.findById(makerId)).available >= 0);
  assert.equal((await ExchangeMarket.findById(marketId)).escrow, 2000 * TP_SCALE);

  await startMpiBotFade(marketId, admin._id, "Audit scheduled MPI bot fade", fadeStartsAt);
  await saveObservedMpi(await ExchangeMarket.findById(marketId).lean(), fadeSampledAt, quoteClock(fadeSampledAt));
  const fadedSample = await ExchangeTick.findOne({ ...filter, sampledAt: fadeSampledAt }).lean();
  assert.equal(fadedSample.botWeight, 0);
  assert.equal(+fadedSample.publishAt, +fadePublishedAt);
  await saveObservedMpi(await ExchangeMarket.findById(marketId).lean(), fadePublishedAt, quoteClock(fadePublishedAt));
  await maintainMarketMaker(marketId, quoteClock(fadePublishedAt));
  current = await ExchangeMarket.findById(marketId).lean();
  assert.equal(current.botWeight, 0);
  assert.equal(current.marketMakerDecision.mode, "B", JSON.stringify(current.marketMakerDecision));
  assert.equal(String(current.marketMakerId), String(makerId));
  assert.equal(current.marketMakerEnabled, true);
  const closingQuote = await ExchangeOrder.findOne({ ...makerFilter, action: "close", direction: "short",
    expiresAt: { $gt: fadePublishedAt } }).lean();
  assert.ok(closingQuote);
  assert.deepEqual(await ExchangePosition.findById(makerPosition._id).lean(), makerPosition);
  await studentOrder(marketId, students[3]._id, new Date(+fadePublishedAt + 1000), "short", closingQuote.price);
  const afterFadeFill = await ExchangeTrade.findOne({ ...filter, makerOrderId: closingQuote._id }).lean();
  assert.equal(afterFadeFill?.price, closingQuote.price);
  assert.equal(afterFadeFill?.makerSource, "MM");
  assert.equal((await ExchangePosition.findById(makerPosition._id)).remaining, 0);
  assert.deepEqual(await ExchangeTrade.findById(previousTrade._id).lean(), previousTrade);

  const acceptedAt = new Date(+fadePublishedAt + 2000);
  await maintainMarketMaker(marketId, quoteClock(acceptedAt));
  assert.ok(await ExchangeOrder.exists({ ...makerFilter, marketMakerQuoteKey: { $ne: null }, expiresAt: { $gt: acceptedAt } }));
  await ExchangeSetting.updateOne({ _id: "default" }, { $unset: { marketMakerTailLossLimitTp: "" } });
  await maintainMarketMaker(marketId, quoteClock(acceptedAt));
  current = await ExchangeMarket.findById(marketId).lean();
  assert.equal(current.marketMakerDecision.mode, "halted", JSON.stringify(current.marketMakerDecision));
  assert.equal(current.marketMakerDecision.reason, "risk-policy-unavailable");
  assert.equal(await ExchangeOrder.countDocuments(makerFilter), 0);

  console.log("Market Maker B DB audit passed: standby, eligible optimization, order priority, atomic fills, post-fade matching, and policy halt.");
}

main().catch((cause) => { console.error(cause); process.exitCode = 1; }).finally(() => mongoose.disconnect());
