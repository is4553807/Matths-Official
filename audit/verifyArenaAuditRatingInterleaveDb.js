"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const M = require("../models/goatArenaModel");
const { PrivateMockExamAttempt } = require("../models/matthsModel");
const { calculateCompetitivePerformance, SCORING_VERSION } = require("../services/arenaCompetitiveScoringService");
const { processWeeklyExamMmr } = require("../services/mmrService");
const { settleAsyncCompetitiveMatch } = require("../services/arenaAsyncCompetitiveService");
const { getParticipantMatch } = require("../services/goatArenaProductionMatchReadService");
const { adaptiveRatingUpdate } = require("../services/arenaAdaptiveRatingService");
const oid = () => new mongoose.Types.ObjectId();
const before = { rating: 1500, ratingDeviation: 200, volatility: 0.06, tier: "GOLD" };

async function fixture(name, now) {
  const user = oid(), owner = oid(), matchId = oid(), packId = oid(), attemptId = oid(), recordId = oid(), evidenceId = oid(), weeklyAttempt = oid(), examId = oid();
  const questions = Array.from({ length: 5 }, (_, index) => ({ questionKey: `Q${index + 1}`, prompt: `Fixture ${index}`, answer: String(index + 1), points: 20 }));
  const performance = calculateCompetitivePerformance({ questions: questions.map((question, index) => ({ questionKey: question.questionKey, correct: index < 3, sourceAccuracyRate: 0.5 })), totalSolveTimeMs: 5000 });
  await M.ArenaCompetitiveProfile.collection.insertOne({ userId: user, normalMatchesCompleted: 3, placementFinalizedAt: now, placementProcessVersion: "ARENA2_PLACEMENT_UNCERTAINTY_V2", ratingInitializedAt: now, ...before, competitiveScore: 1000, competitiveSolutionSharingConsentVersion: "ARENA21_SOLUTION_SHARE_V1" });
  await M.ArenaProblemPack.collection.insertOne({ _id: packId, version: `AUDIT-${name}`, questionCount: 5, timeLimitMs: 600000, questions });
  await M.ArenaMatch.collection.insertOne({ _id: matchId, matchKey: `AUDIT-WEEKLY-${name}`, arenaVersion: "2.0", gameMode: "COMPETITIVE", division: "MAIN", seasonKey: "2026-10", competitivePool: "ALL", matchType: "NORMAL", matchOrigin: "ARENA_2_ASYNC_RECORD", requestInitiatorUserId: user, tierPairKey: "ARENA2_R3", tierPairLabel: "fixture", challenger: { userId: user }, defender: { userId: owner }, status: "SUBMITTED", policyVersionCode: "GOAT_ARENA_2_1_COMPETITIVE", problemPackId: packId, problemPackVersion: `AUDIT-${name}`, scoringVersion: SCORING_VERSION, timeLimitMs: 600000, requestedAt: now, startDeadlineAt: new Date(now.getTime() + 600000), integrityStatus: "CLEAR", competitiveAsync: { enabled: true, historicalRecordId: recordId, historicalOwnerUserId: owner, challengerRatingBefore: before, challengerSourceRates: Array(5).fill(0.5), questionInstanceHashes: Array.from({ length: 5 }, (_, index) => String(index).repeat(64)) } });
  await M.ArenaMatchAttempt.collection.insertOne({ _id: attemptId, matchId, userId: user, role: "CHALLENGER", problemPackId: packId, status: "SUBMITTED", answers: questions.map((question) => ({ questionKey: question.questionKey, value: question.answer })), questionTimings: questions.map((question) => ({ questionKey: question.questionKey, responseTimeMs: 1000 })), activeSolveTimeMs: 5000 });
  await M.ArenaMatchEvidence.collection.insertOne({ _id: evidenceId, matchId, attemptId, userId: user, originalEvidenceSubmitted: true, submittedAt: now, files: [{ originalName: "fixture.png", storedName: "fixture.png", mimeType: "image/png", sizeBytes: 1024, sha256: "a".repeat(64), storageProvider: "PURGED", storagePurpose: "USER_ARENA_EVIDENCE" }] });
  await M.ArenaCompetitiveRecord.collection.insertOne({ _id: recordId, recordMode: "COMPETITIVE", ownerUserId: owner, sourceMatchId: oid(), sourceAttemptId: oid(), sourceEvidenceId: oid(), sourceProblemPackId: oid(), ratingSnapshot: before, performance, questionInstanceHashes: ["b".repeat(64)], status: "RESERVED", reservedByUserId: user, reservedByMatchId: matchId, verifiedAt: now, consentVersion: "ARENA21_SOLUTION_SHARE_V1" });
  await PrivateMockExamAttempt.collection.insertOne({ _id: weeklyAttempt, examId, userId: user, weekKey: "2026-W41", status: "submitted" });
  const weeklyInput = { exam: { _id: examId, weekKey: "2026-W41", points: [3, 4] }, attempts: [], seriesEntries: [{ representativeAttempt: { _id: weeklyAttempt, userId: user, status: "submitted" }, rawScore: 90, totalPercentile: 0.9, advancedPercentile: 0.9, consistencyScore: 0.9, mmrPerformance: 0.9 }], now };
  return { user, matchId, weeklyInput };
}

