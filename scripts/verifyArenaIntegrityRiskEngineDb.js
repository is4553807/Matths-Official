const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const {
  ArenaAccessState,
  ArenaIntegrityLinkSignal,
  ArenaIntegrityRiskCase,
  ArenaIntegrityRiskProfile,
  ArenaMatch,
} = require("../models/goatArenaModel");
const { AdminTodo, User, UserNotification } = require("../models/matthsModel");
const {
  evaluateArenaIntegrityRiskForUser,
  recordConnectionIntegritySignals,
  reviewArenaIntegrityCase,
} = require("../services/arenaIntegrityRiskService");

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  await Promise.all([
    ArenaIntegrityLinkSignal.init(),
    ArenaIntegrityRiskCase.init(),
    ArenaIntegrityRiskProfile.init(),
    AdminTodo.init(),
    UserNotification.init(),
  ]);

  const token = randomUUID();
  const userId = new mongoose.Types.ObjectId();
  const opponentId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const matchIds = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  const now = new Date();
  let caseId = null;
  try {
    await User.collection.insertMany([
      {
        _id: userId,
        name: `integrity-a-${token.slice(0, 8)}`,
        realName: "무결성 테스트 A",
        email: `integrity-a-${token}@example.com`,
        passwordHash: "test-only",
        role: "test",
        accountStatus: "active",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: opponentId,
        name: `integrity-b-${token.slice(0, 8)}`,
        realName: "무결성 테스트 B",
        email: `integrity-b-${token}@example.com`,
        passwordHash: "test-only",
        role: "test",
        accountStatus: "active",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: adminId,
        name: `integrity-admin-${token.slice(0, 8)}`,
        email: `integrity-admin-${token}@example.com`,
        passwordHash: "test-only",
        role: "admin",
        accountStatus: "active",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await ArenaAccessState.collection.insertMany([
      {
        userId,
        currentCompetitiveDivision: "SUB",
        state: "PAID_ACTIVE",
        currentSeasonPlacementCompleted: true,
        defensePoolEligible: true,
        integrityStatus: "CLEAR",
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: opponentId,
        currentCompetitiveDivision: "SUB",
        state: "PAID_ACTIVE",
        currentSeasonPlacementCompleted: true,
        defensePoolEligible: true,
        integrityStatus: "CLEAR",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await Promise.all([
      recordConnectionIntegritySignals({
        userId,
        deviceToken: `shareddevice${token.replace(/-/g, "")}`,
        ip: "198.51.100.10",
        userAgent: "Matths-E2E-A",
        acceptLanguage: "ko-KR",
        now,
      }),
      recordConnectionIntegritySignals({
        userId: opponentId,
        deviceToken: `shareddevice${token.replace(/-/g, "")}`,
        ip: "203.0.113.20",
        userAgent: "Matths-E2E-B",
        acceptLanguage: "ko-KR",
        now,
      }),
    ]);
    await ArenaMatch.collection.insertMany(
      matchIds.slice(0, 3).map((matchId, index) => ({
        _id: matchId,
        matchKey: `integrity-e2e-${token}-${index}`,
        division: "SUB",
        seasonKey: "2026",
        matchType: "NORMAL",
        challenger: { userId },
        defender: { userId: opponentId },
        status: "SETTLED",
        winnerRole: "DEFENDER",
        settledAt: new Date(now.getTime() - index * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - index * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - index * 60 * 60 * 1000),
      }))
    );

    const first = await evaluateArenaIntegrityRiskForUser({ userId, now });
    assert.equal(first.reviewRequired, true);
    assert.equal(first.riskScore, 40);
    caseId = first.currentCaseId;
    const [riskCase, profile, accessState, todo] = await Promise.all([
      ArenaIntegrityRiskCase.findById(caseId).lean(),
      ArenaIntegrityRiskProfile.findOne({ userId }).lean(),
      ArenaAccessState.findOne({ userId }).lean(),
      AdminTodo.findOne({ sourceType: "ArenaIntegrityRiskCase", sourceId: caseId }).lean(),
    ]);
    assert.equal(riskCase.status, "OPEN");
    assert.equal(profile.status, "REVIEW_REQUIRED");
    assert.equal(accessState.integrityStatus, "REVIEW_REQUIRED");
    assert.equal(accessState.defensePoolEligible, false);
    assert.equal(todo.status, "pending");
    const storedSignal = await ArenaIntegrityLinkSignal.findOne({
      userId,
      signalType: "DEVICE_TOKEN",
    })
      .select("+signalHash")
      .lean();
    assert.match(storedSignal.signalHash, /^[a-f0-9]{64}$/);
    assert.equal(storedSignal.signalHash.includes(token.replace(/-/g, "")), false);

    await evaluateArenaIntegrityRiskForUser({ userId, now });
    assert.equal(
      await ArenaIntegrityRiskCase.countDocuments({ userId, status: "OPEN" }),
      1
    );

    await reviewArenaIntegrityCase({
      caseId,
      adminUserId: adminId,
      decision: "CLEAR",
      note: "E2E 검증: 이상 없음",
      now,
    });
    const clearedState = await ArenaAccessState.findOne({ userId }).lean();
    assert.equal(clearedState.integrityStatus, "CLEAR");
    assert.equal(clearedState.defensePoolEligible, true);
    assert.equal(
      await UserNotification.countDocuments({
        userId,
        dedupeKey: `arena-integrity-review:${caseId}:CLEAR`,
      }),
      1
    );

    await evaluateArenaIntegrityRiskForUser({ userId, now });
    assert.equal(
      await ArenaIntegrityRiskCase.countDocuments({ userId, status: "OPEN" }),
      0
    );

    await ArenaMatch.collection.insertOne({
      _id: matchIds[3],
      matchKey: `integrity-e2e-${token}-3`,
      division: "SUB",
      seasonKey: "2026",
      matchType: "NORMAL",
      challenger: { userId },
      defender: { userId: opponentId },
      status: "SETTLED",
      winnerRole: "DEFENDER",
      settledAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const changedEvidence = await evaluateArenaIntegrityRiskForUser({ userId, now });
    assert.equal(changedEvidence.reviewRequired, true);
    const reopenedCaseId = changedEvidence.currentCaseId;
    assert.notEqual(String(reopenedCaseId), String(caseId));
    await reviewArenaIntegrityCase({
      caseId: reopenedCaseId,
      adminUserId: adminId,
      decision: "RESTRICT",
      note: "E2E 검증: 위험 확인",
      now,
    });
    const restrictedState = await ArenaAccessState.findOne({ userId }).lean();
    assert.equal(restrictedState.integrityStatus, "RESTRICTED");
    assert.equal(restrictedState.defensePoolEligible, false);
    console.log("Atlas GOAT Arena 무결성 위험 검토·멱등·해제 E2E 검증 완료");
  } finally {
    const userIds = [userId, opponentId, adminId];
    await Promise.all([
      AdminTodo.deleteMany({ $or: [{ targetUserId: userId }, ...(caseId ? [{ sourceId: caseId }] : [])] }),
      UserNotification.deleteMany({ userId: { $in: userIds } }),
      ArenaIntegrityRiskCase.deleteMany({ userId: { $in: userIds } }),
      ArenaIntegrityRiskProfile.deleteMany({ userId: { $in: userIds } }),
      ArenaIntegrityLinkSignal.deleteMany({ userId: { $in: userIds } }),
      ArenaAccessState.deleteMany({ userId: { $in: userIds } }),
      ArenaMatch.deleteMany({ _id: { $in: matchIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
