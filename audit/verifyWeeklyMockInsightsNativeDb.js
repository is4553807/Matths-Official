"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { User, PrivateMockExam, PrivateMockExamAttempt } = require("../models/matthsModel");
const { Academy, AcademyClass, AcademyStaff, AcademyStudentMembership } = require("../models/academyModel");
const { createAccessToken } = require("../services/mobileAuthService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");

async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  try {
    const roles = ["teacher", "teacher", "teacher", "admin", "student", "student"];
    const users = await User.create(roles.map((role, index) => ({ name: `주간분석검증${index}`,
      email: `${new mongoose.Types.ObjectId()}@qa.invalid`, passwordHash: "audit-only", role,
      teacherAccessExpiresAt: new Date(Date.now() + 365 * 86400000) })));
    const tokens = users.map(createAccessToken);
    const academies = await Academy.create([0, 2].map((index) => ({ name: `분석 학원 ${index}`, nameNormalized: `분석 학원 ${index}`,
      status: "ACTIVE", createdByUserId: users[index]._id, contractStartsAt: new Date(Date.now() - 86400000),
      contractEndsAt: new Date(Date.now() + 365 * 86400000) })));
    await AcademyStaff.create([0, 1, 2].map((index) => ({ academyId: academies[index < 2 ? 0 : 1]._id,
      userId: users[index]._id, role: index === 1 ? "TEACHER" : "OWNER", status: "ACTIVE", currentStaffKey: String(users[index]._id) })));
    const classes = await AcademyClass.create([0, 1].map((index) => ({ academyId: academies[index]._id,
      name: `분석반 ${index}`, nameNormalized: `분석반 ${index}`, createdByUserId: users[index ? 2 : 0]._id,
      homeroomTeacherUserId: users[index ? 2 : 0]._id, coTeacherUserIds: index ? [] : [users[1]._id] })));
    await AcademyStudentMembership.create([0, 1].map((index) => ({ academyId: academies[index]._id, classId: classes[index]._id,
      studentUserId: users[index + 4]._id, activeStudentKey: String(users[index + 4]._id), status: "APPROVED",
      dataConsentAt: new Date(), approvedAt: new Date() })));
    const examID = new mongoose.Types.ObjectId();
    const concepts = ["다항식", "방정식"].map((conceptTitle, index) => ({ conceptId: `concept-${index}`, conceptTitle,
      courseTitle: "공통수학", unitTitle: `단원 ${index}` }));
    // Minimal deterministic DB documents exercise the real aggregation and real
    // Express/Bearer route without scheduling/uploading any official exam.
    await PrivateMockExam.collection.insertOne({ _id: examID, title: "분석 검증 회차", status: "open", isTest: false,
      releaseAt: new Date(Date.now() - 86400000), questionCount: 2, questionConcepts: concepts });
    await PrivateMockExamAttempt.collection.insertMany([
      { examId: examID, userId: users[4]._id, status: "submitted", score: 50, correctByQuestion: [true, false], integrityStatus: "CLEAR" },
      { examId: examID, userId: users[5]._id, status: "submitted", score: 0, correctByQuestion: [false, false], integrityStatus: "NOT_REVIEWED" },
      { examId: examID, userId: users[4]._id, status: "submitted", score: 100, correctByQuestion: [true, true], integrityStatus: "FLAGGED" },
      { examId: examID, userId: users[4]._id, status: "submitted", score: 100, correctByQuestion: [true, true], integrityStatus: "CLEAR", submissionFinalization: { status: "pending" } },
    ]);
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
    const get = async (path, account = 0) => {
      const response = await fetch(origin + path, { headers: account === null ? {} : { Authorization: `Bearer ${tokens[account]}` } });
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    };
    const teacherPath = "/academy/teacher/weekly-mock-insights";
    const globalPath = "/admin/weekly-mock-insights";
    const academyPath = `/academy/admin/${academies[0]._id}/weekly-mock-insights`;
    assert.equal((await get(teacherPath, null)).status, 401);
    assert.equal((await get(teacherPath, 4)).status, 403);
    assert.equal((await get(globalPath, 0)).status, 403);
    assert.equal((await get(academyPath, 0)).status, 403);
    const academy = await get(teacherPath);
    assert.equal(academy.status, 200, JSON.stringify(academy.body));
    assert.equal(academy.cache, "private, no-store");
    assert.equal(academy.body.schemaVersion, "WEEKLY_MOCK_INSIGHTS_NATIVE_V1");
    assert.equal(academy.body.overall.participantCount, 1); assert.equal(academy.body.overall.submissionCount, 1);
    assert.equal(academy.body.overall.averageScore, 50); assert.equal(academy.body.overall.conceptCount, 2);
    assert.equal(academy.body.overall.hardestConcept.conceptTitle, "방정식");
    assert.equal(academy.body.classes.length, 1); assert.equal(academy.body.classes[0].classId, String(classes[0]._id));
    assert.ok(!JSON.stringify(academy.body).includes(users[4].email), "no student identities in aggregate response");
    const assigned = await get(`${teacherPath}?classId=${classes[0]._id}`, 1);
    assert.equal(assigned.status, 200); assert.equal(assigned.body.scope.kind, "class");
    assert.equal(assigned.body.overall.averageScore, 50); assert.deepEqual(assigned.body.classes, []);
    assert.equal((await get(`${teacherPath}?classId=${classes[1]._id}`, 1)).status, 404);
    assert.equal((await get(`${teacherPath}?classId=${classes[0]._id}`, 2)).status, 404);
    assert.equal((await get(`${teacherPath}?classId=a`, 1)).status, 400);
    assert.equal((await get(`${teacherPath}?classId=${classes[0]._id}&classId=${classes[1]._id}`, 1)).status, 400);
    const global = await get(globalPath, 3);
    assert.equal(global.status, 200); assert.equal(global.body.overall.participantCount, 2);
    assert.equal(global.body.overall.averageScore, 25); assert.equal(global.body.overall.submissionCount, 2);
    assert.equal(global.body.overall.concepts.find((row) => row.conceptTitle === "다항식").difficulty, 50);
    const adminAcademy = await get(academyPath, 3);
    assert.equal(adminAcademy.status, 200); assert.deepEqual(adminAcademy.body.overall.concepts, academy.body.overall.concepts);
    assert.equal((await get(`/academy/admin/${new mongoose.Types.ObjectId()}/weekly-mock-insights`, 3)).status, 404);
    console.log("PASS real HTTP/Bearer/Mongo: teacher academy/assigned class, admin global/academy, canonical counts, flagged/pending exclusion, cross-academy/student/anonymous/malformed denial.");

    const detail = await get(`/admin/weekly-mock-exams/${examID}`, 3);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    const reviewConcept = detail.body.detail.attempts[0].review[0].concept;
    assert.equal(reviewConcept.conceptId, concepts[0].conceptId);
    assert.equal(reviewConcept.conceptTitle, concepts[0].conceptTitle);
    assert.equal(reviewConcept.courseTitle, concepts[0].courseTitle);
    assert.equal(reviewConcept.unitTitle, concepts[0].unitTitle);
    assert.equal(reviewConcept.curriculumId, "", "legacy absent metadata remains absent, never invented");
    for (const [key, filename, mime] of [["skeleton", "matths-answer-key-skeleton.json", "application/json"], ["catalog", "matths-ai-concept-catalog.md", "text/markdown"]]) {
      const source = await fs.readFile(path.join(__dirname, "../public/templates", filename));
      const result = await fetch(`${origin}/admin/answer-key-resources/${key}`, { headers: { Authorization: `Bearer ${tokens[3]}` } });
      assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
      assert.ok(result.headers.get("content-type").startsWith(mime));
      assert.equal(result.headers.get("x-content-type-options"), "nosniff");
      assert.equal(result.headers.get("x-content-sha256"), createHash("sha256").update(source).digest("hex"));
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), source, "download must be byte-identical to tracked upstream original");
      assert.equal((await get(`/admin/answer-key-resources/${key}`, 0)).status, 403);
      assert.equal((await get(`/admin/answer-key-resources/${key}`, null)).status, 401);
    }
    for (const unknown of ["unknown", "__proto__", "constructor", "..%2F..%2F.env"]) {
      assert.equal((await get(`/admin/answer-key-resources/${unknown}`, 3)).status, 404);
    }
    console.log("PASS admin review concept metadata preserves source values; template JSON/MD downloads match real tracked originals byte-for-byte and deny unauthenticated/non-admin/path traversal.");

    const originalAggregate = PrivateMockExamAttempt.aggregate;
    let enter, release, held = false;
    const entered = new Promise((resolve) => { enter = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    PrivateMockExamAttempt.aggregate = function (...args) {
      return originalAggregate.apply(this, args).exec().then(async (result) => {
        if (!held) { held = true; enter(); await gate; }
        return result;
      });
    };
    try {
      const pending = get(`${teacherPath}?classId=${classes[0]._id}`, 1);
      await entered;
      await AcademyClass.updateOne({ _id: classes[0]._id }, { $set: { coTeacherUserIds: [] } });
      release();
      assert.equal((await pending).status, 403, "class access removed during aggregation must not return its result");
    } finally { release(); PrivateMockExamAttempt.aggregate = originalAggregate; }
    await User.updateOne({ _id: users[3]._id }, { $set: { role: "student" } });
    assert.equal((await get(globalPath, 3)).status, 403);
    console.log("PASS authorization revocation during real aggregate and stale-token administrator role change deny results.");
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
