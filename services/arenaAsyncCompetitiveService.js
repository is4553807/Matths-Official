"use strict";
const { arenaQuestionReleaseIssue } = require("./arenaQuestionReleaseService");
const { retainArenaEvidence, completeArenaEvidenceReference } = require("./arenaEvidenceRetentionService");

const mongoose = require("mongoose");
const { priorExposedQuestionHashes, markResultQuestionExposure, questionHashesForPacks, legacyRecordOverlapsExposure, PACK_GENERATION_CANDIDATE_LIMIT } = require("./arenaQuestionExposureService");
const { questionInstanceHash, questionInstanceHashAliases } = require("./arenaQuestionIdentityService");
const { currentArenaRatingState, applyArenaRatingState } = require("./arenaRatingStateService");
const { publicTierLabel } = require("./arenaPublicResponseService");
const { AdminTodo, User } = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const { ARENA_ONE_ON_ONE_START_LIMIT_MS } = require("./arenaOneOnOneProblemBank");
const { buildArenaActivityLevel } = require("./arenaActivityLevelService");
const {
  SCORING_VERSION,
  calculateCompetitivePerformance,
  compareCompetitivePerformance,
} = require("./arenaCompetitiveScoringService");
const { detectEvidenceAnomalies } = require("./arenaMatchEvidenceService");
const { adaptiveRatingUpdate } = require("./arenaAdaptiveRatingService");
const { competitivePointUpdate } = require("./arenaCompetitivePointService");
const {
  publicSourceAccuracyForQuestion,
} = require("./arenaMatchAttemptService");
const { scoreArenaAttempt } = require("./arenaMatchScoringService");
const { sameTestAccountCohort } = require("./arenaActiveMatchService");
const { kstSeasonKey } = require("./arenaTimeService");
const { signedStoredAssetUrl } = require("./fileStorageService");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const {
  orderedHistoricalRecordOwners,
  orderedHistoricalRecordsForOwner,
} = require("./arenaHistoricalRecordSelectionService");
const {
  ensureArenaV2Profile,
  tierForRating,
} = require("./arenaV2ProfileService");

const ASYNC_SETTLEMENT_VERSION = "GOAT-ARENA-2.2-ASYNC-ADAPTIVE-RATING-V2";
const REVIEW_TARGET_MS = 24 * 60 * 60 * 1000;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function id(value) {
  return String(value?._id || value || "");
}

function rounded(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function configuredCloseScoreThreshold() {
  const value = GOAT_ARENA_V2_CONFIG.asyncCompetitive.closeScoreThreshold;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw statusError(
      503,
      "경쟁전 근소 점수 기준이 아직 승인되지 않았습니다.",
      "ARENA_COMPETITIVE_SCORING_NOT_CONFIGURED"
    );
  }
  return value;
}

function ratingState(profile) {
  return {
    rating: Number(profile.rating),
    ratingDeviation: Number(profile.ratingDeviation),
    volatility: Number(profile.volatility),
    tier: String(profile.tier || "UNPLACED"),
  };
}

function ratingSummary(before, after, adaptiveAudit = null) {
  return {
    before: rounded(before.rating, 2),
    delta: rounded(after.rating - before.rating, 2),
    after: rounded(after.rating, 2),
    ratingDeviationBefore: rounded(before.ratingDeviation, 2),
    ratingDeviationAfter: rounded(after.ratingDeviation, 2),
    volatilityBefore: before.volatility,
    volatilityAfter: after.volatility,
    tierBefore: before.tier,
    tierAfter: after.tier,
    tierBeforeLabel: publicTierLabel(before.tier),
    tierAfterLabel: publicTierLabel(after.tier),
    adaptivePolicy: adaptiveAudit,
  };
}

function outcomeName(winnerRole) {
  return winnerRole ? `${winnerRole}_WIN` : "DRAW";
}

function isAsyncCompetitiveMatch(match) {
  return Boolean(
    match?.arenaVersion === "2.0" &&
    match?.gameMode === "COMPETITIVE" &&
    match?.competitiveAsync?.enabled
  );
}

function exactSourceRates(problemPack) {
  const questions = Array.isArray(problemPack?.questions) ? problemPack.questions : [];
  if (questions.length !== 5) {
    throw statusError(422, "경쟁전에는 실제 다섯 문항이 필요합니다.", "ARENA_COMPETITIVE_QUESTIONS_INVALID");
  }
  return questions.map((question) => {
    const source = publicSourceAccuracyForQuestion(question);
    if (
      source?.evidenceKind !== "EXACT" ||
      !Number.isFinite(Number(source.min)) ||
      Number(source.min) <= 0 ||
      Number(source.min) >= 1
    ) {
      throw statusError(
        422,
        "원문 정답률이 정확히 확인되는 문항만 경쟁전에 사용할 수 있습니다.",
        "ARENA_COMPETITIVE_ACCURACY_UNAVAILABLE"
      );
    }
    return Number(source.min);
  });
}

function performanceForAttempt({ attempt, problemPack, sourceRates = null }) {
  const scoring = scoreArenaAttempt({ attempt, problemPack });
  const rates = sourceRates || exactSourceRates(problemPack);
  const performance = calculateCompetitivePerformance({
    questions: scoring.questionResults.map((result, index) => ({
      questionKey: result.questionKey,
      correct: result.correct,
      sourceAccuracyRate: rates[index],
    })),
    totalSolveTimeMs: scoring.totalSolveTimeMs,
  });
  return { performance, scoring, sourceRates: rates };
}

function assertSolutionSharingConsent(profile) {
  const expected = GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion;
  if (profile?.competitiveSolutionSharingConsentVersion !== expected) {
    throw statusError(
      428,
      "경쟁전 시작 전에 풀이 과정 상호 공개에 동의해야 합니다.",
      "ARENA_COMPETITIVE_SOLUTION_CONSENT_REQUIRED"
    );
  }
}

async function acknowledgeCompetitiveSolutionSharing({ userId, accepted, now = new Date() }) {
  if (accepted !== true) {
    throw statusError(400, "풀이 과정 상호 공개 동의가 필요합니다.", "ARENA_COMPETITIVE_CONSENT_REQUIRED");
  }
  const profile = await ensureArenaV2Profile(userId);
  profile.competitiveSolutionSharingConsentVersion =
    GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion;
  profile.competitiveSolutionSharingConsentedAt = new Date(now);
  await profile.save();
  return {
    consentVersion: profile.competitiveSolutionSharingConsentVersion,
    consentedAt: profile.competitiveSolutionSharingConsentedAt,
  };
}

