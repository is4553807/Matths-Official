const {
  User,
} = require("../models/matthsModel");
const {
  randomUUID,
} = require("node:crypto");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaPaybackReview,
  ArenaRevengeRight,
  ArenaStanding,
  ArenaStandingChangeLedger,
  MainShopEffect,
} = require("../models/goatArenaModel");
const {
  getPlacementDashboardData,
} = require("../services/placementExamService");
const {
  errorFaqHref,
} = require("../services/errorHelpService");
const {
  getRankingData,
} = require("../services/rankingService");
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
  getArenaSupplementalEvidenceRequest,
  submitArenaMatchEvidence,
  submitArenaSupplementalEvidence,
} = require("../services/arenaMatchEvidenceService");
const {
  acknowledgeRankUpPresentation,
  getPendingRankUpPresentation,
} = require("../services/arenaRankUpPresentationService");
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
  getUpcomingArenaPolicy,
  getUpcomingMainDivisionPolicy,
  mainPolicySnapshot,
  policySnapshot,
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
  getMainShopAnalysisResult,
  getMainShopPageData,
  purchaseMainShopItem,
} = require("../services/arenaShopPolicyService");
const {
  recordOperationalMetricEvent,
} = require("../services/operationalMetricEventService");
const {
  getPaybackAccountSummary,
  saveConfirmedPaybackAccount,
  validatePaybackAccountInput,
} = require("../services/paybackAccountService");
const {
  getArenaNotificationSummary,
} = require("../services/arenaNotificationService");

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
          ? "Ranked"
          : "Unranked",
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
        "배치고사 결과는 내부 실력 지표와 첫 Unranked 배치에 반영됩니다. 시험 점수를 Arena GP로 직접 표시하지 않습니다.",
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
        "4문항 확인을 마치면 최초 내부 실력 지표와 Unranked 배치가 확정됩니다.",
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
      "배치고사를 완료해야 최초 내부 실력 지표와 Unranked 배치 절차를 시작할 수 있습니다.",
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
  const paybackDisqualified = Boolean(
    activeDivision === "SUB" &&
      (
        accessState?.paybackDisqualifiedAt ||
        (accessCycle?.paybackDisqualifiers || []).includes(
          "INTEGRITY_VIOLATION_CONFIRMED"
        )
      )
  );
  // 29일 연속 기록만 과거 값으로 남아 있는 경우 '달성'으로 잘못
  // 보이지 않도록 실제 이용 주기가 끝났거나 평가된 뒤에만 완료로 표시한다.
  const fullAttendanceQualified = Boolean(
    accessCycle &&
      !paybackDisqualified &&
      studyStreakDays >= minimumStudyStreakDays &&
      (
        accessCycle.evaluatedAt ||
        (accessCycle.endsAt && new Date(accessCycle.endsAt).getTime() <= Date.now())
      )
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
    accessCycleId:
      isAdminPreview || !accessCycle?._id
        ? null
        : accessCycle._id,
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
    automaticDefense: {
      eligible:
        isAdminPreview ||
        accessState?.defensePoolEligible === true,
      noShowCount: isAdminPreview
        ? 0
        : Number(accessState?.automaticDefenseNoShowCount || 0),
      suspendedAt:
        isAdminPreview
          ? null
          : accessState?.automaticDefenseSuspendedAt || null,
      suspended:
        !isAdminPreview &&
        accessState?.reasonCode === "AUTO_DEFENSE_NO_SHOW_LIMIT",
    },
    learningRights: {
      availableDays:
        isAdminPreview
          ? "무제한"
          : accessCycle?.availableLearningDays ?? null,
      paybackScoreDays:
        isAdminPreview
          ? "무제한"
          : paybackDisqualified
            ? "자격 박탈"
            : accessCycle?.paybackScoreDays ?? null,
      lockedPaybackScoreDays:
        isAdminPreview
          ? 0
          : accessCycle?.lockedPaybackScoreDays ?? 0,
      lockedDays:
        isAdminPreview
          ? 0
          : accessCycle?.lockedLearningDays ?? null,
      reservedDays:
        isAdminPreview
          ? 0
          : accessCycle?.reservedLearningDays ?? null,
      totalMainDays:
        isAdminPreview
          ? "무제한"
          : accessCycle ? mainTotalDays : null,
      unlimited:
        isAdminPreview,
      expiresAt:
        isAdminPreview
          ? null
          : accessCycle?.expiresAt || null,
      neededForRefund:
        paybackDisqualified
          ? "자격 박탈"
          : accessCycle
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
      paybackDisqualified,
      fullAttendanceQualified,
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
        "같은 Unranked의 방어자에게 일반 쟁탈전을 신청합니다.",
      href:
        "/goat-arena/sub/challenge",
      group: "BATTLE",
    },
    {
      key:
        "subActiveMatch",
      name: "진행 중 경기",
      description:
        "준비·진행·제출 상태의 경기를 이어서 확인합니다.",
      group: "BATTLE",
    },
    {
      key:
        "subRevengeMatch",
      name:
        "복수전",
      description:
        "정산으로 획득한 복수전 권리를 사용합니다.",
      group: "BATTLE",
    },
    {
      key:
        "subRankHistory",
      name: "순위 변동 기록",
      description:
        "정산된 티어·티어 내 순위·GP 변동 이력을 확인합니다.",
      group: "RECORD",
    },
    {
      key:
        "subPaybackProgress",
      name: "페이백 진행",
      description:
        "29일 전일 학습·페이백 점수·공정성 검토 상태를 확인합니다.",
      group: "PROGRESS",
    },
  ],
  MAIN: [
    {
      key: "mainArenaStatus",
      name: "Ranked 상태",
      description:
        "현재 Ranked Arena 상태와 정기권 학습 가능 일수를 확인합니다.",
      group: "OPERATIONS",
    },
    {
      key: "mainUpwardChallenge",
      name: "상위 티어 쟁탈전",
      description:
        "목표 상위 티어를 고르면 서버가 적격 상대를 무작위로 정합니다.",
      href: "/goat-arena/main/battle",
      group: "BATTLE",
    },
    {
      key: "mainLowerTierInvitation",
      name: "하위 티어 초대전",
      description:
        "목표 하위 티어에 내 Arena 상태를 걸고 학습일수를 예치하는 초대를 만듭니다.",
      href: "/goat-arena/main/battle#main-invitation-create",
      group: "BATTLE",
    },
    {
      key: "mainInvitationManagement",
      name: "초대 관리",
      description:
        "수락 전 예약 학습일수와 받은 초대·보낸 초대 상태를 확인합니다.",
      href: "/goat-arena/main/battle#main-invitations",
      group: "OPERATIONS",
    },
    {
      key: "mainRevengeMatch",
      name: "복수전",
      description:
        "원경기 예치의 두 배와 신청 수수료가 적용되는 복수전 상태를 확인합니다.",
      group: "BATTLE",
    },
    {
      key: "mainLearningDayLedger",
      name: "학습일수 장부",
      description:
        "사용 가능·초대 예약·경기 예치 학습일수와 이전 기록을 확인합니다.",
      group: "OPERATIONS",
    },
    {
      key: "mainShop",
      name: "Ranked 상점",
      description:
        "경기로 확보한 사용 가능 학습일수로 분석·일정·프로필 편의 기능을 이용합니다.",
      href: "/goat-arena/main/shop",
      group: "SUPPORT",
    },
    {
      key: "mainActiveMatch",
      name: "진행 중 경기",
      description:
        "준비·진행·증거 제출 상태의 경기를 이어서 확인합니다.",
      group: "BATTLE",
    },
    {
      key: "mainMatchReview",
      name: "경기 기록",
      description:
        "확정된 상대·예치 일수·Arena 상태와 학습일수 변동을 확인합니다.",
      group: "RECORD",
    },
    {
      key:
        "mainRankHistory",
      name: "순위 변동 기록",
      description:
        "정산된 티어·티어 내 순위·GP 변동 이력을 확인합니다.",
      group: "RECORD",
    },
    {
      key: "mainExpiryGuide",
      name: "이용 종료·재구매 안내",
      description:
        "Unranked 강등, 72시간 변환과 랭크 복귀전 조건을 확인합니다.",
      group: "SUPPORT",
    },
  ],
};

