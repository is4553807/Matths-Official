const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const {
  getPaybackAccountSummary,
  saveConfirmedPaybackAccount,
} = require("../services/paybackAccountService");

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  assert.ok(
    process.env.PAYBACK_ACCOUNT_ENCRYPTION_KEY,
    "격리 감사용 계좌 암호화 키가 필요합니다."
  );
  await mongoose.connect(process.env.DB);
  let userId;
  try {
    const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
    const user = await User.create({
      name: `paybackaudit${suffix}`.slice(0, 30),
      nameNormalized: `paybackaudit${suffix}`.slice(0, 30),
      realName: "계좌감사",
      email: `payback-account-audit-${suffix}@test.invalid`,
      passwordHash: "isolated-audit-password-hash",
      role: "student",
      isTestAccount: true,
      testBatchKey: "IPAD-PAYBACK-ACCOUNT-MEMORY-AUDIT",
      learnerType: "WORKER",
      schoolGrade: 15,
      educationStatus: "enrolled",
      accountStatus: "active",
      isActive: true,
    });
    userId = user._id;
    const rawAccountNumber = "123456782195";
    const accountHolderName = "계좌감사";

    const saved = await saveConfirmedPaybackAccount(userId, {
      bankName: "토스뱅크",
      accountHolderName,
      accountNumber: rawAccountNumber,
    });
    assert.deepEqual(
      Object.keys(saved).sort(),
      ["bankName", "confirmed", "confirmedAt", "last4"].sort()
    );
    assert.equal(saved.confirmed, true);
    assert.equal(saved.last4, "2195");

    const stored = await User.findById(userId)
      .select(
        "+paybackAccount.accountHolderName " +
        "+paybackAccount.accountNumberEncrypted " +
        "+paybackAccount.accountNumberIv " +
        "+paybackAccount.accountNumberTag"
      )
      .lean();
    assert.ok(stored.paybackAccount.accountNumberEncrypted);
    assert.ok(stored.paybackAccount.accountNumberIv);
    assert.ok(stored.paybackAccount.accountNumberTag);
    assert.notEqual(
      stored.paybackAccount.accountNumberEncrypted,
      rawAccountNumber,
      "계좌번호 원문이 암호문 필드에 저장되면 안 됩니다."
    );
    assert.equal(stored.paybackAccount.accountNumberLast4, "2195");
    assert.equal(stored.paybackAccount.accountHolderName, accountHolderName);
    assert.equal(JSON.stringify(stored).includes(rawAccountNumber), false);

    const summary = await getPaybackAccountSummary(userId);
    assert.deepEqual(
      Object.keys(summary).sort(),
      ["bankName", "confirmed", "confirmedAt", "last4"].sort()
    );
    assert.equal("accountHolderName" in summary, false);
    assert.equal("accountNumber" in summary, false);

    console.log(
      "iPad payback account DB verification passed: encrypted-at-rest account " +
      "number, masked read model, and no raw account data in API summary."
    );
  } finally {
    if (userId) await User.deleteOne({ _id: userId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
