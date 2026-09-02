"use strict";

const {
  createDirectNotification,
  getAdminAuditHistory,
  getAdminParentDetail,
  getAdminSanctionHistory,
  getAdminAssessmentDetail,
  getAdminUserActivityData,
  getAdminUserDetail,
  getAdminUsersData,
  sendDirectUserEmail,
  sendUserPasswordReset,
  revokeAdminParentChildLink,
  updateAdminParentChildNotifications,
  updateAdminParentStatus,
  updateUserAccountStatus,
  updateUserNickname,
  updateUserRole,
  updateUserWarningCount,
} = require("../services/adminService");
const {
  updateAdminPackageAccess,
} = require("../services/adminPackageAccessService");

const SCHEMA_VERSION = "ADMIN_USERS_NATIVE_V1";

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    throw statusError(403, "관리자만 사용자 정보를 관리할 수 있습니다.");
  }
  return req.apiUser;
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

function objectId(value) {
  if (!value) return "";
  return String(value._id || value.id || value);
}

function person(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: objectId(value),
    name: String(value.realName || value.name || value.username || "").trim(),
    nickname: String(value.name || value.username || "").trim(),
    email: String(value.email || "").trim(),
  };
}

function userRow(value) {
  const isParent = value.adminEntityType === "PARENT" || value.role === "parent";
  const accountStatus = String(
    value.accountStatus || (value.isActive === false ? "inactive" : "active")
  );
  return {
    id: objectId(value),
    entityType: isParent ? "PARENT" : "USER",
    name: String(value.name || value.username || "사용자"),
    realName: String(value.realName || ""),
    email: String(value.email || ""),
    role: isParent ? "parent" : String(value.role || "student"),
    school: value.school
      ? {
          code: String(value.school.code || ""),
          name: String(value.school.name || ""),
          region: String(value.school.region || ""),
        }
      : null,
    university: value.university
      ? {
          name: String(value.university.name || ""),
          region: String(value.university.region || ""),
        }
      : null,
    schoolGrade: Number(value.schoolGrade) ? Math.round(Number(value.schoolGrade)) : null,
    educationStatus: String(value.educationStatus || ""),
    isActive: value.isActive !== false,
    accountStatus,
    accountStatusReason: String(value.accountStatusReason || ""),
    suspendedUntil: value.suspendedUntil || null,
    warningCount: Math.round(Number(value.warningCount) || 0),
    totalStudySeconds: Math.round(Number(value.totalStudySeconds) || 0),
    totalConnectedSeconds: Math.round(Number(value.totalConnectedSeconds) || 0),
    currentStreak: Math.round(Number(value.currentStreak) || 0),
    longestStreak: Math.round(Number(value.longestStreak) || 0),
    lastStudyDate: value.lastStudyDate || null,
    lastLoginAt: value.lastLoginAt || null,
    createdAt: value.createdAt || null,
    teacherAccessExpiresAt: value.teacherAccessExpiresAt || null,
    identityVerificationStatus: String(value.identityVerificationStatus || ""),
    identityDuplicateAlertedAt: value.identityDuplicateAlertedAt || null,
    parentChildCount: Math.round(Number(value.parentChildCount) || 0),
    arenaActivityLevel: value.arenaActivityLevel
      ? {
          level: Math.round(Number(value.arenaActivityLevel.level) || 1),
          totalMatches: Math.round(Number(value.arenaActivityLevel.totalMatches) || 0),
          matchesToNext: Math.round(Number(value.arenaActivityLevel.matchesToNext) || 0),
          isMaxLevel: Boolean(value.arenaActivityLevel.isMaxLevel),
        }
      : null,
  };
}

function pagination(value) {
  return {
    page: Math.round(Number(value.page) || 1),
    total: Math.round(Number(value.total) || 0),
    totalPages: Math.round(Number(value.totalPages) || 1),
    perPage: Math.round(Number(value.perPage) || 20),
    hasPrevious: Number(value.page) > 1,
    hasNext: Number(value.page) < Number(value.totalPages),
  };
}

function compactPackage(value) {
  if (!value) return null;
  return {
    packageType: String(value.packageType || "FREE"),
    label: String(value.label || "기본학습 패키지"),
    availableLearningDays: Math.round(Number(value.cycle?.availableLearningDays) || 0),
    paybackScoreDays: Math.round(Number(value.cycle?.paybackScoreDays) || 0),
    endsAt: value.mockSubscription?.endsAt || value.cycle?.expiresAt || null,
  };
}