async function releaseExpiredCompetitiveReservations(now = new Date()) {
  return ArenaCompetitiveRecord.updateMany(
    {
      recordMode: "COMPETITIVE",
      status: "RESERVED",
      reservedByMatchId: null,
      reservationExpiresAt: { $lte: new Date(now) },
    },
    {
      $set: { status: "AVAILABLE" },
      $unset: {
        reservedByUserId: 1,
        reservedAt: 1,
        reservationExpiresAt: 1,
      },
    }
  );
}

async function reserveHistoricalRecord({ user, rating, now }) {
  await releaseExpiredCompetitiveReservations(now);
  const exposedHashes = await priorExposedQuestionHashes(user._id);
  const gaps = [...new Set(
    GOAT_ARENA_V2_CONFIG.matchmaking.windows
      .map((window) => Number(window.ratingGap))
      .filter((gap) => Number.isFinite(gap) && gap > 0)
      .sort((left, right) => left - right)
  )];
  for (const gap of gaps) {
    const eligibility = {
      recordMode: "COMPETITIVE",
      status: "AVAILABLE",
      consentVersion:
        GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion,
      ownerUserId: { $ne: user._id },
      ...(exposedHashes.size
        ? { questionInstanceHashes: { $nin: [...exposedHashes] } }
        : {}),
      "ratingSnapshot.rating": {
        $gte: Math.max(0, rating - gap),
        $lte: rating + gap,
      },
    };
    const ownerCandidates = await orderedHistoricalRecordOwners({
      eligibility,
      rating,
    });
    if (!ownerCandidates.length) continue;
    const owners = await User.find({ _id: { $in: ownerCandidates.map((row) => row._id) } })
      .select("_id isTestAccount arenaTestMatchEnabled accountStatus isActive")
      .lean();
    const ownerById = new Map(owners.map((owner) => [id(owner), owner]));
    for (const ownerCandidate of ownerCandidates) {
      const owner = ownerById.get(id(ownerCandidate._id));
      if (!owner || owner.accountStatus !== "active" || owner.isActive === false) continue;
      const recordCandidates = await orderedHistoricalRecordsForOwner({
        eligibility,
        ownerUserId: owner._id,
        rating,
      });
      for (const candidate of recordCandidates) {
        // Ordinary test-account records stay isolated. An explicitly verified
        // baseline is the controlled cold-start exception for the live pool.
        if (candidate.isBaseline !== true && !sameTestAccountCohort(user, owner)) continue;
        if (await legacyRecordOverlapsExposure(candidate, exposedHashes)) continue;
        const reserved = await ArenaCompetitiveRecord.findOneAndUpdate(
          {
            _id: candidate._id,
            recordMode: "COMPETITIVE",
            ownerUserId: owner._id,
            status: "AVAILABLE",
          },
          {
            $set: {
              status: "RESERVED",
              reservedByUserId: user._id,
              reservedAt: now,
              reservationExpiresAt: new Date(now.getTime() + GOAT_ARENA_V2_CONFIG.asyncCompetitive.reservationTtlMs),
            },
          },
          { returnDocument: "after" }
        ).lean();
        if (reserved) return { record: reserved, allowedRatingGap: gap };
      }
    }
  }
  throw statusError(
    409,
    "현재 레이팅 범위에서 연결할 수 있는 경기 상대가 없습니다.",
    "ARENA_COMPETITIVE_RECORD_UNAVAILABLE"
  );
}

async function releaseRecord(recordId, matchId = null, session = null) {
  const query = {
    _id: recordId,
    recordMode: "COMPETITIVE",
    status: "RESERVED",
    ...(matchId ? { reservedByMatchId: matchId } : { reservedByMatchId: null }),
  };
  return ArenaCompetitiveRecord.updateOne(
    query,
    {
      $set: { status: "AVAILABLE" },
      $unset: {
        reservedByUserId: 1,
        reservedByMatchId: 1,
        reservedAt: 1,
        reservationExpiresAt: 1,
      },
    },
    session ? { session } : undefined
  );
}

