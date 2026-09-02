const MAX_COMMAND_KEY_LENGTH = 180;
const MAX_CLIENT_BUILD_LENGTH = 100;
const DECLINE_REASONS = new Set([
  "SCHEDULE_CONFLICT",
  "TECHNICAL_ISSUE",
  "OTHER",
]);
const PAYBACK_BANK_SUGGESTIONS = Object.freeze([
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "기업은행",
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
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

function paybackAccountReceipt(account = {}) {
  return {
    confirmed: account.confirmed === true,
    bankName: String(account.bankName || ""),
    last4: String(account.last4 || ""),
    confirmedAt:
      account.confirmedAt?.toISOString?.() || account.confirmedAt || null,
  };
}

function productionDependencies() {
  return {
    createSubChallenge:
      require("../services/arenaMatchService").createSubNormalChallenge,
    respondInvitation:
      require("../services/mainArenaMatchService").respondToMainInvitation,
    getMainActions:
      require("../services/mainArenaMatchService").getMainArenaActionData,
    createMainUpward:
      require("../services/mainArenaMatchService").createMainUpwardChallenge,
    createMainInvitation:
      require("../services/mainArenaMatchService").createMainLowerInvitation,
    cancelMainInvitation:
      require("../services/mainArenaMatchService").cancelMainInvitation,
    submitEvidence:
      require("../services/arenaMatchEvidenceService").submitArenaMatchEvidence,
    attachClientReview:
      require("../services/arenaClientEvidenceReviewService").attachArenaClientReview,
    settleMatch:
      require("../services/arenaMatchSettlementService").settleArenaMatch,
    discardUploads:
      require("../middleware/uploadContentValidation").discardRequestUploads,
    getPaybackAccountSummary:
      require("../services/paybackAccountService").getPaybackAccountSummary,
    saveConfirmedPaybackAccount:
      require("../services/paybackAccountService").saveConfirmedPaybackAccount,
    hasPendingPaybackPayout: async ({ userId }) =>
      Boolean(
        await require("../models/goatArenaModel").AccessCycle.exists({
          userId,
          paybackPayoutStatus: "PENDING",
          paybackAmount: { $gt: 0 },
        })
      ),
    getMainFriendlyMatchData:
      require("../services/mainFriendlyMatchService").getMainFriendlyMatchData,
    createMainFriendlyInvitation:
      require("../services/mainFriendlyMatchService").createMainFriendlyInvitation,
    respondToMainFriendlyInvitation:
      require("../services/mainFriendlyMatchService").respondToMainFriendlyInvitation,
    cancelMainFriendlyInvitation:
      require("../services/mainFriendlyMatchService").cancelMainFriendlyInvitation,
    getPendingArenaRevengeRight:
      require("../services/ipadArenaRevengeActionService").getPendingArenaRevengeRight,
    claimArenaRevengeRight:
      require("../services/ipadArenaRevengeActionService").claimArenaRevengeRight,
    forfeitArenaRevengeRight:
      require("../services/ipadArenaRevengeActionService").forfeitArenaRevengeRight,
    getSupplementalEvidenceRequest:
      require("../services/arenaMatchEvidenceService").getArenaSupplementalEvidenceRequest,
    submitSupplementalEvidence:
      require("../services/arenaMatchEvidenceService").submitArenaSupplementalEvidence,
  };
}

function createIpadGoatArenaActionController(options = null) {
  const {
    createSubChallenge,
    respondInvitation,
    getMainActions,
    createMainUpward,
    createMainInvitation,
    cancelMainInvitation,
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
    getPaybackAccountSummary = async () => ({
      confirmed: false,
      bankName: "",
      last4: "",
      confirmedAt: null,
    }),
    saveConfirmedPaybackAccount = async () => {
      fail(
        "PAYBACK_ACCOUNT_UNAVAILABLE",
        "페이백 계좌 연결을 준비하지 못했습니다.",
        503
      );
    },
    hasPendingPaybackPayout = async () => false,
    getMainFriendlyMatchData = async () => ({
      query: "",
      searchResults: [],
      receivedInvitations: [],
      sentInvitations: [],
      activeMatch: null,
      eligible: false,
      eligibilityReason: "친선 경기 정보를 준비하지 못했습니다.",
      feeDays: 1,
    }),
    createMainFriendlyInvitation = async () => {
      fail("FRIENDLY_MATCH_UNAVAILABLE", "친선 경기를 준비하지 못했습니다.", 503);
    },
    respondToMainFriendlyInvitation = async () => {
      fail("FRIENDLY_MATCH_UNAVAILABLE", "친선 경기를 준비하지 못했습니다.", 503);
    },
    cancelMainFriendlyInvitation = async () => {
      fail("FRIENDLY_MATCH_UNAVAILABLE", "친선 경기를 준비하지 못했습니다.", 503);
    },
    getPendingArenaRevengeRight = async () => null,
    claimArenaRevengeRight = async () => {
      fail("REVENGE_RIGHT_UNAVAILABLE", "복수권 사용을 준비하지 못했습니다.", 503);
    },
    forfeitArenaRevengeRight = async () => {
      fail("REVENGE_RIGHT_UNAVAILABLE", "복수권 포기를 준비하지 못했습니다.", 503);
    },
    getSupplementalEvidenceRequest = async () => {
      fail("ARENA_SUPPLEMENTAL_UNAVAILABLE", "추가 소명 요청을 준비하지 못했습니다.", 503);
    },
    submitSupplementalEvidence = async () => {
      fail("ARENA_SUPPLEMENTAL_UNAVAILABLE", "추가 소명 제출을 준비하지 못했습니다.", 503);
    },
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

  function mainTarget(row, availableLearningDays, eligible, requestLocked) {
    const minimumStakeDays = Math.max(1, Number(row.minimumStakeDays || row.gap || 1));
    const maximumStakeDays = Math.max(
      minimumStakeDays,
      Math.min(
        Number(row.maximumStakeDays || availableLearningDays - 1 || minimumStakeDays),
        Math.max(minimumStakeDays, availableLearningDays - 1)
      )
    );
    return {
      tier: String(row.label || row.tier || ""),
      gap: Number(row.gap || 0),
      minimumStakeDays,
      maximumStakeDays,
      available:
        eligible === true &&
        requestLocked !== true &&
        availableLearningDays > minimumStakeDays,
    };
  }

  async function getMainActionOptions(req, res, next) {
    try {
      if (!req.apiUser?._id) {
        fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
      }
      const data = await getMainActions({ userId: req.apiUser._id });
      const availableLearningDays = Math.max(
        0,
        Number(data.availableLearningDays || 0)
      );
      const eligible = data.eligible === true && !data.activeMatch;
      const requestLocked = data.requestLocked === true;
      const lowerMinimumByGap = new Map(
        (data.policy?.stakeDaysByTierGap || []).map((row) => [
          Number(row.tierGap),
          Number(row.stakeDays),
        ])
      );
      const lowerRows = (data.lowerTargets || []).map((row) => ({
        ...row,
        minimumStakeDays: lowerMinimumByGap.get(Number(row.gap)) || row.gap,
        maximumStakeDays: Math.max(1, availableLearningDays - 1),
      }));
      noStore(res);
      return res.json({
        schemaVersion: "GOAT_ARENA_MAIN_ACTIONS_V1",
        eligible,
        reasonCodes: data.reasons || [],
        currentTier: data.currentTier || null,
        availableLearningDays,
        matchmakingRestrictedUntil:
          data.matchmakingRestrictedUntil?.toISOString?.() ||
          data.matchmakingRestrictedUntil ||
          null,
        hasActiveMatch: Boolean(data.activeMatch),
        requestLocked,
        sentInvitations: (data.sentInvitations || []).map((invitation) => ({
          id: String(invitation._id || invitation.id),
          status: String(invitation.status || ""),
          targetTier: String(invitation.targetTier || ""),
          stakeDays: Number(invitation.stakeDays || 0),
          reservedLearningDays: Number(invitation.reservedLearningDays || 0),
          createdAt:
            invitation.createdAt?.toISOString?.() || invitation.createdAt || null,
          canCancel: ["SEARCHING", "OFFERED", "PAUSED"].includes(
            invitation.status
          ),
        })),
        upwardTargets: (data.upwardTargets || []).map((row) =>
          mainTarget(row, availableLearningDays, eligible, requestLocked)
        ),
        lowerTargets: lowerRows.map((row) =>
          mainTarget(row, availableLearningDays, eligible, requestLocked)
        ),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function createMainUpwardMatch(req, res, next) {
    try {
      const body = strictBody(req, ["targetTier", "stakeDays"]);
      const context = commandContext(req);
      const result = await createMainUpward({
        userId: context.userId,
        targetTier: body.targetTier,
        stakeDays: body.stakeDays,
        requestId: context.requestId,
      });
      noStore(res);
      return res.json({ kind: "MATCH", match: matchReceipt(result.match) });
    } catch (error) {
      return next(error);
    }
  }

  async function createMainLowerInvitation(req, res, next) {
    try {
      const body = strictBody(req, ["targetTier", "stakeDays"]);
      const context = commandContext(req);
      const invitation = await createMainInvitation({
        userId: context.userId,
        targetTier: body.targetTier,
        stakeDays: body.stakeDays,
        requestId: context.requestId,
      });
      noStore(res);
      return res.json({
        kind: "INVITATION",
        invitation: {
          id: String(invitation._id || invitation.id),
          status: String(invitation.status || ""),
          targetTier: String(invitation.targetTier || ""),
          stakeDays: Number(invitation.stakeDays || 0),
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async function cancelSentMainInvitation(req, res, next) {
    try {
      strictBody(req, []);
      const context = commandContext(req);
      const invitation = await cancelMainInvitation({
        invitationId: req.params.invitationId,
        userId: context.userId,
        cancellationType: "MANUAL",
        reason: "USER_CANCELLED_FROM_IOS",
      });
      noStore(res);
      return res.json({
        kind: "INVITATION_CANCELLATION",
        invitation: {
          id: String(invitation._id || invitation.id),
          status: String(invitation.status || ""),
          releasedLearningDays: Number(invitation.releasedLearningDays || 0),
          burnedLearningDays: Number(invitation.burnedLearningDays || 0),
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async function getPaybackAccount(req, res, next) {
    try {
      if (!req.apiUser?._id) {
        fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
      }
      const [account, payoutEligible] = await Promise.all([
        getPaybackAccountSummary(req.apiUser._id),
        hasPendingPaybackPayout({ userId: req.apiUser._id }),
      ]);
      noStore(res);
      return res.json({
        schemaVersion: "GOAT_ARENA_PAYBACK_ACCOUNT_V1",
        account: paybackAccountReceipt(account),
        payoutEligible: payoutEligible === true,
        bankSuggestions: PAYBACK_BANK_SUGGESTIONS,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function confirmPaybackAccount(req, res, next) {
    try {
      const body = strictBody(req, [
        "bankName",
        "accountHolderName",
        "accountNumber",
        "accountConfirmed",
      ]);
      const context = commandContext(req);
      if (body.accountConfirmed !== true) {
        fail(
          "PAYBACK_ACCOUNT_CONFIRMATION_REQUIRED",
          "예금주와 계좌번호를 직접 확인했다는 항목에 체크해주세요."
        );
      }
      const account = await saveConfirmedPaybackAccount(context.userId, {
        bankName: body.bankName,
        accountHolderName: body.accountHolderName,
        accountNumber: body.accountNumber,
      });
      noStore(res);
      // 계좌 원문과 예금주는 응답에 포함하지 않는다. 기존 웹과 마찬가지로 이후
      // 사용자 화면은 은행명·끝 4자리·확인 시각만 다시 읽을 수 있다.
      return res.json({
        schemaVersion: "GOAT_ARENA_PAYBACK_ACCOUNT_V1",
        account: paybackAccountReceipt(account),
      });
    } catch (error) {
      return next(error);
    }
  }

  function friendlyCounterpart(invitation, direction) {
    const user = direction === "RECEIVED"
      ? invitation?.inviterUserId
      : invitation?.inviteeUserId;
    return String(user?.name || user?.username || "닉네임 확인 중");
  }

  function friendlyInvitationReceipt(invitation, direction) {
    return {
      id: String(invitation?._id || invitation?.id || ""),
      status: String(invitation?.status || "PENDING"),
      counterpartNickname: friendlyCounterpart(invitation, direction),
      feeDays: Number(invitation?.feeDays || 1),
      createdAt:
        invitation?.createdAt?.toISOString?.() || invitation?.createdAt || null,
      expiresAt:
        invitation?.expiresAt?.toISOString?.() || invitation?.expiresAt || null,
    };
  }

  async function getMainFriendlyOptions(req, res, next) {
    try {
      if (!req.apiUser?._id) {
        fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
      }
      const nickname = String(req.query?.nickname || "").trim();
      if (nickname.length > 40) {
        fail("FRIENDLY_NICKNAME_INVALID", "닉네임은 40자 이내로 검색해주세요.");
      }
      const data = await getMainFriendlyMatchData({
        userId: req.apiUser._id,
        nickname,
      });
      noStore(res);
      return res.json({
        schemaVersion: "GOAT_ARENA_MAIN_FRIENDLY_V1",
        query: String(data.query || ""),
        eligible: data.eligible === true,
        eligibilityReason: String(data.eligibilityReason || ""),
        feeDays: Number(data.feeDays || 1),
        hasActiveMatch: Boolean(data.activeMatch),
        searchResults: (data.searchResults || []).map((candidate) => ({
          userId: String(candidate.userId || ""),
          nickname: String(candidate.nickname || "닉네임 미설정"),
          tier: String(candidate.tier || "미배정"),
          availableLearningDays: Number(candidate.availableLearningDays || 0),
        })),
        receivedInvitations: (data.receivedInvitations || []).map((invitation) =>
          friendlyInvitationReceipt(invitation, "RECEIVED")
        ),
        sentInvitations: (data.sentInvitations || []).map((invitation) =>
          friendlyInvitationReceipt(invitation, "SENT")
        ),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function createFriendlyInvitation(req, res, next) {
    try {
      const body = strictBody(req, ["inviteeUserId"]);
      const context = commandContext(req);
      const result = await createMainFriendlyInvitation({
        userId: context.userId,
        inviteeUserId: body.inviteeUserId,
        requestId: context.requestId,
      });
      noStore(res);
      return res.json({
        kind: "INVITATION",
        invitation: friendlyInvitationReceipt(result.invitation, "SENT"),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function respondFriendlyInvitation(req, res, next) {
    try {
      const body = strictBody(req, ["response"]);
      const context = commandContext(req);
      const response = String(body.response || "").trim().toUpperCase();
      if (!["ACCEPT", "DECLINE"].includes(response)) {
        fail("FRIENDLY_RESPONSE_INVALID", "친선 경기 응답을 확인해주세요.");
      }
      const result = await respondToMainFriendlyInvitation({
        invitationId: req.params.invitationId,
        userId: context.userId,
        response,
      });
      noStore(res);
      if (result.match) {
        return res.json({
          kind: "MATCH",
          match: matchReceipt(result.match),
        });
      }
      return res.json({
        kind: "INVITATION",
        invitation: friendlyInvitationReceipt(result.invitation, "RECEIVED"),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function cancelFriendlyInvitation(req, res, next) {
    try {
      strictBody(req, []);
      const context = commandContext(req);
      const result = await cancelMainFriendlyInvitation({
        invitationId: req.params.invitationId,
        userId: context.userId,
      });
      noStore(res);
      return res.json({
        kind: "INVITATION",
        invitation: friendlyInvitationReceipt(result.invitation, "SENT"),
      });
    } catch (error) {
      return next(error);
    }
  }

  async function getRevengeRight(req, res, next) {
    try {
      if (!req.apiUser?._id) {
        fail("UNAUTHORIZED", "다시 로그인한 뒤 시도해주세요.", 401);
      }
      const right = await getPendingArenaRevengeRight({ userId: req.apiUser._id });
      noStore(res);
      return res.json({ schemaVersion: "GOAT_ARENA_REVENGE_RIGHT_V1", right });
    } catch (error) {
      return next(error);
    }
  }

  async function claimRevengeRight(req, res, next) {
    try {
      strictBody(req, []);
      const context = commandContext(req);
      const result = await claimArenaRevengeRight({
        revengeRightId: req.params.rightId,
        userId: context.userId,
        requestId: context.requestId,
      });
      noStore(res);
      return res.json({
        kind: "MATCH",
        match: {
          id: String(result.matchId),
          status: "READY",
          integrityState: "PENDING",
        },
        replayed: result.replayed === true,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function forfeitRevengeRight(req, res, next) {
    try {
      strictBody(req, []);
      const context = commandContext(req);
      const result = await forfeitArenaRevengeRight({
        revengeRightId: req.params.rightId,
        userId: context.userId,
        requestId: context.requestId,
      });
      noStore(res);
      return res.json({
        kind: "REVENGE_FORFEIT",
        rightId: req.params.rightId,
        sourceMatchId: String(result.sourceMatchId || ""),
        replayed: result.replayed === true,
      });
    } catch (error) {
      return next(error);
    }
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
        fail("ARENA_SUPPLEMENTAL_FILE_REQUIRED", "추가 소명 사진을 한 장 이상 선택해주세요.");
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
    cancelSentMainInvitation,
    cancelFriendlyInvitation,
    claimRevengeRight,
    createMainLowerInvitation,
    createMainUpwardMatch,
    createFriendlyInvitation,
    createUnrankedMatch,
    declineRankedInvitation,
    getPaybackAccount,
    getMainFriendlyOptions,
    getMainActionOptions,
    getRevengeRight,
    getSupplementalEvidence,
    confirmPaybackAccount,
    forfeitRevengeRight,
    respondFriendlyInvitation,
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
  cancelSentMainInvitation: productionHandler("cancelSentMainInvitation"),
  cancelFriendlyInvitation: productionHandler("cancelFriendlyInvitation"),
  claimRevengeRight: productionHandler("claimRevengeRight"),
  createMainLowerInvitation: productionHandler("createMainLowerInvitation"),
  createMainUpwardMatch: productionHandler("createMainUpwardMatch"),
  createFriendlyInvitation: productionHandler("createFriendlyInvitation"),
  createUnrankedMatch: productionHandler("createUnrankedMatch"),
  declineRankedInvitation: productionHandler("declineRankedInvitation"),
  getPaybackAccount: productionHandler("getPaybackAccount"),
  getMainFriendlyOptions: productionHandler("getMainFriendlyOptions"),
  getMainActionOptions: productionHandler("getMainActionOptions"),
  getRevengeRight: productionHandler("getRevengeRight"),
  getSupplementalEvidence: productionHandler("getSupplementalEvidence"),
  confirmPaybackAccount: productionHandler("confirmPaybackAccount"),
  forfeitRevengeRight: productionHandler("forfeitRevengeRight"),
  respondFriendlyInvitation: productionHandler("respondFriendlyInvitation"),
  submitSupplementalEvidenceFiles: productionHandler("submitSupplementalEvidenceFiles"),
  submitMatchEvidence: productionHandler("submitMatchEvidence"),
  submitClientReview: productionHandler("submitClientReview"),
  uploadError: productionUploadError,
};
