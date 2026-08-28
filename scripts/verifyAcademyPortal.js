const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const ejs = require("ejs");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
const {
  ConceptProgress,
  LearningEvent,
  ProblemAttempt,
  User,
} = require("../models/matthsModel");
const {
  Academy,
  AcademyStaff,
  AcademyClass,
  AcademyStudentMembership,
  AcademyInvite,
} = require("../models/academyModel");
const {
  approveAcademyStaff,
  approveMembership,
  assignMembershipClass,
  cancelAcademyStaffJoin,
  createAcademyClass,
  createAcademyForTeacher,
  createAcademyInvite,
  getAcademyInvitePresentation,
  getAcademyPortalData,
  getAcademyStudentDetail,
  getStudentAcademyProfile,
  getTeacherAcademyContext,
  getTeacherAcademySetupData,
  leaveAcademy,
  requestAcademyStaffJoin,
  requestAcademyByCode,
  revokeAcademyStaff,
} = require("../services/academyService");
const { getStudentMonthlyStatistics } = require("../services/academyStatisticsService");

const root = path.resolve(__dirname, "..");

async function render(viewName, locals) {
  return ejs.renderFile(path.join(root, "views", `${viewName}.ejs`), locals);
}

async function main() {
  const memoryServer = await MongoMemoryServer.create({ instance: { dbName: "matths-academy-verify" } });
  await mongoose.connect(memoryServer.getUri(), { dbName: "matths-academy-verify" });

  try {
    await Promise.all([
      Academy.syncIndexes(),
      AcademyStaff.syncIndexes(),
      AcademyClass.syncIndexes(),
      AcademyStudentMembership.syncIndexes(),
      AcademyInvite.syncIndexes(),
    ]);

    const [teacher, secondTeacher, student] = await User.create([
      {
        name: "academy-teacher",
        realName: "김선생",
        email: "academy-teacher@example.test",
        passwordHash: "not-used-in-verification",
        role: "teacher",
      },
      {
        name: "academy-second-teacher",
        realName: "박선생",
        email: "academy-second-teacher@example.test",
        passwordHash: "not-used-in-verification",
        role: "teacher",
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
    await assert.rejects(
      requestAcademyStaffJoin({ teacherUserId: student._id, academyId: academy._id }),
      (error) => Number(error.status) === 403 && /교사로 전환/.test(error.message)
    );

    const setupBeforeRequest = await getTeacherAcademySetupData(secondTeacher._id);
    assert.equal(setupBeforeRequest.pendingRequest, null);
    assert.ok(setupBeforeRequest.academies.some((entry) => String(entry._id) === String(academy._id)));
    const setupChoiceHtml = await render("academy-setup", {
      user: secondTeacher,
      feedback: null,
      academyName: "",
      setup: setupBeforeRequest,
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
    const academyLocals = {
      user: teacherUser,
      portal,
      feedback: null,
      createdInviteId: String(invite._id),
    };

    for (const tab of ["dashboard", "students", "requests", "classes", "invites", "teachers"]) {
      const html = await render("academy", { ...academyLocals, activeAcademyPage: tab });
      assert.match(html, /학원 관리/);
      if (tab === "dashboard") {
        assert.match(html, /학원 전체 통계는 준비 단계/);
        assert.match(html, /학생별 이번 달·지난달 통계와 Summary/);
        assert.match(html, /학부모 공유용 Summary/);
        assert.doesNotMatch(html, /72%|187문제|12일/);
      }
      if (tab === "students") assert.match(html, /이학생/);
      if (tab === "classes") assert.match(html, /고1 월수반/);
      if (tab === "invites") assert.match(html, new RegExp(invite.code));
      if (tab === "teachers") {
        assert.match(html, /선생님 관리/);
        assert.match(html, /김선생/);
        assert.match(html, /박선생/);
        assert.match(html, /원장/);
      }
    }

    const detailHtml = await render("academy-student-detail", {
      user: teacherUser,
      detail,
      statistics,
      activeAcademyPage: "students",
    });
    assert.match(detailHtml, /첫 시도 정답률/);
    assert.match(detailHtml, /재도전 성공률/);
    assert.match(detailHtml, /오답 복습률/);
    assert.match(detailHtml, /학부모 공유용 Summary/);
    assert.match(detailHtml, /50%/);
    assert.match(detailHtml, /서로 다른 문제 4개/);
    assert.match(detailHtml, /자동 생성/);
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

    const mainView = fs.readFileSync(path.join(root, "views", "main.ejs"), "utf8");
    assert.match(mainView, /const displayName = String\(learner\.realName \|\| "학생"\)/);
    await assert.rejects(
      approveAcademyStaff({ teacherUserId: secondTeacher._id, staffId: new mongoose.Types.ObjectId() }),
      (error) => Number(error.status) === 403 && /원장 계정만/.test(error.message)
    );

    const secondStaff = await AcademyStaff.findOne({
      academyId: academy._id,
      userId: secondTeacher._id,
      status: "ACTIVE",
    }).lean();
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
