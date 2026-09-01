const {
  approveAcademyApplication,
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
  getAcademyPortalData,
  getAcademyStudentDetail,
  getAcademyStudentPage,
  getStudentAcademyProfile,
  getTeacherAcademyContext,
  getTeacherAcademySetupData,
  leaveAcademy,
  rejectAcademyApplication,
  rejectAcademyStaff,
  rejectMembership,
  requestAcademyByCode,
  requestAcademyFromProfile,
  removeAcademyClassCoTeacher,
  requestAcademyStaffJoin,
  restoreAcademyClass,
  revokeAcademyInvite,
  revokeAcademyStaff,
  transferAcademyClassHomeroom,
  updateAcademyClassSettings,
} = require("../services/academyService");
const {
  getAcademyMonthlyStatistics,
  getStudentMonthlyStatistics,
} = require("../services/academyStatisticsService");
const {
  getClassMathMap,
  getStudentMathMap,
} = require("../services/mathMapService");
const {
  getAdminAcademyDetail,
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
const {
  removeAcademyProfileImage,
  resolveAcademyProfileImage,
  updateAcademyProfileImage,
} = require("../services/academyProfileImageService");
const {
  analyzeAcademyForensicEvidence,
  getAcademyForensicsPageData,
} = require("../services/academyForensicsService");
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
    profileImageURL: resolveAcademyProfileImage(academy.profileImageAsset) || null,
  };
}

function serializeTeacherSetup(setup, isReady = false) {
  return {
    isReady,
    pendingAcademy: serializeAcademy(setup?.pendingAcademy),
    pendingRequest: setup?.pendingRequest ? {
      id: identifier(setup.pendingRequest),
      academy: serializeAcademy(setup.pendingRequest.academyId),
      requestedAt: setup.pendingRequest.requestedAt || null,
    } : null,
    rejectedAcademy: serializeAcademy(setup?.rejectedAcademy),
    academies: (setup?.academies || []).map(serializeAcademy),
  };
}

function serializeTeacherForensics(pageData, analysis = null) {
  return {
    academy: serializeAcademy(pageData.academy),
    isOwner: Boolean(pageData.isOwner),
    classes: (pageData.classes || []).map(serializeClass),
    selectedClass: serializeClass(pageData.selectedClass),
    scope: {
      approvedStudents: Number(pageData.scope?.approvedStudents || 0),
      issuedCopies: Number(pageData.scope?.issuedCopies || 0),
      distinctDownloaders: Number(pageData.scope?.distinctDownloaders || 0),
      firstIssuedAt: pageData.scope?.firstIssuedAt || null,
    },
    analysis: analysis ? {
      inputType: analysis.inputType || null,
      traceCodes: analysis.traceCodes || [],
      matches: (analysis.matches || []).map((match) => ({
        displayName: match.displayName,
        className: match.className,
        userRole: match.userRole,
        downloadedAt: match.downloadedAt || null,
        traceCode: match.traceCode,
        documentIssueId: match.documentIssueId,
        originalName: match.originalName,
        signatureVerified: Boolean(match.signatureVerified),
        recognitionMethod: match.recognitionMethod,
        ocrConfidence: match.ocrConfidence ?? null,
        matchedCandidate: match.matchedCandidate || null,
      })),
    } : null,
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
    homeroomTeacher: serializeStaffIdentity(academyClass.homeroomTeacherUserId),
    coTeachers: (academyClass.coTeacherUserIds || []).map(serializeStaffIdentity).filter(Boolean),
  };
}

