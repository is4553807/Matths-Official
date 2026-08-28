const mongoose = require("mongoose");
const { AdminActionLog, User } = require("../models/matthsModel");
const {
  Academy,
  AcademyClass,
  AcademyInvite,
  AcademyStaff,
  AcademyStudentMembership,
} = require("../models/academyModel");
const { getAcademyMonthlyStatistics } = require("./academyStatisticsService");

const ACADEMY_STATUSES = ["PENDING", "ACTIVE", "PAUSED", "REJECTED"];
const PAGE_SIZE = 50;
const ADMIN_USER_FIELDS = "name realName email role isActive accountStatus schoolGrade school";

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validObjectId(value, label = "항목") {
  if (!mongoose.isValidObjectId(value)) throw statusError(404, `${label}을 찾을 수 없습니다.`);
  return value;
}

async function assertSuperAdmin(adminUserId) {
  const admin = await User.findById(adminUserId)
    .select("role isActive accountStatus")
    .lean();
  const accountStatus = admin?.accountStatus || (admin?.isActive === false ? "inactive" : "active");
  if (!admin || admin.role !== "admin" || admin.isActive === false || accountStatus !== "active") {
    throw statusError(403, "활성 운영자 계정만 학원 전체 관리 기능을 사용할 수 있습니다.");
  }
  return admin;
}

async function logAction({ adminUserId, targetUserId = null, action, detail, academy, metadata = {} }) {
  await AdminActionLog.create({
    adminUserId,
    targetUserId,
    action,
    detail,
    metadata: {
      academyId: String(academy._id),
      academyName: academy.name,
      ...metadata,
    },
  });
}

function countMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const academyId = String(row._id.academyId);
    const key = `${academyId}:${row._id.status || row._id.isActive}`;
    map.set(key, Number(row.count || 0));
  });
  return map;
}

