const mongoose = require("mongoose");
const {
  AccessCycle,
} = require("../models/goatArenaModel");
const {
  PaybackDailyLearning,
} = require("../models/paybackDailyLearningModel");

const KST_TIME_ZONE = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;
const ELIGIBLE_MATCH_TYPES = new Set([
  "NORMAL",
  "REVENGE",
]);
const REQUIRED_ANSWER_COUNT = 5;
const MAX_TRANSACTION_ATTEMPTS = 4;

function kstDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateKeyToDayNumber(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) {
    return null;
  }
  const [year, month, day] = String(dateKey)
    .split("-")
    .map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / DAY_MS);
}

function dayNumberToDateKey(dayNumber) {
  return new Date(dayNumber * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function nextKstDateKey(value = new Date()) {
  const current = kstDateKey(value);
  const dayNumber = dateKeyToDayNumber(current);
  return dayNumber === null
    ? ""
    : dayNumberToDateKey(dayNumber + 1);
}

function kstMidnight(dateKey) {
  const dayNumber = dateKeyToDayNumber(dateKey);
  if (dayNumber === null) return null;
  return new Date(`${dateKey}T00:00:00.000+09:00`);
}

function requiredAnswersSubmitted(attempt) {
  const answers = Array.isArray(attempt?.answers)
    ? attempt.answers
    : [];
  if (answers.length !== REQUIRED_ANSWER_COUNT) {
    return false;
  }
  const keys = new Set();
  for (const answer of answers) {
    const key = String(answer?.questionKey || "").trim();
    const value = String(answer?.value ?? "").trim();
    if (!key || !value || keys.has(key)) {
      return false;
    }
    keys.add(key);
  }
  return keys.size === REQUIRED_ANSWER_COUNT;
}

function evaluateAttackSubmission({
  match,
  attempt,
  evidence,
  userId,
}) {
  if (!match || !attempt || !evidence) {
    return {
      eligible: false,
      reason: "SUBMISSION_DATA_INCOMPLETE",
    };
  }
  if (
    match.division !== "SUB" ||
    !ELIGIBLE_MATCH_TYPES.has(
      String(match.matchType || "")
    )
  ) {
    return {
      eligible: false,
      reason: "OFFICIAL_SUB_ATTACK_REQUIRED",
    };
  }
  if (
    attempt.role !== "CHALLENGER" ||
    String(match.challenger?.userId || "") !==
      String(userId || attempt.userId || "") ||
    String(attempt.userId || "") !==
      String(userId || attempt.userId || "")
  ) {
    return {
      eligible: false,
      reason: "CHALLENGER_SUBMISSION_REQUIRED",
    };
  }
  if (
    attempt.status !== "SUBMITTED" ||
    !attempt.submittedAt ||
    !attempt.evidenceSubmittedAt
  ) {
    return {
      eligible: false,
      reason: "ATTACK_NOT_FULLY_SUBMITTED",
    };
  }
  if (!requiredAnswersSubmitted(attempt)) {
    return {
      eligible: false,
      reason: "ALL_REQUIRED_ANSWERS_REQUIRED",
    };
  }
  if (
    !Array.isArray(evidence.files) ||
    evidence.files.length < 1 ||
    String(evidence.attemptId || "") !==
      String(attempt._id || "") ||
    String(evidence.userId || "") !==
      String(userId || attempt.userId || "")
  ) {
    return {
      eligible: false,
      reason: "VALID_EVIDENCE_REQUIRED",
    };
  }
  return {
    eligible: true,
    reason: "ELIGIBLE",
  };
}

function currentConsecutiveDays(dateKeys = []) {
  const days = [...new Set(
    dateKeys
      .map(dateKeyToDayNumber)
      .filter(Number.isInteger)
  )].sort((left, right) => left - right);
  if (!days.length) {
    return {
      streakDays: 0,
      lastDateKeyKst: null,
    };
  }
  let streakDays = 1;
  for (let index = 1; index < days.length; index += 1) {
    streakDays = days[index] - days[index - 1] === 1
      ? streakDays + 1
      : 1;
  }
  return {
    streakDays,
    lastDateKeyKst:
      dayNumberToDateKey(days.at(-1)),
  };
}

function retryableTransactionError(error) {
  return (
    Number(error?.code) === 11000 ||
    error?.hasErrorLabel?.("TransientTransactionError") ||
    error?.hasErrorLabel?.("UnknownTransactionCommitResult")
  );
}

async function ensurePaybackDailyLearningIndexes() {
  await PaybackDailyLearning.createIndexes();
}

async function reconcileOpenPaybackDailyLearningStreaks({
  cycleIds = null,
  batchSize = 500,
} = {}) {
  const requestedIds = Array.isArray(cycleIds)
    ? cycleIds.filter((value) =>
        mongoose.isValidObjectId(value)
      )
    : null;
  const pageSize = Math.max(
    1,
    Math.min(1000, Number(batchSize) || 500)
  );
  const summary = {
    scanned: 0,
    updated: 0,
  };
  let lastId = null;

  while (true) {
    const cycleFilter = {
      division: "SUB",
      evaluatedAt: null,
      status: { $in: ["ACTIVE", "EXPIRED"] },
    };
    if (requestedIds) {
      cycleFilter._id = { $in: requestedIds };
    } else if (lastId) {
      cycleFilter._id = { $gt: lastId };
    }
    const cycles = await AccessCycle.find(
      cycleFilter
    )
      .select("_id")
      .sort({ _id: 1 })
      .limit(pageSize)
      .lean();
    if (!cycles.length) break;

    const ids = cycles.map((cycle) => cycle._id);
    const rows = await PaybackDailyLearning.find({
      accessCycleId: { $in: ids },
    })
      .select("accessCycleId dateKeyKst")
      .lean();
    const datesByCycle = new Map();
    for (const row of rows) {
      const key = String(row.accessCycleId);
      const dates = datesByCycle.get(key) || [];
      dates.push(row.dateKeyKst);
      datesByCycle.set(key, dates);
    }
    const operations = cycles.map((cycle) => {
      const streak = currentConsecutiveDays(
        datesByCycle.get(String(cycle._id)) || []
      );
      return {
        updateOne: {
          filter: {
            _id: cycle._id,
            evaluatedAt: null,
          },
          update: {
            $set: {
              streakDays: streak.streakDays,
              lastStreakDateKst:
                streak.lastDateKeyKst,
            },
          },
        },
      };
    });
    const result = await AccessCycle.bulkWrite(
      operations,
      { ordered: false }
    );
    summary.scanned += cycles.length;
    summary.updated += Number(
      result.modifiedCount || 0
    );
    if (requestedIds || cycles.length < pageSize) {
      break;
    }
    lastId = cycles.at(-1)._id;
  }
  return summary;
}

async function recordPaybackAttackLearningDay({
  match,
  attempt,
  evidence,
  userId,
  submittedAt,
}) {
  const eligibility = evaluateAttackSubmission({
    match,
    attempt,
    evidence,
    userId,
  });
  if (!eligibility.eligible) {
    return {
      credited: false,
      ...eligibility,
    };
  }

  const acceptedAt = new Date(
    submittedAt ||
      evidence.submittedAt ||
      attempt.evidenceSubmittedAt
  );
  const dateKeyKst = kstDateKey(acceptedAt);
  if (!dateKeyKst) {
    return {
      credited: false,
      eligible: false,
      reason: "SUBMISSION_TIME_INVALID",
    };
  }
  const accessCycleId =
    match.challenger?.accessCycleId;
  if (!mongoose.isValidObjectId(accessCycleId)) {
    return {
      credited: false,
      eligible: false,
      reason: "ACCESS_CYCLE_REQUIRED",
    };
  }

  let lastError = null;
  for (
    let transactionAttempt = 1;
    transactionAttempt <= MAX_TRANSACTION_ATTEMPTS;
    transactionAttempt += 1
  ) {
    const session = await mongoose.startSession();
    try {
      let outcome = null;
      await session.withTransaction(async () => {
        const cycle = await AccessCycle.findById(
          accessCycleId
        )
          .session(session)
          .lean();
        if (
          !cycle ||
          cycle.division !== "SUB" ||
          String(cycle.userId) !==
            String(userId || attempt.userId) ||
          ["CANCELLED", "REFUNDED"].includes(
            cycle.status
          )
        ) {
          outcome = {
            credited: false,
            eligible: false,
            reason: "PAYBACK_ACCESS_CYCLE_INELIGIBLE",
          };
          return;
        }
        const firstDateKey = String(
          cycle.firstConsumptionDateKst || ""
        );
        if (
          !firstDateKey ||
          dateKeyKst < firstDateKey
        ) {
          outcome = {
            credited: false,
            eligible: false,
            reason: "BEFORE_DAILY_ATTACK_WINDOW",
          };
          return;
        }
        if (
          !cycle.evaluationAt ||
          acceptedAt >= new Date(cycle.evaluationAt)
        ) {
          outcome = {
            credited: false,
            eligible: false,
            reason: "AFTER_DAILY_ATTACK_WINDOW",
          };
          return;
        }

        let record = await PaybackDailyLearning.findOne({
          accessCycleId: cycle._id,
          dateKeyKst,
        }).session(session);
        const credited = !record;
        if (!record) {
          [record] = await PaybackDailyLearning.create(
            [
              {
                accessCycleId: cycle._id,
                userId:
                  userId || attempt.userId,
                dateKeyKst,
                eventType:
                  "GOAT_ARENA_ATTACK_SUBMITTED",
                matchId: match._id,
                attemptId: attempt._id,
                evidenceId: evidence._id,
                matchType: match.matchType,
                role: "CHALLENGER",
                submittedAt: acceptedAt,
              },
            ],
            { session, ordered: true }
          );
        }

        const learningDays =
          await PaybackDailyLearning.find({
            accessCycleId: cycle._id,
          })
            .select("dateKeyKst")
            .session(session)
            .lean();
        const streak = currentConsecutiveDays(
          learningDays.map(
            (entry) => entry.dateKeyKst
          )
        );
        await AccessCycle.updateOne(
          { _id: cycle._id },
          {
            $set: {
              streakDays:
                streak.streakDays,
              lastStreakDateKst:
                streak.lastDateKeyKst,
            },
          },
          { session }
        );
        outcome = {
          credited,
          eligible: true,
          reason: credited
            ? "DAILY_ATTACK_CREDITED"
            : "DAILY_ATTACK_ALREADY_CREDITED",
          dateKeyKst,
          streakDays: streak.streakDays,
          learningDayId: String(record._id),
        };
      }, {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      });
      return outcome;
    } catch (error) {
      lastError = error;
      if (
        !retryableTransactionError(error) ||
        transactionAttempt ===
          MAX_TRANSACTION_ATTEMPTS
      ) {
        throw error;
      }
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

module.exports = {
  currentConsecutiveDays,
  ensurePaybackDailyLearningIndexes,
  evaluateAttackSubmission,
  kstDateKey,
  kstMidnight,
  nextKstDateKey,
  reconcileOpenPaybackDailyLearningStreaks,
  recordPaybackAttackLearningDay,
  requiredAnswersSubmitted,
};
