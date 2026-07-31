const {
  User,
} = require("../models/matthsModel");
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
  const canInteract =
    user?.accountStatus ===
      "active" &&
    persistedAccessStatus ===
      "PAID_ACTIVE" &&
    Number(
      accessCycle?.availableLearningDays ||
        0
    ) > 0 &&
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
      key:
        "mainActiveMatch",
      name: "진행 중 경기",
      description:
        "준비·진행·제출 상태의 경기를 이어서 확인합니다.",
    },
    {
      key: "mainSeasonPlacement",
      name: "배치고사 상태",
      description:
        "현재 배치고사 완료 여부를 확인합니다.",
    },
    {
      key: "mainAchievementHistory",
      name: "Main Division 달성 기록",
      description:
        "Main Division 달성 배지와 과거 Division 기록을 확인합니다.",
    },
    {
      key: "mainLearningDays",
      name: "정기권 학습 가능 일수",
      description:
        "남은 학습 가능 일수·정산 대기 일수와 이용 종료 시점을 확인합니다.",
    },
    {
      key: "mainExpiryGuide",
      name: "이용 종료·재구매 안내",
      description:
        "Sub Division 강등, 72시간 변환과 랭크 탈환 배치고사 조건을 확인합니다.",
    },
    {
      key:
        "mainMatchReview",
      name: "경기 기록",
      description:
        "확정된 경기 결과를 확인합니다. Main Division 내부 경기 규칙은 정책 확정 후 연결됩니다.",
    },
    {
      key:
        "mainRankHistory",
      name: "순위 변동 기록",
      description:
        "정산된 티어·티어 내 순위·GP 변동 이력을 확인합니다.",
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
        ],
    }
  );
}

exports.subDivisionPage =
  divisionPage("SUB");

exports.mainDivisionPage =
  divisionPage("MAIN");

exports.profilePage =
  renderArenaPage(
    "goat-arena-profile",
    {
      activeArenaPage:
        "profile",
    }
  );

exports._testing = {
  buildArenaAccess,
  buildSeedState,
  ARENA_TIER_GUIDE,
  DIVISION_FEATURES,
};