async function getAdminAcademyList({ adminUserId, search = "", status = "ALL", page = 1 }) {
  await assertSuperAdmin(adminUserId);
  const normalizedSearch = cleanName(search).slice(0, 80);
  const normalizedStatus = ACADEMY_STATUSES.includes(String(status).toUpperCase())
    ? String(status).toUpperCase()
    : "ALL";
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const query = {};
  if (normalizedStatus !== "ALL") query.status = normalizedStatus;
  if (normalizedSearch) query.name = new RegExp(escapeRegex(normalizedSearch), "i");

  const [academies, total, statusRows] = await Promise.all([
    Academy.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate("createdByUserId", ADMIN_USER_FIELDS)
      .populate("reviewedByUserId", "name realName email")
      .lean(),
    Academy.countDocuments(query),
    Academy.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const academyIds = academies.map((academy) => academy._id);
  const [staffRows, studentRows, classRows] = academyIds.length
    ? await Promise.all([
        AcademyStaff.aggregate([
          { $match: { academyId: { $in: academyIds } } },
          { $group: { _id: { academyId: "$academyId", status: "$status" }, count: { $sum: 1 } } },
        ]),
        AcademyStudentMembership.aggregate([
          { $match: { academyId: { $in: academyIds } } },
          { $group: { _id: { academyId: "$academyId", status: "$status" }, count: { $sum: 1 } } },
        ]),
        AcademyClass.aggregate([
          { $match: { academyId: { $in: academyIds } } },
          { $group: { _id: { academyId: "$academyId", isActive: "$isActive" }, count: { $sum: 1 } } },
        ]),
      ])
    : [[], [], []];
  const staffCounts = countMap(staffRows);
  const studentCounts = countMap(studentRows);
  const classCounts = countMap(classRows);

  return {
    academies: academies.map((academy) => {
      const id = String(academy._id);
      return {
        ...academy,
        counts: {
          activeStaff: staffCounts.get(`${id}:ACTIVE`) || 0,
          pendingStaff: staffCounts.get(`${id}:PENDING`) || 0,
          approvedStudents: studentCounts.get(`${id}:APPROVED`) || 0,
          pendingStudents: studentCounts.get(`${id}:PENDING`) || 0,
          activeClasses: classCounts.get(`${id}:true`) || 0,
        },
      };
    }),
    filters: { search: normalizedSearch, status: normalizedStatus },
    pagination: {
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
    statusCounts: Object.fromEntries(ACADEMY_STATUSES.map((key) => [key, 0]).concat(statusRows.map((row) => [row._id, Number(row.count || 0)]))),
  };
}

async function getAdminAcademyDetail({ adminUserId, academyId, periodKey }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  const academy = await Academy.findById(academyId)
    .populate("createdByUserId", ADMIN_USER_FIELDS)
    .populate("reviewedByUserId", "name realName email")
    .lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");

  const [staff, memberships, classes, invites] = await Promise.all([
    AcademyStaff.find({ academyId: academy._id })
      .sort({ role: 1, status: 1, createdAt: 1 })
      .populate("userId", ADMIN_USER_FIELDS)
      .populate("reviewedByUserId", "name realName email")
      .lean(),
    AcademyStudentMembership.find({ academyId: academy._id })
      .sort({ status: 1, requestedAt: -1 })
      .populate("studentUserId", ADMIN_USER_FIELDS)
      .populate("classId", "name isActive")
      .populate("reviewedByUserId", "name realName email")
      .lean(),
    AcademyClass.find({ academyId: academy._id })
      .sort({ isActive: -1, name: 1 })
      .populate("createdByUserId", "name realName email")
      .lean(),
    AcademyInvite.find({ academyId: academy._id })
      .sort({ createdAt: -1 })
      .populate("createdByUserId", "name realName email")
      .populate("classId", "name isActive")
      .lean(),
  ]);
  const approvedMemberships = memberships.filter((membership) => membership.status === "APPROVED" && membership.studentUserId);
  const statistics = await getAcademyMonthlyStatistics({
    studentUserIds: approvedMemberships.map((membership) => membership.studentUserId._id),
    periodKey,
  });
  const membershipByStudentId = new Map(
    approvedMemberships.map((membership) => [String(membership.studentUserId._id), membership])
  );
  statistics.attentionStudents = statistics.attentionStudents
    .map((item) => ({ ...item, membership: membershipByStudentId.get(item.studentUserId) }))
    .filter((item) => item.membership);

  return {
    academy,
    staff: staff.filter((entry) => entry.userId),
    memberships: memberships.filter((entry) => entry.studentUserId),
    classes,
    invites,
    statistics,
    counts: {
      activeStaff: staff.filter((entry) => entry.status === "ACTIVE").length,
      pendingStaff: staff.filter((entry) => entry.status === "PENDING").length,
      approvedStudents: approvedMemberships.length,
      pendingStudents: memberships.filter((entry) => entry.status === "PENDING").length,
      activeClasses: classes.filter((entry) => entry.isActive).length,
      activeInvites: invites.filter((entry) => entry.status === "ACTIVE" && new Date(entry.expiresAt) > new Date() && entry.useCount < entry.maxUses).length,
    },
  };
}

async function updateAdminAcademyProfile({ adminUserId, academyId, action, name }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  const academy = await Academy.findById(academyId).lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  const normalizedAction = String(action || "").toUpperCase();
  let updated;
  if (normalizedAction === "RENAME") {
    const academyName = cleanName(name);
    if (academyName.length < 2 || academyName.length > 80) {
      throw statusError(400, "학원 이름은 2자 이상 80자 이하로 입력해 주세요.");
    }
    updated = await Academy.findByIdAndUpdate(
      academy._id,
      { $set: { name: academyName, nameNormalized: academyName.toLocaleLowerCase("ko-KR") } },
      { returnDocument: "after", runValidators: true }
    ).lean();
  } else if (normalizedAction === "PAUSE") {
    updated = await Academy.findOneAndUpdate(
      { _id: academy._id, status: "ACTIVE" },
      { $set: { status: "PAUSED" } },
      { returnDocument: "after" }
    ).lean();
  } else if (normalizedAction === "ACTIVATE") {
    updated = await Academy.findOneAndUpdate(
      { _id: academy._id, status: "PAUSED" },
      { $set: { status: "ACTIVE" } },
      { returnDocument: "after" }
    ).lean();
  } else if (normalizedAction === "REOPEN") {
    if (academy.status !== "REJECTED") {
      throw statusError(409, "거절된 학원만 재검토 대기로 복구할 수 있습니다.");
    }
    await assertActiveTeacher(academy.createdByUserId);
    const owner = await AcademyStaff.findOne({
      academyId: academy._id,
      userId: academy.createdByUserId,
      role: "OWNER",
      status: "REJECTED",
    }).lean();
    if (!owner) throw statusError(409, "복구할 원장 소속 기록을 확인할 수 없습니다.");
    const otherCurrent = await AcademyStaff.findOne({
      _id: { $ne: owner._id },
      userId: owner.userId,
      status: { $in: ["PENDING", "ACTIVE"] },
    }).lean();
    if (otherCurrent) {
      throw statusError(409, "신청 원장이 이미 다른 학원에 연결되어 있어 재검토 상태로 복구할 수 없습니다.");
    }
    const restoredOwner = await AcademyStaff.findOneAndUpdate(
      { _id: owner._id, status: "REJECTED" },
      {
        $set: {
          status: "ACTIVE",
          currentStaffKey: String(owner.userId),
          rejectedAt: null,
          reviewedAt: null,
          reviewedByUserId: null,
        },
      },
      { returnDocument: "after", runValidators: true }
    ).lean().catch((error) => {
      if (error?.code === 11000) throw statusError(409, "신청 원장이 이미 다른 학원에 연결되어 있습니다.");
      throw error;
    });
    if (!restoredOwner) throw statusError(409, "원장 소속 상태가 변경되어 복구하지 못했습니다.");
    updated = await Academy.findOneAndUpdate(
      { _id: academy._id, status: "REJECTED" },
      {
        $set: {
          status: "PENDING",
          reviewedAt: null,
          reviewedByUserId: null,
          approvedAt: null,
          rejectedAt: null,
        },
      },
      { returnDocument: "after" }
    ).lean();
    if (!updated) {
      await AcademyStaff.updateOne(
        { _id: restoredOwner._id, status: "ACTIVE" },
        {
          $set: { status: "REJECTED", rejectedAt: new Date() },
          $unset: { currentStaffKey: 1 },
        }
      );
      throw statusError(409, "학원 상태가 변경되어 재검토 복구를 취소했습니다.");
    }
  } else {
    throw statusError(400, "지원하지 않는 학원 관리 작업입니다.");
  }
  if (!updated) throw statusError(409, "현재 학원 상태에서는 해당 작업을 수행할 수 없습니다.");
  await logAction({
    adminUserId,
    targetUserId: academy.createdByUserId,
    action: `academy.admin-${normalizedAction.toLowerCase()}`,
    detail: `${academy.name} 학원 ${{ RENAME: "이름 변경", PAUSE: "운영 중지", ACTIVATE: "운영 재개", REOPEN: "재검토 대기 복구" }[normalizedAction]}`,
    academy: updated,
    metadata: { previousStatus: academy.status, nextStatus: updated.status, previousName: academy.name },
  });
  return updated;
}

async function assertActiveTeacher(userId) {
  const user = await User.findById(userId).select("role isActive accountStatus").lean();
  if (!user || user.role !== "teacher" || user.isActive === false || user.accountStatus === "withdrawn") {
    throw statusError(409, "대상 계정이 현재 활성 교사 계정이 아닙니다.");
  }
  return user;
}

async function updateAdminAcademyStaff({ adminUserId, academyId, staffId, action }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(staffId, "선생님 소속");
  const [academy, staff] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyStaff.findOne({ _id: staffId, academyId }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!staff) throw statusError(404, "선생님 소속을 찾을 수 없습니다.");
  if (staff.role === "OWNER") throw statusError(409, "원장 계정은 직접 해제할 수 없습니다. 학원 운영 상태를 중지해 주세요.");

  const normalizedAction = String(action || "").toUpperCase();
  const now = new Date();
  let update;
  let allowedStatuses;
  if (["APPROVE", "RESTORE"].includes(normalizedAction)) {
    allowedStatuses = normalizedAction === "APPROVE" ? ["PENDING"] : ["REJECTED", "REVOKED"];
    await assertActiveTeacher(staff.userId);
    const otherCurrent = await AcademyStaff.findOne({
      _id: { $ne: staff._id },
      userId: staff.userId,
      status: { $in: ["PENDING", "ACTIVE"] },
    }).lean();
    if (otherCurrent) throw statusError(409, "이 교사는 이미 다른 학원에 연결되어 있거나 승인을 기다리고 있습니다.");
    update = {
      $set: {
        role: "TEACHER",
        status: "ACTIVE",
        currentStaffKey: String(staff.userId),
        joinedAt: now,
        reviewedAt: now,
        reviewedByUserId: adminUserId,
        rejectedAt: null,
        revokedAt: null,
      },
    };
  } else if (normalizedAction === "REJECT") {
    allowedStatuses = ["PENDING"];
    update = {
      $set: { status: "REJECTED", rejectedAt: now, reviewedAt: now, reviewedByUserId: adminUserId },
      $unset: { currentStaffKey: 1 },
    };
  } else if (normalizedAction === "REVOKE") {
    allowedStatuses = ["ACTIVE"];
    update = {
      $set: { status: "REVOKED", revokedAt: now, reviewedAt: now, reviewedByUserId: adminUserId },
      $unset: { currentStaffKey: 1 },
    };
  } else {
    throw statusError(400, "지원하지 않는 교사 관리 작업입니다.");
  }

  const updated = await AcademyStaff.findOneAndUpdate(
    { _id: staff._id, academyId: academy._id, status: { $in: allowedStatuses } },
    update,
    { returnDocument: "after", runValidators: true }
  ).lean().catch((error) => {
    if (error?.code === 11000) throw statusError(409, "이 교사는 이미 다른 학원에 연결되어 있습니다.");
    throw error;
  });
  if (!updated) throw statusError(409, "현재 교사 소속 상태에서는 해당 작업을 수행할 수 없습니다.");
  await logAction({
    adminUserId,
    targetUserId: staff.userId,
    action: `academy.staff-${normalizedAction.toLowerCase()}`,
    detail: `${academy.name} 교사 소속 ${normalizedAction}`,
    academy,
    metadata: { staffId: String(staff._id), previousStatus: staff.status, nextStatus: updated.status },
  });
  return updated;
}

async function transferAdminAcademyOwner({ adminUserId, academyId, newOwnerStaffId }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(newOwnerStaffId, "새 원장");
  const [academy, currentOwner, nextOwner] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyStaff.findOne({ academyId, role: "OWNER", status: "ACTIVE" }).lean(),
    AcademyStaff.findOne({ _id: newOwnerStaffId, academyId, role: "TEACHER", status: "ACTIVE" }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!currentOwner) throw statusError(409, "현재 활성 원장 계정을 확인할 수 없습니다.");
  if (!nextOwner) throw statusError(409, "새 원장으로 지정할 활성 교사를 찾을 수 없습니다.");
  await assertActiveTeacher(nextOwner.userId);

  const promoted = await AcademyStaff.findOneAndUpdate(
    { _id: nextOwner._id, academyId: academy._id, role: "TEACHER", status: "ACTIVE" },
    { $set: { role: "OWNER", reviewedAt: new Date(), reviewedByUserId: adminUserId } },
    { returnDocument: "after" }
  ).lean();
  if (!promoted) throw statusError(409, "새 원장 후보의 상태가 변경되어 권한을 이전하지 못했습니다.");

  const demoted = await AcademyStaff.findOneAndUpdate(
    { _id: currentOwner._id, academyId: academy._id, role: "OWNER", status: "ACTIVE" },
    { $set: { role: "TEACHER", reviewedAt: new Date(), reviewedByUserId: adminUserId } },
    { returnDocument: "after" }
  ).lean();
  if (!demoted) {
    await AcademyStaff.updateOne(
      { _id: promoted._id, academyId: academy._id, role: "OWNER", status: "ACTIVE" },
      { $set: { role: "TEACHER" } }
    );
    throw statusError(409, "기존 원장 상태가 변경되어 권한 이전을 취소했습니다.");
  }

  await logAction({
    adminUserId,
    targetUserId: nextOwner.userId,
    action: "academy.owner-transfer",
    detail: `${academy.name} 원장 권한 이전`,
    academy,
    metadata: {
      previousOwnerUserId: String(currentOwner.userId),
      newOwnerUserId: String(nextOwner.userId),
      previousOwnerStaffId: String(currentOwner._id),
      newOwnerStaffId: String(nextOwner._id),
    },
  });
  return { previousOwner: demoted, newOwner: promoted };
}

async function assertActiveStudent(userId) {
  const user = await User.findById(userId).select("role isActive accountStatus").lean();
  if (!user || !["student", "test"].includes(user.role) || user.isActive === false || user.accountStatus === "withdrawn") {
    throw statusError(409, "대상 계정이 현재 활성 학생 계정이 아닙니다.");
  }
  return user;
}

async function updateAdminAcademyMembership({ adminUserId, academyId, membershipId, action }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(membershipId, "학생 소속");
  const [academy, membership] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyStudentMembership.findOne({ _id: membershipId, academyId }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!membership) throw statusError(404, "학생 소속을 찾을 수 없습니다.");

  const normalizedAction = String(action || "").toUpperCase();
  const now = new Date();
  let update;
  let allowedStatuses;
  if (["APPROVE", "RESTORE"].includes(normalizedAction)) {
    allowedStatuses = normalizedAction === "APPROVE" ? ["PENDING"] : ["REJECTED", "LEFT"];
    await assertActiveStudent(membership.studentUserId);
    const otherCurrent = await AcademyStudentMembership.findOne({
      _id: { $ne: membership._id },
      studentUserId: membership.studentUserId,
      status: { $in: ["PENDING", "APPROVED"] },
    }).lean();
    if (otherCurrent) throw statusError(409, "이 학생은 이미 다른 학원에 연결되어 있거나 승인을 기다리고 있습니다.");
    update = {
      $set: {
        status: "APPROVED",
        activeStudentKey: String(membership.studentUserId),
        approvedAt: now,
        reviewedAt: now,
        reviewedByUserId: adminUserId,
        rejectedAt: null,
        leftAt: null,
      },
    };
  } else if (normalizedAction === "REJECT") {
    allowedStatuses = ["PENDING"];
    update = {
      $set: { status: "REJECTED", classId: null, rejectedAt: now, reviewedAt: now, reviewedByUserId: adminUserId, approvedAt: null },
      $unset: { activeStudentKey: 1 },
    };
  } else if (normalizedAction === "REMOVE") {
    allowedStatuses = ["APPROVED"];
    update = {
      $set: { status: "LEFT", classId: null, leftAt: now, reviewedAt: now, reviewedByUserId: adminUserId },
      $unset: { activeStudentKey: 1 },
    };
  } else {
    throw statusError(400, "지원하지 않는 학생 소속 관리 작업입니다.");
  }

  const updated = await AcademyStudentMembership.findOneAndUpdate(
    { _id: membership._id, academyId: academy._id, status: { $in: allowedStatuses } },
    update,
    { returnDocument: "after", runValidators: true }
  ).lean().catch((error) => {
    if (error?.code === 11000) throw statusError(409, "이 학생은 이미 다른 학원에 연결되어 있습니다.");
    throw error;
  });
  if (!updated) throw statusError(409, "현재 학생 소속 상태에서는 해당 작업을 수행할 수 없습니다.");
  await logAction({
    adminUserId,
    targetUserId: membership.studentUserId,
    action: `academy.student-${normalizedAction.toLowerCase()}`,
    detail: `${academy.name} 학생 소속 ${normalizedAction}`,
    academy,
    metadata: { membershipId: String(membership._id), previousStatus: membership.status, nextStatus: updated.status },
  });
  return updated;
}

async function assignAdminAcademyMembershipClass({ adminUserId, academyId, membershipId, classId }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(membershipId, "학생 소속");
  const academy = await Academy.findById(academyId).lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  let nextClassId = null;
  if (classId) {
    validObjectId(classId, "반");
    const academyClass = await AcademyClass.findOne({ _id: classId, academyId, isActive: true }).lean();
    if (!academyClass) throw statusError(404, "활성 반을 찾을 수 없습니다.");
    nextClassId = academyClass._id;
  }
  const membership = await AcademyStudentMembership.findOneAndUpdate(
    { _id: membershipId, academyId },
    { $set: { classId: nextClassId } },
    { returnDocument: "after" }
  ).lean();
  if (!membership) throw statusError(404, "학생 소속을 찾을 수 없습니다.");
  await logAction({
    adminUserId,
    targetUserId: membership.studentUserId,
    action: "academy.student-class",
    detail: `${academy.name} 학생 반 배정 변경`,
    academy,
    metadata: { membershipId: String(membership._id), classId: nextClassId ? String(nextClassId) : null },
  });
  return membership;
}

async function updateAdminAcademyClass({ adminUserId, academyId, classId, action }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(classId, "반");
  const academy = await Academy.findById(academyId).lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  const normalizedAction = String(action || "").toUpperCase();
  if (!["ACTIVATE", "DEACTIVATE"].includes(normalizedAction)) {
    throw statusError(400, "지원하지 않는 반 관리 작업입니다.");
  }
  const updated = await AcademyClass.findOneAndUpdate(
    { _id: classId, academyId },
    { $set: { isActive: normalizedAction === "ACTIVATE" } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw statusError(404, "반을 찾을 수 없습니다.");
  await logAction({
    adminUserId,
    action: `academy.class-${normalizedAction.toLowerCase()}`,
    detail: `${academy.name} ${updated.name} 반 ${normalizedAction === "ACTIVATE" ? "활성화" : "비활성화"}`,
    academy,
    metadata: { classId: String(updated._id) },
  });
  return updated;
}

async function updateAdminAcademyInvite({ adminUserId, academyId, inviteId, action }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(inviteId, "초대");
  const [academy, invite] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyInvite.findOne({ _id: inviteId, academyId }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!invite) throw statusError(404, "초대를 찾을 수 없습니다.");
  const normalizedAction = String(action || "").toUpperCase();
  if (!["RESTORE", "REVOKE"].includes(normalizedAction)) {
    throw statusError(400, "지원하지 않는 초대 관리 작업입니다.");
  }
  if (normalizedAction === "RESTORE" && (new Date(invite.expiresAt) <= new Date() || invite.useCount >= invite.maxUses)) {
    throw statusError(409, "만료되었거나 사용 횟수를 모두 소진한 초대는 다시 활성화할 수 없습니다.");
  }
  const updated = await AcademyInvite.findOneAndUpdate(
    { _id: invite._id, academyId: academy._id },
    { $set: { status: normalizedAction === "RESTORE" ? "ACTIVE" : "REVOKED" } },
    { returnDocument: "after" }
  ).lean();
  await logAction({
    adminUserId,
    targetUserId: invite.createdByUserId,
    action: `academy.invite-${normalizedAction.toLowerCase()}`,
    detail: `${academy.name} 초대 ${normalizedAction === "RESTORE" ? "활성화" : "비활성화"}`,
    academy,
    metadata: { inviteId: String(invite._id), code: invite.code },
  });
  return updated;
}

module.exports = {
  ACADEMY_STATUSES,
  assignAdminAcademyMembershipClass,
  getAdminAcademyDetail,
  getAdminAcademyList,
  transferAdminAcademyOwner,
  updateAdminAcademyClass,
  updateAdminAcademyInvite,
  updateAdminAcademyMembership,
  updateAdminAcademyProfile,
  updateAdminAcademyStaff,
};
