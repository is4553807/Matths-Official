const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  ArenaMatch,
} = require("../models/goatArenaModel");
const {
  loadSubDefenseFairnessHistory,
} = require("../services/arenaMatchService");

const MATCH_KEY_PREFIX =
  "audit-sub-defense-fairness-";

function fairnessMatch({
  suffix,
  defenderUserId,
  matchType = "NORMAL",
  status = "SETTLED",
  requestedAt,
}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    matchKey: `${MATCH_KEY_PREFIX}${suffix}`,
    division: "SUB",
    matchType,
    status,
    defender: { userId: defenderUserId },
    requestedAt,
    settledAt:
      status === "SETTLED" ? requestedAt : null,
  };
}

async function run() {
  if (!process.env.DB) {
    throw new Error("격리 감사 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  const now = new Date("2026-08-15T12:00:00+09:00");
  const boundary =
    new Date("2026-08-12T12:00:00+09:00");
  const defenderA = new mongoose.Types.ObjectId();
  const defenderB = new mongoose.Types.ObjectId();
  const defenderC = new mongoose.Types.ObjectId();
  const defenderNoHistory =
    new mongoose.Types.ObjectId();

  try {
    await ArenaMatch.deleteMany({
      matchKey: { $regex: `^${MATCH_KEY_PREFIX}` },
    });
    await ArenaMatch.syncIndexes();
    await ArenaMatch.collection.insertMany([
      fairnessMatch({
        suffix: "a-boundary",
        defenderUserId: defenderA,
        requestedAt: boundary,
      }),
      fairnessMatch({
        suffix: "a-now",
        defenderUserId: defenderA,
        status: "REQUESTED",
        requestedAt: now,
      }),
      fairnessMatch({
        suffix: "a-before-boundary",
        defenderUserId: defenderA,
        requestedAt:
          new Date("2026-08-12T11:59:59+09:00"),
      }),
      fairnessMatch({
        suffix: "a-revenge-excluded",
        defenderUserId: defenderA,
        matchType: "REVENGE",
        requestedAt:
          new Date("2026-08-14T18:00:00+09:00"),
      }),
      fairnessMatch({
        suffix: "a-cancelled-excluded",
        defenderUserId: defenderA,
        status: "CANCELLED",
        requestedAt:
          new Date("2026-08-14T19:00:00+09:00"),
      }),
      fairnessMatch({
        suffix: "b-recent",
        defenderUserId: defenderB,
        status: "IN_PROGRESS",
        requestedAt:
          new Date("2026-08-13T09:00:00+09:00"),
      }),
      fairnessMatch({
        suffix: "b-old",
        defenderUserId: defenderB,
        requestedAt:
          new Date("2026-08-01T09:00:00+09:00"),
      }),
      fairnessMatch({
        suffix: "c-invalid-excluded",
        defenderUserId: defenderC,
        status: "INVALID",
        requestedAt:
          new Date("2026-08-14T09:00:00+09:00"),
      }),
    ]);

    const history =
      await loadSubDefenseFairnessHistory({
        userIds: [
          defenderA,
          defenderB,
          defenderC,
          defenderNoHistory,
        ],
        now,
      });

    assert.deepEqual(history.get(String(defenderA)), {
      recentDefenseCount72h: 2,
      lastDefenseAssignedAt: now,
      lastDefenseSettledAt: boundary,
    });
    assert.deepEqual(history.get(String(defenderB)), {
      recentDefenseCount72h: 1,
      lastDefenseAssignedAt:
        new Date("2026-08-13T09:00:00+09:00"),
      lastDefenseSettledAt:
        new Date("2026-08-01T09:00:00+09:00"),
    });
    assert.deepEqual(history.get(String(defenderC)), {
      recentDefenseCount72h: 0,
      lastDefenseAssignedAt: null,
      lastDefenseSettledAt: null,
    });
    assert.deepEqual(
      history.get(String(defenderNoHistory)),
      {
        recentDefenseCount72h: 0,
        lastDefenseAssignedAt: null,
        lastDefenseSettledAt: null,
      }
    );

    const indexes = await ArenaMatch.collection.indexes();
    assert.ok(
      indexes.some((index) =>
        index.key?.division === 1 &&
        index.key?.matchType === 1 &&
        index.key?.["defender.userId"] === 1 &&
        index.key?.requestedAt === -1
      ),
      "운영 집계를 위한 복합 인덱스가 실제 DB에도 생성되어야 합니다."
    );

    console.log(
      "Unranked 72-hour defense fairness DB verification passed."
    );
  } finally {
    await ArenaMatch.deleteMany({
      matchKey: { $regex: `^${MATCH_KEY_PREFIX}` },
    }).catch(() => {});
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) {
    await mongoose.disconnect();
  }
  process.exitCode = 1;
});
