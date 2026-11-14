const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models/exchangeModel");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { LIVE_WEEKLY_POLICY } = require("../services/exchangeBootstrapService");
const { latestPublishedMpi, saveObservedMpi, startMpiBotFade } = require("../services/exchangeMarketService");
const { maintainMarketMaker, placeOrder, processMarket } = require("../services/exchangeTradingService");
const { EXCHANGE_WALLET_ID, INITIAL_TP, TP_SCALE, tradeFee } = require("../services/exchangeFees");

const {
  ExchangeAccount, ExchangeEvent, ExchangeExamBotAttempt, ExchangeMarket, ExchangeOrder,
  ExchangePosition, ExchangeSetting, ExchangeTick, ExchangeTrade, ExchangeWallet,
} = models;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WEEK = 7 * 24 * HOUR;
const ROUND = 141 * HOUR;
const FIRST_OPENS_AT = new Date("2027-01-03T06:00:00.000Z");
const QUESTION_POINTS = [...Array(3).fill(2), ...Array(14).fill(3), ...Array(13).fill(4)];
const objectId = () => new mongoose.Types.ObjectId();

async function roundFixture(admin, number, { scheduleBots = true } = {}) {
  const opensAt = new Date(+FIRST_OPENS_AT + number * WEEK);
  const closeAt = new Date(+opensAt + ROUND);
  const archive = await ArchiveItem.create({
    title: "Settlement question paper", storedName: `settlement-${number}.pdf`, originalName: "questions.pdf",
    mimeType: "application/pdf", sizeBytes: 100, uploadedBy: admin, storageProvider: "R2", r2ObjectKey: `audit/settlement-${number}.pdf`,
  });
  const exam = await PrivateMockExam.create({
    title: `Exchange settlement audit ${number}`, weekKey: opensAt.toISOString().slice(0, 10),
    formCode: "WEEKLY", attemptNumber: 1, status: "open", releaseAt: opensAt, closeAt,
    aggregationStartsAt: closeAt, rankingPublishesAt: closeAt, archiveAt: closeAt, reviewPublishesAt: closeAt,
    questionCount: QUESTION_POINTS.length, points: QUESTION_POINTS, answerKey: QUESTION_POINTS.map(() => "1"),
    archiveItemId: archive._id, createdBy: admin,
  });
  const market = await ExchangeMarket.create({
    key: `weekly:${exam._id}`, title: exam.title, type: "weekly", examId: exam._id, openedAt: opensAt, opensAt, closeAt,
    bootstrapPolicy: LIVE_WEEKLY_POLICY, botParticipation: true, botWeight: 1,
    ...(scheduleBots ? { botSeed: `settlement-audit-${number}` } : {}),
    marketMakerEnabled: true, tradingBotsEnabled: true, minimumMpiAttempts: 1,
  });
  return { exam, market, opensAt, closeAt, at: (minutes) => new Date(+opensAt + minutes * MINUTE) };
}

async function humanAttempt(round, userId, score, additional = {}) {
  const submittedAt = round.at(50);
  return PrivateMockExamAttempt.create({
    userId, examId: round.exam._id, weekKey: round.exam.weekKey, formCode: "WEEKLY", attemptNumber: 1,
    status: "submitted", submittedAt, score, submissionFinalization: { status: "completed", completedAt: submittedAt },
    ...additional,
  });
}

function rawBotAttempt(round, score, additional = {}) {
  return {
    marketId: round.market._id, examId: round.exam._id, botId: objectId(), number: 1, label: "ExamBot1",
    source: "BOT", submittedAt: round.at(60), score, ...additional,
  };
}

async function closeExam(round) {
  const now = new Date(+round.closeAt + 10 * MINUTE);
  await PrivateMockExam.updateOne({ _id: round.exam._id }, { $set: { status: "locked", settlementCompletedAt: now } });
  return now;
}

async function settleRound(round, now) {
  await processMarket(await ExchangeMarket.findById(round.market._id), now);
  return ExchangeMarket.findById(round.market._id).lean();
}

