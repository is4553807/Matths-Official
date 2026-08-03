const mongoose = require("mongoose");
const { createHash, randomBytes } = require("node:crypto");
const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchParticipantLock,
  ArenaOpponentSelectionAudit,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaStanding,
  MainInvitationOffer,
  MainInvitationRequest,
  MainDivisionPolicyVersion,
  MainShopEffect,
} = require("../models/goatArenaModel");
const {
  assertMainStakeSelection,
  calculateInvitationCancellation,
  officialMatchStartDeadline,
  resolveInvitationOfferCount,
} = require("./arenaDivisionRuleService");
const {
  arenaTupleFromStanding,
  findActiveMatchForUser,
  isSundayMatchRequestLocked,
  loadMatchActorContext,
  normalizeRequestId,
  sameTestAccountCohort,
  UNSETTLED_MATCH_STATUSES,
} = require("./arenaMatchService");
const {
  generateMainOneOnOneQuestionsFromActiveData,
  getMainTierPair,
  tierCode,
} = require("./arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const {
  getActiveMainDivisionPolicy,
  mainPolicySnapshot,
} = require("./arenaPolicyService");
const {
  kstSeasonKey,
} = require("./arenaStandingService");
const {
  moveAvailable,
  moveReservedToLocked,
  releaseReserved,
} = require("./mainLearningDayService");
const {
  arenaTierIndex,
} = require("./arenaTierPolicy");

const RECENT_OPPONENT_MS = 7 * 24 * 60 * 60 * 1000;

function kstDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function statusError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getInvitationPolicy(request, session = null) {
  const query = MainDivisionPolicyVersion.findById(request?.policyVersionId);
  if (session) query.session(session);
  const policy = await query.lean();
  if (!policy || policy.code !== request?.policyVersionCode) {
    throw statusError(
      409,
      "초대 생성 당시 Main Division 정책 사본을 찾을 수 없습니다.",
      "MAIN_INVITATION_POLICY_SNAPSHOT_MISSING"
    );
  }
  return policy;
}

function mainMatchKey({ origin, userId, requestId }) {
  const digest = createHash("sha256")
    .update(`${origin}:${userId}:${requestId}`, "utf8")
    .digest("hex");
  return `MAIN:${origin}:${userId}:${digest}`;
}

function candidatePoolHash(userIds) {
  return createHash("sha256")
    .update(userIds.map(String).sort().join(":"), "utf8")
    .digest("hex");
}

function seededCandidateOrder(candidates, seed) {
  return [...candidates].sort((left, right) => {
    const leftHash = createHash("sha256")
      .update(`${seed}:${left.userId}`, "utf8")
      .digest("hex");
    const rightHash = createHash("sha256")
      .update(`${seed}:${right.userId}`, "utf8")
      .digest("hex");
    return leftHash.localeCompare(rightHash);
  });
}

function tierRelationship({ actorTier, targetTier, direction }) {
  const actorIndex = arenaTierIndex(actorTier);
  const targetIndex = arenaTierIndex(targetTier);
  const tierGap =
    direction === "UPWARD"
      ? targetIndex - actorIndex
      : actorIndex - targetIndex;
  if (tierGap < 1 || tierGap > 3) {
    throw statusError(
      409,
      "Main Division에서는 현재 티어보다 1~3단계 차이인 목표 티어만 선택할 수 있습니다.",
      "MAIN_TARGET_TIER_GAP_NOT_ALLOWED"
    );
  }
  return { tierGap, actorIndex, targetIndex };
}

async function recentOpponentIds(userId, now, session = null) {
  const query = ArenaMatch.find({
    division: "MAIN",
    createdAt: { $gte: new Date(new Date(now).getTime() - RECENT_OPPONENT_MS) },
    status: { $ne: "INVALID" },
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  }).select("challenger.userId defender.userId");
  if (session) query.session(session);
  const matches = await query.lean();
  return new Set(
    matches.map((match) =>
      String(match.challenger.userId) === String(userId)
        ? String(match.defender.userId)
        : String(match.challenger.userId)
    )
  );
}

async function activeDefenseRestUserIds(now = new Date()) {
  const effects = await MainShopEffect.find({
    itemCode: "DEFENSE_REST",
    status: "ACTIVE",
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  })
    .select("userId")
    .lean();
  return new Set(effects.map((effect) => String(effect.userId)));
}

