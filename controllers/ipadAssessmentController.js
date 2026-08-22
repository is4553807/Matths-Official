/**
 * iPad 평가센터 Bearer adapter.
 * 생성·시간·채점·해금은 assessmentService/AssessmentAttempt 한 정본만 사용한다.
 */

const assessmentService = require("../services/assessmentService");

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function text(value) {
  return value == null ? "" : String(value);
}

function assessmentAttemptView(source) {
  const raw = source?.toObject ? source.toObject() : source || {};
  const terminal = raw.status === "submitted" || raw.status === "disqualified";
  const questions = (raw.questions || []).map((question, index) => ({
    id: text(question.questionId || `question-${index + 1}`),
    number: index + 1,
    typeKey: text(question.retryTypeId || question.typeId || "unknown"),
    prompt: text(question.prompt),
    choices: (question.choices || []).map((choice) => text(choice?.text ?? choice)),
    answer: terminal ? text(question.answer) : "",
    points: Math.round(Number(question.points) || 0),
    solution: terminal ? text(question.solution) : "",
    submittedAnswer: text(question.submittedAnswer),
    isCorrect: terminal ? question.isCorrect === true : null,
  }));
  const startedAt = iso(raw.startedAt || raw.createdAt);
  const timeLimitMs = Number(raw.timeLimitMs) || null;
  const deadlineAt = startedAt && timeLimitMs
    ? new Date(new Date(startedAt).getTime() + timeLimitMs).toISOString()
    : null;

  return {
    id: text(raw._id || raw.id),
    scope: text(raw.scopeType),
    courseId: text(raw.courseId),
    unitId: raw.unitId || null,
    subunitId: raw.subunitId || null,
    title: text(raw.title),
    status: text(raw.status),
    questions,
    answers: questions.map((question) => question.submittedAnswer),
    startedAt,
    deadlineAt,
    submittedAt: iso(raw.submittedAt),
    scorePercent: terminal ? Number(raw.scorePercent) || 0 : null,
    passed: terminal ? raw.passed === true : null,
    timeLimitMs,
    disqualified: raw.status === "disqualified",
    updatedAt: iso(raw.updatedAt || raw.submittedAt || raw.startedAt || raw.createdAt),
  };
}

function sendError(res, next, error) {
  if (error?.status) {
    return res.status(error.status).json({
      code: error.code || null,
      message: error.message,
      ...(error.remainingTimeMs == null
        ? {}
        : { remainingTimeMs: error.remainingTimeMs }),
    });
  }
  return next(error);
}

function answers(req) {
  return req.body?.answers && typeof req.body.answers === "object"
    ? req.body.answers
    : {};
}

function createIpadAssessmentController(service = assessmentService) {
  return {
    list: async (req, res, next) => {
      try {
        const attempts = await service.listAssessmentAttempts({ userId: req.apiUser._id });
        return res.json({ assessments: attempts.map(assessmentAttemptView) });
      } catch (error) { return sendError(res, next, error); }
    },

    start: async (req, res, next) => {
      try {
        const attempt = await service.createAssessmentAttempt({
          userId: req.apiUser._id,
          scopeType: text(req.body?.scopeType),
          courseId: text(req.body?.courseId),
          unitId: text(req.body?.unitId) || null,
          subunitId: text(req.body?.subunitId) || null,
          clientStartId: text(req.body?.clientStartId),
          resumeEmpty: true,
        });
        return res.json({ assessment: assessmentAttemptView(attempt) });
      } catch (error) { return sendError(res, next, error); }
    },

    get: async (req, res, next) => {
      try {
        const attempt = await service.getAssessmentAttempt({
          userId: req.apiUser._id,
          attemptId: req.params.attemptId,
        });
        return res.json({ assessment: assessmentAttemptView(attempt) });
      } catch (error) { return sendError(res, next, error); }
    },

    saveDraft: async (req, res, next) => {
      try {
        const draft = await service.saveAssessmentDraft({
          userId: req.apiUser._id,
          attemptId: req.params.attemptId,
          answers: answers(req),
        });
        return res.json({ draft });
      } catch (error) { return sendError(res, next, error); }
    },

    submit: async (req, res, next) => {
      try {
        const attempt = await service.submitAssessmentAttempt({
          userId: req.apiUser._id,
          attemptId: req.params.attemptId,
          answers: answers(req),
        });
        return res.json({ assessment: assessmentAttemptView(attempt) });
      } catch (error) { return sendError(res, next, error); }
    },

    expire: async (req, res, next) => {
      try {
        const attempt = await service.expireAssessmentAttempt({
          userId: req.apiUser._id,
          attemptId: req.params.attemptId,
          answers: answers(req),
        });
        return res.json({ assessment: assessmentAttemptView(attempt) });
      } catch (error) { return sendError(res, next, error); }
    },
  };
}

const controller = createIpadAssessmentController();
module.exports = {
  ...controller,
  assessmentAttemptView,
  createIpadAssessmentController,
};
