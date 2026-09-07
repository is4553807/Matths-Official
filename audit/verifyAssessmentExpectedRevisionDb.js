"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const express = require("express");
const { User, AssessmentAttempt, ProblemAttempt } = require("../models/matthsModel");
const { createAccessToken } = require("../services/mobileAuthService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");
const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const cases = [];

function paper(overrides = {}) {
  return { userId: ids[0], paperId: randomUUID(), scopeType: "subunit", courseId: "common-math-1",
    unitId: "polynomials", subunitId: "polynomial-arithmetic", title: "기기 간 수정 번호 검증",
    totalPoints: 100, passScore: 80, timeLimitMs: 600000, startedAt: new Date(),
    questions: [{ questionId: "q1", typeId: "revision-linear", difficulty: "mid-high",
      sourceCourseId: "common-math-1", sourceUnitId: "polynomials", sourceSubunitId: "polynomial-arithmetic",
      sourceConceptId: "polynomial-arithmetic", prompt: "1+1=?", inputMode: "short-answer", answer: "2", points: 100 }],
    ...overrides };
}
async function check(name, callback) { await callback(); cases.push(name); console.log(`PASS ${name}`); }
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  try {
    const users = await User.create(ids.map((_id, index) => ({ _id, name: `평가수정검증${index}`,
      email: `${_id}@qa.invalid`, passwordHash: "audit-only", role: "student" })));
    const tokens = users.map((user) => createAccessToken(user));
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1/assessments`;
    const request = async (suffix, method = "GET", body, account = 0) => {
      const response = await fetch(origin + suffix, { method, headers: {
        Authorization: `Bearer ${tokens[account]}`, ...(body ? { "Content-Type": "application/json" } : {}),
      }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    };
    const draft = (attempt, answer, revision) => request(`/${attempt._id}/draft`, "PATCH", {
      answers: { q1: answer }, ...(revision === undefined ? {} : { expectedRevision: revision }),
    });
    await check("sequential two-device same-question stale write is rejected, not silently rebased", async () => {
      const attempt = await AssessmentAttempt.create(paper());
      const deviceA = await request(`/${attempt._id}`), deviceB = await request(`/${attempt._id}`);
      assert.equal(deviceA.body.assessment.mutationRevision, 0);
      assert.equal(deviceB.body.assessment.mutationRevision, 0);
      const accepted = await draft(attempt, "answer A", deviceA.body.assessment.mutationRevision);
      assert.equal(accepted.status, 200);
      assert.equal(accepted.body.draft.mutationRevision, 1);
      const stale = await draft(attempt, "answer B", deviceB.body.assessment.mutationRevision);
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, "ASSESSMENT_DRAFT_CONFLICT");
      const current = await request(`/${attempt._id}`);
      assert.equal(current.body.assessment.mutationRevision, 1);
      assert.equal(current.body.assessment.answers[0], "answer A");
      const list = await request("");
      assert.equal(list.body.assessments.find((value) => value.id === String(attempt._id)).mutationRevision, 1,
        "bounded list must project the real revision, not hydrate a misleading default zero");
      const staleSubmit = await request(`/${attempt._id}/submit`, "POST", { answers: { q1: "2" }, expectedRevision: 0 });
      assert.equal(staleSubmit.status, 409);
      assert.equal(staleSubmit.body.code, "ASSESSMENT_WRITE_CONFLICT");
      assert.equal((await AssessmentAttempt.findById(attempt._id)).status, "in-progress");
      const resolved = await draft(attempt, "2", current.body.assessment.mutationRevision);
      assert.equal(resolved.body.draft.mutationRevision, 2);
      const submitted = await request(`/${attempt._id}/submit`, "POST", { answers: {}, expectedRevision: 2 });
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.assessment.mutationRevision, 3);
      assert.equal(submitted.body.assessment.scorePercent, 100);
    });
    await check("twenty same-baseline simultaneous native drafts permit one mutation", async () => {
      const attempt = await AssessmentAttempt.create(paper());
      const results = await Promise.all(Array.from({ length: 20 }, (_, index) => draft(attempt, `answer ${index}`, 0)));
      assert.equal(results.filter((value) => value.status === 200).length, 1);
      assert.equal(results.filter((value) => value.status === 409 && value.body.code === "ASSESSMENT_DRAFT_CONFLICT").length, 19);
      assert.equal((await AssessmentAttempt.findById(attempt._id)).mutationRevision, 1);
    });
    await check("submit that loses CAS cannot refresh the revision and overwrite the newer draft", async () => {
      const attempt = await AssessmentAttempt.create(paper());
      const original = AssessmentAttempt.findOneAndUpdate;
      let reached, release;
      const atWrite = new Promise((resolve) => { reached = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      let held = false;
      AssessmentAttempt.findOneAndUpdate = async function (filter, update, options) {
        if (!held && String(filter._id) === String(attempt._id) && update.$set.status === "submitted") {
          held = true; reached(); await gate;
        }
        return original.call(this, filter, update, options);
      };
      const pending = request(`/${attempt._id}/submit`, "POST", { answers: { q1: "stale" }, expectedRevision: 0 });
      try {
        await atWrite;
        assert.equal((await draft(attempt, "2", 0)).status, 200);
        release();
        assert.equal((await pending).body.code, "ASSESSMENT_WRITE_CONFLICT");
        const current = await AssessmentAttempt.findById(attempt._id);
        assert.equal(current.status, "in-progress");
        assert.equal(current.questions[0].submittedAnswer, "2");
      } finally { release(); AssessmentAttempt.findOneAndUpdate = original; }
    });
    await check("stale expiry refuses answer mutation, current expiry returns real revision", async () => {
      const attempt = await AssessmentAttempt.create(paper());
      await draft(attempt, "newer saved answer", 0);
      await AssessmentAttempt.updateOne({ _id: attempt._id }, { $set: { startedAt: new Date(Date.now() - 700000) } });
      const rejected = await request(`/${attempt._id}/expire`, "POST", { answers: { q1: "stale" }, expectedRevision: 0 });
      assert.equal(rejected.status, 409);
      assert.equal(rejected.body.code, "ASSESSMENT_WRITE_CONFLICT");
      const current = await AssessmentAttempt.findById(attempt._id);
      assert.equal(current.status, "in-progress");
      assert.equal(current.questions[0].submittedAnswer, "newer saved answer");
      const expired = await request(`/${attempt._id}/expire`, "POST", { answers: {}, expectedRevision: 1 });
      assert.equal(expired.status, 200);
      assert.equal(expired.body.assessment.status, "disqualified");
      assert.equal(expired.body.assessment.mutationRevision, 2);
    });
    await check("legacy omitted revision and legacy missing DB field retain existing behavior", async () => {
      const attempt = await AssessmentAttempt.create(paper());
      await AssessmentAttempt.collection.updateOne({ _id: attempt._id }, { $unset: { mutationRevision: "" } });
      assert.equal((await request(`/${attempt._id}`)).body.assessment.mutationRevision, 0);
      assert.equal((await draft(attempt, "first", 0)).body.draft.mutationRevision, 1);
      assert.equal((await draft(attempt, "legacy web overwrite")).body.draft.mutationRevision, 2);
      assert.equal((await AssessmentAttempt.findById(attempt._id)).questions[0].submittedAnswer, "legacy web overwrite");
    });
    await check("terminal and abandoned precedence is preserved even with stale or malformed revision", async () => {
      const submitted = await AssessmentAttempt.create(paper({ status: "submitted", mutationRevision: 8, scorePercent: 73, passed: false }));
      const abandoned = await AssessmentAttempt.create(paper({ status: "abandoned", mutationRevision: 8 }));
      for (const [suffix, method] of [["draft", "PATCH"], ["submit", "POST"], ["expire", "POST"]]) {
        const final = await request(`/${submitted._id}/${suffix}`, method, { answers: { q1: "changed" }, expectedRevision: 0 });
        assert.equal(final.status, 200);
        assert.equal((final.body.assessment || final.body.draft).mutationRevision, 8);
        const cancelled = await request(`/${abandoned._id}/${suffix}`, method, { answers: { q1: "changed" }, expectedRevision: -1 });
        assert.equal(cancelled.status, 409);
        assert.equal(cancelled.body.code, "ASSESSMENT_ABANDONED");
      }
      assert.equal((await AssessmentAttempt.findById(submitted._id)).scorePercent, 73);
      assert.equal((await AssessmentAttempt.findById(abandoned._id)).status, "abandoned");
    });
    await check("active invalid revision and foreign owner cannot mutate", async () => {
      const attempt = await AssessmentAttempt.create(paper());
      for (const invalid of [null, true, "0", -1, 0.5, Number.MAX_SAFE_INTEGER, {}]) {
        for (const [suffix, method] of [["draft", "PATCH"], ["submit", "POST"], ["expire", "POST"]]) {
          const result = await request(`/${attempt._id}/${suffix}`, method, { answers: { q1: "2" }, expectedRevision: invalid });
          assert.equal(result.status, 400);
          assert.equal(result.body.code, "ASSESSMENT_REVISION_INVALID");
        }
      }
      const foreign = await request(`/${attempt._id}/draft`, "PATCH", { answers: { q1: "2" }, expectedRevision: 0 }, 1);
      assert.equal(foreign.status, 404);
      assert.equal((await AssessmentAttempt.findById(attempt._id)).mutationRevision, 0);
    });
    console.log(JSON.stringify({ suite: "assessment-expected-revision-real-http-mongo", passed: cases.length, cases }, null, 2));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await ProblemAttempt.deleteMany({ userId: { $in: ids } });
    await AssessmentAttempt.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
