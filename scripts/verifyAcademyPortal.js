const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const mongoose = require("mongoose");
const ejs = require("ejs");
const sharp = require("sharp");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
const {
  ConceptProgress,
  LearningEvent,
  Problem,
  ProblemAttempt,
  PrivateMockExam,
  PrivateMockExamAttempt,
  User,
} = require("../models/matthsModel");
const {
  Academy,
  AcademyAttendance,
  AcademyAttendanceAudit,
  AcademyAttendanceCodeAttempt,
  AcademyAttendanceSession,
  AcademyStaff,
  AcademyClass,
  AcademyClassWeek,
  AcademyAssignmentSubmission,
  AcademyStudentMembership,
  AcademyInvite,
} = require("../models/academyModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const {
  approveAcademyApplication,
  approveAcademyStaff,
  approveMembership,
  addAcademyClassCoTeacher,
  archiveAcademyClass,
  assignMembershipClass,
  bulkManageAcademyStudents,
  cancelAcademyStaffJoin,
  createAcademyClass,
  createAcademyForTeacher,
  createAcademyInvite,
  getAcademyClassDetail,
  getAcademyInvitePresentation,
  getAcademyPortalData,
  getAcademyStudentPage,
  getAcademyStudentDetail,
  getStudentAcademyProfile,
  getTeacherAcademyContext,
  getTeacherAcademySetupData,
  leaveAcademy,
  requestAcademyStaffJoin,
  requestAcademyByCode,
  rejectAcademyApplication,
  removeAcademyClassCoTeacher,
  restoreAcademyClass,
  revokeAcademyStaff,
  transferAcademyClassHomeroom,
  updateAcademyClassSettings,
} = require("../services/academyService");
const {
  createSquareAcademyProfileImageFile,
  removeAcademyProfileImage,
  removeAcademyProfileImageAsAdmin,
  updateAcademyProfileImage,
  updateAcademyProfileImageAsAdmin,
} = require("../services/academyProfileImageService");
const {
  getAcademyMonthlyStatistics,
  getStudentMonthlyStatistics,
} = require("../services/academyStatisticsService");
const {
  checkInStudentAttendance,
  getAcademyAttendanceRoster,
  getStudentAttendanceDashboard,
  regenerateAttendanceSessionCode,
  saveAcademyAttendanceRoster,
  _private: academyAttendancePrivate,
} = require("../services/academyAttendanceService");
const {
  calculateConceptMastery,
  getClassMathMap,
  getStudentMathMap,
  getStudentMathMaps,
  validateMathMapGraph,
} = require("../services/mathMapService");
const {
  deleteAcademyClassWeek,
  finalizeMissedAssignmentSubmissions,
  getAcademyClassworkTeacherView,
  getStudentAcademyClassroom,
  getStudentAcademyWeek,
  normalizeAssignmentOmr,
  saveAcademyClassWeek,
  submitAcademyAssignment,
} = require("../services/academyClassworkService");
const {
  analyzeAcademyForensicEvidence,
  getAcademyForensicsPageData,
} = require("../services/academyForensicsService");
const { buildForensicIdentity } = require("../services/pdfWatermarkService");
const {
  getAcademyWeeklyMockInsights,
  getWeeklyMockInsights,
} = require("../services/weeklyMockInsightService");
const {
  assignAdminAcademyMembershipClass,
  getAdminAcademyDetail,
  getAdminAcademyList,
  regenerateAdminAcademyAttendanceCode,
  transferAdminAcademyClassHomeroom,
  transferAdminAcademyOwner,
  updateAdminAcademyAttendance,
  updateAdminAcademyClass,
  updateAdminAcademyClassOperations,
  updateAdminAcademyInvite,
  updateAdminAcademyMembership,
  updateAdminAcademyProfile,
  updateAdminAcademyStaff,
} = require("../services/adminAcademyService");
const {
  DATASET_KEY: ACADEMY_DUMMY_DATASET_KEY,
  MATH_MAP_CONCEPTS: ACADEMY_DUMMY_MATH_MAP_CONCEPTS,
  buildClassWeekOperations: buildAcademyDummyClassWeekOperations,
  buildDataset: buildAcademyDummyDataset,
} = require("./seedAcademyStatisticsDummyData");

const root = path.resolve(__dirname, "..");

async function render(viewName, locals) {
  return ejs.renderFile(path.join(root, "views", `${viewName}.ejs`), locals);
}

