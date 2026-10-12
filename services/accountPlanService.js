const mongoose = require("mongoose");
const {
  AdminActionLog,
  User,
} = require("../models/matthsModel");
const {
  ArenaPackagePayment,
} = require("../models/goatArenaModel");

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_CODES = Object.freeze({
  FREE: "FREE",
  PRO: "PRO",
});
const PRO_PRODUCT_CODE = "PRO_MONTHLY";
const PRO_PRODUCT_NAME = "Matths Pro";
const RETIRED_APPLE_PRODUCT_IDS = Object.freeze([
  "kr.matths.app.pass.29d",
  "kr.matths.app.mock.30d",
]);

function getProAppleProductId(environment = process.env) {
  return String(environment.APPLE_PRO_PRODUCT_ID || "").trim();
}

function isProAppleProductConfigured(environment = process.env) {
  const productId = getProAppleProductId(environment);
  return Boolean(productId && !RETIRED_APPLE_PRODUCT_IDS.includes(productId));
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getAccountPlanConfig(environment = process.env) {
  return Object.freeze({
    proPriceAmount: positiveInteger(environment.MATTHS_PRO_PRICE_KRW, 5500),
    proBillingPeriodDays: positiveInteger(environment.MATTHS_PRO_BILLING_PERIOD_DAYS, 30),
    currency: "KRW",
  });
}

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function clean(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function freePlanDraft({
  now = new Date(),
  source = "DEFAULT",
  changedByUserId = null,
  changeReason = "",
} = {}) {
  const changedAt = new Date(now);
  return {
    code: PLAN_CODES.FREE,
    status: "ACTIVE",
    priceAmount: 0,
    currency: "KRW",
    billingPeriodDays: 0,
    startsAt: changedAt,
    endsAt: null,
    source,
    sourcePaymentId: null,
    changedAt,
    changedByUserId,
    changeReason: clean(changeReason),
  };
}

function proPlanDraft({
  now = new Date(),
  startsAt = now,
  endsAt = null,
  source = "ADMIN",
  sourcePaymentId = null,
  changedByUserId = null,
  changeReason = "",
  environment = process.env,
} = {}) {
  const config = getAccountPlanConfig(environment);
  const normalizedStartsAt = new Date(startsAt);
  const normalizedEndsAt = endsAt
    ? new Date(endsAt)
    : new Date(
        normalizedStartsAt.getTime() + config.proBillingPeriodDays * DAY_MS
      );
  return {
    code: PLAN_CODES.PRO,
    status: "ACTIVE",
    priceAmount: config.proPriceAmount,
    currency: config.currency,
    billingPeriodDays: config.proBillingPeriodDays,
    startsAt: normalizedStartsAt,
    endsAt: normalizedEndsAt,
    source,
    sourcePaymentId,
    changedAt: new Date(now),
    changedByUserId,
    changeReason: clean(changeReason),
  };
}

function accountPlanView(user, { now = new Date() } = {}) {
  if (String(user?.role || "").toLowerCase() === "admin") {
    return {
      code: "SUPER_ADMIN",
      packageType: "SUPER_ADMIN",
      name: "관리자 무제한",
      label: "관리자 무제한",
      active: true,
      pro: true,
      unlimited: true,
      noExpiry: true,
      priceAmount: 0,
      currency: "KRW",
      billingPeriodDays: 0,
      startsAt: null,
      endsAt: null,
      expiresAt: null,
      source: "ROLE",
      status: "ACTIVE",
      statusLabel: "무제한 · 만료 없음",
    };
  }

  const stored = user?.accountPlan || {};
  const startsAt = dateOrNull(stored.startsAt);
  const endsAt = dateOrNull(stored.endsAt);
  const referenceTime = new Date(now).getTime();
  const proActive =
    stored.code === PLAN_CODES.PRO &&
    stored.status === "ACTIVE" &&
    (!startsAt || startsAt.getTime() <= referenceTime) &&
    Boolean(endsAt && endsAt.getTime() > referenceTime);

  if (proActive) {
    const config = getAccountPlanConfig();
    return {
      code: PLAN_CODES.PRO,
      packageType: PLAN_CODES.PRO,
      name: "Pro 플랜",
      label: "Pro 플랜",
      active: true,
      pro: true,
      unlimited: false,
      noExpiry: false,
      priceAmount: Number(stored.priceAmount ?? config.proPriceAmount),
      currency: stored.currency || config.currency,
      billingPeriodDays: Number(
        stored.billingPeriodDays || config.proBillingPeriodDays
      ),
      startsAt,
      endsAt,
      expiresAt: endsAt,
      source: stored.source || "DEFAULT",
      status: "ACTIVE",
      statusLabel: "이용 중",
    };
  }

  return {
    code: PLAN_CODES.FREE,
    packageType: PLAN_CODES.FREE,
    name: "무료 플랜",
    label: "무료 플랜",
    active: false,
    pro: false,
    unlimited: false,
    noExpiry: true,
    priceAmount: 0,
    currency: "KRW",
    billingPeriodDays: 0,
    startsAt: startsAt || null,
    endsAt: null,
    expiresAt: null,
    source: stored.source || "DEFAULT",
    status: "ACTIVE",
    statusLabel: "무료 이용 중",
    previousProExpiredAt:
      stored.code === PLAN_CODES.PRO && endsAt ? endsAt : null,
  };
}

async function getAccountPlanAccess(userId, { now = new Date(), session = null } = {}) {
  if (!mongoose.isValidObjectId(userId)) {
    return {
      ...accountPlanView(null, { now }),
      reason: "INVALID_USER",
    };
  }
  const query = User.findById(userId).select("role accountPlan");
  if (session) query.session(session);
  const user = await query.lean();
  if (!user) {
    return {
      ...accountPlanView(null, { now }),
      reason: "USER_NOT_FOUND",
    };
  }
  const view = accountPlanView(user, { now });
  return {
    ...view,
    reason: view.active ? null : "PRO_REQUIRED",
  };
}

async function assertProPurchaseEligible({ userId, now = new Date(), session = null }) {
  const access = await getAccountPlanAccess(userId, { now, session });
  if (access.code === "SUPER_ADMIN") {
    throw statusError(
      409,
      "관리자 계정은 Pro 결제가 필요하지 않습니다.",
      "ADMIN_PLAN_PURCHASE_NOT_REQUIRED"
    );
  }
  if (access.code === PLAN_CODES.PRO && access.active) {
    throw statusError(
      409,
      "이미 Pro 플랜을 이용 중입니다.",
      "PRO_PLAN_ALREADY_ACTIVE"
    );
  }
  return true;
}

function normalizeApproval(input = {}) {
  const approvedAt = new Date(input.approvedAt);
  const approvedAmount = Number(input.approvedAmount);
  const userId = clean(input.userId, 40);
  const approval = {
    userId,
    provider: clean(input.provider, 40).toUpperCase(),
    providerMode: clean(input.providerMode, 10).toUpperCase(),
    providerPaymentKey: clean(input.providerPaymentKey, 160),
    orderReference: clean(input.orderReference, 160),
    idempotencyKey: clean(input.idempotencyKey, 160),
    currency: clean(input.currency || "KRW", 3).toUpperCase(),
    approvedAmount,
    approvedAt,
    productCode: PRO_PRODUCT_CODE,
    productName: clean(input.productName || PRO_PRODUCT_NAME, 140),
    appleOriginalTransactionId:
      clean(input.provider, 40).toUpperCase() === "APPLE"
        ? clean(input.appleOriginalTransactionId, 160) || undefined
        : undefined,
    appleAppAccountToken:
      clean(input.provider, 40).toUpperCase() === "APPLE"
        ? clean(input.appleAppAccountToken, 64) || undefined
        : undefined,
    appleExpiresAt:
      clean(input.provider, 40).toUpperCase() === "APPLE" && input.appleExpiresAt
        ? new Date(input.appleExpiresAt)
        : undefined,
  };
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(400, "결제 대상 사용자를 확인해주세요.", "INVALID_USER_ID");
  }
  if (
    !approval.provider ||
    !approval.providerPaymentKey ||
    !approval.orderReference ||
    !approval.idempotencyKey
  ) {
    throw statusError(
      400,
      "결제 승인 식별자가 누락되었습니다.",
      "PAYMENT_IDENTIFIER_REQUIRED"
    );
  }
  if (
    approval.provider === "APPLE" &&
    (
      !approval.appleOriginalTransactionId ||
      !approval.appleExpiresAt ||
      Number.isNaN(approval.appleExpiresAt.getTime()) ||
      approval.appleExpiresAt.getTime() <= approvedAt.getTime()
    )
  ) {
    throw statusError(
      400,
      "App Store 구독 식별자 또는 만료 시각을 확인해주세요.",
      "APPLE_SUBSCRIPTION_METADATA_REQUIRED"
    );
  }
  if (
    ["INICIS", "TOSS", "APPLE"].includes(approval.provider) &&
    !["TEST", "LIVE"].includes(approval.providerMode)
  ) {
    throw statusError(
      400,
      "결제 실행 모드를 확인해주세요.",
      "PAYMENT_PROVIDER_MODE_REQUIRED"
    );
  }
  const config = getAccountPlanConfig();
  if (
    !Number.isSafeInteger(approvedAmount) ||
    approvedAmount !== config.proPriceAmount ||
    approval.currency !== config.currency ||
    Number.isNaN(approvedAt.getTime())
  ) {
    throw statusError(
      400,
      "Pro 결제 금액, 통화 또는 승인 시각을 확인해주세요.",
      "INVALID_PRO_APPROVAL"
    );
  }
  approval.userId = new mongoose.Types.ObjectId(userId);
  return approval;
}

function paymentReplayFilter(approval) {
  return {
    $or: [
      { idempotencyKey: approval.idempotencyKey },
      { orderReference: approval.orderReference },
      {
        provider: approval.provider,
        providerPaymentKey: approval.providerPaymentKey,
      },
    ],
  };
}

function assertSameApproval(payment, approval) {
  if (
    String(payment.userId) !== String(approval.userId) ||
    payment.provider !== approval.provider ||
    String(payment.providerMode || "") !== String(approval.providerMode || "") ||
    payment.providerPaymentKey !== approval.providerPaymentKey ||
    payment.orderReference !== approval.orderReference ||
    payment.idempotencyKey !== approval.idempotencyKey ||
    payment.currency !== approval.currency ||
    Number(payment.approvedAmount) !== approval.approvedAmount ||
    payment.productCode !== PRO_PRODUCT_CODE ||
    String(payment.appleOriginalTransactionId || "") !==
      String(approval.appleOriginalTransactionId || "") ||
    String(payment.appleAppAccountToken || "") !==
      String(approval.appleAppAccountToken || "") ||
    String(payment.appleExpiresAt ? new Date(payment.appleExpiresAt).toISOString() : "") !==
      String(approval.appleExpiresAt ? new Date(approval.appleExpiresAt).toISOString() : "")
  ) {
    throw statusError(
      409,
      "이미 사용된 결제 식별자와 승인 정보가 일치하지 않습니다.",
      "PAYMENT_IDEMPOTENCY_CONFLICT"
    );
  }
}

async function findAppliedProPayment(approval, session = null) {
  const query = ArenaPackagePayment.findOne(paymentReplayFilter(approval));
  if (session) query.session(session);
  const payment = await query.lean();
  if (!payment) return null;
  assertSameApproval(payment, approval);
  if (
    payment.status !== "APPLIED" ||
    !payment.accountPlanStartsAt ||
    !payment.accountPlanEndsAt
  ) {
    throw statusError(
      409,
      "Pro 결제 승인 처리가 아직 완료되지 않았습니다.",
      "PAYMENT_NOT_APPLIED"
    );
  }
  return { payment, plan: await getAccountPlanAccess(approval.userId), replayed: true };
}

async function applyApprovedProPayment(input) {
  const approval = normalizeApproval(input);
  const replay = await findAppliedProPayment(approval);
  if (replay) return replay;

  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const transactionReplay = await findAppliedProPayment(approval, session);
      if (transactionReplay) {
        result = transactionReplay;
        return;
      }

      if (approval.provider !== "APPLE") {
        await assertProPurchaseEligible({
          userId: approval.userId,
          now: approval.approvedAt,
          session,
        });
      }
      const config = getAccountPlanConfig();
      const startsAt = new Date(approval.approvedAt);
      const endsAt = approval.provider === "APPLE"
        ? new Date(approval.appleExpiresAt)
        : new Date(startsAt.getTime() + config.proBillingPeriodDays * DAY_MS);
      const [payment] = await ArenaPackagePayment.create(
        [
          {
            ...approval,
            status: "APPROVED",
            accountPlanStartsAt: startsAt,
            accountPlanEndsAt: endsAt,
          },
        ],
        { session, ordered: true }
      );
      const updated = await User.updateOne(
        {
          _id: approval.userId,
          role: { $ne: "admin" },
          $or: [
            { "accountPlan.code": { $ne: PLAN_CODES.PRO } },
            { "accountPlan.status": { $ne: "ACTIVE" } },
            { "accountPlan.endsAt": { $lte: startsAt } },
            { accountPlan: { $exists: false } },
            ...(approval.provider === "APPLE"
              ? [
                  {
                    "accountPlan.source": "APPLE",
                    "accountPlan.endsAt": { $lt: endsAt },
                  },
                ]
              : []),
          ],
        },
        {
          $set: {
            accountPlan: proPlanDraft({
              now: startsAt,
              startsAt,
              endsAt,
              source: approval.provider === "APPLE" ? "APPLE" : "INICIS",
              sourcePaymentId: payment._id,
              changeReason: `${PRO_PRODUCT_NAME} 결제 승인`,
            }),
          },
        },
        { session }
      );
      if (updated.modifiedCount !== 1) {
        throw statusError(
          409,
          "플랜 상태가 변경되어 Pro를 적용하지 못했습니다.",
          "PRO_PLAN_CONCURRENT_UPDATE"
        );
      }
      payment.status = "APPLIED";
      payment.processedAt = new Date();
      await payment.save({ session });
      result = {
        payment: payment.toObject(),
        plan: accountPlanView(
          { role: "student", accountPlan: proPlanDraft({ startsAt, endsAt }) },
          { now: startsAt }
        ),
        replayed: false,
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function updateAccountPlanByAdmin({
  adminUserId,
  userId,
  planCode,
  reason,
  now = new Date(),
}) {
  const normalizedCode = clean(planCode, 20).toUpperCase();
  if (!Object.values(PLAN_CODES).includes(normalizedCode)) {
    throw statusError(400, "적용할 플랜을 선택해주세요.", "PLAN_CODE_INVALID");
  }
  if (!mongoose.isValidObjectId(adminUserId) || !mongoose.isValidObjectId(userId)) {
    throw statusError(400, "관리자 또는 사용자 정보를 확인해주세요.");
  }
  const cleanReason = clean(reason, 500);
  if (!cleanReason) {
    throw statusError(400, "플랜 변경 사유를 입력해주세요.");
  }
  const changedAt = new Date(now);
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId)
        .select("role accountPlan")
        .session(session)
        .lean();
      if (!user) throw statusError(404, "사용자를 찾을 수 없습니다.");
      if (user.role === "admin") {
        throw statusError(
          409,
          "관리자 역할과 무제한 권한은 플랜 변경 대상이 아닙니다.",
          "ADMIN_PLAN_IMMUTABLE"
        );
      }
      const nextPlan = normalizedCode === PLAN_CODES.PRO
        ? proPlanDraft({
            now: changedAt,
            source: "ADMIN",
            changedByUserId: adminUserId,
            changeReason: cleanReason,
          })
        : freePlanDraft({
            now: changedAt,
            source: "ADMIN",
            changedByUserId: adminUserId,
            changeReason: cleanReason,
          });
      await User.updateOne(
        { _id: userId, role: { $ne: "admin" } },
        { $set: { accountPlan: nextPlan } },
        { session }
      );
      await AdminActionLog.create(
        [
          {
            adminUserId,
            targetUserId: userId,
            action: "user.account-plan",
            detail: `${normalizedCode === PLAN_CODES.PRO ? "Pro 플랜" : "무료 플랜"} 적용 · ${cleanReason}`,
            metadata: {
              previousPlan: user.accountPlan || null,
              nextPlanCode: normalizedCode,
              priceAmount: nextPlan.priceAmount,
              endsAt: nextPlan.endsAt,
            },
          },
        ],
        { session, ordered: true }
      );
      result = accountPlanView(
        { role: user.role, accountPlan: nextPlan },
        { now: changedAt }
      );
    });
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = {
  PLAN_CODES,
  PRO_PRODUCT_CODE,
  PRO_PRODUCT_NAME,
  RETIRED_APPLE_PRODUCT_IDS,
  accountPlanView,
  applyApprovedProPayment,
  assertProPurchaseEligible,
  freePlanDraft,
  getAccountPlanAccess,
  getAccountPlanConfig,
  getProAppleProductId,
  isProAppleProductConfigured,
  proPlanDraft,
  updateAccountPlanByAdmin,
};
