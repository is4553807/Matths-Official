"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const models = require("../models/academyModel");
const { Academy, AcademyStaff, AcademyClass, AcademyStudentMembership, AcademyAttendance, AcademyAttendanceAudit, AcademyAttendanceSession } = models;
const service = require("../services/academyAttendanceService");
const { updateAdminAcademyAttendance } = require("../services/adminAcademyService");
const ids = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());
const dateKey = "2026-09-07";
let academy, group;
function write(teacher, states, options = {}) {
  return service.saveAcademyAttendanceRoster({ teacherUserId: ids[teacher], dateKey,
    classId: group._id, studentUserIds: [ids[3], ids[4]], statuses: states, notes: ["", ""], ...options });
}
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  try {
    await Promise.all([AcademyStaff, AcademyClass, AcademyStudentMembership, AcademyAttendance].map((model) => model.createIndexes()));
    await User.create(ids.map((_id, index) => ({ _id, name: `출결경합검증${index}`, email: `${_id}@qa.invalid`,
      passwordHash: "audit-only", role: index < 2 ? "teacher" : index === 2 ? "admin" : "student",
      teacherAccessExpiresAt: new Date(Date.now() + 365 * 86400000) })));
    academy = await Academy.create({ name: "출결 경합 검증 학원", nameNormalized: "출결 경합 검증 학원",
      status: "ACTIVE", createdByUserId: ids[0], approvedAt: new Date(),
      contractStartsAt: new Date(), contractEndsAt: new Date(Date.now() + 365 * 86400000) });
    await AcademyStaff.create([0, 1].map((index) => ({ academyId: academy._id, userId: ids[index],
      role: index ? "TEACHER" : "OWNER", status: "ACTIVE", currentStaffKey: String(ids[index]) })));
    group = await AcademyClass.create({ academyId: academy._id, name: "검증반", nameNormalized: "검증반",
      createdByUserId: ids[0], homeroomTeacherUserId: ids[0], coTeacherUserIds: [ids[1]] });
    await AcademyStudentMembership.create([3, 4].map((index) => ({ academyId: academy._id, studentUserId: ids[index],
      activeStudentKey: String(ids[index]), status: "APPROVED", classId: group._id,
      dataConsentAt: new Date(), approvedAt: new Date() })));
    const ownerUnscopedDate = "2026-09-08";
    const ownerUnscoped = (status) => service.saveAcademyAttendanceRoster({ teacherUserId: ids[0], dateKey: ownerUnscopedDate,
      studentUserIds: [ids[3]], statuses: [status], notes: ["학원장 전체 범위"] });
    await ownerUnscoped("PRESENT");
    await ownerUnscoped("LATE");
    const ownerUnscopedRows = await AcademyAttendance.find({ academyId: academy._id, studentUserId: ids[3], dateKey: ownerUnscopedDate });
    assert.equal(ownerUnscopedRows.length, 1, "Owner unscoped saves must find their previously inserted effective-class row");
    assert.equal(ownerUnscopedRows[0].status, "LATE");
    assert.equal(String(ownerUnscopedRows[0].classId), String(group._id));
    console.log("PASS owner omitted-class/session retry updates the same assigned-student record.");
    await AcademyStudentMembership.updateOne({ academyId: academy._id, studentUserId: ids[4] }, { $set: { classId: null } });
    const mixedInput = { teacherUserId: ids[0], dateKey: "2026-09-09", studentUserIds: [ids[3], ids[4]], notes: ["배정", "미배정"] };
    await service.saveAcademyAttendanceRoster({ ...mixedInput, statuses: ["PRESENT", "ABSENT"] });
    await service.saveAcademyAttendanceRoster({ ...mixedInput, statuses: ["LATE", "EXCUSED"] });
    const mixedRows = await AcademyAttendance.find({ academyId: academy._id, dateKey: mixedInput.dateKey }).lean();
    assert.equal(mixedRows.length, 2);
    assert.equal(String(mixedRows.find((row) => String(row.studentUserId) === String(ids[3])).classId), String(group._id));
    assert.equal(mixedRows.find((row) => String(row.studentUserId) === String(ids[4])).classId, null);
    const mixedExpected = ids.slice(3).map((studentId) => {
      const row = mixedRows.find((record) => String(record.studentUserId) === String(studentId));
      return { recordId: String(row._id), updatedAt: row.updatedAt.toISOString(), status: row.status, note: row.note };
    });
    await service.saveAcademyAttendanceRoster({ ...mixedInput, statuses: ["ABSENT", "PRESENT"], expectedStates: mixedExpected });
    assert.equal(await AcademyAttendance.countDocuments({ academyId: academy._id, dateKey: mixedInput.dateKey }), 2);
    await assert.rejects(service.saveAcademyAttendanceRoster({ ...mixedInput, teacherUserId: ids[1], statuses: ["PRESENT", "PRESENT"] }), { status: 403 });
    await AcademyStudentMembership.updateOne({ academyId: academy._id, studentUserId: ids[4] }, { $set: { classId: group._id } });
    const manualSession = await AcademyAttendanceSession.create({ academyId: academy._id, classId: group._id,
      sessionKey: `owner-scope-${academy._id}`, dateKey: "2026-09-10", startsAt: new Date("2026-09-10T10:00:00Z"),
      endsAt: new Date("2026-09-10T11:30:00Z"), checkInOpensAt: new Date("2026-09-10T09:50:00Z"),
      lateAfterAt: new Date("2026-09-10T10:05:00Z"), checkInClosesAt: new Date("2026-09-10T10:20:00Z"),
      attendanceMode: "MANUAL", createdByUserId: ids[0] });
    const sessionInput = { teacherUserId: ids[0], dateKey: manualSession.dateKey, sessionId: manualSession._id,
      studentUserIds: [ids[3]], notes: ["명시 회차"] };
    await service.saveAcademyAttendanceRoster({ ...sessionInput, statuses: ["PRESENT"] });
    const repeatedSession = await service.saveAcademyAttendanceRoster({ ...sessionInput, statuses: ["LATE"] });
    assert.equal(repeatedSession.classId, String(group._id));
    await service.saveAcademyAttendanceRoster({ ...sessionInput, classId: group._id, statuses: ["EXCUSED"] });
    const sessionRows = await AcademyAttendance.find({ sessionId: manualSession._id, studentUserId: ids[3] });
    assert.equal(sessionRows.length, 1); assert.equal(sessionRows[0].status, "EXCUSED");
    console.log("PASS owner mixed assigned/unassigned roster, guarded second edit, explicit class/session repeat and staff scope rejection.");
    await write(0, ["PRESENT", "ABSENT"]);
    const staleRoster = await service.getAcademyAttendanceRoster({ teacherUserId: ids[1], dateKey, classId: group._id });
    await write(0, ["LATE", "ABSENT"]);
    const before = await AcademyAttendance.findOne({ academyId: academy._id, studentUserId: ids[3], dateKey });
    assert.equal(before.status, "LATE");
    const staleStatuses = staleRoster.roster.map((row) => String(row.membership.studentUserId._id) === String(ids[4])
      ? "EXCUSED" : row.attendance.status);
    await write(1, staleStatuses);
    const after = await AcademyAttendance.findOne({ academyId: academy._id, studentUserId: ids[3], dateKey });
    assert.equal(after.status, "PRESENT");
    console.log("LEGACY LOST UPDATE REPRODUCED: teacher A changed student 1 PRESENT->LATE; teacher B changed only student 2 but submitted its stale full roster, reverting student 1 LATE->PRESENT.");
    if (process.env.ATTENDANCE_REPRO_ONLY === "1") return;

    const snapshot = () => service.getAcademyAttendanceRoster({ teacherUserId: ids[1], dateKey, classId: group._id });
    const expectedFor = (roster, index) => {
      const row = roster.roster.find((value) => String(value.membership.studentUserId._id) === String(ids[index]));
      const record = row.attendance;
      return record ? { recordId: String(record._id), updatedAt: record.updatedAt?.toISOString() || null,
        status: record.status, note: record.note || "" } : { recordId: null, updatedAt: null, status: null, note: "" };
    };
    const conditional = (teacher, index, status, expectedState, note = "") => write(teacher, [status], {
      studentUserIds: [ids[index]], notes: [note], expectedStates: [expectedState],
    });
    const recordFor = (index) => AcademyAttendance.findOne({ academyId: academy._id, studentUserId: ids[index], dateKey });
    const conflict = (error) => error.status === 409 && error.code === "ATTENDANCE_WRITE_CONFLICT";
    await write(0, ["PRESENT", "ABSENT"]);
    const old = await snapshot();
    await write(0, ["LATE"], { studentUserIds: [ids[3]], notes: [""] });
    await conditional(1, 4, "EXCUSED", expectedFor(old, 4));
    assert.equal((await recordFor(3)).status, "LATE", "changed-row-only leaves another student's newer record alone");
    assert.equal((await recordFor(4)).status, "EXCUSED");
    const auditBeforeConflict = await AcademyAttendanceAudit.countDocuments({ academyId: academy._id });
    await assert.rejects(() => conditional(1, 3, "PRESENT", expectedFor(old, 3)), conflict);
    assert.equal((await recordFor(3)).status, "LATE");
    assert.equal(await AcademyAttendanceAudit.countDocuments({ academyId: academy._id }), auditBeforeConflict);
    console.log("PASS changed-row-only preserves untouched teacher edits; stale same-row write rejects without false audit.");

    const beforeAdmin = await snapshot();
    await updateAdminAcademyAttendance({ adminUserId: ids[2], academyId: academy._id, attendanceId: (await recordFor(4))._id,
      status: "ABSENT", note: "관리자 보정 기록" });
    await assert.rejects(() => conditional(1, 4, "PRESENT", expectedFor(beforeAdmin, 4)), conflict);
    const batchBefore = await snapshot();
    const batchAudit = await AcademyAttendanceAudit.countDocuments({ academyId: academy._id });
    await assert.rejects(() => write(1, ["EXCUSED", "PRESENT"], { notes: ["", ""],
      expectedStates: [expectedFor(batchBefore, 3), expectedFor(beforeAdmin, 4)] }), conflict);
    assert.equal((await recordFor(3)).status, "LATE", "second-row conflict rolls back whole batch");
    assert.equal((await recordFor(4)).note, "관리자 보정 기록");
    assert.equal(await AcademyAttendanceAudit.countDocuments({ academyId: academy._id }), batchAudit);
    console.log("PASS admin corrections cannot be overwritten; conflicted batch is all-or-none with its audit.");

    const matching = expectedFor(await snapshot(), 3);
    const competing = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
      conditional(index % 2, 3, "PRESENT", matching, `교사 변경 ${index}`)));
    assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of competing.filter((result) => result.status === "rejected")) assert.ok(conflict(result.reason));
    console.log("PASS ten concurrent edits to an existing row have one winner.");

    await AcademyAttendance.deleteMany({ academyId: academy._id, studentUserId: ids[4], dateKey });
    const absent = expectedFor(await snapshot(), 4);
    const creates = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
      conditional(index % 2, 4, "PRESENT", absent, `최초 출결 ${index}`)));
    assert.equal(creates.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of creates.filter((result) => result.status === "rejected")) assert.ok(conflict(result.reason));
    assert.equal(await AcademyAttendance.countDocuments({ academyId: academy._id, studentUserId: ids[4], dateKey }), 1);
    const beforeClear = expectedFor(await snapshot(), 4);
    await write(0, ["LATE"], { studentUserIds: [ids[4]], notes: ["이후 변경"] });
    await assert.rejects(() => conditional(1, 4, "", beforeClear), conflict);
    assert.ok(await recordFor(4));
    await conditional(1, 4, "", expectedFor(await snapshot(), 4));
    assert.equal(await recordFor(4), null);
    console.log("PASS missing-row insert races cannot duplicate records; stale clear cannot delete a newer record.");

    await write(0, ["PRESENT", "ABSENT"]);
    const pendingBaseline = await snapshot();
    const originalBulk = AcademyAttendance.bulkWrite;
    let reached, release, held = false;
    const atWrite = new Promise((resolve) => { reached = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    AcademyAttendance.bulkWrite = async function (operations, options) {
      if (!held && options?.session && operations.length === 2) { held = true; reached(); await gate; }
      return originalBulk.call(this, operations, options);
    };
    const pending = write(1, ["EXCUSED", "PRESENT"], { expectedStates: [expectedFor(pendingBaseline, 3), expectedFor(pendingBaseline, 4)] })
      .then((value) => ({ value }), (error) => ({ error }));
    try {
      await atWrite;
      await updateAdminAcademyAttendance({ adminUserId: ids[2], academyId: academy._id, attendanceId: (await recordFor(4))._id,
        status: "LATE", note: "트랜잭션 읽기 이후 관리자 변경" });
      const afterAdminAudit = await AcademyAttendanceAudit.countDocuments({ academyId: academy._id });
      release();
      assert.ok(conflict((await pending).error));
      assert.equal((await recordFor(3)).status, "PRESENT", "earlier transaction writes are rolled back after late row conflict");
      assert.equal((await recordFor(4)).status, "LATE");
      assert.equal(await AcademyAttendanceAudit.countDocuments({ academyId: academy._id }), afterAdminAudit);
    } finally { release(); AcademyAttendance.bulkWrite = originalBulk; }
    console.log("PASS administrator update between snapshot and DB write aborts the complete teacher transaction.");

    for (const expectedStates of [[], [null], [{ recordId: null, updatedAt: null, status: null, note: "", userId: String(ids[4]) }],
      [{ recordId: "not-an-id", updatedAt: null, status: "PRESENT", note: "" }]]) {
      await assert.rejects(() => write(1, ["PRESENT"], { studentUserIds: [ids[3]], notes: [""], expectedStates }),
        { status: 400, code: "ATTENDANCE_EXPECTED_STATE_INVALID" });
    }
    await assert.rejects(async () => conditional(2, 3, "PRESENT", expectedFor(await snapshot(), 3)), { status: 403 });
    // The real native serializer carries the record identity/timestamp and the
    // explicit capability, while the actual API accepts JSON expectedState.
    const express = require("express");
    const { createAccessToken } = require("../services/mobileAuthService");
    const router = require("../routes/api-routes");
    const { errorHandler } = require("../middleware/errorMiddleware");
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    const listener = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    try {
      const token = createAccessToken(await User.findById(ids[1]));
      const url = `http://127.0.0.1:${listener.address().port}/api/v1/academy/teacher/attendance`;
      const response = await fetch(`${url}?dateKey=${dateKey}&classId=${group._id}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      const dto = await response.json();
      assert.equal(dto.conditionalWriteVersion, 1);
      const target = dto.roster.find((row) => row.student.id === String(ids[3]));
      assert.ok(target.attendance.id && target.attendance.updatedAt);
      const saved = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey, classId: String(group._id), records: [{ studentUserId: String(ids[3]), status: "LATE", note: "HTTP 변경",
          expectedState: { recordId: target.attendance.id, updatedAt: target.attendance.updatedAt, status: target.attendance.status, note: target.attendance.note } }] }) });
      assert.equal(saved.status, 200);
      const savedDTO = await saved.json();
      assert.equal(savedDTO.roster.find((row) => row.student.id === String(ids[3])).attendance.note, "HTTP 변경");

      const ownerToken = createAccessToken(await User.findById(ids[0]));
      const ownerHeaders = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
      await AcademyStudentMembership.updateOne({ academyId: academy._id, studentUserId: ids[4] }, { $set: { classId: null } });
      for (const statuses of [["PRESENT", "ABSENT"], ["LATE", "EXCUSED"]]) {
        const ownerResponse = await fetch(url, { method: "POST", headers: ownerHeaders,
          body: JSON.stringify({ dateKey: "2026-09-11", records: ids.slice(3).map((studentId, index) => ({
            studentUserId: String(studentId), status: statuses[index], note: "학원장 HTTP 전체범위" })) }) });
        assert.equal(ownerResponse.status, 200); await ownerResponse.arrayBuffer();
      }
      const httpMixed = await AcademyAttendance.find({ academyId: academy._id, dateKey: "2026-09-11" }).lean();
      assert.equal(httpMixed.length, 2);
      assert.equal(httpMixed.find((row) => String(row.studentUserId) === String(ids[3])).status, "LATE");
      assert.equal(httpMixed.find((row) => String(row.studentUserId) === String(ids[4])).status, "EXCUSED");
      const otherClass = await AcademyClass.create({ academyId: academy._id, name: "타반 검증", nameNormalized: "타반 검증",
        createdByUserId: ids[0], homeroomTeacherUserId: ids[0],
        schedule: { weekdays: [4], startTime: "19:00", endTime: "20:30", effectiveFrom: "2026-09-01", timezone: "Asia/Seoul" } });
      await AcademyStudentMembership.updateOne({ academyId: academy._id, studentUserId: ids[4] }, { $set: { classId: otherClass._id } });
      const otherRoster = await service.getAcademyAttendanceRoster({ teacherUserId: ids[0], dateKey: "2026-09-10", classId: otherClass._id });
      assert.ok(otherRoster.session?.id);
      for (const status of ["PRESENT", "LATE"]) {
        const response = await fetch(url, { method: "POST", headers: ownerHeaders, body: JSON.stringify({
          dateKey: "2026-09-10", sessionId: otherRoster.session.id,
          records: [{ studentUserId: String(ids[4]), status, note: "명시 회차 HTTP" }] }) });
        assert.equal(response.status, 200);
        const value = await response.json();
        assert.equal(value.selectedClass.id, String(otherClass._id), "Session-only response reverted to the first unrelated class");
        assert.equal(value.roster.find((row) => row.student.id === String(ids[4])).attendance.status, status);
      }
      const foreignClassWrite = await fetch(url, { method: "POST", headers: { ...ownerHeaders, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dateKey: "2026-09-10", classId: String(otherClass._id),
          records: [{ studentUserId: String(ids[4]), status: "PRESENT", note: "권한 없는 타반" }] }) });
      assert.equal(foreignClassWrite.status, 403); await foreignClassWrite.arrayBuffer();
      const wrongSessionStudent = await fetch(url, { method: "POST", headers: ownerHeaders, body: JSON.stringify({
        dateKey: "2026-09-10", sessionId: otherRoster.session.id,
        records: [{ studentUserId: String(ids[3]), status: "PRESENT", note: "다른 반 학생" }] }) });
      assert.equal(wrongSessionStudent.status, 403); await wrongSessionStudent.arrayBuffer();
      console.log("PASS real Bearer HTTP owner mixed-roster repeat, session-only response scope and foreign-class/student rejection.");
    } finally { listener.closeAllConnections(); await new Promise((resolve) => listener.close(resolve)); }
    console.log("PASS malformed/foreign-owner requests fail, and real Bearer HTTP advertises and accepts conditional row state.");
    console.log("Attendance conditional-write DB verification PASS (legacy reproduction plus protected row, batch, admin, race, clear, schema and real HTTP cases).");
  } finally {
    if (academy) {
      for (const model of [AcademyAttendanceAudit, AcademyAttendance, AcademyAttendanceSession, AcademyStudentMembership, AcademyClass, AcademyStaff]) {
        await model.deleteMany({ academyId: academy._id });
      }
      await Academy.deleteOne({ _id: academy._id });
    }
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
