"use strict";
const { retainArenaEvidence } = require("./arenaEvidenceRetentionService");

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const {
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestIdentity,
  ArenaGuestSolutionBoard,
  ArenaCompetitiveProfile,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const { ARENA_ONE_ON_ONE_TIME_LIMIT_MS } = require("./arenaOneOnOneProblemBank");
const { compareCountThenTimePerformance } = require("./arenaCompetitiveScoringService");
const { exactSourceRates, performanceForAttempt } = require("./arenaAsyncCompetitiveService");
const { buildEvidenceFiles, discardArenaEvidenceFiles } = require("./arenaMatchEvidenceService");
const { destroyStoredAsset, signedStoredAssetUrl } = require("./fileStorageService");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const {
  arenaV2DifficultyPlan,
  effectiveArenaRating,
} = require("./arenaV2DifficultyService");
const { normalizeBirthDate } = require("./identityRiskService");
const { nicknameKey, validateNickname } = require("./nicknameService");
const { memberEvidenceWithSavedBoards, guestFilesWithSavedBoards } = require("./arenaSolutionEvidenceReadService");
const {
  bindGuestNicknameToUser,
  releaseNickname,
  reserveGuestNickname,
  reserveUserNickname,
  unlinkGuestNicknameFromUser,
} = require("./nicknameNamespaceService");

const GUEST_COOKIE_NAME = "matths_arena_guest";
const GUEST_CHALLENGE_EVIDENCE_HOLD = "GUEST_CHALLENGE_ARCHIVE";

function statusError(status, message, code = "") {
  return Object.assign(new Error(message), { status, code });
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function id(value) {
  return String(value?._id || value || "");
}

function guestIdentitySecret() {
  const secret = String(
    process.env.IDENTITY_MATCH_SECRET || process.env.SECRET || ""
  );
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("게스트 생년월일 확인을 위한 IDENTITY_MATCH_SECRET 또는 SECRET이 필요합니다.");
  }
  return secret || "matths-local-arena-guest-identity-key";
}

function guestBirthDateDigest(value) {
  let dateKey;
  try {
    ({ dateKey } = normalizeBirthDate(value));
  } catch (_error) {
    throw statusError(400, "생년월일을 정확히 입력해주세요.", "ARENA_GUEST_BIRTH_DATE_INVALID");
  }
  return crypto
    .createHmac("sha256", guestIdentitySecret())
    .update(`arena-guest-birthdate-v1:${dateKey}`)
    .digest("hex");
}

function birthDateMatches(identity, digest) {
  return Boolean(identity?.birthDateHash && safeEqual(identity.birthDateHash, digest));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((result, item) => {
    const index = item.indexOf("=");
    if (index < 1) return result;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch (_error) { result[key] = value; }
    return result;
  }, {});
}

function cookieProof(cookieHeader) {
  const raw = parseCookies(cookieHeader)[GUEST_COOKIE_NAME] || "";
  const [identityId, secret] = raw.split(".");
  return mongoose.isValidObjectId(identityId) && secret ? { identityId, secret } : null;
}

function restorableGuestCookieSecret(identity) {
  if (!identity?._id || !identity?.birthDateHash || identity.claimedByUserId || identity.anonymizedAt) return "";
  return crypto
    .createHmac("sha256", guestIdentitySecret())
    .update(Number(identity.proofGeneration || 0) > 0
      ? `arena-guest-cookie-v2:${id(identity)}:${identity.birthDateHash}:${identity.proofGeneration}`
      : `arena-guest-cookie-v1:${id(identity)}:${identity.birthDateHash}`)
    .digest("base64url");
}

function guestCookieProofMatches(identity, secret) {
  if (!identity || !secret || identity.claimedByUserId || identity.anonymizedAt) return false;
  const expiresAt = identity.proofExpiresAt || new Date(new Date(identity.createdAt || identity.firstChallengeAcceptedAt || 0).getTime() + 365 * 24 * 60 * 60 * 1000);
  if (new Date(expiresAt).getTime() <= Date.now()) return false;
  const storedSecretMatches = Boolean(
    identity.claimSecretHash && safeEqual(identity.claimSecretHash, hash(secret))
  );
  const restoredSecret = restorableGuestCookieSecret(identity);
  return storedSecretMatches || Boolean(restoredSecret && safeEqual(restoredSecret, secret));
}

async function verifiedIdentity(
  cookieHeader,
  { selectSecret = false, viewerUserId = null } = {}
) {
  if (viewerUserId && mongoose.isValidObjectId(viewerUserId)) {
    const accountQuery = ArenaGuestIdentity.findOne({ claimedByUserId: viewerUserId });
    if (selectSecret) accountQuery.select("+claimSecretHash +birthDateHash");
    const accountIdentity = await accountQuery;
    if (accountIdentity) return accountIdentity;
  }
  const proof = cookieProof(cookieHeader);
  if (!proof) return null;
  const query = ArenaGuestIdentity.findById(proof.identityId)
    .select("+claimSecretHash +birthDateHash");
  const identity = await query;
  if (!identity) return null;
  return guestCookieProofMatches(identity, proof.secret) ? identity : null;
}

async function challengeByToken(rawToken, { now = new Date() } = {}) {
  const token = String(rawToken || "").trim();
  if (token.length < 32 || token.length > 128) {
    throw statusError(404, "도전장 링크를 찾을 수 없습니다.", "ARENA_GUEST_CHALLENGE_NOT_FOUND");
  }
  const challenge = await ArenaGuestChallenge.findOne({ tokenHash: hash(token) }).select("+tokenHash");
  if (!challenge || !safeEqual(challenge.tokenHash, hash(token)) || challenge.status === "REVOKED") {
    throw statusError(404, "도전장 링크를 찾을 수 없습니다.", "ARENA_GUEST_CHALLENGE_NOT_FOUND");
  }
  if (challenge.status === "OPEN" && new Date(challenge.expiresAt) <= now) {
    challenge.status = "EXPIRED";
    await challenge.save();
  }
  return challenge;
}

async function memberChallengeDifficultySnapshot({ creatorUserId, match = null, pack }) {
  const profile = await ArenaCompetitiveProfile.findOne({ userId: creatorUserId }).lean();
  const sourceMode = String(match?.gameMode || "NORMAL").toUpperCase();
  const storedRating = sourceMode === "COMPETITIVE"
    ? Number(match?.competitiveAsync?.challengerRatingBefore?.rating)
    : Number(match?.normalAsync?.matchmakingRating);
  const fallbackRating = sourceMode === "COMPETITIVE"
    ? effectiveArenaRating(profile)
    : effectiveArenaRating(
        profile,
        GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating,
        { includeNormal: true, preferNormal: true }
      );
  const rating = Number.isFinite(storedRating) && storedRating >= 0
    ? storedRating
    : fallbackRating;
  const plan = arenaV2DifficultyPlan({
    mode: sourceMode,
    challengerProfile: { rating },
    defenderProfile: { rating },
  });
  const packDifficultyCode = String(pack?.difficultyCode || "").toUpperCase();
  if (packDifficultyCode && packDifficultyCode !== plan.difficultyCode) {
    throw statusError(
      409,
      "경기 당시 발신자의 MMR 기준으로 생성된 문제만 도전장으로 공유할 수 있습니다.",
      "ARENA_GUEST_SOURCE_DIFFICULTY_MISMATCH"
    );
  }
  return {
    creatorRatingSnapshot: plan.rating,
    difficultyCodeSnapshot: packDifficultyCode || plan.difficultyCode,
    difficultyPolicy: plan.policy,
  };
}

async function createGuestChallenge({ creatorUserId, sourceMatchId, now = new Date() }) {
  const match = await ArenaMatch.findOne({
    _id: sourceMatchId,
    arenaVersion: "2.0",
    gameMode: { $in: ["NORMAL", "COMPETITIVE"] },
    status: "SETTLED",
    "challenger.userId": creatorUserId,
    $or: [
      { gameMode: "NORMAL", "resultSnapshot.settlementSummary.valid": { $ne: false } },
      { gameMode: "COMPETITIVE", integrityStatus: "CLEAR" },
    ],
  }).lean();
  if (!match) {
    throw statusError(409, "정상 완료한 내 일반전 또는 경쟁전 기록에서만 도전장 링크를 만들 수 있습니다.", "ARENA_GUEST_SOURCE_INVALID");
  }
  const attempt = await ArenaMatchAttempt.findOne({ matchId: match._id, userId: creatorUserId, status: "SUBMITTED" }).lean();
  const [evidence, pack] = await Promise.all([
    ArenaMatchEvidence.findOne({ matchId: match._id, attemptId: attempt?._id, originalEvidenceSubmitted: true }).lean(),
    ArenaProblemPack.findById(attempt?.problemPackId).select("+questions").lean(),
  ]);
  if (!attempt || !evidence?.files?.length || evidence.contentPurgedAt || pack?.questions?.length !== 5) {
    throw statusError(409, "문제 5개와 필수 풀이 원본이 보존된 경기만 공유할 수 있습니다.", "ARENA_GUEST_SOURCE_INCOMPLETE");
  }
  const difficultySnapshot = await memberChallengeDifficultySnapshot({
    creatorUserId,
    match,
    pack,
  });
  const sourceRates = match.gameMode === "NORMAL"
    ? require("./arenaAsyncNormalService").normalSourceRates(pack)
    : exactSourceRates(pack);
  const sourcePerformance = performanceForAttempt({ attempt, problemPack: pack, sourceRates }).performance;
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const challengeId = new mongoose.Types.ObjectId();
  const session = await mongoose.startSession();
  let challenge;
  try {
    await session.withTransaction(async () => {
      await retainArenaEvidence({ evidenceId: evidence._id, referenceKey: `GUEST:${challengeId}`, now, session });
    [challenge] = await ArenaGuestChallenge.create([{
    _id: challengeId,
    sourceKind: "ARENA_MATCH",
    tokenHash: hash(rawToken),
    creatorUserId,
    sourceMatchId: match._id,
    sourceAttemptId: attempt._id,
    sourceEvidenceId: evidence._id,
    sourceProblemPackId: pack._id,
    sourcePerformance,
    ...difficultySnapshot,
    status: "OPEN",
    expiresAt: new Date(now.getTime() + GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlMs),
    }], { session, ordered: true });
    });
  } finally { await session.endSession(); }

  return {
    id: String(challenge._id),
    token: rawToken,
    relativeUrl: `/arena-invite/${encodeURIComponent(rawToken)}`,
    expiresAt: challenge.expiresAt,
  };
}

async function sourceEvidenceFiles(challenge) {
  if (challenge?.sourceKind === "GUEST_ATTEMPT") {
    const sourceAttempt = await ArenaGuestChallengeAttempt.findOne({
      _id: challenge.sourceGuestAttemptId,
      status: "SETTLED",
    }).lean();
    return guestFilesWithSavedBoards(sourceAttempt);
  }
  const evidence = await ArenaMatchEvidence.findById(challenge?.sourceEvidenceId).lean();
  const attempt = await ArenaMatchAttempt.findById(challenge?.sourceAttemptId).lean();
  return (await memberEvidenceWithSavedBoards(evidence, attempt))?.files || [];
}

async function createGuestChallengeFromClaimedAttempt({
  creatorUserId,
  guestAttemptId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(guestAttemptId)) {
    throw statusError(404, "연결된 게스트 경기 기록을 찾을 수 없습니다.", "ARENA_GUEST_RECORD_NOT_FOUND");
  }
  const attempt = await ArenaGuestChallengeAttempt.findOne({
    _id: guestAttemptId,
    status: "SETTLED",
  }).lean();
  const identity = attempt
    ? await ArenaGuestIdentity.findOne({
        _id: attempt.guestIdentityId,
        claimedByUserId: creatorUserId,
      }).lean()
    : null;
  const pack = attempt
    ? await ArenaProblemPack.findById(attempt.problemPackId).select("+questions").lean()
    : null;
  const sourceChallenge = attempt
    ? await ArenaGuestChallenge.findById(attempt.challengeId).lean()
    : null;
  if (!attempt || !identity) {
    throw statusError(404, "연결된 게스트 경기 기록을 찾을 수 없습니다.", "ARENA_GUEST_RECORD_NOT_FOUND");
  }
  if (pack?.questions?.length !== 5 || !attempt.performance || !attempt.evidenceFiles?.length) {
    throw statusError(409, "문제 5개와 필수 풀이 원본이 보존된 완료 기록만 역도전장으로 만들 수 있습니다.", "ARENA_GUEST_SOURCE_INCOMPLETE");
  }
  const profile = await ArenaCompetitiveProfile.findOne({ userId: creatorUserId }).lean();
  const storedMemberRating = profile?.rating ?? profile?.provisionalRating;
  const hasMemberRating =
    storedMemberRating !== null &&
    storedMemberRating !== undefined &&
    storedMemberRating !== "" &&
    Number.isFinite(Number(storedMemberRating));
  const difficultySnapshot = hasMemberRating
    ? await memberChallengeDifficultySnapshot({ creatorUserId, pack })
    : {
        creatorRatingSnapshot: sourceChallenge?.creatorRatingSnapshot ?? null,
        difficultyCodeSnapshot:
          String(sourceChallenge?.difficultyCodeSnapshot || pack?.difficultyCode || "").toUpperCase(),
        difficultyPolicy: sourceChallenge?.difficultyPolicy || "INHERITED_GUEST_ATTEMPT_V1",
      };
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const challenge = await ArenaGuestChallenge.create({
    sourceKind: "GUEST_ATTEMPT",
    tokenHash: hash(rawToken),
    creatorUserId,
    sourceGuestAttemptId: attempt._id,
    sourceProblemPackId: attempt.problemPackId,
    sourcePerformance: attempt.performance,
    ...difficultySnapshot,
    status: "OPEN",
    expiresAt: new Date(now.getTime() + GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlMs),
  });
  return {
    id: String(challenge._id),
    token: rawToken,
    relativeUrl: `/arena-invite/${encodeURIComponent(rawToken)}`,
    expiresAt: challenge.expiresAt,
  };
}

async function assertNicknameAvailableToGuest(nickname, allowedIdentityId = null) {
  const validation = validateNickname(nickname);
  if (!validation.valid) throw statusError(400, validation.message, "ARENA_GUEST_NICKNAME_INVALID");
  const normalized = nicknameKey(validation.nickname);
  const escaped = validation.nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [userConflict, guestConflict] = await Promise.all([
    User.exists({ $or: [{ nameNormalized: normalized }, { name: { $regex: `^${escaped}$`, $options: "i" } }] }),
    ArenaGuestIdentity.findOne({
      nicknameNormalized: normalized,
      ...(allowedIdentityId ? { _id: { $ne: allowedIdentityId } } : {}),
    }).lean(),
  ]);
  if (userConflict || guestConflict) {
    throw statusError(409, "이미 사용 중인 닉네임입니다.", "ARENA_GUEST_NICKNAME_TAKEN");
  }
  return { nickname: validation.nickname, nicknameNormalized: normalized };
}

async function createGuestIdentityWithNicknameReservation({
  nickname,
  nicknameNormalized,
  claimSecretHash,
  birthDateHash,
  firstChallengeAcceptedAt,
  claimedByUserId = null,
  claimedAt = null,
  lastSeenAt,
}) {
  const guestIdentityId = new mongoose.Types.ObjectId();
  const session = await mongoose.startSession();
  let identity = null;
  try {
    await session.withTransaction(async () => {
      if (claimedByUserId) {
        await reserveUserNickname({
          nickname,
          nicknameNormalized,
          userId: claimedByUserId,
          session,
        });
      } else {
        await reserveGuestNickname({
          nickname,
          nicknameNormalized,
          guestIdentityId,
          session,
        });
      }
      [identity] = await ArenaGuestIdentity.create([{
        _id: guestIdentityId,
        nickname,
        nicknameNormalized,
        claimSecretHash,
        birthDateHash,
        firstChallengeAcceptedAt,
        proofGeneration: 1,
        proofExpiresAt: new Date(new Date(firstChallengeAcceptedAt).getTime() + 365 * 24 * 60 * 60 * 1000),
        claimedByUserId,
        claimedAt,
        lastSeenAt,
      }], { session });
      if (claimedByUserId) {
        await bindGuestNicknameToUser({
          nickname,
          nicknameNormalized,
          guestIdentityId,
          userId: claimedByUserId,
          session,
        });
      }
    });
    identity?.$session?.(null);
    return identity;
  } finally {
    await session.endSession();
  }
}

async function discardFreshGuestIdentity(identity) {
  if (!identity?._id) return;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ArenaGuestIdentity.deleteOne(
        {
          _id: identity._id,
          ...(identity.claimedByUserId
            ? { claimedByUserId: identity.claimedByUserId }
            : { claimedByUserId: null }),
        },
        { session }
      );
      if (!identity.claimedByUserId) {
        await releaseNickname({
          nicknameNormalized: identity.nicknameNormalized,
          ownerKind: "GUEST",
          ownerId: identity._id,
          session,
        });
      } else {
        await unlinkGuestNicknameFromUser({
          nicknameNormalized: identity.nicknameNormalized,
          guestIdentityId: identity._id,
          userId: identity.claimedByUserId,
          session,
        });
      }
    });
  } finally {
    await session.endSession();
  }
}

