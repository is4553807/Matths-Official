const { lockArenaQuestionCompletion } = require("../services/arenaQuestionCompletionService");
const {
  User,
} = require("../models/matthsModel");
const {
  randomUUID,
} = require("node:crypto");
const {
  ArenaCompetitiveProfile,
} = require("../models/goatArenaModel");
const {
  arenaTierGuide,
  arenaUpperTierPopulationGuide,
} = require("../services/arenaTierPolicy");
const {
  ARENA_ONE_ON_ONE_QUESTION_COUNT,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
} = require("../services/arenaOneOnOneProblemBank");
const {
  getRankingDisplayName,
} = require("../services/userIdentityService");
const {
  advanceArenaMatchQuestion,
  getArenaMatchPageData,
  prepareArenaMatch,
  recordArenaMatchActivity,
  saveArenaMatchAnswers,
  startArenaMatchAttempt,
  submitArenaMatchAttempt,
} = require("../services/arenaMatchAttemptService");
const {
  getArenaSupplementalEvidenceRequest,
  submitArenaMatchEvidence,
  submitArenaSupplementalEvidence,
} = require("../services/arenaMatchEvidenceService");
const {
  getAsyncCompetitiveEvidenceFile,
  getAsyncCompetitiveResult,
} = require("../services/arenaAsyncCompetitiveService");
const {
  assertInlineSolutionBoard,
  getInlineSolutionBoards,
  saveInlineSolutionBoard,
} = require("../services/arenaInlineSolutionBoardService");
const { finalizeWebInlineSolutionBoards } = require("../services/arenaWebInlineSolutionService");
const {
  finalizeArenaMatchAfterEvidence,
} = require("../services/arenaEvidenceSettlementService");
const {
  getGoatArenaV2ReadModel,
  goatArenaV2Rulebook,
} = require("../services/goatArenaV2ReadService");
const {
  getClaimedGuestRecords,
} = require("../services/arenaGuestChallengeService");
const {
  profileView: arenaV2ProfileView,
  syncArenaV2PlacementProfile,
} = require("../services/arenaV2ProfileService");
const {
  getParticipantMatch,
  listParticipantMatches,
} = require("../services/goatArenaProductionMatchReadService");
const {
  getArenaNotificationSummary,
} = require("../services/arenaNotificationService");
const {
  buildArenaActivityLevel,
  getArenaActivityLevel,
} = require("../services/arenaActivityLevelService");
const {
  resolveArenaProfileAvatar,
  updateArenaProfileAvatar,
} = require("../services/arenaProfileAvatarService");
const {
  ARENA_PROFILE_AVATARS,
} = require("../constants/arenaProfileAvatars");
const {
  ARENA_TUTORIAL_FIRST_PATH,
  arenaTutorialView,
  updateArenaTutorial,
} = require("../services/arenaTutorialService");
const {
  getNotificationDetail,
  getNotificationInbox,
  markAllNotificationsRead,
} = require("../services/notificationService");

const GRADE_LABELS = {
  10: "고등학교 1학년",
  11: "고등학교 2학년",
  12: "고등학교 3학년",
  13: "N수생",
  14: "대학생",
  15: "직장인",
};

const ARENA_TIER_GUIDE =
  arenaTierGuide();
const ARENA_UPPER_TIER_GUIDE =
  arenaUpperTierPopulationGuide();
const ARENA_MATCH_RULES = Object.freeze({
  questionCount: ARENA_ONE_ON_ONE_QUESTION_COUNT,
  timeLimitMinutes: Math.round(
    ARENA_ONE_ON_ONE_TIME_LIMIT_MS / 60000
  ),
  evidenceSeconds: Math.round(
    ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS / 1000
  ),
});


function arenaUserView(
  user,
  activityLevel = null
) {
  const avatar = resolveArenaProfileAvatar(
    user?.preferences
  );
  return {
    nickname: String(user?.name || "학생"),
    displayName: getRankingDisplayName(user),
    schoolName: String(
      Number(user?.schoolGrade) === 14
        ? user?.university?.name || "대학교 미설정"
        : Number(user?.schoolGrade) === 15
          ? "직장인"
          : Number(user?.schoolGrade) === 13
            ? "N수생"
            : user?.school?.name || "학교 미설정"
    ),
    gradeLabel: GRADE_LABELS[Number(user?.schoolGrade)] || "학년 미설정",
    activityLevel,
    avatar,
  };
}