async function main() {
  assert.match(process.env.DB, /matths_audit_/);
  await mongoose.connect(process.env.DB);
  try {
    await Promise.all([M.ArenaCompetitiveProfile.init(), M.ArenaRatingSettlement.init(), M.ArenaWeeklyMockRatingSettlement.init()]);
    for (const order of ["WEEKLY_FIRST", "MATCH_FIRST", "CONCURRENT"]) {
      const now = new Date(), f = await fixture(order, now);
      const weekly = () => processWeeklyExamMmr(f.weeklyInput);
      const match = () => settleAsyncCompetitiveMatch({ matchId: f.matchId, now });
      if (order === "WEEKLY_FIRST") { await weekly(); await match(); }
      else if (order === "MATCH_FIRST") { await match(); await weekly(); }
      else await Promise.all([weekly(), match()]);
      const profile = await M.ArenaCompetitiveProfile.findOne({ userId: f.user }).lean();
      const weeklyLedger = await M.ArenaWeeklyMockRatingSettlement.findOne({ userId: f.user }).lean();
      const matchLedger = await M.ArenaRatingSettlement.findOne({ matchId: f.matchId }).lean();
      if (Math.abs(weeklyLedger.before.rating - 1500) < 1e-9) {
        const expected = adaptiveRatingUpdate({ before: weeklyLedger.after, opponent: before, winnerRole: "CHALLENGER", profile: {}, mode: "COMPETITIVE" }).after;
        for (const key of ["rating", "ratingDeviation", "volatility"]) assert.ok(Math.abs(profile[key] - expected[key]) < 1e-9, `${order}: ${key} lost a committed event`);
        assert.ok(Math.abs(matchLedger.challenger.rating.before - weeklyLedger.after.rating) < 0.01);
      } else {
        const afterMatch = adaptiveRatingUpdate({ before, opponent: before, winnerRole: "CHALLENGER", profile: {}, mode: "COMPETITIVE" }).after;
        assert.ok(Math.abs(weeklyLedger.before.rating - afterMatch.rating) < 1e-9);
        for (const key of ["rating", "ratingDeviation", "volatility"]) assert.equal(profile[key], weeklyLedger.after[key]);
      }
      assert.equal(profile.competitiveScore, 1016);
      const dto = await getParticipantMatch({ userId: f.user, id: f.matchId });
      assert.equal(dto.ratingChange.kind, "PUBLIC_COMPETITIVE_POINTS");
      assert.equal(dto.ratingChange.before, 1000); assert.equal(dto.ratingChange.after, 1016);
      assert.equal(dto.ratingChange.tierAfterLabel, "골드"); assert.equal(dto.ratingChange.ratingDeviationBefore, undefined);
      await weekly(); await match();
      const replayed = await M.ArenaCompetitiveProfile.findOne({ userId: f.user }).lean();
      for (const key of ["rating", "ratingDeviation", "volatility", "competitiveScore"]) assert.equal(replayed[key], profile[key]);
      assert.deepEqual(replayed.weeklyMockRecentPerformances, profile.weeklyMockRecentPerformances);
      assert.deepEqual(replayed.lastRatedAt, profile.lastRatedAt);
      assert.equal(await M.ArenaWeeklyMockRatingSettlement.countDocuments({ userId: f.user }), 1);
      assert.equal(await M.ArenaRatingSettlement.countDocuments({ matchId: f.matchId }), 1);
      console.log(JSON.stringify({ order, weeklyBefore: weeklyLedger.before.rating, weeklyAfter: weeklyLedger.after.rating, finalRating: profile.rating, score: profile.competitiveScore }));
    }
    console.log("Weekly/competitive ordering and concurrent transactions verified: both committed rating states survive and replays remain idempotent.");
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
