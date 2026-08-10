const mongoose = require("mongoose");
const {
  createHash,
  randomBytes,
} = require("node:crypto");
const {
  User,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaOpponentSelectionAudit,
  ArenaProblemPack,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  officialArenaEligibility,
} = require("./arenaEligibilityService");
const {
  dailyMatchLimitForTier,
  getActiveArenaPolicy,
} = require("./arenaPolicyService");
const {
  kstSeasonKey,
} = require("./arenaStandingService");
const {
  ARENA_ONE_ON_ONE_START_LIMIT_MS,
  SUB_TIER_PAIR_CONFIG,
  generateSubOneOnOneQuestionsFromActiveData,
  getSubTierPair,
  tierCode,
} = require("./arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const {
  normalizeMainCompetitivePool,
} = require("./mainCompetitivePoolService");
const {
  reactivateAutomaticDefenseAfterAttack,
} = require("./arenaAutomaticDefenseService");
const {
  assertMatchmakingOpen,
} = require("./arenaMatchmakingControlService");

const KST_TIME_ZONE = "Asia/Seoul";
const NORMAL_MATCH_PROBLEM_PACK_PENDING =
  "PENDING_ASSIGNMENT";
const NORMAL_MATCH_SCORING_PENDING =
  "PENDING_ASSIGNMENT";
const DEFAULT_CANDIDATE_LIMIT = 50;
const SERVER_SELECTION_CANDIDATE_LIMIT = 1000;
const TRANSACTION_RETRY_LIMIT = 3;
const UNSETTLED_MATCH_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
];

const MATCH_STATUS_LABELS = {
  REQUESTED: "상대 확인 중",
  MATCHED: "상대 배정 완료",
  READY: "문제 준비 완료",
  IN_PROGRESS: "경기 진행 중",
  SUBMITTED: "제출 완료",
  RESOLVED: "결과 확인 중",
  HELD: "운영 검토 중",
};

const ELIGIBILITY_MESSAGES = {
  ACCOUNT_NOT_ACTIVE:
    "활성 상태인 계정만 일반 쟁탈전에 참가할 수 있습니다.",
  ACCESS_NOT_PAID_ACTIVE:
    "현재 활성화된 GOAT Arena 이용 권한이 필요합니다.",
  LEARNING_DAYS_DEPLETED:
    "정기권 학습 가능 일수가 부족합니다.",
  SEASON_PLACEMENT_REQUIRED:
    "현재 시즌 배치를 먼저 완료해주세요.",
  SUNDAY_DIVISION_LOCK:
    "일요일 Division별 신규 경기 마감 이후에는 신청할 수 없으며 15시부터 월요일 0시까지 공식 경기가 잠깁니다.",
  DIVISION_NOT_ACTIVE:
    "현재 Unranked 참가 상태가 아닙니다.",
  ACCESS_CYCLE_NOT_ACTIVE:
    "활성 학습권 패키지 이용 주기를 확인해주세요.",
  STANDING_NOT_ACTIVE:
    "현재 시즌의 활성 Unranked 순위를 확인해주세요.",
  DEFENSE_POOL_NOT_ELIGIBLE:
    "현재 방어 후보로 참가할 수 없는 상태입니다.",
  MATCH_STAKE_UNAVAILABLE:
    "일반 쟁탈전에 예치할 페이백 점수가 부족합니다. 남은 이용 기간에는 학습·모의고사를 계속 이용하고 방어전에 참가할 수 있습니다.",
  OFFICIAL_MATCH_ALREADY_PENDING:
    "이미 정산되지 않은 공식 경기가 있습니다.",
  INTEGRITY_REVIEW_REQUIRED:
    "계정·경기 무결성 검토가 끝날 때까지 신규 경기 참가가 보류됩니다.",
  INTEGRITY_PENALTY_ACTIVE:
    "부정행위가 확인되어 GOAT Arena 매치메이킹이 제한되었습니다.",
  SUB_DAILY_ATTACK_LIMIT_REACHED:
    "현재 티어의 오늘 일반 공격 횟수를 모두 사용했습니다.",
  SUB_DAILY_DEFENSE_LIMIT_REACHED:
    "현재 티어의 오늘 일반 방어 횟수를 모두 사용했습니다.",
  SUB_DAILY_LOCK_AFTER_CHALLENGER_WIN:
    "오늘 일반 쟁탈전에서 도전자로 승리해 남은 일반 공격·방어가 잠겼습니다.",
};

const DAILY_COUNTED_MATCH_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
  "SETTLED",
];

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sameTestAccountCohort(left, right) {
  const leftIsTest = Boolean(left?.isTestAccount);
  const rightIsTest = Boolean(right?.isTestAccount);
  if (leftIsTest === rightIsTest) return true;

  // 실제 계정은 기본적으로 테스트 데이터와 완전히 분리한다. 단, 운영자가
  // 명시적으로 테스트 매치 권한을 켠 경우에만 테스트 계정과 1대1 검증을
  // 진행할 수 있다.
  return Boolean(left?.arenaTestMatchEnabled && rightIsTest) ||
    Boolean(right?.arenaTestMatchEnabled && leftIsTest);
}

function eligibilityMessage(reasons = []) {
  return (
    reasons
      .map(
        (reason) =>
          ELIGIBILITY_MESSAGES[reason]
      )
      .find(Boolean) ||
    "일반 쟁탈전 참가 조건을 확인해주세요."
  );
}

function kstClockParts(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw statusError(
      400,
      "경기 요청 시각을 확인해주세요.",
      "INVALID_MATCH_REQUEST_TIME"
    );
  }
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: KST_TIME_ZONE,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }
  ).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter(
        (part) =>
          part.type !== "literal"
      )
      .map((part) => [
        part.type,
        part.type === "weekday"
          ? part.value
          : Number(part.value),
      ])
  );
}

function kstDayWindow(value = new Date()) {
  const parts = kstClockParts(value);
  const start = new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      -9,
      0,
      0,
      0
    )
  );
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

function emptySubDailyUsage() {
  return {
    attackCount: 0,
    defenseCount: 0,
    challengerWin: false,
  };
}

