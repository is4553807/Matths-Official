const { createHash } = require("node:crypto");
const {
  ExchangeMarket, ExchangeMarketMakerForecast, ExchangeMarketMakerHistory, ExchangeOrder, ExchangeTick, ExchangeTrade,
} = require("../models/exchangeModel");
const mongoose = require("mongoose");
const { MPI_DELAY_MS, liveAttemptRows, pendingAttempts, readWeeklyExam, validAttempts, validAttemptsAtMarketTime,
  weeklyExamReady } = require("./exchangeMarketService");

const HISTORY_VERSION = 1;
const MODEL_VERSION = "weekly-human-mean-v1";
const MAX_ROUNDS = 12;
const MIN_ROUNDS = 8;
const MIN_FLOW_ROUNDS = 2;
const SHRINKAGE = 20;
const DEFAULT_HORIZON_MS = 60_000;
const FLOW_PROCESSING_TOLERANCE_MS = 10_000;
const mpiInRange = (value) => Number.isFinite(value) && value >= 0 && value <= 1000;
const dataTime = (snapshot) => snapshot.dataCutoffAt ?? snapshot.sampledAt;
const elapsedAt = (time, market) => +time - +market.opensAt;
const clipMpi = (value) => Math.min(1000, Math.max(0, value));

function humanSnapshot(snapshot) {
  if (!snapshot || snapshot.unavailable || !mpiInRange(snapshot.mpi)
    || !Number.isSafeInteger(snapshot.populationCount) || snapshot.populationCount <= 0
    || (snapshot.humanPopulationCount == null && snapshot.botPopulationCount == null)
    || (snapshot.botPopulationCount > 0 && snapshot.botWeight !== 0)
    || (snapshot.reconstructedBotPopulationCount > 0 && snapshot.botWeight !== 0)) return null;
  if (snapshot.humanPopulationCount != null && snapshot.humanPopulationCount !== snapshot.populationCount) return null;
  return { count: snapshot.populationCount, mean: snapshot.mpi };
}

function contributionsOf(snapshot) {
  const entries = new Map();
  for (const entry of snapshot.contributions ?? []) {
    const match = /^([a-f0-9]{24}):(\d+(?:\.\d+)?)$/i.exec(entry);
    if (!match || +match[2] > 100) return null;
    const id = match[1].toLowerCase();
    if (entries.has(id)) return null;
    entries.set(id, +match[2] * 10);
  }
  return entries;
}

function captureCohort(snapshot, finalScores, scoreSum) {
  const human = humanSnapshot(snapshot);
  if (!human) return null;
  const cohort = { snapshotId: snapshot._id, cutoffAt: dataTime(snapshot), publishAt: snapshot.publishAt,
    supersededAt: snapshot.supersededAt };
  const contributors = contributionsOf(snapshot);
  if (!contributors || contributors.size !== human.count || Math.abs(
    [...contributors.values()].reduce((sum, score) => sum + score, 0) / human.count - human.mean
  ) > 0.005001) return cohort;

  let remainingCount = finalScores.size;
  let remainingScoreSum = scoreSum;
  for (const key of contributors.keys()) {
    if (!finalScores.has(key)) continue;
    remainingCount--;
    remainingScoreSum -= finalScores.get(key);
  }
  return { ...cohort, earlyMean: human.mean, remainingCount, remainingScoreSum };
}