async function main() {
  const memoryServer = await MongoMemoryServer.create({ instance: { dbName: "matths-academy-verify" } });
  await mongoose.connect(memoryServer.getUri(), { dbName: "matths-academy-verify" });

  try {
    const graphValidation = validateMathMapGraph();
    assert.equal(graphValidation.valid, true, graphValidation.errors.join("\n"));
    assert.ok(graphValidation.nodeCount >= 200);
    assert.equal(graphValidation.verifiedEdgeCount, 24);
    const attendanceSecretEnvironment = Object.fromEntries(
      ["NODE_ENV", "ATTENDANCE_CODE_SECRET"]
        .map((key) => [key, process.env[key]])
    );
    try {
      process.env.NODE_ENV = "production";
      process.env.ATTENDANCE_CODE_SECRET = "academy-attendance-production-secret-1234567890";
      const productionAttendanceCode = academyAttendancePrivate.attendanceCodeForSession({
        _id: new mongoose.Types.ObjectId(),
        codeVersion: 1,
        sessionKey: "attendance-production-secret-verification",
      });
      assert.match(productionAttendanceCode, /^\d{6}$/);
      delete process.env.ATTENDANCE_CODE_SECRET;
      assert.throws(
        () => academyAttendancePrivate.attendanceCodeForSession({
          _id: new mongoose.Types.ObjectId(),
          codeVersion: 1,
          sessionKey: "attendance-missing-secret-verification",
        }),
        (error) => Number(error.status) === 503 && /보안.*설정/.test(error.message)
      );
    } finally {
      Object.entries(attendanceSecretEnvironment).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
    const formulaResult = calculateConceptMastery(
      Array.from({ length: 5 }, (_, index) => ({
        problemId: new mongoose.Types.ObjectId(),
        problemSnapshot: { typeId: `formula-type-${index % 2}`, difficulty: 3 },
        isCorrect: true,
        retryAttempted: false,
        retrySucceeded: false,
        submittedAt: new Date(Date.UTC(2026, 7, 20 - index)),
      })),
      new Map()
    );
    assert.equal(formulaResult.evidence.positiveEvidence, 4.13);
    assert.equal(formulaResult.mastery, 75.4);
    assert.equal(formulaResult.confidence, "LOW");
    assert.equal(formulaResult.status, "DEVELOPING");

    const dummySeedAcademyId = new mongoose.Types.ObjectId();
    const dummySeedTeacherId = new mongoose.Types.ObjectId();
    const dummySeedClassId = new mongoose.Types.ObjectId();
    const dummySeedUsers = Array.from({ length: 5 }, () => ({
      _id: new mongoose.Types.ObjectId(),
      academyId: dummySeedAcademyId,
      classId: dummySeedClassId,
      recordedByUserId: dummySeedTeacherId,
    }));
    const dummySeedDataset = buildAcademyDummyDataset(
      dummySeedUsers,
      new Date("2026-08-28T03:00:00.000Z"),
      "academy-portal-memory-verification"
    );
    assert.equal(dummySeedDataset.operations.problems.length, 80);
    assert.ok(dummySeedDataset.operations.problemAttempts.length > 200);
    assert.equal(dummySeedDataset.operations.attendanceSessions.length, 1);
    assert.equal(dummySeedDataset.operations.attendance.length, dummySeedUsers.length);
    assert.equal(dummySeedDataset.operations.attendanceAudits.length, dummySeedUsers.length);
    const dummyClassWeekOperations = buildAcademyDummyClassWeekOperations({
      academy: { _id: dummySeedAcademyId, createdByUserId: dummySeedTeacherId },
      activeClasses: [{
        _id: dummySeedClassId,
        createdByUserId: dummySeedTeacherId,
        homeroomTeacherUserId: dummySeedTeacherId,
      }],
      now: new Date("2026-08-28T03:00:00.000Z"),
    });
    assert.equal(dummyClassWeekOperations.length, 4);
    assert.equal(
      dummyClassWeekOperations[0].updateOne.update.$setOnInsert.concepts[0].conceptTitle,
      "다항식의 사칙연산"
    );
    await Problem.bulkWrite(dummySeedDataset.operations.problems, { ordered: false });
    await ProblemAttempt.bulkWrite(dummySeedDataset.operations.problemAttempts, { ordered: false });
    await AcademyAttendanceSession.bulkWrite(dummySeedDataset.operations.attendanceSessions, { ordered: false });
    await AcademyAttendance.bulkWrite(dummySeedDataset.operations.attendance, { ordered: false });
    await AcademyAttendanceAudit.bulkWrite(dummySeedDataset.operations.attendanceAudits, { ordered: false });
    assert.equal(await AcademyAttendanceSession.countDocuments({ academyId: dummySeedAcademyId }), 1);
    assert.equal(await AcademyAttendance.countDocuments({ academyId: dummySeedAcademyId, sessionId: { $ne: null } }), dummySeedUsers.length);
    assert.equal(await AcademyAttendanceAudit.countDocuments({ academyId: dummySeedAcademyId, actorType: "SYSTEM" }), dummySeedUsers.length);

    const dummySeedMathMaps = await getStudentMathMaps({
      studentUserIds: dummySeedUsers.map((user) => user._id),
    });
    const dummySeedStatusCounts = { MASTERED: 0, DEVELOPING: 0, WEAK: 0, UNKNOWN: 0 };
    dummySeedMathMaps.forEach((map) => {
      assert.equal(map.attemptedConceptCount, ACADEMY_DUMMY_MATH_MAP_CONCEPTS.length);
      map.concepts.forEach((concept) => {
        dummySeedStatusCounts[concept.status] += 1;
        if (concept.status !== "UNKNOWN") {
          assert.ok(concept.evidence.attemptCount >= 5);
          assert.ok(concept.evidence.problemTypeCount >= 3);
        }
      });
    });
    assert.ok(dummySeedStatusCounts.MASTERED > 0);
    assert.ok(dummySeedStatusCounts.DEVELOPING > 0);
    assert.ok(dummySeedStatusCounts.WEAK > 0);
    assert.ok(dummySeedStatusCounts.UNKNOWN > 0);
    const dummySeedClassMathMap = await getClassMathMap({
      studentUserIds: dummySeedUsers.map((user) => user._id),
    });
    assert.equal(dummySeedClassMathMap.totalStudents, dummySeedUsers.length);
    assert.ok(
      dummySeedClassMathMap.bottlenecks.some((item) => item.conceptId === "calculus-1-02-07")
    );
    assert.equal(
      await Problem.countDocuments({ tags: { $all: ["academy-dummy", ACADEMY_DUMMY_DATASET_KEY] } }),
      80
    );

    await Promise.all([
      Academy.syncIndexes(),
      AcademyAttendance.syncIndexes(),
      AcademyStaff.syncIndexes(),
      AcademyClass.syncIndexes(),
      AcademyClassWeek.syncIndexes(),
      AcademyAssignmentSubmission.syncIndexes(),
      AcademyStudentMembership.syncIndexes(),
      AcademyInvite.syncIndexes(),
      PdfWatermarkIssuance.syncIndexes(),
    ]);

    const [admin, teacher, secondTeacher, rejectedTeacher, student] = await User.create([
      {
        name: "academy-admin",
        realName: "검증운영자",
        email: "academy-admin@example.test",
        passwordHash: "not-used-in-verification",
        role: "admin",
        lastLoginAt: new Date("2026-08-28T01:00:00.000Z"),
      },
      {
        name: "academy-teacher",
        realName: "김선생",
        email: "academy-teacher@example.test",
        passwordHash: "not-used-in-verification",
        role: "teacher",
        teacherAccessExpiresAt: new Date("2030-12-31T14:59:59.999Z"),
      },
      {
        name: "academy-second-teacher",
        realName: "박선생",
        email: "academy-second-teacher@example.test",
        passwordHash: "not-used-in-verification",
        role: "teacher",
        teacherAccessExpiresAt: new Date("2030-12-31T14:59:59.999Z"),
      },
      {
        name: "academy-rejected-teacher",
        realName: "최선생",
        email: "academy-rejected-teacher@example.test",
        passwordHash: "not-used-in-verification",
        role: "teacher",
        teacherAccessExpiresAt: new Date("2030-12-31T14:59:59.999Z"),
      },
      {
        name: "academy-student",
        realName: "이학생",
        email: "academy-student@example.test",
        passwordHash: "not-used-in-verification",
        role: "student",
        schoolGrade: 10,
        school: { region: "경기도", code: "VERIFY-HS", name: "검증고등학교" },
      },
    ]);

    const academy = await createAcademyForTeacher({
      teacherUserId: teacher._id,
      name: "평촌 검증수학",
    });
    assert.equal(academy.status, "PENDING");
    assert.equal(await getTeacherAcademyContext(teacher._id, { allowMissing: true }), null);
    const ownerSetupPending = await getTeacherAcademySetupData(teacher._id);
    assert.equal(ownerSetupPending.pendingAcademy.name, academy.name);
    const ownerSetupHtml = await render("academy-setup", {
      user: teacher,
      feedback: null,
      academyName: "",
      setup: ownerSetupPending,
    });
    assert.match(ownerSetupHtml, /등록 검토 대기 중/);
    assert.match(ownerSetupHtml, /승인 전에는 학원 목록에 표시되지 않으며/);

    await assert.rejects(
      requestAcademyStaffJoin({ teacherUserId: student._id, academyId: academy._id }),
      (error) => Number(error.status) === 403 && /교사로 전환/.test(error.message)
    );

    const setupBeforeRequest = await getTeacherAcademySetupData(secondTeacher._id);
    assert.equal(setupBeforeRequest.pendingRequest, null);
    assert.ok(!setupBeforeRequest.academies.some((entry) => String(entry._id) === String(academy._id)));
    await assert.rejects(
      approveAcademyApplication({ adminUserId: teacher._id, academyId: academy._id }),
      (error) => Number(error.status) === 403 && /운영자 계정/.test(error.message)
    );
    await approveAcademyApplication({ adminUserId: admin._id, academyId: academy._id });
    assert.equal((await Academy.findById(academy._id).lean()).status, "ACTIVE");
    assert.equal((await getTeacherAcademyContext(teacher._id)).academy.name, academy.name);

    const rejectedAcademy = await createAcademyForTeacher({
      teacherUserId: rejectedTeacher._id,
      name: "거절 검증수학",
    });
    await rejectAcademyApplication({ adminUserId: admin._id, academyId: rejectedAcademy._id });
    assert.equal((await Academy.findById(rejectedAcademy._id).lean()).status, "REJECTED");
    assert.equal(await getTeacherAcademyContext(rejectedTeacher._id, { allowMissing: true }), null);
    const rejectedSetup = await getTeacherAcademySetupData(rejectedTeacher._id);
    assert.equal(rejectedSetup.rejectedAcademy.name, "거절 검증수학");
    await updateAdminAcademyProfile({ adminUserId: admin._id, academyId: rejectedAcademy._id, action: "REOPEN" });
    assert.equal((await Academy.findById(rejectedAcademy._id).lean()).status, "PENDING");
    assert.equal((await AcademyStaff.findOne({ academyId: rejectedAcademy._id, role: "OWNER" }).lean()).status, "ACTIVE");
    await rejectAcademyApplication({ adminUserId: admin._id, academyId: rejectedAcademy._id });

    const setupAfterApproval = await getTeacherAcademySetupData(secondTeacher._id);
    assert.ok(setupAfterApproval.academies.some((entry) => String(entry._id) === String(academy._id)));
    const setupChoiceHtml = await render("academy-setup", {
      user: secondTeacher,
      feedback: null,
      academyName: "",
      setup: setupAfterApproval,
    });
    assert.match(setupChoiceHtml, /학원 만들기/);
    assert.match(setupChoiceHtml, /기존 학원 들어가기/);
    assert.match(setupChoiceHtml, /평촌 검증수학/);

    const staffRequest = await requestAcademyStaffJoin({
      teacherUserId: secondTeacher._id,
      academyId: academy._id,
    });
    assert.equal(staffRequest.status, "PENDING");
    assert.equal(await getTeacherAcademyContext(secondTeacher._id, { allowMissing: true }), null);
    const setupPending = await getTeacherAcademySetupData(secondTeacher._id);
    assert.equal(setupPending.pendingRequest.academyId.name, academy.name);
    const setupPendingHtml = await render("academy-setup", {
      user: secondTeacher,
      feedback: null,
      academyName: "",
      setup: setupPending,
    });
    assert.match(setupPendingHtml, /참여 승인 대기 중/);
    assert.match(setupPendingHtml, /참여 요청 취소/);

    let portal = await getAcademyPortalData(teacher._id);
    assert.equal(portal.isOwner, true);
    assert.equal(portal.staffPendingCount, 1);
    assert.equal(portal.staffRequests[0].userId.realName, "박선생");
    await approveAcademyStaff({ teacherUserId: teacher._id, staffId: staffRequest._id });
    const secondTeacherContext = await getTeacherAcademyContext(secondTeacher._id);
    assert.equal(secondTeacherContext.staff.role, "TEACHER");
    const secondTeacherPortal = await getAcademyPortalData(secondTeacher._id);
    assert.equal(secondTeacherPortal.isOwner, false);
    assert.equal(secondTeacherPortal.activeStaff.length, 2);
    assert.equal(secondTeacherPortal.staffRequests.length, 0);

    const academyClass = await createAcademyClass({
      teacherUserId: teacher._id,
      name: "고1 월수반",
      weekdays: [5],
      startTime: "17:30",
      endTime: "19:30",
      effectiveFrom: "2026-08-01",
      attendanceMode: "SELF_CODE",
      opensBeforeMinutes: 10,
      lateAfterMinutes: 5,
      closesAfterMinutes: 20,
    });
    assert.equal(String(academyClass.homeroomTeacherUserId), String(teacher._id));
    assert.deepEqual(academyClass.schedule.weekdays, [5]);
    assert.equal(academyClass.attendancePolicy.mode, "SELF_CODE");
    await addAcademyClassCoTeacher({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      coTeacherUserId: secondTeacher._id,
    });
    const invite = await createAcademyInvite({
      teacherUserId: teacher._id,
      label: "고1 신입생 초대",
      classId: academyClass._id,
      expiryDays: 14,
      maxUses: 30,
    });

    const invitePresentation = await getAcademyInvitePresentation(invite.token);
    assert.equal(invitePresentation.academyId.name, academy.name);
    assert.equal(invitePresentation.classId.name, academyClass.name);
    assert.match(invite.code, /^MTH-[A-Z2-9]{6}$/);

    const pendingMembership = await requestAcademyByCode({
      studentUserId: student._id,
      code: invite.code.toLowerCase(),
      consent: "1",
    });
    assert.equal(pendingMembership.status, "PENDING");
    assert.equal(String(pendingMembership.classId), String(academyClass._id));

    portal = await getAcademyPortalData(teacher._id);
    assert.equal(portal.pendingCount, 1);
    assert.equal(portal.requests[0].studentUserId.realName, "이학생");

    await approveMembership({ teacherUserId: teacher._id, membershipId: pendingMembership._id });
    await assignMembershipClass({
      teacherUserId: teacher._id,
      membershipId: pendingMembership._id,
      classId: academyClass._id,
    });

    portal = await getAcademyPortalData(teacher._id);
    assert.equal(portal.pendingCount, 0);
    assert.equal(portal.students.length, 1);
    assert.equal(portal.students[0].classId.name, "고1 월수반");

    const profile = await getStudentAcademyProfile(student._id);
    assert.equal(profile.membership.status, "APPROVED");
    assert.equal(profile.membership.academyId.name, academy.name);

    const selectedConceptKeys = [
      "common-math-1/polynomials/polynomial-arithmetic",
      "common-math-1/polynomials/identity-remainder-theorem",
    ];
    const quickOmr = normalizeAssignmentOmr(JSON.stringify({
      enabled: true,
      questionCount: 3,
      defaultAnswerType: "MULTIPLE_CHOICE",
      choiceCount: 5,
      answers: ["2", "4", "5"],
    }), teacher._id);
    assert.deepEqual(quickOmr.sections, [{
      startNumber: 1,
      endNumber: 3,
      answerType: "MULTIPLE_CHOICE",
      choiceCount: 5,
    }]);
    assert.throws(
      () => normalizeAssignmentOmr(JSON.stringify({
        enabled: true,
        questionCount: 1,
        defaultAnswerType: "MULTIPLE_CHOICE",
        choiceCount: 5,
        answers: ["12"],
      }), teacher._id),
      /객관식 정답은 1~5/
    );
    const publishedWeek = await saveAcademyClassWeek({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      academicYear: 2026,
      weekNumber: 1,
      title: "다항식 첫 수업",
      lessonSummary: "다항식의 사칙연산과 항등식의 기본 원리를 학습했습니다.",
      conceptKeys: selectedConceptKeys,
      assignmentTitle: "다항식 기본 과제",
      assignmentInstructions: "교재 10쪽부터 13쪽까지 풀어오세요.",
      assignmentOmr: JSON.stringify({
        enabled: true,
        sections: [
          { startNumber: 1, endNumber: 2, answerType: "MULTIPLE_CHOICE", choiceCount: 5 },
          { startNumber: 3, endNumber: 3, answerType: "SHORT_ANSWER" },
        ],
        answers: ["2", "4", "12"],
      }),
      dueAt: "2026-09-04T18:00",
      files: [],
    });
    assert.equal(publishedWeek.concepts.length, 2);
    assert.equal(publishedWeek.assignmentOmr.questionCount, 3);
    assert.deepEqual(publishedWeek.assignmentOmr.answerKey, ["2", "4", "12"]);
    assert.equal(publishedWeek.concepts[0].conceptTitle, "다항식의 사칙연산");
    assert.equal(
      publishedWeek.concepts[0].href,
      "/learn/common-math-1/polynomials/polynomial-arithmetic"
    );
    assert.equal((await AcademyClassWeek.findById(publishedWeek._id).lean()).assignmentTitle, "다항식 기본 과제");
    await assert.rejects(
      saveAcademyClassWeek({
        teacherUserId: teacher._id,
        classId: academyClass._id,
        academicYear: 2026,
        weekNumber: 2,
        title: "잘못된 개념",
        conceptKeys: ["common-math-1/polynomials/not-in-yaml"],
        assignmentTitle: "검증 과제",
      }),
      (error) => Number(error.status) === 400 && /교육과정/.test(error.message)
    );
    await assert.rejects(
      saveAcademyClassWeek({
        teacherUserId: teacher._id,
        classId: academyClass._id,
        academicYear: 2026,
        weekNumber: 1,
        title: "중복 주차",
        conceptKeys: selectedConceptKeys,
        assignmentTitle: "중복 과제",
      }),
      (error) => Number(error.status) === 409 && /같은 학년도와 주차/.test(error.message)
    );
    const teacherClasswork = await getAcademyClassworkTeacherView({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
      editWeekId: publishedWeek._id,
    });
    assert.equal(teacherClasswork.weeks.length, 1);
    assert.equal(teacherClasswork.editingWeek.assignmentTitle, "다항식 기본 과제");
    assert.deepEqual(teacherClasswork.editingWeek.assignmentOmr.answerKey, ["2", "4", "12"]);
    assert.ok(teacherClasswork.catalog.some((course) => course.id === "common-math-1"));
    const deletableWeek = await saveAcademyClassWeek({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
      academicYear: 2026,
      weekNumber: 2,
      title: "삭제 검증 주차",
      conceptKeys: selectedConceptKeys,
      assignmentTitle: "삭제 검증 과제",
    });
    const deletedWeek = await deleteAcademyClassWeek({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
      weekId: deletableWeek._id,
    });
    assert.equal(deletedWeek.weekNumber, 2);
    assert.equal(await AcademyClassWeek.findById(deletableWeek._id).lean(), null);
    const studentClassroom = await getStudentAcademyClassroom({ studentUserId: student._id });
    assert.equal(studentClassroom.academy.name, academy.name);
    assert.equal(studentClassroom.academyClass.name, academyClass.name);
    assert.equal(studentClassroom.weeks.length, 1);
    const studentWeek = await getStudentAcademyWeek({
      studentUserId: student._id,
      weekId: publishedWeek._id,
    });
    assert.equal(studentWeek.week.concepts[1].conceptTitle, "항등식과 나머지정리");
    assert.equal(studentWeek.week.assignmentOmr.questionCount, 3);
    assert.equal(studentWeek.week.assignmentOmr.answerKey, undefined);
    const assignmentSubmission = await submitAcademyAssignment({
      studentUserId: student._id,
      weekId: publishedWeek._id,
      answers: ["2", "3", "12"],
      answerModes: ["MULTIPLE_CHOICE", "MULTIPLE_CHOICE", "SHORT_ANSWER"],
    });
    assert.equal(assignmentSubmission.correctCount, 2);
    assert.equal(assignmentSubmission.scorePercent, 67);
    assert.equal(assignmentSubmission.status, "SUBMITTED");
    assert.equal(String(assignmentSubmission.weekId), String(publishedWeek._id));
    assert.deepEqual(assignmentSubmission.answerModes, [
      "MULTIPLE_CHOICE",
      "MULTIPLE_CHOICE",
      "SHORT_ANSWER",
    ]);
    assert.ok(assignmentSubmission.gradedAt);
    assert.equal(await AcademyAssignmentSubmission.countDocuments({ weekId: publishedWeek._id }), 1);
    const submittedStudentWeek = await getStudentAcademyWeek({
      studentUserId: student._id,
      weekId: publishedWeek._id,
    });
    assert.equal(submittedStudentWeek.submission.scorePercent, 67);
    assert.deepEqual(
      submittedStudentWeek.week.assignmentOmr.questions.map((question) => question.answer),
      ["2", "3", "12"]
    );
    assert.deepEqual(
      submittedStudentWeek.week.assignmentOmr.questions.map((question) => question.answerType),
      ["MULTIPLE_CHOICE", "MULTIPLE_CHOICE", "SHORT_ANSWER"]
    );

    const missedStudent = await User.create({
      name: "academy-missed-student",
      realName: "미제출학생",
      email: "academy-missed-student@example.test",
      passwordHash: "not-used-in-verification",
      role: "student",
      schoolGrade: 10,
    });
    const missedMembership = await AcademyStudentMembership.create({
      academyId: academy._id,
      studentUserId: missedStudent._id,
      status: "APPROVED",
      classId: academyClass._id,
      joinSource: "ADMIN_ASSIGNMENT",
      requestedAt: new Date("2026-08-01T00:00:00.000Z"),
      dataConsentAt: new Date("2026-08-01T00:00:00.000Z"),
      reviewedAt: new Date("2026-08-01T00:00:00.000Z"),
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
      reviewedByUserId: teacher._id,
    });
    const missedWeek = await AcademyClassWeek.create({
      academyId: academy._id,
      classId: academyClass._id,
      academicYear: 2026,
      weekNumber: 2,
      title: "미제출 자동 0점 검증",
      concepts: publishedWeek.concepts,
      assignmentTitle: "마감 과제",
      assignmentInstructions: "기한 내 제출해 주세요.",
      dueAt: new Date("2026-08-29T09:00:00.000Z"),
      assignmentOmr: {
        enabled: true,
        questionCount: 3,
        sections: [
          { startNumber: 1, endNumber: 2, answerType: "MULTIPLE_CHOICE", choiceCount: 5 },
          { startNumber: 3, endNumber: 3, answerType: "SHORT_ANSWER", choiceCount: 5 },
        ],
        answerKey: ["2", "4", "12"],
        configuredAt: new Date("2026-08-28T00:00:00.000Z"),
        configuredByUserId: teacher._id,
        missedSubmissionsFinalizedAt: null,
      },
      createdByUserId: teacher._id,
      updatedByUserId: teacher._id,
    });
    await AcademyAssignmentSubmission.create({
      academyId: academy._id,
      classId: academyClass._id,
      weekId: missedWeek._id,
      studentUserId: student._id,
      answers: ["2", "4", "12"],
      answeredCount: 3,
      correctByQuestion: [true, true, true],
      correctCount: 3,
      questionCount: 3,
      scorePercent: 100,
      status: "SUBMITTED",
      submittedAt: new Date("2026-08-29T08:30:00.000Z"),
      gradedAt: new Date("2026-08-29T08:30:00.000Z"),
    });
    const missedFinalization = await finalizeMissedAssignmentSubmissions({
      now: new Date("2026-08-29T09:01:00.000Z"),
      weekIds: [missedWeek._id],
    });
    assert.deepEqual(missedFinalization, { scanned: 1, finalized: 1, autoZeroed: 1 });
    const missedSubmission = await AcademyAssignmentSubmission.findOne({
      weekId: missedWeek._id,
      studentUserId: missedStudent._id,
    }).lean();
    assert.equal(missedSubmission.status, "MISSED");
    assert.equal(missedSubmission.scorePercent, 0);
    assert.equal(missedSubmission.answeredCount, 0);
    assert.equal(missedSubmission.submittedAt, null);
    assert.deepEqual(missedSubmission.correctByQuestion, [false, false, false]);
    assert.equal(
      (await AcademyAssignmentSubmission.findOne({ weekId: missedWeek._id, studentUserId: student._id }).lean()).scorePercent,
      100
    );
    assert.deepEqual(
      await finalizeMissedAssignmentSubmissions({
        now: new Date("2026-08-29T09:02:00.000Z"),
        weekIds: [missedWeek._id],
      }),
      { scanned: 0, finalized: 0, autoZeroed: 0 }
    );
    const missedStudentWeek = await getStudentAcademyWeek({
      studentUserId: missedStudent._id,
      weekId: missedWeek._id,
    });
    const missedStudentWeekHtml = await render("student-academy-week", {
      user: { ...missedStudent.toObject(), hasAcademyMembership: true },
      classroom: missedStudentWeek,
      arenaProfileAvatar: { imageSrc: "/images/profile/default-avatar.png" },
      academyMembershipAvailable: true,
    });
    assert.match(missedStudentWeekHtml, /마감 미제출 · 0점 처리/);
    assert.match(missedStudentWeekHtml, /미제출 과제는 0점으로 처리/);
    await assert.rejects(
      submitAcademyAssignment({
        studentUserId: missedStudent._id,
        weekId: missedWeek._id,
        answers: ["2", "4", "12"],
      }),
      (error) => Number(error.status) === 410 && /마감 시간이 지났습니다/.test(error.message)
    );
    const missedTeacherView = await getAcademyClassworkTeacherView({
      teacherUserId: teacher._id,
      classId: academyClass._id,
    });
    const teacherMissedWeek = missedTeacherView.weeks.find((week) => String(week._id) === String(missedWeek._id));
    assert.equal(teacherMissedWeek.submissions.filter((submission) => submission.status === "MISSED").length, 1);
    await deleteAcademyClassWeek({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      weekId: missedWeek._id,
    });
    await AcademyStudentMembership.deleteOne({ _id: missedMembership._id });
    await User.deleteOne({ _id: missedStudent._id });

    const conceptExamId = new mongoose.Types.ObjectId();
    await PrivateMockExam.collection.insertOne({
      _id: conceptExamId,
      title: "개념 히트맵 검증 모의고사",
      weekKey: "2026-08-30",
      isTest: false,
      status: "archived",
      releaseAt: new Date("2026-08-30T06:00:00.000Z"),
      questionCount: 3,
      questionConcepts: [
        { conceptId: "polynomial-arithmetic", conceptTitle: "다항식의 사칙연산", courseTitle: "공통수학1", unitTitle: "다항식" },
        { conceptId: "remainder-theorem", conceptTitle: "나머지정리", courseTitle: "공통수학1", unitTitle: "다항식" },
        { conceptId: "polynomial-arithmetic", conceptTitle: "다항식의 사칙연산", courseTitle: "공통수학1", unitTitle: "다항식" },
      ],
    });
    await PrivateMockExamAttempt.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      examId: conceptExamId,
      userId: student._id,
      status: "submitted",
      integrityStatus: "CLEAR",
      score: 33,
      correctByQuestion: [false, true, false],
    });
    const classWeeklyMockInsight = await getWeeklyMockInsights({
      studentUserIds: [student._id],
      scopeLabel: academyClass.name,
      now: new Date("2026-09-03T00:00:00.000Z"),
    });
    assert.equal(classWeeklyMockInsight.participantCount, 1);
    assert.equal(classWeeklyMockInsight.averageScore, 33);
    assert.equal(classWeeklyMockInsight.hardestConcept.conceptTitle, "다항식의 사칙연산");
    assert.equal(classWeeklyMockInsight.hardestConcept.difficulty, 100);
    const academyWeeklyMockInsight = await getAcademyWeeklyMockInsights({
      academyId: academy._id,
      now: new Date("2026-09-03T00:00:00.000Z"),
    });
    assert.equal(academyWeeklyMockInsight.overall.participantCount, 1);
    assert.equal(
      academyWeeklyMockInsight.classes.find((row) => row.classId === String(academyClass._id)).insight.participantCount,
      1
    );

    const academyAssignmentFileId = new mongoose.Types.ObjectId();
    const scopedIdentity = buildForensicIdentity({
      userId: student._id,
      examId: publishedWeek._id,
      sourceType: "ACADEMY_ASSIGNMENT",
      sourceId: `${publishedWeek._id}:${academyAssignmentFileId}`,
      academyId: academy._id,
      academyClassId: academyClass._id,
      academyClassWeekId: publishedWeek._id,
      academyAssignmentFileId,
      downloadedAt: new Date("2026-08-28T09:00:00.000Z"),
    });
    const otherClassIdentity = buildForensicIdentity({
      userId: student._id,
      examId: publishedWeek._id,
      sourceType: "ACADEMY_ASSIGNMENT",
      sourceId: `${publishedWeek._id}:other-class-file`,
      academyId: academy._id,
      academyClassId: new mongoose.Types.ObjectId(),
      academyClassWeekId: publishedWeek._id,
      academyAssignmentFileId: new mongoose.Types.ObjectId(),
      downloadedAt: new Date("2026-08-28T09:01:00.000Z"),
    });
    const otherAcademyIdentity = buildForensicIdentity({
      userId: student._id,
      examId: publishedWeek._id,
      sourceType: "ACADEMY_ASSIGNMENT",
      sourceId: `${publishedWeek._id}:other-academy-file`,
      academyId: new mongoose.Types.ObjectId(),
      academyClassId: academyClass._id,
      academyClassWeekId: publishedWeek._id,
      academyAssignmentFileId: new mongoose.Types.ObjectId(),
      downloadedAt: new Date("2026-08-28T09:02:00.000Z"),
    });
    const adminDownloadIdentity = buildForensicIdentity({
      userId: admin._id,
      examId: publishedWeek._id,
      sourceType: "ACADEMY_ASSIGNMENT",
      sourceId: `${publishedWeek._id}:admin-file`,
      academyId: academy._id,
      academyClassId: academyClass._id,
      academyClassWeekId: publishedWeek._id,
      academyAssignmentFileId: new mongoose.Types.ObjectId(),
      downloadedAt: new Date("2026-08-28T09:03:00.000Z"),
    });
    await PdfWatermarkIssuance.create([
      {
        issuanceId: scopedIdentity.issuanceId,
        documentIssueId: scopedIdentity.documentIssueId,
        traceCode: scopedIdentity.traceCode,
        userId: student._id,
        examId: String(publishedWeek._id),
        sourceType: "ACADEMY_ASSIGNMENT",
        sourceId: `${publishedWeek._id}:${academyAssignmentFileId}`,
        assetId: String(academyAssignmentFileId),
        academyId: academy._id,
        academyClassId: academyClass._id,
        academyClassWeekId: publishedWeek._id,
        academyAssignmentFileId: String(academyAssignmentFileId),
        downloaderRole: "student",
        originalName: "고1-다항식-과제.pdf",
        downloadedAt: scopedIdentity.downloadedAt,
        pageCount: 3,
        forensicPayloadHash: scopedIdentity.payloadHash,
        status: "READY",
      },
      ...[
        { identity: otherClassIdentity, academyId: academy._id, academyClassId: otherClassIdentity.payload.academy_class_id, downloaderRole: "student" },
        { identity: otherAcademyIdentity, academyId: otherAcademyIdentity.payload.academy_id, academyClassId: academyClass._id, downloaderRole: "student" },
        { identity: adminDownloadIdentity, academyId: academy._id, academyClassId: academyClass._id, downloaderRole: "admin" },
      ].map(({ identity, academyId, academyClassId, downloaderRole }) => ({
        issuanceId: identity.issuanceId,
        documentIssueId: identity.documentIssueId,
        traceCode: identity.traceCode,
        userId: student._id,
        examId: String(publishedWeek._id),
        sourceType: "ACADEMY_ASSIGNMENT",
        sourceId: identity.payload.source_id,
        academyId,
        academyClassId,
        academyClassWeekId: publishedWeek._id,
        academyAssignmentFileId: identity.payload.academy_assignment_file_id,
        downloaderRole,
        originalName: "범위밖-과제.pdf",
        downloadedAt: identity.downloadedAt,
        pageCount: 2,
        forensicPayloadHash: identity.payloadHash,
        status: "READY",
      })),
    ]);
    const forensicsPage = await getAcademyForensicsPageData({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
    });
    assert.equal(forensicsPage.scope.approvedStudents, 1);
    assert.equal(forensicsPage.scope.issuedCopies, 1);
    assert.equal(forensicsPage.scope.distinctDownloaders, 1);
    const scopedForensics = await analyzeAcademyForensicEvidence({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
      traceCode: scopedIdentity.traceCode,
    });
    assert.equal(scopedForensics.analysis.matches.length, 1);
    assert.equal(scopedForensics.analysis.matches[0].displayName, "이학생");
    assert.equal(scopedForensics.analysis.matches[0].className, academyClass.name);
    assert.equal("email" in scopedForensics.analysis.matches[0], false);
    assert.equal("userId" in scopedForensics.analysis.matches[0], false);
    for (const outsideTraceCode of [
      otherClassIdentity.traceCode,
      otherAcademyIdentity.traceCode,
      adminDownloadIdentity.traceCode,
    ]) {
      const outsideForensics = await analyzeAcademyForensicEvidence({
        teacherUserId: secondTeacher._id,
        classId: academyClass._id,
        traceCode: outsideTraceCode,
      });
      assert.equal(outsideForensics.analysis.matches.length, 0);
    }

    const detail = await getAcademyStudentDetail({
      teacherUserId: teacher._id,
      membershipId: pendingMembership._id,
    });
    const secondTeacherDetail = await getAcademyStudentDetail({
      teacherUserId: secondTeacher._id,
      membershipId: pendingMembership._id,
    });
    assert.equal(secondTeacherDetail.membership.studentUserId.realName, "이학생");

    const problemIds = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
    const firstWrongAttemptId = new mongoose.Types.ObjectId();
    const secondWrongAttemptId = new mongoose.Types.ObjectId();
    await ProblemAttempt.collection.insertMany([
      { _id: new mongoose.Types.ObjectId(), userId: student._id, problemId: problemIds[0], attemptNumber: 1, reviewSourceAttemptId: null, isCorrect: true, submittedAt: new Date("2026-08-03T03:00:00.000Z"), review: { status: "not-required", reviewedAt: null } },
      { _id: firstWrongAttemptId, userId: student._id, problemId: problemIds[1], attemptNumber: 1, reviewSourceAttemptId: null, isCorrect: false, submittedAt: new Date("2026-08-04T03:00:00.000Z"), review: { status: "completed", reviewedAt: new Date("2026-08-05T03:00:00.000Z") } },
      { _id: new mongoose.Types.ObjectId(), userId: student._id, problemId: problemIds[1], attemptNumber: 2, reviewSourceAttemptId: firstWrongAttemptId, isCorrect: true, submittedAt: new Date("2026-08-05T03:00:00.000Z"), review: { status: "not-required", reviewedAt: null } },
      { _id: secondWrongAttemptId, userId: student._id, problemId: problemIds[2], attemptNumber: 1, reviewSourceAttemptId: null, isCorrect: false, submittedAt: new Date("2026-08-06T03:00:00.000Z"), review: { status: "completed", reviewedAt: new Date("2026-09-01T03:00:00.000Z") } },
      { _id: new mongoose.Types.ObjectId(), userId: student._id, problemId: problemIds[2], attemptNumber: 2, reviewSourceAttemptId: secondWrongAttemptId, isCorrect: false, submittedAt: new Date("2026-08-07T03:00:00.000Z"), review: { status: "not-required", reviewedAt: null } },
      { _id: new mongoose.Types.ObjectId(), userId: student._id, problemId: problemIds[3], attemptNumber: 1, reviewSourceAttemptId: null, isCorrect: true, submittedAt: new Date("2026-08-08T03:00:00.000Z"), review: { status: "not-required", reviewedAt: null } },
    ]);
    const mathMapProblemIds = Array.from({ length: 15 }, () => new mongoose.Types.ObjectId());
    await Problem.collection.insertMany(mathMapProblemIds.map((problemId, index) => {
      const isDownstream = index >= 10;
      return {
        _id: problemId,
        externalId: `academy-math-map-${index + 1}`,
        curriculumId: "kr-2022",
        courseId: "calculus-1",
        unitId: "calculus-1-02",
        conceptIds: [isDownstream ? "calculus-1-02-08" : "calculus-1-02-07"],
        primaryConceptId: isDownstream ? "calculus-1-02-08" : "calculus-1-02-07",
        difficulty: (index % 5) + 1,
        tags: [`type-${(index % 3) + 1}`],
        questionType: "short-answer",
      };
    }));
    const masterySourceAttempts = mathMapProblemIds.map((problemId, index) => ({
      _id: new mongoose.Types.ObjectId(),
      userId: student._id,
      problemId,
      reviewSourceAttemptId: null,
      curriculumId: "kr-2022",
      courseId: "calculus-1",
      unitId: "calculus-1-02",
      conceptId: index >= 10 ? "calculus-1-02-08" : "calculus-1-02-07",
      attemptNumber: 1,
      problemSnapshot: { typeId: `type-${(index % 3) + 1}`, difficulty: (index % 5) + 1 },
      isCorrect: index >= 10 ? index < 12 : index < 4,
      submittedAt: new Date(Date.UTC(2026, 5, index + 1, 3, 0, 0)),
    }));
    const firstMasteryWrong = masterySourceAttempts[4];
    await ProblemAttempt.collection.insertMany([
      ...masterySourceAttempts,
      {
        _id: new mongoose.Types.ObjectId(),
        userId: student._id,
        problemId: firstMasteryWrong.problemId,
        reviewSourceAttemptId: firstMasteryWrong._id,
        curriculumId: "kr-2022",
        courseId: "calculus-1",
        unitId: "calculus-1-02",
        conceptId: "calculus-1-02-07",
        attemptNumber: 2,
        problemSnapshot: { typeId: "type-2", difficulty: 5 },
        isCorrect: true,
        submittedAt: new Date("2026-06-20T03:00:00.000Z"),
      },
    ]);
    await LearningEvent.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      userId: student._id,
      clientEventId: "academy-statistics-learning-day",
      sessionId: "academy-statistics-session",
      eventType: "concept-opened",
      durationMs: 60000,
      occurredAt: new Date("2026-08-02T03:00:00.000Z"),
    });
    await ConceptProgress.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      userId: student._id,
      status: "completed",
      completedAt: new Date("2026-08-09T03:00:00.000Z"),
    });

    const statistics = await getStudentMonthlyStatistics({
      studentUserId: student._id,
      periodKey: "2026-08",
      now: new Date("2026-08-28T03:00:00.000Z"),
    });
    assert.equal(statistics.values.activeLearningDays, 8);
    assert.equal(statistics.values.completedConcepts, 1);
    assert.equal(statistics.values.uniqueProblems, 4);
    assert.equal(statistics.values.firstAttemptAccuracy, 50);
    assert.equal(statistics.values.wrongAnswerReviewRate, 50);
    assert.equal(statistics.values.retrySuccessRate, 50);
    assert.equal(statistics.samples.wrongAnswers, 2);
    assert.equal(statistics.samples.reviewedWrongAnswers, 1);
    assert.match(statistics.summary.nextDirection, /오답 복습률/);

    const academyStatistics = await getAcademyMonthlyStatistics({
      studentUserIds: [student._id],
      periodKey: "2026-08",
      now: new Date("2026-08-28T03:00:00.000Z"),
    });
    assert.equal(academyStatistics.values.totalStudents, 1);
    assert.equal(academyStatistics.values.activeStudents, 1);
    assert.equal(academyStatistics.values.participationRate, 100);
    assert.equal(academyStatistics.values.averageLearningDays, 8);
    assert.equal(academyStatistics.values.averageCompletedConcepts, 1);
    assert.equal(academyStatistics.values.averageUniqueProblems, 4);
    assert.equal(academyStatistics.values.firstAttemptAccuracy, 50);
    assert.equal(academyStatistics.values.wrongAnswerReviewRate, 50);
    assert.equal(academyStatistics.values.retrySuccessRate, 50);
    assert.equal(academyStatistics.attentionStudents.length, 1);
    assert.match(academyStatistics.summary.bullets[1].text, /학습일 8일/);

    const averagedStatistics = await getAcademyMonthlyStatistics({
      studentUserIds: [student._id, new mongoose.Types.ObjectId()],
      periodKey: "2026-08",
      now: new Date("2026-08-28T03:00:00.000Z"),
    });
    assert.equal(averagedStatistics.values.totalStudents, 2);
    assert.equal(averagedStatistics.values.activeStudents, 1);
    assert.equal(averagedStatistics.values.participationRate, 50);
    assert.equal(averagedStatistics.values.averageLearningDays, 4);
    assert.equal(averagedStatistics.values.averageUniqueProblems, 2);
    assert.equal(averagedStatistics.values.averageCompletedConcepts, 0.5);
    assert.equal(academyStatistics.health.score, 55);
    assert.equal(academyStatistics.health.distribution.RISK, 1);
    assert.equal(academyStatistics.analytics.growth.points.length, 4);
    assert.ok(academyStatistics.analytics.growth.points.some((point) => point.attempts > 0));

    const studentMathMap = await getStudentMathMap({ studentUserId: student._id });
    const prerequisiteMastery = studentMathMap.concepts.find((concept) => concept.id === "calculus-1-02-07");
    assert.equal(studentMathMap.graphVersion, "kr-2022-math-graph-v1.0");
    assert.equal(studentMathMap.modelVersion, "v1.0");
    assert.equal(prerequisiteMastery.evidence.attemptCount, 10);
    assert.equal(prerequisiteMastery.evidence.retryAttemptedCount, 1);
    assert.equal(prerequisiteMastery.evidence.retryRecoveredCount, 1);
    assert.equal(prerequisiteMastery.confidence, "MEDIUM");
    assert.equal(prerequisiteMastery.status, "WEAK");
    assert.equal(studentMathMap.bottlenecks[0].conceptId, "calculus-1-02-07");
    assert.equal(studentMathMap.recommendation.conceptId, "calculus-1-02-07");
    assert.equal(studentMathMap.recommendation.problemMix.total, 15);
    const classMathMap = await getClassMathMap({ studentUserIds: [student._id] });
    assert.equal(classMathMap.totalStudents, 1);
    assert.equal(classMathMap.concepts.find((concept) => concept.id === "calculus-1-02-08").analyzedCount, 1);
    assert.equal(classMathMap.concepts.find((concept) => concept.id === "calculus-1-02-08").unknownCount, 0);
    academyStatistics.mathMap = classMathMap;
    academyStatistics.analytics.heatmap = {
      items: classMathMap.heatmap.slice(0, 18),
      measuredConcepts: classMathMap.analyzedConceptCount,
    };

    let attendanceRoster = await getAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-08-28",
      classId: academyClass._id,
      now: new Date("2026-08-28T08:25:00.000Z"),
    });
    assert.equal(attendanceRoster.session.attendanceMode, "SELF_CODE");
    assert.match(attendanceRoster.session.code, /^\d{6}$/);
    const firstAttendanceCode = attendanceRoster.session.code;
    const regeneratedSession = await regenerateAttendanceSessionCode({
      teacherUserId: teacher._id,
      sessionId: attendanceRoster.session.id,
      now: new Date("2026-08-28T08:26:00.000Z"),
    });
    assert.notEqual(regeneratedSession.code, firstAttendanceCode);
    await assert.rejects(
      checkInStudentAttendance({
        studentUserId: student._id,
        sessionId: attendanceRoster.session.id,
        code: firstAttendanceCode,
        now: new Date("2026-08-28T08:30:00.000Z"),
      }),
      (error) => Number(error.status) === 400 && /올바르지/.test(error.message)
    );
    const attendanceDashboard = await getStudentAttendanceDashboard({
      studentUserId: student._id,
      now: new Date("2026-08-28T08:30:00.000Z"),
    });
    assert.equal(attendanceDashboard.canCheckIn, true);
    assert.equal(attendanceDashboard.academyClass.name, academyClass.name);
    const studentCheckIn = await checkInStudentAttendance({
      studentUserId: student._id,
      sessionId: attendanceRoster.session.id,
      code: regeneratedSession.code,
      now: new Date("2026-08-28T08:30:00.000Z"),
    });
    assert.equal(studentCheckIn.status, "PRESENT");
    assert.equal(
      (await AcademyAttendance.findOne({ sessionId: attendanceRoster.session.id, studentUserId: student._id }).lean()).source,
      "SELF_CODE"
    );
    assert.equal(
      await AcademyAttendanceAudit.countDocuments({ sessionId: attendanceRoster.session.id, actorType: "STUDENT" }),
      1
    );
    const attendanceSave = await saveAcademyAttendanceRoster({
      teacherUserId: teacher._id,
      dateKey: "2026-08-28",
      classId: academyClass._id,
      sessionId: attendanceRoster.session.id,
      studentUserIds: [student._id],
      statuses: ["PRESENT"],
      notes: ["정상 등원"],
      now: new Date("2026-08-28T08:31:00.000Z"),
    });
    assert.equal(attendanceSave.recordedCount, 1);
    attendanceRoster = await getAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-08-28",
      classId: academyClass._id,
      now: new Date("2026-08-28T08:32:00.000Z"),
    });
    assert.equal(attendanceRoster.roster.length, 1);
    assert.equal(attendanceRoster.counts.PRESENT, 1);
    assert.equal(attendanceRoster.roster[0].attendance.note, "정상 등원");
    await saveAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-08-28",
      classId: academyClass._id,
      sessionId: attendanceRoster.session.id,
      studentUserIds: student._id,
      statuses: "LATE",
      notes: "교통 지연",
      now: new Date("2026-08-28T09:10:00.000Z"),
    });
    attendanceRoster = await getAcademyAttendanceRoster({
      teacherUserId: teacher._id,
      dateKey: "2026-08-28",
      classId: academyClass._id,
      now: new Date("2026-08-28T08:40:00.000Z"),
    });
    assert.equal(attendanceRoster.counts.LATE, 1);
    assert.equal(attendanceRoster.roster[0].attendance.note, "교통 지연");
    assert.ok(await AcademyAttendanceSession.findById(attendanceRoster.session.id).lean());
    assert.equal(await AcademyAttendanceCodeAttempt.countDocuments({ sessionId: attendanceRoster.session.id }), 0);
    assert.ok(await AcademyAttendanceAudit.countDocuments({ sessionId: attendanceRoster.session.id, actorType: "TEACHER" }) >= 2);
    await assert.rejects(
      saveAcademyAttendanceRoster({
        teacherUserId: teacher._id,
        dateKey: "2026-08-28",
        studentUserIds: [new mongoose.Types.ObjectId()],
        statuses: ["PRESENT"],
        notes: [""],
      }),
      (error) => Number(error.status) === 403 && /승인 학생/.test(error.message)
    );
    academyStatistics.attentionStudents = academyStatistics.attentionStudents.map((item) => ({
      ...item,
      membership: portal.students[0],
    }));

    await assert.rejects(
      getAdminAcademyList({ adminUserId: teacher._id }),
      (error) => Number(error.status) === 403 && /운영자 계정/.test(error.message)
    );
    const suspendedAdmin = await User.create({
      name: "academy-suspended-admin",
      realName: "정지운영자",
      email: "academy-suspended-admin@example.test",
      passwordHash: "not-used-in-verification",
      role: "admin",
      isActive: true,
      accountStatus: "suspended",
    });
    await assert.rejects(
      getAdminAcademyList({ adminUserId: suspendedAdmin._id }),
      (error) => Number(error.status) === 403 && /활성 운영자/.test(error.message)
    );
    const adminAcademyList = await getAdminAcademyList({
      adminUserId: admin._id,
      search: "평촌",
      status: "ACTIVE",
    });
    assert.equal(adminAcademyList.academies.length, 1);
    assert.equal(adminAcademyList.academies[0].counts.activeStaff, 2);
    assert.equal(adminAcademyList.academies[0].counts.approvedStudents, 1);
    assert.equal(adminAcademyList.academies[0].counts.activeClasses, 1);

    const secondStaffForAdmin = await AcademyStaff.findOne({
      academyId: academy._id,
      userId: secondTeacher._id,
      status: "ACTIVE",
    }).lean();
    await updateAdminAcademyProfile({ adminUserId: admin._id, academyId: academy._id, action: "PAUSE" });
    assert.equal((await Academy.findById(academy._id).lean()).status, "PAUSED");
    await updateAdminAcademyProfile({ adminUserId: admin._id, academyId: academy._id, action: "ACTIVATE" });
    await updateAdminAcademyStaff({ adminUserId: admin._id, academyId: academy._id, staffId: secondStaffForAdmin._id, action: "REVOKE" });
    assert.equal((await AcademyStaff.findById(secondStaffForAdmin._id).lean()).status, "REVOKED");
    await updateAdminAcademyStaff({ adminUserId: admin._id, academyId: academy._id, staffId: secondStaffForAdmin._id, action: "RESTORE" });
    const originalOwnerStaff = await AcademyStaff.findOne({ academyId: academy._id, userId: teacher._id, role: "OWNER" }).lean();
    await transferAdminAcademyOwner({ adminUserId: admin._id, academyId: academy._id, newOwnerStaffId: secondStaffForAdmin._id });
    assert.equal((await AcademyStaff.findById(secondStaffForAdmin._id).lean()).role, "OWNER");
    assert.equal((await AcademyStaff.findById(originalOwnerStaff._id).lean()).role, "TEACHER");
    await transferAdminAcademyOwner({ adminUserId: admin._id, academyId: academy._id, newOwnerStaffId: originalOwnerStaff._id });
    assert.equal((await AcademyStaff.findById(originalOwnerStaff._id).lean()).role, "OWNER");
    await updateAdminAcademyMembership({ adminUserId: admin._id, academyId: academy._id, membershipId: pendingMembership._id, action: "REMOVE" });
    assert.equal((await AcademyStudentMembership.findById(pendingMembership._id).lean()).status, "LEFT");
    await updateAdminAcademyMembership({ adminUserId: admin._id, academyId: academy._id, membershipId: pendingMembership._id, action: "RESTORE" });
    await assignAdminAcademyMembershipClass({ adminUserId: admin._id, academyId: academy._id, membershipId: pendingMembership._id, classId: academyClass._id });
    await updateAdminAcademyClass({ adminUserId: admin._id, academyId: academy._id, classId: academyClass._id, action: "DEACTIVATE" });
    assert.equal((await AcademyClass.findById(academyClass._id).lean()).isActive, false);
    await updateAdminAcademyClass({ adminUserId: admin._id, academyId: academy._id, classId: academyClass._id, action: "ACTIVATE" });
    await assignAdminAcademyMembershipClass({ adminUserId: admin._id, academyId: academy._id, membershipId: pendingMembership._id, classId: academyClass._id });
    await updateAdminAcademyInvite({ adminUserId: admin._id, academyId: academy._id, inviteId: invite._id, action: "RESTORE" });
    await updateAdminAcademyClassOperations({
      adminUserId: admin._id,
      academyId: academy._id,
      classId: academyClass._id,
      weekdays: [1, 3, 5],
      startTime: "17:45",
      endTime: "19:45",
      effectiveFrom: "2026-08-01",
      attendanceMode: "SELF_CODE",
      opensBeforeMinutes: 15,
      lateAfterMinutes: 7,
      closesAfterMinutes: 35,
    });
    assert.deepEqual((await AcademyClass.findById(academyClass._id).lean()).schedule.weekdays, [1, 3, 5]);
    await transferAdminAcademyClassHomeroom({
      adminUserId: admin._id,
      academyId: academy._id,
      classId: academyClass._id,
      nextTeacherUserId: secondTeacher._id,
      retainPreviousAsCoTeacher: true,
    });
    assert.equal(String((await AcademyClass.findById(academyClass._id).lean()).homeroomTeacherUserId), String(secondTeacher._id));
    await transferAdminAcademyClassHomeroom({
      adminUserId: admin._id,
      academyId: academy._id,
      classId: academyClass._id,
      nextTeacherUserId: teacher._id,
      retainPreviousAsCoTeacher: false,
    });
    const attendanceBeforeAdminOverride = await AcademyAttendance.findOne({
      sessionId: attendanceRoster.session.id,
      studentUserId: student._id,
    }).lean();
    await updateAdminAcademyAttendance({
      adminUserId: admin._id,
      academyId: academy._id,
      attendanceId: attendanceBeforeAdminOverride._id,
      status: "EXCUSED",
      note: "운영자 검증 보정",
    });
    const attendanceAfterAdminOverride = await AcademyAttendance.findById(attendanceBeforeAdminOverride._id).lean();
    assert.equal(attendanceAfterAdminOverride.status, "EXCUSED");
    assert.equal(attendanceAfterAdminOverride.source, "ADMIN");
    assert.ok(await AcademyAttendanceAudit.findOne({ attendanceId: attendanceBeforeAdminOverride._id, actorType: "ADMIN" }).lean());
    await assert.rejects(
      checkInStudentAttendance({
        studentUserId: student._id,
        sessionId: attendanceRoster.session.id,
        code: regeneratedSession.code,
        now: new Date("2026-08-28T08:32:00.000Z"),
      }),
      (error) => Number(error.status) === 409 && /운영자가 이미/.test(error.message)
    );
    const adminRegeneratedCode = await regenerateAdminAcademyAttendanceCode({
      adminUserId: admin._id,
      academyId: academy._id,
      sessionId: attendanceRoster.session.id,
      now: new Date("2026-08-28T08:32:00.000Z"),
    });
    assert.match(adminRegeneratedCode.code, /^\d{6}$/);
    assert.notEqual(adminRegeneratedCode.code, regeneratedSession.code);
    await updateAdminAcademyInvite({ adminUserId: admin._id, academyId: academy._id, inviteId: invite._id, action: "REVOKE" });
    assert.equal((await AcademyInvite.findById(invite._id).lean()).status, "REVOKED");
    await updateAdminAcademyInvite({ adminUserId: admin._id, academyId: academy._id, inviteId: invite._id, action: "RESTORE" });

    const adminAcademyDetail = await getAdminAcademyDetail({
      adminUserId: admin._id,
      academyId: academy._id,
      periodKey: "2026-08",
      now: new Date("2026-08-28T08:32:00.000Z"),
    });
    assert.equal(adminAcademyDetail.staff.length, 2);
    assert.equal(adminAcademyDetail.memberships.length, 1);
    assert.equal(adminAcademyDetail.classes.length, 1);
    assert.equal(adminAcademyDetail.classWeeks.length, 1);
    assert.equal(adminAcademyDetail.classWeeks[0].assignmentTitle, "다항식 기본 과제");
    assert.equal(adminAcademyDetail.invites.length, 1);
    assert.ok(adminAcademyDetail.attendanceSessions.length >= 1);
    assert.ok(adminAcademyDetail.attendanceRecords.length >= 1);
    assert.ok(adminAcademyDetail.attendanceAudits.some((audit) => audit.actorType === "ADMIN"));
    assert.equal(adminAcademyDetail.statistics.values.averageLearningDays, 8);
    assert.equal(adminAcademyDetail.statistics.attentionStudents[0].membership.studentUserId.realName, "이학생");
    assert.equal(adminAcademyDetail.weeklyMockInsights.overall.participantCount, 1);

    const adminListHtml = await render("admin-academies", {
      user: admin,
      academyData: await getAdminAcademyList({ adminUserId: admin._id }),
      feedback: { message: null, error: null },
    });
    assert.match(adminListHtml, /SUPER ADMIN/);
    assert.match(adminListHtml, /평촌 검증수학/);
    assert.match(adminListHtml, /전체 정보/);
    const adminDetailHtml = await render("admin-academy-detail", {
      user: admin,
      detail: adminAcademyDetail,
      feedback: { message: null, error: null },
    });
    assert.match(adminDetailHtml, /기본 정보·운영 제어/);
    assert.match(adminDetailHtml, /승인 학생 전체 평균 통계/);
    assert.match(adminDetailHtml, /선생님 전체 정보/);
    assert.match(adminDetailHtml, /학생 전체 정보·소속 제어/);
    assert.match(adminDetailHtml, /학원 프로필 사진/);
    assert.match(adminDetailHtml, /\/admin\/academies\/.+\/profile-image/);
    assert.match(adminDetailHtml, /고1 월수반/);
    assert.match(adminDetailHtml, /수업 일정·출석 방식/);
    assert.match(adminDetailHtml, /주차별 수업·과제 전체 정보/);
    assert.match(adminDetailHtml, /다항식 기본 과제/);
    assert.match(adminDetailHtml, /수업 회차·학생 출결·감사 이력/);
    assert.match(adminDetailHtml, /운영자 검증 보정/);
    assert.match(adminDetailHtml, /코드 재발급/);
    assert.match(adminDetailHtml, /주간 모의고사 개념 히트맵/);
    assert.match(adminDetailHtml, /반별 개념 상세/);
    assert.match(adminDetailHtml, /다항식의 사칙연산/);
    assert.match(adminDetailHtml, new RegExp(invite.code));

    const emptyStatistics = await getStudentMonthlyStatistics({
      studentUserId: student._id,
      periodKey: "2026-07",
      now: new Date("2026-08-28T03:00:00.000Z"),
    });
    assert.equal(emptyStatistics.hasActivity, false);
    assert.equal(emptyStatistics.cards[0].value, "—");
    assert.equal(emptyStatistics.cards[2].value, "—");
    assert.match(emptyStatistics.summary.bullets[0].text, /학습 기록이 아직 없습니다/);

    const teacherUser = { id: String(teacher._id), name: teacher.name, realName: teacher.realName, role: "teacher" };
    const academyForensicsHtml = await render("academy-forensics", {
      user: teacherUser,
      forensics: { ...forensicsPage, profileImageSrc: "" },
      analysis: scopedForensics.analysis,
      error: null,
      oldTraceCode: scopedIdentity.traceCode,
    });
    assert.match(academyForensicsHtml, /반 단위 후보 범위/);
    assert.match(academyForensicsHtml, /선택 반 안에서 추적/);
    assert.match(academyForensicsHtml, /이학생/);
    assert.match(academyForensicsHtml, new RegExp(scopedIdentity.traceCode));
    assert.doesNotMatch(academyForensicsHtml, /academy-student@example\.test/);
    const academyLocals = {
      user: teacherUser,
      portal,
      statistics: academyStatistics,
      weeklyMockInsights: academyWeeklyMockInsight,
      attendance: attendanceRoster,
      feedback: null,
      createdInviteId: String(invite._id),
    };

    for (const tab of ["dashboard", "attendance", "students", "requests", "classes", "invites", "teachers"]) {
      const html = await render("academy", { ...academyLocals, activeAcademyPage: tab });
      assert.match(html, /학원 관리/);
      if (tab === "dashboard") {
        assert.match(html, /승인 학생 전체의 평균/);
        assert.match(html, /학원 전체 Summary/);
        assert.match(html, /평균 학습일/);
        assert.match(html, /학습 참여 학생/);
        assert.match(html, /오답 복습률/);
        assert.match(html, /이학생/);
        assert.match(html, /50%/);
        assert.match(html, /학습 건강도/);
        assert.match(html, /data-academy-growth-chart/);
        assert.match(html, /data-academy-heatmap-chart/);
        assert.match(html, /학원 주간 모의고사 개념 히트맵/);
        assert.match(html, /다항식의 사칙연산/);
      }
      if (tab === "attendance") {
        assert.match(html, /학원 출결 관리/);
        assert.match(html, /교통 지연/);
        assert.match(html, /data-attendance-form/);
        assert.match(html, /\/academy\/attendance/);
      }
      if (tab === "students") assert.match(html, /이학생/);
      if (tab === "classes") {
        assert.match(html, /고1 월수반/);
        assert.match(html, new RegExp(`/academy/classes/${academyClass._id}`));
        assert.match(html, /반 통계 보기/);
      }
      if (tab === "invites") assert.match(html, new RegExp(invite.code));
      if (tab === "teachers") {
        assert.match(html, /선생님 관리/);
        assert.match(html, /김선생/);
        assert.match(html, /박선생/);
        assert.match(html, /원장/);
      }
    }

    const classDetail = await getAcademyClassDetail({
      teacherUserId: teacher._id,
      classId: academyClass._id,
    });
    assert.equal(classDetail.academyClass.name, "고1 월수반");
    assert.equal(classDetail.students.length, 1);
    assert.equal(classDetail.students[0].studentUserId.realName, "이학생");
    await assert.rejects(
      getAcademyClassDetail({ teacherUserId: secondTeacher._id, classId: academyClass._id }),
      (error) => Number(error.status) === 403 && error.message === "권한이 없습니다."
    );
    await assert.rejects(
      getAcademyClassDetail({ teacherUserId: teacher._id, classId: new mongoose.Types.ObjectId() }),
      (error) => Number(error.status) === 404 && /현재 학원에서 사용하는 반/.test(error.message)
    );
    const classStatistics = await getAcademyMonthlyStatistics({
      studentUserIds: classDetail.students.map((membership) => membership.studentUserId._id),
      periodKey: "2026-08",
      now: new Date("2026-08-28T03:00:00.000Z"),
      scopeLabel: "반",
    });
    assert.equal(classStatistics.cards[0].label, "학습 건강도");
    assert.equal(classStatistics.values.totalStudents, 1);
    assert.match(classStatistics.summary.bullets[2].text, /평균 정답률/);
    const classMembershipsByStudentId = new Map(
      classDetail.students.map((membership) => [String(membership.studentUserId._id), membership])
    );
    classStatistics.attentionStudents = classStatistics.attentionStudents
      .map((item) => ({ ...item, membership: classMembershipsByStudentId.get(item.studentUserId) }))
      .filter((item) => item.membership);
    const classDetailLocals = {
      user: teacherUser,
      detail: { ...classDetail, profileImageSrc: "" },
      statistics: classStatistics,
      mathMap: classMathMap,
      classwork: teacherClasswork,
      weeklyMockInsights: classWeeklyMockInsight,
      activeAcademyPage: "classes",
    };
    const classDetailHtml = await render("academy-class-detail", { ...classDetailLocals, activeClassSection: "statistics" });
    const classAttendanceHtml = await render("academy-class-detail", { ...classDetailLocals, activeClassSection: "attendance" });
    const classworkHtml = await render("academy-class-detail", { ...classDetailLocals, activeClassSection: "classwork" });
    const classSettingsHtml = await render("academy-class-detail", { ...classDetailLocals, activeClassSection: "settings" });
    assert.match(classDetailHtml, /CLASS LEARNING REPORT/);
    assert.match(classDetailHtml, /고1 월수반 Summary/);
    assert.match(classDetailHtml, /반 평균 통계입니다/);
    assert.match(classDetailHtml, /이학생/);
    assert.match(classDetailHtml, /\/academy\/students\//);
    assert.match(classDetailHtml, /CLASS MATH MAP/);
    assert.match(classDetailHtml, /calculus-1-02-07|함수의 증가·감소와 극값/);
    assert.match(classDetailHtml, /반 상세 메뉴/);
    assert.match(classDetailHtml, /고1 월수반 주간 모의고사 개념 히트맵/);
    assert.doesNotMatch(classDetailHtml, /수업 일정·출결 방식/);
    assert.match(classAttendanceHtml, /수업 일정·출결 방식/);
    assert.match(classAttendanceHtml, /학생 코드 출결/);
    assert.doesNotMatch(classAttendanceHtml, /CLASS MATH MAP/);
    assert.match(classSettingsHtml, /담임·공동 담당/);
    assert.match(classSettingsHtml, /반 종료·보관/);
    assert.match(classSettingsHtml, new RegExp(`/academy/classes/${academyClass._id}/archive`));
    assert.match(classworkHtml, /주차별 수업·과제/);
    assert.match(classworkHtml, /현재 제공 중인 교육과정 개념/);
    assert.match(classworkHtml, /다항식 첫 수업/);
    assert.match(classworkHtml, /다항식의 사칙연산/);
    assert.match(classworkHtml, new RegExp(`editWeek=${publishedWeek._id}`));
    assert.match(classworkHtml, new RegExp(`/academy/classes/${academyClass._id}/weeks/${publishedWeek._id}/delete`));
    assert.match(classworkHtml, /academy-classwork-layout is-editing/);
    assert.match(classworkHtml, /총 문항 수/);
    assert.match(classworkHtml, /기본 입력 방식/);
    assert.doesNotMatch(classworkHtml, /data-academy-omr-add-section/);

    const studentDashboardHtml = await render("student-academy", {
      user: { ...student.toObject(), hasAcademyMembership: true },
      classroom: { ...studentClassroom, profileImageSrc: "" },
      arenaProfileAvatar: { imageSrc: "/images/profile/default-avatar.png" },
      academyMembershipAvailable: true,
    });
    assert.match(studentDashboardHtml, /ACADEMY CLASSROOM/);
    assert.match(studentDashboardHtml, /다항식 첫 수업/);
    assert.match(studentDashboardHtml, new RegExp(`/my-academy/weeks/${publishedWeek._id}`));
    assert.match(studentDashboardHtml, /href="\/my-academy"[^>]*aria-current="page"/);
    const studentWeekHtml = await render("student-academy-week", {
      user: { ...student.toObject(), hasAcademyMembership: true },
      classroom: { ...submittedStudentWeek, profileImageSrc: "" },
      arenaProfileAvatar: { imageSrc: "/images/profile/default-avatar.png" },
      academyMembershipAvailable: true,
    });
    assert.match(studentWeekHtml, /이번 주에 배운 개념/);
    assert.match(studentWeekHtml, /다항식 기본 과제/);
    assert.match(studentWeekHtml, /교재 10쪽부터 13쪽까지/);
    assert.match(studentWeekHtml, /과제 제출하기/);
    assert.match(studentWeekHtml, /객관식으로 바꾸기/);
    assert.match(studentWeekHtml, /student-assignment-omr\.js/);
    assert.match(studentWeekHtml, /자동 채점 완료 · 67점/);
    assert.match(studentWeekHtml, /\/learn\/common-math-1\/polynomials\/polynomial-arithmetic/);

    await saveAcademyClassWeek({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      weekId: publishedWeek._id,
      academicYear: 2026,
      weekNumber: 1,
      title: "다항식 첫 수업",
      lessonSummary: "다항식의 사칙연산과 항등식의 기본 원리를 학습했습니다.",
      conceptKeys: selectedConceptKeys,
      assignmentTitle: "다항식 기본 과제",
      assignmentInstructions: "교재 10쪽부터 13쪽까지 풀어오세요.",
      assignmentOmr: JSON.stringify({
        enabled: true,
        sections: [
          { startNumber: 1, endNumber: 2, answerType: "MULTIPLE_CHOICE", choiceCount: 5 },
          { startNumber: 3, endNumber: 3, answerType: "SHORT_ANSWER" },
        ],
        answers: ["2", "3", "12"],
      }),
      dueAt: "2026-09-04T18:00",
      files: [],
    });
    const regradedSubmission = await AcademyAssignmentSubmission.findOne({
      weekId: publishedWeek._id,
      studentUserId: student._id,
    }).lean();
    assert.equal(regradedSubmission.scorePercent, 100);
    assert.equal(regradedSubmission.correctCount, 3);

    const emptyAcademyClass = await createAcademyClass({
      teacherUserId: teacher._id,
      name: "빈 반 검증",
    });
    const emptyClassDetail = await getAcademyClassDetail({
      teacherUserId: teacher._id,
      classId: emptyAcademyClass._id,
    });
    const emptyClassStatistics = await getAcademyMonthlyStatistics({
      studentUserIds: [],
      periodKey: "2026-08",
      now: new Date("2026-08-28T03:00:00.000Z"),
      scopeLabel: "반",
    });
    assert.equal(emptyClassDetail.students.length, 0);
    assert.equal(emptyClassStatistics.cards[0].value, "—");
    assert.match(emptyClassStatistics.summary.bullets[0].text, /반에 배정된 학생이 없어/);

    const detailHtml = await render("academy-student-detail", {
      user: teacherUser,
      detail,
      statistics,
      mathMap: studentMathMap,
      activeAcademyPage: "students",
    });
    assert.match(detailHtml, /첫 시도 정답률/);
    assert.match(detailHtml, /재도전 성공률/);
    assert.match(detailHtml, /오답 복습률/);
    assert.match(detailHtml, /학부모 공유용 Summary/);
    assert.match(detailHtml, /50%/);
    assert.match(detailHtml, /서로 다른 문제 4개/);
    assert.match(detailHtml, /자동 생성/);
    assert.match(detailHtml, /학생 수학 능력 지도/);
    assert.match(detailHtml, /data-student-math-map-chart/);
    assert.match(detailHtml, /최근 유효 풀이/);
    assert.match(detailHtml, /RULE-BASED RECOMMENDATION/);
    assert.doesNotMatch(detailHtml, /통계 로직은 아직 연결하지 않았습니다/);

    const joinHtml = await render("academy-join", {
      user: { id: String(student._id), name: student.name, realName: student.realName, role: "student" },
      invite: await getAcademyInvitePresentation(invite.token),
      error: null,
    });
    assert.match(joinHtml, /즉시 연결되지는 않습니다/);
    assert.match(joinHtml, /결제 정보와 커뮤니티 활동은 공유되지 않습니다/);

    const profileView = fs.readFileSync(path.join(root, "views", "profile.ejs"), "utf8");
    assert.match(profileView, /\/profile\/academy\/request/);
    assert.match(profileView, /\/profile\/academy\/code/);
    assert.match(profileView, /학년은 가입 시 등록한 정보를 기준으로 매년 자동 변경/);
    assert.match(profileView, /반은 학원 선생님이 배정/);

    const pricingView = fs.readFileSync(path.join(root, "views", "pricing.ejs"), "utf8");
    assert.doesNotMatch(pricingView, /학원용 패키지|학원 패키지/);

    const adminDashboardView = fs.readFileSync(path.join(root, "views", "admin-dashboard.ejs"), "utf8");
    assert.match(adminDashboardView, /학원 등록 승인/);
    assert.match(adminDashboardView, /\/admin\/academies\/<%= academy\._id %>\/approve/);
    assert.match(adminDashboardView, /\/admin\/academies\/<%= academy\._id %>\/reject/);
    const adminNavigationView = fs.readFileSync(path.join(root, "views", "partials", "admin-navigation.ejs"), "utf8");
    assert.match(adminNavigationView, /href: "\/admin\/academies", label: "학원 관리"/);
    const academyRoutes = fs.readFileSync(path.join(root, "routes", "matths-routes.js"), "utf8");
    assert.match(academyRoutes, /"\/admin\/academies"[\s\S]+adminAcademiesPage/);
    assert.match(academyRoutes, /"\/admin\/academies\/:academyId"[\s\S]+adminAcademyDetailPage/);
    const academyPortalRoutes = fs.readFileSync(path.join(root, "routes", "academy-routes.js"), "utf8");
    assert.match(academyPortalRoutes, /"\/my-academy"/);
    assert.match(academyPortalRoutes, /"\/academy\/classes\/:classId\/weeks"/);
    const dashboardNavigation = fs.readFileSync(path.join(root, "views", "partials", "dashboard-navigation.ejs"), "utf8");
    assert.match(dashboardNavigation, /hasAcademyMembership/);
    assert.match(dashboardNavigation, /label: "학원"/);

    const mainView = fs.readFileSync(path.join(root, "views", "main.ejs"), "utf8");
    assert.match(mainView, /const displayName = String\(learner\.realName \|\| "학생"\)/);

    const extraStudents = await User.create(
      Array.from({ length: 24 }, (_, index) => ({
        name: `academy-page-student-${index + 1}`,
        realName: `페이지학생${String(index + 1).padStart(2, "0")}`,
        email: `academy-page-student-${index + 1}@example.test`,
        passwordHash: "not-used-in-verification",
        role: "student",
        schoolGrade: 10 + (index % 3),
        school: { region: "경기도", code: `PAGE-HS-${index + 1}`, name: "페이지검증고" },
      }))
    );
    const extraMemberships = await AcademyStudentMembership.create(
      extraStudents.map((extraStudent, index) => ({
        academyId: academy._id,
        studentUserId: extraStudent._id,
        activeStudentKey: String(extraStudent._id),
        status: "APPROVED",
        classId: index % 2 ? academyClass._id : null,
        joinSource: "ADMIN_ASSIGNMENT",
        requestedAt: new Date(Date.now() + index),
        dataConsentAt: new Date(Date.now() + index),
        reviewedAt: new Date(Date.now() + index),
        reviewedByUserId: teacher._id,
        approvedAt: new Date(Date.now() + index),
      }))
    );
    const firstStudentPage = await getAcademyStudentPage({ teacherUserId: teacher._id, page: 1 });
    const secondStudentPage = await getAcademyStudentPage({ teacherUserId: teacher._id, page: 2 });
    assert.equal(firstStudentPage.total, 25);
    assert.equal(firstStudentPage.totalPages, 2);
    assert.equal(firstStudentPage.students.length, 20);
    assert.equal(secondStudentPage.students.length, 5);
    assert.equal(secondStudentPage.page, 2);

    const paginatedPortal = await getAcademyPortalData(teacher._id, { includeStudents: false });
    assert.equal(paginatedPortal.students.length, 0);
    const paginatedStudentHtml = await render("academy", {
      user: teacherUser,
      portal: paginatedPortal,
      studentPage: firstStudentPage,
      statistics: null,
      feedback: null,
      createdInviteId: "",
      activeAcademyPage: "students",
    });
    assert.equal((paginatedStudentHtml.match(/data-student-checkbox/g) || []).length, 20);
    assert.match(paginatedStudentHtml, /\/academy\?tab=students&amp;page=2/);
    assert.match(paginatedStudentHtml, /일괄 작업 선택/);
    assert.match(paginatedStudentHtml, /학원 소속 해제/);

    const bulkIds = extraMemberships.slice(0, 2).map((membership) => membership._id);
    let bulkResult = await bulkManageAcademyStudents({
      teacherUserId: secondTeacher._id,
      membershipIds: bulkIds,
      action: "ASSIGN_CLASS",
      classId: academyClass._id,
    });
    assert.equal(bulkResult.count, 2);
    assert.equal(
      await AcademyStudentMembership.countDocuments({ _id: { $in: bulkIds }, classId: academyClass._id }),
      2
    );
    bulkResult = await bulkManageAcademyStudents({
      teacherUserId: teacher._id,
      membershipIds: bulkIds,
      action: "UNASSIGN_CLASS",
    });
    assert.equal(bulkResult.count, 2);
    assert.equal(
      await AcademyStudentMembership.countDocuments({ _id: { $in: bulkIds }, classId: null }),
      2
    );
    const foreignStudent = await User.create({
      name: "academy-foreign-student",
      realName: "타학원학생",
      email: "academy-foreign-student@example.test",
      passwordHash: "not-used-in-verification",
      role: "student",
      schoolGrade: 11,
    });
    const foreignMembership = await AcademyStudentMembership.create({
      academyId: rejectedAcademy._id,
      studentUserId: foreignStudent._id,
      activeStudentKey: String(foreignStudent._id),
      status: "APPROVED",
      joinSource: "ADMIN_ASSIGNMENT",
      requestedAt: new Date(),
      dataConsentAt: new Date(),
      approvedAt: new Date(),
    });
    await assert.rejects(
      bulkManageAcademyStudents({
        teacherUserId: teacher._id,
        membershipIds: [bulkIds[0], foreignMembership._id],
        action: "UNASSIGN_CLASS",
      }),
      (error) => Number(error.status) === 409 && /현재 학원에서 관리할 수 없는/.test(error.message)
    );
    await assert.rejects(
      bulkManageAcademyStudents({
        teacherUserId: teacher._id,
        membershipIds: [...extraMemberships.slice(0, 21).map((membership) => membership._id)],
        action: "UNASSIGN_CLASS",
      }),
      (error) => Number(error.status) === 400 && /최대 20명/.test(error.message)
    );
    bulkResult = await bulkManageAcademyStudents({
      teacherUserId: teacher._id,
      membershipIds: bulkIds,
      action: "REMOVE",
    });
    assert.equal(bulkResult.count, 2);
    assert.equal(
      await AcademyStudentMembership.countDocuments({ _id: { $in: bulkIds }, status: "LEFT", classId: null }),
      2
    );
    assert.equal((await getAcademyStudentPage({ teacherUserId: teacher._id, page: 2 })).total, 23);

    const lifecycleMembership = extraMemberships[4];
    await assignMembershipClass({
      teacherUserId: teacher._id,
      membershipId: lifecycleMembership._id,
      classId: emptyAcademyClass._id,
    });
    const lifecycleRoster = await getAcademyAttendanceRoster({
      teacherUserId: teacher._id,
      dateKey: "2026-09-07",
      classId: emptyAcademyClass._id,
      now: new Date("2026-09-01T03:00:00.000Z"),
    });
    const lifecycleInvite = await createAcademyInvite({
      teacherUserId: teacher._id,
      label: "보관 검증 초대",
      classId: emptyAcademyClass._id,
      expiryDays: 14,
      maxUses: 10,
    });
    await assert.rejects(
      archiveAcademyClass({
        teacherUserId: secondTeacher._id,
        classId: emptyAcademyClass._id,
        now: new Date("2026-09-01T03:01:00.000Z"),
      }),
      (error) => Number(error.status) === 403 && /원장만/.test(error.message)
    );
    const archivedLifecycle = await archiveAcademyClass({
      teacherUserId: teacher._id,
      classId: emptyAcademyClass._id,
      now: new Date("2026-09-01T03:02:00.000Z"),
    });
    assert.equal(archivedLifecycle.unassignedStudentCount, 1);
    assert.equal(archivedLifecycle.canceledSessionCount, 1);
    assert.equal(archivedLifecycle.revokedInviteCount, 1);
    assert.equal((await AcademyStudentMembership.findById(lifecycleMembership._id).lean()).classId, null);
    const canceledLifecycleSession = await AcademyAttendanceSession.findById(lifecycleRoster.session.id).lean();
    assert.equal(canceledLifecycleSession.status, "CANCELED");
    assert.equal(canceledLifecycleSession.cancellationReason, "CLASS_ARCHIVED");
    assert.equal((await AcademyInvite.findById(lifecycleInvite._id).lean()).status, "REVOKED");
    await assert.rejects(
      updateAdminAcademyInvite({
        adminUserId: admin._id,
        academyId: academy._id,
        inviteId: lifecycleInvite._id,
        action: "RESTORE",
      }),
      (error) => Number(error.status) === 409 && /보관된 반/.test(error.message)
    );
    await assert.rejects(
      getAcademyInvitePresentation(lifecycleInvite.token),
      (error) => Number(error.status) === 410
    );
    const archivedClassRecord = await AcademyClass.findById(emptyAcademyClass._id).lean();
    assert.equal(archivedClassRecord.isActive, false);
    assert.equal(archivedClassRecord.lifecycleHistory.length, 1);
    const archivedForensicsPage = await getAcademyForensicsPageData({
      teacherUserId: teacher._id,
      classId: emptyAcademyClass._id,
    });
    assert.equal(archivedForensicsPage.selectedClass.isActive, false);
    await assert.rejects(
      getAcademyForensicsPageData({
        teacherUserId: secondTeacher._id,
        classId: emptyAcademyClass._id,
      }),
      (error) => Number(error.status) === 403
    );
    await assert.rejects(
      getAcademyClassDetail({ teacherUserId: teacher._id, classId: emptyAcademyClass._id }),
      (error) => Number(error.status) === 404
    );
    await assert.rejects(
      createAcademyClass({ teacherUserId: teacher._id, name: "빈 반 검증" }),
      (error) => Number(error.status) === 409 && /보관된 반/.test(error.message)
    );
    const ownerArchivePortal = await getAcademyPortalData(teacher._id);
    assert.ok(ownerArchivePortal.archivedClasses.some((item) => String(item._id) === String(emptyAcademyClass._id)));
    assert.equal((await getAcademyPortalData(secondTeacher._id)).archivedClasses.length, 0);
    const archivedClassHtml = await render("academy", {
      ...academyLocals,
      portal: ownerArchivePortal,
      activeAcademyPage: "classes",
    });
    assert.match(archivedClassHtml, /보관된 반/);
    assert.match(archivedClassHtml, new RegExp(`/academy/classes/${emptyAcademyClass._id}/restore`));
    await restoreAcademyClass({
      teacherUserId: teacher._id,
      classId: emptyAcademyClass._id,
      now: new Date("2026-09-01T03:03:00.000Z"),
    });
    const restoredClassRecord = await AcademyClass.findById(emptyAcademyClass._id).lean();
    assert.equal(restoredClassRecord.isActive, true);
    assert.equal(restoredClassRecord.lifecycleHistory.length, 2);
    assert.equal((await AcademyStudentMembership.findById(lifecycleMembership._id).lean()).classId, null);
    assert.equal((await AcademyInvite.findById(lifecycleInvite._id).lean()).status, "REVOKED");
    const revivedLifecycleRoster = await getAcademyAttendanceRoster({
      teacherUserId: teacher._id,
      dateKey: "2026-09-07",
      classId: emptyAcademyClass._id,
      now: new Date("2026-09-01T03:04:00.000Z"),
    });
    assert.equal(revivedLifecycleRoster.session.id, lifecycleRoster.session.id);
    assert.equal(revivedLifecycleRoster.session.state, "SCHEDULED");
    assert.equal(revivedLifecycleRoster.roster.length, 0);
    assert.equal((await AcademyAttendanceSession.findById(lifecycleRoster.session.id).lean()).cancellationReason, null);

    assert.ok(Academy.schema.path("profileImageAsset.cloudPublicId"));
    await assert.rejects(
      updateAcademyProfileImage({ teacherUserId: secondTeacher._id, file: null }),
      (error) => Number(error.status) === 403 && /원장 계정만/.test(error.message)
    );
    await assert.rejects(
      updateAcademyProfileImage({ teacherUserId: teacher._id, file: null }),
      (error) => Number(error.status) === 400 && /사진을 선택/.test(error.message)
    );
    await assert.rejects(
      removeAcademyProfileImage({ teacherUserId: teacher._id }),
      (error) => Number(error.status) === 404 && /삭제할 학원 프로필 사진/.test(error.message)
    );
    await assert.rejects(
      updateAcademyProfileImageAsAdmin({ adminUserId: teacher._id, academyId: academy._id, file: null }),
      (error) => Number(error.status) === 403 && /활성 운영자/.test(error.message)
    );
    await assert.rejects(
      updateAcademyProfileImageAsAdmin({ adminUserId: admin._id, academyId: academy._id, file: null }),
      (error) => Number(error.status) === 400 && /사진을 선택/.test(error.message)
    );
    await assert.rejects(
      removeAcademyProfileImageAsAdmin({ adminUserId: admin._id, academyId: academy._id }),
      (error) => Number(error.status) === 404 && /삭제할 학원 프로필 사진/.test(error.message)
    );
    const imageTestDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "matths-academy-image-"));
    const sourceImagePath = path.join(imageTestDirectory, "source.png");
    let preparedAcademyImage = null;
    try {
      await sharp({ create: { width: 900, height: 600, channels: 3, background: "#3157f6" } })
        .png()
        .toFile(sourceImagePath);
      preparedAcademyImage = await createSquareAcademyProfileImageFile({
        path: sourceImagePath,
        mimetype: "image/png",
        originalname: "academy.png",
        contentValidated: true,
      });
      const preparedMetadata = await sharp(preparedAcademyImage.path).metadata();
      assert.equal(preparedMetadata.width, 512);
      assert.equal(preparedMetadata.height, 512);
      assert.equal(preparedMetadata.format, "webp");
    } finally {
      if (preparedAcademyImage?.path) await fs.promises.unlink(preparedAcademyImage.path).catch(() => {});
      await fs.promises.rm(imageTestDirectory, { recursive: true, force: true });
    }

    const settingsHtml = await render("academy", {
      user: teacherUser,
      portal: {
        ...paginatedPortal,
        isOwner: true,
        profileImageSrc: "https://images.example.test/academy.webp",
        academy: {
          ...paginatedPortal.academy,
          profileImageAsset: { cloudPublicId: "matths/academy-profile-images/test" },
        },
      },
      studentPage: null,
      statistics: null,
      feedback: null,
      createdInviteId: "",
      activeAcademyPage: "settings",
    });
    assert.match(settingsHtml, /학원 설정/);
    assert.match(settingsHtml, /action="\/academy\/profile-image"/);
    assert.match(settingsHtml, /기본 이미지로 되돌리기/);

    const academyFeatureRoutes = fs.readFileSync(path.join(root, "routes", "academy-routes.js"), "utf8");
    assert.match(academyFeatureRoutes, /"\/academy\/students\/bulk"/);
    assert.match(academyFeatureRoutes, /"\/academy\/profile-image"/);
    assert.match(academyFeatureRoutes, /"\/academy\/classes\/:classId"/);
    assert.match(academyFeatureRoutes, /"\/academy\/classes\/:classId\/archive"/);
    assert.match(academyFeatureRoutes, /"\/academy\/classes\/:classId\/restore"/);
    assert.match(academyRoutes, /"\/admin\/academies\/:academyId\/profile-image"/);
    assert.match(academyRoutes, /"\/admin\/academies\/:academyId\/classes\/:classId\/operations"/);
    assert.match(academyRoutes, /"\/admin\/academies\/:academyId\/attendance\/:attendanceId"/);
    await assert.rejects(
      approveAcademyStaff({ teacherUserId: secondTeacher._id, staffId: new mongoose.Types.ObjectId() }),
      (error) => Number(error.status) === 403 && /원장 계정만/.test(error.message)
    );

    const secondStaff = await AcademyStaff.findOne({
      academyId: academy._id,
      userId: secondTeacher._id,
      status: "ACTIVE",
    }).lean();
    await addAcademyClassCoTeacher({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      coTeacherUserId: secondTeacher._id,
    });
    await updateAcademyClassSettings({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
      weekdays: [1, 3, 5],
      startTime: "17:30",
      endTime: "19:30",
      effectiveFrom: "2026-08-01",
      attendanceMode: "SELF_CODE",
      opensBeforeMinutes: 10,
      lateAfterMinutes: 5,
      closesAfterMinutes: 30,
    });
    assert.deepEqual((await AcademyClass.findById(academyClass._id).lean()).schedule.weekdays, [1, 3, 5]);
    const futureAttendanceRoster = await getAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-09-04",
      classId: academyClass._id,
      now: new Date("2026-09-01T03:00:00.000Z"),
    });
    assert.equal(futureAttendanceRoster.session.state, "SCHEDULED");
    const futureSessionId = futureAttendanceRoster.session.id;
    const futureCodeVersion = futureAttendanceRoster.session.codeVersion;
    await updateAcademyClassSettings({
      teacherUserId: secondTeacher._id,
      classId: academyClass._id,
      weekdays: [1, 3, 5],
      startTime: "17:30",
      endTime: "19:30",
      effectiveFrom: "2026-08-01",
      attendanceMode: "SELF_CODE",
      opensBeforeMinutes: 10,
      lateAfterMinutes: 5,
      closesAfterMinutes: 30,
    });
    assert.equal((await AcademyAttendanceSession.findById(futureSessionId).lean()).status, "CANCELED");
    const revivedFutureRoster = await getAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-09-04",
      classId: academyClass._id,
      now: new Date("2026-09-01T03:01:00.000Z"),
    });
    assert.equal(revivedFutureRoster.session.id, futureSessionId);
    assert.equal(revivedFutureRoster.session.state, "SCHEDULED");
    assert.equal(revivedFutureRoster.session.codeVersion, futureCodeVersion + 1);
    const closedAttendanceRoster = await getAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-08-31",
      classId: academyClass._id,
      now: new Date("2026-08-31T09:01:00.000Z"),
    });
    assert.equal(closedAttendanceRoster.session.state, "CLOSED");
    assert.ok(closedAttendanceRoster.counts.ABSENT > 0);
    assert.ok(
      await AcademyAttendanceAudit.countDocuments({
        sessionId: closedAttendanceRoster.session.id,
        action: "AUTO_ABSENT",
      }) > 0
    );
    await transferAcademyClassHomeroom({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      nextTeacherUserId: secondTeacher._id,
      keepPreviousAsCoTeacher: true,
    });
    assert.equal(String((await AcademyClass.findById(academyClass._id).lean()).homeroomTeacherUserId), String(secondTeacher._id));
    await transferAcademyClassHomeroom({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      nextTeacherUserId: teacher._id,
      keepPreviousAsCoTeacher: true,
    });
    assert.equal((await AcademyClass.findById(academyClass._id).lean()).teacherHistory.length, 5);
    await removeAcademyClassCoTeacher({
      teacherUserId: teacher._id,
      classId: academyClass._id,
      coTeacherUserId: secondTeacher._id,
    });
    const unassignedTeacherRoster = await getAcademyAttendanceRoster({
      teacherUserId: secondTeacher._id,
      dateKey: "2026-08-31",
    });
    assert.equal(unassignedTeacherRoster.selectedClass, null);
    assert.equal(unassignedTeacherRoster.roster.length, 0);
    assert.equal(unassignedTeacherRoster.counts.TOTAL, 0);
    await assert.rejects(
      saveAcademyAttendanceRoster({
        teacherUserId: secondTeacher._id,
        dateKey: "2026-08-31",
        studentUserIds: [student._id],
        statuses: ["PRESENT"],
        notes: [""],
      }),
      (error) => Number(error.status) === 403 && /담당 반/.test(error.message)
    );
    await assert.rejects(
      getAcademyAttendanceRoster({
        teacherUserId: secondTeacher._id,
        dateKey: "2026-08-31",
        classId: academyClass._id,
      }),
      (error) => Number(error.status) === 403 && /담당하는 선생님/.test(error.message)
    );
    await revokeAcademyStaff({ teacherUserId: teacher._id, staffId: secondStaff._id });
    assert.equal(await getTeacherAcademyContext(secondTeacher._id, { allowMissing: true }), null);
    await requestAcademyStaffJoin({ teacherUserId: secondTeacher._id, academyId: academy._id });
    const cancelledJoin = await cancelAcademyStaffJoin({ teacherUserId: secondTeacher._id });
    assert.equal(cancelledJoin.status, "PENDING");
    assert.equal((await getTeacherAcademySetupData(secondTeacher._id)).pendingRequest, null);

    const previous = await leaveAcademy({ studentUserId: student._id });
    assert.equal(previous.status, "APPROVED");
    const afterLeave = await getStudentAcademyProfile(student._id);
    assert.equal(afterLeave.membership, null);

    console.log("Academy portal verification passed");
  } finally {
    await mongoose.disconnect();
    await memoryServer.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
