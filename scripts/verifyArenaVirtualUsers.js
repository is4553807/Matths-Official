const assert = require("node:assert/strict");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaStanding,
} = require("../models/goatArenaModel");

const TEST_BATCH_KEY = "GOAT-ARENA-VIRTUAL-USERS-20260808";

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const users = await User.find({
      isTestAccount: true,
      testBatchKey: TEST_BATCH_KEY,
    })
      .select("_id name nameNormalized email passwordHash isActive accountStatus")
      .lean();
    const userIds = users.map((user) => user._id);
    assert.equal(users.length, 200, `가상 유저는 200명이어야 합니다. 현재 ${users.length}명`);
    assert.equal(new Set(users.map((user) => user.nameNormalized)).size, 200, "닉네임이 중복되었습니다.");
    assert.equal(new Set(users.map((user) => user.email)).size, 200, "이메일이 중복되었습니다.");
    assert.ok(users.every((user) => user.isActive !== false && user.accountStatus === "active"), "비활성 가상 유저가 있습니다.");

    const [divisionCounts, cycleCount, accessCount] = await Promise.all([
      ArenaStanding.aggregate([
        { $match: { userId: { $in: userIds }, status: "ACTIVE" } },
        { $group: { _id: "$division", count: { $sum: 1 } } },
      ]),
      AccessCycle.countDocuments({ userId: { $in: userIds }, status: "ACTIVE" }),
      ArenaAccessState.countDocuments({ userId: { $in: userIds }, state: "PAID_ACTIVE" }),
    ]);
    const byDivision = Object.fromEntries(divisionCounts.map((row) => [row._id, row.count]));
    assert.equal(byDivision.SUB, 100, `Unranked 가상 유저가 100명이어야 합니다. 현재 ${byDivision.SUB || 0}명`);
    assert.equal(byDivision.MAIN, 100, `Ranked 가상 유저가 100명이어야 합니다. 현재 ${byDivision.MAIN || 0}명`);
    assert.equal(cycleCount, 200, `활성 이용 주기가 200개여야 합니다. 현재 ${cycleCount}개`);
    assert.equal(accessCount, 200, `활성 Arena 접근 상태가 200개여야 합니다. 현재 ${accessCount}개`);

    console.log(JSON.stringify({
      ok: true,
      batchKey: TEST_BATCH_KEY,
      users: users.length,
      divisions: { unranked: byDivision.SUB, ranked: byDivision.MAIN },
      activeCycles: cycleCount,
      activeAccessStates: accessCount,
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