async function captureMarketMakerHistory(market, { exam, decision, decidedAt, session, historical = false }) {
  if (market.type !== "weekly" || !exam || exam.status === "cancelled" || String(exam._id) !== String(market.examId)
    || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt || decidedAt < market.closeAt
    || !exam.settlementCompletedAt || exam.settlementCompletedAt > decidedAt || decision.botParticipantCount > 0) return null;
  if (!session?.inTransaction()) throw new Error("Exchange forecast history must use the settlement transaction");

  const criteria = historical ? validAttemptsAtMarketTime(exam, decidedAt) : validAttempts(exam, decidedAt);
  const attempts = await liveAttemptRows(criteria, session);
  if (new Set(attempts.map((attempt) => String(attempt._id))).size !== attempts.length) return null;
  const scores = new Map(attempts.map((attempt) => [String(attempt._id), attempt.score * 10]));
  const scoreSum = [...scores.values()].reduce((sum, score) => sum + score, 0);
  const participantCount = scores.size;
  const matchesDecision = decision.decision === "normal"
    ? participantCount > 0 && participantCount === decision.participantCount
      && Math.round(scoreSum * 100 / participantCount) / 100 === decision.settlement
    : decision.decision === "void" && participantCount === 0 && await weeklyExamReady(exam, session);
  if (!matchesDecision) return null;

  const ticks = await ExchangeTick.find({
    marketId: market._id, kind: "observed", unavailable: { $ne: true }, reconstructedAt: null,
    publishAt: { $lt: market.closeAt },
    $or: [
      { dataCutoffAt: { $gte: market.opensAt, $lt: market.closeAt } },
      { dataCutoffAt: null, sampledAt: { $gte: market.opensAt, $lt: market.closeAt } },
    ],
  }).select("sampledAt dataCutoffAt publishAt supersededAt mpi populationCount botPopulationCount botWeight"
    + " reconstructedBotPopulationCount humanPopulationCount +contributions").sort({ publishAt: 1, _id: 1 }).session(session).lean();
  const cohorts = ticks.filter((tick) => +tick.publishAt - +dataTime(tick) >= MPI_DELAY_MS
    && (tick.supersededAt == null || tick.supersededAt > tick.publishAt))
    .map((tick) => captureCohort(tick, scores, scoreSum)).filter(Boolean);
  const [flow] = await loadObservedFlows([{ marketId: market._id, start: market.opensAt, end: market.closeAt }],
    decidedAt, session, { countOnly: true });
  const key = { marketId: market._id, version: HISTORY_VERSION };
  return ExchangeMarketMakerHistory.findOneAndUpdate(key, { $setOnInsert: {
    ...key, examId: exam._id, decidedAt, participantCount, scoreSum, cohorts, flowOrderCount: flow?.count ?? 0,
  } }, { session, upsert: true, returnDocument: "after", timestamps: { createdAt: true, updatedAt: false } }).lean();
}

async function archiveSettledMarketMakerHistory(marketId) {
  return mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findById(marketId).session(session).lean();
    const complete = market?.phase === "settled" && market.decision === "normal"
      || market?.phase === "void" && market.decision === "void";
    if (!complete || market.type !== "weekly" || !market.decisionAt || !market.settledAt
      || market.settledAt < market.decisionAt || market.settledAt > new Date()) return null;
    const exam = await readWeeklyExam(market.examId, session);
    if (!await weeklyExamReady(exam, session) || (await pendingAttempts(exam, market.decisionAt, session)).length) return null;
    return captureMarketMakerHistory(market, { exam, decision: market, decidedAt: market.decisionAt, session, historical: true });
  });
}

function visibleCohort(history, prior, elapsed, publishedElapsed) {
  const cutoff = +prior.opensAt + elapsed;
  const visibleAt = +prior.opensAt + publishedElapsed;
  return (history.cohorts ?? []).reduce((latest, cohort) => {
    if (+cohort.cutoffAt > cutoff || +cohort.publishAt > visibleAt
      || (cohort.supersededAt != null && +cohort.supersededAt <= visibleAt)) return latest;
    return !latest || +cohort.publishAt > +latest.publishAt ? cohort : latest;
  }, null);
}

function estimateScenario(history, cohort, current) {
  const { participantCount, scoreSum } = history;
  if (!Number.isSafeInteger(participantCount) || participantCount < 0 || !Number.isFinite(scoreSum)
    || scoreSum < 0 || scoreSum > participantCount * 1000) return undefined;
  if (!current) return participantCount ? scoreSum / participantCount : null;
  const remainingCount = cohort ? cohort.remainingCount : participantCount;
  const remainingScoreSum = cohort ? cohort.remainingScoreSum : scoreSum;
  if (!Number.isSafeInteger(remainingCount) || remainingCount < 0 || remainingCount > participantCount
    || !Number.isFinite(remainingScoreSum) || remainingScoreSum < 0 || remainingScoreSum > remainingCount * 1000
    || (cohort && !mpiInRange(cohort.earlyMean))) return undefined;
  const shift = cohort ? current.count / (current.count + SHRINKAGE) * (current.mean - cohort.earlyMean) : 0;
  const remainingMean = remainingCount ? clipMpi(remainingScoreSum / remainingCount + shift) : 0;
  const count = current.count + remainingCount;
  return count ? (current.count * current.mean + remainingCount * remainingMean) / count : null;
}

// The nearest-rank empirical quantile preserves the underlying settlement support.
function quantile(sorted, probability) {
  return sorted[Math.max(0, Math.ceil(sorted.length * probability) - 1)];
}

