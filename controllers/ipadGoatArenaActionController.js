const MAX_COMMAND_KEY_LENGTH = 180;
const MAX_CLIENT_BUILD_LENGTH = 100;
const DECLINE_REASONS = new Set([
  "SCHEDULE_CONFLICT",
  "TECHNICAL_ISSUE",
  "OTHER",
]);

class IpadGoatArenaActionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "IpadGoatArenaActionError";
    this.code = code;
    this.status = status;
    this.statusCode = status;
  }
}

function fail(code, message, status = 400) {
  throw new IpadGoatArenaActionError(code, message, status);
}

function requiredHeader(req, name, maximumLength) {
  const value = typeof req.get === "function"
    ? req.get(name)
    : req.headers?.[name.toLowerCase()];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximumLength
  ) {
    fail(
      "GOAT_ARENA_COMMAND_HEADER_REQUIRED",
      "요청 식별 정보를 확인한 뒤 다시 시도해주세요."
    );
  }
  return value.trim();
}

function commandContext(req) {
  if (!req.apiUser?._id) {
    fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
  }
  return {
    userId: req.apiUser._id,
    requestId: requiredHeader(req, "Idempotency-Key", MAX_COMMAND_KEY_LENGTH),
    clientBuildVersion: requiredHeader(
      req,
      "X-Matths-Client-Version",
      MAX_CLIENT_BUILD_LENGTH
    ),
  };
}

function strictBody(req, allowedFields) {
  const body = req.body === undefined || req.body === null ? {} : req.body;
  if (typeof body !== "object" || Array.isArray(body)) {
    fail("GOAT_ARENA_COMMAND_BODY_INVALID", "요청 형식을 확인해주세요.");
  }
  const allowed = new Set(allowedFields);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    fail(
      "GOAT_ARENA_COMMAND_BODY_INVALID",
      "요청에 허용되지 않은 값이 포함되어 있습니다."
    );
  }
  return body;
}

function matchReceipt(match, fallbackStatus = "READY") {
  const id = String(match?._id || match?.id || "").trim();
  if (!id) {
    fail(
      "GOAT_ARENA_MATCH_RECEIPT_INVALID",
      "경기 생성 결과를 확인할 수 없습니다.",
      500
    );
  }
  return {
    id,
    status: String(match?.status || fallbackStatus),
    integrityState: String(match?.integrityStatus || "PENDING"),
  };
}

function productionDependencies() {
  return {
    createSubChallenge:
      require("../services/arenaMatchService").createSubNormalChallenge,
    respondInvitation:
      require("../services/mainArenaMatchService").respondToMainInvitation,
    submitEvidence:
      require("../services/arenaMatchEvidenceService").submitArenaMatchEvidence,
    attachClientReview:
      require("../services/arenaClientEvidenceReviewService").attachArenaClientReview,
    settleMatch:
      require("../services/arenaMatchSettlementService").settleArenaMatch,
    discardUploads:
      require("../middleware/uploadContentValidation").discardRequestUploads,
  };
}

