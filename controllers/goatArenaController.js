const {
  User,
} = require("../models/matthsModel");
const {
  randomUUID,
} = require("node:crypto");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  getPlacementDashboardData,
} = require("../services/placementExamService");
const {
  getRankingData,
} = require("../services/rankingService");
const {
  arenaTierGuide,
} = require("../services/arenaTierPolicy");
const {
  getRankingDisplayName,
} = require("../services/userIdentityService");
const {
  createSubNormalChallenge,
  getSubChallengeData,
} = require("../services/arenaMatchService");
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
  submitArenaMatchEvidence,
} = require("../services/arenaMatchEvidenceService");
const {
  settleSubNormalMatch,
} = require("../services/arenaMatchSettlementService");
const {
  getActiveMainDivisionPolicy,
  mainPolicySnapshot,
} = require("../services/arenaPolicyService");

const GRADE_LABELS = {
  10: "고등학교 1학년",
  11: "고등학교 2학년",
  12: "고등학교 3학년",
  13: "N수생",
};

const ARENA_TIER_GUIDE =
  arenaTierGuide();

function buildSeedState(
  placement,
  currentRanking
) {
  const confirmedGp =
    Number(currentRanking?.gp);
  if (
    currentRanking?.arenaDivision &&
    Number.isFinite(confirmedGp)
  ) {
    return {
      code: "READY",
      label: "Arena 상태 확정",
      detail:
        "GP·티어·티어 내 순위가 확정된 상태입니다.",
      tier:
        currentRanking.arenaRank,
      division:
        currentRanking.arenaDivision === "MAIN"
          ? "Main Division"
          : "Sub Division",
      gp: confirmedGp,
      tierRank:
        currentRanking
          .tierRank ||
        null,
      ready: true,
    };
  }

  if (
    placement.status ===
      "submitted" &&
    placement.result
  ) {
    return {
      code: "PROFILE_PENDING",
      label: "Arena 프로필 생성 대기",
      detail:
        "배치고사 결과는 내부 실력 지표와 첫 Sub Division 배치에 반영됩니다. 시험 점수를 Arena GP로 직접 표시하지 않습니다.",
      ready: false,
    };
  }

  if (
    placement.status ===
    "verification-required"
  ) {
    return {
      code: "VERIFY",
      label: "추가 확인 진행 중",
      detail:
        "4문항 확인을 마치면 최초 내부 실력 지표와 Sub Division 배치가 확정됩니다.",
      ready: false,
    };
  }

  if (
    placement.status ===
    "in-progress"
  ) {
    return {
      code: "PLACEMENT",
      label: "배치고사 진행 중",
      detail: `${placement.answeredCount || 0} / 30문항 저장됨`,
      ready: false,
    };
  }

  return {
    code: "PLACEMENT",
    label: "배치고사 필요",
    detail:
      "배치고사를 완료해야 최초 내부 실력 지표와 Sub Division 배치 절차를 시작할 수 있습니다.",
    ready: false,
  };
}