function forecastFromHistory(market, snapshot, now, completed, archives) {
  const cutoffAt = snapshot && dataTime(snapshot);
  const current = cutoffAt && snapshot.publishAt <= now && +snapshot.publishAt - +cutoffAt >= MPI_DELAY_MS
    && (!snapshot.supersededAt || snapshot.supersededAt > now)
    && cutoffAt >= market.opensAt && cutoffAt < market.closeAt
    && (!snapshot.marketId || String(snapshot.marketId) === String(market._id)) ? humanSnapshot(snapshot) : null;
  const publicSnapshotId = current ? snapshot._id : null;
  const byMarketId = new Map(archives.map((archive) => [String(archive.marketId), archive]));
  const matched = [];
  const scenarios = [];
  for (const prior of completed) {
    const history = byMarketId.get(String(prior._id));
    if (!history || String(history.examId) !== String(prior.examId)) continue;
    if ((prior.phase === "void" && history.participantCount !== 0)
      || (prior.phase === "settled" && (history.participantCount <= 0 || prior.participantCount !== history.participantCount
        || Math.round(100 * history.scoreSum / history.participantCount) / 100 !== prior.settlement))) continue;
    const cohort = current ? visibleCohort(history, prior, elapsedAt(cutoffAt, market), elapsedAt(snapshot.publishAt, market)) : null;
    const settlement = estimateScenario(history, cohort, current);
    if (settlement === undefined) continue;
    matched.push([history._id ?? history.marketId, cohort?.snapshotId ?? null]);
    scenarios.push({ marketId: prior._id, settlement, flows: [], calibrated: Number.isSafeInteger(history.flowOrderCount)
      && history.flowOrderCount > 0 });
  }
  for (const scenario of scenarios) scenario.probability = 1 / scenarios.length;
  const settlements = scenarios.map(({ settlement }) => settlement).filter((settlement) => settlement != null).sort((a, b) => a - b);
  const ready = scenarios.length >= MIN_ROUNDS && settlements.length >= MIN_ROUNDS;
  const reason = ready ? null : scenarios.length < MIN_ROUNDS ? "insufficient-restorable-rounds" : "insufficient-valid-settlements";
  const inputKey = createHash("sha256").update(JSON.stringify([MODEL_VERSION, String(market._id), publicSnapshotId,
    completed.map((prior) => prior._id), matched])).digest("hex");
  return {
    modelVersion: MODEL_VERSION, inputKey, publicSnapshotId, cutoffAt: current ? cutoffAt : null,
    basis: current ? "current-public-snapshot" : "historical-rounds",
    completedRoundCount: completed.length, restorableRoundCount: scenarios.length, validScenarioCount: settlements.length,
    invalidScenarioCount: scenarios.length - settlements.length, historicalMarketIds: scenarios.map(({ marketId }) => marketId), scenarios,
    mark: ready ? settlements.reduce((sum, value) => sum + value, 0) / settlements.length : null,
    p10: ready ? quantile(settlements, 0.1) : null, p90: ready ? quantile(settlements, 0.9) : null, reason,
  };
}

async function loadObservedFlows(windows, targetOpen, session, { countOnly = false } = {}) {
  if (!windows.length) return [];
  return ExchangeTrade.aggregate([
    { $match: { createdAt: { $lte: targetOpen }, takerSource: { $in: [null, "HUMAN"] }, botOnly: { $ne: true },
      quantity: { $gt: 0 }, $or: windows.map(({ marketId, start, end }) => ({ marketId, tradedAt: { $gte: start, $lt: end } })),
      $expr: { $lte: ["$createdAt", { $add: ["$tradedAt", FLOW_PROCESSING_TOLERANCE_MS] }] } } },
    { $group: { _id: { marketId: "$marketId", takerOrderId: "$takerOrderId" }, firstFillAt: { $min: "$tradedAt" } } },
    { $lookup: { from: ExchangeOrder.collection.name, localField: "_id.takerOrderId", foreignField: "_id", as: "order" } },
    { $unwind: "$order" },
    { $match: { $expr: { $and: [
      { $eq: ["$order.marketId", "$_id.marketId"] }, { $lte: ["$order.acceptedAt", "$firstFillAt"] },
    ] } } },
    { $replaceWith: "$order" },
    { $match: { createdAt: { $lte: targetOpen }, source: "HUMAN", botId: null, actorId: null,
      side: { $in: ["buy", "sell"] }, price: { $gte: 0, $lte: 1000 }, quantity: { $gte: 1, $lte: 5 },
      $or: windows.map(({ marketId, start, end }) => ({ marketId, acceptedAt: { $gte: start, $lt: end } })),
      $expr: { $lte: ["$createdAt", { $add: ["$acceptedAt", FLOW_PROCESSING_TOLERANCE_MS] }] } } },
    ...(countOnly ? [{ $count: "count" }] : [
      { $project: { marketId: 1, side: 1, price: 1, quantity: 1, acceptedAt: 1, sequence: 1 } },
      { $sort: { acceptedAt: 1, sequence: 1, _id: 1 } },
    ]),
  ]).session(session ?? null);
}

