const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const { User } = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaCompetitiveProfile,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchParticipantLock,
  ArenaMatchmakingEntry,
  ArenaOutboxEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  ARENA_ONE_ON_ONE_START_LIMIT_MS,
  generateFriendlyOneOnOneQuestionsFromActiveData,
} = require("./arenaOneOnOneProblemBank");
const {
  buildGeneratedArenaProblemPackDraft,
  sealArenaProblemPackDraft,
} = require("./arenaProblemPackService");
const {
  findActiveMatchForUser,
  sameTestAccountCohort,
} = require("./arenaActiveMatchService");
const { kstSeasonKey } = require("./arenaTimeService");
const { assertMatchmakingOpen } = require("./arenaMatchmakingControlService");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const {
  arenaV2DifficultyPlan,
  ratingForArenaMode,
} = require("./arenaV2DifficultyService");
const {
  competitiveUnlockState,
  ensureArenaV2Profile,
  syncArenaV2PlacementProfile,
  tierForRating,
} = require("./arenaV2ProfileService");

const ACTIVE_MATCH_STATUSES = [
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
];

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toUpperCase();
  if (!['NORMAL', 'COMPETITIVE'].includes(mode)) {
    throw statusError(400, "일반전 또는 경쟁전을 선택해주세요.", "INVALID_ARENA_MODE");
  }
  return mode;
}

function shouldEnforceArenaIntegrityForMode(value) {
  return String(value || "").trim().toUpperCase() === "COMPETITIVE";
}

function activeQueueKey(userId) {
  return `ARENA2:${String(userId)}`;
}

function ratingWindow(entry, now = new Date()) {
  const waitedSeconds = Math.max(
    0,
    (new Date(now).getTime() - new Date(entry.joinedAt).getTime()) / 1000
  );
  return GOAT_ARENA_V2_CONFIG.matchmaking.windows.reduce(
    (gap, window) => (waitedSeconds >= window.afterSeconds ? window.ratingGap : gap),
    GOAT_ARENA_V2_CONFIG.matchmaking.windows[0].ratingGap
  );
}

function queueRating(profile, mode) {
  if (mode === "COMPETITIVE") return Math.max(0, Number(profile.rating) || 0);
  return Math.max(
    0,
    Number(profile.provisionalRating ?? profile.rating) || 1000
  );
}

async function assertArenaIntegrityEligible(userIds, now = new Date()) {
  const normalizedUserIds = (Array.isArray(userIds) ? userIds : [userIds])
    .filter((userId) => mongoose.isValidObjectId(userId));
  if (!normalizedUserIds.length) return;
  const states = await ArenaAccessState.find({
    userId: { $in: normalizedUserIds },
    $or: [
      { integrityStatus: "REVIEW_REQUIRED" },
      {
        integrityStatus: "RESTRICTED",
        $or: [
          { matchmakingRestrictedUntil: null },
          { matchmakingRestrictedUntil: { $gt: now } },
        ],
      },
    ],
  }).select("userId integrityStatus matchmakingRestrictedUntil").lean();
  if (states.length) {
    throw statusError(
      423,
      "무결성 검토 또는 이용 제한이 끝난 뒤 새 경기를 시작할 수 있습니다.",
      "ARENA_INTEGRITY_RESTRICTED"
    );
  }
}

async function assertQueueEligibility({ userId, mode, now = new Date() }) {
  await assertMatchmakingOpen({ now });
  if (mode === "COMPETITIVE" && !GOAT_ARENA_V2_CONFIG.asyncCompetitive.enabled) {
    throw statusError(
      404,
      "경쟁전은 현재 공개되지 않았습니다. 검증이 끝난 뒤 별도로 안내합니다.",
      "ARENA_COMPETITIVE_NOT_RELEASED"
    );
  }
  const [user, profile] = await Promise.all([
    User.findById(userId)
      .select("accountStatus isActive isTestAccount arenaTestMatchEnabled")
      .lean(),
    syncArenaV2PlacementProfile(userId),
    mode === "COMPETITIVE"
      ? assertArenaIntegrityEligible(userId, now)
      : Promise.resolve(),
  ]);
  if (!user || user.accountStatus !== "active" || user.isActive === false) {
    throw statusError(403, "활성 계정만 GOAT Arena를 이용할 수 있습니다.", "ARENA_ACCOUNT_INACTIVE");
  }
  if (mode === "COMPETITIVE" && !competitiveUnlockState(profile).unlocked) {
    throw statusError(
      403,
      "경쟁전은 일반전 3경기 완료와 배치 결과 확정 후 이용할 수 있습니다.",
      "COMPETITIVE_LOCKED"
    );
  }
  const activeMatch = await findActiveMatchForUser({ userId });
  if (activeMatch) {
    throw statusError(409, "진행 중인 경기를 먼저 완료해주세요.", "ARENA_ACTIVE_MATCH_EXISTS");
  }
  return { user, profile };
}