function serializeStaffIdentity(user) {
  if (!user) return null;
  return {
    id: identifier(user),
    name: String(user.realName || user.name || ""),
    email: String(user.email || ""),
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

function serializeStudentPage(pageData, academy, classes) {
  return {
    academy: serializeAcademy(academy),
    // 학생 명단의 반 선택기에는 반 ID·이름만 필요하다. 담임/공동 담당 이메일까지
    // 같은 응답에 싣지 않아 화면 목적보다 넓은 개인정보 노출을 만들지 않는다.
    classes: (classes || []).map((academyClass) => ({
      id: identifier(academyClass),
      name: String(academyClass.name || ""),
      isActive: academyClass.isActive !== false,
    })),
    students: (pageData.students || []).map(serializeTeacherMembership),
    page: Number(pageData.page || 1),
    pageSize: Number(pageData.pageSize || 20),
    total: Number(pageData.total || 0),
    totalPages: Number(pageData.totalPages || 1),
  };
}

function serializeStudentStatistics(statistics) {
  return {
    period: {
      key: String(statistics.period?.key || ""),
      label: String(statistics.period?.label || ""),
      isCurrent: statistics.period?.isCurrent === true,
      options: (statistics.period?.options || []).map((option) => ({
        key: String(option.key || ""),
        label: String(option.label || ""),
      })),
    },
    hasActivity: statistics.hasActivity === true,
    cards: (statistics.cards || []).map((card) => ({
      label: String(card.label || ""),
      value: String(card.value || ""),
      detail: String(card.detail || ""),
    })),
    summary: {
      bullets: (statistics.summary?.bullets || []).map((bullet) => ({
        label: String(bullet.label || ""),
        text: String(bullet.text || ""),
      })),
    },
  };
}

function serializeMathMapConcept(concept) {
  return {
    id: String(concept.id || ""),
    title: String(concept.title || ""),
    courseTitle: String(concept.courseTitle || ""),
    unitTitle: String(concept.unitTitle || ""),
    mastery: concept.mastery === null || concept.mastery === undefined
      ? null
      : Number(concept.mastery),
    status: String(concept.status || "UNKNOWN"),
    statusLabel: String(concept.statusLabel || "데이터 부족"),
    confidenceLabel: String(concept.confidenceLabel || "판단 전"),
    evidence: {
      attemptCount: Number(concept.evidence?.attemptCount || 0),
      correctCount: Number(concept.evidence?.correctCount || 0),
      retryAttemptedCount: Number(concept.evidence?.retryAttemptedCount || 0),
      retryRecoveredCount: Number(concept.evidence?.retryRecoveredCount || 0),
      averageResponseTimeMs: concept.evidence?.averageResponseTimeMs === null
        || concept.evidence?.averageResponseTimeMs === undefined
        ? null
        : Number(concept.evidence.averageResponseTimeMs),
      lastStudiedAt: concept.evidence?.lastStudiedAt || null,
    },
  };
}

function serializeStudentMathMap(mathMap) {
  const serializeHeadline = (concept) => concept ? serializeMathMapConcept(concept) : null;
  return {
    graphVersion: String(mathMap?.graphVersion || ""),
    modelVersion: String(mathMap?.modelVersion || ""),
    overallMastery: mathMap?.overallMastery === null || mathMap?.overallMastery === undefined
      ? null
      : Number(mathMap.overallMastery),
    analyzedConceptCount: Number(mathMap?.analyzedConceptCount || 0),
    unknownConceptCount: Number(mathMap?.unknownConceptCount || 0),
    topStrength: serializeHeadline(mathMap?.topStrength),
    topPriority: serializeHeadline(mathMap?.topPriority),
    bottlenecks: (mathMap?.bottlenecks || []).slice(0, 5).map((item) => ({
      conceptId: String(item.conceptId || ""),
      conceptTitle: String(item.conceptTitle || ""),
      affectedConceptCount: Number(item.affectedConceptCount || item.affectedConcepts?.length || 0),
    })),
    concepts: (mathMap?.concepts || []).map(serializeMathMapConcept),
  };
}

function serializeNullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeTeacherAnalytics({ academy, academyClass, statistics, mathMap, memberships }) {
  const membershipsByStudentId = new Map(
    (memberships || []).map((membership) => [
      identifier(membership.studentUserId),
      membership,
    ])
  );
  return {
    academy: serializeAcademy(academy),
    scope: {
      type: academyClass ? "CLASS" : "ACADEMY",
      academyClass: academyClass ? {
        id: identifier(academyClass),
        name: String(academyClass.name || ""),
      } : null,
    },
    period: {
      key: String(statistics.period?.key || ""),
      label: String(statistics.period?.label || ""),
      isCurrent: statistics.period?.isCurrent === true,
      options: (statistics.period?.options || []).map((option) => ({
        key: String(option.key || ""),
        label: String(option.label || ""),
      })),
    },
    hasActivity: statistics.hasActivity === true,
    cards: (statistics.cards || []).map((card) => ({
      label: String(card.label || ""),
      value: String(card.value || ""),
      detail: String(card.detail || ""),
    })),
    values: {
      totalStudents: Number(statistics.values?.totalStudents || 0),
      activeStudents: Number(statistics.values?.activeStudents || 0),
      participationRate: serializeNullableNumber(statistics.values?.participationRate),
      averageLearningDays: serializeNullableNumber(statistics.values?.averageLearningDays),
      averageCompletedConcepts: serializeNullableNumber(statistics.values?.averageCompletedConcepts),
      averageUniqueProblems: serializeNullableNumber(statistics.values?.averageUniqueProblems),
      firstAttemptAccuracy: serializeNullableNumber(statistics.values?.firstAttemptAccuracy),
      wrongAnswerReviewRate: serializeNullableNumber(statistics.values?.wrongAnswerReviewRate),
      retrySuccessRate: serializeNullableNumber(statistics.values?.retrySuccessRate),
    },
    health: {
      score: serializeNullableNumber(statistics.health?.score),
      key: String(statistics.health?.key || "RISK"),
      label: String(statistics.health?.label || "데이터 없음"),
      dataCoverage: Number(statistics.health?.dataCoverage || 0),
      targetLearningDays: Number(statistics.health?.targetLearningDays || 0),
      distribution: {
        healthy: Number(statistics.health?.distribution?.HEALTHY || 0),
        watch: Number(statistics.health?.distribution?.WATCH || 0),
        risk: Number(statistics.health?.distribution?.RISK || 0),
      },
      components: {
        engagement: serializeNullableNumber(statistics.health?.components?.engagement),
        accuracy: serializeNullableNumber(statistics.health?.components?.accuracy),
        review: serializeNullableNumber(statistics.health?.components?.review),
        recovery: serializeNullableNumber(statistics.health?.components?.recovery),
      },
    },
    growth: (statistics.analytics?.growth?.points || []).map((point) => ({
      week: Number(point.week || 0),
      label: String(point.label || ""),
      attempts: Number(point.attempts || 0),
      uniqueProblems: Number(point.uniqueProblems || 0),
      activeStudents: Number(point.activeStudents || 0),
      accuracy: serializeNullableNumber(point.accuracy),
    })),
    summary: (statistics.summary?.bullets || []).map((bullet) => ({
      label: String(bullet.label || ""),
      text: String(bullet.text || ""),
    })),
    attentionStudents: (statistics.attentionStudents || []).map((item) => {
      const membership = membershipsByStudentId.get(String(item.studentUserId || ""));
      if (!membership) return null;
      return {
        membership: serializeTeacherMembership(membership),
        reasons: (item.reasons || []).map((reason) => String(reason)),
        priority: Number(item.priority || 0),
      };
    }).filter(Boolean),
    mathMap: {
      graphVersion: String(mathMap?.graphVersion || ""),
      modelVersion: String(mathMap?.modelVersion || ""),
      overallMastery: serializeNullableNumber(mathMap?.overallMastery),
      analyzedConceptCount: Number(mathMap?.analyzedConceptCount || 0),
      totalStudents: Number(mathMap?.totalStudents || memberships?.length || 0),
      heatmap: (mathMap?.heatmap || []).slice(0, 18).map((item) => ({
        conceptId: String(item.conceptId || ""),
        conceptTitle: String(item.conceptTitle || ""),
        courseTitle: String(item.courseTitle || ""),
        unitTitle: String(item.unitTitle || ""),
        mastery: serializeNullableNumber(item.mastery),
        analyzedCount: Number(item.analyzedCount || 0),
        totalStudents: Number(item.totalStudents || 0),
        status: String(item.status || "UNKNOWN"),
        statusLabel: String(item.statusLabel || "데이터 부족"),
      })),
      bottlenecks: (mathMap?.bottlenecks || []).slice(0, 5).map((item) => ({
        conceptId: String(item.conceptId || ""),
        conceptTitle: String(item.conceptTitle || ""),
        mastery: serializeNullableNumber(item.mastery),
        analyzedCount: Number(item.analyzedCount || 0),
        weakCount: Number(item.weakCount || 0),
        affectedConceptCount: Number(item.affectedConceptCount || 0),
      })),
      recommendation: mathMap?.recommendation ? {
        conceptId: String(mathMap.recommendation.conceptId || ""),
        conceptTitle: String(mathMap.recommendation.conceptTitle || ""),
        mastery: serializeNullableNumber(mathMap.recommendation.mastery),
        reason: String(mathMap.recommendation.reason || ""),
        problemCount: Number(mathMap.recommendation.problemMix?.total || 0),
      } : null,
    },
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

function serializeAdminAcademyListItem(academy) {
  return {
    ...serializeAdminAcademyApplication(academy),
    profileImageURL: academy.profileImageSrc || null,
    planCode: academy.planCode || null,
    counts: {
      activeStaff: Number(academy.counts?.activeStaff || 0),
      pendingStaff: Number(academy.counts?.pendingStaff || 0),
      approvedStudents: Number(academy.counts?.approvedStudents || 0),
      pendingStudents: Number(academy.counts?.pendingStudents || 0),
      activeClasses: Number(academy.counts?.activeClasses || 0),
    },
  };
}

function serializeAdminAcademyDetail(detail) {
  return {
    academy: {
      ...serializeAdminAcademyApplication(detail.academy),
      profileImageURL: detail.academy.profileImageSrc || null,
      planCode: detail.academy.planCode || null,
    },
    counts: detail.counts,
    staff: detail.staff.map((staff) => ({
      id: identifier(staff),
      user: staff.userId ? {
        id: identifier(staff.userId),
        name: String(staff.userId.realName || staff.userId.name || ""),
        email: String(staff.userId.email || ""),
      } : null,
      role: staff.role,
      status: staff.status,
      requestedAt: staff.requestedAt || null,
      joinedAt: staff.joinedAt || null,
    })),
    students: detail.memberships.map((membership) => ({
      id: identifier(membership),
      student: serializePerson(membership.studentUserId),
      academyClass: serializeClass(membership.classId),
      status: membership.status,
      requestedAt: membership.requestedAt || null,
      approvedAt: membership.approvedAt || null,
    })),
    classes: detail.classes.map(serializeClass),
    invites: detail.invites.map(serializeInvite),
    attendanceSessions: detail.attendanceSessions.map((session) => ({
      id: identifier(session),
      academyClass: serializeClass(session.classId),
      dateKey: session.dateKey,
      startsAt: session.startsAt || null,
      attendanceMode: session.attendanceMode,
      state: session.computedState,
      code: session.code || null,
    })),
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

exports.teacherSetup = async (req, res, next) => {
  try {
    const context = await getTeacherAcademyContext(req.apiUser._id, { allowMissing: true });
    const payload = context
      ? serializeTeacherSetup(null, true)
      : serializeTeacherSetup(await getTeacherAcademySetupData(req.apiUser._id));
    res.set("Cache-Control", "private, no-store");
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
};

exports.createTeacherAcademy = async (req, res, next) => {
  try {
    await createAcademyForTeacher({
      teacherUserId: req.apiUser._id,
      name: req.body.academyName,
    });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(
      serializeTeacherSetup(await getTeacherAcademySetupData(req.apiUser._id))
    );
  } catch (error) {
    return next(error);
  }
};

exports.requestTeacherAcademyJoin = async (req, res, next) => {
  try {
    await requestAcademyStaffJoin({
      teacherUserId: req.apiUser._id,
      academyId: req.body.academyId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.status(201).json(
      serializeTeacherSetup(await getTeacherAcademySetupData(req.apiUser._id))
    );
  } catch (error) {
    return next(error);
  }
};

exports.cancelTeacherAcademyJoin = async (req, res, next) => {
  try {
    await cancelAcademyStaffJoin({ teacherUserId: req.apiUser._id });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherSetup(await getTeacherAcademySetupData(req.apiUser._id)));
  } catch (error) {
    return next(error);
  }
};

exports.updateTeacherAcademyProfileImage = async (req, res, next) => {
  try {
    if (req.profileAvatarUploadError) throw req.profileAvatarUploadError;
    await updateAcademyProfileImage({
      teacherUserId: req.apiUser._id,
      file: req.file,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  } finally {
    await discardRequestUploads(req);
  }
};

exports.removeTeacherAcademyProfileImage = async (req, res, next) => {
  try {
    await removeAcademyProfileImage({ teacherUserId: req.apiUser._id });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.teacherForensics = async (req, res, next) => {
  try {
    const pageData = await getAcademyForensicsPageData({
      teacherUserId: req.apiUser._id,
      classId: req.query.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherForensics(pageData));
  } catch (error) {
    return next(error);
  }
};

async function analyzeTeacherForensics(req, res, next) {
  try {
    if (req.academyForensicsUploadError) throw req.academyForensicsUploadError;
    const result = await analyzeAcademyForensicEvidence({
      teacherUserId: req.apiUser._id,
      classId: req.body.classId,
      filePath: req.file?.path || "",
      traceCode: req.body.traceCode,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherForensics(result.pageData, result.analysis));
  } catch (error) {
    return next(error);
  } finally {
    await discardRequestUploads(req);
  }
}

exports.analyzeTeacherForensicsCode = analyzeTeacherForensics;
exports.analyzeTeacherForensicsFile = analyzeTeacherForensics;

exports.teacherAnalytics = async (req, res, next) => {
  try {
    const classId = String(req.query.classId || "").trim();
    let academy;
    let academyClass = null;
    let memberships;
    if (classId) {
      const detail = await getAcademyClassDetail({
        teacherUserId: req.apiUser._id,
        classId,
      });
      academy = detail.academy;
      academyClass = detail.academyClass;
      memberships = detail.students;
    } else {
      const portal = await getAcademyPortalData(req.apiUser._id, { includeStudents: true });
      academy = portal.academy;
      memberships = portal.students;
    }
    const studentUserIds = memberships.map((membership) => membership.studentUserId._id);
    const [statistics, mathMap] = await Promise.all([
      getAcademyMonthlyStatistics({
        studentUserIds,
        periodKey: req.query.period,
        scopeLabel: academyClass ? "반" : "학원",
      }),
      getClassMathMap({ studentUserIds }),
    ]);
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeTeacherAnalytics({
      academy,
      academyClass,
      statistics,
      mathMap,
      memberships,
    }));
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

exports.adminAcademyList = async (req, res, next) => {
  try {
    const result = await getAdminAcademyList({
      adminUserId: req.apiUser._id,
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({
      academies: result.academies.map(serializeAdminAcademyListItem),
      filters: result.filters,
      pagination: result.pagination,
      statusCounts: result.statusCounts,
    });
  } catch (error) {
    return next(error);
  }
};

exports.adminAcademyDetail = async (req, res, next) => {
  try {
    const detail = await getAdminAcademyDetail({
      adminUserId: req.apiUser._id,
      academyId: req.params.academyId,
      periodKey: req.query.period,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeAdminAcademyDetail(detail));
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

exports.removeTeacherStudent = async (req, res, next) => {
  try {
    await bulkManageAcademyStudents({
      teacherUserId: req.apiUser._id,
      membershipIds: [req.params.membershipId],
      action: "REMOVE",
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.teacherStudents = async (req, res, next) => {
  try {
    const [pageData, portal] = await Promise.all([
      getAcademyStudentPage({
        teacherUserId: req.apiUser._id,
        page: req.query.page,
      }),
      getAcademyPortalData(req.apiUser._id, { includeStudents: false }),
    ]);
    res.set("Cache-Control", "private, no-store");
    return res.json(serializeStudentPage(pageData, portal.academy, portal.classes));
  } catch (error) {
    return next(error);
  }
};

exports.teacherStudentDetail = async (req, res, next) => {
  try {
    const detail = await getAcademyStudentDetail({
      teacherUserId: req.apiUser._id,
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
    return res.json({
      academy: serializeAcademy(detail.academy),
      membership: serializeTeacherMembership(detail.membership),
      statistics: serializeStudentStatistics(statistics),
      mathMap: serializeStudentMathMap(mathMap),
    });
  } catch (error) {
    return next(error);
  }
};

exports.bulkManageTeacherStudents = async (req, res, next) => {
  try {
    const result = await bulkManageAcademyStudents({
      teacherUserId: req.apiUser._id,
      membershipIds: req.body.membershipIds,
      action: req.body.action,
      classId: req.body.classId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({
      action: result.action,
      count: Number(result.count || 0),
      modifiedCount: Number(result.modifiedCount || 0),
    });
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

exports.addTeacherClassCoTeacher = async (req, res, next) => {
  try {
    await addAcademyClassCoTeacher({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      coTeacherUserId: req.body.teacherUserId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.removeTeacherClassCoTeacher = async (req, res, next) => {
  try {
    await removeAcademyClassCoTeacher({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      coTeacherUserId: req.params.teacherUserId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(await teacherDashboardPayload(req.apiUser._id));
  } catch (error) {
    return next(error);
  }
};

exports.transferTeacherClassHomeroom = async (req, res, next) => {
  try {
    await transferAcademyClassHomeroom({
      teacherUserId: req.apiUser._id,
      classId: req.params.classId,
      nextTeacherUserId: req.body.nextTeacherUserId,
      keepPreviousAsCoTeacher: req.body.keepPreviousAsCoTeacher === true,
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
