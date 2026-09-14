"use strict";

const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");
process.env.NODE_ENV = "test";
const { User, PrivateMockExam, ArchiveItem } = require("../models/matthsModel");
const {
  Academy,
  AcademyStaff,
  AcademyClass,
  AcademyClassWeek,
  AcademyStudentMembership,
} = require("../models/academyModel");
const {
  COUNT,
  MODEL_MAP,
  applyPlan,
  buildPlan,
  resolveTarget,
  verifyPlan,
  zAt,
} = require("./seedAcademyDemoStudents");
const {
  getWeeklyMockInsights,
} = require("../services/weeklyMockInsightService");
const {
  getStudentAcademyClassroom,
} = require("../services/academyClassworkService");
const {
  getAcademyAttendanceRoster,
} = require("../services/academyAttendanceService");
const {
  getAcademyAttendanceCsv,
} = require("../services/academyAttendanceExportService");
let memory;
async function main() {
  memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(memory.getUri());
  await Promise.all(
    [
      ...new Set([
        ...Object.values(MODEL_MAP),
        Academy,
        AcademyStaff,
        ArchiveItem,
        PrivateMockExam,
      ]),
    ].map((Model) => Model.init()),
  );
  const now = new Date("2026-09-14T08:00:00Z");
  const teacher = await User.create({
    name: "데모 학원 운영자",
    email: "owner@qa.invalid",
    passwordHash: "unused",
    role: "teacher",
  });
  const regular = await User.create({
    name: "기존 실제 학생",
    email: "real@qa.invalid",
    passwordHash: "unused",
    role: "student",
  });
  const academy = await Academy.create({
    name: "데모 검증 학원",
    nameNormalized: "데모 검증 학원",
    status: "ACTIVE",
    createdByUserId: teacher._id,
    contractEndsAt: new Date(+now + 30 * 86400000),
  });
  await AcademyStaff.create({
    academyId: academy._id,
    userId: teacher._id,
    role: "OWNER",
    status: "ACTIVE",
  });
  const existingClass = await AcademyClass.create({
    academyId: academy._id,
    name: "기존 반",
    nameNormalized: "기존 반",
    createdByUserId: teacher._id,
  });
  const archive = await ArchiveItem.create({
    title: "CUSTOM 실제 문제지",
    originalName: "fixture.pdf",
    storedName: "fixture.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    uploadedBy: teacher._id,
    isPublished: false,
  });
  const concepts = Array.from({ length: 30 }, (_, index) => ({
    conceptId: `concept-${index % 10}`,
    conceptTitle: `데모 개념 ${index % 10}`,
    courseTitle: "대수",
    unitTitle: "지수·로그",
  }));
  const exam = await PrivateMockExam.create({
    weekKey: "2026-W38",
    attemptNumber: 0,
    formCode: "CUSTOM",
    isTest: true,
    title: "기존 정산 완료 CUSTOM",
    releaseAt: new Date(+now - 180 * 60000),
    closeAt: new Date(+now - 70 * 60000),
    aggregationStartsAt: new Date(+now - 60 * 60000),
    rankingPublishesAt: now,
    archiveAt: now,
    reviewPublishesAt: now,
    durationMinutes: 100,
    questionCount: 30,
    questionConcepts: concepts,
    answerKey: Array.from({ length: 30 }, (_, index) =>
      String((index % 5) + 1),
    ),
    points: Array.from({ length: 30 }, (_, index) => (index < 20 ? 3 : 4)),
    archiveItemId: archive._id,
    status: "locked",
    settlementCompletedAt: now,
    createdBy: teacher._id,
  });
  const baseline = {
    user: JSON.stringify(await User.findById(regular._id).lean()),
    class: JSON.stringify(
      await AcademyClass.findById(existingClass._id).lean(),
    ),
    exam: JSON.stringify(await PrivateMockExam.findById(exam._id).lean()),
  };
  const target = await resolveTarget(academy._id, now);
  const plan = await buildPlan({ ...target, now, password: "DemoPassword1!" });
  assert.equal(plan.counts.users, COUNT);
  assert.equal(plan.counts.memberships, COUNT);
  assert.equal(plan.counts.classes, 2);
  assert.equal(plan.counts.weeks, 8);
  assert.equal(plan.counts.submissions, 80);
  assert.equal(plan.counts.attendance, 240);
  assert.equal(plan.counts.mockAttempts, COUNT);
  assert.ok(
    Math.abs(
      Array.from({ length: COUNT }, (_, index) => zAt(index)).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ) < 0.000001,
  );
  const mean =
    plan.profiles.reduce((sum, profile) => sum + profile.targetAccuracy, 0) /
    COUNT;
  const deviation = Math.sqrt(
    plan.profiles.reduce(
      (sum, profile) => sum + (profile.targetAccuracy - mean) ** 2,
      0,
    ) / COUNT,
  );
  assert.ok(Math.abs(mean - 70) < 0.1);
  assert.ok(Math.abs(deviation - 12) < 0.1);
  await Academy.updateOne({ _id: academy._id }, { $set: { status: "PAUSED" } });
  await assert.rejects(() => resolveTarget(academy._id, now), /활성 학원/);
  assert.equal(
    (await resolveTarget(academy._id, now, { allowPaused: true })).academy
      .status,
    "PAUSED",
  );
  const collision = await AcademyStudentMembership.create({
    academyId: academy._id,
    studentUserId: regular._id,
    activeStudentKey: plan.profiles[0].userId,
    status: "APPROVED",
    dataConsentAt: now,
  });
  await assert.rejects(
    () => applyPlan(plan, { reactivate: true, now }),
    (error) => error.code === 11000,
  );
  assert.equal(
    (await Academy.findById(academy._id)).status,
    "PAUSED",
    "failed seed must roll back reactivation",
  );
  assert.equal(
    await User.countDocuments({ isTestAccount: true }),
    0,
    "no partial students on failure",
  );
  await AcademyStudentMembership.deleteOne({ _id: collision._id });
  assert.deepEqual(await applyPlan(plan, { reactivate: true, now }), {
    applied: true,
    alreadyPresent: false,
  });
  assert.equal((await Academy.findById(academy._id)).status, "ACTIVE");
  const verified = await verifyPlan(plan, now);
  assert.equal(verified.monthlyStatistics.length, 40);
  const global = await getWeeklyMockInsights({ now });
  assert.equal(
    global.submissionCount,
    0,
    "no pollution of real official/global heatmap",
  );
  const ordinary = await getWeeklyMockInsights({
    studentUserIds: [regular._id],
    now,
  });
  assert.equal(ordinary.submissionCount, 0);
  assert.deepEqual(await applyPlan(plan, { now }), {
    applied: false,
    alreadyPresent: true,
  });
  assert.equal(await User.countDocuments({ isTestAccount: true }), COUNT);
  assert.equal(
    JSON.stringify(await User.findById(regular._id).lean()),
    baseline.user,
  );
  for (const seededSession of plan.records.sessions) {
    const roster = await getAcademyAttendanceRoster({
      teacherUserId: teacher._id,
      dateKey: seededSession.dateKey,
      classId: seededSession.classId,
      now,
      readOnly: true,
    });
    assert.equal(roster.counts.TOTAL, 10);
    assert.equal(
      roster.counts.UNRECORDED,
      0,
      "real UI must find every seeded attendance",
    );
    assert.equal(String(roster.session.id), String(seededSession._id));
    const csv = await getAcademyAttendanceCsv({
      teacherUserId: teacher._id,
      dateKey: seededSession.dateKey,
      classId: seededSession.classId,
    });
    assert.match(csv.csv, /데모 출결/);
  }
  assert.equal(
    JSON.stringify(await AcademyClass.findById(existingClass._id).lean()),
    baseline.class,
  );
  assert.equal(
    JSON.stringify(await PrivateMockExam.findById(exam._id).lean()),
    baseline.exam,
  );
  for (const profile of plan.profiles) {
    const classroom = await getStudentAcademyClassroom({
      studentUserId: profile.userId,
    });
    assert.equal(
      classroom.weeks.length,
      4,
      "student dashboard lessons are linked",
    );
    for (const week of classroom.weeks)
      assert.equal(
        week.assignmentOmr.answerKey,
        undefined,
        "answer key not exposed",
      );
  }
  await Academy.updateOne({ _id: academy._id }, { $set: { status: "PAUSED" } });
  await assert.rejects(() => resolveTarget(academy._id, now), /활성 학원/);
  console.log(
    JSON.stringify(
      {
        verified: true,
        counts: plan.counts,
        targetAccuracy: { mean, standardDeviation: deviation },
        monthlyStatistics: verified.monthlyStatistics.length,
        safeguards:
          "schema hooks, all joins, normal quantiles, exactly 20, idempotency, untouched regular user/class/source exam, isolated heatmaps, hidden OMR key, paused academy rejection",
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    if (memory) await memory.stop();
  });
