const { createHash } = require("node:crypto");
const { ExchangeExamBotAttempt } = require("../models/exchangeModel");
const { dueLiveExamBots, eligibleRound, submittedBots } = require("./exchangeScenarioService");

const MINUTE = 60_000;
const POLICY = Object.freeze({
  version: 1, fadeMinutes: 60, stepMinutes: 5, minimumHumans: 5, tradingStopMinutesBeforeClose: 30,
});

// Version 2 activates an already open round from a forward-only cutoff.
const OPEN_ROUND_POLICY = Object.freeze({ ...POLICY, version: 2 });
const HISTORICAL_POLICY = Object.freeze({ ...POLICY, version: 3, submissionMinutes: 20 });
const LIVE_WEEKLY_POLICY = Object.freeze({ ...POLICY, version: 4, submissionMinutes: 20 });
const isHistoricalBootstrap = (market) => market?.bootstrapPolicy?.version === HISTORICAL_POLICY.version
  && ["replaying", "complete"].includes(market.historicalBootstrap?.status);
const isLiveWeeklyBootstrap = (market) => market?.bootstrapPolicy?.version === LIVE_WEEKLY_POLICY.version
  && !market.historicalBootstrap?.status && !market.replayRecordedAt && eligibleRound(market);
const usesIndependentTraderWallets = (market) => isHistoricalBootstrap(market) || isLiveWeeklyBootstrap(market);
const isBootstrap = (market) => [POLICY.version, OPEN_ROUND_POLICY.version, HISTORICAL_POLICY.version, LIVE_WEEKLY_POLICY.version]
  .includes(market?.bootstrapPolicy?.version);
const traderStopAt = (market) => new Date(+market.closeAt - (market.bootstrapPolicy.tradingStopMinutesBeforeClose ?? POLICY.tradingStopMinutesBeforeClose) * MINUTE);
const tradersEnabledAt = (market, now) => market.tradingBotsEnabled !== false && now < traderStopAt(market);

function fadeAt(market, now) {
  const { mpiFade, bootstrapPolicy } = market;
  if (!mpiFade?.startedAt) return { weight: 1, step: 0 };
  const elapsed = Math.max(0, +now - +mpiFade.startedAt) / MINUTE;
  const duration = bootstrapPolicy.fadeMinutes;
  const interval = bootstrapPolicy.stepMinutes;
  const step = Math.min(Math.floor(elapsed / interval), duration / interval);
  return { step, weight: Math.round(mpiFade.initialWeight * (1 - step * interval / duration) * 10_000) / 10_000 };
}

function weightedMpi(humanTotal, humanCount, botTotal, botCount, weight) {
  const denominator = humanCount + weight * botCount;
  return denominator ? Math.round((humanTotal + weight * botTotal) * 1000 / denominator) / 100 : null;
}

async function readExamBots(market, now, session) {
  return ExchangeExamBotAttempt.find({ marketId: market._id, submittedAt: { $lte: now } })
    .select("botId number label score submittedAt source reconstructedAt openingBatch").sort({ submittedAt: 1, number: 1 })
    .session(session || null).lean();
}

async function recordExamBots(market, exam, now, session) {
  const existing = await readExamBots(market, now, session);
  const known = new Set(existing.map((row) => String(row.botId)));
  // The market-wide fade changes the weighting, while the weekly scenario continues.
  const through = market.mpiFade?.startedAt && !usesIndependentTraderWallets(market)
    ? new Date(Math.min(+now, +market.mpiFade.startedAt + market.bootstrapPolicy.fadeMinutes * MINUTE - 1)) : now;
  // The live runner accepts the current slot only and records the server clock.
  const participants = isLiveWeeklyBootstrap(market) ? dueLiveExamBots(market, now) : submittedBots(market, through);
  const due = participants.filter(({ id, submittedAt }) =>
    !known.has(id) && submittedAt >= +exam.releaseAt && submittedAt < +exam.closeAt);
  if (!due.length) return { bots: existing, openingBots: [] };
  const rows = gradeExamBots(market, exam, due);
  await ExchangeExamBotAttempt.insertMany(rows, { session });
  return { bots: existing.concat(rows), openingBots: rows.filter(({ openingBatch }) => openingBatch) };
}

function gradeExamBots(market, exam, bots) {
  const { gradePrivateMockAnswers } = require("./privateMockExamService");
  const questionNumbers = exam.questionNumbers?.length === exam.questionCount ? exam.questionNumbers : null;
  return bots.map((bot) => {
    const answers = Array(exam.questionCount).fill("");
    for (const [i, correctAnswer] of exam.answerKey.entries()) {
      const draw = createHash("sha256").update(`${market.botSeed}:${bot.id}:${i}`).digest().readUInt16BE() / 65_536;
      if (draw < bot.score / 100) {
        answers[(questionNumbers?.[i] ?? i + 1) - 1] = correctAnswer.split("|").map((option) => option.trim()).find(Boolean) ?? "";
      }
    }
    const grading = gradePrivateMockAnswers({ ...exam, answers });
    return { marketId: market._id, examId: exam._id, botId: bot.id, number: bot.number,
      source: "BOT", label: botLabel("ExamBot", bot.number), submittedAt: new Date(bot.submittedAt),
      ...(bot.opening ? { openingBatch: true } : {}),
      answers: grading.answers, answeredCount: grading.answeredCount, correctCount: grading.correctCount,
      score: grading.score, correctByQuestion: grading.correctByQuestion };
  });
}

const traderId = (botId) => createHash("sha256").update(`exchange-trader:${botId}`).digest("hex").slice(0, 24);
const botLabel = (role, number = 1) => `${role}${number}`;

function traderSignal(bot, snapshot, previous, book) {
  const change = previous ? snapshot.mpi - previous.mpi : 0;
  const estimate = 0.65 * snapshot.mpi + 3.5 * bot.score + 0.25 * change;
  if (book.ask != null && estimate >= book.ask + 4) return { direction: "long", price: book.ask };
  if (book.bid != null && estimate <= book.bid - 4) return { direction: "short", price: book.bid };
  if (book.ask == null && estimate >= snapshot.mpi + 4) return { direction: "long", price: Math.min(999, Math.floor(estimate - 3)) };
  if (book.bid == null && estimate <= snapshot.mpi - 4) return { direction: "short", price: Math.max(1, Math.ceil(estimate + 3)) };
  return null;
}

module.exports = {
  POLICY, OPEN_ROUND_POLICY, HISTORICAL_POLICY, LIVE_WEEKLY_POLICY, isHistoricalBootstrap, isLiveWeeklyBootstrap,
  usesIndependentTraderWallets, isBootstrap, traderStopAt, tradersEnabledAt, fadeAt, weightedMpi, readExamBots, recordExamBots,
  gradeExamBots, traderId, botLabel, traderSignal,
};
