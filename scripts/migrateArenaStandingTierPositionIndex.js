const dotenv = require("dotenv");
const mongoose = require("mongoose");
const {
  ArenaStanding,
} = require("../models/goatArenaModel");

dotenv.config({ path: "./config.env" });

const LEGACY_KEY = {
  division: 1,
  seasonKey: 1,
  arenaPosition: 1,
};
const CURRENT_KEY = {
  division: 1,
  seasonKey: 1,
  arenaRank: 1,
  arenaPosition: 1,
};
const CURRENT_INDEX_NAME =
  "division_1_seasonKey_1_arenaRank_1_arenaPosition_1";
const CURRENT_PARTIAL_FILTER = {
  status: "ACTIVE",
};

function sameKey(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function run() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 10000,
  });
  try {
    const collection = ArenaStanding.collection;
    const indexes = await collection.indexes();
    const legacy = indexes.find((index) => sameKey(index.key, LEGACY_KEY));
    const duplicates = await ArenaStanding.aggregate([
      { $match: CURRENT_PARTIAL_FILTER },
      {
        $group: {
          _id: {
            division: "$division",
            seasonKey: "$seasonKey",
            arenaRank: "$arenaRank",
            arenaPosition: "$arenaPosition",
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]);
    if (duplicates.length) {
      throw new Error(
        "티어 안에서 중복된 순위가 있어 인덱스를 교체할 수 없습니다."
      );
    }
    if (legacy) {
      await collection.dropIndex(legacy.name);
    }
    const refreshed = await collection.indexes();
    const current = refreshed.find((index) => sameKey(index.key, CURRENT_KEY));
    const currentIsValid = Boolean(
      current &&
        current.unique === true &&
        sameKey(current.partialFilterExpression, CURRENT_PARTIAL_FILTER)
    );
    if (current && !currentIsValid) {
      await collection.dropIndex(current.name);
    }
    const afterDrop = await collection.indexes();
    if (!afterDrop.some((index) => sameKey(index.key, CURRENT_KEY))) {
      await collection.createIndex(CURRENT_KEY, {
        name: CURRENT_INDEX_NAME,
        unique: true,
        partialFilterExpression: CURRENT_PARTIAL_FILTER,
      });
    }
    console.log(
      JSON.stringify({
        ok: true,
        database: mongoose.connection.name,
        legacyIndexRemoved: Boolean(legacy),
        currentIndex: CURRENT_INDEX_NAME,
        activeOnly: true,
        standingCount: await ArenaStanding.countDocuments({}),
      })
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
