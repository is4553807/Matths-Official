"use strict";
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const release = require("../dataAnalysis/arenaNormalBaselineRelease20261012.json");
const { User } = require("../models/matthsModel");
const { ArenaNormalBaselineQuestion } = require("../models/goatArenaModel");
const { getR2Client } = require("./r2ObjectStorageService");
const { questionInstanceHash } = require("./arenaQuestionIdentityService");
const { workedSolutionForQuestion } = require("./arenaNormalBaselineFontBatchService");

async function sealedJson(objectKey, expectedHash) {
  const response = await getR2Client().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey }));
  assert.ok(response.Body, "Release artifact is missing");
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, "Release artifact checksum mismatch");
  return JSON.parse(bytes.toString("utf8"));
}

async function verifyEvidence(file) {
  const head = await getR2Client().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: file.r2ObjectKey }));
  assert.equal(head.Metadata?.sha256, file.sha256, "Reference image checksum mismatch");
  assert.equal(head.ContentLength, file.sizeBytes, "Reference image size mismatch");
  assert.equal(head.ContentType, "image/png");
}

async function activatePreparedNormalBaselineBatch({
  operatorEmail, now = new Date(), readJson = sealedJson, checkEvidence = verifyEvidence,
} = {}) {
  const records = await ArenaNormalBaselineQuestion.find({ batchKey: release.batchKey }).select("+question").lean();
  assert.equal(records.length, 540, "The complete prepared batch must exist in this DB");
  const alreadyActive = records.every(r => r.status === "ACTIVE" && r.calibrationStatus === "SIMULATION_APPROVED");
  let operator = null;
  if (!alreadyActive) {
    assert.ok(records.every(r => r.status === "REVIEW_PENDING"), "Only a uniformly pending batch can be activated");
    const email = String(operatorEmail || "").trim().toLowerCase();
    if (!email) {
      const error = new Error("Set ARENA_NORMAL_BASELINE_OPERATOR_EMAIL to the login email of an existing active administrator.");
      error.code = "ARENA_NORMAL_BASELINE_OPERATOR_MISSING";
      throw error;
    }
    operator = await User.findOne({ email, role: "admin", accountStatus: "active", isActive: { $ne: false } }).select("_id").lean();
    if (!operator) {
      const error = new Error("Baseline operator must be an active registered administrator. Check ARENA_NORMAL_BASELINE_OPERATOR_EMAIL against the administrator login email in this DB.");
      error.code = "ARENA_NORMAL_BASELINE_OPERATOR_INVALID";
      throw error;
    }
  }
  const [manifest, simulation, inventory] = await Promise.all([
    readJson(release.manifestR2ObjectKey, release.manifestSha256),
    readJson(release.calibrationR2ObjectKey, release.calibrationSha256),
    readJson(release.evidenceInventoryR2ObjectKey, release.evidenceInventorySha256),
  ]);
  assert.equal(manifest.batchKey, release.batchKey);
  assert.equal(manifest.questions.length, 540);
  assert.equal(simulation.batchKey, release.batchKey);
  assert.equal(simulation.manifestSha256, release.manifestSha256);
  assert.equal(simulation.activationApproved, true);
  assert.equal(simulation.empiricalHumanCalibration, false);
  assert.equal(simulation.tiers.length, 9);
  assert.ok(simulation.tiers.every(t => t.challengerWinRate >= .4 && t.challengerWinRate <= .6));
  const expectedByKey = new Map(manifest.questions.map(q => [q.baselineKey, q]));
  const fileByName = new Map(inventory.map(f => [f.originalName, f]));
  const files = new Map();
  for (const record of records) {
    const expected = expectedByKey.get(record.baselineKey);
    assert.ok(expected, "Unexpected reference question");
    for (const field of ["tier", "difficultyCode", "targetMmr", "questionInstanceHash", "sourceReferenceId", "sourceAccuracyRate", "baselineSubmittedAnswer", "baselineCorrect", "baselineSolveTimeMs", "expectedSolutionFileName"]) assert.equal(record[field], expected[field], `Reference field mismatch: ${field}`);
    assert.equal(questionInstanceHash(record.question), expected.questionInstanceHash);
    assert.equal(record.question.answer, expected.question.answer);
    assert.deepEqual(record.question.solutionProcess, expected.question.solutionProcess);
    assert.equal(record.generationProvenance.manifestSha256, release.manifestSha256);
    assert.equal(record.generationProvenance.isHumanSolveEvidence, false);
    assert.equal(record.generationProvenance.solveTimeBasis, "MODEL_ESTIMATE");
    assert.equal(record.sourceAccuracyEvidenceKind, "EXACT");
    workedSolutionForQuestion({ sourceTypeId: record.sourceReferenceId, parameters: record.question.answerKey.parameterSnapshot, problem: { answer: record.question.answer } });
    for (const [file, name] of [[record.solutionEvidenceFile, expected.expectedSolutionFileName], [record.correctSolutionFile, expected.correctSolutionFileName]]) {
      const expectedFile = fileByName.get(name); assert.ok(expectedFile && file, "Reference file is missing");
      for (const field of ["originalName", "r2ObjectKey", "sha256", "sizeBytes", "mimeType"]) assert.equal(file[field], expectedFile[field], `Reference file mismatch: ${field}`);
      assert.equal(file.storageProvider, "R2"); assert.equal(file.storagePurpose, "ARENA_BASELINE_SOLUTION"); files.set(file.r2ObjectKey, file);
      assert.equal(file.r2Sha256, file.sha256);
    }
  }
  for (let i = 1; i <= 9; i++) assert.equal(records.filter(r => r.difficultyCode === `U${i}`).length, 60);
  const list = [...files.values()];
  for (let offset = 0; offset < list.length; offset += 12) {
    const results = await Promise.allSettled(list.slice(offset, offset + 12).map(checkEvidence));
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  if (alreadyActive) {
    for (const record of records) await new ArenaNormalBaselineQuestion(record).validate();
    const owners = [...new Set(records.map(r => String(r.createdByUserId)))];
    assert.equal(await User.countDocuments({ _id: { $in: owners }, accountStatus: "active", isActive: { $ne: false } }), owners.length, "Reference owner must remain active");
    return { batchKey: release.batchKey, activatedCount: 540, replayed: true };
  }
  const changes = {
    status: "ACTIVE", calibrationStatus: "SIMULATION_APPROVED", createdByUserId: operator._id, reviewedByUserId: operator._id,
    reviewedAt: now, activatedAt: now, updatedAt: now,
    reviewNotes: `운영자가 배포 설정으로 승인한 일반전 베타. 수학·손글씨·격자·저장소 검증 완료. 90만 회 모델 시뮬레이션 승인(실사용자 보정 미완료). 합성 기준 답안·추정 풀이 시간. calibrationSha256=${release.calibrationSha256}`,
  };
  for (const record of records) await new ArenaNormalBaselineQuestion({ ...record, ...changes }).validate();
  await ArenaNormalBaselineQuestion.createIndexes();
  const session = await mongoose.startSession(); let replayed = false;
  try {
    await session.withTransaction(async () => {
      const active = await ArenaNormalBaselineQuestion.countDocuments({ batchKey: release.batchKey, status: "ACTIVE", calibrationStatus: "SIMULATION_APPROVED" }).session(session);
      if (active === 540) { replayed = true; return; }
      assert.equal(active, 0, "Partial activation is not permitted");
      const result = await ArenaNormalBaselineQuestion.collection.bulkWrite(records.map(r => ({ updateOne: {
        filter: { _id: r._id, batchKey: release.batchKey, status: "REVIEW_PENDING" }, update: { $set: changes },
      } })), { session, ordered: true });
      assert.equal(result.modifiedCount, 540, "Every record must activate atomically");
    });
  } finally { await session.endSession(); }
  assert.equal(await ArenaNormalBaselineQuestion.countDocuments({ batchKey: release.batchKey, status: "ACTIVE", calibrationStatus: "SIMULATION_APPROVED" }), 540);
  return { batchKey: release.batchKey, activatedCount: 540, replayed, calibrationBasis: "MODEL_SIMULATION", empiricalHumanCalibration: false };
}

async function activateConfiguredNormalBaselineBatch() {
  if (String(process.env.ARENA_NORMAL_BASELINE_AUTO_ACTIVATE || "false").toLowerCase() !== "true") return { enabled: false };
  return activatePreparedNormalBaselineBatch({ operatorEmail: process.env.ARENA_NORMAL_BASELINE_OPERATOR_EMAIL });
}

// This optional content release must not take down login, learning or the web server.
// The strict activation function above still rejects failures before changing the batch.
async function initializeConfiguredNormalBaselineRelease({ activate = activateConfiguredNormalBaselineBatch, logger = console } = {}) {
  try {
    const result = await activate();
    if (result.activatedCount) {
      logger.log(`Normal beta baseline ready: ${result.activatedCount} questions (${result.replayed ? "existing activation" : "activated"}).`);
    }
    return result;
  } catch (error) {
    const operatorError = ["ARENA_NORMAL_BASELINE_OPERATOR_MISSING", "ARENA_NORMAL_BASELINE_OPERATOR_INVALID"].includes(error.code);
    const errorCode = operatorError ? error.code : "ARENA_NORMAL_BASELINE_ACTIVATION_FAILED";
    const message = operatorError ? error.message : "Verify the prepared batch, private R2 artifacts and activation settings before retrying.";
    logger.warn(`[normal beta baseline activation deferred] ${errorCode}: ${message} Web startup will continue; the batch was not activated by this attempt.`);
    return { enabled: true, activatedCount: 0, deferred: true, errorCode };
  }
}

module.exports = { activateConfiguredNormalBaselineBatch, activatePreparedNormalBaselineBatch, initializeConfiguredNormalBaselineRelease };
