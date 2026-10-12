const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const mongoose = require("mongoose");

async function main() {
  const databaseUri = String(process.env.DB || "");
  assert.match(databaseUri, /matths_audit_zero_assumption_20260815/);
  const env = { ...process.env, ARENA_STAGING_DB: databaseUri,
    DB: databaseUri.replace("matths_audit_zero_assumption_20260815", "arena_unused_operating_comparison") };
  const run = (args, extraEnv = {}) => spawnSync(process.execPath, ["scripts/prepareGoatArenaV2Indexes.js", ...args],
    { env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 60000 });
  // These connections point only to the disposable local replica set. This is
  // an index-tool test, not evidence of actual staging index readiness.
  assert.equal(run(["--apply"]).status, 1, "operating database index writes must be refused");
  assert.equal(run(["--staging", "--apply"], { DB: databaseUri }).status, 1,
    "a staging connection equal to the operating connection must be refused");
  const sameDatabaseWithQuery = `${databaseUri}${databaseUri.includes("?") ? "&" : "?"}appName=ArenaIndexAudit`;
  assert.equal(run(["--staging", "--apply"], { DB: databaseUri, ARENA_STAGING_DB: sameDatabaseWithQuery }).status, 1,
    "changing URI query options must not bypass the operating-database guard");
  assert.equal(run(["--staging"]).status, 2, "missing declared indexes must fail readiness");
  const applied = run(["--staging", "--apply"]);
  assert.equal(applied.status, 0, applied.stderr);
  const verified = run(["--staging"]);
  assert.equal(verified.status, 0, verified.stderr);
  const collections = verified.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(collections.length, 24);
  assert.ok(collections.some((row) => row.collection === "arenanativecommandreceipts"));
  assert.ok(collections.some((row) => row.collection === "arenanotificationemaildeliveries"));
  assert.ok(collections.every((row) => row.ready && row.missing.length === 0));
  await mongoose.connect(databaseUri);
  try {
    await mongoose.connection.db.collection("arenahistoricalrecordassignments").createIndex(
      { recordId: 1, challengerUserId: 1 },
      { name: "recordId_1_challengerUserId_1", unique: true }
    );
    const guestIdentities = mongoose.connection.db.collection("arenaguestidentities");
    await guestIdentities.dropIndex("claimedByUserId_1");
    await guestIdentities.createIndex(
      { claimedByUserId: 1 },
      { name: "claimedByUserId_1", unique: true }
    );
    await mongoose.connection.db.collection("arenaguestchallengeattempts").createIndex(
      { challengeId: 1, guestIdentityId: 1, attemptNumber: 1 },
      { name: "challengeId_1_guestIdentityId_1_attemptNumber_1", unique: true }
    );
  } finally {
    await mongoose.disconnect();
  }
  const blockedByRetiredUnique = run(["--staging"]);
  assert.equal(
    blockedByRetiredUnique.status,
    2,
    "conflicting permanent-reuse, guest-claim, and guest-retry indexes must block readiness"
  );
  const migratedIndexes = run(["--staging", "--apply"]);
  assert.equal(migratedIndexes.status, 0, migratedIndexes.stderr);
  await mongoose.connect(databaseUri);
  try {
    const assignmentIndexes = await mongoose.connection.db
      .collection("arenahistoricalrecordassignments")
      .indexes();
    assert.ok(!assignmentIndexes.some((index) => index.name === "recordId_1_challengerUserId_1"));
    assert.ok(!assignmentIndexes.some((index) =>
      Object.prototype.hasOwnProperty.call(index.key || {}, "recordId") ||
      Object.prototype.hasOwnProperty.call(index.key || {}, "challengerUserId")
    ));
    const guestIdentityIndexes = await mongoose.connection.db
      .collection("arenaguestidentities")
      .indexes();
    const guestClaimIndex = guestIdentityIndexes.find(
      (index) => index.name === "claimedByUserId_1"
    );
    assert.equal(guestClaimIndex?.unique, true);
    assert.deepEqual(guestClaimIndex?.partialFilterExpression, {
      claimedByUserId: { $type: "objectId" },
    });
    const guestAttemptIndexes = await mongoose.connection.db
      .collection("arenaguestchallengeattempts")
      .indexes();
    assert.ok(!guestAttemptIndexes.some(
      (index) => index.name === "challengeId_1_guestIdentityId_1_attemptNumber_1"
    ));
    assert.ok(guestAttemptIndexes.some((index) =>
      JSON.stringify(index.key) === JSON.stringify({ challengeId: 1, guestIdentityId: 1 }) &&
      index.unique === true
    ));
    await mongoose.connection.db.collection("arenacompetitiveprofiles").createIndex({ accountXp: 1 }, { name: "AUDIT_preserve_unrelated_index" });
    const reapplied = run(["--staging", "--apply"]);
    assert.equal(reapplied.status, 0, reapplied.stderr);
    const indexes = await mongoose.connection.db.collection("arenacompetitiveprofiles").indexes();
    assert.ok(indexes.some((index) => index.name === "AUDIT_preserve_unrelated_index"), "the tool must never sync/drop unrelated indexes");
  } finally { await mongoose.disconnect(); }
  console.log("Arena index-tool DB verification passed: 21 model index sets, obsolete record-assignment index cleanup, per-question normal baseline records, asynchronous normal records, weekly internal-MMR settlements, one-attempt guest challenges, shared nickname namespace, User account-plan indexes, staging-only apply, safe replay, and unrelated-index preservation. Actual staging remains unverified.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
