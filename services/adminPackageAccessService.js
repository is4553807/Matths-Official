const {
  PLAN_CODES,
  accountPlanView,
  getAccountPlanAccess,
  updateAccountPlanByAdmin,
} = require("./accountPlanService");

/*
 * 기존 컨트롤러와 네이티브 API의 함수명은 호환을 위해 유지합니다.
 * 실제 저장과 판정은 User.accountPlan(FREE/PRO) 하나만 사용하며, 과거
 * 결제 원장이나 다른 상품 권한은 수정하지 않습니다.
 */
const ADMIN_PACKAGE_TYPES = PLAN_CODES;

function packageLabel(planCode) {
  return String(planCode || "").toUpperCase() === PLAN_CODES.PRO
    ? "Pro 플랜"
    : "무료 플랜";
}

async function getAdminPackageAccessSummary(userId, now = new Date()) {
  const plan = await getAccountPlanAccess(userId, { now });
  return {
    planCode: plan.code,
    packageType: plan.code,
    label: plan.label,
    status: plan.status,
    active: plan.active,
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    billingPeriodDays: plan.billingPeriodDays,
    startsAt: plan.startsAt,
    endsAt: plan.endsAt,
    source: plan.source,
    unlimited: plan.unlimited,
    previousProExpiredAt: plan.previousProExpiredAt || null,
  };
}

async function updateAdminPackageAccess({
  adminUserId,
  userId,
  packageType,
  planCode,
  reason,
  now = new Date(),
}) {
  return updateAccountPlanByAdmin({
    adminUserId,
    userId,
    planCode: planCode || packageType,
    reason,
    now,
  });
}

module.exports = {
  ADMIN_PACKAGE_TYPES,
  accountPlanView,
  getAdminPackageAccessSummary,
  packageLabel,
  updateAdminPackageAccess,
};
