const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const ejs = require("ejs");
const { MongoMemoryServer } = require("mongodb-memory-server-core");
const { User } = require("../models/matthsModel");
const {
  Academy,
  AcademyStaff,
  AcademyClass,
  AcademyStudentMembership,
  AcademyInvite,
} = require("../models/academyModel");
const {
  approveMembership,
  assignMembershipClass,
  createAcademyClass,
  createAcademyForTeacher,
  createAcademyInvite,
  getAcademyInvitePresentation,
  getAcademyPortalData,
  getAcademyStudentDetail,
  getStudentAcademyProfile,
  leaveAcademy,
  requestAcademyByCode,
} = require("../services/academyService");

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

    const [teacher, student] = await User.create([
      {
        name: "academy-teacher",
        realName: "김선생",
        email: "academy-teacher@example.test",
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

    let portal = await getAcademyPortalData(teacher._id);
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
    const teacherUser = { id: String(teacher._id), name: teacher.name, realName: teacher.realName, role: "teacher" };
    const academyLocals = {
      user: teacherUser,
      portal,
      feedback: null,
      createdInviteId: String(invite._id),
    };

    for (const tab of ["dashboard", "students", "requests", "classes", "invites"]) {
      const html = await render("academy", { ...academyLocals, activeAcademyPage: tab });
      assert.match(html, /학원 관리/);
      if (tab === "dashboard") {
        assert.match(html, /통계 화면 준비 단계/);
        assert.match(html, /학부모 공유용 Summary/);
        assert.doesNotMatch(html, /72%|187문제|12일/);
      }
      if (tab === "students") assert.match(html, /이학생/);
      if (tab === "classes") assert.match(html, /고1 월수반/);
      if (tab === "invites") assert.match(html, new RegExp(invite.code));
    }

    const detailHtml = await render("academy-student-detail", {
      user: teacherUser,
      detail,
      activeAcademyPage: "students",
    });
    assert.match(detailHtml, /첫 시도 정답률/);
    assert.match(detailHtml, /재도전 정답률/);
    assert.match(detailHtml, /오답 복습률/);
    assert.match(detailHtml, /학부모 공유용 Summary/);
    assert.match(detailHtml, /통계 로직은 아직 연결하지 않았습니다/);

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
