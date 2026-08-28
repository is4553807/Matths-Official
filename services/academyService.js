const { randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
const { AdminActionLog, User } = require("../models/matthsModel");
const {
  Academy,
  AcademyStaff,
  AcademyClass,
  AcademyStudentMembership,
  AcademyInvite,
} = require("../models/academyModel");

const STUDENT_FIELDS = [
  "name",
  "realName",
  "schoolGrade",
  "school",
  "educationStatus",
  "isActive",
  "accountStatus",
].join(" ");
const STAFF_FIELDS = "name realName role isActive accountStatus";
const ACADEMY_STUDENT_PAGE_SIZE = 20;
const ACADEMY_STUDENT_BULK_LIMIT = 20;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedInviteCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function activeInviteFilter(now = new Date()) {
  return {
    status: "ACTIVE",
    expiresAt: { $gt: now },
    $expr: { $lt: ["$useCount", "$maxUses"] },
  };
}

function inviteState(invite, now = new Date()) {
  if (invite.status !== "ACTIVE") return "REVOKED";
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
  if (Number(invite.useCount) >= Number(invite.maxUses)) return "EXHAUSTED";
  return "ACTIVE";
}

async function ensureAcademyIndexes() {
  await Academy.updateMany(
    { status: { $exists: false } },
    { $set: { status: "ACTIVE" } }
  );
  await AcademyStaff.updateMany(
    {
      status: "ACTIVE",
      $or: [
        { currentStaffKey: { $exists: false } },
        { currentStaffKey: "" },
      ],
    },
    [
      {
        $set: {
          currentStaffKey: { $toString: "$userId" },
          joinedAt: { $ifNull: ["$joinedAt", "$createdAt"] },
        },
      },
    ],
    { updatePipeline: true }
  );
  await Promise.all([
    Academy.createIndexes(),
    AcademyStaff.createIndexes(),
    AcademyClass.createIndexes(),
    AcademyStudentMembership.createIndexes(),
    AcademyInvite.createIndexes(),
  ]);
}

async function assertTeacherAccount(teacherUserId) {
  const teacher = await User.findById(teacherUserId)
    .select("role isActive accountStatus")
    .lean();
  if (!teacher || teacher.role !== "teacher" || teacher.isActive === false || teacher.accountStatus === "withdrawn") {
    throw statusError(403, "운영자가 교사로 전환한 활성 계정만 학원에 연결할 수 있습니다.");
  }
  return teacher;
}

async function assertAdminAccount(adminUserId) {
  const admin = await User.findById(adminUserId)
    .select("role isActive accountStatus")
    .lean();
  if (!admin || admin.role !== "admin" || admin.isActive === false || admin.accountStatus === "withdrawn") {
    throw statusError(403, "활성 운영자 계정만 학원 등록 요청을 검토할 수 있습니다.");
  }
  return admin;
}

async function getTeacherAcademyContext(userId, { allowMissing = false } = {}) {
  const staff = await AcademyStaff.findOne({ userId, status: "ACTIVE" })
    .populate("academyId")
    .lean();

  if (!staff || !staff.academyId || staff.academyId.status !== "ACTIVE") {
    if (allowMissing) return null;
    throw statusError(403, "연결된 학원 정보를 찾을 수 없습니다.", "ACADEMY_SETUP_REQUIRED");
  }

  return {
    staff,
    academy: staff.academyId,
    academyId: staff.academyId._id,
  };
}

async function createAcademyForTeacher({ teacherUserId, name }) {
  const academyName = normalizeName(name);
  if (academyName.length < 2 || academyName.length > 80) {
    throw statusError(400, "학원 이름은 2자 이상 80자 이하로 입력해주세요.");
  }

  const [, existingStaff] = await Promise.all([
    assertTeacherAccount(teacherUserId),
    AcademyStaff.findOne({ userId: teacherUserId, status: { $in: ["PENDING", "ACTIVE"] } })
      .populate("academyId", "name status")
      .lean(),
  ]);
  if (existingStaff) {
    const message = existingStaff.status === "PENDING"
      ? "기존 학원 참여 승인을 기다리고 있습니다."
      : existingStaff.academyId?.status === "PENDING"
        ? "새 학원의 운영자 검토를 기다리고 있습니다."
        : "이미 연결된 학원이 있습니다.";
    throw statusError(409, message);
  }

  const academy = await Academy.create({
    name: academyName,
    nameNormalized: academyName.toLocaleLowerCase("ko-KR"),
    status: "PENDING",
    createdByUserId: teacherUserId,
  });

  try {
    await AcademyStaff.create({
      academyId: academy._id,
      userId: teacherUserId,
      role: "OWNER",
      status: "ACTIVE",
      currentStaffKey: String(teacherUserId),
      requestedAt: new Date(),
      joinedAt: null,
    });
  } catch (error) {
    await Academy.deleteOne({ _id: academy._id }).catch(() => {});
    throw error;
  }
  return academy.toObject();
}

async function getTeacherAcademySetupData(teacherUserId) {
  await assertTeacherAccount(teacherUserId);
  const [pendingRequest, ownerStaff, rejectedAcademy, academies] = await Promise.all([
    AcademyStaff.findOne({ userId: teacherUserId, role: "TEACHER", status: "PENDING" })
      .populate("academyId", "name status")
      .lean(),
    AcademyStaff.findOne({ userId: teacherUserId, role: "OWNER", status: "ACTIVE" })
      .populate("academyId", "name status createdAt")
      .lean(),
    Academy.findOne({ createdByUserId: teacherUserId, status: "REJECTED" })
      .sort({ reviewedAt: -1, createdAt: -1 })
      .select("name status reviewedAt")
      .lean(),
    Academy.find({ status: "ACTIVE" })
      .sort({ name: 1, _id: 1 })
      .select("name")
      .lean(),
  ]);
  return {
    pendingAcademy: ownerStaff?.academyId?.status === "PENDING" ? ownerStaff.academyId : null,
    pendingRequest: pendingRequest?.academyId ? pendingRequest : null,
    rejectedAcademy,
    academies,
  };
}

async function approveAcademyApplication({ adminUserId, academyId }) {
  await assertAdminAccount(adminUserId);
  if (!mongoose.isValidObjectId(academyId)) throw statusError(404, "학원 등록 요청을 찾을 수 없습니다.");
  const application = await Academy.findById(academyId)
    .select("status createdByUserId")
    .lean();
  if (!application) throw statusError(404, "학원 등록 요청을 찾을 수 없습니다.");
  if (application.status !== "PENDING") throw statusError(409, "이미 처리된 학원 등록 요청입니다.");
  try {
    await assertTeacherAccount(application.createdByUserId);
  } catch (error) {
    if (Number(error.status) === 403) {
      throw statusError(409, "신청자의 교사 역할 또는 계정 상태를 다시 확인해 주세요.");
    }
    throw error;
  }
  const now = new Date();
  const academy = await Academy.findOneAndUpdate(
    { _id: academyId, status: "PENDING" },
    {
      $set: {
        status: "ACTIVE",
        reviewedAt: now,
        reviewedByUserId: adminUserId,
        approvedAt: now,
        rejectedAt: null,
      },
    },
    { returnDocument: "after" }
  ).lean();
  if (!academy) {
    throw statusError(409, "이미 처리된 학원 등록 요청입니다.");
  }

  const owner = await AcademyStaff.findOneAndUpdate(
    { academyId: academy._id, role: "OWNER", status: "ACTIVE" },
    { $set: { joinedAt: now } },
    { returnDocument: "after" }
  ).lean();
  if (!owner) {
    await Academy.updateOne(
      { _id: academy._id, status: "ACTIVE", reviewedAt: now },
      { $set: { status: "PENDING", reviewedAt: null, reviewedByUserId: null, approvedAt: null } }
    );
    throw statusError(409, "학원 원장 계정을 확인할 수 없어 승인하지 않았습니다.");
  }

  await AdminActionLog.create({
    adminUserId,
    targetUserId: academy.createdByUserId,
    action: "academy.application-approved",
    detail: `${academy.name} 학원 등록 승인`,
    metadata: { academyId: String(academy._id), academyName: academy.name },
  });
  return academy;
}

async function rejectAcademyApplication({ adminUserId, academyId }) {
  await assertAdminAccount(adminUserId);
  if (!mongoose.isValidObjectId(academyId)) throw statusError(404, "학원 등록 요청을 찾을 수 없습니다.");
  const now = new Date();
  const academy = await Academy.findOneAndUpdate(
    { _id: academyId, status: "PENDING" },
    {
      $set: {
        status: "REJECTED",
        reviewedAt: now,
        reviewedByUserId: adminUserId,
        rejectedAt: now,
        approvedAt: null,
      },
    },
    { returnDocument: "after" }
  ).lean();
  if (!academy) {
    const existing = await Academy.findById(academyId).select("status").lean();
    if (!existing) throw statusError(404, "학원 등록 요청을 찾을 수 없습니다.");
    throw statusError(409, "이미 처리된 학원 등록 요청입니다.");
  }

  const owner = await AcademyStaff.findOneAndUpdate(
    { academyId: academy._id, role: "OWNER", status: "ACTIVE" },
    {
      $set: { status: "REJECTED", rejectedAt: now, reviewedAt: now, reviewedByUserId: adminUserId },
      $unset: { currentStaffKey: 1 },
    },
    { returnDocument: "after" }
  ).lean();
  if (!owner) {
    await Academy.updateOne(
      { _id: academy._id, status: "REJECTED", reviewedAt: now },
      { $set: { status: "PENDING", reviewedAt: null, reviewedByUserId: null, rejectedAt: null } }
    );
    throw statusError(409, "학원 원장 계정을 확인할 수 없어 거절 처리하지 않았습니다.");
  }

  await AdminActionLog.create({
    adminUserId,
    targetUserId: academy.createdByUserId,
    action: "academy.application-rejected",
    detail: `${academy.name} 학원 등록 거절`,
    metadata: { academyId: String(academy._id), academyName: academy.name },
  });
  return academy;
}

async function requestAcademyStaffJoin({ teacherUserId, academyId }) {
  if (!mongoose.isValidObjectId(academyId)) {
    throw statusError(400, "참여할 학원을 선택해주세요.");
  }
  await assertTeacherAccount(teacherUserId);
  const currentStaff = await AcademyStaff.findOne({
    userId: teacherUserId,
    status: { $in: ["PENDING", "ACTIVE"] },
  })
    .populate("academyId", "name")
    .lean();
  if (currentStaff) {
    const academyName = currentStaff.academyId?.name || "현재 학원";
    throw statusError(
      409,
      currentStaff.status === "PENDING"
        ? `${academyName} 참여 승인을 기다리고 있습니다.`
        : `${academyName}에 이미 소속되어 있습니다.`
    );
  }

  const academy = await Academy.findOne({ _id: academyId, status: "ACTIVE" }).lean();
  if (!academy) throw statusError(404, "선택한 학원을 찾을 수 없습니다.");
  const now = new Date();
  return AcademyStaff.findOneAndUpdate(
    { academyId: academy._id, userId: teacherUserId },
    {
      $set: {
        role: "TEACHER",
        status: "PENDING",
        currentStaffKey: String(teacherUserId),
        requestedAt: now,
        reviewedAt: null,
        reviewedByUserId: null,
        joinedAt: null,
        rejectedAt: null,
        revokedAt: null,
      },
      $setOnInsert: { academyId: academy._id, userId: teacherUserId },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  )
    .lean()
    .catch((error) => {
      if (error?.code === 11000) {
        throw statusError(409, "이미 다른 학원에 연결되었거나 참여 승인을 기다리고 있습니다.");
      }
      throw error;
    });
}

async function cancelAcademyStaffJoin({ teacherUserId }) {
  const request = await AcademyStaff.findOneAndUpdate(
    { userId: teacherUserId, status: "PENDING" },
    {
      $set: { status: "REVOKED", revokedAt: new Date() },
      $unset: { currentStaffKey: 1 },
    },
    { returnDocument: "before" }
  )
    .populate("academyId", "name")
    .lean();
  if (!request) throw statusError(404, "취소할 학원 참여 요청이 없습니다.");
  return request;
}

async function getAcademyOwnerContext(teacherUserId) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (context.staff.role !== "OWNER") {
    throw statusError(403, "학원 원장 계정만 선생님 소속을 관리할 수 있습니다.");
  }
  return context;
}

async function approveAcademyStaff({ teacherUserId, staffId }) {
  const context = await getAcademyOwnerContext(teacherUserId);
  if (!mongoose.isValidObjectId(staffId)) throw statusError(404, "선생님 참여 요청을 찾을 수 없습니다.");
  const request = await AcademyStaff.findOne({
    _id: staffId,
    academyId: context.academyId,
    status: "PENDING",
  }).lean();
  if (!request) throw statusError(404, "처리할 선생님 참여 요청을 찾을 수 없습니다.");
  try {
    await assertTeacherAccount(request.userId);
  } catch (error) {
    if (Number(error.status) === 403) {
      throw statusError(409, "이 계정은 현재 교사 역할이 아닙니다. 운영자에게 역할 상태를 확인해 주세요.");
    }
    throw error;
  }
  const now = new Date();
  return AcademyStaff.findOneAndUpdate(
    { _id: request._id, status: "PENDING" },
    {
      $set: {
        status: "ACTIVE",
        role: "TEACHER",
        joinedAt: now,
        reviewedAt: now,
        reviewedByUserId: teacherUserId,
        rejectedAt: null,
        revokedAt: null,
      },
    },
    { returnDocument: "after" }
  ).lean();
}

async function rejectAcademyStaff({ teacherUserId, staffId }) {
  const context = await getAcademyOwnerContext(teacherUserId);
  if (!mongoose.isValidObjectId(staffId)) throw statusError(404, "선생님 참여 요청을 찾을 수 없습니다.");
  const now = new Date();
  const request = await AcademyStaff.findOneAndUpdate(
    { _id: staffId, academyId: context.academyId, status: "PENDING" },
    {
      $set: {
        status: "REJECTED",
        rejectedAt: now,
        reviewedAt: now,
        reviewedByUserId: teacherUserId,
      },
      $unset: { currentStaffKey: 1 },
    },
    { returnDocument: "after" }
  ).lean();
  if (!request) throw statusError(404, "처리할 선생님 참여 요청을 찾을 수 없습니다.");
  return request;
}

async function revokeAcademyStaff({ teacherUserId, staffId }) {
  const context = await getAcademyOwnerContext(teacherUserId);
  if (!mongoose.isValidObjectId(staffId)) throw statusError(404, "선생님 소속을 찾을 수 없습니다.");
  const staff = await AcademyStaff.findOneAndUpdate(
    {
      _id: staffId,
      academyId: context.academyId,
      status: "ACTIVE",
      role: "TEACHER",
    },
    {
      $set: { status: "REVOKED", revokedAt: new Date() },
      $unset: { currentStaffKey: 1 },
    },
    { returnDocument: "after" }
  ).lean();
  if (!staff) throw statusError(404, "해제할 선생님 소속을 찾을 수 없습니다.");
  return staff;
}

async function getStudentAcademyProfile(studentUserId) {
  const [membership, academies] = await Promise.all([
    AcademyStudentMembership.findOne({
      studentUserId,
      status: { $in: ["PENDING", "APPROVED"] },
    })
      .sort({ requestedAt: -1 })
      .populate("academyId", "name status")
      .populate("classId", "name isActive")
      .lean(),
    Academy.find({ status: "ACTIVE" })
      .sort({ name: 1, _id: 1 })
      .select("name")
      .lean(),
  ]);

  return { membership, academies };
}

async function assertStudent(studentUserId) {
  const student = await User.findById(studentUserId)
    .select("role isActive accountStatus")
    .lean();
  if (!student || !["student", "test"].includes(student.role) || student.isActive === false || student.accountStatus === "withdrawn") {
    throw statusError(403, "학생 계정에서만 학원 소속을 등록할 수 있습니다.");
  }
  return student;
}

async function assertNoCurrentMembership(studentUserId, academyId) {
  const current = await AcademyStudentMembership.findOne({
    studentUserId,
    status: { $in: ["PENDING", "APPROVED"] },
  })
    .populate("academyId", "name")
    .lean();
  if (!current) return;

  const isSameAcademy = String(current.academyId?._id || current.academyId) === String(academyId);
  const academyName = current.academyId?.name || "현재 학원";
  if (current.status === "APPROVED") {
    throw statusError(409, `${academyName} 소속으로 이미 승인되어 있습니다.`);
  }
  throw statusError(
    409,
    isSameAcademy
      ? `${academyName}의 승인을 기다리고 있습니다.`
      : `${academyName} 승인 요청을 먼저 취소해주세요.`
  );
}

async function saveMembershipRequest({
  studentUserId,
  academyId,
  joinSource,
  inviteId = null,
  classId = null,
  consent,
  now = new Date(),
}) {
  if (consent !== true && consent !== "1" && consent !== "on") {
    throw statusError(400, "학원에 학습 현황을 공유하는 데 동의해주세요.");
  }
  await assertStudent(studentUserId);
  await assertNoCurrentMembership(studentUserId, academyId);

  const academy = await Academy.findOne({ _id: academyId, status: "ACTIVE" }).lean();
  if (!academy) throw statusError(404, "선택한 학원을 찾을 수 없습니다.");

  return AcademyStudentMembership.findOneAndUpdate(
    { academyId: academy._id, studentUserId },
    {
      $set: {
        status: "PENDING",
        activeStudentKey: String(studentUserId),
        classId: classId || null,
        joinSource,
        inviteId: inviteId || null,
        requestedAt: now,
        dataConsentAt: now,
        reviewedAt: null,
        reviewedByUserId: null,
        approvedAt: null,
        rejectedAt: null,
        leftAt: null,
      },
      $setOnInsert: { academyId: academy._id, studentUserId },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  )
    .lean()
    .catch((error) => {
      if (error?.code === 11000) {
        throw statusError(409, "이미 진행 중인 학원 소속 요청이 있습니다.");
      }
      throw error;
    });
}

async function requestAcademyFromProfile({ studentUserId, academyId, consent }) {
  if (!mongoose.isValidObjectId(academyId)) {
    throw statusError(400, "등록할 학원을 선택해주세요.");
  }
  return saveMembershipRequest({
    studentUserId,
    academyId,
    joinSource: "PROFILE",
    consent,
  });
}

async function claimInvite(filter) {
  return AcademyInvite.findOneAndUpdate(
    { ...filter, ...activeInviteFilter() },
    { $inc: { useCount: 1 } },
    { returnDocument: "after" }
  ).lean();
}

async function requestAcademyWithInvite({ studentUserId, inviteFilter, joinSource, consent }) {
  const candidate = await AcademyInvite.findOne(inviteFilter).lean();
  if (!candidate || inviteState(candidate) !== "ACTIVE") {
    throw statusError(410, "초대가 만료되었거나 더 이상 사용할 수 없습니다.");
  }
  await assertStudent(studentUserId);
  await assertNoCurrentMembership(studentUserId, candidate.academyId);

  const invite = await claimInvite({ _id: candidate._id });
  if (!invite) throw statusError(410, "초대 사용 가능 횟수가 모두 소진되었습니다.");

  try {
    return await saveMembershipRequest({
      studentUserId,
      academyId: invite.academyId,
      joinSource,
      inviteId: invite._id,
      classId: invite.classId,
      consent,
    });
  } catch (error) {
    await AcademyInvite.updateOne(
      { _id: invite._id, useCount: { $gt: 0 } },
      { $inc: { useCount: -1 } }
    ).catch(() => {});
    throw error;
  }
}

async function requestAcademyByCode({ studentUserId, code, consent }) {
  const inviteCode = normalizedInviteCode(code);
  if (!/^MTH-[A-Z2-9]{6}$/.test(inviteCode)) {
    throw statusError(400, "초대 코드는 MTH-XXXXXX 형식으로 입력해주세요.");
  }
  return requestAcademyWithInvite({
    studentUserId,
    inviteFilter: { code: inviteCode },
    joinSource: "INVITE_CODE",
    consent,
  });
}

async function getAcademyInvitePresentation(token) {
  const invite = await AcademyInvite.findOne({ token: String(token || "").trim() })
    .populate("academyId", "name status")
    .populate("classId", "name isActive")
    .lean();
  if (!invite || !invite.academyId || invite.academyId.status !== "ACTIVE" || inviteState(invite) !== "ACTIVE") {
    throw statusError(410, "초대가 만료되었거나 더 이상 사용할 수 없습니다.");
  }
  return invite;
}

async function requestAcademyByToken({ studentUserId, token, consent }) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) throw statusError(400, "올바른 초대 링크가 아닙니다.");
  return requestAcademyWithInvite({
    studentUserId,
    inviteFilter: { token: normalizedToken },
    joinSource: "INVITE_LINK",
    consent,
  });
}