async function loadSubDailyUsage({
  userIds = [],
  now = new Date(),
  session = null,
}) {
  const normalizedIds = [...new Set(userIds.map(String))]
    .filter((userId) => mongoose.isValidObjectId(userId));
  const usageByUser = new Map(
    normalizedIds.map((userId) => [userId, emptySubDailyUsage()])
  );
  if (!normalizedIds.length) return usageByUser;
  const { start, end } = kstDayWindow(now);
  const matches = await queryWithSession(
    ArenaMatch.find({
      division: "SUB",
      matchType: "NORMAL",
      requestedAt: { $gte: start, $lt: end },
      status: { $in: DAILY_COUNTED_MATCH_STATUSES },
      $or: [
        { "challenger.userId": { $in: normalizedIds } },
        { "defender.userId": { $in: normalizedIds } },
      ],
    }).select("challenger.userId defender.userId status winnerRole"),
    session
  ).lean();
  for (const match of matches) {
    const challengerId = String(match.challenger?.userId || "");
    const defenderId = String(match.defender?.userId || "");
    if (usageByUser.has(challengerId)) {
      const usage = usageByUser.get(challengerId);
      usage.attackCount += 1;
      if (match.status === "SETTLED" && match.winnerRole === "CHALLENGER") {
        usage.challengerWin = true;
      }
    }
    if (usageByUser.has(defenderId)) {
      usageByUser.get(defenderId).defenseCount += 1;
    }
  }
  return usageByUser;
}

function subDailyLimitState({ policy = null, cycle, standing, usage }) {
  const limits = dailyMatchLimitForTier(
    policy || cycle?.policySnapshot,
    tierCode(standing?.arenaRank)
  );
  const normalizedUsage = usage || emptySubDailyUsage();
  return {
    ...normalizedUsage,
    attackLimit: Number(limits.attackLimit),
    defenseLimit: Number(limits.defenseLimit),
    attackRemaining: Math.max(
      0,
      Number(limits.attackLimit) - normalizedUsage.attackCount
    ),
    defenseRemaining: Math.max(
      0,
      Number(limits.defenseLimit) - normalizedUsage.defenseCount
    ),
  };
}

function subDailyEligibilityReasons({ daily, role }) {
  if (daily.challengerWin) {
    return ["SUB_DAILY_LOCK_AFTER_CHALLENGER_WIN"];
  }
  if (role === "DEFENDER" && daily.defenseCount >= daily.defenseLimit) {
    return ["SUB_DAILY_DEFENSE_LIMIT_REACHED"];
  }
  if (role === "CHALLENGER" && daily.attackCount >= daily.attackLimit) {
    return ["SUB_DAILY_ATTACK_LIMIT_REACHED"];
  }
  return [];
}

function isSundayDivisionLocked(
  value = new Date()
) {
  const parts = kstClockParts(value);
  return (
    parts.weekday === "Sun" &&
    Number(parts.hour) >= 15
  );
}

function isSundayMatchRequestLocked(
  value = new Date(),
  _division = "SUB"
) {
  const parts = kstClockParts(value);
  // 문항당 최대 10분 × 5문항과 일요일 15시 전체 잠금 사이에
  // 진행 중 경기를 모두 마칠 수 있도록, 신규 경기 요청·시작은 14:00부터 막는다.
  const cutoffMinutes = 14 * 60;
  const currentMinutes =
    Number(parts.hour) * 60 + Number(parts.minute);
  return (
    parts.weekday === "Sun" &&
    currentMinutes >= cutoffMinutes
  );
}

function nextSundayMatchCutoff(
  value = new Date(),
  _division = "SUB"
) {
  const now = new Date(value);
  for (let offset = 0; offset <= 7; offset += 1) {
    const probe = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = kstClockParts(probe);
    if (parts.weekday !== "Sun") continue;
    const cutoff = new Date(
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        5,
        0,
        0,
        0
      )
    );
    if (cutoff > now) return cutoff;
  }
  return null;
}

function subMatchStartDeadline(value = new Date()) {
  const now = new Date(value);
  const regularDeadline = new Date(
    now.getTime() + ARENA_ONE_ON_ONE_START_LIMIT_MS
  );
  const sundayCutoff = nextSundayMatchCutoff(now, "SUB");
  return sundayCutoff && sundayCutoff < regularDeadline
    ? sundayCutoff
    : regularDeadline;
}

function normalizeRequestId(value) {
  const requestId = String(value || "").trim();
  if (
    requestId.length < 16 ||
    requestId.length > 160 ||
    !/^[A-Za-z0-9._:-]+$/.test(requestId)
  ) {
    throw statusError(
      400,
      "일반 쟁탈전 요청 식별자를 확인해주세요.",
      "INVALID_CHALLENGE_REQUEST_ID"
    );
  }
  return requestId;
}

function normalStakeDaysFromCycle(_cycle) {
  // Unranked 일반 쟁탈전의 페이백 점수 예치는 정책 버전과 무관하게 1점 고정이다.
  return 1;
}

function matchKeyForRequest({
  challengerUserId,
  requestId,
}) {
  const digest = createHash("sha256")
    .update(
      `${challengerUserId}:${requestId}`,
      "utf8"
    )
    .digest("hex");
  return `SUB:NORMAL:${challengerUserId}:${digest}`;
}

function arenaTupleFromStanding(standing) {
  return {
    arenaRank: standing.arenaRank,
    arenaPosition: Number(
      standing.arenaPosition
    ),
    arenaGp: Number(standing.arenaGp),
  };
}

function defenseCandidateAlias({
  userId,
  seasonKey = "SUB",
}) {
  const token = createHash("sha256")
    .update(
      `${seasonKey}:${userId}`,
      "utf8"
    )
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();
  return `방어자 ${token}`;
}

function queryWithSession(query, session) {
  return session
    ? query.session(session)
    : query;
}

