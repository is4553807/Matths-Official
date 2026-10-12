"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const { User, UserNotification } = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaCompetitiveRecord,
  ArenaIntegrityRiskProfile,
  ArenaMatch,
} = require("../models/goatArenaModel");
const {
  getArenaNotificationSummary,
  notifyArenaMatchIntegrityReviewStarted,
  notifyArenaMatchResult,
} = require("../services/arenaNotificationService");
const {
  findActiveMatchForUser,
} = require("../services/arenaActiveMatchService");
const {
  evaluateArenaIntegrityRiskForUser,
  runArenaIntegrityRiskSchedule,
} = require("../services/arenaIntegrityRiskService");
const {
  createGoatArenaProductionCommandService,
} = require("../services/goatArenaProductionCommandService");
const {
  getActiveParticipantMatch,
  getParticipantMatch,
  listParticipantMatches,
} = require("../services/goatArenaProductionMatchReadService");
const {
  _testing: { reserveNormalRecord },
} = require("../services/arenaAsyncNormalService");
const {
  priorExposedQuestionHashes,
  _testing: { reserveHistoricalRecord },
} = require("../services/arenaAsyncCompetitiveService");
const {
  _testing: { recentOpponentIds },
} = require("../services/arenaV2MatchmakingService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");

function matchRow({
  id,
  key,
  challengerUserId,
  defenderUserId,
  mode = "NORMAL",
  asyncKind = null,
  status = "READY",
  now,
}) {
  return {
    _id: id,
    matchKey: key,
    arenaVersion: "2.0",
    gameMode: mode,
    division: mode === "COMPETITIVE" ? "MAIN" : "SUB",
    matchType: "NORMAL",
    challenger: { userId: challengerUserId },
    defender: { userId: defenderUserId },
    status,
    integrityStatus: "CLEAR",
    ...(asyncKind === "NORMAL"
      ? { normalAsync: { enabled: true, historicalOwnerUserId: defenderUserId } }
      : asyncKind === "COMPETITIVE"
        ? { competitiveAsync: { enabled: true, historicalOwnerUserId: defenderUserId } }
        : {}),
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const now = new Date("2026-10-10T12:00:00.000+09:00");
  const challengerId = new mongoose.Types.ObjectId();
  const historicalOwnerId = new mongoose.Types.ObjectId();
  const prolificOwnerId = new mongoose.Types.ObjectId();
  const lowExposureOwnerId = new mongoose.Types.ObjectId();
  const liveChallengerId = new mongoose.Types.ObjectId();
  const liveDefenderId = new mongoose.Types.ObjectId();
  const normalId = new mongoose.Types.ObjectId();
  const competitiveId = new mongoose.Types.ObjectId();
  const liveId = new mongoose.Types.ObjectId();
  try {
    await ArenaCompetitiveRecord.init();
    await User.collection.insertMany([
      [challengerId, "challenger"],
      [historicalOwnerId, "historical-owner"],
      [prolificOwnerId, "prolific-owner"],
      [lowExposureOwnerId, "low-exposure-owner"],
      [liveChallengerId, "live-challenger"],
      [liveDefenderId, "live-defender"],
    ].map(([id, label]) => ({
      _id: id,
      name: `${label}-${suffix}`,
      nameNormalized: `${label}-${suffix}`,
      email: `${label}-${suffix}@example.invalid`,
      accountStatus: "active",
      isActive: true,
      isTestAccount: false,
      createdAt: now,
      updatedAt: now,
    })));
    await ArenaMatch.collection.insertMany([
      matchRow({
        id: normalId,
        key: `ASYNC-N-${suffix}`,
        challengerUserId: challengerId,
        defenderUserId: historicalOwnerId,
        asyncKind: "NORMAL",
        now,
      }),
      matchRow({
        id: competitiveId,
        key: `ASYNC-C-${suffix}`,
        challengerUserId: challengerId,
        defenderUserId: historicalOwnerId,
        mode: "COMPETITIVE",
        asyncKind: "COMPETITIVE",
        now: new Date(now.getTime() + 1000),
      }),
      matchRow({
        id: liveId,
        key: `LIVE-${suffix}`,
        challengerUserId: liveChallengerId,
        defenderUserId: liveDefenderId,
        now: new Date(now.getTime() + 2000),
      }),
    ]);

    // Historical owners are reference-data owners, not live defenders.
    assert.equal(await findActiveMatchForUser({ userId: historicalOwnerId }), null);
    assert.equal(await getActiveParticipantMatch({ userId: historicalOwnerId }), null);
    assert.ok(await findActiveMatchForUser({ userId: challengerId }));
    assert.ok(await getActiveParticipantMatch({ userId: challengerId }));
    const actionable = await listParticipantMatches({
      userId: historicalOwnerId,
      role: "DEFENDER",
      actionable: true,
    });
    assert.equal(actionable.matches.length, 0);
    const historicalView = await getParticipantMatch({
      userId: historicalOwnerId,
      id: normalId,
    });
    assert.equal(historicalView.role, "DEFENDER");
    assert.deepEqual(historicalView.capabilities.availableActions, []);
    const liveView = await getParticipantMatch({
      userId: liveDefenderId,
      id: liveId,
    });
    assert.deepEqual(liveView.capabilities.availableActions, ["START"]);
    const historicalSummary = await getArenaNotificationSummary({
      userId: historicalOwnerId,
    });
    assert.deepEqual(historicalSummary.actionByDivision, { SUB: 0, MAIN: 0 });
    assert.deepEqual(historicalSummary.defenseByDivision, { SUB: 0, MAIN: 0 });
    const liveSummary = await getArenaNotificationSummary({
      userId: liveDefenderId,
    });
    assert.deepEqual(liveSummary.actionByDivision, { SUB: 1, MAIN: 0 });
    assert.deepEqual(liveSummary.defenseByDivision, { SUB: 1, MAIN: 0 });

    const commandService = createGoatArenaProductionCommandService();
    for (const asyncMatchId of [normalId, competitiveId]) {
      await assert.rejects(
        commandService._testing.loadParticipantAuthority(
          asyncMatchId,
          historicalOwnerId
        ),
        (error) =>
          error?.statusCode === 404 &&
          error?.code === "GOAT_ARENA_MATCH_NOT_FOUND"
      );
      assert.equal(
        (
          await commandService._testing.loadParticipantAuthority(
            asyncMatchId,
            challengerId
          )
        ).role,
        "CHALLENGER"
      );
    }
    assert.equal(
      (
        await commandService._testing.loadParticipantAuthority(
          liveId,
          liveDefenderId
        )
      ).role,
      "DEFENDER"
    );

    assert.deepEqual([...(await recentOpponentIds(challengerId, now))], []);
    assert.deepEqual([...(await recentOpponentIds(historicalOwnerId, now))], []);
    assert.deepEqual(
      [...(await recentOpponentIds(liveChallengerId, now))],
      [String(liveDefenderId)]
    );
    assert.deepEqual(
      [...(await recentOpponentIds(liveDefenderId, now))],
      [String(liveChallengerId)]
    );

    await ArenaAccessState.collection.insertMany([
      { userId: challengerId, integrityStatus: "CLEAR", defensePoolEligible: true },
      { userId: historicalOwnerId, integrityStatus: "CLEAR", defensePoolEligible: true },
    ]);
    await ArenaMatch.updateOne(
      { _id: normalId },
      { $set: { integrityStatus: "SUSPICIOUS" } }
    );
    const integrityStarted = await notifyArenaMatchIntegrityReviewStarted({
      matchId: normalId,
      screenedRole: "CHALLENGER",
    });
    assert.equal(integrityStarted, null);
    assert.ok(await ArenaAccessState.exists({
      userId: challengerId,
      integrityStatus: "CLEAR",
    }));
    assert.ok(await ArenaAccessState.exists({
      userId: historicalOwnerId,
      integrityStatus: "CLEAR",
      defensePoolEligible: true,
    }));

    await ArenaMatch.updateMany(
      { _id: { $in: [normalId, competitiveId, liveId] } },
      {
        $set: {
          status: "SETTLED",
          integrityStatus: "CLEAR",
          winnerRole: "CHALLENGER",
          resultSnapshot: {
            challenger: { correctCount: 5 },
            defender: { correctCount: 4 },
            tieBreakStep: "CORRECT_COUNT",
            settlementSummary: { valid: true },
          },
          settledAt: new Date(now.getTime() + 60 * 1000),
        },
      }
    );
    await ArenaMatch.updateMany(
      { _id: { $in: [normalId, competitiveId] } },
      { $set: { noShowRole: "DEFENDER" } }
    );
    const scheduledRisk = await runArenaIntegrityRiskSchedule({ now });
    // Automated integrity risk is competitive-only. General and friendly
    // records remain available for results without entering the risk engine.
    assert.equal(scheduledRisk.matchCount, 1);
    assert.equal(scheduledRisk.userCount, 1);
    assert.equal(
      await ArenaIntegrityRiskProfile.exists({ userId: historicalOwnerId }),
      null
    );
    const historicalOwnerRisk = await evaluateArenaIntegrityRiskForUser({
      userId: historicalOwnerId,
      now,
    });
    assert.equal(historicalOwnerRisk.riskScore, 0);
    assert.deepEqual(historicalOwnerRisk.reasons, []);
    assert.equal((await notifyArenaMatchResult({ matchId: normalId })).length, 1);
    assert.equal((await notifyArenaMatchResult({ matchId: competitiveId })).length, 1);
    assert.equal((await notifyArenaMatchResult({ matchId: liveId })).length, 2);
    assert.equal(await UserNotification.countDocuments({
      userId: historicalOwnerId,
      sourceId: { $in: [normalId, competitiveId] },
      dedupeKey: /^arena-match-result:/,
    }), 0);
    assert.equal(await UserNotification.countDocuments({
      userId: challengerId,
      sourceId: { $in: [normalId, competitiveId] },
      dedupeKey: /^arena-match-result:/,
    }), 2);

    // Records are reusable immediately. Only questions shown in the player's
    // ten most recent started async matches are excluded for that player.
    assert.equal(GOAT_ARENA_V2_CONFIG.asyncNormal.questionRepeatWindowMatches, 10);
    const exposureMatches = Array.from({ length: 11 }, (_, index) => ({
      ...matchRow({
        id: new mongoose.Types.ObjectId(),
        key: `QUESTION-WINDOW-${suffix}-${index}`,
        challengerUserId: challengerId,
        defenderUserId: historicalOwnerId,
        asyncKind: "NORMAL",
        status: "SETTLED",
        now: new Date(now.getTime() + 10_000 + index * 1000),
      }),
      requestedAt: new Date(now.getTime() + 10_000 + index * 1000),
      normalAsync: {
        enabled: true,
        historicalOwnerUserId: historicalOwnerId,
        questionInstanceHashes: [`shown-${index}`],
      },
    }));
    await ArenaMatch.collection.insertMany(exposureMatches);
    const exposed = await priorExposedQuestionHashes(challengerId);
    assert.equal(exposed.size, 10);
    assert.equal(exposed.has("shown-0"), false, "the eleventh-oldest question must leave the window");
    for (let index = 1; index < 11; index += 1) {
      assert.equal(exposed.has(`shown-${index}`), true);
    }

    const recentQuestionRecordId = new mongoose.Types.ObjectId();
    const reusableRecordId = new mongoose.Types.ObjectId();
    const recordBase = {
      recordMode: "NORMAL",
      ownerUserId: historicalOwnerId,
      ratingSnapshot: { rating: 1500, ratingDeviation: 200, volatility: 0.06, tier: "platinum" },
      performance: { correctCount: 4, totalSolveTimeMs: 400000 },
      status: "AVAILABLE",
      consentVersion: "ARENA_NORMAL_SOLUTION_SHARE_V1",
      verifiedAt: now,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ArenaCompetitiveRecord.collection.insertMany([
      {
        ...recordBase,
        _id: recentQuestionRecordId,
        sourceMatchId: new mongoose.Types.ObjectId(),
        sourceAttemptId: new mongoose.Types.ObjectId(),
        sourceEvidenceId: new mongoose.Types.ObjectId(),
        sourceProblemPackId: new mongoose.Types.ObjectId(),
        questionInstanceHashes: ["shown-5", "blocked-b", "blocked-c", "blocked-d", "blocked-e"],
      },
      {
        ...recordBase,
        _id: reusableRecordId,
        sourceMatchId: new mongoose.Types.ObjectId(),
        sourceAttemptId: new mongoose.Types.ObjectId(),
        sourceEvidenceId: new mongoose.Types.ObjectId(),
        sourceProblemPackId: new mongoose.Types.ObjectId(),
        questionInstanceHashes: ["shown-0", "open-b", "open-c", "open-d", "open-e"],
      },
    ]);
    const reusable = await reserveNormalRecord({
      user: await User.findById(challengerId).lean(),
      rating: 1500,
      now: new Date(now.getTime() + 20_000),
      excludedQuestionHashes: exposed,
    });
    assert.equal(String(reusable.record?._id), String(reusableRecordId));
    await ArenaCompetitiveRecord.updateOne(
      { _id: reusableRecordId },
      { $set: { status: "AVAILABLE" }, $unset: { reservedByUserId: 1, reservedAt: 1, reservationExpiresAt: 1 } }
    );
    await ArenaCompetitiveRecord.updateOne(
      { _id: recentQuestionRecordId },
      { $set: { status: "INVALID" } }
    );
    const immediatelyReusable = await reserveNormalRecord({
      user: await User.findById(challengerId).lean(),
      rating: 1500,
      now: new Date(now.getTime() + 21_000),
      excludedQuestionHashes: new Set(),
    });
    assert.equal(
      String(immediatelyReusable.record?._id),
      String(reusableRecordId),
      "a record must be reusable without a global match cooldown"
    );

    // Match an owner first, then reserve one of that owner's records. Multiple
    // records from one prolific owner must not weight that owner as multiple
    // independent candidates.
    const ownerFirstRecords = [];
    for (let index = 0; index < 3; index += 1) {
      ownerFirstRecords.push({
        _id: new mongoose.Types.ObjectId(),
        recordMode: "NORMAL",
        ownerUserId: prolificOwnerId,
        sourceMatchId: new mongoose.Types.ObjectId(),
        sourceAttemptId: new mongoose.Types.ObjectId(),
        sourceEvidenceId: new mongoose.Types.ObjectId(),
        sourceProblemPackId: new mongoose.Types.ObjectId(),
        ratingSnapshot: { rating: 1000, ratingDeviation: 200, volatility: 0.06, tier: "GOLD" },
        performance: { correctCount: 3, totalSolveTimeMs: 450000 },
        questionInstanceHashes: [`p${index}-1`, `p${index}-2`, `p${index}-3`, `p${index}-4`, `p${index}-5`],
        status: "AVAILABLE",
        consentVersion: "ARENA_NORMAL_SOLUTION_SHARE_V1",
        verifiedAt: now,
        usageCount: 4,
        createdAt: now,
        updatedAt: now,
      });
    }
    const lowExposureNormalRecordId = new mongoose.Types.ObjectId();
    ownerFirstRecords.push({
      _id: lowExposureNormalRecordId,
      recordMode: "NORMAL",
      ownerUserId: lowExposureOwnerId,
      sourceMatchId: new mongoose.Types.ObjectId(),
      sourceAttemptId: new mongoose.Types.ObjectId(),
      sourceEvidenceId: new mongoose.Types.ObjectId(),
      sourceProblemPackId: new mongoose.Types.ObjectId(),
      ratingSnapshot: { rating: 1000, ratingDeviation: 200, volatility: 0.06, tier: "GOLD" },
      performance: { correctCount: 3, totalSolveTimeMs: 450000 },
      questionInstanceHashes: ["l1", "l2", "l3", "l4", "l5"],
      status: "AVAILABLE",
      consentVersion: "ARENA_NORMAL_SOLUTION_SHARE_V1",
      verifiedAt: now,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ArenaCompetitiveRecord.collection.insertMany(ownerFirstRecords);
    const ownerFirstNormal = await reserveNormalRecord({
      user: await User.findById(challengerId).lean(),
      rating: 1000,
      now: new Date(now.getTime() + 2000),
    });
    assert.equal(String(ownerFirstNormal.record?.ownerUserId), String(lowExposureOwnerId));
    assert.equal(String(ownerFirstNormal.record?._id), String(lowExposureNormalRecordId));

    const competitiveConsent = GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion;
    const competitiveRows = [];
    for (let index = 0; index < 3; index += 1) {
      competitiveRows.push({
        _id: new mongoose.Types.ObjectId(),
        recordMode: "COMPETITIVE",
        ownerUserId: prolificOwnerId,
        sourceMatchId: new mongoose.Types.ObjectId(),
        sourceAttemptId: new mongoose.Types.ObjectId(),
        sourceEvidenceId: new mongoose.Types.ObjectId(),
        sourceProblemPackId: new mongoose.Types.ObjectId(),
        ratingSnapshot: { rating: 1200, ratingDeviation: 150, volatility: 0.06, tier: "EMERALD" },
        performance: { correctCount: 4, totalSolveTimeMs: 400000 },
        questionInstanceHashes: [`c${index}-1`, `c${index}-2`, `c${index}-3`, `c${index}-4`, `c${index}-5`],
        status: "AVAILABLE",
        consentVersion: competitiveConsent,
        verifiedAt: now,
        usageCount: 3,
        createdAt: now,
        updatedAt: now,
      });
    }
    const lowExposureCompetitiveRecordId = new mongoose.Types.ObjectId();
    competitiveRows.push({
      _id: lowExposureCompetitiveRecordId,
      recordMode: "COMPETITIVE",
      ownerUserId: lowExposureOwnerId,
      sourceMatchId: new mongoose.Types.ObjectId(),
      sourceAttemptId: new mongoose.Types.ObjectId(),
      sourceEvidenceId: new mongoose.Types.ObjectId(),
      sourceProblemPackId: new mongoose.Types.ObjectId(),
      ratingSnapshot: { rating: 1200, ratingDeviation: 150, volatility: 0.06, tier: "EMERALD" },
      performance: { correctCount: 4, totalSolveTimeMs: 400000 },
      questionInstanceHashes: ["lc1", "lc2", "lc3", "lc4", "lc5"],
      status: "AVAILABLE",
      consentVersion: competitiveConsent,
      verifiedAt: now,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ArenaCompetitiveRecord.collection.insertMany(competitiveRows);
    const ownerFirstCompetitive = await reserveHistoricalRecord({
      user: await User.findById(challengerId).lean(),
      rating: 1200,
      now: new Date(now.getTime() + 3000),
    });
    assert.equal(String(ownerFirstCompetitive.record?.ownerUserId), String(lowExposureOwnerId));
    assert.equal(String(ownerFirstCompetitive.record?._id), String(lowExposureCompetitiveRecordId));

    console.log("Async historical semantics DB verified: no phantom defender notifications/actions/commands/risk/opponents, live V2 preserved, ten-match per-user question exclusion with immediately reusable records, and owner-first normal/competitive selection.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
