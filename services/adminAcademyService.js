const mongoose = require("mongoose");
const { AdminActionLog, AdminTodo, User } = require("../models/matthsModel");
const {
  Academy,
  AcademyAttendance,
  AcademyAttendanceAudit,
  AcademyAttendanceCodeAttempt,
  AcademyAttendanceSession,
  AcademyClass,
  AcademyClassWeek,
  AcademyInvite,
  AcademyStaff,
  AcademyStudentMembership,
} = require("../models/academyModel");
const {
  _private: { attendanceCodeForSession, sessionState },
} = require("./academyAttendanceService");
const {
  archiveAcademyClassRecord,
  restoreAcademyClassRecord,
} = require("./academyClassLifecycleService");
const { getAcademyMonthlyStatistics } = require("./academyStatisticsService");
const { getClassMathMap } = require("./mathMapService");
const { signedCloudinaryUrl } = require("./fileStorageService");
const { createAcademyWeekFileDownload } = require("./academyClassworkService");

const ACADEMY_STATUSES = ["PENDING", "ACTIVE", "PAUSED", "REJECTED", "ARCHIVED"];
const PAGE_SIZE = 50;
const ADMIN_USER_FIELDS = "name realName email role isActive accountStatus schoolGrade school";
const ATTENDANCE_STATUSES = new Set(["PRESENT", "LATE", "ABSENT", "EXCUSED"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function normalizeClassOperationsInput(input = {}) {
  const weekdays = [...new Set(asArray(input.weekdays).map(Number))]
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    .sort((left, right) => left - right);
  const startTime = String(input.startTime || "").trim();
  const endTime = String(input.endTime || "").trim();
  const effectiveFrom = String(input.effectiveFrom || "").trim();
  if (!weekdays.length) throw statusError(400, "수업 요일을 하나 이상 선택해 주세요.");
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    throw statusError(400, "수업 시작·종료 시간을 올바르게 입력해 주세요.");
  }
  if (endTime <= startTime) throw statusError(400, "수업 종료 시간은 시작 시간보다 늦어야 합니다.");
  if (!DATE_KEY_PATTERN.test(effectiveFrom)) throw statusError(400, "일정 적용 시작일을 올바르게 입력해 주세요.");
  const [year, month, day] = effectiveFrom.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw statusError(400, "존재하지 않는 일정 적용 시작일입니다.");
  }
  const mode = String(input.attendanceMode || "MANUAL").toUpperCase();
  if (!["MANUAL", "SELF_CODE"].includes(mode)) throw statusError(400, "지원하지 않는 출석 방식입니다.");
  const boundedInteger = (value, fallback, minimum, maximum, label) => {
    const parsed = Number.parseInt(value, 10);
    const result = Number.isFinite(parsed) ? parsed : fallback;
    if (result < minimum || result > maximum) throw statusError(400, `${label} 설정 범위를 확인해 주세요.`);
    return result;
  };
  const opensBeforeMinutes = boundedInteger(input.opensBeforeMinutes, 10, 0, 120, "출석 시작");
  const lateAfterMinutes = boundedInteger(input.lateAfterMinutes, 5, 0, 120, "지각 기준");
  const closesAfterMinutes = boundedInteger(input.closesAfterMinutes, 20, 1, 240, "출석 마감");
  if (lateAfterMinutes > closesAfterMinutes) throw statusError(400, "지각 기준은 출석 마감보다 빠르거나 같아야 합니다.");
  return {
    schedule: { weekdays, startTime, endTime, effectiveFrom, timezone: "Asia/Seoul" },
    attendancePolicy: { mode, opensBeforeMinutes, lateAfterMinutes, closesAfterMinutes },
  };
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
        profileImageSrc: signedCloudinaryUrl(academy.profileImageAsset) || "",
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

async function getAdminAcademyDetail({ adminUserId, academyId, periodKey, now = new Date() }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  const academy = await Academy.findById(academyId)
    .populate("createdByUserId", ADMIN_USER_FIELDS)
    .populate("reviewedByUserId", "name realName email")
    .lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  academy.profileImageSrc = signedCloudinaryUrl(academy.profileImageAsset) || "";

  const [staff, memberships, classes, classWeeks, invites, attendanceSessions, attendanceRecords, attendanceAudits] = await Promise.all([
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
      .populate("homeroomTeacherUserId", "name realName email")
      .populate("coTeacherUserIds", "name realName email")
      .populate("teacherHistory.previousTeacherUserId", "name realName email")
      .populate("teacherHistory.nextTeacherUserId", "name realName email")
      .populate("teacherHistory.changedByUserId", "name realName email")
      .populate("archivedByUserId", "name realName email")
      .populate("lifecycleHistory.actedByUserId", "name realName email")
      .lean(),
    AcademyClassWeek.find({ academyId: academy._id })
      .sort({ academicYear: -1, weekNumber: -1, _id: -1 })
      .populate("classId", "name isActive")
      .populate("createdByUserId", "name realName email")
      .populate("updatedByUserId", "name realName email")
      .lean(),
    AcademyInvite.find({ academyId: academy._id })
      .sort({ createdAt: -1 })
      .populate("createdByUserId", "name realName email")
      .populate("classId", "name isActive")
      .lean(),
    AcademyAttendanceSession.find({ academyId: academy._id })
      .sort({ startsAt: -1, _id: -1 })
      .limit(40)
      .populate("classId", "name isActive")
      .populate("createdByUserId", "name realName email")
      .lean(),
    AcademyAttendance.find({ academyId: academy._id })
      .sort({ dateKey: -1, updatedAt: -1, _id: -1 })
      .limit(120)
      .populate("studentUserId", ADMIN_USER_FIELDS)
      .populate("classId", "name isActive")
      .populate("sessionId", "dateKey startsAt attendanceMode status")
      .populate("recordedByUserId", "name realName email role")
      .lean(),
    AcademyAttendanceAudit.find({ academyId: academy._id })
      .sort({ occurredAt: -1, _id: -1 })
      .limit(120)
      .populate("studentUserId", ADMIN_USER_FIELDS)
      .populate("classId", "name isActive")
      .populate("actorUserId", "name realName email role")
      .lean(),
  ]);
  const approvedMemberships = memberships.filter((membership) => membership.status === "APPROVED" && membership.studentUserId);
  const studentUserIds = approvedMemberships.map((membership) => membership.studentUserId._id);
  const [statistics, mathMap] = await Promise.all([
    getAcademyMonthlyStatistics({ studentUserIds, periodKey }),
    getClassMathMap({ studentUserIds }),
  ]);
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
    classWeeks,
    invites,
    attendanceSessions: attendanceSessions.map((session) => ({
      ...session,
      computedState: sessionState(session, now),
      code: session.attendanceMode === "SELF_CODE" && !["CLOSED", "CANCELED"].includes(sessionState(session, now))
        ? attendanceCodeForSession(session)
        : "",
    })),
    attendanceRecords: attendanceRecords.filter((record) => record.studentUserId),
    attendanceAudits: attendanceAudits.filter((audit) => audit.studentUserId && audit.actorUserId),
    statistics,
    mathMap,
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

async function getAdminAcademyWeekFileDownload({ adminUserId, academyId, weekId, fileId }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(weekId, "주차 수업");
  validObjectId(fileId, "과제 파일");
  const week = await AcademyClassWeek.findOne({ _id: weekId, academyId });
  const file = week?.files?.id(fileId);
  if (!week || !file) throw statusError(404, "과제 파일을 찾을 수 없습니다.");
  return createAcademyWeekFileDownload({
    userId: adminUserId,
    downloaderRole: "admin",
    week,
    fileId,
  });
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

async function updateAdminAcademyContract({
  adminUserId,
  academyId,
  contractEndsAt,
}) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  const dateKey = String(contractEndsAt || "").trim();
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw statusError(400, "학원 계약 만료일을 선택해 주세요.");
  }
  const endsAt = new Date(`${dateKey}T23:59:59.999+09:00`);
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
    throw statusError(400, "학원 계약 만료일은 오늘 이후여야 합니다.");
  }

  const academy = await Academy.findById(academyId).lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  const ownerStaff = await AcademyStaff.findOne({
    academyId: academy._id,
    role: "OWNER",
    status: "ACTIVE",
  }).lean();
  const owner = ownerStaff
    ? await User.findById(ownerStaff.userId)
    : null;
  if (!owner || owner.role !== "teacher") {
    throw statusError(409, "활성 교사 역할의 원장 계정을 먼저 확인해 주세요.");
  }

  const restoreStatus =
    academy.status === "ARCHIVED" &&
    ["CONTRACT_EXPIRED", "TEACHER_ACCESS_REVOKED"].includes(academy.archiveReason)
      ? academy.statusBeforeArchive === "PAUSED"
        ? "PAUSED"
        : academy.statusBeforeArchive === "PENDING"
          ? "PENDING"
          : "ACTIVE"
      : academy.status;
  const now = new Date();
  const updated = await Academy.findByIdAndUpdate(
    academy._id,
    {
      $set: {
        status: restoreStatus,
        contractStartsAt: academy.contractStartsAt || now,
        contractEndsAt: endsAt,
        contractReminderSentAt: null,
        contractReminderForEndsAt: null,
        contractExpiredAt: null,
        archivedAt: null,
        archiveReason: null,
        statusBeforeArchive: null,
        planCode: "ACADEMY_MOCK_INCLUDED",
        includesMockExam: true,
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  owner.teacherAccessExpiresAt = endsAt;
  owner.tokenVersion = (Number(owner.tokenVersion) || 0) + 1;
  await owner.save();

  await Promise.all([
    AdminTodo.updateMany(
      {
        sourceId: academy._id,
        sourceType: /^AcademyContractExpiry-/,
        status: "pending",
      },
      {
        $set: {
          status: "completed",
          completedAt: now,
          completedBy: adminUserId,
        },
      }
    ),
    logAction({
      adminUserId,
      targetUserId: owner._id,
      action: "academy.contract-update",
      detail: `${academy.name} 계약 만료일 변경`,
      academy,
      metadata: {
        previousContractEndsAt: academy.contractEndsAt || null,
        nextContractEndsAt: endsAt,
        previousStatus: academy.status,
        nextStatus: updated.status,
      },
    }),
  ]);
  return updated;
}

async function assertActiveTeacher(userId) {
  const user = await User.findById(userId)
    .select("role isActive accountStatus teacherAccessExpiresAt")
    .lean();
  const expiry = user?.teacherAccessExpiresAt
    ? new Date(user.teacherAccessExpiresAt)
    : null;
  if (
    !user ||
    user.role !== "teacher" ||
    user.isActive === false ||
    user.accountStatus === "withdrawn" ||
    (expiry && expiry.getTime() <= Date.now())
  ) {
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
  let homeroomFallbackUserId = null;
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
    const owner = await AcademyStaff.findOne({ academyId: academy._id, role: "OWNER", status: "ACTIVE" })
      .select("userId")
      .lean();
    homeroomFallbackUserId = owner?.userId || null;
    if (!homeroomFallbackUserId) throw statusError(409, "학원 원장 계정을 확인할 수 없어 교사 권한을 해제하지 않았습니다.");
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
  if (normalizedAction === "REVOKE") {
    await AcademyClass.updateMany(
      { academyId: academy._id, coTeacherUserIds: staff.userId },
      { $pull: { coTeacherUserIds: staff.userId } }
    );
    await AcademyClass.updateMany(
      { academyId: academy._id, isActive: true, homeroomTeacherUserId: staff.userId },
      {
        $set: { homeroomTeacherUserId: homeroomFallbackUserId },
        $pull: { coTeacherUserIds: homeroomFallbackUserId },
        $push: {
          teacherHistory: {
            previousTeacherUserId: staff.userId,
            nextTeacherUserId: homeroomFallbackUserId,
            changedByUserId: adminUserId,
            changedAt: now,
          },
        },
      }
    );
  }
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
  const result = normalizedAction === "ACTIVATE"
    ? await restoreAcademyClassRecord({
        academyId,
        classId,
        actorUserId: adminUserId,
        actorType: "ADMIN",
      })
    : await archiveAcademyClassRecord({
        academyId,
        classId,
        actorUserId: adminUserId,
        actorType: "ADMIN",
      });
  const updated = result.academyClass;
  await logAction({
    adminUserId,
    action: `academy.class-${normalizedAction.toLowerCase()}`,
    detail: `${academy.name} ${updated.name} 반 ${normalizedAction === "ACTIVATE" ? "복구" : "보관"}`,
    academy,
    metadata: {
      classId: String(updated._id),
      unassignedStudentCount: Number(result.unassignedStudentCount || 0),
      canceledSessionCount: Number(result.canceledSessionCount || 0),
      revokedInviteCount: Number(result.revokedInviteCount || 0),
    },
  });
  return updated;
}

async function updateAdminAcademyClassOperations({
  adminUserId,
  academyId,
  classId,
  weekdays,
  startTime,
  endTime,
  effectiveFrom,
  attendanceMode,
  opensBeforeMinutes,
  lateAfterMinutes,
  closesAfterMinutes,
}) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(classId, "반");
  const [academy, academyClass] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyClass.findOne({ _id: classId, academyId }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!academyClass) throw statusError(404, "반을 찾을 수 없습니다.");
  const normalized = normalizeClassOperationsInput({
    weekdays,
    startTime,
    endTime,
    effectiveFrom,
    attendanceMode,
    opensBeforeMinutes,
    lateAfterMinutes,
    closesAfterMinutes,
  });
  const now = new Date();
  const updated = await AcademyClass.findOneAndUpdate(
    { _id: academyClass._id, academyId: academy._id },
    { $set: normalized },
    { returnDocument: "after", runValidators: true }
  ).lean();
  await AcademyAttendanceSession.updateMany(
    {
      academyId: academy._id,
      classId: academyClass._id,
      startsAt: { $gt: now },
      status: { $ne: "CANCELED" },
    },
    {
      $set: {
        status: "CANCELED",
        cancellationReason: "SCHEDULE_CHANGED",
        canceledAt: now,
        closedAt: now,
      },
    }
  );
  await logAction({
    adminUserId,
    action: "academy.class-operations-update",
    detail: `${academy.name} ${academyClass.name} 반 수업 일정·출석 방식 변경`,
    academy,
    metadata: {
      classId: String(academyClass._id),
      previousSchedule: academyClass.schedule,
      nextSchedule: normalized.schedule,
      previousAttendancePolicy: academyClass.attendancePolicy,
      nextAttendancePolicy: normalized.attendancePolicy,
    },
  });
  return updated;
}

async function transferAdminAcademyClassHomeroom({
  adminUserId,
  academyId,
  classId,
  nextTeacherUserId,
  retainPreviousAsCoTeacher = false,
}) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(classId, "반");
  validObjectId(nextTeacherUserId, "새 담임 선생님");
  const [academy, academyClass, nextStaff] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyClass.findOne({ _id: classId, academyId }).lean(),
    AcademyStaff.findOne({ academyId, userId: nextTeacherUserId, status: "ACTIVE" }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!academyClass) throw statusError(404, "반을 찾을 수 없습니다.");
  if (!nextStaff) throw statusError(409, "새 담임은 이 학원의 활성 선생님이어야 합니다.");
  const previousTeacherUserId = academyClass.homeroomTeacherUserId || academyClass.createdByUserId;
  if (String(previousTeacherUserId) === String(nextTeacherUserId)) {
    throw statusError(409, "이미 이 반의 담임 선생님입니다.");
  }
  const now = new Date();
  const nextCoTeacherUserIds = (academyClass.coTeacherUserIds || [])
    .filter((userId) => String(userId) !== String(nextStaff.userId));
  if (
    retainPreviousAsCoTeacher &&
    previousTeacherUserId &&
    !nextCoTeacherUserIds.some((userId) => String(userId) === String(previousTeacherUserId))
  ) {
    nextCoTeacherUserIds.push(previousTeacherUserId);
  }
  const updated = await AcademyClass.findOneAndUpdate(
    { _id: academyClass._id, academyId: academy._id },
    {
      $set: {
        homeroomTeacherUserId: nextStaff.userId,
        coTeacherUserIds: nextCoTeacherUserIds,
      },
      $push: {
        teacherHistory: {
          previousTeacherUserId,
          nextTeacherUserId: nextStaff.userId,
          changedByUserId: adminUserId,
          changedAt: now,
        },
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  await logAction({
    adminUserId,
    targetUserId: nextStaff.userId,
    action: "academy.class-homeroom-transfer",
    detail: `${academy.name} ${academyClass.name} 반 담임 이전`,
    academy,
    metadata: {
      classId: String(academyClass._id),
      previousTeacherUserId: String(previousTeacherUserId),
      nextTeacherUserId: String(nextStaff.userId),
      retainPreviousAsCoTeacher: Boolean(retainPreviousAsCoTeacher),
    },
  });
  return updated;
}

async function updateAdminAcademyAttendance({ adminUserId, academyId, attendanceId, status, note = "" }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(attendanceId, "출결 기록");
  const normalizedStatus = String(status || "").toUpperCase();
  if (!ATTENDANCE_STATUSES.has(normalizedStatus)) throw statusError(400, "지원하지 않는 출결 상태입니다.");
  const normalizedNote = String(note || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const [academy, attendance] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyAttendance.findOne({ _id: attendanceId, academyId }).lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!attendance) throw statusError(404, "출결 기록을 찾을 수 없습니다.");
  const now = new Date();
  const isArrival = normalizedStatus === "PRESENT" || normalizedStatus === "LATE";
  const updated = await AcademyAttendance.findOneAndUpdate(
    { _id: attendance._id, academyId: academy._id },
    {
      $set: {
        status: normalizedStatus,
        checkedInAt: isArrival ? attendance.checkedInAt || now : null,
        checkedOutAt: isArrival ? attendance.checkedOutAt || null : null,
        note: normalizedNote,
        recordedByUserId: adminUserId,
        source: "ADMIN",
        seedRunId: null,
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  await Promise.all([
    AcademyAttendanceAudit.create({
      academyId: academy._id,
      classId: attendance.classId,
      sessionId: attendance.sessionId,
      attendanceId: attendance._id,
      studentUserId: attendance.studentUserId,
      actorUserId: adminUserId,
      actorType: "ADMIN",
      action: "UPDATED",
      previousStatus: attendance.status,
      nextStatus: normalizedStatus,
      note: normalizedNote,
      occurredAt: now,
    }),
    logAction({
      adminUserId,
      targetUserId: attendance.studentUserId,
      action: "academy.attendance-override",
      detail: `${academy.name} 학생 출결 운영자 보정`,
      academy,
      metadata: {
        attendanceId: String(attendance._id),
        sessionId: attendance.sessionId ? String(attendance.sessionId) : null,
        previousStatus: attendance.status,
        nextStatus: normalizedStatus,
      },
    }),
  ]);
  return updated;
}

async function regenerateAdminAcademyAttendanceCode({ adminUserId, academyId, sessionId, now = new Date() }) {
  await assertSuperAdmin(adminUserId);
  validObjectId(academyId, "학원");
  validObjectId(sessionId, "수업 회차");
  const [academy, session] = await Promise.all([
    Academy.findById(academyId).lean(),
    AcademyAttendanceSession.findOne({ _id: sessionId, academyId }).populate("classId", "name").lean(),
  ]);
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  if (!session) throw statusError(404, "수업 회차를 찾을 수 없습니다.");
  if (session.attendanceMode !== "SELF_CODE" || ["CLOSED", "CANCELED"].includes(sessionState(session, now))) {
    throw statusError(409, "학생 코드 출석을 사용하는 유효한 수업만 코드를 재발급할 수 있습니다.");
  }
  const updated = await AcademyAttendanceSession.findOneAndUpdate(
    { _id: session._id, academyId: academy._id },
    { $inc: { codeVersion: 1 }, $set: { codeIssuedAt: now } },
    { returnDocument: "after", runValidators: true }
  ).lean();
  await Promise.all([
    AcademyAttendanceCodeAttempt.deleteMany({ sessionId: session._id }),
    logAction({
      adminUserId,
      action: "academy.attendance-code-regenerated",
      detail: `${academy.name} ${session.classId?.name || "반"} 출석 코드 재발급`,
      academy,
      metadata: { sessionId: String(session._id), codeVersion: updated.codeVersion },
    }),
  ]);
  return { session: updated, code: attendanceCodeForSession(updated) };
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
  if (normalizedAction === "RESTORE" && invite.classId) {
    const activeClass = await AcademyClass.exists({
      _id: invite.classId,
      academyId: academy._id,
      isActive: true,
    });
    if (!activeClass) throw statusError(409, "보관된 반에 연결된 초대는 반을 복구한 뒤 활성화할 수 있습니다.");
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
  getAdminAcademyWeekFileDownload,
  getAdminAcademyList,
  regenerateAdminAcademyAttendanceCode,
  transferAdminAcademyClassHomeroom,
  transferAdminAcademyOwner,
  updateAdminAcademyAttendance,
  updateAdminAcademyClass,
  updateAdminAcademyClassOperations,
  updateAdminAcademyInvite,
  updateAdminAcademyMembership,
  updateAdminAcademyProfile,
  updateAdminAcademyContract,
  updateAdminAcademyStaff,
};