async function loadMatchActorContext({
  userId,
  division = "SUB",
  now = new Date(),
  session = null,
  requiredAvailableDays = 1,
  requireDefensePool = false,
}) {
  let user;
  let accessState;
  if (session) {
    user = await queryWithSession(
      User.findById(userId).select(
        "accountStatus isActive schoolGrade"
      ),
      session
    ).lean();
    accessState = await queryWithSession(
      ArenaAccessState.findOne({
        userId,
      }),
      session
    ).lean();
  } else {
    [user, accessState] =
      await Promise.all([
        User.findById(userId)
          .select(
            "accountStatus isActive schoolGrade"
          )
          .lean(),
        ArenaAccessState.findOne({
          userId,
        }).lean(),
      ]);
  }
  const restrictionExpired = Boolean(
    accessState?.integrityStatus === "RESTRICTED" &&
    accessState?.reasonCode === "INTEGRITY_PENALTY_5_DAYS" &&
    accessState?.matchmakingRestrictedUntil &&
    new Date(accessState.matchmakingRestrictedUntil).getTime() <=
      new Date(now).getTime()
  );
  if (restrictionExpired) {
    const defensePoolEligible = Boolean(
      accessState.state === "PAID_ACTIVE" &&
      accessState.currentSeasonPlacementCompleted
    );
    await queryWithSession(
      ArenaAccessState.updateOne(
        {
          _id: accessState._id,
          integrityStatus: "RESTRICTED",
          reasonCode: "INTEGRITY_PENALTY_5_DAYS",
          matchmakingRestrictedUntil: { $lte: new Date(now) },
        },
        {
          $set: {
            integrityStatus: "CLEAR",
            integrityCaseId: null,
            defensePoolEligible,
            matchmakingRestrictedUntil: null,
            integrityPenaltyReason: "",
            reasonCode: "INTEGRITY_PENALTY_COMPLETED",
          },
        }
      ),
      session
    );
    accessState.integrityStatus = "CLEAR";
    accessState.integrityCaseId = null;
    accessState.defensePoolEligible = defensePoolEligible;
    accessState.matchmakingRestrictedUntil = null;
    accessState.integrityPenaltyReason = "";
    accessState.reasonCode = "INTEGRITY_PENALTY_COMPLETED";
  }
  let accessCycle = null;
  let standing = null;
  if (session) {
    if (accessState?.accessCycleId) {
      accessCycle = await queryWithSession(
        AccessCycle.findById(accessState.accessCycleId),
        session
      ).lean();
    }
    if (accessState?.standingId) {
      standing = await queryWithSession(
        ArenaStanding.findById(accessState.standingId),
        session
      ).lean();
    }
  } else {
    [accessCycle, standing] = await Promise.all([
      accessState?.accessCycleId
        ? AccessCycle.findById(accessState.accessCycleId).lean()
        : null,
      accessState?.standingId
        ? ArenaStanding.findById(accessState.standingId).lean()
        : null,
    ]);
  }
  if (division === "MAIN" && standing) {
    /*
     * 과거 문서의 호환 필드는 ALL로 정규화한다. 현재 티어 순위 고유 인덱스는
     * 경쟁 풀 필드를 포함하지 않으므로 Ranked 전체가 하나의 순위표를 사용한다.
     */
    const competitivePool = normalizeMainCompetitivePool();
    standing.competitivePool = competitivePool;
    if (accessState) accessState.mainCompetitivePool = competitivePool;
  }
  const reasons = officialArenaEligibility({
    accountStatus:
      user?.accountStatus === "active" &&
      user?.isActive !== false
        ? "active"
        : "inactive",
    accessState: accessState?.state,
    availableLearningDays:
      accessCycle?.availableLearningDays,
    currentSeasonPlacementCompleted:
      accessState
        ?.currentSeasonPlacementCompleted,
    sundayDivisionLock:
      isSundayMatchRequestLocked(now, division),
  }).reasons;

  if (
    accessState
      ?.currentCompetitiveDivision !==
    division
  ) {
    reasons.push("DIVISION_NOT_ACTIVE");
  }
  if (
    accessState?.integrityStatus &&
    accessState.integrityStatus !== "CLEAR"
  ) {
    reasons.push(
      accessState.integrityStatus === "RESTRICTED" &&
      accessState.reasonCode === "INTEGRITY_PENALTY_5_DAYS"
        ? "INTEGRITY_PENALTY_ACTIVE"
        : "INTEGRITY_REVIEW_REQUIRED"
    );
  }
  if (
    !accessCycle ||
    accessCycle.status !== "ACTIVE" ||
    accessCycle.division !== division ||
    String(accessCycle.userId) !==
      String(userId)
  ) {
    reasons.push("ACCESS_CYCLE_NOT_ACTIVE");
  }
  if (
    !standing ||
    standing.status !== "ACTIVE" ||
    standing.division !== division ||
    standing.seasonKey !==
      kstSeasonKey(now) ||
    String(standing.userId) !==
      String(userId)
  ) {
    reasons.push("STANDING_NOT_ACTIVE");
  }
  if (
    requireDefensePool &&
    accessState?.defensePoolEligible !==
      true
  ) {
    reasons.push(
      "DEFENSE_POOL_NOT_ELIGIBLE"
    );
  }
  // Unranked는 페이백 점수, Ranked는 사용 가능 학습일수를 예치한다.
  // 공통 actor context에서 Division별 예치 자산을 섞어 확인하면 Ranked
  // 사용자가 남아 있지 않은 페이백 점수 때문에 잘못 막힐 수 있다.
  const stakeBalance = division === "MAIN"
    ? Number(accessCycle?.availableLearningDays || 0)
    : Number(accessCycle?.paybackScoreDays || 0);
  if (
    !requireDefensePool &&
    stakeBalance < Number(requiredAvailableDays)
  ) {
    reasons.push("MATCH_STAKE_UNAVAILABLE");
  }
  if (
    Number(
      accessCycle?.lockedLearningDays || 0
    ) > 0
    || Number(accessCycle?.lockedPaybackScoreDays || 0) > 0
  ) {
    reasons.push(
      "OFFICIAL_MATCH_ALREADY_PENDING"
    );
  }

  return {
    user,
    accessState,
    accessCycle,
    standing,
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    matchmakingRestrictedUntil:
      accessState?.integrityStatus === "RESTRICTED" &&
      accessState?.reasonCode === "INTEGRITY_PENALTY_5_DAYS"
        ? accessState.matchmakingRestrictedUntil || null
        : null,
  };
}

async function findActiveMatchForUser({
  userId,
  session = null,
}) {
  const lock = await queryWithSession(
    ArenaMatchParticipantLock.findOne({
      userId,
    }),
    session
  ).lean();
  let match = lock
    ? await queryWithSession(
        ArenaMatch.findById(lock.matchId),
        session
      ).lean()
    : null;
  if (
    !match ||
    !UNSETTLED_MATCH_STATUSES.includes(
      match.status
    )
  ) {
    match = await queryWithSession(
      ArenaMatch.findOne({
        status: {
          $in: UNSETTLED_MATCH_STATUSES,
        },
        $or: [
          { "challenger.userId": userId },
          { "defender.userId": userId },
        ],
      }).sort({ requestedAt: -1 }),
      session
    ).lean();
  }
  if (!match) return null;

  const isChallenger =
    String(match.challenger.userId) ===
    String(userId);
  const opponentId = isChallenger
    ? match.defender.userId
    : match.challenger.userId;
  const opponent = await queryWithSession(
    User.findById(opponentId).select("name username"),
    session
  ).lean();
  return {
    id: String(match._id),
    status: match.status,
    statusLabel:
      MATCH_STATUS_LABELS[match.status] ||
      "경기 처리 중",
    role: isChallenger
      ? "공격자"
      : "방어자",
    opponentName:
      String(
        opponent?.name ||
          opponent?.username ||
          "닉네임 확인 중"
      ),
    requestedAt: match.requestedAt,
    stakeDays: isChallenger
      ? Number(match.challenger.stakeDays)
      : Number(match.defender.stakeDays),
    href: `/goat-arena/matches/${match._id}`,
  };
}