async function startAsyncCompetitiveMatch({ userId, now = new Date() }) {
  const { assertQueueEligibility, generateArenaV2Pack } = require("./arenaV2MatchmakingService");
  const { user, profile } = await assertQueueEligibility({ userId, mode: "COMPETITIVE", now });
  assertSolutionSharingConsent(profile);
  const closeScoreThreshold = configuredCloseScoreThreshold();
  const challengerRatingBefore = ratingState(profile);
  const reservation = await reserveHistoricalRecord({
    user,
    rating: challengerRatingBefore.rating,
    now,
  });
  const record = reservation.record;
  try {
    const [owner, historicalEvidence, historicalPack] = await Promise.all([
      User.findById(record.ownerUserId)
        .select("_id name isTestAccount arenaTestMatchEnabled accountStatus isActive")
        .lean(),
      ArenaMatchEvidence.findById(record.sourceEvidenceId).lean(),
      ArenaProblemPack.findById(record.sourceProblemPackId).select("+questions").lean(),
    ]);
    if (
      !owner || owner.accountStatus !== "active" || owner.isActive === false ||
      !historicalEvidence?.originalEvidenceSubmitted || historicalEvidence.contentPurgedAt ||
      !historicalEvidence.files?.length || historicalPack?.questions?.length !== 5 || historicalPack.questions.some(arenaQuestionReleaseIssue)
    ) {
      await ArenaCompetitiveRecord.updateOne(
        { _id: record._id, status: "RESERVED", reservedByUserId: user._id },
        { $set: { status: "INVALID" }, $unset: { reservedByUserId: 1, reservedAt: 1, reservationExpiresAt: 1 } }
      );
      throw statusError(409, "상대의 경기 원본을 확인할 수 없습니다.", "ARENA_COMPETITIVE_RECORD_INVALID");
    }
    const matchId = new mongoose.Types.ObjectId();
    let pack = null;
    let hashes = [];
    let sourceRates = [];
    const historicalHashes = new Set([...(record.questionInstanceHashes || []), ...questionHashesForPacks([historicalPack])]);
    const exposedHashes = await priorExposedQuestionHashes(user._id);
    for (let candidateIndex = 0; candidateIndex < PACK_GENERATION_CANDIDATE_LIMIT; candidateIndex += 1) {
      const candidateKey = `ARENA21:${user._id}:${record._id}:${matchId}:${candidateIndex}`;
      const candidate = await generateArenaV2Pack({
        matchKey: candidateKey,
        mode: "COMPETITIVE",
        challenger: user,
        defender: owner,
        challengerProfile: profile,
        defenderProfile: record.ratingSnapshot,
        now,
      });
      const candidateHashes = candidate.questions.map(questionInstanceHash);
      let candidateRates;
      try {
        candidateRates = exactSourceRates(candidate);
      } catch (error) {
        if (error.code === "ARENA_COMPETITIVE_ACCURACY_UNAVAILABLE") continue;
        throw error;
      }
      if (candidate.questions.some((question) => questionInstanceHashAliases(question)
        .some((hash) => historicalHashes.has(hash) || exposedHashes.has(hash)))) continue;
      pack = candidate;
      hashes = candidateHashes;
      sourceRates = candidateRates;
      break;
    }
    if (!pack) {
      throw statusError(
        409,
        "상대와 겹치지 않고 원문 정답률이 확인되는 문제 구성을 만들지 못했습니다.",
        "ARENA_COMPETITIVE_PACK_UNAVAILABLE"
      );
    }
    const session = await mongoose.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        const claimed = await ArenaCompetitiveRecord.updateOne(
          {
            _id: record._id,
            status: "RESERVED",
            reservedByUserId: user._id,
            reservedByMatchId: null,
          },
          {
            $set: { reservedByMatchId: matchId, reservationExpiresAt: null },
          },
          { session }
        );
        if (claimed.modifiedCount !== 1) {
          throw statusError(409, "경기 상대 연결 시간이 만료되었습니다.", "ARENA_COMPETITIVE_RECORD_CLAIM_LOST");
        }
        if (record) await retainArenaEvidence({
          evidenceId: record.sourceEvidenceId, referenceKey: `MATCH:${matchId}`, now, session,
        });
        const problemPackId = new mongoose.Types.ObjectId();
        const matchKey = `ARENA21:${matchId}`;
        const match = {
          _id: matchId,
          matchKey,
          arenaVersion: "2.0",
          gameMode: "COMPETITIVE",
          division: "MAIN",
          seasonKey: kstSeasonKey(now),
          competitivePool: "ALL",
          matchType: "NORMAL",
          matchOrigin: "ARENA_2_ASYNC_RECORD",
          requestInitiatorUserId: user._id,
          tierPairKey: pack.tierPairKey,
          tierPairLabel: pack.tierPairLabel,
          challenger: { userId: user._id },
          defender: { userId: owner._id },
          status: "READY",
          policyVersionCode: "GOAT_ARENA_2_1_COMPETITIVE",
          problemPackId,
          problemPackVersion: pack.version,
          scoringVersion: SCORING_VERSION,
          timeLimitMs: pack.timeLimitMs,
          requestedAt: now,
          startDeadlineAt: new Date(now.getTime() + ARENA_ONE_ON_ONE_START_LIMIT_MS),
          readyAt: now,
          integrityStatus: "PENDING",
          competitiveAsync: {
            enabled: true,
            historicalRecordId: record._id,
            historicalOwnerUserId: owner._id,
            challengerRatingBefore,
            challengerSourceRates: sourceRates,
            questionInstanceHashes: hashes,
            opponentQuestionInstanceHashes: [...historicalHashes],
            reservationExpiresAt: record.reservationExpiresAt,
            pendingComparison: { closeScoreThreshold, scoringVersion: SCORING_VERSION },
          },
        };
        await ArenaProblemPack.create([{ ...pack, _id: problemPackId }], { session, ordered: true });
        await ArenaMatch.create([match], { session, ordered: true });
        await ArenaMatchAttempt.create([{
          matchId,
          userId: user._id,
          role: "CHALLENGER",
          problemPackId,
          problemPackVersion: pack.version,
          variantCode: "INDIVIDUAL",
          status: "READY",
          answers: pack.questions.map((question) => ({
            questionKey: question.questionKey,
            value: "",
            revision: 0,
            lastChangedAt: null,
          })),
        }], { session, ordered: true });
        await ArenaMatchParticipantLock.create([{
          userId: user._id,
          matchId,
          acquiredAt: now,
        }], { session, ordered: true });
        await ArenaOutboxEvent.create([{
          eventType: "ArenaMatchCreated",
          aggregateType: "ArenaMatch",
          aggregateId: matchId,
          idempotencyKey: `${matchId}:ArenaMatchCreated`,
          payload: {
            arenaVersion: "2.0",
            competitiveVersion: "2.1",
            gameMode: "COMPETITIVE",
            asynchronous: true,
            challengerUserId: user._id,
            historicalOwnerUserId: owner._id,
            historicalRecordId: record._id,
          },
        }, {
          eventType: "ArenaMatchReady",
          aggregateType: "ArenaMatch",
          aggregateId: matchId,
          idempotencyKey: `${matchId}:ArenaMatchReady`,
          payload: { arenaVersion: "2.0", competitiveVersion: "2.1", problemPackVersion: pack.version },
        }], { session, ordered: true });
        created = match;
      });
    } finally {
      await session.endSession();
    }
    return { match: created, allowedRatingGap: reservation.allowedRatingGap };
  } catch (error) {
    await ArenaCompetitiveRecord.updateOne(
      { _id: record._id, status: "RESERVED", reservedByUserId: user._id, reservedByMatchId: null },
      { $set: { status: "AVAILABLE" }, $unset: { reservedByUserId: 1, reservedAt: 1, reservationExpiresAt: 1 } }
    );
    throw error;
  }
}

function competitiveRecordDraft({
  ownerUserId,
  sourceMatchId,
  attempt,
  evidence,
  problemPack,
  ratingSnapshot,
  performance,
  isBaseline = false,
  recordLabel = "과거 기록",
  consentVersion,
  verifiedAt,
}) {
  if (!evidence?.originalEvidenceSubmitted || !evidence?.files?.length || evidence.contentPurgedAt) {
    throw statusError(409, "완전한 원본 풀이 업로드만 경쟁전 기록으로 사용할 수 있습니다.", "ARENA_COMPETITIVE_EVIDENCE_INCOMPLETE");
  }
  return {
    recordMode: "COMPETITIVE",
    ownerUserId,
    sourceMatchId,
    sourceAttemptId: attempt._id,
    sourceEvidenceId: evidence._id,
    sourceProblemPackId: problemPack._id,
    ratingSnapshot,
    performance,
    questionInstanceHashes: problemPack.questions.map(questionInstanceHash),
    status: "AVAILABLE",
    isBaseline,
    recordLabel,
    consentVersion,
    verifiedAt,
  };
}

