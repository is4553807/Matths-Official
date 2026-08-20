const {
  AccessCycle,
  ArenaAccessState,
  ArenaStanding,
} = require(
  "../models/goatArenaModel"
);
const {
  RankingProfile,
} = require(
  "../models/matthsModel"
);
const {
  kstDateKey,
} = require(
  "./accessCycleService"
);
const {
  policyReadiness,
} = require(
  "./policyVersionService"
);
const {
  getActiveArenaPolicy,
} = require(
  "./arenaPolicyService"
);
const {
  arenaMatchSettlementCopy,
} = require(
  "./arenaRulebookViewService"
);
const {
  getActiveParticipantMatch,
  getPendingParticipantInvitation,
  serializeParticipantMatch,
} = require(
  "./goatArenaProductionMatchReadService"
);
const {
  attackParticipationDays,
  lastAttackParticipationDate,
  minimumAttackParticipationDays,
} = require(
  "../constants/paybackParticipation"
);

const READ_MODEL_VERSION =
  "GOAT_ARENA_V1";
const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyDayNumber(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) {
    return null;
  }
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / DAY_MS);
}

function cycleDayForDateKey(firstDateKey, targetDateKey) {
  const firstDay = dateKeyDayNumber(firstDateKey);
  const targetDay = dateKeyDayNumber(targetDateKey);
  return firstDay === null || targetDay === null
    ? null
    : targetDay - firstDay + 1;
}

// GOAT_ARENA_V1의 이전 주기 모양도 읽을 수 있게 유지하는 변환기다.
function accessRightsAt(cycle, now = new Date()) {
  const startsAt = new Date(cycle?.paidAccessStartsOn);
  const endsAt = new Date(cycle?.paidAccessEndsOn);
  const target = new Date(now);
  const cycleDay = Number.isFinite(startsAt.getTime())
    ? cycleDayForDateKey(kstDateKey(startsAt), kstDateKey(target))
    : null;
  const paidAccessActive = Boolean(
    Number.isFinite(startsAt.getTime()) &&
      target >= startsAt &&
      (!Number.isFinite(endsAt.getTime()) || target < endsAt)
  );
  const completionPassActive = cycleDay === 30;
  const paidAccessDaysRemaining =
    paidAccessActive && Number.isFinite(endsAt.getTime())
      ? Math.max(0, cycleDayForDateKey(kstDateKey(target), kstDateKey(endsAt)) || 0)
      : 0;
  return {
    cycleDay,
    paidAccessActive,
    completionPassActive,
    learningAccessActive:
      paidAccessActive || completionPassActive,
    paidAccessDaysRemaining,
  };
}

function asPlain(value) {
  if (!value) {
    return null;
  }
  return typeof value.toObject ===
    "function"
    ? value.toObject()
    : value;
}

function idString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }
  return String(value);
}

function isoString(value) {
  if (!value) {
    return null;
  }
  const date =
    value instanceof Date
      ? value
      : new Date(value);
  return Number.isFinite(
    date.getTime()
  )
    ? date.toISOString()
    : null;
}

function positiveIntegerOrNull(
  value
) {
  return Number.isSafeInteger(
    value
  ) && value > 0
    ? value
    : null;
}

function cyclePhase(
  cycleDay
) {
  if (
    !Number.isSafeInteger(
      cycleDay
    )
  ) {
    return "UNKNOWN";
  }
  if (cycleDay < 1) {
    return "UPCOMING";
  }
  if (cycleDay <= 29) {
    return "PAID_ACCESS";
  }
  if (cycleDay === 30) {
    return "COMPLETION_PASS";
  }
  return "REVIEW_OR_CLOSED";
}

function conditionSnapshot({
  key,
  semanticKey = null,
  current,
  required,
  met,
}) {
  return {
    key,
    ...(semanticKey ? { semanticKey } : {}),
    current:
      Number.isSafeInteger(current)
        ? current
        : 0,
    required:
      Number.isSafeInteger(required)
        ? required
        : null,
    met: Boolean(met),
  };
}

function isProductionCycle(source) {
  return Object.prototype.hasOwnProperty.call(
    source || {},
    "paybackScoreDays"
  );
}

function productionPolicyReadiness(policy) {
  const source = asPlain(policy);
  const payback = source?.payback;
  const ready = Boolean(
    source &&
      Number.isSafeInteger(
        minimumAttackParticipationDays(payback)
      ) &&
      Number.isSafeInteger(payback?.minimumScoreDays) &&
      Array.isArray(payback?.bands) &&
      payback.bands.length > 0
  );
  return {
    canExposePayback: ready,
    canExposeMainArena: ready,
    unresolvedCore: ready ? [] : ["subscriptionPolicyVersion"],
    paybackBlockers: [],
  };
}