function participantUserIds(matches = []) {
  return matches.flatMap((match) => [
    match.challenger?.userId,
    match.defender?.userId,
  ]);
}

function buildEligibleDefenseCandidates({
  standings = [],
  accessStates = [],
  users = [],
  cycles = [],
  busyUserIds = [],
  challengerArenaRank = "",
  dailyUsageByUser = new Map(),
  dailyPolicy = null,
  limit = DEFAULT_CANDIDATE_LIMIT,
}) {
  const safeLimit = Math.max(
    1,
    Math.min(1000, Number(limit) || 0)
  );
  const userById = new Map(
    users.map((user) => [
      String(user._id),
      user,
    ])
  );
  const cycleById = new Map(
    cycles.map((cycle) => [
      String(cycle._id),
      cycle,
    ])
  );
  const stateByStandingId = new Map(
    accessStates.map((state) => [
      String(state.standingId),
      state,
    ])
  );
  const busy = new Set(
    [...busyUserIds].map(String)
  );
  const eligible = standings
    .map((standing) => {
      const state =
        stateByStandingId.get(
          String(standing._id)
        );
      const user = userById.get(
        String(standing.userId)
      );
      const cycle = state
        ? cycleById.get(
            String(state.accessCycleId)
          )
        : null;
      if (
        !state ||
        !user ||
        !cycle ||
        String(state.userId) !==
          String(standing.userId) ||
        String(cycle.userId) !==
          String(standing.userId) ||
        busy.has(String(standing.userId))
      ) {
        return null;
      }
      const tierPair = challengerArenaRank
        ? getSubTierPair(challengerArenaRank, standing.arenaRank)
        : null;
      if (challengerArenaRank && !tierPair) {
        return null;
      }
      const daily = subDailyLimitState({
        policy: dailyPolicy,
        cycle,
        standing,
        usage: dailyUsageByUser.get(String(standing.userId)),
      });
      if (subDailyEligibilityReasons({ daily, role: "DEFENDER" }).length) {
        return null;
      }
      return {
        userId: String(standing.userId),
        standingId: String(
          standing._id
        ),
        displayName:
          defenseCandidateAlias({
            userId: standing.userId,
            seasonKey:
              standing.seasonKey,
          }),
        arenaRank: standing.arenaRank,
        arenaPosition: Number(
          standing.arenaPosition
        ),
        arenaGp: Number(
          standing.arenaGp
        ),
        tierPairKey: tierPair?.key || "",
        tierPairLabel: tierPair?.label || "",
        dailyDefenseCount: daily.defenseCount,
        dailyDefenseRemaining: daily.defenseRemaining,
      };
    })
    .filter(Boolean);
  return {
    candidates: eligible.slice(
      0,
      safeLimit
    ),
    hasMore:
      eligible.length > safeLimit,
  };
}

function allowedSubTargetTiers(challengerArenaRank) {
  const normalized = tierCode(challengerArenaRank);
  return SUB_TIER_PAIR_CONFIG.filter(
    (pair) => pair.challengerTier === normalized
  ).map((pair) => ({
    tier: pair.defenderTier,
    label: pair.label.split("-")[1],
    tierPairKey: pair.key,
    tierPairLabel: pair.label,
  }));
}

function selectRandomSubDefenseCandidate({
  candidates = [],
  targetTier,
  randomSelectionSeed = randomBytes(24).toString("hex"),
}) {
  const normalizedTier = String(targetTier || "")
    .trim()
    .toUpperCase();
  const pool = candidates.filter(
    (candidate) =>
      tierCode(candidate.arenaRank) === normalizedTier
  );
  if (!pool.length) return null;
  // 발생한 공격은 같은 대상 티어에서 오늘 방어 횟수가 가장 적은
  // 후보에게 먼저 돌아간다. 같은 횟수의 후보끼리는 서버 시드로
  // 무작위 선정해 특정 사용자를 직접 고르거나 고정 편향이 생기지 않게 한다.
  const minimumDefenseCount = Math.min(
    ...pool.map((candidate) => Number(candidate.dailyDefenseCount || 0))
  );
  const fairPool = pool.filter(
    (candidate) =>
      Number(candidate.dailyDefenseCount || 0) === minimumDefenseCount
  );
  const digest = createHash("sha256")
    .update(
      `${randomSelectionSeed}:${fairPool
        .map((candidate) => candidate.userId)
        .join(":")}`,
      "utf8"
    )
    .digest();
  return fairPool[digest.readUInt32BE(0) % fairPool.length];
}

function isEligibleSubDefenseDirection({
  challengerStanding,
  candidate,
}) {
  if (!challengerStanding || !candidate) return false;
  const challengerTier = tierCode(challengerStanding.arenaRank);
  const defenderTier = tierCode(candidate.arenaRank);
  if (challengerTier !== defenderTier) {
    return true;
  }

  // Unranked 같은 티어 내부 경기는 순위 쟁탈의 방향을 지킨다.
  // 방어자는 반드시 공격자보다 높은 티어 내부 순위여야 하므로,
  // 같은 티어에서 자신보다 낮은 사용자를 공격 대상으로 삼을 수 없다.
  return Number(candidate.arenaPosition) < Number(challengerStanding.arenaPosition);
}

function eligibleSubDefenseCandidates({
  candidates = [],
  challengerStanding,
}) {
  return candidates.filter((candidate) =>
    isEligibleSubDefenseDirection({ challengerStanding, candidate })
  );
}

