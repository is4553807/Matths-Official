const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaStanding,
  ArenaStandingChangeLedger,
} = require("../models/goatArenaModel");
const { AdminActionLog, AdminTodo, User, UserNotification } = require("../models/matthsModel");
const { reviewHeldArenaMatch } = require("../services/arenaIntegrityRiskService");

function tuple(rank, position, gp) {
  return { arenaRank: rank, arenaPosition: position, arenaGp: gp, gpScaleVersion: "TIER_LOCAL_0_99_V1" };
}

async function seedScenario({ division, cheatingRole, adminId, token, index, now }) {
  const challengerId = new mongoose.Types.ObjectId();
  const defenderId = new mongoose.Types.ObjectId();
  const challengerStandingId = new mongoose.Types.ObjectId();
  const defenderStandingId = new mongoose.Types.ObjectId();
  const challengerCycleId = new mongoose.Types.ObjectId();
  const defenderCycleId = new mongoose.Types.ObjectId();
  const matchId = new mongoose.Types.ObjectId();
  const challengerAttemptId = new mongoose.Types.ObjectId();
  const defenderAttemptId = new mongoose.Types.ObjectId();
  const stake = division === "SUB" ? 1 : 2;
  const challengerTuple = tuple("BRONZE", 20 + index * 2, 10);
  const defenderTuple = tuple("SILVER", 10 + index * 2, 40);
  const commonCycle = {
    division,
    status: "ACTIVE",
    policyVersionId: new mongoose.Types.ObjectId(),
    policyVersionCode: "INTEGRITY-E2E",
    policySnapshot: {},
    currency: "KRW",
    pricePaid: 29000,
    paidAt: now,
    startsAt: now,
    baseExpiresAt: new Date(now.getTime() + 29 * 86400000),
    expiresAt: new Date(now.getTime() + 29 * 86400000),
    evaluationAt: new Date(now.getTime() + 29 * 86400000),
    firstDayMode: "SAME_DAY",
    reservedLearningDays: 0,
    createdAt: now,
    updatedAt: now,
  };
  const mainBuckets = (availableDays, lockedDays) => [
    { sourceType: "MAIN_MATCH_TRANSFER", availableDays, reservedDays: 0, lockedDays },
  ];
  await User.collection.insertMany([
    { _id: challengerId, name: `integrity-c-${index}-${token}`, email: `integrity-c-${index}-${token}@example.com`, passwordHash: "test", role: "test", isTestAccount: true, testBatchKey: `INTEGRITY-SETTLEMENT-${token}`, accountStatus: "active", isActive: true, warningCount: 0, createdAt: now, updatedAt: now },
    { _id: defenderId, name: `integrity-d-${index}-${token}`, email: `integrity-d-${index}-${token}@example.com`, passwordHash: "test", role: "test", isTestAccount: true, testBatchKey: `INTEGRITY-SETTLEMENT-${token}`, accountStatus: "active", isActive: true, warningCount: 0, createdAt: now, updatedAt: now },
  ]);
  await ArenaStanding.collection.insertMany([
    { _id: challengerStandingId, userId: challengerId, division, seasonKey: `E2E-${token}`, ...challengerTuple, status: "ACTIVE", createdAt: now, updatedAt: now },
    { _id: defenderStandingId, userId: defenderId, division, seasonKey: `E2E-${token}`, ...defenderTuple, status: "ACTIVE", createdAt: now, updatedAt: now },
  ]);
  await AccessCycle.collection.insertMany([
    {
      _id: challengerCycleId,
      userId: challengerId,
      ...commonCycle,
      availableLearningDays: division === "MAIN" ? 10 : 20,
      paybackScoreDays: 20,
      lockedPaybackScoreDays: division === "SUB" ? stake : 0,
      lockedLearningDays: division === "MAIN" ? stake : 0,
      learningDayBuckets: division === "MAIN" ? mainBuckets(10, stake) : [],
    },
    {
      _id: defenderCycleId,
      userId: defenderId,
      ...commonCycle,
      availableLearningDays: division === "MAIN" ? 10 : 20,
      paybackScoreDays: 10,
      lockedPaybackScoreDays: 0,
      lockedLearningDays: 0,
      learningDayBuckets: division === "MAIN" ? mainBuckets(10, 0) : [],
    },
  ]);
  await ArenaAccessState.collection.insertMany([
    { userId: challengerId, accessCycleId: challengerCycleId, standingId: challengerStandingId, state: "PAID_ACTIVE", currentCompetitiveDivision: division, currentSeasonPlacementCompleted: true, defensePoolEligible: false, integrityStatus: "REVIEW_REQUIRED", createdAt: now, updatedAt: now },
    { userId: defenderId, accessCycleId: defenderCycleId, standingId: defenderStandingId, state: "PAID_ACTIVE", currentCompetitiveDivision: division, currentSeasonPlacementCompleted: true, defensePoolEligible: false, integrityStatus: "REVIEW_REQUIRED", createdAt: now, updatedAt: now },
  ]);
  await ArenaMatch.collection.insertOne({
    _id: matchId,
    matchKey: `integrity-settlement-${index}-${token}`,
    division,
    seasonKey: `E2E-${token}`,
    matchType: "NORMAL",
    matchOrigin: division === "MAIN" ? "MAIN_UPWARD_AUTO_MATCH" : "SUB_UPWARD_AUTO_MATCH",
    requestInitiatorUserId: challengerId,
    targetTier: "SILVER",
    tierPairKey: "BRONZE_SILVER",
    tierPairLabel: "브론즈-실버",
    challenger: { userId: challengerId, standingId: challengerStandingId, accessCycleId: challengerCycleId, tupleBefore: challengerTuple, stakeDays: stake },
    defender: { userId: defenderId, standingId: defenderStandingId, accessCycleId: defenderCycleId, tupleBefore: defenderTuple, stakeDays: 0 },
    economySnapshot: {
      originalStakeDays: stake,
      challengerStakeDays: stake,
      defenderStakeDays: 0,
      ...(division === "MAIN" ? { normalStakeMode: "INITIATOR_ONLY" } : {}),
    },
    status: "HELD",
    policyVersionCode: "INTEGRITY-E2E",
    problemPackVersion: "INTEGRITY-E2E",
    scoringVersion: "INTEGRITY-E2E",
    startDeadlineAt: new Date(now.getTime() + 86400000),
    integrityStatus: "SUSPICIOUS",
    integrityScreenedRole: "CHALLENGER",
    integrityReviewStartedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    integrityReviewDeadlineAt: new Date(now.getTime() + 22 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });
  await ArenaMatchAttempt.collection.insertMany([
    { _id: challengerAttemptId, matchId, userId: challengerId, role: "CHALLENGER", status: "SUBMITTED", currentQuestionIndex: 5, evidenceDeadlineAt: null, answers: [], questionTimings: [], activeSolveTimeMs: 120000, correctCount: 3, score: 60, createdAt: now, updatedAt: now },
    { _id: defenderAttemptId, matchId, userId: defenderId, role: "DEFENDER", status: "SUBMITTED", currentQuestionIndex: 5, answers: [], questionTimings: [], activeSolveTimeMs: 140000, correctCount: 2, score: 40, createdAt: now, updatedAt: now },
  ]);
  const evidenceFile = (name, hash) => ({ originalName: name, storedName: `${token}-${index}-${name}`, mimeType: "image/png", sizeBytes: 12000, sha256: hash.repeat(64), storageProvider: "LOCAL", storagePurpose: "USER_ARENA_EVIDENCE" });
  const evidenceRows = [
    { attemptId: defenderAttemptId, matchId, userId: defenderId, files: [evidenceFile("defender.png", "b")], deadlineAt: now, submittedAt: now, status: cheatingRole === "DEFENDER" ? "ANOMALY_FLAGGED" : "ON_TIME", anomalyFlags: cheatingRole === "DEFENDER" ? ["MULTIPLE_RAPID_CORRECT_ANSWERS"] : [], screenedAsWinner: cheatingRole === "DEFENDER", retentionUntil: new Date(now.getTime() + 86400000), createdAt: now, updatedAt: now },
  ];
  evidenceRows.unshift({ attemptId: challengerAttemptId, matchId, userId: challengerId, files: [evidenceFile("challenger.png", "a")], deadlineAt: now, submittedAt: now, status: cheatingRole === "CHALLENGER" ? "ANOMALY_FLAGGED" : "ON_TIME", anomalyFlags: cheatingRole === "CHALLENGER" ? ["MULTIPLE_RAPID_CORRECT_ANSWERS"] : [], screenedAsWinner: cheatingRole === "CHALLENGER", retentionUntil: new Date(now.getTime() + 86400000), createdAt: now, updatedAt: now });
  await ArenaMatchEvidence.collection.insertMany(evidenceRows);
  await ArenaMatchParticipantLock.collection.insertMany([
    { userId: challengerId, matchId, acquiredAt: now, createdAt: now, updatedAt: now },
    { userId: defenderId, matchId, acquiredAt: now, createdAt: now, updatedAt: now },
  ]);

  const result = await reviewHeldArenaMatch({
    matchId,
    adminUserId: adminId,
    decision: `${cheatingRole}_CHEATING`,
    note: `${division} ${cheatingRole} 부정행위 확정 E2E`,
    now,
  });
  assert.equal(result.status, "SETTLED");
  const [match, challengerCycle, defenderCycle, challengerStanding, defenderStanding, challengerUser, defenderUser, challengerAccess, defenderAccess] = await Promise.all([
    ArenaMatch.findById(matchId).lean(),
    AccessCycle.findById(challengerCycleId).lean(),
    AccessCycle.findById(defenderCycleId).lean(),
    ArenaStanding.findById(challengerStandingId).lean(),
    ArenaStanding.findById(defenderStandingId).lean(),
    User.findById(challengerId).lean(),
    User.findById(defenderId).lean(),
    ArenaAccessState.findOne({ userId: challengerId }).lean(),
    ArenaAccessState.findOne({ userId: defenderId }).lean(),
  ]);
  assert.equal(match.integrityStatus, "CONFIRMED");
  assert.equal(match.winnerRole ?? null, cheatingRole === "CHALLENGER" ? "DEFENDER" : cheatingRole === "DEFENDER" ? "CHALLENGER" : null);
  const penalizedIds = cheatingRole === "CHALLENGER"
    ? [challengerId]
    : cheatingRole === "DEFENDER"
      ? [defenderId]
      : [challengerId, defenderId];
  const penaltyNotices = await UserNotification.find({
    userId: { $in: penalizedIds },
    sourceType: "ArenaIntegrityReview",
    sourceId: matchId,
  }).lean();
  const participantNotices = await UserNotification.find({
    userId: { $in: [challengerId, defenderId] },
    sourceType: "ArenaIntegrityReview",
    sourceId: matchId,
  }).lean();
  assert.equal(penaltyNotices.length, penalizedIds.length);
  assert.equal(participantNotices.length, 2);
  for (const notice of penaltyNotices) {
    assert.equal(/페이백 심사/.test(notice.message), division === "SUB");
    assert.match(notice.message, /1\/3\(정수 단위 올림\)/);
    assert.match(
      notice.message,
      new RegExp(`\\n\\n판정 근거: ${division} ${cheatingRole} 부정행위 확정 E2E$`)
    );
  }
  const penaltyLedgers = await ArenaLearningDayLedger.find({
    sourceId: matchId,
    eventType: "INTEGRITY_PENALTY_BURN",
  }).lean();
  assert.equal(penaltyLedgers.length, penalizedIds.length);
  if (["CHALLENGER", "BOTH"].includes(cheatingRole)) {
    assert.equal(challengerAccess.integrityStatus, "RESTRICTED");
    assert.equal(challengerUser.warningCount, 1);
    assert.equal(
      (challengerCycle.paybackDisqualifiers || []).includes("INTEGRITY_VIOLATION_CONFIRMED"),
      division === "SUB"
    );
  }
  if (["DEFENDER", "BOTH"].includes(cheatingRole)) {
    assert.equal(defenderAccess.integrityStatus, "RESTRICTED");
    assert.equal(defenderUser.warningCount, 1);
    assert.equal(
      (defenderCycle.paybackDisqualifiers || []).includes("INTEGRITY_VIOLATION_CONFIRMED"),
      division === "SUB"
    );
  }
  const expectedCompensationMs = 2 * 60 * 60 * 1000;
  assert.equal(
    Number(challengerCycle.integrityReviewCompensationMs || 0),
    cheatingRole === "DEFENDER" ? expectedCompensationMs : 0
  );
  assert.equal(
    Number(defenderCycle.integrityReviewCompensationMs || 0),
    cheatingRole === "CHALLENGER" ? expectedCompensationMs : 0
  );
  if (cheatingRole === "CHALLENGER") {
    assert.equal(challengerStanding.arenaRank, challengerTuple.arenaRank);
    assert.equal(defenderStanding.arenaRank, defenderTuple.arenaRank);
    if (division === "SUB") {
      assert.equal(challengerCycle.lockedPaybackScoreDays, 0);
      assert.equal(challengerCycle.paybackScoreDays, 13);
      assert.equal(defenderCycle.paybackScoreDays, 10 + stake);
    } else {
      assert.equal(challengerCycle.lockedLearningDays, 0);
      assert.equal(defenderCycle.lockedLearningDays, 0);
      assert.equal(challengerCycle.availableLearningDays, 6);
      assert.equal(defenderCycle.availableLearningDays, 10 + stake);
    }
  } else if (cheatingRole === "DEFENDER") {
    assert.equal(challengerStanding.arenaRank, defenderTuple.arenaRank);
    assert.equal(defenderStanding.arenaRank, challengerTuple.arenaRank);
    assert.equal(defenderUser.warningCount, 1);
    if (division === "SUB") {
      assert.equal(challengerCycle.paybackScoreDays, 20 + stake);
      assert.equal(challengerCycle.lockedPaybackScoreDays, 0);
      assert.equal(defenderCycle.paybackScoreDays, 6);
    } else {
      assert.equal(challengerCycle.availableLearningDays, 10 + stake);
      assert.equal(challengerCycle.lockedLearningDays, 0);
      assert.equal(defenderCycle.availableLearningDays, 6);
      assert.equal(defenderCycle.lockedLearningDays, 0);
    }
  } else {
    assert.equal(challengerStanding.arenaRank, challengerTuple.arenaRank);
    assert.equal(defenderStanding.arenaRank, defenderTuple.arenaRank);
    if (division === "SUB") {
      assert.equal(challengerCycle.lockedPaybackScoreDays, 0);
      assert.equal(challengerCycle.paybackScoreDays, 13);
      assert.equal(defenderCycle.paybackScoreDays, 6);
    } else {
      assert.equal(challengerCycle.lockedLearningDays, 0);
      assert.equal(challengerCycle.availableLearningDays, 6);
      assert.equal(defenderCycle.lockedLearningDays, 0);
      assert.equal(defenderCycle.availableLearningDays, 6);
    }
  }
  return { userIds: [challengerId, defenderId], matchId };
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10000 });
  const token = randomUUID().replaceAll("-", "").slice(0, 12);
  const now = new Date();
  const adminId = new mongoose.Types.ObjectId();
  const seeded = [];
  try {
    await User.collection.insertOne({ _id: adminId, name: `integrity-admin-${token}`, email: `integrity-admin-${token}@example.com`, passwordHash: "test", role: "admin", accountStatus: "active", isActive: true, createdAt: now, updatedAt: now });
    let index = 0;
    for (const division of ["SUB", "MAIN"]) {
      for (const cheatingRole of ["CHALLENGER", "DEFENDER", "BOTH"]) {
        seeded.push(await seedScenario({ division, cheatingRole, adminId, token, index, now }));
        index += 1;
      }
    }
    console.log("Atlas Unranked·Ranked 양측 검토·공격자/방어자/양측 부정행위 확정 정산 E2E 검증 완료");
  } finally {
    const userIds = [adminId, ...seeded.flatMap((entry) => entry.userIds)];
    const matchIds = seeded.map((entry) => entry.matchId);
    await Promise.all([
      AdminActionLog.deleteMany({ $or: [{ targetUserId: { $in: userIds } }, { adminUserId: adminId }] }),
      AdminTodo.deleteMany({ $or: [{ targetUserId: { $in: userIds } }, { sourceId: { $in: matchIds } }] }),
      UserNotification.deleteMany({ userId: { $in: userIds } }),
      ArenaLearningDayLedger.deleteMany({ userId: { $in: userIds } }),
      ArenaStandingChangeLedger.deleteMany({ matchId: { $in: matchIds } }),
      ArenaOutboxEvent.deleteMany({ aggregateId: { $in: matchIds } }),
      ArenaMatchParticipantLock.deleteMany({ matchId: { $in: matchIds } }),
      ArenaMatchEvidence.deleteMany({ matchId: { $in: matchIds } }),
      ArenaMatchAttempt.deleteMany({ matchId: { $in: matchIds } }),
      ArenaMatch.deleteMany({ _id: { $in: matchIds } }),
      ArenaAccessState.deleteMany({ userId: { $in: userIds } }),
      AccessCycle.deleteMany({ userId: { $in: userIds } }),
      ArenaStanding.deleteMany({ userId: { $in: userIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