async function registerVerifiedCompetitiveRecord({
  sourceMatchId,
  ownerUserId,
  ratingSnapshot = null,
  isBaseline = false,
  recordLabel = "과거 기록",
  consentVersion = null,
  verifiedAt = new Date(),
  session = null,
}) {
  const expectedConsent = GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion;
  const [match, attempt, evidence, profile] = await Promise.all([
    ArenaMatch.findById(sourceMatchId).session(session).lean(),
    ArenaMatchAttempt.findOne({ matchId: sourceMatchId, userId: ownerUserId, status: "SUBMITTED" }).session(session).lean(),
    ArenaMatchEvidence.findOne({ matchId: sourceMatchId, userId: ownerUserId, originalEvidenceSubmitted: true }).session(session).lean(),
    ArenaCompetitiveProfile.findOne({ userId: ownerUserId }).session(session).lean(),
  ]);
  if (!match || !attempt || !evidence || !profile) {
    throw statusError(409, "검증된 경기 기록 구성요소를 찾을 수 없습니다.", "ARENA_COMPETITIVE_RECORD_INPUT_MISSING");
  }
  if (
    match.status !== "SETTLED" ||
    match.integrityStatus !== "CLEAR" ||
    !["ON_TIME", "REVIEWED"].includes(evidence.status)
  ) {
    throw statusError(
      409,
      "최종 정산과 무결성 확인이 끝난 실제 경기만 과거 기록으로 등록할 수 있습니다.",
      "ARENA_COMPETITIVE_RECORD_NOT_VERIFIED"
    );
  }
  assertSolutionSharingConsent(profile);
  if (consentVersion && consentVersion !== expectedConsent) {
    throw statusError(
      409,
      "현재 풀이 공개 동의 버전으로만 경쟁 기록을 등록할 수 있습니다.",
      "ARENA_COMPETITIVE_CONSENT_VERSION_MISMATCH"
    );
  }
  const effectiveConsent = expectedConsent;
  const problemPack = await ArenaProblemPack.findById(attempt.problemPackId)
    .select("+questions").session(session).lean();
  const { performance } = performanceForAttempt({ attempt, problemPack });
  const draft = competitiveRecordDraft({
    ownerUserId,
    sourceMatchId,
    attempt,
    evidence,
    problemPack,
    ratingSnapshot: ratingSnapshot || ratingState(profile),
    performance,
    isBaseline,
    recordLabel: isBaseline ? String(recordLabel || "기준 기록") : String(recordLabel || "과거 기록"),
    consentVersion: effectiveConsent,
    verifiedAt: new Date(verifiedAt),
  });
  const options = { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, ...(session ? { session } : {}) };
  return ArenaCompetitiveRecord.findOneAndUpdate(
    { sourceAttemptId: attempt._id },
    { $setOnInsert: draft },
    options
  );
}

async function invalidateAsyncMatch({ match, reason, now, session, pendingComparison = null }) {
  match.status = "INVALID";
  match.integrityStatus = "INVALID";
  match.resolvedAt = now;
  match.settledAt = now;
  match.settlementIdempotencyKey = `${match._id}:${ASYNC_SETTLEMENT_VERSION}:INVALID`;
  match.competitiveAsync.pendingComparison = pendingComparison || match.competitiveAsync.pendingComparison;
  match.resultSnapshot = {
    scoringPolicyVersion: SCORING_VERSION,
    tieBreakStep: String(reason).slice(0, 80),
    winnerRole: null,
    settlementSummary: {
      version: ASYNC_SETTLEMENT_VERSION,
      gameMode: "COMPETITIVE",
      asynchronous: true,
      valid: false,
      mmrChanged: false,
      xpAwarded: false,
      reason,
      comparison: pendingComparison,
    },
    resolvedAt: now,
  };
  await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.competitiveAsync?.historicalRecordId, matchId: match._id, now, session });
      }
  await releaseRecord(match.competitiveAsync.historicalRecordId, match._id, session);
  await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
  return { status: "INVALID", settled: false, invalid: true, resultSnapshot: match.resultSnapshot };
}

