const mongoose = require("mongoose");
const { randomBytes } = require("node:crypto");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt, User } = require("../models/matthsModel");
const { ExchangeMarket, ExchangeSetting, ExchangeTick, ExchangeEvent, ExchangeOrder,
  ExchangeExamBotAttempt, ExchangeBotReplayMpi, ExchangeBotReplayTrade } = require("../models/exchangeModel");

const ROUNDS = Object.freeze({
  1: ["3", "6", "9", "10"],
  2: ["3", "6", "9", "10"],
  3: ["3", "5", "6", "7", "9", "10", "csat"],
});
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
const MPI_DELAY_MS = 30 * 60 * 1000;
const MPI_BATCH_SIZE = 5;
const DEFAULT_MPI_MINIMUM = 5;
const OBSERVED_MPI = "observed";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const { botParticipationForSchedule, submittedBots } = require("./exchangeScenarioService");
const { POLICY, OPEN_ROUND_POLICY, isBootstrap, fadeAt, weightedMpi, recordExamBots, gradeExamBots, readExamBots } = require("./exchangeBootstrapService");

const { replayBotFills } = require("./exchangeBotReplayService");

function error(status, message) {
  return Object.assign(new Error(message), { status });
}

function integer(value, min, max, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw error(400, `${label} 값을 확인해 주세요.`);
  }
  return Number(value);
}

function seoulInput(date) {
  return date ? new Date(new Date(date).getTime() + KST_OFFSET_MS).toISOString().slice(0, 16) : "";
}