function createIpadGoatArenaActionController(options = null) {
  const {
    createSubChallenge,
    respondInvitation,
    submitEvidence,
    attachClientReview = async () => {
      fail(
        "ARENA_CLIENT_REVIEW_UNAVAILABLE",
        "기기 검토 연결을 준비하지 못했습니다.",
        503
      );
    },
    settleMatch,
    discardUploads = async () => {},
  } = options || productionDependencies();
  function noStore(res) {
    res.set("Cache-Control", "no-store");
  }

  async function createUnrankedMatch(req, res, next) {
    try {
      strictBody(req, []);
      const context = commandContext(req);
      const result = await createSubChallenge({
        challengerUserId: context.userId,
        requestId: context.requestId,
      });
      noStore(res);
      return res.json({ match: matchReceipt(result.match) });
    } catch (error) {
      return next(error);
    }
  }

  async function acceptRankedInvitation(req, res, next) {
    try {
      strictBody(req, []);
      const context = commandContext(req);
      const result = await respondInvitation({
        offerId: req.params.matchId,
        userId: context.userId,
        response: "ACCEPT",
      });
      noStore(res);
      return res.json({
        invitationId: req.params.matchId,
        match: matchReceipt(result.match, "READY"),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function declineRankedInvitation(req, res, next) {
    try {
      const body = strictBody(req, ["reasonCode"]);
      const context = commandContext(req);
      const reasonCode = String(body.reasonCode || "").toUpperCase();
      if (!DECLINE_REASONS.has(reasonCode)) {
        fail(
          "GOAT_ARENA_DECLINE_REASON_INVALID",
          "지원되는 거절 사유를 선택해주세요."
        );
      }
      await respondInvitation({
        offerId: req.params.matchId,
        userId: context.userId,
        response: "DECLINE",
        declineReasonCode: reasonCode,
      });
      noStore(res);
      return res.json({
        invitationId: req.params.matchId,
        match: {
          id: req.params.matchId,
          status: "CANCELLED",
          integrityState: "CLEAR",
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async function submitMatchEvidence(req, res, next) {
    try {
      const context = commandContext(req);
      if (!Array.isArray(req.files) || req.files.length < 1) {
        fail(
          "ARENA_EVIDENCE_FILE_REQUIRED",
          "풀이 증거 사진을 한 장 이상 선택해주세요."
        );
      }
      const evidence = await submitEvidence({
        matchId: req.params.matchId,
        userId: context.userId,
        files: req.files,
        receivedAt: req.arenaEvidenceReceivedAt,
      });
      req.files = [];
      if (evidence.matchStatus === "SUBMITTED") {
        await settleMatch({ matchId: req.params.matchId });
      }
      noStore(res);
      return res.json({
        evidence: {
          ...evidence,
          submissionId: context.requestId,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async function submitClientReview(req, res, next) {
    try {
      const body = strictBody(req, [
        "evidenceId",
        "model",
        "modelVersion",
        "reviewState",
        "signals",
        "completedAt",
      ]);
      const context = commandContext(req);
      const review = await attachClientReview({
        matchId: req.params.matchId,
        evidenceId: body.evidenceId,
        userId: context.userId,
        reviewId: context.requestId,
        model: body.model,
        modelVersion: body.modelVersion,
        reviewState: body.reviewState,
        signals: body.signals,
        completedAt: body.completedAt,
        clientBuildVersion: context.clientBuildVersion,
      });
      noStore(res);
      return res.json({ review });
    } catch (error) {
      return next(error);
    }
  }

  async function uploadError(error, req, _res, next) {
    await discardUploads(req);
    req.files = [];
    if (String(error?.code || "").startsWith("LIMIT_")) {
      error.status = 413;
      error.statusCode = 413;
      error.code = "ARENA_EVIDENCE_UPLOAD_LIMIT";
      error.message =
        "풀이 사진은 최대 5장, 한 장당 10MB, 경기당 총 30MB까지 제출할 수 있습니다.";
    }
    return next(error);
  }

  return Object.freeze({
    acceptRankedInvitation,
    createUnrankedMatch,
    declineRankedInvitation,
    submitMatchEvidence,
    submitClientReview,
    uploadError,
  });
}

let defaultController;

function productionHandler(name) {
  return (...args) => {
    defaultController ||= createIpadGoatArenaActionController();
    return defaultController[name](...args);
  };
}

// Express는 인자 개수 4개인 함수만 오류 미들웨어로 취급한다. 나머지 프록시처럼
// rest parameter로 만들면 multer 오류가 이 핸들러를 건너뛴다.
function productionUploadError(error, req, res, next) {
  defaultController ||= createIpadGoatArenaActionController();
  return defaultController.uploadError(error, req, res, next);
}

module.exports = {
  IpadGoatArenaActionError,
  createIpadGoatArenaActionController,
  acceptRankedInvitation: productionHandler("acceptRankedInvitation"),
  createUnrankedMatch: productionHandler("createUnrankedMatch"),
  declineRankedInvitation: productionHandler("declineRankedInvitation"),
  submitMatchEvidence: productionHandler("submitMatchEvidence"),
  submitClientReview: productionHandler("submitClientReview"),
  uploadError: productionUploadError,
};
