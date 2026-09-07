"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const { User } = require("../models/matthsModel");
const { Academy, AcademyClass, AcademyStaff, AcademyStudentMembership, AcademyClassWeek, AcademyAssignmentSubmission } = require("../models/academyModel");
const { createAccessToken } = require("../services/mobileAuthService");
const { updateUserRole } = require("../services/adminService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");

function noAnswerKey(value) {
  if (value && typeof value === "object") {
    assert.ok(!Object.hasOwn(value, "answerKey"), "student response contains teacher answerKey");
    for (const nested of Object.values(value)) noAnswerKey(nested);
  }
}
function kstInput(date) { return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16); }
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  try {
    await Promise.all([AcademyStaff, AcademyClassWeek, AcademyStudentMembership, AcademyAssignmentSubmission].map((model) => model.createIndexes()));
    const users = await User.create(["teacher", "teacher", "teacher", "admin", "student", "student", "student", "student", "student"].map((role, index) => ({
      name: `원어민OMR검증${index}`, email: `${new mongoose.Types.ObjectId()}@qa.invalid`, passwordHash: "audit-only", role,
      teacherAccessExpiresAt: new Date(Date.now() + 365 * 86400000),
    })));
    const tokens = users.map(createAccessToken);
    const academies = await Academy.create([0, 2].map((index) => ({ name: `OMR 검증 학원 ${index}`, nameNormalized: `omr 검증 학원 ${index}`,
      status: "ACTIVE", createdByUserId: users[index]._id, contractStartsAt: new Date(Date.now() - 86400000),
      contractEndsAt: new Date(Date.now() + 365 * 86400000) })));
    await AcademyStaff.create([0, 1, 2].map((index) => ({ academyId: academies[index < 2 ? 0 : 1]._id,
      userId: users[index]._id, role: index === 1 ? "TEACHER" : "OWNER", status: "ACTIVE", currentStaffKey: String(users[index]._id) })));
    const classes = await AcademyClass.create([0, 0, 1].map((academyIndex, index) => ({ academyId: academies[academyIndex]._id,
      name: `OMR 검증반 ${index}`, nameNormalized: `omr 검증반 ${index}`, createdByUserId: users[academyIndex ? 2 : 0]._id,
      homeroomTeacherUserId: users[academyIndex ? 2 : 0]._id, coTeacherUserIds: index === 0 ? [users[1]._id] : [],
    })));
    await AcademyStudentMembership.create([4, 5, 6, 7, 8].map((index) => ({ academyId: academies[index === 6 ? 1 : 0]._id,
      classId: classes[index === 6 ? 2 : index === 7 ? 1 : 0]._id, studentUserId: users[index]._id,
      activeStudentKey: String(users[index]._id), status: "APPROVED", dataConsentAt: new Date(), approvedAt: new Date(Date.now() - 2 * 86400000) })));
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (method, path, account, body) => {
      const response = await fetch(origin + path, { method,
        headers: { ...(account === null ? {} : { Authorization: `Bearer ${tokens[account]}` }), "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    };
    const teacherPath = `/academy/teacher/classes/${classes[0]._id}/classwork`;
    const baseDraft = { academicYear: 2026, weekNumber: 1, title: "혼합 OMR", lessonSummary: "네이티브 API 통합 검증",
      conceptKeys: ["common-math-1/polynomials/polynomial-arithmetic"], assignmentTitle: "혼합 과제", assignmentInstructions: "검증 전용",
      dueAt: kstInput(new Date(Date.now() + 2 * 86400000)) };
    const omr = { enabled: true, questionCount: 4, sections: [
      { startNumber: 1, endNumber: 1, answerType: "MULTIPLE_CHOICE", choiceCount: 2 },
      { startNumber: 2, endNumber: 2, answerType: "SHORT_ANSWER" },
      { startNumber: 3, endNumber: 3, answerType: "MULTIPLE_CHOICE", choiceCount: 9 },
      { startNumber: 4, endNumber: 4, answerType: "SHORT_ANSWER" },
    ], answers: ["2", "12|12.0", "9", "가 나"] };
    const created = await request("POST", teacherPath + "/weeks", 0, { ...baseDraft, assignmentOmr: JSON.stringify(omr) });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const week = created.body.weeks.find((row) => row.weekNumber === 1);
    assert.deepEqual(week.assignmentOmr.answerKey, ["2", "12|12.0", "9", "가나"]);
    assert.deepEqual(week.assignmentOmr.questions.map((row) => row.answerType), ["MULTIPLE_CHOICE", "SHORT_ANSWER", "MULTIPLE_CHOICE", "SHORT_ANSWER"]);
    const studentPath = `/academy/student/weeks/${week.id}`;
    const firstRead = await request("GET", studentPath, 4);
    assert.equal(firstRead.status, 200); assert.equal(firstRead.cache, "private, no-store");
    noAnswerKey(firstRead.body); assert.equal(firstRead.body.submission, null);
    assert.deepEqual(firstRead.body.week.assignmentOmr.questions.map((row) => row.answer), ["", "", "", ""]);
    const dashboard = await request("GET", "/academy/student", 4);
    assert.equal(dashboard.status, 200); noAnswerKey(dashboard.body);
    assert.ok(dashboard.body.weeks.some((row) => row.assignmentOmr?.questionCount === 4));
    assert.equal((await request("GET", teacherPath, null)).status, 401);
    assert.equal((await request("GET", teacherPath, 4)).status, 403);
    assert.equal((await request("GET", teacherPath, 2)).status, 404);
    assert.equal((await request("GET", `/academy/teacher/classes/${classes[1]._id}/classwork`, 1)).status, 403);
    for (const account of [6, 7]) {
      assert.equal((await request("GET", studentPath, account)).status, 404);
      assert.equal((await request("POST", studentPath + "/submission", account, { answers: ["2", "12", "9", "가나"] })).status, 404);
    }
    assert.equal((await request("POST", studentPath + "/submission", null, { answers: ["2"] })).status, 401);
    const first = await request("POST", studentPath + "/submission", 4, { answers: ["2", "12.0", "8", "가나"], studentUserId: String(users[5]._id), scorePercent: 100 });
    assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.schemaVersion, "ACADEMY_ASSIGNMENT_V1");
    assert.equal(first.body.submission.scorePercent, 75); assert.deepEqual(first.body.submission.correctByQuestion, [true, true, false, true]);
    noAnswerKey(first.body); assert.equal(await AcademyAssignmentSubmission.countDocuments({ weekId: week.id, studentUserId: users[5]._id }), 0);
    const second = await request("POST", studentPath + "/submission", 4, { answers: ["1", "12", "9", "가 나"] });
    assert.equal(second.status, 200); assert.equal(second.body.submission.scorePercent, 75);
    assert.equal(second.body.submission.id, first.body.submission.id);
    assert.equal(await AcademyAssignmentSubmission.countDocuments({ weekId: week.id, studentUserId: users[4]._id }), 1);
    await request("POST", studentPath + "/submission", 5, { answers: ["2", "wrong", "9", "가나"] });
    const ownedRead = await request("GET", studentPath, 4);
    assert.deepEqual(ownedRead.body.submission.answers, ["1", "12", "9", "가나"]); noAnswerKey(ownedRead.body);
    const teacherRead = await request("GET", teacherPath, 1);
    assert.equal(teacherRead.status, 200); const gradedWeek = teacherRead.body.weeks.find((row) => row.id === week.id);
    assert.equal(gradedWeek.submissions.length, 2); assert.ok(gradedWeek.submissions.every((row) => row.student?.id));
    assert.deepEqual(gradedWeek.submissions.find((row) => row.student.id === String(users[4]._id)).correctByQuestion, [false, true, true, true]);
    const changedKey = { ...omr, answers: ["1", "12|12.0", "9", "가나"] };
    const regraded = await request("POST", teacherPath + "/weeks", 1, { ...baseDraft, weekId: week.id, assignmentOmr: changedKey });
    assert.equal(regraded.status, 200, JSON.stringify(regraded.body));
    const nextWeek = regraded.body.weeks.find((row) => row.id === week.id);
    assert.equal(nextWeek.submissions.find((row) => row.student.id === String(users[4]._id)).scorePercent, 100);
    assert.equal(nextWeek.submissions.find((row) => row.student.id === String(users[5]._id)).scorePercent, 50);
    const omittedOmr = await request("POST", teacherPath + "/weeks", 1, { ...baseDraft, weekId: week.id, title: "기존 앱 메타데이터 수정" });
    assert.equal(omittedOmr.status, 200); assert.deepEqual(omittedOmr.body.weeks.find((row) => row.id === week.id).assignmentOmr.answerKey, ["1", "12|12.0", "9", "가나"]);
    console.log("PASS mixed teacher OMR, student redaction, native draft omission compatibility, owner-only submission/resubmission, canonical grading and teacher answer-change regrading.");

    for (const answers of [[], [1], ["x".repeat(81)], Array(101).fill("1"), ["1", "", "9", "가나"], ["3", "12", "9", "가나"]]) {
      assert.equal((await request("POST", studentPath + "/submission", 4, { answers })).status, 400);
    }
    const closed = await request("POST", teacherPath + "/weeks", 0, { ...baseDraft, weekId: week.id, dueAt: kstInput(new Date(Date.now() - 3600000)) });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.equal((await request("POST", studentPath + "/submission", 4, { answers: ["1", "12", "9", "가나"] })).status, 410);
    const missed = await request("GET", studentPath, 8);
    assert.equal(missed.body.submission.status, "MISSED"); assert.equal(missed.body.submission.scorePercent, 0);
    assert.equal(missed.body.submission.submittedAt, null); noAnswerKey(missed.body);
    const kept = await request("GET", studentPath, 4); assert.equal(kept.body.submission.status, "SUBMITTED"); assert.equal(kept.body.submission.scorePercent, 100);
    const reopened = await request("POST", teacherPath + "/weeks", 0, { ...baseDraft, weekId: week.id });
    assert.equal(reopened.status, 200); assert.equal((await request("GET", studentPath, 8)).body.submission, null);
    assert.equal((await request("POST", studentPath + "/submission", 8, { answers: ["1", "12", "9", "가나"] })).status, 200);
    const legacy = await request("POST", teacherPath + "/weeks", 0, { ...baseDraft, weekNumber: 2, title: "OMR 없는 주차" });
    assert.equal(legacy.status, 200); const legacyWeek = legacy.body.weeks.find((row) => row.weekNumber === 2);
    assert.equal(legacyWeek.assignmentOmr, null);
    const legacyRead = await request("GET", `/academy/student/weeks/${legacyWeek.id}`, 4);
    assert.equal(legacyRead.status, 200); assert.equal(legacyRead.body.week.assignmentOmr, null); assert.equal(legacyRead.body.submission, null);
    assert.equal((await request("POST", `/academy/student/weeks/${legacyWeek.id}/submission`, 4, { answers: ["1"] })).status, 404);
    console.log("PASS input bounds, deadline rejection, automatic MISSED zero, prior result preservation, reopened deadline, and legacy OMR-free weeks.");

    // Actual administrator role transition (not a hand-edited inconsistent role)
    // leaves an active teacher staff row for a non-owner. A new student token
    // must still be rejected by the teacher answer-key/authoring boundary.
    await updateUserRole({ adminUserId: users[3]._id, userId: users[1]._id, role: "student", reason: "권한 회수 회귀" });
    tokens[1] = createAccessToken(await User.findById(users[1]._id));
    const formerTeacher = await request("GET", teacherPath, 1);
    if (formerTeacher.status === 200) console.log("REPRO former teacher fresh student token can still GET teacher OMR answerKey:", Boolean(formerTeacher.body.weeks.find((row) => row.id === week.id)?.assignmentOmr?.answerKey));
    assert.equal(formerTeacher.status, 403, "revoked teacher role must not read teacher answer key using retained staff membership");
    assert.equal((await request("POST", teacherPath + "/weeks", 1, { ...baseDraft, weekId: week.id, assignmentOmr: changedKey })).status, 403);
    const fileID = new mongoose.Types.ObjectId();
    async function deniedClassworkSurface() {
      assert.equal((await request("GET", teacherPath, 1)).status, 403);
      assert.equal((await request("POST", teacherPath + "/weeks", 1, { ...baseDraft, weekId: week.id, assignmentOmr: changedKey })).status, 403);
      assert.equal((await request("POST", `${teacherPath}/weeks/${week.id}/files/${fileID}/remove`, 1, {})).status, 403);
      assert.equal((await request("POST", `${teacherPath}/weeks/${week.id}/delete`, 1, {})).status, 403);
      assert.equal((await request("GET", `${teacherPath}/weeks/${week.id}/files/${fileID}`, 1)).status, 403);
      assert.ok(await AcademyClassWeek.exists({ _id: week.id }), "denied delete mutated the week");
    }
    await deniedClassworkSurface();
    async function restoreTeacher() {
      await updateUserRole({ adminUserId: users[3]._id, userId: users[1]._id, role: "teacher", reason: "권한 복구 회귀",
        teacherAccessExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) });
      tokens[1] = createAccessToken(await User.findById(users[1]._id));
      await AcademyClass.updateOne({ _id: classes[0]._id }, { $set: { coTeacherUserIds: [users[1]._id] } });
    }
    await restoreTeacher();
    await User.updateOne({ _id: users[1]._id }, { $set: { teacherAccessExpiresAt: new Date(Date.now() - 60000) } });
    await deniedClassworkSurface();
    await restoreTeacher();
    assert.equal((await request("GET", teacherPath, 1)).status, 200);
    console.log("PASS all native classwork routes reject administrator-revoked and expired teacher accounts; valid restored teacher remains supported.");

    for (const change of ["role", "class-assignment"]) {
      await restoreTeacher();
      const originalFind = AcademyClassWeek.find;
      let enter, release, reached = false, timer;
      const entered = new Promise((resolve, reject) => {
        enter = resolve; timer = setTimeout(() => reject(new Error("OMR read gate not reached")), 10000);
      });
      const gate = new Promise((resolve) => { release = resolve; });
      AcademyClassWeek.find = function (...args) {
        const query = originalFind.apply(this, args), lean = query.lean;
        query.lean = function (...options) {
          return lean.apply(this, options).exec().then(async (rows) => {
            if (!reached) { reached = true; enter(); await gate; }
            return rows;
          });
        };
        return query;
      };
      try {
        const pending = request("GET", teacherPath, 1);
        await entered; clearTimeout(timer);
        if (change === "role") await updateUserRole({ adminUserId: users[3]._id, userId: users[1]._id, role: "student", reason: "조회 중 권한 회수" });
        else await AcademyClass.updateOne({ _id: classes[0]._id }, { $set: { coTeacherUserIds: [] } });
        release(); const response = await pending;
        assert.equal(response.status, 403, `${change} revoked while teacher data was awaited must suppress answer keys`);
        noAnswerKey(response.body);
      } finally { clearTimeout(timer); release(); AcademyClassWeek.find = originalFind; }
    }
    console.log("PASS role and assigned-class permission revocation during an actual awaited OMR read suppress teacher answer-key responses.");
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