const DIVISION_FEATURE_GROUPS = Object.freeze({
  SUB: [
    { key: "BATTLE", eyebrow: "BATTLE CONTROL", title: "경기 지휘", description: "신청부터 진행 중 경기와 복수전까지 한곳에서 관리합니다." },
    { key: "RECORD", eyebrow: "RANK RECORD", title: "순위 기록", description: "정산이 끝난 Arena 상태 변동과 내 위치를 확인합니다." },
    { key: "PROGRESS", eyebrow: "PAYBACK TRACK", title: "페이백 진행", description: "29일 학습과 페이백 점수 조건을 분리해 확인합니다." },
  ],
  MAIN: [
    { key: "BATTLE", eyebrow: "BATTLE CONTROL", title: "경기 지휘", description: "상향 쟁탈전·하위 티어 초대전·복수전·진행 경기를 관리합니다." },
    { key: "OPERATIONS", eyebrow: "ARENA OPERATIONS", title: "운영 현황", description: "현재 상태와 초대 예약, 학습일수 장부를 확인합니다." },
    { key: "RECORD", eyebrow: "MATCH INTELLIGENCE", title: "경기·순위 기록", description: "정산 결과와 Arena 상태 변동을 다시 확인합니다." },
    { key: "SUPPORT", eyebrow: "TACTICAL SUPPORT", title: "상점·이용 안내", description: "경기 분석과 일정 보호, 이용 종료 절차를 확인합니다." },
  ],
});

