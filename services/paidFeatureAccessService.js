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
  const active = plan.reason !== "USER_NOT_FOUND";
  return {
    active,
    packageType: active ? (plan.active ? plan.code : "FREE") : null,
    plan,
    academyPlan,
    placementRequired: false,
    arenaAllowed: active,
    unlimited: active,
    noExpiry: active,
  };
}

module.exports = {
  getPaidPackageAccess,
  getWeeklyMockExamAccess,
};
