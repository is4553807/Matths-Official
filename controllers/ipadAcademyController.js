const {
  approveAcademyApplication,
  approveAcademyStaff,
  approveMembership,
  archiveAcademyClass,
  assignMembershipClass,
  createAcademyClass,
  createAcademyInvite,
  getAcademyPortalData,
  getStudentAcademyProfile,
  leaveAcademy,
  rejectAcademyApplication,
  rejectAcademyStaff,
  rejectMembership,
  requestAcademyByCode,
  requestAcademyFromProfile,
  restoreAcademyClass,
  revokeAcademyInvite,
  revokeAcademyStaff,
  updateAcademyClassSettings,
} = require("../services/academyService");
const {
  getAdminAcademyList,
} = require("../services/adminAcademyService");
const {
  deleteAcademyClassWeek,
  getAcademyClassworkTeacherView,
  getStudentAcademyClassroom,
  getStudentAcademyWeek,
  getStudentAcademyWeekFileDownload,
  getTeacherAcademyWeekFileDownload,
  removeAcademyClassWeekFile,
  saveAcademyClassWeek,
} = require("../services/academyClassworkService");
const {
  checkInStudentAttendance,
  getAcademyAttendanceRoster,
  getStudentAttendanceDashboard,
  regenerateAttendanceSessionCode,
  saveAcademyAttendanceRoster,
} = require("../services/academyAttendanceService");
const { discardRequestUploads } = require("../middleware/uploadContentValidation");

function identifier(value) {
  if (value === null || value === undefined) return null;
  return String(value._id || value);
}

function serializeAcademy(academy) {
  if (!academy) return null;
  return {
    id: identifier(academy),
    name: String(academy.name || ""),
    status: academy.status || null,
  };
}

function serializeClass(academyClass) {
  if (!academyClass) return null;
  return {
    id: identifier(academyClass),
    name: String(academyClass.name || ""),
    schedule: academyClass.schedule || null,
    attendancePolicy: academyClass.attendancePolicy || null,
    isActive: academyClass.isActive !== false,
  };
}

function serializeMembership(membership) {
  if (!membership) return null;
  return {
    id: identifier(membership),
    status: membership.status,
    joinSource: membership.joinSource || null,
    requestedAt: membership.requestedAt || null,
    approvedAt: membership.approvedAt || null,
  };
}

function serializePerson(user) {
  if (!user) return null;
  return {
    id: identifier(user),
    name: String(user.realName || user.name || ""),
    nickname: user.realName && user.name && user.realName !== user.name
      ? String(user.name)
      : null,
    schoolGrade: user.schoolGrade || null,
    school: user.school
      ? { name: String(user.school.name || ""), region: String(user.school.region || "") }
      : null,
  };
}

function serializeTeacherMembership(membership) {
  return {
    id: identifier(membership),
    student: serializePerson(membership.studentUserId),
    academyClass: serializeClass(membership.classId),
    requestedAt: membership.requestedAt || null,
    approvedAt: membership.approvedAt || null,
  };
}

function serializeAdminAcademyApplication(academy) {
  const applicant = academy.createdByUserId || null;
  return {
    id: identifier(academy),
    name: String(academy.name || ""),
    status: String(academy.status || "PENDING"),
    createdAt: academy.createdAt || null,
    contractStartsAt: academy.contractStartsAt || null,
    contractEndsAt: academy.contractEndsAt || null,
    includesMockExam: academy.includesMockExam !== false,
    applicant: applicant ? {
      id: identifier(applicant),
      name: String(applicant.realName || applicant.name || ""),
      email: String(applicant.email || ""),
      accountStatus: String(
        applicant.accountStatus || (applicant.isActive === false ? "inactive" : "active")
      ),
    } : null,
  };
}

function serializeInvite(invite) {
  return {
    id: identifier(invite),
    label: String(invite.label || "학생 초대"),
    code: String(invite.code || ""),
    academyClass: serializeClass(invite.classId),
    displayState: String(invite.displayState || invite.status || ""),
    useCount: Number(invite.useCount || 0),
    maxUses: Number(invite.maxUses || 0),
    expiresAt: invite.expiresAt || null,
  };
}

function serializeTeacherStaff(staff) {
  const user = staff?.userId || null;
  return {
    id: identifier(staff),
    user: user ? {
      id: identifier(user),
      name: String(user.realName || user.name || ""),
      email: String(user.email || ""),
    } : null,
    role: String(staff?.role || "TEACHER"),
    status: String(staff?.status || ""),
    requestedAt: staff?.requestedAt || null,
    joinedAt: staff?.joinedAt || null,
  };
}

