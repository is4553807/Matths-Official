const dotenv = require("dotenv");
const mongoose = require("mongoose");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaStanding,
  MainInvitationRequest,
} = require("../models/goatArenaModel");
const {
  computeArenaCohortLayout,
} = require("../services/arenaStandingService");

dotenv.config({ path: "./config.env" });

async function bulkWriteInBatches(collection, operations, size = 300) {
  let affected = 0;
  for (let offset = 0; offset < operations.length; offset += size) {
    const result = await collection.bulkWrite(
      operations.slice(offset, offset + size),
      { ordered: true }
    );
    affected += Number(result.modifiedCount || 0);
  }
  return affected;
}

function groupBySeason(standings) {
  const groups = new Map();
  for (const standing of standings) {
    const key = String(standing.seasonKey || "");
    groups.set(key, [...(groups.get(key) || []), standing]);
  }
  return groups;
}

function temporaryPositionByStanding(standings) {
  const counters = new Map();
  const result = new Map();
  for (const standing of standings) {
    const tier = String(standing.arenaRank || "UNRANKED");
    const next = Number(counters.get(tier) || 0) + 1;
    counters.set(tier, next);
    result.set(String(standing._id), 1_000_000 + next);
  }
  return result;
}

async function run() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }

  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10000 });
  try {
    const standingCollection = ArenaStanding.collection;
    const mainStandings = await standingCollection
      .find({ division: "MAIN" })
      .toArray();
    const activeStandings = mainStandings.filter(
      (standing) => standing.status === "ACTIVE"
    );
    const migrationPool = `MIGRATING_${Date.now()}`;
    const temporaryPosition = temporaryPositionByStanding(activeStandings);

    /*
     * 기존 소속별 순위 위치가 겹칠 수 있으므로, 먼저 서로 겹치지 않는 임시
     * 위치로 모두 옮긴 뒤 통합 순위를 계산한다. 이 순서가 없으면 고유 인덱스
     * 때문에 고등학생·대학생 등 이전 풀의 같은 n위가 충돌할 수 있다.
     */
    const temporaryOperations = activeStandings.map((standing) => ({
      updateOne: {
        filter: { _id: standing._id, status: "ACTIVE" },
        update: {
          $set: {
            competitivePool: migrationPool,
            arenaPosition: temporaryPosition.get(String(standing._id)),
          },
        },
      },
    }));
    const temporaryUpdates = await bulkWriteInBatches(
      standingCollection,
      temporaryOperations
    );

    const finalOperations = [];
    for (const standings of groupBySeason(activeStandings).values()) {
      const layoutById = new Map(
        computeArenaCohortLayout(standings).map((entry) => [
          String(entry._id),
          entry,
        ])
      );
      for (const standing of standings) {
        const layout = layoutById.get(String(standing._id));
        finalOperations.push({
          updateOne: {
            filter: { _id: standing._id, status: "ACTIVE" },
            update: {
              $set: {
                competitivePool: "ALL",
                arenaRank: layout.arenaRank,
                arenaPosition: layout.arenaPosition,
              },
            },
          },
        });
      }
    }
    const finalUpdates = await bulkWriteInBatches(
      standingCollection,
      finalOperations
    );
    const inactiveUpdates = await standingCollection.updateMany(
      { division: "MAIN", status: { $ne: "ACTIVE" } },
      { $set: { competitivePool: "ALL" } }
    );

    const accessUpdates = await ArenaAccessState.collection.updateMany(
      { currentCompetitiveDivision: "MAIN" },
      { $set: { mainCompetitivePool: "ALL" } }
    );
    const matchUpdates = await ArenaMatch.collection.updateMany(
      { division: "MAIN" },
      { $set: { competitivePool: "ALL" } }
    );
    const invitationUpdates = await MainInvitationRequest.collection.updateMany(
      {},
      { $set: { competitivePool: "ALL" } }
    );

    console.log(
      JSON.stringify({
        ok: true,
        database: mongoose.connection.name,
        mainStandingCount: mainStandings.length,
        activeStandingCount: activeStandings.length,
        temporaryUpdates,
        finalUpdates,
        inactiveUpdates: Number(inactiveUpdates.modifiedCount || 0),
        accessUpdates: Number(accessUpdates.modifiedCount || 0),
        matchUpdates: Number(matchUpdates.modifiedCount || 0),
        invitationUpdates: Number(invitationUpdates.modifiedCount || 0),
        positionIndex: "competitivePool is retained as a stable ALL key",
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
