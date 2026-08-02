const { randomUUID } = require("node:crypto");
const {
  AccessCycle,
  AccessCycleExpiryReminder,
} = require("../models/goatArenaModel");
const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  sendAdminUserEmail,
} = require("./emailService");

const HOUR_MS = 60 * 60 * 1000;
const REMINDER_THRESHOLD_HOURS = Object.freeze([72, 24, 6]);
const DEFAULT_SCHEDULER_INTERVAL_MS = 60 * 1000;
const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const EMAIL_RETRY_BASE_MS = 15 * 60 * 1000;
const MAX_EMAIL_ATTEMPTS = 5;
const TERMINAL_EMAIL_STATUSES = new Set([
  "SENT",
  "PREVIEW",
  "SKIPPED",
]);

let reminderScheduleTimer = null;
let reminderScheduleRunning = false;

function asValidDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDueThresholdHours({ expiresAt, now = new Date() }) {
  const expiry = asValidDate(expiresAt);
  const current = asValidDate(now);
  if (!expiry || !current) return [];
  const remainingMs = expiry.getTime() - current.getTime();
  if (remainingMs <= 0) return [];
  return REMINDER_THRESHOLD_HOURS.filter(
    (thresholdHours) => remainingMs <= thresholdHours * HOUR_MS
  );
}