async function listEligibleMainCandidates({
  requesterUserId,
  targetTier,
  stakeDays,
  now = new Date(),
  mandatoryDefense = false,
}) {
  const seasonKey = kstSeasonKey(now);
  const [standings, recentIds, defenseRestIds] = await Promise.all([
    ArenaStanding.find({
      division: "MAIN",
      seasonKey,
      status: "ACTIVE",
      arenaRank: targetTier,
      userId: { $ne: requesterUserId },
    }).lean(),
    recentOpponentIds(requesterUserId, now),
    mandatoryDefense ? activeDefenseRestUserIds(now) : Promise.resolve(new Set()),
  ]);
  const userIds = standings
    .map((standing) => standing.userId)
    .filter(
      (userId) =>
        !recentIds.has(String(userId)) &&
        !defenseRestIds.has(String(userId))
    );
  if (!userIds.length) return [];
  const [requester, users, accessStates, cycles, locks] = await Promise.all([
    User.findById(requesterUserId).select("+identityMatchHash isTestAccount").lean(),
    User.find({
      _id: { $in: userIds },
      accountStatus: "active",
      isActive: true,
      "privateMockRestriction.active": { $ne: true },
    })
      .select("_id +identityMatchHash isTestAccount")
      .lean(),
    ArenaAccessState.find({
      userId: { $in: userIds },
      state: "PAID_ACTIVE",
      currentCompetitiveDivision: "MAIN",
      currentSeasonPlacementCompleted: true,
      integrityStatus: { $in: ["CLEAR", null] },
    }).lean(),
    AccessCycle.find({
      userId: { $in: userIds },
      division: "MAIN",
      status: "ACTIVE",
      availableLearningDays: { $gt: Number(stakeDays) },
      lockedLearningDays: 0,
    }).lean(),
    ArenaMatchParticipantLock.find({ userId: { $in: userIds } })
      .select("userId")
      .lean(),
  ]);
  const validUsers = new Set(
    users
      .filter(
        (user) =>
          sameTestAccountCohort(user, requester) &&
          (
            !requester?.identityMatchHash ||
            !user.identityMatchHash ||
            user.identityMatchHash !== requester.identityMatchHash
          )
      )
      .map((user) => String(user._id))
  );
  const accessByUser = new Map(
    accessStates.map((state) => [String(state.userId), state])
  );
  const cycleByUser = new Map(cycles.map((cycle) => [String(cycle.userId), cycle]));
  const lockedUsers = new Set(locks.map((lock) => String(lock.userId)));
  return standings
    .filter((standing) => {
      const id = String(standing.userId);
      return (
        validUsers.has(id) &&
        accessByUser.has(id) &&
        cycleByUser.has(id) &&
        !lockedUsers.has(id)
      );
    })
    .map((standing) => ({
      userId: standing.userId,
      standingId: standing._id,
      accessState: accessByUser.get(String(standing.userId)),
      cycle: cycleByUser.get(String(standing.userId)),
      standing,
    }));
}

function cycleBalanceAfter(cycle, state) {
  return {
    availableLearningDays: state.availableLearningDays,
    paybackScoreDays: Number(cycle.paybackScoreDays || 0),
    lockedLearningDays: state.lockedLearningDays,
    reservedLearningDays: state.reservedLearningDays,
  };
}

async function writeCycleState({ cycle, state, session }) {
  const update = await AccessCycle.updateOne(
    {
      _id: cycle._id,
      status: "ACTIVE",
      availableLearningDays: Number(cycle.availableLearningDays || 0),
      reservedLearningDays: Number(cycle.reservedLearningDays || 0),
      lockedLearningDays: Number(cycle.lockedLearningDays || 0),
    },
    {
      $set: {
        learningDayBuckets: state.buckets,
        availableLearningDays: state.availableLearningDays,
        reservedLearningDays: state.reservedLearningDays,
        lockedLearningDays: state.lockedLearningDays,
      },
    },
    { session, ordered: true }
  );
  if (!update.modifiedCount) {
    throw statusError(
      409,
      "Main Division 학습일수 잔액이 변경되어 요청을 처리하지 못했습니다.",
      "MAIN_LEARNING_DAY_CONCURRENCY_CONFLICT"
    );
  }
}

async function createLearningLedger({
  userId,
  cycle,
  idempotencyKey,
  eventType,
  availableDelta = 0,
  reservedDelta = 0,
  lockedDelta = 0,
  state,
  sourceType,
  sourceId,
  now,
  metadata = {},
  session,
}) {
  await ArenaLearningDayLedger.create(
    [
      {
        userId,
        accessCycleId: cycle._id,
        idempotencyKey,
        eventType,
        availableLearningDaysDelta: availableDelta,
        paybackScoreDaysDelta: 0,
        lockedLearningDaysDelta: lockedDelta,
        reservedLearningDaysDelta: reservedDelta,
        sourceBucket: "UNSPECIFIED",
        balanceAfter: cycleBalanceAfter(cycle, state),
        sourceType,
        sourceId,
        occurredAt: now,
        metadata,
      },
    ],
    { session, ordered: true }
  );
}

async function generatedMainPack({ lowerTier, upperTier, matchKey, matchType, now }) {
  const generation = await generateMainOneOnOneQuestionsFromActiveData({
    lowerTier,
    upperTier,
    matchKey,
  });
  return sealArenaProblemPackDraft(
    buildGeneratedArenaProblemPackDraft({
      generation,
      matchKey,
      generatedAt: now,
      division: "MAIN",
      matchType,
    }),
    { sealedAt: now, autoValidated: true }
  );
}

