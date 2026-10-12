"use strict";
const { arenaQuestionReleaseIssue } = require("./arenaQuestionReleaseService");
const { retainArenaEvidence, completeArenaEvidenceReference } = require("./arenaEvidenceRetentionService");

const mongoose = require("mongoose");
const { markResultQuestionExposure, questionHashesForPacks, legacyRecordOverlapsExposure, PACK_GENERATION_CANDIDATE_LIMIT } = require("./arenaQuestionExposureService");
const { questionInstanceHashAliases } = require("./arenaQuestionIdentityService");
const { AdminTodo, User } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaNormalBaselineAssignment,
  ArenaNormalBaselineQuestion,
  ArenaNormalMatchCounter,
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
const { adaptiveRatingUpdate } = require("./arenaAdaptiveRatingService");
const { detectEvidenceAnomalies } = require("./arenaMatchEvidenceService");
const {
  performanceForAttempt,
  priorExposedQuestionHashes,
  questionInstanceHash,
} = require("./arenaAsyncCompetitiveService");
const {
  publicSourceAccuracyForQuestion,
} = require("./arenaMatchAttemptService");
const { sameTestAccountCohort } = require("./arenaActiveMatchService");
const { kstSeasonKey } = require("./arenaTimeService");
const { signedStoredAssetUrl } = require("./fileStorageService");
const { updateGlicko2Player } = require("./glicko2Service");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const {
  orderedHistoricalRecordOwners,
  orderedHistoricalRecordsForOwner,
} = require("./arenaHistoricalRecordSelectionService");
const {
  selectActiveNormalBaselineQuestionSet,
} = require("./arenaNormalBaselineQuestionService");
const { ensureArenaV2Profile, tierForRating } = require("./arenaV2ProfileService");
const { memberEvidenceWithSavedBoards } = require("./arenaSolutionEvidenceReadService");

const NORMAL_ASYNC_SETTLEMENT_VERSION = "GOAT-ARENA-NORMAL-ASYNC-V3-DIFFICULTY-ADAPTIVE-RATING";
const NORMAL_RECORD_CONSENT_VERSION = "ARENA_NORMAL_SOLUTION_SHARE_V1";

function statusError(status, message, code = "") {
  return Object.assign(new Error(message), { status, code });
}

function id(value) {
  return String(value?._id || value || "");
}