function arenaUserView(user, activeCosmetics = []) {
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
    hasMainProfileBorder: activeCosmetics.some(
      (effect) => effect.itemCode === "MAIN_PROFILE_BORDER"
    ),
    hasStyleEntrance: activeCosmetics.some(
      (effect) => effect.itemCode === "STYLE_ENTRANCE"
    ),
  };
}

async function getArenaNavigationContext(userId) {
  const now = new Date();
  const [user, activeCosmetics, rankUpPresentation, arenaNotifications] =
    await Promise.all([
      User.findById(userId).lean(),
      MainShopEffect.find({
        userId,
        itemCode: { $in: ["MAIN_PROFILE_BORDER", "STYLE_ENTRANCE"] },
        status: "ACTIVE",
        endsAt: { $gt: now },
      }).lean(),
      getPendingRankUpPresentation({ userId }),
      getArenaNotificationSummary({ userId }),
    ]);
  if (!user) {
    const error = new Error("사용자 정보를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return {
    user,
    arenaUser: arenaUserView(user, activeCosmetics),
    rankUpPresentation,
    arenaNotifications,
  };
}

async function getArenaContext(
  userId,
  { includeFullRanking = false } = {}
) {
  const [
    user,
    placement,
    fullRanking,
    accessState,
    activeMainPolicy,
    activeArenaPolicy,
    activeCosmetics,
    rankUpPresentation,
    arenaNotifications,
    pendingRevengeRight,
  ] = await Promise.all([
    User.findById(
      userId
    ).lean(),
    getPlacementDashboardData(
      userId
    ),
    includeFullRanking
      ? getRankingData(userId)
      : Promise.resolve(null),
    ArenaAccessState.findOne({
      userId,
    }).lean(),
    getActiveMainDivisionPolicy(),
    getActiveArenaPolicy(),
    MainShopEffect.find({
      userId,
      itemCode: { $in: ["MAIN_PROFILE_BORDER", "STYLE_ENTRANCE"] },
      status: "ACTIVE",
      endsAt: { $gt: new Date() },
    }).lean(),
    getPendingRankUpPresentation({ userId }),
    getArenaNotificationSummary({ userId }),
    ArenaRevengeRight.findOne({
      eligibleUserId: userId,
      status: "AVAILABLE",
    }).sort({ createdAt: -1 }).lean(),
  ]);

  if (!user) {
    const error =
      new Error(
        "사용자 정보를 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

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

  const lightweightCurrent = standing
    ? {
        userId: String(userId),
        gp: Number(standing.arenaGp || 0),
        arenaDivision: standing.division,
        arenaRank: standing.arenaRank,
        arenaPosition: Number(standing.arenaPosition || 0),
        tierRank: Number(standing.arenaPosition || 0) || null,
      }
    : null;
  const lightweightPoolEntry = standing
    ? {
        userId: String(userId),
        tier: standing.arenaRank,
        tierRank: Number(standing.arenaPosition || 0) || null,
        gp: Number(standing.arenaGp || 0),
      }
    : null;
  const ranking = fullRanking || {
    current: lightweightCurrent,
    pools: {
      sub: {
        current: standing?.division === "SUB" ? lightweightPoolEntry : null,
      },
      main: {
        current: standing?.division === "MAIN" ? lightweightPoolEntry : null,
      },
    },
  };
  const currentRanking = ranking.current || lightweightCurrent;

  return {
    user,
    ranking,
    arenaUser: arenaUserView(user, activeCosmetics),
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
    activeArenaPolicy:
      policySnapshot(activeArenaPolicy),
    rankUpPresentation,
    arenaNotifications,
    pendingRevengeRight: pendingRevengeRight
      ? {
          id: String(pendingRevengeRight._id),
          division: pendingRevengeRight.division,
          stakeDays: Number(pendingRevengeRight.revengeStakeDays || 0),
          feeDays: Number(pendingRevengeRight.feeDays || 0),
        }
      : null,
    pendingRevengeRequestId: randomUUID(),
  };
}

function renderArenaPage(
  view,
  extra = {},
  { includeFullRanking = false } = {}
) {
  return async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        await getArenaContext(
          req.session.user.id,
          { includeFullRanking }
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
      arenaUpperTierGuide:
        ARENA_UPPER_TIER_GUIDE,
      arenaMatchRules:
        ARENA_MATCH_RULES,
    }
  );

exports.rankingsPage =
  renderArenaPage(
    "goat-arena-rankings",
    {
      activeArenaPage:
        "rankings",
    },
    { includeFullRanking: true }
  );

function divisionPage(
  division
) {
  const isSub =
    division === "SUB";

  const features = DIVISION_FEATURES[
    division
  ].map((feature) => ({
    ...feature,
    href:
      feature.href ||
      `/goat-arena/${division.toLowerCase()}/features/${feature.key}`,
  }));
  const featureGroups = DIVISION_FEATURE_GROUPS[division].map((group) => ({
    ...group,
    features: features.filter((feature) => feature.group === group.key),
  }));

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
          ? "Unranked"
          : "Ranked",
      divisionKoreanLabel:
        isSub
          ? "Unranked 전장"
          : "Ranked 전장",
      features,
      featureGroups,
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
    formatMatchmakingRestriction: (value) => {
      if (!value) return "제한 해제 시각을 확인 중입니다.";
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value));
    },
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

function rankingBucket(position) {
  const value = Number(position || 0);
  if (!Number.isFinite(value) || value <= 0) return "UNKNOWN";
  if (value <= 20) return "1~20위";
  if (value <= 50) return "21~50위";
  return "51위 이하";
}

async function recordMatchRequest({ req, division, result, error = null }) {
  const match = result?.match || null;
  const before = match?.challenger?.tupleBefore || {};
  await recordOperationalMetricEvent({
    eventKey: `match-request:${division}:${req.session.user.id}:${String(req.body.requestId || "missing")}`,
    eventType: "MATCH_REQUEST",
    userId: req.session.user.id,
    result: error ? "FAILED" : "SUCCEEDED",
    division,
    sourceTier: before.arenaRank || "",
    targetTier: req.body.targetTier || match?.targetTier || "",
    rankBucket: rankingBucket(before.arenaPosition),
    reasonCode: error?.code || "",
    metadata: {
      matchId: String(match?._id || result?.matchId || ""),
      requestKind: "UPWARD_CHALLENGE",
    },
  });
}

async function mainBattleAction(req, res, next, action, { trackUpwardRequest = false } = {}) {
  try {
    const result = await action();
    if (trackUpwardRequest) {
      await recordMatchRequest({ req, division: "MAIN", result });
    }
    if (result?.match?._id || result?.matchId) {
      return res.redirect(
        `/goat-arena/matches/${result.match?._id || result.matchId}`
      );
    }
    return res.redirect("/goat-arena/main/battle?done=1");
  } catch (error) {
    if (trackUpwardRequest) {
      await recordMatchRequest({ req, division: "MAIN", error });
    }
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
    }),
    { trackUpwardRequest: true }
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
    if ([403, 423].includes(Number(error.status))) {
      try {
        const context = await getArenaContext(req.session.user.id);
        return res.status(Number(error.status)).render("goat-arena-error", {
          ...context,
          activeArenaPage: "shop",
          errorStatus: Number(error.status),
          errorTitle: "상점을 이용할 수 없습니다",
          errorMessage: error.message,
          errorCode: error.code || `HTTP_${Number(error.status)}`,
          errorFaqHref: errorFaqHref(Number(error.status)),
          returnHref: "/goat-arena",
          returnLabel: "GOAT Arena 홈으로",
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.purchaseMainShopItem = async (req, res, next) => {
  try {
    if (req.body.purchaseConfirmed !== "1") {
      const confirmationError = new Error(
        "가격·효과·사용 기간·반환 조건을 확인한 뒤 구매 동의에 체크해주세요."
      );
      confirmationError.status = 400;
      throw confirmationError;
    }
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

exports.mainShopAnalysisResultPage = async (req, res, next) => {
  try {
    const [context, analysis] = await Promise.all([
      getArenaContext(req.session.user.id),
      getMainShopAnalysisResult({
        userId: req.session.user.id,
        effectId: req.params.effectId,
      }),
    ]);
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-main-shop-analysis", {
      ...context,
      activeArenaPage: "shop",
      analysis,
    });
  } catch (error) {
    return next(error);
  }
};

function rulesPage(division) {
  return async (req, res, next) => {
    try {
      const [context, paybackPolicy, mainPolicy, upcomingPaybackPolicy, upcomingMainPolicy] = await Promise.all([
        getArenaContext(req.session.user.id),
        division === "SUB" ? getActiveArenaPolicy() : null,
        division === "MAIN"
          ? getActiveMainDivisionPolicy(new Date(), { bypassCache: true })
          : null,
        division === "SUB" ? getUpcomingArenaPolicy() : null,
        division === "MAIN" ? getUpcomingMainDivisionPolicy() : null,
      ]);
      res.set("Cache-Control", "no-store");
      return res.render("goat-arena-rules", {
        ...context,
        activeArenaPage: "rules",
        rulebook: getArenaRulebook(division, {
          paybackPolicy,
          mainPolicy,
          upcomingPaybackPolicy,
          upcomingMainPolicy,
        }),
      });
    } catch (error) {
      return next(error);
    }
  };
}

exports.subRulesPage = rulesPage("SUB");
exports.mainRulesPage = rulesPage("MAIN");

const FEATURE_MATCH_ACTIVE_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
];

function featureMatchFilter(userId, division, role = "ANY", statuses = FEATURE_MATCH_ACTIVE_STATUSES) {
  const participant =
    role === "DEFENDER"
      ? { "defender.userId": userId }
      : role === "CHALLENGER"
        ? { "challenger.userId": userId }
        : {
            $or: [
              { "challenger.userId": userId },
              { "defender.userId": userId },
            ],
          };
  return { division, status: { $in: statuses }, ...participant };
}

function matchFeatureItem(match, userId) {
  const isChallenger = String(match.challenger?.userId) === String(userId);
  const role = isChallenger ? "도전자" : "방어자";
  const stake = Number(match.economySnapshot?.challengerStakeDays || 0);
  return {
    title: `${match.matchType === "REVENGE" ? "복수전" : "일반 쟁탈전"} · ${role}`,
    status: match.status,
    description: `${match.tierPairLabel} · ${match.division === "SUB" ? `페이백 점수 ${stake || (match.matchType === "REVENGE" ? 2 : 1)}점` : `예치 학습일수 ${stake}일`}`,
    occurredAt: match.updatedAt || match.requestedAt || match.createdAt,
    href: FEATURE_MATCH_ACTIVE_STATUSES.includes(match.status)
      ? `/goat-arena/matches/${match._id}`
      : null,
    hrefLabel: "경기 확인",
  };
}

function ledgerChangeText(entry) {
  const parts = [
    [entry.availableLearningDaysDelta, "사용 가능 일"],
    [entry.paybackScoreDaysDelta, "페이백 점수"],
    [entry.lockedPaybackScoreDaysDelta, "예치 페이백 점수"],
    [entry.lockedLearningDaysDelta, "예치 학습일"],
    [entry.reservedLearningDaysDelta, "예약 학습일"],
  ]
    .filter(([value]) => Number(value || 0) !== 0)
    .map(([value, label]) => `${label} ${Number(value) > 0 ? "+" : ""}${Number(value)}`);
  return parts.join(" · ") || "잔액 변동 없음";
}

async function getDivisionFeatureData({ userId, division, featureKey, context }) {
  const base = {
    eyebrow: "LIVE DATA",
    title: "현재 데이터",
    description: "",
    cards: [],
    items: [],
    emptyMessage: "현재 표시할 기록이 없습니다.",
    action: null,
  };
  if (["subActiveMatch", "mainActiveMatch"].includes(featureKey)) {
    const matches = await ArenaMatch.find(
      featureMatchFilter(userId, division)
    ).sort({ updatedAt: -1 }).limit(30).lean();
    return {
      ...base,
      title: "진행 중 경기",
      cards: [{ label: "진행·대기", value: `${matches.length}건` }],
      items: matches.map((match) => matchFeatureItem(match, userId)),
      emptyMessage: "현재 이어서 진행할 경기가 없습니다.",
      action: {
        href: division === "SUB" ? "/goat-arena/sub/challenge" : "/goat-arena/main/battle",
        label: "전장으로 이동",
      },
    };
  }
  if (["subRevengeMatch", "mainRevengeMatch"].includes(featureKey)) {
    const rights = await ArenaRevengeRight.find({
      eligibleUserId: userId,
      division,
      status: { $in: ["AVAILABLE", "CLAIMED"] },
    }).sort({ updatedAt: -1 }).limit(30).lean();
    return {
      ...base,
      title: "복수전 권리",
      cards: [
        { label: "신청 가능", value: `${rights.filter((right) => right.status === "AVAILABLE").length}건` },
        { label: "진행 중", value: `${rights.filter((right) => right.status === "CLAIMED").length}건` },
      ],
      items: rights.map((right) => ({
        title: right.status === "AVAILABLE" ? "복수전 신청 가능" : "복수전 진행 중",
        status: right.status,
        description: `${division === "SUB" ? "예치 페이백 점수" : "예치 학습일수"} ${right.revengeStakeDays}${division === "SUB" ? "점" : "일"} · 수수료 ${right.feeDays}${division === "SUB" ? "점" : "일"}`,
        occurredAt: right.updatedAt || right.createdAt,
        href: division === "SUB" ? "/goat-arena/sub/challenge" : "/goat-arena/main/battle",
        hrefLabel: "복수전 확인",
      })),
      emptyMessage: "현재 사용할 수 있는 복수전 권리가 없습니다.",
    };
  }
  if (["subRankHistory", "mainRankHistory"].includes(featureKey)) {
    const changes = await ArenaStandingChangeLedger.find({ userId })
      .sort({ occurredAt: -1 }).limit(50).lean();
    return {
      ...base,
      title: "순위 변동 기록",
      cards: [{ label: "최근 기록", value: `${changes.length}건` }],
      items: changes.map((change) => ({
        title: change.changeType === "TUPLE_SWAP" ? "Arena 상태 교환" : "Arena 상태 유지",
        status: change.changeType,
        description: `${change.tupleBefore.arenaRank} ${change.tupleBefore.arenaPosition}위 · ${change.tupleBefore.arenaGp} GP → ${change.tupleAfter.arenaRank} ${change.tupleAfter.arenaPosition}위 · ${change.tupleAfter.arenaGp} GP`,
        occurredAt: change.occurredAt,
      })),
      emptyMessage: "아직 정산된 순위 변동 기록이 없습니다.",
      action: { href: "/goat-arena/rankings", label: "현재 순위 보기" },
    };
  }
  if (featureKey === "subPaybackProgress") {
    const cycleId = context.arenaAccess?.accessCycleId;
    const review = cycleId
      ? await ArenaPaybackReview.findOne({ cycleId }).sort({ createdAt: -1 }).lean()
      : null;
    const rights = context.arenaAccess.learningRights;
    return {
      ...base,
      title: "페이백 진행",
      description: "정기권 학습 가능 일수와 페이백 점수는 서로 다른 값입니다.",
      cards: [
        { label: "연속 학습", value: `${rights.studyStreakDays || 0} / ${rights.minimumStudyStreakDays || 29}일` },
        { label: "페이백 점수", value: `${rights.paybackScoreDays ?? 0}점` },
        { label: "남은 이용일", value: `${rights.availableDays ?? 0}일` },
        { label: "최근 심사", value: review?.status || "심사 전" },
      ],
      emptyMessage: "29일 이용 주기 종료 뒤 페이백 심사 결과가 표시됩니다.",
      action: { href: "/goat-arena/rules/sub", label: "페이백 규정 확인" },
    };
  }
  if (featureKey === "mainLearningDayLedger") {
    const entries = await ArenaLearningDayLedger.find({ userId })
      .sort({ occurredAt: -1 }).limit(50).lean();
    const rights = context.arenaAccess.learningRights;
    return {
      ...base,
      title: "학습일수 장부",
      cards: [
        { label: "사용 가능", value: `${rights.availableDays ?? 0}일` },
        { label: "초대 예약", value: `${rights.reservedDays ?? 0}일` },
        { label: "경기 예치", value: `${rights.lockedDays ?? 0}일` },
      ],
      items: entries.map((entry) => ({
        title: entry.eventType,
        status: entry.sourceBucket || "UNSPECIFIED",
        description: ledgerChangeText(entry),
        occurredAt: entry.occurredAt,
      })),
      emptyMessage: "아직 학습일수 변동 기록이 없습니다.",
    };
  }
  if (featureKey === "mainMatchReview") {
    const matches = await ArenaMatch.find(
      featureMatchFilter(userId, "MAIN", "ANY", ["SETTLED", "CANCELLED", "INVALID", "INSURED_CANCELLED"])
    ).sort({ settledAt: -1, updatedAt: -1 }).limit(50).lean();
    return {
      ...base,
      title: "확정 경기 기록",
      cards: [{ label: "최근 기록", value: `${matches.length}건` }],
      items: matches.map((match) => matchFeatureItem(match, userId)),
      emptyMessage: "아직 확정된 Ranked 경기 기록이 없습니다.",
    };
  }
  if (featureKey === "mainArenaStatus") {
    const rights = context.arenaAccess.learningRights;
    return {
      ...base,
      title: "Ranked 운영 상태",
      cards: [
        { label: "사용 가능", value: rights.unlimited ? "무제한" : `${rights.availableDays ?? 0}일` },
        { label: "초대 예약", value: `${rights.reservedDays ?? 0}일` },
        { label: "경기 예치", value: `${rights.lockedDays ?? 0}일` },
        { label: "Arena 상태", value: context.arenaAccess.standing ? `${context.arenaAccess.standing.tier} ${context.arenaAccess.standing.arenaPosition}위` : "미확정" },
      ],
      action: { href: "/goat-arena/main/battle", label: "Ranked 전장 열기" },
    };
  }
  if (featureKey === "mainExpiryGuide") {
    const rights = context.arenaAccess.learningRights;
    return {
      ...base,
      title: "이용 종료·재구매 안내",
      cards: [
        { label: "현재 사용 가능", value: `${rights.availableDays ?? 0}일` },
        { label: "전체 Ranked 권리", value: rights.unlimited ? "무제한" : `${rights.totalMainDays ?? 0}일` },
        { label: "종료 예정", value: rights.expiresAt ? new Date(rights.expiresAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "미정" },
      ],
      emptyMessage: "종료 시점의 Ranked 순위를 기준으로 Unranked 복귀 상태가 계산됩니다.",
      action: { href: "/goat-arena/rules/main#main-expiry", label: "종료 규정 확인" },
    };
  }
  return base;
}

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
    const featureData = hasDivisionAccess
      ? await getDivisionFeatureData({
          userId: req.session.user.id,
          division,
          featureKey: feature.key,
          context,
        })
      : null;
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-feature", {
      ...context,
      activeArenaPage:
        division === "SUB" ? "sub" : "main",
      division,
      divisionLabel:
        division === "SUB"
          ? "Unranked"
          : "Ranked",
      feature,
      hasDivisionAccess,
      featureData,
    });
  } catch (error) {
    return next(error);
  }
};

exports.profilePage = async (req, res, next) => {
  try {
    const [context, paybackAccount, payoutEligible] = await Promise.all([
      getArenaContext(req.session.user.id),
      getPaybackAccountSummary(req.session.user.id),
      AccessCycle.exists({
        userId: req.session.user.id,
        paybackPayoutStatus: "PENDING",
        paybackAmount: { $gt: 0 },
      }),
    ]);
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-profile", {
      ...context,
      activeArenaPage: "profile",
      paybackAccount,
      payoutEligible: Boolean(payoutEligible),
      accountUpdated: req.query.accountUpdated === "1",
      accountError: "",
    });
  } catch (error) {
    return next(error);
  }
};

