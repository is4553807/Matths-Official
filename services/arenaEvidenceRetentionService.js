"use strict";

const { ArenaMatchEvidence, ArenaCompetitiveRecord, ArenaMatch } = require("../models/goatArenaModel");
const RESULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

async function retainArenaEvidence({ evidenceId, referenceKey, until = null, now = new Date(), session }) {
  await ArenaMatchEvidence.updateOne({ _id: evidenceId, contentPurgedAt: null,
    retentionHoldReason: { $ne: "EVIDENCE_PURGE_IN_PROGRESS" } },
    { $pull: { retentionReferences: { until: { $ne: null, $lte: now } } } }, { session });
  const result = await ArenaMatchEvidence.updateOne({
    _id: evidenceId,
    contentPurgedAt: null,
    retentionHoldReason: { $ne: "EVIDENCE_PURGE_IN_PROGRESS" },
  }, { $addToSet: { retentionReferences: { referenceKey, until } } }, { session });
  if (result.matchedCount !== 1) {
    throw Object.assign(new Error("참조할 풀이 원본을 보존할 수 없습니다."), {
      status: 409, code: "ARENA_SOURCE_RETENTION_UNAVAILABLE",
    });
  }
}

async function completeArenaEvidenceReference({ recordId, matchId, now, session }) {
  if (!recordId) return;
  const record = await ArenaCompetitiveRecord.findById(recordId).session(session).lean();
  if (!record) return;
  await ArenaMatchEvidence.updateOne({ _id: record.sourceEvidenceId }, {
    $set: { "retentionReferences.$[reference].until": new Date(now.getTime() + RESULT_RETENTION_MS) },
  }, { session, arrayFilters: [{ "reference.referenceKey": `MATCH:${matchId}` }] });
}

// Pre-upgrade matches have no reference entries. Protect their active and recent
// released results too; newly created matches also write the evidence document,
// so purge acquisition and match creation cannot both commit.
async function hasLegacyArenaEvidenceReference(evidenceId, now) {
  const recordIds = await ArenaCompetitiveRecord.distinct("_id", { sourceEvidenceId: evidenceId });
  if (!recordIds.length) return false;
  if (await ArenaCompetitiveRecord.exists({ _id: { $in: recordIds }, status: "RESERVED" })) return true;
  return Boolean(await ArenaMatch.exists({
    $and: [
      { $or: [{ "normalAsync.historicalRecordId": { $in: recordIds } }, { "competitiveAsync.historicalRecordId": { $in: recordIds } }] },
      { $or: [
        { status: { $nin: ["SETTLED", "CANCELLED", "INVALID"] } },
        { resolvedAt: { $gt: new Date(now.getTime() - RESULT_RETENTION_MS) } },
        { resolvedAt: null },
      ] },
    ],
  }));
}

module.exports = { RESULT_RETENTION_MS, retainArenaEvidence, completeArenaEvidenceReference, hasLegacyArenaEvidenceReference };
