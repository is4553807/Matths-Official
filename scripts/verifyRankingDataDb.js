const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const { ArenaCompetitiveProfile } = require("../models/goatArenaModel");
const { getRankingData } = require("../services/rankingService");

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);

  const profiles = await ArenaCompetitiveProfile.find({
    placementFinalizedAt: { $ne: null },
    competitiveScore: { $ne: null },
  })
    .select("userId competitiveScore tier")
    .lean();
  const users = await User.find({
    _id: { $in: profiles.map((profile) => profile.userId) },
    isActive: true,
    accountStatus: "active",
  })
    .select("_id")
    .lean();
  const realUserIds = new Set(users.map((user) => String(user._id)));
  const expected = profiles.filter((profile) =>
    realUserIds.has(String(profile.userId))
  ).length;
  const currentUserId = users[0]?._id || null;
  const ranking = await getRankingData(currentUserId);

  assert.equal(ranking.pools.sub.cohortSize, 0);
  assert.equal(ranking.pools.main.cohortSize, expected);
  const displayed = [
    ...ranking.pools.sub.tierBoards.flatMap((board) => board.entries),
    ...ranking.pools.main.tierBoards.flatMap((board) => board.entries),
  ];
  assert.ok(displayed.every((entry) => realUserIds.has(String(entry.userId))));
  assert.ok(displayed.every((entry) => !/데이터\s*연결\s*대기/.test(entry.displayName || "")));

  console.log(
    `Competitive ranking DB verification passed: Ranked=${expected}, Final=${ranking.finalOverall.length}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