async function createMainMatchArtifacts({
  matchId,
  matchKey,
  matchOrigin,
  requestInitiatorUserId,
  lowerContext,
  upperContext,
  targetTier,
  stakeDays,
  policy,
  selectionAuditId = null,
  invitationRequestId = null,
  now,
  session,
}) {
  const pair = getMainTierPair(
    lowerContext.standing.arenaRank,
    upperContext.standing.arenaRank
  );
  if (!pair) {
    throw statusError(409, "Main Division 티어 조합을 확인해주세요.", "MAIN_TIER_PAIR_NOT_ALLOWED");
  }
  const sealedPack = await generatedMainPack({
    lowerTier: lowerContext.standing.arenaRank,
    upperTier: upperContext.standing.arenaRank,
    matchKey,
    matchType: "NORMAL",
    now,
  });
  const problemPackId = new mongoose.Types.ObjectId();
  const matchDraft = {
    _id: matchId,
    matchKey,
    division: "MAIN",
    seasonKey: kstSeasonKey(now),
    matchType: "NORMAL",
    matchOrigin,
    requestInitiatorUserId,
    targetTier,
    selectionAuditId,
    invitationRequestId,
    tierPairKey: pair.key,
    tierPairLabel: pair.label,
    challenger: {
      userId: lowerContext.user._id,
      standingId: lowerContext.standing._id,
      accessCycleId: lowerContext.accessCycle._id,
      tupleBefore: arenaTupleFromStanding(lowerContext.standing),
      stakeDays,
    },
    defender: {
      userId: upperContext.user._id,
      standingId: upperContext.standing._id,
      accessCycleId: upperContext.accessCycle._id,
      tupleBefore: arenaTupleFromStanding(upperContext.standing),
      stakeDays,
    },
    status: "READY",
    policyVersionCode: policy.code,
    divisionPolicyVersionId: policy._id,
    divisionPolicyVersionCode: policy.code,
    economySnapshot: {
      originalStakeDays: stakeDays,
      challengerStakeDays: stakeDays,
      defenderStakeDays: stakeDays,
      revengeStakeMultiplier: Number(policy.revengeStakeMultiplier || 2),
      feeDays: Number(policy.revengeFeeDays || 1),
    },
    problemPackId,
    problemPackVersion: sealedPack.version,
    scoringVersion: sealedPack.scoringVersion,
    timeLimitMs: sealedPack.timeLimitMs,
    requestedAt: now,
    startDeadlineAt: officialMatchStartDeadline({ now, division: "MAIN" }),
    readyAt: now,
    integrityStatus: "PENDING",
  };
  await ArenaProblemPack.create([{ ...sealedPack, _id: problemPackId }], {
    session,
    ordered: true,
  });
  await ArenaMatch.create([matchDraft], { session, ordered: true });
  const answers = sealedPack.questions.map((question) => ({
    questionKey: question.questionKey,
    value: "",
    revision: 0,
    lastChangedAt: null,
  }));
  await ArenaMatchAttempt.create(
    [
      {
        matchId,
        userId: lowerContext.user._id,
        role: "CHALLENGER",
        problemPackId,
        problemPackVersion: sealedPack.version,
        status: "READY",
        answers,
      },
      {
        matchId,
        userId: upperContext.user._id,
        role: "DEFENDER",
        problemPackId,
        problemPackVersion: sealedPack.version,
        status: "READY",
        answers,
      },
    ],
    { session, ordered: true }
  );
  await ArenaMatchParticipantLock.create(
    [lowerContext.user._id, upperContext.user._id].map((userId) => ({
      userId,
      matchId,
      acquiredAt: now,
    })),
    { session, ordered: true }
  );
  await ArenaOutboxEvent.create(
    [
      {
        eventType: "ArenaMatchCreated",
        aggregateType: "ArenaMatch",
        aggregateId: matchId,
        idempotencyKey: `${matchId}:ArenaMatchCreated`,
        payload: {
          division: "MAIN",
          matchOrigin,
          challengerUserId: lowerContext.user._id,
          defenderUserId: upperContext.user._id,
          stakeDays,
        },
      },
      {
        eventType: "ArenaMatchReady",
        aggregateType: "ArenaMatch",
        aggregateId: matchId,
        idempotencyKey: `${matchId}:ArenaMatchReady`,
        payload: { problemPackVersion: sealedPack.version },
      },
    ],
    { session, ordered: true }
  );
  return matchDraft;
}

