/* Read-only by default. Never drops indexes or edits/deletes existing data. */
const mongoose = require("mongoose");
// This CLI imports all application models below. Disable implicit collection
// creation as well as index building before model initialization can begin.
// Only the explicit --apply branch may write; do not change runtime defaults.
mongoose.set({ autoCreate: false, autoIndex: false });
const { CommunityPost, CommunityComment } = require("../models/matthsModel");
const { COMMUNITY_REQUEST_INDEX, ensureCommunityRequestIndex } = require("../services/communityRequestIdentityService");

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: node scripts/prepareMobileReliabilityIndexes.js [--apply]");
  if (!process.env.DB) throw new Error("Set DB using the deployment secret provider. Do not paste connection strings into logs.");
  await mongoose.connect(process.env.DB, { autoCreate: false, autoIndex: false });
  try {
    let ready = true;
    for (const model of [CommunityPost, CommunityComment]) {
      if (args.includes("--apply")) await ensureCommunityRequestIndex(model);
      const indexes = await model.collection.indexes().catch((error) => {
        if (error.code === 26) return [];
        throw error;
      });
      const actual = indexes.find((index) => index.name === COMMUNITY_REQUEST_INDEX.name);
      const valid = actual?.unique === true &&
        JSON.stringify(actual.key) === JSON.stringify(COMMUNITY_REQUEST_INDEX.key) &&
        JSON.stringify(actual.partialFilterExpression) === JSON.stringify(COMMUNITY_REQUEST_INDEX.partialFilterExpression);
      ready = ready && valid;
      console.log(JSON.stringify({ collection: model.collection.name, index: COMMUNITY_REQUEST_INDEX.name, ready: valid }));
    }
    if (!ready) process.exitCode = 2;
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error("Mobile reliability index preparation failed:", error.code || error.name); process.exitCode = 1; });