function assertSettlement(market, settlement, participants, bots) {
  assert.equal(market.phase, "settled");
  assert.equal(market.decision, "normal");
  assert.equal(market.settlement, settlement);
  assert.equal(market.participantCount, participants);
  assert.equal(market.botParticipantCount, bots);
  assert.equal(market.escrow, 0);
}

async function submitOrder(round, userId, direction, price, time) {
  return placeOrder({ marketId: round.market._id, userId, clock: () => time,
    input: { commandId: randomUUID(), action: "open", direction, price, quantity: 1 } });
}

async function mixedSettlement(admin, students) {
  const round = await roundFixture(admin, 0);
  const { market, closeAt, opensAt } = round;
  const filter = { marketId: market._id };
  const [long, short, pending] = students;
  await humanAttempt(round, long._id, 40);
  await humanAttempt(round, short._id, 80);
  await humanAttempt(round, pending._id, 100, {
    integrityStatus: "PENDING_INTEGRITY_REVIEW",
  });

  const early = rawBotAttempt(round, 50);
  await ExchangeExamBotAttempt.create([early, rawBotAttempt(round, 81, { number: 4 })]);
  await assert.rejects(ExchangeExamBotAttempt.create({ ...early, number: 2, score: 100 }), { code: 11000 });
  // Previously imported rows may bypass Mongoose validation. They must not affect settlement.
  await ExchangeExamBotAttempt.collection.insertMany([
    rawBotAttempt(round, 100, { submittedAt: new Date(+opensAt - 1) }),
    rawBotAttempt(round, 100, { submittedAt: closeAt }),
    rawBotAttempt(round, 100, { submittedAt: new Date(+closeAt + 1) }),
    rawBotAttempt(round, 100, { examId: objectId() }),
    rawBotAttempt(round, 100, { source: "HUMAN" }),
    rawBotAttempt(round, 100, { reconstructedAt: round.at(70) }),
    rawBotAttempt(round, 101),
    rawBotAttempt(round, -1),
  ]);

  await submitOrder(round, short._id, "short", 605, round.at(65));
  const taker = await submitOrder(round, long._id, "long", 610, round.at(65));
  assert.equal(taker.status, "filled");
  const trade = await ExchangeTrade.findOne(filter).lean();
  assert.equal(trade.price, 605);
  assert.equal((await ExchangeMarket.findById(market._id)).escrow, 1000 * TP_SCALE);
  await submitOrder(round, short._id, "short", 950, round.at(66));

  await settleRound(round, new Date(+closeAt + MINUTE));
  assert.equal((await ExchangeMarket.findById(market._id)).phase, "scheduled");
  const now = await closeExam(round);
  assert.equal((await settleRound(round, now)).phase, "scheduled", "Integrity review blocks settlement");
  await assert.rejects(startMpiBotFade(market._id, admin, "After the settlement cutoff", closeAt), { status: 409 });
  await PrivateMockExamAttempt.updateOne({ examId: round.exam._id, userId: pending._id }, {
    $set: { integrityStatus: "INVALIDATED" },
  });
  const settled = await settleRound(round, now);
  assertSettlement(settled, 627.5, 4, 2);
  assert.equal(await ExchangeOrder.countDocuments({ ...filter, status: "working" }), 0);
  assert.equal(await ExchangeAccount.countDocuments({ ...filter, releasedAt: null }), 0);

  const [sellerWallet, buyerWallet, feeWallet] = await Promise.all([
    ExchangeWallet.findById(short._id).lean(), ExchangeWallet.findById(long._id).lean(),
    ExchangeWallet.findById(EXCHANGE_WALLET_ID).lean(),
  ]);
  const gross = (settled.settlement - trade.price) * TP_SCALE;
  assert.equal(sellerWallet.available, INITIAL_TP - gross - tradeFee(trade.price, 1, "maker"));
  assert.equal(buyerWallet.available, INITIAL_TP + gross - tradeFee(trade.price, 1, "taker"));
  assert.equal(sellerWallet.available + buyerWallet.available + feeWallet.available, 2 * INITIAL_TP);
  const positions = await ExchangePosition.find(filter).lean();
  assert.equal(positions.length, 2);
  assert.ok(positions.every(({ remaining }) => remaining === 0));
  assert.equal(positions.reduce((sum, position) => sum + position.realized, 0), 0);

  await settleRound(round, new Date(+now + MINUTE));
  assert.deepEqual(await ExchangeWallet.findById(short._id).lean(), sellerWallet);
  assert.deepEqual(await ExchangeWallet.findById(long._id).lean(), buyerWallet);
  assert.equal(await ExchangeEvent.countDocuments({ ...filter, action: "normal" }), 1);
  await assert.rejects(startMpiBotFade(market._id, admin, "Too late", now), { status: 409 });
  assert.equal((await ExchangeMarket.findById(market._id)).settlement, 627.5);
}

