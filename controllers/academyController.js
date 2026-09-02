const {
  approveAcademyStaff,
  approveMembership,
  addAcademyClassCoTeacher,
  archiveAcademyClass,
  assignMembershipClass,
  bulkManageAcademyStudents,
  cancelAcademyStaffJoin,
  createAcademyClass,
  createAcademyForTeacher,
  createAcademyInvite,
  getAcademyClassDetail,
  getAcademyInvitePresentation,
  getAcademyPortalData,
  getAcademyStudentPage,
  getAcademyStudentDetail,
  getTeacherAcademySetupData,
  getTeacherAcademyContext,
  leaveAcademy,
  rejectAcademyStaff,
  rejectMembership,
  removeAcademyClassCoTeacher,
  requestAcademyStaffJoin,
  requestAcademyByCode,
  requestAcademyByToken,
  requestAcademyFromProfile,
  revokeAcademyStaff,
  revokeAcademyInvite,
  restoreAcademyClass,
  transferAcademyClassHomeroom,
  updateAcademyClassSettings,
} = require("../services/academyService");
const {
  removeAcademyProfileImage,
  resolveAcademyProfileImage,
  updateAcademyProfileImage,
} = require("../services/academyProfileImageService");
const {
  discardRequestUploads,
} = require("../middleware/uploadContentValidation");
const {
  getAcademyMonthlyStatistics,
  getStudentMonthlyStatistics,
} = require("../services/academyStatisticsService");
const {
  checkInStudentAttendance,
  getAcademyAttendanceRoster,
  regenerateAttendanceSessionCode,
  saveAcademyAttendanceRoster,
} = require("../services/academyAttendanceService");
const {
  getClassMathMap,
  getStudentMathMap,
} = require("../services/mathMapService");
const {
  deleteAcademyClassWeek,
  getAcademyClassworkTeacherView,
  getStudentAcademyClassroom,
  getStudentAcademyWeek,
  getStudentAcademyWeekFileDownload,
  getTeacherAcademyWeekFileDownload,
  removeAcademyClassWeekFile,
  saveAcademyClassWeek,
  submitAcademyAssignment,
} = require("../services/academyClassworkService");
const {
  resolveArenaProfileAvatar,
} = require("../services/arenaProfileAvatarService");
const {
  analyzeAcademyForensicEvidence,
  getAcademyForensicsPageData,
} = require("../services/academyForensicsService");
const {
  getAcademyWeeklyMockInsights,
  getWeeklyMockInsights,
} = require("../services/weeklyMockInsightService");

const ACADEMY_TABS = new Set(["dashboard", "attendance", "students", "requests", "classes", "invites", "teachers", "settings"]);

function sendAcademyAssignmentDownload(res, next, download) {
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
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function setFlash(req, type, message) {
  req.session.academyFlash = {
    type: type === "error" ? "error" : "success",
    message: String(message || "").slice(0, 300),
  };
  await saveSession(req);
}

function consumeFlash(req) {
  const flash = req.session.academyFlash || null;
  delete req.session.academyFlash;
  return flash;
}

async function handleExpectedError(req, res, next, error, redirectTo) {
  if ([400, 403, 404, 409, 410, 413, 422, 503].includes(Number(error.status))) {
    try {
      await setFlash(req, "error", error.message);
      return res.redirect(redirectTo);
    } catch (sessionError) {
      return next(sessionError);
    }
  }
  return next(error);
}

function studentListPath(page) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  return `/academy?tab=students&page=${safePage}`;
}

