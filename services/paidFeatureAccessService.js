const mongoose = require("mongoose");
const {
  getAccountPlanAccess,
} = require("./accountPlanService");
const {
  getActiveAcademyPlan,
} = require("./academyPlanService");

async function getPaidPackageAccess(
  userId,
  { now = new Date(), session = null } = {}
) {
  return getAccountPlanAccess(userId, { now, session });
}

async function assertPaidPackageAccess(userId) {
  const access = await getPaidPackageAccess(userId);
  if (!access.active) {
    const error = new Error("이 기능은 Pro 플랜에서 이용할 수 있습니다.");
    error.status = 403;
    error.code = "PRO_PLAN_REQUIRED";
    throw error;
  }
  return access;
}

async function getWeeklyMockExamAccess(
  userId,
  { now = new Date(), session = null } = {}
) {
  if (!mongoose.isValidObjectId(userId)) {
    return {
      active: false,
      packageType: null,
      plan: null,
      academyPlan: { active: false },
      placementRequired: false,
      arenaAllowed: false,
    };
  }
  const [plan, academyPlan] = await Promise.all([
    getAccountPlanAccess(userId, { now, session }),
    getActiveAcademyPlan(userId, { now, session }),
  ]);
  if (plan.active) {
    return {
      active: true,
      packageType: plan.code,
      plan,
      academyPlan,
      placementRequired: true,
      arenaAllowed: true,
      unlimited: plan.unlimited === true,
      noExpiry: plan.noExpiry === true,
    };
  }
  if (academyPlan.active && academyPlan.includesMockExam) {
    return {
      active: true,
      packageType: "ACADEMY_PLAN",
      plan,
      academyPlan,
      placementRequired: true,
      arenaAllowed: false,
      unlimited: false,
      noExpiry: !academyPlan.endsAt,
    };
  }
  return {
    active: false,
    packageType: null,
    plan,
    academyPlan,
    placementRequired: false,
    arenaAllowed: false,
  };
}

module.exports = {
  assertPaidPackageAccess,
  getPaidPackageAccess,
  getWeeklyMockExamAccess,
};
