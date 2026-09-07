"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const { User, ConceptProgress, LearningEvent } = require("../models/matthsModel");
const { createAccessToken } = require("../services/mobileAuthService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");
const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const conceptPath = "/learning/common-math-1/polynomials/polynomial-arithmetic";
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  try {
    await ConceptProgress.createIndexes();
    const users = await User.create(ids.map((_id, index) => ({ _id, name: `진도파이프라인검증${index}`,
      email: `${_id}@qa.invalid`, passwordHash: "audit-only", role: "student" })));
    const tokens = users.map((user) => createAccessToken(user));
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
    const patch = async (suffix, body, account = 0) => {
      const response = await fetch(`${origin}${conceptPath}${suffix}`, { method: "PATCH", headers: {
        Authorization: `Bearer ${tokens[account]}`, "Content-Type": "application/json",
      }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    // Exact payload observed from the real iOS first-learning flow. This failed
    // synchronously in Mongoose 9 before an actual DB update was even issued.
    const first = await patch("/mastery", { addCorrectTypeIds: ["polynomial-arithmetic-core-definition"] });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.progress.masteryGate.correctTypeIds, ["polynomial-arithmetic-core-definition"]);
    const replay = await patch("/mastery", { addCorrectTypeIds: ["web-polynomial-arithmetic-core-definition", "polynomial-arithmetic-core-definition"] });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.progress.masteryGate.correctTypeIds.length, 1);
    const topic = await patch("/topics/0", { completed: true, clientEventId: "pipeline-topic-0001" });
    assert.equal(topic.status, 200);
    const snapshot = await patch("/snapshot", { completedTopicIndexes: [0], correctTypeIds: ["web-polynomial-arithmetic-second"],
      lastStudiedAt: new Date().toISOString() });
    assert.equal(snapshot.status, 200, JSON.stringify(snapshot.body));
    assert.deepEqual(new Set(snapshot.body.progress.masteryGate.correctTypeIds),
      new Set(["polynomial-arithmetic-core-definition", "polynomial-arithmetic-second"]));
    assert.deepEqual(snapshot.body.progress.completedTopicIndexes, [0]);
    const literal = await patch("/mastery", { addCorrectTypeIds: ["$topicCount", "$$ROOT"] });
    assert.equal(literal.status, 200);
    assert.ok(literal.body.progress.masteryGate.correctTypeIds.includes("$topicCount"));
    assert.ok(literal.body.progress.masteryGate.correctTypeIds.includes("$$ROOT"));
    assert.equal(await ConceptProgress.countDocuments({ userId: ids[1] }), 0, "second account not mutated");
    const concurrent = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      patch(index % 2 ? "/snapshot" : "/mastery", index % 2
        ? { correctTypeIds: [`parallel-${index}`], completedTopicIndexes: [0] }
        : { addCorrectTypeIds: [`parallel-${index}`] }, 1)));
    for (const response of concurrent) assert.equal(response.status, 200, JSON.stringify(response.body));
    const final = await ConceptProgress.findOne({ userId: ids[1], conceptId: "polynomial-arithmetic" });
    assert.equal(new Set(final.masteryGate.correctTypeIds).size, 20, "atomic union must retain all simultaneous additions");
    assert.deepEqual(Array.from(final.completedTopicIndexes), [0]);
    const learning = await fetch(`${origin}/learning`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
    assert.equal(learning.status, 200);
    const learningJSON = await learning.json();
    assert.ok(learningJSON.learning, "canonical learning snapshot remains readable after real writes");
    console.log("iPad learning pipeline real HTTP/Mongo PASS: exact native mastery payload, snapshot, canonical replay, topic preservation, literal dollar strings, owner isolation, 20 concurrent unions, canonical readback.");
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await LearningEvent.deleteMany({ userId: { $in: ids } });
    await ConceptProgress.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