function compactProgress(value) {
  if (!value) return null;
  return {
    id: objectId(value),
    courseTitle: String(value.courseTitle || value.courseId || ""),
    unitTitle: String(value.unitTitle || value.unitId || ""),
    conceptTitle: String(value.conceptTitle || value.conceptId || ""),
    status: String(value.status || "not-started"),
    completionPercent: Math.round(Number(value.completionPercent) || 0),
    lastStudiedAt: value.lastStudiedAt || null,
  };
}

function compactRecord(value, kind) {
  return {
    id: `${kind}:${objectId(value)}`,
    kind,
    title: String(value.title || value.subject || value.action || "기록"),
    detail: String(value.message || value.detail || value.content || ""),
    status: String(value.status || (value.readAt ? "read" : "")),
    createdAt: value.createdAt || null,
  };
}

function userDetailPayload(detail) {
  const learning = detail.learning || {};
  return {
    user: userRow(detail.user),
    streak: detail.streak
      ? {
          current: Math.round(Number(detail.streak.current) || 0),
          longest: Math.round(Number(detail.streak.longest) || 0),
          lastStudyDate: detail.streak.lastStudyDate || null,
        }
      : null,
    learning: {
      currentConcept: compactProgress(learning.currentConcept),
      progressCount: Math.round(Number(learning.progressCount) || 0),
      completedCount: Math.round(Number(learning.completedCount) || 0),
      totalAttempts: Math.round(Number(learning.totalAttempts) || 0),
      correctAttempts: Math.round(Number(learning.correctAttempts) || 0),
      correctRate: Math.round(Number(learning.correctRate) || 0),
      progress: (learning.progress || []).map(compactProgress).filter(Boolean),
    },
    packageAccess: compactPackage(detail.packageAccess),
    arenaActivityLevel: detail.arenaActivityLevel
      ? {
          level: Math.round(Number(detail.arenaActivityLevel.level) || 1),
          totalMatches: Math.round(Number(detail.arenaActivityLevel.totalMatches) || 0),
          matchesToNext: Math.round(Number(detail.arenaActivityLevel.matchesToNext) || 0),
          isMaxLevel: Boolean(detail.arenaActivityLevel.isMaxLevel),
        }
      : null,
    identityMatches: (detail.identityMatches || []).map(userRow),
    assessments: (detail.assessments || []).slice(0, 20).map((item) => ({
      id: objectId(item),
      title: String(item.title || "평가"),
      status: String(item.displayStatus || item.status || ""),
      scorePercent: item.scorePercent == null ? null : Math.round(Number(item.scorePercent)),
      answeredCount: Math.round(Number(item.answeredCount) || 0),
      startedAt: item.startedAt || item.createdAt || null,
      submittedAt: item.submittedAt || null,
    })),
    records: [
      ...(detail.communityPosts || []).map((item) => compactRecord(item, "community")),
      ...(detail.inquiries || []).map((item) => compactRecord(item, "inquiry")),
      ...(detail.notifications || []).map((item) => compactRecord(item, "notification")),
      ...(detail.actionLogs || []).map((item) => compactRecord(item, "audit")),
    ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
    parent: null,
  };
}

function parentChild(value) {
  const child = value.child || {};
  const settings = value.link?.notificationSettings || {};
  return {
    id: objectId(child),
    name: String(child.name || "학생"),
    realName: String(child.realName || ""),
    email: String(child.email || ""),
    schoolName: String(child.school?.name || child.university?.name || ""),
    schoolGrade: Number(child.schoolGrade) ? Math.round(Number(child.schoolGrade)) : null,
    accountStatus: String(child.accountStatus || (child.isActive === false ? "inactive" : "active")),
    lastLoginAt: child.lastLoginAt || null,
    todayStudyMinutes: Math.round(Number(value.dashboard?.todayStudyMinutes) || 0),
    todaySolvedProblems: Math.round(Number(value.dashboard?.todaySolvedProblems) || 0),
    weeklyStudyMinutes: Math.round(Number(value.dashboard?.weeklyStudyMinutes) || 0),
    correctRate: Math.round(Number(value.dashboard?.correctRate) || 0),
    packageLabel: String(value.packageAccess?.label || "기본학습 패키지"),
    finalRank: value.ranking?.finalRank == null ? null : Math.round(Number(value.ranking.finalRank)),
    arenaRank: String(value.ranking?.arenaRank || ""),
    emailEnabled: settings.emailEnabled !== false,
    lowLearningEnabled: Boolean(settings.lowLearning?.enabled),
    minimumMinutesPerDay: Math.round(Number(settings.lowLearning?.minimumMinutesPerDay) || 20),
    lowLearningConsecutiveDays: Math.round(Number(settings.lowLearning?.consecutiveDays) || 3),
    inactivityEnabled: Boolean(settings.inactivity?.enabled),
    inactivityDays: Math.round(Number(settings.inactivity?.days) || 7),
  };
}

function parentDetailPayload(detail) {
  return {
    user: userRow({
      ...detail.parent,
      adminEntityType: "PARENT",
      name: detail.parent.username,
      role: "parent",
    }),
    streak: null,
    learning: {
      currentConcept: null,
      progressCount: 0,
      completedCount: 0,
      totalAttempts: 0,
      correctAttempts: 0,
      correctRate: 0,
      progress: [],
    },
    packageAccess: null,
    arenaActivityLevel: null,
    identityMatches: [],
    assessments: [],
    records: [
      ...(detail.checkoutIntents || []).map((item) => ({
        id: `purchase:${objectId(item)}`,
        kind: "purchase",
        title: String(item.productName || "결제 요청"),
        detail: `${Number(item.amount) || 0}원 · ${String(item.requestedBy || "")}`,
        status: String(item.status || ""),
        createdAt: item.createdAt || null,
      })),
      ...(detail.alertDeliveries || []).map((item) => ({
        id: `parent-alert:${objectId(item)}`,
        kind: "parent-alert",
        title: String(item.alertType || "학부모 알림"),
        detail: String(item.failureMessage || item.dateKey || ""),
        status: String(item.status || ""),
        createdAt: item.sentAt || item.createdAt || null,
      })),
      ...(detail.actionLogs || []).map((item) => compactRecord(item, "audit")),
    ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
    parent: {
      acceptedTermsAt: detail.parent.acceptedTermsAt || null,
      children: (detail.children || []).map(parentChild),
    },
  };
}

function auditRow(value) {
  return {
    id: objectId(value),
    action: String(value.action || ""),
    actionLabel: String(value.actionLabel || value.action || "관리 작업"),
    detail: String(value.detail || ""),
    actor: person(value.actor),
    target: person(value.target),
    createdAt: value.createdAt || null,
  };
}

async function refreshedUser(userId) {
  return userDetailPayload(await getAdminUserDetail(userId));
}

function displayValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch (_error) { return String(value); }
  }
  return String(value);
}