async function expireQueueEntries(now = new Date()) {
  const cutoff = new Date(now.getTime() - GOAT_ARENA_V2_CONFIG.matchmaking.entryTtlMs);
  await ArenaMatchmakingEntry.updateMany(
    { status: { $in: ["WAITING", "MATCHING"] }, heartbeatAt: { $lt: cutoff } },
    { $set: { status: "EXPIRED" }, $unset: { activeKey: 1 } }
  );
}

async function recentOpponentIds(userId, now = new Date()) {
  const windowMs = GOAT_ARENA_V2_CONFIG.matchmaking.recentOpponentWindowMs;
  if (!windowMs) return new Set();
  const matches = await ArenaMatch.find({
    arenaVersion: "2.0",
    gameMode: { $in: ["NORMAL", "COMPETITIVE"] },
    status: { $in: [...ACTIVE_MATCH_STATUSES, "SETTLED"] },
    createdAt: { $gte: new Date(now.getTime() - windowMs) },
    "normalAsync.enabled": { $ne: true },
    "competitiveAsync.enabled": { $ne: true },
    $or: [
      { "challenger.userId": userId },
      { "defender.userId": userId },
    ],
  })
    .select("challenger.userId defender.userId")
    .lean();
  return new Set(
    matches.map((match) =>
      String(match.challenger.userId) === String(userId)
        ? String(match.defender.userId)
        : String(match.challenger.userId)
    )
  );
}

function arenaV2MatchKey({ mode, leftEntryId, rightEntryId }) {
  const ids = [String(leftEntryId), String(rightEntryId)].sort();
  const digest = createHash("sha256")
    .update(`${mode}:${ids.join(":")}`, "utf8")
    .digest("hex");
  return `ARENA2:${mode}:${digest}`;
}

function participantDraft(userId) {
  return { userId };
}

async function generateArenaV2Pack({
  matchKey,
  mode,
  challenger,
  defender,
  challengerProfile,
  defenderProfile,
  now,
}) {
  const challengerTier = tierForRating(
    ratingForArenaMode(challengerProfile, mode)
  ).name;
  const defenderTier = tierForRating(
    ratingForArenaMode(defenderProfile, mode)
  ).name;
  const difficultyPlan = arenaV2DifficultyPlan({
    mode,
    challengerProfile,
    defenderProfile,
  });
  const generation = await generateFriendlyOneOnOneQuestionsFromActiveData({
    inviterTier: challengerTier,
    inviterDivision: mode === "COMPETITIVE" ? "MAIN" : "SUB",
    inviteeTier: defenderTier,
    inviteeDivision: mode === "COMPETITIVE" ? "MAIN" : "SUB",
    difficultyAnchorTier: difficultyPlan.tier,
    difficultyDivision: difficultyPlan.division,
    matchKey,
    participantUserIds: [challenger._id, defender._id],
  });
  const pairKey = `ARENA2_${String(generation.difficultyCode || difficultyPlan.difficultyCode).toUpperCase()}`;
  const pairLabel = `통합 수능 수학 · ${generation.pairLabel}`;
  generation.pairKey = pairKey;
  generation.pairLabel = pairLabel;
  return sealArenaProblemPackDraft(
    buildGeneratedArenaProblemPackDraft({
      generation,
      matchKey,
      generatedAt: now,
      scoringVersion: "ARENA2-SCORING-V1",
      division: mode === "COMPETITIVE" ? "MAIN" : "SUB",
      matchType: mode === "FRIENDLY" ? "FRIENDLY" : "NORMAL",
      pairOverride: { key: pairKey, label: pairLabel },
    }),
    { sealedAt: now, autoValidated: true }
  );
}

