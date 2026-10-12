"use strict";

const { ArenaGuestIdentity } = require("../models/goatArenaModel");

async function ensureArenaGuestIdentityIndexes() {
  const collection = ArenaGuestIdentity.collection;
  const indexes = await collection.indexes().catch(error => {
    if (error.code === 26) return [];
    throw error;
  });
  // The retired unique index also indexed claimedByUserId:null, allowing just
  // one anonymous guest across all links. Keep uniqueness for actual accounts.
  const legacy = indexes.find(index => index.name === "claimedByUserId_1" &&
    index.unique === true && Object.keys(index.key).length === 1 &&
    index.key.claimedByUserId === 1 && !index.partialFilterExpression);
  if (legacy) {
    await collection.dropIndex(legacy.name).catch(error => {
      if (error.code !== 27) throw error;
    });
  }
  await ArenaGuestIdentity.createIndexes();
  return { removedLegacyGuestClaimIndex: Boolean(legacy) };
}

module.exports = { ensureArenaGuestIdentityIndexes };
