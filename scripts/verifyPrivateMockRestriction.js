const assert =
  require("node:assert/strict");
const path =
  require("node:path");
const dotenv =
  require("dotenv");
const ejs =
  require("ejs");
const mongoose =
  require("mongoose");

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
  getPrivateMockEligibility,
  getPrivateMockRestrictionData,
} = require("../services/privateMockExamService");
const {
  getNotificationInbox,
} = require("../services/notificationService");

async function main() {
  await mongoose.connect(
    process.env.DB
  );
  const user =
    await User.findOne({
      name:
        "REMOVED_FROM_HISTORY",
    })
      .select(
        "_id name warningCount privateMockRestriction"
      )
      .lean();

  if (!user) {
    console.log(
      "REMOVED_FROM_HISTORY 계정이 없어 실제 제재 화면 검증을 건너뜁니다."
    );
    return;
  }

  const restrictionData =
    await getPrivateMockRestrictionData(
      user._id
    );
  const eligibility =
    await getPrivateMockEligibility(
      user._id
    );
  const inbox =
    await getNotificationInbox({
      userId: user._id,
      page: 1,
    });

  if (
    restrictionData
      .restriction.active
  ) {
    assert.ok(
      Number(
        user.warningCount
      ) >= 1,
      "확정 제재 경고가 사용자 계정에 반영되지 않았습니다."
    );
    assert.equal(
      eligibility.status,
      "integrity-restriction"
    );
    assert.equal(
      eligibility.ctaHref,
      "/account/private-mock-restriction"
    );
    assert.ok(
      restrictionData.restriction
        .remainingWeekCount >= 1 &&
        restrictionData.restriction
          .remainingWeekCount <= 3
    );
  } else {
    assert.notEqual(
      eligibility.status,
      "integrity-restriction"
    );
    assert.equal(
      restrictionData.restriction
        .remainingWeekCount,
      0
    );
  }
  assert.ok(
    inbox.notifications.length <=
      20,
    "알림 우편함 한 페이지에 20개를 초과해 조회되었습니다."
  );

  const html =
    await ejs.renderFile(
      path.join(
        __dirname,
        "..",
        "views",
        "private-mock-restriction.ejs"
      ),
      {
        user:
          restrictionData.user,
        restrictionData,
      }
    );
  for (const copy of [
    "사설 모의고사 이용 상태",
    "내 계정 정보",
    "누적 경고",
    "적용 사유",
  ]) {
    assert.ok(
      html.includes(copy),
      `제재 상세 화면에 ${copy}가 없습니다.`
    );
  }
  assert.ok(
    html.includes(
      restrictionData
        .restriction.active
        ? "수정하거나 관리 조치를 변경할 수 없습니다."
        : "사설 모의고사 이용 제한이 해제되었습니다."
    ),
    "현재 제한 상태에 맞는 상세 안내가 없습니다."
  );

  console.log(
    JSON.stringify(
      {
        user:
          user.name,
        warningCount:
          user.warningCount,
        remainingExamCount:
          restrictionData
            .restriction
            .remainingWeekCount,
        eligibility:
          eligibility.status,
        inboxPageSize:
          inbox.notifications
            .length,
      },
      null,
      2
    )
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
