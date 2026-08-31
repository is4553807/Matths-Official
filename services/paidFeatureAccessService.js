const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaAccessState,
} = require("../models/goatArenaModel");
const {
  getMockExamPackageAccess,
} = require("./mockExamPackageService");
const {
  isSuperAdminUserId,
  superAdminPackageAccess,
} = require("./superAdminAccessService");
const {
  getActiveAcademyPlan,
} = require("./academyPlanService");

async function getPaidPackageAccess(userId, { session = null } = {}) {
  if (!mongoose.isValidObjectId(userId)) {
    return { active: false, reason: "INVALID_USER" };
  }
  if (await isSuperAdminUserId(userId)) {
    return superAdminPackageAccess();
  }
  const stateQuery = ArenaAccessState.findOne({ userId }).select(
    "state accessCycleId currentCompetitiveDivision"
  );
  if (session) stateQuery.session(session);
  const state = await stateQuery.lean();
  if (!state?.accessCycleId) {
    return { active: false, reason: "PAYMENT_REQUIRED", state: state?.state || null };
  }
  const balanceFilter = { availableLearningDays: { $gt: 0 } };
  const cycleQuery = AccessCycle.findOne({
    _id: state.accessCycleId,
    userId,
    status: "ACTIVE",
    ...balanceFilter,
  }).select("_id division availableLearningDays reservedLearningDays lockedLearningDays status");
  if (session) cycleQuery.session(session);
  const cycle = await cycleQuery.lean();
  return {
    active: Boolean(cycle),
    reason: cycle ? null : "PAYMENT_REQUIRED",
    state: state.state,
    cycle,
  };
}

async function assertPaidPackageAccess(userId) {
  const access = await getPaidPackageAccess(userId);
  if (!access.active) {
    const error = new Error(
      "시즌·복귀 배치고사와 GOAT Arena 공식 경기는 활성 학습권 패키지 회원만 이용할 수 있습니다. 최초 배치고사 1회는 무료입니다."
    );
    error.status = 403;
    error.code = "PAID_PACKAGE_REQUIRED";
    throw error;
  }
  return access;
}

async function getWeeklyMockExamAccess(userId) {
  const [learningPackage, mockExamOnlyPackage, academyPlan] = await Promise.all([
    getPaidPackageAccess(userId),
    getMockExamPackageAccess(userId),
    getActiveAcademyPlan(userId),
  ]);
  if (learningPackage.active) {
    return {
      active: true,
      packageType: learningPackage.unlimited ? "SUPER_ADMIN" : "LEARNING_PACKAGE",
      learningPackage,
      mockExamOnlyPackage,
      academyPlan,
      placementRequired: true,
      arenaAllowed: true,
      unlimited: learningPackage.unlimited === true,
      noExpiry: learningPackage.noExpiry === true,
    };
  }
  if (academyPlan.active && academyPlan.includesMockExam) {
    return {
      active: true,
      packageType: "ACADEMY_PLAN",
      learningPackage,
      mockExamOnlyPackage,
      academyPlan,
      placementRequired: true,
      arenaAllowed: false,
      unlimited: false,
      noExpiry: !academyPlan.endsAt,
    };
  }
  if (mockExamOnlyPackage.active) {
    return {
      active: true,
      packageType: "MOCK_EXAM_ONLY",
      learningPackage,
      mockExamOnlyPackage,
      academyPlan,
      /*
       * 모의고사 전용 이용권도 최초 티어는 무료 배치고사에서 받는다.
       * Arena 경기 권한과 배치 기반 티어 참여 자격은 서로 다른 개념이다.
       */
      placementRequired: true,
      arenaAllowed: false,
    };
  }
  return {
    active: false,
    packageType: null,
    learningPackage,
    mockExamOnlyPackage,
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
