const { randomUUID } = require("node:crypto");
const {
  PolicyChangeDelivery,
  MainDivisionPolicyVersion,
  MainShopPolicyVersion,
  MockExamPackagePolicyVersion,
  SubscriptionPolicyVersion,
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
const MANUAL_EMAIL_HOLD_UNTIL = new Date("2100-01-01T00:00:00.000Z");

let schedulerTimer = null;
let schedulerRunning = false;

const POLICY_LABELS = Object.freeze({
  SUB_DIVISION: "Unranked",
  MAIN_DIVISION: "Ranked",
  LEARNING_PACKAGE: "29일 학습권 패키지",
  MOCK_EXAM_PACKAGE: "Matths 주간 공식 모의고사 이용권",
  MAIN_SHOP: "Ranked 상점",
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readPath(source, path) {
  return String(path || "").split(".").reduce(
    (value, key) => (value === null || value === undefined ? undefined : value[key]),
    source
  );
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("ko-KR").format(amount)}원`
    : "미설정";
}

function formatDays(value) {
  const days = Number(value);
  return Number.isFinite(days) ? `${days}일` : "미설정";
}

function formatBoolean(value) {
  return value === true ? "사용" : value === false ? "미사용" : "미설정";
}

function formatTierLimits(value) {
  if (!Array.isArray(value)) return "미설정";
  return value
    .map((entry) => `${String(entry.tier || "").toUpperCase()}: 공격 ${Number(entry.attackLimit) || 0}회 · 방어 ${Number(entry.defenseLimit) || 0}회`)
    .join(" / ") || "미설정";
}

function formatStakeBands(value) {
  if (!Array.isArray(value)) return "미설정";
  return value
    .map((entry) => `${Number(entry.tierGap) || 0}티어 차이: 최소 ${Number(entry.stakeDays) || 0}일`)
    .join(" / ") || "미설정";
}

function formatPaybackBands(value) {
  if (!Array.isArray(value)) return "미설정";
  return value
    .map((entry) => {
      const start = Number(entry.minScoreDays) || 0;
      const end = entry.maxScoreDays === null || entry.maxScoreDays === undefined
        ? "이상"
        : `${Number(entry.maxScoreDays)}점`;
      return `${start}~${end}: ${Number(entry.ratePercent) || 0}%`;
    })
    .join(" / ") || "미설정";
}

function formatShopItem(entry) {
  if (!entry) return "미등록";
  const saleState = entry.enabled ? "판매 중" : "판매 중지";
  const price = Number.isFinite(Number(entry.priceDays))
    ? ` · ${Number(entry.priceDays)}일`
    : "";
  return `${saleState}${price}`;
}

function buildMainShopComparisonRows(policy, previousPolicy) {
  const currentItems = new Map(
    (Array.isArray(policy?.items) ? policy.items : []).map((item) => [
      String(item.itemCode || ""),
      item,
    ])
  );
  const previousItems = new Map(
    (Array.isArray(previousPolicy?.items) ? previousPolicy.items : []).map((item) => [
      String(item.itemCode || ""),
      item,
    ])
  );
  const itemCodes = new Set([...previousItems.keys(), ...currentItems.keys()]);
  const rows = [];

  for (const itemCode of itemCodes) {
    const beforeItem = previousItems.get(itemCode);
    const afterItem = currentItems.get(itemCode);
    const label = afterItem?.displayName || beforeItem?.displayName || itemCode || "상점 항목";
    const before = formatShopItem(beforeItem);
    const after = formatShopItem(afterItem);
    if (!previousPolicy || before !== after) rows.push({ label, before, after });
  }

  const scalarRows = [
    ["방어 일정 보호권 재사용 대기", "defenseConvenienceCooldownDays", formatDays],
    ["경기 분석권 재시도 횟수", "analysisMaximumRetries", (value) => `${Number(value) || 0}회`],
  ];
  for (const [label, path, formatter] of scalarRows) {
    const before = previousPolicy ? formatter(readPath(previousPolicy, path)) : "기존 정책 없음";
    const after = formatter(readPath(policy, path));
    if (!previousPolicy || before !== after) rows.push({ label, before, after });
  }
  return rows;
}

const POLICY_COMPARISON_FIELDS = Object.freeze({
  SUB_DIVISION: [
    ["가격", "priceAmount", formatMoney],
    ["학습 가능 일수", "initialLearningDays", formatDays],
    ["초기 페이백 점수", "initialPaybackScoreDays", (value) => `${Number(value) || 0}점`],
    ["일반전·복수전 예치", "matchStakeDays", (value) => value ? `일반전 ${Number(value.normal) || 0}점 · 복수전 ${Number(value.revenge) || 0}점` : "미설정"],
    ["티어별 일일 경기 한도", "dailyMatchLimitsByTier", formatTierLimits],
    ["전일 학습 조건", "payback.minimumStreakDays", formatDays],
    ["최소 페이백 점수", "payback.minimumScoreDays", (value) => `${Number(value) || 0}점`],
    ["페이백 구간", "payback.bands", formatPaybackBands],
  ],
  LEARNING_PACKAGE: [
    ["가격", "priceAmount", formatMoney],
    ["학습 가능 일수", "initialLearningDays", formatDays],
    ["초기 페이백 점수", "initialPaybackScoreDays", (value) => `${Number(value) || 0}점`],
    ["전일 학습 조건", "payback.minimumStreakDays", formatDays],
    ["최소 페이백 점수", "payback.minimumScoreDays", (value) => `${Number(value) || 0}점`],
    ["페이백 구간", "payback.bands", formatPaybackBands],
  ],
  MOCK_EXAM_PACKAGE: [
    ["월 이용료", "monthlyPriceAmount", formatMoney],
    ["이용 기간", "billingPeriodDays", formatDays],
    ["배치고사 보정 기준", "placementCalibrationMinimumWeeklyExams", (value) => `${Number(value) || 0}회`],
  ],
  MAIN_DIVISION: [
    ["Ranked 입장 추가 학습일수", "mainEntryBonusDays", formatDays],
    ["기본 이월 학습일수", "mainCarryoverBaseDays", formatDays],
    ["티어 차이별 최소 예치", "stakeDaysByTierGap", formatStakeBands],
    ["최대 목표 티어 차이", "maximumTargetTierGap", (value) => `${Number(value) || 0}티어`],
    ["재대결 제외 기간", "repeatOpponentExclusionDays", formatDays],
    ["복수전 예치 배수", "revengeStakeMultiplier", (value) => `${Number(value) || 0}배`],
    ["복수전 수수료", "revengeFeeDays", formatDays],
  ],
  MAIN_SHOP: [
    // 상점은 항목별 상태·가격이 중요한 만큼 별도의 불릿 행으로 만든다.
  ],
});

function buildComparisonRows({ policyType, policy, previousPolicy }) {
  if (policyType === "MAIN_SHOP") {
    return buildMainShopComparisonRows(policy, previousPolicy);
  }
  const fields = POLICY_COMPARISON_FIELDS[policyType] || [];
  return fields.reduce((rows, [label, path, formatter]) => {
    const afterRaw = readPath(policy, path);
    const beforeRaw = readPath(previousPolicy, path);
    const before = previousPolicy ? formatter(beforeRaw) : "기존 정책 없음";
    const after = formatter(afterRaw);
    if (!previousPolicy || before !== after) rows.push({ label, before, after });
    return rows;
  }, []);
}

function buildPolicyChangeEmailBody({ message, comparisonRows, policyType }) {
  const rows = Array.isArray(comparisonRows) ? comparisonRows : [];
  const shopBulletList = policyType === "MAIN_SHOP" && rows.length
    ? `<section style="margin:22px 0;padding:18px 20px;background:#f6f8ff;border:1px solid #dfe4f1;border-radius:14px"><strong style="display:block;margin-bottom:10px;color:#202744">이번 상점 업데이트</strong><ul style="margin:0;padding-left:20px">${rows.map((row) => `<li style="margin:0 0 9px;color:#303a55"><strong>${escapeHtml(row.label)}</strong><br /><span style="color:#697289">${escapeHtml(row.before)}</span> <span aria-hidden="true">→</span> <span style="color:#3157f6;font-weight:700">${escapeHtml(row.after)}</span></li>`).join("")}</ul></section>`
    : "";
  const table = !shopBulletList && rows.length
    ? `<table role="presentation" style="width:100%;margin:22px 0;border-collapse:collapse;border:1px solid #dfe4f1"><thead><tr><th style="padding:10px;text-align:left;background:#f4f6fd;border-bottom:1px solid #dfe4f1">항목</th><th style="padding:10px;text-align:left;background:#f4f6fd;border-bottom:1px solid #dfe4f1">변경 전</th><th style="padding:10px;text-align:left;background:#f4f6fd;border-bottom:1px solid #dfe4f1">변경 후</th></tr></thead><tbody>${rows.map((row) => `<tr><td style="padding:10px;border-bottom:1px solid #edf0f6;font-weight:700">${escapeHtml(row.label)}</td><td style="padding:10px;border-bottom:1px solid #edf0f6;color:#697289">${escapeHtml(row.before)}</td><td style="padding:10px;border-bottom:1px solid #edf0f6;color:#3157f6;font-weight:700">${escapeHtml(row.after)}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<div>${escapeHtml(message).replace(/\r?\n/g, "<br />")}</div>${shopBulletList}${table}`;
}

function policyModelFor(policyType) {
  return {
    SUB_DIVISION: SubscriptionPolicyVersion,
    LEARNING_PACKAGE: SubscriptionPolicyVersion,
    MAIN_DIVISION: MainDivisionPolicyVersion,
    MOCK_EXAM_PACKAGE: MockExamPackagePolicyVersion,
    MAIN_SHOP: MainShopPolicyVersion,
  }[policyType] || null;
}

async function resolvePolicyVersion(policyType, policy) {
  const model = policyModelFor(policyType);
  const source = typeof policy?.toObject === "function" ? policy.toObject() : policy;
  if (!model || !source?._id) return source;
  return (await model.findById(source._id).lean()) || source;
}

async function findPreviousPolicyVersion(policyType, policy) {
  const model = policyModelFor(policyType);
  if (!model || !policy?._id || !policy?.effectiveFrom) return null;
  return model.findOne({
    _id: { $ne: policy._id },
    status: "ACTIVE",
    effectiveFrom: { $lt: policy.effectiveFrom },
  }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
}

function buildPolicyChangeCopy({ policyType, policy, previousPolicy = null }) {
  const label = POLICY_LABELS[policyType];
  if (!label || !policy?._id || !policy?.effectiveFrom) {
    const error = new Error("공지할 정책 정보를 확인해주세요.");
    error.status = 400;
    throw error;
  }
  const effectiveLabel = formatKst(policy.effectiveFrom);
  const summary = cleanMessage(policy.changeSummary, 700) ||
    "운영 기준이 새 정책 버전으로 변경됩니다.";
  const comparisonRows = buildComparisonRows({ policyType, policy, previousPolicy });
  const appliesImmediately = policyType === "MAIN_SHOP";
  return {
    title: `${label} 정책 변경 안내`,
    message: cleanMessage([
      `${label}의 최신 정책 변경 사항을 안내드립니다.`,
      appliesImmediately
        ? `적용 시각: ${effectiveLabel} KST · 저장 직후 반영`
        : `적용 예정: ${effectiveLabel} KST`,
      summary,
      comparisonRows.length
        ? appliesImmediately
          ? "이번 상점 업데이트는 아래 핵심 변경점에서 확인하세요."
          : "변경 전·후는 아래 비교표에서 확인하세요."
        : "세부 내용은 관련 정책 페이지에서 확인하세요.",
      appliesImmediately
        ? "현재 페이지를 새로고침하면 변경된 상점 상태와 가격을 확인할 수 있습니다."
        : "적용 전까지는 현재 정책이 유지되며, 적용 시점 이후의 신규 경기와 이용 판정부터 변경된 기준을 사용합니다.",
    ].join("\n")),
    href: POLICY_HREFS[policyType] || "/main",
    comparisonRows,
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
        metadata: {
          policyType: delivery.policyType,
          policyChangeRows: delivery.comparisonRows || [],
        },
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
  const resolvedPolicy = await resolvePolicyVersion(policyType, policy);
  const previousPolicy = await findPreviousPolicyVersion(policyType, resolvedPolicy);
  const copy = buildPolicyChangeCopy({ policyType, policy: resolvedPolicy, previousPolicy });
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
            policyId: resolvedPolicy._id,
            userId: recipient._id,
          },
          update: {
            $setOnInsert: {
              policyCode: String(resolvedPolicy.code || ""),
              effectiveFrom: resolvedPolicy.effectiveFrom,
              title: copy.title,
              message: copy.message,
              href: copy.href,
              comparisonRows: copy.comparisonRows,
              siteStatus: "PENDING",
              emailStatus: "PENDING",
              emailNextRetryAt: scheduleEmailDelivery
                ? null
                : MANUAL_EMAIL_HOLD_UNTIL,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    const deliveries = await PolicyChangeDelivery.find({
      policyType,
      policyId: resolvedPolicy._id,
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
      bodyHtml: buildPolicyChangeEmailBody({
        message: delivery.message,
        comparisonRows: delivery.comparisonRows,
        policyType: delivery.policyType,
      }),
    });
    await PolicyChangeDelivery.updateOne(
      { _id: delivery._id, leaseToken: delivery.leaseToken },
      {
        $set: {
          emailStatus: result?.delivered ? "SENT" : "FAILED",
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