exports.reviewPaybackAccount = async (req, res, next) => {
  try {
    const [context, account] = await Promise.all([
      getArenaContext(req.session.user.id),
      Promise.resolve(validatePaybackAccountInput(req.body)),
    ]);
    res.set("Cache-Control", "no-store");
    return res.render("goat-arena-payback-account-confirm", {
      ...context,
      activeArenaPage: "profile",
      account,
      error: "",
    });
  } catch (error) {
    if (Number(error.status) === 400) {
      try {
        const [context, paybackAccount, payoutEligible] = await Promise.all([
          getArenaContext(req.session.user.id),
          getPaybackAccountSummary(req.session.user.id),
          AccessCycle.exists({
            userId: req.session.user.id,
            paybackPayoutStatus: "PENDING",
            paybackAmount: { $gt: 0 },
          }),
        ]);
        return res.status(400).render("goat-arena-profile", {
          ...context,
          activeArenaPage: "profile",
          paybackAccount,
          payoutEligible: Boolean(payoutEligible),
          accountUpdated: false,
          accountError: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

exports.confirmPaybackAccount = async (req, res, next) => {
  try {
    if (req.body.accountConfirmed !== "1") {
      const error = new Error("계좌번호와 예금주를 확인했다는 항목에 체크해주세요.");
      error.status = 400;
      throw error;
    }
    await saveConfirmedPaybackAccount(req.session.user.id, req.body);
    return res.redirect("/goat-arena/profile?accountUpdated=1#payback-account");
  } catch (error) {
    if (Number(error.status) === 400) {
      try {
        const context = await getArenaContext(req.session.user.id);
        return res.status(400).render("goat-arena-payback-account-confirm", {
          ...context,
          activeArenaPage: "profile",
          account: validatePaybackAccountInput(req.body),
          error: error.message,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
};

async function renderSubChallengePage(
  req,
  res,
  {
    status = 200,
    matchError = "",
  } = {}
) {
  const [context, challengeData] = await Promise.all([
    getArenaNavigationContext(req.session.user.id),
    getSubChallengeData({
      userId:
        req.session.user.id,
    }),
  ]);
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
      formatMatchmakingRestriction: (until) => until
        ? new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(new Date(until))
        : "제한 해제 시각 확인 중",
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
    const result = await createSubNormalChallenge({
      challengerUserId:
        req.session.user.id,
      requestId: req.body.requestId,
    });
    await recordMatchRequest({ req, division: "SUB", result });
    return res.redirect(
      "/goat-arena/sub/challenge?created=1"
    );
  } catch (error) {
    await recordMatchRequest({ req, division: "SUB", error });
    if (
      [400, 403, 404, 409, 423].includes(
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
    [400, 403, 404, 409, 410, 413, 423].includes(
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
    const result = await advanceArenaMatchQuestion({
      matchId: req.params.matchId,
      userId: req.session.user.id,
      requestId: req.body.requestId,
      value: req.body.value,
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

async function renderArenaSupplementalEvidencePage(
  req,
  res,
  { status = 200, uploadError = "" } = {}
) {
  const [context, requestData] = await Promise.all([
    getArenaContext(req.session.user.id),
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

exports.acknowledgeRankUpPresentation = async (
  req,
  res,
  next
) => {
  try {
    const result = await acknowledgeRankUpPresentation({
      presentationId: req.params.presentationId,
      userId: req.session.user.id,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
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
