"use strict";

// Real service + Mongoose + isolated MongoDB. Only scheduling is intercepted:
// no fake database results, grading functions, models, or update outcomes.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const { AssessmentAttempt, ConceptProgress, ProblemAttempt } = require("../models/matthsModel");
const service = require("../services/assessmentService");
const { createAssessmentRecordIdempotently } = service._testing;
const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const cases = [];

function paper(overrides = {}) {
  return {
    paperId: randomUUID(),
    scopeType: "subunit",
    courseId: "common-math-1",
    unitId: "polynomials",
    subunitId: "polynomial-arithmetic",
    title: "격리 평가 경합 검증",
    totalPoints: 100,
    timeLimitMs: 600000,
    startedAt: new Date(),
    questions: [{
      questionId: "q1", typeId: "audit-linear", difficulty: "mid-high",
      sourceCourseId: "common-math-1", sourceUnitId: "polynomials",
      sourceSubunitId: "polynomial-arithmetic", sourceConceptId: "polynomial-arithmetic",
      prompt: "1+1=?", inputMode: "short-answer", answer: "2", points: 100,
    }],
    ...overrides,
  };
}

const create = (overrides = {}) => AssessmentAttempt.create({ userId, ...paper(overrides) });
const input = (attempt, answer = "3") => ({ userId, attemptId: attempt._id, answers: { q1: answer } });
const read = (attempt) => AssessmentAttempt.findById(attempt._id);
const conflict = (code) => (error) => error.status === 409 && error.code === code;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function check(name, fn) {
  await fn();
  cases.push(name);
  console.log(`PASS ${name}`);
}

function holdOneWrite(attempt, predicate = () => true) {
  const original = AssessmentAttempt.findOneAndUpdate;
  const reached = deferred();
  const release = deferred();
  let held = false;
  AssessmentAttempt.findOneAndUpdate = async function(filter, update, options) {
    if (!held && String(filter._id) === String(attempt._id) && predicate(update)) {
      held = true;
      reached.resolve({ filter, update });
      await release.promise;
    }
    return original.call(this, filter, update, options);
  };
  return {
    reached: reached.promise,
    release: release.resolve,
    restore() { release.resolve(); AssessmentAttempt.findOneAndUpdate = original; },
  };
}

async function raceWrites(attempt, operations) {
  const original = AssessmentAttempt.findOneAndUpdate;
  const barrier = deferred();
  let waiting = 0;
  AssessmentAttempt.findOneAndUpdate = async function(filter, update, options) {
    if (String(filter._id) === String(attempt._id) && waiting < operations.length) {
      waiting += 1;
      if (waiting === operations.length) barrier.resolve();
      await barrier.promise;
    }
    return original.call(this, filter, update, options);
  };
  const timeout = setTimeout(() => barrier.resolve(), 10000);
  try {
    const results = await Promise.all(operations.map((operation) => operation()));
    assert.equal(waiting, operations.length, "all operations must reach their first conditional write");
    return results;
  } finally {
    clearTimeout(timeout);
    barrier.resolve();
    AssessmentAttempt.findOneAndUpdate = original;
  }
}