exports.portalPage = async (req, res, next) => {
  try {
    const context = await getTeacherAcademyContext(req.session.user.id, { allowMissing: true });
    if (!context) return res.redirect("/academy/setup");
    const requestedTab = String(req.query.tab || "dashboard");
    let activeAcademyPage = ACADEMY_TABS.has(requestedTab) ? requestedTab : "dashboard";
    if (activeAcademyPage === "settings" && context.staff.role !== "OWNER") {
      activeAcademyPage = "dashboard";
    }
    const includeStudents = activeAcademyPage === "dashboard" || activeAcademyPage === "classes";
    const portal = await getAcademyPortalData(req.session.user.id, { includeStudents });
    portal.profileImageSrc = resolveAcademyProfileImage(portal.academy.profileImageAsset);
    const studentPage = activeAcademyPage === "students"
      ? await getAcademyStudentPage({
          teacherUserId: req.session.user.id,
          page: req.query.page,
        })
      : null;
    let statistics = null;
    let attendance = null;
    let weeklyMockInsights = null;
    if (activeAcademyPage === "dashboard") {
      const studentUserIds = portal.students.map((membership) => membership.studentUserId._id);
      const [monthlyStatistics, mathMap, academyWeeklyMock] = await Promise.all([
        getAcademyMonthlyStatistics({
          studentUserIds,
          periodKey: req.query.period,
        }),
        getClassMathMap({ studentUserIds }),
        getAcademyWeeklyMockInsights({ academyId: context.academyId }),
      ]);
      statistics = monthlyStatistics;
      statistics.mathMap = mathMap;
      statistics.analytics.heatmap = {
        items: mathMap.heatmap.slice(0, 18),
        measuredConcepts: mathMap.analyzedConceptCount,
      };
      const membershipsByStudentId = new Map(
        portal.students.map((membership) => [String(membership.studentUserId._id), membership])
      );
      statistics.attentionStudents = statistics.attentionStudents
        .map((item) => ({ ...item, membership: membershipsByStudentId.get(item.studentUserId) }))
        .filter((item) => item.membership);
      weeklyMockInsights = academyWeeklyMock;
    }
    if (activeAcademyPage === "attendance") {
      attendance = await getAcademyAttendanceRoster({
        teacherUserId: req.session.user.id,
        dateKey: req.query.date,
        classId: req.query.classId,
      });
    }
    res.set("Cache-Control", "private, no-store");
    return res.render("academy", {
      user: req.session.user,
      portal,
      studentPage,
      statistics,
      weeklyMockInsights,
      attendance,
      activeAcademyPage,
      feedback: consumeFlash(req),
      createdInviteId: String(req.query.createdInvite || ""),
    });
  } catch (error) {
    return next(error);
  }
};