function readinessForPolicy(policy) {
  return policy?.payback
    ? productionPolicyReadiness(policy)
    : policyReadiness(policy);
}

function productionCycleDay(source, now) {
  const startsAt = new Date(source.startsAt);
  const at = new Date(now);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(at.getTime())
  ) {
    return null;
  }
  return cycleDayForDateKey(
    kstDateKey(startsAt),
    kstDateKey(at)
  );
}

function buildCycleSnapshot({
  cycle,
  policy,
  activeRanking = null,
  now = new Date(),
}) {
  const source =
    asPlain(cycle);
  if (!source) {
    return null;
  }

  if (isProductionCycle(source)) {
    const cycleDay = productionCycleDay(source, now);
    const expiresAt = new Date(source.expiresAt);
    const nowDate = new Date(now);
    const active =
      source.status === "ACTIVE" &&
      (!Number.isFinite(expiresAt.getTime()) || expiresAt > nowDate);
    const daysRemaining = active && Number.isFinite(expiresAt.getTime())
      ? Math.max(
          0,
          cycleDayForDateKey(
            kstDateKey(nowDate),
            kstDateKey(expiresAt)
          )
        )
      : 0;
    const challengeCount = Number(
      source.paidNormalAttacksCompleted || 0
    );
    const integrityClear = !(
      source.paybackDisqualifiers || []
    ).includes("INTEGRITY_VIOLATION_CONFIRMED");

    return {
      id: idString(source._id),
      status: source.status,
      activeRanking:
        activeRanking || source.division || null,
      cycleDay,
      phase: cyclePhase(cycleDay),
      startsOn: isoString(source.startsAt),
      paidAccessEndsOn: isoString(source.expiresAt),
      day30ReviewOn: isoString(source.evaluationAt),
      access: {
        paidAccessActive: active,
        completionPassActive:
          active && cycleDay === 30,
        learningAccessActive:
          active && Number(source.availableLearningDays || 0) > 0,
        paidAccessDaysRemaining: daysRemaining,
      },
      // GOAT_ARENA_V1 키는 구버전 iPad와의 wire 호환을 위해 유지한다.
      // 값의 정본은 최신 AccessCycle의 페이백 점수/학습 가능 일수다.
      balances: {
        refundAvailableDays: Number(source.paybackScoreDays || 0),
        refundLockedDays: Number(source.lockedPaybackScoreDays || 0),
        bonusAvailableDays: Number(source.availableLearningDays || 0),
        bonusLockedDays:
          Number(source.lockedLearningDays || 0) +
          Number(source.reservedLearningDays || 0),
        source: "ACCESS_CYCLE_LEDGER_CACHE",
      },
      attendance: {
        attackParticipationDays:
          attackParticipationDays(source),
        lastParticipationDate:
          lastAttackParticipationDate(source),
        // GOAT_ARENA_V1 wire 호환용 별칭이다.
        cycleStreakDays:
          attackParticipationDays(source),
        lastRecognizedDate:
          lastAttackParticipationDate(source),
      },
      challenges: {
        completed: challengeCount,
        completedNormal: challengeCount,
        completedRevenge: 0,
        requestCount: 0,
        minimumRequired: 0,
        requestLimit: null,
        newRequestCutoffDay: null,
      },
      integrityState: integrityClear ? "CLEAR" : "HELD",
      autoRenewEnabled: false,
    };
  }

  const rights = accessRightsAt(source, now);

  return {
    id: idString(source._id),
    status: source.status,
    activeRanking:
      activeRanking ||
      source.activeRanking ||
      null,
    cycleDay: rights.cycleDay,
    phase: cyclePhase(
      rights.cycleDay
    ),
    startsOn:
      source
        .paidAccessStartsOn ||
      null,
    paidAccessEndsOn:
      source
        .paidAccessEndsOn ||
      null,
    day30ReviewOn:
      source.day30ReviewOn ||
      null,
    access: {
      paidAccessActive:
        rights.paidAccessActive,
      completionPassActive:
        rights
          .completionPassActive,
      learningAccessActive:
        rights
          .learningAccessActive,
      paidAccessDaysRemaining:
        rights
          .paidAccessDaysRemaining,
    },
    balances: {
      refundAvailableDays:
        source
          .refundChallengeDays ||
        0,
      refundLockedDays:
        source
          .lockedRefundDays ||
        0,
      bonusAvailableDays:
        source
          .bonusAccessDays ||
        0,
      bonusLockedDays:
        source
          .lockedBonusDays ||
        0,
      source:
        "LEDGER_DERIVED_CACHE",
    },
    attendance: {
      cycleStreakDays:
        source
          .cycleStreakDays ||
        0,
      lastRecognizedDate:
        source
          .lastRecognizedAttendanceDate ||
        null,
    },
    challenges: {
      completed:
        source
          .completedSubChallenges ||
        0,
      completedNormal:
        source
          .completedSubNormalChallenges ||
        0,
      completedRevenge:
        source
          .completedSubRevengeChallenges ||
        0,
      requestCount:
        source
          .challengeRequestCount ||
        0,
      minimumRequired:
        Number.isSafeInteger(
          policy
            ?.minCompletedSubChallenges
        )
          ? policy
              .minCompletedSubChallenges
          : null,
      requestLimit:
        policy
          ?.subChallengeRequestLimit ??
        null,
      newRequestCutoffDay:
        Number.isSafeInteger(
          policy
            ?.newChallengeCutoffCycleDay
        )
          ? policy
              .newChallengeCutoffCycleDay
          : null,
    },
    integrityState:
      source.integrityState ||
      "CLEAR",
    autoRenewEnabled:
      Boolean(
        source.autoRenewEnabled
      ),
  };
}