function serializeTeacherAttendance(roster) {
  return {
    dateKey: roster.dateKey,
    todayKey: roster.todayKey,
    classes: (roster.classes || []).map(serializeClass),
    selectedClass: serializeClass(roster.selectedClass),
    session: roster.session || null,
    roster: (roster.roster || []).map((item) => ({
      id: identifier(item.membership),
      student: serializePerson(item.membership?.studentUserId),
      attendance: item.attendance
        ? {
            status: String(item.attendance.status || ""),
            checkedInAt: item.attendance.checkedInAt || null,
            source: item.attendance.source || null,
            note: String(item.attendance.note || ""),
          }
        : null,
    })),
    counts: roster.counts,
    truncated: roster.truncated === true,
  };
}

function serializeClassworkCatalog(catalog) {
  return (catalog || []).map((course) => ({
    id: String(course.id || ""),
    title: String(course.title || ""),
    units: (course.units || []).map((unit) => ({
      id: String(unit.id || ""),
      title: String(unit.title || ""),
      concepts: (unit.concepts || []).map((concept) => ({
        key: String(concept.key || ""),
        curriculumId: String(concept.curriculumId || ""),
        courseId: String(concept.courseId || ""),
        courseTitle: String(concept.courseTitle || course.title || ""),
        unitId: String(concept.unitId || ""),
        unitTitle: String(concept.unitTitle || unit.title || ""),
        conceptId: String(concept.conceptId || ""),
        conceptTitle: String(concept.conceptTitle || ""),
      })),
    })),
  }));
}

function serializeTeacherClasswork(academyClass, classwork) {
  return {
    academyClass: serializeClass(academyClass),
    currentAcademicYear: Number(classwork.currentAcademicYear),
    weeks: (classwork.weeks || []).map(serializeWeek),
    catalog: serializeClassworkCatalog(classwork.catalog),
  };
}

function serializeWeek(week) {
  return {
    id: identifier(week),
    academicYear: Number(week.academicYear),
    weekNumber: Number(week.weekNumber),
    title: String(week.title || ""),
    lessonSummary: String(week.lessonSummary || ""),
    concepts: (week.concepts || []).map((concept) => ({
      curriculumId: concept.curriculumId,
      courseId: concept.courseId,
      courseTitle: concept.courseTitle,
      unitId: concept.unitId,
      unitTitle: concept.unitTitle,
      conceptId: concept.conceptId,
      conceptTitle: concept.conceptTitle,
      href: concept.href,
    })),
    assignmentTitle: String(week.assignmentTitle || ""),
    assignmentInstructions: String(week.assignmentInstructions || ""),
    dueAt: week.dueAt || null,
    files: (week.files || []).map((file) => ({
      id: identifier(file),
      originalName: String(file.originalName || ""),
      mimeType: String(file.mimeType || "application/octet-stream"),
      sizeBytes: Number(file.sizeBytes || 0),
    })),
  };
}

async function dashboardPayload(userId) {
  const profile = await getStudentAcademyProfile(userId);
  const membership = profile.membership || null;
  let classroom = null;
  let attendance = null;
  if (membership?.status === "APPROVED") {
    [classroom, attendance] = await Promise.all([
      getStudentAcademyClassroom({ studentUserId: userId }),
      getStudentAttendanceDashboard({ studentUserId: userId }),
    ]);
  }
  return {
    membership: serializeMembership(membership),
    academy: serializeAcademy(classroom?.academy || membership?.academyId),
    academyClass: serializeClass(classroom?.academyClass || membership?.classId),
    weeks: (classroom?.weeks || []).map(serializeWeek),
    attendance,
    academies: (profile.academies || []).map(serializeAcademy),
  };
}

async function teacherDashboardPayload(userId) {
  const portal = await getAcademyPortalData(userId, { includeStudents: true });
  const studentCountByClass = new Map();
  for (const membership of portal.students) {
    const classId = identifier(membership.classId);
    if (classId) studentCountByClass.set(classId, (studentCountByClass.get(classId) || 0) + 1);
  }
  return {
    academy: serializeAcademy(portal.academy),
    staffRole: portal.staff.role,
    isOwner: portal.isOwner,
    pendingCount: portal.pendingCount,
    studentCount: portal.students.length,
    classes: portal.classes.map((academyClass) => ({
      ...serializeClass(academyClass),
      studentCount: studentCountByClass.get(identifier(academyClass)) || 0,
      canManage: portal.isOwner
        || identifier(academyClass.homeroomTeacherUserId) === String(userId)
        || (academyClass.coTeacherUserIds || []).some((teacher) => identifier(teacher) === String(userId)),
    })),
    archivedClasses: portal.archivedClasses.map(serializeClass),
    requests: portal.requests.map(serializeTeacherMembership),
    students: portal.students.slice(0, 50).map(serializeTeacherMembership),
    invites: portal.invites.slice(0, 20).map(serializeInvite),
    staffPendingCount: Number(portal.staffPendingCount || 0),
    activeStaff: portal.activeStaff.map(serializeTeacherStaff),
    staffRequests: portal.staffRequests.map(serializeTeacherStaff),
  };
}