async function getArenaNavigationContext(
  userId,
  authenticatedUser = null
) {
  const [
    user,
    arenaNotifications,
    arenaActivityLevel,
    competitiveProfile,
  ] =
    await Promise.all([
      authenticatedUser
        ? Promise.resolve(
            typeof authenticatedUser.toObject === "function"
              ? authenticatedUser.toObject()
              : authenticatedUser
          )
        : User.findById(userId).lean(),
      getArenaNotificationSummary({
        userId,
        hrefBase: "/goat-arena/mailbox",
      }),
      getArenaActivityLevel(userId),
      ArenaCompetitiveProfile.findOne({ userId }).select("accountXp").lean(),
    ]);
  if (!user) {
    const error = new Error("사용자 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  const activityLevel = competitiveProfile
    ? buildArenaActivityLevel(competitiveProfile.accountXp)
    : arenaActivityLevel;
  return {
    user,
    arenaUser: arenaUserView(
      user,
      activityLevel
    ),
    arenaActivityLevel: activityLevel,
    arenaNotifications,
    arenaTutorial: arenaTutorialView(user.preferences, {
      activeDivision: null,
      isAdminPreview: user.role === "admin",
      suspendAutoStart: false,
    }),
  };
}

exports.startPage =
  async (req, res, next) => {
    try {
      const context = await getArenaNavigationContext(
        req.session.user.id,
        req.authenticatedUser
      );
      res.set("Cache-Control", "no-store");
      return res.render("goat-arena", {
        ...context,
        activeArenaPage: "home",
        arenaTierGuide: ARENA_TIER_GUIDE,
        arenaUpperTierGuide: ARENA_UPPER_TIER_GUIDE,
        arenaMatchRules: ARENA_MATCH_RULES,
      });
    } catch (error) {
      return next(error);
    }
  };

function divisionPage(
  division
) {
  const isSub =
    division === "SUB";

  return async (req, res, next) => {
    try {
      const [context, competitiveProfile] = await Promise.all([
        getArenaNavigationContext(
          req.session.user.id,
          req.authenticatedUser
        ),
        isSub
          ? Promise.resolve(null)
          : syncArenaV2PlacementProfile(req.session.user.id),
      ]);

      res.set("Cache-Control", "no-store");
      return res.render("goat-arena-division", {
        ...context,
        activeArenaPage: isSub ? "sub" : "main",
        division,
        divisionLabel: isSub ? "일반전" : "경쟁전",
        divisionKoreanLabel: isSub ? "일반전" : "경쟁전",
        actionError: String(req.query.error || ""),
        actionMessage: String(req.query.notice || ""),
        arenaCompetitiveProfile: competitiveProfile
          ? arenaV2ProfileView(competitiveProfile)
          : null,
      });
    } catch (error) {
      return next(error);
    }
  };
}

exports.subDivisionPage =
  divisionPage("SUB");

exports.mainDivisionPage =
  divisionPage("MAIN");

 function rulesPage(division = null) {
  return async (req, res, next) => {
    try {
      const context = await getArenaNavigationContext(
        req.session.user.id,
        req.authenticatedUser
      );
      res.set("Cache-Control", "no-store");
      return res.render(division ? "goat-arena-rules" : "goat-arena-rules-index", {
        ...context,
        activeArenaPage: "rules",
        rulebook: goatArenaV2Rulebook(new Date(), division),
      });
    } catch (error) {
      return next(error);
    }
  };
}

exports.rulesPage = rulesPage();
exports.subRulesPage = rulesPage("SUB");
exports.mainRulesPage = rulesPage("MAIN");

 exports.profilePage = async (req, res, next) => {
  try {
    const [context, competitiveProfile, claimedGuestRecords] = await Promise.all([
      getArenaNavigationContext(
        req.session.user.id,
        req.authenticatedUser
      ),
      syncArenaV2PlacementProfile(req.session.user.id),
      getClaimedGuestRecords({ userId: req.session.user.id }),
    ]);
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-profile", {
      ...context,
      activeArenaPage: "profile",
      avatarUpdated: req.query.avatarUpdated === "1",
      arenaProfileAvatars: ARENA_PROFILE_AVATARS,
      arenaCompetitiveProfile: arenaV2ProfileView(competitiveProfile),
      claimedGuestRecords,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateArenaTutorial = async (req, res, next) => {
  try {
    const tutorial = await updateArenaTutorial({
      userId: req.session.user.id,
      chapter: req.body.chapter,
      action: req.body.action,
      activeDivision: null,
      isAdminPreview: req.authenticatedUser?.role === "admin",
    });
    res.set("Cache-Control", "no-store");
    return res.json({ tutorial });
  } catch (error) {
    return next(error);
  }
};

exports.restartArenaTutorial = async (req, res, next) => {
  try {
    const chapter = String(req.body.chapter || "").trim().toLowerCase();
    await updateArenaTutorial({
      userId: req.session.user.id,
      chapter,
      action: "RESTART",
      activeDivision: null,
      isAdminPreview: req.authenticatedUser?.role === "admin",
    });
    const firstPath = ARENA_TUTORIAL_FIRST_PATH[chapter];
    if (!firstPath) {
      const error = new Error("다시 볼 튜토리얼 편을 선택해주세요.");
      error.status = 400;
      throw error;
    }
    return res.redirect(
      `${firstPath}?arenaTutorial=${encodeURIComponent(chapter)}&arenaTutorialStep=0`
    );
  } catch (error) {
    return next(error);
  }
};

exports.updateProfileAvatar = async (req, res, next) => {
  try {
    await updateArenaProfileAvatar({
      userId: req.session.user.id,
      avatarCode: req.body.avatarCode,
    });
    return res.redirect("/goat-arena/profile?avatarUpdated=1#arena-avatar");
  } catch (error) {
    return next(error);
  }
};

function arenaMailboxInbox(inbox) {
  return {
    ...inbox,
    notifications: inbox.notifications.map((notification) => ({
      ...notification,
      openHref: `/goat-arena/mailbox/${notification.id}`,
    })),
  };
}

exports.arenaMailboxPage = async (req, res, next) => {
  try {
    const [context, inbox] = await Promise.all([
      getArenaNavigationContext(
        req.session.user.id,
        req.authenticatedUser
      ),
      getNotificationInbox({
        userId: req.session.user.id,
        page: req.query.page,
      }),
    ]);
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-mailbox", {
      ...context,
      activeArenaPage: "mailbox",
      inbox: arenaMailboxInbox(inbox),
      readAll: req.query.readAll === "1",
    });
  } catch (error) {
    return next(error);
  }
};

exports.arenaMailboxDetailPage = async (req, res, next) => {
  try {
    // 상세 조회가 읽음 시각을 기록하므로 헤더의 미확인 개수는 그 뒤에
    // 계산해야 같은 응답 안에서도 즉시 감소한 값이 보인다.
    const notification = await getNotificationDetail({
      userId: req.session.user.id,
      notificationId: req.params.notificationId,
    });
    const context = await getArenaNavigationContext(
      req.session.user.id,
      req.authenticatedUser
    );
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-mailbox-detail", {
      ...context,
      activeArenaPage: "mailbox",
      notification,
    });
  } catch (error) {
    return next(error);
  }
};

