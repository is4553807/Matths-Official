/**
 * iPad 배치고사 Bearer API (/api/v1/placement-exam/*)
 *
 * 웹 placementExamService 를 그대로 재사용하고, 세션 대신 requireApiAuth
 * (req.apiUser) 로 인증한다. 웹은 EJS 뷰모델·redirect 로 말하지만 앱은
 * JSON 계약(ServerAPI.swift 의 PlacementStatus/Attempt/Result 디코딩)으로
 * 말하므로, 이 파일의 뷰 빌더가 그 번역을 전담한다.
 *
 * 번역 규칙 (앱 계약이 갑이다)
 *  - phase: 검증 대기(verification.result === "pending")면 "verification",
 *    종결 상태(submitted/abandoned/disqualified)면 "completed", 그 외 "exam".
 *  - 앱 타이머는 deadlineAt 만 본다 — 시험은 startedAt+timeLimitMs,
 *    검증은 verification.startedAt+timeLimitMs(기본 40분)로 서버가 계산해 준다.
 *  - result 의 tierCode 는 앱 RankTier(serverCode:) 가 읽는 대문자 코드
 *    (mmrService TIER_CONFIG.name)다. 한국어 라벨은 tierLabel 로만 나간다.
 *  - presentation 은 티어 공개 오버레이용 최소 정보만 만든다(별도 저장 없음).
 */

const {
  getPlacementDashboardData,
  createPlacementAttempt,
  getPlacementAttempt,
  savePlacementDraft,
  submitPlacementAttempt,
  expirePlacementAttempt,
} = require("../services/placementExamService");
const {
  ensureRankingProfile,
  rankingProfileView,
} = require("../services/mmrService");

