const mongoose = require("mongoose");
const { randomBytes } = require("node:crypto");
const { PrivateMockExam, PrivateMockExamAttempt } = require("../models/matthsModel");
const { ExchangeMarket, ExchangeOrder, ExchangeTick, ExchangeEvent, ExchangeExamBotAttempt } = require("../models/exchangeModel");
const { HISTORICAL_POLICY, traderStopAt } = require("./exchangeBootstrapService");
const {
  error, MPI_DELAY_MS, validAttemptsAtMarketTime, readWeeklyExam, weeklyExamReady, openWeeklyMarket,
  saveObservedMpi, syncWeeklyMarkets,
} = require("./exchangeMarketService");
const { eligibleRound, submittedBots } = require("./exchangeScenarioService");
const { maintainFundedBotOrders, maintainMarketMaker, reconcileHistoricalBook } = require("./exchangeTradingService");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function operatorOnlyExchange() {
  return process.env.EXCHANGE_OPERATOR_ONLY !== "0";
}

function currentWeekOpensAt(now) {
  const start = new Date(now);
  start.setUTCHours(6, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  if (start > now) start.setUTCDate(start.getUTCDate() - 7);
  return start;
}

async function prepareMarket(marketId, now) {
  return mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findOneAndUpdate(
      { _id: marketId, phase: "scheduled", paused: { $ne: true }, opensAt: { $lte: now }, closeAt: { $gt: now } },
      { $inc: { revision: 1 } }, { session, returnDocument: "after" },
    ).select("+botSeed");
    if (!market || !eligibleRound(market)) throw error(409, "현재 주간 시장의 일정을 확인해 주세요.");
    if (market.historicalBootstrap?.status) return market;
    const exam = await readWeeklyExam(market.examId, session);
    if (exam?.status !== "open" || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt
      || !await weeklyExamReady(exam, session)) throw error(409, "현재 주간 모의고사의 공개 상태와 문제지를 확인해 주세요.");

    // Existing student/manual orders and their ledger remain intact. Automated
    // activity from a different policy cannot be mixed into a chronological run.
    const automated = await ExchangeOrder.exists({
      marketId, $or: [{ source: "BOT" }, { botId: { $ne: null } }, { liquidityProvider: "matths" }],
    }).session(session);
    const botAttempts = await ExchangeExamBotAttempt.exists({ marketId }).session(session);
    if (automated || botAttempts || market.marketMakerId || market.mpiFade?.startedAt || market.liquidityPlan?.startsAt) {
      throw error(409, "다른 봇 정책이나 예약 호가가 이미 적용된 회차입니다.");
    }

    market.historicalBootstrap = { status: "replaying", startedAt: now, previousOpenedAt: market.openedAt };
    market.set({
      openedAt: undefined, appliedMinimum: undefined, mpiCheckedAt: undefined, examBotsStartedAt: undefined,
      bootstrapPolicy: HISTORICAL_POLICY, botSeed: randomBytes(32).toString("hex"), botParticipation: true,
      tradingBotsEnabled: true, botWeight: 1, marketMakerEnabled: true,
    });
    await market.save({ session });
    await ExchangeTick.updateMany({ marketId, kind: "observed", supersededAt: null },
      { $set: { supersededAt: now } }, { session });
    await ExchangeEvent.create([{
      marketId, action: "historical-bootstrap-start", at: now, detail: { from: market.opensAt, previousOpenedAt: market.historicalBootstrap.previousOpenedAt },
    }], { session });
    return market;
  });
}

async function checkpoints(market, exam, through) {
  const { cursorAt } = market.historicalBootstrap;
  const times = new Map();
  const publications = new Set();
  const add = (value, flags) => {
    const at = +value;
    if (value == null || at < +market.opensAt || at >= +market.closeAt || (cursorAt != null && at <= +cursorAt)) return;
    times.set(at, { ...times.get(at), ...flags });
  };
  const publish = (at) => {
    publications.add(at);
    add(at, { book: true, traders: true });
    add(at + MPI_DELAY_MS, { book: true, traders: true });
  };
  const sample = (at) => {
    add(at, { sample: true });
    publish(at + MPI_DELAY_MS);
  };
  add(market.opensAt, { open: true, book: true });
  for (const bot of submittedBots(market, through)) sample(bot.submittedAt);
  const students = await PrivateMockExamAttempt.find(validAttemptsAtMarketTime(exam, through))
    .select("submittedAt submissionFinalization.completedAt integrityClearedAt").lean();
  for (const attempt of students) {
    const at = Math.max(+attempt.submittedAt, +(attempt.submissionFinalization?.completedAt ?? 0),
      +(attempt.integrityClearedAt ?? 0));
    add(at, { open: true, book: true });
    sample(Math.ceil(at / MINUTE) * MINUTE);
  }
  // The stored publication can fall between planned times after an interrupted run.
  const ticks = await ExchangeTick.find({
    marketId: market._id, kind: "observed", supersededAt: null,
    publishAt: { $gte: new Date(+(cursorAt ?? market.opensAt) - HOUR) },
  }).select("sampledAt publishAt").lean();
  for (const tick of ticks) {
    publish(+tick.publishAt);
    add(+tick.sampledAt + HOUR, { book: true });
  }
  add(traderStopAt(market), { book: true, traders: true });
  add(through, { sample: true, book: true, traders: true });

  const ordered = [...times].sort(([a], [b]) => a - b);
  // Carry forward quotes that the previous checkpoint renewed only to the first wake.
  if (cursorAt && ordered.length) ordered[0][1].book = true;
  const recentPublications = [...publications].sort((a, b) => a - b);
  let publicationIndex = 0;
  for (const [at, flags] of ordered) {
    while (recentPublications[publicationIndex + 1] <= at) publicationIndex++;
    const age = at - recentPublications[publicationIndex];
    if (age >= 0 && age < 5 * MINUTE) Object.assign(flags, { book: true, traders: true });
  }
  let nextBookAt;
  const result = [];
  for (const [at, flags] of ordered.reverse()) {
    if (at <= +through) result.push({ ...flags, at: new Date(at), quoteThrough: new Date(nextBookAt ?? at) });
    if (flags.book) nextBookAt = at;
  }
  return result.reverse();
}