function mostUrgentThreshold(thresholds = []) {
  const values = thresholds.map(Number).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function formatKst(value) {
  const date = asValidDate(value);
  if (!date) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function buildReminderCopy({ cycle, thresholdHours }) {
  const available = Math.max(Number(cycle?.availableLearningDays) || 0, 0);
  const reserved = Math.max(Number(cycle?.reservedLearningDays) || 0, 0);
  const deposited = Math.max(Number(cycle?.lockedLearningDays) || 0, 0);
  const divisionLabel =
    cycle?.division === "MAIN" ? "Main Division" : "Sub Division";
  const expiryLabel = formatKst(cycle?.expiresAt);
  const title = `학습권 이용 종료 예정까지 ${thresholdHours}시간`;
  const message = [
    `${divisionLabel} 학습권 이용 종료 예정 시각이 ${thresholdHours}시간 이내로 다가왔습니다.`,
    `예정 종료: ${expiryLabel} KST`,
    `현재 학습 가능 ${available}일 · 초대 예약 ${reserved}일 · 경기 예치 ${deposited}일입니다.`,
    "계속 이용하려면 가격과 이용 조건을 미리 확인해주세요.",
  ].join("\n");
  return { title, message, href: "/pricing" };
}

function reminderDedupeKey({ accessCycleId, thresholdHours }) {
  return `access-cycle-expiry:${accessCycleId}:${thresholdHours}h`;
}

async function ensureDueReminderRecords({ cycle, dueThresholds }) {
  const urgentThreshold = mostUrgentThreshold(dueThresholds);
  if (!urgentThreshold) return [];
  await Promise.all(
    dueThresholds.map((thresholdHours) => {
      const skipped = thresholdHours !== urgentThreshold;
      return AccessCycleExpiryReminder.updateOne(
        {
          accessCycleId: cycle._id,
          thresholdHours,
        },
        {
          $setOnInsert: {
            userId: cycle.userId,
            expiryAtSnapshot: cycle.expiresAt,
            status: skipped ? "SKIPPED" : "PENDING",
            skipReason: skipped ? "MORE_URGENT_REMINDER_DUE" : "",
            siteStatus: skipped ? "SKIPPED" : "PENDING",
            emailStatus: skipped ? "SKIPPED" : "PENDING",
          },
        },
        { upsert: true }
      );
    })
  );
  return AccessCycleExpiryReminder.find({
    accessCycleId: cycle._id,
    thresholdHours: { $in: dueThresholds },
  }).lean();
}

async function supersedeLessUrgentReminders({ reminders, urgentThreshold, now }) {
  const candidates = reminders.filter(
    (reminder) =>
      Number(reminder.thresholdHours) > Number(urgentThreshold) &&
      !["SENT", "SKIPPED", "CANCELLED"].includes(reminder.status)
  );
  for (const reminder of candidates) {
    const siteWasSent = reminder.siteStatus === "SENT";
    await AccessCycleExpiryReminder.updateOne(
      { _id: reminder._id },
      {
        $set: {
          status: siteWasSent ? "SENT" : "SKIPPED",
          skipReason: "MORE_URGENT_REMINDER_DUE",
          siteStatus: siteWasSent ? "SENT" : "SKIPPED",
          emailStatus: TERMINAL_EMAIL_STATUSES.has(reminder.emailStatus)
            ? reminder.emailStatus
            : "SKIPPED",
          leaseToken: "",
          leaseExpiresAt: null,
          deliveredAt: siteWasSent ? reminder.deliveredAt || now : null,
        },
      }
    );
  }
}

function emailRetryDue(reminder, now) {
  if (TERMINAL_EMAIL_STATUSES.has(reminder.emailStatus)) return false;
  if (Number(reminder.emailAttempts || 0) >= MAX_EMAIL_ATTEMPTS) return false;
  const retryAt = asValidDate(reminder.emailNextRetryAt);
  return !retryAt || retryAt <= now;
}

async function claimReminder({ reminder, now }) {
  const leaseToken = randomUUID();
  const claimed = await AccessCycleExpiryReminder.findOneAndUpdate(
    {
      _id: reminder._id,
      $or: [
        { status: { $in: ["PENDING", "PARTIAL"] } },
        { status: "SENDING", leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "SENDING",
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + DELIVERY_LEASE_MS),
      },
      $inc: { deliveryAttempts: 1 },
    },
    { returnDocument: "after" }
  ).lean();
  return claimed?.leaseToken === leaseToken ? claimed : null;
}

async function upsertSiteNotification({ reminder, cycle, copy, now }) {
  const dedupeKey = reminderDedupeKey({
    accessCycleId: cycle._id,
    thresholdHours: reminder.thresholdHours,
  });
  return UserNotification.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        userId: cycle.userId,
        title: copy.title,
        message: copy.message,
        href: copy.href,
        kind: "account",
        dedupeKey,
        sourceType: "ACCESS_CYCLE_EXPIRY_REMINDER",
        sourceId: reminder._id,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  ).lean();
}

async function deliverClaimedReminder({
  reminder,
  cycle,
  now,
  sendEmailFn = sendAdminUserEmail,
}) {
  const currentCycle = await AccessCycle.findOne({
    _id: cycle._id,
    status: "ACTIVE",
  }).lean();
  if (!currentCycle) {
    await AccessCycleExpiryReminder.updateOne(
      { _id: reminder._id, leaseToken: reminder.leaseToken },
      {
        $set: {
          status: "CANCELLED",
          skipReason: "ACCESS_CYCLE_NOT_ACTIVE",
          leaseToken: "",
          leaseExpiresAt: null,
        },
      }
    );
    return { cancelled: true };
  }

  const dueThresholds = getDueThresholdHours({
    expiresAt: currentCycle.expiresAt,
    now,
  });
  if (!dueThresholds.includes(Number(reminder.thresholdHours))) {
    await AccessCycleExpiryReminder.updateOne(
      { _id: reminder._id, leaseToken: reminder.leaseToken },
      {
        $set: {
          status: "PENDING",
          expiryAtSnapshot: currentCycle.expiresAt,
          leaseToken: "",
          leaseExpiresAt: null,
        },
      }
    );
    return { postponed: true };
  }

  const user = await User.findById(currentCycle.userId)
    .select("name email")
    .lean();
  if (!user) {
    await AccessCycleExpiryReminder.updateOne(
      { _id: reminder._id, leaseToken: reminder.leaseToken },
      {
        $set: {
          status: "CANCELLED",
          skipReason: "USER_NOT_FOUND",
          leaseToken: "",
          leaseExpiresAt: null,
        },
      }
    );
    return { cancelled: true };
  }

  const copy = buildReminderCopy({
    cycle: currentCycle,
    thresholdHours: reminder.thresholdHours,
  });
  let siteStatus = reminder.siteStatus;
  let siteNotificationId = reminder.siteNotificationId || null;
  let siteDeliveredAt = reminder.siteDeliveredAt || null;
  if (siteStatus !== "SENT") {
    const notification = await upsertSiteNotification({
      reminder,
      cycle: currentCycle,
      copy,
      now,
    });
    siteStatus = "SENT";
    siteNotificationId = notification._id;
    siteDeliveredAt = now;
  }

  let emailStatus = reminder.emailStatus;
  let emailAttempts = Number(reminder.emailAttempts || 0);
  let emailDeliveredAt = reminder.emailDeliveredAt || null;
  let emailProviderMessageId = reminder.emailProviderMessageId || "";
  let emailLastError = "";
  let emailNextRetryAt = null;

  if (!user.email) {
    emailStatus = "SKIPPED";
    emailLastError = "EMAIL_ADDRESS_NOT_FOUND";
  } else if (emailRetryDue(reminder, now)) {
    emailAttempts += 1;
    try {
      const delivery = await sendEmailFn({
        to: user.email,
        subject: copy.title,
        message: copy.message,
        idempotencyKey: reminderDedupeKey({
          accessCycleId: currentCycle._id,
          thresholdHours: reminder.thresholdHours,
        }),
      });
      emailStatus = delivery?.preview ? "PREVIEW" : "SENT";
      emailDeliveredAt = now;
      emailProviderMessageId = String(delivery?.providerMessageId || "");
    } catch (error) {
      emailStatus = "FAILED";
      emailLastError = String(error?.message || "이메일 발송 실패").slice(0, 1000);
      if (emailAttempts < MAX_EMAIL_ATTEMPTS) {
        const retryDelay =
          EMAIL_RETRY_BASE_MS * Math.pow(2, Math.max(0, emailAttempts - 1));
        emailNextRetryAt = new Date(now.getTime() + retryDelay);
      }
    }
  }

  const delivered =
    siteStatus === "SENT" && TERMINAL_EMAIL_STATUSES.has(emailStatus);
  await AccessCycleExpiryReminder.updateOne(
    { _id: reminder._id, leaseToken: reminder.leaseToken },
    {
      $set: {
        expiryAtSnapshot: currentCycle.expiresAt,
        status: delivered ? "SENT" : "PARTIAL",
        siteStatus,
        siteNotificationId,
        siteDeliveredAt,
        emailStatus,
        emailAttempts,
        emailLastAttemptAt: emailAttempts > Number(reminder.emailAttempts || 0) ? now : reminder.emailLastAttemptAt,
        emailNextRetryAt,
        emailDeliveredAt,
        emailProviderMessageId,
        emailLastError,
        leaseToken: "",
        leaseExpiresAt: null,
        deliveredAt: delivered ? now : null,
      },
    }
  );
  return {
    delivered,
    partial: !delivered,
    siteStatus,
    emailStatus,
  };
}

async function processCycleExpiryReminders({
  cycle,
  now,
  sendEmailFn,
}) {
  const dueThresholds = getDueThresholdHours({ expiresAt: cycle.expiresAt, now });
  if (!dueThresholds.length) return { skipped: true };
  const reminders = await ensureDueReminderRecords({ cycle, dueThresholds });
  const urgentThreshold = mostUrgentThreshold(dueThresholds);
  await supersedeLessUrgentReminders({ reminders, urgentThreshold, now });
  const urgent = reminders.find(
    (reminder) => Number(reminder.thresholdHours) === urgentThreshold
  );
  if (!urgent || ["SENT", "SKIPPED", "CANCELLED"].includes(urgent.status)) {
    return { replayed: true };
  }
  if (urgent.emailStatus === "FAILED" && !emailRetryDue(urgent, now)) {
    return { retryWaiting: true };
  }
  const claimed = await claimReminder({ reminder: urgent, now });
  if (!claimed) return { replayed: true };
  return deliverClaimedReminder({
    reminder: claimed,
    cycle,
    now,
    sendEmailFn,
  });
}

async function processDueAccessCycleExpiryReminders({
  now = new Date(),
  limit = 200,
  sendEmailFn = sendAdminUserEmail,
} = {}) {
  const processedAt = asValidDate(now) || new Date();
  const maxExpiryAt = new Date(
    processedAt.getTime() + REMINDER_THRESHOLD_HOURS[0] * HOUR_MS
  );
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 1000);
  /*
   * 이미 끝난 알림이 앞쪽 200개를 계속 차지해 뒤 사용자가 영원히
   * 처리되지 않는 기아 상태를 막기 위해, 현재 가장 긴급한 구간이
   * 실제로 미처리이거나 재시도 가능한 이용 주기만 DB에서 고릅니다.
   */
  const cycles = await AccessCycle.aggregate([
    {
      $match: {
        status: "ACTIVE",
        expiresAt: { $gt: processedAt, $lte: maxExpiryAt },
      },
    },
    {
      $set: {
        _dueThresholdHours: {
          $switch: {
            branches: [
              {
                case: {
                  $lte: [
                    "$expiresAt",
                    new Date(processedAt.getTime() + 6 * HOUR_MS),
                  ],
                },
                then: 6,
              },
              {
                case: {
                  $lte: [
                    "$expiresAt",
                    new Date(processedAt.getTime() + 24 * HOUR_MS),
                  ],
                },
                then: 24,
              },
            ],
            default: 72,
          },
        },
      },
    },
    {
      $lookup: {
        from: AccessCycleExpiryReminder.collection.name,
        let: { cycleId: "$_id", thresholdHours: "$_dueThresholdHours" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$accessCycleId", "$$cycleId"] },
                  { $eq: ["$thresholdHours", "$$thresholdHours"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "_urgentReminder",
      },
    },
    {
      $unwind: {
        path: "$_urgentReminder",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $match: {
        $or: [
          { "_urgentReminder._id": { $exists: false } },
          { "_urgentReminder.status": "PENDING" },
          {
            "_urgentReminder.status": "SENDING",
            "_urgentReminder.leaseExpiresAt": { $lte: processedAt },
          },
          {
            "_urgentReminder.status": "PARTIAL",
            "_urgentReminder.siteStatus": { $ne: "SENT" },
          },
          {
            "_urgentReminder.status": "PARTIAL",
            "_urgentReminder.emailStatus": "PENDING",
          },
          {
            $and: [
              { "_urgentReminder.status": "PARTIAL" },
              { "_urgentReminder.emailStatus": "FAILED" },
              { "_urgentReminder.emailAttempts": { $lt: MAX_EMAIL_ATTEMPTS } },
              {
                $or: [
                  { "_urgentReminder.emailNextRetryAt": null },
                  { "_urgentReminder.emailNextRetryAt": { $lte: processedAt } },
                ],
              },
            ],
          },
        ],
      },
    },
    { $sort: { expiresAt: 1, _id: 1 } },
    { $limit: safeLimit },
    { $unset: ["_dueThresholdHours", "_urgentReminder"] },
  ]);
  const summary = {
    scanned: cycles.length,
    delivered: 0,
    partial: 0,
    replayed: 0,
    retryWaiting: 0,
    failed: 0,
  };
  for (const cycle of cycles) {
    try {
      const result = await processCycleExpiryReminders({
        cycle,
        now: processedAt,
        sendEmailFn,
      });
      if (result.delivered) summary.delivered += 1;
      else if (result.partial) summary.partial += 1;
      else if (result.retryWaiting) summary.retryWaiting += 1;
      else summary.replayed += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`이용 주기 ${cycle._id} 만료 예정 알림 실패:`, error);
    }
  }
  return summary;
}

async function runAccessCycleExpiryReminderSchedule() {
  if (reminderScheduleRunning) return null;
  reminderScheduleRunning = true;
  try {
    return await processDueAccessCycleExpiryReminders();
  } finally {
    reminderScheduleRunning = false;
  }
}

function startAccessCycleExpiryReminderScheduler({
  intervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
} = {}) {
  if (reminderScheduleTimer) return reminderScheduleTimer;
  runAccessCycleExpiryReminderSchedule().catch((error) => {
    console.error("학습권 이용 종료 예정 알림 초기 실행 실패:", error);
  });
  reminderScheduleTimer = setInterval(() => {
    runAccessCycleExpiryReminderSchedule().catch((error) => {
      console.error("학습권 이용 종료 예정 알림 스케줄 실패:", error);
    });
  }, Math.max(Number(intervalMs) || 0, 1000));
  reminderScheduleTimer.unref?.();
  return reminderScheduleTimer;
}

function stopAccessCycleExpiryReminderScheduler() {
  if (reminderScheduleTimer) {
    clearInterval(reminderScheduleTimer);
    reminderScheduleTimer = null;
  }
}

module.exports = {
  DEFAULT_SCHEDULER_INTERVAL_MS,
  MAX_EMAIL_ATTEMPTS,
  REMINDER_THRESHOLD_HOURS,
  buildReminderCopy,
  getDueThresholdHours,
  mostUrgentThreshold,
  processDueAccessCycleExpiryReminders,
  reminderDedupeKey,
  runAccessCycleExpiryReminderSchedule,
  startAccessCycleExpiryReminderScheduler,
  stopAccessCycleExpiryReminderScheduler,
};
