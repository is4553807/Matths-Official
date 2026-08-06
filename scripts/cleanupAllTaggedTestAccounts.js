const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const {
  withdrawUserAccount,
} = require("../services/accountDeletionService");

const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes("--confirm=DELETE_TEST_ACCOUNTS_ONLY");

async function main() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }

  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  try {
    const users = await User.find({
      $or: [
        { isTestAccount: true },
        {
          role: "test",
          name: /^integrity-[cd]-\d+-[a-f0-9]{12}$/,
          email: /^integrity-[cd]-\d+-[a-f0-9]{12}@example\.com$/,
        },
      ],
    })
      .select("_id name email role testBatchKey accountStatus")
      .sort({ testBatchKey: 1, name: 1 })
      .lean();
    const adminLike = users.filter((user) => user.role === "admin");
    if (adminLike.length) {
      throw new Error(
        `테스트 플래그가 붙은 관리자 계정 ${adminLike.length}개가 있어 삭제를 중단했습니다.`
      );
    }

    const batches = users.reduce((result, user) => {
      const key = String(user.testBatchKey || "UNSPECIFIED");
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    const preview = {
      apply: APPLY,
      database: mongoose.connection.name,
      total: users.length,
      batches,
      sample: users.slice(0, 10).map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        testBatchKey: user.testBatchKey || "",
      })),
    };

    if (!APPLY) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }
    if (!CONFIRMED) {
      throw new Error(
        "실행하려면 --confirm=DELETE_TEST_ACCOUNTS_ONLY를 함께 지정해야 합니다."
      );
    }

    let removed = 0;
    const failures = [];
    let cursor = 0;
    const workerCount = Math.min(6, users.length);
    async function worker() {
      while (cursor < users.length) {
        const user = users[cursor];
        cursor += 1;
        try {
          await withdrawUserAccount({
            userId: user._id,
            initiatedBy: "tagged-test-account-cleanup",
            retainAnonymousData: false,
          });
          removed += 1;
        } catch (error) {
          failures.push({
            id: String(user._id),
            name: user.name,
            message: error.message,
          });
        }
      }
    }
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const remaining = await User.countDocuments({
      $or: [
        { isTestAccount: true },
        {
          role: "test",
          name: /^integrity-[cd]-\d+-[a-f0-9]{12}$/,
          email: /^integrity-[cd]-\d+-[a-f0-9]{12}@example\.com$/,
        },
      ],
    });
    console.log(JSON.stringify({
      ...preview,
      removed,
      remaining,
      failures,
    }, null, 2));
    if (failures.length || remaining) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
