const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env", quiet: true });

const {
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  AppleCommerceAccountToken,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestIdentity,
  ArenaGuestSolutionBoard,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchEvidence,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const NicknameNamespace = require("../models/nicknameNamespaceModel");
const {
  withdrawUserAccount,
} = require("../services/accountDeletionService");
const {
  getClaimedGuestRecordPageData,
  getGuestChallengePageData,
} = require("../services/arenaGuestChallengeService");

const TEST_BATCH_KEY = "ACCOUNT-DELETION-DB-VERIFY";

async function createTemporaryUser(suffix) {
  const token = `${Date.now()}${suffix}`;
  return User.create({
    name: `deleteverify${token}`.slice(0, 30),
    nameNormalized: `deleteverify${token}`.slice(0, 30),
    realName: "삭제검증",
    email: `deleteverify-${token}@test.invalid`,
    passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 4),
    role: "student",
    isTestAccount: true,
    testBatchKey: TEST_BATCH_KEY,
    learnerType: "WORKER",
    schoolGrade: 15,
    educationStatus: "enrolled",
    accountStatus: "active",
    isActive: true,
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function guestEvidenceFile(storedName) {
  return {
    originalName: `${storedName}.png`,
    storedName: `${storedName}.png`,
    mimeType: "image/png",
    sizeBytes: 64,
    sha256: sha256(storedName),
    storageProvider: "PURGED",
    storagePurpose: "USER_ARENA_EVIDENCE",
  };
}

function guestPerformance(correctCount, totalSolveTimeMs) {
  return {
    correctCount,
    totalSolveTimeMs,
    z: correctCount,
    observations: Array.from({ length: 5 }, (_value, index) => ({
      x: index < correctCount ? 1 : 0,
    })),
  };
}

function guestQuestion(index) {
  return {
    questionKey: `delete-q-${index}`,
    typeId: `delete-type-${index}`,
    category: "general",
    courseId: "MATH",
    difficultyScore: 0.5,
    expectedTimeMs: 60_000,
    prompt: `${index}번 삭제 검증 문제`,
    inputMode: "short-answer",
    answer: String(index),
    points: 20,
    validation: {
      passed: true,
      solvable: true,
      uniqueAnswer: true,
      calculatorFree: true,
      answerMatches: true,
      checkedAt: new Date(),
    },
  };
}

async function seedGuestDeletionFixture({ anonymousUser, purgeUser, survivorUser }) {
  const now = new Date();
  const ids = {
    challengeId: new mongoose.Types.ObjectId(),
    sourceMatchId: new mongoose.Types.ObjectId(),
    sourceAttemptId: new mongoose.Types.ObjectId(),
    sourceEvidenceId: new mongoose.Types.ObjectId(),
    problemPackId: new mongoose.Types.ObjectId(),
  };
  const anonymousSecret = crypto.randomBytes(32).toString("base64url");
  const survivorSecret = crypto.randomBytes(32).toString("base64url");
  const [anonymousIdentity, survivorIdentity] = await ArenaGuestIdentity.create([
    {
      nickname: "탈퇴전게스트",
      nicknameNormalized: `withdraw-guest-${String(anonymousUser._id).slice(-8)}`,
      claimSecretHash: sha256(anonymousSecret),
      birthDateHash: sha256("2007-01-01"),
      firstChallengeAcceptedAt: now,
      claimedByUserId: anonymousUser._id,
      claimedAt: now,
    },
    {
      nickname: "남은게스트",
      nicknameNormalized: `survivor-${String(survivorUser._id).slice(-8)}`,
      claimSecretHash: sha256(survivorSecret),
      birthDateHash: sha256("2007-02-02"),
      firstChallengeAcceptedAt: now,
    },
  ]);
  ids.anonymousIdentityId = anonymousIdentity._id;
  ids.survivorIdentityId = survivorIdentity._id;

  await ArenaProblemPack.collection.insertOne({
    _id: ids.problemPackId,
    questions: Array.from({ length: 5 }, (_value, index) => guestQuestion(index + 1)),
  });
  await ArenaMatch.collection.insertOne({
    _id: ids.sourceMatchId,
    requestInitiatorUserId: purgeUser._id,
    challenger: { userId: purgeUser._id },
    defender: { userId: survivorUser._id },
    problemPackId: ids.problemPackId,
  });
  await ArenaMatchAttempt.collection.insertOne({
    _id: ids.sourceAttemptId,
    matchId: ids.sourceMatchId,
    userId: purgeUser._id,
    problemPackId: ids.problemPackId,
  });
  await ArenaMatchEvidence.collection.insertOne({
    _id: ids.sourceEvidenceId,
    attemptId: ids.sourceAttemptId,
    matchId: ids.sourceMatchId,
    userId: purgeUser._id,
    files: [guestEvidenceFile("creator-source")],
    retentionHoldReason: "GUEST_CHALLENGE_ARCHIVE",
    contentPurgedAt: null,
  });

  const rawToken = crypto.randomBytes(32).toString("base64url");
  await ArenaGuestChallenge.collection.insertOne({
    _id: ids.challengeId,
    tokenHash: sha256(rawToken),
    creatorUserId: purgeUser._id,
    sourceKind: "ARENA_MATCH",
    sourceMatchId: ids.sourceMatchId,
    sourceAttemptId: ids.sourceAttemptId,
    sourceEvidenceId: ids.sourceEvidenceId,
    sourceProblemPackId: ids.problemPackId,
    sourcePerformance: guestPerformance(4, 240_000),
    status: "OPEN",
    expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });

  const [anonymousAttempt, activeAnonymousAttempt, survivorAttempt] = await ArenaGuestChallengeAttempt.create([
    {
      challengeId: ids.challengeId,
      guestIdentityId: anonymousIdentity._id,
      claimedByUserId: anonymousUser._id,
      attemptNumber: 1,
      status: "SETTLED",
      problemPackId: ids.problemPackId,
      evidenceFiles: [guestEvidenceFile("anonymous-guest")],
      evidenceSubmittedAt: now,
      performance: guestPerformance(3, 250_000),
      result: "CREATOR_WIN",
      settledAt: now,
    },
    {
      challengeId: ids.challengeId,
      guestIdentityId: anonymousIdentity._id,
      claimedByUserId: anonymousUser._id,
      attemptNumber: 2,
      status: "IN_PROGRESS",
      problemPackId: ids.problemPackId,
      startedAt: now,
      deadlineAt: new Date(now.getTime() + 10 * 60 * 1000),
    },
    {
      challengeId: ids.challengeId,
      guestIdentityId: survivorIdentity._id,
      attemptNumber: 1,
      status: "SETTLED",
      problemPackId: ids.problemPackId,
      evidenceFiles: [guestEvidenceFile("survivor-guest")],
      evidenceSubmittedAt: now,
      performance: guestPerformance(5, 200_000),
      result: "CHALLENGER_WIN",
      settledAt: now,
    },
  ]);
  ids.anonymousGuestAttemptId = anonymousAttempt._id;
  ids.activeAnonymousGuestAttemptId = activeAnonymousAttempt._id;
  ids.survivorGuestAttemptId = survivorAttempt._id;
  const [anonymousBoard, survivorBoard] = await ArenaGuestSolutionBoard.create([
    {
      attemptId: anonymousAttempt._id,
      guestIdentityId: anonymousIdentity._id,
      questionSlot: 1,
      revision: 1,
      strokeCount: 1,
      drawingData: Buffer.from("anonymous"),
      file: guestEvidenceFile("anonymous-guest"),
      finalizedAt: now,
    },
    {
      attemptId: survivorAttempt._id,
      guestIdentityId: survivorIdentity._id,
      questionSlot: 1,
      revision: 1,
      strokeCount: 1,
      drawingData: Buffer.from("survivor"),
      file: guestEvidenceFile("survivor-board"),
      finalizedAt: now,
    },
  ]);
  ids.anonymousBoardId = anonymousBoard._id;
  ids.survivorBoardId = survivorBoard._id;

  await NicknameNamespace.insertMany([
    {
      _id: anonymousUser.nameNormalized,
      displayName: anonymousUser.name,
      ownerKind: "USER",
      ownerId: anonymousUser._id,
      linkedGuestIdentityId: anonymousIdentity._id,
    },
    {
      _id: purgeUser.nameNormalized,
      displayName: purgeUser.name,
      ownerKind: "USER",
      ownerId: purgeUser._id,
    },
  ]);

  return {
    ids,
    rawToken,
    anonymousSecret,
    survivorSecret,
  };
}

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);
  let anonymousUser;
  let purgeUser;
  let survivorUser;
  let guestFixture;
  try {
    anonymousUser = await createTemporaryUser("a");
    purgeUser = await createTemporaryUser("p");
    survivorUser = await createTemporaryUser("s");
    await AppleCommerceAccountToken.create({userId:purgeUser._id,token:crypto.randomUUID()});
    guestFixture = await seedGuestDeletionFixture({
      anonymousUser,
      purgeUser,
      survivorUser,
    });
    await UserNotification.insertMany([
      { userId: anonymousUser._id, title: "익명 보존 검증", message: "삭제되어야 하는 개인정보 알림" },
      { userId: purgeUser._id, title: "완전 삭제 검증", message: "삭제되어야 하는 개인정보 알림" },
    ]);
    await PdfWatermarkIssuance.insertMany([
      {
        issuanceId: `deleteverify-anonymous-${anonymousUser._id}`,
        documentIssueId: `DELETEVERIFY-ANONYMOUS-${anonymousUser._id}`,
        traceCode: `MTH-${String(anonymousUser._id).slice(0, 16).toUpperCase()}`,
        userId: anonymousUser._id,
        examId: "ACCOUNT-DELETION-VERIFY",
        sourceType: "ARCHIVE",
        sourceId: "ACCOUNT-DELETION-VERIFY",
        originalName: "anonymous.pdf",
        downloadedAt: new Date(),
        forensicPayloadHash: "a".repeat(64),
        status: "READY",
      },
      {
        issuanceId: `deleteverify-purge-${purgeUser._id}`,
        documentIssueId: `DELETEVERIFY-PURGE-${purgeUser._id}`,
        traceCode: `MTH-${String(purgeUser._id).slice(0, 15).toUpperCase()}P`,
        userId: purgeUser._id,
        examId: "ACCOUNT-DELETION-VERIFY",
        sourceType: "ARCHIVE",
        sourceId: "ACCOUNT-DELETION-VERIFY",
        originalName: "purge.pdf",
        downloadedAt: new Date(),
        forensicPayloadHash: "b".repeat(64),
        status: "READY",
      },
    ]);

    const anonymousResult = await withdrawUserAccount({
      userId: anonymousUser._id,
      initiatedBy: "admin",
      retainAnonymousData: true,
    });
    assert.equal(anonymousResult.dataRetention, "anonymous");
    const anonymized = await User.findById(anonymousUser._id)
      .select("name realName email accountStatus isActive withdrawal")
      .lean();
    assert.ok(anonymized, "익명 보존 계정이 사라졌습니다.");
    assert.equal(anonymized.name, "탈퇴회원");
    assert.equal(anonymized.realName, "");
    assert.match(anonymized.email, /^withdrawn\..+@anonymous\.invalid$/);
    assert.equal(anonymized.accountStatus, "withdrawn");
    assert.equal(anonymized.isActive, false);
    assert.equal(anonymized.withdrawal?.dataRetention, "anonymous");
    assert.equal(await UserNotification.countDocuments({ userId: anonymousUser._id }), 0);
    assert.equal(
      await PdfWatermarkIssuance.countDocuments({ userId: anonymousUser._id }),
      1,
      "익명 보존에서는 PDF 발급 기록이 익명 사용자 ID와 함께 유지되어야 합니다."
    );
    const anonymizedGuest = await ArenaGuestIdentity.findById(
      guestFixture.ids.anonymousIdentityId
    ).select("+claimSecretHash +birthDateHash").lean();
    assert.equal(anonymizedGuest.nickname, "탈퇴 참가자");
    assert.match(anonymizedGuest.nicknameNormalized, /^withdrawn-[a-f0-9]{20}$/);
    assert.equal(
      anonymizedGuest.claimedByUserId,
      undefined,
      "탈퇴한 계정의 게스트 소유자 필드는 null로 남기지 않고 제거해야 합니다."
    );
    assert.equal(anonymizedGuest.birthDateHash, undefined);
    assert.notEqual(anonymizedGuest.claimSecretHash, sha256(guestFixture.anonymousSecret));
    const anonymizedGuestAttempt = await ArenaGuestChallengeAttempt.findById(
      guestFixture.ids.anonymousGuestAttemptId
    ).lean();
    assert.equal(anonymizedGuestAttempt.status, "SETTLED");
    assert.equal(anonymizedGuestAttempt.claimedByUserId, null);
    assert.deepEqual(anonymizedGuestAttempt.evidenceFiles, []);
    assert.equal(
      (await ArenaGuestChallengeAttempt.findById(
        guestFixture.ids.activeAnonymousGuestAttemptId
      ).lean()).status,
      "ABANDONED",
      "탈퇴한 참가자의 진행 중 시도가 결과 공개를 계속 막고 있습니다."
    );
    assert.equal(
      await ArenaGuestSolutionBoard.countDocuments({
        _id: guestFixture.ids.anonymousBoardId,
      }),
      0,
      "탈퇴한 게스트의 격자 풀이 원본이 남았습니다."
    );
    assert.ok(
      await ArenaGuestChallenge.exists({ _id: guestFixture.ids.challengeId }),
      "claimed 참가자 탈퇴가 공유 도전장을 삭제했습니다."
    );
    assert.equal(
      await NicknameNamespace.countDocuments({ ownerId: anonymousUser._id }),
      0,
      "익명 탈퇴 계정의 공용 닉네임 예약이 남았습니다."
    );

    const purgeResult = await withdrawUserAccount({
      userId: purgeUser._id,
      initiatedBy: "admin",
      retainAnonymousData: false,
    });
    assert.equal(purgeResult.dataRetention, "purged");
    assert.equal(await User.countDocuments({ _id: purgeUser._id }), 0);
    assert.equal(await AppleCommerceAccountToken.countDocuments({userId:purgeUser._id}),0);
    assert.equal(await UserNotification.countDocuments({ userId: purgeUser._id }), 0);
    assert.equal(
      await PdfWatermarkIssuance.countDocuments({ userId: purgeUser._id }),
      0,
      "모든 데이터 삭제에서는 PDF 발급-사용자 매핑도 삭제되어야 합니다."
    );
    const preservedChallenge = await ArenaGuestChallenge.findById(
      guestFixture.ids.challengeId
    ).lean();
    assert.ok(preservedChallenge, "발신자 탈퇴가 공유 도전장을 삭제했습니다.");
    assert.equal(preservedChallenge.creatorUserId, null);
    assert.ok(preservedChallenge.creatorAnonymizedAt instanceof Date);
    assert.equal(
      await ArenaProblemPack.countDocuments({ _id: guestFixture.ids.problemPackId }),
      1,
      "공유 도전장이 참조하는 문제 팩이 발신자 탈퇴로 삭제되었습니다."
    );
    assert.equal(
      await ArenaMatchEvidence.countDocuments({ _id: guestFixture.ids.sourceEvidenceId }),
      0,
      "탈퇴 발신자의 업로드 원본이 남았습니다."
    );
    const survivorAttempt = await ArenaGuestChallengeAttempt.findById(
      guestFixture.ids.survivorGuestAttemptId
    ).lean();
    assert.equal(survivorAttempt.evidenceFiles.length, 1);
    assert.equal(
      await ArenaGuestSolutionBoard.countDocuments({
        _id: guestFixture.ids.survivorBoardId,
      }),
      1,
      "발신자/다른 참가자의 탈퇴가 무관한 참가자의 풀이판을 삭제했습니다."
    );
    assert.equal(
      await NicknameNamespace.countDocuments({ ownerId: purgeUser._id }),
      0,
      "완전 삭제 계정의 공용 닉네임 예약이 남았습니다."
    );

    const survivingPage = await getGuestChallengePageData({
      rawToken: guestFixture.rawToken,
      cookieHeader: `matths_arena_guest=${guestFixture.ids.survivorIdentityId}.${guestFixture.survivorSecret}`,
    });
    assert.equal(survivingPage.creatorName, "발신자");
    assert.equal(survivingPage.isGuest, true);
    assert.equal(survivingPage.leaderboard.visible, true);
    await ArenaGuestChallenge.updateOne(
      { _id: guestFixture.ids.challengeId },
      { $set: { expiresAt: new Date(Date.now() - 1) } }
    );
    const expiredSurvivingPage = await getGuestChallengePageData({
      rawToken: guestFixture.rawToken,
      cookieHeader: `matths_arena_guest=${guestFixture.ids.survivorIdentityId}.${guestFixture.survivorSecret}`,
    });
    assert.equal(
      expiredSurvivingPage.status,
      "EXPIRED",
      "발신자 익명화 뒤 만료 상태 저장이 creator 필수 검증에 막혔습니다."
    );
    assert.equal(expiredSurvivingPage.isGuest, true);
    await Promise.all([
      ArenaGuestIdentity.updateOne(
        { _id: guestFixture.ids.survivorIdentityId },
        { $set: { claimedByUserId: survivorUser._id, claimedAt: new Date() } }
      ),
      ArenaGuestChallengeAttempt.updateOne(
        { _id: guestFixture.ids.survivorGuestAttemptId },
        { $set: { claimedByUserId: survivorUser._id } }
      ),
    ]);
    const claimedSurvivingPage = await getClaimedGuestRecordPageData({
      attemptId: guestFixture.ids.survivorGuestAttemptId,
      userId: survivorUser._id,
    });
    assert.equal(claimedSurvivingPage.creatorName, "발신자");
    assert.equal(claimedSurvivingPage.guestNickname, "남은게스트");

    console.log(JSON.stringify({
      ok: true,
      anonymousRetention: true,
      personalNotificationsRemoved: true,
      anonymousPdfIssuanceRetained: true,
      purgedPdfIssuanceRemoved: true,
      fullPurge: true,
      guestIdentityAnonymized: true,
      guestUploadsRemoved: true,
      sharedChallengePreserved: true,
      unrelatedGuestRecordPreserved: true,
    }));
  } finally {
    if (guestFixture?.ids) {
      const fixture = guestFixture.ids;
      await Promise.all([
        ArenaGuestSolutionBoard.deleteMany({
          _id: { $in: [fixture.anonymousBoardId, fixture.survivorBoardId].filter(Boolean) },
        }),
        ArenaGuestChallengeAttempt.deleteMany({
          _id: {
            $in: [
              fixture.anonymousGuestAttemptId,
              fixture.activeAnonymousGuestAttemptId,
              fixture.survivorGuestAttemptId,
            ].filter(Boolean),
          },
        }),
        ArenaGuestChallenge.deleteMany({ _id: fixture.challengeId }),
        ArenaGuestIdentity.deleteMany({
          _id: { $in: [fixture.anonymousIdentityId, fixture.survivorIdentityId].filter(Boolean) },
        }),
        ArenaMatchEvidence.deleteMany({ _id: fixture.sourceEvidenceId }),
        ArenaMatchAttempt.deleteMany({ _id: fixture.sourceAttemptId }),
        ArenaMatch.deleteMany({ _id: fixture.sourceMatchId }),
        ArenaProblemPack.deleteMany({ _id: fixture.problemPackId }),
      ]);
    }
    const remainingIds = [anonymousUser?._id, purgeUser?._id, survivorUser?._id].filter(Boolean);
    if (remainingIds.length) {
      await UserNotification.deleteMany({ userId: { $in: remainingIds } });
      await PdfWatermarkIssuance.deleteMany({ userId: { $in: remainingIds } });
      await NicknameNamespace.deleteMany({ ownerId: { $in: remainingIds } });
      await User.deleteMany({ _id: { $in: remainingIds } });
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
