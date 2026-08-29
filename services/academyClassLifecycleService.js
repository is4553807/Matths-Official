const mongoose = require("mongoose");
const {
  AcademyAttendanceSession,
  AcademyClass,
  AcademyInvite,
  AcademyStaff,
  AcademyStudentMembership,
} = require("../models/academyModel");

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertIds(academyId, classId) {
  if (!mongoose.isValidObjectId(academyId) || !mongoose.isValidObjectId(classId)) {
    throw statusError(404, "반을 찾을 수 없습니다.");
  }
}

async function archiveAcademyClassRecord({
  academyId,
  classId,
  actorUserId,
  actorType,
  now = new Date(),
}) {
  assertIds(academyId, classId);
  const normalizedActorType = String(actorType || "").toUpperCase();
  if (!["OWNER", "ADMIN"].includes(normalizedActorType)) {
    throw statusError(400, "반 보관 작업 주체가 올바르지 않습니다.");
  }

  const archivedClass = await AcademyClass.findOneAndUpdate(
    { _id: classId, academyId, isActive: true },
    {
      $set: {
        isActive: false,
        archivedAt: now,
        archivedByUserId: actorUserId,
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!archivedClass) {
    const existing = await AcademyClass.findOne({ _id: classId, academyId }).select("isActive").lean();
    if (!existing) throw statusError(404, "반을 찾을 수 없습니다.");
    throw statusError(409, "이미 보관된 반입니다.");
  }

  const [memberships, sessions, invites] = await Promise.all([
    AcademyStudentMembership.updateMany(
      { academyId, classId, status: { $in: ["PENDING", "APPROVED"] } },
      { $set: { classId: null } }
    ),
    AcademyAttendanceSession.updateMany(
      {
        academyId,
        classId,
        checkInClosesAt: { $gt: now },
        status: { $in: ["SCHEDULED", "OPEN"] },
      },
      {
        $set: {
          status: "CANCELED",
          cancellationReason: "CLASS_ARCHIVED",
          canceledAt: now,
          closedAt: now,
        },
      }
    ),
    AcademyInvite.updateMany(
      { academyId, classId, status: "ACTIVE" },
      { $set: { status: "REVOKED" } }
    ),
  ]);

  const counts = {
    unassignedStudentCount: Number(memberships.modifiedCount || 0),
    canceledSessionCount: Number(sessions.modifiedCount || 0),
    revokedInviteCount: Number(invites.modifiedCount || 0),
  };
  const academyClass = await AcademyClass.findByIdAndUpdate(
    archivedClass._id,
    {
      $push: {
        lifecycleHistory: {
          action: "ARCHIVED",
          actedByUserId: actorUserId,
          actorType: normalizedActorType,
          occurredAt: now,
          ...counts,
        },
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  return { academyClass, ...counts };
}

async function restoreAcademyClassRecord({
  academyId,
  classId,
  actorUserId,
  actorType,
  now = new Date(),
}) {
  assertIds(academyId, classId);
  const normalizedActorType = String(actorType || "").toUpperCase();
  if (!["OWNER", "ADMIN"].includes(normalizedActorType)) {
    throw statusError(400, "반 복구 작업 주체가 올바르지 않습니다.");
  }

  const [academyClass, activeStaff] = await Promise.all([
    AcademyClass.findOne({ _id: classId, academyId, isActive: false }).lean(),
    AcademyStaff.find({ academyId, status: "ACTIVE" })
      .sort({ role: 1, joinedAt: 1, createdAt: 1 })
      .select("userId role")
      .lean(),
  ]);
  if (!academyClass) {
    const existing = await AcademyClass.findOne({ _id: classId, academyId }).select("isActive").lean();
    if (!existing) throw statusError(404, "반을 찾을 수 없습니다.");
    throw statusError(409, "이미 사용 중인 반입니다.");
  }
  if (!activeStaff.length) throw statusError(409, "활성 선생님이 없어 반을 복구할 수 없습니다.");

  const activeUserIds = new Set(activeStaff.map((staff) => String(staff.userId)));
  const owner = activeStaff.find((staff) => staff.role === "OWNER") || activeStaff[0];
  const previousTeacherUserId = academyClass.homeroomTeacherUserId || null;
  const homeroomTeacherUserId = activeUserIds.has(String(previousTeacherUserId || ""))
    ? previousTeacherUserId
    : owner.userId;
  const coTeacherUserIds = (academyClass.coTeacherUserIds || []).filter(
    (userId) => activeUserIds.has(String(userId)) && String(userId) !== String(homeroomTeacherUserId)
  );
  const update = {
    $set: {
      isActive: true,
      archivedAt: null,
      archivedByUserId: null,
      homeroomTeacherUserId,
      coTeacherUserIds,
    },
    $push: {
      lifecycleHistory: {
        action: "RESTORED",
        actedByUserId: actorUserId,
        actorType: normalizedActorType,
        occurredAt: now,
        unassignedStudentCount: 0,
        canceledSessionCount: 0,
        revokedInviteCount: 0,
      },
    },
  };
  if (String(previousTeacherUserId || "") !== String(homeroomTeacherUserId)) {
    update.$push.teacherHistory = {
      previousTeacherUserId,
      nextTeacherUserId: homeroomTeacherUserId,
      changedByUserId: actorUserId,
      changedAt: now,
    };
  }

  const restored = await AcademyClass.findOneAndUpdate(
    { _id: classId, academyId, isActive: false },
    update,
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!restored) throw statusError(409, "반 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
  return { academyClass: restored };
}

module.exports = {
  archiveAcademyClassRecord,
  restoreAcademyClassRecord,
};