function buildPaybackProgress({
  cycle,
  policy,
  activeMatch,
}) {
  const source =
    asPlain(cycle);
  if (!source) {
    return {
      state:
        "NO_ACTIVE_CYCLE",
      canEvaluate: false,
      eligible: null,
      refundStatus: null,
      conditions: [],
      blockers: [
        {
          code:
            "NO_ACTIVE_CYCLE",
        },
      ],
    };
  }

  if (isProductionCycle(source)) {
    const readiness = readinessForPolicy(policy);
    const minimumParticipationDays =
      minimumAttackParticipationDays(
        policy?.payback ||
          source.policySnapshot?.payback ||
          {}
      );
    const minimumScoreDays = Number(
      policy?.payback?.minimumScoreDays ??
        source.policySnapshot?.payback?.minimumScoreDays ??
        30
    );
    const participationDays =
      attackParticipationDays(source);
    const scoreDays = Number(source.paybackScoreDays || 0);
    const integrityBlocked = (
      source.paybackDisqualifiers || []
    ).some((value) =>
      [
        "INTEGRITY_VIOLATION_CONFIRMED",
        "INTEGRITY_NOT_CLEAR",
      ].includes(String(value))
    );
    const blockers = [];
    if (!readiness.canExposePayback) {
      blockers.push({
        code: "POLICY_PENDING",
        fields: [
          ...readiness.unresolvedCore,
          ...readiness.paybackBlockers,
        ],
      });
    }
    if (activeMatch) {
      blockers.push({ code: "ACTIVE_MATCH" });
    }
    if (
      Number(source.lockedPaybackScoreDays || 0) > 0 ||
      Number(source.lockedLearningDays || 0) > 0 ||
      Number(source.reservedLearningDays || 0) > 0
    ) {
      blockers.push({ code: "LOCKED_DAY_BALANCE" });
    }
    if (integrityBlocked) {
      blockers.push({ code: "INTEGRITY_REVIEW" });
    }
    const conditions = [
      conditionSnapshot({
        key: "CYCLE_ATTENDANCE",
        semanticKey: "ATTACK_PARTICIPATION",
        current: participationDays,
        required: minimumParticipationDays,
        met: participationDays >= minimumParticipationDays,
      }),
      conditionSnapshot({
        key: "PAYBACK_SCORE",
        current: scoreDays,
        required: minimumScoreDays,
        met: scoreDays >= minimumScoreDays,
      }),
    ];
    const canEvaluate = readiness.canExposePayback;
    const eligible = canEvaluate
      ? conditions.every((condition) => condition.met) &&
        blockers.length === 0
      : null;
    return {
      state: canEvaluate
        ? eligible
          ? "ELIGIBLE"
          : "IN_PROGRESS"
        : "POLICY_PENDING",
      canEvaluate,
      eligible,
      refundStatus: source.paybackPayoutStatus || null,
      conditions,
      blockers,
    };
  }

  const readiness =
    readinessForPolicy(policy);
  const challengeTarget =
    Number.isSafeInteger(
      policy
        ?.minCompletedSubChallenges
    )
      ? policy
          .minCompletedSubChallenges
      : null;

  const conditions = [
    conditionSnapshot({
      key:
        "CYCLE_ATTENDANCE",
      current:
        source
          .cycleStreakDays,
      required: 30,
      met:
        source
          .refundAttendanceConditionMet,
    }),
    conditionSnapshot({
      key:
        "REFUND_DAY_BALANCE",
      current:
        source
          .refundChallengeDays,
      required: 30,
      met:
        source
          .refundBalanceConditionMet,
    }),
    conditionSnapshot({
      key:
        "COMPLETED_SUB_CHALLENGES",
      current:
        source
          .completedSubChallenges,
      required:
        challengeTarget,
      met:
        source
          .refundMinimumChallengeConditionMet,
    }),
  ];

  const blockers = [];
  if (
    !readiness.canExposePayback
  ) {
    blockers.push({
      code:
        "POLICY_PENDING",
      fields: [
        ...readiness
          .unresolvedCore,
        ...readiness
          .paybackBlockers,
      ],
    });
  }
  if (activeMatch) {
    blockers.push({
      code:
        "ACTIVE_MATCH",
    });
  }
  if (
    Number(
      source.lockedRefundDays ||
        0
    ) > 0 ||
    Number(
      source.lockedBonusDays ||
        0
    ) > 0
  ) {
    blockers.push({
      code:
        "LOCKED_DAY_BALANCE",
    });
  }
  if (
    source.integrityState !==
    "CLEAR"
  ) {
    blockers.push({
      code:
        "INTEGRITY_REVIEW",
    });
  }

  const canEvaluate =
    readiness.canExposePayback;
  const eligible =
    canEvaluate
      ? Boolean(
          source.refundEligible &&
            blockers.length === 0
        )
      : null;

  return {
    state:
      canEvaluate
        ? eligible
          ? "ELIGIBLE"
          : "IN_PROGRESS"
        : "POLICY_PENDING",
    canEvaluate,
    eligible,
    refundStatus:
      source.refundStatus ||
      null,
    conditions,
    blockers,
  };
}