async function listSubDefenseCandidates({
  challengerUserId,
  challengerArenaRank,
  now = new Date(),
  limit = DEFAULT_CANDIDATE_LIMIT,
}) {
  const seasonKey = kstSeasonKey(now);
  const accessStates =
    await ArenaAccessState.find({
      userId: { $ne: challengerUserId },
      currentCompetitiveDivision: "SUB",
      state: "PAID_ACTIVE",
      currentSeasonPlacementCompleted: true,
      defensePoolEligible: true,
      integrityStatus: { $in: ["CLEAR", null] },
    })
      .select(
        "userId accessCycleId standingId"
      )
      .lean();
  if (!accessStates.length) {
    return {
      candidates: [],
      hasMore: false,
    };
  }

  const userIds = accessStates.map(
    (state) => state.userId
  );
  const [
    challenger,
    users,
    cycles,
    standings,
    locks,
    unsettledMatches,
  ] = await Promise.all([
    User.findById(challengerUserId)
      .select("+identityMatchHash +arenaTestMatchEnabled isTestAccount")
      .lean(),
    User.find({
      _id: { $in: userIds },
      accountStatus: "active",
      isActive: { $ne: false },
    })
      .select("_id +identityMatchHash +arenaTestMatchEnabled isTestAccount")
      .lean(),
    AccessCycle.find({
      _id: {
        $in: accessStates.map(
          (state) => state.accessCycleId
        ),
      },
      status: "ACTIVE",
      division: "SUB",
      availableLearningDays: { $gt: 0 },
      lockedLearningDays: 0,
      lockedPaybackScoreDays: { $in: [0, null] },
    }).lean(),
    ArenaStanding.find({
      _id: {
        $in: accessStates.map(
          (state) => state.standingId
        ),
      },
      seasonKey,
      division: "SUB",
      status: "ACTIVE",
    })
      .sort({
        arenaGp: -1,
        reachedCurrentGpAt: 1,
        _id: 1,
      })
      .lean(),
    ArenaMatchParticipantLock.find({
      userId: { $in: userIds },
    })
      .select("userId")
      .lean(),
    ArenaMatch.find({
      status: {
        $in: UNSETTLED_MATCH_STATUSES,
      },
      $or: [
        {
          "challenger.userId": {
            $in: userIds,
          },
        },
        {
          "defender.userId": {
            $in: userIds,
          },
        },
      ],
    })
      .select(
        "challenger.userId defender.userId"
      )
      .lean(),
  ]);

  const busyUserIds = [
    ...locks.map((lock) =>
      String(lock.userId)
    ),
    ...participantUserIds(
      unsettledMatches
    ).map(String),
  ];
  const [dailyUsageByUser, dailyPolicy] = await Promise.all([
    loadSubDailyUsage({
      userIds,
      now,
    }),
    getActiveArenaPolicy(now),
  ]);
  return buildEligibleDefenseCandidates({
    standings,
    accessStates,
    users: users.filter(
      (user) =>
        sameTestAccountCohort(user, challenger) &&
        (
          !challenger?.identityMatchHash ||
          !user.identityMatchHash ||
          user.identityMatchHash !== challenger.identityMatchHash
        )
    ),
    cycles,
    busyUserIds,
    challengerArenaRank,
    dailyUsageByUser,
    dailyPolicy,
    limit,
  });
}

async function prepareSubAutoSelection({
  challengerUserId,
  requestId,
  now = new Date(),
}) {
  const actor = await loadMatchActorContext({
    userId: challengerUserId,
    now,
    requiredAvailableDays: 1,
  });
  const challengerDailyUsage = await loadSubDailyUsage({
    userIds: [challengerUserId],
    now,
  });
  const dailyPolicy = await getActiveArenaPolicy(now);
  const challengerDaily = subDailyLimitState({
    policy: dailyPolicy,
    cycle: actor.accessCycle,
    standing: actor.standing,
    usage: challengerDailyUsage.get(String(challengerUserId)),
  });
  actor.reasons.push(
    ...subDailyEligibilityReasons({
      daily: challengerDaily,
      role: "CHALLENGER",
    })
  );
  assertMatchContext(actor);
  const challengerTier = tierCode(actor.standing.arenaRank);
  const candidateResult = await listSubDefenseCandidates({
    challengerUserId,
    challengerArenaRank: actor.standing.arenaRank,
    now,
    limit: SERVER_SELECTION_CANDIDATE_LIMIT,
  });
  const eligibleCandidates = eligibleSubDefenseCandidates({
    candidates: candidateResult.candidates,
    challengerStanding: actor.standing,
  });
  const randomSelectionSeed = randomBytes(24).toString("hex");
  const targetOrder = allowedSubTargetTiers(challengerTier).map(
    (target) => target.tier
  );
  let selected = null;
  let pair = null;
  for (const selectedTargetTier of targetOrder) {
    const candidate = selectRandomSubDefenseCandidate({
      candidates: eligibleCandidates,
      targetTier: selectedTargetTier,
      randomSelectionSeed,
    });
    if (!candidate) continue;
    selected = candidate;
    pair = getSubTierPair(challengerTier, selectedTargetTier);
    break;
  }
  if (!selected) {
    throw statusError(
      409,
      "같은 티어의 상위 순위와 바로 위 티어에 지금 자동 매치할 수 있는 사용자가 없습니다.",
      "NO_ELIGIBLE_RANDOM_DEFENDER"
    );
  }
  const pool = eligibleCandidates.filter(
    (candidate) =>
      tierCode(candidate.arenaRank) === pair.defenderTier
  );
  const candidateUserIds = pool.map(
    (candidate) => candidate.userId
  );
  const candidatePoolHash = createHash("sha256")
    .update(
      candidateUserIds.slice().sort().join(":"),
      "utf8"
    )
    .digest("hex");
  return {
    requestId,
    targetTier: pair.defenderTier,
    tierPair: pair,
    selected,
    candidateUserIds,
    candidatePoolHash,
    randomSelectionSeed,
  };
}

async function getSubChallengeData({
  userId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(
      400,
      "사용자 정보를 확인해주세요.",
      "INVALID_USER_ID"
    );
  }
  const actor = await loadMatchActorContext({
    userId,
    now,
    requiredAvailableDays: 1,
  });
  const stakeDays =
    normalStakeDaysFromCycle(
      actor.accessCycle
    );
  const reasons = [...actor.reasons];
  const [activeMatch, usageByUser, dailyPolicy] = await Promise.all([
    findActiveMatchForUser({ userId }),
    loadSubDailyUsage({
      userIds: [userId],
      now,
    }),
    getActiveArenaPolicy(now),
  ]);
  const dailyUsage = subDailyLimitState({
    policy: dailyPolicy,
    cycle: actor.accessCycle,
    standing: actor.standing,
    usage: usageByUser.get(String(userId)),
  });
  reasons.push(
    ...subDailyEligibilityReasons({
      daily: dailyUsage,
      role: "CHALLENGER",
    })
  );
  if (
    Number(
      actor.accessCycle
        ?.paybackScoreDays || 0
    ) < stakeDays
  ) {
    reasons.push("MATCH_STAKE_UNAVAILABLE");
  }
  if (activeMatch) {
    reasons.push(
      "OFFICIAL_MATCH_ALREADY_PENDING"
    );
  }
  const canRequest =
    reasons.length === 0;
  const candidateResult = canRequest
      ? await listSubDefenseCandidates({
          challengerUserId: userId,
          challengerArenaRank:
            actor.standing?.arenaRank || "",
        now,
      })
    : {
        candidates: [],
        hasMore: false,
      };
  const eligibleCandidates = eligibleSubDefenseCandidates({
    candidates: candidateResult.candidates,
    challengerStanding: actor.standing,
  });
  const allowedTargets = allowedSubTargetTiers(
    actor.standing?.arenaRank || ""
  );
  const targetTiers = allowedTargets.map((target) => ({
    ...target,
    candidateCount: eligibleCandidates.filter(
      (candidate) =>
        tierCode(candidate.arenaRank) === target.tier
    ).length,
  }));
  const currentTier = tierCode(actor.standing?.arenaRank);
  const sameTierTarget = targetTiers.find(
    (target) => target.tier === currentTier
  ) || null;
  const nextTierTarget = targetTiers.find(
    (target) => target.tier !== currentTier
  ) || null;

  return {
    canRequest,
    reasons: [...new Set(reasons)],
    unavailableMessage: canRequest
      ? ""
      : eligibilityMessage(reasons),
    stakeDays,
    matchmakingRestrictedUntil: actor.matchmakingRestrictedUntil || null,
    policyVersionCode:
      actor.accessCycle
        ?.policyVersionCode || "",
    currentStanding: actor.standing
      ? {
          arenaRank:
            actor.standing.arenaRank,
          arenaPosition: Number(
            actor.standing
              .arenaPosition
          ),
          arenaGp: Number(
            actor.standing.arenaGp
          ),
        }
      : null,
    activeMatch,
    dailyUsage,
    targetTiers,
    sameTierTarget,
    nextTierTarget,
    automaticLadderMatch: true,
    hasEligibleOpponent: targetTiers.some(
      (target) => target.candidateCount > 0
    ),
  };
}

