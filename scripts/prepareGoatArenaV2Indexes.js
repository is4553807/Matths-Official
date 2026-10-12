/* Read-only by default. --apply migrates named retired indexes and creates missing GOAT Arena 2.x indexes. */
const mongoose = require("mongoose");
mongoose.set({ autoCreate: false, autoIndex: false });
require("dotenv").config({ path: "config.env", quiet: true });
const { assertSeparateArenaStagingDatabase } = require("./arenaStagingSafety");

const {
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaFriendRequest,
  ArenaFriendlyInvitationV2,
  ArenaFriendship,
  ArenaMatch,
  ArenaMatchmakingEntry,
  ArenaMatchParticipantLock,
  ArenaRatingSettlement,
  ArenaWeeklyMockRatingSettlement,
  ArenaPlacementAttemptAdjustment,
  ArenaNormalMatchCounter,
  ArenaNormalBaselineQuestion,
  ArenaNormalBaselineAssignment,
  ArenaGuestIdentity,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestSolutionBoard,
} = require("../models/goatArenaModel");
const { AssessmentAttempt, User } = require("../models/matthsModel");
const NicknameNamespace = require("../models/nicknameNamespaceModel");

const { ArenaNotificationEmailDelivery, ArenaNativeCommandReceipt, ArenaAssetDeletionTask } = require("../models/arenaDeliveryModel");
const models = [
  ArenaNotificationEmailDelivery,
  ArenaNativeCommandReceipt,
  ArenaAssetDeletionTask,
  ArenaCompetitiveProfile,
  ArenaCompetitiveRecord,
  ArenaMatchmakingEntry,
  ArenaRatingSettlement,
  ArenaWeeklyMockRatingSettlement,
  ArenaFriendRequest,
  ArenaFriendship,
  ArenaFriendlyInvitationV2,
  ArenaMatch,
  ArenaMatchParticipantLock,
  ArenaPlacementAttemptAdjustment,
  ArenaNormalMatchCounter,
  ArenaNormalBaselineQuestion,
  ArenaNormalBaselineAssignment,
  ArenaGuestIdentity,
  ArenaGuestChallenge,
  ArenaGuestChallengeAttempt,
  ArenaGuestSolutionBoard,
  NicknameNamespace,
  AssessmentAttempt,
  User,
];

function signature(key) {
  return JSON.stringify(Object.entries(key || {}));
}

function matchesIndex(actual, key, options) {
  return signature(actual.key) === signature(key) &&
    Boolean(actual.unique) === Boolean(options.unique) &&
    Boolean(actual.sparse) === Boolean(options.sparse) &&
    JSON.stringify(actual.partialFilterExpression || null) ===
      JSON.stringify(options.partialFilterExpression || null);
}

const retiredIndexes = new Map([
  [
    ArenaGuestIdentity.collection.name,
    [{
      name: "claimedByUserId_1",
      key: { claimedByUserId: 1 },
      unique: true,
      partialFilterExpression: null,
    }],
  ],
  [
    ArenaGuestChallengeAttempt.collection.name,
    [{
      name: "challengeId_1_guestIdentityId_1_attemptNumber_1",
      key: { challengeId: 1, guestIdentityId: 1, attemptNumber: 1 },
      unique: true,
      partialFilterExpression: null,
    }],
  ],
]);

const standaloneRetiredIndexes = Object.freeze([
  {
    collection: "arenahistoricalrecordassignments",
    indexes: [{
      name: "recordId_1_challengerUserId_1",
      key: { recordId: 1, challengerUserId: 1 },
      unique: true,
      partialFilterExpression: null,
    }],
  },
]);

function retiredIndexMatches(actual, retired) {
  return actual.name === retired.name &&
    signature(actual.key) === signature(retired.key) &&
    Boolean(actual.unique) === Boolean(retired.unique) &&
    JSON.stringify(actual.partialFilterExpression || null) ===
      JSON.stringify(retired.partialFilterExpression || null);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--staging"].includes(arg))) {
    throw new Error("Usage: node scripts/prepareGoatArenaV2Indexes.js [--staging] [--apply]");
  }
  if (args.includes("--apply") && !args.includes("--staging")) {
    throw new Error("Index writes are currently authorized for staging only; add --staging and set ARENA_STAGING_DB.");
  }
  const databaseUri = args.includes("--staging") ? process.env.ARENA_STAGING_DB : process.env.DB;
  if (!databaseUri) throw new Error("Set the selected database through the secret provider; never paste connection strings into logs.");
  if (args.includes("--staging")) assertSeparateArenaStagingDatabase(databaseUri, process.env.DB);
  await mongoose.connect(databaseUri, { autoCreate: false, autoIndex: false });
  try {
    let ready = true;
    for (const retiredCollection of standaloneRetiredIndexes) {
      const collection = mongoose.connection.db.collection(retiredCollection.collection);
      const before = await collection.indexes().catch((error) => {
        if (error.code === 26) return [];
        throw error;
      });
      const blocking = retiredCollection.indexes.filter((retired) =>
        before.some((index) => retiredIndexMatches(index, retired))
      );
      if (args.includes("--apply")) {
        for (const retired of blocking) await collection.dropIndex(retired.name);
      } else if (blocking.length) {
        ready = false;
      }
    }
    for (const model of models) {
      if (args.includes("--apply")) {
        const before = await model.collection.indexes().catch((error) => {
          if (error.code === 26) return [];
          throw error;
        });
        for (const retired of retiredIndexes.get(model.collection.name) || []) {
          const blocking = before.find((index) => retiredIndexMatches(index, retired));
          if (blocking) await model.collection.dropIndex(blocking.name);
        }
      }
      if (args.includes("--apply")) await model.createIndexes();
      const actual = await model.collection.indexes().catch((error) => {
        if (error.code === 26) return [];
        throw error;
      });
      const missing = model.schema.indexes()
        .filter(([key, options]) => !actual.some((index) => matchesIndex(index, key, options)))
        .map(([key, options]) => ({ key, unique: Boolean(options.unique), partialFilterExpression: options.partialFilterExpression || null }));
      const blocking = (retiredIndexes.get(model.collection.name) || [])
        .filter((retired) => actual.some((index) => retiredIndexMatches(index, retired)))
        .map((retired) => retired.name);
      const modelReady = missing.length === 0 && blocking.length === 0;
      ready = ready && modelReady;
      console.log(JSON.stringify({
        collection: model.collection.name,
        ready: modelReady,
        missing,
        blocking,
      }));
    }
    if (!ready) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("GOAT Arena index preparation failed:", error.code || error.name);
  process.exitCode = 1;
});