function buildSkillSnapshot(
  rankingProfile
) {
  const source =
    asPlain(
      rankingProfile
    );
  if (!source) {
    return {
      status:
        "PLACEMENT_PENDING",
      mmr: null,
      tier: null,
      rankPoint: null,
      overallRank: null,
      weeklyExamsUntilConfirmed:
        null,
    };
  }

  return {
    status:
      source.status ||
      "PROVISIONAL",
    mmr:
      Number.isFinite(
        source.mmr
      )
        ? source.mmr
        : null,
    tier: source.tier || null,
    rankPoint:
      Number.isFinite(
        source.rankPoint
      )
        ? source.rankPoint
        : null,
    overallRank:
      Number.isSafeInteger(
        source.overallRank
      )
        ? source.overallRank
        : null,
    weeklyExamsUntilConfirmed:
      Number.isSafeInteger(
        source
          .weeklyExamsUntilConfirmed
      )
        ? source
            .weeklyExamsUntilConfirmed
        : null,
  };
}

function buildSeatSnapshot(
  arenaProfile
) {
  const source =
    asPlain(arenaProfile);
  if (!source) {
    return {
      status:
        "NOT_SEEDED",
      arenaPosition: null,
      mmrAtLastSeed: null,
      seededAt: null,
      seedWeekKey: null,
      protectionUntil: null,
      rankShieldUntil: null,
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(
      source,
      "arenaRank"
    )
  ) {
    return {
      status: source.status || "ACTIVE",
      arenaPosition: Number.isSafeInteger(source.arenaPosition)
        ? source.arenaPosition
        : null,
      mmrAtLastSeed: Number.isFinite(source.seedPlacementMmr)
        ? source.seedPlacementMmr
        : null,
      seededAt: isoString(source.seededAt),
      seedWeekKey: source.seasonKey || null,
      protectionUntil: null,
      rankShieldUntil: null,
      arenaRank: source.arenaRank || null,
      arenaGp: Number.isFinite(source.arenaGp)
        ? source.arenaGp
        : null,
    };
  }

  return {
    status: source.status,
    arenaPosition:
      Number.isSafeInteger(
        source.arenaPosition
      )
        ? source.arenaPosition
        : null,
    mmrAtLastSeed:
      Number.isFinite(
        source.mmrAtLastSeed
      )
        ? source.mmrAtLastSeed
        : null,
    seededAt: isoString(
      source.seededAt
    ),
    seedWeekKey:
      source.seedWeekKey ||
      null,
    protectionUntil:
      isoString(
        source.protectionUntil
      ),
    rankShieldUntil:
      isoString(
        source.rankShieldUntil
      ),
  };
}

function buildMatchSnapshot({
  activeMatch,
  activeAttempt = null,
  userId,
}) {
  const source =
    asPlain(activeMatch);
  if (!source) {
    return null;
  }

  // 최신 공식 경기 정본은 goatArenaModel.ArenaMatch다. iPad에는 기존
  // GOAT_ARENA_V1의 필드 이름을 유지하되 값은 중첩 참가자·공식 attempt에서
  // 번역한다. RankTakeoverMatch를 조회하거나 복제하지 않는다.
  if (
    source.challenger?.userId &&
    source.defender?.userId
  ) {
    const serialized =
      serializeParticipantMatch(
        source,
        userId,
        activeAttempt
      );
    return {
      id: serialized.id,
      status: serialized.status,
      role: serialized.role,
      matchType: serialized.matchType,
      settlementRule:
        arenaMatchSettlementCopy(
          serialized.activeRanking,
          serialized.matchType
        ),
      activeRanking:
        serialized.activeRanking,
      myPositionBefore:
        serialized.myPositionBefore,
      opponentPositionBefore:
        serialized.opponentPositionBefore,
      stake: serialized.stake,
      startedAt:
        serialized.timeline.startedAt,
      startsBy:
        serialized.timeline.startsBy,
      submitsBy:
        serialized.timeline.submitsBy,
      hardDeadlineAt:
        serialized.timeline.hardDeadlineAt,
      timeLimitSeconds:
        serialized.timeLimitSeconds,
      integrityState:
        serialized.integrityState,
      availableActions:
        serialized.capabilities?.availableActions || [],
      attempt: serialized.attempt
        ? {
            status:
              serialized.attempt.status,
            startedAt:
              serialized.attempt.startedAt,
            endsAt:
              serialized.attempt.endsAt,
            submittedAt:
              serialized.attempt.submittedAt,
            evidenceDeadlineAt:
              serialized.attempt.evidenceDeadlineAt,
            evidenceRequired:
              serialized.attempt.evidenceRequired,
            currentQuestionIndex:
              serialized.attempt.currentQuestionIndex,
          }
        : null,
    };
  }

  const isChallenger =
    idString(
      source.challengerUserId
    ) === idString(userId);
  const isDefender =
    idString(
      source.defenderUserId
    ) === idString(userId);
  if (
    !isChallenger &&
    !isDefender
  ) {
    return null;
  }
  const cost =
    source
      .challengeCostSnapshot ||
    {};
  const attempt =
    asPlain(activeAttempt);

  return {
    id:
      source.matchId ||
      idString(source._id),
    status: source.status,
    role: isChallenger
      ? "CHALLENGER"
      : "DEFENDER",
    matchType:
      source.matchType,
    settlementRule:
      arenaMatchSettlementCopy(
        source.activeRanking,
        source.matchType
      ),
    activeRanking:
      source.activeRanking,
    myPositionBefore:
      isChallenger
        ? source
            .challengerPositionBefore
        : source
            .defenderPositionBefore,
    opponentPositionBefore:
      isChallenger
        ? source
            .defenderPositionBefore
        : source
            .challengerPositionBefore,
    stake: {
      assetType:
        cost.assetType ||
        null,
      days:
        Number.isSafeInteger(
          cost.stakeDays
        )
          ? cost.stakeDays
          : null,
    },
    startedAt:
      isoString(
        isChallenger
          ? source
              .challengerStartedAt
          : source
              .defenderStartedAt
      ),
    startsBy: isoString(
      source.startsBy
    ),
    submitsBy: isoString(
      isChallenger
        ? source
            .challengerDeadlineAt
        : source
            .defenderDeadlineAt
    ),
    hardDeadlineAt:
      isoString(
        source.submitsBy
      ),
    timeLimitSeconds:
      positiveIntegerOrNull(
        source.timeLimitSeconds
      ),
    integrityState:
      source.integrityState ||
      "CLEAR",
    attempt: attempt
      ? {
          status:
            attempt.status,
          startedAt:
            isoString(
              attempt.startedAt
            ),
          endsAt:
            isoString(
              attempt.endsAt
            ),
          submittedAt:
            isoString(
              attempt.submittedAt
            ),
        }
      : null,
  };
}

function buildGoatArenaReadModel({
  userId,
  user,
  cycle,
  policy,
  accessState = null,
  season,
  arenaProfile,
  rankingProfile,
  activeMatch,
  activeAttempt = null,
  pendingInvitation = null,
  now = new Date(),
}) {
  const cycleSnapshot =
    buildCycleSnapshot({
      cycle,
      policy,
      activeRanking:
        accessState?.currentCompetitiveDivision ||
        cycle?.division ||
        cycle?.activeRanking ||
        null,
      now,
    });
  const readiness =
    readinessForPolicy(policy);

  return {
    readModelVersion:
      READ_MODEL_VERSION,
    generatedAt:
      new Date(now)
        .toISOString(),
    state: cycleSnapshot
      ? "ACTIVE_CYCLE"
      : "NO_ACTIVE_CYCLE",
    identity: {
      displayName:
        user?.name ||
        "Matths 학생",
      schoolName:
        user?.school?.name ||
        null,
      displayMode: "nickname",
    },
    cycle: cycleSnapshot,
    payback:
      buildPaybackProgress({
        cycle,
        policy,
        activeMatch,
      }),
    ranking: {
      activeRanking:
        cycleSnapshot
          ?.activeRanking ||
        null,
      skill:
        buildSkillSnapshot(
          rankingProfile
        ),
      seat:
        buildSeatSnapshot(
          arenaProfile
        ),
      contract:
        "MMR_AND_ARENA_POSITION_ARE_SEPARATE",
    },
    season: season
      ? {
          id:
            season.seasonId ||
            idString(
              season._id
            ),
          title:
            season.title ||
            null,
          status:
            season.status,
          currentWeekKey:
            season
              .currentWeekKey ||
            null,
          startsAt:
            isoString(
              season.startsAt
            ),
          endsAt:
            isoString(
              season.endsAt
            ),
        }
      : arenaProfile?.seasonKey
        ? {
            id: arenaProfile.seasonKey,
            title: null,
            status: "ACTIVE",
            currentWeekKey: null,
            startsAt: null,
            endsAt: null,
          }
        : null,
    activeMatch:
      buildMatchSnapshot({
        activeMatch,
        activeAttempt,
        userId,
      }),
    pendingInvitation,
    capabilities: {
      paybackEvaluation:
        readiness.canExposePayback
          ? "READY"
          : "POLICY_PENDING",
      mainArena:
        readiness.canExposeMainArena
          ? "READY"
          : "POLICY_PENDING",
      challengeCommands:
        "ARENA_MATCH_V1",
    },
  };
}

async function findLean(
  query
) {
  return query.lean();
}

async function getGoatArenaReadModel(
  user,
  now = new Date()
) {
  const userId =
    user?._id || user?.id;
  if (!userId) {
    throw new TypeError(
      "authenticated user is required"
    );
  }

  const [
    accessState,
    rankingProfile,
    activeAuthority,
    pendingInvitation,
  ] = await Promise.all([
    findLean(ArenaAccessState.findOne({ userId })),
    findLean(
      RankingProfile.findOne({
        userId,
        datasetOnly: { $ne: true },
      })
    ),
    getActiveParticipantMatch({ userId }),
    getPendingParticipantInvitation({ userId }),
  ]);

  const [cycle, arenaProfile, activePolicy] = await Promise.all([
    accessState?.accessCycleId
      ? findLean(AccessCycle.findById(accessState.accessCycleId))
      : findLean(
          AccessCycle.findOne({ userId, status: "ACTIVE" }).sort({
            startsAt: -1,
          })
        ),
    accessState?.standingId
      ? findLean(ArenaStanding.findById(accessState.standingId))
      : findLean(
          ArenaStanding.findOne({
            userId,
            status: "ACTIVE",
          }).sort({ updatedAt: -1 })
        ),
    getActiveArenaPolicy(now),
  ]);
  const policy = cycle?.policySnapshot || activePolicy;
  const season = null;
  const activeMatch =
    activeAuthority?.match || null;
  const activeAttempt =
    activeAuthority?.attempt || null;

  return buildGoatArenaReadModel({
    userId,
    user,
    cycle,
    policy,
    accessState,
    season,
    arenaProfile,
    rankingProfile,
    activeMatch,
    activeAttempt,
    pendingInvitation,
    now,
  });
}

module.exports = {
  READ_MODEL_VERSION,
  buildCycleSnapshot,
  buildGoatArenaReadModel,
  buildMatchSnapshot,
  buildPaybackProgress,
  getGoatArenaReadModel,
};
