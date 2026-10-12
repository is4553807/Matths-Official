const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const { AssessmentAttempt, User } = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaCompetitiveRecord,
  ArenaCompetitiveProfile,
  ArenaFriendRequest,
  ArenaFriendlyInvitationV2,
  ArenaFriendship,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaMatchmakingEntry,
  ArenaOutboxEvent,
  ArenaProblemPack,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const {
  cancelArenaV2Match,
  settleArenaV2Match,
} = require("../services/arenaV2SettlementService");
const { advanceArenaMatchQuestion, getArenaMatchPageData, startArenaMatchAttempt } = require("../services/arenaMatchAttemptService");
const { submitArenaMatchEvidence } = require("../services/arenaMatchEvidenceService");
const {
  getAsyncNormalResult,
  settleAsyncNormalMatch,
} = require("../services/arenaAsyncNormalService");
const {
  SCORING_VERSION,
} = require("../services/arenaCompetitiveScoringService");
const {
  reviewHeldArenaV2Match,
} = require("../services/arenaV2IntegrityReviewAdapter");
const {
  getArenaV2QueueState,
  joinArenaV2Queue,
} = require("../services/arenaV2MatchmakingService");
const {
  competitiveUnlockState,
  finalizeArenaV2Placement,
  syncArenaV2PlacementProfile,
  tierForRating,
} = require("../services/arenaV2ProfileService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");
const { getArenaActivityLevel } = require("../services/arenaActivityLevelService");
const {
  createArenaFriendlyInvitation,
  listArenaFriends,
  respondArenaFriendlyInvitation,
  sendArenaFriendRequest,
} = require("../services/arenaFriendService");

function questions() {
  return Array.from({ length: 5 }, (_, index) => ({
    questionKey: `Q${index + 1}`,
    answer: String(index + 1),
    points: 20,
  }));
}

