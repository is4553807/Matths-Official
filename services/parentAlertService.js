const {
  ParentAlertDelivery,
  ParentChildLink,
} = require("../models/parentModel");
const { getDashboardData } = require("./dashboardService");
const { buildBrandedHtml, sendEmail } = require("./emailService");
const { withSchedulerLease } = require("./schedulerLeaseService");
const {
  getDateGapInDays,
  getKoreanDateKey,
} = require("./userLifecycleService");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS_PER_DAY = 3;
const TERMINAL_STATUSES = new Set(["SENT"]);

let schedulerTimer = null;
let schedulerRunning = false;

function getKoreanHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour);
}

function childDisplayName(child) {
  return String(child?.realName || child?.name || "자녀").trim();
}

function dashboardUrl() {
  const baseUrl = String(
    process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || ""
  ).replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/parent` : "";
}

async function hasRecentTerminalDelivery({ linkId, alertType, now, cooldownDays }) {
  return ParentAlertDelivery.exists({
    parentChildLinkId: linkId,
    alertType,
    status: { $in: [...TERMINAL_STATUSES] },
    createdAt: { $gte: new Date(now.getTime() - cooldownDays * DAY_MS) },
  });
}

async function claimDelivery({ link, alertType, dateKey, reasonSnapshot, now }) {
  const key = {
    parentChildLinkId: link._id,
    alertType,
    dateKey,
  };
  let delivery = await ParentAlertDelivery.findOne(key);
  if (delivery && TERMINAL_STATUSES.has(delivery.status)) return null;
  if (delivery && Number(delivery.attemptCount) >= MAX_ATTEMPTS_PER_DAY) return null;

  if (!delivery) {
    try {
      return await ParentAlertDelivery.create({
        ...key,
        parentAccountId: link.parentAccountId._id,
        childUserId: link.childUserId._id,
        status: "PENDING",
        reasonSnapshot,
        attemptCount: 1,
        lastAttemptAt: now,
      });
    } catch (error) {
      if (Number(error?.code) !== 11000) throw error;
      delivery = await ParentAlertDelivery.findOne(key);
    }
  }

  if (!delivery || TERMINAL_STATUSES.has(delivery.status)) return null;
  return ParentAlertDelivery.findOneAndUpdate(
    {
      _id: delivery._id,
      status: { $in: ["PENDING", "FAILED"] },
      attemptCount: { $lt: MAX_ATTEMPTS_PER_DAY },
    },
    {
      $set: {
        status: "PENDING",
        reasonSnapshot,
        lastAttemptAt: now,
        failureMessage: "",
      },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: "after" }
  );
}

function buildAlertCopy({ alertType, child, snapshot }) {
  const name = childDisplayName(child);
  if (alertType === "LOW_LEARNING") {
    const details = (snapshot.days || [])
      .map((day) => `${day.dateKey}: ${day.minutes}분`)
      .join("\n");
    return {
      subject: `[Matths] ${name} 학생의 학습 흐름을 확인해주세요`,
      heading: `${name} 학생의 학습 시간이 낮아졌습니다.`,
      body: [
        `최근 ${snapshot.consecutiveDays}일 동안 하루 학습 시간이 설정한 ${snapshot.minimumMinutesPerDay}분보다 적었습니다.`,
        details,
        "학습 계획이나 일정에 변화가 있었는지 자녀와 함께 확인해주세요.",
      ].filter(Boolean).join("\n\n"),
    };
  }
  return {
    subject: `[Matths] ${name} 학생의 장기 미접속 알림`,
    heading: `${name} 학생의 최근 접속을 확인해주세요.`,
    body: [
      `${snapshot.inactiveDays}일 동안 학생 계정의 로그인 기록이 없습니다.`,
      snapshot.lastLoginAt
        ? `마지막 로그인: ${snapshot.lastLoginAt}`
        : "아직 로그인 기록이 없습니다.",
      "기기 변경이나 학습 일정에 변화가 있었는지 확인해주세요.",
    ].join("\n\n"),
  };
}

async function deliverAlert({ link, alertType, reasonSnapshot, now, sendEmailFn }) {
  const dateKey = getKoreanDateKey(now);
  const cooldownDays = alertType === "LOW_LEARNING" ? 3 : 7;
  if (await hasRecentTerminalDelivery({
    linkId: link._id,
    alertType,
    now,
    cooldownDays,
  })) return { skipped: true, reason: "COOLDOWN" };

  const delivery = await claimDelivery({
    link,
    alertType,
    dateKey,
    reasonSnapshot,
    now,
  });
  if (!delivery) return { skipped: true, reason: "ALREADY_PROCESSED" };

  const copy = buildAlertCopy({
    alertType,
    child: link.childUserId,
    snapshot: reasonSnapshot,
  });
  try {
    const result = await sendEmailFn({
      to: link.parentAccountId.email,
      subject: copy.subject,
      text: copy.body,
      html: buildBrandedHtml({
        kicker: "MATTHS PARENT ALERT",
        heading: copy.heading,
        body: copy.body,
        actionLabel: "자녀 학습 현황 보기",
        actionUrl: dashboardUrl(),
        footer: "학부모 페이지의 학습 알림 메뉴에서 자녀별 기준을 변경하거나 알림을 끌 수 있습니다.",
      }),
    });
    const status = result.delivered === true ? "SENT" : "FAILED";
    await ParentAlertDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status,
          providerMessageId: String(result.providerMessageId || ""),
          sentAt: status === "SENT" ? now : null,
          failureMessage: status === "FAILED" ? "이메일 공급자가 발송을 승인하지 않았습니다." : "",
        },
      }
    );
    return { delivered: status === "SENT" };
  } catch (error) {
    await ParentAlertDelivery.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: "FAILED",
          failureMessage: String(error?.message || "알림 발송 실패").slice(0, 500),
        },
      }
    );
    return { delivered: false, error: error?.message || "알림 발송 실패" };
  }
}

async function evaluateLink(link, now, sendEmailFn) {
  const settings = link.notificationSettings || {};
  const results = [];

  if (settings.lowLearning?.enabled) {
    const requiredDays = Math.max(2, Math.min(7, Number(settings.lowLearning.consecutiveDays) || 3));
    const minimumMinutes = Math.max(10, Number(settings.lowLearning.minimumMinutesPerDay) || 20);
    const monitoringStartedAt = settings.updatedAt ? new Date(settings.updatedAt) : now;
    const hasEnoughMonitoringHistory =
      now.getTime() - monitoringStartedAt.getTime() >= (requiredDays - 1) * DAY_MS;
    if (hasEnoughMonitoringHistory) {
      const dashboard = await getDashboardData(link.childUserId._id);
      const days = (dashboard.weeklyActivity?.days || []).slice(-requiredDays);
      if (
        days.length === requiredDays &&
        days.every((day) => Number(day.minutes) < minimumMinutes)
      ) {
        results.push(await deliverAlert({
          link,
          alertType: "LOW_LEARNING",
          reasonSnapshot: {
            minimumMinutesPerDay: minimumMinutes,
            consecutiveDays: requiredDays,
            days: days.map(({ dateKey, minutes }) => ({ dateKey, minutes })),
          },
          now,
          sendEmailFn,
        }));
      }
    }
  }

  if (settings.inactivity?.enabled) {
    const threshold = Math.max(3, Number(settings.inactivity.days) || 7);
    const reference = link.childUserId.lastLoginAt || link.childUserId.createdAt;
    const inactiveDays = getDateGapInDays(reference, now);
    if (inactiveDays !== null && inactiveDays >= threshold) {
      results.push(await deliverAlert({
        link,
        alertType: "INACTIVITY",
        reasonSnapshot: {
          thresholdDays: threshold,
          inactiveDays,
          lastLoginAt: link.childUserId.lastLoginAt
            ? new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(link.childUserId.lastLoginAt))
            : "",
        },
        now,
        sendEmailFn,
      }));
    }
  }
  return results;
}

async function evaluateParentAlerts({
  now = new Date(),
  force = false,
  sendEmailFn = sendEmail,
} = {}) {
  if (!force && getKoreanHour(now) < 21) {
    return { skipped: true, reason: "BEFORE_DAILY_EVALUATION_TIME" };
  }
  const links = await ParentChildLink.find({
    status: "ACTIVE",
    "notificationSettings.emailEnabled": true,
    $or: [
      { "notificationSettings.lowLearning.enabled": true },
      { "notificationSettings.inactivity.enabled": true },
    ],
  })
    .populate("parentAccountId", "email username isActive")
    .populate(
      "childUserId",
      "name realName lastLoginAt createdAt isActive accountStatus"
    );

  let processed = 0;
  for (const link of links) {
    if (
      !link.parentAccountId?.isActive ||
      link.childUserId?.isActive === false ||
      link.childUserId?.accountStatus === "withdrawn"
    ) continue;
    const results = await evaluateLink(link, now, sendEmailFn);
    processed += results.length;
  }
  return { selected: links.length, processed };
}

async function runParentAlertSchedule() {
  if (schedulerRunning) return { skipped: true, reason: "ALREADY_RUNNING" };
  schedulerRunning = true;
  try {
    return await evaluateParentAlerts();
  } finally {
    schedulerRunning = false;
  }
}

function startParentAlertScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (schedulerTimer) return schedulerTimer;
  const run = () => withSchedulerLease(
    { name: "PARENT_LEARNING_ALERTS", leaseMs: 10 * 60 * 1000 },
    runParentAlertSchedule
  );
  run().catch((error) => console.error("학부모 학습 알림 초기 점검 실패:", error));
  schedulerTimer = setInterval(() => {
    run().catch((error) => console.error("학부모 학습 알림 점검 실패:", error));
  }, Math.max(60 * 1000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
  schedulerTimer.unref?.();
  return schedulerTimer;
}

function stopParentAlertScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

module.exports = {
  evaluateParentAlerts,
  runParentAlertSchedule,
  startParentAlertScheduler,
  stopParentAlertScheduler,
};
