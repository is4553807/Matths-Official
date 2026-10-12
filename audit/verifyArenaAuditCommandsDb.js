"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const oid = () => new mongoose.Types.ObjectId();
let prepareHook = async () => {};
require("../services/fileStorageService").destroyStoredAsset = async () => {};
require("../services/arenaMatchEvidenceService").buildEvidenceFiles = async () => {
  await prepareHook();
  return [{ originalName: "fixture.png", storedName: "fixture.png", mimeType: "image/png", sizeBytes: 1,
    sha256: "a".repeat(64), storageProvider: "PURGED", storagePurpose: "USER_ARENA_EVIDENCE" }];
};
const M = require("../models/goatArenaModel");
const { ArenaNativeCommandReceipt } = require("../models/arenaDeliveryModel");
const { lockArenaQuestionCompletion } = require("../services/arenaQuestionCompletionService");
const { saveInlineSolutionBoard } = require("../services/arenaInlineSolutionBoardService");
const { advanceArenaMatchQuestion } = require("../services/arenaMatchAttemptService");
const { arenaNativeMutation } = require("../middleware/arenaNativeMutation");
const { purgeArenaUserData } = require("../services/accountDeletionService");
const guest = require("../services/arenaGuestChallengeService");
const NicknameNamespace = require("../models/nicknameNamespaceModel");

async function fixture(now) {
  const userId = oid(), owner = oid(), matchId = oid(), packId = oid(), attemptId = oid();
  const pack = await require("../services/arenaV2MatchmakingService").generateArenaV2Pack({
    matchKey: `AUDIT:${matchId}`, mode: "NORMAL", challenger: { _id: userId }, defender: { _id: owner },
    challengerProfile: { normalMatchmakingRating: 1000, tier: "GOLD" }, defenderProfile: { normalMatchmakingRating: 1000, tier: "GOLD" }, now,
  });
  const questions = pack.questions;
  await M.ArenaProblemPack.create({ ...pack, _id: packId });
  await M.ArenaMatch.collection.insertOne({ _id: matchId, matchKey: `AUDIT-${matchId}`, arenaVersion: "2.0", gameMode: "NORMAL", division: "SUB", seasonKey: "2026-10", competitivePool: "ALL", matchType: "NORMAL", requestInitiatorUserId: userId,
    tierPairKey: "AUDIT", tierPairLabel: "fixture", challenger: { userId }, defender: { userId: owner }, status: "IN_PROGRESS", policyVersionCode: "AUDIT", problemPackId: packId, problemPackVersion: pack.version, scoringVersion: "AUDIT", timeLimitMs: 600000, startDeadlineAt: new Date(now.getTime() + 600000), integrityStatus: "PENDING" });
  await M.ArenaMatchAttempt.collection.insertOne({ _id: attemptId, matchId, userId, role: "CHALLENGER", problemPackId: packId, problemPackVersion: pack.version, variantCode: "INDIVIDUAL", status: "IN_PROGRESS", currentQuestionIndex: 0,
    startedAt: now, deadlineAt: new Date(now.getTime() + 600000), answers: questions.map((question) => ({ questionKey: question.questionKey, value: "", revision: 0 })), questionTimings: [{ questionKey: "Q1", startedAt: now, completedAt: null }], boardWriteVersion: 0 });
  return { userId, matchId, attemptId, packId };
}

