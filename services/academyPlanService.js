const mongoose = require("mongoose");

const {
  AcademyStudentMembership,
} = require("../models/academyModel");

function inactiveAcademyPlan(reason = "ACADEMY_MEMBERSHIP_REQUIRED") {
  return {
    active: false,
    reason,
    packageType: null,
    includesMockExam: false,
    academyId: null,
    academyName: "",
    startsAt: null,
    endsAt: null,
  };
}

/*
 * 학원 플랜은 별도 결제 문서가 아니라 승인된 학원 소속과 학원 계약으로 부여됩니다.
 * 29일 학습권(AccessCycle)과는 서로 다른 축이므로 둘은 동시에 활성화될 수 있습니다.
 */
async function getActiveAcademyPlan(
  userId,
  { now = new Date(), session = null } = {}
) {
  if (!mongoose.isValidObjectId(userId)) {
    return inactiveAcademyPlan("INVALID_USER");
  }

  const query = AcademyStudentMembership.findOne({
    studentUserId: userId,
    status: "APPROVED",
  })
    .select("academyId approvedAt")
    .populate({
      path: "academyId",
      match: {
        status: "ACTIVE",
        $and: [
          {
            $or: [
              { contractStartsAt: null },
              { contractStartsAt: { $exists: false } },
              { contractStartsAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { contractEndsAt: null },
              { contractEndsAt: { $exists: false } },
              { contractEndsAt: { $gt: now } },
            ],
          },
        ],
      },
      select:
        "name status contractStartsAt contractEndsAt planCode includesMockExam",
    });
  if (session) query.session(session);
  const membership = await query.lean();
  const academy = membership?.academyId;
  if (!academy) return inactiveAcademyPlan();

  return {
    active: true,
    reason: null,
    packageType: "ACADEMY_PLAN",
    planCode: academy.planCode || "ACADEMY_MOCK_INCLUDED",
    includesMockExam: academy.includesMockExam !== false,
    academyId: String(academy._id),
    academyName: academy.name,
    startsAt: academy.contractStartsAt || membership.approvedAt || null,
    endsAt: academy.contractEndsAt || null,
    membershipId: String(membership._id),
  };
}

module.exports = {
  getActiveAcademyPlan,
  inactiveAcademyPlan,
};
