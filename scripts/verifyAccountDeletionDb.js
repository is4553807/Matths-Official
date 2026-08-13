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
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const {
  withdrawUserAccount,
} = require("../services/accountDeletionService");

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

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);
  let anonymousUser;
  let purgeUser;
  try {
    anonymousUser = await createTemporaryUser("a");
    purgeUser = await createTemporaryUser("p");
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

    const purgeResult = await withdrawUserAccount({
      userId: purgeUser._id,
      initiatedBy: "admin",
      retainAnonymousData: false,
    });
    assert.equal(purgeResult.dataRetention, "purged");
    assert.equal(await User.countDocuments({ _id: purgeUser._id }), 0);
    assert.equal(await UserNotification.countDocuments({ userId: purgeUser._id }), 0);
    assert.equal(
      await PdfWatermarkIssuance.countDocuments({ userId: purgeUser._id }),
      0,
      "모든 데이터 삭제에서는 PDF 발급-사용자 매핑도 삭제되어야 합니다."
    );

    console.log(JSON.stringify({
      ok: true,
      anonymousRetention: true,
      personalNotificationsRemoved: true,
      anonymousPdfIssuanceRetained: true,
      purgedPdfIssuanceRemoved: true,
      fullPurge: true,
    }));
  } finally {
    const remainingIds = [anonymousUser?._id, purgeUser?._id].filter(Boolean);
    if (remainingIds.length) {
      await UserNotification.deleteMany({ userId: { $in: remainingIds } });
      await PdfWatermarkIssuance.deleteMany({ userId: { $in: remainingIds } });
      await User.deleteMany({ _id: { $in: remainingIds } });
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
