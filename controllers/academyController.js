const {
  approveAcademyStaff,
  approveMembership,
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
  requestAcademyStaffJoin,
  requestAcademyByCode,
  requestAcademyByToken,
  requestAcademyFromProfile,
  revokeAcademyStaff,
  revokeAcademyInvite,
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
  getAcademyAttendanceRoster,
  saveAcademyAttendanceRoster,
} = require("../services/academyAttendanceService");
const {
  getClassMathMap,
  getStudentMathMap,
} = require("../services/mathMapService");

const ACADEMY_TABS = new Set(["dashboard", "attendance", "students", "requests", "classes", "invites", "teachers", "settings"]);

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
  if ([400, 403, 404, 409, 410, 413, 422].includes(Number(error.status))) {
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
    if (activeAcademyPage === "dashboard") {
      const studentUserIds = portal.students.map((membership) => membership.studentUserId._id);
      const [monthlyStatistics, mathMap] = await Promise.all([
        getAcademyMonthlyStatistics({
          studentUserIds,
          periodKey: req.query.period,
        }),
        getClassMathMap({ studentUserIds }),
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
    await createAcademyClass({ teacherUserId: req.session.user.id, name: req.body.className });
    await setFlash(req, "success", "새 반을 추가했습니다.");
    return res.redirect("/academy?tab=classes");
  } catch (error) {
    return handleExpectedError(req, res, next, error, "/academy?tab=classes");
  }
};

exports.classDetailPage = async (req, res, next) => {
  try {
    const detail = await getAcademyClassDetail({
      teacherUserId: req.session.user.id,
      classId: req.params.classId,
    });
    const studentUserIds = detail.students.map((membership) => membership.studentUserId._id);
    const [statistics, mathMap] = await Promise.all([
      getAcademyMonthlyStatistics({
        studentUserIds,
        periodKey: req.query.period,
        scopeLabel: "반",
      }),
      getClassMathMap({ studentUserIds }),
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
      activeAcademyPage: "classes",
    });
  } catch (error) {
    return next(error);
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