async function createArenaV2Match({
  challengerUserId,
  defenderUserId,
  mode,
  sourceId,
  now = new Date(),
  session = null,
}) {
  const normalizedMode = String(mode || "").toUpperCase();
  if (!["NORMAL", "COMPETITIVE", "FRIENDLY"].includes(normalizedMode)) {
    throw statusError(400, "경기 모드를 확인해주세요.", "INVALID_ARENA_MODE");
  }
  if (String(challengerUserId) === String(defenderUserId)) {
    throw statusError(400, "자기 자신과 경기를 시작할 수 없습니다.", "ARENA_SELF_MATCH");
  }
  await assertMatchmakingOpen({ now });
  // 경쟁전만 레이팅 보호를 위해 기존 무결성 제한을 적용한다. 일반전과
  // 지인 간 친선전은 풀이 원본만 보존하고 자동 검토 대상으로 삼지 않는다.
  if (shouldEnforceArenaIntegrityForMode(normalizedMode)) {
    await assertArenaIntegrityEligible([challengerUserId, defenderUserId], now);
  }
  const [challenger, defender] = await Promise.all([
    User.findById(challengerUserId).select("_id name isTestAccount arenaTestMatchEnabled accountStatus isActive").lean(),
    User.findById(defenderUserId).select("_id name isTestAccount arenaTestMatchEnabled accountStatus isActive").lean(),
  ]);
  const challengerProfile = await ensureArenaV2Profile(challengerUserId, { session });
  const defenderProfile = await ensureArenaV2Profile(defenderUserId, { session });
  if (
    !challenger || !defender ||
    challenger.accountStatus !== "active" || defender.accountStatus !== "active" ||
    challenger.isActive === false || defender.isActive === false ||
    !sameTestAccountCohort(challenger, defender)
  ) {
    throw statusError(409, "경기 상대를 확인할 수 없습니다.", "ARENA_OPPONENT_INVALID");
  }
  if (
    normalizedMode === "COMPETITIVE" &&
    (
      !competitiveUnlockState(challengerProfile).unlocked ||
      !competitiveUnlockState(defenderProfile).unlocked
    )
  ) {
    throw statusError(
      403,
      "양쪽 플레이어가 일반전 3경기와 배치 확정을 완료해야 경쟁전을 시작할 수 있습니다.",
      "COMPETITIVE_LOCKED"
    );
  }
  const matchKey = arenaV2MatchKey({
    mode: normalizedMode,
    leftEntryId: sourceId || challengerUserId,
    rightEntryId: sourceId ? `${sourceId}:${defenderUserId}` : defenderUserId,
  });
  const existing = await ArenaMatch.findOne({ matchKey }).lean();
  if (existing) return existing;
  const pack = await generateArenaV2Pack({
    matchKey,
    mode: normalizedMode,
    challenger,
    defender,
    challengerProfile,
    defenderProfile,
    now,
  });
  const ownSession = !session;
  const transactionSession = session || (await mongoose.startSession());
  let createdMatch;
  try {
    const create = async () => {
      await assertMatchmakingOpen({ session: transactionSession, claim: true, now });
      const problemPackId = new mongoose.Types.ObjectId();
      const matchId = new mongoose.Types.ObjectId();
      const division = normalizedMode === "NORMAL" ? "SUB" : "MAIN";
      const match = {
        _id: matchId,
        matchKey,
        arenaVersion: "2.0",
        gameMode: normalizedMode,
        division,
        seasonKey: kstSeasonKey(now),
        competitivePool: "ALL",
        matchType: normalizedMode === "FRIENDLY" ? "FRIENDLY" : "NORMAL",
        matchOrigin:
          normalizedMode === "FRIENDLY"
            ? "ARENA_2_FRIEND_INVITATION"
            : "ARENA_2_MATCHMAKING",
        requestInitiatorUserId: challenger._id,
        tierPairKey: pack.tierPairKey,
        tierPairLabel: pack.tierPairLabel,
        challenger: participantDraft(challenger._id),
        defender: participantDraft(defender._id),
        status: "READY",
        policyVersionCode: GOAT_ARENA_V2_CONFIG.rulesetVersion,
        problemPackId,
        problemPackVersion: pack.version,
        scoringVersion: pack.scoringVersion,
        timeLimitMs: pack.timeLimitMs,
        requestedAt: now,
        startDeadlineAt: new Date(now.getTime() + ARENA_ONE_ON_ONE_START_LIMIT_MS),
        readyAt: now,
        integrityStatus: "PENDING",
      };
      await ArenaProblemPack.create([{ ...pack, _id: problemPackId }], {
        session: transactionSession,
        ordered: true,
      });
      await ArenaMatch.create([match], { session: transactionSession, ordered: true });
      const answers = pack.questions.map((question) => ({
        questionKey: question.questionKey,
        value: "",
        revision: 0,
        lastChangedAt: null,
      }));
      await ArenaMatchAttempt.create(
        [
          {
            matchId,
            userId: challenger._id,
            role: "CHALLENGER",
            problemPackId,
            problemPackVersion: pack.version,
            variantCode: "COMMON",
            status: "READY",
            answers,
          },
          {
            matchId,
            userId: defender._id,
            role: "DEFENDER",
            problemPackId,
            problemPackVersion: pack.version,
            variantCode: "COMMON",
            status: "READY",
            answers,
          },
        ],
        { session: transactionSession, ordered: true }
      );
      await ArenaMatchParticipantLock.create(
        [challenger._id, defender._id].map((userId) => ({
          userId,
          matchId,
          acquiredAt: now,
        })),
        { session: transactionSession, ordered: true }
      );
      await ArenaOutboxEvent.create(
        [
          {
            eventType: "ArenaMatchCreated",
            aggregateType: "ArenaMatch",
            aggregateId: matchId,
            idempotencyKey: `${matchId}:ArenaMatchCreated`,
            payload: {
              arenaVersion: "2.0",
              gameMode: normalizedMode,
              division,
              competitivePool: "ALL",
              challengerUserId: challenger._id,
              defenderUserId: defender._id,
            },
          },
          {
            eventType: "ArenaMatchReady",
            aggregateType: "ArenaMatch",
            aggregateId: matchId,
            idempotencyKey: `${matchId}:ArenaMatchReady`,
            payload: {
              arenaVersion: "2.0",
              gameMode: normalizedMode,
              problemPackVersion: pack.version,
            },
          },
        ],
        { session: transactionSession, ordered: true }
      );
      createdMatch = match;
    };
    if (ownSession) await transactionSession.withTransaction(create);
    else await create();
    return createdMatch;
  } catch (error) {
    if (ownSession && Number(error?.code) === 11000) {
      const replay = await ArenaMatch.findOne({ matchKey }).lean();
      if (replay) return replay;
    }
    throw error;
  } finally {
    if (ownSession) await transactionSession.endSession();
  }
}

