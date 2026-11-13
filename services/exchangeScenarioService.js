const { createHash } = require("node:crypto");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const ROUND_HOURS = 141;
const BOT_POLICY_START = Date.parse("2026-11-15T06:00:00Z");
const ORDER_LIFETIME = 6 * HOUR;

function eligibleRound(market) {
  if (market.type !== "weekly" || +market.closeAt - +market.opensAt !== ROUND_HOURS * HOUR) return false;
  const opens = new Date(market.opensAt);
  return opens.getUTCDay() === 0 && opens.getUTCHours() === 6 && +opens % HOUR === 0;
}

function newParticipant(key, opensAt, slot, cadence = HOUR) {
  const seed = createHash("sha256").update(`matths-scenario-v1:${key}:${slot}`).digest();
  const slotStart = +opensAt + slot * cadence;
  const submissionJitter = Math.min(40, cadence / MINUTE - 9);
  const submittedAt = slotStart + (2 + seed[0] % submissionJitter) * MINUTE;
  const orderAt = submittedAt + (3 + seed[1] % 15) * MINUTE;
  const score = 34 + (seed[2] % 29) + (seed[3] % 29);
  const outlook = seed[4] % 241 - 120;
  const urgency = seed[5] % 49;
  const id = seed.subarray(6, 18).toString("hex");
  return { id, number: slot + 1, submittedAt, orderAt, score, outlook, urgency };
}

function botOrder(participant, mpi) {
  const { score, outlook, urgency } = participant;
  const opinion = Math.round(0.55 * mpi + 4.5 * score + outlook);
  const side = opinion >= mpi ? "buy" : "sell";
  const buy = side === "buy";
  const limit = Math.max(1, Math.min(999, opinion + (buy ? urgency : -urgency)));
  return { direction: buy ? "long" : "short", side, price: limit };
}

function botParticipationForSchedule(opensAt, closeAt) {
  return +opensAt >= BOT_POLICY_START && eligibleRound({ type: "weekly", opensAt, closeAt });
}

function submittedBots(market, now) {
  if (!market.botSeed || !eligibleRound(market)) return [];
  // An Exam Bot rollout in an already open round begins at activation, never at market open.
  if (market.examBotsStartedAt) {
    const start = +market.examBotsStartedAt;
    const through = Math.min(+now, +market.closeAt - 1);
    if (through < start) return [];
    const count = Math.floor((through - start) / HOUR) + 1;
    const key = `${market.botSeed}:${market._id}:exam:${start}`;
    return Array.from({ length: count }, (_, hour) => ({
      ...newParticipant(key, start, hour), submittedAt: start + hour * HOUR,
    }));
  }
  if (!market.botParticipation) return [];
  const cadence = (market.bootstrapPolicy?.submissionMinutes ?? 60) * MINUTE;
  const slots = Math.ceil((Math.min(+now, +market.closeAt) - +market.opensAt) / cadence);
  const key = `${market.botSeed}:${market._id}:${+market.opensAt}`;
  const bots = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const bot = newParticipant(key, market.opensAt, slot, cadence);
    if (bot.submittedAt <= +now && bot.submittedAt < +market.closeAt) bots.push(bot);
  }
  return bots;
}

function dueBotOrder(market, now, publicMpi = 600) {
  if (!market.botParticipation || !market.botSeed || !eligibleRound(market) || +now >= +market.closeAt) return null;
  const hour = Math.floor((+now - +market.opensAt) / HOUR);
  if (hour < 0) return null;
  const key = `${market.botSeed}:${market._id}:${+market.opensAt}`;
  const bot = newParticipant(key, market.opensAt, hour);
  // Submit only in the bot's assigned hour. A restart never backdates a fill.
  if (+now < bot.orderAt) return null;
  return { ...botOrder(bot, publicMpi), botId: bot.id, expiresAt: new Date(Math.min(bot.orderAt + ORDER_LIFETIME, +market.closeAt)) };
}

module.exports = { eligibleRound, botParticipationForSchedule, submittedBots, dueBotOrder };
