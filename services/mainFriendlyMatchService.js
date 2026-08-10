const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  MainFriendlyInvitation,
} = require("../models/goatArenaModel");
const {
  arenaTupleFromStanding,
  findActiveMatchForUser,
  isSundayMatchRequestLocked,
  loadMatchActorContext,
  normalizeRequestId,
} = require("./arenaMatchService");
const { officialMatchStartDeadline } = require("./arenaDivisionRuleService");
const {
  generateFriendlyOneOnOneQuestionsFromActiveData,
} = require("./arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const { getActiveMainDivisionPolicy } = require("./arenaPolicyService");
const { kstSeasonKey } = require("./arenaStandingService");
const { burnAvailable } = require("./mainLearningDayService");
const { assertMatchmakingOpen } = require("./arenaMatchmakingControlService");

const FRIENDLY_FEE_DAYS = 1;
const FRIENDLY_INVITATION_MS = 24 * 60 * 60 * 1000;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function friendlyMatchKey({ invitationId, inviterUserId, requestId }) {
  const digest = createHash("sha256")
    .update(`MAIN:FRIENDLY:${invitationId}:${inviterUserId}:${requestId}`, "utf8")
    .digest("hex");
  return `MAIN:FRIENDLY:${digest}`;
}

function cycleBalanceAfter(cycle, state) {
  return {
    availableLearningDays: Number(state.availableLearningDays || 0),
    paybackScoreDays: Number(cycle.paybackScoreDays || 0),
    lockedLearningDays: Number(state.lockedLearningDays || 0),
    reservedLearningDays: Number(state.reservedLearningDays || 0),
  };
}

async function writeCycleState({ cycle, state, session }) {
  const updated = await AccessCycle.updateOne(
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
  if (!updated.modifiedCount) {
    throw statusError(
      409,
      "친선 경기 수수료 처리 중 학습일수 잔액이 변경되었습니다. 다시 시도해주세요.",
      "FRIENDLY_FEE_CONCURRENCY_CONFLICT"
    );
  }
}

async function recordFeeBurn({ userId, cycle, state, invitationId, now, session }) {
  await ArenaLearningDayLedger.create(
    [
      {
        userId,
        accessCycleId: cycle._id,
        idempotencyKey: `${invitationId}:FRIENDLY_MATCH_FEE_BURN:${userId}`,
        eventType: "FRIENDLY_MATCH_FEE_BURN",
        availableLearningDaysDelta: -FRIENDLY_FEE_DAYS,
        paybackScoreDaysDelta: 0,
        lockedLearningDaysDelta: 0,
        reservedLearningDaysDelta: 0,
        sourceBucket: "UNSPECIFIED",
        balanceAfter: cycleBalanceAfter(cycle, state),
        sourceType: "MainFriendlyInvitation",
        sourceId: invitationId,
        occurredAt: now,
        metadata: {
          division: "MAIN",
          feeDays: FRIENDLY_FEE_DAYS,
          purpose: "FRIENDLY_MATCH_ENTRY_FEE",
        },
      },
    ],
    { session, ordered: true }
  );
}

async function createFriendlyProblemPack({ inviter, invitee, matchKey, now }) {
  const generation = await generateFriendlyOneOnOneQuestionsFromActiveData({
    inviterTier: inviter.standing.arenaRank,
    inviterDivision: "MAIN",
    inviteeTier: invitee.standing.arenaRank,
    inviteeDivision: "MAIN",
    matchKey,
    participantUserIds: [inviter.user._id, invitee.user._id],
  });
  return sealArenaProblemPackDraft(
    buildGeneratedArenaProblemPackDraft({
      generation,
      matchKey,
      generatedAt: now,
      division: "MAIN",
      matchType: "FRIENDLY",
    }),
    { sealedAt: now, autoValidated: true }
  );
}

function participantDraft(context) {
  return {
    userId: context.user._id,
    standingId: context.standing._id,
    accessCycleId: context.accessCycle._id,
    tupleBefore: arenaTupleFromStanding(context.standing),
    stakeDays: 0,
  };
}

async function createFriendlyMatchArtifacts({
  invitation,
  inviter,
  invitee,
  policy,
  now,
  session,
}) {
  const matchKey = friendlyMatchKey({
    invitationId: invitation._id,
    inviterUserId: inviter.user._id,
    requestId: invitation.requestId,
  });
  const existing = await ArenaMatch.findOne({ matchKey }).session(session).lean();
  if (existing) return existing;

  const sealedPack = await createFriendlyProblemPack({ inviter, invitee, matchKey, now });
  const problemPackId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const match = {
    _id: matchId,
    matchKey,
    division: "MAIN",
    seasonKey: kstSeasonKey(now),
    competitivePool: "ALL",
    matchType: "FRIENDLY",
    matchOrigin: "MAIN_FRIENDLY_INVITATION",
    requestInitiatorUserId: inviter.user._id,
    friendlyInvitationId: invitation._id,
    targetTier: "FRIENDLY",
    tierPairKey: sealedPack.tierPairKey,
    tierPairLabel: sealedPack.tierPairLabel,
    challenger: participantDraft(inviter),
    defender: participantDraft(invitee),
    status: "READY",
    policyVersionCode: policy.code,
    divisionPolicyVersionId: policy._id,
    divisionPolicyVersionCode: policy.code,
    economySnapshot: {
      originalStakeDays: 0,
      normalStakeMode: "FRIENDLY_FEE_ONLY",
      challengerStakeDays: 0,
      defenderStakeDays: 0,
      feeDays: FRIENDLY_FEE_DAYS,
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
  await ArenaProblemPack.create([{ ...sealedPack, _id: problemPackId }], { session, ordered: true });
  await ArenaMatch.create([match], { session, ordered: true });
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
        userId: inviter.user._id,
        role: "CHALLENGER",
        problemPackId,
        problemPackVersion: sealedPack.version,
        status: "READY",
        answers,
      },
      {
        matchId,
        userId: invitee.user._id,
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
    [inviter.user._id, invitee.user._id].map((userId) => ({ userId, matchId, acquiredAt: now })),
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
          matchOrigin: "MAIN_FRIENDLY_INVITATION",
          matchType: "FRIENDLY",
          challengerUserId: inviter.user._id,
          defenderUserId: invitee.user._id,
          feeDays: FRIENDLY_FEE_DAYS,
        },
      },
      {
        eventType: "ArenaMatchReady",
        aggregateType: "ArenaMatch",
        aggregateId: matchId,
        idempotencyKey: `${matchId}:ArenaMatchReady`,
        payload: { problemPackVersion: sealedPack.version, matchType: "FRIENDLY" },
      },
    ],
    { session, ordered: true }
  );
  return match;
}