async function candidateEntries({ entry, user, now }) {
  const blockedOpponentIds = await recentOpponentIds(user._id, now);
  const gap = ratingWindow(entry, now);
  const maximumConfiguredGap = Math.max(
    gap,
    ...GOAT_ARENA_V2_CONFIG.matchmaking.windows.map((window) => window.ratingGap)
  );
  const candidates = await ArenaMatchmakingEntry.find({
    _id: { $ne: entry._id },
    userId: { $ne: user._id },
    mode: entry.mode,
    pool: "ALL",
    status: "WAITING",
    ratingSnapshot: {
      $gte: Math.max(0, entry.ratingSnapshot - maximumConfiguredGap),
      $lte: entry.ratingSnapshot + maximumConfiguredGap,
    },
  })
    .sort({ joinedAt: 1 })
    .limit(50)
    .lean();
  if (!candidates.length) return [];
  const busy = await ArenaMatchParticipantLock.find({
    userId: { $in: [user._id, ...candidates.map((item) => item.userId)] },
  }).select("userId").lean();
  const busyUsers = new Set(busy.map((lock) => String(lock.userId)));
  if (busyUsers.has(String(user._id))) return [];
  const users = await User.find({ _id: { $in: candidates.map((item) => item.userId) } })
    .select("_id isTestAccount arenaTestMatchEnabled accountStatus isActive")
    .lean();
  const userById = new Map(users.map((candidate) => [String(candidate._id), candidate]));
  return candidates
    .filter((candidate) => {
      const opponent = userById.get(String(candidate.userId));
      if (busyUsers.has(String(candidate.userId))) return false;
      if (!opponent || opponent.accountStatus !== "active" || opponent.isActive === false) return false;
      if (!sameTestAccountCohort(user, opponent)) return false;
      if (blockedOpponentIds.has(String(candidate.userId))) return false;
      const candidateGap = ratingWindow(candidate, now);
      return (
        Math.abs(Number(candidate.ratingSnapshot) - Number(entry.ratingSnapshot)) <=
        Math.max(gap, candidateGap)
      );
    })
    .sort((left, right) => {
      const distance = Math.abs(left.ratingSnapshot - entry.ratingSnapshot) -
        Math.abs(right.ratingSnapshot - entry.ratingSnapshot);
      return distance || new Date(left.joinedAt) - new Date(right.joinedAt);
    });
}