async function createMainUpwardChallenge({
  userId,
  targetTier,
  stakeDays,
  requestId,
  now = new Date(),
}) {
  const normalizedRequestId = normalizeRequestId(requestId);
  if (isSundayMatchRequestLocked(now, "MAIN")) {
    throw statusError(409, "일요일 14시 30분 이후에는 신규 Main Division 경기를 만들 수 없습니다.", "SUNDAY_DIVISION_LOCK");
  }
  const [actor, policy] = await Promise.all([
    loadMatchActorContext({ userId, division: "MAIN", now }),
    getActiveMainDivisionPolicy(now),
  ]);
  if (!actor.eligible) {
    throw statusError(409, "Main Division 경기 참가 상태를 확인해주세요.", actor.reasons[0]);
  }
  const relationship = tierRelationship({
    actorTier: actor.standing.arenaRank,
    targetTier,
    direction: "UPWARD",
  });
  const stake = assertMainStakeSelection({
    policy,
    tierGap: relationship.tierGap,
    stakeDays,
    availableLearningDays: actor.accessCycle.availableLearningDays,
  });
  const candidates = await listEligibleMainCandidates({
    requesterUserId: userId,
    targetTier,
    stakeDays: stake.stakeDays,
    now,
    mandatoryDefense: true,
  });
  if (!candidates.length) {
    throw statusError(409, "선택한 티어에 현재 참가 가능한 상대가 없습니다.", "MAIN_OPPONENT_NOT_FOUND");
  }
  const seed = randomBytes(24).toString("hex");
  const selected = seededCandidateOrder(candidates, seed)[0];
  const matchKey = mainMatchKey({ origin: "UPWARD", userId, requestId: normalizedRequestId });
  /* Arena 전용 유형 누락·검산 실패 시 아래 호출이 DB 변경 전에 안전하게 중단한다. */
  generatedMainPack({
    lowerTier: actor.standing.arenaRank,
    upperTier: selected.standing.arenaRank,
    matchKey,
    matchType: "NORMAL",
    now,
  });

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const existing = await ArenaMatch.findOne({ matchKey }).session(session).lean();
      if (existing) {
        result = { match: existing, replayed: true };
        return;
      }
      const lower = await loadMatchActorContext({
        userId,
        division: "MAIN",
        now,
        session,
      });
      const upper = await loadMatchActorContext({
        userId: selected.userId,
        division: "MAIN",
        now,
        session,
        requireDefensePool: true,
      });
      if (!lower.eligible || !upper.eligible) {
        throw statusError(409, "선정된 상대의 참가 상태가 변경되었습니다.", "MAIN_OPPONENT_STATE_CHANGED");
      }
      assertMainStakeSelection({
        policy,
        tierGap: relationship.tierGap,
        stakeDays: stake.stakeDays,
        availableLearningDays: lower.accessCycle.availableLearningDays,
      });
      assertMainStakeSelection({
        policy,
        tierGap: relationship.tierGap,
        stakeDays: stake.stakeDays,
        availableLearningDays: upper.accessCycle.availableLearningDays,
      });
      const matchId = new mongoose.Types.ObjectId();
      const auditId = new mongoose.Types.ObjectId();
      await ArenaOpponentSelectionAudit.create(
        [
          {
            _id: auditId,
            requestId: `MAIN:UPWARD:${userId}:${normalizedRequestId}`,
            division: "MAIN",
            selectionType: "MAIN_UPWARD_AUTO_MATCH",
            requesterUserId: userId,
            targetTier,
            candidateUserIds: candidates.map((candidate) => candidate.userId),
            selectedUserIds: [upper.user._id],
            candidatePoolHash: candidatePoolHash(candidates.map((candidate) => candidate.userId)),
            randomSelectionSeed: seed,
            policyVersionCode: policy.code,
            selectedAt: now,
          },
        ],
        { session, ordered: true }
      );
      const match = await createMainMatchArtifacts({
        matchId,
        matchKey,
        matchOrigin: "MAIN_UPWARD_AUTO_MATCH",
        requestInitiatorUserId: lower.user._id,
        lowerContext: lower,
        upperContext: upper,
        targetTier,
        stakeDays: stake.stakeDays,
        policy,
        selectionAuditId: auditId,
        now,
        session,
      });
      for (const context of [lower, upper]) {
        const state = moveAvailable(
          context.accessCycle,
          stake.stakeDays,
          "lockedDays"
        );
        await writeCycleState({ cycle: context.accessCycle, state, session });
        await createLearningLedger({
          userId: context.user._id,
          cycle: context.accessCycle,
          idempotencyKey: `${matchId}:${context.user._id}:MAIN_NORMAL_STAKE_LOCKED`,
          eventType: "MATCH_STAKE_LOCKED",
          availableDelta: -stake.stakeDays,
          lockedDelta: stake.stakeDays,
          state,
          sourceType: "ArenaMatch",
          sourceId: matchId,
          now,
          metadata: { division: "MAIN", matchOrigin: "MAIN_UPWARD_AUTO_MATCH" },
          session,
        });
      }
      result = { match, replayed: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function createMainLowerInvitation({
  userId,
  targetTier,
  stakeDays,
  requestId,
  now = new Date(),
}) {
  const normalizedRequestId = normalizeRequestId(requestId);
  if (isSundayMatchRequestLocked(now, "MAIN")) {
    throw statusError(409, "일요일 14시 30분 이후에는 Main Division 초대 예약을 만들 수 없습니다.", "SUNDAY_DIVISION_LOCK");
  }
  const [actor, policy] = await Promise.all([
    loadMatchActorContext({ userId, division: "MAIN", now }),
    getActiveMainDivisionPolicy(now),
  ]);
  if (!actor.eligible) {
    throw statusError(409, "Main Division 초대 생성 자격을 확인해주세요.", actor.reasons[0]);
  }
  const relationship = tierRelationship({
    actorTier: actor.standing.arenaRank,
    targetTier,
    direction: "DOWNWARD",
  });
  const stake = assertMainStakeSelection({
    policy,
    tierGap: relationship.tierGap,
    stakeDays,
    availableLearningDays: actor.accessCycle.availableLearningDays,
  });
  const candidates = await listEligibleMainCandidates({
    requesterUserId: userId,
    targetTier,
    stakeDays: stake.stakeDays,
    now,
  });
  const compatibilityKey = mainMatchKey({
    origin: "INVITATION-CHECK",
    userId,
    requestId: normalizedRequestId,
  });
  generatedMainPack({
    lowerTier: targetTier,
    upperTier: actor.standing.arenaRank,
    matchKey: compatibilityKey,
    matchType: "NORMAL",
    now,
  });
  const seed = randomBytes(24).toString("hex");
  const ordered = seededCandidateOrder(candidates, seed);
  const offerCount = resolveInvitationOfferCount({
    eligibleCandidateCount: ordered.length,
    invitationOfferBatchSize: policy.invitationOfferBatchSize,
  });
  const selected = ordered.slice(0, offerCount);
  const session = await mongoose.startSession();
  let invitation;
  try {
    await session.withTransaction(async () => {
      const existing = await MainInvitationRequest.findOne({
        initiatorUserId: userId,
        requestId: normalizedRequestId,
      })
        .session(session)
        .lean();
      if (existing) {
        invitation = existing;
        return;
      }
      const current = await loadMatchActorContext({
        userId,
        division: "MAIN",
        now,
        session,
      });
      if (!current.eligible) {
        throw statusError(409, "초대 생성자의 참가 상태가 변경되었습니다.", "MAIN_INVITATION_INITIATOR_CHANGED");
      }
      assertMainStakeSelection({
        policy,
        tierGap: relationship.tierGap,
        stakeDays: stake.stakeDays,
        availableLearningDays: current.accessCycle.availableLearningDays,
      });
      const requestObjectId = new mongoose.Types.ObjectId();
      const auditId = new mongoose.Types.ObjectId();
      const state = moveAvailable(current.accessCycle, stake.stakeDays, "reservedDays");
      await writeCycleState({ cycle: current.accessCycle, state, session });
      await ArenaOpponentSelectionAudit.create(
        [
          {
            _id: auditId,
            requestId: `MAIN:INVITATION:${userId}:${normalizedRequestId}`,
            division: "MAIN",
            selectionType: "MAIN_LOWER_INVITATION_BATCH",
            requesterUserId: userId,
            targetTier,
            candidateUserIds: candidates.map((candidate) => candidate.userId),
            selectedUserIds: selected.map((candidate) => candidate.userId),
            candidatePoolHash: candidatePoolHash(candidates.map((candidate) => candidate.userId)),
            randomSelectionSeed: seed,
            policyVersionCode: policy.code,
            selectedAt: now,
          },
        ],
        { session, ordered: true }
      );
      const [created] = await MainInvitationRequest.create(
        [
          {
            _id: requestObjectId,
            requestId: normalizedRequestId,
            initiatorUserId: userId,
            initiatorStandingId: current.standing._id,
            initiatorArenaTier: current.standing.arenaRank,
            targetTier,
            stakeDays: stake.stakeDays,
            policyVersionId: policy._id,
            policyVersionCode: policy.code,
            status: selected.length ? "OFFERED" : "SEARCHING",
            reservedLearningDays: stake.stakeDays,
            selectedCandidateId: selected[0]?.userId || null,
            candidatePoolSnapshot: candidates.map((candidate) => candidate.userId),
            candidatePoolHash: candidatePoolHash(candidates.map((candidate) => candidate.userId)),
            selectionPolicyVersion: policy.code,
            randomSelectionSeed: seed,
            requestExpiresAt: null,
            selectedAt: selected.length ? now : null,
            cancellationFeeDays: Number(policy.invitationCancellationFeeDays || 1),
          },
        ],
        { session, ordered: true }
      );
      await MainInvitationOffer.create(
        selected.map((candidate) => ({
          invitationRequestId: requestObjectId,
          candidateUserId: candidate.userId,
          selectionAuditId: auditId,
          status: "OFFERED",
          offeredAt: now,
        })),
        { session, ordered: true }
      );
      await createLearningLedger({
        userId,
        cycle: current.accessCycle,
        idempotencyKey: `${requestObjectId}:MAIN_INVITATION_RESERVE`,
        eventType: "MAIN_INVITATION_RESERVE",
        availableDelta: -stake.stakeDays,
        reservedDelta: stake.stakeDays,
        state,
        sourceType: "MainInvitationRequest",
        sourceId: requestObjectId,
        now,
        session,
      });
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "MainInvitationCreated",
            aggregateType: "MainInvitationRequest",
            aggregateId: requestObjectId,
            idempotencyKey: `${requestObjectId}:MainInvitationCreated`,
            payload: { targetTier, stakeDays: stake.stakeDays },
          },
          ...selected.map((candidate) => ({
            eventType: "MainInvitationOffered",
            aggregateType: "MainInvitationRequest",
            aggregateId: requestObjectId,
            idempotencyKey: `${requestObjectId}:${candidate.userId}:MainInvitationOffered`,
            payload: { candidateUserId: candidate.userId },
          })),
        ],
        { session, ordered: true }
      );
      invitation = created.toObject();
    });
  } finally {
    await session.endSession();
  }
  return invitation;
}