function rounded(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function isAsyncNormalMatch(match) {
  return Boolean(
    match?.arenaVersion === "2.0" &&
    match?.gameMode === "NORMAL" &&
    match?.normalAsync?.enabled
  );
}

function matchmakingRating(profile) {
  const stored = profile?.normalMatchmakingRating;
  if (stored === null || stored === undefined || stored === "") {
    return GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating;
  }
  const rating = Number(stored);
  return Number.isFinite(rating) && rating >= 0
    ? rating
    : GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRating;
}

function ratingSnapshot(profile) {
  const rating = matchmakingRating(profile);
  const storedDeviation = Number(profile?.normalMatchmakingRatingDeviation);
  const storedVolatility = Number(profile?.normalMatchmakingVolatility);
  return {
    rating,
    ratingDeviation: Math.max(
      1,
      Number.isFinite(storedDeviation) && storedDeviation > 0
        ? storedDeviation
        : GOAT_ARENA_V2_CONFIG.asyncNormal.defaultRatingDeviation
    ),
    volatility: Math.max(
      Number.EPSILON,
      Number.isFinite(storedVolatility) && storedVolatility > 0
        ? storedVolatility
        : GOAT_ARENA_V2_CONFIG.asyncNormal.defaultVolatility
    ),
    tier: tierForRating(rating).name,
  };
}

function scoreForNormalWinner(winnerRole) {
  if (!winnerRole) return 0.5;
  return winnerRole === "CHALLENGER" ? 1 : 0;
}

function updateNormalMatchmakingRating({ before, opponent, winnerRole }) {
  const updated = updateGlicko2Player(before, [{
    opponent,
    score: scoreForNormalWinner(winnerRole),
  }]);
  return {
    ...updated,
    tier: tierForRating(updated.rating).name,
  };
}

function hiddenRatingSummary(before, after, adaptiveAudit = null) {
  const round = (value) => Math.round(Number(value) * 100) / 100;
  return {
    system: "NORMAL_HIDDEN_ADAPTIVE_GLICKO2_V2",
    before: round(before.rating),
    delta: round(after.rating - before.rating),
    after: round(after.rating),
    ratingDeviationBefore: round(before.ratingDeviation),
    ratingDeviationAfter: round(after.ratingDeviation),
    volatilityBefore: before.volatility,
    volatilityAfter: after.volatility,
    adaptivePolicy: adaptiveAudit,
  };
}

function applyNormalRatingResult(profile, { before, opponent, winnerRole, now }) {
  const adaptive = adaptiveRatingUpdate({
    before,
    opponent,
    winnerRole,
    profile,
    mode: "NORMAL",
  });
  const after = {
    ...adaptive.after,
    tier: tierForRating(adaptive.after.rating).name,
  };
  profile.normalMatchmakingRating = after.rating;
  profile.normalMatchmakingRatingDeviation = after.ratingDeviation;
  profile.normalMatchmakingVolatility = after.volatility;
  profile.normalLastRatedAt = now;
  profile.normalRatedMatchesCompleted =
    Number(profile.normalRatedMatchesCompleted || 0) + 1;
  if (!winnerRole) {
    profile.normalDraws = Number(profile.normalDraws || 0) + 1;
  } else if (winnerRole === "CHALLENGER") {
    profile.normalWins = Number(profile.normalWins || 0) + 1;
  } else {
    profile.normalLosses = Number(profile.normalLosses || 0) + 1;
  }
  return hiddenRatingSummary(before, after, adaptive.audit);
}

function normalSourceRates(problemPack) {
  const questions = Array.isArray(problemPack?.questions) ? problemPack.questions : [];
  if (questions.length !== 5) {
    throw statusError(
      422,
      "일반전에는 실제 다섯 문항이 필요합니다.",
      "ARENA_NORMAL_QUESTIONS_INVALID"
    );
  }
  return questions.map((question) => {
    const source = publicSourceAccuracyForQuestion(question);
    const rate = Number(source?.min);
    if (
      !["EXACT", "CENSORED_BOUND"].includes(source?.evidenceKind) ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      rate >= 1
    ) {
      throw statusError(
        422,
        "출처 정답률 또는 공개된 정답률 하한이 확인되는 문항만 일반전에 사용할 수 있습니다.",
        "ARENA_NORMAL_ACCURACY_UNAVAILABLE"
      );
    }
    return rate;
  });
}

function performanceForNormalAttempt(input) {
  const result = performanceForAttempt(input);
  result.performance.sourceRatePolicy = "EXACT_OR_PUBLISHED_LOWER_BOUND_V1";
  return result;
}

function baselineRatingSnapshot(selection) {
  const rating = Number(selection?.targetMmr);
  return {
    rating,
    ratingDeviation: GOAT_ARENA_V2_CONFIG.asyncNormal.baselineRatingDeviation,
    volatility: GOAT_ARENA_V2_CONFIG.asyncNormal.baselineVolatility,
    tier: tierForRating(rating).name,
  };
}

function performanceForBaselineQuestions(selection) {
  const questions = Array.isArray(selection?.questions) ? selection.questions : [];
  if (questions.length !== 5) {
    throw statusError(
      409,
      "검수 완료된 기준 문제 다섯 개를 확인할 수 없습니다.",
      "ARENA_BASELINE_QUESTION_SET_INVALID"
    );
  }
  return calculateCompetitivePerformance({
    questions: questions.map((record) => ({
      questionKey: record.baselineKey,
      correct: Boolean(record.baselineCorrect),
      sourceAccuracyRate: Number(record.sourceAccuracyRate),
    })),
    totalSolveTimeMs: questions.reduce(
      (sum, record) => sum + Number(record.baselineSolveTimeMs || 0),
      0
    ),
  });
}

async function currentNormalSequence() {
  const counter = await ArenaNormalMatchCounter.findOne({ key: "GLOBAL" }).lean();
  return Number(counter?.sequence || 0);
}

async function releaseExpiredNormalReservations(now = new Date()) {
  return ArenaCompetitiveRecord.updateMany(
    {
      recordMode: "NORMAL",
      status: "RESERVED",
      reservedByMatchId: null,
      reservationExpiresAt: { $lte: now },
    },
    {
      $set: { status: "AVAILABLE" },
      $unset: { reservedByUserId: 1, reservedAt: 1, reservationExpiresAt: 1 },
    }
  );
}

async function reserveNormalRecord({ user, rating, now, excludedQuestionHashes = new Set() }) {
  await releaseExpiredNormalReservations(now);
  const gaps = [...new Set(
    GOAT_ARENA_V2_CONFIG.matchmaking.windows
      .map((window) => Number(window.ratingGap))
      .filter((gap) => Number.isFinite(gap) && gap > 0)
      .sort((left, right) => left - right)
  )];
  for (const gap of gaps) {
    const eligibility = {
      recordMode: "NORMAL",
      status: "AVAILABLE",
      ownerUserId: { $ne: user._id },
      ...(excludedQuestionHashes.size
        ? { questionInstanceHashes: { $nin: [...excludedQuestionHashes] } }
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
    const ownersById = new Map(owners.map((owner) => [id(owner), owner]));
    for (const ownerCandidate of ownerCandidates) {
      const owner = ownersById.get(id(ownerCandidate._id));
      if (!owner || owner.accountStatus !== "active" || owner.isActive === false) continue;
      const recordCandidates = await orderedHistoricalRecordsForOwner({
        eligibility,
        ownerUserId: owner._id,
        rating,
      });
      for (const candidate of recordCandidates) {
        // Keep normal test data isolated unless operations explicitly approved
        // the source as a cold-start baseline record.
        if (candidate.isBaseline !== true && !sameTestAccountCohort(user, owner)) continue;
        if (await legacyRecordOverlapsExposure(candidate, excludedQuestionHashes)) continue;
        const reserved = await ArenaCompetitiveRecord.findOneAndUpdate(
          {
            _id: candidate._id,
            recordMode: "NORMAL",
            ownerUserId: owner._id,
            status: "AVAILABLE",
          },
          {
            $set: {
              status: "RESERVED",
              reservedByUserId: user._id,
              reservedAt: now,
              reservationExpiresAt: new Date(
                now.getTime() + GOAT_ARENA_V2_CONFIG.asyncNormal.reservationTtlMs
              ),
            },
          },
          { returnDocument: "after" }
        ).lean();
        if (reserved) return { record: reserved, allowedRatingGap: gap };
      }
    }
  }
  return { record: null, allowedRatingGap: null };
}

async function releaseNormalRecord(recordId, matchId = null, session = null) {
  if (!recordId) return null;
  return ArenaCompetitiveRecord.updateOne(
    {
      _id: recordId,
      recordMode: "NORMAL",
      status: "RESERVED",
      ...(matchId ? { reservedByMatchId: matchId } : { reservedByMatchId: null }),
    },
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

async function startAsyncNormalMatch({ userId, now = new Date() }) {
  const { assertQueueEligibility, generateArenaV2Pack } = require("./arenaV2MatchmakingService");
  const { user, profile } = await assertQueueEligibility({ userId, mode: "NORMAL", now });
  const challengerRatingBefore = ratingSnapshot(profile);
  const rating = challengerRatingBefore.rating;
  const exposedHashes = await priorExposedQuestionHashes(user._id);
  const reservation = await reserveNormalRecord({
    user,
    rating,
    now,
    excludedQuestionHashes: exposedHashes,
  });
  const record = reservation.record;
  const sequenceAtStart = await currentNormalSequence();
  let baseline = null;
  if (!record) {
    try {
      baseline = await selectActiveNormalBaselineQuestionSet({
        challengerUserId: user._id,
        rating,
        sequence: sequenceAtStart + 1,
        excludedQuestionHashes: [...exposedHashes],
      });
    } catch (error) {
      if (error?.code !== "ARENA_BASELINE_QUESTION_POOL_UNAVAILABLE") throw error;
      throw statusError(
        409,
        "현재 실력 범위에서 연결할 수 있는 경기 상대가 없습니다.",
        "ARENA_NORMAL_RECORD_UNAVAILABLE"
      );
    }
  }
  try {
    const opponentOwnerUserId = record?.ownerUserId || baseline?.questions?.[0]?.createdByUserId;
    const owner = await User.findById(opponentOwnerUserId)
      .select("_id name isTestAccount arenaTestMatchEnabled accountStatus isActive")
      .lean();
    if (!owner || owner.accountStatus !== "active" || owner.isActive === false) {
      throw statusError(409, "지금 연결할 수 있는 경기 상대를 확인할 수 없습니다.", "ARENA_NORMAL_RECORD_INVALID");
    }
    const [evidence, historicalPack] = record
      ? await Promise.all([
          ArenaMatchEvidence.findById(record.sourceEvidenceId).lean(),
          ArenaProblemPack.findById(record.sourceProblemPackId).select("+questions").lean(),
        ])
      : [null, null];
    if (record && (!evidence?.originalEvidenceSubmitted || evidence.contentPurgedAt ||
        !evidence.files?.length || historicalPack?.questions?.length !== 5 || historicalPack.questions.some(arenaQuestionReleaseIssue))) {
      await ArenaCompetitiveRecord.updateOne(
        { _id: record._id, status: "RESERVED", reservedByUserId: user._id },
        { $set: { status: "INVALID" }, $unset: { reservedByUserId: 1, reservedAt: 1, reservationExpiresAt: 1 } }
      );
      throw statusError(409, "상대의 문제 또는 풀이 원본을 확인할 수 없습니다.", "ARENA_NORMAL_RECORD_INVALID");
    }

    const matchId = new mongoose.Types.ObjectId();
    const historicalHashes = new Set(
      record
        ? [...(record.questionInstanceHashes || []), ...questionHashesForPacks([historicalPack])]
        : [...baseline.questions.map((question) => question.questionInstanceHash),
          ...questionHashesForPacks([{ questions: baseline.questions.map(question => question.question) }])]
    );
    const opponentRatingSnapshot = record
      ? record.ratingSnapshot
      : baselineRatingSnapshot(baseline);
    const opponentPerformance = record
      ? record.performance
      : performanceForBaselineQuestions(baseline);
    let pack = null;
    let hashes = [];
    let sourceRates = [];
    for (let candidateIndex = 0; candidateIndex < PACK_GENERATION_CANDIDATE_LIMIT; candidateIndex += 1) {
      const candidate = await generateArenaV2Pack({
        matchKey: `ARENA-NORMAL-ASYNC:${user._id}:${record?._id || baseline.combinationHash}:${matchId}:${candidateIndex}`,
        mode: "NORMAL",
        challenger: user,
        defender: owner,
        challengerProfile: challengerRatingBefore,
        defenderProfile: opponentRatingSnapshot,
        now,
      });
      const candidateHashes = candidate.questions.map(questionInstanceHash);
      let candidateRates;
      try {
        candidateRates = normalSourceRates(candidate);
      } catch (error) {
        if (error.code === "ARENA_NORMAL_ACCURACY_UNAVAILABLE") continue;
        throw error;
      }
      if (candidate.questions.some((question) => questionInstanceHashAliases(question).some((hash) => exposedHashes.has(hash) || historicalHashes.has(hash)))) continue;
      pack = candidate;
      hashes = candidateHashes;
      sourceRates = candidateRates;
      break;
    }
    if (!pack) {
      throw statusError(
        409,
        "겹치지 않고 정답률 근거가 확인되는 일반전 문제 구성을 만들지 못했습니다.",
        "ARENA_NORMAL_PACK_UNAVAILABLE"
      );
    }

    const session = await mongoose.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        if (record) {
          const claimed = await ArenaCompetitiveRecord.updateOne(
            {
              _id: record._id,
              recordMode: "NORMAL",
              status: "RESERVED",
              reservedByUserId: user._id,
              reservedByMatchId: null,
            },
            { $set: { reservedByMatchId: matchId, reservationExpiresAt: null } },
            { session }
          );
          if (claimed.modifiedCount !== 1) {
            throw statusError(409, "경기 상대 연결 시간이 만료되었습니다.", "ARENA_NORMAL_RECORD_CLAIM_LOST");
          }
        } else {
          const baselineIds = baseline.questions.map((question) => question._id);
          const stillActive = await ArenaNormalBaselineQuestion.countDocuments({
            _id: { $in: baselineIds },
            status: "ACTIVE",
            calibrationStatus: "SIMULATION_APPROVED",
          }).session(session);
          if (stillActive !== 5) {
            throw statusError(
              409,
              "기준 문제 상태가 변경되었습니다. 다시 시도해주세요.",
              "ARENA_BASELINE_QUESTION_SET_CHANGED"
            );
          }
          await ArenaNormalBaselineAssignment.create([{
            batchKey: baseline.batchKey,
            baselineQuestionIds: baselineIds,
            combinationHash: baseline.combinationHash,
            challengerUserId: user._id,
            matchId,
            sequence: sequenceAtStart + 1,
            assignedAt: now,
          }], { session, ordered: true });
        }
        if (record) await retainArenaEvidence({
          evidenceId: record.sourceEvidenceId, referenceKey: `MATCH:${matchId}`, now, session,
        });
        const problemPackId = new mongoose.Types.ObjectId();
        const match = {
          _id: matchId,
          matchKey: `ARENA-NORMAL-ASYNC:${matchId}`,
          arenaVersion: "2.0",
          gameMode: "NORMAL",
          division: "SUB",
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
          policyVersionCode: "GOAT_ARENA_NORMAL_ASYNC_V2_HIDDEN_RATING",
          problemPackId,
          problemPackVersion: pack.version,
          scoringVersion: SCORING_VERSION,
          timeLimitMs: pack.timeLimitMs,
          requestedAt: now,
          startDeadlineAt: new Date(now.getTime() + ARENA_ONE_ON_ONE_START_LIMIT_MS),
          readyAt: now,
          integrityStatus: "PENDING",
          normalAsync: {
            enabled: true,
            historicalRecordId: record?._id || null,
            historicalOwnerUserId: owner._id,
            baselineQuestionIds: baseline?.questions?.map((question) => question._id) || [],
            baselineBatchKey: baseline?.batchKey || "",
            baselineCombinationHash: baseline?.combinationHash || "",
            baselineRatingSnapshot: baseline ? opponentRatingSnapshot : null,
            baselinePerformance: baseline ? opponentPerformance : null,
            firstRecord: false,
            challengerRatingBefore,
            challengerSourceRates: sourceRates,
            questionInstanceHashes: hashes,
            opponentQuestionInstanceHashes: [...historicalHashes],
            matchmakingRating: rating,
            reservationExpiresAt: record?.reservationExpiresAt || null,
            pendingComparison: {
              comparisonPolicy: "DIFFICULTY_CORRECTNESS_TIME_V1",
              scoringVersion: SCORING_VERSION,
            },
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
        await ArenaMatchParticipantLock.create([{ userId: user._id, matchId, acquiredAt: now }], { session, ordered: true });
        await ArenaOutboxEvent.create([{
          eventType: "ArenaMatchCreated",
          aggregateType: "ArenaMatch",
          aggregateId: matchId,
          idempotencyKey: `${matchId}:ArenaMatchCreated`,
          payload: {
            arenaVersion: "2.0",
            gameMode: "NORMAL",
            asynchronous: true,
            firstRecord: false,
            challengerUserId: user._id,
            historicalRecordId: record?._id || null,
            baselineCombinationHash: baseline?.combinationHash || "",
          },
        }], { session, ordered: true });
        created = match;
      });
    } finally {
      await session.endSession();
    }
    return {
      match: created,
      asynchronous: true,
      firstRecord: false,
      baseline: Boolean(baseline),
      allowedRatingGap: record
        ? reservation.allowedRatingGap
        : baseline.allowedRatingGap,
    };
  } catch (error) {
    if (record) await releaseNormalRecord(record._id);
    throw error;
  }
}

async function settleAsyncNormalMatch({ matchId, userId, now = new Date(), session: existingSession = null }) {
  const session = existingSession || await mongoose.startSession();
  const ownsSession = !existingSession;
  let result;
  try {
    const settle = async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!isAsyncNormalMatch(match) || id(match.challenger.userId) !== id(userId)) {
        throw statusError(404, "일반전을 찾을 수 없습니다.", "ARENA_ASYNC_NORMAL_NOT_FOUND");
      }
      if (match.status === "SETTLED") {
        result = { settled: true, replayed: true, status: "SETTLED", resultSnapshot: match.resultSnapshot };
        return;
      }
      const attempt = await ArenaMatchAttempt.findOne({ matchId, userId }).session(session).lean();
      const evidence = await ArenaMatchEvidence.findOne({
        matchId,
        attemptId: attempt?._id,
        originalEvidenceSubmitted: true,
      }).session(session);
      const pack = await ArenaProblemPack.findById(attempt?.problemPackId)
        .select("+questions").session(session).lean();
      if (attempt?.status !== "SUBMITTED" || !evidence?.files?.length || !pack) {
        throw statusError(409, "다섯 문항과 필수 풀이 제출을 모두 완료해주세요.", "ARENA_NORMAL_EVIDENCE_INCOMPLETE");
      }
      const current = performanceForNormalAttempt({
        attempt,
        problemPack: pack,
        sourceRates: match.normalAsync.challengerSourceRates,
      });
      // 일반전 판정과 히든 MMR은 즉시 확정하되, 감지 신호가 있는 새 기록은
      // 사용자에게 패널티를 주지 않고 과거 기록 풀에서만 격리한다.
      const detectedFlags = await detectEvidenceAnomalies({
        attempt,
        scoring: current.scoring,
        files: evidence.files || [],
        session,
      });
      const integrityFlags = [...new Set([
        ...(evidence.sourceRiskFlags || []),
        ...detectedFlags,
      ])];
      evidence.anomalyFlags = integrityFlags;
      evidence.screenedAsWinner = false;
      evidence.status = integrityFlags.length ? "ANOMALY_FLAGGED" : "ON_TIME";
      await evidence.save({ session });
      match.integrityStatus = integrityFlags.length ? "SUSPICIOUS" : "CLEAR";

      const record = match.normalAsync.historicalRecordId
        ? await ArenaCompetitiveRecord.findById(match.normalAsync.historicalRecordId).session(session)
        : null;
      const baselineQuestionIds = match.normalAsync.baselineQuestionIds || [];
      const baseline = !record && baselineQuestionIds.length === 5;
      const opponentPerformance = record?.performance ||
        (baseline ? match.normalAsync.baselinePerformance : null);
      const opponentRating = record?.ratingSnapshot ||
        (baseline ? match.normalAsync.baselineRatingSnapshot : null);
      if (!opponentPerformance || !opponentRating) {
        throw statusError(
          409,
          "연결된 경기 상대 데이터를 확인할 수 없습니다.",
          "ARENA_NORMAL_OPPONENT_DATA_MISSING"
        );
      }
      const comparison = compareCompetitivePerformance(current.performance, opponentPerformance, {
        closeScoreThreshold: GOAT_ARENA_V2_CONFIG.asyncNormal.closeScoreThreshold,
      });
      if (!comparison.valid) {
        throw statusError(409, "유효한 비교 시간을 확인할 수 없습니다.", "ARENA_NORMAL_COMPARISON_INVALID");
      }
      match.normalAsync.pendingComparison = comparison;
      const winnerRole = comparison.winnerRole || null;
      const profile = await ArenaCompetitiveProfile.findOne({ userId }).session(session) ||
        await ensureArenaV2Profile(userId, { session });
      const before = match.normalAsync.challengerRatingBefore || ratingSnapshot(profile);
      const normalRatingChange = applyNormalRatingResult(profile, {
        before,
        opponent: opponentRating,
        winnerRole,
        now,
      });
      profile.normalMatchesCompleted = Number(profile.normalMatchesCompleted || 0) + 1;
      profile.accountXp = Number(profile.accountXp || 0) + GOAT_ARENA_V2_CONFIG.progression.xpPerValidMatch;
      profile.accountLevel = buildArenaActivityLevel(profile.accountXp).level;
      await profile.save({ session });

      const counter = await ArenaNormalMatchCounter.findOneAndUpdate(
        { key: "GLOBAL" },
        { $inc: { sequence: 1 }, $setOnInsert: { key: "GLOBAL" } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
      );
      const sequence = Number(counter.sequence);
      if (baseline) {
        const baselineAssignment = await ArenaNormalBaselineAssignment.updateOne(
          { matchId: match._id },
          { $set: { sequence, settledAt: now } },
          { session }
        );
        if (baselineAssignment.matchedCount !== 1) {
          throw statusError(
            409,
            "기준 문제 조합 배정 기록을 확인할 수 없습니다.",
            "ARENA_BASELINE_ASSIGNMENT_MISSING"
          );
        }
      }
      if (record) {
        record.status = "AVAILABLE";
        record.usageCount = Number(record.usageCount || 0) + 1;
        record.lastUsedAt = now;
        record.reservedByUserId = null;
        record.reservedByMatchId = null;
        record.reservedAt = null;
        record.reservationExpiresAt = null;
        await record.save({ session });
      }

      const [createdRecord] = await ArenaCompetitiveRecord.create([{
        recordMode: "NORMAL",
        ownerUserId: userId,
        sourceMatchId: match._id,
        sourceAttemptId: attempt._id,
        sourceEvidenceId: evidence._id,
        sourceProblemPackId: pack._id,
        ratingSnapshot: ratingSnapshot(profile),
        performance: current.performance,
        questionInstanceHashes: match.normalAsync.questionInstanceHashes,
        status: integrityFlags.length ? "REVIEW_REQUIRED" : "AVAILABLE",
        isBaseline: false,
        recordLabel: "일반전 과거 기록",
        consentVersion: NORMAL_RECORD_CONSENT_VERSION,
        verifiedAt: now,
        integrityFlags,
        usageCount: 0,
      }], { session, ordered: true });
      if (integrityFlags.length) {
        await AdminTodo.findOneAndUpdate(
          { sourceType: "ArenaNormalRecordIntegrityReview", sourceId: createdRecord._id },
          {
            $setOnInsert: {
              category: "integrity",
              title: "일반전 과거 기록 풀 검토 필요",
              description:
                "일반전 결과와 히든 MMR은 정상 반영됐습니다. 감지 신호가 있는 풀이 기록만 상대 기록 풀에서 격리했습니다.",
              href: `/admin/arena-policies#normal-record-review`,
              targetUserId: userId,
              actorUserId: userId,
              sourceType: "ArenaNormalRecordIntegrityReview",
              sourceId: createdRecord._id,
              status: "pending",
              metadata: {
                matchId: id(match),
                recordId: id(createdRecord),
                anomalyFlags: integrityFlags,
                penaltyApplied: false,
              },
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
        );
      }

      const outcome = winnerRole === "CHALLENGER"
        ? "CHALLENGER_WIN"
        : winnerRole === "DEFENDER"
          ? "DEFENDER_WIN"
          : "DRAW";
      const settlementSummary = {
        version: NORMAL_ASYNC_SETTLEMENT_VERSION,
        gameMode: "NORMAL",
        asynchronous: true,
        firstRecord: false,
        valid: true,
        result: outcome,
        completedForUnlock: true,
        mmrChanged: false,
        hiddenMatchmakingRatingChanged: true,
        historicalOpponentRatingChanged: false,
        baselineOpponent: baseline,
        xpAwarded: true,
        xpPerPlayer: GOAT_ARENA_V2_CONFIG.progression.xpPerValidMatch,
        comparison,
        recordReuse: record ? {
          recordId: id(record),
          reusable: true,
          perUserQuestionRepeatWindowMatches:
            GOAT_ARENA_V2_CONFIG.asyncNormal.questionRepeatWindowMatches,
        } : null,
        createdRecordEligibility: integrityFlags.length
          ? "OPERATOR_REVIEW_REQUIRED"
          : "AVAILABLE",
      };
      await ArenaRatingSettlement.create([{
        matchId: match._id,
        mode: "NORMAL",
        outcome,
        challenger: {
          userId: id(userId),
          rating: normalRatingChange,
          ratingSystem: normalRatingChange?.system || null,
          xpAfter: profile.accountXp,
          levelAfter: profile.accountLevel,
        },
        defender: record
          ? { userId: id(record.ownerUserId), historicalRecordId: id(record), ratingChanged: false }
          : {
              userId: id(match.normalAsync.historicalOwnerUserId),
              baselineQuestionIds: baselineQuestionIds.map(id),
              ratingSnapshot: opponentRating,
              ratingChanged: false,
            },
        settledAt: now,
      }], { session, ordered: true });
      match.status = "SETTLED";
      match.winnerRole = winnerRole;
      match.integrityStatus = integrityFlags.length ? "SUSPICIOUS" : "CLEAR";
      match.resolvedAt = now;
      match.settledAt = now;
      match.settlementIdempotencyKey = `${match._id}:${NORMAL_ASYNC_SETTLEMENT_VERSION}`;
      match.resultSnapshot = {
        scoringPolicyVersion: SCORING_VERSION,
        challenger: {
          score: current.scoring.score,
          correctCount: current.scoring.correctCount,
          correctAnswerSolveTimeMs: current.scoring.correctAnswerSolveTimeMs,
          totalSolveTimeMs: current.scoring.totalSolveTimeMs,
        },
        defender: {
          score: 0,
          correctCount: Number(opponentPerformance?.correctCount || 0),
          correctAnswerSolveTimeMs: null,
          totalSolveTimeMs: opponentPerformance?.totalSolveTimeMs ?? null,
        },
        tieBreakStep: comparison.reason,
        winnerRole,
        settlementSummary,
        resolvedAt: now,
      };
      await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.normalAsync?.historicalRecordId, matchId: match._id, now, session });
      }
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      await ArenaOutboxEvent.create([{
        eventType: "ArenaMatchSettled",
        aggregateType: "ArenaMatch",
        aggregateId: match._id,
        idempotencyKey: `${match._id}:ArenaMatchSettled`,
        payload: { arenaVersion: "2.0", gameMode: "NORMAL", asynchronous: true, firstRecord: false, baseline, winnerRole },
      }], { session, ordered: true });
      result = { settled: true, replayed: false, status: "SETTLED", winnerRole, resultSnapshot: match.resultSnapshot };
    };
    if (ownsSession) await session.withTransaction(settle);
    else await settle();
    return result;
  } catch (error) {
    if (ownsSession && Number(error?.code) === 11000) {
      const match = await ArenaMatch.findById(matchId).lean();
      if (match?.status === "SETTLED") {
        return { settled: true, replayed: true, status: "SETTLED", resultSnapshot: match.resultSnapshot };
      }
    }
    throw error;
  } finally {
    if (ownsSession) await session.endSession();
  }
}

async function cancelAsyncNormalMatch({
  matchId,
  userId,
  now = new Date(),
  session: existingSession = null,
  allowAfterSubmission = false,
  reason = "CHALLENGER_ABANDONED",
}) {
  const session = existingSession || await mongoose.startSession();
  const ownsSession = !existingSession;
  let result;
  try {
    const cancel = async () => {
      const match = await ArenaMatch.findById(matchId).session(session);
      if (!isAsyncNormalMatch(match) || id(match.challenger.userId) !== id(userId)) {
        throw statusError(404, "취소할 일반전을 찾을 수 없습니다.", "ARENA_ASYNC_NORMAL_NOT_FOUND");
      }
      if (match.status === "SETTLED" || (match.status === "HELD" && !allowAfterSubmission)) {
        throw statusError(409, "풀이 제출이 끝난 경기는 포기할 수 없습니다.", "ARENA_FORFEIT_AFTER_SUBMISSION");
      }
      if (["CANCELLED", "INVALID"].includes(match.status)) {
        result = { cancelled: true, replayed: true, status: match.status };
        return;
      }
      const attempt = await ArenaMatchAttempt.findOne({ matchId, userId }).session(session).lean();
      if (!allowAfterSubmission && ["EVIDENCE_REQUIRED", "SUBMITTED"].includes(attempt?.status)) {
        throw statusError(409, "답안 제출이 끝난 뒤에는 경기를 포기할 수 없습니다.", "ARENA_FORFEIT_AFTER_SUBMISSION");
      }
      const normalizedReason = String(reason || "CHALLENGER_ABANDONED").slice(0, 80);
      const voluntaryForfeit = normalizedReason === "VOLUNTARY_FORFEIT";
      let normalRatingChange = null;
      const baselineOpponent =
        !match.normalAsync.historicalRecordId &&
        (match.normalAsync.baselineQuestionIds || []).length === 5;
      if (voluntaryForfeit && (match.normalAsync.historicalRecordId || baselineOpponent)) {
        const [record, profile] = await Promise.all([
          match.normalAsync.historicalRecordId
            ? ArenaCompetitiveRecord.findById(match.normalAsync.historicalRecordId).session(session)
            : null,
          ArenaCompetitiveProfile.findOne({ userId }).session(session),
        ]);
        const opponentRating = record?.ratingSnapshot ||
          (baselineOpponent ? match.normalAsync.baselineRatingSnapshot : null);
        if (opponentRating && profile) {
          normalRatingChange = applyNormalRatingResult(profile, {
            before: match.normalAsync.challengerRatingBefore || ratingSnapshot(profile),
            opponent: opponentRating,
            winnerRole: "DEFENDER",
            now,
          });
          await profile.save({ session });
          await ArenaRatingSettlement.create([{
            matchId: match._id,
            mode: "NORMAL",
            outcome: "DEFENDER_WIN",
            challenger: {
              userId: id(userId),
              rating: normalRatingChange,
              ratingSystem: normalRatingChange.system,
              xpAfter: profile.accountXp,
              levelAfter: profile.accountLevel,
            },
            defender: record
              ? {
                  userId: id(record.ownerUserId),
                  historicalRecordId: id(record),
                  ratingChanged: false,
                }
              : {
                  userId: id(match.normalAsync.historicalOwnerUserId),
                  baselineQuestionIds: match.normalAsync.baselineQuestionIds.map(id),
                  ratingSnapshot: opponentRating,
                  ratingChanged: false,
                },
            settledAt: now,
          }], { session, ordered: true });
        }
      }
      match.status = "CANCELLED";
      match.winnerRole = voluntaryForfeit ? "DEFENDER" : null;
      match.integrityStatus = "CLEAR";
      match.resolvedAt = now;
      match.settledAt = now;
      match.resultSnapshot = {
        scoringPolicyVersion: SCORING_VERSION,
        winnerRole: voluntaryForfeit ? "DEFENDER" : null,
        tieBreakStep: normalizedReason,
        settlementSummary: {
          version: NORMAL_ASYNC_SETTLEMENT_VERSION,
          gameMode: "NORMAL",
          asynchronous: true,
          valid: false,
          result: voluntaryForfeit ? "DEFENDER_WIN" : "CANCELLED",
          completedForUnlock: false,
          xpAwarded: false,
          mmrChanged: false,
          hiddenMatchmakingRatingChanged: Boolean(normalRatingChange),
          reason: normalizedReason,
        },
        resolvedAt: now,
      };
      await match.save({ session });
      if (["SETTLED", "CANCELLED", "INVALID"].includes(match.status)) {
        await completeArenaEvidenceReference({ recordId: match.normalAsync?.historicalRecordId, matchId: match._id, now, session });
      }
      await releaseNormalRecord(match.normalAsync.historicalRecordId, match._id, session);
      await ArenaMatchParticipantLock.deleteMany({ matchId: match._id }).session(session);
      result = { cancelled: true, replayed: false, status: "CANCELLED" };
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
  const sourceAccuracy = publicSourceAccuracyForQuestion(question);
  return {
    slot: index + 1,
    questionKey: question.questionKey,
    prompt: question.prompt,
    choices: question.choices || [],
    visualization: question.visualization || null,
    correct: observation?.x === 1,
    sourceAccuracyRate:
      Number.isFinite(sourceAccuracyRate) &&
      sourceAccuracyRate > 0 &&
      sourceAccuracyRate < 1
        ? sourceAccuracyRate
        : null,
    sourceAccuracyLabel: sourceAccuracy?.label || null,
    sourceAccuracyEvidenceKind: sourceAccuracy?.evidenceKind || null,
  };
}

function submittedAnswerForQuestion(attempt, question) {
  const answer = (attempt?.answers || []).find(
    (candidate) => String(candidate?.questionKey || "") === String(question?.questionKey || "")
  );
  const value = typeof answer?.value === "string" ? answer.value.trim() : "";
  return value || null;
}

function evidenceFiles(matchId, side, evidence) {
  return (evidence?.files || []).map((file, index) => ({
    index: index + 1,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    questionSlot: file.questionSlot || null,
    href: `/goat-arena/matches/${matchId}/normal-result/evidence/${side}/${index + 1}`,
  }));
}

async function loadAuthorizedNormalResult({ matchId, userId }) {
  if (!mongoose.isObjectIdOrHexString(matchId)) throw statusError(404, "경기를 찾을 수 없습니다.", "ARENA_MATCH_NOT_FOUND");
  const match = await ArenaMatch.findById(matchId).lean();
  if (!isAsyncNormalMatch(match)) {
    throw statusError(404, "일반전 결과를 찾을 수 없습니다.", "ARENA_ASYNC_NORMAL_NOT_FOUND");
  }
  const baselineQuestionIds = match.normalAsync?.baselineQuestionIds || [];
  const usesBaseline = !match.normalAsync?.historicalRecordId && baselineQuestionIds.length === 5;
  const authorizedUserIds = usesBaseline
    ? [match.challenger?.userId]
    : [match.challenger?.userId, match.normalAsync?.historicalOwnerUserId];
  const authorized = authorizedUserIds
    .filter(Boolean)
    .some((candidate) => id(candidate) === id(userId));
  if (!authorized) throw statusError(403, "경기 당사자만 풀이 기록을 볼 수 있습니다.", "ARENA_RESULT_FORBIDDEN");
  const [attempt, record, users, baselineQuestions] = await Promise.all([
    ArenaMatchAttempt.findOne({ matchId, userId: match.challenger.userId }).lean(),
    match.normalAsync.historicalRecordId
      ? ArenaCompetitiveRecord.findById(match.normalAsync.historicalRecordId).lean()
      : null,
    User.find({ _id: { $in: [match.challenger.userId, match.normalAsync.historicalOwnerUserId].filter(Boolean) } })
      .select("_id name username").lean(),
    usesBaseline
      ? ArenaNormalBaselineQuestion.find({ _id: { $in: baselineQuestionIds } })
          .select("+question")
          .lean()
      : [],
  ]);
  const [currentEvidence, currentPack, recordAttempt, recordEvidence, recordPack] = await Promise.all([
    ArenaMatchEvidence.findOne({ matchId, attemptId: attempt?._id, originalEvidenceSubmitted: true }).lean(),
    ArenaProblemPack.findById(attempt?.problemPackId).select("+questions").lean(),
    record ? ArenaMatchAttempt.findById(record.sourceAttemptId).lean() : null,
    record ? ArenaMatchEvidence.findById(record.sourceEvidenceId).lean() : null,
    record ? ArenaProblemPack.findById(record.sourceProblemPackId).select("+questions").lean() : null,
  ]);
  const baselineById = new Map(baselineQuestions.map((question) => [id(question), question]));
  const orderedBaseline = baselineQuestionIds
    .map((questionId) => baselineById.get(id(questionId)))
    .filter(Boolean);
  const historicalAttempt = record
    ? recordAttempt
    : usesBaseline
      ? {
          answers: orderedBaseline.map((question) => ({
            questionKey: question.question?.questionKey,
            value: question.baselineSubmittedAnswer,
          })),
        }
      : null;
  const historicalEvidence = record
    ? recordEvidence
    : usesBaseline
      ? { files: orderedBaseline.map((question) => question.solutionEvidenceFile).filter(Boolean) }
      : null;
  const historicalPack = record
    ? recordPack
    : usesBaseline
      ? { questions: orderedBaseline.map((question) => question.question) }
      : null;
  const historicalPerformance = record?.performance ||
    (usesBaseline ? match.normalAsync?.baselinePerformance : null);
  if (!attempt || !currentPack || !currentEvidence?.files?.length) {
    throw statusError(409, "필수 풀이 제출 뒤 결과를 확인할 수 있습니다.", "ARENA_RESULT_NOT_UNLOCKED");
  }
  if (
    (!record && !usesBaseline) ||
    !historicalAttempt ||
    historicalPack?.questions?.length !== 5 ||
    (usesBaseline ? historicalEvidence?.files?.length !== 5 : !historicalEvidence?.files?.length) ||
    historicalEvidence.contentPurgedAt ||
    !historicalPerformance
  ) {
    throw statusError(409, "상대의 문제와 풀이 원본을 확인할 수 없습니다.", "ARENA_RESULT_RECORD_INCOMPLETE");
  }
  const [visibleCurrentEvidence, visibleHistoricalEvidence] = await Promise.all([
    memberEvidenceWithSavedBoards(currentEvidence, attempt),
    record ? memberEvidenceWithSavedBoards(historicalEvidence, historicalAttempt) : historicalEvidence,
  ]);
  return { match, attempt, record, users, currentEvidence: visibleCurrentEvidence, currentPack,
    historicalAttempt, historicalEvidence: visibleHistoricalEvidence, historicalPack, historicalPerformance,
    usesBaseline };
}

async function getAsyncNormalResult({ matchId, userId }) {
  const parts = await loadAuthorizedNormalResult({ matchId, userId });
  const { match, attempt, record, users, currentEvidence, currentPack,
    historicalAttempt, historicalEvidence, historicalPack, historicalPerformance,
    usesBaseline } = parts;
  const userById = new Map(users.map((user) => [id(user), user]));
  const current = performanceForNormalAttempt({
    attempt,
    problemPack: currentPack,
    sourceRates: match.normalAsync.challengerSourceRates,
  });
  const competitor = (side, ownerId, pack, sourceAttempt, evidence, performance, label) => ({
    side,
    isViewer: id(ownerId) === id(userId),
    user: { id: id(ownerId), name: userById.get(id(ownerId))?.name || label },
    label,
    questions: pack.questions.map((question, index) => ({
      ...publicQuestion(question, performance?.observations?.[index], index),
      submittedAnswer: submittedAnswerForQuestion(sourceAttempt, question),
    })),
    totalCorrect: Number(performance?.correctCount || 0),
    completionTimeMs: performance?.totalSolveTimeMs ?? null,
    difficultyAdjustedScore: Number.isFinite(Number(performance?.z))
      ? Number(performance.z)
      : null,
    solutions: evidenceFiles(match._id, side, evidence),
  });
  const challenger = competitor(
    "challenger",
    match.challenger.userId,
    currentPack,
    attempt,
    currentEvidence,
    current.performance,
    "도전자"
  );
  const historicalOpponent = competitor(
      "historical",
      record?.ownerUserId || match.normalAsync.historicalOwnerUserId,
      historicalPack,
      historicalAttempt,
      historicalEvidence,
      historicalPerformance,
      "상대"
    );
  if (usesBaseline) {
    historicalOpponent.user = { id: null, name: "기준 풀이" };
    historicalOpponent.label = "기준 풀이";
    historicalOpponent.isBaseline = true;
    historicalOpponent.completionTimeEstimated = true;
    historicalOpponent.isViewer = false;
  }
  const publicExplanation = String(
    match.normalAsync?.pendingComparison?.explanation ||
    "정오답, 문항 난도와 풀이 시간을 반영한 내부 평가로 결과를 정했습니다."
  );
  const result = {
    matchId: id(match),
    asynchronous: true,
    firstRecord: false,
    status: match.status,
    verdictLabel: match.winnerRole === "CHALLENGER"
        ? "승리"
        : match.winnerRole === "DEFENDER"
          ? "패배"
          : "무승부",
    winnerRole: match.winnerRole || null,
    explanation: publicExplanation,
    challenger,
    historicalOpponent,
    officialAnswersIncluded: false,
  };
  await markResultQuestionExposure({ match, userId, packs: [currentPack, historicalPack] });
  return result;
}

async function getAsyncNormalEvidenceFile({ matchId, userId, side, fileIndex }) {
  const parts = await loadAuthorizedNormalResult({ matchId, userId });
  const evidence = String(side).toLowerCase() === "challenger"
    ? parts.currentEvidence
    : String(side).toLowerCase() === "historical"
      ? parts.historicalEvidence
      : null;
  const file = evidence?.files?.[Number(fileIndex) - 1];
  if (!file) throw statusError(404, "풀이 파일을 찾을 수 없습니다.", "ARENA_EVIDENCE_FILE_NOT_FOUND");
  const url = await signedStoredAssetUrl(file, {
    download: false,
    originalName: file.originalName,
    expiresIn: 5 * 60,
  });
  if (!url) throw statusError(503, "풀이 파일 보안 링크를 만들 수 없습니다.", "ARENA_EVIDENCE_URL_UNAVAILABLE");
  await markResultQuestionExposure({ match: parts.match, userId, packs: [parts.currentPack, parts.historicalPack] });
  return { url, mimeType: file.mimeType, originalName: file.originalName };
}

module.exports = {
  NORMAL_ASYNC_SETTLEMENT_VERSION,
  NORMAL_RECORD_CONSENT_VERSION,
  cancelAsyncNormalMatch,
  getAsyncNormalEvidenceFile,
  getAsyncNormalResult,
  isAsyncNormalMatch,
  releaseExpiredNormalReservations,
  normalSourceRates,
  settleAsyncNormalMatch,
  startAsyncNormalMatch,
  _testing: {
    hiddenRatingSummary,
    applyNormalRatingResult,
    matchmakingRating,
    normalSourceRates,
    performanceForNormalAttempt,
    ratingSnapshot,
    reserveNormalRecord,
    updateNormalMatchmakingRating,
  },
};
