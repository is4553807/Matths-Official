"use strict";

// Read-only audit of the specifically provisioned 20-student demo batch.
// Credentials stay in the private, gitignored manifest and are never printed.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const ejs = require("ejs");
process.env.DISABLE_SCHEDULERS = "1";
const { User, PrivateMockExam } = require("../models/matthsModel");
const {
  Academy,
  AcademyClass,
  AcademyStudentMembership,
  AcademyAttendanceSession,
} = require("../models/academyModel");
const { MODEL_MAP } = require("./seedAcademyDemoStudents");
const {
  getAcademyAttendanceRoster,
} = require("../services/academyAttendanceService");
const {
  getAcademyAttendanceCsv,
} = require("../services/academyAttendanceExportService");
const {
  getStudentAcademyClassroom,
} = require("../services/academyClassworkService");
const { getActiveAcademyPlan } = require("../services/academyPlanService");
const {
  getAcademyWeeklyMockInsights,
  getWeeklyMockInsights,
} = require("../services/weeklyMockInsightService");
const controller = require("../controllers/academyController");

async function render(handler, user, { query = {}, params = {} } = {}) {
  const req = { session: { user }, query, params };
  const res = {
    set() {
      return this;
    },
    redirect(url) {
      throw new Error(`Unexpected preview redirect: ${url}`);
    },
    render(view, values) {
      return ejs.renderFile(
        path.resolve(__dirname, "..", "views", `${view}.ejs`),
        { assetVersion: "demo-live-audit", ...values },
      );
    },
  };
  const html = await handler(req, res, (error) => {
    throw error;
  });
  assert.match(html, /<!doctype html>/i);
  return html;
}

