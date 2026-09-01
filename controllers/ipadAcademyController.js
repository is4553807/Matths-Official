const {
  getStudentAcademyProfile,
  leaveAcademy,
  requestAcademyByCode,
  requestAcademyFromProfile,
} = require("../services/academyService");
const {
  getStudentAcademyClassroom,
  getStudentAcademyWeek,
  getStudentAcademyWeekFileDownload,
} = require("../services/academyClassworkService");
const {
  checkInStudentAttendance,
  getStudentAttendanceDashboard,
} = require("../services/academyAttendanceService");

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

exports.dashboard = async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    return res.json(await dashboardPayload(req.apiUser._id));
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