async function respondToMainInvitation({
  offerId,
  userId,
  response,
  now = new Date(),
}) {
  const normalizedResponse = String(response || "").toUpperCase();
  if (!["ACCEPT", "DECLINE"].includes(normalizedResponse)) {
    throw statusError(400, "초대 응답을 확인해주세요.", "INVALID_INVITATION_RESPONSE");
  }
  if (isSundayMatchRequestLocked(now, "MAIN")) {
    throw statusError(409, "일요일 14시 30분 이후에는 초대를 수락하거나 거절할 수 없습니다.", "SUNDAY_DIVISION_LOCK");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const offer = await MainInvitationOffer.findOne({
        _id: offerId,
        candidateUserId: userId,
      }).session(session);
      if (!offer) throw statusError(404, "받은 초대를 찾을 수 없습니다.", "INVITATION_OFFER_NOT_FOUND");
      if (offer.status !== "OFFERED") {
        result = { status: offer.status, replayed: true };
        return;
      }
      const request = await MainInvitationRequest.findById(
        offer.invitationRequestId
      ).session(session);
      if (!request || !["OFFERED", "SEARCHING"].includes(request.status)) {
        offer.status = "SUPERSEDED";
        offer.respondedAt = now;
        await offer.save({ session });
        result = { status: "SUPERSEDED", replayed: false };
        return;
      }
      if (normalizedResponse === "DECLINE") {
        offer.status = "DECLINED";
        offer.respondedAt = now;
        await offer.save({ session });
        await ArenaOutboxEvent.create(
          [
            {
              eventType: "MainInvitationDeclined",
              aggregateType: "MainInvitationRequest",
              aggregateId: request._id,
              idempotencyKey: `${offer._id}:MainInvitationDeclined`,
              payload: { candidateUserId: userId },
            },
          ],
          { session, ordered: true }
        );
        result = { status: "DECLINED", invitationId: request._id, replayed: false };
        return;
      }
      request.status = "MATCH_FORMING";
      await request.save({ session });
      const [lower, upper, policy] = await Promise.all([
        loadMatchActorContext({ userId, division: "MAIN", now, session }),
        loadMatchActorContext({
          userId: request.initiatorUserId,
          division: "MAIN",
          now,
          session,
          requiredAvailableDays: 0,
        }),
        getInvitationPolicy(request, session),
      ]);
      if (!lower.eligible || !upper.eligible) {
        throw statusError(409, "초대 당사자의 참가 상태가 변경되었습니다.", "MAIN_INVITATION_PARTICIPANT_CHANGED");
      }
      if (Number(upper.accessCycle.reservedLearningDays || 0) < request.stakeDays) {
        throw statusError(409, "초대에 예약된 학습일수를 확인해주세요.", "MAIN_INVITATION_RESERVE_MISSING");
      }
      if (Number(lower.accessCycle.availableLearningDays || 0) <= request.stakeDays) {
        throw statusError(409, "초대 수락 후 최소 1일의 학습일수가 남아야 합니다.", "MAIN_INVITATION_RECIPIENT_BALANCE_BUFFER_REQUIRED");
      }
      const matchId = new mongoose.Types.ObjectId();
      const matchKey = mainMatchKey({
        origin: "INVITATION",
        userId: request.initiatorUserId,
        requestId: `${request.requestId}:${userId}`,
      });
      const match = await createMainMatchArtifacts({
        matchId,
        matchKey,
        matchOrigin: "MAIN_LOWER_INVITATION",
        requestInitiatorUserId: request.initiatorUserId,
        lowerContext: lower,
        upperContext: upper,
        targetTier: request.targetTier,
        stakeDays: request.stakeDays,
        policy,
        invitationRequestId: request._id,
        now,
        session,
      });
      const upperState = moveReservedToLocked(upper.accessCycle, request.stakeDays);
      const lowerState = moveAvailable(lower.accessCycle, request.stakeDays, "lockedDays");
      await writeCycleState({ cycle: upper.accessCycle, state: upperState, session });
      await writeCycleState({ cycle: lower.accessCycle, state: lowerState, session });
      await createLearningLedger({
        userId: upper.user._id,
        cycle: upper.accessCycle,
        idempotencyKey: `${matchId}:${upper.user._id}:MAIN_INVITATION_TO_MATCH_LOCK`,
        eventType: "MAIN_INVITATION_TO_MATCH_LOCK",
        reservedDelta: -request.stakeDays,
        lockedDelta: request.stakeDays,
        state: upperState,
        sourceType: "ArenaMatch",
        sourceId: matchId,
        now,
        session,
      });
      await createLearningLedger({
        userId: lower.user._id,
        cycle: lower.accessCycle,
        idempotencyKey: `${matchId}:${lower.user._id}:MAIN_MATCH_STAKE_LOCKED`,
        eventType: "MATCH_STAKE_LOCKED",
        availableDelta: -request.stakeDays,
        lockedDelta: request.stakeDays,
        state: lowerState,
        sourceType: "ArenaMatch",
        sourceId: matchId,
        now,
        session,
      });
      offer.status = "ACCEPTED";
      offer.respondedAt = now;
      request.status = "MATCHED";
      request.acceptedCandidateId = userId;
      request.matchedOfferId = offer._id;
      request.matchedAt = now;
      request.reservedLearningDays = 0;
      await Promise.all([
        offer.save({ session }),
        request.save({ session }),
        MainInvitationOffer.updateMany(
          {
            invitationRequestId: request._id,
            _id: { $ne: offer._id },
            status: "OFFERED",
          },
          { $set: { status: "SUPERSEDED", respondedAt: now } },
          { session }
        ),
      ]);
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "MainInvitationAccepted",
            aggregateType: "MainInvitationRequest",
            aggregateId: request._id,
            idempotencyKey: `${offer._id}:MainInvitationAccepted`,
            payload: { matchId, candidateUserId: userId },
          },
        ],
        { session, ordered: true }
      );
      result = { status: "MATCHED", match, matchId, replayed: false };
    });
  } finally {
    await session.endSession();
  }
  if (result?.status === "DECLINED") {
    await refreshMainInvitationOffers({ invitationId: result.invitationId || null, now }).catch(() => {});
  }
  return result;
}