async function settleAsyncCompetitiveMatch({
  matchId,
  now = new Date(),
  forcedWinnerRole = null,
  automaticReason = "",
  session: existingSession = null,
}) {
  const session = existingSession || await mongoose.startSession();
  const ownsSession = !existingSession;
  let result;
  try {
    const settle = async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!isAsyncCompetitiveMatch(match)) {
        throw statusError(404, "경쟁전을 찾을 수 없습니다.", "ARENA_ASYNC_MATCH_NOT_FOUND");
      }
      if (match.status === "SETTLED") {
        result = { status: "SETTLED", settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (["CANCELLED", "INVALID"].includes(match.status)) {
        result = { status: match.status, settled: false, replayed: true, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD" || match.integrityStatus === "SUSPICIOUS") {
        result = { status: "HELD", settled: false, held: true };
        return;
      }
      const automatic = ["CHALLENGER", "DEFENDER"].includes(String(forcedWinnerRole || "").toUpperCase());
      if (
        automatic &&
        ["START_DEADLINE_NO_SHOW", "REQUIRED_EVIDENCE_NOT_SUBMITTED"].includes(String(automaticReason || ""))
      ) {
        result = await cancelAsyncCompetitiveMatch({
          matchId,
          now,
          reason: String(automaticReason),
          session,
        });
        return;
      }
      const attempt = await ArenaMatchAttempt.findOne({ matchId: match._id, userId: match.challenger.userId })
        .session(session).lean();
      const record = await ArenaCompetitiveRecord.findById(match.competitiveAsync.historicalRecordId)
        .session(session);
      if (!record || (record.status !== "RESERVED" && record.consumedByMatchId?.toString() !== id(match))) {
        throw statusError(409, "연결된 경기 상대를 확인할 수 없습니다.", "ARENA_COMPETITIVE_RECORD_NOT_RESERVED");
      }
      let challengerPerformance = null;
      let comparison = null;
      let challengerScoring = { score: 0, correctCount: 0, correctAnswerSolveTimeMs: null, totalSolveTimeMs: null };
      let evidence = null;
      let currentPack = null;
      if (!automatic) {
        if (match.status !== "SUBMITTED" || match.integrityStatus !== "CLEAR" || attempt?.status !== "SUBMITTED") {
          result = { status: match.status, settled: false, waiting: true };
          return;
        }
        evidence = await ArenaMatchEvidence.findOne({
          matchId: match._id,
          attemptId: attempt._id,
          originalEvidenceSubmitted: true,
          submittedAt: { $ne: null },
          "files.0": { $exists: true },
        }).session(session).lean();
        currentPack = await ArenaProblemPack.findById(attempt.problemPackId).select("+questions").session(session).lean();
        if (!evidence || !currentPack) {
          throw statusError(409, "도전자 풀이 기록을 확인할 수 없습니다.", "ARENA_COMPETITIVE_CHALLENGER_RECORD_INCOMPLETE");
        }
        const calculated = performanceForAttempt({
          attempt,
          problemPack: currentPack,
          sourceRates: match.competitiveAsync.challengerSourceRates,
        });
        challengerPerformance = calculated.performance;
        challengerScoring = calculated.scoring;
        comparison = compareCompetitivePerformance(challengerPerformance, record.performance, {
          closeScoreThreshold: configuredCloseScoreThreshold(),
        });
        if (!comparison.valid) {
          result = await invalidateAsyncMatch({ match, reason: comparison.reason, now, session, pendingComparison: comparison });
          return;
        }
      }
      const winnerRole = automatic ? String(forcedWinnerRole).toUpperCase() : comparison.winnerRole;
      const profile = await ArenaCompetitiveProfile.findOne({ userId: match.challenger.userId }).session(session);
      if (!profile?.placementFinalizedAt || profile.competitiveSolutionSharingConsentVersion !== GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion) {
        throw statusError(409, "확정된 도전자 경쟁전 프로필을 확인할 수 없습니다.", "ARENA_COMPETITIVE_PROFILE_INVALID");
      }
      const before = currentArenaRatingState(profile);
      const adaptive = adaptiveRatingUpdate({
        before,
        opponent: record.ratingSnapshot,
        winnerRole,
        profile,
        mode: "COMPETITIVE",
      });
      const after = {
        ...adaptive.after,
        tier: String(profile.tier || tierForRating(profile.competitiveScore ?? before.rating).name),
      };
      const pointChange = competitivePointUpdate({
        beforeScore: profile.competitiveScore,
        playerMmr: (match.competitiveAsync.challengerRatingBefore || before).rating,
        opponentMmr: record.ratingSnapshot.rating,
        winnerRole,
      });
      after.tier = pointChange.tierAfter;
      applyArenaRatingState(profile, after, now);
      profile.competitiveScore = pointChange.after;
      profile.lastScoreDelta = pointChange.delta;
      profile.lastScoreChangedAt = now;
      profile.scoreInitializedAt = profile.scoreInitializedAt || now;
      profile.tier = after.tier;
      profile.lastRatedAt = now;
      profile.competitiveMatchesCompleted = Number(profile.competitiveMatchesCompleted || 0) + 1;
      if (!winnerRole) profile.draws = Number(profile.draws || 0) + 1;
      else if (winnerRole === "CHALLENGER") profile.wins = Number(profile.wins || 0) + 1;
      else profile.losses = Number(profile.losses || 0) + 1;
      if (!automatic) {
        profile.accountXp = Number(profile.accountXp || 0) + GOAT_ARENA_V2_CONFIG.progression.xpPerValidMatch;
        profile.accountLevel = buildArenaActivityLevel(profile.accountXp).level;
      }
      await profile.save({ session });
      const challengerRating = ratingSummary({ ...before, tier: pointChange.tierBefore }, after, adaptive.audit);
      const settlementSummary = {
        version: ASYNC_SETTLEMENT_VERSION,
        gameMode: "COMPETITIVE",
        asynchronous: true,
        valid: true,
        result: outcomeName(winnerRole),
        automaticReason: automatic ? String(automaticReason || "FORFEIT") : "",
        mmrChanged: true,
        historicalOpponentRatingChanged: false,
        xpAwarded: !automatic,
        xpPerPlayer: automatic ? 0 : GOAT_ARENA_V2_CONFIG.progression.xpPerValidMatch,
        challengerRating,
        competitiveScore: pointChange,
        opponentRatingSnapshot: record.ratingSnapshot,
        comparison: automatic ? {
          scoringVersion: SCORING_VERSION,
          valid: true,
          winnerRole,
          reason: String(automaticReason || "FORFEIT"),
          explanation: "도전자가 풀이 업로드 전에 경기를 포기하여 상대의 승리로 처리했습니다.",
        } : comparison,
        historicalRecord: {
          id: id(record),
          label: record.recordLabel,
          isBaseline: record.isBaseline,
        },
      };
      await ArenaRatingSettlement.create([{
        matchId: match._id,
        mode: "COMPETITIVE",
        outcome: outcomeName(winnerRole),
        challenger: {
          userId: id(match.challenger.userId),
          rating: challengerRating,
          competitiveScore: pointChange,
          xpAfter: profile.accountXp,
          levelAfter: profile.accountLevel,
        },
        defender: {
          userId: id(record.ownerUserId),
          historicalRecordId: id(record),
          ratingSnapshot: record.ratingSnapshot,
          ratingChanged: false,
        },
        settledAt: now,
      }], { session, ordered: true });
      record.status = "AVAILABLE";
      record.usageCount = Number(record.usageCount || 0) + 1;
      record.lastUsedAt = now;
      record.reservedByUserId = null;
      record.reservedByMatchId = null;
      record.reservedAt = null;
      record.reservationExpiresAt = null;
      await record.save({ session });
      if (!automatic) {
        const newRecord = competitiveRecordDraft({
          ownerUserId: match.challenger.userId,
          sourceMatchId: match._id,
          attempt,
          evidence,
          problemPack: currentPack,
          ratingSnapshot: after,
          performance: challengerPerformance,
          recordLabel: "검증된 경쟁전 기록",
          consentVersion: profile.competitiveSolutionSharingConsentVersion,
          verifiedAt: now,
        });
        await ArenaCompetitiveRecord.create([newRecord], { session, ordered: true });
      }
      match.status = "SETTLED";
      match.winnerRole = winnerRole;
      match.integrityStatus = "CLEAR";
      match.resolvedAt = now;
      match.settledAt = now;
      match.settlementIdempotencyKey = `${match._id}:${ASYNC_SETTLEMENT_VERSION}`;
      match.competitiveAsync.pendingComparison = automatic ? settlementSummary.comparison : comparison;
      match.resultSnapshot = {
        scoringPolicyVersion: SCORING_VERSION,
        challenger: {
          score: challengerScoring.score,
          correctCount: challengerScoring.correctCount,
          correctAnswerSolveTimeMs: challengerScoring.correctAnswerSolveTimeMs,
          totalSolveTimeMs: challengerScoring.totalSolveTimeMs,
        },
        defender: {
          score: 0,
          correctCount: Number(record.performance?.correctCount || 0),
          correctAnswerSolveTimeMs: null,
          totalSolveTimeMs: record.performance?.totalSolveTimeMs ?? null,
        },
        tieBreakStep: automatic ? String(automaticReason || "FORFEIT") : comparison.reason,
        winnerRole,
        settlementSummary,
        resolvedAt: now,
      };
      await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.competitiveAsync?.historicalRecordId, matchId: match._id, now, session });
      }
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      await ArenaOutboxEvent.findOneAndUpdate(
        { idempotencyKey: `${match._id}:ArenaMatchSettled` },
        { $setOnInsert: {
          eventType: "ArenaMatchSettled",
          aggregateType: "ArenaMatch",
          aggregateId: match._id,
          idempotencyKey: `${match._id}:ArenaMatchSettled`,
          payload: {
            arenaVersion: "2.0",
            competitiveVersion: "2.1",
            gameMode: "COMPETITIVE",
            asynchronous: true,
            winnerRole,
            challengerOnlyRatingUpdate: true,
            settlementVersion: ASYNC_SETTLEMENT_VERSION,
          },
        } },
        { upsert: true, setDefaultsOnInsert: true, session }
      );
      result = { status: "SETTLED", settled: true, replayed: false, winnerRole, resultSnapshot: match.resultSnapshot };
    };
    if (ownsSession) await session.withTransaction(settle);
    else await settle();
    return result;
  } catch (error) {
    if (ownsSession && Number(error?.code) === 11000) {
      const match = await ArenaMatch.findById(matchId).lean();
      if (match?.status === "SETTLED") {
        return { status: "SETTLED", settled: true, replayed: true, winnerRole: match.winnerRole, resultSnapshot: match.resultSnapshot };
      }
    }
    throw error;
  } finally {
    if (ownsSession) await session.endSession();
  }
}