function buildArenaAccess(
  user,
  {
    accessState = null,
    accessCycle = null,
    standing = null,
  } = {}
) {
  const storedRanking =
    String(
      accessState
        ?.currentCompetitiveDivision ||
        ""
    ).toUpperCase();
  const activeDivision =
    ["SUB", "MAIN"].includes(
      storedRanking
    )
      ? storedRanking
      : null;
  const isAdminPreview =
    user?.role === "admin";
  const persistedAccessStatus =
    accessState?.state ||
    null;
  const availableDays = Number(
    accessCycle?.availableLearningDays || 0
  );
  const mainTotalDays =
    availableDays +
    Number(
      accessCycle?.reservedLearningDays || 0
    ) +
    Number(
      accessCycle?.lockedLearningDays || 0
    );
  const hasUsableCycleBalance =
    activeDivision === "MAIN"
      ? mainTotalDays > 0
      : availableDays > 0;
  const canInteract =
    user?.accountStatus ===
      "active" &&
    persistedAccessStatus ===
      "PAID_ACTIVE" &&
    hasUsableCycleBalance &&
    accessState
      ?.currentSeasonPlacementCompleted ===
      true;
  const canUseSub =
    (activeDivision === "SUB" &&
      canInteract) ||
    isAdminPreview;
  const canUseMain =
    (activeDivision === "MAIN" &&
      canInteract) ||
    isAdminPreview;

  return {
    activeDivision,
    isAdminPreview,
    canUseSub,
    canUseMain,
    accessStatus:
      persistedAccessStatus ||
      (isAdminPreview
        ? "ADMIN_PREVIEW"
        : "SEASON_PLACEMENT_REQUIRED"),
    mainAchievementStatus:
      accessState?.mainAchievementStatus ||
      "NOT_ACHIEVED",
    currentSeasonPlacementCompleted:
      accessState
        ?.currentSeasonPlacementCompleted ===
      true,
    expiredAt:
      accessState?.expiredAt || null,
    renewalGraceDeadline:
      accessState?.renewalGraceDeadline ||
      null,
    learningRights: {
      availableDays:
        accessCycle
          ?.availableLearningDays ??
        null,
      paybackScoreDays:
        accessCycle
          ?.paybackScoreDays ??
        null,
      lockedDays:
        accessCycle
          ?.lockedLearningDays ??
        null,
      reservedDays:
        accessCycle
          ?.reservedLearningDays ??
        null,
      totalMainDays:
        accessCycle ? mainTotalDays : null,
      neededForRefund:
        accessCycle
          ? Math.max(
              0,
              Number(
                accessCycle
                  .policySnapshot
                  ?.payback
                  ?.minimumScoreDays ||
                  30
              ) -
                Number(
                  accessCycle
                    .paybackScoreDays ||
                    0
                )
            )
          : null,
    },
    standing: standing
      ? {
          division:
            standing.division,
          tier: standing.arenaRank,
          arenaRank: standing.arenaRank,
          arenaPosition:
            standing.arenaPosition,
          gp: standing.arenaGp,
        }
      : null,
  };
}

const DIVISION_FEATURES = {
  SUB: [
    {
      key:
        "subChallengeRequest",
      name: "일반 쟁탈전 신청",
      description:
        "같은 Sub Division의 방어자에게 일반 쟁탈전을 신청합니다.",
      href:
        "/goat-arena/sub/challenge",
    },
    {
      key:
        "subDefenseInbox",
      name: "방어 요청",
      description:
        "배정된 도전과 응답 기한을 확인합니다.",
    },
    {
      key:
        "subActiveMatch",
      name: "진행 중 경기",
      description:
        "준비·진행·제출 상태의 경기를 이어서 확인합니다.",
    },
    {
      key:
        "subRevengeMatch",
      name:
        "복수전",
      description:
        "정산으로 획득한 복수전 권리를 사용합니다.",
    },
    {
      key:
        "subRankHistory",
      name: "순위 변동 기록",
      description:
        "정산된 티어·티어 내 순위·GP 변동 이력을 확인합니다.",
    },
    {
      key:
        "subPaybackProgress",
      name: "페이백 진행",
      description:
        "연속 학습·유료 일반 쟁탈전·페이백 점수·공정성 검토 상태를 확인합니다.",
    },
  ],
  MAIN: [
    {
      key: "mainArenaStatus",
      name: "Main Division 상태",
      description:
        "현재 Main Division Arena 상태와 정기권 학습 가능 일수를 확인합니다.",
    },
    {
      key: "mainUpwardChallenge",
      name: "상위 티어 쟁탈전",
      description:
        "목표 상위 티어를 고르면 서버가 적격 상대를 무작위로 정합니다.",
    },
    {
      key: "mainLowerTierInvitation",
      name: "하위 티어 초대전",
      description:
        "목표 하위 티어에 내 Arena 상태와 학습일수를 건 초대를 만듭니다.",
    },
    {
      key: "mainInvitationManagement",
      name: "초대 관리",
      description:
        "수락 전 예약 학습일수와 받은 초대·보낸 초대 상태를 확인합니다.",
    },
    {
      key: "mainRevengeMatch",
      name: "복수전",
      description:
        "원경기 배팅의 두 배와 신청 수수료가 적용되는 복수전 상태를 확인합니다.",
    },
    {
      key: "mainLearningDayLedger",
      name: "학습일수 장부",
      description:
        "사용 가능·초대 예약·경기 중 잠금 일수와 이전 기록을 확인합니다.",
    },
    {
      key: "mainActiveMatch",
      name: "진행 중 경기",
      description:
        "준비·진행·증거 제출 상태의 경기를 이어서 확인합니다.",
    },
    {
      key: "mainMatchReview",
      name: "경기 기록",
      description:
        "확정된 상대·배팅 일수·Arena 상태와 학습일수 변동을 확인합니다.",
    },
    {
      key:
        "mainRankHistory",
      name: "순위 변동 기록",
      description:
        "정산된 티어·티어 내 순위·GP 변동 이력을 확인합니다.",
    },
    {
      key: "mainExpiryGuide",
      name: "이용 종료·재구매 안내",
      description:
        "Sub Division 강등, 72시간 변환과 랭크 탈환 배치고사 조건을 확인합니다.",
    },
  ],
};

