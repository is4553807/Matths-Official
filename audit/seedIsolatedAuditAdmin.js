const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const { User } = require("../models/matthsModel");

async function main() {
  if (String(process.env.DB || "").includes("matths_audit_zero_assumption_20260815") === false) {
    throw new Error("격리된 감사 DB에서만 관리자 시드를 실행할 수 있습니다.");
  }
  const password = String(process.env.TEST_ACCOUNT_PASSWORD || "");
  if (password.length < 12) throw new Error("감사 계정 비밀번호가 너무 짧습니다.");

  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const account = await User.findOneAndUpdate(
      { email: "audit-admin@local.test" },
      {
        $set: {
          name: "auditadmin",
          nameNormalized: "auditadmin",
          realName: "격리감사관리자",
          passwordHash,
          role: "admin",
          isTestAccount: false,
          testBatchKey: "ISOLATED-ZERO-ASSUMPTION-AUDIT-20260815",
          schoolGrade: 15,
          learnerType: "WORKER",
          educationStatus: "enrolled",
          termsAcceptedAt: new Date(),
          termsVersion: "2026-08-15-audit",
          privacyVersion: "2026-08-15-audit",
          isActive: true,
          accountStatus: "active",
          accountStatusReason: "",
          suspendedUntil: null,
        },
        $setOnInsert: { email: "audit-admin@local.test" },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
    console.log(JSON.stringify({
      ok: true,
      database: mongoose.connection.name,
      username: account.name,
      role: account.role,
    }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
