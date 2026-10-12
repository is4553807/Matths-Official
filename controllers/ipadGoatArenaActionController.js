const { publicEvidenceResult } = require("../services/arenaPublicResponseService");
const MAX_COMMAND_KEY_LENGTH = 180;
const MAX_CLIENT_BUILD_LENGTH = 100;

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

function productionDependencies() {
  const evidenceService = require("../services/arenaMatchEvidenceService");
  return {
    submitEvidence: evidenceService.submitArenaMatchEvidence,
    getSupplementalEvidenceRequest:
      evidenceService.getArenaSupplementalEvidenceRequest,
    submitSupplementalEvidence:
      evidenceService.submitArenaSupplementalEvidence,
    attachClientReview:
      require("../services/arenaClientEvidenceReviewService")
        .attachArenaClientReview,
    finalizeAfterEvidence:
      require("../services/arenaEvidenceSettlementService")
        .finalizeArenaMatchAfterEvidence,
    discardUploads:
      require("../middleware/uploadContentValidation").discardRequestUploads,
  };
}

function createIpadGoatArenaActionController(options = null) {
  const {
    submitEvidence,
    getSupplementalEvidenceRequest,
    submitSupplementalEvidence,
    attachClientReview,
    finalizeAfterEvidence,
    discardUploads = async () => {},
  } = options || productionDependencies();

  function noStore(res) {
    res.set("Cache-Control", "no-store");
  }

  async function getSupplementalEvidence(req, res, next) {
    try {
      if (!req.apiUser?._id) {
        fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
      }
      const request = await getSupplementalEvidenceRequest({
        matchId: req.params.matchId,
        userId: req.apiUser._id,
      });
      noStore(res);
      return res.json({
        schemaVersion: "GOAT_ARENA_SUPPLEMENTAL_EVIDENCE_V1",
        request,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function submitSupplementalEvidenceFiles(req, res, next) {
    try {
      const context = commandContext(req);
      if (!Array.isArray(req.files) || req.files.length < 1) {
        fail(
          "ARENA_SUPPLEMENTAL_FILE_REQUIRED",
          "추가 소명 사진을 한 장 이상 선택해주세요."
        );
      }
      const result = await submitSupplementalEvidence({
        matchId: req.params.matchId,
        userId: context.userId,
        files: req.files,
        receivedAt: req.arenaEvidenceReceivedAt,
      });
      req.files = [];
      noStore(res);
      return res.json({
        schemaVersion: "GOAT_ARENA_SUPPLEMENTAL_EVIDENCE_V1",
        submission: {
          replayed: result.replayed === true,
          status: String(result.status || ""),
          submittedAt:
            result.submittedAt?.toISOString?.() || result.submittedAt || null,
          submittedLate: result.submittedLate === true,
          lateByMs: Number(result.lateByMs || 0),
          fileCount: Number(result.fileCount || 0),
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
      await finalizeAfterEvidence({
        matchId: req.params.matchId,
        userId: context.userId,
        evidenceResult: evidence,
      });
      noStore(res);
      return res.json({
        evidence: {
          ...publicEvidenceResult(evidence),
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
    getSupplementalEvidence,
    submitSupplementalEvidenceFiles,
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

function productionUploadError(error, req, res, next) {
  defaultController ||= createIpadGoatArenaActionController();
  return defaultController.uploadError(error, req, res, next);
}

module.exports = {
  IpadGoatArenaActionError,
  createIpadGoatArenaActionController,
  getSupplementalEvidence: productionHandler("getSupplementalEvidence"),
  submitSupplementalEvidenceFiles:
    productionHandler("submitSupplementalEvidenceFiles"),
  submitMatchEvidence: productionHandler("submitMatchEvidence"),
  submitClientReview: productionHandler("submitClientReview"),
  uploadError: productionUploadError,
};