async function getArenaContext(
  userId
) {
  const [
    user,
    placement,
    ranking,
    accessState,
    activeMainPolicy,
  ] = await Promise.all([
    User.findById(
      userId
    ).lean(),
    getPlacementDashboardData(
      userId
    ),
    getRankingData(
      userId
    ),
    ArenaAccessState.findOne({
      userId,
    }).lean(),
    getActiveMainDivisionPolicy(),
  ]);

  if (!user) {
    const error =
      new Error(
        "사용자 정보를 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  const currentRanking =
    ranking.current || null;
  const [accessCycle, standing] =
    await Promise.all([
      accessState?.accessCycleId
        ? AccessCycle.findById(
            accessState.accessCycleId
          ).lean()
        : null,
      accessState?.standingId
        ? ArenaStanding.findById(
            accessState.standingId
          ).lean()
        : null,
    ]);

  return {
    user,
    ranking,
    arenaUser: {
      nickname:
        String(
          user.name ||
            "학생"
        ),
      displayName:
        getRankingDisplayName(
          user
        ),
      schoolName:
        String(
          user.school?.name ||
            "학교 미설정"
        ),
      gradeLabel:
        GRADE_LABELS[
          Number(
            user.schoolGrade
          )
        ] ||
        "학년 미설정",
    },
    seedState:
      buildSeedState(
        placement,
        currentRanking
      ),
    arenaAccess:
      buildArenaAccess(
        user,
        {
          accessState,
          accessCycle,
          standing,
        }
      ),
    activeMainPolicy:
      mainPolicySnapshot(activeMainPolicy),
  };
}

function renderArenaPage(
  view,
  extra = {}
) {
  return async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        await getArenaContext(
          req.session.user.id
        );

      res.set(
        "Cache-Control",
        "no-store"
      );

      return res.render(
        view,
        {
          ...context,
          ...extra,
        }
      );
    } catch (error) {
      return next(error);
    }
  };
}

exports.startPage =
  renderArenaPage(
    "goat-arena",
    {
      activeArenaPage:
        "home",
      arenaTierGuide:
        ARENA_TIER_GUIDE,
    }
  );

exports.rankingsPage =
  renderArenaPage(
    "goat-arena-rankings",
    {
      activeArenaPage:
        "rankings",
    }
  );

function divisionPage(
  division
) {
  const isSub =
    division === "SUB";

  return renderArenaPage(
    "goat-arena-division",
    {
      activeArenaPage:
        isSub
          ? "sub"
          : "main",
      division,
      divisionLabel:
        isSub
          ? "Sub Division"
          : "Main Division",
      divisionKoreanLabel:
        isSub
          ? "Sub Division 전장"
          : "Main Division 전장",
      features:
        DIVISION_FEATURES[
          division
        ].map((feature) => ({
          ...feature,
          href:
            feature.href ||
            `/goat-arena/${division.toLowerCase()}/features/${feature.key}`,
        })),
    }
  );
}