async function tryMatchEntry({ entry, user, now }) {
  const candidates = await candidateEntries({ entry, user, now });
  for (const candidate of candidates) {
    const session = await mongoose.startSession();
    let match = null;
    try {
      // Claim both queue entries and create the match in one transaction. A
      // crash cannot strand one player in MATCHING or create an unlinked match.
      await session.withTransaction(async () => {
        match = null;
        const pair = [entry._id, candidate._id].sort((left, right) =>
          String(left).localeCompare(String(right))
        );
        const claimed = await ArenaMatchmakingEntry.updateMany(
          { _id: { $in: pair }, status: "WAITING" },
          { $set: { status: "MATCHING", heartbeatAt: now } },
          { session }
        );
        if (claimed.modifiedCount !== 2) {
          throw statusError(409, "다른 매칭 요청이 먼저 처리되었습니다.", "ARENA_QUEUE_CLAIM_LOST");
        }
        match = await createArenaV2Match({
          challengerUserId: entry.userId,
          defenderUserId: candidate.userId,
          mode: entry.mode,
          sourceId: pair.map(String).join(":"),
          now,
          session,
        });
        await ArenaMatchmakingEntry.updateMany(
          { _id: { $in: pair }, status: "MATCHING" },
          {
            $set: { status: "MATCHED", matchId: match._id, matchedAt: now },
            $unset: { activeKey: 1 },
          },
          { session }
        );
      });
      if (match) return match;
    } catch (error) {
      if (Number(error?.code) === 11000 || error.code === "ARENA_QUEUE_CLAIM_LOST") continue;
      throw error;
    } finally {
      await session.endSession();
    }
  }
  return null;
}

