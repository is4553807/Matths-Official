const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const { withdrawUserAccount } = require("../services/accountDeletionService");

const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes("--confirm=DELETE_LEGACY_INTEGRITY_TESTS");
const FILTER = {
  role: "test",
  name: /^integrity-[cd]-\d+-[a-f0-9]{12}$/,
  email: /^integrity-[cd]-\d+-[a-f0-9]{12}@example\.com$/,
};

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 15_000 });
  try {
    const users = await User.find(FILTER).select("_id name email role").lean();
    console.log(JSON.stringify({ apply: APPLY, count: users.length, users }, null, 2));
    if (!APPLY) return;
    if (!CONFIRMED) throw new Error("삭제 확인 문자열이 필요합니다.");
    for (const user of users) {
      await withdrawUserAccount({
        userId: user._id,
        initiatedBy: "legacy-integrity-test-cleanup",
        retainAnonymousData: false,
      });
    }
    console.log(JSON.stringify({ removed: users.length, remaining: await User.countDocuments(FILTER) }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