async function screenAndFinalizeAsyncCompetitiveMatch({ matchId, userId, now = new Date() }) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!isAsyncCompetitiveMatch(match) || id(match.challenger.userId) !== id(userId)) {
        throw statusError(404, "도전 중인 경쟁전을 찾을 수 없습니다.", "ARENA_ASYNC_MATCH_NOT_FOUND");
      }
      if (match.status === "SETTLED") {
        result = { status: "SETTLED", settled: true, replayed: true, resultSnapshot: match.resultSnapshot };
        return;
      }
      if (match.status === "HELD") {
        result = { status: "HELD", held: true, replayed: true };
        return;
      }
      const [attempt, record] = await Promise.all([
        ArenaMatchAttempt.findOne({ matchId: match._id, userId }).session(session).lean(),
        ArenaCompetitiveRecord.findById(match.competitiveAsync.historicalRecordId).session(session).lean(),
      ]);
      const evidence = await ArenaMatchEvidence.findOne({
        matchId: match._id,
        attemptId: attempt?._id,
        originalEvidenceSubmitted: true,
      }).session(session);
      const problemPack = await ArenaProblemPack.findById(attempt?.problemPackId)
        .select("+questions").session(session).lean();
      if (attempt?.status !== "SUBMITTED" || !evidence?.files?.length || !problemPack || !record) {
        throw statusError(409, "풀이 업로드 완료 기록을 확인할 수 없습니다.", "ARENA_ASYNC_EVIDENCE_INCOMPLETE");
      }
      const { performance, scoring } = performanceForAttempt({
        attempt,
        problemPack,
        sourceRates: match.competitiveAsync.challengerSourceRates,
      });
      const comparison = compareCompetitivePerformance(performance, record.performance, {
        closeScoreThreshold: configuredCloseScoreThreshold(),
      });
      match.competitiveAsync.pendingComparison = comparison;
      if (!comparison.valid) {
        result = await invalidateAsyncMatch({ match, reason: comparison.reason, now, session, pendingComparison: comparison });
        return;
      }
      const detectedFlags = await detectEvidenceAnomalies({
        attempt,
        scoring,
        files: evidence.files || [],
        session,
      });
      const flags = [...new Set([...(evidence.sourceRiskFlags || []), ...detectedFlags])];
      evidence.anomalyFlags = flags;
      evidence.screenedAsWinner = comparison.winnerRole === "CHALLENGER";
      evidence.status = flags.length ? "ANOMALY_FLAGGED" : "ON_TIME";
      await evidence.save({ session });
      if (flags.length) {
        match.status = "HELD";
        match.integrityStatus = "SUSPICIOUS";
        match.integrityScreenedRole = "CHALLENGER";
        match.integrityReviewStartedAt = now;
        match.integrityReviewDeadlineAt = new Date(now.getTime() + REVIEW_TARGET_MS);
        await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.competitiveAsync?.historicalRecordId, matchId: match._id, now, session });
      }
        await ArenaAccessState.findOneAndUpdate(
          { userId },
          { $set: { integrityStatus: "REVIEW_REQUIRED", reasonCode: "MATCH_INTEGRITY_REVIEW" }, $setOnInsert: { userId } },
          { upsert: true, setDefaultsOnInsert: true, session }
        );
        await AdminTodo.findOneAndUpdate(
          { sourceType: "ArenaMatchIntegrityReview", sourceId: match._id },
          { $setOnInsert: {
            category: "integrity",
            title: "GOAT Arena 2.1 비동기 경쟁전 무결성 검토 필요",
            description: "도전자 풀이 기록에서 확인이 필요한 신호가 감지되었습니다. 과거 기록 소유자의 레이팅에는 영향을 주지 않습니다.",
            href: `/admin/arena-matches#match-${match._id}`,
            targetUserId: userId,
            actorUserId: userId,
            sourceType: "ArenaMatchIntegrityReview",
            sourceId: match._id,
            status: "pending",
            metadata: { matchId: id(match), anomalyFlags: flags, screenedRole: "CHALLENGER", asynchronous: true },
          } },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
        );
        result = { status: "HELD", held: true, anomalyFlags: flags };
        return;
      }
      match.status = "SUBMITTED";
      match.integrityStatus = "CLEAR";
      await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.competitiveAsync?.historicalRecordId, matchId: match._id, now, session });
      }
      result = await settleAsyncCompetitiveMatch({ matchId, now, session });
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function cancelAsyncCompetitiveMatch({
  matchId,
  userId = null,
  now = new Date(),
  reason = "INVALID_OR_INCOMPLETE_MATCH",
  session: existingSession = null,
}) {
  const session = existingSession || await mongoose.startSession();
  const ownsSession = !existingSession;
  let result;
  try {
    const cancel = async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!isAsyncCompetitiveMatch(match)) {
        throw statusError(404, "취소할 경쟁전을 찾을 수 없습니다.", "ARENA_ASYNC_MATCH_NOT_FOUND");
      }
      if (userId && id(match.challenger.userId) !== id(userId)) {
        throw statusError(403, "이 경기를 취소할 권한이 없습니다.", "ARENA_MATCH_FORBIDDEN");
      }
      if (["CANCELLED", "INVALID"].includes(match.status)) {
        result = { cancelled: true, replayed: true, status: match.status };
        return;
      }
      if (match.status === "SETTLED") {
        result = { cancelled: false, replayed: true, status: match.status };
        return;
      }
      match.status = "CANCELLED";
      match.integrityStatus = "CLEAR";
      match.resolvedAt = now;
      match.settledAt = now;
      match.settlementIdempotencyKey = `${match._id}:${ASYNC_SETTLEMENT_VERSION}:CANCEL`;
      match.resultSnapshot = {
        scoringPolicyVersion: SCORING_VERSION,
        tieBreakStep: String(reason).slice(0, 80),
        winnerRole: null,
        settlementSummary: {
          version: ASYNC_SETTLEMENT_VERSION,
          gameMode: "COMPETITIVE",
          asynchronous: true,
          valid: false,
          mmrChanged: false,
          xpAwarded: false,
          reason,
        },
        resolvedAt: now,
      };
      await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.competitiveAsync?.historicalRecordId, matchId: match._id, now, session });
      }
      await releaseRecord(match.competitiveAsync.historicalRecordId, match._id, session);
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      result = { cancelled: true, replayed: false, status: match.status };
    };
    if (ownsSession) await session.withTransaction(cancel);
    else await cancel();
    return result;
  } finally {
    if (ownsSession) await session.endSession();
  }
}

