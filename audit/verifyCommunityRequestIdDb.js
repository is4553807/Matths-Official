const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const mongoose = require("mongoose");
const storage = require("../services/fileStorageService");
const stored = new Set();
const destroyed = new Set();
// Only the external object-store boundary is faked. Services, controllers,
// schema validation, indexes, quota and concurrent writes use real MongoDB.
storage.storeUploadedFile = async (file) => {
  await new Promise((resolve) => setTimeout(resolve, file.delay || 1));
  if (file.failUpload) throw new Error("injected object storage rejection");
  if (file.beforeUploadComplete) await file.beforeUploadComplete();
  const key = `isolated/${path.basename(file.path)}`;
  file.storageAsset = { storageProvider: "CLOUDINARY", storagePurpose: "USER_COMMUNITY", cloudPublicId: key,
    cloudResourceType: "raw", cloudDeliveryType: "authenticated" };
  stored.add(key);
  await fs.promises.unlink(file.path);
  return file.storageAsset;
};
storage.destroyStoredAsset = async (asset) => { destroyed.add(asset.cloudPublicId || asset.r2ObjectKey); };
const { CommunityPost, CommunityComment, CommunityPostingQuota, CommunityUserBlock, User } = require("../models/matthsModel");
const { createCommunityPost, createCommunityComment } = require("../services/communityService");
const controller = require("../controllers/ipadCommunityController");
const { communityRequestIdentity, ensureCommunityRequestIndex, COMMUNITY_REQUEST_INDEX } = require("../services/communityRequestIdentityService");
const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const basePost = { board: "high-school", title: "중복방지검증", content: "격리 테스트 게시글 내용", isAnonymous: false };
const userPost = (overrides = {}) => ({ ...basePost, userId: ids[0], ...overrides });
let fixtureDirectory;
let fixtureIndex = 0;
async function staged(bytes = "same-bytes", extra = {}) {
  const filePath = path.join(fixtureDirectory, `fixture-${fixtureIndex++}.pdf`);
  await fs.promises.writeFile(filePath, bytes);
  return { path: filePath, filename: path.basename(filePath), originalname: "fixture.pdf", mimetype: "application/pdf", size: Buffer.byteLength(bytes), ...extra };
}
async function callController(body, files = [], userId = ids[0]) {
  const req = { body, files, apiUser: { _id: userId } };
  const res = { set() { return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  let failure;
  await controller.createPost(req, res, (error) => { failure = error; });
  return { req, res, failure };
}
function childRequest(userId) {
  const child = fork(__filename, ["--child", String(userId)], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let output = "";
  child.stderr.on("data", (value) => { output += value; });
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const result = new Promise((resolve, reject) => {
    child.on("message", (value) => {
      if (value.ready) readyResolve();
      if (value.id) resolve(value.id);
      if (value.error) reject(new Error(value.error));
    });
    child.on("exit", (code) => { if (code) reject(new Error(`Child exited ${code}: ${output}`)); });
  });
  return { ready, result, go() { child.send("go"); } };
}
async function childMain() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  process.send({ ready: true });
  await new Promise((resolve) => process.once("message", resolve));
  try {
    const post = await createCommunityPost({ ...basePost, userId: process.argv[3], requestId: "multiprocess-request-0001" });
    process.send({ id: String(post._id) });
  } catch (error) { process.send({ error: error.stack }); process.exitCode = 1; }
  finally { await mongoose.disconnect(); process.disconnect(); }
}
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  fixtureDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "matths-community-idempotency-"));
  await mongoose.connect(process.env.DB, { autoIndex: false });
  try {
    await User.create(ids.map((_id, index) => ({ _id, name: `커뮤니티검증${index}`, email: `${_id}@example.test`, passwordHash: "audit-only", role: "student" })));
    await CommunityPostingQuota.createIndexes();
    const concurrent = await Promise.all(Array.from({ length: 20 }, () => createCommunityPost(userPost({ requestId: "post-request-00000001" }))));
    assert.equal(new Set(concurrent.map((post) => String(post._id))).size, 1);
    assert.equal(await CommunityPost.countDocuments({ authorId: ids[0] }), 1);
    assert.equal((await CommunityPostingQuota.findOne({ userId: ids[0] })).count, 1);
    const index = (await CommunityPost.collection.indexes()).find((value) => value.name === COMMUNITY_REQUEST_INDEX.name);
    assert.equal(index.unique, true);
    assert.deepEqual(index.partialFilterExpression, { requestId: { $type: "string" } });
    await assert.rejects(() => createCommunityPost(userPost({ requestId: "post-request-00000001", content: "다른 본문입니다" })), { status: 409, code: "COMMUNITY_REQUEST_ID_CONFLICT" });
    const other = await createCommunityPost(userPost({ userId: ids[1], requestId: "post-request-00000001" }));
    assert.notEqual(String(other._id), String(concurrent[0]._id), "idempotency keys are account-owned");
    const legacy = await Promise.all([createCommunityPost(userPost()), createCommunityPost(userPost())]);
    assert.notEqual(String(legacy[0]._id), String(legacy[1]._id), "old clients still create independent writes");
    assert.equal(legacy[0].requestId, undefined);
    const commentInput = { userId: ids[1], postId: concurrent[0]._id, content: "댓글 검증", isAnonymous: false, requestId: "comment-request-0001" };
    const comments = await Promise.all(Array.from({ length: 20 }, () => createCommunityComment(commentInput)));
    assert.equal(new Set(comments.map((comment) => String(comment._id))).size, 1);
    assert.equal(await CommunityComment.countDocuments({ requestId: commentInput.requestId }), 1);
    await assert.rejects(() => createCommunityComment({ ...commentInput, content: "변경된 내용" }), { status: 409 });
    await assert.rejects(() => createCommunityComment({ ...commentInput, postId: other._id }), { status: 409 });
    for (const requestId of ["", "short", " leading-whitespace-key", "x".repeat(129), 42, {}, "../path-key-1234567"]) {
      await assert.rejects(() => createCommunityComment({ ...commentInput, requestId }), { status: 400 });
    }
    const workers = Array.from({ length: 3 }, () => childRequest(ids[2]));
    await Promise.all(workers.map((worker) => worker.ready));
    workers.forEach((worker) => worker.go());
    const childIDs = await Promise.all(workers.map((worker) => worker.result));
    assert.equal(new Set(childIDs).size, 1, "three independent Node processes produce one visible post");
    assert.equal(await CommunityPost.countDocuments({ authorId: ids[2] }), 1);
    assert.equal((await CommunityPostingQuota.findOne({ userId: ids[2] })).count, 1, "losing unique writes release reserved quota");
    const attachmentBody = { ...basePost, requestId: "attachment-request-01" };
    const firstAttachment = await staged();
    const created = await callController(attachmentBody, [firstAttachment]);
    assert.equal(created.failure, undefined);
    assert.equal(created.res.statusCode, 201);
    const beforeStores = stored.size;
    const repeatedAttachment = await staged();
    const repeated = await callController(attachmentBody, [repeatedAttachment]);
    assert.equal(repeated.failure, undefined);
    assert.equal(repeated.res.body.post.id, created.res.body.post.id);
    assert.equal(stored.size, beforeStores, "early replay never uploads another remote asset");
    assert.equal(fs.existsSync(repeatedAttachment.path), false, "duplicate staged bytes removed");
    const conflictAttachment = await staged("DIFF-bytes");
    assert.equal(conflictAttachment.size, firstAttachment.size);
    const conflicting = await callController(attachmentBody, [conflictAttachment]);
    assert.equal(conflicting.failure.code, "COMMUNITY_REQUEST_ID_CONFLICT", "same size/name but different bytes must conflict");
    assert.equal(fs.existsSync(conflictAttachment.path), false);
    const raceFiles = await Promise.all(Array.from({ length: 3 }, () => staged()));
    const race = await Promise.all(raceFiles.map((file) => callController({ ...basePost, requestId: "attachment-race-0001" }, [file], ids[1])));
    assert.equal(new Set(race.map((value) => value.res.body.post.id)).size, 1);
    for (const file of raceFiles) assert.equal(fs.existsSync(file.path), false);
    const keptKeys = raceFiles.map((file) => file.storageAsset?.cloudPublicId).filter(Boolean).filter((key) => !destroyed.has(key));
    assert.equal(keptKeys.length, 1, "late duplicate remote assets destroyed, winner retained");
    const slow = await staged("slow-file", { delay: 25 });
    const failed = await staged("fail-file", { failUpload: true });
    const uploadFailure = await callController({ ...basePost, requestId: "attachment-failure-01" }, [slow, failed], ids[1]);
    assert.ok(uploadFailure.failure);
    assert.ok(destroyed.has(slow.storageAsset.cloudPublicId), "wait for slow success before failure cleanup");
    assert.equal(fs.existsSync(failed.path), false);
    await CommunityPost.updateOne({ _id: created.res.body.post.id }, { $set: { authorDeletedAt: new Date() } });
    const deletedRetryFile = await staged();
    const deletedRetry = await callController(attachmentBody, [deletedRetryFile]);
    assert.equal(deletedRetry.failure.code, "COMMUNITY_REQUEST_NO_LONGER_VISIBLE");
    assert.equal(deletedRetry.failure.status, 410);
    assert.equal(fs.existsSync(deletedRetryFile.path), false);
    await CommunityComment.updateOne({ _id: comments[0]._id }, { $set: { status: "hidden" } });
    await assert.rejects(() => createCommunityComment(commentInput), { status: 410, code: "COMMUNITY_REQUEST_NO_LONGER_VISIBLE" });
    let attempts = 0;
    const failedModel = { collection: { createIndex: async () => { attempts++; throw new Error("index permission denied"); } } };
    await assert.rejects(() => ensureCommunityRequestIndex(failedModel), { status: 503 });
    await assert.rejects(() => ensureCommunityRequestIndex(failedModel), { status: 503 });
    assert.equal(attempts, 2, "failed index initialization is retryable, never assumed safe");

    async function lifecycleUser() {
      const _id = new mongoose.Types.ObjectId(); ids.push(_id);
      return User.create({ _id, name: "변경 전 검증 회원", email: `${_id}@qa.invalid`, passwordHash: "audit-only",
        role: "student", schoolGrade: 10, school: { code: "QA-BEFORE", name: "변경 전 검증 학교", region: "서울" } });
    }
    for (const scenario of ["deleted", "warning", "school", "token", "profile"]) {
      const writer = await lifecycleUser();
      let reached, release;
      const started = new Promise((resolve) => { reached = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      const file = await staged(`lifecycle-${scenario}`, { beforeUploadComplete: async () => { reached(); await gate; } });
      const body = { ...basePost, ...(scenario === "school" ? { board: "school" } : {}),
        ...(scenario === "deleted" ? {} : { requestId: `lifecycle-${scenario}-request` }) };
      const pending = callController(body, [file], writer._id);
      await started;
      try {
        if (scenario === "deleted") await User.deleteOne({ _id: writer._id });
        if (scenario === "warning") await User.updateOne({ _id: writer._id }, { $set: { warningCount: 1 } });
        if (scenario === "school") await User.updateOne({ _id: writer._id }, { $set: { "school.code": "QA-AFTER" } });
        if (scenario === "token") await User.updateOne({ _id: writer._id }, { $inc: { tokenVersion: 1 } });
        if (scenario === "profile") await User.updateOne({ _id: writer._id }, { $set: { name: "변경 후 검증 회원" } });
        release();
        const result = await pending;
        if (scenario === "profile") {
          assert.equal(result.failure, undefined);
          const post = await CommunityPost.findOne({ authorId: writer._id });
          assert.equal(post.authorName, "변경 후 검증 회원", "Accepted writes must not publish stale profile data");
        } else {
          assert.equal(result.failure?.status, scenario === "token" ? 401 : 403);
          if (scenario === "token") assert.equal(result.failure.code, "TOKEN_REVOKED");
          assert.equal(await CommunityPost.countDocuments({ authorId: writer._id }), 0, "A slow upload bypassed changed account access");
          assert.equal(await CommunityPostingQuota.countDocuments({ userId: writer._id }), 0, "Rejected upload allocated a quota row after account change");
          assert.ok(destroyed.has(file.storageAsset.cloudPublicId), "Rejected post left its newly uploaded asset orphaned");
        }
      } finally { release(); }
    }
    console.log("PASS real Mongo upload gate: deleted account, warning, school transfer and token revocation block publication and clean uploaded assets; valid profile rename is reflected.");

    for (const scenario of ["deleted", "hidden-post", "blocked"]) {
      const commenter = await lifecycleUser();
      const post = await CommunityPost.create({ authorId: ids[0], authorName: "검증 원글 작성자", boardType: "high-school",
        title: "댓글 대기 경합 검증", content: "격리된 원글입니다." });
      const requestId = `comment-lifecycle-${scenario}`;
      const originalFind = CommunityComment.findOne;
      let reached, release, held = false;
      const started = new Promise((resolve) => { reached = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      CommunityComment.findOne = function (filter, ...args) {
        const query = originalFind.call(this, filter, ...args);
        if (!held && String(filter.authorId) === String(commenter._id) && filter.requestId === requestId) {
          held = true;
          return query.then(async (value) => { reached(); await gate; return value; });
        }
        return query;
      };
      const pending = createCommunityComment({ userId: commenter._id, postId: post._id,
        content: "대기 중 작성하는 검증 댓글", isAnonymous: false, requestId })
        .then((value) => ({ value }), (error) => ({ error }));
      try {
        await started;
        if (scenario === "deleted") await User.deleteOne({ _id: commenter._id });
        if (scenario === "hidden-post") await CommunityPost.updateOne({ _id: post._id }, { $set: { status: "hidden" } });
        if (scenario === "blocked") await CommunityUserBlock.create({ blockerUserId: ids[0], blockedUserId: commenter._id,
          displayNameSnapshot: "검증 차단 대상", sourceType: "post", sourceId: post._id });
        release();
        const result = await pending;
        assert.equal(result.error?.status, scenario === "deleted" ? 403 : 404);
        assert.equal(await CommunityComment.countDocuments({ authorId: commenter._id }), 0, "Comment published after access changed during idempotency wait");
      } finally { release(); CommunityComment.findOne = originalFind; }
    }
    console.log("PASS real Mongo comment gate: account deletion, post moderation and a new block during request replay lookup prevent stale comment creation.");
    console.log("Community Mongo service tests PASS: 20 post + 20 comment retries; 3-process uniqueness/quota; old keyless writes; owner and payload conflict; byte fingerprints; staged/remote duplicate cleanup; partial upload failure; index fail-closed.");
  } finally {
    await CommunityUserBlock.deleteMany({ $or: [{ blockerUserId: { $in: ids } }, { blockedUserId: { $in: ids } }] });
    await CommunityComment.deleteMany({ authorId: { $in: ids } });
    await CommunityPost.deleteMany({ authorId: { $in: ids } });
    await CommunityPostingQuota.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
    await fs.promises.rm(fixtureDirectory, { recursive: true });
  }
}
(process.argv[2] === "--child" ? childMain() : main()).catch((error) => { console.error(error); process.exitCode = 1; });