async function gradualFade(admin, students) {
  const round = await roundFixture(admin, 1, { scheduleBots: false });
  const filter = { marketId: round.market._id };
  for (const student of students) await humanAttempt(round, student._id, 65);
  await ExchangeExamBotAttempt.create(rawBotAttempt(round, 100));
  const initialTime = round.at(70);
  await saveObservedMpi(round.market, initialTime, () => initialTime);
  const mixed = await ExchangeTick.findOne({ ...filter, sampledAt: initialTime }).lean();
  assert.equal(+mixed.publishAt, +round.at(100));
  assert.equal(mixed.botWeight, 1);
  assert.equal(mixed.botPopulationCount, 1);
  await maintainMarketMaker(round.market._id, () => initialTime);
  const initial = await ExchangeMarket.findById(round.market._id).lean();
  assert.equal(initial.marketMakerDecision.mode, "baseline");
  assert.equal(initial.marketMakerDecision.reason, "weighted-settlement-unvalidated");
  const startedAt = round.at(75);
  await startMpiBotFade(round.market._id, admin, "Gradually reduce bot contribution", startedAt);
  await startMpiBotFade(round.market._id, admin, "Repeated request", round.at(76));
  const controls = await ExchangeEvent.find({ ...filter, action: "mpi-bot-fade-start" }).lean();
  assert.equal(controls.length, 1);
  assert.equal(controls[0].detail.initialWeight, 1);
  assert.equal(+controls[0].detail.endsAt, +round.at(135));
  assert.equal((await ExchangeTick.findById(mixed._id)).supersededAt ?? null, null);
  await saveObservedMpi(round.market, round.at(105), () => round.at(105));
  const half = await ExchangeTick.findOne({ ...filter, sampledAt: round.at(105) }).lean();
  assert.equal(half.mpi, 681.82);
  assert.equal(half.botWeight, 0.5);
  await saveObservedMpi(round.market, round.at(135), () => round.at(135));
  const sample = await ExchangeTick.findOne(filter).sort({ sampledAt: -1 }).lean();
  assert.equal(sample.mpi, 650);
  assert.equal(sample.botWeight, 0);
  assert.equal(sample.populationCount, students.length);
  assert.ok((await latestPublishedMpi(round.market, round.at(100)))._id.equals(mixed._id));
  assert.ok((await latestPublishedMpi(round.market, round.at(164)))._id.equals(half._id));
  assert.ok((await latestPublishedMpi(round.market, round.at(165)))._id.equals(sample._id));
  await maintainMarketMaker(round.market._id, () => round.at(135));
  const afterFade = await ExchangeMarket.findById(round.market._id).lean();
  assert.equal(+afterFade.mpiFade.startedAt, +startedAt);
  assert.equal(afterFade.tradingBotsEnabled, true);
  assert.equal(afterFade.marketMakerEnabled, true);
  assert.ok(await ExchangeOrder.exists({ ...filter, source: "MM", status: "working", expiresAt: { $gt: round.at(135) } }));
  assert.equal(afterFade.marketMakerDecision.mode, "baseline", "A zero-weight round can evaluate the existing Forecast B history");
  assert.equal(afterFade.marketMakerDecision.reason, "insufficient-history");
  assertSettlement(await settleRound(round, await closeExam(round)), 650, students.length, 0);
}

