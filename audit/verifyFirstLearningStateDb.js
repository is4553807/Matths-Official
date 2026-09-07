const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const { getFirstLearningState, saveFirstLearningState, validateFirstLearningState } = require("../services/firstLearningStateService");
const { updateDashboardTutorial } = require("../services/dashboardTutorialService");
const controller = require("../controllers/ipadFirstLearningController");
const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const sample = () => ({ flowVersion: 2, stage: "goal", goal: "school", diagnosticAnswers: [],
  seed: null, conceptId: null, expectedProblemIds: [], problemContentFingerprint: null,
  checkedAnswers: [], topicRead: false, startedAt: "2026-09-07T01:00:00Z",
  learningStartedAt: null, baselineProgress: null });
const save = (revision, state, userId = ids[0]) => saveFirstLearningState({ userId,
  body: { schemaVersion: 1, expectedRevision: revision, state } });

async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  try {
    await User.create(ids.map((_id, index) => ({ _id, name: `첫학습검증${index}`, email: `${_id}@example.test`,
      passwordHash: "audit-only-not-login", role: "student" })));
    // Legacy documents lack all newly-added fields and need no migration.
    await User.collection.updateOne({ _id: ids[0] }, { $unset: { "preferences.firstLearningRevision": "" } });
    assert.deepEqual(await getFirstLearningState({ userId: ids[0] }), {
      schemaVersion: "FIRST_LEARNING_V1", supported: true, revision: 0, state: null, updatedAt: null });
    const first = await save(0, sample());
    assert.equal(first.revision, 1);
    assert.equal(first.state.stage, "goal");
    assert.equal((await getFirstLearningState({ userId: ids[1] })).state, null, "owner is bound to authenticated user");
    const concurrent = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      save(1, { ...sample(), goal: index % 2 ? "review" : "measure" })));
    assert.equal(concurrent.filter((value) => value.status === "fulfilled").length, 1);
    for (const rejected of concurrent.filter((value) => value.status === "rejected")) {
      assert.equal(rejected.reason.status, 409);
      assert.equal(rejected.reason.code, "FIRST_LEARNING_REVISION_CONFLICT");
      assert.equal(rejected.reason.current.revision, 2);
    }
    const checks = { ...sample(), stage: "checks", goal: "examination", diagnosticAnswers: [7, 3],
      conceptId: "C1-1", seed: "18446744073709551615", expectedProblemIds: ["p-1", "p-2", "p-3"],
      problemContentFingerprint: "a".repeat(64), topicRead: true, baselineProgress: 25,
      learningStartedAt: "2026-09-07T01:02:03.456Z", checkedAnswers: [{ problemId: "p-1", correct: false }] };
    const exactSeed = await save(2, checks);
    assert.equal(exactSeed.state.seed, "18446744073709551615");
    assert.equal(exactSeed.state.checkedAnswers[0].correct, false);
    const invalids = [
      { ...sample(), seed: 9007199254740993 }, { ...sample(), seed: "18446744073709551616" },
      { ...sample(), seed: "01" }, { ...sample(), slot: "other-user" }, { ...sample(), token: "forbidden" },
      { ...sample(), confirmedProgress: 100 }, { ...sample(), stage: "passed" },
      { ...sample(), goal: "unknown" }, { ...sample(), diagnosticAnswers: [7, 7] },
      { ...sample(), diagnosticAnswers: [7, 3, 3] }, { ...sample(), topicRead: "true" },
      { ...sample(), expectedProblemIds: ["p", "p"] },
      { ...sample(), checkedAnswers: [{ problemId: "unowned", correct: true }] },
      { ...checks, checkedAnswers: [{ problemId: "p-1", correct: true }, { problemId: "p-1", correct: true }] },
      { ...checks, checkedAnswers: [{ problemId: "p-1", correct: true, answer: "secret" }] },
      { ...checks, stage: "completed" }, { ...sample(), baselineProgress: 101 },
      { ...sample(), startedAt: "2026-02-31T00:00:00Z" }, { ...sample(), seed: true },
      { ...sample(), problemContentFingerprint: "unverified" },
    ];
    for (const invalid of invalids) assert.throws(() => validateFirstLearningState(invalid), { status: 400 });
    for (const revision of [-1, 0.5, "3", Number.MAX_SAFE_INTEGER]) await assert.rejects(() => save(revision, sample()), { status: 400 });
    await assert.rejects(() => saveFirstLearningState({ userId: ids[0], body: {
      schemaVersion: 1, expectedRevision: 3, state: sample(), userId: String(ids[1]),
    } }), { status: 400 });
    // Legacy COMPLETE/SKIP/RESTART response remains the same while atomically
    // invalidating outstanding resume writes on every action.
    let revision = 3;
    for (const [action, status] of [["COMPLETE", "COMPLETED"], ["RESTART", "PENDING"], ["SKIP", "SKIPPED"]]) {
      const response = await updateDashboardTutorial({ userId: ids[0], action });
      assert.deepEqual(Object.keys(response).sort(), ["completedAt", "shouldAutoStart", "skippedAt", "status"]);
      assert.equal(response.status, status);
      const current = await getFirstLearningState({ userId: ids[0] });
      assert.equal(current.revision, ++revision);
      assert.equal(current.state, null);
      await assert.rejects(() => save(revision - 1, checks), { status: 409 });
    }
    // Verify controller exposes conflict data (generic middleware does not).
    const receipt = { headers: {}, set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await controller.save({ apiUser: { _id: ids[0] }, body: { schemaVersion: 1, expectedRevision: 0, state: sample() } }, receipt,
      (error) => { throw error; });
    assert.equal(receipt.statusCode, 409);
    assert.equal(receipt.body.current.revision, revision);
    assert.equal(receipt.headers["Cache-Control"], "private, no-store");
    await User.updateOne({ _id: ids[0] }, { $set: { isActive: false } });
    await assert.rejects(() => save(revision, sample()), { status: 404 });
    console.log("First learning Mongo service tests PASS: owner separation, 20 concurrent CAS writers, 20 malformed states, exact UInt64, legacy tutorial terminal invalidation, conflict HTTP envelope, inactive owner.");
  } finally {
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
