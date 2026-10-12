"use strict";

process.env.CLOUDINARY_URL ||= "cloudinary://audit-key:audit-secret@audit-cloud";

const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const {
  ArenaCompetitiveRecord,
  ArenaInlineSolutionBoard,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  advanceArenaMatchQuestion,
  startArenaMatchAttempt,
} = require("../services/arenaMatchAttemptService");
const {
  submitArenaMatchEvidence,
} = require("../services/arenaMatchEvidenceService");
const {
  promoteInlineSolutionBoards,
} = require("../services/arenaInlineSolutionBoardService");
const {
  createArenaEvidenceSettlementService,
  finalizeArenaMatchAfterEvidence,
} = require("../services/arenaEvidenceSettlementService");
const {
  finalizeWebInlineSolutionBoards,
} = require("../services/arenaWebInlineSolutionService");
const {
  SCORING_VERSION,
} = require("../services/arenaCompetitiveScoringService");
const {
  joinArenaV2Queue,
} = require("../services/arenaV2MatchmakingService");
const goatArenaV2Controller = require("../controllers/goatArenaV2Controller");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceFile(prefix, index) {
  return {
    originalName: `${prefix}-${index}.png`,
    storedName: `${prefix}-${index}.png`,
    mimeType: "image/png",
    sizeBytes: 32 * 1024,
    sha256: hash(`${prefix}:${index}`),
    storageProvider: "CLOUDINARY",
    storagePurpose: "USER_ARENA_EVIDENCE",
    cloudPublicId: `audit/${prefix}-${index}`,
    cloudResourceType: "image",
    cloudDeliveryType: "authenticated",
    cloudFormat: "png",
  };
}

