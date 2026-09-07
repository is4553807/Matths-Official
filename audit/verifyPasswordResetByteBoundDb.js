const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { User, PasswordResetCode } = require("../models/matthsModel");
const { resetPassword } = require("../services/passwordResetService");
const userId = new mongoose.Types.ObjectId();
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  try {
    await User.create({ _id: userId, name: "비밀번호경계검증", email: `${userId}@example.test`, passwordHash: "audit-only", role: "student" });
    for (const password of ["A1" + "x".repeat(71), "A1" + "가".repeat(24)]) {
      await assert.rejects(() => resetPassword({ resetId: new mongoose.Types.ObjectId(), userId,
        password, passwordConfirm: password }), { status: 400, code: "PASSWORD_TOO_LONG" });
    }
    for (const password of ["short1", "12345678", "abcdefgh"]) {
      await assert.rejects(() => resetPassword({ resetId: new mongoose.Types.ObjectId(), userId,
        password, passwordConfirm: password }), { status: 400 });
    }
    let version = 0;
    for (const password of ["A1" + "x".repeat(70), "A1" + "가".repeat(23) + "x", "Original123!"]) {
      const reset = await PasswordResetCode.create({ userId, mode: "code", status: "verified", codeHash: "audit-only",
        verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60000) });
      await assert.rejects(() => resetPassword({ resetId: reset._id, userId, password, passwordConfirm: password + "!" }), { status: 400 });
      const result = await resetPassword({ resetId: reset._id, userId, password, passwordConfirm: password });
      assert.equal(result.reset, true);
      const account = await User.findById(userId).select("+passwordHash tokenVersion");
      assert.equal(await bcrypt.compare(password, account.passwordHash), true);
      assert.equal(account.tokenVersion, ++version);
      assert.equal((await PasswordResetCode.findById(reset._id)).status, "used");
    }
    console.log("Password reset Mongo service tests PASS: ASCII and multibyte UTF-8 72-byte boundary, 73/74-byte rejection, unchanged normal rules, confirmation, bcrypt hash, session version, code consumed.");
  } finally {
    await PasswordResetCode.deleteMany({ userId });
    await User.deleteOne({ _id: userId });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