async function cancelMainInvitation({
  invitationId,
  userId,
  cancellationType = "MANUAL",
  reason = "USER_CANCELLED",
  now = new Date(),
}) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await MainInvitationRequest.findOne({
        _id: invitationId,
        initiatorUserId: userId,
      }).session(session);
      if (!request) throw statusError(404, "초대 예약을 찾을 수 없습니다.", "MAIN_INVITATION_NOT_FOUND");
      if (request.status === "CANCELLED") {
        result = request.toObject();
        return;
      }
      if (!["SEARCHING", "OFFERED", "PAUSED"].includes(request.status)) {
        throw statusError(409, "이미 매치가 성립된 초대는 취소할 수 없습니다.", "MAIN_INVITATION_NOT_CANCELLABLE");
      }
      const [cycle, policy] = await Promise.all([
        AccessCycle.findOne({ userId, division: "MAIN", status: "ACTIVE" }).session(session).lean(),
        getInvitationPolicy(request, session),
      ]);
      if (!cycle) throw statusError(409, "초대 예약의 Main 학습일수 주기를 찾을 수 없습니다.", "MAIN_INVITATION_CYCLE_NOT_FOUND");
      const settlement = calculateInvitationCancellation({
        reservedLearningDays: request.reservedLearningDays,
        cancellationFeeDays: policy.invitationCancellationFeeDays,
        cancellationType,
        manualCancellationAllowed: policy.manualInvitationCancellationAllowed,
        manualCancellationFeeDays: policy.manualInvitationCancellationFeeDays,
        availableLearningDays: cycle.availableLearningDays,
      });
      const state = releaseReserved(cycle, {
        returnDays: settlement.releasedLearningDays,
        burnDays: settlement.burnedLearningDays,
      });
      await writeCycleState({ cycle, state, session });
      request.status = "CANCELLED";
      request.releasedLearningDays = settlement.releasedLearningDays;
      request.burnedLearningDays = settlement.burnedLearningDays;
      request.cancelledAt = now;
      request.cancelReason = reason;
      request.reservedLearningDays = 0;
      await request.save({ session });
      await MainInvitationOffer.updateMany(
        { invitationRequestId: request._id, status: { $in: ["OFFERED", "PAUSED"] } },
        { $set: { status: "SUPERSEDED", respondedAt: now } },
        { session, ordered: true }
      );
      await createLearningLedger({
        userId,
        cycle,
        idempotencyKey: `${request._id}:MAIN_INVITATION_CANCELLED`,
        eventType: "MAIN_INVITATION_RELEASE",
        availableDelta: settlement.releasedLearningDays,
        reservedDelta: -(
          settlement.releasedLearningDays + settlement.burnedLearningDays
        ),
        state,
        sourceType: "MainInvitationRequest",
        sourceId: request._id,
        now,
        metadata: {
          cancellationType,
          burnedLearningDays: settlement.burnedLearningDays,
        },
        session,
      });
      if (settlement.burnedLearningDays > 0) {
        await createLearningLedger({
          userId,
          cycle: { ...cycle, ...state },
          idempotencyKey: `${request._id}:MAIN_INVITATION_CANCELLATION_FEE_BURN`,
          eventType: "MAIN_INVITATION_CANCELLATION_FEE_BURN",
          state,
          sourceType: "MainInvitationRequest",
          sourceId: request._id,
          now,
          metadata: { burnedLearningDays: settlement.burnedLearningDays },
          session,
        });
      }
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "MainInvitationCancelled",
            aggregateType: "MainInvitationRequest",
            aggregateId: request._id,
            idempotencyKey: `${request._id}:MainInvitationCancelled`,
            payload: { reason, ...settlement },
          },
        ],
        { session, ordered: true }
      );
      result = request.toObject();
    });
  } finally {
    await session.endSession();
  }
  return result;
}