async function joinArenaV2Queue({ userId, mode, now = new Date() }) {
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode === "NORMAL") {
    const { startAsyncNormalMatch } = require("./arenaAsyncNormalService");
    return startAsyncNormalMatch({ userId, now });
  }
  if (normalizedMode === "COMPETITIVE") {
    const { startAsyncCompetitiveMatch } = require("./arenaAsyncCompetitiveService");
    const result = await startAsyncCompetitiveMatch({ userId, now });
    return {
      entry: null,
      match: result.match,
      waiting: false,
      allowedRatingGap: result.allowedRatingGap,
      asynchronous: true,
    };
  }
  await expireQueueEntries(now);
  const { user, profile } = await assertQueueEligibility({
    userId,
    mode: normalizedMode,
    now,
  });
  let entry;
  try {
    entry = await ArenaMatchmakingEntry.findOneAndUpdate(
      { activeKey: activeQueueKey(userId) },
      { $setOnInsert: {
        userId,
        activeKey: activeQueueKey(userId),
        mode: normalizedMode,
        pool: "ALL",
        ratingSnapshot: queueRating(profile, normalizedMode),
        status: "WAITING",
        joinedAt: now,
        heartbeatAt: now,
      } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    entry = await ArenaMatchmakingEntry.findOne({ activeKey: activeQueueKey(userId) });
    if (!entry) throw error;
  }
  if (entry.mode !== normalizedMode) {
    throw statusError(409, "이미 다른 모드의 매칭을 찾고 있습니다.", "ARENA_QUEUE_MODE_CONFLICT");
  }
  await ArenaMatchmakingEntry.updateOne(
    { _id: entry._id, status: "WAITING" },
    { $set: { heartbeatAt: now, ratingSnapshot: queueRating(profile, normalizedMode) } }
  );
  if (await findActiveMatchForUser({ userId })) {
    await ArenaMatchmakingEntry.updateOne(
      { _id: entry._id, status: "WAITING" },
      { $set: { status: "CANCELLED" }, $unset: { activeKey: 1 } }
    );
    throw statusError(409, "진행 중인 경기를 먼저 완료해주세요.", "ARENA_ACTIVE_MATCH_EXISTS");
  }
  const match = await tryMatchEntry({ entry, user, now });
  const currentEntry = await ArenaMatchmakingEntry.findById(entry._id).lean();
  const matchedGame = match || (currentEntry?.status === "MATCHED"
    ? await ArenaMatch.findById(currentEntry.matchId).lean()
    : null);
  return {
    entry: currentEntry,
    match: matchedGame,
    waiting: !matchedGame,
    allowedRatingGap: ratingWindow(currentEntry || entry, now),
  };
}

async function cancelArenaV2Queue({ userId, now = new Date() }) {
  const entry = await ArenaMatchmakingEntry.findOneAndUpdate(
    {
      activeKey: activeQueueKey(userId),
      status: "WAITING",
    },
    {
      $set: { status: "CANCELLED", heartbeatAt: now },
      $unset: { activeKey: 1 },
    },
    { returnDocument: "after" }
  ).lean();
  if (!entry) {
    throw statusError(409, "취소할 수 있는 매칭 대기가 없습니다.", "ARENA_QUEUE_NOT_WAITING");
  }
  return entry;
}

async function getArenaV2QueueState({ userId, now = new Date(), rematch = true }) {
  // Polling is the existing presence signal for the queue. Refresh it before
  // expiring entries so a player actively waiting can exceed the search TTL.
  await ArenaMatchmakingEntry.updateOne(
    { activeKey: activeQueueKey(userId), status: "WAITING" },
    { $set: { heartbeatAt: now } }
  );
  await expireQueueEntries(now);
  const entry = await ArenaMatchmakingEntry.findOne({
    userId,
    status: { $in: ["WAITING", "MATCHING", "MATCHED"] },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!entry) return null;
  if (["WAITING", "MATCHING"].includes(entry.status) && await findActiveMatchForUser({ userId })) {
    await ArenaMatchmakingEntry.updateOne(
      { _id: entry._id, status: { $in: ["WAITING", "MATCHING"] } },
      { $set: { status: "CANCELLED" }, $unset: { activeKey: 1 } }
    );
    return null;
  }
  if (entry.status === "MATCHED") {
    const match = entry.matchId
      ? await ArenaMatch.findById(entry.matchId).select("status").lean()
      : null;
    return match && ACTIVE_MATCH_STATUSES.includes(match.status) ? entry : null;
  }
  if (rematch && entry.status === "WAITING") {
    const user = await User.findById(userId)
      .select("_id isTestAccount arenaTestMatchEnabled accountStatus isActive")
      .lean();
    const match = user ? await tryMatchEntry({ entry, user, now }) : null;
    if (match) {
      return ArenaMatchmakingEntry.findById(entry._id).lean();
    }
  }
  return entry;
}

module.exports = {
  ACTIVE_MATCH_STATUSES,
  activeQueueKey,
  assertArenaIntegrityEligible,
  assertQueueEligibility,
  cancelArenaV2Queue,
  createArenaV2Match,
  generateArenaV2Pack,
  expireQueueEntries,
  getArenaV2QueueState,
  joinArenaV2Queue,
  normalizeMode,
  ratingWindow,
  shouldEnforceArenaIntegrityForMode,
  _testing: Object.freeze({ recentOpponentIds }),
};