async function assertFriendlyParticipant({ userId, now, session = null }) {
  const context = await loadMatchActorContext({
    userId,
    division: "MAIN",
    now,
    session,
    requiredAvailableDays: FRIENDLY_FEE_DAYS,
  });
  if (!context.eligible) {
    throw statusError(
      409,
      "친선 경기는 활성 Ranked 이용 상태와 사용 가능한 학습일수 1일이 있는 사용자만 참가할 수 있습니다.",
      context.reasons[0] || "FRIENDLY_PARTICIPANT_NOT_ELIGIBLE"
    );
  }
  return context;
}

async function expirePendingMainFriendlyInvitations({ now = new Date() } = {}) {
  const result = await MainFriendlyInvitation.updateMany(
    { status: "PENDING", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED", respondedAt: now } }
  );
  return Number(result.modifiedCount || 0);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchMainFriendlyCandidates({ userId, nickname, now = new Date() }) {
  const query = String(nickname || "").trim();
  if (query.length < 2) return [];
  await assertFriendlyParticipant({ userId, now });
  const requester = await User.findById(userId)
    .select("isTestAccount arenaTestMatchEnabled")
    .lean();
  const candidates = await User.find({
    _id: { $ne: userId },
    accountStatus: "active",
    isActive: { $ne: false },
    // nameNormalized가 비어 있는 기존 가입자도 닉네임 검색에서 빠지지 않도록
    // 원본 닉네임을 함께 조회한다. 신규 가입자는 nameNormalized 인덱스를 탄다.
    $or: [
      { nameNormalized: { $regex: escapeRegex(query.toLowerCase()), $options: "i" } },
      { name: { $regex: escapeRegex(query), $options: "i" } },
    ],
  })
    .select("name username isTestAccount arenaTestMatchEnabled")
    .limit(12)
    .lean();
  const results = [];
  for (const candidate of candidates) {
    const sameCohort = Boolean(requester?.isTestAccount) === Boolean(candidate.isTestAccount) ||
      Boolean(requester?.arenaTestMatchEnabled && candidate.isTestAccount) ||
      Boolean(candidate.arenaTestMatchEnabled && requester?.isTestAccount);
    if (!sameCohort) continue;
    const [context, activeMatch] = await Promise.all([
      assertFriendlyParticipant({ userId: candidate._id, now }).catch(() => null),
      findActiveMatchForUser({ userId: candidate._id }),
    ]);
    if (!context?.eligible || activeMatch) continue;
    results.push({
      userId: String(candidate._id),
      nickname: String(candidate.name || candidate.username || "닉네임 미설정"),
      tier: context.standing?.arenaRank || "미배정",
      availableLearningDays: Number(context.accessCycle?.availableLearningDays || 0),
    });
  }
  return results;
}

async function getMainFriendlyMatchData({ userId, nickname = "", now = new Date() }) {
  await expirePendingMainFriendlyInvitations({ now });
  let participant = null;
  let eligibilityError = null;
  try {
    participant = await assertFriendlyParticipant({ userId, now });
  } catch (error) {
    eligibilityError = error;
  }
  const [searchResults, receivedInvitations, sentInvitations, activeMatch] = await Promise.all([
    participant && String(nickname || "").trim().length >= 2
      ? searchMainFriendlyCandidates({ userId, nickname, now })
      : Promise.resolve([]),
    MainFriendlyInvitation.find({ inviteeUserId: userId, status: "PENDING" })
      .populate("inviterUserId", "name username")
      .sort({ createdAt: -1 })
      .lean(),
    MainFriendlyInvitation.find({ inviterUserId: userId, status: "PENDING" })
      .populate("inviteeUserId", "name username")
      .sort({ createdAt: -1 })
      .lean(),
    findActiveMatchForUser({ userId }),
  ]);
  return {
    query: String(nickname || "").trim(),
    searchResults,
    receivedInvitations,
    sentInvitations,
    activeMatch,
    eligible: Boolean(participant),
    eligibilityReason: eligibilityError?.message || "",
    division: participant ? "MAIN" : "",
    feeDays: FRIENDLY_FEE_DAYS,
  };
}

async function createMainFriendlyInvitation({ userId, inviteeUserId, requestId, now = new Date() }) {
  const normalizedRequestId = normalizeRequestId(requestId);
  if (!mongoose.isValidObjectId(inviteeUserId) || String(inviteeUserId) === String(userId)) {
    throw statusError(400, "친선 경기 상대를 다시 선택해주세요.", "FRIENDLY_INVITEE_INVALID");
  }
  if (isSundayMatchRequestLocked(now, "MAIN")) {
    throw statusError(409, "일요일 14시 이후에는 신규 Arena 친선 경기를 만들 수 없습니다.", "SUNDAY_DIVISION_LOCK");
  }
  await expirePendingMainFriendlyInvitations({ now });
  await assertMatchmakingOpen();
  const [inviter, invitee, inviterActiveMatch, inviteeActiveMatch] = await Promise.all([
    assertFriendlyParticipant({ userId, now }),
    assertFriendlyParticipant({ userId: inviteeUserId, now }),
    findActiveMatchForUser({ userId }),
    findActiveMatchForUser({ userId: inviteeUserId }),
  ]);
  if (inviterActiveMatch || inviteeActiveMatch) {
    throw statusError(409, "진행 중인 경기가 있는 사용자는 친선 경기 초대를 만들 수 없습니다.", "FRIENDLY_ACTIVE_MATCH_EXISTS");
  }
  const duplicate = await MainFriendlyInvitation.findOne({
    status: "PENDING",
    $or: [
      { inviterUserId: userId },
      { inviteeUserId: userId },
      { inviterUserId: inviteeUserId },
      { inviteeUserId: inviteeUserId },
    ],
  }).lean();
  if (duplicate) {
    throw statusError(409, "나 또는 상대에게 이미 대기 중인 친선 경기 초대가 있습니다.", "FRIENDLY_INVITATION_PENDING");
  }
  const invitation = await MainFriendlyInvitation.findOneAndUpdate(
    { inviterUserId: userId, requestId: normalizedRequestId },
    {
      $setOnInsert: {
        requestId: normalizedRequestId,
        inviterUserId: userId,
        inviteeUserId,
        inviterStandingId: inviter.standing._id,
        inviteeStandingId: invitee.standing._id,
        status: "PENDING",
        feeDays: FRIENDLY_FEE_DAYS,
        expiresAt: new Date(now.getTime() + FRIENDLY_INVITATION_MS),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
  await ArenaOutboxEvent.findOneAndUpdate(
    { idempotencyKey: `${invitation._id}:MainFriendlyInvitationCreated` },
    {
      $setOnInsert: {
        eventType: "MainFriendlyInvitationCreated",
        aggregateType: "MainFriendlyInvitation",
        aggregateId: invitation._id,
        idempotencyKey: `${invitation._id}:MainFriendlyInvitationCreated`,
        payload: {
          invitationId: String(invitation._id),
          inviterUserId: String(userId),
          inviteeUserId: String(inviteeUserId),
        },
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return { invitation, replayed: false };
}

async function cancelMainFriendlyInvitation({ invitationId, userId, now = new Date() }) {
  const invitation = await MainFriendlyInvitation.findOneAndUpdate(
    { _id: invitationId, inviterUserId: userId, status: "PENDING" },
    { $set: { status: "CANCELLED", cancelledAt: now } },
    { returnDocument: "after" }
  ).lean();
  if (!invitation) {
    throw statusError(409, "취소할 수 있는 친선 경기 초대를 찾지 못했습니다.", "FRIENDLY_INVITATION_NOT_CANCELLABLE");
  }
  return { invitation };
}

async function respondToMainFriendlyInvitation({ invitationId, userId, response, now = new Date() }) {
  const normalizedResponse = String(response || "").trim().toUpperCase();
  if (!["ACCEPT", "DECLINE"].includes(normalizedResponse)) {
    throw statusError(400, "친선 경기 응답을 확인해주세요.", "FRIENDLY_RESPONSE_INVALID");
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const invitation = await MainFriendlyInvitation.findOne({
        _id: invitationId,
        inviteeUserId: userId,
      }).session(session);
      if (!invitation) throw statusError(404, "친선 경기 초대를 찾을 수 없습니다.", "FRIENDLY_INVITATION_NOT_FOUND");
      if (invitation.status !== "PENDING") {
        throw statusError(409, "이미 처리된 친선 경기 초대입니다.", "FRIENDLY_INVITATION_ALREADY_RESOLVED");
      }
      if (new Date(invitation.expiresAt).getTime() <= now.getTime()) {
        invitation.status = "EXPIRED";
        invitation.respondedAt = now;
        await invitation.save({ session });
        throw statusError(410, "친선 경기 초대 응답 시간이 지났습니다.", "FRIENDLY_INVITATION_EXPIRED");
      }
      if (normalizedResponse === "DECLINE") {
        invitation.status = "DECLINED";
        invitation.respondedAt = now;
        await invitation.save({ session });
        result = { invitation, declined: true };
        return;
      }
      if (isSundayMatchRequestLocked(now, "MAIN")) {
        throw statusError(409, "일요일 14시 이후에는 신규 Arena 친선 경기를 만들 수 없습니다.", "SUNDAY_DIVISION_LOCK");
      }
      await assertMatchmakingOpen({ session, claim: true, now });
      const inviter = await assertFriendlyParticipant({ userId: invitation.inviterUserId, now, session });
      const invitee = await assertFriendlyParticipant({ userId, now, session });
      const [inviterActive, inviteeActive] = await Promise.all([
        findActiveMatchForUser({ userId: inviter.user._id, session }),
        findActiveMatchForUser({ userId: invitee.user._id, session }),
      ]);
      if (inviterActive || inviteeActive) {
        throw statusError(409, "진행 중인 경기가 있어 친선 경기를 시작할 수 없습니다.", "FRIENDLY_ACTIVE_MATCH_EXISTS");
      }
      const inviterState = burnAvailable(inviter.accessCycle, FRIENDLY_FEE_DAYS);
      const inviteeState = burnAvailable(invitee.accessCycle, FRIENDLY_FEE_DAYS);
      await writeCycleState({ cycle: inviter.accessCycle, state: inviterState, session });
      await writeCycleState({ cycle: invitee.accessCycle, state: inviteeState, session });
      await recordFeeBurn({ userId: inviter.user._id, cycle: inviter.accessCycle, state: inviterState, invitationId: invitation._id, now, session });
      await recordFeeBurn({ userId: invitee.user._id, cycle: invitee.accessCycle, state: inviteeState, invitationId: invitation._id, now, session });
      const policy = await getActiveMainDivisionPolicy(now);
      const match = await createFriendlyMatchArtifacts({ invitation, inviter, invitee, policy, now, session });
      invitation.status = "ACCEPTED";
      invitation.respondedAt = now;
      invitation.matchId = match._id;
      await invitation.save({ session });
      result = { invitation, match };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function settleMainFriendlyMatch({ matchId, now = new Date(), forcedWinnerRole = null, automaticReason = "" }) {
  const { settleMainFriendlyMatchResult } = require("./mainFriendlySettlementService");
  return settleMainFriendlyMatchResult({ matchId, now, forcedWinnerRole, automaticReason });
}

async function cancelMainFriendlyNoStart({ matchId, now = new Date() }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!match) throw statusError(404, "친선 경기를 찾을 수 없습니다.", "FRIENDLY_MATCH_NOT_FOUND");
      if (match.status === "CANCELLED") { result = { cancelled: true, replayed: true }; return; }
      if (match.matchType !== "FRIENDLY") throw statusError(409, "친선 경기만 취소할 수 있습니다.", "FRIENDLY_MATCH_TYPE_INVALID");
      match.status = "CANCELLED";
      match.resolvedAt = now;
      match.settledAt = now;
      match.integrityStatus = "CLEAR";
      match.resultSnapshot = {
        scoringPolicyVersion: match.scoringVersion,
        settlementSummary: { tupleAction: "KEEP", reason: "FRIENDLY_START_DEADLINE", feeDays: FRIENDLY_FEE_DAYS },
        resolvedAt: now,
      };
      await match.save({ session });
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      result = { cancelled: true, matchId: String(match._id) };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  FRIENDLY_FEE_DAYS,
  cancelMainFriendlyInvitation,
  cancelMainFriendlyNoStart,
  createMainFriendlyInvitation,
  expirePendingMainFriendlyInvitations,
  getMainFriendlyMatchData,
  respondToMainFriendlyInvitation,
  searchMainFriendlyCandidates,
  settleMainFriendlyMatch,
  assertFriendlyParticipant,
};