async function leaveAcademy({ studentUserId }) {
  const membership = await AcademyStudentMembership.findOneAndUpdate(
    { studentUserId, status: { $in: ["PENDING", "APPROVED"] } },
    {
      $set: { status: "LEFT", classId: null, leftAt: new Date() },
      $unset: { activeStudentKey: 1 },
    },
    { returnDocument: "before" }
  )
    .populate("academyId", "name")
    .lean();
  if (!membership) throw statusError(404, "취소하거나 해제할 학원 소속이 없습니다.");
  return membership;
}

async function getAcademyPortalData(teacherUserId, { includeStudents = true } = {}) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const academyId = context.academyId;
  const [classes, students, requests, invites, activeStaff, staffRequests] = await Promise.all([
    AcademyClass.find({ academyId, isActive: true }).sort({ name: 1, _id: 1 }).lean(),
    includeStudents
      ? AcademyStudentMembership.find({ academyId, status: "APPROVED" })
          .sort({ approvedAt: -1, _id: 1 })
          .populate("studentUserId", STUDENT_FIELDS)
          .populate("classId", "name isActive")
          .lean()
      : Promise.resolve([]),
    AcademyStudentMembership.find({ academyId, status: "PENDING" })
      .sort({ requestedAt: 1, _id: 1 })
      .populate("studentUserId", STUDENT_FIELDS)
      .populate("classId", "name isActive")
      .lean(),
    AcademyInvite.find({ academyId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("classId", "name isActive")
      .lean(),
    AcademyStaff.find({ academyId, status: "ACTIVE" })
      .sort({ role: 1, joinedAt: 1, createdAt: 1 })
      .populate("userId", STAFF_FIELDS)
      .lean(),
    context.staff.role === "OWNER"
      ? AcademyStaff.find({ academyId, status: "PENDING" })
          .sort({ requestedAt: 1, _id: 1 })
          .populate("userId", STAFF_FIELDS)
          .lean()
      : Promise.resolve([]),
  ]);

  const now = new Date();
  return {
    academy: context.academy,
    staff: context.staff,
    classes,
    students: students.filter((entry) => entry.studentUserId),
    requests: requests.filter((entry) => entry.studentUserId),
    invites: invites.map((invite) => ({ ...invite, displayState: inviteState(invite, now) })),
    activeStaff: activeStaff.filter((entry) => entry.userId),
    staffRequests: staffRequests.filter((entry) => entry.userId),
    isOwner: context.staff.role === "OWNER",
    staffPendingCount: staffRequests.filter((entry) => entry.userId).length,
    pendingCount: requests.length,
  };
}

async function getAcademyStudentPage({ teacherUserId, page = 1 }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const query = { academyId: context.academyId, status: "APPROVED" };
  const total = await AcademyStudentMembership.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / ACADEMY_STUDENT_PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePage = Math.min(requestedPage, totalPages);
  const students = await AcademyStudentMembership.find(query)
    .sort({ approvedAt: -1, _id: 1 })
    .skip((safePage - 1) * ACADEMY_STUDENT_PAGE_SIZE)
    .limit(ACADEMY_STUDENT_PAGE_SIZE)
    .populate("studentUserId", STUDENT_FIELDS)
    .populate("classId", "name isActive")
    .lean();

  return {
    students: students.filter((entry) => entry.studentUserId),
    page: safePage,
    pageSize: ACADEMY_STUDENT_PAGE_SIZE,
    total,
    totalPages,
  };
}

async function approveMembership({ teacherUserId, membershipId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (!mongoose.isValidObjectId(membershipId)) throw statusError(404, "승인 요청을 찾을 수 없습니다.");
  const now = new Date();
  const membership = await AcademyStudentMembership.findOneAndUpdate(
    { _id: membershipId, academyId: context.academyId, status: "PENDING" },
    {
      $set: {
        status: "APPROVED",
        approvedAt: now,
        reviewedAt: now,
        reviewedByUserId: teacherUserId,
        rejectedAt: null,
      },
    },
    { returnDocument: "after" }
  ).lean();
  if (!membership) throw statusError(404, "처리할 승인 요청을 찾을 수 없습니다.");
  return membership;
}

async function rejectMembership({ teacherUserId, membershipId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (!mongoose.isValidObjectId(membershipId)) throw statusError(404, "승인 요청을 찾을 수 없습니다.");
  const now = new Date();
  const membership = await AcademyStudentMembership.findOneAndUpdate(
    { _id: membershipId, academyId: context.academyId, status: "PENDING" },
    {
      $set: {
        status: "REJECTED",
        classId: null,
        rejectedAt: now,
        reviewedAt: now,
        reviewedByUserId: teacherUserId,
        approvedAt: null,
      },
      $unset: { activeStudentKey: 1 },
    },
    { returnDocument: "after" }
  ).lean();
  if (!membership) throw statusError(404, "처리할 승인 요청을 찾을 수 없습니다.");
  return membership;
}

async function assignMembershipClass({ teacherUserId, membershipId, classId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (!mongoose.isValidObjectId(membershipId)) throw statusError(404, "학생 소속을 찾을 수 없습니다.");
  let assignedClassId = null;
  if (classId) {
    if (!mongoose.isValidObjectId(classId)) throw statusError(400, "올바른 반을 선택해주세요.");
    const academyClass = await AcademyClass.findOne({
      _id: classId,
      academyId: context.academyId,
      isActive: true,
    }).lean();
    if (!academyClass) throw statusError(404, "선택한 반을 찾을 수 없습니다.");
    assignedClassId = academyClass._id;
  }
  const membership = await AcademyStudentMembership.findOneAndUpdate(
    { _id: membershipId, academyId: context.academyId, status: "APPROVED" },
    { $set: { classId: assignedClassId } },
    { returnDocument: "after" }
  ).lean();
  if (!membership) throw statusError(404, "반을 배정할 학생을 찾을 수 없습니다.");
  return membership;
}

async function bulkManageAcademyStudents({
  teacherUserId,
  membershipIds,
  action,
  classId,
}) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const rawIds = Array.isArray(membershipIds) ? membershipIds : [membershipIds];
  const normalizedIds = [...new Set(rawIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!normalizedIds.length) {
    throw statusError(400, "관리할 학생을 한 명 이상 선택해 주세요.");
  }
  if (normalizedIds.length > ACADEMY_STUDENT_BULK_LIMIT) {
    throw statusError(400, `학생은 한 번에 최대 ${ACADEMY_STUDENT_BULK_LIMIT}명까지 관리할 수 있습니다.`);
  }
  if (normalizedIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw statusError(400, "올바르지 않은 학생 선택이 포함되어 있습니다.");
  }

  const normalizedAction = String(action || "").trim().toUpperCase();
  if (!["ASSIGN_CLASS", "UNASSIGN_CLASS", "REMOVE"].includes(normalizedAction)) {
    throw statusError(400, "일괄 작업을 선택해 주세요.");
  }

  const membershipObjectIds = normalizedIds.map((id) => new mongoose.Types.ObjectId(id));
  const membershipFilter = {
    _id: { $in: membershipObjectIds },
    academyId: context.academyId,
    status: "APPROVED",
  };
  const matchedMemberships = await AcademyStudentMembership.countDocuments(membershipFilter);
  if (matchedMemberships !== membershipObjectIds.length) {
    throw statusError(409, "선택한 학생 중 현재 학원에서 관리할 수 없는 학생이 있습니다. 목록을 새로고침해 주세요.");
  }

  let update;
  if (normalizedAction === "ASSIGN_CLASS") {
    if (!mongoose.isValidObjectId(classId)) {
      throw statusError(400, "배정할 반을 선택해 주세요.");
    }
    const academyClass = await AcademyClass.findOne({
      _id: classId,
      academyId: context.academyId,
      isActive: true,
    }).lean();
    if (!academyClass) throw statusError(404, "선택한 반을 찾을 수 없습니다.");
    update = { $set: { classId: academyClass._id } };
  } else if (normalizedAction === "UNASSIGN_CLASS") {
    update = { $set: { classId: null } };
  } else {
    const now = new Date();
    update = {
      $set: {
        status: "LEFT",
        classId: null,
        leftAt: now,
        reviewedAt: now,
        reviewedByUserId: teacherUserId,
      },
      $unset: { activeStudentKey: 1 },
    };
  }

  const result = await AcademyStudentMembership.updateMany(membershipFilter, update);
  if (Number(result.matchedCount) !== membershipObjectIds.length) {
    throw statusError(409, "학생 소속이 변경되어 일괄 작업을 완료하지 못했습니다. 목록을 새로고침해 주세요.");
  }
  return {
    action: normalizedAction,
    count: membershipObjectIds.length,
    modifiedCount: Number(result.modifiedCount),
  };
}

async function createAcademyClass({ teacherUserId, name }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const className = normalizeName(name);
  if (className.length < 1 || className.length > 40) {
    throw statusError(400, "반 이름은 1자 이상 40자 이하로 입력해주세요.");
  }
  const nameNormalized = className.toLocaleLowerCase("ko-KR");
  const existing = await AcademyClass.findOne({ academyId: context.academyId, nameNormalized });
  if (existing) {
    if (existing.isActive) throw statusError(409, "같은 이름의 반이 이미 있습니다.");
    existing.name = className;
    existing.isActive = true;
    await existing.save();
    return existing.toObject();
  }
  return (
    await AcademyClass.create({
      academyId: context.academyId,
      name: className,
      nameNormalized,
      createdByUserId: teacherUserId,
    })
  ).toObject();
}

function randomInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let index = 0; index < 6; index += 1) code += alphabet[bytes[index] % alphabet.length];
  return `MTH-${code}`;
}

async function createAcademyInvite({ teacherUserId, label, classId, expiryDays, maxUses }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  const inviteLabel = normalizeName(label) || "학생 초대";
  if (inviteLabel.length > 60) throw statusError(400, "초대 이름은 60자 이하로 입력해주세요.");

  let assignedClassId = null;
  if (classId) {
    if (!mongoose.isValidObjectId(classId)) throw statusError(400, "올바른 반을 선택해주세요.");
    const academyClass = await AcademyClass.findOne({
      _id: classId,
      academyId: context.academyId,
      isActive: true,
    }).lean();
    if (!academyClass) throw statusError(404, "선택한 반을 찾을 수 없습니다.");
    assignedClassId = academyClass._id;
  }

  const days = [7, 14, 30].includes(Number(expiryDays)) ? Number(expiryDays) : 14;
  const usageLimit = Math.max(1, Math.min(200, Math.floor(Number(maxUses) || 30)));
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const invite = await AcademyInvite.create({
        academyId: context.academyId,
        createdByUserId: teacherUserId,
        label: inviteLabel,
        token: randomBytes(24).toString("base64url"),
        code: randomInviteCode(),
        classId: assignedClassId,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        maxUses: usageLimit,
      });
      return invite.toObject();
    } catch (error) {
      lastError = error;
      if (error?.code !== 11000) throw error;
    }
  }
  throw lastError || statusError(500, "초대를 만들지 못했습니다.");
}

