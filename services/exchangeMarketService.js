const { randomInt } = require("node:crypto");
const mongoose = require("mongoose");
const { ArchiveItem, PrivateMockExam, PrivateMockExamAttempt } = require("../models/matthsModel");
const { ExchangeMarket, ExchangeSetting, ExchangeTick, ExchangeEvent } = require("../models/exchangeModel");

const ROUNDS = Object.freeze({
  1: ["3", "6", "9", "10"],
  2: ["3", "6", "9", "10"],
  3: ["3", "5", "6", "7", "9", "10", "csat"],
});
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SAMPLE_DELAY_MS = 30 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    .select("title weekKey status releaseAt closeAt questionCount archiveItemId settlementCompletedAt +answerKey +points")
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

function validAttempts(exam, now) {
  return {
    examId: exam._id,
    status: "submitted",
    demoBatchKey: { $in: [null, ""] },
    submittedAt: { $gte: exam.releaseAt, $lt: exam.closeAt, $lte: now },
    score: { $gte: 0, $lte: 100 },
    integrityStatus: { $in: [null, "NOT_REVIEWED", "CLEAR"] },
    "submissionFinalization.status": { $nin: ["pending", "processing"] },
  };
}

async function readSetting(session) {
  const setting = await ExchangeSetting.findById("default").session(session || null).lean();
  return setting?.minimumAttempts ?? 0;
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
    await ExchangeMarket.updateOne({ key }, { $setOnInsert: {
      key, type: "weekly", examId: exam._id, title: exam.title,
      opensAt: exam.releaseAt, closeAt: exam.closeAt, questionCounts,
    } }, { upsert: true });
    await ExchangeMarket.updateOne({ key, phase: "scheduled", openedAt: null, $or: [
      { opensAt: { $ne: exam.releaseAt } }, { closeAt: { $ne: exam.closeAt } },
    ] }, { $set: { opensAt: exam.releaseAt, closeAt: exam.closeAt, questionCounts }, $inc: { revision: 1 } });

    if (exam.status !== "open" || now < exam.releaseAt) continue;
    await mongoose.connection.transaction(async (session) => {
      const market = await ExchangeMarket.findOne({ key, phase: "scheduled", openedAt: null }).session(session);
      if (!market || market.paused || market.closeAt <= now) return;
      const minimum = market.minimumAttempts ?? await readSetting(session);
      if (minimum && await PrivateMockExamAttempt.countDocuments(validAttempts(exam, now)).session(session) < minimum) return;
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

async function setPaused(marketId, paused, actorId, reason) {
  reason = String(reason || "").trim().slice(0, 300);
  if (!reason) throw error(400, "중지·재개 사유를 입력해 주세요.");
  return mongoose.connection.transaction(async (session) => {
    const changed = await ExchangeMarket.updateOne(
      { _id: marketId, phase: "scheduled", closeAt: { $gt: new Date() } },
      { $set: { paused, reason }, $inc: { revision: 1 } }, { session }
    );
    if (!changed.matchedCount) throw error(409, "종료된 시장은 중지·재개할 수 없습니다.");
    await new ExchangeEvent({ marketId, actorId, action: paused ? "pause" : "resume", detail: { reason } }).save({ session });
  });
}

function calculateSample(attempts, pick = randomInt) {
  const groups = Array.from({ length: 9 }, () => []);
  for (const attempt of attempts) groups[(attempt.exchangeMmrGrade || 7) - 1].push(attempt.score);
  let total = 0;
  let sampleCount = 0;
  for (const group of groups) {
    if (!group.length) continue;
    const size = Math.max(1, Math.round(group.length / 10));
    const chosen = new Set();
    let sum = 0;
    for (let index = group.length - size; index < group.length; index += 1) {
      const random = pick(index + 1);
      const selected = chosen.has(random) ? index : random;
      chosen.add(selected);
      sum += group[selected];
    }
    total += (sum / size) * group.length;
    sampleCount += size;
  }
  return { mpi: attempts.length ? Math.round(total / attempts.length * 1000) / 100 : null,
    populationCount: attempts.length, sampleCount };
}

async function saveSample(market, now = new Date()) {
  if (market.type !== "weekly" || now < market.opensAt || now >= market.closeAt) return;
  const exam = await readWeeklyExam(market.examId);
  if (exam?.status !== "open" || !await weeklyExamReady(exam)) return;
  const sampledAt = new Date(Math.floor(+now / 1000) * 1000);
  const attempts = await PrivateMockExamAttempt.find(validAttempts(exam, sampledAt))
    .select("score exchangeMmrGrade").lean();
  const sample = calculateSample(attempts);
  await ExchangeTick.updateOne({ marketId: market._id, sampledAt }, {
    $setOnInsert: { ...sample, publishAt: new Date(+sampledAt + SAMPLE_DELAY_MS), expiresAt: new Date(+sampledAt + WEEK_MS * 2) },
  }, { upsert: true });
}

module.exports = {
  ROUNDS, error, integer, seoulInput, seoulDate, scheduleInput, readWeeklyExam, weeklyExamReady, validAttempts,
  readSetting, publicState, syncWeeklyMarkets, saveSchedule, saveMinimum, setPaused, calculateSample, saveSample,
};
