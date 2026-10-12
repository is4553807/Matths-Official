"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const {
  ArenaCompetitiveProfile,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestIdentity,
  ArenaGuestSolutionBoard,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaProblemPack,
  ArenaRatingSettlement,
} = require("../models/goatArenaModel");
const {
  GUEST_COOKIE_NAME,
  advanceGuestAttempt,
  claimGuestChallenge,
  claimGuestRecordsForUser,
  createGuestChallenge,
  createGuestChallengeFromClaimedAttempt,
  finalizeGuestBoards,
  getClaimedGuestRecordPageData,
  getClaimedGuestRecords,
  getGuestChallengePageData,
  getGuestEvidenceFile,
  getGuestNicknameAvailability,
  getGuestRegistrationClaimPreview,
  guestNicknameClaimStatus,
  lockGuestQuestionCompletion,
  startGuestAttempt,
} = require("../services/arenaGuestChallengeService");
const {
  calculateCompetitivePerformance,
  compareCountThenTimePerformance,
} = require("../services/arenaCompetitiveScoringService");
const { POOL_ENTRIES } = require("../services/arenaPdfOneOnOneQuestionPool");
const {
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS,
  ARENA_ONE_ON_ONE_QUESTION_COUNT,
  ARENA_ONE_ON_ONE_TIME_LIMIT_MS,
} = require("../services/arenaOneOnOneProblemBank");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");
const { purgeExpiredArenaEvidence } = require("../services/arenaMatchEvidenceService");

const now = new Date();
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const REQUIRED_GUEST_COMPLETION_GRACE_MS =
  ARENA_ONE_ON_ONE_QUESTION_COUNT * ARENA_ONE_ON_ONE_TIME_LIMIT_MS +
  ARENA_ONE_ON_ONE_EVIDENCE_LIMIT_MS;
const CREATOR_BIRTH_DATE = "2007-01-01";
const MEMBER_BIRTH_DATE = "2007-02-02";
const OWNER_BIRTH_DATE = "2007-03-03";
const RIVAL_BIRTH_DATE = "2007-04-04";
const OTHER_BIRTH_DATE = "2007-05-05";

function evidenceFile(name, character) {
  return {
    originalName: `${name}.png`,
    storedName: `${name}.png`,
    mimeType: "image/png",
    sizeBytes: 4096,
    sha256: character.repeat(64),
    storageProvider: "CLOUDINARY",
    storagePurpose: "USER_ARENA_EVIDENCE",
    cloudPublicId: `audit/${name}`,
    cloudResourceType: "image",
    cloudDeliveryType: "authenticated",
  };
}

function exactSourceIds() {
  return POOL_ENTRIES.filter((entry) => {
    const rate = Number(entry.source?.accuracyEvidence?.correctRatePercent);
    return Number.isFinite(rate) && rate > 0 && rate < 100;
  }).slice(0, 5).map((entry) => entry.definition.sourceReferenceId);
}

function progressFields(profile) {
  return {
    userId: String(profile.userId),
    normalMatchesCompleted: profile.normalMatchesCompleted,
    competitiveMatchesCompleted: profile.competitiveMatchesCompleted,
    wins: profile.wins,
    losses: profile.losses,
    draws: profile.draws,
    accountXp: profile.accountXp,
    accountLevel: profile.accountLevel,
    rating: profile.rating,
    ratingDeviation: profile.ratingDeviation,
    volatility: profile.volatility,
    tier: profile.tier,
  };
}

async function guestSideEffectSnapshot(userIds) {
  const profiles = await ArenaCompetitiveProfile.find({
    userId: { $in: userIds },
  }).sort({ userId: 1 }).lean();
  const [ratingSettlements, integrityLinkSignals, integrityRiskProfiles, integrityRiskCases] =
    await Promise.all([
      ArenaRatingSettlement.countDocuments({}),
      ArenaIntegrityLinkSignal.countDocuments({}),
      ArenaIntegrityRiskProfile.countDocuments({}),
      ArenaIntegrityRiskCase.countDocuments({}),
    ]);
  return {
    profiles: profiles.map(progressFields),
    ratingSettlements,
    integrityLinkSignals,
    integrityRiskProfiles,
    integrityRiskCases,
  };
}

async function completeGuestAttemptWithBoards({
  rawToken,
  cookieHeader = "",
  viewerUserId = null,
  attempt,
  questions,
  startedAt,
  answerIntervalMs,
  evidencePrefix,
}) {
  for (let index = 0; index < questions.length; index += 1) {
    await advanceGuestAttempt({
      rawToken,
      cookieHeader,
      viewerUserId,
      answer: questions[index].answer,
      now: new Date(startedAt.getTime() + answerIntervalMs * (index + 1)),
    });
  }
  await ArenaGuestSolutionBoard.insertMany(questions.map((_question, index) => ({
    attemptId: attempt._id,
    guestIdentityId: attempt.guestIdentityId,
    questionSlot: index + 1,
    revision: 1,
    strokeCount: 3,
    drawingData: Buffer.from(`audit-${evidencePrefix}-${index + 1}`, "utf8"),
    file: {
      ...evidenceFile(`${evidencePrefix}-${index + 1}`, String((index + 1) % 10)),
      questionSlot: index + 1,
      revision: 1,
      strokeCount: 3,
    },
  })));
  return finalizeGuestBoards({
    rawToken,
    cookieHeader,
    viewerUserId,
    now: new Date(startedAt.getTime() + answerIntervalMs * questions.length + 1000),
  });
}

