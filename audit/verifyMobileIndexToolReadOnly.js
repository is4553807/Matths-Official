"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { MongoClient } = require("mongodb");
const { randomBytes } = require("node:crypto");

// Called by the actual HTTP suite, but owns an additional fresh loopback DB.
// Never accept an operator URI or run against the suite's populated database.
module.exports = async function verifyMobileIndexToolReadOnly() {
  const uri = new URL(String(process.env.DB));
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.username, ""); assert.equal(uri.password, "");
  assert.equal(uri.pathname, "/matths_audit_zero_assumption_20260815");
  uri.pathname = `/matths_audit_index_cli_${process.pid}_${randomBytes(8).toString("hex")}`;
  const client = new MongoClient(uri.href);
  await client.connect();
  const db = client.db();
  let ownsFreshDatabase = false;
  async function snapshot() {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return Promise.all(collections.sort((a, b) => a.name.localeCompare(b.name)).map(async ({ name }) => ({
      name,
      indexes: (await db.collection(name).indexes()).sort((a, b) => a.name.localeCompare(b.name)),
      documents: await db.collection(name).find({}).sort({ _id: 1 }).toArray(),
    })));
  }
  function run(args = [], delayedRead = false) {
    const argv = [process.execPath, "scripts/prepareMobileReliabilityIndexes.js", ...args];
    const code = `const mongoose=require('mongoose');
      const original=mongoose.Collection.prototype.indexes;
      mongoose.Collection.prototype.indexes=async function(...args){
        await new Promise(resolve=>setTimeout(resolve,100));return original.apply(this,args);
      };
      process.argv=${JSON.stringify(argv)};require('./scripts/prepareMobileReliabilityIndexes.js');`;
    const result = spawnSync(process.execPath,
      delayedRead ? ["-e", code] : argv.slice(1),
      { cwd: process.cwd(), env: { PATH: process.env.PATH, DB: uri.href }, encoding: "utf8", timeout: 30000 });
    assert.ok(!result.error, `index CLI did not complete: ${result.error?.code || "unknown"}`);
    return result;
  }
  try {
    assert.deepEqual(await snapshot(), [], "index regression DB must be freshly isolated");
    ownsFreshDatabase = true;
    const dry = run([], true);
    assert.equal(dry.status, 2, dry.stderr);
    assert.deepEqual(await snapshot(), [], "dry-run must not create any collection/index even if model initialization has time to run");
    await db.collection("unrelated_fixture").insertOne({ _id: "original", payload: "keep" });
    await db.collection("unrelated_fixture").createIndex({ payload: 1 }, { name: "keep_existing" });
    const before = await snapshot();
    assert.equal(run().status, 2);
    assert.deepEqual(await snapshot(), before, "inspection must preserve existing collections/indexes/documents");
    const applied = run(["--apply"], true);
    assert.equal(applied.status, 0, applied.stderr);
    const after = await snapshot();
    assert.deepEqual(after.filter((row) => row.name === "unrelated_fixture"), before);
    assert.deepEqual(after.filter((row) => row.name !== "unrelated_fixture").map((row) => row.name), ["communitycomments", "communityposts"]);
    for (const row of after.filter((value) => value.name !== "unrelated_fixture")) {
      assert.deepEqual(row.documents, []);
      assert.deepEqual(row.indexes.map((index) => index.name).sort(), ["_id_", "community_author_request_id_unique_v1"]);
      const index = row.indexes.find((index) => index.name !== "_id_");
      assert.deepEqual(index.key, { authorId: 1, requestId: 1 });
      assert.equal(index.unique, true);
      assert.deepEqual(index.partialFilterExpression, { requestId: { $type: "string" } });
    }
    assert.equal(run().status, 0);
    assert.equal(run(["--apply"]).status, 0);
    assert.deepEqual(await snapshot(), after, "read and repeated apply never drop or rewrite unrelated indexes/data");
    assert.equal(run(["--dry-run"]).status, 1, "unsupported flags must not be treated as apply or an inspection alias");
    assert.deepEqual(await snapshot(), after);
    console.log("PASS actual index CLI: delayed-read dry-run creates nothing; existing data/indexes unchanged; --apply creates only the two intended indexes; repeated apply and invalid flags are safe.");
  } finally {
    if (ownsFreshDatabase) await db.dropDatabase();
    await client.close();
  }
};
