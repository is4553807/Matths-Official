"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { ArenaGuestIdentity } = require("../models/goatArenaModel");
const { ensureArenaGuestIdentityIndexes } = require("../services/arenaGuestIdentityIndexService");

function identity(nickname, claimedByUserId = null) {
  return { nickname, nicknameNormalized: nickname, claimSecretHash: "a".repeat(64), birthDateHash: "b".repeat(64), firstChallengeAcceptedAt: new Date(), claimedByUserId };
}
async function main() {
  assert.match(process.env.DB, /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    await ArenaGuestIdentity.init();
    await ArenaGuestIdentity.collection.dropIndex("claimedByUserId_1");
    await ArenaGuestIdentity.collection.createIndex({ claimedByUserId: 1 }, { unique: true, name: "claimedByUserId_1" });
    await ArenaGuestIdentity.collection.createIndex({ createdAt: 1 }, { name: "AUDIT_preserve_guest_index" });
    await ArenaGuestIdentity.create(identity("first-anonymous"));
    await assert.rejects(ArenaGuestIdentity.create(identity("different-anonymous")), error => error.code === 11000 && error.keyPattern?.claimedByUserId === 1);
    assert.equal((await ensureArenaGuestIdentityIndexes()).removedLegacyGuestClaimIndex, true);
    const guests = await Promise.all([1, 2, 3, 4, 5].map(index => ArenaGuestIdentity.create(identity(`parallel-anonymous-${index}`))));
    assert.equal(new Set(guests.map(guest => String(guest._id))).size, 5);
    await assert.rejects(ArenaGuestIdentity.create(identity("first-anonymous")), error => error.code === 11000 && error.keyPattern?.nicknameNormalized === 1);
    const accountId = new mongoose.Types.ObjectId();
    await ArenaGuestIdentity.create(identity("registered-guest", accountId));
    await assert.rejects(ArenaGuestIdentity.create(identity("another-account-identity", accountId)), error => error.code === 11000 && error.keyPattern?.claimedByUserId === 1);
    assert.equal((await ensureArenaGuestIdentityIndexes()).removedLegacyGuestClaimIndex, false);
    const indexes = await ArenaGuestIdentity.collection.indexes();
    assert.deepEqual(indexes.find(index => index.name === "claimedByUserId_1").partialFilterExpression, { claimedByUserId: { $type: "objectId" } });
    assert.ok(indexes.some(index => index.name === "AUDIT_preserve_guest_index"));
    assert.equal(await ArenaGuestIdentity.countDocuments(), 7);
    console.log("Guest identity index regression verified: reproduced distinct-nickname null-account collision, migrated only the retired index, five parallel anonymous admissions, real nickname/account uniqueness, safe replay and preservation of all seven identities and unrelated indexes.");
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