const PLACEMENT_TIME_LIMIT_FALLBACK_MS = 100 * 60 * 1000;
const VERIFICATION_TIME_LIMIT_FALLBACK_MS = 40 * 60 * 1000;
const TERMINAL_STATUSES = ["submitted", "abandoned", "disqualified"];

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isAnswered(value) {
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

function questionView(question, index) {
  const raw = question?.toObject ? question.toObject() : question || {};
  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((choice) =>
        typeof choice === "string"
          ? { key: choice, text: choice }
          : { key: String(choice.key ?? ""), text: String(choice.text ?? "") }
      )
    : [];
  return {
    // 서비스의 답안 매칭 키는 서브도큐먼트 _id 가 아니라 questionId 필드다
    // (applyAnswers/questionById 참조). 앱이 이 id 를 answers 키로 되돌려준다.
    id: String(raw.questionId ?? raw._id ?? raw.id ?? `q-${index + 1}`),
    number: Number(raw.placementNumber ?? raw.number ?? index + 1),
    prompt: String(raw.prompt ?? raw.questionText ?? ""),
    inputMode:
      raw.inputMode || (choices.length ? "multiple-choice" : "short-answer"),
    choices,
    points: Number(raw.points ?? 0),
    submittedAnswer: String(raw.submittedAnswer ?? ""),
    responseTimeMs: Number(raw.responseTimeMs ?? 0),
    visitCount: Number(raw.visitCount ?? 0),
  };
}

function verificationOf(doc) {
  return doc?.placementResult?.verification || null;
}

function isVerificationPhase(doc) {
  return doc?.status === "submitted" && verificationOf(doc)?.result === "pending";
}

async function resultView(doc) {
  if (doc?.status !== "submitted" || isVerificationPhase(doc)) return null;
  const placementResult = doc.placementResult || {};
  const three = placementResult.threePoint || {};
  const four = placementResult.fourPoint || {};
  const profile = rankingProfileView(await ensureRankingProfile(doc.userId));

  return {
    attemptId: String(doc._id),
    status: doc.status,
    totalCorrect:
      (Number(three.correct) || 0) + (Number(four.correct) || 0),
    placementScore: Number(placementResult.placementScore) || 0,
    initialMmr:
      placementResult.initialMmr ?? profile?.mmr ?? null,
    tierCode: profile?.tier || "BRONZE",
    tierLabel: profile?.tierLabel || placementResult.initialTier || "브론즈",
    rankPoint: profile?.rankPoint ?? null,
    rankingStatus:
      placementResult.rankingStatus || profile?.status || "provisional",
    percentile: placementResult.percentile ?? null,
    verificationRequired: verificationOf(doc)?.result === "pending",
    presentationId: null,
  };
}

function buildPlacementPresentation(result, attemptId) {
  if (!result) return null;
  return {
    id: `placement-${attemptId}`,
    kind: "placement",
    tierCode: result.tierCode,
    tierLabel: result.tierLabel,
  };
}

async function attemptView(doc) {
  const verificationPhase = isVerificationPhase(doc);
  const completed =
    TERMINAL_STATUSES.includes(doc.status) && !verificationPhase;
  const verification = verificationOf(doc);

  const sourceQuestions = verificationPhase
    ? verification?.questions || []
    : doc.questions || [];
  const questions = sourceQuestions.map(questionView);

  let deadlineAt = null;
  if (verificationPhase && verification?.startedAt) {
    deadlineAt = iso(
      new Date(verification.startedAt).getTime() +
        (Number(verification.timeLimitMs) || VERIFICATION_TIME_LIMIT_FALLBACK_MS)
    );
  } else if (!completed && doc.startedAt) {
    deadlineAt = iso(
      new Date(doc.startedAt).getTime() +
        (Number(doc.timeLimitMs) || PLACEMENT_TIME_LIMIT_FALLBACK_MS)
    );
  }

  const result = await resultView(doc);
  return {
    id: String(doc._id),
    phase: verificationPhase ? "verification" : completed ? "completed" : "exam",
    status: doc.status,
    purpose: doc.placementPurpose || "INITIAL",
    title: "GOAT Arena 배치고사",
    subtitle: verificationPhase ? "추가 실력 확인 문항" : "30문항 · 100분",
    timeLimitMs: verificationPhase
      ? Number(verification?.timeLimitMs) || VERIFICATION_TIME_LIMIT_FALLBACK_MS
      : Number(doc.timeLimitMs) || PLACEMENT_TIME_LIMIT_FALLBACK_MS,
    startedAt: iso(verificationPhase ? verification?.startedAt : doc.startedAt),
    deadlineAt,
    submittedAt: iso(doc.submittedAt),
    elapsedTimeMs: Number(doc.elapsedTimeMs) || 0,
    currentQuestionIndex: Number(doc.currentQuestionIndex) || 0,
    answeredCount: questions.filter((q) => isAnswered(q.submittedAnswer)).length,
    questionCount: questions.length,
    questions,
    result,
    presentation: buildPlacementPresentation(result, String(doc._id)),
  };
}

function sendError(res, next, error) {
  if (error?.status) {
    return res.status(error.status).json({ message: error.message });
  }
  return next(error);
}

function bodyParams(req) {
  return {
    answers: req.body?.answers || {},
    activeQuestionId: req.body?.activeQuestionId || "",
    currentQuestionIndex: Number(req.body?.currentQuestionIndex) || 0,
  };
}

exports.getStatus = async (req, res, next) => {
  try {
    const dashboard = await getPlacementDashboardData(req.apiUser._id);
    let result = null;
    let presentation = null;
    // 대시보드의 result 는 웹 카드용 요약이라 앱 Result 계약(placementScore·
    // tierCode 필수)에 못 미친다 — 제출 완료면 시도 문서에서 완전한 결과를 만든다.
    if (dashboard.status === "submitted" && dashboard.attemptId) {
      const doc = await getPlacementAttempt({
        userId: req.apiUser._id,
        attemptId: dashboard.attemptId,
      });
      result = await resultView(doc);
      presentation = buildPlacementPresentation(result, dashboard.attemptId);
    }
    return res.json({
      placement: {
        status: dashboard.status,
        attemptId: dashboard.attemptId,
        answeredCount: Number(dashboard.answeredCount) || 0,
        ctaLabel: dashboard.ctaLabel || "",
        result,
        presentation,
      },
    });
  } catch (error) {
    return sendError(res, next, error);
  }
};

exports.start = async (req, res, next) => {
  try {
    const doc = await createPlacementAttempt({ userId: req.apiUser._id });
    return res.json({ attempt: await attemptView(doc) });
  } catch (error) {
    return sendError(res, next, error);
  }
};

exports.getAttempt = async (req, res, next) => {
  try {
    const doc = await getPlacementAttempt({
      userId: req.apiUser._id,
      attemptId: req.params.attemptId,
    });
    return res.json({ attempt: await attemptView(doc) });
  } catch (error) {
    return sendError(res, next, error);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const draft = await savePlacementDraft({
      userId: req.apiUser._id,
      attemptId: req.params.attemptId,
      ...bodyParams(req),
      closeQuestionTiming: req.body?.closeQuestionTiming === true,
    });
    // 서비스는 정상 저장/종결 감지에 따라 두 형태를 돌려준다 — 앱 Draft 계약
    // (elapsedTimeMs·answeredCount·currentQuestionIndex 필수)으로 평탄화한다.
    return res.json({
      draft: {
        savedAt: iso(draft.savedAt),
        elapsedTimeMs: Number(draft.elapsedTimeMs) || 0,
        answeredCount: Number(draft.answeredCount) || 0,
        currentQuestionIndex: Number(draft.currentQuestionIndex) || 0,
        status: draft.status ?? null,
        expired: draft.expired === true,
      },
    });
  } catch (error) {
    return sendError(res, next, error);
  }
};

async function finish(kind, req, res, next) {
  try {
    const mutate = kind === "submit" ? submitPlacementAttempt : expirePlacementAttempt;
    const doc = await mutate({
      userId: req.apiUser._id,
      attemptId: req.params.attemptId,
      ...bodyParams(req),
    });
    const attempt = await attemptView(doc);
    return res.json({
      attempt,
      result: attempt.result,
      presentation: attempt.presentation,
    });
  } catch (error) {
    return sendError(res, next, error);
  }
}

exports.submit = (req, res, next) => finish("submit", req, res, next);
exports.expire = (req, res, next) => finish("expire", req, res, next);
exports.buildPlacementPresentation = buildPlacementPresentation;
