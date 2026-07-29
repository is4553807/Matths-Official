const assert =
  require("node:assert/strict");
const path =
  require("node:path");
const dotenv =
  require("dotenv");
const mongoose =
  require("mongoose");
const ejs =
  require("ejs");

dotenv.config({
  path: path.join(
    __dirname,
    "..",
    "config.env"
  ),
  quiet: true,
});

const {
  User,
} = require("../models/matthsModel");
const {
  getAdminUserActivityData,
} = require("../services/adminService");
const {
  formatAdminMath,
} = require("../services/mathTextService");

async function main() {
  await mongoose.connect(
    process.env.DB
  );

  const user =
    await User.findOne()
      .select("_id")
      .sort({
        createdAt: 1,
      })
      .lean();

  if (!user) {
    console.log(
      "검증할 사용자가 없어 DB 활동 기록 검증을 건너뜁니다."
    );
    return;
  }

  const counts = {};

  for (const kind of [
    "learning",
    "problems",
    "quick",
    "assessments",
    "community",
    "moderation",
  ]) {
    const data =
      await getAdminUserActivityData({
        userId:
          String(user._id),
        kind,
        page: 1,
      });

    assert.equal(
      data.kind,
      kind
    );
    assert.ok(
      Array.isArray(data.items)
    );
    assert.ok(
      data.items.length <= 50
    );
    assert.ok(
      data.pagination.total >=
        data.items.length
    );
    const html =
      await ejs.renderFile(
        path.join(
          __dirname,
          "..",
          "views",
          "admin-user-activity.ejs"
        ),
        {
          user: {
            name:
              "검증 관리자",
          },
          activity: data,
          formatAdminMath,
        }
      );
    assert.ok(
      html.includes(
        "전체 활동 기록"
      )
    );
    counts[kind] =
      data.pagination.total;
  }

  console.log(
    "관리자 전체 활동 기록 DB 조회 검증 완료:",
    counts
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
