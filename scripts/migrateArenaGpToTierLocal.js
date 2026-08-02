const dotenv = require("dotenv");
const mongoose = require("mongoose");
const {
  ArenaMatch,
  ArenaSnapshot,
  ArenaStanding,
  ArenaStandingChangeLedger,
  RenewalRankAssessment,
} = require("../models/goatArenaModel");
const {
  arenaTierByValue,
  localGpFromLegacyGp,
} = require("../services/arenaTierPolicy");

dotenv.config({ path: "./config.env" });

const GP_SCALE_VERSION = "TIER_LOCAL_0_99_V1";
const APPLY = process.argv.includes("--apply");

function convertedTuple(tuple) {
  if (!tuple || tuple.gpScaleVersion === GP_SCALE_VERSION) return tuple;
  const tier = arenaTierByValue(tuple.arenaRank);
  return {
    ...tuple,
    arenaRank: tier.label,
    arenaGp: localGpFromLegacyGp(tuple.arenaGp, tier.code),
    gpScaleVersion: GP_SCALE_VERSION,
  };
}

async function standingOperations() {
  const documents = await ArenaStanding.collection
    .find({ gpScaleVersion: { $ne: GP_SCALE_VERSION } })
    .project({ arenaRank: 1, arenaGp: 1 })
    .toArray();
  return documents.map((standing) => {
    const tier = arenaTierByValue(standing.arenaRank);
    return {
      updateOne: {
        filter: {
          _id: standing._id,
          gpScaleVersion: { $ne: GP_SCALE_VERSION },
        },
        update: {
          $set: {
            arenaRank: tier.label,
            arenaGp: localGpFromLegacyGp(standing.arenaGp, tier.code),
            gpScaleVersion: GP_SCALE_VERSION,
          },
        },
      },
    };
  });
}

async function snapshotOperations() {
  const documents = await ArenaSnapshot.collection
    .find({ "arenaTuple.gpScaleVersion": { $ne: GP_SCALE_VERSION } })
    .project({ arenaTuple: 1 })
    .toArray();
  return documents.map((snapshot) => ({
    updateOne: {
      filter: {
        _id: snapshot._id,
        "arenaTuple.gpScaleVersion": { $ne: GP_SCALE_VERSION },
      },
      update: { $set: { arenaTuple: convertedTuple(snapshot.arenaTuple) } },
    },
  }));
}

async function assessmentOperations() {
  const tuplePaths = [
    "examDerivedSubPlacement",
    "lateRenewalCeiling",
    "finalSubPlacement",
  ];
  const documents = await RenewalRankAssessment.collection
    .find({
      $or: tuplePaths.map((path) => ({
        [`${path}.gpScaleVersion`]: { $ne: GP_SCALE_VERSION },
        [path]: { $ne: null },
      })),
    })
    .project(Object.fromEntries(tuplePaths.map((path) => [path, 1])))
    .toArray();
  return documents.map((assessment) => {
    const set = {};
    for (const path of tuplePaths) {
      if (assessment[path]?.gpScaleVersion !== GP_SCALE_VERSION) {
        set[path] = convertedTuple(assessment[path]);
      }
    }
    return {
      updateOne: {
        filter: { _id: assessment._id },
        update: { $set: set },
      },
    };
  });
}

async function matchOperations() {
  const documents = await ArenaMatch.collection
    .find({
      $or: [
        { "challenger.tupleBefore.gpScaleVersion": { $ne: GP_SCALE_VERSION } },
        { "defender.tupleBefore.gpScaleVersion": { $ne: GP_SCALE_VERSION } },
      ],
    })
    .project({ challenger: 1, defender: 1 })
    .toArray();
  return documents.map((match) => ({
    updateOne: {
      filter: { _id: match._id },
      update: {
        $set: {
          "challenger.tupleBefore": convertedTuple(match.challenger?.tupleBefore),
          "defender.tupleBefore": convertedTuple(match.defender?.tupleBefore),
        },
      },
    },
  }));
}

async function ledgerOperations() {
  const documents = await ArenaStandingChangeLedger.collection
    .find({
      $or: [
        { "tupleBefore.gpScaleVersion": { $ne: GP_SCALE_VERSION } },
        { "tupleAfter.gpScaleVersion": { $ne: GP_SCALE_VERSION } },
      ],
    })
    .project({ tupleBefore: 1, tupleAfter: 1 })
    .toArray();
  return documents.map((ledger) => ({
    updateOne: {
      filter: { _id: ledger._id },
      update: {
        $set: {
          tupleBefore: convertedTuple(ledger.tupleBefore),
          tupleAfter: convertedTuple(ledger.tupleAfter),
        },
      },
    },
  }));
}

async function run() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10000 });
  try {
    const operationGroups = {
      arenaStandings: await standingOperations(),
      arenaSnapshots: await snapshotOperations(),
      renewalRankAssessments: await assessmentOperations(),
      arenaMatches: await matchOperations(),
      standingChangeLedgers: await ledgerOperations(),
    };
    const summary = Object.fromEntries(
      Object.entries(operationGroups).map(([key, operations]) => [
        key,
        operations.length,
      ])
    );
    if (!APPLY) {
      console.log(JSON.stringify({ ok: true, mode: "DRY_RUN", summary }, null, 2));
      console.log("실제 반영은 npm run arena-gp:migrate -- --apply 로 실행합니다.");
      return;
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const collections = {
          arenaStandings: ArenaStanding.collection,
          arenaSnapshots: ArenaSnapshot.collection,
          renewalRankAssessments: RenewalRankAssessment.collection,
          arenaMatches: ArenaMatch.collection,
          standingChangeLedgers: ArenaStandingChangeLedger.collection,
        };
        for (const [key, operations] of Object.entries(operationGroups)) {
          if (operations.length) {
            await collections[key].bulkWrite(operations, {
              ordered: true,
              session,
            });
          }
        }
      });
    } finally {
      await session.endSession();
    }
    console.log(
      JSON.stringify({
        ok: true,
        mode: "APPLIED",
        database: mongoose.connection.name,
        gpScaleVersion: GP_SCALE_VERSION,
        summary,
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
