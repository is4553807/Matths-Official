const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");

const { User } = require("../models/matthsModel");
const {
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaInlineSolutionBoard,
  ArenaOutboxEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const { initialAnswersForPack } = require("../services/arenaMatchAttemptService");
const { computeArenaProblemPackHash } = require("../services/arenaProblemPackService");
const {
  ARENA_LEGACY_CONTENT_VERSION,
  ARENA_QUESTION_DESIGN_POLICY_VERSION,
  TIER_SPECS,
  packCurveForPair,
  resolveArenaDifficultyTier,
} = require("../services/arenaOneOnOneDifficultyPolicy");
const {
  createGoatArenaProductionCommandService,
} = require("../services/goatArenaProductionCommandService");

function question(index, checkedAt) {
  return {
    questionKey: `IPAD-Q${index}`,
    typeId: `IPAD-E2E-TYPE-${index}`,
    category: "semi-killer",
    courseId: "algebra",
    referenceFamily: "IPAD-E2E",
    skillTags: ["ipad-e2e"],
    difficultyScore: 0.7,
    sourcePositionBand: "Q27_28",
    slotRole: "REGULAR",
    expectedTimeMs: 90000,
    prompt: `${index} + 1의 값을 구하세요.`,
    inputMode: "short-answer",
    choices: [],
    answer: String(index + 1),
    solution: `${index} + 1 = ${index + 1}`,
    points: 20,
    validation: {
      passed: true,
      solvable: true,
      uniqueAnswer: true,
      calculatorFree: true,
      answerMatches: true,
      checkedAt,
    },
  };
}

function commandInput(matchId, idempotencyKey, extra = {}) {
  return {
    matchId: String(matchId),
    idempotencyKey,
    clientBuildVersion: "1.0(2)",
    ...extra,
  };
}

async function run() {
  if (!process.env.DB) throw new Error("DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  const now = new Date("2026-08-24T10:00:00.000+09:00");
  const suffix = randomUUID().replace(/-/g, "").toUpperCase();
  const challengerUserId = new mongoose.Types.ObjectId();
  const defenderUserId = new mongoose.Types.ObjectId();
  const outsiderUserId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const problemPackId = new mongoose.Types.ObjectId();
  const userIds = [challengerUserId, defenderUserId, outsiderUserId];

  try {
    await User.create([
      {
        _id: challengerUserId,
        name: `iPad 공격자 ${suffix.slice(0, 6)}`,
        email: `ipad-challenger-${suffix.toLowerCase()}@example.invalid`,
        passwordHash: "not-a-loginable-password-hash",
      },
      {
        _id: defenderUserId,
        name: `iPad 방어자 ${suffix.slice(0, 6)}`,
        email: `ipad-defender-${suffix.toLowerCase()}@example.invalid`,
        passwordHash: "not-a-loginable-password-hash",
      },
      {
        _id: outsiderUserId,
        name: `iPad 외부인 ${suffix.slice(0, 6)}`,
        email: `ipad-outsider-${suffix.toLowerCase()}@example.invalid`,
        passwordHash: "not-a-loginable-password-hash",
      },
    ]);

    const difficultyTier = resolveArenaDifficultyTier("SILVER", "GOLD");
    const difficultySpec = TIER_SPECS[difficultyTier];
    const questions = Array.from({ length: 5 }, (_, index) =>
      question(index + 1, now)
    );
    const draftPack = {
        version: `IPAD.E2E.${suffix}`,
        displayName: "iPad Arena 명령 격리 DB 검증팩",
        status: "DRAFT",
        division: "SUB",
        matchType: "NORMAL",
        tierPairKey: "SILVER_GOLD",
        tierPairLabel: "실버-골드",
        generationMode: "AUTO_ON_CHALLENGE",
        generatedForMatchKey: `IPAD:E2E:${suffix}`,
        designPolicyVersion: ARENA_QUESTION_DESIGN_POLICY_VERSION,
        contentSourceVersion: ARENA_LEGACY_CONTENT_VERSION,
        designCompliance: "PENDING_FINAL_GENERATORS",
        difficultyAnchor: "DEFENDER",
        difficultyTier,
        targetDefenderAccuracyMin: difficultySpec.defenderAccuracy[0],
        targetDefenderAccuracyMax: difficultySpec.defenderAccuracy[1],
        targetChallengerAccuracyMin: difficultySpec.challengerAccuracy[0],
        targetChallengerAccuracyMax: difficultySpec.challengerAccuracy[1],
        packCurve: packCurveForPair("SILVER", "GOLD"),
        curriculumVersion: "IPAD-E2E-V1",
        curriculumCoverage: ["algebra"],
        questionCount: 5,
        totalPoints: 100,
        timeLimitMs: 10 * 60 * 1000,
        scoringVersion: "SUB-STANDARD-V1",
        variantMode: "SAME",
        questions,
        availableFrom: now,
        availableUntil: null,
      };
    await ArenaProblemPack.create({ ...draftPack, _id: problemPackId });
    const hydratedDraft = await ArenaProblemPack.findById(problemPackId)
      .select("+questions +contentHash");
    const contentHash = computeArenaProblemPackHash(hydratedDraft);
    await ArenaProblemPack.collection.updateOne(
      { _id: problemPackId },
      {
        $set: {
          status: "SEALED",
          contentHash,
          sealedAt: now,
          autoValidatedAt: now,
        },
      }
    );
    const sealedPack = await ArenaProblemPack.findById(problemPackId)
      .select("+questions +contentHash")
      .lean();
    await ArenaMatch.create({
      _id: matchId,
      matchKey: `IPAD:E2E:${suffix}`,
      division: "SUB",
      seasonKey: `IPAD-E2E-${suffix}`,
      matchType: "NORMAL",
      matchOrigin: "SUB_UPWARD_AUTO_MATCH",
      requestInitiatorUserId: challengerUserId,
      targetTier: "GOLD",
      tierPairKey: "SILVER_GOLD",
      tierPairLabel: "실버-골드",
      challenger: {
        userId: challengerUserId,
        standingId: new mongoose.Types.ObjectId(),
        accessCycleId: new mongoose.Types.ObjectId(),
        tupleBefore: { arenaRank: "실버", arenaPosition: 7, arenaGp: 40 },
        stakeDays: 1,
      },
      defender: {
        userId: defenderUserId,
        standingId: new mongoose.Types.ObjectId(),
        accessCycleId: new mongoose.Types.ObjectId(),
        tupleBefore: { arenaRank: "골드", arenaPosition: 2, arenaGp: 90 },
        stakeDays: 0,
      },
      status: "READY",
      policyVersionCode: "IPAD-E2E-POLICY",
      problemPackId,
      problemPackVersion: sealedPack.version,
      scoringVersion: sealedPack.scoringVersion,
      timeLimitMs: sealedPack.timeLimitMs,
      requestedAt: now,
      startDeadlineAt: new Date(now.getTime() + 86400000),
      completionDeadlineAt: new Date(now.getTime() + 2 * 86400000),
      readyAt: now,
      integrityStatus: "CLEAR",
    });
    await ArenaMatchAttempt.create([
      {
        matchId,
        userId: challengerUserId,
        role: "CHALLENGER",
        problemPackId,
        problemPackVersion: sealedPack.version,
        status: "READY",
        answers: initialAnswersForPack({ questions }),
      },
      {
        matchId,
        userId: defenderUserId,
        role: "DEFENDER",
        problemPackId,
        problemPackVersion: sealedPack.version,
        status: "READY",
        answers: initialAnswersForPack({ questions }),
      },
    ]);

    const service = createGoatArenaProductionCommandService({ now: () => now });
    const auth = { userId: String(challengerUserId) };
    const startKey = `ipad-start-${suffix}`;
    const started = await service.startParticipantMatch(
      auth,
      commandInput(matchId, startKey)
    );
    assert.equal(started.attempt.status, "IN_PROGRESS");
    assert.equal(started.questionPack.questions.length, 1);
    assert.equal(started.questionPack.questions[0].slot, 1);
    assert.ok(!JSON.stringify(started).includes(questions[0].solution));

    const replayedStart = await service.startParticipantMatch(
      auth,
      commandInput(matchId, startKey)
    );
    assert.equal(replayedStart.attempt.attemptId, started.attempt.attemptId);
    assert.equal(
      await ArenaMatchAttemptEvent.countDocuments({
        attemptId: started.attempt.attemptId,
        eventType: "ATTEMPT_STARTED",
      }),
      1
    );

    const answerKey = `ipad-answer-${suffix}`;
    const answerInput = commandInput(matchId, answerKey, {
      eventType: "ANSWER_CHANGED",
      payload: { questionSlot: 1, answer: "2" },
    });
    const saved = await service.recordParticipantEvent(auth, answerInput);
    const replayedSave = await service.recordParticipantEvent(auth, answerInput);
    assert.equal(saved.answerStored, true);
    assert.equal(replayedSave.serverSequence, saved.serverSequence);
    assert.equal(
      await ArenaMatchAttemptEvent.countDocuments({
        attemptId: started.attempt.attemptId,
        idempotencyKey: `ARENA_SAVE:${answerKey}`,
      }),
      1
    );

    for (const [eventType, payload] of [
      ["HEARTBEAT", {}],
      ["QUESTION_FOCUS", { questionSlot: 1 }],
      ["NETWORK_STATE", { networkState: "OFFLINE" }],
    ]) {
      const key = `ipad-${eventType.toLowerCase()}-${suffix}`;
      const input = commandInput(matchId, key, { eventType, payload });
      await service.recordParticipantEvent(auth, input);
      await service.recordParticipantEvent(auth, input);
      assert.equal(
        await ArenaMatchAttemptEvent.countDocuments({
          attemptId: started.attempt.attemptId,
          idempotencyKey: `ARENA_ACTIVITY:${key}`,
        }),
        1
      );
    }
    assert.equal(
      (await ArenaMatchAttempt.findById(started.attempt.attemptId).lean()).focusState,
      "BLURRED"
    );

    await assert.rejects(
      service.startParticipantMatch(
        { userId: String(outsiderUserId) },
        commandInput(matchId, `ipad-outsider-${suffix}`)
      ),
      (error) => error.statusCode === 404 && error.code === "GOAT_ARENA_MATCH_NOT_FOUND"
    );

    for (let slot = 1; slot <= 5; slot += 1) {
      await ArenaInlineSolutionBoard.create({
        attemptId: started.attempt.attemptId,
        matchId,
        userId: challengerUserId,
        questionSlot: slot,
        revision: 1,
        strokeCount: slot === 1 ? 0 : slot,
        drawingData: Buffer.from(`audit-drawing-${slot}`),
        file: {
          originalName: `arena-question-${slot}.png`,
          storedName: `arena-question-${slot}.png`,
          mimeType: "image/png",
          sizeBytes: 32 * 1024,
          sha256: String(slot).padStart(64, "0"),
          storageProvider: "CLOUDINARY",
          storagePurpose: "USER_ARENA_EVIDENCE",
          cloudPublicId: `audit/arena-question-${slot}-${suffix}`,
          cloudResourceType: "image",
          cloudDeliveryType: "authenticated",
          cloudVersion: 1,
          cloudFormat: "png",
        },
      });
      const advanceKey = `ipad-advance-${slot}-${suffix}`;
      const input = commandInput(matchId, advanceKey, {
        questionSlot: slot,
        answer: String(slot + 1),
        boardRevision: 1,
        boardSha256: String(slot).padStart(64, "0"),
        evidenceMode: "INLINE_BOARD_V1",
      });
      const advanced = await service.advanceParticipantQuestion(auth, input);
      const replayedAdvance = await service.advanceParticipantQuestion(auth, input);
      assert.deepEqual(replayedAdvance, advanced);
      assert.equal(
        await ArenaMatchAttemptEvent.countDocuments({
          attemptId: started.attempt.attemptId,
          idempotencyKey:
            `ARENA_ADVANCE:${started.attempt.attemptId}:${advanceKey}`,
        }),
        1
      );
      if (slot < 5) {
        assert.equal(advanced.attempt.status, "IN_PROGRESS");
        assert.equal(advanced.questionPack.questions[0].slot, slot + 1);
      } else {
        assert.equal(advanced.attempt.status, "SUBMITTED");
        assert.equal(advanced.attempt.evidenceRequired, false);
        assert.equal(advanced.questionPack.questions.length, 0);
      }
    }

    const finalAttempt = await ArenaMatchAttempt.findById(
      started.attempt.attemptId
    ).lean();
    assert.equal(finalAttempt.currentQuestionIndex, 5);
    assert.equal(finalAttempt.answerRevision, 6);
    assert.deepEqual(
      finalAttempt.answers.map((answer) => answer.value),
      ["2", "3", "4", "5", "6"]
    );
    assert.equal(
      await ArenaMatchAttemptEvent.countDocuments({
        attemptId: started.attempt.attemptId,
        eventType: "QUESTION_ADVANCED",
      }),
      5
    );
    const promotedEvidence = await ArenaMatchEvidence.findOne({
      attemptId: finalAttempt._id,
    }).lean();
    assert.equal(promotedEvidence.originalEvidenceSubmitted, true);
    assert.equal(promotedEvidence.files.length, 5);
    assert.deepEqual(promotedEvidence.sourceRiskFlags, [
      "INSUFFICIENT_INLINE_EVIDENCE",
    ]);
    assert.deepEqual(promotedEvidence.anomalyFlags, [
      "INSUFFICIENT_INLINE_EVIDENCE",
    ]);
    assert.equal(promotedEvidence.files[0].questionSlot, 1);
    assert.equal(promotedEvidence.files[0].revision, 1);
    assert.equal(promotedEvidence.files[0].strokeCount, 0);
    assert.ok(promotedEvidence.files[0].firstSavedAt);
    assert.ok(promotedEvidence.files[0].lastSavedAt);
    assert.equal(
      await ArenaInlineSolutionBoard.countDocuments({
        attemptId: finalAttempt._id,
        finalizedAt: { $ne: null },
      }),
      5
    );

    console.log(
      "iPad Arena DB verified: ownership, one-question disclosure, answer/activity/" +
        "advance idempotency, five-slot progression, inline-board promotion, metadata, and blank-board risk."
    );
  } finally {
    await Promise.all([
      ArenaMatchAttemptEvent.deleteMany({ matchId }),
      ArenaInlineSolutionBoard.deleteMany({ matchId }),
      ArenaMatchEvidence.deleteMany({ matchId }),
      ArenaOutboxEvent.deleteMany({ aggregateId: { $in: [matchId] } }),
      ArenaMatchAttempt.deleteMany({ matchId }),
      ArenaMatch.deleteOne({ _id: matchId }),
      ArenaProblemPack.deleteOne({ _id: problemPackId }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
