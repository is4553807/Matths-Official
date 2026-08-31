const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  AppleCommerceAccountToken,
} = require("../models/goatArenaModel");
const {
  issueAppleCommerceAccountToken,
} = require("../services/appleCommerceAccountTokenService");

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const token = "c39cf708-5c2d-4c3f-a3e5-4fdd0104f9a2";

  try {
    await AppleCommerceAccountToken.deleteMany({ token });
    await AppleCommerceAccountToken.createIndexes();

    const outcomes = await Promise.allSettled([
      issueAppleCommerceAccountToken({ userId: userA, proposedToken: token }),
      issueAppleCommerceAccountToken({ userId: userB, proposedToken: token }),
    ]);
    assert.equal(
      outcomes.filter((entry) => entry.status === "fulfilled").length,
      1,
      "동시 선점에서 정확히 한 사용자만 성공해야 합니다."
    );
    const rejected = outcomes.find((entry) => entry.status === "rejected");
    assert.equal(rejected?.reason?.code, "APPLE_APP_ACCOUNT_OWNER_CONFLICT");

    const row = await AppleCommerceAccountToken.findOne({ token }).lean();
    assert.ok(row);
    const winner = String(row.userId);
    const replay = await issueAppleCommerceAccountToken({
      userId: winner,
      proposedToken: token,
    });
    assert.equal(replay.token, token, "승자의 재등록은 멱등이어야 합니다.");
    assert.equal(await AppleCommerceAccountToken.countDocuments({ token }), 1);

    console.log("Apple commerce account-token isolated DB concurrency passed");
  } finally {
    await AppleCommerceAccountToken.deleteMany({ token });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