function assertMatchContext(
  context,
  { defender = false } = {}
) {
  const reasons = [...context.reasons];
  if (
    defender &&
    context.accessState
      ?.defensePoolEligible !== true
  ) {
    reasons.push(
      "DEFENSE_POOL_NOT_ELIGIBLE"
    );
  }
  if (reasons.length) {
    throw statusError(
      409,
      eligibilityMessage(reasons),
      reasons[0]
    );
  }
}

async function replayCreatedMatch({
  matchKey,
  challengerUserId,
}) {
  const match = await ArenaMatch.findOne({
    matchKey,
  }).lean();
  if (!match) return null;
  if (
    String(match.challenger.userId) !==
    String(challengerUserId)
  ) {
    throw statusError(
      409,
      "일반 쟁탈전 요청 식별자가 다른 사용자에게 사용되었습니다.",
      "CHALLENGE_REQUEST_OWNERSHIP_MISMATCH"
    );
  }
  return {
    match,
    replayed: true,
  };
}

function isRetryableTransactionError(error) {
  return Boolean(
    error?.hasErrorLabel?.(
      "TransientTransactionError"
    ) ||
      error?.hasErrorLabel?.(
        "UnknownTransactionCommitResult"
      )
  );
}

async function runCreateNormalMatchTransaction({
  challengerUserId,
  selection,
  matchKey,
  now,
}) {
  const dailyPolicy = await getActiveArenaPolicy(now);
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(
      async () => {
        const replay = await queryWithSession(
          ArenaMatch.findOne({
            matchKey,
          }),
          session
        ).lean();
        if (replay) {
          result = {
            match: replay,
            replayed: true,
          };
          return;
        }

        await assertMatchmakingOpen({ session, claim: true, now });

        const targetStanding =
          await queryWithSession(
            ArenaStanding.findOne({
              _id: selection.selected.standingId,
              division: "SUB",
              seasonKey: kstSeasonKey(now),
              status: "ACTIVE",
            }),
            session
          ).lean();
        if (!targetStanding) {
          throw statusError(
            404,
            "서버가 자동 선정한 방어자를 현재 Unranked 후보에서 찾을 수 없습니다.",
            "DEFENDER_NOT_FOUND"
          );
        }
        if (
          String(targetStanding.userId) ===
          String(challengerUserId)
        ) {
          throw statusError(
            400,
            "자신에게 일반 쟁탈전을 신청할 수 없습니다.",
            "SELF_CHALLENGE_NOT_ALLOWED"
          );
        }

        const challenger =
          await loadMatchActorContext({
            userId: challengerUserId,
            now,
            session,
            requiredAvailableDays: 1,
          });
        const defender =
          await loadMatchActorContext({
            userId:
              targetStanding.userId,
            now,
            session,
            requiredAvailableDays: 0,
            requireDefensePool: true,
          });
        const dailyUsageByUser = await loadSubDailyUsage({
          userIds: [challenger.user._id, defender.user._id],
          now,
          session,
        });
        const challengerDaily = subDailyLimitState({
          policy: dailyPolicy,
          cycle: challenger.accessCycle,
          standing: challenger.standing,
          usage: dailyUsageByUser.get(String(challenger.user._id)),
        });
        const defenderDaily = subDailyLimitState({
          policy: dailyPolicy,
          cycle: defender.accessCycle,
          standing: defender.standing,
          usage: dailyUsageByUser.get(String(defender.user._id)),
        });
        challenger.reasons.push(
          ...subDailyEligibilityReasons({
            daily: challengerDaily,
            role: "CHALLENGER",
          })
        );
        defender.reasons.push(
          ...subDailyEligibilityReasons({
            daily: defenderDaily,
            role: "DEFENDER",
          })
        );
        const stakeDays =
          normalStakeDaysFromCycle(
            challenger.accessCycle
          );
        if (
          Number(
            challenger.accessCycle
              ?.paybackScoreDays || 0
          ) < stakeDays
        ) {
          challenger.reasons.push(
            "MATCH_STAKE_UNAVAILABLE"
          );
        }
        assertMatchContext(challenger);
        assertMatchContext(defender, {
          defender: true,
        });
        const tierPair = getSubTierPair(
          challenger.standing.arenaRank,
          defender.standing.arenaRank
        );
        if (!tierPair) {
          throw statusError(
            409,
            "Unranked 일반 쟁탈전은 같은 티어 또는 바로 위 티어 사이에서만 성립합니다.",
            "SUB_TIER_PAIR_NOT_ALLOWED"
          );
        }
        if (
          !isEligibleSubDefenseDirection({
            challengerStanding: challenger.standing,
            candidate: defender.standing,
          })
        ) {
          throw statusError(
            409,
            "Unranked 같은 티어 쟁탈전은 공격자보다 높은 순위의 방어자에게만 성립합니다.",
            "SUB_SAME_TIER_DOWNWARD_MATCH_NOT_ALLOWED"
          );
        }
        if (
          String(defender.standing._id) !==
          String(targetStanding._id)
        ) {
          throw statusError(
            409,
            "서버가 자동 선정한 방어자의 참가 상태가 변경되었습니다. 다시 신청해주세요.",
            "DEFENDER_STANDING_CHANGED"
          );
        }

        const participantIds = [
          challenger.user._id,
          defender.user._id,
        ];
        const existingLock =
          await queryWithSession(
            ArenaMatchParticipantLock.findOne({
              userId: {
                $in: participantIds,
              },
            }),
            session
          ).lean();
        const existingMatch =
          await queryWithSession(
            ArenaMatch.findOne({
              status: {
                $in: UNSETTLED_MATCH_STATUSES,
              },
              $or: [
                {
                  "challenger.userId": {
                    $in: participantIds,
                  },
                },
                {
                  "defender.userId": {
                    $in: participantIds,
                  },
                },
              ],
            }),
            session
          ).lean();
        if (existingLock || existingMatch) {
          throw statusError(
            409,
            ELIGIBILITY_MESSAGES
              .OFFICIAL_MATCH_ALREADY_PENDING,
            "OFFICIAL_MATCH_ALREADY_PENDING"
          );
        }

        const matchId =
          new mongoose.Types.ObjectId();
        const selectionAuditId =
          new mongoose.Types.ObjectId();
        const generatedProblemSet =
          await generateSubOneOnOneQuestionsFromActiveData({
            challengerTier:
              challenger.standing.arenaRank,
            defenderTier:
              defender.standing.arenaRank,
            matchKey,
            participantUserIds: [
              challenger.user._id,
              defender.user._id,
            ],
          });
        const generatedPackDraft =
          buildGeneratedArenaProblemPackDraft({
            generation: generatedProblemSet,
            matchKey,
            generatedAt: now,
          });
        const sealedProblemPack =
          sealArenaProblemPackDraft(
            generatedPackDraft,
            {
              sealedAt: now,
              autoValidated: true,
            }
          );
        const problemPackId =
          new mongoose.Types.ObjectId();
        const matchDraft = {
          _id: matchId,
          matchKey,
          division: "SUB",
          seasonKey: kstSeasonKey(now),
          matchType: "NORMAL",
          matchOrigin:
            "SUB_UPWARD_AUTO_MATCH",
          requestInitiatorUserId:
            challenger.user._id,
          targetTier:
            selection.targetTier,
          selectionAuditId,
          tierPairKey: tierPair.key,
          tierPairLabel: tierPair.label,
          challenger: {
            userId: challenger.user._id,
            standingId:
              challenger.standing._id,
            accessCycleId:
              challenger.accessCycle._id,
            tupleBefore:
              arenaTupleFromStanding(
                challenger.standing
              ),
            stakeDays,
          },
          defender: {
            userId: defender.user._id,
            standingId:
              defender.standing._id,
            accessCycleId:
              defender.accessCycle._id,
            tupleBefore:
              arenaTupleFromStanding(
                defender.standing
              ),
            stakeDays: 0,
          },
          status: "READY",
          policyVersionCode:
            challenger.accessCycle
              .policyVersionCode,
          subscriptionPolicyVersionId:
            challenger.accessCycle
              .policyVersionId,
          subscriptionPolicyVersionCode:
            challenger.accessCycle
              .policyVersionCode,
          economySnapshot: {
            originalStakeDays: stakeDays,
            challengerStakeDays: stakeDays,
            defenderStakeDays: 0,
            revengeStakeMultiplier: 2,
            feeDays: 0,
            recipientNoShowReturnDays: 1,
            recipientNoShowBurnDays: 1,
            challengerWinRefundDays: stakeDays,
            bronzeChallengerWinRefundDays: 0,
          },
          problemPackId,
          problemPackVersion:
            sealedProblemPack.version,
          scoringVersion:
            sealedProblemPack.scoringVersion,
          timeLimitMs:
            sealedProblemPack.timeLimitMs,
          requestedAt: now,
          startDeadlineAt:
            subMatchStartDeadline(now),
          readyAt: now,
          integrityStatus: "PENDING",
        };
        await ArenaOpponentSelectionAudit.create(
          [
            {
              _id: selectionAuditId,
              requestId: `SUB:${challenger.user._id}:${selection.requestId}`,
              division: "SUB",
              selectionType:
                "SUB_UPWARD_AUTO_MATCH",
              requesterUserId:
                challenger.user._id,
              targetTier:
                selection.targetTier,
              candidateUserIds:
                selection.candidateUserIds,
              selectedUserIds: [
                defender.user._id,
              ],
              candidatePoolHash:
                selection.candidatePoolHash,
              randomSelectionSeed:
                selection.randomSelectionSeed,
              policyVersionCode:
                challenger.accessCycle
                  .policyVersionCode,
              selectedAt: now,
            },
          ],
          { session, ordered: true }
        );
        await ArenaProblemPack.create(
          [
            {
              ...sealedProblemPack,
              _id: problemPackId,
            },
          ],
          { session, ordered: true }
        );
        await ArenaMatch.create(
          [matchDraft],
          { session, ordered: true }
        );
        const initialAnswers =
          sealedProblemPack.questions.map(
            (question) => ({
              questionKey:
                question.questionKey,
              value: "",
              revision: 0,
              lastChangedAt: null,
            })
          );
        await ArenaMatchAttempt.create(
          [
            {
              matchId,
              userId: challenger.user._id,
              role: "CHALLENGER",
              problemPackId,
              problemPackVersion:
                sealedProblemPack.version,
              variantCode: "COMMON",
              status: "READY",
              answers: initialAnswers,
            },
            {
              matchId,
              userId: defender.user._id,
              role: "DEFENDER",
              problemPackId,
              problemPackVersion:
                sealedProblemPack.version,
              variantCode: "COMMON",
              status: "READY",
              answers: initialAnswers,
            },
          ],
          { session, ordered: true }
        );
        await ArenaMatchParticipantLock.create(
          participantIds.map((userId) => ({
            userId,
            matchId,
            acquiredAt: now,
          })),
          { session, ordered: true }
        );
        await reactivateAutomaticDefenseAfterAttack({
          userId: challenger.user._id,
          now,
          session,
        });

        const cycle =
          challenger.accessCycle;
        const cycleUpdate =
          await AccessCycle.updateOne(
            {
              _id: cycle._id,
              userId:
                challenger.user._id,
              status: "ACTIVE",
              paybackScoreDays: {
                $gte: stakeDays,
              },
              lockedPaybackScoreDays: { $in: [0, null] },
              lockedLearningDays: 0,
            },
            {
              $inc: {
                paybackScoreDays:
                  -stakeDays,
                lockedPaybackScoreDays:
                  stakeDays,
              },
            },
            { session }
          );
        if (!cycleUpdate.modifiedCount) {
          throw statusError(
            409,
            "일반 쟁탈전에 사용할 페이백 점수를 예치하지 못했습니다.",
            "MATCH_STAKE_LOCK_FAILED"
          );
        }

        const ledgerIdempotencyKey =
          `${matchId}:NORMAL_STAKE_LOCKED`;
        await ArenaLearningDayLedger.create(
          [
            {
              userId:
                challenger.user._id,
              accessCycleId: cycle._id,
              idempotencyKey:
                ledgerIdempotencyKey,
              eventType:
                "MATCH_STAKE_LOCKED",
              availableLearningDaysDelta:
                0,
              paybackScoreDaysDelta: -stakeDays,
              lockedPaybackScoreDaysDelta:
                stakeDays,
              lockedLearningDaysDelta: 0,
              balanceAfter: {
                availableLearningDays:
                  Number(
                    cycle.availableLearningDays
                  ),
                paybackScoreDays: Number(
                    cycle.paybackScoreDays
                ) - stakeDays,
                lockedPaybackScoreDays:
                  Number(cycle.lockedPaybackScoreDays || 0) + stakeDays,
                lockedLearningDays:
                  Number(
                    cycle.lockedLearningDays
                  ),
              },
              sourceType: "ArenaMatch",
              sourceId: matchId,
              occurredAt: now,
              metadata: {
                division: "SUB",
                matchType: "NORMAL",
                policyVersionCode:
                  challenger.accessCycle
                    .policyVersionCode,
              },
            },
          ],
          { session, ordered: true }
        );
        await ArenaOutboxEvent.create(
          [
            {
              eventType:
                "ArenaMatchCreated",
              aggregateType:
                "ArenaMatch",
              aggregateId: matchId,
              idempotencyKey:
                `${matchId}:ArenaMatchCreated`,
              payload: {
                matchId,
                division: "SUB",
                matchType: "NORMAL",
                challengerUserId:
                  challenger.user._id,
                defenderUserId:
                  defender.user._id,
                policyVersionCode:
                  challenger.accessCycle
                    .policyVersionCode,
                stakeDays,
              },
            },
            {
              eventType:
                "ArenaOpponentSelected",
              aggregateType:
                "ArenaOpponentSelectionAudit",
              aggregateId:
                selectionAuditId,
              idempotencyKey:
                `${selectionAuditId}:ArenaOpponentSelected`,
              payload: {
                matchId,
                division: "SUB",
                targetTier:
                  selection.targetTier,
                selectedUserId:
                  defender.user._id,
              },
            },
            {
              eventType:
                "ArenaMatchReady",
              aggregateType:
                "ArenaMatch",
              aggregateId: matchId,
              idempotencyKey:
                `${matchId}:ArenaMatchReady`,
              payload: {
                problemPackVersion:
                  sealedProblemPack.version,
                scoringVersion:
                  sealedProblemPack.scoringVersion,
                timeLimitMs:
                  sealedProblemPack.timeLimitMs,
                tierPairKey: tierPair.key,
              },
            },
          ],
          { session, ordered: true }
        );

        result = {
          match: matchDraft,
          replayed: false,
        };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );
  } finally {
    await session.endSession();
  }
  return result;
}

