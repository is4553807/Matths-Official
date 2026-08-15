const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { SupportInquiry } = require("../models/matthsModel");
const {
  _testing: supportInquiryTesting,
} = require("../services/supportInquiryService");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function main() {
  assert.ok(SupportInquiry.schema.path("submittedByType"));
  assert.ok(SupportInquiry.schema.path("parentAccountId"));

  assert.deepEqual(
    supportInquiryTesting.parentContactSnapshot(
      { username: "학부모계정", email: " Parent@Example.com " },
      { realName: "김학생", school: { name: "매쓰고등학교" } }
    ),
    {
      nickname: "학부모계정",
      realName: "김학생 학생 학부모",
      email: "parent@example.com",
      schoolName: "매쓰고등학교",
    }
  );

  const rankingService = read("services/rankingService.js");
  const parentDashboard = read("views/parent-dashboard.ejs");
  const parentRoutes = read("routes/parent-routes.js");
  const parentNavigation = read("views/partials/parent-navigation.ejs");
  assert.match(
    rankingService,
    /tier:\s*currentArenaEntry\.arenaRank/
  );
  assert.match(
    parentDashboard,
    /currentArena\?\.arenaRank \|\| currentArena\?\.placementTier/
  );
  assert.match(
    rankingService,
    /placementTier:\s*String\(/
  );
  assert.match(parentRoutes, /"\/parent\/inquiries"/);
  assert.match(parentNavigation, /문의하기/);

  const html = await ejs.renderFile(
    path.join(root, "views", "parent-inquiries.ejs"),
    {
      parent: {
        _id: "64b000000000000000000001",
        username: "학부모계정",
      },
      child: {
        _id: "64b000000000000000000002",
        name: "학생",
        realName: "김학생",
      },
      familyChildren: [
        {
          childId: "64b000000000000000000002",
          child: { name: "학생", realName: "김학생" },
        },
      ],
      selectedChildId: "64b000000000000000000002",
      inquiryData: {
        contactEmail: "parent@example.com",
        inquiries: [
          {
            id: "inquiry-1",
            subject: "결제 확인 문의",
            status: "in_review",
            createdAt: new Date("2026-08-14T00:00:00.000Z"),
            repliedAt: null,
          },
        ],
      },
      feedback: "",
      error: "",
      inquiryRequestId: "5a8ebeb1-0b55-4d70-a200-8a1d58c85b2e",
      oldInput: { subject: "", content: "" },
    }
  );
  assert.match(html, /학부모 가입 이메일/);
  assert.match(html, /parent@example\.com/);
  assert.match(html, /결제·환불 관리/);
  assert.match(html, /문의 접수하기/);
  assert.match(html, /결제 확인 문의/);

  console.log("Parent Arena tier priority, inquiry ownership, reply routing, refund guidance, and UI verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
