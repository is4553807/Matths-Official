"use strict";

const mongoose = require("mongoose");
const {
  ArenaMatch, ArenaProblemPack, ArenaCompetitiveRecord, ArenaNormalBaselineQuestion,
} = require("../models/goatArenaModel");
const { GOAT_ARENA_V2_CONFIG } = require("./goatArenaV2Config");
const { questionInstanceHashAliases } = require("./arenaQuestionIdentityService");

const QUESTION_REPEAT_WINDOW_MATCHES = GOAT_ARENA_V2_CONFIG.asyncNormal.questionRepeatWindowMatches;
const PACK_GENERATION_CANDIDATE_LIMIT = 50;
const asynchronous = { $or: [{ "normalAsync.enabled": true }, { "competitiveAsync.enabled": true }] };
const id = value => String(value?._id || value || "");
const uniqueIds = values => [...new Set(values.map(id).filter(Boolean))];

function questionHashesForPacks(packs) {
  return [...new Set(packs.flatMap(pack =>
    (pack?.questions || []).flatMap(questionInstanceHashAliases)
  ))];
}

async function legacyRecordOverlapsExposure(record, exposedHashes) {
  if (!exposedHashes.size || record.questionInstanceHashes?.length) return false;
  const pack = await ArenaProblemPack.findById(record.sourceProblemPackId).select("+questions").lean();
  return questionHashesForPacks([pack]).some(hash => exposedHashes.has(hash));
}

// Called only after an authorized result or evidence response is ready. Both
// viewers see both problem sets. Reopening an old result refreshes its window.
async function markResultQuestionExposure({ match, userId, packs, now = new Date() }) {
  const challenger = id(match.challenger?.userId) === id(userId);
  const snapshot = match.normalAsync?.enabled ? match.normalAsync : match.competitiveAsync;
  const historicalOwner = snapshot?.historicalRecordId &&
    id(snapshot.historicalOwnerUserId) === id(userId);
  if (!challenger && !historicalOwner) {
    throw Object.assign(new Error("결과 노출 기록을 저장할 권한이 없습니다."), { status: 403 });
  }
  const hashes = questionHashesForPacks(packs);
  if (!hashes.length) return;
  const path = challenger ? "questionExposure.challengerLastShownAt" : "questionExposure.historicalOwnerLastShownAt";
  await ArenaMatch.updateOne(
    { _id: match._id },
    {
      $max: { [path]: new Date(now) },
      $addToSet: { "questionExposure.resultQuestionHashes": { $each: hashes } },
    },
    { timestamps: false }
  );
}

async function priorExposedQuestionHashes(userId) {
  const userObjectId = new mongoose.Types.ObjectId(id(userId));
  // A queue request cancelled before starting cannot age previously seen
  // questions out of the window. Completed legacy rows use their request time.
  const recent = await ArenaMatch.aggregate([
    { $match: {
      arenaVersion: "2.0", "challenger.userId": userObjectId,
      $and: [asynchronous, { $or: [
        { startedAt: { $type: "date" } },
        { status: { $in: ["IN_PROGRESS", "SUBMITTED", "HELD", "RESOLVED", "SETTLED"] } },
      ] }],
    } },
    { $addFields: { exposureWindowAt: { $ifNull: ["$startedAt", { $ifNull: ["$requestedAt", "$createdAt"] }] } } },
    { $sort: { exposureWindowAt: -1, _id: -1 } },
    { $limit: QUESTION_REPEAT_WINDOW_MATCHES },
    { $project: { problemPackId: 1, normalAsync: 1, competitiveAsync: 1, exposureWindowAt: 1 } },
  ]);
  const cutoff = recent.length === QUESTION_REPEAT_WINDOW_MATCHES
    ? recent.at(-1).exposureWindowAt : null;
  // Protect an already sealed/current assignment without counting it as a
  // played game. A cancelled ready request cannot flush the ten-game window.
  const assigned = await ArenaMatch.find({
    arenaVersion: "2.0", "challenger.userId": userObjectId,
    status: "READY", problemPackId: { $ne: null }, ...asynchronous,
  }).select("problemPackId normalAsync competitiveAsync").lean();
  const protectedMatches = [...recent, ...assigned];
  const shownSince = cutoff ? { $gte: cutoff } : { $type: "date" };
  const reviewedResults = await ArenaMatch.find({
    arenaVersion: "2.0",
    $and: [asynchronous, { $or: [
      { "challenger.userId": userObjectId, "questionExposure.challengerLastShownAt": shownSince },
      { "defender.userId": userObjectId, "questionExposure.historicalOwnerLastShownAt": shownSince },
    ] }],
  }).select("questionExposure.resultQuestionHashes").lean();
  const recordIds = uniqueIds(protectedMatches.map(match =>
    match.competitiveAsync?.historicalRecordId || match.normalAsync?.historicalRecordId
  ));
  const baselineIds = uniqueIds(protectedMatches.flatMap(match => match.normalAsync?.baselineQuestionIds || []));
  const [records, baselines] = await Promise.all([
    recordIds.length ? ArenaCompetitiveRecord.find({ _id: { $in: recordIds } })
      .select("questionInstanceHashes sourceProblemPackId").lean() : [],
    baselineIds.length ? ArenaNormalBaselineQuestion.find({ _id: { $in: baselineIds } })
      .select("questionInstanceHash +question").lean() : [],
  ]);
  // Legacy records may have v1 hashes or no cached hashes; read their actual
  // source questions as well. New matches also retain opponent hash snapshots.
  const packIds = uniqueIds([...protectedMatches.map(match => match.problemPackId), ...records.map(record => record.sourceProblemPackId)]);
  const packs = packIds.length ? await ArenaProblemPack.find({ _id: { $in: packIds } })
    .select("+questions").lean() : [];
  const exposed = new Set(questionHashesForPacks(packs));
  for (const record of records) for (const hash of record.questionInstanceHashes || []) exposed.add(hash);
  for (const baseline of baselines) {
    if (baseline.questionInstanceHash) exposed.add(baseline.questionInstanceHash);
    if (baseline.question) for (const hash of questionInstanceHashAliases(baseline.question)) exposed.add(hash);
  }
  for (const match of protectedMatches) for (const snapshot of [match.normalAsync, match.competitiveAsync]) {
    for (const hash of snapshot?.questionInstanceHashes || []) exposed.add(hash);
    for (const hash of snapshot?.opponentQuestionInstanceHashes || []) exposed.add(hash);
  }
  for (const match of reviewedResults) for (const hash of match.questionExposure?.resultQuestionHashes || []) exposed.add(hash);
  return exposed;
}

module.exports = { QUESTION_REPEAT_WINDOW_MATCHES, PACK_GENERATION_CANDIDATE_LIMIT, legacyRecordOverlapsExposure, markResultQuestionExposure, priorExposedQuestionHashes, questionHashesForPacks };