async function createSourceFixture(
  creatorUserId,
  { gameMode = "NORMAL", difficultyCode = "U9", rating = 1777 } = {}
) {
  const matchId = new mongoose.Types.ObjectId();
  const attemptId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const packId = new mongoose.Types.ObjectId();
  const sourceIds = exactSourceIds();
  assert.equal(sourceIds.length, 5);
  const questions = sourceIds.map((sourceTypeId, index) => ({
    questionKey: `GUEST-SOURCE-Q${index + 1}`,
    typeId: `GUEST-SOURCE-TYPE-${index + 1}`,
    typeSkeletonId: `GUEST-SOURCE-SKELETON-${index + 1}`,
    sourceTypeId,
    prompt: `게스트 친선 실제 문항 ${index + 1}`,
    choices: [],
    visualization: null,
    answer: String(index + 1),
    points: 20,
  }));
  await ArenaProblemPack.collection.insertOne({
    _id: packId,
    version: `AUDIT-GUEST-SOURCE-${matchId}`,
    difficultyCode,
    questions,
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatch.collection.insertOne({
    _id: matchId,
    matchKey: `AUDIT-GUEST-SOURCE:${matchId}`,
    arenaVersion: "2.0",
    gameMode,
    division: gameMode === "COMPETITIVE" ? "MAIN" : "SUB",
    matchType: "NORMAL",
    status: "SETTLED",
    integrityStatus: "CLEAR",
    ...(gameMode === "COMPETITIVE"
      ? {
          competitiveAsync: {
            enabled: true,
            challengerRatingBefore: {
              rating,
              ratingDeviation: 85,
              volatility: 0.06,
              tier: "CHALLENGER",
            },
          },
        }
      : {
          normalAsync: {
            enabled: true,
            firstRecord: true,
            matchmakingRating: rating,
          },
        }),
    challenger: { userId: creatorUserId },
    defender: { userId: creatorUserId },
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatchAttempt.collection.insertOne({
    _id: attemptId,
    matchId,
    userId: creatorUserId,
    role: "CHALLENGER",
    problemPackId: packId,
    problemPackVersion: `AUDIT-GUEST-SOURCE-${matchId}`,
    status: "SUBMITTED",
    answers: questions.map((question, index) => ({
      questionKey: question.questionKey,
      value: index < 3 ? question.answer : "999",
      revision: 1,
      lastChangedAt: now,
    })),
    activeSolveTimeMs: 500000,
    submittedAt: now,
    evidenceSubmittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatchEvidence.collection.insertOne({
    _id: evidenceId,
    matchId,
    attemptId,
    userId: creatorUserId,
    originalEvidenceSubmitted: true,
    files: [evidenceFile("creator-solution", "a")],
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return { matchId, attemptId, evidenceId, packId, questions };
}

async function settleAttemptDirect({
  attemptId,
  challenge,
  questions,
  correctCount,
  totalSolveTimeMs,
  evidenceName,
  evidenceCharacter,
  settledAt,
}) {
  const sourceRates = challenge.sourcePerformance.observations.map((item) => item.p);
  const performance = calculateCompetitivePerformance({
    questions: questions.map((question, index) => ({
      questionKey: question.questionKey,
      correct: index < correctCount,
      sourceAccuracyRate: sourceRates[index],
    })),
    totalSolveTimeMs,
  });
  const comparison = compareCountThenTimePerformance(
    performance,
    challenge.sourcePerformance
  );
  await ArenaGuestChallengeAttempt.updateOne(
    { _id: attemptId },
    {
      $set: {
        status: "SETTLED",
        activeSolveTimeMs: totalSolveTimeMs,
        performance,
        scoring: performance,
        comparison,
        result: comparison.winnerRole === "CHALLENGER"
          ? "CHALLENGER_WIN"
          : comparison.winnerRole === "DEFENDER"
            ? "CREATOR_WIN"
            : "DRAW",
        evidenceFiles: [evidenceFile(evidenceName, evidenceCharacter)],
        evidenceSubmittedAt: settledAt,
        settledAt,
      },
    }
  );
  const activeAttemptCount = await ArenaGuestChallengeAttempt.countDocuments({
    challengeId: challenge._id,
    status: { $in: ["READY", "IN_PROGRESS", "EVIDENCE_REQUIRED"] },
  });
  if (activeAttemptCount === 0) {
    await ArenaGuestChallenge.updateOne(
      { _id: challenge._id, resultsReleasedAt: null },
      { $set: { resultsReleasedAt: settledAt } }
    );
  }
  return performance;
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([
      ArenaCompetitiveProfile.init(),
      ArenaGuestIdentity.init(),
      ArenaGuestChallenge.init(),
      ArenaGuestChallengeAttempt.init(),
      ArenaGuestSolutionBoard.init(),
    ]);
    const creatorUserId = new mongoose.Types.ObjectId();
    const accountUserId = new mongoose.Types.ObjectId();
    const chainedAccountUserId = new mongoose.Types.ObjectId();
    const strangerUserId = new mongoose.Types.ObjectId();
    await User.collection.insertMany([
      {
        _id: creatorUserId,
        name: "guest-link-creator",
        nameNormalized: "guest-link-creator",
        email: "guest-link-creator@example.invalid",
        birthDate: new Date(`${CREATOR_BIRTH_DATE}T00:00:00.000Z`),
        accountStatus: "active",
        isActive: true,
      },
      {
        _id: strangerUserId,
        name: "reserved-member-name",
        nameNormalized: "reserved-member-name",
        email: "reserved-member@example.invalid",
        birthDate: new Date(`${MEMBER_BIRTH_DATE}T00:00:00.000Z`),
        accountStatus: "active",
        isActive: true,
      },
    ]);
    await ArenaCompetitiveProfile.create([
      {
        userId: creatorUserId,
        normalMatchesCompleted: 2,
        competitiveMatchesCompleted: 7,
        wins: 4,
        losses: 2,
        draws: 1,
        accountXp: 9,
        accountLevel: 2,
        rating: 1777,
        ratingDeviation: 85,
        volatility: 0.06,
        tier: "T3",
      },
      {
        userId: strangerUserId,
        normalMatchesCompleted: 1,
        competitiveMatchesCompleted: 3,
        wins: 1,
        losses: 2,
        draws: 0,
        accountXp: 4,
        accountLevel: 1,
        rating: 1666,
        ratingDeviation: 110,
        volatility: 0.06,
        tier: "T4",
      },
    ]);
    const source = await createSourceFixture(creatorUserId);
    const invitation = await createGuestChallenge({
      creatorUserId,
      sourceMatchId: source.matchId,
      now,
    });
    assert.equal(GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlDays, 3);
    assert.equal(GOAT_ARENA_V2_CONFIG.guestChallenge.linkTtlMs, THREE_DAYS_MS);
    assert.ok(
      GOAT_ARENA_V2_CONFIG.guestChallenge.completionGraceMs >= REQUIRED_GUEST_COMPLETION_GRACE_MS,
      "the in-flight completion grace must cover five full question windows plus final submission"
    );
    assert.equal(new Date(invitation.expiresAt).getTime() - now.getTime(), THREE_DAYS_MS);
    assert.equal(invitation.relativeUrl.startsWith("/arena-invite/"), true);
    const storedInvitation = await ArenaGuestChallenge.findById(invitation.id).lean();
    assert.equal(storedInvitation.creatorRatingSnapshot, 1777);
    assert.equal(storedInvitation.difficultyCodeSnapshot, "U9");
    assert.equal(storedInvitation.difficultyPolicy, "CHALLENGER_MMR_V1");
    const competitiveSource = await createSourceFixture(creatorUserId, {
      gameMode: "COMPETITIVE",
      difficultyCode: "R9",
      rating: 1777,
    });
    const competitiveInvitation = await createGuestChallenge({
      creatorUserId,
      sourceMatchId: competitiveSource.matchId,
      now: new Date(now.getTime() + 50),
    });
    const holdBeforeFailure = (await ArenaMatchEvidence.findById(source.evidenceId).lean()).retentionReferences;
    const originalChallengeCreate = ArenaGuestChallenge.create;
    try {
      ArenaGuestChallenge.create = async () => { throw new Error("Injected challenge persistence failure"); };
      await assert.rejects(createGuestChallenge({ creatorUserId, sourceMatchId: source.matchId, now }), /Injected challenge persistence failure/);
    } finally { ArenaGuestChallenge.create = originalChallengeCreate; }
    assert.deepEqual((await ArenaMatchEvidence.findById(source.evidenceId).lean()).retentionReferences, holdBeforeFailure,
      "failed challenge creation rolls back only its new reference and preserves existing references");
    const storedCompetitiveInvitation = await ArenaGuestChallenge.findById(
      competitiveInvitation.id
    ).lean();
    assert.equal(storedCompetitiveInvitation.creatorRatingSnapshot, 1777);
    assert.equal(storedCompetitiveInvitation.difficultyCodeSnapshot, "R9");
    assert.equal(storedCompetitiveInvitation.difficultyPolicy, "CHALLENGER_MMR_V1");
    assert.ok(
      (await ArenaMatchEvidence.findById(source.evidenceId).lean()).retentionReferences.some((reference) => reference.referenceKey === `GUEST:${invitation.id}`),
      "a guest invitation atomically preserves its referenced source working evidence"
    );
    await ArenaMatchEvidence.updateOne(
      { _id: source.evidenceId },
      {
        $set: {
          status: "ON_TIME",
          retentionUntil: new Date(now.getTime() - 1000),
          retentionHoldReason: "",
          retentionReferences: [],
          contentPurgedAt: null,
        },
      }
    );
    const referencedPurge = await purgeExpiredArenaEvidence({ now, limit: 10 });
    assert.equal(referencedPurge.purged, 0);
    assert.equal(referencedPurge.held, 1);
    assert.equal(
      (await ArenaMatchEvidence.findById(source.evidenceId).lean()).retentionHoldReason,
      "GUEST_CHALLENGE_ARCHIVE",
      "the purge worker restores a hold for referenced legacy evidence before deleting assets"
    );
    assert.equal(
      await ArenaGuestChallenge.countDocuments({ tokenHash: invitation.token }),
      0,
      "raw invitation tokens are never stored"
    );
    assert.equal((await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "guest-link-creator",
      birthDate: CREATOR_BIRTH_DATE,
      cookieHeader: "",
      viewerUserId: creatorUserId,
      now,
    })).available, false);
    await assert.rejects(
      claimGuestChallenge({
        rawToken: invitation.token,
        nickname: "guest-link-creator",
        birthDate: CREATOR_BIRTH_DATE,
        cookieHeader: "",
        viewerUserId: creatorUserId,
        now,
      }),
      (error) => error.code === "ARENA_GUEST_CREATOR_CANNOT_JOIN",
      "the sender cannot create a second participant row in their own challenge"
    );

    const invalidAvailability = await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "x",
      birthDate: OTHER_BIRTH_DATE,
      cookieHeader: "",
      now,
    });
    assert.equal(invalidAvailability.valid, false);
    assert.equal(invalidAvailability.available, false);

    const memberConflict = await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "reserved-member-name",
      birthDate: MEMBER_BIRTH_DATE,
      cookieHeader: "",
      now,
    });
    assert.equal(memberConflict.valid, true);
    assert.equal(memberConflict.available, false);
    assert.equal(memberConflict.message, "사용 불가능한 닉네임입니다.");

    const memberInvitation = await createGuestChallenge({
      creatorUserId,
      sourceMatchId: source.matchId,
      now: new Date(now.getTime() + 100),
    });
    const ownMemberAvailability = await getGuestNicknameAvailability({
      rawToken: memberInvitation.token,
      nickname: "reserved-member-name",
      birthDate: MEMBER_BIRTH_DATE,
      cookieHeader: "",
      viewerUserId: strangerUserId,
      now: new Date(now.getTime() + 200),
    });
    assert.equal(ownMemberAvailability.available, true);
    const memberJoin = await claimGuestChallenge({
      rawToken: memberInvitation.token,
      nickname: "reserved-member-name",
      birthDate: MEMBER_BIRTH_DATE,
      cookieHeader: "",
      viewerUserId: strangerUserId,
      now: new Date(now.getTime() + 300),
    });
    assert.equal(String(memberJoin.identity.claimedByUserId), String(strangerUserId));
    assert.equal(memberJoin.cookieValue, null);
    assert.equal((await getGuestChallengePageData({
      rawToken: memberInvitation.token,
      cookieHeader: "",
      viewerUserId: strangerUserId,
      now: new Date(now.getTime() + 400),
    })).isGuest, true);
    const memberSideEffectsBefore = await guestSideEffectSnapshot([
      creatorUserId,
      strangerUserId,
    ]);
    const sourceIntegrityBeforeMemberCompletion = await ArenaMatch.findById(source.matchId)
      .select("integrityStatus integrityCaseId")
      .lean();
    const memberStartCandidates = [
      new Date(now.getTime() + 500),
      new Date(now.getTime() + 1500),
    ];
    const concurrentMemberStarts = await Promise.all(memberStartCandidates.map((startedAt) =>
      startGuestAttempt({
        rawToken: memberInvitation.token,
        cookieHeader: "",
        viewerUserId: strangerUserId,
        now: startedAt,
      })
    ));
    const memberAttempt = concurrentMemberStarts[0];
    const memberStartedAt = new Date(memberAttempt.startedAt);
    assert.equal(String(concurrentMemberStarts[0]._id), String(concurrentMemberStarts[1]._id));
    assert.equal(
      new Date(concurrentMemberStarts[0].startedAt).getTime(),
      new Date(concurrentMemberStarts[1].startedAt).getTime(),
      "concurrent starts return the winning CAS timestamp instead of resetting the timer"
    );
    assert.ok(
      memberStartCandidates.some((candidate) => candidate.getTime() === memberStartedAt.getTime()),
      "exactly one requested start timestamp wins the READY-to-IN_PROGRESS transition"
    );
    assert.equal(
      new Date(memberAttempt.deadlineAt).getTime() - memberStartedAt.getTime(),
      10 * 60 * 1000
    );
    assert.equal(memberAttempt.answers.length, 5);
    assert.equal(memberAttempt.questionTimings.length, 1);
    const persistedMemberStart = await ArenaGuestChallengeAttempt.findById(memberAttempt._id).lean();
    assert.equal(new Date(persistedMemberStart.startedAt).getTime(), memberStartedAt.getTime());
    assert.equal(new Date(persistedMemberStart.deadlineAt).getTime(), new Date(memberAttempt.deadlineAt).getTime());
    const finalizedMemberAttempt = await completeGuestAttemptWithBoards({
      rawToken: memberInvitation.token,
      viewerUserId: strangerUserId,
      attempt: memberAttempt,
      questions: source.questions,
      startedAt: memberStartedAt,
      answerIntervalMs: 60000,
      evidencePrefix: "member-friendly-board",
    });
    assert.equal(finalizedMemberAttempt.status, "SETTLED");
    const linkedMemberResultView = await getGuestChallengePageData({
      rawToken: memberInvitation.token,
      cookieHeader: "",
      viewerUserId: strangerUserId,
      now: new Date(memberStartedAt.getTime() + 6 * 60 * 1000),
    });
    assert.equal(linkedMemberResultView.reverseChallengeRequestPath, "");
    assert.equal(
      linkedMemberResultView.reverseCreatePath,
      `/goat-arena/guest-records/${finalizedMemberAttempt._id}/guest-invitations`,
      "an authenticated linked participant receives the direct reverse-challenge creation path"
    );
    assert.deepEqual(
      await guestSideEffectSnapshot([creatorUserId, strangerUserId]),
      memberSideEffectsBefore,
      "finishing a guest friendly challenge must not change XP, normal unlock progress, competitive MMR, rating settlements, or integrity decisions"
    );
    assert.deepEqual(
      await ArenaMatch.findById(source.matchId).select("integrityStatus integrityCaseId").lean(),
      sourceIntegrityBeforeMemberCompletion,
      "guest completion must not mutate the source match anti-cheating decision"
    );

    const [ownerAvailability, rivalAvailability] = await Promise.all([
      getGuestNicknameAvailability({
        rawToken: invitation.token,
        nickname: "guest-record-owner",
        birthDate: OWNER_BIRTH_DATE,
        cookieHeader: "",
        now,
      }),
      getGuestNicknameAvailability({
        rawToken: invitation.token,
        nickname: "guest-group-rival",
        birthDate: RIVAL_BIRTH_DATE,
        cookieHeader: "",
        now,
      }),
    ]);
    assert.equal(ownerAvailability.available, true);
    assert.equal(rivalAvailability.available, true);

    const [claimedOwner, claimedRival] = await Promise.all([
      claimGuestChallenge({
        rawToken: invitation.token,
        nickname: "guest-record-owner",
        birthDate: OWNER_BIRTH_DATE,
        cookieHeader: "",
        now,
      }),
      claimGuestChallenge({
        rawToken: invitation.token,
        nickname: "guest-group-rival",
        birthDate: RIVAL_BIRTH_DATE,
        cookieHeader: "",
        now: new Date(now.getTime() + 1000),
      }),
    ]);
    const ownerCookie = `${GUEST_COOKIE_NAME}=${encodeURIComponent(claimedOwner.cookieValue)}`;
    const rivalCookie = `${GUEST_COOKIE_NAME}=${encodeURIComponent(claimedRival.cookieValue)}`;
    assert.ok(claimedOwner.cookieValue);
    assert.ok(claimedRival.cookieValue);
    assert.notEqual(String(claimedOwner.identity._id), String(claimedRival.identity._id));
    assert.equal(await ArenaGuestIdentity.countDocuments({
      nicknameNormalized: { $in: ["guest-record-owner", "guest-group-rival"] },
    }), 2);
    const storedOwnerIdentity = await ArenaGuestIdentity.findById(claimedOwner.identity._id)
      .select("+birthDateHash")
      .lean();
    assert.match(storedOwnerIdentity.birthDateHash, /^[a-f0-9]{64}$/);
    assert.notEqual(storedOwnerIdentity.birthDateHash, OWNER_BIRTH_DATE);
    assert.equal(
      new Date(storedOwnerIdentity.firstChallengeAcceptedAt).getTime(),
      now.getTime(),
      "the first accepted challenge timestamp is captured once at initial admission"
    );

    const openChallenge = await ArenaGuestChallenge.findById(claimedOwner.challenge._id).lean();
    assert.equal(openChallenge.status, "OPEN", "joining must not consume a group invitation");
    assert.equal(
      await ArenaGuestChallengeAttempt.countDocuments({ challengeId: openChallenge._id }),
      2,
      "each admitted nickname receives an independent ready attempt"
    );
    assert.equal(String(claimedOwner.attempt.problemPackId), String(source.packId));
    assert.equal(String(claimedRival.attempt.problemPackId), String(source.packId));

    const ownAvailability = await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: ownerCookie,
      now,
    });
    assert.equal(ownAvailability.available, true, "the proven browser can reuse its nickname");
    const restorableAvailability = await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: "",
      now,
    });
    assert.equal(restorableAvailability.available, true);
    assert.equal(restorableAvailability.reentry, true);
    const restoredWithoutCookie = await claimGuestChallenge({
      rawToken: invitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: "",
      now,
    });
    assert.equal(restoredWithoutCookie.replayed, true);
    assert.equal(String(restoredWithoutCookie.attempt._id), String(claimedOwner.attempt._id));
    assert.ok(restoredWithoutCookie.cookieValue);
    const guestConflict = await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "guest-record-owner",
      birthDate: OTHER_BIRTH_DATE,
      cookieHeader: "",
      now,
    });
    assert.equal(guestConflict.available, false);
    assert.equal(guestConflict.message, "이미 사용 중인 닉네임이거나 생년월일이 일치하지 않습니다.");
    await assert.rejects(
      claimGuestChallenge({
        rawToken: invitation.token,
        nickname: "guest-record-owner",
        birthDate: OTHER_BIRTH_DATE,
        cookieHeader: "",
        now,
      }),
      (error) => error.code === "ARENA_GUEST_BIRTH_DATE_MISMATCH"
    );

    const [ownerAttempt, rivalAttempt] = await Promise.all([
      startGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: ownerCookie,
        now,
      }),
      startGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: rivalCookie,
        now: new Date(now.getTime() + 1000),
      }),
    ]);
    assert.equal(ownerAttempt.attemptNumber, 1);
    assert.equal(rivalAttempt.attemptNumber, 1);
    assert.notEqual(String(ownerAttempt._id), String(rivalAttempt._id));
    assert.equal(
      new Date(ownerAttempt.deadlineAt).getTime() - now.getTime(),
      10 * 60 * 1000,
      "each guest gets ten minutes for the current question"
    );
    assert.equal(
      new Date(rivalAttempt.deadlineAt).getTime() - (now.getTime() + 1000),
      10 * 60 * 1000
    );

    const [ownerBeforeSettlement, rivalBeforeSettlement] = await Promise.all([
      getGuestChallengePageData({
        rawToken: invitation.token,
        cookieHeader: ownerCookie,
        now,
      }),
      getGuestChallengePageData({
        rawToken: invitation.token,
        cookieHeader: rivalCookie,
        now,
      }),
    ]);
    assert.equal(ownerBeforeSettlement.senderScoreHidden, true);
    assert.equal(rivalBeforeSettlement.senderScoreHidden, true);
    assert.equal(ownerBeforeSettlement.leaderboard.visible, false);
    assert.equal(rivalBeforeSettlement.leaderboard.visible, false);
    assert.equal(ownerBeforeSettlement.currentQuestion.prompt, source.questions[0].prompt);
    assert.equal(rivalBeforeSettlement.currentQuestion.prompt, source.questions[0].prompt);

    const challenge = await ArenaGuestChallenge.findById(claimedOwner.challenge._id).lean();
    await settleAttemptDirect({
      attemptId: rivalAttempt._id,
      challenge,
      questions: source.questions,
      correctCount: 4,
      totalSolveTimeMs: 420000,
      evidenceName: "rival-solution",
      evidenceCharacter: "b",
      settledAt: new Date(now.getTime() + 421000),
    });

    const ownerWhileRivalFinished = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      now: new Date(now.getTime() + 421000),
    });
    assert.equal(ownerWhileRivalFinished.leaderboard.visible, false,
      "a still-solving guest must not receive another participant's result");
    await assert.rejects(
      getGuestEvidenceFile({
        rawToken: invitation.token,
        cookieHeader: ownerCookie,
        side: "creator",
        fileIndex: 1,
      }),
      (error) => error.code === "ARENA_GUEST_EVIDENCE_FORBIDDEN",
      "an unfinished participant must not receive leaderboard evidence"
    );
    await assert.rejects(
      getGuestEvidenceFile({
        rawToken: invitation.token,
        cookieHeader: "",
        side: "creator",
        fileIndex: 1,
      }),
      (error) => error.code === "ARENA_GUEST_EVIDENCE_FORBIDDEN",
      "an unclaimed link visitor must not receive leaderboard evidence"
    );
    const rivalAfterSettlement = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: rivalCookie,
      now: new Date(now.getTime() + 421000),
    });
    assert.equal(rivalAfterSettlement.leaderboard.visible, true);
    assert.equal(rivalAfterSettlement.leaderboard.joinedGuestCount, 2);
    assert.equal(rivalAfterSettlement.leaderboard.completedGuestCount, 1);
    assert.equal(rivalAfterSettlement.leaderboard.waitingGuestCount, 1);

    await settleAttemptDirect({
      attemptId: ownerAttempt._id,
      challenge,
      questions: source.questions,
      correctCount: 4,
      totalSolveTimeMs: 480000,
      evidenceName: "owner-solution-first",
      evidenceCharacter: "c",
      settledAt: new Date(now.getTime() + 480000),
    });
    const ranked = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      now: new Date(now.getTime() + 480000),
    });
    assert.equal(ranked.senderScoreHidden, false);
    assert.equal(ranked.result, null);
    assert.equal(ranked.leaderboard.resultsReleased, true);
    assert.equal(ranked.leaderboard.provisional, false);
    assert.equal(ranked.leaderboard.rows.length, 3);
    assert.deepEqual(
      ranked.leaderboard.rows.map((row) => [row.label, row.rank, row.totalCorrect, row.completionTimeMs]),
      [
        ["guest-group-rival", 1, 4, 420000],
        ["guest-record-owner", 2, 4, 480000],
        ["guest-link-creator", 3, 3, 500000],
      ],
      "the released ranking uses correct count first and solve time second"
    );
    assert.equal(
      ranked.leaderboard.rows.some((row) => row.kind === "CREATOR"),
      true,
      "the sender row is released when all currently admitted participants finish"
    );
    assert.ok(ranked.leaderboard.rows.every((row) => row.questions.length === 5));
    assert.ok(ranked.leaderboard.rows.every((row) => row.solutions.length === 1));
    assert.equal(
      ranked.leaderboard.rows.find((row) => row.label === "guest-group-rival")
        .solutions[0].href.includes(String(rivalAttempt._id)),
      true,
      "participant evidence URLs must identify the ranked attempt"
    );
    const completedRestore = await claimGuestChallenge({
      rawToken: invitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: "",
      now: new Date(now.getTime() + 481000),
    });
    assert.equal(completedRestore.replayed, true);
    assert.equal(String(completedRestore.attempt._id), String(ownerAttempt._id));
    const completedRestoreCookie =
      `${GUEST_COOKIE_NAME}=${encodeURIComponent(completedRestore.cookieValue)}`;
    const completedRestorePage = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: completedRestoreCookie,
      now: new Date(now.getTime() + 482000),
    });
    assert.equal(completedRestorePage.isGuest, true);
    assert.equal(completedRestorePage.attempt.status, "SETTLED");
    assert.equal(completedRestorePage.leaderboard.visible, true,
      "the same nickname and birth date reopen the completed leaderboard without a retry");
    const alternateParticipantEntry = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      forceParticipantEntry: true,
      now: new Date(now.getTime() + 483000),
    });
    assert.equal(alternateParticipantEntry.participantEntry, true);
    assert.equal(alternateParticipantEntry.isGuest, false);
    assert.equal(alternateParticipantEntry.attempt, null);
    assert.equal(alternateParticipantEntry.canClaim, true,
      "a completed browser can deliberately enter a different nickname and birth date");
    assert.equal(
      ranked.leaderboard.rows.find((row) => row.kind === "CREATOR").solutions.length,
      1,
      "released sender evidence appears in the participant detail"
    );

    const replayedSettledAttempt = await startGuestAttempt({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      now: new Date(now.getTime() + 500000),
    });
    assert.equal(String(replayedSettledAttempt._id), String(ownerAttempt._id));
    assert.equal(replayedSettledAttempt.status, "SETTLED");
    assert.equal(
      await ArenaGuestChallengeAttempt.countDocuments({
        challengeId: invitation.id,
        guestIdentityId: claimedOwner.identity._id,
      }),
      1,
      "the same nickname and birth date receive exactly one attempt per challenge"
    );
    const oneAttemptLeaderboard = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      now: new Date(now.getTime() + 600000),
    });
    const oneAttemptGuests = oneAttemptLeaderboard.leaderboard.rows.filter(
      (row) => row.kind === "GUEST"
    );
    assert.deepEqual(oneAttemptGuests.map((row) => row.rank), [1, 2]);
    assert.equal(
      oneAttemptLeaderboard.leaderboard.rows.some((row) => row.kind === "CREATOR"),
      true,
      "sender performance remains released after later participants join"
    );
    assert.equal(oneAttemptLeaderboard.leaderboard.provisional, false);
    assert.ok(
      oneAttemptLeaderboard.reverseChallengeRequestPath.endsWith("/reverse-challenge"),
      "a completed guest can propose a reverse challenge from the released leaderboard"
    );
    assert.equal(
      oneAttemptLeaderboard.reverseCreatePath,
      "",
      "an unregistered guest must still complete account registration before creating a reverse challenge"
    );
    assert.equal(
      oneAttemptLeaderboard.leaderboard.rows.find((row) => row.label === "guest-record-owner").attemptId,
      String(ownerAttempt._id),
      "the leaderboard keeps the identity's only settled row"
    );
    assert.equal(oneAttemptLeaderboard.leaderboard.settledAttemptCount, 2);
    assert.equal(oneAttemptLeaderboard.leaderboard.completedGuestCount, 2);

    const creatorView = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: "",
      viewerUserId: creatorUserId,
      now: new Date(now.getTime() + 1030000),
    });
    assert.equal(creatorView.leaderboard.visible, true);
    assert.equal(creatorView.leaderboard.rows.length, 3);
    const outsiderView = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: "",
      now: new Date(now.getTime() + 1030000),
    });
    assert.equal(outsiderView.leaderboard.visible, false);
    assert.deepEqual(outsiderView.leaderboard.rows, []);

    const secondInvitation = await createGuestChallenge({
      creatorUserId,
      sourceMatchId: source.matchId,
      now: new Date(now.getTime() + 1040000),
    });
    await assert.rejects(
      claimGuestChallenge({
        rawToken: secondInvitation.token,
        nickname: "guest-record-owner",
        birthDate: OTHER_BIRTH_DATE,
        cookieHeader: ownerCookie,
        now: new Date(now.getTime() + 1040000),
      }),
      (error) => error.code === "ARENA_GUEST_BIRTH_DATE_MISMATCH",
      "an existing guest identity cannot be reused with a different birth date"
    );
    const sameGuest = await claimGuestChallenge({
      rawToken: secondInvitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: ownerCookie,
      now: new Date(now.getTime() + 1040000),
    });
    assert.equal(String(sameGuest.identity._id), String(claimedOwner.identity._id));
    assert.equal(String(sameGuest.attempt.problemPackId), String(source.packId));

    const raceInvitation = await createGuestChallenge({
      creatorUserId,
      sourceMatchId: source.matchId,
      now: new Date(now.getTime() + 1050000),
    });
    const raceClaims = await Promise.allSettled([
      claimGuestChallenge({
        rawToken: raceInvitation.token,
        nickname: "same-race-nickname",
        birthDate: OTHER_BIRTH_DATE,
        cookieHeader: "",
        now: new Date(now.getTime() + 1050000),
      }),
      claimGuestChallenge({
        rawToken: raceInvitation.token,
        nickname: "same-race-nickname",
        birthDate: OTHER_BIRTH_DATE,
        cookieHeader: "",
        now: new Date(now.getTime() + 1050000),
      }),
    ]);
    const fulfilledRaceClaims = raceClaims.filter((entry) => entry.status === "fulfilled");
    const rejectedRaceClaims = raceClaims.filter((entry) => entry.status === "rejected");
    assert.ok(fulfilledRaceClaims.length >= 1);
    assert.ok(rejectedRaceClaims.every((entry) => entry.reason.code === "ARENA_GUEST_NICKNAME_TAKEN"));
    assert.equal(
      new Set(fulfilledRaceClaims.map((entry) => String(entry.value.identity._id))).size,
      1,
      "concurrent claims converge on one guest identity"
    );
    assert.equal(
      await ArenaGuestIdentity.countDocuments({ nicknameNormalized: "same-race-nickname" }),
      1
    );
    const raceIdentity = await ArenaGuestIdentity.findOne({ nicknameNormalized: "same-race-nickname" }).lean();
    assert.equal(await ArenaGuestChallengeAttempt.countDocuments({
      challengeId: raceInvitation.id,
      guestIdentityId: raceIdentity._id,
    }), 1);

    const justBeforeExpiry = new Date(now.getTime() + THREE_DAYS_MS - 1);
    const admittedAtLastMillisecond = await claimGuestChallenge({
      rawToken: invitation.token,
      nickname: "last-moment-guest",
      birthDate: OTHER_BIRTH_DATE,
      cookieHeader: "",
      now: justBeforeExpiry,
    });
    assert.ok(admittedAtLastMillisecond.cookieValue, "new admission remains open until the 3-day boundary");
    const lastMomentCookie = `${GUEST_COOKIE_NAME}=${encodeURIComponent(admittedAtLastMillisecond.cookieValue)}`;
    const lastMomentAttempt = await startGuestAttempt({
      rawToken: invitation.token,
      cookieHeader: lastMomentCookie,
      now: justBeforeExpiry,
    });
    assert.equal(lastMomentAttempt.status, "IN_PROGRESS");
    const expiredAt = new Date(now.getTime() + THREE_DAYS_MS);
    const expiredAvailability = await getGuestNicknameAvailability({
      rawToken: invitation.token,
      nickname: "new-after-expiry",
      birthDate: OTHER_BIRTH_DATE,
      cookieHeader: "",
      now: expiredAt,
    });
    assert.equal(expiredAvailability.available, false);
    assert.equal(expiredAvailability.message, "도전장 참여 시간이 종료되었습니다.");
    await assert.rejects(
      claimGuestChallenge({
        rawToken: invitation.token,
        nickname: "new-after-expiry",
        birthDate: OTHER_BIRTH_DATE,
        cookieHeader: "",
        now: expiredAt,
      }),
      (error) => error.code === "ARENA_GUEST_LINK_EXPIRED"
    );
    const replayAfterExpiry = await claimGuestChallenge({
      rawToken: invitation.token,
      nickname: "guest-group-rival",
      birthDate: RIVAL_BIRTH_DATE,
      cookieHeader: rivalCookie,
      now: expiredAt,
    });
    assert.equal(replayAfterExpiry.replayed, true);
    await assert.rejects(
      startGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: ownerCookie,
        now: expiredAt,
      }),
      (error) => error.code === "ARENA_GUEST_LINK_EXPIRED",
      "an already-settled participant cannot restart after the 3-day boundary"
    );

    const lockedAt = new Date(expiredAt.getTime() + 10 * 1000);
    const lockResult = await lockGuestQuestionCompletion({
      rawToken: invitation.token,
      cookieHeader: lastMomentCookie,
      answer: source.questions[0].answer,
      questionSlot: 1,
      now: lockedAt,
    });
    assert.equal(lockResult.locked, true);
    assert.equal(new Date(lockResult.completedAt).getTime(), lockedAt.getTime());
    const concurrentFirstAdvance = await Promise.all([
      advanceGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: lastMomentCookie,
        answer: "999",
        now: new Date(expiredAt.getTime() + 20 * 1000),
      }),
      advanceGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: lastMomentCookie,
        answer: "999",
        now: new Date(expiredAt.getTime() + 20 * 1000),
      }),
    ]);
    assert.deepEqual(
      concurrentFirstAdvance.map((result) => result.currentQuestionIndex),
      [1, 1],
      "concurrent advance requests return the same idempotent next-question state"
    );
    const afterLockedAdvance = await ArenaGuestChallengeAttempt.findById(lastMomentAttempt._id).lean();
    assert.equal(
      new Date(afterLockedAdvance.questionTimings[0].completedAt).getTime(),
      lockedAt.getTime(),
      "advancing after an image-upload completion lock preserves the locked completion time"
    );
    assert.equal(
      afterLockedAdvance.answers[0].value,
      source.questions[0].answer,
      "advancing cannot replace the answer captured before solution-image upload"
    );
    assert.equal(
      afterLockedAdvance.questionTimings.filter(
        (timing) => timing.questionKey === source.questions[1].questionKey
      ).length,
      1,
      "concurrent advance requests create exactly one timing row for the next question"
    );
    for (let index = 1; index < 4; index += 1) {
      await advanceGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: lastMomentCookie,
        answer: source.questions[index].answer,
        now: new Date(expiredAt.getTime() + (index + 2) * 10 * 1000),
      });
    }
    const concurrentFinalAdvance = await Promise.all([
      advanceGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: lastMomentCookie,
        answer: source.questions[4].answer,
        now: new Date(expiredAt.getTime() + 60 * 1000),
      }),
      advanceGuestAttempt({
        rawToken: invitation.token,
        cookieHeader: lastMomentCookie,
        answer: source.questions[4].answer,
        now: new Date(expiredAt.getTime() + 60 * 1000),
      }),
    ]);
    assert.deepEqual(
      concurrentFinalAdvance.map((result) => [result.finalQuestion, result.currentQuestionIndex]),
      [[true, 5], [true, 5]],
      "concurrent final advances converge on the same evidence-required state"
    );
    const graceCompleted = await ArenaGuestChallengeAttempt.findById(lastMomentAttempt._id).lean();
    assert.equal(graceCompleted.status, "EVIDENCE_REQUIRED");
    assert.equal(graceCompleted.currentQuestionIndex, 5);
    assert.equal(graceCompleted.questionTimings.length, 5);
    assert.equal(
      graceCompleted.activeSolveTimeMs,
      graceCompleted.questionTimings.reduce(
        (sum, timing) => sum + Number(timing.responseTimeMs || 0),
        0
      ),
      "concurrent advances do not double-count active solve time"
    );
    await settleAttemptDirect({
      attemptId: lastMomentAttempt._id,
      challenge,
      questions: source.questions,
      correctCount: 5,
      totalSolveTimeMs: Number(graceCompleted.activeSolveTimeMs),
      evidenceName: "last-moment-solution",
      evidenceCharacter: "9",
      settledAt: new Date(expiredAt.getTime() + 70 * 1000),
    });
    const graceStillPrivate = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      now: new Date(expiredAt.getTime() + 70 * 1000),
    });
    assert.equal(graceStillPrivate.leaderboard.resultsReleased, true);
    assert.equal(graceStillPrivate.leaderboard.provisional, false);
    assert.equal(graceStillPrivate.senderScoreHidden, false);
    assert.equal(
      graceStillPrivate.leaderboard.rows.some((row) => row.kind === "CREATOR"),
      true,
      "a released sender result is not hidden again when another participant joins"
    );
    const finalReleased = await getGuestChallengePageData({
      rawToken: invitation.token,
      cookieHeader: ownerCookie,
      now: new Date(
        expiredAt.getTime() +
        GOAT_ARENA_V2_CONFIG.guestChallenge.completionGraceMs +
        1
      ),
    });
    assert.equal(finalReleased.leaderboard.resultsReleased, true);
    assert.equal(finalReleased.leaderboard.provisional, false);
    assert.equal(finalReleased.senderScoreHidden, false);
    assert.equal(
      finalReleased.leaderboard.rows.some((row) => row.kind === "CREATOR"),
      true,
      "the final leaderboard continues to include the sender"
    );
    const releasedCreator = finalReleased.leaderboard.rows.find(
      (row) => row.kind === "CREATOR"
    );
    assert.equal(releasedCreator.questions[0].submittedAnswer, "1");
    assert.equal(releasedCreator.questions[3].submittedAnswer, "999");
    assert.equal(
      JSON.stringify(releasedCreator.questions).includes("answerKey"),
      false,
      "result details expose submitted answers without publishing answer keys"
    );
    assert.equal((await ArenaGuestChallenge.findById(challenge._id).lean()).status, "EXPIRED");

    const withoutProof = await guestNicknameClaimStatus({
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: "",
    });
    assert.equal(withoutProof.guestConflict, true);
    const withProof = await guestNicknameClaimStatus({
      nickname: "guest-record-owner",
      cookieHeader: ownerCookie,
      birthDate: OWNER_BIRTH_DATE,
    });
    assert.equal(withProof.guestConflict, false);
    assert.equal(withProof.birthDateMatches, true);

    const registrationPreview = await getGuestRegistrationClaimPreview({
      cookieHeader: ownerCookie,
      expectedIdentityId: claimedOwner.identity._id,
      expectedAttemptId: ownerAttempt._id,
    });
    assert.equal(registrationPreview.guestIdentityId, String(claimedOwner.identity._id));
    assert.equal(registrationPreview.sourceAttemptId, String(ownerAttempt._id));
    assert.equal(registrationPreview.nickname, "guest-record-owner");
    assert.equal(
      new Date(registrationPreview.acceptedAt).getTime(),
      now.getTime(),
      "registration confirmation uses the first challenge acceptance date"
    );
    assert.equal(await getGuestRegistrationClaimPreview({
      cookieHeader: rivalCookie,
      expectedIdentityId: claimedOwner.identity._id,
      expectedAttemptId: ownerAttempt._id,
    }), null, "another guest cookie cannot preview this identity");
    assert.equal(await getGuestRegistrationClaimPreview({
      cookieHeader: ownerCookie,
      expectedIdentityId: claimedOwner.identity._id,
      expectedAttemptId: rivalAttempt._id,
    }), null, "a cookie cannot preview another participant's attempt");
    assert.equal(await getGuestRegistrationClaimPreview({
      cookieHeader: "",
      expectedIdentityId: claimedOwner.identity._id,
      expectedAttemptId: ownerAttempt._id,
    }), null, "an ownership cookie is mandatory for registration preview");

    await User.collection.insertOne({
      _id: accountUserId,
      name: "guest-record-owner",
      nameNormalized: "guest-record-owner",
      email: "claimed-guest@example.invalid",
      birthDate: new Date(`${OWNER_BIRTH_DATE}T00:00:00.000Z`),
      accountStatus: "active",
      isActive: true,
    });
    await ArenaCompetitiveProfile.create({
      userId: accountUserId,
      normalMatchesCompleted: 2,
      competitiveMatchesCompleted: 5,
      wins: 3,
      losses: 1,
      draws: 1,
      accountXp: 8,
      accountLevel: 2,
      rating: 1725,
      ratingDeviation: 95,
      volatility: 0.06,
      tier: "T3",
    });
    await assert.rejects(
      claimGuestRecordsForUser({
        userId: accountUserId,
        nickname: "guest-record-owner",
        birthDate: OTHER_BIRTH_DATE,
        cookieHeader: ownerCookie,
        now: new Date(expiredAt.getTime() + 60 * 1000),
      }),
      (error) => error.code === "ARENA_GUEST_BIRTH_DATE_MISMATCH",
      "the signup claim rejects a birth date different from the challenge entry digest"
    );
    const linked = await claimGuestRecordsForUser({
      userId: accountUserId,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: ownerCookie,
      now: new Date(expiredAt.getTime() + 60 * 1000),
    });
    assert.equal(linked.claimed, true);
    assert.equal(linked.attemptCount, 2, "the identity's one attempt in each joined challenge is linked");
    const rotatedGuestProof = await guestNicknameClaimStatus({
      nickname: "guest-record-owner",
      cookieHeader: ownerCookie,
      birthDate: OWNER_BIRTH_DATE,
    });
    assert.equal(
      rotatedGuestProof.guestConflict,
      true,
      "a pre-claim proof cannot reopen account-linked records anonymously"
    );
    await assert.rejects(
      require("../services/arenaGuestChallengeService").getGuestSolutionBoards({ rawToken: secondInvitation.token, cookieHeader: ownerCookie }),
      (error) => error.status === 403,
      "a second browser retaining the old proof cannot read claimed boards"
    );
    const accountRecoveredView = await getGuestChallengePageData({
      rawToken: secondInvitation.token,
      cookieHeader: "",
      viewerUserId: accountUserId,
      now: new Date(expiredAt.getTime() + 60 * 1000),
    });
    assert.equal(accountRecoveredView.isGuest, true);
    assert.equal(accountRecoveredView.guestNickname, "guest-record-owner");
    const resumedThroughAccount = await startGuestAttempt({
      rawToken: secondInvitation.token,
      cookieHeader: "",
      viewerUserId: accountUserId,
      now: new Date(expiredAt.getTime() + 61 * 1000),
    });
    assert.equal(
      resumedThroughAccount.status,
      "IN_PROGRESS",
      "the linked account can resume an open guest challenge without the retired capability cookie"
    );
    const postSignupInvitation = await createGuestChallenge({
      creatorUserId,
      sourceMatchId: source.matchId,
      now: new Date(expiredAt.getTime() + 62 * 1000),
    });
    const postSignupAvailability = await getGuestNicknameAvailability({
      rawToken: postSignupInvitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: "",
      viewerUserId: accountUserId,
      now: new Date(expiredAt.getTime() + 63 * 1000),
    });
    assert.equal(postSignupAvailability.available, true);
    const postSignupJoin = await claimGuestChallenge({
      rawToken: postSignupInvitation.token,
      nickname: "guest-record-owner",
      birthDate: OWNER_BIRTH_DATE,
      cookieHeader: "",
      viewerUserId: accountUserId,
      now: new Date(expiredAt.getTime() + 64 * 1000),
    });
    assert.equal(String(postSignupJoin.identity._id), String(claimedOwner.identity._id));
    assert.equal(postSignupJoin.cookieValue, null);
    await ArenaGuestChallengeAttempt.updateOne(
      { _id: ownerAttempt._id },
      { $set: { claimedByUserId: null } }
    );
    const records = await getClaimedGuestRecords({ userId: accountUserId });
    assert.equal(records.length, 1, "the completed one-attempt record is visible in the account archive");
    const repairedAttempt = await ArenaGuestChallengeAttempt.findById(ownerAttempt._id).lean();
    assert.equal(
      String(repairedAttempt.claimedByUserId),
      String(accountUserId),
      "account archive repairs an interrupted per-attempt guest-record link"
    );
    const archived = await getClaimedGuestRecordPageData({
      attemptId: ownerAttempt._id,
      userId: accountUserId,
    });
    assert.equal(archived.accountArchive, true);
    assert.equal(archived.result.guest.label, "guest-record-owner");
    assert.equal(archived.result.guest.solutions[0].href.includes(String(ownerAttempt._id)), true);
    await assert.rejects(
      getClaimedGuestRecordPageData({ attemptId: ownerAttempt._id, userId: strangerUserId }),
      (error) => error.code === "ARENA_GUEST_RECORD_NOT_FOUND"
    );

    const reverseCreatedAt = new Date(expiredAt.getTime() + 2 * 60 * 1000);
    await assert.rejects(
      createGuestChallengeFromClaimedAttempt({
        creatorUserId: strangerUserId,
        guestAttemptId: ownerAttempt._id,
        now: reverseCreatedAt,
      }),
      (error) => error.code === "ARENA_GUEST_RECORD_NOT_FOUND",
      "another account cannot turn a claimed guest attempt into a challenge"
    );
    const reverseInvitation = await createGuestChallengeFromClaimedAttempt({
      creatorUserId: accountUserId,
      guestAttemptId: ownerAttempt._id,
      now: reverseCreatedAt,
    });
    assert.equal(
      new Date(reverseInvitation.expiresAt).getTime() - reverseCreatedAt.getTime(),
      THREE_DAYS_MS,
      "a reverse challenge receives the same 3-day admission window"
    );
    const [reverseChallenge, sourceGuestAttempt] = await Promise.all([
      ArenaGuestChallenge.findById(reverseInvitation.id).lean(),
      ArenaGuestChallengeAttempt.findById(ownerAttempt._id).lean(),
    ]);
    assert.equal(reverseChallenge.sourceKind, "GUEST_ATTEMPT");
    assert.equal(String(reverseChallenge.sourceGuestAttemptId), String(ownerAttempt._id));
    assert.equal(reverseChallenge.sourceMatchId, null);
    assert.equal(reverseChallenge.sourceAttemptId, null);
    assert.equal(reverseChallenge.sourceEvidenceId, null);
    assert.equal(String(reverseChallenge.sourceProblemPackId), String(source.packId));
    assert.deepEqual(reverseChallenge.sourcePerformance, sourceGuestAttempt.performance);

    const reverseCreatorView = await getGuestChallengePageData({
      rawToken: reverseInvitation.token,
      cookieHeader: "",
      viewerUserId: accountUserId,
      now: reverseCreatedAt,
    });
    assert.equal(reverseCreatorView.leaderboard.visible, true);
    assert.equal(reverseCreatorView.leaderboard.rows.length, 1);
    assert.equal(reverseCreatorView.leaderboard.rows[0].totalCorrect, 4);
    assert.equal(reverseCreatorView.leaderboard.rows[0].completionTimeMs, 480000);
    assert.equal(reverseCreatorView.leaderboard.rows[0].questions.length, 5);
    assert.equal(
      reverseCreatorView.leaderboard.rows[0].solutions[0].displayName,
      "1번 풀이과정",
      "the reverse challenge exposes a generic evidence label without leaking the upload filename"
    );
    assert.equal(
      Object.hasOwn(reverseCreatorView.leaderboard.rows[0].solutions[0], "originalName"),
      false,
      "public leaderboard evidence metadata does not expose the original filename"
    );

    const chainedGuest = await claimGuestChallenge({
      rawToken: reverseInvitation.token,
      nickname: "reverse-chain-guest",
      birthDate: OTHER_BIRTH_DATE,
      cookieHeader: "",
      now: new Date(reverseCreatedAt.getTime() + 1000),
    });
    const chainedGuestCookie = `${GUEST_COOKIE_NAME}=${encodeURIComponent(chainedGuest.cookieValue)}`;
    const chainedGuestAttempt = await startGuestAttempt({
      rawToken: reverseInvitation.token,
      cookieHeader: chainedGuestCookie,
      now: new Date(reverseCreatedAt.getTime() + 2000),
    });
    const reverseSideEffectsBefore = await guestSideEffectSnapshot([accountUserId]);
    const finalizedChainedAttempt = await completeGuestAttemptWithBoards({
      rawToken: reverseInvitation.token,
      cookieHeader: chainedGuestCookie,
      attempt: chainedGuestAttempt,
      questions: source.questions,
      startedAt: new Date(reverseCreatedAt.getTime() + 2000),
      answerIntervalMs: 78000,
      evidencePrefix: "reverse-chain-board",
    });
    assert.equal(finalizedChainedAttempt.status, "SETTLED");
    assert.equal(finalizedChainedAttempt.performance.correctCount, 5);
    assert.equal(finalizedChainedAttempt.performance.totalSolveTimeMs, 390000);
    assert.deepEqual(
      await guestSideEffectSnapshot([accountUserId]),
      reverseSideEffectsBefore,
      "finishing a reverse guest challenge must not change its account creator's XP, normal unlock progress, competitive MMR, rating settlements, or integrity decisions"
    );
    const chainedPerformance = finalizedChainedAttempt.performance;
    await User.collection.insertOne({
      _id: chainedAccountUserId,
      name: "reverse-chain-guest",
      nameNormalized: "reverse-chain-guest",
      email: "reverse-chain-guest@example.invalid",
      birthDate: new Date(`${OTHER_BIRTH_DATE}T00:00:00.000Z`),
      accountStatus: "active",
      isActive: true,
    });
    const chainedLink = await claimGuestRecordsForUser({
      userId: chainedAccountUserId,
      nickname: "reverse-chain-guest",
      birthDate: OTHER_BIRTH_DATE,
      cookieHeader: chainedGuestCookie,
      now: new Date(reverseCreatedAt.getTime() + 393000),
    });
    assert.equal(chainedLink.claimed, true);
    assert.equal(chainedLink.attemptCount, 1);
    assert.equal(
      await ArenaCompetitiveProfile.findOne({ userId: chainedAccountUserId }).lean(),
      null,
      "linking completed guest records to a new account must not grant XP, unlock progress, or competitive MMR"
    );

    const chainedReverseCreatedAt = new Date(reverseCreatedAt.getTime() + 394000);
    const chainedReverseInvitation = await createGuestChallengeFromClaimedAttempt({
      creatorUserId: chainedAccountUserId,
      guestAttemptId: chainedGuestAttempt._id,
      now: chainedReverseCreatedAt,
    });
    const chainedReverseChallenge = await ArenaGuestChallenge.findById(chainedReverseInvitation.id).lean();
    assert.equal(chainedReverseChallenge.sourceKind, "GUEST_ATTEMPT");
    assert.equal(String(chainedReverseChallenge.sourceGuestAttemptId), String(chainedGuestAttempt._id));
    assert.equal(String(chainedReverseChallenge.sourceProblemPackId), String(source.packId));
    assert.deepEqual(chainedReverseChallenge.sourcePerformance, chainedPerformance);
    assert.equal(
      new Date(chainedReverseInvitation.expiresAt).getTime() - chainedReverseCreatedAt.getTime(),
      THREE_DAYS_MS
    );
    const chainedCreatorView = await getGuestChallengePageData({
      rawToken: chainedReverseInvitation.token,
      cookieHeader: "",
      viewerUserId: chainedAccountUserId,
      now: chainedReverseCreatedAt,
    });
    assert.equal(chainedCreatorView.leaderboard.rows.length, 1);
    assert.equal(chainedCreatorView.leaderboard.rows[0].totalCorrect, 5);
    assert.equal(chainedCreatorView.leaderboard.rows[0].completionTimeMs, 390000);
    assert.equal(
      chainedCreatorView.leaderboard.rows[0].solutions[0].displayName,
      "1번 풀이과정",
      "a second-generation reverse challenge resolves its evidence without exposing the upload filename"
    );

    console.log(
      "Arena guest challenge DB verification passed: 3-day multi-guest admission, nickname-and-birth-date ownership with raw date omitted, one attempt per identity pair, cookie-free completed-result restoration, atomic idempotent starts, sender release when current participants finish, persistent release for later participants, 75-minute in-flight completion grace, locked question timing, cookie-and-birth-date signup linking, direct member reverse challenges, account archive recovery, chained reverse challenges, and zero guest/reverse-challenge side effects on XP, unlock progress, competitive MMR, rating settlement, or integrity decisions."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
