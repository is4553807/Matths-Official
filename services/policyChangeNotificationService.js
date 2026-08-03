const { randomUUID } = require("node:crypto");
const {
  PolicyChangeDelivery,
} = require("../models/goatArenaModel");
const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  sendAdminUserEmail,
} = require("./emailService");
const {
  withSchedulerLease,
} = require("./schedulerLeaseService");
const {
  registerArenaOutboxHandler,
} = require("./arenaOutboxService");

const DELIVERY_BATCH_SIZE = 100;
const DELIVERY_CONCURRENCY = 5;
const SITE_NOTIFICATION_CONCURRENCY = 25;
const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const EMAIL_RETRY_BASE_MS = 15 * 60 * 1000;
const MAX_EMAIL_ATTEMPTS = 5;
const SCHEDULER_INTERVAL_MS = 15 * 1000;
const TERMINAL_EMAIL_STATUSES = new Set(["SENT", "PREVIEW", "SKIPPED"]);

let schedulerTimer = null;
let schedulerRunning = false;

const POLICY_LABELS = Object.freeze({
  SUB_DIVISION: "Sub Division",
  MAIN_DIVISION: "Main Division",
  LEARNING_PACKAGE: "29일 학습권 패키지",
  MOCK_EXAM_PACKAGE: "Matths 주간 공식 모의고사 이용권",
  MAIN_SHOP: "Main Division 상점",
});

const POLICY_HREFS = Object.freeze({
  SUB_DIVISION: "/goat-arena/rules/sub",
  MAIN_DIVISION: "/goat-arena/rules/main",
  LEARNING_PACKAGE: "/pricing",
  MOCK_EXAM_PACKAGE: "/pricing",
  MAIN_SHOP: "/goat-arena/main/shop",
});