async function loadMarketMakerForecast({ market, snapshot, now, horizonMs = DEFAULT_HORIZON_MS, session }) {
  const completed = await ExchangeMarket.find({
    type: "weekly", phase: { $in: ["settled", "void"] }, _id: { $ne: market._id },
    closeAt: { $lt: market.opensAt }, settledAt: { $lte: market.opensAt }, createdAt: { $lte: market.opensAt },
  }).sort({ closeAt: -1, _id: -1 }).limit(MAX_ROUNDS)
    .select("opensAt closeAt examId phase settlement participantCount").session(session ?? null).lean();
  const archives = await ExchangeMarketMakerHistory.find({ marketId: { $in: completed.map(({ _id }) => _id) },
    version: HISTORY_VERSION, decidedAt: { $lte: market.opensAt }, createdAt: { $lte: market.opensAt },
  }).session(session ?? null).lean();
  const forecast = forecastFromHistory(market, snapshot, now, completed, archives);
  const elapsed = Math.max(0, elapsedAt(now, market));
  const byId = new Map(completed.map((prior) => [String(prior._id), prior]));
  const windows = forecast.scenarios.filter(({ calibrated }) => calibrated).flatMap(({ marketId }) => {
    const prior = byId.get(String(marketId));
    const start = new Date(+prior.opensAt + elapsed);
    const end = new Date(Math.min(+start + horizonMs, +prior.closeAt));
    return start < end ? [{ marketId, start, end }] : [];
  });
  const starts = new Map(windows.map(({ marketId, start }) => [String(marketId), +start]));
  const byScenario = new Map(forecast.scenarios.map((scenario) => [String(scenario.marketId), scenario]));
  const calibratedRoundCount = forecast.scenarios.filter(({ calibrated }) => calibrated).length;
  const flowReady = forecast.mark != null && calibratedRoundCount >= MIN_FLOW_ROUNDS;
  const orders = flowReady ? await loadObservedFlows(windows, market.opensAt, session) : [];
  for (const { marketId, side, price, quantity, acceptedAt } of orders) {
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(quantity)) continue;
    const id = String(marketId);
    byScenario.get(id).flows.push({ side, limitPrice: price, quantity, at: +acceptedAt - starts.get(id) });
  }
  const flowRoundCount = forecast.scenarios.filter(({ flows }) => flows.length).length;
  const flowOrderCount = forecast.scenarios.reduce((count, { flows }) => count + flows.length, 0);
  return { ...forecast, flowWindowCount: flowRoundCount, comparableWindowCount: windows.length, flowOrderCount, flowReady,
    calibratedRoundCount,
    flowReason: flowReady ? null : forecast.reason ?? "insufficient-observed-order-flow" };
}

async function recordMarketMakerForecast({ market, forecast, at, session }) {
  const { inputKey, modelVersion, publicSnapshotId, cutoffAt, historicalMarketIds, restorableRoundCount,
    validScenarioCount, invalidScenarioCount, mark, p10, p90, reason } = forecast;
  const key = { marketId: market._id, inputKey };
  return ExchangeMarketMakerForecast.findOneAndUpdate(key, { $setOnInsert: { ...key, modelVersion, publicSnapshotId,
    at, cutoffAt, historicalMarketIds, restorableRoundCount, validScenarioCount, invalidScenarioCount, mark, p10, p90, reason,
  } }, { session, upsert: true, returnDocument: "after", timestamps: { createdAt: true, updatedAt: false } }).lean();
}

module.exports = {
  MODEL_VERSION, MIN_ROUNDS, MIN_FLOW_ROUNDS, captureCohort, estimateScenario, forecastFromHistory,
  archiveSettledMarketMakerHistory, captureMarketMakerHistory, loadMarketMakerForecast, recordMarketMakerForecast,
};
