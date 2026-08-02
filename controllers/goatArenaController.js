const {
  User,
} = require("../models/matthsModel");
const {
  randomUUID,
} = require("node:crypto");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaRevengeRight,
  ArenaStanding,
  MainShopEffect,
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
  settleArenaMatch,
} = require("../services/arenaMatchSettlementService");
const {
  createSubRevengeMatch,
  forfeitSubRevengeRight,
} = require("../services/arenaRevengeService");
const {
  getActiveArenaPolicy,
  getActiveMainDivisionPolicy,
  mainPolicySnapshot,
} = require("../services/arenaPolicyService");
const {
  getArenaRulebook,
} = require("../services/arenaRulebookViewService");
const {
  cancelMainInvitation,
  createMainLowerInvitation,
  createMainUpwardChallenge,
  getMainArenaActionData,
  respondToMainInvitation,
} = require("../services/mainArenaMatchService");
const {
  createMainRevengeMatch,
  forfeitMainRevengeRight,
} = require("../services/mainArenaRevengeService");
const {
  getMainShopPageData,
  purchaseMainShopItem,
} = require("../services/arenaShopPolicyService");

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
  const minimumPaybackScore = Number(
    accessCycle?.policySnapshot?.payback?.minimumScoreDays ?? 30
  );
  const minimumStudyStreakDays = Number(
    accessCycle?.policySnapshot?.payback?.minimumStreakDays ??
      accessCycle?.policySnapshot?.initialLearningDays ??
      29
  );
  const studyStreakDays = Number(accessCycle?.streakDays || 0);
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
              minimumPaybackScore -
                Number(
                  accessCycle
                    .paybackScoreDays ||
                    0
                )
            )
          : null,
      minimumPaybackScore:
        accessCycle ? minimumPaybackScore : null,
      studyStreakDays:
        accessCycle ? studyStreakDays : null,
      minimumStudyStreakDays:
        accessCycle ? minimumStudyStreakDays : null,
      studyDaysNeeded:
        accessCycle
          ? Math.max(0, minimumStudyStreakDays - studyStreakDays)
          : null,
      fullAttendanceQualified:
        accessCycle
          ? studyStreakDays >= minimumStudyStreakDays
          : false,
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
      href: "/goat-arena/main/battle",
    },
    {
      key: "mainLowerTierInvitation",
      name: "하위 티어 초대전",
      description:
        "목표 하위 티어에 내 Arena 상태를 걸고 학습일수를 예치하는 초대를 만듭니다.",
      href: "/goat-arena/main/battle#main-invitation-create",
    },
    {
      key: "mainInvitationManagement",
      name: "초대 관리",
      description:
        "수락 전 예약 학습일수와 받은 초대·보낸 초대 상태를 확인합니다.",
      href: "/goat-arena/main/battle#main-invitations",
    },
    {
      key: "mainRevengeMatch",
      name: "복수전",
      description:
        "원경기 예치의 두 배와 신청 수수료가 적용되는 복수전 상태를 확인합니다.",
    },
    {
      key: "mainLearningDayLedger",
      name: "학습일수 장부",
      description:
        "사용 가능·초대 예약·경기 예치 학습일수와 이전 기록을 확인합니다.",
    },
    {
      key: "mainShop",
      name: "Main Division 상점",
      description:
        "경기로 확보한 사용 가능 학습일수로 분석·일정·프로필 편의 기능을 이용합니다.",
      href: "/goat-arena/main/shop",
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
        "확정된 상대·예치 일수·Arena 상태와 학습일수 변동을 확인합니다.",
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
        "Sub Division 강등, 72시간 변환과 랭크 복귀전 조건을 확인합니다.",
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
    activeCosmetics,
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
    MainShopEffect.find({
      userId,
      itemCode: { $in: ["MAIN_PROFILE_BORDER", "STYLE_ENTRANCE"] },
      status: "ACTIVE",
      endsAt: { $gt: new Date() },
    }).lean(),
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
      hasMainProfileBorder: activeCosmetics.some(
        (effect) => effect.itemCode === "MAIN_PROFILE_BORDER"
      ),
      hasStyleEntrance: activeCosmetics.some(
        (effect) => effect.itemCode === "STYLE_ENTRANCE"
      ),
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

async function renderMainBattlePage(
  req,
  res,
  { status = 200, actionError = "", actionMessage = "" } = {}
) {
  const [context, battleData] = await Promise.all([
    getArenaContext(req.session.user.id),
    getMainArenaActionData({ userId: req.session.user.id }),
  ]);
  res.set("Cache-Control", "no-store");
  return res.status(status).render("goat-arena-main-battle", {
    ...context,
    activeArenaPage: "main",
    battleData,
    actionError,
    actionMessage,
    requestId: randomUUID(),
  });
}

exports.mainBattlePage = async (req, res, next) => {
  try {
    return await renderMainBattlePage(req, res, {
      actionMessage: req.query.done === "1" ? "요청을 처리했습니다." : "",
    });
  } catch (error) {
    return next(error);
  }
};

async function mainBattleAction(req, res, next, action) {
  try {
    const result = await action();
    if (result?.match?._id || result?.matchId) {
      return res.redirect(
        `/goat-arena/matches/${result.match?._id || result.matchId}`
      );
    }
    return res.redirect("/goat-arena/main/battle?done=1");
  } catch (error) {
    if ([400, 403, 404, 409, 410, 423].includes(Number(error.status))) {
      try {
        return await renderMainBattlePage(req, res, {
          status: Number(error.status),
          actionError: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
}

exports.createMainUpwardChallenge = (req, res, next) =>
  mainBattleAction(req, res, next, () =>
    createMainUpwardChallenge({
      userId: req.session.user.id,
      targetTier: req.body.targetTier,
      stakeDays: req.body.stakeDays,
      requestId: req.body.requestId,
    })
  );

exports.createMainLowerInvitation = (req, res, next) =>
  mainBattleAction(req, res, next, () =>
    createMainLowerInvitation({
      userId: req.session.user.id,
      targetTier: req.body.targetTier,
      stakeDays: req.body.stakeDays,
      requestId: req.body.requestId,
    })
  );

exports.respondMainInvitation = (req, res, next) =>
  mainBattleAction(req, res, next, () =>
    respondToMainInvitation({
      offerId: req.params.offerId,
      userId: req.session.user.id,
      response: req.body.response,
    })
  );

exports.cancelMainInvitation = (req, res, next) =>
  mainBattleAction(req, res, next, () =>
    cancelMainInvitation({
      invitationId: req.params.invitationId,
      userId: req.session.user.id,
      cancellationType: "MANUAL",
    })
  );

async function renderMainShopPage(
  req,
  res,
  { status = 200, shopError = "", shopMessage = "" } = {}
) {
  const [context, shopData] = await Promise.all([
    getArenaContext(req.session.user.id),
    getMainShopPageData({ userId: req.session.user.id }),
  ]);
  res.set("Cache-Control", "no-store");
  return res.status(status).render("goat-arena-main-shop", {
    ...context,
    activeArenaPage: "shop",
    shopData,
    shopError,
    shopMessage,
    requestId: randomUUID(),
  });
}

exports.mainShopPage = async (req, res, next) => {
  try {
    return await renderMainShopPage(req, res, {
      shopMessage: req.query.done === "1" ? "상점 아이템을 적용했습니다." : "",
    });
  } catch (error) {
    return next(error);
  }
};

exports.purchaseMainShopItem = async (req, res, next) => {
  try {
    const result = await purchaseMainShopItem({
      userId: req.session.user.id,
      itemCode: req.body.itemCode,
      requestId: req.body.requestId,
      relatedMatchId: req.body.relatedMatchId || null,
      relatedInvitationId: req.body.relatedInvitationId || null,
    });
    if (result?.matchId) {
      return res.redirect(`/goat-arena/matches/${result.matchId}?protected=1`);
    }
    return res.redirect("/goat-arena/main/shop?done=1");
  } catch (error) {
    if ([400, 403, 404, 409, 410, 423].includes(Number(error.status))) {
      try {
        return await renderMainShopPage(req, res, {
          status: Number(error.status),
          shopError: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

function rulesPage(division) {
  return async (req, res, next) => {
    try {
      const [context, paybackPolicy, mainPolicy] = await Promise.all([
        getArenaContext(req.session.user.id),
        division === "SUB" ? getActiveArenaPolicy() : null,
        division === "MAIN"
          ? getActiveMainDivisionPolicy(new Date(), { bypassCache: true })
          : null,
      ]);
      res.set("Cache-Control", "no-store");
      return res.render("goat-arena-rules", {
        ...context,
        activeArenaPage: "rules",
        rulebook: getArenaRulebook(division, {
          paybackPolicy,
          mainPolicy,
        }),
      });
    } catch (error) {
      return next(error);
    }
  };
}

exports.subRulesPage = rulesPage("SUB");
exports.mainRulesPage = rulesPage("MAIN");

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
      activeArenaPage:
        matchData.division === "MAIN" ? "main" : "sub",
      matchData,
      matchError,
      matchPrepared:
        req.query.prepared === "1",
      matchStarted:
        req.query.started === "1",
      evidenceSubmitted:
        req.query.evidence === "1",
      startRequestId: randomUUID(),
      revengeRequestId: randomUUID(),
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
      settlement = await settleArenaMatch({
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

exports.claimSubRevenge = async (req, res, next) => {
  try {
    const right = await ArenaRevengeRight.findById(
      req.params.rightId
    )
      .select("division")
      .lean();
    const creator = right?.division === "MAIN"
      ? createMainRevengeMatch
      : createSubRevengeMatch;
    const result = await creator({
      revengeRightId: req.params.rightId,
      userId: req.session.user.id,
      requestId: req.body.requestId,
    });
    return res.redirect(`/goat-arena/matches/${result.matchId}`);
  } catch (error) {
    return next(error);
  }
};

exports.forfeitSubRevenge = async (req, res, next) => {
  try {
    const right = await ArenaRevengeRight.findById(
      req.params.rightId
    )
      .select("division")
      .lean();
    const forfeit = right?.division === "MAIN"
      ? forfeitMainRevengeRight
      : forfeitSubRevengeRight;
    const result = await forfeit({
      revengeRightId: req.params.rightId,
      userId: req.session.user.id,
      requestId: req.body.requestId,
    });
    return res.redirect(`/goat-arena/matches/${result.sourceMatchId}?revengeForfeited=1`);
  } catch (error) {
    return next(error);
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