function formatKst(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function cleanMessage(value, maxLength = 1000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function buildPolicyChangeCopy({ policyType, policy }) {
  const label = POLICY_LABELS[policyType];
  if (!label || !policy?._id || !policy?.effectiveFrom) {
    const error = new Error("공지할 정책 정보를 확인해주세요.");
    error.status = 400;
    throw error;
  }
  const effectiveLabel = formatKst(policy.effectiveFrom);
  const summary = cleanMessage(policy.changeSummary, 700) ||
    "운영 기준이 새 정책 버전으로 변경됩니다.";
  return {
    title: `${label} 정책 변경 안내`,
    message: cleanMessage([
      `${label}의 최신 정책 변경 사항을 안내드립니다.`,
      `적용 예정: ${effectiveLabel} KST`,
      summary,
      "적용 전까지는 현재 정책이 유지되며, 적용 시점 이후의 신규 경기와 이용 판정부터 변경된 기준을 사용합니다.",
    ].join("\n")),
    href: POLICY_HREFS[policyType] || "/main",
  };
}

function deliveryDedupeKey(delivery) {
  return `policy-change:${delivery.policyType}:${delivery.policyId}:${delivery.userId}`;
}

async function ensureSiteNotification(delivery, now = new Date()) {
  const notification = await UserNotification.findOneAndUpdate(
    { dedupeKey: deliveryDedupeKey(delivery) },
    {
      $setOnInsert: {
        userId: delivery.userId,
        title: delivery.title,
        message: delivery.message,
        href: delivery.href,
        kind: "announcement",
        dedupeKey: deliveryDedupeKey(delivery),
        sourceType: "POLICY_CHANGE",
        sourceId: delivery.policyId,
        readAt: null,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
  await PolicyChangeDelivery.updateOne(
    { _id: delivery._id },
    {
      $set: {
        siteStatus: "SENT",
        siteNotificationId: notification._id,
        siteDeliveredAt: delivery.siteDeliveredAt || now,
      },
    }
  );
  return notification;
}

async function queuePolicyChangeNotifications({
  policyType,
  policy,
  now = new Date(),
  recipientUserIds = null,
  scheduleEmailDelivery = true,
} = {}) {
  const copy = buildPolicyChangeCopy({ policyType, policy });
  const recipientFilter = {
    accountStatus: { $ne: "withdrawn" },
  };
  if (Array.isArray(recipientUserIds)) {
    recipientFilter._id = { $in: recipientUserIds };
  }
  const recipients = await User.find(recipientFilter)
    .select("_id")
    .lean();
  if (!recipients.length) return { queued: 0, siteDelivered: 0 };

  for (let offset = 0; offset < recipients.length; offset += 500) {
    const chunk = recipients.slice(offset, offset + 500);
    await PolicyChangeDelivery.bulkWrite(
      chunk.map((recipient) => ({
        updateOne: {
          filter: {
            policyType,
            policyId: policy._id,
            userId: recipient._id,
          },
          update: {
            $setOnInsert: {
              policyCode: String(policy.code || ""),
              effectiveFrom: policy.effectiveFrom,
              title: copy.title,
              message: copy.message,
              href: copy.href,
              siteStatus: "PENDING",
              emailStatus: "PENDING",
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    const deliveries = await PolicyChangeDelivery.find({
      policyType,
      policyId: policy._id,
      userId: { $in: chunk.map((recipient) => recipient._id) },
    }).lean();
    for (
      let deliveryOffset = 0;
      deliveryOffset < deliveries.length;
      deliveryOffset += SITE_NOTIFICATION_CONCURRENCY
    ) {
      await Promise.all(
        deliveries
          .slice(deliveryOffset, deliveryOffset + SITE_NOTIFICATION_CONCURRENCY)
          .map((delivery) =>
            delivery.siteStatus === "SENT"
              ? null
              : ensureSiteNotification(delivery, now)
          )
      );
    }
  }

  if (scheduleEmailDelivery) {
    setImmediate(() => {
      runPolicyChangeDeliverySchedule().catch((error) => {
        console.error("정책 변경 이메일 즉시 발송 실패:", error);
      });
    });
  }
  return { queued: recipients.length, siteDelivered: recipients.length };
}

async function claimDelivery(deliveryId, now) {
  const token = randomUUID();
  const claimed = await PolicyChangeDelivery.findOneAndUpdate(
    {
      _id: deliveryId,
      emailStatus: { $in: ["PENDING", "FAILED", "SENDING"] },
      $or: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        emailStatus: "SENDING",
        leaseToken: token,
        leaseExpiresAt: new Date(now.getTime() + DELIVERY_LEASE_MS),
      },
    },
    { returnDocument: "after" }
  ).lean();
  return claimed?.leaseToken === token ? claimed : null;
}

async function deliverEmail(delivery, now, sendEmailFn) {
  const user = await User.findById(delivery.userId).select("email isActive accountStatus").lean();
  if (!user || user.accountStatus === "withdrawn") {
    await PolicyChangeDelivery.updateOne(
      { _id: delivery._id, leaseToken: delivery.leaseToken },
      {
        $set: {
          emailStatus: "SKIPPED",
          emailLastError: "USER_NOT_ACTIVE",
          leaseToken: "",
          leaseExpiresAt: null,
          deliveredAt: now,
        },
      }
    );
    return;
  }
  if (delivery.siteStatus !== "SENT") {
    await ensureSiteNotification(delivery, now);
  }
  if (!user.email) {
    await PolicyChangeDelivery.updateOne(
      { _id: delivery._id, leaseToken: delivery.leaseToken },
      {
        $set: {
          emailStatus: "SKIPPED",
          emailLastError: "EMAIL_ADDRESS_NOT_FOUND",
          leaseToken: "",
          leaseExpiresAt: null,
          deliveredAt: now,
        },
      }
    );
    return;
  }

  const attempts = Number(delivery.emailAttempts || 0) + 1;
  try {
    const result = await sendEmailFn({
      to: user.email,
      subject: delivery.title,
      message: delivery.message,
      idempotencyKey: deliveryDedupeKey(delivery),
    });
    await PolicyChangeDelivery.updateOne(
      { _id: delivery._id, leaseToken: delivery.leaseToken },
      {
        $set: {
          emailStatus: result?.preview ? "PREVIEW" : "SENT",
          emailAttempts: attempts,
          emailLastAttemptAt: now,
          emailNextRetryAt: null,
          emailDeliveredAt: now,
          emailProviderMessageId: String(result?.providerMessageId || ""),
          emailLastError: "",
          leaseToken: "",
          leaseExpiresAt: null,
          deliveredAt: now,
        },
      }
    );
  } catch (error) {
    const terminal = attempts >= MAX_EMAIL_ATTEMPTS;
    const retryDelay = EMAIL_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
    await PolicyChangeDelivery.updateOne(
      { _id: delivery._id, leaseToken: delivery.leaseToken },
      {
        $set: {
          emailStatus: "FAILED",
          emailAttempts: attempts,
          emailLastAttemptAt: now,
          emailNextRetryAt: terminal ? null : new Date(now.getTime() + retryDelay),
          emailLastError: String(error?.message || "이메일 발송 실패").slice(0, 1000),
          leaseToken: "",
          leaseExpiresAt: null,
        },
      }
    );
  }
}

function registerPolicyChangeOutboxHandler() {
  registerArenaOutboxHandler("PolicyChangeScheduled", async (event) => {
    const policyType = String(event?.payload?.policyType || "");
    const policy = event?.payload?.policy;
    await queuePolicyChangeNotifications({
      policyType,
      policy,
      recipientUserIds: Array.isArray(event?.payload?.recipientUserIds)
        ? event.payload.recipientUserIds
        : null,
      scheduleEmailDelivery: event?.payload?.scheduleEmailDelivery !== false,
    });
  });
}

async function processDuePolicyChangeDeliveries({
  now = new Date(),
  limit = DELIVERY_BATCH_SIZE,
  sendEmailFn = sendAdminUserEmail,
  filter = {},
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 500);
  const candidates = await PolicyChangeDelivery.find({
    ...filter,
    emailStatus: { $in: ["PENDING", "FAILED", "SENDING"] },
    emailAttempts: { $lt: MAX_EMAIL_ATTEMPTS },
    $and: [
      {
        $or: [
          { emailNextRetryAt: null },
          { emailNextRetryAt: { $lte: now } },
        ],
      },
      {
        $or: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { $lte: now } },
        ],
      },
    ],
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(safeLimit)
    .select("_id")
    .lean();
  let processed = 0;
  for (let offset = 0; offset < candidates.length; offset += DELIVERY_CONCURRENCY) {
    const chunk = candidates.slice(offset, offset + DELIVERY_CONCURRENCY);
    await Promise.all(
      chunk.map(async (candidate) => {
        const claimed = await claimDelivery(candidate._id, now);
        if (!claimed || TERMINAL_EMAIL_STATUSES.has(claimed.emailStatus)) return;
        await deliverEmail(claimed, now, sendEmailFn);
        processed += 1;
      })
    );
  }
  return { selected: candidates.length, processed };
}

async function runPolicyChangeDeliverySchedule() {
  if (schedulerRunning) return { skipped: true };
  schedulerRunning = true;
  try {
    return await processDuePolicyChangeDeliveries();
  } finally {
    schedulerRunning = false;
  }
}

function startPolicyChangeNotificationScheduler({ intervalMs = SCHEDULER_INTERVAL_MS } = {}) {
  if (schedulerTimer) return schedulerTimer;
  const run = () => withSchedulerLease(
    { name: "POLICY_CHANGE_NOTIFICATION_DELIVERY", leaseMs: 2 * 60 * 1000 },
    runPolicyChangeDeliverySchedule
  );
  run().catch((error) => console.error("정책 변경 알림 초기 발송 실패:", error));
  schedulerTimer = setInterval(() => {
    run().catch((error) => console.error("정책 변경 알림 재시도 실패:", error));
  }, Math.max(1000, Number(intervalMs) || SCHEDULER_INTERVAL_MS));
  schedulerTimer.unref?.();
  return schedulerTimer;
}

function stopPolicyChangeNotificationScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

module.exports = {
  buildPolicyChangeCopy,
  processDuePolicyChangeDeliveries,
  queuePolicyChangeNotifications,
  registerPolicyChangeOutboxHandler,
  runPolicyChangeDeliverySchedule,
  startPolicyChangeNotificationScheduler,
  stopPolicyChangeNotificationScheduler,
};
