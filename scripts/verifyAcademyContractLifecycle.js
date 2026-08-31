const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

const {
  AdminTodo,
  User,
} = require("../models/matthsModel");
const {
  Academy,
  AcademyAttendanceSession,
  AcademyClass,
  AcademyInvite,
  AcademyStaff,
  AcademyStudentMembership,
} = require("../models/academyModel");
const {
  ensureContractReminder,
  processAcademyContracts,
  synchronizeOwnedAcademyContract,
} = require("../services/academyContractService");
const {
  getActiveAcademyPlan,
} = require("../services/academyPlanService");
const {
  getWeeklyMockExamAccess,
} = require("../services/paidFeatureAccessService");
const {
  synchronizeAccountAccess,
} = require("../services/accountAccessService");
const {
  getAdminAcademyDetail,
  updateAdminAcademyContract,
} = require("../services/adminAcademyService");
const {
  getPricingProductAccess,
} = require("../services/checkoutService");
const {
  assertMockExamPurchaseEligible,
} = require("../services/mockExamPaymentService");

async function main() {
  const memoryServer = await MongoMemoryServer.create({
    instance: { dbName: "matths-academy-contract-verify" },
  });
  await mongoose.connect(memoryServer.getUri(), {
    dbName: "matths-academy-contract-verify",
  });

  try {
    await Promise.all([
      User.syncIndexes(),
      Academy.syncIndexes(),
      AcademyStaff.syncIndexes(),
      AcademyClass.syncIndexes(),
      AcademyStudentMembership.syncIndexes(),
      AcademyInvite.syncIndexes(),
      AcademyAttendanceSession.syncIndexes(),
      AdminTodo.syncIndexes(),
    ]);

    const [admin, owner, student] = await User.create([
      {
        name: "contract-admin",
        realName: "계약운영자",
        email: "contract-admin@example.test",
        passwordHash: "not-used",
        role: "admin",
      },
      {
        name: "contract-owner",
        realName: "계약원장",
        email: "contract-owner@example.test",
        passwordHash: "not-used",
        role: "teacher",
        teacherAccessExpiresAt: new Date("2026-09-10T14:59:59.999Z"),
      },
      {
        name: "contract-student",
        realName: "계약학생",
        email: "contract-student@example.test",
        passwordHash: "not-used",
        role: "student",
        schoolGrade: 10,
      },
    ]);

    const academy = await Academy.create({
      name: "계약 검증 수학학원",
      nameNormalized: "계약 검증 수학학원",
      status: "ACTIVE",
      createdByUserId: owner._id,
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
      contractStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      contractEndsAt: new Date("2026-09-10T14:59:59.999Z"),
      planCode: "ACADEMY_MOCK_INCLUDED",
      includesMockExam: true,
    });
    await AcademyStaff.create({
      academyId: academy._id,
      userId: owner._id,
      role: "OWNER",
      status: "ACTIVE",
      currentStaffKey: String(owner._id),
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const academyClass = await AcademyClass.create({
      academyId: academy._id,
      name: "고1 계약반",
      nameNormalized: "고1 계약반",
      createdByUserId: owner._id,
      homeroomTeacherUserId: owner._id,
    });
    await AcademyStudentMembership.create({
      academyId: academy._id,
      studentUserId: student._id,
      activeStudentKey: String(student._id),
      status: "APPROVED",
      classId: academyClass._id,
      joinSource: "ADMIN_ASSIGNMENT",
      dataConsentAt: new Date("2026-08-02T00:00:00.000Z"),
      approvedAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    const invite = await AcademyInvite.create({
      academyId: academy._id,
      createdByUserId: owner._id,
      classId: academyClass._id,
      token: "contract-lifecycle-invite-token",
      code: "MTH-A2B3C4",
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      status: "ACTIVE",
    });
    const session = await AcademyAttendanceSession.create({
      academyId: academy._id,
      classId: academyClass._id,
      sessionKey: "contract-lifecycle-session",
      dateKey: "2026-09-15",
      startsAt: new Date("2026-09-15T10:00:00.000Z"),
      endsAt: new Date("2026-09-15T12:00:00.000Z"),
      checkInOpensAt: new Date("2026-09-15T09:50:00.000Z"),
      lateAfterAt: new Date("2026-09-15T10:05:00.000Z"),
      checkInClosesAt: new Date("2026-09-15T10:20:00.000Z"),
      attendanceMode: "SELF_CODE",
      rosterStudentUserIds: [student._id],
      createdByUserId: owner._id,
    });

    const beforeExpiry = await getActiveAcademyPlan(student._id, {
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    assert.equal(beforeExpiry.active, true);
    assert.equal(beforeExpiry.includesMockExam, true);
    assert.equal(
      (await synchronizeAccountAccess(owner._id)).user.teacherAccessExpiresAt.toISOString(),
      "2026-09-10T14:59:59.999Z",
      "교사 접근 미들웨어가 계약 만료일을 읽을 수 있어야 합니다."
    );
    const mockAccess = await getWeeklyMockExamAccess(student._id);
    assert.equal(mockAccess.active, true);
    assert.equal(mockAccess.packageType, "ACADEMY_PLAN");
    assert.equal(mockAccess.arenaAllowed, false);
    const pricingAccess = await getPricingProductAccess(
      student._id,
      new Date("2026-09-01T00:00:00.000Z")
    );
    assert.equal(pricingAccess.MOCK_EXAM_ONLY.active, true);
    assert.equal(pricingAccess.MOCK_EXAM_ONLY.purchaseAllowed, false);
    assert.equal(pricingAccess.MOCK_EXAM_ONLY.includedByAcademyPlan, true);
    assert.equal(
      pricingAccess.LEARNING_PACKAGE_29.purchaseAllowed,
      true,
      "학원 플랜과 개인 29일 학습권은 함께 사용할 수 있어야 합니다."
    );
    await assert.rejects(
      () =>
        assertMockExamPurchaseEligible({
          userId: student._id,
          now: new Date("2026-09-01T00:00:00.000Z"),
        }),
      (error) => error?.code === "ACADEMY_PLAN_ALREADY_INCLUDES_MOCK"
    );

    const sentEmails = [];
    const reminderAcademy = await Academy.findById(academy._id).lean();
    const reminder = await ensureContractReminder(
      reminderAcademy,
      new Date("2026-09-01T00:00:00.000Z"),
      {
        sendEmail: async (payload) => {
          sentEmails.push(payload);
          return { messageId: "academy-contract-test" };
        },
      }
    );
    assert.equal(reminder.emailed, true);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, owner.email);
    assert.equal(
      await AdminTodo.countDocuments({
        sourceId: academy._id,
        status: "pending",
      }),
      1
    );

    const expiryResult = await processAcademyContracts({
      now: new Date("2026-09-11T00:00:00.000Z"),
      sendReminders: false,
    });
    assert.equal(expiryResult.archived, 1);
    const archived = await Academy.findById(academy._id).lean();
    assert.equal(archived.status, "ARCHIVED");
    assert.equal(archived.statusBeforeArchive, "ACTIVE");
    assert.equal(archived.archiveReason, "CONTRACT_EXPIRED");
    assert.equal((await AcademyAttendanceSession.findById(session._id).lean()).status, "CANCELED");
    assert.equal(
      (await AcademyAttendanceSession.findById(session._id).lean()).cancellationReason,
      "CONTRACT_EXPIRED"
    );
    assert.equal((await AcademyInvite.findById(invite._id).lean()).status, "REVOKED");
    assert.equal(await AcademyClass.countDocuments({ academyId: academy._id }), 1);
    assert.equal(await AcademyStudentMembership.countDocuments({ academyId: academy._id }), 1);
    assert.equal(
      (await getActiveAcademyPlan(student._id, {
        now: new Date("2026-09-11T00:00:00.000Z"),
      })).active,
      false
    );

    const adminArchive = await getAdminAcademyDetail({
      adminUserId: admin._id,
      academyId: academy._id,
      now: new Date("2026-09-11T00:00:00.000Z"),
    });
    assert.equal(adminArchive.academy.status, "ARCHIVED");
    assert.equal(adminArchive.classes.length, 1);
    assert.equal(adminArchive.memberships.length, 1);

    const renewed = await updateAdminAcademyContract({
      adminUserId: admin._id,
      academyId: academy._id,
      contractEndsAt: "2030-12-31",
    });
    assert.equal(renewed.status, "ACTIVE");
    assert.equal((await User.findById(owner._id).lean()).teacherAccessExpiresAt.toISOString(), "2030-12-31T14:59:59.999Z");
    assert.equal((await getActiveAcademyPlan(student._id)).active, true);
    assert.equal((await AcademyInvite.findById(invite._id).lean()).status, "REVOKED");

    await synchronizeOwnedAcademyContract({
      teacherUserId: owner._id,
      role: "student",
      now: new Date("2027-01-01T00:00:00.000Z"),
    });
    const roleRevokedArchive = await Academy.findById(academy._id).lean();
    assert.equal(roleRevokedArchive.status, "ARCHIVED");
    assert.equal(roleRevokedArchive.archiveReason, "TEACHER_ACCESS_REVOKED");

    console.log(
      "학원 플랜 병행 권한, 14일 사전 알림, 만료 아카이브, 데이터 보존, 관리자 복구 검증 완료"
    );
  } finally {
    await mongoose.disconnect();
    await memoryServer.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