async function replayCheckpoint(marketId, exam, point) {
  const { at, quoteThrough, sample, open, book, traders } = point;
  const clock = () => at;
  return mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findOneAndUpdate({
      _id: marketId, "historicalBootstrap.status": "replaying",
      $or: [{ "historicalBootstrap.cursorAt": null }, { "historicalBootstrap.cursorAt": { $lt: at } }],
    }, { $inc: { revision: 1 } }, { session, returnDocument: "after" }).select("+botSeed");
    if (!market) return;
    if (open || !market.openedAt) await openWeeklyMarket(market, exam, at, session);
    if (sample) await saveObservedMpi(market, at, clock, { session, replay: true });
    if (book && market.openedAt) {
      const options = { session, replay: true };
      await maintainMarketMaker(marketId, clock, { ...options, quoteThrough });
      const changed = traders && await maintainFundedBotOrders(market, at, clock, options);
      if (changed) await maintainMarketMaker(marketId, clock, { ...options, quoteThrough });
    }
    await ExchangeMarket.updateOne({ _id: marketId }, { $set: { "historicalBootstrap.cursorAt": at } }, { session });
  });
}

async function finish(marketId, cursorAt, clock) {
  return mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findOne({
      _id: marketId, "historicalBootstrap.status": "replaying", "historicalBootstrap.cursorAt": cursorAt,
    }).session(session);
    if (!market) return;
    const at = new Date(Math.min(+clock(), +market.closeAt - 1));
    if (market.openedAt) await reconcileHistoricalBook(marketId, () => at, { session, replay: true });
    await ExchangeMarket.updateOne({ _id: marketId }, {
      $set: { "historicalBootstrap.status": "complete", "historicalBootstrap.completedAt": at },
    }, { session });
    await ExchangeEvent.create([{
      marketId, action: "historical-bootstrap-complete", at, detail: { from: market.opensAt, through: cursorAt },
    }], { session });
  });
}

async function runHistoricalBootstrap({ clock = () => new Date(), marketId } = {}) {
  if (!operatorOnlyExchange()) return;
  const now = clock();
  let market = await ExchangeMarket.findOne(marketId ? { _id: marketId } : {
    type: "weekly", "historicalBootstrap.status": "replaying",
  }).sort({ opensAt: 1 }).select("+botSeed").lean();
  if (!market && !marketId) {
    const exam = await PrivateMockExam.findOne({
      formCode: "WEEKLY", isTest: { $ne: true }, status: "open", releaseAt: currentWeekOpensAt(now), closeAt: { $gt: now },
    }).select("_id").lean();
    if (!exam) return;
    const filter = { key: `weekly:${exam._id}` };
    market = await ExchangeMarket.findOne(filter).select("+botSeed").lean();
    if (!market) {
      await syncWeeklyMarkets(now);
      market = await ExchangeMarket.findOne(filter).select("+botSeed").lean();
    }
  }
  if (!market || !eligibleRound(market) || now < market.opensAt) return;
  if (market.historicalBootstrap?.status === "complete") return market;
  if (!market.historicalBootstrap?.status) {
    if (now >= market.closeAt || market.paused || market.phase !== "scheduled") return;
    market = await prepareMarket(market._id, now);
  }
  const exam = await readWeeklyExam(market.examId);
  if (!await weeklyExamReady(exam) || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt) {
    throw error(409, "과거 거래 처리 중 주간 모의고사 일정이 변경되었습니다.");
  }
  let through = new Date(Math.min(+now, +market.closeAt - 1));
  while (true) {
    for (const point of await checkpoints(market, exam, through)) await replayCheckpoint(market._id, exam, point);
    const current = await ExchangeMarket.findById(market._id).select("+botSeed").lean();
    if (current.historicalBootstrap.status === "complete") return current;
    const next = new Date(Math.min(+clock(), +current.closeAt - 1));
    if (+next - +through < MINUTE) {
      if (next > current.historicalBootstrap.cursorAt) {
        for (const point of await checkpoints(current, exam, next)) await replayCheckpoint(current._id, exam, point);
      }
      await finish(current._id, next, clock);
      return ExchangeMarket.findById(current._id).lean();
    }
    market = current;
    through = next;
  }
}

module.exports = { currentWeekOpensAt, operatorOnlyExchange, runHistoricalBootstrap };
