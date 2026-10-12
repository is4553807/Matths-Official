"use strict";

// Isolated fixture DB only; never load config.env or modify live entitlements.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ejs = require("ejs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
process.env.NODE_ENV = "development";
process.env.DISABLE_SCHEDULERS = "1";

const { User } = require("../models/matthsModel");
const { Academy, AcademyStaff, AcademyClass, AcademyStudentMembership, AcademyAttendance, AcademyAttendanceSession } = require("../models/academyModel");
const { getDashboardData } = require("../services/dashboardService");
const { getPaidPackageAccess } = require("../services/paidFeatureAccessService");
const { proPlanDraft } = require("../services/accountPlanService");
const { getAcademyAttendanceCsv, csvCell } = require("../services/academyAttendanceExportService");

async function main() {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri("plan_attendance_export_fixture"));
    const now = new Date("2026-09-14T03:00:00Z");
    const learner = await User.create({ name: "plan-fixture", realName: '김, "학생"', email: "plan@fixture.invalid", passwordHash: "fixture-unused", schoolGrade: 11, role: "student" });
    const missingRecordStudent = await User.create({ name: "unrecorded-fixture", realName: "미기록학생", email: "unrecorded@fixture.invalid", passwordHash: "fixture-unused", schoolGrade: 10, role: "student" });
    const teacher = await User.create({ name: "teacher-fixture", email: "teacher@fixture.invalid", passwordHash: "fixture-unused", role: "teacher" });
    const owner = await User.create({ name: "owner-fixture", email: "owner@fixture.invalid", passwordHash: "fixture-unused", role: "teacher" });
    const freeData = await getDashboardData(learner._id, { now });
    assert.equal(freeData.activePlan.code, "FREE");
    assert.equal((await getPaidPackageAccess(learner._id, { now })).active, false);
    async function renderPlan(data) {
      const html = await ejs.renderFile(path.resolve("views/main.ejs"), {
        user: learner.toObject(), dashboardData: data, assetVersion: "fixture",
        arenaActivityLevel: { level: 1 }, arenaProfileAvatar: { imageSrc: "/images/favicon-32.png" },
      });
      return html.match(/<section class="plan-card"[\s\S]*?<\/section>/)?.[0] || "";
    }
    const freeHtml = await renderPlan(freeData);
    assert.match(freeHtml, /무료 플랜/);
    assert.match(freeHtml, /0원/);

    const proStartsAt = new Date("2026-09-10T06:51:21.129Z");
    const proEndsAt = new Date("2026-10-10T06:51:21.129Z");
    await User.updateOne(
      { _id: learner._id },
      { $set: { accountPlan: proPlanDraft({ startsAt: proStartsAt, endsAt: proEndsAt }) } }
    );
    const proData = await getDashboardData(learner._id, { now });
    assert.equal(proData.activePlan.code, "PRO");
    assert.equal(proData.activePlan.priceAmount, 5500);
    assert.equal((await getPaidPackageAccess(learner._id, { now })).active, true);
    const proHtml = await renderPlan(proData);
    assert.match(proHtml, /Pro 플랜/);
    assert.match(proHtml, /5,500원/);
    assert.match(proHtml, /2026년 10월 10일/);

    await User.updateOne({ _id: learner._id }, { $set: { "accountPlan.endsAt": now } });
    assert.equal((await getDashboardData(learner._id, { now })).activePlan.code, "FREE");
    assert.equal((await getPaidPackageAccess(learner._id, { now })).active, false);
    await User.updateOne(
      { _id: learner._id },
      { $set: { accountPlan: proPlanDraft({ startsAt: new Date("2026-09-15T00:00:00Z"), endsAt: new Date("2026-10-15T00:00:00Z") }) } }
    );
    assert.equal((await getDashboardData(learner._id, { now })).activePlan.code, "FREE", "future Pro must not appear active before its start");

    const academy = await Academy.create({ name: "CSV검사학원", nameNormalized: "csv검사학원", status: "ACTIVE", createdByUserId: owner._id });
    await AcademyStaff.create([
      { academyId: academy._id, userId: owner._id, role: "OWNER", status: "ACTIVE", currentStaffKey: String(owner._id) },
      { academyId: academy._id, userId: teacher._id, role: "TEACHER", status: "ACTIVE", currentStaffKey: String(teacher._id) },
    ]);
    const academyClass = await AcademyClass.create({
      academyId: academy._id, name: "CSV검사반", nameNormalized: "csv검사반", createdByUserId: owner._id, homeroomTeacherUserId: teacher._id,
      schedule: { weekdays: [0, 1, 2, 3, 4, 5, 6], startTime: "18:00", endTime: "19:00", effectiveFrom: "2026-01-01", timezone: "Asia/Seoul" },
    });
    const otherClass = await AcademyClass.create({ academyId: academy._id, name: "타담당반", nameNormalized: "타담당반", createdByUserId: owner._id, homeroomTeacherUserId: owner._id });
    for (const student of [learner, missingRecordStudent]) await AcademyStudentMembership.create({ academyId: academy._id, classId: academyClass._id, studentUserId: student._id, status: "APPROVED", dataConsentAt: now, approvedAt: now });
    await AcademyAttendance.create({ academyId: academy._id, classId: academyClass._id, studentUserId: learner._id, dateKey: "2026-09-14", status: "LATE", checkedInAt: new Date("2026-09-14T09:07:00Z"), recordedByUserId: teacher._id, source: "MANUAL", note: "=1+1" });
    const exportData = await getAcademyAttendanceCsv({ teacherUserId: teacher._id, dateKey: "2026-09-14", classId: academyClass._id });
    assert.equal(exportData.filename, "matths-attendance-2026-09-14.csv");
    assert.ok(exportData.csv.startsWith("\uFEFF"), "Excel needs UTF-8 BOM for Korean text");
    assert.ok(exportData.csv.endsWith("\r\n"));
    assert.match(exportData.csv, /"김, ""학생"""/);
    assert.match(exportData.csv, /"지각","18:07","선생님 기록","'=1\+1"/);
    assert.match(exportData.csv, /"미기록학생".*"미기록"/);
    assert.equal(await AcademyAttendanceSession.countDocuments({ academyId: academy._id }), 0, "export must not create/finalize attendance sessions");
    assert.equal(await AcademyAttendance.countDocuments({ academyId: academy._id }), 1);
    const session = await AcademyAttendanceSession.create({
      academyId: academy._id, classId: academyClass._id, dateKey: "2026-09-14",
      sessionKey: `${academy._id}:${academyClass._id}:2026-09-14:18:00`,
      startsAt: new Date("2026-09-14T09:00:00Z"), endsAt: new Date("2026-09-14T10:00:00Z"),
      checkInOpensAt: new Date("2026-09-14T08:50:00Z"), lateAfterAt: new Date("2026-09-14T09:05:00Z"), checkInClosesAt: new Date("2026-09-14T09:20:00Z"),
      attendanceMode: "SELF_CODE", status: "SCHEDULED", createdByUserId: teacher._id,
      rosterStudentUserIds: [learner._id, missingRecordStudent._id],
    });
    await AcademyAttendance.updateOne({ academyId: academy._id, studentUserId: learner._id }, { $set: { sessionId: session._id } });
    const originalCodeSecret = process.env.ATTENDANCE_CODE_SECRET;
    try {
      process.env.NODE_ENV = "production";
      process.env.ATTENDANCE_CODE_SECRET = "";
      const closedSessionExport = await getAcademyAttendanceCsv({ teacherUserId: teacher._id, dateKey: "2026-09-14", classId: academyClass._id });
      assert.match(closedSessionExport.csv, /"지각","18:07"/);
      assert.equal((await AcademyAttendanceSession.findById(session._id).lean()).status, "SCHEDULED", "export must not finalize or change an expired session");
      assert.equal(await AcademyAttendance.countDocuments({ academyId: academy._id }), 1, "export must not auto-create absences for unrecorded students");
    } finally {
      process.env.NODE_ENV = "development";
      if (originalCodeSecret === undefined) delete process.env.ATTENDANCE_CODE_SECRET;
      else process.env.ATTENDANCE_CODE_SECRET = originalCodeSecret;
    }
    await AcademyAttendance.create([
      { academyId: academy._id, classId: academyClass._id, studentUserId: learner._id, dateKey: "2026-09-15", status: "PRESENT", checkedInAt: new Date("2026-09-15T09:00:00Z"), recordedByUserId: teacher._id, source: "MANUAL", note: "정상 등원" },
      { academyId: academy._id, classId: academyClass._id, studentUserId: missingRecordStudent._id, dateKey: "2026-09-15", status: "ABSENT", recordedByUserId: teacher._id, source: "MANUAL", note: "가정 일정" },
    ]);
    const rangeExport = await getAcademyAttendanceCsv({
      teacherUserId: teacher._id,
      startDate: "2026-09-14",
      endDate: "2026-09-16",
      classId: academyClass._id,
    });
    assert.equal(rangeExport.filename, "matths-attendance-2026-09-14-to-2026-09-16.csv");
    assert.ok(rangeExport.csv.startsWith("\uFEFF"));
    assert.match(rangeExport.csv, /"2026-09-14 \(월\)","2026-09-15 \(화\)","2026-09-16 \(수\)"/);
    assert.match(rangeExport.csv, /"김, ""학생""".*"지각 18:07","출석 18:00","미기록","1","1","0","0","1"/);
    assert.match(rangeExport.csv, /"미기록학생".*"미기록","결석","미기록","0","0","1","0","2"/);
    assert.match(rangeExport.csv, /"날짜별 출석".*"0","1","0"/);
    assert.match(rangeExport.csv, /"날짜별 미기록".*"1","0","2"/);
    assert.match(rangeExport.csv, /2026-09-14: =1\+1/);
    assert.equal(await AcademyAttendanceSession.countDocuments({ academyId: academy._id }), 1, "range export must not create attendance sessions");
    assert.equal(await AcademyAttendance.countDocuments({ academyId: academy._id }), 3, "range export must not create or change attendance records");
    await AcademyClass.updateOne({ _id: academyClass._id }, { $set: { "schedule.weekdays": [1, 3] } });
    const scheduledRange = await getAcademyAttendanceCsv({
      teacherUserId: teacher._id,
      startDate: "2026-09-14",
      endDate: "2026-09-17",
      classId: academyClass._id,
    });
    assert.match(scheduledRange.csv, /"2026-09-14 \(월\)","2026-09-15 \(화\)","2026-09-16 \(수\)"/);
    assert.doesNotMatch(scheduledRange.csv, /2026-09-17 \(목\)/, "unscheduled unrecorded dates must not appear as attendance days");
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, dateKey: "2026-09-14", classId: otherClass._id }), error => error.status === 403);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, dateKey: "2026-02-30", classId: academyClass._id }), error => error.status === 400);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, startDate: "2026-09-14", endDate: "2026-09-16", classId: otherClass._id }), error => error.status === 403);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, startDate: "2026-09-16", endDate: "2026-09-14", classId: academyClass._id }), error => error.status === 400);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, startDate: "2026-09-14", classId: academyClass._id }), error => error.status === 400);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, endDate: "2026-09-14", classId: academyClass._id }), error => error.status === 400);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, startDate: "2026-02-30", endDate: "2026-09-14", classId: academyClass._id }), error => error.status === 400);
    await assert.rejects(getAcademyAttendanceCsv({ teacherUserId: teacher._id, startDate: "2025-09-14", endDate: "2026-09-15", classId: academyClass._id }), error => error.status === 400);
    for (const value of ["=1+1", "+1", "-2", "@SUM(1)", " =1", "\t=1"]) assert.ok(csvCell(value).startsWith('"\''), "Excel formula injection must be neutralized");
    assert.equal(csvCell('a,"b"\r\nc'), '"a,""b""\r\nc"');
    const emptyExport = await getAcademyAttendanceCsv({ teacherUserId: owner._id, dateKey: "2026-09-14", classId: otherClass._id });
    assert.equal(emptyExport.csv.trim().split("\r\n").length, 1);
    const academyView = fs.readFileSync(path.resolve("views/academy.ejs"), "utf8");
    assert.match(academyView, /name="startDate"/);
    assert.match(academyView, /name="endDate"/);
    assert.match(academyView, /기간 CSV 다운로드/);
    for (const view of ["views/store.ejs", "views/store-study.ejs", "views/admin-store.ejs", "views/partials/dashboard-navigation.ejs", "views/partials/admin-navigation.ejs", "public/js/onboarding-tutorial.js"]) {
      const source = fs.readFileSync(path.resolve(view), "utf8");
      assert.match(source, /GOAT 교재관/);
      assert.doesNotMatch(source, /고2·고3 수험관/);
    }
    console.log("Plan/CSV verified: free/Pro access, 5,500 won display, future/exact-expiry boundaries, Excel-safe Korean daily/range matrices, teacher class scope and non-mutating downloads.");
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