async function createSubNormalChallenge({
  challengerUserId,
  requestId,
  now = new Date(),
}) {
  if (
    !mongoose.isValidObjectId(
      challengerUserId
    )
  ) {
    throw statusError(
      400,
      "일반 쟁탈전 참가 정보를 확인해주세요.",
      "INVALID_MATCH_PARTICIPANT"
    );
  }
  const normalizedRequestId =
    normalizeRequestId(requestId);
  const matchKey = matchKeyForRequest({
    challengerUserId,
    requestId: normalizedRequestId,
  });
  const replay = await replayCreatedMatch({
    matchKey,
    challengerUserId,
  });
  if (replay) return replay;

  await assertMatchmakingOpen();

  let selection = await prepareSubAutoSelection({
    challengerUserId,
    requestId: normalizedRequestId,
    now: new Date(now),
  });

  let lastError = null;
  for (
    let attempt = 1;
    attempt <= TRANSACTION_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      return await runCreateNormalMatchTransaction(
        {
          challengerUserId,
          selection,
          matchKey,
          now: new Date(now),
        }
      );
    } catch (error) {
      lastError = error;
      if (error?.code === 11000) {
        const duplicateReplay =
          await replayCreatedMatch({
            matchKey,
            challengerUserId,
          });
        if (duplicateReplay) {
          return duplicateReplay;
        }
        throw statusError(
          409,
          ELIGIBILITY_MESSAGES
            .OFFICIAL_MATCH_ALREADY_PENDING,
          "OFFICIAL_MATCH_ALREADY_PENDING"
        );
      }
      if (
        attempt < TRANSACTION_RETRY_LIMIT &&
        [
          "OFFICIAL_MATCH_ALREADY_PENDING",
          "DEFENDER_NOT_FOUND",
          "DEFENDER_STANDING_CHANGED",
          "DEFENSE_POOL_NOT_ELIGIBLE",
        ].includes(error?.code)
      ) {
        selection = await prepareSubAutoSelection({
          challengerUserId,
          requestId: normalizedRequestId,
          now: new Date(now),
        });
        continue;
      }
      if (
        attempt ===
          TRANSACTION_RETRY_LIMIT ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }
  throw lastError;
}

module.exports = {
  DEFAULT_CANDIDATE_LIMIT,
  SERVER_SELECTION_CANDIDATE_LIMIT,
  ELIGIBILITY_MESSAGES,
  MATCH_STATUS_LABELS,
  NORMAL_MATCH_PROBLEM_PACK_PENDING,
  NORMAL_MATCH_SCORING_PENDING,
  UNSETTLED_MATCH_STATUSES,
  arenaTupleFromStanding,
  allowedSubTargetTiers,
  buildEligibleDefenseCandidates,
  assertMatchContext,
  createSubNormalChallenge,
  defenseCandidateAlias,
  findActiveMatchForUser,
  getSubChallengeData,
  isEligibleSubDefenseDirection,
  isSundayDivisionLocked,
  isSundayMatchRequestLocked,
  kstDayWindow,
  loadSubDailyUsage,
  loadMatchActorContext,
  kstClockParts,
  listSubDefenseCandidates,
  matchKeyForRequest,
  normalStakeDaysFromCycle,
  normalizeRequestId,
  nextSundayMatchCutoff,
  prepareSubAutoSelection,
  selectRandomSubDefenseCandidate,
  eligibleSubDefenseCandidates,
  sameTestAccountCohort,
  subDailyEligibilityReasons,
  subDailyLimitState,
  subMatchStartDeadline,
};
