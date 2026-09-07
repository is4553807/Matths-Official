const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const mongoose = require("mongoose");
const express = require("express");
const { User, CommunityPost, CommunityPostingQuota } = require("../models/matthsModel");
const { createAccessToken } = require("../services/mobileAuthService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");
const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const state = { flowVersion: 2, stage: "goal", goal: "school", diagnosticAnswers: [], seed: null,
  conceptId: null, expectedProblemIds: [], problemContentFingerprint: null, checkedAnswers: [],
  topicRead: false, startedAt: "2026-09-07T01:00:00Z", learningStartedAt: null, baselineProgress: null };
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  try {
    await require("./verifyMobileIndexToolReadOnly")();
    const users = await User.create(ids.map((_id, index) => ({ _id, name: `모바일HTTP검증${index}`,
      email: `${_id}@example.test`, passwordHash: "audit-only", role: "student" })));
    await CommunityPostingQuota.createIndexes();
    const tokens = users.map((user) => createAccessToken(user));
    const app = express();
    app.use(express.json());
    app.use("/api/v1", router);
    app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (endpoint, { token = tokens[0], body, method = "GET" } = {}) => {
      const response = await fetch(origin + endpoint, { method, headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}),
      }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    };
    for (const endpoint of ["/mobile-capabilities", "/me/first-learning"]) {
      assert.equal((await request(endpoint, { token: null })).status, 401);
      assert.equal((await request(endpoint, { token: "not-a-token" })).status, 401);
    }
    const capability = await request("/mobile-capabilities");
    assert.equal(capability.status, 200);
    assert.equal(capability.body.communityIdempotency, true);
    assert.equal(capability.body.firstLearningState, true);
    assert.equal(capability.cache, "private, no-store");
    const initial = await request("/me/first-learning");
    assert.equal(initial.body.state, null);
    const saved = await request("/me/first-learning", { method: "PATCH", body: { schemaVersion: 1, expectedRevision: 0, state } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.equal(saved.body.state.startedAt, "2026-09-07T01:00:00.000Z");
    assert.equal((await request("/me/first-learning", { token: tokens[1] })).body.state, null);
    const stale = await request("/me/first-learning", { method: "PATCH", body: { schemaVersion: 1, expectedRevision: 0, state } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.current.revision, 1);
    const spoof = await request("/me/first-learning", { method: "PATCH", body: { schemaVersion: 1, expectedRevision: 1, state, userId: String(ids[1]) } });
    assert.equal(spoof.status, 400);
    const completed = await request("/me/tutorials/dashboard", { method: "PATCH", body: { action: "COMPLETE" } });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.tutorial.status, "COMPLETED");
    assert.equal((await request("/me/first-learning")).body.state, null);
    const postBody = { board: "high-school", title: "HTTP중복검증", content: "실제 인증 및 컨트롤러를 통과하는 격리 검증입니다.", isAnonymous: false, requestId: "http-request-00000001" };
    const created = await request("/community/posts", { method: "POST", body: postBody });
    assert.equal(created.status, 201);
    const replay = await request("/community/posts", { method: "POST", body: postBody });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.post.id, created.body.post.id);
    const conflict = await request("/community/posts", { method: "POST", body: { ...postBody, content: "같은 키의 변경된 본문" } });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "COMMUNITY_REQUEST_ID_CONFLICT");
    await CommunityPost.updateOne({ _id: created.body.post.id }, { $set: { authorDeletedAt: new Date() } });
    const tombstone = await request("/community/posts", { method: "POST", body: postBody });
    assert.equal(tombstone.status, 410);
    assert.equal(tombstone.body.code, "COMMUNITY_REQUEST_NO_LONGER_VISIBLE");
    await User.updateOne({ _id: ids[0] }, { $inc: { tokenVersion: 1 } });
    assert.equal((await request("/me/first-learning")).status, 401);
    assert.equal((await request("/mobile-capabilities")).status, 401);
    const checked = spawnSync(process.execPath, ["scripts/prepareMobileReliabilityIndexes.js"], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    const applied = spawnSync(process.execPath, ["scripts/prepareMobileReliabilityIndexes.js", "--apply"], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    console.log("Mobile reliability full-router HTTP Mongo tests PASS: real Bearer auth/revocation, owner isolation, capability/index readiness, date serialization, stale current envelope, legacy tutorial action, community replay/conflict/tombstone, idempotent index preparation.");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await CommunityPost.deleteMany({ authorId: { $in: ids } });
    await CommunityPostingQuota.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