async function fadeCutoffSettlement(admin, students) {
  const round = await roundFixture(admin, 2);
  for (const student of students) await humanAttempt(round, student._id, 65);
  await ExchangeExamBotAttempt.create(rawBotAttempt(round, 100));
  await startMpiBotFade(round.market._id, admin, "Phase out bot scores", round.at(120));
  // Settlement must derive the final weight even if no worker heartbeat saved a fade step.
  assert.equal((await ExchangeMarket.findById(round.market._id)).botWeight, 1);
  assertSettlement(await settleRound(round, await closeExam(round)), 650, students.length, 0);

  const partial = await roundFixture(admin, 5);
  await humanAttempt(partial, students[0]._id, 60);
  await ExchangeExamBotAttempt.create(rawBotAttempt(partial, 90));
  // An imported fade can be in progress at close. The operator action normally
  // rejects this late of a start, so seed the persisted state directly.
  const startedAt = new Date(+partial.closeAt - 30 * MINUTE);
  await assert.rejects(startMpiBotFade(partial.market._id, admin, "Too near close", startedAt), { status: 409 });
  await ExchangeMarket.updateOne({ _id: partial.market._id }, { $set: { mpiFade: { startedAt, actorId: admin, initialWeight: 1 } } });
  const settled = await settleRound(partial, await closeExam(partial));
  assertSettlement(settled, 700, 2, 1);
  assert.equal(settled.settlementBotWeight, 0.5);
}

async function botOnlyAndVoid(admin) {
  const botOnly = await roundFixture(admin, 3);
  await ExchangeExamBotAttempt.create([
    rawBotAttempt(botOnly, 60), rawBotAttempt(botOnly, 75, { submittedAt: new Date(+botOnly.closeAt - 1) }),
  ]);
  assertSettlement(await settleRound(botOnly, await closeExam(botOnly)), 675, 2, 2);

  const noValid = await roundFixture(admin, 4);
  await ExchangeExamBotAttempt.create([
    rawBotAttempt(noValid, 100, { reconstructedAt: noValid.at(61) }),
    rawBotAttempt(noValid, 100, { submittedAt: noValid.closeAt }),
  ]);
  const now = await closeExam(noValid);
  for (let pass = 0; pass < 2; pass++) {
    const result = await settleRound(noValid, now);
    assert.equal(result.phase, "void");
    assert.equal(result.decision, "void");
    assert.equal(result.settlement ?? null, null);
    assert.equal(result.escrow, 0);
  }
  assert.equal(await ExchangeEvent.countDocuments({ marketId: noValid.market._id, action: "void" }), 1);
}

async function main() {
  assert.match(process.env.DB || "", /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/matths_audit_/);
  process.env.EXCHANGE_OPERATOR_ONLY = "0";
  await mongoose.connect(process.env.DB);
  await Promise.all([...Object.values(models), ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User].map((model) => model.init()));
  await ExchangeSetting.create({ _id: "default", marketMakerPolicy: "B", publicWeeklyBotsEnabled: true,
    publicMarketMakerEnabled: true, automatedTradingDisabled: true });
  const [admin, ...students] = await User.create([
    { name: "Settlement audit admin", email: "admin@settlement.fixture.invalid", role: "admin", passwordHash: "test" },
    ...Array.from({ length: 5 }, (_, index) => ({
      name: `Settlement audit student ${index}`, email: `student-${index}@settlement.fixture.invalid`, role: "student", passwordHash: "test",
    })),
  ]);
  await mixedSettlement(admin._id, students);
  await gradualFade(admin._id, students);
  await fadeCutoffSettlement(admin._id, students);
  await botOnlyAndVoid(admin._id);
  assert.equal(await ExchangeWallet.countDocuments({ available: { $lt: 0 } }), 0);
  console.log("Exchange weighted settlement verified: persisted bots, validity and cutoffs, independent controls, escrow and retry-safe payout.");
}

main().catch((cause) => { console.error(cause); process.exitCode = 1; }).finally(() => mongoose.disconnect());