exports.subDivisionPage =
  divisionPage("SUB");

exports.mainDivisionPage =
  divisionPage("MAIN");

exports.divisionFeaturePage = async (
  req,
  res,
  next
) => {
  try {
    const division = String(
      req.params.division || ""
    ).toUpperCase();
    const feature =
      DIVISION_FEATURES[division]?.find(
        (entry) =>
          entry.key === req.params.featureKey &&
          !entry.href
      );
    if (!feature) {
      const error = new Error(
        "GOAT Arena 기능 페이지를 찾을 수 없습니다."
      );
      error.status = 404;
      throw error;
    }
    const context = await getArenaContext(
      req.session.user.id
    );
    const hasDivisionAccess =
      division === "SUB"
        ? context.arenaAccess.canUseSub
        : context.arenaAccess.canUseMain;
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-feature", {
      ...context,
      activeArenaPage:
        division === "SUB" ? "sub" : "main",
      division,
      divisionLabel:
        division === "SUB"
          ? "Sub Division"
          : "Main Division",
      feature,
      hasDivisionAccess,
    });
  } catch (error) {
    return next(error);
  }
};

exports.profilePage =
  renderArenaPage(
    "goat-arena-profile",
    {
      activeArenaPage:
        "profile",
    }
  );

async function renderSubChallengePage(
  req,
  res,
  {
    status = 200,
    matchError = "",
  } = {}
) {
  const context = await getArenaContext(
    req.session.user.id
  );
  const challengeData =
    await getSubChallengeData({
      userId:
        req.session.user.id,
    });
  res.set("Cache-Control", "no-store");
  return res.status(status).render(
    "goat-arena-sub-challenge",
    {
      ...context,
      activeArenaPage: "sub",
      challengeData,
      requestId: randomUUID(),
      matchCreated:
        req.query.created === "1",
      matchError,
    }
  );
}

exports.subChallengePage = async (
  req,
  res,
  next
) => {
  try {
    return await renderSubChallengePage(
      req,
      res
    );
  } catch (error) {
    return next(error);
  }
};

exports.createSubChallenge = async (
  req,
  res,
  next
) => {
  try {
    await createSubNormalChallenge({
      challengerUserId:
        req.session.user.id,
      targetTier:
        req.body.targetTier,
      requestId: req.body.requestId,
    });
    return res.redirect(
      "/goat-arena/sub/challenge?created=1"
    );
  } catch (error) {
    if (
      [400, 403, 404, 409].includes(
        Number(error.status)
      )
    ) {
      try {
        return await renderSubChallengePage(
          req,
          res,
          {
            status: Number(error.status),
            matchError:
              error.message,
          }
        );
      } catch (renderError) {
        return next(renderError);
      }
    }
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
  const [context, matchData] =
    await Promise.all([
      getArenaContext(
        req.session.user.id
      ),
      getArenaMatchPageData({
        matchId: req.params.matchId,
        userId: req.session.user.id,
      }),
    ]);
  res.set("Cache-Control", "no-store");
  return res.status(status).render(
    "goat-arena-match",
    {
      ...context,
      activeArenaPage: "sub",
      matchData,
      matchError,
      matchPrepared:
        req.query.prepared === "1",
      matchStarted:
        req.query.started === "1",
      evidenceSubmitted:
        req.query.evidence === "1",
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
    [400, 403, 404, 409, 410, 423].includes(
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
    const result = await advanceArenaMatchQuestion({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      requestId: req.body.requestId,
      value: req.body.value,
    });
    return res.json({ ok: true, ...result });
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
    });
    let settlement = null;
    if (evidenceResult.matchStatus === "SUBMITTED") {
      settlement = await settleSubNormalMatch({
        matchId: req.params.matchId,
      });
    }
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

exports._testing = {
  buildArenaAccess,
  buildSeedState,
  ARENA_TIER_GUIDE,
  DIVISION_FEATURES,
};