function activityRow(value, kind) {
  const time = value.occurredAt || value.submittedAt || value.startedAt || value.createdAt || null;
  const common = { id: objectId(value), kind, occurredAt: time };
  if (kind === "learning") return {
    ...common, title: String(value.eventType || "학습 행동"),
    subtitle: [value.courseId, value.unitId, value.conceptId].filter(Boolean).join(" · "),
    detail: `유형 ${value.topicIndex ?? "—"} · 단계 ${value.stepNumber ?? "—"} · ${Math.round(Number(value.durationMs) || 0)}ms`,
    status: value.correct == null ? "" : value.correct ? "correct" : "wrong",
    metadata: displayValue(value.metadata), attemptId: objectId(value.attemptId),
  };
  if (kind === "problems") return {
    ...common, title: String(value.problemSnapshot?.stem || value.problemId?.stem || "개념 문제"),
    subtitle: [value.courseId, value.unitId, value.conceptId].filter(Boolean).join(" · "),
    detail: `제출 ${displayValue(value.submittedAnswer)} · 정답 ${displayValue(value.problemId?.correctAnswer)} · ${Math.round(Number(value.responseTimeMs) || 0)}ms`,
    status: value.isCorrect ? "correct" : "wrong", metadata: "", attemptId: objectId(value.attemptId),
  };
  if (kind === "quick") return {
    ...common, title: String(value.prompt || "40초 눈풀이"),
    subtitle: `${value.pointValue || 0}점 · ${value.topicLabel || ""} · ${value.variantLabel || ""}`,
    detail: `제출 ${displayValue(value.submittedAnswer)} · 정답 ${displayValue(value.answer)} · ${Math.round(Number(value.responseTimeMs) || 0)}ms`,
    status: String(value.status || ""), metadata: String(value.solution || ""), attemptId: "",
  };
  if (kind === "assessments") return {
    ...common, title: String(value.title || "평가"),
    subtitle: [value.scopeType, value.courseId, value.unitId, value.subunitId].filter(Boolean).join(" · "),
    detail: `점수 ${value.scorePercent ?? "—"} · ${Math.round(Number(value.elapsedTimeMs) || 0)}ms`,
    status: String(value.status || ""), metadata: "", attemptId: objectId(value),
  };
  if (kind === "community") return {
    ...common, title: String(value.title || "게시글"), subtitle: String(value.boardType || "게시판"),
    detail: String(value.content || ""), status: String(value.status || ""),
    metadata: String(value.moderationReason || ""), attemptId: "",
  };
  return {
    ...common, title: String(value.action || "관리 작업"),
    subtitle: String(value.adminUserId?.name || value.adminUserId?.email || "운영자"),
    detail: String(value.detail || ""), status: "", metadata: displayValue(value.metadata), attemptId: "",
  };
}

