"use strict";

const {
  acceptPrivateMockObjection,
  createPrivateMockExamBatch,
  createPrivateMockFormulaResource,
  correctPrivateMockAnswers,
  deletePrivateMockExam,
  deletePrivateMockFormulaResource,
  getAdminPrivateMockExamData,
  getAdminPrivateMockExamDetailData,
  getAdminPrivateMockIntegrityEvidenceFile,
  getAdminPrivateMockObjection,
  getAdminPrivateMockPdfFile,
  rejectPrivateMockObjection,
  requestPrivateMockIntegrityEvidenceByAdmin,
  reviewPrivateMockIntegrityCase,
} = require("../services/privateMockExamService");
const { discardArchiveUpload } = require("../services/archiveService");

const SCHEMA_VERSION = "ADMIN_WEEKLY_MOCK_NATIVE_V1";

function statusError(status, message) {
  const error = new Error(message); error.status = status; return error;
}
function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    throw statusError(403, "관리자만 주간 공식 모의고사를 관리할 수 있습니다.");
  }
  return req.apiUser;
}
function noStore(res) { res.set("Cache-Control", "private, no-store"); }
function id(value) { return String(value?._id || value?.id || value || ""); }
function number(value) { return Math.round(Number(value) || 0); }
function text(value) { return value == null ? "" : String(value); }
function person(value) {
  if (!value || typeof value !== "object") return null;
  return { id: id(value), name: text(value.realName || value.name || "탈퇴 사용자"), nickname: text(value.name), email: text(value.email) };
}
function examRow(value) {
  return {
    id: id(value), title: text(value.title), weekKey: text(value.weekKey), weekLabel: text(value.weekLabel),
    attemptNumber: number(value.attemptNumber), formCode: text(value.formCode), isTest: Boolean(value.isTest),
    releaseAt: value.releaseAt || null, closeAt: value.closeAt || null,
    aggregationStartsAt: value.aggregationStartsAt || null, rankingPublishesAt: value.rankingPublishesAt || null,
    archiveAt: value.archiveAt || null, status: text(value.status), questionCount: number(value.questionCount),
    attemptCount: number(value.attemptCount), integrityCaseCount: number(value.integrityCaseCount),
    notificationSentAt: value.notificationSentAt || null, rankingFinalizedAt: value.rankingFinalizedAt || null,
    archivedAt: value.archivedAt || null, canDelete: Boolean(value.canDelete), originalName: text(value.originalName),
    answerSheetName: text(value.answerSheetName), hasAnswerSheet: Boolean(value.answerSheetId || value.answerSheetFileHref),
  };
}
function explanation(value) {
  if (!value || typeof value !== "object") return null;
  return { intent: text(value.intent), concept: text(value.concept), steps: (value.steps || []).map(text), summary: text(value.summary), commonMistake: text(value.commonMistake) };
}
function reviewRow(value) {
  return { number: number(value.number), mode: text(value.mode), submittedAnswer: text(value.submittedAnswer), correctAnswer: text(value.correctAnswer), isCorrect: Boolean(value.isCorrect), points: number(value.points), explanation: explanation(value.explanation) };
}
function eventRow(value, index) {
  let metadata = "";
  try { metadata = value.metadata ? JSON.stringify(value.metadata) : ""; } catch (_error) { metadata = text(value.metadata); }
  return { id: id(value) || `event-${index}`, eventType: text(value.eventType), questionNumber: value.questionNumber == null ? null : number(value.questionNumber), metadata, serverAt: value.serverAt || value.createdAt || null };
}
function evidenceSubmission(value, index) {
  return {
    id: id(value) || text(value.receiptId) || `submission-${index}`, receiptId: text(value.receiptId),
    submittedAt: value.submittedAt || null, note: text(value.note),
    files: (value.files || []).map((file) => ({ archiveItemId: id(file.archiveItemId), originalName: text(file.originalName) })),
  };
}
function integrityCase(value) {
  if (!value) return null;
  return {
    id: id(value), status: text(value.status), riskScore: number(value.riskScore),
    requestedQuestionNumbers: (value.requestedQuestionNumbers || []).map(number),
    suspicionSignals: (value.suspicionSignals || []).map((signal) => ({ code: text(signal.code), detail: text(signal.detail) })),
    requestedAt: value.evidenceRequest?.requestedAt || null, instructions: text(value.evidenceRequest?.instructions),
    evidenceSubmissions: (value.evidenceSubmissions || []).map(evidenceSubmission),
    reviewStatus: text(value.reviewStatus || "unreviewed"), penaltyDecision: text(value.penaltyDecision || "pending"),
    decisionReason: text(value.decision?.reason), reviewedAt: value.decision?.reviewedAt || value.reviewedAt || null,
  };
}
function attemptRow(value, questionCount) {
  return {
    id: id(value), user: person(value.userId), status: text(value.status), score: number(value.score),
    correctCount: number(value.correctCount), questionCount: number(questionCount), elapsedMs: number(value.elapsedMs),
    integrityStatus: text(value.integrityStatus), incorrectQuestionNumbers: (value.incorrectQuestionNumbers || []).map(number),
    standardPerformance: value.standardMetrics?.calculatedAt == null ? null : Number(value.standardMetrics.actualPerformance || 0),
    submittedAt: value.submittedAt || null, review: (value.review || []).map(reviewRow),
    events: (value.events || []).map(eventRow), integrityCase: integrityCase(value.integrityCase),
  };
}
function objectionPayload(value) {
  return {
    id: id(value), user: person(value.userId), examId: id(value.examId), examTitle: text(value.examTitle || value.examId?.title),
    questionNumber: number(value.questionNumber), currentAnswer: text(value.currentAnswer), issueDetail: text(value.issueDetail),
    status: text(value.status), reviewReason: text(value.reviewReason), createdAt: value.createdAt || null, reviewedAt: value.reviewedAt || null,
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    requireAdmin(req); const data = await getAdminPrivateMockExamData(); noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, dashboard: {
      nextSunday: text(data.nextSunday), defaultExamDate: text(data.defaultExamDate),
      defaultDurationMinutes: number(data.defaultDurationMinutes),
      formSchedules: (data.formSchedules || []).map((item) => ({ formCode: text(item.formCode), attemptNumber: number(item.attemptNumber), label: text(item.label), fixedDate: item.fixedDate || null, isTest: Boolean(item.isTest), isCustom: Boolean(item.isCustom) })),
      formulaResources: (data.formulaResources || []).map((item) => ({ id: id(item), versionLabel: text(item.versionLabel), isActive: Boolean(item.isActive), originalName: text(item.originalName), createdAt: item.createdAt || null })),
      exams: (data.exams || []).map(examRow),
    }});
  } catch (error) { return next(error); }
};