exports.markAllArenaMailboxRead = async (req, res, next) => {
  try {
    await markAllNotificationsRead(req.session.user.id);
    return res.redirect("/goat-arena/mailbox?readAll=1");
  } catch (error) {
    return next(error);
  }
};

 async function renderArenaMatchPage(
  req,
  res,
  {
    status = 200,
    matchError = "",
  } = {}
) {
  const matchData = await getArenaMatchPageData({
    matchId: req.params.matchId,
    userId: req.session.user.id,
  });
  const context = await getArenaNavigationContext(
    req.session.user.id,
    req.authenticatedUser
  );
  let asyncCompetitiveResult = null;
  if (matchData.competitiveAsync) {
    try {
      asyncCompetitiveResult = await getAsyncCompetitiveResult({
        matchId: req.params.matchId,
        userId: req.session.user.id,
      });
    } catch (error) {
      if (!["ARENA_RESULT_NOT_UNLOCKED", "ARENA_RESULT_RECORD_INCOMPLETE"].includes(error.code)) {
        throw error;
      }
    }
  }
  let asyncNormalResult = null;
  if (matchData.normalAsync) {
    try {
      asyncNormalResult = await require("../services/arenaAsyncNormalService").getAsyncNormalResult({
        matchId: req.params.matchId,
        userId: req.session.user.id,
      });
    } catch (error) {
      if (!["ARENA_RESULT_NOT_UNLOCKED", "ARENA_RESULT_RECORD_INCOMPLETE"].includes(error.code)) {
        throw error;
      }
    }
  }
  const guestInviteFlash = req.session?.arenaGuestMatchInviteFlash;
  const guestInviteFlashAgeMs = Date.now() - new Date(guestInviteFlash?.createdAt || 0).getTime();
  const guestInviteToken =
    String(guestInviteFlash?.matchId || "") === String(req.params.matchId) &&
    typeof guestInviteFlash?.token === "string" &&
    guestInviteFlash.token.length >= 32 &&
    Number.isFinite(guestInviteFlashAgeMs) &&
    guestInviteFlashAgeMs >= 0 &&
    guestInviteFlashAgeMs <= 10 * 60 * 1000
      ? guestInviteFlash.token
      : "";
  if (guestInviteFlash && (
    guestInviteToken ||
    !Number.isFinite(guestInviteFlashAgeMs) ||
    guestInviteFlashAgeMs > 10 * 60 * 1000
  )) {
    delete req.session.arenaGuestMatchInviteFlash;
  }
  const guestInvitePath = guestInviteToken
    ? `${String(
        process.env.PUBLIC_BASE_URL ||
        process.env.APP_BASE_URL ||
        `${req.protocol}://${req.get("host")}`
      ).replace(/\/$/, "")}/arena-invite/${encodeURIComponent(guestInviteToken)}`
    : "";
  res.set("Cache-Control", "no-store");
  if (guestInvitePath) res.set("Referrer-Policy", "no-referrer");
  return res.status(status).render(
    "goat-arena-match",
    {
      ...context,
      activeArenaPage:
        matchData.division === "MAIN"
          ? "main"
          : "sub",
      matchData,
      asyncCompetitiveResult,
      asyncNormalResult,
      matchError: matchError || String(req.query.matchError || ""),
      matchPrepared:
        req.query.prepared === "1",
      matchStarted:
        req.query.started === "1",
      questionIntroduced: Math.max(
        0,
        Number.parseInt(
          req.query.question,
          10
        ) ||
          Number(
            matchData.autoAdvancedQuestionNumber
          ) ||
          0
      ),
      evidenceSubmitted:
        req.query.evidence === "1",
      guestInvitePath,
      disablePageAnalytics: Boolean(guestInvitePath),
      startRequestId: randomUUID(),
    }
  );
}

exports.arenaMatchPage = async (
  req,
  res,
  next
) => {
  try {
    return await renderArenaMatchPage(
      req,
      res
    );
  } catch (error) {
    return next(error);
  }
};

async function renderArenaMatchActionError(
  req,
  res,
  next,
  error
) {
  if (
    [400, 403, 404, 409, 410, 413, 422, 423].includes(
      Number(error.status)
    )
  ) {
    try {
      return await renderArenaMatchPage(
        req,
        res,
        {
          status: Number(error.status),
          matchError: error.message,
        }
      );
    } catch (renderError) {
      return next(renderError);
    }
  }
  return next(error);
}

exports.arenaMatchUploadError = (
  error,
  req,
  res,
  next
) => {
  if (
    String(error?.code || "").startsWith(
      "LIMIT_"
    )
  ) {
    error.status = 413;
    error.message =
      "풀이 사진은 최대 5장, 한 장당 10MB, 경기당 총 30MB까지 제출할 수 있습니다.";
  }
  return renderArenaMatchActionError(
    req,
    res,
    next,
    error
  );
};

exports.prepareArenaMatch = async (
  req,
  res,
  next
) => {
  try {
    await prepareArenaMatch({
      matchId: req.params.matchId,
      userId: req.session.user.id,
    });
    return res.redirect(
      `/goat-arena/matches/${req.params.matchId}?prepared=1`
    );
  } catch (error) {
    return renderArenaMatchActionError(
      req,
      res,
      next,
      error
    );
  }
};

exports.startArenaMatch = async (
  req,
  res,
  next
) => {
  try {
    await startArenaMatchAttempt({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      requestId: req.body.requestId,
    });
    return res.redirect(
      `/goat-arena/matches/${req.params.matchId}?started=1`
    );
  } catch (error) {
    return renderArenaMatchActionError(
      req,
      res,
      next,
      error
    );
  }
};

exports.saveArenaMatchAnswers = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await saveArenaMatchAnswers({
        matchId: req.params.matchId,
        userId: req.session.user.id,
        requestId: req.body.requestId,
        changes: req.body.changes,
      });
    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

exports.advanceArenaMatchQuestion = async (
  req,
  res,
  next
) => {
  try {
    if (req.body.evidenceMode === "INLINE_BOARD") {
      await assertInlineSolutionBoard({
        matchId: req.params.matchId,
        userId: req.session.user.id,
        questionSlot: req.body.questionSlot,
        expectedRevision: req.body.boardRevision,
        expectedSha256: req.body.boardSha256,
      });
    }
    const result = await advanceArenaMatchQuestion({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      requestId: req.body.requestId,
      value: req.body.value,
      inlineBoard: req.body.evidenceMode === "INLINE_BOARD" ? { revision: req.body.boardRevision, sha256: req.body.boardSha256 } : null,
      submissionMode:
        req.body.submissionMode ===
        "TIME_LIMIT"
          ? "TIME_LIMIT"
          : "MANUAL",
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
};

exports.getArenaInlineSolutionBoards = async (req, res, next) => {
  try {
    const boards = await getInlineSolutionBoards({
      matchId: req.params.matchId,
      userId: req.session.user.id,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ boards });
  } catch (error) {
    return next(error);
  }
};

exports.saveArenaInlineSolutionBoard = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("풀이판 이미지를 확인해주세요.");
      error.status = 400;
      throw error;
    }
    const board = await saveInlineSolutionBoard({
      matchId: req.params.matchId,
      userId: req.session.user.id,
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
    return next(error);
  }
};

exports.finalizeArenaInlineSolutionBoards = async (req, res, next) => {
  try {
    const result = await finalizeWebInlineSolutionBoards({
      matchId: req.params.matchId,
      userId: req.session.user.id,
    });
    res.set("Cache-Control", "no-store");
    return res.json({
      finalized: true,
      replayed: result.replayed === true,
      settlement: result.settlement || null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitArenaMatchEvidence = async (
  req,
  res,
  next
) => {
  try {
    const evidenceResult = await submitArenaMatchEvidence({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      files: req.files,
      receivedAt:
        req.arenaEvidenceReceivedAt,
    });
    const settlement = await finalizeArenaMatchAfterEvidence({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      evidenceResult,
    });
    const stateQuery = settlement?.settled
      ? "&settled=1"
      : settlement?.held
        ? "&held=1"
        : "";
    return res.redirect(
      `/goat-arena/matches/${req.params.matchId}?evidence=1${stateQuery}`
    );
  } catch (error) {
    return renderArenaMatchActionError(req, res, next, error);
  }
};

exports.getAsyncNormalResult = async (req, res, next) => {
  try {
    const result = await require("../services/arenaAsyncNormalService").getAsyncNormalResult({
      matchId: req.params.matchId,
      userId: req.session.user.id,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ result });
  } catch (error) {
    return next(error);
  }
};

exports.getAsyncNormalEvidenceFile = async (req, res, next) => {
  try {
    const file = await require("../services/arenaAsyncNormalService").getAsyncNormalEvidenceFile({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      side: req.params.side,
      fileIndex: req.params.fileIndex,
    });
    return res.redirect(file.url);
  } catch (error) {
    return next(error);
  }
};

exports.getAsyncCompetitiveResult = async (req, res, next) => {
  try {
    const result = await getAsyncCompetitiveResult({
      matchId: req.params.matchId,
      userId: req.session.user.id,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ result });
  } catch (error) {
    return next(error);
  }
};

exports.getAsyncCompetitiveEvidenceFile = async (req, res, next) => {
  try {
    const file = await getAsyncCompetitiveEvidenceFile({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      side: req.params.side,
      fileIndex: req.params.fileIndex,
    });
    res.set("Cache-Control", "no-store");
    return res.redirect(302, file.url);
  } catch (error) {
    return next(error);
  }
};

async function renderArenaSupplementalEvidencePage(
  req,
  res,
  { status = 200, uploadError = "" } = {}
) {
  const [context, requestData] = await Promise.all([
    getArenaNavigationContext(req.session.user.id, req.authenticatedUser),
    getArenaSupplementalEvidenceRequest({
      matchId: req.params.matchId,
      userId: req.session.user.id,
    }),
  ]);
  res.set("Cache-Control", "no-store");
  return res.status(status).render("goat-arena-supplemental-evidence", {
    ...context,
    activeArenaPage: requestData.division === "MAIN" ? "main" : "sub",
    requestData,
    uploadError,
    submitted: req.query.submitted === "1",
  });
}

exports.arenaSupplementalEvidencePage = async (req, res, next) => {
  try {
    return await renderArenaSupplementalEvidencePage(req, res);
  } catch (error) {
    return next(error);
  }
};

exports.submitArenaSupplementalEvidence = async (req, res, next) => {
  try {
    await submitArenaSupplementalEvidence({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      files: req.files,
      receivedAt: req.arenaEvidenceReceivedAt,
    });
    return res.redirect(
      `/goat-arena/matches/${req.params.matchId}/supplemental-evidence?submitted=1`
    );
  } catch (error) {
    if ([400, 404, 409, 410, 413].includes(Number(error.status))) {
      try {
        return await renderArenaSupplementalEvidencePage(req, res, {
          status: Number(error.status),
          uploadError: error.message,
        });
      } catch (_renderError) {
        return next(error);
      }
    }
    return next(error);
  }
};

exports.arenaSupplementalEvidenceUploadError = (error, req, res, next) => {
  if (String(error?.code || "").startsWith("LIMIT_")) {
    error.status = 413;
    error.message = "추가 소명 사진은 최대 5장, 한 장당 10MB까지 제출할 수 있습니다.";
  }
  return renderArenaSupplementalEvidencePage(req, res, {
    status: Number(error.status) || 400,
    uploadError: error.message,
  }).catch(next);
};

 exports.recordArenaMatchActivity = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await recordArenaMatchActivity({
        matchId: req.params.matchId,
        userId: req.session.user.id,
        requestId: req.body.requestId,
        signals: req.body.signals,
      });
    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitArenaMatch = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await submitArenaMatchAttempt({
        matchId: req.params.matchId,
        userId: req.session.user.id,
        requestId: req.body.requestId,
        changes: req.body.changes,
        submissionMode:
          req.body.submissionMode ===
          "TIME_LIMIT"
            ? "TIME_LIMIT"
            : "MANUAL",
      });
    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

/** iPad는 웹과 같은 Arena 모델을 JSON 읽기 모델로만 소비한다. */
exports.getGoatArena = async (req, res, next) => {
  try {
    const arena = await getGoatArenaV2ReadModel(req.apiUser, new Date());
    res.set("Cache-Control", "no-store");
    return res.json({ arena });
  } catch (error) {
    return next(error);
  }
};

exports.getGoatArenaMatches = async (req, res, next) => {
  try {
    const result = await listParticipantMatches({
      userId: req.apiUser._id,
      cursor: req.query.cursor,
      limit: req.query.limit,
      role: req.query.role,
      actionable: req.query.actionable,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

exports.getGoatArenaMatch = async (req, res, next) => {
  try {
    const match = await getParticipantMatch({
      userId: req.apiUser._id,
      id: req.params.matchId,
    });
    return res.json({ match });
  } catch (error) {
    return next(error);
  }
};

exports.getGoatArenaRulebook = async (req, res, next) => {
  try {
    const now = new Date();
    res.set("Cache-Control", "no-store");
    return res.json({ rulebook: goatArenaV2Rulebook(now) });
  } catch (error) {
    return next(error);
  }
};

exports._testing = {
  ARENA_TIER_GUIDE,
};

exports.lockArenaQuestionCompletion = async (req, res, next) => {
  try {
    const allowed = ["questionSlot", "requestId", "answer", "boardRevision", "strokeCount", "drawingSha256", "evidenceMode", "submissionMode"];
    if (Object.keys(req.body || {}).some((key) => !allowed.includes(key))) throw Object.assign(new Error("문항 완료 요청 정보를 확인해주세요."), { status: 400, code: "ARENA_QUESTION_LOCK_INVALID" });
    const input = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
    const lock = await lockArenaQuestionCompletion({ ...input, matchId: req.params.matchId, userId: req.session.user.id });
    res.set("Cache-Control", "no-store");
    return res.json({ lock });
  } catch (error) { return next(error); }
};