async function revokeAcademyInvite({ teacherUserId, inviteId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (!mongoose.isValidObjectId(inviteId)) throw statusError(404, "초대를 찾을 수 없습니다.");
  const invite = await AcademyInvite.findOneAndUpdate(
    { _id: inviteId, academyId: context.academyId, status: "ACTIVE" },
    { $set: { status: "REVOKED" } },
    { returnDocument: "after" }
  ).lean();
  if (!invite) throw statusError(404, "활성 초대를 찾을 수 없습니다.");
  return invite;
}

async function getAcademyStudentDetail({ teacherUserId, membershipId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (!mongoose.isValidObjectId(membershipId)) throw statusError(404, "학생을 찾을 수 없습니다.");
  const membership = await AcademyStudentMembership.findOne({
    _id: membershipId,
    academyId: context.academyId,
    status: "APPROVED",
  })
    .populate("studentUserId", STUDENT_FIELDS)
    .populate("classId", "name isActive")
    .lean();
  if (!membership?.studentUserId) throw statusError(404, "승인된 학생을 찾을 수 없습니다.");
  return { academy: context.academy, membership, pendingCount: await AcademyStudentMembership.countDocuments({ academyId: context.academyId, status: "PENDING" }) };
}

module.exports = {
  ACADEMY_STUDENT_BULK_LIMIT,
  ACADEMY_STUDENT_PAGE_SIZE,
  STAFF_FIELDS,
  STUDENT_FIELDS,
  approveAcademyApplication,
  approveAcademyStaff,
  approveMembership,
  assignMembershipClass,
  bulkManageAcademyStudents,
  cancelAcademyStaffJoin,
  createAcademyClass,
  createAcademyForTeacher,
  createAcademyInvite,
  ensureAcademyIndexes,
  getAcademyInvitePresentation,
  getAcademyPortalData,
  getAcademyOwnerContext,
  getAcademyStudentPage,
  getAcademyStudentDetail,
  getStudentAcademyProfile,
  getTeacherAcademySetupData,
  getTeacherAcademyContext,
  leaveAcademy,
  rejectAcademyStaff,
  rejectAcademyApplication,
  rejectMembership,
  requestAcademyStaffJoin,
  requestAcademyByCode,
  requestAcademyByToken,
  requestAcademyFromProfile,
  revokeAcademyStaff,
  revokeAcademyInvite,
};