async function cancelZeroAvailableMainInvitations({ now = new Date() } = {}) {
  const cycles = await AccessCycle.find({
    division: "MAIN",
    status: "ACTIVE",
    availableLearningDays: 0,
    reservedLearningDays: { $gt: 0 },
  }).lean();
  const results = [];
  for (const cycle of cycles) {
    const requests = await MainInvitationRequest.find({
      initiatorUserId: cycle.userId,
      status: { $in: ["SEARCHING", "OFFERED", "PAUSED"] },
    }).lean();
    for (const request of requests) {
      results.push(
        await cancelMainInvitation({
          invitationId: request._id,
          userId: cycle.userId,
          cancellationType: "AUTOMATIC",
          reason: "AVAILABLE_LEARNING_DAYS_DEPLETED",
          now,
        })
      );
    }
  }
  return results;
}

async function refreshMainInvitationOffers({ invitationId = null, now = new Date() } = {}) {
  if (isSundayMatchRequestLocked(now, "MAIN")) return [];
  const filter = {
    status: { $in: ["SEARCHING", "OFFERED"] },
    ...(invitationId ? { _id: invitationId } : {}),
  };
  const requests = await MainInvitationRequest.find(filter).lean();
  requests.sort((left, right) => {
    const leftActive = left.acceleratedAt && (!left.accelerationEndsAt || new Date(left.accelerationEndsAt) > now);
    const rightActive = right.acceleratedAt && (!right.accelerationEndsAt || new Date(right.accelerationEndsAt) > now);
    if (Boolean(leftActive) !== Boolean(rightActive)) return leftActive ? -1 : 1;
    return new Date(leftActive ? left.acceleratedAt : left.createdAt) - new Date(rightActive ? right.acceleratedAt : right.createdAt);
  });
  const refreshed = [];
  for (const request of requests) {
    const offeredCount = await MainInvitationOffer.countDocuments({
      invitationRequestId: request._id,
      status: "OFFERED",
    });
    if (offeredCount > 0) continue;
    const candidates = await listEligibleMainCandidates({
      requesterUserId: request.initiatorUserId,
      targetTier: request.targetTier,
      stakeDays: request.stakeDays,
      now,
    });
    const priorOffers = await MainInvitationOffer.find({
      invitationRequestId: request._id,
    }).select("candidateUserId").lean();
    const priorIds = new Set(priorOffers.map((offer) => String(offer.candidateUserId)));
    const freshCandidates = candidates.filter((candidate) => !priorIds.has(String(candidate.userId)));
    if (!freshCandidates.length) {
      await MainInvitationRequest.updateOne(
        { _id: request._id, status: { $in: ["SEARCHING", "OFFERED"] } },
        { $set: { status: "SEARCHING", selectedCandidateId: null } }
      );
      continue;
    }
    const policy = await getInvitationPolicy(request);
    const seed = randomBytes(24).toString("hex");
    const ordered = seededCandidateOrder(freshCandidates, seed);
    const selected = ordered.slice(
      0,
      resolveInvitationOfferCount({
        eligibleCandidateCount: ordered.length,
        invitationOfferBatchSize: policy.invitationOfferBatchSize,
      })
    );
    const auditId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await MainInvitationRequest.findOne({
          _id: request._id,
          status: { $in: ["SEARCHING", "OFFERED"] },
        }).session(session);
        if (!current) return;
        const activeOffer = await MainInvitationOffer.exists({
          invitationRequestId: current._id,
          status: "OFFERED",
        }).session(session);
        if (activeOffer) return;
        await ArenaOpponentSelectionAudit.create(
          [
            {
              _id: auditId,
              requestId: `MAIN:INVITATION:REFRESH:${current._id}:${now.getTime()}`,
              division: "MAIN",
              selectionType: "MAIN_LOWER_INVITATION_BATCH",
              requesterUserId: current.initiatorUserId,
              targetTier: current.targetTier,
              candidateUserIds: freshCandidates.map((candidate) => candidate.userId),
              selectedUserIds: selected.map((candidate) => candidate.userId),
              candidatePoolHash: candidatePoolHash(freshCandidates.map((candidate) => candidate.userId)),
              randomSelectionSeed: seed,
              policyVersionCode: policy.code,
              selectedAt: now,
            },
          ],
          { session, ordered: true }
        );
        await MainInvitationOffer.create(
          selected.map((candidate) => ({
            invitationRequestId: current._id,
            candidateUserId: candidate.userId,
            selectionAuditId: auditId,
            status: "OFFERED",
            offeredAt: now,
          })),
          { session, ordered: true }
        );
        current.status = "OFFERED";
        current.selectedCandidateId = selected[0].userId;
        current.candidatePoolSnapshot = freshCandidates.map((candidate) => candidate.userId);
        current.candidatePoolHash = candidatePoolHash(freshCandidates.map((candidate) => candidate.userId));
        current.randomSelectionSeed = seed;
        current.selectedAt = now;
        await current.save({ session });
      });
      refreshed.push(request._id);
    } finally {
      await session.endSession();
    }
  }
  return refreshed;
}

