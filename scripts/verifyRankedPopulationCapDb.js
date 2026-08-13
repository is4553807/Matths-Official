const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
require("dotenv").config({ path: "./config.env" });

const {
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  rebalanceArenaCohortInTransaction,
} = require("../services/arenaStandingService");

function testStanding({ index, seasonKey, createdAt }) {
  return {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    division: "MAIN",
    seasonKey,
    competitivePool: "ALL",
    arenaRank: "챌린저",
    qualifiedArenaRank: "챌린저",
    arenaPosition: index + 1,
    arenaGp: 99,
    status: "ACTIVE",
    reachedCurrentGpAt: new Date(createdAt.getTime() + index * 1000),
  };
}

async function activeRows(seasonKey, session) {
  return ArenaStanding.find({
    seasonKey,
    division: "MAIN",
    status: "ACTIVE",
  })
    .sort({ reachedCurrentGpAt: 1, _id: 1 })
    .session(session)
    .lean();
}

async function rebalance(seasonKey, session) {
  return rebalanceArenaCohortInTransaction({
    session,
    seasonKey,
    division: "MAIN",
    now: new Date(),
  });
}

async function main() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB);
  const session = await mongoose.startSession();
  const seasonKey = `E2E-RANKED-CAP-${randomUUID()}`;
  const createdAt = new Date("2026-08-14T00:00:00.000Z");
  const candidates = Array.from({ length: 100 }, (_, index) =>
    testStanding({ index, seasonKey, createdAt })
  );
  try {
    session.startTransaction();
    await ArenaStanding.insertMany(candidates.slice(0, 99), { session });
    await rebalance(seasonKey, session);

    let rows = await activeRows(seasonKey, session);
    assert.equal(rows.length, 99);
    assert.ok(rows.every((row) => row.arenaRank === "마스터"));
    assert.ok(rows.every((row) => row.qualifiedArenaRank === "챌린저"));

    await ArenaStanding.create([candidates[99]], { session });
    await rebalance(seasonKey, session);
    rows = await activeRows(seasonKey, session);
    assert.equal(rows.length, 100);
    assert.equal(rows[0].arenaRank, "챌린저");
    assert.equal(String(rows[0]._id), String(candidates[0]._id));
    assert.equal(rows[0].qualifiedArenaRank, "챌린저");

    await ArenaStanding.deleteOne({ _id: candidates[99]._id }, { session });
    await rebalance(seasonKey, session);
    rows = await activeRows(seasonKey, session);
    assert.equal(rows.length, 99);
    assert.ok(rows.every((row) => row.arenaRank === "마스터"));
    assert.ok(rows.every((row) => row.qualifiedArenaRank === "챌린저"));

    await ArenaStanding.create([candidates[99]], { session });
    await rebalance(seasonKey, session);
    rows = await activeRows(seasonKey, session);
    assert.equal(rows.length, 100);
    assert.equal(rows[0].arenaRank, "챌린저");
    assert.equal(String(rows[0]._id), String(candidates[0]._id));

    await session.abortTransaction();
    console.log(
      "Ranked population cap DB transition verified: 99→100→99→100, qualified tier preserved, transaction rolled back."
    );
  } finally {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    await session.endSession();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