async function seedNormalBaseline(ownerUserId, now) {
  const sourceMatchId = new mongoose.Types.ObjectId();
  const sourceAttemptId = new mongoose.Types.ObjectId();
  const sourceEvidenceId = new mongoose.Types.ObjectId();
  const sourceProblemPackId = new mongoose.Types.ObjectId();
  const baselineQuestions = Array.from({ length: 5 }, (_, index) => ({
    questionKey: `Q${index + 1}`,
    prompt: `AUDIT BASELINE ${index + 1}`,
    answer: String(index + 1),
    points: 20,
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
    files: Array.from({ length: 5 }, (_, index) => ({
      ...evidenceFile(`baseline-${ownerUserId}`, index + 1),
      questionSlot: index + 1,
    })),
  });
  await ArenaCompetitiveRecord.create({
    recordMode: "NORMAL",
    ownerUserId,
    sourceMatchId,
    sourceAttemptId,
    sourceEvidenceId,
    sourceProblemPackId,
    ratingSnapshot: { rating: 1000, ratingDeviation: 350, volatility: 0.06, tier: "GOLD" },
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

async function completeQuestions({ match, userId, now, suffix }) {
  const pack = await ArenaProblemPack.findById(match.problemPackId)
    .select("+questions")
    .lean();
  await startArenaMatchAttempt({
    matchId: match._id,
    userId,
    requestId: `START-${suffix}`,
    now,
  });
  for (let index = 0; index < 5; index += 1) {
    await advanceArenaMatchQuestion({
      matchId: match._id,
      userId,
      requestId: `ADVANCE-${suffix}-${index}`,
      value: String(
        pack.questions[index].answerKey?.correctAnswer ??
          pack.questions[index].answer
      ),
      now: new Date(now.getTime() + (index + 1) * 70 * 1000),
    });
  }
  const attempt = await ArenaMatchAttempt.findOne({ matchId: match._id, userId });
  assert.equal(attempt.status, "EVIDENCE_REQUIRED");
  return { attempt, pack, evidenceAt: new Date(now.getTime() + 351 * 1000) };
}

async function invoke(handler, req) {
  let payload = null;
  let redirect = null;
  let error = null;
  const res = {
    set() { return res; },
    json(value) { payload = value; return res; },
    redirect(status, url) { redirect = { status, url }; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, redirect, error };
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const now = new Date("2026-10-10T10:00:00.000+09:00");
  const gridUserId = new mongoose.Types.ObjectId();
  const fileUserId = new mongoose.Types.ObjectId();
  const webGridUserId = new mongoose.Types.ObjectId();
  const outsiderUserId = new mongoose.Types.ObjectId();
  const baselineOwnerId = new mongoose.Types.ObjectId();
  try {
    await User.collection.insertMany([
      [gridUserId, "grid"],
      [fileUserId, "file"],
      [webGridUserId, "web-grid"],
      [outsiderUserId, "outsider"],
      [baselineOwnerId, "baseline-owner"],
    ].map(([id, label]) => ({
      _id: id,
      name: `async-${label}-${suffix}`,
      nameNormalized: `async-${label}-${suffix}`,
      email: `async-${label}-${suffix}@example.invalid`,
      accountStatus: "active",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })));
    await seedNormalBaseline(baselineOwnerId, now);

    // iPad inline grid: the evidence result remains below SUBMITTED because no
    // second live attempt exists; promotion must still dispatch normal-async settlement.
    const gridStart = await joinArenaV2Queue({ userId: gridUserId, mode: "NORMAL", now });
    const grid = await completeQuestions({
      match: gridStart.match,
      userId: gridUserId,
      now,
      suffix: `GRID-${suffix}`,
    });
    for (let index = 1; index <= 5; index += 1) {
      const file = evidenceFile(`grid-${suffix}`, index);
      await ArenaInlineSolutionBoard.create({
        attemptId: grid.attempt._id,
        matchId: gridStart.match._id,
        userId: gridUserId,
        questionSlot: index,
        revision: 1,
        strokeCount: 10 + index,
        drawingData: Buffer.from(`grid-drawing-${index}`),
        file,
      });
    }
    const gridFinalized = await promoteInlineSolutionBoards({
      matchId: gridStart.match._id,
      userId: gridUserId,
      now: grid.evidenceAt,
    });
    assert.equal(gridFinalized.evidence.matchStatus, "IN_PROGRESS");
    assert.equal(gridFinalized.settlement.settled, true);
    assert.equal((await ArenaMatch.findById(gridStart.match._id).lean()).status, "SETTLED");

    // iPad file upload: exercise the same post-evidence gateway directly and
    // prove the one-attempt normal match is finalized despite IN_PROGRESS.
    const fileNow = new Date(now.getTime() + 20 * 60 * 1000);
    const fileStart = await joinArenaV2Queue({ userId: fileUserId, mode: "NORMAL", now: fileNow });
    const file = await completeQuestions({
      match: fileStart.match,
      userId: fileUserId,
      now: fileNow,
      suffix: `FILE-${suffix}`,
    });
    const evidence = await submitArenaMatchEvidence({
      matchId: fileStart.match._id,
      userId: fileUserId,
      files: [],
      preparedEvidenceFiles: Array.from({ length: 5 }, (_, index) => ({
        ...evidenceFile(`file-${suffix}`, index + 1),
        questionSlot: index + 1,
      })),
      receivedAt: file.evidenceAt,
      now: file.evidenceAt,
    });
    assert.equal(evidence.matchStatus, "IN_PROGRESS");
    const fileSettlement = await finalizeArenaMatchAfterEvidence({
      matchId: fileStart.match._id,
      userId: fileUserId,
      evidenceResult: evidence,
      now: file.evidenceAt,
    });
    assert.equal(fileSettlement.settled, true);

    // The browser inline-board finalizer shares the same dispatcher, so it must
    // also finalize a one-attempt historical-record match without SUBMITTED.
    const webNow = new Date(now.getTime() + 40 * 60 * 1000);
    const webStart = await joinArenaV2Queue({ userId: webGridUserId, mode: "NORMAL", now: webNow });
    const web = await completeQuestions({
      match: webStart.match,
      userId: webGridUserId,
      now: webNow,
      suffix: `WEB-GRID-${suffix}`,
    });
    for (let index = 1; index <= 5; index += 1) {
      await ArenaInlineSolutionBoard.create({
        attemptId: web.attempt._id,
        matchId: webStart.match._id,
        userId: webGridUserId,
        questionSlot: index,
        revision: 1,
        strokeCount: 20 + index,
        drawingData: Buffer.from(`web-grid-drawing-${index}`),
        file: evidenceFile(`web-grid-${suffix}`, index),
      });
    }
    const webFinalized = await finalizeWebInlineSolutionBoards({
      matchId: webStart.match._id,
      userId: webGridUserId,
      now: web.evidenceAt,
    });
    assert.equal(webFinalized.evidence.matchStatus, "IN_PROGRESS");
    assert.equal(webFinalized.settlement.settled, true);

    // Stored match flags route to the current mode-specific service. Live V2
    // retains its two-attempt SUBMITTED gate.
    const dispatchCalls = [];
    const dispatch = createArenaEvidenceSettlementService({
      commands: {
        async settleAsyncCompetitive(input) { dispatchCalls.push(["competitive", input]); },
        async settleAsyncNormal(input) { dispatchCalls.push(["normal", input]); },
        async settleLiveV2(input) { dispatchCalls.push(["live-v2", input]); },
      },
    });
    const competitiveId = new mongoose.Types.ObjectId();
    const liveV2Id = new mongoose.Types.ObjectId();
    await ArenaMatch.collection.insertMany([
      { _id: competitiveId, matchKey: `DISPATCH-C-${suffix}`, arenaVersion: "2.0", competitiveAsync: { enabled: true } },
      { _id: liveV2Id, matchKey: `DISPATCH-V2-${suffix}`, arenaVersion: "2.0" },
    ]);
    await dispatch({ matchId: competitiveId, userId: fileUserId, evidenceResult: { matchStatus: "IN_PROGRESS" }, now });
    await dispatch({ matchId: gridStart.match._id, userId: gridUserId, evidenceResult: { matchStatus: "IN_PROGRESS" }, now });
    assert.equal(await dispatch({ matchId: liveV2Id, evidenceResult: { matchStatus: "IN_PROGRESS" }, now }), null);
    await dispatch({ matchId: liveV2Id, evidenceResult: { matchStatus: "SUBMITTED" }, now });
    assert.deepEqual(dispatchCalls.map(([kind]) => kind), [
      "competitive",
      "normal",
      "live-v2",
    ]);

    // The native normal-result contract exposes both actual sets and their
    // protected evidence links, while the service keeps outsider access denied.
    const resultResponse = await invoke(goatArenaV2Controller.apiNormalResult, {
      params: { matchId: String(fileStart.match._id) },
      apiUser: { _id: fileUserId },
    });
    assert.ifError(resultResponse.error);
    const result = resultResponse.payload.result;
    assert.equal(result.challenger.questions.length, 5);
    assert.equal(result.historicalOpponent.questions.length, 5);
    assert.equal(typeof result.challenger.questions[0].correct, "boolean");
    assert.ok(result.challenger.questions[0].sourceAccuracyRate > 0);
    assert.equal(typeof result.challenger.totalCorrect, "number");
    assert.equal(typeof result.challenger.completionTimeMs, "number");
    assert.equal(typeof result.challenger.difficultyAdjustedScore, "number");
    assert.match(result.historicalOpponent.solutions[0].href, /\/api\/v1\/goat-arena\/matches\/.+\/normal-result\/evidence\/historical\/1$/);
    assert.equal("answer" in result.challenger.questions[0], false);
    assert.equal("solution" in result.challenger.questions[0], false);

    const evidenceResponse = await invoke(goatArenaV2Controller.apiNormalEvidenceFile, {
      params: { matchId: String(fileStart.match._id), side: "historical", fileIndex: "1" },
      apiUser: { _id: fileUserId },
    });
    assert.ifError(evidenceResponse.error);
    assert.equal(evidenceResponse.redirect.status, 302);
    assert.match(evidenceResponse.redirect.url, /^https:\/\//);

    const forbidden = await invoke(goatArenaV2Controller.apiNormalResult, {
      params: { matchId: String(fileStart.match._id) },
      apiUser: { _id: outsiderUserId },
    });
    assert.equal(forbidden.error?.status, 403);
    assert.equal(forbidden.error?.code, "ARENA_RESULT_FORBIDDEN");

    console.log("Async Arena evidence delivery DB verified: iPad grid/file and web-grid settlement dispatch, competitive/normal/live routing, native normal result payload, and evidence authorization.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