exports.detail = async (req, res, next) => {
  try {
    requireAdmin(req); const data = await getAdminPrivateMockExamDetailData({ examId: req.params.examId }); noStore(res);
    const exam = examRow(data.exam);
    return res.json({ schemaVersion: SCHEMA_VERSION, detail: { exam, attempts: (data.attempts || []).map((item) => attemptRow(item, data.exam.questionCount)) } });
  } catch (error) { return next(error); }
};

function sendPrivateFile(res, file, { sandbox = false } = {}) {
  noStore(res); res.set("Referrer-Policy", "no-referrer");
  if (sandbox) {
    res.set("Content-Security-Policy", "sandbox; default-src 'none'");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cross-Origin-Resource-Policy", "same-origin");
  }
  if (file.cloudUrl) return res.redirect(302, file.cloudUrl);
  return res.sendFile(file.path, { headers: { "Content-Type": file.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`, "Cache-Control": "private, no-store" } });
}

exports.examFile = async (req, res, next) => {
  try { requireAdmin(req); return sendPrivateFile(res, await getAdminPrivateMockPdfFile({ examId: req.params.examId, fileType: req.params.fileType })); }
  catch (error) { return next(error); }
};
exports.evidenceFile = async (req, res, next) => {
  try { requireAdmin(req); return sendPrivateFile(res, await getAdminPrivateMockIntegrityEvidenceFile({ caseId: req.params.caseId, archiveItemId: req.params.archiveItemId }), { sandbox: true }); }
  catch (error) { return next(error); }
};

exports.requestIntegrityEvidence = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await requestPrivateMockIntegrityEvidenceByAdmin({ adminUserId: admin._id, examId: req.params.examId, attemptId: req.params.attemptId, requestedQuestionNumbers: req.body?.requestedQuestionNumbers, instructions: req.body?.instructions });
    noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) { return next(error); }
};

exports.reviewIntegrity = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await reviewPrivateMockIntegrityCase({ adminUserId: admin._id, examId: req.params.examId, caseId: req.params.caseId, reviewStatus: req.body?.reviewStatus, penaltyDecision: req.body?.penaltyDecision, reason: req.body?.reason });
    noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) { return next(error); }
};

exports.correctAnswers = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const result = await correctPrivateMockAnswers({ adminUserId: admin._id, examId: req.params.examId, corrections: Array.isArray(req.body?.corrections) ? req.body.corrections : [], reason: req.body?.reason });
    noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, affectedAttemptCount: number(result.affectedAttemptCount) });
  } catch (error) { return next(error); }
};

exports.deleteExam = async (req, res, next) => {
  try {
    const admin = requireAdmin(req); await deletePrivateMockExam({ user: admin, examId: req.params.examId }); noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) { return next(error); }
};

exports.createExams = async (req, res, next) => {
  try {
    const admin = requireAdmin(req); const files = req.files || {};
    const created = await createPrivateMockExamBatch({ user: admin, questionFiles: files.examFiles, answerKeyFiles: files.answerKeyFiles, answerSheetFiles: files.answerSheetFiles, titles: req.body?.titles, examDates: req.body?.examDates, customReleaseAts: req.body?.customReleaseAts, formCodes: req.body?.formCodes });
    noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, createdCount: created.length });
  } catch (error) {
    await Promise.all(Object.values(req.files || {}).flat().map((file) => discardArchiveUpload(file)));
    return next(error);
  }
};
exports.createFormula = async (req, res, next) => {
  try {
    const admin = requireAdmin(req); await createPrivateMockFormulaResource({ user: admin, file: req.file, versionLabel: req.body?.versionLabel });
    noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) { await discardArchiveUpload(req.file); return next(error); }
};
exports.deleteFormula = async (req, res, next) => {
  try { const admin = requireAdmin(req); await deletePrivateMockFormulaResource({ user: admin, resourceId: req.params.resourceId }); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true }); }
  catch (error) { return next(error); }
};

exports.objection = async (req, res, next) => {
  try { requireAdmin(req); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, objection: objectionPayload(await getAdminPrivateMockObjection({ objectionId: req.params.objectionId })) }); }
  catch (error) { return next(error); }
};
exports.rejectObjection = async (req, res, next) => {
  try { const admin = requireAdmin(req); await rejectPrivateMockObjection({ adminUserId: admin._id, objectionId: req.params.objectionId, reason: req.body?.reason }); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true }); }
  catch (error) { return next(error); }
};
exports.acceptObjection = async (req, res, next) => {
  try { const admin = requireAdmin(req); await acceptPrivateMockObjection({ adminUserId: admin._id, objectionId: req.params.objectionId, newAnswer: req.body?.newAnswer, questionContent: req.body?.questionContent, reason: req.body?.reason }); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true }); }
  catch (error) { return next(error); }
};

module.exports._private = { examRow, attemptRow, integrityCase, objectionPayload };