exports.saveAttendance = async (req, res, next) => {
  const query = new URLSearchParams({ tab: "attendance" });
  if (req.body.date) query.set("date", String(req.body.date));
  if (req.body.classId) query.set("classId", String(req.body.classId));
  const redirectTo = `/academy?${query.toString()}`;
  try {
    const result = await saveAcademyAttendanceRoster({
      teacherUserId: req.session.user.id,
      dateKey: req.body.date,
      classId: req.body.classId,
      sessionId: req.body.sessionId,
      studentUserIds: req.body.studentUserIds,
      statuses: req.body.statuses,
      notes: req.body.notes,
    });
    await setFlash(
      req,
      "success",
      `${result.dateKey} 출결을 저장했습니다. ${result.recordedCount}명의 상태가 기록되었습니다.`
    );
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.setupPage = async (req, res, next) => {
  try {
    const context = await getTeacherAcademyContext(req.session.user.id, { allowMissing: true });
    if (context) return res.redirect("/academy");
    const setup = await getTeacherAcademySetupData(req.session.user.id);
    res.set("Cache-Control", "private, no-store");
    return res.render("academy-setup", {
      user: req.session.user,
      feedback: consumeFlash(req),
      academyName: "",
      setup,
    });
  } catch (error) {
    return next(error);
  }
};

exports.requestAcademyJoin = async (req, res, next) => {
  try {
    await requestAcademyStaffJoin({
      teacherUserId: req.session.user.id,
      academyId: req.body.academyId,
    });
    await setFlash(req, "success", "학원 참여 요청을 보냈습니다. 원장 선생님의 승인을 기다려주세요.");
    return res.redirect("/academy/setup");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy/setup");
  }
};

exports.cancelAcademyJoin = async (req, res, next) => {
  try {
    await cancelAcademyStaffJoin({ teacherUserId: req.session.user.id });
    await setFlash(req, "success", "학원 참여 요청을 취소했습니다.");
    return res.redirect("/academy/setup");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy/setup");
  }
};

exports.createAcademy = async (req, res, next) => {
  try {
    await createAcademyForTeacher({
      teacherUserId: req.session.user.id,
      name: req.body.academyName,
    });
    await setFlash(req, "success", "학원 등록 요청을 보냈습니다. 운영자 승인 후 학원 관리 페이지가 열립니다.");
    return res.redirect("/academy/setup");
  } catch (error) {
    if ([400, 409].includes(Number(error.status))) {
      try {
        await setFlash(req, "error", error.message);
        return res.redirect("/academy/setup");
      } catch (sessionError) {
        return next(sessionError);
      }
    }
    return next(error);
  }
};

exports.requestFromProfile = async (req, res, next) => {
  try {
    await requestAcademyFromProfile({
      studentUserId: req.session.user.id,
      academyId: req.body.academyId,
      consent: req.body.academyDataConsent,
    });
    await setFlash(req, "success", "학원에 소속 승인 요청을 보냈습니다.");
    return res.redirect("/profile#academy-settings");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/profile#academy-settings");
  }
};

exports.requestByCodeFromProfile = async (req, res, next) => {
  try {
    await requestAcademyByCode({
      studentUserId: req.session.user.id,
      code: req.body.inviteCode,
      consent: req.body.academyDataConsent,
    });
    await setFlash(req, "success", "초대 코드를 확인했습니다. 학원의 승인을 기다려주세요.");
    return res.redirect("/profile#academy-settings");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/profile#academy-settings");
  }
};

exports.leaveFromProfile = async (req, res, next) => {
  try {
    const membership = await leaveAcademy({ studentUserId: req.session.user.id });
    const message = membership.status === "PENDING"
      ? "학원 승인 요청을 취소했습니다."
      : "학원 소속을 해제하고 학습 현황 공유를 중단했습니다.";
    await setFlash(req, "success", message);
    return res.redirect("/profile#academy-settings");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/profile#academy-settings");
  }
};

exports.inviteJoinPage = async (req, res, next) => {
  try {
    const invite = await getAcademyInvitePresentation(req.params.token);
    res.set("Cache-Control", "private, no-store");
    return res.render("academy-join", {
      user: req.session.user,
      invite,
      error: null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.acceptInvite = async (req, res, next) => {
  try {
    await requestAcademyByToken({
      studentUserId: req.session.user.id,
      token: req.params.token,
      consent: req.body.academyDataConsent,
    });
    await setFlash(req, "success", "초대를 확인했습니다. 학원의 승인을 기다려주세요.");
    return res.redirect("/profile#academy-settings");
  } catch (error) {
    if ([400, 404, 409, 410].includes(Number(error.status))) {
      try {
        const invite = await getAcademyInvitePresentation(req.params.token).catch(() => null);
        if (!invite) return next(error);
        res.set("Cache-Control", "private, no-store");
        return res.status(Number(error.status)).render("academy-join", {
          user: req.session.user,
          invite,
          error: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.approveStudent = async (req, res, next) => {
  try {
    await approveMembership({ teacherUserId: req.session.user.id, membershipId: req.params.membershipId });
    await setFlash(req, "success", "학생 소속을 승인했습니다. 이제 학원 학생 목록에서 확인할 수 있습니다.");
    return res.redirect("/academy?tab=requests");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=requests");
  }
};

exports.rejectStudent = async (req, res, next) => {
  try {
    await rejectMembership({ teacherUserId: req.session.user.id, membershipId: req.params.membershipId });
    await setFlash(req, "success", "학생 소속 요청을 거절했습니다.");
    return res.redirect("/academy?tab=requests");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=requests");
  }
};

exports.assignClass = async (req, res, next) => {
  const redirectTo = studentListPath(req.body.page);
  try {
    await assignMembershipClass({
      teacherUserId: req.session.user.id,
      membershipId: req.params.membershipId,
      classId: String(req.body.classId || ""),
    });
    await setFlash(req, "success", "학생의 반을 저장했습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.bulkManageStudents = async (req, res, next) => {
  const redirectTo = studentListPath(req.body.page);
  try {
    const result = await bulkManageAcademyStudents({
      teacherUserId: req.session.user.id,
      membershipIds: req.body.membershipIds,
      action: req.body.action,
      classId: req.body.classId,
    });
    const actionLabel = {
      ASSIGN_CLASS: "반 배정",
      UNASSIGN_CLASS: "반 배정 해제",
      REMOVE: "학원 소속 해제",
    }[result.action];
    await setFlash(req, "success", `선택한 학생 ${result.count}명의 ${actionLabel} 작업을 완료했습니다.`);
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.changeAcademyProfileImage = async (req, res, next) => {
  try {
    if (req.profileAvatarUploadError) throw req.profileAvatarUploadError;
    await updateAcademyProfileImage({
      teacherUserId: req.session.user.id,
      file: req.file,
    });
    await setFlash(req, "success", "학원 프로필 사진을 변경했습니다.");
    return res.redirect("/academy?tab=settings");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=settings");
  } finally {
    await discardRequestUploads(req);
  }
};

exports.removeAcademyProfileImage = async (req, res, next) => {
  try {
    await removeAcademyProfileImage({ teacherUserId: req.session.user.id });
    await setFlash(req, "success", "학원 프로필 사진을 기본 이미지로 되돌렸습니다.");
    return res.redirect("/academy?tab=settings");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=settings");
  }
};

exports.createClass = async (req, res, next) => {
  try {
    await createAcademyClass({
      teacherUserId: req.session.user.id,
      name: req.body.className,
      weekdays: req.body.weekdays,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      effectiveFrom: req.body.effectiveFrom,
      attendanceMode: req.body.attendanceMode,
      opensBeforeMinutes: req.body.opensBeforeMinutes,
      lateAfterMinutes: req.body.lateAfterMinutes,
      closesAfterMinutes: req.body.closesAfterMinutes,
    });
    await setFlash(req, "success", "새 반을 추가했습니다.");
    return res.redirect("/academy?tab=classes");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=classes");
  }
};

exports.updateClassSettings = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=attendance`;
  try {
    await updateAcademyClassSettings({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      weekdays: req.body.weekdays,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      effectiveFrom: req.body.effectiveFrom,
      attendanceMode: req.body.attendanceMode,
      opensBeforeMinutes: req.body.opensBeforeMinutes,
      lateAfterMinutes: req.body.lateAfterMinutes,
      closesAfterMinutes: req.body.closesAfterMinutes,
    });
    await setFlash(req, "success", "반 일정과 출결 방식을 저장했습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.archiveClass = async (req, res, next) => {
  try {
    const result = await archiveAcademyClass({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
    });
    await setFlash(
      req,
      "success",
      `반을 보관했습니다. 학생 ${result.unassignedStudentCount}명 배정 해제, 예정 회차 ${result.canceledSessionCount}개 취소, 초대 ${result.revokedInviteCount}개 회수`
    );
    return res.redirect("/academy?tab=classes");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=classes");
  }
};

exports.restoreClass = async (req, res, next) => {
  try {
    await restoreAcademyClass({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
    });
    await setFlash(req, "success", "반을 복구했습니다. 학생 배정과 기존 초대는 필요에 따라 다시 설정해 주세요.");
    return res.redirect("/academy?tab=classes");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=classes");
  }
};

exports.addClassCoTeacher = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=settings`;
  try {
    await addAcademyClassCoTeacher({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      coTeacherUserId: req.body.teacherUserId,
    });
    await setFlash(req, "success", "공동 담당 선생님을 추가했습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.removeClassCoTeacher = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=settings`;
  try {
    await removeAcademyClassCoTeacher({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      coTeacherUserId: req.params.teacherUserId,
    });
    await setFlash(req, "success", "공동 담당 선생님을 해제했습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.transferClassHomeroom = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=settings`;
  try {
    await transferAcademyClassHomeroom({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      nextTeacherUserId: req.body.nextTeacherUserId,
      keepPreviousAsCoTeacher: req.body.keepPreviousAsCoTeacher === "1",
    });
    await setFlash(req, "success", "반 담임 선생님을 이전했습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.regenerateAttendanceCode = async (req, res, next) => {
  const query = new URLSearchParams({ tab: "attendance" });
  if (req.body.date) query.set("date", String(req.body.date));
  if (req.body.classId) query.set("classId", String(req.body.classId));
  const redirectTo = `/academy?${query.toString()}`;
  try {
    await regenerateAttendanceSessionCode({
      teacherUserId: req.session.user.id,
      sessionId: req.params.sessionId,
    });
    await setFlash(req, "success", "새 출석 코드를 발급했습니다. 이전 코드는 즉시 만료되었습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.studentAttendanceCheckIn = async (req, res, next) => {
  try {
    const result = await checkInStudentAttendance({
      studentUserId: req.session.user.id,
      sessionId: req.body.sessionId,
      code: req.body.code,
    });
    return res.json({
      ok: true,
      message: result.status === "LATE" ? "지각으로 출석 처리되었습니다." : "출석이 완료되었습니다.",
      attendance: result,
    });
  } catch (error) {
    if ([400, 403, 404, 409, 410, 429].includes(Number(error.status))) {
      return res.status(Number(error.status)).json({ ok: false, message: error.message, code: error.code || "" });
    }
    return next(error);
  }
};

exports.classDetailPage = async (req, res, next) => {
  try {
    const allowedSections = new Set(["statistics", "attendance", "classwork", "settings"]);
    const requestedSection = String(req.query.section || "").trim().toLowerCase();
    const activeClassSection = req.query.editWeek
      ? "classwork"
      : allowedSections.has(requestedSection) ? requestedSection : "statistics";
    const detail = await getAcademyClassDetail({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
    });
    const studentUserIds = detail.students.map((membership) => membership.studentUserId._id);
    const [statistics, mathMap, classwork, weeklyMockInsights] = await Promise.all([
      getAcademyMonthlyStatistics({
        studentUserIds,
        periodKey: req.query.period,
        scopeLabel: "반",
      }),
      getClassMathMap({ studentUserIds }),
      getAcademyClassworkTeacherView({
        teacherUserId: req.session.user.id,
        classId: req.params.classId,
        editWeekId: req.query.editWeek,
      }),
      getWeeklyMockInsights({ studentUserIds, scopeLabel: detail.academyClass.name }),
    ]);
    const membershipsByStudentId = new Map(
      detail.students.map((membership) => [String(membership.studentUserId._id), membership])
    );
    statistics.attentionStudents = statistics.attentionStudents
      .map((item) => ({ ...item, membership: membershipsByStudentId.get(item.studentUserId) }))
      .filter((item) => item.membership);
    detail.profileImageSrc = resolveAcademyProfileImage(detail.academy.profileImageAsset);

    res.set("Cache-Control", "private, no-store");
    return res.render("academy-class-detail", {
      user: req.session.user,
      detail,
      statistics,
      mathMap,
      classwork,
      weeklyMockInsights,
      activeClassSection,
      activeAcademyPage: "classes",
      feedback: consumeFlash(req),
    });
  } catch (error) {
    return next(error);
  }
};

exports.saveClassWeek = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=classwork#class-weekly-work`;
  try {
    if (req.academyAssignmentUploadError) throw req.academyAssignmentUploadError;
    const week = await saveAcademyClassWeek({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      weekId: req.body.weekId,
      academicYear: req.body.academicYear,
      weekNumber: req.body.weekNumber,
      title: req.body.title,
      lessonSummary: req.body.lessonSummary,
      conceptKeys: req.body.conceptKeys,
      assignmentTitle: req.body.assignmentTitle,
      assignmentInstructions: req.body.assignmentInstructions,
      assignmentOmr: req.body.assignmentOmr,
      dueAt: req.body.dueAt,
      files: req.files || [],
    });
    await setFlash(req, "success", `${week.academicYear}년 ${week.weekNumber}주차 수업과 과제를 저장했습니다.`);
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  } finally {
    await discardRequestUploads(req);
  }
};

exports.removeClassWeekFile = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=classwork&editWeek=${req.params.weekId}#class-weekly-work`;
  try {
    await removeAcademyClassWeekFile({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    await setFlash(req, "success", "과제 파일을 삭제했습니다.");
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.deleteClassWeek = async (req, res, next) => {
  const redirectTo = `/academy/classes/${req.params.classId}?section=classwork#class-weekly-work`;
  try {
    const deleted = await deleteAcademyClassWeek({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      weekId: req.params.weekId,
    });
    await setFlash(req, "success", `${deleted.academicYear}년 ${deleted.weekNumber}주차 수업과 과제를 삭제했습니다.`);
    return res.redirect(redirectTo);
  } catch (error) {
    return handleExpectedError(req, res, next, error, redirectTo);
  }
};

exports.downloadClassWeekFile = async (req, res, next) => {
  try {
    const download = await getTeacherAcademyWeekFileDownload({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    return sendAcademyAssignmentDownload(res, next, download);
  } catch (error) {
    return next(error);
  }
};

exports.studentAcademyPage = async (req, res, next) => {
  try {
    const classroom = await getStudentAcademyClassroom({ studentUserId: req.session.user.id });
    classroom.profileImageSrc = resolveAcademyProfileImage(classroom.academy.profileImageAsset);
    res.set("Cache-Control", "private, no-store");
    return res.render("student-academy", {
      user: req.session.user,
      classroom,
      arenaProfileAvatar: resolveArenaProfileAvatar(req.session.user.preferences || {}),
    });
  } catch (error) {
    return next(error);
  }
};

exports.studentAcademyWeekPage = async (req, res, next) => {
  try {
    const classroom = await getStudentAcademyWeek({
      studentUserId: req.session.user.id,
      weekId: req.params.weekId,
    });
    classroom.profileImageSrc = resolveAcademyProfileImage(classroom.academy.profileImageAsset);
    res.set("Cache-Control", "private, no-store");
    return res.render("student-academy-week", {
      user: req.session.user,
      classroom,
      arenaProfileAvatar: resolveArenaProfileAvatar(req.session.user.preferences || {}),
      submissionFeedback: req.query.submitted === "1"
        ? { type: "success", message: "과제 답안을 제출하고 자동 채점을 완료했습니다." }
        : req.query.error
          ? { type: "error", message: String(req.query.error).slice(0, 240) }
          : null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitStudentAcademyAssignment = async (req, res, next) => {
  const redirectTo = `/my-academy/weeks/${req.params.weekId}`;
  try {
    const questionCount = Math.min(100, Math.max(0, Number.parseInt(req.body.questionCount, 10) || 0));
    const answers = Array.from(
      { length: questionCount },
      (_unused, index) => req.body[`answer_${index + 1}`]
    );
    await submitAcademyAssignment({
      studentUserId: req.session.user.id,
      weekId: req.params.weekId,
      answers,
    });
    return res.redirect(`${redirectTo}?submitted=1#assignment-omr`);
  } catch (error) {
    if ([400, 403, 404, 409, 410].includes(Number(error.status))) {
      return res.redirect(`${redirectTo}?error=${encodeURIComponent(error.message)}#assignment-omr`);
    }
    return next(error);
  }
};

exports.downloadStudentAcademyWeekFile = async (req, res, next) => {
  try {
    const download = await getStudentAcademyWeekFileDownload({
      studentUserId: req.session.user.id,
      studentRole: req.session.user.role,
      weekId: req.params.weekId,
      fileId: req.params.fileId,
    });
    return sendAcademyAssignmentDownload(res, next, download);
  } catch (error) {
    return next(error);
  }
};

exports.academyForensicsPage = async (req, res, next) => {
  try {
    const forensics = await getAcademyForensicsPageData({
      teacherUserId: req.session.user.id,
      classId: req.query.classId,
    });
    forensics.profileImageSrc = resolveAcademyProfileImage(forensics.academy.profileImageAsset);
    res.set("Cache-Control", "private, no-store");
    return res.render("academy-forensics", {
      user: req.session.user,
      forensics,
      analysis: null,
      error: null,
      oldTraceCode: "",
    });
  } catch (error) {
    return next(error);
  }
};

exports.analyzeAcademyForensics = async (req, res, next) => {
  const uploadedPath = req.file?.path || "";
  const requestedTraceCode = String(req.body?.traceCode || "").trim();
  const selectedClassId = String(req.body?.classId || "").trim();
  try {
    if (req.academyForensicsUploadError) throw req.academyForensicsUploadError;
    const result = await analyzeAcademyForensicEvidence({
      teacherUserId: req.session.user.id,
      classId: selectedClassId,
      filePath: uploadedPath,
      traceCode: requestedTraceCode,
    });
    result.pageData.profileImageSrc = resolveAcademyProfileImage(result.pageData.academy.profileImageAsset);
    res.set("Cache-Control", "private, no-store");
    return res.render("academy-forensics", {
      user: req.session.user,
      forensics: result.pageData,
      analysis: result.analysis,
      error: result.analysis.matches.length
        ? null
        : result.analysis.inputType === "TRACE_CODE"
          ? "이 반에서 발급된 PDF 중 해당 추적 코드와 일치하는 기록이 없습니다."
          : result.analysis.traceCodes.length
            ? "식별 코드는 감지했지만 이 반의 과제 발급 기록과 일치하지 않습니다. 반 선택과 원본 상태를 확인해 주세요."
            : "파일에서 식별 코드를 읽지 못했습니다. 잘림·덧칠·압축 상태를 확인하고 더 넓은 영역을 다시 올려 주세요.",
      oldTraceCode: requestedTraceCode,
    });
  } catch (error) {
    if ([400, 403, 404, 413, 422, 503].includes(Number(error.status))) {
      try {
        const forensics = await getAcademyForensicsPageData({
          teacherUserId: req.session.user.id,
          classId: selectedClassId,
        });
        forensics.profileImageSrc = resolveAcademyProfileImage(forensics.academy.profileImageAsset);
        res.set("Cache-Control", "private, no-store");
        return res.status(Number(error.status)).render("academy-forensics", {
          user: req.session.user,
          forensics,
          analysis: null,
          error: error.message,
          oldTraceCode: requestedTraceCode,
        });
      } catch (contextError) {
        return next(contextError);
      }
    }
    return next(error);
  } finally {
    if (uploadedPath) {
      await require("node:fs").promises.unlink(uploadedPath).catch(() => {});
    }
  }
};

exports.createInvite = async (req, res, next) => {
  try {
    const invite = await createAcademyInvite({
      teacherUserId: req.session.user.id,
      label: req.body.label,
      classId: String(req.body.classId || ""),
      expiryDays: req.body.expiryDays,
      maxUses: req.body.maxUses,
    });
    await setFlash(req, "success", "새 초대 링크와 코드를 만들었습니다.");
    return res.redirect(`/academy?tab=invites&createdInvite=${invite._id}`);
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=invites");
  }
};

exports.revokeInvite = async (req, res, next) => {
  try {
    await revokeAcademyInvite({ teacherUserId: req.session.user.id, inviteId: req.params.inviteId });
    await setFlash(req, "success", "초대를 비활성화했습니다.");
    return res.redirect("/academy?tab=invites");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=invites");
  }
};

exports.approveTeacher = async (req, res, next) => {
  try {
    await approveAcademyStaff({
      teacherUserId: req.session.user.id,
      staffId: req.params.staffId,
    });
    await setFlash(req, "success", "선생님의 학원 참여를 승인했습니다.");
    return res.redirect("/academy?tab=teachers");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=teachers");
  }
};

exports.rejectTeacher = async (req, res, next) => {
  try {
    await rejectAcademyStaff({
      teacherUserId: req.session.user.id,
      staffId: req.params.staffId,
    });
    await setFlash(req, "success", "선생님의 학원 참여 요청을 거절했습니다.");
    return res.redirect("/academy?tab=teachers");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=teachers");
  }
};

exports.revokeTeacher = async (req, res, next) => {
  try {
    await revokeAcademyStaff({
      teacherUserId: req.session.user.id,
      staffId: req.params.staffId,
    });
    await setFlash(req, "success", "선생님의 학원 접근 권한을 해제했습니다.");
    return res.redirect("/academy?tab=teachers");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=teachers");
  }
};

exports.studentDetailPage = async (req, res, next) => {
  try {
    const detail = await getAcademyStudentDetail({
      teacherUserId: req.session.user.id,
      membershipId: req.params.membershipId,
    });
    const studentUserId = detail.membership.studentUserId._id;
    const [statistics, mathMap] = await Promise.all([
      getStudentMonthlyStatistics({
        studentUserId,
        periodKey: req.query.period,
      }),
      getStudentMathMap({ studentUserId }),
    ]);
    res.set("Cache-Control", "private, no-store");
    return res.render("academy-student-detail", {
      user: req.session.user,
      detail,
      statistics,
      mathMap,
      activeAcademyPage: "students",
    });
  } catch (error) {
    return next(error);
  }
};
