"use strict";

const crypto = require("node:crypto");

const {
  GUEST_COOKIE_NAME,
  advanceGuestAttempt,
  assertGuestBoard,
  assertGuestBoardUploadAuthorized,
  assertGuestEvidenceUploadAuthorized,
  claimGuestChallenge,
  createGuestChallenge,
  createGuestChallengeFromClaimedAttempt,
  finalizeGuestBoards,
  getClaimedGuestEvidenceFile,
  getClaimedGuestRecordPageData,
  getGuestChallengePageData,
  getGuestEvidenceFile,
  getGuestNicknameAvailability,
  getGuestSolutionBoards,
  lockGuestQuestionCompletion,
  prepareGuestReverseChallengeRegistration,
  saveGuestSolutionBoard,
  startGuestAttempt,
  submitGuestEvidence,
} = require("../services/arenaGuestChallengeService");
const { discardArenaEvidenceFiles } = require("../services/arenaMatchEvidenceService");

function cookieHeader(req) {
  return req.headers?.cookie || "";
}

function viewerUserId(req) {
  return req.session?.user?.id || null;
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

function absoluteGuestInviteUrl(req, rawToken) {
  if (!rawToken) return "";
  const base = String(
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
  return `${base}/arena-invite/${encodeURIComponent(String(rawToken))}`;
}

function handleKnownError(error, res, next, fallback) {
  if ([400, 403, 404, 409, 410, 413, 422, 503].includes(Number(error.status))) {
    return res.redirect(`${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }
  return next(error);
}

function wantsJson(req) {
  return req.get("accept")?.includes("application/json");
}

exports.create = async (req, res, next) => {
  try {
    const challenge = await createGuestChallenge({
      creatorUserId: req.session.user.id,
      sourceMatchId: req.params.matchId,
    });
    // Capability tokens must not be placed in a redirect query string: URLs
    // can be copied into browser history, access logs and analytics. Hand the
    // freshly-created token to the next clean page through this server-side
    // session exactly once instead.
    req.session.arenaGuestMatchInviteFlash = {
      matchId: String(req.params.matchId),
      token: challenge.token,
      createdAt: new Date().toISOString(),
    };
    await saveSession(req);
    if (wantsJson(req)) {
      res.set("Cache-Control", "private, no-store");
      res.set("Referrer-Policy", "no-referrer");
      return res.status(201).json({
        ok: true,
        inviteUrl: absoluteGuestInviteUrl(req, challenge.token),
        expiresAt: challenge.expiresAt,
      });
    }
    return res.redirect(`/goat-arena/matches/${encodeURIComponent(req.params.matchId)}`);
  } catch (error) {
    if (wantsJson(req) && [400, 403, 404, 409, 410, 413, 422, 503].includes(Number(error.status))) {
      res.set("Cache-Control", "private, no-store");
      return res.status(Number(error.status)).json({
        ok: false,
        error: error.message,
        code: error.code || "ARENA_GUEST_CHALLENGE_CREATE_FAILED",
      });
    }
    return handleKnownError(error, res, next, `/goat-arena/matches/${req.params.matchId}`);
  }
};

exports.page = async (req, res, next) => {
  try {
    const challenge = await getGuestChallengePageData({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
      forceParticipantEntry: req.query.participant === "new",
    });
    res.set("Cache-Control", "private, no-store");
    res.set("Referrer-Policy", "no-referrer");
    return res.render("arena-guest-challenge", {
      challenge,
      errorMessage: String(req.query.error || ""),
      disablePageAnalytics: true,
    });
  } catch (error) {
    return next(error);
  }
};

exports.claim = async (req, res, next) => {
  try {
    const result = await claimGuestChallenge({
      rawToken: req.params.token,
      nickname: req.body.nickname,
      birthDate: req.body.birthDate,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    if (result.cookieValue) {
      res.cookie(GUEST_COOKIE_NAME, result.cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }
    return res.redirect(`/arena-invite/${encodeURIComponent(req.params.token)}`);
  } catch (error) {
    const fallback = `/arena-invite/${encodeURIComponent(req.params.token)}` +
      (req.body.participantEntry === "new" ? "?participant=new" : "");
    return handleKnownError(error, res, next, fallback);
  }
};

exports.nicknameAvailability = async (req, res, next) => {
  try {
    const availability = await getGuestNicknameAvailability({
      rawToken: req.params.token,
      nickname: req.body.nickname,
      birthDate: req.body.birthDate,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(availability);
  } catch (error) {
    if ([400, 403, 404, 409, 410].includes(Number(error.status))) {
      res.set("Cache-Control", "private, no-store");
      return res.status(Number(error.status)).json({
        valid: false,
        available: false,
        message: error.message,
      });
    }
    return next(error);
  }
};

exports.beginReverseChallengeRegistration = async (req, res, next) => {
  try {
    const prepared = await prepareGuestReverseChallengeRegistration({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    const now = new Date();
    req.session.arenaGuestRegistrationClaim = {
      guestIdentityId: prepared.guestIdentityId,
      sourceAttemptId: prepared.sourceAttemptId,
      confirmationNonce: crypto.randomBytes(24).toString("base64url"),
      preparedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    };
    req.session.returnTo = `/goat-arena/guest-records/${encodeURIComponent(prepared.sourceAttemptId)}?reverse=1`;
    await saveSession(req);
    if (req.session?.user?.id) {
      if (String(prepared.claimedByUserId || "") === String(req.session.user.id)) {
        return res.redirect(req.session.returnTo);
      }
      throw Object.assign(
        new Error("이 게스트 기록은 현재 로그인한 계정에 연결되어 있지 않습니다. 새 계정으로 연결하려면 먼저 로그아웃해주세요."),
        { status: 409, code: "ARENA_GUEST_ACCOUNT_LINK_REQUIRED" }
      );
    }
    return res.redirect("/student/register?arenaReverse=1");
  } catch (error) {
    return handleKnownError(error, res, next, `/arena-invite/${encodeURIComponent(req.params.token)}`);
  }
};

exports.createReverseChallenge = async (req, res, next) => {
  try {
    const invitation = await createGuestChallengeFromClaimedAttempt({
      creatorUserId: req.session.user.id,
      guestAttemptId: req.params.attemptId,
    });
    req.session.arenaGuestReverseInviteFlash = {
      attemptId: String(req.params.attemptId),
      token: invitation.token,
      createdAt: new Date().toISOString(),
    };
    await saveSession(req);
    return res.redirect(`/goat-arena/guest-records/${encodeURIComponent(req.params.attemptId)}`);
  } catch (error) {
    return handleKnownError(
      error,
      res,
      next,
      `/goat-arena/guest-records/${encodeURIComponent(req.params.attemptId)}`
    );
  }
};

exports.start = async (req, res, next) => {
  try {
    await startGuestAttempt({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    return res.redirect(`/arena-invite/${encodeURIComponent(req.params.token)}?started=1`);
  } catch (error) {
    return handleKnownError(error, res, next, `/arena-invite/${encodeURIComponent(req.params.token)}`);
  }
};

exports.advance = async (req, res, next) => {
  try {
    if (req.body.evidenceMode === "INLINE_BOARD") {
      await assertGuestBoard({
        rawToken: req.params.token,
        cookieHeader: cookieHeader(req),
        viewerUserId: viewerUserId(req),
        slot: req.body.questionSlot,
      });
    }
    const result = await advanceGuestAttempt({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
      answer: req.body.answer,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
};

exports.lockQuestionCompletion = async (req, res, next) => {
  try {
    const result = await lockGuestQuestionCompletion({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
      answer: req.body.answer,
      questionSlot: req.body.questionSlot,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
};

exports.authorizeBoardUpload = async (req, _res, next) => {
  try {
    await assertGuestBoardUploadAuthorized({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    return next();
  } catch (error) {
    return next(error);
  }
};

exports.authorizeEvidenceUpload = async (req, res, next) => {
  try {
    await assertGuestEvidenceUploadAuthorized({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    return next();
  } catch (error) {
    return handleKnownError(
      error,
      res,
      next,
      `/arena-invite/${encodeURIComponent(req.params.token)}`
    );
  }
};

exports.saveBoard = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("풀이판 이미지를 확인해주세요.");
      error.status = 400;
      throw error;
    }
    const board = await saveGuestSolutionBoard({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
      questionSlot: req.body.questionSlot,
      revision: req.body.revision,
      strokeCount: req.body.strokeCount,
      drawingDataBase64: req.body.drawingDataBase64,
      file: req.file,
    });
    req.file = undefined;
    res.set("Cache-Control", "no-store");
    return res.json({ board });
  } catch (error) {
    await discardArenaEvidenceFiles(req.file ? [req.file] : []);
    req.file = undefined;
    return next(error);
  }
};

exports.getBoards = async (req, res, next) => {
  try {
    const boards = await getGuestSolutionBoards({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ boards });
  } catch (error) {
    return next(error);
  }
};

exports.finalizeBoards = async (req, res, next) => {
  try {
    const attempt = await finalizeGuestBoards({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
    });
    res.set("Cache-Control", "no-store");
    return res.json({ finalized: true, status: attempt.status });
  } catch (error) {
    return next(error);
  }
};

exports.submitEvidence = async (req, res, next) => {
  try {
    await submitGuestEvidence({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
      files: req.files,
    });
    return res.redirect(`/arena-invite/${encodeURIComponent(req.params.token)}?result=1`);
  } catch (error) {
    await discardArenaEvidenceFiles(Array.isArray(req.files) ? req.files : []);
    if (Array.isArray(req.files)) req.files = [];
    return handleKnownError(error, res, next, `/arena-invite/${encodeURIComponent(req.params.token)}`);
  }
};

exports.evidenceFile = async (req, res, next) => {
  try {
    const url = await getGuestEvidenceFile({
      rawToken: req.params.token,
      cookieHeader: cookieHeader(req),
      viewerUserId: viewerUserId(req),
      side: req.params.side,
      participantAttemptId: req.params.attemptId || null,
      fileIndex: req.params.fileIndex,
    });
    res.set("Cache-Control", "private, no-store");
    res.set("Referrer-Policy", "no-referrer");
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
};

exports.claimedRecordPage = async (req, res, next) => {
  try {
    const challenge = await getClaimedGuestRecordPageData({
      attemptId: req.params.attemptId,
      userId: req.session.user.id,
    });
    challenge.reverseRequested = req.query.reverse === "1";
    challenge.reverseCreatePath = `/goat-arena/guest-records/${encodeURIComponent(req.params.attemptId)}/guest-invitations`;
    const reverseFlash = req.session?.arenaGuestReverseInviteFlash;
    const reverseFlashAgeMs = Date.now() - new Date(reverseFlash?.createdAt || 0).getTime();
    const reverseToken =
      String(reverseFlash?.attemptId || "") === String(req.params.attemptId) &&
      Number.isFinite(reverseFlashAgeMs) &&
      reverseFlashAgeMs >= 0 &&
      reverseFlashAgeMs <= 10 * 60 * 1000
        ? reverseFlash.token
        : "";
    if (reverseFlash && (
      reverseToken ||
      !Number.isFinite(reverseFlashAgeMs) ||
      reverseFlashAgeMs > 10 * 60 * 1000
    )) {
      delete req.session.arenaGuestReverseInviteFlash;
    }
    challenge.reverseInvitePath = absoluteGuestInviteUrl(req, reverseToken);
    res.set("Cache-Control", "private, no-store");
    res.set("Referrer-Policy", "no-referrer");
    return res.render("arena-guest-challenge", {
      challenge,
      errorMessage: String(req.query.error || ""),
      disablePageAnalytics: true,
    });
  } catch (error) {
    return next(error);
  }
};

exports.claimedEvidenceFile = async (req, res, next) => {
  try {
    const url = await getClaimedGuestEvidenceFile({
      attemptId: req.params.attemptId,
      userId: req.session.user.id,
      side: req.params.side,
      fileIndex: req.params.fileIndex,
    });
    res.set("Cache-Control", "private, no-store");
    res.set("Referrer-Policy", "no-referrer");
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
};

exports.uploadError = async (error, req, res, next) => {
  const uploaded = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : []),
  ];
  await discardArenaEvidenceFiles(uploaded);
  req.file = undefined;
  if (Array.isArray(req.files)) req.files = [];
  if (String(error?.code || "").startsWith("LIMIT_")) {
    error.status = 413;
    error.message = "풀이 파일은 최대 5장, 총 30MB까지 제출할 수 있습니다.";
  }
  return handleKnownError(error, res, next, `/arena-invite/${encodeURIComponent(req.params.token)}`);
};
