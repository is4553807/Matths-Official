const { createHash } = require("node:crypto");
const { ExchangeExamBotAttempt } = require("../models/exchangeModel");
const { submittedBots } = require("./exchangeScenarioService");

const MINUTE = 60_000;
const POLICY = Object.freeze({
  version: 1, fadeMinutes: 60, stepMinutes: 5, minimumHumans: 5, tradingStopMinutesBeforeClose: 30,
});

// Version 2 activates an already open round from a forward-only cutoff.
const OPEN_ROUND_POLICY = Object.freeze({ ...POLICY, version: 2 });
const isBootstrap = (market) => [POLICY.version, OPEN_ROUND_POLICY.version].includes(market.bootstrapPolicy?.version);
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
    .select("botId number label score submittedAt").sort({ number: 1 }).session(session || null).lean();
}

async function recordExamBots(market, exam, now, session) {
  const existing = await readExamBots(market, now, session);
  const known = new Set(existing.map((row) => String(row.botId)));
  // The runner materializes only events due while the scoring window was active.
  const through = market.mpiFade?.startedAt
    ? new Date(Math.min(+now, +market.mpiFade.startedAt + market.bootstrapPolicy.fadeMinutes * MINUTE - 1)) : now;
  const due = submittedBots(market, through).filter(({ id }) => !known.has(id));
  if (!due.length) return existing;
  const { gradePrivateMockAnswers } = require("./privateMockExamService");
  const rows = due.map((bot) => {
    const answers = Array(exam.questionCount).fill("");
    for (const [i, correctAnswer] of exam.answerKey.entries()) {
      const draw = createHash("sha256").update(`${market.botSeed}:${bot.id}:${i}`).digest().readUInt16BE() / 65_536;
      if (draw < bot.score / 100) {
        answers[(exam.questionNumbers?.[i] ?? i + 1) - 1] = correctAnswer.split("|").map((option) => option.trim()).find(Boolean) ?? "";
      }
    }
    const { score, correctByQuestion } = gradePrivateMockAnswers({ ...exam, answers });
    return { marketId: market._id, examId: exam._id, botId: bot.id, number: bot.number,
      source: "BOT", label: botLabel("ExamBot", bot.number), submittedAt: new Date(bot.submittedAt), score, correctByQuestion };
  });
  await ExchangeExamBotAttempt.insertMany(rows, { session });
  return existing.concat(rows);
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

module.exports = { POLICY, OPEN_ROUND_POLICY, isBootstrap, traderStopAt, tradersEnabledAt, fadeAt, weightedMpi, readExamBots, recordExamBots, traderId, botLabel, traderSignal };
