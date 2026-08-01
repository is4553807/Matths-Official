const mongoose = require("mongoose");
const {
  AccessCycle,
  ArenaAccessState,
} = require("../models/goatArenaModel");

async function getPaidPackageAccess(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    return { active: false, reason: "INVALID_USER" };
  }
  const state = await ArenaAccessState.findOne({ userId })
    .select("state accessCycleId currentCompetitiveDivision")
    .lean();
  if (!state?.accessCycleId) {
    return { active: false, reason: "PAYMENT_REQUIRED", state: state?.state || null };
  }
  const balanceFilter =
    state.currentCompetitiveDivision === "MAIN"
      ? {
          $or: [
            { availableLearningDays: { $gt: 0 } },
            { reservedLearningDays: { $gt: 0 } },
            { lockedLearningDays: { $gt: 0 } },
          ],
        }
      : { availableLearningDays: { $gt: 0 } };
  const cycle = await AccessCycle.findOne({
    _id: state.accessCycleId,
    userId,
    status: "ACTIVE",
    ...balanceFilter,
  })
    .select("_id division availableLearningDays reservedLearningDays lockedLearningDays status")
    .lean();
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
      "배치고사, Matths 주간 공식 모의고사와 GOAT Arena 공식 경기는 활성 학습권 패키지 회원만 이용할 수 있습니다."
    );
    error.status = 403;
    error.code = "PAID_PACKAGE_REQUIRED";
    throw error;
  }
  return access;
}

module.exports = {
  assertPaidPackageAccess,
  getPaidPackageAccess,
};