async function adminDashboardPayload(userId) {
  const result = await getAdminAcademyList({
    adminUserId: userId,
    status: "PENDING",
    page: 1,
  });
  return {
    pendingCount: Number(result.statusCounts.PENDING || 0),
    activeCount: Number(result.statusCounts.ACTIVE || 0),
    applications: result.academies.map(serializeAdminAcademyApplication),
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.json(await dashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.teacherDashboard = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.adminDashboard = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.json(await adminDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.approveAcademy = async (req, res, next) => {
  try {
    await approveAcademyApplication({
      adminUserId: req.apiUser._id,
      academyId: req.params.academyId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await adminDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.rejectAcademy = async (req, res, next) => {
  try {
    await rejectAcademyApplication({
      adminUserId: req.apiUser._id,
      academyId: req.params.academyId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await adminDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.approveStudent = async (req, res, next) => {
  try {
    await approveMembership({
      teacherUserId: req.apiUser._id,
      membershipId: req.params.membershipId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.rejectStudent = async (req, res, next) => {
  try {
    await rejectMembership({
      teacherUserId: req.apiUser._id,
      membershipId: req.params.membershipId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.assignStudentClass = async (req, res, next) => {
  try {
    await assignMembershipClass({
      teacherUserId: req.apiUser._id,
      membershipId: req.params.membershipId,
      classId: req.body.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.createInvite = async (req, res, next) => {
  try {
    await createAcademyInvite({
      teacherUserId: req.apiUser._id,
      label: req.body.label,
      classId: req.body.classId,
      expiryDays: req.body.expiryDays,
      maxUses: req.body.maxUses,
    });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.revokeInvite = async (req, res, next) => {
  try {
    await revokeAcademyInvite({
      teacherUserId: req.apiUser._id,
      inviteId: req.params.inviteId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.approveTeacherStaff = async (req, res, next) => {
  try {
    await approveAcademyStaff({
      teacherUserId: req.apiUser._id,
      staffId: req.params.staffId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.rejectTeacherStaff = async (req, res, next) => {
  try {
    await rejectAcademyStaff({
      teacherUserId: req.apiUser._id,
      staffId: req.params.staffId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.revokeTeacherStaff = async (req, res, next) => {
  try {
    await revokeAcademyStaff({
      teacherUserId: req.apiUser._id,
      staffId: req.params.staffId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

function classSettingsInput(req) {
  return {
    teacherUserId: req.apiUser._id,
    classId: req.params.classId,
    weekdays: req.body.weekdays,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    effectiveFrom: req.body.effectiveFrom,
    attendanceMode: req.body.attendanceMode,
    opensBeforeMinutes: req.body.opensBeforeMinutes,
    lateAfterMinutes: req.body.lateAfterMinutes,
    closesAfterMinutes: req.body.closesAfterMinutes,
  };
}

exports.createTeacherClass = async (req, res, next) => {
  try {
    const input = classSettingsInput(req);
    await createAcademyClass({ ...input, classId: undefined, name: req.body.name });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.updateTeacherClass = async (req, res, next) => {
  try {
    await updateAcademyClassSettings(classSettingsInput(req));
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.archiveTeacherClass = async (req, res, next) => {
  try {
    await archiveAcademyClass({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.restoreTeacherClass = async (req, res, next) => {
  try {
    await restoreAcademyClass({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.teacherAttendance = async (req, res, next) => {
  try {
    const roster = await getAcademyAttendanceRoster({
      teacherUserId: req.apiUser._id,
      dateKey: req.query.dateKey,
      classId: req.query.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherAttendance(roster));
  } catch (error) {
    return next(error);
  }
};

exports.saveTeacherAttendance = async (req, res, next) => {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    await saveAcademyAttendanceRoster({
      teacherUserId: req.apiUser._id,
      dateKey: req.body.dateKey,
      classId: req.body.classId,
      sessionId: req.body.sessionId,
      studentUserIds: records.map((record) => record?.studentUserId),
      statuses: records.map((record) => record?.status),
      notes: records.map((record) => record?.note),
    });
    const roster = await getAcademyAttendanceRoster({
      teacherUserId: req.apiUser._id,
      dateKey: req.body.dateKey,
      classId: req.body.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherAttendance(roster));
  } catch (error) {
    return next(error);
  }
};

exports.regenerateTeacherAttendanceCode = async (req, res, next) => {
  try {
    const session = await regenerateAttendanceSessionCode({
      teacherUserId: req.apiUser._id,
      sessionId: req.params.sessionId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ session });
  } catch (error) {
    return next(error);
  }
};

exports.teacherClasswork = async (req, res, next) => {
  try {
    const classwork = await getAcademyClassworkTeacherView({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherClasswork(classwork.academyClass, classwork));
  } catch (error) {
    return next(error);
  }
};

exports.saveTeacherClassWeek = async (req, res, next) => {
  try {
    if (req.academyAssignmentUploadError) throw req.academyAssignmentUploadError;
    await saveAcademyClassWeek({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      weekId: req.body.weekId,
      academicYear: req.body.academicYear,
      weekNumber: req.body.weekNumber,
      title: req.body.title,
      lessonSummary: req.body.lessonSummary,
      conceptKeys: req.body.conceptKeys,
      assignmentTitle: req.body.assignmentTitle,
      assignmentInstructions: req.body.assignmentInstructions,
      dueAt: req.body.dueAt,
      files: req.files || [],
    });
    const classwork = await getAcademyClassworkTeacherView({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherClasswork(classwork.academyClass, classwork));
  } catch (error) {
    return next(error);
  } finally {
    await discardRequestUploads(req);
  }
};

exports.removeTeacherClassWeekFile = async (req, res, next) => {
  try {
    await removeAcademyClassWeekFile({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    const classwork = await getAcademyClassworkTeacherView({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherClasswork(classwork.academyClass, classwork));
  } catch (error) {
    return next(error);
  }
};

exports.deleteTeacherClassWeek = async (req, res, next) => {
  try {
    await deleteAcademyClassWeek({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      weekId: req.params.weekId,
    });
    const classwork = await getAcademyClassworkTeacherView({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherClasswork(classwork.academyClass, classwork));
  } catch (error) {
    return next(error);
  }
};

exports.downloadTeacherClassWeekFile = async (req, res, next) => {
  try {
    const download = await getTeacherAcademyWeekFileDownload({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    if (download.type === "REDIRECT") {
      res.set("Cache-Control", "private, no-store");
      return res.redirect(302, download.url);
    }
    const issued = download.issued;
    const cleanup = () => issued.cleanup().catch(() => {});
    res.once("finish", cleanup);
    res.once("close", cleanup);
    res.type("application/pdf");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Matths-Trace", issued.traceCode);
    return res.download(issued.filePath, issued.downloadName, (error) => {
      cleanup();
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) {
    return next(error);
  }
};

exports.week = async (req, res, next) => {
  try {
    const classroom = await getStudentAcademyWeek({
      studentUserId: req.apiUser._id,
      weekId: req.params.weekId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({
      academy: serializeAcademy(classroom.academy),
      academyClass: serializeClass(classroom.academyClass),
      week: serializeWeek(classroom.week),
    });
  } catch (error) {
    return next(error);
  }
};

exports.requestByCode = async (req, res, next) => {
  try {
    await requestAcademyByCode({
      studentUserId: req.apiUser._id,
      code: req.body.code,
      consent: req.body.consent,
    });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(await dashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.requestByAcademy = async (req, res, next) => {
  try {
    await requestAcademyFromProfile({
      studentUserId: req.apiUser._id,
      academyId: req.body.academyId,
      consent: req.body.consent,
    });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(await dashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.leave = async (req, res, next) => {
  try {
    await leaveAcademy({ studentUserId: req.apiUser._id });
    res.set("Cache-Control", "private, no-store");
    return res.json(await dashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.checkIn = async (req, res, next) => {
  try {
    const attendance = await checkInStudentAttendance({
      studentUserId: req.apiUser._id,
      sessionId: req.body.sessionId,
      code: req.body.code,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ attendance });
  } catch (error) {
    return next(error);
  }
};

exports.downloadWeekFile = async (req, res, next) => {
  try {
    const download = await getStudentAcademyWeekFileDownload({
      studentUserId: req.apiUser._id,
      studentRole: req.apiUser.role,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    if (download.type === "REDIRECT") {
      res.set("Cache-Control", "private, no-store");
      return res.redirect(302, download.url);
    }
    const issued = download.issued;
    const cleanup = () => issued.cleanup().catch(() => {});
    res.once("finish", cleanup);
    res.once("close", cleanup);
    res.type("application/pdf");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Matths-Trace", issued.traceCode);
    return res.download(issued.filePath, issued.downloadName, (error) => {
      cleanup();
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) {
    return next(error);
  }
};