async function main() {
  require("dotenv").config({ path: "config.env", quiet: true });
  const manifestPath = process.argv[2];
  if (
    !manifestPath ||
    !path
      .resolve(manifestPath)
      .startsWith(
        path.resolve(__dirname, "..", "backups", "academy-demo-20") + path.sep,
      )
  )
    throw new Error("Use the exact private demo manifest path.");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(
    manifest.batchKey,
    "academy-demo-20:6a91692bfb60a828104805ef:v1",
  );
  assert.equal(
    (await fs.stat(manifestPath)).mode & 0o077,
    0,
    "credentials must stay private",
  );
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: false,
    autoCreate: false,
  });
  const now = new Date();
  const academy = await Academy.findById(manifest.academyId).lean();
  assert.equal(academy.status, "ACTIVE");
  assert.equal(
    JSON.stringify(academy.contractEndsAt),
    JSON.stringify(manifest.baseline.academy.contractEndsAt),
  );
  assert.equal(
    JSON.stringify(academy.contractStartsAt),
    JSON.stringify(manifest.baseline.academy.contractStartsAt),
  );
  const users = await User.find({ testBatchKey: manifest.batchKey })
    .select("+passwordHash +birthDate")
    .lean();
  assert.equal(users.length, 20);
  const members = await AcademyStudentMembership.find({
    academyId: academy._id,
    studentUserId: { $in: users.map((user) => user._id) },
    status: "APPROVED",
  }).lean();
  assert.equal(members.length, 20);
  const demoClasses = await AcademyClass.find({
    _id: { $in: manifest.recordIds.classes },
  }).lean();
  assert.equal(demoClasses.length, 2);
  const teacher = await User.findById(demoClasses[0].createdByUserId).lean();
  assert.equal(teacher.role, "teacher");
  const teacherView = { ...teacher, id: String(teacher._id) };
  const counts = {};
  for (const [key, ids] of Object.entries(manifest.recordIds)) {
    counts[key] = await MODEL_MAP[key].countDocuments({ _id: { $in: ids } });
    assert.equal(counts[key], manifest.counts[key], `${key}: missing records`);
  }
  const sourceExam = await PrivateMockExam.findById(manifest.sourceExamId)
    .select("+answerKey +points")
    .lean();
  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceExam)),
    manifest.baseline.sourceExam,
    "source exam metadata must remain unchanged",
  );
  for (const user of users) {
    assert.equal(user.role, "student");
    assert.equal(user.isTestAccount, true);
    assert.ok(user.birthDate);
    assert.equal(
      await bcrypt.compare(manifest.password, user.passwordHash),
      true,
    );
    const plan = await getActiveAcademyPlan(user._id, { now });
    assert.equal(plan.active, true);
    assert.equal(plan.includesMockExam, true);
    const classroom = await getStudentAcademyClassroom({
      studentUserId: user._id,
    });
    assert.equal(classroom.weeks.length, 4);
    const insight = await getWeeklyMockInsights({
      studentUserIds: [user._id],
      now,
    });
    assert.equal(insight.submissionCount, 1);
    assert.ok(insight.conceptCount);
    const member = members.find(
      (row) => String(row.studentUserId) === String(user._id),
    );
    const detail = await render(controller.studentDetailPage, teacherView, {
      params: { membershipId: String(member._id) },
    });
    assert.ok(detail.includes(user.realName));
    const studentView = { ...user, id: String(user._id) };
    delete studentView.passwordHash;
    delete studentView.birthDate;
    const classroomHtml = await render(
      controller.studentAcademyPage,
      studentView,
    );
    assert.match(classroomHtml, /데모/);
  }
  const sessions = await AcademyAttendanceSession.find({
    _id: { $in: manifest.recordIds.sessions },
  }).lean();
  for (const session of sessions) {
    const roster = await getAcademyAttendanceRoster({
      teacherUserId: teacher._id,
      classId: session.classId,
      dateKey: session.dateKey,
      readOnly: true,
      now,
    });
    assert.equal(roster.counts.TOTAL, 10);
    assert.equal(roster.counts.UNRECORDED, 0);
    assert.equal(roster.session.id, String(session._id));
    const exported = await getAcademyAttendanceCsv({
      teacherUserId: teacher._id,
      classId: session.classId,
      dateKey: session.dateKey,
    });
    assert.match(exported.csv, /데모 출결/);
    assert.equal(exported.csv.charCodeAt(0), 0xfeff);
  }
  const dashboard = await render(controller.portalPage, teacherView, {
    query: { tab: "dashboard" },
  });
  assert.match(dashboard, /주간.*모의고사/);
  assert.match(dashboard, /데모/);
  const classPages = [];
  for (const classData of demoClasses) {
    const detail = await render(controller.classDetailPage, teacherView, {
      params: { classId: String(classData._id) },
      query: { section: "classwork" },
    });
    assert.match(detail, /데모/);
    const classroom = await getStudentAcademyClassroom({
      studentUserId: members.find(
        (member) => String(member.classId) === String(classData._id),
      ).studentUserId,
    });
    const preview = await render(
      controller.studentAssignmentPreview,
      teacherView,
      {
        params: {
          classId: String(classData._id),
          weekId: String(classroom.weeks[0]._id),
        },
      },
    );
    assert.match(preview, /미리보기/);
    classPages.push(classData.name);
  }
  const schoolInsight = await getAcademyWeeklyMockInsights({
    academyId: academy._id,
    now,
  });
  const mockAttempts = await MODEL_MAP.mockAttempts
    .find({ _id: { $in: manifest.recordIds.mockAttempts } })
    .lean();
  assert.ok(
    mockAttempts.every(
      (attempt) =>
        !attempt.usedForWeeklyRanking &&
        !attempt.usedForCalibration &&
        !attempt.isRepresentative,
    ),
  );
  const scores = mockAttempts.map((attempt) => attempt.score);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const standardDeviation = Math.sqrt(
    scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length,
  );
  console.log(
    JSON.stringify(
      {
        verified: true,
        academy: { name: academy.name, status: academy.status },
        counts,
        classes: classPages,
        mockConcepts: schoolInsight.overall.conceptCount,
        mockScores: {
          mean,
          standardDeviation,
          min: Math.min(...scores),
          max: Math.max(...scores),
        },
        actualViewsRendered:
          "academy dashboard, both class pages, 20 student details, 20 student classroom pages, teacher assignment previews",
        attendanceAndCsvSessionsVerified: sessions.length,
        privateCredentialsVerified: 20,
        contractDatesPreserved: true,
        sourceExamPreserved: true,
        realRankingsExcluded: true,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
