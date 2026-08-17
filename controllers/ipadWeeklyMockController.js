/**
 * iPad 주간 공식 모의고사 Bearer API.
 *
 * 시험 공개 시각, 응시 자격, 채점, 대표 성적, 무결성 상태와 문제지 접근은
 * privateMockExamService가 유일한 정본이다. 이 컨트롤러는 세션/EJS용 뷰모델을
 * WeeklyMockAPI.swift가 읽는 JSON으로 번역할 뿐 규칙이나 저장소를 갖지 않는다.
 */

const privateMockExamService = require(
  "../services/privateMockExamService"
);
const {
  recordStudyActivity,
} = require("../services/userLifecycleService");
const {
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");
const {
  discardArchiveUpload,
} = require("../services/archiveService");

function plain(value) {
  return value?.toObject
    ? value.toObject()
    : value || {};
}

function id(value) {
  if (value == null) return null;
  return String(value?._id || value?.id || value);
}

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function examSummaryView(exam, dashboard) {
  const raw = plain(exam);
  const examId = id(raw);
  const isCurrent =
    examId &&
    examId === id(dashboard?.currentExam);
  const current = isCurrent
    ? plain(dashboard.currentExam)
    : null;

  return {
    id: examId || "",
    title: String(raw.title || "Matths 주간 공식 모의고사"),
    formCode: String(raw.formCode || ""),
    attemptNumber: Number(raw.attemptNumber) || 0,
    isTest: Boolean(raw.isTest),
    questionCount: Number(raw.questionCount) || 30,
    durationMinutes:
      Number(raw.durationMinutes) ||
      Number(dashboard?.durationMinutes) ||
      100,
    releaseAt: iso(raw.releaseAt),
    closeAt: iso(raw.closeAt),
    lobbyOpensAt: iso(raw.lobbyOpensAt),
    status: String(raw.status || "scheduled"),
    canEnterRoom: Boolean(
      raw.canEnterRoom ?? current?.canEnterRoom
    ),
    canStart: Boolean(
      raw.canStart ?? current?.canStart
    ),
    attemptStatus: String(raw.attemptStatus || "new"),
    answeredCount: Number(raw.answeredCount) || 0,
    score:
      raw.score == null
        ? null
        : Number(raw.score),
    standardizedPerformance:
      raw.standardizedPerformance == null
        ? null
        : Number(raw.standardizedPerformance),
    detailPath: examId
      ? `/api/v1/weekly-mock-exams/${examId}`
      : null,
    paperPath: examId
      ? `/api/v1/weekly-mock-exams/${examId}/paper`
      : null,
  };
}

function dashboardView(data) {
  const raw = plain(data);
  return {
    eligibility: plain(raw.eligibility),
    serverNow: iso(raw.serverNow),
    nextReleaseAt: iso(raw.nextReleaseAt),
    latestReleaseAt: iso(raw.latestReleaseAt),
    scheduleLabel: String(raw.scheduleLabel || ""),
    durationMinutes: Number(raw.durationMinutes) || 100,
    currentExam: raw.currentExam
      ? examSummaryView(raw.currentExam, raw)
      : null,
    weeklyExams: (raw.weeklyExams || []).map((exam) =>
      examSummaryView(exam, raw)
    ),
    selection: raw.selection || null,
    rankingTitle: String(raw.rankingTitle || "이번 주 랭킹"),
    rankingFinalized: Boolean(raw.rankingFinalized),
    rankingPending: raw.rankingPending || null,
    rankingSummary: raw.rankingSummary || null,
    weeklyRanking: raw.weeklyRanking || [],
    rankingRules: raw.rankingRules || [],
  };
}

function integrityCaseIdFrom(raw) {
  const direct = id(raw?.integrityCaseId || raw?.caseId);
  if (direct) return direct;
  const match = String(raw?.href || "").match(/\/integrity\/cases\/([^/?#]+)/);
  return match ? match[1] : "";
}

function attemptView(data) {
  const raw = plain(data);
  const exam = plain(raw.exam);
  const examId = id(exam) || "";
  const submitted = Boolean(raw.submitted);
  const notStarted = Boolean(raw.notStarted);
  const state = submitted
    ? "submitted"
    : notStarted
      ? "lobby"
      : "in-progress";
  const integrity = raw.integrityReview
    ? plain(raw.integrityReview)
    : null;
  const caseId = integrityCaseIdFrom(integrity);

  return {
    state,
    submitted,
    serverNow: iso(raw.serverNow),
    deadline: iso(raw.deadline),
    releaseAt: iso(raw.releaseAt),
    canStart:
      raw.canStart == null
        ? null
        : Boolean(raw.canStart),
    pendingAggregation:
      raw.pendingAggregation == null
        ? null
        : Boolean(raw.pendingAggregation),
    resultsAvailableAt: iso(raw.resultsAvailableAt),
    reviewAvailable:
      raw.reviewAvailable == null
        ? null
        : Boolean(raw.reviewAvailable),
    reviewPublishesAt: iso(raw.reviewPublishesAt),
    exam: {
      id: examId,
      title: String(exam.title || "Matths 주간 공식 모의고사"),
      weekKey: exam.weekKey || null,
      formCode: String(exam.formCode || ""),
      attemptNumber: Number(exam.attemptNumber) || 0,
      isTest: Boolean(exam.isTest),
      questionCount:
        exam.questionCount == null
          ? null
          : Number(exam.questionCount),
      questionModes: Array.isArray(exam.questionModes)
        ? exam.questionModes
        : null,
      durationMinutes:
        exam.durationMinutes == null
          ? null
          : Number(exam.durationMinutes),
      paperPath: examId
        ? `/api/v1/weekly-mock-exams/${examId}/paper`
        : null,
    },
    attempt: raw.attempt
      ? {
          id: id(raw.attempt) || "",
          answers: Array.isArray(raw.attempt.answers)
            ? raw.attempt.answers.map((answer) => String(answer || ""))
            : [],
          answeredCount: Number(raw.attempt.answeredCount) || 0,
        }
      : null,
    tools: raw.lobbyTools?.formulaHref
      ? { formulaPath: String(raw.lobbyTools.formulaHref) }
      : null,
    result: raw.result || null,
    selection: raw.selection || null,
    integrityReview: integrity
      ? {
          status: String(integrity.status || ""),
          caseId,
          detailPath: caseId
            ? `/api/v1/weekly-mock-exams/integrity-cases/${caseId}`
            : "",
        }
      : null,
    review: Array.isArray(raw.review)
      ? raw.review
      : null,
  };
}

function integrityCaseView(value, now = new Date()) {
  const raw = plain(value);
  const exam = plain(raw.examId || raw.exam);
  const request = plain(raw.evidenceRequest);
  const deadline = request.deadlineAt
    ? new Date(request.deadlineAt)
    : null;
  const canSubmit =
    raw.canSubmit != null
      ? Boolean(raw.canSubmit)
      : ["EVIDENCE_REQUIRED", "INSUFFICIENT_EVIDENCE"].includes(raw.status) &&
        deadline &&
        deadline > now;

  return {
    id: id(raw) || "",
    exam: raw.examId || raw.exam
      ? {
          id: id(exam),
          title: String(exam.title || "Matths 주간 공식 모의고사"),
          formCode: String(exam.formCode || ""),
          releaseAt: iso(exam.releaseAt),
        }
      : null,
    attemptId: id(raw.attemptId),
    weekKey: String(raw.weekKey || ""),
    status: String(raw.status || ""),
    requestedQuestionNumbers: Array.isArray(raw.requestedQuestionNumbers)
      ? raw.requestedQuestionNumbers.map(Number)
      : [],
    evidenceRequest: {
      requestedAt: iso(request.requestedAt),
      deadlineAt: iso(request.deadlineAt),
      instructions: String(request.instructions || ""),
    },
    evidenceSubmissions: (raw.evidenceSubmissions || []).map((submission) => ({
      receiptId: String(submission.receiptId || ""),
      submittedAt: iso(submission.submittedAt),
      note: String(submission.note || ""),
      files: (submission.files || []).map((file) => ({
        originalName: String(file.originalName || ""),
        mimeType: String(file.mimeType || "application/octet-stream"),
        sizeBytes: Number(file.sizeBytes) || 0,
        uploadedAt: iso(file.uploadedAt),
      })),
    })),
    reviewStatus: String(raw.reviewStatus || "unreviewed"),
    penaltyDecision: String(raw.penaltyDecision || "pending"),
    decision: {
      result: String(raw.decision?.result || ""),
      reason: String(raw.decision?.reason || ""),
      decidedAt: iso(raw.decision?.decidedAt),
    },
    canSubmit,
  };
}

function objectionView(value) {
  const raw = plain(value);
  return {
    id: id(raw) || "",
    examId: id(raw.examId),
    examTitle: String(raw.examTitle || "Matths 주간 공식 모의고사"),
    questionNumber: Number(raw.questionNumber) || 0,
    issueDetail: String(raw.issueDetail || ""),
    status: String(raw.status || "pending"),
    reviewReason: String(raw.reviewReason || ""),
    reviewedAt: iso(raw.reviewedAt),
    createdAt: iso(raw.createdAt),
  };
}

function createIpadWeeklyMockController({
  service = privateMockExamService,
  recordActivity = recordStudyActivity,
  pdfIsDownload = isPdfDownload,
  personalizePdf = issuePersonalizedPdf,
  discardUpload = discardArchiveUpload,
} = {}) {
  async function dashboard(req, res, next) {
    try {
      const data = await service.getPrivateMockExamPageData(req.apiUser._id);
      res.set("Cache-Control", "private, no-store");
      return res.json({ weeklyMock: dashboardView(data) });
    } catch (error) {
      return next(error);
    }
  }

  async function getAttempt(req, res, next) {
    try {
      const data = await service.getPrivateMockAttemptData({
        userId: req.apiUser._id,
        examId: req.params.examId,
      });
      res.set("Cache-Control", "private, no-store");
      return res.json({ attempt: attemptView(data) });
    } catch (error) {
      return next(error);
    }
  }

  async function start(req, res, next) {
    try {
      await service.startPrivateMockAttempt({
        userId: req.apiUser._id,
        examId: req.params.examId,
      });
      const data = await service.getPrivateMockAttemptData({
        userId: req.apiUser._id,
        examId: req.params.examId,
      });
      return res.json({
        replayed: false,
        attempt: attemptView(data),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function saveDraft(req, res, next) {
    try {
      const draft = await service.savePrivateMockDraft({
        userId: req.apiUser._id,
        examId: req.params.examId,
        answers: req.body?.answers,
        telemetryEvents: req.body?.telemetryEvents,
      });
      return res.json({
        draft: {
          replayed: false,
          submitted: false,
          answeredCount: Number(draft.answeredCount) || 0,
          savedAt: iso(draft.savedAt),
          attempt: null,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async function submit(req, res, next) {
    try {
      const result = await service.submitPrivateMockAttempt({
        userId: req.apiUser._id,
        examId: req.params.examId,
        answers: req.body?.answers,
        telemetryEvents: req.body?.telemetryEvents,
      });
      await recordActivity(req.apiUser._id, new Date(), result.elapsedMs);
      const data = await service.getPrivateMockAttemptData({
        userId: req.apiUser._id,
        examId: req.params.examId,
      });
      return res.json({
        submitted: true,
        replayed: false,
        result,
        attempt: attemptView(data),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function expire(req, res, next) {
    try {
      const data = await service.getPrivateMockAttemptData({
        userId: req.apiUser._id,
        examId: req.params.examId,
      });
      if (!data.submitted && !data.notStarted) {
        const error = new Error("서버 제한 시간이 아직 남아 있습니다.");
        error.status = 409;
        return next(error);
      }
      return res.json({
        expired: false,
        replayed: true,
        state: data.submitted ? "submitted" : "lobby",
        attemptId: id(data.attempt),
        attempt: attemptView(data),
      });
    } catch (error) {
      // getPrivateMockAttemptData가 서버 시각으로 기한을 판정하고 기존 서비스의
      // expired 상태를 저장한다. API는 그 정본 결과만 성공 응답으로 번역한다.
      if (Number(error?.status) === 410) {
        return res.json({
          expired: true,
          replayed: false,
          state: "expired",
          attemptId: null,
          attempt: null,
        });
      }
      return next(error);
    }
  }

  async function selectRepresentative(req, res, next) {
    try {
      const selection = await service.selectPrivateMockWeeklyAttempt({
        userId: req.apiUser._id,
        weekKey: req.params.weekKey,
        attemptId: req.body?.attemptId,
        defer:
          req.body?.defer === true ||
          req.body?.defer === "true",
      });
      return res.json({ selected: true, selection });
    } catch (error) {
      return next(error);
    }
  }

  async function integrityCases(req, res, next) {
    try {
      const cases = await service.getUserPrivateMockIntegrityCases({
        userId: req.apiUser._id,
      });
      return res.json({
        integrityCases: cases.map((item) => integrityCaseView(item)),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function integrityCase(req, res, next) {
    try {
      const item = await service.getUserIntegrityCase({
        userId: req.apiUser._id,
        caseId: req.params.caseId,
      });
      return res.json({ integrityCase: integrityCaseView(item) });
    } catch (error) {
      return next(error);
    }
  }

  async function submitEvidence(req, res, next) {
    try {
      const evidence = await service.submitPrivateMockIntegrityEvidence({
        userId: req.apiUser._id,
        caseId: req.params.caseId,
        files: req.files,
        note: req.body?.note,
        submissionId:
          req.get?.("Idempotency-Key") ||
          req.headers?.["idempotency-key"],
      });
      return res.json({
        evidence,
      });
    } catch (error) {
      await Promise.allSettled(
        (req.files || [])
          .filter((file) =>
            !file?.storageAsset
          )
          .map((file) =>
            discardUpload(file)
          )
      );
      return next(error);
    }
  }

  async function objectionOptions(req, res, next) {
    try {
      const form = await service.getPrivateMockObjectionFormData({
        userId: req.apiUser._id,
      });
      return res.json({ exams: form.exams || [] });
    } catch (error) {
      return next(error);
    }
  }

  async function objections(req, res, next) {
    try {
      const items = await service.getUserPrivateMockObjections({
        userId: req.apiUser._id,
      });
      return res.json({ objections: items.map(objectionView) });
    } catch (error) {
      return next(error);
    }
  }

  async function createObjection(req, res, next) {
    try {
      const objection = await service.createPrivateMockObjection({
        userId: req.apiUser._id,
        examId: req.body?.examId,
        questionNumber: req.body?.questionNumber,
        issueDetail: req.body?.issueDetail,
      });
      return res.json({
        replayed: false,
        objection: objectionView(objection),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function paper(req, res, next) {
    try {
      const file = await service.getPrivateMockExamFile({
        userId: req.apiUser._id,
        examId: req.params.examId,
      });

      if (pdfIsDownload({ mimeType: file.mimeType, name: file.name })) {
        const issued = await personalizePdf({
          userId: req.apiUser._id,
          examId: file.examId,
          sourceType: "WEEKLY_MOCK",
          sourceId: file.sourceId,
          originalName: file.name,
          storageRecord: file.sourceRecord,
          localPath: file.path,
        });
        const cleanup = () => issued.cleanup().catch(() => {});
        res.once("finish", cleanup);
        res.once("close", cleanup);
        return res.sendFile(
          issued.filePath,
          {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition":
                `inline; filename*=UTF-8''${encodeURIComponent(issued.downloadName)}`,
              "Cache-Control": "private, no-store",
              "X-Matths-Trace": issued.traceCode,
            },
          },
          (error) => {
            cleanup();
            if (error && !res.headersSent) return next(error);
            return undefined;
          }
        );
      }

      if (file.cloudUrl) {
        res.set("Cache-Control", "private, no-store");
        res.set("Referrer-Policy", "no-referrer");
        return res.redirect(302, file.cloudUrl);
      }

      return res.sendFile(file.path, {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition":
            `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  return {
    dashboard,
    getAttempt,
    start,
    saveDraft,
    submit,
    expire,
    selectRepresentative,
    integrityCases,
    integrityCase,
    submitEvidence,
    objectionOptions,
    objections,
    createObjection,
    paper,
  };
}

module.exports = {
  createIpadWeeklyMockController,
  ...createIpadWeeklyMockController(),
};