async function synchronizeMainInvitationPauseState({ now = new Date() } = {}) {
  const locked = isSundayMatchRequestLocked(now, "MAIN");
  const transitionDateKey = kstDateKey(now);
  if (locked) {
    const requests = await MainInvitationRequest.find({
      status: { $in: ["SEARCHING", "OFFERED"] },
    }).select("_id").lean();
    const ids = requests.map((request) => request._id);
    if (ids.length) {
      await MainInvitationRequest.updateMany(
        { _id: { $in: ids } },
        { $set: { status: "PAUSED", pausedAt: now } }
      );
      await MainInvitationOffer.updateMany(
        { invitationRequestId: { $in: ids }, status: "OFFERED" },
        { $set: { status: "PAUSED" } }
      );
      await ArenaOutboxEvent.bulkWrite(
        ids.map((requestId) => ({
          updateOne: {
            filter: { idempotencyKey: `${requestId}:${transitionDateKey}:MainInvitationPaused` },
            update: {
              $setOnInsert: {
                eventType: "MainInvitationPaused",
                aggregateType: "MainInvitationRequest",
                aggregateId: requestId,
                idempotencyKey: `${requestId}:${transitionDateKey}:MainInvitationPaused`,
                payload: { pausedAt: now, reason: "SUNDAY_MATCH_REQUEST_LOCK" },
              },
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }
    return { paused: ids.length, resumed: 0 };
  }
  const paused = await MainInvitationRequest.find({ status: "PAUSED" }).select("_id").lean();
  let resumed = 0;
  for (const request of paused) {
    const offerCount = await MainInvitationOffer.countDocuments({
      invitationRequestId: request._id,
      status: "PAUSED",
    });
    await MainInvitationOffer.updateMany(
      { invitationRequestId: request._id, status: "PAUSED" },
      { $set: { status: "OFFERED" } }
    );
    await MainInvitationRequest.updateOne(
      { _id: request._id, status: "PAUSED" },
      { $set: { status: offerCount ? "OFFERED" : "SEARCHING", resumedAt: now } }
    );
    await ArenaOutboxEvent.findOneAndUpdate(
      { idempotencyKey: `${request._id}:${transitionDateKey}:MainInvitationResumed` },
      {
        $setOnInsert: {
          eventType: "MainInvitationResumed",
          aggregateType: "MainInvitationRequest",
          aggregateId: request._id,
          idempotencyKey: `${request._id}:${transitionDateKey}:MainInvitationResumed`,
          payload: {
            resumedAt: now,
            status: offerCount ? "OFFERED" : "SEARCHING",
          },
        },
      },
      { upsert: true }
    );
    resumed += 1;
  }
  return { paused: 0, resumed };
}

async function getMainArenaActionData({ userId, now = new Date() }) {
  const [actor, policy, activeMatch, sentInvitations, receivedOffers] =
    await Promise.all([
      loadMatchActorContext({ userId, division: "MAIN", now }),
      getActiveMainDivisionPolicy(now),
      findActiveMatchForUser({ userId }),
      MainInvitationRequest.find({
        initiatorUserId: userId,
        status: { $in: ["SEARCHING", "OFFERED", "PAUSED", "MATCH_FORMING"] },
      })
        .sort({ createdAt: -1 })
        .lean(),
      MainInvitationOffer.find({ candidateUserId: userId, status: "OFFERED" })
        .populate("invitationRequestId")
        .sort({ offeredAt: -1 })
        .lean(),
    ]);
  const currentIndex = actor.standing ? arenaTierIndex(actor.standing.arenaRank) : -1;
  const tiers = [
    "브론즈",
    "실버",
    "골드",
    "플래티넘",
    "에메랄드",
    "다이아몬드",
    "마스터",
    "그랜드마스터",
    "챌린저",
  ];
  const snapshot = mainPolicySnapshot(policy);
  return {
    eligible: actor.eligible,
    reasons: actor.reasons,
    currentTier: actor.standing?.arenaRank || null,
    availableLearningDays: Number(actor.accessCycle?.availableLearningDays || 0),
    policy: snapshot,
    activeMatch,
    sentInvitations,
    receivedOffers,
    upwardTargets: tiers
      .map((label, index) => ({ label, gap: index - currentIndex }))
      .filter((tier) => tier.gap >= 1 && tier.gap <= 3),
    lowerTargets: tiers
      .map((label, index) => ({ label, gap: currentIndex - index }))
      .filter((tier) => tier.gap >= 1 && tier.gap <= 3),
  };
}

module.exports = {
  cancelMainInvitation,
  cancelZeroAvailableMainInvitations,
  createMainLowerInvitation,
  createMainUpwardChallenge,
  getMainArenaActionData,
  listEligibleMainCandidates,
  refreshMainInvitationOffers,
  respondToMainInvitation,
  synchronizeMainInvitationPauseState,
  _testing: {
    candidatePoolHash,
    mainMatchKey,
    seededCandidateOrder,
    tierRelationship,
  },
};