async function createFixture({
  mode,
  suffix,
  challengerProfile,
  defenderProfile,
  withEvidenceFiles = true,
}) {
  const challengerUserId = challengerProfile.userId;
  const defenderUserId = defenderProfile.userId;
  const matchId = new mongoose.Types.ObjectId();
  const problemPackId = new mongoose.Types.ObjectId();
  const challengerAttemptId = new mongoose.Types.ObjectId();
  const defenderAttemptId = new mongoose.Types.ObjectId();
  const now = new Date("2026-10-09T10:00:00.000Z");
  const packVersion = `ARENA2-DB-${suffix}`;
  await ArenaProblemPack.collection.insertOne({
    _id: problemPackId,
    version: packVersion,
    questions: questions(),
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatch.create({
    _id: matchId,
    matchKey: `ARENA2:DB:${suffix}`,
    arenaVersion: "2.0",
    gameMode: mode,
    division: mode === "NORMAL" ? "SUB" : "MAIN",
    seasonKey: "2026-10",
    competitivePool: "ALL",
    matchType: mode === "FRIENDLY" ? "FRIENDLY" : "NORMAL",
    matchOrigin: mode === "FRIENDLY" ? "ARENA_2_FRIEND_INVITATION" : "ARENA_2_MATCHMAKING",
    requestInitiatorUserId: challengerUserId,
    tierPairKey: "ARENA2_T1",
    tierPairLabel: "통합 수능 수학",
    challenger: { userId: challengerUserId, submittedAt: now },
    defender: { userId: defenderUserId, submittedAt: now },
    status: "SUBMITTED",
    policyVersionCode: "GOAT_ARENA_2_0",
    problemPackId,
    problemPackVersion: packVersion,
    scoringVersion: "ARENA2-SCORING-V1",
    timeLimitMs: 600000,
    startDeadlineAt: new Date(now.getTime() + 3600000),
    integrityStatus: "CLEAR",
  });
  const answers = questions().map((question) => ({
    questionKey: question.questionKey,
    value: question.answer,
  }));
  await ArenaMatchAttempt.create([
    {
      _id: challengerAttemptId,
      matchId,
      userId: challengerUserId,
      role: "CHALLENGER",
      problemPackId,
      problemPackVersion: packVersion,
      status: "SUBMITTED",
      answers,
      activeSolveTimeMs: 240000,
      submittedAt: now,
    },
    {
      _id: defenderAttemptId,
      matchId,
      userId: defenderUserId,
      role: "DEFENDER",
      problemPackId,
      problemPackVersion: packVersion,
      status: "SUBMITTED",
      answers: answers.map((answer, index) => ({
        ...answer,
        value: index === 4 ? "999" : answer.value,
      })),
      activeSolveTimeMs: 180000,
      submittedAt: now,
    },
  ]);
  const evidenceFile = (role) => ({
    originalName: `${role}.png`,
    storedName: `${suffix}-${role}.png`,
    mimeType: "image/png",
    sizeBytes: 128,
    sha256: role === "challenger" ? "a".repeat(64) : "b".repeat(64),
  });
  await ArenaMatchEvidence.create([
    {
      attemptId: challengerAttemptId,
      matchId,
      userId: challengerUserId,
      files: withEvidenceFiles ? [evidenceFile("challenger")] : [],
      submittedAt: now,
    },
    {
      attemptId: defenderAttemptId,
      matchId,
      userId: defenderUserId,
      files: withEvidenceFiles ? [evidenceFile("defender")] : [],
      submittedAt: now,
    },
  ]);
  await ArenaMatchParticipantLock.create([
    { userId: challengerUserId, matchId },
    { userId: defenderUserId, matchId },
  ]);
  return { matchId, problemPackId, challengerAttemptId, defenderAttemptId };
}

async function seedNormalBaseline(ownerUserId, rating, now) {
  const sourceMatchId = new mongoose.Types.ObjectId();
  const sourceAttemptId = new mongoose.Types.ObjectId();
  const sourceEvidenceId = new mongoose.Types.ObjectId();
  const sourceProblemPackId = new mongoose.Types.ObjectId();
  const baselineQuestions = questions().map((question, index) => ({
    ...question,
    prompt: `AUDIT BASELINE ${index + 1}`,
  }));
  await ArenaProblemPack.collection.insertOne({
    _id: sourceProblemPackId,
    version: `AUDIT-NORMAL-BASELINE-${sourceProblemPackId}`,
    questions: baselineQuestions,
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatchAttempt.collection.insertOne({
    _id: sourceAttemptId,
    matchId: sourceMatchId,
    userId: ownerUserId,
    role: "CHALLENGER",
    problemPackId: sourceProblemPackId,
    status: "SUBMITTED",
    answers: baselineQuestions.map((question, index) => ({
      questionKey: question.questionKey,
      value: index < 3 ? question.answer : "0",
    })),
    activeSolveTimeMs: 420000,
    submittedAt: now,
  });
  await ArenaMatchEvidence.collection.insertOne({
    _id: sourceEvidenceId,
    matchId: sourceMatchId,
    attemptId: sourceAttemptId,
    userId: ownerUserId,
    originalEvidenceSubmitted: true,
    submittedAt: now,
    files: baselineQuestions.map((_question, index) => ({
      originalName: `baseline-${index + 1}.png`,
      storedName: `audit-baseline-${sourceEvidenceId}-${index + 1}.png`,
      mimeType: "image/png",
      sizeBytes: 32768,
      sha256: createHash("sha256").update(`${sourceEvidenceId}:${index}`).digest("hex"),
      questionSlot: index + 1,
    })),
  });
  return ArenaCompetitiveRecord.create({
    recordMode: "NORMAL",
    ownerUserId,
    sourceMatchId,
    sourceAttemptId,
    sourceEvidenceId,
    sourceProblemPackId,
    ratingSnapshot: { rating, ratingDeviation: 350, volatility: 0.06, tier: tierForRating(rating).name },
    performance: {
      scoringVersion: SCORING_VERSION,
      observations: [],
      correctCount: 3,
      expectedCorrect: 2.5,
      variance: 1,
      z: 0.5,
      totalSolveTimeMs: 420000,
    },
    questionInstanceHashes: Array.from({ length: 5 }, (_, index) => `audit-baseline-${index + 1}`),
    status: "AVAILABLE",
    isBaseline: true,
    recordLabel: "감사 테스트 일반전 기준 기록",
    consentVersion: "ARENA_NORMAL_SOLUTION_SHARE_V1",
    verifiedAt: now,
  });
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  const challengerUserId = new mongoose.Types.ObjectId();
  const defenderUserId = new mongoose.Types.ObjectId();
  const placedAt = new Date("2026-10-01T00:00:00.000Z");
  await User.collection.insertMany([
    {
      _id: challengerUserId,
      name: "arena-a",
      nameNormalized: "arena-a",
      email: "arena-a@example.com",
      accountStatus: "active",
      isActive: true,
      createdAt: placedAt,
      updatedAt: placedAt,
    },
    {
      _id: defenderUserId,
      name: "arena-b",
      nameNormalized: "arena-b",
      email: "arena-b@example.com",
      accountStatus: "active",
      isActive: true,
      createdAt: placedAt,
      updatedAt: placedAt,
    },
  ]);
  const [challengerProfile, defenderProfile] = await ArenaCompetitiveProfile.create([
    {
      userId: challengerUserId,
      normalMatchesCompleted: 3,
      accountXp: 3,
      accountLevel: 1,
      placementFinalizedAt: placedAt,
      placementFinalizedReason: "EARLY",
      rating: 1500,
      ratingDeviation: 200,
      volatility: 0.06,
      tier: "platinum",
      ratingInitializedAt: placedAt,
      placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
    },
    {
      userId: defenderUserId,
      normalMatchesCompleted: 3,
      accountXp: 3,
      accountLevel: 1,
      placementFinalizedAt: placedAt,
      placementFinalizedReason: "EARLY",
      rating: 1500,
      ratingDeviation: 200,
      volatility: 0.06,
      tier: "platinum",
      ratingInitializedAt: placedAt,
      placementProcessVersion: GOAT_ARENA_V2_CONFIG.placement.processVersion,
    },
  ]);
  try {
    await Promise.all([
      ArenaRatingSettlement.init(),
      ArenaMatchParticipantLock.init(),
      ArenaMatchmakingEntry.init(),
      ArenaFriendRequest.init(),
      ArenaFriendship.init(),
      ArenaFriendlyInvitationV2.init(),
    ]);
    const competitive = await createFixture({
      mode: "COMPETITIVE",
      suffix: "COMPETITIVE",
      challengerProfile,
      defenderProfile,
    });
    const competingSettlements = await Promise.all([
      settleArenaV2Match({ matchId: competitive.matchId }),
      settleArenaV2Match({ matchId: competitive.matchId }),
    ]);
    assert.equal(competingSettlements.filter((result) => !result.replayed).length, 1);
    const first = competingSettlements.find((result) => !result.replayed);
    assert.equal(first.settled, true);
    assert.equal(first.replayed, false);
    assert.equal(first.winnerRole, "CHALLENGER");
    const afterFirst = await ArenaCompetitiveProfile.find({
      userId: { $in: [challengerUserId, defenderUserId] },
    }).sort({ userId: 1 }).lean();
    assert.equal(afterFirst[0].accountXp + afterFirst[1].accountXp, 8);
    assert.equal(afterFirst[0].competitiveMatchesCompleted + afterFirst[1].competitiveMatchesCompleted, 2);
    assert.notEqual(afterFirst[0].rating, 1500);
    assert.notEqual(afterFirst[1].rating, 1500);
    const winningProfile = afterFirst.find((profile) => String(profile.userId) === String(challengerUserId));
    const losingProfile = afterFirst.find((profile) => String(profile.userId) === String(defenderUserId));
    assert.equal(winningProfile.tier, tierForRating(winningProfile.rating).name);
    assert.equal(losingProfile.tier, tierForRating(losingProfile.rating).name);
    assert.notEqual(winningProfile.tier, tierForRating(1500).name, "win must promote across the existing tier boundary");
    assert.notEqual(losingProfile.tier, tierForRating(1500).name, "loss must demote across the existing tier boundary");
    const firstSnapshot = afterFirst.map((profile) => ({
      id: String(profile.userId),
      xp: profile.accountXp,
      rating: profile.rating,
      wins: profile.wins,
      losses: profile.losses,
    }));
    const replay = await settleArenaV2Match({ matchId: competitive.matchId });
    assert.equal(replay.replayed, true);
    const afterReplay = await ArenaCompetitiveProfile.find({
      userId: { $in: [challengerUserId, defenderUserId] },
    }).sort({ userId: 1 }).lean();
    assert.deepEqual(
      afterReplay.map((profile) => ({
        id: String(profile.userId),
        xp: profile.accountXp,
        rating: profile.rating,
        wins: profile.wins,
        losses: profile.losses,
      })),
      firstSnapshot
    );
    assert.equal(await ArenaRatingSettlement.countDocuments({ matchId: competitive.matchId }), 1);
    assert.equal(await ArenaMatchParticipantLock.countDocuments({ matchId: competitive.matchId }), 0);

    const beforeFriendly = afterReplay.map((profile) => ({
      id: String(profile.userId),
      xp: profile.accountXp,
      rating: profile.rating,
      completed: profile.competitiveMatchesCompleted,
    }));
    const friendly = await createFixture({
      mode: "FRIENDLY",
      suffix: "FRIENDLY",
      challengerProfile,
      defenderProfile,
    });
    await settleArenaV2Match({ matchId: friendly.matchId });
    const afterFriendly = await ArenaCompetitiveProfile.find({
      userId: { $in: [challengerUserId, defenderUserId] },
    }).sort({ userId: 1 }).lean();
    assert.deepEqual(
      afterFriendly.map((profile) => ({
        id: String(profile.userId),
        xp: profile.accountXp,
        rating: profile.rating,
        completed: profile.competitiveMatchesCompleted,
      })),
      beforeFriendly
    );

    const forced = await createFixture({
      mode: "NORMAL",
      suffix: "FORCED-NORMAL",
      challengerProfile,
      defenderProfile,
    });
    const beforeForced = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    await settleArenaV2Match({
      matchId: forced.matchId,
      forcedWinnerRole: "CHALLENGER",
      automaticReason: "DEFENDER_NO_SHOW",
    });
    const afterForced = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    assert.equal(afterForced.accountXp, beforeForced.accountXp);
    assert.equal(afterForced.normalMatchesCompleted, beforeForced.normalMatchesCompleted);

    const cancelled = await createFixture({
      mode: "COMPETITIVE",
      suffix: "CANCELLED",
      challengerProfile,
      defenderProfile,
    });
    const beforeCancel = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    await cancelArenaV2Match({ matchId: cancelled.matchId, reason: "SERVER_ERROR" });
    const afterCancel = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    assert.equal(afterCancel.rating, beforeCancel.rating);
    assert.equal(afterCancel.accountXp, beforeCancel.accountXp);
    assert.equal(await ArenaRatingSettlement.countDocuments({ matchId: cancelled.matchId }), 0);

    const integrityClear = await createFixture({
      mode: "NORMAL",
      suffix: "INTEGRITY-CLEAR",
      challengerProfile,
      defenderProfile,
      withEvidenceFiles: true,
    });
    await ArenaMatch.updateOne(
      { _id: integrityClear.matchId },
      { $set: { status: "HELD", integrityStatus: "SUSPICIOUS" } }
    );
    const beforeClear = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    const clearResult = await reviewHeldArenaV2Match({
      matchId: integrityClear.matchId,
      adminUserId: new mongoose.Types.ObjectId(),
      decision: "CLEAR",
      note: "DB 검증: 이상 없음",
    });
    assert.equal(clearResult.settlement.status, "SETTLED");
    const afterClear = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    assert.equal(afterClear.accountXp, beforeClear.accountXp + 1);
    assert.equal(afterClear.normalMatchesCompleted, beforeClear.normalMatchesCompleted + 1);
    assert.equal(
      await ArenaMatchEvidence.countDocuments({
        matchId: integrityClear.matchId,
        status: "REVIEWED",
      }),
      2
    );

    const integrityConfirmed = await createFixture({
      mode: "COMPETITIVE",
      suffix: "INTEGRITY-CONFIRMED",
      challengerProfile,
      defenderProfile,
    });
    await ArenaMatch.updateOne(
      { _id: integrityConfirmed.matchId },
      { $set: { status: "HELD", integrityStatus: "SUSPICIOUS" } }
    );
    const beforeConfirmed = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    const confirmedResult = await reviewHeldArenaV2Match({
      matchId: integrityConfirmed.matchId,
      adminUserId: new mongoose.Types.ObjectId(),
      decision: "DEFENDER_CHEATING",
      note: "DB 검증: 방어자 부정행위 확인",
    });
    assert.equal(confirmedResult.settlement.status, "SETTLED");
    assert.equal(confirmedResult.settlement.winnerRole, "CHALLENGER");
    const afterConfirmed = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    assert.equal(afterConfirmed.accountXp, beforeConfirmed.accountXp);
    assert.notEqual(afterConfirmed.rating, beforeConfirmed.rating);
    assert.equal((await getArenaActivityLevel(challengerUserId)).totalMatches, afterConfirmed.accountXp);

    const bothCheating = await createFixture({
      mode: "COMPETITIVE",
      suffix: "INTEGRITY-BOTH",
      challengerProfile,
      defenderProfile,
    });
    await ArenaMatch.updateOne(
      { _id: bothCheating.matchId },
      { $set: { status: "HELD", integrityStatus: "SUSPICIOUS" } }
    );
    const beforeBoth = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    const bothResult = await reviewHeldArenaV2Match({
      matchId: bothCheating.matchId,
      adminUserId: new mongoose.Types.ObjectId(),
      decision: "BOTH_CHEATING",
      note: "DB 검증: 양측 부정행위 확인",
    });
    assert.equal(bothResult.settlement.status, "CANCELLED");
    const afterBoth = await ArenaCompetitiveProfile.findById(challengerProfile._id).lean();
    assert.equal(afterBoth.accountXp, beforeBoth.accountXp);
    assert.equal(afterBoth.rating, beforeBoth.rating);
    await assert.rejects(
      () => joinArenaV2Queue({
        userId: challengerUserId,
        mode: "NORMAL",
        now: new Date("2026-10-09T12:00:00.000Z"),
      }),
      (error) =>
        error?.code === "ARENA_NORMAL_RECORD_UNAVAILABLE" &&
        error?.code !== "ARENA_INTEGRITY_RESTRICTED"
    );
    await ArenaAccessState.updateMany(
      { userId: { $in: [challengerUserId, defenderUserId] } },
      {
        $set: {
          integrityStatus: "CLEAR",
          matchmakingRestrictedUntil: null,
          integrityPenaltyReason: "",
        },
      }
    );

    await assert.rejects(
      joinArenaV2Queue({
        userId: challengerUserId,
        mode: "NORMAL",
        now: new Date("2026-10-09T11:59:00.000Z"),
      }),
      (error) => error?.code === "ARENA_NORMAL_RECORD_UNAVAILABLE",
      "normal matchmaking must not create a no-opponent first record"
    );
    const baselineOwnerId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id: baselineOwnerId,
      name: "arena-baseline-owner",
      nameNormalized: "arena-baseline-owner",
      email: "arena-baseline-owner@example.invalid",
      accountStatus: "active",
      isActive: true,
      createdAt: placedAt,
      updatedAt: placedAt,
    });
    const baselineRecord = await seedNormalBaseline(
      baselineOwnerId,
      1000,
      new Date("2026-10-09T11:59:30.000Z")
    );

    const queued = await joinArenaV2Queue({
      userId: challengerUserId,
      mode: "NORMAL",
      now: new Date("2026-10-09T12:00:00.000Z"),
    });
    assert.equal(queued.asynchronous, true);
    assert.equal(queued.match.normalAsync.enabled, true);
    assert.equal(queued.match.normalAsync.firstRecord, false);
    const queueCancelled = await cancelArenaV2Match({
      matchId: queued.match._id,
      reason: "AUDIT_ASYNC_NORMAL_CANCEL",
      now: new Date("2026-10-09T12:01:00.000Z"),
    });
    assert.equal(queueCancelled.status, "CANCELLED");

    const friendRequest = await sendArenaFriendRequest({
      requesterUserId: challengerUserId,
      recipientUserId: defenderUserId,
    });
    assert.equal(friendRequest.status, "PENDING");
    const reciprocal = await sendArenaFriendRequest({
      requesterUserId: defenderUserId,
      recipientUserId: challengerUserId,
    });
    assert.ok(reciprocal.friendship);
    assert.equal((await listArenaFriends(challengerUserId)).length, 1);
    const invitation = await createArenaFriendlyInvitation({
      inviterUserId: challengerUserId,
      inviteeUserId: defenderUserId,
      requestId: "ARENA2-DB-FRIENDLY-DECLINE",
      now: new Date("2026-10-09T12:02:00.000Z"),
    });
    const declined = await respondArenaFriendlyInvitation({
      invitationId: invitation._id,
      userId: defenderUserId,
      response: "DECLINE",
      now: new Date("2026-10-09T12:03:00.000Z"),
    });
    assert.equal(declined.invitation.status, "DECLINED");

    const newUserIds = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
    await User.collection.insertMany(newUserIds.map((_id, index) => ({
      _id,
      name: `arena-new-${index}`,
      nameNormalized: `arena-new-${index}`,
      email: `arena-new-${index}@example.invalid`,
      accountStatus: "active",
      isActive: true,
      createdAt: placedAt,
      updatedAt: placedAt,
    })));
    const searchAt = new Date("2026-10-09T13:00:00.000Z");
    const concurrentJoins = await Promise.allSettled([
      joinArenaV2Queue({ userId: newUserIds[0], mode: "NORMAL", now: searchAt }),
      joinArenaV2Queue({ userId: newUserIds[0], mode: "NORMAL", now: searchAt }),
    ]);
    const fulfilledNormalJoins = concurrentJoins.filter((result) => result.status === "fulfilled");
    const rejectedNormalJoins = concurrentJoins.filter((result) => result.status === "rejected");
    assert.equal(fulfilledNormalJoins.length, 1, "concurrent normal starts create one active match");
    assert.equal(rejectedNormalJoins.length, 1);
    const firstNormal = fulfilledNormalJoins[0].value;
    assert.equal(firstNormal.match.normalAsync.firstRecord, false);
    const heartbeatAt = new Date(searchAt.getTime() + 11 * 60 * 1000);
    assert.equal(await getArenaV2QueueState({ userId: newUserIds[0], now: heartbeatAt }), null);
    const sealedPack = await ArenaProblemPack.findById(firstNormal.match.problemPackId).select("+questions").lean();
    assert.equal(sealedPack.status, "SEALED");
    assert.equal(sealedPack.questions.length, 5);
    assert.ok(sealedPack.questions.every((question) =>
      ["algebra", "calculus-1", "probability-statistics"].includes(question.courseId)
    ));
    const firstAttempts = await ArenaMatchAttempt.find({ matchId: firstNormal.match._id }).lean();
    assert.equal(firstAttempts.length, 1);
    assert.equal(firstAttempts[0].variantCode, "INDIVIDUAL");
    assert.equal(String(firstNormal.match.challenger.userId), String(newUserIds[0]));

    const completeNormalAttempt = async ({ match, userId, pack, suffix }) => {
      await startArenaMatchAttempt({
        matchId: match._id, userId, requestId: `AUDIT-START-${suffix}`, now: heartbeatAt,
      });
      for (let index = 0; index < 5; index += 1) {
        await advanceArenaMatchQuestion({
          matchId: match._id, userId, requestId: `AUDIT-QUESTION-${suffix}-${index}`,
          value: String(pack.questions[index].answerKey?.correctAnswer ?? pack.questions[index].answer),
          now: new Date(heartbeatAt.getTime() + (index + 1) * 70000),
        });
      }
      const evidenceAt = new Date(heartbeatAt.getTime() + 351000);
      const submission = await submitArenaMatchEvidence({
        matchId: match._id, userId, files: [],
        preparedEvidenceFiles: pack.questions.map((_question, index) => ({
          originalName: `solution-${index}.png`, storedName: `audit-${suffix}-${index}.png`,
          mimeType: "image/png", sizeBytes: 32768,
          sha256: createHash("sha256").update(`${suffix}:${index}`).digest("hex"),
          questionSlot: index + 1,
        })),
        receivedAt: evidenceAt, now: evidenceAt,
      });
      assert.equal(submission.anomalyFlags.length, 0);
      assert.equal("dailyLearning" in submission, false);
      return settleAsyncNormalMatch({ matchId: match._id, userId, now: evidenceAt });
    };

    const completeNormal = await completeNormalAttempt({
      match: firstNormal.match,
      userId: newUserIds[0],
      pack: sealedPack,
      suffix: "FIRST-NORMAL",
    });
    assert.equal(completeNormal.settled, true);
    assert.equal(completeNormal.winnerRole, "CHALLENGER");
    assert.equal(await ArenaCompetitiveRecord.countDocuments({ recordMode: "NORMAL", ownerUserId: newUserIds[0] }), 1);
    assert.equal(await ArenaMatchEvidence.countDocuments({ matchId: firstNormal.match._id, "files.4": { $exists: true } }), 1);
    assert.equal(await getArenaV2QueueState({ userId: newUserIds[0], now: heartbeatAt }), null);
    await ArenaCompetitiveRecord.updateOne(
      { _id: baselineRecord._id },
      { $set: { status: "INVALID" } }
    );

    const paired = await joinArenaV2Queue({ userId: newUserIds[1], mode: "NORMAL", now: heartbeatAt });
    assert.ok(paired.match.normalAsync.historicalRecordId);
    assert.equal(paired.match.normalAsync.firstRecord, false);
    const pairedPack = await ArenaProblemPack.findById(paired.match.problemPackId).select("+questions").lean();
    assert.notEqual(String(pairedPack._id), String(sealedPack._id));
    await completeNormalAttempt({
      match: paired.match,
      userId: newUserIds[1],
      pack: pairedPack,
      suffix: "PAIRED-NORMAL",
    });
    const pairedResult = await getAsyncNormalResult({
      matchId: paired.match._id,
      userId: newUserIds[1],
    });
    assert.equal(
      pairedResult.challenger.questions[0].submittedAnswer,
      String(pairedPack.questions[0].answerKey?.correctAnswer ?? pairedPack.questions[0].answer)
    );
    assert.equal(
      pairedResult.historicalOpponent.questions[0].submittedAnswer,
      String(sealedPack.questions[0].answerKey?.correctAnswer ?? sealedPack.questions[0].answer)
    );
    assert.equal("answer" in pairedResult.challenger.questions[0], false);
    assert.equal("answerKey" in pairedResult.historicalOpponent.questions[0], false);
    const historicalOwnerResult = await getAsyncNormalResult({
      matchId: paired.match._id,
      userId: newUserIds[0],
    });
    assert.equal(historicalOwnerResult.historicalOpponent.isViewer, true);
    assert.equal(historicalOwnerResult.challenger.isViewer, false);
    const usedRecord = await ArenaCompetitiveRecord.findById(paired.match.normalAsync.historicalRecordId).lean();
    assert.equal(usedRecord.status, "AVAILABLE");
    assert.equal(usedRecord.usageCount, 1);
    const normalProfiles = await ArenaCompetitiveProfile.find({ userId: { $in: newUserIds.slice(0, 2) } }).lean();
    assert.ok(normalProfiles.every((profile) => profile.normalMatchesCompleted === 1 && profile.accountXp === 1 && profile.rating === null));

    const nextNormal = await joinArenaV2Queue({ userId: newUserIds[0], mode: "NORMAL", now: heartbeatAt });
    assert.ok(nextNormal.match);
    await cancelArenaV2Match({ matchId: nextNormal.match._id, reason: "AUDIT_COMPLETE" });

    await sendArenaFriendRequest({ requesterUserId: newUserIds[0], recipientUserId: newUserIds[1] });
    await sendArenaFriendRequest({ requesterUserId: newUserIds[1], recipientUserId: newUserIds[0] });
    await ArenaAccessState.collection.updateOne(
      { userId: newUserIds[1] },
      {
        $set: {
          integrityStatus: "RESTRICTED",
          reasonCode: "INTEGRITY_PENALTY_5_DAYS",
          matchmakingRestrictedUntil: new Date(heartbeatAt.getTime() + 5 * 24 * 60 * 60 * 1000),
        },
      },
      { upsert: true }
    );
    const friendlyInvite = await createArenaFriendlyInvitation({
      inviterUserId: newUserIds[0], inviteeUserId: newUserIds[1], requestId: "E2E-FRIENDLY", now: heartbeatAt,
    });
    const friendlyAccepted = await respondArenaFriendlyInvitation({
      invitationId: friendlyInvite._id, userId: newUserIds[1], response: "ACCEPT", now: heartbeatAt,
    });
    assert.equal(friendlyAccepted.match.gameMode, "FRIENDLY");
    assert.equal(friendlyAccepted.invitation.status, "ACCEPTED");
    assert.equal(friendlyAccepted.match.integrityStatus, "PENDING");
    const acceptedReplay = await respondArenaFriendlyInvitation({
      invitationId: friendlyInvite._id, userId: newUserIds[1], response: "ACCEPT", now: heartbeatAt,
    });
    assert.equal(String(acceptedReplay.match._id), String(friendlyAccepted.match._id));
    await cancelArenaV2Match({ matchId: friendlyAccepted.match._id, reason: "AUDIT_COMPLETE" });

    await AssessmentAttempt.collection.insertMany(newUserIds.slice(2).map((userId, index) => ({
      _id: new mongoose.Types.ObjectId(),
      paperId: `ARENA2-AUDIT-PLACEMENT-${index}`,
      userId, scopeType: "placement", status: "submitted", placementPurpose: "INITIAL",
      placementContextKey: "ARENA2:PLACEMENT:1",
      scorePercent: 70 + index,
      placementResult: { initialMmr: 1500 + index * 100, placementScore: 70 + index },
      submittedAt: searchAt, createdAt: searchAt, updatedAt: searchAt,
    })));
    const provisional = await syncArenaV2PlacementProfile(newUserIds[2]);
    assert.equal(provisional.placementSamples.length, 1);
    assert.equal(provisional.provisionalRating, 1500);
    assert.equal(competitiveUnlockState(provisional).unlocked, false);
    const finalized = await finalizeArenaV2Placement(newUserIds[2]);
    assert.equal(finalized.rating, 1500);
    assert.ok(finalized.placementFinalizedAt);
    await finalizeArenaV2Placement(newUserIds[3]);
    await ArenaCompetitiveProfile.updateOne(
      { userId: newUserIds[2] }, { $set: { normalMatchesCompleted: 2 } }
    );
    await assert.rejects(
      joinArenaV2Queue({ userId: newUserIds[2], mode: "COMPETITIVE", now: heartbeatAt }),
      (error) => error.code === "ARENA_COMPETITIVE_NOT_RELEASED"
    );
    await ArenaCompetitiveProfile.updateMany(
      { userId: { $in: newUserIds.slice(2) } },
      { $set: { normalMatchesCompleted: 3 } }
    );
    await assert.rejects(
      joinArenaV2Queue({ userId: newUserIds[2], mode: "COMPETITIVE", now: heartbeatAt }),
      (error) => error.code === "ARENA_COMPETITIVE_NOT_RELEASED"
    );

    const autoPlacementUser = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id: autoPlacementUser, name: "arena-auto-placement", accountStatus: "active", isActive: true,
    });
    await AssessmentAttempt.collection.insertMany(Array.from({ length: 5 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(),
      paperId: `ARENA2-AUDIT-AUTO-${index}`,
      userId: autoPlacementUser, scopeType: "placement", status: "submitted", placementPurpose: "INITIAL",
      placementContextKey: `ARENA2:PLACEMENT:${index + 1}`,
      scorePercent: 70, placementResult: { initialMmr: 1500, placementScore: 70 },
      submittedAt: new Date(searchAt.getTime() + index * 1000), createdAt: searchAt, updatedAt: searchAt,
    })));
    const automaticallyFinalized = await syncArenaV2PlacementProfile(autoPlacementUser);
    assert.equal(automaticallyFinalized.placementSamples.length, 5);
    assert.equal(automaticallyFinalized.placementFinalizedReason, "MAX_ATTEMPTS");
    assert.ok(automaticallyFinalized.ratingDeviation < finalized.ratingDeviation);
    assert.equal(competitiveUnlockState(automaticallyFinalized).unlocked, false);

    console.log("GOAT Arena 2.0 DB verification passed: Glicko-2 and exact-once settlement, held reviews, placement/unlock, all three match creation paths, sealed common questions, queue heartbeat/reentry, and friend invitations.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