async function latestAttemptForIdentity({ challengeId, guestIdentityId }) {
  if (!challengeId || !guestIdentityId) return null;
  return ArenaGuestChallengeAttempt.findOne({ challengeId, guestIdentityId })
    .sort({ attemptNumber: -1, _id: -1 });
}

async function ensureInitialAttempt({ challenge, identity }) {
  const existing = await latestAttemptForIdentity({
    challengeId: challenge._id,
    guestIdentityId: identity._id,
  });
  if (existing) return existing;
  try {
    return await ArenaGuestChallengeAttempt.create({
      challengeId: challenge._id,
      guestIdentityId: identity._id,
      claimedByUserId: identity.claimedByUserId || null,
      attemptNumber: 1,
      status: "READY",
      problemPackId: challenge.sourceProblemPackId,
      answers: [],
    });
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    const replayed = await latestAttemptForIdentity({
      challengeId: challenge._id,
      guestIdentityId: identity._id,
    });
    if (!replayed) throw error;
    return replayed;
  }
}

async function getGuestNicknameAvailability({
  rawToken,
  nickname,
  birthDate,
  cookieHeader,
  viewerUserId = null,
  now = new Date(),
}) {
  const challenge = await challengeByToken(rawToken, { now });
  if (viewerUserId && String(viewerUserId) === String(challenge.creatorUserId)) {
    return {
      valid: true,
      available: false,
      message: "도전장 발신자는 참가자 명단에 중복 참여할 수 없습니다.",
      nickname: validateNickname(nickname).nickname,
    };
  }
  const validation = validateNickname(nickname);
  if (!validation.valid) {
    return {
      valid: false,
      available: false,
      message: validation.message,
      nickname: validation.nickname,
    };
  }
  let requestedBirthDateHash;
  try {
    requestedBirthDateHash = guestBirthDateDigest(birthDate);
  } catch (error) {
    return {
      valid: false,
      available: false,
      message: error.message,
      nickname: validation.nickname,
    };
  }

  const requestedNickname = nicknameKey(validation.nickname);
  let member = null;
  if (viewerUserId && mongoose.isValidObjectId(viewerUserId)) {
    member = await User.findById(viewerUserId)
      .select("name nameNormalized +birthDate")
      .lean();
    const memberNickname = nicknameKey(member?.nameNormalized || member?.name);
    if (!member || !memberNickname || requestedNickname !== memberNickname) {
      return {
        valid: true,
        available: false,
        message: "로그인한 계정의 닉네임을 입력해주세요.",
        nickname: validation.nickname,
      };
    }
    const memberBirthDateHash = member.birthDate
      ? guestBirthDateDigest(member.birthDate.toISOString().slice(0, 10))
      : "";
    if (!memberBirthDateHash || !safeEqual(memberBirthDateHash, requestedBirthDateHash)) {
      return {
        valid: true,
        available: false,
        message: "계정에 등록한 생년월일과 일치하지 않습니다.",
        nickname: validation.nickname,
      };
    }
  }
  const existingIdentity = await ArenaGuestIdentity.findOne({
    nicknameNormalized: requestedNickname,
  }).select("+birthDateHash");
  const existingAttempt = existingIdentity
    ? await latestAttemptForIdentity({
        challengeId: challenge._id,
        guestIdentityId: existingIdentity._id,
      })
    : null;
  if (existingIdentity) {
    const matches = birthDateMatches(existingIdentity, requestedBirthDateHash);
    const accountOwnerMatches = !viewerUserId || (
      existingIdentity.claimedByUserId &&
      String(existingIdentity.claimedByUserId) === String(viewerUserId)
    );
    return {
      valid: true,
      available: matches && accountOwnerMatches &&
        (challenge.status !== "EXPIRED" || Boolean(existingAttempt)),
      reentry: matches && accountOwnerMatches && Boolean(existingAttempt),
      message: !accountOwnerMatches
        ? "이미 다른 계정에 연결된 닉네임입니다."
        : !matches
          ? "이미 사용 중인 닉네임이거나 생년월일이 일치하지 않습니다."
        : challenge.status === "EXPIRED" && !existingAttempt
          ? "도전장 참여 시간이 종료되었습니다."
          : existingAttempt?.status === "SETTLED"
            ? "완료한 기록이 있습니다. 입장하면 순위표로 이동합니다."
            : existingAttempt
              ? "기존 참가 기록을 이어서 볼 수 있습니다."
              : "확인된 닉네임으로 참가할 수 있습니다.",
      nickname: validation.nickname,
    };
  }
  if (challenge.status === "EXPIRED") {
    return {
      valid: true,
      available: false,
      message: "도전장 참여 시간이 종료되었습니다.",
      nickname: validation.nickname,
    };
  }
  if (member) {
    return {
      valid: true,
      available: true,
      message: "계정 닉네임과 생년월일로 참여할 수 있습니다.",
      nickname: validation.nickname,
    };
  }
  try {
    const clean = await assertNicknameAvailableToGuest(validation.nickname);
    return {
      valid: true,
      available: true,
      message: "사용 가능한 닉네임입니다.",
      nickname: clean.nickname,
    };
  } catch (error) {
    if (["ARENA_GUEST_NICKNAME_INVALID", "ARENA_GUEST_NICKNAME_TAKEN"].includes(error.code)) {
      return {
        valid: error.code !== "ARENA_GUEST_NICKNAME_INVALID",
        available: false,
        message: error.code === "ARENA_GUEST_NICKNAME_TAKEN"
          ? "사용 불가능한 닉네임입니다."
          : error.message,
        nickname: validation.nickname,
      };
    }
    throw error;
  }
}