function publicQuestion(question, observation, index) {
  const sourceAccuracyRate = Number(observation?.p);
  return {
    slot: index + 1,
    questionKey: question.questionKey,
    prompt: question.prompt,
    choices: question.choices || [],
    visualization: question.visualization || null,
    category: question.category,
    difficultyClass: question.difficultyClass,
    correct: observation?.x === 1,
    sourceAccuracyRate:
      Number.isFinite(sourceAccuracyRate) &&
      sourceAccuracyRate > 0 &&
      sourceAccuracyRate < 1
        ? sourceAccuracyRate
        : null,
  };
}

function submittedAnswerForQuestion(attempt, question) {
  const answer = (attempt?.answers || []).find(
    (candidate) => String(candidate?.questionKey || "") === String(question?.questionKey || "")
  );
  const value = typeof answer?.value === "string" ? answer.value.trim() : "";
  return value || null;
}

function publicEvidenceFiles(matchId, side, evidence) {
  return (evidence?.files || []).map((file, index) => ({
    index: index + 1,
    side,
    fileIndex: index + 1,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    href: `/goat-arena/matches/${matchId}/competitive-result/evidence/${side}/${index + 1}`,
  }));
}

async function loadAuthorizedResultParts({ matchId, userId }) {
  if (!mongoose.isObjectIdOrHexString(matchId)) throw statusError(404, "경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
  const match = await ArenaMatch.findById(matchId).lean();
  if (!isAsyncCompetitiveMatch(match)) {
    throw statusError(404, "경쟁전 결과를 찾을 수 없습니다.", "ARENA_ASYNC_MATCH_NOT_FOUND");
  }
  const authorized = [match.challenger?.userId, match.competitiveAsync?.historicalOwnerUserId]
    .some((candidate) => id(candidate) === id(userId));
  if (!authorized) throw statusError(403, "경기 참가자만 풀이 기록을 볼 수 있습니다.", "ARENA_RESULT_FORBIDDEN");
  const [record, challengerAttempt] = await Promise.all([
    ArenaCompetitiveRecord.findById(match.competitiveAsync.historicalRecordId).lean(),
    ArenaMatchAttempt.findOne({ matchId: match._id, userId: match.challenger.userId }).lean(),
  ]);
  const [challengerEvidence, challengerPack] = await Promise.all([
    ArenaMatchEvidence.findOne({ matchId: match._id, attemptId: challengerAttempt?._id, originalEvidenceSubmitted: true }).lean(),
    ArenaProblemPack.findById(challengerAttempt?.problemPackId).select("+questions").lean(),
  ]);
  if (!challengerEvidence?.files?.length) {
    throw statusError(409, "도전자 풀이 업로드 후 결과를 확인할 수 있습니다.", "ARENA_RESULT_NOT_UNLOCKED");
  }
  const [historicalAttempt, historicalEvidence, historicalPack, users] = await Promise.all([
    ArenaMatchAttempt.findById(record?.sourceAttemptId).lean(),
    ArenaMatchEvidence.findById(record?.sourceEvidenceId).lean(),
    ArenaProblemPack.findById(record?.sourceProblemPackId).select("+questions").lean(),
    User.find({ _id: { $in: [match.challenger.userId, match.competitiveAsync.historicalOwnerUserId] } })
      .select("_id name username").lean(),
  ]);
  if (!record || !challengerAttempt || !challengerPack || !historicalAttempt ||
      !historicalEvidence?.files?.length || historicalEvidence.contentPurgedAt || !historicalPack) {
    throw statusError(409, "양쪽 실제 문제와 풀이 원본을 모두 확인할 수 없습니다.", "ARENA_RESULT_RECORD_INCOMPLETE");
  }
  return { match, record, challengerAttempt, challengerEvidence, challengerPack, historicalAttempt, historicalEvidence, historicalPack, users };
}

async function getAsyncCompetitiveResult({ matchId, userId }) {
  if (!mongoose.isObjectIdOrHexString(matchId)) {
    throw statusError(404, "경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
  }
  const parts = await loadAuthorizedResultParts({ matchId, userId });
  const { match, record, challengerAttempt, challengerEvidence, challengerPack,
    historicalAttempt, historicalEvidence, historicalPack, users } = parts;
  const userById = new Map(users.map((user) => [id(user), user]));
  const challengerCalculated = performanceForAttempt({
    attempt: challengerAttempt,
    problemPack: challengerPack,
    sourceRates: match.competitiveAsync.challengerSourceRates,
  });
  const challengerPerformance = challengerCalculated.performance;
  const historicalPerformance = record.performance;
  const comparison = match.resultSnapshot?.settlementSummary?.comparison ||
    match.competitiveAsync.pendingComparison || null;
  const provisional = ["HELD", "SUBMITTED", "RESOLVED"].includes(match.status);
  const verdictLabel = match.status === "INVALID"
    ? "경기 무효"
    : match.status === "CANCELLED"
      ? "경기 취소"
      : provisional
        ? "최종 판정 대기"
        : (match.winnerRole || comparison?.winnerRole) === "CHALLENGER"
          ? "도전자 승리"
          : (match.winnerRole || comparison?.winnerRole) === "DEFENDER"
            ? "상대 승리"
            : "무승부";
  const competitor = (side, ownerId, pack, attempt, evidence, performance, label) => ({
    side,
    isViewer: id(ownerId) === id(userId),
    user: {
      id: id(ownerId),
      name: userById.get(id(ownerId))?.name || userById.get(id(ownerId))?.username || label,
    },
    label,
    questions: pack.questions.map((question, index) => ({
      ...publicQuestion(question, performance?.observations?.[index], index),
      submittedAnswer: submittedAnswerForQuestion(attempt, question),
    })),
    totalCorrect: Number(performance?.correctCount || 0),
    completionTimeMs: performance?.totalSolveTimeMs ?? null,
    difficultyAdjustedScore: Number.isFinite(Number(performance?.z))
      ? Number(performance.z)
      : null,
    solutions: publicEvidenceFiles(match._id, side, evidence),
  });
  const resultWinnerRole = match.winnerRole || comparison?.winnerRole || null;
  const publicExplanation = match.status === "INVALID"
    ? "경기 기록 검토 결과 무효 경기로 처리되었습니다."
    : match.status === "CANCELLED"
      ? "경기가 취소되었습니다."
      : provisional
        ? "제출된 경기 기록을 최종 확인하고 있습니다."
        : resultWinnerRole === "CHALLENGER"
          ? "정답, 문제 난도와 풀이 시간을 반영한 내부 평가에서 도전자가 앞섰습니다."
          : resultWinnerRole === "DEFENDER"
            ? "정답, 문제 난도와 풀이 시간을 반영한 내부 평가에서 상대가 앞섰습니다."
            : "내부 평가 결과 두 기록이 같아 무승부로 처리되었습니다.";
  const result = {
    matchId: id(match),
    asynchronous: true,
    status: match.status,
    provisional,
    invalid: match.status === "INVALID",
    verdictLabel,
    winnerRole: resultWinnerRole,
    explanation: publicExplanation,
    challenger: competitor(
      "challenger",
      match.challenger.userId,
      challengerPack,
      challengerAttempt,
      challengerEvidence,
      challengerPerformance,
      "도전자"
    ),
    historicalOpponent: {
      ...competitor(
        "historical",
        record.ownerUserId,
        historicalPack,
        historicalAttempt,
        historicalEvidence,
        historicalPerformance,
        "상대"
      ),
      isBaseline: Boolean(record.isBaseline),
    },
    competitiveScore: match.resultSnapshot?.settlementSummary?.competitiveScore || null,
    officialAnswersIncluded: false,
    viewerRole: id(userId) === id(match.challenger.userId) ? "CHALLENGER" : "HISTORICAL_OWNER",
  };
  await markResultQuestionExposure({ match, userId, packs: [challengerPack, historicalPack] });
  return result;
}

async function getAsyncCompetitiveEvidenceFile({ matchId, userId, side, fileIndex }) {
  const parts = await loadAuthorizedResultParts({ matchId, userId });
  const normalizedSide = String(side || "").toLowerCase();
  const evidence = normalizedSide === "challenger"
    ? parts.challengerEvidence
    : normalizedSide === "historical"
      ? parts.historicalEvidence
      : null;
  if (!evidence) throw statusError(404, "풀이 파일 구분을 확인해주세요.", "ARENA_EVIDENCE_SIDE_INVALID");
  const index = Number(fileIndex) - 1;
  const file = Number.isInteger(index) && index >= 0 ? evidence.files?.[index] : null;
  if (!file) throw statusError(404, "풀이 파일을 찾을 수 없습니다.", "ARENA_EVIDENCE_FILE_NOT_FOUND");
  const url = await signedStoredAssetUrl(file, {
    download: false,
    originalName: file.originalName,
    expiresIn: 5 * 60,
  });
  if (!url) throw statusError(503, "풀이 파일 보안 링크를 만들 수 없습니다.", "ARENA_EVIDENCE_URL_UNAVAILABLE");
  await markResultQuestionExposure({ match: parts.match, userId, packs: [parts.challengerPack, parts.historicalPack] });
  return { url, mimeType: file.mimeType, originalName: file.originalName };
}

module.exports = {
  ASYNC_SETTLEMENT_VERSION,
  acknowledgeCompetitiveSolutionSharing,
  cancelAsyncCompetitiveMatch,
  configuredCloseScoreThreshold,
  exactSourceRates,
  getAsyncCompetitiveEvidenceFile,
  getAsyncCompetitiveResult,
  isAsyncCompetitiveMatch,
  performanceForAttempt,
  priorExposedQuestionHashes,
  questionInstanceHash,
  registerVerifiedCompetitiveRecord,
  releaseExpiredCompetitiveReservations,
  screenAndFinalizeAsyncCompetitiveMatch,
  settleAsyncCompetitiveMatch,
  startAsyncCompetitiveMatch,
  _testing: { reserveHistoricalRecord },
};