function seoulDate(value) {
  const input = String(value || "");
  const result = new Date(`${input}:00+09:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) || !Number.isFinite(+result) || seoulInput(result) !== input) {
    throw error(400, "유효한 날짜와 시각을 입력해 주세요.");
  }
  return result;
}

function scheduleInput({ year, grade, round, examDate, closeAt, settlementSource, population, count2, count3, count4 }) {
  year = integer(year, 2000, 2100, "시행 연도");
  grade = integer(grade, 1, 3, "학년");
  round = String(round);
  if (!ROUNDS[grade].includes(round)) throw error(400, "해당 학년의 회차를 선택해 주세요.");
  const csat = round === "csat";
  const opensAt = seoulDate(`${examDate}T${csat ? "16:00" : "12:10"}`);
  closeAt = seoulDate(closeAt);
  if (!String(examDate).startsWith(`${year}-`) || closeAt <= opensAt) {
    throw error(400, "시험일은 시행 연도와 일치해야 하고, 마감은 개장보다 뒤여야 합니다.");
  }
  const counts = [count2, count3, count4];
  const questionCounts = counts.some((count) => count !== undefined && count !== "")
    ? counts.map((count) => integer(count, 0, 50, "배점별 문항 수"))
    : undefined;
  if (questionCounts && questionCounts.reduce((sum, count, index) => sum + count * (index + 2), 0) !== 100) {
    throw error(400, "배점 구성의 만점은 100점이어야 합니다.");
  }
  return {
    key: `${year}:${grade}:${round}`, type: csat ? "csat" : "mock", year, grade, round, examDate,
    title: csat ? `${year}년 수능 수학` : `고${grade} ${round}모 수학`, opensAt, closeAt,
    questionCounts, settlementSource: String(settlementSource || "").trim().slice(0, 200),
    population: String(population || "").trim().slice(0, 200),
  };
}

function weeklyExamQuery(examId) {
  return { ...(examId ? { _id: examId } : {}), formCode: "WEEKLY", isTest: { $ne: true } };
}

async function readWeeklyExam(examId, session) {
  return PrivateMockExam.findOne(weeklyExamQuery(examId))
    .select("title weekKey status releaseAt closeAt questionCount archiveItemId settlementCompletedAt questionNumbers +answerKey +points")
    .session(session || null).lean();
}

async function weeklyExamReady(exam, session) {
  if (!exam || exam.status === "cancelled" || !exam.archiveItemId || !exam.questionCount
    || exam.answerKey?.length !== exam.questionCount || exam.points?.length !== exam.questionCount
    || exam.points.some((point) => ![2, 3, 4].includes(point))
    || exam.points.reduce((sum, point) => sum + point, 0) !== 100
    || exam.answerKey.some((answer) => typeof answer !== "string" || !answer.trim())) return false;

  return Boolean(await ArchiveItem.exists({
    _id: exam.archiveItemId,
    mimeType: "application/pdf",
    deletedAt: null,
    $or: [{ r2ObjectKey: { $gt: "" } }, { cloudPublicId: { $gt: "" } }],
  }).session(session || null));
}

function receivedAttempts(exam, now) {
  return {
    examId: exam._id,
    status: "submitted",
    demoBatchKey: { $in: [null, ""] },
    source: { $in: [null, "HUMAN"] },
    submittedAt: { $gte: exam.releaseAt, $lt: exam.closeAt, $lte: now },
  };
}

function validAttempts(exam, now) {
  return {
    ...receivedAttempts(exam, now),
    score: { $gte: 0, $lte: 100 },
    integrityStatus: { $in: [null, "NOT_REVIEWED", "CLEAR"] },
    "submissionFinalization.status": { $nin: ["pending", "processing"] },
  };
}

const liveStudent = { role: "student", isTestAccount: { $ne: true }, testBatchKey: { $in: [null, ""] } };

function liveAttemptRows(filter, session) {
  return PrivateMockExamAttempt.aggregate([
    { $match: filter },
    { $lookup: {
      from: User.collection.name, localField: "userId", foreignField: "_id",
      pipeline: [{ $match: liveStudent }, { $project: { _id: 1 } }], as: "student",
    } },
    { $match: { "student.0": { $exists: true } } },
    { $project: { score: 1 } },
  ]).session(session || null);
}

function pendingAttempts(exam, now, session) {
  const { submittedAt: receiptWindow, status, ...receipt } = receivedAttempts(exam, now);
  return liveAttemptRows({
    ...receipt,
    $or: [
      { status, submittedAt: receiptWindow, $or: [
        { integrityStatus: "PENDING_INTEGRITY_REVIEW" },
        { "submissionFinalization.status": { $in: ["pending", "processing"] } },
      ] },
      { status: "in_progress", "submissionClaim.requestId": { $gt: "" },
        "submissionClaim.receivedAt": receiptWindow,
        "submissionClaim.expiresAt": { $gte: now } },
    ],
  }, session).append({ $limit: 1 });
}

function mpiDataCutoff(now) {
  return new Date(+now - MPI_DELAY_MS);
}

function publishedMpiFilter(marketId, now) {
  const cutoff = mpiDataCutoff(now);
  return {
    marketId, kind: OBSERVED_MPI, publishAt: { $lte: now }, supersededAt: null,
    $or: [{ dataCutoffAt: { $lte: cutoff } }, { dataCutoffAt: null, sampledAt: { $lte: cutoff } }],
  };
}

async function latestPublishedMpi(market, now, session) {
  const snapshot = await ExchangeTick.findOne(publishedMpiFilter(market._id, now)).sort({ publishAt: -1 }).session(session || null).lean();
  return snapshot && !snapshot.unavailable && snapshot.populationCount >= await readMpiMinimum(market, session) ? snapshot : null;
}

function activeBookOrders(marketId, now) {
  return { marketId, status: "working", remaining: { $gt: 0 },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}

function marketReference(bid, ask) {
  const spread = ask && bid ? ask.price - bid.price : 0;
  if (spread <= 0 || spread > 80) return { price: null, source: null };
  const operatorOnly = (level) => level.quantity === level.operatorQuantity;
  const source = operatorOnly(bid) && operatorOnly(ask) ? "operator"
    : bid.operatorQuantity || ask.operatorQuantity ? "mixed" : "students";
  return { price: (bid.price + ask.price) / 2, source };
}

function activeLiquidityPlan(market, now) {
  const plan = market.liquidityPlan;
  return plan?.startsAt <= now && now < plan.endsAt ? plan : null;
}

function bookLevels(marketId, now, session, snapshotId, operatorWalletId, scheduledLiquidity = false) {
  const filter = activeBookOrders(marketId, now);
  if (snapshotId !== undefined) {
    filter.$and = [{ $or: [
      { liquidityProvider: { $ne: "matths" } },
      snapshotId ? { mpiSnapshotId: snapshotId } : scheduledLiquidity ? { scheduledLiquidity: true } : { _id: null },
    ] }];
  }
  const operator = operatorWalletId ? { $or: [{ $eq: ["$liquidityProvider", "matths"] }, { $eq: ["$source", "BOT"] },
    { $eq: ["$userId", new mongoose.Types.ObjectId(operatorWalletId)] }] } : { $or: [{ $eq: ["$liquidityProvider", "matths"] }, { $eq: ["$source", "BOT"] }] };
  return ExchangeOrder.aggregate([
    { $match: filter },
    { $lookup: {
      from: User.collection.name, localField: "userId", foreignField: "_id",
      pipeline: [{ $match: liveStudent }, { $project: { _id: 1 } }], as: "student",
    } },
    { $match: { $or: [{ $expr: operator }, { "student.0": { $exists: true } }] } },
    { $group: {
      _id: { side: "$side", price: "$price" }, quantity: { $sum: "$remaining" },
      operatorQuantity: { $sum: { $cond: [operator, "$remaining", 0] } },
      botQuantity: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$botId", null] }, null] }, "$remaining", 0] } },
    } },
  ]).session(session || null);
}

async function readSetting(session) {
  const setting = await ExchangeSetting.findById("default").session(session || null).lean();
  return setting?.minimumAttempts ?? 0;
}

async function readMpiMinimum(market, session) {
  if (market?.minimumMpiAttempts != null) return Math.max(1, market.minimumMpiAttempts);
  const setting = await ExchangeSetting.findById("default").select("minimumMpiAttempts").session(session || null).lean();
  return Math.max(DEFAULT_MPI_MINIMUM, setting?.minimumMpiAttempts ?? 0);
}

function publicState(market, now = new Date()) {
  if (market.phase === "void") return "void";
  if (market.phase === "settled") return "settled";
  if (market.phase === "settling") return "settling";
  if (now >= market.closeAt) return market.type === "weekly" ? "verifying" : "awaiting-result";
  if (market.paused) return "paused";
  if (now < market.opensAt) return "scheduled";
  if (market.type === "weekly" && !market.openedAt) return "waiting";
  return "open";
}

async function syncWeeklyMarkets(now = new Date()) {
  const exams = await PrivateMockExam.find({
    ...weeklyExamQuery(), status: { $in: ["scheduled", "open"] }, closeAt: { $gt: now },
  }).sort({ releaseAt: 1 }).limit(12)
    .select("title weekKey status releaseAt closeAt questionCount archiveItemId +answerKey +points").lean();

  for (const exam of exams) {
    if (!await weeklyExamReady(exam)) continue;
    const key = `weekly:${exam._id}`;
    const questionCounts = [2, 3, 4].map((point) => exam.points.filter((value) => value === point).length);
    const botParticipation = botParticipationForSchedule(exam.releaseAt, exam.closeAt);
    const botRules = botParticipation ? { botParticipation, botSeed: randomBytes(32).toString("hex"),
      bootstrapPolicy: POLICY, tradingBotsEnabled: true, botWeight: 1 } : { botParticipation };
    await ExchangeMarket.updateOne({ key }, { $setOnInsert: {
      key, type: "weekly", examId: exam._id, title: exam.title,
      opensAt: exam.releaseAt, closeAt: exam.closeAt, questionCounts,
      ...botRules,
    } }, { upsert: true });
    await ExchangeMarket.updateOne({ key, phase: "scheduled", openedAt: null, $or: [
      { opensAt: { $ne: exam.releaseAt } }, { closeAt: { $ne: exam.closeAt } },
    ] }, { $set: { opensAt: exam.releaseAt, closeAt: exam.closeAt, questionCounts, ...botRules }, $inc: { revision: 1 } });

    if (botParticipation) {
      await ExchangeMarket.updateOne({ key, phase: "scheduled", openedAt: null, opensAt: { $gt: now }, botParticipation: true, "bootstrapPolicy.version": null },
        { $set: botRules });
    }
    if (exam.status !== "open" || now < exam.releaseAt) continue;
    await mongoose.connection.transaction(async (session) => {
      const market = await ExchangeMarket.findOne({ key, phase: "scheduled", openedAt: null }).select("+botSeed").session(session);
      if (!market || market.paused || market.closeAt <= now) return;
      const minimum = market.minimumAttempts ?? await readSetting(session);
      // An explicit opening minimum remains a requirement for real students.
      const needed = minimum - (isBootstrap(market) ? 0 : submittedBots(market, now).length);
      if (needed > 0) {
        const [result] = await liveAttemptRows(validAttempts(exam, now), session).append({ $limit: needed }, { $count: "count" });
        if ((result?.count ?? 0) < needed) return;
      }
      market.openedAt = now;
      market.appliedMinimum = minimum;
      market.revision += 1;
      await market.save({ session });
    });
  }
}

async function saveSchedule(input, actorId, now = new Date()) {
  const schedule = scheduleInput(input);
  return mongoose.connection.transaction(async (session) => {
    const existing = await ExchangeMarket.findOne({ key: schedule.key }).session(session);
    if (schedule.closeAt <= now || (existing && (existing.phase !== "scheduled" || existing.closeAt <= now))) {
      throw error(409, "거래가 종료된 시장은 일정을 변경할 수 없습니다.");
    }
    if (existing && now >= existing.opensAt && +existing.opensAt !== +schedule.opensAt) {
      throw error(409, "개장 이후에는 시험일을 변경할 수 없습니다.");
    }
    if (existing && now >= existing.opensAt && (
      (existing.settlementSource || "") !== schedule.settlementSource || (existing.population || "") !== schedule.population
    )) throw error(409, "개장 이후에는 사전 공지한 성적 출처와 모집단을 변경할 수 없습니다.");

    const market = existing || new ExchangeMarket();
    const previousCloseAt = market.closeAt;
    market.set(schedule);
    market.revision += 1;
    await market.save({ session });
    await new ExchangeEvent({ marketId: market._id, actorId, action: "schedule", detail: {
      opensAt: schedule.opensAt, closeAt: schedule.closeAt, previousCloseAt,
    } }).save({ session });
    return market;
  });
}

async function saveMinimum({ marketId, value, actorId }) {
  const minimumAttempts = integer(value, 0, 1_000_000, "최소 유효 응시자");
  return mongoose.connection.transaction(async (session) => {
    if (marketId) {
      const changed = await ExchangeMarket.updateOne({ _id: marketId, type: "weekly", phase: "scheduled", openedAt: null },
        { $set: { minimumAttempts }, $inc: { revision: 1 } }, { session });
      if (!changed.matchedCount) throw error(409, "개장 전 주간 시장만 최소 인원을 변경할 수 있습니다.");
    } else {
      await ExchangeSetting.updateOne({ _id: "default" }, { $set: { minimumAttempts } }, { upsert: true, session });
    }
    await new ExchangeEvent({ marketId, actorId, action: "minimum", detail: { minimumAttempts } }).save({ session });
  });
}

async function saveMpiMinimum({ marketId, value, actorId, now = new Date() }) {
  const minimumMpiAttempts = marketId && value === "" ? null
    : integer(value, marketId ? 1 : DEFAULT_MPI_MINIMUM, 1_000_000, "공식 MPI 공개 최소 인원");
  await mongoose.connection.transaction(async (session) => {
    if (marketId) {
      const update = minimumMpiAttempts === null ? { $unset: { minimumMpiAttempts: "" } } : { $set: { minimumMpiAttempts } };
      const changed = await ExchangeMarket.updateOne(
        { _id: marketId, type: "weekly", phase: "scheduled", closeAt: { $gt: now } }, update, { session }
      );
      if (!changed.matchedCount) throw error(409, "마감 전 주간 시장만 공식 MPI 공개 최소 인원을 변경할 수 있습니다.");
    } else {
      await ExchangeSetting.updateOne({ _id: "default" }, { $set: { minimumMpiAttempts } }, { upsert: true, session });
    }
    await new ExchangeEvent({ marketId, actorId, action: "mpi-minimum", detail: { minimumMpiAttempts } }).save({ session });
  });
}

// Apply the rollout once to the requested weekly round. Later admin edits take precedence.
async function applyNovember14MpiMinimum(now = new Date()) {
  const marketId = new mongoose.Types.ObjectId("6af57a46ad86b97eba7fda52");
  const closeAt = new Date("2026-11-14T03:00:00Z");
  if (now >= closeAt) return;
  const action = "mpi-minimum";
  const source = "2026-11-14-weekly-release";
  await mongoose.connection.transaction(async (session) => {
    if (await ExchangeEvent.exists({ marketId, action, "detail.source": source }).session(session)) return;
    const updated = await ExchangeMarket.updateOne({ _id: marketId, type: "weekly", phase: "scheduled", closeAt },
      { $set: { minimumMpiAttempts: 1 }, $inc: { revision: 1 } }, { session });
    if (!updated.matchedCount) return;
    await ExchangeEvent.create([{ marketId, action, detail: { minimumMpiAttempts: 1, source } }], { session });
  });
}

async function activateNovember14ExamBots(now = new Date()) {
  const marketId = new mongoose.Types.ObjectId("6af57a46ad86b97eba7fda52");
  const closeAt = new Date("2026-11-14T03:00:00Z");
  if (+now + MPI_DELAY_MS >= +closeAt) return;
  await mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findOne({ _id: marketId, type: "weekly", closeAt,
      phase: "scheduled", paused: { $ne: true }, openedAt: { $ne: null }, botParticipation: { $ne: true },
      "bootstrapPolicy.version": null })
      .session(session).lean();
    if (!market || publicState(market, now) !== "open") return;
    const exam = await readWeeklyExam(market.examId, session);
    if (exam?.status !== "open" || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +closeAt
      || !await weeklyExamReady(exam, session)) return;

    const result = await ExchangeMarket.updateOne({ _id: marketId, "bootstrapPolicy.version": null }, {
      $set: { examBotsStartedAt: now, bootstrapPolicy: OPEN_ROUND_POLICY, botWeight: 1, botParticipation: false,
        botSeed: randomBytes(32).toString("hex"), tradingBotsEnabled: true },
      $unset: { mpiCheckedAt: "" },
      $inc: { revision: 1 },
    }, { session });
    if (result.modifiedCount) await ExchangeEvent.create([{
      marketId, action: "exam-bots-start", detail: { startedAt: now, source: "BOT", cadenceMinutes: 60 },
    }], { session });
  });
}

async function backfillNovember14ExamBots(now = new Date(), clock = () => now) {
  const marketId = new mongoose.Types.ObjectId("6af57a46ad86b97eba7fda52");
  const closeAt = new Date("2026-11-14T03:00:00Z");
  if (+now + MPI_DELAY_MS >= +closeAt) return;
  await mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findOneAndUpdate({ _id: marketId, type: "weekly", closeAt,
      phase: "scheduled", paused: { $ne: true }, openedAt: { $ne: null }, replayRecordedAt: null,
      "bootstrapPolicy.version": OPEN_ROUND_POLICY.version, "mpiFade.startedAt": null,
    }, { $inc: { revision: 1 } }, { session, returnDocument: "after" }).select("+botSeed").lean();
    if (!market?.examBotsStartedAt || !market.botSeed) return;
    const exam = await readWeeklyExam(market.examId, session);
    if (exam?.status !== "open" || +exam.releaseAt !== +market.opensAt || +exam.closeAt !== +market.closeAt
      || !await weeklyExamReady(exam, session)) return;

    // Use a disjoint seed and the original hourly schedule for the missing interval.
    // Keep post-activation bots and their original labels and IDs intact.
    const historyMarket = { ...market, botParticipation: true, examBotsStartedAt: null,
      botSeed: `${market.botSeed}:historical-v1` };
    const historical = gradeExamBots(historyMarket, exam, submittedBots(historyMarket, new Date(+market.examBotsStartedAt - 1)))
      .map((row) => ({ ...row, label: `ExamBotReplay${row.number}`, reconstructedAt: now }));
    if (!historical.length) return;

    let total = 0;
    const snapshots = historical.map((attempt, index) => {
      total += attempt.score;
      return { marketId, sampledAt: attempt.submittedAt, publishAt: new Date(+attempt.submittedAt + MPI_DELAY_MS),
        reconstructedAt: now, mpi: weightedMpi(0, 0, total, index + 1, 1), populationCount: index + 1 };
    }).filter((snapshot) => snapshot.publishAt <= now);
    const fills = replayBotFills(historical, snapshots, { before: market.examBotsStartedAt, reconstructedAt: now });
    await ExchangeExamBotAttempt.insertMany(historical, { session });
    if (snapshots.length) await ExchangeBotReplayMpi.insertMany(snapshots, { session });
    if (fills.length) {
      await ExchangeBotReplayTrade.insertMany(fills.map((row, sequence) => ({ ...row, marketId, sequence })), { session });
    }

    const [students, bots] = [
      await liveAttemptRows(validAttempts(exam, now), session),
      await readExamBots(market, now, session),
    ];
    const humanScoreSum = students.reduce((sum, row) => sum + row.score, 0);
    const botScoreSum = bots.reduce((sum, row) => sum + row.score, 0);
    const botWeight = market.botWeight || 1;
    const mpi = weightedMpi(humanScoreSum, students.length, botScoreSum, bots.length, botWeight);
    const sampledAt = clock();
    const publishAt = new Date(+sampledAt + MPI_DELAY_MS);
    const populationCount = students.length + bots.length;
    const available = mpi != null && populationCount >= await readMpiMinimum(market, session);
    // A pending pre-backfill sample must not replace the corrected sample later.
    // Retain it in storage for audit and preserve every already public sample.
    await ExchangeTick.updateMany({ marketId, kind: OBSERVED_MPI, publishAt: { $gt: sampledAt }, supersededAt: null },
      { $set: { supersededAt: sampledAt } }, { session });
    const contributions = students.map((row) => `${row._id}:${row.score}`)
      .concat(bots.map((row) => `${row.botId}:${row.score}`));
    await ExchangeTick.create([{ marketId, kind: OBSERVED_MPI, sampledAt, dataCutoffAt: now, publishAt,
      expiresAt: new Date(+sampledAt + WEEK_MS * 2), mpi: available ? mpi : null, unavailable: !available,
      populationCount, humanPopulationCount: students.length, botPopulationCount: bots.length, botWeight,
      reconstructedBotPopulationCount: historical.length, humanScoreSum, botScoreSum, contributions }], { session });
    await ExchangeMarket.updateOne({ _id: marketId }, { $set: { replayRecordedAt: now, replayMpiCount: snapshots.length,
      replayVolume: fills.reduce((sum, row) => sum + row.quantity, 0), mpiCheckedAt: now,
      internalMpi: mpi, internalMpiCount: students.length, internalBotCount: bots.length, humanScoreSum, botScoreSum,
    } }, { session });
    await ExchangeEvent.create([{ marketId, action: "exam-bots-backfill", detail: {
      reconstructedAt: now, from: market.opensAt, before: market.examBotsStartedAt,
      botSubmissions: historical.length, replayFills: fills.length, publishAt,
    } }], { session });
  });
}

function sampleMinute(now) {
  return new Date(Math.floor(+now / MINUTE_MS) * MINUTE_MS);
}

function changedContributors(previous, current) {
  const before = new Set(previous);
  const after = new Set(current);
  const changed = new Set();
  for (const entry of before) if (!after.has(entry)) changed.add(entry.slice(0, 24));
  for (const entry of after) if (!before.has(entry)) changed.add(entry.slice(0, 24));
  return changed.size;
}

async function startMpiBotFade(marketId, actorId, reason, now = new Date()) {
  reason = String(reason || "").trim().slice(0, 300);
  if (!reason) throw error(400, "전환 사유를 입력해 주세요.");
  return mongoose.connection.transaction(async (session) => {
    const market = await ExchangeMarket.findByIdAndUpdate(marketId, { $inc: { revision: 1 } },
      { session, returnDocument: "after" });
    if (!market || !isBootstrap(market) || publicState(market, now) !== "open") throw error(409, "개장 중인 Bootstrap 회차만 전환할 수 있습니다.");
    if (market.mpiFade?.startedAt) return;
    const latestPublishAt = +now + market.bootstrapPolicy.fadeMinutes * MINUTE_MS + MPI_DELAY_MS + MINUTE_MS;
    if (latestPublishAt > +market.closeAt) throw error(409, "마감 전에 전환 결과를 공개할 시간이 부족합니다.");
    const exam = await readWeeklyExam(market.examId, session);
    if (!exam || !await weeklyExamReady(exam, session)) throw error(409, "유효한 주간 시험이 필요합니다.");
    const { minimumHumans } = market.bootstrapPolicy;
    const [result] = await liveAttemptRows(validAttempts(exam, now), session)
      .append({ $limit: minimumHumans }, { $count: "count" });
    if ((result?.count ?? 0) < minimumHumans) throw error(409, "전환에 필요한 실제 유효 응시 인원이 부족합니다.");
    const initialWeight = market.botWeight ?? 1;
    market.mpiFade = { startedAt: now, actorId, initialWeight };
    await market.save({ session });
    await ExchangeEvent.create([{ marketId, actorId, action: "mpi-bot-fade-start",
      detail: { reason, at: now, initialWeight, endsAt: new Date(+now + market.bootstrapPolicy.fadeMinutes * MINUTE_MS) } }], { session });
  });
}

async function saveObservedMpi(market, now, clock) {
  if (market.type !== "weekly" || now < market.opensAt || now >= market.closeAt) return;
  if (market.mpiCheckedAt && +now - +market.mpiCheckedAt < 60_000) return;
  await mongoose.connection.transaction(async (session) => {
    const current = await ExchangeMarket.findOneAndUpdate({
      _id: market._id, phase: "scheduled",
      $or: [{ mpiCheckedAt: null }, { mpiCheckedAt: { $lte: new Date(+now - 60_000) } }],
    }, { $set: { mpiCheckedAt: now } }, { session, timestamps: false, returnDocument: "after" }).select("+botSeed").lean();
    if (!current) return;
    const exam = await readWeeklyExam(current.examId, session);
    if (exam?.status !== "open" || +exam.releaseAt !== +current.opensAt || +exam.closeAt !== +current.closeAt
      || !await weeklyExamReady(exam, session)) return;
    const attempts = await liveAttemptRows(validAttempts(exam, now), session);
    const bootstrap = isBootstrap(current);
    const bots = bootstrap ? await recordExamBots(current, exam, now, session) : submittedBots(current, now);
    const humanScoreSum = attempts.reduce((sum, row) => sum + row.score, 0);
    const botScoreSum = bots.reduce((sum, bot) => sum + bot.score, 0);
    const { weight: botWeight, step } = bootstrap ? fadeAt(current, now) : { weight: current.botParticipation ? 1 : 0, step: 0 };
    const mpi = weightedMpi(humanScoreSum, attempts.length, botScoreSum, bots.length, botWeight);
    const populationCount = attempts.length + (botWeight > 0 ? bots.length : 0);
    const last = await ExchangeTick.findOne({ marketId: current._id, kind: OBSERVED_MPI, supersededAt: null })
      .sort({ sampledAt: -1 }).select("+contributions").session(session).lean();
    const previousStep = current.mpiFadeStep ?? 0;
    if (bootstrap && step > previousStep) {
      const events = [];
      for (let index = previousStep + 1; index <= step; index++) {
        const at = new Date(+current.mpiFade.startedAt + index * current.bootstrapPolicy.stepMinutes * MINUTE_MS);
        const after = fadeAt(current, at).weight;
        const before = fadeAt(current, new Date(+at - 1)).weight;
        events.push({ marketId: current._id, actorId: current.mpiFade.actorId, action: "mpi-bot-weight",
          detail: { at, appliedAt: now, dataCutoffAt: now, before, after,
          previousMpi: weightedMpi(humanScoreSum, attempts.length, botScoreSum, bots.length, before),
          nextMpi: weightedMpi(humanScoreSum, attempts.length, botScoreSum, bots.length, after) } });
      }
      await ExchangeEvent.insertMany(events, { session });
    }
    await ExchangeMarket.updateOne({ _id: current._id }, { $set: {
      internalMpi: mpi, internalMpiCount: attempts.length, internalBotCount: bots.length,
      humanScoreSum, botScoreSum, botWeight, mpiFadeStep: step,
    } }, { session, timestamps: false });
    const available = mpi !== null && populationCount >= await readMpiMinimum(current, session);
    const contributions = attempts.map(({ _id, score }) => `${_id}:${score}`)
      .concat(botWeight > 0 ? bots.map((bot) => `${bot.botId ?? bot.id}:${bot.score}`) : []);
    if (!available && (!bootstrap || (!last && step === previousStep) || (last?.unavailable && step === previousStep))) return;
    if (available && last && !last.unavailable && step === previousStep
      && changedContributors(last.contributions || [], contributions) < (bootstrap || current.botParticipation ? 1 : MPI_BATCH_SIZE)) return;
    const sampledAt = clock();
    const publishAt = new Date(+sampledAt + MPI_DELAY_MS);
    await ExchangeTick.create([{
      marketId: current._id, kind: OBSERVED_MPI, sampledAt, dataCutoffAt: now, mpi: available ? mpi : null,
      unavailable: !available, populationCount, humanPopulationCount: attempts.length, botPopulationCount: bots.length,
      reconstructedBotPopulationCount: bots.filter((bot) => bot.reconstructedAt).length,
      humanScoreSum, botScoreSum, botWeight, contributions, publishAt, expiresAt: new Date(+sampledAt + WEEK_MS * 2),
    }], { session });
  });
}

module.exports = {
  ROUNDS, error, integer, seoulInput, seoulDate, scheduleInput, readWeeklyExam, weeklyExamReady, validAttempts,
  readSetting, readMpiMinimum, publicState, syncWeeklyMarkets, saveSchedule, saveMinimum, saveMpiMinimum,
  sampleMinute, saveObservedMpi, startMpiBotFade, liveStudent, liveAttemptRows, pendingAttempts, applyNovember14MpiMinimum, activateNovember14ExamBots, backfillNovember14ExamBots,
  mpiDataCutoff, publishedMpiFilter, latestPublishedMpi, activeBookOrders, activeLiquidityPlan, marketReference, bookLevels,
};