async function claimGuestChallenge({
  rawToken,
  nickname,
  birthDate,
  cookieHeader,
  viewerUserId = null,
  now = new Date(),
}) {
  const challenge = await challengeByToken(rawToken, { now });
  if (viewerUserId && String(viewerUserId) === String(challenge.creatorUserId)) {
    throw statusError(
      409,
      "도전장 발신자는 자신의 도전장에 참가자로 중복 참여할 수 없습니다.",
      "ARENA_GUEST_CREATOR_CANNOT_JOIN"
    );
  }
  const validation = validateNickname(nickname);
  if (!validation.valid) {
    throw statusError(400, validation.message, "ARENA_GUEST_NICKNAME_INVALID");
  }
  const requestedNickname = nicknameKey(validation.nickname);
  const requestedBirthDateHash = guestBirthDateDigest(birthDate);
  let identity = await ArenaGuestIdentity.findOne({
    nicknameNormalized: requestedNickname,
  }).select("+claimSecretHash +birthDateHash");
  if (identity?.claimedByUserId && String(identity.claimedByUserId) !== String(viewerUserId || "")) {
    throw statusError(409, "계정에 연결된 기록은 해당 계정으로 로그인해 계속해주세요.", "ARENA_GUEST_ALREADY_CLAIMED");
  }
  let existingAttempt = identity
    ? await latestAttemptForIdentity({
        challengeId: challenge._id,
        guestIdentityId: identity._id,
      })
    : null;
  let identityCreatedForAdmission = false;

  if (viewerUserId && mongoose.isValidObjectId(viewerUserId)) {
    const member = await User.findById(viewerUserId)
      .select("name nameNormalized +birthDate")
      .lean();
    const memberBirthDateHash = member?.birthDate
      ? guestBirthDateDigest(member.birthDate.toISOString().slice(0, 10))
      : "";
    if (!member || requestedNickname !== nicknameKey(member.nameNormalized || member.name)) {
      throw statusError(
        409,
        "로그인한 계정의 닉네임으로만 참여할 수 있습니다.",
        "ARENA_GUEST_MEMBER_NICKNAME_MISMATCH"
      );
    }
    if (!memberBirthDateHash || !safeEqual(memberBirthDateHash, requestedBirthDateHash)) {
      throw statusError(
        409,
        "계정에 등록한 생년월일과 일치하지 않습니다.",
        "ARENA_GUEST_MEMBER_BIRTH_DATE_MISMATCH"
      );
    }
    if (identity && String(identity.claimedByUserId || "") !== String(viewerUserId)) {
      throw statusError(
        409,
        "이미 다른 계정에 연결된 닉네임입니다.",
        "ARENA_GUEST_NICKNAME_TAKEN"
      );
    }
  }

  if (identity && !birthDateMatches(identity, requestedBirthDateHash)) {
    throw statusError(
      409,
      "이미 사용 중인 닉네임이거나 생년월일이 일치하지 않습니다.",
      "ARENA_GUEST_BIRTH_DATE_MISMATCH"
    );
  }
  if ((challenge.status === "EXPIRED" || new Date(challenge.expiresAt) <= now) && !existingAttempt) {
    throw statusError(410, "이 도전장 링크의 신규 참여 기간이 끝났습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }

  if (!identity && viewerUserId && mongoose.isValidObjectId(viewerUserId)) {
    try {
      identity = await createGuestIdentityWithNicknameReservation({
        nickname: validation.nickname,
        nicknameNormalized: requestedNickname,
        claimSecretHash: hash(crypto.randomBytes(32).toString("base64url")),
        birthDateHash: requestedBirthDateHash,
        firstChallengeAcceptedAt: now,
        claimedByUserId: viewerUserId,
        claimedAt: now,
        lastSeenAt: now,
      });
      identityCreatedForAdmission = true;
    } catch (error) {
      if (error?.code === "NICKNAME_NAMESPACE_TAKEN" || (Number(error?.code) === 11000 && error.keyPattern?.nicknameNormalized)) {
        throw statusError(
          409,
          "방금 다른 참가 요청이 이 닉네임 또는 계정 신원을 사용했습니다.",
          "ARENA_GUEST_NICKNAME_TAKEN"
        );
      }
      throw error;
    }
  } else if (!identity) {
    const clean = await assertNicknameAvailableToGuest(nickname);
    try {
      identity = await createGuestIdentityWithNicknameReservation({
        nickname: clean.nickname,
        nicknameNormalized: clean.nicknameNormalized,
        claimSecretHash: hash(crypto.randomBytes(32).toString("base64url")),
        birthDateHash: requestedBirthDateHash,
        firstChallengeAcceptedAt: now,
        lastSeenAt: now,
      });
      identityCreatedForAdmission = true;
    } catch (error) {
      if (error?.code === "NICKNAME_NAMESPACE_TAKEN" || (Number(error?.code) === 11000 && error.keyPattern?.nicknameNormalized)) {
        throw statusError(409, "방금 다른 게스트가 이 닉네임을 사용했습니다.", "ARENA_GUEST_NICKNAME_TAKEN");
      }
      if (Number(error?.code) === 11000 && error.keyPattern?.claimedByUserId) {
        throw statusError(503, "도전장 참여 기능을 준비 중입니다. 잠시 후 다시 시도하세요.", "ARENA_GUEST_IDENTITY_INDEX_NOT_READY");
      }
      throw error;
    }
  }
  if (!identity.claimedByUserId) {
    const expiry = identity.proofExpiresAt || new Date(new Date(identity.createdAt || identity.firstChallengeAcceptedAt || 0).getTime() + 365 * 24 * 60 * 60 * 1000);
    if (new Date(expiry) <= now) {
      identity.proofGeneration = Number(identity.proofGeneration || 0) + 1;
      identity.proofExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      await identity.save();
    }
  }
  existingAttempt = existingAttempt || await latestAttemptForIdentity({
    challengeId: challenge._id,
    guestIdentityId: identity._id,
  });
  const admitted = existingAttempt || await ArenaGuestChallenge.exists({
    _id: challenge._id,
    status: "OPEN",
    expiresAt: { $gt: now },
  });
  if (!admitted) {
    if (identityCreatedForAdmission) {
      await discardFreshGuestIdentity(identity).catch(() => {});
    }
    throw statusError(410, "이 도전장 링크의 신규 참여 기간이 끝났습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  identity.lastSeenAt = now;
  await identity.save();
  let attempt;
  try {
    attempt = existingAttempt || await ensureInitialAttempt({ challenge, identity });
  } catch (error) {
    if (identityCreatedForAdmission) {
      await discardFreshGuestIdentity(identity).catch(() => {});
    }
    throw error;
  }
  return {
    challenge,
    identity,
    attempt,
    cookieValue: viewerUserId
      ? null
      : `${identity._id}.${restorableGuestCookieSecret(identity)}`,
    replayed: Boolean(existingAttempt),
  };
}

async function authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId = null }) {
  const [challenge, identity] = await Promise.all([
    challengeByToken(rawToken),
    verifiedIdentity(cookieHeader, { viewerUserId }),
  ]);
  const attempt = identity
    ? await latestAttemptForIdentity({
        challengeId: challenge._id,
        guestIdentityId: identity._id,
      })
    : null;
  if (!identity || !attempt) {
    throw statusError(403, "이 도전장에 참여한 게스트 브라우저에서만 계속할 수 있습니다.", "ARENA_GUEST_PROOF_REQUIRED");
  }
  return { challenge, identity, attempt };
}

function guestChallengeAdmissionOpen(challenge, now = new Date()) {
  return challenge?.status !== "EXPIRED" && new Date(challenge?.expiresAt) > now;
}

function guestAttemptProgressAllowed({ challenge, attempt, now = new Date() }) {
  if (guestChallengeAdmissionOpen(challenge, now)) return true;
  if (!["IN_PROGRESS", "EVIDENCE_REQUIRED"].includes(attempt?.status) || !attempt?.startedAt) {
    return false;
  }
  const graceDeadline = new Date(challenge.expiresAt).getTime() +
    GOAT_ARENA_V2_CONFIG.guestChallenge.completionGraceMs;
  return new Date(attempt.startedAt) < new Date(challenge.expiresAt) && now.getTime() <= graceDeadline;
}

function guestChallengeResultsReleased({
  challenge,
  settledAttemptCount = 0,
  activeAttemptCount = 0,
}) {
  if (challenge?.resultsReleasedAt) return true;
  return Number(settledAttemptCount) > 0 && Number(activeAttemptCount) === 0;
}

async function guestChallengeResultsReleaseState(challenge, now = new Date()) {
  const [settledAttemptCount, activeAttemptCount] = await Promise.all([
    ArenaGuestChallengeAttempt.countDocuments({ challengeId: challenge._id, status: "SETTLED" }),
    ArenaGuestChallengeAttempt.countDocuments({
      challengeId: challenge._id,
      status: { $in: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED"] },
    }),
  ]);
  return guestChallengeResultsReleased({ challenge, settledAttemptCount, activeAttemptCount, now });
}

async function assertGuestBoardUploadAuthorized({ rawToken, cookieHeader, viewerUserId = null }) {
  const { challenge, attempt } = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  if (!guestAttemptProgressAllowed({ challenge, attempt })) {
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  if (attempt.status !== "IN_PROGRESS") {
    throw statusError(
      409,
      "진행 중인 문항에서만 풀이판을 저장할 수 있습니다.",
      "ARENA_GUEST_BOARD_UPLOAD_NOT_ACTIVE"
    );
  }
  return true;
}

async function assertGuestEvidenceUploadAuthorized({ rawToken, cookieHeader, viewerUserId = null }) {
  const { challenge, attempt } = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  if (!guestAttemptProgressAllowed({ challenge, attempt })) {
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  if (attempt.status !== "EVIDENCE_REQUIRED") {
    throw statusError(
      409,
      "다섯 문제를 모두 푼 뒤 풀이과정을 제출할 수 있습니다.",
      "ARENA_GUEST_EVIDENCE_UPLOAD_NOT_READY"
    );
  }
  return true;
}

async function startGuestAttempt({ rawToken, cookieHeader, viewerUserId = null, now = new Date() }) {
  const { challenge, identity } = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  const latest = await latestAttemptForIdentity({
    challengeId: challenge._id,
    guestIdentityId: identity._id,
  });
  if (!guestChallengeAdmissionOpen(challenge, now)) {
    if (guestAttemptProgressAllowed({ challenge, attempt: latest, now })) return latest;
    throw statusError(410, "도전장 접수 기간이 끝나 새 시도를 시작할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  const attempt = await ensureInitialAttempt({ challenge, identity });
  if (attempt.status !== "READY") return attempt;
  const pack = await ArenaProblemPack.findById(challenge.sourceProblemPackId).select("+questions").lean();
  if (pack?.questions?.length !== 5) throw statusError(409, "도전장 문제 세트를 찾을 수 없습니다.", "ARENA_GUEST_PACK_MISSING");
  const answers = pack.questions.map((question) => ({
    questionKey: question.questionKey,
    value: "",
    revision: 0,
    lastChangedAt: null,
  }));
  const started = await ArenaGuestChallengeAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      challengeId: challenge._id,
      guestIdentityId: identity._id,
      problemPackId: challenge.sourceProblemPackId,
      status: "READY",
    },
    {
      $set: {
        status: "IN_PROGRESS",
        startedAt: now,
        deadlineAt: new Date(now.getTime() + ARENA_ONE_ON_ONE_TIME_LIMIT_MS),
        currentQuestionIndex: 0,
        answers,
        questionTimings: [{ questionKey: pack.questions[0].questionKey, startedAt: now }],
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (started) return started;

  // A repeated or concurrent start for this exact participant attempt is safe:
  // the winner's original timer and initialized answer state are returned as-is.
  const alreadyStarted = await ArenaGuestChallengeAttempt.findOne({
    _id: attempt._id,
    challengeId: challenge._id,
    guestIdentityId: identity._id,
    problemPackId: challenge.sourceProblemPackId,
    status: { $in: ["IN_PROGRESS", "EVIDENCE_REQUIRED", "SETTLED"] },
  });
  if (alreadyStarted) return alreadyStarted;
  throw statusError(
    409,
    "도전장 시도 상태가 변경되어 시작할 수 없습니다.",
    "ARENA_GUEST_ATTEMPT_START_CONFLICT"
  );
}

function normalizeAnswer(value) {
  const answer = String(value || "").trim();
  if (answer && !/^[1-9][0-9]{0,2}$/.test(answer)) {
    throw statusError(400, "정답은 1부터 999까지의 자연수로 입력해주세요.", "ARENA_GUEST_ANSWER_INVALID");
  }
  return answer;
}

async function lockGuestQuestionCompletion({
  rawToken,
  cookieHeader,
  viewerUserId = null,
  answer,
  questionSlot,
  now = new Date(),
}) {
  const { challenge, identity, attempt } = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  if (!guestAttemptProgressAllowed({ challenge, attempt, now })) {
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  if (String(attempt.guestIdentityId) !== String(identity._id) || attempt.status !== "IN_PROGRESS") {
    throw statusError(409, "진행 중인 게스트 도전 기록을 찾을 수 없습니다.", "ARENA_GUEST_ATTEMPT_NOT_ACTIVE");
  }
  const pack = await ArenaProblemPack.findById(attempt.problemPackId).select("+questions").lean();
  const index = Number(attempt.currentQuestionIndex || 0);
  const question = pack?.questions?.[index];
  if (!question || Number(questionSlot) !== index + 1) {
    throw statusError(409, "현재 문항을 확인해주세요.", "ARENA_GUEST_QUESTION_MISMATCH");
  }
  const saved = attempt.answers.find((item) => item.questionKey === question.questionKey);
  const timing = attempt.questionTimings.find((item) => item.questionKey === question.questionKey);
  if (!saved || !timing) {
    throw statusError(409, "현재 문항의 답안 기록을 찾을 수 없습니다.", "ARENA_GUEST_QUESTION_STATE_MISSING");
  }
  if (timing.completedAt) {
    return {
      locked: true,
      timedOut: saved.value === "",
      completedAt: timing.completedAt,
    };
  }

  const deadlineAt = new Date(attempt.deadlineAt);
  const validDeadline = Number.isFinite(deadlineAt.getTime());
  const timedOut = !validDeadline || deadlineAt <= now;
  const finalAnswer = timedOut ? "" : normalizeAnswer(answer);
  const completedAt = timedOut && validDeadline ? deadlineAt : now;
  const responseTimeMs = Math.max(
    0,
    completedAt.getTime() - new Date(timing.startedAt).getTime()
  );
  const updated = await ArenaGuestChallengeAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      guestIdentityId: identity._id,
      status: "IN_PROGRESS",
      currentQuestionIndex: index,
      questionTimings: {
        $elemMatch: {
          questionKey: question.questionKey,
          completedAt: null,
        },
      },
    },
    {
      $set: {
        "answers.$[answerRow].value": finalAnswer,
        "answers.$[answerRow].lastChangedAt": now,
        "questionTimings.$[timingRow].completedAt": completedAt,
        "questionTimings.$[timingRow].responseTimeMs": responseTimeMs,
      },
      $inc: { "answers.$[answerRow].revision": 1 },
    },
    {
      returnDocument: "after",
      runValidators: true,
      arrayFilters: [
        { "answerRow.questionKey": question.questionKey },
        { "timingRow.questionKey": question.questionKey, "timingRow.completedAt": null },
      ],
    }
  );
  if (!updated) {
    const replay = await ArenaGuestChallengeAttempt.findById(attempt._id).lean();
    const replayTiming = replay?.questionTimings?.find(
      (item) => item.questionKey === question.questionKey
    );
    if (replayTiming?.completedAt) {
      return { locked: true, timedOut, completedAt: replayTiming.completedAt };
    }
    throw statusError(409, "현재 문항이 다른 요청에서 먼저 변경되었습니다.", "ARENA_GUEST_QUESTION_LOCK_CONFLICT");
  }
  return { locked: true, timedOut, completedAt };
}

async function advanceGuestAttempt({ rawToken, cookieHeader, viewerUserId = null, answer, now = new Date() }) {
  const { challenge, identity, attempt } = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  if (!guestAttemptProgressAllowed({ challenge, attempt, now })) {
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  if (String(attempt.guestIdentityId) !== String(identity._id) || attempt.status !== "IN_PROGRESS") {
    throw statusError(409, "진행 중인 게스트 도전 기록을 찾을 수 없습니다.", "ARENA_GUEST_ATTEMPT_NOT_ACTIVE");
  }
  const pack = await ArenaProblemPack.findById(attempt.problemPackId).select("+questions").lean();
  const index = Number(attempt.currentQuestionIndex || 0);
  const question = pack?.questions?.[index];
  if (!question) throw statusError(409, "현재 문항을 찾을 수 없습니다.", "ARENA_GUEST_QUESTION_MISSING");
  const saved = attempt.answers.find((item) => item.questionKey === question.questionKey);
  const timing = attempt.questionTimings.find((item) => item.questionKey === question.questionKey);
  if (!saved || !timing) {
    throw statusError(409, "현재 문항의 답안 기록을 찾을 수 없습니다.", "ARENA_GUEST_QUESTION_STATE_MISSING");
  }
  const expectedCompletedAt = timing.completedAt || null;
  const completionWasLocked = Boolean(timing?.completedAt);
  const timedOut = !attempt.deadlineAt || new Date(attempt.deadlineAt) <= now;
  if (!completionWasLocked) {
    saved.value = timedOut ? "" : normalizeAnswer(answer);
    saved.revision = Number(saved.revision || 0) + 1;
    saved.lastChangedAt = now;
    timing.completedAt = timedOut ? new Date(attempt.deadlineAt) : now;
    timing.responseTimeMs = Math.max(0, timing.completedAt.getTime() - new Date(timing.startedAt).getTime());
  }
  const finalQuestion = index === pack.questions.length - 1;
  if (finalQuestion) {
    attempt.status = "EVIDENCE_REQUIRED";
    attempt.currentQuestionIndex = 5;
    attempt.submittedAt = now;
    attempt.activeSolveTimeMs = attempt.questionTimings.reduce((sum, item) => sum + Number(item.responseTimeMs || 0), 0);
  } else {
    attempt.currentQuestionIndex = index + 1;
    attempt.deadlineAt = new Date(now.getTime() + ARENA_ONE_ON_ONE_TIME_LIMIT_MS);
    attempt.questionTimings.push({ questionKey: pack.questions[index + 1].questionKey, startedAt: now });
  }
  const updated = await ArenaGuestChallengeAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      guestIdentityId: identity._id,
      status: "IN_PROGRESS",
      currentQuestionIndex: index,
      questionTimings: {
        $elemMatch: {
          questionKey: question.questionKey,
          completedAt: expectedCompletedAt,
        },
      },
    },
    {
      $set: {
        answers: attempt.answers,
        questionTimings: attempt.questionTimings,
        status: attempt.status,
        currentQuestionIndex: attempt.currentQuestionIndex,
        deadlineAt: attempt.deadlineAt,
        submittedAt: attempt.submittedAt,
        activeSolveTimeMs: attempt.activeSolveTimeMs,
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!updated) {
    const replay = await ArenaGuestChallengeAttempt.findById(attempt._id).lean();
    if (
      replay &&
      (Number(replay.currentQuestionIndex) > index || replay.status === "EVIDENCE_REQUIRED")
    ) {
      return {
        finalQuestion,
        currentQuestionIndex: replay.currentQuestionIndex,
        deadlineAt: replay.deadlineAt,
      };
    }
    throw statusError(
      409,
      "현재 문항이 다른 요청에서 먼저 변경되었습니다.",
      "ARENA_GUEST_ADVANCE_CONFLICT"
    );
  }
  return {
    finalQuestion,
    currentQuestionIndex: updated.currentQuestionIndex,
    deadlineAt: updated.deadlineAt,
  };
}

async function saveGuestSolutionBoard({ rawToken, cookieHeader, viewerUserId = null, questionSlot, revision, strokeCount, drawingDataBase64, file }) {
  let authorized;
  try {
    authorized = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  } catch (error) {
    await discardArenaEvidenceFiles(file ? [file] : []);
    throw error;
  }
  const { challenge, identity, attempt } = authorized;
  if (!guestAttemptProgressAllowed({ challenge, attempt })) {
    await discardArenaEvidenceFiles(file ? [file] : []);
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  const slot = Number(questionSlot);
  const nextRevision = Number(revision);
  const strokes = Number(strokeCount);
  const drawingData = Buffer.from(String(drawingDataBase64 || ""), "base64");
  if (!attempt || attempt.status !== "IN_PROGRESS" || slot !== Number(attempt.currentQuestionIndex) + 1 ||
      !Number.isSafeInteger(nextRevision) || nextRevision < 1 || !Number.isSafeInteger(strokes) || strokes < 0 ||
      !drawingData.length || drawingData.length > 750 * 1024 || !file) {
    await discardArenaEvidenceFiles(file ? [file] : []);
    throw statusError(409, "현재 문항의 풀이판 저장 정보를 확인해주세요.", "ARENA_GUEST_BOARD_INVALID");
  }
  let prepared;
  try {
    [prepared] = await buildEvidenceFiles([file]);
  } catch (error) {
    await discardArenaEvidenceFiles([file]);
    throw error;
  }
  prepared.originalName = `guest-question-${slot}.png`;
  const replacement = {
    $set: {
      guestIdentityId: identity._id,
      revision: nextRevision,
      strokeCount: strokes,
      drawingData,
      file: prepared,
    },
  };
  const replaceOlderBoard = () => ArenaGuestSolutionBoard.findOneAndUpdate(
    {
      attemptId: attempt._id,
      questionSlot: slot,
      revision: { $lt: nextRevision },
    },
    replacement,
    { new: false, runValidators: true }
  );
  const replacementResult = () => ({
    questionSlot: slot,
    revision: nextRevision,
    strokeCount: strokes,
    file: prepared,
  });
  let board;
  try {
    const replaced = await replaceOlderBoard();
    if (replaced) {
      board = replacementResult();
      if (replaced.file) await destroyStoredAsset(replaced.file).catch(() => {});
    } else {
      try {
        board = await ArenaGuestSolutionBoard.create({
          attemptId: attempt._id,
          guestIdentityId: identity._id,
          questionSlot: slot,
          revision: nextRevision,
          strokeCount: strokes,
          drawingData,
          file: prepared,
        });
      } catch (insertError) {
        if (Number(insertError?.code) !== 11000) throw insertError;
        // Another first save inserted between our initial update and create.
        // Re-run the revision predicate so the highest concurrent revision
        // converges instead of rejecting a newer board behind a stale insert.
        const raced = await replaceOlderBoard();
        if (!raced) throw insertError;
        board = replacementResult();
        if (raced.file) await destroyStoredAsset(raced.file).catch(() => {});
      }
    }
  } catch (error) {
    await destroyStoredAsset(prepared).catch(() => {});
    if (Number(error?.code) === 11000) {
      throw statusError(409, "풀이판이 다른 요청에서 먼저 저장되었습니다.", "ARENA_GUEST_BOARD_CONFLICT");
    }
    throw error;
  }
  return { questionSlot: board.questionSlot, revision: board.revision, strokeCount: board.strokeCount, sha256: board.file.sha256 };
}

async function getGuestSolutionBoards({ rawToken, cookieHeader, viewerUserId = null }) {
  const authorized = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  const { identity } = authorized;
  const attempt = typeof authorized.attempt.toObject === "function"
    ? authorized.attempt.toObject()
    : authorized.attempt;
  if (!attempt || String(attempt.guestIdentityId) !== String(identity._id)) {
    throw statusError(404, "게스트 도전 기록을 찾을 수 없습니다.", "ARENA_GUEST_ATTEMPT_NOT_FOUND");
  }
  const boards = await ArenaGuestSolutionBoard.find({ attemptId: attempt._id })
    .select("+drawingData")
    .sort({ questionSlot: 1 })
    .lean();
  return Promise.all(boards.map(async (board) => ({
    questionSlot: board.questionSlot,
    revision: board.revision,
    strokeCount: board.strokeCount,
    sha256: board.file?.sha256 || "",
    drawingDataBase64: Buffer.from(board.drawingData || "").toString("base64"),
    previewURL: await signedStoredAssetUrl(board.file, { expiresIn: 300 }),
  })));
}

async function assertGuestBoard({
  attemptId = null,
  rawToken = null,
  cookieHeader = "",
  viewerUserId = null,
  slot,
}) {
  let resolvedAttemptId = attemptId;
  if (!resolvedAttemptId) {
    const authorized = await authorizedGuestChallenge({
      rawToken,
      cookieHeader,
      viewerUserId,
    });
    resolvedAttemptId = authorized.attempt?._id;
  }
  const board = await ArenaGuestSolutionBoard.findOne({
    attemptId: resolvedAttemptId,
    questionSlot: slot,
  }).lean();
  if (!board) throw statusError(409, "현재 문항의 풀이판을 먼저 저장해주세요.", "ARENA_GUEST_BOARD_REQUIRED");
  return board;
}

async function settleGuestAttempt({ challenge, attempt, evidenceFiles, now = new Date() }) {
  if (attempt.status === "SETTLED") return attempt;
  if (attempt.status !== "EVIDENCE_REQUIRED" || !Array.isArray(evidenceFiles) || !evidenceFiles.length) {
    throw statusError(409, "다섯 문제 풀이와 풀이과정 제출을 완료해주세요.", "ARENA_GUEST_EVIDENCE_REQUIRED");
  }
  // 게스트 링크는 지인 간 친선전이므로 자동 부정행위 감지·운영 검토 대상에서 제외한다.
  // 풀이 제출과 결과 기록은 유지하되 MMR·XP에는 반영하지 않는다.
  const pack = await ArenaProblemPack.findById(attempt.problemPackId).select("+questions").lean();
  // Every participant solves the creator's same five questions. Reuse the
  // rates sealed with that challenge, including normal-mode published bounds.
  const sourceObservations = challenge.sourcePerformance?.observations;
  if (!Array.isArray(sourceObservations) || sourceObservations.length !== 5 ||
      pack?.questions?.length !== 5 || sourceObservations.some((observation, index) =>
        observation.questionKey !== pack.questions[index].questionKey ||
        !Number.isFinite(observation.p) || observation.p <= 0 || observation.p >= 1)) {
    throw statusError(409, "도전장 원본 문제의 평가 정보를 확인할 수 없습니다.", "ARENA_GUEST_SOURCE_PERFORMANCE_INVALID");
  }
  const performance = performanceForAttempt({ attempt, problemPack: pack, sourceRates: sourceObservations.map(observation => observation.p) });
  const comparison = compareCountThenTimePerformance(performance.performance, challenge.sourcePerformance);
  if (!comparison.valid) throw statusError(409, "유효 풀이 시간을 확인할 수 없습니다.", "ARENA_GUEST_COMPARISON_INVALID");
  const result = comparison.winnerRole === "CHALLENGER"
    ? "CHALLENGER_WIN"
    : comparison.winnerRole === "DEFENDER"
      ? "CREATOR_WIN"
      : "DRAW";
  const settled = await ArenaGuestChallengeAttempt.findOneAndUpdate(
    { _id: attempt._id, status: "EVIDENCE_REQUIRED" },
    {
      $set: {
        evidenceFiles,
        evidenceSubmittedAt: now,
        scoring: performance.scoring,
        performance: performance.performance,
        comparison,
        result,
        status: "SETTLED",
        settledAt: now,
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (settled) {
    const activeAttemptCount = await ArenaGuestChallengeAttempt.countDocuments({
      challengeId: challenge._id,
      status: { $in: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED"] },
    });
    if (activeAttemptCount === 0) {
      await ArenaGuestChallenge.updateOne(
        { _id: challenge._id, resultsReleasedAt: null },
        { $set: { resultsReleasedAt: now } }
      );
    }
    return settled;
  }
  throw statusError(409, "이 도전 기록은 다른 요청에서 이미 확정되었습니다.", "ARENA_GUEST_SETTLEMENT_CONFLICT");
}

async function submitGuestEvidence({ rawToken, cookieHeader, viewerUserId = null, files, now = new Date() }) {
  let authorized;
  try {
    authorized = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  } catch (error) {
    await discardArenaEvidenceFiles(files);
    throw error;
  }
  const { challenge, identity, attempt } = authorized;
  if (!guestAttemptProgressAllowed({ challenge, attempt, now })) {
    await discardArenaEvidenceFiles(files);
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  if (!attempt || String(attempt.guestIdentityId) !== String(identity._id)) {
    await discardArenaEvidenceFiles(files);
    throw statusError(404, "게스트 도전 기록을 찾을 수 없습니다.", "ARENA_GUEST_ATTEMPT_NOT_FOUND");
  }
  if (attempt.status === "SETTLED") {
    await discardArenaEvidenceFiles(files);
    return attempt;
  }
  let prepared = [];
  try {
    prepared = await buildEvidenceFiles(files);
    return await settleGuestAttempt({ challenge, attempt, evidenceFiles: prepared, now });
  } catch (error) {
    await discardArenaEvidenceFiles(prepared.length ? prepared : files);
    throw error;
  }
}

async function finalizeGuestBoards({ rawToken, cookieHeader, viewerUserId = null, now = new Date() }) {
  const { challenge, identity, attempt } = await authorizedGuestChallenge({ rawToken, cookieHeader, viewerUserId });
  if (!guestAttemptProgressAllowed({ challenge, attempt, now })) {
    throw statusError(410, "도전장 접수 기간이 끝나 풀이를 더 제출할 수 없습니다.", "ARENA_GUEST_LINK_EXPIRED");
  }
  if (!attempt || String(attempt.guestIdentityId) !== String(identity._id)) {
    throw statusError(404, "게스트 도전 기록을 찾을 수 없습니다.", "ARENA_GUEST_ATTEMPT_NOT_FOUND");
  }
  if (attempt.status === "SETTLED") return attempt;
  const boards = await ArenaGuestSolutionBoard.find({ attemptId: attempt._id }).sort({ questionSlot: 1 });
  if (boards.length !== 5 || boards.some((board, index) => board.questionSlot !== index + 1)) {
    throw statusError(409, "다섯 문항의 풀이판을 모두 작성해야 합니다.", "ARENA_GUEST_BOARDS_INCOMPLETE");
  }
  const settled = await settleGuestAttempt({
    challenge,
    attempt,
    evidenceFiles: boards.map((board) => ({
      ...(typeof board.file.toObject === "function" ? board.file.toObject() : board.file),
      questionSlot: board.questionSlot,
      revision: board.revision,
      strokeCount: board.strokeCount,
      firstSavedAt: board.createdAt,
      lastSavedAt: board.updatedAt,
    })),
    now,
  });
  await ArenaGuestSolutionBoard.updateMany({ attemptId: attempt._id }, { $set: { finalizedAt: now } });
  return settled;
}

function submittedAnswerForQuestion(attempt, question) {
  const answer = (attempt?.answers || []).find(
    (entry) => String(entry.questionKey) === String(question?.questionKey)
  );
  const value = typeof answer?.value === "string" ? answer.value.trim() : "";
  return value || null;
}

function publicQuestion(question, observation, index, attempt = null) {
  const sourceAccuracyRate = Number(observation?.p);
  return {
    slot: index + 1,
    questionKey: question.questionKey,
    prompt: question.prompt,
    choices: question.choices || [],
    visualization: question.visualization || null,
    correct: observation?.x === 1,
    submittedAnswer: submittedAnswerForQuestion(attempt, question),
    sourceAccuracyRate:
      Number.isFinite(sourceAccuracyRate) &&
      sourceAccuracyRate > 0 &&
      sourceAccuracyRate < 1
        ? sourceAccuracyRate
        : null,
  };
}

async function sourceAttemptForChallenge(challenge) {
  if (challenge?.sourceKind === "GUEST_ATTEMPT") {
    return ArenaGuestChallengeAttempt.findById(
      challenge.sourceGuestAttemptId
    ).lean();
  }
  return ArenaMatchAttempt.findById(challenge?.sourceAttemptId).lean();
}

function publicEvidence(basePath, side, files) {
  return (files || []).map((file, index) => ({
    index: index + 1,
    displayName: file.questionSlot ? `${file.questionSlot}번 문항 풀이` : `${index + 1}번 풀이과정`,
    mimeType: file.mimeType || "",
    previewable: /^image\/(?:jpeg|png|webp|gif)$/i.test(String(file.mimeType || "")),
    href: `${basePath}/evidence/${side}/${index + 1}`,
  }));
}

async function guestResultData({
  challenge,
  attempt,
  identity,
  creator,
  pack,
  evidenceBasePath,
  includeCreator = true,
}) {
  if (attempt?.status !== "SETTLED" || !pack) return null;
  const [creatorEvidenceFiles, creatorAttempt, guestEvidenceFiles] = await Promise.all([
    sourceEvidenceFiles(challenge),
    sourceAttemptForChallenge(challenge),
    guestFilesWithSavedBoards(attempt),
  ]);
  const creatorPerformance = challenge.sourcePerformance;
  return {
    verdict: includeCreator
      ? attempt.result === "CHALLENGER_WIN"
        ? `${identity?.nickname || "게스트"} 승리`
        : attempt.result === "CREATOR_WIN"
          ? `${creator?.name || "발신자"} 승리`
          : "무승부"
      : `${identity?.nickname || "게스트"} 기록 제출 완료`,
    explanation: includeCreator
      ? "정답 수를 먼저 비교하고, 동점이면 풀이 시간이 짧은 기록을 앞에 둡니다."
      : "발신자의 점수와 풀이과정은 현재 참가자가 모두 완료한 순간 공개합니다.",
    creator: includeCreator ? {
      label: creator?.name || creator?.username || "발신자",
      totalCorrect: creatorPerformance.correctCount,
      completionTimeMs: creatorPerformance.totalSolveTimeMs,
      difficultyAdjustedScore: Number.isFinite(Number(creatorPerformance.z))
        ? Number(creatorPerformance.z)
        : null,
      questions: pack.questions.map((question, index) =>
        publicQuestion(
          question,
          creatorPerformance.observations?.[index],
          index,
          creatorAttempt
        )
      ),
      solutions: publicEvidence(evidenceBasePath, "creator", creatorEvidenceFiles),
    } : null,
    guest: {
      label: identity?.nickname || "게스트",
      totalCorrect: attempt.performance?.correctCount,
      completionTimeMs: attempt.performance?.totalSolveTimeMs,
      difficultyAdjustedScore: Number.isFinite(Number(attempt.performance?.z))
        ? Number(attempt.performance.z)
        : null,
      questions: pack.questions.map((question, index) =>
        publicQuestion(
          question,
          attempt.performance?.observations?.[index],
          index,
          attempt
        )
      ),
      solutions: publicEvidence(evidenceBasePath, "guest", guestEvidenceFiles),
    },
  };
}

function rankPerformance(value) {
  const correctCount = Number(value?.correctCount);
  const completionTimeMs = Number(value?.totalSolveTimeMs);
  return {
    correctCount: Number.isFinite(correctCount) ? correctCount : -1,
    completionTimeMs: Number.isFinite(completionTimeMs)
      ? Math.max(0, completionTimeMs)
      : Number.POSITIVE_INFINITY,
  };
}

function compareLeaderboardPerformance(left, right) {
  const a = rankPerformance(left?.performance);
  const b = rankPerformance(right?.performance);
  if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
  if (a.completionTimeMs !== b.completionTimeMs) return a.completionTimeMs - b.completionTimeMs;
  return 0;
}

async function bestSettledAttemptForIdentity({ challengeId = null, guestIdentityId }) {
  return ArenaGuestChallengeAttempt.findOne({
    ...(challengeId ? { challengeId } : {}),
    guestIdentityId,
    status: "SETTLED",
    "performance.correctCount": { $gte: 0, $lte: 5 },
    "performance.totalSolveTimeMs": { $gt: 0 },
  }).sort({
    "performance.correctCount": -1,
    "performance.totalSolveTimeMs": 1,
    attemptNumber: 1,
    _id: 1,
  }).lean();
}

async function prepareGuestReverseChallengeRegistration({ rawToken, cookieHeader, viewerUserId = null }) {
  const challenge = await challengeByToken(rawToken);
  const identity = await verifiedIdentity(cookieHeader, { viewerUserId });
  if (!identity) {
    throw statusError(403, "이 도전장을 완료한 게스트 브라우저에서만 계속할 수 있습니다.", "ARENA_GUEST_PROOF_REQUIRED");
  }
  const attempt = await bestSettledAttemptForIdentity({
    challengeId: challenge._id,
    guestIdentityId: identity._id,
  });
  if (!attempt) {
    throw statusError(409, "다섯 문제와 풀이과정을 모두 제출한 뒤 역도전장을 제안할 수 있습니다.", "ARENA_GUEST_REVERSE_NOT_READY");
  }
  return {
    guestIdentityId: String(identity._id),
    sourceAttemptId: String(attempt._id),
    nickname: identity.nickname,
    claimedByUserId: identity.claimedByUserId ? String(identity.claimedByUserId) : null,
  };
}

async function getGuestRegistrationClaimPreview({
  cookieHeader,
  expectedIdentityId = null,
  expectedAttemptId = null,
}) {
  const identity = await verifiedIdentity(cookieHeader, { selectSecret: true });
  if (!identity || (expectedIdentityId && id(identity) !== String(expectedIdentityId))) return null;
  let attempt = expectedAttemptId && mongoose.isValidObjectId(expectedAttemptId)
    ? await ArenaGuestChallengeAttempt.findOne({
        _id: expectedAttemptId,
        guestIdentityId: identity._id,
      }).lean()
    : await bestSettledAttemptForIdentity({ guestIdentityId: identity._id });
  if (!attempt && !expectedAttemptId) {
    attempt = await ArenaGuestChallengeAttempt.findOne({
      guestIdentityId: identity._id,
    }).sort({ createdAt: -1 }).lean();
  }
  if (!attempt || !identity.birthDateHash) return null;
  return {
    guestIdentityId: id(identity),
    sourceAttemptId: id(attempt),
    nickname: identity.nickname,
    // 확인 문구에는 경기 완료일이 아니라 이 게스트가 최초로 도전장을
    // 수락한 날짜를 사용한다.
    acceptedAt: identity.firstChallengeAcceptedAt || attempt.createdAt || identity.createdAt,
  };
}

function leaderboardEvidence(files, hrefForIndex) {
  return (files || []).map((file, index) => ({
    index: index + 1,
    displayName: file.questionSlot ? `${file.questionSlot}번 문항 풀이` : `${index + 1}번 풀이과정`,
    mimeType: file.mimeType || "",
    previewable: /^image\/(?:jpeg|png|webp|gif)$/i.test(String(file.mimeType || "")),
    href: hrefForIndex(index + 1),
  }));
}

async function buildGuestChallengeLeaderboard({
  challenge,
  creator,
  pack,
  rawToken,
  viewerIdentityId = null,
  viewerIsCreator = false,
  now = new Date(),
}) {
  const [joinedIdentityObjectIds, settledAttempts, settledAttemptCount, activeAttemptCount] = await Promise.all([
    ArenaGuestChallengeAttempt.distinct("guestIdentityId", { challengeId: challenge._id }),
    ArenaGuestChallengeAttempt.aggregate([
      {
        $match: {
          challengeId: challenge._id,
          status: "SETTLED",
          "performance.correctCount": { $gte: 0, $lte: 5 },
          "performance.totalSolveTimeMs": { $gt: 0 },
        },
      },
      {
        $sort: {
          "performance.correctCount": -1,
          "performance.totalSolveTimeMs": 1,
          attemptNumber: 1,
          _id: 1,
        },
      },
      { $group: { _id: "$guestIdentityId", attempt: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$attempt" } },
    ]),
    ArenaGuestChallengeAttempt.countDocuments({
      challengeId: challenge._id,
      status: "SETTLED",
    }),
    ArenaGuestChallengeAttempt.countDocuments({
      challengeId: challenge._id,
      status: { $in: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED"] },
    }),
  ]);
  const joinedIdentityIds = joinedIdentityObjectIds.map(id).filter(Boolean);
  const bestByIdentity = new Map(
    settledAttempts.map((attempt) => [id(attempt.guestIdentityId), attempt])
  );
  const identities = joinedIdentityIds.length
    ? await ArenaGuestIdentity.find({ _id: { $in: joinedIdentityIds } })
        .select("nickname claimedByUserId")
        .lean()
    : [];
  const identityById = new Map(identities.map((identity) => [id(identity), identity]));
  const [creatorEvidenceFiles, creatorAttempt] = await Promise.all([
    sourceEvidenceFiles(challenge),
    sourceAttemptForChallenge(challenge),
  ]);
  const tokenPath = `/arena-invite/${encodeURIComponent(rawToken)}`;
  const rows = [{
    kind: "CREATOR",
    participantKey: `creator:${id(challenge.creatorUserId)}`,
    attemptId: null,
    attemptNumber: null,
    label: creator?.name || creator?.username || "도전장 발신자",
    performance: challenge.sourcePerformance,
    isViewer: viewerIsCreator,
    questions: pack.questions.map((question, index) =>
      publicQuestion(
        question,
        challenge.sourcePerformance?.observations?.[index],
        index,
        creatorAttempt
      )
    ),
    solutions: leaderboardEvidence(
      creatorEvidenceFiles,
      (fileIndex) => `${tokenPath}/evidence/creator/${fileIndex}`
    ),
  }];
  for (const [identityId, attempt] of bestByIdentity) {
    const identity = identityById.get(identityId);
    rows.push({
      kind: "GUEST",
      participantKey: `guest:${identityId}`,
      attemptId: id(attempt),
      attemptNumber: Number(attempt.attemptNumber || 1),
      label: identity?.nickname || "게스트",
      performance: attempt.performance,
      isViewer: identityId === id(viewerIdentityId),
      questions: pack.questions.map((question, index) =>
        publicQuestion(
          question,
          attempt.performance?.observations?.[index],
          index,
          attempt
        )
      ),
      solutions: leaderboardEvidence(
        await guestFilesWithSavedBoards(attempt),
        (fileIndex) => `${tokenPath}/evidence/participants/${encodeURIComponent(id(attempt))}/${fileIndex}`
      ),
    });
  }
  rows.sort((left, right) => {
    const performanceOrder = compareLeaderboardPerformance(left, right);
    if (performanceOrder) return performanceOrder;
    if (left.kind !== right.kind) return left.kind === "CREATOR" ? -1 : 1;
    const labelOrder = String(left.label).localeCompare(String(right.label), "ko-KR");
    return labelOrder || String(left.participantKey).localeCompare(String(right.participantKey));
  });
  rows.forEach((row) => {
    const values = rankPerformance(row.performance);
    row.totalCorrect = values.correctCount;
    row.completionTimeMs = values.completionTimeMs;
    row.difficultyAdjustedScore = Number.isFinite(Number(row.performance?.z))
      ? Number(row.performance.z)
      : null;
  });
  const completedIdentityIds = new Set(bestByIdentity.keys());
  const viewerHasSettled = viewerIdentityId
    ? completedIdentityIds.has(id(viewerIdentityId))
    : false;
  const resultsReleased = guestChallengeResultsReleased({
    challenge,
    settledAttemptCount,
    activeAttemptCount,
  });
  const visible = viewerIsCreator || viewerHasSettled;
  // 완료 참가자는 즉시 서로의 순위와 상세 기록을 볼 수 있고, 발신자의
  // 원본 점수·풀이는 현재 참가자가 모두 완료한 순간부터 함께 공개한다.
  const visibleRows = visible
    ? rows.filter((row) => viewerIsCreator || resultsReleased || row.kind !== "CREATOR")
    : [];
  let previous = null;
  visibleRows.forEach((row, index) => {
    row.rank = previous && compareLeaderboardPerformance(previous, row) === 0
      ? previous.rank
      : index + 1;
    previous = row;
  });
  return {
    resultsReleased,
    creatorScoreHidden: visible && !viewerIsCreator && !resultsReleased,
    provisional: visible && !resultsReleased,
    visible,
    rows: visibleRows,
    viewerRank: visible ? visibleRows.find((row) => row.isViewer)?.rank || null : null,
    viewerBestAttemptId: visible
      ? visibleRows.find((row) => row.isViewer && row.kind === "GUEST")?.attemptId || null
      : null,
    joinedGuestCount: joinedIdentityIds.length,
    completedGuestCount: completedIdentityIds.size,
    waitingGuestCount: Math.max(0, joinedIdentityIds.length - completedIdentityIds.size),
    settledAttemptCount,
    activeAttemptCount,
    rankingRule: "정답 수가 많은 순서, 동점이면 풀이 시간이 짧은 순서",
    attemptPolicy: "닉네임과 생년월일 조합별 완료 기록 1건을 반영",
  };
}

async function getGuestChallengePageData({
  rawToken,
  cookieHeader,
  viewerUserId = null,
  forceParticipantEntry = false,
  now = new Date(),
}) {
  const challenge = await challengeByToken(rawToken, { now });
  const [creator, authenticatedIdentity] = await Promise.all([
    User.findById(challenge.creatorUserId).select("name username").lean(),
    verifiedIdentity(cookieHeader, { viewerUserId }),
  ]);
  const identity = forceParticipantEntry && !viewerUserId
    ? null
    : authenticatedIdentity;
  const isCreator = viewerUserId && String(viewerUserId) === String(challenge.creatorUserId);
  const attemptDocument = identity
    ? await latestAttemptForIdentity({
        challengeId: challenge._id,
        guestIdentityId: identity._id,
      })
    : null;
  const attempt = attemptDocument
    ? (typeof attemptDocument.toObject === "function" ? attemptDocument.toObject() : attemptDocument)
    : null;
  const isGuest = Boolean(identity && attempt);
  const viewerOwnsClaimedIdentity = Boolean(
    isGuest &&
    viewerUserId &&
    identity?.claimedByUserId &&
    String(identity.claimedByUserId) === String(viewerUserId)
  );
  const pack = (isCreator || isGuest)
    ? await ArenaProblemPack.findById(challenge.sourceProblemPackId).select("+questions").lean()
    : null;
  const leaderboard = pack
    ? await buildGuestChallengeLeaderboard({
      challenge,
      creator,
      pack,
      rawToken,
      viewerIdentityId: isCreator ? null : identity?._id || null,
      viewerIsCreator: Boolean(isCreator),
      now,
    })
    : {
        resultsReleased: false,
        creatorScoreHidden: false,
        provisional: false,
        visible: false,
        rows: [],
        viewerRank: null,
        viewerBestAttemptId: null,
        joinedGuestCount: 0,
        completedGuestCount: 0,
        waitingGuestCount: 0,
        settledAttemptCount: 0,
        activeAttemptCount: 0,
        rankingRule: "정답 수가 많은 순서, 동점이면 풀이 시간이 짧은 순서",
        attemptPolicy: "닉네임과 생년월일 조합별 완료 기록 1건을 반영",
      };
  const currentIndex = Number(attempt?.currentQuestionIndex || 0);
  const currentQuestion = attempt?.status === "IN_PROGRESS" && pack?.questions?.[currentIndex]
    ? { ...publicQuestion(pack.questions[currentIndex], null, currentIndex), savedAnswer: attempt.answers?.find((row) => row.questionKey === pack.questions[currentIndex].questionKey)?.value || "" }
    : null;
  return {
    challengeId: String(challenge._id),
    token: rawToken,
    creatorName: creator?.name || creator?.username || "발신자",
    status: challenge.status,
    expiredBeforeClaim: challenge.status === "EXPIRED" && !isGuest && !isCreator,
    expiredBeforeCompletion: Boolean(
      isGuest &&
      attempt?.status !== "SETTLED" &&
      !guestAttemptProgressAllowed({ challenge, attempt, now })
    ),
    expiresAt: challenge.expiresAt,
    linkTtlDays: GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlDays,
    isCreator: Boolean(isCreator),
    isGuest: Boolean(isGuest),
    participantEntry: Boolean(forceParticipantEntry && !viewerUserId),
    guestNickname: identity?.nickname || "",
    attempt: attempt ? {
      id: String(attempt._id),
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      currentQuestionIndex: attempt.currentQuestionIndex,
      deadlineAt: attempt.deadlineAt,
    } : null,
    currentQuestion,
    questionTimeLimitMs: ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
    result: null,
    leaderboard,
    canClaim: !isGuest && challenge.status === "OPEN" && new Date(challenge.expiresAt) > now,
    canJoinAsAnotherParticipant: Boolean(
      !isCreator &&
      !viewerUserId &&
      challenge.status !== "EXPIRED" &&
      new Date(challenge.expiresAt) > now
    ),
    senderScoreHidden: !leaderboard.visible || leaderboard.creatorScoreHidden,
    expiresAtLabel: new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(challenge.expiresAt)),
    reverseChallengeRequestPath: isGuest && leaderboard.viewerBestAttemptId && !viewerOwnsClaimedIdentity
      ? `/arena-invite/${encodeURIComponent(rawToken)}/reverse-challenge`
      : "",
    reverseCreatePath: viewerOwnsClaimedIdentity && leaderboard.viewerBestAttemptId
      ? `/goat-arena/guest-records/${encodeURIComponent(leaderboard.viewerBestAttemptId)}/guest-invitations`
      : "",
  };
}

async function getClaimedGuestRecords({ userId }) {
  const identities = await ArenaGuestIdentity.find({ claimedByUserId: userId })
    .select("_id")
    .lean();
  const identityIds = identities.map((identity) => identity._id);
  const attempts = await ArenaGuestChallengeAttempt.find({
    $or: [
      { claimedByUserId: userId },
      ...(identityIds.length ? [{ guestIdentityId: { $in: identityIds } }] : []),
    ],
    status: "SETTLED",
  })
    .sort({ settledAt: -1, _id: -1 })
    .lean();
  if (!attempts.length) return [];
  await ArenaGuestChallengeAttempt.updateMany(
    {
      _id: { $in: attempts.map((attempt) => attempt._id) },
      claimedByUserId: null,
    },
    { $set: { claimedByUserId: userId } }
  );
  const challenges = await ArenaGuestChallenge.find({
    _id: { $in: attempts.map((attempt) => attempt.challengeId) },
  }).lean();
  const challengeById = new Map(challenges.map((challenge) => [id(challenge), challenge]));
  const creators = await User.find({
    _id: { $in: challenges.map((challenge) => challenge.creatorUserId) },
  }).select("_id name username").lean();
  const creatorById = new Map(creators.map((creator) => [id(creator), creator]));
  return attempts.map((attempt) => {
    const challenge = challengeById.get(id(attempt.challengeId));
    const creator = creatorById.get(id(challenge?.creatorUserId));
    return {
      id: id(attempt),
      attemptNumber: Number(attempt.attemptNumber || 1),
      creatorName: creator?.name || creator?.username || "발신자",
      result: attempt.result,
      totalCorrect: Number(attempt.performance?.correctCount || 0),
      z: Number(attempt.performance?.z || 0),
      settledAt: attempt.settledAt,
      href: `/goat-arena/guest-records/${attempt._id}`,
    };
  });
}

async function getClaimedGuestRecordPageData({ attemptId, userId }) {
  if (!mongoose.isValidObjectId(attemptId)) {
    throw statusError(404, "연결된 게스트 경기 기록을 찾을 수 없습니다.", "ARENA_GUEST_RECORD_NOT_FOUND");
  }
  const attempt = await ArenaGuestChallengeAttempt.findOne({
    _id: attemptId,
    status: "SETTLED",
  }).lean();
  if (!attempt) {
    throw statusError(404, "연결된 게스트 경기 기록을 찾을 수 없습니다.", "ARENA_GUEST_RECORD_NOT_FOUND");
  }
  const identity = await ArenaGuestIdentity.findOne({
    _id: attempt.guestIdentityId,
    claimedByUserId: userId,
  }).lean();
  if (!identity) {
    throw statusError(404, "연결된 게스트 경기 기록을 찾을 수 없습니다.", "ARENA_GUEST_RECORD_NOT_FOUND");
  }
  const challenge = await ArenaGuestChallenge.findById(attempt.challengeId).lean();
  const [creator, pack] = await Promise.all([
    User.findById(challenge?.creatorUserId).select("name username").lean(),
    ArenaProblemPack.findById(challenge?.sourceProblemPackId).select("+questions").lean(),
  ]);
  if (!challenge || !pack) {
    throw statusError(409, "연결된 게스트 경기의 원본 데이터를 확인할 수 없습니다.", "ARENA_GUEST_RECORD_INCOMPLETE");
  }
  if (!attempt.claimedByUserId) {
    await ArenaGuestChallengeAttempt.updateOne(
      { _id: attempt._id, claimedByUserId: null },
      { $set: { claimedByUserId: userId } }
    );
  }
  const resultsReleased = await guestChallengeResultsReleaseState(challenge);
  const result = await guestResultData({
    challenge,
    attempt,
    identity,
    creator,
    pack,
    evidenceBasePath: `/goat-arena/guest-records/${attempt._id}`,
    includeCreator: resultsReleased,
  });
  return {
    creatorName: creator?.name || creator?.username || "발신자",
    guestNickname: identity.nickname,
    linkTtlDays: GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlDays,
    accountArchive: true,
    isCreator: false,
    isGuest: true,
    expiredBeforeClaim: false,
    attempt: {
      id: id(attempt),
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
    },
    result,
    senderScoreHidden: !resultsReleased,
  };
}

async function getClaimedGuestEvidenceFile({ attemptId, userId, side, fileIndex }) {
  const attempt = mongoose.isValidObjectId(attemptId)
    ? await ArenaGuestChallengeAttempt.findOne({
        _id: attemptId,
        status: "SETTLED",
      }).lean()
    : null;
  const identity = attempt
    ? await ArenaGuestIdentity.findOne({
        _id: attempt.guestIdentityId,
        claimedByUserId: userId,
      }).select("_id").lean()
    : null;
  if (!attempt || !identity) {
    throw statusError(404, "연결된 게스트 경기 기록을 찾을 수 없습니다.", "ARENA_GUEST_RECORD_NOT_FOUND");
  }
  if (!attempt.claimedByUserId) {
    await ArenaGuestChallengeAttempt.updateOne(
      { _id: attempt._id, claimedByUserId: null },
      { $set: { claimedByUserId: userId } }
    );
  }
  const challenge = await ArenaGuestChallenge.findById(attempt.challengeId).lean();
  const normalizedSide = String(side).toLowerCase();
  if (normalizedSide === "creator" && !(await guestChallengeResultsReleaseState(challenge))) {
    throw statusError(
      403,
      "발신자의 풀이과정은 현재 참가자가 모두 완료한 뒤 공개됩니다.",
      "ARENA_GUEST_CREATOR_RESULT_PENDING"
    );
  }
  const files = normalizedSide === "creator"
    ? await sourceEvidenceFiles(challenge)
    : normalizedSide === "guest"
      ? await guestFilesWithSavedBoards(attempt)
      : null;
  const file = files?.[Number(fileIndex) - 1];
  if (!file) {
    throw statusError(404, "풀이 파일을 찾을 수 없습니다.", "ARENA_GUEST_EVIDENCE_MISSING");
  }
  const url = await signedStoredAssetUrl(file, {
    download: false,
    originalName: `arena-solution-${Number(fileIndex) || 1}`,
    expiresIn: 5 * 60,
  });
  if (!url) {
    throw statusError(503, "풀이 파일 보안 링크를 만들 수 없습니다.", "ARENA_GUEST_EVIDENCE_URL_UNAVAILABLE");
  }
  return url;
}

async function getGuestEvidenceFile({
  rawToken,
  cookieHeader,
  viewerUserId = null,
  side,
  participantAttemptId = null,
  fileIndex,
}) {
  const challenge = await challengeByToken(rawToken);
  const identity = await verifiedIdentity(cookieHeader, { viewerUserId });
  const creatorAuthorized = viewerUserId && String(viewerUserId) === String(challenge.creatorUserId);
  const viewerSettledAttempt = identity
    ? await ArenaGuestChallengeAttempt.exists({
        challengeId: challenge._id,
        guestIdentityId: identity._id,
        status: "SETTLED",
      })
    : null;
  if (!creatorAuthorized && !viewerSettledAttempt) {
    throw statusError(
      403,
      "도전장을 완료한 참가자와 발신자만 풀이과정을 볼 수 있습니다.",
      "ARENA_GUEST_EVIDENCE_FORBIDDEN"
    );
  }

  const normalizedSide = String(side).toLowerCase();
  if (
    normalizedSide === "creator" &&
    !creatorAuthorized &&
    !(await guestChallengeResultsReleaseState(challenge))
  ) {
    throw statusError(
      403,
      "발신자의 풀이과정은 현재 참가자가 모두 완료한 뒤 공개됩니다.",
      "ARENA_GUEST_CREATOR_RESULT_PENDING"
    );
  }
  let files = null;
  if (normalizedSide === "creator") {
    files = await sourceEvidenceFiles(challenge);
  } else if (participantAttemptId) {
    const participantAttempt = mongoose.isValidObjectId(participantAttemptId)
      ? await ArenaGuestChallengeAttempt.findOne({
          _id: participantAttemptId,
          challengeId: challenge._id,
          status: "SETTLED",
        }).lean()
      : null;
    files = participantAttempt ? await guestFilesWithSavedBoards(participantAttempt) : null;
  } else if (normalizedSide === "guest" && identity) {
    const ownAttempt = await ArenaGuestChallengeAttempt.findOne({
      challengeId: challenge._id,
      guestIdentityId: identity._id,
      status: "SETTLED",
    }).sort({ attemptNumber: -1 }).lean();
    files = ownAttempt ? await guestFilesWithSavedBoards(ownAttempt) : null;
  }
  const file = files?.[Number(fileIndex) - 1];
  if (!file) throw statusError(404, "풀이 파일을 찾을 수 없습니다.", "ARENA_GUEST_EVIDENCE_MISSING");
  const url = await signedStoredAssetUrl(file, {
    download: false,
    originalName: `arena-solution-${Number(fileIndex) || 1}`,
    expiresIn: 5 * 60,
  });
  if (!url) throw statusError(503, "풀이 파일 보안 링크를 만들 수 없습니다.", "ARENA_GUEST_EVIDENCE_URL_UNAVAILABLE");
  return url;
}

async function guestNicknameClaimStatus({
  nickname,
  cookieHeader,
  userId = null,
  birthDate = null,
}) {
  const normalized = nicknameKey(nickname);
  const identity = await ArenaGuestIdentity.findOne({ nicknameNormalized: normalized })
    .select("+claimSecretHash +birthDateHash");
  if (!identity) {
    return { guestConflict: false, claimableIdentity: null, birthDateMatches: false };
  }
  if (userId && String(identity.claimedByUserId || "") === String(userId)) {
    return { guestConflict: false, claimableIdentity: identity, birthDateMatches: true };
  }
  const requestedBirthDateHash = birthDate ? guestBirthDateDigest(birthDate) : "";
  const dateMatches = Boolean(
    requestedBirthDateHash && birthDateMatches(identity, requestedBirthDateHash)
  );
  const proof = cookieProof(cookieHeader);
  const claimable = Boolean(
    dateMatches &&
    proof &&
    String(proof.identityId) === String(identity._id) &&
    guestCookieProofMatches(identity, proof.secret)
  );
  return {
    guestConflict: !claimable,
    claimableIdentity: claimable ? identity : null,
    birthDateMatches: dateMatches,
  };
}

async function claimGuestRecordsForUser({
  userId,
  nickname,
  birthDate,
  cookieHeader,
  now = new Date(),
  session = null,
}) {
  const proof = cookieProof(cookieHeader);
  if (!proof) return { claimed: false, attemptCount: 0 };
  let result = { claimed: false, attemptCount: 0 };
  const claimWithinSession = async (mongoSession) => {
      const identity = await ArenaGuestIdentity.findOne({
        _id: proof.identityId,
        nicknameNormalized: nicknameKey(nickname),
      }).select("+claimSecretHash +birthDateHash").session(mongoSession);
      if (!identity || !guestCookieProofMatches(identity, proof.secret)) return;
      if (!birthDateMatches(identity, guestBirthDateDigest(birthDate))) {
        throw statusError(
          409,
          "도전장 참가 때 입력한 생년월일과 동일한 생년월일을 입력해주세요.",
          "ARENA_GUEST_BIRTH_DATE_MISMATCH"
        );
      }
      if (identity.claimedByUserId && String(identity.claimedByUserId) !== String(userId)) {
        throw statusError(409, "게스트 기록이 이미 다른 계정에 연결되었습니다.", "ARENA_GUEST_ALREADY_CLAIMED");
      }
      await bindGuestNicknameToUser({
        nickname: identity.nickname,
        nicknameNormalized: identity.nicknameNormalized,
        guestIdentityId: identity._id,
        userId,
        session: mongoSession,
      });
      identity.claimedByUserId = userId;
      identity.claimedAt = identity.claimedAt || now;
      // 연결이 완료된 뒤 기존 게스트 쿠키를 재사용할 수 없도록 서버의
      // 소유권 비밀도 함께 회전한다. 브라우저 쿠키는 컨트롤러에서 삭제한다.
      identity.claimSecretHash = hash(crypto.randomBytes(32).toString("base64url"));
      identity.proofGeneration = Number(identity.proofGeneration || 0) + 1;
      identity.proofExpiresAt = now;
      await identity.save({ session: mongoSession });
      const update = await ArenaGuestChallengeAttempt.updateMany(
        {
          guestIdentityId: identity._id,
          $or: [
            { claimedByUserId: null },
            { claimedByUserId: userId },
          ],
        },
        { $set: { claimedByUserId: userId } },
        { session: mongoSession }
      );
      result = {
        claimed: true,
        attemptCount: Number(update.modifiedCount || 0),
        identityId: String(identity._id),
      };
  };
  if (session) {
    await claimWithinSession(session);
    return result;
  }
  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(() => claimWithinSession(mongoSession));
    return result;
  } finally {
    await mongoSession.endSession();
  }
}

module.exports = {
  GUEST_COOKIE_NAME,
  advanceGuestAttempt,
  assertGuestBoardUploadAuthorized,
  assertGuestEvidenceUploadAuthorized,
  assertGuestBoard,
  claimGuestChallenge,
  claimGuestRecordsForUser,
  createGuestChallenge,
  createGuestChallengeFromClaimedAttempt,
  finalizeGuestBoards,
  getClaimedGuestEvidenceFile,
  getClaimedGuestRecordPageData,
  getClaimedGuestRecords,
  getGuestChallengePageData,
  getGuestEvidenceFile,
  getGuestNicknameAvailability,
  getGuestRegistrationClaimPreview,
  getGuestSolutionBoards,
  guestNicknameClaimStatus,
  lockGuestQuestionCompletion,
  prepareGuestReverseChallengeRegistration,
  saveGuestSolutionBoard,
  startGuestAttempt,
  submitGuestEvidence,
};