function assessmentPayload(value) {
  const attempt = value.attempt || {};
  return {
    user: userRow(value.user),
    attempt: {
      id: objectId(attempt), title: String(attempt.title || "평가"),
      scopeType: String(attempt.scopeType || ""), status: String(attempt.displayStatus || attempt.status || ""),
      disqualifiedReason: String(attempt.disqualifiedReason || ""),
      scorePercent: attempt.scorePercent == null ? null : Math.round(Number(attempt.scorePercent)),
      earnedPoints: Math.round(Number(attempt.earnedPoints ?? attempt.score) || 0),
      totalPoints: Math.round(Number(attempt.totalPoints) || 0),
      elapsedTimeMs: Math.round(Number(attempt.elapsedTimeMs) || 0), passed: attempt.passed == null ? null : Boolean(attempt.passed),
      hasFinalScore: Boolean(attempt.hasFinalScore), answeredCount: Math.round(Number(attempt.answeredCount) || 0),
      startedAt: attempt.startedAt || attempt.createdAt || null, submittedAt: attempt.submittedAt || null,
      deadlineAt: attempt.deadlineAt || null,
      questions: (attempt.questions || []).map((question, index) => ({
        id: String(question.id || question._id || index), number: index + 1,
        prompt: String(question.prompt || question.stem || ""),
        choices: (question.choices || []).map((choice) => ({ key: String(choice.key || ""), text: String(choice.text || "") })),
        submittedAnswer: displayValue(question.submittedAnswer ?? question.selectedAnswer),
        answer: displayValue(question.answer), isCorrect: question.isCorrect == null ? null : Boolean(question.isCorrect),
        points: Math.round(Number(question.points) || 0), responseTimeMs: Math.round(Number(question.responseTimeMs) || 0),
        answerChanges: Math.round(Number(question.answerChanges) || 0),
        typeLabel: String(question.selectedTypeLabel || ""), solution: String(question.solution || ""),
      })),
    },
  };
}

exports.users = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminUsersData({
      query: req.query.query,
      schoolCode: req.query.school,
      grade: req.query.grade,
      state: req.query.state,
      role: req.query.role,
      page: req.query.page,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      users: {
        items: data.users.map(userRow),
        schools: data.schools.map((school) => ({
          code: String(school.code || ""),
          name: String(school.name || ""),
        })),
        filter: {
          query: String(data.filters.query || ""),
          schoolCode: String(data.filters.schoolCode || ""),
          grade: String(data.filters.grade || ""),
          state: String(data.filters.state || ""),
          role: String(data.filters.role || ""),
        },
        pagination: pagination(data),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.user = async (req, res, next) => {
  try {
    requireAdmin(req);
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      detail: await refreshedUser(req.params.userId),
    });
  } catch (error) {
    return next(error);
  }
};

exports.activity = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminUserActivityData({
      userId: req.params.userId, kind: req.query.kind, page: req.query.page,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      activity: {
        user: userRow(data.user), kind: String(data.kind || "learning"),
        items: (data.items || []).map((item) => activityRow(item, data.kind)),
        pagination: pagination(data.pagination),
      },
    });
  } catch (error) { return next(error); }
};

exports.assessment = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminAssessmentDetail({ userId: req.params.userId, attemptId: req.params.attemptId });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, assessment: assessmentPayload(data) });
  } catch (error) { return next(error); }
};

exports.parent = async (req, res, next) => {
  try {
    requireAdmin(req);
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      detail: parentDetailPayload(await getAdminParentDetail(req.params.parentId)),
    });
  } catch (error) {
    return next(error);
  }
};

