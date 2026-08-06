const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const { ArenaStanding } = require("../models/goatArenaModel");
const { getRankingData } = require("../services/rankingService");

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);

  const standings = await ArenaStanding.find({ status: "ACTIVE" })
    .select("userId division")
    .lean();
  const users = await User.find({
    _id: { $in: standings.map((standing) => standing.userId) },
    isActive: true,
    accountStatus: "active",
  })
    .select("_id")
    .lean();
  const realUserIds = new Set(users.map((user) => String(user._id)));
  const expected = standings.reduce(
    (counts, standing) => {
      if (realUserIds.has(String(standing.userId))) {
        counts[standing.division] = (counts[standing.division] || 0) + 1;
      }
      return counts;
    },
    { SUB: 0, MAIN: 0 }
  );
  const currentUserId = users[0]?._id || null;
  const ranking = await getRankingData(currentUserId);

  assert.equal(ranking.pools.sub.cohortSize, expected.SUB);
  assert.equal(ranking.pools.main.cohortSize, expected.MAIN);
  const displayed = [
    ...ranking.pools.sub.tierBoards.flatMap((board) => board.entries),
    ...ranking.pools.main.tierBoards.flatMap((board) => board.entries),
  ];
  assert.ok(displayed.every((entry) => realUserIds.has(String(entry.userId))));
  assert.ok(displayed.every((entry) => !/데이터\s*연결\s*대기/.test(entry.displayName || "")));

  console.log(
    `Ranking DB verification passed: Unranked=${expected.SUB}, Ranked=${expected.MAIN}, Final=${ranking.finalOverall.length}`
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
