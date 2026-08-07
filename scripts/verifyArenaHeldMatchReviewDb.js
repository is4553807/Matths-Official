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
} = require("../models/goatArenaModel");
const { AdminActionLog, AdminTodo, User, UserNotification } = require("../models/matthsModel");
const {
  getAdminArenaIntegrityData,
  requestArenaSupplementalEvidence,
  reviewHeldArenaMatch,
} = require("../services/arenaIntegrityRiskService");
const {
  getArenaNotificationSummary,
  notifyArenaMatchDefender,
  notifyArenaMatchIntegrityReviewStarted,
} = require("../services/arenaNotificationService");
const {
  submitArenaSupplementalEvidence,
} = require("../services/arenaMatchEvidenceService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10000 });
  const token = randomUUID();
  const ids = {
    challenger: new mongoose.Types.ObjectId(),
    defender: new mongoose.Types.ObjectId(),
    admin: new mongoose.Types.ObjectId(),
    match: new mongoose.Types.ObjectId(),
    challengerAttempt: new mongoose.Types.ObjectId(),
    defenderAttempt: new mongoose.Types.ObjectId(),
    standingA: new mongoose.Types.ObjectId(),
    standingB: new mongoose.Types.ObjectId(),
    cycleA: new mongoose.Types.ObjectId(),
    cycleB: new mongoose.Types.ObjectId(),
    policy: new mongoose.Types.ObjectId(),
  };
  const now = new Date();
  const tuple = { arenaRank: "SILVER", arenaPosition: 1, arenaGp: 10, gpScaleVersion: "TIER_LOCAL_0_99_V1" };
  try {
    await User.collection.insertMany([
      { _id: ids.challenger, name: `held-a-${token.slice(0, 8)}`, realName: "보류검토 A", email: `held-a-${token}@example.com`, passwordHash: "test", role: "test", accountStatus: "active", isActive: true, warningCount: 1, createdAt: now, updatedAt: now },
      { _id: ids.defender, name: `held-b-${token.slice(0, 8)}`, realName: "보류검토 B", email: `held-b-${token}@example.com`, passwordHash: "test", role: "test", accountStatus: "active", isActive: true, warningCount: 0, createdAt: now, updatedAt: now },
      { _id: ids.admin, name: `held-admin-${token.slice(0, 8)}`, email: `held-admin-${token}@example.com`, passwordHash: "test", role: "admin", accountStatus: "active", isActive: true, createdAt: now, updatedAt: now },
    ]);
    await ArenaAccessState.collection.insertMany([
      { userId: ids.challenger, state: "PAID_ACTIVE", currentCompetitiveDivision: "SUB", currentSeasonPlacementCompleted: true, defensePoolEligible: false, integrityStatus: "REVIEW_REQUIRED", createdAt: now, updatedAt: now },
      { userId: ids.defender, state: "PAID_ACTIVE", currentCompetitiveDivision: "SUB", currentSeasonPlacementCompleted: true, defensePoolEligible: false, integrityStatus: "REVIEW_REQUIRED", createdAt: now, updatedAt: now },
    ]);
    const cycleExpiresAt = new Date(now.getTime() - 60 * 60 * 1000);
    await AccessCycle.collection.insertMany([
      { _id: ids.cycleA, userId: ids.challenger, division: "SUB", status: "EXPIRED", policyVersionId: ids.policy, policyVersionCode: "HELD-E2E", policySnapshot: {}, currency: "KRW", pricePaid: 29000, paidAt: now, startsAt: now, baseExpiresAt: cycleExpiresAt, expiresAt: cycleExpiresAt, evaluationAt: cycleExpiresAt, availableLearningDays: 20, paybackScoreDays: 20, lockedPaybackScoreDays: 0, lockedLearningDays: 0, reservedLearningDays: 0, firstDayMode: "SAME_DAY", evaluatedAt: null, createdAt: now, updatedAt: now },
      { _id: ids.cycleB, userId: ids.defender, division: "SUB", status: "EXPIRED", policyVersionId: ids.policy, policyVersionCode: "HELD-E2E", policySnapshot: {}, currency: "KRW", pricePaid: 29000, paidAt: now, startsAt: now, baseExpiresAt: cycleExpiresAt, expiresAt: cycleExpiresAt, evaluationAt: cycleExpiresAt, availableLearningDays: 20, paybackScoreDays: 20, lockedPaybackScoreDays: 0, lockedLearningDays: 0, reservedLearningDays: 0, firstDayMode: "SAME_DAY", evaluatedAt: null, createdAt: now, updatedAt: now },
    ]);
    await ArenaMatch.collection.insertOne({
      _id: ids.match,
      matchKey: `held-review-${token}`,
      division: "SUB",
      seasonKey: "2026",
      matchType: "NORMAL",
      matchOrigin: "SUB_UPWARD_AUTO_MATCH",
      requestInitiatorUserId: ids.challenger,
      targetTier: "SILVER",
      tierPairKey: "BRONZE_SILVER",
      tierPairLabel: "브론즈-실버",
      challenger: { userId: ids.challenger, standingId: ids.standingA, accessCycleId: ids.cycleA, tupleBefore: tuple, stakeDays: 1 },
      defender: { userId: ids.defender, standingId: ids.standingB, accessCycleId: ids.cycleB, tupleBefore: tuple, stakeDays: 0 },
      status: "HELD",
      policyVersionCode: "TEST",
      problemPackVersion: "TEST-PACK",
      scoringVersion: "TEST-SCORE",
      startDeadlineAt: new Date(now.getTime() + 60 * 60 * 1000),
      integrityStatus: "SUSPICIOUS",
      integrityScreenedRole: "CHALLENGER",
      integrityReviewStartedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      integrityReviewDeadlineAt: new Date(now.getTime() + 21 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });
    await ArenaMatchAttempt.collection.insertMany([
      { _id: ids.challengerAttempt, matchId: ids.match, userId: ids.challenger, role: "CHALLENGER", status: "SUBMITTED", answers: [{ questionKey: "Q1", value: "3" }], questionTimings: [{ questionKey: "Q1", startedAt: now, completedAt: now, responseTimeMs: 20000 }], activeSolveTimeMs: 20000, correctCount: 1, score: 20, createdAt: now, updatedAt: now },
      { _id: ids.defenderAttempt, matchId: ids.match, userId: ids.defender, role: "DEFENDER", status: "READY", answers: [], questionTimings: [], activeSolveTimeMs: null, correctCount: null, score: null, createdAt: now, updatedAt: now },
    ]);
    await ArenaMatchEvidence.collection.insertOne({
      attemptId: ids.challengerAttempt,
      matchId: ids.match,
      userId: ids.challenger,
      files: [{ originalName: "evidence.png", storedName: "test-evidence.png", mimeType: "image/png", sizeBytes: 10000, sha256: "a".repeat(64), storageProvider: "CLOUDINARY", storagePurpose: "USER_ARENA_EVIDENCE" }],
      deadlineAt: new Date(now.getTime() + 60000),
      submittedAt: now,
      status: "ANOMALY_FLAGGED",
      anomalyFlags: ["FAST_COMPLETION_UNDER_FIVE_MINUTES"],
      screenedAsWinner: true,
      retentionUntil: new Date(now.getTime() + 86400000),
      createdAt: now,
      updatedAt: now,
    });

    await notifyArenaMatchDefender({ matchId: ids.match });
    const defenderMailbox = await getArenaNotificationSummary({ userId: ids.defender });
    assert.equal(defenderMailbox.defenseByDivision.SUB, 1);
    assert.equal(defenderMailbox.actionByDivision.SUB, 0);
    assert.ok(defenderMailbox.unreadCount >= 1);
    assert.match(defenderMailbox.notifications[0].title, /방어해야 할 경기/);

    const reviewStarted = await notifyArenaMatchIntegrityReviewStarted({
      matchId: ids.match,
      screenedRole: "CHALLENGER",
    });
    assert.equal(reviewStarted.participantCount, 2);
    const reviewStartNotices = await UserNotification.find({
      userId: { $in: [ids.challenger, ids.defender] },
      title: "GOAT Arena 경기 검토가 시작되었습니다",
      sourceId: ids.match,
    }).lean();
    assert.equal(reviewStartNotices.length, 2);
    reviewStartNotices.forEach((entry) => {
      assert.match(entry.message, /양측의 새로운 매치메이킹/);
      assert.doesNotMatch(entry.message, /잠정 승자/);
    });
    await ArenaAccessState.updateMany(
      { userId: { $in: [ids.challenger, ids.defender] } },
      { $set: { state: "PAID_EXPIRED" } }
    );

    const adminData = await getAdminArenaIntegrityData();
    const held = adminData.heldMatches.find((match) => match.id === String(ids.match));
    assert.ok(held);
    assert.equal(held.attempts.length, 2);
    assert.equal(held.attempts.find((attempt) => attempt.role === "CHALLENGER").evidence.status, "ANOMALY_FLAGGED");
    assert.equal(held.challengerUser.warningCount, 1);

    const supplemental = await requestArenaSupplementalEvidence({
      matchId: ids.match,
      role: "CHALLENGER",
      adminUserId: ids.admin,
      requestMessage: "E2E 검증용 추가 풀이 소명 요청",
      now,
    });
    assert.equal(supplemental.status, "REQUESTED");
    assert.equal(
      new Date(supplemental.deadlineAt).getTime() - now.getTime(),
      24 * 60 * 60 * 1000
    );
    const supplementalNotice = await UserNotification.findOne({
      userId: ids.challenger,
      sourceType: "ArenaMatch",
      sourceId: ids.match,
      title: "GOAT Arena 추가 소명 자료 요청",
    }).lean();
    assert.ok(supplementalNotice);
    assert.equal(
      supplementalNotice.href,
      `/goat-arena/matches/${ids.match}/supplemental-evidence`
    );
    await ArenaMatchEvidence.updateOne(
      { matchId: ids.match },
      {
        $set: {
          "supplementalRequest.deadlineAt": new Date(now.getTime() - 1000),
        },
      }
    );
    await assert.rejects(
      () => submitArenaSupplementalEvidence({
        matchId: ids.match,
        userId: ids.challenger,
        files: [],
        receivedAt: now,
        now,
      }),
      (error) => error?.code === "ARENA_SUPPLEMENTAL_DEADLINE_EXPIRED"
    );
    const expiredSupplemental = await ArenaMatchEvidence.findOne({
      matchId: ids.match,
      userId: ids.challenger,
    }).lean();
    assert.equal(expiredSupplemental.supplementalRequest.status, "EXPIRED");
    await assert.rejects(
      () => requestArenaSupplementalEvidence({
        matchId: ids.match,
        role: "CHALLENGER",
        adminUserId: ids.admin,
        requestMessage: "기한 종료 뒤 재요청 금지 검증",
        now,
      }),
      /미제출로 확정/
    );

    const review = await reviewHeldArenaMatch({
      matchId: ids.match,
      adminUserId: ids.admin,
      decision: "CLEAR",
      note: "E2E 검증: 짧은 풀이지만 증거와 답안에 이상 없음",
      now,
    });
    assert.equal(review.decision, "CLEAR");
    assert.equal(review.completeInputs, false);
    const [match, evidence, access, defenderAccess, cycle, defenderCycle, notice, participantNotice, log] = await Promise.all([
      ArenaMatch.findById(ids.match).lean(),
      ArenaMatchEvidence.findOne({ matchId: ids.match }).lean(),
      ArenaAccessState.findOne({ userId: ids.challenger }).lean(),
      ArenaAccessState.findOne({ userId: ids.defender }).lean(),
      AccessCycle.findById(ids.cycleA).lean(),
      AccessCycle.findById(ids.cycleB).lean(),
      UserNotification.findOne({ dedupeKey: `arena-integrity-review-result:${ids.match}:CLEAR:${ids.challenger}` }).lean(),
      UserNotification.findOne({ dedupeKey: `arena-integrity-review-result:${ids.match}:CLEAR:${ids.defender}` }).lean(),
      AdminActionLog.findOne({
        targetUserId: ids.challenger,
        action: "arena.integrity.match.cleared",
        "metadata.matchId": String(ids.match),
      }).lean(),
    ]);
    assert.equal(match.status, "IN_PROGRESS");
    assert.equal(match.integrityStatus, "CLEAR");
    assert.equal(evidence.status, "REVIEWED");
    assert.equal(access.integrityStatus, "CLEAR");
    assert.equal(access.defensePoolEligible, true);
    assert.equal(access.state, "PAID_ACTIVE");
    assert.equal(defenderAccess.integrityStatus, "CLEAR");
    assert.equal(defenderAccess.defensePoolEligible, true);
    assert.equal(defenderAccess.state, "PAID_ACTIVE");
    assert.equal(cycle.status, "ACTIVE");
    assert.equal(defenderCycle.status, "ACTIVE");
    assert.equal(cycle.integrityReviewCompensationMs, 3 * 60 * 60 * 1000);
    assert.equal(defenderCycle.integrityReviewCompensationMs, 3 * 60 * 60 * 1000);
    assert.equal(
      new Date(cycle.expiresAt).getTime(),
      cycleExpiresAt.getTime() + 3 * 60 * 60 * 1000
    );
    assert.equal(
      new Date(defenderCycle.expiresAt).getTime(),
      cycleExpiresAt.getTime() + 3 * 60 * 60 * 1000
    );
    assert.match(notice.message, /3시간/);
    assert.ok(participantNotice);
    assert.match(participantNotice.message, /3시간/);
    const restoredDefenderActions = await getArenaNotificationSummary({ userId: ids.defender });
    assert.equal(restoredDefenderActions.actionByDivision.SUB, 1);
    assert.ok(notice);
    assert.match(log.detail, /이상 없음/);
    console.log("Atlas Arena 보류 경기 상세 조회·추가 소명 24시간 요청·무혐의 정지시간 보상·제한 해제·우편 E2E 검증 완료");
  } finally {
    const userIds = [ids.challenger, ids.defender, ids.admin];
    await Promise.all([
      AdminActionLog.deleteMany({ targetUserId: { $in: userIds } }),
      AdminTodo.deleteMany({ $or: [{ targetUserId: { $in: userIds } }, { sourceId: ids.match }] }),
      UserNotification.deleteMany({ userId: { $in: userIds } }),
      ArenaMatchEvidence.deleteMany({ matchId: ids.match }),
      ArenaLearningDayLedger.deleteMany({ sourceId: ids.match }),
      ArenaMatchAttempt.deleteMany({ matchId: ids.match }),
      ArenaMatch.deleteOne({ _id: ids.match }),
      ArenaAccessState.deleteMany({ userId: { $in: userIds } }),
      AccessCycle.deleteMany({ _id: { $in: [ids.cycleA, ids.cycleB] } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