async function main() {
  assert.match(process.env.DB, /matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([M.ArenaInlineSolutionBoard.init(), ArenaNativeCommandReceipt.init()]);
    const startedAt = new Date(), f = await fixture(startedAt);
    const drawingDataBase64 = Buffer.from(JSON.stringify({ version: 1, strokes: [[[1, 2], [3, 4]]] })).toString("base64");
    const requestId = "audit-completion-1234567890";
    const lockInput = { ...f, questionSlot: 1, requestId, answer: "1", boardRevision: 1, strokeCount: 1, drawingSha256: crypto.createHash("sha256").update(Buffer.from(drawingDataBase64, "base64")).digest("hex"), now: new Date(startedAt.getTime() + 120000) };
    await lockArenaQuestionCompletion(lockInput);
    assert.equal((await lockArenaQuestionCompletion(lockInput)).replayed, true);
    await assert.rejects(lockArenaQuestionCompletion({ ...lockInput, answer: "2" }), { code: "ARENA_QUESTION_LOCK_CONFLICT" });
    const boardInput = { ...f, questionSlot: 1, revision: 1, strokeCount: 1, drawingDataBase64, file: {} };
    await saveInlineSolutionBoard(boardInput); await saveInlineSolutionBoard(boardInput);
    await advanceArenaMatchQuestion({ ...f, requestId, value: "1", inlineBoard: { revision: 1, sha256: "a".repeat(64) }, now: new Date(startedAt.getTime() + 140000) });
    assert.equal((await lockArenaQuestionCompletion(lockInput)).advanced, true,
      "a lost advance response is recoverable through the original locked request");
    const advanced = await M.ArenaMatchAttempt.findById(f.attemptId).lean();
    assert.equal(advanced.questionTimings[0].responseTimeMs, 120000);
    assert.ok((await M.ArenaInlineSolutionBoard.findOne({ attemptId: f.attemptId }).lean()).finalizedAt);
    prepareHook = () => M.ArenaMatchAttempt.updateOne({ _id: f.attemptId }, { $set: { currentQuestionIndex: 2 } });
    await assert.rejects(saveInlineSolutionBoard({ ...boardInput, questionSlot: 2 }), { code: "ARENA_INLINE_BOARD_SLOT_CONFLICT" });
    assert.equal(await M.ArenaInlineSolutionBoard.countDocuments({ attemptId: f.attemptId, questionSlot: 2 }), 0);
    prepareHook = async () => {};
    const overlap = await fixture(startedAt);
    const originalMatchUpdate = M.ArenaMatch.updateOne;
    let pausedAtFence = false;
    try {
      M.ArenaMatch.updateOne = async function (filter, update, options) {
        if (!pausedAtFence && update?.$inc?.inlineBoardWriteVersion) {
          pausedAtFence = true;
          await advanceArenaMatchQuestion({ ...overlap, requestId: "audit-overlap-advance-key", value: "1", now: new Date(startedAt.getTime() + 120000) });
        }
        return originalMatchUpdate.call(this, filter, update, options);
      };
      await assert.rejects(saveInlineSolutionBoard({ ...boardInput, ...overlap }), { code: "ARENA_INLINE_BOARD_SLOT_CONFLICT" });
    } finally { M.ArenaMatch.updateOne = originalMatchUpdate; }
    assert.equal(await M.ArenaInlineSolutionBoard.countDocuments({ attemptId: overlap.attemptId }), 0,
      "an advance committed after the board transaction read forces retry and rejects the late write");

    const timed = await fixture(startedAt);
    const timeoutAt = new Date(startedAt.getTime() + 600000);
    const timeoutKey = `QUESTION_TIME_LIMIT:${timed.attemptId}:${timeoutAt.getTime()}`;
    await lockArenaQuestionCompletion({ ...lockInput, ...timed, requestId: timeoutKey, submissionMode: "TIME_LIMIT", now: new Date(timeoutAt.getTime() + 1000) });
    await saveInlineSolutionBoard({ ...boardInput, ...timed });
    await advanceArenaMatchQuestion({ ...timed, requestId: timeoutKey, value: "1", submissionMode: "TIME_LIMIT", inlineBoard: { revision: 1, sha256: "a".repeat(64) }, now: new Date(timeoutAt.getTime() + 21000) });
    assert.equal((await M.ArenaMatchAttempt.findById(timed.attemptId).lean()).questionTimings[0].responseTimeMs, 600000);

    const photo = await fixture(startedAt);
    const photoKey = "audit-native-photo-completion";
    await lockArenaQuestionCompletion({ ...photo, questionSlot: 1, requestId: photoKey, answer: "1", evidenceMode: "PHOTO_UPLOAD_V1", now: new Date(startedAt.getTime() + 120000) });
    const photoDeadline = new Date(startedAt.getTime() + 600000);
    await advanceArenaMatchQuestion({ ...photo, requestId: `QUESTION_TIME_LIMIT:${photo.attemptId}:${photoDeadline.getTime()}`, submissionMode: "TIME_LIMIT", now: new Date(photoDeadline.getTime() + 1000) });
    const photoState = await M.ArenaMatchAttempt.findById(photo.attemptId).lean();
    assert.equal(photoState.questionTimings[0].responseTimeMs, 120000);
    assert.equal((await lockArenaQuestionCompletion({ ...photo, questionSlot: 1, requestId: photoKey, answer: "1", evidenceMode: "PHOTO_UPLOAD_V1", now: new Date(photoDeadline.getTime() + 2000) })).advanced, true);
    assert.equal((await advanceArenaMatchQuestion({ ...photo, requestId: photoKey, value: "1", now: new Date(photoDeadline.getTime() + 2000) })).replayed, true);

    let calls = 0;
    const handler = arenaNativeMutation("audit", async (_req, res) => { calls += 1; return res.status(201).json({ created: calls }); });
    const invoke = async (body = {}, headers = { "idempotency-key": "audit-native-replay-key", "x-matths-client-version": "2.2" }) => {
      let payload, error;
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { payload = value; return this; } };
      await handler({ apiUser: { _id: f.userId }, params: {}, body, headers }, res, (value) => { error = value; });
      return { payload, error, status: res.statusCode };
    };
    assert.equal((await invoke({}, {})).error.status, 400); assert.equal(calls, 0);
    assert.deepEqual((await invoke()).payload, { created: 1 });
    assert.deepEqual((await invoke()).payload, { created: 1 }); assert.equal(calls, 1);
    assert.equal((await invoke({ changed: true })).error.status, 409);

    const deletedUser = oid(), survivor = oid(), original = oid(), referenced = oid(), recordId = oid(), sourceAttemptId = oid(), sourceEvidenceId = oid(), sourcePackId = oid();
    await M.ArenaPackagePayment.create(["INICIS", "APPLE"].map((provider) => ({ userId: deletedUser, provider, providerPaymentKey: `audit-${provider}`, orderReference: `audit-order-${provider}`, idempotencyKey: `audit-pay-${provider}`, status: "APPLIED", approvedAt: startedAt, approvedAmount: 5500,
      ...(provider === "APPLE" ? { appleOriginalTransactionId: "audit-original", appleAppAccountToken: crypto.randomUUID() } : {}) })));
    await M.ArenaMatch.collection.insertMany([{ _id: original, matchKey: `audit-source-${original}`, challenger: { userId: deletedUser }, defender: { userId: oid() }, problemPackId: sourcePackId }, { _id: referenced, matchKey: `audit-reference-${referenced}`, challenger: { userId: survivor }, defender: { userId: deletedUser }, competitiveAsync: { enabled: true, historicalOwnerUserId: deletedUser, historicalRecordId: recordId } }]);
    await M.ArenaCompetitiveRecord.collection.insertOne({ _id: recordId, ownerUserId: deletedUser, sourceMatchId: original, sourceAttemptId, sourceEvidenceId, sourceProblemPackId: sourcePackId, status: "RESERVED" });
    await M.ArenaMatchAttempt.collection.insertOne({ _id: sourceAttemptId, userId: deletedUser, matchId: original });
    await M.ArenaMatchEvidence.collection.insertOne({ _id: sourceEvidenceId, userId: deletedUser, matchId: original, files: [] });
    await M.ArenaProblemPack.collection.insertOne({ _id: sourcePackId });
    await purgeArenaUserData(deletedUser);
    assert.equal(await M.ArenaPackagePayment.countDocuments({ userId: deletedUser }), 2);
    assert.equal(await M.ArenaMatch.countDocuments({ _id: { $in: [original, referenced] } }), 2);
    assert.ok(await M.ArenaCompetitiveRecord.findById(recordId)); assert.ok(await M.ArenaMatchEvidence.findById(sourceEvidenceId));

    const identityId = oid(), claimUser = oid(), birthDate = "2007-01-01";
    const secret = process.env.IDENTITY_MATCH_SECRET || process.env.SECRET || "matths-local-arena-guest-identity-key";
    const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
    const birthDateHash = crypto.createHmac("sha256", secret).update(`arena-guest-birthdate-v1:${birthDate}`).digest("hex");
    const restore = crypto.createHmac("sha256", secret).update(`arena-guest-cookie-v1:${identityId}:${birthDateHash}`).digest("base64url");
    const cookieHeader = `matths_arena_guest=${identityId}.${restore}`;
    await M.ArenaGuestIdentity.collection.insertOne({ _id: identityId, nickname: "감사게스트", nicknameNormalized: "감사게스트", birthDateHash, claimSecretHash: hash("old-secret"), firstChallengeAcceptedAt: startedAt, createdAt: startedAt, claimedByUserId: null });
    await NicknameNamespace.collection.insertOne({ _id: "감사게스트", ownerKind: "GUEST", ownerId: identityId, linkedGuestIdentityId: identityId, displayName: "감사게스트" });
    assert.equal((await guest.claimGuestRecordsForUser({ userId: claimUser, nickname: "감사게스트", birthDate, cookieHeader })).claimed, true);
    const claimed = await M.ArenaGuestIdentity.findById(identityId).lean();
    assert.equal(String(claimed.claimedByUserId), String(claimUser));
    assert.equal((await guest.claimGuestRecordsForUser({ userId: claimUser, nickname: "감사게스트", birthDate, cookieHeader })).claimed, false);
    console.log("Arena critical command regressions passed: 120s solve plus 20s transfer remains 120s, immutable answer/board, late write rejected, native replay/conflict, retained payments/source graph and revoked pre-claim proof.");
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