exports.sanctions = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminSanctionHistory({ page: req.query.page });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      sanctions: {
        items: data.rows.map(auditRow),
        pagination: pagination(data.pagination),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.audit = async (req, res, next) => {
  try {
    requireAdmin(req);
    const data = await getAdminAuditHistory({
      page: req.query.page,
      adminUserId: req.query.admin,
      query: req.query.query,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      audit: {
        items: data.rows.map(auditRow),
        admins: data.admins.map(person).filter(Boolean),
        filter: data.filters,
        pagination: pagination(data.pagination),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.nicknameRequest = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateUserNickname({
      adminUserId: admin._id,
      userId: req.params.userId,
      reason: req.body?.reason,
      baseUrl: process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.notification = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await createDirectNotification({
      adminUserId: admin._id,
      userId: req.params.userId,
      title: req.body?.title,
      message: req.body?.message,
      href: req.body?.href,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.email = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const delivery = await sendDirectUserEmail({
      adminUserId: admin._id,
      userId: req.params.userId,
      subject: req.body?.subject,
      message: req.body?.message,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      delivered: Boolean(delivery?.delivered),
    });
  } catch (error) {
    return next(error);
  }
};

exports.passwordReset = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await sendUserPasswordReset({
      adminUserId: admin._id,
      userId: req.params.userId,
      baseUrl: process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

exports.role = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateUserRole({
      adminUserId: admin._id,
      userId: req.params.userId,
      role: req.body?.role,
      teacherAccessExpiresAt: req.body?.teacherAccessExpiresAt,
      reason: req.body?.reason,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: await refreshedUser(req.params.userId),
    });
  } catch (error) {
    return next(error);
  }
};

exports.accountStatus = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateUserAccountStatus({
      adminUserId: admin._id,
      userId: req.params.userId,
      status: req.body?.status,
      reason: req.body?.reason,
      suspensionDays: req.body?.suspensionDays,
      retainAnonymousData: req.body?.retainAnonymousData,
    });
    noStore(res);
    if (String(req.body?.status) === "withdrawn" &&
        String(req.body?.retainAnonymousData) === "purged") {
      return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, purged: true });
    }
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: await refreshedUser(req.params.userId),
    });
  } catch (error) {
    return next(error);
  }
};

exports.withdraw = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    if (String(req.body?.confirmation || "").trim() !== "계정삭제") {
      throw statusError(400, "확인란에 ‘계정삭제’를 정확히 입력해주세요.");
    }
    await updateUserAccountStatus({
      adminUserId: admin._id,
      userId: req.params.userId,
      status: "withdrawn",
      reason: req.body?.reason,
      retainAnonymousData: req.body?.dataRetention,
    });
    noStore(res);
    const purged = String(req.body?.dataRetention) === "purged";
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      purged,
      ...(purged ? {} : { detail: await refreshedUser(req.params.userId) }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.warnings = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateUserWarningCount({
      adminUserId: admin._id,
      userId: req.params.userId,
      warningCount: req.body?.warningCount,
      reason: req.body?.reason,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: await refreshedUser(req.params.userId),
    });
  } catch (error) {
    return next(error);
  }
};

exports.packageAccess = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateAdminPackageAccess({
      adminUserId: admin._id,
      userId: req.params.userId,
      packageType: req.body?.packageType,
      reason: req.body?.reason,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: await refreshedUser(req.params.userId),
    });
  } catch (error) {
    return next(error);
  }
};

exports.parentStatus = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateAdminParentStatus({
      adminUserId: admin._id,
      parentId: req.params.parentId,
      isActive: req.body?.isActive,
      reason: req.body?.reason,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: parentDetailPayload(await getAdminParentDetail(req.params.parentId)),
    });
  } catch (error) {
    return next(error);
  }
};

exports.parentChildNotifications = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await updateAdminParentChildNotifications({
      adminUserId: admin._id,
      parentId: req.params.parentId,
      childUserId: req.params.childUserId,
      input: req.body || {},
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: parentDetailPayload(await getAdminParentDetail(req.params.parentId)),
    });
  } catch (error) {
    return next(error);
  }
};

exports.parentChildUnlink = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await revokeAdminParentChildLink({
      adminUserId: admin._id,
      parentId: req.params.parentId,
      childUserId: req.params.childUserId,
      reason: req.body?.reason,
    });
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      detail: parentDetailPayload(await getAdminParentDetail(req.params.parentId)),
    });
  } catch (error) {
    return next(error);
  }
};