async function main() {
  assert.match(String(process.env.DB || ""), /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/matths_audit_/,
    "only the loopback isolated memory Mongo audit database may be mutated");
  await mongoose.connect(process.env.DB, { autoIndex: false });
  try {
    await check("abandoned draft, submit and expiry reject without mutation", async () => {
      const attempt = await create({ status: "abandoned" });
      const before = (await read(attempt)).toObject();
      for (const operation of [service.saveAssessmentDraft, service.submitAssessmentAttempt, service.expireAssessmentAttempt]) {
        await assert.rejects(operation(input(attempt)), conflict("ASSESSMENT_ABANDONED"));
      }
      assert.deepEqual((await read(attempt)).toObject(), before);
      assert.equal(await ProblemAttempt.countDocuments({ userId }), 0);
    });

    await check("malformed, foreign-owner and placement IDs stay unavailable", async () => {
      const foreign = await create({ userId: otherUserId });
      const placement = await create({ scopeType: "placement" });
      for (const operation of [service.saveAssessmentDraft, service.submitAssessmentAttempt, service.expireAssessmentAttempt]) {
        for (const attemptId of ["malformed", foreign._id, placement._id, new mongoose.Types.ObjectId()]) {
          await assert.rejects(operation({ userId, attemptId }), (error) => error.status === 404);
        }
      }
    });

    await check("20 concurrent submits finalize once and create one wrong answer", async () => {
      const attempt = await create();
      const before = await ProblemAttempt.countDocuments({ userId });
      const results = await raceWrites(attempt, Array.from({ length: 20 }, () => () =>
        service.submitAssessmentAttempt(input(attempt))));
      assert.equal(results.filter((value) => !value.$locals.wasAlreadyFinalized).length, 1);
      assert.ok(results.every((value) => value.status === "submitted" && value.scorePercent === 0));
      assert.equal((await read(attempt)).mutationRevision, 1);
      assert.equal(await ProblemAttempt.countDocuments({ userId }), before + 1);
      const replay = await service.submitAssessmentAttempt(input(attempt, "2"));
      assert.equal(replay.scorePercent, 0, "replay must not replace submitted grade or answers");
      assert.equal(await ProblemAttempt.countDocuments({ userId }), before + 1);
    });

    await check("terminal draft receipts and early expiry preserve legacy contract", async () => {
      const live = await create();
      await assert.rejects(service.expireAssessmentAttempt(input(live)), (error) =>
        error.status === 409 && error.remainingTimeMs > 0);
      const submitted = await service.submitAssessmentAttempt(input(live, "2"));
      const before = (await read(live)).toObject();
      const receipt = await service.saveAssessmentDraft(input(live, "wrong"));
      assert.equal(receipt.status, "submitted");
      assert.equal(receipt.expired, false);
      assert.equal(receipt.redirectUrl, `/assessments/${live._id}`);
      const expiredReplay = await service.expireAssessmentAttempt(input(live));
      assert.equal(expiredReplay.$locals.wasAlreadyFinalized, true);
      assert.equal(submitted.scorePercent, 100);
      assert.deepEqual((await read(live)).toObject(), before);
    });

    await check("delayed stale draft cannot overwrite accepted newer draft", async () => {
      const attempt = await create();
      const gate = holdOneWrite(attempt);
      const stale = service.saveAssessmentDraft(input(attempt, "stale")).then(
        (value) => ({ value }), (error) => ({ error }));
      try {
        await gate.reached;
        await service.saveAssessmentDraft(input(attempt, "newer"));
        gate.release();
        assert.ok(conflict("ASSESSMENT_DRAFT_CONFLICT")((await stale).error));
        const stored = await read(attempt);
        assert.equal(stored.questions[0].submittedAnswer, "newer");
        assert.equal(stored.mutationRevision, 1);
      } finally { gate.restore(); }
    });

    await check("delayed draft cannot overwrite winning submission", async () => {
      const attempt = await create();
      const gate = holdOneWrite(attempt, (update) => !update.$set.status);
      const draft = service.saveAssessmentDraft(input(attempt, "stale"));
      try {
        await gate.reached;
        await service.submitAssessmentAttempt(input(attempt, "2"));
        const before = (await read(attempt)).toObject();
        gate.release();
        assert.equal((await draft).status, "submitted");
        assert.deepEqual((await read(attempt)).toObject(), before);
      } finally { gate.restore(); }
    });

    await check("abandonment wins over an already-read submit", async () => {
      const attempt = await create();
      const before = await ProblemAttempt.countDocuments({ userId });
      const gate = holdOneWrite(attempt);
      const submit = service.submitAssessmentAttempt(input(attempt)).then(
        (value) => ({ value }), (error) => ({ error }));
      try {
        await gate.reached;
        await AssessmentAttempt.updateOne({ _id: attempt._id, status: "in-progress" }, { $set: { status: "abandoned" } });
        gate.release();
        assert.ok(conflict("ASSESSMENT_ABANDONED")((await submit).error));
        assert.equal((await read(attempt)).status, "abandoned");
        assert.equal(await ProblemAttempt.countDocuments({ userId }), before);
      } finally { gate.restore(); }
    });

    await check("submit retries a changed snapshot and uses the latest omitted answer", async () => {
      const attempt = await create();
      const gate = holdOneWrite(attempt, (update) => update.$set.status === "submitted");
      const submit = service.submitAssessmentAttempt({ userId, attemptId: attempt._id });
      try {
        await gate.reached;
        await service.saveAssessmentDraft(input(attempt, "2"));
        gate.release();
        const result = await submit;
        assert.equal(result.status, "submitted");
        assert.equal(result.scorePercent, 100);
        assert.equal(result.questions[0].submittedAnswer, "2");
        assert.equal(result.mutationRevision, 2);
      } finally { gate.restore(); }
    });

    await check("stale expiry preserves a newer persisted draft and respects terminal winner", async () => {
      const attempt = await create({ startedAt: new Date(Date.now() - 5000), timeLimitMs: 1000 });
      const gate = holdOneWrite(attempt);
      const expiry = service.expireAssessmentAttempt(input(attempt, "stale"));
      try {
        await gate.reached;
        // Simulate an older deployment's already-issued draft write. The new
        // expiry must notice its revision/timestamp, rather than overwrite it.
        await AssessmentAttempt.updateOne({ _id: attempt._id }, {
          $set: { "questions.0.submittedAnswer": "newer persisted" },
          $inc: { mutationRevision: 1 },
        });
        gate.release();
        const result = await expiry;
        assert.equal(result.status, "disqualified");
        assert.equal(result.questions[0].submittedAnswer, "newer persisted");
        assert.equal(result.mutationRevision, 2);
      } finally { gate.restore(); }
      const later = await service.expireAssessmentAttempt(input(attempt, "another stale answer"));
      assert.equal(later.$locals.wasAlreadyFinalized, true);
      assert.equal(later.questions[0].submittedAnswer, "newer persisted");
    });

    await check("20 overdue submit/expire requests disqualify only once", async () => {
      const attempt = await create({ startedAt: new Date(Date.now() - 5000), timeLimitMs: 1000 });
      const before = await ProblemAttempt.countDocuments({ userId });
      const results = await raceWrites(attempt, Array.from({ length: 20 }, (_, index) => () =>
        (index % 2 ? service.expireAssessmentAttempt : service.submitAssessmentAttempt)(input(attempt, "2"))));
      assert.ok(results.every((value) => value.status === "disqualified" && value.scorePercent === 0));
      assert.equal(results.filter((value) => !value.$locals.wasAlreadyFinalized).length, 1);
      const stored = await read(attempt);
      assert.equal(stored.mutationRevision, 1);
      assert.equal(stored.elapsedTimeMs, 1000);
      assert.equal(stored.submittedAt.getTime(), stored.startedAt.getTime() + 1000);
      assert.equal(await ProblemAttempt.countDocuments({ userId }), before);
      assert.equal((await service.saveAssessmentDraft(input(attempt))).expired, true);
    });

    await check("deadline checked at database write, not stale request read", async () => {
      const attempt = await create({ timeLimitMs: 1000 });
      const gate = holdOneWrite(attempt);
      const submit = service.submitAssessmentAttempt(input(attempt, "2"));
      try {
        await gate.reached;
        await new Promise((resolve) => setTimeout(resolve, 1100));
        gate.release();
        const result = await submit;
        assert.equal(result.status, "disqualified");
        assert.equal(result.scorePercent, 0);
        assert.equal((await read(attempt)).mutationRevision, 1);
      } finally { gate.restore(); }
    });

    await check("legacy document without revision accepts exactly one first mutation", async () => {
      const attempt = await create();
      await AssessmentAttempt.collection.updateOne({ _id: attempt._id }, { $unset: { mutationRevision: "" } });
      await service.saveAssessmentDraft(input(attempt, "2"));
      assert.equal((await read(attempt)).mutationRevision, 1);
      assert.equal((await service.submitAssessmentAttempt({ userId, attemptId: attempt._id })).scorePercent, 100);
    });

    await check("same start key is concurrent-idempotent and scope-bound", async () => {
      const clientStartId = randomUUID();
      const scopePaper = paper();
      const results = await Promise.all(Array.from({ length: 20 }, () =>
        createAssessmentRecordIdempotently({ userId, clientStartId, paper: { ...scopePaper, paperId: randomUUID() } })));
      assert.equal(new Set(results.map((value) => String(value._id))).size, 1);
      assert.equal(await AssessmentAttempt.countDocuments({ userId, clientStartId }), 1);
      const attempt = results[0];
      await assert.rejects(createAssessmentRecordIdempotently({
        userId, clientStartId, paper: paper({ courseId: "common-math-2" }),
      }), conflict("ASSESSMENT_START_ID_CONFLICT"));
      await assert.rejects(service.createAssessmentAttempt({
        userId, clientStartId, scopeType: "course", courseId: "common-math-1",
      }), conflict("ASSESSMENT_START_ID_CONFLICT"));
      await service.submitAssessmentAttempt(input(attempt, "2"));
      const replay = await service.createAssessmentAttempt({ userId, clientStartId, ...scopePaper });
      assert.equal(String(replay._id), String(attempt._id));
      assert.equal(replay.status, "submitted");
      const abandonedKey = randomUUID();
      const abandoned = await create({ status: "abandoned", clientStartId: abandonedKey });
      await assert.rejects(service.createAssessmentAttempt({ userId, ...scopePaper, clientStartId: abandonedKey }),
        conflict("ASSESSMENT_ABANDONED"));
      await assert.rejects(createAssessmentRecordIdempotently({ userId, clientStartId: abandonedKey, paper: scopePaper }),
        conflict("ASSESSMENT_ABANDONED"));
      assert.equal(await AssessmentAttempt.countDocuments({ userId, clientStartId: abandonedKey }), 1);
      assert.equal((await read(abandoned)).status, "abandoned");
    });

    await check("web empty start replacement and iPad empty resume stay unchanged", async () => {
      const startUser = new mongoose.Types.ObjectId();
      await ConceptProgress.create({
        userId: startUser, curriculumId: "kr-2022", courseId: "common-math-1",
        unitId: "polynomials", conceptId: "polynomial-arithmetic", topicCount: 1,
        completedTopicIndexes: [0],
        masteryGate: { requiredDistinctTypes: 1, correctTypeIds: ["audit"], userCompleted: true },
      });
      const scope = {
        userId: startUser, scopeType: "subunit", courseId: "common-math-1",
        unitId: "polynomials", subunitId: "polynomial-arithmetic",
      };
      const first = await service.createAssessmentAttempt(scope);
      const second = await service.createAssessmentAttempt(scope);
      assert.notEqual(String(first._id), String(second._id), "legacy web replaces an unanswered empty start");
      assert.equal((await read(first)).status, "abandoned");
      const resumedEmpty = await service.createAssessmentAttempt({ ...scope, resumeEmpty: true });
      assert.equal(String(resumedEmpty._id), String(second._id), "iPad explicitly resumes empty start");
      await service.saveAssessmentDraft({
        userId: startUser, attemptId: second._id,
        answers: { [second.questions[0].questionId]: "1" },
      });
      const resumedAnswered = await service.createAssessmentAttempt(scope);
      assert.equal(String(resumedAnswered._id), String(second._id), "legacy web resumes an answered attempt");
      assert.equal(await AssessmentAttempt.countDocuments({ userId: startUser, status: "in-progress" }), 1);
    });

    console.log(JSON.stringify({ suite: "assessment-terminal-safety-real-mongo", passed: cases.length, cases }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
