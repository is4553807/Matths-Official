const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const { User } = require("../models/matthsModel");
const {
  Academy,
  AcademyStudentMembership,
} = require("../models/academyModel");

const TARGET_ACADEMY_NAME = "테스트 수학학원";
const CONFIRMATION = "ASSIGN_TEST_ACCOUNTS_TO_TEST_ACADEMY";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes(`--confirm=${CONFIRMATION}`);

function testUserFilter() {
  return {
    role: { $in: ["student", "test"] },
    accountStatus: { $ne: "withdrawn" },
    isActive: { $ne: false },
    $or: [
      { isTestAccount: true },
      { role: "test" },
    ],
  };
}

async function findExactTargetAcademy() {
  const matches = await Academy.find({
    nameNormalized: TARGET_ACADEMY_NAME.toLocaleLowerCase("ko-KR"),
    status: "ACTIVE",
  })
    .select("_id name status")
    .lean();
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `이름이 같은 활성 학원이 ${matches.length}개라 대상을 확정할 수 없습니다.`
        : `활성 상태의 '${TARGET_ACADEMY_NAME}'을 찾을 수 없습니다.`
    );
  }
  return matches[0];
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });

  try {
    const academy = await findExactTargetAcademy();
    const users = await User.find(testUserFilter())
      .select("_id name realName role testBatchKey")
      .sort({ testBatchKey: 1, name: 1 })
      .lean();
    if (!users.length) throw new Error("소속 처리할 활성 테스트 계정을 찾을 수 없습니다.");

    const userIds = users.map((user) => user._id);
    const [alreadyAssigned, otherCurrentMemberships] = await Promise.all([
      AcademyStudentMembership.countDocuments({
        academyId: academy._id,
        studentUserId: { $in: userIds },
        status: "APPROVED",
      }),
      AcademyStudentMembership.countDocuments({
        academyId: { $ne: academy._id },
        studentUserId: { $in: userIds },
        status: { $in: ["PENDING", "APPROVED"] },
      }),
    ]);
    const batches = users.reduce((result, user) => {
      const key = String(user.testBatchKey || "UNSPECIFIED");
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    const preview = {
      apply: APPLY,
      database: mongoose.connection.name,
      academy: { id: String(academy._id), name: academy.name },
      targetUsers: users.length,
      alreadyAssigned,
      otherCurrentMemberships,
      batches,
      sample: users.slice(0, 10).map((user) => ({
        name: user.name,
        realName: user.realName || "",
        role: user.role,
        testBatchKey: user.testBatchKey || "",
      })),
    };

    if (!APPLY) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }
    if (!CONFIRMED) {
      throw new Error(`실행하려면 --confirm=${CONFIRMATION}를 함께 지정해야 합니다.`);
    }

    const now = new Date();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await AcademyStudentMembership.updateMany(
          {
            academyId: { $ne: academy._id },
            studentUserId: { $in: userIds },
            status: { $in: ["PENDING", "APPROVED"] },
          },
          {
            $set: { status: "LEFT", classId: null, leftAt: now },
            $unset: { activeStudentKey: 1 },
          },
          { session }
        );

        await AcademyStudentMembership.bulkWrite(
          users.map((user) => ({
            updateOne: {
              filter: { academyId: academy._id, studentUserId: user._id },
              update: {
                $set: {
                  status: "APPROVED",
                  activeStudentKey: String(user._id),
                  joinSource: "ADMIN_ASSIGNMENT",
                  inviteId: null,
                  requestedAt: now,
                  dataConsentAt: now,
                  reviewedAt: now,
                  reviewedByUserId: null,
                  approvedAt: now,
                  rejectedAt: null,
                  leftAt: null,
                },
                $setOnInsert: {
                  academyId: academy._id,
                  studentUserId: user._id,
                  classId: null,
                },
              },
              upsert: true,
            },
          })),
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    const assigned = await AcademyStudentMembership.countDocuments({
      academyId: academy._id,
      studentUserId: { $in: userIds },
      status: "APPROVED",
    });
    console.log(JSON.stringify({ ...preview, assigned, completed: assigned === users.length }, null, 2));
    if (assigned !== users.length) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
